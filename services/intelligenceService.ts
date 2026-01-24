
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const OPENAI_ORG_ID = "org-vI8HiEH3t5pkhYmkdyvuGYAt";

const ALPHA_SCHEMA = {
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
};

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    return null;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `
    Analyze these 5 US stocks and provide a deep quant strategy in Korean.
    Return ONLY a JSON array.
    Dataset: ${JSON.stringify(candidates)}
  `;

  try {
    // 1. Google Gemini (Pro with Flash Fallback)
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      
      try {
        // Attempt 1: Gemini 3 Pro (High Quality)
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingBudget: 8192 },
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
        const parsed = sanitizeAndParseJson(response.text || "");
        if (parsed) return { data: parsed };
        throw new Error("EMPTY_RESPONSE");
      } catch (proError: any) {
        // 503 (Overloaded), 429 (Quota), or 404 (Not Found) -> Fallback to Flash
        console.warn("Gemini Pro unreachable, engaging Flash Stability Node...");
        const flashRes = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
        const parsedFlash = sanitizeAndParseJson(flashRes.text || "");
        return parsedFlash ? { data: parsedFlash } : { data: null, error: "GEMINI_FLASH_SYNC_ERROR" };
      }
    }

    // 2. OpenAI ChatGPT
    if (provider === ApiProvider.CHATGPT) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Organization': OPENAI_ORG_ID
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: "system", content: "You are a professional quant. Output only JSON arrays." }, { role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      if (res.status === 429) return { data: null, error: "OPENAI_QUOTA_EXCEEDED" };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "OPENAI_PARSE_ERROR" };
    }

    // 3. Perplexity
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar',
          messages: [{ role: "system", content: "JSON ONLY." }, { role: "user", content: prompt }],
          temperature: 0.1
        })
      });
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL: ${error.message.substring(0, 100)}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || config?.key;
  if (!apiKey) return "API_KEY_OFFLINE";
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Audit this system state: ${JSON.stringify(data)}. Tone: Technical. Language: Korean.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_NODE_OFFLINE"; }
}
