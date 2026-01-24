
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
      aiSentiment: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment"]
  }
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
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

  // 명확한 필드명과 한국어 답변을 위해 프롬프트 정교화
  const prompt = `Analyze these 5 US stocks: ${candidates.map(c => c.symbol).join(", ")}.
    For each stock, provide:
    1. symbol: String
    2. aiVerdict: Short sentiment (e.g., "Strong Alpha", "Recovery Expected")
    3. investmentOutlook: Detailed 2-3 sentence analysis in Korean.
    4. selectionReasons: Array of 3 specific technical/fundamental reasons in Korean.
    5. convictionScore: A number from 0 to 100.
    6. theme: The primary market theme (e.g., "AI Infrastructure", "Energy Rotation") in Korean.
    7. aiSentiment: A concise sentiment summary in Korean.

    Return ONLY a valid JSON array matching the schema. Dataset: ${JSON.stringify(candidates)}`;

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
            { role: "system", content: "당신은 세계적인 헤지펀드 퀀트 전략가입니다. 실시간 시장 데이터를 검색하여 한국어로 전문적인 JSON 리포트를 작성합니다. 지정된 키값(symbol, aiVerdict, investmentOutlook, selectionReasons, convictionScore, theme, aiSentiment)을 엄격히 준수하십시오." },
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

  // Auditor 프롬프트에 브레인의 분석 내용(brainResults)을 포함시켜 교차 검증 유도
  const brainSummary = data.brainResults ? 
    data.brainResults.map((r:any) => `${r.symbol}: ${r.aiVerdict} (${r.theme})`).join(", ") : 
    "아직 확정된 종목이 없습니다.";

  const prompt = provider === ApiProvider.PERPLEXITY
    ? `금융 전략 감사관으로서 다음 데이터를 기반으로 실시간 시장 리포트를 한국어로 작성하십시오.
       
       [분석 컨텍스트]
       - 현재 스테이지: Stage ${data.currentStage} (Alpha Finalization)
       - 브레인 분석 결과 (Sync Data): ${brainSummary}
       - 시스템 상태: ${JSON.stringify(data.apiStatuses.map((s:any) => s.provider + (s.isConnected ? ":Online" : ":Offline")))}
       
       [요청 사항]
       1. 위 종목들(${data.symbols?.join(", ") || "전체"})에 대한 실시간 시장 뉴스 및 테마 적합성을 검색하여 보고하십시오.
       2. 브레인의 분석 논리가 현재 실시간 시장 흐름과 일치하는지 비판적으로 감사하십시오.
       3. 투자자에게 유용한 거시 경제적 관점을 추가하십시오.
       4. 전문적인 시장 리서치 보고서 형식으로 답변하십시오.`
    : `시스템 운영 및 전략 통합 진단: 
       Stage ${data.currentStage}, 브레인 요약: ${brainSummary}. 
       현재 시장 상황과 분석 일관성을 한국어로 보고하십시오.`;

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
            { role: "system", content: "당신은 월스트리트 수석 마켓 애널리스트이자 시스템 감사관입니다. 실시간 시장 상황을 검색하여 분석 엔진의 결과가 타당한지 검증하고 리포트합니다." },
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
