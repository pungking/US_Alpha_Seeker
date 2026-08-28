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
  applyStage0FinancialPublicationLineage,
  buildStage0Artifact,
  buildStage0SourceFileEvidence,
  classifyStage0RowEvidence,
  hashCanonicalJsonSha256,
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
    canonicalPayload: rows,
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
  netIncome: 100,
  netIncomeSource: 'HISTORY',
  netIncomeAsOf: '2026-06-30',
  financialSource: 'YFINANCE_HISTORY_SEC_EDGAR_EXACT_LINEAGE',
  financialMetricBasis: {
    metric: 'NET_INCOME',
    sourceLabel: 'Net Income',
    taxonomy: 'us-gaap',
    concept: 'NetIncomeLoss',
    unit: 'USD'
  },
  fiscalPeriod: '2026-06-30',
  financialPublishedAt: '2026-08-20T12:00:00.000Z',
  financialRetrievedAt: GENERATED_AT,
  financialLineageClassification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  financialSourceRecordSha256: 'd'.repeat(64),
  financialLineageArtifactSha256: 'e'.repeat(64),
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
  symbol: `${letter}1`,
  sourceDailyFile: `${letter}_stocks_daily.json`
}));

const identityMap = Object.fromEntries(completeUniverse.map((row) => [row.symbol, {
  symbol: row.symbol,
  sourceSymbol: row.symbol,
  analysisEligible: true
}]));
const identityMapSha256 = await hashCanonicalJsonSha256(identityMap);
const producerSourceFiles = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').flatMap((letter, index) => [
  {
    fileName: `${letter}_stocks_daily.json`,
    sourceKind: 'DAILY',
    contentSha256: completeSources[index].canonicalContentSha256,
    hashBasis: 'CANONICAL_JSON_DOWNLOADED_FROM_DRIVE'
  },
  {
    fileName: `${letter}_stocks_history.json`,
    sourceKind: 'HISTORY',
    contentSha256: (index + 27).toString(16).padStart(64, '0'),
    hashBasis: 'CANONICAL_JSON_DOWNLOADED_FROM_DRIVE'
  }
]);
const producerSourceInventorySha256 = await hashCanonicalJsonSha256(
  [...producerSourceFiles].sort((left, right) =>
    left.sourceKind.localeCompare(right.sourceKind) || left.fileName.localeCompare(right.fileName)
  )
);
const sourceResponseHashes = {
  secCompanyTickerMap: '2'.repeat(64),
  secCompanyfactsBulk: '3'.repeat(64),
  secSubmissionsBulk: '4'.repeat(64)
};
const producerLineageRows = await Promise.all(completeUniverse.map(async (row, index) => {
  const base = {
    identity: {
      effectiveSymbol: row.symbol,
      sourceSymbol: row.symbol,
      identifierLineageStatus: 'IDENTIFIER_LINEAGE_VERIFIED'
    },
    identityMapSha256,
    financialMetricBasis: 'NET_INCOME',
    sourceMetricLabel: 'Net Income',
    value: row.netIncome,
    fiscalPeriod: row.netIncomeAsOf,
    sourceDailyFile: row.sourceDailyFile,
    sourceDailyFileSha256: producerSourceFiles.find((file) =>
      file.sourceKind === 'DAILY' && file.fileName === row.sourceDailyFile
    ).contentSha256,
    sourceHistoryFile: `${row.symbol[0]}_stocks_history.json`,
    sourceHistoryFileSha256: producerSourceFiles.find((file) =>
      file.sourceKind === 'HISTORY' && file.fileName === `${row.symbol[0]}_stocks_history.json`
    ).contentSha256,
    inputStatus: index === completeUniverse.length - 1
      ? 'FINANCIAL_LINEAGE_FACT_NOT_FOUND'
      : 'READY_FOR_EXACT_SEC_LINEAGE'
  };
  if (index === completeUniverse.length - 1) {
    return { ...base, classification: 'FINANCIAL_LINEAGE_FACT_NOT_FOUND' };
  }
  const verified = {
    ...base,
    classification: 'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
    financialSource: 'YFINANCE_HISTORY_SEC_EDGAR_EXACT_LINEAGE',
    financialMetricBasis: {
      metric: 'NET_INCOME',
      sourceLabel: 'Net Income',
      taxonomy: 'us-gaap',
      concept: 'NetIncomeLoss',
      unit: 'USD'
    },
    fiscalPeriod: { start: '2026-04-01', end: row.netIncomeAsOf },
    form: '10-Q',
    accessionNumber: `fixture-accession-${index}`,
    tenDigitCik: `fixture-cik-${index}`,
    financialPublishedAt: '2026-08-20T12:00:00.000Z',
    financialRetrievedAt: '2026-08-26T09:50:00.000Z',
    amendmentStatus: 'ORIGINAL',
    collapsedDuplicateRows: 0
  };
  const financialSourceRecordHashBasis = {
    cik: verified.tenDigitCik,
    taxonomy: verified.financialMetricBasis.taxonomy,
    concept: verified.financialMetricBasis.concept,
    unit: verified.financialMetricBasis.unit,
    value: verified.value,
    periodStart: verified.fiscalPeriod.start,
    periodEnd: verified.fiscalPeriod.end,
    form: verified.form,
    accessionNumber: verified.accessionNumber,
    acceptanceDateTime: verified.financialPublishedAt,
    retrievedAt: verified.financialRetrievedAt,
    sourceResponseHashes
  };
  return {
    ...verified,
    financialSourceRecordHashBasis,
    financialSourceRecordSha256: await hashCanonicalJsonSha256(financialSourceRecordHashBasis)
  };
}));
const producerArtifact = {
  schemaVersion: 'stage0-sec-financial-publication-lineage-v1',
  mode: 'SHADOW_ONLY_STAGE0_FINANCIAL_PUBLICATION_LINEAGE',
  status: 'STAGE0_SEC_FINANCIAL_LINEAGE_PRODUCER_PASS',
  runId: 'stage0-sec-lineage-fixture',
  generatedAt: '2026-08-26T09:50:00.000Z',
  collectionWindow: '2026-08-26',
  collectionKey: '1'.repeat(64),
  sourceFileCount: producerSourceFiles.length,
  sourceInputRows: producerLineageRows.length,
  sourceParsedRows: producerLineageRows.length,
  sourceRejectedRows: 1,
  sourceFileHashes: producerSourceFiles,
  sourceInventorySha256: producerSourceInventorySha256,
  identityMapSha256,
  sourceResponseHashes,
  requestCounts: {
    secCompanyTickerMap: 1,
    secCompanyfactsBulk: 1,
    secSubmissionsBulk: 1
  },
  externalRequestCount: 3,
  requestBudgetCompliant: true,
  requestBudgetExact: true,
  retryCount: 0,
  paginationUsed: false,
  publicationLineageRows: producerLineageRows,
  classificationCounts: {
    FINANCIAL_LINEAGE_FACT_NOT_FOUND: 1,
    FINANCIAL_LINEAGE_VERIFIED_ORIGINAL: producerLineageRows.length - 1
  },
  verifiedRows: producerLineageRows.length - 1,
  ambiguousRows: 0,
  unresolvedRows: 1,
  unknownOrUnclassifiedRows: 0,
  rawResponseStored: false,
  stageProgressionGate: 'STAGE0_LOCKED',
  recurringActivationAuthorized: false,
  canonicalSourceChanged: false,
  policyImpact: 'NONE_REPORT_ONLY',
  Stage1To7PolicyChanged: false,
  brokerOrSidecarStateMutation: false,
  inputHash: '5'.repeat(64),
  outputHash: '6'.repeat(64),
  evidenceSha256: '7'.repeat(64),
  artifactPersistenceStatus: 'LOCAL_AND_DRIVE_PUBLISHED'
};
const producerRawText = JSON.stringify(producerArtifact);
const identityMapRawText = JSON.stringify(identityMap);
const appliedLineage = await applyStage0FinancialPublicationLineage({
  rows: completeUniverse,
  sourceFiles: completeSources,
  lineageArtifact: producerArtifact,
  lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
  lineageArtifactRawBytes: new TextEncoder().encode(producerRawText),
  identityMap,
  identityMapRawBytes: new TextEncoder().encode(identityMapRawText),
  referenceTime: GENERATED_AT,
  quoteFreshnessMaxAgeMs: FRESHNESS_MS
});
assert.equal(appliedLineage.contract.matchedRows, completeUniverse.length);
assert.equal(appliedLineage.contract.verifiedRows, completeUniverse.length - 1);
assert.equal(appliedLineage.contract.unresolvedRows, 1);
assert.equal(appliedLineage.contract.unknownOrUnclassifiedRows, 0);
assert.equal(appliedLineage.contract.rowCountParity, true);
assert.match(appliedLineage.contract.artifactContentSha256, /^[a-f0-9]{64}$/);
assert.match(appliedLineage.contract.identityMapContentSha256, /^[a-f0-9]{64}$/);
assert.equal(appliedLineage.contract.identityMapCanonicalSha256, identityMapSha256);
assert.equal(appliedLineage.contract.currentDailySourceHashParity, true);
assert.equal(appliedLineage.rows[0].financialEvidenceStatus, 'FINANCIAL_EVIDENCE_VERIFIED');
assert.equal(appliedLineage.rows.at(-1).financialLineageClassification, 'FINANCIAL_LINEAGE_FACT_NOT_FOUND');
assert.notEqual(appliedLineage.rows.at(-1).financialEvidenceStatus, 'FINANCIAL_EVIDENCE_VERIFIED');
assert.equal('accessionNumber' in appliedLineage.rows[0], false);
assert.equal('tenDigitCik' in appliedLineage.rows[0], false);

