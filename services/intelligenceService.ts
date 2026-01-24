
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
    2. aiVerdict: A short catchy phrase (e.g., "기술적 반등 강력", "추세 추종 매수")
    3. investmentOutlook: Detailed 2-3 sentence investment perspective.
    4. selectionReasons: Array of 3 specific technical/fundamental reasons.
    5. convictionScore: Number between 0 and 100 representing confidence.
    6. theme: The primary market theme (e.g., "AI 인프라 확장", "금리 인하 수혜")
    7. aiSentiment: Concise summary of AI's sentiment towards the stock.
    8. analysisLogic: Professional explanation of the logic behind this specific selection.

    Return ONLY a valid JSON array matching the provided schema. No additional text.
    Dataset for context: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const result = await fetchWithRetry(async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: ALPHA_SCHEMA
            }
          });
          return response;
        });
        const parsed = sanitizeAndParseJson(result.text || "");
        return parsed ? { data: parsed } : { data: null, error: "GEMINI_PARSE_ERROR" };
      } catch (geminiErr: any) {
        const msg = geminiErr.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota")) {
          return { data: null, error: "GEMINI_QUOTA_EXCEEDED" };
        }
        throw geminiErr;
      }
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
      if (!res.ok) return { data: null, error: `PERPLEXITY_ERROR: ${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_NODE_FAILURE: ${error.message.substring(0, 100)}` };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  
  if (!apiKey) return `통신 오류: ${provider} API 키가 누락되었습니다.`;

  const prompt = provider === ApiProvider.PERPLEXITY
    ? `미국 주식 시장 리서치 리포트를 한국어로 작성하십시오.
       
       [분석 컨텍스트]
       - 현재 단계: Stage ${data.currentStage}
       - 분석 대상 종목: ${data.symbols ? data.symbols.join(", ") : "전체 섹터"}
       - 시스템 상태: ${JSON.stringify(data.apiStatuses.map((s:any) => s.provider + (s.isConnected ? ":Online" : ":Offline")))}
       
       [요청 사항]
       1. 현재 실시간 시장 변동 요인과 투자 심리를 요약하십시오.
       2. 분석 대상 종목의 최신 테마 연관성을 상세히 분석하십시오.
       3. 거시 경제적 관점에서 현재의 기회를 평가하십시오.`
    : `시스템 운영 및 시장 통합 진단 보고 (한국어): 
       Stage ${data.currentStage}, Symbols: ${data.symbols?.join(", ") || "None"}. 
       현재 시장 상황과 시스템 무결성을 보고하십시오.`;

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
            { role: "system", content: "당신은 월스트리트 수석 애널리스트입니다. 실시간 시장 상황을 검색하여 한국어로 리포트를 제공합니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!res.ok) return `리포트 생성 실패: ${res.status}`;
      const resData = await res.json();
      return resData.choices[0].message.content;
    }

    return "지원되지 않는 분석 엔진입니다.";
  } catch (e: any) {
    return `분석 오류: ${e.message.substring(0, 100)}`;
  }
}
