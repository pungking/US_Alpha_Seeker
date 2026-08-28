const SHA256_RE = /^[a-f0-9]{64}$/;
const COMPLETE_SOURCE_COUNT = 26;
const STAGE0_SCHEMA_VERSION = 'stage0-source-truth-v2';
const FINANCIAL_LINEAGE_FILE = 'STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json';
const FINANCIAL_LINEAGE_SCHEMA_VERSION = 'stage0-sec-financial-publication-lineage-v1';
const FINANCIAL_LINEAGE_CLASSIFICATIONS = new Set([
  'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  'FINANCIAL_LINEAGE_VERIFIED_AMENDMENT',
  'FINANCIAL_LINEAGE_DUPLICATE_SAME_ACCESSION_COLLAPSED',
  'FINANCIAL_LINEAGE_MULTIPLE_ACCESSIONS_AMBIGUOUS',
  'FINANCIAL_LINEAGE_FACT_NOT_FOUND',
  'FINANCIAL_LINEAGE_SUBMISSION_MISSING',
  'FINANCIAL_LINEAGE_FORM_MISMATCH',
  'FINANCIAL_LINEAGE_IDENTITY_INVALID',
  'FINANCIAL_LINEAGE_PUBLICATION_AFTER_RETRIEVAL_REJECTED',
  'FINANCIAL_LINEAGE_NOT_APPLICABLE'
]);
const VERIFIED_FINANCIAL_LINEAGE = new Set([
  'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  'FINANCIAL_LINEAGE_VERIFIED_AMENDMENT',
  'FINANCIAL_LINEAGE_DUPLICATE_SAME_ACCESSION_COLLAPSED'
]);
const FINANCIAL_FORMS = new Set([
  '10-K', '10-K/A', '10-Q', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A', '6-K', '6-K/A'
]);
const VALID_PARSE_STATUSES = new Set(['PARSED', 'PARSED_WITH_REJECTIONS']);
const EVIDENCE_FIELDS = [
  'quoteEvidenceStatus',
  'financialEvidenceStatus',
  'targetEvidenceStatus',
  'identifierEvidenceStatus',
  'evidenceQualityStatus'
];

const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
};

export const hashBytesSha256 = async (bytes) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('STAGE0_SHA256_UNAVAILABLE');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashTextSha256 = async (text) => hashBytesSha256(new TextEncoder().encode(String(text)));
export const hashCanonicalJsonSha256 = async (value) => hashTextSha256(canonicalJson(value));

const normalizeText = (value) => String(value ?? '').trim();
const normalizeSource = (value) => {
  const source = normalizeText(value);
  return !source || ['MISSING', 'UNKNOWN', 'UNAVAILABLE', 'N/A', 'NONE'].includes(source.toUpperCase())
    ? null
    : source;
};

const normalizeIso = (value) => {
  if (value === null || value === undefined || value === '') return null;
  let milliseconds;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(normalizeText(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    milliseconds = numeric >= 1e12 ? numeric : numeric * 1000;
  } else {
    const raw = normalizeText(value);
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) return null;
    milliseconds = Date.parse(raw);
  }
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null;
};

const sourceRoot = (row) => row?.basic && typeof row.basic === 'object' ? row.basic : row;

const sourceAsOfRange = (rows, retrievedAt) => {
  const timestamps = rows
    .map((row) => normalizeIso(sourceRoot(row)?.quoteTimestamp ?? sourceRoot(row)?.sourceAsOf))
    .filter(Boolean)
    .sort();
  const inputRows = rows.length;
  const retrievedAtIso = normalizeIso(retrievedAt);
  const futureRows = retrievedAtIso
    ? timestamps.filter((timestamp) => timestamp > retrievedAtIso).length
    : 0;
  const sourceAsOfStatus = futureRows > 0
    ? 'SOURCE_ASOF_INVALID'
    : timestamps.length === 0
      ? 'SOURCE_ASOF_UNAVAILABLE'
      : timestamps.length === inputRows
        ? 'SOURCE_ASOF_VERIFIED'
        : 'SOURCE_ASOF_PARTIAL';
  return {
    sourceAsOfMin: timestamps[0] || null,
    sourceAsOfMax: timestamps.at(-1) || null,
    sourceAsOfStatus
  };
};

export const buildStage0SourceFileEvidence = async ({
  ordinal,
  fileName,
  sourceKind,
  rawText = '',
  rawBytes = null,
  canonicalPayload = null,
  retrievedAt,
  sourceRows = [],
  parsedRows,
  rejectedRows,
  parseStatus
}) => {
  const inputRows = Array.isArray(sourceRows) ? sourceRows.length : 0;
  return {
    ordinal: Number(ordinal),
    fileName: normalizeText(fileName),
    sourceKind: normalizeText(sourceKind),
    contentSha256: rawBytes
      ? await hashBytesSha256(rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes))
      : await hashTextSha256(rawText),
    canonicalContentSha256: canonicalPayload === null
      ? null
      : await hashCanonicalJsonSha256(canonicalPayload),
    retrievedAt: normalizeIso(retrievedAt),
    sourceAsOfBasis: 'ROW_QUOTE_TIMESTAMP',
    ...sourceAsOfRange(Array.isArray(sourceRows) ? sourceRows : [], retrievedAt),
    inputRows,
    parsedRows: Number(parsedRows),
    rejectedRows: Number(rejectedRows),
    parseStatus: normalizeText(parseStatus).toUpperCase()
  };
};

