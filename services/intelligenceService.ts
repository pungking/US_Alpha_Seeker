
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
    simulationPeriod: { type: Type.STRING, description: "Exact date range used e.g. '2023.01.01 ~ 2025.01.01'" },
    equityCurve: {
      type: Type.ARRAY,
      minItems: 12,
      maxItems: 12,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING, description: "Timeline label (e.g. '23.01', '23.03'...)" },
          value: { type: Type.NUMBER, description: "Cumulative return percentage as a number" }
        },
        required: ["period", "value"]
      }
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        winRate: { type: Type.STRING, description: "Win probability e.g. '68.5%'" },
        profitFactor: { type: Type.STRING, description: "Profit factor e.g. '2.45'" },
        maxDrawdown: { type: Type.STRING, description: "Max drawdown e.g. '-12.4%'" },
        sharpeRatio: { type: Type.STRING, description: "Sharpe ratio e.g. '1.8'" }
      },
      required: ["winRate", "profitFactor", "maxDrawdown", "sharpeRatio"]
    },
    historicalContext: { type: Type.STRING, description: "Detailed strategy analysis in Korean" }
  },
  required: ["simulationPeriod", "equityCurve", "metrics", "historicalContext"]
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
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Text:", text);
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
- supportLevel, resistanceLevel, stopLoss, riskRewardRatio.

주의: supportLevel, resistanceLevel, stopLoss는 반드시 현재가 근처의 유효한 숫자여야 합니다.
한국어로 응답하고 오직 JSON 배열만 출력하세요. 인사말이나 부가설명은 절대 금지입니다.`;

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
            { role: "system", content: "당신은 월가 퀀트입니다. 분석 결과를 반드시 JSON 배열 하나만 출력하십시오. 코드 블록 없이 순수 JSON 배열만 반환하세요." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}: API 연결 실패` };
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

  // [Fix] 날짜 범위 명시적 계산 (최근 2년)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 2);
  const periodStr = `${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`;

  const prompt = `[퀀트 백테스트 시뮬레이션 요청]
대상: ${stock.symbol}
설정 기간: ${periodStr} (정확히 최근 24개월)
전략: 진입가 ${stock.supportLevel} / 목표가 ${stock.resistanceLevel} 기준 스윙 트레이딩

위 기간 동안 해당 종목의 역사적 변동성(Volatility)과 베타(Beta) 계수를 기반으로 가상 시뮬레이션을 수행하십시오.
실제 틱 데이터가 없다면, 종목의 통계적 특성을 이용해 몬테카를로 시뮬레이션 결과를 생성하여 빈 값 없이 응답해야 합니다.

[필수 요구사항]
1. simulationPeriod: "${periodStr}"로 고정.
2. metrics: "N/A" 금지. 반드시 추정치라도 숫자를 포함한 문자열(예: "65.4%")을 채우십시오.
3. equityCurve: 2년치 데이터를 2개월 단위로 요약하여 정확히 12개의 포인트를 생성하십시오.
4. value: 누적 수익률(%)이며 순수 숫자(Number)여야 합니다. (예: 15.5)

반드시 JSON 스키마를 준수하여 출력하십시오.`;

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
          messages: [
            { role: "system", content: "당신은 전문 퀀트 엔진입니다. N/A 없이 모든 필드에 시뮬레이션 수치를 채워 JSON으로 응답하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}: 시뮬레이션 서버 응답 없음` };
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
  const symbolsContext = data.recommendedData ? `추천 종목 포트폴리오(6개): ${JSON.stringify(data.recommendedData.map(d => ({s: d.symbol, v: d.aiVerdict, score: d.convictionScore, theme: d.sectorTheme})))}` : "분석 데이터 없음";
  
  const prompt = `[페르소나: 월가 최고의 헤지펀드 시니어 전략 분석가]
당신은 현재 선정된 6개 종목에 대해 포트폴리오 매니저에게 보고할 최종 통합 전략 리포트를 작성해야 합니다.

현지 시간: ${today}
대상 포트폴리오 자산: ${symbolsContext}

[보고서 작성 필수 지침]
1. 언어: 100% 한글로만 작성하십시오.
2. 태도: 확신에 찬 분석을 내놓으십시오.
3. 리포트 상단: "분석 기준일: ${today}"를 명시하십시오.
4. 분석 범위: 포트폴리오 내의 6개 종목 전체에 대해 상관관계 분석과 섹터 주도권 분석을 포함하십시오.
5. 리스크 관리: 종목별 진입/손절 전략뿐만 아니라 전체 포트폴리오 차원의 헷징 전략을 작성하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      }));
      return response.text || "분석 리포트 생성 실패";
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
      if (!res.ok) return "AUDIT_NODE_OFFLINE: 분석 서버 응답 없음";
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "데이터 수신 오류";
    }
    return "INVALID_PROVIDER";
  } catch (error: any) { return `AUDIT_NODE_FAILURE: ${error.message}`; }
}
