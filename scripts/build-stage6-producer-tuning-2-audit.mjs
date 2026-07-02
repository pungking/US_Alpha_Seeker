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
    '',
    '## Rows',
    '',
    '| Symbol | Decision | Zero Lane | Target | Risk | Breakout | Structure |',
    '|---|---|---|---|---|---|---|'
  ];
  for (const row of report.rows) {
    lines.push(
      `| ${row.symbol || 'N/A'} | ${row.finalDecision || 'N/A'}/${row.decisionReason || 'N/A'} | ${row.zeroExecutableTuningLane || 'N/A'} | ${row.targetLane} | ${row.riskLane} | ${row.breakoutLane} | ${row.structureLane} |`
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
    return {
      symbol: row.symbol,
      source: raw.source,
      verdict: row.verdict || null,
      finalDecision: row.finalDecision || null,
      decisionReason: row.decisionReason || null,
      zeroExecutableTuningLane: row.zeroExecutableTuningLane || null,
      targetLane: classifyTarget(row),
      riskLane: classifyRisk(row),
      breakoutLane: classifyBreakout(row),
      structureLane: classifyStructure(row),
      targetRecalibrationViabilityVerdict: row.targetRecalibrationViabilityVerdict || null,
      riskGeometryPolicyVerdict: row.riskGeometryPolicyVerdict || null,
      breakoutRetestProofConfirmed: row.breakoutRetestProofConfirmed ?? null,
      structurePolicyBlockerLane: row.structurePolicyBlockerLane || null
    };
  });
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
      structureLaneCounts: countBy(rows, 'structureLane')
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
