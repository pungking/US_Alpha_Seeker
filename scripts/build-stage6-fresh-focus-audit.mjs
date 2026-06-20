#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = process.env.STAGE6_FOCUS_AUDIT_OUT_JSON || 'state/stage6-fresh-focus-audit.json';
const OUT_MD = process.env.STAGE6_FOCUS_AUDIT_OUT_MD || 'docs/STAGE6_FRESH_FOCUS_AUDIT.md';
const REQUIRED_FORMULA_FIELDS = [
  'zeroExecutableFormulaBottleneck',
  'zeroExecutableFormulaSeverity',
  'zeroExecutableTargetShortfallPct',
  'zeroExecutableRiskTargetShortfallPct',
  'zeroExecutableBreakoutProofGapCount',
  'zeroExecutableStructureProofGapCount',
  'zeroExecutableFormulaObservedValue',
  'zeroExecutableFormulaThresholdValue',
  'zeroExecutableFormulaDeltaValue',
  'zeroExecutableFormulaUnit',
  'zeroExecutableFormulaEvidenceBasis',
  'zeroExecutableFormulaAdjustmentKnob',
  'zeroExecutableFormulaAdjustmentDirection',
  'zeroExecutableFormulaAdjustmentMagnitude',
  'zeroExecutableFormulaAdjustmentRationale',
  'zeroExecutableFormulaReasons',
  'zeroExecutableFormulaRecommendedAction'
];
const EXPECTED_FORMULA_CONTRACT = {
  version: 'zero_executable_formula_v3',
  laneToBottleneck: {
    TARGET_RECALIBRATION: 'TARGET_RECALIBRATION_FORMULA',
    STOP_TARGET_RISK_GEOMETRY_RECALCULATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
    RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
    BREAKOUT_PROOF_CONFIRMED_GENERATION: 'BREAKOUT_PROOF_FORMULA',
    STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: 'STRUCTURE_PROOF_FORMULA',
    NO_ZERO_EXECUTABLE_TUNING_ACTION: 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK'
  }
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE6_FOCUS_AUDIT_STAGE6_PATH) return process.env.STAGE6_FOCUS_AUDIT_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE6_FOCUS_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}`);
  return files[0].full;
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function decisionOf(row) {
  return String(row?.finalDecision || row?.decision || 'UNKNOWN').trim().toUpperCase();
}

function reasonOf(row) {
  return String(row?.decisionReason || row?.executionReason || 'unknown').trim().toLowerCase();
}

function verdictOf(row) {
  return String(row?.verdict || row?.aiVerdict || row?.finalVerdict || row?.verdictFinal || 'UNKNOWN').trim().toUpperCase();
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function uniqueRows(stage6) {
  const contract = stage6?.execution_contract || {};
  const sourceGroups = [
    // Final executable contract must win over any raw model row.
    ...(Array.isArray(contract.executablePicks) ? contract.executablePicks.map((row) => [row, 50]) : []),
    // `alpha_candidates` is the final exported candidate surface and can downgrade
    // raw model EXECUTABLE_NOW rows after late geometry gates.
    ...(Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates.map((row) => [row, 40]) : []),
    ...(Array.isArray(contract.watchlistTop) ? contract.watchlistTop.map((row) => [row, 30]) : []),
    ...(Array.isArray(contract.modelTop6) ? contract.modelTop6.map((row) => [row, 20]) : []),
    ...(Array.isArray(stage6?.candidates) ? stage6.candidates.map((row) => [row, 10]) : [])
  ];
  const bySymbol = new Map();
  for (const [row, sourcePriority] of sourceGroups) {
    const symbol = normalizeSymbol(row);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || sourcePriority > existing.sourcePriority) {
      bySymbol.set(symbol, { row, sourcePriority });
    }
  }
  return [...bySymbol.values()].map((entry) => entry.row);
}

function rawExecutableDowngrades(stage6) {
  const contract = stage6?.execution_contract || {};
  const finalRows = uniqueRows(stage6);
  const finalBySymbol = new Map(finalRows.map((row) => [normalizeSymbol(row), row]));
  const modelTop6 = Array.isArray(contract.modelTop6) ? contract.modelTop6 : [];
  return modelTop6
    .filter((row) => decisionOf(row) === 'EXECUTABLE_NOW')
    .map((row) => {
      const symbol = normalizeSymbol(row);
      const finalRow = finalBySymbol.get(symbol);
      const finalDecision = finalRow ? decisionOf(finalRow) : 'MISSING_FROM_FINAL_SURFACE';
      return {
        symbol,
        rawDecision: decisionOf(row),
        rawReason: reasonOf(row),
        rawEntryExecPrice: numberOrNull(row?.entryExecPrice ?? row?.entryExecPriceShadow),
        rawStopPrice: numberOrNull(row?.stopPrice ?? row?.stopLoss ?? row?.ictStopLoss),
        finalDecision,
        finalReason: finalRow ? reasonOf(finalRow) : 'missing_from_final_surface',
        finalEntryExecPrice: numberOrNull(finalRow?.entryExecPrice ?? finalRow?.entryExecPriceShadow),
        finalStopPrice: numberOrNull(finalRow?.stopPrice ?? finalRow?.stopLoss ?? finalRow?.ictStopLoss),
        currentEntryRequiredStopPrice: numberOrNull(finalRow?.currentEntryRequiredStopPrice),
        currentEntryRecalcFeasible: finalRow?.currentEntryRecalcFeasible ?? null,
        riskGeometryPolicyVerdict: finalRow?.riskGeometryPolicyVerdict || null,
        riskGeometryProofReasons: Array.isArray(finalRow?.riskGeometryProofReasons) ? finalRow.riskGeometryProofReasons : []
      };
    })
    .filter((row) => row.finalDecision !== 'EXECUTABLE_NOW');
}

function qualityGateLane(row) {
  if (row?.qualityGateLane && row.qualityGateLane !== 'not_applicable') return row.qualityGateLane;
  const reason = reasonOf(row);
  if (reason === 'wait_earnings_data_missing_quality_floor' || reason === 'wait_earnings_data_missing') return 'earnings_data_coverage';
  if (reason === 'wait_verdict_not_sidecar_actionable') return 'non_actionable_verdict';
  if (reason === 'blocked_quality_verdict_unusable') return 'verdict_unusable';
  if (reason === 'blocked_quality_conviction_floor') return 'conviction_floor';
  if (reason === 'blocked_quality_missing_expected_return') return 'expected_return_missing';
  if (reason.startsWith('blocked_quality_')) return 'quality_gate_other';
  return null;
}

function blockerCategory(row) {
  const reason = reasonOf(row);
  if (reason.includes('structure')) return 'structure';
  if (reason.includes('breakout') || reason.includes('retest')) return 'breakout';
  if (reason.includes('target')) return 'target_recalibration';
  if (reason.includes('earnings') || reason.includes('quality') || reason.includes('verdict')) return 'quality_gate';
  if (reason.includes('rr') || reason.includes('stop') || reason.includes('geometry')) return 'risk_geometry';
  if (reason.includes('pullback') || reason.includes('distance')) return 'entry_distance';
  return 'other';
}

function expectedFormulaBottleneck(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  if (lane === 'TARGET_RECALIBRATION') return 'TARGET_RECALIBRATION_FORMULA';
  if (lane === 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION' || lane === 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION') {
    return 'RISK_GEOMETRY_RECALCULATION_FORMULA';
  }
  if (lane === 'BREAKOUT_PROOF_CONFIRMED_GENERATION') return 'BREAKOUT_PROOF_FORMULA';
  if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') return 'STRUCTURE_PROOF_FORMULA';
  if (lane === 'NO_ZERO_EXECUTABLE_TUNING_ACTION') return 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK';
  return null;
}

function formulaLaneConsistencyIssue(row) {
  const expected = expectedFormulaBottleneck(row);
  if (!expected) return null;
  const actual = String(row?.zeroExecutableFormulaBottleneck || '').trim().toUpperCase();
  if (actual === expected) return null;
  return {
    symbol: normalizeSymbol(row),
    zeroExecutableTuningLane: row?.zeroExecutableTuningLane || null,
    expectedFormulaBottleneck: expected,
    actualFormulaBottleneck: row?.zeroExecutableFormulaBottleneck || null,
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row)
  };
}

function formulaEvidenceQualityIssue(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const bottleneck = String(row?.zeroExecutableFormulaBottleneck || '').trim().toUpperCase();
  const severity = numberOrNull(row?.zeroExecutableFormulaSeverity);
  const targetShortfall = numberOrNull(row?.zeroExecutableTargetShortfallPct);
  const riskShortfall = numberOrNull(row?.zeroExecutableRiskTargetShortfallPct);
  const breakoutGaps = numberOrNull(row?.zeroExecutableBreakoutProofGapCount);
  const structureGaps = numberOrNull(row?.zeroExecutableStructureProofGapCount);
  const observedValue = numberOrNull(row?.zeroExecutableFormulaObservedValue);
  const thresholdValue = numberOrNull(row?.zeroExecutableFormulaThresholdValue);
  const deltaValue = numberOrNull(row?.zeroExecutableFormulaDeltaValue);
  const unit = String(row?.zeroExecutableFormulaUnit || '').trim();
  const evidenceBasis = String(row?.zeroExecutableFormulaEvidenceBasis || '').trim();
  const adjustmentKnob = String(row?.zeroExecutableFormulaAdjustmentKnob || '').trim();
  const adjustmentDirection = String(row?.zeroExecutableFormulaAdjustmentDirection || '').trim();
  const adjustmentMagnitude = numberOrNull(row?.zeroExecutableFormulaAdjustmentMagnitude);
  const adjustmentRationale = String(row?.zeroExecutableFormulaAdjustmentRationale || '').trim();
  const reasons = stringArray(row?.zeroExecutableFormulaReasons);
  const action = String(row?.zeroExecutableFormulaRecommendedAction || '').trim();
  const issueReasons = [];

  if (!Number.isFinite(severity)) issueReasons.push('formula_severity_missing');
  if (!Number.isFinite(observedValue)) issueReasons.push('formula_observed_value_missing');
  if (!Number.isFinite(thresholdValue)) issueReasons.push('formula_threshold_value_missing');
  if (!Number.isFinite(deltaValue)) issueReasons.push('formula_delta_value_missing');
  if (!unit) issueReasons.push('formula_unit_missing');
  if (!evidenceBasis) issueReasons.push('formula_evidence_basis_missing');
  if (!adjustmentKnob) issueReasons.push('formula_adjustment_knob_missing');
  if (!adjustmentDirection) issueReasons.push('formula_adjustment_direction_missing');
  if (!Number.isFinite(adjustmentMagnitude)) issueReasons.push('formula_adjustment_magnitude_missing');
  if (!adjustmentRationale) issueReasons.push('formula_adjustment_rationale_missing');
  if (reasons.length === 0) issueReasons.push('formula_reasons_missing');
  if (!action) issueReasons.push('formula_recommended_action_missing');

  if (lane === 'TARGET_RECALIBRATION' && !(targetShortfall != null && targetShortfall > 0)) {
    issueReasons.push('target_shortfall_not_positive');
  }
  if (lane === 'TARGET_RECALIBRATION' && !(observedValue != null && observedValue > 0 && deltaValue != null && deltaValue > 0)) {
    issueReasons.push('target_observed_delta_not_positive');
  }
  if (lane === 'TARGET_RECALIBRATION' && !adjustmentKnob.includes('TARGET_RECALIBRATION')) {
    issueReasons.push('target_adjustment_knob_missing');
  }
  if (
    (lane === 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION' || lane === 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION') &&
    !(severity != null && severity > 0 && reasons.some((reason) => /risk|stop|target|geometry|recalculated|proof/i.test(reason)))
  ) {
    issueReasons.push('risk_geometry_formula_evidence_weak');
  }
  if (
    (lane === 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION' || lane === 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION') &&
    !(observedValue != null && observedValue > 0 && deltaValue != null && deltaValue > 0)
  ) {
    issueReasons.push('risk_geometry_observed_delta_not_positive');
  }
  if (
    (lane === 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION' || lane === 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION') &&
    !/RISK_GEOMETRY|CURRENT_ENTRY_RECALCULATED_STOP/.test(adjustmentKnob)
  ) {
    issueReasons.push('risk_geometry_adjustment_knob_missing');
  }
  if (lane === 'BREAKOUT_PROOF_CONFIRMED_GENERATION' && !(breakoutGaps != null && breakoutGaps > 0)) {
    issueReasons.push('breakout_proof_gap_count_not_positive');
  }
  if (lane === 'BREAKOUT_PROOF_CONFIRMED_GENERATION' && !(observedValue != null && observedValue > 0 && deltaValue != null && deltaValue > 0)) {
    issueReasons.push('breakout_observed_delta_not_positive');
  }
  if (lane === 'BREAKOUT_PROOF_CONFIRMED_GENERATION' && !adjustmentKnob.includes('BREAKOUT')) {
    issueReasons.push('breakout_adjustment_knob_missing');
  }
  if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION' && !(structureGaps != null && structureGaps > 0)) {
    issueReasons.push('structure_proof_gap_count_not_positive');
  }
  if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION' && !(observedValue != null && observedValue > 0 && deltaValue != null && deltaValue > 0)) {
    issueReasons.push('structure_observed_delta_not_positive');
  }
  if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION' && !adjustmentKnob.includes('STRUCTURE')) {
    issueReasons.push('structure_adjustment_knob_missing');
  }
  if (lane === 'NO_ZERO_EXECUTABLE_TUNING_ACTION') {
    if (bottleneck !== 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK') issueReasons.push('no_action_bottleneck_not_neutral');
    if (severity !== 0) issueReasons.push('no_action_severity_not_zero');
    if (observedValue !== 0 || deltaValue !== 0) issueReasons.push('no_action_observed_delta_not_zero');
    if (adjustmentKnob !== 'NONE') issueReasons.push('no_action_adjustment_knob_not_none');
    if ((targetShortfall != null && targetShortfall > 0) || (riskShortfall != null && riskShortfall > 0) || (breakoutGaps != null && breakoutGaps > 0) || (structureGaps != null && structureGaps > 0)) {
      issueReasons.push('no_action_has_positive_formula_gap');
    }
  }
  if (issueReasons.length === 0) return null;
  return {
    symbol: normalizeSymbol(row),
    zeroExecutableTuningLane: row?.zeroExecutableTuningLane || null,
    zeroExecutableFormulaBottleneck: row?.zeroExecutableFormulaBottleneck || null,
    zeroExecutableFormulaSeverity: severity,
    zeroExecutableFormulaObservedValue: observedValue,
    zeroExecutableFormulaThresholdValue: thresholdValue,
    zeroExecutableFormulaDeltaValue: deltaValue,
    zeroExecutableFormulaUnit: unit || null,
    zeroExecutableFormulaEvidenceBasis: evidenceBasis || null,
    zeroExecutableFormulaAdjustmentKnob: adjustmentKnob || null,
    zeroExecutableFormulaAdjustmentDirection: adjustmentDirection || null,
    zeroExecutableFormulaAdjustmentMagnitude: adjustmentMagnitude,
    zeroExecutableFormulaAdjustmentRationale: adjustmentRationale || null,
    issueReasons,
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row)
  };
}

function laneSpecificFormulaEvidenceIssue(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const zeroBasis = String(row?.zeroExecutableFormulaEvidenceBasis || '').trim();
  const issueReasons = [];
  const requireBasisMatch = (fieldName) => {
    const basis = String(row?.[fieldName] || '').trim();
    if (!basis) {
      issueReasons.push(`${fieldName}_missing`);
      return;
    }
    if (zeroBasis && basis !== zeroBasis) {
      issueReasons.push(`${fieldName}_mismatch_zero_executable_basis`);
    }
  };
  const requirePositiveFormulaTriplet = (prefix) => {
    const observed = numberOrNull(row?.[`${prefix}FormulaObservedValue`]);
    const threshold = numberOrNull(row?.[`${prefix}FormulaThresholdValue`]);
    const delta = numberOrNull(row?.[`${prefix}FormulaDeltaValue`]);
    const unit = String(row?.[`${prefix}FormulaUnit`] || '').trim();
    if (observed == null || observed <= 0) issueReasons.push(`${prefix}FormulaObservedValue_not_positive`);
    if (threshold == null) issueReasons.push(`${prefix}FormulaThresholdValue_missing`);
    if (delta == null || delta <= 0) issueReasons.push(`${prefix}FormulaDeltaValue_not_positive`);
    if (!unit) issueReasons.push(`${prefix}FormulaUnit_missing`);
  };

  if (lane === 'TARGET_RECALIBRATION') {
    requireBasisMatch('targetRecalibrationFormulaEvidenceBasis');
    requirePositiveFormulaTriplet('targetRecalibration');
  } else if (lane === 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION' || lane === 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION') {
    requireBasisMatch('riskGeometryFormulaEvidenceBasis');
    requirePositiveFormulaTriplet('riskGeometry');
  } else if (lane === 'BREAKOUT_PROOF_CONFIRMED_GENERATION') {
    requireBasisMatch('breakoutRetestProofFormulaEvidenceBasis');
    requirePositiveFormulaTriplet('breakoutRetestProof');
  } else if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') {
    requireBasisMatch('structurePolicyFormulaEvidenceBasis');
  }

  if (issueReasons.length === 0) return null;
  return {
    symbol: normalizeSymbol(row),
    zeroExecutableTuningLane: row?.zeroExecutableTuningLane || null,
    zeroExecutableFormulaEvidenceBasis: zeroBasis || null,
    targetRecalibrationFormulaEvidenceBasis: row?.targetRecalibrationFormulaEvidenceBasis || null,
    riskGeometryFormulaEvidenceBasis: row?.riskGeometryFormulaEvidenceBasis || null,
    breakoutRetestProofFormulaEvidenceBasis: row?.breakoutRetestProofFormulaEvidenceBasis || null,
    structurePolicyFormulaEvidenceBasis: row?.structurePolicyFormulaEvidenceBasis || null,
    issueReasons,
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row)
  };
}

function formulaManifestContractIssues(stage6) {
  const contract = stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract || stage6?.decisionGate?.zeroExecutableFormulaContract || null;
  if (!contract || typeof contract !== 'object') {
    return [{ issue: 'formula_contract_missing', path: 'manifest.decisionGate.zeroExecutableFormulaContract' }];
  }
  const issues = [];
  if (contract.version !== EXPECTED_FORMULA_CONTRACT.version) {
    issues.push({
      issue: 'formula_contract_version_mismatch',
      expected: EXPECTED_FORMULA_CONTRACT.version,
      actual: contract.version || null
    });
  }
  const requiredFields = new Set(Array.isArray(contract.requiredRowFields) ? contract.requiredRowFields : []);
  for (const field of REQUIRED_FORMULA_FIELDS) {
    if (!requiredFields.has(field)) {
      issues.push({ issue: 'formula_contract_required_field_missing', field });
    }
  }
  const laneMap = contract.laneToBottleneck || {};
  for (const [lane, expected] of Object.entries(EXPECTED_FORMULA_CONTRACT.laneToBottleneck)) {
    if (laneMap[lane] !== expected) {
      issues.push({
        issue: 'formula_contract_lane_mapping_mismatch',
        lane,
        expected,
        actual: laneMap[lane] || null
      });
    }
  }
  const evidenceRules = contract.evidenceRules || {};
  for (const lane of Object.keys(EXPECTED_FORMULA_CONTRACT.laneToBottleneck)) {
    if (!String(evidenceRules[lane] || '').trim()) {
      issues.push({ issue: 'formula_contract_evidence_rule_missing', lane });
    }
  }
  return issues;
}

function requiredFieldCoverage(rows, field) {
  return {
    present: rows.filter((row) => Object.prototype.hasOwnProperty.call(row, field)).length,
    total: rows.length
  };
}

function compactRow(row) {
  return {
    symbol: normalizeSymbol(row),
    verdict: verdictOf(row),
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row),
    blockerCategory: blockerCategory(row),
    qualityGateLane: qualityGateLane(row),
    qualityGatePolicyVerdict: row?.qualityGatePolicyVerdict || null,
    zeroExecutableTuningLane: row?.zeroExecutableTuningLane || null,
    zeroExecutableTuningVerdict: row?.zeroExecutableTuningVerdict || null,
    zeroExecutableFormulaBottleneck: row?.zeroExecutableFormulaBottleneck || null,
    zeroExecutableFormulaSeverity: numberOrNull(row?.zeroExecutableFormulaSeverity),
    zeroExecutableTargetShortfallPct: numberOrNull(row?.zeroExecutableTargetShortfallPct),
    zeroExecutableRiskTargetShortfallPct: numberOrNull(row?.zeroExecutableRiskTargetShortfallPct),
    zeroExecutableBreakoutProofGapCount: numberOrNull(row?.zeroExecutableBreakoutProofGapCount),
    zeroExecutableStructureProofGapCount: numberOrNull(row?.zeroExecutableStructureProofGapCount),
    zeroExecutableFormulaObservedValue: numberOrNull(row?.zeroExecutableFormulaObservedValue),
    zeroExecutableFormulaThresholdValue: numberOrNull(row?.zeroExecutableFormulaThresholdValue),
    zeroExecutableFormulaDeltaValue: numberOrNull(row?.zeroExecutableFormulaDeltaValue),
    zeroExecutableFormulaUnit: row?.zeroExecutableFormulaUnit || null,
    zeroExecutableFormulaEvidenceBasis: row?.zeroExecutableFormulaEvidenceBasis || null,
    zeroExecutableFormulaAdjustmentKnob: row?.zeroExecutableFormulaAdjustmentKnob || null,
    zeroExecutableFormulaAdjustmentDirection: row?.zeroExecutableFormulaAdjustmentDirection || null,
    zeroExecutableFormulaAdjustmentMagnitude: numberOrNull(row?.zeroExecutableFormulaAdjustmentMagnitude),
    zeroExecutableFormulaAdjustmentRationale: row?.zeroExecutableFormulaAdjustmentRationale || null,
    breakoutRetestProofConfirmed: row?.breakoutRetestProofConfirmed ?? null,
    breakoutRetestProofReviewReady: row?.breakoutRetestProofReviewReady ?? null,
    breakoutRetestProofContinuationConfirmed: row?.breakoutRetestProofContinuationConfirmed ?? null,
    breakoutRetestProofMaxContinuationExtensionPct: numberOrNull(row?.breakoutRetestProofMaxContinuationExtensionPct),
    breakoutRetestProofContinuationMinRr: numberOrNull(row?.breakoutRetestProofContinuationMinRr),
    breakoutRetestProofContinuationMinTargetBufferPct: numberOrNull(row?.breakoutRetestProofContinuationMinTargetBufferPct),
    breakoutRetestProofFormulaEvidenceBasis: row?.breakoutRetestProofFormulaEvidenceBasis || null,
    breakoutRetestProofFormulaObservedValue: numberOrNull(row?.breakoutRetestProofFormulaObservedValue),
    breakoutRetestProofFormulaThresholdValue: numberOrNull(row?.breakoutRetestProofFormulaThresholdValue),
    breakoutRetestProofFormulaDeltaValue: numberOrNull(row?.breakoutRetestProofFormulaDeltaValue),
    breakoutRetestProofFormulaUnit: row?.breakoutRetestProofFormulaUnit || null,
    breakoutRetestPromotionVerdict: row?.breakoutRetestPromotionVerdict || null,
    breakoutRetestPromotionReady: row?.breakoutRetestPromotionReady ?? null,
    breakoutRetestPromotionPolicyDecision: row?.breakoutRetestPromotionPolicyDecision || null,
    breakoutRetestPromotionBlockedBy: Array.isArray(row?.breakoutRetestPromotionBlockedBy) ? row.breakoutRetestPromotionBlockedBy : [],
    targetRecalibrationVerdict: row?.targetRecalibrationVerdict || null,
    targetRecalibrationCandidate: row?.targetRecalibrationCandidate ?? null,
    targetNoTradeConfirmed: row?.targetNoTradeConfirmed ?? null,
    targetRecalibrationViabilityVerdict: row?.targetRecalibrationViabilityVerdict || null,
    targetRecalibrationCurrentTargetGapPct: numberOrNull(row?.targetRecalibrationCurrentTargetGapPct),
    targetRecalibrationRequiredTargetByBufferPrice: numberOrNull(row?.targetRecalibrationRequiredTargetByBufferPrice),
    targetRecalibrationRequiredTargetByRrPrice: numberOrNull(row?.targetRecalibrationRequiredTargetByRrPrice),
    targetRecalibrationRequiredTargetByExpectedReturnPrice: numberOrNull(row?.targetRecalibrationRequiredTargetByExpectedReturnPrice),
    targetRecalibrationSourcePrice: numberOrNull(row?.targetRecalibrationSourcePrice),
    targetRecalibrationSourceStopPrice: numberOrNull(row?.targetRecalibrationSourceStopPrice),
    targetRecalibrationStopDistanceAtCurrent: numberOrNull(row?.targetRecalibrationStopDistanceAtCurrent),
    targetRecalibrationRequiredTargetSource: row?.targetRecalibrationRequiredTargetSource || null,
    targetRecalibrationFormulaEvidenceBasis: row?.targetRecalibrationFormulaEvidenceBasis || null,
    targetRecalibrationFormulaObservedValue: numberOrNull(row?.targetRecalibrationFormulaObservedValue),
    targetRecalibrationFormulaThresholdValue: numberOrNull(row?.targetRecalibrationFormulaThresholdValue),
    targetRecalibrationFormulaDeltaValue: numberOrNull(row?.targetRecalibrationFormulaDeltaValue),
    targetRecalibrationFormulaUnit: row?.targetRecalibrationFormulaUnit || null,
    targetRecalibrationRiskBasisStopDistancePct: numberOrNull(row?.targetRecalibrationRiskBasisStopDistancePct),
    targetRecalibrationShortfallPct: numberOrNull(row?.targetRecalibrationShortfallPct),
    riskGeometryPolicyVerdict: row?.riskGeometryPolicyVerdict || null,
    riskGeometryRequiredTargetPrice: numberOrNull(row?.riskGeometryRequiredTargetPrice),
    riskGeometryRequiredTargetByStopPrice: numberOrNull(row?.riskGeometryRequiredTargetByStopPrice),
    riskGeometryRequiredTargetByBufferPrice: numberOrNull(row?.riskGeometryRequiredTargetByBufferPrice),
    riskGeometryRequiredTargetByExpectedReturnPrice: numberOrNull(row?.riskGeometryRequiredTargetByExpectedReturnPrice),
    riskGeometryRequiredTargetSource: row?.riskGeometryRequiredTargetSource || null,
    riskGeometryRequiredTargetBufferPct: numberOrNull(row?.riskGeometryRequiredTargetBufferPct),
    riskGeometryTargetGapPct: numberOrNull(row?.riskGeometryTargetGapPct),
    riskGeometryTargetShortfallPct: numberOrNull(row?.riskGeometryTargetShortfallPct),
    riskGeometryTargetRecalibrationCandidate: row?.riskGeometryTargetRecalibrationCandidate ?? null,
    riskGeometryTargetAboveCurrent: row?.riskGeometryTargetAboveCurrent ?? null,
    riskGeometryRequiredStopValid: row?.riskGeometryRequiredStopValid ?? null,
    riskGeometryRequiredStopDistanceValid: row?.riskGeometryRequiredStopDistanceValid ?? null,
    riskGeometryRecalculatedStopRrOk: row?.riskGeometryRecalculatedStopRrOk ?? null,
    riskGeometryTargetBufferOk: row?.riskGeometryTargetBufferOk ?? null,
    riskGeometryRepairLane: row?.riskGeometryRepairLane || null,
    riskGeometryProofConfirmed: row?.riskGeometryProofConfirmed ?? null,
    riskGeometryFormulaEvidenceBasis: row?.riskGeometryFormulaEvidenceBasis || null,
    riskGeometryFormulaObservedValue: numberOrNull(row?.riskGeometryFormulaObservedValue),
    riskGeometryFormulaThresholdValue: numberOrNull(row?.riskGeometryFormulaThresholdValue),
    riskGeometryFormulaDeltaValue: numberOrNull(row?.riskGeometryFormulaDeltaValue),
    riskGeometryFormulaUnit: row?.riskGeometryFormulaUnit || null,
    structurePolicyBlockerLane: row?.structurePolicyBlockerLane || null,
    structurePolicyFormulaEvidenceBasis: row?.structurePolicyFormulaEvidenceBasis || null,
    structurePolicyCurrentRrOk: row?.structurePolicyCurrentRrOk ?? null,
    structurePolicyTargetBufferOk: row?.structurePolicyTargetBufferOk ?? null,
    structurePolicyDistanceWithinReviewBand: row?.structurePolicyDistanceWithinReviewBand ?? null,
    currentEntryStructureSupportReference: row?.currentEntryStructureSupportReference || null,
    currentEntryStructureSupportGapAtr: numberOrNull(row?.currentEntryStructureSupportGapAtr),
    currentEntryStructureStopAlignedSupportGapAtr: numberOrNull(row?.currentEntryStructureStopAlignedSupportGapAtr),
    rrAtCurrentPrice: numberOrNull(row?.rrAtCurrentPrice),
    entryDistancePct: numberOrNull(row?.entryDistancePctShadow ?? row?.entryDistancePct),
    targetBufferFromCurrentPct: numberOrNull(row?.targetBufferFromCurrentPct)
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Fresh Focus Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Stage6: ${report.stage6.file}`);
  lines.push(`- Hash: ${report.stage6.hash}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Executable Rows: ${report.summary.executableRows}`);
  lines.push(`- Contract Executable Picks: ${report.summary.contractExecutablePicks}`);
  lines.push(`- Raw Model Executable Downgraded: ${report.summary.rawExecutableDowngradedRows}`);
  lines.push(`- Safety: report-only; no broker/state mutation.`);
  lines.push('');
  lines.push('## Required Focus Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| latestQualityGateLaneCounts | ${esc(JSON.stringify(report.summary.latestQualityGateLaneCounts))} |`);
  lines.push(`| zeroExecutableTuningLaneCounts | ${esc(JSON.stringify(report.summary.zeroExecutableTuningLaneCounts))} |`);
  lines.push(`| breakoutRetestProofConfirmedCounts | ${esc(JSON.stringify(report.summary.breakoutRetestProofConfirmedCounts))} |`);
  lines.push(`| breakoutContinuationConfirmedCounts | ${esc(JSON.stringify(report.summary.breakoutContinuationConfirmedCounts))} |`);
  lines.push(`| targetRecalibrationViabilityVerdictCounts | ${esc(JSON.stringify(report.summary.targetRecalibrationViabilityVerdictCounts))} |`);
  lines.push(`| targetRecalibrationRequiredTargetSourceCounts | ${esc(JSON.stringify(report.summary.targetRecalibrationRequiredTargetSourceCounts))} |`);
  lines.push(`| riskGeometryTargetRecalibrationCandidateCounts | ${esc(JSON.stringify(report.summary.riskGeometryTargetRecalibrationCandidateCounts))} |`);
  lines.push(`| zeroExecutableFormulaBottleneckCounts | ${esc(JSON.stringify(report.summary.zeroExecutableFormulaBottleneckCounts))} |`);
  lines.push(`| formulaManifestContractIssues | ${esc(report.summary.formulaManifestContractIssues)} |`);
  lines.push(`| formulaLaneConsistencyIssues | ${esc(report.summary.formulaLaneConsistencyIssues)} |`);
  lines.push(`| formulaEvidenceQualityIssues | ${esc(report.summary.formulaEvidenceQualityIssues)} |`);
  lines.push(`| laneSpecificFormulaEvidenceIssues | ${esc(report.summary.laneSpecificFormulaEvidenceIssues)} |`);
  lines.push(`| blockerCategoryCounts | ${esc(JSON.stringify(report.summary.blockerCategoryCounts))} |`);
  lines.push(`| rawExecutableDowngrades | ${esc(JSON.stringify(report.rawExecutableDowngrades))} |`);
  lines.push('');
  lines.push('## Field Coverage');
  lines.push('');
  lines.push('| Field | Present / Total |');
  lines.push('| --- | ---: |');
  for (const [field, coverage] of Object.entries(report.fieldCoverage)) {
    lines.push(`| ${field} | ${coverage.present}/${coverage.total} |`);
  }
  lines.push('');
  lines.push('## Row Focus');
  lines.push('');
  lines.push('| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Formula Bottleneck | Severity | Formula Evidence | Lane Formula Basis | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const row of report.rows) {
    const riskChecks = [
      `target=${row.riskGeometryTargetAboveCurrent}`,
      `stop=${row.riskGeometryRequiredStopValid}`,
      `dist=${row.riskGeometryRequiredStopDistanceValid}`,
      `rr=${row.riskGeometryRecalculatedStopRrOk}`,
      `buf=${row.riskGeometryTargetBufferOk}`
    ].join(',');
    const structureOk = [
      `rr=${row.structurePolicyCurrentRrOk}`,
      `buf=${row.structurePolicyTargetBufferOk}`,
      `dist=${row.structurePolicyDistanceWithinReviewBand}`
    ].join(',');
    const formulaEvidence = `${row.zeroExecutableFormulaEvidenceBasis || 'missing'}:${row.zeroExecutableFormulaObservedValue ?? 'N/A'}>${row.zeroExecutableFormulaThresholdValue ?? 'N/A'} delta=${row.zeroExecutableFormulaDeltaValue ?? 'N/A'} ${row.zeroExecutableFormulaUnit || ''}; knob=${row.zeroExecutableFormulaAdjustmentKnob || 'missing'} direction=${row.zeroExecutableFormulaAdjustmentDirection || 'missing'}`;
    const laneFormulaBasis = [
      `structure=${row.structurePolicyFormulaEvidenceBasis || 'N/A'}`,
      `breakout=${row.breakoutRetestProofFormulaEvidenceBasis || 'N/A'}`,
      `target=${row.targetRecalibrationFormulaEvidenceBasis || 'N/A'}`,
      `risk=${row.riskGeometryFormulaEvidenceBasis || 'N/A'}`
    ].join('; ');
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(row.finalDecision)}/${esc(row.decisionReason)} | ${esc(row.blockerCategory)} | ${esc(row.qualityGateLane)} | ${esc(row.qualityGatePolicyVerdict)} | ${esc(row.zeroExecutableTuningLane)} | ${esc(row.zeroExecutableFormulaBottleneck)} | ${esc(row.zeroExecutableFormulaSeverity)} | ${esc(formulaEvidence)} | ${esc(laneFormulaBasis)} | ${esc(row.structurePolicyBlockerLane)} | ${esc(structureOk)} | ${esc(row.breakoutRetestProofConfirmed)} | ${esc(row.breakoutRetestPromotionPolicyDecision)} | ${esc((row.breakoutRetestPromotionBlockedBy || []).join(', ') || 'none')} | ${esc(row.targetRecalibrationRequiredTargetSource)} | ${esc(row.targetRecalibrationViabilityVerdict)} | ${esc(row.targetRecalibrationRequiredTargetByBufferPrice)} | ${esc(row.targetRecalibrationRequiredTargetByRrPrice)} | ${esc(row.targetRecalibrationRequiredTargetByExpectedReturnPrice)} | ${esc(row.riskGeometryRequiredTargetSource)} | ${esc(row.riskGeometryRepairLane)} | ${esc(row.riskGeometryProofConfirmed)} | ${esc(riskChecks)} | ${esc(row.riskGeometryTargetGapPct)} | ${esc(row.riskGeometryTargetShortfallPct)} | ${esc(row.rrAtCurrentPrice)} | ${esc(row.entryDistancePct)} | ${esc(row.targetBufferFromCurrentPct)} |`);
  }
  lines.push('');
  lines.push('## Track Separation');
  lines.push('');
  lines.push('- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact predates the formula-bottleneck contract or the producer failed to emit it. Treat that as a fresh-hash verification gap, not a sidecar problem.');
  lines.push('- `warn_formula_contract_missing_or_mismatch` means rows may expose formula fields, but the artifact manifest does not publish the formula tuning contract version/rules.');
  lines.push('- `warn_formula_bottleneck_lane_mismatch` means a row has formula fields, but the formula bottleneck contradicts its zero-executable tuning lane. Fix Stage6 producer mapping before tuning thresholds.');
  lines.push('- `warn_formula_bottleneck_evidence_weak` means the formula bottleneck lane is present, but its numeric/proof evidence is too weak to support tuning.');
  lines.push('- `warn_lane_specific_formula_evidence_mismatch` means the row has generic zero-executable formula fields, but the structure/breakout/target/risk lane-specific formula fields are missing or disagree with the primary formula basis.');
  lines.push('- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.');
  lines.push('- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.');
  lines.push('- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const rows = uniqueRows(stage6);
  const contract = stage6?.execution_contract || {};
  const contractExecutablePicks = Array.isArray(contract.executablePicks) ? contract.executablePicks : [];
  const rawExecutableDowngradeRows = rawExecutableDowngrades(stage6);
  const executableRows = rows.filter((row) => decisionOf(row) === 'EXECUTABLE_NOW');
  const qualityGateRows = rows.filter((row) => qualityGateLane(row));
  const requiredFocusFields = [
    'zeroExecutableTuningLane',
    'breakoutRetestProofConfirmed',
    'targetRecalibrationViabilityVerdict'
  ];
  const requiredFormulaFields = REQUIRED_FORMULA_FIELDS;
  const fieldCoverage = {
    zeroExecutableTuningLane: requiredFieldCoverage(rows, 'zeroExecutableTuningLane'),
    breakoutRetestProofConfirmed: requiredFieldCoverage(rows, 'breakoutRetestProofConfirmed'),
    breakoutRetestProofContinuationConfirmed: requiredFieldCoverage(rows, 'breakoutRetestProofContinuationConfirmed'),
    breakoutRetestPromotionPolicyDecision: requiredFieldCoverage(rows, 'breakoutRetestPromotionPolicyDecision'),
    breakoutRetestPromotionBlockedBy: requiredFieldCoverage(rows, 'breakoutRetestPromotionBlockedBy'),
    breakoutRetestProofFormulaEvidenceBasis: requiredFieldCoverage(rows, 'breakoutRetestProofFormulaEvidenceBasis'),
    breakoutRetestProofFormulaObservedValue: requiredFieldCoverage(rows, 'breakoutRetestProofFormulaObservedValue'),
    breakoutRetestProofFormulaThresholdValue: requiredFieldCoverage(rows, 'breakoutRetestProofFormulaThresholdValue'),
    breakoutRetestProofFormulaDeltaValue: requiredFieldCoverage(rows, 'breakoutRetestProofFormulaDeltaValue'),
    breakoutRetestProofFormulaUnit: requiredFieldCoverage(rows, 'breakoutRetestProofFormulaUnit'),
    targetRecalibrationViabilityVerdict: requiredFieldCoverage(rows, 'targetRecalibrationViabilityVerdict'),
    targetRecalibrationRequiredTargetByBufferPrice: requiredFieldCoverage(rows, 'targetRecalibrationRequiredTargetByBufferPrice'),
    targetRecalibrationRequiredTargetByRrPrice: requiredFieldCoverage(rows, 'targetRecalibrationRequiredTargetByRrPrice'),
    targetRecalibrationRequiredTargetByExpectedReturnPrice: requiredFieldCoverage(rows, 'targetRecalibrationRequiredTargetByExpectedReturnPrice'),
    targetRecalibrationSourcePrice: requiredFieldCoverage(rows, 'targetRecalibrationSourcePrice'),
    targetRecalibrationSourceStopPrice: requiredFieldCoverage(rows, 'targetRecalibrationSourceStopPrice'),
    targetRecalibrationStopDistanceAtCurrent: requiredFieldCoverage(rows, 'targetRecalibrationStopDistanceAtCurrent'),
    targetRecalibrationRequiredTargetSource: requiredFieldCoverage(rows, 'targetRecalibrationRequiredTargetSource'),
    targetRecalibrationFormulaEvidenceBasis: requiredFieldCoverage(rows, 'targetRecalibrationFormulaEvidenceBasis'),
    targetRecalibrationFormulaObservedValue: requiredFieldCoverage(rows, 'targetRecalibrationFormulaObservedValue'),
    targetRecalibrationFormulaThresholdValue: requiredFieldCoverage(rows, 'targetRecalibrationFormulaThresholdValue'),
    targetRecalibrationFormulaDeltaValue: requiredFieldCoverage(rows, 'targetRecalibrationFormulaDeltaValue'),
    targetRecalibrationFormulaUnit: requiredFieldCoverage(rows, 'targetRecalibrationFormulaUnit'),
    structurePolicyBlockerLane: requiredFieldCoverage(rows, 'structurePolicyBlockerLane'),
    structurePolicyFormulaEvidenceBasis: requiredFieldCoverage(rows, 'structurePolicyFormulaEvidenceBasis'),
    structurePolicyCurrentRrOk: requiredFieldCoverage(rows, 'structurePolicyCurrentRrOk'),
    structurePolicyTargetBufferOk: requiredFieldCoverage(rows, 'structurePolicyTargetBufferOk'),
    structurePolicyDistanceWithinReviewBand: requiredFieldCoverage(rows, 'structurePolicyDistanceWithinReviewBand'),
    riskGeometryRequiredTargetByStopPrice: requiredFieldCoverage(rows, 'riskGeometryRequiredTargetByStopPrice'),
    riskGeometryRequiredTargetByBufferPrice: requiredFieldCoverage(rows, 'riskGeometryRequiredTargetByBufferPrice'),
    riskGeometryRequiredTargetByExpectedReturnPrice: requiredFieldCoverage(rows, 'riskGeometryRequiredTargetByExpectedReturnPrice'),
    riskGeometryRequiredTargetSource: requiredFieldCoverage(rows, 'riskGeometryRequiredTargetSource'),
    riskGeometryTargetGapPct: requiredFieldCoverage(rows, 'riskGeometryTargetGapPct'),
    riskGeometryTargetShortfallPct: requiredFieldCoverage(rows, 'riskGeometryTargetShortfallPct'),
    riskGeometryTargetAboveCurrent: requiredFieldCoverage(rows, 'riskGeometryTargetAboveCurrent'),
    riskGeometryRequiredStopValid: requiredFieldCoverage(rows, 'riskGeometryRequiredStopValid'),
    riskGeometryRequiredStopDistanceValid: requiredFieldCoverage(rows, 'riskGeometryRequiredStopDistanceValid'),
    riskGeometryRecalculatedStopRrOk: requiredFieldCoverage(rows, 'riskGeometryRecalculatedStopRrOk'),
    riskGeometryTargetBufferOk: requiredFieldCoverage(rows, 'riskGeometryTargetBufferOk'),
    riskGeometryRepairLane: requiredFieldCoverage(rows, 'riskGeometryRepairLane'),
    riskGeometryProofConfirmed: requiredFieldCoverage(rows, 'riskGeometryProofConfirmed'),
    riskGeometryFormulaEvidenceBasis: requiredFieldCoverage(rows, 'riskGeometryFormulaEvidenceBasis'),
    riskGeometryFormulaObservedValue: requiredFieldCoverage(rows, 'riskGeometryFormulaObservedValue'),
    riskGeometryFormulaThresholdValue: requiredFieldCoverage(rows, 'riskGeometryFormulaThresholdValue'),
    riskGeometryFormulaDeltaValue: requiredFieldCoverage(rows, 'riskGeometryFormulaDeltaValue'),
    riskGeometryFormulaUnit: requiredFieldCoverage(rows, 'riskGeometryFormulaUnit'),
    qualityGateLane: requiredFieldCoverage(rows, 'qualityGateLane'),
    qualityGatePolicyVerdict: requiredFieldCoverage(rows, 'qualityGatePolicyVerdict'),
    zeroExecutableFormulaBottleneck: requiredFieldCoverage(rows, 'zeroExecutableFormulaBottleneck'),
    zeroExecutableFormulaSeverity: requiredFieldCoverage(rows, 'zeroExecutableFormulaSeverity'),
    zeroExecutableTargetShortfallPct: requiredFieldCoverage(rows, 'zeroExecutableTargetShortfallPct'),
    zeroExecutableRiskTargetShortfallPct: requiredFieldCoverage(rows, 'zeroExecutableRiskTargetShortfallPct'),
    zeroExecutableBreakoutProofGapCount: requiredFieldCoverage(rows, 'zeroExecutableBreakoutProofGapCount'),
    zeroExecutableStructureProofGapCount: requiredFieldCoverage(rows, 'zeroExecutableStructureProofGapCount'),
    zeroExecutableFormulaObservedValue: requiredFieldCoverage(rows, 'zeroExecutableFormulaObservedValue'),
    zeroExecutableFormulaThresholdValue: requiredFieldCoverage(rows, 'zeroExecutableFormulaThresholdValue'),
    zeroExecutableFormulaDeltaValue: requiredFieldCoverage(rows, 'zeroExecutableFormulaDeltaValue'),
    zeroExecutableFormulaUnit: requiredFieldCoverage(rows, 'zeroExecutableFormulaUnit'),
    zeroExecutableFormulaEvidenceBasis: requiredFieldCoverage(rows, 'zeroExecutableFormulaEvidenceBasis'),
    zeroExecutableFormulaAdjustmentKnob: requiredFieldCoverage(rows, 'zeroExecutableFormulaAdjustmentKnob'),
    zeroExecutableFormulaAdjustmentDirection: requiredFieldCoverage(rows, 'zeroExecutableFormulaAdjustmentDirection'),
    zeroExecutableFormulaAdjustmentMagnitude: requiredFieldCoverage(rows, 'zeroExecutableFormulaAdjustmentMagnitude'),
    zeroExecutableFormulaAdjustmentRationale: requiredFieldCoverage(rows, 'zeroExecutableFormulaAdjustmentRationale'),
    zeroExecutableFormulaReasons: requiredFieldCoverage(rows, 'zeroExecutableFormulaReasons'),
    zeroExecutableFormulaRecommendedAction: requiredFieldCoverage(rows, 'zeroExecutableFormulaRecommendedAction'),
    currentEntryStructureSupportReference: requiredFieldCoverage(rows, 'currentEntryStructureSupportReference'),
    currentEntryStructureSupportGapAtr: requiredFieldCoverage(rows, 'currentEntryStructureSupportGapAtr'),
    currentEntryStructureStopAlignedSupportGapAtr: requiredFieldCoverage(rows, 'currentEntryStructureStopAlignedSupportGapAtr')
  };
  const requiredCoveragePass = requiredFocusFields.every((field) => {
    const coverage = fieldCoverage[field];
    return coverage?.total > 0 && coverage.present === coverage.total;
  });
  const formulaCoveragePass = requiredFormulaFields.every((field) => {
    const coverage = fieldCoverage[field];
    return coverage?.total > 0 && coverage.present === coverage.total;
  });
  const formulaManifestIssues = formulaManifestContractIssues(stage6);
  const formulaLaneConsistencyIssues = rows.map(formulaLaneConsistencyIssue).filter(Boolean);
  const formulaEvidenceQualityIssues = rows.map(formulaEvidenceQualityIssue).filter(Boolean);
  const laneSpecificFormulaEvidenceIssues = rows.map(laneSpecificFormulaEvidenceIssue).filter(Boolean);
  const hasOpaqueOtherOnly = rows.length > 0 && Object.keys(countBy(rows, blockerCategory)).length === 1 && countBy(rows, blockerCategory).other === rows.length;
  const overall = rows.length === 0
    ? 'fail_no_rows'
    : !requiredCoveragePass
      ? 'fail_required_focus_fields_missing'
      : !formulaCoveragePass
        ? 'warn_formula_bottleneck_fields_missing'
        : formulaManifestIssues.length > 0
          ? 'warn_formula_contract_missing_or_mismatch'
        : formulaLaneConsistencyIssues.length > 0
          ? 'warn_formula_bottleneck_lane_mismatch'
          : formulaEvidenceQualityIssues.length > 0
            ? 'warn_formula_bottleneck_evidence_weak'
          : laneSpecificFormulaEvidenceIssues.length > 0
            ? 'warn_lane_specific_formula_evidence_mismatch'
          : hasOpaqueOtherOnly
            ? 'warn_opaque_blocker_categories'
            : executableRows.length > 0
              ? 'pass_executable_present_focus_fields_ok'
              : 'pass_zero_executable_focus_fields_ok';
  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || fileSha256(stage6Path)
    },
    summary: {
      rows: rows.length,
      executableRows: executableRows.length,
      contractExecutablePicks: contractExecutablePicks.length,
      rawExecutableDowngradedRows: rawExecutableDowngradeRows.length,
      latestQualityGateLaneCounts: countBy(qualityGateRows, qualityGateLane),
      zeroExecutableTuningLaneCounts: countBy(rows, (row) => row?.zeroExecutableTuningLane || 'missing'),
      breakoutRetestProofConfirmedCounts: countBy(rows, (row) => String(row?.breakoutRetestProofConfirmed ?? 'missing')),
      breakoutRetestProofReviewReadyCounts: countBy(rows, (row) => String(row?.breakoutRetestProofReviewReady ?? 'missing')),
      breakoutContinuationConfirmedCounts: countBy(rows, (row) => String(row?.breakoutRetestProofContinuationConfirmed ?? 'missing')),
      breakoutPromotionPolicyDecisionCounts: countBy(rows, (row) => row?.breakoutRetestPromotionPolicyDecision || 'missing'),
      targetRecalibrationViabilityVerdictCounts: countBy(rows, (row) => row?.targetRecalibrationViabilityVerdict || 'missing'),
      targetRecalibrationRequiredTargetSourceCounts: countBy(rows, (row) => row?.targetRecalibrationRequiredTargetSource || 'missing'),
      riskGeometryTargetRecalibrationCandidateCounts: countBy(rows, (row) => String(row?.riskGeometryTargetRecalibrationCandidate ?? 'missing')),
      zeroExecutableFormulaBottleneckCounts: countBy(rows, (row) => row?.zeroExecutableFormulaBottleneck || 'missing'),
      formulaManifestContractIssues: formulaManifestIssues.length,
      formulaLaneConsistencyIssues: formulaLaneConsistencyIssues.length,
      formulaEvidenceQualityIssues: formulaEvidenceQualityIssues.length,
      laneSpecificFormulaEvidenceIssues: laneSpecificFormulaEvidenceIssues.length,
      blockerCategoryCounts: countBy(rows, blockerCategory)
    },
    fieldCoverage,
    requiredFocusFields,
    requiredFormulaFields,
    formulaManifestContractIssues: formulaManifestIssues,
    formulaLaneConsistencyIssues,
    formulaEvidenceQualityIssues,
    laneSpecificFormulaEvidenceIssues,
    rawExecutableDowngrades: rawExecutableDowngradeRows,
    trackSeparation: {
      stage6ProducerTuning: ['breakout_proofConfirmed_criteria', 'target_recalibration_formula', 'risk_geometry_recalculation_evidence'],
      sidecarSubmitReprice: 'out_of_scope_until_executable_payload_and_explicit_approval',
      opsHealthFail: 'separate_alpha_exec_engine_guard_metadata_track'
    },
    safety: {
      reportOnly: true,
      brokerMutation: false,
      stateMutation: false
    },
    rows: rows.map(compactRow)
  };
  ensureParent(OUT_JSON);
  ensureParent(OUT_MD);
  fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolveRepo(OUT_MD), buildMarkdown(report), 'utf8');
  console.log(`[STAGE6_FRESH_FOCUS_AUDIT] overall=${overall} rows=${rows.length} executable=${executableRows.length} json=${OUT_JSON}`);
  if (overall.startsWith('fail')) process.exit(1);
}

main();
