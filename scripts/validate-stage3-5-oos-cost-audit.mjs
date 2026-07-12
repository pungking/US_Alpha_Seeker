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
      STAGE35_OOS_INPUT: path.join(root, 'docs/fixtures/stage3_5_oos_cost', fixture),
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

runCase('insufficient.fixture.json', 3, 'insufficient_oos_evidence', 1);
runCase('invalid-contract.fixture.json', 3, 'invalid_input_contract', 0);
console.log('[STAGE3_5_OOS_COST_AUDIT] PASS');
