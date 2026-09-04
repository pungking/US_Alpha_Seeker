import { hashCanonicalJsonSha256 } from './stage0SourceEvidenceContract.mjs';
import { validateStage1ArtifactForStage2 } from './stage1PointInTimeFilterContract.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const STAGE2_SCHEMA_VERSION = 'stage2-quality-truth-v1';
const STAGE2_STATUSES = new Set(['STAGE2_BLOCKED_QUALITY_SCORE', 'STAGE2_SELECTED_ELITE', 'STAGE2_RANKED_OUT_DYNAMIC_CAPACITY']);
const HISTORY_STATUSES = new Set(['HISTORY_EVIDENCE_UNAVAILABLE', 'HISTORY_EVIDENCE_VERIFIED', 'HISTORY_EVIDENCE_VERIFIED_WITH_ROWS_REJECTED']);
const TREND_STATUSES = new Set(['TREND_EVIDENCE_VERIFIED', 'TREND_EVIDENCE_UNAVAILABLE_NEUTRAL']);
const SEASONALITY_STATUSES = new Set(['SEASONALITY_EVIDENCE_VERIFIED', 'SEASONALITY_EVIDENCE_UNAVAILABLE_NEUTRAL']);
const REGIME_STATUSES = new Set(['REGIME_EVIDENCE_VERIFIED', 'REGIME_EVIDENCE_UNAVAILABLE_NEUTRAL']);
const EVIDENCE_STATUSES = new Set(['STAGE2_EVIDENCE_COMPLETE', 'STAGE2_EVIDENCE_PARTIAL']);
const DISTRESS_MODELS = new Set(['ALTMAN_Z', 'FINANCIAL_STABILITY', 'SAFETY_PROXY']);

export const DEFAULT_STAGE2_QUALITY_POLICY = Object.freeze({
  qualityThreshold: 35,
  neutralTargetCount: 300,
  strongTargetCount: 450,
  weakTargetCount: 150,
  strongAverageScore: 70,
  weakAverageScore: 50,
  trendMaxAdjustment: 5,
  seasonalityMaxAdjustment: 4,
  qualityFactorMaxAdjustment: 3
});

const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const number = (value, fallback = 0) => finite(value) ?? fallback;
const iso = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = text(value);
  const milliseconds = typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(raw)
    ? (Number(value) >= 1e12 ? Number(value) : Number(value) * 1000)
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? Date.parse(raw) : NaN;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clampScore = (value) => clamp(value, 0, 100);
const clamp01 = (value) => clamp(value, 0, 1);
const winsorize = (value, min, max) => clamp(value, min, max);
const imputeValue = (value, fallback, allowZero = false) => {
  const parsed = finite(value);
  if (parsed === null || (parsed === 0 && !allowZero)) return fallback;
  return parsed;
};
const canonicalRows = (rows) => [...rows].sort((left, right) =>
  text(left?.symbol).localeCompare(text(right?.symbol))
  || text(left?.name).localeCompare(text(right?.name))
);
const countBy = (rows, field) => Object.fromEntries([...rows.reduce((counts, row) => {
  const value = text(row?.[field]) || 'UNCLASSIFIED';
  counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));

const sanitizeData = (row) => {
  let { dividendYield, roe, operatingMargins, pbr } = row;
  if (dividendYield > 50) dividendYield /= 100;
  if (roe > 200) roe /= 100;
  if (operatingMargins > 100) operatingMargins /= 100;
  if (pbr > 500) pbr = 0;
  return { ...row, dividendYield, roe, operatingMargins, pbr };
};

const firstFinite = (...values) => values.map(finite).find((value) => value !== null) ?? null;
const confidence = (coveragePct) => coveragePct >= 90 ? 'HIGH' : coveragePct >= 70 ? 'MEDIUM' : 'LOW';

const distressScore = (row, isFinancial, roe, roa, rawDebtRatio) => {
  const totalAssets = finite(row.totalAssets);
  const totalLiabilities = finite(row.totalLiabilities);
  const currentAssets = finite(row.currentAssets);
  const currentLiabilities = finite(row.currentLiabilities);
  const workingCapital = firstFinite(
    row.workingCapital,
    currentAssets !== null && currentLiabilities !== null ? currentAssets - currentLiabilities : null
  );
  const retainedEarnings = finite(row.retainedEarnings);
  const ebit = finite(row.ebit);
  const totalRevenue = finite(row.totalRevenue);
  const marketCap = firstFinite(row.marketCap, row.marketCapRaw, row.market_cap);
  const debtRatio = finite(rawDebtRatio);

  if (!isFinancial) {
    const inputs = [workingCapital, retainedEarnings, ebit, marketCap, totalRevenue];
    const coveragePct = Number(((inputs.filter((value) => value !== null).length / inputs.length) * 100).toFixed(1));
    if (totalAssets !== null && totalAssets > 0 && totalLiabilities !== null && totalLiabilities > 0
      && inputs.every((value) => value !== null)) {
      const value = 1.2 * (workingCapital / totalAssets)
        + 1.4 * (retainedEarnings / totalAssets)
        + 3.3 * (ebit / totalAssets)
        + 0.6 * (marketCap / totalLiabilities)
        + totalRevenue / totalAssets;
      return { value: Number(winsorize(value, -2, 8).toFixed(2)), model: 'ALTMAN_Z', coveragePct, confidence: confidence(coveragePct) };
    }
    const roeNorm = clamp01((roe + 10) / 35);
    const roaNorm = clamp01((roa + 2) / 10);
    const debtNorm = debtRatio === null ? 0.45 : clamp01(1 - (Math.max(debtRatio, 0) / 2.5));
    const liquidityNorm = currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0
      ? clamp01((currentAssets / currentLiabilities) / 2)
      : 0.5;
    const value = 1 + ((roeNorm * 0.35) + (roaNorm * 0.2) + (debtNorm * 0.35) + (liquidityNorm * 0.1)) * 2.5;
    return { value: Number(value.toFixed(2)), model: 'SAFETY_PROXY', coveragePct, confidence: confidence(coveragePct) };
  }

  const available = [
    Number.isFinite(roe),
    Number.isFinite(roa),
    debtRatio !== null,
    totalAssets !== null && totalLiabilities !== null && totalAssets > 0
  ].filter(Boolean).length;
  const coveragePct = Number(((available / 4) * 100).toFixed(1));
  const capitalRatio = totalAssets !== null && totalLiabilities !== null && totalAssets > 0
    ? (totalAssets - totalLiabilities) / totalAssets
    : null;
  const value = 1 + ((clamp01((roe + 5) / 20) * 0.35)
    + (clamp01((roa + 1) / 4) * 0.25)
    + ((debtRatio === null ? 0.5 : clamp01(1 - (Math.max(debtRatio, 0) / 8))) * 0.2)
    + ((capitalRatio === null ? 0.5 : clamp01((capitalRatio + 0.1) / 0.3)) * 0.2)) * 2.5;
  return { value: Number(value.toFixed(2)), model: 'FINANCIAL_STABILITY', coveragePct, confidence: confidence(coveragePct) };
};

const HISTORY_REVENUE_KEYS = ['Total Revenue', 'Revenue', 'Operating Revenue', 'Net Sales', 'Sales'];
const HISTORY_OPERATING_INCOME_KEYS = ['Operating Income', 'Operating Income Loss'];
const HISTORY_NET_INCOME_KEYS = ['Net Income', 'Net Income Common Stockholders', 'Net Income Including Noncontrolling Interests'];
const HISTORY_DEBT_KEYS = ['Total Debt', 'Total Debt And Capital Lease Obligation', 'Long Term Debt', 'Current Debt', 'Current Debt And Capital Lease Obligation'];
const historyNumber = (row, keys) => keys.map((key) => finite(row?.[key])).find((value) => value !== null) ?? null;
const historyDateMs = (row) => {
  const raw = row?.date || row?.asOfDate || row?.periodEndDate;
  const value = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(value) ? value : NaN;
};
const normalizeHistory = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.financials)) return raw.financials;
    return Object.keys(raw).filter((key) => !key.startsWith('_')).map((key) => ({ date: key, ...(raw[key] || {}) }));
  }
  return [];
};
const normalizeScore = (value, min, max) => value <= min ? 0 : value >= max ? 100 : ((value - min) / (max - min)) * 100;