const classifyQuote = (row, referenceTime, quoteFreshnessMaxAgeMs) => {
  const quoteSource = normalizeSource(row?.quoteSource);
  const rawTimestamp = row?.quoteTimestamp ?? row?.quoteAsOf;
  const quoteAsOf = normalizeIso(rawTimestamp);
  const hasTimestamp = rawTimestamp !== null && rawTimestamp !== undefined && rawTimestamp !== '' && Number(rawTimestamp) !== 0;
  const referenceIso = normalizeIso(referenceTime);
  const quoteMs = Date.parse(String(quoteAsOf || ''));
  const referenceMs = Date.parse(String(referenceIso || ''));

  let quoteFreshnessStatus = 'FRESHNESS_POLICY_UNAVAILABLE';
  if (!hasTimestamp) quoteFreshnessStatus = 'MISSING';
  else if (!quoteAsOf || !referenceIso) quoteFreshnessStatus = 'INVALID';
  else if (quoteMs > referenceMs) quoteFreshnessStatus = 'FUTURE';
  else if (Number.isFinite(quoteFreshnessMaxAgeMs) && quoteFreshnessMaxAgeMs >= 0) {
    quoteFreshnessStatus = referenceMs - quoteMs > quoteFreshnessMaxAgeMs ? 'STALE' : 'FRESH';
  }

  let quoteEvidenceStatus = 'QUOTE_EVIDENCE_VERIFIED';
  if (!quoteSource) quoteEvidenceStatus = 'QUOTE_SOURCE_MISSING';
  else if (!hasTimestamp) quoteEvidenceStatus = 'QUOTE_TIMESTAMP_MISSING';
  else if (!quoteAsOf || !referenceIso) quoteEvidenceStatus = 'QUOTE_EVIDENCE_INVALID';
  else if (quoteFreshnessStatus === 'FUTURE') quoteEvidenceStatus = 'QUOTE_TIMESTAMP_FUTURE';
  else if (quoteFreshnessStatus === 'STALE') quoteEvidenceStatus = 'QUOTE_TIMESTAMP_STALE';

  return {
    quoteSource,
    quoteAsOf,
    quoteRetrievedAt: normalizeIso(row?.quoteRetrievedAt),
    quoteFreshnessStatus,
    quoteEvidenceStatus
  };
};

const classifyFinancial = (row, referenceTime) => {
  const financialSource = normalizeSource(row?.financialSource ?? row?.netIncomeSource);
  const fiscalPeriod = normalizeText(row?.fiscalPeriod ?? row?.netIncomeFiscalPeriod) || null;
  const rawPublishedAt = row?.financialPublishedAt ?? row?.filingPublishedAt;
  const financialPublishedAt = normalizeIso(rawPublishedAt);
  const rawRetrievedAt = row?.financialRetrievedAt ?? row?.netIncomeRetrievedAt;
  const financialRetrievedAt = normalizeIso(rawRetrievedAt);
  const referenceIso = normalizeIso(referenceTime);
  const lineageClassification = normalizeText(row?.financialLineageClassification).toUpperCase();
  const lineageVerified = VERIFIED_FINANCIAL_LINEAGE.has(lineageClassification)
    && SHA256_RE.test(normalizeText(row?.financialSourceRecordSha256))
    && SHA256_RE.test(normalizeText(row?.financialLineageArtifactSha256));

  let financialEvidenceStatus = 'FINANCIAL_EVIDENCE_VERIFIED';
  if (!financialSource) financialEvidenceStatus = 'FINANCIAL_SOURCE_MISSING';
  else if (!fiscalPeriod) financialEvidenceStatus = 'FISCAL_PERIOD_MISSING';
  else if (rawPublishedAt === null || rawPublishedAt === undefined || rawPublishedAt === '') {
    financialEvidenceStatus = 'PUBLICATION_TIMESTAMP_MISSING';
  } else if (!financialPublishedAt || !referenceIso || financialPublishedAt > referenceIso) {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_INVALID';
  } else if (!rawRetrievedAt
    || !financialRetrievedAt
    || financialRetrievedAt > referenceIso
    || financialRetrievedAt < financialPublishedAt) {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_INVALID';
  } else if (!lineageVerified) {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_INVALID';
  } else if (normalizeText(row?.financialFreshnessStatus).toUpperCase() === 'STALE') {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_STALE';
  }

  return {
    financialSource,
    fiscalPeriod,
    financialPublishedAt,
    financialRetrievedAt,
    financialEvidenceStatus
  };
};

const classifyTarget = (row, referenceTime) => {
  const targetSource = normalizeSource(row?.targetSource ?? row?.targetMeanPriceSource);
  const rawTargetAsOf = row?.targetAsOf ?? row?.targetMeanPriceAsOf;
  const targetAsOf = normalizeIso(rawTargetAsOf);
  const sourceStatus = normalizeText(row?.targetAsOfStatus ?? row?.targetMeanPriceAsOfStatus).toUpperCase();
  const referenceIso = normalizeIso(referenceTime);

  let targetEvidenceStatus = 'TARGET_EVIDENCE_VERIFIED';
  if (!targetSource || sourceStatus === 'TARGET_SOURCE_NOT_AVAILABLE') {
    targetEvidenceStatus = 'TARGET_SOURCE_NOT_AVAILABLE';
  } else if (!rawTargetAsOf || sourceStatus === 'VENDOR_TARGET_ASOF_UNKNOWN') {
    targetEvidenceStatus = 'VENDOR_TARGET_ASOF_UNKNOWN';
  } else if (!targetAsOf || !referenceIso) {
    targetEvidenceStatus = 'TARGET_EVIDENCE_INVALID';
  } else if (targetAsOf > referenceIso) {
    targetEvidenceStatus = 'TARGET_TIMESTAMP_FUTURE';
  }

  return {
    targetSource,
    targetAsOf,
    targetRetrievedAt: normalizeIso(row?.targetRetrievedAt ?? row?.targetMeanPriceRetrievedAt),
    targetAsOfStatus: sourceStatus || null,
    targetEvidenceStatus
  };
};

const classifyIdentifier = (row) => {
  const status = normalizeText(row?.identifierLineageStatus ?? row?.identifierEvidenceStatus).toUpperCase();
  return new Set([
    'IDENTIFIER_LINEAGE_VERIFIED',
    'IDENTIFIER_ALIAS_RESOLVED',
    'IDENTIFIER_LINEAGE_AMBIGUOUS',
    'IDENTIFIER_LINEAGE_MISSING'
  ]).has(status) ? status : 'IDENTIFIER_LINEAGE_MISSING';
};

