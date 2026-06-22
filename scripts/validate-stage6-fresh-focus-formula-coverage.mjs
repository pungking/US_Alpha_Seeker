#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-fresh-focus-audit.mjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/fixtures/stage6_fresh_focus_formula');
const PRODUCER_SOURCE = path.join(REPO_ROOT, 'components/AlphaAnalysis.tsx');
const AUTOMATION_SOURCE = path.join(REPO_ROOT, 'automate.js');
const CASES = [
  {
    name: 'missing_formula_fields_warns',
    fixture: 'STAGE6_ALPHA_FINAL_MISSING_FORMULA.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_fields_missing',
    expectedCoverage: { present: 0, total: 1 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 1,
    expectedEvidenceQualityIssues: 1,
    expectedLaneSpecificFormulaIssues: 1,
    expectedNextAction: 'generate_fresh_stage6_after_formula_v4_head'
  },
  {
    name: 'formula_contract_missing_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_CONTRACT_MISSING.fixture.json',
    expectedOverall: 'warn_formula_contract_missing_or_mismatch',
    expectedCoverage: { present: 5, total: 5 },
    expectedManifestContractIssues: 1,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 0,
    expectedLaneSpecificFormulaIssues: 3,
    expectedNextAction: 'generate_fresh_stage6_after_formula_v4_head'
  },
  {
    name: 'formula_fields_present_passes',
    fixture: 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json',
    expectedOverall: 'pass_executable_present_focus_fields_ok',
    expectedCoverage: { present: 6, total: 6 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 0,
    expectedLaneSpecificFormulaIssues: 0,
    expectedNextAction: 'monitor_next_sidecar_fresh_hash_consumption'
  },
  {
    name: 'formula_lane_mismatch_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_MISMATCH.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_lane_mismatch',
    expectedCoverage: { present: 2, total: 2 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 2,
    expectedEvidenceQualityIssues: 2,
    expectedLaneSpecificFormulaIssues: 0,
    expectedNextAction: 'refresh_stage6_formula_lane_mapping'
  },
  {
    name: 'formula_evidence_weak_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_EVIDENCE_WEAK.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_evidence_weak',
    expectedCoverage: { present: 1, total: 1 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 1,
    expectedLaneSpecificFormulaIssues: 1,
    expectedNextAction: 'refresh_stage6_formula_evidence_before_tuning_thresholds'
  }
];
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

function validateProducerSourceContract() {
  const source = fs.readFileSync(PRODUCER_SOURCE, 'utf8');
  const automationSource = fs.readFileSync(AUTOMATION_SOURCE, 'utf8');
  const start = source.indexOf('const deriveZeroExecutableFormulaProfile');
  const end = source.indexOf('const toNonNegativeInt', start);
  if (start < 0 || end < 0) {
    throw new Error('producer source missing deriveZeroExecutableFormulaProfile contract block');
  }
  const block = source.slice(start, end);
  for (const token of ['STAGE6_ZERO_EXECUTABLE_FORMULA_CONTRACT', 'zeroExecutableFormulaContract']) {
    if (!source.includes(token)) {
      throw new Error(`producer formula manifest contract missing token: ${token}`);
    }
  }
  for (const token of [
    'VITE_BUILD_SOURCE_SHA',
    'stage6BuildSourceAudit',
    'sourceSha',
    'buildSource',
    'flagPropagationAudit'
  ]) {
    if (!source.includes(token)) {
      throw new Error(`producer source audit propagation missing token: ${token}`);
    }
  }
  for (const token of [
    'zeroExecutableFormulaBottleneck: executionContract.zeroExecutableFormulaBottleneck',
    'zeroExecutableFormulaBottleneck: normalizeOptionalText(item.zeroExecutableFormulaBottleneck)',
    'zeroExecutableFormulaBottleneck: normalizeOptionalText(item?.zeroExecutableFormulaBottleneck)'
  ]) {
    if (!source.includes(token)) {
      throw new Error(`producer formula field surface propagation missing token: ${token}`);
    }
  }
  for (const token of [
    'VITE_BUILD_SOURCE_REPOSITORY',
    'VITE_BUILD_SOURCE_WORKFLOW',
    'VITE_BUILD_SOURCE_RUN_ID',
    'VITE_BUILD_SOURCE_SHA',
    'VITE_BUILD_SOURCE_REF',
    'VITE_BUILD_SOURCE_EVENT_NAME'
  ]) {
    if (!automationSource.includes(token)) {
      throw new Error(`automation runtime env propagation missing token: ${token}`);
    }
  }
  for (const token of [
    'preferredFormulaBottleneck',
    'primary_formula_bottleneck',
    'TARGET_RECALIBRATION_FORMULA',
    'RISK_GEOMETRY_RECALCULATION_FORMULA',
    'BREAKOUT_PROOF_FORMULA',
    'STRUCTURE_PROOF_FORMULA',
    'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK',
    'formulaEvidence',
    'formula_observed',
    'formula_threshold',
    'formula_delta',
    'formulaAdjustment',
    'formula_adjustment_knob',
    'formula_adjustment_direction'
  ]) {
    if (!block.includes(token)) {
      throw new Error(`producer formula contract missing token: ${token}`);
    }
  }
  for (const token of [
    'laneSpecificRowFields',
    'tunablePolicyFields',
    'promotionSafetyRules',
    'targetRecalibrationFormulaEvidenceBasis',
    'riskGeometryFormulaEvidenceBasis',
    'breakoutRetestProofFormulaEvidenceBasis',
    'structurePolicyFormulaEvidenceBasis',
    'structurePolicyFormulaObservedValue',
    'structurePolicyFormulaThresholdValue',
    'structurePolicyFormulaDeltaValue',
    'structurePolicyFormulaUnit'
  ]) {
    if (!source.includes(token)) {
      throw new Error(`producer lane-specific formula field propagation missing token: ${token}`);
    }
  }
  for (const token of [
    'TARGET_RECALIBRATION_POLICY.maxRequiredTargetGapPct',
    'TARGET_RECALIBRATION_POLICY.maxExecutionFloorGapPct',
    'BREAKOUT_RETEST_PROOF_POLICY.maxBarsSinceRetest',
    'BREAKOUT_RETEST_PROOF_POLICY.maxCurrentExtensionFromRetestPct',
    'BREAKOUT_RETEST_PROOF_POLICY.maxReclaimUndercutExcessPct',
    'CURRENT_ENTRY_STRUCTURE_POLICY.maxReviewDistancePct',
    'riskGeometryRrAtRequiredTargetAndRecalculatedStop',
    'targetRecalibrationExecutionFloorViable',
    'breakoutRetestProofUndercutReclaimFound',
    'breakout_review_ready_never_promotes',
    'target_already_reached_requires_recalibration_or_no_trade',
    'sidecar_reprice_never_solves_stage6_target_geometry'
  ]) {
    if (!source.includes(token)) {
      throw new Error(`producer formula tunable/safety contract missing token: ${token}`);
    }
  }
}

function runCase(testCase) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `stage6-fresh-focus-${testCase.name}-`));
  const outJson = path.join(tmp, 'audit.json');
  const outMd = path.join(tmp, 'audit.md');
  const fixturePath = path.join(FIXTURE_DIR, testCase.fixture);
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FOCUS_AUDIT_STAGE6_PATH: fixturePath,
      STAGE6_FOCUS_AUDIT_OUT_JSON: outJson,
      STAGE6_FOCUS_AUDIT_OUT_MD: outMd
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${testCase.name}: audit exited ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.overall !== testCase.expectedOverall) {
    throw new Error(`${testCase.name}: expected overall=${testCase.expectedOverall}, got ${report.overall}`);
  }
  for (const field of REQUIRED_FORMULA_FIELDS) {
    const coverage = report.fieldCoverage?.[field];
    if (!coverage || coverage.present !== testCase.expectedCoverage.present || coverage.total !== testCase.expectedCoverage.total) {
      throw new Error(`${testCase.name}: unexpected ${field} coverage ${JSON.stringify(coverage)}`);
    }
  }
  const laneIssues = Number(report.summary?.formulaLaneConsistencyIssues || 0);
  const contractIssues = Number(report.summary?.formulaManifestContractIssues || 0);
  if (contractIssues !== testCase.expectedManifestContractIssues) {
    throw new Error(`${testCase.name}: expected formulaManifestContractIssues=${testCase.expectedManifestContractIssues}, got ${contractIssues}`);
  }
  if (testCase.expectedManifestContractIssues > 0 && !Array.isArray(report.formulaManifestContractIssues)) {
    throw new Error(`${testCase.name}: expected formulaManifestContractIssues array in report`);
  }
  if (laneIssues !== testCase.expectedLaneConsistencyIssues) {
    throw new Error(`${testCase.name}: expected formulaLaneConsistencyIssues=${testCase.expectedLaneConsistencyIssues}, got ${laneIssues}`);
  }
  const evidenceIssues = Number(report.summary?.formulaEvidenceQualityIssues || 0);
  if (evidenceIssues !== testCase.expectedEvidenceQualityIssues) {
    throw new Error(`${testCase.name}: expected formulaEvidenceQualityIssues=${testCase.expectedEvidenceQualityIssues}, got ${evidenceIssues}`);
  }
  const laneSpecificIssues = Number(report.summary?.laneSpecificFormulaEvidenceIssues || 0);
  if (laneSpecificIssues !== testCase.expectedLaneSpecificFormulaIssues) {
    throw new Error(`${testCase.name}: expected laneSpecificFormulaEvidenceIssues=${testCase.expectedLaneSpecificFormulaIssues}, got ${laneSpecificIssues}`);
  }
  const nextAction = report.guardrails?.nextAction;
  if (nextAction !== testCase.expectedNextAction) {
    throw new Error(`${testCase.name}: expected guardrails.nextAction=${testCase.expectedNextAction}, got ${nextAction}`);
  }
  if (report.safety?.brokerMutation !== false || report.safety?.stateMutation !== false || report.guardrails?.sidecarMutationAllowed !== false) {
    throw new Error(`${testCase.name}: report-only mutation guardrails must remain false`);
  }
  return {
    name: testCase.name,
    overall: report.overall,
    coverage: report.fieldCoverage?.zeroExecutableFormulaBottleneck,
    requiredFormulaFields: report.requiredFormulaFields,
    contractIssues,
    laneIssues,
    evidenceIssues,
    laneSpecificIssues,
    nextAction
  };
}

