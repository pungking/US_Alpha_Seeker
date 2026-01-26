
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { ApiProvider } from '../types';
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from '../constants';
import { generateAlphaSynthesis, runAiBacktest } from '../services/intelligenceService';

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
  chartPattern?: string;
  supportLevel?: number;
  resistanceLevel?: number;
  riskRewardRatio?: string;
}

interface BacktestResult {
  equityCurve: { period: string; value: number }[];
  metrics: {
    winRate: string;
    profitFactor: string;
    maxDrawdown: string;
    sharpeRatio: string;
  };
  historicalContext: string;
}

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (brain: ApiProvider) => void;
  onFinalSymbolsDetected?: (symbols: string[]) => void;
}

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v8.2.6: Quant Backtest Engine Integrated.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
      }
    } catch (e: any) { addLog(`Load Error: ${e.message}`, "err"); }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    addLog(`Initiating Phase 6 Synthesis with ${selectedBrain}...`, "info");
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      const mergedFinal = (aiResults || []).map(aiData => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        if (!item) return null;
        return { ...item, ...aiData, entryPrice: aiData.supportLevel || item.price, targetPrice: aiData.resistanceLevel || item.price * 1.3, stopLoss: (aiData.supportLevel || item.price) * 0.9 };
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) setSelectedStock(mergedFinal[0]);
      addLog(`Strategy Synthesis Complete. ${mergedFinal.length} leaders identified.`, "ok");
    } catch (e: any) { addLog(`Synthesis Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const executeBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading) return;
    setBacktestLoading(true);
    addLog(`Quant Simulation: Starting Backtest for ${stock.symbol}...`, "info");
    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      if (data) {
        setBacktestData(prev => ({ ...prev, [stock.symbol]: data }));
        addLog(`Simulation Complete: ${stock.symbol} Win Rate: ${data.metrics.winRate}`, "ok");
      }
    } catch (e: any) { addLog(`Backtest Failed: ${e.message}`, "err"); }
    finally { setBacktestLoading(false); }
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-8 md:p-10 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative overflow-hidden transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Core v8.2.6</h2>
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Neural Quant & Backtest Integrated</p>
              </div>
            </div>
            <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
              {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                <button key={p} onClick={() => setSelectedBrain(p)} className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${selectedBrain === p ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>
                  {p === ApiProvider.GEMINI ? 'Gemini 3' : 'Sonar Pro'}
                </button>
              ))}
            </div>
            <button onClick={executeAlphaFinalization} disabled={loading} className="px-10 py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 disabled:opacity-50">
              {loading ? 'Processing...' : 'Execute Alpha Engine'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {currentResults.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-6 rounded-[32px] border-l-4 cursor-pointer transition-all ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10 scale-[1.02]' : 'border-l-white/10 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-start mb-2">
                     <div>
                        <span className="text-[10px] font-black text-rose-500/60 tracking-widest uppercase">Rank #{idx + 1}</span>
                        <h4 className="text-3xl font-black text-white italic uppercase leading-tight">{item.symbol}</h4>
                     </div>
                     <p className="text-xl font-black text-rose-500 italic">{item.convictionScore?.toFixed(0)}%</p>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
                     <span className="text-[7px] px-2 py-0.5 rounded-full font-black border border-white/10 text-slate-400 uppercase tracking-widest">{item.chartPattern || 'Analyzing...'}</span>
                     <span className="text-[7px] px-2 py-0.5 rounded-full font-black border border-blue-500/30 text-blue-400 uppercase tracking-widest">R/R {item.riskRewardRatio}</span>
                  </div>
               </div>
             ))}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-8 md:p-12 rounded-[40px] border-t-2 border-t-rose-500 bg-slate-950/90 animate-in fade-in slide-in-from-bottom-6 duration-700">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                   <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-5xl font-black text-white italic uppercase">{selectedStock.symbol}</h3>
                        <p className="text-sm font-bold text-slate-500 uppercase mt-2">{selectedStock.name} — <span className="text-rose-500/80">{selectedStock.sectorTheme}</span></p>
                      </div>
                      <button onClick={() => executeBacktest(selectedStock)} disabled={backtestLoading} className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${backtestLoading ? 'bg-slate-800 border-white/10 text-slate-500' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white'}`}>
                        {backtestLoading ? 'Simulating...' : 'Run AI Backtest'}
                      </button>
                   </div>

                   {/* 백테스트 결과 섹션 */}
                   {currentBacktest && (
                     <div className="grid grid-cols-1 gap-6 animate-in zoom-in-95 duration-500">
                        <div className="grid grid-cols-4 gap-4">
                           {[
                             { l: 'Win Rate', v: currentBacktest.metrics.winRate, c: 'text-emerald-400' },
                             { l: 'Profit Factor', v: currentBacktest.metrics.profitFactor, c: 'text-blue-400' },
                             { l: 'Max Drawdown', v: currentBacktest.metrics.maxDrawdown, c: 'text-rose-400' },
                             { l: 'Sharpe Ratio', v: currentBacktest.metrics.sharpeRatio, c: 'text-amber-400' }
                           ].map((m, i) => (
                             <div key={i} className="p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
                                <p className="text-[8px] font-black text-slate-500 uppercase mb-1 tracking-widest">{m.l}</p>
                                <p className={`text-lg font-black ${m.c}`}>{m.v}</p>
                             </div>
                           ))}
                        </div>
                        <div className="h-64 w-full bg-black/40 rounded-3xl border border-white/5 p-6">
                           <p className="text-[10px] font-black text-slate-500 uppercase mb-4 tracking-widest italic">Simulated Strategy Equity Curve (24M)</p>
                           <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={currentBacktest.equityCurve}>
                                 <defs>
                                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                                       <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                       <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                 </defs>
                                 <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
                                 <XAxis dataKey="period" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                                 <YAxis stroke="#475569" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                                 <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff10', borderRadius: '12px', fontSize: '10px' }} />
                                 <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorVal)" />
                              </AreaChart>
                           </ResponsiveContainer>
                        </div>
                        <div className="p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
                           <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-3 italic">AI Backtest Commentary</p>
                           <p className="text-xs text-slate-400 leading-relaxed font-medium italic uppercase tracking-tighter">
                              {currentBacktest.historicalContext}
                           </p>
                        </div>
                     </div>
                   )}

                   <div className="grid grid-cols-3 gap-4">
                      <div className="p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                         <p className="text-[8px] font-black text-emerald-500 uppercase mb-1 tracking-widest">Support (Entry)</p>
                         <p className="text-xl font-mono font-black text-white">${selectedStock.supportLevel?.toFixed(2)}</p>
                      </div>
                      <div className="p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                         <p className="text-[8px] font-black text-blue-500 uppercase mb-1 tracking-widest">Resistance (Target)</p>
                         <p className="text-xl font-mono font-black text-white">${selectedStock.resistanceLevel?.toFixed(2)}</p>
                      </div>
                      <div className="p-6 bg-rose-500/5 rounded-2xl border border-rose-500/10">
                         <p className="text-[8px] font-black text-rose-500 uppercase mb-1 tracking-widest">Hard Stop</p>
                         <p className="text-xl font-mono font-black text-white">${selectedStock.stopLoss?.toFixed(2)}</p>
                      </div>
                   </div>

                   <div className="bg-black/60 rounded-[32px] border border-white/5 aspect-video overflow-hidden shadow-inner relative">
                      <iframe title="Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full border-none" />
                   </div>

                   <div className="p-10 bg-white/5 rounded-[32px] border border-white/5">
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-4 italic">Strategic Technical Outlook</h4>
                      <div className="prose-report text-sm text-slate-300 leading-relaxed italic">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedStock.investmentOutlook || ""}</ReactMarkdown>
                      </div>
                   </div>
                </div>

                <div className="space-y-8 pt-4">
                   <div className="p-10 bg-rose-500/10 rounded-[40px] border border-rose-500/20 shadow-xl">
                      <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-6">Conviction Index</p>
                      <div className="flex items-center space-x-6 mb-6">
                         <div className="h-3 flex-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400" style={{ width: `${selectedStock.convictionScore || 50}%` }}></div>
                         </div>
                         <span className="text-lg font-black text-white">{selectedStock.convictionScore?.toFixed(0)}%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 italic leading-relaxed uppercase">{selectedStock.aiSentiment}</p>
                   </div>
                   <div className="p-8 bg-white/5 rounded-[32px] border border-white/5 border-l-4 border-l-rose-500">
                      <p className="text-[9px] font-black text-slate-600 uppercase mb-4 tracking-widest">Neural Logic Matrix</p>
                      <p className="text-xs text-slate-400 leading-relaxed italic uppercase font-mono tracking-tighter">{selectedStock.analysisLogic}</p>
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
            <div className={`w-2 h-2 rounded-full ${loading || backtestLoading ? 'bg-rose-500 animate-pulse' : 'bg-slate-700'}`}></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : 'border-rose-900'}`}>
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
