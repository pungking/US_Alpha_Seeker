#!/usr/bin/env node
import crypto from 'node:crypto';
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

const executablePicks = fixture.signals.map((row, index) => ({
  ...row,
  aiVerdict: row.aiVerdict || 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture',
  modelRank: index + 1,
  executionRank: index + 1
}));
fs.writeFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_FIXTURE.json'), JSON.stringify({
  manifest: {
    timestamp: fixture.generatedAt,
    sourceRunId: 'fixture-run',
    sourceSha: 'fixture-sha',
    sourceStage5Timestamp: '2026-01-01T22:00:00.000Z'
  },
  execution_contract: {
    decisionGate: { actionableVerdicts: ['BUY', 'STRONG_BUY', 'STRONGBUY'] },
    executablePicks,
    modelTop6: [...fixture.blockedSignals, ...fixture.controlSignals],
    watchlistTop: [...fixture.blockedSignals, ...fixture.controlSignals]
  }
}));
fs.writeFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_RTH_FIXTURE.json'), JSON.stringify({
  manifest: {
    timestamp: fixture.rthGeneratedAt,
    sourceRunId: 'fixture-rth-run',
    sourceSha: 'fixture-rth-sha',
    sourceStage5Timestamp: '2026-01-01T22:00:00.000Z'
  },
  execution_contract: {
    decisionGate: { actionableVerdicts: ['BUY', 'STRONG_BUY', 'STRONGBUY'] },
    executablePicks: fixture.rthSignals.map((row, index) => ({
      ...row,
      finalDecision: 'EXECUTABLE_NOW',
      decisionReason: 'fixture_rth',
      modelRank: index + 1,
      executionRank: index + 1
    })),
    modelTop6: [],
    watchlistTop: []
  }
}));
fs.writeFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_NO_LINEAGE_FIXTURE.json'), JSON.stringify({
  manifest: {
    timestamp: fixture.generatedAt,
    sourceRunId: 'fixture-no-lineage-run',
    sourceSha: 'fixture-future-source-sha',
    sourceStage5Timestamp: '2026-01-03T13:00:00.000Z'
  },
  execution_contract: {
    decisionGate: { actionableVerdicts: ['BUY', 'STRONG_BUY', 'STRONGBUY'] },
    executablePicks: [],
    modelTop6: fixture.lineageInvalidSignals,
    watchlistTop: fixture.lineageInvalidSignals
  }
}));

