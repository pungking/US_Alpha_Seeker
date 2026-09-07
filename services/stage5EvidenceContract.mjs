import { hashCanonicalJsonSha256 } from './stage0SourceEvidenceContract.mjs';

export const STAGE4_RECENT_HINT_KEY = 'US_ALPHA_STAGE4_RECENT_HINT';
const SCHEMA = 'stage5-ict-evidence-v1';
const SHA256 = /^[a-f0-9]{64}$/;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const isoTime = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const identity = row => typeof row?.symbol === 'string' && row.symbol === row.symbol.trim() ? row.symbol : '';
const metricKeys = ['rvol', 'rawRvol', 'rsi', 'rsRating', 'trend', 'momentum', 'mfi',
  'macdHistogram', 'diPlus', 'diMinus', 'minerviniScore', 'minerviniPassCount',
  'signalComboBonus', 'signalHeatPenalty'];
const factorKeys = ['factorCoverage', 'factorConfidence', 'factorQualityScore', 'factorAdjustmentTotal'];
const resultMetrics = ['displacement', 'liquiditySweep', 'marketStructure', 'orderBlock', 'smartMoneyFlow'];
const blockedStatuses = new Set(['STAGE5_INSTRUMENT_EXCLUDED', 'STAGE5_SOURCE_INVALID',
  'STAGE5_SOURCE_STALE', 'STAGE5_INPUT_INCOMPLETE', 'STAGE5_BAR_CONTRACT_INVALID',
  'STAGE5_FUTURE_BAR_REJECTED', 'STAGE5_GEOMETRY_INVALID']);

export function classifyStage5InputRow(row, { decisionAt }) {
  const result = (status, reasons) => ({ status, reasons });
  if (row?.instrumentType !== 'common' || row?.analysisEligible === false
    || ['RETIRED', 'EXCLUDED'].includes(row?.symbolLifecycleState)) {
    return result('STAGE5_INSTRUMENT_EXCLUDED', ['INSTRUMENT_NOT_ELIGIBLE']);
  }
  if (row.dataSource !== 'DRIVE' || row.techMetrics?.sourceIntegrityState !== 'DRIVE_VERIFIED') {
    return result('STAGE5_SOURCE_INVALID', ['OHLCV_SOURCE_NOT_VERIFIED']);
  }
  if (row.techMetrics?.dataQualityState === 'STALE') {
    return result('STAGE5_SOURCE_STALE', ['UPSTREAM_STALE']);
  }
  const missing = ['fundamentalScore', 'technicalScore', 'change'].filter(key => !finite(row[key]));
  missing.push(...metricKeys.filter(key => !finite(row.techMetrics?.[key])).map(key => `techMetrics.${key}`));
  missing.push(...factorKeys.filter(key => !finite(row[key] ?? row.techMetrics?.[key])));
  if (!identity(row) || !positive(row.price) || missing.length || !isoTime(decisionAt)) {
    return result('STAGE5_INPUT_INCOMPLETE', ['REQUIRED_INPUT_MISSING_OR_INVALID', ...missing]);
  }
  if (row.techMetrics.rawRvol < 0 || ['rvol', 'rsi', 'rsRating', 'trend', 'momentum', 'mfi', 'diPlus', 'diMinus', 'minerviniScore']
    .some(key => row.techMetrics[key] < 0 || row.techMetrics[key] > 100)
    || !['NORMAL', 'THIN', 'ILLIQUID'].includes(row.techMetrics.dataQualityState)) {
    return result('STAGE5_INPUT_INCOMPLETE', ['METRIC_UNIT_OR_QUALITY_INVALID']);
  }
  const bars = row.priceHistory;
  if (!Array.isArray(bars) || bars.length < 5) {
    return result('STAGE5_BAR_CONTRACT_INVALID', ['INSUFFICIENT_EMPIRICAL_BARS']);
  }
  // Date-only bars cannot certify intraday availability or completed-session coverage.
  const decisionDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(decisionAt));
  let previous = '';
  for (const bar of bars) {
    const date = bar?.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || date <= previous || !['open', 'high', 'low', 'close'].every(key => positive(bar[key]))
      || !finite(bar.volume) || bar.volume < 0 || bar.high < Math.max(bar.open, bar.close)
      || bar.low > Math.min(bar.open, bar.close) || bar.high < bar.low) {
      return result('STAGE5_BAR_CONTRACT_INVALID', ['INVALID_OR_UNORDERED_OHLCV']);
    }
    if (date > decisionDate) return result('STAGE5_FUTURE_BAR_REJECTED', ['BAR_AFTER_DECISION_DATE']);
    previous = date;
  }
  return result('STAGE5_INPUT_VERIFIED', []);
}

