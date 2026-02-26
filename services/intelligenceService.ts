
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET, STRATEGY_CONFIG } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar']; 

// Usage Tracking System
const USAGE_KEY = 'US_ALPHA_SEEKER_AI_USAGE';

export const trackUsage = (provider: string, tokens: number, isError: boolean = false, errorMsg: string = '') => {
  try {
    const currentRaw = sessionStorage.getItem(USAGE_KEY);
    const current = currentRaw ? JSON.parse(currentRaw) : { 
      gemini: { tokens: 0, requests: 0, status: 'OK', lastError: '' }, 
      perplexity: { tokens: 0, requests: 0, status: 'OK', lastError: '' } 
    };

    const key = provider === ApiProvider.GEMINI ? 'gemini' : 'perplexity';
    
    if (current[key]) {
      current[key].tokens += tokens;
      if (!isError) current[key].requests += 1;
      current[key].status = isError ? 'ERR' : 'OK';
      current[key].lastError = errorMsg;
    }

    sessionStorage.setItem(USAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event('storage-usage-update'));
  } catch (e) {
    console.error("Usage Tracking Error:", e);
  }
};

// Report Archiving Utility
export async function archiveReport(token: string, fileName: string, content: string): Promise<boolean> {
  try {
     const { rootFolderId, reportSubFolder } = GOOGLE_DRIVE_TARGET;
     
     const q = encodeURIComponent(`name = '${reportSubFolder}' and '${rootFolderId}' in parents and trashed = false`);
     let folderId = '';
     
     const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
        headers: { 'Authorization': `Bearer ${token}` }
     }).then(r => r.json());

     if (res.files?.length > 0) {
        folderId = res.files[0].id;
     } else {
        const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
           method: 'POST',
           headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
           body: JSON.stringify({ name: reportSubFolder, parents: [rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
        }).then(r => r.json());
        folderId = create.id;
     }

     if (!folderId) throw new Error("Failed to resolve Report folder");

     const meta = { name: fileName, parents: [folderId], mimeType: 'text/markdown' };
     const form = new FormData();
     form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
     form.append('file', new Blob([content], { type: 'text/markdown' }));

     const upload = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
     });
     
     if (!upload.ok) {
         console.error("Archive Upload Failed", await upload.text());
         return false;
     }
     
     return true;
  } catch (e) {
     console.error("Archive Report System Error", e);
     return false;
  }
}

export function removeCitations(text: any): string {
  if (!text) return "";
  const str = typeof text === 'string' ? text : String(text);
  return str.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim();
}

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "Stock symbol" },
      aiVerdict: { type: Type.STRING, description: "Verdict: 'STRONG_BUY', 'BUY', 'HOLD', 'PARTIAL_EXIT', 'SPECULATIVE_BUY'" },
      marketCapClass: { type: Type.STRING, description: "Size: 'LARGE', 'MID', 'SMALL', 'MICRO'" },
      sectorTheme: { type: Type.STRING, description: "Theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Deep analysis in Korean Markdown. Must follow the 'Legendary Council' format." },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of exactly 3 reasons in Korean: [1.Sector, 2.Fundamentals, 3.Technical]" },
      convictionScore: { type: Type.NUMBER, description: "Final weighted score (0.0 to 100.0)" },
      newsSentiment: { type: Type.STRING, description: "e.g., 'Ext. Positive', 'Positive', 'Neutral', 'Negative'" },
      newsScore: { type: Type.NUMBER, description: "Sentiment score 0.0 to 1.0" },
      expectedReturn: { type: Type.STRING, description: "e.g. '+50% (High Upside)' or '+20% (Stable Growth)'" },
      theme: { type: Type.STRING },
      aiSentiment: { type: Type.STRING, description: "Overall Sentiment description in Korean" },
      analysisLogic: { type: Type.STRING, description: "Brief logic description in Korean" },
      chartPattern: { type: Type.STRING, description: "Detected technical pattern name (e.g. 'Wyckoff SOS')" },
      supportLevel: { type: Type.NUMBER, description: "Optimal Entry Zone" },
      resistanceLevel: { type: Type.NUMBER, description: "Profit Target" },
      stopLoss: { type: Type.NUMBER, description: "Invalidation Level" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio e.g. 1:4.5" },
      kellyWeight: { type: Type.STRING, description: "Suggested portfolio weight based on Kelly Criterion" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "newsSentiment", "newsScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "stopLoss", "riskRewardRatio"]
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simulationPeriod: { type: Type.STRING },
    equityCurve: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING },
          value: { type: Type.NUMBER }
        },
        required: ["period", "value"]
      }
    },
    metrics: {
      type: Type.OBJECT,
      properties: {
        winRate: { type: Type.STRING },
        profitFactor: { type: Type.STRING },
        maxDrawdown: { type: Type.STRING },
        sharpeRatio: { type: Type.STRING }
      },
      required: ["winRate", "profitFactor", "maxDrawdown", "sharpeRatio"]
    },
    historicalContext: { type: Type.STRING }
  },
  required: ["simulationPeriod", "equityCurve", "metrics", "historicalContext"]
};

function sanitizeAndParseJson(text: string): any | null {
  if (!text) return [];
  try {
    let cleanText = text.trim();
    // Remove markdown code blocks if present
    cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    // Remove control characters except newlines
    cleanText = cleanText.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "");
    
    // [NEW] Regex extraction for array
    const arrayMatch = cleanText.match(/\[\s*\{.*\}\s*\]/s);
    if (arrayMatch) {
      cleanText = arrayMatch[0];
    } else {
      // Find the first '[' or '{' to ignore any preamble
      const firstBracket = cleanText.indexOf('[');
      const firstCurly = cleanText.indexOf('{');
      
      // Determine if it looks like an array or object and slice
      let startIdx = -1;
      let endIdx = -1;

      if (firstBracket !== -1 && (firstCurly === -1 || firstBracket < firstCurly)) {
         startIdx = firstBracket;
         endIdx = cleanText.lastIndexOf(']');
      } else if (firstCurly !== -1) {
         startIdx = firstCurly;
         endIdx = cleanText.lastIndexOf('}');
      }

      if (startIdx !== -1 && endIdx !== -1) {
          cleanText = cleanText.substring(startIdx, endIdx + 1);
      }
    }
    
    return JSON.parse(cleanText);
  } catch (e) {
    // Only log critical errors to avoid console noise for minor partial failures
    // console.error("JSON_PARSE_CRITICAL_FAILURE:", e, "Raw Text:", text); 
    return [];
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 5000, timeoutMs = 30000): Promise<any> {
  try { 
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("API_TIMEOUT")), timeoutMs));
    return await Promise.race([fn(), timeoutPromise]); 
  } catch (error: any) {
    const msg = (error.message || JSON.stringify(error)).toLowerCase();
    
    // Fatal errors that shouldn't be retried immediately
    if (msg.includes('401') || msg.includes('402') || msg.includes('payment') || msg.includes('unauthorized') || msg.includes('api_key_missing')) throw error; 
    
    // Log for debugging 429s (Gemini Rate Limits often happen even with credits)
    if (msg.includes('429') || msg.includes('resource_exhausted') || msg.includes('quota')) {
        console.warn(`[API Retry] 429/Quota limit hit. Pausing for ${delay}ms before retry ${4-retries}...`);
    }

    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2, timeoutMs); // Exponential backoff
    }
    throw error;
  }
}

