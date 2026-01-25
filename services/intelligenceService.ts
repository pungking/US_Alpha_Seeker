
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
      investmentOutlook: { type: Type.STRING, description: "Deep qualitative investment outlook in Korean (at least 2-3 sentences)" },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific technical or fundamental reasons in Korean"
      },
      convictionScore: { type: Type.NUMBER, description: "Numerical conviction score from 0 to 100" },
      theme: { type: Type.STRING, description: "Current market theme or narrative for this stock" },
      aiSentiment: { type: Type.STRING, description: "Brief sentiment summary in Korean" },
      analysisLogic: { type: Type.STRING, description: "Internal logic for this selection in Korean" }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    // Remove markdown code blocks if present
    cleanText = cleanText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 5000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    if (retries > 0 && (errorMsg.includes("429") || errorMsg.includes("quota"))) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 1.5);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  // AI에게 전달할 데이터 최적화
  const contextData = candidates.map(c => ({
    symbol: c.symbol,
    price: c.price,
    compositeAlpha: c.compositeAlpha,
    sector: c.sector
  }));

  const prompt = `당신은 월스트리트 헤지펀드의 수석 퀀트 분석가입니다. 
분석 대상 종목: ${candidates.map(c => c.symbol).join(", ")}
데이터 컨텍스트: ${JSON.stringify(contextData)}

각 종목에 대해 다음 지침을 엄격히 준수하여 한국어 분석을 수행하십시오:
1. 투자 전망(investmentOutlook)은 해당 종목의 미래 가치를 최소 2문장 이상의 전문적인 한국어로 서술하십시오.
2. 선정 이유(selectionReasons)는 퀀트 점수, ICT(FVG, OrderBlock), 기술적 지표를 기반으로 3개 이상의 구체적인 항목을 제공하십시오.
3. 모든 텍스트는 한국어로 작성하되, 전문 금융 용어는 유지하십시오.
4. 반드시 유효한 JSON 배열 형식으로만 응답하십시오.`;

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
            { role: "system", content: "You are a world-class financial analyst. Output ONLY a JSON array in Korean based on the provided schema." },
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
  
  if (!apiKey) return "API key missing.";

  const prompt = `US_Alpha_Seeker 시스템 상태 진단:
스테이지: ${data.currentStage}
분석 종목: ${data.symbols ? data.symbols.join(", ") : "전체"}
이 데이터를 기반으로 현재 시장 상황과 전략적 제언을 마크다운 형식의 한글 리포트로 작성하십시오.`;

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
    });
    return response.text;
  } catch (e: any) {
    return `Audit failed: ${e.message}`;
  }
}
