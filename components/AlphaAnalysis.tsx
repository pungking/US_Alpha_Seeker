
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { generateAlphaSynthesis, runAiBacktest, analyzePipelineStatus, generateTelegramBrief, archiveReport, removeCitations, trackUsage } from '../services/intelligenceService';
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
  newsSentiment?: string;
  newsScore?: number;
  kellyWeight?: string;
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

// [UI] Dynamic Markdown Styling
const MarkdownComponents: any = {
    // Header 1 (Used for Main Title in some contexts, but mostly we use H2 for sections)
    h1: (props: any) => (
        <h1 className="text-2xl font-black text-white mt-8 mb-4 uppercase italic tracking-widest border-b-2 border-white/20 pb-2" {...props}>
            {props.children}
        </h1>
    ),
    // Header 2 (Sections like "1. 전문가 3인...", "2. The Alpha...")
    h2: (props: any) => (
        <h2 className="text-xl font-black text-white mt-10 mb-4 uppercase italic tracking-wider flex items-center gap-3 border-l-4 border-emerald-500 pl-4 bg-gradient-to-r from-emerald-900/20 to-transparent py-2 rounded-r-xl">
            {props.children}
        </h2>
    ),
    // Header 3 (Sub-sections)
    h3: (props: any) => <h3 className="text-sm font-bold text-slate-400 mt-4 mb-2 uppercase tracking-wide border-b border-white/5 pb-1" {...props} />,
    
    // Paragraphs
    p: (props: any) => <p className="text-[13px] text-slate-300 leading-7 mb-3 font-medium tracking-wide" {...props} />,
    
    // Lists (Bullet Points)
    ul: (props: any) => <ul className="space-y-3 mb-6" {...props} />,
    ol: (props: any) => <ol className="list-decimal pl-5 space-y-2 mb-4 text-slate-300 marker:text-emerald-500 marker:font-bold" {...props} />,
    
    // List Items - The "Arrow" logic is removed, replaced by "Block" logic via 'strong'
    li: (props: any) => (
        <li className="text-[13px] text-slate-300 leading-7 pl-2" {...props}>
            {props.children}
        </li>
    ),
    
    // Strong/Bold -> The "Square Block" Look
    strong: (props: any) => (
        <span className="inline-block bg-slate-800 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/30 mr-2 mb-1 shadow-sm tracking-tight">
            {props.children}
        </span>
    ),
    
    blockquote: (props: any) => (
        <blockquote className="border-l-4 border-rose-500/50 bg-rose-950/10 p-4 my-4 rounded-r-xl italic text-slate-400 shadow-inner" {...props} />
    ),
    code: ({inline, ...props}: any) => (
        inline 
        ? <code className="bg-slate-800 text-rose-300 px-1.5 py-0.5 rounded font-mono text-xs border border-white/10" {...props} />
        : <div className="overflow-x-auto my-4"><pre className="bg-slate-950 p-4 rounded-xl border border-white/10 text-xs text-slate-300 font-mono shadow-xl" {...props} /></div>
    ),
    hr: () => <hr className="border-white/10 my-6" />
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

  const [realtimePrices, setRealtimePrices] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  const uniqueChartId = useMemo(() => `chart-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  const quantMetrics = useMemo(() => {
      try {
          if (!selectedStock) return null;

          const conviction = selectedStock.convictionScore || selectedStock.compositeAlpha || 50;
          const entry = selectedStock.supportLevel || selectedStock.price * 0.98;
          const stop = selectedStock.stopLoss || selectedStock.price * 0.95;
          const target = selectedStock.resistanceLevel || selectedStock.price * 1.10;
          
          const roe = selectedStock.roe || 15; 
          const ictScore = selectedStock.ictScore || conviction; 
          const intrinsic = selectedStock.intrinsicValue || selectedStock.price;
          
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
          
          const Q = 1 - P;
          let kellyRaw = P - (Q / B);
          if (kellyRaw < 0) kellyRaw = 0;
          
          const halfKelly = Math.min((kellyRaw * 0.5 * 100), 20.0);
          
          const riskPerShare = Math.max(0.01, entry - stop);
          const vapsQty = Math.floor(1000 / riskPerShare);
          const vapsAllocation = (vapsQty * entry) / 1000; 

          const upside = ((target - entry) / entry) * 100;
          const erci = upside * Math.log10(conviction || 10) * (ictScore / 100);
          
          const qmScore = (roe * 0.4) + (ictScore * 0.6);
          
          const sorosRatio = B * (ictScore / 50);

          const ivg = selectedStock.fairValueGap || ((intrinsic - selectedStock.price)/selectedStock.price * 100);

          const squeeze = selectedStock.techMetrics?.squeezeState === 'SQUEEZE_ON';
          const displacement = selectedStock.ictMetrics?.displacement > 60;
          const convexity = squeeze ? (displacement ? "Explosive" : "Building") : "Standard";
          
          const ifs = selectedStock.ictMetrics?.smartMoneyFlow || 50;

          const expectancy = (P * B) - (Q * 1);
          
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
      const currentCandidates = resultsCache[selectedBrain] || [];
      const symbolsToTrack = currentCandidates.map(s => s.symbol);

      if (activeTab === 'INDIVIDUAL' && symbolsToTrack.length > 0 && polygonKey) {
          
          if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
          }

          console.log(`[Polygon WS] Initiating connection for: ${symbolsToTrack.join(', ')}`);
          
          const ws = new WebSocket('wss://socket.polygon.io/stocks');
          wsRef.current = ws;
          
          ws.onopen = () => {
              console.log("[Polygon WS] Connected. Sending Auth...");
              ws.send(JSON.stringify({ action: 'auth', params: polygonKey }));
          };

          ws.onmessage = (e) => {
              try {
                  const data = JSON.parse(e.data);
                  
                  data.forEach((msg: any) => {
                      if (msg.ev === 'status' && msg.status === 'auth_success') {
                          console.log("[Polygon WS] Auth Success. Subscribing...");
                          const subs = symbolsToTrack.map(s => `T.${s}`).join(',');
                          ws.send(JSON.stringify({ action: 'subscribe', params: subs }));
                      }

                      if (msg.ev === 'status' && msg.status === 'error') {
                          console.error("[Polygon WS] Error:", msg.message);
                      }

                      if ((msg.ev === 'T' || msg.ev === 'A') && msg.sym) {
                          const price = msg.p || msg.c; 
                          if (!price) return;

                          setRealtimePrices(prev => {
                              const currentData = prev[msg.sym];
                              const oldPrice = currentData?.price || 0;
                              
                              let direction: 'up' | 'down' | null = null;
                              if (price > oldPrice) direction = 'up';
                              else if (price < oldPrice) direction = 'down';
                              
                              if (price === oldPrice && currentData) return prev;

                              return { 
                                  ...prev, 
                                  [msg.sym]: { price: price, direction } 
                              };
                          });
                          
                          if (price !== (realtimePrices[msg.sym]?.price || 0)) {
                              setTimeout(() => {
                                  setRealtimePrices(prev => {
                                      if (!prev[msg.sym]) return prev;
                                      return { 
                                          ...prev, 
                                          [msg.sym]: { ...prev[msg.sym], direction: null } 
                                      };
                                  });
                              }, 1000); 
                          }
                      }
                  });
              } catch (err) {
                  console.error("[Polygon WS] Message Parse Error", err);
              }
          };

          ws.onerror = (err) => {
              console.error("[Polygon WS] Connection Error", err);
          };
          
          return () => {
              if (wsRef.current) wsRef.current.close();
          };
      }
  }, [activeTab, resultsCache, selectedBrain, polygonKey]); 

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
        addLog("AUTO-PILOT: Initiating Final Alpha Synthesis...", "signal");
        setAutoPhase('ENGINE');
        handleExecuteEngine();
    }
  }, [autoStart, autoPhase, loading, elite50]);

  useEffect(() => {
      const hasResults = resultsCache[selectedBrain]?.length;
      if (autoStart && autoPhase === 'ENGINE' && !loading && hasResults) {
          addLog("AUTO-PILOT: Switching to Portfolio Matrix Audit...", "signal");
          setActiveTab('MATRIX');
          setAutoPhase('MATRIX');
          setTimeout(() => {
              handleRunMatrixAudit(selectedBrain);
          }, 1000);
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
                  addLog("Brief Gen Failed. Sending full report.", "err");
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

  const cleanInsightText = (text: any) => {
    if (!text) return "";
    let str = String(text);
    
    // 0. Clean formatting
    str = str.replace(/\\n/g, '\n').replace(/\r/g, '');

    // 1. Remove Emojis
    str = str
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") 
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") 
      .replace(/[🚀📈📉📊💰💎🔥✨⚡️🎯🛑✅❌⚠️💀🚨🛑🟢🔴🔵🟣🔸🔹🔶🔷🔳🔳🔲👍👎👉👈]/g, "") 
      .replace(/\[\d+\]/g, '');

    // 2. Formatting Fix: Ensure Headers have space before them
    str = str.replace(/([^\n])\s*(#{1,3})/g, '$1\n\n$2');

    // 3. Formatting Fix: Ensure Lists are clean
    str = str.replace(/([^\n])\s*-\s/g, '$1\n- ');

    // 4. Handle "Personas" - make them bold and on new lines if they look like keys
    const personas = ['보수적 퀀트', '공격적 트레이더', '마켓 메이커', 'Conservative Quant', 'Aggressive Trader', 'Market Maker', '종합 분석', 'Comprehensive Analysis'];
    personas.forEach(p => {
         // Replace "Role :" or "- Role :" with "\n- **Role** :"
         const regex = new RegExp(`(?:^|\\n)[-*]?\\s*${p}\\s*:?`, 'g');
         str = str.replace(regex, `\n- **${p}** :`);
    });

    // 5. Remove empty list items or double bullets
    str = str.replace(/^\s*-\s*$/gm, ''); 
    str = str.replace(/- -/g, '-');
    
    // 6. Final Trim and Spacing
    str = str.replace(/\n\n\n+/g, '\n\n').trim();
    
    return str;
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

  const getKstTimestamp = () => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', '_').replace(/\..+/, '').replace(/:/g, '-');
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

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
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
        } else {
             addLog(`Error: Stage 5 data empty.`, "err");
        }
      } else {
          addLog("Stage 5 data not found in Drive. Please run Stage 5.", "err");
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); }
  };

  const handleExecuteEngine = async () => {
    if (loading) return;
    setLoading(true);
    let currentProvider = selectedBrain;
    
    addLog(`Initiating Neural Alpha Sieve via ${currentProvider}...`, "signal");
    
    try {
      const topCandidates = [...elite50].sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 12);
      if (topCandidates.length === 0) throw new Error("No candidates available to analyze. Please ensure Stage 5 has completed successfully.");

      let response = await generateAlphaSynthesis(topCandidates, currentProvider);
      
      if (response.error && currentProvider === ApiProvider.GEMINI) {
          addLog(`Gemini Engine Failed: ${response.error}`, "warn");
          setSelectedBrain(ApiProvider.PERPLEXITY);
          
          if (autoStart) {
              addLog("AUTO-PILOT: Switching to Sonar & Retrying...", "signal");
              currentProvider = ApiProvider.PERPLEXITY; 
              response = await generateAlphaSynthesis(topCandidates, ApiProvider.PERPLEXITY);
          } else {
              addLog("Gemini Unavailable. System toggled to Sonar. Click Execute to retry.", "info");
              setLoading(false);
              return; 
          }
      }

      if (response.error) throw new Error(response.error);

      const safeAiResults = Array.isArray(response.data) ? response.data : (response.data ? [response.data] : []);
      
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
      
      if (mergedFinal.length > 0) {
          const first = mergedFinal[0];
          setSelectedStock(first);
          onStockSelected?.(first);
          onFinalSymbolsDetected?.(mergedFinal.map(t => t.symbol), mergedFinal);
          
          if(accessToken) {
              const timestamp = getKstTimestamp();
              const fileName = `STAGE6_ALPHA_CANDIDATES_${timestamp}.json`;
              const payload = {
                  manifest: { version: "9.9.9", count: mergedFinal.length, timestamp: new Date().toISOString(), strategy: "Neural_Alpha_Sieve" },
                  alpha_candidates: mergedFinal 
              };
              const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
              await uploadFile(accessToken, folderId, fileName, payload);
              addLog(`Saved Alpha Candidates: ${fileName}`, "ok");
          }
      }

      addLog(`${mergedFinal.length} Alpha targets identified and mapped via ${currentProvider}.`, "ok");

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
            mode: 'PORTFOLIO',
            targetStock: undefined 
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
                    mode: 'PORTFOLIO',
                    targetStock: undefined
                 }, targetBrain);
             }
        }
        
        const safeReport = String(report || "No analysis returned from neural engine.");
        setMatrixReports(prev => ({ ...prev, [targetBrain]: safeReport }));
        
        const token = sessionStorage.getItem('gdrive_access_token');
        if (token) {
           const timestamp = getKstTimestamp();
           const brainLabel = targetBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
           const fileName = `PORTFOLIO_MATRIX_AUDIT_${brainLabel}_${timestamp}.md`;
           
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
        
        if(accessToken) {
            const timestamp = getKstTimestamp();
            const fileName = `TELEGRAM_BRIEF_REPORT_${timestamp}.md`;
            await archiveReport(accessToken, fileName, brief);
            addLog("Telegram Brief Archived to Drive.", "info");
        }

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

      const safeMetrics = {
          winRate: data.metrics?.winRate || "0%",
          profitFactor: data.metrics?.profitFactor || "0",
          maxDrawdown: data.metrics?.maxDrawdown || "0%",
          sharpeRatio: data.metrics?.sharpeRatio || "0"
      };
      
      const safeContext = data.historicalContext || "Analysis data unavailable.";
      setBacktestData(prev => ({ 
        ...prev, 
        [stock.symbol]: { 
            ...data, 
            metrics: safeMetrics, 
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
      const winRate = parseFloat(String(metrics?.winRate || "60").replace(/[^0-9.]/g, '')) || 60;
      const profitFactor = parseFloat(String(metrics?.profitFactor || "1.5").replace(/[^0-9.]/g, '')) || 1.8;
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
        } else if (currentBacktest.metrics) {
            rawData = generateSyntheticData(currentBacktest.metrics);
        } else {
            rawData = generateSyntheticData({ winRate: "50%", profitFactor: "1.2" });
        }

        if (rawData.length === 0) return [];

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

  const getTacticalPosition = (price: number, entry: number, target: number, stop: number) => {
      const range = target - stop;
      if (Math.abs(range) < 0.0001) return 50; 
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

  const copyReport = () => {
    if (selectedStock?.investmentOutlook) {
      navigator.clipboard.writeText(selectedStock.investmentOutlook);
      alert("Report copied to clipboard.");
    }
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
                        <p className="text-2xl font-black text-emerald-400 italic">{selectedStock.convictionScore}%</p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-8">
                         {/* CHART & REPORT */}
                         <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative group">
                            <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90 border-none" />
                         </div>

                          <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                            {/* REDESIGNED HEADER: Dynamic and Unified */}
                            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                                <h4 className="text-2xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-red-600 border-b-2 border-rose-500 pb-1">
                                    NEURAL INVESTMENT OUTLOOK
                                </h4>
                                <div className="flex gap-3">
                                    <button onClick={copyReport} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">Copy Report</button>
                                </div>
                            </div>
                            
                            <div className="prose-report min-h-[200px]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {cleanInsightText(removeCitations(selectedStock.investmentOutlook)) || "_Analyzing strategic datasets for this asset..._"}
                                </ReactMarkdown>
                            </div>
                        </div>
                     </div>
                     <div className="lg:col-span-2 space-y-6 relative">
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
                            <div className="space-y-4 relative p-4 rounded-[30px] border border-white/5 bg-black/20">
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

                                {/* Detail Overlay - Positioned RELATIVE to this Grid with Improved Design */}
                                {activeAlphaInsight && FRAMEWORK_INSIGHTS[activeAlphaInsight] && (
                                    <div className="absolute right-0 w-[300%] md:w-[650px] bottom-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-[#0f172a] p-6 rounded-[24px] border border-slate-700 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] relative">
                                            <button onClick={() => setActiveAlphaInsight(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                            
                                            <div className="flex flex-col gap-4">
                                                {/* Header */}
                                                <div>
                                                    <h5 className="text-sm font-bold text-white tracking-wide flex items-center gap-3 mb-2">
                                                        <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                                                        {FRAMEWORK_INSIGHTS[activeAlphaInsight].title}
                                                    </h5>
                                                    <p className="text-[12px] text-slate-400 leading-relaxed pl-4 border-l border-white/5 whitespace-pre-wrap">
                                                        {FRAMEWORK_INSIGHTS[activeAlphaInsight].desc}
                                                    </p>
                                                </div>

                                                {/* Strategy/Insight Box */}
                                                <div className="bg-[#1e293b] p-5 rounded-xl border border-white/5 relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                                    <div className="flex items-start gap-3 relative z-10">
                                                        <div className="mt-0.5 p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 shrink-0">
                                                            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Alpha Insight</p>
                                                            <p className="text-[12px] text-slate-200 leading-relaxed font-semibold whitespace-pre-wrap">
                                                                {FRAMEWORK_INSIGHTS[activeAlphaInsight].strategy}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                     </div>
                 </div>

                 <div className="mt-8 border-t border-white/5 pt-8">
                    <div className="flex justify-between items-end mb-6">
                        <div className="flex items-center gap-4">
                            <div>
                                <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1 italic">Quant_Backtest_Protocol</h4>
                                {currentBacktest && (
                                    <p className="text-[9px] text-slate-500 font-mono font-bold">
                                        SIMULATION PERIOD: <span className="text-emerald-500">{currentBacktest.simulationPeriod}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                        
                        {!currentBacktest && (
                            <button 
                                onClick={(e) => handleRunBacktest(selectedStock, e)} 
                                disabled={backtestLoading}
                                className="px-6 py-3 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg"
                            >
                                {backtestLoading ? "Running Simulation..." : "Run Portfolio Simulation"}
                            </button>
                        )}
                    </div>

                    {currentBacktest ? (
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                             {/* Metrics Column */}
                             <div className="flex flex-col gap-4">
                                 <div className="space-y-3">
                                     {[
                                         { key: 'WIN_RATE', val: currentBacktest.metrics.winRate, color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500' },
                                         { key: 'PROFIT_FACTOR', val: currentBacktest.metrics.profitFactor, color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500' },
                                         { key: 'MAX_DRAWDOWN', val: currentBacktest.metrics.maxDrawdown, color: 'text-rose-400', bg: 'bg-rose-500/20', border: 'border-rose-500' },
                                         { key: 'SHARPE_RATIO', val: currentBacktest.metrics.sharpeRatio, color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500' }
                                     ].map(m => (
                                         <div 
                                            key={m.key}
                                            onClick={() => handleMetricClick(m.key, m.val)}
                                            className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-105 active:scale-95 flex justify-between items-center ${activeOverlay === m.key ? `${m.bg} ${m.border} text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]` : 'bg-black/40 border-white/5 hover:bg-white/5'}`}
                                         >
                                             <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{METRIC_DEFINITIONS[m.key].title}</span>
                                             <span className={`text-lg font-black ${m.color} italic`}>{m.val}</span>
                                         </div>
                                     ))}
                                 </div>

                                 {/* Metric Overlay Info */}
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

                             {/* Chart Column */}
                             <div className="lg:col-span-3 flex flex-col gap-6">
                                 <div className="bg-black/40 rounded-[30px] border border-white/5 p-6 relative h-[320px] flex flex-col">
                                     <div className="flex justify-between items-start mb-4">
                                          <div>
                                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">24-Month Quant Analysis Portfolio Growth</p>
                                              <div className="flex items-center gap-3 mt-1">
                                                  <span className={`text-3xl font-black italic tracking-tighter ${chartData.length > 0 && chartData[chartData.length - 1].value >= 0 ? 'text-white' : 'text-rose-400'}`}>
                                                      {chartData.length > 0 ? (chartData[chartData.length - 1].value >= 0 ? '+' : '') + chartData[chartData.length - 1].value + '%' : '0%'}
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
                                                  <RechartsTooltip 
                                                      contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px' }}
                                                      itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                                      labelStyle={{ color: '#94a3b8', fontSize: '9px', marginBottom: '4px' }}
                                                      formatter={(val: number, name: string) => {
                                                          if (name === 'value') return [`${val}%`, 'Return'];
                                                          if (name === 'drawdown') return [`${val}%`, 'Drawdown'];
                                                          if (name === 'delta') return [`${val}%`, 'Period Change'];
                                                          return [val, name];
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
                                                  {activeOverlay === 'SHARPE_RATIO' && chartData.length > 1 && (
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
                                                              segment={[
                                                                  { x: chartData[0]?.period, y: 0 }, 
                                                                  { x: chartData[chartData.length-1]?.period, y: chartData[chartData.length-1]?.value ?? 0 }
                                                              ]}
                                                          />
                                                      </>
                                                  )}
                                                  
                                                  <Area 
                                                      type="monotone" 
                                                      dataKey="value" 
                                                      stroke={chartColor} 
                                                      strokeWidth={2} 
                                                      fillOpacity={1} 
                                                      fill={`url(#${uniqueChartId})`} 
                                                      animationDuration={1500}
                                                      dot={activeOverlay === 'WIN_RATE' ? (props: any) => {
                                                          const { cx, cy, payload } = props;
                                                          const isWin = payload.isWin;
                                                          return <circle cx={cx} cy={cy} r={3} fill={isWin ? "#10b981" : "#ef4444"} stroke="#020617" strokeWidth={1} key={`dot-${payload.period}`} className="animate-in fade-in duration-500" />;
                                                      } : false}
                                                  />
                                              </ComposedChart>
                                          </ResponsiveContainer>
                                     </div>
                                 </div>

                                 {/* Historical Context */}
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
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            </div>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Ready to Execute Backtest Protocol</p>
                        </div>
                    )}
                 </div>
             </div>
        )}
      </div>

      {/* LOG TERMINAL */}
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