export const classifyStage0RowEvidence = (row = {}, {
  referenceTime,
  quoteFreshnessMaxAgeMs
} = {}) => {
  const quote = classifyQuote(row, referenceTime, quoteFreshnessMaxAgeMs);
  const financial = classifyFinancial(row, referenceTime);
  const target = classifyTarget(row, referenceTime);
  const identifierEvidenceStatus = classifyIdentifier(row);
  const statuses = [
    quote.quoteEvidenceStatus,
    financial.financialEvidenceStatus,
    target.targetEvidenceStatus,
    identifierEvidenceStatus
  ];
  const invalid = statuses.some((status) => /INVALID|FUTURE|AMBIGUOUS/.test(status));
  const stale = statuses.some((status) => /STALE/.test(status));
  const complete = quote.quoteEvidenceStatus === 'QUOTE_EVIDENCE_VERIFIED'
    && quote.quoteFreshnessStatus === 'FRESH'
    && financial.financialEvidenceStatus === 'FINANCIAL_EVIDENCE_VERIFIED'
    && target.targetEvidenceStatus === 'TARGET_EVIDENCE_VERIFIED'
    && ['IDENTIFIER_LINEAGE_VERIFIED', 'IDENTIFIER_ALIAS_RESOLVED'].includes(identifierEvidenceStatus);
  const evidenceQualityStatus = invalid
    ? 'EVIDENCE_INVALID'
    : stale
      ? 'EVIDENCE_STALE'
      : complete
        ? 'EVIDENCE_COMPLETE'
        : 'EVIDENCE_PARTIAL';
  const evidenceQualityReasons = [...new Set([
    quote.quoteEvidenceStatus !== 'QUOTE_EVIDENCE_VERIFIED' ? quote.quoteEvidenceStatus : null,
    quote.quoteFreshnessStatus !== 'FRESH' ? quote.quoteFreshnessStatus : null,
    financial.financialEvidenceStatus !== 'FINANCIAL_EVIDENCE_VERIFIED' ? financial.financialEvidenceStatus : null,
    target.targetEvidenceStatus !== 'TARGET_EVIDENCE_VERIFIED' ? target.targetEvidenceStatus : null,
    !['IDENTIFIER_LINEAGE_VERIFIED', 'IDENTIFIER_ALIAS_RESOLVED'].includes(identifierEvidenceStatus)
      ? identifierEvidenceStatus
      : null
  ].filter(Boolean))].sort();
  const legacyDataQuality = ['HIGH', 'MEDIUM', 'LOW'].includes(row?.dataQuality)
    ? row.dataQuality
    : Number(row?.price) > 0 ? 'HIGH' : 'LOW';

  return {
    ...row,
    ...quote,
    ...financial,
    ...target,
    identifierEvidenceStatus,
    evidenceQualityStatus,
    evidenceQualityReasons,
    legacyDataQuality,
    dataQualityLegacyBasis: 'PRICE_PRESENT_ONLY'
  };
};

const sourceInventoryBasis = (sourceFiles) => [...sourceFiles]
  .sort((left, right) => Number(left.ordinal) - Number(right.ordinal) || left.fileName.localeCompare(right.fileName))
  .map((file) => ({
    ordinal: Number(file.ordinal),
    fileName: file.fileName,
    sourceKind: file.sourceKind,
    contentSha256: file.contentSha256,
    canonicalContentSha256: file.canonicalContentSha256,
    sourceAsOfBasis: file.sourceAsOfBasis,
    sourceAsOfMin: file.sourceAsOfMin,
    sourceAsOfMax: file.sourceAsOfMax,
    inputRows: Number(file.inputRows),
    parsedRows: Number(file.parsedRows),
    rejectedRows: Number(file.rejectedRows),
    parseStatus: file.parseStatus
  }));

const dailyCanonicalSourceHash = (sourceFiles) => hashCanonicalJsonSha256([...sourceFiles]
  .sort((left, right) => normalizeText(left?.fileName).localeCompare(normalizeText(right?.fileName)))
  .map((file) => ({
    fileName: normalizeText(file?.fileName),
    canonicalContentSha256: normalizeText(file?.canonicalContentSha256)
  })));

const outputHashRows = (value) => {
  if (Array.isArray(value)) return value.map(outputHashRows);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['updated', 'quoteRetrievedAt'].includes(key))
    .map(([key, nested]) => [key, outputHashRows(nested)]));
};

const stage0OutputHash = async (artifact) => hashCanonicalJsonSha256(outputHashRows({
  universe: artifact.universe,
  eligible_universe: artifact.eligible_universe,
  monitoring_universe: artifact.monitoring_universe
}));

const countUnclassified = (rows) => rows.filter((row) => EVIDENCE_FIELDS.some((field) => !normalizeText(row?.[field]))).length;

const producerSourceInventoryBasis = (sourceFiles) => [...sourceFiles]
  .sort((left, right) => normalizeText(left?.sourceKind).localeCompare(normalizeText(right?.sourceKind))
    || normalizeText(left?.fileName).localeCompare(normalizeText(right?.fileName)))
  .map((file) => ({
    fileName: normalizeText(file?.fileName),
    sourceKind: normalizeText(file?.sourceKind),
    contentSha256: normalizeText(file?.contentSha256),
    hashBasis: normalizeText(file?.hashBasis)
  }));

