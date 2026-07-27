#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.resolve(root, process.env.STAGE35_OOS_INPUT || 'state/stage3-5-oos-outcomes.json');
const outJson = path.resolve(root, process.env.STAGE35_OOS_OUT_JSON || 'state/stage3-5-oos-cost-audit.json');
const outMd = path.resolve(root, process.env.STAGE35_OOS_OUT_MD || 'docs/STAGE3_5_OOS_COST_AUDIT.md');
const minimumSample = Math.max(1, Number.parseInt(process.env.STAGE35_OOS_MIN_SAMPLE || '30', 10) || 30);

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

const inputExists = fs.existsSync(inputPath);
const raw = inputExists ? fs.readFileSync(inputPath, 'utf8') : '';
const payload = inputExists ? JSON.parse(raw) : { schemaVersion: 'stage3-5-oos-v1', rows: [] };
const supportedInputSchemas = new Set(['stage3-5-oos-v1', 'stage3-5-oos-v2']);
const inputContractValid = supportedInputSchemas.has(payload.schemaVersion)
  && Array.isArray(payload.rows)
  && (payload.schemaVersion !== 'stage3-5-oos-v2'
    || payload.sourceLedgerSchemaVersion === 'stage7-outcome-ledger-v2');
const rows = Array.isArray(payload.rows) ? payload.rows : [];
const stage7TemporalContract = ['stage7-outcome-ledger-v1', 'stage7-outcome-ledger-v2'].includes(payload.sourceLedgerSchemaVersion);
const cohortContract = payload.schemaVersion === 'stage3-5-oos-v2';
const supportedCohorts = new Set(['EXECUTABLE_COHORT', 'ACTIONABLE_BLOCKED_COHORT', 'NON_ACTIONABLE_CONTROL_COHORT']);
const accepted = [];
const rejected = [];
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const MARKET_REGIMES = new Set(['RISK_ON', 'NEUTRAL', 'RISK_OFF']);

