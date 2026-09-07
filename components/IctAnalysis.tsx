
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, STRATEGY_CONFIG } from '../constants';
import { formatKstFilenameTimestamp } from '../services/timeService';
import { assertDriveOk } from '../services/driveJsonUtils';
import { summarizeTossShadowEvidence } from '../services/tossShadowContract.mjs';
import { hashTextSha256, hashBytesSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { STAGE4_RECENT_HINT_KEY, buildStage5InputContext, buildStage5EvidenceArtifact } from '../services/stage5EvidenceContract.mjs';

interface IctScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  ictScore: number;
  compositeAlpha: number;
  
  // ICT Specific Metrics
  ictMetrics: {
      displacement: number;   // 세력의 개입 강도 (Strong Move)
      liquiditySweep: number; // 스탑 헌팅 여부 (Stop Hunt)
      marketStructure: number;// 구조적 추세 전환 (MSS)
      orderBlock: number;     // 매집 구간 지지력 (OB Quality)
      smartMoneyFlow: number; // 기관 자금 유입 추정치 (Effort vs Result)
  };
  
  // [NEW] ICT 5-Step Data
  pdZone: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT';
  otePrice: number;
  ictStopLoss: number;

  // Qualitative Tags
  marketState: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MANIPULATION' | 'RE-ACCUMULATION';
  verdict: string;
  
  // Radar Data
  radarData: { subject: string; A: number; fullMark: number }[];
  
  sector: string;
  scoringEngine?: string;
  rankRaw?: number;
  rankFinal?: number;
  majorPenaltyCause?: 'SECTOR_DIVERSIFICATION' | 'DATA_QUALITY' | 'RSI_OVERHEAT' | 'PEG_DOUBT' | 'SIGNAL_HEAT' | 'NONE';
  regimeMode?: 'RISK_OFF' | 'RISK_ON' | 'FALLBACK';
  compositeBreakdown?: {
      mode: 'RISK_OFF' | 'RISK_ON' | 'FALLBACK';
      baseFundamentalPart: number;
      baseTechnicalPart: number;
      baseIctPart: number;
      fallbackPart: number;
      signalQualityBonus: number;
      signalComboBonus: number;
      minerviniBonus: number;
      factorCarryApplied: number;
      factorCarryScale: number;
      factorCarryLowCoveragePenalty: number;
      factorCarryGuard: 'NORMAL' | 'THIN_REDUCED' | 'ILLIQUID_BLOCK_POSITIVE' | 'STALE_BLOCK_POSITIVE';
      factorCoverage: number;
      factorConfidence: number;
      factorQualityScore: number;
      rsiPenalty: number;
      heatPenalty: number;
      dataDoubtfulMultiplier: number;
      dataQualityMultiplier: number;
      calibrationApplied: boolean;
      calibrationDelta: number;
      preDiversificationComposite: number;
      sectorDiversificationMultiplier: number;
      postDiversificationComposite: number;
      sectorCount: number;
      sectorBucket: 'LEADER' | 'WARNING' | 'SATURATION';
  };
  
  // [DATA PRESERVATION]
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
}

const STAGE5_RECENT_HINT_KEY = 'US_ALPHA_STAGE5_RECENT_HINT';

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

// These names describe OHLCV heuristics, not observed institutional orders or calibrated probabilities.
const ICT_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    DISPLACEMENT: { title: 'Displacement proxy', desc: '거래량 점수와 모멘텀, 캔들 몸통 및 인접 봉 갭의 가중 휴리스틱입니다.', interpretation: '기관 주문이나 실제 자금 유입을 확인한 값이 아닙니다.' },
    MSS: { title: 'Market structure proxy', desc: '추세, 방향성 지표와 displacement의 합성 점수입니다.', interpretation: '스윙 고점 돌파 또는 구조 전환을 직접 검증하는 이벤트 검출기가 아닙니다.' },
    SWEEP: { title: 'Liquidity sweep proxy', desc: '아래꼬리, squeeze, RSI와 거래량 배율을 사용하는 패턴 점수입니다.', interpretation: '실제 손절 주문 체결이나 향후 반전을 확인한 값이 아닙니다.' },
    WHALES: { title: 'Volume/price flow proxy', desc: '거래량 배율 대비 가격 변화와 MFI를 사용하는 휴리스틱입니다.', interpretation: '기관 보유, 매집 또는 투자 성공 확률을 의미하지 않습니다.' }
};

const MARKET_STATE_INFO: Record<string, string> = {
    ACCUMULATION: '매집 유사 패턴: 가격/거래량 휴리스틱 분류. 실제 매집 미확인.',
    MARKUP: '상승 유사 패턴: 추세/변위 휴리스틱 분류. 최종 진입 판단은 Stage6에 있음.',
    DISTRIBUTION: '분산/기타 패턴: 앞선 조건 미충족 시의 기본 분류. 실제 매도 물량 미확인.',
    MANIPULATION: '휩소 유사 패턴: sweep 점수 기반 분류. 시장 조작 증거가 아님.',
    'RE-ACCUMULATION': '재매집 유사 패턴: 추세/지지 점수 기반 분류. 기관 재매수 미확인.'
};

