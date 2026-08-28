import { hashCanonicalJsonSha256 } from './stage0SourceEvidenceContract.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const STAGE0_SCHEMA_VERSION = 'stage0-source-truth-v2';
const STAGE1_SCHEMA_VERSION = 'stage1-point-in-time-v2';
const VERIFIED_STAGE1_STATUS = 'STAGE1_POINT_IN_TIME_VERIFIED';
const VERIFIED_FINANCIAL_LINEAGE = new Set([
  'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  'FINANCIAL_LINEAGE_VERIFIED_AMENDMENT',
  'FINANCIAL_LINEAGE_DUPLICATE_SAME_ACCESSION_COLLAPSED'
]);
const VALID_THRESHOLD_SOURCES = new Set(['AI_PROPOSAL_CAPTURED', 'FALLBACK_DEFAULT', 'MANUAL_CAPTURED']);
const VALID_TARGET_POLICY_STATUSES = new Set([
  'TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY',
  'TARGET_ASOF_UNKNOWN_REPORT_ONLY',
  'TARGET_SOURCE_UNAVAILABLE_REPORT_ONLY',
  'TARGET_TIMESTAMP_FUTURE_REJECTED',
  'TARGET_EVIDENCE_INVALID_REJECTED'
]);

export const DEFAULT_STAGE1_POINT_IN_TIME_POLICY = Object.freeze({
  maxQuoteAgeDays: 5,
  smallCapMaxMarketCap: 300_000_000,
  smallCapVolumeMultiplier: 0.6,
  targetHardGateApplied: false,
  basis: 'REPOSITORY_DATA_HEALTH_POLICY_MAX_FRESHNESS_AGE_DAYS_5'
});

