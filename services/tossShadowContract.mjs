const SHA256 = /^[a-f0-9]{64}$/i;
const COMPARISON_STATUSES = new Set([
  'MATCHED',
  'DIVERGENT_REVIEW_REQUIRED',
  'NOT_COMPARABLE_TIMESTAMP',
  'ADJUSTMENT_BASIS_MISMATCH',
  'CURRENCY_MISMATCH',
  'STALE_OR_INVALID'
]);

const iso = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};
const finite = (value) => value != null && value !== '' && Number.isFinite(Number(value))
  ? Number(value)
  : null;
const symbolKey = (value) => String(value || '').trim().toUpperCase();
const validHash = (value) => SHA256.test(String(value || ''));
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));

const excluded = (reason, artifactPresent = true, runEvidence = null) => ({
  status: 'EXCLUDED',
  exclusionReason: reason,
  artifactPresent,
  runEvidence,
  rowsBySymbol: new Map()
});

export function validateTossShadowArtifact(raw, consumedAt = new Date().toISOString(), expectedSourceArtifactFile = null) {
  if (!raw || typeof raw !== 'object') return excluded('ARTIFACT_MISSING', false);

  const lineage = raw.requestLineage;
  const sourceArtifact = lineage?.requestSourceArtifact;
  const sourceAsOf = iso(raw.sourceAsOf);
  const retrievedAt = iso(raw.retrievedAt);
  const consumerAt = iso(consumedAt);
  const responseHashes = Array.isArray(raw.responseSha256?.prices)
    ? raw.responseSha256.prices.map(String)
    : [];
  const canonicalScopeSha256 = String(lineage?.requestScopeSha256 || '');
  const providerScopeSha256 = String(lineage?.providerRequestScopeSha256 || '');
  const providerMappedRows = finite(lineage?.providerMappedRows);
  const runEvidence = {
    schemaVersion: String(raw.schemaVersion || ''),
    status: String(raw.status || ''),
    mode: String(raw.mode || ''),
    provider: String(raw.provider || ''),
    endpoint: '/api/v1/prices',
    sourceAsOf,
    retrievedAt,
    marketTimezone: String(raw.marketTimezone || ''),
    requestScopeSha256: canonicalScopeSha256 || null,
    providerRequestScopeSha256: providerScopeSha256 || null,
    responseSha256: responseHashes,
    requestSourceArtifactFile: String(sourceArtifact?.file || '') || null,
    requestSourceArtifactSha256: String(sourceArtifact?.sha256 || '') || null,
    providerSymbolMappingStatus: String(lineage?.providerSymbolMappingStatus || ''),
    providerMappedRows: providerMappedRows ?? 0,
    priceSemantics: String(raw.priceSemantics || ''),
    adjustedPriceSemantics: String(raw.adjustedPriceSemantics || ''),
    canonicalSourceChanged: raw.canonicalSourceChanged === true,
    policyImpact: String(raw.policyImpact || ''),
    accountHeaderUsed: raw.accountHeaderUsed === true,
    orderEndpointUsed: raw.orderEndpointUsed === true
  };

  const baseValid = raw.schemaVersion === 'toss-market-data-shadow-v1'
    && raw.status === 'TOSS_SHADOW_PASS'
    && raw.mode === 'SHADOW_ONLY'
    && raw.provider === 'TOSS_OPEN_API'
    && raw.eligible === true
    && raw.tossEvidenceExcluded === false
    && raw.canonicalSourceChanged === false
    && raw.policyImpact === 'NONE_REPORT_ONLY'
    && raw.priceSemantics === 'LATEST_QUOTE_NOT_HISTORICAL_ADJUSTED_CANDLE'
    && raw.adjustedPriceSemantics === 'NOT_APPLICABLE_TO_PRICES_ENDPOINT'
    && raw.accountHeaderUsed === false
    && raw.orderEndpointUsed === false
    && raw.marketTimezone === 'America/New_York'
    && lineage?.status === 'VERIFIED_STAGE3_REQUEST_SCOPE'
    && lineage?.providerSymbolMappingStatus === 'VERIFIED_DOT_HYPHEN_ALIAS'
    && Number.isInteger(providerMappedRows)
    && providerMappedRows >= 0;
  if (!baseValid) return excluded('RUN_CONTRACT_INVALID_OR_EXCLUDED', true, runEvidence);

  const sourceArtifactValid = typeof sourceArtifact?.file === 'string'
    && sourceArtifact.file.length > 0
    && validHash(sourceArtifact?.sha256)
    && iso(sourceArtifact?.generatedAt)
    && iso(sourceArtifact?.generatedAt) <= retrievedAt
    && validHash(sourceArtifact?.requestScopeSha256)
    && sourceArtifact.requestScopeSha256 === canonicalScopeSha256;
  if (!sourceArtifactValid || !validHash(canonicalScopeSha256) || !validHash(providerScopeSha256)) {
    return excluded('REQUEST_LINEAGE_INVALID', true, runEvidence);
  }
  if (expectedSourceArtifactFile && sourceArtifact.file !== expectedSourceArtifactFile) {
    return excluded('REQUEST_SOURCE_ARTIFACT_MISMATCH', true, runEvidence);
  }
  if (!sourceAsOf || !retrievedAt || !consumerAt || sourceAsOf > retrievedAt || retrievedAt > consumerAt) {
    return excluded('SOURCE_TIMESTAMP_AFTER_CONSUMER', true, runEvidence);
  }
  if (!responseHashes.length || responseHashes.some((value) => !validHash(value))) {
    return excluded('RESPONSE_HASH_INVALID', true, runEvidence);
  }

  const summary = raw.summary || {};
  const requestedRows = finite(summary.requestedRows);
  const matchedRows = finite(summary.matchedRows);
  const missingRows = finite(summary.missingRows);
  const invalidRows = finite(summary.invalidRows);
  const duplicateRows = finite(summary.duplicateRows);
  const prices = Array.isArray(raw.prices) ? raw.prices : [];
  if (requestedRows == null || matchedRows == null || missingRows == null
    || invalidRows == null || duplicateRows == null
    || ![requestedRows, matchedRows, missingRows, invalidRows, duplicateRows].every(
      (value) => Number.isInteger(value) && value >= 0
    )
    || requestedRows !== matchedRows || matchedRows !== prices.length
    || missingRows !== 0 || invalidRows !== 0 || duplicateRows !== 0) {
    return excluded('PARTIAL_OR_INVALID_RESPONSE', true, runEvidence);
  }

  const batches = Array.isArray(lineage?.batches) ? lineage.batches : [];
  const batchValid = batches.length === responseHashes.length
    && batches.every((batch, index) => Number(batch?.batchIndex) === index
      && Number.isInteger(Number(batch?.requestedCount))
      && Number(batch?.requestedCount) >= 0
      && Number.isInteger(Number(batch?.returnedCount))
      && Number(batch?.requestedCount) === Number(batch?.returnedCount)
      && validHash(batch?.batchRequestScopeSha256)
      && validHash(batch?.batchProviderRequestScopeSha256)
      && validHash(batch?.batchReturnedScopeSha256)
      && validHash(batch?.batchCanonicalReturnedScopeSha256))
    && batches.reduce((sum, batch) => sum + Number(batch.requestedCount), 0) === requestedRows;
  if (!batchValid) return excluded('BATCH_LINEAGE_INVALID', true, runEvidence);

  const rowsBySymbol = new Map();
  for (const row of prices) {
    const symbol = symbolKey(row?.symbol);
    const rowSourceAsOf = iso(row?.sourceAsOfUtc ?? row?.timestamp);
    const lastPrice = finite(row?.lastPrice);
    if (!symbol || rowsBySymbol.has(symbol) || lastPrice == null || lastPrice <= 0
      || !rowSourceAsOf || rowSourceAsOf > retrievedAt
      || !validHash(row?.providerSymbolSha256)) {
      return excluded('PRICE_ROW_INVALID_OR_DUPLICATE', true, runEvidence);
    }
    rowsBySymbol.set(symbol, {
      lastPrice,
      currency: String(row?.currency || '').trim().toUpperCase() || null,
      sourceAsOf: rowSourceAsOf,
      providerSymbolSha256: String(row.providerSymbolSha256)
    });
  }
  return { status: 'PASS', exclusionReason: null, artifactPresent: true, runEvidence, rowsBySymbol };
}

