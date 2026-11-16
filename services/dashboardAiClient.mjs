import { currentDriveProgressToken } from './driveProgressToken.mjs';

let cached;
const empty = () => ({ gemini: false, perplexity: false, providerVerified: false });
export async function dashboardAiStatus({ storage = globalThis.sessionStorage, fetchImpl = globalThis.fetch } = {}) {
  if (globalThis.__ALPHA_RUNTIME_ENV__) return empty();
  const token = currentDriveProgressToken(storage);
  if (!token) { cached = undefined; return empty(); }
  if (cached?.token === token && cached.fetchImpl === fetchImpl && cached.until > Date.now()) {
    const status = await cached.result;
    return currentDriveProgressToken(storage) === token ? status : empty();
  }
  const result = (async () => {
    try {
      const response = await fetchImpl('/api/dashboard_ai', { headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) });
      if (!response.ok) return empty();
      const data = await response.json();
      return { gemini: data.gemini === true, perplexity: data.perplexity === true, budget: data.budget, providerVerified: false };
    } catch { return empty(); }
  })();
  cached = { token, fetchImpl, until: Date.now() + 60000, result };
  const status = await result;
  return currentDriveProgressToken(storage) === token ? status : empty();
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
    if (!response.ok) throw new Error('DASHBOARD_AI_REQUEST_FAILED');
    return await response.json();
  } catch { throw Object.assign(new Error('DASHBOARD_AI_REQUEST_FAILED_NO_RETRY'), { noRetry: true }); }
}
