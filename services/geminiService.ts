
import { GoogleGenAI, Type } from "@google/genai";

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  systemLoad: string;
}) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const activeNodes = data.apiStatuses.filter(s => s.isConnected).map(s => s.provider).join(", ");
  const prompt = `System Stage ${data.currentStage}, Active: ${activeNodes}. Load: ${data.systemLoad}. Provide a short diagnostic in Korean.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    return "AUDIT_OFFLINE";
  }
}

export async function generateAlphaSynthesis(candidates: any[]) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Synthesize investment strategies for: ${JSON.stringify(candidates)}. Use Korean.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Stability prioritize
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error: any) {
    return null;
  }
}
