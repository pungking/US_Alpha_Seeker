
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
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.3.0: Quant Logic Optimized.']);
  
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
        addLog(`Vault Synced: ${content.ict_universe?.length} assets active.`, "ok");
      }
    } catch (e: any) { addLog(`Vault Sync Error: ${e.message}`, "err"); }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    addLog(`Initiating Alpha Synthesis via ${selectedBrain}...`, "info");
    
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
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
      addLog(`Synthesis Complete: ${mergedFinal.length} candidates identified.`, "ok");
    } catch (e: any) { addLog(`Failed: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const executeBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading || !stock) return;
    setBacktestLoading(true);
    addLog(`Quantum Backtest Engine: Simulating ${stock.symbol}...`, "info");
    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      if (data && data.equityCurve) {
        // 숫자 형변환 보장 (데이터 타입 이슈 해결)
        const sanitizedCurve = data.equityCurve.map((point: any) => ({
          ...point,
          value: Number(point.value)
        }));
        setBacktestData(prev => ({ ...prev, [stock.symbol]: { ...data, equityCurve: sanitizedCurve } }));
        addLog(`Simulation OK: ${stock.symbol} Meta-Analysis Stable.`, "ok");
      }
    } catch (e: any) { addLog(`Backtest Error: ${e.message}`, "err"); }
    finally { setBacktestLoading(false); }
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        {/* 상단 엔진 제어 패널 */}
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v8.3.0</h2>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Hedge-Fund Grade Intelligence Nexus</p>
              </div>
            </div>
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
              {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                <button key={p} onClick={() => setSelectedBrain(p)} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase transition-all flex items-center gap-2 ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                  {p === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                </button>
              ))}
            </div>
            <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500' : 'bg-rose-600 text-white hover:scale-105 active:scale-95'}`}>
              {loading ? 'Processing...' : 'Execute Alpha Engine'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {currentResults.length > 0 ? currentResults.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-6 rounded-[32px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-[280px] ${selectedStock?.symbol === item.symbol ? 'border-rose-500/50 bg-rose-500/10 scale-[1.02] shadow-[0_0_30px_rgba(244,63,94,0.15)]' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-start">
                     <span className="text-[9px] font-black text-slate-500 tracking-[0.2em] uppercase italic">Priority #{idx + 1}</span>
                     <span className="text-2xl font-black text-rose-500 italic tracking-tighter">{item.convictionScore?.toFixed(1)}%</span>
                  </div>
                  <div className="text-center py-2">
                     <h4 className="text-5xl font-black text-white italic uppercase tracking-tighter leading-none">{item.symbol}</h4>
                     <p className="text-[8px] font-bold text-slate-500 uppercase mt-1 tracking-widest">{item.sectorTheme}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/5 bg-black/20 rounded-xl px-2">
                    <div className="text-center">
                      <p className="text-[6px] font-black text-emerald-500 uppercase mb-0.5">Entry S/R</p>
                      <p className="text-[10px] font-mono font-black text-white">${item.supportLevel?.toFixed(2)}</p>
                    </div>
                    <div className="text-center border-x border-white/5">
                      <p className="text-[6px] font-black text-blue-500 uppercase mb-0.5">Target</p>
                      <p className="text-[10px] font-mono font-black text-white">${item.resistanceLevel?.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[6px] font-black text-rose-500 uppercase mb-0.5">Stop</p>
                      <p className="text-[10px] font-mono font-black text-white">${item.stopLoss?.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-end pt-4">
                     <div className="flex items-baseline gap-1">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">Return</span>
                        <span className="text-sm font-black text-blue-400">{item.expectedReturn}</span>
                     </div>
                     <span className="text-sm font-mono font-black text-white">${item.price?.toFixed(2)}</span>
                  </div>
               </div>
             )) : (
               <div className="col-span-full flex flex-col items-center justify-center py-20 opacity-20 space-y-4">
                  <div className="w-16 h-16 border-2 border-dashed border-slate-600 rounded-full animate-pulse"></div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Awaiting Signal...</p>
               </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[48px] bg-slate-950/90 border-t-2 border-t-rose-500 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
             <div className="space-y-10">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
                   <div className="flex items-center gap-8">
                      <h3 className="text-7xl font-black text-white italic uppercase tracking-tighter">{selectedStock.symbol}</h3>
                      <div className="flex flex-col">
                        <span className="px-5 py-2 bg-rose-600 text-white text-[11px] font-black rounded-full uppercase italic tracking-widest mb-1 shadow-lg shadow-rose-900/30">{selectedStock.aiVerdict}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{selectedStock.name}</span>
                      </div>
                   </div>
                   <div className="flex gap-6 ml-auto">
                      <div className="bg-white/5 px-10 py-5 rounded-[28px] border border-white/10 text-center min-w-[160px]">
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence</p>
                         <p className="text-3xl font-black text-emerald-400 italic tracking-tighter">{selectedStock.convictionScore?.toFixed(1)}%</p>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-12">
                   <div className="lg:col-span-3 space-y-8">
                      <div className="bg-black/60 rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-inner relative">
                         <iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none opacity-80" />
                      </div>
                      <div className="p-10 bg-white/5 rounded-[40px] border border-white/5">
                         <h4 className="text-[11px] font-black text-rose-500 uppercase tracking-widest mb-8 italic underline underline-offset-8">Investment Perspective</h4>
                         <div className="prose-report text-sm text-slate-300 leading-relaxed italic">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown>
                         </div>
                      </div>
                   </div>
                   <div className="lg:col-span-2 space-y-10">
                      <div className="p-8 bg-black/20 rounded-[40px] border border-white/5">
                         <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-8 italic">Conviction Dimensions</h4>
                         <ul className="space-y-6">
                            {selectedStock.selectionReasons?.map((r, i) => (
                              <li key={i} className="flex items-start space-x-4">
                                 <div className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_12px_rgba(244,63,94,0.6)]"></div>
                                 <p className="text-[12px] font-bold text-slate-300 leading-snug uppercase tracking-tight">{r}</p>
                              </li>
                            ))}
                         </ul>
                      </div>
                      <div className="p-8 bg-black/60 rounded-[40px] border border-white/5 border-l-4 border-l-rose-500 shadow-xl">
                         <h4 className="text-[10px] font-black text-slate-600 uppercase mb-4 tracking-widest italic">Neural Analysis Logic</h4>
                         <p className="text-xs text-slate-400 leading-relaxed italic uppercase font-mono tracking-tighter">{selectedStock.analysisLogic}</p>
                      </div>
                   </div>
                </div>

                <div className="pt-10 border-t border-white/5">
                   <div className="flex justify-between items-center mb-10">
                      <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em] italic">Quant_Backtest_Protocol</h4>
                      <button onClick={() => executeBacktest(selectedStock)} disabled={backtestLoading} className={`px-12 py-5 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${backtestLoading ? 'bg-slate-800 border-white/10 text-slate-500' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 shadow-2xl shadow-emerald-600/20'}`}>
                        {backtestLoading ? 'Running Simulation...' : 'Execute AI Backtest'}
                      </button>
                   </div>
                   {currentBacktest && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 animate-in zoom-in-95 duration-500">
                        <div className="space-y-4">
                           {[
                             { l: '승률 (Win Rate)', d: '포지션 수익 종료 빈도', v: currentBacktest.metrics.winRate, c: 'text-emerald-400' },
                             { l: '손익비 (Profit Factor)', d: '위험 대비 총 수익 배수', v: currentBacktest.metrics.profitFactor, c: 'text-blue-400' },
                             { l: '최대 낙폭 (MDD)', d: '고점 대비 최대 하락 비율', v: currentBacktest.metrics.maxDrawdown, c: 'text-rose-400' },
                             { l: '샤프 지수 (Sharpe)', d: '리스크 조정 수익 효율성', v: currentBacktest.metrics.sharpeRatio, c: 'text-amber-400' }
                           ].map((m, i) => (
                             <div key={i} className="p-6 bg-white/5 rounded-[28px] border border-white/10 flex flex-col transition-all hover:bg-white/10">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{m.l}</span>
                                  <span className={`text-2xl font-black ${m.c} italic tracking-tighter`}>{m.v}</span>
                                </div>
                                <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">{m.d}</p>
                             </div>
                           ))}
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-8">
                           {/* 차트 영역 컨테이너 고도화 */}
                           <div className="min-h-[300px] md:min-h-[350px] w-full bg-black/40 rounded-[40px] border border-white/5 p-8 relative flex items-center justify-center">
                              {currentBacktest.equityCurve && currentBacktest.equityCurve.length > 0 ? (
                                <div className="w-full h-full absolute inset-0 p-8">
                                  <ResponsiveContainer width="100%" height="100%">
                                     <AreaChart data={currentBacktest.equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                           <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                           </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                                        <XAxis dataKey="period" stroke="#475569" fontSize={9} tickLine={false} axisLine={false} dy={10} />
                                        <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} dx={-5} />
                                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '16px', fontSize: '11px', color: '#fff' }} />
                                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorVal)" isAnimationActive={true} />
                                     </AreaChart>
                                  </ResponsiveContainer>
                                </div>
                              ) : (
                                <div className="text-slate-600 font-mono text-xs animate-pulse uppercase tracking-[0.4em]">Rendering Equity Data...</div>
                              )}
                           </div>
                           <div className="p-10 bg-emerald-500/5 rounded-[40px] border border-emerald-500/10">
                              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 italic">Simulation Summary</p>
                              <p className="text-sm text-slate-400 leading-relaxed font-medium italic uppercase tracking-tight">{currentBacktest.historicalContext}</p>
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
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Alpha_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-rose-900'}`}>
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
