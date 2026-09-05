import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildStage1Artifact } from '../services/stage1PointInTimeFilterContract.mjs';
import { buildStage2Artifact } from '../services/stage2QualityTruthContract.mjs';
import { hashCanonicalJsonSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import {
  buildStage3Artifact,
  validateStage3ArtifactForStage4
} from '../services/stage3FundamentalTruthContract.mjs';

const HASH = (character) => character.repeat(64);
const DECISION_AT = '2026-09-05T13:00:00.000Z';
const sourceRows = [
  {
    symbol: 'PASS',
    name: 'Pass Fixture',
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
    quoteAsOf: '2026-09-05T12:00:00.000Z',
    financialEvidenceStatus: 'FINANCIAL_EVIDENCE_VERIFIED',
    financialSource: 'SEC',
    fiscalPeriod: '2026-Q2',
    financialPublishedAt: '2026-08-20T12:00:00.000Z',
    financialRetrievedAt: '2026-09-05T12:20:00.000Z',
    financialLineageClassification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
    financialSourceRecordSha256: HASH('d'),
    financialLineageArtifactSha256: HASH('e'),
    identifierEvidenceStatus: 'IDENTIFIER_LINEAGE_VERIFIED',
    targetEvidenceStatus: 'TARGET_SOURCE_NOT_AVAILABLE',
    targetSource: null,
    targetAsOf: null
  },
  {
    symbol: 'PROXY',
    name: 'Proxy Fixture',
    instrumentType: 'common',
    analysisEligible: true,
    sector: 'Financial Services',
    price: 20,
    volume: 500_000,
    marketCap: 600_000_000,
    pe: 18,
    pbr: 2,
    roe: 16,
    roa: 5,
    debtToEquity: 0.4,
    totalAssets: 1_000,
    totalLiabilities: 400,
    currentAssets: 300,
    currentLiabilities: 100,
    workingCapital: 200,
    retainedEarnings: 300,
    ebit: 120,
    totalRevenue: 900,
    fiftyTwoWeekHigh: 24,
    fiftyTwoWeekLow: 16,
    quoteEvidenceStatus: 'QUOTE_EVIDENCE_VERIFIED',
    quoteSource: 'FIXTURE_QUOTE',
    quoteAsOf: '2026-09-05T12:00:00.000Z',
    financialEvidenceStatus: 'FINANCIAL_EVIDENCE_VERIFIED',
    financialSource: 'SEC',
    fiscalPeriod: '2026-Q2',
    financialPublishedAt: '2026-08-21T12:00:00.000Z',
    financialRetrievedAt: '2026-09-05T12:20:00.000Z',
    financialLineageClassification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
    financialSourceRecordSha256: HASH('f'),
    financialLineageArtifactSha256: HASH('e'),
    identifierEvidenceStatus: 'IDENTIFIER_LINEAGE_VERIFIED',
    targetEvidenceStatus: 'TARGET_SOURCE_NOT_AVAILABLE',
    targetSource: null,
    targetAsOf: null
  }
];

const stage0Manifest = {
  schemaVersion: 'stage0-source-truth-v2',
  runId: 'stage0-fixture',
  generatedAt: '2026-09-05T12:30:00.000Z',
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
    matchedRows: sourceRows.length,
    sourceRows: sourceRows.length,
    rowCountParity: true,
    currentDailySourceHashParity: true,
    unknownOrUnclassifiedRows: 0,
    canonicalSourceChanged: false,
    policyImpact: 'NONE_REPORT_ONLY',
    Stage1To7PolicyChanged: false,
    brokerOrSidecarStateMutation: false
  },
  inputCount: sourceRows.length,
  eligibleCount: sourceRows.length,
  excludedByInstrumentType: 0
};
const stage1 = await buildStage1Artifact({
  decisionAt: '2026-09-05T12:40:00.000Z',
  sourceStage0File: 'STAGE0_FIXTURE.json',
  sourceStage0Manifest: stage0Manifest,
  rows: sourceRows,
  thresholds: {
    minPrice: 2,
    minVolume: 375_000,
    thresholdSource: 'AI_PROPOSAL_CAPTURED',
    thresholdProvider: 'FIXTURE',
    thresholdModel: 'FIXTURE',
    regime: 'Accumulation'
  }
});
const history = [
  { date: '2023-12-31', _periodType: 'ANNUAL', Revenue: 600, 'Operating Income': 60, 'Total Debt': 500 },
  { date: '2024-12-31', _periodType: 'ANNUAL', Revenue: 700, 'Operating Income': 84, 'Total Debt': 450 },
  { date: '2025-12-31', _periodType: 'ANNUAL', Revenue: 800, 'Operating Income': 112, 'Total Debt': 400 },
  { date: '2025-03-31', _periodType: 'QUARTERLY', Revenue: 100 },
  { date: '2025-06-30', _periodType: 'QUARTERLY', Revenue: 110 },
  { date: '2026-03-31', _periodType: 'QUARTERLY', Revenue: 120 },
  { date: '2026-06-30', _periodType: 'QUARTERLY', Revenue: 132 }
];
const historyHash = HASH('6');
const stage2 = await buildStage2Artifact({
  decisionAt: '2026-09-05T12:50:00.000Z',
  sourceStage1File: 'STAGE1_FIXTURE.json',
  sourceStage1ContentSha256: HASH('8'),
  sourceStage1Artifact: stage1,
  historyByIdentity: { PASS: history, PROXY: history },
  historySourceEvidenceByIdentity: { PASS: historyHash, PROXY: historyHash },
  historySourceFiles: [{
    fileName: 'fixture_history.json',
    contentSha256: historyHash,
    retrievedAt: '2026-09-05T12:45:00.000Z',
    inputRows: 2,
    parseStatus: 'PARSED'
  }],
  regimeEvidence: {
    state: 'RISK_ON',
    vixRef: 16,
    fileName: 'MARKET_REGIME_SNAPSHOT.json',
    contentSha256: HASH('7'),
    retrievedAt: '2026-09-05T12:45:00.000Z',
    status: 'REGIME_EVIDENCE_VERIFIED'
  },
  policy: {
    qualityThreshold: 0,
    neutralTargetCount: 2,
    strongTargetCount: 2,
    weakTargetCount: 2,
    strongAverageScore: 101,
    weakAverageScore: -1,
    trendMaxAdjustment: 5,
    seasonalityMaxAdjustment: 4,
    qualityFactorMaxAdjustment: 3
  }
});

