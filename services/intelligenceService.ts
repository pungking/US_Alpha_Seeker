import { GoogleGenAI, Type } from "@google/genai";
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from "../constants";
import { ApiProvider } from "../types";

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
  } catch (e) { console.error(e); }
};

const cleanAiOutput = (text: string) => {
    if (!text) return "";
    return text
        .replace(/\[\d+\]/g, '')
        .replace(/^(TO|FROM|SUBJECT|DATE|RECIPIENT|SENDER):.*$/gm, '')
        .replace(/Limited Partners/gi, 'Investor')
        .trim();
};

export async function archiveReport(token: string, fileName: string, content: string): Promise<boolean> {
  try {
     const { rootFolderId, reportSubFolder } = GOOGLE_DRIVE_TARGET;
     const q = encodeURIComponent(`name = '${reportSubFolder}' and '${rootFolderId}' in parents and trashed = false`);
     let folderId = '';
     const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
     if (res.files?.length > 0) folderId = res.files[0].id;
     else {
        const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
           method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
           body: JSON.stringify({ name: reportSubFolder, parents: [rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
        }).then(r => r.json());
        folderId = create.id;
     }
     const meta = { name: fileName, parents: [folderId], mimeType: 'text/markdown' };
     const form = new FormData();
     form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
     form.append('file', new Blob([content], { type: 'text/markdown' }));
     const upload = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
     return upload.ok;
  } catch (e) { return false; }
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
    required: ["symbol", "aiVerdict", "convictionScore", "expectedReturn", "investmentOutlook"]
  }
};

const BACKTEST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    simulationPeriod: { type: Type.STRING },
    equityCurve: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { period: { type: Type.STRING }, value: { type: Type.NUMBER } } } },
    metrics: { type: Type.OBJECT, properties: { winRate: { type: Type.STRING }, profitFactor: { type: Type.STRING }, maxDrawdown: { type: Type.STRING }, sharpeRatio: { type: Type.STRING } } },
    historicalContext: { type: Type.STRING }
  },
  required: ["metrics", "historicalContext"]
};

function sanitizeAndParseJson(text: string): any | null {
  if (!text) return null;
  try {
    let cleanText = text.trim().replace(/```json/g, "").replace(/```/g, "");
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly !== -1) return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
    return JSON.parse(cleanText);
  } catch (e) { return null; }
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3): Promise<any> {
  try { return await fn(); } catch (error: any) {
    if (retries > 0) { await new Promise(r => setTimeout(r, 2000)); return fetchWithRetry(fn, retries - 1); }
    throw error;
  }
}

export async function runAiBacktest(stock: any, provider: ApiProvider): Promise<{data: any | null, error?: string, isRealData?: boolean}> {
  const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
  const sonarKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
  const prompt = `Chief Quant Strategist Backtest for ${stock.symbol}. Period: 24M. Provide deep institutional-grade simulation data. JSON: {"metrics":{"winRate":"%","profitFactor":"#","maxDrawdown":"%","sharpeRatio":"#"},"historicalContext":"Professional Korean Markdown, No Citations"}`;

  try {
    if (provider === ApiProvider.GEMINI) {
      if (!geminiKey) throw new Error("API key must be set when using the Gemini API.");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({ 
        model: 'gemini-3-flash-preview', 
        contents: prompt, 
        config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA } 
      }));
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      const data = sanitizeAndParseJson(result.text || "");
      if (data) data.historicalContext = cleanAiOutput(data.historicalContext);
      return { data, isRealData: false };
    } else {
      if (!sonarKey) throw new Error("Perplexity API key missing.");
      const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sonarKey}` },
          body: JSON.stringify({ model: 'sonar', messages: [{ role: "user", content: prompt + " Output JSON only." }] })
      });
      const pData = await pRes.json();
      const text = pData.choices?.[0]?.message?.content || "";
      if (pData.usage) trackUsage(ApiProvider.PERPLEXITY, pData.usage.total_tokens || 0);
      const data = sanitizeAndParseJson(text);
      if (data) data.historicalContext = cleanAiOutput(data.historicalContext);
      return { data, isRealData: false };
    }
  } catch (e: any) { return { data: null, error: e.message }; }
}

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider): Promise<string> {
  const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
  const sonarKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
  const top3 = candidates.slice(0, 3).map(c => `${c.symbol}: ${c.aiVerdict}`);
  const date = new Date().toLocaleDateString();
  const prompt = `Hedge Fund Alpha Intelligence. Date: ${date}. Targets: ${top3.join(' | ')}. Return a high-impact, actionable 3-line brief in formal Korean. No Emojis. No Citations.`;

  try {
    if (provider === ApiProvider.GEMINI && geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const result = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      trackUsage(provider, result.usageMetadata?.totalTokenCount || 0);
      return cleanAiOutput(result.text || "BRIEF_EMPTY");
    } else if (sonarKey) {
      const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sonarKey}` },
          body: JSON.stringify({ model: 'sonar', messages: [{ role: "user", content: prompt }] })
      });
      const pData = await pRes.json();
      const text = pData.choices?.[0]?.message?.content || "";
      if (pData.usage) trackUsage(ApiProvider.PERPLEXITY, pData.usage.total_tokens || 0);
      return cleanAiOutput(text || "BRIEF_EMPTY");
    }
    return "BRIEF_PROVIDER_ERROR";
  } catch (e: any) { return "BRIEF_ERROR"; }
}

