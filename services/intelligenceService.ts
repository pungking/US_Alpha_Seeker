
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const OPENAI_ORG_ID = "org-vI8HiEH3t5pkhYmkdyvuGYAt";

const ALPHA_SCHEMA_PROMPT = `
당신은 전 세계 자산운용사의 0.1%에 속하는 퀀트 전략가입니다.
반드시 다음 JSON 배열 형식을 엄격히 지켜 응답하십시오:
[
  {
    "symbol": "종목코드",
    "aiVerdict": "강렬하고 직관적인 한 줄 판단 (한국어)",
    "investmentOutlook": "거시 경제와 개별 종목의 펀더멘탈을 결합한 심층 전망 (한국어)",
    "selectionReasons": ["이유1", "이유2", "이유3", "이유4"],
    "convictionScore": 95.5,
    "theme": "종목의 핵심 투자 테마",
    "aiSentiment": "현재 세력의 수급 및 시장 심리 요약"
  }
]
`;

function sanitizeAndParseJson(text: string): any[] | null {
  try {
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = cleanText.match(/\[[\s\S]*\]/);
    if (match) {
      const jsonCandidate = match[0].replace(/,\s*\]/g, ']');
      return JSON.parse(jsonCandidate);
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON Parsing Failed", e);
    return null;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = config?.key || (provider === ApiProvider.GEMINI ? process.env.API_KEY : null);

  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `
    다음 5개 미국 주식 종목에 대한 심층 퀀트 분석을 수행하라.
    데이터셋: ${JSON.stringify(candidates)}
    
    [필수 지침]
    1. Perplexity 사용 시 최신 뉴스 데이터를 반영할 것.
    2. 모든 응답은 한국어로 작성할 것.
    3. 반드시 JSON 배열 형식만 출력할 것.
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Google Gemini (Pro -> Flash Auto Fallback)
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        // First Attempt: Pro Model
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingBudget: 16384 },
            responseMimeType: "application/json"
          }
        });
        const parsed = sanitizeAndParseJson(response.text || "");
        if (parsed) return { data: parsed };
      } catch (proError: any) {
        if (proError.message.includes("429") || proError.message.includes("limit: 0")) {
          console.warn("Gemini Pro Quota Exceeded. Falling back to Flash...");
          // Second Attempt: Flash Model (Higher Quota)
          const flashRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt + " (Note: Perform deep reasoning despite being a light model)",
          });
          const parsedFlash = sanitizeAndParseJson(flashRes.text || "");
          return parsedFlash ? { data: parsedFlash } : { data: null, error: "GEMINI_FLASH_PARSE_ERROR" };
        }
        throw proError;
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
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      
      if (res.status === 429) return { data: null, error: "OPENAI_QUOTA_EXCEEDED: 계정의 결제 잔액 혹은 무료 한도를 확인하십시오." };
      if (!res.ok) return { data: null, error: `OPENAI_HTTP_${res.status}` };

      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "OPENAI_PARSE_ERROR" };
    }

    // 3. Perplexity (Model Fix)
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'sonar', // 'sonar-reasoning' 대신 최신 안정화 모델 사용
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1
        })
      });

      if (res.status === 400) return { data: null, error: "PERPLEXITY_MODEL_DEPRECATED: 모델명을 'sonar'로 조정했습니다. 다시 시도하십시오." };
      if (res.status === 429) return { data: null, error: "PERPLEXITY_QUOTA_EXCEEDED: API 사용 한도 초과." };
      if (!res.ok) return { data: null, error: `PERPLEXITY_HTTP_${res.status}` };

      const data = await res.json();
      const parsed = sanitizeAndParseJson(data.choices[0].message.content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_PARSE_ERROR" };
    }

    return { data: null, error: "PROVIDER_NOT_SUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_EXCEPTION: ${error.message.substring(0, 100)}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = config?.key || process.env.API_KEY;
  if (!apiKey) return "API_KEY_MISSING";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `System Audit Request: ${JSON.stringify(data)}. Tone: Military-Quant. Language: Korean.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_NODE_OFFLINE"; }
}
