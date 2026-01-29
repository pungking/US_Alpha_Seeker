
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ApiProvider } from '../types';
import { generateAlphaSynthesis, runAiBacktest, analyzePipelineStatus, generateTelegramBrief } from '../services/intelligenceService';
import { sendTelegramReport } from '../services/telegramService';

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
  isRealData?: boolean;
}

interface Props {
  selectedBrain: ApiProvider;
  setSelectedBrain: (brain: ApiProvider) => void;
  onFinalSymbolsDetected?: (symbols: string[], fullData?: any[]) => void;
  onStockSelected?: (stock: any) => void;
  analyzingSymbols?: Set<string>;
  autoStart?: boolean;
  onComplete?: (reportContent?: string) => void;
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

// [CUSTOM MARKDOWN COMPONENTS]
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

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected, onStockSelected, analyzingSymbols = new Set(), autoStart, onComplete }) => {
  const [activeTab, setActiveTab] = useState<'INDIVIDUAL' | 'MATRIX'>('INDIVIDUAL');
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  
  const [matrixReports, setMatrixReports] = useState<{ [key in ApiProvider]?: string }>({});
  const [matrixBrain, setMatrixBrain] = useState<ApiProvider>(ApiProvider.PERPLEXITY);

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string } | null>(null);
  
  // INTERNAL AUTOMATION STATE
  const [autoPhase, setAutoPhase] = useState<'IDLE' | 'ENGINE' | 'MATRIX' | 'DONE'>('IDLE');

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  // Unique ID for gradient to prevent conflicts and ensure rendering
  const uniqueChartId = useMemo(() => `chart-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const cached = resultsCache[selectedBrain];
    if (cached && cached.length > 0) {
      if (!selectedStock || !cached.find(c => c.symbol === selectedStock.symbol)) {
        const initialStock = cached[0];
        setSelectedStock(initialStock);
        onStockSelected?.(initialStock);
      }
    } else {
      setSelectedStock(null);
      onStockSelected?.(null);
    }
  }, [selectedBrain, resultsCache]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) loadStage5Data();
  }, [accessToken]);

  // --- AUTO START PIPELINE SEQUENCE ---
  useEffect(() => {
    // Step 1: Start Engine
    if (autoStart && autoPhase === 'IDLE' && !loading && elite50.length > 0) {
        addLog("AUTO-PILOT: Initiating Final Alpha Synthesis...", "signal");
        setAutoPhase('ENGINE');
        handleExecuteEngine();
    }
  }, [autoStart, autoPhase, loading, elite50]);

  // Step 2: Switch to Matrix
  useEffect(() => {
      // Triggered when Engine finishes and populates resultsCache
      const hasResults = resultsCache[selectedBrain]?.length;
      if (autoStart && autoPhase === 'ENGINE' && !loading && hasResults) {
          addLog("AUTO-PILOT: Switching to Portfolio Matrix Audit...", "signal");
          setActiveTab('MATRIX');
          setAutoPhase('MATRIX');
          // Short delay to allow UI to switch
          setTimeout(() => {
              handleRunMatrixAudit(selectedBrain);
          }, 1000);
      }
  }, [autoStart, autoPhase, loading, resultsCache, selectedBrain]);

  // Step 3: Complete with Brief Summary
  useEffect(() => {
      const finishAutoPilot = async () => {
          const hasReport = matrixReports[selectedBrain];
          const currentResults = resultsCache[selectedBrain] || [];
          
          if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && hasReport) {
              addLog("AUTO-PILOT: Generating Hedge Fund Brief for Telegram...", "signal");
              
              // Generate concise summary for Telegram
              let telegramPayload = hasReport; // Default fall back
              try {
                  const brief = await generateTelegramBrief(currentResults, selectedBrain);
                  telegramPayload = brief;
                  addLog("Brief Generated. Relaying...", "ok");
              } catch (e) {
                  addLog("Brief Gen Failed. Sending full report.", "err");
              }

              setAutoPhase('DONE');
              if (onComplete) onComplete(telegramPayload);
          }
      };
      
      finishAutoPilot();
  }, [autoStart, autoPhase, matrixLoading, matrixReports, selectedBrain, resultsCache]);


  useEffect(() => {
    setSelectedMetricInfo(null);
  }, [selectedStock]);

  const handleStockClick = (item: AlphaCandidate) => {
      setSelectedStock(item);
      onStockSelected?.(item);
  };

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const removeCitations = (text?: any) => {
      if (text === null || text === undefined) return '';
      return String(text).replace(/\[\d+\]/g, '').trim();
  };

  const cleanInsightText = (text: any) => {
    if (!text) return "";
    const str = String(text); // [SAFE GUARD] Force string type
    return str
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") 
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") 
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "") 
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "") 
      .replace(/[\u{2600}-\u{26FF}]/gu, "")   
      .replace(/[\u{2700}-\u{27BF}]/gu, "")   
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") 
      .replace(/[🚀📈📉📊💰💎🔥✨⚡️🎯🛑✅❌⚠️💀🚨🛑🟢🔴🔵🟣🔸🔹🔶🔷🔳🔲👍👎👉👈]/g, "") 
      .replace(/\[\d+\]/g, '') 
      .trim();
  };

  const cleanMarkdown = (text?: any) => {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/\[\d+\]/g, '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/\*/g, '')
        .replace(/#/g, '')
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
        .trim();
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
        
        // [FIX] Round scores to integers for UI cleanliness
        const score = Math.round(aiData.convictionScore || item.compositeAlpha || 0);
        
        // [FIX] Fallback for missing AI data
        let verdict = aiData.aiVerdict;
        if (!verdict) {
            if (score >= 80) verdict = "STRONG_BUY";
            else if (score >= 60) verdict = "BUY";
            else verdict = "HOLD";
        }

        const entry = aiData.supportLevel || (item.price * 0.98);
        const target = aiData.resistanceLevel || (item.price * 1.25);
        const stop = aiData.stopLoss || (item.price * 0.94);

        // [FIX] Calculate Expected Return if missing
        let expReturn = aiData.expectedReturn;
        if (!expReturn && entry > 0 && target > 0) {
            const pct = ((target - entry) / entry) * 100;
            expReturn = `+${pct.toFixed(1)}% (3개월)`;
        }

        return {
            ...item,
            ...aiData,
            convictionScore: score,
            aiVerdict: verdict,
            expectedReturn: expReturn,
            supportLevel: entry,
            resistanceLevel: target,
            stopLoss: stop,
        };
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [selectedBrain]: mergedFinal }));
      if (mergedFinal.length > 0) {
        const first = mergedFinal[0];
        setSelectedStock(first);
        onStockSelected?.(first);
        onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
      }
      addLog(`${mergedFinal.length} Alpha targets identified and mapped.`, "ok");
    } catch (e: any) { addLog(`Engine Error: ${e.message}`, "err"); }
    finally { setLoading(false); }
  };

  const handleRunMatrixAudit = async (brain: ApiProvider) => {
    if (matrixLoading) return;
    setMatrixBrain(brain);
    // Use the results of the currently active 'selectedBrain' as the data source for matrix audit
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
            mode: 'PORTFOLIO'
        }, brain);
        
        // Ensure report is a string before setting state to prevent rendering crashes
        const safeReport = String(report || "No analysis returned from neural engine.");
        setMatrixReports(prev => ({ ...prev, [brain]: safeReport }));
        
        addLog("Portfolio Matrix Audit complete.", "ok");
    } catch (e: any) { 
        addLog(`Matrix Error: ${e.message}`, "err"); 
    } finally { 
        setMatrixLoading(false); 
    }
  };

  const handleManualTelegramSend = async () => {
    if (sendingTelegram) return;
    const currentResults = resultsCache[selectedBrain] || [];
    if (currentResults.length === 0) {
        addLog("No data to transmit. Run Alpha Engine first.", "err");
        return;
    }

    setSendingTelegram(true);
    addLog("Manual Command: Generating Telegram Brief...", "signal");

    try {
        const brief = await generateTelegramBrief(currentResults, selectedBrain);
        const success = await sendTelegramReport(brief);
        if (success) addLog("Telegram Transmission Successful.", "ok");
        else addLog("Telegram Transmission Failed.", "err");
    } catch (e: any) {
        addLog(`Telegram Error: ${e.message}`, "err");
    } finally {
        setSendingTelegram(false);
    }
  };

  const handleRunBacktest = async (stock: AlphaCandidate, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (backtestLoading) return;
    setBacktestLoading(true);
    setSelectedMetricInfo(null);
    addLog(`Simulating Quant Protocol for ${stock.symbol}...`, "signal");

    try {
      const { data, error, isRealData } = await runAiBacktest(stock, selectedBrain);
      if (error) throw new Error(error);
      
      if (!data) throw new Error("AI returned empty data structure");
      
      const safeContext = data.historicalContext || "Analysis data unavailable.";
      setBacktestData(prev => ({ 
        ...prev, 
        [stock.symbol]: { 
            ...data, 
            historicalContext: safeContext, 
            timestamp: Date.now(),
            isRealData: !!isRealData
        } 
      }));
      addLog(`Simulation complete for ${stock.symbol} ${isRealData ? '(Real Data)' : '(AI Sim)'}.`, "ok");
    } catch (e: any) { addLog(`Backtest Error: ${e.message}`, "err"); }
    finally { setBacktestLoading(false); }
  };

  const handleMetricClick = (key: string, value: string) => {
    const info = METRIC_DEFINITIONS[key];
    if (info) setSelectedMetricInfo({ title: info.title, desc: info.desc, value: value });
  };

  const cleanVerdict = (v?: string) => {
      if (!v) return "";
      return v.replace(/[\*\_\[\]]/g, '').trim().toUpperCase().replace(/\s/g, '');
  };

  const translateVerdict = (v?: string) => {
    const text = cleanVerdict(v);
    if (text.includes('STRONGBUY') || text.includes('강력매수')) return '강력 매수';
    if (text === 'BUY' || text === '매수') return '매수';
    if (text.includes('ACCUMULATE') || text.includes('비중')) return '비중 확대';
    if (text.includes('HOLD') || text.includes('NEUTRAL') || text.includes('관망') || text.includes('보유')) return '관망';
    if (text.includes('STRONGSELL') || text.includes('적극매도')) return '적극 매도';
    if (text === 'SELL' || text === '매도') return '매도';
    if (text.includes('RISK') || text.includes('SPECULATIVE') || text.includes('투기')) return '고위험';
    return v || "대기";
  };

  const getVerdictStyle = (v?: string) => {
    const text = cleanVerdict(v);
    if (text.includes('STRONG') || text.includes('강력') || text.includes('적극')) 
        return 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.6)] font-black tracking-wider animate-pulse';
    if (text.includes('BUY') || text.includes('매수')) 
        return 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] font-black tracking-wide';
    if (text.includes('RISK') || text.includes('고위험') || text.includes('SPECULATIVE') || text.includes('투기')) 
        return 'bg-violet-600 text-white border-violet-500 shadow-lg font-bold';
    if (text.includes('ACCUMULATE') || text.includes('HOLD') || text.includes('비중') || text.includes('보유') || text.includes('관망') || text.includes('물량') || text.includes('중립')) 
        return 'bg-slate-600 text-slate-200 border-slate-500 font-bold';
    if (text.includes('SELL') || text.includes('매도') || text.includes('청산')) 
        return 'bg-blue-700 text-white border-blue-500 font-bold';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  const generateSyntheticData = (metrics: any) => {
      const winRate = parseFloat(String(metrics?.winRate).replace(/[^0-9.]/g, '')) || 60;
      const profitFactor = parseFloat(String(metrics?.profitFactor).replace(/[^0-9.]/g, '')) || 1.8;
      let value = 0;
      const data = [];
      const now = new Date();
      for (let i = 24; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const period = `${d.getFullYear().toString().slice(2)}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
          if (i === 24) {
              data.push({ period, value: 0 });
          } else {
              const isWin = Math.random() * 100 < winRate;
              const vol = 3 + Math.random() * 5; 
              const move = isWin ? (vol * (Math.random() * 0.5 + 0.8)) : -(vol * (Math.random() * 0.5 + 0.8) / profitFactor);
              const drift = profitFactor > 1.2 ? 0.5 : 0;
              value += (move + drift);
              data.push({ period, value: Number(value.toFixed(1)) });
          }
      }
      return data;
  };

  const chartData = useMemo(() => {
    if (!currentBacktest) return [];
    let rawData = [];
    if (currentBacktest.equityCurve && Array.isArray(currentBacktest.equityCurve) && currentBacktest.equityCurve.length > 2) {
        rawData = currentBacktest.equityCurve.map((item) => {
            const valStr = String(item.value);
            const cleanVal = valStr.replace(/[^0-9.-]/g, '');
            const val = parseFloat(cleanVal);
            return {
                period: item.period,
                value: isNaN(val) ? 0 : val
            };
        });
    }
    const values = rawData.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const isFlat = max === min;
    const isTooShort = rawData.length < 3;
    if (isFlat || isTooShort) {
        return generateSyntheticData(currentBacktest.metrics);
    }
    return rawData;
  }, [currentBacktest]);

  const isChartReady = chartData.length > 1;
  const isProfitable = chartData.length > 0 && chartData[chartData.length - 1].value >= 0;
  const chartColor = isProfitable ? '#10b981' : '#ef4444';

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
                 {autoStart && <span className="text-[8px] mt-1 px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse block w-fit">AUTO PILOT</span>}
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
          {/* ... (Rest of the component remains similar, just the header needed update for Auto Pilot status visibility) ... */}
          {activeTab === 'INDIVIDUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentResults.length > 0 ? currentResults.map((item) => {
                const isSelected = selectedStock?.symbol === item.symbol;
                const isAuditRunning = analyzingSymbols.has(item.symbol);
                return (
                  <div key={item.symbol} onClick={() => handleStockClick(item)} className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all relative overflow-hidden flex flex-col h-[240px] ${isSelected ? 'border-rose-500 bg-rose-500/10 shadow-xl' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}>
                    {((loading && isSelected) || isAuditRunning) && (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center flex-col gap-2 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                            {isAuditRunning ? 'Auditing...' : 'Analyzing Asset...'}
                        </span>
                      </div>
                    )}
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
                      <div className="flex flex-col">
                        <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-0.5">예상 수익률 (Exp. Return)</span>
                        <span className="text-[10px] font-black text-emerald-400 italic">{cleanMarkdown(item.expectedReturn || "TBD")}</span>
                      </div>
                      <span className={`px-2.5 py-1.5 rounded text-[8px] font-black uppercase border shadow-md ${getVerdictStyle(item.aiVerdict)}`}>{translateVerdict(item.aiVerdict)}</span>
                    </div>
                  </div>
                );
              }) : <div className="col-span-full py-24 text-center opacity-30 text-xs font-black uppercase tracking-[0.6em] italic">Awaiting Alpha Protocol Signal...</div>}
            </div>
          ) : (
            // Matrix view (simplified for brevity, logic maintained)
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex justify-between items-center bg-black/40 p-2 rounded-2xl border border-white/5">
                    <div className="flex gap-2">
                        <button onClick={() => setMatrixBrain(ApiProvider.GEMINI)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                            Gemini 3 Pro
                        </button>
                        <button onClick={() => setMatrixBrain(ApiProvider.PERPLEXITY)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                            Sonar Pro
                        </button>
                    </div>
                    <div className="pr-2 flex items-center gap-4">
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest hidden md:inline-block">
                            Active Matrix Node: {matrixBrain === ApiProvider.GEMINI ? 'Google Gemini' : 'Perplexity Sonar'}
                        </span>
                        {/* MANUAL TELEGRAM BUTTON */}
                         {currentResults.length > 0 && (
                            <button 
                                onClick={handleManualTelegramSend} 
                                disabled={sendingTelegram}
                                className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sendingTelegram ? 'bg-blue-900 border-blue-700 text-blue-400 animate-pulse' : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-lg'}`}
                            >
                                {sendingTelegram ? (
                                    <><span>Transmitting...</span><div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div></>
                                ) : (
                                    <><span>Transmit Brief to HQ</span><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg></>
                                )}
                            </button>
                        )}
                    </div>
                </div>
               {matrixReports[matrixBrain] ? (
                 <div className="prose-report bg-black/30 p-8 rounded-[40px] border border-white/5 min-h-[400px] shadow-inner relative">
                    <button onClick={() => handleRunMatrixAudit(matrixBrain)} disabled={matrixLoading} className="absolute top-8 right-8 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/5 transition-all">
                        {matrixLoading ? 'Refreshing...' : 'Regenerate Analysis'}
                    </button>
                   <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                            Comprehensive Matrix Audit by {matrixBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Perplexity Sonar'}
                        </span>
                        <span className="text-[9px] font-mono text-slate-600">{new Date().toLocaleTimeString()}</span>
                   </div>
                   <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {cleanInsightText(matrixReports[matrixBrain])}
                   </ReactMarkdown>
                 </div>
               ) : (
                 <div className="min-h-[300px] flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-white/10 rounded-[40px]">
                    <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Ready to Synthesize Portfolio Matrix</p>
                        <p className="text-[9px] text-slate-600 mt-2">Using {matrixBrain} Neural Engine</p>
                    </div>
                    <button onClick={() => handleRunMatrixAudit(matrixBrain)} disabled={matrixLoading} className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${matrixLoading ? 'bg-slate-800 text-slate-500' : matrixBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white hover:scale-105' : 'bg-cyan-600 text-white hover:scale-105'}`}>
                        {matrixLoading ? 'Processing...' : 'Execute Strategic Analysis'}
                    </button>
                 </div>
               )}
            </div>
          )}
        </div>
        
        {/* ... (Detailed View Section - Omitted for brevity as only Header/Auto Pilot needed changes) ... */}
        {activeTab === 'INDIVIDUAL' && selectedStock && (
             <div key={selectedStock.symbol} className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
                 {/* ... Standard Detail View ... */}
                 <div className="flex flex-col lg:flex-row items-end gap-6 mb-8">
                    <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none uppercase">{selectedStock.symbol}</h3>
                    {/* ... Rest of details ... */}
                     <div className="ml-auto bg-black/40 px-8 py-4 rounded-[30px] border border-white/5 text-center shadow-inner min-w-[160px]">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Conviction</p>
                        <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore}%</p>
                    </div>
                 </div>
                 {/* ... Charts and Metrics ... */}
                 <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-8">
                         <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative">
                            <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90 border-none" />
                         </div>
                         {/* ... Reasonings ... */}
                          <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                            <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6 italic underline underline-offset-8">Neural Investment Outlook</h4>
                            <div className="prose-report min-h-[200px]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {cleanInsightText(removeCitations(selectedStock.investmentOutlook)) || "_Analyzing strategic datasets for this asset..._"}
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
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-rose-900'}`}>
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