export async function buildStage5InputContext({ payload, contentSha256, fileName, expectedHint = null, decisionAt }) {
  const manifest = payload?.manifest;
  const rows = payload?.technical_universe;
  if (!SHA256.test(contentSha256) || !fileName?.startsWith('STAGE4_TECHNICAL_FULL_')
    || !isoTime(decisionAt) || !Array.isArray(rows) || rows.length === 0
    || manifest?.count !== rows.length || !manifest?.sourceStage3File
    || !SHA256.test(manifest?.sourceStage3ContentSha256)) throw new Error('STAGE4_INPUT_CONTRACT_INVALID');
  if (expectedHint && (expectedHint.fileName !== fileName || expectedHint.contentSha256 !== contentSha256
    || expectedHint.sourceStage3File !== manifest.sourceStage3File)) throw new Error('STAGE4_EXACT_HANDOFF_MISMATCH');
  const identities = rows.map(identity);
  if (identities.some(key => !key) || new Set(identities).size !== rows.length) throw new Error('STAGE4_IDENTITY_AMBIGUOUS');
  const regime = manifest.marketRegimeLineage;
  const vix = manifest.ttmSqueezeVixRef;
  if (regime?.status !== 'VERIFIED_DECISION_TIME_REGIME' || regime.triggerMatches !== true
    || regime.triggerFile !== manifest.sourceStage3File || regime.expectedTriggerFile !== manifest.sourceStage3File
    || !SHA256.test(regime.sourceSha256) || !isoTime(regime.sourceAsOf) || !isoTime(regime.retrievedAt)
    || Date.parse(regime.sourceAsOf) > Date.parse(regime.retrievedAt)
    || Date.parse(regime.retrievedAt) > Date.parse(decisionAt) || !positive(vix)) {
    throw new Error('STAGE4_FROZEN_REGIME_INVALID');
  }
  const evaluations = await Promise.all(rows.map(async (row, ordinal) => ({
    ordinal, symbol: identity(row), sourceRowSha256: await hashCanonicalJsonSha256(row),
    ...classifyStage5InputRow(row, { decisionAt })
  })));
  return { fileName, contentSha256, decisionAt, sourceStage3File: manifest.sourceStage3File,
    vix, regimeSourceSha256: regime.sourceSha256, inputRows: rows.length, evaluations,
    expectedHashStatus: expectedHint ? 'EXPECTED_CONTENT_HASH_MATCHED' : 'OBSERVED_CONTENT_HASH_ONLY' };
}

const evidenceHash = artifact => {
  const { evidenceHash: _self, ...manifest } = artifact.manifest;
  return hashCanonicalJsonSha256({ ...artifact, manifest });
};
const persistedJson = value => JSON.parse(JSON.stringify(value, (_key, item) => {
  if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('STAGE5_NONFINITE_OUTPUT');
  return item;
}));

