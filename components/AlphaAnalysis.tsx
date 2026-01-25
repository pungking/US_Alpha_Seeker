
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  const [elite50, setElite50] = useState<AlphaCandidate[]>(() => {
    const cached = sessionStorage.getItem('stage6_elite50');
    return cached ? JSON.parse(cached) : [];
  });
  
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>(() => {
    const cached = sessionStorage.getItem('stage6_resultsCache');
    return cached ? JSON.parse(cached) : {};
  });
  
  const [isRestored, setIsRestored] = useState(false);
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.2.5: Macro-Quant Fusion Protocol Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    sessionStorage.setItem('stage6_elite50', JSON.stringify(elite50));
    sessionStorage.setItem('stage6_resultsCache', JSON.stringify(resultsCache));
  }, [elite50, resultsCache]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) {
      loadStage5Data();
    }
    if (!resultsCache[selectedBrain]) {
        restoreLatestAnalysis();
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
      if (!selectedStock) setSelectedStock(currentResults[0]);
      onFinalSymbolsDetected?.(currentResults.map(t => t.symbol));
    }
  }, [selectedBrain, resultsCache]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const restoreLatestAnalysis = async () => {
    if (!accessToken) return;
    const q = encodeURIComponent(`name contains 'STAGE6_ALPHA_FINAL' and trashed = false`);
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=5`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (res.files && res.files.length > 0) {
        addLog("Syncing prior cloud analysis for review...", "info");
        for (const file of res.files) {
          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
          
          if (content.alpha_universe) {
            const brain = file.name.includes('Gemini') ? ApiProvider.GEMINI : ApiProvider.PERPLEXITY;
            setResultsCache(prev => ({ ...prev, [brain]: content.alpha_universe }));
            setIsRestored(true);
          }
        }
      }
    } catch (e) {}
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Step 1: Synchronizing Pipeline Matrix (Stage 5)...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (res.files?.length > 0) {
        const file = res.files[0];
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (content.ict_universe) {
          setElite50(content.ict_universe);
          addLog(`Pipeline Link Stable: ${content.ict_universe.length} candidates ready for AI Synthesis.`, "ok");
        }
      } else {
        addLog("Pipeline Gap: Stage 5 data not found. Automatic engine disabled.", "warn");
      }
    } catch (e: any) {
      addLog(`Sync Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) {
        addLog("Execution Aborted: Missing required Stage 5 pipeline data.", "err");
        return;
    }
    
    setLoading(true);
    setIsRestored(false);
    setProgress(10);
    
    let currentProvider = selectedBrain;
    addLog(`Protocol Phase 2: Synthesis via ${currentProvider}...`, "info");
    
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      let response = await generateAlphaSynthesis(topCandidates, currentProvider);
      
      const errorStr = JSON.stringify(response.error || "").toLowerCase();
      if (response.error && (errorStr.includes("429") || errorStr.includes("quota"))) {
        addLog("Gemini Quota Exceeded. Engaging Sonar Fallback...", "warn");
        currentProvider = ApiProvider.PERPLEXITY;
        setSelectedBrain(ApiProvider.PERPLEXITY);
        response = await generateAlphaSynthesis(topCandidates, currentProvider);
      }

      if (response.data) {
        const aiResults = response.data;
        const mergedFinal = aiResults.map(aiData => {
          const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
          if (!item) return null;
          const entry = item.price * 0.985;
          return { 
            ...item, 
            ...aiData, 
            entryPrice: aiData.entryPrice || entry, 
            targetPrice: aiData.targetPrice || entry * 1.30, 
            stopLoss: aiData.stopLoss || entry * 0.91 
          };
        }).filter(x => x !== null) as AlphaCandidate[];

        setResultsCache(prev => ({ ...prev, [currentProvider]: mergedFinal }));
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol));

        if (accessToken) {
          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
          const fileName = `STAGE6_ALPHA_FINAL_${currentProvider}_${new Date().toISOString().split('T')[0]}.json`;
          await uploadFile(accessToken, folderId, fileName, { manifest: { brain: currentProvider, session: new Date().getTime() }, alpha_universe: mergedFinal });
        }
        addLog(`Alpha Protocol Success: ${mergedFinal.length} strategies synthesized.`, "ok");
      }
    } catch (error: any) {
      addLog(`Fatal Node Error: ${error.message}`, "err");
    } finally {
      setLoading(false);
      setProgress(100);
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

  const candidates = resultsCache[selectedBrain] || [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden transition-all duration-500">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">ALPHA_DISCOVERY V8.2.5</h2>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Holistic Strategy Synthesis</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
               {isRestored && !loading && (
                 <span className="text-[8px] font-black px-2 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded uppercase tracking-widest">Vault_Restored</span>
               )}
               <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                <button onClick={() => setSelectedBrain(ApiProvider.GEMINI)} className={`px-5 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${selectedBrain === ApiProvider.GEMINI ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Gemini 3 Pro</button>
                <button onClick={() => setSelectedBrain(ApiProvider.PERPLEXITY)} className={`px-5 py-2 rounded-xl text-[8px] font-black uppercase transition-all ${selectedBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Sonar Pro</button>
              </div>
              <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white hover:scale-105 active:scale-95'}`}>
                {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
              </button>
            </div>
          </div>

          {!loading && candidates.length === 0 && elite50.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-black/20 rounded-[32px] border border-white/5 border-dashed">
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.6em] mb-4">Awaiting Pipeline Signal</p>
                <p className="text-[8px] text-slate-700 italic">Stage 5 data must be finalized before engine execution.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {candidates.map((item, idx) => (
               <div 
                key={item.symbol} 
                onClick={() => setSelectedStock(item)} 
                className={`glass-panel p-8 rounded-[40px] border-l-4 transition-all group cursor-pointer relative overflow-hidden flex flex-col justify-between h-[240px] ${
                    selectedStock?.symbol === item.symbol 
                    ? idx === 0 ? 'border-l-rose-500 bg-rose-950/20 shadow-[inset_0_0_40px_rgba(244,63,94,0.1)]' : 'border-l-indigo-500 bg-indigo-950/20'
                    : 'border-l-white/10 hover:bg-white/5'
                }`}
               >
                  <div className="flex justify-between items-start relative z-10">
                     <div>
                        <span className={`text-[8px] font-black tracking-[0.4em] uppercase ${idx === 0 ? 'text-rose-500' : 'text-slate-500'}`}>PRIORITY #{idx + 1}</span>
                        <h4 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-tight mt-2">{item.symbol}</h4>
                     </div>
                     <div className="text-right">
                        <p className={`text-3xl font-black italic ${idx === 0 ? 'text-rose-500' : 'text-indigo-400'}`}>{item.convictionScore?.toFixed(1)}%</p>
                     </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mt-4 relative z-10">
                    <span className={`px-3 py-1 rounded-full text-[7px] font-black uppercase border ${item.marketCapClass === 'LARGE' ? 'bg-blue-600/10 text-blue-400 border-blue-500/20' : 'bg-amber-600/10 text-amber-400 border-amber-500/20'}`}>
                        {item.marketCapClass || 'MID CAP'}
                    </span>
                    <span className="px-3 py-1 rounded-full text-[7px] font-black uppercase bg-slate-800 text-slate-400 border border-white/5 truncate max-w-[140px]">
                        {item.sectorTheme || item.sector}
                    </span>
                  </div>

                  <div className="flex justify-between items-end mt-8 relative z-10 border-t border-white/5 pt-4">
                     <div className="flex flex-col">
                        <span className="text-[7px] font-black text-slate-600 uppercase mb-1">Target Return</span>
                        <span className="text-lg font-black text-blue-400 font-mono">{item.expectedReturn || '+--%'}</span>
                     </div>
                     <div className="text-right flex flex-col">
                        <span className="text-[7px] font-black text-slate-600 uppercase mb-1">Mkt Price</span>
                        <span className="text-lg font-black text-white font-mono">${item.price.toFixed(2)}</span>
                     </div>
                  </div>

                  {idx === 0 && <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-rose-500/10 blur-[60px] pointer-events-none"></div>}
               </div>
             ))}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6 transition-all duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div><h3 className="text-6xl font-black text-white italic tracking-tighter uppercase leading-none">{selectedStock.symbol}</h3><p className="text-sm font-bold text-slate-500 uppercase mt-4 tracking-widest">{selectedStock.name} — <span className="text-rose-500/80">{selectedStock.sectorTheme}</span></p></div>
                      <div className="flex gap-4">
                         <div className="text-center px-10 py-5 bg-white/5 rounded-3xl border border-white/5"><p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">Alpha Conviction</p><p className="text-3xl font-black text-emerald-400 font-mono">{selectedStock.convictionScore?.toFixed(1)}%</p></div>
                         <div className="text-center px-10 py-5 bg-white/5 rounded-3xl border border-white/5"><p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">Exp. Return</p><p className="text-3xl font-black text-blue-400 font-mono">{selectedStock.expectedReturn}</p></div>
                      </div>
                   </div>
                   <div className="grid grid-cols-3 gap-6">
                      <div className="p-8 bg-emerald-500/5 rounded-3xl border border-emerald-500/10 text-center"><p className="text-[8px] font-black text-emerald-500 uppercase mb-3 tracking-[0.3em]">Neural Entry</p><p className="text-2xl font-mono font-black text-white italic">${selectedStock.entryPrice?.toFixed(2)}</p></div>
                      <div className="p-8 bg-blue-500/5 rounded-3xl border border-blue-500/10 text-center"><p className="text-[8px] font-black text-blue-500 uppercase mb-3 tracking-[0.3em]">Alpha Target</p><p className="text-2xl font-mono font-black text-white italic">${selectedStock.targetPrice?.toFixed(2)}</p></div>
                      <div className="p-8 bg-rose-500/5 rounded-3xl border border-rose-500/10 text-center"><p className="text-[8px] font-black text-rose-500 uppercase mb-3 tracking-[0.3em]">Hard Stop</p><p className="text-2xl font-mono font-black text-white italic">${selectedStock.stopLoss?.toFixed(2)}</p></div>
                   </div>
                   <div className="bg-black/60 rounded-[40px] border border-white/5 aspect-video overflow-hidden relative shadow-inner"><iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none"></iframe></div>
                   <div className="p-12 bg-white/5 rounded-[40px] border border-white/10 group hover:border-rose-500/30 transition-all duration-500">
                        <div className="flex items-center justify-between mb-8"><h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em]">Investment Perspective</h4><span className="text-[8px] font-black text-slate-600 uppercase">Focus: {selectedStock.theme || 'Macro Synthesis'}</span></div>
                        <div className="prose-report text-base text-slate-300 leading-relaxed font-medium italic"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown></div>
                    </div>
                </div>
                <div className="space-y-8 pt-4">
                   <div><h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-8">Strategic Dimensions</h4><div className="space-y-8">{(selectedStock.selectionReasons || []).map((reason, i) => (<div key={i} className="flex space-x-5 items-start group p-4 rounded-2xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5"><div className="w-3 h-3 rounded-full bg-rose-500 mt-1 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_15px_rgba(244,63,94,0.8)]"></div><p className="text-[13px] font-black text-slate-400 leading-tight uppercase group-hover:text-white transition-colors tracking-tighter italic">{reason}</p></div>))}</div></div>
                   <div className="p-12 bg-rose-500/10 rounded-[48px] border border-rose-500/20 shadow-xl relative overflow-hidden group">
                        <p className="text-[10px] font-black text-rose-500 uppercase tracking-[0.3em] mb-8">AI Sentiment Index</p>
                        <div className="flex items-center space-x-6 mb-8">
                            <div className="h-4 flex-1 bg-black/60 rounded-full overflow-hidden p-1 border border-white/5">
                                <div className="h-full bg-gradient-to-r from-rose-700 to-rose-400 rounded-full shadow-[0_0_20px_rgba(244,63,94,0.4)] group-hover:scale-x-105 transition-transform origin-left" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div>
                            </div>
                            <span className="text-2xl font-black text-white italic tracking-tighter">{(selectedStock.convictionScore || 50.0).toFixed(1)}%</span>
                        </div>
                        <p className="text-[11px] text-slate-400 italic leading-relaxed uppercase font-bold tracking-tight">{selectedStock.aiSentiment}</p>
                   </div>
                   <div className="p-10 bg-white/5 rounded-[40px] border border-white/5 border-l-8 border-l-rose-500"><p className="text-[10px] font-black text-slate-600 uppercase mb-6 tracking-widest">Neural Fusion Matrix</p><p className="text-xs text-slate-400 leading-relaxed italic uppercase font-mono tracking-tighter font-bold">{selectedStock.analysisLogic}</p></div>
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
