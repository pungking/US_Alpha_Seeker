
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING },
      aiVerdict: { type: Type.STRING },
      investmentOutlook: { type: Type.STRING },
      selectionReasons: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      convictionScore: { type: Type.NUMBER },
      theme: { type: Type.STRING },
      aiSentiment: { type: Type.STRING },
      analysisLogic: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment", "analysisLogic"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 3500): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("503") || errorMsg.includes("quota") || errorMsg.includes("overloaded");
    
    if (retries > 0 && isRetryable) {
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

  const prompt = `Analyze these 5 US stocks: ${candidates.map(c => c.symbol).join(", ")}.
    For each stock, provide a professional quant/ICT analysis in Korean:
    1. symbol: String (EXACT ticker symbol)
    2. aiVerdict: A short catchy phrase.
    3. investmentOutlook: Detailed 2-3 sentence investment perspective.
    4. selectionReasons: Array of 3 specific technical/fundamental reasons.
    5. convictionScore: Number between 0 and 100.
    6. theme: The primary market theme.
    7. aiSentiment: Concise summary of sentiment.
    8. analysisLogic: Professional explanation of the logic.

    Return ONLY a valid JSON array matching the provided schema. No additional text.
    Dataset for context: ${JSON.stringify(candidates)}`;

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "You are a world-class hedge fund quant analyst. You must strictly return ONLY a JSON array in the requested format, written in professional Korean." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `PPLX_ERR_${res.status}` };
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
  
  if (!apiKey) return `통신 오류: ${provider} API 키가 누락되었습니다.`;

  const symbolsList = data.symbols ? data.symbols.join(", ") : "전체 섹터";
  
  const prompt = `당신은 월스트리트의 수석 전략가이자 퀀트 감사관입니다. 
    현재 분석 대상 종목(${symbolsList})과 최신 시장 지표를 바탕으로 **최종 전략 보고서**를 한국어로 작성하십시오.
    
    [필수 포함 섹션 (Markdown 활용)]
    # 1. Macro Outlook & Sentiment Analysis
    - 현재 매크로(금리, 환율, 고용 등) 지표가 해당 종목들에 미치는 영향.
    - 공포/탐욕 지수 및 시장 심리 요약.
    
    # 2. Sector Dynamics & Theme Audit
    - ${symbolsList}이 속한 섹터의 자금 흐름(Smart Money Flow) 분석.
    - 현재 주도 테마와 해당 종목의 정렬 상태.
    
    # 3. Ticker Deep-Dive Strategy
    - 각 종목별 핵심 리스크와 기회 요인 표(Table)로 정리.
    - 기술적 지지/저항 및 ICT 오더블록(Order Block) 구간 명시.
    
    # 4. Final Alpha Action Plan
    - 통합 포트폴리오 비중 제안.
    - 구체적인 진입/탈출 및 리스크 관리 가이드.

    보고서는 전문적이고 권위 있는 어조로 작성하며, 표와 굵은 글씨를 활용하여 시인성을 높이십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
      }));
      return response.text;
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: "system", content: "당신은 월스트리트 수석 애널리스트입니다. 실시간 시장 상황을 검색하여 구조화된 Markdown 리포트를 제공합니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      const resData = await res.json();
      return resData.choices[0].message.content;
    }
    return "지원되지 않는 분석 엔진입니다.";
  } catch (e: any) {
    return `분석 오류: ${e.message}`;
  }
}
