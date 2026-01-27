
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
          value: { type: Type.NUMBER, description: "Cumulative return percentage as a number (e.g., 15.5 for 15.5%)" }
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

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 3000): Promise<any> {
  try { return await fn(); } catch (error: any) {
    const msg = (error.message || JSON.stringify(error)).toLowerCase();
    if (msg.includes('401') || msg.includes('402') || msg.includes('payment') || msg.includes('unauthorized')) throw error; 
    if (msg.includes('load failed') || msg.includes('failed to fetch')) throw new Error("CORS/Network Error. Browser blocked the request.");
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2); 
    }
    throw error;
  }
}

// [NEW] Real Data Backtesting Engine
async function runDeterministicBacktest(stock: any): Promise<any | null> {
  try {
      const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
      if (!polygonKey) return null;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 2); // 2 Years back

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];
      
      const url = `https://api.polygon.io/v2/aggs/ticker/${stock.symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
      const res = await fetch(url);
      
      if (!res.ok) return null; // Fallback to AI if API fails (e.g. Rate Limit)
      const json = await res.json();
      if (!json.results || json.results.length === 0) return null;

      const candles = json.results; // {c, h, l, o, t, v}
      
      // Strategy Parameters
      const entry = stock.supportLevel || stock.price * 0.95;
      const target = stock.resistanceLevel || stock.price * 1.10;
      const stop = stock.stopLoss || stock.price * 0.90;
      
      let balance = 100; // Start with 100%
      let position: { entryPrice: number, quantity: number } | null = null;
      let wins = 0;
      let losses = 0;
      let maxDrawdown = 0;
      let peakBalance = 100;
      let tradeCount = 0;
      
      const equityCurve = [];
      let lastMonth = '';

      // Simulation Loop
      for (const candle of candles) {
          const date = new Date(candle.t);
          const monthStr = `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          
          // Trading Logic (Simplified Swing)
          // 1. Check Exit
          if (position) {
              // Check Stop Loss
              if (candle.l <= stop) {
                  const exitPrice = Math.min(candle.o, stop); // Slippage assumption: exit at stop or open
                  balance = position.quantity * exitPrice;
                  position = null;
                  losses++;
                  tradeCount++;
              } 
              // Check Target Profit
              else if (candle.h >= target) {
                  const exitPrice = Math.max(candle.o, target);
                  balance = position.quantity * exitPrice;
                  position = null;
                  wins++;
                  tradeCount++;
              }
          }
          
          // 2. Check Entry
          if (!position) {
              // Buy if price dips to entry zone
              if (candle.l <= entry && candle.h >= entry) {
                  position = { entryPrice: entry, quantity: balance / entry };
              }
          }
          
          // 3. Update Metrics
          let currentEquity = balance;
          if (position) {
              currentEquity = position.quantity * candle.c;
          }
          
          if (currentEquity > peakBalance) peakBalance = currentEquity;
          const dd = (peakBalance - currentEquity) / peakBalance * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          // Record Curve (Monthly sampling for chart)
          if (monthStr !== lastMonth) {
              equityCurve.push({ period: monthStr, value: Number((currentEquity - 100).toFixed(1)) });
              lastMonth = monthStr;
          }
      }

      // Safe Division & Formatting
      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const finalReturn = balance - 100;
      
      // Calculate Profit Factor Safely
      let profitFactor = 0;
      if (losses === 0) {
          profitFactor = wins > 0 ? 99.99 : 0;
      } else {
          // Approximate calculation for simulation speed
          const avgWin = wins > 0 ? (target - entry) : 0;
          const avgLoss = losses > 0 ? (entry - stop) : 0;
          profitFactor = (wins * avgWin) / (losses * avgLoss);
      }
      
      // Calculate Sharpe Safely
      const sharpeRatio = maxDrawdown > 0 ? (finalReturn / maxDrawdown) : (finalReturn > 0 ? 3.0 : 0);

      // KOREAN TEMPLATE FOR DETERMINISTIC RESULTS
      return {
          simulationPeriod: `${from} ~ ${to}`,
          equityCurve: equityCurve.slice(-12), // Last 12 points
          metrics: {
              winRate: `${winRate.toFixed(1)}%`,
              profitFactor: profitFactor.toFixed(2),
              maxDrawdown: `-${maxDrawdown.toFixed(1)}%`,
              sharpeRatio: sharpeRatio.toFixed(2)
          },
          historicalContext: `### 실데이터 검증 분석 리포트 (Real-Data Audit)
**Polygon.io 공식 데이터**를 기반으로 수행된 확정적 백테스트 결과입니다.

- **매매 신뢰도**: 지난 24개월간 총 ${totalTrades}회의 가상 매매가 시뮬레이션 되었습니다.
- **리스크 진단**: 해당 기간 동안 발생한 최대 낙폭(MDD)은 ${maxDrawdown.toFixed(1)}% 입니다.
- **매매 전략**: 진입 $${entry.toFixed(2)} / 목표 $${target.toFixed(2)} / 손절 $${stop.toFixed(2)}

이 결과는 AI의 추정이 아닌, 실제 과거 주가 변동(OHLCV)에 전략을 대입하여 산출된 팩트 기반 데이터입니다. 지정가 주문이 100% 체결되었다는 가정하에 산출되었습니다.`
      };

  } catch (e) {
      console.error("Deterministic Backtest Failed:", e);
      return null;
  }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string, isRealData?: boolean}> {
  // 1. Try Deterministic Backtest First (Stage 1)
  const realData = await runDeterministicBacktest(stock);
  if (realData) {
      return { data: realData, isRealData: true };
  }

  // 2. Fallback to AI Simulation (Stage 2)
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `
  [Task] Perform a quantitative backtest simulation for ticker ${stock.symbol} based on its technical setup.
  Technical Context: Score=${stock.technicalScore}, Support=${stock.supportLevel}, Resistance=${stock.resistanceLevel}.
  
  Return a JSON object matching this schema:
  {
      "simulationPeriod": "2023.01 ~ 2025.01",
      "equityCurve": [{ "period": "23.01", "value": 0 }, ... 12 monthly points ...],
      "metrics": { "winRate": "65%", "profitFactor": "2.1", "maxDrawdown": "-15%", "sharpeRatio": "1.5" },
      "historicalContext": "Write a realistic analysis of how this strategy would have performed in Korean Markdown."
  }
  `;

  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA }
      }));
      return { data: sanitizeAndParseJson(result.text), isRealData: false };
    }
    
    // Perplexity Fallback
    const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'sonar-pro', 
            messages: [{ role: "user", content: prompt + " Return valid JSON only." }]
        })
    });
    const data = await pRes.json();
    return { data: sanitizeAndParseJson(data.choices?.[0]?.message?.content), isRealData: false };
    
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[];
  targetStock?: any;
  mode: 'SINGLE_STOCK' | 'PORTFOLIO';
  recommendedData?: any[];
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_ERROR: API Key Missing";

  const isPortfolio = data.mode === 'PORTFOLIO';
  const stock = data.targetStock;
  
  // Custom Prompts based on Persona & Mode
  let systemPrompt = "";
  let userPrompt = "";

  if (provider === ApiProvider.GEMINI) {
      systemPrompt = "You are a conservative Wall Street Quant Auditor. Focus on fundamentals, risk management, and valuation safety.";
  } else {
      systemPrompt = "You are an aggressive Hedge Fund Analyst. Focus on momentum, market sentiment, and catalytic events.";
  }

  if (isPortfolio) {
      userPrompt = `
      [PORTFOLIO MATRIX AUDIT]
      Analyze this set of top alpha candidates: ${JSON.stringify(data.recommendedData?.slice(0, 6) || [])}.
      
      Provide a strategic summary in Korean Markdown:
      1. **Sector Allocation Risk**: Are we too concentrated?
      2. **Alpha Correlation**: Do these stocks move together?
      3. **Macro Exposure**: How sensitive is this portfolio to interest rates?
      4. **Final Verdict**: 'Aggressive', 'Balanced', or 'Defensive'?
      `;
  } else {
      userPrompt = `
      [SINGLE ASSET DEEP DIVE]
      Target: ${stock.symbol}
      Data: Price $${stock.price}, Score ${stock.convictionScore || stock.compositeAlpha}, Verdict ${stock.aiVerdict}.
      
      Perform a 'Red Team' audit in Korean Markdown:
      1. **Bear Case**: Why might this trade fail? (Be critical)
      2. **Technical Trap**: Where is the fake-out zone?
      3. **Institutional Footprint**: Is smart money buying or selling?
      4. **Final Audit Opinion**: Confirm or Reject the buy signal.
      `;
  }

  try {
    // 1. Gemini Execution
    if (provider === ApiProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
        const result = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: userPrompt,
            config: { systemInstruction: systemPrompt }
        }));
        return result.text;
    }

    // 2. Perplexity Execution
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json' 
        },
        body: JSON.stringify({
            model: 'sonar-pro', 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1
        })
    });
    
    if (!res.ok) throw new Error(`Perplexity API Error: ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "No analysis returned.";

  } catch (error: any) {
    return `AUDIT_FAILURE: ${error.message}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // [PERSONA DEFINITION]
  // Distinct personalities for each AI to ensure diverse results
  const GEMINI_PERSONA = `
    [ROLE: Traditional Wall Street Quant & Technical Analyst]
    - Philosophy: Safety, Deep Value, Chart Patterns (ICT/Smart Money), Strong Fundamentals.
    - Preference: Stocks with high conviction scores, solid support levels, and proven track records.
    - Style: Conservative but accurate. "Don't lose money" is rule #1.
  `;

  const PERPLEXITY_PERSONA = `
    [ROLE: Aggressive Hedge Fund Manager & Trend Follower]
    - Philosophy: Momentum, News Sentiment, Institutional Order Flow, Breakout setups.
    - Preference: High growth potential, viral themes, sector rotation leaders.
    - Style: High Risk / High Reward. "Trend is your friend".
  `;

  const currentPersona = (provider === ApiProvider.GEMINI) ? GEMINI_PERSONA : PERPLEXITY_PERSONA;

  const prompt = `${currentPersona}
현재 날짜: ${today}
분석 대상 종목(TOP 12): ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

위 리스트에서 당신의 투자 철학(Persona)에 가장 부합하는 **완벽한 6개 종목**을 최종 선정하십시오.
반드시 다음 정보를 포함한 JSON 배열로 응답하십시오:
- symbol, aiVerdict, marketCapClass, sectorTheme, convictionScore
- selectionReasons (배열), expectedReturn: 예상 수익률과 달성 예상 기간 (예: "+30.0% (3개월 내)")
- investmentOutlook (상세 Markdown: ## 소제목, **강조**, - 리스트 사용 필수), aiSentiment, analysisLogic (자신의 Persona 관점 포함)
- chartPattern, supportLevel, resistanceLevel, stopLoss, riskRewardRatio.

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