const countByClassification = (rows) => Object.fromEntries([...rows.reduce((counts, row) => {
  const classification = normalizeText(row?.classification).toUpperCase();
  counts.set(classification, (counts.get(classification) || 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));

const identityForSymbol = (identityMap, symbol) => {
  const sourceSymbol = normalizeText(symbol).toUpperCase();
  const mapped = identityMap?.[sourceSymbol];
  if (!mapped || typeof mapped !== 'object' || Array.isArray(mapped)) {
    return {
      effectiveSymbol: sourceSymbol,
      sourceSymbol,
      identifierLineageStatus: 'IDENTIFIER_LINEAGE_MISSING'
    };
  }
  const effectiveSymbol = normalizeText(mapped?.symbol).toUpperCase();
  const mappedSourceSymbol = normalizeText(mapped?.sourceSymbol || sourceSymbol).toUpperCase();
  const identifierLineageStatus = mappedSourceSymbol !== sourceSymbol || !effectiveSymbol
    ? 'IDENTIFIER_LINEAGE_AMBIGUOUS'
    : effectiveSymbol === sourceSymbol
      ? 'IDENTIFIER_LINEAGE_VERIFIED'
      : 'IDENTIFIER_ALIAS_RESOLVED';
  return {
    effectiveSymbol: effectiveSymbol || sourceSymbol,
    sourceSymbol: mappedSourceSymbol || sourceSymbol,
    identifierLineageStatus
  };
};

const exactValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const lineageFiscalEnd = (row) => normalizeText(
  row?.fiscalPeriod && typeof row.fiscalPeriod === 'object'
    ? row.fiscalPeriod.end
    : row?.fiscalPeriod
);

const lineageMatchKey = ({ identity, sourceDailyFile, metric, value, fiscalPeriod }) => canonicalJson([
  normalizeText(identity?.effectiveSymbol).toUpperCase(),
  normalizeText(identity?.sourceSymbol).toUpperCase(),
  normalizeText(identity?.identifierLineageStatus).toUpperCase(),
  normalizeText(sourceDailyFile),
  normalizeText(metric),
  exactValue(value),
  normalizeText(fiscalPeriod)
]);

const stripPrivateFinancialIdentifiers = (row) => {
  const {
    accession,
    accessionNumber,
    cik,
    tenDigitCik,
    candidateLineage,
    financialSourceRecordHashBasis,
    ...safe
  } = row || {};
  return safe;
};

const validateProducerArtifact = async (artifact, referenceTime) => {
  const rows = Array.isArray(artifact?.publicationLineageRows) ? artifact.publicationLineageRows : [];
  const files = Array.isArray(artifact?.sourceFileHashes) ? artifact.sourceFileHashes : [];
  const inventory = producerSourceInventoryBasis(files);
  const classifications = countByClassification(rows);
  const verifiedRows = rows.filter((row) => VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.classification).toUpperCase())).length;
  const notApplicableRows = classifications.FINANCIAL_LINEAGE_NOT_APPLICABLE || 0;
  const unresolvedRows = rows.length - verifiedRows - notApplicableRows;
  const ambiguousRows = classifications.FINANCIAL_LINEAGE_MULTIPLE_ACCESSIONS_AMBIGUOUS || 0;
  const responseHashes = artifact?.sourceResponseHashes || {};
  const requestCounts = artifact?.requestCounts || {};
  const referenceIso = normalizeIso(referenceTime);
  const generatedAt = normalizeIso(artifact?.generatedAt);
  const fileKeys = files.map((file) => `${normalizeText(file?.sourceKind)}:${normalizeText(file?.fileName)}`);
  const dailyGroups = files.filter((file) => file?.sourceKind === 'DAILY').map((file) => normalizeText(file?.fileName));
  const historyGroups = files.filter((file) => file?.sourceKind === 'HISTORY').map((file) => normalizeText(file?.fileName));
  const expectedDaily = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}_stocks_daily.json`);
  const expectedHistory = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}_stocks_history.json`);
  const responseKeys = ['secCompanyTickerMap', 'secCompanyfactsBulk', 'secSubmissionsBulk'];
  const invalid = artifact?.schemaVersion !== FINANCIAL_LINEAGE_SCHEMA_VERSION
    || artifact?.mode !== 'SHADOW_ONLY_STAGE0_FINANCIAL_PUBLICATION_LINEAGE'
    || artifact?.status !== 'STAGE0_SEC_FINANCIAL_LINEAGE_PRODUCER_PASS'
    || artifact?.artifactPersistenceStatus !== 'LOCAL_AND_DRIVE_PUBLISHED'
    || !generatedAt || !referenceIso || generatedAt > referenceIso
    || files.length !== 52 || Number(artifact?.sourceFileCount) !== files.length
    || new Set(fileKeys).size !== fileKeys.length
    || canonicalJson([...dailyGroups].sort()) !== canonicalJson(expectedDaily)
    || canonicalJson([...historyGroups].sort()) !== canonicalJson(expectedHistory)
    || files.some((file) => !SHA256_RE.test(normalizeText(file?.contentSha256))
      || file?.hashBasis !== 'CANONICAL_JSON_DOWNLOADED_FROM_DRIVE')
    || await hashCanonicalJsonSha256(inventory) !== artifact?.sourceInventorySha256
    || Number(artifact?.sourceInputRows) !== rows.length
    || Number(artifact?.sourceParsedRows) !== rows.length
    || Number(artifact?.sourceRejectedRows) !== unresolvedRows
    || canonicalJson(classifications) !== canonicalJson(artifact?.classificationCounts || {})
    || Number(artifact?.verifiedRows) !== verifiedRows
    || Number(artifact?.ambiguousRows) !== ambiguousRows
    || Number(artifact?.unresolvedRows) !== unresolvedRows
    || Number(artifact?.unknownOrUnclassifiedRows) !== 0
    || rows.some((row) => !FINANCIAL_LINEAGE_CLASSIFICATIONS.has(normalizeText(row?.classification).toUpperCase()))
    || responseKeys.some((key) => !SHA256_RE.test(normalizeText(responseHashes?.[key])))
    || Object.keys(responseHashes).sort().join(',') !== responseKeys.sort().join(',')
    || responseKeys.some((key) => Number(requestCounts?.[key]) !== 1)
    || Object.keys(requestCounts).sort().join(',') !== responseKeys.sort().join(',')
    || Number(artifact?.externalRequestCount) !== 3
    || artifact?.requestBudgetCompliant !== true
    || artifact?.requestBudgetExact !== true
    || Number(artifact?.retryCount) !== 0
    || artifact?.paginationUsed !== false
    || artifact?.rawResponseStored !== false
    || artifact?.stageProgressionGate !== 'STAGE0_LOCKED'
    || artifact?.recurringActivationAuthorized !== false
    || artifact?.canonicalSourceChanged !== false
    || artifact?.policyImpact !== 'NONE_REPORT_ONLY'
    || artifact?.Stage1To7PolicyChanged !== false
    || artifact?.brokerOrSidecarStateMutation !== false
    || !SHA256_RE.test(normalizeText(artifact?.identityMapSha256))
    || !SHA256_RE.test(normalizeText(artifact?.inputHash))
    || !SHA256_RE.test(normalizeText(artifact?.outputHash))
    || !SHA256_RE.test(normalizeText(artifact?.evidenceSha256))
    || rows.some((row) => normalizeText(row?.identityMapSha256) !== normalizeText(artifact?.identityMapSha256));
  if (invalid) throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
  return { rows, files, verifiedRows, notApplicableRows, unresolvedRows, ambiguousRows };
};

