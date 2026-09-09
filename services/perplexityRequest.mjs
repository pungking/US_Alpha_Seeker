export const AI_USAGE_KEY = 'US_ALPHA_SEEKER_AI_USAGE';
export const PERPLEXITY_PRICE_BASIS = 'official-sonar-rates-2026-09-09-full-context-reservation';
// Reserve the FULL documented context, not a guessed prompt tokenizer or search size.
// Rates are micro-USD per token; request fees are micro-USD per request.
const RATES = {
  sonar: { context: 128 * 1024, input: 1, output: 1, fees: { low: 5000, medium: 8000, high: 12000 } },
  'sonar-pro': { context: 200 * 1024, input: 3, output: 15, fees: { low: 6000, medium: 10000, high: 14000 } }
};
const fail = code => { throw new Error(`PERPLEXITY_${code}`); };
export const isPerplexityStopError = error => /PERPLEXITY_(BUDGET_|CIRCUIT_|HTTP_|TRANSPORT_|RESPONSE_|REQUEST_)/.test(String(error?.message || error));
const integer = value => Number.isSafeInteger(value) && value >= 0;

export function validatePerplexityPayload(input) {
  let body;
  try { body = typeof input === 'string' ? JSON.parse(input) : input; } catch { fail('REQUEST_INVALID'); }
  const rate = Object.hasOwn(RATES, body?.model ?? '') ? RATES[body.model] : null;
  if (!rate || !integer(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > rate.context) fail('REQUEST_INVALID');
  const allowed = ['model', 'messages', 'max_tokens', 'temperature', 'stream', 'disable_search', 'web_search_options'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || (body.stream !== undefined && body.stream !== false)) fail('REQUEST_INVALID');
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.some(message =>
    !message || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string' ||
    Object.keys(message).some(key => !['role', 'content'].includes(key)))) fail('REQUEST_INVALID');
  if (new TextEncoder().encode(JSON.stringify(body.messages)).length > rate.context) fail('REQUEST_INVALID');
  const temperature = body.temperature ?? 0.1;
  if (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature >= 2) fail('REQUEST_INVALID');
  if (body.disable_search !== undefined && typeof body.disable_search !== 'boolean') fail('REQUEST_INVALID');
  const options = body.web_search_options ?? {};
  if (typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => key !== 'search_context_size')) fail('REQUEST_INVALID');
  const size = options.search_context_size ?? 'low';
  if (!Object.hasOwn(rate.fees, size)) fail('REQUEST_INVALID');
  return { model: body.model, messages: body.messages, max_tokens: body.max_tokens, temperature, stream: false,
    ...(body.disable_search === undefined ? {} : { disable_search: body.disable_search }), web_search_options: { search_context_size: size } };
}

export function perplexityReservationMicroUsd(payload) {
  const body = validatePerplexityPayload(payload);
  const rate = RATES[body.model];
  return rate.context * rate.input + body.max_tokens * rate.output + rate.fees[body.web_search_options.search_context_size] + 10;
}

export function validatePerplexityBudget(config) {
  const usd = String(config?.RUN_MAX_COST_USD ?? '0');
  const maxRequests = Number(config?.RUN_MAX_REQUESTS ?? 0);
  if (!/^\d+(\.\d{1,6})?$/.test(usd) || !integer(maxRequests) || maxRequests < 1) fail('BUDGET_NOT_CONFIGURED');
  const maxMicroUsd = Math.round(Number(usd) * 1e6);
  if (!integer(maxMicroUsd) || maxMicroUsd < 1) fail('BUDGET_NOT_CONFIGURED');
  return { maxMicroUsd, maxRequests };
}

function readUsage(storage) {
  try {
    const raw = storage.getItem(AI_USAGE_KEY);
    const usage = raw === null ? {} : JSON.parse(raw);
    if (!usage || typeof usage !== 'object' || Array.isArray(usage) ||
        (usage.perplexity !== undefined && (!usage.perplexity || typeof usage.perplexity !== 'object' || Array.isArray(usage.perplexity)))) fail('BUDGET_STORAGE_INVALID');
    usage.gemini ??= { tokens: 0, requests: 0, status: 'OK', lastError: '' };
    usage.perplexity ??= { tokens: 0, requests: 0, status: 'OK', lastError: '' };
    const b = usage.perplexity.budget;
    if (b !== undefined && (!b || b.priceBasis !== PERPLEXITY_PRICE_BASIS ||
        !['maxMicroUsd', 'maxRequests', 'requestsAttempted', 'reservedMicroUsd', 'reportedMicroUsd'].every(key => integer(b[key])) ||
        b.requestsAttempted > b.maxRequests || b.reservedMicroUsd > b.maxMicroUsd || b.reportedMicroUsd > b.reservedMicroUsd ||
        ![null, 'BUDGET_NOT_CONFIGURED', 'BUDGET_CONFIG_CHANGED', 'BUDGET_EXHAUSTED', 'HTTP_FAILURE', 'TRANSPORT_UNCERTAIN', 'RESPONSE_INVALID'].includes(b.blockedReason))) fail('BUDGET_STORAGE_INVALID');
    return usage;
  } catch { fail('BUDGET_STORAGE_INVALID'); }
}

