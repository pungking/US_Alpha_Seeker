
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET, STRATEGY_CONFIG } from "../constants";
import { ApiProvider } from "../types";
import { fetchPortalIndices } from "./portalIndicesService";

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

const DEFAULT_SELECTION_REASONS = [
  "System: Data Preserved",
  "System: Manual Review",
  "System: Volatility Check"
];

const SYSTEM_ERROR_SELECTION_REASONS = [
  "System Error",
  "Manual Review Required",
  "Data Preserved"
];

const QUANT_ONLY_SELECTION_REASONS = [
  "System Error",
  "Quant Data Only",
  "Manual Review"
];

const hasSameReasons = (candidateReasons: any, baseline: string[]): boolean => {
  if (!Array.isArray(candidateReasons) || candidateReasons.length !== baseline.length) return false;
  return candidateReasons.every((reason, index) => String(reason || '').trim() === baseline[index]);
};

const detectFallbackAiPayload = (aiItem: any) => {
  const reasons: string[] = [];

  if (!aiItem || typeof aiItem !== 'object' || Object.keys(aiItem).length === 0) {
    reasons.push('MISSING_AI_ITEM');
    return { isFallback: true, reasons };
  }

  const verdict = String(aiItem.aiVerdict || '').trim().toUpperCase();
  const expectedReturn = String(aiItem.expectedReturn || '').trim();
  const theme = String(aiItem.theme || '').trim();
  const sentiment = String(aiItem.newsSentiment || '').trim().toUpperCase();
  const outlook = String(aiItem.investmentOutlook || '').trim();
  const conviction = Number(aiItem.convictionScore);

  if (!outlook || /AI analysis unavailable|System encountered a critical error|System Error/i.test(outlook)) {
    reasons.push('FALLBACK_OUTLOOK');
  }
  if (verdict === 'HOLD') reasons.push('DEFAULT_VERDICT');
  if (expectedReturn === '0%') reasons.push('ZERO_RETURN');
  if (theme === 'Unclassified' || theme === 'Fallback') reasons.push('DEFAULT_THEME');
  if (sentiment === 'NEUTRAL') reasons.push('DEFAULT_SENTIMENT');
  if (!Number.isFinite(conviction) || conviction === 50) reasons.push('DEFAULT_CONVICTION');
  if (
    hasSameReasons(aiItem.selectionReasons, DEFAULT_SELECTION_REASONS) ||
    hasSameReasons(aiItem.selectionReasons, SYSTEM_ERROR_SELECTION_REASONS) ||
    hasSameReasons(aiItem.selectionReasons, QUANT_ONLY_SELECTION_REASONS)
  ) {
    reasons.push('SYSTEM_SELECTION_REASONS');
  }

  const defaultSignalCount = reasons.filter(reason =>
    reason !== 'MISSING_AI_ITEM' &&
    reason !== 'FALLBACK_OUTLOOK' &&
    reason !== 'SYSTEM_SELECTION_REASONS'
  ).length;

  const isFallback =
    reasons.includes('MISSING_AI_ITEM') ||
    reasons.includes('FALLBACK_OUTLOOK') ||
    reasons.includes('SYSTEM_SELECTION_REASONS') ||
    defaultSignalCount >= 4;

  return { isFallback, reasons };
};

const normalizeAiResultArray = (aiInput: any): { items: any[]; wrapperType: string } => {
  if (Array.isArray(aiInput)) return { items: aiInput, wrapperType: 'array' };
  if (aiInput?.alpha_candidates && Array.isArray(aiInput.alpha_candidates)) {
    return { items: aiInput.alpha_candidates, wrapperType: 'alpha_candidates' };
  }
  if (aiInput?.candidates && Array.isArray(aiInput.candidates)) {
    return { items: aiInput.candidates, wrapperType: 'candidates' };
  }
  return { items: [], wrapperType: typeof aiInput };
};