const normalizeText = (value) => String(value ?? '').trim();
const finiteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const requiredFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const normalizeIso = (value) => {
  if (value === null || value === undefined || value === '') return null;
  let milliseconds;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(normalizeText(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    milliseconds = numeric >= 1e12 ? numeric : numeric * 1000;
  } else {
    const raw = normalizeText(value);
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
    milliseconds = Date.parse(raw);
  }
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
};
const normalizeInstrumentType = (value) => normalizeText(value).toLowerCase();
const canonicalRowOrder = (rows) => [...rows].sort((left, right) =>
  normalizeText(left?.symbol).localeCompare(normalizeText(right?.symbol))
  || normalizeText(left?.name).localeCompare(normalizeText(right?.name))
);
const countBy = (rows, key) => Object.fromEntries([...rows.reduce((counts, row) => {
  const value = normalizeText(row?.[key]) || 'UNCLASSIFIED';
  counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));

const quoteGate = (row, decisionAt, maxQuoteAgeDays) => {
  const evidenceStatus = normalizeText(row?.quoteEvidenceStatus).toUpperCase();
  const quoteAsOf = normalizeIso(row?.quoteAsOf ?? row?.quoteTimestamp);
  const decisionIso = normalizeIso(decisionAt);
  if (evidenceStatus !== 'QUOTE_EVIDENCE_VERIFIED' || !normalizeText(row?.quoteSource) || !quoteAsOf || !decisionIso) return false;
  const ageMs = Date.parse(decisionIso) - Date.parse(quoteAsOf);
  return ageMs >= 0 && ageMs <= maxQuoteAgeDays * 86_400_000;
};

const financialGate = (row, decisionAt) => {
  const publishedAt = normalizeIso(row?.financialPublishedAt);
  const retrievedAt = normalizeIso(row?.financialRetrievedAt);
  const decisionIso = normalizeIso(decisionAt);
  return normalizeText(row?.financialEvidenceStatus).toUpperCase() === 'FINANCIAL_EVIDENCE_VERIFIED'
    && VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.financialLineageClassification).toUpperCase())
    && SHA256_RE.test(normalizeText(row?.financialSourceRecordSha256))
    && SHA256_RE.test(normalizeText(row?.financialLineageArtifactSha256))
    && Boolean(normalizeText(row?.financialSource))
    && Boolean(normalizeText(row?.fiscalPeriod))
    && Boolean(publishedAt && retrievedAt && decisionIso
      && publishedAt <= retrievedAt
      && retrievedAt <= decisionIso);
};

const targetPolicyStatus = (row, decisionAt) => {
  const status = normalizeText(row?.targetEvidenceStatus).toUpperCase();
  const target = finiteNumber(row?.targetMeanPrice);
  const targetAsOf = normalizeIso(row?.targetAsOf ?? row?.targetMeanPriceAsOf);
  const decisionIso = normalizeIso(decisionAt);
  if (status === 'TARGET_EVIDENCE_VERIFIED' && normalizeText(row?.targetSource) && target > 0 && targetAsOf && decisionIso && targetAsOf <= decisionIso) {
    return 'TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY';
  }
  if (status === 'VENDOR_TARGET_ASOF_UNKNOWN') return 'TARGET_ASOF_UNKNOWN_REPORT_ONLY';
  if (status === 'TARGET_SOURCE_NOT_AVAILABLE') return 'TARGET_SOURCE_UNAVAILABLE_REPORT_ONLY';
  if (status === 'TARGET_TIMESTAMP_FUTURE' || (targetAsOf && decisionIso && targetAsOf > decisionIso)) {
    return 'TARGET_TIMESTAMP_FUTURE_REJECTED';
  }
  return 'TARGET_EVIDENCE_INVALID_REJECTED';
};

const pointInTimeStatus = (gates) => {
  if (!gates.instrumentGate) return 'STAGE1_BLOCKED_INSTRUMENT';
  if (!gates.quoteEvidenceGate) return 'STAGE1_BLOCKED_QUOTE_EVIDENCE';
  if (!gates.financialEvidenceGate) return 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE';
  if (!gates.priceGate) return 'STAGE1_BLOCKED_PRICE';
  if (!gates.liquidityGate) return 'STAGE1_BLOCKED_LIQUIDITY';
  if (!gates.peGate) return 'STAGE1_BLOCKED_PE';
  if (!gates.roeGate) return 'STAGE1_BLOCKED_ROE';
  return VERIFIED_STAGE1_STATUS;
};

const discoveryTag = (row, policy, minVolume, targetStatus) => {
  const marketCap = finiteNumber(row?.marketCap);
  const volume = finiteNumber(row?.volume);
  const price = finiteNumber(row?.price);
  const target = finiteNumber(row?.targetMeanPrice);
  if (marketCap > 0 && marketCap <= policy.smallCapMaxMarketCap && volume < minVolume) return 'SmallCap_Gem';
  if (price < 5 && volume > minVolume * 2) return 'High_RVOL_Penny';
  if (targetStatus === 'TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY' && price < target * 0.6) return 'Deep_Value_Discount';
  return 'Standard_Growth';
};

/**
 * @param {Array<Record<string, any>>} rows
 * @param {{decisionAt?: unknown, minPrice?: unknown, minVolume?: unknown, policy?: any}} options
 */
export const evaluateStage1Universe = (rows = [], {
  decisionAt,
  minPrice,
  minVolume,
  policy = DEFAULT_STAGE1_POINT_IN_TIME_POLICY
} = {}) => {
  const decisionIso = normalizeIso(decisionAt);
  if (!decisionIso) throw new Error('STAGE1_DECISION_TIMESTAMP_INVALID');
  const priceThreshold = requiredFiniteNumber(minPrice);
  const volumeThreshold = requiredFiniteNumber(minVolume);
  if (priceThreshold === null || volumeThreshold === null || priceThreshold < 0 || volumeThreshold < 0) {
    throw new Error('STAGE1_THRESHOLD_INVALID');
  }

  const evaluatedRows = canonicalRowOrder(rows).map((row) => {
    const marketCap = finiteNumber(row?.marketCap);
    const effectiveMinVolume = marketCap > 0 && marketCap <= policy.smallCapMaxMarketCap
      ? volumeThreshold * policy.smallCapVolumeMultiplier
      : volumeThreshold;
    const targetStatus = targetPolicyStatus(row, decisionIso);
    const gates = {
      instrumentGate: normalizeInstrumentType(row?.instrumentType) === 'common'
        && row?.analysisEligible !== false
        && !['RETIRED', 'EXCLUDED'].includes(normalizeText(row?.symbolLifecycleState).toUpperCase()),
      quoteEvidenceGate: quoteGate(row, decisionIso, policy.maxQuoteAgeDays),
      financialEvidenceGate: financialGate(row, decisionIso),
      priceGate: finiteNumber(row?.price) >= priceThreshold,
      liquidityGate: finiteNumber(row?.volume) >= effectiveMinVolume,
      peGate: finiteNumber(row?.pe) > 0 || finiteNumber(row?.per) > 0,
      roeGate: finiteNumber(row?.roe) > 0
    };
    const status = pointInTimeStatus(gates);
    const targetPolicyEligible = targetStatus === 'TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY';
    return {
      ...row,
      effectiveMinVolume,
      stage1Gates: gates,
      stage1PointInTimeStatus: status,
      stage1ExclusionReasons: status === VERIFIED_STAGE1_STATUS ? [] : [status],
      targetPolicyStatus: targetStatus,
      targetPolicyEligible,
      targetMeanPricePolicyValue: targetPolicyEligible ? finiteNumber(row?.targetMeanPrice) : null,
      targetHardGateApplied: false,
      discoveryTag: discoveryTag(row, policy, volumeThreshold, targetStatus)
    };
  });

  const acceptedRows = evaluatedRows.filter((row) => row.stage1PointInTimeStatus === VERIFIED_STAGE1_STATUS);
  const legacyTargetGatePassedRows = acceptedRows.filter((row) => finiteNumber(row?.targetMeanPrice) > 0).length;
  const targetStatusCounts = countBy(evaluatedRows, 'targetPolicyStatus');
  const unknownOrUnclassifiedRows = evaluatedRows.filter((row) =>
    !normalizeText(row?.stage1PointInTimeStatus) || !normalizeText(row?.targetPolicyStatus)
  ).length;

  return {
    inputRows: evaluatedRows.length,
    evaluatedRows,
    acceptedRows,
    blockedRows: evaluatedRows.length - acceptedRows.length,
    statusCounts: countBy(evaluatedRows, 'stage1PointInTimeStatus'),
    targetHardGateApplied: false,
    targetBiasAudit: {
      targetValuePositiveRows: evaluatedRows.filter((row) => finiteNumber(row?.targetMeanPrice) > 0).length,
      targetPointInTimeVerifiedRows: targetStatusCounts.TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY || 0,
      targetAsOfUnknownRows: targetStatusCounts.TARGET_ASOF_UNKNOWN_REPORT_ONLY || 0,
      targetSourceUnavailableRows: targetStatusCounts.TARGET_SOURCE_UNAVAILABLE_REPORT_ONLY || 0,
      targetFutureOrInvalidRows: (targetStatusCounts.TARGET_TIMESTAMP_FUTURE_REJECTED || 0)
        + (targetStatusCounts.TARGET_EVIDENCE_INVALID_REJECTED || 0),
      currentLegacyTargetGatePassedRows: legacyTargetGatePassedRows,
      excludedOnlyByLegacyTargetGateRows: acceptedRows.length - legacyTargetGatePassedRows,
      reportOnlyCounterfactualWithoutTargetRows: acceptedRows.length
    },
    unknownOrUnclassifiedRows
  };
};

const thresholdContract = (thresholds, policy) => ({
  minPrice: requiredFiniteNumber(thresholds?.minPrice),
  minVolume: requiredFiniteNumber(thresholds?.minVolume),
  smallCapMaxMarketCap: policy.smallCapMaxMarketCap,
  smallCapVolumeMultiplier: policy.smallCapVolumeMultiplier,
  maxQuoteAgeDays: policy.maxQuoteAgeDays,
  targetHardGateApplied: false,
  profitabilityGate: 'PE_POSITIVE_AND_ROE_POSITIVE_WITH_VERIFIED_PUBLICATION_LINEAGE',
  thresholdSource: normalizeText(thresholds?.thresholdSource).toUpperCase(),
  thresholdProvider: normalizeText(thresholds?.thresholdProvider) || null,
  thresholdModel: normalizeText(thresholds?.thresholdModel) || null,
  regime: normalizeText(thresholds?.regime) || null
});

const stage1OutputHash = (rows) => hashCanonicalJsonSha256({ investable_universe: canonicalRowOrder(rows) });
const stage1InputHash = ({ sourceStage0OutputHash, sourceStage0FinancialLineageArtifactSha256, thresholdContractSha256, decisionAt }) => hashCanonicalJsonSha256({
  sourceStage0OutputHash,
  sourceStage0FinancialLineageArtifactSha256,
  thresholdContractSha256,
  decisionAt
});

export const buildStage1Artifact = async ({
  decisionAt,
  sourceStage0File,
  sourceStage0Manifest,
  rows,
  thresholds,
  policy = DEFAULT_STAGE1_POINT_IN_TIME_POLICY
}) => {
  const decisionIso = normalizeIso(decisionAt);
  const sourceStage0OutputHash = normalizeText(sourceStage0Manifest?.outputHash);
  const sourceStage0GeneratedAt = normalizeIso(sourceStage0Manifest?.generatedAt);
  const sourceStage0InputCount = Number(sourceStage0Manifest?.inputCount);
  const sourceStage0EligibleCount = Number(sourceStage0Manifest?.eligibleCount);
  const sourceStage0ExcludedCount = Number(sourceStage0Manifest?.excludedByInstrumentType);
  const sourceStage0FinancialLineage = sourceStage0Manifest?.financialLineageContract || {};
  const sourceStage0FinancialLineageArtifactSha256 = normalizeText(sourceStage0FinancialLineage?.artifactContentSha256);
  const sourceRows = Array.isArray(rows) ? rows : [];
  const sourceIdentities = sourceRows.map((row) => normalizeText(row?.symbol));
  if (
    !decisionIso
    || !normalizeText(sourceStage0File)
    || sourceStage0Manifest?.schemaVersion !== STAGE0_SCHEMA_VERSION
    || !normalizeText(sourceStage0Manifest?.runId)
    || !sourceStage0GeneratedAt
    || sourceStage0GeneratedAt > decisionIso
    || !SHA256_RE.test(normalizeText(sourceStage0Manifest?.sourceInventorySha256))
    || !SHA256_RE.test(normalizeText(sourceStage0Manifest?.inputHash))
    || !SHA256_RE.test(sourceStage0OutputHash)
    || sourceStage0FinancialLineage?.status !== 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED'
    || !SHA256_RE.test(sourceStage0FinancialLineageArtifactSha256)
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.producerEvidenceSha256))
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.producerInputHash))
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.producerOutputHash))
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.identityMapContentSha256))
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.identityMapCanonicalSha256))
    || !SHA256_RE.test(normalizeText(sourceStage0FinancialLineage?.currentDailySourceInventorySha256))
    || sourceStage0FinancialLineage?.rowCountParity !== true
    || sourceStage0FinancialLineage?.currentDailySourceHashParity !== true
    || Number(sourceStage0FinancialLineage?.sourceRows) !== sourceStage0InputCount
    || Number(sourceStage0FinancialLineage?.matchedRows) !== sourceStage0InputCount
    || Number(sourceStage0FinancialLineage?.unknownOrUnclassifiedRows) !== 0
    || sourceStage0FinancialLineage?.canonicalSourceChanged !== false
    || sourceStage0FinancialLineage?.policyImpact !== 'NONE_REPORT_ONLY'
    || sourceStage0FinancialLineage?.Stage1To7PolicyChanged !== false
    || sourceStage0FinancialLineage?.brokerOrSidecarStateMutation !== false
    || !Number.isInteger(sourceStage0InputCount)
    || !Number.isInteger(sourceStage0EligibleCount)
    || !Number.isInteger(sourceStage0ExcludedCount)
    || sourceStage0EligibleCount !== sourceRows.length
    || sourceStage0InputCount !== sourceStage0EligibleCount + sourceStage0ExcludedCount
    || sourceIdentities.some((identity) => !identity)
    || new Set(sourceIdentities).size !== sourceIdentities.length
  ) {
    throw new Error('STAGE1_SOURCE_STAGE0_CONTRACT_INVALID');
  }
  const contract = thresholdContract(thresholds, policy);
  if (!VALID_THRESHOLD_SOURCES.has(contract.thresholdSource)) throw new Error('STAGE1_THRESHOLD_SOURCE_INVALID');
  if (contract.thresholdSource === 'AI_PROPOSAL_CAPTURED' && (!contract.thresholdProvider || !contract.thresholdModel)) {
    throw new Error('STAGE1_THRESHOLD_PROVENANCE_INVALID');
  }
  const evaluation = evaluateStage1Universe(sourceRows, {
    decisionAt: decisionIso,
    minPrice: contract.minPrice,
    minVolume: contract.minVolume,
    policy
  });
  const origin = contract.thresholdSource === 'AI_PROPOSAL_CAPTURED'
    ? 'AI_FILTER'
    : contract.thresholdSource === 'FALLBACK_DEFAULT'
      ? 'FALLBACK_RECOVERY'
      : 'MANUAL_FILTER';
  const investableUniverse = evaluation.acceptedRows.map((row) => ({ ...row, origin }));
  const thresholdContractSha256 = await hashCanonicalJsonSha256(contract);
  const inputHash = await stage1InputHash({
    sourceStage0OutputHash,
    sourceStage0FinancialLineageArtifactSha256,
    thresholdContractSha256,
    decisionAt: decisionIso
  });
  const outputHash = await stage1OutputHash(investableUniverse);
  return {
    manifest: {
      schemaVersion: STAGE1_SCHEMA_VERSION,
      runId: `stage1-${inputHash.slice(0, 12)}-${outputHash.slice(0, 12)}`,
      generatedAt: decisionIso,
      decisionAt: decisionIso,
      sourceStage: 'stage1_prefilter',
      sourceStage0File: normalizeText(sourceStage0File) || null,
      sourceStage0SchemaVersion: sourceStage0Manifest.schemaVersion,
      sourceStage0RunId: sourceStage0Manifest.runId,
      sourceStage0GeneratedAt,
      sourceStage0InventorySha256: sourceStage0Manifest.sourceInventorySha256,
      sourceStage0InputHash: sourceStage0Manifest.inputHash,
      sourceStage0OutputHash,
      sourceStage0FinancialLineageArtifactSha256,
      sourceStage0FinancialLineageEvidenceSha256: sourceStage0FinancialLineage.producerEvidenceSha256,
      sourceStage0FinancialLineageInputHash: sourceStage0FinancialLineage.producerInputHash,
      sourceStage0FinancialLineageOutputHash: sourceStage0FinancialLineage.producerOutputHash,
      sourceStage0IdentityMapContentSha256: sourceStage0FinancialLineage.identityMapContentSha256,
      sourceStage0IdentityMapCanonicalSha256: sourceStage0FinancialLineage.identityMapCanonicalSha256,
      sourceStage0DailySourceInventorySha256: sourceStage0FinancialLineage.currentDailySourceInventorySha256,
      count: investableUniverse.length,
      sourceCount: sourceRows.length,
      inputCount: sourceStage0InputCount,
      eligibleCount: sourceStage0EligibleCount,
      excludedByInstrumentType: sourceStage0ExcludedCount,
      pointInTimeVerifiedRows: investableUniverse.length,
      evidenceBlockedRows: evaluation.blockedRows,
      financialLineageVerifiedRows: investableUniverse.filter((row) =>
        VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.financialLineageClassification).toUpperCase())
          && normalizeText(row?.financialLineageArtifactSha256) === sourceStage0FinancialLineageArtifactSha256
      ).length,
      unresolvedPromotionRows: investableUniverse.filter((row) =>
        !VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.financialLineageClassification).toUpperCase())
          || normalizeText(row?.financialLineageArtifactSha256) !== sourceStage0FinancialLineageArtifactSha256
      ).length,
      statusCounts: evaluation.statusCounts,
      targetHardGateApplied: false,
      targetBiasAudit: evaluation.targetBiasAudit,
      thresholdSource: contract.thresholdSource,
      thresholdProvider: contract.thresholdProvider,
      thresholdModel: contract.thresholdModel,
      thresholdContract: contract,
      thresholdContractSha256,
      inputHash,
      outputHash,
      unknownOrUnclassifiedRows: evaluation.unknownOrUnclassifiedRows,
      policyImpact: 'STAGE1_POINT_IN_TIME_INPUT_INTEGRITY_ONLY',
      downstreamPolicyChanged: false
    },
    investable_universe: investableUniverse
  };
};

