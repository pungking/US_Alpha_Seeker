
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApiProvider } from '../types';
import { generateAlphaSynthesis, runAiBacktest, analyzePipelineStatus } from '../services/intelligenceService';

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
  timestamp?: number;
}

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (brain: ApiProvider) => void;
  onFinalSymbolsDetected?: (symbols: string[], fullData?: any[]) => void;
}

const METRIC_DEFINITIONS: { [key: string]: { title: string; desc: string } } = {
  WIN_RATE: { title: "승률 (Win Rate)", desc: "**수익 거래의 비율**입니다. 60% 이상이면 매우 안정적입니다." },
  PROFIT_FACTOR: { title: "손익비 (Profit Factor)", desc: "**총 수익 / 총 손실**의 비율입니다. 1.5 이상이면 이상적입니다." },
  MAX_DRAWDOWN: { title: "최대 낙폭 (MDD)", desc: "**최고점 대비 최대 하락률**로 심리적 허용 한계를 측정합니다." },
  SHARPE_RATIO: { title: "샤프 지수 (Sharpe Ratio)", desc: "**변동성 대비 초과 수익**을 측정합니다. 1.0 이상이면 우수합니다." }
};

const MarkdownComponents = {
    h1: ({node, ...props}: any) => <h1 className="text-xl md:text-2xl font-black text-white mt-6 mb-4 uppercase tracking-widest border-b border-rose-500/50 pb-2" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-lg md:text-xl font-bold text-emerald-400 mt-6 mb-3 uppercase tracking-wide flex items-center gap-2 border-b border-white/10 pb-1" {...props} />,
    p: ({node, ...props}: any) => <p className="text-sm md:text-[15px] text-slate-200 leading-7 mb-4" {...props} />,
    li: ({node, ...props}: any) => <li className="ml-4 list-disc text-slate-300 text-sm mb-2" {...props} />,
};

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [activeTab, setActiveTab] = useState<'INDIVIDUAL' | 'MATRIX'>('INDIVIDUAL');
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  
  // Matrix Report Cache
  const [matrixReports, setMatrixReports] = useState<{ [key in ApiProvider]?: string }>({});
  const [matrixBrain, setMatrixBrain] = useState<ApiProvider>(ApiProvider.GEMINI);

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Standby.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string } | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Handle caching logic for individual results
  useEffect(() => {
    const cached = resultsCache[selectedBrain];
    if (cached && cached.length > 0) {
      if (!selectedStock || !cached.find(c => c.symbol === selectedStock.symbol)) {
        setSelectedStock(cached[0]);
      }
    } else {
      setSelectedStock(null);
    }
  }, [selectedBrain, resultsCache]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) loadStage5Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', signal: '[SIGNAL]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const cleanMarkdown = (text?: any) => {
    if (!text) return '';
    return String(text).replace(/\[\d+\]/g, '').replace(/\*\*/g, '').trim();
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
        addLog(`Vault Synchronized: Elite candidates loaded.`, "ok");
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); }
  };

  const handleExecuteEngine = async () => {
    if (loading) return;
    setLoading(true);
    addLog(`Initializing Alpha Analysis via ${selectedBrain}...`, "signal");

    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      const mergedFinal = (aiResults || []).map((aiData: any) => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        return item ? { ...item, ...aiData } : null;
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`${mergedFinal.length} Alpha targets identified.`, "ok");
    } catch (e: any) { addLog(`Engine Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const handleRunMatrixAudit = async (brain: ApiProvider) => {
    if (matrixLoading) return;
    setMatrixBrain(brain);
    const currentResults = resultsCache[selectedBrain] || [];
    if (currentResults.length === 0) {
        addLog("Error: No data to audit. Run Individual analysis first.", "err");
        return;
    }
    setMatrixLoading(true);
    addLog(`Generating Matrix Report via ${brain}...`, "signal");
    try {
        const report = await analyzePipelineStatus({
            currentStage: 6,
            apiStatuses: [],
            recommendedData: currentResults
        }, brain);
        setMatrixReports(prev => ({ ...prev, [brain]: report }));
        addLog("Portfolio Matrix generated successfully.", "ok");
    } catch (e: any) { addLog(`Matrix Error: ${e.message}`, "err"); }
    finally { setMatrixLoading(false); }
  };

  const handleRunBacktest = async (stock: AlphaCandidate) => {
    if (backtestLoading) return;
    setBacktestLoading(true);
    addLog(`Running Quant Simulation for ${stock.symbol}...`, "signal");
    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      setBacktestData(prev => ({ ...prev, [stock.symbol]: data }));
      addLog(`Simulation complete for ${stock.symbol}.`, "ok");
    } catch (e: any) { addLog(`Backtest Error: ${e.message}`, "err"); }
    finally { setBacktestLoading(false); }
  };

  const getVerdictStyle = (v?: string) => {
    const text = cleanMarkdown(v).toUpperCase();
    if (text.includes('BUY') || text.includes('매수')) return 'bg-rose-600 text-white border-rose-400';
    if (text.includes('SELL') || text.includes('매도')) return 'bg-blue-600 text-white border-blue-400';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-6 rounded-[40px] border-t-2 shadow-2xl transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Alpha_Discovery Hub</h2>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mt-2 w-fit">
                    <button onClick={() => setActiveTab('INDIVIDUAL')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'INDIVIDUAL' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Individual</button>
                    <button onClick={() => setActiveTab('MATRIX')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'MATRIX' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Matrix</button>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                  <button key={p} onClick={() => setSelectedBrain(p)} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>
                    {p === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                  </button>
                ))}
              </div>
              <button onClick={handleExecuteEngine} disabled={loading} className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800' : 'bg-rose-600 text-white hover:brightness-110 shadow-rose-900/20'}`}>
                {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
              </button>
            </div>
          </div>

          {activeTab === 'INDIVIDUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentResults.length > 0 ? currentResults.map((item, idx) => {
                const isSelected = selectedStock?.symbol === item.symbol;
                return (
                  <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all relative overflow-hidden flex flex-col h-[240px] ${isSelected ? 'border-rose-500 bg-rose-500/10 shadow-xl' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}>
                    {loading && isSelected && (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div></div>
                    )}
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-white italic">{item.symbol}</h4>
                        <span className="text-sm font-bold text-rose-500">({item.convictionScore}%)</span>
                      </div>
                      <span className="text-xs font-mono text-slate-400">${item.price?.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest truncate mb-4">{cleanMarkdown(item.sectorTheme)}</p>
                    <div className="grid grid-cols-3 gap-2 py-4 bg-black/50 rounded-2xl border border-white/5 flex-grow items-center">
                      <div className="text-center"><p className="text-[8px] text-emerald-500 font-black uppercase">Entry</p><p className="text-xs font-black text-white">${item.supportLevel?.toFixed(1)}</p></div>
                      <div className="text-center border-x border-white/10"><p className="text-[8px] text-blue-500 font-black uppercase">Target</p><p className="text-xs font-black text-white">${item.resistanceLevel?.toFixed(1)}</p></div>
                      <div className="text-center"><p className="text-[8px] text-rose-500 font-black uppercase">Stop</p><p className="text-xs font-black text-white">${item.stopLoss?.toFixed(1)}</p></div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-[10px] font-black text-emerald-400">{cleanMarkdown(item.expectedReturn)}</span>
                      <span className={`px-2 py-1 rounded text-[8px] font-black uppercase border ${getVerdictStyle(item.aiVerdict)}`}>{cleanMarkdown(item.aiVerdict)}</span>
                    </div>
                  </div>
                );
              }) : <div className="col-span-full py-20 text-center opacity-30 text-xs font-black uppercase tracking-[0.5em]">Awaiting Analysis Signal...</div>}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex gap-4">
                  <button onClick={() => handleRunMatrixAudit(ApiProvider.GEMINI)} disabled={matrixLoading} className="flex-1 py-4 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Audit via Gemini</button>
                  <button onClick={() => handleRunMatrixAudit(ApiProvider.PERPLEXITY)} disabled={matrixLoading} className="flex-1 py-4 bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-600 hover:text-white transition-all">Audit via Sonar</button>
               </div>
               {matrixReports[matrixBrain] && (
                 <div className="prose-report bg-black/30 p-8 rounded-[40px] border border-white/5">
                   <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{matrixReports[matrixBrain]}</ReactMarkdown>
                 </div>
               )}
            </div>
          )}
        </div>

        {activeTab === 'INDIVIDUAL' && selectedStock && (
          <div key={selectedStock.symbol} className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
             <div className="flex flex-col lg:flex-row items-end gap-6 mb-8">
                <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none">{selectedStock.symbol}</h3>
                <div className="flex flex-col">
                  <span className={`px-4 py-1.5 text-xs font-black rounded-full uppercase border w-fit mb-2 ${getVerdictStyle(selectedStock.aiVerdict)}`}>{cleanMarkdown(selectedStock.aiVerdict)}</span>
                  <span className="text-xl font-bold text-slate-400 tracking-widest">{selectedStock.name}</span>
                </div>
                <div className="ml-auto bg-black/40 px-8 py-4 rounded-[30px] border border-white/5 text-center shadow-inner">
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Conviction</p>
                   <p className="text-2xl font-black text-emerald-400">{selectedStock.convictionScore}%</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 space-y-8">
                   <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl">
                      <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90" />
                   </div>
                   <div className="p-8 bg-white/5 rounded-[40px] border border-white/10">
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6 italic underline underline-offset-8">Neural Investment Outlook</h4>
                      <div className="prose-report">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{selectedStock.investmentOutlook || "_Analyzing..._"}</ReactMarkdown>
                      </div>
                   </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                   <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner">
                      <h4 className="text-[9px] font-black text-slate-500 uppercase mb-4 italic">Core Rationale</h4>
                      <ul className="space-y-3">
                         {selectedStock.selectionReasons?.map((r, i) => (
                           <li key={i} className="flex items-start gap-3"><div className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" /><p className="text-xs font-bold text-slate-200">{cleanMarkdown(r)}</p></li>
                         ))}
                      </ul>
                   </div>
                   <button onClick={() => handleRunBacktest(selectedStock)} disabled={backtestLoading} className="w-full py-5 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-xl">
                     {backtestLoading ? 'Calculating Alpha...' : 'Run Portfolio Simulation'}
                   </button>
                   {currentBacktest && (
                     <div className="p-6 bg-black/80 rounded-[40px] border border-white/10 shadow-2xl space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                           {Object.entries(currentBacktest.metrics).map(([k, v]) => (
                             <div key={k} className="p-3 bg-white/5 rounded-2xl border border-white/5"><p className="text-[7px] text-slate-500 font-black uppercase">{k.replace(/([A-Z])/g, ' $1')}</p><p className="text-sm font-black text-white">{cleanMarkdown(v)}</p></div>
                           ))}
                        </div>
                        <div className="prose-report text-xs opacity-80"><ReactMarkdown remarkPlugins={[remarkGfm]}>{currentBacktest.historicalContext}</ReactMarkdown></div>
                     </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[50px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-8 shadow-3xl overflow-hidden">
          <h3 className="font-black text-white text-[11px] uppercase tracking-[0.5em] italic mb-6">Alpha_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[35px] font-mono text-[10px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed shadow-inner">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-rose-900'}`}>
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