const tamperedRecordHash = structuredClone(producerArtifact);
tamperedRecordHash.publicationLineageRows[0].financialSourceRecordHashBasis.periodEnd = '2026-03-31';
await assert.rejects(
  applyStage0FinancialPublicationLineage({
    rows: completeUniverse,
    sourceFiles: completeSources,
    lineageArtifact: tamperedRecordHash,
    lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    lineageArtifactRawBytes: new TextEncoder().encode(JSON.stringify(tamperedRecordHash)),
    identityMap,
    identityMapRawBytes: new TextEncoder().encode(identityMapRawText),
    referenceTime: GENERATED_AT
  }),
  /STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID/
);

await assert.rejects(
  applyStage0FinancialPublicationLineage({
    rows: completeUniverse,
    sourceFiles: completeSources,
    lineageArtifact: {
      ...producerArtifact,
      identityMapSha256: '8'.repeat(64)
    },
    lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    lineageArtifactRawBytes: new TextEncoder().encode(producerRawText),
    identityMap,
    identityMapRawBytes: new TextEncoder().encode(identityMapRawText),
    referenceTime: GENERATED_AT
  }),
  /STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID/
);

const wrongFileLineage = structuredClone(producerArtifact);
wrongFileLineage.publicationLineageRows[0].sourceDailyFile = 'B_stocks_daily.json';
wrongFileLineage.publicationLineageRows[0].sourceDailyFileSha256 = producerSourceFiles.find((file) =>
  file.sourceKind === 'DAILY' && file.fileName === 'B_stocks_daily.json'
).contentSha256;
await assert.rejects(
  applyStage0FinancialPublicationLineage({
    rows: completeUniverse,
    sourceFiles: completeSources,
    lineageArtifact: wrongFileLineage,
    lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    lineageArtifactRawBytes: new TextEncoder().encode(JSON.stringify(wrongFileLineage)),
    identityMap,
    identityMapRawBytes: new TextEncoder().encode(identityMapRawText),
    referenceTime: GENERATED_AT
  }),
  /STAGE0_SEC_FINANCIAL_LINEAGE_ROW_MATCH_INVALID/
);

