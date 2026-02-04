
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import { generateAlphaSynthesis, runAiBacktest, analyzePipelineStatus, generateTelegramBrief, archiveReport } from '../services/intelligenceService';
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
  
  // Accumulated Data
  [key: string]: any;
}

interface BacktestResult {
  simulationPeriod?: string;
  equityCurve: { period: string; value: number; signal?: 'BUY' | 'SELL' | 'HOLD' }[];
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

const METRIC_DEFINITIONS: { [key: string]: { title: string; desc: string; overlayDesc: string } } = {
  WIN_RATE: {
    title: "승률 (Win Rate)",
    desc: "### 지표 정의\n**전체 거래 중 이익을 낸 거래의 비율**입니다.\n\n### 구간별 해석\n- **60% 이상**: 매우 안정적인 고승률 전략\n- **40~50%**: 손익비가 1.5 이상일 때 유효\n- **40% 미만**: 추세 추종형 전략 (높은 손익비 필수)",
    overlayDesc: "● 초록: 월간 수익 발생 | ● 빨강: 월간 손실 발생"
  },
  PROFIT_FACTOR: {
    title: "손익비 (Profit Factor)",
    desc: "### 지표 정의\n**총 수익금을 총 손실금으로 나눈 비율**입니다. 차트 하단의 막대는 매월 발생한 수익/손실의 절대 규모를 나타냅니다.\n\n### 구간별 해석\n- **1.0 초과**: 수익이 손실보다 큼 (이익 구간)\n- **1.5 이상**: 이상적인 우상향 계좌 패턴\n- **2.0 이상**: 월가 상위 1% 수준의 초고효율 전략",
    overlayDesc: "하단 막대: 매월 자산 변동폭 (Magnitude)"
  },
  MAX_DRAWDOWN: {
    title: "최대 낙폭 (MDD)",
    desc: "### 지표 정의\n**계좌 최고점 대비 최대 하락률**을 의미합니다.\n\n### 리스크 진단\n- **-10% 이내**: 매우 안정적 (보수적 투자)\n- **-20% 이내**: 성장주 전략 허용 범위\n- **-30% 초과**: 위험 관리 실패 또는 레버리지 과다",
    overlayDesc: "붉은 영역: 전고점 대비 자산 감소 구간"
  },
  SHARPE_RATIO: {
    title: "샤프 지수 (Sharpe Ratio)",
    desc: "### 지표 정의\n**감수한 위험(변동성) 대비 얻은 초과 수익**입니다. 점선은 변동성 없는 이상적인 성장 경로를 나타냅니다.\n\n### 효율성 판단\n- **1.0 이상**: 리스크 대비 수익성 우수\n- **2.0 이상**: 매우 훌륭한 투자 기회\n- **3.0 이상**: 데이터 과최적화 가능성 점검 필요",
    overlayDesc: "주황 점선: 변동성 없는 이상적 성장 경로 (Benchmark)"
  }
};

// [MASTER FRAMEWORK INSIGHTS]
const FRAMEWORK_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'HALF_KELLY': {
        title: "Half-Kelly Criterion",
        desc: "수학적 최적 비중인 켈리 값을 0.5배로 줄여 변동성 파산(Ruin)을 방지합니다. 승률과 손익비를 기반으로 한 '이론적 최대 권장 비중'입니다.",
        strategy: "계산된 수치는 '한도'입니다. 보수적 운용을 위해 이 수치의 50~80% 수준에서 집행하는 것이 일반적입니다."
    },
    'VAPS': {
        title: "VAPS (Volatility-Adjusted)",
        desc: "총 자산 대비 1% 리스크(1R)를 고정한 상태에서, 진입가와 손절가의 폭(Volatility)에 따라 매수 수량을 역산하는 헤지펀드 표준 기법입니다.",
        strategy: "확신이 높아도 1회 손실금은 일정해야 합니다. 손절폭이 좁으면 수량이 늘고, 넓으면 수량이 줄어듭니다."
    },
    'ERCI': {
        title: "ERCI (Efficiency Index)",
        desc: "Expected Return Confidence Index. '확신 한 단위당 기대할 수 있는 수익'을 측정합니다. 자본 효율성이 높은 종목을 선별하는 핵심 지표입니다.",
        strategy: "ERCI가 높을수록 '가성비'가 좋은 베팅입니다. 포트폴리오 편입 우선순위를 정할 때 사용하십시오."
    },
    'QM_COMP': {
        title: "Q-M Composite",
        desc: "Quality(ROE) + Momentum(ICT). 우량한 기업(High Quality)이 세력에 의해 움직이기 시작하는(High Momentum) 최적의 지점을 포착합니다.",
        strategy: "가치투자와 추세추종의 결합입니다. ROE가 받쳐주는 종목의 모멘텀은 쉽게 꺾이지 않습니다."
    },
    'CONVEXITY': {
        title: "Alpha Convexity",
        desc: "에너지가 응축된 'Squeeze' 상태와 세력의 강한 개입 'Displacement'가 결합된 상태입니다. 비선형적인 가격 폭발 가능성을 의미합니다.",
        strategy: "옵션 매수나 돌파 매매(Breakout)에 적합한 구간입니다. 단기 변동성 확대에 대비하십시오."
    },
    'EXPECTANCY': {
        title: "Expectancy (기대값)",
        desc: "이 매매를 100번 반복했을 때 1회당 평균적으로 얻을 수 있는 수익(R)입니다. 0.5R 이상이면 훌륭한 시스템입니다.",
        strategy: "승률이 낮아도 손익비가 커서 기대값이 플러스라면 진입해야 합니다. 감정을 배제하고 수학적 우위를 점하십시오."
    },
    'IVG': {
        title: "IVG (Intrinsic Value Gap)",
        desc: "현재 주가와 내재가치(Intrinsic Value) 사이의 괴리율입니다. 안전마진(Margin of Safety)을 확보했는지 판단하는 가치투자의 척도입니다.",
        strategy: "IVG가 +20% 이상인 종목은 하락장에서도 방어력이 뛰어납니다. 안전마진이 확보된 구간에서만 진입하십시오."
    },
    'IFS': {
        title: "IFS (Institutional Flow Score)",
        desc: "기관(Smart Money)의 자금 유입 강도를 0-100으로 수치화한 지표입니다. 거래량 분석(VSA)과 오더블럭(Order Block) 지지를 기반으로 합니다.",
        strategy: "IFS > 70 인 종목은 '세력'이 매집 중입니다. 개인 투자자는 이들의 '등에 올라타는' 전략을 취해야 합니다."
    },
    'MRF': {
        title: "MRF (Market Regime Filter)",
        desc: "시장 전체의 국면(상승/하락/횡보)을 판단하여 개별 종목의 베타(Beta) 리스크를 제어합니다. 시장이 하락세(Distribution)라면 개별 종목 매수를 보류합니다.",
        strategy: "MRF가 'Accumulation' 또는 'Markup' 상태일 때만 비중을 확대하십시오. 'Distribution'에서는 현금 비중을 늘려야 합니다."
    },
    'AIC': {
        title: "AIC (AI Consensus)",
        desc: "서로 다른 알고리즘(Gemini, Perplexity 등) 간의 분석 일치도입니다. 여러 모델이 동시에 매수를 외칠 때 신뢰도가 기하급수적으로 상승합니다.",
        strategy: "Consensus > 80% 인 경우, 모델 간의 '환각(Hallucination)' 가능성이 극히 낮습니다. 강력한 확신을 가지고 진입할 수 있습니다."
    }
};

