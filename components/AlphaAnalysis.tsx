
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
  onComplete?: () => void;
  autoStart?: boolean;
}

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected, onComplete, autoStart }) => {
  const [loading, setLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.2.5: Macro-Quant Fusion Protocol Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) {
      loadStage5Data();
    }
  }, [accessToken]);

  useEffect(() => {
    if (autoStart && !loading && elite50.length > 0 && !resultsCache[selectedBrain]) {
      executeAlphaFinalization();
    }
  }, [autoStart, elite50]);

  useEffect(() => {
    const currentResults = resultsCache[selectedBrain];
    if (currentResults && currentResults.length > 0) {
      setSelectedStock(currentResults[0]);
    } else {
      setSelectedStock(null);
    }
  }, [selectedBrain, resultsCache]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Connecting to Alpha Vault Stage 5...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!res.files?.length) {
        addLog("Vault Signal Refused. Stage 5 data not indexed yet. Retrying in 5s...", "warn");
        setTimeout(loadStage5Data, 5000);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${res.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.ict_universe) {
        setElite50(content.ict_universe);
        addLog(`Vault Linked: ${content.ict_universe.length} candidates retrieved.`, "ok");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    
    setLoading(true);
    setProgress(0);
    setSelectedStock(null);
    
    // 오토파일럿 시 제미나이 우선 시도
    let targetBrain = autoStart ? ApiProvider.GEMINI : selectedBrain;
    if (autoStart) setSelectedBrain(ApiProvider.GEMINI);

    addLog(`Protocol: Initiating Synthesis with ${targetBrain === ApiProvider.GEMINI ? 'Gemini 3 Flash' : 'Sonar Pro'}...`, "info");
    
    try {
      setProgress(15);
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      
      let synthesisResponse = await generateAlphaSynthesis(topCandidates, targetBrain);
      
      // 제미나이 오류 시 퍼플리시티 폴백
      if (synthesisResponse.error && targetBrain === ApiProvider.GEMINI) {
        addLog(`Gemini Node Error: ${synthesisResponse.error}. Engaging Sonar Fallback...`, "warn");
        targetBrain = ApiProvider.PERPLEXITY;
        setSelectedBrain(ApiProvider.PERPLEXITY);
        synthesisResponse = await generateAlphaSynthesis(topCandidates, ApiProvider.PERPLEXITY);
      }

      if (synthesisResponse.error) {
        addLog(`Neural Link Failure: ${synthesisResponse.error}`, "err");
        setLoading(false);
        return;
      }

      setProgress(75);
      const aiResults = synthesisResponse.data || [];
      const mergedFinal = aiResults.map(aiData => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        if (!item) return null;
        const entry = item.price * 0.985;
        return { ...item, ...aiData, entryPrice: entry, targetPrice: entry * 1.30, stopLoss: entry * 0.91 };
      }).filter(x => x !== null).sort((a: any, b: any) => (b.convictionScore || 0) - (a.convictionScore || 0)) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [targetBrain]: mergedFinal }));

      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol));
      }

      if (accessToken) {
        const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
        const fileName = `STAGE6_ALPHA_FINAL_${targetBrain}_${new Date().toISOString().split('T')[0]}.json`;
        await uploadFile(accessToken, folderId, fileName, { manifest: { version: "8.2.5", brain: targetBrain, count: mergedFinal.length }, alpha_universe: mergedFinal });
        addLog(`Vault Finalized: ${fileName}`, "ok");
      }

      setProgress(100);
      addLog(`Cycle Complete. ${mergedFinal.length} Alpha targets detected.`, "ok");
    } catch (error: any) {
      addLog(`Fatal Error: ${error.message.substring(0, 80)}`, "err");
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
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
  };

  const getCapColor = (cap?: string) => {
    if (cap === 'LARGE') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (cap === 'MID') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  };

  const currentFinalCandidates = resultsCache[selectedBrain] || [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative overflow-hidden transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500 shadow-indigo-900/10' : 'border-t-cyan-500 shadow-cyan-900/10'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v8.2.5</h2>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Holistic Strategy Synthesis</p>
              </div>
            </div>
            
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
              <button onClick={() => setSelectedBrain(ApiProvider.GEMINI)} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase transition-all flex items-center space-x-2 ${selectedBrain === ApiProvider.GEMINI ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Gemini</button>
              <button onClick={() => setSelectedBrain(ApiProvider.PERPLEXITY)} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase transition-all flex items-center space-x-2 ${selectedBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Sonar</button>
            </div>

            <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white hover:scale-105 active:scale-95'}`}>
              {loading ? 'Processing...' : 'Execute Alpha Engine'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 min-h-[160px]">
             {currentFinalCandidates.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-6 rounded-[32px] border-l-4 transition-all group cursor-pointer ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10 scale-[1.02]' : 'border-l-white/10 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-start mb-2">
                     <div><span className="text-[10px] font-black text-rose-500/60 tracking-[0.4em]">PRIORITY #{idx + 1}</span><h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-tight">{item.symbol}</h4></div>
                     <div className="text-right"><p className="text-[19px] font-black text-rose-500 italic">{(item.convictionScore || 0).toFixed(1)}%</p></div>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-4">
                     <span className={`text-[7px] px-2 py-0.5 rounded-full font-black border uppercase tracking-wider ${getCapColor(item.marketCapClass)}`}>{item.marketCapClass} CAP</span>
                     <span className="text-[7px] px-2 py-0.5 rounded-full font-black border border-white/10 bg-white/5 text-slate-400 uppercase tracking-wider truncate max-w-[120px]">{item.sectorTheme}</span>
                  </div>
               </div>
             ))}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6 transition-all duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div><h3 className="text-5xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3><p className="text-sm font-bold text-slate-500 uppercase mt-2">{selectedStock.name} — <span className="text-rose-500/80">{selectedStock.sectorTheme}</span></p></div>
                      <div className="flex gap-4">
                         <div className="text-center px-8 py-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Conviction</p><p className="text-2xl font-black text-emerald-400 font-mono">{(selectedStock.convictionScore || 0).toFixed(1)}%</p></div>
                         <div className="text-center px-8 py-4 bg-white/5 rounded-2xl border border-white/5"><p className="text-[8px] font-black text-slate-500 uppercase mb-1">Exp. Return</p><p className="text-2xl font-black text-blue-400 font-mono">{selectedStock.expectedReturn}</p></div>
                      </div>
                   </div>
                   <div className="grid grid-cols-3 gap-4">
                      <div className="p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/10"><p className="text-[8px] font-black text-emerald-500 uppercase mb-1 tracking-widest">Entry Zone</p><p className="text-xl font-mono font-black text-white">${selectedStock.entryPrice?.toFixed(2)}</p></div>
                      <div className="p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10"><p className="text-[8px] font-black text-blue-500 uppercase mb-1 tracking-widest">Alpha Target</p><p className="text-xl font-mono font-black text-white">${selectedStock.targetPrice?.toFixed(2)}</p></div>
                      <div className="p-6 bg-rose-500/5 rounded-2xl border border-rose-500/10"><p className="text-[8px] font-black text-rose-500 uppercase mb-1 tracking-widest">Hard Stop</p><p className="text-xl font-mono font-black text-white">${selectedStock.stopLoss?.toFixed(2)}</p></div>
                   </div>
                   <div className="bg-black/60 rounded-[32px] border border-white/5 aspect-video overflow-hidden relative shadow-inner"><iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none"></iframe></div>
                   <div className="p-10 bg-white/5 rounded-[32px] border border-white/5 group hover:border-rose-500/30 transition-all duration-500"><div className="flex items-center justify-between mb-4"><h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Investment Perspective</h4><span className="text-[8px] font-black text-slate-600 uppercase">Sector Focus: {selectedStock.sectorTheme}</span></div><div className="prose-report text-sm text-slate-300 leading-relaxed font-medium italic"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown></div></div>
                </div>
                <div className="space-y-8 pt-4">
                   <div><h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6">Conviction Dimensions</h4><div className="space-y-6">{(selectedStock.selectionReasons || []).map((reason, i) => (<div key={i} className="flex space-x-4 items-start group"><div className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_10px_rgba(244,63,94,0.6)]"></div><p className="text-xs font-bold text-slate-400 leading-tight uppercase group-hover:text-white transition-colors tracking-tight">{reason}</p></div>))}</div></div>
                   <div className="p-10 bg-rose-500/10 rounded-[40px] border border-rose-500/20 shadow-xl relative overflow-hidden"><p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-6">AI Sentiment Index</p><div className="flex items-center space-x-6 mb-6"><div className="h-3 flex-1 bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.6)]" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div></div><span className="text-lg font-black text-white">{(selectedStock.convictionScore || 50.0).toFixed(1)}%</span></div><p className="text-[10px] text-slate-400 italic leading-relaxed uppercase">{selectedStock.aiSentiment}</p></div>
                   <div className="p-8 bg-white/5 rounded-[32px] border border-white/5 border-l-4 border-l-rose-500"><p className="text-[9px] font-black text-slate-600 uppercase mb-4 tracking-widest">Macro-Quant Synthesis Logic</p><p className="text-xs text-slate-400 leading-relaxed italic uppercase font-mono tracking-tighter">{selectedStock.analysisLogic}</p></div>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2"><h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3><div className={`w-2 h-2 rounded-full ${loading ? 'bg-rose-500 animate-pulse' : 'bg-slate-700'}`}></div></div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (<div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-rose-900'}`}>{l}</div>))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
