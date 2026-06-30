#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-formula-tuning-backlog.mjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/fixtures/stage6_fresh_focus_formula');
const CASES = [
  {
    name: 'formula_v4_backlog_ready',
    fixture: 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json',
    expectedOverall: 'pass_formula_tuning_backlog_ready',
    expectedProducerRows: 5,
    expectedTopTrack: 'risk_geometry_recalculation',
    expectedTopKnob: 'RISK_GEOMETRY_REQUIRED_TARGET_PRICE',
    expectMissingFormula: 0,
    expectMissingLaneSpecific: 0,
    expectLaneMismatch: 0,
    expectEvidenceWeak: 0,
    expectContractIssues: 0,
    expectedRecommendations: 4,
    expectedProducerTracks: [
      'target_recalibration',
      'risk_geometry_recalculation',
      'breakout_proof_confirmed_generation'
    ],
    expectedNextAction: 'tune_stage6_producer_formula_or_proof_generation'
  },
  {
    name: 'formula_contract_incomplete_requires_fresh_hash_or_manifest_fix',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_CONTRACT_MISSING.fixture.json',
    expectedOverall: 'warn_formula_tuning_contract_incomplete',
    expectedProducerRows: 0,
    expectedTopTrack: 'none',
    expectedTopKnob: 'none',
    expectMissingFormula: 0,
    expectMissingLaneSpecific: 3,
    expectLaneMismatch: 0,
    expectEvidenceWeak: 0,
    expectContractIssues: 1,
    expectedRecommendations: 0,
    expectedProducerTracks: [],
    expectedNextAction: 'generate_fresh_stage6_after_formula_v4_head_or_fix_manifest_contract'
  },
  {
    name: 'missing_formula_backlog_requires_refresh',
    fixture: 'STAGE6_ALPHA_FINAL_MISSING_FORMULA.fixture.json',
    expectedOverall: 'warn_formula_tuning_formula_fields_missing',
    expectedProducerRows: 0,
    expectedTopTrack: 'none',
    expectedTopKnob: 'none',
    expectMissingFormula: 1,
    expectMissingLaneSpecific: 1,
    expectLaneMismatch: 0,
    expectEvidenceWeak: 0,
    expectContractIssues: 0,
    expectedRecommendations: 0,
    expectedProducerTracks: [],
    expectedNextAction: 'generate_fresh_stage6_after_formula_v4_head'
  },
  {
    name: 'weak_formula_evidence_requires_refresh',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_EVIDENCE_WEAK.fixture.json',
    expectedOverall: 'warn_formula_tuning_evidence_weak',
    expectedProducerRows: 0,
    expectedTopTrack: 'none',
    expectedTopKnob: 'none',
    expectMissingFormula: 0,
    expectMissingLaneSpecific: 0,
    expectLaneMismatch: 0,
    expectEvidenceWeak: 1,
    expectContractIssues: 0,
    expectedRecommendations: 0,
    expectedProducerTracks: [],
    expectedNextAction: 'refresh_stage6_formula_evidence_before_tuning_thresholds'
  },
  {
    name: 'lane_mismatch_requires_mapping_refresh',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_MISMATCH.fixture.json',
    expectedOverall: 'warn_formula_tuning_lane_mismatch',
    expectedProducerRows: 0,
    expectedTopTrack: 'none',
    expectedTopKnob: 'none',
    expectMissingFormula: 0,
    expectMissingLaneSpecific: 0,
    expectLaneMismatch: 2,
    expectEvidenceWeak: 0,
    expectContractIssues: 0,
    expectedRecommendations: 0,
    expectedProducerTracks: [],
    expectedNextAction: 'refresh_stage6_formula_lane_mapping'
  }
];

