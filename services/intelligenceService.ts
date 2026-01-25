
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

  // 현재 날짜를 프롬프트에 주입
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `[오늘 날짜: ${today}] 
  당신은 전설적인 퀀트 전략가입니다. 엄선된 12개 후보: ${JSON.stringify(candidates)}. 
  이 중 가장 유망한 6개를 선정하여 상세 분석 리포트를 JSON 배열로 작성하세요. 모든 설명은 한국어로 작성하며, 보고서 내에 반드시 오늘 날짜(${today})를 명시하거나 기준으로 삼으십시오.`;

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
          messages: [{ role: "system", content: `금융 전략가로서 ${today} 기준의 정교한 한국어 JSON 리포트를 작성하십시오.` }, { role: "user", content: prompt }],
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
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  
  const prompt = `[분석 요청 시점: ${today}]
당신은 US_Alpha_Seeker 시스템의 최종 감사관(Chief Auditor)입니다.

현재 파이프라인 데이터:
- 현재 스테이지: ${data.currentStage}
- 최종 선정 종목: ${data.symbols ? data.symbols.join(", ") : "스캐닝 중"}
- 분석 엔진 정보: ${provider} (이 리포트를 작성 중인 엔진)

미션:
1. 보고서 최상단에 "전략 감사 보고서 - ${today}"를 명시하십시오.
2. 현재 실시간 VIX, 국채 금리, 달러 인덱스 상황을 가정하여 위 종목들의 선정 타당성을 비판적으로 검토하십시오.
3. 6단계 분석 엔진(Gemini/Sonar)이 도출한 결과와 논리적 일관성을 유지하되, 보수적인 리스크 관리 관점을 추가하십시오.
4. 모든 내용은 한국어 마크다운으로 전문적이고 권위 있게 작성하십시오.`;

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
          messages: [{ role: "system", content: `당신은 ${today} 기준의 시장 상황을 분석하는 수석 전략 감사관입니다.` }, { role: "user", content: prompt }]
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 생성 실패";
    }
  } catch (e: any) { return `오류 발생: ${e.message}`; }
}
