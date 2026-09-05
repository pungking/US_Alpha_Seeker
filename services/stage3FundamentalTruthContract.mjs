import { hashCanonicalJsonSha256 } from './stage0SourceEvidenceContract.mjs';
import { validateStage2ArtifactForStage3 } from './stage2QualityTruthContract.mjs';

const SHA256_RE = /^[a-f0-9]{64}$/;
const SCHEMA_VERSION = 'stage3-fundamental-truth-v1';
const VERIFIED_FINANCIAL_LINEAGE = new Set([
  'FINANCIAL_LINEAGE_VERIFIED_ORIGINAL',
  'FINANCIAL_LINEAGE_VERIFIED_AMENDMENT',
  'FINANCIAL_LINEAGE_DUPLICATE_SAME_ACCESSION_COLLAPSED'
]);
const VERIFIED_IDENTIFIERS = new Set(['IDENTIFIER_LINEAGE_VERIFIED', 'IDENTIFIER_ALIAS_RESOLVED']);
const STATUSES = new Set([
  'STAGE3_FUNDAMENTAL_EVIDENCE_PASS',
  'STAGE3_SOURCE_EVIDENCE_BLOCKED',
  'STAGE3_IDENTIFIER_LINEAGE_BLOCKED',
  'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED',
  'STAGE3_HISTORY_LINEAGE_BLOCKED',
  'STAGE3_MODEL_CONTRACT_BLOCKED',
  'STAGE3_COMPUTATION_MISMATCH_BLOCKED',
  'STAGE3_SYNTHETIC_INPUT_BLOCKED'
]);
const SYNTHETIC_FLAGS = [
  'cashflowProxyUsed',
  'salesProxyUsed',
  'profitMarginDefaultUsed',
  'bookValueProxyUsed',
  'intrinsicValueFallbackUsed',
  'roicProxyUsed',
  'roicDebtRatioProxyUsed',
  'zScoreFallbackUsed',
  'sectorBaselineImputationUsed'
];
const SOURCE_FIELDS = [
  'instrumentType', 'analysisEligible',
  'sector', 'industry', 'price', 'eps', 'earningsPerShare', 'marketCap', 'marketValue',
  'netIncome', 'netIncomeCommonStockholders', 'netIncomeSource', 'debtToEquity',
  'totalEquity', 'totalStockholdersEquity', 'totalDebt', 'longTermDebt',
  'shortLongTermDebtTotal', 'longTermDebtAndCapitalLeaseObligation',
  'totalDebtAndCapitalLeaseObligation', 'pe', 'per', 'revenue', 'totalRevenue', 'psr',
  'operatingCashflow', 'operatingCashFlow', 'revenueGrowth', 'grossProfit',
  'bookValuePerShare', 'zScoreProxy',
  'financialEvidenceStatus', 'financialSource', 'fiscalPeriod', 'financialPublishedAt',
  'financialRetrievedAt', 'financialLineageClassification', 'financialSourceRecordSha256',
  'financialLineageArtifactSha256', 'identifierEvidenceStatus',
  'historyEvidenceStatus', 'historySourceFileSha256', 'historySourceRecordSha256',
  'stage2EvidenceStatus', 'zScoreModel', 'qualityFactorScore', 'qualityFactorAdjustment',
  'targetScoreImpact', 'historicalEvidenceNormalized',
  'regimeState', 'regimeVixRef', 'regimeAdjustment', 'regimeEvidenceStatus'
];

const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const iso = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const raw = text(value);
  const milliseconds = typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(raw)
    ? (Number(value) >= 1e12 ? Number(value) : Number(value) * 1000)
    : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? Date.parse(raw) : NaN;
  return Number.isFinite(milliseconds) && milliseconds > 0 ? new Date(milliseconds).toISOString() : null;
};
const clamp = (value) => Math.max(0, Math.min(100, value));
const close = (left, right, tolerance = 0.011) => finite(left) !== null
  && finite(right) !== null
  && Math.abs(Number(left) - Number(right)) <= tolerance;
const countBy = (rows, field) => Object.fromEntries([...rows.reduce((counts, row) => {
  const value = text(row?.[field]) || 'UNCLASSIFIED';
  counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}, new Map())].sort(([left], [right]) => left.localeCompare(right)));
