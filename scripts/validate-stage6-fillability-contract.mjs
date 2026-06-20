#!/usr/bin/env node
import fs from 'node:fs';
const fixturePath = process.env.STAGE6_FILLABILITY_CONTRACT_FIXTURE || 'docs/fixtures/stage6_sidecar_entry_fillability_contract.fixture.json';
const schemaPath = process.env.STAGE6_FILLABILITY_CONTRACT_SCHEMA || 'schemas/stage6_sidecar_entry_fillability_contract.schema.json';
const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const candidates = Array.isArray(data.candidates) ? data.candidates : [];
const actionableVerdicts = new Set(
  String(data?.decisionGate?.actionableVerdicts || 'BUY,STRONG_BUY,STRONGBUY')
    .split(',')
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean)
);
const errors = [];
const verdictKey = (value) => String(value || '').replace(/[^a-zA-Z0-9_]/g, '').toUpperCase().trim();
const breakoutPromotionEnabled = data?.decisionGate?.breakoutRetestProofPromotionEnabled === true;
const weakPillarGateEnabled = data?.decisionGate?.weakPillarGateEnabled === true;
const weakPillarMinFundamentalScore = Number(data?.decisionGate?.weakPillarMinFundamentalScore ?? 50);
const weakPillarMinTechnicalScore = Number(data?.decisionGate?.weakPillarMinTechnicalScore ?? 50);
const weakPillarMinIctScore = Number(data?.decisionGate?.weakPillarMinIctScore ?? 60);
const isTrue = (value) => value === true || String(value).toLowerCase() === 'true';
const isBooleanLike = (value) => value === true || value === false || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'false';
const isFiniteNumber = (value) => value !== null && value !== '' && value !== undefined && !Number.isNaN(Number(value)) && Number.isFinite(Number(value));
const tuningLane = (row) => String(row.zeroExecutableTuningLane || '').trim().toUpperCase();
const formulaBottleneck = (row) => String(row.zeroExecutableFormulaBottleneck || '').trim().toUpperCase();
const stringArray = (value) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : []);
const positiveNumber = (value) => isFiniteNumber(value) && Number(value) > 0;
const riskFormulaReasonPattern = /risk|stop|target|geometry|recalculated|proof/i;
const schemaCandidateProperties = schema?.$defs?.stage6Candidate?.properties || {};
const requiredSchemaFields = [
  'zeroExecutableTuningLane',
  'zeroExecutableTuningVerdict',
  'zeroExecutablePrimaryTuningTarget',
  'zeroExecutableFormulaBottleneck',
  'zeroExecutableFormulaSeverity',
  'zeroExecutableTargetShortfallPct',
  'zeroExecutableRiskTargetShortfallPct',
  'zeroExecutableBreakoutProofGapCount',
  'zeroExecutableStructureProofGapCount',
  'zeroExecutableFormulaReasons',
  'zeroExecutableFormulaRecommendedAction',
  'targetRecalibrationRequired',
  'targetNoChaseRequired',
  'targetRecalibrationRequiredTargetByBufferPrice',
  'targetRecalibrationRequiredTargetByRrPrice',
  'targetRecalibrationSourcePrice',
  'targetRecalibrationSourceStopPrice',
  'targetRecalibrationStopDistanceAtCurrent',
  'targetRecalibrationRequiredTargetSource',
  'riskGeometryPolicyVerdict',
  'riskGeometryRecalibrationRequired',
  'riskGeometryNoTradeRequired',
  'riskGeometryRecalculatedStopCandidate',
  'riskGeometryRequiredTargetBufferPct',
  'riskGeometryTargetRecalibrationCandidate',
  'breakoutRetestProofConfirmed',
  'breakoutRetestProofReviewReady',
  'breakoutRetestProofContinuationConfirmed',
  'breakoutRetestProofContinuationExtensionOk',
  'breakoutRetestPromotionReady',
  'breakoutRetestPromotionEligible',
  'breakoutRetestPromotionEnabled',
  'breakoutRetestPromotionVerdict',
  'breakoutRetestPromotionEntryBasis',
  'breakoutRetestPromotionPolicyDecision',
  'breakoutRetestPromotionBlockedBy',
  'structurePolicyVerdict',
  'structurePolicyReviewReady',
  'currentEntryStructureVerdict',
  'currentEntryRecalcFeasible',
  'currentEntryStructureConfirmed',
  'currentEntryRequiredStopPrice',
  'currentEntryRequiredStopDistancePct',
  'executionActionableVerdict'
];
for (const field of requiredSchemaFields) {
  if (!Object.prototype.hasOwnProperty.call(schemaCandidateProperties, field)) {
    errors.push(`schema missing Stage6 fillability contract field: ${field}`);
  }
}
const riskGeometryReasons = new Set([
  'blocked_invalid_geometry',
  'blocked_stop_too_tight',
  'blocked_stop_too_wide',
  'blocked_target_too_close',
  'blocked_rr_below_min',
  'wait_current_rr_below_min',
  'wait_recalculated_stop_required',
  'wait_target_near_current'
]);
for (const [idx, row] of candidates.entries()) {
  const label = `${row.symbol || `row_${idx}`}`;
  if (!row.symbol) errors.push(`${label}: symbol missing`);
  if (!['EXECUTABLE_NOW', 'WAIT_PRICE', 'BLOCKED_RISK', 'BLOCKED_EVENT'].includes(row.finalDecision)) errors.push(`${label}: invalid finalDecision`);
  if (!['PASS', 'BLOCKED', 'UNKNOWN'].includes(row.executionFeasibilityAtCurrent)) errors.push(`${label}: invalid executionFeasibilityAtCurrent`);
  const actionableVerdict = actionableVerdicts.has(verdictKey(row.aiVerdict || row.verdictFinal || row.verdict));
  if (row.finalDecision === 'EXECUTABLE_NOW') {
    if (!actionableVerdict) errors.push(`${label}: executable verdict is not sidecar-actionable`);
    if (row.executionActionableVerdict !== true) errors.push(`${label}: executable must declare executionActionableVerdict=true`);
    if (row.executionFeasibilityAtCurrent !== 'PASS') errors.push(`${label}: executable must have current feasibility PASS`);
    if (Number(row.executionFeasibilityAtCurrentRr) < Number(row.executionFeasibilityAtCurrentMinRr)) errors.push(`${label}: executable current RR below min`);
    if (Number(row.executionFeasibilityAtCurrentDistancePct) > Number(row.executionFeasibilityAtCurrentMaxDistancePct)) errors.push(`${label}: executable current distance above adaptive band`);
    const hasWeakPillarScores = [row.fundamentalScore, row.technicalScore, row.ictScore].some(isFiniteNumber);
    if (weakPillarGateEnabled && hasWeakPillarScores && !isTrue(row.weakPillarGateWaiver)) {
      if (!isFiniteNumber(row.fundamentalScore) || Number(row.fundamentalScore) < weakPillarMinFundamentalScore) {
        errors.push(`${label}: executable weak-pillar gate failed fundamentalScore`);
      }
      if (!isFiniteNumber(row.technicalScore) || Number(row.technicalScore) < weakPillarMinTechnicalScore) {
        errors.push(`${label}: executable weak-pillar gate failed technicalScore`);
      }
      if (!isFiniteNumber(row.ictScore) || Number(row.ictScore) < weakPillarMinIctScore) {
        errors.push(`${label}: executable weak-pillar gate failed ictScore`);
      }
    }
  }
  if (!actionableVerdict && row.finalDecision === 'WAIT_PRICE' && row.decisionReason === 'wait_verdict_not_sidecar_actionable' && row.executionActionableVerdict !== false) {
    errors.push(`${label}: non-actionable wait must declare executionActionableVerdict=false`);
  }
  if (row.finalDecision === 'WAIT_PRICE' && row.decisionReason === 'wait_verdict_not_sidecar_actionable') {
    if (row.qualityGateLane !== 'non_actionable_verdict') {
      errors.push(`${label}: non-actionable wait must declare qualityGateLane=non_actionable_verdict`);
    }
    if (row.qualityGatePolicyVerdict !== 'QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT') {
      errors.push(`${label}: non-actionable wait must declare QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT`);
    }
    if (!Array.isArray(row.qualityGateReasons)) errors.push(`${label}: non-actionable wait missing qualityGateReasons array`);
  }
  if (row.finalDecision === 'WAIT_PRICE' && row.decisionReason === 'wait_weak_pillar_execution_gate') {
    if (row.qualityGateLane !== 'weak_pillar_execution_gate') {
      errors.push(`${label}: weak-pillar wait must declare qualityGateLane=weak_pillar_execution_gate`);
    }
    if (row.qualityGatePolicyVerdict !== 'QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT') {
      errors.push(`${label}: weak-pillar wait must declare QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT`);
    }
    if (row.weakPillarGateVerdict !== 'WEAK_PILLAR_GATE_BLOCKED_EXECUTION') {
      errors.push(`${label}: weak-pillar wait must declare WEAK_PILLAR_GATE_BLOCKED_EXECUTION`);
    }
    if (!Array.isArray(row.weakPillarGateReasons) || row.weakPillarGateReasons.length === 0) {
      errors.push(`${label}: weak-pillar wait missing weakPillarGateReasons array`);
    }
    if (isTrue(row.weakPillarGateWaiver)) {
      errors.push(`${label}: weak-pillar wait cannot have weakPillarGateWaiver=true`);
    }
  }
  if (row.executionFeasibilityAtCurrent === 'BLOCKED' && !String(row.decisionReason || '').startsWith('wait_') && !String(row.decisionReason || '').startsWith('blocked_')) {
    errors.push(`${label}: blocked current feasibility needs wait_/blocked_ decisionReason`);
  }
  if (!row.zeroExecutableFormulaBottleneck) errors.push(`${label}: missing zeroExecutableFormulaBottleneck`);
  if (!isFiniteNumber(row.zeroExecutableFormulaSeverity)) errors.push(`${label}: missing numeric zeroExecutableFormulaSeverity`);
  if (!isFiniteNumber(row.zeroExecutableBreakoutProofGapCount)) errors.push(`${label}: missing numeric zeroExecutableBreakoutProofGapCount`);
  if (!isFiniteNumber(row.zeroExecutableStructureProofGapCount)) errors.push(`${label}: missing numeric zeroExecutableStructureProofGapCount`);
  if (!Array.isArray(row.zeroExecutableFormulaReasons)) errors.push(`${label}: missing zeroExecutableFormulaReasons array`);
  if (!stringArray(row.zeroExecutableFormulaReasons).length) errors.push(`${label}: zeroExecutableFormulaReasons must contain formula evidence`);
  if (!String(row.zeroExecutableFormulaRecommendedAction || '').trim()) errors.push(`${label}: missing zeroExecutableFormulaRecommendedAction`);
  if (tuningLane(row) === 'TARGET_RECALIBRATION') {
    if (formulaBottleneck(row) !== 'TARGET_RECALIBRATION_FORMULA') errors.push(`${label}: target lane must expose TARGET_RECALIBRATION_FORMULA bottleneck`);
    if (!isFiniteNumber(row.zeroExecutableTargetShortfallPct)) errors.push(`${label}: target lane missing zeroExecutableTargetShortfallPct`);
    if (!positiveNumber(row.zeroExecutableTargetShortfallPct)) errors.push(`${label}: target lane must expose positive target shortfall evidence`);
  }
  if (['STOP_TARGET_RISK_GEOMETRY_RECALCULATION', 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION'].includes(tuningLane(row))) {
    if (formulaBottleneck(row) !== 'RISK_GEOMETRY_RECALCULATION_FORMULA') errors.push(`${label}: risk lane must expose RISK_GEOMETRY_RECALCULATION_FORMULA bottleneck`);
    if (!isFiniteNumber(row.zeroExecutableRiskTargetShortfallPct)) errors.push(`${label}: risk lane missing zeroExecutableRiskTargetShortfallPct`);
    if (Number(row.zeroExecutableFormulaSeverity) <= 0) errors.push(`${label}: risk lane must expose positive formula severity`);
    if (!stringArray(row.zeroExecutableFormulaReasons).some((reason) => riskFormulaReasonPattern.test(reason))) {
      errors.push(`${label}: risk lane formula reasons must name risk/stop/target geometry evidence`);
    }
  }
  if (tuningLane(row) === 'BREAKOUT_PROOF_CONFIRMED_GENERATION') {
    if (formulaBottleneck(row) !== 'BREAKOUT_PROOF_FORMULA') errors.push(`${label}: breakout lane must expose BREAKOUT_PROOF_FORMULA bottleneck`);
    if (Number(row.zeroExecutableBreakoutProofGapCount) <= 0) errors.push(`${label}: breakout lane must expose positive proof gap count`);
  }
  if (tuningLane(row) === 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') {
    if (formulaBottleneck(row) !== 'STRUCTURE_PROOF_FORMULA') errors.push(`${label}: structure lane must expose STRUCTURE_PROOF_FORMULA bottleneck`);
    if (Number(row.zeroExecutableStructureProofGapCount) <= 0) errors.push(`${label}: structure lane must expose positive proof gap count`);
  }
  if (tuningLane(row) === 'NO_ZERO_EXECUTABLE_TUNING_ACTION') {
    if (formulaBottleneck(row) !== 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK') errors.push(`${label}: no-action lane must expose neutral formula bottleneck`);
    if (Number(row.zeroExecutableFormulaSeverity) !== 0) errors.push(`${label}: no-action lane must expose zero formula severity`);
    if (positiveNumber(row.zeroExecutableTargetShortfallPct) || positiveNumber(row.zeroExecutableRiskTargetShortfallPct) || positiveNumber(row.zeroExecutableBreakoutProofGapCount) || positiveNumber(row.zeroExecutableStructureProofGapCount)) {
      errors.push(`${label}: no-action lane cannot expose positive formula gaps`);
    }
  }
  if (row.decisionReason === 'executable_breakout_retest_confirmed' && !breakoutPromotionEnabled) {
    errors.push(`${label}: breakout proof promotion executable used while decisionGate breakoutRetestProofPromotionEnabled=false`);
  }
  if (row.decisionReason === 'executable_breakout_retest_confirmed') {
    if (!isTrue(row.breakoutRetestPromotionReady)) errors.push(`${label}: executable breakout promotion must declare breakoutRetestPromotionReady=true`);
    if (row.breakoutRetestPromotionEntryBasis !== 'BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT') {
      errors.push(`${label}: executable breakout promotion must declare BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT entry basis`);
    }
  }
  if (row.decisionReason === 'executable_adaptive_current') {
    errors.push(`${label}: proof-less executable_adaptive_current is not allowed; use executable_current_recalculated_stop or executable_breakout_retest_confirmed`);
  }
  if (
    String(row.chosenPlanType || '').toUpperCase() === 'ADAPTIVE_RECALC_STOP' &&
    row.finalDecision === 'EXECUTABLE_NOW' &&
    row.decisionReason !== 'executable_current_recalculated_stop'
  ) {
    errors.push(`${label}: executable ADAPTIVE_RECALC_STOP must preserve executable_current_recalculated_stop reason`);
  }
  if (row.decisionReason === 'executable_current_recalculated_stop') {
    if (row.finalDecision !== 'EXECUTABLE_NOW') errors.push(`${label}: recalculated-stop executable reason must remain EXECUTABLE_NOW`);
    if (!isTrue(row.currentEntryRecalcFeasible)) errors.push(`${label}: recalculated-stop executable must keep currentEntryRecalcFeasible=true`);
    if (!isTrue(row.currentEntryStructureConfirmed)) errors.push(`${label}: recalculated-stop executable must keep currentEntryStructureConfirmed=true`);
    if (!isFiniteNumber(row.currentEntryRequiredStopPrice)) errors.push(`${label}: recalculated-stop executable missing currentEntryRequiredStopPrice`);
    if (!isFiniteNumber(row.entryExecPrice)) errors.push(`${label}: recalculated-stop executable missing entryExecPrice`);
    if (!isFiniteNumber(row.price)) errors.push(`${label}: recalculated-stop executable missing price`);
    if (isFiniteNumber(row.entryExecPrice) && isFiniteNumber(row.price) && Math.abs(Number(row.entryExecPrice) - Number(row.price)) > 0.01) {
      errors.push(`${label}: recalculated-stop executable entryExecPrice must be current price`);
    }
    if (isFiniteNumber(row.stopPrice) && isFiniteNumber(row.currentEntryRequiredStopPrice) && Math.abs(Number(row.stopPrice) - Number(row.currentEntryRequiredStopPrice)) > 0.01) {
      errors.push(`${label}: recalculated-stop executable stopPrice must be currentEntryRequiredStopPrice`);
    }
  }
  if (row.decisionReason === 'wait_breakout_retest_required') {
    if (row.finalDecision === 'EXECUTABLE_NOW') errors.push(`${label}: breakout retest wait cannot be executable`);
    if (tuningLane(row) !== 'BREAKOUT_PROOF_CONFIRMED_GENERATION') {
      errors.push(`${label}: breakout wait must route to BREAKOUT_PROOF_CONFIRMED_GENERATION`);
    }
    if (!isTrue(row.breakoutRetestProofConfirmed) && isTrue(row.breakoutRetestPromotionEligible)) {
      errors.push(`${label}: breakout promotion eligible without proofConfirmed=true`);
    }
    if (isTrue(row.breakoutRetestProofReviewReady) && !String(row.breakoutRetestPromotionVerdict || '').includes('NOT_PROMOTABLE')) {
      errors.push(`${label}: reviewReady breakout row must remain explicitly non-promotable unless proofConfirmed=true`);
    }
    for (const field of [
      'breakoutRetestProofTolerancePct',
      'breakoutRetestProofMaxBarsSinceRetest',
      'breakoutRetestProofMaxExtensionPct'
    ]) {
      if (!isFiniteNumber(row[field])) errors.push(`${label}: breakout retest proof missing numeric ${field}`);
    }
    for (const field of [
      'breakoutRetestProofRetestTouchFound',
      'breakoutRetestProofRetestFresh',
      'breakoutRetestProofCurrentExtensionOk',
      'breakoutRetestProofLatestCloseAboveRetest'
    ]) {
      if (!isBooleanLike(row[field])) errors.push(`${label}: breakout retest proof missing boolean ${field}`);
    }
    const retestConfirmed =
      isTrue(row.breakoutRetestProofRetestTouchFound) &&
      isTrue(row.breakoutRetestProofRetestFresh) &&
      isTrue(row.breakoutRetestProofCurrentExtensionOk) &&
      isTrue(row.breakoutRetestProofLatestCloseAboveRetest);
    const continuationConfirmed =
      isTrue(row.breakoutRetestProofContinuationConfirmed) &&
      isTrue(row.breakoutRetestProofContinuationExtensionOk) &&
      isTrue(row.breakoutRetestProofLatestCloseAboveRetest);
    if (isTrue(row.breakoutRetestProofConfirmed) && !retestConfirmed && !continuationConfirmed) {
      errors.push(`${label}: proofConfirmed=true requires either retest proof or continuation proof`);
    }
    if (isTrue(row.breakoutRetestPromotionReady) && row.executionActionableVerdict !== true) {
      errors.push(`${label}: breakout promotion ready requires executionActionableVerdict=true`);
    }
    if (isTrue(row.breakoutRetestProofConfirmed) && !isTrue(row.breakoutRetestPromotionEnabled)) {
      if (
        !String(row.breakoutRetestPromotionVerdict || '').includes('PROMOTION_DISABLED') &&
        !String(row.breakoutRetestPromotionVerdict || '').includes('INPUTS_BLOCKED')
      ) {
        errors.push(`${label}: proofConfirmed breakout with promotion disabled must declare PROMOTION_DISABLED or INPUTS_BLOCKED`);
      }
      if (row.finalDecision === 'EXECUTABLE_NOW') {
        errors.push(`${label}: proofConfirmed breakout cannot be executable while promotion flag is disabled`);
      }
      if (!row.breakoutRetestPromotionPolicyDecision) {
        errors.push(`${label}: proofConfirmed breakout must declare promotion policy decision`);
      }
      if (!row.breakoutRetestPromotionEntryBasis) {
        errors.push(`${label}: proofConfirmed breakout must declare promotion entry basis`);
      }
      if (!Array.isArray(row.breakoutRetestPromotionBlockedBy)) {
        errors.push(`${label}: proofConfirmed breakout must declare promotion blockers array`);
      }
      if (row.breakoutRetestPromotionPolicyDecision === 'WAIT_CONSERVATIVE_DEFAULT') {
        if (!isTrue(row.breakoutRetestPromotionReady)) {
          errors.push(`${label}: proofConfirmed breakout with inputs ready but promotion disabled must keep breakoutRetestPromotionReady=true`);
        }
        if (!Array.isArray(row.breakoutRetestPromotionBlockedBy) || !row.breakoutRetestPromotionBlockedBy.includes('proof_confirmed_promotion_flag_disabled')) {
          errors.push(`${label}: disabled proofConfirmed breakout must name proof_confirmed_promotion_flag_disabled`);
        }
      }
    }
  }
  if (row.decisionReason === 'wait_structure_confirmation_required') {
    if (!row.structurePolicyVerdict) errors.push(`${label}: structure wait missing structurePolicyVerdict`);
    if (!row.structurePolicyBlockerLane) errors.push(`${label}: structure wait missing structurePolicyBlockerLane`);
    for (const field of [
      'structurePolicyCurrentRrOk',
      'structurePolicyTargetBufferOk',
      'structurePolicyDistanceWithinReviewBand'
    ]) {
      if (!isBooleanLike(row[field])) errors.push(`${label}: structure wait missing boolean ${field}`);
    }
    if (tuningLane(row) !== 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') {
      errors.push(`${label}: structure wait must be marked as proof-required, not a relaxation lane`);
    }
    if (isTrue(row.zeroExecutablePrimaryTuningTarget)) {
      errors.push(`${label}: structure wait cannot be a primary zero-executable tuning target`);
    }
    if (String(row.currentEntryStructureVerdict || '').startsWith('STRUCTURE_REJECT') && row.finalDecision !== 'WAIT_PRICE') {
      errors.push(`${label}: explicit structure reject must remain WAIT_PRICE`);
    }
    if (
      String(row.currentEntryStructureVerdict || '').startsWith('STRUCTURE_REJECT') &&
      isTrue(row.structurePolicyCurrentRrOk) &&
      isTrue(row.structurePolicyTargetBufferOk) &&
      isTrue(row.structurePolicyDistanceWithinReviewBand)
    ) {
      if (!isTrue(row.structurePolicyReviewReady)) {
        errors.push(`${label}: explicit structure reject with current RR/buffer/distance ok must be review-ready`);
      }
      if (!String(row.structurePolicyVerdict || '').includes('OVERBLOCK_REVIEW_READY')) {
        errors.push(`${label}: structure overblock review-ready row must declare OVERBLOCK_REVIEW_READY verdict`);
      }
      if (isTrue(row.zeroExecutablePrimaryTuningTarget)) {
        errors.push(`${label}: structure overblock review is not a primary zero-executable tuning target`);
      }
    }
  }
  if (row.decisionReason === 'wait_target_near_current') {
    if (!isTrue(row.targetNoChaseRequired)) errors.push(`${label}: target-near-current row must declare targetNoChaseRequired=true`);
    if (!isTrue(row.targetRecalibrationRequired)) errors.push(`${label}: target-near-current row must require target recalibration`);
    if (tuningLane(row) !== 'TARGET_RECALIBRATION') errors.push(`${label}: target-near-current row must route to TARGET_RECALIBRATION`);
    if (!isTrue(row.zeroExecutablePrimaryTuningTarget)) errors.push(`${label}: target recalibration must be a primary zero-executable tuning target`);
    for (const field of [
      'targetRecalibrationCurrentTargetPrice',
      'targetRecalibrationRequiredTargetPrice',
      'targetRecalibrationRequiredTargetByBufferPrice',
      'targetRecalibrationRequiredTargetByRrPrice',
      'targetRecalibrationRequiredTargetBufferPct',
      'targetRecalibrationRequiredRr',
      'targetRecalibrationCurrentTargetGapPct',
      'targetRecalibrationSourcePrice',
      'targetRecalibrationSourceStopPrice',
      'targetRecalibrationStopDistanceAtCurrent',
      'targetRecalibrationGapPolicyPct'
    ]) {
      if (!isFiniteNumber(row[field])) errors.push(`${label}: target recalibration missing numeric ${field}`);
    }
    for (const field of ['targetRecalibrationCandidate', 'targetNoTradeConfirmed']) {
      if (!isBooleanLike(row[field])) errors.push(`${label}: target recalibration missing boolean ${field}`);
    }
    if (!row.targetRecalibrationViabilityVerdict) errors.push(`${label}: target recalibration missing viability verdict`);
    if (!Array.isArray(row.targetRecalibrationViabilityReasons)) errors.push(`${label}: target recalibration missing viability reasons array`);
    if (isTrue(row.targetRecalibrationCandidate) && isTrue(row.targetNoTradeConfirmed)) {
      errors.push(`${label}: target recalibration candidate cannot also be no-trade confirmed`);
    }
    if (isTrue(row.targetRecalibrationCandidate) && !String(row.targetRecalibrationVerdict || '').includes('REVIEW_READY')) {
      errors.push(`${label}: target recalibration candidate must use a REVIEW_READY verdict`);
    }
    if (isTrue(row.targetNoTradeConfirmed) && !String(row.targetRecalibrationViabilityVerdict || '').includes('NO_TRADE')) {
      errors.push(`${label}: target no-trade row must use a NO_TRADE viability verdict`);
    }
    if (
      isFiniteNumber(row.targetRecalibrationCurrentTargetPrice) &&
      isFiniteNumber(row.targetRecalibrationSourcePrice) &&
      Number(row.targetRecalibrationCurrentTargetPrice) <= Number(row.targetRecalibrationSourcePrice)
    ) {
      if (row.targetRecalibrationVerdict !== 'TARGET_ALREADY_REACHED_NO_TRADE') {
        errors.push(`${label}: target at/below current must use TARGET_ALREADY_REACHED_NO_TRADE`);
      }
      if (!isTrue(row.targetNoTradeConfirmed)) {
        errors.push(`${label}: target at/below current must be no-trade confirmed`);
      }
      if (isTrue(row.targetRecalibrationCandidate)) {
        errors.push(`${label}: target at/below current cannot be a recalibration candidate`);
      }
      if (row.targetRecalibrationViabilityVerdict !== 'TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT') {
        errors.push(`${label}: target at/below current must use TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT`);
      }
    }
  }
  if (riskGeometryReasons.has(row.decisionReason)) {
    if (!row.riskGeometryPolicyVerdict) errors.push(`${label}: risk geometry row missing riskGeometryPolicyVerdict`);
    if (!row.riskGeometryProofVerdict) errors.push(`${label}: risk geometry row missing riskGeometryProofVerdict`);
    if (!Array.isArray(row.riskGeometryProofReasons)) errors.push(`${label}: risk geometry row missing riskGeometryProofReasons array`);
    if ((row.decisionReason === 'wait_target_near_current' || row.decisionReason === 'blocked_target_too_close') && !isTrue(row.riskGeometryNoTradeRequired)) {
      errors.push(`${label}: target geometry row must declare riskGeometryNoTradeRequired=true`);
    }
    if (isTrue(row.riskGeometryRecalculatedStopCandidate)) {
      for (const field of [
        'riskGeometryRecalculatedStopPrice',
        'riskGeometryRecalculatedStopDistancePct',
        'riskGeometryRrAtRecalculatedStop',
        'riskGeometryRequiredTargetPrice',
        'riskGeometryRequiredTargetByStopPrice',
        'riskGeometryRequiredTargetByBufferPrice',
        'riskGeometryTargetBufferPct'
      ]) {
        if (!isFiniteNumber(row[field])) errors.push(`${label}: recalculated stop candidate missing numeric ${field}`);
      }
      if (!row.riskGeometryRequiredTargetSource) errors.push(`${label}: recalculated stop candidate missing riskGeometryRequiredTargetSource`);
      if (!row.riskGeometryRepairLane) errors.push(`${label}: recalculated stop candidate missing riskGeometryRepairLane`);
      if (!isBooleanLike(row.riskGeometryProofConfirmed)) errors.push(`${label}: recalculated stop candidate missing riskGeometryProofConfirmed`);
      for (const field of [
        'riskGeometryTargetAboveCurrent',
        'riskGeometryRequiredStopValid',
        'riskGeometryRequiredStopDistanceValid',
        'riskGeometryRecalculatedStopRrOk',
        'riskGeometryTargetBufferOk',
        'riskGeometryTargetRecalibrationCandidate'
      ]) {
        if (!isBooleanLike(row[field])) errors.push(`${label}: recalculated stop candidate missing boolean ${field}`);
      }
      if (row.riskGeometryRequiredTargetSource === 'expected_return' && !isFiniteNumber(row.riskGeometryRequiredTargetByExpectedReturnPrice)) {
        errors.push(`${label}: expected-return target source requires riskGeometryRequiredTargetByExpectedReturnPrice`);
      }
      if (isTrue(row.riskGeometryTargetRecalibrationCandidate)) {
        if (row.riskGeometryRepairLane !== 'TARGET_RECALIBRATION') {
          errors.push(`${label}: target recalibration candidate must declare riskGeometryRepairLane=TARGET_RECALIBRATION`);
        }
        if (isTrue(row.riskGeometryProofConfirmed)) {
          errors.push(`${label}: target recalibration candidate cannot also declare riskGeometryProofConfirmed=true`);
        }
        if (!(Number(row.riskGeometryTargetGapPct) < 0) || !(Number(row.riskGeometryTargetShortfallPct) > 0)) {
          errors.push(`${label}: target recalibration candidate must expose negative target gap and positive shortfall`);
        }
        if (tuningLane(row) !== 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION') {
          errors.push(`${label}: target recalibration candidate from risk geometry must route to STOP_TARGET_RISK_GEOMETRY_RECALCULATION`);
        }
      }
      if (isTrue(row.riskGeometryProofConfirmed)) {
        if (row.riskGeometryRepairLane !== 'RECALCULATED_STOP_PROOF_CONFIRMED') {
          errors.push(`${label}: confirmed recalculated-stop proof must declare RECALCULATED_STOP_PROOF_CONFIRMED repair lane`);
        }
        if (isTrue(row.riskGeometryTargetRecalibrationCandidate)) {
          errors.push(`${label}: confirmed recalculated-stop proof cannot require target recalibration`);
        }
      }
    }
    if (isTrue(row.riskGeometryRecalibrationRequired) || isTrue(row.riskGeometryTargetRecalibrationCandidate)) {
      for (const field of ['riskGeometryTargetGapPct', 'riskGeometryTargetShortfallPct']) {
        if (!isFiniteNumber(row[field])) errors.push(`${label}: risk geometry recalibration missing numeric ${field}`);
      }
    }
    if (
      row.decisionReason !== 'wait_target_near_current' &&
      (isTrue(row.riskGeometryRecalibrationRequired) || isTrue(row.riskGeometryRecalculatedStopCandidate)) &&
      !['STOP_TARGET_RISK_GEOMETRY_RECALCULATION', 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION'].includes(tuningLane(row))
    ) {
      errors.push(`${label}: risk geometry recalibration row must route to risk geometry tuning lane`);
    }
  }
}
if (!candidates.length) errors.push('fixture has no candidates');
if (errors.length) {
  console.error(`[STAGE6_FILLABILITY_CONTRACT] FAIL ${errors.join('; ')}`);
  process.exit(1);
}
console.log(`[STAGE6_FILLABILITY_CONTRACT] PASS candidates=${candidates.length} fixture=${fixturePath}`);
