
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 6000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("overloaded") || errorMsg.includes("exhausted");
    
    if (retries > 0 && isRetryable) {
      console.log(`Retrying API call... (${retries} left)`);
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

  // AI에게 더 많은 후보군(12개)을 주고 그 중 6개를 고르게 함
  const contextData = candidates.map(c => ({
    symbol: c.symbol,
    price: c.price,
    quantAlpha: c.compositeAlpha,
    sector: c.sector,
    techScore: c.technicalScore
  }));

  const prompt = `당신은 세계 최고의 헤지펀드 전략가입니다.
제시된 12개의 유망 후보군 중에서 데이터와 시장 흐름을 고려하여 가장 승산이 높은 '최적의 6개 종목'을 직접 선정하고 분석 리포트를 작성하십시오.

후보군 데이터: ${JSON.stringify(contextData)}

지침:
1. 반드시 위 목록에서 6개 종목만 엄선하십시오. (AI의 안목을 반영)
2. 투자 전망(investmentOutlook)은 최소 2문장 이상의 전문적인 한국어로 서술하십시오.
3. 기대 수익률(expectedReturn)은 향후 성과율 전망을 백분율로 제시하십시오.
4. 모든 응답은 한국어여야 하며 전문 금융 용어를 유지하십시오.
5. 반드시 유효한 JSON 배열 형식으로만 응답하십시오.`;

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
            { role: "system", content: "You are a world-class financial analyst. Output ONLY a JSON array of 6 selected stocks in Korean based on the schema." },
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
  
  if (!apiKey) return "인프라 노드 설정이 필요합니다.";

  const prompt = `US_Alpha_Seeker 시스템 전략 감사 리포트:
스테이지: ${data.currentStage}
최종 분석 대상: ${data.symbols ? data.symbols.join(", ") : "전체 시스템"}

위 정보를 바탕으로 현재 시장 국면에 대한 거시적 분석과 개별 종목들의 알파 창출 전략을 수석 분석가의 관점에서 마크다운 형식의 한글 리포트로 작성하십시오. 전문적이고 권위 있는 어조를 사용하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      // 쿼터 에러 방지를 위해 Auditor 리포트는 Flash 모델 사용 (속도 및 안정성 우수)
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
            { role: "system", content: "당신은 월스트리트의 수석 전략가입니다. 전문적인 마크다운 형식의 한글 리포트를 작성하십시오." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices[0].message.content;
    }
  } catch (e: any) {
    return `Audit failed: 인텔리전스 노드 부하로 인해 리포트 생성에 실패했습니다. (사유: ${e.message})`;
  }
}