const uniqueIdentities = (rows) => {
  const identities = rows.map((row) => text(row?.symbol));
  return identities.every(Boolean) && new Set(identities).size === identities.length;
};
const sameIdentitySet = (left, right) => {
  const a = left.map((row) => text(row?.symbol)).sort();
  const b = right.map((row) => text(row?.symbol)).sort();
  return a.length === b.length && a.every((identity, index) => identity === b[index]);
};

const formulaContract = Object.freeze({
  formulaVersion: 'stage3-fundamental-formula-v1',
  fundamentalWeights: { valuation: 0.4, safety: 0.3, profitability: 0.2, growth: 0.1 },
  factorAdjustmentParts: ['trend', 'seasonality', 'regime', 'quality'],
  topSectorFraction: 0.3,
  topSectorMemberFraction: 0.2,
  preIntegrityFundamentalScore: 'clamp(fundamentalBaseScore + factorAdjustmentTotal)',
  preSectorFundamentalScore: 'clamp(preIntegrityFundamentalScore - integrityPenalty)',
  finalFundamentalScore: 'clamp(preSectorFundamentalScore + sectorScore + sectorRankBonus)',
  compositeAlpha: 'clamp(qualityScore * 0.3 + finalFundamentalScore * 0.7)',
  syntheticInputsEligible: false,
  modelPolicyChanged: false
});

const sectorAdjustments = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const sector = text(row?.sector) || 'Unknown';
    if (!groups.has(sector)) groups.set(sector, []);
    groups.get(sector).push(row);
  }
  const stats = [...groups].map(([sector, group]) => ({
    sector,
    average: group.reduce((sum, row) => sum + Number(row?.stage3Computation?.preSectorFundamentalScore || 0), 0) / group.length
  })).sort((left, right) => right.average - left.average || left.sector.localeCompare(right.sector));
  const topSectorCount = Math.max(1, Math.ceil(stats.length * formulaContract.topSectorFraction));
  const topSectors = new Set(stats.slice(0, topSectorCount).map((row) => row.sector));
  const result = new Map();
  for (const [sector, group] of groups) {
    const ranked = [...group].sort((left, right) =>
      Number(right?.stage3Computation?.preSectorFundamentalScore || 0) - Number(left?.stage3Computation?.preSectorFundamentalScore || 0)
      || text(left?.symbol).localeCompare(text(right?.symbol))
    );
    const memberCount = Math.max(1, Math.ceil(ranked.length * formulaContract.topSectorMemberFraction));
    ranked.forEach((row, index) => {
      const hasCashflowRisk = Boolean(row?.isCashFlowWarning || row?.hasNonPositiveReportedCashflow || row?.cashflowProxyUsed);
      result.set(text(row?.symbol), {
        sectorScore: topSectors.has(sector) ? (hasCashflowRisk ? 1 : 2) : 0,
        sectorRankBonus: index < memberCount && !hasCashflowRisk ? 4 : 0
      });
    });
  }
  return result;
};

const computationValid = (row, expectedSectorAdjustment) => {
  const value = row?.stage3Computation || {};
  const components = value.componentScores || {};
  const adjustments = value.factorAdjustments || {};
  const base = finite(value.fundamentalBaseScore);
  const factors = finite(value.factorAdjustmentTotal);
  const preIntegrity = finite(value.preIntegrityFundamentalScore);
  const penalty = finite(value.integrityPenalty);
  const preSector = finite(value.preSectorFundamentalScore);
  const sector = finite(value.sectorScore);
  const rank = finite(value.sectorRankBonus);
  const final = finite(value.finalFundamentalScore);
  const quality = finite(value.qualityScore);
  const composite = finite(value.compositeAlpha);
  const expectedBase = finite(components.valuation) * formulaContract.fundamentalWeights.valuation
    + finite(components.safety) * formulaContract.fundamentalWeights.safety
    + finite(components.profitability) * formulaContract.fundamentalWeights.profitability
    + finite(components.growth) * formulaContract.fundamentalWeights.growth;
  const expectedFactors = formulaContract.factorAdjustmentParts.reduce((sum, key) => sum + Number(finite(adjustments[key]) || 0), 0);
  if ([base, factors, preIntegrity, penalty, preSector, sector, rank, final, quality, composite,
    components.valuation, components.safety, components.profitability, components.growth,
    adjustments.trend, adjustments.seasonality, adjustments.regime, adjustments.quality].some((item) => finite(item) === null)) return false;
  return close(base, expectedBase)
    && close(factors, expectedFactors)
    && close(preIntegrity, clamp(base + factors))
    && close(preSector, clamp(preIntegrity - penalty))
    && close(sector, expectedSectorAdjustment?.sectorScore)
    && close(rank, expectedSectorAdjustment?.sectorRankBonus)
    && close(final, clamp(preSector + sector + rank))
    && close(composite, clamp(quality * 0.3 + final * 0.7))
    && close(row.fundamentalScore, final)
    && close(row.fundamentalScoreBeforeSectorBonus, preSector)
    && close(row.sectorScore, sector)
    && close(row.sectorRankBonus, rank)
    && close(row.qualityScore, quality)
    && close(row.compositeAlpha, composite);
};

