#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-policy-lane-audit.mjs');
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/fixtures/stage6_policy_lane_formula');
const CASES = [
  {
    name: 'no_action_formula_ok',
    fixture: 'STAGE6_POLICY_LANE_FORMULA_OK.fixture.json',
    expectedVerdict: 'NO_BUY_STRONG_BUY_WATCHLIST_ROWS',
    expectedLatestIssues: 0,
    expectedNoActionFormulaCount: 1
  },
  {
    name: 'no_action_formula_mismatch_blocks_policy_audit',
    fixture: 'STAGE6_POLICY_LANE_FORMULA_MISMATCH.fixture.json',
    expectedVerdict: 'STAGE6_FORMULA_LANE_CONTRACT_MISMATCH',
    expectedLatestIssues: 1,
    expectedNoActionFormulaCount: 0
  }
];

function runCase(testCase) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `stage6-policy-lane-${testCase.name}-`));
  const outJson = path.join(tmp, 'policy-lane.json');
  const outMd = path.join(tmp, 'policy-lane.md');
  const fixturePath = path.join(FIXTURE_DIR, testCase.fixture);
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      STAGE6_POLICY_LANE_AUDIT_INPUT: fixturePath,
      STAGE6_POLICY_LANE_AUDIT_OUT_JSON: outJson,
      STAGE6_POLICY_LANE_AUDIT_OUT_MD: outMd
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${testCase.name}: audit exited ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  const verdict = report.summary?.latestVerdict;
  if (verdict !== testCase.expectedVerdict) {
    throw new Error(`${testCase.name}: expected latestVerdict=${testCase.expectedVerdict}, got ${verdict}`);
  }
  const latestIssues = Number(report.summary?.latestFormulaLaneConsistencyIssues ?? -1);
  if (latestIssues !== testCase.expectedLatestIssues) {
    throw new Error(`${testCase.name}: expected latestFormulaLaneConsistencyIssues=${testCase.expectedLatestIssues}, got ${latestIssues}`);
  }
  const noActionCount = Number(report.summary?.latestAllZeroExecutableFormulaBottleneckCounts?.NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK || 0);
  if (noActionCount !== testCase.expectedNoActionFormulaCount) {
    throw new Error(`${testCase.name}: expected no-action formula count=${testCase.expectedNoActionFormulaCount}, got ${noActionCount}`);
  }
  return { name: testCase.name, verdict, latestIssues, noActionCount };
}

const results = CASES.map(runCase);
console.log(`[STAGE6_POLICY_LANE_FORMULA_CONSISTENCY] PASS ${JSON.stringify(results)}`);
