import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardAiStatus, explainAiAccess } from '../services/dashboardAiClient.mjs';
import { handleDashboardAi } from '../services/dashboardAiServer.mjs';
import { describeDashboardProvider } from '../services/dashboardApiStatus.mjs';
import { requestPerplexity, AI_USAGE_KEY } from '../services/perplexityRequest.mjs';

globalThis.fetch = () => assert.fail('unmocked external network forbidden');
const storage = () => ({ getItem: name => name === 'gdrive_access_token' ? 'synthetic-drive' : null });
for (const [http, code] of [[401, 'DRIVE_LOGIN_REQUIRED'], [403, 'OWNER_DENIED'], [503, 'OWNER_NOT_CONFIGURED']]) {
  test(`HTTP ${http} retains safe auth/config reason, not missing vendor key`, async () => {
    const result = await dashboardAiStatus({ storage: storage(), fetchImpl: async () => new Response(JSON.stringify({ error: `DASHBOARD_AI_${code}` }), { status: http }) });
    assert.equal(result.reason, `DASHBOARD_AI_${code}`);
    assert.equal(result.httpStatus, http);
    assert.equal(result.gemini, false);
  });
}
test('wrong deployment 404 and uncertain transport have distinct diagnostics', async () => {
  const missing = await dashboardAiStatus({ storage: storage(), fetchImpl: async () => new Response('not found', { status: 404 }) });
  assert.equal(missing.reason, 'DASHBOARD_AI_ROUTE_MISSING');
  assert.equal(missing.httpSource, 'deployment route');
  assert.equal(describeDashboardProvider('Google Gemini', { server: missing }).httpSource, 'deployment route');
  const failed = await dashboardAiStatus({ storage: storage(), fetchImpl: async () => { throw new Error('private credential'); } });
  assert.equal(failed.reason, 'DASHBOARD_AI_NETWORK_ERROR');
  assert.ok(!JSON.stringify(failed).includes('private'));
});
for (const [http, code] of [[401, 'DRIVE_LOGIN_REQUIRED'], [403, 'OWNER_DENIED'], [404, 'ROUTE_MISSING']]) {
  test(`Sonar preflight HTTP ${http} retains cause without reserving or sending`, async () => {
    const values = new Map([['gdrive_access_token', 'synthetic-drive']]);
    const store = { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
    let gets = 0;
    await assert.rejects(requestPerplexity({ model: 'sonar', messages: [{ role: 'user', content: 'OK' }], max_tokens: 16 }, null, {}, {
      storage: store, fetchImpl: async (_url, options) => {
        assert.notEqual(options.method, 'POST'); gets++;
        return new Response(JSON.stringify({ error: `DASHBOARD_AI_${code}` }), { status: http });
      }
    }), error => error.reason === `DASHBOARD_AI_${code}` && error.httpStatus === http &&
      error.httpSource === (http === 404 ? 'deployment route' : 'owner authentication'));
    assert.equal(gets, 1); assert.equal(values.has(AI_USAGE_KEY), false);
  });
}
test('direct Sonar fallback identifies provider HTTP, not gateway HTTP', async () => {
  const values = new Map();
  const store = { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value) };
  const seen = [];
  const result = await requestPerplexity({ model: 'sonar', messages: [{ role: 'user', content: 'OK' }], max_tokens: 16 }, 'synthetic-only',
    { RUN_MAX_COST_USD: '5', RUN_MAX_REQUESTS: '20' }, { storage: store, fetchImpl: async url => {
      seen.push(url);
      return url === '/api/perplexity' ? new Response('', { status: 404 }) : new Response(JSON.stringify({ model: 'sonar',
        choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 4, completion_tokens: 1, cost: { total_cost: 0.00501 } } }));
    } });
  assert.deepEqual(seen, ['/api/perplexity', 'https://api.perplexity.ai/chat/completions']);
  assert.equal(result.status, 200); assert.equal(result.httpSource, 'AI provider');
});
test('partial HTTP 200 configuration is rejected, not reported as missing keys', async () => {
  const result = await dashboardAiStatus({ storage: storage(), fetchImpl: async () => new Response(JSON.stringify({ perplexity: true, private: 'never-display' })) });
  assert.equal(result.reason, 'DASHBOARD_AI_RESPONSE_INVALID'); assert.equal(result.httpStatus, 200);
  assert.ok(!JSON.stringify(result).includes('never-display'));
});
test('no Drive login reports login required without any network', async () => {
  const result = await dashboardAiStatus({ storage: { getItem: () => null }, fetchImpl: () => assert.fail('network without token') });
  assert.equal(result.reason, 'DASHBOARD_AI_DRIVE_LOGIN_REQUIRED');
  assert.equal(await explainAiAccess('Google Gemini'), 'DASHBOARD_AI_DRIVE_LOGIN_REQUIRED');
});
const env = { DASHBOARD_AI_OWNER_EMAIL: 'owner@example.invalid', GEMINI_API_KEY: 'synthetic-gemini',
  PERPLEXITY_API_KEY: 'synthetic-perplexity', FINNHUB_KEY: 'synthetic-feed', PERPLEXITY_RUN_MAX_COST_USD: '5', PERPLEXITY_RUN_MAX_REQUESTS: '20' };