// [QUANT ENGINE v6.9] Robust ICT Logic (Algorithmic)
const calculateIctScore = (item: any) => {
    const rvol = item.techMetrics.rawRvol;
    const momentum = item.techMetrics.momentum;
    const trendScore = item.techMetrics.trend;
    const macdHistogram = item.techMetrics?.macdHistogram || 0;
    const mfi = item.techMetrics.mfi;
    const diPlus = item.techMetrics?.diPlus || 0;
    const diMinus = item.techMetrics?.diMinus || 0;
    const minerviniScore = item.techMetrics?.minerviniScore || 0;
    const minerviniPassCount = item.techMetrics?.minerviniPassCount || 0;
    const signalComboBonus = item.techMetrics?.signalComboBonus || 0;
    const signalHeatPenalty = item.techMetrics?.signalHeatPenalty || 0;
    const signalQualityState = item.techMetrics?.signalQualityState || 'NEUTRAL';
    const dataQualityState = item.techMetrics?.dataQualityState || 'NORMAL';
    const priceHistory = item.priceHistory || [];
    const dailyChange = item.change || 0; // Keep sign for direction
    const absChange = Math.abs(dailyChange);

    // --- 1. Candle Geometry Analysis (Micro-Structure) ---
    let wickScore = 0;
    let bodyStrength = 0;
    let recentGap = 0;

    if (priceHistory.length >= 5) {
        const lastCandle = priceHistory[priceHistory.length - 1];
        const prevCandle = priceHistory[priceHistory.length - 2];
        
        // Calculate Candle Parts
        const open = lastCandle.open;
        const close = lastCandle.close;
        const high = lastCandle.high;
        const low = lastCandle.low;
        
        const bodySize = Math.abs(close - open);
        const totalRange = high - low;
        const lowerWick = Math.min(open, close) - low;
        
        // A. Sweep Detection (Long Lower Wick relative to Body)
        // [SAFETY] Prevent Division by Zero
        if (totalRange > 0) {
            const wickRatio = lowerWick / totalRange;
            if (wickRatio > 0.4) wickScore = 80; // Hammer pattern / Stop Hunt
            else if (wickRatio > 0.25) wickScore = 50;
            
            // C. Body Strength
            bodyStrength = (bodySize / totalRange) * 100;
        }

        // B. Gap Detection (FVG Proxy)
        if (prevCandle && low > prevCandle.high) recentGap = 100; // Gap Up
        
    } else {
        throw new Error('STAGE5_EMPIRICAL_BARS_REQUIRED');
    }

    // --- 2. Displacement (Force of Move) ---
    // Log normalized RVOL is already in item.techMetrics.rvol (0-100 scale), rawRvol is the ratio
    const rvolScore = item.techMetrics.rvol;
    
    let displacement = Math.min(100, (rvolScore * 0.4) + (momentum * 0.4));
    if (bodyStrength > 60) displacement += 15; 
    if (recentGap > 0) displacement += 15; 
    if (trendScore > 80) displacement += 10;
    if (macdHistogram > 0) displacement += Math.min(6, macdHistogram * 10);
    else if (macdHistogram < -0.3) displacement -= 4;
    if (signalComboBonus > 0) displacement += Math.min(6, signalComboBonus * 2);
    

    // --- 3. Market Structure (MSS) ---
    // If trend is strong and displacement is high, structure is bullish
    let mss = (trendScore + displacement) / 2; 
    if (diPlus > diMinus) mss += Math.min(10, (diPlus - diMinus) * 0.6);
    else if (diMinus > diPlus) mss -= Math.min(8, (diMinus - diPlus) * 0.6);
    if (minerviniPassCount >= 7) mss += 8;
    else if (minerviniPassCount >= 5) mss += 4;
    else if (minerviniPassCount < 4) mss -= 6;

    // --- 4. Liquidity Sweep (Stop Hunt Detection) ---
    const isSqueeze = item.techMetrics?.squeezeState === 'SQUEEZE_ON';
    const rsi = item.techMetrics.rsi;
    
    let sweepScore = 50;
    if (isSqueeze) sweepScore += 30; 
    if (wickScore > 0) sweepScore = (sweepScore + wickScore) / 2; 
    if (rsi < 40 && rvol > 1.2) sweepScore += 10; 
    if (signalQualityState === 'SETUP' && diPlus > diMinus) sweepScore += 5;

    // --- 5. Smart Money Flow (VSA - Effort vs Result) ---
    let obScore = 50; 
    if (trendScore > 60 && rsi >= 40 && rsi <= 65) obScore = 90; 
    else if (trendScore > 60 && rsi > 70) obScore = 70; 
    else if (trendScore < 40) obScore = 30; 
    if (minerviniScore >= 87.5) obScore += 10;
    else if (minerviniScore < 50) obScore -= 10;

    let smFlow = 50;
    // Effort (Volume) vs Result (Price Change)
    if (rvol > 2.0) {
        if (absChange < 0.5) smFlow = 90; // Absorption (Stopping Volume)
        else if (absChange > 2.0) smFlow = 85; // Valid Breakout
        else smFlow = 60;
    } else {
        smFlow = trendScore; // Follow trend if vol is normal
    }
    if (mfi >= 55 && mfi <= 80) smFlow += 10;
    else if (mfi > 85) smFlow -= 10;
    if (signalQualityState === 'ALIGNED') smFlow += 8;
    else if (signalQualityState === 'SETUP') smFlow += 4;
    if (signalHeatPenalty > 0) smFlow -= Math.min(12, signalHeatPenalty * 0.6);

    if (dataQualityState === 'THIN') {
        obScore -= 8;
        smFlow -= 4;
    } else if (dataQualityState === 'ILLIQUID') {
        obScore -= 20;
        smFlow -= 12;
    } else if (dataQualityState === 'STALE') {
        obScore -= 25;
        smFlow -= 15;
    }

    // Final Composite Score weighting
    let finalScore = (displacement * 0.25) + (mss * 0.2) + (sweepScore * 0.15) + (obScore * 0.15) + (smFlow * 0.25);
    if (signalComboBonus > 0) finalScore += Math.min(8, signalComboBonus * 1.5);
    if (signalHeatPenalty > 0) finalScore -= Math.min(10, signalHeatPenalty);
    if (dataQualityState === 'THIN') finalScore -= 4;
    else if (dataQualityState === 'ILLIQUID') finalScore -= 15;
    else if (dataQualityState === 'STALE') finalScore -= 20;

    return {
        score: Number(Math.min(100, Math.max(0, finalScore)).toFixed(2)),
        metrics: {
            displacement: Number(Math.max(0, Math.min(100, displacement)).toFixed(2)),
            liquiditySweep: Number(Math.max(0, Math.min(100, sweepScore)).toFixed(2)),
            marketStructure: Number(Math.max(0, Math.min(100, mss)).toFixed(2)),
            orderBlock: Number(Math.max(0, Math.min(100, obScore)).toFixed(2)),
            smartMoneyFlow: Number(Math.max(0, Math.min(100, smFlow)).toFixed(2))
        }
    };
};

