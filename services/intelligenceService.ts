
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 2, delay = 3500): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error.message?.toLowerCase() || "";
    const isRetryable = errorMsg.includes("429") || errorMsg.includes("503") || errorMsg.includes("quota") || errorMsg.includes("overloaded");
    
    if (retries > 0 && isRetryable) {
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
      try {
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
      } catch (geminiErr: any) {
        const msg = geminiErr.message?.toLowerCase() || "";
        if (msg.includes("429") || msg.includes("quota")) {
          return { data: null, error: "GEMINI_QUOTA_EXCEEDED: 제미나이 호출 한도가 초과되었습니다(RPM). Sonar Pro를 사용해 보세요." };
        }
        throw geminiErr;
      }
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "You are a professional quant analyst. Return strictly valid JSON arrays in Korean." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (res.status === 429) return { data: null, error: "PERPLEXITY_QUOTA_EXCEEDED: Perplexity 할당량이 초과되었습니다." };
      if (!res.ok) return { data: null, error: `PERPLEXITY_ERROR: ${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_NODE_FAILURE: ${error.message.substring(0, 100)}` };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  
  if (!apiKey) return `AUDIT_OFFLINE: ${provider} API 키가 설정되지 않았습니다.`;

  const prompt = `System Status Audit Request:
  - Current Stage: ${data.currentStage}
  - API Health: ${JSON.stringify(data.apiStatuses.map((s:any) => ({p: s.provider, ok: s.isConnected})))}
  - Load Mode: ${data.systemLoad}
  
  Please provide a professional, technical diagnostic report in Korean. 
  If you are Perplexity, include a brief mention of current US market sentiment based on your search capability.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      }));
      return response.text;
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
            { role: "system", content: "You are the US_Alpha_Seeker System Auditor. Provide a sharp, data-driven diagnostic report in Korean." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!res.ok) return `AUDIT_NODE_ERROR: ${res.status} (${provider})`;
      const data = await res.json();
      return data.choices[0].message.content;
    }

    return "AUDIT_PROVIDER_UNSUPPORTED";
  } catch (e: any) {
    const msg = e.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return `AUDIT_QUOTA_EXCEEDED: ${provider}의 호출 한도가 초과되었습니다. 잠시 대기하거나 다른 엔진으로 전환하십시오.`;
    }
    return `AUDIT_NODE_FAILURE: ${e.message.substring(0, 60)}`;
  }
}
