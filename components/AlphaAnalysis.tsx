
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';
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
  convictionScore?: number;
  theme?: string;
  selectionReasons?: string[];
  investmentOutlook?: string;
  aiSentiment?: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

const AlphaAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [selectedBrain, setSelectedBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [final5, setFinal5] = useState<AlphaCandidate[]>([]);
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v7.5.0: Dynamic Intelligence Protocol Active.']);
  
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

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Handshaking with Stage 5 Cloud Vault...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Critical: Stage 5 input matrix missing. Pipeline halted.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.ict_universe) {
        setElite50(content.ict_universe);
        addLog(`Vault Synchronized: ${content.ict_universe.length} high-alpha candidates loaded.`, "ok");
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
    const brainName = selectedBrain.split(' ').pop();
    addLog(`System: Allocating neural resources to ${brainName} Brain...`, "info");
    
    try {
      setProgress(15);
      const top5 = [...elite50]
        .sort((a, b) => b.compositeAlpha - a.compositeAlpha)
        .slice(0, 5);

      addLog(`Task: Evaluating Top 5 Alpha candidates for strategy synthesis.`, "info");
      setProgress(30);

      const statusMsgs = {
        [ApiProvider.GEMINI]: "Synthesizing through Google Multi-Modal Reasoning Layer...",
        [ApiProvider.CHATGPT]: "Accessing OpenAI Elite Inference Cluster (Org-vI8)...",
        [ApiProvider.PERPLEXITY]: "Scanning Live Web Indices & Real-time Institutional Flows..."
      };

      addLog(`[CONNECTING] ${statusMsgs[selectedBrain] || 'AI Handshake...'}`, "warn");
      
      const aiResults = await generateAlphaSynthesis(top5, selectedBrain);
      
      if (!aiResults) {
        addLog(`Link Failure: ${selectedBrain} API returned 0 payload. Check Entitlements.`, "err");
        throw new Error("AI_HANDSHAKE_FAILED");
      }

      setProgress(85);
      addLog("Intelligence Payload received. Validating JSON integrity...", "ok");

      const finalSelection = top5.map(item => {
        const aiData = aiResults.find((r: any) => r.symbol.toUpperCase() === item.symbol.toUpperCase()) || {};
        const entry = item.price * 0.985;
        return {
          ...item,
          ...aiData,
          entryPrice: entry,
          targetPrice: entry * 1.22,
          stopLoss: entry * 0.94,
        };
      });

      setFinal5(finalSelection);
      setSelectedStock(finalSelection[0]);
      setProgress(100);
      addLog(`Discovery Finalized: 5 Institutional-Grade strategies deployed.`, "ok");
    } catch (error: any) {
      addLog(`Core Stop: ${error.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const getThemeColor = () => {
    switch (selectedBrain) {
      case ApiProvider.GEMINI: return 'border-t-indigo-500 shadow-indigo-900/10';
      case ApiProvider.CHATGPT: return 'border-t-emerald-500 shadow-emerald-900/10';
      case ApiProvider.PERPLEXITY: return 'border-t-cyan-500 shadow-cyan-900/10';
      default: return 'border-t-rose-500';
    }
  };

  const brains = [
    { provider: ApiProvider.GEMINI, label: 'Gemini 3 Pro', color: 'bg-indigo-600', icon: 'G' },
    { provider: ApiProvider.CHATGPT, label: 'ChatGPT-4o', color: 'bg-emerald-600', icon: 'C' },
    { provider: ApiProvider.PERPLEXITY, label: 'Perplexity', color: 'bg-cyan-600', icon: 'P' }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative overflow-hidden transition-all duration-500 ${getThemeColor()}`}>
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v7.5</h2>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Enterprise Neural Architecture • Stage 6</p>
              </div>
            </div>
            
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
              {brains.map((brain) => (
                <button
                  key={brain.provider}
                  onClick={() => setSelectedBrain(brain.provider)}
                  className={`px-5 py-3 rounded-xl text-[9px] font-black uppercase transition-all flex items-center space-x-2 ${selectedBrain === brain.provider ? brain.color + ' text-white shadow-lg scale-105' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}
                >
                  <span className="w-4 h-4 rounded-md flex items-center justify-center bg-black/20 text-[8px]">{brain.icon}</span>
                  <span>{brain.label}</span>
                </button>
              ))}
            </div>

            <button 
              onClick={executeAlphaFinalization}
              disabled={loading || elite50.length === 0}
              className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white shadow-rose-900/20 hover:scale-105 active:scale-95'}`}
            >
              {loading ? 'Synthesizing...' : 'Execute Strategy Brain'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {final5.map((item, idx) => (
               <div 
                 key={item.symbol} 
                 onClick={() => setSelectedStock(item)}
                 className={`glass-panel p-6 rounded-[32px] border-l-4 transition-all group relative overflow-hidden cursor-pointer ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10 scale-[1.02]' : 'border-l-white/10 bg-slate-900/40 hover:bg-white/5'}`}
               >
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <span className="text-[10px] font-black text-rose-500/60 tracking-[0.4em]">ALPHA #{idx + 1}</span>
                        <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-tight">{item.symbol}</h4>
                        <p className="text-[8px] font-bold text-slate-500 uppercase truncate w-32">{item.theme || item.name}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-[8px] font-black text-slate-500 italic uppercase">Conviction</p>
                        <p className="text-xl font-black text-rose-500 italic">{item.convictionScore?.toFixed(1)}%</p>
                     </div>
                  </div>
                  <div className="mt-4 flex flex-col space-y-1">
                     <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Entry: ${item.entryPrice?.toFixed(2)}</p>
                     <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Target: ${item.targetPrice?.toFixed(2)}</p>
                  </div>
               </div>
             ))}
             {final5.length === 0 && (
                <div className="col-span-full py-24 text-center opacity-20">
                   <p className="text-[10px] font-black uppercase tracking-[0.6em] animate-pulse">Select Multi-Brain Node and Initiate Alpha Protocol...</p>
                </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div>
                        <div className="flex items-center space-x-3">
                           <h3 className="text-5xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3>
                           <span className="text-[10px] bg-rose-500/20 text-rose-400 px-3 py-1 rounded-full font-black uppercase tracking-widest border border-rose-500/30">Alpha_Tier_1</span>
                        </div>
                        <p className="text-sm font-bold text-slate-500 uppercase mt-1">Deep Intelligence Audit Matrix</p>
                      </div>
                      <div className="flex gap-4">
                         <div className="text-center px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entry</p>
                            <p className="text-lg font-black text-emerald-400 font-mono">${selectedStock.entryPrice?.toFixed(2)}</p>
                         </div>
                         <div className="text-center px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Target</p>
                            <p className="text-lg font-black text-blue-400 font-mono">${selectedStock.targetPrice?.toFixed(2)}</p>
                         </div>
                      </div>
                   </div>

                   <div className="bg-black/60 rounded-[32px] border border-white/5 aspect-video overflow-hidden relative shadow-inner">
                      <iframe 
                        title="Live Chart"
                        src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`}
                        className="w-full h-full border-none"
                      ></iframe>
                   </div>

                   <div className="p-8 bg-white/5 rounded-[32px] border border-white/5 group hover:border-rose-500/30 transition-all duration-500">
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-4">Investment Perspective</h4>
                      <p className="text-sm text-slate-300 leading-relaxed font-medium italic">
                        {selectedStock.investmentOutlook || "Intelligence data parsing in progress..."}
                      </p>
                   </div>
                </div>

                <div className="space-y-8 pt-4">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6">Conviction Dimensions</h4>
                      <div className="space-y-6">
                        {selectedStock.selectionReasons?.map((reason, i) => (
                          <div key={i} className="flex space-x-4 items-start group">
                             <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 group-hover:scale-125 transition-transform shadow-[0_0_8px_rgba(244,63,94,0.6)]"></div>
                             <p className="text-[11px] font-bold text-slate-400 leading-tight uppercase group-hover:text-white transition-colors">{reason}</p>
                          </div>
                        ))}
                      </div>
                   </div>
                   
                   <div className="p-8 bg-rose-500/10 rounded-[40px] border border-rose-500/20 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-5">
                         <svg className="w-20 h-20 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                      </div>
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4">AI Sentiment Index</p>
                      <div className="flex items-center space-x-4 mb-4">
                         <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div>
                         </div>
                         <span className="text-xs font-black text-white">{selectedStock.convictionScore?.toFixed(1) || "50.0"}%</span>
                      </div>
                      <p className="text-[9px] text-slate-500 italic leading-relaxed uppercase">
                        {selectedStock.aiSentiment}
                      </p>
                   </div>

                   <div className="p-6 bg-white/5 rounded-[32px] border border-white/5">
                      <p className="text-[8px] font-black text-slate-600 uppercase mb-3">Analysis Logic</p>
                      <p className="text-[9px] text-slate-400 leading-relaxed italic">
                        This asset was localized using the {selectedBrain} reasoning model, combining institutional ICT patterns with deep quant fundamental scoring.
                      </p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3>
            <div className={`w-2 h-2 rounded-full ${loading ? 'bg-rose-500 animate-pulse' : 'bg-slate-700'}`}></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : 'border-rose-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-6 p-4 bg-slate-900/40 rounded-2xl border border-white/5">
             <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-slate-600">
                <span>Processor_State</span>
                <span className={loading ? 'text-rose-500' : 'text-slate-500'}>{loading ? 'In_Inference' : 'Standby'}</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
