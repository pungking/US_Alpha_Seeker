import { GoogleGenAI } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

// [FIX] Removed getApiKey as the guidelines require direct use of process.env.API_KEY

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
  // [FIX] Always use process.env.API_KEY directly for initialization as per @google/genai guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const prompt = `System Stage ${data.currentStage}, Active Nodes: ${activeNodes}. System Load: ${data.systemLoad}. Provide a deep diagnostic audit in Korean.`;

  try {
    // [FIX] Use ai.models.generateContent directly
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    }));
    // [FIX] Accessing .text as a property
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
  // [FIX] Always use process.env.API_KEY directly for initialization as per @google/genai guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const prompt = `Synthesize investment strategies for: ${JSON.stringify(candidates)}. Use Korean. Return a valid JSON array matching the required Alpha schema.`;

  try {
    // [FIX] Use ai.models.generateContent directly
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    }));
    // [FIX] Accessing .text as a property
    return JSON.parse(response.text || "[]");
  } catch (error: any) {
    console.error("Gemini Synthesis Error:", error);
    return null;
  }
}