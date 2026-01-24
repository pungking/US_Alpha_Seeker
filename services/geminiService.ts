
import { GoogleGenAI } from "@google/genai";

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // 현재 연결된 노드와 끊긴 노드 구분
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
    위 데이터를 바탕으로 '운영 진단 리포트'를 작성하라. 다음 항목을 반드시 포함해야 한다:
    1. 시스템 무결성: 현재 노드 구성이 주식 분석 결과를 왜곡할 가능성이 있는가?
    2. 데이터 신뢰성: 특히 비활성 노드가 ${data.currentStage}단계 분석에 미치는 구체적인 악영향은?
    3. Alpha 신뢰도 점수: 0~100% 사이로 환산 (예: 95% - 매우 안정적)
    4. 권장 조치: 관리자가 즉시 수행해야 할 인프라 조정 사항.

    전문적이고 권위 있는 퀀트 시스템 엔지니어의 말투로 작성하라. 한국어로 응답하라.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Auditor Error:", error);
    return "CORE_CRITICAL_ERROR: AI Auditor 연결에 실패했습니다. API 키 및 네트워크 상태를 확인하십시오.";
  }
}

function getStageName(id: number) {
  const stages = ["Universe Gathering", "Preliminary Filter", "Deep Quality", "Fundamental Analysis", "Technical Analysis", "ICT Smart Money", "AI Deep Alpha"];
  return stages[id] || "Unknown";
}
