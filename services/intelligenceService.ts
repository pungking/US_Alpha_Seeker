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
  } catch (e) {
    console.error("Usage Tracking Error:", e);
  }
};

export async function archiveReport(token: string, fileName: string, content: string): Promise<boolean> {
  try {
    const { rootFolderName, reportSubFolder } = GOOGLE_DRIVE_TARGET;
    
    // 1. Ensure Root Folder
    let rootId = await getFolderIdByName(token, rootFolderName);
    if (!rootId) rootId = await createFolder(token, rootFolderName);
    if (!rootId) return false;

    // 2. Ensure Report Folder
    let folderId = await getFolderIdByName(token, reportSubFolder, rootId);
    if (!folderId) folderId = await createFolder(token, reportSubFolder, rootId);
    if (!folderId) return false;

    // 3. Upload Content
    const boundary = '-------314159265358979323846';
    const metadata = { name: fileName, parents: [folderId], mimeType: 'text/markdown' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--`;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });
    
    return res.ok;
  } catch (e) {
    console.error("Archive Report Error", e);
    return false;
  }
}

async function getFolderIdByName(token: string, name: string, parentId?: string) {
  let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files?.length > 0 ? data.files[0].id : null;
}

async function createFolder(token: string, name: string, parentId?: string) {
  const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await fetch(`https://www.googleapis.com/drive/v3/files`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return data.id;
}

export async function analyzePipelineStatus(data: any, provider: ApiProvider): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `System Stage ${data.currentStage}, Mode: ${data.mode}. Provide diagnostic in Korean. Target: ${JSON.stringify(data.targetStock || data.recommendedData?.slice(0,3))}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    trackUsage(ApiProvider.GEMINI, 100);
    return response.text;
  } catch (error: any) {
    trackUsage(ApiProvider.GEMINI, 0, true, error.message);
    return `AUDIT_NODE_FAILURE: ${error.message}`;
  }
}

export async function generateAlphaSynthesis(candidates: any[], provider: ApiProvider): Promise<{data: any[] | null, error?: string}> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Analyze: ${JSON.stringify(candidates)}. Return JSON array of top 6 with symbol, aiVerdict, convictionScore, etc. Use Korean.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    trackUsage(ApiProvider.GEMINI, 200);
    const parsed = JSON.parse(response.text);
    return { data: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (error: any) {
    trackUsage(ApiProvider.GEMINI, 0, true, error.message);
    return { data: null, error: error.message };
  }
}

export async function runAiBacktest(stock: any, provider: ApiProvider) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Backtest simulation for ${stock.symbol}. Return JSON with equityCurve and metrics.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    // [FIX] trackUsage and include isRealData in the successful response to fix destructuring error in AlphaAnalysis
    trackUsage(provider, 150);
    return { data: JSON.parse(response.text), isRealData: false };
  } catch (e: any) {
    // [FIX] trackUsage and include isRealData in the error response
    trackUsage(provider, 0, true, e.message);
    return { data: null, error: e.message, isRealData: false };
  }
}

export async function generateTelegramBrief(candidates: any[], provider: ApiProvider) {
  return `Daily Alpha Brief: ${candidates.map(c => c.symbol).join(', ')}`;
}