const hasSyntheticInput = (row) => row?.isImputed === true
  || text(row?.auditSource).toUpperCase() === 'AI'
  || SYNTHETIC_FLAGS.some((field) => row?.stage3Computation?.syntheticInputFlags?.[field] === true);
const sourceFieldsMatch = (row, sourceRow, sourceRowSha256) => Boolean(sourceRow)
  && SHA256_RE.test(text(row?.sourceStage2RowSha256))
  && row.sourceStage2RowSha256 === sourceRowSha256
  && SOURCE_FIELDS.every((field) => JSON.stringify(row?.[field] ?? null) === JSON.stringify(sourceRow?.[field] ?? null));

const classifyRow = (row, decisionAt, expectedSectorAdjustment) => {
  const publishedAt = iso(row?.financialPublishedAt);
  const retrievedAt = iso(row?.financialRetrievedAt);
  const decisionIso = iso(decisionAt);
  if (publishedAt && decisionIso && publishedAt > decisionIso) return 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED';
  if (retrievedAt && decisionIso && retrievedAt > decisionIso) return 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED';
  if (publishedAt && retrievedAt && publishedAt > retrievedAt) return 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED';
  if (!VERIFIED_IDENTIFIERS.has(text(row?.identifierEvidenceStatus))) return 'STAGE3_IDENTIFIER_LINEAGE_BLOCKED';
  if (!SHA256_RE.test(text(row?.sourceStage2RowSha256)) || row?.stage3SourceEvidenceMatch !== true) {
    return 'STAGE3_SOURCE_EVIDENCE_BLOCKED';
  }
  if (text(row?.financialEvidenceStatus) !== 'FINANCIAL_EVIDENCE_VERIFIED'
    || !text(row?.financialSource)
    || !text(row?.fiscalPeriod)
    || !publishedAt
    || !retrievedAt
    || !VERIFIED_FINANCIAL_LINEAGE.has(text(row?.financialLineageClassification))
    || !SHA256_RE.test(text(row?.financialSourceRecordSha256))
    || !SHA256_RE.test(text(row?.financialLineageArtifactSha256))) return 'STAGE3_SOURCE_EVIDENCE_BLOCKED';
  if (text(row?.stage3HistoryLineageStatus) !== 'STAGE3_HISTORY_EXACT_STAGE2_RECORD'
    || text(row?.historyEvidenceStatus) !== 'HISTORY_EVIDENCE_VERIFIED'
    || row?.historicalEvidenceNormalized !== false
    || !SHA256_RE.test(text(row?.historySourceFileSha256))
    || !SHA256_RE.test(text(row?.historySourceRecordSha256))
    || row?.stage3HistoryRecordSha256 !== row?.historySourceRecordSha256) return 'STAGE3_HISTORY_LINEAGE_BLOCKED';
  const expectedModel = text(row?.zScoreModel) === 'ALTMAN_Z'
    ? 'NON_FINANCIAL'
    : text(row?.zScoreModel) === 'FINANCIAL_STABILITY' ? 'FINANCIAL' : null;
  if (!expectedModel || text(row?.stage3FundamentalModel) !== expectedModel
    || text(row?.stage2EvidenceStatus) !== 'STAGE2_EVIDENCE_COMPLETE'
    || Number(row?.targetScoreImpact) !== 0) return 'STAGE3_MODEL_CONTRACT_BLOCKED';
  if (!computationValid(row, expectedSectorAdjustment)) return 'STAGE3_COMPUTATION_MISMATCH_BLOCKED';
  if (hasSyntheticInput(row)) return 'STAGE3_SYNTHETIC_INPUT_BLOCKED';
  return 'STAGE3_FUNDAMENTAL_EVIDENCE_PASS';
};