function writeUsage(storage, usage) {
  try { storage.setItem(AI_USAGE_KEY, JSON.stringify(usage)); } catch { fail('BUDGET_STORAGE_UNAVAILABLE'); }
}

export function assertPerplexityBudgetHealthy(storage = globalThis.sessionStorage) {
  const budget = readUsage(storage).perplexity.budget;
  if (budget?.blockedReason) fail(`CIRCUIT_OPEN_${budget.blockedReason}`);
}

function reserve(storage, config, payload) {
  const usage = readUsage(storage);
  let limits;
  try { limits = validatePerplexityBudget(config); }
  catch {
    usage.perplexity.budget ??= { maxMicroUsd: 0, maxRequests: 0, priceBasis: PERPLEXITY_PRICE_BASIS,
      requestsAttempted: 0, reservedMicroUsd: 0, reportedMicroUsd: 0 };
    usage.perplexity.budget.blockedReason = 'BUDGET_NOT_CONFIGURED';
    writeUsage(storage, usage); fail('BUDGET_NOT_CONFIGURED');
  }
  const budget = usage.perplexity.budget ??= { ...limits, priceBasis: PERPLEXITY_PRICE_BASIS,
    requestsAttempted: 0, reservedMicroUsd: 0, reportedMicroUsd: 0, blockedReason: null };
  if (budget.blockedReason) fail(`CIRCUIT_OPEN_${budget.blockedReason}`);
  if (budget.maxMicroUsd !== limits.maxMicroUsd || budget.maxRequests !== limits.maxRequests) {
    budget.blockedReason = 'BUDGET_CONFIG_CHANGED'; writeUsage(storage, usage); fail('BUDGET_CONFIG_CHANGED');
  }
  const amount = perplexityReservationMicroUsd(payload);
  if (budget.requestsAttempted >= limits.maxRequests || budget.reservedMicroUsd + amount > limits.maxMicroUsd) {
    budget.blockedReason = 'BUDGET_EXHAUSTED'; writeUsage(storage, usage); fail('BUDGET_EXHAUSTED');
  }
  budget.requestsAttempted++; budget.reservedMicroUsd += amount;
  // Synchronous persistence precedes every await; failures/unknown outcomes are never refunded.
  writeUsage(storage, usage);
  return amount;
}

function stop(storage, reason, code) {
  const usage = readUsage(storage);
  usage.perplexity.budget.blockedReason = reason;
  writeUsage(storage, usage);
  fail(code);
}

export async function requestPerplexity(payload, apiKey, config, { storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const body = validatePerplexityPayload(payload);
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) fail('REQUEST_KEY_MISSING');
  const send = async url => {
    const reserved = reserve(storage, config, body);
    const controller = new AbortController();
    let timer;
    try {
      const outcome = (async () => {
        const response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, body: JSON.stringify(body) });
        // Only a missing local route permits direct fallback; an upstream 404 does not.
        if (url === '/api/perplexity' && response.status === 404 && response.headers.get('X-Perplexity-Upstream-Attempted') !== 'true') return { routeMissing: true };
        if (!response.ok) stop(storage, 'HTTP_FAILURE', `HTTP_${response.status}`);
        const data = await response.json();
        const cost = data?.usage?.cost?.total_cost;
        if (data?.model !== body.model || !Array.isArray(data?.choices) || !data.choices.length || data.error ||
            !integer(data?.usage?.prompt_tokens) || data.usage.prompt_tokens > RATES[body.model].context ||
            !integer(data?.usage?.completion_tokens) || data.usage.completion_tokens > body.max_tokens ||
            typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0 || Math.ceil(cost * 1e6) > reserved) stop(storage, 'RESPONSE_INVALID', 'RESPONSE_COST_OR_TOKEN_CONTRACT_INVALID');
        const usage = readUsage(storage);
        usage.perplexity.budget.reportedMicroUsd += Math.ceil(cost * 1e6);
        writeUsage(storage, usage);
        return { ok: true, status: response.status, json: async () => data };
      })();
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('PERPLEXITY_TRANSPORT_TIMEOUT')); }, timeoutMs); });
      return await Promise.race([outcome, timeout]);
    } catch (error) {
      if (isPerplexityStopError(error) && !String(error.message).includes('TRANSPORT_')) throw error;
      stop(storage, 'TRANSPORT_UNCERTAIN', 'TRANSPORT_UNCERTAIN_NO_RETRY');
    } finally { clearTimeout(timer); }
  };
  const response = await send('/api/perplexity');
  if ('routeMissing' in response) {
    const direct = await send('https://api.perplexity.ai/chat/completions');
    if ('routeMissing' in direct) fail('RESPONSE_INVALID');
    return direct;
  }
  return response;
}
