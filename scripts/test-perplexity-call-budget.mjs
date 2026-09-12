import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { AI_USAGE_KEY, validatePerplexityPayload, perplexityReservationMicroUsd, requestPerplexity, assertPerplexityBudgetHealthy } from '../services/perplexityRequest.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const payload = { model: 'sonar', messages: [{ role: 'user', content: 'fixture' }], max_tokens: 32, temperature: 0 };
const source = read('api/perplexity.ts').replace(/^import[^\n]+\n/gm, '').replace('export default withSentryApi(handler);', '');
let forwarded;
const context = vm.createContext({
  console, AbortSignal, validatePerplexityPayload, captureApiError: () => {},
  fetch: async (_url, init) => {
    forwarded = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: 'fixture' } }] }), { headers: { 'content-type': 'application/json' } });
  }
});
vm.runInContext(ts.transpileModule(`${source}\nglobalThis.handler = handler`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
await context.handler({ method: 'POST', body: payload, headers: { authorization: 'Bearer fixture-only' } }, { setHeader() {}, status() { return this; }, json() {} });
assert.equal(forwarded.max_tokens, 32, 'proxy must preserve the caller output cap');
assert.equal(forwarded.temperature, 0, 'zero temperature must not become 0.1');

const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const limits = { RUN_MAX_COST_USD: '2', RUN_MAX_REQUESTS: 5 };
const good = (body = payload) => new Response(JSON.stringify({ model: body.model, choices: [{ message: { content: 'fixture' } }], usage: { prompt_tokens: 4, completion_tokens: 1, cost: { total_cost: 0.00501 } } }));
const stats = storage => JSON.parse(storage.getItem(AI_USAGE_KEY)).perplexity.budget;
for (const invalid of [{ ...payload, max_tokens: undefined }, { ...payload, max_tokens: -1 }, { ...payload, max_tokens: 1.5 }, { ...payload, model: 'agent-model' }, { ...payload, stream: true }, { ...payload, tools: [] }, { ...payload, web_search_options: { search_type: 'pro' } }, { ...payload, messages: [{ role: 'user', content: { text: 'fixture' } }] }]) {
  assert.throws(() => validatePerplexityPayload(invalid), /REQUEST_INVALID/);
  forwarded = null;
  let status;
  await context.handler({ method: 'POST', body: invalid, headers: { authorization: 'Bearer fixture' } }, { setHeader() {}, status(value) { status = value; return this; }, json() {} });
  assert.equal(status, 400); assert.equal(forwarded, null);
}
assert.ok(perplexityReservationMicroUsd({ ...payload, model: 'sonar-pro' }) > perplexityReservationMicroUsd(payload));
assert.equal(perplexityReservationMicroUsd(payload), 131072 + 32 + 5000 + 10);
assert.ok(perplexityReservationMicroUsd({ ...payload, web_search_options: { search_context_size: 'high' } }) > perplexityReservationMicroUsd(payload));
assert.deepEqual(validatePerplexityPayload(payload), validatePerplexityPayload(payload));

for (const config of [{}, { ...limits, RUN_MAX_COST_USD: 'NaN' }, { ...limits, RUN_MAX_REQUESTS: 0 }, { ...limits, RUN_MAX_REQUESTS: 0.5 }]) {
  const storage = memory();
  await assert.rejects(requestPerplexity(payload, 'fixture', config, { storage, fetchImpl: () => assert.fail('network before budget') }), /BUDGET_NOT_CONFIGURED/);
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /CIRCUIT_OPEN/, 'a swallowed budget error must still block finalization');
}
await assert.rejects(requestPerplexity(payload, '', limits, { storage: memory(), fetchImpl: () => assert.fail('network before key') }), /REQUEST_KEY_MISSING/);
for (const brokenStorage of [{ getItem() { throw new Error('private-secret'); } }, { getItem: () => '{invalid' }, { getItem: () => null, setItem() { throw new Error('private-secret'); } }]) {
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, { storage: brokenStorage, fetchImpl: () => assert.fail('network before durable reservation') }), /BUDGET_STORAGE_/);
}

