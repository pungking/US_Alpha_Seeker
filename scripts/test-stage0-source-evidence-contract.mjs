import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let contract;
try {
  contract = await import('../services/stage0SourceEvidenceContract.mjs');
} catch (error) {
  assert.fail(`Stage0 source evidence contract missing: ${error?.code || error?.name || 'unknown'}`);
}

const {
  buildStage0Artifact,
  buildStage0SourceFileEvidence,
  classifyStage0RowEvidence,
  validateStage0ArtifactForStage1
} = contract;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GENERATED_AT = '2026-08-26T10:01:24.162Z';
const FRESHNESS_MS = 2 * 24 * 60 * 60 * 1000;

const sourceRows = (letter) => [{
  symbol: `${letter}1`,
  price: 10,
  quoteSource: 'FIXTURE_QUOTE',
  quoteTimestamp: Date.parse('2026-08-26T09:00:00.000Z') / 1000
}];

const sourceFile = async (letter, ordinal) => {
  const rows = sourceRows(letter);
  return buildStage0SourceFileEvidence({
    ordinal,
    fileName: `${letter}_stocks_daily.json`,
    sourceKind: 'FINANCIAL_DATA_DAILY_CYLINDER',
    rawText: JSON.stringify(rows),
    retrievedAt: GENERATED_AT,
    sourceRows: rows,
    parsedRows: rows.length,
    rejectedRows: 0,
    parseStatus: 'PARSED'
  });
};

const completeSources = await Promise.all(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => sourceFile(letter, index + 1))
);

const completeRow = classifyStage0RowEvidence({
  symbol: 'FIXTURE1',
  price: 10,
  quoteSource: 'FIXTURE_QUOTE',
  quoteTimestamp: Date.parse('2026-08-26T09:00:00.000Z') / 1000,
  quoteRetrievedAt: GENERATED_AT,
  netIncomeSource: 'FIXTURE_FINANCIAL',
  fiscalPeriod: '2026-Q2',
  financialPublishedAt: '2026-08-20T12:00:00.000Z',
  financialRetrievedAt: GENERATED_AT,
  targetMeanPrice: 12,
  targetMeanPriceSource: 'FIXTURE_TARGET',
  targetMeanPriceAsOf: '2026-08-25T20:00:00.000Z',
  targetMeanPriceRetrievedAt: GENERATED_AT,
  identifierLineageStatus: 'IDENTIFIER_LINEAGE_VERIFIED',
  dataQuality: 'HIGH'
}, {
  referenceTime: GENERATED_AT,
  quoteFreshnessMaxAgeMs: FRESHNESS_MS
});

assert.equal(completeRow.quoteEvidenceStatus, 'QUOTE_EVIDENCE_VERIFIED');
assert.equal(completeRow.quoteFreshnessStatus, 'FRESH');
assert.equal(completeRow.financialEvidenceStatus, 'FINANCIAL_EVIDENCE_VERIFIED');
assert.equal(completeRow.targetEvidenceStatus, 'TARGET_EVIDENCE_VERIFIED');
assert.equal(completeRow.identifierEvidenceStatus, 'IDENTIFIER_LINEAGE_VERIFIED');
assert.equal(completeRow.evidenceQualityStatus, 'EVIDENCE_COMPLETE');
assert.equal(completeRow.legacyDataQuality, 'HIGH');
assert.equal(completeRow.dataQualityLegacyBasis, 'PRICE_PRESENT_ONLY');
const completeUniverse = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => ({
  ...completeRow,
  symbol: `${letter}1`
}));

const missingQuote = classifyStage0RowEvidence({ ...completeRow, quoteSource: null }, {
  referenceTime: GENERATED_AT,
  quoteFreshnessMaxAgeMs: FRESHNESS_MS
});
assert.equal(missingQuote.quoteEvidenceStatus, 'QUOTE_SOURCE_MISSING');
assert.equal(missingQuote.evidenceQualityStatus, 'EVIDENCE_PARTIAL');

const missingQuoteSentinel = classifyStage0RowEvidence({ ...completeRow, quoteSource: 'MISSING' }, {
  referenceTime: GENERATED_AT,
  quoteFreshnessMaxAgeMs: FRESHNESS_MS
});
assert.equal(missingQuoteSentinel.quoteEvidenceStatus, 'QUOTE_SOURCE_MISSING');

