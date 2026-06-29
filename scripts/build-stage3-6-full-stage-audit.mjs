#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT_JSON = process.env.STAGE36_FULL_AUDIT_OUT_JSON || 'state/stage3-6-full-stage-audit.json';
const OUT_MD = process.env.STAGE36_FULL_AUDIT_OUT_MD || 'docs/STAGE3_6_FULL_STAGE_AUDIT.md';

const STAGE_CONFIGS = {
  stage3: {
    label: 'Stage3',
    envPath: 'STAGE36_FULL_AUDIT_STAGE3_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE3_DIR',
    defaultDir: 'state/stage3-audit-source',
    pattern: /^STAGE3_.*\.json$/,
    rowKeys: ['fundamental_universe', 'fundamentalUniverse', 'stage3', 'candidates', 'results', 'data']
  },
  stage4: {
    label: 'Stage4',
    envPath: 'STAGE36_FULL_AUDIT_STAGE4_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE4_DIR',
    defaultDir: 'state/stage4-audit-source',
    pattern: /^STAGE4_.*\.json$/,
    rowKeys: ['technical_universe', 'technicalUniverse', 'stage4', 'technical_candidates', 'stage4_candidates', 'candidates', 'results', 'data']
  },
  stage5: {
    label: 'Stage5',
    envPath: 'STAGE36_FULL_AUDIT_STAGE5_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE5_DIR',
    defaultDir: 'state/stage5-audit-source',
    pattern: /^STAGE5_.*\.json$/,
    rowKeys: ['ict_universe', 'ictUniverse', 'stage5', 'ict_candidates', 'elite_candidates', 'stage5_candidates', 'candidates', 'results', 'data']
  },
  stage6: {
    label: 'Stage6',
    envPath: 'STAGE36_FULL_AUDIT_STAGE6_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE6_DIR',
    defaultDir: 'state/stage6-audit-source',
    pattern: /^STAGE6_ALPHA_FINAL_.*\.json$/,
    rowKeys: ['alpha_candidates', 'candidates', 'results', 'data']
  }
};

const SUBREPORTS = {
  stage35Methodology: 'state/stage3-5-methodology-audit.json',
  stage35QuantQuality: 'state/stage3-5-quant-quality-audit.json',
  stage6FreshFocus: 'state/stage6-fresh-focus-audit.json',
  stage6FormulaTuningBacklog: 'state/stage6-formula-tuning-backlog.json',
  stage6RuntimeFormulaContractProof: 'state/stage6-runtime-formula-contract-proof.json',
  stage6FormulaBacklogAlignment: 'state/stage6-formula-audit-backlog-alignment.json',
  stage6BlockerRootCause: 'state/stage6-blocker-root-cause-audit.json',
  stage6QualityTrend: 'state/stage6-quality-trend-audit.json'
};

const RUNTIME_PROOF_FIELDS = [
  'targetRecalibrationExecutionFloorViable',
  'riskGeometryTargetRecalibrationProofReady',
  'riskGeometryRrAtRequiredTargetAndRecalculatedStop',
  'breakoutRetestProofUndercutReclaimFound',
  'zeroExecutableTuningLane',
  'structurePolicyBlockerLane',
  'qualityGateLane'
];

const STAGE_FIELD_GROUPS = {
  stage3: [
    'fundamentalScore',
    'compositeAlpha',
    'qualityScore',
    'integrityReasons',
    'isImputed',
    'dataQuality',
    'roicDebtSource'
  ],
  stage4: [
    'technicalScore',
    'scoreBreakdown.finalScore',
    'techMetrics',
    'priceHistory',
    'dataSource',
    'techMetrics.dataQualityState',
    'techMetrics.avgDollarVolume20'
  ],
  stage5: [
    'ictScore',
    'ictMetrics',
    'otePrice',
    'ictStopLoss',
    'executionGeometrySource',
    'pdZone',
    'compositeBreakdown.dataQualityMultiplier'
  ],
  stage6: [
    'finalDecision',
    'decisionReason',
    'weakPillarGateVerdict',
    'qualityGateLane',
    'zeroExecutableTuningLane',
    'targetRecalibrationViabilityVerdict',
    'riskGeometryRepairLane',
    'breakoutRetestProofConfirmed'
  ]
};

const STAGE_DATA_HEALTH_CONFIGS = {
  stage3: {
    scoreFields: ['fundamentalScore', 'compositeAlpha', 'qualityScore'],
    sourceFields: ['dataQuality', 'source', 'quoteSource', 'netIncomeSource', 'roicDebtSource'],
    freshnessFields: ['updated', 'quoteTimestamp', 'netIncomeAsOf'],
    fallbackFlags: ['isImputed', 'cashflowProxyUsed', 'fundamentalScoreClampApplied']
  },
  stage4: {
    scoreFields: ['technicalScore', 'scoreBreakdown.finalScore', 'fundamentalScore', 'compositeAlpha'],
    sourceFields: ['dataQuality', 'dataSource', 'quoteSource', 'techMetrics.dataQualityState'],
    freshnessFields: ['updated', 'quoteTimestamp', 'lastUpdate'],
    fallbackFlags: ['isImputed', 'cashflowProxyUsed', 'isTechnicalBreakout']
  },
  stage5: {
    scoreFields: ['ictScore', 'technicalScore', 'fundamentalScore', 'compositeAlpha'],
    sourceFields: ['dataQuality', 'dataSource', 'executionGeometrySource', 'factorCarryGuard', 'compositeBreakdown.dataQualityMultiplier'],
    freshnessFields: ['updated', 'quoteTimestamp', 'lastUpdate'],
    fallbackFlags: ['isImputed', 'cashflowProxyUsed', 'isDataDoubtful']
  },
  stage6: {
    scoreFields: ['convictionScore', 'expectedReturn', 'fundamentalScore', 'technicalScore', 'ictScore'],
    sourceFields: ['dataQuality', 'aiProvider', 'finalDecision', 'decisionReason', 'zeroExecutableTuningLane'],
    freshnessFields: ['updated', 'quoteTimestamp', 'lastUpdate'],
    fallbackFlags: ['aiFallbackDetected', 'breakoutRetestProofConfirmed']
  }
};

