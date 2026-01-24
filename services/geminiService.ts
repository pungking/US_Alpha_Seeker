
import { GoogleGenAI } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const getApiKey = () => {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  return process.env.API_KEY || config?.key || "";
};

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const apiKey = getApiKey();
  if (!apiKey) return "API_KEY_MISSING";

  const ai = new GoogleGenAI({ apiKey });
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const prompt = `System Stage ${data.currentStage}, Active Nodes: ${activeNodes}. System Load: ${data.systemLoad}. Provide a short diagnostic audit in Korean.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error: any) {
    if (error.message.includes("503")) return "AUDIT_NODE_BUSY: 제미나이 서버 부하로 인해 진단이 지연되고 있습니다. 잠시 후 다시 시도하십시오.";
    return "AUDIT_OFFLINE: 연결을 확인하십시오.";
  }
}

export async function generateAlphaSynthesis(candidates: any[]) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Synthesize investment strategies for: ${JSON.stringify(candidates)}. Use Korean. Return a valid JSON array matching the required Alpha schema.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error: any) {
    console.error("Gemini Synthesis Error:", error);
    return null;
  }
}
