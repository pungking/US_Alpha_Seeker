
import { GoogleGenAI } from "@google/genai";

export async function analyzeCollectionSummary(stats: any) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Analyze the current US stock ticker gathering progress:
    - Total Tickers Found: ${stats.totalFound}
    - Processed Successfully: ${stats.processed}
    - Failures: ${stats.failed}
    
    The system is at Stage 0 (Universe Gathering). 
    Provide a brief technical assessment of the data integrity and any potential risks regarding API rate limits.
    Respond in a professional financial analyst tone.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return "Unable to perform AI analysis at this time.";
  }
}