export function buildTossShadowEvidence(parsed, symbol, canonical = {}) {
  if (!parsed?.artifactPresent) return null;
  if (parsed.status !== 'PASS') {
    return {
      ...(parsed.runEvidence || {}),
      status: 'TOSS_SHADOW_EVIDENCE_EXCLUDED',
      exclusionReason: parsed.exclusionReason || 'INVALID_OR_STALE_EVIDENCE',
      eligibleForDecisionTimeSlice: false,
      decisionTimeStatus: 'SOURCE_EVIDENCE_EXCLUDED',
      comparison: { status: 'STALE_OR_INVALID' },
      policyImpact: 'NONE_REPORT_ONLY'
    };
  }
  const row = parsed.rowsBySymbol.get(symbolKey(symbol));
  if (!row) return null;
  const canonicalPrice = finite(canonical.price);
  const canonicalSourceAsOf = iso(canonical.sourceAsOf);
  const canonicalCurrency = String(canonical.currency || '').trim().toUpperCase() || null;
  const timestampSkewSec = canonicalSourceAsOf
    ? round((Date.parse(row.sourceAsOf) - Date.parse(canonicalSourceAsOf)) / 1000, 3)
    : null;
  const differenceBps = canonicalPrice != null && canonicalPrice > 0
    ? round(((row.lastPrice / canonicalPrice) - 1) * 10_000)
    : null;
  let comparisonStatus = 'STALE_OR_INVALID';
  if (canonicalCurrency && row.currency && canonicalCurrency !== row.currency) comparisonStatus = 'CURRENCY_MISMATCH';
  else if (!canonicalSourceAsOf || canonicalPrice == null || canonicalPrice <= 0) comparisonStatus = 'STALE_OR_INVALID';
  else if (timestampSkewSec !== 0) comparisonStatus = 'NOT_COMPARABLE_TIMESTAMP';
  else if (canonical.adjustmentBasisComparable !== true) comparisonStatus = 'ADJUSTMENT_BASIS_MISMATCH';
  else comparisonStatus = differenceBps === 0 ? 'MATCHED' : 'DIVERGENT_REVIEW_REQUIRED';

  return {
    ...parsed.runEvidence,
    status: 'TOSS_SHADOW_PASS',
    sourceAsOf: row.sourceAsOf,
    currency: row.currency,
    responseSha256: [...parsed.runEvidence.responseSha256],
    providerSymbolSha256: row.providerSymbolSha256,
    eligibleForDecisionTimeSlice: true,
    decisionTimeStatus: 'PENDING_STAGE6_DECISION_TIMESTAMP',
    comparison: {
      status: comparisonStatus,
      canonicalSource: String(canonical.source || '') || null,
      canonicalSourceAsOf,
      differenceBps,
      timestampSkewSec,
      adjustmentBasisComparable: canonical.adjustmentBasisComparable === true
    },
    policyImpact: 'NONE_REPORT_ONLY'
  };
}

