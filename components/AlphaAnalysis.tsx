
import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell, AreaChart, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS, STRATEGY_CONFIG } from '../constants';
import { generateAlphaSynthesis, generateTop6NeuralOutlook, runAiBacktest, analyzePipelineStatus, generateTelegramBrief, archiveReport, removeCitations, type TelegramBriefContractContext } from '../services/intelligenceService';
import { sendTelegramReport, sendSimulationTelegramReport, buildTelegramMessage } from '../services/telegramService';
import { fetchPortalIndices } from '../services/portalIndicesService';

declare global {
  interface Window {
    latestMarketPulse?: {
      spy: { price: number; change: number; source?: string; symbol?: string };
      qqq: { price: number; change: number; source?: string; symbol?: string };
      vix?: { price: number; change?: number; source?: string; symbol?: string };
      ndx?: { price: number; change: number; source?: string; symbol?: string };
      ixic?: { price: number; change: number; source?: string; symbol?: string };
      meta?: { source: string; fetchedAt: string };
    };
  }
}

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
  modelRank?: number | null;
  executionRank?: number | null;
  executionScore?: number | null;
  executionReadinessScore?: number | null;
  qualityScore?: number | null;
  executionBucket?: 'EXECUTABLE' | 'WATCHLIST';
  executionReason?: 'VALID_EXEC' | 'WAIT_PULLBACK_TOO_DEEP' | 'INVALID_GEOMETRY' | 'INVALID_DATA';
  finalDecision?: 'EXECUTABLE_NOW' | 'WAIT_PRICE' | 'BLOCKED_RISK' | 'BLOCKED_EVENT';
  decisionReason?:
    | 'executable_pullback'
    | 'wait_pullback_not_reached'
    | 'wait_earnings_data_missing'
    | 'wait_state_verdict_conflict'
    | 'blocked_invalid_geometry'
    | 'blocked_missing_trade_box'
    | 'blocked_quality_missing_expected_return'
    | 'blocked_quality_conviction_floor'
    | 'blocked_quality_verdict_unusable'
    | 'blocked_stop_too_tight'
    | 'blocked_stop_too_wide'
    | 'blocked_target_too_close'
    | 'blocked_anchor_exec_gap'
    | 'blocked_rr_below_min'
    | 'blocked_ev_non_positive'
    | 'blocked_earnings_data_missing'
    | 'blocked_earnings_window'
    | 'blocked_state_verdict_conflict'
    | 'blocked_verdict_risk_off';
  chosenPlanType?: 'PULLBACK' | 'BREAKOUT';
  expectedReturnPct?: number | null;
  riskRewardRatioValue?: number | null;
  earningsDaysToEvent?: number | null;
  aiVerdict?: string;
  verdictRaw?: string;
  verdictFinal?: string;
  verdictConflict?: boolean;
  verdictConflictDetail?: string | null;
  stateVerdictConflict?: boolean;
  marketCapClass?: 'LARGE' | 'MID' | 'SMALL';
  sectorTheme?: string;
  convictionScore?: number;
  rawConvictionScore?: number;
  expectedReturn?: string;
  rawExpectedReturn?: string;
  gatedExpectedReturn?: string;
  theme?: string;
  selectionReasons?: string[];
  investmentOutlook?: string;
  aiSentiment?: string;
  analysisLogic?: string;
  entryPrice?: number;
  entryAnchorPrice?: number;
  entryExecPrice?: number;
  entryExecPriceShadow?: number;
  entryDistancePct?: number;
  entryDistancePctShadow?: number;
  stopDistancePct?: number | null;
  targetDistancePct?: number | null;
  anchorExecGapPct?: number | null;
  entryFeasible?: boolean;
  entryFeasibleShadow?: boolean;
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
  integrityScore?: number; // [NEW] Data Quality Score
  tradePlanSource?: 'RAW' | 'AI_FALLBACK' | 'DERIVED_2R' | 'INVALID';
  tradePlanStatus?: 'VALID' | 'DERIVED' | 'INVALID';
  tradePlanStatusShadow?: 'VALID_EXEC' | 'WAIT_PULLBACK_TOO_DEEP' | 'INVALID_GEOMETRY' | 'INVALID_DATA';
  // [NEW] ICT 5-Step Data
  pdZone?: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT';
  otePrice?: number;
  ictStopLoss?: number;
  // [NEW] Dual-Alpha & Hybrid Tags
  spyAlpha?: boolean;
  qqqAlpha?: boolean;
  isInstitutionalEntry?: boolean;
  isOverheated?: boolean;
  isHighGrowthQuality?: boolean;
  isTechnicalBreakout?: boolean;
  sectorRankBonus?: boolean;
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

interface Stage5SourceMeta {
  fileId: string;
  fileName: string;
  count: number;
  timestamp?: string;
  hash?: string;
  symbols?: string[];
  lockMode?: 'LATEST' | 'OVERRIDE_ID' | 'OVERRIDE_NAME';
}

interface Stage5LockOverrideConfig {
  enabled: boolean;
  fileId?: string;
  fileName?: string;
}

interface Stage5LockDriveFile {
  id: string;
  name: string;
  createdTime?: string;
}

interface TelegramContractItem {
  symbol: string;
  entry: number | null;
  target: number | null;
  stop: number | null;
  expectedReturnPct: number | null;
}

interface TelegramContractCheckResult {
  ok: boolean;
  mismatches: string[];
  expected: TelegramContractItem[];
  actual: TelegramContractItem[];
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

const AUTO_CONTROL_PREFIX = "__AUTO_CONTROL__:";
const toAutoControlPayload = (code: string) => `${AUTO_CONTROL_PREFIX}${code}`;

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
    },
    'EDGE_EXEC': {
        title: "Execution Feasibility (실행 가능성 계수)",
        desc: "유동성/변동성/갭 리스크를 반영한 체결 가능성 계수입니다. 기대수익률 보정에 직접 사용됩니다.",
        strategy: "해석:\n- 0.95 이상: 실행 리스크 낮음\n- 0.85~0.95: 보통\n- 0.85 미만: 체결/슬리피지/갭 리스크 주의"
    },
    'RISK_ATR': {
        title: "ATR% (변동성 리스크)",
        desc: "최근 14일 평균 진폭(ATR)을 종가 대비 %로 환산한 변동성 지표입니다.",
        strategy: "해석:\n- 3% 미만: 안정\n- 3~6%: 중간 변동성\n- 6% 이상: 리스크 관리 강화 필요"
    },
    'RISK_GAP': {
        title: "Gap Risk % (갭 리스크)",
        desc: "최근 14일 시가-전일종가 평균 괴리율입니다. 장중 손절 미체결 리스크를 반영합니다.",
        strategy: "해석:\n- 1% 미만: 낮음\n- 1~2%: 보통\n- 2% 이상: 갭 리스크 주의"
    },
    'RISK_LIQ': {
        title: "Liquidity State (유동성 상태)",
        desc: "데이터 품질/거래대금/신선도 기반 유동성 상태입니다.",
        strategy: "해석:\n- NORMAL: 실행 적합\n- THIN: 호가 얇음\n- ILLIQUID/STALE: 보수적 집행 필요"
    },
    'REGIME_VIX': {
        title: "VIX Distance (레짐 임계거리)",
        desc: "현재 VIX와 시스템 임계치(VIX_RISK_OFF_LEVEL) 간 거리입니다.",
        strategy: "해석:\n- 음수: Risk-On 여지\n- 0 이상: Risk-Off 경계/진입 강도 축소"
    },
    'REGIME_RS': {
        title: "Index Relative Strength (지수 상대강도)",
        desc: "SPX/NDX 대비 종목 알파 강도입니다.",
        strategy: "해석:\n- 양수: 지수 대비 초과강도\n- 음수: 지수 대비 열위"
    },
    'EVENT_DDAY': {
        title: "Earnings D-Day (실적 이벤트 거리)",
        desc: "다음 실적 발표까지 남은 일수입니다.",
        strategy: "해석:\n- D-3 이내: 이벤트 리스크 급증\n- D-4~D-10: 주의 구간\n- D-10 이후: 비교적 안정"
    },
    'ROBUST_STABILITY': {
        title: "Signal Stability (신호 안정성)",
        desc: "신호 조합 보너스/과열 페널티를 합산한 안정성 점수입니다.",
        strategy: "해석:\n- 70 이상: 신호 정합성 우수\n- 50~70: 중립\n- 50 미만: 과열/충돌 가능성"
    },
    'ROBUST_CONSENSUS': {
        title: "Stage Consensus (3단계 합의도)",
        desc: "Fundamental/Technical/ICT 3축이 동시에 강한지(>=70) 평가한 합의 지수입니다.",
        strategy: "해석:\n- 3/3: 강한 합의\n- 2/3: 조건부 합의\n- 1/3 이하: 단일 신호 의존"
    },
    'INTEGRITY_SCORE': {
        title: "Data Integrity (데이터 무결성)",
        desc: "수집/정합성/품질 점수를 통합한 무결성 지수입니다.",
        strategy: "해석:\n- 85 이상: 고신뢰\n- 70~85: 실무 사용 가능\n- 70 미만: 보수적 해석 필요"
    },
    'CONCENTRATION_SCORE': {
        title: "Sector Concentration (섹터 쏠림)",
        desc: "Top6 포트폴리오 내 동일 섹터 집중도입니다.",
        strategy: "해석:\n- 35% 이하: 분산 양호\n- 35~50%: 주의\n- 50% 초과: 편중 리스크"
    }
};

const STAGE5_LOCK_OVERRIDE_KEY = 'US_ALPHA_STAGE5_LOCK_OVERRIDE';
const STAGE5_LOCK_FILE_ID_KEY = 'US_ALPHA_STAGE5_LOCK_FILE_ID';
const STAGE5_LOCK_FILE_NAME_KEY = 'US_ALPHA_STAGE5_LOCK_FILE_NAME';