function runCase(testCase) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `stage6-formula-tuning-${testCase.name}-`));
  const outJson = path.join(tmp, 'backlog.json');
  const outMd = path.join(tmp, 'backlog.md');
  const fixturePath = path.join(FIXTURE_DIR, testCase.fixture);
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH: fixturePath,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON: outJson,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD: outMd
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${testCase.name}: backlog script failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.overall !== testCase.expectedOverall) {
    throw new Error(`${testCase.name}: expected overall=${testCase.expectedOverall}, got ${report.overall}`);
  }
  if (Number(report.summary?.producerReviewRows || 0) !== testCase.expectedProducerRows) {
    throw new Error(`${testCase.name}: expected producerReviewRows=${testCase.expectedProducerRows}, got ${report.summary?.producerReviewRows}`);
  }
  if (Number(report.summary?.missingFormulaRows || 0) !== testCase.expectMissingFormula) {
    throw new Error(`${testCase.name}: expected missingFormulaRows=${testCase.expectMissingFormula}, got ${report.summary?.missingFormulaRows}`);
  }
  if (Number(report.summary?.missingLaneSpecificRows || 0) !== testCase.expectMissingLaneSpecific) {
    throw new Error(`${testCase.name}: expected missingLaneSpecificRows=${testCase.expectMissingLaneSpecific}, got ${report.summary?.missingLaneSpecificRows}`);
  }
  if (Number(report.summary?.formulaLaneMismatchRows || 0) !== testCase.expectLaneMismatch) {
    throw new Error(`${testCase.name}: expected formulaLaneMismatchRows=${testCase.expectLaneMismatch}, got ${report.summary?.formulaLaneMismatchRows}`);
  }
  if (Number(report.summary?.formulaEvidenceWeakRows || 0) !== testCase.expectEvidenceWeak) {
    throw new Error(`${testCase.name}: expected formulaEvidenceWeakRows=${testCase.expectEvidenceWeak}, got ${report.summary?.formulaEvidenceWeakRows}`);
  }
  if (Number(report.summary?.formulaContractIssues || 0) !== testCase.expectContractIssues) {
    throw new Error(`${testCase.name}: expected formulaContractIssues=${testCase.expectContractIssues}, got ${report.summary?.formulaContractIssues}`);
  }
  if (Number(report.summary?.tuningRecommendationCount || 0) !== testCase.expectedRecommendations) {
    throw new Error(`${testCase.name}: expected tuningRecommendationCount=${testCase.expectedRecommendations}, got ${report.summary?.tuningRecommendationCount}`);
  }
  if (testCase.expectedRecommendations > 0) {
    const missingContractFields = (report.tuningRecommendations || []).filter(
      (row) => !Array.isArray(row.contractTunablePolicyFields) || row.contractTunablePolicyFields.length === 0
    );
    if (missingContractFields.length > 0) {
      throw new Error(`${testCase.name}: tuning recommendations missing contractTunablePolicyFields`);
    }
    const missingProducerFieldRecommendations = (report.tuningRecommendations || []).filter(
      (row) => !Array.isArray(row.producerFieldRecommendations) || row.producerFieldRecommendations.length === 0
    );
    if (missingProducerFieldRecommendations.length > 0) {
      throw new Error(`${testCase.name}: tuning recommendations missing direct producerFieldRecommendations`);
    }
    const producerFields = new Set(
      (report.tuningRecommendations || []).flatMap((row) =>
        (row.producerFieldRecommendations || []).map((item) => item.field)
      )
    );
    for (const field of [
      'targetRecalibrationRequiredTargetPrice',
      'targetRecalibrationExecutionFloorViable',
      'targetRecalibrationRequiredTargetDominantReason',
      'riskGeometryRequiredTargetPrice',
      'breakoutRetestProofConfirmed',
      'currentEntryStructureVerdict'
    ]) {
      if (!producerFields.has(field)) {
        throw new Error(`${testCase.name}: producerFieldRecommendations missing ${field}`);
      }
    }
    const malformedProducerFieldRecommendations = (report.tuningRecommendations || []).flatMap((row) =>
      (row.producerFieldRecommendations || [])
        .filter((item) => !item.purpose || !item.action || typeof item.guardrail !== 'string')
        .map((item) => `${row.producerTrack}:${item.field || 'missing_field'}`)
    );
    if (malformedProducerFieldRecommendations.length > 0) {
      throw new Error(`${testCase.name}: malformed producerFieldRecommendations=${malformedProducerFieldRecommendations.join(', ')}`);
    }
    if (Number(report.summary?.producerFieldRecommendationCount || 0) <= 0) {
      throw new Error(`${testCase.name}: expected producerFieldRecommendationCount > 0`);
    }
    if (Number(report.summary?.producerTrackDiagnosticCount || 0) <= 0) {
      throw new Error(`${testCase.name}: expected producerTrackDiagnosticCount > 0`);
    }
    if (!report.summary?.targetRecalibrationProofGapCounts || typeof report.summary.targetRecalibrationProofGapCounts !== 'object') {
      throw new Error(`${testCase.name}: summary missing targetRecalibrationProofGapCounts`);
    }
    const malformedEvidenceRows = (report.backlogRows || []).filter(
      (row) =>
        typeof row.rowEvidenceSummary !== 'string' ||
        !row.rowEvidenceSummary ||
        !row.targetRecalibrationEvidence ||
        typeof row.targetRecalibrationEvidence !== 'object' ||
        !Array.isArray(row.targetRecalibrationProofGaps) ||
        !row.structureProofEvidence ||
        typeof row.structureProofEvidence !== 'object'
    );
    if (malformedEvidenceRows.length > 0) {
      throw new Error(`${testCase.name}: backlog rows missing row-level target/structure/proof-gap evidence`);
    }
    const diagnosticTracks = new Set((report.producerTrackDiagnostics || []).map((row) => row.producerTrack));
    const tracks = new Set((report.tuningRecommendations || []).map((row) => row.producerTrack));
    for (const track of testCase.expectedProducerTracks || []) {
      if (!tracks.has(track)) {
        throw new Error(`${testCase.name}: missing split producer track ${track}`);
      }
      if (!diagnosticTracks.has(track)) {
        throw new Error(`${testCase.name}: producerTrackDiagnostics missing ${track}`);
      }
      const rowsForTrack = (report.tuningRecommendations || []).filter((row) => row.producerTrack === track);
      if (!rowsForTrack.some((row) => Array.isArray(row.producerFieldRecommendations) && row.producerFieldRecommendations.length > 0)) {
        throw new Error(`${testCase.name}: split producer track ${track} lacks producerFieldRecommendations`);
      }
      const diagnosticsForTrack = (report.producerTrackDiagnostics || []).filter((row) => row.producerTrack === track);
      if (!diagnosticsForTrack.some((row) => Array.isArray(row.recommendedProducerFields) && row.recommendedProducerFields.length > 0)) {
        throw new Error(`${testCase.name}: producer track ${track} lacks recommendedProducerFields diagnostics`);
      }
      if (track === 'target_recalibration') {
        if (!diagnosticsForTrack.some((row) => row.targetRecalibrationProofGapCounts && typeof row.targetRecalibrationProofGapCounts === 'object')) {
          throw new Error(`${testCase.name}: target_recalibration diagnostics missing targetRecalibrationProofGapCounts`);
        }
        const targetRecommendations = rowsForTrack.filter((row) => row.targetRecalibrationProofGapCounts && typeof row.targetRecalibrationProofGapCounts === 'object');
        if (!targetRecommendations.length) {
          throw new Error(`${testCase.name}: target_recalibration recommendation missing targetRecalibrationProofGapCounts`);
        }
      }
    }
  }
  if (report.summary?.topProducerTrack !== testCase.expectedTopTrack) {
    throw new Error(`${testCase.name}: expected topProducerTrack=${testCase.expectedTopTrack}, got ${report.summary?.topProducerTrack}`);
  }
  if (report.summary?.topAdjustmentKnob !== testCase.expectedTopKnob) {
    throw new Error(`${testCase.name}: expected topAdjustmentKnob=${testCase.expectedTopKnob}, got ${report.summary?.topAdjustmentKnob}`);
  }
  if (report.summary?.brokerMutationAllowed !== false || report.summary?.sidecarMutationAllowed !== false) {
    throw new Error(`${testCase.name}: mutation guardrails must remain false`);
  }
  if (report.guardrails?.nextAction !== testCase.expectedNextAction) {
    throw new Error(`${testCase.name}: expected guardrails.nextAction=${testCase.expectedNextAction}, got ${report.guardrails?.nextAction}`);
  }
  const md = fs.readFileSync(outMd, 'utf8');
  for (const token of ['Stage6 Formula Tuning Backlog', 'producer-only', 'broker submit, replace, reprice']) {
    if (!md.includes(token)) throw new Error(`${testCase.name}: markdown missing token ${token}`);
  }
  for (const token of ['missingLaneSpecificRows', 'formulaLaneMismatchRows', 'formulaEvidenceWeakRows', 'tuningRecommendationCount', 'producerFieldRecommendationCount', 'Lane Mismatch', 'Weak Evidence', 'Missing Lane Fields', 'Tuning Recommendations']) {
    if (!md.includes(token)) throw new Error(`${testCase.name}: markdown missing lane-specific token ${token}`);
  }
  for (const token of ['Row Evidence', 'Target Evidence', 'Structure Evidence']) {
    if (!md.includes(token)) throw new Error(`${testCase.name}: markdown missing row-level evidence token ${token}`);
  }
  if (testCase.expectedRecommendations > 0 && !md.includes('Proof Gaps')) {
    throw new Error(`${testCase.name}: markdown missing target proof gap evidence`);
  }
  if (testCase.expectedRecommendations > 0 && !md.includes('Contract fields')) {
    throw new Error(`${testCase.name}: markdown missing tuning contract fields`);
  }
  if (testCase.expectedRecommendations > 0 && !md.includes('Producer Track Diagnostics')) {
    throw new Error(`${testCase.name}: markdown missing producer track diagnostics`);
  }
  if (testCase.expectedRecommendations > 0 && !md.includes('Producer Field Recommendations')) {
    throw new Error(`${testCase.name}: markdown missing direct producer field recommendations`);
  }
  return {
    name: testCase.name,
    overall: report.overall,
    producerReviewRows: report.summary.producerReviewRows,
    missingFormulaRows: report.summary.missingFormulaRows,
    missingLaneSpecificRows: report.summary.missingLaneSpecificRows,
    formulaLaneMismatchRows: report.summary.formulaLaneMismatchRows,
    formulaEvidenceWeakRows: report.summary.formulaEvidenceWeakRows,
    formulaContractIssues: report.summary.formulaContractIssues,
    tuningRecommendationCount: report.summary.tuningRecommendationCount,
    producerFieldRecommendationCount: report.summary.producerFieldRecommendationCount,
    topProducerTrack: report.summary.topProducerTrack,
    topAdjustmentKnob: report.summary.topAdjustmentKnob,
    nextAction: report.guardrails?.nextAction
  };
}