const computation = ({ synthetic = false, rankBonus = 4, sectorScore = 0 } = {}) => ({
  fundamentalBaseScore: 60,
  factorAdjustmentTotal: 2,
  preIntegrityFundamentalScore: 62,
  integrityPenalty: 0,
  preSectorFundamentalScore: 62,
  sectorScore,
  sectorRankBonus: rankBonus,
  finalFundamentalScore: 62 + sectorScore + rankBonus,
  qualityScore: 50,
  compositeAlpha: 15 + (62 + sectorScore + rankBonus) * 0.7,
  componentScores: { valuation: 60, safety: 60, profitability: 60, growth: 60 },
  factorAdjustments: { trend: 2, seasonality: 0, regime: 0, quality: 0 },
  syntheticInputFlags: {
    cashflowProxyUsed: false,
    salesProxyUsed: false,
    profitMarginDefaultUsed: false,
    bookValueProxyUsed: false,
    intrinsicValueFallbackUsed: false,
    roicProxyUsed: synthetic,
    roicDebtRatioProxyUsed: false,
    zScoreFallbackUsed: false,
    sectorBaselineImputationUsed: false
  }
});
const stage2RowHashes = new Map(await Promise.all(stage2.elite_universe.map(async (row) => [
  row.symbol,
  await hashCanonicalJsonSha256(row)
])));
const stage3Rows = stage2.elite_universe.map((row) => {
  const rankBonus = 4;
  const sectorScore = row.symbol === 'PROXY' ? 2 : 0;
  const finalFundamentalScore = 62 + sectorScore + rankBonus;
  return ({
  ...row,
  fundamentalScore: finalFundamentalScore,
  fundamentalScoreBeforeSectorBonus: 62,
  sectorScore,
  sectorRankBonus: rankBonus,
  qualityScore: 50,
  compositeAlpha: 15 + finalFundamentalScore * 0.7,
  stage3FundamentalModel: row.zScoreModel === 'FINANCIAL_STABILITY' ? 'FINANCIAL' : 'NON_FINANCIAL',
  stage3HistoryLineageStatus: 'STAGE3_HISTORY_EXACT_STAGE2_RECORD',
  stage3HistoryRecordSha256: row.historySourceRecordSha256,
  stage3Computation: computation({ synthetic: row.symbol === 'PROXY', rankBonus, sectorScore }),
  isImputed: false,
  cashflowProxyUsed: false,
  historicalEvidenceNormalized: false,
  auditSource: 'ALGO',
  sourceStage2RowSha256: stage2RowHashes.get(row.symbol),
  lastUpdate: DECISION_AT
  });
});

