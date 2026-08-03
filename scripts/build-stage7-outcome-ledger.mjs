#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stage6Dir = path.resolve(root, process.env.STAGE7_STAGE6_DIR || 'state/stage6-audit-source');
const stage4Dir = path.resolve(root, process.env.STAGE7_STAGE4_DIR || 'state/stage4-audit-source');
const ledgerOut = path.resolve(root, process.env.STAGE7_OUTCOME_LEDGER_OUT || 'state/stage7-outcome-ledger.json');
const oosOut = path.resolve(root, process.env.STAGE7_OOS_OUT || 'state/stage3-5-oos-outcomes.json');
const markdownOut = path.resolve(root, process.env.STAGE7_OUTCOME_MD_OUT || 'docs/STAGE7_OUTCOME_LEDGER.md');
const horizonBars = positiveInt(process.env.STAGE7_HORIZON_BARS, 20);
const minimumResolvedRowsPerCohort = positiveInt(process.env.STAGE35_OOS_MIN_SAMPLE, 30);
const requiredComparableRegimes = 2;
const costs = {
  spreadBps: nonNegativeNumber(process.env.STAGE7_SPREAD_BPS, 10),
  slippageBps: nonNegativeNumber(process.env.STAGE7_SLIPPAGE_BPS, 5),
  commissionBps: nonNegativeNumber(process.env.STAGE7_COMMISSION_BPS, 1),
  basis: 'conservative_policy_assumption_v1'
};
const COHORTS = {
  executable: 'EXECUTABLE_COHORT',
  blocked: 'ACTIONABLE_BLOCKED_COHORT',
  control: 'NON_ACTIONABLE_CONTROL_COHORT'
};
const DEFAULT_ACTIONABLE_VERDICTS = ['BUY', 'STRONG_BUY', 'STRONGBUY'];
const ACCUMULATION_CLASSES = {
  pendingHorizon: 'PENDING_HORIZON_NOT_MATURED',
  pendingHistory: 'PENDING_HISTORY_RETRYABLE',
  comparableResolved: 'COMPARISON_ELIGIBLE_RESOLVED',
  resolvedNonReturn: 'RESOLVED_NON_RETURN_OUTCOME',
  corporateActionUnverified: 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED',
  legacyImmutable: 'EXCLUDED_LEGACY_IMMUTABLE',
  sourceContractBlocked: 'EXCLUDED_SOURCE_CONTRACT_BLOCKED',
  invalidLineage: 'INVALID_DECISION_OR_HISTORY_LINEAGE'
};
const PIPELINE_ROOT_CAUSES = {
  seed: 'SEED_INGESTION_MISSING_OR_DUPLICATE',
  decisionLineage: 'DECISION_LINEAGE_INVALID',
  historyRetryable: 'HISTORY_SOURCE_MISSING_RETRYABLE',
  horizon: 'HORIZON_NOT_MATURED',
  sourceContract: 'CORPORATE_ACTION_SOURCE_CONTRACT_BLOCKED',
  consumerOverbroad: 'CORPORATE_ACTION_CONSUMER_CONTRACT_OVERBROAD',
  marketRegime: 'MARKET_REGIME_LINEAGE_INVALID',
  outcomeResolution: 'OUTCOME_RESOLUTION_DEFECT',
  resolvedNonReturn: 'RESOLVED_NON_RETURN_OUTCOME',
  comparableResolved: 'COMPARISON_ELIGIBLE_RESOLVED'
};
const COMPARISON_EVIDENCE_MODES = {
  historical: 'HISTORICAL_FULL_LOOKBACK_VERIFIED',
  prospective: 'PROSPECTIVE_DECISION_TO_HORIZON_VERIFIED'
};
const PROSPECTIVE_SCHEMA_VERSION = 'prospective-corporate-action-surveillance-v1';

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isoTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const SYMBOL_MATCH_METHOD = 'DETERMINISTIC_EXACT_NORMALIZED_SYMBOL_LOOKUP';
const MARKET_REGIMES = new Set(['RISK_ON', 'NEUTRAL', 'RISK_OFF']);

function normalizeProspectiveSurveillance(raw, symbol, decisionAt = null) {
  if (!raw || typeof raw !== 'object') return null;
  const normalizedSymbol = normalized(symbol);
  const decisionMs = Date.parse(String(decisionAt || ''));
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : [])
    .filter((row) => row && typeof row === 'object')
    .filter((row) => !Number.isFinite(decisionMs) || Date.parse(String(row.retrievedAt || '')) <= decisionMs)
    .map((row) => ({
      sessionDate: String(row.sessionDate || '').slice(0, 10) || null,
      marketTimezone: row.marketTimezone || null,
      universeSnapshotSha256: row.universeSnapshotSha256 || null,
      tickerMappingSha256: row.tickerMappingSha256 || null,
      source: row.source || null,
      sourceAsOf: isoTimestamp(row.sourceAsOf),
      retrievedAt: isoTimestamp(row.retrievedAt),
      requestStatus: row.requestStatus || null,
      sourceScopeComplete: row.sourceScopeComplete === true,
      paginationComplete: row.paginationComplete === true,
      responseSha256: row.responseSha256 || null,
      positiveEventsSha256: row.positiveEventsSha256 || null,
      sourceCapabilitySnapshotSha256: row.sourceCapabilitySnapshotSha256 || null,
      partial: row.partial === true,
      stale: row.stale === true,
      conflict: row.conflict === true,
      symbolObserved: row.symbolObserved === true,
      identityStatus: row.identityStatus || null,
      suspensionStatus: row.suspensionStatus || null
    }))
    .sort((a, b) => String(a.sessionDate).localeCompare(String(b.sessionDate)));
  return {
    schemaVersion: raw.schemaVersion || null,
    status: raw.status || null,
    activationAt: isoTimestamp(raw.activationAt),
    activationCommit: raw.activationCommit || null,
    activationArtifact: raw.activationArtifact || null,
    activationArtifactSha256: raw.activationArtifactSha256 || null,
    freeSourceCapabilityMatrix: raw.freeSourceCapabilityMatrix || null,
    symbol: normalized(raw.symbol) || normalizedSymbol,
    sessionCount: sessions.length,
    completeSessionCount: sessions.filter((row) => row.sourceScopeComplete).length,
    sourceGapSessionCount: sessions.filter((row) => !row.sourceScopeComplete).length,
    latestSessionComplete: sessions.at(-1)?.sourceScopeComplete === true,
    sessions
  };
}

