import { GoogleGenAI, GenerateContentParameters } from '@google/genai';
import { dashboardAiRequest } from './dashboardAiClient.mjs';

export function createGeminiClient(apiKey: string | undefined) {
  if (apiKey) return new GoogleGenAI({ apiKey });
  return { models: { generateContent: (payload: GenerateContentParameters) => dashboardAiRequest('gemini', payload) } };
}
