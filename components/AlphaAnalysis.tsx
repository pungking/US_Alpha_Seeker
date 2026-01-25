
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiProvider } from '../types';
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from '../constants';
import { generateAlphaSynthesis } from '../services/intelligenceService';

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
  ictScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sector: string;
  aiVerdict?: string;
  marketCapClass?: 'LARGE' | 'MID' | 'SMALL';
  sectorTheme?: string;
  convictionScore?: number;
  expectedReturn?: string;
  theme?: string;
  selectionReasons?: string[];
  investmentOutlook?: string;
  aiSentiment?: string;
  analysisLogic?: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (brain: ApiProvider) => void;
  onFinalSymbolsDetected?: (symbols: string[]) => void;
}

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [loading, setLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.2.6: Neural Strategy Matrix Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) loadStage5Data();
  }, [accessToken]);

  useEffect(() => {
    const currentResults = resultsCache[selectedBrain];
    if (currentResults && currentResults.length > 0) setSelectedStock(currentResults[0]);
  }, [selectedBrain, resultsCache]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Step 1: Connecting to Alpha Vault (Stage 5)...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length > 0) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        setElite50(content.ict_universe || []);
        addLog(`Vault Synchronized: ${content.ict_universe?.length || 0} candidates ready.`, "ok");
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); } finally { setLoading(false); }
  };

  const executeAlphaFinalization = async (forceProvider?: ApiProvider) => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    const providerToUse = forceProvider || selectedBrain;
    const brainName = providerToUse === ApiProvider.GEMINI ? "Gemini 3 Flash" : "Sonar Pro";
    
    addLog(`Protocol: Synthesizing with ${brainName}...`, "info");
    
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      const { data, error, code } = await generateAlphaSynthesis(topCandidates, providerToUse);
      
      if (error) {
        if (code === 429 && providerToUse === ApiProvider.GEMINI) {
          addLog("Gemini Daily Quota Exceeded (429). AUTO-SWITCHING to Sonar Pro...", "warn");
          setLoading(false);
          setSelectedBrain(ApiProvider.PERPLEXITY);
          // 2초 후 Sonar로 재시도
          setTimeout(() => executeAlphaFinalization(ApiProvider.PERPLEXITY), 2000);
          return;
        }
        throw new Error(error);
      }

      if (data) {
        const merged = data.map(ai => {
          const item = topCandidates.find(c => c.symbol.toUpperCase() === ai.symbol.toUpperCase());
          const entry = (item?.price || 0) * 0.985;
          return { ...item, ...ai, entryPrice: ai.entryPrice || entry, targetPrice: ai.targetPrice || entry * 1.3, stopLoss: ai.stopLoss || entry * 0.9 };
        });

        setResultsCache(prev => ({ ...prev, [providerToUse]: merged }));
        setSelectedStock(merged[0]);
        onFinalSymbolsDetected?.(merged.map(t => t.symbol));
        addLog(`Alpha Protocol Success: ${merged.length} strategies finalized.`, "ok");
      }
    } catch (e: any) { addLog(`Node Error: ${e.message}`, "err"); } finally { setLoading(false); }
  };

  const candidates = resultsCache[selectedBrain] || [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative overflow-hidden transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">Alpha_Discovery v8.2.6</h2>
            </div>
            <div className="flex gap-4">
              <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                <button onClick={() => setSelectedBrain(ApiProvider.GEMINI)} className={`px-5 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${selectedBrain === ApiProvider.GEMINI ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>Gemini</button>
                <button onClick={() => setSelectedBrain(ApiProvider.PERPLEXITY)} className={`px-5 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${selectedBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500'}`}>Sonar</button>
              </div>
              <button onClick={() => executeAlphaFinalization()} disabled={loading || elite50.length === 0} className="px-10 py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {candidates.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-8 rounded-[40px] border-l-4 transition-all cursor-pointer relative overflow-hidden h-[240px] flex flex-col justify-between ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-950/20 shadow-xl scale-105' : 'border-l-white/10 hover:bg-white/5'}`}>
                  <div className="relative z-10">
                     <span className={`text-[8px] font-black tracking-[0.4em] uppercase ${idx === 0 ? 'text-rose-500' : 'text-slate-500'}`}>PRIORITY #{idx + 1}</span>
                     <h4 className="text-5xl font-black text-white italic tracking-tighter uppercase mt-2">{item.symbol}</h4>
                  </div>
                  <div className="flex justify-between items-end relative z-10">
                     <div><p className="text-[7px] font-black text-slate-600 uppercase mb-1">Target</p><p className="text-lg font-black text-blue-400 font-mono">{item.expectedReturn}</p></div>
                     <div className="text-right"><p className="text-[7px] font-black text-slate-600 uppercase mb-1">Price</p><p className="text-lg font-black text-white font-mono">${(Number(item.price) || 0).toFixed(2)}</p></div>
                  </div>
                  {idx === 0 && <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-rose-500/10 blur-[60px] pointer-events-none"></div>}
               </div>
             ))}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-10 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6 transition-all duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex justify-between items-center">
                      <h3 className="text-6xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3>
                      <div className="text-center px-10 py-5 bg-white/5 rounded-3xl border border-white/5"><p className="text-[8px] font-black text-slate-600 uppercase mb-2">Alpha Conviction</p><p className="text-3xl font-black text-emerald-400 font-mono">{selectedStock.convictionScore?.toFixed(1)}%</p></div>
                   </div>
                   <div className="grid grid-cols-3 gap-6">
                      <div className="p-8 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 text-center"><p className="text-[8px] font-black text-emerald-500 uppercase mb-3 tracking-widest">Neural Entry</p><p className="text-2xl font-mono font-black text-white">${(Number(selectedStock.entryPrice) || 0).toFixed(2)}</p></div>
                      <div className="p-8 bg-blue-500/5 rounded-3xl border border-blue-500/10 text-center"><p className="text-[8px] font-black text-blue-500 uppercase mb-3 tracking-widest">Alpha Target</p><p className="text-2xl font-mono font-black text-white">${(Number(selectedStock.targetPrice) || 0).toFixed(2)}</p></div>
                      <div className="p-8 bg-rose-500/5 rounded-3xl border border-rose-500/10 text-center"><p className="text-[8px] font-black text-rose-500 uppercase mb-3 tracking-widest">Hard Stop</p><p className="text-2xl font-mono font-black text-white">${(Number(selectedStock.stopLoss) || 0).toFixed(2)}</p></div>
                   </div>
                   <div className="bg-black/60 rounded-[40px] border border-white/5 aspect-video overflow-hidden"><iframe title="Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full border-none"></iframe></div>
                </div>
                <div className="space-y-8">
                   <div className="p-10 bg-rose-500/10 rounded-[48px] border border-rose-500/20"><p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-8">AI Sentiment Report</p><p className="text-sm text-slate-300 italic leading-relaxed uppercase font-bold">{selectedStock.aiSentiment}</p></div>
                   <div className="p-10 bg-white/5 rounded-[40px] border border-white/5 border-l-8 border-l-rose-500"><p className="text-[10px] font-black text-slate-600 uppercase mb-6 tracking-widest">Selection Dimensions</p><div className="space-y-4">{(selectedStock.selectionReasons || []).map((r, i) => (<div key={i} className="flex items-start space-x-3"><div className="w-2 h-2 rounded-full bg-rose-500 mt-1"></div><p className="text-xs font-black text-slate-400 uppercase italic tracking-tighter">{r}</p></div>))}</div></div>
                </div>
             </div>
          </div>
        )}
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2"><h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3></div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (<div key={i} className={`pl-4 border-l-2 transition-all ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-rose-900'}`}>{l}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
