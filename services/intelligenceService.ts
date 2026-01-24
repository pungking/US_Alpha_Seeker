
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const OPENAI_ORG_ID = "org-vI8HiEH3t5pkhYmkdyvuGYAt";

const ALPHA_SCHEMA_PROMPT = `
당신은 전 세계 자산운용사의 0.1%에 속하는 퀀트 전략가입니다.
반드시 다음 JSON 배열 형식을 엄격히 지켜 응답하십시오. 다른 설명은 절대 하지 마십시오:
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
 * 텍스트 내에서 JSON 배열을 정밀하게 추출합니다.
 * 마크다운 태그, 서두 인사말 등을 모두 제거합니다.
 */
function sanitizeAndParseJson(text: string): any[] | null {
  try {
    // 1. 기본적인 청소
    let cleanText = text.trim();
    
    // 2. 마크다운 코드 블록 제거
    cleanText = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // 3. 최외곽 [ ] 찾기
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
      const jsonCandidate = cleanText.substring(firstBracket, lastBracket + 1);
      // 4. 불필요한 쉼표나 줄바꿈 처리
      const fixedJson = jsonCandidate.replace(/,\s*\]/g, ']');
      return JSON.parse(fixedJson);
    }
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Deep JSON Parse Failure. Raw input:", text.substring(0, 100));
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
    1. 최신 실시간 시장 데이터를 반영할 것.
    2. 모든 응답은 한국어로 작성할 것.
    3. 반드시 순수한 JSON 배열 형식만 출력할 것. 다른 텍스트는 금지한다.
    ${ALPHA_SCHEMA_PROMPT}
  `;

  try {
    // 1. Google Gemini (503/429 대응 강력한 Fallback)
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-preview',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingBudget: 8192 }, // 부하를 줄이기 위해 예산 최적화
            responseMimeType: "application/json"
          }
        });
        const parsed = sanitizeAndParseJson(response.text || "");
        if (parsed) return { data: parsed };
        throw new Error("PRO_EMPTY_OR_INVALID_JSON");
      } catch (proError: any) {
        // 503(Overloaded) 또는 429(Quota) 발생 시 Flash 모델로 긴급 전환
        const isTransient = proError.message.includes("503") || proError.message.includes("overloaded") || proError.message.includes("429");
        if (isTransient) {
          console.warn("Gemini Pro Node Overloaded. Switching to Flash Stability Node...");
          const flashRes = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt + "\n\n(IMPORTANT: Strict JSON output required)",
          });
          const parsedFlash = sanitizeAndParseJson(flashRes.text || "");
          return parsedFlash ? { data: parsedFlash } : { data: null, error: "GEMINI_NODE_SYNC_FAILED" };
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
          messages: [{ role: "system", content: "You are a professional quant. Output only JSON arrays." }, { role: "user", content: prompt }],
          response_format: { type: "json_object" }, // GPT-4o의 JSON 모드 활용
          temperature: 0.1
        })
      });
      
      if (res.status === 429) return { data: null, error: "OPENAI_BILLING_REQUIRED: API 결제 잔액을 충전하십시오." };
      
      const data = await res.json();
      if (data.error) return { data: null, error: `OPENAI_API_ERR: ${data.error.message}` };
      
      const content = data.choices[0].message.content;
      const parsed = sanitizeAndParseJson(content);
      return parsed ? { data: parsed } : { data: null, error: "OPENAI_PAYLOAD_PARSE_ERR" };
    }

    // 3. Perplexity (Sonar - 고정 및 파싱 강화)
    if (provider === ApiProvider.PERPLEXITY) {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'sonar', 
          messages: [
            { role: "system", content: "Strict JSON Mode: Always start with [ and end with ]. No preamble." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        })
      });

      if (!res.ok) return { data: null, error: `PERPLEXITY_HTTP_${res.status}` };

      const data = await res.json();
      const content = data.choices[0].message.content;
      const parsed = sanitizeAndParseJson(content);
      
      if (!parsed) {
        console.debug("Perplexity formatting error, retrying with raw cleanup...");
        return { data: null, error: "PERPLEXITY_FORMAT_ERROR: 다시 시도하십시오." };
      }
      return { data: parsed };
    }

    return { data: null, error: "NODE_UNSUPPORTED" };
  } catch (error: any) {
    return { data: null, error: `CRITICAL_NODE_FAILURE: ${error.message.substring(0, 150)}` };
  }
}

export async function analyzePipelineStatus(data: any) {
  const config = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = config?.key || process.env.API_KEY;
  if (!apiKey) return "API_KEY_OFFLINE";
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `System Health Audit: ${JSON.stringify(data)}. Lang: KR.`,
    });
    return response.text;
  } catch (e) { return "AUDIT_OFFLINE"; }
}
