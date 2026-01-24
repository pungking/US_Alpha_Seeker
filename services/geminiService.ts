
import { GoogleGenAI, Type } from "@google/genai";

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  // Fix: Initialize GoogleGenAI directly with process.env.API_KEY as per strict guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const inactiveNodes = data.apiStatuses.filter(s => !s.isConnected).map(s => s.provider).join(", ");
  // Fix: Safe latency calculation to prevent -Infinity with empty arrays
  const maxLatency = data.apiStatuses.length > 0 ? Math.max(...data.apiStatuses.map(s => s.latency)) : 0;

  const prompt = `
    [US_Alpha_Seeker 시스템 텔레메트리 리포트]
    - 현재 진행 단계: Stage ${data.currentStage}
    - 활성 노드: ${activeNodes}
    - 비활성 노드: ${inactiveNodes || "없음"}
    - 최대 응답 지연: ${maxLatency}ms
    - 시스템 부하: ${data.systemLoad}

    [AI Auditor 임무]
    위 데이터를 바탕으로 '운영 진단 리포트'를 작성하라. 한국어로 응답하라.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Auditor Error:", error);
    return "CORE_CRITICAL_ERROR: AI Auditor 연결에 실패했습니다. API 키의 유효성을 확인하십시오.";
  }
}

/**
 * Stage 6: 종목별 맞춤형 AI 분석 및 심층 전망 생성
 * 고성능 추론 모델 gemini-3-pro-preview 사용
 * 주의: 이 모델은 유료 결제가 활성화된 API 키를 필수로 합니다.
 */
export async function generateAlphaSynthesis(candidates: any[]) {
  // Fix: Directly use process.env.API_KEY in the constructor. 
  // API key presence and validity are assumed hard requirements handled externally.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    당신은 세계 최고의 퀀트 헤지펀드 시니어 분석가입니다. 
    제시된 5개 종목에 대해 각각 독립적이고 깊이 있는 투자 분석 리포트를 작성하십시오.
    종목별 섹터 특징, 현재 가격, 그리고 제공된 펀더멘탈/테크니컬/ICT 점수를 종합적으로 추론해야 합니다.
    
    데이터셋:
    ${JSON.stringify(candidates, null, 2)}
    
    [분석 지침]
    1. 각 종목에 대해 '서로 다른' 구체적인 근거를 제시할 것.
    2. 전문적인 금융 용어를 사용하되 한국어로 친절하게 설명할 것.
    3. 'aiSentiment'는 시장의 심리와 세력의 수급 현황을 요약할 것.
    4. 'selectionReasons'는 4가지의 명확하고 차별화된 이유를 포함할 것.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 4096 }, 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              symbol: { type: Type.STRING },
              aiVerdict: { type: Type.STRING, description: "강렬한 한 줄 판단" },
              investmentOutlook: { type: Type.STRING, description: "상세 투자 전망" },
              selectionReasons: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "4가지 선정 이유"
              },
              convictionScore: { type: Type.NUMBER, description: "92.0~99.9 사이의 확신 점수" },
              theme: { type: Type.STRING, description: "종목을 상징하는 짧은 테마명" },
              aiSentiment: { type: Type.STRING, description: "세력 및 수급 심리 상태" }
            },
            required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment"]
          }
        }
      }
    });
    
    const resultText = response.text;
    if (!resultText) throw new Error("Empty AI response");
    return JSON.parse(resultText.trim());
  } catch (error: any) {
    console.error("Alpha Synthesis Engine Critical Error:", error);
    // Requested entity not found(404) 또는 Permission Denied(403) 발생 시 null 반환
    // 이는 유료 티어 모델에 접근할 수 없음을 의미함
    return null;
  }
}
