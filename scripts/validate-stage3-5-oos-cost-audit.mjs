#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const builder = path.join(root, 'scripts/build-stage3-5-oos-cost-audit.mjs');

function runCase(fixture, minimumSample, expectedVerdict, expectedRows) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage3-5-oos-cost-'));
  const output = path.join(tmp, 'audit.json');
  const result = spawnSync(process.execPath, [builder], {
    cwd: root,
    env: {
      ...process.env,
      STAGE35_OOS_INPUT: path.isAbsolute(fixture) ? fixture : path.join(root, 'docs/fixtures/stage3_5_oos_cost', fixture),
      STAGE35_OOS_OUT_JSON: output,
      STAGE35_OOS_OUT_MD: path.join(tmp, 'audit.md'),
      STAGE35_OOS_MIN_SAMPLE: String(minimumSample)
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${fixture}: builder failed\n${result.stdout}\n${result.stderr}`);
  }
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  if (report.overall !== expectedVerdict) throw new Error(`${fixture}: unexpected verdict ${report.overall}`);
  if (report.summary.validOosRows !== expectedRows) throw new Error(`${fixture}: unexpected row count`);
  return report;
}

const ready = runCase('ready.fixture.json', 3, 'pass_report_only', 3);
if (ready.summary.rejectedNonOosRows !== 1) throw new Error('TRAIN row was not rejected');
if (ready.summary.netWinRatePct !== 66.67) throw new Error(`unexpected net win rate ${ready.summary.netWinRatePct}`);
if (ready.summary.meanGrossReturnPct !== 2.33) throw new Error(`unexpected gross return ${ready.summary.meanGrossReturnPct}`);
if (ready.summary.meanNetReturnPct !== 2.09) throw new Error(`unexpected net return ${ready.summary.meanNetReturnPct}`);
if (ready.walkForward.cohorts.length !== 1 || ready.walkForward.cohorts[0].cohort !== '2026-06') {
  throw new Error('walk-forward cohort summary mismatch');
}

runCase('insufficient.fixture.json', 3, 'insufficient_oos_evidence', 1);
runCase('invalid-contract.fixture.json', 3, 'invalid_input_contract', 0);
const cohorts = runCase('cohorts.fixture.json', 3, 'pass_report_only', 7);
if (cohorts.cohortComparison?.status !== 'report_only_comparison_ready_not_policy_change') {
  throw new Error(`cohort comparison was not ready: ${JSON.stringify(cohorts.cohortComparison)}`);
}
if (cohorts.cohortComparison.executableResolvedRows !== 3 || cohorts.cohortComparison.actionableBlockedResolvedRows !== 3) {
  throw new Error('comparison cohort counts were not preserved');
}
if (cohorts.cohortComparison.nonActionableControlRows !== 1) throw new Error('control cohort count mismatch');
if (cohorts.summary.unknownCohortRows !== 0) throw new Error('unknown cohort rows were accepted');
const unverifiedInput = JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/stage3_5_oos_cost/cohorts.fixture.json'), 'utf8'));
unverifiedInput.rows.find((row) => row.decisionCohort === 'ACTIONABLE_BLOCKED_COHORT').lineageVerifiedForComparison = false;
const unverifiedPath = path.join(os.tmpdir(), `stage3-5-oos-unverified-${process.pid}.json`);
fs.writeFileSync(unverifiedPath, JSON.stringify(unverifiedInput));
const unverified = runCase(unverifiedPath, 3, 'insufficient_oos_evidence', 7);
if (unverified.cohortComparison.lineageUnverifiedRows !== 1) throw new Error('unverified lineage did not block cohort comparison');
const invalidV2 = { ...unverifiedInput };
delete invalidV2.sourceLedgerSchemaVersion;
const invalidV2Path = path.join(os.tmpdir(), `stage3-5-oos-invalid-v2-${process.pid}.json`);
fs.writeFileSync(invalidV2Path, JSON.stringify(invalidV2));
runCase(invalidV2Path, 3, 'invalid_input_contract', 7);
const noComparableRows = structuredClone(unverifiedInput);
for (const row of noComparableRows.rows) row.lineageVerifiedForComparison = false;
const noComparablePath = path.join(os.tmpdir(), `stage3-5-oos-no-comparable-${process.pid}.json`);
fs.writeFileSync(noComparablePath, JSON.stringify(noComparableRows));
const noComparable = runCase(noComparablePath, 3, 'insufficient_oos_evidence', 7);
if (noComparable.cohortComparison.executableMeanNetReturnPct !== null
  || noComparable.cohortComparison.actionableBlockedMeanNetReturnPct !== null
  || noComparable.cohortComparison.blockedMinusExecutableMeanNetReturnPct !== null) {
  throw new Error('missing comparison evidence was rendered as a zero-return effect');
}
console.log('[STAGE3_5_OOS_COST_AUDIT] PASS');