export async function buildStage5EvidenceArtifact({ context, manifest, rankedRows, selectedRows }) {
  // Hash the JSON actually persisted: undefined object members are omitted by JSON.stringify.
  rankedRows = persistedJson(rankedRows);
  selectedRows = persistedJson(selectedRows);
  manifest = persistedJson(manifest);
  const ranked = new Map(rankedRows.map(row => [identity(row), row]));
  const selected = new Set(selectedRows.map(identity));
  if (ranked.size !== rankedRows.length || selected.size !== selectedRows.length) throw new Error('STAGE5_DUPLICATE_RESULT');
  const evaluation = await Promise.all(context.evaluations.map(async input => {
    const row = ranked.get(input.symbol);
    if (input.status === 'STAGE5_INPUT_VERIFIED' && !row) throw new Error('STAGE5_UNCLASSIFIED_RESULT');
    if (row && input.status !== 'STAGE5_INPUT_VERIFIED') throw new Error('STAGE5_INVALID_INPUT_PROMOTION');
    return { ...input, status: row ? (selected.has(input.symbol) ? 'STAGE5_SELECTED' : 'STAGE5_NOT_SELECTED') : input.status,
      selected: selected.has(input.symbol), resultRowSha256: row ? await hashCanonicalJsonSha256(row) : null,
      rankRaw: row?.rankRaw ?? null, rankFinal: row?.rankFinal ?? null };
  }));
  const artifact = { manifest: { ...manifest, schemaVersion: SCHEMA, sourceStage: 'stage5_ict',
    sourceStage4File: context.fileName, sourceStage4ContentSha256: context.contentSha256,
    sourceStage4HashBasis: 'UTF8_JSON_BYTES', sourceStage4ExpectedHashStatus: context.expectedHashStatus,
    sourceStage4SourceStage3File: context.sourceStage3File, decisionAt: context.decisionAt,
    regimeSourceSha256: context.regimeSourceSha256, vix: context.vix,
    inputCount: context.inputRows, evaluatedCount: rankedRows.length, count: selectedRows.length,
    blockedInputCount: context.inputRows - rankedRows.length, unknownOrUnclassifiedRows: 0,
    calculationSemantics: 'OHLCV_HEURISTIC_PROXIES_NOT_OBSERVED_INSTITUTIONAL_ACTIVITY',
    scoringContractVersion: 'stage5-e-v2', stage6ContractVersion: 'stage5to6-e-v2',
    empiricalAccuracyCertified: false, completedSessionOnlyVerified: false,
    publicationTimeCoverage: 'UPSTREAM_DATE_ONLY_BARS_NOT_INTRADAY_PUBLICATION_PROOF',
    adjustmentBasis: 'UPSTREAM_PASSTHROUGH_NOT_INDEPENDENTLY_VERIFIED',
    missingSessionCoverage: 'NOT_RECONSTRUCTED_FROM_DATE_ONLY_INPUT',
    inputHash: await hashCanonicalJsonSha256({ sourceFile: context.fileName, sourceSha256: context.contentSha256,
      decisionAt: context.decisionAt, scoringContractVersion: 'stage5-e-v2' }),
    outputHash: await hashCanonicalJsonSha256(selectedRows),
    evaluationHash: await hashCanonicalJsonSha256(evaluation),
    outputHashBasis: 'CANONICAL_ICT_UNIVERSE', evaluationHashBasis: 'CANONICAL_STAGE5_EVALUATION'
  }, ict_universe: selectedRows, stage5_evaluation: evaluation };
  artifact.manifest.runId = `stage5-${artifact.manifest.inputHash.slice(0, 20)}`;
  artifact.manifest.evidenceHash = await evidenceHash(artifact);
  const validation = await validateStage5EvidenceArtifact(artifact);
  if (!validation.ok) throw new Error(`STAGE5_OUTPUT_INVALID:${validation.reasons.join(',')}`);
  return artifact;
}

