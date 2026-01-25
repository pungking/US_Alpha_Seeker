
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY' or 'ALPHA_TIER_1'" },
      investmentOutlook: { type: Type.STRING, description: "Deep qualitative investment outlook in Korean" },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific technical or fundamental reasons in Korean"
      },
      convictionScore: { type: Type.NUMBER, description: "Numerical conviction score from 0 to 100" },
      expectedReturn: { type: Type.STRING, description: "Expected performance/return rate (e.g., '+25% ~ +35%')" },
      theme: { type: Type.STRING, description: "Current market theme or narrative for this stock" },
      aiSentiment: { type: Type.STRING, description: "Brief sentiment summary in Korean" },
      analysisLogic: { type: Type.STRING, description: "Internal logic for this selection in Korean" }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 4, delay = 8000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    // 429, 503, quota, limit, exhausted 등의 키워드 확인
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("overloaded") || errorMsg.includes("exhausted");
    
    if (retries > 0 && isRetryable) {
      console.warn(`Quota hit. Retrying in ${delay/1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2); // 지수 백오프
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const contextData = candidates.map(c => ({
    symbol: c.symbol,
    price: c.price,
    quantAlpha: c.compositeAlpha,
    sector: c.sector
  }));

  const prompt = `주식 분석 전문가로서 다음 12개 후보 중 가장 유망한 6개 종목을 선정해 주세요.
데이터: ${JSON.stringify(contextData)}

각 종목에 대해 한국어로 다음 항목을 포함한 JSON 배열을 출력하세요:
- symbol, aiVerdict, investmentOutlook, selectionReasons(배열), convictionScore(숫자), expectedReturn, theme, aiSentiment, analysisLogic.`;

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
            { role: "system", content: "당신은 금융 분석가입니다. 반드시 한국어로 된 JSON 배열만 응답하세요." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
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
  
  if (!apiKey) return "API 키가 누락되었습니다.";

  const prompt = `미국 주식 시장 전략 감사 보고서 작성 (한글 마크다운 형식):
현재 스테이지: ${data.currentStage}
선정된 종목: ${data.symbols ? data.symbols.join(", ") : "시스템 스캔 중"}
전문적인 톤으로 현재 시장 상황과 필터링 전략의 유효성을 분석하세요.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
      });
      return response.text;
    } else {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "당신은 월스트리트 전략가입니다. 한글 마크다운 보고서를 작성하세요." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices[0].message.content;
    }
  } catch (e: any) {
    console.error("Audit Error:", e);
    return `보고서 생성 실패: API 호출 한도 초과 혹은 네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요. (오류내용: ${e.message})`;
  }
}
