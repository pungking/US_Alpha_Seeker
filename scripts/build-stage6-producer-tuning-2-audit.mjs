#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const INPUTS = {
  formulaBacklog: process.env.STAGE6_PRODUCER_TUNING_2_FORMULA_BACKLOG || 'state/stage6-formula-tuning-backlog.json',
  runtimeProof: process.env.STAGE6_PRODUCER_TUNING_2_RUNTIME_PROOF || 'state/stage6-runtime-formula-contract-proof.json',
  freshFocus: process.env.STAGE6_PRODUCER_TUNING_2_FRESH_FOCUS || 'state/stage6-fresh-focus-audit.json'
};
const OUT_JSON = process.env.STAGE6_PRODUCER_TUNING_2_OUT_JSON || 'state/stage6-producer-tuning-2-audit.json';
const OUT_MD = process.env.STAGE6_PRODUCER_TUNING_2_OUT_MD || 'state/stage6-producer-tuning-2-audit.md';

const TARGET_LANES = {
  EXECUTION_FLOOR_VIABLE_GAP_WIDE: 'target_execution_floor_viable_expected_return_gap_wide',
  TARGET_NO_TRADE_CONFIRMED: 'target_no_trade_confirmed',
  TARGET_RECALIBRATION_CANDIDATE: 'target_recalibration_candidate',
  NOT_TARGET_BLOCKED: 'not_target_blocked',
  TARGET_EVIDENCE_MISSING: 'target_evidence_missing'
};
const RISK_LANES = {
  TARGET_RECALIBRATION_PROOF_READY: 'risk_geometry_target_recalibration_proof_ready',
  RECALCULATED_STOP_PROOF_READY: 'risk_geometry_recalculated_stop_proof_ready',
  REQUIRED_TARGET_TOO_HIGH: 'risk_geometry_required_target_too_high',
  REQUIRED_STOP_INVALID: 'risk_geometry_required_stop_invalid',
  NOT_RISK_GEOMETRY_BLOCKED: 'not_risk_geometry_blocked',
  EVIDENCE_MISSING: 'risk_geometry_evidence_missing'
};
const BREAKOUT_LANES = {
  PROOF_CONFIRMED_READY: 'breakout_proof_confirmed_ready',
  REVIEW_READY_BUT_NOT_CONFIRMED: 'breakout_review_ready_but_not_confirmed',
  REVIEW_READY_STALE_OR_EXTENDED: 'breakout_review_ready_stale_or_extended',
  NOT_BREAKOUT_BLOCKED: 'not_breakout_blocked'
};
const STRUCTURE_LANES = {
  CURRENT_RR_WEAK_KEEP_WAIT: 'structure_current_rr_weak_keep_wait',
  TARGET_BUFFER_WEAK_KEEP_WAIT: 'structure_target_buffer_weak_keep_wait',
  SUPPORT_PROOF_GAP: 'structure_support_proof_gap',
  STRUCTURE_PROOF_CANDIDATE: 'structure_proof_candidate',
  NOT_STRUCTURE_BLOCKED: 'not_structure_blocked'
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function readJsonIfPresent(label, filePath, warnings) {
  const full = resolveRepo(filePath);
  if (!fs.existsSync(full)) {
    warnings.push({ label, path: filePath, warning: 'missing_input' });
    return null;
  }
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? 'unknown');
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function countListValues(rows, key) {
  return rows.reduce((acc, row) => {
    const values = Array.isArray(row[key]) && row[key].length ? row[key] : ['none'];
    for (const raw of values) {
      const value = String(raw || 'unknown');
      acc[value] = (acc[value] || 0) + 1;
    }
    return acc;
  }, {});
}

function asReasons(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : [];
}

function pushIf(values, condition, reason) {
  if (condition) values.push(reason);
}

function flatRow(row) {
  const target = row.targetRecalibrationEvidence || {};
  const structure = row.structureProofEvidence || {};
  return {
    ...target,
    ...structure,
    ...row,
    targetNoTradeConfirmed: row.targetNoTradeConfirmed ?? target.noTradeConfirmed,
    targetRecalibrationCandidate: row.targetRecalibrationCandidate ?? target.candidate,
    targetRecalibrationExecutionFloorViable:
      row.targetRecalibrationExecutionFloorViable ?? target.executionFloorViable,
    targetRecalibrationViabilityVerdict:
      row.targetRecalibrationViabilityVerdict ?? target.viabilityVerdict,
    riskGeometryTargetRecalibrationProofReady:
      row.riskGeometryTargetRecalibrationProofReady ?? row.riskGeometryProofConfirmed,
    symbol: String(row.symbol || row.ticker || '').toUpperCase()
  };
}

function classifyTarget(input) {
  const row = flatRow(input);
  const relevant = String(row.zeroExecutableTuningLane || '').includes('TARGET') ||
    String(row.decisionReason || '').includes('target') ||
    row.targetNoTradeConfirmed === true ||
    row.targetRecalibrationCandidate === true;
  if (!relevant) return TARGET_LANES.NOT_TARGET_BLOCKED;
  if (row.targetNoTradeConfirmed === true) return TARGET_LANES.TARGET_NO_TRADE_CONFIRMED;
  if (row.targetRecalibrationExecutionFloorViable === true && row.targetRecalibrationCandidate !== true) {
    return TARGET_LANES.EXECUTION_FLOOR_VIABLE_GAP_WIDE;
  }
  if (row.targetRecalibrationCandidate === true) return TARGET_LANES.TARGET_RECALIBRATION_CANDIDATE;
  return TARGET_LANES.TARGET_EVIDENCE_MISSING;
}

function classifyRisk(input) {
  const row = flatRow(input);
  const zeroLane = String(row.zeroExecutableTuningLane || '').trim().toUpperCase();
  const policyVerdict = String(row.riskGeometryPolicyVerdict || '').trim().toUpperCase();
  const repairLane = String(row.riskGeometryRepairLane || '').trim().toLowerCase();
  const policyNotApplicable = !policyVerdict || policyVerdict === 'RISK_GEOMETRY_POLICY_NOT_APPLICABLE';
  const repairNotApplicable = !repairLane || repairLane === 'not_applicable';

  // Executable/no-action rows can still carry raw risk fields from the formula contract.
  // Do not count those default booleans as a producer-tuning risk blocker.
  if (zeroLane === 'NO_ZERO_EXECUTABLE_TUNING_ACTION' && policyNotApplicable && repairNotApplicable) {
    return RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED;
  }

  const relevant = /RISK|STOP_TARGET/.test(zeroLane) ||
    String(row.blockerCategory || '') === 'risk_geometry' ||
    /blocked_stop|blocked_rr|invalid_geometry/.test(String(row.decisionReason || '')) ||
    !repairNotApplicable ||
    !policyNotApplicable;
  if (!relevant) return RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED;
  if (row.riskGeometryTargetRecalibrationProofReady === true) return RISK_LANES.TARGET_RECALIBRATION_PROOF_READY;
  if (row.riskGeometryRecalculatedStopRrOk === true && row.riskGeometryRequiredStopValid === true) {
    return RISK_LANES.RECALCULATED_STOP_PROOF_READY;
  }
  if (row.riskGeometryTargetAboveCurrent === false || row.riskGeometryRequiredTargetSource) {
    return RISK_LANES.REQUIRED_TARGET_TOO_HIGH;
  }
  if (row.riskGeometryRequiredStopValid === false || row.riskGeometryRequiredStopDistanceValid === false) {
    return RISK_LANES.REQUIRED_STOP_INVALID;
  }
  return RISK_LANES.EVIDENCE_MISSING;
}

function classifyBreakout(input) {
  const row = flatRow(input);
  if (row.breakoutRetestProofConfirmed === true) return BREAKOUT_LANES.PROOF_CONFIRMED_READY;
  if (
    row.breakoutRetestProofReviewReady === true &&
    (row.breakoutRetestProofRetestFresh === false || row.breakoutRetestProofCurrentExtensionOk === false)
  ) {
    return BREAKOUT_LANES.REVIEW_READY_STALE_OR_EXTENDED;
  }
  if (row.breakoutRetestProofReviewReady === true) return BREAKOUT_LANES.REVIEW_READY_BUT_NOT_CONFIRMED;
  return BREAKOUT_LANES.NOT_BREAKOUT_BLOCKED;
}

function classifyStructure(input) {
  const row = flatRow(input);
  const relevant = String(row.zeroExecutableTuningLane || '').includes('STRUCTURE') ||
    String(row.decisionReason || '').includes('structure') ||
    (row.structurePolicyBlockerLane && row.structurePolicyBlockerLane !== 'not_applicable');
  if (!relevant) return STRUCTURE_LANES.NOT_STRUCTURE_BLOCKED;
  if (row.structurePolicyCurrentRrOk === false) return STRUCTURE_LANES.CURRENT_RR_WEAK_KEEP_WAIT;
  if (row.structurePolicyTargetBufferOk === false) return STRUCTURE_LANES.TARGET_BUFFER_WEAK_KEEP_WAIT;
  if (row.currentEntryStructureSupportReference && row.currentEntryStructureSupportGapAtr !== undefined) {
    return STRUCTURE_LANES.STRUCTURE_PROOF_CANDIDATE;
  }
  if (row.structurePolicyBlockerLane && row.structurePolicyBlockerLane !== 'not_applicable') {
    return STRUCTURE_LANES.SUPPORT_PROOF_GAP;
  }
  return STRUCTURE_LANES.NOT_STRUCTURE_BLOCKED;
}

function targetBlockedBy(input) {
  const row = flatRow(input);
  const reasons = asReasons(row.targetRecalibrationViabilityReasons);
  pushIf(reasons, row.targetNoTradeConfirmed === true, 'no_trade_confirmed');
  pushIf(
    reasons,
    String(row.targetRecalibrationViabilityVerdict || '').includes('TARGET_NOT_ABOVE_CURRENT'),
    'target_not_above_current'
  );
  pushIf(
    reasons,
    String(row.targetRecalibrationViabilityVerdict || '').includes('GAP_TOO_WIDE'),
    'required_target_gap_above_policy'
  );
  pushIf(reasons, row.targetRecalibrationExecutionFloorViable === false, 'execution_floor_not_viable');
  pushIf(reasons, row.targetRecalibrationRequiredTargetPrice == null, 'missing_required_target_price');
  pushIf(reasons, row.targetRecalibrationCurrentTargetPrice == null, 'missing_current_target_price');
  pushIf(reasons, row.targetRecalibrationRequiredTargetByExecutionFloorPrice == null, 'missing_execution_floor_target');
  pushIf(reasons, row.targetRecalibrationRequiredTargetByExpectedReturnPrice == null, 'missing_expected_return_target');
  return [...new Set(reasons)];
}

function targetNextAction(row, lane) {
  if (lane === TARGET_LANES.TARGET_NO_TRADE_CONFIRMED) return 'keep_wait_or_no_trade_until_target_recalibration_source_refresh';
  if (lane === TARGET_LANES.TARGET_RECALIBRATION_CANDIDATE) return 'review_recalibrated_target_before_any_execution_lane';
  if (lane === TARGET_LANES.EXECUTION_FLOOR_VIABLE_GAP_WIDE) return 'tighten_expected_return_or_target_gap_policy_evidence';
  if (lane === TARGET_LANES.TARGET_EVIDENCE_MISSING) return 'refresh_target_recalibration_evidence';
  return 'not_applicable';
}

function breakoutBlockedBy(input) {
  const row = flatRow(input);
  const reasons = asReasons(row.breakoutRetestProofReasons);
  pushIf(reasons, row.breakoutRetestProofRetestTouchFound === false, 'retest_touch_missing');
  pushIf(reasons, row.breakoutRetestProofRetestFresh === false, 'retest_stale');
  pushIf(reasons, row.breakoutRetestProofRetestCloseReclaimed === false, 'retest_close_not_reclaimed');
  pushIf(reasons, row.breakoutRetestProofUndercutReclaimFound === false, 'undercut_reclaim_missing');
  pushIf(reasons, row.breakoutRetestProofCurrentExtensionOk === false, 'current_extension_above_policy');
  pushIf(reasons, row.breakoutRetestProofContinuationConfirmed === false, 'continuation_confirmation_missing');
  if (row.breakoutRetestPromotionBlockedBy) {
    reasons.push(...asReasons(row.breakoutRetestPromotionBlockedBy));
  }
  pushIf(reasons, row.breakoutRetestProofConfirmed !== true, 'proof_confirmed_false');
  return [...new Set(reasons)];
}

function breakoutNextAction(row, lane) {
  if (lane === BREAKOUT_LANES.PROOF_CONFIRMED_READY) return 'proof_confirmed_available_keep_promotion_gate_separate';
  if (lane === BREAKOUT_LANES.REVIEW_READY_STALE_OR_EXTENDED) return 'wait_for_fresh_retest_or_current_extension_reset';
  if (lane === BREAKOUT_LANES.REVIEW_READY_BUT_NOT_CONFIRMED) return 'collect_retest_reclaim_continuation_evidence_before_promotion';
  return 'not_applicable';
}

function structureBlockedBy(input) {
  const row = flatRow(input);
  const reasons = asReasons(row.structurePolicyReasons);
  pushIf(reasons, row.structurePolicyCurrentRrOk === false, 'current_rr_below_min');
  pushIf(reasons, row.structurePolicyTargetBufferOk === false, 'target_buffer_below_min');
  pushIf(reasons, row.structurePolicyDistanceWithinReviewBand === false, 'entry_distance_above_review_band');
  pushIf(reasons, !row.currentEntryStructureSupportReference, 'support_reference_missing');
  pushIf(reasons, row.currentEntryStructureSupportGapAtr == null, 'support_gap_atr_missing');
  pushIf(
    reasons,
    String(row.structurePolicyVerdict || '').includes('REJECT') || String(row.currentEntryStructureVerdict || '').includes('REJECT'),
    'explicit_structure_reject'
  );
  return [...new Set(reasons)];
}

function structureNextAction(row, lane) {
  if (lane === STRUCTURE_LANES.CURRENT_RR_WEAK_KEEP_WAIT) return 'keep_wait_until_current_rr_recovers_or_new_structure_forms';
  if (lane === STRUCTURE_LANES.TARGET_BUFFER_WEAK_KEEP_WAIT) return 'keep_wait_until_target_buffer_or_target_recalibration_improves';
  if (lane === STRUCTURE_LANES.SUPPORT_PROOF_GAP) return 'refresh_support_reference_and_stop_alignment_evidence';
  if (lane === STRUCTURE_LANES.STRUCTURE_PROOF_CANDIDATE) return 'review_structure_proof_candidate_without_relaxing_gate';
  return 'not_applicable';
}

function selfCheck() {
  assert.equal(
    classifyTarget({
      symbol: 'DEMO_TARGET',
      zeroExecutableTuningLane: 'TARGET_RECALIBRATION',
      targetRecalibrationExecutionFloorViable: true,
      targetRecalibrationCandidate: false,
      targetNoTradeConfirmed: false
    }),
    TARGET_LANES.EXECUTION_FLOOR_VIABLE_GAP_WIDE
  );
  assert.equal(
    classifyBreakout({
      symbol: 'DEMO_BREAKOUT',
      breakoutRetestProofReviewReady: true,
      breakoutRetestProofConfirmed: false,
      breakoutRetestProofRetestFresh: false,
      breakoutRetestProofCurrentExtensionOk: false
    }),
    BREAKOUT_LANES.REVIEW_READY_STALE_OR_EXTENDED
  );
  assert.deepEqual(
    breakoutBlockedBy({
      symbol: 'DEMO_BREAKOUT_REASON',
      breakoutRetestProofReviewReady: true,
      breakoutRetestProofConfirmed: false,
      breakoutRetestProofRetestFresh: false,
      breakoutRetestProofCurrentExtensionOk: false
    }),
    ['retest_stale', 'current_extension_above_policy', 'proof_confirmed_false']
  );
  assert.deepEqual(
    structureBlockedBy({
      symbol: 'DEMO_STRUCTURE_REASON',
      zeroExecutableTuningLane: 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION',
      structurePolicyCurrentRrOk: false,
      structurePolicyTargetBufferOk: true,
      structurePolicyDistanceWithinReviewBand: false,
      currentEntryStructureSupportReference: null
    }),
    ['current_rr_below_min', 'entry_distance_above_review_band', 'support_reference_missing', 'support_gap_atr_missing']
  );
  assert.equal(
    classifyRisk({
      symbol: 'DEMO_EXECUTABLE_NO_ACTION',
      finalDecision: 'EXECUTABLE_NOW',
      blockerCategory: 'risk_geometry',
      zeroExecutableTuningLane: 'NO_ZERO_EXECUTABLE_TUNING_ACTION',
      riskGeometryPolicyVerdict: 'RISK_GEOMETRY_POLICY_NOT_APPLICABLE',
      riskGeometryRepairLane: 'not_applicable',
      riskGeometryTargetAboveCurrent: false,
      riskGeometryRequiredStopValid: false
    }),
    RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED
  );
}

function relevantRows(inputs) {
  const freshRows = Array.isArray(inputs.freshFocus?.rows) ? inputs.freshFocus.rows : [];
  if (freshRows.length) return freshRows.map((row) => ({ source: 'fresh_focus', ...row }));
  const backlogRows = Array.isArray(inputs.formulaBacklog?.backlogRows) ? inputs.formulaBacklog.backlogRows : [];
  return backlogRows.map((row) => ({ source: 'formula_backlog', ...row }));
}

function buildMarkdown(report) {
  const lines = [
    '# Stage6 Producer Tuning 2 Audit',
    '',
    `- overall: ${report.overall}`,
    `- rows: ${report.summary.rows}`,
    `- generatedAt: ${report.generatedAt}`,
    `- brokerMutationAllowed: ${report.safety.brokerMutationAllowed}`,
    `- sidecarMutationAllowed: ${report.safety.sidecarMutationAllowed}`,
    '',
    '## Lane Counts',
    '',
    `- target: ${JSON.stringify(report.summary.targetLaneCounts)}`,
    `- riskGeometry: ${JSON.stringify(report.summary.riskLaneCounts)}`,
    `- breakout: ${JSON.stringify(report.summary.breakoutLaneCounts)}`,
    `- structure: ${JSON.stringify(report.summary.structureLaneCounts)}`,
    `- targetBlockedBy: ${JSON.stringify(report.summary.targetBlockedByCounts)}`,
    `- breakoutBlockedBy: ${JSON.stringify(report.summary.breakoutBlockedByCounts)}`,
    `- structureBlockedBy: ${JSON.stringify(report.summary.structureBlockedByCounts)}`,
    `- targetNextAction: ${JSON.stringify(report.summary.targetNextActionCounts)}`,
    `- breakoutNextAction: ${JSON.stringify(report.summary.breakoutNextActionCounts)}`,
    `- structureNextAction: ${JSON.stringify(report.summary.structureNextActionCounts)}`,
    '',
    '## Done-When Evidence',
    '',
    `- targetSplitReady: ${report.summary.doneWhenEvidence.targetSplitReady}`,
    `- breakoutReviewExplained: ${report.summary.doneWhenEvidence.breakoutReviewExplained}`,
    `- structureProofExplained: ${report.summary.doneWhenEvidence.structureProofExplained}`,
    `- brokerMutationAttempted: ${report.summary.doneWhenEvidence.brokerMutationAttempted}`,
    `- brokerMutationSubmitted: ${report.summary.doneWhenEvidence.brokerMutationSubmitted}`,
    '',
    '## Rows',
    '',
    '| Symbol | Decision | Zero Lane | Target | Target BlockedBy | Target Next | Breakout | Breakout BlockedBy | Breakout Next | Structure | Structure BlockedBy | Structure Next | Risk |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'
  ];
  for (const row of report.rows) {
    lines.push(
      `| ${row.symbol || 'N/A'} | ${row.finalDecision || 'N/A'}/${row.decisionReason || 'N/A'} | ${row.zeroExecutableTuningLane || 'N/A'} | ${row.targetLane} | ${row.targetBlockedBy.join(', ') || 'none'} | ${row.targetNextAction} | ${row.breakoutLane} | ${row.breakoutBlockedBy.join(', ') || 'none'} | ${row.breakoutNextAction} | ${row.structureLane} | ${row.structureBlockedBy.join(', ') || 'none'} | ${row.structureNextAction} | ${row.riskLane} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  selfCheck();
  const inputWarnings = [];
  const inputs = Object.fromEntries(
    Object.entries(INPUTS).map(([label, filePath]) => [label, readJsonIfPresent(label, filePath, inputWarnings)])
  );
  const rows = relevantRows(inputs).map((raw) => {
    const row = flatRow(raw);
    const targetLane = classifyTarget(row);
    const riskLane = classifyRisk(row);
    const breakoutLane = classifyBreakout(row);
    const structureLane = classifyStructure(row);
    const targetReasons = targetLane === TARGET_LANES.NOT_TARGET_BLOCKED ? [] : targetBlockedBy(row);
    const breakoutReasons =
      breakoutLane === BREAKOUT_LANES.NOT_BREAKOUT_BLOCKED || breakoutLane === BREAKOUT_LANES.PROOF_CONFIRMED_READY
        ? []
        : breakoutBlockedBy(row);
    const structureReasons = structureLane === STRUCTURE_LANES.NOT_STRUCTURE_BLOCKED ? [] : structureBlockedBy(row);
    return {
      symbol: row.symbol,
      source: raw.source,
      verdict: row.verdict || null,
      finalDecision: row.finalDecision || null,
      decisionReason: row.decisionReason || null,
      zeroExecutableTuningLane: row.zeroExecutableTuningLane || null,
      targetLane,
      riskLane,
      breakoutLane,
      structureLane,
      targetBlockedBy: targetReasons,
      riskBlockedBy: [
        ...(riskLane !== RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED && row.riskGeometryTargetAboveCurrent === false ? ['target_not_above_current'] : []),
        ...(riskLane !== RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED && row.riskGeometryRequiredStopValid === false ? ['required_stop_invalid'] : []),
        ...(riskLane !== RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED && row.riskGeometryRequiredStopDistanceValid === false ? ['required_stop_distance_invalid'] : []),
        ...(riskLane !== RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED && row.riskGeometryRecalculatedStopRrOk === false ? ['recalculated_stop_rr_below_min'] : []),
        ...(riskLane !== RISK_LANES.NOT_RISK_GEOMETRY_BLOCKED && row.riskGeometryTargetBufferOk === false ? ['target_buffer_below_min'] : [])
      ],
      breakoutBlockedBy: breakoutReasons,
      structureBlockedBy: structureReasons,
      targetNextAction: targetNextAction(row, targetLane),
      breakoutNextAction: breakoutNextAction(row, breakoutLane),
      structureNextAction: structureNextAction(row, structureLane),
      targetRecalibrationViabilityVerdict: row.targetRecalibrationViabilityVerdict || null,
      targetRecalibrationRequiredTargetPrice: row.targetRecalibrationRequiredTargetPrice ?? null,
      targetRecalibrationCurrentTargetPrice: row.targetRecalibrationCurrentTargetPrice ?? null,
      targetRecalibrationRequiredTargetByExecutionFloorPrice:
        row.targetRecalibrationRequiredTargetByExecutionFloorPrice ?? null,
      targetRecalibrationRequiredTargetByExpectedReturnPrice:
        row.targetRecalibrationRequiredTargetByExpectedReturnPrice ?? null,
      targetRecalibrationExecutionFloorViable: row.targetRecalibrationExecutionFloorViable ?? null,
      riskGeometryPolicyVerdict: row.riskGeometryPolicyVerdict || null,
      breakoutRetestProofConfirmed: row.breakoutRetestProofConfirmed ?? null,
      breakoutRetestProofReviewReady: row.breakoutRetestProofReviewReady ?? null,
      breakoutRetestProofRetestFresh: row.breakoutRetestProofRetestFresh ?? null,
      breakoutRetestProofCurrentExtensionOk: row.breakoutRetestProofCurrentExtensionOk ?? null,
      breakoutRetestProofContinuationConfirmed: row.breakoutRetestProofContinuationConfirmed ?? null,
      structurePolicyBlockerLane: row.structurePolicyBlockerLane || null
    };
  });
  const targetRows = rows.filter((row) => row.targetLane !== TARGET_LANES.NOT_TARGET_BLOCKED);
  const breakoutRows = rows.filter((row) => row.breakoutLane !== BREAKOUT_LANES.NOT_BREAKOUT_BLOCKED);
  const structureRows = rows.filter((row) => row.structureLane !== STRUCTURE_LANES.NOT_STRUCTURE_BLOCKED);
  const report = {
    generatedAt: new Date().toISOString(),
    overall: inputWarnings.length ? 'warn_missing_inputs_report_only' : 'pass_report_only',
    inputs: Object.fromEntries(Object.entries(INPUTS).map(([label, filePath]) => [label, { path: filePath, present: !!inputs[label] }])),
    inputWarnings,
    summary: {
      rows: rows.length,
      targetLaneCounts: countBy(rows, 'targetLane'),
      riskLaneCounts: countBy(rows, 'riskLane'),
      breakoutLaneCounts: countBy(rows, 'breakoutLane'),
      structureLaneCounts: countBy(rows, 'structureLane'),
      targetBlockedByCounts: countListValues(rows, 'targetBlockedBy'),
      breakoutBlockedByCounts: countListValues(rows, 'breakoutBlockedBy'),
      structureBlockedByCounts: countListValues(rows, 'structureBlockedBy'),
      targetNextActionCounts: countBy(rows, 'targetNextAction'),
      breakoutNextActionCounts: countBy(rows, 'breakoutNextAction'),
      structureNextActionCounts: countBy(rows, 'structureNextAction'),
      doneWhenEvidence: {
        targetSplitReady: targetRows.every((row) => row.targetBlockedBy.length > 0 && row.targetNextAction !== 'not_applicable'),
        breakoutReviewExplained: breakoutRows.every((row) => row.breakoutBlockedBy.length > 0 || row.breakoutRetestProofConfirmed === true),
        structureProofExplained: structureRows.every((row) => row.structureBlockedBy.length > 0 && row.structureNextAction !== 'not_applicable'),
        brokerMutationAttempted: false,
        brokerMutationSubmitted: false
      }
    },
    rows,
    safety: {
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      executionPolicyChanged: false,
      zeroExecutableFilterRelaxation: false
    }
  };
  ensureParent(OUT_JSON);
  fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  ensureParent(OUT_MD);
  fs.writeFileSync(resolveRepo(OUT_MD), buildMarkdown(report));
  console.log(`[STAGE6_PRODUCER_TUNING_2_AUDIT] overall=${report.overall} rows=${rows.length} json=${OUT_JSON}`);
}

main();
