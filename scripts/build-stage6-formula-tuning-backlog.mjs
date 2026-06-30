#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = process.env.STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON || 'state/stage6-formula-tuning-backlog.json';
const OUT_MD = process.env.STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD || 'state/stage6-formula-tuning-backlog.md';
const EXPECTED_SOURCE_SHA_ENV =
  process.env.STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA ||
  process.env.STAGE6_EXPECTED_SOURCE_SHA ||
  '';
const ENFORCE_FRESH_SOURCE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.STAGE6_FORMULA_TUNING_BACKLOG_ENFORCE_FRESH_SOURCE || '').trim().toLowerCase()
);
const EXPECTED_FORMULA_CONTRACT_VERSION = 'zero_executable_formula_v4';
const REQUIRED_FORMULA_FIELDS = [
  'zeroExecutableFormulaBottleneck',
  'zeroExecutableFormulaSeverity',
  'zeroExecutableFormulaObservedValue',
  'zeroExecutableFormulaThresholdValue',
  'zeroExecutableFormulaDeltaValue',
  'zeroExecutableFormulaUnit',
  'zeroExecutableFormulaEvidenceBasis',
  'zeroExecutableFormulaAdjustmentKnob',
  'zeroExecutableFormulaAdjustmentDirection',
  'zeroExecutableFormulaAdjustmentMagnitude',
  'zeroExecutableFormulaAdjustmentRationale'
];
const PRODUCER_TRACK_BY_BOTTLENECK = {
  TARGET_RECALIBRATION_FORMULA: 'target_recalibration',
  RISK_GEOMETRY_RECALCULATION_FORMULA: 'risk_geometry_recalculation',
  BREAKOUT_PROOF_FORMULA: 'breakout_proof_confirmed_generation',
  STRUCTURE_PROOF_FORMULA: 'structure_proof_generation',
  NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK: 'no_action'
};
const EXPECTED_BOTTLENECK_BY_LANE = {
  TARGET_RECALIBRATION: 'TARGET_RECALIBRATION_FORMULA',
  STOP_TARGET_RISK_GEOMETRY_RECALCULATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
  RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
  BREAKOUT_PROOF_CONFIRMED_GENERATION: 'BREAKOUT_PROOF_FORMULA',
  STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: 'STRUCTURE_PROOF_FORMULA',
  NO_ZERO_EXECUTABLE_TUNING_ACTION: 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK'
};
const EXPECTED_LANE_SPECIFIC_ROW_FIELDS = {
  TARGET_RECALIBRATION: [
    'targetRecalibrationFormulaEvidenceBasis',
    'targetRecalibrationFormulaObservedValue',
    'targetRecalibrationFormulaThresholdValue',
    'targetRecalibrationFormulaDeltaValue',
    'targetRecalibrationFormulaUnit'
  ],
  STOP_TARGET_RISK_GEOMETRY_RECALCULATION: [
    'riskGeometryFormulaEvidenceBasis',
    'riskGeometryFormulaObservedValue',
    'riskGeometryFormulaThresholdValue',
    'riskGeometryFormulaDeltaValue',
    'riskGeometryFormulaUnit'
  ],
  RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: [
    'riskGeometryFormulaEvidenceBasis',
    'riskGeometryFormulaObservedValue',
    'riskGeometryFormulaThresholdValue',
    'riskGeometryFormulaDeltaValue',
    'riskGeometryFormulaUnit'
  ],
  BREAKOUT_PROOF_CONFIRMED_GENERATION: [
    'breakoutRetestProofFormulaEvidenceBasis',
    'breakoutRetestProofFormulaObservedValue',
    'breakoutRetestProofFormulaThresholdValue',
    'breakoutRetestProofFormulaDeltaValue',
    'breakoutRetestProofFormulaUnit'
  ],
  STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: [
    'structurePolicyFormulaEvidenceBasis',
    'structurePolicyFormulaObservedValue',
    'structurePolicyFormulaThresholdValue',
    'structurePolicyFormulaDeltaValue',
    'structurePolicyFormulaUnit'
  ],
  NO_ZERO_EXECUTABLE_TUNING_ACTION: []
};
const EXPECTED_TUNABLE_POLICY_FIELDS = {
  TARGET_RECALIBRATION: [
    'TARGET_RECALIBRATION_POLICY.maxRequiredTargetGapPct',
    'TARGET_RECALIBRATION_POLICY.maxExecutionFloorGapPct',
    'targetRecalibrationRequiredTargetPrice',
    'targetRecalibrationRequiredTargetSource',
    'targetRecalibrationRequiredTargetByExecutionFloorPrice',
    'targetRecalibrationRequiredTargetByExpectedReturnPrice',
    'targetRecalibrationRequiredTargetDominantReason',
    'targetRecalibrationExecutionFloorGapPct',
    'targetRecalibrationExecutionFloorShortfallPct',
    'targetRecalibrationExpectedReturnShortfallPct',
    'targetRecalibrationExecutionFloorViable',
    'targetRecalibrationViabilityVerdict'
  ],
  STOP_TARGET_RISK_GEOMETRY_RECALCULATION: [
    'riskGeometryRequiredTargetPrice',
    'riskGeometryRequiredTargetSource',
    'riskGeometryRequiredTargetDominantReason',
    'riskGeometryTargetShortfallPct',
    'riskGeometryRrAtRequiredTargetAndRecalculatedStop',
    'riskGeometryTargetBufferAtRequiredTargetPct',
    'riskGeometryTargetRecalibrationProofReady',
    'riskGeometryRequiredStopValid',
    'riskGeometryRequiredStopDistanceValid',
    'riskGeometryStopDistancePolicyVerdict',
    'riskGeometryTargetShortfallPolicyVerdict',
    'riskGeometryRecalculatedStopRrOk',
    'riskGeometryTargetBufferOk'
  ],
  RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: [
    'riskGeometryRequiredTargetPrice',
    'riskGeometryRequiredTargetSource',
    'riskGeometryRequiredTargetDominantReason',
    'riskGeometryTargetShortfallPct',
    'riskGeometryTargetNoTradeConfirmed',
    'riskGeometryTargetRecalibrationGapPolicyPct',
    'riskGeometryTargetShortfallPolicyVerdict',
    'riskGeometryTargetAboveCurrent'
  ],
  BREAKOUT_PROOF_CONFIRMED_GENERATION: [
    'BREAKOUT_RETEST_PROOF_POLICY.maxBarsSinceRetest',
    'BREAKOUT_RETEST_PROOF_POLICY.maxCurrentExtensionFromRetestPct',
    'BREAKOUT_RETEST_PROOF_POLICY.retestTolerancePct',
    'BREAKOUT_RETEST_PROOF_POLICY.maxReclaimUndercutExcessPct',
    'BREAKOUT_RETEST_PROOF_POLICY.maxContinuationExtensionPct',
    'BREAKOUT_RETEST_PROOF_POLICY.continuationMinRrMultiplier',
    'BREAKOUT_RETEST_PROOF_POLICY.continuationMinTargetBufferMultiplier',
    'breakoutRetestProofUndercutReclaimFound',
    'breakoutRetestProofConfirmed'
  ],
  STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: [
    'CURRENT_ENTRY_STRUCTURE_POLICY.maxReviewDistancePct',
    'CURRENT_ENTRY_STRUCTURE_POLICY.supportBufferAtr',
    'CURRENT_ENTRY_STRUCTURE_POLICY.minStopAtr',
    'CURRENT_ENTRY_STRUCTURE_POLICY.maxStopAtr',
    'CURRENT_ENTRY_STRUCTURE_POLICY.maxPriceDriftPct',
    'currentEntryStructureVerdict',
    'currentEntryStructureStopSupportRelation',
    'currentEntryStructureSupportStopGapPct'
  ],
  NO_ZERO_EXECUTABLE_TUNING_ACTION: []
};
const EXPECTED_PROMOTION_SAFETY_RULES = [
  'breakout_review_ready_never_promotes',
  'breakout_proof_confirmed_requires_promotion_flag',
  'target_already_reached_requires_recalibration_or_no_trade',
  'structure_reject_never_promotes_without_confirmed_structure',
  'sidecar_reprice_never_solves_stage6_target_geometry'
];

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH) return process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_DIR || DEFAULT_STAGE6_DIR);
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

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