const trendSignals = (rows, maxAdjustment) => {
  const datedRows = rows.map((row) => ({ ...row, __dateMs: historyDateMs(row) }))
    .filter((row) => Number.isFinite(row.__dateMs))
    .sort((left, right) => left.__dateMs - right.__dateMs);
  if (!datedRows.length) return { available: false, score: 50, adjustment: 0, coverage: 0, revenueCagrPct: null, marginDeltaPct: null, debtImprovementPct: null };
  const annualRows = datedRows.filter((row) => text(row._periodType).toUpperCase() === 'ANNUAL');
  const sourceRows = annualRows.length >= 3 ? annualRows : datedRows;
  const pair = (resolver) => {
    const values = sourceRows.map((row) => ({ row, value: resolver(row) })).filter(({ value }) => value !== null);
    return values.length < 2 ? null : { first: values[0], last: values.at(-1) };
  };
  const revenuePair = pair((row) => {
    const value = historyNumber(row, HISTORY_REVENUE_KEYS);
    return value !== null && value > 0 ? value : null;
  });
  let revenueCagrPct = null;
  let revenueScore = null;
  if (revenuePair && revenuePair.first.value > 0 && revenuePair.last.value > 0) {
    const years = Math.max(1, (revenuePair.last.row.__dateMs - revenuePair.first.row.__dateMs) / 31_536_000_000);
    revenueCagrPct = (Math.pow(revenuePair.last.value / revenuePair.first.value, 1 / years) - 1) * 100;
    revenueScore = normalizeScore(revenueCagrPct, -10, 18);
  }
  const marginPair = pair((row) => {
    const revenue = historyNumber(row, HISTORY_REVENUE_KEYS);
    const numerator = historyNumber(row, HISTORY_OPERATING_INCOME_KEYS) ?? historyNumber(row, HISTORY_NET_INCOME_KEYS);
    return revenue !== null && revenue > 0 && numerator !== null ? (numerator / revenue) * 100 : null;
  });
  const marginDeltaPct = marginPair ? marginPair.last.value - marginPair.first.value : null;
  const marginScore = marginDeltaPct === null ? null : normalizeScore(marginDeltaPct, -6, 8);
  const debtPair = pair((row) => {
    const value = historyNumber(row, HISTORY_DEBT_KEYS);
    return value !== null && value > 0 ? value : null;
  });
  const debtImprovementPct = debtPair && debtPair.first.value > 0
    ? ((debtPair.first.value - debtPair.last.value) / debtPair.first.value) * 100
    : null;
  const debtScore = debtImprovementPct === null ? null : normalizeScore(debtImprovementPct, -30, 30);
  const components = [
    revenueScore === null ? null : { score: revenueScore, weight: 0.45 },
    marginScore === null ? null : { score: marginScore, weight: 0.35 },
    debtScore === null ? null : { score: debtScore, weight: 0.2 }
  ].filter(Boolean);
  if (!components.length) return { available: false, score: 50, adjustment: 0, coverage: 0, revenueCagrPct, marginDeltaPct, debtImprovementPct };
  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  const score = components.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight;
  return {
    available: true,
    score,
    adjustment: clamp(((score - 50) / 50) * maxAdjustment, -maxAdjustment, maxAdjustment),
    coverage: Math.round((components.length / 3) * 100),
    revenueCagrPct,
    marginDeltaPct,
    debtImprovementPct
  };
};