function validateFreshSourceEnforcementBlocks() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage6-formula-tuning-enforce-'));
  const outJson = path.join(tmp, 'backlog.json');
  const outMd = path.join(tmp, 'backlog.md');
  const fixturePath = path.join(FIXTURE_DIR, 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH: fixturePath,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON: outJson,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD: outMd,
      STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA: 'expected-fresh-source-sha',
      STAGE6_FORMULA_TUNING_BACKLOG_ENFORCE_FRESH_SOURCE: 'true'
    },
    encoding: 'utf8'
  });
  if (result.status === 0) {
    throw new Error('fresh source enforcement should fail when source SHA is absent/mismatched');
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.overall !== 'warn_formula_tuning_stale_source') {
    throw new Error(`fresh source enforcement expected warn_formula_tuning_stale_source, got ${report.overall}`);
  }
  if (report.runtimeProof?.status !== 'pending_fresh_stage6_source_sha') {
    throw new Error(`fresh source enforcement expected pending_fresh_stage6_source_sha, got ${report.runtimeProof?.status}`);
  }
  if (report.guardrails?.nextAction !== 'generate_fresh_stage6_after_expected_head') {
    throw new Error(`fresh source enforcement expected generate_fresh_stage6_after_expected_head, got ${report.guardrails?.nextAction}`);
  }
  return {
    name: 'fresh_source_enforcement_blocks_stale_backlog',
    overall: report.overall,
    runtimeProof: report.runtimeProof.status,
    nextAction: report.guardrails.nextAction
  };
}