const STAGE6_ENTRY_EVIDENCE_FIELDS = [
  { label: 'entryDistancePct', fields: ['entryDistancePct', 'entryDistancePctShadow'] },
  { label: 'rrAtCurrent', fields: ['rrAtCurrent', 'rrAtCurrentPrice'] },
  { label: 'rrAtEntry', fields: ['rrAtEntry', 'riskRewardRatioValue', 'riskRewardRatio'] },
  { label: 'targetBufferPct', fields: ['targetBufferPct', 'targetBufferFromCurrentPct'] },
  { label: 'fillabilityPolicyVerdict', fields: ['fillabilityPolicyVerdict'] },
  { label: 'entryTimingPolicyVerdict', fields: ['entryTimingPolicyVerdict', 'executionFeasibilityAtCurrentVerdict'] },
  { label: 'zeroExecutableTuningLane', fields: ['zeroExecutableTuningLane'] },
  { label: 'qualityGateLane', fields: ['qualityGateLane'] },
  { label: 'targetRecalibrationViabilityVerdict', fields: ['targetRecalibrationViabilityVerdict'] },
  { label: 'riskGeometryPolicyVerdict', fields: ['riskGeometryPolicyVerdict'] },
  { label: 'breakoutRetestProofConfirmed', fields: ['breakoutRetestProofConfirmed'] }
];

const STAGE6_ENTRY_CORE_EVIDENCE_FIELDS = [
  'entryDistancePct',
  'rrAtCurrent',
  'rrAtEntry',
  'targetBufferPct',
  'fillabilityPolicyVerdict',
  'entryTimingPolicyVerdict'
];

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function exists(filePath) {
  return Boolean(filePath) && fs.existsSync(resolveRepo(filePath));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function writeTextAtomic(filePath, text) {
  const fullPath = resolveRepo(filePath);
  ensureParent(fullPath);
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, fullPath);
}

