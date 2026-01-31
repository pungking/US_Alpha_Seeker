import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from "../constants";
import { ApiProvider } from "../types";

const PERPLEXITY_MODELS = ['sonar-pro', 'sonar', 'sonar-reasoning'];
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
     
     return upload.ok;
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
      symbol: { type: Type.STRING },
      aiVerdict: { type: Type.STRING },
      marketCapClass: { type: Type.STRING },
      sectorTheme: { type: Type.STRING },
      investmentOutlook: { type: Type.STRING },
      selectionReasons: { type: Type.ARRAY, items: { type: Type.STRING } },
      convictionScore: { type: Type.NUMBER },
      expectedReturn: { type: Type.STRING },
      theme: { type: Type.STRING },
      aiSentiment: { type: Type.STRING },
      analysisLogic: { type: Type.STRING },
      chartPattern: { type: Type.STRING },
      supportLevel: { type: Type.NUMBER },
      resistanceLevel: { type: Type.NUMBER },
      stopLoss: { type: Type.NUMBER },
      riskRewardRatio: { type: Type.STRING }
    },
    required: ["symbol", "aiVerdict", "marketCapClass", "sectorTheme", "investmentOutlook", "selectionReasons", "convictionScore", "expectedReturn", "theme", "aiSentiment", "analysisLogic", "chartPattern", "supportLevel", "resistanceLevel", "stopLoss", "riskRewardRatio"]
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
    return null;
  }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 3000): Promise<any> {
  try { return await fn(); } catch (error: any) {
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
      let wins = 0; let losses = 0; let maxDrawdown = 0; let peakBalance = 100;
      const equityCurve = [];
      let lastMonth = '';
      for (const candle of candles) {
          const date = new Date(candle.t);
          const monthStr = `${date.getFullYear().toString().slice(2)}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          if (position) {
              if (candle.l <= stop) {
                  balance = position.quantity * Math.min(candle.o, stop);
                  position = null; losses++;
              } else if (candle.h >= target) {
                  balance = position.quantity * Math.max(candle.o, target);
                  position = null; wins++;
              }
          }
          if (!position && candle.l <= entry && candle.h >= entry) {
              position = { entryPrice: entry, quantity: balance / entry };
          }
          const currentEquity = position ? position.quantity * candle.c : balance;
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
      const profitFactor = losses === 0 ? (wins > 0 ? 99.99 : 1) : (wins * (target - entry)) / (losses * (entry - stop));
      return {
          simulationPeriod: `${from} ~ ${to}`,
          equityCurve: equityCurve.slice(-12), 
          metrics: { winRate: `${winRate.toFixed(1)}%`, profitFactor: profitFactor.toFixed(2), maxDrawdown: `-${maxDrawdown.toFixed(1)}%`, sharpeRatio: (winRate / 10).toFixed(2) },
          historicalContext: `### Real-Data Audit\nPolygon.io data based simulation complete.`
      };
  } catch (e) {
      return null;
  }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string, isRealData?: boolean}> {
  const realData = await runDeterministicBacktest(stock);
  if (realData) return { data: realData, isRealData: true };
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? process.env.API_KEY : config?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };
  const prompt = `Backtest ${stock.symbol}. Technical Context: Score=${stock.technicalScore}. Return JSON.`;
  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA }
      }));
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      return { data: sanitizeAndParseJson(result.text), isRealData: false };
    }
    const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt }] })
    });
    const data = await pRes.json();
    if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
    return { data: sanitizeAndParseJson(data.choices?.[0]?.message?.content), isRealData: false };
  } catch (e: any) {
    trackUsage(provider, 0, true, e.message);
    return { data: null, error: e.message };
  }
}

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider): Promise<string> {
  const config = API_CONFIGS.find(c => c.provider === provider);
  const apiKey = (provider === ApiProvider.GEMINI) ? process.env.API_KEY : config?.key;
  if (!apiKey) return "TELEGRAM_GEN_ERROR";
  const prompt = `Create Telegram Brief for: ${JSON.stringify(candidates.slice(0, 6))}. In KOREAN. No Emojis.`;
  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const result = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt }));
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      return result.text;
    }
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt }] })
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "Brief generation failed.";
  } catch (error: any) {
    return `BRIEF_GEN_FAILURE: ${error.message}`;
  }
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const apiKey = (provider === ApiProvider.GEMINI) ? process.env.API_KEY : API_CONFIGS.find(c => c.provider === provider)?.key;
  if (!apiKey) return "AUDIT_ERROR: API Key Missing";
  const prompt = `Audit Pipeline Stage ${data.currentStage}. Target: ${data.targetStock?.symbol || 'Portfolio'}.`;
  try {
    if (provider === ApiProvider.GEMINI) {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const result = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-pro-preview', contents: prompt }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        return result.text;
    }
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: "user", content: prompt }] })
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content || "No audit returned.";
  } catch (error: any) {
    return `AUDIT_FAILURE: ${error.message}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const apiKey = (provider === ApiProvider.GEMINI) ? process.env.API_KEY : API_CONFIGS.find(c => c.provider === provider)?.key;
  if (!apiKey) return { data: null, error: "API_KEY_MISSING" };
  const prompt = `Select 6 top stocks from: ${JSON.stringify(candidates)}. Return JSON.`;
  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const result = await fetchWithRetry(() => ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA }
      }));
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      return { data: sanitizeAndParseJson(result.text) };
    }
    for (const model of PERPLEXITY_MODELS) {
      try {
          const r = await fetch('https://api.perplexity.ai/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
              body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
          });
          const data = await r.json();
          if (data.usage) trackUsage(ApiProvider.PERPLEXITY, data.usage.total_tokens || 0);
          const parsed = sanitizeAndParseJson(data.choices?.[0]?.message?.content);
          if (parsed) return { data: parsed };
      } catch (e) {}
    }
    return { data: null, error: "ALL_MODELS_FAILED" };
  } catch (error: any) {
    return { data: null, error: error.message }; 
  }
}