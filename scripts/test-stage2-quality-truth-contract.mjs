import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildStage1Artifact } from '../services/stage1PointInTimeFilterContract.mjs';
import {
  buildStage2Artifact,
  evaluateStage2Universe,
  validateStage2ArtifactForStage3
} from '../services/stage2QualityTruthContract.mjs';

const DECISION_AT = '2026-09-03T13:40:58.125Z';
const HASH = (character) => character.repeat(64);
const baseRow = {
  symbol: 'BASE',
  name: 'Base',
  instrumentType: 'common',
  analysisEligible: true,
  sector: 'Industrials',
  price: 10,
  volume: 500_000,
  marketCap: 500_000_000,
  pe: 15,
  pbr: 2,
  roe: 18,
  roa: 6,
  debtToEquity: 0.5,
  totalAssets: 1_000,
  totalLiabilities: 400,
  currentAssets: 300,
  currentLiabilities: 100,
  workingCapital: 200,
  retainedEarnings: 300,
  ebit: 120,
  totalRevenue: 900,
  fiftyTwoWeekHigh: 12,
  fiftyTwoWeekLow: 8,
  quoteEvidenceStatus: 'QUOTE_EVIDENCE_VERIFIED',
  quoteSource: 'FIXTURE_QUOTE',
  quoteAsOf: '2026-09-03T13:00:00.000Z',
  financialEvidenceStatus: 'FINANCIAL_EVIDENCE_VERIFIED',
  financialSource: 'SEC',
  fiscalPeriod: '2026-Q2',
  financialPublishedAt: '2026-08-20T12:00:00.000Z',
  financialRetrievedAt: '2026-09-03T13:20:00.000Z',
  financialLineageClassification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  financialSourceRecordSha256: HASH('d'),
  financialLineageArtifactSha256: HASH('e'),
  identifierEvidenceStatus: 'IDENTIFIER_LINEAGE_VERIFIED',
  targetMeanPrice: 100,
  targetEvidenceStatus: 'VENDOR_TARGET_ASOF_UNKNOWN',
  targetSource: 'VENDOR',
  targetAsOf: null
};
const rows = [
  baseRow,
  { ...baseRow, symbol: 'FIN', sector: 'Financial Services', debtToEquity: 3 },
  {
    ...baseRow,
    symbol: 'NO_HISTORY',
    targetMeanPrice: 0,
    targetEvidenceStatus: 'TARGET_SOURCE_NOT_AVAILABLE',
    targetSource: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null
  },
  { ...baseRow, symbol: 'SHORT_HISTORY' }
];
const sourceStage0Manifest = {
  schemaVersion: 'stage0-source-truth-v2',
  runId: 'stage0-fixture',
  generatedAt: '2026-09-03T13:30:00.000Z',
  sourceInventorySha256: HASH('a'),
  inputHash: HASH('b'),
  outputHash: HASH('c'),
  financialLineageContract: {
    status: 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED',
    artifactContentSha256: HASH('e'),
    producerEvidenceSha256: HASH('f'),
    producerInputHash: HASH('1'),
    producerOutputHash: HASH('2'),
    identityMapContentSha256: HASH('3'),
    identityMapCanonicalSha256: HASH('4'),
    currentDailySourceInventorySha256: HASH('5'),
    matchedRows: rows.length,
    sourceRows: rows.length,
    rowCountParity: true,
    currentDailySourceHashParity: true,
    unknownOrUnclassifiedRows: 0,
    canonicalSourceChanged: false,
    policyImpact: 'NONE_REPORT_ONLY',
    Stage1To7PolicyChanged: false,
    brokerOrSidecarStateMutation: false
  },
  inputCount: rows.length,
  eligibleCount: rows.length,
  excludedByInstrumentType: 0
};
const stage1 = await buildStage1Artifact({
  decisionAt: '2026-09-03T13:35:00.000Z',
  sourceStage0File: 'STAGE0_FIXTURE.json',
  sourceStage0Manifest,
  rows,
  thresholds: {
    minPrice: 2,
    minVolume: 375_000,
    thresholdSource: 'AI_PROPOSAL_CAPTURED',
    thresholdProvider: 'FIXTURE',
    thresholdModel: 'FIXTURE',
    regime: 'Accumulation'
  }
});

