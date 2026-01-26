
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY' or 'ACCUMULATE'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Professional perspective in 300+ characters Korean Markdown" },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4-5 specific technical/fundamental reasons in Korean" },
      convictionScore: { type: Type.NUMBER, description: "0.0 to 100.0" },
      expectedReturn: { type: Type.STRING, description: "Target return e.g. +25.0%" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Sentiment description in Korean" },
      analysisLogic: { type: Type.STRING, description: "Neural logic engine state description in Korean" },
      chartPattern: { type: Type.STRING, description: "Detected technical pattern name" },
      supportLevel: { type: Type.NUMBER, description: "Key technical support level (Entry Zone)" },
      resistanceLevel: { type: Type.NUMBER, description: "Major technical resistance level (Target)" },
      stopLoss: { type: Type.NUMBER, description: "Calculated hard stop price" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio e.g. 1:3.5" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "stopLoss", "riskRewardRatio"]
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
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
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
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e);
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

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `[시스템 미션: 월가 일류 퀀트 전략가]
현재 날짜: ${today}
분석 대상 종목(TOP 12): ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

위 리스트에서 기술적/재무적/ICT 관점에서 가장 완벽한 6개 종목을 최종 선정하십시오.
반드시 다음 정보를 포함한 JSON 배열로 응답하십시오:
- symbol, aiVerdict, marketCapClass, sectorTheme, convictionScore
- selectionReasons (배열), expectedReturn
- investmentOutlook (상세 마크다운), aiSentiment, analysisLogic, chartPattern
- supportLevel (진입가), resistanceLevel (목표가), stopLoss (손절가), riskRewardRatio.

한국어로 응답하고 오직 JSON 배열만 출력하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
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

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `[퀀트 백테스트 시뮬레이션]
종목: ${stock.symbol} / 현재가: ${stock.price} / 진입지지: ${stock.supportLevel} / 목표저항: ${stock.resistanceLevel}
지난 2년간의 역사적 변동성을 반영하여 위 전략의 성과를 시뮬레이션하고 결과를 JSON으로 출력하세요.
한국어로 응답하고 반드시 다음 JSON 형식을 따르세요: { "equityCurve": [...], "metrics": {...}, "historicalContext": "..." }`;

  try {
    if (provider === ApiProvider.GEMINI) {
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
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1
        })
      });
      const json = await res.json();
      return { data: sanitizeAndParseJson(json.choices?.[0]?.message?.content) };
    }
    return { data: null, error: "NOT_SUPPORTED" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[] | null;
  recommendedData?: any[] | null;
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const symbolsContext = data.recommendedData ? `추천 종목 포트폴리오(6개): ${JSON.stringify(data.recommendedData.map(d => ({s: d.symbol, v: d.aiVerdict, score: d.convictionScore, ret: d.expectedReturn, theme: d.sectorTheme})))}` : "분석 데이터 없음";
  
  const prompt = `[페르소나: 월가 헤지펀드 시니어 전략 분석가]
당신은 현재 선정된 6개 종목에 대해 포트폴리오 매니저에게 보고할 최종 전략 리포트를 작성해야 합니다.

현지 시간: ${today}
대상 포트폴리오 자산 정보: ${symbolsContext}

[보고서 작성 지침]
1. 언어: 반드시 100% 한글로만 작성하십시오. 전문적인 금융 용어를 사용하되 영어 병기를 최소화하고 품격 있는 문체로 작성하세요.
2. 서두: 리포트 최상단에 "분석 기준일: ${today}"를 명시하고 전체적인 시장 관점(Macro View)을 제시하십시오.
3. 본문: 
   - 선정된 6개 종목 간의 섹터 로테이션 및 상관관계를 분석하십시오.
   - 각 종목의 선정 배경과 거시 경제적 주도력을 결합하여 설명하십시오.
   - 포트폴리오 차원에서의 기대 수익률과 변동성 관리 방안을 제시하십시오.
4. 결론: 리스크 헤징 전략(Stop-loss 가이드 포함) 및 향후 시장 이벤트에 따른 대응 시나리오를 작성하십시오.
5. 형식: 마크다운(Markdown) 형식을 사용하여 시각적으로 구조화된 리포트를 제출하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      }));
      return response.text || "데이터 응답 오류";
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      });
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "No response content";
    }
    return "INVALID_PROVIDER";
  } catch (error: any) { return `AUDIT_NODE_FAILURE: ${error.message}`; }
}
