
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ApiProvider } from '../types';
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

// [HELPER] Metric Definitions
const METRIC_DEFINITIONS: { [key: string]: { title: string; desc: string } } = {
  WIN_RATE: {
    title: "승률 (Win Rate)",
    desc: "**전체 매매 중 수익 거래의 비율**입니다.\n\n- **60% 이상**: 훌륭한 전략으로 간주\n- **50% 미만**: 손익비가 높아야 수익 가능"
  },
  PROFIT_FACTOR: {
    title: "손익비 (Profit Factor)",
    desc: "**총 수익을 총 손실로 나눈 값**입니다.\n\n- **1.0 초과**: 수익 구간 진입\n- **1.5 이상**: 준수한 전략\n- **2.0 이상**: 매우 뛰어난 전략"
  },
  MAX_DRAWDOWN: {
    title: "최대 낙폭 (MDD)",
    desc: "**자산 고점 대비 최대 하락 비율**입니다.\n\n- 수치가 0에 가까울수록 방어력이 좋습니다.\n- **-10% 이내**라면 심리적으로 안정적인 전략입니다."
  },
  SHARPE_RATIO: {
    title: "샤프 지수 (Sharpe Ratio)",
    desc: "**위험(변동성) 1단위당 초과 수익**입니다.\n\n- **1.0 이상**: 위험 대비 수익 양호\n- 수치가 높을수록 **적은 변동성**으로 **높은 수익**을 달성했음을 의미합니다."
  }
};

// [CUSTOM MARKDOWN COMPONENTS] - High Readability Theme
const MarkdownComponents = {
    h1: ({node, ...props}: any) => <h1 className="text-xl md:text-2xl font-black text-white mt-6 mb-4 uppercase tracking-widest border-b border-rose-500/50 pb-2" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-lg md:text-xl font-bold text-emerald-400 mt-6 mb-3 uppercase tracking-wide flex items-center gap-2 border-b border-white/10 pb-1"><span className="text-emerald-500 mr-2">#</span>{props.children}</h2>,
    h3: ({node, ...props}: any) => <h3 className="text-base md:text-lg font-bold text-blue-400 mt-4 mb-2 tracking-wide" {...props} />,
    p: ({node, ...props}: any) => <p className="text-sm md:text-[15px] text-slate-200 leading-8 mb-4 font-normal tracking-wide" {...props} />,
    ul: ({node, ...props}: any) => <ul className="space-y-3 mb-6 mt-2" {...props} />,
    ol: ({node, ...props}: any) => <ol className="list-decimal pl-5 space-y-2 mb-4 text-slate-200 marker:text-emerald-500 marker:font-bold" {...props} />,
    li: ({node, ...props}: any) => (
        <li className="pl-4 relative flex items-start group" {...props}>
             <span className="absolute left-0 top-2.5 w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:bg-emerald-300 transition-colors"></span>
             <span className="flex-1 leading-7 text-slate-300 text-sm md:text-[15px]">{props.children}</span>
        </li>
    ),
    strong: ({node, ...props}: any) => <strong className="text-emerald-300 font-extrabold bg-emerald-900/40 px-1.5 py-0.5 rounded mx-0.5 shadow-sm" {...props} />,
    blockquote: ({node, ...props}: any) => (
        <blockquote className="border-l-4 border-emerald-500/50 bg-emerald-950/30 p-4 my-6 rounded-r-xl italic text-slate-300 shadow-inner" {...props} />
    ),
    code: ({node, inline, ...props}: any) => (
        inline 
        ? <code className="bg-slate-800 text-rose-300 px-1.5 py-0.5 rounded font-mono text-xs border border-white/10" {...props} />
        : <pre className="bg-slate-950 p-4 rounded-xl border border-white/10 overflow-x-auto my-4 text-xs text-slate-300 font-mono shadow-xl" {...props} />
    ),
};

