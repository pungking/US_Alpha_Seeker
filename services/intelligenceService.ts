
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

// [HELPER] Remove Citations like [1], [2], [1, 2], [1][2] - SAFE VERSION
export function removeCitations(text: any): string {
  if (!text) return "";
  const str = typeof text === 'string' ? text : String(text);
  // Removes: [1], [1,2], [1][2] patterns globally
  return str.replace(/\[\d+(?:,\s*\d+)*\]/g, '').trim();
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
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of exactly 3 reasons in Korean: [1.Sector, 2.Fundamentals, 3.Technical]" },
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

// [TELEGRAM BRIEF GENERATOR - HYBRID ENGINE]
export async function generateTelegramBrief(candidates: any[], provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return "TELEGRAM_GEN_ERROR: API Key Missing";

  const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  const dateStr = new Date().toLocaleDateString('ko-KR', dateOptions);

  // 1. Fetch Live Market Data
  let vix = "20.00", spx = "N/A", ndx = "N/A";
  try {
      const indexRes = await fetch('/api/portal_indices');
      if (indexRes.ok) {
          const indices = await indexRes.json();
          const v = indices.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX');
          const s = indices.find((i: any) => i.symbol === 'SP500' || i.symbol === 'SPX');
          const n = indices.find((i: any) => i.symbol === 'NASDAQ' || i.symbol === 'NDX');
          if(v) vix = v.price.toFixed(2);
          if(s) spx = s.price.toFixed(0);
          if(n) ndx = n.price.toFixed(2);
      }
  } catch(e) {}

  // 2. Generate "Market Pulse" Text via AI (Hybrid Approach)
  // We ask AI to generate the 'Macro' summary paragraph based on indices.
  const macroPrompt = `
  [Task] Write a professional "Market Pulse" summary in Korean for a financial report.
  
  Data:
  - VIX: ${vix}
  - S&P 500: ${spx}
  - NASDAQ: ${ndx}
  
  Requirements:
  - Provide a concise summary of the market sentiment based on the index levels.
  - Explain 2-3 key driving factors (e.g. Fed policy, Tech earnings, Geopolitics) IF relevant.
  - Interpret the VIX level briefly.
  
  Output Format (Strict):
  Macro: [Your Summary Here] (S&P500: ${spx} | NASDAQ: ${ndx})
  - [Factor 1]
  - [Factor 2]
  - [Factor 3]

  VIX: ${vix}. ([Short Interpretation])
  `;

  let macroSection = "";
  try {
     if (provider === ApiProvider.GEMINI) {
          const ai = new GoogleGenAI({ apiKey });
          const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: macroPrompt });
          macroSection = res.text.trim();
      } else {
          const res = await fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: macroPrompt }] })
          });
          const json = await res.json();
          macroSection = json.choices?.[0]?.message?.content || `Macro: 데이터 분석 중 (S&P500: ${spx} | NASDAQ: ${ndx})\nVIX: ${vix}`;
      }
  } catch (e) {
     macroSection = `Macro: 데이터 분석 중 (S&P500: ${spx} | NASDAQ: ${ndx})\nVIX: ${vix}`;
  }

  // 3. Format Candidates Programmatically (Top 6)
  const selections = candidates.slice(0, 6).map((c, i) => {
      const verdictMap: any = { "STRONG_BUY": "강력 매수", "BUY": "매수", "HOLD": "관망", "PARTIAL_EXIT": "비중 축소", "ACCUMULATE": "비중 확대" };
      let koreanVerdict = verdictMap[c.aiVerdict] || "매수";
      if (!c.aiVerdict && c.compositeAlpha > 80) koreanVerdict = "강력 매수";

      const reasons = c.selectionReasons || [];
      const r1 = reasons[0] || "섹터 모멘텀 양호";
      const r2 = reasons[1] || "안정적 펀더멘털";
      const r3 = reasons[2] || "기술적 반등 위치";

      return `${i + 1}. ${c.symbol} (${koreanVerdict}) : ${c.name}
   - 🏢 Sector: ${c.sectorTheme || c.sector}
   - 🎯 Plan: 진입 $${c.supportLevel?.toFixed(2) || '0.00'} | 목표 $${c.resistanceLevel?.toFixed(2) || '0.00'} | 손절 $${c.stopLoss?.toFixed(2) || '0.00'}
   - 📈 Exp.Return: ${c.expectedReturn || "N/A"}
   - 💡 Logic:
     - 섹터 성장: ${removeCitations(r1)}
     - 실적 요인: ${removeCitations(r2)}
     - 기술적: ${removeCitations(r3)}`;
  }).join('\n\n');

  // 4. Construct Final Message
  return `🚀 US Alpha Seeker Report 🚀

📅 ${dateStr} | Daily Alpha Insight

📊 Market Pulse
${macroSection}

💎 Alpha Top 6 Selections

${selections}

⚠️ Risk Note: 현재 VIX 지수가 ${vix}입니다. 개별 종목별로 제시된 손절가(Stop)를 엄격히 준수하고, 섹터별 비중 조절을 통해 포트폴리오 리스크를 관리하시기 바랍니다.`.trim();
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
      systemPrompt = "당신은 월가 헤지펀드의 컴플라이언스(Compliance) 담당자입니다. 투자 전 '무결성 검증(Integrity Check)' 단계에서 스캠, 상장폐지 위험, 페이퍼 컴퍼니 가능성을 냉철하게 차단하는 역할을 수행합니다. 보고서는 금융 전문가를 위한 것이므로 이모티콘을 절대 사용하지 않으며, 건조하고 전문적인 한국어 문체를 유지해야 합니다.";
      
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
      
      1. **기업 실체 및 펀더멘털 (Corporate Reality)**:
         - 동사가 실질적인 비즈니스를 영위하고 있는지, 페이퍼 컴퍼니 리스크는 없는지 진단하십시오.
         
      2. **핵심 위험 신호 (Red Flags)**:
         - 상장폐지 가능성, 잦은 유상증자/CB발행(희석), 회계 이슈 등을 점검하십시오.
         - '동전주(Penny Stock)' 여부와 투기적 위험성을 경고하십시오.
         
      3. **시장 신뢰도 (Market Consensus)**:
         - 기관 투자자 참여도 및 시장의 평판을 요약하십시오.
         
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
  - **selectionReasons**: Array of EXACTLY 3 strings in **KOREAN** that must correspond to: [1. Sector/Theme Growth, 2. Earnings/Fundamental Logic, 3. Technical/Supply Logic]. Do NOT merge them into one.
  - **expectedReturn**: e.g., "+42% (Ten-Bagger Target)".
  - **supportLevel**: Entry Price.
  - **resistanceLevel**: Target Price.
  - **stopLoss**: Stop Price.
  - **riskRewardRatio**: e.g., "1:4.5".
  - **kellyWeight**: e.g., "15%".
  - **chartPattern**: e.g. "Wyckoff SOS".
  - **investmentOutlook**: **CRITICAL**. Use the following **Strict Markdown Template**. Ensure all text is in **KOREAN**. Do NOT use emojis in the headers.

  Markdown Template for investmentOutlook:
  
  ## 1. 전문가 3인 성향 분석 (The Council Debate)
  - **보수적 퀀트 (Conservative Quant)** : [Analysis of Fundamentals, Valuation, Safety in Korean]
  - **공격적 트레이더 (Aggressive Trader)** : [Analysis of Momentum, News, Catalysts in Korean]
  - **마켓 메이커 (Market Maker)** : [Analysis of Liquidity, Order Blocks, Traps in Korean]
  - **종합 분석 (Comprehensive Analysis)** : [Synthesis of all 3 views into a final verdict in Korean]

  ## 2. The Alpha Thesis: 전략적 투자 시나리오 (Strategic Scenario)
  [Write in a structured, bulleted list format (개조식) for clarity. Do not write a single long paragraph.]
  - **핵심 논거 (Key Thesis)**: ...
  - **상승 촉매 (Catalysts)**: ...
  - **리스크 요인 (Risk Factors)**: ...
  - **가격 목표 (Trajectory)**: ...

  **NO EMOJIS IN JSON STRINGS (Except inside 'investmentOutlook' body text if necessary for emphasis, but keep headers clean).**
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
        // [MODIFIED] Do not auto-fallback. Return error for UI toggle.
        return { data: null, error: geminiError.message };
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