const parseBooleanFlag = (value: any): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const fnv1aHash = (input: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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

const SIGNAL_DEFINITIONS: Record<string, { title: string; desc: string }> = {
    'FINALIST': {
        title: "🔴 Final Selection",
        desc: "수백 개의 후보 중 모든 AI 필터링과 재무 검증을 통과한 **'오늘의 주인공'**입니다. 가장 우선적으로 검토해야 할 최우수 종목입니다."
    },
    'CONVICTION': {
        title: "⭐ Alpha Conviction",
        desc: "AI가 과거의 성공 패턴과 현재 수급 상황을 대조해 도출한 '상승 가능성에 대한 자신감' 수치입니다."
    },
    'HIDDEN_GEM': {
        title: "💎 Hidden Gem",
        desc: "내실(ROE)이 매우 탄탄하지만 아직 시장의 주목을 덜 받은 종목으로, 향후 **'강력한 가격 폭발'**을 일으킬 가능성이 높은 보석입니다."
    },
    'DISCOUNT': {
        title: "🏷️ Discount",
        desc: "현재 주가가 기관의 평균 매수 단가보다 낮거나 최적 진입 구간(OTE)에 위치하여 '가장 싸고 안전한' 진입 시점임을 뜻합니다."
    },
    'HYPER_GROWTH': {
        title: "🚀 Hyper Growth",
        desc: "산업 평균보다 몇 배는 빠른 속도로 성장하고 있는 종목입니다. '상승 추세에 올라타는' 공격적 매수 전략에 적합합니다."
    },
    'INSTITUTIONAL': {
        title: "🏢 Institutional",
        desc: "거대 자본인 **'기관 및 세력'**의 매집이 확인된 종목입니다. 개인 주도주보다 수급이 안정적이며 몸통 세력의 흐름을 따릅니다."
    },
    'CROSS_CHECK': {
        title: "🤝 Cross-Check",
        desc: "서로 다른 알고리즘을 가진 두 AI 전문가(Gemini & Sonar)가 **'동시에 합격점'**을 준 종목으로, 데이터 신뢰도가 가장 높습니다."
    },
    'VALUE': {
        title: "💰 Value",
        desc: "실적 대비 주가가 저평가되어 **'가격 방어력'**이 뛰어난 종목입니다. 하락장에서도 상대적으로 안전한 가치 투자를 지향합니다."
    },
    'MOMENTUM': {
        title: "🔥 Momentum",
        desc: "주가에 상승 탄력이 붙어 **'추세적 상승'**이 진행 중인 종목입니다. 단기 및 중기 수익을 극대화하기에 유리합니다."
    },
    'DEFENSIVE': {
        title: "🛡️ Defensive",
        desc: "시장 변동성이 커져도 주가 하락폭이 작은 '방어적' 성격의 우량주입니다. 포트폴리오의 리스크를 낮춰주는 방패 역할을 합니다."
    },
    'MODEL_RANK': {
        title: "🧭 Model Rank",
        desc: "Stage6 모델 점수(최종 게이트 반영) 기준 순위입니다. **아이디어의 상대 우선순위**를 보여줍니다."
    },
    'EXEC_RANK': {
        title: "📌 Exec Rank",
        desc: "실행 가능 후보(Entry/Target/Stop 기하학 + 거리 조건 통과) 안에서의 순위입니다. **실제 주문 우선순위**에 더 가깝습니다."
    },
    'EXEC_ROW_STATUS': {
        title: "🧭 Execution Status",
        desc: "현재 카드의 실행 계획 상태입니다. Valid Setup이면 실행 계약 관점에서 구조가 유효하다는 의미입니다."
    },
    'EXEC_ROW_REASON': {
        title: "🧩 Decision Reason",
        desc: "해당 종목이 지금 실행/대기/차단으로 분류된 핵심 사유입니다."
    },
    'AQ_SCORE': {
        title: "🟨 AQ (Analysis Quality)",
        desc: "분석 품질 신뢰 점수입니다. 데이터 정합성/평결 일관성 관점에서 신뢰도를 나타냅니다."
    },
    'XS_SCORE': {
        title: "🟦 XS (Execution Score)",
        desc: "실전 집행 적합 점수입니다. 가격 거리, 게이트 통과, 구조 안정성을 반영합니다."
    },
    'RR_RATIO': {
        title: "🟩 RR (Risk-Reward)",
        desc: "손익비(목표 수익 / 손절 손실)입니다. 값이 높을수록 기대 손익 구조가 유리합니다."
    },
    'ER_PERCENT': {
        title: "🟩 ER% (Expected Return)",
        desc: "기대 수익률입니다. 실행 전제 조건을 반영한 상대적 기대치로 해석합니다."
    },
    'EARNINGS_DDAY': {
        title: "🟪 EARN D-Day",
        desc: "다음 실적 이벤트까지 남은 일수입니다. D-3 이내는 이벤트 변동성 리스크가 크게 증가합니다."
    },
    'EXECUTABLE': {
        title: "✅ Executable",
        desc: "현재 규칙에서 **즉시 실행 가능한 상태**입니다. (거리/기하학/게이트 조건 통과)"
    },
    'WATCHLIST': {
        title: "⏳ Watchlist",
        desc: "종목 자체가 나쁜 것이 아니라 **지금 타이밍이 실행 조건을 아직 충족하지 못한 상태**입니다. 조건 충족 시 실행 후보로 전환됩니다."
    },
    'DECISION_EXECUTABLE_NOW': {
        title: "🟢 Decision: EXECUTABLE_NOW",
        desc: "가격 구조/손익비/이벤트 조건을 통과해 **현재 시점 실행 후보**로 분류된 상태입니다."
    },
    'DECISION_WAIT_PRICE': {
        title: "🟡 Decision: WAIT_PRICE",
        desc: "종목 품질은 유지되지만, **현재 가격이 실행 허용 거리 조건을 아직 만족하지 않아 대기** 상태입니다."
    },
    'DECISION_BLOCKED_RISK': {
        title: "🔴 Decision: BLOCKED_RISK",
        desc: "리스크 관리 규칙(RR/기하학/리스크 평결 등) 위반으로 **현재 실행 차단** 상태입니다."
    },
    'DECISION_BLOCKED_EVENT': {
        title: "🟣 Decision: BLOCKED_EVENT",
        desc: "실적/이벤트 블랙아웃 등 이벤트 리스크로 **현재 실행 차단** 상태입니다."
    },
    'REASON_EXECUTABLE_PULLBACK': {
        title: "✅ Reason: executable_pullback",
        desc: "PULLBACK 실행 시나리오 기준으로 가격/기하학/리스크 조건을 통과했습니다."
    },
    'REASON_WAIT_PULLBACK_NOT_REACHED': {
        title: "⏳ Reason: wait_pullback_not_reached",
        desc: "PULLBACK 진입 기준 대비 현재 가격 괴리가 커서, **진입 타점 미도달** 상태입니다."
    },
    'REASON_WAIT_EARNINGS_DATA_MISSING': {
        title: "⏳ Reason: wait_earnings_data_missing",
        desc: "실적 일정 데이터가 누락되어 이벤트 리스크를 확정할 수 없어 **보수적으로 대기**합니다."
    },
    'REASON_WAIT_STATE_VERDICT_CONFLICT': {
        title: "⏳ Reason: wait_state_verdict_conflict",
        desc: "시장 구조 상태(예: DISTRIBUTION)와 AI 매수 평결이 충돌해 **추가 확인 전 대기**합니다."
    },
    'REASON_BLOCKED_INVALID_GEOMETRY': {
        title: "⛔ Reason: blocked_invalid_geometry",
        desc: "Entry/Target/Stop 가격 구조가 유효한 롱 포지션 기하학을 만족하지 못했습니다."
    },
    'REASON_BLOCKED_MISSING_TRADE_BOX': {
        title: "⛔ Reason: blocked_missing_trade_box",
        desc: "Entry/Target/Stop 중 필수 값이 누락되어 실행 계약을 구성할 수 없습니다."
    },
    'REASON_BLOCKED_QUALITY_MISSING_ER': {
        title: "⛔ Reason: blocked_quality_missing_expected_return",
        desc: "기대수익률(ER%) 데이터가 비어 있어 실행 신뢰도를 검증할 수 없으므로 차단했습니다."
    },
    'REASON_BLOCKED_QUALITY_CONVICTION': {
        title: "⛔ Reason: blocked_quality_conviction_floor",
        desc: "Conviction 점수가 최소 품질 기준보다 낮아 실행 후보에서 제외했습니다."
    },
    'REASON_BLOCKED_QUALITY_VERDICT': {
        title: "⛔ Reason: blocked_quality_verdict_unusable",
        desc: "AI 평결이 비어있거나 실행형 롱 시그널이 아니라 품질 게이트에서 차단했습니다."
    },
    'REASON_BLOCKED_STOP_TOO_TIGHT': {
        title: "⛔ Reason: blocked_stop_too_tight",
        desc: "손절 폭이 최소 기준보다 너무 촘촘해 체결 노이즈에 쉽게 무효화될 가능성이 커 차단했습니다."
    },
    'REASON_BLOCKED_STOP_TOO_WIDE': {
        title: "⛔ Reason: blocked_stop_too_wide",
        desc: "손절 폭이 최대 기준을 초과해 포지션당 손실 위험이 과도하므로 실행을 차단했습니다."
    },
    'REASON_BLOCKED_TARGET_TOO_CLOSE': {
        title: "⛔ Reason: blocked_target_too_close",
        desc: "목표 거리 자체가 너무 짧아 실질 기대 보상이 부족하다고 판단해 차단했습니다."
    },
    'REASON_BLOCKED_ANCHOR_EXEC_GAP': {
        title: "⛔ Reason: blocked_anchor_exec_gap",
        desc: "진입(앵커)와 진입(실행) 괴리가 허용치를 초과해 현재 계획의 실행 신뢰도가 낮아 차단했습니다."
    },
    'REASON_BLOCKED_RR_BELOW_MIN': {
        title: "⛔ Reason: blocked_rr_below_min",
        desc: "손익비(RR)가 최소 기준 미만으로, 기대값 대비 리스크가 불리합니다."
    },
    'REASON_BLOCKED_EV_NON_POSITIVE': {
        title: "⛔ Reason: blocked_ev_non_positive",
        desc: "기대수익률(예상 리턴)이 최소 기준 이하로 실행 가치가 부족합니다."
    },
    'REASON_BLOCKED_EARNINGS_DATA_MISSING': {
        title: "⛔ Reason: blocked_earnings_data_missing",
        desc: "실적 일정 데이터가 비어 있어 이벤트 리스크를 통제할 수 없으므로 실행을 차단했습니다."
    },
    'REASON_BLOCKED_EARNINGS_WINDOW': {
        title: "⛔ Reason: blocked_earnings_window",
        desc: "실적 발표 근접 구간으로 이벤트 변동성 리스크가 커 실행을 차단했습니다."
    },
    'REASON_BLOCKED_STATE_VERDICT_CONFLICT': {
        title: "⛔ Reason: blocked_state_verdict_conflict",
        desc: "시장 구조 상태와 AI 평결이 충돌하여 신뢰 가능한 집행 시점으로 보기 어려워 차단했습니다."
    },
    'REASON_BLOCKED_VERDICT_RISK_OFF': {
        title: "⛔ Reason: blocked_verdict_risk_off",
        desc: "최종 AI 평결이 리스크오프 계열로 판정되어 실행을 차단했습니다."
    }
};

// [FORCED STYLE FIX] Markdown Component Overrides
// This function handles "Main Title (Subtitle)" splitting and styling
const renderStyledHeader = (props: any) => {
    const extractText = (node: any): string => {
            if (typeof node === 'string') return node;
            if (Array.isArray(node)) return node.map(extractText).join('');
            if (node && node.props && node.props.children) return extractText(node.props.children);
            return String(node || "");
    };

    const text = extractText(props.children);
    
    // Regex to capture "Main Text" and "(Subtitle)"
    // Matches anything up to the last '(', then the parenthesis content
    const match = text.match(/^(.+?)(\s*\(.+\).*)$/);

    if (match) {
        const mainTitle = match[1].trim();
        const subTitle = match[2].trim();
        return (
             <h2 className="mt-8 mb-4 border-b border-white/10 pb-2 flex flex-wrap items-baseline gap-x-2">
                <span className="text-xl font-black text-white tracking-tight">{mainTitle}</span>
                <span className="text-sm font-bold text-slate-500 whitespace-nowrap">{subTitle}</span>
            </h2>
        );
    }
    
    // Fallback if regex doesn't match
    return <h2 className="text-xl font-black text-white mt-8 mb-4 border-b border-white/10 pb-2" {...props} />;
};

const MarkdownComponents: any = {
    h1: renderStyledHeader,
    h2: renderStyledHeader,
    h3: (props: any) => (
        <h3 className="text-sm font-bold text-blue-400 mt-3 mb-1" {...props} />
    ),
    p: (props: any) => (
        <p className="text-[13px] text-slate-300 leading-relaxed mb-2" {...props} />
    ),
    ul: (props: any) => <ul className="space-y-1.5 mb-3" {...props} />,
    ol: (props: any) => <ol className="space-y-1.5 mb-3" {...props} />,
    li: (props: any) => (
        <li className="text-[13px] text-slate-300 leading-relaxed pl-1" {...props}>
            {props.children}
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

const fetchMarketBenchmarks = async () => {
    try {
        const data = await fetchPortalIndices();

        const findIndex = (sym: string) => {
            const aliases: Record<string, string[]> = {
                SPX: ['SPX', 'SP500'],
                NDX: ['NDX', 'NASDAQ100'],
                IXIC: ['IXIC', 'NASDAQ'],
                VIX: ['VIX'],
            };
            const keySet = new Set([sym, ...(aliases[sym] || [])]);
            const found = data.find((d: any) => keySet.has(String(d.symbol || '').toUpperCase()));
            return found
                ? {
                      price: Number(found.price),
                      change: Number(found.change),
                      source: String(found.source || '').trim() || undefined,
                      symbol: String(found.symbol || '').toUpperCase() || undefined,
                  }
                : null;
        };

        // Keep legacy spy/qqq keys for backward compatibility, but retain canonical index symbols.
        const spx = findIndex('SPX') || { price: 0, change: 0 };
        const ndx = findIndex('NDX') || { price: 0, change: 0 };
        const ixic = findIndex('IXIC') || { price: 0, change: 0 };
        const vix = findIndex('VIX') || { price: 0, change: 0 };

        const sourceSet = new Set(
            [spx, ndx, vix]
                .map((point: any) => String(point?.source || '').trim())
                .filter(Boolean)
        );

        const benchmarks = { 
            spy: spx,
            qqq: ndx,
            vix: vix,
            ndx,
            ixic,
            meta: {
                source: sourceSet.size === 1 ? Array.from(sourceSet)[0] : "mixed",
                fetchedAt: new Date().toISOString(),
            }
        };

        const isValidIndex = (index: { price: number; change?: number } | null | undefined) =>
          !!index && Number.isFinite(index.price) && index.price > 0;

        // Update Global Cache (valid benchmarks only to avoid 0.00 contamination)
        if (typeof window !== 'undefined') {
            if (isValidIndex(spx) && isValidIndex(ndx)) {
                (window as any).latestMarketPulse = benchmarks;
            }
        }

        return benchmarks;
    } catch (e) {
        console.error("Benchmark Fetch Error (Portal)", e);
        // Fallback to zero to prevent crash, but log error
        return { spy: { price: 0, change: 0 }, qqq: { price: 0, change: 0 }, vix: { price: 0 } };
    }
};

const AlphaAnalysis: React.FC<Props> = ({ selectedBrain, setSelectedBrain, onFinalSymbolsDetected, onStockSelected, analyzingSymbols = new Set(), autoStart, onComplete, isVisible = true }) => {
  const getAlphaRankScore = (stock: AlphaCandidate | null | undefined) => Number(stock?.finalSelectionScore || stock?.convictionScore || 0);
  const getDecisionPriority = (stock: AlphaCandidate | null | undefined) => {
      const decision = String(stock?.finalDecision || '').toUpperCase();
      if (decision === 'EXECUTABLE_NOW') return 0;
      if (decision === 'WAIT_PRICE') return 1;
      if (decision === 'BLOCKED_RISK') return 2;
      if (decision === 'BLOCKED_EVENT') return 3;
      return Number.POSITIVE_INFINITY;
  };
  const getExecutionBucketPriority = (stock: AlphaCandidate | null | undefined) =>
      stock?.executionBucket === 'EXECUTABLE' ? 0 : stock?.executionBucket === 'WATCHLIST' ? 1 : 2;
  const getExecutionRankValue = (stock: AlphaCandidate | null | undefined) => {
      const n = Number(stock?.executionRank);
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const getExecutionScoreValue = (stock: AlphaCandidate | null | undefined) => {
      const n = Number(stock?.executionScore);
      return Number.isFinite(n) ? n : Number.NEGATIVE_INFINITY;
  };
  const getModelRankValue = (stock: AlphaCandidate | null | undefined) => {
      const n = Number(stock?.modelRank);
      return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  };
  const getDecisionSignalKey = (decision?: string | null) => {
      const key = String(decision || '').toUpperCase();
      if (key === 'EXECUTABLE_NOW') return 'DECISION_EXECUTABLE_NOW';
      if (key === 'WAIT_PRICE') return 'DECISION_WAIT_PRICE';
      if (key === 'BLOCKED_RISK') return 'DECISION_BLOCKED_RISK';
      if (key === 'BLOCKED_EVENT') return 'DECISION_BLOCKED_EVENT';
      return 'WATCHLIST';
  };
  const getDecisionLabel = (decision?: string | null) => {
      const key = String(decision || '').toUpperCase();
      if (key === 'EXECUTABLE_NOW') return 'EXEC NOW';
      if (key === 'WAIT_PRICE') return 'WAIT';
      if (key === 'BLOCKED_RISK') return 'BLOCKED-RISK';
      if (key === 'BLOCKED_EVENT') return 'BLOCKED-EVENT';
      return 'N/A';
  };
  const getDecisionReasonSignalKey = (reason?: string | null) => {
      const key = String(reason || '').toLowerCase().trim();
      if (key === 'executable_pullback') return 'REASON_EXECUTABLE_PULLBACK';
      if (key === 'wait_pullback_not_reached') return 'REASON_WAIT_PULLBACK_NOT_REACHED';
      if (key === 'wait_earnings_data_missing') return 'REASON_WAIT_EARNINGS_DATA_MISSING';
      if (key === 'wait_state_verdict_conflict') return 'REASON_WAIT_STATE_VERDICT_CONFLICT';
      if (key === 'blocked_invalid_geometry') return 'REASON_BLOCKED_INVALID_GEOMETRY';
      if (key === 'blocked_missing_trade_box') return 'REASON_BLOCKED_MISSING_TRADE_BOX';
      if (key === 'blocked_quality_missing_expected_return') return 'REASON_BLOCKED_QUALITY_MISSING_ER';
      if (key === 'blocked_quality_conviction_floor') return 'REASON_BLOCKED_QUALITY_CONVICTION';
      if (key === 'blocked_quality_verdict_unusable') return 'REASON_BLOCKED_QUALITY_VERDICT';
      if (key === 'blocked_stop_too_tight') return 'REASON_BLOCKED_STOP_TOO_TIGHT';
      if (key === 'blocked_stop_too_wide') return 'REASON_BLOCKED_STOP_TOO_WIDE';
      if (key === 'blocked_target_too_close') return 'REASON_BLOCKED_TARGET_TOO_CLOSE';
      if (key === 'blocked_anchor_exec_gap') return 'REASON_BLOCKED_ANCHOR_EXEC_GAP';
      if (key === 'blocked_rr_below_min') return 'REASON_BLOCKED_RR_BELOW_MIN';
      if (key === 'blocked_ev_non_positive') return 'REASON_BLOCKED_EV_NON_POSITIVE';
      if (key === 'blocked_earnings_data_missing') return 'REASON_BLOCKED_EARNINGS_DATA_MISSING';
      if (key === 'blocked_earnings_window') return 'REASON_BLOCKED_EARNINGS_WINDOW';
      if (key === 'blocked_state_verdict_conflict') return 'REASON_BLOCKED_STATE_VERDICT_CONFLICT';
      if (key === 'blocked_verdict_risk_off') return 'REASON_BLOCKED_VERDICT_RISK_OFF';
      return 'WATCHLIST';
  };
  const getDecisionReasonLabel = (reason?: string | null) => {
      const key = String(reason || '').toLowerCase().trim();
      if (key === 'executable_pullback') return 'Pullback Confirmed';
      if (key === 'wait_pullback_not_reached') return 'Pullback Not Reached';
      if (key === 'wait_earnings_data_missing') return 'Awaiting Earnings Data';
      if (key === 'wait_state_verdict_conflict') return 'Awaiting State Conflict Review';
      if (key === 'blocked_invalid_geometry') return 'Blocked: Invalid Geometry';
      if (key === 'blocked_missing_trade_box') return 'Blocked: Missing Trade Box';
      if (key === 'blocked_quality_missing_expected_return') return 'Blocked: Missing Expected Return';
      if (key === 'blocked_quality_conviction_floor') return 'Blocked: Conviction Below Floor';
      if (key === 'blocked_quality_verdict_unusable') return 'Blocked: Verdict Not Usable';
      if (key === 'blocked_stop_too_tight') return 'Blocked: Stop Too Tight';
      if (key === 'blocked_stop_too_wide') return 'Blocked: Stop Too Wide';
      if (key === 'blocked_target_too_close') return 'Blocked: Target Too Close';
      if (key === 'blocked_anchor_exec_gap') return 'Blocked: Anchor/Exec Gap';
      if (key === 'blocked_rr_below_min') return 'Blocked: RR Below Min';
      if (key === 'blocked_ev_non_positive') return 'Blocked: Expected Value Too Low';
      if (key === 'blocked_earnings_data_missing') return 'Blocked: Missing Earnings Data';
      if (key === 'blocked_earnings_window') return 'Blocked: Earnings Window';
      if (key === 'blocked_state_verdict_conflict') return 'Blocked: State/Verdict Conflict';
      if (key === 'blocked_verdict_risk_off') return 'Blocked: Risk-Off Verdict';
      return 'n/a';
  };
  const getTradePlanStatusLabel = (status?: string | null) => {
      const key = String(status || '').trim().toUpperCase();
      if (key === 'VALID_EXEC' || key === 'VALID') return 'Valid Setup';
      if (key === 'WAIT_PULLBACK_TOO_DEEP') return 'Pullback Pending';
      if (key === 'INVALID_GEOMETRY') return 'Invalid Geometry';
      if (key === 'INVALID_DATA') return 'Data Missing';
      return key || 'N/A';
  };
  const toPositiveRank = (value: any): number | null => {
      const n = Number(value);
      if (!Number.isFinite(n)) return null;
      return n > 0 ? Math.round(n) : null;
  };
  const sortCandidatesForDisplay = (a: AlphaCandidate, b: AlphaCandidate) => {
      const decisionDelta = getDecisionPriority(a) - getDecisionPriority(b);
      if (decisionDelta !== 0) return decisionDelta;
      const bucketDelta = getExecutionBucketPriority(a) - getExecutionBucketPriority(b);
      if (bucketDelta !== 0) return bucketDelta;
      const executionRankDelta = getExecutionRankValue(a) - getExecutionRankValue(b);
      if (executionRankDelta !== 0) return executionRankDelta;
      const executionScoreDelta = getExecutionScoreValue(b) - getExecutionScoreValue(a);
      if (executionScoreDelta !== 0) return executionScoreDelta;
      const modelRankDelta = getModelRankValue(a) - getModelRankValue(b);
      if (modelRankDelta !== 0) return modelRankDelta;
      const scoreDelta = getAlphaRankScore(b) - getAlphaRankScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.symbol || '').localeCompare(String(b.symbol || ''));
  };
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
  const [scoreViewMode, setScoreViewMode] = useState<'GATED' | 'RAW'>('GATED');
  
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const stage2ProviderRef = useRef<ApiProvider>(selectedBrain);
  const stage6FinalRef = useRef<AlphaCandidate[]>([]);
  const stage6ModelTop6Ref = useRef<AlphaCandidate[]>([]);
  const stage6WatchlistTopRef = useRef<AlphaCandidate[]>([]);
  const stage6ExecutableRef = useRef<AlphaCandidate[]>([]);
  const stage6FinalRunIdRef = useRef<string>('');

  // Define derived state explicitly to avoid scope issues
  const currentResults = useMemo(
      () => [...(resultsCache[selectedBrain] || [])].sort(sortCandidatesForDisplay),
      [resultsCache, selectedBrain]
  );
  const executableResults = useMemo(
      () =>
          currentResults.filter((item) => {
              const decision = String(item?.finalDecision || '').toUpperCase();
              return decision === 'EXECUTABLE_NOW' || String(item?.executionBucket || '').toUpperCase() === 'EXECUTABLE';
          }),
      [currentResults]
  );
  const watchlistResults = useMemo(() => {
      const executableSymbols = new Set(executableResults.map((item) => String(item?.symbol || '')));
      return currentResults.filter((item) => !executableSymbols.has(String(item?.symbol || '')));
  }, [currentResults, executableResults]);
  const currentBacktest = selectedStock ? backtestData[selectedStock.symbol] : null;

  const [logs, setLogs] = useState<string[]>(['> Alpha_Sieve Engine v9.9.9: Node Ready.']);
  const [selectedMetricInfo, setSelectedMetricInfo] = useState<{ title: string; desc: string; value: string; key: string; overlayDesc: string } | null>(null);
  
  const [activeOverlay, setActiveOverlay] = useState<string | null>(null);
  const [activeAlphaInsight, setActiveAlphaInsight] = useState<string | null>(null); 
  const [selectedSignal, setSelectedSignal] = useState<{ title: string; desc: string } | null>(null);

  const [autoPhase, setAutoPhase] = useState<'IDLE' | 'ENGINE' | 'MATRIX' | 'DONE'>('IDLE');
  
  // [SAFETY] Check for Headless environment
  const isHeadless = typeof window !== 'undefined' && /HeadlessChrome/.test(window.navigator.userAgent);

  const [realtimePrices, setRealtimePrices] = useState<Record<string, { price: number, direction: 'up' | 'down' | null }>>({});

  const resolveStage6OutputSource = (): { items: AlphaCandidate[]; source: string } => {
      const finalLocked = Array.isArray(stage6FinalRef.current) ? stage6FinalRef.current : [];
      if (finalLocked.length > 0) {
          return { items: finalLocked, source: 'STAGE6_FINAL_LOCK' };
      }
      const bySelected = resultsCache[selectedBrain];
      if (Array.isArray(bySelected) && bySelected.length > 0) {
          return { items: bySelected, source: `CACHE_${selectedBrain}` };
      }
      const byGemini = resultsCache[ApiProvider.GEMINI];
      if (Array.isArray(byGemini) && byGemini.length > 0) {
          return { items: byGemini, source: 'CACHE_GEMINI' };
      }
      const bySonar = resultsCache[ApiProvider.PERPLEXITY];
      if (Array.isArray(bySonar) && bySonar.length > 0) {
          return { items: bySonar, source: 'CACHE_SONAR' };
      }
      return { items: [], source: 'EMPTY' };
  };

  const resolveTelegramBriefContext = (): TelegramBriefContractContext | undefined => {
      const modelTop6 = Array.isArray(stage6ModelTop6Ref.current) ? stage6ModelTop6Ref.current : [];
      const executablePicks = Array.isArray(stage6ExecutableRef.current) ? stage6ExecutableRef.current : [];
      const watchlistTop = Array.isArray(stage6WatchlistTopRef.current) ? stage6WatchlistTopRef.current : [];
      if (modelTop6.length === 0 && executablePicks.length === 0 && watchlistTop.length === 0) {
          return undefined;
      }
      return {
          modelTop6,
          executablePicks,
          watchlistTop
      };
  };

  useEffect(() => {
      stage2ProviderRef.current = selectedBrain;
  }, [selectedBrain]);
  const wsRef = useRef<WebSocket | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const logRef = useRef<HTMLDivElement>(null);
  const stage5SourceRef = useRef<Stage5SourceMeta | null>(null);
  const [stage5LockEnabled, setStage5LockEnabled] = useState(false);
  const [stage5LockFileId, setStage5LockFileId] = useState('');
  const [stage5LockFileName, setStage5LockFileName] = useState('');
  const [stage5LockOptions, setStage5LockOptions] = useState<Stage5LockDriveFile[]>([]);
  const [stage5LockSelectedId, setStage5LockSelectedId] = useState('');
  const [stage5LockListLoading, setStage5LockListLoading] = useState(false);

  const uniqueChartId = useMemo(() => `chart-gradient-${Math.random().toString(36).substr(2, 9)}`, []);

  // [NEW] Distribution Data Calculation Logic
  const distributionData = useMemo(() => {
    if (!selectedStock) return null;
    let mean = 10; 
    if (selectedStock.expectedReturn && typeof selectedStock.expectedReturn === 'string') {
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

  // [RESTORED] Full Quant Metrics Calculation
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
              if (selectedStock.riskRewardRatio && typeof selectedStock.riskRewardRatio === 'string') {
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
          const displacement = (selectedStock.ictMetrics?.displacement ?? 0) > 60;
          const convexity = squeeze ? (displacement ? "Explosive" : "Building") : "Standard";
          const ifs = selectedStock.ictMetrics?.smartMoneyFlow ?? 50;
          const expectancy = (P * B) - (Q * 1);
          const aic = selectedStock.aiVerdict === 'STRONG_BUY' ? 95 : selectedStock.aiVerdict === 'BUY' ? 80 : 50;

          // [NEW] Advanced Deterministic Metrics for Framework Block
          const history = Array.isArray(selectedStock.priceHistory) ? selectedStock.priceHistory : [];
          const recentBars = history.slice(-14);
          const trList: number[] = [];
          const gapList: number[] = [];
          for (let i = 1; i < recentBars.length; i++) {
              const prevClose = Number(recentBars[i - 1]?.close || 0);
              const open = Number(recentBars[i]?.open || 0);
              const high = Number(recentBars[i]?.high || 0);
              const low = Number(recentBars[i]?.low || 0);
              if (prevClose > 0 && open > 0) {
                  gapList.push(Math.abs((open - prevClose) / prevClose) * 100);
              }
              if (prevClose > 0 && high > 0 && low > 0) {
                  trList.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
              }
          }
          const lastClose = Number(recentBars[recentBars.length - 1]?.close || selectedStock.price || 0);
          const atrPct = (trList.length > 0 && lastClose > 0)
              ? (trList.reduce((a, b) => a + b, 0) / trList.length / lastClose) * 100
              : 0;
          const gapRiskPct = gapList.length > 0 ? (gapList.reduce((a, b) => a + b, 0) / gapList.length) : 0;
          const liquidityState = String(selectedStock.techMetrics?.dataQualityState || 'NORMAL').toUpperCase();
          const rawRvol = Number(selectedStock.techMetrics?.rawRvol || 1);
          const eventRiskState = String(selectedStock.techMetrics?.eventRiskState || 'LOW').toUpperCase();
          const daysToEarnings = Number(selectedStock.techMetrics?.daysToEarnings ?? -1);
          const vixClose = Number(selectedStock.techMetrics?.vixClose || 0);
          const vixDistance = Number.isFinite(vixClose) ? (vixClose - STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL) : 0;
          const rsAlpha = Number(selectedStock.spyAlpha || 0);
          const signalComboBonus = Number(selectedStock.techMetrics?.signalComboBonus || 0);
          const signalHeatPenalty = Number(selectedStock.techMetrics?.signalHeatPenalty || 0);
          const signalStability = Math.max(0, Math.min(100, 50 + (signalComboBonus * 8) - (signalHeatPenalty * 10)));
          const stageConsensus =
              (selectedStock.fundamentalScore >= 70 ? 1 : 0) +
              (selectedStock.technicalScore >= 70 ? 1 : 0) +
              (selectedStock.ictScore >= 70 ? 1 : 0);
          const integrityScore = Number(selectedStock.integrityScore || selectedStock.dataConfidence || 75);
          const top6 = (currentResults || []).slice(0, 6);
          const top6Count = Math.max(1, top6.length);
          const sameSector = top6.filter((x: any) => (x?.sectorTheme || x?.sector) === (selectedStock.sectorTheme || selectedStock.sector)).length;
          const sectorConcentration = (sameSector / top6Count) * 100;

          let executionFactor = 1;
          if (liquidityState === 'THIN') executionFactor *= 0.92;
          if (liquidityState === 'ILLIQUID') executionFactor *= 0.82;
          if (liquidityState === 'STALE') executionFactor *= 0.75;
          if (rawRvol < 0.8) executionFactor *= 0.90;
          else if (rawRvol < 1.0) executionFactor *= 0.95;
          if (atrPct >= 6) executionFactor *= 0.85;
          else if (atrPct >= 4) executionFactor *= 0.92;
          if (gapRiskPct >= 3) executionFactor *= 0.85;
          else if (gapRiskPct >= 2) executionFactor *= 0.92;
          if (eventRiskState === 'HIGH') executionFactor *= 0.88;
          else if (eventRiskState === 'MEDIUM') executionFactor *= 0.94;
          executionFactor = Math.max(0.55, Math.min(1, executionFactor));

          const driverCandidates = [
              {
                  id: 'EDGE_EXEC',
                  label: 'Execution',
                  value: `${executionFactor.toFixed(2)}x`,
                  score: Math.abs(1 - executionFactor) * 130
              },
              {
                  id: 'RISK_ATR',
                  label: 'ATR Risk',
                  value: `${atrPct.toFixed(2)}%`,
                  score: atrPct * 8
              },
              {
                  id: 'RISK_GAP',
                  label: 'Gap Risk',
                  value: `${gapRiskPct.toFixed(2)}%`,
                  score: gapRiskPct * 11
              },
              {
                  id: 'REGIME_VIX',
                  label: 'VIX Regime',
                  value: `${vixDistance.toFixed(2)}`,
                  score: Math.abs(vixDistance) * 9
              },
              {
                  id: 'REGIME_RS',
                  label: 'RS Alpha',
                  value: `${rsAlpha.toFixed(2)}`,
                  score: Math.abs(rsAlpha) * 35
              },
              {
                  id: 'ROBUST_CONSENSUS',
                  label: 'Stage Consensus',
                  value: `${stageConsensus}/3`,
                  score: Math.abs(stageConsensus - 2) * 25
              },
              {
                  id: 'INTEGRITY_SCORE',
                  label: 'Integrity',
                  value: `${integrityScore.toFixed(1)}`,
                  score: Math.abs(85 - integrityScore) * 1.2
              },
              {
                  id: 'CONCENTRATION_SCORE',
                  label: 'Sector Conc.',
                  value: `${sectorConcentration.toFixed(1)}%`,
                  score: Math.max(0, sectorConcentration - 33) * 2
              }
          ]
              .sort((a, b) => b.score - a.score)
              .slice(0, 3);

          return {
              sizing: {
                  kelly: halfKelly.toFixed(1),
                  vapsQty: vapsQty,
                  vapsPct: vapsAllocation.toFixed(1),
                  riskPerShare: riskPerShare.toFixed(2),
                  riskReward: B.toFixed(2)
              },
              selection: {
                  erci: erci.toFixed(2),
                  qm: qmScore.toFixed(2),
                  ivg: ivg.toFixed(2),
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
              advanced: {
                  edge: {
                      executionFactor: Number(executionFactor.toFixed(2)),
                      stageConsensus: `${stageConsensus}/3`,
                      rrRatio: Number(B.toFixed(2))
                  },
                  risk: {
                      atrPct: Number(atrPct.toFixed(2)),
                      gapRiskPct: Number(gapRiskPct.toFixed(2)),
                      liquidityState
                  },
                  regime: {
                      vixDistance: Number(vixDistance.toFixed(2)),
                      rsAlpha: Number(rsAlpha.toFixed(2)),
                      earningsD: Number.isFinite(daysToEarnings) && daysToEarnings >= 0 ? daysToEarnings : null
                  },
                  integrity: {
                      signalStability: Number(signalStability.toFixed(1)),
                      integrityScore: Number(integrityScore.toFixed(1)),
                      sectorConcentration: Number(sectorConcentration.toFixed(1))
                  },
                  drivers: driverCandidates
              },
              radarData: [
                  { subject: 'Conviction', A: Math.round(conviction), fullMark: 100 },
                  { subject: 'Sentiment', A: Math.round((selectedStock.newsScore || 0.5) * 100), fullMark: 100 },
                  { subject: 'Technical', A: Math.round(selectedStock.technicalScore || 50), fullMark: 100 },
                  { subject: 'Fundamental', A: Math.round(selectedStock.fundamentalScore || 50), fullMark: 100 },
                  { subject: 'ICT', A: Math.round(selectedStock.ictScore || 50), fullMark: 100 }
              ]
          };
      } catch (e) {
          console.error("Quant Metrics Error", e);
          return null;
      }
  }, [selectedStock, backtestData, currentResults]);

  const topDriverIdSet = useMemo(() => {
      const ids = (quantMetrics as any)?.advanced?.drivers?.map((d: any) => d?.id).filter(Boolean) || [];
      return new Set<string>(ids);
  }, [quantMetrics]);

  // [WS UPDATED LOGIC] Use currentResults directly to ensure tracking of displayed list
  useEffect(() => {
      // Use the currently displayed list, regardless of which brain it came from
      const symbolsToTrack = currentResults.map(s => s.symbol);

      if (activeTab === 'INDIVIDUAL' && symbolsToTrack.length > 0 && finnhubKey && !isHeadless) {
          if (wsRef.current) {
              wsRef.current.close();
              wsRef.current = null;
          }
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
              } catch (err) { }
          };
          ws.onerror = (err) => { };
          return () => { if (wsRef.current) wsRef.current.close(); };
      }
  }, [activeTab, currentResults, finnhubKey]); 

  // ... (Other effects) ...
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (currentResults.length > 0) {
      if (!selectedStock || !currentResults.find(c => c.symbol === selectedStock.symbol)) {
        const initialStock = currentResults[0];
        setSelectedStock(initialStock);
        onStockSelected?.(initialStock);
      }
    } else {
      setSelectedStock(null);
      onStockSelected?.(null);
    }
  }, [selectedBrain, currentResults, selectedStock, onStockSelected]);

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
      // Logic for moving from ENGINE -> MATRIX
      const hasResults = resultsCache[selectedBrain]?.length || resultsCache[ApiProvider.GEMINI]?.length || resultsCache[ApiProvider.PERPLEXITY]?.length;
      
      if (autoStart && autoPhase === 'ENGINE' && !loading && hasResults) {
          addLog("AUTO-PILOT: Skipping Deep Matrix Audit (Token Saver)...", "signal");
          setActiveTab('MATRIX');
          setAutoPhase('MATRIX');
      }
  }, [autoStart, autoPhase, loading, resultsCache, selectedBrain]);

  useEffect(() => {
      const finishAutoPilot = async () => {
          // Always lock Telegram payload to the latest finalized Stage6 Top6 first.
          const { items: resultsToCheck, source: sourceTag } = resolveStage6OutputSource();
          
          if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && resultsToCheck.length > 0) {
              addLog("AUTO-PILOT: Generating Hedge Fund Brief for Telegram...", "signal");
              addLog(
                  `[AUDIT_SYNC] Telegram source locked: ${sourceTag} (${resultsToCheck.length})${stage6FinalRunIdRef.current ? ` run=${stage6FinalRunIdRef.current}` : ''}`,
                  "info"
              );
              
              let telegramPayload = ""; 
              
              // [DEBUG FIX] Wrap Telegram generation in a race to prevent infinite hanging
              const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Telegram Brief Timeout")), 15000));
              
              try {
                  // Use the actual Stage2 provider whenever available to keep manual/autopilot consistent.
                  const brainToUse = stage2ProviderRef.current || selectedBrain;
                  
                  // [HYDRATION] Explicitly pass market pulse data
                  const marketPulse = (window as any).latestMarketPulse;
                  const telegramContext = resolveTelegramBriefContext();
                  const briefPromise = generateTelegramBrief(resultsToCheck, brainToUse, marketPulse, telegramContext);
                  const brief = await Promise.race([briefPromise, timeout]) as string;

                  const contractCheck = checkTelegramContractIntegrity(resultsToCheck, brief);
                  if (!contractCheck.ok) {
                      addLog(
                          `TELEGRAM_CONTRACT_MISMATCH: ${contractCheck.mismatches[0] || 'unknown mismatch'}`,
                          "err"
                      );
                      contractCheck.mismatches.slice(1, 4).forEach((m) => addLog(`[CONTRACT_DIFF] ${m}`, "warn"));
                      await archiveTelegramIntegrityFailure(
                          'AUTO',
                          resultsToCheck,
                          brief,
                          contractCheck,
                          `TELEGRAM_CONTRACT_MISMATCH (${contractCheck.mismatches.length})`
                      );
                      throw new Error(`INTEGRITY_GATE_BLOCKED:${contractCheck.mismatches.length}`);
                  }
                  
                  telegramPayload = brief;
                  addLog("Brief Generated. Relaying...", "ok");

                  // [FIXED] Dump Telegram Brief to Google Drive (Report Folder)
                  const token = sessionStorage.getItem('gdrive_access_token');
                  if (token) {
                    const getKstTimestamp = () => {
                        const now = new Date();
                        const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
                        return kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
                    }
                    const timestamp = getKstTimestamp();
                    const fileName = `TELEGRAM_BRIEF_REPORT_${timestamp}.md`;
                    const archivedBrief = buildTelegramMessage(brief);
                    // [FIXED] Fire-and-Forget Archive to prevent timeout
                    archiveReport(token, fileName, archivedBrief)
                        .then(() => addLog("Telegram Brief Archived to Drive.", "ok"))
                        .catch(e => addLog(`Archive Failed: ${e.message}`, "warn"));
                  }

              } catch (e: any) {
                  if (String(e?.message || '').startsWith('INTEGRITY_GATE_BLOCKED:')) {
                      addLog("Telegram Integrity Gate blocked AUTO transmission.", "err");
                      setAutoPhase('DONE');
                      if (onComplete) onComplete(toAutoControlPayload("INTEGRITY_GATE_BLOCKED"));
                      return;
                  }
                  addLog(`Brief Gen Failed: ${e.message}. AUTO telegram aborted.`, "err");
                  setAutoPhase('DONE');
                  if (onComplete) onComplete(toAutoControlPayload("BRIEF_GENERATION_FAILED"));
                  return;
              }

              setAutoPhase('DONE');
              if (onComplete) onComplete(telegramPayload);
          } else if (autoStart && autoPhase === 'MATRIX' && !matrixLoading && resultsToCheck.length === 0) {
               // Safety catch: if no results found but we are in MATRIX phase, abort
               addLog("AUTO-PILOT: No Alpha Candidates found. Aborting.", "err");
               setAutoPhase('DONE');
               if (onComplete) onComplete(toAutoControlPayload("NO_CANDIDATES"));
          }
      };
      
      finishAutoPilot();
  }, [autoStart, autoPhase, matrixLoading, selectedBrain, resultsCache]);


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

  const handleSignalClick = (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      if (SIGNAL_DEFINITIONS[key]) {
          setSelectedSignal(SIGNAL_DEFINITIONS[key]);
      }
  };

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-60));
  };

  const cleanInsightText = (text: any) => {
    if (!text) return "";
    let str = String(text);
    // [FIX] Replace literal "\n" with actual newline character for Markdown processing
    str = str.replace(/\\n/g, '\n').replace(/\r/g, '');
    
    // [CLEANUP] Remove surrounding quotes if any
    str = str.replace(/^["']|["']$/g, '');
    
    // [HARD FIX] Remove specific conversational prefixes
    str = str.replace(/이 종목에 대해.*?토론을 벌입니다.*?(?=\n)/g, '');
    str = str.replace(/8인의 전설적 투자자가.*?요약하십시오.*?(?=\n)/g, '');
    str = str.replace(/각 거장의 관점에서.*?요약하십시오.*?(?=\n)/g, '');
    
    str = str
      .replace(/[\u{1F600}-\u{1F64F}]/gu, "") 
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, "") 
      .replace(/[🚀📈📉📊💰💎🔥✨⚡️🎯🛑✅❌⚠️💀🚨🛑🟢🔴🔵🟣🔸🔹🔶🔷🔳🔳🔲👍👎👉👈]/g, "") 
      .replace(/\[\d+\]/g, '');
      
    // Fix headers
    str = str.replace(/([^\n])\s*(#{1,3})/g, '$1\n$2'); 
    str = str.replace(/([^\n])\s*-\s/g, '$1\n- ');
    
    const personas = ['보수적 퀀트', '공격적 트레이더', '마켓 메이커', 'Conservative Quant', 'Aggressive Trader', 'Market Maker', '종합 분석', 'Comprehensive Analysis'];
    personas.forEach(p => {
         const regex = new RegExp(`(?:^|\\n)[-*]?\\s*${p}\\s*:?`, 'g');
         str = str.replace(regex, `\n- **${p}** :`);
    });
    
    str = str.replace(/^\s*-\s*$/gm, ''); 
    str = str.replace(/- -/g, '-');
    return str.trim();
  };

  // [FORMATTER] Dedicated cleanup for Portfolio Matrix report readability.
  // Keeps markdown emphasis(**...**) intact so existing green badge styling is preserved.
  const cleanMatrixInsightText = (text: any) => {
    if (!text) return "";
    let str = cleanInsightText(text);

    str = str
      // Remove decorative divider-only lines (--- / -- / ——)
      .replace(/^\s*[-—–]{2,}\s*$/gm, '')
      // Normalize section title lines like "— 1. Title" -> markdown heading
      .replace(/^\s*[—–-]\s*(\d+\.\s*.+)$/gm, '## $1')
      // Normalize arrow-prefixed lines to proper markdown bullets
      .replace(/^\s*[→➜⇒]\s*/gm, '- ')
      // Ensure spacing before headings for better scanability
      .replace(/([^\n])\n(#{1,3}\s)/g, '$1\n\n$2')
      // Collapse excessive empty lines
      .replace(/\n{3,}/g, '\n\n')
      .trim();

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

  const normalizeExpectedReturnLabel = (raw?: any) => {
      if (raw === null || raw === undefined) return '';
      const src = String(raw).trim();
      if (!src) return '';

      const pctMatch = src.match(/([+-]?\d+(\.\d+)?)\s*%/);
      if (!pctMatch) return src;

      const percent = `${pctMatch[1]}%`;
      const tagMatch = src.match(/\(([^)]+)\)/);
      if (!tagMatch) return percent;

      const tagRaw = String(tagMatch[1]).trim();
      if (!tagRaw) return percent;

      const koToEnMap: Record<string, string> = {
          '단기': 'Short-Term',
          '중기': 'Mid-Term',
          '장기': 'Long-Term',
          '관망': 'Watch',
          '매수': 'Buy',
          '매도': 'Reduce',
          '보유': 'Hold'
      };
      const normalizedTag = koToEnMap[tagRaw] || tagRaw;
      return `${percent} (${normalizedTag})`;
  };

  const toVerdictKey = (v?: any) =>
      String(v ?? '').replace(/[^a-zA-Z0-9_가-힣]/g, '').toUpperCase().trim();

  const isRiskOffVerdict = (v?: any) => {
      const key = toVerdictKey(v);
      return (
          key.includes('STRONGSELL') ||
          key.includes('SELL') ||
          key.includes('EXIT') ||
          key.includes('REDUCE') ||
          key.includes('PARTIAL_EXIT') ||
          key.includes('PARTIALEXIT') ||
          key.includes('매도') ||
          key.includes('청산') ||
          key.includes('비중축소')
      );
  };

  const isStrongBuyVerdict = (v?: any) => {
      const key = toVerdictKey(v);
      return (
          key.includes('STRONGBUY') ||
          key.includes('STRONG_BUY') ||
          key.includes('강력매수')
      );
  };

  const normalizeExpectedReturnByVerdict = (rawExpected: any, verdict?: any) => {
      const normalized = normalizeExpectedReturnLabel(rawExpected);
      if (!normalized) return '';
      if (!isRiskOffVerdict(verdict)) return normalized;

      const pctMatch = normalized.match(/([+-]?\d+(\.\d+)?)\s*%/);
      if (!pctMatch) return '0% (Risk-Managed)';
      const pct = Math.max(0, Number(pctMatch[1]));
      const clipped = Math.min(pct, 15);
      return `+${Math.round(clipped)}% (Risk-Managed)`;
  };

  const normalizeContractSymbol = (raw: any) =>
      String(raw || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();

  const parseContractNumber = (raw: any): number | null => {
      if (raw === null || raw === undefined) return null;
      const n = Number(String(raw).replace(/,/g, '').trim());
      return Number.isFinite(n) ? n : null;
  };

  const parseExpectedReturnPct = (raw: any): number | null => {
      const src = String(raw || '');
      const m = src.match(/([+-]?\d+(\.\d+)?)\s*%/);
      if (!m) return null;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : null;
  };

  const TELEGRAM_INDEX_SYMBOLS = new Set(['SPY', 'QQQ', 'VIX', 'SPX', 'NDX', 'SP500', 'NASDAQ', 'NASDAQ100', 'IXIC']);

  const isExecutableForTelegramContract = (item: AlphaCandidate): boolean => {
      const bucket = String(item?.executionBucket || '').trim().toUpperCase();
      if (bucket === 'EXECUTABLE') return true;
      if (bucket === 'WATCHLIST') return false;

      const reason = String(item?.executionReason || item?.tradePlanStatusShadow || '').trim().toUpperCase();
      if (reason) return reason === 'VALID_EXEC';

      const verdictKey = String(item?.verdictFinal || item?.finalVerdict || item?.aiVerdict || item?.verdict || '')
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '_')
          .replace(/-/g, '_');
      if (verdictKey === 'WAIT' || verdictKey === 'HOLD') return false;

      const feasible = item?.entryFeasible ?? item?.entryFeasibleShadow;
      if (typeof feasible === 'boolean') return feasible;
      return true;
  };

  const pickTelegramContractCandidates = (items: AlphaCandidate[]): AlphaCandidate[] => {
      const nonIndex = items.filter((item) => !TELEGRAM_INDEX_SYMBOLS.has(normalizeContractSymbol(item?.symbol)));
      const sorted = [...nonIndex]
          .filter(isExecutableForTelegramContract)
          .sort((a, b) => {
              const execRankA = parseContractNumber(a?.executionRank);
              const execRankB = parseContractNumber(b?.executionRank);
              if (execRankA !== null || execRankB !== null) {
                  if (execRankA === null) return 1;
                  if (execRankB === null) return -1;
                  if (execRankA !== execRankB) return execRankA - execRankB;
              }
              const execScoreA = parseContractNumber(a?.executionScore);
              const execScoreB = parseContractNumber(b?.executionScore);
              if (execScoreA !== null || execScoreB !== null) {
                  if (execScoreA === null) return 1;
                  if (execScoreB === null) return -1;
                  if (execScoreA !== execScoreB) return execScoreB - execScoreA;
              }
              const modelA = parseContractNumber(a?.modelRank);
              const modelB = parseContractNumber(b?.modelRank);
              if (modelA !== null || modelB !== null) {
                  if (modelA === null) return 1;
                  if (modelB === null) return -1;
                  if (modelA !== modelB) return modelA - modelB;
              }
              const convA = parseContractNumber(a?.convictionScore ?? a?.compositeAlpha) ?? 0;
              const convB = parseContractNumber(b?.convictionScore ?? b?.compositeAlpha) ?? 0;
              return convB - convA;
          });
      return sorted.slice(0, 6);
  };

  const buildTelegramContractExpected = (items: AlphaCandidate[]): TelegramContractItem[] =>
      pickTelegramContractCandidates(items).map((item) => ({
          symbol: normalizeContractSymbol(item?.symbol),
          entry: parseContractNumber(
              item?.entryExecPrice ?? item?.entryExecPriceShadow ?? item?.entryPrice ?? item?.otePrice ?? item?.supportLevel
          ),
          target: parseContractNumber(item?.targetPrice ?? item?.targetMeanPrice ?? item?.resistanceLevel),
          stop: parseContractNumber(item?.stopLoss ?? item?.ictStopLoss),
          expectedReturnPct: parseExpectedReturnPct(
              item?.gatedExpectedReturn ?? item?.expectedReturn ?? item?.rawExpectedReturn
          )
      }));

  const extractTelegramContractActual = (brief: string): TelegramContractItem[] => {
      const lines = String(brief || '').split(/\r?\n/);
      const items: TelegramContractItem[] = [];
      let current: TelegramContractItem | null = null;

      for (const line of lines) {
          const header = line.match(/^\s*(\d+)\.\s*([A-Za-z0-9.\-]+)\s*\(/);
          if (header) {
              if (current) items.push(current);
              current = {
                  symbol: normalizeContractSymbol(header[2]),
                  entry: null,
                  target: null,
                  stop: null,
                  expectedReturnPct: null
              };
              continue;
          }
          if (!current) continue;

          // Backward + forward compatible plan parser:
          // - Legacy: "진입 $X | 목표 $Y | 손절 $Z"
          // - New:    "진입(실행) $X | 진입(앵커) $A | 목표 $Y | 손절 $Z"
          const entryExec =
              line.match(/진입\s*\(실행\)\s*\$?\s*([0-9,]+(?:\.\d+)?)/i) ||
              line.match(/entry\s*\(exec(?:ution)?\)\s*[:=]?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);
          const entryLegacy =
              line.match(/진입\s*\$?\s*([0-9,]+(?:\.\d+)?)/i) ||
              line.match(/entry\s*[:=]?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);
          const targetMatch =
              line.match(/목표\s*\$?\s*([0-9,]+(?:\.\d+)?)/i) ||
              line.match(/target\s*[:=]?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);
          const stopMatch =
              line.match(/손절\s*\$?\s*([0-9,]+(?:\.\d+)?)/i) ||
              line.match(/stop\s*[:=]?\s*\$?\s*([0-9,]+(?:\.\d+)?)/i);

          if (entryExec?.[1]) {
              current.entry = parseContractNumber(entryExec[1]);
          } else if (current.entry == null && entryLegacy?.[1]) {
              current.entry = parseContractNumber(entryLegacy[1]);
          }
          if (targetMatch?.[1]) {
              current.target = parseContractNumber(targetMatch[1]);
          }
          if (stopMatch?.[1]) {
              current.stop = parseContractNumber(stopMatch[1]);
          }

          const er = line.match(/Exp\.?\s*Return[^0-9+-]*([+-]?\d+(\.\d+)?)\s*%/i);
          if (er) {
              current.expectedReturnPct = parseContractNumber(er[1]);
          }
      }

      if (current) items.push(current);
      return items.slice(0, 6);
  };

  const checkTelegramContractIntegrity = (
      sourceItems: AlphaCandidate[],
      brief: string
  ): TelegramContractCheckResult => {
      const expected = buildTelegramContractExpected(sourceItems);
      const actual = extractTelegramContractActual(brief);
      const mismatches: string[] = [];
      const priceTolerance = 0.05;
      const returnTolerance = 1;

      if (expected.length !== actual.length) {
          mismatches.push(`COUNT expected=${expected.length} actual=${actual.length}`);
      }

      const compareNumeric = (
          label: string,
          idx: number,
          exp: number | null,
          act: number | null,
          tolerance: number
      ) => {
          if (exp === null && act === null) return;
          if (exp === null || act === null) {
              mismatches.push(`#${idx + 1} ${label} missing exp=${exp ?? 'null'} act=${act ?? 'null'}`);
              return;
          }
          if (Math.abs(exp - act) > tolerance) {
              mismatches.push(`#${idx + 1} ${label} exp=${exp.toFixed(2)} act=${act.toFixed(2)}`);
          }
      };

      const count = Math.min(expected.length, actual.length);
      for (let i = 0; i < count; i++) {
          if (expected[i].symbol !== actual[i].symbol) {
              mismatches.push(`#${i + 1} SYMBOL exp=${expected[i].symbol} act=${actual[i].symbol}`);
              continue;
          }
          compareNumeric('ENTRY', i, expected[i].entry, actual[i].entry, priceTolerance);
          compareNumeric('TARGET', i, expected[i].target, actual[i].target, priceTolerance);
          compareNumeric('STOP', i, expected[i].stop, actual[i].stop, priceTolerance);
          compareNumeric('ER%', i, expected[i].expectedReturnPct, actual[i].expectedReturnPct, returnTolerance);
      }

      return {
          ok: mismatches.length === 0,
          mismatches,
          expected,
          actual
      };
  };

  const archiveTelegramIntegrityFailure = async (
      stage: 'AUTO' | 'MANUAL',
      sourceItems: AlphaCandidate[],
      brief: string,
      contractCheck: TelegramContractCheckResult,
      errorMessage?: string
  ) => {
      if (!accessToken) return;
      try {
          const payload = {
              stage,
              runId: stage6FinalRunIdRef.current || null,
              generatedAt: new Date().toISOString(),
              error: errorMessage || null,
              sourceTop6: sourceItems.slice(0, 6).map((item) => ({
                  symbol: item?.symbol || 'N/A',
                  entry: item?.entryPrice ?? item?.otePrice ?? item?.supportLevel ?? null,
                  target: item?.targetPrice ?? item?.targetMeanPrice ?? item?.resistanceLevel ?? null,
                  stop: item?.stopLoss ?? item?.ictStopLoss ?? null,
                  expectedReturn:
                      item?.gatedExpectedReturn ?? item?.expectedReturn ?? item?.rawExpectedReturn ?? null
              })),
              mismatches: contractCheck.mismatches,
              expected: contractCheck.expected,
              actual: contractCheck.actual,
              briefPreview: String(brief || '').slice(0, 6000)
          };
          const fileName = `TELEGRAM_INTEGRITY_FAIL_${getKstTimestamp()}.md`;
          const content = `# TELEGRAM INTEGRITY FAILURE SNAPSHOT\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
          const saved = await archiveReport(accessToken, fileName, content);
          if (saved) addLog(`Integrity Fail Snapshot archived: ${fileName}`, "warn");
      } catch (e: any) {
          addLog(`Integrity Fail Snapshot archive error: ${e?.message || 'unknown'}`, "warn");
      }
  };

  const getDisplayConvictionScore = (item: any, mode: 'GATED' | 'RAW') => {
      const raw = Number(item?.rawConvictionScore ?? item?.convictionScore ?? 50);
      const gated = Number(item?.convictionScore ?? raw);
      return mode === 'RAW' ? raw : gated;
  };

  const getDisplayExpectedReturn = (item: any, mode: 'GATED' | 'RAW') => {
      if (mode === 'RAW') return item?.rawExpectedReturn || item?.expectedReturn || 'TBD';
      return item?.gatedExpectedReturn || item?.expectedReturn || 'TBD';
  };

  const normalizeTop6SelectionReasons = (item: any): string[] => {
      const cleaned = (Array.isArray(item?.selectionReasons) ? item.selectionReasons : [])
          .map((r: any) => cleanMarkdown(String(r || '').trim()))
          .filter(Boolean);

      const deterministic = [
          `Fund/Tech/ICT ${Math.round(Number(item?.fundamentalScore || 0))}/${Math.round(Number(item?.technicalScore || 0))}/${Math.round(Number(item?.ictScore || 0))}`,
          `Gate ${item?.finalGateState || 'OPEN'} (B${Number(item?.finalGateBonus || 0)}/P${Number(item?.finalGatePenalty || 0)})`,
          `AI ${String(item?.aiVerdict || 'N/A')}`
      ];

      const merged = Array.from(new Set([...cleaned, ...deterministic]));
      return merged.slice(0, 3);
  };

  const deriveQuantExpectedReturn = (item: any) => {
      const entry = Number(item?.otePrice || item?.supportLevel || item?.price || 0);
      const stop = Number(item?.ictStopLoss || item?.stopLoss || 0);
      const targetRaw = Number(item?.resistanceLevel || item?.targetPrice || item?.targetMeanPrice || 0);

      let target = targetRaw;
      // If target is missing, estimate a conservative 2R target from ICT risk box.
      if (!(target > entry) && entry > 0 && stop > 0 && entry > stop) {
          target = entry + ((entry - stop) * 2);
      }

      if (!(entry > 0) || !(target > entry)) return '';
      const pct = ((target - entry) / entry) * 100;
      if (!(pct > 0)) return '';

      const tag = pct >= 35 ? 'High Conviction' : pct >= 20 ? 'Mid-Term' : 'Short-Term';
      return `+${Math.round(pct)}% (${tag})`;
  };

  const getExecutionFactorForItem = (item: any) => {
      const history = Array.isArray(item?.priceHistory) ? item.priceHistory : [];
      const recentBars = history.slice(-14);
      const trList: number[] = [];
      const gapList: number[] = [];
      for (let i = 1; i < recentBars.length; i++) {
          const prevClose = Number(recentBars[i - 1]?.close || 0);
          const open = Number(recentBars[i]?.open || 0);
          const high = Number(recentBars[i]?.high || 0);
          const low = Number(recentBars[i]?.low || 0);
          if (prevClose > 0 && open > 0) {
              gapList.push(Math.abs((open - prevClose) / prevClose) * 100);
          }
          if (prevClose > 0 && high > 0 && low > 0) {
              trList.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
          }
      }
      const lastClose = Number(recentBars[recentBars.length - 1]?.close || item?.price || 0);
      const atrPct = (trList.length > 0 && lastClose > 0)
          ? (trList.reduce((a, b) => a + b, 0) / trList.length / lastClose) * 100
          : 0;
      const gapRiskPct = gapList.length > 0 ? (gapList.reduce((a, b) => a + b, 0) / gapList.length) : 0;
      const liquidityState = String(item?.techMetrics?.dataQualityState || 'NORMAL').toUpperCase();
      const rawRvol = Number(item?.techMetrics?.rawRvol || 1);
      const eventRiskState = String(item?.techMetrics?.eventRiskState || 'LOW').toUpperCase();

      let executionFactor = 1;
      if (liquidityState === 'THIN') executionFactor *= 0.92;
      if (liquidityState === 'ILLIQUID') executionFactor *= 0.82;
      if (liquidityState === 'STALE') executionFactor *= 0.75;
      if (rawRvol < 0.8) executionFactor *= 0.90;
      else if (rawRvol < 1.0) executionFactor *= 0.95;
      if (atrPct >= 6) executionFactor *= 0.85;
      else if (atrPct >= 4) executionFactor *= 0.92;
      if (gapRiskPct >= 3) executionFactor *= 0.85;
      else if (gapRiskPct >= 2) executionFactor *= 0.92;
      if (eventRiskState === 'HIGH') executionFactor *= 0.88;
      else if (eventRiskState === 'MEDIUM') executionFactor *= 0.94;
      return Math.max(0.55, Math.min(1, executionFactor));
  };

  const applyExecutionFactorToExpectedReturn = (expectedReturnLabel: any, executionFactor: number) => {
      const normalized = normalizeExpectedReturnLabel(expectedReturnLabel);
      if (!normalized) return '';

      const pctMatch = normalized.match(/([+-]?\d+(\.\d+)?)\s*%/);
      if (!pctMatch) return normalized;

      const rawPct = Math.max(0, Number(pctMatch[1]));
      const safeFactor = Math.max(0.55, Math.min(1, Number(executionFactor) || 1));
      const adjustedPct = Math.max(0, rawPct * safeFactor);
      const tag = adjustedPct >= 35 ? 'High Conviction' : adjustedPct >= 20 ? 'Mid-Term' : 'Short-Term';
      return `+${Math.round(adjustedPct)}% (${tag})`;
  };

  const toFinitePositive = (...vals: any[]) => {
      for (const v of vals) {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) return n;
      }
      return 0;
  };

  const formatExpectedReturnFromGeometry = (entry: number, target: number) => {
      if (!(entry > 0) || !(target > entry)) return '0% (No Edge)';
      const pct = ((target - entry) / entry) * 100;
      if (!(pct > 0)) return '0% (No Edge)';
      const tag = pct >= 35 ? 'High Conviction' : pct >= 20 ? 'Mid-Term' : 'Short-Term';
      return `+${Math.round(pct)}% (${tag})`;
  };

  const isAnchorExecEquivalent = (entryExec: number, entryAnchor: number) => {
      if (!(entryExec > 0) || !(entryAnchor > 0)) return false;
      const gapPct = Math.abs(entryExec - entryAnchor) / entryExec;
      return gapPct <= 0.002; // <= 0.2%
  };

  const buildPlanTrajectoryText = (entryExec: number, entryAnchor: number, target: number, stop: number) => {
      const entryPart = isAnchorExecEquivalent(entryExec, entryAnchor)
          ? `진입 $${entryExec.toFixed(1)} (앵커=실행)`
          : `진입(실행) $${entryExec.toFixed(1)} / 진입(앵커) $${entryAnchor.toFixed(1)}`;
      return `${entryPart} / 목표 $${target.toFixed(1)} / 손절 $${stop.toFixed(1)}`;
  };

  const buildCanonicalTradePlan = (item: any) => {
      // [QUANT LOCK] Stage 5 quant trade-box is authoritative in Stage 6.
      // AI must not overwrite entry/target/stop geometry.
      const entry = toFinitePositive(item?.otePrice, item?.supportLevel, item?.price);
      const stop = toFinitePositive(item?.ictStopLoss, item?.stopLoss);
      const rawTarget = toFinitePositive(item?.resistanceLevel, item?.targetPrice, item?.targetMeanPrice);

      const hasValidRiskBox = entry > 0 && stop > 0 && stop < entry;
      const hasValidRawTarget = rawTarget > entry;

      if (hasValidRiskBox && hasValidRawTarget) {
          return {
              entry,
              stop,
              target: rawTarget,
              source: 'RAW' as const,
              status: 'VALID' as const,
              expectedReturnLabel: formatExpectedReturnFromGeometry(entry, rawTarget)
          };
      }

      return {
          entry,
          stop,
          target: rawTarget > 0 ? rawTarget : entry,
          source: 'INVALID' as const,
          status: 'INVALID' as const,
          expectedReturnLabel: '0% (No Edge)'
      };
  };

  const enforceOutlookTradeBoxConsistency = (outlook: string, item: any) => {
      const text = String(outlook || '').trim();
      if (!text) return text;
      const entryExec = Number(item?.entryExecPrice || item?.entryExecPriceShadow || item?.entryPrice || item?.otePrice || item?.supportLevel || 0);
      const entryAnchor = Number(item?.entryAnchorPrice || item?.otePrice || item?.supportLevel || entryExec || 0);
      const target = Number(item?.resistanceLevel || item?.targetPrice || 0);
      const stop = Number(item?.ictStopLoss || item?.stopLoss || 0);
      if (!(entryExec > 0) || !(target > 0) || !(stop > 0)) return text;

      const entryDistancePctRaw = Number(item?.entryDistancePct ?? item?.entryDistancePctShadow);
      const entryDistancePct = Number.isFinite(entryDistancePctRaw) ? entryDistancePctRaw : null;
      const entryFeasibleRaw = item?.entryFeasible;
      const entryFeasibleShadowRaw = item?.entryFeasibleShadow;
      const entryFeasible =
          typeof entryFeasibleRaw === 'boolean'
              ? entryFeasibleRaw
              : (typeof entryFeasibleShadowRaw === 'boolean' ? entryFeasibleShadowRaw : null);
      const tradePlanStatus = String(item?.tradePlanStatus || item?.tradePlanStatusShadow || 'N/A');

      const trajectoryLine = `- **가격 목표 (Trajectory)** : ${buildPlanTrajectoryText(entryExec, entryAnchor, target, stop)}`;
      const executionLine = `- **실행 가능성 (Execution)** : feasible=${entryFeasible === null ? 'N/A' : String(entryFeasible)} | status=${tradePlanStatus} | distance=${entryDistancePct === null ? 'N/A' : `${entryDistancePct.toFixed(2)}%`}`;
      const hasTrajectoryLine = /- \*\*가격 목표\s*\(Trajectory\)\*\*\s*:.*/m.test(text);
      let nextText = text;
      if (hasTrajectoryLine) {
          nextText = nextText.replace(/- \*\*가격 목표\s*\(Trajectory\)\*\*\s*:.*/m, trajectoryLine);
      } else {
          nextText = `${nextText}\n${trajectoryLine}`;
      }

      const hasExecutionLine = /- \*\*실행 가능성\s*\(Execution\)\*\*\s*:.*/m.test(nextText);
      if (hasExecutionLine) {
          return nextText.replace(/- \*\*실행 가능성\s*\(Execution\)\*\*\s*:.*/m, executionLine);
      }
      return `${nextText}\n${executionLine}`;
  };

  const hasStructuredOutlookSections = (text: string) => {
      const t = String(text || '');
      const hasSections = /##\s*1\./i.test(t) && /##\s*2\./i.test(t) && /##\s*3\./i.test(t);
      const hasLegendCommittee = [
          '벤저민 그레이엄',
          '피터 린치',
          '워렌 버핏',
          '윌리엄 오닐',
          '찰리 멍거',
          '글렌 웰링',
          '캐시 우드',
          '글렌 그린버그',
          '최종 평결'
      ].every(k => t.includes(k));
      const hasExpertPanel = [
          '보수적 퀀트',
          '공격적 트레이더',
          '마켓 메이커',
          '종합 분석'
      ].every(k => t.includes(k));
      const hasThesis = [
          '핵심 논거',
          '상승 촉매',
          '리스크 요인',
          '가격 목표'
      ].every(k => t.includes(k));
      return hasSections && hasLegendCommittee && hasExpertPanel && hasThesis;
  };

  const buildStructuredOutlookFallback = (item: any, rawOutlook: string) => {
      const entryExec = Number(item?.entryExecPrice || item?.entryExecPriceShadow || item?.entryPrice || item?.otePrice || item?.supportLevel || 0);
      const entryAnchor = Number(item?.entryAnchorPrice || item?.otePrice || item?.supportLevel || entryExec || 0);
      const target = Number(item?.resistanceLevel || item?.targetPrice || 0);
      const stop = Number(item?.ictStopLoss || item?.stopLoss || 0);
      const sector = item?.sectorTheme || item?.sector || 'Unknown';
      const verdict = String(item?.aiVerdict || 'HOLD');
      const pdZone = item?.pdZone || 'EQUILIBRIUM';
      const fund = Math.round(Number(item?.fundamentalScore || 0));
      const tech = Math.round(Number(item?.technicalScore || 0));
      const ict = Math.round(Number(item?.ictScore || 0));
      const conviction = Math.round(Number(item?.convictionScore || 0));
      const expected = String(item?.gatedExpectedReturn || item?.expectedReturn || 'TBD');
      const reasonList = normalizeTop6SelectionReasons(item);
      const rawSummary = cleanMarkdown(String(rawOutlook || '')).replace(/\s+/g, ' ').trim();
      const rawPreview = rawSummary ? rawSummary.slice(0, 140) : '세부 AI 원문을 확보하지 못해 정량 데이터 중심으로 보수 복원했습니다.';
      const eventRisk = String(item?.techMetrics?.eventRiskState || 'LOW').toUpperCase();
      const daysToEarnings = Number(item?.techMetrics?.daysToEarnings ?? -1);
      const dataQuality = String(item?.techMetrics?.dataQualityState || 'NORMAL').toUpperCase();
      const integrity = Math.round(Number(item?.integrityScore || item?.dataConfidence || 75));
      const entryDistancePctRaw = Number(item?.entryDistancePct ?? item?.entryDistancePctShadow);
      const entryDistancePct = Number.isFinite(entryDistancePctRaw) ? `${entryDistancePctRaw.toFixed(2)}%` : 'N/A';
      const entryFeasibleRaw = item?.entryFeasible;
      const entryFeasibleShadowRaw = item?.entryFeasibleShadow;
      const entryFeasible =
          typeof entryFeasibleRaw === 'boolean'
              ? String(entryFeasibleRaw)
              : (typeof entryFeasibleShadowRaw === 'boolean' ? String(entryFeasibleShadowRaw) : 'N/A');
      const tradePlanStatus = String(item?.tradePlanStatus || item?.tradePlanStatusShadow || 'N/A');

      return `## 1. 전설적 투자자 위원회 분석
- **벤저민 그레이엄 (Value)** : fundamentalScore ${fund} 기준 밸류 안정성 점검, 현재 섹터(${sector}) 내 상대 가치 우위 여부 확인.
- **피터 린치 (Growth)** : technicalScore ${tech} 및 모멘텀 지속성 기반 성장 탄력 점검.
- **워렌 버핏 (Moat)** : convictionScore ${conviction}와 비즈니스 지속 가능성으로 경쟁우위(해자) 검증.
- **윌리엄 오닐 (Momentum)** : ictScore ${ict} 기반 추세 진입 타이밍과 수급 강도 평가.
- **찰리 멍거 (Quality)** : 데이터 품질 ${dataQuality}, integrity ${integrity}로 신뢰 가능한 품질 투자 여부 점검.
- **글렌 웰링 (Event)** : 이벤트 리스크 ${eventRisk}${daysToEarnings >= 0 ? ` (D-${daysToEarnings})` : ''}로 단기 변동성 충격 가능성 평가.
- **캐시 우드 (Innovation)** : 종목 테마/혁신성 반영, 고성장 재평가 가능성 탐색.
- **글렌 그린버그 (Focus)** : 핵심 근거 집중 검토 — ${reasonList[0] || '핵심 근거 추출 실패'}.
- **최종 평결 (Verdict)** : ${verdict} (Expected Return: ${expected})

## 2. 전문가 3인 성향 분석
- **보수적 퀀트** : 손절선($${stop.toFixed(1)}) 기준 리스크 통제, 무효화 구간 이탈 시 시나리오 폐기.
- **공격적 트레이더** : ${isAnchorExecEquivalent(entryExec, entryAnchor) ? `진입 $${entryExec.toFixed(1)} (앵커=실행)` : `진입(실행) $${entryExec.toFixed(1)} / 진입(앵커) $${entryAnchor.toFixed(1)}`} 대비 목표($${target.toFixed(1)})의 보상/위험 기하 구조 확인.
- **마켓 메이커** : ${pdZone} 구간에서 체결/유동성 리스크와 수급 흡수 가능성 점검.
- **종합 분석** : 정량 Trade Box(OTE/TARGET/STOP)는 고정하고, 실행 가능성(feasible=${entryFeasible}, status=${tradePlanStatus}, distance=${entryDistancePct})을 별도 관리.

## 3. The Alpha Thesis: 전략적 투자 시나리오
- **핵심 논거 (Key Thesis)** : ${reasonList[2] || '핵심 논거 보강 필요'}
- **상승 촉매 (Catalysts)** : 섹터 모멘텀, 수급 흐름, 이벤트 캘린더(Earnings/Regime) 동시 정렬 여부.
- **리스크 요인 (Risk Factors)** : 레짐 전환, 변동성 급등, 손절선 하향 이탈.
- **가격 목표 (Trajectory)** : ${buildPlanTrajectoryText(entryExec, entryAnchor, target, stop)}
- **실행 가능성 (Execution)** : feasible=${entryFeasible} | status=${tradePlanStatus} | distance=${entryDistancePct}

참고 메모: ${rawPreview}`;
  };

  const ensureStructuredOutlook = (outlook: string, item: any) => {
      const base = enforceOutlookTradeBoxConsistency(outlook, item);
      if (hasStructuredOutlookSections(base)) return base;
      return buildStructuredOutlookFallback(item, base);
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

  const resolveStage5LockOverride = (): Stage5LockOverrideConfig => {
    const envEnabled = parseBooleanFlag((import.meta as any)?.env?.VITE_STAGE5_LOCK_OVERRIDE);
    const envFileId = String((import.meta as any)?.env?.VITE_STAGE5_LOCK_FILE_ID || '').trim();
    const envFileName = String((import.meta as any)?.env?.VITE_STAGE5_LOCK_FILE_NAME || '').trim();

    let storageEnabled = false;
    let storageFileId = '';
    let storageFileName = '';

    try {
      if (typeof window !== 'undefined') {
        const localRaw = window.localStorage.getItem(STAGE5_LOCK_OVERRIDE_KEY);
        if (localRaw) {
          const parsed = JSON.parse(localRaw);
          storageEnabled = parseBooleanFlag(parsed?.enabled);
          storageFileId = String(parsed?.fileId || '').trim();
          storageFileName = String(parsed?.fileName || '').trim();
        }

        // Backward-compatible flat keys (local/session)
        storageFileId =
          storageFileId ||
          String(
            window.sessionStorage.getItem(STAGE5_LOCK_FILE_ID_KEY) ||
              window.localStorage.getItem(STAGE5_LOCK_FILE_ID_KEY) ||
              ''
          ).trim();
        storageFileName =
          storageFileName ||
          String(
            window.sessionStorage.getItem(STAGE5_LOCK_FILE_NAME_KEY) ||
              window.localStorage.getItem(STAGE5_LOCK_FILE_NAME_KEY) ||
              ''
          ).trim();

        if (!storageEnabled && (storageFileId || storageFileName)) {
          // If explicit file key exists, treat as enabled to preserve operator intent.
          storageEnabled = true;
        }
      }
    } catch {
      // Storage parsing error should never block pipeline.
    }

    const enabled = storageEnabled || envEnabled;
    const fileId = storageFileId || envFileId;
    const fileName = storageFileName || envFileName;

    if (!enabled) return { enabled: false };
    return { enabled: true, fileId: fileId || undefined, fileName: fileName || undefined };
  };

  const persistStage5LockOverride = (config: Stage5LockOverrideConfig) => {
    if (typeof window === 'undefined') return;

    const normalizedFileId = String(config.fileId || '').trim();
    const normalizedFileName = String(config.fileName || '').trim();

    if (!config.enabled) {
      window.localStorage.removeItem(STAGE5_LOCK_OVERRIDE_KEY);
      window.localStorage.removeItem(STAGE5_LOCK_FILE_ID_KEY);
      window.localStorage.removeItem(STAGE5_LOCK_FILE_NAME_KEY);
      window.sessionStorage.removeItem(STAGE5_LOCK_FILE_ID_KEY);
      window.sessionStorage.removeItem(STAGE5_LOCK_FILE_NAME_KEY);
      setStage5LockEnabled(false);
      return;
    }

    if (!normalizedFileId && !normalizedFileName) {
      addLog("Stage5 Lock 설정 오류: fileId 또는 fileName 중 하나가 필요합니다.", "warn");
      return;
    }

    const payload: Stage5LockOverrideConfig = {
      enabled: true,
      fileId: normalizedFileId || undefined,
      fileName: normalizedFileName || undefined
    };

    window.localStorage.setItem(STAGE5_LOCK_OVERRIDE_KEY, JSON.stringify(payload));

    if (payload.fileId) {
      window.localStorage.setItem(STAGE5_LOCK_FILE_ID_KEY, payload.fileId);
      window.sessionStorage.setItem(STAGE5_LOCK_FILE_ID_KEY, payload.fileId);
    } else {
      window.localStorage.removeItem(STAGE5_LOCK_FILE_ID_KEY);
      window.sessionStorage.removeItem(STAGE5_LOCK_FILE_ID_KEY);
    }

    if (payload.fileName) {
      window.localStorage.setItem(STAGE5_LOCK_FILE_NAME_KEY, payload.fileName);
      window.sessionStorage.setItem(STAGE5_LOCK_FILE_NAME_KEY, payload.fileName);
    } else {
      window.localStorage.removeItem(STAGE5_LOCK_FILE_NAME_KEY);
      window.sessionStorage.removeItem(STAGE5_LOCK_FILE_NAME_KEY);
    }

    setStage5LockEnabled(true);
  };

  const loadStage5LockOptions = async () => {
    if (!accessToken) return;
    setStage5LockListLoading(true);
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=20&fields=files(id,name,createdTime)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json());
      const files: Stage5LockDriveFile[] = Array.isArray(res?.files) ? res.files : [];
      setStage5LockOptions(files);
    } catch (e: any) {
      addLog(`Stage5 Lock 목록 로딩 실패: ${e.message}`, "warn");
      setStage5LockOptions([]);
    } finally {
      setStage5LockListLoading(false);
    }
  };

  const applyStage5LockFromUi = () => {
    const picked = stage5LockOptions.find(file => file.id === stage5LockSelectedId);
    const fileId = (picked?.id || stage5LockFileId).trim();
    const fileName = (picked?.name || stage5LockFileName).trim();
    persistStage5LockOverride({ enabled: true, fileId, fileName });
    if (fileId || fileName) {
      if (fileId) setStage5LockFileId(fileId);
      if (fileName) setStage5LockFileName(fileName);
      addLog(
        `Stage5 Lock Applied: ${fileId ? `fileId=${fileId}` : `fileName=${fileName}`}`,
        "ok"
      );
    }
  };

  const releaseStage5LockFromUi = () => {
    persistStage5LockOverride({ enabled: false });
    setStage5LockSelectedId('');
    setStage5LockFileId('');
    setStage5LockFileName('');
    addLog("Stage5 Lock Released: Latest Stage5 auto-lock restored.", "ok");
  };

  useEffect(() => {
    const initial = resolveStage5LockOverride();
    setStage5LockEnabled(Boolean(initial.enabled && (initial.fileId || initial.fileName)));
    setStage5LockFileId(initial.fileId || '');
    setStage5LockFileName(initial.fileName || '');
    setStage5LockSelectedId(initial.fileId || '');
  }, []);

  useEffect(() => {
    if (activeTab === 'INDIVIDUAL' && accessToken) {
      loadStage5LockOptions();
    }
  }, [activeTab, accessToken]);

  useEffect(() => {
    if (!stage5LockSelectedId) return;
    const picked = stage5LockOptions.find(file => file.id === stage5LockSelectedId);
    if (!picked) return;
    setStage5LockFileId(picked.id);
    setStage5LockFileName(picked.name);
  }, [stage5LockSelectedId, stage5LockOptions]);

  useEffect(() => {
    if (stage5LockSelectedId || !stage5LockFileName || stage5LockOptions.length === 0) return;
    const matched = stage5LockOptions.find(file => file.name === stage5LockFileName);
    if (matched) {
      setStage5LockSelectedId(matched.id);
      setStage5LockFileId(matched.id);
    }
  }, [stage5LockSelectedId, stage5LockFileName, stage5LockOptions]);

  const buildStage5LockMeta = (fileMeta: any, content: any, lockMode: Stage5SourceMeta['lockMode']) => {
    const symbols = Array.isArray(content?.ict_universe)
      ? content.ict_universe
          .map((item: any) => String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase())
          .filter(Boolean)
      : [];

    const lockMaterial = JSON.stringify({
      id: String(fileMeta?.id || ''),
      name: String(fileMeta?.name || ''),
      count: Number(content?.manifest?.count || symbols.length || 0),
      timestamp: content?.manifest?.timestamp || null,
      symbols
    });
    const hash = fnv1aHash(lockMaterial);

    return {
      fileId: String(fileMeta?.id || ''),
      fileName: String(fileMeta?.name || ''),
      count: Number(content?.manifest?.count || symbols.length || 0),
      timestamp: content?.manifest?.timestamp,
      hash,
      symbols,
      lockMode
    } as Stage5SourceMeta;
  };

  const loadStage5Data = async () => {
    if (!accessToken) return [];
    stage5SourceRef.current = null;
    try {
      const lockOverride = resolveStage5LockOverride();
      if (lockOverride.enabled && !lockOverride.fileId && !lockOverride.fileName) {
        addLog("Vault Error: Stage5 lock override is enabled but fileId/fileName is missing.", "err");
        return [];
      }
      let latestFile: any = null;
      let lockMode: Stage5SourceMeta['lockMode'] = 'LATEST';

      if (lockOverride.enabled && lockOverride.fileId) {
        lockMode = 'OVERRIDE_ID';
        addLog(`Stage5 Lock Override: ENABLED (fileId=${lockOverride.fileId})`, "info");
        latestFile = await fetch(
          `https://www.googleapis.com/drive/v3/files/${lockOverride.fileId}?fields=id,name,createdTime`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ).then(r => r.ok ? r.json() : null);
      } else if (lockOverride.enabled && lockOverride.fileName) {
        lockMode = 'OVERRIDE_NAME';
        addLog(`Stage5 Lock Override: ENABLED (fileName=${lockOverride.fileName})`, "info");
        const qByName = encodeURIComponent(`name = '${lockOverride.fileName}' and trashed = false`);
        const listByName = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${qByName}&orderBy=createdTime desc&pageSize=1`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ).then(r => r.json());
        latestFile = listByName.files?.[0] || null;
      } else {
        const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        ).then(r => r.json());
        latestFile = listRes.files?.[0] || null;
      }
      
      if (latestFile?.id) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${latestFile.id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        
        if (content && Array.isArray(content.ict_universe) && content.ict_universe.length > 0) {
            // [VALIDATION] Check for critical fields to prevent "Data Missing" UI
            const sample = content.ict_universe[0];
            if (!sample.symbol || typeof sample.price !== 'number') {
                addLog("Vault Error: Stage 5 data is corrupted or missing critical fields.", "err");
                return [];
            }

            stage5SourceRef.current = buildStage5LockMeta(latestFile, content, lockMode);
            setElite50(content.ict_universe);
            addLog(`Stage 5 Elite Vault Locked: ${latestFile.name}`, "ok");
            addLog(`Vault Synchronized: ${content.ict_universe.length} Stage 5 leaders loaded.`, "ok");
            addLog(
              `[STAGE5_LOCK] ${stage5SourceRef.current.fileName} | hash=${stage5SourceRef.current.hash} | symbols=${(stage5SourceRef.current.symbols || []).join(',')}`,
              "info"
            );
            return content.ict_universe;
        } else {
            addLog("Vault Warning: Stage 5 file found but empty or invalid format.", "warn");
        }
      } else if (lockOverride.enabled) {
        addLog("Vault Error: Stage5 lock override was enabled but target file was not found.", "err");
      }
      stage5SourceRef.current = null;
      return [];
    } catch (e: any) {
      stage5SourceRef.current = null;
      addLog(`Sync Error: ${e.message}`, "err");
      return [];
    }
  };

  // [NEW] Helper for Drive Enrichment
  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files?.[0]?.id;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      const text = await res.text();
      // Handle NaN/Infinity in JSON
      const safeText = text.replace(/:\s*NaN/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*-Infinity/g, ': null');
      return JSON.parse(safeText);
  };

  const enrichCandidatesWithDriveData = async (candidates: any[], token: string) => {
      addLog("Deep Data Injection: Accessing Google Drive Vault...", "info");
      
      // 1. Locate Folders
      // Try to find System_Identity_Maps in root first
      let systemMapId = await findFileId(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      if (!systemMapId) {
           // Fallback: search in root if not in specific folder
           systemMapId = await findFileId(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      }

      if (!systemMapId) {
          addLog("System Map Folder not found. Skipping enrichment.", "warn");
          return candidates;
      }
      const dailyFolderId = await findFileId(token, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapId);
      const historyFolderId = await findFileId(token, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId);

      if (!dailyFolderId || !historyFolderId) {
          addLog("Data Folders missing. Skipping enrichment.", "warn");
          return candidates;
      }

      addLog(`[OK] Financial Data Folders Verified.`, "ok");

      // 2. Group by Letter
      const grouped: Record<string, any[]> = {};
      candidates.forEach(c => {
          const letter = c.symbol.charAt(0).toUpperCase();
          if (!grouped[letter]) grouped[letter] = [];
          grouped[letter].push(c);
      });

      // 3. Fetch & Enrich Batch
      let enrichedCount = 0;
      let skippedCount = 0;
      const enrichedCandidates = [...candidates];
      const letters = Object.keys(grouped).sort();

      for (const letter of letters) {
          try {
              const batchSize = grouped[letter].length;
              addLog(`[INFO] Scanning Group '${letter}' (${batchSize} tickers)...`, "info");

              // Parallel Fetch
              const [dailyId, historyId] = await Promise.all([
                  findFileId(token, `${letter}_stocks_daily.json`, dailyFolderId),
                  findFileId(token, `${letter}_stocks_history.json`, historyFolderId)
              ]);

              const [dailyData, historyData] = await Promise.all([
                  dailyId ? downloadFile(token, dailyId) : {},
                  historyId ? downloadFile(token, historyId) : {}
              ]);

              // Apply Data
              grouped[letter].forEach(c => {
                  const target = enrichedCandidates.find(ec => ec.symbol === c.symbol);
                  if (!target) return;

                  const dData = dailyData[c.symbol];
                  const hData = historyData[c.symbol]; 
                  let isUpdated = false;

                  // Helper: Normalize Ratio to Percent (0.15 -> 15.0)
                  const toPct = (val: any) => (val && Math.abs(val) < 10) ? val * 100 : val;

                  // A. Daily Data Injection (Priority 1)
                  if (dData) {
                      if (!target.roe) { target.roe = toPct(dData.roe); isUpdated = true; }
                      if (!target.operatingMargins) { target.operatingMargins = toPct(dData.operatingMargins); isUpdated = true; }
                      if (!target.revenueGrowth) { target.revenueGrowth = toPct(dData.revenueGrowth); isUpdated = true; }
                      if (!target.debtToEquity) { target.debtToEquity = dData.debtToEquity; isUpdated = true; }
                      if (!target.operatingCashflow) { target.operatingCashflow = dData.operatingCashflow; isUpdated = true; }
                      if (!target.pe) { target.pe = dData.per; isUpdated = true; }
                      if (!target.pbr) { target.pbr = dData.pbr; isUpdated = true; }
                  }

                  // B. History Data Injection (Priority 2 - Calculation)
                  if (hData) {
                      // Get latest date key
                      const dates = Object.keys(hData).sort().reverse();
                      const latest = hData[dates[0]];
                      
                      if (latest) {
                          if (!target.grossMargin && latest['Gross Profit'] && latest['Total Revenue']) {
                              target.grossMargin = (latest['Gross Profit'] / latest['Total Revenue']) * 100;
                              isUpdated = true;
                          }
                          if (!target.operatingCashflow && latest['Operating Cash Flow']) {
                              target.operatingCashflow = latest['Operating Cash Flow'];
                              isUpdated = true;
                          }
                      }
                  }
                  
                  // C. Safe Score Recalculation (If missing)
                  if (!target.safeScore) {
                      let score = 50;
                      if (target.debtToEquity < 100) score += 20;
                      if (target.operatingCashflow > 0) score += 20;
                      if (target.roe > 10) score += 10;
                      target.safeScore = score;
                  }
                  
                  if (isUpdated) enrichedCount++;
                  else skippedCount++;
              });

          } catch (e) {
              console.warn(`Failed to enrich group ${letter}`, e);
              addLog(`[WARN] Failed to process Group '${letter}'`, "warn");
          }
      }

      addLog(`[COMPLETED] Data Enrichment: ${enrichedCount} updated, ${skippedCount} preserved.`, "ok");
      return enrichedCandidates;
  };

  // [NEW] Batch Enrichment for 50 Candidates
  const enrichAllCandidates = async (candidates: AlphaCandidate[]) => {
      const enrichedData: AlphaCandidate[] = [];
      const CHUNK_SIZE = 5;
      const total = candidates.length;
      
      addLog(`Starting Deep Data Enrichment for ${total} tickers...`, "signal");

      for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = candidates.slice(i, i + CHUNK_SIZE);
          const currentBatchNum = Math.min(i + CHUNK_SIZE, total);
          
          addLog(`Enriching Batch ${Math.ceil((i + 1) / CHUNK_SIZE)}/${Math.ceil(total / CHUNK_SIZE)} (${currentBatchNum}/${total})...`, "info");

          const chunkResults = await Promise.all(chunk.map(async (item) => {
              try {
                  if (!finnhubKey) return item;

                  // Parallel Fetch: Profile, News, & Quote (Real-time Price)
                  const [profileRes, newsRes, quoteRes] = await Promise.all([
                      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${item.symbol}&token=${finnhubKey}`),
                      fetch(`https://finnhub.io/api/v1/company-news?symbol=${item.symbol}&from=${new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]}&to=${new Date().toISOString().split('T')[0]}&token=${finnhubKey}`),
                      fetch(`https://finnhub.io/api/v1/quote?symbol=${item.symbol}&token=${finnhubKey}`)
                  ]);

                  const profile = await profileRes.json();
                  const news = await newsRes.json();
                  const quote = await quoteRes.json();

                  // Construct Description
                  let desc = item.description || "";
                  if (profile && profile.name) {
                      desc = `${profile.name} operates in the ${profile.finnhubIndustry} industry. ${desc}`;
                  }

                  // Construct News Sentiment Summary
                  let newsText = "No recent news.";
                  if (Array.isArray(news) && news.length > 0) {
                      // Take top 3 headlines
                      newsText = news.slice(0, 3).map((n: any) => `[${n.datetime ? new Date(n.datetime * 1000).toLocaleDateString() : 'Recent'}] ${n.headline}`).join(" | ");
                  }

                  // [NEW] Real-time Price Injection
                  let currentPrice = item.price;
                  let change = item.change || 0;
                  let changeP = item.changeAmount || 0; // Using changeAmount as percent placeholder if needed, or separate field

                  if (quote && quote.c) {
                      currentPrice = quote.c;
                      change = quote.d; // Change
                      changeP = quote.dp; // Percent Change
                  }

                  return {
                      ...item,
                      description: desc,
                      newsSentiment: newsText, 
                      price: currentPrice,
                      change: change,
                      changePercent: changeP, // Ensure this field is updated
                      // Ensure critical fields exist (Sanitization)
                      ictMetrics: item.ictMetrics || { displacement: 0, smartMoneyFlow: 50, fvgStrength: 0 },
                      techMetrics: item.techMetrics || { rawRvol: 0, squeezeState: 'OFF' },
                      fairValueGap: Number(item.fairValueGap) || 0,
                      ictScore: Number(item.ictScore) || 0
                  };

              } catch (e) {
                  // Fail silently for individual ticker to keep pipeline moving
                  return item;
              }
          }));

          enrichedData.push(...chunkResults);

          // Rate Limit Delay (1s)
          if (i + CHUNK_SIZE < total) {
              await new Promise(r => setTimeout(r, 1000));
          }
      }
      
      addLog("Deep Data Enrichment Complete. All 50 tickers updated.", "ok");
      return enrichedData;
  };

  // [NEW] Stage 1: Data Preparation & Scoring
  const runStage1 = async (inputData: AlphaCandidate[]) => {
      addLog("STAGE 1: Data Preparation & Scoring...", "signal");
      
      // 1. Fetch Benchmarks
      const benchmarks = await fetchMarketBenchmarks();
      const spyChange = benchmarks.spy.change;
      const qqqChange = benchmarks.qqq.change;
      
      // [NEW] Global Caching for Report Hydration
      if (typeof window !== 'undefined') {
          window.latestMarketPulse = benchmarks;
      }

      addLog(`Benchmark Reference: SPX ${spyChange.toFixed(2)}% | NDX ${qqqChange.toFixed(2)}%`, "info");

      // 2. Score Candidates
      const scoredCandidates = inputData.map((c: any) => {
          const gap = Number(c.fairValueGap || 0);
          const ict = Number(c.ictScore || 0);
          const fundScore = Number(c.fundamentalScore || 0);
          const techScore = Number(c.technicalScore || 0);
          const rvol = Number(c.techMetrics?.rawRvol || 0);
          const dp = Number(c.changePercent || 0);
          const signalComboBonus = Number(c.techMetrics?.signalComboBonus || 0);
          const signalHeatPenalty = Number(c.techMetrics?.signalHeatPenalty || 0);
          const signalQualityState = c.techMetrics?.signalQualityState || 'NEUTRAL';
          const dataQualityState = c.techMetrics?.dataQualityState || 'NORMAL';
          const minerviniPassCount = Number(c.techMetrics?.minerviniPassCount || 0);
          
          // [NEW] Data Integrity Scoring
          const CRITICAL_FIELDS = ['roe', 'operatingMargins', 'debtToEquity', 'revenueGrowth', 'operatingCashflow', 'grossMargin', 'safeScore'];
          let filledCount = 0;
          CRITICAL_FIELDS.forEach(field => {
              if (c[field] !== undefined && c[field] !== null && c[field] !== 0) filledCount++;
          });
          const integrityScore = (filledCount / CRITICAL_FIELDS.length) * 100;

          const isUndervaluedGrowth = gap > 100 && ict > 60;
          const isVolumeRunner = (c.isImputed === true) && rvol > 3.0; 
          const isHiddenGem = isUndervaluedGrowth || isVolumeRunner;
          
          let sortScore = c.compositeAlpha || 0;
          let convictionScore = c.convictionScore || c.compositeAlpha || 0;

          // [NEW] Apply Integrity Weight (20%)
          // Penalize low integrity, Boost high integrity
          if (integrityScore < 50) {
              sortScore *= 0.5; // Heavy Penalty for Ghost Data
              convictionScore *= 0.5;
          } else if (integrityScore >= 80) {
              sortScore *= 1.2; // Boost for High Quality Data
              convictionScore *= 1.1;
          }

          // A) Fundamental explicit weighting: make the Stage 3 edge visible again at final selection time.
          if (fundScore >= 85) {
              sortScore += 12;
              convictionScore += 8;
          } else if (fundScore >= 70) {
              sortScore += 6;
              convictionScore += 4;
          } else if (fundScore < 45) {
              sortScore -= 8;
              convictionScore -= 5;
          }

          // B) Final selection floors: a severe weakness in one pillar should not slip through late-stage AI polish.
          if (techScore < 40) {
              sortScore -= 14;
              convictionScore -= 10;
          }
          if (ict < 60) {
              sortScore -= 16;
              convictionScore -= 10;
          }
          if (fundScore < 40) {
              sortScore -= 18;
              convictionScore -= 12;
          }

          // C) Balance bonus: reward candidates that are strong across all three engines, not just one dimension.
          const strongFund = fundScore >= 70;
          const strongTech = techScore >= 65;
          const strongIct = ict >= 75;
          const balanceHits = [strongFund, strongTech, strongIct].filter(Boolean).length;
          if (balanceHits === 3) {
              sortScore += 14;
              convictionScore += 8;
          } else if (balanceHits === 2) {
              sortScore += 5;
              convictionScore += 3;
          }

          // Stage 4/5 signal bridge: preserve the existing ranking engine and add only small context weights.
          if (signalQualityState === 'ALIGNED') {
              sortScore += 12;
              convictionScore += 8;
          } else if (signalQualityState === 'SETUP') {
              sortScore += 6;
              convictionScore += 4;
          }

          if (signalComboBonus > 0) {
              sortScore += Math.min(8, signalComboBonus * 2);
              convictionScore += Math.min(5, signalComboBonus);
          }

          if (signalHeatPenalty > 0) {
              sortScore -= Math.min(10, signalHeatPenalty * 1.5);
              convictionScore -= Math.min(8, signalHeatPenalty);
          }

          if (minerviniPassCount >= 7) {
              sortScore += 5;
              convictionScore += 3;
          } else if (minerviniPassCount <= 3) {
              sortScore -= 5;
          }

          if (dataQualityState === 'THIN') {
              sortScore *= 0.96;
              convictionScore *= 0.97;
          } else if (dataQualityState === 'ILLIQUID') {
              sortScore *= 0.80;
              convictionScore *= 0.82;
          } else if (dataQualityState === 'STALE') {
              sortScore *= 0.70;
              convictionScore *= 0.75;
          }

          // Dual-Alpha Engine
          let spyAlpha = false;
          let qqqAlpha = false;

          if (dp > spyChange) {
              sortScore *= 1.1;
              convictionScore *= 1.1;
              spyAlpha = true;
          }
          if (dp > qqqChange) {
              sortScore *= 1.15;
              convictionScore *= 1.15;
              qqqAlpha = true;
          }

          // ICT PD-Array Filter
          let isOverheated = false;
          if (c.pdZone === 'DISCOUNT') {
              convictionScore += 15;
              sortScore += 15;
          } else if (c.pdZone === 'PREMIUM') {
              isOverheated = true;
              sortScore -= 50; 
          }

          // Institutional Entry Badge
          const displacement = c.ictMetrics?.displacement ?? 0;
          const isInstitutionalEntry = displacement > 65;

          if (isHiddenGem) sortScore += 25; 
          
          return { 
              ...c, 
              isHiddenGem, 
              sortScore, 
              convictionScore: Math.min(99, Math.round(convictionScore)),
              integrityScore: Math.round(integrityScore),
              spyAlpha,
              qqqAlpha,
              isInstitutionalEntry,
              isOverheated
          };
      });

      // 3. Filter Top 12
      // [NEW] Sort by Weighted Score (Composite + Integrity)
      const topCandidates = scoredCandidates
          .sort((a: any, b: any) => b.sortScore - a.sortScore)
          .slice(0, 12);

      if (topCandidates.length === 0) throw new Error("No candidates available after scoring.");

      addLog(`Top 12 Candidates Selected. Avg Integrity: ${Math.round(topCandidates.reduce((acc: number, c: any) => acc + c.integrityScore, 0) / 12)}%`, "info");
      addLog("Fund / Tech / ICT Balance Filters Applied to Top 12 sieve.", "ok");
      addLog("Stage 4/5 Signal Context Applied to Top 12 sieve.", "ok");

      // 4. Archive Stage 1 Result (Fail-safe Dump)
      if (accessToken) {
          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportSubFolder);
          await uploadFile(accessToken, folderId, `STAGE6_PART1_SCORED_${getKstTimestamp()}.json`, topCandidates);
      }

      return topCandidates;
  };

  const handleExecuteEngine = async () => {
    if (loading) return;
    setLoading(true);
    setLogs([]);
    stage6FinalRef.current = [];
    stage6ModelTop6Ref.current = [];
    stage6WatchlistTopRef.current = [];
    stage6ExecutableRef.current = [];
    stage6FinalRunIdRef.current = '';
    addLog("STAGE 6: Neural Alpha Sieve Initiated...", "signal");

    try {
      // 1. Lock the latest Stage 5 dump from Drive first. Memory is only a fallback.
      let inputData: AlphaCandidate[] = [];
      if (accessToken) {
          addLog("Locking latest Stage 5 Elite vault from Drive...", "info");
          inputData = await loadStage5Data();
      }
      if ((!inputData || inputData.length === 0) && elite50.length > 0) {
          addLog("Drive lock unavailable. Falling back to in-memory Stage 5 leaders.", "warn");
          inputData = elite50;
      }

      if (!inputData || inputData.length === 0) {
          throw new Error("Stage 5 Data Not Found. Please run Stage 5 first.");
      }

      if (stage5SourceRef.current) {
          const symbols = stage5SourceRef.current.symbols || inputData.map((item: any) => String(item?.symbol || '').toUpperCase());
          addLog(
            `[STAGE5_LOCK_AUDIT] file=${stage5SourceRef.current.fileName} | mode=${stage5SourceRef.current.lockMode || 'LATEST'} | hash=${stage5SourceRef.current.hash || 'N/A'} | symbols(${symbols.length})=${symbols.join(',')}`,
            "info"
          );
      }

      // [NEW] Deep Data Enrichment (Drive Injection) - MOVED TO STAGE 3
      // if (accessToken) {
      //     inputData = await enrichCandidatesWithDriveData(inputData, accessToken);
      // }

      // [NEW] Batch Enrichment to prevent Rate Limits
      addLog(`Starting Deep Data Enrichment for ${inputData.length} tickers...`, "info");
      const enrichedData = await enrichAllCandidates(inputData);
      
      // 2. Run Stage 1 (Scoring & Filtering)
      const topCandidates = await runStage1(enrichedData);
      
      // 3. Run Stage 2 (AI Analysis)
      await runStage2(topCandidates);

    } catch (error: any) {
      addLog(`CRITICAL FAILURE: ${error.message}`, "err");
    } finally {
      setLoading(false);
      addLog("Analysis Cycle Completed.", "info");
    }
  };

  // [NEW] Stage 2: AI Analysis
  const runStage2 = async (candidates: AlphaCandidate[]) => {
      addLog("STAGE 2: AI Alpha Synthesis...", "signal");
      
      let response: any = { data: [] };
      let usedProvider = selectedBrain;
      const requestedProvider = selectedBrain;
      let responseUsedProviderRaw = '';
      let aiFailed = false;
      const normalizeUsedProvider = (raw: any, fallback: ApiProvider): ApiProvider => {
          const t = String(raw || '').toUpperCase();
          if (t.includes('PERPLEXITY')) return ApiProvider.PERPLEXITY;
          if (t.includes('GEMINI')) return ApiProvider.GEMINI;
          return fallback;
      };

      try {
          // [FIX] Corrected Engine Name Display
          addLog(`사용 중인 엔진: [${selectedBrain === ApiProvider.GEMINI ? 'GEMINI' : 'SONAR'}]`, "info");
          
          response = await generateAlphaSynthesis(candidates, selectedBrain, autoStart);
          responseUsedProviderRaw = String(response?.usedProvider || '').toUpperCase();
          usedProvider = normalizeUsedProvider(response?.usedProvider, usedProvider);
          stage2ProviderRef.current = usedProvider;
          if (usedProvider !== selectedBrain) {
              setSelectedBrain(usedProvider);
          }
          
          // [CRITICAL] Error Propagation for Branching Logic
          if (response.error) {
              throw new Error(response.error);
          }

      } catch (err: any) {
          const isGeminiError = selectedBrain === ApiProvider.GEMINI;
          
          if (isGeminiError) {
              // [CASE A: Manual Execution]
              if (!autoStart) {
                  addLog("Gemini 크레딧 초과로 엔진을 Sonar로 전환했습니다. 다시 실행 버튼을 눌러주세요.", "err");
                  setSelectedBrain(ApiProvider.PERPLEXITY);
                  setLoading(false);
                  // [STOP] Throw Error to halt process
                  throw new Error("MANUAL_STOP_REQUIRED");
              } 
              // [CASE B: Autopilot Execution]
              else {
                  addLog(`Primary Engine (Gemini) Failed: ${err.message}. Engaging Sonar Failover...`, "warn");
                  
                  // [FAILOVER] Switch to Perplexity immediately
                  usedProvider = ApiProvider.PERPLEXITY;
                  setSelectedBrain(ApiProvider.PERPLEXITY);
                  
                  try {
                      // [RETRY] Execute with Perplexity
                      response = await generateAlphaSynthesis(candidates, ApiProvider.PERPLEXITY, autoStart);
                      responseUsedProviderRaw = String(response?.usedProvider || '').toUpperCase();
                      usedProvider = normalizeUsedProvider(response?.usedProvider, ApiProvider.PERPLEXITY);
                      stage2ProviderRef.current = usedProvider;
                      if (usedProvider !== selectedBrain) {
                          setSelectedBrain(usedProvider);
                      }
                      if (response.error) throw new Error(response.error);
                      
                      addLog("Sonar Failover Successful. Continuing Analysis...", "ok");
                  } catch (retryErr: any) {
                      addLog(`Failover Engine (Perplexity) also failed: ${retryErr.message}`, "err");
                      aiFailed = true;
                  }
              }
          } else {
              // Non-Gemini Error (e.g. Perplexity failed directly)
              addLog(`Engine Failed: ${err.message}`, "err");
              aiFailed = true;
          }
      }

      let finalData = candidates;
      let matchedAiCount = 0;
      let verifiedAiCount = 0;
      let fallbackAiCount = 0;
      if (!aiFailed && response?.data) {
          const aiMap = new Map(response.data.map((i: any) => [String(i.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase(), i]));
          finalData = candidates.map(item => {
              const cleanSymbol = String(item.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
              const aiData = aiMap.get(cleanSymbol);
              if (!aiData) {
                  fallbackAiCount++;
                  return {
                      ...item,
                      aiSynthesisStatus: 'FALLBACK',
                      aiFallbackDetected: true,
                      aiFallbackReason: 'MISSING_AI_ITEM',
                      aiProvider: usedProvider
                  };
              }
              matchedAiCount++;
              const hasAiFallback = aiData?.aiSynthesisStatus === 'FALLBACK' || aiData?.aiFallbackDetected === true;
              if (hasAiFallback) {
                  fallbackAiCount++;
                  return {
                      ...item,
                      aiSynthesisStatus: 'FALLBACK',
                      aiFallbackDetected: true,
                      aiFallbackReason: aiData?.aiFallbackReason || 'UNKNOWN',
                      aiProvider: aiData?.aiProvider || usedProvider
                  };
              }
              
              verifiedAiCount++;

              // Merge Logic (C4):
              // Blend AI + quant conviction, but keep a quant floor to prevent conviction cliffs.
              const quantConvictionBaseRaw =
                  Number(item?.rawConvictionScore ?? item?.convictionScore ?? item?.compositeAlpha ?? 0);
              const quantConvictionBase = Number.isFinite(quantConvictionBaseRaw)
                  ? Math.max(0, Math.min(100, quantConvictionBaseRaw))
                  : 0;
              const aiConvictionRaw = Number(aiData?.convictionScore ?? quantConvictionBase);
              const aiConviction = Number.isFinite(aiConvictionRaw)
                  ? Math.max(0, Math.min(100, aiConvictionRaw))
                  : quantConvictionBase;

              const baseVerdictKeyForWeight = toVerdictKey(item?.verdict || item?.finalVerdict || item?.aiVerdict || '');
              const aiVerdictKeyForWeight = toVerdictKey(aiData?.aiVerdict || '');
              const verdictConflictForWeight =
                  Boolean(baseVerdictKeyForWeight) &&
                  Boolean(aiVerdictKeyForWeight) &&
                  baseVerdictKeyForWeight !== aiVerdictKeyForWeight;
              const marketStateKeyForWeight = String(item?.marketState || '')
                  .trim()
                  .toUpperCase()
                  .replace(/[\s-]+/g, '_');
              const isBullishVerdictForWeight =
                  aiVerdictKeyForWeight.includes('STRONGBUY') ||
                  aiVerdictKeyForWeight.includes('STRONG_BUY') ||
                  aiVerdictKeyForWeight.includes('BUY') ||
                  aiVerdictKeyForWeight.includes('ACCUMULATE') ||
                  aiVerdictKeyForWeight.includes('SPECULATIVEBUY') ||
                  aiVerdictKeyForWeight.includes('SPECULATIVE_BUY') ||
                  aiVerdictKeyForWeight.includes('매수');
              const stateConflictForWeight =
                  (marketStateKeyForWeight === 'DISTRIBUTION' || marketStateKeyForWeight === 'MANIPULATION') &&
                  isBullishVerdictForWeight;
              const riskOffVerdictForWeight = isRiskOffVerdict(aiVerdictKeyForWeight);

              let aiWeight = 0.35;
              if (!Number.isFinite(aiConvictionRaw) || aiConvictionRaw <= 0) {
                  aiWeight = 0;
              } else {
                  if (verdictConflictForWeight) aiWeight -= 0.10;
                  if (stateConflictForWeight) aiWeight -= 0.10;
                  if (riskOffVerdictForWeight) aiWeight -= 0.05;
                  aiWeight = Math.max(0.10, Math.min(0.45, aiWeight));
              }

              const blendedConvictionRaw =
                  aiWeight > 0
                      ? quantConvictionBase * (1 - aiWeight) + aiConviction * aiWeight
                      : quantConvictionBase;
              const quantConvictionFloor = Math.max(0, Math.min(100, Math.round(quantConvictionBase * 0.7)));
              const safeConviction = Math.round(
                  Math.max(
                      Math.min(100, Math.max(0, blendedConvictionRaw)),
                      quantConvictionFloor
                  )
              );
              const convictionFloorApplied = safeConviction > Math.round(blendedConvictionRaw);

              // Keep fallback verdict inside canonical contract.
              const safeVerdict = aiData?.aiVerdict || "BUY";
              const safeOutlook = aiData?.investmentOutlook || "";
              const canonicalTrade = buildCanonicalTradePlan(item);
              // Preserve quant-side expected return label first to keep Stage UI semantics stable.
              const quantExpectedReturn =
                  canonicalTrade.expectedReturnLabel ||
                  normalizeExpectedReturnLabel(item.expectedReturn) ||
                  deriveQuantExpectedReturn(item);
              const baseExpectedReturn = quantExpectedReturn || "0% (No Edge)";
              const executionFactor = getExecutionFactorForItem(item);
              const executionAdjustedExpectedReturn = applyExecutionFactorToExpectedReturn(baseExpectedReturn, executionFactor) || baseExpectedReturn;
              const safeExpectedReturn = normalizeExpectedReturnByVerdict(executionAdjustedExpectedReturn, safeVerdict) || "TBD";

              // [NEW] Radar Data Generation (On-the-fly Scoring)
              const radar = [
                  { subject: 'Value', A: Math.min(100, Math.max(20, 100 - (item.pe || 20) * 2)), fullMark: 100 },
                  { subject: 'Growth', A: Math.min(100, Math.max(20, (item.revenueGrowth || 0) + 50)), fullMark: 100 },
                  { subject: 'Profit', A: Math.min(100, Math.max(20, (item.roe || 0) * 2)), fullMark: 100 },
                  { subject: 'Momentum', A: Math.min(100, Math.max(20, (item.ictScore || 50))), fullMark: 100 },
                  { subject: 'Safety', A: Math.min(100, Math.max(20, (item.safeScore || 50))), fullMark: 100 },
                  { subject: 'Quality', A: Math.min(100, Math.max(20, (item.grossMargin || 30) * 1.5)), fullMark: 100 }
              ];

              return {
                  ...item,
                  ...aiData,
                  convictionScore: safeConviction,
                  rawConvictionScore: quantConvictionBase,
                  convictionAiRaw: aiConviction,
                  convictionAiWeight: Number(aiWeight.toFixed(2)),
                  convictionBlendedRaw: Number(blendedConvictionRaw.toFixed(2)),
                  convictionFloor: quantConvictionFloor,
                  convictionFloorApplied,
                  aiVerdict: safeVerdict,
                  investmentOutlook: safeOutlook,
                  rawExpectedReturn: baseExpectedReturn,
                  gatedExpectedReturn: safeExpectedReturn,
                  expectedReturn: safeExpectedReturn,
                  aiSynthesisStatus: aiData?.aiSynthesisStatus || 'OK',
                  aiFallbackDetected: false,
                  aiFallbackReason: aiData?.aiFallbackReason || 'NONE',
                  aiProvider: aiData?.aiProvider || usedProvider,
                  executionFactor: Number(executionFactor.toFixed(2)),
                  tradePlanSource: canonicalTrade.source,
                  tradePlanStatus: canonicalTrade.status,
                  // [QUANT LOCK] Trade-box values are quant-authoritative. AI must never overwrite.
                  supportLevel: canonicalTrade.entry || item.supportLevel || item.otePrice || 0,
                  resistanceLevel: canonicalTrade.target || item.resistanceLevel || item.targetPrice || (item as any).targetMeanPrice || 0,
                  stopLoss: canonicalTrade.stop || item.stopLoss || item.ictStopLoss || 0,
                  // [NEW] Inject Visualization Data
                  radarData: radar,
                  fullHistory: item.priceHistory || item.fullHistory || [], // Map priceHistory to fullHistory
                  sectorScore: item.sectorScore || 50, // Default if missing
                  economicMoat: aiData.economicMoat || item.economicMoat || "Narrow",
                  // [CRITICAL] Quant authority: preserve expanded Stage 4/5 fields even after AI merge.
                  techMetrics: item.techMetrics || { rawRvol: 0, squeezeState: 'OFF' },
                  ictMetrics: item.ictMetrics || { displacement: 0, smartMoneyFlow: 50, fvgStrength: 0 },
                  priceHistory: item.priceHistory || [],
                  pdZone: item.pdZone || 'EQUILIBRIUM',
                  otePrice: canonicalTrade.entry || item.otePrice || item.supportLevel || 0,
                  ictStopLoss: canonicalTrade.stop || item.ictStopLoss || item.stopLoss || 0,
                  marketState: item.marketState || 'Consolidation',
                  verdict: item.verdict || aiData.aiVerdict || 'HOLD',
                  compositeAlpha: item.compositeAlpha || 0,
                  ictScore: Number(item.ictScore) || 0,
                  technicalScore: Number(item.technicalScore) || 0,
                  fundamentalScore: Number(item.fundamentalScore) || 0,
                  dataSource: item.dataSource,
                  isTechnicalBreakout: item.isTechnicalBreakout
              };
          });
          addLog(`AI Synthesis Complete. Provider: ${usedProvider}`, "ok");
          addLog(
              `[AUDIT_ENGINE] requested=${requestedProvider} | response=${responseUsedProviderRaw || 'UNKNOWN'} | actual=${usedProvider}`,
              "info"
          );
          addLog(`AI Coverage: ${verifiedAiCount}/${candidates.length} verified (${matchedAiCount} matched, ${fallbackAiCount} fallback).`, "info");
          if (fallbackAiCount > 0) {
              addLog(`AI Fallback Audit: ${fallbackAiCount} symbols downgraded to quant-only review.`, "warn");
          }
      } else {
          addLog("AI Analysis Failed. Using Quantitative Fallback.", "warn");
      }

      if (aiFailed) {
          addLog("AI Synthesis Unavailable. Final dump aborted to avoid quant-only contamination.", "err");
          throw new Error("AI_SYNTHESIS_UNAVAILABLE");
      }

      const minimumVerifiedAiCount = Math.max(8, Math.ceil(candidates.length * 0.75));
      if (!aiFailed && verifiedAiCount < minimumVerifiedAiCount) {
          addLog(`AI Coverage Failure: ${verifiedAiCount}/${candidates.length} verified. Minimum required: ${minimumVerifiedAiCount}. Final dump aborted.`, "err");
          throw new Error("AI_COVERAGE_INSUFFICIENT");
      }

      // [FINAL GATE] Last-mile discipline before the Top 6 cut.
      let gatedCount = 0;
      let exceptionCount = 0;
      finalData = finalData.map(item => {
          const fundScore = Number(item.fundamentalScore || 0);
          const techScore = Number(item.technicalScore || 0);
          const ictScore = Number(item.ictScore || 0);
          const minerviniPassCount = Number(item.techMetrics?.minerviniPassCount || 0);
          const signalQualityState = item.techMetrics?.signalQualityState || 'NEUTRAL';
          const dataQualityState = item.techMetrics?.dataQualityState || 'NORMAL';
          const pdZone = item.pdZone || 'EQUILIBRIUM';
          const rawConvictionScore = Number(item.rawConvictionScore ?? item.convictionScore ?? 0);
          const aiSynthesisStatus = item.aiSynthesisStatus || 'UNKNOWN';
          const aiFallbackDetected = item.aiFallbackDetected === true;
          const tradePlanStatus = item.tradePlanStatus || 'VALID';
          const tradePlanSource = item.tradePlanSource || 'RAW';
          let gatedAiVerdict =
              tradePlanStatus === 'INVALID' && !isRiskOffVerdict(item.aiVerdict)
                  ? 'HOLD'
                  : item.aiVerdict;
          if (isStrongBuyVerdict(gatedAiVerdict) && rawConvictionScore < 80) {
              gatedAiVerdict = 'BUY';
          }
          const aiVerdictKey = toVerdictKey(gatedAiVerdict);

          const qualifiesDiscountException =
              fundScore >= 90 &&
              ictScore >= 85 &&
              pdZone === 'DISCOUNT' &&
              dataQualityState === 'NORMAL';

          let finalGateBonus = 0;
          let finalGatePenalty = 0;
          let finalGateState = 'OPEN';

          if (aiFallbackDetected || aiSynthesisStatus === 'FALLBACK') {
              finalGatePenalty += 45;
              finalGateState = 'AI_UNVERIFIED';
          }

          if (isRiskOffVerdict(aiVerdictKey)) {
              finalGatePenalty += 24;
              if (finalGateState === 'OPEN') finalGateState = 'AI_RISK_OFF';
          } else if (aiVerdictKey.includes('HOLD') || aiVerdictKey.includes('NEUTRAL')) {
              finalGatePenalty += 8;
              if (finalGateState === 'OPEN') finalGateState = 'AI_NEUTRAL';
          } else if (isStrongBuyVerdict(gatedAiVerdict)) {
              finalGateBonus += 2;
          }

          if (qualifiesDiscountException) {
              finalGateBonus += 6;
              finalGateState = 'EXCEPTION_DISCOUNT';
              exceptionCount++;
          }

          if (techScore < 50) finalGatePenalty += 16;
          else if (techScore < 60) finalGatePenalty += 6;

          if (minerviniPassCount < 2) finalGatePenalty += 8;
          if (minerviniPassCount < 2 && techScore < 55 && !qualifiesDiscountException) {
              finalGatePenalty += 18;
              finalGateState = 'WEAK_STRUCTURE';
          }

          if (ictScore < 60) finalGatePenalty += 8;
          if (fundScore < 45) finalGatePenalty += 8;

          if (signalQualityState === 'NEUTRAL') finalGatePenalty += 5;
          if (dataQualityState === 'THIN') finalGatePenalty += 4;
          else if (dataQualityState === 'ILLIQUID') finalGatePenalty += 15;
          else if (dataQualityState === 'STALE') finalGatePenalty += 20;
          if (tradePlanStatus === 'INVALID') {
              finalGatePenalty += 80;
              finalGateState = 'INVALID_GEOMETRY';
          } else if (tradePlanSource === 'DERIVED_2R') {
              finalGatePenalty += 6;
              if (finalGateState === 'OPEN') finalGateState = 'DERIVED_TARGET';
          }

          if (fundScore >= 70 && techScore >= 70 && ictScore >= 80) {
              finalGateBonus += 8;
              if (finalGateState === 'OPEN') finalGateState = 'BALANCED';
          } else if (fundScore >= 60 && techScore >= 60 && ictScore >= 70) {
              finalGateBonus += 4;
          }

          if (minerviniPassCount >= 7) finalGateBonus += 4;
          if (signalQualityState === 'ALIGNED') finalGateBonus += 3;
          else if (signalQualityState === 'SETUP') finalGateBonus += 1;

          let finalSelectionScore = Math.max(0, Math.min(100, rawConvictionScore + finalGateBonus - finalGatePenalty));
          if (aiFallbackDetected || aiSynthesisStatus === 'FALLBACK') {
              finalSelectionScore = 0;
          }
          if (isStrongBuyVerdict(gatedAiVerdict) && finalSelectionScore < 80) {
              gatedAiVerdict = 'BUY';
          }
          if (finalGatePenalty > 0 || finalGateBonus > 0) gatedCount++;

          return {
              ...item,
              rawConvictionScore,
              finalSelectionScore: Number(finalSelectionScore.toFixed(2)),
              finalGateBonus,
              finalGatePenalty,
              finalGateState,
              aiVerdict: gatedAiVerdict,
              convictionScore: Math.round(finalSelectionScore),
              gatedExpectedReturn:
                  tradePlanStatus === 'INVALID'
                      ? '0% (No Edge)'
                      : (normalizeExpectedReturnByVerdict(item.expectedReturn, gatedAiVerdict) || item.expectedReturn),
              expectedReturn:
                  tradePlanStatus === 'INVALID'
                      ? '0% (No Edge)'
                      : (normalizeExpectedReturnByVerdict(item.expectedReturn, gatedAiVerdict) || item.expectedReturn)
          };
      });

      addLog(`Final Gate: ${gatedCount} candidates normalized before Top 6 cut.`, "ok");
      if (exceptionCount > 0) {
          addLog(`Final Gate Exception: ${exceptionCount} deep-discount leaders preserved.`, "warn");
      }

      // Update Cache & UI
      // [HARD GATE] Risk-off verdicts are excluded from primary Top6 queue.
      const pickFinite = (...vals: any[]): number | null => {
          for (const v of vals) {
              if (v === null || v === undefined) continue;
              if (typeof v === 'string' && v.trim() === '') continue;
              if (typeof v === 'boolean') continue;
              const n = Number(v);
              if (Number.isFinite(n)) return n;
          }
          return null;
      };
      const entryFeasibilityMaxDistanceRaw = Number(
          (import.meta as any)?.env?.VITE_ENTRY_FEASIBILITY_MAX_DISTANCE_PCT ?? 15
      );
      const ENTRY_FEASIBILITY_SHADOW_MAX_DISTANCE_PCT =
          Number.isFinite(entryFeasibilityMaxDistanceRaw) && entryFeasibilityMaxDistanceRaw >= 0
              ? entryFeasibilityMaxDistanceRaw
              : 15;
      const stage6MinRrRaw = Number((import.meta as any)?.env?.VITE_STAGE6_MIN_RR ?? 2);
      const STAGE6_MIN_RR_HARD_GATE =
          Number.isFinite(stage6MinRrRaw) && stage6MinRrRaw > 0 ? stage6MinRrRaw : 2;
      const stage6MinExpectedReturnPctRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MIN_EXPECTED_RETURN_PCT ?? 0
      );
      const STAGE6_MIN_EXPECTED_RETURN_PCT =
          Number.isFinite(stage6MinExpectedReturnPctRaw) ? stage6MinExpectedReturnPctRaw : 0;
      const stage6MinConvictionRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MIN_CONVICTION ?? 30
      );
      const STAGE6_MIN_CONVICTION =
          Number.isFinite(stage6MinConvictionRaw) && stage6MinConvictionRaw >= 0
              ? stage6MinConvictionRaw
              : 30;
      const STAGE6_REQUIRE_BULLISH_VERDICT = parseBooleanFlag(
          (import.meta as any)?.env?.VITE_STAGE6_REQUIRE_BULLISH_VERDICT ?? 'true'
      );
      const stage6EarningsBlackoutDaysRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_EARNINGS_BLACKOUT_DAYS ?? 5
      );
      const STAGE6_EARNINGS_BLACKOUT_DAYS =
          Number.isFinite(stage6EarningsBlackoutDaysRaw) && stage6EarningsBlackoutDaysRaw >= 0
              ? stage6EarningsBlackoutDaysRaw
              : 5;
      const stage6EarningsMissingPolicyRaw = String(
          (import.meta as any)?.env?.VITE_STAGE6_EARNINGS_MISSING_POLICY ?? 'wait_price'
      )
          .trim()
          .toLowerCase();
      const STAGE6_EARNINGS_MISSING_POLICY: 'WAIT_PRICE' | 'BLOCKED_EVENT' | 'ALLOW' =
          stage6EarningsMissingPolicyRaw === 'blocked_event'
              ? 'BLOCKED_EVENT'
              : stage6EarningsMissingPolicyRaw === 'allow'
                  ? 'ALLOW'
                  : 'WAIT_PRICE';
      const stage6MinStopDistancePctRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MIN_STOP_DISTANCE_PCT ?? 1.5
      );
      const STAGE6_MIN_STOP_DISTANCE_PCT =
          Number.isFinite(stage6MinStopDistancePctRaw) && stage6MinStopDistancePctRaw > 0
              ? stage6MinStopDistancePctRaw
              : 1.5;
      const stage6MaxStopDistancePctRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MAX_STOP_DISTANCE_PCT ?? 22
      );
      const STAGE6_MAX_STOP_DISTANCE_PCT =
          Number.isFinite(stage6MaxStopDistancePctRaw) &&
          stage6MaxStopDistancePctRaw > STAGE6_MIN_STOP_DISTANCE_PCT
              ? stage6MaxStopDistancePctRaw
              : 22;
      const stage6MinTargetDistancePctRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MIN_TARGET_DISTANCE_PCT ?? 3
      );
      const STAGE6_MIN_TARGET_DISTANCE_PCT =
          Number.isFinite(stage6MinTargetDistancePctRaw) && stage6MinTargetDistancePctRaw > 0
              ? stage6MinTargetDistancePctRaw
              : 3;
      const stage6MaxAnchorExecGapPctRaw = Number(
          (import.meta as any)?.env?.VITE_STAGE6_MAX_ANCHOR_EXEC_GAP_PCT ?? 12
      );
      const STAGE6_MAX_ANCHOR_EXEC_GAP_PCT =
          Number.isFinite(stage6MaxAnchorExecGapPctRaw) && stage6MaxAnchorExecGapPctRaw > 0
              ? stage6MaxAnchorExecGapPctRaw
              : 12;
      const stage6StateVerdictPolicyRaw = String(
          (import.meta as any)?.env?.VITE_STAGE6_STATE_VERDICT_POLICY ?? 'warn'
      )
          .trim()
          .toLowerCase();
      const STAGE6_STATE_VERDICT_POLICY: 'WARN' | 'WAIT' | 'BLOCK' =
          stage6StateVerdictPolicyRaw === 'block'
              ? 'BLOCK'
              : stage6StateVerdictPolicyRaw === 'wait'
                  ? 'WAIT'
                  : 'WARN';
      const stage6StateConflictStatesRaw = String(
          (import.meta as any)?.env?.VITE_STAGE6_STATE_CONFLICT_STATES ?? 'DISTRIBUTION,MANIPULATION'
      );
      const STAGE6_STATE_CONFLICT_STATES = new Set(
          stage6StateConflictStatesRaw
              .split(',')
              .map((v) => String(v || '').trim().toUpperCase().replace(/\s+/g, '_'))
              .filter(Boolean)
      );
      const STAGE6_VERDICT_CONFLICT_FLAG = parseBooleanFlag(
          (import.meta as any)?.env?.VITE_STAGE6_VERDICT_CONFLICT_FLAG ?? 'true'
      );
      const isBullishVerdictForExecution = (verdict: string | null | undefined) => {
          const key = toVerdictKey(verdict);
          if (!key || key === 'NA' || key === 'N/A' || key === 'NONE' || key === 'NULL' || key === 'UNDEFINED' || key === 'TBD') {
              return false;
          }
          return (
              key.includes('STRONGBUY') ||
              key.includes('STRONG_BUY') ||
              key.includes('BUY') ||
              key.includes('ACCUMULATE') ||
              key.includes('SPECULATIVE_BUY') ||
              key.includes('SPECULATIVEBUY') ||
              key.includes('매수')
          );
      };
      const ENTRY_FEASIBILITY_VERDICT_ENFORCE = parseBooleanFlag(
          (import.meta as any)?.env?.VITE_ENTRY_FEASIBILITY_VERDICT_ENFORCE ?? 'true'
      );
      const toScore = (value: number, min: number, max: number) => {
          if (!Number.isFinite(value)) return min;
          if (value <= min) return min;
          if (value >= max) return max;
          return value;
      };
      const distanceToScore = (distancePct: number | null) => {
          if (distancePct == null) return 55;
          const cap = Math.max(ENTRY_FEASIBILITY_SHADOW_MAX_DISTANCE_PCT, 1);
          const clipped = Math.min(Math.max(distancePct, 0), cap * 2);
          const normalized = 1 - clipped / (cap * 2);
          return toScore(normalized * 100, 0, 100);
      };
      const earningsToScore = (daysToEvent: number | null) => {
          if (daysToEvent == null) return 70;
          if (daysToEvent < 0) return 70;
          if (daysToEvent <= STAGE6_EARNINGS_BLACKOUT_DAYS) return 0;
          if (daysToEvent <= STAGE6_EARNINGS_BLACKOUT_DAYS + 3) return 35;
          if (daysToEvent <= 15) return 75;
          return 100;
      };
      const readCanonicalEarningsDaysToEvent = (item: AlphaCandidate): number | null => {
          const candidates = [
              (item as any)?.techMetrics?.daysToEarnings,
              (item as any)?.earningsDaysToEvent,
              (item as any)?.nextEarningsInDays,
              (item as any)?.daysToEarnings,
              (item as any)?.earningsDday
          ];
          for (const raw of candidates) {
              if (raw === null || raw === undefined || raw === '') continue;
              const n = Number(raw);
              if (!Number.isFinite(n)) continue;
              return Math.round(n);
          }
          return null;
      };
      const computeExecutionScore = (params: {
          conviction: number | null;
          rr: number | null;
          expectedReturnPct: number | null;
          entryDistancePct: number | null;
          earningsDaysToEvent: number | null;
          verdictConflict: boolean;
          stateVerdictConflict: boolean;
          finalDecision: AlphaCandidate["finalDecision"];
      }): number => {
          const convictionNorm = toScore(params.conviction ?? 0, 0, 100);
          const rrNorm =
              params.rr == null
                  ? 0
                  : toScore((params.rr / Math.max(STAGE6_MIN_RR_HARD_GATE, 1)) * 100, 0, 120);
          const expectedNorm =
              params.expectedReturnPct == null
                  ? 55
                  : toScore((params.expectedReturnPct / 35) * 100, 0, 120);
          const distanceNorm = distanceToScore(params.entryDistancePct);
          const earningsNorm = earningsToScore(params.earningsDaysToEvent);
          const baseScore =
              convictionNorm * 0.30 +
              rrNorm * 0.25 +
              expectedNorm * 0.25 +
              distanceNorm * 0.15 +
              earningsNorm * 0.05;
          const structuralPenalty =
              (params.verdictConflict ? 5 : 0) +
              (params.stateVerdictConflict ? 10 : 0);
          const decisionPenalty =
              params.finalDecision === 'EXECUTABLE_NOW'
                  ? 0
                  : params.finalDecision === 'WAIT_PRICE'
                      ? 20
                      : params.finalDecision === 'BLOCKED_EVENT'
                          ? 35
                          : 45;
          return Number(toScore(baseScore - structuralPenalty - decisionPenalty, 0, 100).toFixed(1));
      };
      const verdictToScore = (verdict: string | null | undefined): number => {
          const key = toVerdictKey(verdict);
          if (!key || key === 'N/A' || key === 'NA' || key === 'NONE' || key === 'NULL' || key === 'UNDEFINED' || key === 'TBD') return 0;
          if (key.includes('STRONG_BUY') || key.includes('STRONGBUY')) return 100;
          if (key === 'BUY') return 82;
          if (key.includes('ACCUMULATE')) return 76;
          if (key === 'HOLD' || key === 'WAIT') return 45;
          if (key.includes('SELL') || key.includes('EXIT')) return 20;
          return 55;
      };
      const computeAlphaQualityScore = (params: {
          conviction: number | null;
          expectedReturnPct: number | null;
          aiVerdict: string | null | undefined;
          integrityScore: number | null;
          fundamentalScore: number | null;
          technicalScore: number | null;
          ictScore: number | null;
      }): number => {
          const convictionNorm = toScore(params.conviction ?? 0, 0, 100);
          const expectedNorm =
              params.expectedReturnPct == null
                  ? 50
                  : toScore((params.expectedReturnPct / 35) * 100, 0, 120);
          const verdictNorm = verdictToScore(params.aiVerdict);
          const integrityNorm = toScore(params.integrityScore ?? 70, 0, 100);
          const quantNorm = toScore(
              [
                  params.fundamentalScore,
                  params.technicalScore,
                  params.ictScore
              ]
                  .filter((v): v is number => Number.isFinite(Number(v)))
                  .reduce((acc, v, _, arr) => acc + Number(v) / arr.length, 0) || 50,
              0,
              100
          );
          const score =
              convictionNorm * 0.35 +
              expectedNorm * 0.20 +
              verdictNorm * 0.20 +
              integrityNorm * 0.10 +
              quantNorm * 0.15;
          return Number(toScore(score, 0, 100).toFixed(1));
      };
      const deriveExecutionContractFields = (item: AlphaCandidate) => {
          const mirroredEntry = pickFinite(item?.otePrice, item?.supportLevel, item?.entryPrice);
          const mirroredTarget = pickFinite(item?.targetMeanPrice, item?.resistanceLevel, item?.targetPrice);
          const mirroredStop = pickFinite(item?.stopLoss, item?.ictStopLoss);
          const entryAnchorPrice = pickFinite(item?.otePrice, item?.supportLevel, mirroredEntry);
          const entryExecPriceShadow = pickFinite(item?.entryPrice, entryAnchorPrice, item?.price);
          const livePrice = pickFinite(item?.price);
          const entryDistancePctShadow =
              livePrice != null && entryExecPriceShadow != null && livePrice > 0
                  ? Number((Math.abs(livePrice - entryExecPriceShadow) / livePrice * 100).toFixed(2))
                  : null;
          const stopDistancePct =
              entryExecPriceShadow != null &&
              mirroredStop != null &&
              entryExecPriceShadow > 0 &&
              mirroredStop > 0
                  ? Number((((entryExecPriceShadow - mirroredStop) / entryExecPriceShadow) * 100).toFixed(2))
                  : null;
          const targetDistancePct =
              entryExecPriceShadow != null &&
              mirroredTarget != null &&
              entryExecPriceShadow > 0 &&
              mirroredTarget > 0
                  ? Number((((mirroredTarget - entryExecPriceShadow) / entryExecPriceShadow) * 100).toFixed(2))
                  : null;
          const anchorExecGapPct =
              entryExecPriceShadow != null &&
              entryAnchorPrice != null &&
              entryExecPriceShadow > 0 &&
              entryAnchorPrice > 0
                  ? Number((Math.abs(entryExecPriceShadow - entryAnchorPrice) / entryExecPriceShadow * 100).toFixed(2))
                  : null;
          const hasPriceBox = mirroredEntry != null && mirroredTarget != null && mirroredStop != null;
          const hasGeometry = Boolean(
              hasPriceBox &&
              mirroredTarget != null &&
              mirroredEntry != null &&
              mirroredStop != null &&
              mirroredTarget > mirroredEntry &&
              mirroredStop < mirroredEntry
          );
          const entryFeasibleShadow = Boolean(
              hasGeometry &&
              entryDistancePctShadow != null &&
              entryDistancePctShadow <= ENTRY_FEASIBILITY_SHADOW_MAX_DISTANCE_PCT
          );
          const tradePlanStatusShadow: AlphaCandidate["tradePlanStatusShadow"] = !hasPriceBox
              ? 'INVALID_DATA'
              : hasGeometry
                  ? (entryFeasibleShadow ? 'VALID_EXEC' : 'WAIT_PULLBACK_TOO_DEEP')
                  : 'INVALID_GEOMETRY';
          const executionReason: AlphaCandidate["executionReason"] =
              tradePlanStatusShadow === 'VALID_EXEC'
                  ? 'VALID_EXEC'
                  : tradePlanStatusShadow === 'WAIT_PULLBACK_TOO_DEEP'
                      ? 'WAIT_PULLBACK_TOO_DEEP'
                      : tradePlanStatusShadow === 'INVALID_GEOMETRY'
                          ? 'INVALID_GEOMETRY'
                          : 'INVALID_DATA';
          const riskRewardRatioValue =
              hasGeometry && mirroredEntry != null && mirroredTarget != null && mirroredStop != null
                  ? Number(((mirroredTarget - mirroredEntry) / (mirroredEntry - mirroredStop)).toFixed(2))
                  : null;
          const expectedReturnPct = parseExpectedReturnPct(
              item?.gatedExpectedReturn ?? item?.expectedReturn ?? item?.rawExpectedReturn
          );
          const earningsDaysToEvent = readCanonicalEarningsDaysToEvent(item);
          const earningsDataMissing = earningsDaysToEvent == null;
          const aiVerdictKey = toVerdictKey(item?.aiVerdict || item?.verdictFinal || item?.finalVerdict || item?.verdict);
          const baseVerdictKey = toVerdictKey(item?.verdict || item?.verdictRaw);
          const isMeaningfulVerdict = (key: string) =>
              Boolean(
                  key &&
                  key !== 'N/A' &&
                  key !== 'NA' &&
                  key !== 'NONE' &&
                  key !== 'NULL' &&
                  key !== 'UNDEFINED' &&
                  key !== 'TBD'
              );
          const verdictConflict =
              STAGE6_VERDICT_CONFLICT_FLAG &&
              isMeaningfulVerdict(aiVerdictKey) &&
              isMeaningfulVerdict(baseVerdictKey) &&
              aiVerdictKey !== baseVerdictKey;
          const verdictConflictDetail = verdictConflict ? `${baseVerdictKey} -> ${aiVerdictKey}` : null;
          const marketStateKey = String(item?.marketState || '')
              .trim()
              .toUpperCase()
              .replace(/[\s-]+/g, '_');
          const stateVerdictConflict =
              STAGE6_STATE_CONFLICT_STATES.has(marketStateKey) &&
              isBullishVerdictForExecution(aiVerdictKey);
          const convictionScore = pickFinite(item?.convictionScore, item?.rawConvictionScore, item?.compositeAlpha);

          let finalDecision: AlphaCandidate["finalDecision"] = 'EXECUTABLE_NOW';
          let decisionReason: AlphaCandidate["decisionReason"] = 'executable_pullback';
          if (isRiskOffVerdict(aiVerdictKey)) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_verdict_risk_off';
          } else if (stateVerdictConflict && STAGE6_STATE_VERDICT_POLICY === 'BLOCK') {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_state_verdict_conflict';
          } else if (stateVerdictConflict && STAGE6_STATE_VERDICT_POLICY === 'WAIT') {
              finalDecision = 'WAIT_PRICE';
              decisionReason = 'wait_state_verdict_conflict';
          } else if (earningsDataMissing && STAGE6_EARNINGS_MISSING_POLICY === 'BLOCKED_EVENT') {
              finalDecision = 'BLOCKED_EVENT';
              decisionReason = 'blocked_earnings_data_missing';
          } else if (earningsDataMissing && STAGE6_EARNINGS_MISSING_POLICY === 'WAIT_PRICE') {
              finalDecision = 'WAIT_PRICE';
              decisionReason = 'wait_earnings_data_missing';
          } else if (
              earningsDaysToEvent != null &&
                  earningsDaysToEvent >= 0 &&
                  earningsDaysToEvent <= STAGE6_EARNINGS_BLACKOUT_DAYS
          ) {
              finalDecision = 'BLOCKED_EVENT';
              decisionReason = 'blocked_earnings_window';
          } else if (
              STAGE6_REQUIRE_BULLISH_VERDICT &&
              !isBullishVerdictForExecution(aiVerdictKey)
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_quality_verdict_unusable';
          } else if (
              convictionScore == null ||
              !Number.isFinite(convictionScore) ||
              convictionScore < STAGE6_MIN_CONVICTION
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_quality_conviction_floor';
          } else if (
              expectedReturnPct == null ||
              !Number.isFinite(expectedReturnPct)
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_quality_missing_expected_return';
          } else if (!hasPriceBox) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_missing_trade_box';
          } else if (!hasGeometry) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_invalid_geometry';
          } else if (
              stopDistancePct != null &&
              Number.isFinite(stopDistancePct) &&
              stopDistancePct < STAGE6_MIN_STOP_DISTANCE_PCT
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_stop_too_tight';
          } else if (
              stopDistancePct != null &&
              Number.isFinite(stopDistancePct) &&
              stopDistancePct > STAGE6_MAX_STOP_DISTANCE_PCT
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_stop_too_wide';
          } else if (
              targetDistancePct != null &&
              Number.isFinite(targetDistancePct) &&
              targetDistancePct < STAGE6_MIN_TARGET_DISTANCE_PCT
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_target_too_close';
          } else if (
              anchorExecGapPct != null &&
              Number.isFinite(anchorExecGapPct) &&
              anchorExecGapPct > STAGE6_MAX_ANCHOR_EXEC_GAP_PCT
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_anchor_exec_gap';
          } else if (
              riskRewardRatioValue != null &&
              Number.isFinite(riskRewardRatioValue) &&
              riskRewardRatioValue < STAGE6_MIN_RR_HARD_GATE
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_rr_below_min';
          } else if (
              expectedReturnPct != null &&
              Number.isFinite(expectedReturnPct) &&
              expectedReturnPct <= STAGE6_MIN_EXPECTED_RETURN_PCT
          ) {
              finalDecision = 'BLOCKED_RISK';
              decisionReason = 'blocked_ev_non_positive';
          } else if (executionReason === 'WAIT_PULLBACK_TOO_DEEP') {
              finalDecision = 'WAIT_PRICE';
              decisionReason = 'wait_pullback_not_reached';
          }
          const executionBucket: AlphaCandidate["executionBucket"] =
              finalDecision === 'EXECUTABLE_NOW' ? 'EXECUTABLE' : 'WATCHLIST';
          const executionScore = computeExecutionScore({
              conviction: convictionScore,
              rr: riskRewardRatioValue,
              expectedReturnPct,
              entryDistancePct: entryDistancePctShadow,
              earningsDaysToEvent,
              verdictConflict,
              stateVerdictConflict,
              finalDecision
          });
          const qualityScore = computeAlphaQualityScore({
              conviction: convictionScore,
              expectedReturnPct,
              aiVerdict: item?.aiVerdict,
              integrityScore: pickFinite(item?.integrityScore),
              fundamentalScore: pickFinite(item?.fundamentalScore),
              technicalScore: pickFinite(item?.technicalScore),
              ictScore: pickFinite(item?.ictScore)
          });
          return {
              mirroredEntry,
              mirroredTarget,
              entryAnchorPrice,
              entryExecPriceShadow,
              entryDistancePctShadow,
              stopDistancePct,
              targetDistancePct,
              anchorExecGapPct,
              entryFeasibleShadow,
              tradePlanStatusShadow,
              executionReason,
              executionBucket,
              finalDecision,
              decisionReason,
              chosenPlanType: 'PULLBACK' as const,
              executionScore,
              executionReadinessScore: executionScore,
              qualityScore,
              riskRewardRatioValue,
              expectedReturnPct,
              earningsDaysToEvent,
              verdictConflict,
              verdictConflictDetail,
              stateVerdictConflict
          };
      };

      finalData.sort((a, b) => getAlphaRankScore(b) - getAlphaRankScore(a));
      const modelRankMap = new Map<string, number>();
      finalData.forEach((item, idx) => {
          const symbolKey = normalizeContractSymbol(item?.symbol);
          if (symbolKey && !modelRankMap.has(symbolKey)) {
              modelRankMap.set(symbolKey, idx + 1);
          }
      });

      const scoredCandidates = finalData.map((item) => {
          const executionContract = deriveExecutionContractFields(item);
          return {
              ...item,
              modelRank: modelRankMap.get(normalizeContractSymbol(item?.symbol)) ?? null,
              executionRank: null,
              entryPrice: executionContract.mirroredEntry ?? item.entryPrice ?? 0,
              entryAnchorPrice: executionContract.entryAnchorPrice ?? undefined,
              entryExecPrice: executionContract.entryExecPriceShadow ?? undefined,
              entryExecPriceShadow: executionContract.entryExecPriceShadow ?? undefined,
              entryDistancePct: executionContract.entryDistancePctShadow ?? undefined,
              entryDistancePctShadow: executionContract.entryDistancePctShadow ?? undefined,
              stopDistancePct: executionContract.stopDistancePct ?? null,
              targetDistancePct: executionContract.targetDistancePct ?? null,
              anchorExecGapPct: executionContract.anchorExecGapPct ?? null,
              entryFeasible: executionContract.entryFeasibleShadow,
              entryFeasibleShadow: executionContract.entryFeasibleShadow,
              tradePlanStatusShadow: executionContract.tradePlanStatusShadow,
              executionBucket: executionContract.executionBucket,
              executionReason: executionContract.executionReason,
              finalDecision: executionContract.finalDecision,
              decisionReason: executionContract.decisionReason,
              chosenPlanType: executionContract.chosenPlanType,
              verdictConflict: executionContract.verdictConflict,
              verdictConflictDetail: executionContract.verdictConflictDetail,
              stateVerdictConflict: executionContract.stateVerdictConflict,
              executionScore: executionContract.executionScore,
              executionReadinessScore: executionContract.executionReadinessScore,
              qualityScore: executionContract.qualityScore,
              riskRewardRatioValue: executionContract.riskRewardRatioValue,
              expectedReturnPct: executionContract.expectedReturnPct,
              earningsDaysToEvent: executionContract.earningsDaysToEvent,
              targetPrice: executionContract.mirroredTarget ?? item.targetPrice ?? 0,
              targetMeanPrice: executionContract.mirroredTarget ?? item.targetMeanPrice ?? 0
          };
      });

      const hardCutBlocked = scoredCandidates.filter(item => isRiskOffVerdict(item.aiVerdict));
      const primaryPool = scoredCandidates.filter(item => !isRiskOffVerdict(item.aiVerdict));
      const modelTop6Pool = primaryPool.slice(0, 6);
      const executablePool = primaryPool.filter(item => item.executionBucket === 'EXECUTABLE');
      const executableSortedPool = [...executablePool].sort((a, b) => {
          const aScoreRaw = Number(a.executionScore);
          const bScoreRaw = Number(b.executionScore);
          const aScore = Number.isFinite(aScoreRaw) ? aScoreRaw : Number.NEGATIVE_INFINITY;
          const bScore = Number.isFinite(bScoreRaw) ? bScoreRaw : Number.NEGATIVE_INFINITY;
          if (aScore !== bScore) return bScore - aScore;
          const modelA = Number(a.modelRank);
          const modelB = Number(b.modelRank);
          const modelSafeA = Number.isFinite(modelA) ? modelA : Number.POSITIVE_INFINITY;
          const modelSafeB = Number.isFinite(modelB) ? modelB : Number.POSITIVE_INFINITY;
          if (modelSafeA !== modelSafeB) return modelSafeA - modelSafeB;
          return String(a.symbol || '').localeCompare(String(b.symbol || ''));
      });
      const watchlistPool = primaryPool.filter(item => item.executionBucket === 'WATCHLIST');
      const invalidGeometryBlocked = watchlistPool.filter(item => item.executionReason === 'INVALID_GEOMETRY');
      const modelTop6Watchlist = modelTop6Pool.filter(item => item.executionBucket === 'WATCHLIST');
      const decisionCountsPrimary = primaryPool.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.finalDecision || 'UNKNOWN').toUpperCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
      }, {});
      const decisionReasonCountsPrimary = primaryPool.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.decisionReason || 'unknown').toLowerCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
      }, {});

      let top6Elite = executableSortedPool.slice(0, 6);
      const modelTop6SymbolSet = new Set(
          modelTop6Pool.map((item) => normalizeContractSymbol(item?.symbol)).filter((symbol): symbol is string => Boolean(symbol))
      );
      const executableFallbackCount = top6Elite.reduce((acc, item) => {
          const symbolKey = normalizeContractSymbol(item?.symbol);
          if (!symbolKey) return acc;
          return modelTop6SymbolSet.has(symbolKey) ? acc : acc + 1;
      }, 0);
      const modelSummaryLine = modelTop6Pool.length > 0
          ? modelTop6Pool
              .map((item, idx) =>
                  `${idx + 1})${item.symbol}(R#${toPositiveRank(item.rankRaw) ?? 'N/A'},F#${toPositiveRank(item.rankFinal) ?? 'N/A'},M#${toPositiveRank(item.modelRank) ?? 'N/A'},E#${toPositiveRank(item.executionRank) ?? 'N/A'},AQ=${Number.isFinite(Number(item.qualityScore)) ? Number(item.qualityScore).toFixed(1) : 'N/A'},XS=${Number.isFinite(Number(item.executionScore)) ? Number(item.executionScore).toFixed(1) : 'N/A'},D=${item.finalDecision || 'N/A'},R=${item.decisionReason || item.executionReason || 'N/A'})`
              )
              .join(' | ')
          : 'none';
      addLog(`Top6(Model): ${modelSummaryLine}`, "info");
      addLog(
          `Execution-only: executable=${executablePool.length} selected=${top6Elite.length} dropped_watchlist=${watchlistPool.length}`,
          top6Elite.length === 0 ? "warn" : "ok"
      );
      if (executableFallbackCount > 0) {
          addLog(
              `Execution fill: ${executableFallbackCount} picks promoted from below model Top6 to satisfy executable-only contract.`,
              "info"
          );
      }
      addLog(
          `Decision dist(primary): EXECUTABLE_NOW=${decisionCountsPrimary.EXECUTABLE_NOW || 0} WAIT_PRICE=${decisionCountsPrimary.WAIT_PRICE || 0} BLOCKED_RISK=${decisionCountsPrimary.BLOCKED_RISK || 0} BLOCKED_EVENT=${decisionCountsPrimary.BLOCKED_EVENT || 0}`,
          "info"
      );
      addLog(
          `Decision reasons(primary): pullback_ok=${decisionReasonCountsPrimary.executable_pullback || 0} wait_pullback=${decisionReasonCountsPrimary.wait_pullback_not_reached || 0} wait_earnings_missing=${decisionReasonCountsPrimary.wait_earnings_data_missing || 0} wait_state_conflict=${decisionReasonCountsPrimary.wait_state_verdict_conflict || 0} invalid_geometry=${decisionReasonCountsPrimary.blocked_invalid_geometry || 0} missing_trade_box=${decisionReasonCountsPrimary.blocked_missing_trade_box || 0} quality_missing_er=${decisionReasonCountsPrimary.blocked_quality_missing_expected_return || 0} quality_conv_floor=${decisionReasonCountsPrimary.blocked_quality_conviction_floor || 0} quality_verdict=${decisionReasonCountsPrimary.blocked_quality_verdict_unusable || 0} stop_tight=${decisionReasonCountsPrimary.blocked_stop_too_tight || 0} stop_wide=${decisionReasonCountsPrimary.blocked_stop_too_wide || 0} target_close=${decisionReasonCountsPrimary.blocked_target_too_close || 0} anchor_gap=${decisionReasonCountsPrimary.blocked_anchor_exec_gap || 0} rr_below_min=${decisionReasonCountsPrimary.blocked_rr_below_min || 0} ev_below_min=${decisionReasonCountsPrimary.blocked_ev_non_positive || 0} earnings_missing_blocked=${decisionReasonCountsPrimary.blocked_earnings_data_missing || 0} earnings_blackout=${decisionReasonCountsPrimary.blocked_earnings_window || 0} state_conflict_blocked=${decisionReasonCountsPrimary.blocked_state_verdict_conflict || 0} risk_off_verdict=${decisionReasonCountsPrimary.blocked_verdict_risk_off || 0}`,
          "info"
      );
      const verdictConflictCountPrimary = primaryPool.filter((item) => Boolean(item.verdictConflict)).length;
      const stateVerdictConflictCountPrimary = primaryPool.filter((item) => Boolean(item.stateVerdictConflict)).length;
      if (verdictConflictCountPrimary > 0 || stateVerdictConflictCountPrimary > 0) {
          addLog(
              `Decision conflict(primary): verdict_conflict=${verdictConflictCountPrimary} state_verdict_conflict=${stateVerdictConflictCountPrimary} policy=${STAGE6_STATE_VERDICT_POLICY}`,
              "warn"
          );
      }
      const executableSummaryLine = top6Elite.length > 0
          ? top6Elite
              .map((item, idx) => `${idx + 1})${item.symbol}(R#${toPositiveRank(item.rankRaw) ?? 'N/A'},F#${toPositiveRank(item.rankFinal) ?? 'N/A'},M#${toPositiveRank(item.modelRank) ?? 'N/A'},E#${toPositiveRank(item.executionRank) ?? 'N/A'},AQ=${Number.isFinite(Number(item.qualityScore)) ? Number(item.qualityScore).toFixed(1) : 'N/A'},XS=${Number.isFinite(Number(item.executionScore)) ? Number(item.executionScore).toFixed(1) : 'N/A'})`)
              .join(' | ')
          : 'none';
      addLog(`Executable Picks: ${executableSummaryLine}`, top6Elite.length > 0 ? "ok" : "warn");
      if (modelTop6Watchlist.length > 0) {
          addLog(
              `Watchlist(Model Top6): ${modelTop6Watchlist
                  .map(
                      (item) =>
                          `${item.symbol}(R#${item.rankRaw ?? 'N/A'},F#${item.rankFinal ?? 'N/A'},M#${item.modelRank ?? 'N/A'},E#${item.executionRank ?? 'N/A'}):${String(item.finalDecision || 'N/A')}/${String(item.decisionReason || item.executionReason || 'N/A')}`
                  )
                  .join(', ')}`,
              "warn"
          );
      }
      const watchlistReasonCounts = watchlistPool.reduce<Record<string, number>>((acc, item) => {
          const reason = String(item.decisionReason || item.executionReason || 'unknown').toLowerCase();
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
      }, {});
      addLog(
          `Execution-only reasons: executable_pullback=${decisionReasonCountsPrimary.executable_pullback || 0} wait_pullback_not_reached=${watchlistReasonCounts.wait_pullback_not_reached || 0} wait_earnings_data_missing=${watchlistReasonCounts.wait_earnings_data_missing || 0} wait_state_verdict_conflict=${watchlistReasonCounts.wait_state_verdict_conflict || 0} blocked_quality_missing_expected_return=${watchlistReasonCounts.blocked_quality_missing_expected_return || 0} blocked_quality_conviction_floor=${watchlistReasonCounts.blocked_quality_conviction_floor || 0} blocked_quality_verdict_unusable=${watchlistReasonCounts.blocked_quality_verdict_unusable || 0} blocked_stop_too_tight=${watchlistReasonCounts.blocked_stop_too_tight || 0} blocked_stop_too_wide=${watchlistReasonCounts.blocked_stop_too_wide || 0} blocked_target_too_close=${watchlistReasonCounts.blocked_target_too_close || 0} blocked_anchor_exec_gap=${watchlistReasonCounts.blocked_anchor_exec_gap || 0} blocked_rr_below_min=${watchlistReasonCounts.blocked_rr_below_min || 0} blocked_invalid_geometry=${watchlistReasonCounts.blocked_invalid_geometry || 0} blocked_missing_trade_box=${watchlistReasonCounts.blocked_missing_trade_box || 0} blocked_ev_non_positive=${watchlistReasonCounts.blocked_ev_non_positive || 0} blocked_earnings_data_missing=${watchlistReasonCounts.blocked_earnings_data_missing || 0} blocked_earnings_window=${watchlistReasonCounts.blocked_earnings_window || 0} blocked_state_verdict_conflict=${watchlistReasonCounts.blocked_state_verdict_conflict || 0}`,
          "info"
      );
      if (hardCutBlocked.length > 0) {
          addLog(`Hard Gate: Excluded ${hardCutBlocked.length} risk-off verdict names from primary Top6 queue.`, "ok");
      }
      if (watchlistPool.length > 0) {
          addLog(`Execution-only: ${watchlistPool.length} watchlist names excluded (no fallback).`, "warn");
      }

      // Pre-detail pass: keep original AI narrative untouched.
      // Structure normalization happens only after the Top6 detail synthesis step.
      top6Elite = top6Elite.map(item => ({
          ...item,
          selectionReasons: normalizeTop6SelectionReasons(item)
      }));

      top6Elite.forEach((item) => {
          const rawConv = Number(item.rawConvictionScore ?? item.convictionScore ?? 0);
          const gatedConv = Number(item.convictionScore ?? 0);
          const rawEr = item.rawExpectedReturn || item.expectedReturn || 'TBD';
          const gatedEr = item.gatedExpectedReturn || item.expectedReturn || 'TBD';
          addLog(
              `[AUDIT] ${item.symbol} | TP ${item.tradePlanStatus || 'VALID'}/${item.tradePlanSource || 'RAW'} | Conv ${rawConv.toFixed(1)}→${gatedConv.toFixed(1)} | ER ${rawEr}→${gatedEr} | ${item.aiVerdict || 'N/A'}`,
              "info"
          );
      });

      // [TOP6 DETAIL PASS] Keep Top12 AI lightweight; generate rich Neural Outlook only for final Top6.
      if (top6Elite.length > 0) {
          try {
              const detailProvider = usedProvider === ApiProvider.GEMINI ? ApiProvider.GEMINI : ApiProvider.PERPLEXITY;
              const detailResult = await generateTop6NeuralOutlook(top6Elite, detailProvider);
              if (detailResult?.data && Array.isArray(detailResult.data) && detailResult.data.length > 0) {
                  const detailMap = new Map(detailResult.data.map((d: any) => [
                      String(d?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase(),
                      d
                  ]));
                  top6Elite = top6Elite.map(item => {
                      const clean = String(item?.symbol || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
                      const detail = detailMap.get(clean);
                      if (!detail) return item;
                      return {
                          ...item,
                          investmentOutlook: enforceOutlookTradeBoxConsistency(
                              detail.investmentOutlook || item.investmentOutlook || '',
                              item
                          ),
                          selectionReasons: Array.isArray(detail.selectionReasons) && detail.selectionReasons.length >= 3
                              ? detail.selectionReasons
                              : item.selectionReasons,
                          analysisLogic: detail.analysisLogic || item.analysisLogic
                      };
                  });
                  addLog("Top6 Neural Investment Outlook Detail Applied.", "ok");
              } else if (detailResult?.error) {
                  addLog(`Top6 Detail Pass skipped: ${detailResult.error}`, "warn");
              }
          } catch (detailError: any) {
              addLog(`Top6 Detail Pass failed: ${detailError.message}`, "warn");
          }
      } else {
          addLog("Top6 Detail Pass skipped: no executable candidates selected.", "warn");
      }

      // Ensure deterministic 3-reason format and 1/2/3 Neural Outlook structure after detail pass.
      let postDetailStructuredInjected = 0;
      top6Elite = top6Elite.map(item => {
          const normalizedOutlook = ensureStructuredOutlook(item.investmentOutlook || '', item);
          if (normalizedOutlook !== String(item.investmentOutlook || '')) {
              postDetailStructuredInjected++;
          }
          return {
              ...item,
              investmentOutlook: normalizedOutlook,
              selectionReasons: normalizeTop6SelectionReasons(item)
          };
      });
      if (postDetailStructuredInjected > 0) {
          addLog(`Top6 Outlook Guard(Post-Detail): structured 1/2/3 template normalized for ${postDetailStructuredInjected} names.`, "warn");
      }

      // [CONTRACT STABILITY] Mirror fields for downstream consumers (no score/rank impact).
      let entryFeasibilityDowngradedCount = 0;
      top6Elite = top6Elite.map(item => {
          const verdictRaw = String(item?.aiVerdict || item?.verdict || item?.finalVerdict || 'HOLD');
          const candidateVerdict = String(item?.finalVerdict || item?.aiVerdict || item?.verdict || 'HOLD');
          const executionContract = deriveExecutionContractFields(item);
          const shouldDowngradeByFeasibility =
              ENTRY_FEASIBILITY_VERDICT_ENFORCE &&
              executionContract.tradePlanStatusShadow !== 'VALID_EXEC' &&
              !isRiskOffVerdict(candidateVerdict);
          if (shouldDowngradeByFeasibility) {
              entryFeasibilityDowngradedCount++;
          }
          // Keep Stage6 verdicts canonical (no WAIT code in final contract).
          const verdictFinal = shouldDowngradeByFeasibility ? 'HOLD' : candidateVerdict;
          return {
              ...item,
              verdictRaw,
              verdictFinal,
              aiVerdict: verdictFinal,
              verdict: verdictFinal,
              finalVerdict: verdictFinal,
              entryPrice: executionContract.mirroredEntry ?? 0,
              entryAnchorPrice: executionContract.entryAnchorPrice ?? undefined,
              entryExecPrice: executionContract.entryExecPriceShadow ?? undefined,
              entryExecPriceShadow: executionContract.entryExecPriceShadow ?? undefined,
              entryDistancePct: executionContract.entryDistancePctShadow ?? undefined,
              entryDistancePctShadow: executionContract.entryDistancePctShadow ?? undefined,
              stopDistancePct: executionContract.stopDistancePct ?? null,
              targetDistancePct: executionContract.targetDistancePct ?? null,
              anchorExecGapPct: executionContract.anchorExecGapPct ?? null,
              entryFeasible: executionContract.entryFeasibleShadow,
              entryFeasibleShadow: executionContract.entryFeasibleShadow,
              tradePlanStatusShadow: executionContract.tradePlanStatusShadow,
              executionBucket: executionContract.executionBucket,
              executionReason: executionContract.executionReason,
              finalDecision: executionContract.finalDecision,
              decisionReason: executionContract.decisionReason,
              chosenPlanType: executionContract.chosenPlanType,
              verdictConflict: executionContract.verdictConflict,
              verdictConflictDetail: executionContract.verdictConflictDetail,
              stateVerdictConflict: executionContract.stateVerdictConflict,
              executionScore: executionContract.executionScore,
              executionReadinessScore: executionContract.executionReadinessScore,
              qualityScore: executionContract.qualityScore,
              riskRewardRatioValue: executionContract.riskRewardRatioValue,
              expectedReturnPct: executionContract.expectedReturnPct,
              earningsDaysToEvent: executionContract.earningsDaysToEvent,
              targetPrice: executionContract.mirroredTarget ?? 0,
              targetMeanPrice: executionContract.mirroredTarget ?? 0
          };
      });
      const executionRankMap = new Map<string, number>();
      top6Elite
          .filter((item) => item.executionBucket === 'EXECUTABLE')
          .sort((a, b) => {
              const aScoreRaw = Number(a.executionScore);
              const bScoreRaw = Number(b.executionScore);
              const aScore = Number.isFinite(aScoreRaw) ? aScoreRaw : Number.NEGATIVE_INFINITY;
              const bScore = Number.isFinite(bScoreRaw) ? bScoreRaw : Number.NEGATIVE_INFINITY;
              if (aScore !== bScore) return bScore - aScore;
              const aRank = Number(a.modelRank ?? Number.POSITIVE_INFINITY);
              const bRank = Number(b.modelRank ?? Number.POSITIVE_INFINITY);
              const safeRankA = Number.isFinite(aRank) ? aRank : Number.POSITIVE_INFINITY;
              const safeRankB = Number.isFinite(bRank) ? bRank : Number.POSITIVE_INFINITY;
              return safeRankA - safeRankB;
          })
          .forEach((item, idx) => {
              const symbolKey = normalizeContractSymbol(item?.symbol);
              if (symbolKey) executionRankMap.set(symbolKey, idx + 1);
          });
      top6Elite = top6Elite.map((item) => {
          const symbolKey = normalizeContractSymbol(item?.symbol);
          const executionRank =
              item.executionBucket === 'EXECUTABLE' ? (executionRankMap.get(symbolKey) ?? null) : null;
          return {
              ...item,
              executionRank
          };
      });
      if (ENTRY_FEASIBILITY_VERDICT_ENFORCE) {
          addLog(
              `Entry Feasibility Verdict Gate: downgraded ${entryFeasibilityDowngradedCount} names to HOLD (maxDistancePct=${ENTRY_FEASIBILITY_SHADOW_MAX_DISTANCE_PCT}).`,
              entryFeasibilityDowngradedCount > 0 ? "warn" : "ok"
          );
      }
      const decisionCountsTop6 = top6Elite.reduce<Record<string, number>>((acc, item) => {
          const key = String(item.finalDecision || 'UNKNOWN').toUpperCase();
          acc[key] = (acc[key] || 0) + 1;
          return acc;
      }, {});
      addLog(
          `Decision dist(top6): EXECUTABLE_NOW=${decisionCountsTop6.EXECUTABLE_NOW || 0} WAIT_PRICE=${decisionCountsTop6.WAIT_PRICE || 0} BLOCKED_RISK=${decisionCountsTop6.BLOCKED_RISK || 0} BLOCKED_EVENT=${decisionCountsTop6.BLOCKED_EVENT || 0}`,
          "info"
      );
      stage6ModelTop6Ref.current = modelTop6Pool.map((item) => ({ ...item }));
      stage6WatchlistTopRef.current = modelTop6Watchlist.map((item) => ({ ...item }));
      stage6ExecutableRef.current = top6Elite.map((item) => ({ ...item }));
      stage6FinalRef.current = top6Elite;
      stage6FinalRunIdRef.current = getKstTimestamp();
      const displaySymbolSet = new Set<string>();
      const stage6DisplayCandidates: AlphaCandidate[] = [];
      for (const item of top6Elite) {
          const symbolKey = normalizeContractSymbol(item?.symbol) || `EXEC_${stage6DisplayCandidates.length}`;
          if (displaySymbolSet.has(symbolKey)) continue;
          displaySymbolSet.add(symbolKey);
          stage6DisplayCandidates.push(item);
      }
      for (const item of modelTop6Watchlist) {
          const symbolKey = normalizeContractSymbol(item?.symbol) || `WATCH_${stage6DisplayCandidates.length}`;
          if (displaySymbolSet.has(symbolKey)) continue;
          displaySymbolSet.add(symbolKey);
          stage6DisplayCandidates.push(item);
      }

      const top6ProviderSet = Array.from(new Set(top6Elite.map(item => String(item?.aiProvider || 'UNKNOWN').toUpperCase())));
      if (usedProvider === ApiProvider.GEMINI && top6ProviderSet.some(p => p.includes('PERPLEXITY'))) {
          addLog(`[WARN] Engine Audit Mismatch: manifest actual=${usedProvider}, but Top6 providers include ${top6ProviderSet.join(', ')}`, "warn");
      }
      if (usedProvider === ApiProvider.PERPLEXITY && top6ProviderSet.some(p => p.includes('GEMINI'))) {
          addLog(`[WARN] Engine Audit Mismatch: manifest actual=${usedProvider}, but Top6 providers include ${top6ProviderSet.join(', ')}`, "warn");
      }

      setResultsCache(prev => ({ ...prev, [usedProvider]: stage6DisplayCandidates }));
      // [FIX] Keep selectedStock payload in sync with freshly updated Top6 objects.
      // Without this, detail panel can show stale pre-detail outlook text even when cards/logs are updated.
      setSelectedStock(prev => {
          if (!top6Elite.length) return prev;
          if (!prev) return top6Elite[0];
          const refreshed = top6Elite.find(item => item.symbol === prev.symbol);
          return refreshed || top6Elite[0];
      });
      
      // Archive Stage 2 Result (Full AI Result)
      if (accessToken) {
          // Save Full AI Result to Report Folder
          const reportFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportSubFolder);
          // Save scored + execution-contract enriched snapshot (Top12 scope) for audit reproducibility.
          await uploadFile(accessToken, reportFolderId, `STAGE6_PART2_AI_RESULT_FULL_${getKstTimestamp()}.json`, scoredCandidates);

          // [CRITICAL] Save Final Top 6 to Stage 6 Folder (The "Dump")
          const stage6FolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage6SubFolder);
          const top6AuditTrail = top6Elite.map(item => ({
              symbol: item.symbol,
              tradePlanStatus: item.tradePlanStatus || 'VALID',
              tradePlanSource: item.tradePlanSource || 'RAW',
              rawConvictionScore: Number(item.rawConvictionScore ?? item.convictionScore ?? 0),
              gatedConvictionScore: Number(item.convictionScore ?? 0),
              rawExpectedReturn: item.rawExpectedReturn || item.expectedReturn || 'TBD',
              gatedExpectedReturn: item.gatedExpectedReturn || item.expectedReturn || 'TBD',
              aiVerdict: item.aiVerdict || 'N/A',
              verdictRaw: item.verdictRaw || item.verdict || 'N/A',
              verdictFinal: item.verdictFinal || item.aiVerdict || 'N/A',
              verdictConflict: Boolean(item.verdictConflict),
              verdictConflictDetail: item.verdictConflictDetail || null,
              stateVerdictConflict: Boolean(item.stateVerdictConflict),
              finalDecision: item.finalDecision || 'N/A',
              decisionReason: item.decisionReason || 'N/A',
              chosenPlanType: item.chosenPlanType || 'N/A',
              rankRaw: Number.isFinite(Number(item.rankRaw)) ? Number(item.rankRaw) : null,
              rankFinal: Number.isFinite(Number(item.rankFinal)) ? Number(item.rankFinal) : null,
              modelRank: Number.isFinite(Number(item.modelRank)) ? Number(item.modelRank) : null,
              executionRank: Number.isFinite(Number(item.executionRank))
                  ? Number(item.executionRank)
                  : null,
              executionScore: Number.isFinite(Number(item.executionScore))
                  ? Number(item.executionScore)
                  : null,
              qualityScore: Number.isFinite(Number(item.qualityScore))
                  ? Number(item.qualityScore)
                  : null,
              stopDistancePct: Number.isFinite(Number(item.stopDistancePct))
                  ? Number(item.stopDistancePct)
                  : null,
              targetDistancePct: Number.isFinite(Number(item.targetDistancePct))
                  ? Number(item.targetDistancePct)
                  : null,
              anchorExecGapPct: Number.isFinite(Number(item.anchorExecGapPct))
                  ? Number(item.anchorExecGapPct)
                  : null,
              riskRewardRatioValue: Number.isFinite(Number(item.riskRewardRatioValue))
                  ? Number(item.riskRewardRatioValue)
                  : null,
              expectedReturnPct: Number.isFinite(Number(item.expectedReturnPct))
                  ? Number(item.expectedReturnPct)
                  : null,
              earningsDaysToEvent: Number.isFinite(Number(item.earningsDaysToEvent))
                  ? Number(item.earningsDaysToEvent)
                  : null,
              finalGateState: item.finalGateState || 'OPEN',
              finalGateBonus: Number(item.finalGateBonus || 0),
              finalGatePenalty: Number(item.finalGatePenalty || 0)
          }));
          const toExecutionContractItem = (item: any) => ({
              symbol: item?.symbol || 'N/A',
              name: item?.name || 'N/A',
              sector: item?.sectorTheme || item?.sector || 'N/A',
              aiVerdict: item?.aiVerdict || item?.verdictFinal || item?.finalVerdict || 'N/A',
              finalDecision: item?.finalDecision || 'N/A',
              decisionReason: item?.decisionReason || item?.executionReason || 'N/A',
              executionBucket: item?.executionBucket || 'WATCHLIST',
              executionReason: item?.executionReason || item?.tradePlanStatusShadow || 'N/A',
              entryAnchorPrice: Number.isFinite(Number(item?.entryAnchorPrice))
                  ? Number(item.entryAnchorPrice)
                  : null,
              entryExecPrice: Number.isFinite(Number(item?.entryExecPrice ?? item?.entryExecPriceShadow))
                  ? Number(item.entryExecPrice ?? item.entryExecPriceShadow)
                  : null,
              targetPrice: Number.isFinite(Number(item?.targetPrice ?? item?.targetMeanPrice))
                  ? Number(item.targetPrice ?? item.targetMeanPrice)
                  : null,
              stopPrice: Number.isFinite(Number(item?.stopLoss ?? item?.ictStopLoss))
                  ? Number(item.stopLoss ?? item.ictStopLoss)
                  : null,
              entryDistancePct: Number.isFinite(Number(item?.entryDistancePct ?? item?.entryDistancePctShadow))
                  ? Number(item.entryDistancePct ?? item.entryDistancePctShadow)
                  : null,
              stopDistancePct: Number.isFinite(Number(item?.stopDistancePct))
                  ? Number(item.stopDistancePct)
                  : null,
              targetDistancePct: Number.isFinite(Number(item?.targetDistancePct))
                  ? Number(item.targetDistancePct)
                  : null,
              anchorExecGapPct: Number.isFinite(Number(item?.anchorExecGapPct))
                  ? Number(item.anchorExecGapPct)
                  : null,
              rankRaw: Number.isFinite(Number(item?.rankRaw)) ? Number(item.rankRaw) : null,
              rankFinal: Number.isFinite(Number(item?.rankFinal)) ? Number(item.rankFinal) : null,
              modelRank: Number.isFinite(Number(item?.modelRank)) ? Number(item.modelRank) : null,
              executionRank: Number.isFinite(Number(item?.executionRank)) ? Number(item.executionRank) : null,
              qualityScore: Number.isFinite(Number(item?.qualityScore)) ? Number(item.qualityScore) : null,
              convictionScore: Number.isFinite(Number(item?.convictionScore))
                  ? Number(item.convictionScore)
                  : null,
              rawConvictionScore: Number.isFinite(Number(item?.rawConvictionScore))
                  ? Number(item.rawConvictionScore)
                  : Number.isFinite(Number(item?.convictionScore))
                      ? Number(item.convictionScore)
                      : null,
              executionScore: Number.isFinite(Number(item?.executionScore)) ? Number(item.executionScore) : null,
              riskRewardRatioValue: Number.isFinite(Number(item?.riskRewardRatioValue))
                  ? Number(item.riskRewardRatioValue)
                  : null,
              expectedReturnPct: Number.isFinite(Number(item?.expectedReturnPct))
                  ? Number(item.expectedReturnPct)
                  : null,
              earningsDaysToEvent: Number.isFinite(Number(item?.earningsDaysToEvent))
                  ? Number(item.earningsDaysToEvent)
                  : null,
              verdictConflict: Boolean(item?.verdictConflict),
              stateVerdictConflict: Boolean(item?.stateVerdictConflict)
          });
          const decisionReasonCountsTop6 = top6Elite.reduce<Record<string, number>>((acc, item) => {
              const key = String(item?.decisionReason || item?.executionReason || 'unknown').toLowerCase();
              acc[key] = (acc[key] || 0) + 1;
              return acc;
          }, {});

          const finalPayload = {
              manifest: { 
                  version: "9.9.9", 
                  count: top6Elite.length, 
                  timestamp: new Date().toISOString(), 
                  strategy: "Neural_Alpha_Sieve", 
                  engine: usedProvider,
                  engineRequested: requestedProvider,
                  engineActual: usedProvider,
                  engineResponse: responseUsedProviderRaw || null,
                  engineFallbackUsed:
                      requestedProvider !== usedProvider ||
                      /FALLBACK|SHARDED|REPAIR/i.test(responseUsedProviderRaw || ''),
                  engineFallbackPath:
                      requestedProvider === usedProvider ? 'DIRECT' : `${requestedProvider} -> ${usedProvider}`,
                  engineProvidersInTop6: Array.from(
                      new Set(top6Elite.map(item => String(item?.aiProvider || 'UNKNOWN')))
                  ),
                  aiCoverageRequested: candidates.length,
                  aiCoverageMatched: matchedAiCount,
                  aiCoverageVerified: verifiedAiCount,
                  aiCoverageFallback: fallbackAiCount,
                  sourceStage5File: stage5SourceRef.current?.fileName || null,
                  sourceStage5LockMode: stage5SourceRef.current?.lockMode || 'LATEST',
                  sourceStage5Hash: stage5SourceRef.current?.hash || null,
                  sourceStage5Symbols: stage5SourceRef.current?.symbols || [],
                  sourceStage5Count: stage5SourceRef.current?.count || candidates.length,
                  sourceStage5Timestamp: stage5SourceRef.current?.timestamp || null,
                  hardGateRiskOffExcluded: hardCutBlocked.length,
                  hardGateInvalidGeometryExcluded: invalidGeometryBlocked.length,
                  decisionCountsPrimary,
                  decisionCountsTop6,
                  modelTop6Symbols: modelTop6Pool.map((item) => item.symbol),
                  executablePickSymbols: top6Elite.map((item) => item.symbol),
                  modelTop6WatchlistSymbols: modelTop6Watchlist.map((item) => item.symbol),
                  executableFallbackCount,
                  decisionGate: {
                      minRr: STAGE6_MIN_RR_HARD_GATE,
                      minExpectedReturnPct: STAGE6_MIN_EXPECTED_RETURN_PCT,
                      minConviction: STAGE6_MIN_CONVICTION,
                      requireBullishVerdict: STAGE6_REQUIRE_BULLISH_VERDICT,
                      earningsBlackoutDays: STAGE6_EARNINGS_BLACKOUT_DAYS,
                      earningsMissingPolicy: STAGE6_EARNINGS_MISSING_POLICY,
                      minStopDistancePct: STAGE6_MIN_STOP_DISTANCE_PCT,
                      maxStopDistancePct: STAGE6_MAX_STOP_DISTANCE_PCT,
                      minTargetDistancePct: STAGE6_MIN_TARGET_DISTANCE_PCT,
                      maxAnchorExecGapPct: STAGE6_MAX_ANCHOR_EXEC_GAP_PCT,
                      stateVerdictPolicy: STAGE6_STATE_VERDICT_POLICY,
                      stateConflictStates: Array.from(STAGE6_STATE_CONFLICT_STATES),
                      verdictConflictFlag: STAGE6_VERDICT_CONFLICT_FLAG,
                      executionRankBasis: "execution_score"
                  },
                  scoreViewDefault: scoreViewMode
              },
              execution_contract: {
                  generatedAt: new Date().toISOString(),
                  modelTop6: modelTop6Pool.map(toExecutionContractItem),
                  executablePicks: top6Elite.map(toExecutionContractItem),
                  watchlistTop: modelTop6Watchlist.map(toExecutionContractItem),
                  decisionCountsPrimary,
                  decisionCountsTop6,
                  decisionReasonCountsPrimary,
                  decisionReasonCountsTop6
              },
              alpha_candidates: top6Elite,
              audit_trail: top6AuditTrail
          };
          const stage6FinalFileName = `STAGE6_ALPHA_FINAL_${getKstTimestamp()}.json`;
          const stage6FinalHash = fnv1aHash(JSON.stringify(finalPayload));
          await uploadFile(accessToken, stage6FolderId, stage6FinalFileName, finalPayload);
          (window as any).__STAGE6_DISPATCH_INFO = {
              stage6File: stage6FinalFileName,
              stage6Hash: stage6FinalHash,
              sourceRunId: stage6FinalRunIdRef.current || getKstTimestamp(),
              generatedAt: new Date().toISOString(),
              candidateCount: top6Elite.length
          };
          addLog(
              `[STAGE6_DISPATCH] file=${stage6FinalFileName} hash=${stage6FinalHash.slice(0, 12)} sourceRun=${stage6FinalRunIdRef.current || 'N/A'}`,
              "info"
          );
          addLog(`Final Elite Candidates archived to Drive (count=${top6Elite.length}).`, "ok");
      }

      return top6Elite;
  };

  // [NEW] Stage 3: Reporting
  const runStage3 = async (aiResults: AlphaCandidate[], marketPulse?: any) => {
      addLog("STAGE 3: Generating Final Report...", "signal");
      
      const resultsToCheck = aiResults;
      
      if (resultsToCheck.length > 0) {
          addLog("AUTO-PILOT: Generating Hedge Fund Brief for Telegram...", "signal");
          
          let telegramPayload = ""; 
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Telegram Brief Timeout")), 15000));
          
          try {
              const brainToUse = stage2ProviderRef.current || selectedBrain; 
              const telegramContext = resolveTelegramBriefContext();
              const briefPromise = generateTelegramBrief(resultsToCheck, brainToUse, marketPulse, telegramContext);
              const brief = await Promise.race([briefPromise, timeout]) as string;

              const contractCheck = checkTelegramContractIntegrity(resultsToCheck, brief);
              if (!contractCheck.ok) {
                  addLog(
                      `TELEGRAM_CONTRACT_MISMATCH: ${contractCheck.mismatches[0] || 'unknown mismatch'}`,
                      "err"
                  );
                  contractCheck.mismatches.slice(1, 4).forEach((m) => addLog(`[CONTRACT_DIFF] ${m}`, "warn"));
                  throw new Error(`TELEGRAM_CONTRACT_MISMATCH (${contractCheck.mismatches.length})`);
              }
              
              telegramPayload = brief;
              addLog("Brief Generated. Relaying...", "ok");

              if (accessToken) {
                const fileName = `TELEGRAM_BRIEF_REPORT_${getKstTimestamp()}.md`;
                const archivedBrief = buildTelegramMessage(brief);
                await archiveReport(accessToken, fileName, archivedBrief);
                addLog("Telegram Brief Archived to Drive.", "ok");
              }

          } catch (e: any) {
              addLog(`Brief Gen Failed: ${e.message}. Sending plain status.`, "err");
              telegramPayload = "Telegram Brief Generation Failed. Check logs.";
          }

          return telegramPayload;
      } else {
           throw new Error("No Alpha Candidates found for reporting.");
      }
  };

  // [NEW] Auto Pilot Orchestrator (In-Memory Data Chaining)
  const runAutoPilot = async () => {
      if (loading) return;
      setLoading(true);
      setAutoPhase('ENGINE');

      try {
          // Step 0: Load Initial Data (Memory or Drive)
          let currentData = elite50;
          if (!currentData || currentData.length === 0) {
              addLog("Memory Empty. Fetching Stage 5 Data from Vault...", "info");
              currentData = await loadStage5Data(); 
              if (!currentData || currentData.length === 0) throw new Error("Stage 5 Data Not Found");
          }

          // [NEW] Deep Data Enrichment (Drive Injection) - MOVED TO STAGE 3
          // if (accessToken) {
          //     currentData = await enrichCandidatesWithDriveData(currentData, accessToken);
          // }

          // [NEW] Batch Enrichment to prevent Rate Limits
          addLog(`Starting Deep Data Enrichment for ${currentData.length} tickers...`, "info");
          const enrichedData = await enrichAllCandidates(currentData);

          // Pipeline Execution
          const result1 = await runStage1(enrichedData);
          await new Promise(r => setTimeout(r, 3000)); 

          const result2 = await runStage2(result1);
          await new Promise(r => setTimeout(r, 3000)); 

          // [CRITICAL SAFETY] Autopilot Kill Switch
          // If AI analysis failed (TBD verdicts), DO NOT send Telegram report.
          const isAiValid = result2.slice(0, 3).every((item: any) => 
              item.aiVerdict && item.aiVerdict !== "TBD" && item.investmentOutlook && item.investmentOutlook.length > 10
          );

          if (!isAiValid) {
              addLog("CRITICAL: AI Analysis Failed or Incomplete. Aborting Telegram Report to prevent misinformation.", "err");
              setAutoPhase('DONE'); // Stop here
              if (onComplete) onComplete(toAutoControlPayload("AI_FAILED_NO_REPORT"));
              return; 
          }

          addLog("AUTO-PILOT: Skipping Deep Matrix Audit (Token Saver)...", "signal");
          setAutoPhase('MATRIX');
          

          // [NEW] Hydrate with Market Pulse for Report (Robust Recovery)
          let pulse = (window as any).latestMarketPulse;
          if (!pulse) {
              const cached = sessionStorage.getItem('LATEST_MARKET_PULSE');
              if (cached) pulse = JSON.parse(cached);
          }
          
          // Ensure VIX is present
          if (!pulse || !pulse.vix) {
              // Final Last-Ditch Fetch
              try { pulse = await fetchMarketBenchmarks(); } catch(e) {}
          }

          let finalDataForReport = [...result2];


          if (pulse) {
              // Inject SPY/QQQ/VIX as dummy candidates so generateTelegramBrief can find them
              finalDataForReport.push({
                  symbol: 'SPY',
                  price: pulse.spy.price,
                  changePercent: pulse.spy.change,
                  name: 'S&P 500 ETF',
                  compositeAlpha: 0
              } as any);
              finalDataForReport.push({
                  symbol: 'QQQ',
                  price: pulse.qqq.price,
                  changePercent: pulse.qqq.change,
                  name: 'Invesco QQQ Trust',
                  compositeAlpha: 0
              } as any);
               if (pulse.vix) {
                  finalDataForReport.push({
                      symbol: 'VIX',
                      price: pulse.vix.price,
                      changePercent: 0,
                      name: 'Volatility Index',
                      compositeAlpha: 0
                  } as any);
              }
              addLog("Market Pulse Data Hydrated into Report Pipeline.", "info");
          }

          const result3 = await runStage3(finalDataForReport, pulse);
          
          setAutoPhase('DONE');
          if (onComplete) onComplete(result3);

      } catch (e: any) {
          if (e.message === "MANUAL_STOP_REQUIRED") {
              // Handled
          } else {
              addLog(`AutoPilot Failed: ${e.message}`, "err");
              if (onComplete) onComplete(toAutoControlPayload("STAGE6_FAILED"));
          }
      } finally {
          setLoading(false);
      }
  };







  const handleRunMatrixAudit = async (brain: ApiProvider) => {
    if (matrixLoading) return;
    setMatrixBrain(brain); // UI Update
    
    // Safety check: if we switched brains, we need to look up the correct cache
    // [FIX] Check ALL caches to ensure we find data regardless of which brain succeeded
    const { items: resultsToCheck, source: sourceTag } = resolveStage6OutputSource();

    if (resultsToCheck.length === 0) {
        addLog("Error: Execute Alpha Engine first to generate data.", "err");
        return;
    }
    setMatrixLoading(true);
    let targetBrain = brain;
    addLog(`Synthesizing Portfolio Matrix via ${targetBrain}...`, "signal");
    addLog(
        `[AUDIT_SYNC] Matrix source locked: ${sourceTag} (${resultsToCheck.length})${stage6FinalRunIdRef.current ? ` run=${stage6FinalRunIdRef.current}` : ''}`,
        "info"
    );
    
    try {
        let report = await analyzePipelineStatus({
            currentStage: 6,
            apiStatuses: [],
            recommendedData: resultsToCheck,
            mode: 'PORTFOLIO',
            targetStock: undefined 
        }, targetBrain);
        
        if ((report.includes("FAILURE") || report.includes("ERROR")) && targetBrain === ApiProvider.GEMINI) {
             if (report.includes("429") || report.includes("Quota")) {
                 addLog("Gemini Quota Exceeded. Switching Matrix Engine to Sonar...", "warn");
             }
             
             setMatrixBrain(ApiProvider.PERPLEXITY); // Toggle UI
             
             if (autoStart) {
                 // Auto-Pilot: Retry immediately
                 targetBrain = ApiProvider.PERPLEXITY;
                 addLog("AUTO-PILOT: Retrying Matrix with Sonar...", "signal");
                 report = await analyzePipelineStatus({
                    currentStage: 6,
                    apiStatuses: [],
                    recommendedData: resultsToCheck,
                    mode: 'PORTFOLIO',
                    targetStock: undefined 
                 }, targetBrain);
             } else {
                 // Manual mode: Stop here, just switch toggle
                 addLog("Gemini Audit Failed. Switched to Sonar. Click Execute to retry.", "warn");
                 setMatrixLoading(false);
                 return;
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

        addLog("Portfolio Matrix Audit complete.","ok");
    } catch (e: any) { 
        addLog(`Matrix Error: ${e.message}`, "err"); 
    } finally { 
        setMatrixLoading(false); 
    }
  };

  const handleManualTelegramSend = async () => {
    if (sendingTelegram) return;
    const { items: resultsToSend, source: sourceTag } = resolveStage6OutputSource();
    if (resultsToSend.length === 0) {
        addLog("No data to transmit. Run Alpha Engine first.", "err");
        return;
    }

    setSendingTelegram(true);
    addLog("Manual Command: Generating Telegram Brief...", "signal");
    addLog(
        `[AUDIT_SYNC] Telegram source locked: ${sourceTag} (${resultsToSend.length})${stage6FinalRunIdRef.current ? ` run=${stage6FinalRunIdRef.current}` : ''}`,
        "info"
    );

    try {
        const marketPulse = (window as any).latestMarketPulse;
        const telegramContext = resolveTelegramBriefContext();
        const brief = await generateTelegramBrief(
            resultsToSend,
            stage2ProviderRef.current || selectedBrain,
            marketPulse,
            telegramContext
        );

        const contractCheck = checkTelegramContractIntegrity(resultsToSend, brief);
        if (!contractCheck.ok) {
            addLog(
                `TELEGRAM_CONTRACT_MISMATCH: ${contractCheck.mismatches[0] || 'unknown mismatch'}`,
                "err"
            );
            contractCheck.mismatches.slice(1, 4).forEach((m) => addLog(`[CONTRACT_DIFF] ${m}`, "warn"));
            await archiveTelegramIntegrityFailure(
                'MANUAL',
                resultsToSend,
                brief,
                contractCheck,
                `TELEGRAM_CONTRACT_MISMATCH (${contractCheck.mismatches.length})`
            );
            addLog("Telegram Integrity Gate blocked transmission.", "err");
            return;
        }
        
        if(accessToken) {
            const timestamp = getKstTimestamp();
            const fileName = `TELEGRAM_BRIEF_REPORT_${timestamp}.md`;
            const archivedBrief = buildTelegramMessage(brief);
            await archiveReport(accessToken, fileName, archivedBrief);
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

      // [SIMULATION TELEGRAM ROUTE] Send simulation result to dedicated chat channel.
      const simulationSummary = [
        "🧪 Simulation Execution Update",
        `Symbol: ${stock.symbol} (${stock.name || '-'})`,
        `Period: ${data.simulationPeriod || '-'}`,
        `WinRate: ${safeMetrics.winRate} | PF: ${safeMetrics.profitFactor}`,
        `MDD: ${safeMetrics.maxDrawdown} | Sharpe: ${safeMetrics.sharpeRatio}`,
        `DataSource: ${isRealData ? 'REAL' : 'AI_SIM'}`
      ].join("\n");

      try {
        const simSent = await sendSimulationTelegramReport(simulationSummary);
        if (simSent) addLog(`[SIM_TG] Simulation report sent for ${stock.symbol}.`, "ok");
        else addLog(`[SIM_TG] Simulation report send failed for ${stock.symbol}.`, "warn");
      } catch (simErr: any) {
        addLog(`[SIM_TG] Simulation telegram error: ${simErr?.message || 'unknown error'}`, "warn");
      }
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
      return v.replace(/[^a-zA-Z0-9_가-힣]/g, '').toUpperCase().trim();
  };

  const translateVerdict = (v?: string) => {
    const text = cleanVerdict(v);
    if (!text) return "분석 중";
    if (text.includes('STRONGSELL') || text.includes('적극매도')) return '적극 매도';
    if (text.includes('STRONG') || text.includes('강력') || text.includes('적극')) return '강력 매수';
    if (text === 'BUY' || text === '매수' || text.includes('LONG')) return '매수';
    if (text.includes('ACCUMULATE') || text.includes('비중') || text.includes('확대')) return '비중 확대';
    if (text.includes('HOLD') || text.includes('NEUTRAL') || text.includes('관망') || text.includes('보유')) return '관망';
    if (text === 'SELL' || text === '매도' || text.includes('청산') || text.includes('EXIT')) return '매도';
    if (text.includes('RISK') || text.includes('SPECULATIVE') || text.includes('투기') || text.includes('위험')) return '고위험';
    return /[가-힣]/.test(text) ? v! : "대기";
  };

  const getVerdictStyle = (v?: string) => {
    const text = cleanVerdict(v);
    if (text.includes('STRONGSELL') || text.includes('적극매도'))
        return 'bg-blue-800 text-white border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.35)] font-black tracking-wider';
    if (text.includes('STRONG') || text.includes('강력') || text.includes('적극')) 
        return 'bg-gradient-to-r from-red-600 to-rose-600 text-white border-red-500 shadow-[0_0_20px_rgba(220,38,38,0.6)] font-black tracking-wider animate-pulse';
    if (text.includes('BUY') || text.includes('매수') || text.includes('LONG')) 
        return 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] font-black tracking-wide';
    if (text.includes('RISK') || text.includes('고위험') || text.includes('SPECULATIVE') || text.includes('투기') || text.includes('위험')) 
        return 'bg-violet-600 text-white border-violet-500 shadow-lg font-bold';
    if (text.includes('ACCUMULATE') || text.includes('HOLD') || text.includes('비중') || text.includes('보유') || text.includes('관망') || text.includes('물량') || text.includes('중립')) 
        return 'bg-slate-600 text-slate-200 border-slate-500 font-bold';
    if (text.includes('SELL') || text.includes('매도') || text.includes('청산') || text.includes('EXIT')) 
        return 'bg-blue-700 text-white border-blue-500 font-bold';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  };

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

  const copyReport = () => {
    if (selectedStock?.investmentOutlook) {
      navigator.clipboard.writeText(selectedStock.investmentOutlook);
      alert("Report copied to clipboard.");
    }
  };
  
  // [NEW] Safe Check for isVisible + isHeadless to prevent Recharts warnings in CI
  const shouldRenderChart = isVisible && !isHeadless;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-in fade-in duration-700">
      <div className="xl:col-span-3 space-y-6">
        <div className={`glass-panel p-6 md:p-8 rounded-[40px] border-t-2 shadow-2xl transition-all duration-500 border-t-rose-500`}>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20 shadow-inner`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-rose-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Sieve Engine</h2>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 mt-2 w-fit">
                    <button onClick={() => setActiveTab('INDIVIDUAL')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'INDIVIDUAL' ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Individual Analysis</button>
                    <button onClick={() => setActiveTab('MATRIX')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${activeTab === 'MATRIX' ? 'bg-rose-800 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Portfolio Matrix</button>
                </div>
                 {autoStart && <span className="text-[8px] mt-1 px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse block w-fit">AUTO PILOT</span>}
              </div>
            </div>
            
            <div className="flex gap-4">
              {activeTab === 'INDIVIDUAL' && (
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    {[ApiProvider.GEMINI, ApiProvider.PERPLEXITY].map((p) => (
                    <button key={p} onClick={() => setSelectedBrain(p)} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${selectedBrain === p ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500'}`}>
                        {p === ApiProvider.GEMINI ? 'Gemini 3 Pro' : 'Sonar Pro'}
                    </button>
                    ))}
                </div>
              )}
              {activeTab === 'INDIVIDUAL' && (
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                    <button
                      onClick={() => setScoreViewMode('GATED')}
                      className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${scoreViewMode === 'GATED' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                      Gated
                    </button>
                    <button
                      onClick={() => setScoreViewMode('RAW')}
                      className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${scoreViewMode === 'RAW' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                      Raw
                    </button>
                </div>
              )}
              {activeTab === 'INDIVIDUAL' && (
                  <button onClick={handleExecuteEngine} disabled={loading} className={`px-8 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-slate-800 animate-pulse text-slate-500' : 'bg-rose-600 text-white hover:brightness-110 active:scale-95 shadow-rose-900/20'}`}>
                    {loading ? 'Synthesizing...' : 'Execute Alpha Engine'}
                  </button>
              )}
            </div>
          </div>

          {activeTab === 'INDIVIDUAL' && (
            <div className="mb-6 p-3 rounded-2xl border border-cyan-500/20 bg-cyan-950/10 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[9px] font-black uppercase tracking-widest text-cyan-300">Stage5 Lock Mode</span>
                <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={releaseStage5LockFromUi}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                      !stage5LockEnabled ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500'
                    }`}
                  >
                    Latest
                  </button>
                  <button
                    onClick={applyStage5LockFromUi}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                      stage5LockEnabled ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500'
                    }`}
                  >
                    Locked
                  </button>
                </div>
                {stage5LockEnabled && (
                  <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1">
                    LOCK ACTIVE
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                <select
                  value={stage5LockSelectedId}
                  onChange={(e) => setStage5LockSelectedId(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-slate-200 focus:outline-none focus:border-cyan-400"
                >
                  <option value="" className="bg-slate-900 text-slate-300">
                    {stage5LockListLoading ? 'Stage5 목록 로딩 중...' : '잠글 Stage5 파일 선택 (최신순)'}
                  </option>
                  {stage5LockOptions.map(file => (
                    <option key={file.id} value={file.id} className="bg-slate-900 text-slate-200">
                      {file.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={loadStage5LockOptions}
                  className="px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wide bg-cyan-700/70 hover:bg-cyan-600 text-white border border-cyan-500/30 transition-all"
                >
                  Refresh
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Latest: 최신 Stage5 자동 잠금 / Locked: 선택한 Stage5 파일 강제 사용 (수동·오토 동일 입력 검증)
              </p>
              {stage5LockSelectedId && (
                <p className="text-[9px] text-cyan-300/90 break-all">
                  Selected: {stage5LockOptions.find(file => file.id === stage5LockSelectedId)?.name || stage5LockFileName}
                </p>
              )}
            </div>
          )}
          
          {activeTab === 'INDIVIDUAL' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {currentResults.length > 0 ? [...executableResults, ...watchlistResults].map((item, index) => {
                if (!item) return null;
                const showExecutableHeader = index === 0 && executableResults.length > 0;
                const showWatchlistHeader = index === executableResults.length && watchlistResults.length > 0;
                const isSelected = selectedStock?.symbol === item.symbol;
                const isAuditRunning = analyzingSymbols.has(item.symbol);
                const rtData = realtimePrices[item.symbol];
                const displayPrice = rtData?.price || item.price;
                const flashClass = rtData?.direction === 'up' ? 'bg-emerald-500/20 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                                 : rtData?.direction === 'down' ? 'bg-rose-500/20 border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]' 
                                 : '';
                
                // [NEW] Consensus Check
                const isConsensus = resultsCache[ApiProvider.GEMINI]?.some(c => c.symbol === item.symbol) && resultsCache[ApiProvider.PERPLEXITY]?.some(c => c.symbol === item.symbol);
                
                // [NEW] Badge Conditions (Fault Tolerant & Cross-Validated)
                const showInstitutional = (item.heldPercentInstitutions ?? item.instOwn ?? 0) >= 60;
                const showDiscount = item.isConfirmedDiscount === true;
                const showHyperGrowth = (item.revenueGrowth ?? 0) >= 50;
                const showGem = item.isConfirmedGem === true;

                // [NEW] Alpha Conviction & Visual Effects
                // Formula: (ICT Score * 0.4) + (Fundamental Score * 0.3) + (Technical Score * 0.2) + (AI Conviction * 0.1)
                const rawAiScore = getDisplayConvictionScore(item, scoreViewMode);
                // If AI score is exactly 50 (fallback), use ICT score as proxy for AI sentiment to avoid "neutral" dragging down good stocks
                const baseAiScore = rawAiScore === 50 ? (item.ictScore || 50) : rawAiScore;
                const effectiveAiScore = isRiskOffVerdict(item.aiVerdict) ? Math.min(baseAiScore, 55) : baseAiScore;
                const displayExpectedReturn = getDisplayExpectedReturn(item, scoreViewMode);
                const entryAnchorCard = Number(item.entryAnchorPrice || item.otePrice || item.supportLevel || 0);
                const entryExecCard = Number(item.entryExecPrice || item.entryExecPriceShadow || item.entryPrice || entryAnchorCard || 0);
                const entryDistanceRaw = Number(item.entryDistancePct ?? item.entryDistancePctShadow);
                const entryDistanceCard = Number.isFinite(entryDistanceRaw)
                    ? entryDistanceRaw
                    : (Number(displayPrice) > 0 && entryExecCard > 0
                        ? Number((Math.abs(Number(displayPrice) - entryExecCard) / Number(displayPrice) * 100).toFixed(2))
                        : null);
                const entryFeasibleCard =
                    typeof item.entryFeasible === 'boolean'
                        ? item.entryFeasible
                        : (typeof item.entryFeasibleShadow === 'boolean' ? item.entryFeasibleShadow : null);
                const tradePlanStatusCard = String(item.tradePlanStatusShadow || item.tradePlanStatus || 'N/A');
                const tradePlanStatusLabel = getTradePlanStatusLabel(tradePlanStatusCard);
                const modelRankCard = toPositiveRank(item.modelRank);
                const executionRankCard = toPositiveRank(item.executionRank);
                const executionBucketCard =
                    item.executionBucket === 'EXECUTABLE' ? 'EXECUTABLE' : 'WATCHLIST';
                const finalDecisionCardRaw = String(item.finalDecision || '').toUpperCase();
                const finalDecisionCard = finalDecisionCardRaw || (executionBucketCard === 'EXECUTABLE' ? 'EXECUTABLE_NOW' : 'WAIT_PRICE');
                const finalDecisionSignalKey = getDecisionSignalKey(finalDecisionCard);
                const finalDecisionLabel = getDecisionLabel(finalDecisionCard);
                const finalDecisionBadgeClass =
                    finalDecisionCard === 'EXECUTABLE_NOW'
                        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/35'
                        : finalDecisionCard === 'WAIT_PRICE'
                            ? 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/35'
                            : finalDecisionCard === 'BLOCKED_RISK'
                                ? 'bg-rose-500/20 text-rose-200 border-rose-500/30 hover:bg-rose-500/35'
                                : 'bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/30 hover:bg-fuchsia-500/35';
                const decisionReasonCard = String(item.decisionReason || '').toLowerCase().trim();
                const decisionReasonSignalKey = getDecisionReasonSignalKey(decisionReasonCard);
                const decisionReasonLabel = getDecisionReasonLabel(decisionReasonCard);
                const parseRrFromLabel = (raw: any): number | null => {
                    const txt = String(raw || '');
                    const ratio = txt.match(/1\s*[:/]\s*([0-9]+(?:\.[0-9]+)?)/i);
                    if (ratio) {
                        const n = Number(ratio[1]);
                        return Number.isFinite(n) ? n : null;
                    }
                    const decimal = txt.match(/([0-9]+(?:\.[0-9]+)?)/);
                    if (decimal) {
                        const n = Number(decimal[1]);
                        return Number.isFinite(n) ? n : null;
                    }
                    return null;
                };
                const parsePct = (raw: any): number | null => {
                    const txt = String(raw || '');
                    const m = txt.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
                    if (!m) return null;
                    const n = Number(m[1]);
                    return Number.isFinite(n) ? n : null;
                };
                const rrCardRaw = Number(item.riskRewardRatioValue);
                const rrCard = Number.isFinite(rrCardRaw) ? rrCardRaw : parseRrFromLabel(item.riskRewardRatio);
                const expectedReturnPctCardRaw = Number(item.expectedReturnPct);
                const expectedReturnPctCard = Number.isFinite(expectedReturnPctCardRaw)
                    ? expectedReturnPctCardRaw
                    : parsePct(displayExpectedReturn);
                const executionScoreCardRaw = Number(item.executionScore);
                const executionScoreCard = Number.isFinite(executionScoreCardRaw) ? executionScoreCardRaw : null;
                const qualityScoreCardRaw = Number(item.qualityScore);
                const qualityScoreCard = Number.isFinite(qualityScoreCardRaw)
                    ? qualityScoreCardRaw
                    : (Number.isFinite(Number(item.convictionScore)) ? Number(item.convictionScore) : null);
                const earningsDaysRaw = Number(item.earningsDaysToEvent ?? item.techMetrics?.daysToEarnings);
                const earningsDaysCard = Number.isFinite(earningsDaysRaw) ? Math.round(earningsDaysRaw) : null;
                
                // [MODIFIED] Calculate Quant System Score (Weighted Average)
                const quantSystemScore = (
                    ((item.ictScore || 0) * 0.4) + 
                    ((item.fundamentalScore || 0) * 0.3) + 
                    ((item.technicalScore || 0) * 0.2) + 
                    (effectiveAiScore * 0.1)
                ).toFixed(1);
                
                // [CRITICAL] Visual Signal Synchronization (Fact + AI Consensus)
                // Only glow if Smart Money Flow > 90 (Stage 5 Data) AND AI Confirms (Stage 6)
                const isNeonGlow = item.isConfirmedSmartMoney === true && !isRiskOffVerdict(item.aiVerdict);
                const isTopPick = modelRankCard != null ? modelRankCard <= 2 : index < 2;

                return (
                  <React.Fragment key={`${item.symbol || 'N/A'}-${index}`}>
                    {showExecutableHeader && (
                      <div className="col-span-full mb-1 mt-1 px-3 py-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 text-[10px] font-black uppercase tracking-wider">
                        Executable Picks ({executableResults.length})
                      </div>
                    )}
                    {showWatchlistHeader && (
                      <div className="col-span-full mb-1 mt-3 px-3 py-2 rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-200 text-[10px] font-black uppercase tracking-wider">
                        Watchlist ({watchlistResults.length})
                      </div>
                    )}
                  <div 
                    onClick={() => handleStockClick(item)} 
                    style={{ transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}
                    className={`glass-panel p-6 rounded-[35px] border cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col min-h-[280px] ${
                        flashClass || (
                            isSelected ? 'border-emerald-400 bg-emerald-500/10 shadow-xl ring-2 ring-emerald-400/50 z-10' : 
                            (isTopPick ? 'border-red-500/60 bg-red-500/5 shadow-[0_0_30px_rgba(220,38,38,0.25)] animate-pulse' : 
                            (isNeonGlow ? 'shadow-[0_0_25px_rgba(251,191,36,0.2)] border-amber-400/40 bg-amber-500/5 hover:bg-amber-500/10' : 
                            'border-white/5 bg-black/40 hover:bg-white/5'))
                        )
                    } ${isConsensus && !isSelected && !isTopPick ? 'shadow-[0_0_15px_rgba(245,158,11,0.15)]' : ''}`}
                  >
                    {/* [FIX] Use shouldRenderChart to ensure component is not rendered when hidden/headless */}
                    {shouldRenderChart && ((loading && isSelected) || isAuditRunning) && (
                      <div className="absolute inset-0 bg-black/60 z-20 flex items-center justify-center flex-col gap-2 backdrop-blur-sm">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest animate-pulse">
                            {isAuditRunning ? 'Auditing...' : 'Analyzing Asset...'}
                        </span>
                      </div>
                    )}
                    
                    {/* [NEW] Header Layout: Two Layers (Absolute Protection for Ticker) */}
                    <div className="flex flex-col gap-1 mb-3">
                        {/* Layer 1: Badges (Left Aligned) */}
                        <div className="flex w-full min-w-0 flex-wrap gap-1 mb-2 min-h-[16px]">
                             {isTopPick && (
                                 <span 
                                    onClick={(e) => handleSignalClick(e, 'FINALIST')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-red-500/20 text-red-200 border border-red-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-red-500/40 transition-colors"
                                 >
                                    FINALIST
                                 </span>
                             )}
                             {!!showInstitutional && (
                                <span 
                                    onClick={(e) => handleSignalClick(e, 'INSTITUTIONAL')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-blue-500/20 text-blue-200 border border-blue-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-blue-500/40 transition-colors"
                                >
                                    INSTITUTIONAL
                                </span>
                             )}
                             {!!showDiscount && (
                                <span 
                                    onClick={(e) => handleSignalClick(e, 'DISCOUNT')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-emerald-500/40 transition-colors"
                                >
                                    DISCOUNT
                                </span>
                             )}
                             {!!showHyperGrowth && (
                                <span 
                                    onClick={(e) => handleSignalClick(e, 'HYPER_GROWTH')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-rose-500/20 text-rose-200 border border-rose-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-rose-500/40 transition-colors"
                                >
                                    HYPER GROWTH
                                </span>
                             )}
                             {!!showGem && (
                                <span 
                                    onClick={(e) => handleSignalClick(e, 'HIDDEN_GEM')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-purple-500/20 text-purple-200 border border-purple-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-purple-500/40 transition-colors"
                                >
                                    GEM
                                </span>
                             )}
                             {!!isConsensus && (
                                <span 
                                    onClick={(e) => handleSignalClick(e, 'CROSS_CHECK')}
                                    className="text-[7px] px-1.5 py-0.5 rounded-sm bg-amber-500/20 text-amber-200 border border-amber-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-amber-500/40 transition-colors"
                                >
                                    AI CONSENSUS
                                </span>
                             )}
                        </div>

                        {/* Layer 2: Ticker (Left) vs Price (Right) */}
                        <div className="flex justify-between items-end gap-2 border-b border-white/5 pb-2">
                            <div className="flex min-w-0 flex-1 flex-col text-left pr-2">
                                <div className="flex items-baseline gap-2">
                                    <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none shrink-0">{item.symbol}</h4>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter truncate max-w-[140px] mt-0.5">{item.name}</span>
                                <div className="flex w-full min-w-0 flex-wrap items-center gap-1 mt-1">
                                    <span
                                        onClick={(e) => handleSignalClick(e, 'MODEL_RANK')}
                                        className="text-[7px] px-1.5 py-0.5 rounded-sm bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-cyan-500/35 transition-colors"
                                    >
                                        Model #{modelRankCard ?? 'N/A'}
                                    </span>
                                    <span
                                        onClick={(e) => handleSignalClick(e, 'EXEC_RANK')}
                                        className="text-[7px] px-1.5 py-0.5 rounded-sm bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-black tracking-tight whitespace-nowrap cursor-help hover:bg-indigo-500/35 transition-colors"
                                    >
                                        Exec #{executionRankCard ?? 'N/A'}
                                    </span>
                                    <span
                                        onClick={(e) => handleSignalClick(e, executionBucketCard)}
                                        className={`text-[7px] px-1.5 py-0.5 rounded-sm border font-black tracking-tight whitespace-nowrap cursor-help transition-colors ${
                                        executionBucketCard === 'EXECUTABLE'
                                            ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30 hover:bg-emerald-500/35'
                                            : 'bg-amber-500/20 text-amber-200 border-amber-500/30 hover:bg-amber-500/35'
                                    }`}>
                                        {executionBucketCard}
                                    </span>
                                    <span
                                        onClick={(e) => handleSignalClick(e, finalDecisionSignalKey)}
                                        className={`text-[7px] px-1.5 py-0.5 rounded-sm border font-black tracking-tight whitespace-nowrap cursor-help transition-colors ${finalDecisionBadgeClass}`}
                                    >
                                        {finalDecisionLabel}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex shrink-0 min-w-[74px] flex-col justify-end items-end gap-0.5 ml-auto h-[45px]">
                                <div 
                                    className="flex items-center gap-1 mb-1 whitespace-nowrap leading-none cursor-help group"
                                    onClick={(e) => handleSignalClick(e, 'CONVEXITY')} // Using Convexity as proxy or Conviction
                                >
                                    <span 
                                        className="text-[7px] font-black text-slate-500 uppercase tracking-widest group-hover:text-amber-400 transition-colors"
                                        onClick={(e) => handleSignalClick(e, 'CONVICTION')}
                                    >
                                        ALPHA CONVICTION
                                    </span>
                                    <span className={`text-[9px] font-black ${effectiveAiScore > 90 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
                                        {effectiveAiScore}
                                    </span>
                                </div>
                                {rtData && <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest animate-pulse">LIVE</span>}
                                <span className={`text-xl font-mono font-black tracking-tighter ${rtData?.direction === 'up' ? 'text-emerald-400' : rtData?.direction === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>
                                    ${(Number(displayPrice) || 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* [NEW] Sector Line: Fallback & Single Line Enforcement */}
                    <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-3 font-bold whitespace-nowrap overflow-hidden text-ellipsis">
                        {cleanMarkdown(item.sectorTheme || item.sector || 'Alpha Strategic Asset')}
                    </p>

                    <div className="grid grid-cols-3 gap-2 py-3 bg-black/50 rounded-2xl border border-white/10 flex-grow items-center shadow-inner mb-3">
                      <div className="text-center">
                          <p className="text-[8px] text-emerald-500 font-black uppercase">{item.otePrice ? "🎯 ICT OTE" : "Entry"}</p>
                          <p className="text-[12px] font-black text-white tracking-tighter">${(item.otePrice || item.supportLevel)?.toFixed(1) || '---'}</p>
                      </div>
                      <div className="text-center border-x border-white/10">
                          <p className="text-[8px] text-blue-500 font-black uppercase">Target</p>
                          <p className="text-[12px] font-black text-white tracking-tighter">${item.resistanceLevel?.toFixed(1) || '---'}</p>
                      </div>
                      <div className="text-center">
                          <p className="text-[8px] text-rose-500 font-black uppercase">{item.ictStopLoss ? "🛡️ ICT Stop" : "Stop"}</p>
                          <p className="text-[12px] font-black text-white tracking-tighter">${(item.ictStopLoss || item.stopLoss)?.toFixed(1) || '---'}</p>
                      </div>
                    </div>

                    <div className={`mb-2 px-2 py-1 rounded-lg border text-[8px] font-bold tracking-tight ${
                      entryFeasibleCard === true
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : (entryFeasibleCard === false
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            : 'border-white/10 bg-white/5 text-slate-300')
                    }`}>
                      <span className="uppercase">Execution</span>
                      <span className="mx-1">|</span>
                      <span>실행가 ${entryExecCard > 0 ? entryExecCard.toFixed(1) : 'N/A'}</span>
                      <span className="mx-1">|</span>
                      <span>괴리 {entryDistanceCard == null ? 'N/A' : `${entryDistanceCard.toFixed(2)}%`}</span>
                      <span className="mx-1">|</span>
                      <span
                        onClick={(e) => handleSignalClick(e, 'EXEC_ROW_STATUS')}
                        className="cursor-help underline decoration-dotted underline-offset-2"
                      >
                        {tradePlanStatusLabel}
                      </span>
                      <span className="mx-1">|</span>
                      <span
                        onClick={(e) => handleSignalClick(e, decisionReasonSignalKey || 'EXEC_ROW_REASON')}
                        className="cursor-help underline decoration-dotted underline-offset-2"
                      >
                        {decisionReasonLabel}
                      </span>
                    </div>
                    <div className="mb-2 grid grid-cols-5 gap-2 text-[8px]">
                      <div
                        onClick={(e) => handleSignalClick(e, 'AQ_SCORE')}
                        className="px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-200 font-semibold cursor-help hover:bg-amber-500/20 transition-colors"
                      >
                        AQ {qualityScoreCard == null ? 'N/A' : qualityScoreCard.toFixed(1)}
                      </div>
                      <div
                        onClick={(e) => handleSignalClick(e, 'XS_SCORE')}
                        className="px-2 py-1 rounded-md border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 font-semibold cursor-help hover:bg-indigo-500/20 transition-colors"
                      >
                        XS {executionScoreCard == null ? 'N/A' : executionScoreCard.toFixed(1)}
                      </div>
                      <div
                        onClick={(e) => handleSignalClick(e, 'RR_RATIO')}
                        className="px-2 py-1 rounded-md border border-cyan-500/20 bg-cyan-500/10 text-cyan-200 font-semibold cursor-help hover:bg-cyan-500/20 transition-colors"
                      >
                        RR {rrCard == null ? 'N/A' : rrCard.toFixed(2)}
                      </div>
                      <div
                        onClick={(e) => handleSignalClick(e, 'ER_PERCENT')}
                        className="px-2 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-emerald-200 font-semibold cursor-help hover:bg-emerald-500/20 transition-colors"
                      >
                        ER% {expectedReturnPctCard == null ? 'N/A' : `${expectedReturnPctCard.toFixed(0)}%`}
                      </div>
                      <div
                        onClick={(e) => handleSignalClick(e, 'EARNINGS_DDAY')}
                        className="px-2 py-1 rounded-md border border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-200 font-semibold cursor-help hover:bg-fuchsia-500/20 transition-colors"
                      >
                        EARN {earningsDaysCard == null ? 'N/A' : `D-${earningsDaysCard}`}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center mt-auto">
                      <div className="flex flex-col min-w-0 flex-1 mr-2">
                        <span className="text-[7px] font-black text-slate-600 uppercase tracking-widest mb-0.5 truncate">EXP. RETURN</span>
                        <span className="text-[9px] font-black text-emerald-400 italic truncate">{cleanMarkdown(displayExpectedReturn || "TBD")}</span>
                      </div>
                      <span className={`px-2 py-1 rounded text-[7px] font-black uppercase border shadow-md whitespace-nowrap ${getVerdictStyle(item.aiVerdict)}`}>{translateVerdict(item.aiVerdict)}</span>
                    </div>
                  </div>
                  </React.Fragment>
                );
              }) : <div className="col-span-full py-24 text-center opacity-30 text-xs font-black uppercase tracking-[0.6em] italic">Awaiting Alpha Protocol Signal...</div>}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="flex justify-between items-center bg-black/40 p-2 rounded-2xl border border-white/5">
                    <div className="flex gap-2">
                        <button onClick={() => setMatrixBrain(ApiProvider.GEMINI)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.GEMINI ? 'bg-rose-600 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
                            Gemini 3 Pro
                        </button>
                        <button onClick={() => setMatrixBrain(ApiProvider.PERPLEXITY)} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${matrixBrain === ApiProvider.PERPLEXITY ? 'bg-rose-500 text-white shadow-lg' : 'text-slate-500 hover:bg-white/5'}`}>
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
                        {cleanMatrixInsightText(matrixReports[matrixBrain])}
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
                    <button onClick={() => handleRunMatrixAudit(matrixBrain)} disabled={matrixLoading} className={`px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${matrixLoading ? 'bg-slate-800 text-slate-500' : matrixBrain === ApiProvider.GEMINI ? 'bg-rose-600 text-white hover:scale-105' : 'bg-rose-500 text-white hover:scale-105'}`}>
                        {matrixLoading ? 'Processing...' : 'Execute Strategic Analysis'}
                    </button>
                 </div>
               )}
            </div>
          )}
        </div>
        
        {/* Render rest of the UI ... */}
        {activeTab === 'INDIVIDUAL' && selectedStock && (
             <div key={selectedStock.symbol} className="glass-panel p-8 rounded-[50px] bg-slate-950 border-t-2 border-t-rose-600 animate-in fade-in slide-in-from-bottom-8 duration-700 shadow-3xl">
                 <div className="flex flex-col lg:flex-row items-end gap-6 mb-8">
                    <div className="flex flex-col">
                        <h3 className="text-6xl font-black text-white italic tracking-tighter leading-none uppercase">{selectedStock.symbol}</h3>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">{selectedStock.name}</p>
                    </div>
                    <div className="ml-auto bg-black/40 px-8 py-4 rounded-[30px] border border-white/10 text-center shadow-inner min-w-[160px]">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">QUANT SYSTEM SCORE</p>
                        <p className="text-2xl font-black text-emerald-400 italic">
                            {/* Display the calculated weighted average score */}
                            {(() => {
                                const rawAi = getDisplayConvictionScore(selectedStock, scoreViewMode);
                                const effAi = rawAi === 50 ? (selectedStock.ictScore || 50) : rawAi;
                                return (
                                    ((selectedStock.ictScore || 0) * 0.4) + 
                                    ((selectedStock.fundamentalScore || 0) * 0.3) + 
                                    ((selectedStock.technicalScore || 0) * 0.2) + 
                                    (effAi * 0.1)
                                ).toFixed(1);
                            })()}%
                        </p>
                    </div>
                 </div>
                 
                 <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                     <div className="lg:col-span-3 space-y-8">
                         {/* CHART & REPORT */}
                         <div className="bg-black rounded-[40px] border border-white/5 aspect-video overflow-hidden shadow-2xl relative group">
                            <iframe title="TradingView" src={`https://s.tradingview.com/widgetembed/?symbol=${selectedStock.symbol}&interval=D&theme=dark&style=1`} className="w-full h-full opacity-90 border-none" />
                         </div>

                          <div className="p-8 bg-white/5 rounded-[40px] border border-white/10 shadow-inner">
                            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                                <h4 className="text-sm font-black italic tracking-widest text-rose-500 border-b-2 border-rose-500/50 pb-1 inline-block whitespace-nowrap">
                                    NEURAL INVESTMENT OUTLOOK
                                </h4>
                                <div className="flex gap-3 ml-auto">
                                    <button onClick={copyReport} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all">Copy Report</button>
                                </div>
                            </div>
                            
                            {/* [MODIFIED] Legendary Investor Strategies UI Box */}
                            <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 border border-white/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                                    <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                </div>
                                <h5 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Multi-Legendary Strategy Applied
                                </h5>
                                <p className="text-[11px] text-slate-300 leading-relaxed font-medium relative z-10">
                                    이전 단계에서 넘어온 50개의 종목들 중에 분석 기법을 지금 있는 분석 로직에 추가적으로 
                                    <span className="text-white font-bold"> 벤저민 그레이엄</span>(가치투자), 
                                    <span className="text-white font-bold"> 피터 린치</span>(PEG 성장주), 
                                    <span className="text-white font-bold"> 워렌 버핏</span>(내재가치), 
                                    <span className="text-white font-bold"> 윌리엄 오닐</span>(CANSLIM), 
                                    <span className="text-white font-bold"> 찰리 멍거</span>(우량주 장기투자), 
                                    <span className="text-white font-bold"> 글렌 웰링</span>(행동주의), 
                                    <span className="text-white font-bold"> 캐시 우드</span>(파괴적 혁신), 
                                    <span className="text-white font-bold"> 글렌 그린버그</span>(안전마진 집중투자) 
                                    등의 전략을 복합적으로 적용하여 최종 6종목을 추출하였습니다.
                                </p>
                            </div>

                            <div className="min-h-[200px]">
                                {selectedStock.investmentOutlook ? (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                        {cleanInsightText(removeCitations(selectedStock.investmentOutlook))}
                                    </ReactMarkdown>
                                ) : (
                                    <p className="italic opacity-50 text-[11px] text-slate-500 mt-4">[AI 전략 엔진 가동 중: 펀더멘털 기반 분석 데이터 대기 중]</p>
                                )}
                            </div>
                        </div>
                     </div>
                     <div className="lg:col-span-2 space-y-6 relative">
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
                                    {/* [FIX] Ensure data exists before rendering to prevent crash */}
                                    {quantMetrics.radarData && quantMetrics.radarData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={quantMetrics.radarData}>
                                                <PolarGrid stroke="#334155" opacity={0.2} />
                                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} />
                                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                <Radar name={selectedStock.symbol} dataKey="A" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.2} />
                                                <RechartsTooltip 
                                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} 
                                                    itemStyle={{ color: '#10b981', fontSize: '10px' }} 
                                                    formatter={(value: any) => Number(value).toFixed(2)}
                                                />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                                            No Radar Data Available
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* [NEW] Hybrid Alpha Signals Chips (Fault Tolerant & Cross-Validated) */}
                        <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner">
                            <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Hybrid Alpha Signals</h4>
                            <div className="flex flex-wrap gap-2">
                                {!!selectedStock.spyAlpha && <span onClick={(e) => handleSignalClick(e, 'MOMENTUM')} className="px-3 py-1 bg-blue-900/30 border border-blue-500/30 text-blue-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-blue-900/50 transition-colors">SPY Alpha</span>}
                                {!!selectedStock.qqqAlpha && <span onClick={(e) => handleSignalClick(e, 'MOMENTUM')} className="px-3 py-1 bg-violet-900/30 border border-violet-500/30 text-violet-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-violet-900/50 transition-colors">QQQ Alpha</span>}
                                {!!((selectedStock.heldPercentInstitutions ?? selectedStock.instOwn ?? 0) >= 60) && <span onClick={(e) => handleSignalClick(e, 'INSTITUTIONAL')} className="px-3 py-1 bg-indigo-900/30 border border-indigo-500/30 text-indigo-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-indigo-900/50 transition-colors">Institutional Entry</span>}
                                {!!((selectedStock.revenueGrowth ?? 0) >= 50) && <span onClick={(e) => handleSignalClick(e, 'HYPER_GROWTH')} className="px-3 py-1 bg-emerald-900/30 border border-emerald-500/30 text-emerald-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-emerald-900/50 transition-colors">Hyper Growth</span>}
                                {!!selectedStock.isTechnicalBreakout && <span onClick={(e) => handleSignalClick(e, 'MOMENTUM')} className="px-3 py-1 bg-rose-900/30 border border-rose-500/30 text-rose-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-rose-900/50 transition-colors">Tech Breakout</span>}
                                {!!selectedStock.sectorRankBonus && <span onClick={(e) => handleSignalClick(e, 'MOMENTUM')} className="px-3 py-1 bg-amber-900/30 border border-amber-500/30 text-amber-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-amber-900/50 transition-colors">Sector Leader</span>}
                                {!!(selectedStock.isConfirmedDiscount === true) && <span onClick={(e) => handleSignalClick(e, 'DISCOUNT')} className="px-3 py-1 bg-teal-900/30 border border-teal-500/30 text-teal-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-teal-900/50 transition-colors">Discount Zone</span>}
                                {!!(selectedStock.isConfirmedGem === true) && <span onClick={(e) => handleSignalClick(e, 'HIDDEN_GEM')} className="px-3 py-1 bg-purple-900/30 border border-purple-500/30 text-purple-400 rounded-full text-[9px] font-black uppercase shadow-sm cursor-help hover:bg-purple-900/50 transition-colors">Hidden Gem</span>}
                            </div>
                        </div>

                        <div className="p-6 bg-black/30 rounded-[40px] border border-white/5 shadow-inner">
                            <h4 className="text-[9px] font-black text-slate-500 uppercase mb-4 italic tracking-widest">Alpha Core Rationale</h4>
                            <ul className="space-y-4">
                                {(selectedStock.selectionReasons?.length ? selectedStock.selectionReasons : ['섹터 주도주 선정', '기술적 돌파 구간', '기관 매집 포착']).map((r, i) => (
                                <li key={i} className="flex items-start gap-4">
                                    <div className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]" />
                                    <p className="text-[13px] font-bold text-slate-200 leading-snug uppercase tracking-tight">{cleanMarkdown(r)}</p>
                                </li>
                                ))}
                            </ul>
                        </div>
                        
                        {quantMetrics && (
                            <div className="space-y-4 relative p-4 rounded-[30px] border border-white/5 bg-black/20">
                                <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.2em] px-2 italic">Quant Strategic Master Framework</h4>
                                
                                <div className="grid grid-cols-3 gap-3">
                                    <div 
                                        onClick={() => setActiveAlphaInsight('HALF_KELLY')}
                                        className="p-3 bg-indigo-900/10 rounded-[20px] border border-indigo-500/20 text-center hover:bg-indigo-900/20 cursor-help transition-all group alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-indigo-300 font-bold uppercase tracking-wider mb-1">Kelly %</p>
                                        <div className="flex items-baseline justify-center gap-1">
                                            <span className="text-xl font-black text-white italic">{quantMetrics.sizing.kelly}%</span>
                                        </div>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('VAPS')}
                                        className="p-3 bg-indigo-900/10 rounded-[20px] border border-indigo-500/20 text-center hover:bg-indigo-900/20 cursor-help transition-all group alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-indigo-300 font-bold uppercase tracking-wider mb-1">VAPS Qty</p>
                                        <span className="text-xl font-black text-white italic">{quantMetrics.sizing.vapsQty}</span>
                                    </div>
                                     <div 
                                        onClick={() => setActiveAlphaInsight('RISK_REWARD')}
                                        className="p-3 bg-indigo-900/10 rounded-[20px] border border-indigo-500/20 text-center hover:bg-indigo-900/20 cursor-help transition-all group alpha-insight-trigger"
                                    >
                                        <p className="text-[7px] text-indigo-300 font-bold uppercase tracking-wider mb-1">R:R Ratio</p>
                                        <span className="text-xl font-black text-white italic">1:{quantMetrics.sizing.riskReward}</span>
                                    </div>
                                </div>

                                <div className="p-3 bg-violet-900/10 rounded-[24px] border border-violet-500/20 grid grid-cols-4 gap-2 hover:bg-violet-900/20 transition-all">
                                    {[
                                        { id: 'ERCI', val: quantMetrics.selection.erci, label: 'ERCI' },
                                        { id: 'QM_COMP', val: quantMetrics.selection.qm, label: 'Q-M' },
                                        { id: 'IVG', val: `${quantMetrics.selection.ivg}%`, label: 'IVG' },
                                        { id: 'SOROS', val: quantMetrics.selection.soros, label: 'SOROS' },
                                    ].map((m) => (
                                        <div 
                                            key={m.id}
                                            onClick={() => setActiveAlphaInsight(m.id)}
                                            className="text-center cursor-help group alpha-insight-trigger flex flex-col justify-center"
                                        >
                                            <p className="text-[7px] text-violet-400 font-bold uppercase mb-0.5 group-hover:text-white transition-colors">{m.label}</p>
                                            <p className="text-sm font-black text-white">{m.val}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    <div 
                                        onClick={() => setActiveAlphaInsight('CONVEXITY')}
                                        className="p-2 bg-amber-900/10 rounded-[16px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[6px] text-amber-500 font-bold uppercase mb-0.5">Convexity</p>
                                        <p className="text-[8px] font-black text-white truncate">{quantMetrics.timing.convexity}</p>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('IFS')}
                                        className="p-2 bg-amber-900/10 rounded-[16px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[6px] text-amber-500 font-bold uppercase mb-0.5">IFS</p>
                                        <p className="text-sm font-black text-white italic">{quantMetrics.timing.ifs}</p>
                                    </div>
                                    <div 
                                        onClick={() => setActiveAlphaInsight('MRF')}
                                        className="p-2 bg-amber-900/10 rounded-[16px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[6px] text-amber-500 font-bold uppercase mb-0.5">MRF</p>
                                        <p className="text-[8px] font-black text-white truncate">{quantMetrics.timing.mrf}</p>
                                    </div>
                                     <div 
                                        onClick={() => setActiveAlphaInsight('PATTERN')}
                                        className="p-2 bg-amber-900/10 rounded-[16px] border border-amber-500/20 text-center hover:bg-amber-900/20 cursor-help transition-all alpha-insight-trigger"
                                    >
                                        <p className="text-[6px] text-amber-500 font-bold uppercase mb-0.5">Pattern</p>
                                        <p className="text-[8px] font-black text-white truncate">{quantMetrics.timing.pattern}</p>
                                    </div>
                                </div>

                                <div className="p-4 bg-emerald-900/10 rounded-[24px] border border-emerald-500/20 flex justify-between items-center hover:bg-emerald-900/20 transition-all cursor-help alpha-insight-trigger" onClick={() => setActiveAlphaInsight('EXPECTANCY')}>
                                    <div className="w-full">
                                        <p className="text-[7px] text-emerald-400 font-bold uppercase tracking-wider mb-2 border-b border-emerald-500/20 pb-1">System Integrity</p>
                                        <div className="flex justify-between w-full gap-2">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] text-slate-500 block mb-0.5">Expectancy</span>
                                                <span className="text-sm font-black text-white">{quantMetrics.system.expectancy}R</span>
                                            </div>
                                             <div className="flex flex-col text-center" onClick={(e) => { e.stopPropagation(); setActiveAlphaInsight('SENTIMENT'); }}>
                                                <span className="text-[8px] text-slate-500 block mb-0.5">Sentiment</span>
                                                <span className="text-[10px] font-black text-white truncate max-w-[60px]">{quantMetrics.system.sentiment}</span>
                                            </div>
                                            <div className="flex flex-col items-end" onClick={(e) => { e.stopPropagation(); setActiveAlphaInsight('AIC'); }}>
                                                <span className="text-[8px] text-slate-500 block mb-0.5">AI Consensus</span>
                                                <span className="text-sm font-black text-white">{quantMetrics.system.aic}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* [NEW] Advanced Deterministic Metrics (inside parent framework block) */}
                                <div className="p-3 bg-slate-900/30 rounded-[24px] border border-slate-700/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[7px] text-slate-400 font-bold uppercase tracking-[0.2em]">Edge / Risk / Regime / Integrity</p>
                                        <p className="text-[6px] text-slate-500 font-bold uppercase tracking-[0.18em]">Top Drivers Highlight</p>
                                    </div>

                                    <div className="p-2.5 bg-slate-950/60 rounded-[18px] border border-white/5">
                                        <p className="text-[6px] text-slate-500 font-bold uppercase tracking-[0.18em] mb-2">핵심 드라이버 Top3</p>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(quantMetrics.advanced.drivers || []).map((d: any, i: number) => (
                                                <div
                                                    key={`${d.id}-${i}`}
                                                    onClick={() => setActiveAlphaInsight(d.id)}
                                                    className={`p-2 rounded-[14px] border text-center cursor-help transition-all alpha-insight-trigger ${
                                                        i === 0
                                                            ? 'bg-rose-900/20 border-rose-400/50 shadow-[0_0_16px_rgba(244,63,94,0.25)] animate-pulse'
                                                            : i === 1
                                                                ? 'bg-amber-900/20 border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.2)]'
                                                                : 'bg-indigo-900/20 border-indigo-400/35 shadow-[0_0_10px_rgba(99,102,241,0.15)]'
                                                    }`}
                                                >
                                                    <p className="text-[6px] text-slate-300 font-bold uppercase truncate">{d.label}</p>
                                                    <p className="text-[10px] font-black text-white">{d.value}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="p-2.5 bg-indigo-900/10 rounded-[18px] border border-indigo-500/20">
                                            <p className="text-[6px] text-indigo-300 font-bold uppercase tracking-[0.16em] mb-2">Edge</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div onClick={() => setActiveAlphaInsight('EDGE_EXEC')} className={`p-2 bg-indigo-900/10 rounded-[14px] border border-indigo-500/25 text-center cursor-help hover:bg-indigo-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('EDGE_EXEC') ? 'ring-1 ring-indigo-300/60' : ''}`}>
                                                    <p className="text-[6px] text-indigo-300 font-bold uppercase">Exec Adj</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.edge.executionFactor.toFixed(2)}x</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('ROBUST_CONSENSUS')} className={`p-2 bg-indigo-900/10 rounded-[14px] border border-indigo-500/25 text-center cursor-help hover:bg-indigo-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('ROBUST_CONSENSUS') ? 'ring-1 ring-indigo-300/60' : ''}`}>
                                                    <p className="text-[6px] text-indigo-300 font-bold uppercase">Consensus</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.edge.stageConsensus}</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('RISK_REWARD')} className="p-2 bg-indigo-900/10 rounded-[14px] border border-indigo-500/25 text-center cursor-help hover:bg-indigo-900/20 transition-all alpha-insight-trigger">
                                                    <p className="text-[6px] text-indigo-300 font-bold uppercase">R:R</p>
                                                    <p className="text-[10px] font-black text-white">1:{quantMetrics.advanced.edge.rrRatio.toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-2.5 bg-rose-900/10 rounded-[18px] border border-rose-500/20">
                                            <p className="text-[6px] text-rose-300 font-bold uppercase tracking-[0.16em] mb-2">Risk</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div onClick={() => setActiveAlphaInsight('RISK_ATR')} className={`p-2 bg-rose-900/10 rounded-[14px] border border-rose-500/25 text-center cursor-help hover:bg-rose-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('RISK_ATR') ? 'ring-1 ring-rose-300/60' : ''}`}>
                                                    <p className="text-[6px] text-rose-300 font-bold uppercase">ATR%</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.risk.atrPct.toFixed(2)}%</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('RISK_GAP')} className={`p-2 bg-rose-900/10 rounded-[14px] border border-rose-500/25 text-center cursor-help hover:bg-rose-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('RISK_GAP') ? 'ring-1 ring-rose-300/60' : ''}`}>
                                                    <p className="text-[6px] text-rose-300 font-bold uppercase">Gap%</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.risk.gapRiskPct.toFixed(2)}%</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('RISK_LIQ')} className={`p-2 bg-rose-900/10 rounded-[14px] border border-rose-500/25 text-center cursor-help hover:bg-rose-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('RISK_LIQ') ? 'ring-1 ring-rose-300/60' : ''}`}>
                                                    <p className="text-[6px] text-rose-300 font-bold uppercase">Liquidity</p>
                                                    <p className="text-[10px] font-black text-white truncate">{quantMetrics.advanced.risk.liquidityState}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-2.5 bg-amber-900/10 rounded-[18px] border border-amber-500/20">
                                            <p className="text-[6px] text-amber-300 font-bold uppercase tracking-[0.16em] mb-2">Regime</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div onClick={() => setActiveAlphaInsight('REGIME_VIX')} className={`p-2 bg-amber-900/10 rounded-[14px] border border-amber-500/25 text-center cursor-help hover:bg-amber-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('REGIME_VIX') ? 'ring-1 ring-amber-300/60' : ''}`}>
                                                    <p className="text-[6px] text-amber-300 font-bold uppercase">VIX Δ</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.regime.vixDistance.toFixed(2)}</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('REGIME_RS')} className={`p-2 bg-amber-900/10 rounded-[14px] border border-amber-500/25 text-center cursor-help hover:bg-amber-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('REGIME_RS') ? 'ring-1 ring-amber-300/60' : ''}`}>
                                                    <p className="text-[6px] text-amber-300 font-bold uppercase">RS Alpha</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.regime.rsAlpha.toFixed(2)}</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('EVENT_DDAY')} className="p-2 bg-amber-900/10 rounded-[14px] border border-amber-500/25 text-center cursor-help hover:bg-amber-900/20 transition-all alpha-insight-trigger">
                                                    <p className="text-[6px] text-amber-300 font-bold uppercase">Earnings D</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.regime.earningsD === null ? 'N/A' : `D-${quantMetrics.advanced.regime.earningsD}`}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-2.5 bg-emerald-900/10 rounded-[18px] border border-emerald-500/20">
                                            <p className="text-[6px] text-emerald-300 font-bold uppercase tracking-[0.16em] mb-2">Integrity</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div onClick={() => setActiveAlphaInsight('ROBUST_STABILITY')} className="p-2 bg-emerald-900/10 rounded-[14px] border border-emerald-500/25 text-center cursor-help hover:bg-emerald-900/20 transition-all alpha-insight-trigger">
                                                    <p className="text-[6px] text-emerald-300 font-bold uppercase">Signal Stab.</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.integrity.signalStability.toFixed(1)}</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('INTEGRITY_SCORE')} className={`p-2 bg-emerald-900/10 rounded-[14px] border border-emerald-500/25 text-center cursor-help hover:bg-emerald-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('INTEGRITY_SCORE') ? 'ring-1 ring-emerald-300/60' : ''}`}>
                                                    <p className="text-[6px] text-emerald-300 font-bold uppercase">Integrity</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.integrity.integrityScore.toFixed(1)}</p>
                                                </div>
                                                <div onClick={() => setActiveAlphaInsight('CONCENTRATION_SCORE')} className={`p-2 bg-emerald-900/10 rounded-[14px] border border-emerald-500/25 text-center cursor-help hover:bg-emerald-900/20 transition-all alpha-insight-trigger ${topDriverIdSet.has('CONCENTRATION_SCORE') ? 'ring-1 ring-emerald-300/60' : ''}`}>
                                                    <p className="text-[6px] text-emerald-300 font-bold uppercase">Sector Conc.</p>
                                                    <p className="text-[10px] font-black text-white">{quantMetrics.advanced.integrity.sectorConcentration.toFixed(1)}%</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {activeAlphaInsight && FRAMEWORK_INSIGHTS[activeAlphaInsight] && (
                                    <div className="absolute right-0 w-[300%] md:w-[650px] bottom-0 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                        <div className="bg-[#0f172a] p-6 rounded-[24px] border border-slate-700 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.8)] relative">
                                            <button onClick={() => setActiveAlphaInsight(null)} className="absolute top-4 right-4 text-slate-500 hover:text-white p-1 hover:bg-white/10 rounded-full transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                            
                                            <div className="flex flex-col gap-4">
                                                <div>
                                                    <h5 className="text-sm font-bold text-white tracking-wide flex items-center gap-3 mb-2">
                                                        <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
                                                        {FRAMEWORK_INSIGHTS[activeAlphaInsight].title}
                                                    </h5>
                                                    <div className="text-[12px] text-slate-400 leading-relaxed pl-4 border-l border-white/5 whitespace-pre-wrap">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                                            {FRAMEWORK_INSIGHTS[activeAlphaInsight].desc}
                                                        </ReactMarkdown>
                                                    </div>
                                                </div>

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
                                          {/* [FIX] Use shouldRenderChart to prevent 0-size error */}
                                          {shouldRenderChart && (
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
                                          )}
                                     </div>
                                 </div>

                                 <div className="bg-emerald-900/10 p-6 rounded-[30px] border border-emerald-500/20 flex-1">
                                      <h5 className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                          Simulation Intelligence Insight
                                      </h5>
                                      <div className="text-xs text-slate-300 leading-relaxed">
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

                    <div className="mt-8 pt-8 border-t border-white/5">
                        <div className="flex justify-between items-end mb-6">
                            <div>
                                <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-1 italic">Probabilistic Alpha Distribution</h4>
                                <p className="text-[9px] text-slate-500 font-mono font-bold">
                                    ESTIMATED VARIANCE MODEL (Risk/Reward Probability)
                                </p>
                            </div>
                        </div>
                        {distributionData ? (
                            <div className="h-[200px] w-full bg-black/20 rounded-[30px] border border-white/5 p-4 relative overflow-hidden">
                                {/* [FIX] Use shouldRenderChart to prevent 0-size error */}
                                {shouldRenderChart && (
                                  <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={distributionData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                                          <defs>
                                              <linearGradient id="distGradient" x1="0" y1="0" x2="1" y2="0">
                                                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.8} />
                                                  <stop offset="50%" stopColor="#f43f5e" stopOpacity={0.1} />
                                                  <stop offset="50%" stopColor="#10b981" stopOpacity={0.1} />
                                                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.8} />
                                              </linearGradient>
                                          </defs>
                                          <XAxis 
                                              dataKey="x" 
                                              stroke="#475569" 
                                              fontSize={9} 
                                              tickLine={false} 
                                              axisLine={false}
                                              tickFormatter={(val) => `${val}%`}
                                          />
                                          <YAxis hide />
                                          <RechartsTooltip 
                                              contentStyle={{ backgroundColor: '#020617', border: '1px solid #1e293b', borderRadius: '8px' }}
                                              itemStyle={{ fontSize: '10px', color: '#fff' }}
                                              labelStyle={{ color: '#94a3b8', fontSize: '9px' }}
                                              formatter={(value: any) => [(Number(value) * 100).toFixed(2) + '%', "Probability Density"]}
                                              labelFormatter={(label) => `Return: ${label}%`}
                                          />
                                          <ReferenceLine x={0} stroke="#64748b" strokeDasharray="3 3" />
                                          <Area 
                                              type="monotone" 
                                              dataKey="y" 
                                              stroke="url(#distGradient)" 
                                              fill="url(#distGradient)" 
                                              strokeWidth={2} 
                                              fillOpacity={0.6}
                                              animationDuration={1500}
                                          />
                                      </AreaChart>
                                  </ResponsiveContainer>
                                )}
                                <div className="absolute top-2 right-4 text-[8px] font-black text-slate-500 uppercase tracking-widest bg-black/40 px-2 py-1 rounded">
                                    Gaussian Projection
                                </div>
                            </div>
                        ) : (
                             <div className="h-[150px] flex flex-col items-center justify-center border border-dashed border-white/10 rounded-[30px] bg-white/5 opacity-50">
                                <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Calculating Probability Curve...</p>
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
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[SIGNAL]') ? 'border-blue-500 text-blue-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-rose-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Signal Explanation Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setSelectedSignal(null)}>
            <div className="bg-[#0f172a] border border-white/10 rounded-[32px] p-8 max-w-md w-full shadow-2xl relative transform transition-all scale-100" onClick={(e) => e.stopPropagation()}>
                <button 
                    onClick={() => setSelectedSignal(null)}
                    className="absolute top-4 right-4 text-slate-500 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                
                <div className="flex flex-col items-center text-center space-y-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center shadow-inner">
                        <span className="text-3xl">{selectedSignal.title.split(' ')[0]}</span>
                    </div>
                    
                    <div className="space-y-2">
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">
                            {selectedSignal.title.replace(/^[^\s]+\s/, '')}
                        </h3>
                        <div className="h-1 w-12 bg-rose-500 rounded-full mx-auto"></div>
                    </div>
                    
                    <p className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {selectedSignal.desc}
                        </ReactMarkdown>
                    </p>
                    
                    <button 
                        onClick={() => setSelectedSignal(null)}
                        className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
                    >
                        Close Insight
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AlphaAnalysis;