const staleQuote = classifyStage0RowEvidence({
  ...completeRow,
  quoteTimestamp: Date.parse('2026-08-20T09:00:00.000Z') / 1000
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(staleQuote.quoteEvidenceStatus, 'QUOTE_TIMESTAMP_STALE');
assert.equal(staleQuote.evidenceQualityStatus, 'EVIDENCE_STALE');

const futureQuote = classifyStage0RowEvidence({
  ...completeRow,
  quoteTimestamp: Date.parse('2026-08-27T09:00:00.000Z') / 1000
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(futureQuote.quoteEvidenceStatus, 'QUOTE_TIMESTAMP_FUTURE');
assert.equal(futureQuote.evidenceQualityStatus, 'EVIDENCE_INVALID');

const financialPublicationMissing = classifyStage0RowEvidence({
  ...completeRow,
  financialPublishedAt: null,
  fiscalPeriod: '2026-Q2'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(financialPublicationMissing.financialEvidenceStatus, 'PUBLICATION_TIMESTAMP_MISSING');

const missingFinancialSentinel = classifyStage0RowEvidence({ ...completeRow, netIncomeSource: 'MISSING', financialSource: 'MISSING' }, {
  referenceTime: GENERATED_AT,
  quoteFreshnessMaxAgeMs: FRESHNESS_MS
});
assert.equal(missingFinancialSentinel.financialEvidenceStatus, 'FINANCIAL_SOURCE_MISSING');

const targetAsOfUnknown = classifyStage0RowEvidence({
  ...completeRow,
  targetMeanPriceAsOf: null,
  targetMeanPriceAsOfStatus: 'VENDOR_TARGET_ASOF_UNKNOWN'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(targetAsOfUnknown.targetEvidenceStatus, 'VENDOR_TARGET_ASOF_UNKNOWN');

const targetUnavailable = classifyStage0RowEvidence({
  ...completeRow,
  targetMeanPrice: 0,
  targetMeanPriceSource: null,
  targetMeanPriceAsOf: null,
  targetMeanPriceAsOfStatus: 'TARGET_SOURCE_NOT_AVAILABLE'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(targetUnavailable.targetEvidenceStatus, 'TARGET_SOURCE_NOT_AVAILABLE');

const aliasResolved = classifyStage0RowEvidence({
  ...completeRow,
  identifierLineageStatus: 'IDENTIFIER_ALIAS_RESOLVED'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(aliasResolved.identifierEvidenceStatus, 'IDENTIFIER_ALIAS_RESOLVED');

const ambiguousIdentifier = classifyStage0RowEvidence({
  ...completeRow,
  identifierLineageStatus: 'IDENTIFIER_LINEAGE_AMBIGUOUS'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(ambiguousIdentifier.identifierEvidenceStatus, 'IDENTIFIER_LINEAGE_AMBIGUOUS');
assert.equal(ambiguousIdentifier.evidenceQualityStatus, 'EVIDENCE_INVALID');

const noFreshnessPolicy = classifyStage0RowEvidence(completeRow, { referenceTime: GENERATED_AT });
assert.equal(noFreshnessPolicy.quoteFreshnessStatus, 'FRESHNESS_POLICY_UNAVAILABLE');
assert.equal(noFreshnessPolicy.evidenceQualityStatus, 'EVIDENCE_PARTIAL');

const artifact = await buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: completeSources,
  universe: completeUniverse,
  eligibleUniverse: completeUniverse,
  monitoringUniverse: []
});

assert.equal(artifact.manifest.schemaVersion, 'stage0-source-truth-v1');
assert.equal(artifact.manifest.sourceFileCount, 26);
assert.equal(artifact.manifest.sourceInputRows, 26);
assert.equal(artifact.manifest.sourceParsedRows, 26);
assert.equal(artifact.manifest.sourceRejectedRows, 0);
assert.match(artifact.manifest.sourceInventorySha256, /^[a-f0-9]{64}$/);
assert.equal(artifact.manifest.inputHash, artifact.manifest.sourceInventorySha256);
assert.match(artifact.manifest.outputHash, /^[a-f0-9]{64}$/);
assert.equal(artifact.manifest.sourceFiles[0].fileName, 'A_stocks_daily.json');
assert.equal(artifact.manifest.sourceFiles[25].fileName, 'Z_stocks_daily.json');
assert.equal(artifact.manifest.unknownOrUnclassifiedRows, 0);

const reordered = await buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: [...completeSources].reverse(),
  universe: completeUniverse,
  eligibleUniverse: completeUniverse,
  monitoringUniverse: []
});
assert.equal(reordered.manifest.sourceInventorySha256, artifact.manifest.sourceInventorySha256);
assert.equal(reordered.manifest.inputHash, artifact.manifest.inputHash);
assert.equal(reordered.manifest.outputHash, artifact.manifest.outputHash);

const changedA = await buildStage0SourceFileEvidence({
  ordinal: 1,
  fileName: 'A_stocks_daily.json',
  sourceKind: 'FINANCIAL_DATA_DAILY_CYLINDER',
  rawText: JSON.stringify([{ ...sourceRows('A')[0], price: 11 }]),
  retrievedAt: GENERATED_AT,
  sourceRows: sourceRows('A'),
  parsedRows: 1,
  rejectedRows: 0,
  parseStatus: 'PARSED'
});
const changedArtifact = await buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: [changedA, ...completeSources.slice(1)],
  universe: completeUniverse,
  eligibleUniverse: completeUniverse,
  monitoringUniverse: []
});
assert.notEqual(changedArtifact.manifest.sourceInventorySha256, artifact.manifest.sourceInventorySha256);

const validated = await validateStage0ArtifactForStage1(artifact);
assert.equal(validated.valid, true);
assert.deepEqual(validated.eligibleUniverse, artifact.eligible_universe);
assert.equal(validated.eligibleUniverse.length, artifact.eligible_universe.length);

const expectInvalid = async (candidate, reason) => {
  const result = await validateStage0ArtifactForStage1(candidate);
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes(reason), `${reason} missing from ${result.reasons.join(',')}`);
};

const missingHash = structuredClone(artifact);
missingHash.manifest.sourceFiles[0].contentSha256 = null;
await expectInvalid(missingHash, 'SOURCE_CONTENT_HASH_MISSING');

const duplicateIdentity = structuredClone(artifact);
duplicateIdentity.manifest.sourceFiles[1].fileName = duplicateIdentity.manifest.sourceFiles[0].fileName;
await expectInvalid(duplicateIdentity, 'DUPLICATE_SOURCE_IDENTITY');

const invalidOrdinal = structuredClone(artifact);
invalidOrdinal.manifest.sourceFiles[25].ordinal = 27;
await expectInvalid(invalidOrdinal, 'SOURCE_IDENTITY_INVALID');

const parseFailure = structuredClone(artifact);
parseFailure.manifest.sourceFiles[0].parseStatus = 'PARSE_FAILED';
await expectInvalid(parseFailure, 'SOURCE_PARSE_FAILURE');

const sourceToStage0CountMismatch = structuredClone(artifact);
sourceToStage0CountMismatch.manifest.sourceParsedRows -= 1;
await expectInvalid(sourceToStage0CountMismatch, 'SOURCE_TO_STAGE0_ROW_COUNT_MISMATCH');

const partitionMismatch = structuredClone(artifact);
partitionMismatch.monitoring_universe = [partitionMismatch.universe[0]];
partitionMismatch.manifest.excludedByInstrumentType = 1;
await expectInvalid(partitionMismatch, 'STAGE0_ROW_COUNT_MISMATCH');

const outputMismatch = structuredClone(artifact);
outputMismatch.universe[0].price = 99;
await expectInvalid(outputMismatch, 'OUTPUT_HASH_MISMATCH');

const malformed = structuredClone(artifact);
malformed.manifest.schemaVersion = 'legacy';
await expectInvalid(malformed, 'MANIFEST_SCHEMA_INVALID');

const deterministic = await buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: completeSources,
  universe: completeUniverse,
  eligibleUniverse: completeUniverse,
  monitoringUniverse: []
});
assert.equal(deterministic.manifest.sourceInventorySha256, artifact.manifest.sourceInventorySha256);
assert.equal(deterministic.manifest.inputHash, artifact.manifest.inputHash);
assert.equal(deterministic.manifest.outputHash, artifact.manifest.outputHash);

const publicManifest = JSON.stringify(artifact.manifest);
for (const forbidden of ['rawText', 'fileId', 'accessToken', 'credential', 'secret']) {
  assert.equal(publicManifest.includes(forbidden), false, `manifest leaked ${forbidden}`);
}

const stage0Producer = fs.readFileSync(path.join(REPO_ROOT, 'components/UniverseGathering.tsx'), 'utf8');
for (const token of [
  'buildStage0SourceFileEvidence',
  'classifyStage0RowEvidence',
  'buildStage0Artifact'
]) {
  assert.ok(stage0Producer.includes(token), `Stage0 producer integration missing: ${token}`);
}
assert.doesNotMatch(stage0Producer, /dataQuality:\s*\(price > 0 \? 'HIGH' : 'LOW'\)/);

const stage1Consumer = fs.readFileSync(path.join(REPO_ROOT, 'components/PreliminaryFilter.tsx'), 'utf8');
assert.ok(stage1Consumer.includes('validateStage0ArtifactForStage1'), 'Stage1 manifest gate missing');
assert.match(stage1Consumer, /await validateStage0ArtifactForStage1\(content\)/);

console.log('[STAGE0_SOURCE_EVIDENCE_CONTRACT] PASS');
