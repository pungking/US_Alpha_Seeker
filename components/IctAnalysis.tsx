
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, STRATEGY_CONFIG } from '../constants';

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

interface Stage5MarketRegimeSnapshot {
  trigger_file?: string;
  sourceStage3File?: string;
  stage3_file?: string;
  manifest?: {
    sourceStage3File?: string;
  };
  benchmarks?: {
    vix?: {
      close?: number;
    };
  };
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
}

// [KNOWLEDGE BASE] Institutional Grade Definitions
const ICT_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'DISPLACEMENT': {
        title: "Displacement (세력 개입)",
        desc: "기관(Smart Money)의 의도적인 가격 이동입니다. 높은 RVOL과 장대 양봉(Expansion)은 세력이 시장가로 물량을 쓸어담았다는(Aggressive Buy) 증거입니다.",
        interpretation: "Score > 70: 단순 변동성이 아닌, 세력의 자금이 투입된 '진짜 상승'입니다."
    },
    'MSS': {
        title: "Market Structure (시장 구조)",
        desc: "하락 파동(Lower Highs)을 깨고 상승 파동(Higher Highs)으로 전환되는 지점입니다. 추세 반전의 가장 신뢰도 높은 기술적 신호입니다.",
        interpretation: "BREAK 확인 시: 눌림목(Retracement)은 매도 기회가 아니라 '강력한 매수 기회'가 됩니다."
    },
    'SWEEP': {
        title: "Liquidity Sweep (유동성 확보)",
        desc: "주요 지지/저항 라인을 살짝 붕괴시켜 개인의 손절 물량(Stop Loss)을 유도하고, 그 유동성을 이용해 포지션을 진입하는 기관의 테크닉입니다.",
        interpretation: "YES: 세력이 개미를 털어내고(Stop Hunt) 연료를 확보했습니다. 곧 급반전이 예상됩니다."
    },
    'WHALES': {
        title: "Smart Money Flow (노력 vs 결과)",
        desc: "와이코프(Wyckoff) 이론에 기반하여 거래량(노력) 대비 가격 변동(결과)의 효율성을 분석합니다. 거래량은 터지는데 가격이 지켜진다면 매집입니다.",
        interpretation: "80% 이상: 완벽한 매집. 기관이 유통 물량을 잠그고(Lock-up) 슈팅을 준비 중입니다."
    }
};

const MARKET_STATE_INFO: Record<string, string> = {
    'ACCUMULATION': "매집 (Accumulation): 세력이 바닥권에서 물량을 조용히 모으는 단계. 하락은 멈췄으나 상승 전 에너지를 응축 중.",
    'MARKUP': "상승 (Markup): 매집 완료 후 가격을 들어 올리는 단계. 추세가 형성되었으므로 적극적인 추격 매수(Momentum) 유효.",
    'DISTRIBUTION': "분산 (Distribution): 고점에서 거래량은 터지지만 가격이 못 가는 단계. 세력이 개인에게 물량을 떠넘기는 중. 매도 관점.",
    'MANIPULATION': "속임수 (Manipulation): 방향성을 주기 전 위아래로 흔들어 손절을 유도하는 구간. 휩소(Whipsaw) 주의.",
    'RE-ACCUMULATION': "재매집 (Re-Accumulation): 상승 도중 숨고르기. 차익 실현 물량을 세력이 다시 받아내며 2차 상승을 준비하는 건전한 조정."
};

