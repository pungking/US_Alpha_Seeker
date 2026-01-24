
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
 * 텍스트 내에서 JSON 배열 부분을 정밀하게 추출하고 정제하는 유틸리티
 */
function sanitizeAndParseJson(text: string): any[] | null {
  try {
    // 1. 마크다운 코드 블록 제거
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 2. 정규표현식으로 [...] 형태의 배열만 추출
    const match = cleanText.match(/\[[\s\S]*\]/);
    if (match) {
      // 3. 마지막 콤마(Trailing comma) 처리 및 파싱
      const jsonCandidate = match[0].replace(/,\s*\]/g, ']');
      return JSON.parse(jsonCandidate);
    }
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Critical: JSON Sanitize/Parse Failed", e);
    console.debug("Raw Text content:", text.substring(0, 200) + "...");
    return null;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  // API 키 확보 우선순위: Constants -> Env
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = config?.key || (provider === ApiProvider.GEMINI ? process.env.API_KEY : null);

  if (!apiKey) {
    return { data: null, error: "API_KEY_MISSING_IN_CONFIG" };
  }

  const prompt = `
    다음 5개 미국 주식 종목에 대한 심층 퀀트 분석 및 실시간 시장 전망을 수행하라.
    데이터셋: ${JSON.stringify(candidates)}
    
    [필수 지침]
    1. Perplexity 사용 시 최신 뉴스 및 웹 검색 데이터를 반영할 것.
    2. 모든 응답은 한국어로 작성할 것.
    3. JSON 형식 외에 다른 부가 설명은 절대 하지 말 것.
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Google Gemini (Paid Tier Pro)
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingBudget: 32768 }, // 최고 성능 추론 예산
          responseMimeType: "application/json"
        }
      });
      const parsed = sanitizeAndParseJson(response.text || "");
      return parsed ? { data: parsed } : { data: null, error: "GEMINI_JSON_PARSE_ERROR" };
    }

    // 2. OpenAI ChatGPT (Paid Org Access)
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
            { role: "system", content: "You are an expert quant trader. Always output data in a valid JSON array format." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.1
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { data: null, error: `OPENAI_HTTP_${res.status}: ${errData.error?.message || 'Unknown'}` };
      }

      const data = await res.json();
      const content = data.choices[0].message.content;
      // gpt-4o with json_object might return { "candidates": [...] }
      const parsed = sanitizeAndParseJson(content);
      if (parsed && !Array.isArray(parsed) && (parsed as any).candidates) return { data: (parsed as any).candidates };
      return parsed ? { data: parsed } : { data: null, error: "OPENAI_JSON_PARSE_ERROR" };
    }

    // 3. Perplexity (Pro Search reasoning)
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
            { role: "system", content: "You are a real-time market data expert. Always return data in a pure JSON array format only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return { data: null, error: `PERPLEXITY_HTTP_${res.status}: ${errData.error?.message || 'Unknown'}` };
      }

      const data = await res.json();
      const content = data.choices[0].message.content;
      const parsed = sanitizeAndParseJson(content);
      return parsed ? { data: parsed } : { data: null, error: "PERPLEXITY_JSON_PARSE_ERROR" };
    }

    return { data: null, error: "UNSUPPORTED_PROVIDER" };
  } catch (error: any) {
    return { data: null, error: `RUNTIME_EXCEPTION: ${error.message}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const apiKey = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || process.env.API_KEY;
  if (!apiKey) return "API_KEY_UNAVAILABLE";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `System Audit Request: ${JSON.stringify(data)}. Tone: Military-Quant. Language: Korean.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_NODE_OFFLINE"; }
}