const EXPECTED_SOURCE_SHA = normalizeText(EXPECTED_SOURCE_SHA_ENV);

function stage6SourceAudit(stage6) {
  const manifest = stage6?.manifest || {};
  const buildSource = manifest?.buildSource || stage6?.buildSource || {};
  return {
    repository: normalizeText(manifest.sourceRepo) || normalizeText(buildSource.repository),
    workflow: normalizeText(manifest.sourceWorkflow) || normalizeText(buildSource.workflow),
    runId: normalizeText(manifest.sourceRunId) || normalizeText(buildSource.runId),
    sha: normalizeText(manifest.sourceSha) || normalizeText(buildSource.sha),
    ref: normalizeText(manifest.sourceRef) || normalizeText(buildSource.ref),
    eventName: normalizeText(manifest.sourceEventName) || normalizeText(buildSource.eventName)
  };
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = numberOrNull(value);
  return number == null ? null : Number(number.toFixed(digits));
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

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function uniqueRows(stage6) {
  const contract = stage6?.execution_contract || {};
  const sourceGroups = [
    ...(Array.isArray(contract.executablePicks) ? contract.executablePicks.map((row) => [row, 50]) : []),
    ...(Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates.map((row) => [row, 40]) : []),
    ...(Array.isArray(contract.watchlistTop) ? contract.watchlistTop.map((row) => [row, 30]) : []),
    ...(Array.isArray(contract.modelTop6) ? contract.modelTop6.map((row) => [row, 20]) : []),
    ...(Array.isArray(stage6?.candidates) ? stage6.candidates.map((row) => [row, 10]) : [])
  ];
  const bySymbol = new Map();
  for (const [row, priority] of sourceGroups) {
    const symbol = normalizeSymbol(row);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || priority > existing.priority) bySymbol.set(symbol, { row, priority });
  }
  return [...bySymbol.values()].map(({ row }) => row);
}

function contractVersion(stage6) {
  return normalizeText(stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract?.version) || normalizeText(stage6?.decisionGate?.zeroExecutableFormulaContract?.version);
}

function formulaContract(stage6) {
  return stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract || stage6?.decisionGate?.zeroExecutableFormulaContract || null;
}

function formulaContractIssues(stage6) {
  const contract = formulaContract(stage6);
  if (!contract || typeof contract !== 'object') return ['formula_contract_missing'];
  const issues = [];
  if (contract.version !== EXPECTED_FORMULA_CONTRACT_VERSION) {
    issues.push(`formula_contract_version_mismatch:${contract.version || 'missing'}`);
  }
  const requiredRowFields = new Set(Array.isArray(contract.requiredRowFields) ? contract.requiredRowFields : []);
  for (const field of REQUIRED_FORMULA_FIELDS) {
    if (!requiredRowFields.has(field)) issues.push(`formula_contract_required_field_missing:${field}`);
  }
  const laneSpecificRowFields = contract.laneSpecificRowFields || {};
  for (const [lane, fields] of Object.entries(EXPECTED_LANE_SPECIFIC_ROW_FIELDS)) {
    if (!Array.isArray(laneSpecificRowFields[lane])) {
      issues.push(`lane_specific_contract_missing:${lane}`);
      continue;
    }
    const actualFields = new Set(laneSpecificRowFields[lane]);
    for (const field of fields) {
      if (!actualFields.has(field)) issues.push(`lane_specific_contract_missing:${lane}.${field}`);
    }
  }
  const tunablePolicyFields = contract.tunablePolicyFields || {};
  for (const [lane, fields] of Object.entries(EXPECTED_TUNABLE_POLICY_FIELDS)) {
    if (!Array.isArray(tunablePolicyFields[lane])) {
      issues.push(`tunable_policy_contract_missing:${lane}`);
      continue;
    }
    const actualFields = new Set(tunablePolicyFields[lane]);
    for (const field of fields) {
      if (!actualFields.has(field)) issues.push(`tunable_policy_contract_missing:${lane}.${field}`);
    }
  }
  const promotionSafetyRules = new Set(Array.isArray(contract.promotionSafetyRules) ? contract.promotionSafetyRules : []);
  for (const rule of EXPECTED_PROMOTION_SAFETY_RULES) {
    if (!promotionSafetyRules.has(rule)) issues.push(`promotion_safety_rule_missing:${rule}`);
  }
  return issues;
}

function missingFormulaFields(row) {
  return REQUIRED_FORMULA_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(row, field));
}

function missingLaneSpecificFields(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const fields = EXPECTED_LANE_SPECIFIC_ROW_FIELDS[lane] || [];
  return fields.filter((field) => !Object.prototype.hasOwnProperty.call(row, field));
}

function formulaEvidenceWeak(row, missingFields, missingLaneFields) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  if (!lane || lane === 'NO_ZERO_EXECUTABLE_TUNING_ACTION') return false;
  if (missingFields.length > 0 || missingLaneFields.length > 0) return false;
  const observed = numberOrNull(row?.zeroExecutableFormulaObservedValue);
  const delta = numberOrNull(row?.zeroExecutableFormulaDeltaValue);
  const magnitude = numberOrNull(row?.zeroExecutableFormulaAdjustmentMagnitude);
  const severity = numberOrNull(row?.zeroExecutableFormulaSeverity);
  return !(observed != null && observed > 0 && delta != null && delta > 0 && magnitude != null && magnitude > 0 && severity != null && severity > 0);
}

function formulaLaneMismatch(row, missingFields) {
  if (missingFields.length > 0) return false;
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const expected = EXPECTED_BOTTLENECK_BY_LANE[lane];
  if (!expected) return false;
  const actual = String(row?.zeroExecutableFormulaBottleneck || '').trim().toUpperCase();
  return actual !== expected;
}

