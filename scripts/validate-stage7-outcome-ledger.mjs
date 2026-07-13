#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'docs/fixtures/stage7_outcome_ledger/outcome-paths.fixture.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-outcome-ledger-'));
const stage6Dir = path.join(tmp, 'stage6');
const stage4Dir = path.join(tmp, 'stage4');
fs.mkdirSync(stage6Dir);
fs.mkdirSync(stage4Dir);

fs.writeFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_FIXTURE.json'), JSON.stringify({
  manifest: { timestamp: fixture.generatedAt, sourceRunId: 'fixture-run', sourceSha: 'fixture-sha' },
  execution_contract: {
    executablePicks: fixture.signals.map((row, index) => ({
      ...row,
      finalDecision: 'EXECUTABLE_NOW',
      decisionReason: 'fixture',
      modelRank: index + 1,
      executionRank: index + 1
    }))
  }
}));
fs.writeFileSync(path.join(stage4Dir, 'STAGE4_TECHNICAL_FULL_FIXTURE.json'), JSON.stringify({
  manifest: { timestamp: '2026-01-07T22:00:00.000Z' },
  technical_universe: Object.entries(fixture.history).map(([symbol, priceHistory]) => ({ symbol, priceHistory }))
}));

const output = path.join(tmp, 'ledger.json');
const oos = path.join(tmp, 'oos.json');
const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    STAGE7_STAGE6_DIR: stage6Dir,
    STAGE7_STAGE4_DIR: stage4Dir,
    STAGE7_OUTCOME_LEDGER_OUT: output,
    STAGE7_OOS_OUT: oos,
    STAGE7_OUTCOME_MD_OUT: path.join(tmp, 'ledger.md'),
    STAGE7_HORIZON_BARS: String(fixture.horizonBars),
    STAGE7_SPREAD_BPS: '10',
    STAGE7_SLIPPAGE_BPS: '5',
    STAGE7_COMMISSION_BPS: '1'
  },
  encoding: 'utf8'
});
if (result.status !== 0) throw new Error(`builder failed\n${result.stdout}\n${result.stderr}`);

const ledger = JSON.parse(fs.readFileSync(output, 'utf8'));
const labels = Object.fromEntries(ledger.rows.map((row) => [row.symbol, row.outcomeLabel]));
for (const [symbol, expected] of Object.entries(fixture.expected)) {
  if (labels[symbol] !== expected) throw new Error(`${symbol}: expected ${expected}, got ${labels[symbol]}`);
}
if (ledger.summary.preSignalBarsExcluded !== 0) throw new Error('fixture unexpectedly used pre-signal bars');
if (ledger.summary.resolvedRows !== 5 || ledger.summary.pendingRows !== 2) throw new Error('unexpected resolution counts');
if (ledger.summary.missingHistoryRows !== 1 || ledger.summary.historyCoverageRows !== 6) {
  throw new Error('source-history coverage was not classified');
}

const oosPayload = JSON.parse(fs.readFileSync(oos, 'utf8'));
if (oosPayload.schemaVersion !== 'stage3-5-oos-v1') throw new Error('unexpected OOS schema');
if (oosPayload.rows.length !== 3) throw new Error(`expected 3 OOS rows, got ${oosPayload.rows.length}`);
if (oosPayload.rows.some((row) => row.split !== 'OOS' || row.costInputBasis !== 'conservative_policy_assumption_v1')) {
  throw new Error('OOS contract or cost basis mismatch');
}
if (oosPayload.rows.some((row) => row.signalMarketPhase !== 'PRE_RTH')) {
  throw new Error('signal market phase was not propagated to OOS rows');
}
if (oosPayload.rows.some((row) => row.walkForwardCohort !== '2026-01' || row.resolvedAt <= row.signalDate)) {
  throw new Error('walk-forward temporal contract mismatch');
}
if (ledger.rows.find((row) => row.symbol === 'TPATH')?.fillDate !== '2026-01-02') {
  throw new Error('pre-RTH signal-date daily bar was not admitted');
}
if (ledger.source.stage6Files?.[0] !== 'STAGE6_ALPHA_FINAL_FIXTURE.json') {
  throw new Error('Stage6 source file lineage was not recorded');
}

console.log('[STAGE7_OUTCOME_LEDGER] PASS');
