import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let contract;
try {
  contract = await import('../services/stage1PointInTimeFilterContract.mjs');
} catch (error) {
  assert.fail(`Stage1 point-in-time contract missing: ${error?.code || error?.name || 'unknown'}`);
}

const {
  DEFAULT_STAGE1_POINT_IN_TIME_POLICY,
  buildStage1Artifact,
  evaluateStage1Universe,
  validateStage1ArtifactForStage2
} = contract;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DECISION_AT = '2026-08-26T10:01:56.970Z';
const THRESHOLDS = {
  minPrice: 2,
  minVolume: 350_000,
  thresholdSource: 'AI_PROPOSAL_CAPTURED',
  thresholdProvider: 'FIXTURE_PROVIDER',
  thresholdModel: 'FIXTURE_MODEL',
  regime: 'Accumulation'
};

const baseRow = {
  symbol: 'FIXTURE',
  name: 'Fixture Company',
  instrumentType: 'common',
  analysisEligible: true,
  price: 10,
  volume: 500_000,
  marketCap: 500_000_000,
  pe: 15,
  roe: 12,
  quoteEvidenceStatus: 'QUOTE_EVIDENCE_VERIFIED',
  quoteSource: 'FIXTURE_QUOTE',
  quoteAsOf: '2026-08-26T09:30:00.000Z',
  financialEvidenceStatus: 'FINANCIAL_EVIDENCE_VERIFIED',
  financialSource: 'FIXTURE_FINANCIAL',
  fiscalPeriod: '2026-Q2',
  financialPublishedAt: '2026-08-20T12:00:00.000Z',
  financialRetrievedAt: '2026-08-26T09:50:00.000Z',
  financialLineageClassification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  financialSourceRecordSha256: 'd'.repeat(64),
  financialLineageArtifactSha256: 'e'.repeat(64),
  targetMeanPrice: 12,
  targetEvidenceStatus: 'TARGET_EVIDENCE_VERIFIED',
  targetSource: 'FIXTURE_TARGET',
  targetAsOf: '2026-08-25T20:00:00.000Z'
};

const rows = [
  baseRow,
  {
    ...baseRow,
    symbol: 'TARGET_UNKNOWN',
    targetEvidenceStatus: 'VENDOR_TARGET_ASOF_UNKNOWN',
    targetAsOf: null
  },
  {
    ...baseRow,
    symbol: 'TARGET_UNAVAILABLE',
    targetMeanPrice: 0,
    targetEvidenceStatus: 'TARGET_SOURCE_NOT_AVAILABLE',
    targetSource: null,
    targetAsOf: null
  },
  {
    ...baseRow,
    symbol: 'TARGET_FUTURE',
    targetEvidenceStatus: 'TARGET_TIMESTAMP_FUTURE',
    targetAsOf: '2026-08-27T20:00:00.000Z'
  },
  {
    ...baseRow,
    symbol: 'TARGET_SOURCE_MISSING',
    targetSource: null
  },
  {
    ...baseRow,
    symbol: 'STALE_QUOTE',
    quoteAsOf: '2026-08-19T09:30:00.000Z'
  },
  {
    ...baseRow,
    symbol: 'FUTURE_QUOTE',
    quoteAsOf: '2026-08-27T09:30:00.000Z'
  },
  {
    ...baseRow,
    symbol: 'QUOTE_SOURCE_MISSING',
    quoteSource: null
  },
  {
    ...baseRow,
    symbol: 'FINANCIAL_UNKNOWN',
    financialEvidenceStatus: 'PUBLICATION_TIMESTAMP_MISSING',
    financialPublishedAt: null
  },
  {
    ...baseRow,
    symbol: 'FINANCIAL_RETRIEVAL_MISSING',
    financialRetrievedAt: null
  },
  {
    ...baseRow,
    symbol: 'FINANCIAL_RETRIEVAL_FUTURE',
    financialRetrievedAt: '2026-08-27T12:00:00.000Z'
  },
  {
    ...baseRow,
    symbol: 'FINANCIAL_RETRIEVAL_BEFORE_PUBLICATION',
    financialRetrievedAt: '2026-08-19T12:00:00.000Z'
  },
  {
    ...baseRow,
    symbol: 'FINANCIAL_LINEAGE_UNRESOLVED',
    financialLineageClassification: 'FINANCIAL_LINEAGE_FACT_NOT_FOUND'
  },
  {
    ...baseRow,
    symbol: 'SMALL_CAP_BOUNDARY',
    marketCap: 300_000_000,
    volume: 210_000
  },
  {
    ...baseRow,
    symbol: 'LARGE_CAP_LOW_VOLUME',
    marketCap: 300_000_001,
    volume: 349_999
  },
  {
    ...baseRow,
    symbol: 'PRICE_BOUNDARY',
    price: 2
  },
  {
    ...baseRow,
    symbol: 'PE_BLOCKED',
    pe: 0
  },
  {
    ...baseRow,
    symbol: 'PER_FALLBACK',
    pe: 0,
    per: 10
  },
  {
    ...baseRow,
    symbol: 'ROE_BLOCKED',
    roe: 0
  }
];