const evaluationProjection = (rows) => rows.map((row) => ({
  symbol: row.symbol,
  stage3DecisionStatus: row.stage3DecisionStatus,
  stage3AnalysisEligible: row.stage3AnalysisEligible,
  stage3SourceEvidenceMatch: row.stage3SourceEvidenceMatch,
  sourceStage2RowSha256: row.sourceStage2RowSha256,
  financialLineageClassification: row.financialLineageClassification,
  financialPublishedAt: row.financialPublishedAt,
  financialRetrievedAt: row.financialRetrievedAt,
  historySourceRecordSha256: row.historySourceRecordSha256,
  stage3HistoryLineageStatus: row.stage3HistoryLineageStatus,
  stage3HistoryRecordSha256: row.stage3HistoryRecordSha256,
  stage3FundamentalModel: row.stage3FundamentalModel,
  stage3Computation: row.stage3Computation,
  isImputed: row.isImputed,
  auditSource: row.auditSource
}));

const inputHashBasis = (manifest) => ({
  sourceStage2ContentSha256: manifest.sourceStage2ContentSha256,
  sourceStage2InputHash: manifest.sourceStage2InputHash,
  sourceStage2OutputHash: manifest.sourceStage2OutputHash,
  sourceStage2EvaluationHash: manifest.sourceStage2EvaluationHash,
  sourceStage2HistorySourceInventorySha256: manifest.sourceStage2HistorySourceInventorySha256,
  sourceStage2RegimeContentSha256: manifest.sourceStage2RegimeContentSha256,
  formulaContractSha256: manifest.formulaContractSha256,
  evaluationHash: manifest.evaluationHash,
  inputCount: Number(manifest.inputCount),
  statusCounts: manifest.statusCounts,
  decisionAt: manifest.decisionAt
});

const addReason = (reasons, condition, reason) => { if (condition) reasons.add(reason); };

