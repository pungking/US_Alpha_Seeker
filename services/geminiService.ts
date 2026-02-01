
import { GoogleGenAI } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const getApiKey = () => {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  return process.env.API_KEY || config?.key || "";
};

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 5000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("503") || errorMsg.includes("quota") || errorMsg.includes("overloaded") || errorMsg.includes("exhausted");
    
    if (retries > 0 && isRetryable) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const apiKey = getApiKey();
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const ai = new GoogleGenAI({ apiKey });
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const prompt = `System Stage ${data.currentStage}, Active Nodes: ${activeNodes}. System Load: ${data.systemLoad}. Provide a deep diagnostic audit in Korean.`;

  try {
    // Pro 모델 대신 프리 티어 할당량이 넉넉한 Flash 모델 사용
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    return response.text;
  } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return "AUDIT_QUOTA_EXCEEDED: 제미나이 호출 한도가 초과되었습니다. 잠시 대기 후 시도하십시오.";
    }
    return `AUDIT_NODE_FAILURE: ${error.message.substring(0, 50)}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[]) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Synthesize investment strategies for: ${JSON.stringify(candidates)}. Use Korean. Return a valid JSON array matching the required Alpha schema.`;

  try {
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    }));
    return JSON.parse(response.text || "[]");
  } catch (error: any) {
    console.error("Gemini Synthesis Error:", error);
    return null;
  }
}