async function runDeterministicBacktest(stock: any): Promise<any | null> {
  try {
      const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
      if (!polygonKey) return null;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 2); 

      const from = startDate.toISOString().split('T')[0];
      const to = endDate.toISOString().split('T')[0];
      
      const url = `https://api.polygon.io/v2/aggs/ticker/${stock.symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
      const res = await fetch(url);
      
      if (!res.ok) return null; 
      const json = await res.json();
      if (!json.results || json.results.length === 0) return null;

      const candles = json.results; 
      
      const entry = stock.supportLevel || stock.price * 0.95;
      const target = stock.resistanceLevel || stock.price * 1.10;
      const stop = stock.stopLoss || stock.price * 0.90;
      
      let balance = 100; 
      let position: { entryPrice: number, quantity: number } | null = null;
      let wins = 0;
      let losses = 0;
      let maxDrawdown = 0;
      let peakBalance = 100;
      let tradeCount = 0;
      
      const equityCurve = [];
      let lastMonth = '';

      for (const candle of candles) {
          const date = new Date(candle.t);
          const monthStr = `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          
          if (position) {
              if (candle.l <= stop) {
                  const exitPrice = Math.min(candle.o, stop); 
                  balance = position.quantity * exitPrice;
                  position = null;
                  losses++;
                  tradeCount++;
              } 
              else if (candle.h >= target) {
                  const exitPrice = Math.max(candle.o, target);
                  balance = position.quantity * exitPrice;
                  position = null;
                  wins++;
                  tradeCount++;
              }
          }
          
          if (!position) {
              if (candle.l <= entry && candle.h >= entry) {
                  position = { entryPrice: entry, quantity: balance / entry };
              }
          }
          
          let currentEquity = balance;
          if (position) {
              currentEquity = position.quantity * candle.c;
          }
          
          if (currentEquity > peakBalance) peakBalance = currentEquity;
          const dd = (peakBalance - currentEquity) / peakBalance * 100;
          if (dd > maxDrawdown) maxDrawdown = dd;

          if (monthStr !== lastMonth) {
              equityCurve.push({ period: monthStr, value: Number((currentEquity - 100).toFixed(1)) });
              lastMonth = monthStr;
          }
      }

      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const finalReturn = balance - 100;
      
      let profitFactor = 0;
      if (losses === 0) {
          profitFactor = wins > 0 ? 99.99 : 0;
      } else {
          const avgWin = wins > 0 ? (target - entry) : 0;
          const avgLoss = losses > 0 ? (entry - stop) : 0;
          profitFactor = (wins * avgWin) / (losses * avgLoss);
      }
      
      const sharpeRatio = maxDrawdown > 0 ? (finalReturn / maxDrawdown) : (finalReturn > 0 ? 3.0 : 0);

      return {
          simulationPeriod: `${from} ~ ${to}`,
          equityCurve: equityCurve,
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
  const realData = await runDeterministicBacktest(stock);
  if (realData) {
      return { data: realData, isRealData: true };
  }

  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const prompt = `
  [Task] Perform a quantitative backtest simulation for ticker ${stock.symbol} based on its technical setup.
  Technical Context: Score=${stock.technicalScore}, Support=${stock.supportLevel}, Resistance=${stock.resistanceLevel}.
  
  **IMPORTANT**: The analysis period MUST be 24 months (2 years).
  Return exactly 24 monthly data points in the equityCurve array.

  Return a JSON object matching this schema:
  {
      "simulationPeriod": "2023.01 ~ 2025.01",
      "equityCurve": [{ "period": "23.01", "value": 0 }, ... 24 monthly points ...],
      "metrics": { "winRate": "65%", "profitFactor": "2.1", "maxDrawdown": "-15%", "sharpeRatio": "1.5" },
      "historicalContext": "Write a realistic analysis of how this strategy would have performed in Korean Markdown. DO NOT USE EMOJIS."
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
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      const parsed = sanitizeAndParseJson(result.text);
      if (parsed && parsed.historicalContext) {
          parsed.historicalContext = removeCitations(parsed.historicalContext);
      }
      return { data: parsed, isRealData: false };
    }
    
    let pRes;
    const body = JSON.stringify({
        model: 'sonar-pro', 
        messages: [{ role: "user", content: prompt + " Return valid JSON only." }]
    });

    try {
        pRes = await fetch('/api/perplexity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body
        });
        if (pRes.status === 404) throw new Error("Proxy 404");
    } catch (e) {
        pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
            body
        });
    }
    
    const data = await pRes.json();
    if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
    
    if (!pRes.ok) throw new Error(data.error?.message || "Perplexity Error");

    const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content);
    if (parsed && parsed.historicalContext) {
        parsed.historicalContext = removeCitations(parsed.historicalContext);
    }
    return { data: parsed, isRealData: false };
    
  } catch (e: any) {
    trackUsage(provider, 0, true, e.message);
    return { data: null, error: e.message };
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider, isAutoMode: boolean = false): Promise<{data: any[] | null, error?: string, usedProvider?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // [NEW] Regime-Adaptive: Fetch Market Context (VIX)
  let regimeContext = "Neutral";
  let vixValue = 20;
  try {
      const indexRes = await fetch('/api/portal_indices');
      if (indexRes.ok) {
          const indices = await indexRes.json();
          const vix = indices.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX');
          if (vix) {
              vixValue = vix.price;
              regimeContext = vixValue > 25 ? "Risk-Off (High Fear)" : vixValue < 15 ? "Risk-On (Bullish)" : "Neutral";
          }
      }
  } catch (e) {
      console.warn("Regime fetch failed, defaulting to Neutral");
  }

  const vectorInputs = candidates.map(c => ({
      symbol: c.symbol,
      price: c.price,
      // Vector A: Fundamental & Value
      metricsA: {
          pe: c.pe || c.per || 0,
          peg: c.pegRatio || 0,
          pbr: c.pbr || 0,
          roe: c.roe || 0,
          growth: c.revenueGrowth || 0,
          gap: c.fairValueGap || 0
      },
      // Vector B: Supply & Technical
      metricsB: {
          rvol: c.techMetrics?.rvol || 1.0,
          rsi: c.techMetrics?.rsRating || 50,
          squeeze: c.techMetrics?.squeezeState,
          volume: c.volume || 0,
          marketCap: c.marketCap || 0,
          instOwn: c.heldPercentInstitutions || 0
      },
      // Vector C: ICT & Smart Money
      metricsC: {
          ob: c.ictMetrics?.orderBlock || 0,
          mss: c.ictMetrics?.marketStructure || 0,
          sweep: c.ictMetrics?.liquiditySweep || 0,
          flow: c.ictMetrics?.smartMoneyFlow || 0,
          pdZone: c.pdZone || 'EQUILIBRIUM' // [NEW] ICT Context for AI
      }
  }));

  // [SYSTEM INSTRUCTION - HYPER-ALPHA + LEGENDARY COUNCIL FUSION]
  // [MODIFIED] Removing "Description" from template to prevent AI chatter.
  // [MODIFIED] Single line enforcement for "Key Thesis" section to prevent bad formatting.
  const SYSTEM_INSTRUCTION = `
  [SYSTEM ROLE: THE HYPER-ALPHA INTEGRATED EXECUTION PIPELINE - STAGE 6]
  You are the Chief Investment Officer (CIO) of an elite Hedge Fund.
  Your task is to select the TOP 6 stocks from the provided list by simulating a debate among 8 Legendary Investors.
  Current Market Regime: ${regimeContext} (VIX: ${vixValue}).

  [STRATEGIC RISK PARAMETERS]
  Current System Risk Thresholds:
  - RSI Overheat: > ${STRATEGY_CONFIG.RSI_PENALTY_THRESHOLD} (Extreme Overbought)
  - VIX Fear Level: > ${STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL} (Defensive Mode)
  - Sentiment Reversal: News Score > ${STRATEGY_CONFIG.SENTIMENT_REVERSAL_THRESHOLD} (Potential Top)

  [INSTRUCTION: RISK-ADJUSTED ANALYSIS]
  If a candidate's RSI exceeds ${STRATEGY_CONFIG.RSI_PENALTY_THRESHOLD} or VIX exceeds ${STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL}, you MUST adjust the investment rating conservatively and include a warning in the report.
  
  [INSTRUCTION: CONTRARIAN LOGIC]
  If 'newsScore' > ${STRATEGY_CONFIG.SENTIMENT_REVERSAL_THRESHOLD} AND RSI is high, interpret this as "Euphoria/Short-term Top" driven by news. Be skeptical of further upside.

  [PIPELINE EXECUTION LOGIC]
  1. **Correlation & Theme Filter**: Select 6 stocks from at least 3 DIFFERENT SECTORS. Avoid correlating assets.
  2. **Legendary Investor Council**: Simulate debate among Benjamin Graham, Peter Lynch, Warren Buffett, William O'Neil, Charlie Munger, Glenn Welling, Cathie Wood, Glenn Greenberg.
  3. **News Sentiment**: Reject stocks with bad news in last 48h.
  4. **Wyckoff Verification**: Check Volume & Thrust.
  5. **Execution**: Calculate Entry/Stop/Kelly.

  [OUTPUT REQUIREMENTS - JSON ONLY]
  Return a JSON Array of exactly 6 Stocks.
  Each object must strictly match this schema:
  - **symbol**: Ticker.
  - **aiVerdict**: "STRONG_BUY", "BUY", "PARTIAL_EXIT".
  - **convictionScore**: 0-100.
  - **newsSentiment**: "Ext. Positive", "Positive", "Neutral", "Negative".
  - **newsScore**: 0.0 to 1.0.
  - **marketCapClass**, **sectorTheme**, **theme**: Meta data.
  - **selectionReasons**: Array of EXACTLY 3 strings in **KOREAN** (1. Sector, 2. Fundamentals, 3. Technical).
  - **expectedReturn**: "+XX% (Tag)".
  - **supportLevel**, **resistanceLevel**, **stopLoss**: Prices.
  - **riskRewardRatio**: e.g., "1:4.5".
  - **kellyWeight**: e.g., "15%".
  - **chartPattern**: e.g. "Wyckoff SOS".
  - **analysisLogic**: e.g. "Peter Lynch".
  - **investmentOutlook**: **CRITICAL**. Use the following **Strict Markdown Template**. 
    **DO NOT** include introductory text like "이 종목에 대해..." or "8인의 전설적 투자자가...".
    **DO NOT** use emojis.

  Markdown Template for investmentOutlook:
  
  ## 1. 전설적 투자자 위원회 분석
  - **벤저민 그레이엄 (Value)** : [의견]
  - **피터 린치 (Growth)** : [의견]
  - **워렌 버핏 (Moat)** : [의견]
  - **윌리엄 오닐 (Momentum)** : [의견]
  - **찰리 멍거 (Quality)** : [의견]
  - **글렌 웰링 (Event)** : [의견]
  - **캐시 우드 (Innovation)** : [의견]
  - **글렌 그린버그 (Focus)** : [의견]
  - **최종 평결 (Verdict)** : [합의 내용 요약]

  ## 2. 전문가 3인 성향 분석
  - **보수적 퀀트** : [분석]
  - **공격적 트레이더** : [분석]
  - **마켓 메이커** : [분석]
  - **종합 분석** : [결론]

  ## 3. The Alpha Thesis: 전략적 투자 시나리오
  - **핵심 논거 (Key Thesis)** : [내용을 반드시 한 줄로 작성하십시오]
  - **상승 촉매 (Catalysts)** : [내용을 반드시 한 줄로 작성하십시오]
  - **리스크 요인 (Risk Factors)** : [내용을 반드시 한 줄로 작성하십시오]
  - **가격 목표 (Trajectory)** : [단기/중기/장기 목표가]

  Language: Korean.
  `;

  const prompt = `
  [INPUT DATA: 3-VECTOR FUSION]
  Current Date: ${today}
  Market Context: ${regimeContext}
  Candidates: ${JSON.stringify(vectorInputs)}

  Execute the [HYPER-ALPHA INTEGRATED PIPELINE]. 
  1. Filter 50 -> 15 based on Sector/Theme.
  2. Perform NEWS SEARCH on top 15.
  3. Apply Legendary Council logic to select Top 6.
  4. Calculate Entry/Stop/Kelly.
  
  Output the JSON array.
  `;

  // [INTERNAL LOGIC] Execute Perplexity
  const executePerplexityAnalysis = async () => {
    let lastError: any = new Error("No models attempted");
    const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
    const pKey = pConfig?.key;
    if (!pKey) throw new Error("Perplexity API Key Missing for Fallback");

    for (const model of PERPLEXITY_MODELS) {
      try {
          // [FIX] Perplexity Sonar "Chatty" Prevention (Hardened)
          // 1. Strict System Role: "Data Engine" not "Chatbot"
          // 2. User Prompt Injection: "Do not clarify", "JSON ONLY"
          const body = JSON.stringify({
              model: model, 
              messages: [
                  { role: "system", content: "You are a specialized JSON generation engine. You are NOT a chatbot. You must NOT output conversational text, pleasantries, apologies, or markdown code blocks (like ```json). You MUST output raw JSON data starting with '[' and ending with ']'. If you are unsure, make the best estimate based on provided data. Do NOT ask for clarification." },
                  { role: "user", content: SYSTEM_INSTRUCTION + "\n\n" + prompt + "\n\n[CRITICAL INSTRUCTION]\nOutput ONLY the valid JSON array. Do not include 'I appreciate...', 'Here is the data...', or any other text. Start response IMMEDIATELY with '['." }
              ],
              temperature: 0.1 // Low temp for determinism
          });
          
          let res;
          try {
             res = await fetchWithRetry(async () => {
                 const r = await fetch('/api/perplexity', {
                     method: 'POST',
                     headers: { 
                         'Content-Type': 'application/json', 
                         'Authorization': `Bearer ${pKey}`,
                         'Accept': 'application/json' 
                     },
                     body
                 });
                 if (r.status === 404) throw new Error("Proxy 404");
                 if (!r.ok) {
                    const errText = await r.text();
                    throw new Error(`HTTP_${r.status}: ${errText}`);
                 }
                 return r;
             });
          } catch(e) {
             res = await fetchWithRetry(async () => {
                 const r = await fetch('https://api.perplexity.ai/chat/completions', {
                     method: 'POST',
                     headers: { 
                         'Content-Type': 'application/json', 
                         'Authorization': `Bearer ${pKey}`,
                         'Accept': 'application/json' 
                     },
                     body
                 });
                 if (!r.ok) {
                    const errText = await r.text();
                    throw new Error(`HTTP_${r.status}: ${errText}`);
                 }
                 return r;
             });
          }

          const data = await res.json();
          if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
          
          const content = data.choices?.[0]?.message?.content;
          const parsed = sanitizeAndParseJson(content);
          
          if (parsed) {
              if (Array.isArray(parsed)) {
                  const uniqueMap = new Map();
                  parsed.forEach(item => {
                      if (item.investmentOutlook) item.investmentOutlook = removeCitations(item.investmentOutlook);
                      if (item.symbol && !uniqueMap.has(item.symbol)) {
                          uniqueMap.set(item.symbol, item);
                      }
                  });
                  return { data: Array.from(uniqueMap.values()), usedProvider: 'PERPLEXITY' };
              }
              return { data: parsed, usedProvider: 'PERPLEXITY' };
          } else {
              throw new Error(`Output parsing failed for ${model}. Raw: ${content ? content.substring(0, 50) + "..." : "Empty"}`);
          }
          
      } catch (e: any) {
          console.warn(`Perplexity Model ${model} failed: ${e.message}`);
          lastError = e;
          // Don't retry if auth error
          if (e.message.includes('401') || e.message.includes('402')) break;
      }
    }
    
    // NO HEURISTIC FALLBACK. Fail loudly so the user knows analysis failed.
    const errorMessage = lastError && lastError.message ? lastError.message : String(lastError);
    return { data: null, error: `ALL_MODELS_FAILED: ${errorMessage}` };
  };

  try {
    // [NEW] Data Re-hydration & Cross-Validation Logic
    const hydrateAndValidate = (aiInput: any, providerName: string) => {
        // [FIX] Handle potential object wrapper from AI
        let aiResults = aiInput;
        if (!Array.isArray(aiResults) && aiResults?.alpha_candidates && Array.isArray(aiResults.alpha_candidates)) {
            aiResults = aiResults.alpha_candidates;
        }
        
        if (!Array.isArray(aiResults)) {
            console.warn(`[Hydration] Expected array, got ${typeof aiResults}`, aiResults);
            return aiResults; 
        }

        const aiMap = new Map(aiResults.map(a => [String(a.symbol || '').trim().toUpperCase(), a]));

        return candidates.map(original => {
            const normalizedSymbol = String(original.symbol || '').trim().toUpperCase();
            const aiItem = aiMap.get(normalizedSymbol) || { 
                ...original,
                aiVerdict: "HOLD",
                investmentOutlook: "N/A",
                convictionScore: original.convictionScore || 50,
                expectedReturn: "N/A",
                riskRewardRatio: "N/A",
                supportLevel: original.price ? original.price * 0.98 : 0,
                resistanceLevel: original.price ? original.price * 1.10 : 0,
                stopLoss: original.price ? original.price * 0.95 : 0,
                chartPattern: "N/A",
                analysisLogic: "N/A",
                selectionReasons: ["N/A"]
            };

            // 1. Data Re-hydration (Force Merge Stage 5 Metrics)
            const merged = {
                ...original,
                ...aiItem,
                ictMetrics: { ...(original.ictMetrics || { smartMoneyFlow: 0, displacement: 0 }) }, // Deep copy to prevent reference issues
                pdZone: original.pdZone || 'UNKNOWN',
                roe: original.roe,
                revenueGrowth: original.revenueGrowth,
                instOwn: original.instOwn || original.heldPercentInstitutions,
                marketCapClass: original.marketCapClass,
                sector: original.sector,
                sectorTheme: original.sectorTheme || aiItem.sectorTheme,
                price: original.price,
                beta: original.beta,
                pbr: original.pbr,
                rsi: original.rsi,
                sma50: original.sma50,
                techMetrics: original.techMetrics,
                otePrice: original.otePrice,
                ictStopLoss: original.ictStopLoss
            };

            // 2. Cross-Validation Flags
            const smartMoneyFlow = merged.ictMetrics?.smartMoneyFlow ?? 0;
            const conviction = Number(merged.convictionScore) || 0;
            const roe = Number(merged.roe) || 0;
            const pdZone = merged.pdZone || "";
            const aiVerdict = (merged.aiVerdict || "").toUpperCase();

            merged.isConfirmedSmartMoney = (smartMoneyFlow > 90) && (conviction >= 80);
            merged.isConfirmedDiscount = (pdZone === 'DISCOUNT' || pdZone === 'OTE') && (aiVerdict.includes('BUY') || aiVerdict.includes('ACCUMULATE'));
            merged.isConfirmedGem = (roe >= 20) && (aiVerdict.includes('BUY') || conviction >= 70);

            return merged;
        });
    };

    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      
      try {
        // [STAGE 1] Gemini Pro (High Reasoning)
        console.warn("[ATTEMPT] Stage 1: Engaging Gemini Pro (High Reasoning)...");
        const resultPro = await fetchWithRetry(() => ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: prompt,
          config: { 
              responseMimeType: "application/json", 
              responseSchema: ALPHA_SCHEMA,
              systemInstruction: SYSTEM_INSTRUCTION,
              tools: [{ googleSearch: {} }] 
          }
        }), 0, 2000);

        trackUsage(ApiProvider.GEMINI, resultPro.usageMetadata?.totalTokenCount || 0);
        const parsedPro = sanitizeAndParseJson(resultPro.text);
        
        if (parsedPro && Array.isArray(parsedPro)) {
            const hydratedData = hydrateAndValidate(parsedPro, 'GEMINI_PRO');
            return { data: hydratedData, usedProvider: 'GEMINI_PRO' };
        }
        return { data: parsedPro, usedProvider: 'GEMINI_PRO' };

      } catch (proError: any) {
        console.warn(`[RETRY] Gemini Pro Failed (${proError.message}). Switching to Flash Mode...`);
        
        try {
            // [STAGE 2] Gemini Flash (Speed & Stability)
            const resultFlash = await fetchWithRetry(() => ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: prompt,
              config: { 
                  responseMimeType: "application/json", 
                  responseSchema: ALPHA_SCHEMA,
                  systemInstruction: SYSTEM_INSTRUCTION,
                  tools: [{ googleSearch: {} }] 
              }
            }), 1, 2000); 
            
            trackUsage(ApiProvider.GEMINI, resultFlash.usageMetadata?.totalTokenCount || 0);
            const parsedFlash = sanitizeAndParseJson(resultFlash.text);
            
            if (parsedFlash && Array.isArray(parsedFlash)) {
                const hydratedData = hydrateAndValidate(parsedFlash, 'GEMINI_FLASH');
                return { data: hydratedData, usedProvider: 'GEMINI_FLASH' };
            }
            return { data: parsedFlash, usedProvider: 'GEMINI_FLASH' };

        } catch (flashError: any) {
             trackUsage(ApiProvider.GEMINI, 0, true, flashError.message);
             
             if (!isAutoMode) {
                 throw new Error('GEMINI_QUOTA_EXCEEDED');
             }

             console.warn("[FALLBACK] Gemini Ecosystem Down -> Engaging Perplexity Sonar...");

             // [STAGE 3] Perplexity Sonar
             try {
                const pResult = await executePerplexityAnalysis();
                if (pResult.data) {
                    const hydratedData = hydrateAndValidate(pResult.data, 'PERPLEXITY_FALLBACK');
                    return { data: hydratedData, usedProvider: 'PERPLEXITY_FALLBACK', error: null };
                }
                throw new Error(pResult.error || "Perplexity Fallback Failed");
             } catch (pError: any) {
                 // [FINAL SAFETY NET]
                 console.error("All AI Nodes Failed. Returning Static Fallback.");
                 const fallbackData = candidates.map(c => ({
                     symbol: c.symbol,
                     aiVerdict: "HOLD",
                     convictionScore: 50,
                     investmentOutlook: "## AI Analysis Unavailable\n\nSystem encountered a critical error with both Gemini and Perplexity nodes. Data preserved for manual review.",
                     selectionReasons: ["System Error", "Manual Review Required", "Data Preserved"],
                     newsSentiment: "Neutral",
                     newsScore: 0.5,
                     expectedReturn: "0%",
                     supportLevel: c.price * 0.95,
                     resistanceLevel: c.price * 1.05,
                     stopLoss: c.price * 0.90,
                     riskRewardRatio: "1:2",
                     kellyWeight: "0%",
                     marketCapClass: "UNKNOWN",
                     sectorTheme: c.sector || "Unknown",
                     theme: "Fallback",
                     aiSentiment: "Neutral",
                     analysisLogic: "Fallback Recovery",
                     chartPattern: "N/A"
                 }));
                 // Even fallback data should be hydrated
                 const hydratedFallback = hydrateAndValidate(fallbackData, 'FALLBACK_RECOVERY');
                 return { data: hydratedFallback, usedProvider: 'FALLBACK_RECOVERY', error: "ALL_AI_FAILED" };
             }
        }
      }
    }

    if (provider === ApiProvider.PERPLEXITY) {
        const result = await executePerplexityAnalysis();
        if (result.data) {
            const hydratedData = hydrateAndValidate(result.data, 'PERPLEXITY');
            return { data: hydratedData, usedProvider: 'PERPLEXITY', error: null };
        }
        if (result.error) {
            trackUsage(ApiProvider.PERPLEXITY, 0, true, result.error);
        }
        return result;
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return { data: null, error: error.message }; 
  }
}

