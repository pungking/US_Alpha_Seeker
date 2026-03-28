
import React, { useState, useEffect, useRef } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS, STRATEGY_CONFIG } from '../constants';
import { ApiProvider } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatKstFilenameTimestamp } from '../services/timeService';
import { assertDriveOk, parseDriveJsonText } from '../services/driveJsonUtils';

// [ADDED] Markdown Components
const MarkdownComponents: any = {
  p: (props: any) => <p className="mb-2 text-slate-300 leading-relaxed text-[9px]" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="text-slate-300 text-[9px]" {...props} />,
  strong: (props: any) => <strong className="text-orange-400 font-bold" {...props} />,
};

interface TechnicalTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  
  technicalScore: number; 
  
  techMetrics: {
      rsi: number;
      adx: number;
      trend: number; 
      rvol: number; // Log Scaled Score (0-100)
      rawRvol: number; // Actual Ratio (e.g. 2.5x)
      squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT'; 
      rsRating: number; 
      momentum: number; 
      wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN';
      
      trendAlignment: 'POWER_TREND' | 'BULLISH' | 'NEUTRAL' | 'BEARISH';
      obvSlope: 'ACCUMULATION' | 'DIVERGENCE' | 'NEUTRAL';
      isBlueSky: boolean;
      goldenSetup: boolean;
      volatilityRange?: number; // [NEW] ICT Volatility Score
      dataQualityPenalty?: number;
      freshnessPenalty?: number;
      liquidityPenalty?: number;
      benchmarkGapBars?: number;
      zeroVolumeTailBars?: number;
      avgDollarVolume20?: number;
      dataQualityState?: 'NORMAL' | 'THIN' | 'ILLIQUID' | 'STALE';
      dataQualityScoreCap?: number | null;
      macdLine?: number;
      macdSignal?: number;
      macdHistogram?: number;
      mfi?: number;
      diPlus?: number;
      diMinus?: number;
      minerviniScore?: number;
      minerviniPassCount?: number;
      stage31SignalScore?: number;
      signalComboBonus?: number;
      signalHeatPenalty?: number;
      signalQualityState?: 'ALIGNED' | 'SETUP' | 'OVERHEATED' | 'NEUTRAL';
      marketRegime?: 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'UNKNOWN';
      marketRegimeScore?: number;
      breadth50Pct?: number;
      breadth200Pct?: number;
      near52wHighPct?: number;
      vixClose?: number | null;
      vixDistanceFromRiskOff?: number | null;
      regimeDistancePenalty?: number;
      macroOverlayScore?: number;
      earningsDate?: string | null;
      daysToEarnings?: number | null;
      eventRiskState?: 'HIGH' | 'MEDIUM' | 'NONE';
      eventDistanceBand?: 'D_MINUS_1_TO_PLUS_1' | 'D_MINUS_2_TO_MINUS_5' | 'NONE';
      eventRiskSource?: 'DISTANCE' | 'LABEL' | 'NONE';
      eventRiskPenalty?: number;
      ttmProfile?: TtmSqueezeProfile;
      ttmProfileMode?: TtmSqueezeMode;
      ttmKcAtrMult?: number;
      ttmBbStdMult?: number;
      factorSeasonalityScore?: number;
      factorSeasonalityAdjustment?: number;
      factorSeasonalityCoverage?: number;
      factorSeasonalityAvgMonthlyReturnPct?: number | null;
      factorSeasonalityWinRatePct?: number | null;
      factorSeasonalitySampleCount?: number;
      factorUpstreamAdjustment?: number;
      factorUpstreamCoverage?: number;
      factorRegimeAlignmentAdjustment?: number;
      factorQualityScore?: number;
      factorAdjustmentTotal?: number;
      factorConfidence?: number;
      factorCoverage?: number;
      sourceIntegrityState?: 'DRIVE_VERIFIED' | 'NON_DRIVE_DEGRADED';
      sourceIntegrityMode?: 'STRICT' | 'RELAXED';
      sourceIntegrityPenalty?: number;
      sourceIntegrityScoreCap?: number;
  };
  
  priceHistory: { date: string; close: number; open?: number; high?: number; low?: number; volume?: number }[];
  
  // [NEW] ICT 5-Step Data Extraction
  high52?: number;
  low52?: number;
  recentSwingHigh?: number;
  recentSwingLow?: number;
  
  sector: string;
  lastUpdate: string;
  
  // Previous Stage Data Persistence
  fundamentalScore?: number;
  qualityScore?: number;
  scoreBreakdown: {
      rawSignalScore: number;
      signalBonus: number;
      factorAdjustment?: number;
      regimePenalty: number;
      eventPenalty: number;
      liquidityPenalty: number;
      hygienePenalty: number;
      finalScore: number;
  };
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
}

const normalizeInstrumentType = (value: any): 'common' | 'warrant' | 'unit' | 'right' | 'hybrid' | 'unknown' => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'common') return 'common';
    if (normalized === 'warrant') return 'warrant';
    if (normalized === 'unit') return 'unit';
    if (normalized === 'right') return 'right';
    if (normalized === 'hybrid') return 'hybrid';
    return 'unknown';
};

const isAnalysisEligibleTicker = (item: any): boolean => {
    const instrumentType = normalizeInstrumentType(item?.instrumentType);
    const lifecycleState = String(item?.symbolLifecycleState || '').trim().toUpperCase();
    if (lifecycleState === 'RETIRED' || lifecycleState === 'EXCLUDED') return false;
    if (typeof item?.analysisEligible === 'boolean') {
        return item.analysisEligible && instrumentType === 'common';
    }
    return instrumentType === 'common';
};

type MarketRegimeState = 'RISK_ON' | 'NEUTRAL' | 'RISK_OFF' | 'UNKNOWN';

interface MarketRegimeSnapshot {
    trigger_file?: string;
    timestamp?: string;
    benchmarks?: {
        sp500?: {
            close?: number;
            return_20d?: number | null;
            above_sma50?: boolean;
            above_sma200?: boolean;
        };
        nasdaq?: {
            close?: number;
            return_20d?: number | null;
            above_sma50?: boolean;
            above_sma200?: boolean;
        };
        vix?: {
            close?: number;
            risk_state?: string;
        };
    };
    breadth?: {
        above_sma50_pct?: number;
        above_sma200_pct?: number;
        near_52w_high_pct?: number;
        total?: number;
        valid_count?: number;
    };
    regime?: {
        state?: MarketRegimeState;
        score?: number;
        reasons?: string[];
    };
}

interface EarningsEventMap {
    trigger_file?: string;
    timestamp?: string;
    source?: string;
    universe_count?: number;
    events?: Record<string, {
        earnings_date?: string;
        days_to_event?: number;
        event_risk?: 'HIGH' | 'MEDIUM' | 'NONE';
    }>;
}

type TtmSqueezeProfile = 'STRICT' | 'DEFAULT' | 'WIDE';
type TtmSqueezeMode = 'STATIC' | 'VIX_DYNAMIC' | 'ADAPTIVE_SHADOW' | 'ADAPTIVE_ACTIVE';

interface TtmAdaptiveState {
    version: 1;
    runs: number;
    samples: number;
    emaSqueezeOnRate: number;
    recommendedKcAtrMult: number;
    lastAppliedKcAtrMult: number;
    updatedAt: string;
}

interface TtmSqueezeRuntimeConfig {
    profileMode: TtmSqueezeMode;
    profile: TtmSqueezeProfile;
    bbStdMult: number;
    kcAtrMultBase: number;
    kcAtrMultApplied: number;
    reason: string;
    vixRef: number | null;
    adaptive: {
        eligible: boolean;
        minSamples: number;
        samples: number;
        emaSqueezeOnRate: number | null;
        recommendedKcAtrMult: number | null;
        appliedAdaptive: boolean;
    } | null;
}

// [KNOWLEDGE BASE] Expanded Technical Definitions
const TECH_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'POWER_TREND': {
        title: "Power Trend (초강세 정배열)",
        desc: "주가 > 20일 > 50일 > 200일 이평선이 완벽하게 정렬된 상태입니다. 기관의 강력한 매수세가 지속되고 있음을 의미합니다.",
        interpretation: "매수 1순위: 눌림목(Dip) 발생 시 적극 매수 구간입니다."
    },
    'BULLISH': {
        title: "Bullish Trend (상승 추세)",
        desc: "주가가 50일 이동평균선 위에 위치하며 상승 기조를 유지하고 있습니다.",
        interpretation: "긍정적: 추세가 꺾이지 않는 한 보유(Hold) 또는 추가 매수 관점입니다."
    },
    'NEUTRAL': {
        title: "Neutral Trend (중립/횡보)",
        desc: "주가가 이평선 사이에 갇혀있거나 방향성이 뚜렷하지 않은 구간입니다.",
        interpretation: "관망: 방향성이 결정될 때까지 기다리는 것이 좋습니다."
    },
    'BEARISH': {
        title: "Bearish Trend (하락 추세)",
        desc: "주가가 주요 이평선 아래에 위치하며 하방 압력을 받고 있습니다.",
        interpretation: "위험: 저점 매수보다는 공매도나 현금 보유가 유리합니다."
    },
    'GOLDEN_SETUP': {
        title: "Golden Setup (거래량 동반 돌파)",
        desc: "장기 이평선 위에서 거래량이 평소의 2배 이상 터지며 상승(Expansion)한 패턴입니다.",
        interpretation: "확률 90% 이상: 단순한 반등이 아닌 거대 추세의 시작점일 가능성이 높습니다."
    },
    'VCP': {
        title: "VCP (변동성 축소 패턴)",
        desc: "주가 변동폭이 점차 줄어들며(Tightness) 에너지가 응축되는 현상입니다 (Volatility Contraction Pattern).",
        interpretation: "ON: 용수철처럼 에너지가 모였습니다. 곧 한쪽으로 큰 시세 분출이 임박했습니다."
    },
    'BLUE_SKY': {
        title: "Blue Sky Zone (신고가 영역)",
        desc: "52주 신고가 근처 또는 역사적 신고가를 돌파한 영역입니다. 위에 악성 매물대(Resistance)가 없습니다.",
        interpretation: "저항 없음: 목표가를 높게 잡을 수 있는 '달리는 말'입니다."
    },
    'RS_RATING': {
        title: "RS Rating (상대 강도)",
        desc: "S&P 500 지수 대비 해당 종목의 초과 수익률을 점수화했습니다. (99점 = 상위 1% 아웃퍼폼)",
        interpretation: "80점 이상: 시장 주도주(Market Leader). 지수가 하락할 때 버티거나 덜 떨어지는 종목입니다."
    },
    'RVOL': {
        title: "RVOL (상대 거래량)",
        desc: "평소 거래량 대비 현재 거래량의 비율을 로그 스케일로 정규화한 점수입니다.",
        interpretation: "Score > 75 (1.5x 이상): 기관/세력의 자금이 평소보다 강하게 유입되고 있다는 신호입니다."
    },
    'TTM_SQUEEZE': {
        title: "TTM Squeeze (변동성 응축/분출)",
        desc: "볼린저 밴드가 켈트너 채널 안으로 들어오면 응축(Squeeze ON), 응축이 풀리며 위로 전개되면 FIRED_LONG으로 해석합니다.",
        interpretation: "ON은 에너지 응축, FIRED_LONG은 실제 추세 분출 신호로 봅니다."
    },
    'MINERVINI': {
        title: "Minervini Template (기관형 정배열 체크리스트)",
        desc: "50/150/200일 이동평균 정렬, 200일선 상승, 52주 고점/저점 위치 등 8개 구조 조건의 통과 개수를 점검합니다.",
        interpretation: "7/8 이상이면 구조적으로 강한 추세주일 가능성이 높습니다."
    },
    'MACD': {
        title: "MACD Histogram (추세 가속도)",
        desc: "MACD Line과 Signal Line의 차이를 Histogram으로 표시합니다. 양수 확대는 상승 가속, 음수 확대는 하락 가속으로 해석합니다.",
        interpretation: "0선 위 양전환 및 Histogram 증가 구간을 우선적으로 봅니다."
    },
    'DMI': {
        title: "DMI Bias (+DI / -DI)",
        desc: "+DI가 -DI 위에 있으면 상승 추세 우위, -DI가 +DI 위에 있으면 하락 추세 우위로 해석합니다.",
        interpretation: "ADX와 함께 볼 때 추세의 방향성과 힘을 동시에 판단할 수 있습니다."
    },
    'MFI': {
        title: "MFI (Money Flow Index)",
        desc: "가격과 거래량을 함께 반영한 자금 흐름 지표입니다. RSI보다 실제 수급의 흔적을 더 많이 반영합니다.",
        interpretation: "55~80 구간은 건전한 기관성 수급 유입으로 해석하기 좋습니다."
    },
    'MOMENTUM': {
        title: "Momentum (상승 탄력)",
        desc: "가격 변화의 속도와 가속도를 측정한 복합 지표입니다.",
        interpretation: "높을수록 강한 추세: 단기 트레이딩에 유리합니다."
    },
    'ADX': {
        title: "ADX (추세 강도 지수)",
        desc: "현재 진행 중인 추세의 강도를 나타냅니다. 방향성(상승/하락)과는 무관하게 '얼마나 센가'를 보여줍니다.",
        interpretation: "25 이상: 추세장(Trend) 진행 중. 20 미만: 횡보장(Box)이므로 추세 매매 금지."
    },
    'OBV': {
        title: "OBV (거래량 매집 분석)",
        desc: "주가 상승일의 거래량은 더하고 하락일은 빼서 누적한 지표입니다. (On-Balance Volume)",
        interpretation: "DIVERGENCE: 주가는 횡보/하락하는데 OBV가 상승한다면 '스마트 머니'의 매집 신호입니다."
    },
    'ESTIMATED': {
        title: "Estimated Data (추정치)",
        desc: "실시간 데이터 API 한도 도달 또는 데이터 누락으로 인해, 최근 펀더멘털 및 기술적 스냅샷을 기반으로 추정된 데이터입니다.",
        interpretation: "주의: 정확도가 다소 떨어질 수 있으므로 보조 지표로만 활용하십시오."
    }
};

const TechnicalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, status: '' });
  const [processedData, setProcessedData] = useState<TechnicalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<TechnicalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null);
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Tech_Tactician v7.5: Log-Scale RVOL & Market Relative Strength Initialized.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const alphaVantageKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPHA_VANTAGE)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);
  const TTM_ADAPTIVE_STATE_KEY = 'us_alpha_ttm_squeeze_adaptive_v1';

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const round4 = (value: number) => Number(value.toFixed(4));

  const readTtmAdaptiveState = (): TtmAdaptiveState | null => {
      if (typeof window === 'undefined') return null;
      try {
          const raw = window.localStorage.getItem(TTM_ADAPTIVE_STATE_KEY);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!parsed || parsed.version !== 1) return null;
          const samples = Number(parsed.samples);
          const runs = Number(parsed.runs);
          const emaRate = Number(parsed.emaSqueezeOnRate);
          const recommended = Number(parsed.recommendedKcAtrMult);
          const lastApplied = Number(parsed.lastAppliedKcAtrMult);
          if (![samples, runs, emaRate, recommended, lastApplied].every(Number.isFinite)) return null;
          return {
              version: 1,
              samples: Math.max(0, Math.floor(samples)),
              runs: Math.max(0, Math.floor(runs)),
              emaSqueezeOnRate: emaRate,
              recommendedKcAtrMult: recommended,
              lastAppliedKcAtrMult: lastApplied,
              updatedAt: String(parsed.updatedAt || '')
          };
      } catch {
          return null;
      }
  };

  const writeTtmAdaptiveState = (state: TtmAdaptiveState) => {
      if (typeof window === 'undefined') return;
      try {
          window.localStorage.setItem(TTM_ADAPTIVE_STATE_KEY, JSON.stringify(state));
      } catch {
          // ignore storage write errors
      }
  };

  const resolveTtmSqueezeConfig = (vixCloseInput: number | null): TtmSqueezeRuntimeConfig => {
      const bbStdMult = Number(STRATEGY_CONFIG.TTM_SQUEEZE_BB_STD_MULT || 2.0);
      const strictMult = Number(STRATEGY_CONFIG.TTM_SQUEEZE_KC_ATR_MULT_STRICT || 1.25);
      const defaultMult = Number(STRATEGY_CONFIG.TTM_SQUEEZE_KC_ATR_MULT_DEFAULT || 1.5);
      const wideMult = Number(STRATEGY_CONFIG.TTM_SQUEEZE_KC_ATR_MULT_WIDE || 2.0);
      const strictMinVix = Number(STRATEGY_CONFIG.TTM_SQUEEZE_VIX_STRICT_MIN || 24);
      const wideMaxVix = Number(STRATEGY_CONFIG.TTM_SQUEEZE_VIX_WIDE_MAX || 18);
      const profileModeRaw = String(STRATEGY_CONFIG.TTM_SQUEEZE_KC_PROFILE_MODE || 'STATIC').toUpperCase();
      const profileMode: TtmSqueezeMode = (
          profileModeRaw === 'VIX_DYNAMIC' ||
          profileModeRaw === 'ADAPTIVE_SHADOW' ||
          profileModeRaw === 'ADAPTIVE_ACTIVE'
      ) ? profileModeRaw : 'STATIC';
      const vixRef = Number.isFinite(Number(vixCloseInput)) ? Number(vixCloseInput) : null;

      let profile: TtmSqueezeProfile = 'DEFAULT';
      let reason = 'static_default';
      if (profileMode !== 'STATIC' && vixRef != null) {
          if (vixRef >= strictMinVix) {
              profile = 'STRICT';
              reason = `vix>=${strictMinVix}`;
          } else if (vixRef <= wideMaxVix) {
              profile = 'WIDE';
              reason = `vix<=${wideMaxVix}`;
          } else {
              reason = `vix_mid(${wideMaxVix}<vix<${strictMinVix})`;
          }
      } else if (profileMode !== 'STATIC') {
          reason = 'vix_missing_fallback_default';
      }

      const profileToMult: Record<TtmSqueezeProfile, number> = {
          STRICT: strictMult,
          DEFAULT: defaultMult,
          WIDE: wideMult
      };
      const kcAtrMultBase = profileToMult[profile];
      let kcAtrMultApplied = kcAtrMultBase;

      const minSamples = Math.max(100, Math.floor(Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES || 600)));
      const minKc = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MIN_KC || 1.1);
      const maxKc = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MAX_KC || 2.2);

      let adaptive: TtmSqueezeRuntimeConfig['adaptive'] = null;
      if (profileMode === 'ADAPTIVE_SHADOW' || profileMode === 'ADAPTIVE_ACTIVE') {
          const state = readTtmAdaptiveState();
          const recommended = state ? clamp(state.recommendedKcAtrMult, minKc, maxKc) : null;
          const eligible = Boolean(state && state.samples >= minSamples && recommended != null);
          const appliedAdaptive = profileMode === 'ADAPTIVE_ACTIVE' && eligible && recommended != null;
          if (appliedAdaptive && recommended != null) {
              kcAtrMultApplied = recommended;
              reason += '|adaptive_active';
          } else if (profileMode === 'ADAPTIVE_SHADOW') {
              reason += '|adaptive_shadow';
          }
          adaptive = {
              eligible,
              minSamples,
              samples: state?.samples || 0,
              emaSqueezeOnRate: state ? round4(state.emaSqueezeOnRate) : null,
              recommendedKcAtrMult: recommended != null ? round4(recommended) : null,
              appliedAdaptive
          };
      }

      return {
          profileMode,
          profile,
          bbStdMult: round4(bbStdMult),
          kcAtrMultBase: round4(kcAtrMultBase),
          kcAtrMultApplied: round4(kcAtrMultApplied),
          reason,
          vixRef: vixRef != null ? round4(vixRef) : null,
          adaptive
      };
  };

  const updateTtmAdaptiveState = (
      config: TtmSqueezeRuntimeConfig,
      sampleCount: number,
      squeezeOnCount: number
  ): TtmAdaptiveState | null => {
      if (!(config.profileMode === 'ADAPTIVE_SHADOW' || config.profileMode === 'ADAPTIVE_ACTIVE')) return null;
      if (!Number.isFinite(sampleCount) || sampleCount <= 0) return null;

      const minSamples = Math.max(100, Math.floor(Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES || 600)));
      const targetMinRaw = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MIN || 0.14);
      const targetMaxRaw = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_TARGET_RATE_MAX || 0.28);
      const targetMin = Math.min(targetMinRaw, targetMaxRaw);
      const targetMax = Math.max(targetMinRaw, targetMaxRaw);
      const step = Math.max(0.01, Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_STEP || 0.05));
      const minKc = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MIN_KC || 1.1);
      const maxKc = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MAX_KC || 2.2);

      const runRate = clamp(squeezeOnCount / sampleCount, 0, 1);
      const prev = readTtmAdaptiveState();
      const prevSamples = prev?.samples || 0;
      const prevRuns = prev?.runs || 0;
      const prevEma = prev ? clamp(prev.emaSqueezeOnRate, 0, 1) : runRate;
      const prevRecommended = prev
          ? clamp(prev.recommendedKcAtrMult, minKc, maxKc)
          : clamp(config.kcAtrMultApplied, minKc, maxKc);

      const weight = prev ? clamp(prevSamples / Math.max(1, prevSamples + sampleCount), 0.2, 0.85) : 0;
      const emaRate = prev ? (prevEma * weight) + (runRate * (1 - weight)) : runRate;
      const nextSamples = prevSamples + sampleCount;

      let nextRecommended = prevRecommended;
      if (nextSamples >= minSamples) {
          if (emaRate > targetMax) nextRecommended = clamp(prevRecommended - step, minKc, maxKc);
          else if (emaRate < targetMin) nextRecommended = clamp(prevRecommended + step, minKc, maxKc);
      }

      const nextState: TtmAdaptiveState = {
          version: 1,
          runs: prevRuns + 1,
          samples: nextSamples,
          emaSqueezeOnRate: round4(emaRate),
          recommendedKcAtrMult: round4(nextRecommended),
          lastAppliedKcAtrMult: round4(config.kcAtrMultApplied),
          updatedAt: new Date().toISOString()
      };

      writeTtmAdaptiveState(nextState);
      return nextState;
  };

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.tech-insight-trigger') && !target.closest('.tech-insight-overlay')) {
            setActiveMetric(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        let etaSec = 0;
        if (progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging High-Throughput Tech Scan...", "signal");
        executeTechnicalScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadgeText = () => {
      if (loading) return `Processing: ${progress.status} (${progress.current}/${progress.total})`;
      if (processedData.length === 0) return 'Drive OHLCV Scan Ready';

      const driveCount = processedData.filter(item => item.dataSource === 'DRIVE').length;
      const apiFallbackCount = processedData.filter(item => item.dataSource === 'API_FALLBACK').length;
      const heuristicCount = processedData.filter(item => item.dataSource === 'HEURISTIC').length;
      const failureCount = processedData.filter(item => item.dataSource === 'FAILURE').length;

      if (heuristicCount === 0 && failureCount === 0 && apiFallbackCount === 0) return `Drive OHLCV Verified (${driveCount})`;
      if (failureCount === 0) return `Hybrid Output: ${driveCount} Drive / ${apiFallbackCount} API / ${heuristicCount} Est.`;
      return `Mixed Output: ${driveCount} Drive / ${apiFallbackCount} API / ${heuristicCount} Est. / ${failureCount} Fail`;
  };

  const formatSqueezeBadge = (state: TechnicalTicker['techMetrics']['squeezeState']) => {
      if (state === 'FIRED_LONG') return 'FIRED';
      if (state === 'FIRED_SHORT') return 'SHORT';
      if (state === 'SQUEEZE_ON') return 'ON';
      return 'OFF';
  };

  const getDmiBiasLabel = (diPlus = 0, diMinus = 0) => {
      if (diPlus > diMinus) return 'BULL';
      if (diPlus < diMinus) return 'BEAR';
      return 'NEUTRAL';
  };

  const handleTickerSelect = (ticker: TechnicalTicker) => {
      setSelectedTicker(ticker);
      setActiveMetric(null);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  // --- QUANT MATH UTILS ---
  const calculateSMA = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
  };

  const calculateStdDev = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const denominator = Math.max(1, slice.length - 1); // sample stddev (N-1)
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / denominator;
      return Math.sqrt(variance);
  };

  const resolveTrendAlignment = (
      currentPrice: number,
      sma20: number,
      sma50: number,
      sma200: number
  ): 'POWER_TREND' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' => {
      if (currentPrice > sma20 && sma20 > sma50 && (sma200 === 0 || sma50 > sma200)) {
          return 'POWER_TREND';
      }
      if (currentPrice > sma50) return 'BULLISH';
      if (currentPrice < sma50) return 'BEARISH';
      return 'NEUTRAL';
  };

  const calculateAverage = (data: number[], period: number) => {
      const slice = data.slice(-period);
      if (slice.length === 0) return 0;
      return slice.reduce((a, b) => a + b, 0) / slice.length;
  };

  const calculateEMAArray = (data: number[], period: number) => {
      if (data.length === 0) return [];
      if (period <= 1) return [...data];
      const multiplier = 2 / (period + 1);

      // C8: Seed EMA with SMA(period) to reduce warm-up bias in MACD/signal.
      if (data.length < period) {
          const seed = calculateAverage(data, data.length);
          let prev = seed;
          return data.map((value, index) => {
              if (index === 0) return seed;
              prev = (value * multiplier) + (prev * (1 - multiplier));
              return prev;
          });
      }

      const initialSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const ema: number[] = new Array(period - 1).fill(initialSMA);
      ema.push(initialSMA);

      for (let i = period; i < data.length; i++) {
          const prev = ema[ema.length - 1];
          ema.push((data[i] * multiplier) + (prev * (1 - multiplier)));
      }

      return ema;
  };

  const calculateATR = (highs: number[], lows: number[], closes: number[], period = 20) => {
      if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) return 0;
      const trValues: number[] = [];
      for (let i = 1; i < highs.length; i++) {
          trValues.push(Math.max(
              highs[i] - lows[i],
              Math.abs(highs[i] - closes[i - 1]),
              Math.abs(lows[i] - closes[i - 1])
          ));
      }
      return calculateAverage(trValues, period);
  };

  const calculateOBV = (closes: number[], volumes: number[]) => {
      let obv = [0];
      for (let i = 1; i < closes.length; i++) {
          const prevObv = obv[i - 1];
          if (closes[i] > closes[i - 1]) obv.push(prevObv + volumes[i]);
          else if (closes[i] < closes[i - 1]) obv.push(prevObv - volumes[i]);
          else obv.push(prevObv);
      }
      const period = Math.min(20, obv.length);
      const recentObv = obv.slice(-period);
      const xMean = (period - 1) / 2;
      const yMean = recentObv.reduce((a,b) => a+b, 0) / period;
      let numerator = 0;
      let denominator = 0;
      for(let i=0; i<period; i++) {
          numerator += (i - xMean) * (recentObv[i] - yMean);
          denominator += Math.pow(i - xMean, 2);
      }
      return denominator === 0 ? 0 : numerator / denominator; 
  };

  const calculateRSI = (prices: number[], period = 14) => {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
          const diff = prices[i] - prices[i - 1];
          if (diff >= 0) gains += diff;
          else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      
      for (let i = period + 1; i < prices.length; i++) {
          const diff = prices[i] - prices[i - 1];
          const gain = diff >= 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
  };

  const calculateADX = (highs: number[], lows: number[], closes: number[], period = 14): number => {
    // ADX needs enough bars for DM/TR smoothing + first DX window + Wilder smoothing pass.
    if (highs.length < (period * 2) + 1) return 0;

    let tr = [], dmPlus = [], dmMinus = [];
    
    for (let i = 1; i < highs.length; i++) {
        const h = highs[i], l = lows[i], cPrev = closes[i - 1];
        tr.push(Math.max(h - l, Math.abs(h - cPrev), Math.abs(l - cPrev)));
        const upMove = h - highs[i - 1];
        const downMove = lows[i - 1] - l;
        dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
        dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
    }

    let smoothTR = tr.slice(0, period).reduce((a,b)=>a+b, 0);
    let smoothPlus = dmPlus.slice(0, period).reduce((a,b)=>a+b, 0);
    let smoothMinus = dmMinus.slice(0, period).reduce((a,b)=>a+b, 0);
    
    if (smoothTR === 0) return 0; // Prevent division by zero

    let dxList = [];

    for (let i = period; i < tr.length; i++) {
        smoothTR = smoothTR - (smoothTR / period) + tr[i];
        smoothPlus = smoothPlus - (smoothPlus / period) + dmPlus[i];
        smoothMinus = smoothMinus - (smoothMinus / period) + dmMinus[i];
        
        // Prevent division by zero
        if (smoothTR === 0) {
            dxList.push(0);
            continue;
        }

        const diPlus = (smoothPlus / smoothTR) * 100;
        const diMinus = (smoothMinus / smoothTR) * 100;
        
        const div = diPlus + diMinus;
        const dx = div === 0 ? 0 : (Math.abs(diPlus - diMinus) / div) * 100;
        dxList.push(dx);
    }
    
    if (dxList.length < period) return 0;

    // Standard ADX: seed with first SMA(period) of DX, then apply Wilder smoothing.
    let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
        adx = ((adx * (period - 1)) + dxList[i]) / period;
    }

    return Number(adx.toFixed(2));
  };

  const calculateDMI = (highs: number[], lows: number[], closes: number[], period = 14) => {
      if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) {
          return { diPlus: 0, diMinus: 0 };
      }

      const tr: number[] = [];
      const dmPlus: number[] = [];
      const dmMinus: number[] = [];

      for (let i = 1; i < highs.length; i++) {
          const upMove = highs[i] - highs[i - 1];
          const downMove = lows[i - 1] - lows[i];
          tr.push(Math.max(
              highs[i] - lows[i],
              Math.abs(highs[i] - closes[i - 1]),
              Math.abs(lows[i] - closes[i - 1])
          ));
          dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
          dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
      }

      let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
      let smoothPlus = dmPlus.slice(0, period).reduce((a, b) => a + b, 0);
      let smoothMinus = dmMinus.slice(0, period).reduce((a, b) => a + b, 0);

      for (let i = period; i < tr.length; i++) {
          smoothTR = smoothTR - (smoothTR / period) + tr[i];
          smoothPlus = smoothPlus - (smoothPlus / period) + dmPlus[i];
          smoothMinus = smoothMinus - (smoothMinus / period) + dmMinus[i];
      }

      if (smoothTR === 0) return { diPlus: 0, diMinus: 0 };

      return {
          diPlus: Number(((smoothPlus / smoothTR) * 100).toFixed(2)),
          diMinus: Number(((smoothMinus / smoothTR) * 100).toFixed(2))
      };
  };

  const calculateMACD = (prices: number[]) => {
      if (prices.length < 35) {
          return { macdLine: 0, signalLine: 0, histogram: 0, previousHistogram: 0 };
      }

      const ema12 = calculateEMAArray(prices, 12);
      const ema26 = calculateEMAArray(prices, 26);
      const macdSeries = prices.map((_, index) => (ema12[index] || 0) - (ema26[index] || 0));
      const signalSeries = calculateEMAArray(macdSeries, 9);
      const histogramSeries = macdSeries.map((value, index) => value - (signalSeries[index] || 0));

      const lastIndex = histogramSeries.length - 1;
      const previousIndex = Math.max(0, lastIndex - 1);

      return {
          macdLine: Number((macdSeries[lastIndex] || 0).toFixed(4)),
          signalLine: Number((signalSeries[lastIndex] || 0).toFixed(4)),
          histogram: Number((histogramSeries[lastIndex] || 0).toFixed(4)),
          previousHistogram: Number((histogramSeries[previousIndex] || 0).toFixed(4))
      };
  };

  const calculateMFI = (highs: number[], lows: number[], closes: number[], volumes: number[], period = 14) => {
      if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1 || volumes.length < period + 1) return 50;

      let positiveFlow = 0;
      let negativeFlow = 0;

      for (let i = highs.length - period; i < highs.length; i++) {
          const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
          const prevTypicalPrice = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;
          const rawMoneyFlow = typicalPrice * (volumes[i] || 0);

          if (typicalPrice > prevTypicalPrice) positiveFlow += rawMoneyFlow;
          else if (typicalPrice < prevTypicalPrice) negativeFlow += rawMoneyFlow;
      }

      if (negativeFlow === 0) return 100;
      const moneyRatio = positiveFlow / negativeFlow;
      return Number((100 - (100 / (1 + moneyRatio))).toFixed(2));
  };

  const calculateMinerviniTemplate = (closes: number[], high52: number, low52: number) => {
      const currentPrice = closes[closes.length - 1] || 0;
      const sma50 = calculateSMA(closes, 50);
      const sma150 = calculateSMA(closes, 150);
      const sma200 = calculateSMA(closes, 200);
      const historicalSma200 = closes.length >= 220
          ? closes.slice(-(200 + 20), -20).reduce((sum, price) => sum + price, 0) / 200
          : 0;

      const checks = [
          sma150 > 0 && currentPrice > sma150,
          sma200 > 0 && currentPrice > sma200,
          sma150 > 0 && sma200 > 0 && sma150 > sma200,
          sma200 > 0 && historicalSma200 > 0 && sma200 > historicalSma200,
          sma50 > 0 && sma150 > 0 && sma200 > 0 && sma50 > sma150 && sma50 > sma200,
          sma50 > 0 && currentPrice > sma50,
          low52 > 0 ? currentPrice >= low52 * 1.25 : false,
          high52 > 0 ? currentPrice >= high52 * 0.75 : false
      ];

      const passCount = checks.filter(Boolean).length;
      const score = Number(((passCount / checks.length) * 100).toFixed(2));

      return {
          passCount,
          score
      };
  };

  const calculateTTMSqueezeState = (
      highs: number[],
      lows: number[],
      closes: number[],
      momentumBias = 0,
      squeezeConfig?: TtmSqueezeRuntimeConfig
  ): 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT' => {
      const bbStdMult = squeezeConfig?.bbStdMult ?? Number(STRATEGY_CONFIG.TTM_SQUEEZE_BB_STD_MULT || 2.0);
      const kcAtrMult = squeezeConfig?.kcAtrMultApplied ?? Number(STRATEGY_CONFIG.TTM_SQUEEZE_KC_ATR_MULT_DEFAULT || 1.5);
      const getSqueezeFlag = (offset = 0) => {
          const end = closes.length - offset;
          if (end < 20) return false;

          const closeWindow = closes.slice(0, end);
          const highWindow = highs.slice(0, end);
          const lowWindow = lows.slice(0, end);
          const basis = calculateSMA(closeWindow, 20);
          const deviation = calculateStdDev(closeWindow, 20);
          const atr = calculateATR(highWindow, lowWindow, closeWindow, 20);

          if (basis === 0 || atr === 0) return false;

          const bbUpper = basis + (deviation * bbStdMult);
          const bbLower = basis - (deviation * bbStdMult);
          const kcUpper = basis + (atr * kcAtrMult);
          const kcLower = basis - (atr * kcAtrMult);

          return bbLower > kcLower && bbUpper < kcUpper;
      };

      const currentOn = getSqueezeFlag(0);
      const previousOn = getSqueezeFlag(1);

      if (currentOn) return 'SQUEEZE_ON';
      if (previousOn && !currentOn) return momentumBias >= 0 ? 'FIRED_LONG' : 'FIRED_SHORT';
      return 'SQUEEZE_OFF';
  };

  const calculateStage31SignalOverlay = (signals: {
      minerviniScore: number;
      minerviniPassCount: number;
      macdLine: number;
      signalLine: number;
      histogram: number;
      previousHistogram: number;
      mfi: number;
      diPlus: number;
      diMinus: number;
      adx: number;
      rsi: number;
      rawRvol: number;
      priceChange: number;
      squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT';
  }) => {
      let structureBonus = 0;
      if (signals.minerviniPassCount >= 8) structureBonus += 5;
      else if (signals.minerviniPassCount >= 7) structureBonus += 4;
      else if (signals.minerviniPassCount >= 6) structureBonus += 2;
      else if (signals.minerviniPassCount >= 5) structureBonus += 1;

      let momentumBonus = 0;
      if (signals.macdLine > signals.signalLine && signals.histogram > 0) momentumBonus += 3;
      else if (signals.macdLine < signals.signalLine && signals.histogram < 0) momentumBonus -= 2;

      if (signals.histogram > signals.previousHistogram && signals.histogram > -0.05) momentumBonus += 1.5;
      if (signals.mfi >= 55 && signals.mfi <= 80) momentumBonus += 2;
      else if (signals.mfi > 85) momentumBonus -= 2.5;
      else if (signals.mfi < 30) momentumBonus -= 1.5;

      let directionBonus = 0;
      if (signals.diPlus > signals.diMinus && signals.adx >= 20) directionBonus += 3;
      else if (signals.diPlus < signals.diMinus && signals.adx >= 20) directionBonus -= 2.5;

      let squeezeBonus = 0;
      if (signals.squeezeState === 'FIRED_LONG') squeezeBonus += 4;
      else if (signals.squeezeState === 'SQUEEZE_ON') squeezeBonus += 2;
      else if (signals.squeezeState === 'FIRED_SHORT') squeezeBonus -= 4;

      let signalComboBonus = 0;
      const bullishMomentumAligned =
          signals.macdLine > signals.signalLine &&
          signals.histogram > 0 &&
          signals.diPlus > signals.diMinus &&
          signals.mfi >= 55 &&
          signals.mfi <= 80;

      if (signals.squeezeState === 'FIRED_LONG' && bullishMomentumAligned) signalComboBonus += 4;
      else if (signals.squeezeState === 'SQUEEZE_ON' && signals.histogram > signals.previousHistogram && signals.diPlus > signals.diMinus) signalComboBonus += 2;

      if (signals.minerviniPassCount >= 7 && bullishMomentumAligned) signalComboBonus += 2;

      let signalHeatPenalty = 0;
      if (signals.rsi >= 82) signalHeatPenalty += 3;
      else if (signals.rsi >= 78) signalHeatPenalty += 1.5;

      if (signals.mfi >= 88) signalHeatPenalty += 3;
      if (signals.rawRvol >= 2.5 && signals.priceChange >= 0.045) signalHeatPenalty += 2;

      const stage31SignalScore = Number(
          Math.max(
              -10,
              Math.min(16, structureBonus + momentumBonus + directionBonus + squeezeBonus + signalComboBonus - signalHeatPenalty)
          ).toFixed(2)
      );

      let signalQualityState: 'ALIGNED' | 'SETUP' | 'OVERHEATED' | 'NEUTRAL' = 'NEUTRAL';
      if (signalHeatPenalty >= 4) signalQualityState = 'OVERHEATED';
      else if (signalComboBonus >= 4) signalQualityState = 'ALIGNED';
      else if (stage31SignalScore > 0) signalQualityState = 'SETUP';

      return {
          stage31SignalScore,
          signalComboBonus: Number(signalComboBonus.toFixed(2)),
          signalHeatPenalty: Number(signalHeatPenalty.toFixed(2)),
          signalQualityState
      };
  };

  const MARKET_REGIME_FILE = 'MARKET_REGIME_SNAPSHOT.json';
  const EARNINGS_EVENT_FILE = 'EARNINGS_EVENT_MAP.json';

  const calculateMacroOverlay = (
      snapshot: MarketRegimeSnapshot | null,
      context: {
          trendAlignment?: TechnicalTicker['techMetrics']['trendAlignment'];
          rsRating?: number;
          minerviniPassCount?: number;
      }
  ) => {
      const breadth50Pct = Number(snapshot?.breadth?.above_sma50_pct || 0);
      const breadth200Pct = Number(snapshot?.breadth?.above_sma200_pct || 0);
      const near52wHighPct = Number(snapshot?.breadth?.near_52w_high_pct || 0);
      const vixClose = snapshot?.benchmarks?.vix?.close;
      const vixRiskOffLevel = Number(STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL || 22);
      const marketRegime = (snapshot?.regime?.state || 'UNKNOWN') as MarketRegimeState;
      const marketRegimeScore = Number(snapshot?.regime?.score || 0);
      const vixDistanceFromRiskOff = typeof vixClose === 'number'
          ? Number((vixClose - vixRiskOffLevel).toFixed(2))
          : null;
      let regimeDistancePenalty = 0;

      if (!snapshot) {
          return {
              marketRegime,
              marketRegimeScore,
              breadth50Pct,
              breadth200Pct,
              near52wHighPct,
              vixClose: vixClose ?? null,
              vixDistanceFromRiskOff,
              regimeDistancePenalty,
              macroOverlayScore: 0
          };
      }

      let macroOverlayScore = 0;

      if (marketRegime === 'RISK_ON') macroOverlayScore += 3;
      else if (marketRegime === 'RISK_OFF') macroOverlayScore -= 6;

      if (breadth50Pct >= 60) macroOverlayScore += 1;
      else if (breadth50Pct < 45) macroOverlayScore -= 1.5;

      if (breadth200Pct >= 55) macroOverlayScore += 2;
      else if (breadth200Pct < 40) macroOverlayScore -= 2.5;

      if (near52wHighPct >= 18) macroOverlayScore += 1;
      else if (near52wHighPct < 8) macroOverlayScore -= 1;

      if (typeof vixDistanceFromRiskOff === 'number') {
          if (vixDistanceFromRiskOff >= 6) regimeDistancePenalty = 3;
          else if (vixDistanceFromRiskOff >= 3) regimeDistancePenalty = 2.25;
          else if (vixDistanceFromRiskOff >= 1) regimeDistancePenalty = 1.5;
          else if (vixDistanceFromRiskOff > 0) regimeDistancePenalty = 0.75;

          macroOverlayScore -= regimeDistancePenalty;

          if (vixDistanceFromRiskOff <= -7) macroOverlayScore += 1;
          else if (vixDistanceFromRiskOff <= -3) macroOverlayScore += 0.5;
      }

      if ((context.trendAlignment === 'POWER_TREND' || context.trendAlignment === 'BULLISH') && marketRegime === 'RISK_ON') {
          macroOverlayScore += 1;
      }

      if ((context.trendAlignment === 'BEARISH' || (context.rsRating || 0) < 50) && marketRegime === 'RISK_OFF') {
          macroOverlayScore -= 1.5;
      }

      if ((context.minerviniPassCount || 0) >= 7 && marketRegime === 'RISK_ON') {
          macroOverlayScore += 1;
      }

      return {
          marketRegime,
          marketRegimeScore,
          breadth50Pct: Number(breadth50Pct.toFixed(1)),
          breadth200Pct: Number(breadth200Pct.toFixed(1)),
          near52wHighPct: Number(near52wHighPct.toFixed(1)),
          vixClose: typeof vixClose === 'number' ? Number(vixClose.toFixed(2)) : null,
          vixDistanceFromRiskOff,
          regimeDistancePenalty: Number(regimeDistancePenalty.toFixed(2)),
          macroOverlayScore: Number(Math.max(-10, Math.min(8, macroOverlayScore)).toFixed(2))
      };
  };

  const calculateEventRiskOverlay = (
      eventMap: EarningsEventMap | null,
      symbol: string,
      marketRegime: MarketRegimeState = 'UNKNOWN'
  ) => {
      const event = eventMap?.events?.[symbol.toUpperCase()];
      const earningsDate = event?.earnings_date || null;
      const labelRiskState = (event?.event_risk || 'NONE') as 'HIGH' | 'MEDIUM' | 'NONE';
      let daysToEarnings = typeof event?.days_to_event === 'number' ? event.days_to_event : null;

      // Fallback: derive D-day distance from earnings_date when numeric distance is unavailable.
      if (daysToEarnings === null && earningsDate) {
          const earningsTime = new Date(earningsDate).getTime();
          if (Number.isFinite(earningsTime)) {
              const now = new Date();
              const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
              const earningsUtc = Date.UTC(
                  new Date(earningsTime).getUTCFullYear(),
                  new Date(earningsTime).getUTCMonth(),
                  new Date(earningsTime).getUTCDate()
              );
              daysToEarnings = Math.round((earningsUtc - todayUtc) / (24 * 60 * 60 * 1000));
          }
      }

      let eventDistanceBand: 'D_MINUS_1_TO_PLUS_1' | 'D_MINUS_2_TO_MINUS_5' | 'NONE' = 'NONE';
      let eventRiskState: 'HIGH' | 'MEDIUM' | 'NONE' = 'NONE';
      let eventRiskSource: 'DISTANCE' | 'LABEL' | 'NONE' = 'NONE';

      let eventRiskPenalty = 0;
      if (typeof daysToEarnings === 'number') {
          if (daysToEarnings >= -1 && daysToEarnings <= 1) {
              eventDistanceBand = 'D_MINUS_1_TO_PLUS_1';
              eventRiskState = 'HIGH';
              eventRiskPenalty = 8;
              eventRiskSource = 'DISTANCE';
          } else if (daysToEarnings >= -5 && daysToEarnings <= -2) {
              eventDistanceBand = 'D_MINUS_2_TO_MINUS_5';
              eventRiskState = 'MEDIUM';
              eventRiskPenalty = 3;
              eventRiskSource = 'DISTANCE';
          } else {
              eventDistanceBand = 'NONE';
              eventRiskState = 'NONE';
              eventRiskPenalty = 0;
              eventRiskSource = 'NONE';
          }
      } else if (labelRiskState === 'HIGH') {
          eventRiskState = 'HIGH';
          eventRiskPenalty = 8;
          eventRiskSource = 'LABEL';
      } else if (labelRiskState === 'MEDIUM') {
          eventRiskState = 'MEDIUM';
          eventRiskPenalty = 3;
          eventRiskSource = 'LABEL';
      }

      if (marketRegime === 'RISK_OFF') {
          if (eventRiskState === 'HIGH') eventRiskPenalty += 2;
          else if (eventRiskState === 'MEDIUM') eventRiskPenalty += 1;
      }

      return {
          earningsDate,
          daysToEarnings,
          eventRiskState,
          eventDistanceBand,
          eventRiskSource,
          eventRiskPenalty: Number(eventRiskPenalty.toFixed(2))
      };
  };

  const toFiniteNumber = (value: any, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
  };

  const normalizeRangeScore = (value: number, min: number, max: number) => {
      if (!Number.isFinite(value)) return 50;
      if (max <= min) return 50;
      const ratio = (value - min) / (max - min);
      return clamp(ratio * 100, 0, 100);
  };

  const computeOhlcvSeasonalitySignals = (candles: any[], maxAdjustment = 3.5) => {
      const normalized = (candles || [])
          .filter((c: any) => Number.isFinite(Number(c?.c)) && Number.isFinite(Number(c?.t)))
          .slice(-1300)
          .sort((a: any, b: any) => Number(a.t) - Number(b.t));

      if (normalized.length < 252) {
          return {
              available: false,
              score: 50,
              adjustment: 0,
              coverage: 0,
              avgMonthlyReturnPct: null,
              winRatePct: null,
              sampleCount: 0
          };
      }

      const monthMap = new Map<string, { close: number; monthIndex: number; ts: number }>();
      normalized.forEach((candle: any) => {
          const d = new Date(Number(candle.t));
          if (!Number.isFinite(d.getTime())) return;
          const monthIndex = d.getUTCFullYear() * 12 + d.getUTCMonth();
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          monthMap.set(key, { close: Number(candle.c), monthIndex, ts: Number(candle.t) });
      });

      const months = Array.from(monthMap.values()).sort((a, b) => a.monthIndex - b.monthIndex);
      if (months.length < 24) {
          return {
              available: false,
              score: 50,
              adjustment: 0,
              coverage: 0,
              avgMonthlyReturnPct: null,
              winRatePct: null,
              sampleCount: 0
          };
      }

      const monthlyReturns: Array<{ calendarMonth: number; retPct: number }> = [];
      for (let i = 1; i < months.length; i++) {
          const prev = months[i - 1];
          const curr = months[i];
          if (!prev || !curr || prev.close <= 0) continue;
          const retPct = ((curr.close / prev.close) - 1) * 100;
          if (!Number.isFinite(retPct)) continue;
          const currMonth = (curr.monthIndex % 12) + 1;
          monthlyReturns.push({ calendarMonth: currMonth, retPct });
      }

      if (monthlyReturns.length < 18) {
          return {
              available: false,
              score: 50,
              adjustment: 0,
              coverage: 0,
              avgMonthlyReturnPct: null,
              winRatePct: null,
              sampleCount: 0
          };
      }

      const latestCalendarMonth = (months[months.length - 1].monthIndex % 12) + 1;
      let scoped = monthlyReturns.filter((r) => r.calendarMonth === latestCalendarMonth);
      if (scoped.length < 3) scoped = monthlyReturns;

      const avgMonthlyReturnPct = scoped.reduce((sum, r) => sum + r.retPct, 0) / Math.max(1, scoped.length);
      const winRatePct = (scoped.filter((r) => r.retPct > 0).length / Math.max(1, scoped.length)) * 100;
      const avgScore = normalizeRangeScore(avgMonthlyReturnPct, -4, 6);
      const winScore = normalizeRangeScore(winRatePct, 35, 75);
      const score = (avgScore * 0.6) + (winScore * 0.4);
      const adjustment = clamp(((score - 50) / 50) * maxAdjustment, -maxAdjustment, maxAdjustment);
      const coverage = Math.min(100, Math.round((scoped.length / 5) * 100));

      return {
          available: true,
          score: Number(score.toFixed(2)),
          adjustment: Number(adjustment.toFixed(2)),
          coverage,
          avgMonthlyReturnPct: Number(avgMonthlyReturnPct.toFixed(2)),
          winRatePct: Number(winRatePct.toFixed(1)),
          sampleCount: scoped.length
      };
  };

  const computeStage4FactorOverlay = (
      item: any,
      candles: any[],
      marketSnapshot: MarketRegimeSnapshot | null,
      trendAlignment: TechnicalTicker['techMetrics']['trendAlignment']
  ) => {
      const seasonality = computeOhlcvSeasonalitySignals(candles, 3.5);

      const upstreamTrendAdj = toFiniteNumber(item?.trendAdjustment, 0);
      const upstreamSeasonalityAdj = toFiniteNumber(item?.seasonalityAdjustment, 0);
      const upstreamQualityAdj = toFiniteNumber(item?.qualityFactorAdjustment, 0);
      const upstreamRegimeAdj = toFiniteNumber(item?.regimeAdjustment, 0);

      const upstreamDefined = [
          item?.trendAdjustment,
          item?.seasonalityAdjustment,
          item?.qualityFactorAdjustment,
          item?.regimeAdjustment
      ].filter((v) => Number.isFinite(Number(v))).length;

      const upstreamCoverage = Math.round((upstreamDefined / 4) * 100);
      const upstreamAdjustment = clamp(
          (upstreamTrendAdj * 0.25) +
          (upstreamSeasonalityAdj * 0.35) +
          (upstreamQualityAdj * 0.25) +
          (upstreamRegimeAdj * 0.15),
          -3.5,
          3.5
      );

      const qualityScore = toFiniteNumber(item?.qualityFactorScore, toFiniteNumber(item?.qualityScore, 50));
      const regimeState = String(marketSnapshot?.regime?.state || item?.marketRegimeState || 'UNKNOWN').toUpperCase();
      let regimeAlignmentAdjustment = 0;

      if (regimeState === 'RISK_OFF') {
          if (qualityScore >= 70) regimeAlignmentAdjustment += 0.8;
          if (trendAlignment === 'POWER_TREND') regimeAlignmentAdjustment += 0.5;
          else if (trendAlignment === 'BEARISH') regimeAlignmentAdjustment -= 0.6;
      } else if (regimeState === 'RISK_ON') {
          if (qualityScore >= 65 && (trendAlignment === 'POWER_TREND' || trendAlignment === 'BULLISH')) regimeAlignmentAdjustment += 0.7;
          if (qualityScore < 45) regimeAlignmentAdjustment -= 0.8;
      }
      regimeAlignmentAdjustment = Number(clamp(regimeAlignmentAdjustment, -1.5, 1.5).toFixed(2));

      const totalAdjustment = Number(
          clamp(seasonality.adjustment + upstreamAdjustment + regimeAlignmentAdjustment, -5, 5).toFixed(2)
      );
      const factorCoverage = Math.round((seasonality.coverage * 0.5) + (upstreamCoverage * 0.5));
      const factorConfidence = Math.round(
          clamp(
              (factorCoverage * 0.7) +
              (Number.isFinite(qualityScore) ? 20 : 0) +
              (seasonality.available ? 10 : 0),
              0,
              100
          )
      );

      return {
          seasonality,
          upstreamAdjustment: Number(upstreamAdjustment.toFixed(2)),
          upstreamCoverage,
          regimeAlignmentAdjustment,
          qualityScore: Number(qualityScore.toFixed(2)),
          totalAdjustment,
          factorCoverage,
          factorConfidence
      };
  };

  // [NEW] Logarithmic Scaling for RVOL
  // Transforms raw ratio (e.g., 0.5, 2.0, 10.0) into 0-100 Score
  // Logic: 1.0 -> 50, 2.0 -> 75, 4.0 -> 100, 0.5 -> 25
  const normalizeRvolScore = (rawRvol: number): number => {
      if (rawRvol <= 0) return 0;
      // Base 50 + 25 * log2(rvol)
      const score = 50 + (25 * Math.log2(rawRvol));
      return Math.max(0, Math.min(100, isNaN(score) ? 0 : score));
  };

  // --- DATA SOURCES ---
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&includeItemsFromAllDrives=true&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      await assertDriveOk(res, `findFolder(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&includeItemsFromAllDrives=true&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      await assertDriveOk(res, `findFileId(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const findLatestFileParentId = async (token: string, fileName: string) => {
      const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,name,parents)&includeItemsFromAllDrives=true&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      await assertDriveOk(res, `findLatestFileParentId(${fileName})`);
      const data = await res.json();
      const parentId = data.files?.[0]?.parents?.[0] || null;
      return parentId;
  };

  const resolveSystemMapFolderId = async (token: string) => {
      let systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      if (systemMapId) return systemMapId;

      systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      if (systemMapId) {
          addLog("System Map Folder resolved from Drive root fallback.", "warn");
          return systemMapId;
      }

      const readyParentId = await findLatestFileParentId(token, GOOGLE_DRIVE_TARGET.stage4ReadyFile);
      if (readyParentId) {
          addLog(`System Map Folder inferred from ${GOOGLE_DRIVE_TARGET.stage4ReadyFile}.`, "warn");
          return readyParentId;
      }

      const progressParentId = await findLatestFileParentId(token, "COLLECTION_PROGRESS.json");
      if (progressParentId) {
          addLog("System Map Folder inferred from COLLECTION_PROGRESS.json.", "warn");
          return progressParentId;
      }

      return null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(res, `downloadFile(${fileId})`);
      const text = await res.text();
      return parseDriveJsonText(text);
  };

  const findLatestFileIdByName = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      await assertDriveOk(res, `findLatestFileIdByName(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const normalizeDriveOhlcv = (rawData: any) => {
      const rows = Array.isArray(rawData)
          ? rawData
          : Array.isArray(rawData?.data)
              ? rawData.data
              : Array.isArray(rawData?.candles)
                  ? rawData.candles
                  : [];

      return rows
          .map((row: any) => ({
              c: Number(row.close),
              h: Number(row.high),
              l: Number(row.low),
              o: Number(row.open),
              v: Number(row.volume),
              t: new Date(row.date).getTime()
          }))
          .filter((row: any) => Number.isFinite(row.c) && Number.isFinite(row.h) && Number.isFinite(row.l) && Number.isFinite(row.o) && Number.isFinite(row.v) && Number.isFinite(row.t))
          .sort((a: any, b: any) => a.t - b.t);
  };

  const loadOhlcvFromDrive = async (token: string, folderId: string, symbol: string) => {
      const fileName = `${symbol.toUpperCase()}_OHLCV.json`;
      const fileId = await findFileId(token, fileName, folderId);
      if (!fileId) return null;
      const rawData = await downloadFile(token, fileId);
      const hasSupportedShape = Array.isArray(rawData) || Array.isArray(rawData?.data) || Array.isArray(rawData?.candles);
      if (!hasSupportedShape) {
          throw new Error(`INVALID_OHLCV_FORMAT:${fileName}`);
      }
      return normalizeDriveOhlcv(rawData);
  };

  const countTrailingZeroVolumeFlatBars = (candles: any[]) => {
      let count = 0;
      for (let i = candles.length - 1; i >= 0; i--) {
          const candle = candles[i];
          const prev = candles[i - 1];
          const isFlatBar = candle.o === candle.h && candle.h === candle.l && candle.l === candle.c;
          const isZeroVolume = Number(candle.v || 0) === 0;
          const isSameAsPrevClose = !prev || candle.c === prev.c;
          if (isFlatBar && isZeroVolume && isSameAsPrevClose) count++;
          else break;
      }
      return count;
  };

  const countMissingBenchmarkBars = (benchmarkCandles: any[], lastTimestamp: number) => {
      if (!benchmarkCandles.length || !lastTimestamp) return 0;
      return benchmarkCandles.reduce((count, candle) => count + (candle.t > lastTimestamp ? 1 : 0), 0);
  };

  const evaluateDataQualityPenalty = (candles: any[], benchmarkCandles: any[], currentPrice: number) => {
      const lastTimestamp = candles[candles.length - 1]?.t || 0;
      const benchmarkGapBars = countMissingBenchmarkBars(benchmarkCandles, lastTimestamp);
      const zeroVolumeTailBars = countTrailingZeroVolumeFlatBars(candles);
      const avgVolume20 = calculateAverage(candles.map((c: any) => Number(c.v) || 0), 20);
      const avgDollarVolume20 = avgVolume20 * Math.max(currentPrice || 0, 0);
      const recentVolumes = candles.slice(-5).map((c: any) => Number(c.v) || 0);
      const nonZeroRecentVolumeCount = recentVolumes.filter((v: number) => v > 0).length;
      const lastVolume = Number(candles[candles.length - 1]?.v) || 0;
      const volumeCompressionRatio = avgVolume20 > 0 ? lastVolume / avgVolume20 : 1;

      let gapPenalty = 0;
      if (benchmarkGapBars >= 8) gapPenalty = 16;
      else if (benchmarkGapBars >= 5) gapPenalty = 11;
      else if (benchmarkGapBars >= 3) gapPenalty = 7;
      else if (benchmarkGapBars >= 1) gapPenalty = 3;

      let staleTailPenalty = 0;
      if (zeroVolumeTailBars >= 8) staleTailPenalty = 14;
      else if (zeroVolumeTailBars >= 5) staleTailPenalty = 10;
      else if (zeroVolumeTailBars >= 3) staleTailPenalty = 6;
      else if (zeroVolumeTailBars >= 1) staleTailPenalty = 2;

      let volumeHygienePenalty = 0;
      if (nonZeroRecentVolumeCount <= 1) volumeHygienePenalty += 6;
      else if (nonZeroRecentVolumeCount <= 3) volumeHygienePenalty += 3;

      if (volumeCompressionRatio < 0.12) volumeHygienePenalty += 3;
      else if (volumeCompressionRatio < 0.25) volumeHygienePenalty += 1.5;

      const freshnessPenalty = Math.min(25, gapPenalty + staleTailPenalty + volumeHygienePenalty);

      let liquidityPenalty = 0;
      if (avgDollarVolume20 < 750_000 || avgVolume20 < 30_000) liquidityPenalty += 16;
      else if (avgDollarVolume20 < 2_000_000 || avgVolume20 < 80_000) liquidityPenalty += 9;
      else if (avgDollarVolume20 < 5_000_000 || avgVolume20 < 200_000) liquidityPenalty += 4;
      else if (avgDollarVolume20 < 8_000_000 || avgVolume20 < 350_000) liquidityPenalty += 2;

      // Micro-cap names with thin prints can carry disproportionate slippage risk.
      if ((currentPrice || 0) < 2 && avgVolume20 < 150_000) liquidityPenalty += 2;

      liquidityPenalty = Math.min(20, liquidityPenalty);

      const dataQualityPenalty = Math.min(30, freshnessPenalty + liquidityPenalty);

      let dataQualityState: 'NORMAL' | 'THIN' | 'ILLIQUID' | 'STALE' = 'NORMAL';
      if (benchmarkGapBars >= 8 || zeroVolumeTailBars >= 8 || freshnessPenalty >= 20) dataQualityState = 'STALE';
      else if (avgDollarVolume20 < 750_000 || avgVolume20 < 30_000 || liquidityPenalty >= 16) dataQualityState = 'ILLIQUID';
      else if (dataQualityPenalty > 0) dataQualityState = 'THIN';

      return {
          dataQualityPenalty: Number(dataQualityPenalty.toFixed(2)),
          freshnessPenalty: Number(freshnessPenalty.toFixed(2)),
          liquidityPenalty: Number(liquidityPenalty.toFixed(2)),
          gapPenalty: Number(gapPenalty.toFixed(2)),
          staleTailPenalty: Number(staleTailPenalty.toFixed(2)),
          volumeHygienePenalty: Number(volumeHygienePenalty.toFixed(2)),
          benchmarkGapBars,
          zeroVolumeTailBars,
          nonZeroRecentVolumeCount,
          volumeCompressionRatio: Number(volumeCompressionRatio.toFixed(2)),
          avgDollarVolume20: Number(avgDollarVolume20.toFixed(2)),
          dataQualityState
      };
  };

  const applyDataQualityControls = (
      baseScore: number,
      dataQualityPenalty: ReturnType<typeof evaluateDataQualityPenalty>
  ) => {
      const postPenaltyScore = Number(Math.min(99, Math.max(1, baseScore - dataQualityPenalty.dataQualityPenalty)).toFixed(2));

      let dataQualityScoreCap: number | null = null;
      if (
          dataQualityPenalty.dataQualityState === 'STALE' &&
          (dataQualityPenalty.benchmarkGapBars >= 8 || dataQualityPenalty.zeroVolumeTailBars >= 8 || dataQualityPenalty.freshnessPenalty >= 22)
      ) {
          dataQualityScoreCap = 68;
      } else if (
          dataQualityPenalty.dataQualityState === 'ILLIQUID' &&
          (dataQualityPenalty.avgDollarVolume20 < 750_000 || dataQualityPenalty.liquidityPenalty >= 16)
      ) {
          dataQualityScoreCap = 58;
      }

      const finalScore = dataQualityScoreCap !== null
          ? Number(Math.min(postPenaltyScore, dataQualityScoreCap).toFixed(2))
          : postPenaltyScore;

      return {
          finalScore,
          postPenaltyScore,
          dataQualityScoreCap
      };
  };

  const fetchCandlesFromAPI = async (symbol: string): Promise<any[] | null> => {
      // [FIX] Ensure 'to' date is yesterday to avoid empty data issues on current trading day/pre-market
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 1); 
      const to = endDate.toISOString().split('T')[0];
      
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 250); 
      const from = fromDate.toISOString().split('T')[0];

      // [PRIORITY 1] Finnhub (Fastest, Batch Friendly)
      if (finnhubKey) {
          try {
              const fromUnix = Math.floor(fromDate.getTime() / 1000);
              const toUnix = Math.floor(endDate.getTime() / 1000);
              const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=D&from=${fromUnix}&to=${toUnix}&token=${finnhubKey}`;
              const res = await fetch(url);
              
              if (res.status === 429) throw new Error("RATE_LIMIT");
              const json = await res.json();
              
              if (json.s === "ok" && json.c && json.c.length > 20) {
                  return json.c.map((c: number, i: number) => ({
                      c: Number(c),
                      h: Number(json.h[i]),
                      l: Number(json.l[i]),
                      o: Number(json.o[i]),
                      v: Number(json.v[i]),
                      t: json.t[i] * 1000 // Convert seconds to ms
                  }));
              }
          } catch (e: any) {
              if (e.message === "RATE_LIMIT") console.warn(`Finnhub Limit for ${symbol}.`);
          }
      }
      
      if (polygonKey) {
          try {
              const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
              const res = await fetch(url);
              
              if (res.status === 429) throw new Error("RATE_LIMIT");
              if (res.ok) {
                  const json = await res.json();
                  if (json.results && json.results.length > 20) {
                      return json.results.map((c: any) => ({
                          c: c.c, h: c.h, l: c.l, o: c.o, v: c.v, t: c.t
                      }));
                  }
              }
          } catch (e: any) { 
              if (e.message === "RATE_LIMIT") console.warn(`Polygon Limit for ${symbol}. Switching to Alpha Vantage.`);
          }
      }

      if (alphaVantageKey) {
          try {
              await new Promise(r => setTimeout(r, 2000)); // Throttle
              const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${alphaVantageKey}`;
              const res = await fetch(url);
              const json = await res.json();
              
              if (json["Time Series (Daily)"]) {
                  const series = json["Time Series (Daily)"];
                  const dates = Object.keys(series).sort();
                  return dates.map(date => {
                      const d = series[date];
                      return {
                          t: new Date(date).getTime(),
                          o: Number(d["1. open"]),
                          h: Number(d["2. high"]),
                          l: Number(d["3. low"]),
                          c: Number(d["5. adjusted close"]),
                          v: Number(d["6. volume"])
                      };
                  });
              } else if (json.Note || json.Information) {
                  throw new Error("RATE_LIMIT");
              }
          } catch (e) { /* Fall through */ }
      }

      return null;
  };

  // [HEURISTIC ENGINE] Used when API fails (Rate Limit) - NOW WITH SYNTHETIC CHART
  const generateHeuristicData = (item: any) => {
      const price = item.price || 0;
      const sma20 = item.twentyDayAverage || ((price + (item.fiftyDayAverage || price)) / 2);
      const sma50 = item.fiftyDayAverage || price;
      const sma200 = item.twoHundredDayAverage || price * 0.9;
      const yearHigh = item.fiftyTwoWeekHigh || price * 1.2;
      const yearLow = item.fiftyTwoWeekLow || price * 0.8;
      const change = item.change || 0;

      const trendAlignment = resolveTrendAlignment(price, sma20, sma50, sma200);
      let trendScore = 50;
      
      if (trendAlignment === 'POWER_TREND') {
          trendScore = 90;
      } else if (trendAlignment === 'BULLISH') {
          trendScore = 70;
      } else {
          trendScore = 30;
      }

      const range = yearHigh - yearLow;
      const pos = range > 0 ? (price - yearLow) / range : 0.5;
      let estRsi = 30 + (pos * 40); 
      if (change > 3) estRsi += 10; 
      if (change < -3) estRsi -= 10;
      
      let score = (trendScore * 0.6) + (estRsi * 0.4);
      const rawRvol = Math.abs(change) > 2 ? 1.5 : 1.0;
      const clampedScore = Number(Math.min(99, Math.max(1, isNaN(score) ? 50 : score)).toFixed(2));

      // [SYNTHETIC CHART GENERATION]
      // Create plausible data points based on trend to prevent "Missing Chart" UI
      const syntheticHistory = [];
      const points = 60;
      let simPrice = price;
      // If trend is bullish, past prices should be lower (reverse time)
      const trendBias = trendAlignment === 'POWER_TREND' || trendAlignment === 'BULLISH' ? -0.003 : 0.003; 
      const volatility = 0.02; // 2% daily wobble

      const now = new Date();
      for (let i = 0; i < points; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          
          syntheticHistory.unshift({
              date: d.toISOString().split('T')[0],
              close: Number(simPrice.toFixed(2)),
              open: Number(simPrice.toFixed(2)),
              high: Number((simPrice * 1.01).toFixed(2)),
              low: Number((simPrice * 0.99).toFixed(2)),
              volume: 1000000 + Math.random() * 500000
          });

          // Random walk backwards
          const move = (Math.random() - 0.5) * volatility * simPrice;
          simPrice = simPrice + move + (simPrice * trendBias);
      }
      
      // [NEW] Heuristic ICT Data
      const volatilityRange = ((price - yearLow) / (yearHigh - yearLow)) * 100;

      return {
          technicalScore: clampedScore,
          techMetrics: {
              rsi: Number(estRsi.toFixed(2)),
              adx: 50,
              trend: trendScore,
              rvol: normalizeRvolScore(rawRvol),
              rawRvol: rawRvol,
              squeezeState: 'SQUEEZE_OFF',
              rsRating: Math.round(score),
              momentum: Number(estRsi.toFixed(2)),
              wyckoffPhase: trendAlignment === 'POWER_TREND' ? 'MARKUP' : 'ACCUM',
              trendAlignment,
              obvSlope: 'NEUTRAL',
              isBlueSky: price >= yearHigh * 0.98,
              goldenSetup: trendAlignment === 'POWER_TREND',
              volatilityRange: Number(volatilityRange.toFixed(2)),
              macdLine: 0,
              macdSignal: 0,
              macdHistogram: 0,
              mfi: 50,
              diPlus: 0,
              diMinus: 0,
              minerviniScore: trendAlignment === 'POWER_TREND' ? 75 : trendAlignment === 'BULLISH' ? 50 : 25,
              minerviniPassCount: trendAlignment === 'POWER_TREND' ? 6 : trendAlignment === 'BULLISH' ? 4 : 2,
              stage31SignalScore: 0,
              signalComboBonus: 0,
              signalHeatPenalty: 0,
              signalQualityState: 'NEUTRAL'
          },
          scoreBreakdown: {
              rawSignalScore: clampedScore,
              signalBonus: 0,
              factorAdjustment: 0,
              regimePenalty: 0,
              eventPenalty: 0,
              liquidityPenalty: 0,
              hygienePenalty: 0,
              finalScore: clampedScore
          },
          priceHistory: syntheticHistory, 
          // [NEW] ICT Data
          high52: yearHigh,
          low52: yearLow,
          recentSwingHigh: price * 1.05,
          recentSwingLow: price * 0.95,
          dataSource: 'HEURISTIC'
      };
  };

  const executeTechnicalScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      addLog("Phase 1: Resolving Stage 4 Ready Signal...", "info");

      const systemMapId = await resolveSystemMapFolderId(accessToken);

      if (!systemMapId) {
        addLog("System Map Folder Missing. Stage 4 cannot start.", "err");
        return;
      }

      const readySignalMaxAttempts = 24;
      const readySignalPollMs = 5000;
      let readyFileId: string | null = null;
      for (let attempt = 1; attempt <= readySignalMaxAttempts; attempt++) {
        readyFileId = await findFileId(accessToken, GOOGLE_DRIVE_TARGET.stage4ReadyFile, systemMapId);
        if (readyFileId) break;
        if (attempt < readySignalMaxAttempts) {
          addLog(
            `Stage 4 Ready Signal Missing. Waiting ${(readySignalPollMs / 1000).toFixed(0)}s (${attempt}/${readySignalMaxAttempts})...`,
            "warn"
          );
          await new Promise(resolve => setTimeout(resolve, readySignalPollMs));
        }
      }
      if (!readyFileId) {
        addLog("Stage 4 Ready Signal Missing. Wait for OHLCV sync completion.", "err");
        return;
      }

      const readyData = await downloadFile(accessToken, readyFileId);
      const stage3TriggerFile = readyData?.trigger_file;
      if (readyData?.status !== 'COMPLETED' || !stage3TriggerFile) {
        addLog("Stage 4 Ready Signal Invalid. Pipeline Aborted.", "err");
        return;
      }
      addLog(`Ready Signal Locked: ${stage3TriggerFile}`, "ok");

      let marketRegimeSnapshot: MarketRegimeSnapshot | null = null;
      let earningsEventMap: EarningsEventMap | null = null;
      try {
        const regimeFileId = await findFileId(accessToken, MARKET_REGIME_FILE, systemMapId);
        if (regimeFileId) {
          const snapshot = await downloadFile(accessToken, regimeFileId);
          if (snapshot?.trigger_file === stage3TriggerFile) {
            marketRegimeSnapshot = snapshot;
            const regimeState = snapshot?.regime?.state || 'UNKNOWN';
            const regimeScore = Number(snapshot?.regime?.score || 0);
            addLog(`Market Regime Locked: ${regimeState} (${regimeScore})`, "ok");
          } else {
            addLog("Market Regime Snapshot trigger mismatch. Macro overlay skipped.", "warn");
          }
        } else {
          addLog("Market Regime Snapshot Missing. Macro overlay skipped.", "warn");
        }
      } catch {
        addLog("Market Regime Snapshot Invalid. Macro overlay skipped.", "warn");
      }

      try {
        const earningsFileId = await findFileId(accessToken, EARNINGS_EVENT_FILE, systemMapId);
        if (earningsFileId) {
          const snapshot = await downloadFile(accessToken, earningsFileId);
          if (snapshot?.trigger_file === stage3TriggerFile) {
            earningsEventMap = snapshot;
            addLog(`Earnings Event Map Locked: ${Object.keys(snapshot?.events || {}).length} tracked events`, "ok");
          } else {
            addLog("Earnings Event Map trigger mismatch. Event overlay skipped.", "warn");
          }
        } else {
          addLog("Earnings Event Map Missing. Event overlay skipped.", "warn");
        }
      } catch {
        addLog("Earnings Event Map Invalid. Event overlay skipped.", "warn");
      }

      addLog("Phase 2: Retrieving Stage 3 Candidates...", "info");
      let stage3FolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      if (!stage3FolderId) stage3FolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder, 'root');

      let stage3FileId = stage3FolderId ? await findFileId(accessToken, stage3TriggerFile, stage3FolderId) : null;
      if (!stage3FileId) {
        stage3FileId = await findLatestFileIdByName(accessToken, stage3TriggerFile);
      }
      if (!stage3FileId) {
        addLog(`Triggered Stage 3 file not found: ${stage3TriggerFile}`, "err");
        return;
      }

      const stage3ContentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${stage3FileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      await assertDriveOk(stage3ContentRes, `loadStage3.content(${stage3FileId})`);
      const content = await stage3ContentRes.json();

      const stage3UniverseRaw = Array.isArray(content?.fundamental_universe) ? content.fundamental_universe : [];
      const stage3InputCount = Number(content?.manifest?.inputCount || stage3UniverseRaw.length);
      const stage3EligibleUniverse = stage3UniverseRaw.filter(isAnalysisEligibleTicker);
      const excludedByInstrumentType = Math.max(0, stage3UniverseRaw.length - stage3EligibleUniverse.length);
      if (excludedByInstrumentType > 0) {
          addLog(
              `Instrument Gate: excluded ${excludedByInstrumentType} non-common symbols before Stage 4 analysis.`,
              "warn"
          );
      }
      const candidates = stage3EligibleUniverse
          .sort((a: any, b: any) => b.fundamentalScore - a.fundamentalScore)
          .slice(0, 300);
      if (!candidates.length) {
        addLog("Triggered Stage 3 file contains no candidates.", "err");
        return;
      }

      const ohlcvFolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialOhlcvFolder, systemMapId);
      if (!ohlcvFolderId) {
        addLog("Drive OHLCV Folder Missing. Stage 4 cannot load chart data.", "err");
        return;
      }
      addLog("Drive OHLCV Vault Connected. Ticker-linked chart loading active.", "ok");

      setProgress({ current: 0, total: candidates.length, status: 'Fetching Benchmark...' });

      let benchmarkCandles: any[] = [];
      try {
          benchmarkCandles = await loadOhlcvFromDrive(accessToken, ohlcvFolderId, "SP500_INDEX") || [];
          if (benchmarkCandles.length > 0) {
              addLog("Benchmark (S&P 500 Index) Data Acquired from Drive. RS Rating Active.", "ok");
          } else {
              benchmarkCandles = await loadOhlcvFromDrive(accessToken, ohlcvFolderId, "NASDAQ_INDEX") || [];
              if (benchmarkCandles.length > 0) addLog("Primary benchmark missing. NASDAQ Index backup engaged.", "warn");
              else addLog("Benchmark index unavailable. Using Internal Relative Strength.", "warn");
          }
      } catch {
          addLog("Benchmark index unavailable. Using Internal Relative Strength.", "warn");
      }

      const vixForSqueezeProfile = Number.isFinite(Number(marketRegimeSnapshot?.benchmarks?.vix?.close))
          ? Number(marketRegimeSnapshot?.benchmarks?.vix?.close)
          : null;
      const ttmSqueezeConfig = resolveTtmSqueezeConfig(vixForSqueezeProfile);
      addLog(
          `[TTM_PROFILE] mode=${ttmSqueezeConfig.profileMode} profile=${ttmSqueezeConfig.profile} bb=${ttmSqueezeConfig.bbStdMult} kc(base/applied)=${ttmSqueezeConfig.kcAtrMultBase}/${ttmSqueezeConfig.kcAtrMultApplied} reason=${ttmSqueezeConfig.reason} vix=${ttmSqueezeConfig.vixRef ?? 'N/A'}`,
          "info"
      );

	      const grouped: Record<string, any[]> = {};
      candidates.forEach((c: any) => {
          const letter = c.symbol.charAt(0).toUpperCase();
          if (!grouped[letter]) grouped[letter] = [];
          grouped[letter].push(c);
      });

      const results: TechnicalTicker[] = [];
      const letters = Object.keys(grouped).sort();
      let droppedCount = 0;
      let scannedCount = 0;
      let dataQualityPenaltyCount = 0;
      let stalePenaltyCount = 0;
      let liquidityPenaltyCount = 0;
      let dataQualityCapCount = 0;
      let staleCapCount = 0;
      let illiquidCapCount = 0;
      let macroBoostCount = 0;
      let macroPenaltyCount = 0;
      let macroOverlayTotal = 0;
      let eventRiskPenaltyCount = 0;
      let eventHighRiskCount = 0;
      let eventMediumRiskCount = 0;
      let eventOverlayTotal = 0;
          let factorBoostCount = 0;
          let factorPenaltyCount = 0;
          let factorOverlayTotal = 0;
          let factorSeasonalityTotal = 0;
          let factorUpstreamTotal = 0;
          let factorRegimeAlignTotal = 0;
          let factorCoverageTotal = 0;
          let factorConfidenceTotal = 0;
          const stage4ApiFallbackEnabled = Boolean(STRATEGY_CONFIG.STAGE4_API_FALLBACK_ENABLED);
          const apiFallbackMaxRaw = Number(STRATEGY_CONFIG.STAGE4_API_FALLBACK_MAX ?? 50);
          const stage4ApiFallbackMax = Number.isFinite(apiFallbackMaxRaw) && apiFallbackMaxRaw > 0 ? Math.floor(apiFallbackMaxRaw) : 50;
          const stage4IntegrityMode = String(STRATEGY_CONFIG.STAGE4_DATA_INTEGRITY_MODE || 'STRICT').toUpperCase() === 'RELAXED' ? 'RELAXED' : 'STRICT';
          const stage4NonDriveScoreCapRaw = Number(STRATEGY_CONFIG.STAGE4_NON_DRIVE_SCORE_CAP ?? 58);
          const stage4NonDriveScoreCap = Number.isFinite(stage4NonDriveScoreCapRaw)
              ? Math.min(99, Math.max(1, stage4NonDriveScoreCapRaw))
              : 58;
          const stage4RequireDriveForBreakout = Boolean(STRATEGY_CONFIG.STAGE4_REQUIRE_DRIVE_FOR_BREAKOUT);
          let apiFallbackAttempted = 0;
          let apiFallbackRecovered = 0;
          let apiFallbackFailed = 0;
          let driveMissingCount = 0;
          let driveCorruptCount = 0;
          let heuristicRecoveredFromMissingCount = 0;
          let nonDriveSourceCount = 0;
          let nonDriveApiCount = 0;
          let nonDriveHeuristicCount = 0;
          let integrityCapAppliedCount = 0;
          let apiFallbackCapLogged = false;
          let ttmSampleCount = 0;
          let ttmSqueezeOnCount = 0;
          let ttmSqueezeFiredCount = 0;
          let ttmSqueezeOnRate = 0;
          let ttmAdaptiveStateAfterRun: TtmAdaptiveState | null = null;

          addLog(
              `[OHLCV_FALLBACK_CFG] enabled=${stage4ApiFallbackEnabled} max=${stage4ApiFallbackMax} source=STRATEGY_CONFIG | integrity=${stage4IntegrityMode} cap=${stage4NonDriveScoreCap} requireDriveBreakout=${stage4RequireDriveForBreakout}`,
              stage4ApiFallbackEnabled ? "ok" : "warn"
          );

      for (const letter of letters) {
          setProgress(prev => ({ ...prev, status: `Scanning Sector ${letter}...` }));

          const batch = grouped[letter];
          for (const item of batch) {
              scannedCount++;

              if (!item.symbol || item.price <= 0) {
                  droppedCount++;
                  continue;
              }

	              try {
	                  let candles: any[] = [];
	                  let dataSrc: 'DRIVE' | 'API_FALLBACK' = 'DRIVE';
                      let driveLoadState: 'OK' | 'MISSING' | 'CORRUPT' = 'MISSING';

	                  try {
	                      const driveCandles = await loadOhlcvFromDrive(accessToken, ohlcvFolderId, item.symbol);
	                      if (driveCandles && driveCandles.length > 0) {
                              candles = driveCandles;
                              driveLoadState = 'OK';
                          }
	                  } catch {
                          driveLoadState = 'CORRUPT';
	                  }

	                  if (candles.length === 0) {
                          if (driveLoadState === 'CORRUPT') {
                              driveCorruptCount++;
                              addLog(`Corrupt OHLCV detected: ${item.symbol.toUpperCase()}_OHLCV.json`, "warn");
                          } else {
                              driveMissingCount++;
                              addLog(`Missing OHLCV detected: ${item.symbol.toUpperCase()}_OHLCV.json`, "warn");
                          }

                          if (stage4ApiFallbackEnabled) {
                              if (apiFallbackAttempted < stage4ApiFallbackMax) {
                                  apiFallbackAttempted++;
                                  const apiCandles = await fetchCandlesFromAPI(item.symbol);
                                  if (apiCandles && apiCandles.length > 0) {
                                      candles = apiCandles;
                                      dataSrc = 'API_FALLBACK';
                                      apiFallbackRecovered++;
                                      addLog(`API fallback recovered OHLCV: ${item.symbol.toUpperCase()} (${apiCandles.length} bars)`, "ok");
                                  } else {
                                      apiFallbackFailed++;
                                  }
                              } else if (!apiFallbackCapLogged) {
                                  apiFallbackCapLogged = true;
                                  addLog(
                                      `API fallback cap reached (${stage4ApiFallbackMax}). Remaining missing OHLCV uses ${stage4IntegrityMode === 'STRICT' ? 'STRICT skip mode' : 'heuristic mode'}.`,
                                      "warn"
                                  );
                              }
                          }
	                  }

	                  let techData;

	                  if (candles.length < 30) {
                          if (stage4IntegrityMode === 'STRICT') {
                              droppedCount++;
                              addLog(
                                  `OHLCV insufficient in STRICT mode: ${item.symbol.toUpperCase()} (${candles.length} bars, source=${dataSrc})`,
                                  "warn"
                              );
                              continue;
                          }
                          if (candles.length === 0) heuristicRecoveredFromMissingCount++;
	                      addLog(`Sparse OHLCV fallback: ${item.symbol.toUpperCase()} (${candles.length} bars)`, "warn");
	                      techData = generateHeuristicData(item);
	                  } else {
                      // Perform Real Analysis
                      const closes = candles.map((c: any) => c.c);
                      const highs = candles.map((c: any) => c.h);
                      const lows = candles.map((c: any) => c.l);
                      const volumes = candles.map((c: any) => c.v);
                      const currentPrice = closes[closes.length - 1];

                      const rsi = calculateRSI(closes);
                      const adx = calculateADX(highs, lows, closes, 14);
                      const { diPlus, diMinus } = calculateDMI(highs, lows, closes, 14);

                      const sma20 = calculateSMA(closes, 20);
                      const sma50 = calculateSMA(closes, 50);
                      const sma200 = calculateSMA(closes, 200);

                      const trendAlignment = resolveTrendAlignment(currentPrice, sma20, sma50, sma200);
                      let wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN' = 'ACCUM';

                      if (trendAlignment === 'POWER_TREND') {
                          wyckoffPhase = 'MARKUP';
                      } else if (trendAlignment === 'BULLISH') {
                          wyckoffPhase = 'ACCUM';
                      } else if (trendAlignment === 'BEARISH') {
                          wyckoffPhase = 'MARKDOWN';
                      }

                      const trendScore = (trendAlignment === 'POWER_TREND' ? 95 : trendAlignment === 'BULLISH' ? 70 : 30);

                      // [NEW] RS Rating Calculation (vs market benchmark)
                      let rsRating = 50;
                      if (benchmarkCandles.length > 50 && closes.length > 50) {
                          const benchmarkNow = benchmarkCandles[benchmarkCandles.length - 1].c;
                          const benchmarkOldIndex = Math.max(0, benchmarkCandles.length - 63);
                          const benchmarkOld = benchmarkCandles[benchmarkOldIndex].c;

                          let benchmarkPerf = 0;
                          if (benchmarkOld > 0) benchmarkPerf = (benchmarkNow - benchmarkOld) / benchmarkOld;

                          const stockOldIndex = Math.max(0, closes.length - 63);
                          const stockOld = closes[stockOldIndex];

                          let stockPerf = 0;
                          if (stockOld > 0) stockPerf = (currentPrice - stockOld) / stockOld;

                          const alpha = stockPerf - benchmarkPerf;
                          rsRating = Math.min(99, Math.max(1, 50 + (alpha * 200)));
                          if (isNaN(rsRating)) rsRating = 50;
                      } else {
                          rsRating = Math.min(99, Math.max(1, (rsi * 0.5) + (trendScore * 0.5)));
                      }

                      const avgVol = calculateSMA(volumes.slice(0, -1), 20);
                      const lastVol = volumes[volumes.length - 1];
                      const rawRvol = avgVol > 0 ? lastVol / avgVol : 1;
                      const rvolScore = normalizeRvolScore(rawRvol);

                      const obvSlopeVal = calculateOBV(closes, volumes);
                      let obvSlope: 'ACCUMULATION' | 'DIVERGENCE' | 'NEUTRAL' = 'NEUTRAL';
                      if (obvSlopeVal > 0) obvSlope = 'ACCUMULATION';
                      else if (obvSlopeVal < 0 && currentPrice > sma50) obvSlope = 'DIVERGENCE';

                      const yearHigh = item.fiftyTwoWeekHigh || Math.max(...closes.slice(-250));
                      const isBlueSky = yearHigh > 0 && currentPrice >= yearHigh * 0.95;

                      let priceChange = 0;
                      if (closes.length >= 2) {
                           const prev = closes[closes.length - 2];
                           if (prev > 0) priceChange = (currentPrice - prev) / prev;
                      }

                      const goldenSetup = rawRvol > 1.5 && priceChange > 0.02 && currentPrice > sma200;

                      const lookback252 = candles.slice(-252);
                      const high52 = Math.max(...lookback252.map((c: any) => c.h));
                      const low52 = Math.min(...lookback252.map((c: any) => c.l));

                      const lookback20 = candles.slice(-20);
                      const recentSwingHigh = Math.max(...lookback20.map((c: any) => c.h));
                      const recentSwingLow = Math.min(...lookback20.map((c: any) => c.l));

                      const { macdLine, signalLine, histogram, previousHistogram } = calculateMACD(closes);
                      const mfi = calculateMFI(highs, lows, closes, volumes, 14);

                      let volatilityRange = 50;
                      if (high52 > low52) {
                          volatilityRange = ((currentPrice - low52) / (high52 - low52)) * 100;
                      }

                      const { passCount: minerviniPassCount, score: minerviniScore } = calculateMinerviniTemplate(closes, high52, low52);
                      const squeezeState = calculateTTMSqueezeState(highs, lows, closes, histogram, ttmSqueezeConfig);
                      ttmSampleCount++;
                      if (squeezeState === 'SQUEEZE_ON') ttmSqueezeOnCount++;
                      if (squeezeState === 'FIRED_LONG' || squeezeState === 'FIRED_SHORT') ttmSqueezeFiredCount++;
                      const stage31Signal = calculateStage31SignalOverlay({
                          minerviniScore,
                          minerviniPassCount,
                          macdLine,
                          signalLine,
                          histogram,
                          previousHistogram,
                          mfi,
                          diPlus,
                          diMinus,
                          adx,
                          rsi,
                          rawRvol,
                          priceChange,
                          squeezeState
                      });

                      const isDisplacement = rsi >= 55 && rsi <= 70 && adx >= 25 && rawRvol >= 1.5;

                      let techScore = rsRating * 0.4;
                      techScore += (trendAlignment === 'POWER_TREND' ? 30 : trendAlignment === 'BULLISH' ? 15 : 0);

                      const rvolBonus = Math.min(20, (rvolScore - 50) * 0.5);
                      techScore += Math.max(0, rvolBonus);

                      techScore += (squeezeState === 'SQUEEZE_ON' ? 10 : squeezeState === 'FIRED_LONG' ? 8 : 0);
                      if (goldenSetup || isBlueSky) techScore += 10;
                      techScore += stage31Signal.stage31SignalScore;

                      if (isDisplacement) {
                          techScore = Math.max(techScore, 92);
                          addLog(`Accelerator Ready: Displacement Scanned`, "ok");
                      }

                      if (adx < 20 && rawRvol < 0.8) {
                          techScore = Math.min(techScore, 45);
                      }

                      const safeTechnicalScore = Number(Math.min(99, Math.max(1, isNaN(techScore) ? 50 : techScore)).toFixed(2));

                      if (trendAlignment === 'POWER_TREND') {
                           addLog(`Power Trend Detected: ${item.symbol} is ready for launch`, "ok");
                      }

                      techData = {
                          technicalScore: safeTechnicalScore,
                          techMetrics: {
                              rsi: Number(rsi.toFixed(2)),
                              adx: Number(adx.toFixed(2)),
                              trend: Number(trendScore.toFixed(2)),
                              rvol: Number(rvolScore.toFixed(2)),
                              rawRvol: Number(rawRvol.toFixed(2)),
                              squeezeState,
                              rsRating: Number(rsRating.toFixed(0)),
                              momentum: Number(rsRating.toFixed(2)),
                              wyckoffPhase,
                              trendAlignment,
                              obvSlope,
                              isBlueSky,
                              goldenSetup,
                              volatilityRange: Number(volatilityRange.toFixed(2)),
                              macdLine,
                              macdSignal: signalLine,
                              macdHistogram: histogram,
                              mfi,
                              diPlus,
                              diMinus,
                              minerviniScore,
                              minerviniPassCount,
                              stage31SignalScore: stage31Signal.stage31SignalScore,
                              signalComboBonus: stage31Signal.signalComboBonus,
                              signalHeatPenalty: stage31Signal.signalHeatPenalty,
                              signalQualityState: stage31Signal.signalQualityState,
                              ttmProfile: ttmSqueezeConfig.profile,
                              ttmProfileMode: ttmSqueezeConfig.profileMode,
                              ttmKcAtrMult: ttmSqueezeConfig.kcAtrMultApplied,
                              ttmBbStdMult: ttmSqueezeConfig.bbStdMult
                          },
                          scoreBreakdown: {
                              rawSignalScore: safeTechnicalScore,
                              signalBonus: 0,
                              factorAdjustment: 0,
                              regimePenalty: 0,
                              eventPenalty: 0,
                              liquidityPenalty: 0,
                              hygienePenalty: 0,
                              finalScore: safeTechnicalScore
                          },
                          priceHistory: candles.slice(-120).map((c: any) => ({
                              date: new Date(c.t).toISOString().split('T')[0], close: c.c, open: c.o, high: c.h, low: c.l, volume: c.v
                          })),
                          high52,
                          low52,
                          recentSwingHigh,
                          recentSwingLow,
                          dataSource: dataSrc
                      };
                  }

                  const macroOverlay = calculateMacroOverlay(marketRegimeSnapshot, {
                      trendAlignment: techData.techMetrics.trendAlignment,
                      rsRating: techData.techMetrics.rsRating,
                      minerviniPassCount: techData.techMetrics.minerviniPassCount
                  });

                  if (macroOverlay.macroOverlayScore > 0) macroBoostCount++;
                  else if (macroOverlay.macroOverlayScore < 0) macroPenaltyCount++;
                  macroOverlayTotal += macroOverlay.macroOverlayScore;

                  techData = {
                      ...techData,
                      technicalScore: Number(Math.min(99, Math.max(1, techData.technicalScore + macroOverlay.macroOverlayScore)).toFixed(2)),
                      scoreBreakdown: {
                          ...techData.scoreBreakdown,
                          signalBonus: Number((techData.scoreBreakdown.signalBonus + Math.max(0, macroOverlay.macroOverlayScore)).toFixed(2)),
                          regimePenalty: Number((techData.scoreBreakdown.regimePenalty + Math.max(0, -macroOverlay.macroOverlayScore)).toFixed(2)),
                          finalScore: Number(Math.min(99, Math.max(1, techData.technicalScore + macroOverlay.macroOverlayScore)).toFixed(2))
                      },
                      techMetrics: {
                          ...techData.techMetrics,
                          ...macroOverlay
                      }
                  };

                  const eventRiskOverlay = calculateEventRiskOverlay(
                      earningsEventMap,
                      item.symbol,
                      macroOverlay.marketRegime
                  );

                  if (eventRiskOverlay.eventRiskState === 'HIGH') eventHighRiskCount++;
                  else if (eventRiskOverlay.eventRiskState === 'MEDIUM') eventMediumRiskCount++;
                  if (eventRiskOverlay.eventRiskPenalty > 0) eventRiskPenaltyCount++;
                  eventOverlayTotal += eventRiskOverlay.eventRiskPenalty;

                  techData = {
                      ...techData,
                      technicalScore: Number(Math.min(99, Math.max(1, techData.technicalScore - eventRiskOverlay.eventRiskPenalty)).toFixed(2)),
                      scoreBreakdown: {
                          ...techData.scoreBreakdown,
                          eventPenalty: Number((techData.scoreBreakdown.eventPenalty + eventRiskOverlay.eventRiskPenalty).toFixed(2)),
                          finalScore: Number(Math.min(99, Math.max(1, techData.technicalScore - eventRiskOverlay.eventRiskPenalty)).toFixed(2))
                      },
                      techMetrics: {
                          ...techData.techMetrics,
                          ...eventRiskOverlay
                      }
                  };

                  // Stage4 factor stack: 5Y OHLCV seasonality + Stage3 upstream factors + regime alignment.
                  const factorOverlay = computeStage4FactorOverlay(
                      item,
                      candles,
                      marketRegimeSnapshot,
                      techData.techMetrics.trendAlignment
                  );

                  if (factorOverlay.totalAdjustment > 0) factorBoostCount++;
                  else if (factorOverlay.totalAdjustment < 0) factorPenaltyCount++;
                  factorOverlayTotal += factorOverlay.totalAdjustment;
                  factorSeasonalityTotal += factorOverlay.seasonality.adjustment;
                  factorUpstreamTotal += factorOverlay.upstreamAdjustment;
                  factorRegimeAlignTotal += factorOverlay.regimeAlignmentAdjustment;
                  factorCoverageTotal += factorOverlay.factorCoverage;
                  factorConfidenceTotal += factorOverlay.factorConfidence;

                  techData = {
                      ...techData,
                      technicalScore: Number(Math.min(99, Math.max(1, techData.technicalScore + factorOverlay.totalAdjustment)).toFixed(2)),
                      scoreBreakdown: {
                          ...techData.scoreBreakdown,
                          factorAdjustment: Number(((techData.scoreBreakdown.factorAdjustment || 0) + factorOverlay.totalAdjustment).toFixed(2)),
                          finalScore: Number(Math.min(99, Math.max(1, techData.technicalScore + factorOverlay.totalAdjustment)).toFixed(2))
                      },
                      techMetrics: {
                          ...techData.techMetrics,
                          factorSeasonalityScore: factorOverlay.seasonality.score,
                          factorSeasonalityAdjustment: factorOverlay.seasonality.adjustment,
                          factorSeasonalityCoverage: factorOverlay.seasonality.coverage,
                          factorSeasonalityAvgMonthlyReturnPct: factorOverlay.seasonality.avgMonthlyReturnPct,
                          factorSeasonalityWinRatePct: factorOverlay.seasonality.winRatePct,
                          factorSeasonalitySampleCount: factorOverlay.seasonality.sampleCount,
                          factorUpstreamAdjustment: factorOverlay.upstreamAdjustment,
                          factorUpstreamCoverage: factorOverlay.upstreamCoverage,
                          factorRegimeAlignmentAdjustment: factorOverlay.regimeAlignmentAdjustment,
                          factorQualityScore: factorOverlay.qualityScore,
                          factorAdjustmentTotal: factorOverlay.totalAdjustment,
                          factorCoverage: factorOverlay.factorCoverage,
                          factorConfidence: factorOverlay.factorConfidence
                      },
                      factorSeasonalityScore: factorOverlay.seasonality.score,
                      factorSeasonalityAdjustment: factorOverlay.seasonality.adjustment,
                      factorSeasonalityCoverage: factorOverlay.seasonality.coverage,
                      factorUpstreamAdjustment: factorOverlay.upstreamAdjustment,
                      factorUpstreamCoverage: factorOverlay.upstreamCoverage,
                      factorRegimeAlignmentAdjustment: factorOverlay.regimeAlignmentAdjustment,
                      factorQualityScore: factorOverlay.qualityScore,
                      factorAdjustmentTotal: factorOverlay.totalAdjustment,
                      factorCoverage: factorOverlay.factorCoverage,
                      factorConfidence: factorOverlay.factorConfidence
                  };

                  const effectivePrice = candles[candles.length - 1]?.c || item.price || 0;
                  const dataQualityPenalty = evaluateDataQualityPenalty(candles, benchmarkCandles, effectivePrice);
                  if (dataQualityPenalty.dataQualityPenalty > 0) {
                      dataQualityPenaltyCount++;
                      if (dataQualityPenalty.freshnessPenalty > 0) stalePenaltyCount++;
                      if (dataQualityPenalty.liquidityPenalty > 0) liquidityPenaltyCount++;
                  }

                  const dataQualityControl = applyDataQualityControls(techData.technicalScore, dataQualityPenalty);
                  if (dataQualityControl.dataQualityScoreCap !== null && dataQualityControl.finalScore < dataQualityControl.postPenaltyScore) {
                      dataQualityCapCount++;
                      if (dataQualityPenalty.dataQualityState === 'STALE') staleCapCount++;
                      if (dataQualityPenalty.dataQualityState === 'ILLIQUID') illiquidCapCount++;
                  }

                  techData = {
                      ...techData,
                      technicalScore: dataQualityControl.finalScore,
                      scoreBreakdown: {
                          ...techData.scoreBreakdown,
                          liquidityPenalty: Number((techData.scoreBreakdown.liquidityPenalty + dataQualityPenalty.liquidityPenalty).toFixed(2)),
                          hygienePenalty: Number((techData.scoreBreakdown.hygienePenalty + dataQualityPenalty.freshnessPenalty).toFixed(2)),
                          finalScore: dataQualityControl.finalScore
                      },
                      techMetrics: {
                          ...techData.techMetrics,
                          ...dataQualityPenalty,
                          dataQualityScoreCap: dataQualityControl.dataQualityScoreCap
                      }
                  };

                  const isNonDriveSource = techData.dataSource !== 'DRIVE';
                  if (isNonDriveSource) {
                      nonDriveSourceCount++;
                      if (techData.dataSource === 'API_FALLBACK') nonDriveApiCount++;
                      else nonDriveHeuristicCount++;
                  }

                  if (isNonDriveSource) {
                      let integrityPenalty = 0;
                      if (stage4IntegrityMode === 'STRICT') {
                          const cappedScore = Number(Math.min(techData.technicalScore, stage4NonDriveScoreCap).toFixed(2));
                          integrityPenalty = Number((techData.technicalScore - cappedScore).toFixed(2));
                          if (integrityPenalty > 0) {
                              integrityCapAppliedCount++;
                              techData = {
                                  ...techData,
                                  technicalScore: cappedScore,
                                  scoreBreakdown: {
                                      ...techData.scoreBreakdown,
                                      hygienePenalty: Number((techData.scoreBreakdown.hygienePenalty + integrityPenalty).toFixed(2)),
                                      finalScore: cappedScore
                                  }
                              };
                          }
                      }

                      techData = {
                          ...techData,
                          techMetrics: {
                              ...techData.techMetrics,
                              sourceIntegrityState: 'NON_DRIVE_DEGRADED',
                              sourceIntegrityMode: stage4IntegrityMode,
                              sourceIntegrityPenalty: integrityPenalty,
                              sourceIntegrityScoreCap: stage4IntegrityMode === 'STRICT' ? stage4NonDriveScoreCap : undefined
                          }
                      };
                  } else {
                      techData = {
                          ...techData,
                          techMetrics: {
                              ...techData.techMetrics,
                              sourceIntegrityState: 'DRIVE_VERIFIED',
                              sourceIntegrityMode: stage4IntegrityMode,
                              sourceIntegrityPenalty: 0,
                              sourceIntegrityScoreCap: undefined
                          }
                      };
                  }

                  let isTechnicalBreakout = techData.techMetrics.trendAlignment === 'POWER_TREND' || techData.techMetrics.isBlueSky;
                  if (stage4RequireDriveForBreakout && isNonDriveSource) {
                      isTechnicalBreakout = false;
                  }

                  results.push({
                      ...item,
                      ...techData,
                      isTechnicalBreakout,
                      lastUpdate: new Date().toISOString()
                  });

              } catch (e) {
                  console.error(`Tech Analysis Error for ${item.symbol}`, e);
                  results.push({
                      ...item,
                      technicalScore: 0,
                      techMetrics: {
                          rsi: 50, adx: 0, trend: 50, rvol: 50, rawRvol: 1.0,
                          squeezeState: 'SQUEEZE_OFF', rsRating: 50, momentum: 50,
                          wyckoffPhase: 'ACCUM', trendAlignment: 'NEUTRAL',
                          obvSlope: 'NEUTRAL', isBlueSky: false, goldenSetup: false,
                          volatilityRange: 50
                      },
                      scoreBreakdown: {
                          rawSignalScore: 0,
                          signalBonus: 0,
                          factorAdjustment: 0,
                          regimePenalty: 0,
                          eventPenalty: 0,
                          liquidityPenalty: 0,
                          hygienePenalty: 0,
                          finalScore: 0
                      },
                      priceHistory: [],
                      high52: item.fiftyTwoWeekHigh || 0,
                      low52: item.fiftyTwoWeekLow || 0,
                      recentSwingHigh: 0,
                      recentSwingLow: 0,
                      lastUpdate: new Date().toISOString(),
                      dataSource: 'FAILURE'
                  });
              }
          }

          setProgress(prev => ({ ...prev, current: scannedCount }));
          await new Promise(r => setTimeout(r, 10));
      }

      if (results.length === 0) {
        addLog("No OHLCV-backed candidates survived Stage 4.", "err");
        return;
      }

	      const survivalRate = ((results.length / candidates.length) * 100).toFixed(1);
	      addLog(`Survival Rate: ${survivalRate}% (Dropped ${droppedCount} invalid assets).`, "ok");
          if (driveMissingCount > 0 || driveCorruptCount > 0 || apiFallbackRecovered > 0 || heuristicRecoveredFromMissingCount > 0) {
              addLog(
                  `OHLCV Recovery: missing ${driveMissingCount}, corrupt ${driveCorruptCount}, apiRecovered ${apiFallbackRecovered}, heuristicRecovered ${heuristicRecoveredFromMissingCount}.`,
                  "warn"
              );
          }
          if (stage4ApiFallbackEnabled) {
              const fallbackSummaryType = apiFallbackFailed > 0 ? "warn" : "ok";
              addLog(
                  `API Fallback Usage: attempted ${apiFallbackAttempted}/${stage4ApiFallbackMax}, recovered ${apiFallbackRecovered}, failed ${apiFallbackFailed}.`,
                  fallbackSummaryType
              );
          }
          if (nonDriveSourceCount > 0) {
              const integritySummaryType = integrityCapAppliedCount > 0 ? "warn" : "ok";
              addLog(
                  `[INTEGRITY_GUARD] mode=${stage4IntegrityMode} nonDrive=${nonDriveSourceCount} (api ${nonDriveApiCount}, heuristic ${nonDriveHeuristicCount}) capped=${integrityCapAppliedCount} cap=${stage4NonDriveScoreCap} requireDriveBreakout=${stage4RequireDriveForBreakout}.`,
                  integritySummaryType
              );
          }
	      if (dataQualityPenaltyCount > 0) {
	          addLog(`Data Hygiene Overlay: Penalized ${dataQualityPenaltyCount} assets (stale ${stalePenaltyCount}, liquidity ${liquidityPenaltyCount}).`, "warn");
	      }
      if (dataQualityCapCount > 0) {
          addLog(`Selection Guard: Capped ${dataQualityCapCount} stale/illiquid assets (stale ${staleCapCount}, illiquid ${illiquidCapCount}).`, "warn");
      }
      if (marketRegimeSnapshot) {
          const regimeState = marketRegimeSnapshot?.regime?.state || 'UNKNOWN';
          const regimeScore = Number(marketRegimeSnapshot?.regime?.score || 0);
          const averageMacroOverlay = Number((macroOverlayTotal / Math.max(results.length, 1)).toFixed(2));
          addLog(`Macro Overlay: ${regimeState} (${regimeScore}) adjusted ${results.length} assets (boosted ${macroBoostCount}, penalized ${macroPenaltyCount}, avg ${averageMacroOverlay}).`, "ok");
      }
      if (earningsEventMap) {
          const averageEventPenalty = Number((eventOverlayTotal / Math.max(results.length, 1)).toFixed(2));
          addLog(`Event Overlay: flagged ${eventRiskPenaltyCount} assets (high ${eventHighRiskCount}, medium ${eventMediumRiskCount}, avg -${averageEventPenalty}).`, "ok");
      }
      if (results.length > 0) {
          const avgFactorTotal = Number((factorOverlayTotal / results.length).toFixed(2));
          const avgSeasonalityAdj = Number((factorSeasonalityTotal / results.length).toFixed(2));
          const avgUpstreamAdj = Number((factorUpstreamTotal / results.length).toFixed(2));
          const avgRegimeAlignAdj = Number((factorRegimeAlignTotal / results.length).toFixed(2));
          const avgCoverage = Number((factorCoverageTotal / results.length).toFixed(1));
          const avgConfidence = Number((factorConfidenceTotal / results.length).toFixed(1));
          addLog(
              `[5Y_FACTOR] stage4 seasonality=${avgSeasonalityAdj.toFixed(2)} upstream=${avgUpstreamAdj.toFixed(2)} regime=${avgRegimeAlignAdj.toFixed(2)} total=${avgFactorTotal.toFixed(2)} | boost ${factorBoostCount}, cut ${factorPenaltyCount}, cov ${avgCoverage}%, conf ${avgConfidence}%`,
              "ok"
          );
      }

      ttmSqueezeOnRate = ttmSampleCount > 0 ? Number((ttmSqueezeOnCount / ttmSampleCount).toFixed(4)) : 0;
      addLog(
          `[TTM_PROFILE_STATS] samples ${ttmSampleCount}, squeezeOn ${ttmSqueezeOnCount}, fired ${ttmSqueezeFiredCount}, onRate ${ttmSqueezeOnRate}`,
          "info"
      );

      ttmAdaptiveStateAfterRun = updateTtmAdaptiveState(ttmSqueezeConfig, ttmSampleCount, ttmSqueezeOnCount);
      if (ttmAdaptiveStateAfterRun) {
          const minSamples = Number(STRATEGY_CONFIG.TTM_SQUEEZE_ADAPTIVE_MIN_SAMPLES || 600);
          const shadowOrActive = ttmSqueezeConfig.profileMode === 'ADAPTIVE_ACTIVE' ? 'active' : 'shadow';
          addLog(
              `[TTM_ADAPTIVE_${shadowOrActive.toUpperCase()}] runs ${ttmAdaptiveStateAfterRun.runs}, samples ${ttmAdaptiveStateAfterRun.samples}/${minSamples}, emaOnRate ${ttmAdaptiveStateAfterRun.emaSqueezeOnRate}, recommendedKC ${ttmAdaptiveStateAfterRun.recommendedKcAtrMult}, appliedKC ${ttmAdaptiveStateAfterRun.lastAppliedKcAtrMult}`,
              "info"
          );
      }

      results.sort((a, b) => b.technicalScore - a.technicalScore);

      // Guardrail: keep JSON schema stable even if any upstream branch misses scoreBreakdown.
      const auditReadyResults: TechnicalTicker[] = results.map((ticker) => {
          const safeFinalScore = Number((ticker.technicalScore ?? 0).toFixed(2));
          return {
              ...ticker,
              scoreBreakdown: ticker.scoreBreakdown
                  ? { ...ticker.scoreBreakdown, finalScore: safeFinalScore }
                  : {
                      rawSignalScore: safeFinalScore,
                      signalBonus: 0,
                      factorAdjustment: 0,
                      regimePenalty: 0,
                      eventPenalty: 0,
                      liquidityPenalty: 0,
                      hygienePenalty: 0,
                      finalScore: safeFinalScore
                  }
          };
      });

      const topAuditUniverse = auditReadyResults.slice(0, 10);
      const formatSigned = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
      const majorPenaltyCounter: Record<'FACTOR' | 'REGIME' | 'EVENT' | 'LIQUIDITY' | 'HYGIENE' | 'NONE', number> = {
          FACTOR: 0,
          REGIME: 0,
          EVENT: 0,
          LIQUIDITY: 0,
          HYGIENE: 0,
          NONE: 0
      };

      topAuditUniverse.forEach((ticker, index) => {
          const sb = ticker.scoreBreakdown || {
              rawSignalScore: ticker.technicalScore,
              signalBonus: 0,
              factorAdjustment: 0,
              regimePenalty: 0,
              eventPenalty: 0,
              liquidityPenalty: 0,
              hygienePenalty: 0,
              finalScore: ticker.technicalScore
          };

          const penaltyLadder: Array<{ label: 'FACTOR' | 'REGIME' | 'EVENT' | 'LIQUIDITY' | 'HYGIENE'; value: number }> = [
              { label: 'FACTOR', value: Math.max(0, -(sb.factorAdjustment || 0)) },
              { label: 'REGIME', value: sb.regimePenalty || 0 },
              { label: 'EVENT', value: sb.eventPenalty || 0 },
              { label: 'LIQUIDITY', value: sb.liquidityPenalty || 0 },
              { label: 'HYGIENE', value: sb.hygienePenalty || 0 }
          ];

          let majorPenalty: 'FACTOR' | 'REGIME' | 'EVENT' | 'LIQUIDITY' | 'HYGIENE' | 'NONE' = 'NONE';
          let majorPenaltyValue = 0;
          penaltyLadder.forEach((penalty) => {
              if (penalty.value > majorPenaltyValue) {
                  majorPenalty = penalty.label;
                  majorPenaltyValue = penalty.value;
              }
          });
          majorPenaltyCounter[majorPenalty] += 1;

          const vixDistance = ticker.techMetrics?.vixDistanceFromRiskOff;
          const vixDistanceLabel = typeof vixDistance === 'number' ? vixDistance.toFixed(2) : 'N/A';
          const eventBand = ticker.techMetrics?.eventDistanceBand || 'NONE';

          addLog(
              `[AUDIT_SCORE] #${index + 1} ${ticker.symbol} | raw ${sb.rawSignalScore.toFixed(2)} -> bonus ${formatSigned(sb.signalBonus || 0)} -> factor ${formatSigned(sb.factorAdjustment || 0)} -> regime -${(sb.regimePenalty || 0).toFixed(2)} -> event -${(sb.eventPenalty || 0).toFixed(2)} -> liq -${(sb.liquidityPenalty || 0).toFixed(2)} -> hyg -${(sb.hygienePenalty || 0).toFixed(2)} | final ${sb.finalScore.toFixed(2)} | major ${majorPenalty}${majorPenaltyValue > 0 ? `(${majorPenaltyValue.toFixed(2)})` : ''} | VIXΔ ${vixDistanceLabel} | EVT ${eventBand}`,
              "info"
          );
      });

      addLog(
          `[AUDIT_SCORE_TOP_PENALTY] Top10 major causes => FACTOR:${majorPenaltyCounter.FACTOR} REGIME:${majorPenaltyCounter.REGIME} EVENT:${majorPenaltyCounter.EVENT} LIQ:${majorPenaltyCounter.LIQUIDITY} HYG:${majorPenaltyCounter.HYGIENE} NONE:${majorPenaltyCounter.NONE}`,
          "info"
      );
      setProcessedData(auditReadyResults);
      if (auditReadyResults.length > 0) handleTickerSelect(auditReadyResults[0]);

      addLog(`[DATA-SYNC] Passing Fundamental Alpha Tags to ICT Stage`, "ok");

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const timestamp = formatKstFilenameTimestamp();
      const fileName = `STAGE4_TECHNICAL_FULL_${timestamp}.json`;

      const payload = {
          manifest: {
              version: "7.5.1",
              count: auditReadyResults.length,
              inputCount: stage3InputCount,
              eligibleCount: stage3EligibleUniverse.length,
              excludedByInstrumentType,
              strategy: "Hybrid_Heuristic_Fusion_ADX_LogRVOL_RS",
              survivalRate,
              sourceStage3File: stage3TriggerFile,
              readyTimestamp: readyData?.timestamp || null,
              dataSource: GOOGLE_DRIVE_TARGET.financialOhlcvFolder,
              marketRegimeState: marketRegimeSnapshot?.regime?.state || null,
              marketRegimeScore: marketRegimeSnapshot?.regime?.score ?? null,
              ttmSqueezeProfileMode: ttmSqueezeConfig.profileMode,
              ttmSqueezeProfile: ttmSqueezeConfig.profile,
              ttmSqueezeBbStdMult: ttmSqueezeConfig.bbStdMult,
              ttmSqueezeKcAtrMultBase: ttmSqueezeConfig.kcAtrMultBase,
              ttmSqueezeKcAtrMultApplied: ttmSqueezeConfig.kcAtrMultApplied,
              ttmSqueezeProfileReason: ttmSqueezeConfig.reason,
              ttmSqueezeVixRef: ttmSqueezeConfig.vixRef,
              ttmSqueezeAdaptive: ttmSqueezeConfig.adaptive,
              ttmSqueezeStats: {
                  sampleCount: ttmSampleCount,
                  squeezeOnCount: ttmSqueezeOnCount,
                  squeezeFiredCount: ttmSqueezeFiredCount,
                  squeezeOnRate: ttmSqueezeOnRate,
                  adaptiveStateAfterRun: ttmAdaptiveStateAfterRun
              },
              earningsEventSource: earningsEventMap?.source || null,
              earningsEventCount: Object.keys(earningsEventMap?.events || {}).length,
              factorOverlayStats: {
                  avgTotalAdjustment: Number((factorOverlayTotal / Math.max(results.length, 1)).toFixed(2)),
                  avgSeasonalityAdjustment: Number((factorSeasonalityTotal / Math.max(results.length, 1)).toFixed(2)),
                  avgUpstreamAdjustment: Number((factorUpstreamTotal / Math.max(results.length, 1)).toFixed(2)),
                  avgRegimeAlignmentAdjustment: Number((factorRegimeAlignTotal / Math.max(results.length, 1)).toFixed(2)),
                  avgCoverage: Number((factorCoverageTotal / Math.max(results.length, 1)).toFixed(1)),
                  avgConfidence: Number((factorConfidenceTotal / Math.max(results.length, 1)).toFixed(1)),
                  boostedCount: factorBoostCount,
                  penalizedCount: factorPenaltyCount
              },
              sourceIntegrity: {
                  mode: stage4IntegrityMode,
                  requireDriveForBreakout: stage4RequireDriveForBreakout,
                  nonDriveScoreCap: stage4NonDriveScoreCap,
                  nonDriveCount: nonDriveSourceCount,
                  apiFallbackCount: nonDriveApiCount,
                  heuristicCount: nonDriveHeuristicCount,
                  capAppliedCount: integrityCapAppliedCount
              },
              scoreBreakdownSchema: "v1.1",
              scoreBreakdownCoverage: `${auditReadyResults.filter((x) => !!x.scoreBreakdown).length}/${auditReadyResults.length}`
          },
          technical_universe: auditReadyResults
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => '');
          throw new Error(`Drive upload failed (${fileName}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }

      addLog(`Vault Saved: ${fileName}`, "ok");
      addLog(`Tech Analysis Complete. ${auditReadyResults.length} OHLCV-backed assets preserved.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`System Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
      startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
    await assertDriveOk(listRes, `ensureFolder.list(${name})`);
    const listed = await listRes.json();
    if (listed.files?.length > 0) return listed.files[0].id;
    const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    });
    await assertDriveOk(createRes, `ensureFolder.create(${name})`);
    const created = await createRes.json();
    if (!created?.id) throw new Error(`Drive ensureFolder.create(${name}) succeeded but missing folder id`);
    return created.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-orange-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Tech_Tactician v7.5</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-orange-400 text-orange-400 animate-pulse' : 'border-orange-500/20 bg-orange-500/10 text-orange-400'}`}>
                            {getStatusBadgeText()}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span></span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span></span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeTechnicalScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-orange-800 text-orange-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-orange-600 text-white shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Crunching Volatility...' : 'Execute Momentum Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Tech Momentum Rank ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Sorted by Tech Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-orange-900/30 border-orange-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className={`text-[10px] font-black w-4 ${i < 3 ? 'text-orange-400' : 'text-slate-500'}`}>{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white flex items-center gap-2">
                                         {t.symbol}
                                         {t.techMetrics.trendAlignment === 'POWER_TREND' && (
                                             <span className="text-[6px] bg-rose-500 text-white px-1 rounded animate-pulse">POWER</span>
                                         )}
                                     </p>
                                     <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right flex items-center gap-3">
                                 <div className="flex flex-col items-end">
                                     <p className="text-[10px] font-mono font-bold text-white">{t.technicalScore.toFixed(1)}</p>
                                     <p className="text-[7px] text-slate-500 uppercase">{t.dataSource === 'HEURISTIC' ? 'Est.' : 'Tech'}</p>
                                 </div>
                                 <div className={`w-1.5 h-8 rounded-full ${t.technicalScore > 80 ? 'bg-orange-500' : t.technicalScore > 50 ? 'bg-amber-500' : 'bg-slate-700'}`}></div>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Waiting for Technical Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - COCKPIT */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                     {(selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' || selectedTicker.techMetrics.squeezeState === 'FIRED_LONG') && (
                                         <span 
                                            onClick={() => setActiveMetric('TTM_SQUEEZE')}
                                            className="text-[8px] font-black bg-rose-500 text-white px-2 py-0.5 rounded animate-pulse uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                         >
                                             {selectedTicker.techMetrics.squeezeState === 'FIRED_LONG' ? 'TTM Squeeze Fired' : 'TTM Squeeze Active'}
                                         </span>
                                     )}
                                     {selectedTicker.techMetrics.goldenSetup && (
                                         <span 
                                            onClick={() => setActiveMetric('GOLDEN_SETUP')}
                                            className="text-[8px] font-black bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                         >
                                             Golden Setup
                                         </span>
                                     )}
                                     <span 
                                        onClick={() => setActiveMetric('RVOL')}
                                        className="text-[8px] font-black bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                     >
                                         RVOL {selectedTicker.techMetrics.rawRvol}x
                                     </span>
                                     <span 
                                        onClick={() => setActiveMetric(selectedTicker.techMetrics.trendAlignment)}
                                        className="text-[8px] font-black bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/10 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                     >
                                         {selectedTicker.techMetrics.trendAlignment}
                                     </span>
                                     {selectedTicker.dataSource === 'HEURISTIC' && (
                                        <span 
                                            onClick={() => setActiveMetric('ESTIMATED')}
                                            className="text-[8px] font-black bg-slate-800 text-amber-500 px-2 py-0.5 rounded border border-amber-500/30 uppercase cursor-help hover:opacity-80 transition-opacity tech-insight-trigger"
                                        >
                                            ESTIMATED
                                        </span>
                                     )}
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Momentum</p>
                                 <p 
                                    onClick={() => setActiveMetric('MOMENTUM')}
                                    className="text-2xl font-black text-orange-400 tracking-tighter cursor-help hover:scale-105 transition-transform tech-insight-trigger"
                                 >
                                     {selectedTicker.techMetrics.momentum}
                                 </p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4 my-2">
                             {selectedTicker.priceHistory && selectedTicker.priceHistory.length > 0 ? (
                                isVisible && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={selectedTicker.priceHistory}>
                                        <defs>
                                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                        <XAxis dataKey="date" hide />
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} 
                                            itemStyle={{ color: '#f97316' }}
                                        />
                                        <Area type="monotone" dataKey="close" stroke="#f97316" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                                )
                             ) : (
                                 <div className="h-full flex flex-col items-center justify-center opacity-20 text-[8px] font-mono">
                                     <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                     CHART DATA UNAVAILABLE
                                 </div>
                             )}
                        </div>

                        {/* Interactive Metrics Grid - Expanded to 6 items */}
                        <div className="grid grid-cols-3 gap-2 mt-2">
                             {[
                                { id: 'RS_RATING', label: 'RS Rating', val: selectedTicker.techMetrics.rsRating, good: selectedTicker.techMetrics.rsRating > 80 },
                                { id: 'TTM_SQUEEZE', label: 'TTM Squeeze', val: formatSqueezeBadge(selectedTicker.techMetrics.squeezeState), good: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' || selectedTicker.techMetrics.squeezeState === 'FIRED_LONG' },
                                { id: 'MINERVINI', label: 'Minervini', val: `${selectedTicker.techMetrics.minerviniPassCount ?? 0}/8`, good: (selectedTicker.techMetrics.minerviniScore || 0) >= 75 },
                                { id: 'MACD', label: 'MACD Hist', val: (selectedTicker.techMetrics.macdHistogram || 0).toFixed(2), good: (selectedTicker.techMetrics.macdHistogram || 0) > 0 },
                                { id: 'DMI', label: 'DMI Bias', val: getDmiBiasLabel(selectedTicker.techMetrics.diPlus, selectedTicker.techMetrics.diMinus), good: (selectedTicker.techMetrics.diPlus || 0) > (selectedTicker.techMetrics.diMinus || 0) },
                                { id: 'MFI', label: 'MFI Flow', val: (selectedTicker.techMetrics.mfi || 0).toFixed(2), good: (selectedTicker.techMetrics.mfi || 0) >= 55 && (selectedTicker.techMetrics.mfi || 0) <= 80 }
                             ].map((m) => (
                                 <div 
                                    key={m.id} 
                                    onClick={() => setActiveMetric(m.id)}
                                    className={`tech-insight-card p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 group tech-insight-trigger ${activeMetric === m.id ? 'bg-orange-600 border-orange-400 text-white shadow-lg' : m.good ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                                 >
                                     <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <p className={`text-[7px] uppercase font-bold ${activeMetric === m.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'}`}>{m.label}</p>
                                     </div>
                                     <p className={`text-[10px] font-black ${activeMetric === m.id ? 'text-white' : m.good ? 'text-orange-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>

                        {/* Tech Insight Overlay */}
                        {activeMetric && TECH_DEFINITIONS[activeMetric] && (
                            <div className="tech-insight-overlay absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-orange-500/30 shadow-2xl relative">
                                    <button onClick={() => setActiveMetric(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    <h5 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        {TECH_DEFINITIONS[activeMetric].title}
                                    </h5>
                                    <div className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                            {TECH_DEFINITIONS[activeMetric].desc}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="bg-white/5 p-2 rounded border border-white/5">
                                        <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                        <p className="text-[8px] text-slate-400">{TECH_DEFINITIONS[activeMetric].interpretation}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-orange-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Tech_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-orange-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-orange-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