function validateFreshSourceEnforcementPasses() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage6-formula-tuning-enforce-pass-'));
  const sourceFixturePath = path.join(FIXTURE_DIR, 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json');
  const fixture = JSON.parse(fs.readFileSync(sourceFixturePath, 'utf8'));
  const expectedSha = 'expected-fresh-source-sha';
  fixture.manifest = {
    ...(fixture.manifest || {}),
    sourceRepo: 'pungking/US_Alpha_Seeker',
    sourceWorkflow: 'US Alpha Seeker Auto-Scheduler',
    sourceRunId: 'fixture-run',
    sourceSha: expectedSha,
    sourceRef: 'main',
    sourceEventName: 'schedule'
  };
  const fixturePath = path.join(tmp, 'STAGE6_ALPHA_FINAL_WITH_FORMULA_SOURCE_SHA.fixture.json');
  const outJson = path.join(tmp, 'backlog.json');
  const outMd = path.join(tmp, 'backlog.md');
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH: fixturePath,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON: outJson,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD: outMd,
      STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA: expectedSha,
      STAGE6_FORMULA_TUNING_BACKLOG_ENFORCE_FRESH_SOURCE: 'true'
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`fresh source enforcement pass fixture failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.overall !== 'pass_formula_tuning_backlog_ready') {
    throw new Error(`fresh source enforcement pass expected pass_formula_tuning_backlog_ready, got ${report.overall}`);
  }
  if (report.runtimeProof?.status !== 'pass_fresh_stage6_source_sha' || report.runtimeProof?.sourceShaMatchesExpected !== true) {
    throw new Error('fresh source enforcement pass did not prove matching source SHA');
  }
  if (Number(report.summary?.tuningRecommendationCount || 0) !== 4) {
    throw new Error(`fresh source enforcement pass expected tuningRecommendationCount=4, got ${report.summary?.tuningRecommendationCount}`);
  }
  return {
    name: 'fresh_source_enforcement_passes_matching_backlog',
    overall: report.overall,
    runtimeProof: report.runtimeProof.status,
    nextAction: report.guardrails.nextAction
  };
}

const results = CASES.map(runCase);
results.push(validateFreshSourceEnforcementBlocks());
results.push(validateFreshSourceEnforcementPasses());
console.log(`[STAGE6_FORMULA_TUNING_BACKLOG_VALIDATE] PASS ${JSON.stringify(results)}`);
