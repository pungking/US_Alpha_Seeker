
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

// 공통 응답 스키마 정의 (표준화)
const ALPHA_SCHEMA_PROMPT = `
반드시 다음 JSON 형식을 엄격히 지켜 응답하십시오:
[
  {
    "symbol": "종목코드",
    "aiVerdict": "강렬한 한 줄 판단",
    "investmentOutlook": "상세 투자 전망 (한국어)",
    "selectionReasons": ["이유1", "이유2", "이유3", "이유4"],
    "convictionScore": 95.5,
    "theme": "핵심 테마명",
    "aiSentiment": "시장 심리 상태"
  }
]
`;

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider) {
  const configs = {
    [ApiProvider.GEMINI]: {
      key: process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key,
      model: 'gemini-3-pro-preview'
    },
    [ApiProvider.CHATGPT]: {
      key: API_CONFIGS.find(c => c.provider === ApiProvider.CHATGPT)?.key,
      model: 'gpt-4o'
    },
    [ApiProvider.PERPLEXITY]: {
      key: API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key,
      model: 'sonar-reasoning' 
    }
  };

  const currentConfig = configs[provider];
  if (!currentConfig?.key) return null;

  const prompt = `
    당신은 세계 최고의 퀀트 헤지펀드 시니어 분석가입니다. 
    다음 5개 종목에 대해 심층 분석 리포트를 작성하십시오.
    데이터셋: ${JSON.stringify(candidates)}
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Gemini (Native SDK)
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: currentConfig.key });
      const response = await ai.models.generateContent({
        model: currentConfig.model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 4096 },
          responseMimeType: "application/json"
        }
      });
      return JSON.parse(response.text || '[]');
    }

    // 2. ChatGPT (Fetch API)
    if (provider === ApiProvider.CHATGPT) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.key}`
        },
        body: JSON.stringify({
          model: currentConfig.model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });
      const data = await res.json();
      const content = data.choices[0].message.content;
      // OpenAI는 객체 하나로 감싸서 줄 때가 있으므로 배열 추출 로직 필요할 수 있음
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : parsed.candidates || Object.values(parsed)[0];
    }

    // 3. Perplexity (Fetch API)
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.key}`
        },
        body: JSON.stringify({
          model: currentConfig.model,
          messages: [
            { role: "system", content: "You are a financial expert. Always return data in the requested JSON array format." },
            { role: "user", content: prompt }
          ]
        })
      });
      const data = await res.json();
      const content = data.choices[0].message.content;
      // 마크다운 코드 블록 제거 로직
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    }

  } catch (error) {
    console.error(`${provider} Synthesis Error:`, error);
    return null;
  }
}

export async function analyzePipelineStatus(data: any) {
  const apiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key;
  if (!apiKey) return "API_KEY_MISSING";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `시스템 상태 분석: ${JSON.stringify(data)}. 간결한 리포트 작성 바람.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_CONNECTION_FAILED"; }
}
