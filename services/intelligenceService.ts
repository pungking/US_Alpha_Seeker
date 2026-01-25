
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Professional perspective in Korean Markdown" },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-4 reasons in Korean" },
      convictionScore: { type: Type.NUMBER, description: "0.0 to 100.0" },
      expectedReturn: { type: Type.STRING, description: "Target return e.g. +20%" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Sentiment report in Korean" },
      analysisLogic: { type: Type.STRING, description: "Neural logic in Korean" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  if (!text) return null;
  try {
    let cleanText = text.trim().replace(/```json/g, "").replace(/```/g, "").replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    const first = cleanText.indexOf('[');
    const last = cleanText.lastIndexOf(']');
    if (first !== -1 && last !== -1) return JSON.parse(cleanText.substring(first, last + 1));
    return JSON.parse(cleanText);
  } catch (e) { return null; }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 5000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (retries > 0 && (msg.includes("429") || msg.includes("quota") || msg.includes("limit"))) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string, code?: number}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `엄선된 12개 종목 데이터: ${JSON.stringify(candidates)}. 
  이 중 가장 유망한 6개를 선정하여 상세 분석 리포트를 JSON 배열로 작성하세요. 모든 설명은 한국어로 작성하며, 투자 가이드를 포함하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
      }));
      const parsed = sanitizeAndParseJson(result.text);
      return parsed ? { data: parsed } : { data: null, error: "PARSE_ERROR" };
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
      if (!res.ok) return { data: null, error: `HTTP_${res.status}`, code: res.status };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content);
      return parsed ? { data: parsed } : { data: null, error: "PARSE_ERROR" };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    const isQuota = error.message?.includes("429") || error.message?.includes("quota");
    return { data: null, error: error.message, code: isQuota ? 429 : 500 };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "API_KEY_MISSING";

  const prompt = `현재 파이프라인 상태 감사: ${JSON.stringify(data)}. 마크다운 형식의 한국어 감사 보고서를 작성하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      }));
      return response.text;
    } else {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [{ role: "system", content: "전략 감사관으로서 보고서를 작성하십시오." }, { role: "user", content: prompt }]
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 생성 실패";
    }
  } catch (e: any) { return `오류 발생: ${e.message}`; }
}