const changedCurrentSource = structuredClone(completeSources);
changedCurrentSource[0].canonicalContentSha256 = 'f'.repeat(64);
await assert.rejects(
  applyStage0FinancialPublicationLineage({
    rows: completeUniverse,
    sourceFiles: changedCurrentSource,
    lineageArtifact: producerArtifact,
    lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    lineageArtifactRawBytes: new TextEncoder().encode(producerRawText),
    identityMap,
    identityMapRawBytes: new TextEncoder().encode(identityMapRawText),
    referenceTime: GENERATED_AT
  }),
  /STAGE0_SEC_FINANCIAL_LINEAGE_SOURCE_HASH_MISMATCH/
);

const changedIdentityMap = structuredClone(identityMap);
changedIdentityMap.A1.analysisEligible = false;
await assert.rejects(
  applyStage0FinancialPublicationLineage({
    rows: completeUniverse,
    sourceFiles: completeSources,
    lineageArtifact: producerArtifact,
    lineageArtifactFileName: 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json',
    lineageArtifactRawBytes: new TextEncoder().encode(producerRawText),
    identityMap: changedIdentityMap,
    identityMapRawBytes: new TextEncoder().encode(JSON.stringify(changedIdentityMap)),
    referenceTime: GENERATED_AT
  }),
  /STAGE0_SEC_FINANCIAL_LINEAGE_IDENTITY_HASH_MISMATCH/
);

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