function targetRecalibrationEvidence(row) {
  return {
    verdict: normalizeText(row?.targetRecalibrationVerdict),
    viabilityVerdict: normalizeText(row?.targetRecalibrationViabilityVerdict),
    requiredTargetPrice: round(row?.targetRecalibrationRequiredTargetPrice),
    currentTargetPrice: round(row?.targetRecalibrationCurrentTargetPrice),
    requiredTargetSource: normalizeText(row?.targetRecalibrationRequiredTargetSource),
    requiredTargetDominantReason: normalizeText(row?.targetRecalibrationRequiredTargetDominantReason),
    requiredTargetByExecutionFloorPrice: round(row?.targetRecalibrationRequiredTargetByExecutionFloorPrice),
    requiredTargetByExpectedReturnPrice: round(row?.targetRecalibrationRequiredTargetByExpectedReturnPrice),
    executionFloorGapPct: round(row?.targetRecalibrationExecutionFloorGapPct),
    executionFloorShortfallPct: round(row?.targetRecalibrationExecutionFloorShortfallPct),
    expectedReturnShortfallPct: round(row?.targetRecalibrationExpectedReturnShortfallPct),
    executionFloorViable: row?.targetRecalibrationExecutionFloorViable ?? null,
    noTradeConfirmed: row?.targetNoTradeConfirmed ?? null
  };
}

function targetRecalibrationProofGaps(evidence) {
  const gaps = [];
  if (evidence.requiredTargetPrice == null) gaps.push('missing_required_target_price');
  if (evidence.requiredTargetByExecutionFloorPrice == null) gaps.push('missing_execution_floor_price');
  if (evidence.executionFloorViable == null) gaps.push('missing_execution_floor_viability');
  if (!evidence.requiredTargetDominantReason) gaps.push('missing_required_target_dominant_reason');
  if (!evidence.viabilityVerdict) gaps.push('missing_viability_verdict');
  return gaps;
}

function targetRecalibrationProofSummary(evidence, gaps = []) {
  if (!evidence || typeof evidence !== 'object') return 'not_target_recalibration';
  return [
    `target=${evidence.currentTargetPrice ?? 'N/A'}`,
    `required=${evidence.requiredTargetPrice ?? 'N/A'}`,
    `executionFloor=${evidence.requiredTargetByExecutionFloorPrice ?? 'N/A'}`,
    `expectedReturn=${evidence.requiredTargetByExpectedReturnPrice ?? 'N/A'}`,
    `source=${evidence.requiredTargetSource || 'N/A'}`,
    `dominant=${evidence.requiredTargetDominantReason || 'N/A'}`,
    `execFloorGap=${evidence.executionFloorGapPct ?? 'N/A'}%`,
    `execFloorShortfall=${evidence.executionFloorShortfallPct ?? 'N/A'}%`,
    `execFloorViable=${evidence.executionFloorViable ?? 'N/A'}`,
    `viability=${evidence.viabilityVerdict || 'N/A'}`,
    `noTrade=${evidence.noTradeConfirmed ?? 'N/A'}`,
    `proofGaps=${gaps.length ? gaps.join(',') : 'none'}`
  ].join(' ');
}

function structureProofEvidence(row) {
  return {
    currentEntryStructureVerdict: normalizeText(row?.currentEntryStructureVerdict),
    currentEntryStructureConfirmed: row?.currentEntryStructureConfirmed ?? null,
    currentEntryStructureSupportReference: normalizeText(row?.currentEntryStructureSupportReference),
    currentEntryStructureSupportGapAtr: round(row?.currentEntryStructureSupportGapAtr),
    currentEntryStructureStopAlignedSupportGapAtr: round(row?.currentEntryStructureStopAlignedSupportGapAtr),
    structurePolicyVerdict: normalizeText(row?.structurePolicyVerdict),
    structurePolicyBlockerLane: normalizeText(row?.structurePolicyBlockerLane),
    structurePolicyCurrentRrOk: row?.structurePolicyCurrentRrOk ?? null,
    structurePolicyTargetBufferOk: row?.structurePolicyTargetBufferOk ?? null,
    structurePolicyDistanceWithinReviewBand: row?.structurePolicyDistanceWithinReviewBand ?? null,
    structurePolicyCurrentRrValue: round(row?.structurePolicyCurrentRrValue),
    structurePolicyMinRr: round(row?.structurePolicyMinRr),
    structurePolicyEntryDistancePct: round(row?.structurePolicyEntryDistancePct),
    structurePolicyMaxReviewDistancePct: round(row?.structurePolicyMaxReviewDistancePct)
  };
}

function formulaEvidenceSummary(row) {
  const basis = normalizeText(row?.zeroExecutableFormulaEvidenceBasis) || 'missing_basis';
  const observed = round(row?.zeroExecutableFormulaObservedValue);
  const threshold = round(row?.zeroExecutableFormulaThresholdValue);
  const delta = round(row?.zeroExecutableFormulaDeltaValue);
  const unit = normalizeText(row?.zeroExecutableFormulaUnit) || 'unit_missing';
  return `${basis}: observed=${observed ?? 'N/A'} threshold=${threshold ?? 'N/A'} delta=${delta ?? 'N/A'} ${unit}`;
}

function rowEvidenceSummary(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const formula = formulaEvidenceSummary(row);
  if (lane === 'TARGET_RECALIBRATION') {
    const evidence = targetRecalibrationEvidence(row);
    const proofGaps = targetRecalibrationProofGaps(evidence);
    return `${formula}; ${targetRecalibrationProofSummary(evidence, proofGaps)}`;
  }
  if (lane === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') {
    const evidence = structureProofEvidence(row);
    return `${formula}; structure=${evidence.currentEntryStructureVerdict || 'missing'} blocker=${evidence.structurePolicyBlockerLane || 'missing'} rrOk=${evidence.structurePolicyCurrentRrOk} bufferOk=${evidence.structurePolicyTargetBufferOk} distOk=${evidence.structurePolicyDistanceWithinReviewBand}`;
  }
  return formula;
}

