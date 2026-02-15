
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar']; // Removed deprecated 'sonar-reasoning'

// [NEW] Usage Tracking System
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

// [NEW] Report Archiving Utility
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

// [HELPER] Remove Citations like [1], [2], [1, 2], [1][2]
export function removeCitations(text: string): string {
  if (!text) return "";
  // Removes: [1], [1,2], [1][2] patterns globally
  return text.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim();
}

// [UPDATED] Schema to include News Sentiment and Kelly Weighting
const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict: 'STRONG_BUY', 'BUY', 'HOLD', 'PARTIAL_EXIT'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Deep analysis in Korean Markdown. Must follow the 'Council Debate' format." },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "3 Key Drivers in Korean" },
      convictionScore: { type: Type.NUMBER, description: "Final weighted score (0.0 to 100.0)" },
      newsSentiment: { type: Type.STRING, description: "e.g., 'Ext. Positive', 'Positive', 'Neutral', 'Negative'" },
      newsScore: { type: Type.NUMBER, description: "Sentiment score 0.0 to 1.0 (Threshold > 0.6)" },
      expectedReturn: { type: Type.STRING, description: "Expected return percentage and duration (e.g. '+42% (Ten-Bagger Target)')" },
      theme: { type: Type.STRING, description: "Market narrative" },
      aiSentiment: { type: Type.STRING, description: "Overall Sentiment description in Korean" },
      analysisLogic: { type: Type.STRING, description: "Brief logic description in Korean" },
      chartPattern: { type: Type.STRING, description: "Detected technical pattern name (e.g. 'Wyckoff SOS')" },
      supportLevel: { type: Type.NUMBER, description: "Optimal Entry Zone (Order Block High)" },
      resistanceLevel: { type: Type.NUMBER, description: "First Profit Target" },
      stopLoss: { type: Type.NUMBER, description: "Invalidation Level (MSS Break)" },
      riskRewardRatio: { type: Type.STRING, description: "Risk-to-Reward ratio e.g. 1:4.5" },
      kellyWeight: { type: Type.STRING, description: "Suggested portfolio weight based on Kelly Criterion" }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "newsSentiment", "newsScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "stopLoss", "riskRewardRatio"]
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simulationPeriod: { type: Type.STRING, description: "Exact date range used e.g. '2023.01.01 ~ 2025.01.01'" },
    equityCurve: {
      type: Type.ARRAY,
      minItems: 24,
      maxItems: 24,
      items: {
        type: Type.OBJECT,
        properties: {
          period: { type: Type.STRING, description: "Timeline label (e.g. '23.01', '23.02'...)" },
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
    historicalContext: { type: Type.STRING, description: "Detailed strategy analysis and risk assessment in Korean Markdown. Use ## Headers, **Bold**, and - Bullet points. NO EMOJIS." }
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
    
    const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
            model: 'sonar-pro', 
            messages: [{ role: "user", content: prompt + " Return valid JSON only." }]
        })
    });
    
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

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "TELEGRAM_GEN_ERROR: API Key Missing";

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  
  let macroContext = "";
  let spxPrice = "N/A";
  let ndxPrice = "N/A";
  let vixPrice = "N/A";

  try {
      const indexRes = await fetch('/api/portal_indices');
      if (indexRes.ok) {
          const indices = await indexRes.json();
          const vix = indices.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX');
          const spx = indices.find((i: any) => i.symbol === 'SP500' || i.symbol === 'SPX');
          const ndx = indices.find((i: any) => i.symbol === 'NASDAQ' || i.symbol === 'NDX');
          
          spxPrice = spx?.price ? spx.price.toFixed(0) : "N/A";
          ndxPrice = ndx?.price ? ndx.price.toFixed(2) : "N/A";
          vixPrice = vix?.price ? vix.price.toFixed(2) : "N/A";

          macroContext = `
          S&P500: ${spx?.price?.toFixed(0) || 'N/A'}
          NASDAQ: ${ndx?.price?.toFixed(0) || 'N/A'}
          VIX: ${vix?.price?.toFixed(2) || 'N/A'}
          `;
      }
  } catch (e) {
      macroContext = "Market Index Data Unavailable";
  }

  const top6 = candidates.slice(0, 6).map(c => ({
      symbol: c.symbol,
      name: c.name || c.symbol, 
      verdict: c.aiVerdict, 
      entry: c.supportLevel,
      target: c.resistanceLevel,
      stop: c.stopLoss,
      reasons: c.selectionReasons || [], 
      expReturn: c.expectedReturn,
      theme: c.sectorTheme || c.theme || "Alpha Sector",
      score: c.compositeAlpha || c.convictionScore || 0,
      newsSentiment: c.newsSentiment || "Neutral"
  }));

  const prompt = `
  You are a helpful assistant.
  Please write a daily stock market summary report in Korean based on the provided dataset.
  
  DATASET:
  - Date: ${today}
  - Market Indices: S&P500=${spxPrice}, NASDAQ=${ndxPrice}, VIX=${vixPrice}
  - Top Picks Data: ${JSON.stringify(top6)}
  
  INSTRUCTIONS:
  1. Write in professional Korean.
  2. Do not explain what you are doing, just output the report.
  3. Translate English verdicts (STRONG_BUY -> 강력 매수, BUY -> 매수, ACCUMULATE -> 비중 확대, HOLD -> 관망).
  4. Use the specific format below.

  FORMAT:
  📅 ${today} | Daily Alpha Insight

  📊 Market Pulse
  Macro: S&P500과 NASDAQ이 [Short Summary] (S&P500: ${spxPrice} | NASDAQ: ${ndxPrice})
  - [Key Market Driver]
  - [Sector Trend]
  - [Volatility Note]

  VIX: ${vixPrice}. ([Volatility Status])

  💎 Alpha Top 6 Selections

  (Iterate through Top Picks)
  1. [Symbol] ([Verdict]) : [Name]
     - 🏢 Sector: [Theme]
     - 📰 Sentiment: [NewsSentiment]
     - 🎯 Plan: 진입 $[Entry] | 목표 $[Target] | 손절 $[Stop]
     - 📈 Exp.Return: [ExpReturn]
     - 💡 Logic:
       - 섹터 성장: [Context]
       - 실적 요인: [Context]
       - 기술적: [Context]

  ⚠️ Risk Note: [Risk Warning]
  `;

  const cleanOutput = (text: string) => {
      let clean = text.replace(/\[\d+(?:-\d+)?\]/g, ''); 
      clean = clean.replace(/([가-힣\)\.])(\d+)(?=\s|$|\n)/gm, '$1'); 
      clean = clean.replace(/🚀.*?Report.*?🚀/gi, '').trim(); 
      // Ensure specific phrase removal if AI includes refusals in the text body (rare with this prompt)
      clean = clean.replace(/I cannot function as a game data formatter/gi, '').trim();
      return removeCitations(clean); 
  };

  const executePerplexityFallback = async () => {
    const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
    const pKey = pConfig?.key;
    if (!pKey) throw new Error("Perplexity API Key Missing for Fallback");

    const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${pKey}`,
            'Accept': 'application/json' 
        },
        body: JSON.stringify({
            model: 'sonar-pro', 
            messages: [{ role: "user", content: prompt }]
        })
    });
    
    const json = await res.json();
    if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);
    if (!res.ok) throw new Error(json.error?.message || "Perplexity Fallback Failed");
    return json.choices?.[0]?.message?.content || "Fallback generation failed.";
  };

  try {
    let rawText = "";
    if (provider === ApiProvider.GEMINI) {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
            const result = await fetchWithRetry(() => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            }));
            trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
            rawText = result.text;
        } catch (geminiError: any) {
            console.warn("Gemini Quota Hit or Failure. Switching to Perplexity (Sonar) Fallback.", geminiError);
            rawText = await executePerplexityFallback();
        }
    } else {
        rawText = await executePerplexityFallback();
    }
    
    return cleanOutput(rawText);

  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return `BRIEF_GEN_FAILURE: ${error.message}`;
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
  
  let systemPrompt = "";
  let userPrompt = "";

  if (provider === ApiProvider.GEMINI) {
      systemPrompt = "You are a conservative Wall Street Quant Auditor. Focus on fundamentals, risk management, and valuation safety. **STRICTLY NO EMOJIS**. Use professional Korean Markdown.";
  } else {
      systemPrompt = "You are an aggressive Hedge Fund Analyst. Focus on momentum, market sentiment, and catalytic events. **STRICTLY NO EMOJIS**. Use professional Korean Markdown.";
  }

  if (isIntegrityCheck) {
      systemPrompt = "당신은 월가 헤지펀드의 컴플라이언스(Compliance) 담당자이자 수석 퀀트 분석가입니다. 투자 전 '무결성 검증(Integrity Check)' 단계에서 기업의 펀더멘털, 밸류에이션, 수급 데이터를 종합적으로 분석하여 스캠 및 상장폐지 위험을 차단하고 투자가치를 판단합니다. 보고서는 금융 전문가를 위한 것이므로 이모티콘을 절대 사용하지 않으며, 건조하고 전문적인 한국어 문체를 유지해야 합니다.";
      
      const formatVal = (val: any, suffix = '') => val !== undefined && val !== null ? `${Number(val).toLocaleString()}${suffix}` : 'N/A';
      
      const metricsData = `
      [DETAILED QUANT METRICS DATA]
      1. 기본 정보 & 가격
         - Symbol: ${stock.symbol}
         - Name: ${stock.name}
         - Price: $${stock.price}
         - Market Cap: ${formatVal(stock.marketCap)}
         - Currency: ${stock.currency || 'USD'}
         
      2. 밸류에이션 (Value)
         - PER: ${formatVal(stock.pe || stock.per)}x
         - PBR: ${formatVal(stock.pbr)}x
         - PSR: ${formatVal(stock.psr)}x
         - PEG Ratio: ${formatVal(stock.pegRatio)}
         - Target Mean Price: $${formatVal(stock.targetMeanPrice)}
         
      3. 수익성 & 효율성 (Quality)
         - ROE: ${formatVal(stock.roe)}%
         - ROA: ${formatVal(stock.roa)}%
         - EPS: $${formatVal(stock.eps)}
         - Operating Margin: ${formatVal(stock.operatingMargins ? stock.operatingMargins * 100 : 0)}%
         - Debt/Equity: ${formatVal(stock.debtToEquity)}%
         
      4. 성장성 & 현금흐름 (Growth & Cash)
         - Revenue Growth: ${formatVal(stock.revenueGrowth ? stock.revenueGrowth * 100 : 0)}%
         - Operating Cashflow: $${formatVal(stock.operatingCashflow)}
         
      5. 주주 환원 (Dividend)
         - Dividend Rate: $${formatVal(stock.dividendRate)}
         - Dividend Yield: ${formatVal(stock.dividendYield ? stock.dividendYield * 100 : 0)}%
         
      6. 수급 & 추세 (Momentum & Sentiment)
         - Volume: ${formatVal(stock.volume)}
         - Beta: ${formatVal(stock.beta)}
         - Inst. Ownership: ${formatVal(stock.heldPercentInstitutions ? stock.heldPercentInstitutions * 100 : 0)}%
         - Short Ratio: ${formatVal(stock.shortRatio)}
         - 50 Day MA: $${formatVal(stock.fiftyDayAverage)}
         - 200 Day MA: $${formatVal(stock.twoHundredDayAverage)}
         - 52W High: $${formatVal(stock.fiftyTwoWeekHigh)}
         - 52W Low: $${formatVal(stock.fiftyTwoWeekLow)}
         
      7. 메타 데이터
         - Sector: ${stock.sector || 'Unknown'}
         - Industry: ${stock.industry || 'Unknown'}
      `;

      userPrompt = `
      [GLOBAL INTEGRITY VALIDATOR]
      대상 종목: ${stock.symbol} (${stock.name || 'Unknown'})
      현재 주가: $${stock.price}
      검증 일자: ${today}

      ${metricsData}

      위 28가지 핵심 지표를 기반으로 이 종목이 당사의 심층 분석 파이프라인(Deep Dive Pipeline)에 진입할 가치가 있는지 검증하는 '무결성 감사 보고서'를 작성하십시오.
      단순한 수치 나열이 아니라, 지표 간의 상관관계를 해석하여 인사이트를 제공하십시오.

      **작성 원칙 (Guidelines)**:
      1. **이모티콘 사용 절대 금지**: 텍스트와 기호(-, *, #)만 사용하여 작성하십시오.
      2. **언어**: 전문적인 한국어(Korean)로 작성하십시오.
      3. **서식**: Markdown 포맷을 사용하여 가독성을 높이십시오. (## 헤더, - 불렛 포인트 활용)

      **필수 보고서 양식**:
      
      ### 검증 일자: ${today}
      ### 무결성 및 밸류에이션 감사 (Comprehensive Integrity Audit)
      
      1. **펀더멘털 및 재무 건전성 (Fundamental Health)**:
         - 수익성(ROE, Operating Margin)과 재무 안정성(Debt/Equity)을 평가하십시오.
         - 현금흐름(Operating Cashflow)이 건전한지 확인하십시오.
         
      2. **밸류에이션 및 적정 주가 분석 (Valuation Check)**:
         - PER, PBR, PEG 등을 고려할 때 현재 주가가 고평가/저평가 상태인지 진단하십시오.
         - Target Price와 현재가와의 괴리를 분석하십시오.
         
      3. **기관 수급 및 모멘텀 (Institutional & Momentum)**:
         - 기관 보유 비중(Inst. Ownership)과 공매도 비율(Short Ratio)이 시사하는 바를 해석하십시오.
         - 이동평균선(50/200 MA) 대비 현재 주가 위치를 통한 추세 판단.
         
      4. **최종 판정 (Gatekeeper Verdict)**:
         - **[분석 승인]** 또는 **[부적격(반려)]** 중 하나를 선택하여 명시하십시오.
         - 판단의 결정적 사유를 3가지 요점으로 요약하십시오.
      `;
  } else if (isPortfolio) {
      userPrompt = `
      [PORTFOLIO MATRIX AUDIT]
      대상 종목: ${JSON.stringify(data.recommendedData?.slice(0, 6) || [])}.
      분석 일자: ${today}
      
      다음 항목을 포함하여 한국어 Markdown으로 전략적 요약을 작성하십시오.
      **작성 원칙: 이모티콘(🚀, 📈, 💎 등)을 절대 사용하지 마십시오. 텍스트와 기호(-, *)로만 깔끔하게 작성하십시오.**

      ### 📅 분석 일자: ${today}
      
      1. **섹터 집중 리스크**: 포트폴리오가 특정 테마에 쏠려있는가?
      2. **알파 상관관계**: 종목들이 함께 움직이는 경향이 있는가?
      3. **매크로 민감도**: 금리/환율 변동에 얼마나 취약한가?
      4. **최종 포트폴리오 성향**: '공격형', '밸런스형', '방어형' 중 선택 및 이유.
      `;
  } else {
      let fundamentalContext = "";
      if (stock.fundamentalScore) {
          fundamentalContext = `
          [STAGE 3 FUNDAMENTAL DATA DETECTED]
          - Quality Score: ${stock.fundamentalScore}
          - Intrinsic Value (Safe Gauge): $${stock.intrinsicValue} (Upside: ${stock.upsidePotential}%)
          - Core Metrics: ROIC ${stock.roic}%, Rule of 40 ${stock.ruleOf40}, Gross Margin ${stock.grossMargin}%, FCF Yield ${stock.fcfYield}%
          - Radar Scores: Valuation ${stock.radarData?.valuation}, Profit ${stock.radarData?.profitability}, Growth ${stock.radarData?.growth}, Health ${stock.radarData?.financialHealth}, Moat ${stock.radarData?.moat}, Momentum ${stock.radarData?.momentum}
          `;
      }

      let technicalContext = "";
      if (stock.technicalScore || stock.techMetrics) {
          technicalContext = `
          [STAGE 4 TECHNICAL MOMENTUM DATA DETECTED]
          - Technical Score: ${stock.technicalScore}/100
          - RSI (14): ${stock.techMetrics?.rsRating || stock.techMetrics?.rsi || 'N/A'} (Over 70=Overbought, Under 30=Oversold)
          - TTM Squeeze: ${stock.techMetrics?.squeezeState || 'N/A'} (Check for explosive breakout potential)
          - Relative Volume (RVOL): ${stock.techMetrics?.rvol?.toFixed(2) || '1.0'}x (High RVOL = Institutional Interest)
          - Trend Strength: ${stock.techMetrics?.trend > 60 ? 'BULLISH' : 'BEARISH/NEUTRAL'} (Score: ${stock.techMetrics?.trend})
          `;
      }

      let ictContext = "";
      if (stock.ictScore || stock.ictMetrics) {
          ictContext = `
          [STAGE 5 INSTITUTIONAL FOOTPRINT (ICT) DATA DETECTED]
          - ICT Score: ${stock.ictScore || 'N/A'}/100
          - DISPLACEMENT (Semiconductors/Force): ${stock.ictMetrics?.displacement?.toFixed(0) || 'N/A'} (Score > 50 = Strong Institutional Move)
          - STRUCTURE (MSS): ${stock.ictMetrics?.marketStructure?.toFixed(0) || 'N/A'} (Score > 70 = Bullish Break confirmed)
          - SWEEP (Liquidity): ${stock.ictMetrics?.liquiditySweep?.toFixed(0) || 'N/A'} (Score > 80 = Stop Hunt Completed)
          - WHALES (Smart Money): ${stock.ictMetrics?.smartMoneyFlow?.toFixed(0) || 'N/A'}% (Flow > 50% = Accumulation)
          - Market State: ${stock.marketState || 'UNKNOWN'}
          `;
      }
      
      let stage2Context = "";
      if (stock.qualityScore || stock.profitScore) {
        stage2Context = `
        [STAGE 2 DEEP QUALITY FILTER DATA DETECTED]
        - Composite Quality Score: ${stock.qualityScore}/100
        - Profitability Score: ${stock.profitScore}/100 (ROE driven)
        - Safety Score: ${stock.safeScore}/100 (Debt driven)
        - Value Score: ${stock.valueScore}/100 (PE/PBR driven)
        `;
      }

      userPrompt = `
      [SINGLE ASSET DEEP DIVE AUDIT]
      대상: ${stock.symbol}
      데이터: 현재가 $${stock.price}, 확신도 ${stock.convictionScore || stock.compositeAlpha}%, AI판정 ${stock.aiVerdict}
      ${stage2Context}
      ${fundamentalContext}
      ${technicalContext}
      ${ictContext}
      분석 일자: ${today}

      당신은 헤지펀드의 수석 리스크 관리자(CRO)이자 베테랑 트레이더입니다.
      이 종목에 대해 개인 투자자가 실전에서 즉시 활용할 수 있는 심층 분석 보고서를 작성하십시오.
      
      **사용 가능한 모든 데이터([STAGE 2] ~ [STAGE 5])를 종합하여 입체적인 분석을 제공하십시오.**
      특히 STAGE 2의 품질 점수(Quality Scores)가 있다면, 이를 기반으로 기업의 기초 체력을 먼저 진단하십시오.
      
      **[STAGE 3 FUNDAMENTAL DATA]**, **[STAGE 4 TECHNICAL MOMENTUM DATA]**, 그리고 **[STAGE 5 INSTITUTIONAL FOOTPRINT (ICT) DATA]** 섹션이 존재할 경우, 해당 수치들을 반드시 분석에 인용하여 펀더멘털, 기술적 모멘텀, 그리고 기관 수급(ICT)의 조화를 종합적으로 평가하십시오.
      
      **특히 다음 4가지 핵심 기술적 지표(Tech Momentum)를 반드시 분석에 포함하십시오:**
      1. **RSI (14)**: 현재 과열권(70+)인지 침체권(30-)인지 판단.
      2. **TTM Squeeze**: 변동성 폭발(Squeeze Fired) 가능성 진단.
      3. **Relative Volume (RVOL)**: 기관 수급의 강도 평가 (1.5x 이상 여부).
      4. **Trend (EMA)**: 추세의 방향성(정배열/역배열) 확인.
      
      **작성 원칙**:
      1. **이모티콘(🚀, 💎, 🚨, 📅 등) 사용 절대 금지**. 오직 텍스트, 숫자, Markdown 기호(##, -, **)만 사용하십시오.
      2. 보고서의 어조는 냉철하고 전문적이어야 합니다.
      3. 가독성을 위해 불렛 포인트와 볼드체를 적극 활용하십시오.
      
      반드시 다음 형식을 준수하십시오 (제목에 날짜 포함):
      
      ### 분석 일자: ${today}
      ### 실전 투자자 체크포인트 (Deep Audit)
      
      1. **리스크 시나리오 (Red Team Analysis)**:
         - 이 트레이딩이 실패한다면 원인은 무엇인가? (구체적인 악재나 기술적 붕괴 지점)
         - "세력"이 개미를 털어내는 속임수(Fake-out) 패턴 예상 지점 (Liquidity Sweep 관점).
         
      2. **기관 수급 및 모멘텀 진단 (Smart Money & Momentum)**:
         - **ICT 구조(MSS/Displacement)**: 현재 시장 구조가 상승 전환(MSS)되었는지, 세력의 강한 개입(Displacement)이 있는지 평가.
         - **핵심 모멘텀 지표 (RSI/RVOL/Squeeze)**: RSI의 상태, RVOL을 통한 수급 강도, TTM Squeeze의 발동 여부를 종합하여 기술적 타점을 분석.
      
      3. **펀더멘털 건전성 진단 (Fundamental Audit)**:
         - 수익성(Profit Score), 안정성(Safety Score), 가치(Value Score)를 기반으로 한 기초 체력 평가.
         - ROIC 및 Rule of 40 기반의 기업 효율성 평가 (데이터 존재 시).
         - 현재 주가 대비 내재가치(Intrinsic Value)의 괴리율 분석 (데이터 존재 시).
         
      4. **실전 매매 가이드**:
         - **최적 진입 구간**: 분할 매수 타점 (구체적 가격대, Order Block 참고)
         - **필수 손절 라인**: 추세 붕괴로 간주하는 가격.
         - **청산 목표가**: 1차/2차 저항 라인.
         
      5. **최종 감사 의견 (Final Verdict)**:
         - 매수 승인 / 보류 / 즉시 청산 중 하나를 선택하고 그 이유를 한 문장으로 요약.
      `;
  }

  try {
    if (provider === ApiProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
        const result = await fetchWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: userPrompt,
            config: { systemInstruction: systemPrompt }
        }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        return removeCitations(result.text);
    }

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
    
    const json = await res.json();
    
    if (json.usage) trackUsage(ApiProvider.PERPLEXITY, json.usage.total_tokens || 0);

    if (!res.ok) throw new Error(`Perplexity API Error: ${res.status}`);
    const text = json.choices?.[0]?.message?.content || "No analysis returned.";
    return removeCitations(text);

  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return `AUDIT_FAILURE: ${error.message}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string, usedProvider?: string}> {
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

  // [HYPER-ALPHA INTEGRATED PIPELINE v3.0]
  // Ingests Stage 5 Data and applies Sentiment/SOS/Correlation/Kelly Logic.
  const vectorInputs = candidates.map(c => ({
      symbol: c.symbol,
      price: c.price,
      sector: c.sector || "Unknown",
      // [ENHANCED] Added for VSA & FCF analysis
      volume: c.volume,
      marketCap: c.marketCap,
      change: c.change, // Daily change % for VSA calculation
      fundamentals: {
          revenueGrowth: c.revenueGrowth || c.growthScore || 0, // Fallback if direct prop missing
          operatingCashflow: c.operatingCashflow || c.metrics?.cashflow || 0,
          qualityScore: c.qualityScore || c.fundamentalScore || 0
      },
      // Vector A: Fundamental Safety
      vectorA: {
          intrinsicGap: c.fairValueGap || 0,
          zScore: c.zScore || 0,
          qualityScore: c.fundamentalScore || c.qualityScore || 0
      },
      // Vector B: Technical Momentum
      vectorB: {
          rvol: c.techMetrics?.rvol || 1.0,
          squeeze: c.techMetrics?.squeezeState || 'OFF',
          rsi: c.techMetrics?.rsRating || c.techMetrics?.rsi || 50,
          trend: c.techMetrics?.trend || 50
      },
      // Vector C: Smart Money Reality
      vectorC: {
          displacement: c.ictMetrics?.displacement || 0,
          structure: c.ictMetrics?.marketStructure || 0,
          liquiditySweep: c.ictMetrics?.liquiditySweep || 0,
          smartMoneyFlow: c.ictMetrics?.smartMoneyFlow || 0
      }
  }));

  const SYSTEM_INSTRUCTION = `
  [SYSTEM ROLE: THE HYPER-ALPHA INTEGRATED EXECUTION PIPELINE - STAGE 6]
  You are the final decision-making engine for a quantitative hedge fund.
  You are receiving the top 12-50 elite candidates from the previous ICT stage.
  Your goal is to output a definitive "Investment Order Sheet" for exactly 6 assets.

  Current Market Regime: ${regimeContext} (VIX: ${vixValue}).

  [PIPELINE EXECUTION LOGIC - MANDATORY]

  🔥 **Step 1: Neural Sieve (Correlation & Theme Filter)**
  - Sector Constraint: You MUST select 6 stocks from at least **3 DIFFERENT SECTORS**.
  - Theme Check: Favor stocks aligning with current strong themes (e.g., AI, Defense, Bio, Industrial).
  - Kill correlators: Do not pick more than 2 stocks that move identically.

  📰 **Step 2: News Sentiment & Real-Time Context (THE FINAL GATE)**
  - **CRITICAL ACTION**: You MUST search for recent news (last 48h) for each shortlisted candidate.
  - **Sentiment Filter**: Score news sentiment from 0.0 to 1.0. 
    - If sentiment < 0.6: **REJECT** immediately, even if technicals are good.
    - Look for: Earnings beats, M&A, FDA approvals, Contracts, Institutional Upgrades.
  - **Rejection Logic**: Avoid stocks with recent accounting scandals, lawsuits, or dilution news.

  🚀 **Step 3: Wyckoff SOS (Sign of Strength) Verification**
  - **Effort vs Result**: Verify if Volume > 2x Avg while Price increases (Valid Breakout).
  - **Thrust**: Check if Price Range > 1.5x ATR (Momentum Injection).

  🎯 **Step 4: Execution & Risk Parameters**
  - **Entry (P_entry)**: \`min(OrderBlock, VWAP * 0.98)\`.
  - **Stop-Loss (P_sl)**: \`Support - (1.5 * ATR)\`.
  - **Allocation (Kelly)**: Suggest higher weight for stocks with Sentiment > 0.8 and Conviction > 90.

  [OUTPUT REQUIREMENTS - JSON ONLY]
  Return a JSON Array of exactly 6 Stocks.
  Each object must strictly match this schema:
  - **symbol**: Ticker.
  - **aiVerdict**: "STRONG_BUY" (Score>90 + Good News), "BUY" (Score>80), "PARTIAL_EXIT" (Bad News).
  - **convictionScore**: 0-100.
  - **newsSentiment**: "Ext. Positive", "Positive", "Neutral", "Negative".
  - **newsScore**: 0.0 to 1.0 float.
  - **marketCapClass**, **sectorTheme**, **theme**: Meta data.
  - **selectionReasons**: Array of 3 distinct, high-impact reasons in **KOREAN**. (e.g., "기관의 공격적 매집 포착", "AI 섹터 순환매의 수혜 예상", "완벽한 눌림목 지지 확인").
  - **expectedReturn**: e.g., "+42% (Ten-Bagger Target)".
  - **supportLevel**: Entry Price.
  - **resistanceLevel**: Target Price.
  - **stopLoss**: Stop Price.
  - **riskRewardRatio**: e.g., "1:4.5".
  - **kellyWeight**: e.g., "15%".
  - **chartPattern**: e.g. "Wyckoff SOS".
  - **investmentOutlook**: **CRITICAL**. Must use the following clean **Korean Markdown** format. **DO NOT USE EMOJIS**. Keep it professional.
  
  Format Template (as string):
  "### Neural Investment Outlook: [Symbol]\\n\\n#### 1. 전문가 3인 성향 분석 (The Council Debate)\\n- **보수적 퀀트**: [Analysis in Korean]\\n- **공격적 트레이더**: [Analysis in Korean]\\n- **마켓 메이커**: [Analysis in Korean]\\n\\n#### 2. 선정 타당성 및 미래 전망 (The Alpha Thesis)\\n[Synthesize the 3 views. Why this specific stock? What is the expected trajectory for the next 3 months? Conclude with a strong justification in Korean.]"

  **NO EMOJIS IN JSON STRINGS**.
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
  3. Filter 15 -> 6 based on Sentiment > 0.6 and Wyckoff SOS.
  4. Calculate Entry/Stop/Kelly for the Final 6.
  
  Output the JSON array.
  `;

  // [INTERNAL FALLBACK LOGIC]
  // If Gemini fails, switch to Perplexity (Sonar) automatically to ensure 100% completion.
  const executePerplexityAnalysis = async () => {
    let lastError;
    const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
    const pKey = pConfig?.key;
    if (!pKey) throw new Error("Perplexity API Key Missing for Fallback");

    // Loop through valid models only
    for (const model of PERPLEXITY_MODELS) {
      try {
          const res = await fetchWithRetry(async () => {
              const r = await fetch('https://api.perplexity.ai/chat/completions', {
                  method: 'POST',
                  headers: { 
                      'Content-Type': 'application/json', 
                      'Authorization': `Bearer ${pKey}`,
                      'Accept': 'application/json' 
                  },
                  referrerPolicy: 'no-referrer', 
                  body: JSON.stringify({
                      model: model, 
                      messages: [
                          { role: "system", content: SYSTEM_INSTRUCTION },
                          { role: "user", content: prompt }
                      ],
                      temperature: 0.1
                  })
              });
              if (!r.ok) {
                  const errText = await r.text();
                  throw new Error(`HTTP_${r.status}: ${errText}`);
              }
              return r;
          });

          const data = await res.json();
          if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
          
          const content = data.choices?.[0]?.message?.content;
          const parsed = sanitizeAndParseJson(content);
          if (parsed) {
              if (Array.isArray(parsed)) {
                  parsed.forEach(item => {
                      if (item.investmentOutlook) item.investmentOutlook = removeCitations(item.investmentOutlook);
                  });
              }
              return { data: parsed, usedProvider: 'PERPLEXITY' };
          }
          
      } catch (e: any) {
          console.warn(`Perplexity Model ${model} failed: ${e.message}`);
          lastError = e;
          if (e.message.includes('401') || e.message.includes('402')) break;
      }
    }
    return { data: null, error: `ALL_MODELS_FAILED: ${lastError?.message}` };
  };

  try {
    if (provider === ApiProvider.GEMINI) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
        const result = await fetchWithRetry(() => ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: { 
              responseMimeType: "application/json", 
              responseSchema: ALPHA_SCHEMA,
              systemInstruction: SYSTEM_INSTRUCTION,
              // [NEW] Enable Google Search Tool for Real-time News Sentiment
              tools: [{ googleSearch: {} }] 
          }
        }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        const parsed = sanitizeAndParseJson(result.text);
        if (parsed && Array.isArray(parsed)) {
            parsed.forEach(item => {
                if (item.investmentOutlook) item.investmentOutlook = removeCitations(item.investmentOutlook);
            });
        }
        return { data: parsed, usedProvider: 'GEMINI' };
      } catch (geminiError: any) {
        console.warn("Gemini Engine Failure (Quota/Error). Initiating Auto-Fallback to Sonar...", geminiError.message);
        trackUsage(ApiProvider.GEMINI, 0, true, geminiError.message);
        // [FAILSAFE] Auto-switch to Perplexity
        return await executePerplexityAnalysis();
      }
    }

    if (provider === ApiProvider.PERPLEXITY) {
        return await executePerplexityAnalysis();
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return { data: null, error: error.message }; 
  }
}
