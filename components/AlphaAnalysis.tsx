
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
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.2.8: Engine Stable.']);
  
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
        addLog(`Vault Synced: ${content.ict_universe?.length} leaders ready.`, "ok");
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    addLog(`Initiating Synthesis via ${selectedBrain}...`, "info");
    
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      const mergedFinal = (aiResults || []).map(aiData => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        return item ? { ...item, ...aiData } : null;
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`Synthesis Complete: ${mergedFinal.length} alphas identified.`, "ok");
    } catch (e: any) { addLog(`Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const executeBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading || !stock) return;
    setBacktestLoading(true);
    addLog(`Running Deep Simulation for ${stock.symbol}...`, "info");
    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      if (data) {
        setBacktestData(prev => ({ ...prev, [stock.symbol]: data }));
        addLog(`Simulation OK: ${stock.symbol} WinRate ${data.metrics.winRate}`, "ok");
      }
    } catch (e: any) { addLog(`Backtest Error: ${e.message}`, "err"); }
    finally { setBacktestLoading(false); }
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
      <div className="xl:col-span-3 space-y-4">
        {/* 엔진 제어 - 패딩 축소로 가시성 확보 */}
        <div className={`glass-panel p-6 md:p-8 rounded-[32px] border-t-2 shadow-xl bg-slate-900/40 transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-5 h-5 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v8.2.8</h2>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Compact Visualization Engine Active</p>
              </div>
            </div>
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                <button key={p} onClick={() => setSelectedBrain(p)} className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-2 ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {p === ApiProvider.GEMINI ? 'Gemini 3' : 'Sonar Pro'}
                </button>
              ))}
            </div>
            <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className={`px-8 py-3.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white hover:scale-105 active:scale-95'}`}>
              {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
            </button>
          </div>

          {/* 종목 카드 그리드 - 높이 최적화 및 정보 복원 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {currentResults.length > 0 ? currentResults.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-5 rounded-[28px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-[230px] ${selectedStock?.symbol === item.symbol ? 'border-rose-500/50 bg-rose-500/10 scale-[1.01] shadow-2xl' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-start">
                     <span className="text-[8px] font-black text-slate-500 uppercase italic">PRIORITY #{idx + 1}</span>
                     <span className="text-xl font-black text-rose-500 italic tracking-tighter">{item.convictionScore?.toFixed(1)}%</span>
                  </div>
                  <div className="text-center">
                     <h4 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none">{item.symbol}</h4>
                  </div>
                  
                  {/* 카드 내부 전략 수치 복원 */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                     <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 text-center">
                        <p className="text-[6px] font-black text-slate-600 uppercase">ENTRY S/R</p>
                        <p className="text-[10px] font-mono font-bold text-emerald-400">${item.supportLevel?.toFixed(2)}</p>
                     </div>
                     <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 text-center">
                        <p className="text-[6px] font-black text-slate-600 uppercase">STOP LOSS</p>
                        <p className="text-[10px] font-mono font-bold text-rose-400">${item.stopLoss?.toFixed(2)}</p>
                     </div>
                  </div>

                  <div className="flex justify-between items-end border-t border-white/5 pt-3">
                     <div className="flex items-baseline gap-1">
                        <span className="text-[6px] font-black text-slate-600 uppercase">EXP RET</span>
                        <span className="text-[10px] font-black text-blue-400">{item.expectedReturn}</span>
                     </div>
                     <span className="text-[10px] font-mono font-black text-white">${item.price?.toFixed(2)}</span>
                  </div>
               </div>
             )) : (
               <div className="col-span-full flex flex-col items-center justify-center py-16 opacity-20 space-y-3">
                  <div className="w-12 h-12 border border-dashed border-slate-600 rounded-full animate-pulse"></div>
                  <p className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-400 text-center">Engine Initialized. Awaiting Protocol Execution.</p>
               </div>
             )}
          </div>
        </div>

        {/* 종목 상세 - PCAR 스타일 UI 고도화 */}
        {selectedStock && (
          <div className="glass-panel p-6 md:p-10 rounded-[40px] bg-slate-950/90 border-t-2 border-t-rose-500 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="space-y-8">
                {/* 헤더 섹션 */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                   <div className="flex items-center gap-5">
                      <h3 className="text-6xl font-black text-white italic uppercase tracking-tighter">{selectedStock.symbol}</h3>
                      <div className="flex flex-col">
                        <span className="px-3 py-1 bg-rose-600 text-white text-[9px] font-black rounded-full uppercase italic tracking-widest mb-1 shadow-lg">{selectedStock.aiVerdict}</span>
                        <span className="text-[10px] font-bold text-slate-500 uppercase">{selectedStock.name}</span>
                      </div>
                   </div>
                   <div className="flex gap-3 ml-auto">
                      <div className="bg-white/5 px-6 py-3 rounded-[20px] border border-white/10 text-center">
                         <p className="text-[7px] font-black text-slate-500 uppercase mb-1">Confidence</p>
                         <p className="text-xl font-black text-emerald-400 italic tracking-tighter">{selectedStock.convictionScore?.toFixed(1)}%</p>
                      </div>
                      <div className="bg-white/5 px-6 py-3 rounded-[20px] border border-white/10 text-center">
                         <p className="text-[7px] font-black text-slate-500 uppercase mb-1">Exp. Return</p>
                         <p className="text-xl font-black text-blue-400 italic tracking-tighter">{selectedStock.expectedReturn}</p>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                   <div className="lg:col-span-3 space-y-6">
                      <div className="bg-black/60 rounded-[24px] border border-white/5 aspect-video overflow-hidden shadow-inner relative group">
                         <iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none opacity-80" />
                      </div>
                      
                      <div className="p-8 bg-white/5 rounded-[32px] border border-white/5">
                         <h4 className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-6 italic underline underline-offset-8">Investment Perspective</h4>
                         <div className="prose-report text-xs text-slate-300 leading-relaxed italic">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown>
                         </div>
                      </div>
                   </div>

                   <div className="lg:col-span-2 space-y-6">
                      <div className="p-6 bg-black/20 rounded-[32px] border border-white/5">
                         <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6 italic">Conviction Dimensions</h4>
                         <ul className="space-y-4">
                            {selectedStock.selectionReasons?.map((r, i) => (
                              <li key={i} className="flex items-start space-x-3">
                                 <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0"></div>
                                 <p className="text-[10px] font-bold text-slate-300 leading-tight uppercase tracking-tight">{r}</p>
                              </li>
                            ))}
                         </ul>
                      </div>

                      <div className="p-6 bg-rose-500/5 rounded-[32px] border border-rose-500/10">
                         <h4 className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-6 italic">AI Sentiment Index</h4>
                         <div className="flex items-center gap-4 mb-4">
                            <div className="h-2 flex-1 bg-slate-900 rounded-full overflow-hidden">
                               <div className="h-full bg-gradient-to-r from-rose-700 to-rose-400" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div>
                            </div>
                            <span className="text-lg font-black text-white italic">{selectedStock.convictionScore?.toFixed(1)}%</span>
                         </div>
                         <p className="text-[9px] text-slate-500 italic uppercase font-medium">{selectedStock.aiSentiment}</p>
                      </div>

                      <div className="p-6 bg-black/60 rounded-[32px] border border-white/5 border-l-4 border-l-rose-500">
                         <h4 className="text-[8px] font-black text-slate-600 uppercase mb-3 tracking-widest">Neural Analysis Logic</h4>
                         <p className="text-[9px] text-slate-400 leading-relaxed italic uppercase font-mono">{selectedStock.analysisLogic}</p>
                      </div>
                   </div>
                </div>

                {/* 하단 백테스트 시뮬레이션 */}
                <div className="pt-8 border-t border-white/5">
                   <div className="flex justify-between items-center mb-8">
                      <h4 className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.4em] italic">Quant_Backtest_Core</h4>
                      <button onClick={() => executeBacktest(selectedStock)} disabled={backtestLoading} className={`px-8 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${backtestLoading ? 'bg-slate-800 text-slate-500' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600'}`}>
                        {backtestLoading ? 'Running...' : 'Execute AI Backtest'}
                      </button>
                   </div>
                   {currentBacktest && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in zoom-in-95 duration-500">
                        <div className="space-y-3">
                           {[
                             { l: 'Win Rate', v: currentBacktest.metrics.winRate, c: 'text-emerald-400' },
                             { l: 'Profit Factor', v: currentBacktest.metrics.profitFactor, c: 'text-blue-400' },
                             { l: 'Max Drawdown', v: currentBacktest.metrics.maxDrawdown, c: 'text-rose-400' },
                             { l: 'Sharpe Ratio', v: currentBacktest.metrics.sharpeRatio, c: 'text-amber-400' }
                           ].map((m, i) => (
                             <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex justify-between items-center">
                                <span className="text-[8px] font-black text-slate-500 uppercase">{m.l}</span>
                                <span className={`text-lg font-black ${m.c} italic`}>{m.v}</span>
                             </div>
                           ))}
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-4">
                           <div className="h-56 w-full bg-black/40 rounded-[24px] border border-white/5 p-6">
                              <ResponsiveContainer width="100%" height="100%">
                                 <AreaChart data={currentBacktest.equityCurve}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
                                    <XAxis dataKey="period" stroke="#475569" fontSize={8} />
                                    <YAxis stroke="#475569" fontSize={8} tickFormatter={(v) => `${v}%`} />
                                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                                    <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={0.1} fill="#10b981" />
                                 </AreaChart>
                              </ResponsiveContainer>
                           </div>
                           <div className="p-6 bg-emerald-500/5 rounded-[24px] border border-emerald-500/10">
                              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-2 italic">Simulation Summary</p>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic uppercase">
                                 {currentBacktest.historicalContext}
                              </p>
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
        <div className="glass-panel h-[720px] rounded-[32px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-4 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-6 px-2">
            <h3 className="font-black text-white text-[9px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3>
            <div className={`w-1.5 h-1.5 rounded-full ${loading || backtestLoading ? 'bg-rose-500 animate-pulse' : 'bg-slate-700'}`}></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-4 rounded-[24px] font-mono text-[8px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5 leading-tight">
            {logs.map((l, i) => (
              <div key={i} className={`pl-3 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-rose-900'}`}>
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
