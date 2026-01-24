
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

  const prompt = provider === ApiProvider.PERPLEXITY 
    ? `Analyze these 5 US stocks (${candidates.map(c => c.symbol).join(", ")}) considering TODAY'S REAL-TIME MARKET NEWS. 
       Return ONLY a JSON array in Korean. Context: ${JSON.stringify(candidates)}`
    : `Analyze these 5 US stocks and provide a deep quant strategy in Korean. Return ONLY a JSON array. Dataset: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const result = await fetchWithRetry(async () => {
          // Gemini 3 Pro 모델 사용 (정확도 우선)
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
          return { data: null, error: "GEMINI_QUOTA_EXCEEDED: 제미나이 프로 한도 초과. Sonar Pro를 사용하세요." };
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
            { role: "system", content: "당신은 세계적인 헤지펀드 퀀트 전략가입니다. 실시간 시장 데이터와 시스템 분석을 결합하여 한국어로 전문적인 JSON 리포트를 작성합니다." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (res.status === 429) return { data: null, error: "PERPLEXITY_QUOTA_EXCEEDED" };
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

  // 퍼플리시티를 위해 "실시간 시황 + 종목 테마 분석"으로 프롬프트 전면 개편
  const prompt = provider === ApiProvider.PERPLEXITY
    ? `금융 전략 컨설턴트로서 다음 데이터를 기반으로 한국어 전략 리포트를 작성하십시오.
       
       [분석 컨텍스트]
       - 현재 파이프라인 단계: Stage ${data.currentStage}
       - 분석 대상 종목(Symbols): ${data.symbols ? data.symbols.join(", ") : "전체 섹터 스캐닝 중"}
       - 시스템 상태: ${JSON.stringify(data.apiStatuses.map((s:any) => s.provider + (s.isConnected ? ":온라인" : ":오프라인")))}
       
       [요청 사항]
       1. 현재 실시간 미국 주식 시장의 주요 변동성 요인과 투자 심리(Sentiment)를 검색하여 요약하십시오.
       2. 위의 분석 대상 종목(Symbols)이 있다면, 해당 종목들의 최신 테마(AI, 실적, 정책 등)와의 연관성을 상세히 분석하십시오.
       3. 현재 우리 시스템의 ${data.currentStage} 단계가 시장의 기회를 잡기에 적절한지 평가하십시오.
       4. 시스템 감사자가 아닌, 시장 리서치 센터의 '전략 보고서' 형식으로 한국어로 답변하십시오.`
    : `시스템 운영 및 시장 통합 진단: 
       Stage ${data.currentStage}, Symbols: ${data.symbols?.join(", ") || "None"}. 
       현재 시장 상황과 시스템 무결성을 한국어로 보고하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview', // Pro 모델 사용
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
            { role: "system", content: "당신은 월스트리트 출신의 수석 마켓 애널리스트입니다. 실시간 검색을 통해 시장 뉴스/테마와 시스템 데이터를 융합하여 한국어로 리포트를 제공합니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!res.ok) return `리포트 생성 실패: ${res.status} (${provider})`;
      const resData = await res.json();
      return resData.choices[0].message.content;
    }

    return "지원되지 않는 분석 엔진입니다.";
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return `${provider} 호출 한도가 초과되었습니다. 잠시 후 다시 시도하십시오.`;
    }
    return `분석 오류: ${e.message.substring(0, 100)}`;
  }
}
