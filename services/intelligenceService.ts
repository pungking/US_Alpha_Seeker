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
    // 인용구 [1], [2] 등 제거 및 불필요한 특수문자 정리
    return text.replace(/\[\d+\]/g, '').trim();
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
    if (firstBracket !== -1) return JSON.parse(cleanText.substring(firstBracket, lastBracket + 1));
    const firstCurly = cleanText.indexOf('{');
    const lastCurly = cleanText.lastIndexOf('}');
    if (firstCurly !== -1) return JSON.parse(cleanText.substring(firstCurly, lastCurly + 1));
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
  const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || geminiConfig?.key || "";
  const prompt = `Chief Quant Strategist Backtest for ${stock.symbol}. Period: 24M. Provide deep institutional-grade simulation data. JSON: {"metrics":{"winRate":"%","profitFactor":"#","maxDrawdown":"%","sharpeRatio":"#"},"historicalContext":"Professional Korean Markdown, No Citations"}`;
  try {
    if (provider === ApiProvider.GEMINI) {
      const ai = new GoogleGenAI({ apiKey });
      const result = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt, config: { responseMimeType: "application/json", responseSchema: BACKTEST_SCHEMA } }));
      trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
      const data = sanitizeAndParseJson(result.text || "");
      if (data) data.historicalContext = cleanAiOutput(data.historicalContext);
      return { data, isRealData: false };
    }
    return { data: null, error: "FALLBACK_NOT_CONFIGURED" };
  } catch (e: any) { return { data: null, error: e.message }; }
}

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider): Promise<string> {
  const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || geminiConfig?.key || "";
  const top3 = candidates.slice(0, 3).map(c => `${c.symbol}: ${c.aiVerdict}`);
  const date = new Date().toLocaleDateString();
  const prompt = `Hedge Fund Alpha Intelligence. Date: ${date}. Targets: ${top3.join(' | ')}. Return a high-impact, actionable 3-line brief in formal Korean. No Emojis. No Citations.`;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
    trackUsage(provider, result.usageMetadata?.totalTokenCount || 0);
    return cleanAiOutput(result.text || "BRIEF_EMPTY");
  } catch (e: any) { return "BRIEF_ERROR"; }
}

export async function analyzePipelineStatus(data: { currentStage: number; apiStatuses: any[]; mode: string; recommendedData?: any[]; symbols?: string[]; targetStock?: any; }, provider: ApiProvider): Promise<string> {
  const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const perplexityConfig = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY);
  const geminiKey = process.env.API_KEY || geminiConfig?.key || "";
  const sonarKey = perplexityConfig?.key || "";
  
  const dateStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const dataBrief = data.mode === 'PORTFOLIO' ? JSON.stringify(data.recommendedData?.slice(0, 5).map(d => d.symbol)) : (data.targetStock?.symbol || data.mode);
  
  const systemPrompt = `You are the Chief Investment Officer (CIO) at a top-tier Wall Street Hedge Fund.
  Current Analysis Date: ${dateStr}
  Analysis Target: ${dataBrief}
  
  TASK: Provide a rigorous, institucional-grade investment memorandum. 
  FOCUS: Strategic integrity, macro-economic alignment, quantitative risk metrics, and fund flow analysis.
  STYLE: Professional, decisive, sophisticated Korean.
  RESTRICTION: DO NOT use Emojis. DO NOT include citations like [1][2][3].
  FORMAT: High-density Markdown. Start with "# [INVESTMENT_AUDIT_REPORT]" then "### ANALYSIS_DATE: ${dateStr}".`;

  let report = "";

  if (provider === ApiProvider.GEMINI && geminiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiKey });
        const result = await fetchWithRetry(() => ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: systemPrompt }));
        trackUsage(ApiProvider.GEMINI, result.usageMetadata?.totalTokenCount || 0);
        report = result.text || "";
      } catch (e) { console.warn("Node Failover Engaged..."); }
  }

  if (!report && sonarKey) {
      try {
        const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sonarKey}` },
            body: JSON.stringify({ model: 'sonar', messages: [{ role: "user", content: systemPrompt }] })
        });
        const pJson = await pRes.json();
        const text = pJson.choices?.[0]?.message?.content || "";
        if (text) {
            if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);
            report = text;
        }
      } catch (e) { console.error("Sonar Critical Failure."); }
  }

  return cleanAiOutput(report || "CRITICAL_NODE_FAILURE: Analysis Unavailable.");
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
  const apiKey = process.env.API_KEY || geminiConfig?.key || "";
  const top10 = candidates.slice(0, 10).map(c => `${c.symbol}($${c.price})`);
  const dateStr = new Date().toLocaleDateString();
  const prompt = `CIO Level Portfolio Synthesis. Date: ${dateStr}. Targets: ${top10.join(',')}. JSON Array of objects matching schema. Professional Korean investmentOutlook without Citations.`;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await fetchWithRetry(() => ai.models.generateContent({ 
      model: 'gemini-3-flash-preview', 
      contents: prompt, 
      config: { responseMimeType: "application/json", responseSchema: ALPHA_SCHEMA } 
    }));
    trackUsage(provider, result.usageMetadata?.totalTokenCount || 0);
    const data = sanitizeAndParseJson(result.text || "");
    if (Array.isArray(data)) {
        data.forEach(item => {
            item.investmentOutlook = cleanAiOutput(item.investmentOutlook);
            if (item.selectionReasons) item.selectionReasons = item.selectionReasons.map((r: string) => cleanAiOutput(r));
        });
    }
    return { data };
  } catch (e: any) { return { data: null, error: e.message }; }
}