function rowBacklog(row, contractIncomplete = false) {
  const symbol = normalizeSymbol(row);
  const bottleneck = normalizeText(row?.zeroExecutableFormulaBottleneck) || 'missing';
  const producerTrack = PRODUCER_TRACK_BY_BOTTLENECK[bottleneck] || 'unknown';
  const missingFields = missingFormulaFields(row);
  const missingLaneFields = missingLaneSpecificFields(row);
  const laneMismatch = formulaLaneMismatch(row, missingFields);
  const weakEvidence = formulaEvidenceWeak(row, missingFields, missingLaneFields);
  const delta = round(row?.zeroExecutableFormulaDeltaValue) ?? 0;
  const magnitude = round(row?.zeroExecutableFormulaAdjustmentMagnitude) ?? delta;
  const severity = round(row?.zeroExecutableFormulaSeverity) ?? 0;
  const targetEvidence = targetRecalibrationEvidence(row);
  const targetProofGaps = targetRecalibrationProofGaps(targetEvidence);
  const actionRequired = contractIncomplete
    ? 'REFRESH_STAGE6_FORMULA_CONTRACT'
    : missingFields.length > 0 || missingLaneFields.length > 0
    ? 'REFRESH_STAGE6_WITH_FORMULA_V4'
    : laneMismatch
      ? 'REFRESH_STAGE6_FORMULA_LANE_MAPPING'
    : weakEvidence
      ? 'REFRESH_STAGE6_FORMULA_EVIDENCE'
    : producerTrack === 'no_action'
      ? 'NO_PRODUCER_TUNING_ACTION'
      : 'PRODUCER_TUNING_REVIEW';
  return {
    symbol,
    verdict: verdictOf(row),
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row),
    zeroExecutableTuningLane: normalizeText(row?.zeroExecutableTuningLane),
    formulaBottleneck: bottleneck,
    producerTrack,
    observedValue: round(row?.zeroExecutableFormulaObservedValue),
    thresholdValue: round(row?.zeroExecutableFormulaThresholdValue),
    deltaValue: delta,
    unit: normalizeText(row?.zeroExecutableFormulaUnit),
    evidenceBasis: normalizeText(row?.zeroExecutableFormulaEvidenceBasis),
    adjustmentKnob: normalizeText(row?.zeroExecutableFormulaAdjustmentKnob),
    adjustmentDirection: normalizeText(row?.zeroExecutableFormulaAdjustmentDirection),
    adjustmentMagnitude: magnitude,
    adjustmentRationale: normalizeText(row?.zeroExecutableFormulaAdjustmentRationale),
    severity,
    actionRequired,
    missingFormulaFields: missingFields,
    missingLaneSpecificFields: missingLaneFields,
    formulaLaneMismatch: laneMismatch,
    expectedFormulaBottleneck: EXPECTED_BOTTLENECK_BY_LANE[String(row?.zeroExecutableTuningLane || '').trim().toUpperCase()] || null,
    formulaEvidenceWeak: weakEvidence,
    rowEvidenceSummary: rowEvidenceSummary(row),
    targetRecalibrationEvidence: targetEvidence,
    targetRecalibrationProofGaps: targetProofGaps,
    targetRecalibrationProofSummary: targetRecalibrationProofSummary(targetEvidence, targetProofGaps),
    targetRecalibrationProofGapCount: targetProofGaps.length,
    structureProofEvidence: structureProofEvidence(row),
    producerOnly: true,
    sidecarMutationAllowed: false
  };
}

function rankRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.actionRequired !== b.actionRequired) return a.actionRequired === 'PRODUCER_TUNING_REVIEW' ? -1 : 1;
    return (b.adjustmentMagnitude || b.deltaValue || b.severity || 0) - (a.adjustmentMagnitude || a.deltaValue || a.severity || 0) || a.symbol.localeCompare(b.symbol);
  });
}

function aggregate(rows, key) {
  const out = {};
  for (const row of rows) {
    const group = row[key] || 'unknown';
    if (!out[group]) out[group] = { count: 0, totalMagnitude: 0, symbols: [] };
    out[group].count += 1;
    out[group].totalMagnitude += Number(row.adjustmentMagnitude || row.deltaValue || row.severity || 0);
    out[group].symbols.push(row.symbol);
  }
  return Object.fromEntries(Object.entries(out).map(([group, value]) => [group, {
    count: value.count,
    totalMagnitude: round(value.totalMagnitude),
    symbols: value.symbols.sort()
  }]));
}

function proofGapCounts(rows) {
  return countBy(rows.flatMap((row) => row.targetRecalibrationProofGaps || []), (gap) => gap);
}

function producerFieldRecommendation(field, purpose, action, context = {}) {
  return {
    field,
    purpose,
    action,
    observedValue: context.observedValue ?? null,
    thresholdValue: context.thresholdValue ?? null,
    candidateValue: context.candidateValue ?? null,
    evidenceBasis: context.evidenceBasis ?? null,
    guardrail: context.guardrail || 'producer_only_no_broker_or_sidecar_mutation'
  };
}

