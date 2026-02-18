
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell, AreaChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { generateAlphaSynthesis, runAiBacktest, analyzePipelineStatus, generateTelegramBrief, archiveReport, removeCitations } from '../services/intelligenceService';
import { sendTelegramReport } from '../services/telegramService';

// ... (Interfaces remain same) ...
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
  isHiddenGem?: boolean;
  isImputed?: boolean;
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
  isVisible?: boolean;
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
        desc: "승률(P)과 손익비(B)를 기반으로 파산 위험을 0으로 수렴시키는 수학적 최적 투자 비중입니다.\n\n`K% = P - (1-P)/B`",
        strategy: "이 값은 '권장 상한선(Max Cap)'입니다. \n- 20% 근접: 확신도가 매우 높음 (적극 투자)\n- 10% 미만: 일반적인 기회 (분산 투자)\n*계산된 %의 50~80%만 집행하는 것이 안전합니다."
    },
    'VAPS': {
        title: "VAPS (변동성 조정 수량)",
        desc: "1회 거래당 총 자산의 1%만 잃도록 설계된 수량 산출 공식입니다 (Volatility Adjusted Position Sizing).\n\n`Qty = (Capital * 0.01) / (Entry - Stop)`",
        strategy: "수량이 많음 = 손절폭이 짧음 (리스크가 적음)\n- 수량이 적음 = 손절폭이 큼 (변동성이 큼)\n*이 수량대로 매수하면 손절가 도달 시 딱 1%의 자산만 감소합니다."
    },
    'RISK_REWARD': {
        title: "Risk:Reward Ratio (손익비)",
        desc: "진입가 대비 목표가(수익)와 손절가(손실)의 비율입니다.\n\n`RR = (Target - Entry) / (Entry - Stop)`",
        strategy: "수치 해석:\n- 1:3 이상: 이상적인 진입 구간 (작게 잃고 크게 범)\n- 1:2 미만: 승률이 60% 이상일 때만 진입 고려"
    },
    'ERCI': {
        title: "ERCI (효율성 지수)",
        desc: "단위 리스크당 기대할 수 있는 수익의 효율(Efficiency)을 나타냅니다. (상승여력 × 확신도 × 수급).\n\n`ERCI = Upside% * log(Conviction) * Flow`",
        strategy: "수치 해석 (높을수록 좋음):\n- 10.0 이상: 양호 (Good)\n- 30.0 이상: 초고효율 (Elite) - 우선 순위로 편입하십시오."
    },
    'QM_COMP': {
        title: "Q-M Composite (품질+모멘텀)",
        desc: "ROE(품질)와 ICT(모멘텀)를 결합하여 '우량주가 달리기 시작하는 시점'을 포착합니다.\n\n`QM = (ROE * 0.4) + (ICT * 0.6)`",
        strategy: "수치 해석 (높을수록 좋음):\n- 50점 이상: 펀더멘털과 수급이 모두 양호함\n- 70점 이상: 강력한 주도주 후보"
    },
    'IVG': {
        title: "IVG (내재가치 괴리율)",
        desc: "현재 주가가 내재가치(Intrinsic Value) 대비 얼마나 저렴한지 나타냅니다.\n\n`IVG = (Intrinsic - Price) / Price`",
        strategy: "수치 해석:\n- 양수(+): 저평가 상태 (안전마진 확보, 매수 유리)\n- 음수(-): 고평가 상태 (프리미엄 지불, 추격 매수 주의)"
    },
    'SOROS': {
        title: "Soros Ratio (변동성 대비 수익)",
        desc: "단위 변동성당 창출되는 초과 수익입니다. 베타(Beta)가 낮을수록 점수가 높아집니다.\n\n`Soros = (ProfitFactor * ICT) / Beta`",
        strategy: "수치 해석:\n- 2.0 이상: 시장 무관하게 수익을 내는 'Alpha' 종목\n- 1.0 미만: 시장 지수 추종형 (Beta) 종목"
    },
    'CONVEXITY': {
        title: "Alpha Convexity (폭발력)",
        desc: "에너지 응축(Squeeze)과 발산(Displacement)의 결합 상태입니다.",
        strategy: "상태 해석:\n- 'Explosive': 에너지가 응축된 후 세력이 방향을 잡음 (곧 시세 분출)\n- 'Building': 에너지만 모이고 있음 (대기)\n- 'Standard': 일반적인 변동성"
    },
    'IFS': {
        title: "IFS (기관 수급 점수)",
        desc: "기관(Smart Money)의 자금 유입 강도를 0~100으로 수치화했습니다.",
        strategy: "수치 해석 (높을수록 좋음):\n- 70점 초과: 세력이 적극 매집 중 (등에 올라타십시오)\n- 50점 미만: 세력 이탈 또는 관망세"
    },
    'MRF': {
        title: "MRF (시장 국면)",
        desc: "해당 종목의 현재 위치한 와이코프(Wyckoff) 시장 국면을 진단합니다.",
        strategy: "상태 해석:\n- 'Accumulation': 바닥권 매집 (저점 매수 기회)\n- 'Markup': 상승 추세 (비중 확대)\n- 'Distribution': 천장권 분산 (매도 관점)"
    },
    'PATTERN': {
        title: "Technical Pattern (차트 패턴)",
        desc: "현재 차트에서 식별된 주요 기술적 패턴입니다.",
        strategy: "주요 패턴:\n- Wyckoff SOS: 강세 신호 (Sign of Strength)\n- Cup & Handle: 지속형 상승 패턴\n- Bull Flag: 급등 후 건전한 조정"
    },
    'EXPECTANCY': {
        title: "Expectancy (기대값)",
        desc: "이 매매를 100번 반복했을 때, 1회당 평균적으로 얻을 수 있는 수익(R)입니다.\n\n`Exp = (Win% * AvgWin) - (Loss% * AvgLoss)`",
        strategy: "수치 해석 (높을수록 좋음):\n- 0.5R 이상: 훌륭한 시스템 (수익 우상향)\n- 0.2R 미만: 거래 비용 고려 시 손해 가능성 높음"
    },
    'AIC': {
        title: "AIC (AI 합의)",
        desc: "여러 AI 모델(Gemini, Perplexity)간의 분석 일치도입니다.",
        strategy: "수치 해석:\n- 80% 이상: AI들의 의견이 강력하게 일치 (신뢰도 높음)\n- 50% 주변: 의견 엇갈림 (독자적 판단 필요)"
    },
    'SENTIMENT': {
        title: "News Sentiment (뉴스 심리)",
        desc: "최근 48시간 내 뉴스 기사 및 미디어의 감성을 분석한 점수입니다.",
        strategy: "해석:\n- Positive: 호재성 재료 지배적 (모멘텀 강화)\n- Negative: 악재 발생 (기술적 지표가 좋아도 진입 보류)"
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

// [FORCED STYLE FIX] Markdown Component Overrides
const MarkdownComponents: any = {
    h1: (props: any) => (
        <h1 className="text-xl font-bold text-white mt-4 mb-2 border-none" {...props} />
    ),
    h2: (props: any) => {
        const extractText = (node: any): string => {
             if (typeof node === 'string') return node;
             if (Array.isArray(node)) return node.map(extractText).join('');
             if (node && node.props && node.props.children) return extractText(node.props.children);
             return String(node || "");
        };

        const text = extractText(props.children);
        
        // Find the LAST opening parenthesis to split Main Title vs (Subtitle)
        const lastParenIndex = text.lastIndexOf('(');
        const isEndParen = text.trim().endsWith(')');

        if (lastParenIndex > 0 && isEndParen) {
            const mainTitle = text.substring(0, lastParenIndex).trim();
            const subTitle = text.substring(lastParenIndex).trim();
            
            // [CUSTOM STYLE RESTORED]
            return (
                <h3 className="text-xl font-bold text-white mb-4 flex items-baseline gap-2">
                    {mainTitle}
                    <span className="text-lg font-medium text-gray-400">{subTitle}</span>
                </h3>
            );
        }
        
        // Fallback for headers without parenthesis
        return <h3 className="text-xl font-bold text-white mb-4">{props.children}</h3>;
    },
    h3: (props: any) => (
        <h3 className="text-sm font-bold text-blue-400 mt-3 mb-1" {...props} />
    ),
    p: (props: any) => (
        <p className="text-[13px] text-slate-300 leading-relaxed mb-2" {...props} />
    ),
    ul: (props: any) => <ul className="space-y-1.5 mb-3" {...props} />,
    ol: (props: any) => <ol className="space-y-1.5 mb-3" {...props} />,
    li: (props: any) => (
        <li className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed pl-1" {...props}>
            <span className="text-emerald-500 mt-1 shrink-0 font-bold">→</span>
            <span className="flex-1">{props.children}</span>
        </li>
    ),
    strong: (props: any) => (
        <span className="inline-block bg-emerald-950/40 text-emerald-400 font-bold px-2 py-0.5 rounded border border-emerald-500/20 text-xs shadow-sm mr-1.5 align-middle tracking-tight">
            {props.children}
        </span>
    ),
    blockquote: (props: any) => (
        <blockquote className="border-l-4 border-emerald-500/30 bg-emerald-950/10 p-3 my-3 rounded-r-lg italic text-slate-400 text-xs" {...props} />
    ),
    code: ({inline, ...props}: any) => (
        inline 
        ? <code className="bg-slate-800 text-emerald-300 px-1 py-0.5 rounded font-mono text-[10px] border border-white/10" {...props} />
        : <div className="overflow-x-auto my-3"><pre className="bg-slate-950 p-3 rounded-xl border border-white/10 text-[10px] text-slate-300 font-mono" {...props} /></div>
    ),
    hr: () => <div className="h-2" /> 
};

// ... (Rest of the file remains same logic) ...
const generateNormalDistribution = (mean: number, stdDev: number, limit: number = 4) => {
  const data = [];
  const min = mean - limit * stdDev;
  const max = mean + limit * stdDev;
  const step = (max - min) / 60; // Resolution
  
  for (let x = min; x <= max; x += step) {
    const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2));
    data.push({ 
        x: Number(x.toFixed(1)), 
        y: y, 
        isProfit: x > 0 
    });
  }
  return data;
};

