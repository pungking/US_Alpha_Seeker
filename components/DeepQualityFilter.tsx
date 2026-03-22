
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';
import { formatKstFilenameTimestamp } from '../services/timeService';

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

// [KNOWLEDGE BASE] Quant Metric Definitions
const QUANT_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'ROE': {
        title: "ROE (자기자본이익률)",
        desc: "주주가 맡긴 자본을 사용하여 회사가 얼마나 효율적으로 이익을 냈는지 나타냅니다. 기업의 '돈 버는 실력'을 보여주는 가장 핵심적인 지표입니다.",
        strategy: "15% 이상이면 우량, 20% 이상이면 초우량 기업입니다. 지속적으로 상승하는 종목에 주목하십시오."
    },
    'DEBT': {
        title: "Debt/Equity (부채비율)",
        desc: "자기자본 대비 부채의 비율입니다. 수치가 높을수록 금리 인상기나 불황기에 파산 위험이 높아집니다.",
        strategy: "1.0(100%) 미만을 건전한 것으로 봅니다. 2.0을 초과하면 재무 리스크가 큽니다."
    },
    'PROFIT_SCORE': {
        title: "Profitability Score (수익성)",
        desc: "영업이익률, ROE, ROA 등을 종합하여 산출한 기업의 기초 체력 점수입니다.",
        strategy: "70점 이상: 강력한 현금 창출 능력. 하락장에서도 주가 방어력이 높습니다."
    },
    'Z_SCORE': {
        title: "Distress Risk Score (부도위험 스코어)",
        desc: "비금융주는 Altman Z-Score(원데이터 기반), 금융주는 섹터 적합 안정성 모델로 산출합니다. 동일 라벨이지만 계산식은 섹터별로 다릅니다.",
        strategy: "Altman 모델은 2.99↑ 안전 / 1.8↓ 위험으로 해석합니다. 금융주 모델은 '상대 안정성 점수'이므로 섹터 내 순위와 Safety/현금흐름을 함께 보십시오."
    },
    'SAFETY_SCORE': {
        title: "Safety Score (재무안정성)",
        desc: "부채비율, 유동비율, 이자보상배율을 종합한 안전마진 점수입니다.",
        strategy: "80점 이상: '망하지 않을 기업'. 장기 투자의 필수 조건입니다."
    },
    'VALUE_SCORE': {
        title: "Value Score (저평가 매력)",
        desc: "PER, PBR 등을 과거 평균 및 섹터와 비교한 가격 매력도입니다.",
        strategy: "높을수록 싸다는 의미이나, Profit Score가 낮은데 Value만 높다면 '싼 게 비지떡'일 수 있습니다."
    }
};

// ... (Rest of utils code remains same) ...

// --- QUANT ENGINE UTILS ---

const imputeValue = (val: any, fallback: number, allowZero: boolean = false): number => {
    if (val === null || val === undefined || val === '') return fallback;
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    if (num === 0 && !allowZero) return fallback; 
    return num;
};

const winsorize = (val: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, val));
};

const clampScore = (val: number): number => Math.min(100, Math.max(0, val));
const clamp01 = (val: number): number => Math.min(1, Math.max(0, val));

type DistressScoreModel = 'ALTMAN_Z' | 'FINANCIAL_STABILITY' | 'SAFETY_PROXY';
type DistressScoreResult = {
    value: number;
    model: DistressScoreModel;
    coveragePct: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
};

const toFiniteNumber = (value: any): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const firstFiniteNumber = (...values: any[]): number | null => {
    for (const value of values) {
        const n = toFiniteNumber(value);
        if (n !== null) return n;
    }
    return null;
};

const toDistressConfidence = (coveragePct: number): 'HIGH' | 'MEDIUM' | 'LOW' => {
    if (coveragePct >= 90) return 'HIGH';
    if (coveragePct >= 70) return 'MEDIUM';
    return 'LOW';
};