function producerFieldRecommendationsForGroup(groupRows, base) {
  const first = groupRows[0] || {};
  const observed = base.maxObservedValue;
  const threshold = base.maxThresholdValue;
  const evidenceBasis = first.evidenceBasis || null;
  const commonContext = { observedValue: observed, thresholdValue: threshold, evidenceBasis };

  if (base.producerTrack === 'target_recalibration') {
    return [
      producerFieldRecommendation(
        'targetRecalibrationRequiredTargetPrice',
        'Recompute the Stage6 target required by stop-risk, target-buffer, execution-floor, and expected-return evidence.',
        'recompute_or_mark_no_trade',
        commonContext
      ),
      producerFieldRecommendation(
        'targetRecalibrationRequiredTargetByExecutionFloorPrice',
        'Prove whether current entry still has enough upside after recalibration.',
        'populate_execution_floor_evidence',
        commonContext
      ),
      producerFieldRecommendation(
        'targetRecalibrationExecutionFloorViable',
        'Boolean proof gate for whether target recalibration can produce an executable entry.',
        'set_true_only_with_rr_and_buffer_pass',
        commonContext
      ),
      producerFieldRecommendation(
        'targetRecalibrationRequiredTargetDominantReason',
        'Explain whether stop-risk, target-buffer, execution-floor, or expected-return evidence controls the required target.',
        'populate_dominant_required_target_reason',
        commonContext
      ),
      producerFieldRecommendation(
        'targetRecalibrationViabilityVerdict',
        'Explicitly separate recalibration candidate from no-trade target geometry.',
        'emit_recalibration_or_no_trade_verdict',
        commonContext
      ),
      producerFieldRecommendation(
        'TARGET_RECALIBRATION_POLICY.maxRequiredTargetGapPct',
        'Policy threshold to review only after evidence proves recurrent target shortfall.',
        'review_threshold_do_not_blindly_relax',
        { ...commonContext, candidateValue: null }
      )
    ];
  }

  if (base.producerTrack === 'risk_geometry_recalculation') {
    return [
      producerFieldRecommendation(
        'riskGeometryRequiredTargetPrice',
        'Recompute the minimum target needed for the recalculated stop path.',
        'recompute_required_target',
        { ...commonContext, candidateValue: base.maxMagnitude }
      ),
      producerFieldRecommendation(
        'riskGeometryRrAtRequiredTargetAndRecalculatedStop',
        'Prove RR at required target and recalculated stop before any executable promotion.',
        'populate_rr_proof',
        commonContext
      ),
      producerFieldRecommendation(
        'riskGeometryTargetRecalibrationProofReady',
        'Final proof flag that stop, target, RR, and buffer checks are all coherent.',
        'set_true_only_when_all_geometry_checks_pass',
        commonContext
      ),
      producerFieldRecommendation(
        'riskGeometryRequiredStopValid',
        'Validate recalculated stop remains below current/entry and is finite.',
        'populate_stop_validity_proof',
        commonContext
      ),
      producerFieldRecommendation(
        'riskGeometryRecalculatedStopRrOk',
        'Validate recalculated stop reaches minimum RR without target chasing.',
        'populate_rr_gate_result',
        commonContext
      ),
      producerFieldRecommendation(
        'riskGeometryTargetBufferOk',
        'Validate current target buffer after recalculation.',
        'populate_target_buffer_gate_result',
        commonContext
      )
    ];
  }

  if (base.producerTrack === 'breakout_proof_confirmed_generation') {
    const policyField = base.adjustmentKnob === 'BREAKOUT_EXTENSION_POLICY'
      ? 'BREAKOUT_RETEST_PROOF_POLICY.maxCurrentExtensionFromRetestPct'
      : base.adjustmentKnob === 'BREAKOUT_RETEST_FRESHNESS_WINDOW'
        ? 'BREAKOUT_RETEST_PROOF_POLICY.maxBarsSinceRetest'
        : base.adjustmentKnob === 'BREAKOUT_CONTINUATION_RR_FLOOR'
          ? 'BREAKOUT_RETEST_PROOF_POLICY.continuationMinRrMultiplier'
          : base.adjustmentKnob === 'BREAKOUT_CONTINUATION_TARGET_BUFFER_FLOOR'
            ? 'BREAKOUT_RETEST_PROOF_POLICY.continuationMinTargetBufferMultiplier'
            : 'BREAKOUT_RETEST_PROOF_POLICY.maxReclaimUndercutExcessPct';
    return [
      producerFieldRecommendation(
        'breakoutRetestProofConfirmed',
        'Promotion blocker: only true proof can move breakout candidates toward executable.',
        'set_true_only_with_retest_freshness_reclaim_extension_and_rr_pass',
        commonContext
      ),
      producerFieldRecommendation(
        'breakoutRetestProofUndercutReclaimFound',
        'Detect bounded undercut-reclaim retests rather than treating all review-ready breakouts as executable.',
        'populate_undercut_reclaim_evidence',
        commonContext
      ),
      producerFieldRecommendation(
        policyField,
        'Policy field implied by the current breakout formula bottleneck.',
        'review_threshold_after_evidence_distribution_not_for_auto_promotion',
        { ...commonContext, candidateValue: base.adjustmentKnob === 'BREAKOUT_EXTENSION_POLICY' ? base.maxObservedValue : null }
      ),
      producerFieldRecommendation(
        'breakoutRetestPromotionPolicyDecision',
        'Keep reviewReady diagnostic separate from proofConfirmed promotion.',
        'emit_wait_until_proof_confirmed',
        commonContext
      )
    ];
  }

  if (base.producerTrack === 'structure_proof_generation') {
    return [
      producerFieldRecommendation(
        'currentEntryStructureVerdict',
        'Primary structure proof verdict for support-aligned recalculated-stop entries.',
        'improve_structure_proof_or_keep_wait',
        commonContext
      ),
      producerFieldRecommendation(
        'structurePolicyCurrentRrOk',
        'Do not promote structure candidates unless current RR evidence passes.',
        'populate_rr_gate_result',
        commonContext
      ),
      producerFieldRecommendation(
        'structurePolicyTargetBufferOk',
        'Do not promote structure candidates unless target buffer evidence passes.',
        'populate_target_buffer_gate_result',
        commonContext
      ),
      producerFieldRecommendation(
        'CURRENT_ENTRY_STRUCTURE_POLICY.maxReviewDistancePct',
        'Review distance band only if repeated evidence shows the band is overly restrictive.',
        'review_threshold_do_not_blindly_relax',
        commonContext
      )
    ];
  }

  return [];
}

function recommendationForGroup(groupRows) {
  const first = groupRows[0] || {};
  const producerTrack = first.producerTrack || 'unknown';
  const adjustmentKnob = first.adjustmentKnob || 'missing';
  const tuningLanes = [...new Set(groupRows.map((row) => row.zeroExecutableTuningLane).filter(Boolean))].sort();
  const contractTunablePolicyFields = [
    ...new Set(tuningLanes.flatMap((lane) => EXPECTED_TUNABLE_POLICY_FIELDS[lane] || []))
  ].sort();
  const magnitudes = groupRows.map((row) => Number(row.adjustmentMagnitude || row.deltaValue || row.severity || 0));
  const observedValues = groupRows.map((row) => Number(row.observedValue || 0));
  const thresholdValues = groupRows.map((row) => Number(row.thresholdValue || 0));
  const maxMagnitude = round(Math.max(...magnitudes, 0));
  const avgMagnitude = round(magnitudes.reduce((sum, value) => sum + value, 0) / Math.max(1, magnitudes.length));
  const maxObservedValue = round(Math.max(...observedValues, 0));
  const maxThresholdValue = round(Math.max(...thresholdValues, 0));
  const unit = first.unit || 'unknown';
  const base = {
    producerTrack,
    adjustmentKnob,
    symbols: groupRows.map((row) => row.symbol).sort(),
    count: groupRows.length,
    maxMagnitude,
    avgMagnitude,
    maxObservedValue,
    maxThresholdValue,
    unit,
    tuningLanes,
    contractTunablePolicyFields,
    promotionSafetyRules: EXPECTED_PROMOTION_SAFETY_RULES,
    producerOnly: true,
    brokerMutationAllowed: false,
    sidecarMutationAllowed: false
  };
  base.producerFieldRecommendations = producerFieldRecommendationsForGroup(groupRows, base);
  if (producerTrack === 'target_recalibration') {
    return {
      ...base,
      targetRecalibrationProofGapCounts: proofGapCounts(groupRows),
      formulaDecision: 'RECALIBRATE_TARGET_OR_CONFIRM_NO_TRADE',
      recommendedProducerChange: 'Refresh the Stage6 target thesis and fill target proof gaps using execution-floor and expected-return evidence. Keep sidecar reprice blocked. If the execution floor is not viable, emit no-trade.',
      candidateThresholdField: 'TARGET_RECALIBRATION_POLICY.maxRequiredTargetGapPct / TARGET_RECALIBRATION_POLICY.maxExecutionFloorGapPct',
      candidateThresholdValue: null,
      doneWhen: 'Rows either emit a fresh target above current with execution-floor RR/buffer evidence or explicit TARGET_NO_TRADE_CONFIRMED.'
    };
  }
  if (producerTrack === 'risk_geometry_recalculation') {
    return {
      ...base,
      formulaDecision: 'RECALCULATE_STOP_TARGET_GEOMETRY_OR_CONFIRM_NO_TRADE',
      recommendedProducerChange: 'Recompute stop/target together from current-entry risk and expose required-target RR/buffer proof. Do not lower RR/fillability floors to make this pass.',
      candidateThresholdField: 'riskGeometryRequiredTargetPrice / riskGeometryRrAtRequiredTargetAndRecalculatedStop',
      candidateThresholdValue: maxMagnitude,
      doneWhen: 'Rows provide targetAboveCurrent, stopValid, stopDistanceValid, recalculatedStopRrOk, targetBufferOk, and targetRecalibrationProofReady evidence or stay no-trade.'
    };
  }
  if (producerTrack === 'breakout_proof_confirmed_generation') {
    return {
      ...base,
      formulaDecision: 'IMPROVE_BREAKOUT_PROOF_CONFIRMED_GENERATION',
      recommendedProducerChange: 'Tune proof generation only, including bounded undercut-reclaim retests. reviewReady remains diagnostic; promotion requires proofConfirmed plus RR/distance/target-buffer pass.',
      candidateThresholdField: adjustmentKnob === 'BREAKOUT_EXTENSION_POLICY'
        ? 'BREAKOUT_RETEST_PROOF_POLICY.maxCurrentExtensionFromRetestPct'
        : adjustmentKnob === 'BREAKOUT_RETEST_FRESHNESS_WINDOW'
          ? 'BREAKOUT_RETEST_PROOF_POLICY.maxBarsSinceRetest'
          : 'BREAKOUT_RETEST_PROOF_POLICY.maxReclaimUndercutExcessPct / proofConfirmed criteria',
      candidateThresholdValue: adjustmentKnob === 'BREAKOUT_EXTENSION_POLICY' ? maxObservedValue : null,
      doneWhen: 'Rows expose proofConfirmed=true only when retest touch or bounded undercut reclaim, freshness, close reclaim, extension, and continuation evidence pass.'
    };
  }
  if (producerTrack === 'structure_proof_generation') {
    return {
      ...base,
      formulaDecision: 'IMPROVE_STRUCTURE_PROOF_NOT_RELAX_GATE',
      recommendedProducerChange: 'Improve support/RR/distance proof generation. Do not convert structure reject to executable by default.',
      candidateThresholdField: adjustmentKnob === 'CURRENT_ENTRY_STRUCTURE_RR_EVIDENCE'
        ? 'executionFeasibilityAtCurrentMinRr'
        : adjustmentKnob === 'CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND'
          ? 'CURRENT_ENTRY_STRUCTURE_POLICY.maxReviewDistancePct'
          : 'CURRENT_ENTRY_STRUCTURE_POLICY.support proof',
      candidateThresholdValue: null,
      doneWhen: 'Rows either produce structure confirmed support-aligned stop evidence with RR/buffer/distance pass or remain WAIT.'
    };
  }
  return {
    ...base,
    formulaDecision: 'NO_PRODUCER_TUNING_ACTION',
    recommendedProducerChange: 'No formula bottleneck is actionable for this group.',
    candidateThresholdField: null,
    candidateThresholdValue: null,
    doneWhen: 'No action.'
  };
}