// Legend Strategy Badges Helper
const getLegendStrategy = (logicStr: string = "") => {
    const s = logicStr.toLowerCase();
    if (s.includes("graham") || s.includes("value dean")) return { name: "Benjamin Graham", type: "Value", color: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/10" };
    if (s.includes("lynch") || s.includes("growth hunter")) return { name: "Peter Lynch", type: "GARP", color: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/10" };
    if (s.includes("buffett") || s.includes("moat")) return { name: "Warren Buffett", type: "Moat", color: "text-blue-400", border: "border-blue-500/30", bg: "bg-blue-500/10" };
    if (s.includes("o'neil") || s.includes("canslim") || s.includes("momentum")) return { name: "William O'Neil", type: "Momentum", color: "text-rose-400", border: "border-rose-500/30", bg: "bg-rose-500/10" };
    if (s.includes("munger") || s.includes("quality")) return { name: "Charlie Munger", type: "Quality", color: "text-violet-400", border: "border-violet-500/30", bg: "bg-violet-500/10" };
    if (s.includes("wood") || s.includes("disrupt")) return { name: "Cathie Wood", type: "Innovation", color: "text-fuchsia-400", border: "border-fuchsia-500/30", bg: "bg-fuchsia-500/10" };
    if (s.includes("greenberg") || s.includes("conviction")) return { name: "Glenn Greenberg", type: "Concentrated", color: "text-cyan-400", border: "border-cyan-500/30", bg: "bg-cyan-500/10" };
    if (s.includes("welling") || s.includes("activist")) return { name: "Glenn Welling", type: "Event", color: "text-indigo-400", border: "border-indigo-500/30", bg: "bg-indigo-500/10" };
    return null;
};

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected, onStockSelected, analyzingSymbols = new Set(), autoStart, onComplete, isVisible = true }) => {
  const [activeTab, setActiveTab] = useState<'INDIVIDUAL' | 'MATRIX'>('INDIVIDUAL');
  const [loading, setLoading] = useState(false);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [resultsCache, setResultsCache] = useState<{ [key in ApiProvider]?: AlphaCandidate[] }>({});
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [backtestData, setBacktestData] = useState<{ [symbol: string]: BacktestResult }>({});
  
  const [matrixReports, setMatrixReports] = useState<{ [key in ApiProvider]?: string }>({});
  const [matrixBrain, setMatrixBrain] = useState<ApiProvider>(ApiProvider.GEMINI);
  
  const [sendingTelegram, setSendingTelegram] = useState(false);

  // Define derived state explicitly to avoid scope issues
  const currentResults = (resultsCache[selectedBrain] || []).sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0));
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string; key: string; overlayDesc: string } | null>(null);
  
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeAlphaInsight, setActiveAlphaInsight] = useState<string | null>(null); 

  const [autoPhase, setAutoPhase] = useState<'IDLE' | 'ENGINE' | 'MATRIX' | 'DONE'>('IDLE');
  
  const [realtimePrices, setRealtimePrices] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  const uniqueChartId = useMemo(() => `chart-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  // [NEW] Distribution Data Calculation Logic
  const distributionData = useMemo(() => {
    if (!selectedStock) return null;
    let mean = 10; 
    if (selectedStock.expectedReturn) {
        const match = selectedStock.expectedReturn.match(/([+-]?\d+\.?\d*)%/);
        if (match) mean = parseFloat(match[1]);
    } else {
        mean = (selectedStock.convictionScore || 50) / 4; 
    }
    let stdDev = 15;
    if (selectedStock.convictionScore) {
        stdDev = Math.max(5, 30 - (selectedStock.convictionScore * 0.25)); 
    }
    return generateNormalDistribution(mean, stdDev);
  }, [selectedStock]);

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
          const beta = selectedStock.beta || 1.0;
          const sorosRatio = beta > 0 ? (B * (ictScore / 50)) / beta : B;
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
                  riskPerShare: riskPerShare.toFixed(2),
                  riskReward: B.toFixed(2)
              },
              selection: {
                  erci: erci.toFixed(1),
                  qm: qmScore.toFixed(0),
                  ivg: ivg.toFixed(1),
                  soros: sorosRatio.toFixed(2)
              },
              timing: {
                  convexity,
                  ifs: ifs.toFixed(0),
                  mrf: selectedStock.marketState || 'Neutral',
                  pattern: selectedStock.chartPattern || 'N/A'
              },
              system: {
                  expectancy: expectancy.toFixed(2),
                  aic: aic,
                  sentiment: selectedStock.newsSentiment || 'Neutral'
              },
              radarData: [
                  { subject: 'Conviction', A: conviction, fullMark: 100 },
                  { subject: 'Sentiment', A: (selectedStock.newsScore || 0.5) * 100, fullMark: 100 },
                  { subject: 'Technical', A: selectedStock.technicalScore || 50, fullMark: 100 },
                  { subject: 'Fundamental', A: selectedStock.fundamentalScore || 50, fullMark: 100 },
                  { subject: 'ICT', A: selectedStock.ictScore || 50, fullMark: 100 }
              ]
          };
      } catch (e) {
          console.error("Quant Metrics Error", e);
          return null;
      }
  }, [selectedStock, backtestData]);

  // ... (Effects and other handlers remain same) ...

  const cleanInsightText = (text: any) => {
    if (!text) return "";
    let str = String(text);
    str = str.replace(/\\n/g, '\n').replace(/\r/g, '');
    str = str
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") 
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") 
      .replace(/[🚀📈📉📊💰💎🔥✨⚡️🎯🛑✅❌⚠️💀🚨🛑🟢🔴🔵🟣🔸🔹🔶🔷🔳🔳🔲👍👎👉👈]/g, "") 
      .replace(/\[\d+\]/g, '');
    str = str.replace(/([^\n])\s*(#{1,3})/g, '$1\n\n$2');
    str = str.replace(/([^\n])\s*-\s/g, '$1\n- ');
    const personas = ['보수적 퀀트', '공격적 트레이더', '마켓 메이커', 'Conservative Quant', 'Aggressive Trader', 'Market Maker', '종합 분석', 'Comprehensive Analysis'];
    personas.forEach(p => {
         const regex = new RegExp(`(?:^|\\n)[-*]?\\s*${p}\\s*:?`, 'g');
         str = str.replace(regex, `\n- **${p}** :`);
    });
    str = str.replace(/^\s*-\s*$/gm, ''); 
    str = str.replace(/- -/g, '-');
    str = str.replace(/\n\n\n+/g, '\n\n').trim();
    return str;
  };

  const cleanMarkdown = cleanInsightText;

  const getKstTimestamp = () => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', '_').replace(/\..+/, '').replace(/:/g, '-');
  };

  useEffect(() => {
      const symbolsToTrack = currentResults.map(s => s.symbol);

      if (activeTab === 'INDIVIDUAL' && symbolsToTrack.length > 0 && finnhubKey) {
          if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
          }
          console.log(`[Finnhub WS] Initiating connection for: ${symbolsToTrack.join(', ')}`);
          const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
          wsRef.current = ws;
          ws.onopen = () => {
              symbolsToTrack.forEach(sym => {
                  ws.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
              });
          };
          ws.onmessage = (e) => {
              try {
                  const msg = JSON.parse(e.data);
                  if (msg.type === 'trade' && msg.data) {
                      msg.data.forEach((trade: any) => {
                          const price = trade.p;
                          const sym = trade.s;
                          setRealtimePrices(prev => {
                              const currentData = prev[sym];
                              const oldPrice = currentData?.price || 0;
                              let direction: 'up' | 'down' | null = null;
                              if (price > oldPrice) direction = 'up';
                              else if (price < oldPrice) direction = 'down';
                              if (price === oldPrice && currentData) return prev;
                              return { ...prev, [sym]: { price: price, direction } };
                          });
                          setTimeout(() => {
                              setRealtimePrices(prev => {
                                  if (!prev[sym]) return prev;
                                  return { ...prev, [sym]: { ...prev[sym], direction: null } };
                              });
                          }, 1000);
                      });
                  }
              } catch (err) { console.error("[Finnhub WS] Message Parse Error", err); }
          };
          ws.onerror = (err) => { console.error("[Finnhub WS] Connection Error", err); };
          return () => { if (wsRef.current) wsRef.current.close(); };
      }
  }, [activeTab, currentResults, finnhubKey]); 

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const cached = resultsCache[selectedBrain];
    if (cached && cached.length > 0) {
      const sorted = [...cached].sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0));
      if (!selectedStock || !sorted.find(c => c.symbol === selectedStock.symbol)) {
        const initialStock = sorted[0];
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
      const hasResults = resultsCache[selectedBrain]?.length || resultsCache[ApiProvider.GEMINI]?.length || resultsCache[ApiProvider.PERPLEXITY]?.length;
      
      if (autoStart && autoPhase === 'ENGINE' && !loading && hasResults) {
          addLog("AUTO-PILOT: Skipping Deep Matrix Audit (Token Saver)...", "signal");
          setActiveTab('MATRIX');
          setAutoPhase('MATRIX');
      }
  }, [autoStart, autoPhase, loading, resultsCache, selectedBrain]);

  useEffect(() => {
      const finishAutoPilot = async () => {
          const resultsToCheck = resultsCache[selectedBrain] || resultsCache[ApiProvider.GEMINI] || resultsCache[ApiProvider.PERPLEXITY] || [];
          
          if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && resultsToCheck.length > 0) {
              addLog("AUTO-PILOT: Generating Hedge Fund Brief for Telegram...", "signal");
              
              let telegramPayload = ""; 
              
              const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Telegram Brief Timeout")), 15000));
              
              try {
                  const brainToUse = resultsCache[selectedBrain] ? selectedBrain : ApiProvider.PERPLEXITY;
                  
                  const briefPromise = generateTelegramBrief(resultsToCheck, brainToUse);
                  const brief = await Promise.race([briefPromise, timeout]) as string;
                  
                  telegramPayload = brief;
                  addLog("Brief Generated. Relaying...", "ok");
              } catch (e: any) {
                  addLog(`Brief Gen Failed: ${e.message}. Sending plain status.`, "err");
                  telegramPayload = "Telegram Brief Generation Failed. Check logs.";
              }

              setAutoPhase('DONE');
              if (onComplete) onComplete(telegramPayload);
          } else if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && resultsToCheck.length === 0) {
               addLog("AUTO-PILOT: No Alpha Candidates found. Aborting.", "err");
               setAutoPhase('DONE');
               if (onComplete) onComplete("NO_CANDIDATES");
          }
      };
      
      finishAutoPilot();
  }, [autoStart, autoPhase, matrixLoading, selectedBrain, resultsCache]);

  useEffect(() => {
    setSelectedMetricInfo(null);
    setActiveOverlay(null);
    setActiveAlphaInsight(null);
  }, [selectedStock]);

  const handleStockClick = (item: AlphaCandidate) => {
      setSelectedStock(item);
      onStockSelected?.(item);
  };

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  // ... (Ensure Folder and Upload File remain same) ...
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
      const scoredCandidates = elite50.map((c: any) => {
          const gap = Number(c.fairValueGap || 0);
          const ict = Number(c.ictScore || 0);
          const rvol = Number(c.techMetrics?.rawRvol || 0);
          
          const isUndervaluedGrowth = gap > 100 && ict > 60;
          const isVolumeRunner = (c.isImputed === true) && rvol > 3.0;
          const isHiddenGem = isUndervaluedGrowth || isVolumeRunner;
          
          let sortScore = c.compositeAlpha || 0;
          if (isHiddenGem) sortScore += 25;
          
          return { ...c, isHiddenGem, sortScore };
      });

      const topCandidates = scoredCandidates
          .sort((a: any, b: any) => b.sortScore - a.sortScore)
          .slice(0, 12);
          
      if (topCandidates.length === 0) throw new Error("No candidates available to analyze. Please ensure Stage 5 has completed successfully.");

      let response;
      let usedProvider = currentProvider;

      try {
          response = await generateAlphaSynthesis(topCandidates, currentProvider);
      } catch (err: any) {
          if (currentProvider !== ApiProvider.PERPLEXITY) {
             addLog(`Primary Engine (${currentProvider}) Failed: ${err.message}. Engaging Failover...`, "warn");
             usedProvider = ApiProvider.PERPLEXITY;
             if (autoStart) setSelectedBrain(ApiProvider.PERPLEXITY); 
             response = await generateAlphaSynthesis(topCandidates, ApiProvider.PERPLEXITY);
          } else {
             throw err;
          }
      }

      if (response.error) {
           addLog(`${usedProvider} Returned Error: ${response.error}`, "warn");
           
           if (usedProvider === ApiProvider.GEMINI) {
               if (!autoStart) {
                   addLog("Gemini Quota Exceeded/Error. Switched to Sonar. Click Execute to retry.", "warn");
                   setSelectedBrain(ApiProvider.PERPLEXITY);
                   setLoading(false);
                   return;
               }

               addLog("Gemini Quota Exceeded/Error. Force-Switching to Perplexity (Sonar)...", "signal");
               setSelectedBrain(ApiProvider.PERPLEXITY);
               usedProvider = ApiProvider.PERPLEXITY;
               response = await generateAlphaSynthesis(topCandidates, ApiProvider.PERPLEXITY);
           }
      }

      if (response.error) {
          if (autoStart) {
               addLog("Synthesis Failed partially. Forcing completion to unblock pipeline.", "warn");
               response = { data: topCandidates.map((c: any) => ({ ...c, aiVerdict: 'HOLD', investmentOutlook: 'Analysis Failed. Hold for review.' })), usedProvider: 'FALLBACK' };
          } else {
               throw new Error(`Synthesis Failed after retries: ${response.error}`);
          }
      }

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
            isHiddenGem: item.isHiddenGem,
        };
      }).filter(x => x !== null) as AlphaCandidate[];
      
      const finalElite = mergedFinal.sort((a, b) => (b.convictionScore || 0) - (a.convictionScore || 0)).slice(0, 6);

      setResultsCache(prev => ({ ...prev, [usedProvider]: finalElite }));
      
      if (finalElite.length > 0) {
          const first = finalElite[0];
          setSelectedStock(first);
          onStockSelected?.(first);
          onFinalSymbolsDetected?.(finalElite.map(t => t.symbol), finalElite);
          
          if(accessToken) {
              const timestamp = getKstTimestamp();
              const fileName = `STAGE6_ALPHA_FINAL_${timestamp}.json`;
              const payload = {
                  manifest: { version: "9.9.9", count: finalElite.length, timestamp: new Date().toISOString(), strategy: "Neural_Alpha_Sieve", engine: usedProvider },
                  alpha_candidates: finalElite 
              };
              const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
              await uploadFile(accessToken, folderId, fileName, payload);
              addLog(`Saved Top 6 Alpha Candidates: ${fileName}`, "ok");
          }
      } else {
          addLog("AI returned valid JSON but no valid stock objects found.", "warn");
      }

      addLog(`${finalElite.length} Elite Alpha targets identified and mapped via ${usedProvider}.`, "ok");

    } catch (e: any) { 
        addLog(`Engine Error: ${e.message}`, "err"); 
        if (autoStart) {
             addLog("AUTO-PILOT: Critical Failure. Force-skipping Stage 6.", "warn");
             setAutoPhase('DONE');
             if (onComplete) onComplete("STAGE6_FAILED");
        }
    }
    finally { setLoading(false); }
  };

  const handleRunMatrixAudit = async (brain: ApiProvider) => {
    if (matrixLoading) return;
    setMatrixBrain(brain); 
    
    const resultsToCheck = resultsCache[brain] || resultsCache[selectedBrain] || resultsCache[ApiProvider.GEMINI] || resultsCache[ApiProvider.PERPLEXITY] || [];

    if (resultsToCheck.length === 0) {
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
            mode: 'PORTFOLIO',
            recommendedData: resultsToCheck
        }, targetBrain);

        if (report.includes("AUDIT_FAILURE") || report.includes("ERROR") || report.includes("API Key Missing")) {
             if (targetBrain === ApiProvider.GEMINI) {
                  addLog("Gemini Matrix Audit Failed. Switching to Sonar...", "warn");
                  setMatrixBrain(ApiProvider.PERPLEXITY);
                  report = await analyzePipelineStatus({
                        currentStage: 6,
                        apiStatuses: [],
                        recommendedData: resultsToCheck,
                        mode: 'PORTFOLIO'
                  }, ApiProvider.PERPLEXITY);
             }
        }
        
        setMatrixReports(prev => ({ ...prev, [targetBrain]: report }));
        addLog(`Portfolio Matrix Audit Complete.`, "ok");

        const token = sessionStorage.getItem('gdrive_access_token');
        if (token) {
             const date = new Date().toISOString().split('T')[0];
             const brainName = targetBrain === ApiProvider.GEMINI ? 'Gemini' : 'Sonar';
             const fileName = `${date}_Portfolio_Matrix_${brainName}.md`;
             archiveReport(token, fileName, report);
        }

    } catch (e: any) {
        addLog(`Matrix Error: ${e.message}`, "err");
    } finally {
        setMatrixLoading(false);
    }
  };

  const runBacktest = async (stock: AlphaCandidate, event: React.MouseEvent) => {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (backtestLoading) return;
    
    setBacktestLoading(true);
    setSelectedMetricInfo(null);
    setActiveOverlay(null);
    addLog(`Simulating Quant Protocol for ${stock.symbol}...`, "signal");

    try {
      const { data: result, error, isRealData } = await runAiBacktest(stock, selectedBrain);

      if (error) throw new Error(error);
      if (!result) throw new Error("AI returned empty data structure");
      
      const context = result.historicalContext || "Analysis data unavailable.";
      setBacktestData(prev => ({ 
          ...prev, 
          [stock.symbol]: { ...result, historicalContext: context, timestamp: Date.now(), isRealData: !!isRealData } 
      }));
      
      addLog(`Simulation complete for ${stock.symbol} ${isRealData ? '(Real Data)' : '(AI Sim)'}.`, "ok");

    } catch (e: any) {
      addLog(`Backtest Error: ${e.message}`, "err");
    } finally {
      setBacktestLoading(false);
    }
  };

  const handleMetricClick = (key: string, val: string) => {
    const def = METRIC_DEFINITIONS[key];
    if (def) {
      setSelectedMetricInfo({
        title: def.title,
        desc: def.desc,
        value: val,
        key: key,
        overlayDesc: def.overlayDesc
      });
      setActiveOverlay(prev => prev === key ? null : key);
    }
  };

  const getVerdictStyle = (verdict: string) => {
    const v = (verdict || '').toUpperCase();
    if (v.includes("STRONG")) return "bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.6)] font-black tracking-wider animate-pulse";
    if (v.includes("BUY")) return "bg-emerald-600 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] font-black tracking-wide";
    if (v.includes("SPECULATIVE")) return "bg-violet-600 text-white border-violet-500 shadow-lg font-bold";
    if (v.includes("HOLD") || v.includes("ACCUMULATE")) return "bg-slate-600 text-slate-200 border-slate-500 font-bold";
    if (v.includes("SELL")) return "bg-blue-700 text-white border-blue-500 font-bold";
    return "bg-slate-700 text-slate-300 border-slate-600";
  };

  // Chart Logic
  const backtestChartData = useMemo(() => {
    if (!currentBacktest) return [];
    let data: any[] = [];
    
    if (currentBacktest.equityCurve && Array.isArray(currentBacktest.equityCurve) && currentBacktest.equityCurve.length >= 2) {
       data = currentBacktest.equityCurve.map((point: any) => {
            const valStr = String(point.value).replace(/[^0-9.-]/g, '');
            const val = parseFloat(valStr);
            return {
                period: point.period,
                value: isNaN(val) ? 0 : val
            };
       });
    }

    let peak = -Infinity;
    return data.map((d, i) => {
       if (d.value > peak) peak = d.value;
       const drawdown = d.value - peak;
       const prevValue = i > 0 ? data[i-1].value : 0;
       const delta = d.value - prevValue;
       const isWin = d.value >= prevValue;

       const totalPeriods = data.length - 1;
       const finalVal = data[data.length - 1].value;
       const idealValue = i * (finalVal / (totalPeriods || 1));

       return {
           ...d,
           drawdown: Number(drawdown.toFixed(2)),
           peak: Number(peak.toFixed(2)),
           delta: Number(delta.toFixed(2)),
           idealValue: Number(idealValue.toFixed(2)),
           isWin
       };
    });
  }, [currentBacktest]);

  const lineColor = backtestChartData.length > 0 && backtestChartData[backtestChartData.length - 1].value >= 0 ? '#10b981' : '#ef4444';

  const formatReportText = (text: string) => text ? cleanInsightText(removeCitations(text)) : "";

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
                    <button 
                        onClick={() => setActiveTab('INDIVIDUAL')}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'INDIVIDUAL' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Individual Analysis
                    </button>
                    <button 
                        onClick={() => setActiveTab('MATRIX')}
                        className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'MATRIX' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Portfolio Matrix
                    </button>
                </div>
                {autoStart && <span className="text-[8px] mt-1 px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse block w-fit">AUTO PILOT</span>}
              </div>
            </div>
            
            <div className="flex gap-4">
              {activeTab === 'INDIVIDUAL' && (
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                   {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((b) => (
                       <button
                           key={b}
                           onClick={() => setSelectedBrain(b)}
                           className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedBrain === b ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500'}`}
                       >
                           {b === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                       </button>
                   ))}
                </div>
              )}
              {activeTab === 'INDIVIDUAL' && (
                  <button 
                    onClick={handleExecuteEngine} 
                    disabled={loading}
                    className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 animate-pulse text-slate-500' : 'bg-rose-600 text-white hover:brightness-110 active:scale-95 shadow-rose-900/20'}`}
                  >
                    {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
                  </button>
              )}
            </div>
          </div>

          {activeTab === 'INDIVIDUAL' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {currentResults.length > 0 ? (
                  currentResults.map((item) => {
                      const isSelected = selectedStock?.symbol === item.symbol;
                      const isAnalyzing = analyzingSymbols.has(item.symbol);
                      return (
                        <div 
                          key={item.symbol}
                          onClick={() => handleStockClick(item)}
                          className={`glass-panel p-5 rounded-[35px] border cursor-pointer transition-all relative overflow-hidden flex flex-col h-[240px] ${isSelected ? 'border-rose-500 bg-rose-500/10 shadow-xl' : 'border-white/5 bg-black/40 hover:bg-white/5'}`}
                        >
                          {(loading && isSelected || isAnalyzing) && (
                              <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center flex-col gap-2 backdrop-blur-sm">
                                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                                  <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-pulse">{isAnalyzing ? 'Auditing...' : 'Analyzing Asset...'}</span>
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
                             <span className="text-xs font-mono font-black text-slate-400 mt-1">${item.price?.toFixed(2)}</span>
                          </div>

                          <p className="text-[10px] text-slate-500 uppercase tracking-widest truncate mb-4 font-bold border-b border-white/5 pb-2">
                              {cleanMarkdown(item.sectorTheme || item.theme)}
                          </p>

                          <div className="grid grid-cols-3 gap-2 py-4 bg-black/50 rounded-2xl border border-white/5 flex-grow items-center shadow-inner">
                              <div className="text-center">
                                  <p className="text-[8px] text-emerald-500 font-black uppercase">Entry</p>
                                  <p className="text-[13px] font-black text-white tracking-tighter">${item.supportLevel?.toFixed(1) || '---'}</p>
                              </div>
                              <div className="text-center border-x border-white/10">
                                  <p className="text-[8px] text-blue-500 font-black uppercase">Target</p>
                                  <p className="text-[13px] font-black text-white tracking-tighter">${item.resistanceLevel?.toFixed(1) || '---'}</p>
                              </div>
                              <div className="text-center">
                                  <p className="text-[8px] text-rose-500 font-black uppercase">Stop</p>
                                  <p className="text-[13px] font-black text-white tracking-tighter">${item.stopLoss?.toFixed(1) || '---'}</p>
                              </div>
                          </div>

                          <div className="flex justify-between items-center mt-3">
                              <div className="flex flex-col">
                                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-0.5">예상 수익률 (Exp. Return)</span>
                                  <span className="text-[10px] font-black text-emerald-400 italic">{cleanMarkdown(item.expectedReturn || 'TBD')}</span>
                              </div>
                              <span className={`px-2.5 py-1.5 rounded text-[8px] font-black uppercase border shadow-md ${getVerdictStyle(item.aiVerdict || '')}`}>
                                  {item.aiVerdict || 'PENDING'}
                              </span>
                          </div>
                        </div>
                      );
                  })
                ) : (
                  <div className="col-span-full py-24 text-center opacity-30 text-xs font-black uppercase tracking-[0.6em] italic">
                    Awaiting Alpha Protocol Signal...
                  </div>
                )}
              </div>
          ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                  <div className="flex justify-between items-center bg-black/40 p-2 rounded-2xl border border-white/5">
                      <div className="flex gap-2">
                          <button onClick={() => setMatrixBrain(ApiProvider.GEMINI)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.GEMINI ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>Gemini 3 Pro</button>
                          <button onClick={() => setMatrixBrain(ApiProvider.PERPLEXITY)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.PERPLEXITY ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>Sonar Pro</button>
                      </div>
                      <div className="pr-2 flex items-center gap-4">
                           <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest hidden md:inline-block">Active Matrix Node: {matrixBrain === ApiProvider.GEMINI ? 'Google Gemini' : 'Perplexity Sonar'}</span>
                           
                           {/* Telegram Send Button */}
                           {currentResults.length > 0 && (
                               <button 
                                   onClick={async () => {
                                       if (sendingTelegram) return;
                                       setSendingTelegram(true);
                                       addLog("Manual Command: Generating Telegram Brief...", "signal");
                                       try {
                                           const brief = await generateTelegramBrief(currentResults, matrixBrain);
                                           const sent = await sendTelegramReport(brief);
                                           if (sent) addLog("Telegram Transmission Successful.", "ok");
                                           else addLog("Telegram Transmission Failed.", "err");
                                       } catch (e: any) {
                                           addLog(`Telegram Error: ${e.message}`, "err");
                                       } finally {
                                           setSendingTelegram(false);
                                       }
                                   }}
                                   disabled={sendingTelegram}
                                   className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${sendingTelegram ? 'bg-blue-900 border-blue-700 text-blue-400 animate-pulse' : 'bg-blue-600 text-white border-blue-400 hover:bg-blue-500 shadow-lg'}`}
                               >
                                   {sendingTelegram ? (
                                       <><span>Transmitting...</span><div className="w-2 h-2 bg-blue-400 rounded-full animate-ping"></div></>
                                   ) : (
                                       <><span>Transmit Brief to HQ</span><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg></>
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
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Comprehensive Matrix Audit by {matrixBrain === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Perplexity Sonar'}</span>
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
            <div className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
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
                        <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative">
                            <iframe 
                                title="TradingView"
                                src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`}
                                className="w-full h-full opacity-90 border-none"
                            />
                        </div>

                        <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                            <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.4em] mb-6 italic underline underline-offset-8 whitespace-nowrap overflow-hidden text-ellipsis">Neural Investment Outlook</h4>
                            <div className="prose-report min-h-[200px]">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {formatReportText(cleanMarkdown(selectedStock.investmentOutlook)) || "_Analyzing strategic datasets for this asset..._"}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-2 space-y-6">
                        {/* LEGEND BADGE & RADAR */}
                        {quantMetrics && (
                            <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner relative group">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Strategy DNA</h4>
                                    <div className="flex gap-2">
                                        {getLegendStrategy(selectedStock.analysisLogic) && (
                                            <div className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase flex items-center gap-2 ${getLegendStrategy(selectedStock.analysisLogic)?.bg} ${getLegendStrategy(selectedStock.analysisLogic)?.border} ${getLegendStrategy(selectedStock.analysisLogic)?.color}`}>
                                                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                                                {getLegendStrategy(selectedStock.analysisLogic)?.name}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="h-[250px] w-full">
                                    {isVisible && (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={quantMetrics.radarData}>
                                                <PolarGrid stroke="#334155" opacity={0.2} />
                                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                <Radar name={selectedStock.symbol} dataKey="A" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.2} />
                                                <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} itemStyle={{ color: '#10b981', fontSize: '10px' }} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner">
                            <h4 className="text-[9px] font-black text-slate-500 uppercase mb-4 italic tracking-widest">Alpha Core Rationale</h4>
                            <ul className="space-y-4">
                                {selectedStock.selectionReasons?.length ? selectedStock.selectionReasons.map((reason, idx) => (
                                    <li key={idx} className="flex items-start gap-4">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></div>
                                        <p className="text-[13px] font-bold text-slate-200 leading-snug uppercase tracking-tight">{cleanMarkdown(reason)}</p>
                                    </li>
                                )) : (
                                    <li className="text-xs text-slate-500 italic">No specific rationale provided by engine.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-8 border-t border-white/5 pt-8">
                    <div className="flex justify-between items-end mb-6">
                        <div className="flex items-center gap-4">
                            <div>
                                <h4 className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-1 italic">Quant_Backtest_Protocol</h4>
                                {currentBacktest && <p className="text-[9px] text-slate-500 font-mono font-bold">SIMULATION PERIOD: <span className="text-emerald-500">{currentBacktest.simulationPeriod}</span></p>}
                            </div>
                            {currentBacktest && <div className="h-8 w-[1px] bg-white/10 mx-2"></div>}
                            {currentBacktest && <span className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none opacity-80">{selectedStock.symbol}</span>}
                        </div>
                        {!currentBacktest && (
                            <button 
                                onClick={(e) => runBacktest(selectedStock, e)} 
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
                                    {/* Metrics Cards */}
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
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={{...MarkdownComponents, h3: ({node, ...props}: any) => <h3 className="text-xs font-bold text-emerald-400 mt-2 mb-1 uppercase tracking-wide" {...props} />, p: ({node, ...props}: any) => <p className="mb-2" {...props} />, ul: ({node, ...props}: any) => <ul className="list-disc pl-4 space-y-1 mb-2" {...props} />, li: ({node, ...props}: any) => <li className="pl-1 marker:text-emerald-500" {...props} />, strong: ({node, ...props}: any) => <strong className="text-white font-bold" {...props} />}}>{selectedMetricInfo.desc}</ReactMarkdown>
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
                                                <span className={`text-3xl font-black italic tracking-tighter ${backtestChartData.length > 0 && backtestChartData[backtestChartData.length-1].value >= 0 ? 'text-white' : 'text-rose-400'}`}>
                                                    {backtestChartData.length > 0 ? (backtestChartData[backtestChartData.length-1].value >= 0 ? '+' : '') + backtestChartData[backtestChartData.length-1].value + '%' : '0%'}
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
                                            <ComposedChart data={backtestChartData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id={uniqueChartId} x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={lineColor} stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor={lineColor} stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                                <XAxis dataKey="period" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} dy={10} interval={1} />
                                                <YAxis stroke="#475569" fontSize={9} tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                                                <RechartsTooltip 
                                                    contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '12px' }} 
                                                    itemStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                                                    labelStyle={{ color: '#94a3b8', fontSize: '9px', marginBottom: '4px' }}
                                                    formatter={(value: any, name: any) => {
                                                        if (name === 'value') return [`${value}%`, 'Return'];
                                                        if (name === 'drawdown') return [`${value}%`, 'Drawdown'];
                                                        if (name === 'delta') return [`${value}%`, 'Period Change'];
                                                        return [value, name];
                                                    }}
                                                />
                                                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" opacity={0.5} />
                                                
                                                {/* Metric Overlays */}
                                                {activeOverlay === 'PROFIT_FACTOR' && (
                                                    <Bar dataKey="delta" barSize={8} fillOpacity={0.5}>
                                                        {backtestChartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.delta >= 0 ? '#10b981' : '#ef4444'} />
                                                        ))}
                                                    </Bar>
                                                )}
                                                
                                                {activeOverlay === 'MAX_DRAWDOWN' && (
                                                    <Area type="monotone" dataKey="drawdown" stroke="none" fill="#ef4444" fillOpacity={0.25} animationDuration={500} />
                                                )}

                                                {activeOverlay === 'SHARPE_RATIO' && (
                                                    <>
                                                        <Area type="monotone" dataKey="idealValue" stroke="#f59e0b" strokeWidth={1} strokeDasharray="5 5" fill="#f59e0b" fillOpacity={0.08} />
                                                        <ReferenceLine stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'top', value: 'Efficiency Path', fill: '#f59e0b', fontSize: 7, fontWeight: 'bold' }} segment={[{ x: backtestChartData[0]?.period, y: 0 }, { x: backtestChartData[backtestChartData.length - 1]?.period, y: backtestChartData[backtestChartData.length - 1].value }]} />
                                                    </>
                                                )}

                                                <Area 
                                                    type="monotone" 
                                                    dataKey="value" 
                                                    stroke={lineColor} 
                                                    strokeWidth={2} 
                                                    fillOpacity={1} 
                                                    fill={`url(#${uniqueChartId})`} 
                                                    animationDuration={1500}
                                                    dot={activeOverlay === 'WIN_RATE' ? (props: any) => {
                                                        const { cx, cy, payload } = props;
                                                        const isWin = payload.isWin;
                                                        return <circle cx={cx} cy={cy} r={3} fill={isWin ? '#10b981' : '#ef4444'} stroke="#020617" strokeWidth={1} className="animate-in fade-in duration-500" key={`dot-${payload.period}`} />;
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
                                            {formatReportText(currentBacktest.historicalContext)}
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