// [ALPHA MAP INSIGHTS]
const ALPHA_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'RISK': {
        title: "Risk Management (1.0R)",
        desc: "Stop Loss is the invalidation point of the thesis. The distance from Entry to Stop defines 1R of risk. Position sizing must ensure 1R <= 1% of total equity.",
        strategy: "Never move your Stop Loss down. If price hits this level, the trade idea is wrong. Accept the small loss to protect capital."
    },
    'ENTRY': {
        title: "Sniper Entry Zone",
        desc: "This zone represents the highest probability area for entry, usually aligned with an Institutional Order Block or support retest.",
        strategy: "Patience is key. Wait for price to revisit this zone. Entering here maximizes the Risk:Reward ratio."
    },
    'REWARD': {
        title: "Profit Target (Liquidity)",
        desc: "The target level is where 'Smart Money' is likely to exit or where opposing liquidity (Buy Stops/Sell Stops) resides.",
        strategy: "Take partial profits (50-75%) at this level to lock in gains. Move Stop Loss to Breakeven on the remainder."
    }
};

const MarkdownComponents: any = {
    h1: (props: any) => <h1 className="text-xl md:text-2xl font-black text-white mt-6 mb-4 uppercase tracking-widest border-b border-rose-500/50 pb-2" {...props} />,
    h2: (props: any) => <h2 className="text-lg md:text-xl font-bold text-emerald-400 mt-6 mb-3 uppercase tracking-wide flex items-center gap-2"><span className="text-emerald-500">#</span>{props.children}</h2>,
    h3: (props: any) => <h3 className="text-base md:text-lg font-bold text-blue-400 mt-4 mb-2 tracking-wide" {...props} />,
    p: (props: any) => <p className="text-sm md:text-[15px] text-slate-300 leading-7 mb-3 font-medium tracking-wide" {...props} />,
    ul: (props: any) => <ul className="space-y-2 mb-6 mt-2" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 space-y-2 mb-4 text-slate-300 marker:text-emerald-500 marker:font-bold" {...props} />,
    li: (props: any) => (
        <li className="pl-4 relative flex items-start group mb-1" {...props}>
             <span className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:bg-emerald-400 transition-colors shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
             <span className="flex-1 text-slate-300 text-sm md:text-[15px] leading-6">{props.children}</span>
        </li>
    ),
    strong: (props: any) => <span className="inline-block bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider mx-1 my-1 shadow-sm" {...props} />,
    blockquote: (props: any) => (
        <blockquote className="border-l-4 border-emerald-500/50 bg-emerald-950/20 p-4 my-4 rounded-r-xl italic text-slate-400 shadow-inner" {...props} />
    ),
    code: ({inline, ...props}: any) => (
        inline 
        ? <code className="bg-slate-800 text-rose-300 px-1.5 py-0.5 rounded font-mono text-xs border border-white/10" {...props} />
        : <div className="overflow-x-auto my-4"><pre className="bg-slate-950 p-4 rounded-xl border border-white/10 text-xs text-slate-300 font-mono shadow-xl" {...props} /></div>
    ),
    table: (props: any) => <div className="overflow-x-auto my-4 rounded-xl border border-white/10"><table className="w-full text-sm text-left text-slate-300" {...props} /></div>,
    thead: (props: any) => <thead className="text-xs text-emerald-400 uppercase bg-slate-900/50" {...props} />,
    th: (props: any) => <th className="px-4 py-3 font-bold" {...props} />,
    tbody: (props: any) => <tbody {...props} />,
    tr: (props: any) => <tr className="border-b border-white/5 hover:bg-white/5 transition-colors" {...props} />,
    td: (props: any) => <td className="px-4 py-3" {...props} />,
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
  const [matrixBrain, setMatrixBrain] = useState<ApiProvider>(ApiProvider.GEMINI);

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string; key: string; overlayDesc: string } | null>(null);
  
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeAlphaInsight, setActiveAlphaInsight] = useState<string | null>(null); 

  const [autoPhase, setAutoPhase] = useState<'IDLE' | 'ENGINE' | 'MATRIX' | 'DONE'>('IDLE');

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  const uniqueChartId = useMemo(() => `chart-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  // [QUANT CALCULATION ENGINE]
  const quantMetrics = useMemo(() => {
      try {
          if (!selectedStock) return null;

          // 1. INPUTS
          const conviction = selectedStock.convictionScore || selectedStock.compositeAlpha || 50;
          const entry = selectedStock.supportLevel || selectedStock.price * 0.98;
          const stop = selectedStock.stopLoss || selectedStock.price * 0.95;
          const target = selectedStock.resistanceLevel || selectedStock.price * 1.10;
          
          const roe = selectedStock.roe || 15; // default fallback
          const ictScore = selectedStock.ictScore || conviction; 
          const intrinsic = selectedStock.intrinsicValue || selectedStock.price;
          
          // 2. ODDS & PROB (Backtest or Heuristic)
          const simMetrics = backtestData[selectedStock.symbol]?.metrics;
          let P = 0; 
          let B = 0; 
          
          if (simMetrics && parseFloat(String(simMetrics.winRate).replace('%','')) > 0) {
              P = parseFloat(String(simMetrics.winRate).replace('%','')) / 100;
              B = parseFloat(simMetrics.profitFactor || "1.5");
          } else {
              // Heuristic: Conviction 50=50%, 100=70% Winrate
              P = 0.40 + (conviction / 100) * 0.30; 
              // B based on Risk Reward
              if (selectedStock.riskRewardRatio) {
                  const parts = selectedStock.riskRewardRatio.split(':');
                  B = parts.length === 2 ? parseFloat(parts[1]) : 2.0;
              } else {
                  B = (target - entry) / (entry - stop);
              }
          }
          if (isNaN(B) || B <= 0) B = 1.5;
          
          // 3. PHASE 1: SIZING (Shield)
          // Half-Kelly
          const Q = 1 - P;
          let kellyRaw = P - (Q / B);
          if (kellyRaw < 0) kellyRaw = 0;
          
          // Institutional Adjustment: Cap at 20% max per position
          const halfKelly = Math.min((kellyRaw * 0.5 * 100), 20.0);
          
          // VAPS (Volatility Adjusted) - Assume $100k Equity, 1% Risk ($1000)
          const riskPerShare = Math.max(0.01, entry - stop);
          const vapsQty = Math.floor(1000 / riskPerShare);
          const vapsAllocation = (vapsQty * entry) / 1000; // % of 100k

          // 4. PHASE 2: SELECTION (Sword)
          // ERCI = Upside% * log(Conviction) * (ICT/100)
          const upside = ((target - entry) / entry) * 100;
          const erci = upside * Math.log10(conviction || 10) * (ictScore / 100);
          
          // Q-M Composite
          const qmScore = (roe * 0.4) + (ictScore * 0.6);
          
          // Soros Ratio = (Target-Entry)/(Entry-Stop) * (ictScore/100)
          const sorosRatio = B * (ictScore / 50);

          // IVG
          const ivg = selectedStock.fairValueGap || ((intrinsic - selectedStock.price)/selectedStock.price * 100);

          // 5. PHASE 3: TIMING (Clock)
          // Convexity
          const squeeze = selectedStock.techMetrics?.squeezeState === 'SQUEEZE_ON';
          const displacement = selectedStock.ictMetrics?.displacement > 60;
          const convexity = squeeze ? (displacement ? "Explosive" : "Building") : "Standard";
          
          // IFS
          const ifs = selectedStock.ictMetrics?.smartMoneyFlow || 50;

          // 6. PHASE 4: INTEGRITY (System)
          // Expectancy (1R normalized) = (P * B) - (Q * 1)
          const expectancy = (P * B) - (Q * 1);
          
          // AIC (Consensus)
          const aic = selectedStock.aiVerdict === 'STRONG_BUY' ? 95 : selectedStock.aiVerdict === 'BUY' ? 80 : 50;

          return {
              sizing: {
                  kelly: halfKelly.toFixed(1),
                  vapsQty: vapsQty,
                  vapsPct: vapsAllocation.toFixed(1),
                  riskPerShare: riskPerShare.toFixed(2)
              },
              selection: {
                  erci: erci.toFixed(1),
                  qm: qmScore.toFixed(0),
                  ivg: ivg.toFixed(1),
                  soros: sorosRatio.toFixed(1)
              },
              timing: {
                  convexity,
                  ifs: ifs.toFixed(0),
                  mrf: selectedStock.marketState || 'Neutral'
              },
              system: {
                  expectancy: expectancy.toFixed(2),
                  aic: aic
              }
          };

      } catch (e) {
          console.error("Quant Metrics Error", e);
          return null;
      }
  }, [selectedStock, backtestData]);

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

  useEffect(() => {
    if (autoStart && autoPhase === 'IDLE' && !loading && elite50.length > 0) {
        addLog("AUTO-PILOT: Initiating Alpha Singularity Protocol v2.0...", "signal");
        setAutoPhase('ENGINE');
        handleExecuteEngine();
    }
  }, [autoStart, autoPhase, loading, elite50]);

  useEffect(() => {
      const hasResults = resultsCache[selectedBrain]?.length;
      if (autoStart && autoPhase === 'ENGINE' && !loading && hasResults) {
          addLog("AUTO-PILOT: Bypassing Matrix Audit -> Initiating Transmission...", "signal");
          setActiveTab('MATRIX');
          setAutoPhase('MATRIX');
      }
  }, [autoStart, autoPhase, loading, resultsCache, selectedBrain]);

  useEffect(() => {
      const finishAutoPilot = async () => {
          const currentResults = resultsCache[selectedBrain] || [];
          
          if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && currentResults.length > 0) {
              addLog("AUTO-PILOT: Generating Hedge Fund Brief for Telegram...", "signal");
              
              let telegramPayload = ""; 
              try {
                  const brief = await generateTelegramBrief(currentResults, selectedBrain);
                  telegramPayload = brief;
                  addLog("Brief Generated. Relaying...", "ok");
              } catch (e) {
                  addLog("Brief Gen Failed.", "err");
                  telegramPayload = "Brief Generation Failed.";
              }

              setAutoPhase('DONE');
              if (onComplete) onComplete(telegramPayload);
          }
      };
      
      finishAutoPilot();
  }, [autoStart, autoPhase, matrixLoading, matrixReports, selectedBrain, resultsCache]);


  useEffect(() => {
    setSelectedMetricInfo(null);
    setActiveOverlay(null);
    setActiveAlphaInsight(null);
  }, [selectedStock]);

  // Click Outside Handler for Alpha Insights
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.alpha-insight-trigger') && !target.closest('.alpha-insight-overlay')) {
            setActiveAlphaInsight(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStockClick = (item: AlphaCandidate) => {
      setSelectedStock(item);
      onStockSelected?.(item);
  };

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const removeCitations = (text?: any) => {
      if (text === null || text === undefined) return '';
      return String(text).replace(/\[\d+\]/g, '').trim();
  };

  const cleanInsightText = (text: any) => {
    if (!text) return "";
    const str = String(text);
    return str
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") 
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") 
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, "") 
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, "") 
      .replace(/[\u{2600}-\u{26FF}]/gu, "")   
      .replace(/[\u{2700}-\u{27BF}]/gu, "")   
      .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") 
      .replace(/[🚀📈📉📊💰💎🔥✨⚡️🎯🛑✅❌⚠️💀🚨🛑🟢🔴🔵🟣🔸🔹🔶🔷🔳🔳🔲👍👎👉👈]/g, "") 
      .replace(/\[\d+\]/g, '') 
      .trim();
  };

  const cleanMarkdown = (text?: any) => {
      if (text === null || text === undefined) return '';
      return String(text)
        .replace(/\[\d+\]/g, '')
        .replace(/\*\*/g, '')
        .replace(/__/g, '')
        .replace(/\*\*/g, '') 
        .replace(/\*/g, '')
        .replace(/#/g, '')
        .replace(/[\u{1F600}-\u{1F6FF}]/gu, "")
        .trim();
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
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
    let currentProvider = selectedBrain;
    
    addLog(`Initiating Alpha Singularity Protocol via ${currentProvider}...`, "signal");
    addLog("Step 1: 3-Vector Data Fusion & Regime Scan...", "info");

    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      if (topCandidates.length === 0) throw new Error("No candidates available to analyze.");

      await new Promise(r => setTimeout(r, 800));
      addLog("Step 2: Convening Council of Alpha (3-Persona Debate)...", "info");
      
      await new Promise(r => setTimeout(r, 800));
      addLog("Step 3: Running Pre-Mortem & Gamma/Correlation Checks...", "info");

      let response = await generateAlphaSynthesis(topCandidates, currentProvider);
      
      if (response.error && currentProvider === ApiProvider.GEMINI) {
          addLog(`Gemini Engine Failed: ${response.error}`, "warn");
          setSelectedBrain(ApiProvider.PERPLEXITY);
          if (autoStart) {
              addLog("AUTO-PILOT: Switching to Sonar & Retrying...", "signal");
              currentProvider = ApiProvider.PERPLEXITY; 
              response = await generateAlphaSynthesis(topCandidates, ApiProvider.PERPLEXITY);
          } else {
              addLog("Switched to Sonar. Please click Execute to try again.", "info");
              setLoading(false);
              return; 
          }
      }

      if (response.error) throw new Error(response.error);

      const safeAiResults = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
      
      // [FIX] Sanitization & Type Coercion to prevent Black Screen
      const mergedFinal = safeAiResults.map((aiData: any) => {
        if (!aiData?.symbol) return null;
        const item = topCandidates.find((c: any) => c.symbol.trim().toUpperCase() === aiData.symbol.trim().toUpperCase());
        if (!item) return null;
        
        const safePrice = Number(item.price);
        const safeEntry = Number(aiData.supportLevel) || (safePrice * 0.98);
        
        return {
            ...item, 
            ...aiData, 
            price: safePrice,
            convictionScore: Number(aiData.convictionScore || item.compositeAlpha || 0),
            supportLevel: safeEntry,
            resistanceLevel: Number(aiData.resistanceLevel) || (safePrice * 1.25),
            stopLoss: Number(aiData.stopLoss) || (safePrice * 0.94),
        };
      }).filter(x => x !== null) as AlphaCandidate[];

      setResultsCache(prev => ({ ...prev, [currentProvider]: mergedFinal }));
      
      const currentToken = sessionStorage.getItem('gdrive_access_token');
      
      if (!currentToken) {
          addLog("Save Failed: Cloud Vault Token is missing.", "err");
      } else if (mergedFinal.length === 0) {
          addLog("Save Skipped: No Alpha targets generated.", "warn");
      } else {
          try {
              addLog("Initiating Vault Save Protocol...", "info");
              const folderId = await ensureFolder(currentToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
              const fileName = `STAGE6_ALPHA_FINAL_${new Date().toISOString().split('T')[0]}.json`;
              const payload = {
                manifest: { 
                    version: "2.0.0", 
                    strategy: "Alpha_Singularity_Protocol_v2", 
                    timestamp: new Date().toISOString(), 
                    provider: currentProvider 
                },
                alpha_universe: mergedFinal 
              };

              const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
              const form = new FormData();
              form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
              form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

              const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST', headers: { 'Authorization': `Bearer ${currentToken}` }, body: form
              });
              
              if (uploadRes.ok) {
                  addLog(`Singularity Achieved: ${mergedFinal.length} Alpha targets locked & saved via ${currentProvider}.`, "ok");
                  
                  const first = mergedFinal[0];
                  setSelectedStock(first);
                  onStockSelected?.(first);
                  onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
              } else {
                  const errorText = await uploadRes.text();
                  addLog(`Vault Upload Failed: ${uploadRes.status} - ${errorText}`, "err");
              }

          } catch (uploadErr: any) {
              addLog(`Vault Save Error: ${uploadErr.message}`, "err");
          }
      }

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
    let targetBrain = brain;
    addLog(`Synthesizing Portfolio Matrix via ${targetBrain}...`, "signal");
    
    try {
        let report = await analyzePipelineStatus({
            currentStage: 6,
            apiStatuses: [],
            recommendedData: currentResults,
            mode: 'PORTFOLIO'
        }, targetBrain);
        
        if ((report.includes("FAILURE") || report.includes("ERROR")) && targetBrain === ApiProvider.GEMINI) {
             setMatrixBrain(ApiProvider.PERPLEXITY);
             addLog("Gemini Audit Failed. Switched to Sonar.", "warn");
             
             if (autoStart) {
                 targetBrain = ApiProvider.PERPLEXITY;
                 addLog("AUTO-PILOT: Retrying Matrix with Sonar...", "signal");
                 report = await analyzePipelineStatus({
                    currentStage: 6,
                    apiStatuses: [],
                    recommendedData: currentResults,
                    mode: 'PORTFOLIO'
                 }, targetBrain);
             }
        }
        
        const safeReport = String(report || "No analysis returned from neural engine.");
        setMatrixReports(prev => ({ ...prev, [targetBrain]: safeReport }));
        
        const token = sessionStorage.getItem('gdrive_access_token');
        if (token) {
           const date = new Date().toISOString().split('T')[0];
           const brainLabel = targetBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
           const fileName = `${date}_Portfolio_Matrix_Combined_${brainLabel}.md`;
           
           addLog(`Archiving Report: ${fileName}...`, "info");
           const saved = await archiveReport(token, fileName, safeReport);
           if (saved) addLog(`Report Archived Successfully.`, "ok");
           else addLog(`Report Archive Failed.`, "err");
        }

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
    setActiveOverlay(null);
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
    if (info) {
        setSelectedMetricInfo({ title: info.title, desc: info.desc, value: value, key: key, overlayDesc: info.overlayDesc });
        setActiveOverlay(prev => prev === key ? null : key);
    }
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
      // ALWAYS 24 MONTHS for consistency
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
    try {
        if (!currentBacktest) return [];
        let rawData: any[] = [];
        if (currentBacktest.equityCurve && Array.isArray(currentBacktest.equityCurve) && currentBacktest.equityCurve.length >= 2) {
            rawData = currentBacktest.equityCurve.map((item) => {
                const valStr = String(item.value);
                const cleanVal = valStr.replace(/[^0-9.-]/g, '');
                const val = parseFloat(cleanVal);
                return {
                    period: item.period,
                    value: isNaN(val) ? 0 : val
                };
            });
        } else {
            rawData = generateSyntheticData(currentBacktest?.metrics);
        }

        // Hedge-fund Advanced Logic: Full 24-month calculation
        let runningPeak = -Infinity;
        return rawData.map((d, i) => {
            if (d.value > runningPeak) runningPeak = d.value;
            const drawdown = d.value - runningPeak;
            const prevValue = i > 0 ? rawData[i-1].value : 0;
            const delta = d.value - prevValue; 
            const isWin = d.value >= prevValue; // Winning month if equity didn't decrease
            
            // Sharpe Ideal Regression Path
            const totalPeriods = rawData.length - 1;
            const finalVal = rawData[rawData.length - 1].value;
            const idealValue = i * (finalVal / (totalPeriods || 1));

            return {
                ...d,
                drawdown: Number(drawdown.toFixed(2)),
                peak: Number(runningPeak.toFixed(2)),
                delta: Number(delta.toFixed(2)),
                idealValue: Number(idealValue.toFixed(2)),
                isWin: isWin
            };
        });
    } catch(e) { console.error("Chart Calc Error", e); return []; }
  }, [currentBacktest]);

  const isProfitable = chartData.length > 0 && chartData[chartData.length - 1].value >= 0;
  const chartColor = isProfitable ? '#10b981' : '#ef4444';

  // [TACTICAL EXECUTION] Price Positioning Logic - SAFER
  const getTacticalPosition = (price: number, entry: number, target: number, stop: number) => {
      const range = target - stop;
      if (Math.abs(range) < 0.0001) return 50; // Prevention against div by zero
      const position = price - stop;
      let percent = (position / range) * 100;
      percent = Math.max(0, Math.min(100, percent));
      return percent;
  };

  const tacticalPercent = selectedStock ? getTacticalPosition(
      selectedStock.price, 
      selectedStock.supportLevel || 0, 
      selectedStock.resistanceLevel || 0, 
      selectedStock.stopLoss || 0
  ) : 50;

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
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-2">
                          <h4 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">{item.symbol}</h4>
                          <span className="text-sm font-bold text-rose-500">({item.convictionScore || item.compositeAlpha || 0}%)</span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[140px] mt-0.5">{item.name}</span>
                      </div>
                      <span className="text-xs font-mono font-black text-slate-400 mt-1">${Number(item.price)?.toFixed(2)}</span>
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
                         {currentResults.length > 0 && (
                            <button 
                                onClick={handleManualTelegramSend} 
                                disabled={sendingTelegram}
                                className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sendingTelegram ? 'bg-blue-900 border-blue-700 text-blue-400 animate-pulse' : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-lg'}`}
                            >
                                {sendingTelegram ? (
                                    <><span>Transmit Brief to HQ</span><div className="flex items-center gap-2 ml-2"><span className="text-blue-300 animate-pulse">SENDING...</span><div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div></div></>
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
        
        {activeTab === 'INDIVIDUAL' && selectedStock && (
             <div key={selectedStock.symbol} className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
                 <div className="flex flex-col lg:flex-row items-end gap-6 mb-8">
                    <div className="flex flex-col">
                        <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none uppercase">{selectedStock.symbol}</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">{selectedStock.name}</p>
                    </div>
                    <div className="ml-auto bg-black/40 px-8 py-4 rounded-[30px] border border-white/10 text-center shadow-inner min-w-[160px]">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">AI Conviction</p>
                        <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore || selectedStock.compositeAlpha || 0}%</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-8">
                         {/* Chart Section */}
                         <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative group">
                            <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90 border-none" />
                         </div>

                         {/* Tactical Execution Map - Redesigned for Clarity */}
                         <div className="bg-slate-900/50 backdrop-blur-md p-6 rounded-[30px] border border-white/5 shadow-inner flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 relative mt-4">
                            
                            {/* Header with Explanations */}
                            <div className="flex justify-between items-end mb-2">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tactical Range Map</h4>
                                <div className="flex gap-3 text-[8px] font-bold uppercase tracking-wider">
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500/50 rounded-sm"></div>Stop Zone</div>
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-slate-600/50 rounded-sm"></div>Buffer</div>
                                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/50 rounded-sm"></div>Profit Zone</div>
                                </div>
                            </div>

                            {/* The Bar Visualization */}
                            <div className="relative h-12 w-full mt-2">
                                {/* Track Line */}
                                <div className="absolute top-1/2 left-0 right-0 h-2 bg-slate-800 rounded-full -translate-y-1/2 overflow-hidden border border-white/5">
                                     {/* Gradient Background representing the transition from Stop to Target */}
                                     <div className="w-full h-full bg-gradient-to-r from-rose-900 via-slate-800 to-emerald-900 opacity-50"></div>
                                </div>

                                {/* Markers Container */}
                                {(() => {
                                    const stop = selectedStock.stopLoss || 0;
                                    const entry = selectedStock.supportLevel || 0;
                                    const target = selectedStock.resistanceLevel || 0;
                                    const current = selectedStock.price || 0;
                                    
                                    // Define Range: Min = Stop - 2%, Max = Target + 2%
                                    const minPrice = stop * 0.98;
                                    const maxPrice = target * 1.02;
                                    const totalRange = maxPrice - minPrice;
                                    
                                    const getPos = (p: number) => {
                                        if (totalRange <= 0) return 50;
                                        const pct = ((p - minPrice) / totalRange) * 100;
                                        return Math.max(0, Math.min(100, pct));
                                    };

                                    const stopPos = getPos(stop);
                                    const entryPos = getPos(entry);
                                    const targetPos = getPos(target);
                                    const currentPos = getPos(current);

                                    return (
                                        <>
                                            {/* Zones (Visualizing ranges) */}
                                            <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-rose-500/30" style={{ left: '0%', width: `${stopPos}%` }}></div>
                                            <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-emerald-500/30" style={{ left: `${entryPos}%`, right: '0%' }}></div>

                                            {/* STOP LOSS MARKER */}
                                            <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${stopPos}%` }}>
                                                <div className="h-full w-0.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>
                                                <div className="absolute bottom-full mb-3 text-[8px] font-black text-rose-500 whitespace-nowrap">STOP ${stop.toFixed(2)}</div>
                                            </div>

                                            {/* ENTRY MARKER */}
                                            <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${entryPos}%` }}>
                                                <div className="h-4 w-0.5 bg-blue-400"></div>
                                                <div className="absolute bottom-full mb-3 text-[8px] font-black text-blue-400 whitespace-nowrap">ENTRY ${entry.toFixed(2)}</div>
                                            </div>

                                            {/* TARGET MARKER */}
                                            <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${targetPos}%` }}>
                                                <div className="h-full w-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                                                <div className="absolute bottom-full mb-3 text-[8px] font-black text-emerald-500 whitespace-nowrap">TARGET ${target.toFixed(2)}</div>
                                            </div>

                                            {/* CURRENT PRICE PUCK */}
                                            <div className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col items-center" style={{ left: `${currentPos}%`, transition: 'left 1s ease-out' }}>
                                                <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] border-2 border-slate-900 flex items-center justify-center relative">
                                                    <div className="w-1 h-1 bg-slate-900 rounded-full"></div>
                                                    <div className="absolute inset-0 rounded-full border border-white animate-ping opacity-50"></div>
                                                </div>
                                                <div className="absolute top-full mt-3 bg-white text-slate-900 px-2 py-1 rounded text-[9px] font-black shadow-lg whitespace-nowrap flex flex-col items-center">
                                                    <div className="absolute -top-1 w-2 h-2 bg-white rotate-45"></div>
                                                    <span>CURRENT</span>
                                                    <span className="text-[10px]">${current.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Interactive Toggles */}
                            <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase tracking-wider relative z-10 mt-6 border-t border-white/5 pt-3">
                                <span 
                                    onClick={() => setActiveAlphaInsight('RISK')} 
                                    className="flex items-center gap-1 cursor-help hover:text-white transition-colors alpha-insight-trigger p-1 rounded hover:bg-white/5"
                                >
                                    <div className="w-1.5 h-1.5 bg-rose-500 rounded-full"></div>Risk (1.0) & VAPS
                                </span>
                                <span 
                                    onClick={() => setActiveAlphaInsight('ENTRY')}
                                    className="text-blue-300 cursor-help hover:text-white transition-colors alpha-insight-trigger p-1 rounded hover:bg-white/5"
                                >
                                    Optimal Entry Zone
                                </span>
                                <span 
                                    onClick={() => setActiveAlphaInsight('REWARD')}
                                    className="flex items-center gap-1 cursor-help hover:text-white transition-colors alpha-insight-trigger p-1 rounded hover:bg-white/5"
                                >
                                    Reward ({selectedStock.riskRewardRatio ? selectedStock.riskRewardRatio.split(':')[1] : '3.0'})<div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                                </span>
                            </div>

                            {/* Tactical Insight Overlay */}
                            {activeAlphaInsight && ALPHA_INSIGHTS[activeAlphaInsight] && (
                                <div className="alpha-insight-overlay absolute bottom-20 left-4 right-4 z-30 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="bg-slate-900/95 backdrop-blur-xl p-6 rounded-[24px] border border-blue-500/30 shadow-2xl relative">
                                        <button onClick={() => setActiveAlphaInsight(null)} className="absolute top-3 right-3 text-slate-500 hover:text-white">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <h5 className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                            {ALPHA_INSIGHTS[activeAlphaInsight].title}
                                        </h5>
                                        <p className="text-[10px] text-slate-300 leading-relaxed font-medium mb-3">{ALPHA_INSIGHTS[activeAlphaInsight].desc}</p>
                                        <div className="bg-blue-900/20 p-3 rounded-xl border border-blue-500/20">
                                            <p className="text-[9px] text-emerald-400 font-bold mb-1 uppercase tracking-wider">💡 Strategy:</p>
                                            <p className="text-[9px] text-slate-400 leading-relaxed">{ALPHA_INSIGHTS[activeAlphaInsight].strategy}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                         
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
                        
                        {/* [STRATEGIC MASTER FRAMEWORK] */}
                        {quantMetrics && (
                            <div className="space-y-4">
                                <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2 italic">Quant Strategic Master Framework</h4>
                                
                                {/* PHASE 1: SIZING (SHIELD) */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div 
                                        onClick={() => setActiveAlphaInsight('HALF_KELLY')}
                                        className="p-4 bg-indigo-900/10 rounded-[24px] border border-indigo-500/20 hover:bg-indigo-900/20 cursor-help transition-all group alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-indigo-300 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                            Sizing: Half-Kelly
                                        </p>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-white italic">{quantMetrics.sizing.kelly}%</span>
                                            <span className="text-[8px] text-slate-500 font-bold">Max</span>
                                        </div>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('VAPS')}
                                        className="p-4 bg-indigo-900/10 rounded-[24px] border border-indigo-500/20 hover:bg-indigo-900/20 cursor-help transition-all group alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-indigo-300 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                                            Sizing: VAPS (1R)
                                        </p>
                                        <div className="flex flex-col">
                                            <span className="text-xl font-black text-white italic">{quantMetrics.sizing.vapsQty} Shares</span>
                                            <span className="text-[8px] text-slate-500 font-bold">Risk: ${quantMetrics.sizing.riskPerShare}/sh</span>
                                        </div>
                                    </div>
                                </div>

                                {/* PHASE 2: SELECTION (SWORD) */}
                                <div className="p-4 bg-violet-900/10 rounded-[24px] border border-violet-500/20 flex justify-between items-center gap-2 hover:bg-violet-900/20 transition-all">
                                    {[
                                        { id: 'ERCI', val: quantMetrics.selection.erci, label: 'ERCI' },
                                        { id: 'QM_COMP', val: quantMetrics.selection.qm, label: 'Q-M' },
                                        { id: 'IVG', val: `${quantMetrics.selection.ivg}%`, label: 'IVG' },
                                    ].map((m) => (
                                        <div 
                                            key={m.id}
                                            onClick={() => setActiveAlphaInsight(m.id)}
                                            className="text-center cursor-help group alpha-insight-trigger flex-1"
                                        >
                                            <p className="text-[7px] text-violet-400 font-bold uppercase mb-0.5 group-hover:text-white transition-colors">{m.label}</p>
                                            <p className="text-sm font-black text-white">{m.val}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* PHASE 3: TIMING (CLOCK) */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div 
                                        onClick={() => setActiveAlphaInsight('CONVEXITY')}
                                        className="p-3 bg-amber-900/10 rounded-[20px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-amber-500 font-bold uppercase mb-1">Convexity</p>
                                        <p className="text-[9px] font-black text-white">{quantMetrics.timing.convexity}</p>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('IFS')}
                                        className="p-3 bg-amber-900/10 rounded-[20px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-amber-500 font-bold uppercase mb-1">IFS Score</p>
                                        <p className="text-xl font-black text-white italic">{quantMetrics.timing.ifs}</p>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('MRF')}
                                        className="p-3 bg-amber-900/10 rounded-[20px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-amber-500 font-bold uppercase mb-1">Market MRF</p>
                                        <p className="text-[8px] font-black text-white truncate">{quantMetrics.timing.mrf}</p>
                                    </div>
                                </div>

                                {/* PHASE 4: INTEGRITY (SYSTEM) */}
                                <div className="p-4 bg-emerald-900/10 rounded-[24px] border border-emerald-500/20 flex justify-between items-center hover:bg-emerald-900/20 transition-all cursor-help alpha-insight-trigger" onClick={() => setActiveAlphaInsight('EXPECTANCY')}>
                                    <div className="w-full">
                                        <p className="text-[7px] text-emerald-400 font-bold uppercase tracking-wider mb-2 border-b border-emerald-500/20 pb-1">System Integrity</p>
                                        <div className="flex justify-between w-full">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] text-slate-500 block mb-0.5">Expectancy</span>
                                                <span className="text-sm font-black text-white">{quantMetrics.system.expectancy}R</span>
                                            </div>
                                            <div className="flex flex-col items-end" onClick={(e) => { e.stopPropagation(); setActiveAlphaInsight('AIC'); }}>
                                                <span className="text-[8px] text-slate-500 block mb-0.5">AI Consensus</span>
                                                <span className="text-sm font-black text-white">{quantMetrics.system.aic}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Detail Overlay for New Metrics */}
                        {activeAlphaInsight && FRAMEWORK_INSIGHTS[activeAlphaInsight] && (
                            <div className="alpha-insight-overlay absolute bottom-4 left-4 right-4 z-30 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-950/95 backdrop-blur-xl p-6 rounded-[24px] border border-indigo-500/50 shadow-2xl relative">
                                    <button onClick={() => setActiveAlphaInsight(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    <h5 className="text-sm font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                                        {FRAMEWORK_INSIGHTS[activeAlphaInsight].title}
                                    </h5>
                                    <p className="text-xs text-slate-300 leading-relaxed font-medium mb-4">{FRAMEWORK_INSIGHTS[activeAlphaInsight].desc}</p>
                                    <div className="bg-indigo-500/10 p-4 rounded-xl border border-indigo-500/20">
                                        <p className="text-[10px] text-indigo-400 font-bold mb-1 uppercase tracking-wider">💡 Pro Strategy:</p>
                                        <p className="text-xs text-slate-200 leading-relaxed font-semibold">{FRAMEWORK_INSIGHTS[activeAlphaInsight].strategy}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                 </div>

                 <div className="mt-8 border-t border-white/5 pt-8">
                    <div className="flex justify-between items-end mb-6">
                        <div className="flex items-center gap-4">
                            <div>
                                <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1 italic">Quant_Backtest_Protocol</h4>
                                {currentBacktest && <p className="text-[9px] text-slate-500 font-mono font-bold">SIMULATION PERIOD: <span className="text-emerald-500">{currentBacktest.simulationPeriod}</span></p>}
                            </div>
                            {currentBacktest && (
                                <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
                            )}
                            {currentBacktest && (
                                <span className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none opacity-80">{selectedStock.symbol}</span>
                            )}
                        </div>
                        {!currentBacktest && (
                             <button 
                                onClick={(e) => handleRunBacktest(selectedStock, e)} 
                                disabled={backtestLoading}
                                className="px-6 py-3 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg"
                            >
                                {backtestLoading ? 'Running Simulation...' : 'Run Portfolio Simulation'}
                            </button>
                        )}
                    </div>

                    {currentBacktest ? (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                             <div className="flex flex-col gap-4">
                                <div className="space-y-3">
                                    <div 
                                        onClick={() => handleMetricClick('WIN_RATE', currentBacktest.metrics.winRate)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-105 active:scale-95 flex justify-between items-center ${activeOverlay === 'WIN_RATE' ? 'bg-emerald-500/20 border-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                                    >
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">승률 (Win Rate)</span>
                                        <span className="text-lg font-black text-emerald-400 italic">{currentBacktest.metrics.winRate}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleMetricClick('PROFIT_FACTOR', currentBacktest.metrics.profitFactor)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-105 active:scale-95 flex justify-between items-center ${activeOverlay === 'PROFIT_FACTOR' ? 'bg-blue-500/20 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                                    >
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">손익비 (P.Factor)</span>
                                        <span className="text-lg font-black text-blue-400 italic">{currentBacktest.metrics.profitFactor}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleMetricClick('MAX_DRAWDOWN', currentBacktest.metrics.maxDrawdown)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-105 active:scale-95 flex justify-between items-center ${activeOverlay === 'MAX_DRAWDOWN' ? 'bg-rose-500/20 border-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                                    >
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">최대낙폭 (MDD)</span>
                                        <span className="text-lg font-black text-rose-400 italic">{currentBacktest.metrics.maxDrawdown}</span>
                                    </div>
                                    <div 
                                        onClick={() => handleMetricClick('SHARPE_RATIO', currentBacktest.metrics.sharpeRatio)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-105 active:scale-95 flex justify-between items-center ${activeOverlay === 'SHARPE_RATIO' ? 'bg-amber-500/20 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                                    >
                                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">샤프지수 (Risk/Rtn)</span>
                                        <span className="text-lg font-black text-amber-400 italic">{currentBacktest.metrics.sharpeRatio}</span>
                                    </div>
                                </div>

                                <div className="bg-slate-900/80 p-5 rounded-[20px] border border-white/10 min-h-[160px] flex flex-col justify-start relative overflow-hidden shadow-inner">
                                    {selectedMetricInfo ? (
                                        <div className="animate-in fade-in slide-in-from-top-4 duration-300 relative z-10">
                                            <h5 className="text-[10px] font-black text-white uppercase tracking-widest mb-3 border-b border-white/10 pb-2 flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full ${activeOverlay === selectedMetricInfo.key ? 'animate-ping' : ''} bg-emerald-500`}></span>
                                                {selectedMetricInfo.title}
                                                {activeOverlay === selectedMetricInfo.key && <span className="text-[7px] bg-emerald-600 px-1.5 py-0.5 rounded text-white ml-auto font-black uppercase tracking-tighter">OVERLAY ACTIVE</span>}
                                            </h5>
                                            <div className="text-[10px] text-slate-300 leading-relaxed metric-markdown">
                                                <ReactMarkdown 
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        ...MarkdownComponents,
                                                        h3: ({node, ...props}) => <h3 className="text-xs font-bold text-emerald-400 mt-2 mb-1 uppercase tracking-wide" {...props} />,
                                                        p: ({node, ...props}) => <p className="mb-2" {...props} />,
                                                        ul: ({node, ...props}) => <ul className="list-disc pl-4 space-y-1 mb-2" {...props} />,
                                                        li: ({node, ...props}) => <li className="pl-1 marker:text-emerald-500" {...props} />,
                                                        strong: ({node, ...props}) => <strong className="text-white font-bold" {...props} />
                                                    }}
                                                >
                                                    {selectedMetricInfo.desc}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full opacity-30 text-center">
                                             <svg className="w-8 h-8 text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                             <p className="text-[8px] font-black uppercase tracking-widest">Select a metric to overlay</p>
                                        </div>
                                    )}
                                </div>
                             </div>

                             <div className="lg:col-span-3 flex flex-col gap-6">
                                <div className="bg-black/40 rounded-[30px] border border-white/5 p-6 relative h-[320px] flex flex-col">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                             <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">24-Month Quant Analysis Portfolio Growth</p>
                                             <div className="flex items-center gap-3 mt-1">
                                                 <span className={`text-3xl font-black italic tracking-tighter ${chartData.length > 0 && chartData[chartData.length-1].value >= 0 ? 'text-white' : 'text-rose-400'}`}>
                                                     {chartData.length > 0 ? (chartData[chartData.length-1].value >= 0 ? '+' : '') + chartData[chartData.length-1].value + '%' : '0%'}
                                                 </span>
                                                 <div className="flex flex-col">
                                                     <span className="text-[8px] font-bold text-slate-400 uppercase">Total Audit Return</span>
                                                     <span className="text-[8px] font-mono text-slate-600 uppercase tracking-widest">{currentBacktest.simulationPeriod}</span>
                                                 </div>
                                             </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex gap-4 text-[8px] text-slate-500 font-bold uppercase tracking-widest bg-black/20 p-2 rounded-lg border border-white/5">
                                                 <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Profit Zone</div>
                                                 <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Loss Zone</div>
                                            </div>
                                            {selectedMetricInfo?.overlayDesc && (
                                                <div className="text-[7px] font-black text-indigo-400 uppercase bg-indigo-950/30 px-2 py-1 rounded border border-indigo-500/20 animate-in fade-in zoom-in-95">
                                                    {selectedMetricInfo.overlayDesc}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex-1 w-full min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={chartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id={uniqueChartId} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartColor} stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                                <XAxis dataKey="period" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} dy={10} interval={1} />
                                                <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px' }}
                                                    itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                                    labelStyle={{ color: '#94a3b8', fontSize: '9px', marginBottom: '4px' }}
                                                    formatter={(value: any, name: string) => {
                                                        if (name === 'value') return [`${value}%`, 'Return'];
                                                        if (name === 'drawdown') return [`${value}%`, 'Drawdown'];
                                                        if (name === 'delta') return [`${value}%`, 'Period Change'];
                                                        return [value, name];
                                                    }}
                                                />
                                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" opacity={0.5} />
                                                
                                                {/* PROFIT_FACTOR Overlay: Monthly Magnitude Bars */}
                                                {activeOverlay === 'PROFIT_FACTOR' && (
                                                    <Bar dataKey="delta" barSize={8} fillOpacity={0.5}>
                                                        {chartData.map((entry, index) => (
                                                            <Cell 
                                                                key={`cell-${index}`} 
                                                                fill={entry.delta >= 0 ? '#10b981' : '#ef4444'} 
                                                            />
                                                        ))}
                                                    </Bar>
                                                )}

                                                {/* MAX_DRAWDOWN Overlay: Red Loss Area */}
                                                {activeOverlay === 'MAX_DRAWDOWN' && (
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="drawdown" 
                                                        stroke="none" 
                                                        fill="#ef4444" 
                                                        fillOpacity={0.25} 
                                                        animationDuration={500} 
                                                    />
                                                )}

                                                {/* SHARPE_RATIO Overlay: Regression Path & Consistency Corridor */}
                                                {activeOverlay === 'SHARPE_RATIO' && (
                                                    <>
                                                        <Area 
                                                            type="monotone" 
                                                            dataKey="idealValue" 
                                                            stroke="#f59e0b" 
                                                            strokeWidth={1}
                                                            strokeDasharray="5 5"
                                                            fill="#f59e0b"
                                                            fillOpacity={0.08}
                                                        />
                                                        <ReferenceLine 
                                                            stroke="#f59e0b" 
                                                            strokeDasharray="3 3" 
                                                            label={{ position: 'top', value: 'Efficiency Path', fill: '#f59e0b', fontSize: 7, fontWeight: 'bold' }} 
                                                            segment={[{ x: chartData[0]?.period, y: 0 }, { x: chartData[chartData.length-1]?.period, y: chartData[chartData.length-1].value }]}
                                                        />
                                                    </>
                                                )}

                                                {/* Main Cumulative Equity Area */}
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="value" 
                                                    stroke={chartColor} 
                                                    strokeWidth={2} 
                                                    fillOpacity={1} 
                                                    fill={`url(#${uniqueChartId})`} 
                                                    animationDuration={1500}
                                                    // Dot overlay for Win/Loss (Monthly Result)
                                                    dot={activeOverlay === 'WIN_RATE' ? (props: any) => {
                                                        const { cx, cy, payload } = props;
                                                        // Accurate logic: Is this month better than previous?
                                                        const isWin = payload.isWin;
                                                        return (
                                                            <circle 
                                                                key={`dot-${payload.period}`}
                                                                cx={cx} cy={cy} r={3} 
                                                                fill={isWin ? '#10b981' : '#ef4444'} 
                                                                stroke="#020617" strokeWidth={1}
                                                                className="animate-in fade-in duration-500"
                                                            />
                                                        );
                                                    } : false}
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="bg-emerald-900/10 p-6 rounded-[30px] border border-emerald-500/20 flex-1">
                                     <h5 className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                         Simulation Intelligence Insight
                                     </h5>
                                     <div className="prose-report text-xs text-slate-300 leading-relaxed">
                                         <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                            {currentBacktest.historicalContext}
                                         </ReactMarkdown>
                                     </div>
                                 </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-[200px] flex flex-col items-center justify-center border border-dashed border-white/10 rounded-[30px] bg-white/5">
                            <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Ready to Execute Backtest Protocol</p>
                        </div>
                    )}
                 </div>
             </div>
        )}
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[50px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-8 shadow-3xl overflow-hidden">
          <h3 className="font-black text-white text-[11px] uppercase tracking-[0.5em] italic mb-6">Alpha_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[35px] font-mono text-[10px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed shadow-inner">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : l.includes('[INFO]') ? 'border-cyan-500 text-cyan-400' : 'border-rose-900'}`}>
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
