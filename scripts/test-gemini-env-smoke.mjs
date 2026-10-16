import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./gemini-env-smoke.mjs', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/main\(\);\s*$/, 'globalThis.run = main;');
const good = text => ({ text, candidates: [{ finishReason: 'STOP' }] });
const apiError = code => Error(JSON.stringify({ error: { code, status: code === 404 ? 'NOT_FOUND' : 'ERROR', message: 'fixture error' } }));
async function run(responses, env = {}) {
  const reports = [], logs = []; let requests = 0, clients = 0, exitCode = 0;
  const context = vm.createContext({
    process: { env: { GEMINI_API_KEY: 'fixture-only', API_KEY: 'fixture-only', ...env }, exit: code => { exitCode = code; throw Error('fixture-exit'); } },
    existsSync: () => false, mkdirSync: () => {}, dirname: () => 'fixture',
    readFileSync: () => assert.fail('must not read real env files'),
    writeFileSync: (_p, data) => reports.push(JSON.parse(data)),
    console: Object.fromEntries(['log', 'warn', 'error'].map(k => [k, value => logs.push(value)])),
    GoogleGenAI: class {
      constructor() { clients++; }
      models = { generateContent: async () => {
        requests++; const r = responses[Math.min(requests - 1, responses.length - 1)];
        if (r instanceof Error) throw r;
        return r;
      } };
    }
  });
  vm.runInContext(source, context);
  try { await context.run(); } catch (e) { if (e.message !== 'fixture-exit') throw e; }
  return { report: reports.at(-1), logs, requests, clients, exitCode };
}

for (const text of ['OK.', 'OK', 'Okay', 'Response received.']) {
  const result = await run([good(text)]);
  assert.equal(result.report.overall, 'pass', 'normal model prose must not become an auth/transport failure');
  assert.equal(result.requests, 1); assert.equal(result.exitCode, 0);
  assert.equal(result.report.responseContract, 'COMPLETED_NONEMPTY_TEXT');
  assert.ok(!JSON.stringify(result).includes('Response received.'));
}
for (const response of [good(''), good('  '), {}, { text: 'OK' },
  { ...good('OK'), promptFeedback: { blockReason: 'SAFETY' } },
  { text: 'OK', candidates: [{ finishReason: 'SAFETY' }] },
  { text: 'OK', candidates: [{ finishReason: 'MAX_TOKENS' }] }]) {
  const result = await run([response]);
  assert.equal(result.report.overall, 'fail'); assert.equal(result.exitCode, 1);
  assert.equal(result.report.reason, 'response_contract_invalid');
}
for (const code of [401, 403]) {
  const r = await run([apiError(code)]);
  assert.equal(r.report.reason, 'credential_api_error'); assert.equal(r.requests, 1);
}
assert.equal((await run([apiError(404), good('OK.')])).report.overall, 'pass');
for (const code of [429, 503]) assert.equal((await run([apiError(code)])).report.overall, 'warn');
assert.equal((await run([apiError(503)], { GEMINI_SMOKE_STRICT_API: 'true' })).exitCode, 1);
assert.equal((await run([apiError(404)])).report.overall, 'fail');
for (const env of [{ GEMINI_API_KEY: '', API_KEY: '' }, { API_KEY: 'different-fixture' }]) {
  const r = await run([], env); assert.equal(r.requests, 0); assert.equal(r.clients, 0); assert.equal(r.exitCode, 1);
}
console.log('PASS Gemini capability vs exact prose, blocked/empty response, credentials and transient regression; provider requests=0');