const computeDistressScore = (
    item: any,
    isFinancial: boolean,
    roe: number,
    roa: number,
    rawDebtRatio: any
): DistressScoreResult => {
    const totalAssets = toFiniteNumber(item.totalAssets);
    const totalLiabilities = toFiniteNumber(item.totalLiabilities);
    const currentAssets = toFiniteNumber(item.currentAssets);
    const currentLiabilities = toFiniteNumber(item.currentLiabilities);
    const workingCapital = firstFiniteNumber(
        item.workingCapital,
        currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null
    );
    const retainedEarnings = toFiniteNumber(item.retainedEarnings);
    const ebit = toFiniteNumber(item.ebit);
    const totalRevenue = toFiniteNumber(item.totalRevenue);
    const marketCap = firstFiniteNumber(item.marketCap, item.marketCapRaw, item.market_cap);
    const debtRatio = toFiniteNumber(rawDebtRatio);

    if (!isFinancial) {
        const inputs = [workingCapital, retainedEarnings, ebit, marketCap, totalRevenue];
        const available = inputs.filter((v) => v !== null).length;
        const coveragePct = Number(((available / inputs.length) * 100).toFixed(1));

        if (
            totalAssets !== null &&
            totalAssets > 0 &&
            totalLiabilities !== null &&
            totalLiabilities > 0 &&
            workingCapital !== null &&
            retainedEarnings !== null &&
            ebit !== null &&
            marketCap !== null &&
            totalRevenue !== null
        ) {
            const altman =
                1.2 * (workingCapital / totalAssets) +
                1.4 * (retainedEarnings / totalAssets) +
                3.3 * (ebit / totalAssets) +
                0.6 * (marketCap / totalLiabilities) +
                1.0 * (totalRevenue / totalAssets);
            return {
                value: Number(winsorize(altman, -2, 8).toFixed(2)),
                model: 'ALTMAN_Z',
                coveragePct,
                confidence: toDistressConfidence(coveragePct)
            };
        }

        // If raw financial statements are partially missing, degrade to a transparent safety proxy.
        const roeNorm = clamp01((roe + 10) / 35);
        const roaNorm = clamp01((roa + 2) / 10);
        const debtNorm = debtRatio === null ? 0.45 : clamp01(1 - (Math.max(debtRatio, 0) / 2.5));
        const liquidityNorm =
            currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0
                ? clamp01((currentAssets / currentLiabilities) / 2)
                : 0.5;
        const proxy = 1 + ((roeNorm * 0.35) + (roaNorm * 0.2) + (debtNorm * 0.35) + (liquidityNorm * 0.1)) * 2.5;
        return {
            value: Number(proxy.toFixed(2)),
            model: 'SAFETY_PROXY',
            coveragePct,
            confidence: toDistressConfidence(coveragePct)
        };
    }

    // Financial sector model: Altman is not structurally valid for banks/insurers.
    const financialInputs = [
        Number.isFinite(roe) ? 1 : 0,
        Number.isFinite(roa) ? 1 : 0,
        debtRatio !== null ? 1 : 0,
        totalAssets !== null && totalLiabilities !== null && totalAssets > 0 ? 1 : 0
    ];
    const coveragePct = Number(((financialInputs.reduce((sum, v) => sum + v, 0) / financialInputs.length) * 100).toFixed(1));
    const roeNorm = clamp01((roe + 5) / 20);
    const roaNorm = clamp01((roa + 1) / 4);
    const leverageNorm = debtRatio === null ? 0.5 : clamp01(1 - (Math.max(debtRatio, 0) / 8));
    const capitalRatio =
        totalAssets !== null && totalLiabilities !== null && totalAssets > 0
            ? (totalAssets - totalLiabilities) / totalAssets
            : null;
    const capitalNorm = capitalRatio === null ? 0.5 : clamp01((capitalRatio + 0.1) / 0.3);
    const stability = 1 + ((roeNorm * 0.35) + (roaNorm * 0.25) + (leverageNorm * 0.2) + (capitalNorm * 0.2)) * 2.5;
    return {
        value: Number(stability.toFixed(2)),
        model: 'FINANCIAL_STABILITY',
        coveragePct,
        confidence: toDistressConfidence(coveragePct)
    };
};

const sanitizeData = (item: any) => {
    let { dividendYield, roe, operatingMargins, pbr, debtToEquity } = item;
    if (dividendYield > 50) dividendYield = dividendYield / 100;
    if (roe > 200) roe = roe / 100;
    if (operatingMargins > 100) operatingMargins = operatingMargins / 100;
    if (pbr > 500) pbr = 0;
    return { ...item, dividendYield, roe, operatingMargins, pbr, debtToEquity };
};

const HISTORY_REVENUE_KEYS = ['Total Revenue', 'Revenue', 'Operating Revenue', 'Net Sales', 'Sales'];
const HISTORY_OPERATING_INCOME_KEYS = ['Operating Income', 'Operating Income Loss'];
const HISTORY_NET_INCOME_KEYS = ['Net Income', 'Net Income Common Stockholders', 'Net Income Including Noncontrolling Interests'];
const HISTORY_DEBT_KEYS = [
    'Total Debt',
    'Total Debt And Capital Lease Obligation',
    'Long Term Debt',
    'Current Debt',
    'Current Debt And Capital Lease Obligation'
];

const getHistoryDateMs = (row: any): number => {
    const raw = row?.date || row?.asOfDate || row?.periodEndDate;
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(t) ? t : NaN;
};

const getHistoryNumber = (row: any, keys: string[]): number | null => {
    if (!row || typeof row !== 'object') return null;
    for (const key of keys) {
        const value = row[key];
        const num = Number(value);
        if (Number.isFinite(num)) return num;
    }
    return null;
};

const normalizeHistoryRows = (raw: any): any[] => {
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.financials)) return raw.financials;
        const keys = Object.keys(raw).filter((k) => !k.startsWith('_'));
        return keys.map((k) => ({ date: k, ...(raw[k] || {}) }));
    }
    return [];
};

const normalizeScore = (val: number, min: number, max: number) => {
    if (val <= min) return 0;
    if (val >= max) return 100;
    return ((val - min) / (max - min)) * 100;
};

