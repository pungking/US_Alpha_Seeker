
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
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

const FRAMEWORK_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'HALF_KELLY': {
        title: "Half-Kelly Criterion (최적 비중)",
        desc: "승률과 손익비를 기반으로 파산 위험을 0으로 수렴시키는 수학적 최적 투자 비중입니다.",
        strategy: "이 값은 '권장 상한선(Max Cap)'입니다. \n- 20% 근접: 확신도가 매우 높음 (적극 투자)\n- 10% 미만: 일반적인 기회 (분산 투자)\n*계산된 %의 50~80%만 집행하는 것이 안전합니다."
    },
    'VAPS': {
        title: "VAPS (변동성 조정 수량)",
        desc: "1회 거래당 총 자산의 1%만 잃도록 설계된 수량 산출 공식입니다 (Volatility Adjusted Position Sizing).",
        strategy: "수량이 많음 = 손절폭이 짧음 (리스크가 적음)\n- 수량이 적음 = 손절폭이 큼 (변동성이 큼)\n*이 수량대로 매수하면 손절가 도달 시 딱 1%의 자산만 감소합니다."
    },
    'ERCI': {
        title: "ERCI (효율성 지수)",
        desc: "단위 리스크당 기대할 수 있는 수익의 효율(Efficiency)을 나타냅니다. (상승여력 × 확신도 × 수급).",
        strategy: "수치 해석 (높을수록 좋음):\n- 10.0 이상: 양호 (Good)\n- 30.0 이상: 초고효율 (Elite) - 우선 순위로 편입하십시오."
    },
    'QM_COMP': {
        title: "Q-M Composite (품질+모멘텀)",
        desc: "ROE(품질)와 ICT(모멘텀)를 결합하여 '우량주가 달리기 시작하는 시점'을 포착합니다.",
        strategy: "수치 해석 (높을수록 좋음):\n- 50점 이상: 펀더멘털과 수급이 모두 양호함\n- 70점 이상: 강력한 주도주 후보"
    },
    'CONVEXITY': {
        title: "Alpha Convexity (폭발력)",
        desc: "에너지 응축(Squeeze)과 발산(Displacement)의 결합 상태입니다.",
        strategy: "상태 해석:\n- 'Explosive': 에너지가 응축된 후 세력이 방향을 잡음 (곧 시세 분출)\n- 'Building': 에너지만 모이고 있음 (대기)\n- 'Standard': 일반적인 변동성"
    },
    'EXPECTANCY': {
        title: "Expectancy (기대값)",
        desc: "이 매매를 100번 반복했을 때, 1회당 평균적으로 얻을 수 있는 수익(R)입니다.",
        strategy: "수치 해석 (높을수록 좋음):\n- 0.5R 이상: 훌륭한 시스템 (수익 우상향)\n- 0.2R 미만: 거래 비용 고려 시 손해 가능성 높음"
    },
    'IVG': {
        title: "IVG (내재가치 괴리율)",
        desc: "현재 주가가 내재가치(Intrinsic Value) 대비 얼마나 저렴한지 나타냅니다.",
        strategy: "수치 해석:\n- 양수(+): 저평가 상태 (안전마진 확보, 매수 유리)\n- 음수(-): 고평가 상태 (프리미엄 지불, 추격 매수 주의)"
    },
    'IFS': {
        title: "IFS (기관 수급 점수)",
        desc: "기관(Smart Money)의 자금 유입 강도를 0~100으로 수치화했습니다.",
        strategy: "수치 해석 (높을수록 좋음):\n- 70점 초과: 세력이 적극 매집 중 (등에 올라타십시오)\n- 50점 미만: 세력 이탈 또는 관망세"
    },
    'MRF': {
        title: "MRF (시장 국면)",
        desc: "해당 종목이 현재 위치한 와이코프(Wyckoff) 시장 국면을 진단합니다.",
        strategy: "상태 해석:\n- 'Accumulation': 바닥권 매집 (저점 매수 기회)\n- 'Markup': 상승 추세 (비중 확대)\n- 'Distribution': 천장권 분산 (매도 관점)"
    },
    'AIC': {
        title: "AIC (AI 합의)",
        desc: "여러 AI 모델(Gemini, Perplexity)간의 분석 일치도입니다.",
        strategy: "수치 해석:\n- 80% 이상: AI들의 의견이 강력하게 일치 (신뢰도 높음)\n- 50% 주변: 의견 엇갈림 (독자적 판단 필요)"
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
  
  // WebSocket State
  const [realtimePrices, setRealtimePrices] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string; key: string; overlayDesc: string } | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeAlphaInsight, setActiveAlphaInsight] = useState<string | null>(null); 

  const [autoPhase, setAutoPhase] = useState<'IDLE' | 'ENGINE' | 'MATRIX' | 'DONE'>('IDLE');

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
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
          
          const roe = selectedStock.roe || 15; 
          const ictScore = selectedStock.ictScore || conviction; 
          const intrinsic = selectedStock.intrinsicValue || selectedStock.price;
          
          // 2. ODDS & PROB
          const simMetrics = backtestData[selectedStock.symbol]?.metrics;
          let P = 0; 
          let B = 0; 
          
          if (simMetrics && parseFloat(String(simMetrics.winRate).replace('%','')) > 0) {
              P = parseFloat(String(simMetrics.winRate).replace('%','')) / 100;
              B = parseFloat(simMetrics.profitFactor || "1.5");
          } else {
              P = 0.30 + (conviction / 100) * 0.30; 
              
              if (selectedStock.riskRewardRatio) {
                  const parts = selectedStock.riskRewardRatio.split(':');
                  B = parts.length === 2 ? parseFloat(parts[1]) : 2.0;
              } else {
                  B = (target - entry) / (entry - stop);
              }
          }
          if (isNaN(B) || B <= 0) B = 1.5;
          
          // 3. SIZING (Kelly)
          const Q = 1 - P;
          let kellyRaw = P - (Q / B);
          if (kellyRaw < 0) kellyRaw = 0;
          const halfKelly = Math.min((kellyRaw * 0.5 * 100), 20.0);
          
          // VAPS
          const riskPerShare = Math.max(0.01, entry - stop);
          const vapsQty = Math.floor(1000 / riskPerShare);
          const vapsAllocation = (vapsQty * entry) / 1000; 

          // 4. SELECTION
          const upside = ((target - entry) / entry) * 100;
          const erci = upside * Math.log10(conviction || 10) * (ictScore / 100);
          const qmScore = (roe * 0.4) + (ictScore * 0.6);
          const sorosRatio = B * (ictScore / 50);
          const ivg = selectedStock.fairValueGap || ((intrinsic - selectedStock.price)/selectedStock.price * 100);

          // 5. TIMING
          const squeeze = selectedStock.techMetrics?.squeezeState === 'SQUEEZE_ON';
          const displacement = selectedStock.ictMetrics?.displacement > 60;
          const convexity = squeeze ? (displacement ? "Explosive" : "Building") : "Standard";
          const ifs = selectedStock.ictMetrics?.smartMoneyFlow || 50;

          // 6. SYSTEM
          const expectancy = (P * B) - (Q * 1);
          const aic = selectedStock.aiVerdict === 'STRONG_BUY' ? 95 : selectedStock.aiVerdict === 'BUY' ? 80 : 50;

          return {
              sizing: { kelly: halfKelly.toFixed(1), vapsQty, vapsPct: vapsAllocation.toFixed(1), riskPerShare: riskPerShare.toFixed(2) },
              selection: { erci: erci.toFixed(1), qm: qmScore.toFixed(0), ivg: ivg.toFixed(1), soros: sorosRatio.toFixed(1) },
              timing: { convexity, ifs: ifs.toFixed(0), mrf: selectedStock.marketState || 'Neutral' },
              system: { expectancy: expectancy.toFixed(2), aic }
          };
      } catch (e) { return null; }
  }, [selectedStock, backtestData]);

  // --- WEBSOCKET CONNECTION ---
  useEffect(() => {
      const currentSymbols = resultsCache[selectedBrain] || [];
      if (activeTab === 'INDIVIDUAL' && currentSymbols.length > 0 && polygonKey) {
          if (wsRef.current) wsRef.current.close();
          
          const ws = new WebSocket('wss://socket.polygon.io/stocks');
          wsRef.current = ws;
          
          ws.onopen = () => {
              ws.send(JSON.stringify({ action: 'auth', params: polygonKey }));
              const subs = currentSymbols.map(s => `T.${s.symbol}`).join(',');
              ws.send(JSON.stringify({ action: 'subscribe', params: subs }));
          };
          
          ws.onmessage = (e) => {
              try {
                  const data = JSON.parse(e.data);
                  data.forEach((msg: any) => {
                      if (msg.ev === 'T' && msg.p) {
                          setRealtimePrices(prev => {
                              const oldPrice = prev[msg.sym]?.price || 0;
                              const direction = msg.p > oldPrice ? 'up' : msg.p < oldPrice ? 'down' : prev[msg.sym]?.direction || null;
                              return { ...prev, [msg.sym]: { price: msg.p, direction } };
                          });
                          setTimeout(() => {
                              setRealtimePrices(prev => ({
                                  ...prev, 
                                  [msg.sym]: { ...prev[msg.sym], direction: null }
                              }));
                          }, 500);
                      }
                  });
              } catch (err) {}
          };
          
          return () => {
              if (wsRef.current) wsRef.current.close();
          };
      }
  }, [activeTab, resultsCache, selectedBrain]);

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
    if (autoStart && !loading && !resultsCache[selectedBrain]) {
       addLog("AUTO-PILOT: Engaging Alpha Singularity Protocol...", "signal");
       setAutoPhase('ENGINE');
       executeAlphaEngine();
    }
  }, [autoStart]);

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
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.alpha-insight-trigger') && !target.closest('.alpha-insight-overlay')) {
            setActiveAlphaInsight(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const handleStockClick = (item: AlphaCandidate) => {
      setSelectedStock(item);
      onStockSelected?.(item);
      setActiveOverlay(null);
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

  const executeAlphaEngine = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    addLog("Initiating Alpha Singularity Protocol (Stage 6)...", "info");

    try {
      let sourceStage = "STAGE5_ICT_ELITE_50";
      let q = encodeURIComponent(`name contains '${sourceStage}' and trashed = false`);
      let listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
          addLog("Stage 5 (ICT) missing. Falling back to Stage 4 (Tech)...", "warn");
          sourceStage = "STAGE4_TECHNICAL_FULL";
          q = encodeURIComponent(`name contains '${sourceStage}' and trashed = false`);
          listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
      }

      if (!listRes.files?.length) throw new Error("No Input Data (Stage 4 or 5) found.");

      const fileId = listRes.files[0].id;
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const candidates = content.ict_universe || content.technical_universe || [];
      if (candidates.length === 0) throw new Error("Input data is empty.");

      const topCandidates = candidates.slice(0, 12);
      addLog(`Analyzing Top ${topCandidates.length} Candidates with ${selectedBrain}...`, "info");

      const response = await generateAlphaSynthesis(topCandidates, selectedBrain);
      
      if (response.error) throw new Error(response.error);
      const results = response.data || [];

      if (results.length === 0) throw new Error("AI returned no results.");

      const finalResults = results.map((r: any) => {
          const original = topCandidates.find((c: any) => c.symbol === r.symbol);
          return { ...original, ...r };
      });

      setResultsCache(prev => ({ ...prev, [selectedBrain]: finalResults }));
      if (finalResults.length > 0) setSelectedStock(finalResults[0]);
      if (onFinalSymbolsDetected) onFinalSymbolsDetected(finalResults.map((r:any) => r.symbol), finalResults);

      addLog(`Alpha Protocol Complete. ${finalResults.length} Assets Selected.`, "ok");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
      const fileName = `STAGE6_ALPHA_FINAL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
          manifest: { version: "9.9.9", strategy: "Alpha_Singularity_v2", brain: selectedBrain, timestamp: new Date().toISOString() },
          alpha_universe: finalResults
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      
    } catch (e: any) {
        addLog(`Alpha Engine Failed: ${e.message}`, "err");
    } finally {
        setLoading(false);
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
        let report = await analyzePipelineStatus({
            currentStage: 6,
            apiStatuses: [],
            recommendedData: currentResults,
            mode: 'PORTFOLIO'
        }, brain);
        
        const safeReport = String(report || "No analysis returned.");
        setMatrixReports(prev => ({ ...prev, [brain]: safeReport }));
        
        const token = sessionStorage.getItem('gdrive_access_token');
        if (token) {
           const date = new Date().toISOString().split('T')[0];
           const brainLabel = brain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
           const fileName = `${date}_Portfolio_Matrix_${brainLabel}.md`;
           await archiveReport(token, fileName, safeReport);
        }
        addLog("Portfolio Matrix Audit complete.", "ok");
    } catch (e: any) { addLog(`Matrix Error: ${e.message}`, "err"); } 
    finally { setMatrixLoading(false); }
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
    } catch (e: any) { addLog(`Telegram Error: ${e.message}`, "err"); } 
    finally { setSendingTelegram(false); }
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
    if (text.includes('HOLD') || text.includes('관망')) return '관망';
    return v || "대기";
  };

  const getVerdictStyle = (v?: string) => {
    const text = cleanVerdict(v);
    if (text.includes('STRONG')) return 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 animate-pulse';
    if (text.includes('BUY')) return 'bg-emerald-600 text-white border-emerald-400';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

  const currentResults = resultsCache[selectedBrain] || [];
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  const chartData = useMemo(() => {
    try {
        if (!currentBacktest) return [];
        let rawData: any[] = [];
        if (currentBacktest.equityCurve && Array.isArray(currentBacktest.equityCurve) && currentBacktest.equityCurve.length >= 2) {
            rawData = currentBacktest.equityCurve.map((item) => ({
                period: item.period,
                value: parseFloat(String(item.value).replace(/[^0-9.-]/g, '')) || 0
            }));
        } else { return []; }

        let runningPeak = -Infinity;
        return rawData.map((d, i) => {
            if (d.value > runningPeak) runningPeak = d.value;
            const drawdown = d.value - runningPeak;
            const prevValue = i > 0 ? rawData[i-1].value : 0;
            const delta = d.value - prevValue; 
            const isWin = d.value >= prevValue;
            
            const totalPeriods = rawData.length - 1;
            const finalVal = rawData[rawData.length - 1].value;
            const idealValue = i * (finalVal / (totalPeriods || 1));

            return { ...d, drawdown: Number(drawdown.toFixed(2)), delta: Number(delta.toFixed(2)), idealValue: Number(idealValue.toFixed(2)), isWin };
        });
    } catch(e) { return []; }
  }, [currentBacktest]);

  const isProfitable = chartData.length > 0 && chartData[chartData.length - 1].value >= 0;
  const chartColor = isProfitable ? '#10b981' : '#ef4444';

  const cleanInsightText = (text: any) => String(text || "").replace(/[\u{1F600}-\u{1F6FF}]/gu, "").trim();

  // Price Positioning
  const getTacticalPosition = (price: number, entry: number, target: number, stop: number) => {
      const range = target - stop;
      if (Math.abs(range) < 0.0001) return 50; 
      const position = price - stop;
      return Math.max(0, Math.min(100, (position / range) * 100));
  };

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
                  <button onClick={executeAlphaEngine} disabled={loading} className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 animate-pulse text-slate-500' : 'bg-rose-600 text-white hover:brightness-110 active:scale-95 shadow-rose-900/20'}`}>
                    {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
                  </button>
              )}
            </div>
          </div>
          
          {activeTab === 'INDIVIDUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentResults.length > 0 ? currentResults.map((item) => {
                const isSelected = selectedStock?.symbol === item.symbol;
                const isAuditRunning = analyzingSymbols?.has(item.symbol);
                const rtData = realtimePrices[item.symbol];
                const displayPrice = rtData?.price || item.price;
                const flashClass = rtData?.direction === 'up' ? 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                                 : rtData?.direction === 'down' ? 'bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]' 
                                 : '';

                return (
                  <div 
                    key={item.symbol} 
                    onClick={() => handleStockClick(item)} 
                    className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col h-[240px] ${flashClass || (isSelected ? 'border-rose-500 bg-rose-500/10 shadow-xl' : 'border-white/5 bg-black/40 hover:bg-white/5')}`}
                  >
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
                      <div className="text-right">
                          <span className={`text-xs font-mono font-black mt-1 block ${rtData?.direction === 'up' ? 'text-emerald-400' : rtData?.direction === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
                              ${Number(displayPrice)?.toFixed(2)}
                          </span>
                          {rtData && <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest animate-pulse">LIVE FEED</span>}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 py-4 bg-black/50 rounded-2xl border border-white/5 flex-grow items-center shadow-inner mt-4">
                      <div className="text-center"><p className="text-[8px] text-emerald-500 font-black uppercase">Entry</p><p className="text-[13px] font-black text-white tracking-tighter">${item.supportLevel?.toFixed(2) || '---'}</p></div>
                      <div className="text-center border-x border-white/10"><p className="text-[8px] text-blue-500 font-black uppercase">Target</p><p className="text-[13px] font-black text-white tracking-tighter">${item.resistanceLevel?.toFixed(2) || '---'}</p></div>
                      <div className="text-center"><p className="text-[8px] text-rose-500 font-black uppercase">Stop</p><p className="text-[13px] font-black text-white tracking-tighter">${item.stopLoss?.toFixed(2) || '---'}</p></div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-3">
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
                         {currentResults.length > 0 && (
                            <button 
                                onClick={handleManualTelegramSend} 
                                disabled={sendingTelegram}
                                className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sendingTelegram ? 'bg-blue-900 border-blue-700 text-blue-400 animate-pulse' : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-lg'}`}
                            >
                                {sendingTelegram ? 'Transmitting...' : 'Transmit Brief to HQ'}
                            </button>
                        )}
                    </div>
                </div>
               {matrixReports[matrixBrain] ? (
                 <div className="prose-report bg-black/30 p-8 rounded-[40px] border border-white/5 min-h-[400px] shadow-inner relative">
                    <button onClick={() => handleRunMatrixAudit(matrixBrain)} disabled={matrixLoading} className="absolute top-8 right-8 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/5 transition-all">
                        {matrixLoading ? 'Refreshing...' : 'Regenerate Analysis'}
                    </button>
                   <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {cleanInsightText(matrixReports[matrixBrain])}
                   </ReactMarkdown>
                 </div>
               ) : (
                 <div className="min-h-[300px] flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-white/10 rounded-[40px]">
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
                 <div className="flex justify-between items-start mb-6">
                     <div>
                        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter flex items-center gap-2">
                            {selectedStock.symbol} <span className="text-base text-slate-500 not-italic font-medium normal-case tracking-normal">| {selectedStock.name}</span>
                        </h3>
                        <p className="text-[10px] font-bold text-rose-500 mt-1 uppercase tracking-widest">{translateVerdict(selectedStock.aiVerdict)} • {selectedStock.theme}</p>
                     </div>
                     <div className="flex gap-2">
                        {['RISK', 'ENTRY', 'REWARD'].map(k => (
                            <button 
                                key={k}
                                onClick={() => setActiveAlphaInsight(k)}
                                className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border transition-all ${activeAlphaInsight === k ? 'bg-rose-600 text-white border-rose-500' : 'border-white/10 text-slate-500 hover:text-white'}`}
                            >
                                {k} Logic
                            </button>
                        ))}
                     </div>
                 </div>

                 {/* Tactical Execution Map */}
                 <div className="bg-slate-900/50 backdrop-blur-md p-6 rounded-[30px] border border-white/5 shadow-inner flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 relative mt-4 mb-8">
                    <div className="flex justify-between items-end mb-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tactical Range Map</h4>
                        <div className="flex gap-3 text-[8px] font-bold uppercase tracking-wider">
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500/50 rounded-sm"></div>Stop Zone</div>
                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500/50 rounded-sm"></div>Profit Zone</div>
                        </div>
                    </div>
                    <div className="relative h-16 w-full mt-8">
                        <div className="absolute top-1/2 left-0 right-0 h-2 bg-slate-800 rounded-full -translate-y-1/2 overflow-hidden border border-white/5">
                             <div className="w-full h-full bg-gradient-to-r from-rose-900 via-slate-800 to-emerald-900 opacity-50"></div>
                        </div>
                        {(() => {
                            const stop = selectedStock.stopLoss || 0;
                            const entry = selectedStock.supportLevel || 0;
                            const target = selectedStock.resistanceLevel || 0;
                            const current = realtimePrices[selectedStock.symbol]?.price || selectedStock.price || 0;
                            const minPrice = stop * 0.98;
                            const maxPrice = target * 1.02;
                            const totalRange = maxPrice - minPrice;
                            const getPos = (p: number) => {
                                if (totalRange <= 0) return 50;
                                const pct = ((p - minPrice) / totalRange) * 100;
                                return Math.max(0, Math.min(100, pct));
                            };
                            return (
                                <>
                                    <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-rose-500/30" style={{ left: '0%', width: `${getPos(stop)}%` }}></div>
                                    <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-emerald-500/30" style={{ left: `${getPos(entry)}%`, right: '0%' }}></div>
                                    <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${getPos(stop)}%` }}>
                                        <div className="h-full w-0.5 bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)]"></div>
                                        <div className="absolute -top-10 mb-2 text-[8px] font-black text-rose-500 whitespace-nowrap bg-slate-900/80 px-2 py-1 rounded border border-rose-500/30">STOP ${stop.toFixed(2)}</div>
                                    </div>
                                    <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${getPos(entry)}%` }}>
                                        <div className="h-4 w-0.5 bg-blue-400"></div>
                                        <div className="absolute -top-4 mb-2 text-[8px] font-black text-blue-400 whitespace-nowrap bg-slate-900/80 px-2 py-1 rounded border border-blue-500/30">ENTRY ${entry.toFixed(2)}</div>
                                    </div>
                                    <div className="absolute top-0 bottom-0 flex flex-col items-center justify-center group" style={{ left: `${getPos(target)}%` }}>
                                        <div className="h-full w-0.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
                                        <div className="absolute -top-10 mb-2 text-[8px] font-black text-emerald-500 whitespace-nowrap bg-slate-900/80 px-2 py-1 rounded border border-emerald-500/30">TARGET ${target.toFixed(2)}</div>
                                    </div>
                                    <div className="absolute top-1/2 -translate-y-1/2 z-20 flex flex-col items-center" style={{ left: `${getPos(current)}%`, transition: 'left 1s ease-out' }}>
                                        <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] border-2 border-slate-900 flex items-center justify-center relative">
                                            <div className="w-1 h-1 bg-slate-900 rounded-full"></div>
                                            <div className="absolute inset-0 rounded-full border border-white animate-ping opacity-50"></div>
                                        </div>
                                        <div className="absolute top-8 mt-1 bg-white text-slate-900 px-2 py-1 rounded text-[9px] font-black shadow-lg whitespace-nowrap flex flex-col items-center z-30">
                                            <div className="absolute -top-1 w-2 h-2 bg-white rotate-45"></div>
                                            <span>CURRENT</span>
                                            <span className="text-[10px]">${current.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                 </div>

                 {/* Quant Metrics Grid */}
                 {quantMetrics && (
                    <div className="mb-8 grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-[30px] border border-white/5 bg-black/20">
                        <div onClick={() => setActiveAlphaInsight('HALF_KELLY')} className="p-3 bg-indigo-900/10 rounded-xl border border-indigo-500/20 cursor-help hover:bg-indigo-900/20 transition-all alpha-insight-trigger">
                            <p className="text-[7px] text-indigo-300 font-bold uppercase mb-1">Kelly Size</p>
                            <p className="text-lg font-black text-white">{quantMetrics.sizing.kelly}%</p>
                        </div>
                        <div onClick={() => setActiveAlphaInsight('ERCI')} className="p-3 bg-violet-900/10 rounded-xl border border-violet-500/20 cursor-help hover:bg-violet-900/20 transition-all alpha-insight-trigger">
                            <p className="text-[7px] text-violet-300 font-bold uppercase mb-1">ERCI</p>
                            <p className="text-lg font-black text-white">{quantMetrics.selection.erci}</p>
                        </div>
                        <div onClick={() => setActiveAlphaInsight('IFS')} className="p-3 bg-amber-900/10 rounded-xl border border-amber-500/20 cursor-help hover:bg-amber-900/20 transition-all alpha-insight-trigger">
                            <p className="text-[7px] text-amber-300 font-bold uppercase mb-1">IFS Flow</p>
                            <p className="text-lg font-black text-white">{quantMetrics.timing.ifs}</p>
                        </div>
                        <div onClick={() => setActiveAlphaInsight('EXPECTANCY')} className="p-3 bg-emerald-900/10 rounded-xl border border-emerald-500/20 cursor-help hover:bg-emerald-900/20 transition-all alpha-insight-trigger">
                            <p className="text-[7px] text-emerald-300 font-bold uppercase mb-1">Expectancy</p>
                            <p className="text-lg font-black text-white">{quantMetrics.system.expectancy}R</p>
                        </div>
                    </div>
                 )}

                 {/* Insight Overlay for Frameworks */}
                 {activeAlphaInsight && (FRAMEWORK_INSIGHTS[activeAlphaInsight] || ALPHA_INSIGHTS[activeAlphaInsight]) && (
                     <div className="mb-6 bg-slate-900 border border-indigo-500/30 p-4 rounded-2xl animate-in fade-in slide-in-from-top-2 alpha-insight-overlay shadow-2xl">
                         <div className="flex justify-between items-start mb-2">
                             <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                 {(FRAMEWORK_INSIGHTS[activeAlphaInsight] || ALPHA_INSIGHTS[activeAlphaInsight]).title}
                             </h4>
                             <button onClick={() => setActiveAlphaInsight(null)} className="text-slate-500 hover:text-white">✕</button>
                         </div>
                         <p className="text-[10px] text-slate-300 leading-relaxed mb-3">{(FRAMEWORK_INSIGHTS[activeAlphaInsight] || ALPHA_INSIGHTS[activeAlphaInsight]).desc}</p>
                         <div className="bg-indigo-900/20 p-2 rounded border border-indigo-500/20">
                             <p className="text-[9px] text-emerald-400 font-bold">💡 Strategy: <span className="text-slate-400 font-medium">{(FRAMEWORK_INSIGHTS[activeAlphaInsight] || ALPHA_INSIGHTS[activeAlphaInsight]).strategy}</span></p>
                         </div>
                     </div>
                 )}

                 <div className="prose-report text-sm text-slate-300 leading-7">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>{cleanInsightText(selectedStock.investmentOutlook)}</ReactMarkdown>
                 </div>

                 {/* Backtest Section */}
                 <div className="mt-8 border-t border-white/5 pt-8">
                    <div className="flex justify-between items-center mb-6">
                        <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em] italic">Quant_Backtest_Protocol</h4>
                        {!currentBacktest && (
                             <button 
                                onClick={(e) => handleRunBacktest(selectedStock, e)} 
                                disabled={backtestLoading}
                                className="px-6 py-2 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg"
                            >
                                {backtestLoading ? 'Running Simulation...' : 'Run Portfolio Simulation'}
                            </button>
                        )}
                    </div>

                    {currentBacktest && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                             <div className="bg-black/40 rounded-[30px] border border-white/5 p-6 h-[320px] flex flex-col">
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
                                            />
                                            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" opacity={0.5} />
                                            <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fillOpacity={1} fill={`url(#${uniqueChartId})`} animationDuration={1500} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                             </div>
                             <div className="bg-emerald-900/10 p-6 rounded-[30px] border border-emerald-500/20">
                                 <div className="prose-report text-xs text-slate-300 leading-relaxed">
                                     <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                        {cleanInsightText(currentBacktest.historicalContext)}
                                     </ReactMarkdown>
                                 </div>
                             </div>
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
