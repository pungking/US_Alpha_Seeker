#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-fresh-focus-audit.mjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/fixtures/stage6_fresh_focus_formula');
const PRODUCER_SOURCE = path.join(REPO_ROOT, 'components/AlphaAnalysis.tsx');
const CASES = [
  {
    name: 'missing_formula_fields_warns',
    fixture: 'STAGE6_ALPHA_FINAL_MISSING_FORMULA.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_fields_missing',
    expectedCoverage: { present: 0, total: 1 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 1,
    expectedEvidenceQualityIssues: 1,
    expectedLaneSpecificFormulaIssues: 1
  },
  {
    name: 'formula_contract_missing_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_CONTRACT_MISSING.fixture.json',
    expectedOverall: 'warn_formula_contract_missing_or_mismatch',
    expectedCoverage: { present: 5, total: 5 },
    expectedManifestContractIssues: 1,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 0,
    expectedLaneSpecificFormulaIssues: 3
  },
  {
    name: 'formula_fields_present_passes',
    fixture: 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json',
    expectedOverall: 'pass_executable_present_focus_fields_ok',
    expectedCoverage: { present: 6, total: 6 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 0,
    expectedLaneSpecificFormulaIssues: 0
  },
  {
    name: 'formula_lane_mismatch_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_MISMATCH.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_lane_mismatch',
    expectedCoverage: { present: 2, total: 2 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 2,
    expectedEvidenceQualityIssues: 2,
    expectedLaneSpecificFormulaIssues: 0
  },
  {
    name: 'formula_evidence_weak_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_EVIDENCE_WEAK.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_evidence_weak',
    expectedCoverage: { present: 1, total: 1 },
    expectedManifestContractIssues: 0,
    expectedLaneConsistencyIssues: 0,
    expectedEvidenceQualityIssues: 1,
    expectedLaneSpecificFormulaIssues: 1
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
  return {
    name: testCase.name,
    overall: report.overall,
    coverage: report.fieldCoverage?.zeroExecutableFormulaBottleneck,
    requiredFormulaFields: report.requiredFormulaFields,
    contractIssues,
    laneIssues,
    evidenceIssues,
    laneSpecificIssues
  };
}

const results = CASES.map(runCase);
validateProducerSourceContract();
console.log(`[STAGE6_FRESH_FOCUS_FORMULA_COVERAGE] PASS ${JSON.stringify(results)}`);
