#!/usr/bin/env node
import fs from 'node:fs';
const fixturePath = process.env.STAGE6_FILLABILITY_CONTRACT_FIXTURE || 'docs/fixtures/stage6_sidecar_entry_fillability_contract.fixture.json';
const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
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
const isTrue = (value) => value === true || String(value).toLowerCase() === 'true';
const isBooleanLike = (value) => value === true || value === false || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'false';
const isFiniteNumber = (value) => value !== null && value !== '' && value !== undefined && !Number.isNaN(Number(value)) && Number.isFinite(Number(value));
const tuningLane = (row) => String(row.zeroExecutableTuningLane || '').trim().toUpperCase();
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
  }
  if (!actionableVerdict && row.finalDecision === 'WAIT_PRICE' && row.decisionReason === 'wait_verdict_not_sidecar_actionable' && row.executionActionableVerdict !== false) {
    errors.push(`${label}: non-actionable wait must declare executionActionableVerdict=false`);
  }
  if (row.executionFeasibilityAtCurrent === 'BLOCKED' && !String(row.decisionReason || '').startsWith('wait_') && !String(row.decisionReason || '').startsWith('blocked_')) {
    errors.push(`${label}: blocked current feasibility needs wait_/blocked_ decisionReason`);
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
    }
  }
  if (row.decisionReason === 'wait_structure_confirmation_required') {
    if (!row.structurePolicyVerdict) errors.push(`${label}: structure wait missing structurePolicyVerdict`);
    if (tuningLane(row) !== 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION') {
      errors.push(`${label}: structure wait must be marked as proof-required, not a relaxation lane`);
    }
    if (isTrue(row.zeroExecutablePrimaryTuningTarget)) {
      errors.push(`${label}: structure wait cannot be a primary zero-executable tuning target`);
    }
    if (String(row.currentEntryStructureVerdict || '').startsWith('STRUCTURE_REJECT') && row.finalDecision !== 'WAIT_PRICE') {
      errors.push(`${label}: explicit structure reject must remain WAIT_PRICE`);
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
        'riskGeometryTargetBufferPct'
      ]) {
        if (!isFiniteNumber(row[field])) errors.push(`${label}: recalculated stop candidate missing numeric ${field}`);
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