const computeFiveYearTrendSignals = (rawHistory: any, maxAdjustment = 5) => {
    const rows = normalizeHistoryRows(rawHistory)
        .map((row) => ({ ...row, __dateMs: getHistoryDateMs(row) }))
        .filter((row) => Number.isFinite(row.__dateMs))
        .sort((a, b) => a.__dateMs - b.__dateMs);

    if (!rows.length) {
        return { available: false, score: 50, adjustment: 0, coverage: 0, revenueCagrPct: null, marginDeltaPct: null, debtImprovementPct: null };
    }

    const annualRows = rows.filter((row) => String(row._periodType || '').toUpperCase() === 'ANNUAL');
    const trendRows = annualRows.length >= 3 ? annualRows : rows;

    const firstLastMetric = (resolver: (row: any) => number | null) => {
        const values = trendRows
            .map((row) => ({ row, value: resolver(row) }))
            .filter((x) => x.value !== null && Number.isFinite(Number(x.value)));
        if (values.length < 2) return null;
        return { first: Number(values[0].value), last: Number(values[values.length - 1].value), firstRow: values[0].row, lastRow: values[values.length - 1].row };
    };

    const revenuePair = firstLastMetric((row) => {
        const revenue = getHistoryNumber(row, HISTORY_REVENUE_KEYS);
        return revenue && revenue > 0 ? revenue : null;
    });
    let revenueCagrPct: number | null = null;
    let revenueScore: number | null = null;
    if (revenuePair) {
        const yearSpan = Math.max(1, (revenuePair.lastRow.__dateMs - revenuePair.firstRow.__dateMs) / (1000 * 60 * 60 * 24 * 365));
        if (revenuePair.first > 0 && revenuePair.last > 0) {
            revenueCagrPct = (Math.pow(revenuePair.last / revenuePair.first, 1 / yearSpan) - 1) * 100;
            revenueScore = normalizeScore(revenueCagrPct, -10, 18);
        }
    }

    const marginPair = firstLastMetric((row) => {
        const revenue = getHistoryNumber(row, HISTORY_REVENUE_KEYS);
        if (!revenue || revenue <= 0) return null;
        const operatingIncome = getHistoryNumber(row, HISTORY_OPERATING_INCOME_KEYS);
        const netIncome = getHistoryNumber(row, HISTORY_NET_INCOME_KEYS);
        const numerator = operatingIncome !== null ? operatingIncome : netIncome;
        if (numerator === null) return null;
        return (numerator / revenue) * 100;
    });
    let marginDeltaPct: number | null = null;
    let marginScore: number | null = null;
    if (marginPair) {
        marginDeltaPct = marginPair.last - marginPair.first;
        marginScore = normalizeScore(marginDeltaPct, -6, 8);
    }

    const debtPair = firstLastMetric((row) => {
        const debt = getHistoryNumber(row, HISTORY_DEBT_KEYS);
        return debt && debt > 0 ? debt : null;
    });
    let debtImprovementPct: number | null = null;
    let debtScore: number | null = null;
    if (debtPair && debtPair.first > 0) {
        debtImprovementPct = ((debtPair.first - debtPair.last) / debtPair.first) * 100;
        debtScore = normalizeScore(debtImprovementPct, -30, 30);
    }

    const components: Array<{ score: number; weight: number }> = [];
    if (revenueScore !== null) components.push({ score: revenueScore, weight: 0.45 });
    if (marginScore !== null) components.push({ score: marginScore, weight: 0.35 });
    if (debtScore !== null) components.push({ score: debtScore, weight: 0.20 });

    if (!components.length) {
        return { available: false, score: 50, adjustment: 0, coverage: 0, revenueCagrPct, marginDeltaPct, debtImprovementPct };
    }

    const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
    const score = components.reduce((sum, c) => sum + (c.score * c.weight), 0) / totalWeight;
    const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, ((score - 50) / 50) * maxAdjustment));
    const coverage = Math.round((components.length / 3) * 100);

    return {
        available: true,
        score,
        adjustment,
        coverage,
        revenueCagrPct,
        marginDeltaPct,
        debtImprovementPct
    };
};

const getQuarterKey = (row: any): string | null => {
    const raw = row?.date || row?.asOfDate || row?.periodEndDate;
    if (!raw) return null;
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return null;
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `${d.getUTCFullYear()}-Q${q}`;
};

const quarterSortValue = (quarterKey: string): number => {
    const m = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!m) return -1;
    return Number(m[1]) * 10 + Number(m[2]);
};

