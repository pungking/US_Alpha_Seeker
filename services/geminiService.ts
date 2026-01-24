
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
 */
export async function generateAlphaSynthesis(candidates: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 종목별 차별화를 위한 강력한 페르소나와 지침 부여
  const prompt = `
    당신은 세계 최고의 퀀트 헤지펀드 분석가입니다. 
    다음 5개 종목에 대해 각각 '서로 완전히 다른' 독창적이고 심도 있는 투자 리포트를 작성하세요.
    각 종목의 섹터(Sector), 티커 이름, 그리고 전달된 점수(Fundamental, Technical, ICT)의 차이를 분석에 반영해야 합니다.
    모든 응답은 반드시 한국어로 작성하며, 전문적인 금융 용어를 사용하세요.
    
    분석 대상 데이터:
    ${JSON.stringify(candidates, null, 2)}
    
    [응답 규칙]
    1. aiVerdict: 기술적 관점에서의 강렬한 한 줄 요약.
    2. investmentOutlook: 해당 종목의 점수와 산업군을 고려한 중장기 전망 (한 단락).
    3. selectionReasons: 왜 이 종목이 선정되었는지 구체적인 이유 4가지 (배열).
    4. convictionScore: 92.0~99.9 사이의 정교한 점수.
    5. theme: "반도체 공급망 혁신", "성장성 가속화" 등 종목을 상징하는 2~3개 단어의 테마.
    6. aiSentiment: 하단 대시보드에 표시될 종목별 '세력 수급 및 심리 상태'에 대한 짧은 코멘트.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
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
        }
      }
    });
    
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Alpha Synthesis Error:", error);
    return null;
  }
}
