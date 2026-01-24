
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
 * Stage 6: 종목별 맞춤형 AI 분석 생성
 */
export async function generateAlphaSynthesis(candidates: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze the following top 5 stock candidates for the US_Alpha_Seeker system.
    For each stock, provide a professional, unique quantitative investment report in Korean.
    
    Candidates Data:
    ${JSON.stringify(candidates, null, 2)}
    
    Output for each stock must include:
    1. aiVerdict: A one-sentence strong technical/ICT judgment.
    2. investmentOutlook: A detailed paragraph about the long-term potential considering its scores.
    3. selectionReasons: An array of 4 specific reasons for selection.
    4. convictionScore: A score between 92.0 and 99.9.
    5. theme: A 2-3 word investment theme (e.g., "AI Infrastructure Leader").
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
              theme: { type: Type.STRING }
            },
            required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme"]
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