const build = (rows = stage3Rows) => buildStage3Artifact({
  generatedAt: DECISION_AT,
  sourceStage2File: 'STAGE2_FIXTURE.json',
  sourceStage2ContentSha256: HASH('9'),
  sourceStage2Artifact: stage2,
  rows
});

const artifact = await build();
const rowBySymbol = (candidate, symbol) => candidate.fundamental_universe.find((row) => row.symbol === symbol);
assert.deepEqual(await build(), artifact);
assert.equal(artifact.manifest.schemaVersion, 'stage3-fundamental-truth-v1');
assert.equal(artifact.manifest.inputCount, 2);
assert.equal(artifact.manifest.sourceStage2InputCount, 2);
assert.equal(artifact.manifest.count, 2);
assert.equal(artifact.manifest.eligibleCount, 1);
assert.equal(artifact.manifest.blockedCount, 1);
assert.equal(artifact.manifest.statusCounts.STAGE3_FUNDAMENTAL_EVIDENCE_PASS, 1);
assert.equal(artifact.manifest.statusCounts.STAGE3_SYNTHETIC_INPUT_BLOCKED, 1);
assert.equal(artifact.manifest.unknownOrUnclassifiedRows, 0);
assert.equal(artifact.manifest.lookAheadViolationRows, 0);
assert.equal(artifact.manifest.syntheticEvidencePromotionRows, 0);
assert.equal(artifact.manifest.aiEvidencePromotionRows, 0);
assert.equal(artifact.manifest.modelPolicyChanged, false);
assert.match(artifact.manifest.inputHash, /^[a-f0-9]{64}$/);
assert.match(artifact.manifest.evaluationHash, /^[a-f0-9]{64}$/);
assert.match(artifact.manifest.outputHash, /^[a-f0-9]{64}$/);
assert.equal(rowBySymbol(artifact, 'PASS').stage3AnalysisEligible, true);
assert.equal(rowBySymbol(artifact, 'PASS').stage3FundamentalModel, 'NON_FINANCIAL');
assert.equal(rowBySymbol(artifact, 'PROXY').stage3AnalysisEligible, false);
assert.equal(rowBySymbol(artifact, 'PROXY').stage3FundamentalModel, 'FINANCIAL');
assert.equal((await validateStage3ArtifactForStage4(artifact)).valid, true);

const badFormula = structuredClone(stage3Rows);
badFormula.find((row) => row.symbol === 'PASS').stage3Computation.finalFundamentalScore = 99;
const badFormulaArtifact = await build(badFormula);
assert.equal(rowBySymbol(badFormulaArtifact, 'PASS').stage3DecisionStatus, 'STAGE3_COMPUTATION_MISMATCH_BLOCKED');
assert.equal(rowBySymbol(badFormulaArtifact, 'PASS').stage3AnalysisEligible, false);