export const applyStage0FinancialPublicationLineage = async ({
  rows,
  sourceFiles,
  lineageArtifact,
  lineageArtifactFileName,
  lineageArtifactRawBytes,
  identityMap,
  identityMapRawBytes,
  referenceTime,
  quoteFreshnessMaxAgeMs = undefined
}) => {
  if (lineageArtifactFileName !== FINANCIAL_LINEAGE_FILE
    || !(lineageArtifactRawBytes instanceof Uint8Array)
    || !(identityMapRawBytes instanceof Uint8Array)
    || !identityMap || typeof identityMap !== 'object'
    || Array.isArray(identityMap)) {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
  }
  try {
    const rawArtifact = JSON.parse(new TextDecoder().decode(lineageArtifactRawBytes));
    const rawIdentityMap = JSON.parse(new TextDecoder().decode(identityMapRawBytes));
    if (canonicalJson(rawArtifact) !== canonicalJson(lineageArtifact)
      || canonicalJson(rawIdentityMap) !== canonicalJson(identityMap)) {
      throw new Error('raw_content_mismatch');
    }
  } catch {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
  }
  const producer = await validateProducerArtifact(lineageArtifact, referenceTime);
  const currentSourceFiles = Array.isArray(sourceFiles) ? sourceFiles : [];
  const currentDailyHashes = new Map(currentSourceFiles.map((file) => [
    normalizeText(file?.fileName),
    normalizeText(file?.canonicalContentSha256)
  ]));
  const sourceFileNames = new Set(currentDailyHashes.keys());
  const producerFileHash = new Map(producer.files.map((file) => [
    `${normalizeText(file?.sourceKind)}:${normalizeText(file?.fileName)}`,
    normalizeText(file?.contentSha256)
  ]));
  const producerDailyFiles = producer.files.filter((file) => file?.sourceKind === 'DAILY');
  if (currentDailyHashes.size !== COMPLETE_SOURCE_COUNT
    || producerDailyFiles.some((file) =>
      currentDailyHashes.get(normalizeText(file?.fileName)) !== normalizeText(file?.contentSha256))) {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_SOURCE_HASH_MISMATCH');
  }
  const identityMapCanonicalSha256 = await hashCanonicalJsonSha256(identityMap);
  if (identityMapCanonicalSha256 !== normalizeText(lineageArtifact?.identityMapSha256)) {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_IDENTITY_HASH_MISMATCH');
  }
  const lineageIndex = new Map();
  producer.rows.forEach((candidate, index) => {
    const metric = candidate?.financialMetricBasis && typeof candidate.financialMetricBasis === 'object'
      ? candidate.financialMetricBasis.metric
      : candidate?.financialMetricBasis;
    if (!sourceFileNames.has(normalizeText(candidate?.sourceDailyFile))
      || producerFileHash.get(`DAILY:${normalizeText(candidate?.sourceDailyFile)}`) !== normalizeText(candidate?.sourceDailyFileSha256)
      || producerFileHash.get(`HISTORY:${normalizeText(candidate?.sourceHistoryFile)}`) !== normalizeText(candidate?.sourceHistoryFileSha256)) {
      throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
    }
    const key = lineageMatchKey({
      identity: candidate?.identity,
      sourceDailyFile: candidate?.sourceDailyFile,
      metric,
      value: candidate?.value,
      fiscalPeriod: lineageFiscalEnd(candidate)
    });
    lineageIndex.set(key, [...(lineageIndex.get(key) || []), { candidate, index }]);
  });
  const used = new Set();
  const artifactContentSha256 = await hashBytesSha256(lineageArtifactRawBytes);
  const identityMapContentSha256 = await hashBytesSha256(identityMapRawBytes);
  const currentDailySourceInventorySha256 = await dailyCanonicalSourceHash(currentSourceFiles);
  const appliedRows = [];

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = stripPrivateFinancialIdentifiers(rawRow);
    const identity = identityForSymbol(identityMap, row?.symbol);
    const fiscalPeriod = normalizeText(row?.netIncomeAsOf ?? row?.netIncomeFiscalPeriod ?? row?.fiscalPeriod);
    const value = exactValue(row?.netIncomeEvidenceValue ?? row?.netIncome);
    const matches = lineageIndex.get(lineageMatchKey({
      identity,
      sourceDailyFile: row?.sourceDailyFile,
      metric: 'NET_INCOME',
      value,
      fiscalPeriod
    })) || [];
    if (matches.length !== 1 || used.has(matches[0]?.index)) {
      throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_ROW_MATCH_INVALID');
    }
    const { candidate, index } = matches[0];
    used.add(index);
    const classification = normalizeText(candidate?.classification).toUpperCase();
    const verified = VERIFIED_FINANCIAL_LINEAGE.has(classification);
    const publishedAt = normalizeIso(candidate?.financialPublishedAt);
    const retrievedAt = normalizeIso(candidate?.financialRetrievedAt);
    const periodStart = normalizeText(candidate?.fiscalPeriod?.start) || null;
    const periodEnd = lineageFiscalEnd(candidate) || null;
    const metric = candidate?.financialMetricBasis;
    const recordHashBasis = candidate?.financialSourceRecordHashBasis;
    const recordHashValid = verified
      && recordHashBasis && typeof recordHashBasis === 'object' && !Array.isArray(recordHashBasis)
      && await hashCanonicalJsonSha256(recordHashBasis) === normalizeText(candidate?.financialSourceRecordSha256)
      && normalizeText(recordHashBasis?.cik) === normalizeText(candidate?.tenDigitCik)
      && normalizeText(recordHashBasis?.accessionNumber) === normalizeText(candidate?.accessionNumber)
      && normalizeText(recordHashBasis?.form) === normalizeText(candidate?.form)
      && normalizeText(recordHashBasis?.taxonomy) === normalizeText(metric?.taxonomy)
      && normalizeText(recordHashBasis?.concept) === normalizeText(metric?.concept)
      && normalizeText(recordHashBasis?.unit) === normalizeText(metric?.unit)
      && exactValue(recordHashBasis?.value) === exactValue(candidate?.value)
      && normalizeText(recordHashBasis?.periodStart) === periodStart
      && normalizeText(recordHashBasis?.periodEnd) === periodEnd
      && normalizeIso(recordHashBasis?.acceptanceDateTime) === publishedAt
      && normalizeIso(recordHashBasis?.retrievedAt) === retrievedAt
      && canonicalJson(recordHashBasis?.sourceResponseHashes) === canonicalJson(lineageArtifact?.sourceResponseHashes);
    const verifiedContract = verified
      && candidate?.financialSource === 'YFINANCE_HISTORY_SEC_EDGAR_EXACT_LINEAGE'
      && candidate?.inputStatus === 'READY_FOR_EXACT_SEC_LINEAGE'
      && metric && typeof metric === 'object'
      && normalizeText(metric?.metric) === 'NET_INCOME'
      && normalizeText(metric?.sourceLabel) === normalizeText(candidate?.sourceMetricLabel)
      && ['sourceLabel', 'taxonomy', 'concept', 'unit'].every((key) => Boolean(normalizeText(metric?.[key])))
      && FINANCIAL_FORMS.has(normalizeText(candidate?.form))
      && periodStart && periodEnd
      && publishedAt && retrievedAt && normalizeIso(referenceTime)
      && publishedAt <= retrievedAt && retrievedAt <= normalizeIso(referenceTime)
      && recordHashValid;
    if (verified !== Boolean(verifiedContract)) {
      throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
    }
    const enriched = verified ? {
      ...row,
      effectiveSymbol: identity.effectiveSymbol,
      sourceSymbol: identity.sourceSymbol,
      identifierLineageStatus: identity.identifierLineageStatus,
      financialLineageClassification: classification,
      financialLineageArtifactSha256: artifactContentSha256,
      financialSource: candidate.financialSource,
      financialMetricBasis: { ...metric },
      fiscalPeriod: periodEnd,
      financialFiscalPeriodStart: periodStart,
      financialFiscalPeriodEnd: periodEnd,
      financialPublishedAt: publishedAt,
      financialRetrievedAt: retrievedAt,
      financialSourceRecordSha256: normalizeText(candidate.financialSourceRecordSha256)
    } : {
      ...row,
      effectiveSymbol: identity.effectiveSymbol,
      sourceSymbol: identity.sourceSymbol,
      identifierLineageStatus: identity.identifierLineageStatus,
      financialLineageClassification: classification,
      financialLineageArtifactSha256: artifactContentSha256,
      financialSource: null,
      fiscalPeriod: null,
      financialPublishedAt: null,
      financialRetrievedAt: null,
      financialSourceRecordSha256: null
    };
    appliedRows.push(classifyStage0RowEvidence(enriched, { referenceTime, quoteFreshnessMaxAgeMs }));
  }
  if (used.size !== producer.rows.length || appliedRows.length !== producer.rows.length) {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_ROW_MATCH_INVALID');
  }
  return {
    rows: appliedRows,
    contract: {
      status: 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED',
      artifactFileName: FINANCIAL_LINEAGE_FILE,
      artifactContentSha256,
      identityMapFileName: 'Ticker_ID_Mapping_Final.json',
      identityMapContentSha256,
      identityMapCanonicalSha256,
      producerSchemaVersion: lineageArtifact.schemaVersion,
      producerRunId: normalizeText(lineageArtifact.runId),
      producerEvidenceSha256: normalizeText(lineageArtifact.evidenceSha256),
      producerInputHash: normalizeText(lineageArtifact.inputHash),
      producerOutputHash: normalizeText(lineageArtifact.outputHash),
      producerSourceInventorySha256: normalizeText(lineageArtifact.sourceInventorySha256),
      producerIdentityMapSha256: normalizeText(lineageArtifact.identityMapSha256),
      sourceRows: producer.rows.length,
      matchedRows: appliedRows.length,
      verifiedRows: producer.verifiedRows,
      ambiguousRows: producer.ambiguousRows,
      unresolvedRows: producer.unresolvedRows,
      notApplicableRows: producer.notApplicableRows,
      rowCountParity: appliedRows.length === producer.rows.length,
      currentDailySourceHashParity: true,
      currentDailySourceInventorySha256,
      unknownOrUnclassifiedRows: 0,
      rawResponseStored: false,
      canonicalSourceChanged: false,
      policyImpact: 'NONE_REPORT_ONLY',
      Stage1To7PolicyChanged: false,
      brokerOrSidecarStateMutation: false
    }
  };
};

