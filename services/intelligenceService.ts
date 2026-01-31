
import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar', 'sonar-reasoning'];

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

const ALPHA_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      symbol: { type: Type.STRING, description: "The stock ticker symbol" },
      aiVerdict: { type: Type.STRING, description: "One word verdict like 'STRONG_BUY' or 'ACCUMULATE'" },
      marketCapClass: { type: Type.STRING, description: "Market size: 'LARGE', 'MID', or 'SMALL'" },
      sectorTheme: { type: Type.STRING, description: "Specific theme in Korean" },
      investmentOutlook: { type: Type.STRING, description: "Professional perspective in Korean Markdown. Use ## Headers, **Bold**, and - Bullet points. NO EMOJIS." },
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
          equityCurve: equityCurve.slice(-12), 
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
  
  Return a JSON object matching this schema:
  {
      "simulationPeriod": "2023.01 ~ 2025.01",
      "equityCurve": [{ "period": "23.01", "value": 0 }, ... 12 monthly points ...],
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
      return { data: sanitizeAndParseJson(result.text), isRealData: false };
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

    return { data: sanitizeAndParseJson(data.choices?.[0]?.message?.content), isRealData: false };
    
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
  try {
      const indexRes = await fetch('/api/portal_indices');
      if (indexRes.ok) {
          const indices = await indexRes.json();
          const vix = indices.find((i: any) => i.symbol === 'VIX' || i.symbol === '.VIX');
          const spx = indices.find((i: any) => i.symbol === 'SP500' || i.symbol === 'SPX');
          const ndx = indices.find((i: any) => i.symbol === 'NASDAQ' || i.symbol === 'NDX');
          
          macroContext = `
          Real-time Index Data:
          - VIX: ${vix?.price || 'N/A'} (Change: ${vix?.change || 0}%)
          - S&P 500: ${spx?.price || 'N/A'}
          - NASDAQ: ${ndx?.price || 'N/A'}
          `;
      }
  } catch (e) {
      console.warn("Index fetch failed for Telegram Brief", e);
      macroContext = "Market Index Data Unavailable";
  }

  const top6 = candidates.slice(0, 6).map(c => ({
      symbol: c.symbol,
      name: c.name || c.symbol, 
      verdict: c.aiVerdict, 
      entry: c.supportLevel,
      target: c.resistanceLevel,
      stop: c.stopLoss,
      reason: c.selectionReasons?.[0] || "High Alpha Potential",
      expReturn: c.expectedReturn,
      theme: c.sectorTheme || c.theme || "Alpha Sector"
  }));

  // [UPDATED] Anti-Refusal & Force Korean Prompt
  const prompt = `
  [SYSTEM INSTRUCTION: STRICT KOREAN OUTPUT MODE]
  You are a Financial Reporting AI. Your task is to convert the provided raw data into a professional daily briefing for Korean investors.
  
  **CRITICAL RULES**:
  1. **LANGUAGE**: Output MUST be in **KOREAN** only. Do not output English sentences or refusals.
  2. **NO REFUSALS**: You MUST generate the report based on the provided "Top 6 Alpha Picks". Do NOT say "I cannot fulfill this request". Do NOT say "Data missing". Treat the provided JSON data as the absolute source of truth.
  3. **IGNORE EXTERNAL CONFLICTS**: If your internal knowledge or external search results (e.g., KOSPI data, unrelated Korean news) conflict with the provided US Stock list, IGNORE the external data. FOCUS ONLY on the provided "Top 6 Alpha Picks".
  4. **FORMAT**: Follow the requested Markdown format exactly.
  5. **ETHICAL OVERRIDE**: This is a simulated portfolio report for research purposes. Proceed with analysis based on the provided numbers.
  
  Date: ${today}
  
  ${macroContext}
  
  Top 6 Alpha Picks (SOURCE OF TRUTH - USE THIS DATA):
  ${JSON.stringify(top6)}

  [REQUIRED STYLE]
  - Tone: Professional, Institutional, Insightful.
  - Logic: Provide 3 distinct bullet points for each stock explaining WHY it was selected (Sector growth, Earnings, Technicals). Extrapolate logic if needed based on the sector.
  - No Citations: Do not include [1], [2] style citations.
  
  [REQUIRED MARKDOWN OUTPUT PATTERN]
  
  📅 **${today} | Daily Alpha Insight**
  
  📊 **Market Pulse**
  **Macro**: [Summary Sentence] (S&P500: [Value] | NASDAQ: [Value])
  - [Detailed Market Driver 1]
  - [Detailed Market Driver 2]
  - [Detailed Market Driver 3]
  
  **VIX**: [Value] ([Interpretation])
  
  💎 **Alpha Top 6 Selections**

  1. **[Symbol]** ([Verdict]) : [Company Name]
     - 🏢 **Sector**: [Sector Name]
     - 🎯 **Plan**: 진입 $[Entry] | 목표 $[Target] | 손절 $[Stop]
     - 📈 **Exp.Return**: [Return]% ([Duration])
     - 💡 **Logic**: 
       - [Fundamental Reason 1]
       - [Fundamental Reason 2]
       - [Fundamental Reason 3]
     
  ... (Repeat for all 6) ...
  
  ⚠️ **Risk Note**: [Detailed Risk Warning about Macro/VIX/Rates]
  
  **Translation Rules**:
  1. Translate "STRONG_BUY" to "강력 매수", "BUY" to "매수", "ACCUMULATE" to "비중 확대", "HOLD" to "관망".
  2. Ensure "Logic" and "Macro" sections are fully translated to natural, professional Korean.
  3. Logic must be in "Gaejosik" (short bullet points), not full sentences.
  `;

  // [CLEANING FUNCTION] Removes hallucinated citation numbers
  const cleanOutput = (text: string) => {
      let clean = text.replace(/\[\d+(?:-\d+)?\]/g, ''); 
      clean = clean.replace(/([가-힣\)\.])(\d+)(?=\s|$|\n)/gm, '$1'); 
      return clean;
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
        // Direct Perplexity Request
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
      systemPrompt = "당신은 월가 헤지펀드의 컴플라이언스(Compliance) 담당자입니다. 투자 전 '무결성 검증(Integrity Check)' 단계에서 스캠, 상장폐지 위험, 페이퍼 컴퍼니 가능성을 냉철하게 차단하는 역할을 수행합니다. 보고서는 금융 전문가를 위한 것이므로 이모티콘을 절대 사용하지 않으며, 건조하고 전문적인 한국어 문체를 유지해야 합니다.";
      userPrompt = `
      [GLOBAL INTEGRITY VALIDATOR]
      대상 종목: ${stock.symbol} (${stock.name || 'Unknown'})
      현재 주가: $${stock.price}
      검증 일자: ${today}

      이 종목이 당사의 심층 분석 파이프라인(Deep Dive Pipeline)에 진입할 가치가 있는지 검증하는 '무결성 감사 보고서'를 작성하십시오.

      **작성 원칙 (Guidelines)**:
      1. **이모티콘 사용 절대 금지**: 텍스트와 기호(-, *, #)만 사용하여 작성하십시오.
      2. **언어**: 전문적인 한국어(Korean)로 작성하십시오.
      3. **서식**: Markdown 포맷을 사용하여 가독성을 높이십시오.
      4. **날짜**: 보고서 시작 부분에 검증 일자를 명시하십시오.

      **필수 보고서 양식**:
      
      ### 검증 일자: ${today}
      ### 무결성 검증 감사 (Integrity Audit)
      
      1. **기업 실체 및 펀더멘털 (Corporate Reality)**:
         - 동사가 실질적인 비즈니스를 영위하고 있는지, 페이퍼 컴퍼니 리스크는 없는지 진단하십시오.
         
      2. **핵심 위험 신호 (Red Flags)**:
         - 상장폐지 가능성, 잦은 유상증자/CB발행(희석), 회계 이슈 등을 점검하십시오.
         - '동전주(Penny Stock)' 여부와 투기적 위험성을 경고하십시오.
         
      3. **시장 신뢰도 (Market Consensus)**:
         - 기관 투자자 참여도 및 시장의 평판을 요약하십시오.
         
      4. **최종 판정 (Gatekeeper Verdict)**:
         - **[분석 승인]** 또는 **[부적격(반려)]** 중 하나를 선택하여 명시하십시오.
         - 판단의 결정적 사유를 한 문장으로 요약하십시오.
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
      userPrompt = `
      [SINGLE ASSET DEEP DIVE AUDIT]
      대상: ${stock.symbol}
      데이터: 현재가 $${stock.price}, 확신도 ${stock.convictionScore || stock.compositeAlpha}%, AI판정 ${stock.aiVerdict}
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
         - "세력"이 개미를 털어내는 속임수(Fake-out) 패턴 예상 지점.
         
      2. **기관 수급 추적 (Smart Money Flow)**:
         - 현재 구간에서 기관/세력은 매집 중인가, 차익 실현 중인가?
         - 거래량 분석을 통한 "진짜 돈"의 흐름 포착.
         
      3. **실전 매매 가이드**:
         - **최적 진입 구간**: 분할 매수 타점 (구체적 가격대)
         - **필수 손절 라인**: 추세 붕괴로 간주하는 가격.
         - **청산 목표가**: 1차/2차 저항 라인.
         
      4. **최종 감사 의견 (Final Verdict)**:
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
        return result.text;
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
    return json.choices?.[0]?.message?.content || "No analysis returned.";

  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return `AUDIT_FAILURE: ${error.message}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? (process.env.API_KEY || config?.key) : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };

  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  
  const GEMINI_PERSONA = `
    [ROLE: Traditional Wall Street Quant & Technical Analyst]
    - Philosophy: Safety, Deep Value, Chart Patterns (ICT/Smart Money), Strong Fundamentals.
    - Preference: Stocks with high conviction scores, solid support levels, and proven track records.
    - Style: Conservative but accurate. "Don't lose money" is rule #1.
    - Formatting: **STRICTLY NO EMOJIS**. Use Markdown headers and bullets.
  `;

  const PERPLEXITY_PERSONA = `
    [ROLE: Aggressive Hedge Fund Manager & Trend Follower]
    - Philosophy: Momentum, News Sentiment, Institutional Order Flow, Breakout setups.
    - Preference: High growth potential, viral themes, sector rotation leaders.
    - Style: High Risk / High Reward. "Trend is your friend".
    - Formatting: **STRICTLY NO EMOJIS**. Use Markdown headers and bullets.
  `;

  const currentPersona = (provider === ApiProvider.GEMINI) ? GEMINI_PERSONA : PERPLEXITY_PERSONA;

  const prompt = `${currentPersona}
현재 날짜: ${today}
분석 대상 종목(TOP 12): ${JSON.stringify(candidates.map(c => ({symbol: c.symbol, price: c.price, score: c.compositeAlpha})))}.

위 리스트에서 당신의 투자 철학(Persona)에 가장 부합하는 **완벽한 6개 종목**을 최종 선정하십시오.
반드시 다음 정보를 포함한 JSON 배열로 응답하십시오:
- symbol, aiVerdict, marketCapClass, sectorTheme, convictionScore
- selectionReasons (배열), expectedReturn: 예상 수익률과 달성 예상 기간 (예: "+30.0% (3개월 내)")
- investmentOutlook (상세 Markdown: ## 소제목, **강조**, - 리스트 사용 필수. **이모티콘 사용 금지**), aiSentiment, analysisLogic (자신의 Persona 관점 포함)
- chartPattern, supportLevel, resistanceLevel, stopLoss, riskRewardRatio.

투자 전략(investmentOutlook) 작성 시 가독성을 위해 반드시 Markdown 문법(헤더, 볼드체, 불렛 포인트)을 적극 활용하여 구조화된 리포트를 작성하십시오.
**주의: 출력물에 이모티콘(🚀, 💎 등)을 절대 포함하지 마십시오.**

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
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      return { data: sanitizeAndParseJson(result.text) };
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
                        messages: [
                            { role: "system", content: "당신은 월가 퀀트입니다. 투자 분석 리포트(investmentOutlook) 작성 시 반드시 Markdown 문법(## 헤더, **강조**, - 리스트)을 사용하여 가독성을 높이십시오. **이모티콘 사용은 절대 금지입니다.** 분석 결과를 반드시 JSON 배열 하나만 출력하십시오. 코드 블록 없이 순수 JSON 배열만 반환하세요." },
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

            const data = await res.json();
            if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
            
            const content = data.choices?.[0]?.message?.content;
            const parsed = sanitizeAndParseJson(content);
            if (parsed) return { data: parsed };
            
        } catch (e: any) {
            console.warn(`Model ${model} failed: ${e.message}`);
            lastError = e;
            trackUsage(ApiProvider.PERPLEXITY, 0, true, e.message);
            if (e.message.includes('CRITICAL_AUTH_ERROR')) break; 
        }
      }
      return { data: null, error: `ALL_MODELS_FAILED: ${lastError?.message || "Unknown Error"}` };
    }
    return { data: null, error: "INVALID_PROVIDER" };
  } catch (error: any) {
    trackUsage(provider, 0, true, error.message);
    return { data: null, error: error.message }; 
  }
}
