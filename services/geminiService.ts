
import { GoogleGenAI } from "@google/genai";

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    [SYSTEM TELEMETRY DATA]
    - Current Stage: ${data.currentStage} (${getStageName(data.currentStage)})
    - Active Nodes: ${data.apiStatuses.filter(s => s.isConnected).length}/${data.apiStatuses.length}
    - Critical Latency: ${Math.max(...data.apiStatuses.map(s => s.latency))}ms
    - Operational Load: ${data.systemLoad}

    [REQUEST]
    As the US_Alpha_Seeker AI Auditor, provide a high-level diagnostic report of the current data pipeline. 
    1. Assess if the current stage data is stable enough for the next transition.
    2. Identify any API nodes showing performance degradation.
    3. Provide a brief "Operational Verdict" (e.g., NOMINAL, DEGRADED, CRITICAL).
    Keep the tone concise, technical, and professional. Respond in Korean.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Auditor Error:", error);
    return "오퍼레이셔널 로그 분석 중 오류가 발생했습니다. 시스템 연결 상태를 확인하십시오.";
  }
}

function getStageName(id: number) {
  const stages = ["Universe Gathering", "Preliminary Filter", "Deep Quality", "Fundamental Analysis", "Technical Analysis", "ICT Smart Money", "AI Deep Alpha"];
  return stages[id] || "Unknown";
}
