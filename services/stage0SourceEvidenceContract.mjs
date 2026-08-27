const SHA256_RE = /^[a-f0-9]{64}$/;
const COMPLETE_SOURCE_COUNT = 26;
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

const sha256Bytes = async (bytes) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('STAGE0_SHA256_UNAVAILABLE');
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const hashTextSha256 = async (text) => sha256Bytes(new TextEncoder().encode(String(text)));
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
      ? await sha256Bytes(rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes))
      : await hashTextSha256(rawText),
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
  const referenceIso = normalizeIso(referenceTime);

  let financialEvidenceStatus = 'FINANCIAL_EVIDENCE_VERIFIED';
  if (!financialSource) financialEvidenceStatus = 'FINANCIAL_SOURCE_MISSING';
  else if (!fiscalPeriod) financialEvidenceStatus = 'FISCAL_PERIOD_MISSING';
  else if (rawPublishedAt === null || rawPublishedAt === undefined || rawPublishedAt === '') {
    financialEvidenceStatus = 'PUBLICATION_TIMESTAMP_MISSING';
  } else if (!financialPublishedAt || !referenceIso || financialPublishedAt > referenceIso) {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_INVALID';
  } else if (normalizeText(row?.financialFreshnessStatus).toUpperCase() === 'STALE') {
    financialEvidenceStatus = 'FINANCIAL_EVIDENCE_STALE';
  }

  return {
    financialSource,
    fiscalPeriod,
    financialPublishedAt,
    financialRetrievedAt: normalizeIso(row?.financialRetrievedAt),
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
    sourceAsOfBasis: file.sourceAsOfBasis,
    sourceAsOfMin: file.sourceAsOfMin,
    sourceAsOfMax: file.sourceAsOfMax,
    inputRows: Number(file.inputRows),
    parsedRows: Number(file.parsedRows),
    rejectedRows: Number(file.rejectedRows),
    parseStatus: file.parseStatus
  }));

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

export const buildStage0Artifact = async ({
  generatedAt,
  sourceFiles,
  universe,
  eligibleUniverse,
  monitoringUniverse,
  manifestBase = {}
}) => {
  const orderedSourceFiles = [...sourceFiles]
    .sort((left, right) => Number(left.ordinal) - Number(right.ordinal) || left.fileName.localeCompare(right.fileName));
  const sourceInventorySha256 = await hashCanonicalJsonSha256(sourceInventoryBasis(orderedSourceFiles));
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
    schemaVersion: 'stage0-source-truth-v1',
    runId: `stage0-${sourceInventorySha256.slice(0, 16)}`,
    generatedAt: normalizeIso(generatedAt),
    sourceStage: 'stage0_universe',
    sourceContractStatus: 'STAGE0_SOURCE_TRUTH_COMPLETE',
    sourceFileCount: orderedSourceFiles.length,
    sourceInputRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.inputRows || 0), 0),
    sourceParsedRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.parsedRows || 0), 0),
    sourceRejectedRows: orderedSourceFiles.reduce((sum, file) => sum + Number(file.rejectedRows || 0), 0),
    sourceInventorySha256,
    inputHash: sourceInventorySha256,
    outputHash,
    hashBasis: {
      sourceInventorySha256: 'CANONICAL_ORDERED_SOURCE_IDENTITY_AND_RAW_CONTENT_SHA256_EXCLUDING_RETRIEVED_AT',
      inputHash: 'SOURCE_INVENTORY_SHA256',
      outputHash: 'CANONICAL_STAGE0_ROWS_EXCLUDING_UPDATED_AND_QUOTE_RETRIEVED_AT'
    },
    sourceFiles: orderedSourceFiles,
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

  pushReason(reasons, manifest?.schemaVersion !== 'stage0-source-truth-v1', 'MANIFEST_SCHEMA_INVALID');
  pushReason(reasons, !normalizeIso(manifest?.generatedAt) || !normalizeText(manifest?.runId), 'MANIFEST_IDENTITY_INVALID');
  pushReason(reasons, manifest?.sourceContractStatus !== 'STAGE0_SOURCE_TRUTH_COMPLETE', 'SOURCE_CONTRACT_INCOMPLETE');
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
    pushReason(reasons, inventoryHash !== manifest?.sourceInventorySha256 || manifest?.inputHash !== manifest?.sourceInventorySha256, 'SOURCE_INVENTORY_HASH_MISMATCH');
    pushReason(reasons, manifest?.runId !== `stage0-${inventoryHash.slice(0, 16)}`, 'MANIFEST_IDENTITY_INVALID');
  }
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
