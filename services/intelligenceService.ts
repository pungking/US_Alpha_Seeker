
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
      aiSentiment: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 3000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    // 429, 503, 500 계열의 일시적 오류에 대해 재시도
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("503") || errorMsg.includes("quota") || errorMsg.includes("overloaded");
    
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `Analyze these 5 US stocks and provide a deep quant strategy in Korean. Return ONLY a JSON array. Dataset: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const result = await fetchWithRetry(async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: ALPHA_SCHEMA
            }
          });
          return response;
        });
        const parsed = sanitizeAndParseJson(result.text || "");
        return parsed ? { data: parsed } : { data: null, error: "GEMINI_PAYLOAD_PARSE_FAILED" };
      } catch (geminiErr: any) {
        const msg = geminiErr.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota")) {
          return { data: null, error: "GEMINI_QUOTA_EXCEEDED: 호출 한도가 초과되었습니다. (무료 티어 RPM 도달). 1분 후 시도하거나 Sonar Pro를 사용하세요." };
        }
        throw geminiErr;
      }
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "You are a quant analyst. Return strictly valid JSON arrays in Korean." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (res.status === 429) return { data: null, error: "PERPLEXITY_QUOTA_EXCEEDED: Perplexity 할당량이 초과되었습니다." };
      if (!res.ok) return { data: null, error: `PERPLEXITY_ERROR: ${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_NODE_FAILURE: ${error.message.substring(0, 100)}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || config?.key;
  if (!apiKey) return "API_KEY_OFFLINE";
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Audit this system state: ${JSON.stringify(data)}. Tone: Technical. Language: Korean.`,
    }));
    return response.text;
  } catch (e: any) { 
    const msg = e.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return "AUDIT_QUOTA_EXCEEDED: 제미나이 호출 한도가 초과되었습니다. 무료 티어 정책상 짧은 간격의 반복 요청이 차단되었습니다. 1분 후 다시 시도해 주세요.";
    }
    return `AUDIT_NODE_ERROR: ${e.message.substring(0, 50)}`; 
  }
}
