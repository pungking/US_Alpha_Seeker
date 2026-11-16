import { GoogleGenAI } from '@google/genai';
import { validatePerplexityPayload, validatePerplexityBudget, perplexityReservationMicroUsd } from './perplexityRequest.mjs';

const origin = 'https://us-alpha-seeker.vercel.app';
const reply = (status, body) => ({ status, body });
const reject = (status, code) => { throw Object.assign(new Error(code), { status }); };
const keysOnly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const credential = value => typeof value === 'string' && value.trim() && !/[\r\n]/.test(value) ? value.trim() : '';

function capabilities(env) {
  // shortcut: spend reservations remain owner/browser-session scoped; require durable accounting before multi-user use.
  const budget = { RUN_MAX_COST_USD: env.PERPLEXITY_RUN_MAX_COST_USD || '0', RUN_MAX_REQUESTS: env.PERPLEXITY_RUN_MAX_REQUESTS || '0' };
  let paid = false;
  try { validatePerplexityBudget(budget); paid = true; } catch { /* Unconfigured paid access stays disabled. */ }
  return { gemini: !!credential(env.GEMINI_API_KEY || env.API_KEY),
    perplexity: !!credential(env.PERPLEXITY_API_KEY) && paid, budget, providerVerified: false };
}

function geminiPayload(input) {
  if (!keysOnly(input, ['model', 'contents', 'config']) ||
      !['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(input.model) ||
      typeof input.contents !== 'string' || !input.contents.trim()) reject(400, 'REQUEST_INVALID');
  const config = input.config ?? {};
  if (!keysOnly(config, ['responseMimeType', 'responseSchema', 'systemInstruction']) ||
      (config.responseMimeType !== undefined && !['text/plain', 'application/json'].includes(config.responseMimeType)) ||
      (config.systemInstruction !== undefined && typeof config.systemInstruction !== 'string') ||
      (config.responseSchema !== undefined && !keysOnly(config.responseSchema, ['type', 'items', 'properties', 'required', 'description', 'enum', 'nullable']))) reject(400, 'REQUEST_INVALID');
  return { model: input.model, contents: input.contents, config: { ...config, maxOutputTokens: 32768 } };
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
    const identity = await fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
      headers: { Authorization: auth }, redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!identity.ok) reject(401, 'DRIVE_LOGIN_REQUIRED');
    const user = await identity.json();
    if (typeof user?.user?.emailAddress !== 'string' || user.user.emailAddress.toLowerCase() !== env.DASHBOARD_AI_OWNER_EMAIL.trim().toLowerCase()) reject(403, 'OWNER_DENIED');
    const status = capabilities(env);
    if (req.method === 'GET') return reply(200, status);
    if (!status[body.provider]) reject(503, 'PROVIDER_NOT_CONFIGURED');
    if (body.provider === 'gemini') {
      const payload = geminiPayload(body.payload);
      const result = await generateImpl(credential(env.GEMINI_API_KEY || env.API_KEY), payload);
      if (typeof result?.text !== 'string' || Buffer.byteLength(result.text) > 2 * 1024 * 1024) reject(502, 'RESPONSE_INVALID');
      return reply(200, { text: result.text, usageMetadata: result.usageMetadata });
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
    if (!upstream.ok) reject(502, 'PROVIDER_UNAVAILABLE');
    const data = await upstream.json();
    if (data?.error || data?.model !== payload.model || !Array.isArray(data?.choices) || data.choices.length !== 1 ||
        typeof data.choices[0]?.message?.content !== 'string' || Buffer.byteLength(data.choices[0].message.content) > 2 * 1024 * 1024) reject(502, 'RESPONSE_INVALID');
    return reply(200, { model: data.model, choices: [{ message: { content: data.choices[0].message.content } }],
      usage: { prompt_tokens: data.usage?.prompt_tokens, completion_tokens: data.usage?.completion_tokens,
        total_tokens: data.usage?.total_tokens, cost: { total_cost: data.usage?.cost?.total_cost } } });
  } catch (error) {
    // Only locally created errors have an HTTP status; never relay vendor text.
    const status = [400, 401, 403, 405, 413, 502, 503].includes(error.status) ? error.status : 502;
    const code = ['METHOD_NOT_ALLOWED', 'OWNER_NOT_CONFIGURED', 'ORIGIN_DENIED', 'DRIVE_LOGIN_REQUIRED', 'REQUEST_TOO_LARGE',
      'REQUEST_INVALID', 'OWNER_DENIED', 'PROVIDER_NOT_CONFIGURED', 'RESPONSE_INVALID', 'PROVIDER_UNAVAILABLE'].includes(error.message) ? error.message : 'PROVIDER_UNAVAILABLE';
    return reply(status, { error: `DASHBOARD_AI_${code}` });
  }
}