export async function analyzePipelineStatus(data: { currentStage: number; apiStatuses: any[]; mode: string; recommendedData?: any[]; symbols?: string[]; targetStock?: any; }, provider: ApiProvider): Promise<string> {
  const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
  const sonarKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const dataBrief = data.mode === 'PORTFOLIO' ? JSON.stringify(data.recommendedData?.slice(0, 5).map(d => d.symbol)) : (data.targetStock?.symbol || data.mode);
  
  const systemPrompt = `You are a professional Quant Market Analyst. Date: ${dateStr}. Target: ${dataBrief}. TASK: Rigorous investment audit in Markdown (Korean). Style: Institutional, No Emojis, No Citations.`;

  try {
    if (provider === ApiProvider.GEMINI && geminiKey) {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const result = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: systemPrompt }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        return cleanAiOutput(result.text || "");
    } else if (sonarKey) {
        const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sonarKey}` },
            body: JSON.stringify({ model: 'sonar', messages: [{ role: "user", content: systemPrompt }] })
        });
        const pJson = await pRes.json();
        const text = pJson.choices?.[0]?.message?.content || "";
        if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);
        return cleanAiOutput(text || "");
    }
    return "ANALYSIS_PROVIDER_UNAVAILABLE";
  } catch (e) { return "CRITICAL_NODE_FAILURE"; }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
  const sonarKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
  const top10 = candidates.slice(0, 10).map(c => `${c.symbol}($${c.price})`);
  const dateStr = new Date().toLocaleDateString();
  const prompt = `Quant Portfolio Synthesis. Date: ${dateStr}. Targets: ${top10.join(',')}. JSON Array of objects matching required schema. Professional Korean investmentOutlook. No fake headers.`;

  try {
    if (provider === ApiProvider.GEMINI) {
      if (!geminiKey) throw new Error("API key must be set when using the Gemini API.");
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({ 
        model: 'gemini-3-flash-preview', 
        contents: prompt, 
        config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA } 
      }));
      trackUsage(provider, result.usageMetadata?.totalTokenCount || 0);
      const data = sanitizeAndParseJson(result.text || "");
      return { data };
    } else {
      if (!sonarKey) throw new Error("Perplexity API key missing.");
      const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sonarKey}` },
          body: JSON.stringify({ 
              model: 'sonar', 
              messages: [{ role: "user", content: prompt + " Output a valid JSON array matching the schema." }] 
          })
      });
      const pData = await pRes.json();
      const text = pData.choices?.[0]?.message?.content || "";
      if (pData.usage) trackUsage(ApiProvider.PERPLEXITY, pData.usage.total_tokens || 0);
      const data = sanitizeAndParseJson(text);
      return { data };
    }
  } catch (e: any) { return { data: null, error: e.message }; }
}
