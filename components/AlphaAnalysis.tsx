
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

// [HELPER] Metric Definitions
const METRIC_DEFINITIONS: { [key: string]: { title: string; desc: string } } = {
  WIN_RATE: {
    title: "승률 (Win Rate)",
    desc: "**수익 거래의 비율**을 의미합니다.\n\n- **60% 이상**: 매우 안정적인 전략\n- **40~50%**: 손익비(Profit Factor)가 1.5 이상이어야 수익 가능\n- **40% 미만**: 추세 추종형 전략에서 흔하며, 높은 손익비가 필수적임"
  },
  PROFIT_FACTOR: {
    title: "손익비 (Profit Factor)",
    desc: "**총 수익 / 총 손실**의 비율입니다.\n\n- **1.0 초과**: 수익 발생 구간\n- **1.5 이상**: 이상적인 우상향 계좌\n- **2.0 이상**: 월가 상위 1% 수준의 초고효율 전략"
  },
  MAX_DRAWDOWN: {
    title: "최대 낙폭 (MDD)",
    desc: "**최고점 대비 최대 하락률**로 심리적 고통을 나타냅니다.\n\n- **-10% 이내**: 매우 안정적 (보수적 투자자)\n- **-20% 이내**: 공격적 성장주 전략 허용 범위\n- **-30% 초과**: 깡통 계좌 위험, 레버리지 조절 필요"
  },
  SHARPE_RATIO: {
    title: "샤프 지수 (Sharpe Ratio)",
    desc: "**변동성 대비 초과 수익**을 측정합니다.\n\n- **1.0 이상**: 리스크 대비 수익 우수\n- **2.0 이상**: 매우 훌륭한 투자 기회\n- **3.0 이상**: 거의 완벽에 가까운 성과 (또는 데이터 과최적화 의심)"
  }
};

// [CUSTOM MARKDOWN COMPONENTS] - High Readability Theme
const MarkdownComponents: any = {
    h1: (props: any) => <h1 className="text-xl md:text-2xl font-black text-white mt-6 mb-4 uppercase tracking-widest border-b border-rose-500/50 pb-2" {...props} />,
    h2: (props: any) => <h2 className="text-lg md:text-xl font-bold text-emerald-400 mt-6 mb-3 uppercase tracking-wide flex items-center gap-2 border-b border-white/10 pb-1"><span className="text-emerald-500 mr-2">#</span>{props.children}</h2>,
    h3: (props: any) => <h3 className="text-base md:text-lg font-bold text-blue-400 mt-4 mb-2 tracking-wide" {...props} />,
    p: (props: any) => <p className="text-sm md:text-[15px] text-slate-200 leading-8 mb-4 font-normal tracking-wide" {...props} />,
    ul: (props: any) => <ul className="space-y-3 mb-6 mt-2" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 space-y-2 mb-4 text-slate-200 marker:text-emerald-500 marker:font-bold" {...props} />,
    li: (props: any) => (
        <li className="pl-4 relative flex items-start group" {...props}>
             <span className="absolute left-0 top-2.5 w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:bg-emerald-300 transition-colors"></span>
             <span className="flex-1 leading-7 text-slate-300 text-sm md:text-[15px]">{props.children}</span>
        </li>
    ),
    strong: (props: any) => <strong className="text-emerald-300 font-extrabold bg-emerald-900/40 px-1.5 py-0.5 rounded mx-0.5 shadow-sm" {...props} />,
    blockquote: (props: any) => (
        <blockquote className="border-l-4 border-emerald-500/50 bg-emerald-950/30 p-4 my-6 rounded-r-xl italic text-slate-300 shadow-inner" {...props} />
    ),
    code: ({inline, ...props}: any) => (
        inline 
        ? <code className="bg-slate-800 text-rose-300 px-1.5 py-0.5 rounded font-mono text-xs border border-white/10" {...props} />
        : <pre className="bg-slate-950 p-4 rounded-xl border border-white/10 overflow-x-auto my-4 text-xs text-slate-300 font-mono shadow-xl" {...props} />
    ),
};