const financialRetrievalMissing = classifyStage0RowEvidence({
  ...completeRow,
  financialRetrievedAt: null
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(financialRetrievalMissing.financialEvidenceStatus, 'FINANCIAL_EVIDENCE_INVALID');

const financialRetrievalFuture = classifyStage0RowEvidence({
  ...completeRow,
  financialRetrievedAt: '2026-08-27T12:00:00.000Z'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(financialRetrievalFuture.financialEvidenceStatus, 'FINANCIAL_EVIDENCE_INVALID');

const financialRetrievedBeforePublication = classifyStage0RowEvidence({
  ...completeRow,
  financialRetrievedAt: '2026-08-19T12:00:00.000Z'
}, { referenceTime: GENERATED_AT, quoteFreshnessMaxAgeMs: FRESHNESS_MS });
assert.equal(financialRetrievedBeforePublication.financialEvidenceStatus, 'FINANCIAL_EVIDENCE_INVALID');

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
  universe: appliedLineage.rows,
  eligibleUniverse: appliedLineage.rows,
  monitoringUniverse: [],
  financialLineageContract: appliedLineage.contract
});

assert.equal(artifact.manifest.schemaVersion, 'stage0-source-truth-v2');
assert.equal(artifact.manifest.stageProgressionGate, 'STAGE0_LOCKED');
assert.equal(artifact.manifest.financialLineageContract.status, 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED');
assert.equal(artifact.manifest.financialLineageContract.rowCountParity, true);
assert.equal(artifact.manifest.financialLineageContract.currentDailySourceHashParity, true);
assert.match(artifact.manifest.financialLineageContract.currentDailySourceInventorySha256, /^[a-f0-9]{64}$/);
assert.equal(artifact.manifest.sourceFileCount, 26);
assert.equal(artifact.manifest.sourceInputRows, 26);
assert.equal(artifact.manifest.sourceParsedRows, 26);
assert.equal(artifact.manifest.sourceRejectedRows, 0);
assert.match(artifact.manifest.sourceInventorySha256, /^[a-f0-9]{64}$/);
assert.match(artifact.manifest.inputHash, /^[a-f0-9]{64}$/);
assert.notEqual(artifact.manifest.inputHash, artifact.manifest.sourceInventorySha256);
assert.match(artifact.manifest.outputHash, /^[a-f0-9]{64}$/);
assert.equal(artifact.manifest.sourceFiles[0].fileName, 'A_stocks_daily.json');
assert.equal(artifact.manifest.sourceFiles[25].fileName, 'Z_stocks_daily.json');
assert.equal(artifact.manifest.unknownOrUnclassifiedRows, 0);

const reordered = await buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: [...completeSources].reverse(),
  universe: appliedLineage.rows,
  eligibleUniverse: appliedLineage.rows,
  monitoringUniverse: [],
  financialLineageContract: appliedLineage.contract
});
assert.equal(reordered.manifest.sourceInventorySha256, artifact.manifest.sourceInventorySha256);
assert.equal(reordered.manifest.inputHash, artifact.manifest.inputHash);
assert.equal(reordered.manifest.outputHash, artifact.manifest.outputHash);

const changedA = await buildStage0SourceFileEvidence({
  ordinal: 1,
  fileName: 'A_stocks_daily.json',
  sourceKind: 'FINANCIAL_DATA_DAILY_CYLINDER',
  rawText: JSON.stringify([{ ...sourceRows('A')[0], price: 11 }]),
  canonicalPayload: [{ ...sourceRows('A')[0], price: 11 }],
  retrievedAt: GENERATED_AT,
  sourceRows: sourceRows('A'),
  parsedRows: 1,
  rejectedRows: 0,
  parseStatus: 'PARSED'
});
assert.notEqual(changedA.contentSha256, completeSources[0].contentSha256);
assert.notEqual(changedA.canonicalContentSha256, completeSources[0].canonicalContentSha256);
await assert.rejects(buildStage0Artifact({
  generatedAt: GENERATED_AT,
  sourceFiles: [changedA, ...completeSources.slice(1)],
  universe: appliedLineage.rows,
  eligibleUniverse: appliedLineage.rows,
  monitoringUniverse: [],
  financialLineageContract: appliedLineage.contract
}), /STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID/);

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
  universe: appliedLineage.rows,
  eligibleUniverse: appliedLineage.rows,
  monitoringUniverse: [],
  financialLineageContract: appliedLineage.contract
});
assert.equal(deterministic.manifest.sourceInventorySha256, artifact.manifest.sourceInventorySha256);
assert.equal(deterministic.manifest.inputHash, artifact.manifest.inputHash);
assert.equal(deterministic.manifest.outputHash, artifact.manifest.outputHash);