function validateFreshContractEnforcement() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage6-fresh-focus-enforce-'));
  const outJson = path.join(tmp, 'audit.json');
  const outMd = path.join(tmp, 'audit.md');
  const fixturePath = path.join(FIXTURE_DIR, 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FOCUS_AUDIT_STAGE6_PATH: fixturePath,
      STAGE6_FOCUS_AUDIT_OUT_JSON: outJson,
      STAGE6_FOCUS_AUDIT_OUT_MD: outMd,
      STAGE6_EXPECTED_SOURCE_SHA: 'expected-fresh-source-sha',
      STAGE6_FOCUS_AUDIT_ENFORCE_FRESH_CONTRACT: 'true'
    },
    encoding: 'utf8'
  });
  if (result.status === 0) {
    throw new Error('fresh-contract enforcement should fail when expected source sha is absent/mismatched');
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.runtimeProof?.status !== 'pending_fresh_stage6_source_sha') {
    throw new Error(`fresh-contract enforcement expected pending_fresh_stage6_source_sha, got ${report.runtimeProof?.status}`);
  }
  if (report.guardrails?.freshContractViolation !== true || report.guardrails?.enforceFreshContract !== true) {
    throw new Error('fresh-contract enforcement guardrails were not persisted in report');
  }
  return {
    name: 'fresh_contract_enforcement_blocks_stale_source',
    status: report.runtimeProof.status,
    nextAction: report.guardrails.nextAction
  };
}