const calibrateCompositeAlpha = (rawComposite: number) => {
    const minScore = Number(STRATEGY_CONFIG.ALPHA_SCORE_MIN ?? 0);
    const maxScore = Number(STRATEGY_CONFIG.ALPHA_SCORE_MAX ?? 100);
    const safeMin = Number.isFinite(minScore) ? minScore : 0;
    const safeMax = Number.isFinite(maxScore) ? maxScore : 100;
    const boundedMax = Math.max(safeMin, safeMax);
    const safeRaw = Number.isFinite(rawComposite) ? rawComposite : safeMin;
    const calibrated = Math.min(boundedMax, Math.max(safeMin, safeRaw));
    const delta = calibrated - safeRaw;

    return {
        score: calibrated,
        applied: Math.abs(delta) > 1e-6,
        delta
    };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toFiniteNumber = (value: any, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const computeStage5FactorCarry = (item: any, dataQualityState: string) => {
    const coverageRaw = item?.factorCoverage ?? item?.techMetrics?.factorCoverage;
    const confidenceRaw = item?.factorConfidence ?? item?.techMetrics?.factorConfidence;
    const qualityRaw = item?.factorQualityScore ?? item?.techMetrics?.factorQualityScore;
    const hasCoverageMeta = Number.isFinite(toFiniteNumber(coverageRaw, NaN));
    const hasConfidenceMeta = Number.isFinite(toFiniteNumber(confidenceRaw, NaN));
    const hasQualityMeta = Number.isFinite(toFiniteNumber(qualityRaw, NaN));
    const hasFactorMeta = hasCoverageMeta || hasConfidenceMeta || hasQualityMeta;

    const stage4Adjustment = clamp(
        toFiniteNumber(item?.factorAdjustmentTotal, toFiniteNumber(item?.techMetrics?.factorAdjustmentTotal, 0)),
        -5,
        5
    );
    const factorCoverage = clamp(
        toFiniteNumber(item?.factorCoverage, toFiniteNumber(item?.techMetrics?.factorCoverage, 0)),
        0,
        100
    );
    const factorConfidence = clamp(
        toFiniteNumber(item?.factorConfidence, toFiniteNumber(item?.techMetrics?.factorConfidence, 0)),
        0,
        100
    );
    const factorQualityScore = clamp(
        toFiniteNumber(
            item?.factorQualityScore,
            toFiniteNumber(item?.techMetrics?.factorQualityScore, toFiniteNumber(item?.qualityFactorScore, toFiniteNumber(item?.qualityScore, 50)))
        ),
        0,
        100
    );

    // Legacy Stage4 schema safeguard: if confidence/coverage/quality metadata is absent,
    // skip carry entirely rather than introducing negative bias via low-coverage penalty.
    if (!hasFactorMeta) {
        return {
            appliedCarry: 0,
            carryScale: 0,
            lowCoveragePenalty: 0,
            factorCoverage: 0,
            factorConfidence: 0,
            factorQualityScore: Number(factorQualityScore.toFixed(2)),
            stage4Adjustment: Number(stage4Adjustment.toFixed(2)),
            guard: 'NORMAL' as const
        };
    }

    let carryScale = 0.15 + (0.35 * (factorConfidence / 100)); // 0.15 ~ 0.50
    let lowCoveragePenalty = 0;
    if (factorCoverage < 40) {
        carryScale *= 0.8;
        lowCoveragePenalty = -0.6;
    } else if (factorCoverage < 60) {
        carryScale *= 0.9;
    }

    let rawCarry = (stage4Adjustment * carryScale) + lowCoveragePenalty;

    // If factor quality itself is weak, only allow half of positive carry.
    if (factorQualityScore < 40 && rawCarry > 0) rawCarry *= 0.5;

    let guard: 'NORMAL' | 'THIN_REDUCED' | 'ILLIQUID_BLOCK_POSITIVE' | 'STALE_BLOCK_POSITIVE' = 'NORMAL';
    if (dataQualityState === 'STALE') {
        rawCarry = Math.min(rawCarry, 0);
        guard = 'STALE_BLOCK_POSITIVE';
    } else if (dataQualityState === 'ILLIQUID') {
        rawCarry = Math.min(rawCarry, 0);
        guard = 'ILLIQUID_BLOCK_POSITIVE';
    } else if (dataQualityState === 'THIN') {
        if (rawCarry > 0) rawCarry *= 0.5;
        guard = 'THIN_REDUCED';
    }

    const appliedCarry = Number(clamp(rawCarry, -3, 3).toFixed(2));
    return {
        appliedCarry,
        carryScale: Number(carryScale.toFixed(4)),
        lowCoveragePenalty: Number(lowCoveragePenalty.toFixed(2)),
        factorCoverage: Number(factorCoverage.toFixed(2)),
        factorConfidence: Number(factorConfidence.toFixed(2)),
        factorQualityScore: Number(factorQualityScore.toFixed(2)),
        stage4Adjustment: Number(stage4Adjustment.toFixed(2)),
        guard
    };
};

type PriceHistoryBar = {
    high: number;
    low: number;
    close: number;
};

const normalizePriceHistoryBars = (priceHistory: any): PriceHistoryBar[] => {
    if (!Array.isArray(priceHistory) || priceHistory.some(bar =>
        !['high', 'low', 'close'].every(key => typeof bar?.[key] === 'number' && Number.isFinite(bar[key]) && bar[key] > 0)
        || bar.high < bar.low || bar.close > bar.high || bar.close < bar.low)) return [];
    return priceHistory.map(({ high, low, close }) => ({ high, low, close }));
};

const calculateAtrFromBars = (bars: PriceHistoryBar[], period = 20): number | null => {
    if (!Array.isArray(bars) || bars.length < period) return null;

    const trueRanges: number[] = [];
    for (let i = 0; i < bars.length; i++) {
        const current = bars[i];
        const prevClose = i > 0 ? bars[i - 1].close : current.close;
        const tr = Math.max(
            current.high - current.low,
            Math.abs(current.high - prevClose),
            Math.abs(current.low - prevClose)
        );
        if (Number.isFinite(tr)) trueRanges.push(tr);
    }

    if (trueRanges.length < period) return null;
    const window = trueRanges.slice(-period);
    const atr = window.reduce((sum, value) => sum + value, 0) / period;
    return Number.isFinite(atr) && atr > 0 ? atr : null;
};

const resolveIctExecutionGeometry = (item: any) => {
    const toFinitePositive = (value: any): number | null => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const ensureStopBelowEntry = (stopValue: number | null, entryValue: number | null): number | null => {
        if (stopValue == null) return null;
        if (entryValue != null && stopValue >= entryValue) return null;
        return stopValue;
    };
    const high52 = Number(item?.fiftyTwoWeekHigh ?? item?.high52 ?? NaN);
    const low52 = Number(item?.fiftyTwoWeekLow ?? item?.low52 ?? NaN);
    const fallbackRange = Math.max(0, high52 - low52);
    const fallbackOteRaw = fallbackRange > 0
        ? high52 - (fallbackRange * Number(STRATEGY_CONFIG.ICT_OTE_LEVEL ?? 0.705))
        : Number.NaN;
    const fallbackOte = toFinitePositive(fallbackOteRaw);
    const fallbackStopRaw = low52 > 0 ? low52 * 0.985 : Number.NaN;
    const fallbackStop = ensureStopBelowEntry(toFinitePositive(fallbackStopRaw), fallbackOte);
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const fallbackIctPos = fallbackRange > 0 ? clamp01((Number(item?.price || 0) - low52) / fallbackRange) : 0.5;

    const rangeLookback = Math.max(20, Number(STRATEGY_CONFIG.ICT_RANGE_LOOKBACK_BARS ?? 60));
    const stopLookback = Math.max(10, Number(STRATEGY_CONFIG.ICT_STOP_LOOKBACK_BARS ?? 20));
    const atrMultiplier = Math.max(0.5, Number(STRATEGY_CONFIG.ICT_STOP_ATR_MULTIPLIER ?? 1.0));

    const bars = normalizePriceHistoryBars(item?.priceHistory);
    const rangeBars = bars.slice(-rangeLookback);
    const stopBars = bars.slice(-stopLookback);

    if (rangeBars.length >= 20 && stopBars.length >= 10) {
        const recentHigh = Math.max(...rangeBars.map((bar) => bar.high));
        const recentLow = Math.min(...rangeBars.map((bar) => bar.low));
        const recentRange = recentHigh - recentLow;
        const recentLowStop = Math.min(...stopBars.map((bar) => bar.low));
        const atr = calculateAtrFromBars(stopBars, Math.min(stopLookback, 20));

        if (recentRange > 0 && Number.isFinite(recentLowStop) && atr != null) {
            const recentOte = recentHigh - (recentRange * Number(STRATEGY_CONFIG.ICT_OTE_LEVEL ?? 0.705));
            let stop = recentLowStop - (atr * atrMultiplier);

            if (!Number.isFinite(stop) || stop <= 0) stop = fallbackStop ?? Number.NaN;
            if (Number.isFinite(recentOte) && stop >= recentOte) {
                const candidateStops = [
                    toFinitePositive(recentLowStop * 0.995),
                    toFinitePositive(recentOte * 0.985),
                    fallbackStop
                ].filter((value): value is number => value != null && value < recentOte);
                stop = candidateStops.length > 0 ? Math.max(...candidateStops) : Number.NaN;
            }
            const safeStop = ensureStopBelowEntry(toFinitePositive(stop), toFinitePositive(recentOte));

            return {
                high52,
                low52,
                ictPos: clamp01((Number(item?.price || 0) - recentLow) / recentRange),
                otePrice: recentOte,
                ictStopLoss: safeStop ?? Number.NaN,
                executionGeometrySource: "RECENT_SWING_ATR",
                executionRangeBars: rangeBars.length,
                executionStopBars: stopBars.length,
                executionAtr: Number(atr.toFixed(4))
            };
        }
    }

    return {
        high52,
        low52,
        ictPos: fallbackIctPos,
        otePrice: fallbackOteRaw,
        ictStopLoss: fallbackStop ?? Number.NaN,
        executionGeometrySource: "FALLBACK_52W",
        executionRangeBars: rangeBars.length,
        executionStopBars: stopBars.length,
        executionAtr: null
    };
};

const compareStage5Identity = (a: any, b: any) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;

const determineMarketState = (metrics: any): 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MANIPULATION' | 'RE-ACCUMULATION' => {
    if (metrics.marketStructure > 75 && metrics.displacement > 70) return 'MARKUP';
    if (metrics.marketStructure > 60 && metrics.orderBlock > 80) return 'RE-ACCUMULATION';
    if (metrics.smartMoneyFlow > 80 && metrics.displacement < 60) return 'ACCUMULATION'; 
    if (metrics.liquiditySweep > 80) return 'MANIPULATION';
    return 'DISTRIBUTION';
};

const IctAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<IctScoredTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<IctScoredTicker | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> ICT_Node v6.9: Robust Calculation Engine.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const autoStartTriggeredRef = useRef(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-card') && !target.closest('.insight-badge')) {
            setActiveInsight(null);
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
    if (!autoStart) {
        autoStartTriggeredRef.current = false;
        return;
    }
    if (autoStart && !loading && !autoStartTriggeredRef.current) {
        autoStartTriggeredRef.current = true;
        addLog("AUTO-PILOT: Engaging Institutional Footprint Scanner...", "signal");
        executeIntegratedIctProtocol();
    }
  }, [autoStart, loading]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };
  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRadarData = (ticker: IctScoredTicker) => {
      return [
          { subject: 'Momentum', A: ticker.ictMetrics.displacement, fullMark: 100 },
          { subject: 'Structure', A: ticker.ictMetrics.marketStructure, fullMark: 100 },
          { subject: 'Liquidity', A: ticker.ictMetrics.liquiditySweep, fullMark: 100 },
          { subject: 'Flow', A: ticker.ictMetrics.smartMoneyFlow, fullMark: 100 },
          { subject: 'Support', A: ticker.ictMetrics.orderBlock, fullMark: 100 },
      ];
  };

  const handleTickerSelect = (ticker: IctScoredTicker) => {
      setSelectedTicker(ticker);
      setActiveInsight(null);
      if (onStockSelected) {
          onStockSelected(ticker); 
      }
  };

  const executeIntegratedIctProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    addLog("Phase 5: Initiating Institutional Liquidity Sieve...", "info");
    
    try {
      window.sessionStorage.removeItem(STAGE5_RECENT_HINT_KEY);
      const decisionAt = new Date().toISOString();
      const stage4FolderId = await findFolderId(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      if (!stage4FolderId) throw new Error('STAGE4_FOLDER_MISSING');
      const hintText = window.sessionStorage.getItem(STAGE4_RECENT_HINT_KEY);
      const expectedHint = hintText ? JSON.parse(hintText) : null;
      if (autoStart && !expectedHint) throw new Error('STAGE4_SAME_RUN_HANDOFF_MISSING');
      if (expectedHint && !/^STAGE4_TECHNICAL_FULL_[A-Za-z0-9_.-]+\.json$/.test(expectedHint.fileName || '')) {
          throw new Error('STAGE4_HANDOFF_NAME_INVALID');
      }
      const nameQuery = expectedHint
          ? `name = '${expectedHint.fileName}'`
          : "name contains 'STAGE4_TECHNICAL_FULL_'";
      const query = encodeURIComponent(`${nameQuery} and '${stage4FolderId}' in parents and trashed = false`);
      const listResponse = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=2&fields=files(id,name,createdTime)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
      });
      await assertDriveOk(listResponse, 'stage5.stage4.list');
      const listing = await listResponse.json();
      if (!listing.files?.length || (expectedHint && listing.files.length !== 1)
        || (listing.files.length > 1 && listing.files[0].name === listing.files[1].name)) {
          throw new Error('STAGE4_EXACT_SOURCE_MISSING_OR_AMBIGUOUS');
      }
      // Lock one input. An invalid current artifact must never select an older factor-ready file.
      const selected = listing.files[0];
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${selected.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` }
      });
      await assertDriveOk(response, 'stage5.stage4.content');
      const contentBytes = await response.arrayBuffer();
      const content = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(contentBytes));
      const context = await buildStage5InputContext({ payload: content,
          contentSha256: await hashBytesSha256(contentBytes), fileName: selected.name, expectedHint, decisionAt });
      const selectedStage4Id = selected.id;
      const selectedStage4Name = selected.name;
      const selectedStage4Timestamp = content.manifest.generatedAt || selected.createdTime || null;
      const stage4SourceStage3File = context.sourceStage3File;
      const stage4InputCount = context.inputRows;
      const excludedByInstrumentType = context.evaluations.filter(row => row.status === 'STAGE5_INSTRUMENT_EXCLUDED').length;
      const mergedUniverse = content.technical_universe.filter((_: any, index: number) => context.evaluations[index].status === 'STAGE5_INPUT_VERIFIED');
      const selectedStage4FactorReady = mergedUniverse.length > 0;
      addLog(`Stage4 exact input: ${stage4InputCount} rows; verified ${mergedUniverse.length}; blocked ${stage4InputCount - mergedUniverse.length}.`, 'ok');
      if (!mergedUniverse.length) throw new Error('STAGE5_NO_VERIFIED_INPUT_ROWS');
      const targets = mergedUniverse.map((row: any) => ({ ...row,
          tempScore: row.technicalScore * 0.6 + row.fundamentalScore * 0.4
      })).sort((a: any, b: any) => b.tempScore - a.tempScore || compareStage5Identity(a, b));
      const vix = context.vix;

      const total = targets.length;
      setProgress({ current: 0, total });

      // [VIX] Dynamic Risk Weighting (synced from snapshot when available)
      const isFearMode = vix > STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL;
      if (isFearMode) addLog(`Risk Protocol: VIX ${vix} > ${STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL}. Defensive Mode Active.`, "warn");

      const results: IctScoredTicker[] = [];
      const inputEvaluation = new Map(context.evaluations.map(row => [row.symbol, row]));
      let c9RecentGeometryCount = 0;
      let c9FallbackGeometryCount = 0;
      let factorCarryBoostCount = 0;
      let factorCarryPenaltyCount = 0;
      let factorCarryTotal = 0;
      let factorCarryScaleTotal = 0;
      let factorCoverageTotal = 0;
      let factorConfidenceTotal = 0;
      let factorLowCoveragePenaltyCount = 0;
      let factorGuardThinCount = 0;
      let factorGuardIlliquidCount = 0;
      let factorGuardStaleCount = 0;

      for (let i = 0; i < total; i++) {
        const item = targets[i];
        
        // Pure Algo Logic
        const ictAnalysis = calculateIctScore(item);
        
        // [ICT 5-Step Logic] P/D Array & OTE Calculation
        // C9: prefer recent swing/ATR geometry, fallback to 52w when data is sparse
        const geometry = resolveIctExecutionGeometry(item);
        if (!Number.isFinite(geometry.otePrice) || geometry.otePrice <= 0
            || !Number.isFinite(geometry.ictStopLoss) || geometry.ictStopLoss <= 0
            || geometry.ictStopLoss >= geometry.otePrice) {
            const evaluation = inputEvaluation.get(item.symbol)!;
            evaluation.status = 'STAGE5_GEOMETRY_INVALID';
            evaluation.reasons = ['NO_VALID_EMPIRICAL_EXECUTION_GEOMETRY'];
            continue;
        }
        if (geometry.executionGeometrySource === "RECENT_SWING_ATR") c9RecentGeometryCount++;
        else c9FallbackGeometryCount++;
        let ictPos = typeof item?.ictPos === 'number' ? item.ictPos : Number.NaN;
        if (!Number.isFinite(ictPos)) ictPos = geometry.ictPos;

        let pdZone: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT' = 'EQUILIBRIUM';
        if (ictPos < 0.45) pdZone = 'DISCOUNT';
        else if (ictPos > 0.55) pdZone = 'PREMIUM';

        const otePrice = geometry.otePrice;
        const ictStopLoss = geometry.ictStopLoss;

        // [Logic Injection] Enhance Score based on ICT 5-Step
        // 1. Discount Zone Bonus (Buying Cheap is Key)
        if (pdZone === 'DISCOUNT') {
            ictAnalysis.score += 10; 
        } else if (pdZone === 'PREMIUM') {
            ictAnalysis.score -= 10; // Penalty for buying expensive
        }

        // 2. OTE Proximity Bonus (Within 5%)
        const distToOte = Math.abs(item.price - otePrice) / item.price;
        if (distToOte < 0.05) {
            ictAnalysis.score += 15; // Sniper Entry Bonus
        }

        // 3. Liquidity Sweep Enhancement (Volume Confirmation)
        const rvol = item.techMetrics.rawRvol;
        if (ictAnalysis.metrics.liquiditySweep > 50 && rvol > 1.5) {
            ictAnalysis.score += 10;
            ictAnalysis.metrics.liquiditySweep = Math.min(100, ictAnalysis.metrics.liquiditySweep + 20);
        }

        // Re-clamp score 0-100
        ictAnalysis.score = Math.min(100, Math.max(0, ictAnalysis.score));

        const marketState = determineMarketState(ictAnalysis.metrics);
        
        // [RISK] RSI Penalty & PEG Check
        const rsi = item.techMetrics.rsi;
        const pegRatio = item.pegRatio || 0;
        const revenueGrowth = item.revenueGrowth || 0;
        
        let isDataDoubtful = false;
        // PEG Cross-Check: Trap for "Fake Value"
        if (pegRatio < 0.5 && pegRatio > 0 && revenueGrowth <= 0) {
            isDataDoubtful = true;
        }

        // Composite Alpha Calculation (Weighted)
        // Note: We keep this for Stage 5 ranking, but Stage 6 will do the final AI synthesis.
        let composite = 0;
        let baseFundamentalPart = 0;
        let baseTechnicalPart = 0;
        let baseIctPart = 0;
        let fallbackPart = 0;
        let scoringMode: 'RISK_OFF' | 'RISK_ON' | 'FALLBACK' = 'FALLBACK';
        
        if (Number.isFinite(item.technicalScore)) {
            if (isFearMode) {
                // [VIX > 22] Fear Mode: normalized risk-off weights (H1)
                const rawFundWeight = Number(STRATEGY_CONFIG.RISK_OFF_FUND_WEIGHT ?? 0.70);
                const rawTechWeight = Number(STRATEGY_CONFIG.RISK_OFF_TECH_WEIGHT ?? 0.30);
                const rawIctWeight = Number(STRATEGY_CONFIG.RISK_OFF_ICT_WEIGHT ?? 0.10);
                const weightSum = Math.max(0.0001, rawFundWeight + rawTechWeight + rawIctWeight);
                const fundWeight = rawFundWeight / weightSum;
                const techWeight = rawTechWeight / weightSum;
                const ictWeight = rawIctWeight / weightSum;

                baseFundamentalPart = item.fundamentalScore * fundWeight;
                baseTechnicalPart = item.technicalScore * techWeight;
                baseIctPart = ictAnalysis.score * ictWeight;
                composite = baseFundamentalPart + baseTechnicalPart + baseIctPart;
                scoringMode = 'RISK_OFF';
            } else {
                // [VIX <= 22] Normal Mode: Balanced (Fund 20% / Tech 30% / ICT 50%)
                baseFundamentalPart = item.fundamentalScore * 0.20;
                baseTechnicalPart = item.technicalScore * 0.30;
                baseIctPart = ictAnalysis.score * 0.50;
                composite = baseFundamentalPart + baseTechnicalPart + baseIctPart;
                scoringMode = 'RISK_ON';
            }
        } else {
            // Penalize missing data items to push them to bottom
            fallbackPart = (item.fundamentalScore || 0) * 0.1;
            composite = fallbackPart;
        }

        // [PENALTY] RSI Overheat Defense
        let rsiPenalty = 0;
        if (rsi > STRATEGY_CONFIG.RSI_PENALTY_THRESHOLD) {
            rsiPenalty = Math.pow(rsi - STRATEGY_CONFIG.RSI_PENALTY_THRESHOLD, 1.5);
            composite -= rsiPenalty;
        }

        // [PENALTY] PEG Doubtful Data
        let dataDoubtfulMultiplier = 1;
        if (isDataDoubtful) {
            dataDoubtfulMultiplier = 0.85;
            composite *= dataDoubtfulMultiplier; // 15% Haircut for fake valuation
        }

        const signalComboBonus = item.techMetrics?.signalComboBonus || 0;
        const signalHeatPenalty = item.techMetrics?.signalHeatPenalty || 0;
        const signalQualityState = item.techMetrics?.signalQualityState || 'NEUTRAL';
        const minerviniScore = item.techMetrics?.minerviniScore || 0;
        const dataQualityState = item.techMetrics?.dataQualityState || 'NORMAL';

        const signalQualityBonus = signalQualityState === 'ALIGNED'
            ? 4
            : signalQualityState === 'SETUP'
            ? 2
            : 0;
        composite += signalQualityBonus;

        const signalComboBonusApplied = signalComboBonus > 0 ? Math.min(4, signalComboBonus) : 0;
        const signalHeatPenaltyApplied = signalHeatPenalty > 0 ? Math.min(6, signalHeatPenalty * 0.75) : 0;
        const minerviniBonus = minerviniScore >= 87.5 ? 2 : 0;
        composite += signalComboBonusApplied;
        composite -= signalHeatPenaltyApplied;
        composite += minerviniBonus;

        let dataQualityMultiplier = 1;
        if (dataQualityState === 'THIN') dataQualityMultiplier = 0.97;
        else if (dataQualityState === 'ILLIQUID') dataQualityMultiplier = 0.82;
        else if (dataQualityState === 'STALE') dataQualityMultiplier = 0.75;
        composite *= dataQualityMultiplier;

        // Stage5 factor carry: Stage4 factor stack continuity with conservative anti-double-count scaling.
        const factorCarry = computeStage5FactorCarry(item, dataQualityState);
        composite += factorCarry.appliedCarry;
        factorCarryTotal += factorCarry.appliedCarry;
        factorCarryScaleTotal += factorCarry.carryScale;
        factorCoverageTotal += factorCarry.factorCoverage;
        factorConfidenceTotal += factorCarry.factorConfidence;
        if (factorCarry.appliedCarry > 0) factorCarryBoostCount++;
        else if (factorCarry.appliedCarry < 0) factorCarryPenaltyCount++;
        if (factorCarry.lowCoveragePenalty < 0) factorLowCoveragePenaltyCount++;
        if (factorCarry.guard === 'THIN_REDUCED') factorGuardThinCount++;
        else if (factorCarry.guard === 'ILLIQUID_BLOCK_POSITIVE') factorGuardIlliquidCount++;
        else if (factorCarry.guard === 'STALE_BLOCK_POSITIVE') factorGuardStaleCount++;

        const calibratedComposite = calibrateCompositeAlpha(composite);
        const preDiversificationComposite = Number(calibratedComposite.score.toFixed(2));
        const calibrationDelta = Number(calibratedComposite.delta.toFixed(4));

        const ticker: IctScoredTicker = {
            ...item, // [CRITICAL] Grand Consolidation: Merge all previous stage data
            symbol: item.symbol, 
            name: item.name, 
            price: item.price,
            fundamentalScore: item.fundamentalScore || 0, 
            technicalScore: item.technicalScore || 0,
            ictScore: ictAnalysis.score, 
            compositeAlpha: preDiversificationComposite,
            ictMetrics: ictAnalysis.metrics,
            marketState: marketState,
            verdict: marketState === 'MARKUP' ? 'AGGRESSIVE BUY' : marketState === 'RE-ACCUMULATION' ? 'BUY DIP' : marketState === 'ACCUMULATION' ? 'BUILD POSITION' : 'WAIT',
            radarData: [],
            sector: item.sector,
            scoringEngine: "ICT_Wyckoff_Algo_Only",
            ictEvidenceSemantics: 'OHLCV_HEURISTIC_PROXY',
            institutionalActivityVerified: false,
            isDataDoubtful, 
            compositeBreakdown: {
                mode: scoringMode,
                baseFundamentalPart: Number(baseFundamentalPart.toFixed(2)),
                baseTechnicalPart: Number(baseTechnicalPart.toFixed(2)),
                baseIctPart: Number(baseIctPart.toFixed(2)),
                fallbackPart: Number(fallbackPart.toFixed(2)),
                signalQualityBonus: Number(signalQualityBonus.toFixed(2)),
                signalComboBonus: Number(signalComboBonusApplied.toFixed(2)),
                minerviniBonus: Number(minerviniBonus.toFixed(2)),
                factorCarryApplied: factorCarry.appliedCarry,
                factorCarryScale: factorCarry.carryScale,
                factorCarryLowCoveragePenalty: factorCarry.lowCoveragePenalty,
                factorCarryGuard: factorCarry.guard,
                factorCoverage: factorCarry.factorCoverage,
                factorConfidence: factorCarry.factorConfidence,
                factorQualityScore: factorCarry.factorQualityScore,
                rsiPenalty: Number(rsiPenalty.toFixed(2)),
                heatPenalty: Number(signalHeatPenaltyApplied.toFixed(2)),
                dataDoubtfulMultiplier: Number(dataDoubtfulMultiplier.toFixed(4)),
                dataQualityMultiplier: Number(dataQualityMultiplier.toFixed(4)),
                calibrationApplied: calibratedComposite.applied,
                calibrationDelta,
                preDiversificationComposite,
                sectorDiversificationMultiplier: 1,
                postDiversificationComposite: preDiversificationComposite,
                sectorCount: 1,
                sectorBucket: 'LEADER'
            },
            
            // [NEW] ICT 5-Step Data
            ictPos: Number.isFinite(ictPos) ? Number(ictPos.toFixed(4)) : null,
            pdZone,
            otePrice,
            ictStopLoss,
            executionGeometrySource: geometry.executionGeometrySource,
            executionRangeBars: geometry.executionRangeBars,
            executionStopBars: geometry.executionStopBars,
            executionAtr: geometry.executionAtr,
            factorCarryApplied: factorCarry.appliedCarry,
            factorCarryScale: factorCarry.carryScale,
            factorCoverage: factorCarry.factorCoverage,
            factorConfidence: factorCarry.factorConfidence,
            factorQualityScore: factorCarry.factorQualityScore,
            factorCarryGuard: factorCarry.guard
        };

        results.push(ticker);

        // Update progress less frequently to reduce render load
        if (i % 50 === 0 || i === total - 1) {
            setProgress({ current: i + 1, total });
            await new Promise(r => setTimeout(r, 0)); 
        }
      }

      // [LOGS] Modernized Terminal Output
      addLog(`ICT PD-Array: Institutional Zones Mapped (Discount/Premium)`, "ok");
      addLog(`Smart Money Flow: Displacement Checked`, "ok");
      addLog(`Stage 4 Signal Bridge: Minervini / MACD / DMI Context Ingested`, "ok");
      addLog(`Final Bridge Constructed: All Alpha Tags Encoded for Stage 6 Final`, "ok");
      addLog(
          `[C9_GEOMETRY] recent_swing_atr=${c9RecentGeometryCount} | fallback_52w=${c9FallbackGeometryCount}`,
          c9FallbackGeometryCount > 0 ? "warn" : "ok"
      );
      const denominator = Math.max(total, 1);
      const avgFactorCarry = Number((factorCarryTotal / denominator).toFixed(2));
      const avgFactorScale = Number((factorCarryScaleTotal / denominator).toFixed(3));
      const avgFactorCoverage = Number((factorCoverageTotal / denominator).toFixed(1));
      const avgFactorConfidence = Number((factorConfidenceTotal / denominator).toFixed(1));
      addLog(
          `[FACTOR_CARRY] avg=${avgFactorCarry.toFixed(2)} scale=${avgFactorScale.toFixed(3)} cov=${avgFactorCoverage}% conf=${avgFactorConfidence}% | boost ${factorCarryBoostCount}, cut ${factorCarryPenaltyCount}, lowCovPenalty ${factorLowCoveragePenaltyCount}, thin ${factorGuardThinCount}, illiquid ${factorGuardIlliquidCount}, stale ${factorGuardStaleCount}`,
          "ok"
      );

      // [NEW] Sector Diversification Logic (Step 6) - Progressive Penalty Protocol
      // Strategy: Allow Momentum leaders (Top 4) but aggressively kill followers to ensure diversity.
      results.sort((a, b) => b.compositeAlpha - a.compositeAlpha || compareStage5Identity(a, b));

      const sectorCounts: Record<string, number> = {};
      const diversifiedResults = results.map((ticker, rawIndex) => {
          const sector = ticker.sectorTheme || ticker.sector || 'Unknown';
          sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
          const count = sectorCounts[sector];

          let adjustedAlpha = ticker.compositeAlpha;
          let sectorDiversificationMultiplier = 1;
          let sectorBucket: 'LEADER' | 'WARNING' | 'SATURATION' = 'LEADER';
      
          // [Stage5-D] Smoothed sector concentration penalty
          if (count <= 4) {
              // Leader zone: keep top names untouched
              sectorDiversificationMultiplier = 1;
              sectorBucket = 'LEADER';
          } else if (count <= 6) {
              // Warning zone: keep diversity pressure but avoid over-cut
              sectorDiversificationMultiplier = 0.92;
              sectorBucket = 'WARNING';
              adjustedAlpha *= sectorDiversificationMultiplier; 
          } else {
              // Saturation zone: progressively penalize, with floor guard
              sectorDiversificationMultiplier = Math.max(0.70, 1 - 0.06 * (count - 4));
              sectorBucket = 'SATURATION';
              adjustedAlpha *= sectorDiversificationMultiplier; 
          }

          const postDiversificationComposite = Number(adjustedAlpha.toFixed(2));
          const prevBreakdown = ticker.compositeBreakdown;
          const compositeBreakdown = prevBreakdown
              ? {
                    ...prevBreakdown,
                    sectorDiversificationMultiplier: Number(sectorDiversificationMultiplier.toFixed(4)),
                    postDiversificationComposite,
                    sectorCount: count,
                    sectorBucket
                }
              : undefined;

          return {
              ...ticker,
              rankRaw: rawIndex + 1,
              compositeAlpha: postDiversificationComposite,
              compositeBreakdown
          };
      });

      // Final Sort after Penalty
      diversifiedResults.sort((a, b) => b.compositeAlpha - a.compositeAlpha || compareStage5Identity(a, b));

      const finalRankedResults = diversifiedResults.map((ticker, finalIndex) => {
          const breakdown = ticker.compositeBreakdown;
          let majorPenaltyCause: IctScoredTicker['majorPenaltyCause'] = 'NONE';

          if (breakdown) {
              if ((breakdown.sectorDiversificationMultiplier || 1) < 1) majorPenaltyCause = 'SECTOR_DIVERSIFICATION';
              else if ((breakdown.dataQualityMultiplier || 1) < 1) majorPenaltyCause = 'DATA_QUALITY';
              else if ((breakdown.dataDoubtfulMultiplier || 1) < 1) majorPenaltyCause = 'PEG_DOUBT';
              else if ((breakdown.rsiPenalty || 0) > 0) majorPenaltyCause = 'RSI_OVERHEAT';
              else if ((breakdown.heatPenalty || 0) > 0) majorPenaltyCause = 'SIGNAL_HEAT';
          }

          return {
              ...ticker,
              rankFinal: finalIndex + 1,
              majorPenaltyCause,
              regimeMode: breakdown?.mode || 'FALLBACK'
          };
      });

      finalRankedResults.slice(0, 5).forEach((ticker, index) => {
          const breakdown = ticker.compositeBreakdown;
          if (!breakdown) return;
          addLog(
              `[ALPHA_BREAKDOWN] #${index + 1} ${ticker.symbol} | rank ${ticker.rankRaw}->${ticker.rankFinal} | pre ${breakdown.preDiversificationComposite.toFixed(2)} x sector ${breakdown.sectorDiversificationMultiplier.toFixed(2)} (${breakdown.sectorBucket}) => final ${ticker.compositeAlpha.toFixed(2)} | factor ${breakdown.factorCarryApplied >= 0 ? '+' : ''}${breakdown.factorCarryApplied.toFixed(2)} (${breakdown.factorCarryGuard}) | mode ${ticker.regimeMode} | cause ${ticker.majorPenaltyCause}`,
              "ok"
          );
      });

      // [Stage5-F] Sparse data guard: preserve data, but limit sparse names in Top50
      const sparseCap = 5;
      const targetCount = 50;
      const isSparseCandidate = (ticker: IctScoredTicker) => {
          const bars = Array.isArray(ticker.priceHistory) ? ticker.priceHistory.length : 0;
          const dataQualityState = ticker.techMetrics?.dataQualityState || 'NORMAL';
          return bars < 60 || dataQualityState === 'ILLIQUID' || dataQualityState === 'STALE';
      };

      const denseCandidates = finalRankedResults.filter((ticker) => !isSparseCandidate(ticker));
      const sparseCandidates = finalRankedResults.filter((ticker) => isSparseCandidate(ticker));

      let finalSurvivors = [
          ...denseCandidates.slice(0, targetCount),
          ...sparseCandidates.slice(0, sparseCap)
      ].slice(0, targetCount);

      if (finalSurvivors.length < targetCount) {
          const selectedSymbols = new Set(finalSurvivors.map((ticker) => ticker.symbol));
          const sparseOverflow = sparseCandidates
              .filter((ticker) => !selectedSymbols.has(ticker.symbol))
              .slice(0, targetCount - finalSurvivors.length);
          finalSurvivors = [...finalSurvivors, ...sparseOverflow];
          if (sparseOverflow.length > 0) {
              addLog(`[SPARSE_GUARD] Dense pool shortage: relaxed sparse cap by +${sparseOverflow.length}.`, "warn");
          }
      }

      const selectedSparseCount = finalSurvivors.filter((ticker) => isSparseCandidate(ticker)).length;
      const sparseLogType = selectedSparseCount > sparseCap ? "warn" : "ok";
      addLog(
          `[SPARSE_GUARD] dense ${denseCandidates.length} | sparse ${sparseCandidates.length} | selected sparse ${selectedSparseCount}/${sparseCap} (Top${targetCount})`,
          sparseLogType
      );
      
      setProcessedData(finalRankedResults); 
      if (finalSurvivors.length > 0) handleTickerSelect(finalSurvivors[0]);
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage5SubFolder);
      
      const timestamp = formatKstFilenameTimestamp();
      const fileName = `STAGE5_ICT_ELITE_50_${timestamp}.json`;
      const sourceStage4LineageStatus = !selectedStage4Name
        ? 'stage4_source_missing'
        : !stage4SourceStage3File
          ? 'stage4_source_stage3_missing'
          : 'present';
      
      const legacyPayload = {
        manifest: {
          version: "6.9.0",
          count: finalSurvivors.length,
          inputCount: stage4InputCount,
          eligibleCount: mergedUniverse.length,
          excludedByInstrumentType,
          timestamp: decisionAt,
          strategy: "Smart_Money_Composite_Wyckoff_Algo_V2",
          sourceStage4File: selectedStage4Name || null,
          sourceStage4FileId: selectedStage4Id || null,
          sourceStage4Timestamp: selectedStage4Timestamp || null,
          sourceStage4SourceStage3File: stage4SourceStage3File || null,
          sourceStage4FactorReady: selectedStage4FactorReady,
          sourceStage4LineageStatus,
          corporateActionLineage: {
            schemaVersion: 'corporate-action-lineage-v1',
            candidateRows: finalSurvivors.length,
            rowsWithLineage: finalSurvivors.filter(
              (row: any) => row?.corporateActionLineage?.lineageStatus === 'PRESENT'
            ).length,
            comparisonVerifiedRows: finalSurvivors.filter(
              (row: any) => row?.corporateActionLineage?.lineageVerifiedForComparison === true
            ).length,
            prospectiveSurveillanceRows: finalSurvivors.filter(
              (row: any) => row?.corporateActionLineage?.prospectiveSurveillance?.schemaVersion === 'prospective-corporate-action-surveillance-v1'
            ).length
          },
          marketRegimeLineage: {
            schemaVersion: 'market-regime-lineage-v1',
            candidateRows: finalSurvivors.length,
            rowsWithLineage: finalSurvivors.filter(
              (row: any) => row?.marketRegimeLineage?.schemaVersion === 'market-regime-lineage-v1'
            ).length,
            verifiedDecisionTimeRows: finalSurvivors.filter(
              (row: any) => row?.marketRegimeLineage?.status === 'VERIFIED_DECISION_TIME_REGIME'
            ).length
          },
          tossShadowEvidence: {
            schemaVersion: 'toss-market-data-shadow-v1',
            ...summarizeTossShadowEvidence(finalSurvivors),
            propagationMode: 'PASS_THROUGH_REPORT_ONLY',
            policyImpact: 'NONE_REPORT_ONLY'
          },
          scoringContractVersion: "stage5-e-v1",
          stage6ContractVersion: "stage5to6-e-v1"
        },
        ict_universe: finalSurvivors
      };

      const payload = await buildStage5EvidenceArtifact({ context, manifest: legacyPayload.manifest,
          rankedRows: finalRankedResults, selectedRows: finalSurvivors });
      const payloadText = JSON.stringify(payload, null, 2);
      const contentSha256 = await hashTextSha256(payloadText);
      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([payloadText], { type: 'application/json' }));

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        throw new Error(`Drive upload failed (${fileName}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }
      const uploadedMeta = await uploadRes.json().catch(() => null);
      const uploadedFileId = String(uploadedMeta?.id || '').trim();

      // Persist same-run Stage5 handoff hint so Stage6 can lock the exact file without Drive search race.
      try {
        if (typeof window !== 'undefined') {
          const hint = {
            fileId: uploadedFileId || undefined,
            fileName,
            contentSha256,
            createdAt: new Date().toISOString()
          };
          window.sessionStorage.setItem(STAGE5_RECENT_HINT_KEY, JSON.stringify(hint));
          (window as any).__LATEST_STAGE5_FILE_HINT = hint;
        }
      } catch {
        throw new Error('STAGE5_EXACT_HANDOFF_PERSISTENCE_FAILED');
      }

      addLog(`Elite 50 Selection Complete. Vault Synchronized.`, "ok");
      setProgress({ current: total, total });
      
      if (onComplete) onComplete();

    } catch (e: any) {
      const reason = /^STAGE[45]_[A-Z0-9_:,]+$/.test(String(e?.message)) ? e.message : 'STAGE5_SOURCE_IO_OR_JSON_INVALID';
      addLog(reason, "err");
    } finally {
      setLoading(false);
      startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await assertDriveOk(listRes, `ensureFolder.list(${name})`);
    const listed = await listRes.json();
    if (listed.files?.length > 0) return listed.files[0].id;
    const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    });
    await assertDriveOk(createRes, `ensureFolder.create(${name})`);
    const created = await createRes.json();
    if (!created?.id) throw new Error(`Drive ensureFolder.create(${name}) succeeded but missing folder id`);
    return created.id;
  };

  const findFolderId = async (token: string, name: string) => {
    const q = encodeURIComponent(
      `name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`
    );
    const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    await assertDriveOk(listRes, `findFolderId(${name})`);
    const listed = await listRes.json();
    return listed.files?.[0]?.id || null;
  };

  const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    if (s.includes('finance')) return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    if (s.includes('health')) return 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-indigo-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">ICT_Nexus v6.9.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-indigo-400 text-indigo-400 animate-pulse' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'}`}>
                            {loading ? `Scanning Order Blocks: ${progress.current}/${progress.total}` : 'Institutional Footprint Active'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span>
                       </span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span>
                       </span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeIntegratedIctProtocol} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-indigo-800 text-indigo-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Sieging Smart Money...' : 'Execute Institutional Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW - INSTITUTIONAL RANK */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Institutional Rank ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Sorted by Composite Alpha</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-indigo-400' : 'text-slate-500'}`}>{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <div className="flex items-center gap-2">
                                         <p className="text-[8px] text-slate-400 truncate w-16">{t.name}</p>
                                         <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                             <div className="h-full bg-indigo-500" style={{ width: `${t.ictMetrics.smartMoneyFlow}%` }}></div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                             <div className="text-right flex flex-col items-end">
                                 <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded mb-0.5 ${
                                     t.marketState === 'MARKUP' ? 'bg-emerald-500/20 text-emerald-400' : 
                                     t.marketState === 'ACCUMULATION' ? 'bg-indigo-500/20 text-indigo-400' : 
                                     t.marketState === 'MANIPULATION' ? 'bg-amber-500/20 text-amber-400' : 
                                     t.marketState === 'RE-ACCUMULATION' ? 'bg-cyan-500/20 text-cyan-400' : 
                                     'bg-slate-800 text-slate-500'
                                 }`}>
                                     {t.marketState === 'RE-ACCUMULATION' ? 'RE-ACCUM' : t.marketState}
                                 </span>
                                 <p className="text-[10px] font-mono font-bold text-white">{t.ictScore.toFixed(0)} <span className="text-[7px] text-slate-600">ICT</span></p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Waiting for Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - SMART MONEY COCKPIT */}
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
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${getSectorStyle(selectedTicker.sector)}`}>
                                        {selectedTicker.sector}
                                    </span>
                                    {/* Market State Badge with Insight Overlay */}
                                    <span 
                                        className={`insight-badge group flex items-center gap-1 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border cursor-help hover:opacity-80 transition-opacity ${
                                            selectedTicker.marketState === 'MARKUP' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                            selectedTicker.marketState === 'RE-ACCUMULATION' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' :
                                            selectedTicker.marketState === 'ACCUMULATION' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                                            selectedTicker.marketState === 'MANIPULATION' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                        }`}
                                        onClick={() => setActiveInsight(selectedTicker.marketState)}
                                    >
                                        {selectedTicker.marketState}
                                        <svg className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </span>
                                    
                                    {/* Data Fidelity Indicator */}
                                    {selectedTicker.priceHistory && selectedTicker.priceHistory.length > 5 ? (
                                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-slate-800 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Deep Scan
                                        </span>
                                    ) : (
                                        <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border bg-slate-800 text-amber-400 border-amber-500/30 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Heuristic Mode
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">ICT Score</p>
                                 <p className="text-2xl font-black text-indigo-400 tracking-tighter">{selectedTicker.ictScore.toFixed(1)}</p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4 my-2">
                            {isVisible && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(selectedTicker)}>
                                        <PolarGrid stroke="#334155" opacity={0.3} />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name={selectedTicker.symbol} dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.4} />
                                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#6366f1', fontSize: '10px' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* 4 Core ICT Metrics Cards - CLICKABLE */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                { id: 'DISPLACEMENT', label: 'Displacement', val: selectedTicker.ictMetrics.displacement.toFixed(0), good: selectedTicker.ictMetrics.displacement > 70 },
                                { id: 'MSS', label: 'Structure (MSS)', val: selectedTicker.ictMetrics.marketStructure > 70 ? 'BREAK' : 'WEAK', good: selectedTicker.ictMetrics.marketStructure > 70 },
                                { id: 'SWEEP', label: 'Sweep', val: selectedTicker.ictMetrics.liquiditySweep > 80 ? 'YES' : 'NO', good: selectedTicker.ictMetrics.liquiditySweep > 80 },
                                { id: 'WHALES', label: 'SmartFlow', val: `${selectedTicker.ictMetrics.smartMoneyFlow.toFixed(0)}%`, good: selectedTicker.ictMetrics.smartMoneyFlow > 80 }
                             ].map((m) => (
                                 <div 
                                    key={m.id}
                                    onClick={() => setActiveInsight(m.id)}
                                    className={`insight-card p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 group ${activeInsight === m.id ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900/50 border-white/5 hover:bg-slate-800'}`}
                                 >
                                     <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <p className={`text-[7px] uppercase font-bold ${activeInsight === m.id ? 'text-white' : 'text-slate-500'}`}>{m.label}</p>
                                        <svg className={`w-2 h-2 ${activeInsight === m.id ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                     </div>
                                     <p className={`text-[10px] font-black ${m.good ? 'text-emerald-400' : 'text-slate-300'}`}>
                                         {m.val}
                                     </p>
                                 </div>
                             ))}
                        </div>

                        {/* Insight Overlay */}
                        {activeInsight && (
                            <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-indigo-500/30 shadow-2xl relative">
                                    <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    {ICT_DEFINITIONS[activeInsight] ? (
                                        <>
                                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                                {ICT_DEFINITIONS[activeInsight].title}
                                            </h5>
                                            <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{ICT_DEFINITIONS[activeInsight].desc}</p>
                                            <div className="bg-white/5 p-2 rounded border border-white/5">
                                                <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Insight:</p>
                                                <p className="text-[8px] text-slate-400">{ICT_DEFINITIONS[activeInsight].interpretation}</p>
                                            </div>
                                        </>
                                    ) : MARKET_STATE_INFO[activeInsight] ? (
                                        <>
                                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                                                {activeInsight} PHASE
                                            </h5>
                                            <p className="text-[9px] text-slate-300 leading-relaxed font-medium">{MARKET_STATE_INFO[activeInsight]}</p>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">ICT_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-indigo-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-indigo-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IctAnalysis;