const computeFinancialSeasonalitySignals = (rawHistory: any, maxAdjustment = 4) => {
    const rows = normalizeHistoryRows(rawHistory);
    if (!rows.length) {
        return { available: false, score: 50, adjustment: 0, coverage: 0, avgYoYGrowthPct: null, positiveRatioPct: null };
    }

    const quarterlyRows = rows
        .filter((row) => String(row?._periodType || '').toUpperCase() === 'QUARTERLY')
        .map((row) => ({
            quarterKey: getQuarterKey(row),
            revenue: getHistoryNumber(row, HISTORY_REVENUE_KEYS)
        }))
        .filter((row) => !!row.quarterKey && row.revenue !== null && Number(row.revenue) > 0) as Array<{ quarterKey: string; revenue: number | null }>;

    const byQuarter = new Map<string, number>();
    quarterlyRows.forEach((row) => {
        byQuarter.set(row.quarterKey, Number(row.revenue));
    });

    const keys = Array.from(byQuarter.keys()).sort((a, b) => quarterSortValue(a) - quarterSortValue(b));
    const yoyList: number[] = [];

    for (const key of keys) {
        const [yearStr, qStr] = key.split('-Q');
        const prevKey = `${Number(yearStr) - 1}-Q${qStr}`;
        const curr = byQuarter.get(key);
        const prev = byQuarter.get(prevKey);
        if (!curr || !prev || prev <= 0) continue;
        yoyList.push(((curr / prev) - 1) * 100);
    }

    if (!yoyList.length) {
        return { available: false, score: 50, adjustment: 0, coverage: 0, avgYoYGrowthPct: null, positiveRatioPct: null };
    }

    const avgYoYGrowthPct = yoyList.reduce((sum, v) => sum + v, 0) / yoyList.length;
    const positiveRatioPct = (yoyList.filter((v) => v > 0).length / yoyList.length) * 100;
    const avgScore = normalizeScore(avgYoYGrowthPct, -12, 20);
    const ratioScore = normalizeScore(positiveRatioPct, 35, 90);
    const score = (avgScore * 0.6) + (ratioScore * 0.4);
    const quarterCoverage = Math.min(100, Math.round((keys.length / 12) * 100));
    const yoyCoverage = Math.min(100, Math.round((yoyList.length / 4) * 100));
    const coverage = Math.round((quarterCoverage * 0.4) + (yoyCoverage * 0.6));
    const confidenceScale = Math.max(0.2, coverage / 100);
    const adjustment = Math.max(
        -maxAdjustment,
        Math.min(maxAdjustment, (((score - 50) / 50) * maxAdjustment) * confidenceScale)
    );

    return {
        available: true,
        score,
        adjustment,
        coverage,
        avgYoYGrowthPct,
        positiveRatioPct
    };
};

const DEFENSIVE_SECTOR_HINTS = ['healthcare', 'consumer defensive', 'utilities', 'financial', 'insurance', 'telecom', 'communication services'];
const CYCLICAL_SECTOR_HINTS = ['technology', 'consumer cyclical', 'industrials', 'energy', 'materials', 'real estate'];

