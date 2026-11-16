import { API_CONFIGS, PERPLEXITY_CONFIG, GEMINI_MODELS } from '../constants';
import { ApiProvider } from '../types';
import { createGeminiClient } from './geminiClient';
import { hasAiAccess, explainAiAccess } from './dashboardAiClient.mjs';
import { requestPerplexity } from './perplexityRequest.mjs';
import { trackUsage } from './intelligenceService';

export async function probeDashboardAi(provider: ApiProvider) {
  if (provider !== ApiProvider.GEMINI && provider !== ApiProvider.PERPLEXITY) throw new Error('DASHBOARD_AI_REQUEST_INVALID');
  const key = API_CONFIGS.find(config => config.provider === provider)?.key;
  if (!key && !await hasAiAccess(provider, key)) throw new Error(await explainAiAccess(provider));
  const started = performance.now();
  let model: string;
  let httpStatus: number | null = null;
  let httpSource = 'AI provider';
  let buildSha: string | null = null;
  if (provider === ApiProvider.GEMINI) {
    model = GEMINI_MODELS.FAST;
    const result = await createGeminiClient(key).models.generateContent({ model, contents: 'Reply with exactly OK.', config: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } } });
    if (!result.text?.trim()) throw new Error('DASHBOARD_AI_RESPONSE_INVALID');
    httpStatus = (result as any).gatewayHttpStatus ?? null;
    if (httpStatus !== null) httpSource = 'request gateway';
    buildSha = (result as any).buildSha ?? null;
    trackUsage(provider, result.usageMetadata?.totalTokenCount || 0);
  } else {
    model = 'sonar';
    const response = await requestPerplexity({ model, messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      max_tokens: 16, disable_search: true }, key, PERPLEXITY_CONFIG);
    const result = await response.json();
    if (!result.choices?.[0]?.message?.content?.trim()) throw new Error('DASHBOARD_AI_RESPONSE_INVALID');
    httpStatus = response.status;
    httpSource = response.httpSource;
    buildSha = result.buildSha ?? null;
    trackUsage(provider, result.usage?.total_tokens || 0);
  }
  return { state: 'VERIFIED', checkedAt: Date.now(), latency: Math.round(performance.now() - started), httpStatus, httpSource, model, buildSha };
}
