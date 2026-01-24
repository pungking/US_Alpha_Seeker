
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

/**
 * 텍스트 뭉치에서 JSON 배열 부분만 추출하는 유틸리티
 */
function extractJsonArray(text: string): any[] | null {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("JSON Extraction Failed:", e);
    return null;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider) {
  // API 키 확보 (환경변수 최우선, 없을 시 constants의 설정값 사용)
  const getApiKey = (p: ApiProvider) => {
    if (p === ApiProvider.GEMINI && process.env.API_KEY) return process.env.API_KEY;
    return API_CONFIGS.find(c => c.provider === p)?.key;
  };

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    console.error(`[${provider}] API Key is missing in both environment and constants.`);
    return null;
  }

  const prompt = `
    다음 5개 미국 주식 종목에 대한 심층 퀀트 분석 및 실시간 시장 전망을 수행하라.
    데이터셋: ${JSON.stringify(candidates)}
    
    [중요 지침]
    1. Perplexity 사용 시 실시간 최신 뉴스 및 웹 데이터를 반드시 반영할 것.
    2. 모든 응답은 한국어로 작성할 것.
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Google Gemini
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 16384 },
          responseMimeType: "application/json"
        }
      });
      return extractJsonArray(response.text || "");
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
          messages: [
            { role: "system", content: "You are a professional financial analyst. Return only a valid JSON array." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      
      const content = data.choices[0].message.content;
      return extractJsonArray(content);
    }

    // 3. Perplexity
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'sonar-reasoning',
          messages: [
            { role: "system", content: "You are a real-time market data expert. Always return data in a PURE JSON array format. Do not use markdown backticks." },
            { role: "user", content: prompt }
          ],
          temperature: 0.2
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const content = data.choices[0].message.content;
      return extractJsonArray(content);
    }

    return null;
  } catch (error: any) {
    console.error(`[${provider}] Critical System Error:`, error.message);
    return null;
  }
}

export async function analyzePipelineStatus(data: any) {
  const apiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key;
  if (!apiKey) return "API_KEY_OFFLINE";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `System Audit Request: ${JSON.stringify(data)}. Tone: Military-Quant. Language: Korean.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_FAILED"; }
}
