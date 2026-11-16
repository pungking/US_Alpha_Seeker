import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDashboardAi } from '../services/dashboardAiServer.mjs';
import { dashboardAiStatus, dashboardAiRequest } from '../services/dashboardAiClient.mjs';
import { requestPerplexity, AI_USAGE_KEY } from '../services/perplexityRequest.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

globalThis.fetch = () => assert.fail('unmocked external network forbidden');

const env = { DASHBOARD_AI_OWNER_EMAIL: 'owner@example.invalid', GEMINI_API_KEY: 'synthetic-gemini',
  PERPLEXITY_API_KEY: 'synthetic-perplexity', PERPLEXITY_RUN_MAX_COST_USD: '5', PERPLEXITY_RUN_MAX_REQUESTS: '20' };
const request = (body, extra = {}) => ({ method: body ? 'POST' : 'GET',
  headers: { authorization: 'Bearer synthetic-drive', origin: 'https://us-alpha-seeker.vercel.app' }, body, ...extra });
const gemini = { provider: 'gemini', payload: { model: 'gemini-2.5-flash', contents: 'synthetic prompt' } };
function fixture(email = env.DASHBOARD_AI_OWNER_EMAIL) {
  const calls = [];
  return { calls, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    assert.equal(url, 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
    return new Response(JSON.stringify({ user: { emailAddress: email } }));
  }, generate: async (key, payload) => {
    calls.push({ key, payload });
    return { text: 'synthetic result', usageMetadata: { totalTokenCount: 7 } };
  } };
}
test('status authenticates owner without generating or returning credentials', async () => {
  const io = fixture();
  const result = await handleDashboardAi(request(), env, io);
  assert.equal(result.status, 200);
  assert.equal(result.body.gemini, true);
  assert.equal(result.body.perplexity, true);
  assert.equal(io.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes('synthetic-'));
  assert.equal(result.body.providerVerified, false);
});
test('authorized Gemini returns only text and usage', async () => {
  const io = fixture();
  const result = await handleDashboardAi(request(gemini), env, io);
  assert.equal(result.status, 200);
  assert.equal(result.body.text, 'synthetic result');
  assert.equal(io.calls.length, 2);
  assert.equal(io.calls[1].key, env.GEMINI_API_KEY);
});
for (const [name, req, config, email, status] of [
  ['missing token', request(undefined, { headers: {} }), env, undefined, 401],
  ['wrong owner', request(), env, 'other@example.invalid', 403],
  ['missing owner configuration', request(), { ...env, DASHBOARD_AI_OWNER_EMAIL: '' }, undefined, 503],
  ['foreign origin', request(gemini, { headers: { authorization: 'Bearer token', origin: 'https://evil.invalid' } }), env, undefined, 403],
  ['missing origin', request(gemini, { headers: { authorization: 'Bearer token' } }), env, undefined, 403],
  ['unsupported method', request(undefined, { method: 'DELETE' }), env, undefined, 405],
  ['unknown provider', request({ ...gemini, provider: 'agent' }), env, undefined, 400],
  ['unknown model', request({ ...gemini, payload: { ...gemini.payload, model: 'unapproved' } }), env, undefined, 400],
  ['tools forbidden', request({ ...gemini, payload: { ...gemini.payload, config: { tools: [{}] } } }), env, undefined, 400],
  ['remote contents forbidden', request({ ...gemini, payload: { ...gemini.payload, contents: { fileUri: 'https://evil.invalid' } } }), env, undefined, 400],
  ['oversized prompt', request({ ...gemini, payload: { ...gemini.payload, contents: 'x'.repeat(1048577) } }), env, undefined, 413],
  ['missing Gemini key', request(gemini), { ...env, GEMINI_API_KEY: '' }, undefined, 503],
  ['invalid JSON', request('{invalid'), env, undefined, 400],
  ['caller-supplied key', request({ ...gemini, apiKey: 'injected' }), env, undefined, 400],
  ['malformed authorization', request(undefined, { headers: { authorization: 'Bearer bad\r\nheader' } }), env, undefined, 401]
]) test(name, async () => {
  const io = fixture(email);
  const result = await handleDashboardAi(req, config, io);
  assert.equal(result.status, status);
  assert.ok(io.calls.every(call => !call.key));
});
test('upstream error is sanitized and never retried', async () => {
  const io = fixture(); let attempts = 0;
  io.generate = async () => { attempts++; throw new Error('synthetic-gemini Bearer synthetic-drive'); };
  const result = await handleDashboardAi(request(gemini), env, io);
  assert.equal(result.status, 502);
  assert.equal(attempts, 1);
  assert.ok(!JSON.stringify(result).includes('synthetic-'));
});
test('paid access remains disabled without operator budget', async () => {
  const result = await handleDashboardAi(request(), { ...env, PERPLEXITY_RUN_MAX_COST_USD: '0' }, fixture());
  assert.equal(result.body.perplexity, false);
});
test('failed identity lookup never reaches either provider', async () => {
  const io = fixture();
  io.fetchImpl = async () => new Response('synthetic private error', { status: 401 });
  const result = await handleDashboardAi(request(gemini), env, io);
  assert.equal(result.status, 401);
  assert.equal(io.calls.length, 0);
  assert.ok(!JSON.stringify(result).includes('synthetic'));
});