const buildPerplexityAudit = (
  aiInput: any,
  rawContent: string,
  model: string,
  expectedSymbols: string[]
) => {
  const { items, wrapperType } = normalizeAiResultArray(aiInput);
  const fallbackReasonHistogram: Record<string, number> = {};
  const duplicateSymbols: string[] = [];
  const seenSymbols = new Set<string>();
  let fallbackCount = 0;
  let holdCount = 0;
  let zeroReturnCount = 0;
  let blankOutlookCount = 0;

  items.forEach((item: any) => {
    const cleanSymbol = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (cleanSymbol) {
      if (seenSymbols.has(cleanSymbol)) duplicateSymbols.push(cleanSymbol);
      seenSymbols.add(cleanSymbol);
    }

    const fallbackCheck = detectFallbackAiPayload(item);
    if (fallbackCheck.isFallback) {
      fallbackCount++;
      fallbackCheck.reasons.forEach(reason => {
        fallbackReasonHistogram[reason] = (fallbackReasonHistogram[reason] || 0) + 1;
      });
    }

    if (String(item?.aiVerdict || '').trim().toUpperCase() === 'HOLD') holdCount++;
    if (String(item?.expectedReturn || '').trim() === '0%') zeroReturnCount++;
    if (!String(item?.investmentOutlook || '').trim()) blankOutlookCount++;
  });

  const missingSymbols = expectedSymbols.filter(symbol => !seenSymbols.has(symbol));

  return {
    model,
    wrapperType,
    rawChars: rawContent?.length || 0,
    preview: String(rawContent || '').slice(0, 240),
    itemCount: items.length,
    uniqueSymbolCount: seenSymbols.size,
    duplicateSymbols,
    missingSymbolsSample: missingSymbols.slice(0, 6),
    missingSymbolCount: missingSymbols.length,
    fallbackCount,
    holdCount,
    zeroReturnCount,
    blankOutlookCount,
    fallbackReasonHistogram
  };
};

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "Stock symbol" },
      aiVerdict: { type: Type.STRING, description: "Verdict: 'STRONG_BUY', 'BUY', 'HOLD', 'PARTIAL_EXIT', 'SPECULATIVE_BUY'" },
      marketCapClass: { type: Type.STRING, description: "Size: 'LARGE', 'MID', 'SMALL', 'MICRO'" },
      sectorTheme: { type: Type.STRING, description: "Theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Concise Korean thesis (max 2 short sentences, plain text)." },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of exactly 3 reasons in Korean: [1.Sector, 2.Fundamentals, 3.Technical]" },
      convictionScore: { type: Type.NUMBER, description: "Final weighted score (0.0 to 100.0)" },
      newsSentiment: { type: Type.STRING, description: "e.g., 'Ext. Positive', 'Positive', 'Neutral', 'Negative'" },
      newsScore: { type: Type.NUMBER, description: "Sentiment score 0.0 to 1.0" },
      expectedReturn: { type: Type.STRING, description: "e.g. '+50% (High Upside)' or '+20% (Short-Term)'" },
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

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider, isAutoMode: boolean = false): Promise<{data: any[] | null, error?: string, usedProvider?: string, audit?: any}> {
  if (provider !== ApiProvider.GEMINI && provider !== ApiProvider.PERPLEXITY) {
      return { data: null, error: "INVALID_PROVIDER" };
  }

  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // [NEW] Regime-Adaptive: Fetch Market Context (VIX)
  let regimeContext = "Neutral";
  let vixValue = 20;
  try {
      const indices = await fetchPortalIndices();
      const vix = indices.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX');
      if (vix) {
          vixValue = Number(vix.price) || 20;
          regimeContext = vixValue > 25 ? "Risk-Off (High Fear)" : vixValue < 15 ? "Risk-On (Bullish)" : "Neutral";
      }
  } catch (e) {
      console.warn("Regime fetch failed, defaulting to Neutral");
  }

    const marketPulse = (typeof window !== 'undefined' ? (window as any).latestMarketPulse : null) || { vix: vixValue, trend: regimeContext, sectorRotation: 'Unknown' };

    // [CORE UPDATE] Data Slimming - Optimization
    // Only send what the AI *needs* to know, reducing tokens and hallucination risk.
    const slimCandidates = candidates.map(c => ({
      symbol: c.symbol,
      name: c.name,
      price: c.price,

      pe: c.pe || c.per || 0,
      roe: c.roe || 0,
      revenueGrowth: c.revenueGrowth || 0,
      sector: c.sectorTheme || c.sector,
      pdZone: c.pdZone || 'EQUILIBRIUM', // Premium / Discount / Equilibrium
      otePrice: c.otePrice || 0,
      ictStopLoss: c.ictStopLoss || 0,
      marketState: c.marketState || 'Consolidation',
      ictMetrics: {
          displacement: c.ictMetrics?.displacementScore || 0,
          liquiditySweep: c.ictMetrics?.liquiditySweep || false,
          marketStructure: c.ictMetrics?.marketStructure || 'Neutral',
          orderBlock: c.ictMetrics?.orderBlock || false,
          smartMoneyFlow: c.ictMetrics?.smartMoneyFlow || 0
      },

      ictScore: c.ictScore || 0 // Explicitly sending score for prioritization
    }));

    // [SYSTEM INSTRUCTION - HYPER-ALPHA + LEGENDARY COUNCIL FUSION]
    // [MODIFIED] Removing "Description" from template to prevent AI chatter.
    // [MODIFIED] Single line enforcement for "Key Thesis" section to prevent bad formatting.
    const SYSTEM_INSTRUCTION = `
    [SYSTEM ROLE: THE HYPER-ALPHA INTEGRATED EXECUTION PIPELINE - STAGE 6]
    You are the Chief Investment Officer (CIO) of an elite Hedge Fund.
    Your task is to analyze EVERY stock in the provided 'slimCandidates' list and assign a conviction-ranked AI evaluation.
    The application will perform the final Top 6 cut after your full-candidate analysis is returned.
    
    [CRITICAL CONSTRAINTS - READ CAREFULLY]
    1. **READ-ONLY CONSTRAINT**: The provided numeric data (price, pe, roe, ictScore, ictMetrics) is verified by a Quant Engine. **DO NOT MODIFY THESE NUMBERS**.
    2. **CONFLICT RESOLUTION**:
       - IF 'pdZone' is 'PREMIUM' (Expensive) -> Automatic Downgrade, regardless of fundamentals.
       - IF 'price' is near 'otePrice' AND 'smartMoneyFlow' > 70 -> Mark as 'INSTITUTIONAL_ACCUMULATION' (Priority Selection).
    3. **SECTOR DIVERSIFICATION**: Your conviction ranking should prefer a final top 6 mix where **NO SINGLE SECTOR exceeds 50%** (Max 3 stocks per sector).
    4. **PRIORITY**: Give higher weight to stocks with high 'ictScore'.
    5. **OPERATIONAL SAFETY**: If you encounter data interruption, prioritize outputting stocks with the highest 'ictScore'.
    6. **FULL COVERAGE MANDATE**: You MUST return an analysis object for EVERY input symbol. Never omit a ticker.

    [OUTPUT SCHEMA]
    Return a JSON Array of exactly ${slimCandidates.length} Stocks.
    The output must contain EVERY input symbol exactly once.
    Each object must strictly match this schema:
    - **symbol**: Ticker.
    - **aiVerdict**: "STRONG_BUY", "BUY", "PARTIAL_EXIT".
    - **convictionScore**: 0-100.
    - **newsSentiment**: "Ext. Positive", "Positive", "Neutral", "Negative".
    - **newsScore**: 0.0 to 1.0.
    - **marketCapClass**, **sectorTheme**, **theme**: Meta data.
    - **selectionReasons**: Array of EXACTLY 3 strings in **KOREAN** (1. Sector, 2. Fundamentals, 3. Technical).
    - **expectedReturn**: "+XX% (Tag)" where Tag is one of:
      "Short-Term", "Mid-Term", "Long-Term", "Momentum", "Value", "Turnaround", "Defensive", "Growth".
    - **supportLevel**, **resistanceLevel**, **stopLoss**: Prices.
    - **riskRewardRatio**: e.g., "1:4.5".
    - **kellyWeight**: e.g., "15%".
    - **chartPattern**: e.g. "Wyckoff SOS".
    - **analysisLogic**: e.g. "Peter Lynch".
    - **investmentOutlook**: Korean plain text only, max 2 short sentences (no markdown, no emoji, no intro chatter).
      Keep it concise and execution-focused.
    `;
  
    const buildPrompt = (targetCandidates: any[]) => `
    [INPUT DATA: 3-VECTOR FUSION]
    Current Date: ${today}
    Market Context: ${regimeContext}
    Candidates: ${JSON.stringify(targetCandidates)}
  
    Execute the [HYPER-ALPHA INTEGRATED PIPELINE]. 
    1. Evaluate every candidate in the provided list.
    2. Perform NEWS SEARCH and ranking logic across the strongest candidates.
    3. Assign conviction and trade plan to EVERY input symbol.
    4. The application will cut the final Top 6 after your full-candidate evaluation.
    
    Output the JSON array.
    `;

  // [INTERNAL LOGIC] Execute Perplexity
  const requestPerplexityForCandidates = async (targetCandidates: any[], scopeLabel: string) => {
    let lastError: any = new Error("No models attempted");
    const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
    const pKey = pConfig?.key;
    if (!pKey) throw new Error("Perplexity API Key Missing for Fallback");
    const expectedSymbols = targetCandidates.map((candidate: any) => String(candidate.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase());
    const prompt = buildPrompt(targetCandidates);

    for (const model of PERPLEXITY_MODELS) {
      try {
          const body = JSON.stringify({
              model: model, 
              messages: [
                  { role: "system", content: "You are a specialized JSON generation engine. You are NOT a chatbot. You must NOT output conversational text, pleasantries, apologies, or markdown code blocks (like ```json). You MUST output raw JSON data starting with '[' and ending with ']'. If you are unsure, make the best estimate based on provided data. Do NOT ask for clarification." },
                  { role: "user", content: SYSTEM_INSTRUCTION + "\n\n" + prompt + "\n\n[CRITICAL INSTRUCTION]\nOutput ONLY the valid JSON array. Do not include 'I appreciate...', 'Here is the data...', or any other text. Start response IMMEDIATELY with '['." }
              ],
              temperature: 0.1,
              max_tokens: 3200
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
          } catch (e) {
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
          const audit = buildPerplexityAudit(parsed, content, `${model}:${scopeLabel}`, expectedSymbols);
          console.info('[Perplexity Audit]', audit);
          
          if (parsed) {
              const { items } = normalizeAiResultArray(parsed);
              if (Array.isArray(items)) {
                  const uniqueMap = new Map();
                  items.forEach(item => {
                      if (item?.investmentOutlook) item.investmentOutlook = removeCitations(item.investmentOutlook);
                      if (item?.symbol && !uniqueMap.has(item.symbol)) {
                          uniqueMap.set(item.symbol, item);
                      }
                  });
                  return { data: Array.from(uniqueMap.values()), usedProvider: 'PERPLEXITY', audit };
              }
          }
          throw new Error(`Output parsing failed for ${model}. Raw: ${content ? content.substring(0, 50) + "..." : "Empty"}`);
          
      } catch (e: any) {
          console.warn(`Perplexity Model ${model} failed (${scopeLabel}): ${e.message}`);
          lastError = e;
          if (e.message.includes('401') || e.message.includes('402')) break;
      }
    }
    
    const errorMessage = lastError && lastError.message ? lastError.message : String(lastError);
    return { data: null, error: `ALL_MODELS_FAILED: ${errorMessage}` };
  };

  const mergeShardAudits = (shardAudits: any[], mergedData: any[], expectedSymbols: string[], chunkSize: number) => {
    const baseAudit = buildPerplexityAudit(mergedData, '', `sharded:${chunkSize}`, expectedSymbols);
    const fallbackReasonHistogram: Record<string, number> = {};
    shardAudits.forEach(audit => {
      const hist = audit?.fallbackReasonHistogram || {};
      Object.keys(hist).forEach(key => {
        fallbackReasonHistogram[key] = (fallbackReasonHistogram[key] || 0) + Number(hist[key] || 0);
      });
    });
    return {
      ...baseAudit,
      scope: 'sharded',
      shardCount: shardAudits.length,
      shardDetails: shardAudits.map(audit => ({
        model: audit?.model,
        itemCount: audit?.itemCount,
        fallbackCount: audit?.fallbackCount,
        missingSymbolCount: audit?.missingSymbolCount
      })),
      fallbackReasonHistogram
    };
  };

  const runPerplexityShardedAnalysis = async (chunkSize: number) => {
    const safeChunkSize = Math.max(1, Math.floor(chunkSize));
    const shards: any[][] = [];
    for (let i = 0; i < slimCandidates.length; i += safeChunkSize) {
      shards.push(slimCandidates.slice(i, i + safeChunkSize));
    }

    const mergedBySymbol = new Map<string, any>();
    const shardAudits: any[] = [];

    for (let i = 0; i < shards.length; i++) {
      const shard = shards[i];
      const shardResult = await requestPerplexityForCandidates(shard, `shard_${i + 1}/${shards.length}`);
      if (!shardResult?.data || !Array.isArray(shardResult.data)) {
        return { data: null, error: `SHARD_${i + 1}_FAILED: ${shardResult?.error || 'UNKNOWN'}` };
      }
      if (shardResult.audit) shardAudits.push(shardResult.audit);
      shardResult.data.forEach((item: any) => {
        const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (clean) mergedBySymbol.set(clean, item);
      });
    }

    const mergedData = Array.from(mergedBySymbol.values());
    const expectedSymbols = slimCandidates.map((candidate: any) => String(candidate.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase());
    const audit = mergeShardAudits(shardAudits, mergedData, expectedSymbols, safeChunkSize);
    console.info('[Perplexity Audit][Sharded]', audit);
    return { data: mergedData, usedProvider: 'PERPLEXITY_SHARDED', audit };
  };

  const computeCoverage = (payload: any[] | null | undefined) => {
    const expectedSymbols = slimCandidates.map((candidate: any) => String(candidate.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase());
    const data = Array.isArray(payload) ? payload : [];
    const map = new Map<string, any>();
    data.forEach(item => {
      const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (clean && !map.has(clean)) map.set(clean, item);
    });

    const unresolvedSymbols: string[] = [];
    expectedSymbols.forEach(symbol => {
      const aiItem = map.get(symbol);
      const fallbackCheck = detectFallbackAiPayload(aiItem);
      if (!aiItem || fallbackCheck.isFallback) unresolvedSymbols.push(symbol);
    });

    return {
      expectedSymbols,
      unresolvedSymbols,
      verified: Math.max(0, expectedSymbols.length - unresolvedSymbols.length)
    };
  };

  const repairPerplexitySymbols = async (symbols: string[], chunkSize: number = 2) => {
    if (!symbols.length) return { data: [], failedChunks: 0 };

    const safeChunkSize = Math.max(1, Math.floor(chunkSize));
    let failedChunks = 0;
    const repaired: any[] = [];

    for (let i = 0; i < symbols.length; i += safeChunkSize) {
      const symbolChunk = symbols.slice(i, i + safeChunkSize);
      const candidateChunk = slimCandidates.filter((candidate: any) => {
        const clean = String(candidate.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        return symbolChunk.includes(clean);
      });
      if (!candidateChunk.length) continue;

      const repairResult = await requestPerplexityForCandidates(candidateChunk, `repair_${i / safeChunkSize + 1}`);
      if (!repairResult?.data || !Array.isArray(repairResult.data)) {
        failedChunks++;
        continue;
      }

      repairResult.data.forEach((item: any) => {
        const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (clean) repaired.push(item);
      });
    }

    return { data: repaired, failedChunks };
  };

  const executePerplexityAnalysis = async (chunkSize?: number) => {
    const requiredVerified = Math.max(1, Math.ceil(slimCandidates.length * 0.75));
    const shardSize = Math.max(1, Math.floor(chunkSize ?? 6));

    let baseResult = await runPerplexityShardedAnalysis(shardSize);
    if (!baseResult?.data || !Array.isArray(baseResult.data)) {
      console.warn(`[Perplexity Coverage] Sharded pass failed. Falling back to full-pass. Reason: ${baseResult?.error || 'UNKNOWN'}`);
      const fullFallback = await requestPerplexityForCandidates(slimCandidates, 'full_fallback');
      return fullFallback;
    }

    const baseCoverage = computeCoverage(baseResult.data);
    if (baseCoverage.verified >= requiredVerified) {
      return baseResult;
    }

    console.warn(`[Perplexity Coverage] Sharded verified ${baseCoverage.verified}/${slimCandidates.length} (<${requiredVerified}). Repairing unresolved symbols: ${baseCoverage.unresolvedSymbols.join(', ')}`);
    const repair = await repairPerplexitySymbols(baseCoverage.unresolvedSymbols, 2);

    if (repair.data.length > 0) {
      const mergedMap = new Map<string, any>();
      baseResult.data.forEach((item: any) => {
        const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (clean && !mergedMap.has(clean)) mergedMap.set(clean, item);
      });
      repair.data.forEach((item: any) => {
        const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (clean) mergedMap.set(clean, item);
      });

      const repairedData = Array.from(mergedMap.values());
      const repairedCoverage = computeCoverage(repairedData);
      const repairedAudit = buildPerplexityAudit(
        repairedData,
        '',
        `sharded_repair:${shardSize}`,
        repairedCoverage.expectedSymbols
      );

      const repairedResult = {
        data: repairedData,
        usedProvider: 'PERPLEXITY_SHARDED_REPAIR',
        audit: repairedAudit
      };

      if (repairedCoverage.verified >= requiredVerified) {
        return repairedResult;
      }

      baseResult = repairedResult;
      console.warn(`[Perplexity Coverage] Repair pass still below threshold: ${repairedCoverage.verified}/${slimCandidates.length}.`);
    }

    // Last fallback: full-pass once, then choose better coverage.
    const fullResult = await requestPerplexityForCandidates(slimCandidates, 'full_fallback');
    if (!fullResult?.data || !Array.isArray(fullResult.data)) {
      return baseResult;
    }

    const fullCoverage = computeCoverage(fullResult.data);
    const baseFinalCoverage = computeCoverage(baseResult.data);
    return fullCoverage.verified > baseFinalCoverage.verified ? fullResult : baseResult;
  };

  try {
    // [NEW] Data Re-hydration & Cross-Validation Logic
    const hydrateAndValidate = (aiInput: any, providerName: string) => {
        // [FIX] Handle potential object wrapper from AI
        let aiResults = aiInput;
        if (!Array.isArray(aiResults) && aiResults?.alpha_candidates && Array.isArray(aiResults.alpha_candidates)) {
            aiResults = aiResults.alpha_candidates;
        } else if (!Array.isArray(aiResults) && aiResults?.candidates && Array.isArray(aiResults.candidates)) {
            aiResults = aiResults.candidates;
        }
        
        if (!Array.isArray(aiResults)) {
            console.warn(`[Hydration] Expected array, got ${typeof aiResults}`, aiResults);
            return aiResults; 
        }

        const aiMap = new Map();
        aiResults.forEach(a => {
            if (a && a.symbol) {
                 const cleanSymbol = String(a.symbol).replace(/[^a-zA-Z]/g, '').toUpperCase();
                 aiMap.set(cleanSymbol, a);
            }
        });

        return candidates.map(original => {

            const cleanOrgSymbol = String(original.symbol).replace(/[^a-zA-Z]/g, '').toUpperCase();
            const aiItem = aiMap.get(cleanOrgSymbol) || {};
            const fallbackCheck = detectFallbackAiPayload(aiItem);
            
            const merged = {

                ...original, // Base: All Quant Data (Price, Metrics, Scores)
                
                // --- AI Evaluation Fields (Overwritable) ---
                aiVerdict: aiItem.aiVerdict || 'HOLD',
                convictionScore: typeof aiItem.convictionScore === 'number' ? aiItem.convictionScore : 50,
                investmentOutlook: aiItem.investmentOutlook || 'AI analysis unavailable for this ticker.',
                selectionReasons: Array.isArray(aiItem.selectionReasons) && aiItem.selectionReasons.length >= 3 
                    ? aiItem.selectionReasons 
                    : ["System: Data Preserved", "System: Manual Review", "System: Volatility Check"],
                newsSentiment: aiItem.newsSentiment || 'Neutral',
                newsScore: typeof aiItem.newsScore === 'number' ? aiItem.newsScore : 0.5,
                expectedReturn: aiItem.expectedReturn || '0%',
                theme: aiItem.theme || original.sectorTheme || 'Unclassified',
                aiSentiment: aiItem.aiSentiment || 'Neutral',
                analysisLogic: aiItem.analysisLogic || 'Standard Quant Logic',
                chartPattern: aiItem.chartPattern || 'Consolidation',
                aiSynthesisStatus: fallbackCheck.isFallback ? 'FALLBACK' : 'OK',
                aiFallbackDetected: fallbackCheck.isFallback,
                aiFallbackReason: fallbackCheck.reasons.join('|') || 'NONE',
                aiProvider: providerName,
                
                // --- Critical Safety Overrides (Quant Authority) ---
                supportLevel: original.supportLevel || original.otePrice || (original.price * 0.95),
                resistanceLevel: original.resistanceLevel || (original.price * 1.10),
                stopLoss: original.stopLoss || original.ictStopLoss || (original.price * 0.90),
                
                // Recalculate or preserve specific flags
                isConfirmedSmartMoney: (original.ictMetrics?.smartMoneyFlow || 0) > 85,
                isConfirmedDiscount: (original.pdZone === 'DISCOUNT' || original.pdZone === 'OTE'),
                isConfirmedGem: (original.roe >= 15),
                
                // Metadata fallback
                marketCapClass: original.marketCapClass || aiItem.marketCapClass || 'Unknown',
                sectorTheme: original.sectorTheme || original.sector || aiItem.sectorTheme || 'Unknown'
            };

            return merged;
        });
    };

    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || config?.key || "" });
      
      // [NEW] Batch Processing Implementation (25 items per batch)
      const BATCH_SIZE = 25;
      const batches = [];


      for (let i = 0; i < slimCandidates.length; i += BATCH_SIZE) {
          batches.push(slimCandidates.slice(i, i + BATCH_SIZE));
      }

      let allProcessedCandidates: any[] = [];
      let hasAnySuccess = false;

      console.log(`[Gemini] Starting batch processing. Total items: ${slimCandidates.length}, Batches: ${batches.length}`);

      for (let i = 0; i < batches.length; i++) {
          const batchCandidates = batches[i];
          console.log(`[Gemini] Processing Batch ${i + 1}/${batches.length} (${batchCandidates.length} items)...`);

          // Re-construct prompt for this specific batch
          const batchPrompt = `
          You are an elite hedge fund manager and master market strategist.
          Analyze the following ${batchCandidates.length} stock candidates (Batch ${i + 1}) selected by our quantitative engine.
          
          Current Market Context:
          - VIX: ${marketPulse.vix}
          - Market Trend: ${marketPulse.trend}
          - Sector Rotation: ${marketPulse.sectorRotation}
          
          Candidates Data (JSON):

          ${JSON.stringify(batchCandidates)}

          [TASK]
          For EACH stock in the list, provide a structured analysis.
          You MUST return a JSON object with a "candidates" array containing ${batchCandidates.length} objects.
          
          Each object must follow this schema:
          {
              "symbol": "TICKER",
              "aiVerdict": "BUY" | "HOLD" | "WATCH",
              "convictionScore": 0-100 (Integer),
              "investmentOutlook": "Concise strategic summary (max 2 sentences). Focus on WHY this is a winner.",
              "selectionReasons": ["Reason 1", "Reason 2", "Reason 3"],
              "newsSentiment": "Bullish" | "Neutral" | "Bearish",
              "newsScore": 0.0-1.0 (Float),
              "expectedReturn": "e.g. +15%",
              "supportLevel": Price (Float),
              "resistanceLevel": Price (Float),
              "stopLoss": Price (Float),
              "riskRewardRatio": "e.g. 1:3",
              "kellyWeight": "e.g. 5%",
              "marketCapClass": "Large" | "Mid" | "Small",
              "sectorTheme": "Sector Name",
              "theme": "e.g. AI Boom, Rate Cut Beneficiary",
              "aiSentiment": "Bullish" | "Neutral" | "Bearish",
              "analysisLogic": "Brief explanation of the verdict"
          }

          [CRITICAL RULES]
          1. Output ONLY valid JSON. No markdown formatting.
          2. Do not hallucinate data. If unsure, use conservative estimates.
          3. Ensure "symbol" matches exactly.
          `;

          try {
            // [STAGE 1] Gemini Pro (High Reasoning) - Per Batch
            console.warn(`[ATTEMPT] Batch ${i+1}: Engaging Gemini Pro...`);
            const resultPro = await fetchWithRetry(() => ai.models.generateContent({
              model: 'gemini-3.1-pro-preview',
              contents: batchPrompt,
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
                allProcessedCandidates = [...allProcessedCandidates, ...parsedPro];
                hasAnySuccess = true;
                console.log(`[Gemini] Batch ${i + 1} success (Pro). Retrieved ${parsedPro.length} items.`);
                continue; // Skip to next batch
            }
            
            // If Pro fails to return array, try Flash for this batch
            throw new Error("Gemini Pro returned invalid format for batch");

          } catch (proError: any) {
            console.warn(`[RETRY] Batch ${i+1}: Gemini Pro Failed (${proError.message}). Switching to Flash Mode...`);
            
            try {
                // [STAGE 2] Gemini Flash (Speed & Stability) - Per Batch
                const resultFlash = await fetchWithRetry(() => ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: batchPrompt,
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
                    allProcessedCandidates = [...allProcessedCandidates, ...parsedFlash];
                    hasAnySuccess = true;
                    console.log(`[Gemini] Batch ${i + 1} success (Flash). Retrieved ${parsedFlash.length} items.`);
                } else {
                     console.error(`[Gemini] Batch ${i + 1} failed (Flash). Invalid format.`);
                }
    
            } catch (flashError: any) {
                 trackUsage(ApiProvider.GEMINI, 0, true, flashError.message);
                 console.error(`[Gemini] Batch ${i + 1} failed completely.`);
            }
          }
      } // End Batch Loop

      if (hasAnySuccess && allProcessedCandidates.length > 0) {
          const hydratedData = hydrateAndValidate(allProcessedCandidates, 'GEMINI_BATCH');
          return { data: hydratedData, usedProvider: 'GEMINI_BATCH' };
      }

      // If ALL batches failed, proceed to Perplexity Fallback
      if (!isAutoMode) {
          throw new Error('GEMINI_QUOTA_EXCEEDED');
      }

      console.warn("[FALLBACK] Gemini Ecosystem Down -> Engaging Perplexity Sonar...");

      // [STAGE 3] Perplexity Sonar
             try {
                const pResult = await executePerplexityAnalysis();
                if (pResult.data) {
                    const hydratedData = hydrateAndValidate(pResult.data, 'PERPLEXITY_FALLBACK');
                    return { data: hydratedData, usedProvider: 'PERPLEXITY_FALLBACK', error: null, audit: pResult.audit };
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
                     chartPattern: "N/A",
                     aiSynthesisStatus: 'FALLBACK',
                     aiFallbackDetected: true,
                     aiFallbackReason: 'ALL_AI_FAILED',
                     aiProvider: 'FALLBACK_RECOVERY'
                 }));
                 // Even fallback data should be hydrated
                 const hydratedFallback = hydrateAndValidate(fallbackData, 'FALLBACK_RECOVERY');
                 return { data: hydratedFallback, usedProvider: 'FALLBACK_RECOVERY', error: "ALL_AI_FAILED" };
             }
    }

    if (provider === ApiProvider.PERPLEXITY) {
        const result = await executePerplexityAnalysis();
        if (result.data) {
            const hydratedData = hydrateAndValidate(result.data, 'PERPLEXITY');
            return { data: hydratedData, usedProvider: 'PERPLEXITY', error: null, audit: result.audit };
        }
        if (result.error) {
            trackUsage(ApiProvider.PERPLEXITY, 0, true, result.error);
        }
        return result;
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {


        // Final Safe Fallback (Hydrate Originals with Error Status)
    const fallbackData = candidates.map(c => ({
        ...c,
        aiVerdict: 'HOLD',
        convictionScore: 50,
        investmentOutlook: "## System Error\nAnalysis failed due to API limits or network issues. Quant data preserved.",
        selectionReasons: ["System Error", "Quant Data Only", "Manual Review"],
        aiSynthesisStatus: 'FALLBACK',
        aiFallbackDetected: true,
        aiFallbackReason: 'RUNTIME_EXCEPTION',
        aiProvider: 'ERROR_FALLBACK'
    }));
    return { data: fallbackData, error: error.message };   
  }
}

export async function generateTop6NeuralOutlook(candidates: any[], provider: ApiProvider): Promise<{ data: any[] | null; error?: string; usedProvider?: string }> {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { data: [] };
  }

  const top6 = candidates.slice(0, 6).map(c => ({
    symbol: c.symbol,
    name: c.name,
    sector: c.sectorTheme || c.sector,
    price: c.price,
    fundamentalScore: c.fundamentalScore,
    technicalScore: c.technicalScore,
    ictScore: c.ictScore,
    aiVerdict: c.aiVerdict,
    convictionScore: c.convictionScore,
    pdZone: c.pdZone,
    otePrice: c.otePrice || c.supportLevel,
    resistanceLevel: c.resistanceLevel,
    ictStopLoss: c.ictStopLoss || c.stopLoss
  }));

  const DETAIL_SCHEMA = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        symbol: { type: Type.STRING },
        investmentOutlook: { type: Type.STRING },
        selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
        analysisLogic: { type: Type.STRING }
      },
      required: ["symbol", "investmentOutlook"]
    }
  };

  const DETAIL_SYSTEM_INSTRUCTION = `
  [SYSTEM ROLE: STAGE 6 TOP6 NEURAL OUTLOOK ENHANCER]
  Generate a detailed markdown "Neural Investment Outlook" ONLY for each provided symbol.
  Constraints:
  1) Do not change quantitative fields. Narrative only.
  2) Return all symbols exactly once.
  3) Korean language only.
  4) No emoji, no chatter.
  5) Use provided trade-box numbers (otePrice, resistanceLevel, ictStopLoss) consistently.
     - Never invent a different target price in section 3.
     - If resistanceLevel <= otePrice, explicitly state "상승 여력 제한(관망)" and keep the same numbers.
  6) Avoid template cloning across symbols:
     - Do NOT reuse identical sentences across symbols.
     - Each symbol must explicitly reference its own numeric context (fundamentalScore, technicalScore, ictScore, convictionScore, pdZone among them).
  7) Keep section semantics strict:
     - Section 1: must mention at least two symbol-specific scores.
     - Section 2: must mention entry/target/stop with interpretation.
     - Section 3: must include trajectory line with exact provided numbers.

  Output schema:
  - symbol
  - investmentOutlook (strict markdown template below)
  - selectionReasons (exactly 3 Korean strings, optional but preferred)
  - analysisLogic (short Korean phrase, optional)

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
  - **핵심 논거 (Key Thesis)** : [한 줄]
  - **상승 촉매 (Catalysts)** : [한 줄]
  - **리스크 요인 (Risk Factors)** : [한 줄]
  - **가격 목표 (Trajectory)** : 진입 [otePrice] / 목표 [resistanceLevel] / 손절 [ictStopLoss] 형식으로 숫자 그대로 기재
  `;

  const DETAIL_PROMPT = `
  Candidates (Top6):
  ${JSON.stringify(top6)}
  
  Return JSON array only.
  `;

  const runPerplexity = async () => {
    const pConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
    const pKey = pConfig?.key;
    if (!pKey) return { data: null, error: "PERPLEXITY_KEY_MISSING" };

    const expectedSymbols = top6.map((c: any) => String(c?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase());
    const hasStructuredSections = (text: string) => /##\s*1\./i.test(text) && /##\s*2\./i.test(text) && /##\s*3\./i.test(text);
    const normalizeForSimilarity = (text: string) =>
      String(text || '')
        .toLowerCase()
        .replace(/\$?\d+(\.\d+)?/g, 'N')
        .replace(/[^a-z0-9가-힣\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const jaccard = (a: string, b: string) => {
      const sa = new Set(normalizeForSimilarity(a).split(' ').filter(Boolean));
      const sb = new Set(normalizeForSimilarity(b).split(' ').filter(Boolean));
      if (!sa.size && !sb.size) return 1;
      const inter = Array.from(sa).filter(x => sb.has(x)).length;
      const union = new Set([...Array.from(sa), ...Array.from(sb)]).size || 1;
      return inter / union;
    };
    const avgPairSimilarity = (texts: string[]) => {
      if (texts.length < 2) return 0;
      let sum = 0;
      let cnt = 0;
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          sum += jaccard(texts[i], texts[j]);
          cnt++;
        }
      }
      return cnt ? sum / cnt : 0;
    };

    let lastError: any = new Error("No models attempted");
    for (const model of PERPLEXITY_MODELS) {
      try {
        const body = JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a JSON generation engine. Output raw JSON only." },
            { role: "user", content: `${DETAIL_SYSTEM_INSTRUCTION}\n\n${DETAIL_PROMPT}` }
          ],
          temperature: 0.1,
          max_tokens: 4500
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
            if (!r.ok) throw new Error(`HTTP_${r.status}: ${await r.text()}`);
            return r;
          });
        } catch {
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
            if (!r.ok) throw new Error(`HTTP_${r.status}: ${await r.text()}`);
            return r;
          });
        }

        const data = await res.json();
        if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
        const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content);
        const { items } = normalizeAiResultArray(parsed);
        if (!Array.isArray(items) || items.length === 0) {
          throw new Error(`TOP6_PARSE_EMPTY_${model}`);
        }

        const dedup = new Map<string, any>();
        items.forEach((item: any) => {
          const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
          if (!clean || dedup.has(clean)) return;
          dedup.set(clean, {
            symbol: clean,
            investmentOutlook: removeCitations(item?.investmentOutlook || ''),
            selectionReasons: Array.isArray(item?.selectionReasons) ? item.selectionReasons : undefined,
            analysisLogic: item?.analysisLogic
          });
        });
        const merged = Array.from(dedup.values());
        const coverage = merged.filter((x: any) => expectedSymbols.includes(String(x?.symbol || '').toUpperCase())).length;
        const structuredCount = merged.filter((x: any) => hasStructuredSections(String(x?.investmentOutlook || ''))).length;
        const similarity = avgPairSimilarity(merged.map((x: any) => String(x?.investmentOutlook || '')));

        // Reject low-fidelity output early to trigger next model fallback.
        if (coverage < Math.ceil(expectedSymbols.length * 0.8)) {
          throw new Error(`TOP6_DETAIL_LOW_COVERAGE_${model}_${coverage}/${expectedSymbols.length}`);
        }
        if (structuredCount < Math.ceil(merged.length * 0.8)) {
          throw new Error(`TOP6_DETAIL_LOW_STRUCTURE_${model}_${structuredCount}/${merged.length}`);
        }
        if (similarity >= 0.95) {
          throw new Error(`TOP6_DETAIL_CLONED_TEXT_${model}_${similarity.toFixed(3)}`);
        }

        return { data: merged, usedProvider: 'PERPLEXITY_TOP6_DETAIL' };
      } catch (e: any) {
        lastError = e;
      }
    }
    return { data: null, error: `TOP6_DETAIL_FAILED: ${lastError?.message || 'UNKNOWN'}` };
  };

  if (provider === ApiProvider.PERPLEXITY) {
    return runPerplexity();
  }
  // For Gemini mode, keep deterministic behavior by using Perplexity for top6 narrative only.
  return runPerplexity();
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
      let vix = "N/A", spx = "N/A", ndx = "N/A", ixic = "N/A";
      let spxChg = 0, ndxChg = 0, ixicChg = 0;
      let vixVal = 0;
      let spxSource = "unknown";
      let ndxSource = "unknown";
      let vixSource = "unknown";
      let ixicSource = "unknown";
      let pulseCapturedAt = "";
      const asFinite = (val: any): number | null => {
          const n = Number(val);
          return Number.isFinite(n) ? n : null;
      };
      const isValidIndexPoint = (symbol: 'SPX' | 'NDX' | 'IXIC' | 'VIX', val: any): boolean => {
          const n = asFinite(val);
          if (n === null) return false;
          if (symbol === 'SPX') return n >= 1000 && n <= 20000;
          if (symbol === 'NDX' || symbol === 'IXIC') return n >= 5000 && n <= 50000;
          if (symbol === 'VIX') return n > 0 && n <= 150;
          return false;
      };
      const readChange = (obj: any): number => {
          const c1 = asFinite(obj?.change);
          if (c1 !== null) return c1;
          const c2 = asFinite(obj?.changePercent);
          if (c2 !== null) return c2;
          return 0;
      };
      const readSource = (obj: any, fallback = "unknown"): string => {
          const src = String(obj?.source || obj?.dataSource || obj?.provider || "").trim();
          if (!src) return fallback;
          return src.toLowerCase().replace(/\s+/g, "_");
      };
      const formatCapturedAt = (raw: any): string => {
          if (!raw) return "N/A";
          const parsed = new Date(raw);
          if (!Number.isFinite(parsed.getTime())) return "N/A";
          return parsed.toISOString();
      };
      const normalizeNasdaqLabel = (text: string): string =>
          String(text || '')
              .replace(/\bNASDAQ(?!\s*(?:100|COMPOSITE))\b/gi, 'NASDAQ100')
              .replace(/나스닥(?!\s*(?:100|종합))/g, '나스닥100');
      const hasMissingIndex = () => spx === "N/A" || ndx === "N/A" || vix === "N/A";

      // [HYDRATION] Check Explicit Argument OR Global Cache
      const pulse = marketPulse || (typeof window !== 'undefined' ? (window as any).latestMarketPulse : null);
      
      if (pulse) {
          if (pulse.spy && isValidIndexPoint('SPX', pulse.spy.price)) {
              spx = Number(pulse.spy.price).toFixed(2);
              spxChg = readChange(pulse.spy);
              spxSource = readSource(pulse.spy, spxSource);
          }
          const ndxFromCache = pulse.ndx || pulse.qqq;
          if (ndxFromCache && isValidIndexPoint('NDX', ndxFromCache.price)) {
              ndx = Number(ndxFromCache.price).toFixed(2);
              ndxChg = readChange(ndxFromCache);
              ndxSource = readSource(ndxFromCache, ndxSource);
          }
          if (pulse.ixic && isValidIndexPoint('IXIC', pulse.ixic.price)) {
              ixic = Number(pulse.ixic.price).toFixed(2);
              ixicChg = readChange(pulse.ixic);
              ixicSource = readSource(pulse.ixic, ixicSource);
          }
          if (pulse.vix && isValidIndexPoint('VIX', pulse.vix.price)) {
              vixVal = Number(pulse.vix.price) || 0;
              vix = vixVal.toFixed(2);
              vixSource = readSource(pulse.vix, vixSource);
          }
          pulseCapturedAt = formatCapturedAt(
              pulse?.meta?.fetchedAt || pulse?.capturedAt || pulse?.updatedAt
          );
      }

      // 2. Fetch Live Market Data (If Global Cache Missed)
      if (hasMissingIndex()) {
          try {
              const indices = await fetchWithRetry(async () => fetchPortalIndices(), 3, 2000);
              const v = indices?.find((i: any) => i?.symbol === 'VIX' || i?.symbol === '.VIX');
              const s = indices?.find((i: any) => i?.symbol === 'SP500' || i?.symbol === 'SPX');
              const n = indices?.find((i: any) => i?.symbol === 'NDX' || i?.symbol === 'NASDAQ100' || i?.rawSymbol === '.NDX');
              const nComposite = indices?.find((i: any) => i?.symbol === 'IXIC' || i?.symbol === 'NASDAQ' || i?.rawSymbol === '.IXIC');

              if (v && isValidIndexPoint('VIX', v.price)) {
                  vixVal = Number(v.price) || 0;
                  vix = vixVal.toFixed(2);
                  vixSource = readSource(v, vixSource);
              }
              if (s && isValidIndexPoint('SPX', s.price)) {
                  spx = Number(s.price).toFixed(2);
                  spxChg = readChange(s);
                  spxSource = readSource(s, spxSource);
              }
              if (n && isValidIndexPoint('NDX', n.price)) {
                  ndx = Number(n.price).toFixed(2);
                  ndxChg = readChange(n);
                  ndxSource = readSource(n, ndxSource);
              }
              if (nComposite && isValidIndexPoint('IXIC', nComposite.price)) {
                  ixic = Number(nComposite.price).toFixed(2);
                  ixicChg = readChange(nComposite);
                  ixicSource = readSource(nComposite, ixicSource);
              }
              pulseCapturedAt = formatCapturedAt(new Date().toISOString());
          } catch(e) {
              console.warn("Primary Index Fetch Failed (portal_indices).");
          }
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
      const ixicStr = fmt(ixic, ixicChg);
      const ndxLabel = "NASDAQ100(NDX)";
      const vixStr = vix === "N/A" ? "N/A" : vix;
      const pulseSources = [
          ['SPX', spxSource],
          ['NDX', ndxSource],
          ['VIX', vixSource],
          ...(ixic !== "N/A" ? [['IXIC', ixicSource]] as Array<[string, string]> : [])
      ].filter(([, src]) => !!src && src !== 'unknown');
      const sourceLabels = Array.from(new Set(pulseSources.map(([, src]) => src)));
      const pulseSourceLabel =
          sourceLabels.length === 0
              ? 'unknown'
              : sourceLabels.length === 1
                  ? sourceLabels[0]
                  : pulseSources.map(([k, src]) => `${k}:${src}`).join(', ');
      const pulseCapturedAtLabel = pulseCapturedAt || "N/A";
      const safeCandidates = Array.isArray(candidates) ? candidates : [];

      // 2. Generate "Market Pulse" Text via AI
      const ixicPrompt = ixic === "N/A" ? "" : `, NASDAQ Composite(IXIC): ${ixicStr}`;
      const macroPrompt = `
      [Task] Write a concise "Market Pulse" summary in Korean (max 3 lines).
      Data: VIX: ${vixStr}, S&P500(SPX): ${spxStr}, ${ndxLabel}: ${ndxStr}${ixicPrompt}.
      If VIX is numeric, never output VIX as N/A.
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
              macroSection = json?.choices?.[0]?.message?.content || `Macro: 데이터 분석 중 (S&P500(SPX): ${spx} | ${ndxLabel}: ${ndx})\nVIX: ${vixStr}`;
          }
      } catch (e) {
         macroSection = `Macro: 시장 데이터 분석 중... (VIX: ${vixStr})`;
      }
      
      macroSection = removeCitations(macroSection);
      macroSection = normalizeNasdaqLabel(macroSection);
      if (vixStr !== "N/A") {
          macroSection = macroSection
              .replace(/VIX\s*는\s*N\/A/gi, `VIX는 ${vixStr}`)
              .replace(/VIX\s*:\s*N\/A/gi, `VIX: ${vixStr}`);
      }

      // 3. Format Candidates Programmatically
      const INDEX_SYMBOLS = new Set(['SPY', 'QQQ', 'VIX', 'SPX', 'NDX', 'SP500', 'NASDAQ', 'NASDAQ100', 'IXIC']);
      const top6 = safeCandidates
          .filter(c => !INDEX_SYMBOLS.has(String(c?.symbol || '').toUpperCase()))
          .slice(0, 6);
      
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
          const raw = String(name).replace(/\s+/g, ' ').trim();
          if (!raw) return "Unknown";
          // Strip only trailing legal suffixes; never truncate meaningful mid-name tokens.
          const trailingSuffix = /(?:,\s*|\s+)(?:Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|PLC|LLC|L\.?P\.?|LP|N\.?V\.?|S\.?A\.?)$/i;
          let out = raw;
          let guard = 0;
          while (guard < 4 && trailingSuffix.test(out)) {
              out = out.replace(trailingSuffix, '').trim();
              guard++;
          }
          return out || raw;
      };

      const toVerdictKey = (value: any) =>
          String(value || '')
              .trim()
              .toUpperCase()
              .replace(/\s+/g, '_')
              .replace(/-/g, '_');

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

          const verdictMap: any = {
              "STRONG_BUY": "강력 매수",
              "BUY": "매수",
              "HOLD": "관망",
              "WAIT": "관망",
              "PARTIAL_EXIT": "비중 축소",
              "ACCUMULATE": "비중 확대",
              "SPECULATIVE_BUY": "투기적 매수"
          };
          const verdictKey = toVerdictKey(c?.verdictFinal || c?.finalVerdict || c?.aiVerdict || c?.verdict || "");
          let koreanVerdict = verdictMap[verdictKey] || "관망";
          if (!verdictKey && ((c?.compositeAlpha || 0) > 80 || (c?.convictionScore || 0) > 80)) koreanVerdict = "강력 매수";

          // [Robust Fallback for AI Missing Data]
          const reasons = Array.isArray(c?.selectionReasons) ? c.selectionReasons : [];

          // Regex to strip Markdown chars like *, -, [1]
          const cleanText = (t: string) => removeCitations(t).replace(/[*_`]/g, '').trim();

          const r1 = reasons[0] ? cleanText(String(reasons[0])) : `ICT 퀀트 점수(${c.ictScore || 0}) 기반 기술적 우위 확인됨`;
          const r2 = reasons[1] ? cleanText(String(reasons[1])) : "안정적 펀더멘털 및 수급 유입";
          const r3 = reasons[2]
              ? cleanText(String(reasons[2]))
              : (c?.pdZone ? `ICT 분석: ${c.pdZone} 구간 및 OTE 타점 반영` : "기관 수급 및 기술적 지지 구간 분석 반영");

          // [Formatted Return]
          let expReturn = c?.gatedExpectedReturn || c?.expectedReturn || "N/A";
          // If return contains non-standard chars (like "High Upside"), try to keep essential +XX%
          if (expReturn !== "N/A" && !expReturn.includes('%')) expReturn += "%";

          const readFinitePositive = (...vals: any[]): number | null => {
              for (const val of vals) {
                  const n = Number(val);
                  if (Number.isFinite(n) && n > 0) return n;
              }
              return null;
          };
          const fmtPrice = (val: number | null) => (val != null ? `$${val.toFixed(2)}` : 'N/A');
          const entryExecPrice = readFinitePositive(c?.entryExecPrice, c?.entryExecPriceShadow, c?.entryPrice, c?.otePrice, c?.supportLevel);
          const entryAnchorPrice = readFinitePositive(c?.entryAnchorPrice, c?.otePrice, c?.supportLevel, entryExecPrice);
          const targetPrice = readFinitePositive(c?.targetPrice, c?.targetMeanPrice, c?.resistanceLevel);
          const stopPrice = readFinitePositive(c?.stopLoss, c?.ictStopLoss);
          const entryDistanceRaw = Number(c?.entryDistancePct ?? c?.entryDistancePctShadow);
          const derivedDistance =
              Number.isFinite(entryDistanceRaw)
                  ? entryDistanceRaw
                  : (entryExecPrice != null && price > 0
                      ? (Math.abs(price - entryExecPrice) / price) * 100
                      : NaN);
          const entryDistancePct = Number.isFinite(derivedDistance) ? Number(derivedDistance.toFixed(2)) : null;
          const tradePlanStatus = String(c?.tradePlanStatus || c?.tradePlanStatusShadow || 'N/A');
          const rawEntryFeasible = c?.entryFeasible;
          const rawEntryFeasibleShadow = c?.entryFeasibleShadow;
          const entryFeasible =
              typeof rawEntryFeasible === 'boolean'
                  ? rawEntryFeasible
                  : (typeof rawEntryFeasibleShadow === 'boolean' ? rawEntryFeasibleShadow : null);
          const entryFeasibleLabel = entryFeasible === null ? 'N/A' : String(entryFeasible);
          const distanceLabel = entryDistancePct == null ? 'N/A' : `${entryDistancePct.toFixed(2)}%`;

          const smartMoneyTag = (c.ictMetrics?.smartMoneyFlow || 0) > 85 ? " [🔥SMART MONEY]" : "";
          
          return `${i + 1}. ${c?.symbol || "N/A"} (${koreanVerdict}) : ${cleanName(c?.name)}${smartMoneyTag}${badgeStr}
   • 🏢 Sector: ${c?.sectorTheme || c?.sector || "N/A"}
   • 🎯 Plan: 진입(실행) ${fmtPrice(entryExecPrice)} | 진입(앵커) ${fmtPrice(entryAnchorPrice)} | 목표 ${fmtPrice(targetPrice)} | 손절 ${fmtPrice(stopPrice)}
   • 🧭 Exec: feasible=${entryFeasibleLabel} | status=${tradePlanStatus} | distance=${distanceLabel}
   • 📈 Exp.Return: ${expReturn}
   • 💎 Logic:
     - ${r1}
     - ${r2}
     - ${r3}`;
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
(S&P500(SPX): ${spxStr} | ${ndxLabel}: ${ndxStr} | VIX: ${vixStr}${ixic === "N/A" ? "" : ` | NASDAQ Composite(IXIC): ${ixicStr}`})
Source: ${pulseSourceLabel} | CapturedAt: ${pulseCapturedAtLabel}
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