// [QUANT ENGINE v6.9] Robust ICT Logic (Algorithmic)
const calculateIctScore = (item: any) => {
    const rvol = item.techMetrics?.rawRvol || item.techMetrics?.rvol || 1.0;
    const momentum = item.techMetrics?.momentum || 50;
    const trendScore = item.techMetrics?.trend || 50;
    const macdHistogram = item.techMetrics?.macdHistogram || 0;
    const mfi = item.techMetrics?.mfi || 50;
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
    let hasFullData = false;

    if (priceHistory.length >= 5) {
        hasFullData = true;
        const lastCandle = priceHistory[priceHistory.length - 1];
        const prevCandle = priceHistory[priceHistory.length - 2];
        
        // Calculate Candle Parts
        const open = lastCandle.open || prevCandle.close; 
        const close = lastCandle.close;
        const high = lastCandle.high || Math.max(open, close); 
        const low = lastCandle.low || Math.min(open, close);   
        
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
        // [FALLBACK] Heuristic for missing history
        // If high RVOL and High Daily Change -> Strong Body
        if (absChange > 2.0 && rvol > 1.2) bodyStrength = 80; 
        else if (absChange < 0.5) bodyStrength = 20; 
    }

    // --- 2. Displacement (Force of Move) ---
    // Log normalized RVOL is already in item.techMetrics.rvol (0-100 scale), rawRvol is the ratio
    const rvolScore = item.techMetrics?.rvol || 50;
    
    let displacement = Math.min(100, (rvolScore * 0.4) + (momentum * 0.4));
    if (bodyStrength > 60) displacement += 15; 
    if (recentGap > 0) displacement += 15; 
    if (trendScore > 80) displacement += 10;
    if (macdHistogram > 0) displacement += Math.min(6, macdHistogram * 10);
    else if (macdHistogram < -0.3) displacement -= 4;
    if (signalComboBonus > 0) displacement += Math.min(6, signalComboBonus * 2);
    
    // Normalize Fallback: if data missing but change is high positive
    if (!hasFullData && dailyChange > 1.5) displacement = Math.max(displacement, 70);

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
    const rsi = item.techMetrics?.rsRating || 50;
    
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
            displacement: Number(Math.min(100, displacement).toFixed(2)),
            liquiditySweep: Number(Math.min(100, sweepScore).toFixed(2)),
            marketStructure: Number(Math.min(100, mss).toFixed(2)),
            orderBlock: Number(Math.min(100, obScore).toFixed(2)),
            smartMoneyFlow: Number(Math.min(100, smFlow).toFixed(2))
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

type PriceHistoryBar = {
    high: number;
    low: number;
    close: number;
};

const normalizePriceHistoryBars = (priceHistory: any): PriceHistoryBar[] => {
    if (!Array.isArray(priceHistory)) return [];

    return priceHistory
        .map((candle: any) => {
            const highRaw = Number(candle?.high);
            const lowRaw = Number(candle?.low);
            const closeRaw = Number(candle?.close ?? candle?.c);

            if (!Number.isFinite(highRaw) || !Number.isFinite(lowRaw)) return null;
            const high = Math.max(highRaw, lowRaw);
            const low = Math.min(highRaw, lowRaw);
            const mid = (high + low) / 2;
            const close = Number.isFinite(closeRaw) ? closeRaw : mid;

            return { high, low, close };
        })
        .filter((bar): bar is PriceHistoryBar => Boolean(bar));
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
    const high52 = Number(item?.fiftyTwoWeekHigh || item?.high52 || item?.price * 1.2 || 0);
    const low52 = Number(item?.fiftyTwoWeekLow || item?.low52 || item?.price * 0.8 || 0);
    const fallbackRange = Math.max(0, high52 - low52);
    const fallbackOte = fallbackRange > 0 ? high52 - (fallbackRange * Number(STRATEGY_CONFIG.ICT_OTE_LEVEL ?? 0.705)) : Number(item?.price || 0);
    const fallbackStop = low52 > 0 ? low52 * 0.985 : Number(item?.price || 0) * 0.9;
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

            if (!Number.isFinite(stop) || stop <= 0) stop = fallbackStop;
            if (Number.isFinite(recentOte) && stop >= recentOte) {
                stop = Math.min(recentLowStop * 0.995, recentOte * 0.985);
            }

            return {
                high52,
                low52,
                ictPos: clamp01((Number(item?.price || 0) - recentLow) / recentRange),
                otePrice: recentOte,
                ictStopLoss: Math.max(0.01, stop),
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
        otePrice: fallbackOte,
        ictStopLoss: Math.max(0.01, fallbackStop),
        executionGeometrySource: "FALLBACK_52W",
        executionRangeBars: rangeBars.length,
        executionStopBars: stopBars.length,
        executionAtr: null
    };
};

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
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Institutional Footprint Scanner...", "signal");
        executeIntegratedIctProtocol();
    }
  }, [autoStart]);

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
      const fullQuery = encodeURIComponent(`name contains 'STAGE4_TECHNICAL_FULL' and trashed = false`);

      // [RESILIENCE] Retry Logic for Drive Latency (3 Attempts)
      let fullRes: any = { files: [] };
      for (let attempt = 1; attempt <= 3; attempt++) {
          try {
              const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fullQuery}&orderBy=createdTime desc&pageSize=5`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              if (res.ok) {
                  fullRes = await res.json();
                  if (fullRes.files?.length > 0) break;
              }
          } catch (e) { console.warn(`Drive Scan Attempt ${attempt} failed.`); }
          
          if (attempt < 3) {
              addLog(`Scanning Vault... (Attempt ${attempt}/3)`, "warn");
              await new Promise(r => setTimeout(r, 2000)); // Wait 2s
          }
      }

      let mergedUniverse: any[] = [];
      let stage4SourceStage3File: string | null = null;

      if (fullRes.files?.length) {
          const latestFull = fullRes.files[0];
          try {
              const content = await fetch(`https://www.googleapis.com/drive/v3/files/${latestFull.id}?alt=media`, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
              }).then(r => r.json());

              if (content.technical_universe && Array.isArray(content.technical_universe)) {
                  mergedUniverse = content.technical_universe;
                  stage4SourceStage3File = content?.manifest?.sourceStage3File || null;
                  addLog(`Stage 4 Full Vault Locked: ${latestFull.name}`, "ok");
              }
          } catch (e) {
              console.warn(`Failed to load Stage 4 full file ${latestFull.name}`, e);
              addLog(`Warning: Failed to load ${latestFull.name}`, "warn");
          }
      }

      if (mergedUniverse.length === 0) {
          addLog("CRITICAL: Stage 4 data missing or unreadable. Pipeline Aborted.", "err");
          setLoading(false);
          return;
      }

      addLog(`Data Load Complete. ${mergedUniverse.length} Tickers Loaded.`, "ok");

      // [Stage5-B] Contract validation (warn-only): required field completeness check
      const contractRequiredChecks: Array<{ label: string; valid: (ticker: any) => boolean }> = [
          { label: 'symbol', valid: (t) => typeof t?.symbol === 'string' && t.symbol.trim().length > 0 },
          { label: 'name', valid: (t) => typeof t?.name === 'string' && t.name.trim().length > 0 },
          { label: 'price', valid: (t) => Number.isFinite(Number(t?.price)) && Number(t.price) > 0 },
          { label: 'fundamentalScore', valid: (t) => Number.isFinite(Number(t?.fundamentalScore)) },
          { label: 'technicalScore', valid: (t) => Number.isFinite(Number(t?.technicalScore)) },
          { label: 'techMetrics', valid: (t) => !!t?.techMetrics && typeof t.techMetrics === 'object' },
          { label: 'techMetrics.rsRating', valid: (t) => Number.isFinite(Number(t?.techMetrics?.rsRating)) },
          { label: 'techMetrics.rvol', valid: (t) => Number.isFinite(Number(t?.techMetrics?.rvol)) }
      ];

      const missingRows = mergedUniverse
          .map((ticker: any, idx: number) => {
              const missing = contractRequiredChecks
                  .filter((check) => !check.valid(ticker))
                  .map((check) => check.label);
              return {
                  symbol: ticker?.symbol || `IDX_${idx + 1}`,
                  missing
              };
          })
          .filter((row) => row.missing.length > 0);

      const missingRate = mergedUniverse.length > 0
          ? (missingRows.length / mergedUniverse.length) * 100
          : 0;
      const contractWarnThresholdPct = 5;
      const contractAbortThresholdPct = 10;

      if (missingRows.length > 0) {
          addLog(
              `Stage4 Contract Check: ${missingRows.length}/${mergedUniverse.length} incomplete rows (${missingRate.toFixed(1)}%).`,
              "warn"
          );
          missingRows.slice(0, 3).forEach((row) => {
              addLog(`[CONTRACT_WARN] ${row.symbol} missing -> ${row.missing.join(', ')}`, "warn");
          });
          if (missingRate >= contractAbortThresholdPct) {
              addLog(
                  `Stage4 Contract Hard Stop: missing rate ${missingRate.toFixed(1)}% >= ${contractAbortThresholdPct}%. Pipeline aborted.`,
                  "err"
              );
              throw new Error("STAGE4_CONTRACT_ABORT_THRESHOLD_EXCEEDED");
          }
          if (missingRate >= contractWarnThresholdPct) {
              addLog(
                  `Stage4 Contract Alert: missing rate ${missingRate.toFixed(1)}% >= ${contractWarnThresholdPct}%.`,
                  "warn"
              );
          }
      } else {
          addLog(`Stage4 Contract Check: 0/${mergedUniverse.length} incomplete rows.`, "ok");
      }

        // [CHECK] Sort by technical score to prioritize momentum, but also respect Fundamental
      const targets = mergedUniverse
         .map((t: any) => ({
             ...t,
             // Create a temporary Total Alpha for pre-sorting
             tempScore: (t.technicalScore * 0.6) + (t.fundamentalScore * 0.4) 
         }))
         .sort((a: any, b: any) => b.tempScore - a.tempScore);
         
      // [Stage5 P0-1] Sync VIX from Stage4 snapshot (fallback to 20 only when unavailable)
      let vix = 20;
      const regimeSourceFolderId =
          (await findFolderId(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder)) ||
          (await findFolderId(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder));
      if (regimeSourceFolderId) {
          const snapshotRes = await loadLatestJsonFromFolder<Stage5MarketRegimeSnapshot>(
              accessToken,
              regimeSourceFolderId,
              'MARKET_REGIME_SNAPSHOT.json'
          );
          const snapshotTrigger =
              snapshotRes?.data?.trigger_file ||
              snapshotRes?.data?.sourceStage3File ||
              snapshotRes?.data?.stage3_file ||
              snapshotRes?.data?.manifest?.sourceStage3File ||
              null;

          if (stage4SourceStage3File && snapshotTrigger) {
              if (stage4SourceStage3File === snapshotTrigger) {
                  addLog(`Stage4↔Regime Contract: trigger matched (${stage4SourceStage3File})`, "ok");
              } else {
                  addLog(`Stage4↔Regime Contract mismatch: Stage4=${stage4SourceStage3File} / Regime=${snapshotTrigger}`, "warn");
              }
          } else {
              addLog(`Stage4↔Regime Contract: trigger metadata incomplete (warn-only).`, "warn");
          }

          const snapshotVix = Number(snapshotRes?.data?.benchmarks?.vix?.close);
          if (Number.isFinite(snapshotVix) && snapshotVix > 0) {
              vix = snapshotVix;
              addLog(`Risk Protocol Synced: VIX ${vix.toFixed(2)} from ${snapshotRes.name}`, "ok");
          } else {
              addLog(`Risk Protocol Fallback: VIX 20 (snapshot unavailable)`, "warn");
          }
      } else {
          addLog(`Risk Protocol Fallback: VIX 20 (Stage4 folder not found)`, "warn");
      }

      const total = targets.length;
      setProgress({ current: 0, total });

      // [VIX] Dynamic Risk Weighting (synced from snapshot when available)
      const isFearMode = vix > STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL;
      if (isFearMode) addLog(`Risk Protocol: VIX ${vix} > ${STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL}. Defensive Mode Active.`, "warn");

      const results: IctScoredTicker[] = [];
      let c9RecentGeometryCount = 0;
      let c9FallbackGeometryCount = 0;

      for (let i = 0; i < total; i++) {
        const item = targets[i];
        
        // Pure Algo Logic
        const ictAnalysis = calculateIctScore(item);
        
        // [ICT 5-Step Logic] P/D Array & OTE Calculation
        // C9: prefer recent swing/ATR geometry, fallback to 52w when data is sparse
        const geometry = resolveIctExecutionGeometry(item);
        if (geometry.executionGeometrySource === "RECENT_SWING_ATR") c9RecentGeometryCount++;
        else c9FallbackGeometryCount++;
        let ictPos = Number(item?.ictPos);
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
        const rvol = item.techMetrics?.rvol || 1.0;
        if (ictAnalysis.metrics.liquiditySweep > 50 && rvol > 1.5) {
            ictAnalysis.score += 10;
            ictAnalysis.metrics.liquiditySweep = Math.min(100, ictAnalysis.metrics.liquiditySweep + 20);
        }

        // Re-clamp score 0-100
        ictAnalysis.score = Math.min(100, Math.max(0, ictAnalysis.score));

        const marketState = determineMarketState(ictAnalysis.metrics);
        
        // [RISK] RSI Penalty & PEG Check
        const rsi = item.techMetrics?.rsi || item.techMetrics?.rsRating || 50;
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
        
        if (item.technicalScore > 0) {
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
            executionAtr: geometry.executionAtr
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

      // [NEW] Sector Diversification Logic (Step 6) - Progressive Penalty Protocol
      // Strategy: Allow Momentum leaders (Top 4) but aggressively kill followers to ensure diversity.
      results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);

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
      diversifiedResults.sort((a, b) => b.compositeAlpha - a.compositeAlpha);

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
              `[ALPHA_BREAKDOWN] #${index + 1} ${ticker.symbol} | rank ${ticker.rankRaw}->${ticker.rankFinal} | pre ${breakdown.preDiversificationComposite.toFixed(2)} x sector ${breakdown.sectorDiversificationMultiplier.toFixed(2)} (${breakdown.sectorBucket}) => final ${ticker.compositeAlpha.toFixed(2)} | mode ${ticker.regimeMode} | cause ${ticker.majorPenaltyCause}`,
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
      
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      const fileName = `STAGE5_ICT_ELITE_50_${timestamp}.json`;
      
      const payload = {
        manifest: {
          version: "6.9.0",
          count: finalSurvivors.length,
          timestamp: new Date().toISOString(),
          strategy: "Smart_Money_Composite_Wyckoff_Algo_V2",
          scoringContractVersion: "stage5-e-v1",
          stage6ContractVersion: "stage5to6-e-v1"
        },
        ict_universe: finalSurvivors
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

      addLog(`Elite 50 Selection Complete. Vault Synchronized.`, "ok");
      setProgress({ current: total, total });
      
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Institutional Protocol Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
      startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    return await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json()).then(r => r.id);
  };

  const findFolderId = async (token: string, name: string) => {
    const q = encodeURIComponent(
      `name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'`
    );
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    return res.files?.[0]?.id || null;
  };

  const loadLatestJsonFromFolder = async <T,>(token: string, folderId: string, fileName: string): Promise<{ data: T | null; name: string | null }> => {
    try {
      const q = encodeURIComponent(`name = '${fileName}' and '${folderId}' in parents and trashed = false`);
      const search = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());

      const latest = search.files?.[0];
      if (!latest?.id) return { data: null, name: null };

      const data = await fetch(`https://www.googleapis.com/drive/v3/files/${latest.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());

      return { data: data as T, name: latest.name || fileName };
    } catch {
      return { data: null, name: null };
    }
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
