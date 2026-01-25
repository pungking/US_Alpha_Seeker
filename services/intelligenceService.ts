
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
      marketCapClass: { type: Type.STRING, description: "Market size category: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific investment theme or sector focus (e.g., 'Generative AI Infrastructure')" },
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
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic"]
  }
};

/**
 * 텍스트에서 JSON 배열을 안전하게 추출하고 파싱하는 초강력 샌니타이저
 */
function sanitizeAndParseJson(text: string): any[] | null {
  if (!text) return null;
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");

    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }
    
    const directParse = JSON.parse(cleanText);
    return Array.isArray(directParse) ? directParse : [directParse];
  } catch (e) {
    console.error("[Alpha_Logic] Parse Failure:", e);
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

  const schemaInstruction = `
  응답은 반드시 아래 키를 가진 JSON 배열(Array) 형태여야 합니다:
  - symbol: 티커명
  - aiVerdict: 판단 (예: STRONG_BUY)
  - marketCapClass: 'LARGE', 'MID', 'SMALL' 중 택 1
  - sectorTheme: 상세 투자 테마 (예: 'AI 반도체 인프라', '바이오테크 혁신' 등)
  - investmentOutlook: 한글 마크다운 투자 전망 (핵심 단어 볼드)
  - selectionReasons: [한글 이유1, 이유2, 이유3] (가격 수치 필수)
  - convictionScore: 0~100 숫자
  - expectedReturn: 예상 수익률
  - theme: 시장 내러티브
  - aiSentiment: 종목 고유 수급 분석 (한글)
  - analysisLogic: 선정 신경망 논리 (한글)
  
  주의: JSON 문법을 완벽히 준수하고 큰따옴표 이스케이프(\")를 철저히 하십시오.
  `;

  const prompt = `당신은 월스트리트 최고의 매크로-퀀트 헤지펀드 매니저입니다. 
현재 시장의 VIX 변동성 수준, 금리 환경, 섹터 로테이션 및 대/중/소형주별 리스크 프리미엄을 종합적으로 고려하여 
다음 12개 후보 중 가장 강력한 'Alpha'를 창출할 6개 종목을 최종 엄선하십시오.

입력 데이터: ${JSON.stringify(contextData)}

최종 선정 기준:
1. 매크로 정합성: VIX가 높다면 방어적 대형주, 낮다면 공격적 소형주 비중을 조절하십시오.
2. 테마 집중도: 현재 주도 테마에 부합하는지 확인하십시오.
3. 데이터 융합: 퀀트 점수와 ICT 오더블럭 지표가 일치하는 종목을 최우선하십시오.

${schemaInstruction}
오직 JSON 배열만 출력하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
        // 프리 티어에서 Pro 모델 할당량 문제(limit: 0) 회피를 위해 Flash 모델 사용 고려 (또는 Pro-Preview 명시)
        // 사용자가 보고서는 된다고 한 것으로 보아 Flash는 정상 작동 중임.
        return await ai.models.generateContent({
          model: 'gemini-3-flash-preview', 
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
            { role: "system", content: "당신은 매크로-퀀트 전략가입니다. 정교한 한국어 JSON 배열 리포트만 출력하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) return { data: null, error: `PPLX_HTTP_${res.status}` };

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

현재 VIX, 금리, 달러 인덱스 등 매크로 지표를 고려하여 위 종목들의 선정 타당성을 수석 전략가 관점에서 비판적으로 감사하십시오.`;

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
            { role: "system", content: "금융 전략가로서 매크로 기반 한국어 감사 보고서를 작성하십시오." },
            { role: "user", content: prompt }
          ]
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "감사 보고서 생성 실패";
    }
  } catch (e: any) {
    return `보고서 노드 지연: ${e.message}`;
  }
}
