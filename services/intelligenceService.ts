
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

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

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 1500): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.message.includes("503") || error.message.includes("overloaded"))) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `Analyze these 5 US stocks and provide a deep quant strategy in Korean. Return ONLY a JSON array. Dataset: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
        return response;
      });

      const parsed = sanitizeAndParseJson(result.text || "");
      return parsed ? { data: parsed } : { data: null, error: "GEMINI_PAYLOAD_PARSE_FAILED" };
    }

    if (provider === ApiProvider.CHATGPT) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
          // 특정 Org ID를 강제하지 않음으로써 Admin Key의 범용성 확보
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: "system", content: "You are a professional quant analyst. Always output strictly valid JSON arrays in Korean." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });

      if (res.status === 429) {
        return { data: null, error: "OPENAI_QUOTA_EXCEEDED: 결제 잔액이 부족하거나 사용량이 초과되었습니다. Gemini로 전환하여 실행하세요." };
      }
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        return { data: null, error: `OPENAI_API_ERROR: ${errorData.error?.message || res.statusText}` };
      }

      const data = await res.json();
      const rawContent = data.choices[0].message.content;
      // OpenAI json_object 모드는 객체로 감싸져 올 수 있으므로 추출 로직 강화
      const parsed = sanitizeAndParseJson(rawContent);
      return parsed ? { data: parsed } : { data: null, error: "OPENAI_PARSE_ERROR: 응답 형식이 유효하지 않습니다." };
    }

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
      if (!res.ok) return { data: null, error: `PERPLEXITY_ERROR: ${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_NODE_FAILURE: ${error.message.substring(0, 80)}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || config?.key;
  if (!apiKey) return "API_KEY_OFFLINE";
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await fetchWithRetry(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Audit this system state: ${JSON.stringify(data)}. Tone: Technical. Language: Korean.`,
    }));
    return response.text;
  } catch (e) { return "AUDIT_NODE_OVERLOADED_RETRY_LATER"; }
}
