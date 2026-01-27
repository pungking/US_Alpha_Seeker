
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar', 'sonar-reasoning'];

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY' or 'ACCUMULATE'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Professional perspective in Korean Markdown. Use ## Headers, **Bold**, and - Bullet points." },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4-5 specific technical/fundamental reasons in Korean" },
      convictionScore: { type: Type.NUMBER, description: "0.0 to 100.0" },
      expectedReturn: { type: Type.STRING, description: "Expected return percentage and duration (e.g. '+24.5% (6개월)')" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Sentiment description in Korean" },
      analysisLogic: { type: Type.STRING, description: "Neural logic engine state description in Korean" },
      chartPattern: { type: Type.STRING, description: "Detected technical pattern name" },
      supportLevel: { type: Type.NUMBER, description: "Key technical support level (Entry Zone)" },
      resistanceLevel: { type: Type.NUMBER, description: "Major technical resistance level (Target)" },
      stopLoss: { type: Type.NUMBER, description: "Calculated hard stop price" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio e.g. 1:3.5" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "stopLoss", "riskRewardRatio"]
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simulationPeriod: { type: Type.STRING, description: "Exact date range used e.g. '2023.01.01 ~ 2025.01.01'" },
    equityCurve: {
      type: Type.ARRAY,
      minItems: 12,
      maxItems: 12,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING, description: "Timeline label (e.g. '23.01', '23.03'...)" },
          value: { type: Type.NUMBER, description: "Cumulative return percentage as a number" }
        },
        required: ["period", "value"]
      }
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        winRate: { type: Type.STRING, description: "Win probability e.g. '68.5%'" },
        profitFactor: { type: Type.STRING, description: "Profit factor e.g. '2.45'" },
        maxDrawdown: { type: Type.STRING, description: "Max drawdown e.g. '-12.4%'" },
        sharpeRatio: { type: Type.STRING, description: "Sharpe ratio e.g. '1.8'" }
      },
      required: ["winRate", "profitFactor", "maxDrawdown", "sharpeRatio"]
    },
    historicalContext: { type: Type.STRING, description: "Detailed strategy analysis and risk assessment in Korean Markdown. Use ## Headers, **Bold**, and - Bullet points." }
  },
  required: ["simulationPeriod", "equityCurve", "metrics", "historicalContext"]
};

function sanitizeAndParseJson(text: string): any | null {
  if (!text) return null;
  try {
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    cleanText = cleanText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');
    
    if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
      return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    }
    if (firstCurly !== -1) {
      return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
    }
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Text:", text);
    return null;
  }
}