for (const httpStatus of [401, 402, 403, 429, 500, 503]) {
  const storage = memory(); let calls = 0;
  const options = { storage, fetchImpl: async () => { calls++; return new Response('private-secret-raw-error', { status: httpStatus }); } };
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, options), new RegExp(`HTTP_${httpStatus}$`));
  await assert.rejects(requestPerplexity({ ...payload, model: 'sonar-pro' }, 'fixture', limits, options), /CIRCUIT_OPEN/);
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /CIRCUIT_OPEN/);
  assert.equal(calls, 1); assert.equal(stats(storage).requestsAttempted, 1);
  assert.ok(!storage.getItem(AI_USAGE_KEY).includes('private-secret'));
}
{
  const storage = memory(); let calls = 0;
  const config = { ...limits, RUN_MAX_REQUESTS: 1 };
  const fetchImpl = async () => { calls++; assert.equal(stats(storage).requestsAttempted, 1); return good(); };
  const results = await Promise.allSettled([requestPerplexity(payload, 'fixture', config, { storage, fetchImpl }), requestPerplexity(payload, 'fixture', config, { storage, fetchImpl })]);
  assert.equal(calls, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal(stats(storage).reportedMicroUsd, 5010);
  await assert.rejects(requestPerplexity(payload, 'fixture', config, { storage, fetchImpl }), /CIRCUIT_OPEN/);
  assert.equal(stats(storage).requestsAttempted, 1, 're-entry/reload must not reset the session budget');
}
{
  const storage = memory(); let calls = 0;
  await assert.rejects(requestPerplexity(payload, 'fixture', { ...limits, RUN_MAX_COST_USD: '0.001' }, { storage, fetchImpl: () => { calls++; } }), /BUDGET_EXHAUSTED/);
  assert.equal(calls, 0);
}
for (const upstream404 of [false, true]) {
  const storage = memory(); const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url); assert.equal(JSON.parse(init.body).max_tokens, 32);
    assert.equal(init.redirect, 'error');
    return urls.length === 1 ? new Response('missing', { status: 404, headers: upstream404 ? { 'X-Perplexity-Upstream-Attempted': 'true' } : {} }) : good();
  };
  if (upstream404) await assert.rejects(requestPerplexity(payload, 'fixture', limits, { storage, fetchImpl }), /HTTP_404/);
  else assert.equal((await (await requestPerplexity(payload, 'fixture', limits, { storage, fetchImpl })).json()).model, 'sonar');
  assert.equal(urls.length, upstream404 ? 1 : 2);
  assert.equal(stats(storage).requestsAttempted, urls.length);
}
{
  const storage = memory(); let calls = 0; let signal;
  const options = { storage, timeoutMs: 5, fetchImpl: async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); } };
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, options), /TRANSPORT_UNCERTAIN_NO_RETRY/);
  assert.equal(signal.aborted, true);
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, options), /CIRCUIT_OPEN/);
  assert.equal(calls, 1); assert.ok(stats(storage).reservedMicroUsd > 0);
}
for (const usage of [{}, { prompt_tokens: 4, completion_tokens: 33, cost: { total_cost: 0.005 } }, { prompt_tokens: 4, completion_tokens: 1, cost: { total_cost: 100 } }]) {
  const storage = memory();
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, { storage, fetchImpl: async () => new Response(JSON.stringify({ model: 'sonar', choices: [{}], usage })) }), /RESPONSE_COST_OR_TOKEN_CONTRACT_INVALID/);
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /CIRCUIT_OPEN/);
}
console.log('PASS Perplexity output caps, full-context cost reservation, session call cap, no retry/failover after failure, redaction; provider requests=0');

// Execute the actual consumers with injected mocks, never production credentials/network.
const guard = await import('../services/perplexityRequest.mjs');
const surface = await import('../services/stage6ExecutionSurfaceContract.mjs');
const telegramContract = await import('../services/telegramDeliveryContract.mjs');
const provider = { GEMINI: 'GEMINI', PERPLEXITY: 'PERPLEXITY' };
const config = { ...limits, MODEL_CHAIN: ['sonar', 'sonar-pro'], STAGE2_MAX_TOKENS: 32, TOP6_MAX_TOKENS: 32,
  AUDIT_MAX_TOKENS: 32, MACRO_MAX_TOKENS: 32, STAGE2_SHARD_SIZE: 4, STAGE2_REPAIR_CHUNK_SIZE: 2 };
const constants = { API_CONFIGS: [{ provider: provider.PERPLEXITY, key: 'fixture' }], PERPLEXITY_CONFIG: config,
  HUGGINGFACE_CONFIG: {}, STRATEGY_CONFIG: {}, GEMINI_MODELS: {} };