export async function validateStage5EvidenceArtifact(artifact) {
  const m = artifact?.manifest, rows = artifact?.ict_universe, evaluation = artifact?.stage5_evaluation;
  const reasons = [];
  if (m?.schemaVersion !== SCHEMA || !Array.isArray(rows) || !Array.isArray(evaluation)) {
    return { ok: false, reasons: ['STAGE5_SCHEMA_UNVERIFIED'] };
  }
  if (m.sourceStage !== 'stage5_ict' || !isoTime(m.decisionAt) || !isoTime(m.timestamp)
    || !m.sourceStage4File || !m.sourceStage4SourceStage3File
    || m.sourceStage4HashBasis !== 'UTF8_JSON_BYTES' || m.outputHashBasis !== 'CANONICAL_ICT_UNIVERSE'
    || m.evaluationHashBasis !== 'CANONICAL_STAGE5_EVALUATION' || m.scoringContractVersion !== 'stage5-e-v2'
    || m.empiricalAccuracyCertified !== false || m.completedSessionOnlyVerified !== false
    || !['sourceStage4ContentSha256', 'regimeSourceSha256', 'inputHash', 'outputHash', 'evaluationHash', 'evidenceHash']
      .every(key => SHA256.test(m[key]))) reasons.push('STAGE5_MANIFEST_INVALID');
  const byIdentity = new Map(evaluation.map(row => [identity(row), row]));
  if (m.count !== rows.length || m.inputCount !== evaluation.length || byIdentity.size !== evaluation.length
    || new Set(rows.map(identity)).size !== rows.length || m.unknownOrUnclassifiedRows !== 0
    || m.evaluatedCount !== evaluation.filter(row => ['STAGE5_SELECTED', 'STAGE5_NOT_SELECTED'].includes(row.status)).length
    || m.blockedInputCount + m.evaluatedCount !== evaluation.length
    || evaluation.filter(row => row.selected === true).length !== rows.length) reasons.push('STAGE5_ROW_PARITY_INVALID');
  for (const [ordinal, row] of evaluation.entries()) {
    if (!identity(row) || !SHA256.test(row.sourceRowSha256) || !Array.isArray(row.reasons)
      || (!blockedStatuses.has(row.status) && !['STAGE5_SELECTED', 'STAGE5_NOT_SELECTED'].includes(row.status))
      || row.ordinal !== ordinal || row.selected !== (row.status === 'STAGE5_SELECTED')
      || (['STAGE5_SELECTED', 'STAGE5_NOT_SELECTED'].includes(row.status)
        && (!SHA256.test(row.resultRowSha256) || !Number.isInteger(row.rankRaw) || row.rankRaw < 1
          || !Number.isInteger(row.rankFinal) || row.rankFinal < 1))) reasons.push('STAGE5_EVALUATION_INVALID');
  }
  for (const row of rows) {
    const audit = byIdentity.get(identity(row));
    if (audit?.status !== 'STAGE5_SELECTED' || !positive(row.price) || !finite(row.ictScore)
      || !finite(row.compositeAlpha) || row.ictScore < 0 || row.ictScore > 100
      || row.compositeAlpha < 0 || row.compositeAlpha > 100
      || !positive(row.otePrice) || !positive(row.ictStopLoss) || row.ictStopLoss >= row.otePrice
      || !resultMetrics.every(key => finite(row.ictMetrics?.[key]) && row.ictMetrics[key] >= 0 && row.ictMetrics[key] <= 100)
      || row.rankRaw !== audit?.rankRaw || row.rankFinal !== audit?.rankFinal
      || await hashCanonicalJsonSha256(row) !== audit?.resultRowSha256) reasons.push('STAGE5_SELECTED_ROW_INVALID');
  }
  if (await hashCanonicalJsonSha256(rows) !== m.outputHash
    || await hashCanonicalJsonSha256(evaluation) !== m.evaluationHash
    || await evidenceHash(artifact) !== m.evidenceHash) reasons.push('STAGE5_HASH_MISMATCH');
  if (await hashCanonicalJsonSha256({ sourceFile: m.sourceStage4File, sourceSha256: m.sourceStage4ContentSha256,
    decisionAt: m.decisionAt, scoringContractVersion: m.scoringContractVersion }) !== m.inputHash
    || m.runId !== `stage5-${m.inputHash?.slice(0, 20)}`) reasons.push('STAGE5_INPUT_HASH_INVALID');
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}