export const buildStage3Artifact = async ({
  generatedAt,
  sourceStage2File,
  sourceStage2ContentSha256,
  sourceStage2Artifact,
  rows = []
}) => {
  const decisionAt = iso(generatedAt);
  const sourceValidation = await validateStage2ArtifactForStage3(sourceStage2Artifact);
  if (!decisionAt || !text(sourceStage2File) || !SHA256_RE.test(text(sourceStage2ContentSha256))
    || !sourceValidation.valid || sourceValidation.manifest.decisionAt > decisionAt
    || !Array.isArray(rows) || !uniqueIdentities(rows)
    || !sameIdentitySet(rows, sourceValidation.eliteUniverse)) {
    throw new Error('STAGE3_SOURCE_STAGE2_CONTRACT_INVALID');
  }
  const expectedSectorAdjustments = sectorAdjustments(rows);
  const sourceRowsByIdentity = new Map(sourceValidation.eliteUniverse.map((row) => [text(row?.symbol), row]));
  const sourceRowHashes = new Map(await Promise.all(sourceValidation.eliteUniverse.map(async (row) => [
    text(row?.symbol),
    await hashCanonicalJsonSha256(row)
  ])));
  const evaluatedRows = rows.map((row) => {
    const stage3SourceEvidenceMatch = sourceFieldsMatch(
      row,
      sourceRowsByIdentity.get(text(row?.symbol)),
      sourceRowHashes.get(text(row?.symbol))
    );
    const candidate = { ...row, stage3SourceEvidenceMatch };
    const stage3DecisionStatus = classifyRow(
      candidate,
      decisionAt,
      expectedSectorAdjustments.get(text(row?.symbol))
    );
    return {
      ...candidate,
      stage3DecisionStatus,
      stage3AnalysisEligible: stage3DecisionStatus === 'STAGE3_FUNDAMENTAL_EVIDENCE_PASS'
    };
  });
  const statusCounts = countBy(evaluatedRows, 'stage3DecisionStatus');
  const [formulaContractSha256, evaluationHash] = await Promise.all([
    hashCanonicalJsonSha256(formulaContract),
    hashCanonicalJsonSha256(evaluationProjection(evaluatedRows))
  ]);
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    version: '5.9.0',
    generatedAt: decisionAt,
    decisionAt,
    timestamp: decisionAt,
    sourceStage: 'stage3_fundamental',
    sourceStage2File: text(sourceStage2File),
    sourceStage2ContentSha256: text(sourceStage2ContentSha256),
    sourceStage2SchemaVersion: sourceValidation.manifest.schemaVersion,
    sourceStage2RunId: sourceValidation.manifest.runId,
    sourceStage2DecisionAt: sourceValidation.manifest.decisionAt,
    sourceStage2InputHash: sourceValidation.manifest.inputHash,
    sourceStage2OutputHash: sourceValidation.manifest.outputHash,
    sourceStage2EvaluationHash: sourceValidation.manifest.evaluationHash,
    sourceStage2PolicyContractSha256: sourceValidation.manifest.policyContractSha256,
    sourceStage2HistorySourceInventorySha256: sourceValidation.manifest.historySourceInventorySha256,
    sourceStage2RegimeContentSha256: sourceValidation.manifest.regimeEvidence?.status === 'REGIME_EVIDENCE_VERIFIED'
      ? sourceValidation.manifest.regimeEvidence.contentSha256
      : null,
    sourceStage2RegimeStatus: sourceValidation.manifest.regimeEvidence?.status,
    sourceStage2InputCount: Number(sourceValidation.manifest.inputCount),
    sourceStage2SelectedCount: sourceValidation.eliteUniverse.length,
    inputCount: evaluatedRows.length,
    eligibleCount: evaluatedRows.filter((row) => row.stage3AnalysisEligible).length,
    blockedCount: evaluatedRows.filter((row) => !row.stage3AnalysisEligible).length,
    count: evaluatedRows.length,
    statusCounts,
    unknownOrUnclassifiedRows: evaluatedRows.filter((row) => !STATUSES.has(row.stage3DecisionStatus)).length,
    lookAheadViolationRows: evaluatedRows.filter((row) => row.stage3DecisionStatus === 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED').length,
    syntheticInputBlockedRows: evaluatedRows.filter((row) => row.stage3DecisionStatus === 'STAGE3_SYNTHETIC_INPUT_BLOCKED').length,
    syntheticEvidencePromotionRows: evaluatedRows.filter((row) => hasSyntheticInput(row) && row.stage3AnalysisEligible).length,
    aiEvidencePromotionRows: evaluatedRows.filter((row) => text(row.auditSource).toUpperCase() === 'AI' && row.stage3AnalysisEligible).length,
    formulaContract,
    formulaContractSha256,
    evaluationHash,
    inputHash: null,
    outputHash: null,
    runId: null,
    engine: 'STAGE3_DETERMINISTIC_FUNDAMENTAL_TRUTH',
    historySourceMode: 'STAGE2_HASH_VERIFIED_ONLY',
    modelSemanticsStatus: 'REPRODUCIBLE_NOT_ECONOMICALLY_CERTIFIED',
    modelPolicyChanged: false,
    canonicalSourceChanged: false,
    Stage4To7PolicyChanged: false,
    brokerOrSidecarStateMutation: false
  };
  manifest.inputHash = await hashCanonicalJsonSha256(inputHashBasis(manifest));
  manifest.outputHash = await hashCanonicalJsonSha256({ fundamental_universe: evaluatedRows });
  manifest.runId = `stage3-${manifest.inputHash.slice(0, 12)}-${manifest.outputHash.slice(0, 12)}`;
  return { manifest, fundamental_universe: evaluatedRows, stage3_evaluation: evaluationProjection(evaluatedRows) };
};

