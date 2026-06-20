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
    expectedLaneConsistencyIssues: 1
  },
  {
    name: 'formula_fields_present_passes',
    fixture: 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json',
    expectedOverall: 'pass_zero_executable_focus_fields_ok',
    expectedCoverage: { present: 4, total: 4 },
    expectedLaneConsistencyIssues: 0
  },
  {
    name: 'formula_lane_mismatch_warns',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_MISMATCH.fixture.json',
    expectedOverall: 'warn_formula_bottleneck_lane_mismatch',
    expectedCoverage: { present: 1, total: 1 },
    expectedLaneConsistencyIssues: 1
  }
];
const REQUIRED_FORMULA_FIELDS = [
  'zeroExecutableFormulaBottleneck',
  'zeroExecutableFormulaSeverity',
  'zeroExecutableTargetShortfallPct',
  'zeroExecutableRiskTargetShortfallPct',
  'zeroExecutableBreakoutProofGapCount',
  'zeroExecutableStructureProofGapCount',
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
  for (const token of [
    'preferredFormulaBottleneck',
    'primary_formula_bottleneck',
    'TARGET_RECALIBRATION_FORMULA',
    'RISK_GEOMETRY_RECALCULATION_FORMULA',
    'BREAKOUT_PROOF_FORMULA',
    'STRUCTURE_PROOF_FORMULA'
  ]) {
    if (!block.includes(token)) {
      throw new Error(`producer formula contract missing token: ${token}`);
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
  if (laneIssues !== testCase.expectedLaneConsistencyIssues) {
    throw new Error(`${testCase.name}: expected formulaLaneConsistencyIssues=${testCase.expectedLaneConsistencyIssues}, got ${laneIssues}`);
  }
  return {
    name: testCase.name,
    overall: report.overall,
    coverage: report.fieldCoverage?.zeroExecutableFormulaBottleneck,
    requiredFormulaFields: report.requiredFormulaFields,
    laneIssues
  };
}

const results = CASES.map(runCase);
validateProducerSourceContract();
console.log(`[STAGE6_FRESH_FOCUS_FORMULA_COVERAGE] PASS ${JSON.stringify(results)}`);
