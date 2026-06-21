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
  for (const token of ['missingLaneSpecificRows', 'formulaLaneMismatchRows', 'formulaEvidenceWeakRows', 'Lane Mismatch', 'Weak Evidence', 'Missing Lane Fields']) {
    if (!md.includes(token)) throw new Error(`${testCase.name}: markdown missing lane-specific token ${token}`);
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
    topProducerTrack: report.summary.topProducerTrack,
    topAdjustmentKnob: report.summary.topAdjustmentKnob,
    nextAction: report.guardrails?.nextAction
  };
}

const results = CASES.map(runCase);
console.log(`[STAGE6_FORMULA_TUNING_BACKLOG_VALIDATE] PASS ${JSON.stringify(results)}`);
