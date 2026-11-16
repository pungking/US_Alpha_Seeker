const problems = {
  DASHBOARD_AI_DRIVE_LOGIN_REQUIRED: ['LOGIN_REQUIRED', 'LOGIN REQUIRED', 'Connect the existing project Drive account.'],
  DASHBOARD_AI_OWNER_DENIED: ['OWNER_DENIED', 'OWNER MISMATCH', 'Drive is logged in, but not as the configured dashboard owner.'],
  DASHBOARD_AI_OWNER_NOT_CONFIGURED: ['CONFIG_ERROR', 'OWNER SETUP', 'Server owner configuration is missing.'],
  DASHBOARD_AI_DRIVE_AUTH_UNAVAILABLE: ['AUTH_UNAVAILABLE', 'AUTH UNAVAILABLE', 'Drive authentication could not be verified; not a vendor key rejection.'],
  DASHBOARD_AI_ROUTE_MISSING: ['ROUTE_MISSING', 'DEPLOYMENT ERROR', 'This deployment is missing the dashboard API route. Check the deployed commit.'],
  DASHBOARD_AI_NETWORK_ERROR: ['NETWORK_ERROR', 'NETWORK ERROR', 'The configuration request did not complete.'],
  DASHBOARD_AI_PROVIDER_AUTH_REJECTED: ['PROVIDER_ERROR', 'KEY / ACCESS ERROR', 'The AI provider rejected this request.'],
  DASHBOARD_AI_PROVIDER_RATE_LIMITED: ['PROVIDER_ERROR', 'RATE / QUOTA LIMIT', 'The AI provider returned a rate or quota limit.'],
  DASHBOARD_AI_PROVIDER_UNAVAILABLE: ['PROVIDER_ERROR', 'PROVIDER ERROR', 'The provider request did not complete successfully.'],
  DASHBOARD_AI_PROVIDER_NOT_CONFIGURED: ['NOT_CONFIGURED', 'KEY NOT CONFIGURED', 'Required server-side provider configuration is missing.'],
  DASHBOARD_AI_BUDGET_NOT_CONFIGURED: ['BLOCKED', 'BUDGET REQUIRED', 'Perplexity is disabled until the operator configures its session budget.'],
  DASHBOARD_AI_BUDGET_BLOCKED: ['BLOCKED', 'BUDGET BLOCKED', 'The session reservation limit blocked this request.'],
  DASHBOARD_AI_CIRCUIT_OPEN: ['BLOCKED', 'CIRCUIT OPEN', 'A previous uncertain/failed request stopped further paid calls. No automatic reset or retry.']
};
const settingNames = {
  RapidAPI: 'RAPID_API_KEY', Polygon: 'POLYGON_API_KEY', Alpaca: 'ALPACA_KEY', Finnhub: 'FINNHUB_KEY',
  'Financial Modeling Prep': 'FMP_KEY', 'Twelve Data': 'TWELVE_DATA_KEY', 'Alpha Vantage': 'ALPHA_VANTAGE_KEY',
  'Google Gemini': 'GEMINI_API_KEY or API_KEY', Perplexity: 'PERPLEXITY_API_KEY',
  'Hybrid Feed (FH+ALP)': 'FINNHUB_KEY or ALPACA_KEY'
};

export function describeDashboardProvider(provider, { server = {}, observation = null, localConfigured = false, driveTokenPresent = false, now = Date.now() } = {}) {
  const base = { state: 'NOT_CONFIGURED', label: 'KEY NOT CONFIGURED', detail: 'No usable configuration found.', verified: false,
    httpStatus: null, httpSource: '', checkedAt: server.checkedAt ?? null, latency: null };
  const problem = !localConfigured && server.reason && (problems[server.reason] || ['REQUEST_ERROR', 'CONFIG REQUEST FAILED', 'Server configuration could not be verified. Refresh settings for a new check.']);
  if (problem) return { ...base, state: problem[0], label: problem[1], detail: problem[2], httpStatus: server.httpStatus ?? null,
    httpSource: server.httpSource || (server.reason === 'DASHBOARD_AI_ROUTE_MISSING' ? 'deployment route' : 'owner authentication') };
  if (provider === 'Google Drive') return server.authenticated
    ? { ...base, state: 'AUTHENTICATED', label: 'OWNER VERIFIED', detail: 'Owner identity verified through Drive; file writes are not tested.', verified: true }
    : { ...base, state: 'LOGIN_REQUIRED', label: 'LOGIN REQUIRED', detail: driveTokenPresent ? 'A token is present but has not been verified.' : 'Connect Cloud Vault first.' };
  const configured = localConfigured || server.providers?.[provider] ||
    (provider === 'Google Gemini' && server.gemini) || (provider === 'Perplexity' && server.perplexity) ||
    (provider === 'Hybrid Feed (FH+ALP)' && (server.providers?.Finnhub || server.providers?.Alpaca));
  if (!configured) return { ...base,
    detail: `${observation?.state === 'REQUEST_ERROR' ? 'No provider request could be verified. ' : ''}No usable server setting: ${settingNames[provider] || 'provider configuration'}. Refresh cannot create credentials.` };
  if (provider === 'Perplexity' && !localConfigured && !server.perplexity) return { ...base, state: 'BLOCKED', label: 'BUDGET REQUIRED', detail: problems.DASHBOARD_AI_BUDGET_NOT_CONFIGURED[2] };
  const age = now - (observation?.checkedAt ?? 0);
  if (observation && age >= 0 && age <= 300000) {
    if (observation.state === 'CHECKING') return { ...base, state: 'CHECKING', label: 'CHECKING REPLY', detail: 'One explicit request in progress; no automatic retry.', checkedAt: observation.checkedAt };
    if (observation.state === 'VERIFIED') return { ...base, ...observation, label: 'RESPONSE VERIFIED', detail: 'Last real AI response; not a guarantee of future availability.', verified: true };
    const reason = problems[observation.reason];
    return { ...base, ...observation, state: reason?.[0] || 'REQUEST_ERROR', label: reason?.[1] || 'REQUEST FAILED', detail: reason?.[2] || 'The request was blocked or failed; no automatic retry.', verified: false };
  }
  return { ...base, state: 'CONFIGURED', label: 'CONFIGURED / UNTESTED',
    detail: observation ? 'Previous observation expired; a new check is required.' : 'Configuration only. No provider request has been verified.' };
}
