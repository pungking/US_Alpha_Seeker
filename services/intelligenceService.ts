
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
          // Gemini 3 Pro 모델로 업그레이드 (정확도 및 추론 능력 최상)
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
        return parsed ? { data: parsed } : { data: null, error: "GEMINI_PAYLOAD_PARSE_FAILED" };
      } catch (geminiErr: any) {
        const msg = geminiErr.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota")) {
          return { data: null, error: "GEMINI_QUOTA_EXCEEDED: 제미나이 프로 호출 한도가 초과되었습니다. Sonar Pro를 사용해 보세요." };
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
            { role: "system", content: "당신은 세계적인 퀀트 투자 전략가입니다. 실시간 시장 데이터와 시스템 분석을 결합하여 한국어로 전문적인 JSON 리포트를 작성합니다." },
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
  
  if (!apiKey) return `AUDIT_OFFLINE: ${provider} API 키가 없습니다.`;

  // 퍼플리시티가 '감사'라는 단어에 거부감을 느끼지 않도록 '전략 분석' 관점으로 프롬프트 최적화
  const prompt = provider === ApiProvider.PERPLEXITY
    ? `금융 기술 전략가로서 현재 미국 시장 상황과 우리 시스템의 운용 현황을 결합한 통합 보고서를 한국어로 작성해 주세요.
       현재 시스템 단계: Stage ${data.currentStage}
       연결된 API 노드: ${JSON.stringify(data.apiStatuses.map((s:any) => s.provider + (s.isConnected ? ":온라인" : ":오프라인")))}
       
       요청사항: 
       1. 현재 실시간 미국 주식 시장의 핵심 트렌드와 센티먼트를 분석하십시오.
       2. 이러한 시장 상황에서 우리 시스템의 현재 단계(Stage ${data.currentStage})가 왜 중요한지 설명하십시오.
       3. 전문적이고 데이터 중심적인 어조를 유지하십시오. (한국어로 출력)`
    : `시스템 운영 진단 보고서 작성 요청: 
       현재 단계: Stage ${data.currentStage}
       API 헬스체크: ${JSON.stringify(data.apiStatuses.map((s:any) => s.provider))}
       전문적인 기술 리포트를 한국어로 작성하십시오.`;

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
            { role: "system", content: "당신은 금융 및 기술 융합 전략 컨설턴트입니다. 실시간 시장 뉴스 검색 능력을 활용하여 시스템 상태와 결합된 수준 높은 전략 리포트를 한국어로 제공합니다." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!res.ok) return `노드 리포트 생성 실패: ${res.status} (${provider})`;
      const resData = await res.json();
      return resData.choices[0].message.content;
    }

    return "지원되지 않는 제공자입니다.";
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return `${provider} 호출 한도가 초과되었습니다. 잠시 후 다시 시도하거나 다른 엔진으로 변경해 주세요.`;
    }
    return `분석 노드 오류: ${e.message.substring(0, 80)}`;
  }
}