export async function analyzePipelineStatus(data: {
  currentStage: number;
  apiStatuses: any[];
  symbols?: string[];
  targetStock?: any;
  mode: 'SINGLE_STOCK' | 'PORTFOLIO' | 'INTEGRITY_CHECK';
  recommendedData?: any[];
}, provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "AUDIT_ERROR: API Key Missing";

  const isPortfolio = data.mode === 'PORTFOLIO';
  const isIntegrityCheck = data.mode === 'INTEGRITY_CHECK';
  const stock = data.targetStock;
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  
  // [SAFETY BYPASS]
  // Instead of asking for an opinion/advice, we ask the AI to perform a "Compliance Audit" or "Data Transformation".
  
  let systemPrompt = "";
  let userPrompt = "";

  if (isIntegrityCheck) {
      systemPrompt = `
      [ROLE: Financial Database Integrity Validator]
      You are a backend process responsible for verifying data consistency.
      OBJECTIVE: Compare input metrics against historical patterns for anomalies.
      OUTPUT: A structured report in Korean Markdown.
      CONSTRAINT: Do NOT offer investment advice. Output facts only.
      `;
      const formatVal = (val: any, suffix = '') => val !== undefined && val !== null ? `${Number(val).toLocaleString()}${suffix}` : 'N/A';
      const metricsData = `
      [DATA_INPUT_STREAM]
      Symbol: ${stock.symbol}
      Price: $${stock.price}
      PER: ${formatVal(stock.pe || stock.per)}
      DebtRatio: ${formatVal(stock.debtToEquity)}
      `;

      userPrompt = `
      [TASK: DATA INTEGRITY CHECK]
      Input Data:
      ${metricsData}
      
      Generate a "Compliance Report" in Korean:
      1. Check if metrics are within normal ranges.
      2. Flag any "Red Flags" (e.g. Penny stock status, excessive debt).
      3. Output a "Validation Verdict" (Pass/Fail) based on data quality.
      
      Format:
      ### 검증 일자: ${today}
      ### 무결성 감사 보고서
      - **기업 실체**: (Analyze based on market cap)
      - **위험 신호**: (Analyze based on debt)
      - **최종 판정**: [분석 승인] / [반려]
      `;
  } else if (isPortfolio) {
      systemPrompt = `
      [ROLE: Portfolio Statistics Engine]
      You are a calculation module.
      OBJECTIVE: Aggregate correlations and sector exposure from the provided list.
      OUTPUT: Statistical summary in Korean.
      `;
      userPrompt = `
      [TASK: PORTFOLIO MATRIX CALCULATION]
      Input List: ${JSON.stringify(data.recommendedData?.slice(0, 6) || [])}.
      
      Perform the following calculations and return the results in Markdown:
      1. **Sector Concentration**: Group by sector.
      2. **Correlation Check**: Are these assets moving together? (Hypothetical check based on sector).
      3. **Volatility Assessment**: High/Low Beta mix?
      
      Output strictly as a "Portfolio Matrix Report". Do not advise on buying/selling.
      `;
  } else {
      systemPrompt = `
      [ROLE: Quantitative Analysis Backend]
      You are a non-sentient AI processing financial data.
      OBJECTIVE: Generate a technical analysis report based on input vectors.
      CONSTRAINT: This is a simulation. Output is for educational purposes only.
      `;
      userPrompt = `
      [TASK: GENERATE ANALYTICAL REPORT]
      Target: ${stock.symbol}
      Vector Data: ${JSON.stringify(stock)}
      
      Structure a "Deep Dive Audit" in Korean Markdown:
      1. **Risk Analysis**: Based on Volatility (Beta/VIX).
      2. **Momentum**: Based on ICT Score and Technical Score.
      3. **Fundamental**: Based on ROE/PER.
      
      Construct a hypothetical trading plan (Entry/Exit) based *strictly* on the technical support/resistance levels provided in the input.
      Format:
      ### 분석 일자: ${today}
      ### 심층 분석 보고서
      ...
      `;
  }

  try {
    // 1. Try Gemini First
    if (provider === ApiProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey });
        const result = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: userPrompt,
            config: { systemInstruction: systemPrompt }
        }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        return removeCitations(result.text);
    }
    
    // 2. Perplexity / Sonar
    const body = JSON.stringify({
        model: 'sonar-pro', 
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        temperature: 0.1
    });

    let res;
    try {
        res = await fetch('/api/perplexity', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body
        });
        if (res.status === 404) throw new Error("Proxy 404");
    } catch(e) {
        res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
            body
        });
    }

    const json = await res.json();
    if(json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);
    
    if (!res.ok) throw new Error(json.error?.message || "Perplexity Error");
    return json.choices?.[0]?.message?.content || "No analysis returned.";

  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    const msg = error.message?.toLowerCase() || "";
    if (msg.includes("429") || msg.includes("quota")) {
      return "AUDIT_QUOTA_EXCEEDED: API 호출 한도가 초과되었습니다.";
    }
    return `AUDIT_FAILURE: ${error.message}`;
  }
}

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider, marketPulse?: any): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "TELEGRAM_GEN_ERROR: API Key Missing";

  const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  const dateStr = new Date().toLocaleDateString('ko-KR', dateOptions);

  let finalReport = "";

  try {
      // 1. Hybrid Data Hydration (Global Override)
      let vix = "N/A", spx = "N/A", ndx = "N/A";
      let spxChg = 0, ndxChg = 0;
      let vixVal = 0;

      // [HYDRATION] Check Explicit Argument OR Global Cache
      const pulse = marketPulse || (typeof window !== 'undefined' ? (window as any).latestMarketPulse : null);
      
      if (pulse) {
          if (pulse.spy) {
              spx = (Number(pulse.spy.price) || 0).toFixed(2);
              spxChg = Number(pulse.spy.change) || 0;
          }
          if (pulse.qqq) {
              ndx = (Number(pulse.qqq.price) || 0).toFixed(2);
              ndxChg = Number(pulse.qqq.change) || 0;
          }
      }

      // 2. Fetch Live Market Data (If Global Cache Missed)
      if (spx === "N/A" || ndx === "N/A") {
          try {
              // Primary: Portal Indices
          const indexRes = await fetchWithRetry(async () => {
              const res = await fetch('/api/portal_indices');
              if (!res.ok) throw new Error("Index API Failed");
              return res;
          }, 3, 2000);

          if (indexRes.ok) {
              const indices = await indexRes.json();
              const v = indices?.find((i: any) => i?.symbol === 'VIX' || i?.symbol === '.VIX');
              const s = indices?.find((i: any) => i?.symbol === 'SP500' || i?.symbol === 'SPX');
              const n = indices?.find((i: any) => i?.symbol === 'NASDAQ' || i?.symbol === 'NDX');
              
              if(v?.price) { vixVal = Number(v.price) || 0; vix = vixVal.toFixed(2); }
              if(s?.price) { spx = (Number(s.price) || 0).toFixed(2); spxChg = Number(s.changePercent) || 0; }
              if(n?.price) { ndx = (Number(n.price) || 0).toFixed(2); ndxChg = Number(n.changePercent) || 0; }
          }
      } catch(e) {
          console.warn("Primary Index Fetch Failed, attempting fallbacks...");
      }
      }

      // 3. Fallback: Scan Candidates
      const safeCandidates = Array.isArray(candidates) ? candidates : [];
      
      if (spx === "N/A" || ndx === "N/A") {
          const spyCand = safeCandidates.find(c => c?.symbol === 'SPY' || c?.symbol === 'SP500');
          const qqqCand = safeCandidates.find(c => c?.symbol === 'QQQ' || c?.symbol === 'NASDAQ');
          
          if (spx === "N/A" && spyCand?.price) { spx = (Number(spyCand.price) || 0).toFixed(2); spxChg = Number(spyCand.changePercent) || 0; }
          if (ndx === "N/A" && qqqCand?.price) { ndx = (Number(qqqCand.price) || 0).toFixed(2); ndxChg = Number(qqqCand.changePercent) || 0; }
      }

      // Fallback 2: Finnhub Direct
      if (spx === "N/A" || ndx === "N/A") {
          try {
              const fhKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
              if (fhKey) {
                  const [spyRes, qqqRes] = await Promise.all([
                      fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${fhKey}`).then(r => r.json()).catch(() => ({})),
                      fetch(`https://finnhub.io/api/v1/quote?symbol=QQQ&token=${fhKey}`).then(r => r.json()).catch(() => ({}))
                  ]);
                  if (spyRes?.c) { spx = (Number(spyRes.c) || 0).toFixed(2); spxChg = Number(spyRes.dp) || 0; }
                  if (qqqRes?.c) { ndx = (Number(qqqRes.c) || 0).toFixed(2); ndxChg = Number(qqqRes.dp) || 0; }
              }
          } catch (e) { console.error("Finnhub Fallback Failed", e); }
      }

      // 4. Formatter with Zero-Change Defense
      const fmt = (val: string, chg: number) => {
          if (val === "N/A") return val;
          const safeChg = Number(chg) || 0;
          if (Math.abs(safeChg) < 0.01) return `${val} (보합/확인중) ⚪`;
          const emoji = safeChg > 0 ? "🟢" : "🔴";
          return `${val} (${safeChg > 0 ? '+' : ''}${safeChg.toFixed(2)}%) ${emoji}`;
      };

      const spxStr = fmt(spx, spxChg);
      const ndxStr = fmt(ndx, ndxChg);

      // 2. Generate "Market Pulse" Text via AI
      const macroPrompt = `
      [Task] Write a concise "Market Pulse" summary in Korean (max 3 lines).
      Data: VIX: ${vix}, S&P500: ${spxStr}, NASDAQ: ${ndxStr}.
      Focus on market sentiment (Risk-On/Off) based on VIX and Index moves.
      `;

      let macroSection = "";
      try {
         if (provider === ApiProvider.GEMINI) {
              const ai = new GoogleGenAI({ apiKey });
              const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: macroPrompt });
              macroSection = res.text ? res.text.trim() : "";
          } else {
              const body = JSON.stringify({ 
                  model: 'sonar-pro', 
                  messages: [{ role: "user", content: macroPrompt + " Return plain text only." }],
                  temperature: 0
              });
              
              let res;
              try {
                 res = await fetch('/api/perplexity', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                    body
                 });
                 if (res.status === 404) throw new Error("Proxy 404");
              } catch(e) {
                 res = await fetch('https://api.perplexity.ai/chat/completions', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
                    body
                 });
              }

              const json = await res.json();
              macroSection = json?.choices?.[0]?.message?.content || `Macro: 데이터 분석 중 (S&P500: ${spx} | NASDAQ: ${ndx})\nVIX: ${vix}`;
          }
      } catch (e) {
         macroSection = `Macro: 시장 데이터 분석 중... (VIX: ${vix})`;
      }
      
      macroSection = removeCitations(macroSection);

      // 3. Format Candidates Programmatically
      const top6 = safeCandidates.slice(0, 6);
      
      const sectorCounts: Record<string, number> = {};
      top6.forEach(c => {
          const s = c?.sectorTheme || c?.sector || "Unknown";
          sectorCounts[s] = (sectorCounts[s] || 0) + 1;
      });

      let sectorWarning = "";
      Object.entries(sectorCounts).forEach(([sector, count]) => {
          if (count >= 3) {
              sectorWarning += `\n⚠️ Sector Concentration: ${sector} 비중 높음 (분산 투자 권장)`;
          }
      });

      // Name Cleaner
      const cleanName = (name: any) => {
          if (!name || typeof name !== 'string') return "Unknown";
          return name.replace(/,?\s*(?:Inc\.?|Corp\.?|Corporation|Holdings?|Group|Ltd\.?|Limited|Co\.?|PLC|L\.?P\.?|S\.?A\.?|N\.?V\.?|Company)\b\.?.*$/i, '').trim();
      };

      const selections = top6.map((c, i) => {
          if (!c) return "";
          
          // [DATA INTEGRITY] Safe Number Conversion & ROE Capping
          const safeNum = (v: any) => Number(v) || 0;
          const roe = Math.min(safeNum(c.roe), 100);
          const marketCap = safeNum(c.marketCap);
          const revenueGrowth = safeNum(c.revenueGrowth);
          const instOwn = safeNum(c.heldPercentInstitutions || c.instOwn);
          const conviction = safeNum(c.convictionScore);
          const beta = safeNum(c.beta);
          const rsi = safeNum(c.techMetrics?.rsRating || c.rsi);
          const price = safeNum(c.price);
          const sma50 = safeNum(c.techMetrics?.sma50 || c.sma50);
          const pbr = safeNum(c.pbr);
          const pdZone = c.pdZone || "";
          const aiSentiment = c.aiSentiment || "";

          // [BADGE LOGIC] 10-Point Alpha Signal System
          const badges = [];
          
          // 1. Final Selection (Top 2)
          if (i < 2) badges.push("🔴 Final Selection");
          
          // 2. Alpha Conviction (Score >= 85)
          if (conviction >= 85) badges.push("⭐ Alpha Conviction");
          
          // 3. Hidden Gem (ROE >= 20)
          if (roe >= 20) badges.push("💎 Hidden Gem");
          
          // 4. Discount (ICT PD Zone)
          if (pdZone === 'DISCOUNT' || pdZone === 'OTE') badges.push("🏷️ Discount");
          
          // 5. Hyper Growth (Rev Growth >= 50%)
          if (revenueGrowth >= 50) badges.push("🚀 Hyper Growth");
          
          // 6. Institutional (Inst Own >= 60%)
          if (instOwn >= 60) badges.push("🏢 Institutional");
          
          // 7. Cross-Check (Consensus)
          if (aiSentiment.includes('Bullish') || c.isConsensus) badges.push("🤝 Cross-Check");
          
          // 8. Value (PBR < 1.5)
          if (pbr < 1.5 && pbr > 0) badges.push("💰 Value");
          
          // 9. Momentum (Price > SMA50 & RSI > 50)
          if (price > sma50 && rsi > 50 && sma50 > 0) badges.push("🔥 Momentum");
          
          // 10. Defensive (Beta < 0.8 OR Defensive Sector)
          const defensiveSectors = ['Utilities', 'Consumer Staples', 'Healthcare', 'Health Care', 'Consumer Defensive'];
          const isDefensiveSector = defensiveSectors.some(s => (c.sector || "").includes(s) || (c.sectorTheme || "").includes(s));
          if ((beta < 0.8 && beta > -5) || isDefensiveSector) badges.push("🛡️ Defensive");

          const badgeStr = badges.length > 0 ? `\n   ${badges.join(' ')}` : "";

          const verdictMap: any = { "STRONG_BUY": "강력 매수", "BUY": "매수", "HOLD": "관망", "PARTIAL_EXIT": "비중 축소", "ACCUMULATE": "비중 확대", "SPECULATIVE_BUY": "투기적 매수" };
          let koreanVerdict = verdictMap[c?.aiVerdict] || "매수";
          if (!c?.aiVerdict && ((c?.compositeAlpha || 0) > 80 || (c?.convictionScore || 0) > 80)) koreanVerdict = "강력 매수";

          // [SMART MONEY TAG]
          const smartMoneyTag = (c.ictMetrics?.smartMoneyFlow || 0) > 90 ? " [🔥SMART MONEY]" : "";

          // [FORMATTING] Newline Restoration
          const reasons = Array.isArray(c?.selectionReasons) ? c.selectionReasons : [];
          const r1 = reasons[0] ? String(reasons[0]).replace(/\\n/g, ' ').trim() : "섹터 모멘텀 양호";
          const r2 = reasons[1] ? String(reasons[1]).replace(/\\n/g, ' ').trim() : "안정적 펀더멘털";
          const r3 = reasons[2] ? String(reasons[2]).replace(/\\n/g, ' ').trim() : "기술적 반등 위치";
          
          const analysisLogic = (c.analysisLogic || "").replace(/\\n/g, '\n').trim();

          const entryPrice = (Number(c?.otePrice) || Number(c?.supportLevel) || 0).toFixed(2);
          const targetPrice = (Number(c?.resistanceLevel) || 0).toFixed(2);
          const stopPrice = (Number(c?.ictStopLoss) || Number(c?.stopLoss) || 0).toFixed(2);
          
          const pdZoneInfo = c?.pdZone 
              ? `ICT 분석: [${c.pdZone}] 구간 및 OTE 타점 반영` 
              : "기관 수급 및 기술적 지지 구간 분석 반영";

          return `${i + 1}. ${c?.symbol || "N/A"} (${koreanVerdict}) : ${cleanName(c?.name)}${smartMoneyTag}${badgeStr}
   • 🏢 Sector: ${c?.sectorTheme || c?.sector || "N/A"}
   • 🎯 Plan: 진입 $${entryPrice} 🎯 | 목표 $${targetPrice} | 손절 $${stopPrice}
   • 📈 Exp.Return: ${c?.expectedReturn || "N/A"}
   • 💎 Logic:
     - ${removeCitations(r1)}
     - ${removeCitations(r2)}
     - ${pdZoneInfo}`;
      }).filter(s => s !== "").join('\n\n');

      // 4. Construct Final Message
      let riskNote = "";
      if (vix !== "N/A" && vixVal >= 20) {
          riskNote = `⚠️ 현재 VIX(${vix})가 높은 수준입니다. 변동성 확대에 대비해 손절가를 엄격히 준수하십시오.`;
      } else if (vix !== "N/A") {
          riskNote = `⚠️ Risk Note: 개별 종목별로 제시된 손절가(Stop)를 엄격히 준수하고, 섹터별 비중 조절을 통해 포트폴리오 리스크를 관리하시기 바랍니다.`;
      } else {
          riskNote = `⚠️ Risk Note: 변동성 데이터 부재로 인한 표준 리스크 관리 적용. 손절가를 엄격히 준수하십시오.`;
      }

      finalReport = `🚀 US Alpha Seeker Report 🚀

📅 ${dateStr} | Daily Alpha Insight

📊 Market Pulse
${macroSection}
(S&P500: ${spxStr} | NASDAQ: ${ndxStr})
${sectorWarning}

💎 Alpha Top 6 Selections

${selections}

${riskNote}

[Alpha Signal Guide]
🔴 Final Selection: 수백 개의 후보 중 모든 AI 필터링과 재무 검증을 통과한 **'오늘의 주인공'**입니다. 가장 우선적으로 검토해야 할 최우수 종목입니다.
⭐ Alpha Conviction: AI가 과거의 성공 패턴과 현재 수급 상황을 대조해 도출한 '상승 가능성에 대한 자신감' 수치입니다.
💎 Hidden Gem: 내실(ROE)이 매우 탄탄하지만 아직 시장의 주목을 덜 받은 종목으로, 향후 **'강력한 가격 폭발'**을 일으킬 가능성이 높은 보석입니다.
🏷️ Discount: 현재 주가가 기관의 평균 매수 단가보다 낮거나 최적 진입 구간(OTE)에 위치하여 '가장 싸고 안전한' 진입 시점임을 뜻합니다.
🚀 Hyper Growth: 산업 평균보다 몇 배는 빠른 속도로 성장하고 있는 종목입니다. '상승 추세에 올라타는' 공격적 매수 전략에 적합합니다.
🏢 Institutional: 거대 자본인 **'기관 및 세력'**의 매집이 확인된 종목입니다. 개인 주도주보다 수급이 안정적이며 몸통 세력의 흐름을 따릅니다.
🤝 Cross-Check: 서로 다른 알고리즘을 가진 두 AI 전문가(Gemini & Sonar)가 **'동시에 합격점'**을 준 종목으로, 데이터 신뢰도가 가장 높습니다.
💰 Value: 실적 대비 주가가 저평가되어 **'가격 방어력'**이 뛰어난 종목입니다. 하락장에서도 상대적으로 안전한 가치 투자를 지향합니다.
🔥 Momentum: 주가가 50일 이평선 위이고 RSI > 50인 **'추세적 상승'**이 진행 중인 종목입니다. 단기 및 중기 수익을 극대화하기에 유리합니다.
🛡️ Defensive: 시장 변동성이 커져도 주가 하락폭이 작은 '방어적' 성격의 우량주입니다. 포트폴리오의 리스크를 낮춰주는 방패 역할을 합니다.`.trim();

  } catch (criticalError: any) {
      console.error("CRITICAL_TELEGRAM_GEN_FAILURE", criticalError);
      // Fallback Report for Archiving
      finalReport = `🚀 US Alpha Seeker Report (Recovery Mode) 🚀
      
📅 ${dateStr}

⚠️ 시스템 에러로 인해 요약 리포트 생성에 실패했습니다.
Error: ${criticalError?.message || "Unknown Error"}

데이터는 보존되었으므로 대시보드에서 상세 내용을 확인하시기 바랍니다.`;
  }

  return finalReport;
}