export function sanitizeTossShadowEvidence(value, decisionAt = null) {
  if (!value || typeof value !== 'object'
    || value.schemaVersion !== 'toss-market-data-shadow-v1'
    || value.mode !== 'SHADOW_ONLY'
    || value.provider !== 'TOSS_OPEN_API'
    || value.policyImpact !== 'NONE_REPORT_ONLY') return null;
  const sourceAsOf = iso(value.sourceAsOf);
  const retrievedAt = iso(value.retrievedAt);
  const decisionTimestamp = decisionAt ? iso(decisionAt) : null;
  const timestampValid = Boolean(sourceAsOf && retrievedAt && sourceAsOf <= retrievedAt);
  const withinDecision = timestampValid && Boolean(decisionTimestamp) && retrievedAt <= decisionTimestamp;
  const rawResponseSha256 = Array.isArray(value.responseSha256) ? value.responseSha256.map(String) : [];
  const responseSha256 = rawResponseSha256.length && rawResponseSha256.every(validHash)
    ? rawResponseSha256
    : [];
  const providerMappedRows = finite(value.providerMappedRows);
  const sourceEligible = value.status === 'TOSS_SHADOW_PASS'
    && value.eligibleForDecisionTimeSlice !== false
    && value.marketTimezone === 'America/New_York'
    && value.providerSymbolMappingStatus === 'VERIFIED_DOT_HYPHEN_ALIAS'
    && value.priceSemantics === 'LATEST_QUOTE_NOT_HISTORICAL_ADJUSTED_CANDLE'
    && value.adjustedPriceSemantics === 'NOT_APPLICABLE_TO_PRICES_ENDPOINT'
    && Number.isInteger(providerMappedRows)
    && providerMappedRows >= 0
    && value.canonicalSourceChanged === false
    && value.accountHeaderUsed === false
    && value.orderEndpointUsed === false
    && validHash(value.requestScopeSha256)
    && validHash(value.providerRequestScopeSha256)
    && validHash(value.requestSourceArtifactSha256)
    && validHash(value.providerSymbolSha256)
    && responseSha256.length > 0;
  const comparisonStatus = COMPARISON_STATUSES.has(String(value.comparison?.status || ''))
    ? String(value.comparison.status)
    : 'STALE_OR_INVALID';
  const comparison = value.comparison && typeof value.comparison === 'object' ? {
    status: comparisonStatus,
    canonicalSource: value.comparison.canonicalSource == null ? null : String(value.comparison.canonicalSource),
    canonicalSourceAsOf: iso(value.comparison.canonicalSourceAsOf),
    differenceBps: finite(value.comparison.differenceBps),
    timestampSkewSec: finite(value.comparison.timestampSkewSec),
    adjustmentBasisComparable: value.comparison.adjustmentBasisComparable === true
  } : { status: 'STALE_OR_INVALID' };

  return {
    schemaVersion: 'toss-market-data-shadow-v1',
    mode: 'SHADOW_ONLY',
    provider: 'TOSS_OPEN_API',
    endpoint: '/api/v1/prices',
    status: sourceEligible ? 'TOSS_SHADOW_PASS' : 'TOSS_SHADOW_EVIDENCE_EXCLUDED',
    sourceAsOf,
    retrievedAt,
    marketTimezone: value.marketTimezone == null ? null : String(value.marketTimezone),
    currency: value.currency == null ? null : String(value.currency),
    priceSemantics: value.priceSemantics == null ? null : String(value.priceSemantics),
    adjustedPriceSemantics: value.adjustedPriceSemantics == null ? null : String(value.adjustedPriceSemantics),
    responseSha256,
    providerSymbolSha256: validHash(value.providerSymbolSha256) ? String(value.providerSymbolSha256) : null,
    requestScopeSha256: validHash(value.requestScopeSha256) ? String(value.requestScopeSha256) : null,
    providerRequestScopeSha256: validHash(value.providerRequestScopeSha256) ? String(value.providerRequestScopeSha256) : null,
    requestSourceArtifactFile: value.requestSourceArtifactFile == null ? null : String(value.requestSourceArtifactFile),
    requestSourceArtifactSha256: validHash(value.requestSourceArtifactSha256) ? String(value.requestSourceArtifactSha256) : null,
    providerSymbolMappingStatus: value.providerSymbolMappingStatus == null ? null : String(value.providerSymbolMappingStatus),
    providerMappedRows: Number.isInteger(providerMappedRows) && providerMappedRows >= 0 ? providerMappedRows : 0,
    comparison,
    eligibleForDecisionTimeSlice: sourceEligible && (!decisionTimestamp || withinDecision),
    decisionTimeStatus: sourceEligible && !decisionTimestamp
      ? 'PENDING_STAGE7_DECISION_TIMESTAMP'
      : sourceEligible && withinDecision
        ? 'VERIFIED_DECISION_TIME_SHADOW'
        : sourceEligible && timestampValid
          ? 'EXCLUDED_TIMESTAMP_AFTER_DECISION'
          : 'SOURCE_EVIDENCE_EXCLUDED',
    exclusionReason: sourceEligible && (!decisionTimestamp || withinDecision)
      ? null
      : String(value.exclusionReason || 'INVALID_OR_FUTURE_EVIDENCE'),
    canonicalSourceChanged: value.canonicalSourceChanged === true,
    accountHeaderUsed: value.accountHeaderUsed === true,
    orderEndpointUsed: value.orderEndpointUsed === true,
    policyImpact: 'NONE_REPORT_ONLY'
  };
}

