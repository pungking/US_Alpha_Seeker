
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  simulationPeriod?: string;
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
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v9.3.0: Simulation Core Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const cached = resultsCache[selectedBrain];
    if (cached && cached.length > 0) {
      const exists = selectedStock && cached.find(c => c.symbol === selectedStock.symbol);
      if (!exists) setSelectedStock(cached[0]);
    }
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
        addLog(`Vault Access: Stage 5 leaders synchronized.`, "ok");
      }
    } catch (e: any) { addLog(`Vault Sync Error: ${e.message}`, "err"); }
  };

  const handleExecuteEngine = async () => {
    if (loading) return;
    addLog(`[SIGNAL] Initializing Alpha Sieve Engine...`, "info");
    setLoading(true);

    try {
      let currentUniverse = elite50;
      if (currentUniverse.length === 0) {
        const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (listRes.files?.length) {
          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
          currentUniverse = content.ict_universe || [];
          setElite50(currentUniverse);
        }
      }

      const topCandidates = [...currentUniverse].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
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
      addLog(`Alpha Protocol: ${mergedFinal.length} assets mapped for deep analysis.`, "ok");
    } catch (e: any) { addLog(`Engine Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const handleRunBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading || !stock) return;
    addLog(`[SIGNAL] Quant Backtest initiated for ${stock.symbol}.`, "info");
    setBacktestLoading(true);

    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      if (!data || !Array.isArray(data.equityCurve)) throw new Error("Incomplete simulation stream.");

      // [CRITICAL CRASH GUARD] 데이터 정제 및 기본값 보장
      // 1. Equity Curve 정제
      const curve = data.equityCurve.map((point: any, idx: number) => {
        let val = (point || {}).value;
        if (typeof val !== 'number') {
          // 숫자가 아닌 문자(%, $, 등) 제거 후 파싱
          val = parseFloat(String(val || '0').replace(/[^-0-9.]/g, ''));
        }
        // NaN/Infinity는 무조건 0으로 치환하여 차트 엔진 폭발 방지
        if (!Number.isFinite(val) || Number.isNaN(val)) val = 0;
        
        return {
          period: String((point || {}).period || `M${idx + 1}`),
          value: Number(val.toFixed(2))
        };
      });

      // 2. Metrics 객체가 없을 경우를 대비한 기본값 주입
      const safeMetrics = data.metrics || {
        winRate: "N/A",
        profitFactor: "N/A",
        maxDrawdown: "N/A",
        sharpeRatio: "N/A"
      };

      // 3. Context 기본값
      const safeContext = data.historicalContext || "Analysis data unavailable.";
      const safePeriod = data.simulationPeriod || "Last 24 Months";

      setBacktestData(prev => ({ 
        ...prev, 
        [stock.symbol]: { 
          simulationPeriod: safePeriod,
          equityCurve: curve,
          metrics: safeMetrics,
          historicalContext: safeContext
        } 
      }));
      addLog(`Backtest Confirmed: Simulation for [${safePeriod}] complete.`, "ok");
    } catch (e: any) { 
      addLog(`Quant Error: ${e.message}`, "err");
      // 에러 발생 시 해당 종목 데이터 초기화하여 꼬임 방지
      setBacktestData(prev => ({ ...prev, [stock.symbol]: undefined as any }));
    }
    finally { setBacktestLoading(false); }
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  // 차트 데이터가 완벽히 깨끗한지(NaN이 없는지) 최종 확인하는 가드
  const isChartReady = useMemo(() => {
    return !!currentBacktest?.equityCurve && 
           currentBacktest.equityCurve.length > 1 && 
           currentBacktest.equityCurve.every(p => Number.isFinite(p.value));
  }, [currentBacktest]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-5 h-5 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v9.3.0</h2>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Neural Optimization Terminal</p>
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
              onClick={handleExecuteEngine} 
              disabled={loading} 
              className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-rose-600 text-white hover:brightness-110 active:scale-95 shadow-rose-900/20'}`}
            >
              {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
             {currentResults.length > 0 ? currentResults.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-6 rounded-[35px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col h-[240px] ${selectedStock?.symbol === item.symbol ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_40px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/30' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-center mb-1 pointer-events-none">
                     <div className="flex items-center gap-3">
                       <span className="text-[8px] font-black text-slate-600 uppercase">#{idx + 1}</span>
                       <h4 className="text-3xl font-black text-white italic uppercase tracking-tighter leading-none">{item.symbol}</h4>
                       <span className="text-[10px] font-black text-rose-500 italic mt-1">({item.convictionScore?.toFixed(1)}%)</span>
                     </div>
                     <span className="text-[10px] font-mono font-black text-white bg-white/10 px-3 py-1 rounded-lg border border-white/10 shadow-sm">${item.price?.toFixed(2)}</span>
                  </div>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate mb-4 border-b border-white/5 pb-2 pointer-events-none">{item.sectorTheme}</p>
                  
                  {/* [SCALED UI] 수치 폰트 크기 유지 (text-[13px]) */}
                  <div className="grid grid-cols-3 gap-2 py-4 bg-black/50 rounded-2xl px-1 border border-white/10 flex-grow pointer-events-none shadow-inner">
                    <div className="text-center flex flex-col justify-center">
                      <p className="text-[8px] font-black text-emerald-500 uppercase mb-1 tracking-tighter">Entry</p>
                      <p className="text-[13px] font-mono font-black text-white tracking-tighter leading-none">${item.supportLevel?.toFixed(1)}</p>
                    </div>
                    <div className="text-center border-x border-white/10 flex flex-col justify-center">
                      <p className="text-[8px] font-black text-blue-500 uppercase mb-1 tracking-tighter">Target</p>
                      <p className="text-[13px] font-mono font-black text-white tracking-tighter leading-none">${item.resistanceLevel?.toFixed(1)}</p>
                    </div>
                    <div className="text-center flex flex-col justify-center">
                      <p className="text-[8px] font-black text-rose-500 uppercase mb-1 tracking-tighter">Stop</p>
                      <p className="text-[13px] font-mono font-black text-white tracking-tighter leading-none">${item.stopLoss?.toFixed(1)}</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-4 pointer-events-none">
                     <div className="flex items-center gap-2">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em]">ROI_EXP</span>
                        <span className="text-xs font-black text-blue-400 italic">{item.expectedReturn}</span>
                     </div>
                     <span className={`px-2.5 py-1 rounded-md text-[8px] font-black uppercase tracking-tighter ${item.aiVerdict === 'STRONG_BUY' ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'}`}>
                       {item.aiVerdict}
                     </span>
                  </div>
               </div>
             )) : (
               <div className="col-span-full flex flex-col items-center justify-center py-24 opacity-20 space-y-4">
                  <div className="w-12 h-12 border-2 border-dashed border-slate-600 rounded-full animate-pulse flex items-center justify-center">
                    <div className="w-4 h-4 bg-slate-600 rounded-full"></div>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">Awaiting Discovery Protocol...</p>
               </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[50px] bg-slate-950/90 border-t-2 border-t-rose-500 animate-in fade-in duration-700 shadow-3xl">
             <div className="space-y-10">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
                   <div className="flex items-center gap-8">
                      <h3 className="text-6xl font-black text-white italic uppercase tracking-tighter">{selectedStock.symbol}</h3>
                      <div className="flex flex-col">
                        <span className="px-5 py-1.5 bg-rose-600 text-white text-[10px] font-black rounded-full uppercase italic tracking-widest mb-1 shadow-lg border border-white/10">{selectedStock.aiVerdict}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{selectedStock.name}</span>
                      </div>
                   </div>
                   <div className="ml-auto bg-black/40 px-8 py-4 rounded-[28px] border border-white/10 text-center min-w-[150px] shadow-inner">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">AI Confidence</p>
                      <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore?.toFixed(1)}%</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                   <div className="lg:col-span-3 space-y-8">
                      <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative">
                         <iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none opacity-90" />
                      </div>
                      <div className="p-10 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                         <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6 italic underline underline-offset-[12px]">Neural Investment Strategy</h4>
                         <div className="prose-report text-sm text-slate-300 leading-relaxed italic">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown>
                         </div>
                      </div>
                   </div>
                   <div className="lg:col-span-2 space-y-8">
                      <div className="p-8 bg-black/30 rounded-[40px] border border-white/5">
                         <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6 italic">Alpha Rationale</h4>
                         <ul className="space-y-4">
                            {selectedStock.selectionReasons?.map((r, i) => (
                              <li key={i} className="flex items-start space-x-4">
                                 <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                                 <p className="text-xs font-bold text-slate-200 leading-relaxed uppercase tracking-tight">{r}</p>
                              </li>
                            ))}
                         </ul>
                      </div>
                      <div className="p-8 bg-black/60 rounded-[40px] border border-white/10 border-l-8 border-l-rose-600 shadow-2xl">
                         <h4 className="text-[9px] font-black text-slate-600 uppercase mb-3 tracking-[0.3em] italic">Engine Core Logic</h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-mono italic uppercase tracking-tighter">{selectedStock.analysisLogic}</p>
                      </div>
                   </div>
                </div>

                <div className="pt-10 border-t border-white/10">
                   <div className="flex justify-between items-center mb-8">
                      <div>
                        <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.5em] italic mb-1">Quant_Backtest_Protocol</h4>
                        {/* [FEATURE] 백테스팅 기간 명시적 표시 */}
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                           Simulation Period: <span className="text-emerald-400">{currentBacktest?.simulationPeriod || "Ready to Calculate"}</span>
                        </p>
                      </div>
                      <button 
                        onClick={() => handleRunBacktest(selectedStock)} 
                        disabled={backtestLoading} 
                        className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-2xl ${backtestLoading ? 'bg-slate-800 text-slate-500 border-white/5 cursor-not-allowed' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white active:scale-95'}`}
                      >
                        {backtestLoading ? 'Simulation_Active...' : 'Run Portfolio Simulation'}
                      </button>
                   </div>
                   
                   {currentBacktest && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 animate-in slide-in-from-bottom-6 duration-700">
                        <div className="space-y-4">
                           {/* [FIXED] Metrics Access Safe Guard - undefined 체크 강화 */}
                           {[
                             { l: 'WIN RATE', v: currentBacktest.metrics?.winRate || 'N/A', c: 'text-emerald-400' },
                             { l: 'PROFIT FACTOR', v: currentBacktest.metrics?.profitFactor || 'N/A', c: 'text-blue-400' },
                             { l: 'MAX DRAWDOWN', v: currentBacktest.metrics?.maxDrawdown || 'N/A', c: 'text-rose-400' },
                             { l: 'SHARPE RATIO', v: currentBacktest.metrics?.sharpeRatio || 'N/A', c: 'text-amber-400' }
                           ].map((m, i) => (
                             <div key={i} className="p-5 bg-black/40 rounded-[24px] border border-white/5 flex justify-between items-center shadow-inner group hover:border-white/20 transition-all">
                                <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{m.l}</span>
                                <span className={`text-xl font-black ${m.c} italic`}>{m.v}</span>
                             </div>
                           ))}
                        </div>
                        <div className="lg:col-span-2 flex flex-col gap-8">
                           {/* [FIXED] 차트 블랙스크린 100% 방지 가드: 키(key)에 랜덤값 부여하여 강제 리마운트 */}
                           <div className="w-full bg-black/80 rounded-[40px] border border-white/10 p-8 relative overflow-hidden shadow-3xl min-h-[400px]">
                              {isChartReady ? (
                                <ResponsiveContainer width="100%" height={400}>
                                   <AreaChart 
                                     key={`backtest-${selectedStock.symbol}-${Math.random()}`}
                                     data={currentBacktest.equityCurve} 
                                     margin={{ top: 20, right: 20, left: -10, bottom: 0 }}
                                   >
                                      <defs>
                                         <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.6}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                         </linearGradient>
                                      </defs>
                                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff03" vertical={false} />
                                      <XAxis dataKey="period" stroke="#334155" fontSize={9} tickLine={false} axisLine={false} dy={15} />
                                      <YAxis stroke="#334155" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v || 0)}%`} domain={['auto', 'auto']} />
                                      <Tooltip 
                                        contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '16px', fontSize: '11px', color: '#fff', fontWeight: '900', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                                        formatter={(val: any) => [`${Number(val || 0).toFixed(2)}%`, 'Cumulative Return']}
                                      />
                                      <Area 
                                        type="monotone" 
                                        dataKey="value" 
                                        stroke="#10b981" 
                                        strokeWidth={4} 
                                        fillOpacity={1} 
                                        fill="url(#colorVal)" 
                                        isAnimationActive={false} 
                                      />
                                   </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-800 space-y-6 py-20">
                                  <div className="w-12 h-12 border-4 border-slate-700 rounded-full border-t-emerald-500 animate-spin"></div>
                                  <div className="text-center">
                                    <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-slate-500 animate-pulse">Quant_Stream Integrity Verification...</p>
                                    <p className="text-[8px] text-slate-700 mt-2 uppercase tracking-widest">Compiling Neural Data Points</p>
                                  </div>
                                </div>
                              )}
                           </div>
                           <div className="p-10 bg-emerald-500/5 rounded-[40px] border border-emerald-500/10 shadow-inner">
                              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-3 italic">Simulation Intelligence Insight</p>
                              <p className="text-sm text-slate-400 leading-relaxed font-medium italic uppercase tracking-tight">{currentBacktest.historicalContext || "Insight generating..."}</p>
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
        <div className="glass-panel h-[720px] rounded-[50px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-8 shadow-3xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[11px] uppercase tracking-[0.5em] italic">Alpha_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[35px] font-mono text-[10px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed shadow-inner">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : 'border-rose-900'}`}>
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