function buildTuningRecommendations(producerRows) {
  const groups = new Map();
  for (const row of producerRows) {
    const key = `${row.producerTrack || 'unknown'}::${row.adjustmentKnob || 'missing'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()]
    .map(recommendationForGroup)
    .sort((a, b) => b.maxMagnitude - a.maxMagnitude || b.count - a.count || a.producerTrack.localeCompare(b.producerTrack));
}

function sortedUnique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))].sort();
}

function numericRange(values) {
  const nums = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!nums.length) return { min: null, max: null };
  return { min: round(Math.min(...nums)), max: round(Math.max(...nums)) };
}

function producerTrackDiagnostics(producerRows, tuningRecommendations) {
  const byTrack = new Map();
  for (const row of producerRows) {
    const track = row.producerTrack || 'unknown';
    if (!byTrack.has(track)) byTrack.set(track, []);
    byTrack.get(track).push(row);
  }
  const recommendationsByTrack = new Map();
  for (const recommendation of tuningRecommendations) {
    const track = recommendation.producerTrack || 'unknown';
    if (!recommendationsByTrack.has(track)) recommendationsByTrack.set(track, []);
    recommendationsByTrack.get(track).push(recommendation);
  }
  return [...byTrack.entries()]
    .map(([track, rows]) => {
      const recommendations = recommendationsByTrack.get(track) || [];
      const magnitudes = rows.map((row) => row.adjustmentMagnitude || row.deltaValue || row.severity || 0);
      const totalMagnitude = round(magnitudes.reduce((sum, value) => sum + Number(value || 0), 0));
      const fieldRecommendations = recommendations.flatMap((row) => row.producerFieldRecommendations || []);
      return {
        producerTrack: track,
        count: rows.length,
        symbols: sortedUnique(rows.map((row) => row.symbol)),
        adjustmentKnobs: countBy(rows, (row) => row.adjustmentKnob || 'missing'),
        evidenceBases: sortedUnique(rows.map((row) => row.evidenceBasis || 'missing')),
        observedRange: numericRange(rows.map((row) => row.observedValue)),
        thresholdRange: numericRange(rows.map((row) => row.thresholdValue)),
        totalMagnitude,
        maxMagnitude: round(Math.max(...magnitudes.map((value) => Number(value || 0)), 0)),
        weakEvidenceRows: rows.filter((row) => row.formulaEvidenceWeak).length,
        laneMismatchRows: rows.filter((row) => row.formulaLaneMismatch).length,
        missingFormulaRows: rows.filter((row) => (row.missingFormulaFields || []).length > 0).length,
        missingLaneSpecificRows: rows.filter((row) => (row.missingLaneSpecificFields || []).length > 0).length,
        targetRecalibrationProofGapCounts: track === 'target_recalibration' ? proofGapCounts(rows) : {},
        recommendedProducerFields: sortedUnique(fieldRecommendations.map((row) => row.field)),
        recommendedPolicyFields: sortedUnique(recommendations.flatMap((row) => row.contractTunablePolicyFields || [])),
        nextAction: 'stage6_producer_formula_or_proof_generation_only',
        brokerMutationAllowed: false,
        sidecarMutationAllowed: false
      };
    })
    .sort((a, b) => b.totalMagnitude - a.totalMagnitude || b.count - a.count || a.producerTrack.localeCompare(b.producerTrack));
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Formula Tuning Backlog');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| overall | ${esc(report.overall)} |`);
  lines.push(`| stage6 | ${esc(report.stage6.file)} |`);
  lines.push(`| sourceSha | ${esc(report.stage6.source?.sha)} |`);
  lines.push(`| expectedSourceSha | ${esc(report.runtimeProof.expectedSourceSha)} |`);
  lines.push(`| sourceShaMatchesExpected | ${esc(report.runtimeProof.sourceShaMatchesExpected)} |`);
  lines.push(`| formulaContractVersion | ${esc(report.stage6.formulaContractVersion)} |`);
  lines.push(`| runtimeProof.status | ${esc(report.runtimeProof.status)} |`);
  lines.push(`| rows | ${report.summary.rows} |`);
  lines.push(`| producerReviewRows | ${report.summary.producerReviewRows} |`);
  lines.push(`| missingFormulaRows | ${report.summary.missingFormulaRows} |`);
  lines.push(`| missingLaneSpecificRows | ${report.summary.missingLaneSpecificRows} |`);
  lines.push(`| formulaLaneMismatchRows | ${report.summary.formulaLaneMismatchRows} |`);
  lines.push(`| formulaEvidenceWeakRows | ${report.summary.formulaEvidenceWeakRows} |`);
  lines.push(`| formulaContractIssues | ${report.summary.formulaContractIssues} |`);
  lines.push(`| tuningRecommendationCount | ${report.summary.tuningRecommendationCount} |`);
  lines.push(`| producerFieldRecommendationCount | ${report.summary.producerFieldRecommendationCount} |`);
  lines.push(`| topProducerTrack | ${esc(report.summary.topProducerTrack)} |`);
  lines.push(`| topAdjustmentKnob | ${esc(report.summary.topAdjustmentKnob)} |`);
  lines.push('');
  lines.push('## Track Counts');
  lines.push('');
  lines.push(`- producerTrackCounts: \`${JSON.stringify(report.summary.producerTrackCounts)}\``);
  lines.push(`- adjustmentKnobCounts: \`${JSON.stringify(report.summary.adjustmentKnobCounts)}\``);
  lines.push('');
  lines.push('## Backlog Rows');
  lines.push('');
  lines.push('| Symbol | Decision | Track | Knob | Direction | Magnitude | Row Evidence | Target Evidence | Structure Evidence | Lane Mismatch | Weak Evidence | Missing Lane Fields | Action |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.backlogRows) {
    const laneMismatch = row.formulaLaneMismatch ? `${row.formulaBottleneck || 'missing'}!=${row.expectedFormulaBottleneck || 'unknown'}` : 'no';
    const structure = row.structureProofEvidence || {};
    const structureEvidence = `verdict=${structure.currentEntryStructureVerdict || 'N/A'} lane=${structure.structurePolicyBlockerLane || 'N/A'} rrOk=${structure.structurePolicyCurrentRrOk} bufferOk=${structure.structurePolicyTargetBufferOk} distOk=${structure.structurePolicyDistanceWithinReviewBand}`;
    lines.push(`| ${esc(row.symbol)} | ${esc(`${row.finalDecision}/${row.decisionReason}`)} | ${esc(row.producerTrack)} | ${esc(row.adjustmentKnob)} | ${esc(row.adjustmentDirection)} | ${esc(row.adjustmentMagnitude)} | ${esc(row.rowEvidenceSummary)} | ${esc(row.targetRecalibrationProofSummary)} | ${esc(structureEvidence)} | ${esc(laneMismatch)} | ${row.formulaEvidenceWeak ? 'yes' : 'no'} | ${esc((row.missingLaneSpecificFields || []).join(', ') || 'none')} | ${esc(row.actionRequired)} |`);
  }
  if (!report.backlogRows.length) lines.push('| none | none | none | none | none | N/A | none | none | none | no | no | none | none |');
  lines.push('');
  lines.push('## Tuning Recommendations');
  lines.push('');
  lines.push('| Track | Knob | Symbols | Max Magnitude | Avg Magnitude | Decision | Candidate Field | Candidate Value | Proof Gaps | Producer Change | Done When |');
  lines.push('| --- | --- | --- | ---: | ---: | --- | --- | ---: | --- | --- | --- |');
  for (const row of report.tuningRecommendations) {
    const producerChange = `${row.recommendedProducerChange} Contract fields: ${(row.contractTunablePolicyFields || []).join(', ') || 'none'}.`;
    lines.push(`| ${esc(row.producerTrack)} | ${esc(row.adjustmentKnob)} | ${esc(row.symbols.join(', ') || 'none')} | ${esc(row.maxMagnitude)} | ${esc(row.avgMagnitude)} | ${esc(row.formulaDecision)} | ${esc(row.candidateThresholdField)} | ${esc(row.candidateThresholdValue)} | ${esc(JSON.stringify(row.targetRecalibrationProofGapCounts || {}))} | ${esc(producerChange)} | ${esc(row.doneWhen)} |`);
  }
  if (!report.tuningRecommendations.length) lines.push('| none | none | none | N/A | N/A | none | none | N/A | {} | none | none |');
  lines.push('');
  lines.push('## Producer Track Diagnostics');
  lines.push('');
  lines.push('| Track | Count | Symbols | Knobs | Evidence Bases | Observed Range | Threshold Range | Target Proof Gaps | Required Producer Fields | Next Action |');
  lines.push('| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.producerTrackDiagnostics) {
    const observed = `${row.observedRange?.min ?? 'N/A'}..${row.observedRange?.max ?? 'N/A'}`;
    const threshold = `${row.thresholdRange?.min ?? 'N/A'}..${row.thresholdRange?.max ?? 'N/A'}`;
    lines.push(`| ${esc(row.producerTrack)} | ${esc(row.count)} | ${esc(row.symbols.join(', ') || 'none')} | ${esc(JSON.stringify(row.adjustmentKnobs))} | ${esc(row.evidenceBases.join(', ') || 'none')} | ${esc(observed)} | ${esc(threshold)} | ${esc(JSON.stringify(row.targetRecalibrationProofGapCounts || {}))} | ${esc(row.recommendedProducerFields.join(', ') || 'none')} | ${esc(row.nextAction)} |`);
  }
  if (!report.producerTrackDiagnostics.length) lines.push('| none | 0 | none | {} | none | N/A | N/A | {} | none | none |');
  lines.push('');
  lines.push('## Producer Field Recommendations');
  lines.push('');
  lines.push('| Track | Knob | Field | Action | Purpose | Candidate Value | Guardrail |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- |');
  const producerFieldRows = report.tuningRecommendations.flatMap((recommendation) =>
    (recommendation.producerFieldRecommendations || []).map((fieldRecommendation) => ({
      producerTrack: recommendation.producerTrack,
      adjustmentKnob: recommendation.adjustmentKnob,
      ...fieldRecommendation
    }))
  );
  for (const row of producerFieldRows) {
    lines.push(`| ${esc(row.producerTrack)} | ${esc(row.adjustmentKnob)} | ${esc(row.field)} | ${esc(row.action)} | ${esc(row.purpose)} | ${esc(row.candidateValue)} | ${esc(row.guardrail)} |`);
  }
  if (!producerFieldRows.length) lines.push('| none | none | none | none | none | N/A | none |');
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  lines.push('- This backlog is producer-only. It must not enable broker submit, replace, reprice, or sidecar mutation.');
  lines.push('- If `runtimeProof.status=pending_fresh_stage6_source_sha`, do not tune policy from this artifact; generate a fresh Stage6 from the expected head first.');
  lines.push('- `REFRESH_STAGE6_FORMULA_CONTRACT` means the artifact manifest does not publish the current formula contract; generate a fresh Stage6 or fix manifest propagation before tuning.');
  lines.push('- `REFRESH_STAGE6_WITH_FORMULA_V4` means the artifact predates the current contract; do not infer tuning from stale rows.');
  lines.push('- `REFRESH_STAGE6_FORMULA_LANE_MAPPING` means the row lane and formula bottleneck disagree; fix producer classification before threshold tuning.');
  lines.push('- `REFRESH_STAGE6_FORMULA_EVIDENCE` means the row has current formula fields but zero/weak formula evidence; refresh producer evidence before changing thresholds.');
  lines.push('- `PRODUCER_TUNING_REVIEW` means tune Stage6 formulas or proof generation, not execution-side filters.');
  return lines.join('\n') + '\n';
}

