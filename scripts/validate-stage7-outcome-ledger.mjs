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

const buildMarketRegimeLineage = (
  marketRegime,
  sourceAsOf = '2026-01-01T21:55:00.000Z',
  overrides = {}
) => ({
  schemaVersion: 'market-regime-lineage-v1',
  status: 'VERIFIED_DECISION_TIME_REGIME',
  marketRegime,
  score: marketRegime === 'RISK_OFF' ? 35 : 75,
  source: 'HARVESTER_MARKET_REGIME_SNAPSHOT',
  sourceFile: 'MARKET_REGIME_SNAPSHOT.json',
  sourceSha256: 'c'.repeat(64),
  triggerFile: 'STAGE3_FUNDAMENTAL_FULL_FIXTURE.json',
  expectedTriggerFile: 'STAGE3_FUNDAMENTAL_FULL_FIXTURE.json',
  triggerMatches: true,
  sourceAsOf,
  retrievedAt: '2026-01-01T22:00:00.000Z',
  marketTimezone: 'America/New_York',
  qualityStatus: 'PASS_COMPLETE_SNAPSHOT',
  freshnessStatus: 'CURRENT_TRIGGER_MATCH',
  degraded: false,
  fallbackSource: null,
  ...overrides
});

const executablePicks = fixture.signals.map((row, index) => ({
  ...row,
  aiVerdict: row.aiVerdict || 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture',
  modelRank: index + 1,
  executionRank: index + 1,
  marketRegimeLineage: row.symbol === 'NOSOURCE'
    ? buildMarketRegimeLineage('RISK_ON', '2026-01-03T13:00:00.000Z')
    : row.symbol === 'PENDING'
      ? buildMarketRegimeLineage('RISK_ON', undefined, {
          status: 'DEGRADED_INCOMPLETE_SNAPSHOT',
          qualityStatus: 'DEGRADED_INCOMPLETE_SNAPSHOT',
          degraded: true
        })
      : buildMarketRegimeLineage(index % 2 ? 'RISK_OFF' : 'RISK_ON'),
  marketState: row.symbol === 'PENDING' ? 'MARKUP' : undefined
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
    modelTop6: [...fixture.blockedSignals, ...fixture.controlSignals].map((row, index) => ({
      ...row,
      marketRegimeLineage: buildMarketRegimeLineage(index % 2 ? 'RISK_OFF' : 'RISK_ON')
    })),
    watchlistTop: [...fixture.blockedSignals, ...fixture.controlSignals].map((row, index) => ({
      ...row,
      marketRegimeLineage: buildMarketRegimeLineage(index % 2 ? 'RISK_OFF' : 'RISK_ON')
    }))
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
      executionRank: index + 1,
      marketRegimeLineage: buildMarketRegimeLineage('RISK_OFF')
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

const buildEventEvidence = (status, symbol) => ({
  status,
  source: 'FIXTURE_LISTING_EVENTS',
  sourceAsOf: '2026-01-07T21:00:00.000Z',
  sourceAsOfBasis: 'FIXTURE_VENDOR_PUBLICATION_TIME',
  retrievedAt: '2026-01-07T21:30:00.000Z',
  requestStatus: 'SUCCESS',
  requestedSymbol: symbol,
  matchedSymbol: null,
  symbolMatchStatus: 'NO_EXACT_EVENT_MATCH_IN_COMPLETE_RESPONSE',
  symbolMatchMethod: 'DETERMINISTIC_EXACT_NORMALIZED_SYMBOL_LOOKUP',
  sourceScopeComplete: true,
  coverageStart: '2025-01-01',
  coverageEnd: '2026-01-07',
  partialResponse: false,
  responseSha256: 'a'.repeat(64),
  requestScopeSymbolsSha256: 'b'.repeat(64),
  queryScope: 'FIXTURE_COMPLETE_SOURCE_WINDOW'
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
    ? buildEventEvidence('VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE', symbol)
    : null,
  delistingEvidence: verified
    ? buildEventEvidence('VERIFIED_NOT_DELISTED_AS_OF_SOURCE', symbol)
    : null,
  suspensionEvidence: verified
    ? buildEventEvidence('VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE', symbol)
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
const accumulationClassBySymbol = Object.fromEntries(
  ledger.rows.map((row) => [row.symbol, row.accumulationLifecycle?.classification])
);
if (accumulationClassBySymbol.TPATH !== 'COMPARISON_ELIGIBLE_RESOLVED'
  || accumulationClassBySymbol.NOFILL !== 'RESOLVED_NON_RETURN_OUTCOME'
  || accumulationClassBySymbol.PENDING !== 'PENDING_HORIZON_NOT_MATURED'
  || accumulationClassBySymbol.NOSOURCE !== 'PENDING_HISTORY_RETRYABLE'
  || accumulationClassBySymbol.SPECCTRL !== 'EXCLUDED_SOURCE_CONTRACT_BLOCKED'
  || accumulationClassBySymbol.SOURCEBAD !== 'INVALID_DECISION_OR_HISTORY_LINEAGE') {
  throw new Error(`Stage7 accumulation lifecycle classification mismatch: ${JSON.stringify(accumulationClassBySymbol)}`);
}
const pendingLifecycle = ledger.rows.find((row) => row.symbol === 'PENDING')?.accumulationLifecycle;
if (pendingLifecycle?.requiredMarketSessions !== fixture.horizonBars
  || pendingLifecycle?.observedMarketSessions !== 1
  || pendingLifecycle?.remainingMarketSessions !== 2
  || pendingLifecycle?.historyLatestSession !== '2026-01-05'
  || pendingLifecycle?.earliestPendingMaturityAt !== null
  || pendingLifecycle?.nextNaturalRunCanTransition !== true) {
  throw new Error(`pending maturity evidence mismatch: ${JSON.stringify(pendingLifecycle)}`);
}
if (ledger.accumulationLiveness?.status !== 'PROGRESSING_NATURALLY'
  || ledger.accumulationLiveness?.summary?.unknownOrUnclassifiedRows !== 0
  || ledger.accumulationLiveness?.progress?.executableComparable?.required !== 30
  || ledger.accumulationLiveness?.progress?.actionableBlockedComparable?.required !== 30
  || ledger.accumulationLiveness?.progress?.comparableRegimes?.required !== 2
  || ledger.accumulationLiveness?.policyChangeAuthorized !== false) {
  throw new Error(`Stage7 accumulation liveness summary mismatch: ${JSON.stringify(ledger.accumulationLiveness)}`);
}
if (ledger.rows.some((row) => !row.decisionSnapshotSha256 || !row.primaryBlocker || !row.historyLineage)) {
  throw new Error('immutable snapshot or lineage evidence missing');
}
if (ledger.rows.find((row) => row.symbol === 'PENDING')?.decisionSnapshot?.marketRegime !== 'UNKNOWN'
  || ledger.rows.find((row) => row.symbol === 'PENDING')?.decisionSnapshot?.marketRegimeLineageVerifiedForComparison !== false
  || ledger.rows.find((row) => row.symbol === 'NOSOURCE')?.decisionSnapshot?.marketRegimeLineageStatus !== 'SOURCE_TIMESTAMP_AFTER_DECISION'
  || ledger.rows.find((row) => row.symbol === 'SOURCEBAD')?.decisionSnapshot?.marketRegimeLineageStatus !== 'MARKET_REGIME_LINEAGE_MISSING') {
  throw new Error('future/degraded market-regime evidence entered the decision-time contract');
}
if (ledger.rows.some((row) => row.decisionSnapshot?.marketRegime === 'MARKUP')) {
  throw new Error('ticker ICT marketState was misclassified as the global market regime');
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
if (oosPayload.rows.some((row) => !['RISK_ON', 'RISK_OFF'].includes(row.marketRegime)
  || !Number.isFinite(Number(row.marketRegimeScore))
  || row.marketRegimeLineageVerifiedForComparison !== true
  || row.marketRegimeLineageSchemaVersion !== 'market-regime-lineage-v1'
  || row.marketRegimeSource !== 'HARVESTER_MARKET_REGIME_SNAPSHOT'
  || !/^[0-9a-f]{64}$/.test(String(row.marketRegimeSourceSha256 || ''))
  || row.marketRegimeTriggerFile !== row.marketRegimeExpectedTriggerFile
  || row.marketRegimeTriggerMatches !== true
  || row.marketRegimeMarketTimezone !== 'America/New_York'
  || row.marketRegimeQualityStatus !== 'PASS_COMPLETE_SNAPSHOT'
  || row.marketRegimeFreshnessStatus !== 'CURRENT_TRIGGER_MATCH'
  || row.marketRegimeDegraded !== false
  || row.marketRegimeFallbackSource !== null)) {
  throw new Error('decision-time market regime was not propagated to OOS evidence');
}
if (JSON.stringify(oosPayload.sourceLedgerSummary) !== JSON.stringify({
  duplicateSeedRows: 0,
  unknownCohortRows: 0,
  lookAheadViolationRows: 0,
  survivorshipBiasViolationRows: 0
})) {
  throw new Error(`Stage7 safety summary was not propagated: ${JSON.stringify(oosPayload.sourceLedgerSummary)}`);
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
  || !/^[0-9a-f]{64}$/.test(String(row.externalEvidenceSha256 || ''))
  || row.lineageEvaluatedAt !== '2026-01-07T22:00:00.000Z'
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

const proofTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-outcome-proof-'));
const proofStage6Dir = path.join(proofTmp, 'stage6');
const proofStage4Dir = path.join(proofTmp, 'stage4');
fs.mkdirSync(proofStage6Dir);
fs.mkdirSync(proofStage4Dir);
const proofSignal = {
  ...fixture.signals[0],
  symbol: 'PROOFBAD',
  aiVerdict: 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture_missing_external_query_proof',
  modelRank: 1,
  executionRank: 1
};
const aliasSignal = {
  ...fixture.signals[0],
  symbol: 'NEWCO',
  aiVerdict: 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture_verified_symbol_alias_chain',
  modelRank: 2,
  executionRank: 2
};
const rebaseSignal = {
  ...fixture.signals[0],
  symbol: 'REBASE',
  aiVerdict: 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture_post_decision_split_rebase_required',
  modelRank: 3,
  executionRank: 3
};
const legacySignal = {
  ...fixture.signals[0],
  symbol: 'LEGACY',
  aiVerdict: 'BUY',
  executionActionableVerdict: true,
  finalDecision: 'EXECUTABLE_NOW',
  decisionReason: 'fixture_legacy_lineage',
  modelRank: 4,
  executionRank: 4
};
fs.writeFileSync(path.join(proofStage6Dir, 'STAGE6_ALPHA_FINAL_PROOF_FIXTURE.json'), JSON.stringify({
  manifest: {
    timestamp: fixture.generatedAt,
    sourceRunId: 'fixture-proof-run',
    sourceSha: 'fixture-proof-sha',
    sourceStage5Timestamp: '2026-01-01T22:00:00.000Z'
  },
  execution_contract: {
    decisionGate: { actionableVerdicts: ['BUY', 'STRONG_BUY', 'STRONGBUY'] },
    executablePicks: [proofSignal, aliasSignal, rebaseSignal, legacySignal],
    modelTop6: [],
    watchlistTop: []
  }
}));
const proofLineage = buildCorporateActionLineage('PROOFBAD');
proofLineage.symbolChangeEvidence.partialResponse = true;
proofLineage.delistingStatus = 'UNVERIFIED_SOURCE_CONFLICT';
proofLineage.delistingEvidence.status = 'UNVERIFIED_SOURCE_CONFLICT';
delete proofLineage.suspensionEvidence.responseSha256;
const aliasLineage = buildCorporateActionLineage('NEWCO');
aliasLineage.sourceSymbol = 'OLDCO';
aliasLineage.symbolChangeStatus = 'VERIFIED_SYMBOL_CHANGE';
aliasLineage.symbolChangeEvidence = {
  ...buildEventEvidence('VERIFIED_SYMBOL_CHANGE', 'NEWCO'),
  matchedSymbol: 'NEWCO',
  symbolMatchStatus: 'EXACT_EVENT_MATCH',
  oldSymbol: 'OLDCO',
  newSymbol: 'NEWCO',
  eventEffectiveAt: '2025-12-15T14:30:00.000Z',
  events: [{
    oldSymbol: 'OLDCO',
    newSymbol: 'NEWCO',
    eventEffectiveAt: '2025-12-15T14:30:00.000Z'
  }]
};
const rebaseLineage = buildCorporateActionLineage('REBASE');
rebaseLineage.corporateActionStatus = 'VERIFIED_SPLIT_DIVIDEND_EVENTS_IN_WINDOW';
rebaseLineage.splitEvents = [{
  eventEffectiveAt: '2026-01-05',
  ratio: 2
}];
fs.writeFileSync(path.join(proofStage4Dir, 'STAGE4_TECHNICAL_FULL_PROOF_FIXTURE.json'), JSON.stringify({
  manifest: { timestamp: '2026-01-07T22:00:00.000Z', marketTimezone: 'America/New_York' },
  technical_universe: [
    {
      symbol: 'PROOFBAD',
      priceHistory: fixture.history.TPATH,
      dataSource: 'FIXTURE_DRIVE',
      updated: '2026-01-07T22:00:00.000Z',
      corporateActionLineage: proofLineage
    },
    {
      symbol: 'OLDCO',
      priceHistory: fixture.history.TPATH,
      dataSource: 'FIXTURE_DRIVE',
      updated: '2026-01-07T22:00:00.000Z',
      corporateActionLineage: aliasLineage
    },
    {
      symbol: 'REBASE',
      priceHistory: fixture.history.TPATH,
      dataSource: 'FIXTURE_DRIVE',
      updated: '2026-01-07T22:00:00.000Z',
      corporateActionLineage: rebaseLineage
    },
    {
      symbol: 'LEGACY',
      priceHistory: fixture.history.TPATH,
      dataSource: 'FIXTURE_DRIVE',
      updated: '2026-01-07T22:00:00.000Z'
    }
  ]
}));
const proofLedgerPath = path.join(proofTmp, 'ledger.json');
const proofOosPath = path.join(proofTmp, 'oos.json');
const proofResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    STAGE7_STAGE6_DIR: proofStage6Dir,
    STAGE7_STAGE4_DIR: proofStage4Dir,
    STAGE7_OUTCOME_LEDGER_OUT: proofLedgerPath,
    STAGE7_OOS_OUT: proofOosPath,
    STAGE7_OUTCOME_MD_OUT: path.join(proofTmp, 'ledger.md'),
    STAGE7_HORIZON_BARS: String(fixture.horizonBars)
  },
  encoding: 'utf8'
});
if (proofResult.status !== 0) throw new Error(`proof fixture builder failed\n${proofResult.stdout}\n${proofResult.stderr}`);
const proofLedger = JSON.parse(fs.readFileSync(proofLedgerPath, 'utf8'));
const proofOos = JSON.parse(fs.readFileSync(proofOosPath, 'utf8'));
const invalidProofRow = proofLedger.rows.find((row) => row.symbol === 'PROOFBAD');
const aliasProofRow = proofLedger.rows.find((row) => row.symbol === 'NEWCO');
const rebaseProofRow = proofLedger.rows.find((row) => row.symbol === 'REBASE');
const legacyProofRow = proofLedger.rows.find((row) => row.symbol === 'LEGACY');
if (invalidProofRow?.outcomeLabel !== 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED'
  || !invalidProofRow?.historyLineage?.comparisonExclusionReasons?.includes('symbol_change_evidence_invalid')
  || !invalidProofRow?.historyLineage?.comparisonExclusionReasons?.includes('delisting_status_unverified_or_delisted')
  || !invalidProofRow?.historyLineage?.comparisonExclusionReasons?.includes('delisting_evidence_invalid')
  || !invalidProofRow?.historyLineage?.comparisonExclusionReasons?.includes('suspension_evidence_invalid')
  || aliasProofRow?.outcomeLabel !== 'TP_FIRST'
  || aliasProofRow?.historyLineage?.comparisonEligibilityStatus !== 'VERIFIED_FOR_COMPARISON'
  || rebaseProofRow?.outcomeLabel !== 'EXCLUDED_CORPORATE_ACTION_REBASE_REQUIRED'
  || rebaseProofRow?.postDecisionAdjustmentEvents?.length !== 1
  || legacyProofRow?.accumulationLifecycle?.classification !== 'EXCLUDED_LEGACY_IMMUTABLE'
  || proofOos.rows.length !== 1
  || proofOos.rows[0]?.symbol !== 'NEWCO') {
  throw new Error('incomplete external query proof entered OOS comparison');
}

const freeTierTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-outcome-free-tier-'));
const freeTierStage6Dir = path.join(freeTierTmp, 'stage6');
const freeTierStage4Dir = path.join(freeTierTmp, 'stage4');
fs.mkdirSync(freeTierStage6Dir);
fs.mkdirSync(freeTierStage4Dir);
fs.writeFileSync(path.join(freeTierStage6Dir, 'STAGE6_ALPHA_FINAL_FREE_TIER.json'), JSON.stringify({
  manifest: {
    timestamp: fixture.generatedAt,
    sourceRunId: 'fixture-free-tier-run',
    sourceSha: 'fixture-free-tier-sha',
    sourceStage5Timestamp: '2026-01-01T22:00:00.000Z'
  },
  execution_contract: {
    decisionGate: { actionableVerdicts: ['BUY', 'STRONG_BUY', 'STRONGBUY'] },
    executablePicks: [{ ...fixture.signals[0], symbol: 'FREEBLOCK' }],
    modelTop6: [],
    watchlistTop: []
  }
}));
fs.writeFileSync(path.join(freeTierStage4Dir, 'STAGE4_TECHNICAL_FULL_FREE_TIER.json'), JSON.stringify({
  manifest: { timestamp: '2026-01-07T22:00:00.000Z', marketTimezone: 'America/New_York' },
  technical_universe: [{
    symbol: 'FREEBLOCK',
    priceHistory: fixture.history.TPATH,
    dataSource: 'FIXTURE_DRIVE',
    updated: '2026-01-07T22:00:00.000Z',
    corporateActionLineage: buildCorporateActionLineage('FREEBLOCK', false)
  }]
}));
const freeTierLedgerPath = path.join(freeTierTmp, 'ledger.json');
const freeTierResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    STAGE7_STAGE6_DIR: freeTierStage6Dir,
    STAGE7_STAGE4_DIR: freeTierStage4Dir,
    STAGE7_OUTCOME_LEDGER_OUT: freeTierLedgerPath,
    STAGE7_OOS_OUT: path.join(freeTierTmp, 'oos.json'),
    STAGE7_OUTCOME_MD_OUT: path.join(freeTierTmp, 'ledger.md'),
    STAGE7_HORIZON_BARS: String(fixture.horizonBars)
  },
  encoding: 'utf8'
});
if (freeTierResult.status !== 0) throw new Error(`free-tier fixture builder failed\n${freeTierResult.stdout}\n${freeTierResult.stderr}`);
const freeTierLedger = JSON.parse(fs.readFileSync(freeTierLedgerPath, 'utf8'));
if (freeTierLedger.accumulationLiveness?.status !== 'ZERO_GROWTH_EXTERNAL_SOURCE_BLOCKED'
  || freeTierLedger.accumulationLiveness?.summary?.sourceContractBlockedRows !== 1
  || freeTierLedger.accumulationLiveness?.summary?.unknownOrUnclassifiedRows !== 0
  || freeTierLedger.accumulationLiveness?.nextMeaningfulEvaluationCondition !== 'after_external_corporate_action_source_contract_verified'
  || freeTierLedger.accumulationLiveness?.policyChangeAuthorized !== false) {
  throw new Error(`free-tier zero-growth contract mismatch: ${JSON.stringify(freeTierLedger.accumulationLiveness)}`);
}

const duplicateTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage7-outcome-duplicate-'));
const duplicateStage6Dir = path.join(duplicateTmp, 'stage6');
fs.mkdirSync(duplicateStage6Dir);
const duplicateSource = fs.readFileSync(path.join(stage6Dir, 'STAGE6_ALPHA_FINAL_FIXTURE.json'));
fs.writeFileSync(path.join(duplicateStage6Dir, 'STAGE6_ALPHA_FINAL_DUPLICATE_A.json'), duplicateSource);
fs.writeFileSync(path.join(duplicateStage6Dir, 'STAGE6_ALPHA_FINAL_DUPLICATE_B.json'), duplicateSource);
const duplicateLedgerPath = path.join(duplicateTmp, 'ledger.json');
const duplicateResult = spawnSync(process.execPath, [path.join(root, 'scripts/build-stage7-outcome-ledger.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    STAGE7_STAGE6_DIR: duplicateStage6Dir,
    STAGE7_STAGE4_DIR: stage4Dir,
    STAGE7_OUTCOME_LEDGER_OUT: duplicateLedgerPath,
    STAGE7_OOS_OUT: path.join(duplicateTmp, 'oos.json'),
    STAGE7_OUTCOME_MD_OUT: path.join(duplicateTmp, 'ledger.md'),
    STAGE7_HORIZON_BARS: String(fixture.horizonBars)
  },
  encoding: 'utf8'
});
if (duplicateResult.status !== 0) throw new Error(`duplicate fixture builder failed\n${duplicateResult.stdout}\n${duplicateResult.stderr}`);
const duplicateLedger = JSON.parse(fs.readFileSync(duplicateLedgerPath, 'utf8'));
if (duplicateLedger.summary.duplicateSeedRows < 1
  || duplicateLedger.accumulationLiveness?.status !== 'INVALID_ACCUMULATION_CONTRACT') {
  throw new Error('duplicate Stage6 decisions were not rejected by the accumulation contract');
}

const firstIds = ledger.rows.map((row) => `${row.ledgerId}:${row.decisionSnapshotSha256}`);
const firstEvidenceHash = oosPayload.rows.find((row) => row.symbol === 'TPATH')?.externalEvidenceSha256;
const firstRegimeEvidenceHash = oosPayload.rows.find((row) => row.symbol === 'TPATH')?.marketRegimeSourceSha256;
const stage4FixturePath = path.join(stage4Dir, 'STAGE4_TECHNICAL_FULL_FIXTURE.json');
const changedOutcomeEvidence = JSON.parse(fs.readFileSync(stage4FixturePath, 'utf8'));
changedOutcomeEvidence.technical_universe.find((row) => row.symbol === 'NOFILL').priceHistory[0].close = 105.5;
changedOutcomeEvidence.technical_universe.find((row) => row.symbol === 'NOFILL').corporateActionLineage.retrievedAt = '2026-01-08T22:00:00.000Z';
const reorderedEvidence = changedOutcomeEvidence.technical_universe
  .find((row) => row.symbol === 'TPATH')
  .corporateActionLineage
  .symbolChangeEvidence;
changedOutcomeEvidence.technical_universe
  .find((row) => row.symbol === 'TPATH')
  .corporateActionLineage
  .symbolChangeEvidence = Object.fromEntries(Object.entries(reorderedEvidence).reverse());
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
const secondOosPayload = JSON.parse(fs.readFileSync(oos, 'utf8'));
if (JSON.stringify(firstIds) !== JSON.stringify(secondLedger.rows.map((row) => `${row.ledgerId}:${row.decisionSnapshotSha256}`))) {
  throw new Error('idempotent rerun changed ledger identity or immutable snapshots');
}
if (firstEvidenceHash !== secondOosPayload.rows.find((row) => row.symbol === 'TPATH')?.externalEvidenceSha256) {
  throw new Error('external evidence hash changed when JSON object key order changed');
}
if (firstRegimeEvidenceHash !== secondOosPayload.rows.find((row) => row.symbol === 'TPATH')?.marketRegimeSourceSha256) {
  throw new Error('decision-time market-regime evidence changed during outcome refresh');
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
      for (const evidenceKey of ['symbolChangeEvidence', 'delistingEvidence', 'suspensionEvidence']) {
        const evidence = row.corporateActionLineage[evidenceKey];
        if (!evidence) continue;
        evidence.requestedSymbol = rename(evidence.requestedSymbol);
        if (evidence.matchedSymbol) evidence.matchedSymbol = rename(evidence.matchedSymbol);
        if (evidence.oldSymbol) evidence.oldSymbol = rename(evidence.oldSymbol);
        if (evidence.newSymbol) evidence.newSymbol = rename(evidence.newSymbol);
        for (const event of evidence.events || []) {
          if (event.oldSymbol) event.oldSymbol = rename(event.oldSymbol);
          if (event.newSymbol) event.newSymbol = rename(event.newSymbol);
          if (event.symbol) event.symbol = rename(event.symbol);
        }
      }
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
  marketRegimeLineageVerifiedRows: value.marketRegimeLineageVerifiedRows,
  marketRegimeLineageUnverifiedRows: value.marketRegimeLineageUnverifiedRows,
  accumulationLivenessStatus: value.accumulationLivenessStatus,
  accumulationLifecycleCounts: value.accumulationLifecycleCounts,
  cohortCounts: value.cohortCounts,
  blockerCounts: value.blockerCounts
});
if (JSON.stringify(invariantSummary(secondLedger.summary)) !== JSON.stringify(invariantSummary(renamedLedger.summary))) {
  throw new Error('ticker rename changed aggregate cohort or outcome verdict');
}

console.log('[STAGE7_OUTCOME_LEDGER] PASS');