const annualHistory = [
  { date: '2023-12-31', _periodType: 'ANNUAL', Revenue: 600, 'Operating Income': 60, 'Total Debt': 500 },
  { date: '2024-12-31', _periodType: 'ANNUAL', Revenue: 700, 'Operating Income': 84, 'Total Debt': 450 },
  { date: '2025-12-31', _periodType: 'ANNUAL', Revenue: 800, 'Operating Income': 112, 'Total Debt': 400 },
  { date: '2026-12-31', _periodType: 'ANNUAL', Revenue: 999, 'Operating Income': 999, 'Total Debt': 1 }
];
const quarterlyHistory = [
  { date: '2025-03-31', _periodType: 'QUARTERLY', Revenue: 100 },
  { date: '2025-06-30', _periodType: 'QUARTERLY', Revenue: 110 },
  { date: '2026-03-31', _periodType: 'QUARTERLY', Revenue: 120 },
  { date: '2026-06-30', _periodType: 'QUARTERLY', Revenue: 132 }
];
const historyByIdentity = {
  BASE: [...annualHistory, ...quarterlyHistory, { date: 'invalid', Revenue: 1_000 }],
  FIN: [...annualHistory.slice(0, 3), ...quarterlyHistory],
  SHORT_HISTORY: [annualHistory[0]]
};
const sourceEvidenceByIdentity = {
  BASE: HASH('6'),
  FIN: HASH('6'),
  SHORT_HISTORY: HASH('6')
};
const historySourceFiles = [{
  fileName: 'fixture_history.json',
  contentSha256: HASH('6'),
  retrievedAt: '2026-09-03T13:38:00.000Z',
  inputRows: 3,
  parseStatus: 'PARSED'
}];
const regimeEvidence = {
  state: 'RISK_ON',
  vixRef: 16,
  fileName: 'MARKET_REGIME_SNAPSHOT.json',
  contentSha256: HASH('7'),
  retrievedAt: '2026-09-03T13:39:00.000Z',
  status: 'REGIME_EVIDENCE_VERIFIED'
};

const build = (stage1Artifact = stage1) => buildStage2Artifact({
  decisionAt: DECISION_AT,
  sourceStage1File: 'STAGE1_FIXTURE.json',
  sourceStage1ContentSha256: HASH('8'),
  sourceStage1Artifact: stage1Artifact,
  historyByIdentity,
  historySourceEvidenceByIdentity: sourceEvidenceByIdentity,
  historySourceFiles,
  regimeEvidence
});
const artifact = await build();
const repeated = await build();
assert.deepEqual(repeated, artifact);
assert.equal(artifact.manifest.schemaVersion, 'stage2-quality-truth-v1');
assert.equal(artifact.manifest.sourceStage1OutputHash, stage1.manifest.outputHash);
assert.equal(artifact.manifest.sourceStage1ContentSha256, HASH('8'));
assert.equal(artifact.manifest.sourceCount, rows.length);
assert.equal(artifact.stage2_evaluation.length, rows.length);
assert.equal(Object.values(artifact.manifest.statusCounts).reduce((sum, value) => sum + value, 0), rows.length);
assert.equal(artifact.manifest.unknownOrUnclassifiedRows, 0);
assert.equal(artifact.manifest.lookAheadUsedRows, 0);
assert.equal(artifact.manifest.targetScoreInfluenceRows, 0);
assert.ok(artifact.elite_universe.every((row) => row.targetScoreImpact === 0));

const evaluation = await evaluateStage2Universe(stage1.investable_universe, {
  decisionAt: DECISION_AT,
  historyByIdentity,
  historySourceEvidenceByIdentity: sourceEvidenceByIdentity,
  regimeEvidence
});
const bySymbol = new Map(evaluation.evaluatedRows.map((row) => [row.symbol, row]));
assert.equal(bySymbol.get('BASE').zScoreModel, 'ALTMAN_Z');
assert.equal(bySymbol.get('BASE').qualityScore, 75.46);
assert.equal(bySymbol.get('BASE').profitScore, 54);
assert.equal(bySymbol.get('BASE').safeScore, 75);
assert.equal(bySymbol.get('BASE').valueScore, 80);
assert.equal(bySymbol.get('BASE').zScoreProxy, 8);
assert.equal(bySymbol.get('BASE').trendAdjustment, 3.26);
assert.equal(bySymbol.get('BASE').seasonalityAdjustment, 1.72);
assert.equal(bySymbol.get('BASE').qualityFactorAdjustment, 0.88);
assert.equal(bySymbol.get('BASE').regimeAdjustment, 1.5);
assert.equal(bySymbol.get('FIN').zScoreModel, 'FINANCIAL_STABILITY');
assert.equal(bySymbol.get('BASE').historyFutureRowsRejected, 1);
assert.equal(bySymbol.get('BASE').historyInvalidTimestampRowsRejected, 1);
assert.equal(bySymbol.get('BASE').historyEvidenceStatus, 'HISTORY_EVIDENCE_VERIFIED_WITH_ROWS_REJECTED');
assert.equal(bySymbol.get('NO_HISTORY').historyEvidenceStatus, 'HISTORY_EVIDENCE_UNAVAILABLE');
assert.equal(bySymbol.get('NO_HISTORY').trendEvidenceStatus, 'TREND_EVIDENCE_UNAVAILABLE_NEUTRAL');
assert.equal(bySymbol.get('NO_HISTORY').seasonalityEvidenceStatus, 'SEASONALITY_EVIDENCE_UNAVAILABLE_NEUTRAL');
assert.equal(bySymbol.get('NO_HISTORY').stage2EvidenceStatus, 'STAGE2_EVIDENCE_PARTIAL');
assert.equal(bySymbol.get('SHORT_HISTORY').historyEvidenceStatus, 'HISTORY_EVIDENCE_VERIFIED');
assert.equal(bySymbol.get('SHORT_HISTORY').trendEvidenceStatus, 'TREND_EVIDENCE_UNAVAILABLE_NEUTRAL');
assert.equal(bySymbol.get('SHORT_HISTORY').seasonalityEvidenceStatus, 'SEASONALITY_EVIDENCE_UNAVAILABLE_NEUTRAL');
assert.equal(bySymbol.get('SHORT_HISTORY').stage2EvidenceStatus, 'STAGE2_EVIDENCE_PARTIAL');
assert.equal(bySymbol.get('NO_HISTORY').targetMeanPrice, 0);
assert.equal(bySymbol.get('NO_HISTORY').fiftyTwoWeekHigh, null);
assert.equal(bySymbol.get('NO_HISTORY').fiftyTwoWeekLow, null);
assert.equal(bySymbol.get('NO_HISTORY').ictPos, null);
assert.equal(bySymbol.get('NO_HISTORY').pdZoneHint, 'UNAVAILABLE');
assert.equal(bySymbol.get('NO_HISTORY').historicalEvidenceNormalized, false);