// [CUSTOM MARKDOWN COMPONENTS] - Small Metrics
const MetricMarkdownComponents: any = {
    p: (props: any) => <p className="mb-2 last:mb-0" {...props} />,
    strong: (props: any) => <strong className="text-emerald-400 font-bold" {...props} />,
    ul: (props: any) => <ul className="space-y-1.5 mb-2 mt-2" {...props} />,
    li: (props: any) => (
        <li className="flex items-start gap-2 pl-1" {...props}>
             <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0 opacity-80"></span>
             <span className="flex-1 text-[11px] text-slate-300 leading-snug">{props.children}</span>
        </li>
    ),
};

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [activeTab, setActiveTab] = useState<'INDIVIDUAL' | 'MATRIX'>('INDIVIDUAL');
  const [loading, setLoading] = useState(false);
  // Independent loading states for backtests per symbol
  const [loadingBacktests, setLoadingBacktests] = useState<Set<string>>(new Set());
  const [matrixLoading, setMatrixLoading] = useState(false);
  
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  
  // Matrix Cache per Provider to prevent ghosting/overwrite
  const [matrixReports, setMatrixReports] = useState<{ [key in ApiProvider]?: string }>({});
  const [matrixBrain, setMatrixBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY); // Default to Perplexity as requested

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string } | null>(null);
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Sync selectedStock with current brain cache
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

  // Reset metric info when switching stocks
  useEffect(() => {
    setSelectedMetricInfo(null);
  }, [selectedStock]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', signal: '[SIGNAL]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const removeCitations = (text?: unknown) => {
      if (text === null || text === undefined) return '';
      return String(text).replace(/\[\d+\]/g, '').trim();
  };

  const cleanMarkdown = (text?: unknown) => {
      if (text === null || text === undefined) return '';
      return String(text).replace(/\[\d+\]/g, '').replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').trim();
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
        
        if (content && content.ict_universe) {
            setElite50(content.ict_universe);
            addLog(`Vault Synchronized: Stage 5 leaders loaded.`, "ok");
        }
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); }
  };

  const handleExecuteEngine = async () => {
    if (loading) return;
    setLoading(true);
    addLog(`Initiating Neural Alpha Sieve via ${selectedBrain}...`, "signal");

    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      if (topCandidates.length === 0) throw new Error("No candidates available to analyze.");

      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      const safeAiResults = Array.isArray(aiResults) ? aiResults : (aiResults ? [aiResults] : []);
      
      const mergedFinal = safeAiResults.map((aiData: any) => {
        if (!aiData?.symbol) return null;
        const item = topCandidates.find((c: any) => c.symbol.trim().toUpperCase() === aiData.symbol.trim().toUpperCase());
        if (!item) return null;
        
        return {
            ...item,
            ...aiData,
            convictionScore: aiData.convictionScore || item.compositeAlpha || 0,
            supportLevel: aiData.supportLevel || (item.price * 0.98),
            resistanceLevel: aiData.resistanceLevel || (item.price * 1.25),
            stopLoss: aiData.stopLoss || (item.price * 0.94),
        };
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`${mergedFinal.length} Alpha targets identified and mapped.`, "ok");
    } catch (e: any) { addLog(`Engine Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const handleRunMatrixAudit = async (brain: ApiProvider) => {
    if (matrixLoading) return;
    setMatrixBrain(brain);
    const currentResults = resultsCache[selectedBrain] || []; 
    if (currentResults.length === 0) {
        addLog("Error: Execute Alpha Engine first to generate data.", "err");
        return;
    }
    setMatrixLoading(true);
    addLog(`Synthesizing Portfolio Matrix via ${brain}...`, "signal");
    try {
        const report = await analyzePipelineStatus({
            currentStage: 6,
            apiStatuses: [],
            recommendedData: currentResults,
            symbols: currentResults.map(c => c.symbol)
        }, brain);
        setMatrixReports(prev => ({ ...prev, [brain]: report }));
        addLog("Portfolio Matrix Audit complete.", "ok");
    } catch (e: any) { addLog(`Matrix Error: ${e.message}`, "err"); }
    finally { setMatrixLoading(false); }
  };

  const handleRunBacktest = async (stock: AlphaCandidate, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (loadingBacktests.has(stock.symbol)) return;
    
    // Set specific loading state for this symbol
    setLoadingBacktests(prev => new Set(prev).add(stock.symbol));
    setSelectedMetricInfo(null);
    addLog(`Simulating Quant Protocol for ${stock.symbol}...`, "signal");

    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);

      const safeContext = data.historicalContext || "Analysis data unavailable.";
      setBacktestData(prev => ({ 
        ...prev, 
        [stock.symbol]: { 
            ...data, 
            historicalContext: safeContext, 
            timestamp: Date.now() 
        } 
      }));
      addLog(`Simulation complete for ${stock.symbol}.`, "ok");
    } catch (e: any) { addLog(`Backtest Error: ${e.message}`, "err"); }
    finally { 
        setLoadingBacktests(prev => {
            const next = new Set(prev);
            next.delete(stock.symbol);
            return next;
        });
    }
  };

  const handleMetricClick = (key: string, value: string) => {
    const info = METRIC_DEFINITIONS[key];
    if (info) setSelectedMetricInfo({ title: info.title, desc: info.desc, value: value });
  };

  const getVerdictStyle = (v?: string) => {
    const text = cleanMarkdown(v).toUpperCase();
    if (text.includes('BUY') || text.includes('매수')) return 'bg-rose-600 text-white border-rose-400';
    if (text.includes('SELL') || text.includes('매도')) return 'bg-blue-600 text-white border-blue-400';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;
  const isChartReady = useMemo(() => !!currentBacktest?.equityCurve && currentBacktest.equityCurve.length > 1, [currentBacktest]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-in fade-in duration-700">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-6 md:p-8 rounded-[40px] border-t-2 shadow-2xl transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 shadow-inner">
                 <svg className={`w-6 h-6 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Sieve Engine</h2>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mt-2 w-fit">
                    <button onClick={() => setActiveTab('INDIVIDUAL')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'INDIVIDUAL' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Individual Analysis</button>
                    <button onClick={() => setActiveTab('MATRIX')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'MATRIX' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Portfolio Matrix</button>
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
              {activeTab === 'INDIVIDUAL' && (
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                    <button key={p} onClick={() => setSelectedBrain(p)} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}>
                        {p === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                    </button>
                    ))}
                </div>
              )}
              {activeTab === 'INDIVIDUAL' && (
                  <button onClick={handleExecuteEngine} disabled={loading} className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 animate-pulse text-slate-500' : 'bg-rose-600 text-white hover:brightness-110 active:scale-95 shadow-rose-900/20'}`}>
                    {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
                  </button>
              )}
            </div>
          </div>

          {activeTab === 'INDIVIDUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentResults.length > 0 ? currentResults.map((item) => {
                const isSelected = selectedStock?.symbol === item.symbol;
                const isAnalyzing = loadingBacktests.has(item.symbol);
                return (
                  <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all relative overflow-hidden flex flex-col h-[240px] ${isSelected ? 'border-rose-500 bg-rose-500/10 shadow-xl' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}>
                    {(loading && isSelected) || isAnalyzing ? (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center flex-col gap-2 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                            {isAnalyzing ? 'Simulating...' : 'Analyzing Asset...'}
                        </span>
                      </div>
                    ) : null}
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">{item.symbol}</h4>
                        <span className="text-sm font-bold text-rose-500">({item.convictionScore || item.compositeAlpha || 0}%)</span>
                      </div>
                      <span className="text-xs font-mono font-black text-slate-400">${item.price?.toFixed(2)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest truncate mb-4 font-bold border-b border-white/5 pb-2">{cleanMarkdown(item.sectorTheme || item.theme)}</p>
                    <div className="grid grid-cols-3 gap-2 py-4 bg-black/50 rounded-2xl border border-white/5 flex-grow items-center shadow-inner">
                      <div className="text-center"><p className="text-[8px] text-emerald-500 font-black uppercase">Entry</p><p className="text-[13px] font-black text-white tracking-tighter">${item.supportLevel?.toFixed(1) || '---'}</p></div>
                      <div className="text-center border-x border-white/10"><p className="text-[8px] text-blue-500 font-black uppercase">Target</p><p className="text-[13px] font-black text-white tracking-tighter">${item.resistanceLevel?.toFixed(1) || '---'}</p></div>
                      <div className="text-center"><p className="text-[8px] text-rose-500 font-black uppercase">Stop</p><p className="text-[13px] font-black text-white tracking-tighter">${item.stopLoss?.toFixed(1) || '---'}</p></div>
                    </div>
                    <div className="flex justify-between items-center mt-3">
                      <span className="text-[10px] font-black text-emerald-400 italic">{cleanMarkdown(item.expectedReturn || "TBD")}</span>
                      <span className={`px-2.5 py-1.5 rounded text-[8px] font-black uppercase border shadow-md ${getVerdictStyle(item.aiVerdict)}`}>{cleanMarkdown(item.aiVerdict || "HOLD")}</span>
                    </div>
                  </div>
                );
              }) : <div className="col-span-full py-24 text-center opacity-30 text-xs font-black uppercase tracking-[0.6em] italic">Awaiting Alpha Protocol Signal...</div>}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex gap-4">
                  <button onClick={() => handleRunMatrixAudit(ApiProvider.GEMINI)} disabled={matrixLoading} className={`flex-1 py-4 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${matrixBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white'}`}>
                    {matrixLoading && matrixBrain === ApiProvider.GEMINI ? 'Synthesizing...' : 'Audit Portfolio via Gemini'}
                  </button>
                  <button onClick={() => handleRunMatrixAudit(ApiProvider.PERPLEXITY)} disabled={matrixLoading} className={`flex-1 py-4 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${matrixBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg' : 'bg-cyan-600/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-600 hover:text-white'}`}>
                    {matrixLoading && matrixBrain === ApiProvider.PERPLEXITY ? 'Synthesizing...' : 'Audit Portfolio via Sonar'}
                  </button>
               </div>
               
               {matrixReports[matrixBrain] ? (
                 <div className="prose-report bg-black/30 p-8 rounded-[40px] border border-white/5 min-h-[400px] shadow-inner">
                   <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Comprehensive Matrix Audit by {matrixBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Perplexity Sonar'}
                        </span>
                        <span className="text-[9px] font-mono text-slate-600">{new Date().toLocaleTimeString()}</span>
                   </div>
                   <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{matrixReports[matrixBrain]}</ReactMarkdown>
                 </div>
               ) : (
                 <div className="min-h-[300px] flex items-center justify-center text-slate-600 uppercase text-[10px] font-black tracking-widest italic border border-dashed border-white/10 rounded-[40px]">
                    Select a neural provider above to generate Portfolio Matrix
                 </div>
               )}
            </div>
          )}
        </div>

        {activeTab === 'INDIVIDUAL' && selectedStock && (
          <div key={selectedStock.symbol} className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
             <div className="flex flex-col lg:flex-row items-end gap-6 mb-8">
                <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none uppercase">{selectedStock.symbol}</h3>
                <div className="flex flex-col">
                  <span className={`px-5 py-2 text-xs font-black rounded-full uppercase border w-fit mb-2 shadow-xl ${getVerdictStyle(selectedStock.aiVerdict)}`}>{cleanMarkdown(selectedStock.aiVerdict)}</span>
                  <span className="text-xl font-bold text-slate-400 tracking-widest uppercase">{selectedStock.name}</span>
                </div>
                <div className="ml-auto bg-black/40 px-8 py-4 rounded-[30px] border border-white/5 text-center shadow-inner min-w-[160px]">
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Conviction</p>
                   <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore || selectedStock.compositeAlpha || 0}%</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-3 space-y-8">
                   <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative">
                      <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90 border-none" />
                   </div>
                   <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                      <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6 italic underline underline-offset-8">Neural Investment Outlook</h4>
                      <div className="prose-report min-h-[200px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {removeCitations(selectedStock.investmentOutlook) || "_Analyzing strategic datasets for this asset..._"}
                        </ReactMarkdown>
                      </div>
                   </div>
                </div>
                <div className="lg:col-span-2 space-y-6">
                   <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner">
                      <h4 className="text-[9px] font-black text-slate-500 uppercase mb-4 italic tracking-widest">Alpha Core Rationale</h4>
                      <ul className="space-y-4">
                         {selectedStock.selectionReasons?.length ? selectedStock.selectionReasons.map((r, i) => (
                           <li key={i} className="flex items-start gap-4">
                              <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                              <p className="text-[13px] font-bold text-slate-200 leading-snug uppercase tracking-tight">{cleanMarkdown(r)}</p>
                           </li>
                         )) : <li className="text-xs text-slate-500 italic">No specific rationale provided by engine.</li>}
                      </ul>
                   </div>
                   <button onClick={(e) => handleRunBacktest(selectedStock, e)} disabled={loadingBacktests.has(selectedStock.symbol)} className="w-full py-5 bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 rounded-3xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-xl active:scale-95">
                     {loadingBacktests.has(selectedStock.symbol) ? 'Calculating Protocol Simulation...' : currentBacktest ? 'Re-Run Portfolio Simulation' : 'Run Portfolio Simulation'}
                   </button>
                   {currentBacktest && (
                     <div className="p-6 bg-black/80 rounded-[40px] border border-white/10 shadow-2xl space-y-4 animate-in fade-in slide-in-from-right-4">
                        <div className="grid grid-cols-2 gap-3">
                           {Object.entries(currentBacktest.metrics).map(([k, v]) => (
                             <div key={k} onClick={() => handleMetricClick(k, String(v))} className={`p-3 bg-white/5 rounded-2xl border border-white/5 text-center shadow-inner cursor-pointer hover:bg-white/10 transition-colors ${selectedMetricInfo?.title === METRIC_DEFINITIONS[k]?.title ? 'border-emerald-500/30 bg-emerald-500/10' : ''}`}>
                                 <p className="text-[7px] text-slate-500 font-black uppercase tracking-tighter mb-1">{k.replace(/([A-Z])/g, ' $1')}</p>
                                 <p className="text-sm font-black text-white italic">{cleanMarkdown(v)}</p>
                             </div>
                           ))}
                        </div>
                        
                        {/* Selected Metric Detail View */}
                        <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10 min-h-[80px] flex flex-col justify-center">
                            {selectedMetricInfo ? (
                                <div className="animate-in fade-in duration-300">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[9px] font-black text-emerald-400 uppercase">{selectedMetricInfo.title}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-300 leading-relaxed font-medium">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MetricMarkdownComponents}>{selectedMetricInfo.desc}</ReactMarkdown>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-[9px] text-slate-600 text-center uppercase tracking-widest italic">Select a metric for details</p>
                            )}
                        </div>

                        {/* Backtest Chart */}
                        {isChartReady && (
                            <div className="h-[120px] w-full mt-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={currentBacktest.equityCurve}>
                                        <defs>
                                            <linearGradient id="colorValSmall" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValSmall)" isAnimationActive={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        <div className="prose-report text-xs opacity-80 leading-relaxed border-t border-white/5 pt-4">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                {removeCitations(currentBacktest.historicalContext)}
                            </ReactMarkdown>
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
          <h3 className="font-black text-white text-[11px] uppercase tracking-[0.5em] italic mb-6">Alpha_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[35px] font-mono text-[10px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed shadow-inner">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : 'border-rose-900'}`}>
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