const buildEventEvidence = (status) => ({
  status,
  source: 'FIXTURE_LISTING_EVENTS',
  sourceAsOf: '2026-01-07T21:00:00.000Z'
});
const buildCorporateActionLineage = (symbol, verified = true) => ({
  schemaVersion: 'corporate-action-lineage-v1',
  lineageStatus: 'PRESENT',
  symbol,
  sourceSymbol: symbol,
  vendor: 'YFINANCE_YAHOO',
  retrievedAt: '2026-01-07T22:00:00.000Z',
  sourceAsOf: '2026-01-07T00:00:00.000Z',
  marketTimezone: 'America/New_York',
  adjustmentType: 'YFINANCE_AUTO_ADJUSTED_OHLC',
  splitAdjustmentStatus: 'VERIFIED_YFINANCE_AUTO_ADJUSTED',
  dividendAdjustmentStatus: 'VERIFIED_YFINANCE_AUTO_ADJUSTED',
  corporateActionStatus: 'VERIFIED_NO_SPLIT_OR_DIVIDEND_EVENT_IN_WINDOW',
  symbolChangeStatus: verified
    ? 'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE'
    : 'UNVERIFIED_HISTORICAL_SYMBOL_CHANGE_SOURCE_MISSING',
  delistingStatus: verified
    ? 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE'
    : 'UNVERIFIED_DELISTING_EVENT_SOURCE_MISSING',
  suspensionStatus: verified
    ? 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE'
    : 'UNVERIFIED_SUSPENSION_EVENT_SOURCE_MISSING',
  symbolChangeEvidence: verified
    ? buildEventEvidence('VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE')
    : null,
  delistingEvidence: verified
    ? buildEventEvidence('VERIFIED_NOT_DELISTED_AS_OF_SOURCE')
    : null,
  suspensionEvidence: verified
    ? buildEventEvidence('VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE')
    : null,
  sourceFreshnessStatus: 'FRESH',
  historyCoverageStatus: 'VERIFIED_OBSERVED_HISTORY',
  survivorshipBiasStatus: verified
    ? 'VERIFIED_CORPORATE_ACTION_LINEAGE'
    : 'UNVERIFIED_INCOMPLETE_CORPORATE_ACTION_COVERAGE',
  returnBasis: 'DIVIDEND_AND_SPLIT_ADJUSTED_PRICE_RETURN',
  lookbackStart: '2025-01-02',
  lookbackEnd: '2026-01-07',
  observationCount: 252,
  splitEvents: [],
  dividendEvents: [],
  lineageVerifiedForComparison: verified
});
fs.writeFileSync(path.join(stage4Dir, 'STAGE4_TECHNICAL_FULL_FIXTURE.json'), JSON.stringify({
  manifest: { timestamp: '2026-01-07T22:00:00.000Z', marketTimezone: 'America/New_York' },
  technical_universe: Object.entries(fixture.history).map(([symbol, priceHistory]) => ({
    symbol,
    priceHistory,
    dataSource: 'FIXTURE_DRIVE',
    updated: '2026-01-07T22:00:00.000Z',
    corporateActionLineage: buildCorporateActionLineage(symbol, symbol !== 'SPECCTRL')
  }))
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
if (ledger.schemaVersion !== 'stage7-outcome-ledger-v2') throw new Error(`unexpected ledger schema ${ledger.schemaVersion}`);
const labels = Object.fromEntries(ledger.rows.map((row) => [row.symbol, row.outcomeLabel]));
for (const [symbol, expected] of Object.entries(fixture.expected)) {
  if (labels[symbol] !== expected) throw new Error(`${symbol}: expected ${expected}, got ${labels[symbol]}`);
}
if (labels.BLOCKED !== 'TP_FIRST' || labels.CONTROL !== 'SL_FIRST' || labels.RTHBAR !== 'TP_FIRST') {
  throw new Error('cohort or RTH outcome path mismatch');
}
if (labels.BADGEO !== 'EXCLUDED_INVALID_GEOMETRY') throw new Error('invalid geometry was evaluated as a false negative');
if (labels.SOURCEBAD !== 'EXCLUDED_SOURCE_LINEAGE_INVALID') throw new Error('invalid source lineage was evaluated as OOS evidence');
if (ledger.rows.find((row) => row.symbol === 'SOURCEBAD')?.decisionSnapshot?.sourceFreshnessStatus !== 'SOURCE_TIMESTAMP_AFTER_DECISION') {
  throw new Error('future producer timestamp was not classified as invalid decision-time lineage');
}
if (ledger.summary.preSignalBarsExcluded < 1) throw new Error('RTH signal-date bar was not excluded');
if (ledger.summary.missingHistoryRows !== 1 || ledger.summary.historyCoverageRows !== 12) {
  throw new Error(`source-history coverage was not classified: ${JSON.stringify(ledger.summary)}`);
}
if (ledger.summary.duplicateSeedRows !== 0 || ledger.summary.unknownCohortRows !== 0) {
  throw new Error('seed idempotency or cohort classification failed');
}
if (ledger.summary.cohortCounts.EXECUTABLE_COHORT !== 8
  || ledger.summary.cohortCounts.ACTIONABLE_BLOCKED_COHORT !== 2
  || ledger.summary.cohortCounts.NON_ACTIONABLE_CONTROL_COHORT !== 3) {
  throw new Error(`unexpected cohort counts: ${JSON.stringify(ledger.summary.cohortCounts)}`);
}
if (ledger.summary.falseNegativeEligibleRows !== 1) throw new Error('invalid blocked geometry entered false-negative cohort');
if (ledger.cohortOutcomes?.ACTIONABLE_BLOCKED_COHORT?.outcomeCounts?.TP_FIRST !== 1
  || ledger.cohortOutcomes?.ACTIONABLE_BLOCKED_COHORT?.falseNegativeEligibleRows !== 1
  || ledger.blockerOutcomes?.STRUCTURE_PROOF?.outcomeCounts?.TP_FIRST !== 1) {
  throw new Error('cohort/blocker MAE-MFE outcome aggregation missing');
}
if (ledger.blockerOutcomes?.SCHEMA_OR_LINEAGE_MISMATCH?.meanMfePct !== null) {
  throw new Error('excluded rows polluted MAE/MFE averages');
}
if (ledger.summary.lookAheadViolationRows !== 0 || ledger.summary.survivorshipBiasViolationRows !== 0) {
  throw new Error('bias contract violation');
}
if (ledger.summary.comparisonLineageExcludedRows !== 1 || ledger.summary.comparisonEligibleHistoryRows !== 11) {
  throw new Error(`corporate-action comparison eligibility summary mismatch: ${JSON.stringify(ledger.summary)}`);
}
if (ledger.rows.some((row) => !row.decisionSnapshotSha256 || !row.primaryBlocker || !row.historyLineage)) {
  throw new Error('immutable snapshot or lineage evidence missing');
}
if (ledger.rows.some((row) => row.sourceLineageValid && row.decisionSnapshot?.sourceFreshnessStatus !== 'SOURCE_TIMESTAMP_ORDER_VALID')) {
  throw new Error('decision-time source freshness evidence missing');
}
const fixtureSource = fs.readFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_FIXTURE.json'), 'utf8');
const fixtureHash = crypto.createHash('sha256').update(fixtureSource).digest('hex');
const expectedTpId = crypto.createHash('sha256').update(`${fixtureHash}|TPATH`).digest('hex').slice(0, 24);
if (ledger.rows.find((row) => row.symbol === 'TPATH')?.ledgerId !== expectedTpId) {
  throw new Error('ledger identity changed with cohort classification');
}
if (ledger.rows.find((row) => row.symbol === 'RTHBAR')?.fillDate !== '2026-01-05') {
  throw new Error('RTH signal incorrectly used the same-date daily bar');
}

const oosPayload = JSON.parse(fs.readFileSync(oos, 'utf8'));
if (oosPayload.schemaVersion !== 'stage3-5-oos-v2') throw new Error('unexpected OOS schema');
if (oosPayload.rows.length !== 6) throw new Error(`expected 6 OOS rows, got ${oosPayload.rows.length}`);
if (oosPayload.rows.some((row) => row.split !== 'OOS' || row.costInputBasis !== 'conservative_policy_assumption_v1')) {
  throw new Error('OOS contract or cost basis mismatch');
}
if (oosPayload.rows.some((row) => row.signalMarketPhase !== 'PRE_RTH')) {
  const rthRows = oosPayload.rows.filter((row) => row.signalMarketPhase === 'RTH');
  if (rthRows.length !== 1) throw new Error('signal market phase was not propagated to OOS rows');
}
if (oosPayload.rows.some((row) => row.walkForwardCohort !== '2026-01' || row.resolvedAt <= row.signalDate)) {
  throw new Error('walk-forward temporal contract mismatch');
}
if (ledger.rows.find((row) => row.symbol === 'TPATH')?.fillDate !== '2026-01-02') {
  throw new Error('pre-RTH signal-date daily bar was not admitted');
}
if (!ledger.source.stage6Files?.includes('STAGE6_ALPHA_FINAL_FIXTURE.json')) {
  throw new Error('Stage6 source file lineage was not recorded');
}
if (oosPayload.rows.find((row) => row.symbol === 'BLOCKED')?.decisionCohort !== 'ACTIONABLE_BLOCKED_COHORT') {
  throw new Error('blocked cohort was not propagated to OOS output');
}
if (oosPayload.rows.find((row) => row.symbol === 'CONTROL')?.decisionCohort !== 'NON_ACTIONABLE_CONTROL_COHORT') {
  throw new Error('control cohort was not propagated to OOS output');
}
if (ledger.rows.find((row) => row.symbol === 'SPECCTRL')?.falseNegativeEligible !== false
  || ledger.rows.find((row) => row.symbol === 'SPECCTRL')?.primaryBlocker !== 'QUALITY_NON_ACTIONABLE_VERDICT'
  || ledger.rows.find((row) => row.symbol === 'SPECCTRL')?.outcomeLabel !== 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED'
  || oosPayload.rows.some((row) => row.symbol === 'SPECCTRL')) {
  throw new Error('SPECULATIVE_BUY entered the false-negative cohort');
}
if (oosPayload.rows.some((row) => row.lineageVerifiedForComparison !== true
  || row.corporateActionLineageSchemaVersion !== 'corporate-action-lineage-v1'
  || row.sourceAsOf !== '2026-01-07T00:00:00.000Z'
  || row.marketTimezone !== 'America/New_York'
  || row.sourceFreshnessStatus !== 'FRESH'
  || row.historyCoverageStatus !== 'VERIFIED_OBSERVED_HISTORY'
  || row.symbolChangeStatus !== 'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE'
  || row.delistingStatus !== 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE'
  || row.suspensionStatus !== 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE'
  || row.returnBasis !== 'DIVIDEND_AND_SPLIT_ADJUSTED_PRICE_RETURN')) {
  throw new Error('verified corporate-action lineage was not propagated to OOS evidence');
}
const symbolChangeRow = ledger.rows.find((row) => row.symbol === 'NOSOURCE');
if (symbolChangeRow?.outcomeLabel !== 'PENDING_SOURCE_HISTORY'
  || symbolChangeRow?.decisionSnapshot?.symbolChangeReference !== 'OLDNAME') {
  throw new Error('unmapped symbol change was treated as a successful or failed outcome');
}

const firstIds = ledger.rows.map((row) => `${row.ledgerId}:${row.decisionSnapshotSha256}`);
const stage4FixturePath = path.join(stage4Dir, 'STAGE4_TECHNICAL_FULL_FIXTURE.json');
const changedOutcomeEvidence = JSON.parse(fs.readFileSync(stage4FixturePath, 'utf8'));
changedOutcomeEvidence.technical_universe.find((row) => row.symbol === 'NOFILL').priceHistory[0].close = 105.5;
changedOutcomeEvidence.technical_universe.find((row) => row.symbol === 'NOFILL').corporateActionLineage.retrievedAt = '2026-01-08T22:00:00.000Z';
fs.writeFileSync(stage4FixturePath, JSON.stringify(changedOutcomeEvidence));
const secondResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
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
if (secondResult.status !== 0) throw new Error(`idempotency rerun failed\n${secondResult.stdout}\n${secondResult.stderr}`);
const secondLedger = JSON.parse(fs.readFileSync(output, 'utf8'));
if (JSON.stringify(firstIds) !== JSON.stringify(secondLedger.rows.map((row) => `${row.ledgerId}:${row.decisionSnapshotSha256}`))) {
  throw new Error('idempotent rerun changed ledger identity or immutable snapshots');
}

const renamedTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-outcome-ledger-renamed-'));
const renamedStage6Dir = path.join(renamedTmp, 'stage6');
const renamedStage4Dir = path.join(renamedTmp, 'stage4');
fs.mkdirSync(renamedStage6Dir);
fs.mkdirSync(renamedStage4Dir);
const rename = (symbol) => `X${symbol}`;
for (const file of fs.readdirSync(stage6Dir)) {
  const payload = JSON.parse(fs.readFileSync(path.join(stage6Dir, file), 'utf8'));
  for (const key of ['executablePicks', 'modelTop6', 'watchlistTop']) {
    for (const row of payload.execution_contract?.[key] || []) row.symbol = rename(row.symbol);
  }
  fs.writeFileSync(path.join(renamedStage6Dir, file), JSON.stringify(payload));
}
for (const file of fs.readdirSync(stage4Dir)) {
  const payload = JSON.parse(fs.readFileSync(path.join(stage4Dir, file), 'utf8'));
  for (const row of payload.technical_universe || []) {
    row.symbol = rename(row.symbol);
    if (row.corporateActionLineage) {
      row.corporateActionLineage.symbol = rename(row.corporateActionLineage.symbol);
      row.corporateActionLineage.sourceSymbol = rename(row.corporateActionLineage.sourceSymbol);
    }
  }
  fs.writeFileSync(path.join(renamedStage4Dir, file), JSON.stringify(payload));
}
const renamedOutput = path.join(renamedTmp, 'ledger.json');
const renamedResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    STAGE7_STAGE6_DIR: renamedStage6Dir,
    STAGE7_STAGE4_DIR: renamedStage4Dir,
    STAGE7_OUTCOME_LEDGER_OUT: renamedOutput,
    STAGE7_OOS_OUT: path.join(renamedTmp, 'oos.json'),
    STAGE7_OUTCOME_MD_OUT: path.join(renamedTmp, 'ledger.md'),
    STAGE7_HORIZON_BARS: String(fixture.horizonBars),
    STAGE7_SPREAD_BPS: '10',
    STAGE7_SLIPPAGE_BPS: '5',
    STAGE7_COMMISSION_BPS: '1'
  },
  encoding: 'utf8'
});
if (renamedResult.status !== 0) throw new Error(`rename fixture failed\n${renamedResult.stdout}\n${renamedResult.stderr}`);
const renamedLedger = JSON.parse(fs.readFileSync(renamedOutput, 'utf8'));
const invariantSummary = (value) => ({
  resolvedRows: value.resolvedRows,
  pendingRows: value.pendingRows,
  excludedRows: value.excludedRows,
  oosRows: value.oosRows,
  missingHistoryRows: value.missingHistoryRows,
  falseNegativeEligibleRows: value.falseNegativeEligibleRows,
  cohortCounts: value.cohortCounts,
  blockerCounts: value.blockerCounts
});
if (JSON.stringify(invariantSummary(secondLedger.summary)) !== JSON.stringify(invariantSummary(renamedLedger.summary))) {
  throw new Error('ticker rename changed aggregate cohort or outcome verdict');
}

console.log('[STAGE7_OUTCOME_LEDGER] PASS');
