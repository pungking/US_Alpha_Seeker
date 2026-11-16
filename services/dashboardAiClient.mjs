import { currentDriveProgressToken } from './driveProgressToken.mjs';

let cached;
const codes = new Set(['DRIVE_LOGIN_REQUIRED', 'DRIVE_AUTH_UNAVAILABLE', 'OWNER_DENIED', 'OWNER_NOT_CONFIGURED', 'ORIGIN_DENIED',
  'PROVIDER_NOT_CONFIGURED', 'PROVIDER_AUTH_REJECTED', 'PROVIDER_RATE_LIMITED', 'PROVIDER_UNAVAILABLE', 'RESPONSE_INVALID', 'REQUEST_INVALID']);
export function safeDashboardFailure(data, httpStatus) {
  const code = typeof data?.error === 'string' ? data.error.replace(/^DASHBOARD_AI_/, '') : '';
  return { reason: `DASHBOARD_AI_${httpStatus === 404 ? 'ROUTE_MISSING' : codes.has(code) ? code : 'HTTP_FAILURE'}`, httpStatus,
    httpSource: httpStatus === 404 ? 'deployment route' : code.startsWith('DRIVE_') || code === 'OWNER_DENIED' ? 'owner authentication' : 'request gateway',
    ...(Number.isInteger(data?.upstreamHttpStatus) && data.upstreamHttpStatus >= 400 && data.upstreamHttpStatus <= 599 ? { upstreamHttpStatus: data.upstreamHttpStatus } : {}) };
}
const empty = (reason = 'DASHBOARD_AI_DRIVE_LOGIN_REQUIRED', httpStatus = null) =>
  ({ gemini: false, perplexity: false, providerVerified: false, providers: {}, authenticated: false, reason, httpStatus, checkedAt: Date.now() });
export async function dashboardAiStatus({ storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch, force = false } = {}) {
  if (globalThis.__ALPHA_RUNTIME_ENV__) return { ...empty('DASHBOARD_AI_RUNTIME_KEY_MISSING'), headless: true };
  const token = currentDriveProgressToken(storage);
  if (!token) { cached = undefined; return empty(); }
  if (cached?.token === token && cached.fetchImpl === fetchImpl && (cached.pending || (!force && cached.until > Date.now()))) {
    const status = await cached.result;
    return currentDriveProgressToken(storage) === token ? status : empty();
  }
  const result = (async () => {
    try {
      const response = await fetchImpl('/api/dashboard_ai', { headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
      let data;
      try { data = await response.json(); } catch { return { ...empty(), ...safeDashboardFailure(null, response.status) }; }
      if (!response.ok) return { ...empty(), ...safeDashboardFailure(data, response.status) };
      if (!data || typeof data.gemini !== 'boolean' || typeof data.perplexity !== 'boolean' || data.error) return empty('DASHBOARD_AI_RESPONSE_INVALID', response.status);
      const providers = Object.fromEntries(Object.entries(data.providers || {}).filter(([, value]) => typeof value === 'boolean'));
      return { gemini: data.gemini === true, perplexity: data.perplexity === true, budget: data.budget, providerVerified: false,
        providers, authenticated: data.authenticated === true, reason: null, httpStatus: response.status, checkedAt: Date.now(),
        buildSha: /^[a-f0-9]{40}$/.test(data.buildSha || '') ? data.buildSha : null };
    } catch { return empty('DASHBOARD_AI_NETWORK_ERROR'); }
  })();
  const entry = { token, fetchImpl, until: Date.now() + 60000, result, pending: true };
  cached = entry;
  const status = await result;
  entry.pending = false;
  if (status.reason) entry.until = Date.now() + 5000;
  return currentDriveProgressToken(storage) === token ? status : empty();
}

export async function explainAiAccess(provider) {
  const status = await dashboardAiStatus();
  return status.reason || (provider === 'Perplexity' && status.providers?.Perplexity ? 'DASHBOARD_AI_BUDGET_NOT_CONFIGURED' : 'DASHBOARD_AI_PROVIDER_NOT_CONFIGURED');
}

export async function hasAiAccess(provider, key) {
  if (typeof key === 'string' && key.trim()) return true;
  const status = await dashboardAiStatus();
  return provider === 'Google Gemini' ? status.gemini : provider === 'Perplexity' ? status.perplexity : false;
}

export async function dashboardAiRequest(provider, payload) {
  const token = currentDriveProgressToken(globalThis.sessionStorage);
  if (!token) throw Object.assign(new Error('DASHBOARD_AI_DRIVE_LOGIN_REQUIRED'), { noRetry: true });
  try {
    const response = await fetch('/api/dashboard_ai', { method: 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, payload }), signal: AbortSignal.timeout(28000) });
    if (!response.ok) {
      let data;
      try { data = await response.json(); } catch { /* Raw upstream responses are never displayed. */ }
      throw Object.assign(new Error(safeDashboardFailure(data, response.status).reason), safeDashboardFailure(data, response.status));
    }
    return { ...await response.json(), gatewayHttpStatus: response.status };
  } catch (error) {
    const reason = typeof error?.reason === 'string' ? error.reason : 'DASHBOARD_AI_NETWORK_ERROR';
    throw Object.assign(new Error(reason), { noRetry: true, reason, httpStatus: error?.httpStatus, httpSource: error?.httpSource, upstreamHttpStatus: error?.upstreamHttpStatus });
  }
}