function validateFreshContractEnforcementPass() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage6-fresh-focus-enforce-pass-'));
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
  const outJson = path.join(tmp, 'audit.json');
  const outMd = path.join(tmp, 'audit.md');
  fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_FOCUS_AUDIT_STAGE6_PATH: fixturePath,
      STAGE6_FOCUS_AUDIT_OUT_JSON: outJson,
      STAGE6_FOCUS_AUDIT_OUT_MD: outMd,
      STAGE6_EXPECTED_SOURCE_SHA: expectedSha,
      STAGE6_FOCUS_AUDIT_ENFORCE_FRESH_CONTRACT: 'true'
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`fresh-contract enforcement pass fixture failed\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  if (report.runtimeProof?.status !== 'pass_formula_v4_runtime_proof') {
    throw new Error(`fresh-contract enforcement expected pass_formula_v4_runtime_proof, got ${report.runtimeProof?.status}`);
  }
  if (report.runtimeProof?.sourceShaMatchesExpected !== true || report.guardrails?.freshContractViolation !== false) {
    throw new Error('fresh-contract enforcement pass fixture did not prove source SHA match and no violation');
  }
  return {
    name: 'fresh_contract_enforcement_passes_matching_source',
    status: report.runtimeProof.status,
    nextAction: report.guardrails.nextAction
  };
}

const results = CASES.map(runCase);
validateProducerSourceContract();
results.push(validateFreshContractEnforcement());
results.push(validateFreshContractEnforcementPass());
console.log(`[STAGE6_FRESH_FOCUS_FORMULA_COVERAGE] PASS ${JSON.stringify(results)}`);
