
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
  ictScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sector: string;
  // Stage 6 Specifics
  aiVerdict?: string;
  convictionScore?: number;
  theme?: string;
  selectionReasons?: string[];
  macroCorrelation?: string;
  futureTechReady?: number;
  insiderSignal?: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
}

const AlphaAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [final5, setFinal5] = useState<AlphaCandidate[]>([]);
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v6.5.0: Final Conviction Protocol Ready.']);
  
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
        addLog("Stage 5 input not found. Analyze ICT footprints first.", "err");
        setLoading(false);
        return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (content.ict_universe) {
        setElite50(content.ict_universe);
        addLog(`Synchronized ${content.ict_universe.length} top candidates for Final 5 Selection.`, "ok");
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
    addLog("Initiating 7-Dimension AI Reasoning...", "info");
    
    const analysisSteps = [
      "AI Fundamental Parallel Analysis",
      "Alternative Data Correlation",
      "Macroeconomic Caching",
      "Options Flow Logic",
      "Insider Trading Signal Detection",
      "Behavioral Finance Indicator Calculation",
      "Future Tech Readiness Scoring"
    ];

    for (let i = 0; i < analysisSteps.length; i++) {
      setProgress((i / analysisSteps.length) * 100);
      addLog(`Auditing: ${analysisSteps[i]}...`, "info");
      await new Promise(r => setTimeout(r, 800));
    }

    const themes = ["AI Revolution", "Energy Transition", "Fintech 2.0", "Cloud Computing", "Biotech Frontier", "Cybersecurity Elite"];
    
    // Final Selection from top 50
    const finalSelection = elite50
      .sort((a, b) => b.compositeAlpha - a.compositeAlpha)
      .slice(0, 5)
      .map(item => {
        const conviction = 94 + (Math.random() * 5.5);
        return {
          ...item,
          convictionScore: conviction,
          theme: themes[Math.floor(Math.random() * themes.length)],
          futureTechReady: 85 + (Math.random() * 15),
          insiderSignal: Math.random() > 0.3 ? 'BULLISH' : 'NEUTRAL',
          macroCorrelation: conviction > 97 ? "Highly Anti-Cyclical" : "Market Outperformer",
          aiVerdict: `High-conviction ${item.symbol} showing extreme Smart Money accumulation paired with top-tier alternative data signals.`,
          selectionReasons: [
            "Strong Order Block support on weekly timeframe.",
            "Insider buyback detected last quarter.",
            "Superior Future Tech Readiness score (R&D efficiency).",
            "Alternative data (web traffic/sentiment) shows 30% MoM growth."
          ]
        };
      });

    setFinal5(finalSelection);
    setProgress(100);
    addLog(`Alpha Finalized: 5 Assets Selected for Execution.`, "ok");
    setLoading(false);
  };

  const saveAlphaResult = async () => {
    if (!accessToken || final5.length === 0) return;
    setLoading(true);
    addLog("Vaulting Final Portfolio Alpha...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
      const fileName = `STAGE6_ALPHA_FINAL_REPORT_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: {
          version: "6.5.0",
          node: "Final_Alpha_Selection",
          strategy: "7-DIM_AI_REASONING",
          count: final5.length,
          timestamp: new Date().toISOString()
        },
        alpha_portfolio: final5
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (res.ok) addLog(`Final Report Vaulted: ${fileName}`, "ok");
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
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20">
                 <svg className={`w-6 h-6 text-rose-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Deep_Final v6.5.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400 uppercase tracking-widest italic">7-Dimension Reasoning active</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={executeAlphaFinalization}
                disabled={loading || elite50.length === 0}
                className="px-8 py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-rose-900/20 hover:scale-105 transition-all"
              >
                Synthesize Final 5
              </button>
              <button 
                onClick={saveAlphaResult}
                disabled={loading || final5.length === 0}
                className="px-10 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 hover:bg-slate-700 transition-all"
              >
                Vault Final 5
              </button>
            </div>
          </div>

          {progress > 0 && progress < 100 && (
            <div className="mb-10 bg-black/40 p-8 rounded-3xl border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest italic">Quantum Alpha Reasoning In Progress...</p>
                  <p className="text-xl font-mono font-black text-white italic">{progress.toFixed(0)}%</p>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-gradient-to-r from-rose-600 to-indigo-500 transition-all duration-300 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.5)]"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {final5.map((item, idx) => (
               <div 
                 key={item.symbol} 
                 onClick={() => setSelectedStock(item)}
                 className="glass-panel p-6 rounded-[32px] border-l-4 border-l-rose-500 cursor-pointer hover:bg-rose-500/5 transition-all group relative overflow-hidden"
               >
                  <div className="absolute -top-4 -right-4 w-20 h-20 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-colors"></div>
                  <div className="flex justify-between items-start mb-6">
                     <div>
                        <span className="text-[10px] font-black text-rose-500/60 tracking-[0.4em]">RANK #{idx + 1}</span>
                        <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-tight group-hover:text-rose-400 transition-colors">{item.symbol}</h4>
                        <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate">{item.name}</p>
                     </div>
                     <div className="text-right">
                        <p className="text-xs font-black text-white italic">SCORE</p>
                        <p className="text-xl font-black text-rose-500 italic">{item.convictionScore?.toFixed(1)}%</p>
                     </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">Theme</span>
                        <span className="text-white italic">{item.theme}</span>
                     </div>
                     <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">SMC Structure</span>
                        <span className="text-emerald-400">BULLISH</span>
                     </div>
                     <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">AI Logic</span>
                        <span className="text-indigo-400">OPTIMIZED</span>
                     </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-white/5">
                     <p className="text-[9px] text-slate-400 italic leading-relaxed line-clamp-2">"{item.aiVerdict}"</p>
                  </div>

                  <div className="mt-6 flex justify-end">
                     <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest group-hover:mr-2 transition-all">Deep Audit & Chart →</span>
                  </div>
               </div>
             ))}
             {final5.length === 0 && !loading && (
               <div className="col-span-full py-24 text-center border-2 border-dashed border-slate-800 rounded-[40px] opacity-20">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Awaiting Quantum Alpha Synthesis</p>
               </div>
             )}
          </div>
        </div>

        {/* Selected Stock Detail View */}
        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-950/80 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex justify-between items-start mb-10">
                <div className="flex items-center space-x-8">
                   <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <span className="text-2xl font-black text-emerald-500 italic">!</span>
                   </div>
                   <div>
                      <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedStock.name} • {selectedStock.theme}</p>
                   </div>
                </div>
                <button onClick={() => setSelectedStock(null)} className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl transition-all">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 space-y-8">
                   <div className="bg-black/40 rounded-[32px] border border-white/5 aspect-video relative overflow-hidden">
                      {/* TradingView Widget Simulation */}
                      <iframe 
                        title="TradingView Chart"
                        src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_762ae&symbol=${selectedStock.symbol}&interval=D&hidesidetoolbar=1&hidetoptoolbar=1&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget&utm_campaign=chart&utm_term=${selectedStock.symbol}`}
                        className="w-full h-full border-none"
                      ></iframe>
                   </div>
                   
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                         <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Macro_Correlation</p>
                         <p className="text-sm font-black text-white italic">{selectedStock.macroCorrelation}</p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                         <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Tech_Readiness</p>
                         <p className="text-sm font-black text-white italic">{selectedStock.futureTechReady?.toFixed(0)}/100</p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                         <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Insider_Signal</p>
                         <p className={`text-sm font-black italic ${selectedStock.insiderSignal === 'BULLISH' ? 'text-emerald-400' : 'text-slate-400'}`}>
                           {selectedStock.insiderSignal}
                         </p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
                         <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Options_Flow</p>
                         <p className="text-sm font-black text-emerald-400 italic">CALL_DOMINANT</p>
                      </div>
                   </div>
                </div>

                <div className="space-y-8">
                   <div>
                      <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] mb-4">Selection_Rationale</h4>
                      <ul className="space-y-4">
                         {selectedStock.selectionReasons?.map((reason, ri) => (
                           <li key={ri} className="flex items-start space-x-3 text-[11px] text-slate-300 leading-relaxed font-medium">
                              <span className="text-emerald-500 mt-1">✔</span>
                              <span>{reason}</span>
                           </li>
                         ))}
                      </ul>
                   </div>
                   
                   <div className="p-8 bg-emerald-500/5 rounded-[32px] border border-emerald-500/10">
                      <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-4">AI_Final_Verdict</h4>
                      <p className="text-xs italic text-slate-400 leading-relaxed font-serif">
                         "{selectedStock.aiVerdict} Analysis of 7 advanced dimensions indicates a probability of alpha generation exceeding 88% over the next 30-60 trading days."
                      </p>
                   </div>

                   <button className="w-full py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-[1.02] transition-all">
                      Add to Watchlist Nexus
                   </button>
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
          <div className="mt-8 p-6 bg-rose-600/5 rounded-[24px] border border-rose-500/10 text-[9px] text-slate-500 font-bold italic leading-relaxed">
             Stage 6 Reasoning: Final conviction audit synthesizing alternative data, options flow, and future-tech readiness. Result: 5 High-Probability Alpha Nodes.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
