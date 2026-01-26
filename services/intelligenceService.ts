
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
      analysisLogic: { type: Type.STRING, description: "Neural logic in Korean" },
      chartPattern: { type: Type.STRING, description: "Detected technical pattern" },
      supportLevel: { type: Type.NUMBER, description: "Technical support level" },
      resistanceLevel: { type: Type.NUMBER, description: "Major resistance level" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "riskRewardRatio"]
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    equityCurve: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING, description: "Timeline (e.g. Month 1)" },
          value: { type: Type.NUMBER, description: "Cumulative return percentage" }
        }
      }
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        winRate: { type: Type.STRING, description: "Historical win probability" },
        profitFactor: { type: Type.STRING, description: "Profit over loss ratio" },
        maxDrawdown: { type: Type.STRING, description: "Max drawdown percentage" },
        sharpeRatio: { type: Type.STRING, description: "Risk-adjusted return ratio" }
      }
    },
    historicalContext: { type: Type.STRING, description: "Backtest analysis summary in Korean" }
  },
  required: ["equityCurve", "metrics", "historicalContext"]
};

/**
 * AI 응답 텍스트에서 JSON 데이터를 추출하는 견고한 파서
 */
function sanitizeAndParseJson(text: string): any | null {
  if (!text) return null;
  try {
    let cleanText = text.trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');

    // 배열 형태인 경우
    if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    // 객체 형태인 경우
    if (firstCurly !== -1) {
      return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Text:", text.substring(0, 100));
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 6000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (retries > 0 && (msg.includes("429") || msg.includes("quota") || msg.includes("exhausted"))) {
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

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `당신은 전설적인 월가 퀀트 매니저입니다. [오늘 날짜: ${today}]
엄선된 12개 후보: ${JSON.stringify(candidates.map(c => ({s: c.symbol, p: c.price, score: c.compositeAlpha})))}.

이 중 시장 주도력이 가장 강력한 6개 종목을 최종 선정하여 정밀 분석 보고서를 작성하세요.
반드시 아래 JSON 형식을 엄수하여 배열로만 응답하십시오. 한국어를 사용하세요.`;

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
          messages: [
            { role: "system", content: "당신은 월가 퀀트입니다. 주어진 종목 리스트를 분석하여 JSON 배열 하나만 출력하십시오." },
            { role: "user", content: prompt }
          ],
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
    return { data: null, error: error.message };
  }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `[퀀트 백테스트 시뮬레이션 요청]
종목: ${stock.symbol} (${stock.name})
현재가: ${stock.price}, 지지선(매수): ${stock.supportLevel}, 저항선(목표): ${stock.resistanceLevel}
탐색 패턴: ${stock.chartPattern}

지난 2년간의 역사적 변동성과 거시 이벤트를 바탕으로 가상의 성과를 시뮬레이션하십시오.
반드시 JSON 형식으로만 응답하십시오. 한국어를 사용하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA }
      }));
      return { data: sanitizeAndParseJson(result.text) };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: "system", content: "백테스팅 시뮬레이션 결과를 JSON 객체 하나로 응답하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}` };
      const data = await res.json();
      return { data: sanitizeAndParseJson(data.choices?.[0]?.message?.content) };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `시스템 진단 및 전략 감사 리포트. 오늘: ${today}. 데이터: ${JSON.stringify(data)}. 한국어 마크다운으로 작성하십시오.`;

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
          messages: [{ role: "user", content: prompt }]
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 생성 실패";
    }
  } catch (e: any) { return `에러: ${e.message}`; }
}