function writeJsonAtomic(filePath, payload) {
  writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function readJsonOptional(filePath) {
  if (!exists(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (error) {
    return { readError: String(error?.message || error) };
  }
}

function sha256(filePath) {
  if (!exists(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function basename(filePath) {
  return filePath ? path.basename(filePath) : null;
}

function artifactSortKey(name) {
  const match = String(name).match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestArtifact({ envPath, envDir, defaultDir, pattern }) {
  const direct = process.env[envPath];
  if (direct) {
    const resolved = resolveRepo(direct);
    return fs.existsSync(resolved) ? { path: resolved, source: envPath } : { path: resolved, source: envPath, missing: true };
  }
  const dir = resolveRepo(process.env[envDir] || defaultDir);
  if (!fs.existsSync(dir)) return { path: null, source: 'missing_dir', dir };
  const files = fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, full, mtime: fs.statSync(full).mtimeMs, key: artifactSortKey(name) };
    })
    .sort((a, b) => b.key.localeCompare(a.key) || b.mtime - a.mtime || b.name.localeCompare(a.name));
  return files[0] ? { path: files[0].full, source: envDir, dir } : { path: null, source: 'no_matching_files', dir };
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function isPresent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function nestedGet(row, fieldPath) {
  return String(fieldPath).split('.').reduce((cur, part) => cur?.[part], row);
}

function firstPresent(row, fields) {
  for (const field of fields) {
    const value = nestedGet(row, field);
    if (isPresent(value)) return value;
  }
  return null;
}

function toNumber(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateMs(value) {
  if (!isPresent(value)) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100000000000 ? value : value * 1000;
  }
  if (typeof value === 'string' && /^\d{10,13}$/.test(value.trim())) {
    const n = Number(value.trim());
    return n > 100000000000 ? n : n * 1000;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function round(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function rowsFromStageArtifact(payload, config) {
  if (Array.isArray(payload)) return payload.filter((row) => normalizeSymbol(row));
  for (const key of config.rowKeys) {
    const rows = payload?.[key];
    if (Array.isArray(rows)) return rows.filter((row) => normalizeSymbol(row));
  }
  if (config.label === 'Stage6') {
    const contract = payload?.execution_contract || {};
    const rows = [];
    const seen = new Set();
    for (const group of ['executablePicks', 'watchlistTop', 'modelTop6']) {
      for (const row of Array.isArray(contract[group]) ? contract[group] : []) {
        const symbol = normalizeSymbol(row);
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        rows.push(row);
      }
    }
    return rows;
  }
  return [];
}

function loadStage(stageKey) {
  const config = STAGE_CONFIGS[stageKey];
  const artifact = latestArtifact(config);
  const payload = artifact.path && fs.existsSync(artifact.path) ? readJsonOptional(artifact.path) : null;
  const rows = payload && !payload.readError ? rowsFromStageArtifact(payload, config) : [];
  return {
    stage: config.label,
    path: artifact.path,
    file: basename(artifact.path),
    hash: sha256(artifact.path),
    source: artifact.source,
    missing: !artifact.path || artifact.missing || !fs.existsSync(artifact.path),
    readError: payload?.readError || null,
    manifest: payload && !payload.readError ? payload.manifest || {} : {},
    rows,
    rowCount: rows.length
  };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = String(fn(row) ?? 'unknown').trim() || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function coverage(rows, fields) {
  return Object.fromEntries(fields.map((field) => {
    const present = rows.filter((row) => isPresent(nestedGet(row, field))).length;
    return [field, { present, total: rows.length, pct: rows.length ? Number(((present / rows.length) * 100).toFixed(1)) : 0 }];
  }));
}

function boolString(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value == null || value === '') return 'missing';
  return String(value);
}

function scoreHealth(rows, fields) {
  return Object.fromEntries(fields.map((field) => {
    const values = rows
      .map((row) => toNumber(nestedGet(row, field)))
      .filter((value) => value != null);
    const outOfBounds = values.filter((value) => value < 0 || value > 100).length;
    return [field, {
      present: values.length,
      total: rows.length,
      min: values.length ? round(Math.min(...values)) : null,
      max: values.length ? round(Math.max(...values)) : null,
      outOfBounds
    }];
  }));
}

function flagCounts(rows, fields) {
  return Object.fromEntries(fields.map((field) => {
    const counts = countBy(rows, (row) => boolString(nestedGet(row, field)));
    return [field, counts];
  }));
}

function sourceHealth(rows, fields) {
  return Object.fromEntries(fields.map((field) => [field, countBy(rows, (row) => nestedGet(row, field))]));
}

function priceHistoryHealth(rows, nowMs) {
  const lengths = rows.map((row) => Array.isArray(row?.priceHistory) ? row.priceHistory.length : 0);
  const withHistory = lengths.filter((length) => length > 0);
  const lastBarDates = rows
    .map((row) => {
      const history = Array.isArray(row?.priceHistory) ? row.priceHistory : [];
      const last = history.length ? history[history.length - 1] : null;
      return last?.date || last?.timestamp || last?.datetime || null;
    })
    .filter(isPresent);
  const parsedLastBarMs = lastBarDates.map(dateMs).filter((ms) => ms != null).sort((a, b) => a - b);
  return {
    present: withHistory.length,
    total: rows.length,
    minBars: withHistory.length ? Math.min(...withHistory) : null,
    maxBars: withHistory.length ? Math.max(...withHistory) : null,
    shortHistoryRowsLt80: lengths.filter((length) => length > 0 && length < 80).length,
    missingHistoryRows: lengths.filter((length) => length === 0).length,
    lastBarDateCoverage: {
      present: lastBarDates.length,
      total: rows.length,
      pct: rows.length ? round((lastBarDates.length / rows.length) * 100, 1) : 0
    },
    oldestLastBarDate: parsedLastBarMs.length ? new Date(parsedLastBarMs[0]).toISOString().slice(0, 10) : null,
    latestLastBarDate: parsedLastBarMs.length ? new Date(parsedLastBarMs[parsedLastBarMs.length - 1]).toISOString().slice(0, 10) : null,
    maxLastBarAgeDays: parsedLastBarMs.length && Number.isFinite(nowMs) ? round((nowMs - parsedLastBarMs[0]) / 86400000, 2) : null
  };
}

function freshnessAgeHealth(rows, fields, nowMs) {
  return Object.fromEntries(fields.map((field) => {
    const values = rows
      .map((row) => nestedGet(row, field))
      .filter(isPresent);
    const parsed = values.map(dateMs).filter((ms) => ms != null).sort((a, b) => a - b);
    return [field, {
      present: values.length,
      total: rows.length,
      parsed: parsed.length,
      pct: rows.length ? round((values.length / rows.length) * 100, 1) : 0,
      oldest: parsed.length ? new Date(parsed[0]).toISOString() : null,
      latest: parsed.length ? new Date(parsed[parsed.length - 1]).toISOString() : null,
      maxAgeDays: parsed.length && Number.isFinite(nowMs) ? round((nowMs - parsed[0]) / 86400000, 2) : null
    }];
  }));
}

function deriveStageDataHealth(stages, generatedAt) {
  const nowMs = Date.parse(generatedAt);
  return Object.fromEntries(Object.entries(stages).map(([stageKey, stage]) => {
    const config = STAGE_DATA_HEALTH_CONFIGS[stageKey];
    return [stageKey, {
      rows: stage.rowCount,
      source: stage.file,
      scoreBounds: scoreHealth(stage.rows, config.scoreFields),
      sourceCounts: sourceHealth(stage.rows, config.sourceFields),
      freshnessCoverage: coverage(stage.rows, config.freshnessFields),
      freshnessAge: freshnessAgeHealth(stage.rows, config.freshnessFields, nowMs),
      fallbackFlagCounts: flagCounts(stage.rows, config.fallbackFlags),
      priceHistory: ['stage4', 'stage5', 'stage6'].includes(stageKey) ? priceHistoryHealth(stage.rows, nowMs) : null
    }];
  }));
}

function deriveStage6EntryEvidence(rows) {
  const fieldCoverage = Object.fromEntries(STAGE6_ENTRY_EVIDENCE_FIELDS.map(({ label, fields }) => {
    const present = rows.filter((row) => isPresent(firstPresent(row, fields))).length;
    return [label, { present, total: rows.length, pct: rows.length ? round((present / rows.length) * 100, 1) : 0 }];
  }));
  const missingCoreFields = STAGE6_ENTRY_CORE_EVIDENCE_FIELDS.filter((field) => {
    const info = fieldCoverage[field];
    return !info || info.total === 0 || info.present < info.total;
  });
  const numericRanges = Object.fromEntries(STAGE6_ENTRY_EVIDENCE_FIELDS.slice(0, 4).map(({ label, fields }) => {
    const values = rows.map((row) => toNumber(firstPresent(row, fields))).filter((value) => value != null);
    return [label, {
      present: values.length,
      total: rows.length,
      min: values.length ? round(Math.min(...values), 4) : null,
      max: values.length ? round(Math.max(...values), 4) : null
    }];
  }));
  return {
    status: rows.length === 0
      ? 'no_stage6_rows'
      : missingCoreFields.length
        ? 'pending_entry_fillability_evidence'
        : 'pass_entry_fillability_evidence_present',
    rows: rows.length,
    missingCoreFields,
    fieldCoverage,
    numericRanges,
    policyCounts: {
      fillabilityPolicyVerdict: countBy(rows, (row) => firstPresent(row, ['fillabilityPolicyVerdict'])),
      entryTimingPolicyVerdict: countBy(rows, (row) => firstPresent(row, ['entryTimingPolicyVerdict', 'executionFeasibilityAtCurrentVerdict'])),
      finalDecision: countBy(rows, (row) => row.finalDecision),
      decisionReason: countBy(rows, (row) => row.decisionReason),
      zeroExecutableTuningLane: countBy(rows, (row) => row.zeroExecutableTuningLane),
      qualityGateLane: countBy(rows, (row) => row.qualityGateLane)
    }
  };
}

function pickOverall(report) {
  return report?.overall || report?.status || report?.summary?.overall || report?.verdict || 'not_available';
}

function summarizeSubreports() {
  const out = {};
  for (const [name, file] of Object.entries(SUBREPORTS)) {
    const report = readJsonOptional(file);
    out[name] = {
      path: file,
      present: Boolean(report && !report.readError),
      generatedAt: report?.generatedAt || null,
      overall: report && !report.readError ? pickOverall(report) : report?.readError ? 'read_error' : 'missing',
      summary: report?.summary || {},
      runtimeProof: report?.runtimeProof || null,
      sourceFreshness: report?.sourceFreshness || null,
      contract: report?.contract || null,
      backlog: report?.backlog || null,
      splitTuning: report?.splitTuning || null,
      nextAction: report?.nextAction || null,
      staticMethodChecks: Array.isArray(report?.staticMethodChecks)
        ? report.staticMethodChecks.map(({ stage, id, title, file, line, present, expected, weight }) => ({
          stage,
          id,
          title,
          file,
          line,
          present,
          expected,
          weight
        }))
        : [],
      staticFormulaEvidence: Array.isArray(report?.staticFormulaEvidence)
        ? report.staticFormulaEvidence.map(({ stage, id, title, file, line, present }) => ({
          stage,
          id,
          title,
          file,
          line,
          present
        }))
        : []
    };
  }
  return out;
}

function deriveFormulaEvidence(subreports) {
  const methodologyChecks = (subreports.stage35Methodology.staticMethodChecks || [])
    .map((check) => ({ source: 'methodology', required: check.expected !== false, ...check }));
  const quantChecks = (subreports.stage35QuantQuality.staticFormulaEvidence || [])
    .map((check) => ({ source: 'quant_formula', required: true, expected: true, ...check }));
  const checks = [...methodologyChecks, ...quantChecks]
    .filter((check) => check.stage && check.id)
    .sort((a, b) => String(a.stage).localeCompare(String(b.stage)) || String(a.id).localeCompare(String(b.id)));
  const missingRequired = checks.filter((check) => check.required && check.present !== true);
  const byStage = {};
  for (const check of checks) {
    const stage = check.stage || 'unknown';
    byStage[stage] ||= { checks: 0, present: 0, missingRequired: 0, sources: {} };
    byStage[stage].checks += 1;
    if (check.present === true) byStage[stage].present += 1;
    if (check.required && check.present !== true) byStage[stage].missingRequired += 1;
    byStage[stage].sources[check.source] = (byStage[stage].sources[check.source] || 0) + 1;
  }
  return {
    status: missingRequired.length ? 'warn_formula_evidence_missing' : 'pass_formula_evidence_present',
    totalChecks: checks.length,
    presentChecks: checks.filter((check) => check.present === true).length,
    missingRequiredChecks: missingRequired.map(({ source, stage, id, title, file, line }) => ({ source, stage, id, title, file, line })),
    byStage,
    checks
  };
}

function compareNames(actual, expected) {
  if (!actual || !expected) return null;
  return String(actual) === String(expected);
}

function deriveLineage(stages) {
  const s3 = stages.stage3;
  const s4 = stages.stage4;
  const s5 = stages.stage5;
  const s6 = stages.stage6;
  const s4SourceStage3File = s4.manifest.sourceStage3File || s4.manifest.stage3File || null;
  const s5SourceStage4File = s5.manifest.sourceStage4File || s5.manifest.stage4File || null;
  const s5SourceStage4LineageStatus = s5.manifest.sourceStage4LineageStatus || null;
  const s5SourceStage4SourceStage3File = s5.manifest.sourceStage4SourceStage3File || null;
  const s6SourceStage5File = s6.manifest.sourceStage5File || s6.manifest.stage5File || null;
  const stage4MatchesStage3 = compareNames(s4SourceStage3File, s3.file);
  const stage5MatchesStage4 = compareNames(s5SourceStage4File, s4.file);
  const stage6MatchesStage5 = compareNames(s6SourceStage5File, s5.file);
  const missingArtifacts = [s3, s4, s5, s6].filter((stage) => stage.missing).map((stage) => stage.stage);
  const mismatches = [];
  const incomplete = [];

  if (missingArtifacts.length) mismatches.push(`missing_artifacts:${missingArtifacts.join(',')}`);
  if (stage4MatchesStage3 === false) mismatches.push('stage4_source_stage3_mismatch');
  if (stage5MatchesStage4 === false) mismatches.push('stage5_source_stage4_mismatch');
  if (stage6MatchesStage5 === false) mismatches.push('stage6_source_stage5_mismatch');
  if (stage4MatchesStage3 == null && !s4.missing && !s3.missing) incomplete.push('stage4_source_stage3_missing');
  if (stage5MatchesStage4 == null && !s5.missing && !s4.missing) incomplete.push('stage5_source_stage4_missing');
  if (stage6MatchesStage5 == null && !s6.missing && !s5.missing) incomplete.push('stage6_source_stage5_missing');

  let status = 'pass_same_run_lineage';
  if (missingArtifacts.length) status = 'warn_artifacts_missing';
  else if (mismatches.length) status = 'warn_lineage_mismatch';
  else if (incomplete.length) status = 'warn_lineage_incomplete';

  return {
    status,
    finalQualityJudgement: status === 'pass_same_run_lineage' ? 'enabled' : 'withheld',
    reason: mismatches.length || incomplete.length ? [...mismatches, ...incomplete] : ['stage3_stage4_stage5_stage6_chain_consistent'],
    stage3File: s3.file,
    stage4File: s4.file,
    stage4SourceStage3File: s4SourceStage3File,
    stage4MatchesStage3,
    stage5File: s5.file,
    stage5SourceStage4File: s5SourceStage4File,
    stage5SourceStage4LineageStatus: s5SourceStage4LineageStatus,
    stage5SourceStage4SourceStage3File: s5SourceStage4SourceStage3File,
    stage5MatchesStage4,
    stage6File: s6.file,
    stage6SourceStage5File: s6SourceStage5File,
    stage6MatchesStage5
  };
}

function deriveRuntimeProof(stage6Rows, subreports) {
  const fieldCoverage = coverage(stage6Rows, RUNTIME_PROOF_FIELDS);
  const missingFields = Object.entries(fieldCoverage)
    .filter(([, info]) => info.present < info.total || info.total === 0)
    .map(([field]) => field);
  const formulaBacklog = subreports.stage6FormulaTuningBacklog;
  const freshFocus = subreports.stage6FreshFocus;
  const contractProof = subreports.stage6RuntimeFormulaContractProof || {};
  const freshRuntime = freshFocus.runtimeProof || {};
  const freshOverall = String(freshFocus.overall || '');
  const freshRuntimeStatus = String(freshRuntime.status || '');
  const formulaBacklogOverall = String(formulaBacklog.overall || '');
  const freshManifestIssues = Number(freshFocus.summary?.formulaManifestContractIssues || 0);
  const backlogContractIssues = Number(formulaBacklog.summary?.formulaContractIssues || 0);
  const contractSourceFreshness = contractProof.sourceFreshness || {};
  const contractProofPass = /^pass_/i.test(String(contractProof.overall || ''));
  const freshSourcePass =
    freshRuntime.sourceShaMatchesExpected === true ||
    freshRuntime.sourceShaMatchesExpected === 'true' ||
    contractSourceFreshness.covers === true ||
    contractSourceFreshness.covers === 'true';
  const formulaCoveragePass = freshRuntime.formulaCoveragePass === true || freshRuntime.formulaCoveragePass === 'true';
  const requiredCoveragePass = freshRuntime.requiredCoveragePass === true || freshRuntime.requiredCoveragePass === 'true';
  const evidenceIssueCount = Number(freshRuntime.formulaEvidenceQualityIssues || 0);
  const pendingFreshFocus =
    /pending/i.test(freshRuntimeStatus) ||
    /contract_missing|contract_incomplete|missing_or_mismatch|pending/i.test(`${freshOverall} ${formulaBacklogOverall}`) ||
    freshManifestIssues > 0 ||
    backlogContractIssues > 0;
  const staleOrMissingSource = /stale|missing|pending|incomplete|mismatch/i.test(`${formulaBacklog.overall} ${freshFocus.overall} ${freshRuntimeStatus}`);
  const subreportRuntimeProofPass = !pendingFreshFocus && contractProofPass && freshSourcePass && formulaCoveragePass && requiredCoveragePass;
  const status = subreportRuntimeProofPass
    ? evidenceIssueCount > 0
      ? 'warn_runtime_formula_evidence_weak'
      : 'pass_runtime_proof_fields_present'
    : missingFields.length || staleOrMissingSource
      ? 'pending_fresh_runtime_proof_after_e3708e2f'
      : 'pass_runtime_proof_fields_present';
  return {
    status,
    expectedProducerHead: 'e3708e2f_or_later',
    fieldCoverage,
    missingFields,
    subreportSignals: {
      stage6FreshFocusOverall: freshFocus.overall,
      stage6FormulaTuningBacklogOverall: formulaBacklog.overall,
      stage6RuntimeFormulaContractProofOverall: contractProof.overall,
      freshFocusRuntimeProofStatus: freshRuntime.status,
      formulaEvidenceQualityIssues: Number.isFinite(evidenceIssueCount) ? evidenceIssueCount : null,
      formulaManifestContractIssues: Number.isFinite(freshManifestIssues) ? freshManifestIssues : null,
      formulaBacklogContractIssues: Number.isFinite(backlogContractIssues) ? backlogContractIssues : null,
      formulaEvidenceIssueReasonCounts: freshFocus.summary?.formulaEvidenceIssueReasonCounts || {},
      laneSpecificFormulaEvidenceIssueReasonCounts: freshFocus.summary?.laneSpecificFormulaEvidenceIssueReasonCounts || {},
      pendingFreshFocus
    },
    note: 'Runtime proof is intentionally separate from the Stage3-6 methodology audit. Fresh subreport proof takes precedence over raw finalist field coverage because zero-executable diagnostics may be emitted on audit rows beyond alpha_candidates.'
  };
}

function deriveStageVerdicts(stages, subreports, runtimeProof) {
  const quant = subreports.stage35QuantQuality;
  const methodology = subreports.stage35Methodology;
  const stage6Fresh = subreports.stage6FreshFocus;
  const stage6Blockers = subreports.stage6BlockerRootCause;
  return {
    Stage3: {
      verdict: stages.stage3.rowCount ? 'audited_report_only' : 'warn_missing_stage3_artifact',
      rows: stages.stage3.rowCount,
      source: stages.stage3.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage3.rows, STAGE_FIELD_GROUPS.stage3)
    },
    Stage4: {
      verdict: stages.stage4.rowCount ? 'audited_report_only' : 'warn_missing_stage4_artifact',
      rows: stages.stage4.rowCount,
      source: stages.stage4.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage4.rows, STAGE_FIELD_GROUPS.stage4)
    },
    Stage5: {
      verdict: stages.stage5.rowCount ? 'audited_report_only' : 'warn_missing_stage5_artifact',
      rows: stages.stage5.rowCount,
      source: stages.stage5.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage5.rows, STAGE_FIELD_GROUPS.stage5)
    },
    Stage6: {
      verdict:
        runtimeProof.status === 'pass_runtime_proof_fields_present'
          ? 'audited_runtime_proof_present'
          : runtimeProof.status === 'warn_runtime_formula_evidence_weak'
            ? 'warn_runtime_formula_evidence_weak'
            : 'warn_runtime_proof_pending',
      rows: stages.stage6.rowCount,
      source: stages.stage6.file,
      freshFocusStatus: stage6Fresh.overall,
      blockerRootCauseStatus: stage6Blockers.overall,
      coverage: coverage(stages.stage6.rows, STAGE_FIELD_GROUPS.stage6)
    }
  };
}

function dataHealthFindingRows(stageDataHealth) {
  const findings = [];
  for (const [stage, health] of Object.entries(stageDataHealth)) {
    for (const [field, info] of Object.entries(health.scoreBounds || {})) {
      if (info.outOfBounds > 0) {
        findings.push([stage, 'score_bounds', field, `${info.outOfBounds} out-of-bounds`, `${info.min}..${info.max}`]);
      }
    }
    const priceHistory = health.priceHistory;
    if (priceHistory?.missingHistoryRows > 0) {
      findings.push([stage, 'price_history', 'priceHistory', `${priceHistory.missingHistoryRows} missing`, `present=${priceHistory.present}/${priceHistory.total}`]);
    }
    if (priceHistory?.maxLastBarAgeDays != null && priceHistory.maxLastBarAgeDays > 5) {
      findings.push([stage, 'price_history_freshness', 'priceHistory.lastBarDate', `max age ${priceHistory.maxLastBarAgeDays}d`, `${priceHistory.oldestLastBarDate}..${priceHistory.latestLastBarDate}`]);
    }
    for (const [field, info] of Object.entries(health.freshnessAge || {})) {
      const isFiscalPeriodField = /asof|fiscal|period/i.test(field);
      if (info.present > 0 && info.parsed === 0) {
        findings.push([stage, 'freshness_parse', field, 'timestamp not parseable', `present=${info.present}/${info.total}`]);
      } else if (!isFiscalPeriodField && info.maxAgeDays != null && info.maxAgeDays > 5) {
        findings.push([stage, 'freshness_age', field, `max age ${info.maxAgeDays}d`, `${info.oldest || 'N/A'}..${info.latest || 'N/A'}`]);
      }
    }
  }
  return findings;
}

function deriveBlockerSummary(stage6Rows, subreports) {
  const fresh = subreports.stage6FreshFocus.summary || {};
  const blocker = subreports.stage6BlockerRootCause.summary || {};
  const qualityGateRootCauses =
    fresh.latestQualityGateLaneCounts && Object.keys(fresh.latestQualityGateLaneCounts).length
      ? fresh.latestQualityGateLaneCounts
      : blocker.qualityGateRootCauses || {};
  return {
    blockerCategoryCounts: fresh.blockerCategoryCounts || {},
    zeroExecutableTuningLaneCounts: fresh.zeroExecutableTuningLaneCounts || countBy(stage6Rows, (row) => row.zeroExecutableTuningLane),
    qualityGateLaneCounts: fresh.latestQualityGateLaneCounts || countBy(stage6Rows, (row) => row.qualityGateLane),
    structurePolicyBlockerLaneCounts: fresh.structurePolicyBlockerLaneCounts || countBy(stage6Rows, (row) => row.structurePolicyBlockerLane),
    riskGeometryRepairLaneCounts: fresh.riskGeometryRepairLaneCounts || countBy(stage6Rows, (row) => row.riskGeometryRepairLane),
    breakoutRetestProofConfirmedCounts: fresh.breakoutRetestProofConfirmedCounts || countBy(stage6Rows, (row) => boolString(row.breakoutRetestProofConfirmed)),
    targetRecalibrationViabilityVerdictCounts: fresh.targetRecalibrationViabilityVerdictCounts || countBy(stage6Rows, (row) => row.targetRecalibrationViabilityVerdict),
    rootCauseSummary: {
      structureWaitRootCauses: blocker.structureWaitRootCauses || {},
      riskGeometryRootCauses: blocker.riskGeometryRootCauses || {},
      qualityGateRootCauses
    }
  };
}

function deriveBlockerClassificationHealth(blockerSummary) {
  const buckets = [
    ['blockerCategoryCounts', blockerSummary.blockerCategoryCounts],
    ['zeroExecutableTuningLaneCounts', blockerSummary.zeroExecutableTuningLaneCounts],
    ['qualityGateLaneCounts', blockerSummary.qualityGateLaneCounts],
    ['structurePolicyBlockerLaneCounts', blockerSummary.structurePolicyBlockerLaneCounts],
    ['riskGeometryRepairLaneCounts', blockerSummary.riskGeometryRepairLaneCounts]
  ];
  const ambiguous = [];
  for (const [bucket, counts] of buckets) {
    for (const [key, count] of Object.entries(counts || {})) {
      if (/^(unknown|other|none|null|undefined|missing)$/i.test(String(key))) {
        ambiguous.push({ bucket, key, count });
      }
    }
  }
  return {
    status: ambiguous.length ? 'warn_ambiguous_blocker_classification' : 'pass_blocker_classification_specific',
    ambiguous
  };
}

function deriveFormulaTuningFocus(subreports) {
  const backlog = subreports.stage6FormulaTuningBacklog || {};
  const summary = backlog.summary || {};
  const topProducerTrack = summary.topProducerTrack || 'none';
  const topAdjustmentKnob = summary.topAdjustmentKnob || 'none';
  const producerTrackAggregation = summary.producerTrackAggregation || {};
  const adjustmentKnobAggregation = summary.adjustmentKnobAggregation || {};
  return {
    status: backlog.overall || 'missing',
    topProducerTrack,
    topAdjustmentKnob,
    producerReviewRows: Number(summary.producerReviewRows || 0),
    tuningRecommendationCount: Number(summary.tuningRecommendationCount || 0),
    producerFieldRecommendationCount: Number(summary.producerFieldRecommendationCount || 0),
    producerTrackAggregation,
    adjustmentKnobAggregation,
    nextAction: backlog.nextAction || (
      topProducerTrack && topProducerTrack !== 'none'
        ? 'tune_stage6_producer_formula_or_proof_generation'
        : 'wait_for_fresh_stage6_or_no_formula_tuning_action'
    ),
    safety: {
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      tuningRepo: 'US_Alpha_Seeker'
    }
  };
}

function deriveOverall({ lineage, runtimeProof, stages }) {
  if (lineage.status === 'warn_artifacts_missing') return 'warn_artifacts_missing';
  if (lineage.status === 'warn_lineage_mismatch') return 'warn_lineage_mismatch';
  if (lineage.status === 'warn_lineage_incomplete') return 'warn_lineage_incomplete';
  if (Object.values(stages).some((stage) => stage.readError)) return 'warn_artifact_read_error';
  if (runtimeProof.status === 'warn_runtime_formula_evidence_weak') return 'warn_stage6_formula_evidence_weak';
  if (runtimeProof.status !== 'pass_runtime_proof_fields_present') return 'warn_stage6_runtime_proof_pending';
  return 'pass_stage3_6_full_stage_audit';
}

function nextActions(overall, lineage, runtimeProof, stage6EntryEvidence, formulaTuningFocus) {
  const actions = [];
  if (lineage.status !== 'pass_same_run_lineage') {
    actions.push('Refresh or download same-run Stage3/4/5/6 artifacts before making a final full-chain quality judgement.');
    if (Array.isArray(lineage.reason) && lineage.reason.includes('stage5_source_stage4_missing')) {
      actions.push('Add or verify Stage5 manifest sourceStage4File/stage4File lineage so Stage4->Stage5 same-run ownership can be proven.');
    }
  }
  if (runtimeProof.status === 'warn_runtime_formula_evidence_weak') {
    actions.push('Refresh Stage6 formula evidence so neutral rows do not expose positive zero-executable tuning gaps.');
  } else if (runtimeProof.status !== 'pass_runtime_proof_fields_present') {
    actions.push('Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.');
  }
  if (stage6EntryEvidence.status === 'pending_entry_fillability_evidence') {
    actions.push(`Wait for the next Auto-Scheduler run on 2c9b66ee or later, then verify Stage6 entry/fillability evidence fields: ${stage6EntryEvidence.missingCoreFields.join(', ')}.`);
  }
  if (formulaTuningFocus.topProducerTrack && formulaTuningFocus.topProducerTrack !== 'none') {
    actions.push(`Prioritize Stage6 producer tuning track: ${formulaTuningFocus.topProducerTrack} via ${formulaTuningFocus.topAdjustmentKnob}; do not solve this in sidecar.`);
  }
  if (overall === 'pass_stage3_6_full_stage_audit') {
    actions.push('Proceed to bounded Stage6 producer tuning only for proven formula or blocker defects.');
  } else {
    actions.push('Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.');
  }
  return actions;
}

function mdTable(headers, rows) {
  const safeRows = rows.length ? rows : [headers.map(() => 'N/A')];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell ?? 'N/A').replace(/\n/g, '<br>')).join(' | ')} |`)
  ].join('\n');
}

function compactJson(value) {
  return JSON.stringify(value ?? {});
}

function coverageSummary(cov) {
  return Object.entries(cov || {})
    .map(([field, info]) => `${field}:${info.present}/${info.total}`)
    .join('<br>') || 'N/A';
}

function buildMarkdown(report) {
  const stageRows = Object.entries(report.stageVerdicts).map(([stage, verdict]) => [
    stage,
    verdict.verdict,
    verdict.rows,
    verdict.source || 'N/A',
    coverageSummary(verdict.coverage)
  ]);
  const lineageRows = [
    ['Stage4<-Stage3', report.lineage.stage4SourceStage3File || 'missing', report.lineage.stage3File || 'missing', report.lineage.stage4MatchesStage3, 'N/A'],
    ['Stage5<-Stage4', report.lineage.stage5SourceStage4File || 'missing', report.lineage.stage4File || 'missing', report.lineage.stage5MatchesStage4, report.lineage.stage5SourceStage4LineageStatus || 'missing'],
    ['Stage6<-Stage5', report.lineage.stage6SourceStage5File || 'missing', report.lineage.stage5File || 'missing', report.lineage.stage6MatchesStage5, 'N/A']
  ];
  const runtimeRows = Object.entries(report.runtimeProof.fieldCoverage).map(([field, info]) => [field, `${info.present}/${info.total}`, info.pct]);
  const runtimeMissingLabel = report.runtimeProof.status === 'pass_runtime_proof_fields_present'
    ? 'Raw finalist-only missing fields (non-blocking; subreport proof passed)'
    : 'Missing/Pending fields';
  const subreportRows = Object.entries(report.auditSources).map(([name, info]) => [name, info.present ? 'yes' : 'no', info.overall, info.generatedAt || 'N/A', info.path]);
  const blockerRows = Object.entries(report.blockerSummary)
    .filter(([key]) => key !== 'rootCauseSummary')
    .map(([key, value]) => [key, compactJson(value)]);
  const formulaTuningRows = [
    ['status', report.formulaTuningFocus.status],
    ['topProducerTrack', report.formulaTuningFocus.topProducerTrack],
    ['topAdjustmentKnob', report.formulaTuningFocus.topAdjustmentKnob],
    ['producerReviewRows', report.formulaTuningFocus.producerReviewRows],
    ['tuningRecommendationCount', report.formulaTuningFocus.tuningRecommendationCount],
    ['producerFieldRecommendationCount', report.formulaTuningFocus.producerFieldRecommendationCount],
    ['producerTrackAggregation', compactJson(report.formulaTuningFocus.producerTrackAggregation)],
    ['adjustmentKnobAggregation', compactJson(report.formulaTuningFocus.adjustmentKnobAggregation)],
    ['nextAction', report.formulaTuningFocus.nextAction]
  ];
  const dataHealthRows = Object.entries(report.stageDataHealth).map(([stage, health]) => [
    stage,
    health.rows,
    compactJson(health.scoreBounds),
    compactJson(health.sourceCounts),
    compactJson(health.freshnessCoverage),
    compactJson(health.freshnessAge),
    compactJson(health.fallbackFlagCounts),
    health.priceHistory ? compactJson(health.priceHistory) : 'N/A'
  ]);
  const dataHealthFindings = dataHealthFindingRows(report.stageDataHealth);
  const formulaRows = Object.entries(report.formulaEvidence.byStage || {}).map(([stage, info]) => [
    stage,
    `${info.present}/${info.checks}`,
    info.missingRequired,
    compactJson(info.sources)
  ]);
  const missingFormulaRows = report.formulaEvidence.missingRequiredChecks.map((check) => [
    check.source,
    check.stage,
    check.id,
    check.file || 'N/A',
    check.line || 'N/A'
  ]);
  const entryEvidenceRows = Object.entries(report.stage6EntryEvidence.fieldCoverage).map(([field, info]) => [
    field,
    `${info.present}/${info.total}`,
    info.pct,
    report.stage6EntryEvidence.numericRanges[field]
      ? `${report.stage6EntryEvidence.numericRanges[field].min ?? 'N/A'}..${report.stage6EntryEvidence.numericRanges[field].max ?? 'N/A'}`
      : 'N/A'
  ]);
  const entryPolicyRows = Object.entries(report.stage6EntryEvidence.policyCounts).map(([field, counts]) => [field, compactJson(counts)]);

  return `# Stage3-6 Full Stage Audit\n\n` +
    `- GeneratedAt: ${report.generatedAt}\n` +
    `- Overall: **${report.overall}**\n` +
    `- Lineage: **${report.lineage.status}**; final quality judgement: **${report.lineage.finalQualityJudgement}**\n` +
    `- Stage6 Runtime Proof: **${report.runtimeProof.status}**\n` +
    `- Formula Evidence: **${report.formulaEvidence.status}** (${report.formulaEvidence.presentChecks}/${report.formulaEvidence.totalChecks})\n` +
    `- Blocker Classification: **${report.blockerClassificationHealth.status}**\n` +
    `- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.\n\n` +
    `## Lineage\n\n${mdTable(['Edge', 'Producer Source', 'Local Artifact', 'Match', 'Source Status'], lineageRows)}\n\n` +
    `Reasons: ${report.lineage.reason.join(', ')}\n\n` +
    `## Stage Verdicts\n\n${mdTable(['Stage', 'Verdict', 'Rows', 'Source', 'Coverage'], stageRows)}\n\n` +
    `## Stage Formula Evidence\n\n${mdTable(['Stage', 'Present / Checks', 'Missing Required', 'Evidence Sources'], formulaRows)}\n\n` +
    `${missingFormulaRows.length ? `${mdTable(['Source', 'Stage', 'Check', 'File', 'Line'], missingFormulaRows)}\n\n` : 'Missing required formula evidence: none\n\n'}` +
    `## Stage Data Health\n\n${mdTable(['Stage', 'Rows', 'Score Bounds', 'Source Counts', 'Freshness Coverage', 'Freshness Age', 'Fallback Flags', 'Price History'], dataHealthRows)}\n\n` +
    `${dataHealthFindings.length ? 'Data health findings:' : 'Data health findings: none'}\n\n` +
    `${dataHealthFindings.length ? `${mdTable(['Stage', 'Category', 'Field', 'Finding', 'Range / Coverage'], dataHealthFindings)}\n\n` : ''}` +
    `## Stage6 Entry / Fillability Evidence\n\n` +
    `Status: **${report.stage6EntryEvidence.status}**. Missing core fields: ${report.stage6EntryEvidence.missingCoreFields.length ? report.stage6EntryEvidence.missingCoreFields.join(', ') : 'none'}\n\n` +
    `${mdTable(['Field', 'Present / Total', 'Pct', 'Numeric Range'], entryEvidenceRows)}\n\n` +
    `${mdTable(['Policy Field', 'Counts'], entryPolicyRows)}\n\n` +
    `## Stage6 Formula Tuning Focus\n\n${mdTable(['Metric', 'Value'], formulaTuningRows)}\n\n` +
    `## Stage6 Runtime Proof Gate\n\n` +
    `Expected producer head: ${report.runtimeProof.expectedProducerHead}\n\n` +
    `${mdTable(['Field', 'Present / Total', 'Pct'], runtimeRows)}\n\n` +
    `${runtimeMissingLabel}: ${report.runtimeProof.missingFields.length ? report.runtimeProof.missingFields.join(', ') : 'none'}\n\n` +
    `## Blocker Summary\n\n${mdTable(['Metric', 'Counts'], blockerRows)}\n\n` +
    `Blocker classification health: **${report.blockerClassificationHealth.status}**. Ambiguous buckets: ${report.blockerClassificationHealth.ambiguous.length ? compactJson(report.blockerClassificationHealth.ambiguous) : 'none'}\n\n` +
    `Root cause summary: ${compactJson(report.blockerSummary.rootCauseSummary)}\n\n` +
    `## Integrated Subreports\n\n${mdTable(['Report', 'Present', 'Overall', 'GeneratedAt', 'Path'], subreportRows)}\n\n` +
    `## Next Actions\n\n${report.nextActions.map((item) => `- ${item}`).join('\n')}\n\n` +
    `## Interpretation\n\n` +
    `- This report does not prove alpha performance or live readiness.\n` +
    `- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.\n` +
    `- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.\n` +
    `- Broker submit/reprice/replace and sidecar mutation are outside this audit.\n`;
}

function main() {
  const generatedAt = new Date().toISOString();
  const stages = Object.fromEntries(Object.keys(STAGE_CONFIGS).map((stageKey) => [stageKey, loadStage(stageKey)]));
  const subreports = summarizeSubreports();
  const lineage = deriveLineage(stages);
  const runtimeProof = deriveRuntimeProof(stages.stage6.rows, subreports);
  const formulaEvidence = deriveFormulaEvidence(subreports);
  const stageVerdicts = deriveStageVerdicts(stages, subreports, runtimeProof);
  const stageDataHealth = deriveStageDataHealth(stages, generatedAt);
  const stage6EntryEvidence = deriveStage6EntryEvidence(stages.stage6.rows);
  const blockerSummary = deriveBlockerSummary(stages.stage6.rows, subreports);
  const blockerClassificationHealth = deriveBlockerClassificationHealth(blockerSummary);
  const formulaTuningFocus = deriveFormulaTuningFocus(subreports);
  const overall = deriveOverall({ lineage, runtimeProof, stages });
  const report = {
    schemaVersion: 'stage3_6_full_stage_audit.v2',
    generatedAt,
    overall,
    safety: {
      reportOnly: true,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      executionPolicyChanged: false
    },
    inputs: Object.fromEntries(Object.entries(stages).map(([key, stage]) => [key, {
      file: stage.file,
      path: stage.path,
      hash: stage.hash,
      source: stage.source,
      missing: stage.missing,
      rowCount: stage.rowCount,
      manifest: stage.manifest
    }])),
    lineage,
    runtimeProof,
    formulaEvidence,
    stageVerdicts,
    stageDataHealth,
    stage6EntryEvidence,
    formulaTuningFocus,
    blockerSummary,
    blockerClassificationHealth,
    auditSources: subreports,
    nextActions: nextActions(overall, lineage, runtimeProof, stage6EntryEvidence, formulaTuningFocus)
  };

  writeJsonAtomic(OUT_JSON, report);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.log(`[STAGE3_6_FULL_AUDIT] overall=${overall} lineage=${lineage.status} runtimeProof=${runtimeProof.status}`);
  console.log(`[STAGE3_6_FULL_AUDIT] json=${OUT_JSON} md=${OUT_MD}`);
}

main();
