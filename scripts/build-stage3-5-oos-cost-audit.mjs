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

function round(value) {
  return Number(value.toFixed(2));
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
    holdingDays,
    grossReturnPct: round(grossReturnPct),
    roundTripCostBps: round(roundTripCostBps),
    netReturnPct: round(netReturnPct)
  });
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
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
const lineageUnverifiedRows = accepted.filter((row) => !row.lineageVerifiedForComparison).length;
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
const sampleReady = cohortContract ? comparisonReady : validOosRows >= minimumSample;
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
    inputSha256: inputExists ? crypto.createHash('sha256').update(raw).digest('hex') : null,
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
  summary: {
    inputRows: rows.length,
    validOosRows,
    rejectedRows: rejected.length,
    rejectedNonOosRows: rejected.filter((row) => row.reason === 'non_oos_split').length,
    unknownCohortRows: rejected.filter((row) => row.reason === 'unknown_decision_cohort').length,
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
    'Corporate-action and delisting lineage that is absent from Stage4 remains unverified rather than inferred.'
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
- Next action: \`${report.nextAction}\`

This report never substitutes in-sample rows for missing OOS evidence and does not authorize broker behavior.
`;

atomicWrite(outJson, `${JSON.stringify(report, null, 2)}\n`);
atomicWrite(outMd, markdown);
console.log(`[STAGE3_5_OOS_COST_AUDIT] overall=${report.overall} rows=${validOosRows}/${minimumSample}`);