export const validateStage3ArtifactForStage4 = async (artifact = {}) => {
  const reasons = new Set();
  const manifest = artifact?.manifest || {};
  const rows = Array.isArray(artifact?.fundamental_universe) ? artifact.fundamental_universe : [];
  const evaluation = Array.isArray(artifact?.stage3_evaluation) ? artifact.stage3_evaluation : [];
  addReason(reasons, manifest.schemaVersion !== SCHEMA_VERSION || manifest.sourceStage !== 'stage3_fundamental', 'MANIFEST_SCHEMA_INVALID');
  addReason(reasons, !iso(manifest.generatedAt) || manifest.generatedAt !== manifest.decisionAt || manifest.timestamp !== manifest.decisionAt, 'MANIFEST_TIMESTAMP_INVALID');
  addReason(reasons, !text(manifest.sourceStage2File) || manifest.sourceStage2SchemaVersion !== 'stage2-quality-truth-v1', 'SOURCE_STAGE2_CONTRACT_INVALID');
  addReason(reasons, [manifest.sourceStage2ContentSha256, manifest.sourceStage2InputHash, manifest.sourceStage2OutputHash,
    manifest.sourceStage2EvaluationHash, manifest.sourceStage2PolicyContractSha256,
    manifest.sourceStage2HistorySourceInventorySha256].some((value) => !SHA256_RE.test(text(value))), 'SOURCE_STAGE2_HASH_INVALID');
  addReason(reasons, manifest.sourceStage2RegimeStatus === 'REGIME_EVIDENCE_VERIFIED'
    ? !SHA256_RE.test(text(manifest.sourceStage2RegimeContentSha256))
    : manifest.sourceStage2RegimeContentSha256 !== null, 'SOURCE_STAGE2_HASH_INVALID');
  addReason(reasons, !uniqueIdentities(rows) || rows.length !== evaluation.length, 'ROW_IDENTITY_INVALID');
  addReason(reasons, Number(manifest.count) !== rows.length || Number(manifest.inputCount) !== rows.length
    || Number(manifest.sourceStage2SelectedCount) !== rows.length
    || !Number.isInteger(Number(manifest.sourceStage2InputCount))
    || Number(manifest.sourceStage2InputCount) < rows.length
    || Number(manifest.eligibleCount) + Number(manifest.blockedCount) !== rows.length, 'ROW_COUNT_RECONCILIATION_INVALID');
  const expectedSectorAdjustments = sectorAdjustments(rows);
  addReason(reasons, rows.some((row) => !STATUSES.has(row.stage3DecisionStatus)
    || row.stage3AnalysisEligible !== (row.stage3DecisionStatus === 'STAGE3_FUNDAMENTAL_EVIDENCE_PASS')
    || row.stage3DecisionStatus !== classifyRow(row, manifest.decisionAt, expectedSectorAdjustments.get(text(row?.symbol)))), 'ROW_CLASSIFICATION_INVALID');
  addReason(reasons, JSON.stringify(countBy(rows, 'stage3DecisionStatus')) !== JSON.stringify(manifest.statusCounts || {}), 'ROW_COUNT_RECONCILIATION_INVALID');
  addReason(reasons, Number(manifest.unknownOrUnclassifiedRows) !== 0
    || Number(manifest.syntheticEvidencePromotionRows) !== 0
    || Number(manifest.aiEvidencePromotionRows) !== 0, 'EVIDENCE_PROMOTION_INVALID');
  addReason(reasons, Number(manifest.lookAheadViolationRows) !== rows.filter((row) => row.stage3DecisionStatus === 'STAGE3_PUBLICATION_LOOKAHEAD_BLOCKED').length, 'LOOKAHEAD_COUNT_INVALID');
  addReason(reasons, manifest.modelPolicyChanged !== false || manifest.canonicalSourceChanged !== false
    || manifest.Stage4To7PolicyChanged !== false || manifest.brokerOrSidecarStateMutation !== false, 'POLICY_INVARIANCE_INVALID');
  addReason(reasons, manifest.modelSemanticsStatus !== 'REPRODUCIBLE_NOT_ECONOMICALLY_CERTIFIED'
    || manifest.historySourceMode !== 'STAGE2_HASH_VERIFIED_ONLY', 'SEMANTICS_CONTRACT_INVALID');
  const expectedFormulaHash = await hashCanonicalJsonSha256(manifest.formulaContract || {});
  const expectedEvaluationHash = await hashCanonicalJsonSha256(evaluationProjection(rows));
  const expectedInputHash = await hashCanonicalJsonSha256(inputHashBasis({ ...manifest, evaluationHash: expectedEvaluationHash }));
  const expectedOutputHash = await hashCanonicalJsonSha256({ fundamental_universe: rows });
  addReason(reasons, expectedFormulaHash !== manifest.formulaContractSha256, 'FORMULA_CONTRACT_HASH_MISMATCH');
  addReason(reasons, expectedEvaluationHash !== manifest.evaluationHash
    || JSON.stringify(evaluation) !== JSON.stringify(evaluationProjection(rows)), 'EVALUATION_HASH_MISMATCH');
  addReason(reasons, expectedInputHash !== manifest.inputHash, 'INPUT_HASH_MISMATCH');
  addReason(reasons, expectedOutputHash !== manifest.outputHash, 'OUTPUT_HASH_MISMATCH');
  addReason(reasons, manifest.runId !== `stage3-${text(manifest.inputHash).slice(0, 12)}-${text(manifest.outputHash).slice(0, 12)}`, 'MANIFEST_IDENTITY_INVALID');
  return { valid: reasons.size === 0, reasons: [...reasons].sort(), manifest, fundamentalUniverse: rows };
};
