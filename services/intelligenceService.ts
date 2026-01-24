
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const OPENAI_ORG_ID = "org-vI8HiEH3t5pkhYmkdyvuGYAt";

const ALPHA_SCHEMA_PROMPT = `
당신은 전 세계 자산운용사의 0.1%에 속하는 퀀트 전략가입니다.
반드시 다음 JSON 배열 형식을 엄격히 지켜 응답하십시오 (마크다운 없이 순수 JSON만 출력):
[
  {
    "symbol": "종목코드",
    "aiVerdict": "강렬하고 직관적인 한 줄 판단 (한국어)",
    "investmentOutlook": "거시 경제와 개별 종목의 펀더멘탈을 결합한 심층 전망 (한국어)",
    "selectionReasons": ["선정이유1 (구체적)", "선정이유2 (기술적)", "선정이유3 (ICT/수급)", "선정이유4 (잠재력)"],
    "convictionScore": 95.5,
    "theme": "종목의 핵심 투자 테마",
    "aiSentiment": "현재 세력의 수급 및 시장 심리 요약"
  }
]
`;

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider) {
  const configs = {
    [ApiProvider.GEMINI]: {
      key: process.env.API_KEY,
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
  if (!currentConfig?.key) {
    console.error(`${provider} API key missing.`);
    return null;
  }

  const prompt = `
    다음 5개 미국 주식 종목에 대한 심층 퀀트 분석을 수행하라:
    데이터셋: ${JSON.stringify(candidates)}
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Google Gemini
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: currentConfig.key });
      const response = await ai.models.generateContent({
        model: currentConfig.model,
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
          responseMimeType: "application/json"
        }
      });
      return JSON.parse(response.text || '[]');
    }

    // 2. OpenAI ChatGPT
    if (provider === ApiProvider.CHATGPT) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentConfig.key}`,
          'OpenAI-Organization': OPENAI_ORG_ID
        },
        body: JSON.stringify({
          model: currentConfig.model,
          messages: [
            { role: "system", content: "You are a professional financial analyst. Reply only with valid JSON." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7
        })
      });
      if (!res.ok) throw new Error(`OpenAI Error: ${res.status}`);
      const data = await res.json();
      const content = data.choices[0].message.content;
      const parsed = JSON.parse(content);
      // gpt-4o might return { "candidates": [...] } or similar
      return Array.isArray(parsed) ? parsed : (parsed.candidates || Object.values(parsed)[0]);
    }

    // 3. Perplexity
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
            { role: "system", content: "You are a real-time market data expert. Always return data in a pure JSON array format without any markdown wrappers." },
            { role: "user", content: prompt }
          ]
        })
      });
      if (!res.ok) throw new Error(`Perplexity Error: ${res.status}`);
      const data = await res.json();
      const content = data.choices[0].message.content;
      // Clean markdown if present
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    }

  } catch (error: any) {
    console.error(`${provider} Execution Critical Failure:`, error);
    return null;
  }
}

export async function analyzePipelineStatus(data: any) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) return "API_KEY_NODE_OFFLINE";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Perform an operational audit on this system telemetry: ${JSON.stringify(data)}. Use a formal military-quant tone. Korean response.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_NODE_HANDSHAKE_FAILED"; }
}
