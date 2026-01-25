
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
        description: "Professional investment perspective in Markdown format. Use bold text for key catalysts. Min 4 sentences. Must be in Korean." 
      },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "3-4 specific dimensions. MUST include price levels (e.g. OB at $120) or institutional data in Korean."
      },
      convictionScore: { type: Type.NUMBER, description: "Conviction index from 0.0 to 100.0." },
      expectedReturn: { type: Type.STRING, description: "Target performance (e.g., '+28.5%')" },
      theme: { type: Type.STRING, description: "Current market narrative" },
      aiSentiment: { 
        type: Type.STRING, 
        description: "Detailed unique sentiment report. Analyze institutional flow specifically for THIS symbol in Korean. NO REPEATING TEXT." 
      },
      analysisLogic: { 
        type: Type.STRING, 
        description: "Unique neural synthesis logic explaining why THIS stock was prioritized in Korean. NO STATIC TEXT." 
      }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic"]
  }
};

/**
 * 텍스트에서 JSON 배열을 안전하게 추출하고 파싱하는 초강력 샌니타이저
 */
function sanitizeAndParseJson(text: string): any[] | null {
  if (!text) return null;
  try {
    let cleanText = text.trim();
    
    // 1. 마크다운 코드 블록 제거
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // 2. 가장 바깥쪽 대괄호([ ]) 구간 추출 (배열 형태 우선)
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }
    
    // 3. 배열이 없는 경우 일반 파싱 시도
    const directParse = JSON.parse(cleanText);
    return Array.isArray(directParse) ? directParse : [directParse];
  } catch (e) {
    console.error("[Alpha_Logic] Failed to parse AI Response. raw text snippet:", text.substring(0, 100));
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 5, delay = 12000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("exhausted") || errorMsg.includes("overloaded");
    
    if (retries > 0 && isRetryable) {
      console.warn(`[Alpha_Seeker] Quota hit. Retrying in ${delay/1000}s... (${retries} left)`);
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
    quantAlpha: c.compositeAlpha,
    ictPotential: c.ictScore,
    sector: c.sector
  }));

  const prompt = `당신은 월스트리트 수석 퀀트 전략가입니다. 
제시된 12개 후보 중 가장 승산이 높은 6개 종목을 엄선하여 리포트를 작성하십시오.

데이터 컨텍스트: ${JSON.stringify(contextData)}

필독 지침:
1. **우선순위(Conviction Score)** 내림차순으로 6개를 선정하십시오.
2. **Investment Perspective**: 마크다운을 사용하십시오. 핵심 촉매제는 **볼드** 처리하십시오. 종목의 고유한 경제적 해자와 실적 가속화 요인을 전문적으로 기술하십시오.
3. **Sentiment & Logic**: 모든 종목에 동일한 문구를 반복하지 마십시오. 각 종목의 13F 기관 매집(예: 블랙록 가세), 옵션 흐름, ICT 오더블럭(예: $150 지지) 등 '구체적인 수치와 고유 근거'를 개별적으로 작성해야 합니다.
4. 반드시 유효한 JSON 배열 형식으로만 응답하십시오. 다른 설명은 생략하십시오.`;

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
      return parsed ? { data: parsed } : { data: null, error: "GEMINI_PARSE_ERROR" };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${apiKey}` 
        },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "당신은 세계 최고의 금융 분석가입니다. 반드시 한국어로 된 정교한 JSON 배열만 응답하십시오. 서론과 결론은 절대 생략하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return { data: null, error: `PPLX_HTTP_ERROR_${res.status}: ${errText.substring(0, 50)}` };
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return { data: null, error: "PPLX_EMPTY_RESPONSE" };

      const parsed = sanitizeAndParseJson(content);
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
  
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const prompt = `US_Alpha_Seeker 전략 감사 보고서 (한국어 마크다운):
스테이지: ${data.currentStage}
선정 종목: ${data.symbols ? data.symbols.join(", ") : "시스템 스캐닝"}

현재 매크로 국면과 필터링된 종목들의 전략적 가치를 수석 전략가 관점에서 비판적으로 감사하십시오.`;

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
            { role: "system", content: "당신은 월스트리트 전략가입니다. 전문적인 한국어 마크다운 리포트를 작성하십시오." },
            { role: "user", content: prompt }
          ]
        })
      });
      
      if (!res.ok) return `감사 보고서 생성 실패 (HTTP ${res.status})`;
      
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 응답이 비어있습니다.";
    }
  } catch (e: any) {
    return `보고서 노드 지연: API 쿼터 또는 네트워크 이슈가 감지되었습니다. (이유: ${e.message})`;
  }
}