const counterfactualRows = stage1.investable_universe.map((row) => ({
  ...row,
  targetMeanPrice: row.targetPolicyEligible ? row.targetMeanPrice : 9_999_999
}));
const counterfactual = await evaluateStage2Universe(counterfactualRows, {
  decisionAt: DECISION_AT,
  historyByIdentity,
  historySourceEvidenceByIdentity: sourceEvidenceByIdentity,
  regimeEvidence
});
const policyProjection = (value) => value.evaluatedRows.map((row) => ({
  symbol: row.symbol,
  qualityScore: row.qualityScore,
  stage2Status: row.stage2Status,
  targetScoreImpact: row.targetScoreImpact
}));
assert.deepEqual(policyProjection(counterfactual), policyProjection(evaluation));

const validation = await validateStage2ArtifactForStage3(artifact);
assert.equal(validation.valid, true, validation.reasons.join(','));
const tampered = structuredClone(artifact);
tampered.elite_universe[0].targetScoreImpact = 10;
assert.equal((await validateStage2ArtifactForStage3(tampered)).valid, false);
const stale = structuredClone(artifact);
stale.manifest.sourceStage1OutputHash = HASH('9');
assert.equal((await validateStage2ArtifactForStage3(stale)).valid, false);
const aggregateTampered = structuredClone(artifact);
aggregateTampered.manifest.statusCounts.STAGE2_SELECTED_ELITE -= 1;
aggregateTampered.manifest.statusCounts.STAGE2_RANKED_OUT_DYNAMIC_CAPACITY = 1;
assert.equal((await validateStage2ArtifactForStage3(aggregateTampered)).valid, false);
const evaluationTampered = structuredClone(artifact);
evaluationTampered.stage2_evaluation[0].stage2Status = 'STAGE2_BLOCKED_QUALITY_SCORE';
assert.equal((await validateStage2ArtifactForStage3(evaluationTampered)).valid, false);

const completenessTampered = structuredClone(artifact);
completenessTampered.stage2_evaluation.find((row) => row.symbol === 'SHORT_HISTORY').stage2EvidenceStatus = 'STAGE2_EVIDENCE_COMPLETE';
const completenessValidation = await validateStage2ArtifactForStage3(completenessTampered);
assert.equal(completenessValidation.valid, false);
assert.ok(completenessValidation.reasons.includes('EVIDENCE_COMPLETENESS_INVALID'));

const deepQualitySource = await readFile(new URL('../components/DeepQualityFilter.tsx', import.meta.url), 'utf8');
assert.match(deepQualitySource, /await buildStage2Artifact\(\{/);
assert.doesNotMatch(deepQualitySource, /item\.targetMeanPrice > item\.price \* 1\.2/);
assert.doesNotMatch(deepQualitySource, /safeTargetPrice = item\.price \* 1\.15/);

const fundamentalSource = await readFile(new URL('../components/FundamentalAnalysis.tsx', import.meta.url), 'utf8');
assert.match(fundamentalSource, /validateStage2ArtifactForStage3/);
assert.match(fundamentalSource, /pageSize=1/);
assert.doesNotMatch(fundamentalSource, /Fallback engaged/);

console.log('[STAGE2_QUALITY_TRUTH_CONTRACT] PASS');
