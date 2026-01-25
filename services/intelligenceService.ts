
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
      investmentOutlook: { 
        type: Type.STRING, 
        description: "Professional investment perspective in Markdown format. Use bold text for key catalysts, and ensure at least 4-5 sentences explaining the moat and growth acceleration. Must be in Korean." 
      },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific bullish dimensions. MUST include actual price levels (e.g. Orderblock at $120) or specific institutional names (e.g. 13F shows Citadel adding) in Korean."
      },
      convictionScore: { type: Type.NUMBER, description: "Conviction index from 0 to 100. Higher means higher priority." },
      expectedReturn: { type: Type.STRING, description: "Specific target percentage (e.g., '+28.5%')" },
      theme: { type: Type.STRING, description: "Current market narrative (e.g., AI Infrastructure Boom)" },
      aiSentiment: { 
        type: Type.STRING, 
        description: "Detailed sentiment report unique to this stock. Analyze institutional vs retail flow in Korean. NO STATIC TEXT." 
      },
      analysisLogic: { 
        type: Type.STRING, 
        description: "The unique neural logic for why this stock was prioritized over others in the context of the pipeline results in Korean. NO STATIC TEXT." 
      }
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 5, delay = 12000): Promise<any> {
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
    ictScore: c.ictScore
  }));

  const prompt = `당신은 세계 최고의 헤지펀드 전략 분석가입니다. 
제시된 12개 후보 중 가장 승산이 높은 6개 종목을 엄선하여 **우선순위(Conviction Score 내림차순)**에 따라 리포트를 작성하십시오.

데이터 컨텍스트: ${JSON.stringify(contextData)}

리포트 작성 지침:
1. **Investment Perspective**: 마크다운을 사용하여 가시성을 높이십시오. 핵심 촉매제는 **볼드** 처리하고, 기업의 해자와 성과 가속화 요인을 전문적으로 기술하십시오.
2. **Selection Reasons**: ICT 오더블럭 수치, FVG 구간, 혹은 13F 기관 매집 동향 등 '구체적인 수치와 이름'을 포함한 3-4가지 Dimension을 제시하십시오.
3. **Sentiment & Logic**: 모든 종목에 대해 동일한 문구를 반복하지 마십시오. 각 종목의 고유한 수급 데이터와 선정 논리를 서술해야 합니다.
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
            { role: "system", content: "당신은 월스트리트 수석 분석가입니다. 종목별로 완전히 차별화된 심층 투자 리포트를 JSON 배열로 출력하십시오." },
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

현재 시장의 매크로 국면과 선정된 종목들의 전략적 가치를 수석 전략가의 관점에서 한국어 마크다운 리포트로 작성하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
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
            { role: "system", content: "전문적인 금융 보고서를 작성하는 전략가입니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices[0].message.content;
    }
  } catch (e: any) {
    return `보고서 생성 지연: API 쿼터 소진. (사유: ${e.message})`;
  }
}
