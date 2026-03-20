
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS, GITHUB_DISPATCH_CONFIG } from '../constants';
import { ApiProvider } from '../types';
import { formatKstFilenameTimestamp } from '../services/timeService';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
  isVisible?: boolean; // [NEW] Added prop
}

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
        title: "Z-Score Proxy (재무위험 프록시)",
        desc: "현재 엔진은 정식 Altman Z-Score가 아닌 재무위험 프록시를 사용합니다. 부채와 수익성의 왜곡을 빠르게 잡아내는 보조 안전지표입니다.",
        strategy: "정식 부도예측 모델이 아니므로 단독 해석은 피하고, 현금흐름과 부채비율이 함께 강한 종목만 신뢰하십시오."
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

// ... (Utils remain same) ...
// --- QUANT ENGINE UTILS ---

const safeNum = (val: any) => {
    const n = Number(val);
    return isNaN(n) || !isFinite(n) ? 0 : n;
};

const hasValue = (val: any) => !(val === undefined || val === null || val === '');

const firstPresent = (...vals: any[]) => vals.find(hasValue);

type RoicDebtMode = 'RELAXED' | 'AUTO' | 'STRICT';

const parseRoicDebtMode = (rawMode: any): RoicDebtMode => {
    const mode = String(rawMode || '').trim().toUpperCase();
    if (mode === 'RELAXED' || mode === 'AUTO' || mode === 'STRICT') return mode;
    return 'AUTO';
};

const parseRoicCoverageThreshold = (raw: any): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 90;
    return Math.max(0, Math.min(100, n));
};

const hasAbsoluteDebtData = (data: any): boolean => hasValue(firstPresent(
    data?.totalDebt,
    data?.longTermDebt,
    data?.shortLongTermDebtTotal,
    data?.longTermDebtAndCapitalLeaseObligation,
    data?.totalDebtAndCapitalLeaseObligation
));

const normalizeScore = (val: number, min: number, max: number) => {
    if (val <= min) return 0;
    if (val >= max) return 100;
    return ((val - min) / (max - min)) * 100;
};

const sanitizeData = (item: any) => {
    let { dividendYield, roe, operatingMargins, pbr, debtToEquity } = item;
    // Basic data sanity checks
    if (dividendYield > 50) dividendYield = dividendYield / 100;
    if (roe > 200) roe = roe / 100;
    if (operatingMargins > 100) operatingMargins = operatingMargins / 100;
    if (pbr > 500) pbr = 0; 
    return { ...item, dividendYield, roe, operatingMargins, pbr, debtToEquity };
};

const computeUniverseBaselines = (universe: any[]) => {
    const sectorMap: Record<string, { roe: number[], pe: number[], debt: number[], pbr: number[], growth: number[] }> = {};
    
    universe.forEach(u => {
        const s = u.sector || 'Unknown';
        if (!sectorMap[s]) sectorMap[s] = { roe: [], pe: [], debt: [], pbr: [], growth: [] };
        
        const pushValid = (arr: number[], val: any) => {
            const v = Number(val);
            if (!isNaN(v) && v !== 0) arr.push(v);
        };

        pushValid(sectorMap[s].roe, u.roe);
        pushValid(sectorMap[s].pe, u.pe || u.per);
        pushValid(sectorMap[s].debt, u.debtToEquity);
        pushValid(sectorMap[s].pbr, u.pbr);
        pushValid(sectorMap[s].growth, u.revenueGrowth);
    });

    const baselines: Record<string, any> = {};
    const median = (arr: number[]) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a,b) => a-b);
        return sorted[Math.floor(sorted.length/2)];
    };

    Object.keys(sectorMap).forEach(s => {
        baselines[s] = {
            roe: median(sectorMap[s].roe) || 10,
            pe: median(sectorMap[s].pe) || 20,
            debtToEquity: median(sectorMap[s].debt) || 1.0,
            pbr: median(sectorMap[s].pbr) || 3.0,
            revenueGrowth: median(sectorMap[s].growth) || 5
        };
    });

    baselines['GLOBAL'] = { roe: 12, pe: 20, debtToEquity: 1.0, pbr: 2.5, revenueGrowth: 8 };
    return baselines;
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