function verifiedLineageContract(row) {
  const sourceAsOfMs = Date.parse(String(row?.sourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(row?.retrievedAt || ''));
  const lineageEvaluatedAtMs = Date.parse(String(row?.lineageEvaluatedAt || ''));
  return Boolean(
    row?.lineageVerifiedForComparison === true
    && row?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON'
    && Array.isArray(row?.comparisonExclusionReasons)
    && row.comparisonExclusionReasons.length === 0
    && row?.corporateActionLineageSchemaVersion === 'corporate-action-lineage-v1'
    && SHA256_PATTERN.test(String(row?.externalEvidenceSha256 || ''))
    && Number.isFinite(sourceAsOfMs)
    && Number.isFinite(retrievedAtMs)
    && Number.isFinite(lineageEvaluatedAtMs)
    && sourceAsOfMs <= retrievedAtMs
    && retrievedAtMs <= lineageEvaluatedAtMs
    && row?.adjustmentType === 'YFINANCE_AUTO_ADJUSTED_OHLC'
    && row?.splitAdjustmentStatus === 'VERIFIED_YFINANCE_AUTO_ADJUSTED'
    && row?.dividendAdjustmentStatus === 'VERIFIED_YFINANCE_AUTO_ADJUSTED'
    && [
      'VERIFIED_SPLIT_DIVIDEND_EVENTS_IN_WINDOW',
      'VERIFIED_NO_SPLIT_OR_DIVIDEND_EVENT_IN_WINDOW'
    ].includes(row?.corporateActionStatus)
    && [
      'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE',
      'VERIFIED_SYMBOL_CHANGE'
    ].includes(row?.symbolChangeStatus)
    && row?.delistingStatus === 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE'
    && row?.suspensionStatus === 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE'
    && row?.survivorshipBiasStatus === 'VERIFIED_CORPORATE_ACTION_LINEAGE'
    && row?.returnBasis === 'DIVIDEND_AND_SPLIT_ADJUSTED_PRICE_RETURN'
  );
}

function verifiedMarketRegimeContract(row) {
  const score = Number(row?.marketRegimeScore);
  const sourceAsOfMs = Date.parse(String(row?.marketRegimeSourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(row?.marketRegimeRetrievedAt || ''));
  const decisionAtMs = Date.parse(String(row?.marketRegimeDecisionAt || ''));
  return Boolean(
    row?.marketRegimeLineageVerifiedForComparison === true
    && row?.marketRegimeLineageSchemaVersion === 'market-regime-lineage-v1'
    && row?.marketRegimeLineageStatus === 'VERIFIED_DECISION_TIME_REGIME'
    && MARKET_REGIMES.has(String(row?.marketRegime || '').trim().toUpperCase())
    && Number.isFinite(score)
    && score >= 0
    && score <= 100
    && row?.marketRegimeSource === 'HARVESTER_MARKET_REGIME_SNAPSHOT'
    && String(row?.marketRegimeSourceFile || '').trim()
    && SHA256_PATTERN.test(String(row?.marketRegimeSourceSha256 || ''))
    && String(row?.marketRegimeTriggerFile || '').trim()
    && row?.marketRegimeTriggerFile === row?.marketRegimeExpectedTriggerFile
    && row?.marketRegimeTriggerMatches === true
    && [sourceAsOfMs, retrievedAtMs, decisionAtMs].every(Number.isFinite)
    && sourceAsOfMs <= retrievedAtMs
    && retrievedAtMs <= decisionAtMs
    && row?.marketRegimeQualityStatus === 'PASS_COMPLETE_SNAPSHOT'
    && row?.marketRegimeFreshnessStatus === 'CURRENT_TRIGGER_MATCH'
    && row?.marketRegimeMarketTimezone === 'America/New_York'
    && row?.marketRegimeDegraded === false
  );
}

for (const row of rows) {
  const symbol = String(row?.symbol || '').trim().toUpperCase();
  if (String(row?.split || '').toUpperCase() !== 'OOS') {
    rejected.push({ symbol: symbol || null, reason: 'non_oos_split' });
    continue;
  }
  const entry = finite(row?.entryPrice);
  const exit = finite(row?.exitPrice);
  const holdingDays = finite(row?.holdingDays);
  const spreadBps = finite(row?.spreadBps);
  const slippageBps = finite(row?.slippageBps);
  const commissionBps = finite(row?.commissionBps);
  const decisionCohort = cohortContract ? String(row?.decisionCohort || '').trim().toUpperCase() : 'EXECUTABLE_COHORT';
  if (!supportedCohorts.has(decisionCohort)) {
    rejected.push({ symbol: symbol || null, reason: 'unknown_decision_cohort' });
    continue;
  }
  if (cohortContract && row?.lineageVerifiedForComparison !== true) {
    rejected.push({
      symbol: symbol || null,
      reason: 'corporate_action_lineage_unverified'
    });
    continue;
  }
  if (cohortContract && !verifiedLineageContract(row)) {
    rejected.push({
      symbol: symbol || null,
      reason: 'corporate_action_lineage_contract_invalid'
    });
    continue;
  }
  const sameDatePreRthResolution = row?.signalMarketPhase === 'PRE_RTH'
    && String(row?.resolvedAt || '') === String(row?.signalDate || '');
  if (stage7TemporalContract && (
    !row?.signalDate
    || !row?.resolvedAt
    || (String(row.resolvedAt) <= String(row.signalDate) && !sameDatePreRthResolution)
  )) {
    rejected.push({ symbol: symbol || null, reason: 'invalid_walk_forward_timestamp_order' });
    continue;
  }
  if (!symbol || String(row?.side || '').toUpperCase() !== 'LONG') {
    rejected.push({ symbol: symbol || null, reason: 'unsupported_symbol_or_side' });
    continue;
  }
  if (entry == null || exit == null || entry <= 0 || exit <= 0 || holdingDays == null || holdingDays <= 0) {
    rejected.push({ symbol, reason: 'invalid_price_or_holding_period' });
    continue;
  }
  if ([spreadBps, slippageBps, commissionBps].some((value) => value == null || value < 0)) {
    rejected.push({ symbol, reason: 'missing_or_invalid_cost_input' });
    continue;
  }

  // One full spread plus per-side slippage and commission.
  const roundTripCostBps = spreadBps + (2 * slippageBps) + (2 * commissionBps);
  const grossReturnPct = ((exit / entry) - 1) * 100;
  const netReturnPct = grossReturnPct - (roundTripCostBps / 100);
  accepted.push({
    symbol,
    decisionCohort,
    primaryBlocker: row?.primaryBlocker || (decisionCohort === 'EXECUTABLE_COHORT' ? 'NONE' : null),
    falseNegativeEligible: row?.falseNegativeEligible === true,
    lineageVerifiedForComparison: cohortContract ? row?.lineageVerifiedForComparison === true : true,
    signalDate: row.signalDate || null,
    resolvedAt: row.resolvedAt || null,
    walkForwardCohort: row.walkForwardCohort || String(row.signalDate || '').slice(0, 7) || null,
    marketRegime: verifiedMarketRegimeContract(row)
      ? String(row.marketRegime).trim().toUpperCase()
      : 'UNKNOWN',
    marketRegimeScore: verifiedMarketRegimeContract(row) ? Number(row.marketRegimeScore) : null,
    marketRegimeLineageVerifiedForComparison: verifiedMarketRegimeContract(row),
    holdingDays,
    mfePct: finite(row?.mfePct),
    maePct: finite(row?.maePct),
    realizedR: finite(row?.realizedR),
    grossReturnPct: round(grossReturnPct),
    roundTripCostBps: round(roundTripCostBps),
    netReturnPct: round(netReturnPct)
  });
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const metricValues = (groupRows, field) => groupRows.flatMap((row) => (
  row[field] == null || !Number.isFinite(Number(row[field])) ? [] : [Number(row[field])]
));

function summarizeRows(groupRows) {
  const average = (field) => {
    const values = metricValues(groupRows, field);
    return values.length ? round(mean(values)) : null;
  };
  return {
    rows: groupRows.length,
    uniqueSymbols: new Set(groupRows.map((row) => row.symbol)).size,
    walkForwardCohorts: new Set(groupRows.map((row) => row.walkForwardCohort).filter(Boolean)).size,
    netWinRatePct: groupRows.length
      ? round((groupRows.filter((row) => row.netReturnPct > 0).length / groupRows.length) * 100)
      : null,
    meanGrossReturnPct: average('grossReturnPct'),
    meanNetReturnPct: average('netReturnPct'),
    meanMfePct: average('mfePct'),
    meanMaePct: average('maePct'),
    meanRealizedR: average('realizedR')
  };
}

function deterministicRandom(seedHex) {
  let state = Number.parseInt(String(seedHex || '').slice(0, 8), 16) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function percentile(sortedValues, probability) {
  if (!sortedValues.length) return null;
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + ((sortedValues[upper] - sortedValues[lower]) * (index - lower));
}

function bootstrapDifference(executableRows, blockedRows, inputSha256) {
  const iterations = 2000;
  const confidenceLevel = 0.95;
  if (!executableRows.length || !blockedRows.length) {
    return {
      status: 'not_run_insufficient_oos_evidence',
      method: 'deterministic_nonparametric_percentile',
      iterations,
      confidenceLevel,
      blockedMinusExecutableMeanNetReturnPct: null
    };
  }
  const random = deterministicRandom(inputSha256);
  const sampleMean = (source) => {
    let total = 0;
    for (let index = 0; index < source.length; index += 1) {
      total += source[Math.floor(random() * source.length)].netReturnPct;
    }
    return total / source.length;
  };
  const differences = Array.from(
    { length: iterations },
    () => sampleMean(blockedRows) - sampleMean(executableRows)
  ).sort((a, b) => a - b);
  const tail = (1 - confidenceLevel) / 2;
  return {
    status: 'report_only_interval_ready',
    method: 'deterministic_nonparametric_percentile',
    iterations,
    confidenceLevel,
    seedSha256: inputSha256,
    blockedMinusExecutableMeanNetReturnPct: {
      estimate: round(
        mean(blockedRows.map((row) => row.netReturnPct))
          - mean(executableRows.map((row) => row.netReturnPct)),
        4
      ),
      lower: round(percentile(differences, tail), 4),
      upper: round(percentile(differences, 1 - tail), 4)
    }
  };
}

const validOosRows = accepted.length;
const cohortMap = new Map();
for (const row of accepted) {
  const cohort = row.walkForwardCohort || 'unknown';
  const values = cohortMap.get(cohort) || [];
  values.push(row);
  cohortMap.set(cohort, values);
}
const walkForwardCohorts = [...cohortMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cohort, cohortRows]) => ({
  cohort,
  rows: cohortRows.length,
  netWinRatePct: round((cohortRows.filter((row) => row.netReturnPct > 0).length / cohortRows.length) * 100),
  meanNetReturnPct: round(mean(cohortRows.map((row) => row.netReturnPct)))
}));
const decisionCohorts = [...supportedCohorts].map((cohort) => {
  const cohortRows = accepted.filter((row) => row.decisionCohort === cohort);
  return {
    cohort,
    rows: cohortRows.length,
    netWinRatePct: round(cohortRows.length ? (cohortRows.filter((row) => row.netReturnPct > 0).length / cohortRows.length) * 100 : 0),
    meanNetReturnPct: round(mean(cohortRows.map((row) => row.netReturnPct)))
  };
});
const executableRows = accepted.filter((row) => row.decisionCohort === 'EXECUTABLE_COHORT' && row.lineageVerifiedForComparison);
const actionableBlockedRows = accepted.filter((row) => row.decisionCohort === 'ACTIONABLE_BLOCKED_COHORT' && row.falseNegativeEligible && row.lineageVerifiedForComparison);
const controlRows = accepted.filter((row) => row.decisionCohort === 'NON_ACTIONABLE_CONTROL_COHORT');
const lineageUnverifiedRows = rejected.filter(
  (row) => [
    'corporate_action_lineage_unverified',
    'corporate_action_lineage_contract_invalid'
  ].includes(row.reason)
).length;
const comparisonReady = executableRows.length >= minimumSample && actionableBlockedRows.length >= minimumSample;
const executableMeanNetReturnPct = executableRows.length
  ? round(mean(executableRows.map((row) => row.netReturnPct)))
  : null;
const actionableBlockedMeanNetReturnPct = actionableBlockedRows.length
  ? round(mean(actionableBlockedRows.map((row) => row.netReturnPct)))
  : null;
const cohortComparison = {
  status: comparisonReady ? 'report_only_comparison_ready_not_policy_change' : 'insufficient_oos_evidence',
  minimumResolvedRowsPerCohort: minimumSample,
  executableResolvedRows: executableRows.length,
  actionableBlockedResolvedRows: actionableBlockedRows.length,
  nonActionableControlRows: controlRows.length,
  lineageUnverifiedRows,
  executableMeanNetReturnPct,
  actionableBlockedMeanNetReturnPct,
  blockedMinusExecutableMeanNetReturnPct: executableMeanNetReturnPct != null && actionableBlockedMeanNetReturnPct != null
    ? round(actionableBlockedMeanNetReturnPct - executableMeanNetReturnPct)
    : null,
  policyChangeAuthorized: false,
  nextAction: comparisonReady
    ? 'review_regime_stability_and_effect_size_in_a_separate_policy_goal'
    : 'collect_more_timestamped_oos_outcomes_without_relabeling'
};
const sourceLedgerSafetyFields = [
  'duplicateSeedRows',
  'unknownCohortRows',
  'lookAheadViolationRows',
  'survivorshipBiasViolationRows'
];
const sourceLedgerSummary = payload?.sourceLedgerSummary;
const sourceLedgerSafetyVerified = Boolean(
  sourceLedgerSummary
  && typeof sourceLedgerSummary === 'object'
  && sourceLedgerSafetyFields.every((field) => Number.isInteger(sourceLedgerSummary[field]) && sourceLedgerSummary[field] >= 0)
);
const sourceLedgerSafetyViolationRows = sourceLedgerSafetyVerified
  ? sourceLedgerSafetyFields.reduce((sum, field) => sum + sourceLedgerSummary[field], 0)
  : null;
const oosUnknownCohortRows = rejected.filter((row) => row.reason === 'unknown_decision_cohort').length;
const entryGateStatus = !cohortContract
  ? 'not_applicable_legacy_v1'
  : !inputContractValid
    ? 'blocked_invalid_input_contract'
    : !sourceLedgerSafetyVerified
      ? 'blocked_stage7_safety_summary_missing'
      : sourceLedgerSafetyViolationRows > 0
        ? 'blocked_stage7_safety_violation'
        : oosUnknownCohortRows > 0
          ? 'blocked_oos_unknown_cohort'
          : !comparisonReady
            ? 'insufficient_resolved_comparable_rows'
            : 'pass_verified_oos_entry_gate';
const entryGatePassed = entryGateStatus === 'pass_verified_oos_entry_gate';
const cohortMetrics = {
  EXECUTABLE_COHORT: summarizeRows(executableRows),
  ACTIONABLE_BLOCKED_COHORT: summarizeRows(actionableBlockedRows),
  NON_ACTIONABLE_CONTROL_COHORT: summarizeRows(controlRows)
};
const executableMean = cohortMetrics.EXECUTABLE_COHORT.meanNetReturnPct;
const blockerLaneEffects = [...new Set(actionableBlockedRows.map((row) => row.primaryBlocker || 'UNCLASSIFIED'))]
  .sort()
  .map((primaryBlocker) => {
    const blockerRows = actionableBlockedRows.filter(
      (row) => (row.primaryBlocker || 'UNCLASSIFIED') === primaryBlocker
    );
    const metrics = summarizeRows(blockerRows);
    return {
      primaryBlocker,
      ...metrics,
      blockedMinusExecutableMeanNetReturnPct: metrics.meanNetReturnPct != null && executableMean != null
        ? round(metrics.meanNetReturnPct - executableMean)
        : null
    };
  });
const comparisonRows = [...executableRows, ...actionableBlockedRows];
const unknownRegimeRows = comparisonRows.filter((row) => row.marketRegimeLineageVerifiedForComparison !== true).length;
const verifiedRegimeRows = comparisonRows.filter((row) => row.marketRegimeLineageVerifiedForComparison === true);
const verifiedExecutableRegimeRows = executableRows.filter(
  (row) => row.marketRegimeLineageVerifiedForComparison === true
);
const verifiedBlockedRegimeRows = actionableBlockedRows.filter(
  (row) => row.marketRegimeLineageVerifiedForComparison === true
);
const verifiedRegimeSampleReady = verifiedExecutableRegimeRows.length >= minimumSample
  && verifiedBlockedRegimeRows.length >= minimumSample;
const marketRegimeRows = [...new Set(verifiedRegimeRows.map((row) => row.marketRegime))]
  .sort()
  .map((marketRegime) => {
    const executableRegimeRows = executableRows.filter(
      (row) => row.marketRegimeLineageVerifiedForComparison && row.marketRegime === marketRegime
    );
    const blockedRegimeRows = actionableBlockedRows.filter(
      (row) => row.marketRegimeLineageVerifiedForComparison && row.marketRegime === marketRegime
    );
    const executableMetrics = summarizeRows(executableRegimeRows);
    const blockedMetrics = summarizeRows(blockedRegimeRows);
    return {
      marketRegime,
      executable: executableMetrics,
      actionableBlocked: blockedMetrics,
      blockedMinusExecutableMeanNetReturnPct:
        executableMetrics.meanNetReturnPct != null && blockedMetrics.meanNetReturnPct != null
          ? round(blockedMetrics.meanNetReturnPct - executableMetrics.meanNetReturnPct)
          : null
    };
  });
const comparableMarketRegimes = marketRegimeRows.filter(
  (row) => row.executable.rows > 0 && row.actionableBlocked.rows > 0
).length;
const marketRegimeStability = {
  status: entryGatePassed && verifiedRegimeSampleReady && comparableMarketRegimes >= 2
    ? 'report_only_multi_regime_evidence'
    : 'insufficient_regime_evidence',
  requiredComparableRegimes: 2,
  minimumResolvedRowsPerCohort: minimumSample,
  comparableMarketRegimes,
  unknownRegimeRows,
  verifiedRegimeRows: verifiedRegimeRows.length,
  verifiedExecutableRows: verifiedExecutableRegimeRows.length,
  verifiedActionableBlockedRows: verifiedBlockedRegimeRows.length,
  regimes: marketRegimeRows
};
const inputSha256 = inputExists ? crypto.createHash('sha256').update(raw).digest('hex') : null;
const bootstrap = entryGatePassed
  ? bootstrapDifference(executableRows, actionableBlockedRows, inputSha256)
  : {
      status: 'not_run_insufficient_oos_evidence',
      method: 'deterministic_nonparametric_percentile',
      iterations: 2000,
      confidenceLevel: 0.95,
      blockedMinusExecutableMeanNetReturnPct: null
    };
const calibrationReady = entryGatePassed
  && marketRegimeStability.status === 'report_only_multi_regime_evidence';
const calibration = {
  status: !cohortContract
    ? 'legacy_v1_not_calibration_eligible'
    : calibrationReady
      ? 'report_only_calibration_ready'
      : entryGatePassed
        ? 'insufficient_regime_evidence'
        : 'insufficient_oos_evidence',
  entryGate: {
    status: entryGateStatus,
    minimumResolvedRowsPerCohort: minimumSample,
    executableResolvedRows: executableRows.length,
    actionableBlockedResolvedRows: actionableBlockedRows.length,
    sourceLedgerSafetyVerified,
    sourceLedgerSafetyViolationRows,
    oosUnknownCohortRows,
    sourceLedgerSummary: sourceLedgerSafetyVerified ? sourceLedgerSummary : null
  },
  cohortMetrics,
  falseNegativeComparison: {
    status: calibrationReady ? 'report_only_false_negative_comparison_ready' : 'insufficient_oos_evidence',
    blockedMinusExecutableMeanNetReturnPct: cohortComparison.blockedMinusExecutableMeanNetReturnPct
  },
  blockerLaneEffects,
  marketRegimeStability,
  bootstrap,
  policyChangeAuthorized: false
};
const sampleReady = cohortContract ? calibrationReady : validOosRows >= minimumSample;
const report = {
  schemaVersion: 'stage3-5-oos-cost-audit-v2',
  generatedAt: new Date().toISOString(),
  overall: !inputContractValid
    ? 'invalid_input_contract'
    : sampleReady
      ? 'pass_report_only'
      : 'insufficient_oos_evidence',
  interpretation: 'evidence_contract_only_not_alpha_performance_approval',
  source: {
    inputFile: path.relative(root, inputPath),
    inputExists,
    inputSha256,
    schemaVersion: payload.schemaVersion || null,
    contractValid: inputContractValid
  },
  policy: {
    requiredSplit: 'OOS',
    supportedSide: 'LONG',
    minimumSample,
    costFormula: 'spreadBps + 2*slippageBps + 2*commissionBps',
    returnBasis: 'price_return_not_total_return'
  },
  walkForward: {
    temporalContractEnforced: stage7TemporalContract,
    cohortBasis: 'signal_market_month',
    cohorts: walkForwardCohorts
  },
  decisionCohorts,
  cohortComparison,
  calibration,
  summary: {
    inputRows: rows.length,
    validOosRows,
    rejectedRows: rejected.length,
    rejectedNonOosRows: rejected.filter((row) => row.reason === 'non_oos_split').length,
    unknownCohortRows: oosUnknownCohortRows,
    netWinRatePct: round(validOosRows ? (accepted.filter((row) => row.netReturnPct > 0).length / validOosRows) * 100 : 0),
    meanGrossReturnPct: round(mean(accepted.map((row) => row.grossReturnPct))),
    meanNetReturnPct: round(mean(accepted.map((row) => row.netReturnPct))),
    meanRoundTripCostBps: round(mean(accepted.map((row) => row.roundTripCostBps)))
  },
  rows: accepted,
  rejected,
  limitations: [
    'No result is inferred when forward outcome labels are absent.',
    'Market impact, borrow cost, taxes, and opportunity cost are not modeled.',
    'Passing validates sample and cost evidence only; it does not approve execution or prove alpha.',
    'Corporate-action and delisting lineage that is absent from Stage4 remains unverified rather than inferred.',
    'Calibration is report-only and never changes Stage6 thresholds or execution policy.',
    'A single ticker, run, or market regime cannot authorize a calibration conclusion.'
  ],
  nextAction: !inputContractValid
    ? 'repair_oos_input_contract_before_analysis'
    : sampleReady
      ? 'review_walk_forward_stability_and_regime_slices'
      : 'collect_more_timestamped_oos_outcomes_without_relabeling'
};

const markdown = `# Stage3-5 OOS and Cost Audit

- Overall: \`${report.overall}\`
- Interpretation: \`${report.interpretation}\`
- Valid OOS rows: ${validOosRows}/${minimumSample}
- Mean gross return: ${report.summary.meanGrossReturnPct}%
- Mean net return: ${report.summary.meanNetReturnPct}%
- Mean round-trip cost: ${report.summary.meanRoundTripCostBps} bps
- Cohort comparison: \`${cohortComparison.status}\`
- Calibration: \`${calibration.status}\`
- Stage7 safety gate: \`${calibration.entryGate.status}\`
- Executable MAE/MFE: ${calibration.cohortMetrics.EXECUTABLE_COHORT.meanMaePct ?? 'N/A'}% / ${calibration.cohortMetrics.EXECUTABLE_COHORT.meanMfePct ?? 'N/A'}%
- Actionable-blocked MAE/MFE: ${calibration.cohortMetrics.ACTIONABLE_BLOCKED_COHORT.meanMaePct ?? 'N/A'}% / ${calibration.cohortMetrics.ACTIONABLE_BLOCKED_COHORT.meanMfePct ?? 'N/A'}%
- Market-regime evidence: \`${calibration.marketRegimeStability.status}\`
- Bootstrap CI: \`${calibration.bootstrap.status}\`
- Next action: \`${report.nextAction}\`

This report never substitutes in-sample rows for missing OOS evidence and does not authorize broker behavior.
`;

atomicWrite(outJson, `${JSON.stringify(report, null, 2)}\n`);
atomicWrite(outMd, markdown);
console.log(`[STAGE3_5_OOS_COST_AUDIT] overall=${report.overall} rows=${validOosRows}/${minimumSample}`);