const publicManifest = JSON.stringify(artifact.manifest);
for (const forbidden of ['rawText', 'fileId', 'accessToken', 'credential', 'secret', 'accessionNumber', 'tenDigitCik']) {
  assert.equal(publicManifest.includes(forbidden), false, `manifest leaked ${forbidden}`);
}

const stage0Producer = fs.readFileSync(path.join(REPO_ROOT, 'components/UniverseGathering.tsx'), 'utf8');
for (const token of [
  'buildStage0SourceFileEvidence',
  'classifyStage0RowEvidence',
  'applyStage0FinancialPublicationLineage',
  'buildStage0Artifact'
]) {
  assert.ok(stage0Producer.includes(token), `Stage0 producer integration missing: ${token}`);
}
assert.doesNotMatch(stage0Producer, /dataQuality:\s*\(price > 0 \? 'HIGH' : 'LOW'\)/);

const stage1Consumer = fs.readFileSync(path.join(REPO_ROOT, 'components/PreliminaryFilter.tsx'), 'utf8');
assert.ok(stage1Consumer.includes('validateStage0ArtifactForStage1'), 'Stage1 manifest gate missing');
assert.match(stage1Consumer, /await validateStage0ArtifactForStage1\(content\)/);

console.log('[STAGE0_SOURCE_EVIDENCE_CONTRACT] PASS');