function prospectiveSessionValid(row) {
  const sourceAsOfMs = Date.parse(String(row?.sourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(row?.retrievedAt || ''));
  return Boolean(
    /^\d{4}-\d{2}-\d{2}$/.test(String(row?.sessionDate || ''))
    && row?.marketTimezone === 'America/New_York'
    && row?.requestStatus === 'SUCCESS'
    && row?.sourceScopeComplete === true
    && row?.paginationComplete === true
    && row?.partial === false
    && row?.stale === false
    && row?.conflict === false
    && row?.symbolObserved === true
    && ['ACTIVE_LISTING_CONTINUITY_OBSERVED', 'ACTIVE_LISTING_OBSERVED_NEW_OR_RESTORED'].includes(row?.identityStatus)
    && row?.suspensionStatus === 'NO_ACTIVE_SUSPENSION_IN_COMPLETE_SESSION'
    && SHA256_PATTERN.test(String(row?.universeSnapshotSha256 || ''))
    && SHA256_PATTERN.test(String(row?.tickerMappingSha256 || ''))
    && SHA256_PATTERN.test(String(row?.responseSha256 || ''))
    && SHA256_PATTERN.test(String(row?.positiveEventsSha256 || ''))
    && SHA256_PATTERN.test(String(row?.sourceCapabilitySnapshotSha256 || ''))
    && Number.isFinite(sourceAsOfMs)
    && Number.isFinite(retrievedAtMs)
    && sourceAsOfMs <= retrievedAtMs
  );
}

function evaluateProspectiveComparison(seed, historyRecord, eligibleBars) {
  const decision = seed?.decisionSnapshot?.prospectiveSurveillance;
  const current = historyRecord?.lineage?.prospectiveSurveillance;
  const reasons = [];
  const activationAtMs = Date.parse(String(decision?.activationAt || ''));
  const decisionAtMs = Date.parse(String(seed?.generatedAt || ''));
  const capabilities = current?.freeSourceCapabilityMatrix || decision?.freeSourceCapabilityMatrix || {};
  if (decision?.schemaVersion !== PROSPECTIVE_SCHEMA_VERSION || current?.schemaVersion !== PROSPECTIVE_SCHEMA_VERSION) {
    reasons.push('prospective_schema_invalid');
  }
  if (!SHA256_PATTERN.test(String(decision?.activationArtifactSha256 || ''))
    || decision?.activationArtifactSha256 !== current?.activationArtifactSha256) {
    reasons.push('prospective_activation_lineage_mismatch');
  }
  if (!Number.isFinite(activationAtMs) || !Number.isFinite(decisionAtMs) || decisionAtMs < activationAtMs) {
    reasons.push('decision_before_prospective_activation');
  }
  if (normalized(decision?.symbol) !== seed.symbol || normalized(current?.symbol) !== seed.symbol) {
    reasons.push('prospective_symbol_mismatch');
  }
  for (const capability of ['symbolChange', 'delisting', 'suspension']) {
    if (capabilities?.[capability]?.prospectiveDecisionToHorizon !== 'FREE_READY') {
      reasons.push(`prospective_${capability}_source_not_ready`);
    }
  }
  if (historyRecord?.lineage?.adjustmentType !== 'YFINANCE_AUTO_ADJUSTED_OHLC'
    || historyRecord?.lineage?.splitAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED'
    || historyRecord?.lineage?.dividendAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED') {
    reasons.push('prospective_adjustment_lineage_unverified');
  }
  if (seed?.marketRegimeLineageVerifiedForComparison !== true) reasons.push('prospective_market_regime_unverified');

  const sessionsByDate = new Map((current?.sessions || []).map((row) => [row.sessionDate, row]));
  const requiredDates = eligibleBars.slice(0, horizonBars).map((bar) => bar.date);
  let identityEvent = false;
  let suspensionEvent = false;
  for (const date of requiredDates) {
    const session = sessionsByDate.get(date);
    if (!session) {
      reasons.push(`prospective_session_missing:${date}`);
      continue;
    }
    if (session.identityStatus === 'REMOVED_FROM_ACTIVE_LISTING_REQUIRES_EVENT_EVIDENCE') identityEvent = true;
    if (session.suspensionStatus === 'ACTIVE_SUSPENSION_OBSERVED') suspensionEvent = true;
    if (!prospectiveSessionValid(session)) reasons.push(`prospective_session_incomplete:${date}`);
  }
  const uniqueReasons = [...new Set(reasons)];
  const baseValid = uniqueReasons.length === 0;
  const horizonMatured = eligibleBars.length >= horizonBars;
  const status = identityEvent
    ? 'PROSPECTIVE_SYMBOL_IDENTITY_EVENT_REVIEW_REQUIRED'
    : suspensionEvent
      ? 'PROSPECTIVE_SUSPENSION_EVENT_REVIEW_REQUIRED'
      : uniqueReasons.some((reason) => reason.startsWith('prospective_session_'))
        ? 'FREE_SOURCE_PROSPECTIVE_COVERAGE_INCOMPLETE'
        : !baseValid
          ? 'INVALID_PROSPECTIVE_ACCUMULATION_CONTRACT'
          : horizonMatured
            ? 'VERIFIED_FOR_COMPARISON'
            : 'PROSPECTIVE_SOURCE_COMPLETE_HORIZON_PENDING';
  return {
    mode: COMPARISON_EVIDENCE_MODES.prospective,
    status,
    reasons: uniqueReasons,
    resolutionAllowed: baseValid,
    verifiedForComparison: baseValid && horizonMatured,
    horizonMatured,
    observedMarketSessions: Math.min(eligibleBars.length, horizonBars),
    requiredMarketSessions: horizonBars,
    remainingMarketSessions: Math.max(0, horizonBars - eligibleBars.length)
  };
}

function evaluateMarketRegimeLineage(rawLineage, stage6GeneratedAt) {
  const lineage = rawLineage && typeof rawLineage === 'object' ? rawLineage : null;
  const marketRegime = normalized(lineage?.marketRegime);
  const sourceAsOf = isoTimestamp(lineage?.sourceAsOf);
  const retrievedAt = isoTimestamp(lineage?.retrievedAt);
  const decisionAt = isoTimestamp(stage6GeneratedAt);
  const score = Number(lineage?.score);
  const sourceAsOfMs = Date.parse(String(sourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(retrievedAt || ''));
  const decisionAtMs = Date.parse(String(decisionAt || ''));
  const reasons = [];
  if (!lineage) reasons.push('market_regime_lineage_missing');
  if (lineage?.schemaVersion !== 'market-regime-lineage-v1') reasons.push('market_regime_schema_invalid');
  if (lineage?.status !== 'VERIFIED_DECISION_TIME_REGIME') reasons.push('market_regime_status_unverified');
  if (!MARKET_REGIMES.has(marketRegime)) reasons.push('market_regime_value_invalid');
  if (lineage?.source !== 'HARVESTER_MARKET_REGIME_SNAPSHOT') reasons.push('market_regime_source_invalid');
  if (!String(lineage?.sourceFile || '').trim()) reasons.push('market_regime_source_file_missing');
  if (!SHA256_PATTERN.test(String(lineage?.sourceSha256 || ''))) reasons.push('market_regime_source_hash_invalid');
  if (lineage?.triggerMatches !== true
    || !String(lineage?.triggerFile || '').trim()
    || lineage?.triggerFile !== lineage?.expectedTriggerFile) {
    reasons.push('market_regime_trigger_mismatch');
  }
  if (!Number.isFinite(score) || score < 0 || score > 100) reasons.push('market_regime_score_invalid');
  if (![sourceAsOfMs, retrievedAtMs, decisionAtMs].every(Number.isFinite)) {
    reasons.push('market_regime_timestamp_invalid');
  } else if (sourceAsOfMs > retrievedAtMs || retrievedAtMs > decisionAtMs) {
    reasons.push('market_regime_timestamp_after_decision');
  }
  if (lineage?.marketTimezone !== 'America/New_York') reasons.push('market_regime_timezone_invalid');
  if (lineage?.qualityStatus !== 'PASS_COMPLETE_SNAPSHOT') reasons.push('market_regime_quality_degraded');
  if (lineage?.freshnessStatus !== 'CURRENT_TRIGGER_MATCH') reasons.push('market_regime_source_not_fresh');
  if (lineage?.degraded !== false) reasons.push('market_regime_degraded');
  const uniqueReasons = [...new Set(reasons)];
  const verified = uniqueReasons.length === 0;
  const status = verified
    ? 'VERIFIED_DECISION_TIME_REGIME'
    : !lineage
      ? 'MARKET_REGIME_LINEAGE_MISSING'
      : uniqueReasons.includes('market_regime_timestamp_after_decision')
      ? 'SOURCE_TIMESTAMP_AFTER_DECISION'
      : uniqueReasons.includes('market_regime_quality_degraded') || uniqueReasons.includes('market_regime_degraded')
        ? 'DEGRADED_SOURCE'
        : 'MARKET_REGIME_LINEAGE_INVALID';
  return {
    verified,
    status,
    reasons: uniqueReasons,
    marketRegime: verified ? marketRegime : 'UNKNOWN',
    lineage: {
      schemaVersion: lineage?.schemaVersion || null,
      status: lineage?.status || null,
      source: lineage?.source || null,
      sourceFile: lineage?.sourceFile || null,
      sourceSha256: lineage?.sourceSha256 || null,
      triggerFile: lineage?.triggerFile || null,
      expectedTriggerFile: lineage?.expectedTriggerFile || null,
      triggerMatches: lineage?.triggerMatches === true,
      sourceAsOf,
      retrievedAt,
      marketTimezone: lineage?.marketTimezone || null,
      qualityStatus: lineage?.qualityStatus || null,
      freshnessStatus: lineage?.freshnessStatus || null,
      degraded: lineage?.degraded === true,
      fallbackSource: lineage?.fallbackSource || null,
      marketRegime: verified ? marketRegime : 'UNKNOWN',
      score: Number.isFinite(score) ? score : null
    }
  };
}

function verifiedSymbolAliasChain(evidence, lineageSymbol, sourceSymbol, evidenceAsOfMs) {
  if (evidence?.status !== 'VERIFIED_SYMBOL_CHANGE') return false;
  const target = normalized(lineageSymbol);
  const source = normalized(sourceSymbol);
  const events = Array.isArray(evidence.events) && evidence.events.length
    ? evidence.events
    : [evidence];
  const normalizedEvents = events
    .map((event) => ({
      oldSymbol: normalized(event?.oldSymbol),
      newSymbol: normalized(event?.newSymbol),
      eventEffectiveAt: isoTimestamp(event?.eventEffectiveAt)
    }))
    .filter((event) => event.oldSymbol && event.newSymbol && event.eventEffectiveAt)
    .sort((a, b) => a.eventEffectiveAt.localeCompare(b.eventEffectiveAt));
  if (!target
    || normalizedEvents.length !== events.length
    || normalizedEvents.some((event) => Date.parse(event.eventEffectiveAt) > evidenceAsOfMs)) {
    return false;
  }
  if (normalized(evidence.newSymbol) !== target) return false;
  let cursor = source && source !== target
    ? source
    : normalized(evidence.oldSymbol) || normalizedEvents[0]?.oldSymbol;
  const visited = new Set();
  for (let index = 0; index < normalizedEvents.length && cursor; index += 1) {
    if (cursor === target) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const next = normalizedEvents.find((event) => event.oldSymbol === cursor);
    if (!next) return false;
    cursor = next.newSymbol;
  }
  return cursor === target;
}

function evidenceContractValid(
  evidence,
  expectedStatuses,
  {
    lineageSymbol,
    sourceSymbol,
    historySourceAsOf,
    lineageEvaluatedAt,
    historyLookbackStart
  }
) {
  if (!evidence || typeof evidence !== 'object') return false;
  const status = String(evidence.status || '');
  const targetSymbol = normalized(lineageSymbol);
  const requestedSymbol = normalized(evidence.requestedSymbol);
  const matchedSymbol = normalized(evidence.matchedSymbol);
  const matchStatus = normalized(evidence.symbolMatchStatus);
  const sourceAsOfMs = Date.parse(String(evidence.sourceAsOf || ''));
  const evidenceRetrievedAtMs = Date.parse(String(evidence.retrievedAt || ''));
  const historyAsOfMs = Date.parse(String(historySourceAsOf || ''));
  const lineageEvaluatedAtMs = Date.parse(String(lineageEvaluatedAt || ''));
  const historyLookbackStartMs = Date.parse(String(historyLookbackStart || ''));
  const coverageStartMs = Date.parse(String(evidence.coverageStart || ''));
  const coverageEndMs = Date.parse(`${String(evidence.coverageEnd || '').slice(0, 10)}T23:59:59.999Z`);
  if (!expectedStatuses.has(status)
    || !String(evidence.source || '').trim()
    || evidence.requestStatus !== 'SUCCESS'
    || !targetSymbol
    || requestedSymbol !== targetSymbol
    || evidence.symbolMatchMethod !== SYMBOL_MATCH_METHOD
    || evidence.sourceScopeComplete !== true
    || !String(evidence.queryScope || '').trim()
    || evidence.partialResponse !== false
    || !SHA256_PATTERN.test(String(evidence.responseSha256 || ''))
    || !SHA256_PATTERN.test(String(evidence.requestScopeSymbolsSha256 || ''))
    || ![
      sourceAsOfMs,
      evidenceRetrievedAtMs,
      historyAsOfMs,
      lineageEvaluatedAtMs,
      historyLookbackStartMs,
      coverageStartMs,
      coverageEndMs
    ].every(Number.isFinite)
    || coverageStartMs > coverageEndMs
    || coverageStartMs > historyLookbackStartMs
    || historyLookbackStartMs > historyAsOfMs
    || historyAsOfMs > sourceAsOfMs
    || sourceAsOfMs > evidenceRetrievedAtMs
    || evidenceRetrievedAtMs > lineageEvaluatedAtMs
    || historyAsOfMs > coverageEndMs) {
    return false;
  }
  if (evidence.eventEffectiveAt) {
    const effectiveAtMs = Date.parse(String(evidence.eventEffectiveAt));
    if (!Number.isFinite(effectiveAtMs) || effectiveAtMs > sourceAsOfMs) return false;
  }
  if (status === 'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE'
    || status === 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE') {
    return !matchedSymbol && matchStatus === 'NO_EXACT_EVENT_MATCH_IN_COMPLETE_RESPONSE';
  }
  if (status === 'VERIFIED_SYMBOL_CHANGE') {
    return matchedSymbol === targetSymbol
      && matchStatus === 'EXACT_EVENT_MATCH'
      && verifiedSymbolAliasChain(evidence, targetSymbol, sourceSymbol, sourceAsOfMs);
  }
  if (status === 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE') {
    return (
      (!matchedSymbol && matchStatus === 'NO_EXACT_EVENT_MATCH_IN_COMPLETE_RESPONSE')
      || (
        matchedSymbol === targetSymbol
        && [
          'EXACT_HISTORICAL_EVENT_MATCH_CURRENTLY_RESUMED',
          'EXACT_HISTORICAL_EVENT_MATCH_NOT_IN_CURRENT_FEED'
        ].includes(matchStatus)
      )
    );
  }
  return false;
}

function evaluateHistoryLineage(lineage) {
  const reasons = [];
  const sourceAsOfMs = Date.parse(String(lineage?.sourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(lineage?.retrievedAt || ''));
  const allowedCorporateActionStatuses = new Set([
    'VERIFIED_SPLIT_DIVIDEND_EVENTS_IN_WINDOW',
    'VERIFIED_NO_SPLIT_OR_DIVIDEND_EVENT_IN_WINDOW'
  ]);
  const symbolChangeStatuses = new Set([
    'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE',
    'VERIFIED_SYMBOL_CHANGE'
  ]);
  const symbolChangeEvidenceValid = evidenceContractValid(
    lineage?.symbolChangeEvidence,
    symbolChangeStatuses,
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  );
  const aliasKeyMatch = Boolean(
    lineage?.lineageSymbol
    && lineage?.stage4Symbol
    && (
      normalized(lineage.lineageSymbol) === normalized(lineage.stage4Symbol)
      || (
        lineage?.symbolChangeStatus === 'VERIFIED_SYMBOL_CHANGE'
        && symbolChangeEvidenceValid
        && [
          normalized(lineage?.sourceSymbol),
          normalized(lineage?.lineageSymbol)
        ].includes(normalized(lineage.stage4Symbol))
      )
    )
  );

  if (lineage?.schemaVersion !== 'corporate-action-lineage-v1') reasons.push('lineage_schema_not_verified');
  if (lineage?.lineageContractStatus !== 'PRESENT') reasons.push('lineage_not_present');
  if (!aliasKeyMatch) reasons.push('lineage_symbol_mismatch');
  if (!lineage?.vendor) reasons.push('vendor_missing');
  if (!Number.isFinite(sourceAsOfMs)) reasons.push('source_as_of_missing_or_invalid');
  if (!Number.isFinite(retrievedAtMs)) reasons.push('retrieved_at_missing_or_invalid');
  if (Number.isFinite(sourceAsOfMs) && Number.isFinite(retrievedAtMs) && sourceAsOfMs > retrievedAtMs) {
    reasons.push('source_as_of_after_retrieval');
  }
  if (lineage?.marketTimezone !== 'America/New_York') reasons.push('market_timezone_unverified');
  if (lineage?.adjustmentType !== 'YFINANCE_AUTO_ADJUSTED_OHLC') reasons.push('adjustment_type_unverified');
  if (lineage?.splitAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED') reasons.push('split_adjustment_unverified');
  if (lineage?.dividendAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED') reasons.push('dividend_adjustment_unverified');
  if (!allowedCorporateActionStatuses.has(String(lineage?.corporateActionStatus || ''))) reasons.push('corporate_action_status_unverified');
  if (!symbolChangeStatuses.has(String(lineage?.symbolChangeStatus || ''))) reasons.push('symbol_change_status_unverified');
  if (lineage?.delistingStatus !== 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE') reasons.push('delisting_status_unverified_or_delisted');
  if (lineage?.suspensionStatus !== 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE') reasons.push('suspension_status_unverified_or_suspended');
  if (lineage?.sourceFreshnessStatus !== 'FRESH') reasons.push('source_not_fresh');
  if (lineage?.historyCoverageStatus !== 'VERIFIED_OBSERVED_HISTORY') reasons.push('history_coverage_unverified');
  if (lineage?.survivorshipBiasStatus !== 'VERIFIED_CORPORATE_ACTION_LINEAGE') reasons.push('survivorship_lineage_unverified');
  if (lineage?.returnBasis !== 'DIVIDEND_AND_SPLIT_ADJUSTED_PRICE_RETURN') reasons.push('return_basis_unverified');
  if (lineage?.lineageVerifiedByProducer !== true) reasons.push('producer_comparison_contract_not_verified');
  if (!symbolChangeEvidenceValid) reasons.push('symbol_change_evidence_invalid');
  if (!evidenceContractValid(
    lineage?.delistingEvidence,
    new Set(['VERIFIED_NOT_DELISTED_AS_OF_SOURCE']),
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  )) reasons.push('delisting_evidence_invalid');
  if (!evidenceContractValid(
    lineage?.suspensionEvidence,
    new Set(['VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE']),
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  )) reasons.push('suspension_evidence_invalid');

  return {
    status: reasons.length ? 'UNVERIFIED_FOR_COMPARISON' : 'VERIFIED_FOR_COMPARISON',
    reasons: [...new Set(reasons)]
  };
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function jsonFiles(directory, prefix) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(directory, name));
}

function marketTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = (Number(value.hour) * 60) + Number(value.minute);
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes,
    phase: minutes < 570 ? 'PRE_RTH' : minutes < 960 ? 'RTH' : 'POST_RTH'
  };
}

function primaryBlocker(row, actionable, sourceLineageValid) {
  const finalDecision = normalized(row?.finalDecision);
  const decisionReason = normalized(row?.decisionReason);
  const qualityLane = normalized(row?.qualityGateLane);
  const structureLane = normalized(row?.structurePolicyBlockerLane);
  const riskLane = normalized(row?.riskGeometryRepairLane);
  const tuningLane = normalized(row?.zeroExecutableTuningLane);

  if (!sourceLineageValid) return 'SCHEMA_OR_LINEAGE_MISMATCH';
  if (!actionable) return 'QUALITY_NON_ACTIONABLE_VERDICT';
  if (finalDecision === 'EXECUTABLE_NOW') return 'NONE';
  if (qualityLane && qualityLane !== 'NOT_APPLICABLE') {
    return qualityLane.includes('WEAK_PILLAR') ? 'WEAK_PILLAR' : 'QUALITY_GATE';
  }
  if (row?.targetNoTradeConfirmed === true || tuningLane === 'TARGET_RECALIBRATION') {
    return 'TARGET_RECALIBRATION_NO_TRADE';
  }
  if ((riskLane && riskLane !== 'NOT_APPLICABLE')
    || tuningLane.includes('RISK_GEOMETRY')
    || decisionReason.includes('INVALID_GEOMETRY')
    || decisionReason.includes('RR_BELOW')
    || decisionReason.includes('STOP_TOO')) {
    return 'RISK_GEOMETRY';
  }
  if ((structureLane && structureLane !== 'NOT_APPLICABLE') || decisionReason.includes('STRUCTURE')) {
    return 'STRUCTURE_PROOF';
  }
  if (decisionReason.includes('BREAKOUT') || tuningLane.includes('BREAKOUT_PROOF')) {
    return 'BREAKOUT_PROOF_NOT_CONFIRMED';
  }
  if (decisionReason.includes('EARNINGS') || decisionReason.includes('STALE')) {
    return 'EARNINGS_OR_DATA_FRESHNESS';
  }
  return 'SCHEMA_OR_LINEAGE_MISMATCH';
}

function decisionSurface(payload) {
  const surfaces = [
    [payload?.execution_contract?.executablePicks, 30],
    [payload?.execution_contract?.modelTop6, 20],
    [payload?.execution_contract?.watchlistTop, 10]
  ];
  const selected = new Map();
  let inputRows = 0;
  for (const [rows, priority] of surfaces) {
    for (const row of Array.isArray(rows) ? rows : []) {
      inputRows += 1;
      const symbol = normalized(row?.symbol);
      if (!symbol || (selected.get(symbol)?.priority ?? -1) >= priority) continue;
      selected.set(symbol, { row, priority });
    }
  }
  return {
    rows: [...selected.values()].map(({ row }) => row),
    deduplicatedRows: inputRows - selected.size
  };
}

function readStage6Seeds() {
  const seeds = [];
  const rejected = [];
  const sourceFiles = [];
  let deduplicatedSurfaceRows = 0;
  for (const filePath of jsonFiles(stage6Dir, 'STAGE6_ALPHA_FINAL_')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      rejected.push({ file: path.basename(filePath), reason: `invalid_json:${error.name}` });
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const generatedAt = payload?.manifest?.timestamp || payload?.execution_contract?.generatedAt || null;
    const signalMarket = marketTimestamp(generatedAt);
    const signalDate = signalMarket?.date || null;
    const stage6Hash = crypto.createHash('sha256').update(raw).digest('hex');
    const decisionGate = payload?.execution_contract?.decisionGate || payload?.manifest?.decisionGate || {};
    const actionableVerdicts = new Set(
      Array.isArray(decisionGate.actionableVerdicts)
        ? decisionGate.actionableVerdicts.map(normalized)
        : DEFAULT_ACTIONABLE_VERDICTS
    );
    const surface = decisionSurface(payload);
    deduplicatedSurfaceRows += surface.deduplicatedRows;
    for (const pick of surface.rows) {
      const symbol = String(pick?.symbol || '').trim().toUpperCase();
      const entryPrice = finitePositive(pick?.entryExecPrice ?? pick?.entryAnchorPrice ?? pick?.entryPrice);
      const targetPrice = finitePositive(pick?.targetPrice);
      const stopPrice = finitePositive(pick?.stopPrice ?? pick?.stopLoss);
      if (!symbol || !generatedAt || !signalDate) {
        rejected.push({ file: path.basename(filePath), symbol: symbol || null, reason: 'invalid_or_incomplete_decision_identity' });
        continue;
      }
      const verdict = normalized(pick?.executionVerdict ?? pick?.aiVerdict ?? pick?.verdictFinal ?? pick?.verdict);
      const actionable = typeof pick?.executionActionableVerdict === 'boolean'
        ? pick.executionActionableVerdict && actionableVerdicts.has(verdict)
        : actionableVerdicts.has(verdict);
      const decisionReason = String(pick?.decisionReason || '').trim();
      const stage6GeneratedAt = isoTimestamp(generatedAt);
      const sourceStage5Timestamp = isoTimestamp(payload?.manifest?.sourceStage5Timestamp);
      const sourceTimestampOrderValid = Boolean(
        stage6GeneratedAt
        && sourceStage5Timestamp
        && sourceStage5Timestamp <= stage6GeneratedAt
      );
      const sourceMarkedStale = normalized(decisionReason).includes('STALE');
      const sourceFreshnessStatus = sourceMarkedStale
        ? 'SOURCE_MARKED_STALE_AT_DECISION'
        : !sourceStage5Timestamp
          ? 'SOURCE_TIMESTAMP_MISSING'
          : sourceTimestampOrderValid
            ? 'SOURCE_TIMESTAMP_ORDER_VALID'
            : 'SOURCE_TIMESTAMP_AFTER_DECISION';
      const sourceLineageValid = Boolean(payload?.manifest?.sourceSha)
        && sourceTimestampOrderValid
        && !sourceMarkedStale;
      const blocker = primaryBlocker(pick, actionable, sourceLineageValid);
      const finalDecision = normalized(pick?.finalDecision) || 'UNKNOWN';
      const marketRegimeEvidence = evaluateMarketRegimeLineage(
        pick?.marketRegimeLineage,
        stage6GeneratedAt
      );
      const prospectiveSurveillance = normalizeProspectiveSurveillance(
        pick?.corporateActionLineage?.prospectiveSurveillance,
        symbol,
        stage6GeneratedAt
      );
      const marketRegime = marketRegimeEvidence.marketRegime;
      const decisionCohort = finalDecision === 'EXECUTABLE_NOW' && actionable && sourceLineageValid
        ? COHORTS.executable
        : actionable && sourceLineageValid && blocker !== 'SCHEMA_OR_LINEAGE_MISMATCH'
          ? COHORTS.blocked
          : COHORTS.control;
      const geometryValid = Boolean(entryPrice && targetPrice && stopPrice && stopPrice < entryPrice && entryPrice < targetPrice);
      const decisionSnapshot = {
        symbol,
        generatedAt,
        stage6File: path.basename(filePath),
        stage6Hash,
        sourceRunId: payload?.manifest?.sourceRunId || null,
        sourceSha: payload?.manifest?.sourceSha || null,
        sourceLineageStatus: sourceLineageValid ? 'STAGE6_LINEAGE_PRESENT' : 'STAGE6_LINEAGE_MISSING_OR_STALE',
        sourceStage5File: payload?.manifest?.sourceStage5File || null,
        sourceStage5Hash: payload?.manifest?.sourceStage5Hash || null,
        sourceStage5Timestamp,
        sourceFreshnessStatus,
        verdict,
        actionable,
        finalDecision,
        decisionReason: decisionReason || null,
        marketRegime,
        marketRegimeLineage: marketRegimeEvidence.lineage,
        marketRegimeLineageStatus: marketRegimeEvidence.status,
        marketRegimeLineageReasons: marketRegimeEvidence.reasons,
        marketRegimeLineageVerifiedForComparison: marketRegimeEvidence.verified,
        ...(prospectiveSurveillance ? { prospectiveSurveillance } : {}),
        primaryBlocker: blocker,
        decisionCohort,
        zeroExecutableTuningLane: pick?.zeroExecutableTuningLane || null,
        qualityGateLane: pick?.qualityGateLane || null,
        structurePolicyBlockerLane: pick?.structurePolicyBlockerLane || null,
        riskGeometryRepairLane: pick?.riskGeometryRepairLane || null,
        targetRecalibrationViabilityVerdict: pick?.targetRecalibrationViabilityVerdict || null,
        targetNoTradeConfirmed: pick?.targetNoTradeConfirmed ?? null,
        breakoutRetestProofConfirmed: pick?.breakoutRetestProofConfirmed ?? null,
        symbolChangeReference: pick?.previousSymbol ?? pick?.priorSymbol ?? null,
        entryPrice,
        currentPrice: finitePositive(pick?.price ?? pick?.currentPrice),
        targetPrice,
        stopPrice,
        rrAtEntry: finitePositive(pick?.riskRewardRatioValue),
        rrAtCurrent: finitePositive(pick?.rrAtCurrentPrice ?? pick?.executionFeasibilityAtCurrentRr),
        entryDistancePct: Number.isFinite(Number(pick?.entryDistancePct)) ? Number(pick.entryDistancePct) : null,
        geometryValid
      };
      const decisionSnapshotSha256 = crypto.createHash('sha256')
        .update(JSON.stringify(decisionSnapshot))
        .digest('hex');
      seeds.push({
        ledgerId: crypto.createHash('sha256').update(`${stage6Hash}|${symbol}`).digest('hex').slice(0, 24),
        stage6File: path.basename(filePath),
        stage6Hash,
        sourceRunId: payload?.manifest?.sourceRunId || null,
        sourceSha: payload?.manifest?.sourceSha || null,
        symbol,
        generatedAt,
        signalDate,
        signalMarketPhase: signalMarket.phase,
        signalMarketMinutes: signalMarket.minutes,
        side: 'LONG',
        decisionCohort,
        primaryBlocker: blocker,
        falseNegativeEligible: decisionCohort === COHORTS.blocked && geometryValid,
        sourceLineageValid,
        decisionSnapshot,
        decisionSnapshotSha256,
        modelRank: pick?.modelRank ?? null,
        executionRank: pick?.executionRank ?? null,
        finalDecision,
        decisionReason: decisionReason || null,
        marketRegime,
        marketRegimeLineageStatus: marketRegimeEvidence.status,
        marketRegimeLineageVerifiedForComparison: marketRegimeEvidence.verified,
        decisionHistoryEvidence: {
          priceHistoryBars: Array.isArray(pick?.priceHistory) ? pick.priceHistory.length : 0,
          storageSource: pick?.dataSource || null,
          corporateActionLineagePresent: pick?.corporateActionLineage?.lineageStatus === 'PRESENT',
          historyCoverageStatus: pick?.corporateActionLineage?.historyCoverageStatus || null,
          sourceSymbol: normalized(pick?.corporateActionLineage?.sourceSymbol) || null,
          symbolChangeReference: normalized(pick?.previousSymbol ?? pick?.priorSymbol) || null
        },
        entryPrice,
        currentPrice: decisionSnapshot.currentPrice,
        targetPrice,
        stopPrice,
        geometryValid
      });
    }
  }
  const deduped = new Map(seeds.map((row) => [row.ledgerId, row]));
  return {
    seeds: [...deduped.values()],
    rejected,
    sourceFiles,
    duplicateSeedRows: seeds.length - deduped.size,
    deduplicatedSurfaceRows
  };
}

function readPriceHistory() {
  const bySymbol = new Map();
  const sourceFiles = [];
  let latestStage4Manifest = null;
  let latestStage4Timestamp = '';
  for (const filePath of jsonFiles(stage4Dir, 'STAGE4_TECHNICAL_FULL_')) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const manifestTimestamp = isoTimestamp(payload?.manifest?.timestamp) || path.basename(filePath);
    if (manifestTimestamp >= latestStage4Timestamp) {
      latestStage4Timestamp = manifestTimestamp;
      latestStage4Manifest = payload?.manifest || null;
    }
    const rows = Array.isArray(payload?.technical_universe) ? payload.technical_universe : [];
    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      if (!symbol || !Array.isArray(row?.priceHistory)) continue;
      const record = bySymbol.get(symbol) || { bars: new Map(), sourceFiles: new Set(), lineage: null };
      for (const bar of row.priceHistory) {
        const date = String(bar?.date || '').slice(0, 10);
        const open = finitePositive(bar?.open);
        const high = finitePositive(bar?.high);
        const low = finitePositive(bar?.low);
        const close = finitePositive(bar?.close);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !open || !high || !low || !close || low > high) continue;
        record.bars.set(date, { date, open, high, low, close });
      }
      record.sourceFiles.add(path.basename(filePath));
      const rawLineage = row?.corporateActionLineage && typeof row.corporateActionLineage === 'object'
        ? row.corporateActionLineage
        : row?.ohlcvLineage && typeof row.ohlcvLineage === 'object'
          ? row.ohlcvLineage
          : null;
      const retrievedAt = isoTimestamp(
        rawLineage?.retrievedAt
        ?? row?.updated
        ?? row?.lastUpdate
        ?? row?.quoteTimestamp
        ?? payload?.manifest?.timestamp
      );
      const lineageEvaluatedAt = [
        rawLineage?.lineageEvaluatedAt,
        rawLineage?.symbolChangeEvidence?.retrievedAt,
        rawLineage?.delistingEvidence?.retrievedAt,
        rawLineage?.suspensionEvidence?.retrievedAt,
        retrievedAt
      ]
        .map(isoTimestamp)
        .filter(Boolean)
        .sort()
        .at(-1) || null;
      const externalEvidenceSha256 = rawLineage
        ? crypto.createHash('sha256').update(canonicalJson({
          symbolChangeEvidence: rawLineage.symbolChangeEvidence || null,
          delistingEvidence: rawLineage.delistingEvidence || null,
          suspensionEvidence: rawLineage.suspensionEvidence || null
        })).digest('hex')
        : null;
      if (
        !record.lineage
        || String(lineageEvaluatedAt || retrievedAt || '')
          >= String(record.lineage.lineageEvaluatedAt || record.lineage.retrievedAt || '')
      ) {
        const lineage = {
          schemaVersion: rawLineage?.schemaVersion || null,
          status: 'PRESENT',
          lineageContractStatus: rawLineage?.lineageStatus || (rawLineage ? 'PRESENT' : 'LEGACY_ROW_WITHOUT_CORPORATE_ACTION_LINEAGE'),
          stage4File: path.basename(filePath),
          sourceStage3File: payload?.manifest?.sourceStage3File || null,
          storageSource: row?.dataSource || null,
          stage4Symbol: symbol,
          lineageSymbol: normalized(rawLineage?.symbol),
          sourceSymbol: normalized(rawLineage?.sourceSymbol),
          lineageKeyMatchesStage4Symbol: Boolean(rawLineage?.symbol) && normalized(rawLineage.symbol) === symbol,
          vendor: rawLineage?.vendor || row?.quoteSource || row?.source || null,
          retrievedAt,
          lineageEvaluatedAt,
          externalEvidenceSha256,
          sourceAsOf: isoTimestamp(rawLineage?.sourceAsOf),
          eventEffectiveAt: isoTimestamp(rawLineage?.eventEffectiveAt),
          marketTimezone: rawLineage?.marketTimezone || payload?.manifest?.marketTimezone || null,
          adjustmentType: rawLineage?.adjustmentType ?? row?.adjustmentType ?? row?.adjustment_type ?? null,
          splitAdjustmentStatus: rawLineage?.splitAdjustmentStatus ?? row?.splitAdjustmentStatus ?? 'UNVERIFIED_SPLIT_ADJUSTMENT_LINEAGE',
          dividendAdjustmentStatus: rawLineage?.dividendAdjustmentStatus ?? row?.dividendAdjustmentStatus ?? 'UNVERIFIED_DIVIDEND_ADJUSTMENT_LINEAGE',
          sourceFreshnessStatus: rawLineage?.sourceFreshnessStatus || 'UNVERIFIED_SOURCE_FRESHNESS',
          historyCoverageStatus: rawLineage?.historyCoverageStatus || 'UNVERIFIED_HISTORY_COVERAGE',
          missingSessions: Array.isArray(rawLineage?.missingSessions)
            ? rawLineage.missingSessions
            : Array.isArray(row?.missingSessions)
              ? row.missingSessions
              : null,
          corporateActionStatus: rawLineage?.corporateActionStatus ?? row?.corporateActionStatus ?? 'UNVERIFIED_CORPORATE_ACTION_LINEAGE',
          symbolChangeStatus: rawLineage?.symbolChangeStatus ?? row?.symbolChangeStatus ?? 'UNVERIFIED_SYMBOL_CHANGE_LINEAGE',
          delistingStatus: rawLineage?.delistingStatus ?? row?.delistingStatus ?? 'UNVERIFIED_DELISTING_LINEAGE',
          suspensionStatus: rawLineage?.suspensionStatus ?? row?.suspensionStatus ?? 'UNVERIFIED_SUSPENSION_LINEAGE',
          symbolChangeEvidence: rawLineage?.symbolChangeEvidence || null,
          delistingEvidence: rawLineage?.delistingEvidence || null,
          suspensionEvidence: rawLineage?.suspensionEvidence || null,
          prospectiveSurveillance: normalizeProspectiveSurveillance(
            rawLineage?.prospectiveSurveillance,
            symbol
          ),
          splitEvents: Array.isArray(rawLineage?.splitEvents) ? rawLineage.splitEvents : [],
          dividendEvents: Array.isArray(rawLineage?.dividendEvents) ? rawLineage.dividendEvents : [],
          survivorshipBiasStatus: rawLineage?.survivorshipBiasStatus ?? row?.survivorshipBiasStatus ?? 'UNVERIFIED_CORPORATE_ACTION_LINEAGE',
          returnBasis: rawLineage?.returnBasis ?? row?.returnBasis ?? row?.totalReturnBasis ?? 'PRICE_RETURN_NOT_TOTAL_RETURN',
          lineageVerifiedByProducer: rawLineage?.lineageVerifiedForComparison === true,
          producerLookbackStart: rawLineage?.lookbackStart || null,
          producerLookbackEnd: rawLineage?.lookbackEnd || null,
          producerObservationCount: Number.isFinite(Number(rawLineage?.observationCount))
            ? Number(rawLineage.observationCount)
            : null
        };
        const eligibility = evaluateHistoryLineage(lineage);
        record.lineage = {
          ...lineage,
          comparisonEligibilityStatus: eligibility.status,
          comparisonExclusionReasons: eligibility.reasons
        };
      }
      bySymbol.set(symbol, record);
    }
  }
  const normalizedHistory = new Map();
  for (const [symbol, record] of bySymbol) {
    const bars = [...record.bars.values()].sort((a, b) => a.date.localeCompare(b.date));
    const historyRecord = {
      bars,
      lineage: {
        ...record.lineage,
        sourceFiles: [...record.sourceFiles].sort(),
        lookbackStart: bars[0]?.date || null,
        lookbackEnd: bars.at(-1)?.date || null,
        observationCount: bars.length
      }
    };
    normalizedHistory.set(symbol, historyRecord);
    if (record.lineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON'
      && record.lineage?.symbolChangeStatus === 'VERIFIED_SYMBOL_CHANGE') {
      for (const alias of [record.lineage.lineageSymbol, record.lineage.sourceSymbol].map(normalized).filter(Boolean)) {
        const existing = normalizedHistory.get(alias);
        if (!existing || existing === historyRecord) normalizedHistory.set(alias, historyRecord);
      }
    }
  }
  return {
    sourceFiles,
    bySymbol: normalizedHistory,
    utilization: {
      schemaVersion: 'drive-stage4-stage7-utilization-v1',
      sourceStage4FileCount: sourceFiles.length,
      latestStage4Timestamp: isoTimestamp(latestStage4Manifest?.timestamp),
      totalDriveOhlcvFiles: latestStage4Manifest?.driveOhlcvUtilization?.totalDriveOhlcvFiles ?? null,
      lineageEnvelopeFiles: latestStage4Manifest?.driveOhlcvUtilization?.lineageEnvelopeFiles ?? null,
      legacyArrayFiles: latestStage4Manifest?.driveOhlcvUtilization?.legacyArrayFiles ?? null,
      freshFiles: latestStage4Manifest?.driveOhlcvUtilization?.freshFiles ?? null,
      staleFiles: latestStage4Manifest?.driveOhlcvUtilization?.staleFiles ?? null,
      fullHistoryFiles: latestStage4Manifest?.driveOhlcvUtilization?.fullHistoryFiles ?? null,
      partialHistoryFiles: latestStage4Manifest?.driveOhlcvUtilization?.partialHistoryFiles ?? null,
      invalidFiles: latestStage4Manifest?.driveOhlcvUtilization?.invalidFiles ?? null,
      Stage4ConsumedRows: latestStage4Manifest?.driveOhlcvUtilization?.Stage4ConsumedRows
        ?? latestStage4Manifest?.count
        ?? null,
      Stage4PriceHistoryRows: bySymbol.size,
      Stage4CorporateLineageRows: [...bySymbol.values()].filter(
        (record) => record.lineage?.lineageContractStatus === 'PRESENT'
      ).length,
      DriveToStage4LossRows: latestStage4Manifest?.driveOhlcvUtilization?.DriveToStage4LossRows ?? null,
      classificationScope: latestStage4Manifest?.driveOhlcvUtilization?.classificationScope
        || 'RUNTIME_STAGE4_AUDIT_SOURCE_ONLY'
    }
  };
}

function resolveSeed(seed, historyRecord) {
  const allBars = historyRecord?.bars;
  const historyLineage = historyRecord?.lineage || {
    schemaVersion: null,
    status: 'MISSING_SOURCE_HISTORY',
    lineageContractStatus: 'MISSING_SOURCE_HISTORY',
    stage4File: null,
    sourceFiles: [],
    storageSource: null,
    vendor: null,
    retrievedAt: null,
    sourceAsOf: null,
    adjustmentType: null,
    splitAdjustmentStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    dividendAdjustmentStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    marketTimezone: 'America/New_York',
    missingSessions: null,
    sourceFreshnessStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    historyCoverageStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    corporateActionStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    symbolChangeStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    delistingStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    suspensionStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    survivorshipBiasStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    returnBasis: 'PRICE_RETURN_NOT_TOTAL_RETURN',
    lineageVerifiedByProducer: false,
    lineageKeyMatchesStage4Symbol: false,
    comparisonEligibilityStatus: 'UNVERIFIED_FOR_COMPARISON',
    comparisonExclusionReasons: ['source_history_missing'],
    lookbackStart: null,
    lookbackEnd: null,
    observationCount: 0
  };
  const initialBase = {
    ...seed,
    historyLineage,
    biasAudit: {
      lookAheadViolation: false,
      survivorshipBiasViolation: false,
      survivorshipBiasStatus: historyLineage?.survivorshipBiasStatus || 'UNVERIFIED_NO_SOURCE_HISTORY'
    }
  };
  if (!seed.sourceLineageValid) {
    return {
      ...initialBase,
      outcomeLabel: 'EXCLUDED_SOURCE_LINEAGE_INVALID',
      outcomeStatus: 'excluded_source_lineage_invalid',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  if (!seed.geometryValid) {
    return {
      ...initialBase,
      outcomeLabel: 'EXCLUDED_INVALID_GEOMETRY',
      outcomeStatus: 'excluded_invalid_geometry',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  if (!Array.isArray(allBars) || allBars.length === 0) {
    return {
      ...initialBase,
      outcomeLabel: 'PENDING_SOURCE_HISTORY',
      outcomeStatus: 'pending_source_history',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  const signalDateBarAllowed = seed.signalMarketPhase === 'PRE_RTH';
  const eligible = allBars.filter((bar) => bar.date > seed.signalDate || (signalDateBarAllowed && bar.date === seed.signalDate));
  const historicalVerified = historyLineage.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON';
  const prospective = seed.decisionSnapshot?.prospectiveSurveillance
    ? evaluateProspectiveComparison(seed, historyRecord, eligible)
    : null;
  const comparisonEvidenceMode = historicalVerified
    ? COMPARISON_EVIDENCE_MODES.historical
    : prospective?.mode || null;
  const comparisonEvidenceStatus = historicalVerified
    ? 'VERIFIED_FOR_COMPARISON'
    : prospective?.status || 'UNVERIFIED_FOR_COMPARISON';
  const evaluatedLineage = {
    ...historyLineage,
    comparisonEvidenceMode,
    comparisonEvidenceStatus,
    comparisonEvidenceReasons: historicalVerified ? [] : prospective?.reasons || [],
    ...(prospective ? { prospectiveComparisonEvidence: prospective } : {}),
    comparisonEligibilityStatus: historicalVerified || prospective?.verifiedForComparison
      ? 'VERIFIED_FOR_COMPARISON'
      : comparisonEvidenceStatus
  };
  const base = {
    ...initialBase,
    historyLineage: evaluatedLineage,
    comparisonEvidenceMode,
    comparisonEvidenceStatus
  };
  if (!historicalVerified && prospective?.resolutionAllowed !== true) {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED',
      outcomeStatus: 'excluded_corporate_action_lineage_unverified',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  const postDecisionAdjustmentEvents = [
    ...(Array.isArray(historyLineage.splitEvents) ? historyLineage.splitEvents : []),
    ...(Array.isArray(historyLineage.dividendEvents) ? historyLineage.dividendEvents : [])
  ].filter((event) => {
    const eventDate = String(event?.eventEffectiveAt || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && eventDate > seed.signalDate;
  });
  if (postDecisionAdjustmentEvents.length) {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_CORPORATE_ACTION_REBASE_REQUIRED',
      outcomeStatus: 'excluded_corporate_action_rebase_required',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null,
      postDecisionAdjustmentEvents
    };
  }
  base.biasAudit.lookAheadViolation = eligible.some((bar) => bar.date < seed.signalDate || (!signalDateBarAllowed && bar.date === seed.signalDate));
  const preSignalBarsExcluded = allBars.length - eligible.length;
  const bars = eligible.slice(0, horizonBars);
  if (!bars.length) {
    return { ...base, outcomeLabel: 'PENDING_MARKET_DATA', outcomeStatus: 'pending', observedBars: 0, preSignalBarsExcluded };
  }
  if (!historicalVerified && prospective?.horizonMatured !== true) {
    return {
      ...base,
      outcomeLabel: 'PENDING_MARKET_DATA',
      outcomeStatus: 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded
    };
  }

  let fillIndex = -1;
  let exitIndex = -1;
  let outcomeLabel = null;
  let exitPrice = null;
  let ambiguityReason = null;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (fillIndex < 0) {
      if (bar.low > seed.entryPrice) continue;
      fillIndex = index;
      const targetTouched = bar.high >= seed.targetPrice;
      const stopTouched = bar.low <= seed.stopPrice;
      if (targetTouched || stopTouched) {
        outcomeLabel = 'AMBIGUOUS_INTRABAR';
        ambiguityReason = 'entry_and_exit_threshold_touched_same_daily_bar';
        exitIndex = index;
        break;
      }
      continue;
    }

    const targetTouched = bar.high >= seed.targetPrice;
    const stopTouched = bar.low <= seed.stopPrice;
    if (targetTouched && stopTouched) {
      outcomeLabel = 'AMBIGUOUS_INTRABAR';
      ambiguityReason = 'target_and_stop_touched_same_daily_bar';
      exitIndex = index;
      break;
    }
    if (targetTouched) {
      outcomeLabel = 'TP_FIRST';
      exitPrice = seed.targetPrice;
      exitIndex = index;
      break;
    }
    if (stopTouched) {
      outcomeLabel = 'SL_FIRST';
      exitPrice = seed.stopPrice;
      exitIndex = index;
      break;
    }
  }

  if (fillIndex < 0) {
    return {
      ...base,
      outcomeLabel: bars.length >= horizonBars ? 'NO_FILL' : 'PENDING_MARKET_DATA',
      outcomeStatus: bars.length >= horizonBars ? 'resolved' : 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: null,
      resolvedAt: bars.length >= horizonBars ? bars.at(-1).date : null
    };
  }

  if (!outcomeLabel && bars.length >= horizonBars) {
    outcomeLabel = 'TIMEOUT';
    exitIndex = bars.length - 1;
    exitPrice = bars[exitIndex].close;
  }
  if (!outcomeLabel) {
    return {
      ...base,
      outcomeLabel: 'PENDING_MARKET_DATA',
      outcomeStatus: 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: bars[fillIndex].date
    };
  }

  const observed = bars.slice(fillIndex, exitIndex + 1);
  const maxHigh = Math.max(...observed.map((bar) => bar.high));
  const minLow = Math.min(...observed.map((bar) => bar.low));
  const riskPerShare = seed.entryPrice - seed.stopPrice;
  const realizedR = exitPrice == null ? null : (exitPrice - seed.entryPrice) / riskPerShare;
  return {
    ...base,
    outcomeLabel,
    outcomeStatus: outcomeLabel === 'AMBIGUOUS_INTRABAR' ? 'excluded_ambiguous' : 'resolved',
    ambiguityReason,
    observedBars: bars.length,
    preSignalBarsExcluded,
    fillDate: bars[fillIndex].date,
    fillBasis: 'daily_bar_low_touched_limit_assumed_at_limit',
    resolvedAt: bars[exitIndex].date,
    exitPrice: exitPrice == null ? null : round(exitPrice),
    holdingBars: exitIndex - fillIndex + 1,
    mfePct: round(((maxHigh / seed.entryPrice) - 1) * 100),
    maePct: round(((minLow / seed.entryPrice) - 1) * 100),
    realizedR: realizedR == null ? null : round(realizedR)
  };
}

function buildProcessOutcomeReview(row) {
  const modeledOutcomeScore = row.realizedR != null && Number.isFinite(Number(row.realizedR))
    ? round(Number(row.realizedR))
    : null;
  return {
    schemaVersion: 'stage7-process-outcome-review-v1',
    processReviewStatus: 'PENDING_TERMINAL_EVIDENCE',
    evidenceBasis: 'BROKER_VERIFIED_TERMINAL_PAPER_LIFECYCLE_REQUIRED',
    terminalPaperLifecycleEvidencePresent: false,
    planAdherence: null,
    thesisOutcome: null,
    invalidationObserved: null,
    entryRuleAdherence: null,
    exitRuleAdherence: null,
    regimeContribution: null,
    processScore: null,
    outcomeScore: modeledOutcomeScore,
    outcomeScoreBasis: modeledOutcomeScore == null
      ? 'NO_RESOLVED_FINANCIAL_OUTCOME'
      : 'MODELED_OOS_REALIZED_R_NOT_BROKER_PNL',
    nextRuleOrLesson: null,
    automaticPolicyChangeAuthorized: false
  };
}

function outcomeWindowEvidenceAudit(row) {
  const lineage = row.historyLineage || {};
  const evidenceTypes = [
    ['symbol_change', lineage.symbolChangeEvidence, new Set([
      'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE',
      'VERIFIED_SYMBOL_CHANGE'
    ])],
    ['delisting', lineage.delistingEvidence, new Set(['VERIFIED_NOT_DELISTED_AS_OF_SOURCE'])],
    ['suspension', lineage.suspensionEvidence, new Set(['VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE'])]
  ];
  const shared = {
    lineageSymbol: lineage.lineageSymbol,
    sourceSymbol: lineage.sourceSymbol,
    historySourceAsOf: lineage.sourceAsOf,
    lineageEvaluatedAt: lineage.lineageEvaluatedAt
  };
  const validity = Object.fromEntries(evidenceTypes.map(([type, evidence, statuses]) => [type, {
    fullLookback: evidenceContractValid(evidence, statuses, {
      ...shared,
      historyLookbackStart: lineage.producerLookbackStart
    }),
    outcomeWindow: evidenceContractValid(evidence, statuses, {
      ...shared,
      historyLookbackStart: row.signalDate
    })
  }]));
  const fullLookbackOverbroadEvidenceTypes = evidenceTypes
    .filter(([type]) => validity[type].outcomeWindow && !validity[type].fullLookback)
    .map(([type]) => type);
  const externalSourceBlockedTypes = evidenceTypes
    .filter(([type]) => !validity[type].outcomeWindow)
    .map(([type]) => type);
  const eventOutcomeHandlingRequired = [];
  if (lineage.delistingStatus === 'VERIFIED_DELISTED') {
    eventOutcomeHandlingRequired.push('delisting');
  }
  if (lineage.suspensionStatus === 'VERIFIED_SUSPENDED') {
    eventOutcomeHandlingRequired.push('suspension');
  }
  const boundedOutcomeEvidenceComplete = evidenceTypes.every(([type]) => validity[type].outcomeWindow);
  const contractAuditVerdict = eventOutcomeHandlingRequired.length
    ? 'OUTCOME_RESOLUTION_DEFECT'
    : externalSourceBlockedTypes.length && fullLookbackOverbroadEvidenceTypes.length
      ? 'MULTIPLE_INDEPENDENT_BLOCKERS'
      : externalSourceBlockedTypes.length
        ? 'CONTRACT_CORRECT_EXTERNAL_SOURCE_REQUIRED'
        : fullLookbackOverbroadEvidenceTypes.length
          ? 'CONTRACT_OVERBROAD_WINDOW'
          : 'CURRENT_CONTRACT_VALID';
  return {
    requiredCoverageStart: row.signalDate,
    requiredCoverageEnd: String(lineage.sourceAsOf || '').slice(0, 10) || null,
    producerLookbackStart: lineage.producerLookbackStart || null,
    evidenceValidity: validity,
    boundedOutcomeEvidenceComplete,
    fullLookbackOverbroadEvidenceTypes,
    externalSourceBlockedTypes,
    eventOutcomeHandlingRequired,
    contractAuditVerdict
  };
}

function stage4Stage7HistoryLossReason(row) {
  if (row.historyLineage?.status === 'PRESENT') return null;
  const evidence = row.decisionHistoryEvidence || {};
  if (evidence.symbolChangeReference) return 'STAGE7_SYMBOL_OR_ALIAS_MISMATCH';
  if (evidence.historyCoverageStatus === 'UNVERIFIED_PARTIAL_HISTORY') return 'DRIVE_OHLCV_PARTIAL';
  if (evidence.priceHistoryBars > 0) return 'RETRYABLE_FUTURE_HISTORY_REQUIRED';
  if (evidence.storageSource && normalized(evidence.storageSource) !== 'DRIVE') return 'DRIVE_OHLCV_MISSING';
  if (evidence.corporateActionLineagePresent) return 'STAGE4_HISTORY_NOT_PROPAGATED';
  return 'STAGE4_HISTORY_NOT_PROPAGATED';
}

function accumulationLifecycle(row, historyRecord) {
  const allBars = Array.isArray(historyRecord?.bars) ? historyRecord.bars : [];
  const signalDateBarAllowed = row.signalMarketPhase === 'PRE_RTH';
  const eligibleBars = allBars.filter(
    (bar) => bar.date > row.signalDate || (signalDateBarAllowed && bar.date === row.signalDate)
  );
  const historyLineage = row.historyLineage || {};
  const exclusionReasons = Array.isArray(historyLineage.comparisonExclusionReasons)
    ? historyLineage.comparisonExclusionReasons
    : [];
  const legacy = historyLineage.lineageContractStatus === 'LEGACY_ROW_WITHOUT_CORPORATE_ACTION_LINEAGE'
    || historyLineage.schemaVersion == null;
  const outcomeWindowAudit = outcomeWindowEvidenceAudit(row);
  const sourceContractReason = [
    'symbol_change_status_unverified',
    'delisting_status_unverified_or_delisted',
    'suspension_status_unverified_or_suspended',
    'survivorship_lineage_unverified',
    'producer_comparison_contract_not_verified',
    'symbol_change_evidence_invalid',
    'delisting_evidence_invalid',
    'suspension_evidence_invalid'
  ].find((reason) => exclusionReasons.includes(reason)) || null;

  let classification = ACCUMULATION_CLASSES.invalidLineage;
  let blockedReason = row.outcomeLabel || 'unclassified_outcome_contract';
  let nextNaturalRunCanTransition = false;
  let nextEvaluationCondition = 'after_accumulation_contract_review';
  let pipelineRootCause = PIPELINE_ROOT_CAUSES.outcomeResolution;

  if (row.outcomeStatus === 'resolved' && ['TP_FIRST', 'SL_FIRST', 'TIMEOUT'].includes(row.outcomeLabel)) {
    classification = ACCUMULATION_CLASSES.comparableResolved;
    blockedReason = null;
    nextEvaluationCondition = 'none_terminal_comparable_outcome';
    pipelineRootCause = row.marketRegimeLineageVerifiedForComparison === true
      ? PIPELINE_ROOT_CAUSES.comparableResolved
      : PIPELINE_ROOT_CAUSES.marketRegime;
  } else if (row.outcomeStatus === 'resolved' && row.outcomeLabel === 'NO_FILL') {
    classification = ACCUMULATION_CLASSES.resolvedNonReturn;
    blockedReason = 'resolved_no_fill_has_no_return_comparison';
    nextEvaluationCondition = 'none_terminal_non_return_outcome';
    pipelineRootCause = PIPELINE_ROOT_CAUSES.resolvedNonReturn;
  } else if (row.outcomeStatus === 'pending_source_history') {
    classification = ACCUMULATION_CLASSES.pendingHistory;
    blockedReason = 'source_history_missing';
    nextNaturalRunCanTransition = true;
    nextEvaluationCondition = 'after_matching_stage4_history_is_recollected';
    pipelineRootCause = PIPELINE_ROOT_CAUSES.historyRetryable;
  } else if (String(row.outcomeStatus).startsWith('pending')) {
    classification = ACCUMULATION_CLASSES.pendingHorizon;
    blockedReason = 'horizon_market_sessions_remaining';
    nextNaturalRunCanTransition = true;
    nextEvaluationCondition = `after_${Math.max(1, horizonBars - eligibleBars.length)}_additional_eligible_market_sessions`;
    pipelineRootCause = PIPELINE_ROOT_CAUSES.horizon;
  } else if (row.outcomeStatus === 'excluded_corporate_action_lineage_unverified' && legacy) {
    classification = ACCUMULATION_CLASSES.legacyImmutable;
    blockedReason = 'legacy_row_without_corporate_action_contract';
    nextEvaluationCondition = 'no_automatic_relabel_new_decision_seed_required';
    pipelineRootCause = PIPELINE_ROOT_CAUSES.sourceContract;
  } else if (row.outcomeStatus === 'excluded_corporate_action_lineage_unverified' && sourceContractReason) {
    classification = ACCUMULATION_CLASSES.sourceContractBlocked;
    blockedReason = sourceContractReason;
    nextEvaluationCondition = 'after_external_corporate_action_source_contract_verified';
    pipelineRootCause = outcomeWindowAudit.eventOutcomeHandlingRequired.length
      ? PIPELINE_ROOT_CAUSES.outcomeResolution
      : outcomeWindowAudit.boundedOutcomeEvidenceComplete
        && outcomeWindowAudit.fullLookbackOverbroadEvidenceTypes.length
        ? PIPELINE_ROOT_CAUSES.consumerOverbroad
        : PIPELINE_ROOT_CAUSES.sourceContract;
  } else if (row.outcomeStatus === 'excluded_corporate_action_lineage_unverified') {
    classification = ACCUMULATION_CLASSES.corporateActionUnverified;
    blockedReason = exclusionReasons[0] || 'corporate_action_lineage_unverified';
    nextNaturalRunCanTransition = true;
    nextEvaluationCondition = 'after_fresh_verified_history_lineage_is_recollected';
    pipelineRootCause = PIPELINE_ROOT_CAUSES.sourceContract;
  }
  if (!row.sourceLineageValid || !row.geometryValid) pipelineRootCause = PIPELINE_ROOT_CAUSES.decisionLineage;

  const remainingMarketSessions = classification === ACCUMULATION_CLASSES.pendingHorizon
    ? Math.max(0, horizonBars - eligibleBars.length)
    : classification === ACCUMULATION_CLASSES.pendingHistory
      ? horizonBars
      : 0;
  return {
    classification,
    transitionPossible: nextNaturalRunCanTransition,
    nextNaturalRunCanTransition,
    blockedReason,
    requiredMarketSessions: horizonBars,
    observedMarketSessions: Math.min(eligibleBars.length, horizonBars),
    remainingMarketSessions,
    historyLatestSession: allBars.at(-1)?.date || null,
    missingSessions: Array.isArray(historyLineage.missingSessions) ? historyLineage.missingSessions : [],
    stage4Stage7HistoryLossReason: stage4Stage7HistoryLossReason(row),
    earliestPendingMaturityAt: null,
    nextEvaluationCondition,
    pipelineRootCause,
    counterfactualHorizon: {
      status: eligibleBars.length >= horizonBars
        ? 'HORIZON_MATURED'
        : eligibleBars.length
          ? 'HORIZON_NOT_MATURED'
          : 'NO_POST_DECISION_BARS',
      observedMarketSessions: eligibleBars.length,
      requiredMarketSessions: horizonBars,
      remainingMarketSessions: Math.max(0, horizonBars - eligibleBars.length)
    },
    outcomeWindowEvidenceAudit: outcomeWindowAudit
  };
}

function buildAccumulationLiveness(rows, oosRows, summary) {
  const lifecycleCounts = Object.fromEntries(
    Object.values(ACCUMULATION_CLASSES).map((classification) => [
      classification,
      rows.filter((row) => row.accumulationLifecycle?.classification === classification).length
    ])
  );
  const comparableRows = oosRows.filter((row) => row.lineageVerifiedForComparison === true);
  const executableRows = comparableRows.filter((row) => row.decisionCohort === COHORTS.executable);
  const actionableBlockedRows = comparableRows.filter(
    (row) => row.decisionCohort === COHORTS.blocked && row.falseNegativeEligible === true
  );
  const comparableRegimes = [...new Set(comparableRows
    .filter((row) => row.marketRegimeLineageVerifiedForComparison === true)
    .map((row) => row.marketRegime))]
    .filter((marketRegime) => executableRows.some(
      (row) => row.marketRegimeLineageVerifiedForComparison === true && row.marketRegime === marketRegime
    ) && actionableBlockedRows.some(
      (row) => row.marketRegimeLineageVerifiedForComparison === true && row.marketRegime === marketRegime
    ))
    .sort();
  const pendingRows = rows.filter(
    (row) => row.accumulationLifecycle?.classification === ACCUMULATION_CLASSES.pendingHorizon
  );
  const rootCauseCounts = Object.fromEntries(
    Object.values(PIPELINE_ROOT_CAUSES).map((rootCause) => [
      rootCause,
      rows.filter((row) => row.accumulationLifecycle?.pipelineRootCause === rootCause).length
    ])
  );
  rootCauseCounts[PIPELINE_ROOT_CAUSES.seed] = summary.duplicateSeedRows;
  const unknownRootCauseRows = rows.filter(
    (row) => !Object.values(PIPELINE_ROOT_CAUSES).includes(row.accumulationLifecycle?.pipelineRootCause)
  ).length;
  const overbroadContractSuspectRows = rows.filter(
    (row) => row.accumulationLifecycle?.outcomeWindowEvidenceAudit?.fullLookbackOverbroadEvidenceTypes?.length
  ).length;
  const sourceContractBlockedRows = rootCauseCounts[PIPELINE_ROOT_CAUSES.sourceContract];
  const outcomeResolutionDefectRows = rootCauseCounts[PIPELINE_ROOT_CAUSES.outcomeResolution];
  const contractAuditVerdict = sourceContractBlockedRows > 0 && overbroadContractSuspectRows > 0
    ? 'MULTIPLE_INDEPENDENT_BLOCKERS'
    : sourceContractBlockedRows > 0
      ? 'CONTRACT_CORRECT_EXTERNAL_SOURCE_REQUIRED'
      : overbroadContractSuspectRows > 0
        ? 'CONTRACT_OVERBROAD_WINDOW'
        : outcomeResolutionDefectRows > 0
          ? 'OUTCOME_RESOLUTION_DEFECT'
          : 'ACCUMULATION_PATH_VERIFIED';
  const accumulationSummary = {
    totalSeedRows: rows.length,
    resolvedRows: summary.resolvedRows,
    pendingHorizonRows: lifecycleCounts[ACCUMULATION_CLASSES.pendingHorizon],
    retryableHistoryRows: lifecycleCounts[ACCUMULATION_CLASSES.pendingHistory],
    comparisonEligibleRows: lifecycleCounts[ACCUMULATION_CLASSES.comparableResolved],
    nonComparableResolvedRows: lifecycleCounts[ACCUMULATION_CLASSES.resolvedNonReturn],
    permanentlyExcludedLegacyRows: lifecycleCounts[ACCUMULATION_CLASSES.legacyImmutable],
    sourceContractBlockedRows: lifecycleCounts[ACCUMULATION_CLASSES.sourceContractBlocked],
    corporateActionRecollectionRows: lifecycleCounts[ACCUMULATION_CLASSES.corporateActionUnverified],
    invalidLineageRows: lifecycleCounts[ACCUMULATION_CLASSES.invalidLineage],
    duplicateSeedRows: summary.duplicateSeedRows,
    unknownOrUnclassifiedRows: rows.filter(
      (row) => !Object.values(ACCUMULATION_CLASSES).includes(row.accumulationLifecycle?.classification)
    ).length,
    earliestPendingMaturityAt: null,
    minimumAdditionalMarketSessions: pendingRows.length
      ? Math.min(...pendingRows.map((row) => row.accumulationLifecycle.remainingMarketSessions))
      : null,
    lifecycleCounts
  };
  const invalidContract = accumulationSummary.duplicateSeedRows > 0
    || accumulationSummary.unknownOrUnclassifiedRows > 0
    || summary.unknownCohortRows > 0
    || summary.lookAheadViolationRows > 0
    || summary.survivorshipBiasViolationRows > 0;
  const status = invalidContract
    ? 'INVALID_ACCUMULATION_CONTRACT'
    : accumulationSummary.comparisonEligibleRows > 0
      ? 'PROGRESSING_NATURALLY'
      : accumulationSummary.pendingHorizonRows > 0
        ? 'WAITING_FOR_HORIZON_MATURITY'
        : accumulationSummary.sourceContractBlockedRows > 0
          ? 'ZERO_GROWTH_EXTERNAL_SOURCE_BLOCKED'
          : accumulationSummary.retryableHistoryRows > 0
            ? 'RETRYABLE_HISTORY_GAP'
            : 'INVALID_ACCUMULATION_CONTRACT';
  const primaryBlocker = status === 'ZERO_GROWTH_EXTERNAL_SOURCE_BLOCKED'
    ? 'external_corporate_action_source_contract'
    : status === 'WAITING_FOR_HORIZON_MATURITY'
      ? 'horizon_market_sessions_not_matured'
      : status === 'RETRYABLE_HISTORY_GAP'
        ? 'matching_stage4_history_missing'
        : status === 'INVALID_ACCUMULATION_CONTRACT'
          ? 'stage7_accumulation_contract_invalid'
          : null;
  const nextMeaningfulEvaluationCondition = status === 'ZERO_GROWTH_EXTERNAL_SOURCE_BLOCKED'
    ? 'after_external_corporate_action_source_contract_verified'
    : status === 'WAITING_FOR_HORIZON_MATURITY'
      ? `after_${accumulationSummary.minimumAdditionalMarketSessions}_additional_eligible_market_sessions`
      : status === 'RETRYABLE_HISTORY_GAP'
        ? 'after_matching_stage4_history_is_recollected'
        : status === 'INVALID_ACCUMULATION_CONTRACT'
          ? 'after_stage7_accumulation_contract_defect_is_resolved'
          : 'after_additional_verified_oos_rows_resolve';
  const progress = {
    executableComparable: {
      current: executableRows.length,
      required: minimumResolvedRowsPerCohort,
      remaining: Math.max(0, minimumResolvedRowsPerCohort - executableRows.length)
    },
    actionableBlockedComparable: {
      current: actionableBlockedRows.length,
      required: minimumResolvedRowsPerCohort,
      remaining: Math.max(0, minimumResolvedRowsPerCohort - actionableBlockedRows.length)
    },
    comparableRegimes: {
      current: comparableRegimes.length,
      required: requiredComparableRegimes,
      remaining: Math.max(0, requiredComparableRegimes - comparableRegimes.length),
      regimes: comparableRegimes
    }
  };
  const postActivationRows = rows.filter((row) => {
    const surveillance = row.decisionSnapshot?.prospectiveSurveillance;
    const activationAtMs = Date.parse(String(surveillance?.activationAt || ''));
    const decisionAtMs = Date.parse(String(row.generatedAt || ''));
    return surveillance?.schemaVersion === PROSPECTIVE_SCHEMA_VERSION
      && Number.isFinite(activationAtMs)
      && Number.isFinite(decisionAtMs)
      && decisionAtMs >= activationAtMs;
  });
  const prospectiveSourceCompleteRows = postActivationRows.filter((row) => [
    'VERIFIED_FOR_COMPARISON',
    'PROSPECTIVE_SOURCE_COMPLETE_HORIZON_PENDING'
  ].includes(row.historyLineage?.prospectiveComparisonEvidence?.status));
  const prospectiveComparisonEligibleRows = postActivationRows.filter(
    (row) => row.historyLineage?.comparisonEvidenceMode === COMPARISON_EVIDENCE_MODES.prospective
      && row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON'
  );
  const prospectiveHorizonMaturedRows = postActivationRows.filter(
    (row) => row.accumulationLifecycle?.counterfactualHorizon?.status === 'HORIZON_MATURED'
  );
  const prospectivePendingRows = prospectiveSourceCompleteRows.filter(
    (row) => row.historyLineage?.prospectiveComparisonEvidence?.status === 'PROSPECTIVE_SOURCE_COMPLETE_HORIZON_PENDING'
  );
  const prospectiveExecutableSeedRows = postActivationRows.filter(
    (row) => row.decisionCohort === COHORTS.executable
  ).length;
  const prospectiveActionableBlockedSeedRows = postActivationRows.filter(
    (row) => row.decisionCohort === COHORTS.blocked && row.falseNegativeEligible === true
  ).length;
  const prospectiveSourceGapRows = postActivationRows.length - prospectiveSourceCompleteRows.length;
  const prospectiveStatus = prospectiveComparisonEligibleRows.length > 0
    ? 'PROSPECTIVE_ACCUMULATION_PATH_VERIFIED'
    : prospectivePendingRows.length > 0
      ? 'WAITING_FOR_HORIZON_MATURITY'
      : postActivationRows.length > 0 && prospectiveExecutableSeedRows === 0 && prospectiveActionableBlockedSeedRows > 0
        ? 'STAGE6_EXECUTABLE_COHORT_LIVENESS_REVIEW_REQUIRED'
        : prospectiveSourceGapRows > 0
          ? 'FREE_SOURCE_PROSPECTIVE_COVERAGE_INCOMPLETE'
          : postActivationRows.length > 0
            ? 'RETRYABLE_HISTORY_GAP'
            : 'PROSPECTIVE_ACCUMULATION_PATH_VERIFIED';
  const prospective = {
    status: prospectiveStatus,
    prospectiveActivationAt: postActivationRows
      .map((row) => row.decisionSnapshot?.prospectiveSurveillance?.activationAt)
      .filter(Boolean)
      .sort()[0] || null,
    postActivationDecisionRows: postActivationRows.length,
    prospectiveExecutableSeedRows,
    prospectiveActionableBlockedSeedRows,
    prospectiveSourceCompleteRows: prospectiveSourceCompleteRows.length,
    prospectiveSourceGapRows,
    prospectiveHorizonMaturedRows: prospectiveHorizonMaturedRows.length,
    prospectiveComparisonEligibleRows: prospectiveComparisonEligibleRows.length,
    earliestProspectiveMaturityAt: null,
    minimumAdditionalMarketSessions: prospectivePendingRows.length
      ? Math.min(...prospectivePendingRows.map((row) => row.accumulationLifecycle?.remainingMarketSessions ?? horizonBars))
      : null,
    primaryAccumulationBlocker: prospectiveStatus === 'WAITING_FOR_HORIZON_MATURITY'
      ? 'prospective_horizon_market_sessions_not_matured'
      : prospectiveStatus === 'FREE_SOURCE_PROSPECTIVE_COVERAGE_INCOMPLETE'
        ? 'free_source_session_gap_or_identity_event'
        : prospectiveStatus === 'STAGE6_EXECUTABLE_COHORT_LIVENESS_REVIEW_REQUIRED'
          ? 'stage6_executable_seed_absent_in_compatible_trend_window'
          : null,
    nextMeaningfulEvaluationCondition: prospectiveStatus === 'WAITING_FOR_HORIZON_MATURITY'
      ? `after_${Math.max(1, Math.min(...prospectivePendingRows.map((row) => row.accumulationLifecycle?.remainingMarketSessions ?? horizonBars)))}_additional_eligible_market_sessions`
      : prospectiveStatus === 'FREE_SOURCE_PROSPECTIVE_COVERAGE_INCOMPLETE'
        ? 'after_complete_free_source_session_surveillance_is_recollected'
        : prospectiveStatus === 'STAGE6_EXECUTABLE_COHORT_LIVENESS_REVIEW_REQUIRED'
          ? 'after_report_only_stage6_false_negative_liveness_audit'
          : 'after_additional_natural_post_activation_decisions',
    progress,
    policyChangeAuthorized: false
  };
  return {
    status,
    primaryBlocker,
    nextMeaningfulEvaluationCondition,
    policyChangeAuthorized: false,
    summary: accumulationSummary,
    progress,
    prospective,
    rootCauseAudit: {
      contractAuditVerdict,
      rootCauseCounts,
      totalSeedRows: rows.length,
      validSeedRows: rows.filter((row) => row.sourceLineageValid && row.geometryValid).length,
      duplicateSeedRows: summary.duplicateSeedRows,
      retryableHistoryRows: rootCauseCounts[PIPELINE_ROOT_CAUSES.historyRetryable],
      pendingHorizonRows: rootCauseCounts[PIPELINE_ROOT_CAUSES.horizon],
      sourceContractBlockedRows,
      unknownRootCauseRows,
      overbroadContractSuspectRows,
      regimeBlockedRows: rootCauseCounts[PIPELINE_ROOT_CAUSES.marketRegime],
      outcomeResolutionDefectRows,
      comparisonEligibleRows: rootCauseCounts[PIPELINE_ROOT_CAUSES.comparableResolved],
      secondaryRegimeEvidenceBlockedRows: rows.filter(
        (row) => row.marketRegimeLineageVerifiedForComparison !== true
      ).length,
      counterfactualHorizonMaturedRows: rows.filter(
        (row) => row.accumulationLifecycle?.counterfactualHorizon?.status === 'HORIZON_MATURED'
      ).length,
      counterfactualHorizonPendingRows: rows.filter(
        (row) => row.accumulationLifecycle?.counterfactualHorizon?.status === 'HORIZON_NOT_MATURED'
      ).length,
      counterfactualNoPostDecisionBars: rows.filter(
        (row) => row.accumulationLifecycle?.counterfactualHorizon?.status === 'NO_POST_DECISION_BARS'
          && row.accumulationLifecycle?.pipelineRootCause !== PIPELINE_ROOT_CAUSES.historyRetryable
      ).length,
      counterfactualHistoryMissingRows: rootCauseCounts[PIPELINE_ROOT_CAUSES.historyRetryable],
      currentContractFutureGrowthPossible: rootCauseCounts[PIPELINE_ROOT_CAUSES.comparableResolved] > 0
        || rows.some((row) => row.accumulationLifecycle?.pipelineRootCause === PIPELINE_ROOT_CAUSES.horizon
          && row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON'),
      boundedOutcomeContractCouldGrowWithoutExternalSources: rows.some(
        (row) => row.accumulationLifecycle?.outcomeWindowEvidenceAudit?.boundedOutcomeEvidenceComplete === true
      )
    }
  };
}

const {
  seeds,
  rejected,
  sourceFiles: stage6Files,
  duplicateSeedRows,
  deduplicatedSurfaceRows
} = readStage6Seeds();
const history = readPriceHistory();
const rows = seeds
  .map((seed) => {
    const historyRecord = history.bySymbol.get(seed.symbol);
    const row = resolveSeed(seed, historyRecord);
    return {
      ...row,
      processOutcomeReview: buildProcessOutcomeReview(row),
      accumulationLifecycle: accumulationLifecycle(row, historyRecord)
    };
  })
  .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.symbol.localeCompare(b.symbol));
const stage4Stage7LossReasons = [
  'DRIVE_OHLCV_MISSING',
  'DRIVE_OHLCV_PARTIAL',
  'STAGE4_NOT_SELECTED',
  'STAGE4_HISTORY_NOT_PROPAGATED',
  'STAGE7_SYMBOL_OR_ALIAS_MISMATCH',
  'RETRYABLE_FUTURE_HISTORY_REQUIRED'
];
const historyLossRows = rows
  .filter((row) => row.historyLineage?.status !== 'PRESENT')
  .map((row) => ({
    ledgerId: row.ledgerId,
    symbol: row.symbol,
    reason: row.accumulationLifecycle?.stage4Stage7HistoryLossReason || 'UNCLASSIFIED'
  }));
const driveStage4Stage7Utilization = {
  ...history.utilization,
  Stage7HistoryCoverageRows: rows.length - historyLossRows.length,
  Stage7MissingHistoryRows: historyLossRows.length,
  Stage4ToStage7LossRows: historyLossRows.length,
  missingHistoryReasonCounts: Object.fromEntries(stage4Stage7LossReasons.map((reason) => [
    reason,
    historyLossRows.filter((row) => row.reason === reason).length
  ])),
  unknownOrUnclassifiedRows: historyLossRows.filter(
    (row) => !stage4Stage7LossReasons.includes(row.reason)
  ).length,
  rows: historyLossRows
};
const oosRows = rows
  .filter((row) => ['TP_FIRST', 'SL_FIRST', 'TIMEOUT'].includes(row.outcomeLabel))
  .map((row) => ({
    split: 'OOS',
    side: 'LONG',
    evaluationMode: row.decisionCohort === COHORTS.executable
      ? 'stage6_executable_policy'
      : row.decisionCohort === COHORTS.blocked
        ? 'stage6_actionable_blocked_counterfactual'
        : 'stage6_non_actionable_control',
    decisionCohort: row.decisionCohort,
    primaryBlocker: row.primaryBlocker,
    falseNegativeEligible: row.falseNegativeEligible,
    ledgerId: row.ledgerId,
    stage6Hash: row.stage6Hash,
    symbol: row.symbol,
    signalDate: row.signalDate,
    signalMarketPhase: row.signalMarketPhase,
    walkForwardCohort: row.signalDate.slice(0, 7),
    resolvedAt: row.resolvedAt,
    outcomeLabel: row.outcomeLabel,
    marketRegime: row.marketRegime || row.decisionSnapshot?.marketRegime || 'UNKNOWN',
    marketRegimeScore: row.decisionSnapshot?.marketRegimeLineage?.score ?? null,
    marketRegimeLineageSchemaVersion: row.decisionSnapshot?.marketRegimeLineage?.schemaVersion || null,
    marketRegimeLineageStatus: row.decisionSnapshot?.marketRegimeLineageStatus || null,
    marketRegimeLineageVerifiedForComparison: row.decisionSnapshot?.marketRegimeLineageVerifiedForComparison === true,
    marketRegimeSource: row.decisionSnapshot?.marketRegimeLineage?.source || null,
    marketRegimeSourceFile: row.decisionSnapshot?.marketRegimeLineage?.sourceFile || null,
    marketRegimeSourceSha256: row.decisionSnapshot?.marketRegimeLineage?.sourceSha256 || null,
    marketRegimeTriggerFile: row.decisionSnapshot?.marketRegimeLineage?.triggerFile || null,
    marketRegimeExpectedTriggerFile: row.decisionSnapshot?.marketRegimeLineage?.expectedTriggerFile || null,
    marketRegimeTriggerMatches: row.decisionSnapshot?.marketRegimeLineage?.triggerMatches === true,
    marketRegimeSourceAsOf: row.decisionSnapshot?.marketRegimeLineage?.sourceAsOf || null,
    marketRegimeRetrievedAt: row.decisionSnapshot?.marketRegimeLineage?.retrievedAt || null,
    marketRegimeDecisionAt: row.decisionSnapshot?.generatedAt || null,
    marketRegimeMarketTimezone: row.decisionSnapshot?.marketRegimeLineage?.marketTimezone || null,
    marketRegimeQualityStatus: row.decisionSnapshot?.marketRegimeLineage?.qualityStatus || null,
    marketRegimeFreshnessStatus: row.decisionSnapshot?.marketRegimeLineage?.freshnessStatus || null,
    marketRegimeDegraded: row.decisionSnapshot?.marketRegimeLineage?.degraded !== false,
    marketRegimeFallbackSource: row.decisionSnapshot?.marketRegimeLineage?.fallbackSource || null,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    holdingDays: row.holdingBars,
    mfePct: row.mfePct,
    maePct: row.maePct,
    realizedR: row.realizedR,
    processReviewStatus: row.processOutcomeReview.processReviewStatus,
    processScore: row.processOutcomeReview.processScore,
    outcomeScore: row.processOutcomeReview.outcomeScore,
    outcomeScoreBasis: row.processOutcomeReview.outcomeScoreBasis,
    decisionSnapshotSha256: row.decisionSnapshotSha256,
    corporateActionLineageSchemaVersion: row.historyLineage?.schemaVersion || null,
    adjustmentType: row.historyLineage?.adjustmentType || null,
    splitAdjustmentStatus: row.historyLineage?.splitAdjustmentStatus || null,
    dividendAdjustmentStatus: row.historyLineage?.dividendAdjustmentStatus || null,
    vendor: row.historyLineage?.vendor || null,
    retrievedAt: row.historyLineage?.retrievedAt || null,
    lineageEvaluatedAt: row.historyLineage?.lineageEvaluatedAt || null,
    externalEvidenceSha256: row.historyLineage?.externalEvidenceSha256 || null,
    sourceAsOf: row.historyLineage?.sourceAsOf || null,
    eventEffectiveAt: row.historyLineage?.eventEffectiveAt || null,
    marketTimezone: row.historyLineage?.marketTimezone || null,
    sourceFreshnessStatus: row.historyLineage?.sourceFreshnessStatus || null,
    historyCoverageStatus: row.historyLineage?.historyCoverageStatus || null,
    corporateActionStatus: row.historyLineage?.corporateActionStatus || null,
    symbolChangeStatus: row.historyLineage?.symbolChangeStatus || null,
    delistingStatus: row.historyLineage?.delistingStatus || null,
    suspensionStatus: row.historyLineage?.suspensionStatus || null,
    survivorshipBiasStatus: row.historyLineage?.survivorshipBiasStatus || null,
    returnBasis: row.historyLineage?.returnBasis || 'PRICE_RETURN_NOT_TOTAL_RETURN',
    comparisonEvidenceMode: row.historyLineage?.comparisonEvidenceMode || null,
    comparisonEvidenceStatus: row.historyLineage?.comparisonEvidenceStatus || null,
    comparisonEligibilityStatus: row.historyLineage?.comparisonEligibilityStatus || 'UNVERIFIED_FOR_COMPARISON',
    comparisonExclusionReasons: row.historyLineage?.comparisonExclusionReasons || [],
    lineageVerifiedForComparison: row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON',
    spreadBps: costs.spreadBps,
    slippageBps: costs.slippageBps,
    commissionBps: costs.commissionBps,
    costInputBasis: costs.basis
  }));

function summarizeOutcomes(groupRows) {
  const average = (field) => {
    const values = groupRows.flatMap((row) => {
      const value = Number(row?.[field]);
      return row?.[field] != null && Number.isFinite(value) ? [value] : [];
    });
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const outcomeCounts = {};
  for (const row of groupRows) outcomeCounts[row.outcomeLabel] = (outcomeCounts[row.outcomeLabel] || 0) + 1;
  return {
    rows: groupRows.length,
    resolvedRows: groupRows.filter((row) => row.outcomeStatus === 'resolved').length,
    pendingRows: groupRows.filter((row) => String(row.outcomeStatus).startsWith('pending')).length,
    excludedRows: groupRows.filter((row) => String(row.outcomeStatus).startsWith('excluded')).length,
    falseNegativeEligibleRows: groupRows.filter((row) => row.falseNegativeEligible).length,
    outcomeCounts,
    meanMfePct: average('mfePct'),
    meanMaePct: average('maePct'),
    meanRealizedR: average('realizedR')
  };
}

const cohortCounts = Object.fromEntries(Object.values(COHORTS).map((cohort) => [cohort, rows.filter((row) => row.decisionCohort === cohort).length]));
const blockerCounts = {};
for (const row of rows) blockerCounts[row.primaryBlocker] = (blockerCounts[row.primaryBlocker] || 0) + 1;
const cohortOutcomes = Object.fromEntries(Object.values(COHORTS).map((cohort) => [cohort, summarizeOutcomes(rows.filter((row) => row.decisionCohort === cohort))]));
const blockerOutcomes = Object.fromEntries([...new Set(rows.map((row) => row.primaryBlocker))].sort().map((blocker) => [blocker, summarizeOutcomes(rows.filter((row) => row.primaryBlocker === blocker))]));
const summary = {
  seedRows: seeds.length,
  historyCoverageRows: rows.filter((row) => row.historyLineage?.status === 'PRESENT').length,
  missingHistoryRows: rows.filter((row) => row.historyLineage?.status !== 'PRESENT').length,
  resolvedRows: rows.filter((row) => row.outcomeStatus === 'resolved').length,
  pendingRows: rows.filter((row) => String(row.outcomeStatus).startsWith('pending')).length,
  excludedRows: rows.filter((row) => String(row.outcomeStatus).startsWith('excluded')).length,
  oosRows: oosRows.length,
  rejectedSeedRows: rejected.length,
  ambiguousRows: rows.filter((row) => row.outcomeLabel === 'AMBIGUOUS_INTRABAR').length,
  noFillRows: rows.filter((row) => row.outcomeLabel === 'NO_FILL').length,
  preSignalBarsExcluded: rows.reduce((sum, row) => sum + Number(row.preSignalBarsExcluded || 0), 0),
  duplicateSeedRows,
  deduplicatedSurfaceRows,
  cohortCounts,
  blockerCounts,
  unknownCohortRows: rows.filter((row) => !Object.values(COHORTS).includes(row.decisionCohort)).length,
  falseNegativeEligibleRows: rows.filter((row) => row.falseNegativeEligible).length,
  lookAheadViolationRows: rows.filter((row) => row.biasAudit?.lookAheadViolation).length,
  survivorshipBiasViolationRows: rows.filter((row) => row.biasAudit?.survivorshipBiasViolation).length,
  survivorshipBiasUnverifiedRows: rows.filter((row) => String(row.biasAudit?.survivorshipBiasStatus).startsWith('UNVERIFIED')).length,
  comparisonLineageExcludedRows: rows.filter((row) => row.outcomeLabel === 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED').length,
  comparisonEligibleHistoryRows: rows.filter((row) => row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON').length,
  marketRegimeLineageVerifiedRows: rows.filter((row) => row.decisionSnapshot?.marketRegimeLineageVerifiedForComparison === true).length,
  marketRegimeLineageUnverifiedRows: rows.filter((row) => row.decisionSnapshot?.marketRegimeLineageVerifiedForComparison !== true).length,
  pendingProcessReviewRows: rows.filter((row) => row.processOutcomeReview?.processReviewStatus === 'PENDING_TERMINAL_EVIDENCE').length,
  verifiedProcessReviewRows: rows.filter((row) => row.processOutcomeReview?.processReviewStatus === 'VERIFIED_PROCESS_REVIEW').length,
  processReviewUnknownRows: rows.filter((row) => !['PENDING_TERMINAL_EVIDENCE', 'VERIFIED_PROCESS_REVIEW'].includes(row.processOutcomeReview?.processReviewStatus)).length
};
const accumulationLiveness = buildAccumulationLiveness(rows, oosRows, summary);
summary.accumulationLivenessStatus = accumulationLiveness.status;
summary.accumulationLifecycleCounts = accumulationLiveness.summary.lifecycleCounts;
const ledger = {
  schemaVersion: 'stage7-outcome-ledger-v2',
  generatedAt: new Date().toISOString(),
  overall: seeds.length ? 'report_only_outcomes_collected' : 'no_executable_stage6_seeds',
  interpretation: 'timestamped_forward_evidence_only_not_execution_or_alpha_approval',
  source: {
    stage6Directory: path.relative(root, stage6Dir),
    stage6Files,
    stage4Directory: path.relative(root, stage4Dir),
    stage4Files: history.sourceFiles
  },
  policy: {
    signalCohort: 'execution_contract executablePicks/modelTop6/watchlistTop final decision surface',
    cohorts: COHORTS,
    actionableVerdictSource: 'per_stage6_decisionGate_with_fallback',
    fallbackActionableVerdicts: DEFAULT_ACTIONABLE_VERDICTS,
    marketTimezone: 'America/New_York',
    horizonBars,
    barFrequency: 'daily',
    forwardBarRule: 'bar.date > signalMarketDate; signal-date daily bar allowed only when Stage6 was generated before 09:30 America/New_York',
    intrabarRule: 'exclude_when_entry_and_exit_or_target_and_stop_share_a_daily_bar',
    fillRule: 'long_limit_filled_when_daily_low_lte_entry_assume_entry_price',
    comparisonEvidenceModes: COMPARISON_EVIDENCE_MODES,
    prospectiveRule: 'only post-activation decisions with complete free-source decision-to-horizon sessions may become comparison eligible; historical rows are immutable',
    costInputs: costs,
    biasPolicy: 'decision snapshot is immutable; outcomes use only eligible post-decision daily bars; unverified corporate-action or market-regime lineage remains explicit',
    processReviewPolicy: 'modeled OOS outcome never implies process quality; verified process scoring requires broker-confirmed terminal PAPER lifecycle evidence'
  },
  summary,
  accumulationLiveness,
  driveStage4Stage7Utilization,
  cohortOutcomes,
  blockerOutcomes,
  rows,
  rejected
};
const oosPayload = {
  schemaVersion: 'stage3-5-oos-v2',
  generatedAt: ledger.generatedAt,
  sourceLedger: path.relative(root, ledgerOut),
  sourceLedgerSchemaVersion: ledger.schemaVersion,
  walkForwardPolicy: {
    split: 'OOS',
    cohort: 'signal_market_month',
    temporalRule: 'resolvedAt_after_signalDate_or_same_date_only_for_pre_rth_signal',
    ambiguousAndUnfilledRowsExcluded: true
  },
  sourceLedgerSummary: {
    duplicateSeedRows: summary.duplicateSeedRows,
    unknownCohortRows: summary.unknownCohortRows,
    lookAheadViolationRows: summary.lookAheadViolationRows,
    survivorshipBiasViolationRows: summary.survivorshipBiasViolationRows
  },
  driveStage4Stage7Utilization,
  accumulationLiveness,
  rows: oosRows
};
const markdown = `# Stage7 Outcome Ledger\n\n` +
  `- Overall: \`${ledger.overall}\`\n` +
  `- Seed rows: ${summary.seedRows}\n` +
  `- Cohorts: ${Object.entries(summary.cohortCounts).map(([key, value]) => `${key}=${value}`).join(', ')}\n` +
  `- Resolved rows: ${summary.resolvedRows}\n` +
  `- Pending rows: ${summary.pendingRows}\n` +
  `- Missing source history rows: ${summary.missingHistoryRows}\n` +
  `- Pre-signal bars excluded: ${summary.preSignalBarsExcluded}\n` +
  `- OOS rows emitted: ${summary.oosRows}\n` +
  `- Ambiguous rows excluded: ${summary.ambiguousRows}\n` +
  `- Invalid-geometry rows excluded: ${rows.filter((row) => row.outcomeLabel === 'EXCLUDED_INVALID_GEOMETRY').length}\n` +
  `- Look-ahead violations: ${summary.lookAheadViolationRows}\n` +
  `- Survivorship lineage unverified rows: ${summary.survivorshipBiasUnverifiedRows}\n` +
  `- Market-regime lineage verified rows: ${summary.marketRegimeLineageVerifiedRows}\n` +
  `- Market-regime lineage unverified rows: ${summary.marketRegimeLineageUnverifiedRows}\n` +
  `- Process review: pending=${summary.pendingProcessReviewRows}, verified=${summary.verifiedProcessReviewRows}, unknown=${summary.processReviewUnknownRows}\n` +
  `- Accumulation liveness: \`${accumulationLiveness.status}\`\n` +
  `- Root-cause contract audit: \`${accumulationLiveness.rootCauseAudit.contractAuditVerdict}\`\n` +
  `- First-failure counts: ${JSON.stringify(accumulationLiveness.rootCauseAudit.rootCauseCounts)}\n` +
  `- Counterfactual horizon: matured=${accumulationLiveness.rootCauseAudit.counterfactualHorizonMaturedRows}, pending=${accumulationLiveness.rootCauseAudit.counterfactualHorizonPendingRows}, no-post-decision-bars=${accumulationLiveness.rootCauseAudit.counterfactualNoPostDecisionBars}, history-missing=${accumulationLiveness.rootCauseAudit.counterfactualHistoryMissingRows}\n` +
  `- Comparable progress: executable=${accumulationLiveness.progress.executableComparable.current}/${accumulationLiveness.progress.executableComparable.required}, actionable-blocked=${accumulationLiveness.progress.actionableBlockedComparable.current}/${accumulationLiveness.progress.actionableBlockedComparable.required}, regimes=${accumulationLiveness.progress.comparableRegimes.current}/${accumulationLiveness.progress.comparableRegimes.required}\n` +
  `- Next meaningful evaluation: \`${accumulationLiveness.nextMeaningfulEvaluationCondition}\`\n` +
  `- Horizon: ${horizonBars} daily bars\n` +
  `- Cost basis: \`${costs.basis}\` (${costs.spreadBps}/${costs.slippageBps}/${costs.commissionBps} bps spread/slippage/commission)\n\n` +
  `Bars after the Stage6 market date are evaluated; the signal-date bar is admitted only for a pre-RTH signal. Ambiguous daily-bar ordering is excluded and no broker behavior is authorized.\n`;

atomicWrite(ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
atomicWrite(oosOut, `${JSON.stringify(oosPayload, null, 2)}\n`);
atomicWrite(markdownOut, markdown);
console.log(`[STAGE7_OUTCOME_LEDGER] overall=${ledger.overall} seeds=${summary.seedRows} resolved=${summary.resolvedRows} oos=${summary.oosRows}`);