const evaluation = evaluateStage1Universe(rows, {
  decisionAt: DECISION_AT,
  minPrice: THRESHOLDS.minPrice,
  minVolume: THRESHOLDS.minVolume
});

assert.equal(DEFAULT_STAGE1_POINT_IN_TIME_POLICY.maxQuoteAgeDays, 5);
assert.equal(evaluation.inputRows, rows.length);
assert.equal(evaluation.unknownOrUnclassifiedRows, 0);
assert.equal(evaluation.targetHardGateApplied, false);

const bySymbol = new Map(evaluation.evaluatedRows.map((row) => [row.symbol, row]));
assert.equal(bySymbol.get('FIXTURE').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('TARGET_UNKNOWN').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('TARGET_UNKNOWN').targetPolicyStatus, 'TARGET_ASOF_UNKNOWN_REPORT_ONLY');
assert.equal(bySymbol.get('TARGET_UNAVAILABLE').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('TARGET_UNAVAILABLE').targetPolicyStatus, 'TARGET_SOURCE_UNAVAILABLE_REPORT_ONLY');
assert.equal(bySymbol.get('TARGET_FUTURE').targetPolicyStatus, 'TARGET_TIMESTAMP_FUTURE_REJECTED');
assert.equal(bySymbol.get('TARGET_SOURCE_MISSING').targetPolicyStatus, 'TARGET_EVIDENCE_INVALID_REJECTED');
assert.equal(bySymbol.get('TARGET_SOURCE_MISSING').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('STALE_QUOTE').stage1PointInTimeStatus, 'STAGE1_BLOCKED_QUOTE_EVIDENCE');
assert.equal(bySymbol.get('FUTURE_QUOTE').stage1PointInTimeStatus, 'STAGE1_BLOCKED_QUOTE_EVIDENCE');
assert.equal(bySymbol.get('QUOTE_SOURCE_MISSING').stage1PointInTimeStatus, 'STAGE1_BLOCKED_QUOTE_EVIDENCE');
assert.equal(bySymbol.get('FINANCIAL_UNKNOWN').stage1PointInTimeStatus, 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE');
assert.equal(bySymbol.get('FINANCIAL_RETRIEVAL_MISSING').stage1PointInTimeStatus, 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE');
assert.equal(bySymbol.get('FINANCIAL_RETRIEVAL_FUTURE').stage1PointInTimeStatus, 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE');
assert.equal(bySymbol.get('FINANCIAL_RETRIEVAL_BEFORE_PUBLICATION').stage1PointInTimeStatus, 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE');
assert.equal(bySymbol.get('FINANCIAL_LINEAGE_UNRESOLVED').stage1PointInTimeStatus, 'STAGE1_BLOCKED_FINANCIAL_EVIDENCE');
assert.equal(bySymbol.get('SMALL_CAP_BOUNDARY').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('SMALL_CAP_BOUNDARY').effectiveMinVolume, 210_000);
assert.equal(bySymbol.get('LARGE_CAP_LOW_VOLUME').stage1PointInTimeStatus, 'STAGE1_BLOCKED_LIQUIDITY');
assert.equal(bySymbol.get('PRICE_BOUNDARY').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('PE_BLOCKED').stage1PointInTimeStatus, 'STAGE1_BLOCKED_PE');
assert.equal(bySymbol.get('PER_FALLBACK').stage1PointInTimeStatus, 'STAGE1_POINT_IN_TIME_VERIFIED');
assert.equal(bySymbol.get('ROE_BLOCKED').stage1PointInTimeStatus, 'STAGE1_BLOCKED_ROE');

assert.equal(evaluation.targetBiasAudit.targetAsOfUnknownRows, 1);
assert.equal(evaluation.targetBiasAudit.targetSourceUnavailableRows, 1);
assert.equal(evaluation.targetBiasAudit.targetFutureOrInvalidRows, 2);
assert.equal(evaluation.targetBiasAudit.excludedOnlyByLegacyTargetGateRows, 1);
assert.equal(evaluation.targetBiasAudit.reportOnlyCounterfactualWithoutTargetRows, evaluation.acceptedRows.length);
assert.ok(evaluation.acceptedRows.every((row) => row.stage1PointInTimeStatus === 'STAGE1_POINT_IN_TIME_VERIFIED'));
assert.deepEqual(
  evaluation.acceptedRows.map((row) => row.symbol),
  [...evaluation.acceptedRows.map((row) => row.symbol)].sort()
);
assert.throws(
  () => evaluateStage1Universe(rows, { decisionAt: DECISION_AT, minPrice: undefined, minVolume: THRESHOLDS.minVolume }),
  /STAGE1_THRESHOLD_INVALID/
);

const sourceStage0Manifest = {
  schemaVersion: 'stage0-source-truth-v2',
  runId: 'stage0-fixture',
  generatedAt: '2026-08-26T10:00:00.000Z',
  sourceInventorySha256: 'a'.repeat(64),
  inputHash: 'b'.repeat(64),
  outputHash: 'c'.repeat(64),
  stageProgressionGate: 'STAGE0_LOCKED',
  financialLineageContract: {
    status: 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED',
    artifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    artifactContentSha256: 'e'.repeat(64),
    producerEvidenceSha256: 'f'.repeat(64),
    producerInputHash: '1'.repeat(64),
    producerOutputHash: '2'.repeat(64),
    identityMapContentSha256: '3'.repeat(64),
    identityMapCanonicalSha256: '4'.repeat(64),
    currentDailySourceInventorySha256: '5'.repeat(64),
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

const artifact = await buildStage1Artifact({
  decisionAt: DECISION_AT,
  sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
  sourceStage0Manifest,
  rows,
  thresholds: THRESHOLDS
});
await assert.rejects(
  buildStage1Artifact({
    decisionAt: DECISION_AT,
    sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
    sourceStage0Manifest: { ...sourceStage0Manifest, generatedAt: '2026-08-27T10:00:00.000Z' },
    rows,
    thresholds: THRESHOLDS
  }),
  /STAGE1_SOURCE_STAGE0_CONTRACT_INVALID/
);
const duplicateRows = [...rows, rows[0]];
await assert.rejects(
  buildStage1Artifact({
    decisionAt: DECISION_AT,
    sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
    sourceStage0Manifest: {
      ...sourceStage0Manifest,
      inputCount: duplicateRows.length,
      eligibleCount: duplicateRows.length
    },
    rows: duplicateRows,
    thresholds: THRESHOLDS
  }),
  /STAGE1_SOURCE_STAGE0_CONTRACT_INVALID/
);
await assert.rejects(
  buildStage1Artifact({
    decisionAt: DECISION_AT,
    sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
    sourceStage0Manifest,
    rows: rows.slice(1),
    thresholds: THRESHOLDS
  }),
  /STAGE1_SOURCE_STAGE0_CONTRACT_INVALID/
);

assert.equal(artifact.manifest.schemaVersion, 'stage1-point-in-time-v2');
assert.equal(artifact.manifest.sourceStage0FinancialLineageArtifactSha256, 'e'.repeat(64));
assert.equal(artifact.manifest.sourceStage0IdentityMapCanonicalSha256, '4'.repeat(64));
assert.equal(artifact.manifest.sourceStage0DailySourceInventorySha256, '5'.repeat(64));
assert.equal(artifact.manifest.unresolvedPromotionRows, 0);
assert.equal(artifact.manifest.financialLineageVerifiedRows, artifact.investable_universe.length);
assert.equal(artifact.manifest.targetHardGateApplied, false);
assert.equal(artifact.manifest.unknownOrUnclassifiedRows, 0);
assert.equal(artifact.manifest.count, artifact.investable_universe.length);
assert.match(artifact.manifest.thresholdContractSha256, /^[a-f0-9]{64}$/);
assert.match(artifact.manifest.inputHash, /^[a-f0-9]{64}$/);
assert.match(artifact.manifest.outputHash, /^[a-f0-9]{64}$/);

const validated = await validateStage1ArtifactForStage2(artifact);
assert.equal(validated.valid, true, validated.reasons.join(','));
assert.equal(validated.investableUniverse.length, artifact.investable_universe.length);

const reordered = await buildStage1Artifact({
  decisionAt: DECISION_AT,
  sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
  sourceStage0Manifest,
  rows: [...rows].reverse(),
  thresholds: THRESHOLDS
});
assert.equal(reordered.manifest.thresholdContractSha256, artifact.manifest.thresholdContractSha256);
assert.equal(reordered.manifest.inputHash, artifact.manifest.inputHash);
assert.equal(reordered.manifest.outputHash, artifact.manifest.outputHash);

const deterministic = await buildStage1Artifact({
  decisionAt: DECISION_AT,
  sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json',
  sourceStage0Manifest,
  rows,
  thresholds: THRESHOLDS
});
assert.equal(deterministic.manifest.runId, artifact.manifest.runId);
assert.equal(deterministic.manifest.outputHash, artifact.manifest.outputHash);

const expectInvalid = async (candidate, reason) => {
  const result = await validateStage1ArtifactForStage2(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes(reason), `${reason} missing from ${result.reasons.join(',')}`);
};

const outputMismatch = structuredClone(artifact);
outputMismatch.investable_universe[0].price = 999;
await expectInvalid(outputMismatch, 'OUTPUT_HASH_MISMATCH');

const legacyTargetGate = structuredClone(artifact);
legacyTargetGate.manifest.targetHardGateApplied = true;
await expectInvalid(legacyTargetGate, 'TARGET_HARD_GATE_CONTRACT_INVALID');

const unclassified = structuredClone(artifact);
unclassified.investable_universe[0].stage1PointInTimeStatus = null;
await expectInvalid(unclassified, 'POINT_IN_TIME_CLASSIFICATION_INVALID');

const falseGatePromotion = structuredClone(artifact);
falseGatePromotion.investable_universe[0].stage1Gates.quoteEvidenceGate = false;
await expectInvalid(falseGatePromotion, 'POINT_IN_TIME_CLASSIFICATION_INVALID');

const targetPromotion = structuredClone(artifact);
const targetUnknownRow = targetPromotion.investable_universe.find((row) => row.symbol === 'TARGET_UNKNOWN');
targetUnknownRow.targetPolicyEligible = true;
await expectInvalid(targetPromotion, 'TARGET_REPORT_ONLY_CLASSIFICATION_INVALID');

const missingThresholdProvenance = structuredClone(artifact);
missingThresholdProvenance.manifest.thresholdProvider = null;
await expectInvalid(missingThresholdProvenance, 'THRESHOLD_PROVENANCE_INVALID');

const stage0HashMissing = structuredClone(artifact);
stage0HashMissing.manifest.sourceStage0InputHash = null;
await expectInvalid(stage0HashMissing, 'SOURCE_STAGE0_HASH_INVALID');

const stage0LineageHashMissing = structuredClone(artifact);
stage0LineageHashMissing.manifest.sourceStage0FinancialLineageArtifactSha256 = null;
await expectInvalid(stage0LineageHashMissing, 'SOURCE_STAGE0_FINANCIAL_LINEAGE_INVALID');

const stage0DailyHashMissing = structuredClone(artifact);
stage0DailyHashMissing.manifest.sourceStage0DailySourceInventorySha256 = null;
await expectInvalid(stage0DailyHashMissing, 'SOURCE_STAGE0_FINANCIAL_LINEAGE_INVALID');

const stage0LookAhead = structuredClone(artifact);
stage0LookAhead.manifest.sourceStage0GeneratedAt = '2026-08-27T10:00:00.000Z';
await expectInvalid(stage0LookAhead, 'SOURCE_STAGE0_LOOKAHEAD_INVALID');

const publicText = JSON.stringify(artifact);
for (const forbidden of ['fileId', 'accessToken', 'credential', 'secret', 'rawResponse']) {
  assert.equal(publicText.includes(forbidden), false, `Stage1 artifact leaked ${forbidden}`);
}

const stage1Producer = fs.readFileSync(path.join(REPO_ROOT, 'components/PreliminaryFilter.tsx'), 'utf8');
assert.ok(stage1Producer.includes('buildStage1Artifact'), 'Stage1 contract producer integration missing');
assert.ok(stage1Producer.includes('evaluateStage1Universe'), 'Stage1 preview/commit parity integration missing');
assert.doesNotMatch(stage1Producer, /\(s\.targetMeanPrice > 0\)/, 'legacy target hard gate remains active');

const stage2Consumer = fs.readFileSync(path.join(REPO_ROOT, 'components/DeepQualityFilter.tsx'), 'utf8');
assert.ok(stage2Consumer.includes('validateStage1ArtifactForStage2'), 'Stage2 Stage1-contract gate missing');
assert.match(stage2Consumer, /await validateStage1ArtifactForStage2\(stage1Content\)/);
assert.match(
  stage2Consumer,
  /stage1RawCandidates\.length === 0[\s\S]{0,800}point-in-time evidence gate/i,
  'empty Stage1 point-in-time output is still misreported as an instrument-gate failure'
);

console.log('[STAGE1_POINT_IN_TIME_FILTER_CONTRACT] PASS');
