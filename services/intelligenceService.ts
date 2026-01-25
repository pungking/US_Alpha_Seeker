
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
        description: "Detailed unique sentiment report for THIS symbol in Korean." 
      },
      analysisLogic: { 
        type: Type.STRING, 
        description: "Unique neural synthesis logic explaining why THIS stock was prioritized in Korean." 
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
    
    // 1. 마크다운 코드 블록 제거 및 보이지 않는 제어 문자 제거
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    // JSON 파싱을 방해하는 줄바꿈/탭 문자 정규화 (문자열 내부 제외)
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    // 2. 가장 바깥쪽 대괄호([ ]) 구간 추출
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }
    
    // 3. 배열이 없는 경우 직접 시도
    const directParse = JSON.parse(cleanText);
    return Array.isArray(directParse) ? directParse : [directParse];
  } catch (e) {
    console.error("[Alpha_Logic] Critical Parse Error. text preview:", text.substring(0, 150));
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 5, delay = 12000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit") || errorMsg.includes("overloaded");
    
    if (retries > 0 && isRetryable) {
      console.warn(`[Alpha_Seeker] API Limit hit. Retrying in ${delay/1000}s...`);
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

  // Perplexity가 구조를 알 수 있도록 스키마 설명을 포함한 프롬프트 구성
  const schemaInstruction = `
  응답은 반드시 아래 키를 가진 JSON 배열(Array) 형태여야 합니다:
  - symbol: 티커명
  - aiVerdict: 'STRONG_BUY' 등 한 단어 판단
  - investmentOutlook: 한글 마크다운 기반의 상세 투자 전망 (4문장 이상, 중요 단어 볼드처리)
  - selectionReasons: [한글 이유1, 이유2, 이유3] (가격대 수치 포함 필수)
  - convictionScore: 0~100 사이 숫자 (높을수록 순위 상승)
  - expectedReturn: 예상 수익률 (예: '+28.5%')
  - theme: 주도 테마명
  - aiSentiment: 이 종목만의 고유한 수급/심리 분석 (한글)
  - analysisLogic: 이 종목이 선정된 개별적 신경망 논리 (한글)
  
  주의: 모든 문자열 내부의 큰따옴표(")는 반드시 백슬래시(\")로 이스케이프하거나 작은따옴표(')를 사용하십시오.
  `;

  const prompt = `당신은 월스트리트 수석 퀀트 전략가입니다. 
다음 12개 후보 중 가장 유망한 6개 종목을 엄선하여 리포트를 작성하십시오.

데이터: ${JSON.stringify(contextData)}

지침:
${schemaInstruction}
1. **convictionScore**가 높은 순서대로 6개를 선정하십시오.
2. 모든 종목의 내용(Sentiment, Logic)은 서로 다르고 구체적이어야 합니다.
3. 오직 JSON 배열만 출력하십시오. 부연 설명은 절대 금지합니다.`;

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
            { role: "system", content: "당신은 한국어로 정교한 금융 리포트를 작성하는 JSON 생성 봇입니다. 서론과 결론 없이 순수 JSON 배열만 출력하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) {
        return { data: null, error: `PPLX_HTTP_${res.status}` };
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return { data: null, error: "PPLX_EMPTY" };

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
            { role: "system", content: "금융 전략가로서 전문적인 한국어 마크다운 리포트를 작성하십시오." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 생성 실패";
    }
  } catch (e: any) {
    return `보고서 노드 지연: ${e.message}`;
  }
}
