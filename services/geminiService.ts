
import { GoogleGenAI, Type } from "@google/genai";

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const inactiveNodes = data.apiStatuses.filter(s => !s.isConnected).map(s => s.provider).join(", ");
  const maxLatency = Math.max(...data.apiStatuses.map(s => s.latency));

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
    return "CORE_CRITICAL_ERROR: AI Auditor 연결에 실패했습니다.";
  }
}

/**
 * Stage 6: 종목별 맞춤형 AI 분석 및 심층 전망 생성
 * 고성능 추론 모델 gemini-3-pro-preview 사용
 */
export async function generateAlphaSynthesis(candidates: any[]) {
  // 매 요청마다 새로운 인스턴스 생성 (최신 API 키 보장)
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
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        thinkingConfig: { thinkingBudget: 4096 }, // 복잡한 분석을 위해 추론 예산 할당
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
    
    if (!response.text) throw new Error("Empty AI response");
    return JSON.parse(response.text.trim());
  } catch (error) {
    console.error("Alpha Synthesis Engine Critical Error:", error);
    return null;
  }
}