let consumerCalls = 0;
let fixtureStorage = memory();
let consumerFetch = async () => { consumerCalls++; return new Response('private-raw-error', { status: 402 }); };
const consumerGuard = { ...guard,
  requestPerplexity: (body, key, c, options = {}) => requestPerplexity(body, key, c, { ...options, storage: fixtureStorage, fetchImpl: consumerFetch }),
  assertPerplexityBudgetHealthy: () => assertPerplexityBudgetHealthy(fixtureStorage)
};
const runtime = vm.createContext({ exports: {}, sessionStorage: fixtureStorage, window: { dispatchEvent() {} },
  console: { log() {}, info() {}, warn() {}, error() {} }, Event, setTimeout, clearTimeout,
  fetch: () => assert.fail('uncontrolled fetch'),
  require: id => {
    if (id.includes('perplexityRequest')) return consumerGuard;
    if (id === '../constants') return constants;
    if (id === '../types') return { ApiProvider: provider };
    if (id === '@google/genai') return { Type: new Proxy({}, { get: (_t, p) => p }), GoogleGenAI: class { constructor() { assert.fail('other provider'); } } };
    if (id.includes('stage6ExecutionSurface')) return surface;
    if (id.includes('telegramDeliveryContract')) return telegramContract;
    if (id.includes('portalIndices')) return { fetchPortalIndices: () => assert.fail('market source request') };
    if (id.includes('deterministicBacktest')) return {};
    assert.fail(`unmocked import ${id}`);
  }
});
vm.runInContext(ts.transpileModule(read('services/intelligenceService.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, runtime);
const candidate = { symbol: 'FIXTURE', name: 'Fixture only', price: 100 };
const synthesis = await runtime.exports.generateAlphaSynthesis([candidate], provider.PERPLEXITY);
assert.ok(synthesis.error, 'failed paid analysis must not return success');
assert.equal(consumerCalls, 1, 'synthesis must not retry or switch models after 402');
await assert.rejects(runtime.exports.generateTop6NeuralOutlook([candidate], provider.PERPLEXITY), /CIRCUIT_OPEN/);
const audit = await runtime.exports.analyzePipelineStatus({ mode: 'SINGLE_STOCK', targetStock: candidate }, provider.PERPLEXITY);
assert.match(audit, /AUDIT_FAILURE.*CIRCUIT_OPEN/);
const pulse = { spy: { symbol: 'SPX', price: 5000 }, qqq: { symbol: 'NDX', price: 20000 }, ixic: { price: 19000 }, vix: { price: 20 } };
await assert.rejects(runtime.exports.generateTelegramBrief([candidate], provider.PERPLEXITY, pulse), /CIRCUIT_OPEN/);
assert.equal(consumerCalls, 1, 'all sibling callers share the latched budget');
assert.ok(!fixtureStorage.getItem(AI_USAGE_KEY).includes('private-raw-error'));

const preliminary = read('components/PreliminaryFilter.tsx');
const ast = ts.createSourceFile('PreliminaryFilter.tsx', preliminary, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callNode;
const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'callPerplexity') callNode = node.initializer; ts.forEachChild(node, visit); };
visit(ast);
assert.ok(callNode);
const stage1Runtime = vm.createContext({ ...constants, ApiProvider: provider, prompt: 'fixture only',
  requestPerplexity: consumerGuard.requestPerplexity, trackUsage() {}, addLog() {}, setActiveAi() {}, setTimeout: fn => fn() });
vm.runInContext(ts.transpile(`globalThis.call = ${callNode.getText(ast)};`, { target: ts.ScriptTarget.ES2022 }), stage1Runtime);
assert.equal(await stage1Runtime.call(), null);
assert.equal(consumerCalls, 1, 'Stage1 cannot bypass the shared stop');
for (const file of ['components/PreliminaryFilter.tsx', 'services/intelligenceService.ts']) {
  assert.doesNotMatch(read(file), /api\.perplexity\.ai|\/api\/perplexity/, `${file} must not bypass shared transport`);
}
const alpha = read('components/AlphaAnalysis.tsx');
assert.match(alpha, /assertPerplexityBudgetHealthy\(\);\s+const stage6FinalFileName =/);
assert.match(alpha, /if \(isPerplexityStopError\(e\)\) throw e;\s+assertPerplexityBudgetHealthy\(\);\s+addLog\(`Brief Gen Failed/);
for (const name of ['PERPLEXITY_RUN_MAX_COST_USD', 'PERPLEXITY_RUN_MAX_REQUESTS']) {
  for (const file of ['constants.ts', 'automate.js', '.github/workflows/schedule.yml']) assert.ok(read(file).includes(name));
}
assert.match(read('.github/workflows/schedule.yml'), /validatePerplexityBudget\(\{/);
assert.match(read('constants.ts'), /RUN_MAX_COST_USD:.*\|\| '0'/);
assert.match(read('constants.ts'), /RUN_MAX_REQUESTS:.*\|\| '0'/);
{
  const storage = memory();
  await requestPerplexity(payload, 'fixture', limits, { storage, fetchImpl: async () => good() });
  await assert.rejects(requestPerplexity(payload, 'fixture', { ...limits, RUN_MAX_REQUESTS: 10 }, { storage, fetchImpl: () => assert.fail('budget change cannot reset') }), /BUDGET_CONFIG_CHANGED/);
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /CIRCUIT_OPEN/);
  const usage = JSON.parse(storage.getItem(AI_USAGE_KEY)); usage.perplexity.budget.requestsAttempted = 100;
  storage.setItem(AI_USAGE_KEY, JSON.stringify(usage));
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /BUDGET_STORAGE_INVALID/);
}
console.log('PASS actual synthesis/Top6/audit/Telegram/Stage1 caller stop propagation, configuration wiring, failed-run finalization rejection; paid calls=0');
{
  const storage = memory(); let calls = 0;
  const options = { storage, fetchImpl: async () => { calls++; return new Response('PERPLEXITY_HTTP_502'); } };
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, options), error => {
    assert.equal(error.message, 'PERPLEXITY_TRANSPORT_UNCERTAIN_NO_RETRY');
    assert.ok(!error.message.includes('private-raw-marker')); return true;
  });
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, options), /CIRCUIT_OPEN/);
  assert.equal(calls, 1);
}
{
  const storage = memory(); let calls = 0; let networkSignal;
  const parent = new AbortController();
  let complete;
  const pending = requestPerplexity(payload, 'fixture', limits, { storage, signal: parent.signal, timeoutMs: 1000,
    fetchImpl: async (_url, init) => { calls++; networkSignal = init.signal; return new Promise(resolve => { complete = resolve; }); } });
  parent.abort();
  assert.equal(networkSignal.aborted, true, 'abort must happen at caller deadline, not at the later internal timeout');
  await assert.rejects(pending, /TRANSPORT_UNCERTAIN_NO_RETRY/);
  assert.equal(networkSignal.aborted, true, 'outer caller deadline must abort paid transport');
  const reserved = stats(storage).reservedMicroUsd;
  complete(good()); await new Promise(resolve => setTimeout(resolve, 0));
  assert.throws(() => assertPerplexityBudgetHealthy(storage), /CIRCUIT_OPEN/);
  assert.equal(stats(storage).reservedMicroUsd, reserved, 'late completion cannot refund an uncertain request');
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, { storage, fetchImpl: () => { calls++; assert.fail('request after caller timeout'); } }), /CIRCUIT_OPEN/);
  assert.equal(calls, 1);
  await assert.rejects(requestPerplexity(payload, 'fixture', limits, { storage: memory(), signal: parent.signal, fetchImpl: () => assert.fail('request after aborted parent') }), /TRANSPORT_UNCERTAIN/);
}
for (const [name, input] of [['PERPLEXITY_RUN_MAX_COST_USD', 'perplexity_max_cost_usd'], ['PERPLEXITY_RUN_MAX_REQUESTS', 'perplexity_max_requests']]) {
  const expression = read('.github/workflows/schedule.yml').match(new RegExp(`${name}: \\$\\{\\{ (.*) \\}\\}`))[1];
  for (const manual of ['', undefined, '0', '2']) {
    const value = vm.runInNewContext(expression, { github: { event_name: 'workflow_dispatch' }, inputs: { [input]: manual }, vars: { [name]: '50' } });
    assert.equal(value, manual || '0', 'manual blank/default must not inherit recurring budget');
  }
  assert.equal(vm.runInNewContext(expression, { github: { event_name: 'schedule' }, inputs: {}, vars: { [name]: '3' } }), '3');
}
console.log('PASS hostile response redaction, outer abort/late completion, manual-vs-recurring budget isolation');

{
  const workflow = read('.github/workflows/schedule.yml');
  assert.match(workflow, /delivery_proof_only:\n\s+description:.*\n\s+required: false\n\s+default: false\n\s+type: boolean/);
  const condition = workflow.match(/name: 7F\.2 Dispatch \| Sidecar dry-run repository_dispatch\n\s+if: (.+)/)[1];
  for (const event of ['workflow_dispatch', 'schedule', 'repository_dispatch']) {
    for (const proofOnly of [undefined, false, true]) {
      for (const succeeded of [false, true]) {
        for (const allowed of ['false', 'true']) {
          const actual = vm.runInNewContext(condition, {
            success: () => succeeded, github: { event_name: event },
            inputs: { delivery_proof_only: proofOnly },
            steps: { stage6_dispatch_meta: { outputs: { sidecar_dispatch_allowed: allowed } } }
          });
          assert.equal(actual, succeeded && allowed === 'true' && !(event === 'workflow_dispatch' && proofOnly === true));
        }
      }
    }
  }
  assert.equal((workflow.match(/name: 7F\.2 Dispatch \| Sidecar dry-run repository_dispatch/g) || []).length, 1);
  console.log('PASS manual delivery proof suppresses sidecar step and its fallback without changing recurring dispatch');
}

{
  fixtureStorage = memory(); runtime.sessionStorage = fixtureStorage;
  let signal; let finish;
  consumerFetch = async (_url, init) => { signal = init.signal; return new Promise(resolve => { finish = resolve; }); };
  const parent = new AbortController();
  const brief = runtime.exports.generateTelegramBrief([candidate], provider.PERPLEXITY, pulse, undefined, parent.signal);
  parent.abort();
  assert.equal(signal.aborted, true, 'actual Telegram generator must propagate its caller cancellation');
  await assert.rejects(brief, /TRANSPORT_UNCERTAIN_NO_RETRY/);
  finish(good());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.throws(() => assertPerplexityBudgetHealthy(fixtureStorage), /CIRCUIT_OPEN/);
  assert.equal((alpha.match(/telegramContext, briefAbort.signal/g) || []).length, 2);
  assert.equal((alpha.match(/briefAbort.abort\(\)/g) || []).length, 2);
  assert.equal((alpha.match(/clearTimeout\(briefTimer\)/g) || []).length, 2);
}

// The real formatter must preserve finalized reasons on every surface; all I/O is mocked.
{
  fixtureStorage = memory();
  runtime.sessionStorage = fixtureStorage;
  consumerFetch = async () => good();
  const rows = JSON.parse(read('docs/fixtures/telegram_decision_reason_contract.fixture.json')).cases
    .slice(0, 4).map((row, index) => ({ ...row, symbol: `REASONFIXTURE${index}`,
      price: 100, entryExecPrice: 100, targetPrice: 120, stopLoss: 90,
      executionBucket: row.finalDecision === 'EXECUTABLE_NOW' ? 'EXECUTABLE' : 'WATCHLIST' }));
  const contractContext = { modelTop6: rows,
    executablePicks: rows.filter(row => row.finalDecision === 'EXECUTABLE_NOW'),
    watchlistTop: rows.filter(row => row.finalDecision !== 'EXECUTABLE_NOW') };
  const before = JSON.stringify(contractContext);
  const output = await runtime.exports.generateTelegramBrief(rows, provider.PERPLEXITY, pulse, contractContext);
  const modelText = output.split('Top6 (Model Rank)')[1]?.split('✅ Executable Picks')[0] || '';
  const executableText = output.split('✅ Executable Picks')[1]?.split('⏳ Watchlist')[0] || '';
  const watchText = output.split('⏳ Watchlist')[1] || '';
  for (const row of rows) {
    assert.ok(modelText.includes(row.expectedLabelKo), 'Top6 lost final reason');
    assert.ok((row.finalDecision === 'EXECUTABLE_NOW' ? executableText : watchText)
      .includes(row.expectedLabelKo), 'destination surface lost final reason');
  }
  assert.ok(watchText.includes('모델평결='));
  assert.ok(watchText.includes('판정=가격 대기/'));
  assert.equal(JSON.stringify(contractContext), before, 'display changes must not change canonical decisions');
  assert.doesNotMatch(output, /사유 없음/);
  console.log('PASS mocked real formatter: final reasons, surface semantics, canonical invariance; provider requests=0');
}
