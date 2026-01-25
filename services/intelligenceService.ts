
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
      investmentOutlook: { type: Type.STRING, description: "Extremely detailed professional investment perspective in Korean (min 3 sentences)" },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 professional bullish dimensions including ICT footprint and fundamental catalysts"
      },
      convictionScore: { type: Type.NUMBER, description: "Conviction index from 0 to 100 based on macro/micro alignment" },
      expectedReturn: { type: Type.STRING, description: "Target performance range (e.g., '+22.5% ~ +35.0%')" },
      theme: { type: Type.STRING, description: "Dominant market narrative" },
      aiSentiment: { type: Type.STRING, description: "Detailed sentiment report (e.g., 'Positive institutional flow detected with low retail exhaustion')" },
      analysisLogic: { type: Type.STRING, description: "The internal neural logic for selection in Korean" }
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 5, delay = 10000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("exhausted");
    
    if (retries > 0 && isRetryable) {
      console.warn(`[Alpha_Seeker] Quota limit hit. Retrying in ${delay/1000}s...`);
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

  const contextData = candidates.map(c => ({
    symbol: c.symbol,
    price: c.price,
    quantScore: c.compositeAlpha,
    sector: c.sector,
    ictPotential: c.ictScore
  }));

  const prompt = `당신은 월스트리트 헤지펀드의 수석 전략 분석가입니다. 
제시된 12개 후보 중 기술적/기본적/수급적으로 가장 완벽한 6개를 엄선하여 투자 리포트를 작성하십시오.

데이터 컨텍스트: ${JSON.stringify(contextData)}

보고서 필수 지침:
1. 투자 전망(investmentOutlook)은 해당 기업의 시장 지배력, 해자(Moat), 향후 실적 가속화 요인을 포함하여 매우 상세히 한국어로 작성하십시오.
2. 선정 이유(selectionReasons)는 ICT 관점의 오더블럭, FVG, 기관 수급 패턴을 포함하여 3가지 이상 제시하십시오.
3. 모든 수치는 전문가 수준의 정밀도를 유지하십시오.
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
            { role: "system", content: "당신은 세계 최고의 금융 분석가입니다. 한글로 된 매우 상세한 투자 리포트 JSON 배열을 출력하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
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
  
  if (!apiKey) return "인텔리전스 노드 연결 오류.";

  const prompt = `US_Alpha_Seeker 전략 감사 보고서:
스테이지: ${data.currentStage}
분석 종목: ${data.symbols ? data.symbols.join(", ") : "시스템 스캐닝"}

현재 시장의 매크로 국면과 필터링된 종목들의 알파 창출 잠재력을 수석 전략가의 관점에서 한국어 마크다운 리포트로 작성하십시오. 쿼터 제한을 고려하여 핵심 위주로 명확하게 서술하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      // 감사 리포트의 경우 429 방지를 위해 Flash 모델을 사용하며 더 긴 쿨다운 적용
      const response = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
        });
      }, 3, 15000); 
      return response.text;
    } else {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "전문적인 금융 리포트를 작성하는 전략가입니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices[0].message.content;
    }
  } catch (e: any) {
    return `보고서 생성 지연: 제미나이 API 쿼터가 일시적으로 소진되었습니다. 약 1분 후 다시 시도해 주십시오. (이유: ${e.message})`;
  }
}