function sourceFreshnessStatus(sourceSha) {
  if (!EXPECTED_SOURCE_SHA) {
    return {
      status: 'not_required',
      sourceShaMatchesExpected: null,
      freshSourceViolation: false,
      nextAction: null
    };
  }
  const matches = sourceSha === EXPECTED_SOURCE_SHA;
  return {
    status: matches ? 'pass_fresh_stage6_source_sha' : 'pending_fresh_stage6_source_sha',
    sourceShaMatchesExpected: matches,
    freshSourceViolation: !matches,
    nextAction: matches ? null : 'generate_fresh_stage6_after_expected_head'
  };
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const sourceAudit = stage6SourceAudit(stage6);
  const sourceFreshness = sourceFreshnessStatus(sourceAudit.sha);
  const contractIssues = formulaContractIssues(stage6);
  const rows = uniqueRows(stage6).map((row) => rowBacklog(row, contractIssues.length > 0));
  const missingFormulaRows = rows.filter((row) => row.missingFormulaFields.length > 0);
  const missingLaneSpecificRows = rows.filter((row) => row.missingLaneSpecificFields.length > 0);
  const formulaLaneMismatchRows = rows.filter((row) => row.formulaLaneMismatch);
  const formulaEvidenceWeakRows = rows.filter((row) => row.formulaEvidenceWeak);
  const producerRows = rows.filter((row) => row.actionRequired === 'PRODUCER_TUNING_REVIEW');
  const rankedRows = rankRows(rows);
  const producerTrackAggregation = aggregate(producerRows, 'producerTrack');
  const adjustmentKnobAggregation = aggregate(producerRows, 'adjustmentKnob');
  const tuningRecommendations = buildTuningRecommendations(producerRows);
  const trackDiagnostics = producerTrackDiagnostics(producerRows, tuningRecommendations);
  const topProducerTrack = Object.entries(producerTrackAggregation).sort((a, b) => b[1].totalMagnitude - a[1].totalMagnitude || b[1].count - a[1].count)[0]?.[0] || 'none';
  const topAdjustmentKnob = Object.entries(adjustmentKnobAggregation).sort((a, b) => b[1].totalMagnitude - a[1].totalMagnitude || b[1].count - a[1].count)[0]?.[0] || 'none';
  const overall = rows.length === 0
    ? 'fail_no_rows'
    : sourceFreshness.freshSourceViolation
      ? 'warn_formula_tuning_stale_source'
    : contractIssues.length > 0
      ? 'warn_formula_tuning_contract_incomplete'
    : missingFormulaRows.length > 0 || missingLaneSpecificRows.length > 0
      ? 'warn_formula_tuning_formula_fields_missing'
    : formulaLaneMismatchRows.length > 0
      ? 'warn_formula_tuning_lane_mismatch'
    : formulaEvidenceWeakRows.length > 0
      ? 'warn_formula_tuning_evidence_weak'
      : producerRows.length > 0
        ? 'pass_formula_tuning_backlog_ready'
        : 'pass_no_formula_tuning_action_required';
  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || sha256(stage6Path),
      formulaContractVersion: contractVersion(stage6),
      source: sourceAudit
    },
    runtimeProof: {
      status: sourceFreshness.status,
      expectedSourceSha: EXPECTED_SOURCE_SHA,
      sourceSha: sourceAudit.sha,
      sourceShaMatchesExpected: sourceFreshness.sourceShaMatchesExpected,
      enforceFreshSource: ENFORCE_FRESH_SOURCE,
      freshSourceViolation: sourceFreshness.freshSourceViolation
    },
    summary: {
      rows: rows.length,
      producerReviewRows: producerRows.length,
      missingFormulaRows: missingFormulaRows.length,
      missingLaneSpecificRows: missingLaneSpecificRows.length,
      formulaLaneMismatchRows: formulaLaneMismatchRows.length,
      formulaEvidenceWeakRows: formulaEvidenceWeakRows.length,
      formulaContractIssues: contractIssues.length,
      tuningRecommendationCount: tuningRecommendations.length,
      producerFieldRecommendationCount: tuningRecommendations.reduce(
        (sum, recommendation) => sum + (recommendation.producerFieldRecommendations || []).length,
        0
      ),
      producerTrackDiagnosticCount: trackDiagnostics.length,
      producerTrackCounts: countBy(rows, (row) => row.producerTrack),
      adjustmentKnobCounts: countBy(rows, (row) => row.adjustmentKnob || 'missing'),
      targetRecalibrationProofGapCounts: proofGapCounts(producerRows.filter((row) => row.producerTrack === 'target_recalibration')),
      producerTrackAggregation,
      adjustmentKnobAggregation,
      topProducerTrack,
      topAdjustmentKnob,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false
    },
    backlogRows: rankedRows,
    tuningRecommendations,
    producerTrackDiagnostics: trackDiagnostics,
    formulaContractIssues: contractIssues,
    guardrails: {
      producerOnly: true,
      brokerSubmitReplaceRepriceAllowed: false,
      sidecarMutationAllowed: false,
      nextAction: sourceFreshness.nextAction
        ? sourceFreshness.nextAction
        : contractIssues.length > 0
        ? 'generate_fresh_stage6_after_formula_v4_head_or_fix_manifest_contract'
        : missingFormulaRows.length > 0 || missingLaneSpecificRows.length > 0
        ? 'generate_fresh_stage6_after_formula_v4_head'
        : formulaLaneMismatchRows.length > 0
          ? 'refresh_stage6_formula_lane_mapping'
        : formulaEvidenceWeakRows.length > 0
          ? 'refresh_stage6_formula_evidence_before_tuning_thresholds'
        : producerRows.length > 0
          ? 'tune_stage6_producer_formula_or_proof_generation'
          : 'no_formula_tuning_action_required'
    }
  };
  ensureParent(OUT_JSON);
  fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  ensureParent(OUT_MD);
  fs.writeFileSync(resolveRepo(OUT_MD), buildMarkdown(report));
  console.log(`[STAGE6_FORMULA_TUNING_BACKLOG] overall=${report.overall} rows=${rows.length} producerReview=${producerRows.length} topTrack=${topProducerTrack} json=${OUT_JSON}`);
  if (ENFORCE_FRESH_SOURCE && sourceFreshness.freshSourceViolation) {
    console.error(`[STAGE6_FORMULA_TUNING_BACKLOG] fresh source enforcement failed expected=${EXPECTED_SOURCE_SHA || 'none'} actual=${sourceAudit.sha || 'missing'}`);
    process.exit(1);
  }
}

main();
