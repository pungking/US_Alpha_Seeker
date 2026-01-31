import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
}

interface AiProposal {
  suggestedPrice: number;
  suggestedVolume: number;
  regime: string;
  reasoning: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const PreliminaryFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Neural_Filter v2.2.0: Core Active.']);
  
  // States
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [aiProposal, setAiProposal] = useState<AiProposal | null>(null);
  const [autoStep, setAutoStep] = useState<'IDLE' | 'ANALYZING' | 'COMMITTING' | 'DONE'>('IDLE');

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (rawUniverse.length > 0) {
      const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
      setFilteredCount(count);
    }
  }, [minPrice, minVolume, rawUniverse]);

  // Load Data
  useEffect(() => {
    if (accessToken) syncAndAnalyze();
  }, [accessToken]);

  // Auto Automation
  useEffect(() => {
    if (autoStart && autoStep === 'IDLE' && !loading && rawUniverse.length > 0) {
        setAutoStep('ANALYZING');
    }
    if (autoStep === 'ANALYZING' && aiProposal && !loading && !isAnalyzing) {
        setTimeout(() => {
            setAutoStep('COMMITTING');
            commitPurification();
        }, 1500);
    }
  }, [autoStart, autoStep, loading, isAnalyzing, aiProposal, rawUniverse]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const syncAndAnalyze = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Phase 1: Retrieval from Master Universe Vault...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 0 data missing.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = content.universe || [];
      setRawUniverse(data);
      addLog(`Dataset Loaded: ${data.length} assets. Initializing AI Brain...`, "ok");

      // AI Analysis
      setIsAnalyzing(true);
      const prompt = `US Equities Analysis: Total ${data.length} stocks. Median Price: $${(data[Math.floor(data.length/2)]?.price || 0).toFixed(2)}. Suggest Price Floor and Volume Threshold to filter junk. JSON: {suggestedPrice, suggestedVolume, regime, reasoning(Korean)}`;
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
        const res = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        trackUsage(ApiProvider.GEMINI, res.usageMetadata?.totalTokenCount || 0);
        const json = JSON.parse(res.text);
        setAiProposal(json);
        setMinPrice(json.suggestedPrice);
        setMinVolume(json.suggestedVolume);
        addLog(`AI Proposal Integrated: [${json.regime}]`, "ok");
      } catch (e) {
        addLog("AI Node Unresponsive. Using Default Logic.", "warn");
      }
      setIsAnalyzing(false);

    } catch (e: any) {
      addLog(`Critical Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const commitPurification = async () => {
    if (!accessToken || loading || rawUniverse.length === 0) return;
    setLoading(true);
    addLog(`Phase 2: Purifying Universe ($${minPrice} / ${minVolume})...`, "info");

    try {
      const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: { version: "2.2.0", regime: aiProposal?.regime || "Manual", filters: { minPrice, minVolume }, count: filtered.length, timestamp: new Date().toISOString() },
        investable_universe: filtered
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Success: ${filtered.length} purified assets committed.`, "ok");
      setAutoStep('DONE');
      if (onComplete) onComplete();
    } catch (e: any) {
      addLog(`Vault Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20`}>
                <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Neural_Filter v2.2.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-md font-black border border-indigo-500/20 uppercase tracking-widest">
                    {isAnalyzing ? 'Analyzing Distribution...' : 'AI Strategy Active'}
                  </span>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button onClick={commitPurification} disabled={loading || rawUniverse.length === 0} className="w-full lg:w-auto px-12 py-5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all shadow-indigo-900/20">
              {loading ? 'Processing...' : 'Accept & Commit Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-4 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Price Floor</p>
                <p className="text-4xl font-mono font-black text-white italic">${minPrice.toFixed(2)}</p>
                <input type="range" min="0.5" max="10.0" step="0.5" value={minPrice} onChange={(e) => setMinPrice(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
            <div className="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-4 text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Liquidity Threshold</p>
                <p className="text-4xl font-mono font-black text-white italic">{(minVolume/1000).toFixed(0)}K</p>
                <input type="range" min="100000" max="2000000" step="100000" value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
            </div>
          </div>

          {aiProposal && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-3xl animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Neural Strategy Insights</p>
                    <span className="text-[8px] bg-indigo-600 text-white px-2 py-0.5 rounded font-black uppercase">{aiProposal.regime} Regime</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">"{aiProposal.reasoning}"</p>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[500px] xl:h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.3em] italic mb-6">Purification_Log</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-5 rounded-[30px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-3 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-indigo-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