const addReason = (reasons, condition, reason) => {
  if (condition) reasons.add(reason);
};

export const validateStage1ArtifactForStage2 = async (artifact = {}) => {
  const reasons = new Set();
  const manifest = artifact?.manifest || {};
  const investableUniverse = Array.isArray(artifact?.investable_universe) ? artifact.investable_universe : [];
  addReason(reasons, manifest?.schemaVersion !== STAGE1_SCHEMA_VERSION, 'MANIFEST_SCHEMA_INVALID');
  addReason(reasons, !normalizeIso(manifest?.decisionAt) || !normalizeIso(manifest?.generatedAt), 'MANIFEST_TIMESTAMP_INVALID');
  addReason(reasons, !normalizeText(manifest?.runId) || manifest?.sourceStage !== 'stage1_prefilter', 'MANIFEST_IDENTITY_INVALID');
  addReason(reasons, manifest?.sourceStage0SchemaVersion !== STAGE0_SCHEMA_VERSION, 'SOURCE_STAGE0_CONTRACT_INVALID');
  addReason(reasons, !normalizeText(manifest?.sourceStage0RunId), 'SOURCE_STAGE0_CONTRACT_INVALID');
  addReason(reasons,
    !normalizeText(manifest?.sourceStage0File)
      || !normalizeIso(manifest?.sourceStage0GeneratedAt)
      || normalizeIso(manifest?.sourceStage0GeneratedAt) > normalizeIso(manifest?.decisionAt),
    'SOURCE_STAGE0_LOOKAHEAD_INVALID');
  addReason(reasons, !SHA256_RE.test(normalizeText(manifest?.sourceStage0InventorySha256)), 'SOURCE_STAGE0_HASH_INVALID');
  addReason(reasons, !SHA256_RE.test(normalizeText(manifest?.sourceStage0InputHash)), 'SOURCE_STAGE0_HASH_INVALID');
  addReason(reasons, !SHA256_RE.test(normalizeText(manifest?.sourceStage0OutputHash)), 'SOURCE_STAGE0_HASH_INVALID');
  addReason(reasons,
    !SHA256_RE.test(normalizeText(manifest?.sourceStage0FinancialLineageArtifactSha256))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0FinancialLineageEvidenceSha256))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0FinancialLineageInputHash))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0FinancialLineageOutputHash))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0IdentityMapContentSha256))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0IdentityMapCanonicalSha256))
      || !SHA256_RE.test(normalizeText(manifest?.sourceStage0DailySourceInventorySha256)),
    'SOURCE_STAGE0_FINANCIAL_LINEAGE_INVALID');
  addReason(reasons, Number(manifest?.count) !== investableUniverse.length || Number(manifest?.pointInTimeVerifiedRows) !== investableUniverse.length, 'STAGE1_ROW_COUNT_MISMATCH');
  addReason(reasons,
    Number(manifest?.sourceCount) !== Number(manifest?.eligibleCount)
      || Number(manifest?.inputCount) !== Number(manifest?.eligibleCount) + Number(manifest?.excludedByInstrumentType),
    'SOURCE_STAGE0_ROW_COUNT_MISMATCH');
  addReason(reasons, manifest?.targetHardGateApplied !== false || manifest?.thresholdContract?.targetHardGateApplied !== false, 'TARGET_HARD_GATE_CONTRACT_INVALID');
  addReason(reasons, Number(manifest?.unknownOrUnclassifiedRows) !== 0, 'POINT_IN_TIME_CLASSIFICATION_INVALID');
  addReason(reasons,
    Number(manifest?.unresolvedPromotionRows) !== 0
      || Number(manifest?.financialLineageVerifiedRows) !== investableUniverse.length,
    'SOURCE_STAGE0_FINANCIAL_LINEAGE_INVALID');
  addReason(reasons, investableUniverse.some((row) =>
    row?.stage1PointInTimeStatus !== VERIFIED_STAGE1_STATUS
      || row?.targetHardGateApplied !== false
      || Object.values(row?.stage1Gates || {}).length !== 7
      || Object.values(row?.stage1Gates || {}).some((value) => value !== true)
      || !VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.financialLineageClassification).toUpperCase())
      || !SHA256_RE.test(normalizeText(row?.financialSourceRecordSha256))
      || normalizeText(row?.financialLineageArtifactSha256) !== normalizeText(manifest?.sourceStage0FinancialLineageArtifactSha256)
  ), 'POINT_IN_TIME_CLASSIFICATION_INVALID');
  addReason(reasons, investableUniverse.some((row) => {
    const targetStatus = normalizeText(row?.targetPolicyStatus);
    const targetVerified = targetStatus === 'TARGET_POINT_IN_TIME_VERIFIED_REPORT_ONLY';
    return !VALID_TARGET_POLICY_STATUSES.has(targetStatus)
      || row?.targetPolicyEligible !== targetVerified
      || (targetVerified ? !(finiteNumber(row?.targetMeanPricePolicyValue) > 0) : row?.targetMeanPricePolicyValue !== null);
  }), 'TARGET_REPORT_ONLY_CLASSIFICATION_INVALID');
  const identities = investableUniverse.map((row) => normalizeText(row?.symbol));
  addReason(reasons, identities.some((identity) => !identity) || new Set(identities).size !== identities.length, 'DUPLICATE_STAGE1_IDENTITY');

  const source = normalizeText(manifest?.thresholdSource).toUpperCase();
  addReason(reasons, !VALID_THRESHOLD_SOURCES.has(source), 'THRESHOLD_PROVENANCE_INVALID');
  addReason(reasons, source === 'AI_PROPOSAL_CAPTURED' && (!normalizeText(manifest?.thresholdProvider) || !normalizeText(manifest?.thresholdModel)), 'THRESHOLD_PROVENANCE_INVALID');
  const configuredThresholds = manifest?.thresholdContract || {};
  addReason(reasons,
    requiredFiniteNumber(configuredThresholds?.minPrice) === null
      || requiredFiniteNumber(configuredThresholds?.minVolume) === null
      || configuredThresholds?.minPrice < 0
      || configuredThresholds?.minVolume < 0
      || configuredThresholds?.smallCapMaxMarketCap !== DEFAULT_STAGE1_POINT_IN_TIME_POLICY.smallCapMaxMarketCap
      || configuredThresholds?.smallCapVolumeMultiplier !== DEFAULT_STAGE1_POINT_IN_TIME_POLICY.smallCapVolumeMultiplier
      || configuredThresholds?.maxQuoteAgeDays !== DEFAULT_STAGE1_POINT_IN_TIME_POLICY.maxQuoteAgeDays,
    'THRESHOLD_CONTRACT_INVALID');
  const expectedThresholdHash = await hashCanonicalJsonSha256(manifest?.thresholdContract || {});
  addReason(reasons, expectedThresholdHash !== manifest?.thresholdContractSha256, 'THRESHOLD_CONTRACT_HASH_MISMATCH');
  const expectedInputHash = await stage1InputHash({
    sourceStage0OutputHash: manifest?.sourceStage0OutputHash,
    sourceStage0FinancialLineageArtifactSha256: manifest?.sourceStage0FinancialLineageArtifactSha256,
    thresholdContractSha256: manifest?.thresholdContractSha256,
    decisionAt: normalizeIso(manifest?.decisionAt)
  });
  addReason(reasons, expectedInputHash !== manifest?.inputHash, 'INPUT_HASH_MISMATCH');
  const expectedOutputHash = await stage1OutputHash(investableUniverse);
  addReason(reasons, expectedOutputHash !== manifest?.outputHash, 'OUTPUT_HASH_MISMATCH');
  addReason(reasons, manifest?.runId !== `stage1-${expectedInputHash.slice(0, 12)}-${expectedOutputHash.slice(0, 12)}`, 'MANIFEST_IDENTITY_INVALID');
  addReason(reasons, manifest?.downstreamPolicyChanged !== false, 'DOWNSTREAM_POLICY_INVARIANCE_INVALID');

  return {
    valid: reasons.size === 0,
    reasons: [...reasons].sort(),
    manifest,
    investableUniverse
  };
};
