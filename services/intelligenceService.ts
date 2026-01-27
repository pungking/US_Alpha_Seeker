
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar', 'sonar-reasoning'];

// Shared field list to ensure consistency across providers
const ALPHA_FIELDS = [
  "symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", 
  "selectionReasons", "convictionScore", "expectedReturn", "theme", 
  "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", 
  "resistanceLevel", "stopLoss", "riskRewardRatio"
];

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING },
      aiVerdict: { type: Type.STRING },
      marketCapClass: { type: Type.STRING },
      sectorTheme: { type: Type.STRING },
      investmentOutlook: { type: Type.STRING, description: "Markdown format. [CRITICAL]: Analyze ONLY this specific stock. DO NOT write a portfolio summary." },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
      convictionScore: { type: Type.NUMBER },
      expectedReturn: { type: Type.STRING },
      theme: { type: Type.STRING },
      aiSentiment: { type: Type.STRING },
      analysisLogic: { type: Type.STRING },
      chartPattern: { type: Type.STRING },
      supportLevel: { type: Type.NUMBER },
      resistanceLevel: { type: Type.NUMBER },
      stopLoss: { type: Type.NUMBER },
      riskRewardRatio: { type: Type.STRING }
    },
    required: ALPHA_FIELDS
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simulationPeriod: { type: Type.STRING },
    equityCurve: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING },
          value: { type: Type.NUMBER }
        },
        required: ["period", "value"]
      }
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        winRate: { type: Type.STRING },
        profitFactor: { type: Type.STRING },
        maxDrawdown: { type: Type.STRING },
        sharpeRatio: { type: Type.STRING }
      },
      required: ["winRate", "profitFactor", "maxDrawdown", "sharpeRatio"]
    },
    historicalContext: { type: Type.STRING }
  },
  required: ["simulationPeriod", "equityCurve", "metrics", "historicalContext"]
};

function sanitizeAndParseJson(text: string): any | null {
  if (!text) return null;
  try {
    let cleanText = text.trim().replace(/```json/g, "").replace(/```/g, "");
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');
    if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    if (firstCurly !== -1) return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
    return JSON.parse(cleanText);
  } catch (e) { return null; }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 3000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    if (retries > 0) { await new Promise(r => setTimeout(r, delay)); return fetchWithRetry(fn, retries - 1, delay * 2); }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `[월가 퀀트 전략가 모드]
대상: ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

지침:
1. 가장 유망한 6개를 선정하십시오.
2. 각 종목에 대해 다음 JSON 필드를 포함한 배열로 응답하세요:
${ALPHA_FIELDS.join(", ")}
3. investmentOutlook은 해당 종목의 "개별 호재와 기술적 타점"에만 집중하십시오. 전체 요약은 금지합니다.
4. 한국어로 작성하고 반드시 유효한 JSON 배열만 반환하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
      }));
      const parsed = sanitizeAndParseJson(result.text);
      return { data: Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []) };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      for (const model of PERPLEXITY_MODELS) {
        try {
          const res = await fetch('/api/perplexity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ 
              model, 
              messages: [
                { role: "system", content: `당신은 퀀트 분석가입니다. 반드시 다음 필드를 포함한 JSON 배열 형식으로만 응답하세요: ${ALPHA_FIELDS.join(", ")}` }, 
                { role: "user", content: prompt }
              ], 
              temperature: 0.1 
            })
          });
          if (res.ok) {
            const json = await res.json();
            const parsed = sanitizeAndParseJson(json.choices?.[0]?.message?.content);
            return { data: Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []) };
          }
        } catch (e) {}
      }
    }
    return { data: null, error: "ANALYSIS_FAILED" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `[백테스트 시뮬레이터] 종목 ${stock.symbol}에 대한 24개월 시뮬레이션 결과(누적 수익률, 차트 데이터, 분석 리포트)를 JSON으로 생성하십시오.`;

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
    return { data: null, error: "NOT_SUPPORTED" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[];
  recommendedData?: any[] | null;
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "API_KEY_MISSING";

  const context = data.recommendedData ? `포트폴리오: ${JSON.stringify(data.recommendedData.map(d => ({s: d.symbol, verdict: d.aiVerdict})))}` : "데이터 없음";
  const prompt = `[월가 시니어 전략가] 다음 포트폴리오를 종합 분석하여 시장 주도권, 상관관계, 헷징 전략을 Markdown으로 상세히 작성하십시오: ${context}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt }));
      return response.text || "분석 실패";
    }
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('/api/perplexity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt }] })
      });
      const json = await res.json();
      return json.choices?.[0]?.message?.content || "분석 실패";
    }
    return "INVALID_PROVIDER";
  } catch (error: any) { return `ERROR: ${error.message}`; }
}
