
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY' or 'ALPHA_TIER_1'" },
      marketCapClass: { type: Type.STRING, description: "Market size category: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific investment theme or sector focus" },
      investmentOutlook: { 
        type: Type.STRING, 
        description: "Professional investment perspective in Markdown format. Must be in Korean." 
      },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific dimensions in Korean."
      },
      convictionScore: { type: Type.NUMBER, description: "Conviction index from 0.0 to 100.0." },
      expectedReturn: { type: Type.STRING, description: "Target performance (e.g., '+28.5%')" },
      theme: { type: Type.STRING, description: "Current market narrative" },
      aiSentiment: { type: Type.STRING, description: "Detailed unique sentiment report in Korean." },
      analysisLogic: { type: Type.STRING, description: "Unique neural synthesis logic in Korean." }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  if (!text) return null;
  try {
    let cleanText = text.trim();
    if (cleanText.includes("```json")) {
      cleanText = cleanText.split("```json")[1].split("```")[0].trim();
    } else if (cleanText.includes("```")) {
      cleanText = cleanText.split("```")[1].split("```")[0].trim();
    }
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      cleanText = cleanText.substring(firstBracket, lastBracket + 1);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("[Intelligence_Logic] JSON Parse Error:", e);
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 5000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    // 429(Quota) 혹은 일시적 서버 오류(503, 500)에 대해 재시도
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("503") || errorMsg.includes("overloaded");
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: any}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `US Alpha Seeker Final Analysis. Candidates: ${JSON.stringify(candidates)}. 
  엄선된 6개 종목에 대해 한국어로 정교한 투자 전망과 분석 논리를 제공하십시오. 마크다운 형식을 사용하되 JSON 구조를 완벽히 유지하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
        // 복잡한 추론 태스크이므로 gemini-3-pro-preview 사용
        return await ai.models.generateContent({
          model: 'gemini-3-pro-preview', 
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
      });
      const parsed = sanitizeAndParseJson(result.text || "");
      return parsed ? { data: parsed } : { data: null, error: "JSON_PARSE_ERROR" };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [{ role: "system", content: "금융 전략가로서 정교한 JSON 리포트만 출력하십시오." }, { role: "user", content: prompt }],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `PPLX_HTTP_${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content || "");
      return parsed ? { data: parsed } : { data: null, error: "JSON_PARSE_ERROR" };
    }
    return { data: null, error: "UNSUPPORTED_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: error };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const prompt = `전략 감사 보고서 (한국어): 현재 스테이지 ${data.currentStage}, 선정 종목 ${data.symbols ? data.symbols.join(", ") : "N/A"}. 매크로 환경(VIX, 금리)을 고려한 비판적 감사를 수행하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview', // 요약/감사용은 가벼운 flash 모델 사용
        contents: prompt,
      }));
      return response.text;
    } else {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt }] })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "Fail";
    }
  } catch (e: any) { 
    return `감사 보고서 지연: ${e.message}`; 
  }
}