export const buildStage0Artifact = async ({
  generatedAt,
  sourceFiles,
  universe,
  eligibleUniverse,
  monitoringUniverse,
  financialLineageContract,
  manifestBase = {}
}) => {
  const orderedSourceFiles = [...sourceFiles]
    .sort((left, right) => Number(left.ordinal) - Number(right.ordinal) || left.fileName.localeCompare(right.fileName));
  const sourceInventorySha256 = await hashCanonicalJsonSha256(sourceInventoryBasis(orderedSourceFiles));
  const currentDailySourceInventorySha256 = await dailyCanonicalSourceHash(orderedSourceFiles);
  if (financialLineageContract?.status !== 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED'
    || financialLineageContract?.rowCountParity !== true
    || financialLineageContract?.currentDailySourceHashParity !== true
    || financialLineageContract?.currentDailySourceInventorySha256 !== currentDailySourceInventorySha256
    || !SHA256_RE.test(normalizeText(financialLineageContract?.artifactContentSha256))
    || !SHA256_RE.test(normalizeText(financialLineageContract?.identityMapContentSha256))
    || !SHA256_RE.test(normalizeText(financialLineageContract?.identityMapCanonicalSha256))) {
    throw new Error('STAGE0_SEC_FINANCIAL_LINEAGE_CONTRACT_INVALID');
  }
  const inputHash = await hashCanonicalJsonSha256({
    sourceInventorySha256,
    financialLineageArtifactSha256: financialLineageContract.artifactContentSha256,
    identityMapContentSha256: financialLineageContract.identityMapContentSha256
  });
  const artifact = {
    manifest: {},
    universe: [...universe],
    eligible_universe: [...eligibleUniverse],
    monitoring_universe: [...monitoringUniverse]
  };
  const outputHash = await stage0OutputHash(artifact);
  const unknownOrUnclassifiedRows = countUnclassified(artifact.universe);
  artifact.manifest = {
    ...manifestBase,
    schemaVersion: STAGE0_SCHEMA_VERSION,
    runId: `stage0-${inputHash.slice(0, 16)}`,
    generatedAt: normalizeIso(generatedAt),
    sourceStage: 'stage0_universe',
    sourceContractStatus: 'STAGE0_SOURCE_TRUTH_COMPLETE',
    stageProgressionGate: 'STAGE0_LOCKED',
    sourceFileCount: orderedSourceFiles.length,
    sourceInputRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.inputRows || 0), 0),
    sourceParsedRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.parsedRows || 0), 0),
    sourceRejectedRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.rejectedRows || 0), 0),
    sourceInventorySha256,
    inputHash,
    outputHash,
    hashBasis: {
      sourceInventorySha256: 'CANONICAL_ORDERED_SOURCE_IDENTITY_RAW_AND_CANONICAL_CONTENT_SHA256_EXCLUDING_RETRIEVED_AT',
      inputHash: 'SOURCE_INVENTORY_SHA256_PLUS_EXACT_FINANCIAL_LINEAGE_AND_IDENTITY_MAP_CONTENT_SHA256',
      outputHash: 'CANONICAL_STAGE0_ROWS_EXCLUDING_UPDATED_AND_QUOTE_RETRIEVED_AT'
    },
    sourceFiles: orderedSourceFiles,
    financialLineageContract: { ...financialLineageContract },
    inputCount: artifact.universe.length,
    eligibleCount: artifact.eligible_universe.length,
    excludedByInstrumentType: artifact.monitoring_universe.length,
    count: artifact.universe.length,
    unknownOrUnclassifiedRows
  };
  return artifact;
};

