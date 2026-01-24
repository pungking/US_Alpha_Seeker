
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import { generateAlphaSynthesis } from '../services/geminiService';

/**
 * AI Studio API Key selection interface definition.
 * Named AIStudio to match existing type expectations in the global environment.
 */
interface AIStudio {
  hasSelectedApiKey(): Promise<boolean>;
  openSelectKey(): Promise<void>;
}

declare global {
  interface Window {
    // Use the explicit AIStudio interface type to avoid conflicts with predefined global declarations
    aistudio: AIStudio;
  }
}

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
  ictScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sector: string;
  // Stage 6 Specifics (AI Generated)
  aiVerdict?: string;
  convictionScore?: number;
  theme?: string;
  selectionReasons?: string[];
  investmentOutlook?: string;
  aiSentiment?: string;
  // Final Strategy Data
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

const AlphaAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [final5, setFinal5] = useState<AlphaCandidate[]>([]);
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v6.9.5: Reasoning Engine Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    checkApiKeyStatus();
    if (accessToken && elite50.length === 0) {
      loadStage5Data();
    }
  }, [accessToken]);

  const checkApiKeyStatus = async () => {
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    }
  };

  const handleSelectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
      addLog("API Key selected. Ready for synthesis.", "ok");
    }
  };

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Pulling ICT Elites from Stage 5 Vault...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 5 input not found.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.ict_universe) {
        setElite50(content.ict_universe);
        addLog(`Synchronized ${content.ict_universe.length} top candidates.`, "ok");
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    
    // API key check using pre-configured aistudio interface
    if (window.aistudio) {
      const selected = await window.aistudio.hasSelectedApiKey();
      if (!selected) {
        setHasApiKey(false);
        addLog("Synthesis blocked: Paid API Key required for Gemini 3 Pro.", "err");
        return;
      }
    }

    setLoading(true);
    setProgress(0);
    addLog("Initiating Multi-Model Strategy Synthesis...", "info");
    
    try {
      // 1. Mock data processing steps (0% -> 60%)
      const steps = ["Quant-Data Fetching", "Pattern Recognition", "ICT Footprint Matching"];
      for (let i = 0; i < steps.length; i++) {
        const nextProgress = (i + 1) * 20;
        setProgress(nextProgress);
        addLog(`AI Core Status: ${steps[i]}...`, "info");
        await new Promise(r => setTimeout(r, 600));
      }

      // 2. AI Reasoning Preparation (80%)
      setProgress(80);
      addLog("[THINKING] Gemini 3 Pro reasoning engine is analyzing candidates...", "warn");
      
      const top5 = [...elite50]
        .sort((a, b) => b.compositeAlpha - a.compositeAlpha)
        .slice(0, 5);

      if (top5.length === 0) throw new Error("No candidates found in Elite50.");

      // 3. API Invocation (90%)
      setProgress(90);
      const aiResults = await generateAlphaSynthesis(top5);
      
      if (!aiResults || !Array.isArray(aiResults)) {
        if (!aiResults) addLog("Requested entity not found or API Error. Please re-select Key.", "err");
        throw new Error("Invalid or empty AI synthesis results.");
      }

      const finalSelection = top5.map(item => {
        const aiData = aiResults.find((r: any) => r.symbol.toUpperCase() === item.symbol.toUpperCase()) || {};
        const entry = item.price * 0.98;
        return {
          ...item,
          ...aiData,
          entryPrice: entry,
          targetPrice: entry * 1.25,
          stopLoss: entry * 0.93,
        };
      });

      setFinal5(finalSelection);
      setSelectedStock(finalSelection[0]);
      setProgress(100);
      addLog(`Alpha Synthesis Successful. 5 High-Conviction assets localized.`, "ok");
    } catch (error: any) {
      addLog(`System Error: ${error.message}`, "err");
      // Prompt for key selection if the requested project is not found
      if (error.message.includes("not found")) {
        setHasApiKey(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20">
                 <svg className={`w-6 h-6 text-rose-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Deep_Final</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400 uppercase tracking-widest italic">Trade Perspective v6.9.5</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              {!hasApiKey ? (
                <div className="flex items-center space-x-4 bg-slate-950/60 p-2 rounded-2xl border border-rose-500/20">
                  <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-[8px] font-bold text-slate-500 underline uppercase px-2">Billing Doc</a>
                  <button 
                    onClick={handleSelectKey}
                    className="px-6 py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 transition-all"
                  >
                    Select Paid API Key
                  </button>
                </div>
              ) : (
                <button 
                  onClick={executeAlphaFinalization}
                  disabled={loading || elite50.length === 0}
                  className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white shadow-rose-900/20 hover:scale-105'}`}
                >
                  {loading ? (progress < 100 ? `Synthesizing ${Math.floor(progress)}%` : 'Finalizing...') : 'Start AI Synthesis'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {final5.map((item, idx) => (
               <div 
                 key={item.symbol} 
                 onClick={() => setSelectedStock(item)}
                 className={`glass-panel p-6 rounded-[32px] border-l-4 transition-all group relative overflow-hidden cursor-pointer ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10' : 'border-l-rose-500/20 bg-slate-900/40 hover:bg-rose-500/5'}`}
               >
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <span className="text-[10px] font-black text-rose-500/60 tracking-[0.4em]">ALPHA #{idx + 1}</span>
                        <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-tight">{item.symbol}</h4>
                        <p className="text-[8px] font-bold text-slate-500 uppercase truncate w-32">{item.theme || item.name}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-xs font-black text-white italic">CONVICTION</p>
                        <p className="text-xl font-black text-rose-500 italic">{item.convictionScore?.toFixed(1)}%</p>
                     </div>
                  </div>
                  <div className="mt-4 flex flex-col space-y-1">
                     <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Entry: ${item.entryPrice?.toFixed(2)}</p>
                     <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Target: ${item.targetPrice?.toFixed(2)}</p>
                  </div>
               </div>
             ))}
             {final5.length === 0 && (
                <div className="col-span-full py-20 text-center opacity-20">
                   <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting AI reasoning engine trigger...</p>
                </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-5xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3>
                        <p className="text-sm font-bold text-slate-500 uppercase mt-1">Deep Strategy Audit</p>
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
                         <div className="text-center px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Stop</p>
                            <p className="text-lg font-black text-rose-500 font-mono">${selectedStock.stopLoss?.toFixed(2)}</p>
                         </div>
                      </div>
                   </div>

                   <div className="bg-black/60 rounded-[32px] border border-white/5 aspect-video overflow-hidden relative">
                      <iframe 
                        title="Live Chart"
                        src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`}
                        className="w-full h-full border-none"
                      ></iframe>
                   </div>

                   <div className="p-8 bg-white/5 rounded-[32px] border border-white/5">
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-4">Investment Perspective</h4>
                      <p className="text-sm text-slate-300 leading-relaxed font-medium italic">
                        {selectedStock.investmentOutlook || "분석 데이터를 가져오는 중입니다..."}
                      </p>
                      <div className="mt-6 p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                        <p className="text-[9px] font-black text-rose-400 uppercase mb-2">AI Verdict</p>
                        <p className="text-xs text-white font-bold italic">{selectedStock.aiVerdict || "N/A"}</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-8 pt-4">
                   <div>
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6">Conviction Dimensions</h4>
                      <div className="space-y-6">
                        {selectedStock.selectionReasons?.map((reason, i) => (
                          <div key={i} className="flex space-x-4 items-start">
                             <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0"></div>
                             <p className="text-[11px] font-bold text-slate-400 leading-tight uppercase">{reason}</p>
                          </div>
                        )) || (
                          <p className="text-[10px] text-slate-600 italic">No specific reasons generated yet.</p>
                        )}
                      </div>
                   </div>
                   
                   <div className="p-8 bg-rose-500/10 rounded-[40px] border border-rose-500/20">
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4">AI Sentiment Hash</p>
                      <div className="flex items-center space-x-4 mb-4">
                         <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div>
                         </div>
                         <span className="text-xs font-black text-white">{selectedStock.convictionScore?.toFixed(1) || "50.0"}%</span>
                      </div>
                      <p className="text-[9px] text-slate-500 italic leading-relaxed uppercase">
                        {selectedStock.aiSentiment || "Analyzing real-time order block flow..."}
                      </p>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3>
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-rose-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