// Retry logic handles network blips, but model fallback is handled in the main functions
async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 3000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = (error.message || JSON.stringify(error)).toLowerCase();
    
    // Auth/Payment errors should NOT retry
    if (msg.includes('401') || msg.includes('402') || msg.includes('payment') || msg.includes('unauthorized')) {
        throw error; 
    }

    if (msg.includes('load failed') || msg.includes('failed to fetch')) {
      throw new Error("CORS/Network Error. Browser blocked the request.");
    }

    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2); 
    }
    throw error;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const prompt = `[시스템 미션: 월가 일류 퀀트 전략가]
현재 날짜: ${today}
분석 대상 종목(TOP 12): ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

위 리스트에서 기술적/재무적/ICT 관점에서 가장 완벽한 6개 종목을 최종 선정하십시오.
반드시 다음 정보를 포함한 JSON 배열로 응답하십시오:
- symbol, aiVerdict, marketCapClass, sectorTheme, convictionScore
- selectionReasons (배열), expectedReturn: 예상 수익률과 달성 예상 기간 (예: "+30.0% (3개월 내)")
- investmentOutlook (상세 Markdown: ## 소제목, **강조**, - 리스트 사용 필수), aiSentiment, analysisLogic, chartPattern
- supportLevel, resistanceLevel, stopLoss, riskRewardRatio.

투자 전략(investmentOutlook) 작성 시 가독성을 위해 반드시 Markdown 문법(헤더, 볼드체, 불렛 포인트)을 적극 활용하여 구조화된 리포트를 작성하십시오.

주의: supportLevel, resistanceLevel, stopLoss는 반드시 현재가 근처의 유효한 숫자여야 합니다.
한국어로 응답하고 오직 JSON 배열만 출력하세요. 인사말이나 부가설명은 절대 금지입니다.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
      }));
      return { data: sanitizeAndParseJson(result.text) };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      let lastError;
      // Multi-Model Fallback Loop
      for (const model of PERPLEXITY_MODELS) {
        try {
            const res = await fetchWithRetry(async () => {
                const r = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${apiKey}`,
                        'Accept': 'application/json' 
                    },
                    referrerPolicy: 'no-referrer', 
                    body: JSON.stringify({
                        model: model, 
                        messages: [
                            { role: "system", content: "당신은 월가 퀀트입니다. 투자 분석 리포트(investmentOutlook) 작성 시 반드시 Markdown 문법(## 헤더, **강조**, - 리스트)을 사용하여 가독성을 높이십시오. 분석 결과를 반드시 JSON 배열 하나만 출력하십시오. 코드 블록 없이 순수 JSON 배열만 반환하세요." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.1
                    })
                });
                
                if (!r.ok) {
                    const errText = await r.text();
                    // 402 Payment Required or 401 Unauthorized -> Break loop, don't fallback
                    if (r.status === 401 || r.status === 402) throw new Error(`CRITICAL_AUTH_ERROR_${r.status}: ${errText}`);
                    throw new Error(`HTTP_${r.status}: ${errText}`);
                }
                return r;
            }, 1, 1000); // Low retry inside loop, rely on model switching

            const data = await res.json();
            const content = data.choices?.[0]?.message?.content;
            const parsed = sanitizeAndParseJson(content);
            if (parsed) return { data: parsed };
            
        } catch (e: any) {
            console.warn(`Model ${model} failed: ${e.message}`);
            lastError = e;
            if (e.message.includes('CRITICAL_AUTH_ERROR')) break; // Don't try other models if no money
        }
      }
      return { data: null, error: `ALL_MODELS_FAILED: ${lastError?.message || "Unknown Error"}` };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 2);
  const periodStr = `${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`;

  const prompt = `[퀀트 백테스트 시뮬레이션 요청]
대상: ${stock.symbol}
설정 기간: ${periodStr} (정확히 최근 24개월)
전략: 진입가 ${stock.supportLevel} / 목표가 ${stock.resistanceLevel} 기준 스윙 트레이딩

위 기간 동안 해당 종목의 역사적 변동성(Volatility)과 베타(Beta) 계수를 기반으로 가상 시뮬레이션을 수행하십시오.
실제 틱 데이터가 없다면, 종목의 통계적 특성을 이용해 몬테카를로 시뮬레이션 결과를 생성하여 빈 값 없이 응답해야 합니다.

[필수 요구사항]
1. simulationPeriod: "${periodStr}"로 고정.
2. metrics: "N/A" 금지. 반드시 추정치라도 숫자를 포함한 문자열(예: "65.4%")을 채우십시오.
3. equityCurve: 2년치 데이터를 2개월 단위로 요약하여 정확히 12개의 포인트를 생성하십시오.
4. value: 누적 수익률(%)이며 순수 숫자(Number)여야 합니다. (예: 15.5)
5. historicalContext: 백테스팅 결과에 대한 **종합 분석**을 한국어로 작성하십시오. 반드시 Markdown 문법(## 소제목, **강조**, - 리스트)을 사용하여 가독성을 극대화하십시오.

반드시 JSON 스키마를 준수하여 출력하십시오.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA }
      }));
      return { data: sanitizeAndParseJson(result.text) };
    }

    if (provider === ApiProvider.PERPLEXITY) {
      let lastError;
      // Multi-Model Fallback Loop
      for (const model of PERPLEXITY_MODELS) {
        try {
            const res = await fetchWithRetry(async () => {
                const r = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${apiKey}`,
                        'Accept': 'application/json'
                    },
                    referrerPolicy: 'no-referrer',
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: "당신은 전문 퀀트 엔진입니다. 종합 분석(historicalContext) 작성 시 반드시 Markdown 문법을 사용하여 가독성을 높이십시오. N/A 없이 모든 필드에 시뮬레이션 수치를 채워 JSON으로 응답하십시오." },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.1
                    })
                });

                if (!r.ok) {
                    const errText = await r.text();
                    if (r.status === 401 || r.status === 402) throw new Error(`CRITICAL_AUTH_ERROR_${r.status}: ${errText}`);
                    throw new Error(`HTTP_${r.status}: ${errText}`);
                }
                return r;
            }, 1, 1000);

            const json = await res.json();
            const parsed = sanitizeAndParseJson(json.choices?.[0]?.message?.content);
            if (parsed) return { data: parsed };

        } catch (e: any) {
            console.warn(`Model ${model} failed: ${e.message}`);
            lastError = e;
            if (e.message.includes('CRITICAL_AUTH_ERROR')) break;
        }
      }
      return { data: null, error: `ALL_MODELS_FAILED: ${lastError?.message || "Simulation Failed"}` };
    }
    return { data: null, error: "NOT_SUPPORTED" };
  } catch (error: any) { return { data: null, error: error.message }; }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[] | null;
  recommendedData?: any[] | null;
  targetStock?: any; // For Single Stock Audit
  mode?: 'PORTFOLIO' | 'SINGLE_STOCK' | 'SYSTEM';
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_NODE_ERROR: API_KEY_MISSING";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  let prompt = "";
  
  if (data.mode === 'SINGLE_STOCK' && data.targetStock) {
      const s = data.targetStock;
      prompt = `[ALPHA AUDITOR: DEEP DIVE]
분석 기준일: ${today}
대상 종목: ${s.symbol} (${s.name})
현재가: $${s.price}
AI 확신도: ${s.convictionScore}%
전망: ${s.aiVerdict}

위 종목에 대해 다음 항목을 포함한 심층 감사(Audit) 리포트를 작성하십시오:
1. **투자 핵심 논거 (Alpha Thesis)**: 왜 이 종목이 지금 매수 적기인가? (매크로, 섹터 트렌드 결합)
2. **리스크 요인 (Risk Factors)**: 잠재적인 하락 리스크와 기술적 붕괴 지점.
3. **목표가 검증**: 제시된 목표가($${s.resistanceLevel})와 손절가($${s.stopLoss})의 적정성 평가.
4. **기관 수급 분석**: 최근 기관/내부자 거래 동향 추정 및 수급 해석.

반드시 한국어로 작성하고, ## 헤더, **강조**, - 불렛 포인트를 사용하여 가독성 높은 Markdown 형식으로 출력하십시오.`;
  } else if (data.mode === 'PORTFOLIO') {
      const context = data.recommendedData ? `포트폴리오: ${JSON.stringify(data.recommendedData.map(d => ({s: d.symbol, theme: d.sectorTheme})))}` : "데이터 없음";
      prompt = `[STRATEGIC PORTFOLIO MATRIX]
분석 기준일: ${today}
다음 6개 종목으로 구성된 포트폴리오의 최종 전략 리포트를 작성하십시오.
데이터: ${context}

포함할 내용:
1. **섹터 주도권 분석**: 어떤 테마가 시장을 이끄는가?
2. **상관관계 리스크**: 종목 간 분산 투자 효과 분석.
3. **종합 운용 전략**: 비중 조절 및 헷징 가이드.

반드시 한국어로 Markdown 형식을 사용하여 작성하십시오.`;
  } else {
      // System Audit Fallback
      prompt = `System Status Audit: Stage ${data.currentStage}. Provide a brief system health check report in Korean.`;
  }

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      
      // Attempt Primary Model (Pro)
      try {
          const response = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: prompt,
          }));
          return response.text || "분석 리포트 생성 실패";
      } catch (proError: any) {
          const errorMsg = (proError.message || "").toLowerCase();
          // Fallback Strategy for Quota/Rate Limits
          if (errorMsg.includes("429") || errorMsg.includes("exhausted") || errorMsg.includes("quota")) {
              console.warn("Gemini Pro Quota Exceeded. Falling back to Flash...");
              const fallbackResponse = await fetchWithRetry(() => ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: prompt + "\n(Note: Generated via Flash model due to high load)",
              }));
              return fallbackResponse.text || "분석 리포트 생성 실패 (Fallback)";
          }
          throw proError;
      }
    }

    if (provider === ApiProvider.PERPLEXITY) {
       let lastError;
       for (const model of PERPLEXITY_MODELS) {
         try {
            const res = await fetchWithRetry(async () => {
                const r = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${apiKey}`,
                        'Accept': 'application/json' 
                    },
                    referrerPolicy: 'no-referrer',
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: "user", content: prompt }],
                        temperature: 0.2
                    })
                });
                if (!r.ok) {
                    const errText = await r.text();
                    if (r.status === 401 || r.status === 402) throw new Error(`CRITICAL_AUTH_ERROR_${r.status}: ${errText}`);
                    throw new Error(`HTTP_${r.status}: ${errText}`);
                }
                return r;
            }, 1, 1000);
            
            const json = await res.json();
            const text = json.choices?.[0]?.message?.content;
            if (text) return text;
         } catch (e: any) {
            console.warn(`Model ${model} failed: ${e.message}`);
            lastError = e;
            if (e.message.includes('CRITICAL_AUTH_ERROR')) break;
         }
       }
       return `AUDIT_NODE_OFFLINE: ${lastError?.message || "All models unresponsive"}`;
    }
    return "INVALID_PROVIDER";
  } catch (error: any) { return `AUDIT_NODE_FAILURE: ${error.message}`; }
}