export function summarizeTossShadowEvidence(rows) {
  const evidence = (Array.isArray(rows) ? rows : [])
    .map((row) => row?.tossShadowEvidence ?? row?.shadow?.toss ?? row)
    .filter((row) => row && typeof row === 'object' && row.schemaVersion === 'toss-market-data-shadow-v1');
  const mappedByScope = new Map();
  for (const row of evidence) {
    const scope = String(row.requestScopeSha256 || '');
    if (scope) mappedByScope.set(scope, Math.max(mappedByScope.get(scope) || 0, Number(row.providerMappedRows || 0)));
  }
  const eligible = (row) => row.status === 'TOSS_SHADOW_PASS'
    && row.eligibleForDecisionTimeSlice !== false
    && row.decisionTimeStatus !== 'EXCLUDED_TIMESTAMP_AFTER_DECISION';
  return {
    tossShadowSeedRows: evidence.length,
    tossShadowEligibleRows: evidence.filter(eligible).length,
    tossShadowExcludedRows: evidence.filter((row) => !eligible(row)).length,
    matchedRows: evidence.filter((row) => eligible(row) && row.comparison?.status === 'MATCHED').length,
    divergentRows: evidence.filter((row) => eligible(row) && row.comparison?.status === 'DIVERGENT_REVIEW_REQUIRED').length,
    notComparableTimestampRows: evidence.filter((row) => eligible(row) && row.comparison?.status === 'NOT_COMPARABLE_TIMESTAMP').length,
    staleOrInvalidRows: evidence.filter((row) => !eligible(row) || row.comparison?.status === 'STALE_OR_INVALID').length,
    providerAliasMappedRows: [...mappedByScope.values()].reduce((sum, count) => sum + count, 0)
  };
}
