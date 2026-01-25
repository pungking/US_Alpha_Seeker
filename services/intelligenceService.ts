
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING },
      aiVerdict: { type: Type.STRING },
      investmentOutlook: { type: Type.STRING },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      convictionScore: { type: Type.NUMBER },
      theme: { type: Type.STRING },
      aiSentiment: { type: Type.STRING },
      analysisLogic: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
}

/**
 * Enhanced fetch with Exponential Backoff for 429 Quota errors
 */
async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 5000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    // 429, 503, Quota Exceeded 에러 체크
    const isQuotaError = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("exhausted");
    
    if (retries > 0 && isQuotaError) {
      console.warn(`[AI_RETRY] Quota hit. Waiting ${delay/1000}s. Retries left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      // 지수 백오프: 다음 재시도는 대기 시간을 2배로 늘림
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `Analyze these 5 US stocks: ${candidates.map(c => c.symbol).join(", ")}.
    Provide professional quantitative and ICT (Inner Circle Trader) analysis in Korean.
    Return ONLY a valid JSON array matching the required schema.
    Dataset for context: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
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
          messages: [
            { role: "system", content: "You are a world-class hedge fund quant analyst. Strictly return ONLY a JSON array." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `PPLX_ERR_${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PPLX_PARSE_ERROR" };
    }

    return { data: null, error: "UNSUPPORTED_PROVIDER" };
  } catch (error: any) {
    if (error.message?.includes("429")) {
      return { data: null, error: "할당량 초과(429): 잠시 후 다시 시도하거나 Sonar Pro 엔진을 사용하세요." };
    }
    return { data: null, error: error.message };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  
  if (!apiKey) return `통신 오류: ${provider} API 키가 누락되었습니다.`;

  const symbolsList = data.symbols ? data.symbols.join(", ") : "전체 섹터";
  const prompt = `월스트리트 수석 전략가로서 현재 분석 대상(${symbolsList})에 대한 마크다운 리포트를 작성하십시오. 한국어로 작성하며 표와 굵은 글씨를 활용하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      }));
      return response.text;
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: "user", content: prompt }]
        })
      });
      const resData = await res.json();
      return resData.choices[0].message.content;
    }
    return "지원되지 않는 분석 엔진입니다.";
  } catch (e: any) {
    return `분석 지연: ${e.message.includes("429") ? "할당량 대기 중..." : e.message}`;
  }
}
