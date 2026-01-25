
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Professional perspective in Korean Markdown" },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3-4 reasons in Korean" },
      convictionScore: { type: Type.NUMBER, description: "0.0 to 100.0" },
      expectedReturn: { type: Type.STRING, description: "Target return e.g. +20%" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Sentiment report in Korean" },
      analysisLogic: { type: Type.STRING, description: "Neural logic in Korean" },
      // 차트 분석 관련 추가 필드
      chartPattern: { type: Type.STRING, description: "Detected technical pattern (e.g. Fibonacci 0.618 Support, Cup and Handle, Bull Flag)" },
      supportLevel: { type: Type.NUMBER, description: "Key support/entry price level based on chart" },
      resistanceLevel: { type: Type.NUMBER, description: "Key resistance/target price level based on chart" },
      riskRewardRatio: { type: Type.STRING, description: "Calculated Risk-to-Reward ratio (e.g. 1:3.2)" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "riskRewardRatio"]
  }
};

/**
 * AI의 응답 텍스트에서 순수 JSON 배열만 추출하는 강화된 파서
 */
function sanitizeAndParseJson(text: string): any[] | null {
  if (!text) return null;
  try {
    // 1. 마크다운 코드 블록 제거 및 제어 문자 청소
    let cleanText = text.trim()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // 제어 문자 제거

    // 2. 가장 바깥쪽 [ ] 찾기
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');

    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }
    
    // 3. 바로 파싱 시도 (단순 배열일 경우)
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Text:", text.substring(0, 100));
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 5000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (retries > 0 && (msg.includes("429") || msg.includes("quota") || msg.includes("limit"))) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string, code?: number}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // 프롬프트 가이드라인 강화: 차트 패턴 및 타점 분석 요청 추가
  const prompt = `당신은 전설적인 월가 퀀트 헤지펀드 매니저이자 기술적 분석의 대가입니다. [오늘 날짜: ${today}]
엄선된 12개 후보 종목: ${JSON.stringify(candidates.map(c => ({s: c.symbol, p: c.price, score: c.compositeAlpha})))}.

이 중 시장 주도력이 가장 강력한 6개 종목을 최종 선정하여 정밀 분석 보고서를 작성하세요.
특히 피보나치 되돌림(0.382/0.618), 플래그, 헤드앤솔더, 컵앤핸들 등의 패턴을 분석하여 지지/저항 및 손익비를 명시하십시오.
반드시 아래 형식을 엄수하여 JSON 배열만 응답하십시오. 다른 설명이나 텍스트는 절대 금지합니다.

JSON Schema Rule:
- 각 객체는 symbol, aiVerdict, marketCapClass, sectorTheme, investmentOutlook, selectionReasons, convictionScore, expectedReturn, theme, aiSentiment, analysisLogic, chartPattern, supportLevel, resistanceLevel, riskRewardRatio를 포함해야 합니다.
- 모든 텍스트 설명은 한국어로 작성하며, 날짜 기준은 반드시 오늘(${today})이어야 합니다.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
      }));
      const parsed = sanitizeAndParseJson(result.text);
      return parsed ? { data: parsed } : { data: null, error: "PARSE_ERROR" };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: `당신은 ${today} 기준의 한국어 금융 분석 리포트를 작성하는 AI 에이전트입니다. 차트 패턴 분석(피보나치, 컵앤핸들 등)과 손익비를 반드시 포함하며, 반드시 JSON 코드 블록 하나만 출력하십시오.` },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `HTTP_${res.status}`, code: res.status };
      const data = await res.json();
      const rawResponse = data.choices?.[0]?.message?.content;
      const parsed = sanitizeAndParseJson(rawResponse);
      return parsed ? { data: parsed } : { data: null, error: "PARSE_ERROR" };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    const isQuota = error.message?.includes("429") || error.message?.includes("quota");
    return { data: null, error: error.message, code: isQuota ? 429 : 500 };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  
  const prompt = `[분석 요청 시점: ${today}]
당신은 US_Alpha_Seeker 시스템의 최종 감사관(Chief Auditor)입니다.

현재 파이프라인 데이터:
- 현재 스테이지: ${data.currentStage}
- 최종 선정 종목: ${data.symbols ? data.symbols.join(", ") : "스캐닝 중"}
- 분석 엔진 정보: ${provider} (이 리포트를 작성 중인 감사 엔진)

미션:
1. 보고서 최상단에 "전략 감사 보고서 - ${today}"를 명시하십시오.
2. 6단계에서 분석된 차트 패턴(피보나치, 컵앤핸들 등)과 손익비의 타당성을 시장 매크로 상황과 대조하여 비판적으로 검토하십시오.
3. 모든 내용은 한국어 마크다운으로 전문적이고 권위 있게 작성하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
      }));
      return response.text;
    } else {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: `당신은 ${today} 기준의 시장 상황을 분석하여 6단계 결과를 교차 검증하는 수석 전략 감사관입니다.` },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        })
      });
      const result = await res.json();
      return result.choices?.[0]?.message?.content || "보고서 생성 실패";
    }
  } catch (e: any) { return `감사 보고서 생성 중 오류 발생: ${e.message}`; }
}