const req = payload => ({ method: payload ? 'POST' : 'GET', headers: { authorization: 'Bearer synthetic-drive', origin: 'https://us-alpha-seeker.vercel.app' }, body: payload });
const io = () => ({ fetchImpl: async () => new Response(JSON.stringify({ user: { emailAddress: env.DASHBOARD_AI_OWNER_EMAIL } })), generate: async () => ({ text: 'OK' }) });
test('all existing provider cards receive booleans, never credential values', async () => {
  const result = await handleDashboardAi(req(), env, io());
  assert.equal(result.body.providers['Finnhub'], true);
  assert.equal(result.body.providers['RapidAPI'], false);
  assert.equal(result.body.providers['Google Gemini'], true);
  assert.equal(Object.keys(result.body.providers).length, 9);
  assert.equal(result.body.authenticated, true);
  assert.ok(!JSON.stringify(result.body).includes('synthetic-'));
});
test('Gemini honors the explicit 16-token connection probe bound', async () => {
  const deps = io(); let seen;
  deps.generate = async (_key, payload) => { seen = payload; return { text: 'OK' }; };
  const result = await handleDashboardAi(req({ provider: 'gemini', payload: { model: 'gemini-2.5-flash', contents: 'Reply OK.', config: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } } } }), env, deps);
  assert.equal(result.status, 200); assert.equal(seen.config.maxOutputTokens, 16); assert.equal(seen.config.thinkingConfig.thinkingBudget, 0);
});
for (const cap of [0, -1, 1.5, 32769, '16']) test(`invalid Gemini output cap ${cap} is denied before generation`, async () => {
  const deps = io(); deps.generate = () => assert.fail('generation for invalid bound');
  const result = await handleDashboardAi(req({ provider: 'gemini', payload: { model: 'gemini-2.5-flash', contents: 'OK', config: { maxOutputTokens: cap } } }), env, deps);
  assert.equal(result.status, 400);
});
test('provider rate limit is sanitized with original HTTP provenance, never retried', async () => {
  const deps = io(); let calls = 0;
  deps.generate = async () => { calls++; throw Object.assign(new Error('private key response'), { status: 429 }); };
  const result = await handleDashboardAi(req({ provider: 'gemini', payload: { model: 'gemini-2.5-flash', contents: 'OK' } }), env, deps);
  assert.equal(result.body.error, 'DASHBOARD_AI_PROVIDER_RATE_LIMITED');
  assert.equal(result.body.upstreamHttpStatus, 429);
  assert.equal(calls, 1); assert.ok(!JSON.stringify(result).includes('private'));
});
test('configuration for any card is not a verified provider connection', () => {
  for (const provider of ['RapidAPI', 'Polygon', 'Alpaca', 'Finnhub', 'Financial Modeling Prep', 'Twelve Data', 'Alpha Vantage', 'Google Gemini', 'Perplexity', 'Hybrid Feed (FH+ALP)']) {
    const server = { authenticated: true, providers: { [provider]: true, Finnhub: true }, gemini: true, perplexity: true };
    const status = describeDashboardProvider(provider, { server });
    assert.equal(status.state, 'CONFIGURED'); assert.equal(status.verified, false); assert.equal(status.httpStatus, null);
  }
});
test('Drive auth failure and absent configuration never become fake provider HTTP 401', () => {
  const missing = describeDashboardProvider('Finnhub', { server: { authenticated: true, providers: {} } });
  assert.equal(missing.state, 'NOT_CONFIGURED'); assert.equal(missing.httpStatus, null);
  const auth = describeDashboardProvider('Google Drive', { driveTokenPresent: true, server: { reason: 'DASHBOARD_AI_DRIVE_LOGIN_REQUIRED', httpStatus: 401 } });
  assert.equal(auth.state, 'LOGIN_REQUIRED'); assert.equal(auth.verified, false); assert.equal(auth.httpSource, 'owner authentication');
});
test('only a recent real observation can mark AI verified; auth failures override history', () => {
  const server = { authenticated: true, gemini: true, providers: { 'Google Gemini': true } };
  const observation = { state: 'VERIFIED', checkedAt: 1000, latency: 10, httpStatus: 200 };
  assert.equal(describeDashboardProvider('Google Gemini', { server, observation, now: 2000 }).state, 'VERIFIED');
  assert.notEqual(describeDashboardProvider('Google Gemini', { server, observation, now: 400000 }).state, 'VERIFIED');
  assert.notEqual(describeDashboardProvider('Google Gemini', { server, observation, now: 500 }).state, 'VERIFIED');
  assert.equal(describeDashboardProvider('Google Gemini', { server: { reason: 'DASHBOARD_AI_OWNER_DENIED', httpStatus: 403 }, observation, now: 2000 }).state, 'OWNER_DENIED');
});
test('unclassified server failures still show an error, not a missing key', () => {
  const status = describeDashboardProvider('Google Gemini', { server: { reason: 'DASHBOARD_AI_HTTP_FAILURE', httpStatus: 500 } });
  assert.equal(status.state, 'REQUEST_ERROR'); assert.equal(status.httpStatus, 500);
});
test('an in-flight explicit probe is checking, not a failure or success', () => {
  const status = describeDashboardProvider('Google Gemini', { server: { authenticated: true, gemini: true },
    observation: { state: 'CHECKING', checkedAt: 1000 }, now: 1100 });
  assert.equal(status.state, 'CHECKING'); assert.equal(status.verified, false);
});
for (const thinkingConfig of [{ thinkingBudget: 1 }, { thinkingBudget: -1 }, { thinkingBudget: 0, includeThoughts: true }, null]) {
  test('probe cannot enable unbounded thinking', async () => {
    const deps = io(); deps.generate = () => assert.fail('generation for unapproved thinking budget');
    const result = await handleDashboardAi(req({ provider: 'gemini', payload: { model: 'gemini-2.5-flash', contents: 'OK', config: { maxOutputTokens: 16, thinkingConfig } } }), env, deps);
    assert.equal(result.status, 400);
  });
}