const computeFiveYearTrendSignals = (rawHistory: any, maxAdjustment = 6) => {
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

    if (quarterlyRows.length < 8) {
        return { available: false, score: 50, adjustment: 0, coverage: 0, avgYoYGrowthPct: null, positiveRatioPct: null };
    }

    const byQuarter = new Map<string, number>();
    quarterlyRows.forEach((row) => byQuarter.set(row.quarterKey, Number(row.revenue)));
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
    const adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, ((score - 50) / 50) * maxAdjustment));
    const coverage = Math.min(100, Math.round((yoyList.length / 12) * 100));

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
    regimeStateRaw: any,
    vixRefRaw: any
) => {
    const regimeState = String(regimeStateRaw || 'UNKNOWN').toUpperCase();
    const vixRef = Number(vixRefRaw);
    const s = String(sector || '').toLowerCase();
    const isDefensive = DEFENSIVE_SECTOR_HINTS.some((x) => s.includes(x));
    const isCyclical = CYCLICAL_SECTOR_HINTS.some((x) => s.includes(x));
    const boost = Number.isFinite(vixRef) && vixRef >= 24 ? 2 : 1.5;

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

// [ENGINE v5.3] Pure Quant Logic (No AI)
const performFinancialEngineering = (
    data: any,
    options: { allowRatioDebtFallback?: boolean } = {}
) => {
    // ... (Existing logic remains exactly same) ...
    const price = safeNum(data.price);
    const eps = safeNum(data.eps || data.earningsPerShare);
    const marketCap = safeNum(data.marketCap || data.marketValue);
    const netIncome = safeNum(data.netIncome || data.netIncomeCommonStockholders);
    
    const allowRatioDebtFallback = options.allowRatioDebtFallback !== false;
    const rawDebtToEquity = firstPresent(data.debtToEquity);
    let totalDebtRatio = hasValue(rawDebtToEquity) ? safeNum(rawDebtToEquity) : 0;
    
    const totalEquity = safeNum(data.totalEquity || data.totalStockholdersEquity);
    const rawTotalDebtAbsolute = firstPresent(
        data.totalDebt,
        data.longTermDebt,
        data.shortLongTermDebtTotal,
        data.longTermDebtAndCapitalLeaseObligation,
        data.totalDebtAndCapitalLeaseObligation
    );
    const hasAbsoluteDebt = hasValue(rawTotalDebtAbsolute);
    const absoluteDebtValue = hasAbsoluteDebt ? safeNum(rawTotalDebtAbsolute) : 0;
    const ratioDebtProxy = totalEquity > 0 ? (totalDebtRatio * totalEquity) : 0;
    // C7: Prefer absolute debt. Ratio proxy is used only when fallback is explicitly enabled.
    const totalDebtAbsolute = Math.max(
        0,
        hasAbsoluteDebt ? absoluteDebtValue : (allowRatioDebtFallback ? ratioDebtProxy : 0)
    );
    const roicDebtSource = hasAbsoluteDebt
        ? 'ABSOLUTE'
        : (allowRatioDebtFallback ? 'RATIO_PROXY' : 'MISSING_ABS_DEBT');
    const pe = safeNum(data.pe || data.per);
    const pbr = safeNum(data.pbr || data.priceToBook);
    
    let sales = safeNum(data.revenue || data.totalRevenue);
    if (sales === 0 && marketCap > 0 && safeNum(data.psr) > 0) {
        sales = marketCap / safeNum(data.psr); 
    }
    
    const isFinancial = (data.sector || '').toLowerCase().includes('financial') || (data.industry || '').toLowerCase().includes('bank');
    
    const rawOpCashflow = firstPresent(data.operatingCashflow, data.operatingCashFlow);
    let opCashflow = hasValue(rawOpCashflow) ? safeNum(rawOpCashflow) : 0;
    let isCashflowProxy = false;
    const hasReportedCashflow = hasValue(rawOpCashflow);
    const hasNonPositiveReportedCashflow = hasReportedCashflow && opCashflow <= 0;
    
    if (!hasValue(rawOpCashflow)) {
        if (netIncome > 0) {
            opCashflow = netIncome * (isFinancial ? 1.0 : 1.2); 
            isCashflowProxy = true;
        } else if (marketCap > 0 && pe > 0) {
            const impliedEarnings = marketCap / pe;
            opCashflow = impliedEarnings * (isFinancial ? 1.0 : 1.2);
            isCashflowProxy = true;
        }
    }

    const rawRevenueGrowth = firstPresent(data.revenueGrowth);
    const revenueGrowth = hasValue(rawRevenueGrowth) ? safeNum(rawRevenueGrowth) : 0;
    const profitMargin = sales > 0 ? (netIncome / sales) * 100 : 5;
    const rawGrossMargin = safeNum(data.grossMargin || data.grossProfitMargin || (sales > 0 ? (data.grossProfit / sales) : 0));
    const grossMargin = rawGrossMargin > 1 ? rawGrossMargin : rawGrossMargin * 100;
    
    let divYield = safeNum(data.dividendYield);
    if (divYield > 100) divYield = divYield / 100;

    const roe = safeNum(data.roe || data.returnOnEquity || 0);

    // [INTRINSIC VALUE V2]
    let intrinsicValue = 0;
    const g = Math.min(revenueGrowth, 15); 
    
    if (eps > 0) {
        const multiplier = isFinancial ? 1.0 : 1.5; 
        intrinsicValue = eps * (8.5 + multiplier * g); 
    } else {
        const bookValue = safeNum(data.bookValuePerShare) || (price / (pbr || 1));
        const roeFactor = Math.max(0.5, Math.min(3.0, roe / 8));
        intrinsicValue = bookValue * roeFactor;
    }

    if (intrinsicValue > price * 3) intrinsicValue = price * 3;
    if (intrinsicValue <= 0) intrinsicValue = price * 0.8; 

    const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;
    
    const investedCapital = Math.max(1, totalEquity + totalDebtAbsolute);
    let roic = 0;
    if (totalEquity > 0) {
        roic = (netIncome / investedCapital) * 100;
    } else {
        roic = roe * 0.7; 
    }
    
    const cfMargin = sales > 0 ? (opCashflow / sales) * 100 : profitMargin;
    const effectiveCfMargin = isCashflowProxy ? Math.min(cfMargin, profitMargin) : cfMargin;
    const ruleOf40 = revenueGrowth + effectiveCfMargin;
    
    // [SCORES]
    let fScore = 4; // Baseline
    if (netIncome > 0) fScore++;
    if (!isCashflowProxy && opCashflow > 0) fScore++;
    if (!isCashflowProxy && opCashflow > netIncome) fScore++;
    if (roic > 5) fScore++;
    if (grossMargin > 20) fScore++;
    if (divYield > 0) fScore++;
    
    // Default Z-Score (Mathematical Proxy)
    const hasZScoreProxy = hasValue(data.zScoreProxy);
    const zScore = hasZScoreProxy ? safeNum(data.zScoreProxy) : ((totalDebtRatio < 0.5 && roe > 0) ? 3.0 : 1.5);

    let valScore = 0;
    if (isFinancial) {
        const peScore = normalizeScore(20 - pe, 0, 15); 
        const pbrScore = normalizeScore(2.0 - pbr, 0, 1.5);
        valScore = (peScore * 0.4) + (pbrScore * 0.6);
    } else {
        valScore = normalizeScore(fairValueGap, -20, 80);
    }
    
    const qualScore = (normalizeScore(grossMargin, 10, 60) * 0.4) + (normalizeScore(roic, 5, 20) * 0.6);
    const growthScore = normalizeScore(ruleOf40, 10, 60);

    let safetyScore = 0;
    if (totalDebtRatio <= 0.1) {
        safetyScore = 100; 
    } else {
        if (isFinancial) {
             safetyScore = normalizeScore(6 - totalDebtRatio, 0, 5);
        } else {
             safetyScore = normalizeScore(2.5 - totalDebtRatio, 0, 2);
        }
    }
    if (hasZScoreProxy && zScore > 2.99) safetyScore = Math.max(safetyScore, 90);

    let earningsQualityScore = 0;
    if (isCashflowProxy) {
        earningsQualityScore = isFinancial ? 55 : 45;
    } else if (hasNonPositiveReportedCashflow) {
        earningsQualityScore = isFinancial ? 50 : 0;
    } else {
        earningsQualityScore = normalizeScore(opCashflow / (netIncome || 1), 0.5, 2.0);
    }

    // [STAGE 3 WEIGHTS] Focus on Value (40%) and Safety (30%)
    const baseFundamentalScore = (valScore * 0.40) + (safetyScore * 0.30) + (qualScore * 0.20) + (growthScore * 0.10);
    const trendSignals = computeFiveYearTrendSignals(data.financialHistory || data.fullHistory, 6);
    const seasonalitySignals = computeFinancialSeasonalitySignals(data.financialHistory || data.fullHistory, 4);

    const regimeSignals = resolveRegimeSectorAdjustment(data.sector || '', data.marketRegimeState, data.marketRegimeVixRef);
    const regimeAdjustment = hasValue(data.regimeAdjustment)
        ? safeNum(data.regimeAdjustment)
        : regimeSignals.adjustment;

    const derivedQualityFactorScore = Math.max(
        0,
        Math.min(100, (qualScore * 0.35) + (safetyScore * 0.40) + (earningsQualityScore * 0.25))
    );
    const qualityFactorScore = hasValue(data.qualityFactorScore)
        ? safeNum(data.qualityFactorScore)
        : derivedQualityFactorScore;
    const qualityFactorAdjustment = hasValue(data.qualityFactorAdjustment)
        ? safeNum(data.qualityFactorAdjustment)
        : Math.max(-3, Math.min(3, ((qualityFactorScore - 55) / 45) * 3));

    const totalFactorAdjustment =
        trendSignals.adjustment +
        seasonalitySignals.adjustment +
        regimeAdjustment +
        qualityFactorAdjustment;

    const fundamentalScore = Math.max(0, Math.min(100, baseFundamentalScore + totalFactorAdjustment));

    let economicMoat: 'Wide' | 'Narrow' | 'None' = 'None';
    if (roic > 15 && ruleOf40 > 40 && fScore >= 7) economicMoat = 'Wide';
    else if (roic > 8 && ruleOf40 > 25 && fScore >= 5) economicMoat = 'Narrow';

    let missingDataPoints = 0;
    if (!eps && !netIncome) missingDataPoints++;
    if (!sales) missingDataPoints++;
    let dataConfidence = Math.max(10, 100 - (missingDataPoints * 20));
    if (isCashflowProxy) dataConfidence -= isFinancial ? 12 : 20;
    if (hasNonPositiveReportedCashflow) dataConfidence -= isFinancial ? 8 : 15;

    return {
        fundamentalScore: safeNum(fundamentalScore),
        qualityScore: safeNum(qualScore), 
        zScore: safeNum(zScore),
        fScore: safeNum(fScore),
        roic: safeNum(roic),
        ruleOf40: safeNum(ruleOf40),
        grossMargin: safeNum(grossMargin),
        intrinsicValue: safeNum(intrinsicValue),
        upsidePotential: safeNum(fairValueGap),
        fairValueGap: safeNum(fairValueGap),
        earningsQuality: safeNum(earningsQualityScore),
        economicMoat,
        dataConfidence,
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
        regimeAdjustment: Number((regimeAdjustment || 0).toFixed(2)),
        regimeSectorTilt: regimeSignals.tilt,
        qualityFactorScore: Number((qualityFactorScore || 0).toFixed(2)),
        qualityFactorAdjustment: Number((qualityFactorAdjustment || 0).toFixed(2)),
        factorAdjustmentTotal: Number((totalFactorAdjustment || 0).toFixed(2)),
        cashflowProxyUsed: isCashflowProxy,
        roicDebtFallbackEnabled: allowRatioDebtFallback,
        roicDebtSource,
        hasReportedCashflow,
        hasNonPositiveReportedCashflow,
        zScoreIsProxy: !hasZScoreProxy,
        radarData: [
            { subject: 'Valuation', A: Number(Math.max(5, safeNum(valScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Moat', A: Number(Math.max(5, safeNum(qualScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Growth', A: Number(Math.max(5, safeNum(growthScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Safety', A: Number(Math.max(5, safeNum(safetyScore) || 50).toFixed(2)), fullMark: 100 },
            { subject: 'Quality', A: Number(Math.max(5, safeNum(earningsQualityScore) || 50).toFixed(2)), fullMark: 100 },
        ],
        profitScore: Math.round(qualScore),
        safeScore: Math.round(safetyScore),
        valueScore: Math.round(valScore)
    };
};

// ─────────────────────────────────────────────────────────
// [GITHUB DISPATCH] Stage 3 → Harvester 워크플로우 트리거
// GitHub repository_dispatch API: 성공 시 HTTP 204 반환
// ─────────────────────────────────────────────────────────
const triggerGitHubHarvester = async (meta?: {
  stockCount?: number;
  timestamp?: string;
  triggerFile?: string;
}): Promise<{ ok: boolean; status: number; detail: string }> => {
  if (!GITHUB_DISPATCH_CONFIG.TOKEN) {
    const detail = 'missing_dispatch_token(VITE_GITHUB_PAT|VITE_GH_PAT|VITE_SIDECAR_DISPATCH_TOKEN)';
    console.error(`[GITHUB DISPATCH] ❌ ${detail}`);
    return { ok: false, status: 0, detail };
  }

  try {
    const res = await fetch(GITHUB_DISPATCH_CONFIG.API_URL, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_DISPATCH_CONFIG.TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: GITHUB_DISPATCH_CONFIG.EVENT_TYPE,
        client_payload: {
          stage: 3,
          driveFolder: GOOGLE_DRIVE_TARGET.stage3SubFolder,
          stockCount: meta?.stockCount ?? 0,
          timestamp: meta?.timestamp ?? new Date().toISOString(),
          trigger_file: meta?.triggerFile ?? '',
          triggeredBy: 'FundamentalAnalysis-v5',
        },
      }),
    });

    if (res.status === 204) {
      console.log(
        `[GITHUB DISPATCH] ✅ "${GITHUB_DISPATCH_CONFIG.EVENT_TYPE}" 트리거 성공` +
        ` → ${GITHUB_DISPATCH_CONFIG.OWNER}/${GITHUB_DISPATCH_CONFIG.REPO}`
      );
      return { ok: true, status: res.status, detail: 'ok' };
    }

    const errText = await res.text();
    console.error(`[GITHUB DISPATCH] ❌ HTTP ${res.status}`, errText);
    return { ok: false, status: res.status, detail: (errText || '').slice(0, 240) };

  } catch (e) {
    console.error('[GITHUB DISPATCH] ❌ 네트워크 오류:', e);
    const detail = String((e as any)?.message || e || 'network_error');
    return { ok: false, status: 0, detail };
  }
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected, isVisible = true }) => {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
    const [processedData, setProcessedData] = useState<any[]>([]);
    const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
    const [activeInsight, setActiveInsight] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v5.8.0: Pure Quant Mode Active.']);

    const [syncProgress, setSyncProgress] = useState<{current: number, total: number, percentage: number, ticker: string} | null>(null);
    const [isSyncActive, setIsSyncActive] = useState(false);
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);
    const pendingStage4TriggerRef = useRef<string | null>(null);
    const progressCompleteLoggedRef = useRef(false);
    const readySignalHandledRef = useRef(false);
    const progressCheckErrorRef = useRef<{ signature: string; lastAt: number }>({ signature: '', lastAt: 0 });

    const isTransientProgressError = (error: unknown): boolean => {
        const message = String((error as any)?.message || error || '').toLowerCase();
        if (!message) return false;
        return (
            message.includes('http 500') ||
            message.includes('http 502') ||
            message.includes('http 503') ||
            message.includes('http 504') ||
            message.includes('failed to fetch') ||
            message.includes('networkerror') ||
            message.includes('timeout')
        );
    };

    const stopSyncPolling = () => {
        if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
        }
    };

    // 컴포넌트 언마운트 시 인터벌 정리
    useEffect(() => {
        return () => {
            stopSyncPolling();
        };
    }, []);

    // 구글 드라이브에서 진행률을 읽어오는 함수
    const checkProgress = async (token: string, preferredSysFolderId: string | null = null) => {
        try {
            const sysFolderId = preferredSysFolderId || await resolveSystemMapFolderId(token);
            if (!sysFolderId) return;

            const expectedTriggerFile = pendingStage4TriggerRef.current;
            const progressFileId = await findFileId(token, "COLLECTION_PROGRESS.json", sysFolderId);
            if (progressFileId) {
                const data = await downloadFile(token, progressFileId);
                if (data) {
                    const isCurrentTriggerProgress =
                        !expectedTriggerFile || data.trigger_file === expectedTriggerFile;

                    if (isCurrentTriggerProgress) {
                        setSyncProgress({
                            current: data.current,
                            total: data.total,
                            percentage: data.percentage,
                            ticker: data.last_ticker
                        });

                        if (data.status === "COMPLETED" && !progressCompleteLoggedRef.current) {
                            progressCompleteLoggedRef.current = true;
                            addLog("[OK] OHLCV 수집 완료. Ready Signal 검증 중...", "ok");
                        }
                    }
                }
            }

            if (!expectedTriggerFile || readySignalHandledRef.current) return;

            const readyFileId = await findFileId(token, "LATEST_STAGE4_READY.json", sysFolderId);
            if (!readyFileId) return;

            const readyData = await downloadFile(token, readyFileId);
            if (readyData?.status === "COMPLETED" && readyData?.trigger_file === expectedTriggerFile) {
                readySignalHandledRef.current = true;
                pendingStage4TriggerRef.current = null;
                setIsSyncActive(false);
                stopSyncPolling();
                addLog(`[OK] Stage 4 Ready Signal Verified: ${readyData.trigger_file}`, "ok");
                if (onComplete) onComplete();
            }
        } catch (e) {
            const message = String((e as any)?.message || e || 'unknown');
            const transient = isTransientProgressError(e);
            const signature = `${transient ? 'T' : 'P'}:${message.slice(0, 120)}`;
            const now = Date.now();
            const shouldEmit =
                signature !== progressCheckErrorRef.current.signature ||
                now - progressCheckErrorRef.current.lastAt > 30000;

            if (shouldEmit) {
                progressCheckErrorRef.current = { signature, lastAt: now };
                if (transient) {
                    addLog(`Progress sync transient issue (auto-retry): ${message.slice(0, 120)}`, "warn");
                    console.warn("Progress check transient issue", e);
                } else {
                    addLog(`Progress sync error: ${message.slice(0, 120)}`, "warn");
                    console.error("Progress check error", e);
                }
            }
        }
    };
  
    const logRef = useRef<HTMLDivElement>(null);
    const accessToken = sessionStorage.getItem('gdrive_access_token');

    // ... (UseEffects remain same) ...
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

    const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
        const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
        setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
    };

    const handleTickerSelect = (ticker: any) => {
        setSelectedTicker(ticker);
        setActiveInsight(null);
        if (onStockSelected) onStockSelected(ticker);
    };

    // ... (Drive functions remain same) ...
    const assertDriveOk = async (res: Response, context: string) => {
      if (res.ok) return;
      const errText = await res.text().catch(() => '');
      throw new Error(`Drive ${context} failed: HTTP ${res.status} ${errText.slice(0, 240)}`);
    };

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
        return data.files?.[0]?.parents?.[0] || null;
    };

    const resolveSystemMapFolderId = async (token: string) => {
        let systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
        if (systemMapId) return systemMapId;

        systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
        if (systemMapId) {
            addLog("System Map Folder resolved from Drive root fallback.", "warn");
            return systemMapId;
        }

        const readyParentId = await findLatestFileParentId(token, "LATEST_STAGE4_READY.json");
        if (readyParentId) {
            addLog("System Map Folder inferred from LATEST_STAGE4_READY.json.", "warn");
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
    };

    const executeDeepAudit = async () => {
        // ... (Execute logic remains same) ...
        if (!accessToken || loading) return;
        setLoading(true);
        setProcessedData([]);

        try {
            addLog("Phase 2: Loading Stage 2 Elite Universe...", "info");
            const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
            const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=5`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            await assertDriveOk(listRes, "loadStage2.list");
            const listData = await listRes.json();

            if (!listData.files?.length) throw new Error("Stage 2 Data Missing. Please run Stage 2.");

            let stage2Content: any = null;
            let selectedStage2FileName = '';

            for (const file of listData.files) {
                const candidateRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                await assertDriveOk(candidateRes, `loadStage2.content(${file.id})`);
                const candidateContent = await candidateRes.json();

                const candidateUniverse = Array.isArray(candidateContent?.elite_universe) ? candidateContent.elite_universe : [];
                if (candidateUniverse.length > 0) {
                    stage2Content = candidateContent;
                    selectedStage2FileName = file.name;
                    break;
                }
            }

            if (!stage2Content) {
                throw new Error("Latest Stage 2 files are empty. Re-run Stage 2 to completion.");
            }

            if (selectedStage2FileName !== listData.files[0]?.name) {
                addLog(`[WARN] Latest Stage 2 file was empty. Fallback engaged: ${selectedStage2FileName}`, "warn");
            }

            const candidates = stage2Content.elite_universe || [];
            addLog(`[OK] Stage 2 Source Locked: ${selectedStage2FileName}`, "ok");
            addLog(`Targets Acquired: ${candidates.length} elite assets.`, "ok");
            setProgress({ current: 0, total: candidates.length, msg: 'Initializing History Vault...' });

            const universeBaselines = computeUniverseBaselines(candidates);

            const systemMapId = await resolveSystemMapFolderId(accessToken);
            const historyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId) : null;
            const dailyFolderId = systemMapId ? await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapId) : null;
            const marketRegimeFileId = systemMapId ? await findFileId(accessToken, 'MARKET_REGIME_SNAPSHOT.json', systemMapId) : null;
            let marketRegimeState = 'UNKNOWN';
            let marketRegimeScore: number | null = null;
            let marketRegimeVixRef: number | null = null;
            if (marketRegimeFileId) {
                try {
                    const regimeData = await downloadFile(accessToken, marketRegimeFileId);
                    marketRegimeState = String(regimeData?.regime?.state || 'UNKNOWN').toUpperCase();
                    const scoreCandidate = Number(regimeData?.regime?.score);
                    marketRegimeScore = Number.isFinite(scoreCandidate) ? scoreCandidate : null;
                    const vixCandidate = Number(regimeData?.benchmarks?.vix?.close);
                    marketRegimeVixRef = Number.isFinite(vixCandidate) ? vixCandidate : null;
                    addLog(`Market Regime Locked: ${marketRegimeState} (${marketRegimeScore ?? 'N/A'})`, "ok");
                } catch (e: any) {
                    addLog(`[WARN] Market regime parse failed: ${e?.message || 'unknown'}`, "warn");
                }
            } else {
                addLog("Market Regime snapshot missing. Regime factor will use neutral mode.", "warn");
            }
            
            if (!historyFolderId) addLog("History folder not found. Proceeding with Snapshot data only.", "warn");
            if (!dailyFolderId) addLog("Daily folder not found. Proceeding with limited data.", "warn");

            const groupedByLetter: Record<string, any[]> = {};
            candidates.forEach((c: any) => {
                const letter = c.symbol.charAt(0).toUpperCase();
                if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
                groupedByLetter[letter].push(c);
            });

            const results: any[] = [];
            const sortedLetters = Object.keys(groupedByLetter).sort();
            const roicDebtModeRequested = parseRoicDebtMode((import.meta as any).env?.VITE_FUND_ROIC_DEBT_MODE);
            const roicDebtStrictCoverageMin = parseRoicCoverageThreshold((import.meta as any).env?.VITE_FUND_ROIC_STRICT_COVERAGE_MIN);

            const dailyDataByLetter: Record<string, Map<string, any>> = {};
            for (const letter of sortedLetters) {
                const dailyDataMap = new Map<string, any>();
                if (dailyFolderId) {
                    const dailyFileName = `${letter}_stocks_daily.json`;
                    const dailyFileId = await findFileId(accessToken, dailyFileName, dailyFolderId);
                    if (dailyFileId) {
                        try {
                            const content = await downloadFile(accessToken, dailyFileId);
                            Object.keys(content).forEach(sym => dailyDataMap.set(sym, content[sym]));
                        } catch (e) {
                            console.warn(`Failed to parse ${dailyFileName}`, e);
                        }
                    }
                }
                dailyDataByLetter[letter] = dailyDataMap;
            }

            let absoluteDebtCoverageCount = 0;
            for (const letter of sortedLetters) {
                const batch = groupedByLetter[letter];
                const dailyDataMap = dailyDataByLetter[letter] || new Map<string, any>();
                for (const rawItem of batch) {
                    const dData = dailyDataMap.get(rawItem.symbol);
                    if (hasAbsoluteDebtData({ ...rawItem, ...(dData || {}) })) {
                        absoluteDebtCoverageCount += 1;
                    }
                }
            }

            const roicDebtCoveragePct = candidates.length > 0
                ? (absoluteDebtCoverageCount / candidates.length) * 100
                : 0;
            const roicDebtModeEffective: Exclude<RoicDebtMode, 'AUTO'> =
                roicDebtModeRequested === 'AUTO'
                    ? (roicDebtCoveragePct >= roicDebtStrictCoverageMin ? 'STRICT' : 'RELAXED')
                    : roicDebtModeRequested;
            const allowRatioDebtFallback = roicDebtModeEffective !== 'STRICT';
            const roicModeLabel = roicDebtModeRequested === 'AUTO'
                ? `AUTO->${roicDebtModeEffective}`
                : roicDebtModeEffective;
            addLog(
                `[ROIC] Absolute debt coverage ${roicDebtCoveragePct.toFixed(1)}% (${absoluteDebtCoverageCount}/${candidates.length}) | mode=${roicModeLabel} | ratioFallback=${allowRatioDebtFallback ? 'ON' : 'OFF'} | strict>=${roicDebtStrictCoverageMin}%`,
                roicDebtModeEffective === 'STRICT' ? 'ok' : 'warn'
            );
            const roicDebtSourceCounts: Record<string, number> = {
                ABSOLUTE: 0,
                RATIO_PROXY: 0,
                MISSING_ABS_DEBT: 0
            };
            
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
                            Object.keys(content).forEach(sym => {
                                const val = content[sym];
                                if (!val) return; 
                                historyDataMap.set(sym, val.financials || val);
                            });
                        }
                    }
                }

                const dailyDataMap: Map<string, any> = dailyDataByLetter[letter] || new Map<string, any>();

                const batch = groupedByLetter[letter];
                for (const rawItem of batch) {
                    const rawHistory = historyDataMap.get(rawItem.symbol);
                    let fullHistory: any[] = [];
                    let latestHistory: any = null;

                    if (Array.isArray(rawHistory)) {
                        fullHistory = rawHistory;
                        if (fullHistory.length > 0) latestHistory = fullHistory[0];
                    } else if (rawHistory && typeof rawHistory === 'object') {
                        const dates = Object.keys(rawHistory).sort().reverse();
                        fullHistory = dates.map(d => ({ date: d, ...rawHistory[d] }));
                        if (dates.length > 0) latestHistory = rawHistory[dates[0]];
                    }

                    let itemToAnalyze = { ...rawItem };
                    
                    // [NEW] Enrichment from Drive Data (Daily & History)
                    const dData = dailyDataMap.get(rawItem.symbol);
                    const toPct = (val: any) => (hasValue(val) && Math.abs(Number(val)) < 10) ? Number(val) * 100 : val;

                    if (dData) {
                        if (!hasValue(itemToAnalyze.roe)) itemToAnalyze.roe = toPct(dData.roe);
                        if (!hasValue(itemToAnalyze.operatingMargins)) itemToAnalyze.operatingMargins = toPct(dData.operatingMargins);
                        if (!hasValue(itemToAnalyze.revenueGrowth)) itemToAnalyze.revenueGrowth = toPct(dData.revenueGrowth);
                        if (itemToAnalyze.debtToEquity === undefined) itemToAnalyze.debtToEquity = dData.debtToEquity;
                        if (!hasValue(itemToAnalyze.operatingCashflow)) itemToAnalyze.operatingCashflow = dData.operatingCashflow;
                        if (!hasValue(itemToAnalyze.pe)) itemToAnalyze.pe = dData.per;
                        if (!hasValue(itemToAnalyze.pbr)) itemToAnalyze.pbr = dData.pbr;
                    }

                    if (latestHistory) {
                         if (!hasValue(itemToAnalyze.grossMargin) && latestHistory['Gross Profit'] && latestHistory['Total Revenue']) {
                              itemToAnalyze.grossMargin = (latestHistory['Gross Profit'] / latestHistory['Total Revenue']) * 100;
                         }
                    }
                    if (fullHistory.length > 0) {
                        // 5Y trend scoring uses normalized financial history inside performFinancialEngineering.
                        itemToAnalyze.financialHistory = fullHistory;
                        itemToAnalyze.fullHistory = fullHistory;
                    }
                    itemToAnalyze.marketRegimeState = marketRegimeState;
                    itemToAnalyze.marketRegimeScore = marketRegimeScore;
                    itemToAnalyze.marketRegimeVixRef = marketRegimeVixRef;

                    let isImputed = false;
                    
                    const sector = itemToAnalyze.sector || 'Unknown';
                    const baseline = universeBaselines[sector] || universeBaselines['GLOBAL'];

                    // Smart Imputation for missing values
                    if (!itemToAnalyze.roe && itemToAnalyze.roe !== 0) { 
                        itemToAnalyze.roe = baseline.roe; 
                        isImputed = true; 
                    }
                    if (itemToAnalyze.debtToEquity === undefined || itemToAnalyze.debtToEquity === null) {
                         itemToAnalyze.debtToEquity = baseline.debtToEquity;
                         isImputed = true;
                    }
                    if (!hasValue(itemToAnalyze.pe) && !hasValue(itemToAnalyze.per)) {
                         itemToAnalyze.pe = baseline.pe;
                         isImputed = true;
                    }
                    if (!hasValue(itemToAnalyze.pbr)) {
                         itemToAnalyze.pbr = baseline.pbr;
                         isImputed = true;
                    }
                    if (!hasValue(itemToAnalyze.revenueGrowth)) {
                         itemToAnalyze.revenueGrowth = baseline.revenueGrowth;
                         isImputed = true;
                    }

                    const item = sanitizeData(itemToAnalyze);
                    const analysis = performFinancialEngineering(item, { allowRatioDebtFallback });
                    const debtSource = analysis.roicDebtSource || 'UNKNOWN';
                    roicDebtSourceCounts[debtSource] = (roicDebtSourceCounts[debtSource] || 0) + 1;

                    // [NEW] Financial Integrity Filter (Cash Flow Guard)
                    let integrityPenalty = 0;
                    let isHighGrowthQuality = false;
                    let isCashFlowWarning = false;
                    const opCashflow = safeNum(item.operatingCashflow || item.operatingCashFlow);
                    
                    if (opCashflow <= 0) {
                        integrityPenalty = sector.toLowerCase().includes('financial') ? 6 : 18;
                        isCashFlowWarning = true;
                    }
                    if (analysis.cashflowProxyUsed) integrityPenalty += sector.toLowerCase().includes('financial') ? 3 : 6;
                    
                    // [NEW] High-Quality-Growth Flag
                    if (safeNum(item.roe) > 15 && safeNum(item.revenueGrowth) > 10) {
                        isHighGrowthQuality = true;
                    }
                    
                    // Apply Penalty
                    analysis.fundamentalScore -= integrityPenalty;
                    
                    const qualityScore = safeNum(analysis.qualityScore);
                    
                    if (isImputed) {
                        analysis.dataConfidence = Math.min(analysis.dataConfidence, 60);
                    }

                    const compositeAlpha = (qualityScore * 0.3) + (analysis.fundamentalScore * 0.7);

                    results.push({
                        ...item, // Strict Pass-through
                        ...analysis,
                        qualityScore,
                        fundamentalScore: safeNum(analysis.fundamentalScore),
                        compositeAlpha: safeNum(compositeAlpha),
                        isHighGrowthQuality,
                        isCashFlowWarning,
                        fullHistory: fullHistory.slice(0, 4),
                        lastUpdate: new Date().toISOString(),
                        isDerived: true,
                        isImputed: isImputed,
                        auditSource: 'ALGO'
                    });
                }
                setProgress(prev => ({ ...prev, current: results.length }));
                await new Promise(r => setTimeout(r, 0));
            }

            addLog(
                `[ROIC] Debt source mix | ABSOLUTE=${roicDebtSourceCounts.ABSOLUTE} | RATIO_PROXY=${roicDebtSourceCounts.RATIO_PROXY} | MISSING_ABS_DEBT=${roicDebtSourceCounts.MISSING_ABS_DEBT}`,
                roicDebtSourceCounts.RATIO_PROXY > 0 ? 'warn' : 'ok'
            );
            addLog(
                `[ROIC] Effective mode ${roicDebtModeEffective}. ${roicDebtModeEffective === 'STRICT' ? 'No ratio-based debt proxy used.' : 'Ratio proxy retained as fallback.'}`,
                roicDebtModeEffective === 'STRICT' ? 'ok' : 'warn'
            );
            const avgAdj = (key: string) => {
                if (!results.length) return 0;
                return results.reduce((sum, item) => sum + Number(item?.[key] || 0), 0) / results.length;
            };
            addLog(
                `[5Y_FACTOR] trend=${avgAdj('trendAdjustment').toFixed(2)} seasonality=${avgAdj('seasonalityAdjustment').toFixed(2)} quality=${avgAdj('qualityFactorAdjustment').toFixed(2)} regime=${avgAdj('regimeAdjustment').toFixed(2)}`,
                "ok"
            );

            // --- [NEW] SECTOR INTELLIGENCE & MOMENTUM SCORING ---
            
            // 1. Group by Sector
            const sectorGroups: Record<string, any[]> = {};
            results.forEach(r => {
                const s = r.sector || 'Unknown';
                if (!sectorGroups[s]) sectorGroups[s] = [];
                sectorGroups[s].push(r);
            });

            addLog(`[OK] Sector Strategy: ${Object.keys(sectorGroups).length} Industry Groups Analyzed`, "ok");
            addLog(`[OK] Integrity Check: Cash Flow & Growth Scanned`, "ok");

            // 2. Identify Momentum Leaders
            const sectorStats = Object.keys(sectorGroups).map(s => {
                const group = sectorGroups[s];
                const avgScore = group.reduce((sum, item) => sum + item.fundamentalScore, 0) / (group.length || 1);
                return { sector: s, avgScore };
            });
            
            // Top 30% Sectors get Momentum Bonus
            sectorStats.sort((a, b) => b.avgScore - a.avgScore);
            const topSectorCount = Math.max(1, Math.ceil(sectorStats.length * 0.3));
            const topSectors = sectorStats.slice(0, topSectorCount).map(s => s.sector);

            if (topSectors.length > 0) {
                addLog(`[OK] Momentum Leader: ${topSectors[0]} identified as Market Driver`, "ok");
            }

            // 3. Apply Bonuses & Update Scores
            Object.values(sectorGroups).forEach(group => {
                // Sort by fundamentalScore to find top 20%
                group.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
                const top20Index = Math.floor(group.length * 0.2);

                group.forEach((r, idx) => {
                    let sectorScore = 0;
                    let sectorRankBonus = 0;
                    const hasCashflowRisk = Boolean(r.isCashFlowWarning || r.hasNonPositiveReportedCashflow || r.cashflowProxyUsed);

                    if (topSectors.includes(r.sector)) sectorScore = hasCashflowRisk ? 1 : 2;
                    if (idx <= top20Index) sectorRankBonus = hasCashflowRisk ? 0 : 4;

                    r.sectorScore = sectorScore;
                    r.sectorRankBonus = sectorRankBonus;
                    r.fundamentalScore += (sectorScore + sectorRankBonus);
                    
                    // Recalculate Composite Alpha
                    r.compositeAlpha = (r.qualityScore * 0.3) + (r.fundamentalScore * 0.7);
                });
            });

            addLog(`[DATA-SYNC] Final Bridge Ready for Technical & ICT Stages`, "ok");

            results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
            const eliteCandidates = results; 

            if (eliteCandidates.length === 0) {
                addLog("[ERR] Stage 3 produced 0 candidates. Vault save and harvester dispatch aborted.", "err");
                return;
            }
            
            setProcessedData(eliteCandidates);
            if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);
            
            addLog(`Deep Scan Complete. ${eliteCandidates.length} Assets Preserved.`, "ok");
            
            const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
            const timestamp = formatKstFilenameTimestamp();
            const fileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;

            const payload = {
                manifest: { version: "5.8.0", count: eliteCandidates.length, timestamp: new Date().toISOString(), engine: "Pure_Quant_Algorithm" },
                fundamental_universe: eliteCandidates
            };

            await uploadFile(accessToken, saveFolderId, fileName, payload);
            addLog(`Vault Saved: ${fileName}`, "ok");
            
            // ── [GITHUB DISPATCH] Stage 3 완료 → Harvester 트리거 ──
            pendingStage4TriggerRef.current = fileName;
            progressCompleteLoggedRef.current = false;
            readySignalHandledRef.current = false;
            addLog(`GitHub Harvester Trigger 전송 중...`, 'info');
            const dispatchResult = await triggerGitHubHarvester({
              stockCount: eliteCandidates.length,
              timestamp: new Date().toISOString(),
              triggerFile: fileName,
            });
            if (dispatchResult.ok) {
              addLog(`GitHub Dispatch OK → event: "${GITHUB_DISPATCH_CONFIG.EVENT_TYPE}"`, 'ok');

              setIsSyncActive(true);
              setSyncProgress({ current: 0, total: eliteCandidates.length, percentage: 0, ticker: 'STARTING...' });
              addLog("[INFO] 데이터 수집 실시간 모니터링을 시작합니다.", "info");
              stopSyncPolling();
              
              // 10초마다 구글 드라이브에서 진행률 체크 (systemMapId는 위에서 찾은 변수 사용)
              if (!systemMapId) {
                  addLog("[WARN] System Map Folder를 즉시 찾지 못했습니다. Ready Signal 자동 탐색을 계속 시도합니다.", "warn");
              }
              await checkProgress(accessToken, systemMapId);
              if (!readySignalHandledRef.current && pendingStage4TriggerRef.current) {
                  pollingInterval.current = setInterval(() => {
                      checkProgress(accessToken, systemMapId);
                  }, 10000);
              }
              
            } else {
              pendingStage4TriggerRef.current = null;
              setIsSyncActive(false);
              stopSyncPolling();
              const reason = dispatchResult.detail ? ` | ${dispatchResult.detail}` : '';
              addLog(`GitHub Dispatch FAILED (${dispatchResult.status || 'ERR'})${reason}`, 'err');
            }

        } catch (e: any) {
            addLog(`Audit Error: ${e.message}`, "err");
        } finally {
            setLoading(false);
            setProgress({ current: 0, total: 0, msg: '' });
        }
    };

    useEffect(() => {
        if (autoStart && !loading) {
            addLog("AUTO-PILOT: Engaging Advanced Fundamental Audit...", "signal");
            executeDeepAudit();
        }
    }, [autoStart]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            <div className="xl:col-span-3 space-y-6">
                <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
                     <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
                         <div className="flex items-center space-x-6">
                             <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${(loading || isSyncActive) ? 'animate-pulse' : ''}`}>
                                <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${(loading || isSyncActive) ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                             </div>
                             <div>
                                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Audit_Nexus v4.1.0</h2>
                                <div className="flex flex-col mt-2 gap-1">
                                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest transition-all ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : isSyncActive ? 'border-amber-400 text-amber-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                                        {loading ? `Auditing: ${progress.msg}` : isSyncActive ? 'Waiting for OHLCV Sync' : 'Resilient Deep-Audit Active'}
                                    </span>
                                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                                </div>
                             </div>
                         </div>
                         <button 
                            onClick={executeDeepAudit} 
                            disabled={loading || isSyncActive}
                            className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${(loading || isSyncActive) ? 'bg-slate-800 text-slate-500 cursor-wait' : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'}`}
                        >
                            {loading ? 'Performing Multi-Model Audit...' : isSyncActive ? 'Waiting for OHLCV Sync...' : 'Start Global Fundamental Audit'}
                        </button>
                     </div>

                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
                         {/* List View */}
                         <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                            <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                                <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Audit Rank ({processedData.length})</p>
                                <span className="text-[8px] font-mono text-slate-500">Sorted by Fundamental Score</span>
                            </div>
                            <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                                {processedData.length > 0 ? processedData.map((t, i) => (
                                    <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-cyan-400' : 'text-slate-500'}`}>{i + 1}</span>
                                            <div>
                                                <p className="text-xs font-black text-white">{t.symbol}</p>
                                                <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}</p>
                                            <div className="flex gap-1 justify-end mt-0.5">
                                                <span className={`w-1 h-1 rounded-full ${t.fScore > 6 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                                                <span className={`w-1 h-1 rounded-full ${t.zScore > 2.9 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
                                                {t.isImputed && <span className="text-[7px] text-amber-500 font-bold ml-1">IMP</span>}
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                                        Waiting for Audit Data...
                                    </div>
                                )}
                            </div>
                         </div>

                         {/* Detail View */}
                         <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                            {selectedTicker ? (
                                <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                                   {/* ... (Header) ... */}
                                   <div className="flex justify-between items-start">
                                       <div>
                                           <div className="flex items-baseline gap-3">
                                               <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                               <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                           </div>
                                           <div className="flex items-center gap-2 mt-2">
                                                <span 
                                                     onClick={() => setActiveInsight('PROFIT_SCORE')}
                                                     className="text-[8px] font-black bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 uppercase cursor-help hover:bg-cyan-900/50 transition-colors insight-trigger"
                                                >
                                                    P.Score {selectedTicker.profitScore}
                                                </span>
                                                <span 
                                                     onClick={() => setActiveInsight('Z_SCORE')}
                                                     className={`text-[8px] font-black px-2 py-0.5 rounded border border-cyan-500/20 uppercase cursor-help hover:opacity-80 transition-opacity insight-trigger ${selectedTicker.zScore < 1.8 ? 'bg-rose-900/30 text-rose-400' : 'bg-emerald-900/30 text-emerald-400'}`}
                                                >
                                                    Z-Score {selectedTicker.zScore}
                                                </span>
                                                {selectedTicker.isImputed && <span className="text-[8px] font-black text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded uppercase">IMPUTED</span>}
                                           </div>
                                       </div>
                                       <div className="text-right">
                                            <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Fundamental</p>
                                            <p className="text-2xl font-black text-cyan-400 tracking-tighter">{selectedTicker.fundamentalScore.toFixed(1)}</p>
                                       </div>
                                   </div>

                                   <div className="flex-1 w-full relative -ml-4 my-2">
                                       {/* [FIX] Use isVisible to prevent 0-size error */}
                                       {isVisible && (
                                           <ResponsiveContainer width="100%" height="100%">
                                               <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                                   <PolarGrid stroke="#334155" opacity={0.3} />
                                                   <PolarAngleAxis 
                                                       dataKey="subject" 
                                                       tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} 
                                                   />
                                                   <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                                   <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                                   <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                               </RadarChart>
                                           </ResponsiveContainer>
                                       )}
                                   </div>
                                   
                                   {/* Metric Cards */}
                                   <div className="grid grid-cols-3 gap-2 mt-2">
                                        <div 
                                             onClick={() => setActiveInsight('ROE')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">ROE</p>
                                            <p className={`text-xs font-black ${selectedTicker.roe > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.roe}%</p>
                                        </div>
                                        <div 
                                             onClick={() => setActiveInsight('DEBT')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">Debt</p>
                                            <p className={`text-xs font-black ${selectedTicker.debtToEquity < 1.0 ? 'text-emerald-400' : 'text-rose-400'}`}>{selectedTicker.debtToEquity}x</p>
                                        </div>
                                        <div 
                                             onClick={() => setActiveInsight('VALUE_SCORE')}
                                             className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5 hover:bg-slate-700/50 cursor-help transition-all insight-trigger"
                                        >
                                            <p className="text-[7px] text-slate-400 uppercase font-bold">Value</p>
                                            <p className={`text-xs font-black ${selectedTicker.valueScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.valueScore}</p>
                                        </div>
                                   </div>
                                   
                                    {/* Insight Overlay */}
                                     {activeInsight && QUANT_INSIGHTS[activeInsight] && (
                                         <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2 insight-overlay">
                                             <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-cyan-500/30 shadow-2xl relative">
                                                 <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                 </button>
                                                 <h5 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                     <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
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
                <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
                  {isSyncActive && syncProgress && (
                        <div className="mb-4 p-3 bg-black/40 rounded-2xl border border-cyan-500/20 shadow-lg animate-pulse">
                            <div className="flex justify-between text-[10px] text-cyan-400 font-black mb-1.5 px-1 italic uppercase tracking-widest">
                                <span>Syncing OHLCV Data...</span>
                                <span>{syncProgress.percentage}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-cyan-500 transition-all duration-700 shadow-[0_0_10px_#06b6d4]" 
                                    style={{ width: `${syncProgress.percentage}%` }}
                                />
                            </div>
                            <div className="mt-1.5 text-[8.5px] text-slate-500 flex justify-between px-1">
                                <span className="truncate w-24">{syncProgress.ticker}</span>
                                <span>{syncProgress.current} / {syncProgress.total}</span>
                            </div>
                        </div>
                    )}
                    <div className="flex items-center justify-between mb-8 px-2">
                        <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
                    </div>
                    <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
                        {logs.map((log, i) => (
                            <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-cyan-900'}`}>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FundamentalAnalysis;
