import { GoogleGenAI } from '@google/genai';
import { validatePerplexityPayload, validatePerplexityBudget, perplexityReservationMicroUsd } from './perplexityRequest.mjs';

const origin = 'https://us-alpha-seeker.vercel.app';
const reply = (status, body) => ({ status, body });
class DashboardAiFailure extends Error {
  constructor(status, code, upstreamHttpStatus) { super(code); this.status = status; this.upstreamHttpStatus = upstreamHttpStatus; }
}
const reject = (status, code, upstreamHttpStatus = undefined) => { throw new DashboardAiFailure(status, code, upstreamHttpStatus); };
const keysOnly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const credential = value => typeof value === 'string' && value.trim() && !/[\r\n]/.test(value) ? value.trim() : '';

function capabilities(env) {
  // shortcut: spend reservations remain owner/browser-session scoped; require durable accounting before multi-user use.
  let budget = { RUN_MAX_COST_USD: env.PERPLEXITY_RUN_MAX_COST_USD || '0', RUN_MAX_REQUESTS: env.PERPLEXITY_RUN_MAX_REQUESTS || '0' };
  let paid = false;
  try { validatePerplexityBudget(budget); paid = true; } catch { budget = { RUN_MAX_COST_USD: '0', RUN_MAX_REQUESTS: '0' }; }
  const providers = Object.fromEntries(Object.entries({ RapidAPI: 'RAPID_API_KEY', Polygon: 'POLYGON_API_KEY', Alpaca: 'ALPACA_KEY',
    Finnhub: 'FINNHUB_KEY', 'Financial Modeling Prep': 'FMP_KEY', 'Twelve Data': 'TWELVE_DATA_KEY', 'Alpha Vantage': 'ALPHA_VANTAGE_KEY'
  }).map(([provider, key]) => [provider, !!credential(env[key])]));
  providers['Google Gemini'] = !!credential(env.GEMINI_API_KEY || env.API_KEY);
  providers.Perplexity = !!credential(env.PERPLEXITY_API_KEY);
  return { gemini: !!credential(env.GEMINI_API_KEY || env.API_KEY),
    perplexity: !!credential(env.PERPLEXITY_API_KEY) && paid, budget, providerVerified: false, providers, authenticated: true,
    buildSha: /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA || '') ? env.VERCEL_GIT_COMMIT_SHA : null };
}

function providerFailure(status) {
  const http = Number.isInteger(status) && status >= 400 && status <= 599 ? status : undefined;
  const code = [401, 403].includes(http) ? 'PROVIDER_AUTH_REJECTED' : http === 429 ? 'PROVIDER_RATE_LIMITED' : 'PROVIDER_UNAVAILABLE';
  reject(502, code, http);
}

function geminiPayload(input) {
  if (!keysOnly(input, ['model', 'contents', 'config']) ||
      !['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(input.model) ||
      typeof input.contents !== 'string' || !input.contents.trim()) reject(400, 'REQUEST_INVALID');
  const config = input.config ?? {};
  if (!keysOnly(config, ['responseMimeType', 'responseSchema', 'systemInstruction', 'maxOutputTokens', 'thinkingConfig']) ||
      (config.thinkingConfig !== undefined && (!keysOnly(config.thinkingConfig, ['thinkingBudget']) || config.thinkingConfig.thinkingBudget !== 0)) ||
      (config.maxOutputTokens !== undefined && (!Number.isSafeInteger(config.maxOutputTokens) || config.maxOutputTokens < 1 || config.maxOutputTokens > 32768)) ||
      (config.responseMimeType !== undefined && !['text/plain', 'application/json'].includes(config.responseMimeType)) ||
      (config.systemInstruction !== undefined && typeof config.systemInstruction !== 'string') ||
      (config.responseSchema !== undefined && !keysOnly(config.responseSchema, ['type', 'items', 'properties', 'required', 'description', 'enum', 'nullable']))) reject(400, 'REQUEST_INVALID');
  return { model: input.model, contents: input.contents, config: { ...config, maxOutputTokens: config.maxOutputTokens ?? 32768 } };
}

async function generate(key, payload) {
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 20000 } });
  const result = await ai.models.generateContent(payload);
  return { text: result.text, usageMetadata: result.usageMetadata };
}

