
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
      chartPattern: { type: Type.STRING, description: "Detected technical pattern name" },
      supportLevel: { type: Type.NUMBER, description: "Key technical support level" },
      resistanceLevel: { type: Type.NUMBER, description: "Major technical resistance level" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio e.g. 1:3" }
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

function sanitizeAndParseJson(text: string): any | null {
  if (!text) return null;
  try {
    let cleanText = text.trim();
    // 마크다운 블록 제거
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    // 제어 문자 제거
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');

    if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    if (firstCurly !== -1) {
      return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Content:", text.substring(0, 100));
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 6000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (retries > 0 && (msg.includes("429") || msg.includes("quota") || msg.includes("limit") || msg.includes("exhausted"))) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Generates high-level investment synthesis across different AI providers
export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string, code?: number}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `당신은 전설적인 월가 퀀트 헤지펀드 매니저입니다. [오늘 날짜: ${today}]
분석 후보 종목 리스트: ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

위 리스트에서 시장 주도력이 가장 강력한 6개 종목을 최종 선정하여 정밀 분석 보고서를 작성하세요.
반드시 아래 JSON 필드명을 포함한 배열 형식으로만 응답하십시오:
symbol, aiVerdict, marketCapClass, sectorTheme, investmentOutlook, selectionReasons (배열), convictionScore (숫자), expectedReturn, theme, aiSentiment, analysisLogic, chartPattern, supportLevel (숫자), resistanceLevel (숫자), riskRewardRatio.

한국어로 응답하십시오. 오직 JSON 데이터만 출력하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      // Use process.env.API_KEY as primary source for Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
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
            { role: "system", content: "당신은 월가 퀀트입니다. 분석 결과를 반드시 JSON 배열 하나만 출력하십시오. 코드 블록이나 설명 없이 순수 JSON 배열만 반환하세요." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}` };
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      return { data: sanitizeAndParseJson(content) };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

// Fixed truncated function: Simulates historical performance for a specific stock candidate
export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `[퀀트 백테스트 시뮬레이션 요청]
종목: ${stock.symbol}
현재가: ${stock.price}, 지지선(매수타점): ${stock.supportLevel}, 저항선(목표가): ${stock.resistanceLevel}
탐색된 패턴: ${stock.chartPattern}

지난 2년간의 역사적 변동성과 거시 이벤트를 바탕으로, 위 기술적 전략을 적용했을 때의 가상 성과를 시뮬레이션하십시오. 
반드시 다음 필드를 포함한 JSON 형식으로만 응답하십시오:
1. equityCurve: [{ period: string, value: number }] (12개월 누적 수익률, 0%부터 시작)
2. metrics: { winRate: string, profitFactor: string, maxDrawdown: string, sharpeRatio: string }
3. historicalContext: string (시뮬레이션 분석 요약, 한국어)

한국어로 응답하고 오직 JSON 데이터만 출력하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      // Use process.env.API_KEY as primary source for Gemini
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
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
            { role: "system", content: "백테스트 시뮬레이션 결과를 JSON 객체 하나로 응답하십시오. 설명 없이 순수 JSON만 반환하세요." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}` };
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      return { data: sanitizeAndParseJson(content) };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

// Added missing function to analyze the system pipeline status and provide Korean audit reports
export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[] | null;
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const symbolContext = data.symbols ? `Target Symbols: ${data.symbols.join(", ")}.` : "No symbols selected yet.";
  const prompt = `System Stage ${data.currentStage}, Active Nodes: ${activeNodes}. ${symbolContext} Provide a deep diagnostic audit and strategic recommendation in Korean Markdown.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      }));
      return response.text || "No response text";
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: "system", content: "당신은 월가의 전략 분석가입니다. 마크다운 형식으로 심층 진단 보고서를 작성하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.3
        })
      });
      if (!res.ok) return `AUDIT_NODE_FAILURE: HTTP_${res.status}`;
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "No response content";
    }
    return "AUDIT_NODE_ERROR: INVALID_PROVIDER";
  } catch (error: any) {
    return `AUDIT_NODE_FAILURE: ${error.message}`;
  }
}
