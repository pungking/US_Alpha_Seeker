
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApiProvider } from '../types';
import { API_CONFIGS } from '../constants';
import { generateAlphaSynthesis, runAiBacktest } from '../services/intelligenceService';

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
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
  chartPattern?: string;
  supportLevel?: number;
  resistanceLevel?: number;
  riskRewardRatio?: string;
}

interface BacktestResult {
  equityCurve: { period: string; value: number }[];
  metrics: { winRate: string; profitFactor: string; maxDrawdown: string; sharpeRatio: string; };
  historicalContext: string;
}

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (brain: ApiProvider) => void;
  onFinalSymbolsDetected?: (symbols: string[], fullData?: any[]) => void;
}

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.5.0: Runtime Stability & Chart Guard Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const cached = resultsCache[selectedBrain];
    setSelectedStock(cached && cached.length > 0 ? cached[0] : null);
  }, [selectedBrain, resultsCache]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) loadStage5Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const loadStage5Data = async () => {
    if (!accessToken) return;
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());
      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        setElite50(content.ict_universe || []);
        addLog(`Vault Synced: Universe integrity verified.`, "ok");
      }
    } catch (e: any) { addLog(`Vault Sync Error: ${e.message}`, "err"); }
  };

  const executeAlphaFinalization = async () => {
    if (loading) return;
    addLog(`[SIGNAL] Alpha Finalization Request Initiated.`, "info");
    
    setLoading(true);
    try {
      if (elite50.length === 0) {
        await loadStage5Data();
      }
      
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      if (topCandidates.length === 0) throw new Error("No candidates found in Stage 5.");

      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      const mergedFinal = (aiResults || []).map(aiData => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        if (!item) return null;
        return { 
          ...item, ...aiData,
          supportLevel: Number(aiData.supportLevel) || item.price * 0.98,
          resistanceLevel: Number(aiData.resistanceLevel) || item.price * 1.25,
          stopLoss: Number(aiData.stopLoss) || item.price * 0.92
        };
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`Alpha Discovery: Strategic Matrix Finalized.`, "ok");
    } catch (e: any) { 
      addLog(`Discovery Node Failure: ${e.message}`, "err"); 
    } finally { 
      setLoading(false); 
    }
  };

  const executeBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading || !stock) return;
    
    // 버튼 클릭 즉시 시각적 피드백
    addLog(`[SIGNAL] Quant Backtest Protocol for ${stock.symbol} engaged.`, "info");
    setBacktestLoading(true);

    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      
      if (!data || !Array.isArray(data.equityCurve)) {
        throw new Error("Invalid response format from AI node.");
      }

      // [CRITICAL FIX] 데이터 가공 시 NaN 방지 가드 강화
      const sanitizedCurve = data.equityCurve.map((point: any, idx: number) => {
        let rawVal = point.value;
        if (typeof rawVal !== 'number') {
          const parsed = parseFloat(String(rawVal).replace(/[^-0-9.]/g, ''));
          rawVal = isNaN(parsed) ? 0 : parsed;
        }
        return {
          period: point.period || `P${String(idx + 1).padStart(2, '0')}`,
          value: rawVal
        };
      });

      setBacktestData(prev => ({ 
        ...prev, 
        [stock.symbol]: { ...data, equityCurve: sanitizedCurve } 
      }));
      addLog(`Backtest Successful: ${sanitizedCurve.length} data points mapped.`, "ok");
    } catch (e: any) { 
      addLog(`Backtest Node Failure: ${e.message}`, "err"); 
    } finally { 
      setBacktestLoading(false); 
    }
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-5 h-5 pointer-events-none ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div className="pointer-events-none">
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v8.5.0</h2>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Neural Optimization Engine</p>
              </div>
            </div>
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                <button key={p} onClick={() => setSelectedBrain(p)} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-2 ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {p === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                </button>
              ))}
            </div>
            <button 
              onClick={(e) => { e.preventDefault(); executeAlphaFinalization(); }} 
              disabled={loading} 
              className={`px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-rose-600 text-white hover:brightness-125 active:scale-95'}`}
            >
              <span className="pointer-events-none">{loading ? 'Synthesizing...' : 'Execute Alpha Engine'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {currentResults.length > 0 ? currentResults.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-5 rounded-[24px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col h-[190px] ${selectedStock?.symbol === item.symbol ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_20px_rgba(244,63,94,0.1)]' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-center mb-1 pointer-events-none">
                     <div className="flex items-center gap-3">
                       <span className="text-[7px] font-black text-slate-600 uppercase">#{idx + 1}</span>
                       <h4 className="text-2xl font-black text-white italic uppercase tracking-tighter">{item.symbol}</h4>
                       <span className="text-sm font-black text-rose-500 italic">({item.convictionScore?.toFixed(1)}%)</span>
                     </div>
                     <span className="text-[9px] font-mono font-black text-white bg-white/5 px-2 py-1 rounded-md shadow-sm">${item.price?.toFixed(2)}</span>
                  </div>
                  <p className="text-[7px] font-bold text-slate-500 uppercase tracking-widest truncate mb-4 border-b border-white/5 pb-2 pointer-events-none">{item.sectorTheme}</p>
                  <div className="grid grid-cols-3 gap-1 py-2 bg-black/20 rounded-lg px-2 border border-white/5 flex-grow pointer-events-none">
                    <div className="text-center">
                      <p className="text-[5px] font-black text-emerald-500 uppercase mb-0.5">Entry</p>
                      <p className="text-[8px] font-mono font-black text-white">${item.supportLevel?.toFixed(2)}</p>
                    </div>
                    <div className="text-center border-x border-white/5">
                      <p className="text-[5px] font-black text-blue-500 uppercase mb-0.5">Target</p>
                      <p className="text-[8px] font-mono font-black text-white">${item.resistanceLevel?.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[5px] font-black text-rose-500 uppercase mb-0.5">Stop</p>
                      <p className="text-[8px] font-mono font-black text-white">${item.stopLoss?.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-end mt-2 pointer-events-none">
                     <div className="flex items-center gap-2">
                        <span className="text-[6px] font-black text-slate-600 uppercase">Exp. Return</span>
                        <span className="text-[10px] font-black text-blue-400">{item.expectedReturn}</span>
                     </div>
                     <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter ${item.aiVerdict === 'STRONG_BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                       {item.aiVerdict}
                     </span>
                  </div>
               </div>
             )) : (
               <div className="col-span-full flex flex-col items-center justify-center py-12 opacity-20 space-y-3">
                  <div className="w-10 h-10 border border-dashed border-slate-600 rounded-full animate-pulse"></div>
                  <p className="text-[7px] font-black uppercase tracking-[0.3em] text-slate-400">Awaiting Discovery Protocol...</p>
               </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-10 rounded-[40px] bg-slate-950/90 border-t-2 border-t-rose-500 animate-in fade-in duration-500 shadow-3xl">
             <div className="space-y-8">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                   <div className="flex items-center gap-6">
                      <h3 className="text-5xl font-black text-white italic uppercase tracking-tighter">{selectedStock.symbol}</h3>
                      <div className="flex flex-col">
                        <span className="px-4 py-1 bg-rose-600 text-white text-[8px] font-black rounded-full uppercase italic tracking-widest mb-1 shadow-lg">{selectedStock.aiVerdict}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{selectedStock.name}</span>
                      </div>
                   </div>
                   <div className="ml-auto bg-white/5 px-6 py-3 rounded-[20px] border border-white/10 text-center min-w-[120px]">
                      <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence</p>
                      <p className="text-xl font-black text-emerald-400 italic">{selectedStock.convictionScore?.toFixed(1)}%</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                   <div className="lg:col-span-3 space-y-6">
                      <div className="bg-black/60 rounded-[32px] border border-white/5 aspect-video overflow-hidden shadow-inner relative">
                         <iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none opacity-80" />
                      </div>
                      <div className="p-8 bg-white/5 rounded-[32px] border border-white/5">
                         <h4 className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-4 italic underline underline-offset-8">Strategy Outlook</h4>
                         <div className="prose-report text-xs text-slate-300 leading-relaxed italic">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown>
                         </div>
                      </div>
                   </div>
                   <div className="lg:col-span-2 space-y-6">
                      <div className="p-6 bg-black/20 rounded-[32px] border border-white/5">
                         <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4 italic">Selection Rationale</h4>
                         <ul className="space-y-3">
                            {selectedStock.selectionReasons?.map((r, i) => (
                              <li key={i} className="flex items-start space-x-3">
                                 <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1 shrink-0"></div>
                                 <p className="text-[10px] font-bold text-slate-300 leading-snug uppercase tracking-tight">{r}</p>
                              </li>
                            ))}
                         </ul>
                      </div>
                      <div className="p-6 bg-black/60 rounded-[32px] border border-white/5 border-l-4 border-l-rose-500 shadow-xl">
                         <h4 className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest italic">Core Analysis Logic</h4>
                         <p className="text-[9px] text-slate-400 leading-relaxed font-mono italic uppercase tracking-tighter">{selectedStock.analysisLogic}</p>
                      </div>
                   </div>
                </div>

                <div className="pt-8 border-t border-white/5">
                   <div className="flex justify-between items-center mb-6">
                      <h4 className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.4em] italic">Quant_Backtest_Protocol</h4>
                      <button 
                        onClick={(e) => { e.preventDefault(); executeBacktest(selectedStock); }} 
                        disabled={backtestLoading} 
                        className={`px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${backtestLoading ? 'bg-slate-800 text-slate-500 border-white/5 cursor-not-allowed' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:brightness-125 shadow-xl active:scale-95'}`}
                      >
                        <span className="pointer-events-none">{backtestLoading ? 'Processing...' : 'Run Simulation'}</span>
                      </button>
                   </div>
                   {currentBacktest && currentBacktest.equityCurve && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in zoom-in-95 duration-500">
                        <div className="space-y-3">
                           {[
                             { l: '승률 (Win Rate)', v: currentBacktest.metrics.winRate, c: 'text-emerald-400' },
                             { l: '손익비 (PF)', v: currentBacktest.metrics.profitFactor, c: 'text-blue-400' },
                             { l: '최대 낙폭 (MDD)', v: currentBacktest.metrics.maxDrawdown, c: 'text-rose-400' },
                             { l: '샤프 지수 (Sharpe)', v: currentBacktest.metrics.sharpeRatio, c: 'text-amber-400' }
                           ].map((m, i) => (
                             <div key={i} className="p-4 bg-white/5 rounded-[16px] border border-white/10 flex justify-between items-center">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{m.l}</span>
                                <span className={`text-lg font-black ${m.c} italic`}>{m.v}</span>
                             </div>
                           ))}
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-6">
                           {/* [FIX] 차트 영역 높이 강제 및 데이터 검증 */}
                           <div className="w-full bg-black/40 rounded-[32px] border border-white/5 p-6 relative overflow-hidden" style={{ height: '320px' }}>
                              {currentBacktest.equityCurve.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                   <AreaChart data={currentBacktest.equityCurve} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                      <defs>
                                         <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                         </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                      <XAxis dataKey="period" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} dy={10} />
                                      <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v || 0)}%`} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff20', borderRadius: '12px', fontSize: '10px', color: '#fff', fontWeight: 'bold' }}
                                        formatter={(val: any) => [`${(Number(val) || 0).toFixed(2)}%`, 'Cumulative Return']}
                                      />
                                      <Area 
                                        type="monotone" 
                                        dataKey="value" 
                                        stroke="#10b981" 
                                        strokeWidth={3} 
                                        fillOpacity={1} 
                                        fill="url(#colorVal)" 
                                        isAnimationActive={false} 
                                      />
                                   </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-700 font-mono text-[8px] uppercase tracking-[0.4em]">Empty Dataset Detected</div>
                              )}
                           </div>
                           <div className="p-8 bg-emerald-500/5 rounded-[32px] border border-emerald-500/10">
                              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2 italic">Simulation Context</p>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic uppercase tracking-tight">{currentBacktest.historicalContext}</p>
                           </div>
                        </div>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[660px] rounded-[32px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-6 px-1">
            <h3 className="font-black text-white text-[9px] uppercase tracking-[0.3em] italic">Alpha_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-5 rounded-[24px] font-mono text-[8px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-3 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : 'border-rose-900'}`}>
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