const quarterKey = (row) => {
  const date = new Date(row?.date || row?.asOfDate || row?.periodEndDate || '');
  return Number.isFinite(date.getTime()) ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}` : null;
};
const quarterSort = (key) => {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  return match ? Number(match[1]) * 10 + Number(match[2]) : -1;
};
const seasonalitySignals = (rows, maxAdjustment) => {
  const quarterlyRows = rows.filter((row) => text(row?._periodType).toUpperCase() === 'QUARTERLY')
    .map((row) => ({ key: quarterKey(row), revenue: historyNumber(row, HISTORY_REVENUE_KEYS) }))
    .filter((row) => row.key && row.revenue !== null && row.revenue > 0);
  const byQuarter = new Map(quarterlyRows.map((row) => [row.key, row.revenue]));
  const keys = [...byQuarter.keys()].sort((left, right) => quarterSort(left) - quarterSort(right));
  const yoy = keys.flatMap((key) => {
    const [year, quarter] = key.split('-Q');
    const current = byQuarter.get(key);
    const previous = byQuarter.get(`${Number(year) - 1}-Q${quarter}`);
    return current && previous && previous > 0 ? [((current / previous) - 1) * 100] : [];
  });
  if (!yoy.length) return { available: false, score: 50, adjustment: 0, coverage: 0, avgYoYGrowthPct: null, positiveRatioPct: null };
  const avgYoYGrowthPct = yoy.reduce((sum, value) => sum + value, 0) / yoy.length;
  const positiveRatioPct = (yoy.filter((value) => value > 0).length / yoy.length) * 100;
  const score = normalizeScore(avgYoYGrowthPct, -12, 20) * 0.6 + normalizeScore(positiveRatioPct, 35, 90) * 0.4;
  const coverage = Math.round(Math.min(100, (keys.length / 12) * 100) * 0.4 + Math.min(100, (yoy.length / 4) * 100) * 0.6);
  return {
    available: true,
    score,
    adjustment: clamp((((score - 50) / 50) * maxAdjustment) * Math.max(0.2, coverage / 100), -maxAdjustment, maxAdjustment),
    coverage,
    avgYoYGrowthPct,
    positiveRatioPct
  };
};

const DEFENSIVE = ['healthcare', 'consumer defensive', 'utilities', 'financial', 'insurance', 'telecom', 'communication services'];
const CYCLICAL = ['technology', 'consumer cyclical', 'industrials', 'energy', 'materials', 'real estate'];
const regimeAdjustment = (sector, state, vixRef) => {
  const normalized = text(sector).toLowerCase();
  const defensive = DEFENSIVE.some((value) => normalized.includes(value));
  const cyclical = CYCLICAL.some((value) => normalized.includes(value));
  const boost = vixRef !== null && vixRef >= 24 ? 2 : 1.5;
  if (state === 'RISK_OFF') {
    if (defensive) return { adjustment: boost, tilt: 'DEFENSIVE_FAVOR' };
    if (cyclical) return { adjustment: -boost, tilt: 'CYCLICAL_CUT' };
    return { adjustment: -0.3, tilt: 'RISK_OFF_NEUTRAL' };
  }
  if (state === 'RISK_ON') {
    if (cyclical) return { adjustment: boost, tilt: 'CYCLICAL_FAVOR' };
    if (defensive) return { adjustment: -boost, tilt: 'DEFENSIVE_CUT' };
    return { adjustment: 0.4, tilt: 'RISK_ON_NEUTRAL' };
  }
  return { adjustment: 0, tilt: 'NEUTRAL' };
};

const validRegime = (evidence, decisionAt) => evidence?.status === 'REGIME_EVIDENCE_VERIFIED'
  && text(evidence?.fileName)
  && SHA256_RE.test(text(evidence?.contentSha256))
  && iso(evidence?.retrievedAt)
  && iso(evidence?.retrievedAt) <= decisionAt;

const decorateRow = async (rawRow, options) => {
  const { decisionAt, historyByIdentity, historySourceEvidenceByIdentity, regimeEvidence, policy } = options;
  const row = sanitizeData(rawRow);
  const identity = text(row.symbol);
  const rawHistory = normalizeHistory(historyByIdentity?.[identity]);
  const sourceHash = text(historySourceEvidenceByIdentity?.[identity]);
  const datedHistory = rawHistory.filter((entry) => Number.isFinite(historyDateMs(entry)));
  const invalidTimestampRows = rawHistory.length - datedHistory.length;
  const futureRows = datedHistory.filter((entry) => historyDateMs(entry) > Date.parse(decisionAt));
  const history = SHA256_RE.test(sourceHash)
    ? datedHistory.filter((entry) => historyDateMs(entry) <= Date.parse(decisionAt))
    : [];
  const historyEvidenceStatus = !SHA256_RE.test(sourceHash) || !history.length
    ? 'HISTORY_EVIDENCE_UNAVAILABLE'
    : futureRows.length || invalidTimestampRows
      ? 'HISTORY_EVIDENCE_VERIFIED_WITH_ROWS_REJECTED'
      : 'HISTORY_EVIDENCE_VERIFIED';
  const isFinancial = ['financial', 'bank', 'insurance'].some((value) => text(row.sector).toLowerCase().includes(value));
  const roeMissing = finite(row.roe) === null;
  const roe = winsorize(imputeValue(row.roe, -5, true), -50, 100);
  const roa = winsorize(imputeValue(row.roa, -2), -20, 50);
  const distress = distressScore(row, isFinancial, roe, roa, row.debtToEquity);
  const debt = finite(row.debtToEquity);
  const debtScore = debt !== null && debt < 0 ? 0 : Math.max(0, 100 - imputeValue(debt, isFinancial ? 0.5 : 1.5, true) * 50);
  const pe = number(row.pe);
  const valueScore = pe <= 0 ? 0 : pe < 10 ? 100 : pe < 20 ? 80 : pe < 35 ? 60 : pe < 50 ? 40 : 20;
  const profitScore = clampScore(isFinancial ? Math.max(0, roa * 30) + Math.max(0, roe * 2) : Math.max(0, roe * 3));
  const missingRequiredPenalty = roeMissing ? 10 : 0;
  const trend = trendSignals(history, policy.trendMaxAdjustment);
  const seasonality = seasonalitySignals(history, policy.seasonalityMaxAdjustment);
  const qualityFactorScore = clampScore(profitScore * 0.5 + debtScore * 0.35 + (100 - Math.min(100, missingRequiredPenalty * 3)) * 0.15);
  const qualityFactorAdjustment = clamp(((qualityFactorScore - 55) / 45) * policy.qualityFactorMaxAdjustment, -policy.qualityFactorMaxAdjustment, policy.qualityFactorMaxAdjustment);
  const regimeVerified = validRegime(regimeEvidence, decisionAt);
  const regime = regimeVerified
    ? regimeAdjustment(row.sector, text(regimeEvidence.state).toUpperCase(), finite(regimeEvidence.vixRef))
    : { adjustment: 0, tilt: 'NEUTRAL' };
  const qualityScore = clampScore(
    profitScore * 0.4 + debtScore * 0.3 + valueScore * 0.3 - missingRequiredPenalty
      + trend.adjustment + seasonality.adjustment + qualityFactorAdjustment + regime.adjustment
  );
  const high52 = finite(row.fiftyTwoWeekHigh);
  const low52 = finite(row.fiftyTwoWeekLow);
  const validRange = high52 !== null && low52 !== null && high52 > low52;
  const ictPos = validRange ? (number(row.price) - low52) / (high52 - low52) : null;
  const historySourceRecordSha256 = SHA256_RE.test(sourceHash) && rawHistory.length
    ? await hashCanonicalJsonSha256(rawHistory)
    : null;
  const stage2EvidenceStatus = historyEvidenceStatus.startsWith('HISTORY_EVIDENCE_VERIFIED') && regimeVerified
    ? 'STAGE2_EVIDENCE_COMPLETE'
    : 'STAGE2_EVIDENCE_PARTIAL';
  return {
    ...row,
    roe,
    debtToEquity: debt ?? 0,
    zScoreProxy: distress.value,
    zScoreModel: distress.model,
    zScoreCoveragePct: distress.coveragePct,
    zScoreConfidence: distress.confidence,
    profitScore: Math.round(profitScore),
    safeScore: Math.round(debtScore),
    valueScore: Math.round(valueScore),
    qualityScore: Number(qualityScore.toFixed(2)),
    fundamentalScore: Number(qualityScore.toFixed(2)),
    trendScore: Number(trend.score.toFixed(2)),
    trendAdjustment: Number(trend.adjustment.toFixed(2)),
    trendCoverage: trend.coverage,
    trendEvidenceStatus: trend.available ? 'TREND_EVIDENCE_VERIFIED' : 'TREND_EVIDENCE_UNAVAILABLE_NEUTRAL',
    revenueCagrPct: trend.revenueCagrPct,
    marginTrendDeltaPct: trend.marginDeltaPct,
    debtImprovementPct: trend.debtImprovementPct,
    seasonalityScore: Number(seasonality.score.toFixed(2)),
    seasonalityAdjustment: Number(seasonality.adjustment.toFixed(2)),
    seasonalityCoverage: seasonality.coverage,
    seasonalityEvidenceStatus: seasonality.available ? 'SEASONALITY_EVIDENCE_VERIFIED' : 'SEASONALITY_EVIDENCE_UNAVAILABLE_NEUTRAL',
    seasonalityYoYGrowthPct: seasonality.avgYoYGrowthPct,
    seasonalityPositiveRatioPct: seasonality.positiveRatioPct,
    qualityFactorScore: Number(qualityFactorScore.toFixed(2)),
    qualityFactorAdjustment: Number(qualityFactorAdjustment.toFixed(2)),
    regimeState: regimeVerified ? text(regimeEvidence.state).toUpperCase() : 'UNKNOWN',
    regimeVixRef: regimeVerified ? finite(regimeEvidence.vixRef) : null,
    regimeAdjustment: Number(regime.adjustment.toFixed(2)),
    regimeSectorTilt: regime.tilt,
    regimeEvidenceStatus: regimeVerified ? 'REGIME_EVIDENCE_VERIFIED' : 'REGIME_EVIDENCE_UNAVAILABLE_NEUTRAL',
    historyEvidenceStatus,
    historySourceFileSha256: SHA256_RE.test(sourceHash) ? sourceHash : null,
    historySourceRecordSha256,
    historyInputRows: rawHistory.length,
    historyUsedRows: history.length,
    historyFutureRowsRejected: futureRows.length,
    historyInvalidTimestampRowsRejected: invalidTimestampRows,
    targetScoreImpact: 0,
    historicalEvidenceNormalized: false,
    stage2EvidenceStatus,
    isImputed: false,
    ictPos: ictPos === null ? null : Number(ictPos.toFixed(4)),
    pdZoneHint: ictPos === null ? 'UNAVAILABLE' : ictPos < 0.5 ? 'DISCOUNT' : 'PREMIUM',
    radarData: [
      { subject: 'Profit', A: Math.round(profitScore), fullMark: 100 },
      { subject: 'Safety', A: Math.round(debtScore), fullMark: 100 },
      { subject: 'Value', A: Math.round(valueScore), fullMark: 100 }
    ],
    fullHistory: history.slice(0, 4)
  };
};

export const evaluateStage2Universe = async (rows = [], {
  decisionAt,
  historyByIdentity = {},
  historySourceEvidenceByIdentity = {},
  regimeEvidence = {},
  policy = DEFAULT_STAGE2_QUALITY_POLICY
} = {}) => {
  const decisionIso = iso(decisionAt);
  if (!decisionIso) throw new Error('STAGE2_DECISION_TIMESTAMP_INVALID');
  const identities = rows.map((row) => text(row?.symbol));
  if (identities.some((identity) => !identity) || new Set(identities).size !== identities.length) {
    throw new Error('STAGE2_SOURCE_IDENTITY_INVALID');
  }
  const evaluated = [];
  for (const row of canonicalRows(rows)) {
    evaluated.push(await decorateRow(row, { decisionAt: decisionIso, historyByIdentity, historySourceEvidenceByIdentity, regimeEvidence, policy }));
  }
  const qualityEligible = evaluated.filter((row) => row.qualityScore > policy.qualityThreshold)
    .sort((left, right) => right.qualityScore - left.qualityScore || text(left.symbol).localeCompare(text(right.symbol)));
  const averageScore = qualityEligible.reduce((sum, row) => sum + row.qualityScore, 0) / (qualityEligible.length || 1);
  const targetCount = averageScore >= policy.strongAverageScore
    ? policy.strongTargetCount
    : averageScore < policy.weakAverageScore ? policy.weakTargetCount : policy.neutralTargetCount;
  const selectedIdentities = new Set(qualityEligible.slice(0, targetCount).map((row) => text(row.symbol)));
  const evaluatedRows = evaluated.map((row) => ({
    ...row,
    stage2Status: row.qualityScore <= policy.qualityThreshold
      ? 'STAGE2_BLOCKED_QUALITY_SCORE'
      : selectedIdentities.has(text(row.symbol))
        ? 'STAGE2_SELECTED_ELITE'
        : 'STAGE2_RANKED_OUT_DYNAMIC_CAPACITY'
  }));
  const byIdentity = new Map(evaluatedRows.map((row) => [text(row.symbol), row]));
  const selectedRows = qualityEligible.slice(0, targetCount).map((row) => byIdentity.get(text(row.symbol)));
  return {
    inputRows: evaluatedRows.length,
    evaluatedRows,
    selectedRows,
    qualityEligibleRows: qualityEligible.length,
    targetCount,
    averageScore,
    statusCounts: countBy(evaluatedRows, 'stage2Status'),
    unknownOrUnclassifiedRows: evaluatedRows.filter((row) => !text(row.stage2Status)).length,
    lookAheadUsedRows: 0,
    futureHistoryRowsRejected: evaluatedRows.reduce((sum, row) => sum + row.historyFutureRowsRejected, 0),
    invalidHistoryTimestampRowsRejected: evaluatedRows.reduce((sum, row) => sum + row.historyInvalidTimestampRowsRejected, 0),
    targetScoreInfluenceRows: evaluatedRows.filter((row) => row.targetScoreImpact !== 0).length
  };
};

const policyContract = (policy) => ({ ...policy, targetEvidencePolicy: 'NONE_REPORT_ONLY' });
const evaluationProjection = (rows) => rows.map((row) => ({
  symbol: row.symbol,
  qualityScore: row.qualityScore,
  stage2Status: row.stage2Status,
  stage2EvidenceStatus: row.stage2EvidenceStatus,
  zScoreModel: row.zScoreModel,
  historyEvidenceStatus: row.historyEvidenceStatus,
  trendEvidenceStatus: row.trendEvidenceStatus,
  seasonalityEvidenceStatus: row.seasonalityEvidenceStatus,
  regimeEvidenceStatus: row.regimeEvidenceStatus,
  historySourceRecordSha256: row.historySourceRecordSha256,
  historyFutureRowsRejected: row.historyFutureRowsRejected,
  historyInvalidTimestampRowsRejected: row.historyInvalidTimestampRowsRejected,
  targetScoreImpact: row.targetScoreImpact
}));
const cleanSourceFiles = (rows, decisionAt) => [...rows].map((row) => ({
  fileName: text(row?.fileName),
  contentSha256: text(row?.contentSha256),
  retrievedAt: iso(row?.retrievedAt),
  inputRows: Number(row?.inputRows),
  parseStatus: text(row?.parseStatus).toUpperCase()
})).sort((left, right) => left.fileName.localeCompare(right.fileName)).map((row) => {
  if (!row.fileName || !SHA256_RE.test(row.contentSha256) || !row.retrievedAt || row.retrievedAt > decisionAt
    || !Number.isInteger(row.inputRows) || row.inputRows < 0 || row.parseStatus !== 'PARSED') {
    throw new Error('STAGE2_HISTORY_SOURCE_CONTRACT_INVALID');
  }
  return row;
});

export const buildStage2Artifact = async ({
  decisionAt,
  sourceStage1File,
  sourceStage1ContentSha256,
  sourceStage1Artifact,
  historyByIdentity = {},
  historySourceEvidenceByIdentity = {},
  historySourceFiles = [],
  regimeEvidence = {},
  policy = DEFAULT_STAGE2_QUALITY_POLICY
}) => {
  const decisionIso = iso(decisionAt);
  const stage1Validation = await validateStage1ArtifactForStage2(sourceStage1Artifact);
  if (!decisionIso || !text(sourceStage1File) || !SHA256_RE.test(text(sourceStage1ContentSha256)) || !stage1Validation.valid
    || iso(stage1Validation.manifest.decisionAt) > decisionIso) throw new Error('STAGE2_SOURCE_STAGE1_CONTRACT_INVALID');
  const sourceFiles = cleanSourceFiles(historySourceFiles, decisionIso);
  if (new Set(sourceFiles.map((row) => row.fileName)).size !== sourceFiles.length) {
    throw new Error('STAGE2_HISTORY_SOURCE_DUPLICATE');
  }
  const contract = policyContract(policy);
  const [historySourceInventorySha256, policyContractSha256] = await Promise.all([
    hashCanonicalJsonSha256(sourceFiles),
    hashCanonicalJsonSha256(contract)
  ]);
  const evaluation = await evaluateStage2Universe(stage1Validation.investableUniverse, {
    decisionAt: decisionIso,
    historyByIdentity,
    historySourceEvidenceByIdentity,
    regimeEvidence,
    policy
  });
  const evaluationRows = evaluationProjection(evaluation.evaluatedRows);
  const evaluationHash = await hashCanonicalJsonSha256(evaluationRows);
  const inputHash = await hashCanonicalJsonSha256({
    sourceStage1ContentSha256: text(sourceStage1ContentSha256),
    sourceStage1OutputHash: stage1Validation.manifest.outputHash,
    historySourceInventorySha256,
    regimeContentSha256: validRegime(regimeEvidence, decisionIso) ? regimeEvidence.contentSha256 : null,
    regimeRetrievedAt: validRegime(regimeEvidence, decisionIso) ? iso(regimeEvidence.retrievedAt) : null,
    policyContractSha256,
    evaluationHash,
    sourceCount: evaluation.inputRows,
    statusCounts: evaluation.statusCounts,
    dynamicTargetCount: evaluation.targetCount,
    decisionAt: decisionIso
  });
  const outputHash = await hashCanonicalJsonSha256({ elite_universe: evaluation.selectedRows });
  return {
    manifest: {
      schemaVersion: STAGE2_SCHEMA_VERSION,
      version: '5.7.0',
      runId: `stage2-${inputHash.slice(0, 12)}-${outputHash.slice(0, 12)}`,
      generatedAt: decisionIso,
      decisionAt: decisionIso,
      timestamp: decisionIso,
      sourceStage: 'stage2_quality',
      sourceStage1File: text(sourceStage1File),
      sourceStage1ContentSha256: text(sourceStage1ContentSha256),
      sourceStage1SchemaVersion: stage1Validation.manifest.schemaVersion,
      sourceStage1RunId: stage1Validation.manifest.runId,
      sourceStage1DecisionAt: stage1Validation.manifest.decisionAt,
      sourceStage1InputHash: stage1Validation.manifest.inputHash,
      sourceStage1OutputHash: stage1Validation.manifest.outputHash,
      sourceStage1ThresholdContractSha256: stage1Validation.manifest.thresholdContractSha256,
      sourceStage1InputCount: Number(stage1Validation.manifest.inputCount),
      sourceCount: evaluation.inputRows,
      inputCount: evaluation.inputRows,
      eligibleCount: evaluation.inputRows,
      excludedByInstrumentType: 0,
      eligibleQualityRows: evaluation.qualityEligibleRows,
      dynamicTargetCount: evaluation.targetCount,
      count: evaluation.selectedRows.length,
      statusCounts: evaluation.statusCounts,
      unknownOrUnclassifiedRows: evaluation.unknownOrUnclassifiedRows,
      lookAheadUsedRows: evaluation.lookAheadUsedRows,
      futureHistoryRowsRejected: evaluation.futureHistoryRowsRejected,
      invalidHistoryTimestampRowsRejected: evaluation.invalidHistoryTimestampRowsRejected,
      targetScoreInfluenceRows: evaluation.targetScoreInfluenceRows,
      historySourceFiles: sourceFiles,
      historySourceInventorySha256,
      regimeEvidence: validRegime(regimeEvidence, decisionIso) ? {
        fileName: text(regimeEvidence.fileName),
        contentSha256: text(regimeEvidence.contentSha256),
        retrievedAt: iso(regimeEvidence.retrievedAt),
        status: 'REGIME_EVIDENCE_VERIFIED'
      } : { fileName: null, contentSha256: null, retrievedAt: null, status: 'REGIME_EVIDENCE_UNAVAILABLE_NEUTRAL' },
      policyContract: contract,
      policyContractSha256,
      evaluationHash,
      inputHash,
      outputHash,
      engine: 'STAGE2_DETERMINISTIC_QUALITY_TRUTH',
      modelSemanticsStatus: 'REPRODUCIBLE_NOT_ECONOMICALLY_CERTIFIED',
      targetEvidencePolicy: 'NONE_REPORT_ONLY',
      historicalEvidenceNormalized: false,
      downstreamPolicyChanged: false,
      brokerOrSidecarStateMutation: false
    },
    elite_universe: evaluation.selectedRows,
    stage2_evaluation: evaluationRows
  };
};

const addReason = (reasons, condition, reason) => { if (condition) reasons.add(reason); };

export const validateStage2ArtifactForStage3 = async (artifact = {}) => {
  const reasons = new Set();
  const manifest = artifact?.manifest || {};
  const rows = Array.isArray(artifact?.elite_universe) ? artifact.elite_universe : [];
  const evaluationRows = Array.isArray(artifact?.stage2_evaluation) ? artifact.stage2_evaluation : [];
  addReason(reasons, manifest.schemaVersion !== STAGE2_SCHEMA_VERSION, 'MANIFEST_SCHEMA_INVALID');
  addReason(reasons, !text(manifest.runId) || manifest.sourceStage !== 'stage2_quality', 'MANIFEST_IDENTITY_INVALID');
  addReason(reasons, !iso(manifest.generatedAt) || !iso(manifest.decisionAt) || manifest.generatedAt !== manifest.decisionAt, 'MANIFEST_TIMESTAMP_INVALID');
  addReason(reasons, !text(manifest.sourceStage1File) || manifest.sourceStage1SchemaVersion !== 'stage1-point-in-time-v2', 'SOURCE_STAGE1_CONTRACT_INVALID');
  addReason(reasons, !SHA256_RE.test(text(manifest.sourceStage1ContentSha256))
    || !SHA256_RE.test(text(manifest.sourceStage1InputHash))
    || !SHA256_RE.test(text(manifest.sourceStage1OutputHash))
    || !SHA256_RE.test(text(manifest.sourceStage1ThresholdContractSha256)), 'SOURCE_STAGE1_HASH_INVALID');
  addReason(reasons, Number(manifest.sourceCount) !== evaluationRows.length
    || Number(manifest.sourceCount) !== Object.values(manifest.statusCounts || {}).reduce((sum, value) => sum + Number(value), 0), 'ROW_COUNT_RECONCILIATION_INVALID');
  addReason(reasons, Number(manifest.count) !== rows.length || Number(manifest.inputCount) !== Number(manifest.sourceCount), 'ROW_COUNT_RECONCILIATION_INVALID');
  addReason(reasons, Number(manifest.eligibleCount) !== Number(manifest.sourceCount) || Number(manifest.excludedByInstrumentType) !== 0, 'ROW_COUNT_RECONCILIATION_INVALID');
  addReason(reasons, Number(manifest.unknownOrUnclassifiedRows) !== 0 || Number(manifest.lookAheadUsedRows) !== 0, 'POINT_IN_TIME_CLASSIFICATION_INVALID');
  addReason(reasons, Number(manifest.targetScoreInfluenceRows) !== 0 || manifest.targetEvidencePolicy !== 'NONE_REPORT_ONLY', 'TARGET_POLICY_INFLUENCE_INVALID');
  addReason(reasons, manifest.historicalEvidenceNormalized !== false || manifest.downstreamPolicyChanged !== false, 'POLICY_INVARIANCE_INVALID');
  addReason(reasons, manifest.brokerOrSidecarStateMutation !== false, 'SAFETY_INVARIANCE_INVALID');
  addReason(reasons, !SHA256_RE.test(text(manifest.historySourceInventorySha256))
    || !SHA256_RE.test(text(manifest.policyContractSha256))
    || !SHA256_RE.test(text(manifest.evaluationHash))
    || !SHA256_RE.test(text(manifest.inputHash))
    || !SHA256_RE.test(text(manifest.outputHash)), 'HASH_CONTRACT_INVALID');
  let expectedHistorySourceInventorySha256 = null;
  try {
    const sourceFiles = cleanSourceFiles(Array.isArray(manifest.historySourceFiles) ? manifest.historySourceFiles : [], manifest.decisionAt);
    addReason(reasons, new Set(sourceFiles.map((row) => row.fileName)).size !== sourceFiles.length, 'HISTORY_SOURCE_CONTRACT_INVALID');
    expectedHistorySourceInventorySha256 = await hashCanonicalJsonSha256(sourceFiles);
  } catch {
    addReason(reasons, true, 'HISTORY_SOURCE_CONTRACT_INVALID');
  }
  const expectedPolicyContractSha256 = await hashCanonicalJsonSha256(manifest.policyContract || {});
  const regimeStatus = text(manifest.regimeEvidence?.status);
  addReason(reasons, !['REGIME_EVIDENCE_VERIFIED', 'REGIME_EVIDENCE_UNAVAILABLE_NEUTRAL'].includes(regimeStatus), 'REGIME_EVIDENCE_CONTRACT_INVALID');
  addReason(reasons, regimeStatus === 'REGIME_EVIDENCE_VERIFIED'
    && !validRegime(manifest.regimeEvidence, manifest.decisionAt), 'REGIME_EVIDENCE_CONTRACT_INVALID');
  addReason(reasons, expectedHistorySourceInventorySha256 !== manifest.historySourceInventorySha256, 'HISTORY_SOURCE_HASH_MISMATCH');
  addReason(reasons, expectedPolicyContractSha256 !== manifest.policyContractSha256, 'POLICY_CONTRACT_HASH_MISMATCH');
  const expectedEvaluationHash = await hashCanonicalJsonSha256(evaluationRows);
  addReason(reasons, expectedEvaluationHash !== manifest.evaluationHash, 'EVALUATION_HASH_MISMATCH');
  const expectedInputHash = await hashCanonicalJsonSha256({
    sourceStage1ContentSha256: manifest.sourceStage1ContentSha256,
    sourceStage1OutputHash: manifest.sourceStage1OutputHash,
    historySourceInventorySha256: manifest.historySourceInventorySha256,
    regimeContentSha256: manifest.regimeEvidence?.status === 'REGIME_EVIDENCE_VERIFIED' ? manifest.regimeEvidence?.contentSha256 : null,
    regimeRetrievedAt: manifest.regimeEvidence?.status === 'REGIME_EVIDENCE_VERIFIED' ? iso(manifest.regimeEvidence?.retrievedAt) : null,
    policyContractSha256: manifest.policyContractSha256,
    evaluationHash: manifest.evaluationHash,
    sourceCount: Number(manifest.sourceCount),
    statusCounts: manifest.statusCounts,
    dynamicTargetCount: Number(manifest.dynamicTargetCount),
    decisionAt: iso(manifest.decisionAt)
  });
  addReason(reasons, expectedInputHash !== manifest.inputHash, 'INPUT_HASH_MISMATCH');
  const identities = rows.map((row) => text(row?.symbol));
  addReason(reasons, identities.some((identity) => !identity) || new Set(identities).size !== identities.length, 'DUPLICATE_STAGE2_IDENTITY');
  const evaluationIdentities = evaluationRows.map((row) => text(row?.symbol));
  addReason(reasons, evaluationIdentities.some((identity) => !identity)
    || new Set(evaluationIdentities).size !== evaluationIdentities.length, 'DUPLICATE_STAGE2_IDENTITY');
  addReason(reasons, evaluationRows.some((row) => !Number.isFinite(Number(row?.qualityScore))
    || !STAGE2_STATUSES.has(row?.stage2Status)
    || !EVIDENCE_STATUSES.has(row?.stage2EvidenceStatus)
    || !DISTRESS_MODELS.has(row?.zScoreModel)
    || !HISTORY_STATUSES.has(row?.historyEvidenceStatus)
    || !TREND_STATUSES.has(row?.trendEvidenceStatus)
    || !SEASONALITY_STATUSES.has(row?.seasonalityEvidenceStatus)
    || !REGIME_STATUSES.has(row?.regimeEvidenceStatus)
    || Number(row?.targetScoreImpact) !== 0), 'EVALUATION_ROW_CONTRACT_INVALID');
  const policy = manifest.policyContract || {};
  const rankedEligible = evaluationRows.filter((row) => Number(row?.qualityScore) > Number(policy.qualityThreshold))
    .sort((left, right) => Number(right.qualityScore) - Number(left.qualityScore) || text(left.symbol).localeCompare(text(right.symbol)));
  const averageScore = rankedEligible.reduce((sum, row) => sum + Number(row.qualityScore), 0) / (rankedEligible.length || 1);
  const expectedTargetCount = averageScore >= Number(policy.strongAverageScore)
    ? Number(policy.strongTargetCount)
    : averageScore < Number(policy.weakAverageScore) ? Number(policy.weakTargetCount) : Number(policy.neutralTargetCount);
  const expectedSelected = rankedEligible.slice(0, expectedTargetCount).map((row) => text(row.symbol));
  const expectedSelectedSet = new Set(expectedSelected);
  addReason(reasons, Number(manifest.dynamicTargetCount) !== expectedTargetCount
    || rows.map((row) => text(row.symbol)).join('|') !== expectedSelected.join('|'), 'SELECTION_CONTRACT_INVALID');
  addReason(reasons, evaluationRows.some((row) => row.stage2Status !== (
    Number(row.qualityScore) <= Number(policy.qualityThreshold)
      ? 'STAGE2_BLOCKED_QUALITY_SCORE'
      : expectedSelectedSet.has(text(row.symbol))
        ? 'STAGE2_SELECTED_ELITE'
        : 'STAGE2_RANKED_OUT_DYNAMIC_CAPACITY'
  )), 'SELECTION_CONTRACT_INVALID');
  addReason(reasons, JSON.stringify(countBy(evaluationRows, 'stage2Status')) !== JSON.stringify(manifest.statusCounts || {}), 'ROW_COUNT_RECONCILIATION_INVALID');
  addReason(reasons, rows.some((row) => row.stage2Status !== 'STAGE2_SELECTED_ELITE'
    || text(row.instrumentType).toLowerCase() !== 'common'
    || row.analysisEligible !== true
    || row.targetScoreImpact !== 0
    || row.historicalEvidenceNormalized !== false
    || !text(row.stage2EvidenceStatus)
    || !text(row.historyEvidenceStatus)
    || !text(row.trendEvidenceStatus)
    || !text(row.seasonalityEvidenceStatus)
    || !text(row.regimeEvidenceStatus)), 'ROW_CONTRACT_INVALID');
  const expectedOutputHash = await hashCanonicalJsonSha256({ elite_universe: rows });
  addReason(reasons, expectedOutputHash !== manifest.outputHash, 'OUTPUT_HASH_MISMATCH');
  addReason(reasons, manifest.runId !== `stage2-${text(manifest.inputHash).slice(0, 12)}-${text(manifest.outputHash).slice(0, 12)}`, 'MANIFEST_IDENTITY_INVALID');
  return { valid: reasons.size === 0, reasons: [...reasons].sort(), manifest, eliteUniverse: rows };
};