const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
const paid = { model: 'sonar', messages: [{ role: 'user', content: 'synthetic' }], max_tokens: 32 };
const paidResult = { model: 'sonar', choices: [{ message: { content: 'synthetic' } }],
  usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6, cost: { total_cost: 0.00501 } } };
test('server selects only its own Perplexity key and fixed endpoint', async () => {
  const io = fixture();
  const authFetch = io.fetchImpl;
  io.fetchImpl = async (url, init) => {
    if (url.includes('googleapis.com')) return authFetch(url, init);
    assert.equal(url, 'https://api.perplexity.ai/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-perplexity');
    assert.equal(init.redirect, 'error');
    assert.equal(JSON.parse(init.body).stream, false);
    return new Response(JSON.stringify(paidResult));
  };
  const result = await handleDashboardAi(request({ provider: 'perplexity', payload: paid }), env, io);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.usage, paidResult.usage);
});
for (const [name, payload, config] of [
  ['Agent payload', { ...paid, tools: [{}] }, env],
  ['Agent model', { ...paid, model: 'agent' }, env],
  ['unbounded output', { ...paid, max_tokens: 3201 }, env],
  ['insufficient reservation', paid, { ...env, PERPLEXITY_RUN_MAX_COST_USD: '0.001' }]
]) test(`server rejects ${name} before paid request`, async () => {
  const result = await handleDashboardAi(request({ provider: 'perplexity', payload }), config, fixture());
  assert.equal(result.status, 400);
});
test('status cache is credential-free, deduplicated and revoked on token rotation/logout', async () => {
  const storage = memory(); let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls++;
    assert.equal(init.headers.Authorization, `Bearer ${storage.getItem('gdrive_access_token')}`);
    return new Response(JSON.stringify({ gemini: true, perplexity: true, budget: {} }));
  };
  assert.equal((await dashboardAiStatus({ storage, fetchImpl })).gemini, false);
  assert.equal(calls, 0);
  storage.setItem('gdrive_access_token', 'first');
  assert.equal((await dashboardAiStatus({ storage, fetchImpl })).gemini, true);
  await dashboardAiStatus({ storage, fetchImpl });
  assert.equal(calls, 1);
  storage.setItem('gdrive_access_token', 'second');
  await dashboardAiStatus({ storage, fetchImpl });
  assert.equal(calls, 2);
  storage.setItem('gdrive_access_token', '');
  assert.equal((await dashboardAiStatus({ storage, fetchImpl })).gemini, false);
});
test('late status response cannot authenticate a logged-out browser', async () => {
  const storage = memory(); storage.setItem('gdrive_access_token', 'pending');
  let finish;
  const fetchImpl = () => new Promise(resolve => { finish = resolve; });
  const first = dashboardAiStatus({ storage, fetchImpl });
  const second = dashboardAiStatus({ storage, fetchImpl });
  storage.setItem('gdrive_access_token', '');
  finish(new Response(JSON.stringify({ gemini: true })));
  assert.equal((await first).gemini, false);
  assert.equal((await second).gemini, false);
});
test('manual paid transport reserves before POST and never falls back to public vendor route', async () => {
  const storage = memory(); storage.setItem('gdrive_access_token', 'synthetic-drive');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    assert.equal(url, '/api/dashboard_ai');
    if (!init.method) return new Response(JSON.stringify({ perplexity: true, budget: { RUN_MAX_COST_USD: '5', RUN_MAX_REQUESTS: '20' } }));
    assert.equal(JSON.parse(storage.getItem(AI_USAGE_KEY)).perplexity.budget.requestsAttempted, 1);
    assert.equal(init.headers.Authorization, 'Bearer synthetic-drive');
    assert.equal(JSON.parse(init.body).provider, 'perplexity');
    return new Response('synthetic private provider error', { status: 404 });
  };
  await assert.rejects(requestPerplexity(paid, '', {}, { storage, fetchImpl }), /PERPLEXITY_HTTP_404/);
  await assert.rejects(requestPerplexity(paid, '', {}, { storage, fetchImpl }), /CIRCUIT_OPEN/);
  assert.equal(calls.length, 2, 'one status GET and one generation POST only');
  assert.ok(!storage.getItem(AI_USAGE_KEY).includes('private'));
});
test('manual paid transport accepts a validated success and records cost', async () => {
  const storage = memory(); storage.setItem('gdrive_access_token', 'synthetic-drive');
  const fetchImpl = async (_url, init) => !init.method
    ? new Response(JSON.stringify({ perplexity: true, budget: { RUN_MAX_COST_USD: '5', RUN_MAX_REQUESTS: '20' } }))
    : new Response(JSON.stringify(paidResult));
  const response = await requestPerplexity(paid, undefined, {}, { storage, fetchImpl });
  assert.equal((await response.json()).choices[0].message.content, 'synthetic');
  assert.equal(JSON.parse(storage.getItem(AI_USAGE_KEY)).perplexity.budget.reportedMicroUsd, 5010);
});
test('Gemini browser transport has no provider key, no direct fallback and no retries', async () => {
  const originalFetch = globalThis.fetch;
  const storage = memory(); storage.setItem('gdrive_access_token', 'synthetic-drive');
  globalThis.sessionStorage = storage;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++; assert.equal(url, '/api/dashboard_ai');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-drive');
    assert.deepEqual(JSON.parse(init.body), gemini);
    return new Response('secret-raw-message', { status: 502 });
  };
  try {
    await assert.rejects(dashboardAiRequest('gemini', gemini.payload), error => {
      assert.equal(error.noRetry, true);
      assert.ok(!error.message.includes('secret-raw-message')); return true;
    });
    assert.equal(calls, 1);
    storage.setItem('gdrive_access_token', '');
    await assert.rejects(dashboardAiRequest('gemini', gemini.payload), /DRIVE_LOGIN_REQUIRED/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; delete globalThis.sessionStorage; }
});
test('runtime-injected headless execution never probes the manual server route', async () => {
  globalThis.__ALPHA_RUNTIME_ENV__ = { GEMINI_API_KEY: 'synthetic' };
  const storage = memory(); storage.setItem('gdrive_access_token', 'synthetic-drive');
  try {
    assert.equal((await dashboardAiStatus({ storage, fetchImpl: () => assert.fail('headless server probe') })).gemini, false);
  } finally { delete globalThis.__ALPHA_RUNTIME_ENV__; }
});
test('actual keyless Gemini synthesis cannot race its transport into a second model POST', async () => {
  const surface = await import('../services/stage6ExecutionSurfaceContract.mjs');
  const telegram = await import('../services/telegramDeliveryContract.mjs');
  const timers = []; let calls = 0; let finish;
  const storage = memory();
  const constants = { API_CONFIGS: [], HUGGINGFACE_CONFIG: {}, STRATEGY_CONFIG: {}, PERPLEXITY_CONFIG: { MODEL_CHAIN: ['sonar', 'sonar-pro'] },
    GEMINI_MODELS: { CHAIN: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'] } };
  const runtime = vm.createContext({ exports: {}, sessionStorage: storage, window: { dispatchEvent() {} }, Event,
    console: { log() {}, warn() {}, error() {}, info() {} },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    require: id => {
      if (id === '../constants') return constants;
      if (id === '../types') return { ApiProvider: { GEMINI: 'GEMINI', PERPLEXITY: 'PERPLEXITY' } };
      if (id === '@google/genai') return { Type: new Proxy({}, { get: (_t, p) => p }) };
      if (id.includes('geminiClient')) return { createGeminiClient: () => ({ models: { generateContent: () => {
        calls++; return new Promise((_resolve, reject) => { finish = () => reject(Object.assign(new Error('DASHBOARD_AI_REQUEST_FAILED_NO_RETRY'), { noRetry: true })); });
      } } }) };
      if (id.includes('dashboardAiClient')) return { hasAiAccess: async () => true };
      if (id.includes('perplexityRequest')) return { isPerplexityStopError: () => false };
      if (id.includes('stage6ExecutionSurface')) return surface;
      if (id.includes('telegramDeliveryContract')) return telegram;
      if (id.includes('portalIndices') || id.includes('deterministicBacktest')) return {};
      assert.fail(`unmocked import ${id}`);
    }
  });
  const source = fs.readFileSync(new URL('../services/intelligenceService.ts', import.meta.url), 'utf8');
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, runtime);
  const pending = runtime.exports.generateAlphaSynthesis([{ symbol: 'FIXTURE', price: 100, name: 'Synthetic' }], 'GEMINI');
  for (let i = 0; i < 100 && calls === 0; i++) await Promise.resolve();
  assert.equal(calls, 1);
  for (const timer of timers.filter(timer => timer.ms <= 20000)) timer.fn();
  for (let i = 0; i < 100; i++) await Promise.resolve();
  assert.equal(calls, 1, 'caller deadline must not start a second model while first request remains active');
  finish();
  const result = await pending;
  assert.ok(result.error, 'uncertain server outcome must not be reported as a successful synthesis');
  assert.equal(calls, 1);
});
