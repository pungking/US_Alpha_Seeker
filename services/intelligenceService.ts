
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
      aiSentiment: { type: Type.STRING },
      analysisLogic: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "investmentOutlook", "selectionReasons", "convictionScore", "theme", "aiSentiment", "analysisLogic"]
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
    console.error("JSON Parsing Error:", e, text);
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

  const prompt = `Analyze these 5 US stocks: ${candidates.map(c => c.symbol).join(", ")}.
    For each stock, provide a professional quant report in Korean:
    1. symbol: String (EXACT symbol)
    2. aiVerdict: A catchy phrase like "강력한 매수 신호" or "기술적 반등 구간".
    3. investmentOutlook: 2-3 sentences of deep outlook.
    4. selectionReasons: Array of 3 key reasons why this stock was chosen from a quant/ICT perspective.
    5. convictionScore: A number (0.0 to 100.0).
    6. theme: Market theme (e.g., "AI 인프라", "반도체 사이클").
    7. aiSentiment: Concise sentiment summary.
    8. analysisLogic: Professional explanation of the technical/fundamental logic applied.

    Return ONLY a valid JSON array. Dataset for context: ${JSON.stringify(candidates)}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(async () => {
        return await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: ALPHA_SCHEMA
          }
        });
      });
      const parsed = sanitizeAndParseJson(result.text || "");
      return parsed ? { data: parsed } : { data: null, error: "GEMINI_PARSE_ERROR" };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'sonar-pro', 
          messages: [
            { role: "system", content: "당신은 월가의 수석 퀀트 애널리스트입니다. 반드시 지정된 JSON 형식을 준수하고, 모든 텍스트는 한국어로 전문적으로 작성하십시오." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });
      if (!res.ok) return { data: null, error: `PPLX_ERR_${res.status}` };
      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PPLX_PARSE_ERROR" };
    }

    return { data: null, error: "UNSUPPORTED_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: error.message };
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  
  if (!apiKey) return `API Key missing for ${provider}`;

  const brainSummary = data.brainResults ? 
    data.brainResults.map((r:any) => `${r.symbol}: ${r.aiVerdict}`).join(", ") : 
    "No data from Stage 6 yet.";

  const prompt = `당신은 시스템 감사관입니다. 다음 데이터를 바탕으로 현재 투자 전략의 적합성을 한국어로 보고하십시오.
    브레인 분석 요약: ${brainSummary}
    대상 종목: ${data.symbols?.join(", ") || "전체"}
    최근 실시간 뉴스 및 매크로 상황을 반영하여 브레인의 판단을 검증하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
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
          messages: [{ role: "user", content: prompt }]
        })
      });
      const resData = await res.json();
      return resData.choices[0].message.content;
    }
    return "Unsupported provider.";
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}