const futurePublication = structuredClone(stage3Rows);
futurePublication.find((row) => row.symbol === 'PASS').financialPublishedAt = '2026-09-06T12:00:00.000Z';
const futureArtifact = await build(futurePublication);
assert.equal(rowBySymbol(futureArtifact, 'PASS').stage3DecisionStatus, 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED');
assert.equal(futureArtifact.manifest.lookAheadViolationRows, 1);

const historyMismatch = structuredClone(stage3Rows);
historyMismatch.find((row) => row.symbol === 'PASS').stage3HistoryRecordSha256 = HASH('0');
const historyArtifact = await build(historyMismatch);
assert.equal(rowBySymbol(historyArtifact, 'PASS').stage3DecisionStatus, 'STAGE3_HISTORY_LINEAGE_BLOCKED');

const sourceDrift = structuredClone(stage3Rows);
sourceDrift.find((row) => row.symbol === 'PASS').financialSource = 'UNVERIFIED_DRIFT';
const sourceDriftArtifact = await build(sourceDrift);
assert.equal(rowBySymbol(sourceDriftArtifact, 'PASS').stage3DecisionStatus, 'STAGE3_SOURCE_EVIDENCE_BLOCKED');
assert.equal((await validateStage3ArtifactForStage4(sourceDriftArtifact)).valid, true);

const numericSourceDrift = structuredClone(stage3Rows);
numericSourceDrift.find((row) => row.symbol === 'PASS').price = 999;
assert.equal(rowBySymbol(await build(numericSourceDrift), 'PASS').stage3DecisionStatus, 'STAGE3_SOURCE_EVIDENCE_BLOCKED');

const identifierMissing = structuredClone(stage3Rows);
identifierMissing.find((row) => row.symbol === 'PASS').identifierEvidenceStatus = 'IDENTIFIER_LINEAGE_MISSING';
assert.equal(rowBySymbol(await build(identifierMissing), 'PASS').stage3DecisionStatus, 'STAGE3_IDENTIFIER_LINEAGE_BLOCKED');

const modelMismatch = structuredClone(stage3Rows);
modelMismatch.find((row) => row.symbol === 'PASS').stage3FundamentalModel = 'FINANCIAL';
assert.equal(rowBySymbol(await build(modelMismatch), 'PASS').stage3DecisionStatus, 'STAGE3_MODEL_CONTRACT_BLOCKED');

const aiEvidence = structuredClone(stage3Rows);
aiEvidence.find((row) => row.symbol === 'PASS').auditSource = 'AI';
const aiArtifact = await build(aiEvidence);
assert.equal(rowBySymbol(aiArtifact, 'PASS').stage3DecisionStatus, 'STAGE3_SYNTHETIC_INPUT_BLOCKED');
assert.equal(aiArtifact.manifest.aiEvidencePromotionRows, 0);

const tampered = structuredClone(artifact);
tampered.fundamental_universe[0].fundamentalScore = 99;
const tamperedValidation = await validateStage3ArtifactForStage4(tampered);
assert.equal(tamperedValidation.valid, false);
assert.ok(tamperedValidation.reasons.includes('OUTPUT_HASH_MISMATCH'));

const fundamentalSource = await readFile(new URL('../components/FundamentalAnalysis.tsx', import.meta.url), 'utf8');
assert.match(fundamentalSource, /buildStage3Artifact/);
assert.match(fundamentalSource, /hashCanonicalJsonSha256\(rawHistory\)/);
assert.match(fundamentalSource, /artifact_hash:\s*meta\?\.triggerFileSha256/);
assert.doesNotMatch(fundamentalSource, /itemToAnalyze\.roe\s*=\s*toPct\(dData\.roe\)/);
assert.doesNotMatch(fundamentalSource, /itemToAnalyze\.debtToEquity\s*=\s*baseline\.debtToEquity/);
assert.match(fundamentalSource, /idx < top20Count/);

const technicalSource = await readFile(new URL('../components/TechnicalAnalysis.tsx', import.meta.url), 'utf8');
assert.match(technicalSource, /validateStage3ArtifactForStage4/);
assert.match(technicalSource, /stage3AnalysisEligible === true/);
assert.match(technicalSource, /sourceStage3ContentSha256:\s*stage3ContentSha256/);
assert.match(technicalSource, /readyData\?\.trigger_sha256 !== stage3SourceSha256/);

console.log('[STAGE3_FUNDAMENTAL_TRUTH_CONTRACT] PASS');
