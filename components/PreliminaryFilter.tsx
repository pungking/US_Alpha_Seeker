
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
  type?: string;
}

interface AiProposal {
  suggestedPrice: number;
  suggestedVolume: number;
  regime: string;
  reasoning: string;
}

const PreliminaryFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v2.0.4: Macro-Liquidity Protocol Online.']);
  
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const safeP = Number(minPrice) || 2.0;
      const safeV = Number(minVolume) || 500000;
      const count = rawUniverse.filter(s => (Number(s.price) || 0) >= safeP && (Number(s.volume) || 0) >= safeV).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const syncAndAnalyzeMarket = async () => {
    if (!accessToken) {
      addLog("Cloud link required.", "warn");
      return;
    }
    setLoading(true);
    setIsAnalyzing(true);
    setAiError(null);
    addLog("Phase 1: Retrieving Universe Matrix...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 0 data not found.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = content.universe || [];
      setRawUniverse(data);
      addLog(`Matrix Synced: ${data.length} assets. Requesting AI Baseline...`, "ok");

      const geminiConfig = API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || geminiConfig?.key || "" });
      
      const prompt = `Recommend filtering: suggestedPrice (num), suggestedVolume (num) in JSON format. Baseline: $2.0, 500k volume.`;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const aiData = JSON.parse(response.text || "{}");
      setAiProposal(aiData);
      setMinPrice(Number(aiData.suggestedPrice) || 2.0);
      setMinVolume(Number(aiData.suggestedVolume) || 500000);
      addLog("AI Strategy Finalized.", "ok");
    } catch (e: any) {
      setAiError(e.message);
      addLog(`AI Warning: ${e.message}`, "warn");
      setMinPrice(2.0); setMinVolume(500000);
    } finally {
      setLoading(false);
      setIsAnalyzing(false);
    }
  };

  const commitPurification = async () => {
    if (!accessToken || rawUniverse.length === 0) return;
    setLoading(true);
    addLog("Phase 2: Executing Purification Commit...", "info");

    try {
      const safeP = Number(minPrice) || 2.0;
      const safeV = Number(minVolume) || 500000;
      const filtered = rawUniverse.filter(s => (Number(s.price) || 0) >= safeP && (Number(s.volume) || 0) >= safeV);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = { manifest: { filters: { minPrice: safeP, minVolume: safeV } }, investable_universe: filtered };
      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      addLog(`Purification Success: ${filtered.length} assets committed.`, "ok");
    } catch (e: any) { addLog(`Archive Error: ${e.message}`, "err"); } finally { setLoading(false); }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
                <svg className={`w-6 h-6 text-emerald-500 ${isAnalyzing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v2.0.4</h2>
            </div>
            <div className="flex gap-4">
              <button onClick={syncAndAnalyzeMarket} disabled={loading} className="px-8 py-5 bg-slate-800 text-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5">Sync & AI Baseline</button>
              <button onClick={commitPurification} disabled={loading || rawUniverse.length === 0} className="px-12 py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20">Purify & Commit</button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            <div className="bg-black/40 p-10 rounded-3xl border border-white/10 relative">
              <div className="flex justify-between items-center mb-8">
                 <div><p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Price Floor Matrix</p><p className="text-2xl font-black text-white italic tracking-tighter">${(Number(minPrice) || 2.0).toFixed(2)}</p></div>
                 <div className="text-right"><p className="text-[7px] font-black text-slate-500 uppercase">AI Rec</p><p className="text-xs font-black italic text-emerald-500/80">{isAnalyzing ? '...' : aiProposal ? `$${(Number(aiProposal.suggestedPrice) || 0).toFixed(2)}` : '$---'}</p></div>
              </div>
              <input type="range" min="1.0" max="10.0" step="0.1" value={minPrice} onChange={(e) => setMinPrice(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
            </div>
            <div className="bg-black/40 p-10 rounded-3xl border border-white/10 relative">
              <div className="flex justify-between items-center mb-8">
                 <div><p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Volume Threshold</p><p className="text-2xl font-black text-white italic tracking-tighter">{(Number(minVolume/1000) || 500).toFixed(0)}k</p></div>
                 <div className="text-right"><p className="text-[7px] font-black text-slate-500 uppercase">AI Rec</p><p className="text-xs font-black italic text-emerald-500/80">{isAnalyzing ? '...' : aiProposal ? `${(Number(aiProposal.suggestedVolume/1000) || 0).toFixed(0)}k` : '---'}</p></div>
              </div>
              <input type="range" min="50000" max="2000000" step="10000" value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500" />
            </div>
          </div>
          <div className="bg-gradient-to-br from-emerald-600/10 to-transparent p-10 rounded-3xl border border-emerald-500/10 text-center">
            <span className="text-6xl font-black text-white italic tracking-tighter">{filteredCount.toLocaleString()}</span>
            <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic mt-2">Purified Asset Nodes</p>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2"><h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3></div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (<div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : 'border-blue-900'}`}>{l}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