// No request/header/body or upstream error is sent to logs or telemetry here.
export async function handleDashboardAi(req, env, { fetchImpl = globalThis.fetch, generate: generateImpl = generate } = {}) {
  try {
    if (!['GET', 'POST'].includes(req.method)) reject(405, 'METHOD_NOT_ALLOWED');
    if (!credential(env.DASHBOARD_AI_OWNER_EMAIL)) reject(503, 'OWNER_NOT_CONFIGURED');
    if (req.method === 'POST' && req.headers?.origin !== origin) reject(403, 'ORIGIN_DENIED');
    const auth = req.headers?.authorization;
    if (typeof auth !== 'string' || !/^Bearer [^\s]+$/.test(auth) || auth.length > 4096) reject(401, 'DRIVE_LOGIN_REQUIRED');
    let body;
    if (req.method === 'POST') {
      if (Buffer.byteLength(JSON.stringify(req.body) || '') > 1024 * 1024) reject(413, 'REQUEST_TOO_LARGE');
      try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
      catch { reject(400, 'REQUEST_INVALID'); }
      if (!keysOnly(body, ['provider', 'payload']) || !['gemini', 'perplexity'].includes(body.provider)) reject(400, 'REQUEST_INVALID');
    }
    let user;
    try {
      const identity = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
        headers: { Authorization: auth }, redirect: 'error', signal: AbortSignal.timeout(5000)
      });
      if (!identity.ok) reject(identity.status === 401 ? 401 : 503, identity.status === 401 ? 'DRIVE_LOGIN_REQUIRED' : 'DRIVE_AUTH_UNAVAILABLE');
      user = await identity.json();
    } catch (error) {
      if (error instanceof DashboardAiFailure) throw error;
      reject(503, 'DRIVE_AUTH_UNAVAILABLE');
    }
    if (typeof user?.user?.emailAddress !== 'string' || user.user.emailAddress.toLowerCase() !== env.DASHBOARD_AI_OWNER_EMAIL.trim().toLowerCase()) reject(403, 'OWNER_DENIED');
    const status = capabilities(env);
    if (req.method === 'GET') return reply(200, status);
    if (!status[body.provider]) reject(503, 'PROVIDER_NOT_CONFIGURED');
    if (body.provider === 'gemini') {
      const payload = geminiPayload(body.payload);
      let result;
      try { result = await generateImpl(credential(env.GEMINI_API_KEY || env.API_KEY), payload); }
      catch (error) { providerFailure(error?.status); }
      if (typeof result?.text !== 'string' || Buffer.byteLength(result.text) > 2 * 1024 * 1024) reject(502, 'RESPONSE_INVALID');
      return reply(200, { text: result.text, usageMetadata: result.usageMetadata, buildSha: status.buildSha });
    }
    let payload;
    try {
      payload = validatePerplexityPayload(body.payload);
      if (payload.max_tokens > 3200 || perplexityReservationMicroUsd(payload) > validatePerplexityBudget(status.budget).maxMicroUsd) reject(400, 'REQUEST_INVALID');
    } catch { reject(400, 'REQUEST_INVALID'); }
    const upstream = await fetchImpl('https://api.perplexity.ai/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${credential(env.PERPLEXITY_API_KEY)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!upstream.ok) providerFailure(upstream.status);
    const data = await upstream.json();
    if (data?.error || data?.model !== payload.model || !Array.isArray(data?.choices) || data.choices.length !== 1 ||
        typeof data.choices[0]?.message?.content !== 'string' || Buffer.byteLength(data.choices[0].message.content) > 2 * 1024 * 1024) reject(502, 'RESPONSE_INVALID');
    return reply(200, { model: data.model, buildSha: status.buildSha, choices: [{ message: { content: data.choices[0].message.content } }],
      usage: { prompt_tokens: data.usage?.prompt_tokens, completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens, cost: { total_cost: data.usage?.cost?.total_cost } } });
  } catch (error) {
    const trusted = error instanceof DashboardAiFailure;
    return reply(trusted ? error.status : 502, { error: `DASHBOARD_AI_${trusted ? error.message : 'PROVIDER_UNAVAILABLE'}`,
      ...(trusted && error.upstreamHttpStatus !== undefined ? { upstreamHttpStatus: error.upstreamHttpStatus } : {}) });
  }
}