// [CUSTOM MARKDOWN COMPONENTS] - Small Metrics
const MetricMarkdownComponents = {
    p: ({node, ...props}: any) => <p className="text-xs text-slate-300 leading-relaxed mb-2 font-medium" {...props} />,
    strong: ({node, ...props}: any) => <strong className="text-emerald-400 font-bold" {...props} />,
    ul: ({node, ...props}: any) => <ul className="space-y-1 mb-1 mt-1" {...props} />,
    li: ({node, ...props}: any) => (
        <li className="flex items-start gap-2 pl-1" {...props}>
             <span className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 shrink-0 opacity-80"></span>
             <span className="flex-1 text-[11px] text-slate-400 leading-snug">{props.children}</span>
        </li>
    ),
};

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected }) => {
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v9.9.9 (Multi-Model): Sonar Pro Active (Fallback Ready).']);
  
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string } | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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

  useEffect(() => {
    setSelectedMetricInfo(null);
  }, [selectedStock]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const handleSwitchBrain = (brain: ApiProvider) => {
    if (brain === selectedBrain) return;
    setSelectedBrain(brain);
    setSelectedStock(null); 
    setSelectedMetricInfo(null);
    addLog(`Brain Switched: ${brain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}.`, 'info');
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

  const handleExecuteEngine = async (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (loading) return;
    
    addLog(`[SIGNAL] Initializing Alpha Sieve Engine (${selectedBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar'})...`, "info");
    setLoading(true);

    try {
      let currentUniverse = elite50;
      if (currentUniverse.length === 0) {
        if (!accessToken) throw new Error("Cloud Vault Disconnected.");
        const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
        const listResRaw = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!listResRaw.ok) throw new Error(`Drive List Failed`);
        const listRes = await listResRaw.json();
        if (listRes.files?.length) {
          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
          currentUniverse = content.ict_universe || [];
          setElite50(currentUniverse);
        } else {
          throw new Error("No Stage 5 Data Found.");
        }
      }

      const topCandidates = [...currentUniverse].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      
      const { data: aiResults, error } = await generateAlphaSynthesis(topCandidates, selectedBrain);
      if (error) throw new Error(error);

      // CRITICAL FIX: Ensure aiResults is an array to prevent "map is not a function" crash
      const validResults = Array.isArray(aiResults) ? aiResults : [];
      if (!Array.isArray(aiResults) && aiResults) {
           addLog(`Warning: AI returned non-array structure. Attempting recovery...`, "warn");
      }

      const mergedFinal = validResults.map(aiData => {
        const item = topCandidates.find((c: any) => c.symbol.toUpperCase() === aiData.symbol?.toUpperCase());
        if (!item) return null;
        return { 
          ...item, ...aiData,
          supportLevel: Number(aiData.supportLevel) || item.price * 0.98,
          resistanceLevel: Number(aiData.resistanceLevel) || item.price * 1.25,
          stopLoss: Number(aiData.stopLoss) || item.price * 0.92
        };
      }).filter(x => x !== null) as AlphaCandidate[];

      if (mergedFinal.length === 0 && validResults.length > 0) {
          addLog("Symbol mismatch error. Retrying engine...", "warn");
      }

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        setSelectedStock(mergedFinal[0]);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`Alpha Protocol: ${mergedFinal.length} assets mapped for deep analysis.`, "ok");
    } catch (e: any) { 
        let msg = e.message;
        if (msg.includes('Load failed') || msg.includes('Failed to fetch')) {
             msg = "Network/CORS Error: Please check if 'Allow CORS' extension is enabled.";
        }
        addLog(`Engine Error: ${msg}`, "err"); 
        setSelectedStock(null);
    }
    finally { setLoading(false); }
  };

  const handleRunBacktest = async (stock: AlphaCandidate, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    if (backtestLoading) {
        addLog(`[BUSY] Simulation engine is occupied.`, "warn");
        return;
    }
    
    setBacktestLoading(true);
    setSelectedMetricInfo(null);
    addLog(`[SIGNAL] Quant Backtest initiated for ${stock.symbol}.`, "info");

    try {
      const { data, error } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      if (!data || !Array.isArray(data.equityCurve)) throw new Error("Incomplete simulation stream.");

      const curve = data.equityCurve.map((point: any, idx: number) => {
        let val = (point || {}).value;
        if (typeof val !== 'number') {
          val = parseFloat(String(val || '0').replace(/[^-0-9.]/g, ''));
        }
        if (!Number.isFinite(val) || Number.isNaN(val)) val = 0;
        
        return {
          period: String((point || {}).period || `M${idx + 1}`),
          value: Number(val.toFixed(2))
        };
      });

      const safeMetrics = data.metrics || {
        winRate: "N/A", profitFactor: "N/A", maxDrawdown: "N/A", sharpeRatio: "N/A"
      };

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
      let msg = e.message;
      if (msg.includes('Load failed') || msg.includes('Failed to fetch')) {
           msg = "Network/CORS Error: Check 'Allow CORS' extension.";
      }
      addLog(`Quant Error: ${msg}`, "err");
    }
    finally { 
      setBacktestLoading(false); 
    }
  };

  const handleMetricClick = (key: string, value: string) => {
    const info = METRIC_DEFINITIONS[key];
    if (info) {
      setSelectedMetricInfo({
        title: info.title,
        desc: info.desc,
        value: value
      });
    }
  };

  const cleanMarkdown = (text?: string) => text?.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').trim() || '';

  const getVerdictStyle = (verdict?: string) => {
    const clean = cleanMarkdown(verdict);
    const v = clean.toUpperCase();
    
    let style = 'bg-slate-800 text-slate-400 border border-white/5';
    let text = clean || 'N/A';

    if (v.includes('STRONG') && (v.includes('BUY') || v.includes('LONG') || v.includes('매수'))) {
         text = "강력 매수";
         style = 'bg-rose-600 text-white shadow-[0_0_15px_rgba(225,29,72,0.6)] border border-rose-400 font-black animate-pulse-soft';
    } else if (v.includes('HIGH') && (v.includes('RISK') || v.includes('RETURN'))) {
         text = "고위험 고수익";
         style = 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.6)] border border-purple-400 font-black';
    } else if (v.includes('ACCUMULATE') || v.includes('OVERWEIGHT') || v.includes('비중')) {
         text = "비중 확대";
         style = 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)] border border-blue-400 font-bold';
    } else if ((v.includes('BUY') && !v.includes('STRONG')) || v === 'LONG' || v.includes('매수')) {
         text = "매수";
         style = 'bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-400 font-bold';
    } else if (v.includes('HOLD') || v.includes('NEUTRAL') || v.includes('MARKET PERFORM') || v.includes('관망') || v.includes('중립')) {
         text = "관망";
         style = 'bg-amber-600 text-white border border-amber-400/50 font-medium';
    } else if (v.includes('SELL') || v.includes('SHORT') || v.includes('매도')) {
         text = "매도";
         style = 'bg-slate-700 text-slate-300 border border-slate-500 font-medium';
    } else if (v.includes('STRONG') && (v.includes('SELL') || v.includes('SHORT'))) {
         text = "강력 매도";
         style = 'bg-slate-800 text-red-500 border border-red-500 font-black';
    }

    return { style, text };
  };

  const renderExpectedReturn = (text?: string) => {
    const clean = cleanMarkdown(text) || '---';
    const pctMatch = clean.match(/([+\-]?\d+(?:\.\d+)?%)/);
    
    if (pctMatch) {
        const pct = pctMatch[0];
        // Remove percentage and parentheses from string to get description
        const desc = clean.replace(pct, '').replace(/[()]/g, '').trim();
        const isPositive = !pct.startsWith('-');
        
        return (
            <div className="flex flex-col items-start justify-center">
                <span className={`text-sm font-black italic tracking-tighter leading-none ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pct}
                </span>
                {desc && (
                    <span className="text-[9px] font-bold text-slate-500 leading-tight mt-1">
                        {desc}
                    </span>
                )}
            </div>
        );
    }
    
    return <span className="text-xs font-black text-slate-400 italic">{clean}</span>;
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  const isChartReady = useMemo(() => {
    return !!currentBacktest?.equityCurve && 
           currentBacktest.equityCurve.length > 1 && 
           currentBacktest.equityCurve.every(p => Number.isFinite(p.value));
  }, [currentBacktest]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-6 md:p-8 rounded-[40px] border-t-2 shadow-2xl bg-slate-900/40 relative transition-all duration-500 ${selectedBrain === ApiProvider.GEMINI ? 'border-t-indigo-500' : 'border-t-cyan-500'}`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                 <svg className={`w-5 h-5 ${loading ? 'animate-spin text-rose-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Discovery v9.9.9</h2>
                <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest mt-1 italic">Neural Optimization Terminal</p>
              </div>
            </div>
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
              {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                <button 
                    key={p} 
                    onClick={() => handleSwitchBrain(p)} 
                    className={`px-4 py-2 rounded-lg text-[8px] font-black uppercase transition-all flex items-center gap-2 ${selectedBrain === p ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >
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
             {currentResults.length > 0 ? currentResults.map((item, idx) => {
               const verdictInfo = getVerdictStyle(item.aiVerdict);
               return (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col h-[260px] ${selectedStock?.symbol === item.symbol ? 'border-rose-500 bg-rose-500/10 shadow-[0_0_40px_rgba(244,63,94,0.15)] ring-1 ring-rose-500/30' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}>
                  <div className="flex justify-between items-center mb-1 pointer-events-none">
                     <div className="flex items-center gap-3">
                       <span className="text-[8px] font-black text-slate-600 uppercase">#{idx + 1}</span>
                       <div className="flex items-baseline gap-2">
                         <h4 className="text-3xl font-black text-white italic uppercase tracking-tighter leading-none">{item.symbol}</h4>
                         <span className="text-xl font-black text-rose-500 italic">({item.convictionScore?.toFixed(0)}%)</span>
                       </div>
                     </div>
                     <span className="text-[10px] font-mono font-black text-white bg-white/10 px-3 py-1 rounded-lg border border-white/10 shadow-sm">${item.price?.toFixed(2)}</span>
                  </div>
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest truncate mb-3 border-b border-white/5 pb-2 pointer-events-none">{cleanMarkdown(item.sectorTheme)}</p>
                  
                  <div className="grid grid-cols-3 gap-2 py-5 bg-black/50 rounded-2xl px-1 border border-white/10 flex-grow pointer-events-none shadow-inner items-center">
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

                  <div className="flex justify-between items-end mt-3 pointer-events-none">
                     <div className="flex flex-col gap-1 w-[60%]">
                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">EXP. RETURN</span>
                        {renderExpectedReturn(item.expectedReturn)}
                     </div>
                     <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter ${verdictInfo.style} mb-1 shadow-md whitespace-nowrap`}>
                       {verdictInfo.text}
                     </span>
                  </div>
               </div>
             )}) : (
               <div className="col-span-full flex flex-col items-center justify-center py-24 opacity-20 space-y-4">
                  <div className="w-12 h-12 border-2 border-dashed border-slate-600 rounded-full animate-pulse flex items-center justify-center">
                    <div className="w-4 h-4 bg-slate-600 rounded-full"></div>
                  </div>
                  <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-400">
                    {loading ? 'Executing Neural Analysis...' : 'Awaiting Discovery Protocol...'}
                  </p>
               </div>
             )}
          </div>
        </div>

        {selectedStock && (
          <div className="glass-panel p-6 md:p-8 rounded-[50px] bg-slate-950/90 border-t-2 border-t-rose-500 animate-in fade-in duration-700 shadow-3xl">
             <div className="space-y-6">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                   <div className="flex items-end gap-6">
                      <h3 className="text-5xl lg:text-6xl font-black text-white italic uppercase tracking-tighter leading-none">{selectedStock.symbol}</h3>
                      <div className="flex flex-col mb-1">
                        <span className={`px-6 py-2 ${getVerdictStyle(selectedStock.aiVerdict).style} text-sm font-black rounded-full uppercase italic tracking-widest mb-2 w-fit shadow-xl`}>
                            {getVerdictStyle(selectedStock.aiVerdict).text}
                        </span>
                        <span className="text-xl font-bold text-slate-400 uppercase tracking-widest leading-none">{selectedStock.name}</span>
                      </div>
                   </div>
                   <div className="ml-auto bg-black/40 px-8 py-4 rounded-[28px] border border-white/10 text-center min-w-[150px] shadow-inner">
                      <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em] mb-1">AI Confidence</p>
                      <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore?.toFixed(1)}%</p>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                   <div className="lg:col-span-3 space-y-6">
                      <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative">
                         <iframe title="Live Chart" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1&timezone=Etc%2FUTC`} className="w-full h-full border-none opacity-90" />
                      </div>
                      <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                         <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-4 italic underline underline-offset-[12px]">Neural Investment Strategy</h4>
                         <div className="prose-report min-h-[150px]">
                           <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                             {cleanMarkdown(selectedStock.investmentOutlook) || "_Strategic data is being compiled..._"}
                           </ReactMarkdown>
                         </div>
                      </div>
                   </div>
                   <div className="lg:col-span-2 space-y-6">
                      <div className="p-6 bg-black/30 rounded-[40px] border border-white/5">
                         <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 italic">Alpha Rationale</h4>
                         <ul className="space-y-3">
                            {selectedStock.selectionReasons?.map((r, i) => (
                              <li key={i} className="flex items-start space-x-3">
                                 <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                                 <p className="text-xs font-bold text-slate-200 leading-relaxed uppercase tracking-tight">{cleanMarkdown(r)}</p>
                              </li>
                            ))}
                         </ul>
                      </div>
                      <div className="p-6 bg-black/60 rounded-[40px] border border-white/10 border-l-8 border-l-rose-600 shadow-2xl">
                         <h4 className="text-[9px] font-black text-slate-600 uppercase mb-3 tracking-[0.3em] italic">Engine Core Logic</h4>
                         <p className="text-xs text-slate-400 leading-relaxed font-mono italic uppercase tracking-tighter">{cleanMarkdown(selectedStock.analysisLogic)}</p>
                      </div>
                   </div>
                </div>

                <div className="pt-8 border-t border-white/10">
                   <div className="flex justify-between items-center mb-6">
                      <div>
                        <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.5em] italic mb-1">Quant_Backtest_Protocol</h4>
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                           Simulation Period: <span className="text-emerald-400">{currentBacktest?.simulationPeriod || "Ready to Calculate"}</span>
                        </p>
                      </div>
                      <button 
                        onClick={(e) => handleRunBacktest(selectedStock, e)} 
                        disabled={backtestLoading} 
                        className={`px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-2xl ${backtestLoading ? 'bg-slate-800 text-slate-500 border-white/5 cursor-not-allowed' : 'bg-emerald-600/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white active:scale-95'}`}
                      >
                        {backtestLoading ? 'Simulation_Active...' : 'Run Portfolio Simulation'}
                      </button>
                   </div>
                   
                   {currentBacktest && (
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-6 duration-700">
                        <div className="flex flex-col gap-6">
                            <div className="space-y-3">
                               {[
                                 { k: 'WIN_RATE', l: '승률 (WIN RATE)', v: currentBacktest.metrics?.winRate || 'N/A', c: 'text-emerald-400' },
                                 { k: 'PROFIT_FACTOR', l: '손익비 (P.FACTOR)', v: currentBacktest.metrics?.profitFactor || 'N/A', c: 'text-blue-400' },
                                 { k: 'MAX_DRAWDOWN', l: '최대낙폭 (MDD)', v: currentBacktest.metrics?.maxDrawdown || 'N/A', c: 'text-rose-400' },
                                 { k: 'SHARPE_RATIO', l: '샤프지수 (RISK/RTN)', v: currentBacktest.metrics?.sharpeRatio || 'N/A', c: 'text-amber-400' }
                               ].map((m, i) => (
                                 <div 
                                    key={i} 
                                    onClick={() => handleMetricClick(m.k, m.v)}
                                    className={`p-4 bg-black/40 rounded-[24px] border border-white/5 flex justify-between items-center shadow-inner group hover:border-white/20 transition-all cursor-pointer hover:bg-white/5 ${selectedMetricInfo?.title === METRIC_DEFINITIONS[m.k].title ? 'border-white/30 bg-white/10' : ''}`}
                                 >
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.1em]">{m.l}</span>
                                    <span className={`text-xl font-black ${m.c} italic`}>{cleanMarkdown(m.v)}</span>
                                 </div>
                               ))}
                            </div>
                            
                            <div className="p-6 bg-blue-500/5 rounded-[30px] border border-blue-500/10 shadow-inner flex-1 flex flex-col justify-center min-h-[150px]">
                                {selectedMetricInfo ? (
                                    <div className="animate-in fade-in slide-in-from-left-4 duration-300">
                                        <div className="flex items-center gap-3 mb-3">
                                            <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] italic">{selectedMetricInfo.title}</span>
                                            <span className="text-xs font-black text-white bg-white/10 px-2 py-0.5 rounded">{selectedMetricInfo.value}</span>
                                        </div>
                                        <div className="text-xs text-slate-300 leading-relaxed font-medium italic">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MetricMarkdownComponents}>
                                                {selectedMetricInfo.desc}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-2 opacity-60">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        <p className="text-[8px] uppercase tracking-widest text-center">Select a metric above</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lg:col-span-2 flex flex-col gap-6">
                           <div className="w-full bg-black/80 rounded-[40px] border border-white/10 p-6 relative overflow-hidden shadow-3xl min-h-[350px]">
                              {isChartReady ? (
                                <ResponsiveContainer width="100%" height={350}>
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
                                        labelFormatter={(label) => `기간: ${label}`}
                                        formatter={(val: any) => [`${Number(val || 0).toFixed(2)}%`, '누적 수익률']}
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
                           
                           <div className="p-8 bg-emerald-500/5 rounded-[40px] border border-emerald-500/10 shadow-inner min-h-[150px] flex flex-col justify-center">
                               <p className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.4em] mb-4 italic">Simulation Intelligence Insight</p>
                               <div className="prose-report">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {cleanMarkdown(currentBacktest.historicalContext) || "_Calculating strategic insight..._"}
                                  </ReactMarkdown>
                               </div>
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
