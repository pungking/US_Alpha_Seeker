
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "Stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "Verdict (e.g., 'STRONG_BUY')" },
      marketCapClass: { type: Type.STRING, description: "LARGE, MID, or SMALL" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Outlook in Korean Markdown" },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3 reasons in Korean"
      },
      convictionScore: { type: Type.NUMBER, description: "0 to 100" },
      expectedReturn: { type: Type.STRING, description: "e.g., '+25%'" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Sentiment in Korean" },
      analysisLogic: { type: Type.STRING, description: "Neural logic in Korean" }
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
    console.error("[Alpha_Logic] Parse Failure:", e);
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 5000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("overloaded");
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

  const prompt = `US Alpha Seeker Final Analysis. Candidates: ${JSON.stringify(candidates)}. 
  Return a JSON array of the top 6 stocks with detailed investment outlooks in Korean. 
  Follow the schema strictly. Macro Context: Consider VIX and current interest rates.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
      });
      const parsed = sanitizeAndParseJson(result.text || "");
      return parsed ? { data: parsed } : { data: null, error: "GEMINI_PARSE_ERROR" };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [{ role: "system", content: "금융 전략가로서 정교한 한국어 JSON 리포트를 작성하십시오." }, { role: "user", content: prompt }],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `PPLX_HTTP_${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content || "");
      return parsed ? { data: parsed } : { data: null, error: "PPLX_PARSE_ERROR" };
    }
    return { data: null, error: "UNSUPPORTED_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const prompt = `감사 보고서 (한국어): 스테이지 ${data.currentStage}, 종목: ${data.symbols ? data.symbols.join(", ") : "N/A"}. 매크로 환경 분석을 포함하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
  } catch (e: any) { return `지연: ${e.message}`; }
}