const resolveRegimeSectorAdjustment = (
    sector: string,
    regimeState: string,
    vixRef: number | null
) => {
    const s = String(sector || '').toLowerCase();
    const isDefensive = DEFENSIVE_SECTOR_HINTS.some((x) => s.includes(x));
    const isCyclical = CYCLICAL_SECTOR_HINTS.some((x) => s.includes(x));
    const boost = (vixRef !== null && vixRef >= 24) ? 2 : 1.5;

    if (regimeState === 'RISK_OFF') {
        if (isDefensive) return { adjustment: boost, tilt: 'DEFENSIVE_FAVOR' as const };
        if (isCyclical) return { adjustment: -boost, tilt: 'CYCLICAL_CUT' as const };
        return { adjustment: -0.3, tilt: 'RISK_OFF_NEUTRAL' as const };
    }
    if (regimeState === 'RISK_ON') {
        if (isCyclical) return { adjustment: boost, tilt: 'CYCLICAL_FAVOR' as const };
        if (isDefensive) return { adjustment: -boost, tilt: 'DEFENSIVE_CUT' as const };
        return { adjustment: 0.4, tilt: 'RISK_ON_NEUTRAL' as const };
    }
    return { adjustment: 0, tilt: 'NEUTRAL' as const };
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.6.2: Resilience Protocol Active.']);
  const logRef = useRef<HTMLDivElement>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // ... (Effect hooks remain same) ...
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-trigger') && !target.closest('.insight-overlay')) {
            setActiveInsight(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Filter...", "signal");
        executeDeepFilter();
    }
  }, [autoStart, loading]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: any) => {
    setSelectedTicker(ticker);
    setActiveInsight(null);
    if (onStockSelected) onStockSelected(ticker);
  };

  const timeoutPromise = (ms: number, msg: string) => new Promise((_, reject) => 
      setTimeout(() => reject(new Error(msg)), ms)
  );

  const sanitizeJson = (text: string) => {
      try {
        let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
        const first = clean.indexOf('{');
        const last = clean.lastIndexOf('}');
        if (first !== -1 && last !== -1) return JSON.parse(clean.substring(first, last + 1));
        return JSON.parse(clean);
      } catch (e) { return null; }
  };

  // ... (Drive Utils remain same) ...
  // --- DRIVE UTILS ---
  const assertDriveOk = async (res: Response, context: string) => {
      if (res.ok) return;
      const errText = await res.text().catch(() => '');
      throw new Error(`Drive ${context} failed: HTTP ${res.status} ${errText.slice(0, 240)}`);
  };

  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(res, `findFolder(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(res, `findFileId(${name})`);
      const data = await res.json();
      return data.files?.[0]?.id || null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(res, `downloadFile(${fileId})`);
      const text = await res.text();
      const safeText = text.replace(/:\s*NaN/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*-Infinity/g, ': null');
      return JSON.parse(safeText);
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      await assertDriveOk(res, `ensureFolder.list(${name})`);
      const data = await res.json();
      if (data.files?.length > 0) return data.files[0].id;
      const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      });
      await assertDriveOk(create, `ensureFolder.create(${name})`);
      const json = await create.json();
      if (!json?.id) throw new Error(`Drive ensureFolder.create(${name}) succeeded but missing folder id`);
      return json.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form
      });
      if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => '');
          throw new Error(`Drive upload failed (${name}): HTTP ${uploadRes.status} ${errText.slice(0, 240)}`);
      }
      const uploaded = await uploadRes.json().catch(() => null);
      if (!uploaded?.id) {
          addLog(`[WARN] Drive upload 응답에 fileId 누락 (${name})`, "warn");
          return;
      }
      addLog(`[OK] Drive upload verified: ${name} (${uploaded.id})`, "ok");
  };

  const executeDeepFilter = async () => {
      // ... (Keep existing execution logic) ...
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);

      try {
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          const stage1FolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!stage1FolderId) {
              addLog("[WARN] Stage 1 folder not found under root. Falling back to global search.", "warn");
          }
          const stage1Query = stage1FolderId
              ? `name contains 'STAGE1_PURIFIED_UNIVERSE' and '${stage1FolderId}' in parents and trashed = false`
              : `name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`;
          const q = encodeURIComponent(stage1Query);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          await assertDriveOk(listRes, "executeDeepFilter.listStage1");
          const listData = await listRes.json();

          if (!listData.files?.length) throw new Error("Stage 1 Data Missing.");

          const stage1Res = await fetch(`https://www.googleapis.com/drive/v3/files/${listData.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          await assertDriveOk(stage1Res, "executeDeepFilter.downloadStage1");
          const stage1Content = await stage1Res.json();

          const stage1RawCandidates = Array.isArray(stage1Content?.investable_universe)
              ? stage1Content.investable_universe
              : [];
          const stage1InputCount = Number(stage1Content?.manifest?.inputCount || stage1RawCandidates.length);
          const candidates = stage1RawCandidates.filter(isAnalysisEligibleTicker);
          const excludedByInstrumentType = Math.max(0, stage1RawCandidates.length - candidates.length);
          addLog(`Targets Acquired: ${candidates.length} candidates.`, "ok");
          if (excludedByInstrumentType > 0) {
              addLog(
                  `Instrument Gate: excluded ${excludedByInstrumentType} non-common symbols from Stage 2 pipeline.`,
                  "warn"
              );
          }
          if (candidates.length === 0) {
              throw new Error("Stage 1 eligible universe is empty (instrument gate).");
          }
          setProgress({ current: 0, total: candidates.length, msg: 'Initializing History Vault...' });

          // Map System setup
          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          const historyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId) : null;
          const marketRegimeFileId = systemMapId ? await findFileId(accessToken, 'MARKET_REGIME_SNAPSHOT.json', systemMapId) : null;
          let regimeState = 'UNKNOWN';
          let regimeVixRef: number | null = null;
          if (marketRegimeFileId) {
              try {
                  const marketRegime = await downloadFile(accessToken, marketRegimeFileId);
                  regimeState = String(marketRegime?.regime?.state || 'UNKNOWN').toUpperCase();
                  const vixCandidate = Number(marketRegime?.benchmarks?.vix?.close);
                  regimeVixRef = Number.isFinite(vixCandidate) ? vixCandidate : null;
                  addLog(`[REGIME] ${regimeState} | vix=${regimeVixRef ?? 'N/A'}`, "ok");
              } catch (e: any) {
                  addLog(`[WARN] Market regime snapshot parse failed: ${e?.message || 'unknown'}`, "warn");
              }
          } else {
              addLog("Market regime snapshot not found. Regime factor disabled.", "warn");
          }
          
          if (!historyFolderId) addLog("History folder not found. Proceeding with Snapshot data only.", "warn");

          const groupedByLetter: Record<string, any[]> = {};
          candidates.forEach((c: any) => {
              const letter = c.symbol.charAt(0).toUpperCase();
              if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
              groupedByLetter[letter].push(c);
          });

          const results: any[] = [];
          const sortedLetters = Object.keys(groupedByLetter).sort();

          for (const letter of sortedLetters) {
              setProgress(prev => ({ ...prev, msg: `Scanning Cylinder ${letter}...` }));
              
              let historyDataMap = new Map();
              if (historyFolderId) {
                  const histFileName = `${letter}_stocks_history.json`;
                  const histFileId = await findFileId(accessToken, histFileName, historyFolderId);
                  if (histFileId) {
                      const content = await downloadFile(accessToken, histFileId);
                      if (Array.isArray(content)) {
                          content.forEach((d: any) => d.symbol && historyDataMap.set(d.symbol, Array.isArray(d.financials) ? d.financials : []));
                      } else {
                          Object.keys(content).forEach(sym => historyDataMap.set(sym, Array.isArray(content[sym].financials) ? content[sym].financials : []));
                      }
                  }
              }

              const batch = groupedByLetter[letter];
              for (const rawItem of batch) {
                  let fullHistory = historyDataMap.get(rawItem.symbol) || [];
                  if (!Array.isArray(fullHistory)) fullHistory = [];

                  // [V5.6.1] Apply Data Sanitizer First
                  const item = sanitizeData(rawItem);

                  // --- QUANT LOGIC IMPLEMENTATION (V5.6.0) ---

                  // 1. Sector Logic
                  const sector = (item.sector || '').toLowerCase();
                  const isFinancial = sector.includes('financial') || sector.includes('bank') || sector.includes('insurance');
                  
                  // 2. Data Cleaning & Imputation
                  const rawRoe = item.roe;
                  const roeMissing =
                      rawRoe === null ||
                      rawRoe === undefined ||
                      rawRoe === '' ||
                      !isFinite(Number(rawRoe));
                  const roe = winsorize(imputeValue(rawRoe, -5, true), -50, 100);
                  const roa = winsorize(imputeValue(item.roa, -2, false), -20, 50);
                  const rawDebt = item.debtToEquity;
                  const distressScore = computeDistressScore(item, isFinancial, roe, roa, rawDebt);
                  
                  // [LOGIC] Negative Debt/Equity means Negative Equity (Insolvency Risk)
                  let debtScore = 0;
                  if (rawDebt < 0) {
                      debtScore = 0; // Insolvency
                  } else {
                      // debtToEquity=0 means debt-free and must be treated as a valid value.
                      const debtVal = imputeValue(rawDebt, isFinancial ? 0.5 : 1.5, true);
                      debtScore = Math.max(0, 100 - (debtVal * 50)); 
                  }
                  
                  // 3. Value Score (Thresholds instead of 1/PE)
                  let valueScore = 0;
                  const pe = item.pe || 0;
                  
                  if (pe <= 0) valueScore = 0; // Loss making or error
                  else if (pe < 10) valueScore = 100; // Deep Value
                  else if (pe < 20) valueScore = 80;  // Good Value
                  else if (pe < 35) valueScore = 60;  // Fair Value
                  else if (pe < 50) valueScore = 40;  // Premium
                  else valueScore = 20;               // Bubble
                  
                  // 4. Profit Score
                  let profitScore = 0;
                  if (isFinancial) {
                      // ROA is key for financials
                      profitScore = (Math.max(0, roa * 30)) + (Math.max(0, roe * 2)); 
                  } else {
                      profitScore = Math.max(0, roe * 3);
                  }
                  profitScore = clampScore(profitScore);

                  // 5. Data Quality Guard
                  let dataQuality = 'HIGH';
                  let penalty = 0;
                  
                  if (roeMissing) { penalty += 10; dataQuality = 'MEDIUM'; }
                  if (!item.targetMeanPrice || item.targetMeanPrice <= 0) {
                      penalty += 20;
                      dataQuality = 'LOW_VISIBILITY';
                  }

                  // 6. Final Quality Score
                  let rawQuality = (profitScore * 0.4 + debtScore * 0.3 + valueScore * 0.3) - penalty;
                  const trendSignals = computeFiveYearTrendSignals(fullHistory, 5);
                  const seasonalitySignals = computeFinancialSeasonalitySignals(fullHistory, 4);
                  const qualityFactorScore = clampScore((profitScore * 0.5) + (debtScore * 0.35) + ((100 - Math.min(100, penalty * 3)) * 0.15));
                  const qualityFactorAdjustment = Math.max(-3, Math.min(3, ((qualityFactorScore - 55) / 45) * 3));
                  const regimeSignals = resolveRegimeSectorAdjustment(item.sector || '', regimeState, regimeVixRef);
                  
                  // [ICT STRATEGY BOOST] Upside Potential Bonus
                  // If Target Price > Current Price * 1.2 (20% Upside), add bonus
                  if (item.targetMeanPrice > item.price * 1.2) {
                      rawQuality += 10; 
                  }
                  // Stage2 factor stack: 5Y trend + 5Y seasonality + regime tilt + quality factor.
                  rawQuality += trendSignals.adjustment;
                  rawQuality += seasonalitySignals.adjustment;
                  rawQuality += qualityFactorAdjustment;
                  rawQuality += regimeSignals.adjustment;
                  
                  const qualityScore = clampScore(rawQuality);

                  if (qualityScore > 35) {
                      // [STAGE 5 SAFEGUARD] Data Integrity & Imputation
                      let isImputed = false;
                      let safeTargetPrice = item.targetMeanPrice;
                      let safeHigh52 = item.fiftyTwoWeekHigh;
                      let safeLow52 = item.fiftyTwoWeekLow;

                      if (!safeTargetPrice || safeTargetPrice === 0) {
                          safeTargetPrice = item.price * 1.15;
                          isImputed = true;
                      }
                      if (!safeHigh52 || safeHigh52 === 0) {
                          safeHigh52 = item.price * 1.05;
                          isImputed = true;
                      }
                      if (!safeLow52 || safeLow52 === 0) {
                          safeLow52 = item.price * 0.95;
                          isImputed = true;
                      }

                      // [ICT CALCULATION] Position in Range
                      const range = safeHigh52 - safeLow52;
                      const ictPos = range === 0 ? 0.5 : (item.price - safeLow52) / range;
                      const pdZoneHint = ictPos < 0.5 ? "DISCOUNT" : "PREMIUM";

                      results.push({
                          ...item,
                          roe: roe || 0,
                          debtToEquity: rawDebt || 0,
                          zScoreProxy: distressScore.value,
                          zScoreModel: distressScore.model,
                          zScoreCoveragePct: distressScore.coveragePct,
                          zScoreConfidence: distressScore.confidence,
                          profitScore: Math.round(profitScore),
                          safeScore: Math.round(debtScore),
                          valueScore: Math.round(valueScore),
                          qualityScore: Number(qualityScore.toFixed(2)),
                          fundamentalScore: Number(qualityScore.toFixed(2)), // [SYNC] Stage 6
                          dataQuality,
                          trendScore: Number((trendSignals.score || 50).toFixed(2)),
                          trendAdjustment: Number((trendSignals.adjustment || 0).toFixed(2)),
                          trendCoverage: trendSignals.coverage || 0,
                          revenueCagrPct: trendSignals.revenueCagrPct,
                          marginTrendDeltaPct: trendSignals.marginDeltaPct,
                          debtImprovementPct: trendSignals.debtImprovementPct,
                          seasonalityScore: Number((seasonalitySignals.score || 50).toFixed(2)),
                          seasonalityAdjustment: Number((seasonalitySignals.adjustment || 0).toFixed(2)),
                          seasonalityCoverage: seasonalitySignals.coverage || 0,
                          seasonalityYoYGrowthPct: seasonalitySignals.avgYoYGrowthPct,
                          seasonalityPositiveRatioPct: seasonalitySignals.positiveRatioPct,
                          qualityFactorScore: Number(qualityFactorScore.toFixed(2)),
                          qualityFactorAdjustment: Number(qualityFactorAdjustment.toFixed(2)),
                          regimeState,
                          regimeVixRef,
                          regimeAdjustment: Number(regimeSignals.adjustment.toFixed(2)),
                          regimeSectorTilt: regimeSignals.tilt,
                          
                          // [CRITICAL] Preserve ICT Data Fields with Safeguards
                          fiftyTwoWeekHigh: safeHigh52,
                          fiftyTwoWeekLow: safeLow52,
                          fiftyDayAverage: item.fiftyDayAverage || 0,
                          twoHundredDayAverage: item.twoHundredDayAverage || 0,
                          targetMeanPrice: safeTargetPrice,

                          // [NEW] Stage 5/6 Compatibility
                          isImputed,
                          ictPos: Number(ictPos.toFixed(4)),
                          pdZoneHint,

                          radarData: [
                            { subject: 'Profit', A: Math.round(profitScore), fullMark: 100 },
                            { subject: 'Safety', A: Math.round(debtScore), fullMark: 100 },
                            { subject: 'Value', A: Math.round(valueScore), fullMark: 100 },
                          ],
                          fullHistory: fullHistory.slice(0, 4) 
                      });
                  }
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 0));
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);

          const distressModelCounts = results.reduce<Record<string, number>>((acc, item) => {
              const model = String(item?.zScoreModel || 'SAFETY_PROXY');
              acc[model] = (acc[model] || 0) + 1;
              return acc;
          }, {});
          const avgDistressCoverage =
              results.length > 0
                  ? results.reduce((sum, item) => sum + Number(item?.zScoreCoveragePct || 0), 0) / results.length
                  : 0;
          addLog(
              `[DISTRESS] ALTMAN_Z=${distressModelCounts.ALTMAN_Z || 0} | FIN_STABILITY=${distressModelCounts.FINANCIAL_STABILITY || 0} | SAFETY_PROXY=${distressModelCounts.SAFETY_PROXY || 0} | avgCoverage=${avgDistressCoverage.toFixed(1)}%`,
              "ok"
          );

          // [DYNAMIC SCALING] Market Condition Analysis
          const avgScore = results.reduce((sum, item) => sum + item.qualityScore, 0) / (results.length || 1);
          let targetCount = 300; // Neutral
          
          if (avgScore >= 70) {
             targetCount = 450; // Bull
          } else if (avgScore < 50) {
             targetCount = 150; // Bear
          }

          addLog(`[DYNAMIC-SCALE] Market Condition Detected. Target: ${targetCount} Assets.`, "info");

          const eliteCandidates = results.slice(0, targetCount);
          const avgAdj = (key: string) => {
              if (!eliteCandidates.length) return 0;
              return eliteCandidates.reduce((sum, item) => sum + Number(item?.[key] || 0), 0) / eliteCandidates.length;
          };
          addLog(
              `[5Y_FACTOR] trend=${avgAdj('trendAdjustment').toFixed(2)} seasonality=${avgAdj('seasonalityAdjustment').toFixed(2)} quality=${avgAdj('qualityFactorAdjustment').toFixed(2)} regime=${avgAdj('regimeAdjustment').toFixed(2)}`,
              "ok"
          );
          
          // [QUANT ONLY] No AI Audit
          addLog(`[OK] 5-Factor Quant Engine: Scan Complete`, "ok");

          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

          addLog(`[DATA-SYNC] Field Integrity Guaranteed for Stages 3-6`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          
          const timestamp = formatKstFilenameTimestamp();
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "5.6.2", 
                  count: eliteCandidates.length, 
                  inputCount: stage1InputCount,
                  eligibleCount: candidates.length,
                  excludedByInstrumentType,
                  timestamp: new Date().toISOString(),
                  engine: "3-Factor_Quant_Model_Sanitized",
                  aiAudit: "Skipped (Quant-Only Optimization)"
              },
              elite_universe: eliteCandidates
          };

          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, msg: '' });
      }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        {/* Main Panel - Violet Theme */}
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-violet-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            {/* Header Content */}
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-violet-600/10 flex items-center justify-center border border-violet-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-violet-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.6.2</h2>
                <div className="flex flex-col mt-2 gap-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all ${
                        loading 
                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 animate-pulse' 
                        : 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                    }`}>
                        {loading ? `Scanning: ${progress.msg}` : 'Quant Sanitizer Active'}
                    </span>
                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            
            <button 
              onClick={executeDeepFilter} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-slate-800 text-slate-500 shadow-none border border-white/5 cursor-wait opacity-80' 
                    : 'bg-violet-600 text-white shadow-xl shadow-violet-900/30 hover:scale-105 active:scale-95 hover:bg-violet-500'
              }`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* List View */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest">Quality Rank ({processedData.length})</p>
                      <span className="text-[8px] font-mono text-slate-500">Sorted by Quality Score</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {processedData.length > 0 ? processedData.map((t, i) => (
                          <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-violet-900/30 border-violet-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-violet-400' : 'text-slate-500'}`}>{i + 1}</span>
                                  <div>
                                      <p className="text-xs font-black text-white">{t.symbol}</p>
                                      <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-mono font-bold text-white">{t.qualityScore.toFixed(1)}</p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                      <span className={`w-1 h-1 rounded-full ${t.profitScore > 70 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.safeScore > 70 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.valueScore > 70 ? 'bg-amber-500' : 'bg-slate-700'}`}></span>
                                  </div>
                              </div>
                          </div>
                      )) : (
                          <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                              Waiting for Quant Data...
                          </div>
                      )}
                  </div>
              </div>

              {/* Detail View */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                   {selectedTicker ? (
                       <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                          <div className="flex justify-between items-start">
                              <div>
                                  <div className="flex items-baseline gap-3">
                                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                       <span 
                                            onClick={() => setActiveInsight('ROE')}
                                            className="text-[8px] font-black bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 uppercase cursor-help hover:bg-blue-900/50 transition-colors insight-trigger"
                                       >
                                           ROE {selectedTicker.roe.toFixed(2)}%
                                       </span>
                                       <span 
                                            onClick={() => setActiveInsight('DEBT')}
                                            className={`text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/20 uppercase cursor-help hover:opacity-80 transition-opacity insight-trigger ${selectedTicker.debtToEquity < 0 ? 'bg-rose-900/30 text-rose-400' : 'bg-emerald-900/30 text-emerald-400'}`}
                                       >
                                           Debt {selectedTicker.debtToEquity.toFixed(2)}
                                       </span>
                                  </div>
                              </div>
                              <div className="text-right">
                                   <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Quality</p>
                                   <p className="text-2xl font-black text-violet-400 tracking-tighter">{selectedTicker.qualityScore.toFixed(1)}</p>
                              </div>
                          </div>

                          <div className="flex-1 w-full relative -ml-4 my-2">
                              {/* [FIX] Conditional rendering to prevent 0-size error */}
                              {isVisible && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                        <PolarGrid stroke="#334155" opacity={0.3} />
                                        <PolarAngleAxis 
                                            dataKey="subject" 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold', cursor: 'pointer' }}
                                            onClick={({ payload }) => {
                                                if (payload.value === 'Profit') setActiveInsight('PROFIT_SCORE');
                                                if (payload.value === 'Safety') setActiveInsight('SAFETY_SCORE');
                                                if (payload.value === 'Value') setActiveInsight('VALUE_SCORE');
                                            }}
                                        />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar name={selectedTicker.symbol} dataKey="A" stroke="#8b5cf6" strokeWidth={2} fill="#8b5cf6" fillOpacity={0.4} />
                                        <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#8b5cf6', fontSize: '10px' }} />
                                    </RadarChart>
                                </ResponsiveContainer>
                              )}
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 mt-2">
                               <div 
                                    onClick={() => setActiveInsight('PROFIT_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Profit</p>
                                   <p className={`text-xs font-black ${selectedTicker.profitScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.profitScore}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('Z_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">{selectedTicker.zScoreModel === 'ALTMAN_Z' ? 'Altman Z' : 'Distress'}</p>
                                   <p className={`text-xs font-black ${selectedTicker.zScoreProxy > 2.9 ? 'text-emerald-400' : selectedTicker.zScoreProxy < 1.8 ? 'text-rose-400' : 'text-amber-400'}`}>{selectedTicker.zScoreProxy}</p>
                               </div>
                               <div 
                                    onClick={() => setActiveInsight('SAFETY_SCORE')}
                                    className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                               >
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Safety</p>
                                   <p className={`text-xs font-black ${selectedTicker.safeScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.safeScore}</p>
                               </div>
                          </div>
                          
                            {activeInsight && QUANT_INSIGHTS[activeInsight] && (
                                <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2 insight-overlay">
                                    <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-violet-500/30 shadow-2xl relative">
                                        <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <h5 className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                                            {QUANT_INSIGHTS[activeInsight].title}
                                        </h5>
                                        <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{QUANT_INSIGHTS[activeInsight].desc}</p>
                                        <div className="bg-white/5 p-2 rounded border border-white/5">
                                            <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                            <p className="text-[8px] text-slate-400">{QUANT_INSIGHTS[activeInsight].strategy}</p>
                                        </div>
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-violet-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-violet-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-violet-900'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