const pushReason = (reasons, condition, reason) => {
  if (condition) reasons.add(reason);
};

export const validateStage0ArtifactForStage1 = async (artifact = {}) => {
  const reasons = new Set();
  const manifest = artifact?.manifest || {};
  const sourceFiles = Array.isArray(manifest?.sourceFiles) ? manifest.sourceFiles : [];
  const universe = Array.isArray(artifact?.universe) ? artifact.universe : [];
  const eligibleUniverse = Array.isArray(artifact?.eligible_universe) ? artifact.eligible_universe : [];
  const monitoringUniverse = Array.isArray(artifact?.monitoring_universe) ? artifact.monitoring_universe : [];

  pushReason(reasons, manifest?.schemaVersion !== STAGE0_SCHEMA_VERSION, 'MANIFEST_SCHEMA_INVALID');
  pushReason(reasons, !normalizeIso(manifest?.generatedAt) || !normalizeText(manifest?.runId), 'MANIFEST_IDENTITY_INVALID');
  pushReason(reasons, manifest?.sourceContractStatus !== 'STAGE0_SOURCE_TRUTH_COMPLETE', 'SOURCE_CONTRACT_INCOMPLETE');
  pushReason(reasons, manifest?.stageProgressionGate !== 'STAGE0_LOCKED', 'STAGE_PROGRESSION_GATE_INVALID');
  pushReason(reasons, sourceFiles.length !== COMPLETE_SOURCE_COUNT || Number(manifest?.sourceFileCount) !== sourceFiles.length, 'SOURCE_FILE_COUNT_MISMATCH');
  const names = sourceFiles.map((file) => normalizeText(file?.fileName)).filter(Boolean);
  const ordinals = sourceFiles.map((file) => Number(file?.ordinal));
  const orderedOrdinals = [...ordinals].sort((left, right) => left - right);
  pushReason(reasons, new Set(names).size !== names.length || new Set(ordinals).size !== ordinals.length, 'DUPLICATE_SOURCE_IDENTITY');
  pushReason(reasons,
    sourceFiles.some((file) => !normalizeText(file?.fileName) || !normalizeText(file?.sourceKind) || !Number.isInteger(Number(file?.ordinal)))
      || orderedOrdinals.some((ordinal, index) => ordinal !== index + 1),
    'SOURCE_IDENTITY_INVALID');
  pushReason(reasons, sourceFiles.some((file) => file?.sourceAsOfBasis !== 'ROW_QUOTE_TIMESTAMP'), 'SOURCE_ASOF_BASIS_INVALID');
  pushReason(reasons, sourceFiles.some((file) => !SHA256_RE.test(normalizeText(file?.contentSha256))), 'SOURCE_CONTENT_HASH_MISSING');
  pushReason(reasons, sourceFiles.some((file) => !SHA256_RE.test(normalizeText(file?.canonicalContentSha256))), 'SOURCE_CONTENT_HASH_MISSING');
  pushReason(reasons, sourceFiles.some((file) => !VALID_PARSE_STATUSES.has(normalizeText(file?.parseStatus).toUpperCase())), 'SOURCE_PARSE_FAILURE');
  pushReason(reasons, sourceFiles.some((file) => !normalizeIso(file?.retrievedAt)), 'SOURCE_RETRIEVED_AT_INVALID');
  pushReason(reasons, sourceFiles.some((file) => ![
    'SOURCE_ASOF_VERIFIED',
    'SOURCE_ASOF_PARTIAL',
    'SOURCE_ASOF_UNAVAILABLE',
    'SOURCE_ASOF_INVALID'
  ].includes(normalizeText(file?.sourceAsOfStatus).toUpperCase())), 'SOURCE_ASOF_STATUS_INVALID');
  pushReason(reasons, sourceFiles.some((file) => {
    const status = normalizeText(file?.sourceAsOfStatus).toUpperCase();
    const hasRange = Boolean(normalizeIso(file?.sourceAsOfMin) && normalizeIso(file?.sourceAsOfMax));
    return ['SOURCE_ASOF_VERIFIED', 'SOURCE_ASOF_PARTIAL', 'SOURCE_ASOF_INVALID'].includes(status) && !hasRange;
  }), 'SOURCE_ASOF_RANGE_INVALID');
  pushReason(reasons, sourceFiles.some((file) => Number(file?.parsedRows) + Number(file?.rejectedRows) !== Number(file?.inputRows)), 'SOURCE_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.sourceInputRows) !== sourceFiles.reduce((sum, file) => sum + Number(file?.inputRows || 0), 0), 'SOURCE_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.sourceParsedRows) !== sourceFiles.reduce((sum, file) => sum + Number(file?.parsedRows || 0), 0), 'SOURCE_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.sourceRejectedRows) !== sourceFiles.reduce((sum, file) => sum + Number(file?.rejectedRows || 0), 0), 'SOURCE_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.sourceParsedRows) !== universe.length, 'SOURCE_TO_STAGE0_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.inputCount) !== universe.length, 'STAGE0_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.eligibleCount) !== eligibleUniverse.length, 'STAGE0_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.excludedByInstrumentType) !== monitoringUniverse.length, 'STAGE0_ROW_COUNT_MISMATCH');
  pushReason(reasons, eligibleUniverse.length + monitoringUniverse.length !== universe.length, 'STAGE0_ROW_COUNT_MISMATCH');
  pushReason(reasons, Number(manifest?.unknownOrUnclassifiedRows) !== 0 || countUnclassified(universe) !== 0, 'EVIDENCE_CLASSIFICATION_INCOMPLETE');

  if (sourceFiles.length > 0) {
    const inventoryHash = await hashCanonicalJsonSha256(sourceInventoryBasis(sourceFiles));
    pushReason(reasons, !SHA256_RE.test(normalizeText(manifest?.sourceInventorySha256)), 'SOURCE_INVENTORY_HASH_MISSING');
    pushReason(reasons, inventoryHash !== manifest?.sourceInventorySha256, 'SOURCE_INVENTORY_HASH_MISMATCH');
    const expectedInputHash = await hashCanonicalJsonSha256({
      sourceInventorySha256: inventoryHash,
      financialLineageArtifactSha256: manifest?.financialLineageContract?.artifactContentSha256,
      identityMapContentSha256: manifest?.financialLineageContract?.identityMapContentSha256
    });
    pushReason(reasons, expectedInputHash !== manifest?.inputHash, 'SOURCE_INVENTORY_HASH_MISMATCH');
    pushReason(reasons, manifest?.runId !== `stage0-${expectedInputHash.slice(0, 16)}`, 'MANIFEST_IDENTITY_INVALID');
  }
  const lineage = manifest?.financialLineageContract || {};
  const verifiedRows = universe.filter((row) => VERIFIED_FINANCIAL_LINEAGE.has(normalizeText(row?.financialLineageClassification).toUpperCase())).length;
  const notApplicableRows = universe.filter((row) => normalizeText(row?.financialLineageClassification).toUpperCase() === 'FINANCIAL_LINEAGE_NOT_APPLICABLE').length;
  const unresolvedRows = universe.length - verifiedRows - notApplicableRows;
  const ambiguousRows = universe.filter((row) => normalizeText(row?.financialLineageClassification).toUpperCase() === 'FINANCIAL_LINEAGE_MULTIPLE_ACCESSIONS_AMBIGUOUS').length;
  pushReason(reasons,
    lineage?.status !== 'STAGE0_SEC_FINANCIAL_LINEAGE_CONSUMED'
      || lineage?.artifactFileName !== FINANCIAL_LINEAGE_FILE
      || !SHA256_RE.test(normalizeText(lineage?.artifactContentSha256))
      || !SHA256_RE.test(normalizeText(lineage?.identityMapContentSha256))
      || !SHA256_RE.test(normalizeText(lineage?.identityMapCanonicalSha256))
      || lineage?.currentDailySourceInventorySha256 !== await dailyCanonicalSourceHash(sourceFiles)
      || !SHA256_RE.test(normalizeText(lineage?.producerEvidenceSha256))
      || !SHA256_RE.test(normalizeText(lineage?.producerInputHash))
      || !SHA256_RE.test(normalizeText(lineage?.producerOutputHash))
      || lineage?.rowCountParity !== true
      || lineage?.currentDailySourceHashParity !== true
      || Number(lineage?.sourceRows) !== universe.length
      || Number(lineage?.matchedRows) !== universe.length
      || Number(lineage?.verifiedRows) !== verifiedRows
      || Number(lineage?.ambiguousRows) !== ambiguousRows
      || Number(lineage?.unresolvedRows) !== unresolvedRows
      || Number(lineage?.notApplicableRows) !== notApplicableRows
      || Number(lineage?.unknownOrUnclassifiedRows) !== 0
      || lineage?.rawResponseStored !== false
      || lineage?.canonicalSourceChanged !== false
      || lineage?.policyImpact !== 'NONE_REPORT_ONLY'
      || lineage?.Stage1To7PolicyChanged !== false
      || lineage?.brokerOrSidecarStateMutation !== false,
    'FINANCIAL_LINEAGE_CONTRACT_INVALID');
  pushReason(reasons, universe.some((row) => {
    const classification = normalizeText(row?.financialLineageClassification).toUpperCase();
    const verified = VERIFIED_FINANCIAL_LINEAGE.has(classification);
    return !FINANCIAL_LINEAGE_CLASSIFICATIONS.has(classification)
      || normalizeText(row?.financialLineageArtifactSha256) !== normalizeText(lineage?.artifactContentSha256)
      || (verified
        ? row?.financialEvidenceStatus !== 'FINANCIAL_EVIDENCE_VERIFIED'
          || !SHA256_RE.test(normalizeText(row?.financialSourceRecordSha256))
        : row?.financialEvidenceStatus === 'FINANCIAL_EVIDENCE_VERIFIED'
          || row?.financialSourceRecordSha256 !== null)
      || ['accession', 'accessionNumber', 'cik', 'tenDigitCik'].some((key) => key in row);
  }), 'FINANCIAL_LINEAGE_ROW_INVALID');
  const outputHash = await stage0OutputHash({ universe, eligible_universe: eligibleUniverse, monitoring_universe: monitoringUniverse });
  pushReason(reasons, outputHash !== manifest?.outputHash, 'OUTPUT_HASH_MISMATCH');

  return {
    valid: reasons.size === 0,
    reasons: [...reasons].sort(),
    manifest,
    universe,
    eligibleUniverse,
    monitoringUniverse
  };
};
