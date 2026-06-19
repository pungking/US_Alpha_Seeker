#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = 'state/stage3-5-methodology-audit.json';
const OUT_MD = 'docs/STAGE3_5_METHODOLOGY_AUDIT.md';
const POLICY_FILES = {
  stage4ShortHistoryPolicy: 'docs/STAGE4_SHORT_HISTORY_POLICY.md'
};

const SOURCE_FILES = {
  stage3: 'components/FundamentalAnalysis.tsx',
  stage4: 'components/TechnicalAnalysis.tsx',
  stage5: 'components/IctAnalysis.tsx',
  stage6: 'components/AlphaAnalysis.tsx'
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function readText(filePath) {
  return fs.readFileSync(resolveRepo(filePath), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function writeTextAtomic(filePath, text) {
  const fullPath = resolveRepo(filePath);
  ensureParent(fullPath);
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, text);
  fs.renameSync(tmpPath, fullPath);
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function fileExists(filePath) {
  return fs.existsSync(resolveRepo(filePath));
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE35_METHODOLOGY_STAGE6_PATH) return process.env.STAGE35_METHODOLOGY_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE35_METHODOLOGY_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  return files[0]?.full || null;
}

function latestArtifactPath({ envPath, envDir, defaultDir, pattern }) {
  if (process.env[envPath]) return { path: process.env[envPath], source: envPath };
  const dir = resolveRepo(process.env[envDir] || defaultDir);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => pattern.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  return files.length ? { path: files[0].full, source: envDir } : { path: null, source: 'not_available' };
}

function num(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(digits)) : null;
}

function pct(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0;
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function rowsFromStage6(stage6) {
  if (Array.isArray(stage6?.alpha_candidates) && stage6.alpha_candidates.length > 0) {
    return stage6.alpha_candidates.filter((row) => normalizeSymbol(row));
  }
  const contract = stage6?.execution_contract || {};
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

function rowsFromStageArtifact(payload, stage) {
  const candidateKeys = {
    Stage3: ['fundamental_universe', 'fundamentalUniverse', 'stage3', 'candidates', 'results', 'data'],
    Stage4: ['technical_universe', 'technicalUniverse', 'stage4', 'technical_candidates', 'stage4_candidates', 'candidates', 'results', 'data'],
    Stage5: ['ict_universe', 'ictUniverse', 'stage5', 'ict_candidates', 'elite_candidates', 'stage5_candidates', 'candidates', 'results', 'data']
  }[stage] || [];
  for (const key of candidateKeys) {
    if (Array.isArray(payload?.[key])) return payload[key].filter((row) => normalizeSymbol(row));
  }
  if (Array.isArray(payload)) return payload.filter((row) => normalizeSymbol(row));
  return [];
}

function loadRows({ stage, artifactPath, fallbackRows }) {
  if (!artifactPath) return { rows: fallbackRows, mode: 'stage6_finalist_fallback', file: null, hash: null, count: fallbackRows.length };
  const payload = readJson(artifactPath);
  const rows = rowsFromStageArtifact(payload, stage);
  return {
    rows: rows.length ? rows : fallbackRows,
    mode: rows.length ? 'full_stage_artifact' : 'stage6_finalist_fallback_empty_artifact',
    file: path.basename(artifactPath),
    hash: fileSha256(artifactPath),
    count: rows.length || fallbackRows.length
  };
}

function lineOf(file, pattern) {
  const text = readText(file);
  const idx = text.search(pattern);
  if (idx < 0) return null;
  return text.slice(0, idx).split('\n').length;
}

function hasPattern(file, pattern) {
  return pattern.test(readText(file));
}

function coverage(rows, field) {
  const present = rows.filter((row) => row?.[field] !== undefined && row?.[field] !== null && row?.[field] !== '').length;
  return { present, total: rows.length, pct: pct(present, rows.length) };
}

function nestedCoverage(rows, fieldPath) {
  const parts = fieldPath.split('.');
  const present = rows.filter((row) => {
    let cur = row;
    for (const part of parts) cur = cur?.[part];
    return cur !== undefined && cur !== null && cur !== '';
  }).length;
  return { present, total: rows.length, pct: pct(present, rows.length) };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function numericStats(rows, field) {
  const values = rows.map((row) => num(row?.[field])).filter((v) => v != null).sort((a, b) => a - b);
  if (!values.length) return { count: 0, min: null, max: null, avg: null };
  return {
    count: values.length,
    min: round(values[0]),
    max: round(values[values.length - 1]),
    avg: round(values.reduce((sum, v) => sum + v, 0) / values.length)
  };
}

function addFinding(findings, stage, severity, id, title, evidence, recommendation, file = null, line = null) {
  findings.push({ stage, severity, id, title, evidence, recommendation, file, line });
}

function severityScore(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function methodCheck(stage, id, title, file, pattern, expected, weight = 1) {
  const present = hasPattern(file, pattern);
  return { stage, id, title, file, line: lineOf(file, pattern), present, expected, weight };
}

function buildStaticMethodChecks() {
  return [
    methodCheck('Stage3', 'stage3_score_bounds_clamp', 'Stage3 score outputs are clamped to a 0-100 contract after penalties and sector bonus.', SOURCE_FILES.stage3, /clampScore[\s\S]*fundamentalScoreRawAfterSectorBonus[\s\S]*r\.fundamentalScore\s*=\s*clampScore/, true, 3),
    methodCheck('Stage3', 'stage3_imputation_flag', 'Stage3 marks imputed fundamentals and downgrades data confidence.', SOURCE_FILES.stage3, /isImputed[\s\S]*dataConfidence\s*=\s*Math\.min\(analysis\.dataConfidence,\s*60\)/, true, 2),
    methodCheck('Stage3', 'stage3_integrity_reasons', 'Stage3 emits integrityReasons for cashflow/net-income penalties.', SOURCE_FILES.stage3, /integrityReasons[\s\S]*cashflow_non_positive[\s\S]*net_income_missing/, true, 2),
    methodCheck('Stage3', 'stage3_roic_debt_source_audit', 'Stage3 records ROIC debt source mix instead of hiding fallback debt assumptions.', SOURCE_FILES.stage3, /roicDebtSourceCounts[\s\S]*RATIO_PROXY[\s\S]*Effective mode/, true, 2),
    methodCheck('Stage3', 'stage3_zscore_coverage', 'Stage3/Stage2 handoff preserves Z-score model and coverage metadata.', SOURCE_FILES.stage3, /zScoreModel|zScoreCoveragePct|zScoreConfidence/, true, 1),
    methodCheck('Stage4', 'stage4_data_quality_caps', 'Stage4 caps stale and illiquid technical scores.', SOURCE_FILES.stage4, /dataQualityScoreCap\s*=\s*68[\s\S]*dataQualityScoreCap\s*=\s*58/, true, 3),
    methodCheck('Stage4', 'stage4_heuristic_fallback_visible', 'Stage4 heuristic fallback is explicit and auditable.', SOURCE_FILES.stage4, /dataSource:\s*'HEURISTIC'/, true, 2),
    methodCheck('Stage4', 'stage4_price_history_and_metrics', 'Stage4 carries OHLCV priceHistory and expanded techMetrics downstream.', SOURCE_FILES.stage4, /priceHistory[\s\S]*techMetrics[\s\S]*rawRvol|techMetrics[\s\S]*priceHistory[\s\S]*rawRvol/, true, 2),
    methodCheck('Stage4', 'stage4_score_breakdown', 'Stage4 emits scoreBreakdown/finalScore for formula traceability.', SOURCE_FILES.stage4, /scoreBreakdown[\s\S]*finalScore/, true, 2),
    methodCheck('Stage5', 'stage5_weighted_composite', 'Stage5 composite uses explicit fundamental/technical/ICT weights.', SOURCE_FILES.stage5, /baseFundamentalPart\s*=\s*item\.fundamentalScore\s*\*\s*0\.20[\s\S]*baseTechnicalPart\s*=\s*item\.technicalScore\s*\*\s*0\.30[\s\S]*baseIctPart\s*=\s*ictAnalysis\.score\s*\*\s*0\.50/, true, 3),
    methodCheck('Stage5', 'stage5_stale_multiplier', 'Stage5 discounts stale technical data before composite ranking.', SOURCE_FILES.stage5, /dataQualityMultiplier\s*=\s*0\.75/, true, 2),
    methodCheck('Stage5', 'stage5_geometry_fallback_counter', 'Stage5 counts fallback geometry usage for execution box audit.', SOURCE_FILES.stage5, /fallback_52w/, true, 2),
    methodCheck('Stage5', 'stage5_ict_metric_components', 'Stage5 carries ICT metric components instead of a naked score.', SOURCE_FILES.stage5, /displacement[\s\S]*liquiditySweep[\s\S]*marketStructure[\s\S]*orderBlock[\s\S]*smartMoneyFlow/, true, 2),
    methodCheck('Stage6', 'stage6_weak_pillar_gate', 'Stage6 blocks weak-pillar executable rows unless explicit waiver is enabled.', SOURCE_FILES.stage6, /wait_weak_pillar_execution_gate[\s\S]*WEAK_PILLAR_GATE_BLOCKED_EXECUTION/, true, 3),
    methodCheck('Stage6', 'stage6_non_actionable_verdict_gate', 'Stage6 prevents non-actionable verdicts from becoming executable.', SOURCE_FILES.stage6, /wait_verdict_not_sidecar_actionable[\s\S]*QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT/, true, 3),
    methodCheck('Stage6', 'stage6_breakout_proof_gate', 'Stage6 breakout promotion requires proofConfirmed; reviewReady never promotes by itself.', SOURCE_FILES.stage6, /proofConfirmed_and_current_rr_target_buffer_required; reviewReady_never_promotes/, true, 3)
  ];
}

function scoreMethodChecks(checks, stage) {
  const stageChecks = checks.filter((item) => item.stage === stage);
  const total = stageChecks.reduce((sum, item) => sum + item.weight, 0);
  const pass = stageChecks.filter((item) => item.present === item.expected).reduce((sum, item) => sum + item.weight, 0);
  return total ? Math.round((pass / total) * 100) : 0;
}

function stage3ArtifactAudit(rows, findings) {
  const required = ['fundamentalScore', 'qualityScore', 'profitScore', 'safeScore', 'valueScore', 'dataQuality', 'integrityReasons', 'isImputed', 'compositeAlpha'];
  const cov = Object.fromEntries(required.map((field) => [field, coverage(rows, field)]));
  const outOfRange = rows.filter((row) => {
    const f = num(row.fundamentalScore);
    const c = num(row.compositeAlpha);
    return f == null || f < 0 || f > 100 || c == null || c < 0 || c > 100;
  }).map((row) => ({ symbol: normalizeSymbol(row), fundamentalScore: row.fundamentalScore, compositeAlpha: row.compositeAlpha }));
  if (outOfRange.length) {
    addFinding(findings, 'Stage3', 'critical', 'stage3_score_bounds_violation_in_artifact', 'Stage3 artifact rows violate bounded score contract.', outOfRange.slice(0, 20), 'Fresh Stage3 should regenerate after clamp fix; do not use stale artifacts for final policy judgement.', SOURCE_FILES.stage3, lineOf(SOURCE_FILES.stage3, /clampScore/));
  }
  const missingIntegrity = rows.filter((row) => !Array.isArray(row.integrityReasons)).map((row) => normalizeSymbol(row));
  if (missingIntegrity.length) {
    addFinding(findings, 'Stage3', 'medium', 'stage3_integrity_reasons_coverage_gap', 'Some rows do not expose integrityReasons.', { sample: missingIntegrity.slice(0, 20), count: missingIntegrity.length }, 'Emit integrityReasons as an array for every Stage3 row, even when empty.');
  }
  return {
    rows: rows.length,
    scoreStats: numericStats(rows, 'fundamentalScore'),
    compositeStats: numericStats(rows, 'compositeAlpha'),
    coverage: cov,
    dataQualityCounts: countBy(rows, (row) => String(row.dataQuality || 'missing')),
    imputedCount: rows.filter((row) => row.isImputed === true).length,
    clampAppliedCount: rows.filter((row) => row.fundamentalScoreClampApplied === true).length
  };
}

function stage4ArtifactAudit(rows, findings, stage6Rows = []) {
  const cov = {
    technicalScore: coverage(rows, 'technicalScore'),
    scoreBreakdown: coverage(rows, 'scoreBreakdown'),
    priceHistory: coverage(rows, 'priceHistory'),
    dataSource: coverage(rows, 'dataSource'),
    techMetrics: coverage(rows, 'techMetrics'),
    finalScore: nestedCoverage(rows, 'scoreBreakdown.finalScore'),
    rsi: nestedCoverage(rows, 'techMetrics.rsi'),
    adx: nestedCoverage(rows, 'techMetrics.adx'),
    dataQualityState: nestedCoverage(rows, 'techMetrics.dataQualityState')
  };
  const shortHistory = rows.filter((row) => Array.isArray(row.priceHistory) && row.priceHistory.length < 80).map((row) => ({ symbol: normalizeSymbol(row), bars: row.priceHistory.length }));
  const executableSymbols = new Set(stage6Rows
    .filter((row) => String(row.finalDecision || '').toUpperCase() === 'EXECUTABLE_NOW')
    .map((row) => normalizeSymbol(row)));
  const shortHistoryExecutable = shortHistory.filter((row) => executableSymbols.has(row.symbol));
  const shortHistoryPolicy = {
    policyPresent: fileExists(POLICY_FILES.stage4ShortHistoryPolicy),
    shortHistoryRows: shortHistory.length,
    shortHistoryExecutableRows: shortHistoryExecutable.length,
    status: shortHistoryExecutable.length
      ? 'short_history_executable_review_required'
      : shortHistory.length
        ? 'short_history_non_executable_observation'
        : 'no_short_history_rows'
  };
  if (shortHistory.length) {
    if (shortHistoryExecutable.length || !shortHistoryPolicy.policyPresent) {
      addFinding(findings, 'Stage4', 'medium', 'stage4_short_price_history', 'Some Stage4 rows have fewer than 80 bars.', { shortHistory: shortHistory.slice(0, 20), shortHistoryExecutable, policyPresent: shortHistoryPolicy.policyPresent }, 'Downgrade structure/ICT confidence or block execution promotion when history is short.');
    } else {
      addFinding(findings, 'Stage4', 'low', 'stage4_short_history_non_executable_observation', 'Short technical history was observed, but it did not reach Stage6 executable rows.', shortHistory.slice(0, 20), 'Keep this visible as data-quality telemetry; escalate only if a short-history row is promoted to executable.');
    }
  }
  const heuristicHigh = rows.filter((row) => String(row.dataSource || '').toUpperCase() === 'HEURISTIC' && (num(row.technicalScore) ?? 0) > 58).map((row) => ({ symbol: normalizeSymbol(row), dataSource: row.dataSource, technicalScore: row.technicalScore }));
  if (heuristicHigh.length) {
    addFinding(findings, 'Stage4', 'high', 'stage4_heuristic_score_too_high', 'Heuristic technical fallback produced a high score.', heuristicHigh.slice(0, 20), 'Cap heuristic rows and prevent breakout/structure promotion from non-OHLCV evidence.', SOURCE_FILES.stage4, lineOf(SOURCE_FILES.stage4, /dataSource:\s*'HEURISTIC'/));
  }
  return {
    rows: rows.length,
    scoreStats: numericStats(rows, 'technicalScore'),
    coverage: cov,
    dataSourceCounts: countBy(rows, (row) => String(row.dataSource || 'missing')),
    dataQualityStateCounts: countBy(rows, (row) => String(row.techMetrics?.dataQualityState || 'missing')),
    shortHistoryPolicy,
    priceHistoryBars: rows.map((row) => ({ symbol: normalizeSymbol(row), bars: Array.isArray(row.priceHistory) ? row.priceHistory.length : 0 })).slice(0, 50)
  };
}

function stage5ArtifactAudit(rows, findings) {
  const cov = {
    ictScore: coverage(rows, 'ictScore'),
    ictMetrics: coverage(rows, 'ictMetrics'),
    compositeBreakdown: coverage(rows, 'compositeBreakdown'),
    pdZone: coverage(rows, 'pdZone'),
    executionGeometrySource: coverage(rows, 'executionGeometrySource'),
    displacement: nestedCoverage(rows, 'ictMetrics.displacement'),
    liquiditySweep: nestedCoverage(rows, 'ictMetrics.liquiditySweep'),
    marketStructure: nestedCoverage(rows, 'ictMetrics.marketStructure'),
    orderBlock: nestedCoverage(rows, 'ictMetrics.orderBlock'),
    smartMoneyFlow: nestedCoverage(rows, 'ictMetrics.smartMoneyFlow'),
    baseFundamentalPart: nestedCoverage(rows, 'compositeBreakdown.baseFundamentalPart'),
    baseTechnicalPart: nestedCoverage(rows, 'compositeBreakdown.baseTechnicalPart'),
    baseIctPart: nestedCoverage(rows, 'compositeBreakdown.baseIctPart')
  };
  const weakMetricHighScore = rows.filter((row) => {
    const score = num(row.ictScore) ?? 0;
    const metrics = row.ictMetrics || {};
    const evidence = ['displacement', 'liquiditySweep', 'marketStructure', 'orderBlock', 'smartMoneyFlow'].filter((key) => num(metrics[key]) != null).length;
    return score >= 80 && evidence < 5;
  }).map((row) => ({ symbol: normalizeSymbol(row), ictScore: row.ictScore, ictMetrics: row.ictMetrics || null }));
  if (weakMetricHighScore.length) {
    addFinding(findings, 'Stage5', 'high', 'stage5_high_score_without_metric_evidence', 'High ICT score lacks full component evidence.', weakMetricHighScore.slice(0, 20), 'Do not allow high-confidence ICT usage without full metric components.');
  }
  return {
    rows: rows.length,
    scoreStats: numericStats(rows, 'ictScore'),
    coverage: cov,
    pdZoneCounts: countBy(rows, (row) => String(row.pdZone || 'missing')),
    geometrySourceCounts: countBy(rows, (row) => String(row.executionGeometrySource || 'missing')),
    factorCarryGuardCounts: countBy(rows, (row) => String(row.factorCarryGuard || row.compositeBreakdown?.factorCarryGuard || 'missing'))
  };
}

function interStageAudit(stage6, rows, findings) {
  const manifest = stage6?.manifest || {};
  const decisionGate = stage6?.decisionGate || manifest?.decisionGate || {};
  const missingLineage = [];
  if (!manifest.sourceStage5File) missingLineage.push('manifest.sourceStage5File');
  if (!manifest.sourceStage5Hash) missingLineage.push('manifest.sourceStage5Hash');
  if (!manifest.sourceStage5Count) missingLineage.push('manifest.sourceStage5Count');
  if (missingLineage.length) {
    addFinding(findings, 'InterStage', 'high', 'stage5_to_stage6_lineage_incomplete', 'Stage6 manifest does not fully identify Stage5 source.', missingLineage, 'Preserve source file/hash/count for every Stage6 artifact.');
  }
  const weakExecutable = rows.filter((row) => {
    const decision = String(row.finalDecision || '').toUpperCase();
    return decision === 'EXECUTABLE_NOW' && ((num(row.fundamentalScore) ?? 0) < 50 || (num(row.technicalScore) ?? 0) < 50 || (num(row.ictScore) ?? 0) < 60);
  }).map((row) => ({ symbol: normalizeSymbol(row), fundamentalScore: row.fundamentalScore, technicalScore: row.technicalScore, ictScore: row.ictScore, weakPillarGateVerdict: row.weakPillarGateVerdict || null }));
  if (weakExecutable.length) {
    addFinding(findings, 'InterStage', 'high', 'stage6_weak_pillar_executable_in_artifact', 'Stage6 artifact contains executable rows with weak Stage3/4/5 pillar.', weakExecutable.slice(0, 20), 'Fresh Stage6 should route these to WAIT_PRICE/wait_weak_pillar_execution_gate after weak-pillar gate fix.');
  }
  return {
    stage6Rows: rows.length,
    manifestSourceStage5File: manifest.sourceStage5File || null,
    manifestSourceStage5Hash: manifest.sourceStage5Hash || null,
    manifestSourceStage5Count: manifest.sourceStage5Count || null,
    decisionGateWeakPillarGateEnabled: decisionGate.weakPillarGateEnabled ?? null,
    decisionGateWeakPillarExecutableWaiver: decisionGate.weakPillarExecutableWaiver ?? null,
    decisionGateActionableVerdicts: decisionGate.actionableVerdicts || null,
    executableRows: rows.filter((row) => String(row.finalDecision || '').toUpperCase() === 'EXECUTABLE_NOW').length,
    weakExecutableCount: weakExecutable.length
  };
}

function stageScore({ methodScore, findingList, artifactMode }) {
  let score = methodScore;
  for (const f of findingList) {
    const s = severityScore(f.severity);
    if (s === 4) score -= 25;
    else if (s === 3) score -= 15;
    else if (s === 2) score -= 7;
    else if (s === 1) score -= 3;
  }
  if (artifactMode !== 'full_stage_artifact') score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(report) {
  const lines = [
    '# Stage3-5 Methodology Audit',
    '',
    `- GeneratedAt: ${report.generatedAt}`,
    `- Stage6: ${report.stage6.file || 'N/A'}`,
    `- Stage6Hash: ${report.stage6.hash || 'N/A'}`,
    `- Overall: **${report.overall}**`,
    '- Safety: report-only; no broker/state mutation.',
    '',
    '## Methodology Scores',
    '',
    '| Stage | Score | Artifact Mode | Main Risk |',
    '| --- | ---: | --- | --- |'
  ];
  for (const stage of ['Stage3', 'Stage4', 'Stage5', 'InterStage']) {
    lines.push(`| ${stage} | ${report.stageScores[stage]}/100 | ${esc(report.artifactSources[stage]?.mode || 'N/A')} | ${esc(report.stageMainRisks[stage] || 'none')} |`);
  }
  lines.push('', '## Artifact Sources', '', '| Stage | Mode | File | Rows | Hash |', '| --- | --- | --- | ---: | --- |');
  for (const [stage, source] of Object.entries(report.artifactSources)) {
    lines.push(`| ${stage} | ${esc(source.mode)} | ${esc(source.file || 'Stage6 finalist fallback')} | ${esc(source.count)} | ${esc(source.hash ? String(source.hash).slice(0, 12) : 'N/A')} |`);
  }
  lines.push('', '## Findings', '', '| Severity | Stage | ID | Evidence | Recommendation |', '| --- | --- | --- | --- | --- |');
  if (!report.findings.length) {
    lines.push('| PASS | all | none | no findings | keep monitoring |');
  } else {
    for (const f of report.findings) {
      lines.push(`| ${f.severity} | ${f.stage} | ${f.id} | ${esc(JSON.stringify(f.evidence).slice(0, 360))} | ${esc(f.recommendation)} |`);
    }
  }
  lines.push('', '## Static Method Checks', '', '| Stage | Present | Check | File | Line |', '| --- | --- | --- | --- | ---: |');
  for (const c of report.staticMethodChecks) {
    lines.push(`| ${esc(c.stage)} | ${c.present ? 'yes' : 'no'} | ${esc(c.id)} | ${esc(c.file)} | ${c.line || 0} |`);
  }
  lines.push('', '## Artifact Audit Snapshot');
  for (const stage of ['Stage3', 'Stage4', 'Stage5']) {
    const audit = report.artifactAudits[stage] || {};
    lines.push('', `### ${stage}`, '', '| Metric | Value |', '| --- | --- |');
    lines.push(`| rows | ${esc(audit.rows)} |`);
    lines.push(`| scoreStats | ${esc(JSON.stringify(audit.scoreStats || {}))} |`);
    if (audit.shortHistoryPolicy) lines.push(`| shortHistoryPolicy | ${esc(JSON.stringify(audit.shortHistoryPolicy))} |`);
    if (audit.dataQualityCounts) lines.push(`| dataQualityCounts | ${esc(JSON.stringify(audit.dataQualityCounts))} |`);
    if (audit.dataSourceCounts) lines.push(`| dataSourceCounts | ${esc(JSON.stringify(audit.dataSourceCounts))} |`);
    if (audit.pdZoneCounts) lines.push(`| pdZoneCounts | ${esc(JSON.stringify(audit.pdZoneCounts))} |`);
  }
  lines.push('', '## Interpretation', '', '- This audit evaluates methodology, not realized alpha performance.', '- Full confidence requires full Stage3/Stage4/Stage5 artifacts; Stage6 finalist fallback is useful but incomplete.', '- Score bounds, data lineage, fallback visibility, and weak-pillar contracts are prerequisites before tuning structure/breakout/target policies.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = stage6Path ? readJson(stage6Path) : null;
  const stage6Rows = stage6 ? rowsFromStage6(stage6) : [];
  const artifacts = {
    Stage3: latestArtifactPath({ envPath: 'STAGE35_METHODOLOGY_STAGE3_PATH', envDir: 'STAGE35_METHODOLOGY_STAGE3_DIR', defaultDir: 'state/stage3-audit-source', pattern: /^STAGE3_.*\.json$/i }),
    Stage4: latestArtifactPath({ envPath: 'STAGE35_METHODOLOGY_STAGE4_PATH', envDir: 'STAGE35_METHODOLOGY_STAGE4_DIR', defaultDir: 'state/stage4-audit-source', pattern: /^STAGE4_.*\.json$/i }),
    Stage5: latestArtifactPath({ envPath: 'STAGE35_METHODOLOGY_STAGE5_PATH', envDir: 'STAGE35_METHODOLOGY_STAGE5_DIR', defaultDir: 'state/stage5-audit-source', pattern: /^STAGE5_.*\.json$/i })
  };
  const sourceRows = {
    Stage3: loadRows({ stage: 'Stage3', artifactPath: artifacts.Stage3.path, fallbackRows: stage6Rows }),
    Stage4: loadRows({ stage: 'Stage4', artifactPath: artifacts.Stage4.path, fallbackRows: stage6Rows }),
    Stage5: loadRows({ stage: 'Stage5', artifactPath: artifacts.Stage5.path, fallbackRows: stage6Rows })
  };
  const findings = [];
  const staticMethodChecks = buildStaticMethodChecks();
  for (const check of staticMethodChecks) {
    if (check.present !== check.expected) {
      addFinding(findings, check.stage, check.weight >= 3 ? 'high' : 'medium', `${check.id}_missing`, `Static methodology check failed: ${check.title}`, { file: check.file }, 'Inspect producer code and either restore the guardrail or update the audit with a verified replacement.', check.file, check.line);
    }
  }
  const artifactAudits = {
    Stage3: stage3ArtifactAudit(sourceRows.Stage3.rows, findings),
    Stage4: stage4ArtifactAudit(sourceRows.Stage4.rows, findings, stage6Rows),
    Stage5: stage5ArtifactAudit(sourceRows.Stage5.rows, findings),
    InterStage: interStageAudit(stage6 || {}, stage6Rows, findings)
  };
  const stageScores = {};
  const stageMainRisks = {};
  for (const stage of ['Stage3', 'Stage4', 'Stage5', 'InterStage']) {
    const stageFindings = findings.filter((f) => f.stage === stage || (stage === 'InterStage' && f.stage === 'Stage6'));
    stageScores[stage] = stageScore({
      methodScore: scoreMethodChecks(staticMethodChecks, stage === 'InterStage' ? 'Stage6' : stage),
      findingList: stageFindings,
      artifactMode: stage === 'InterStage' ? 'stage6_contract' : sourceRows[stage].mode
    });
    const top = [...stageFindings].sort((a, b) => severityScore(b.severity) - severityScore(a.severity))[0];
    stageMainRisks[stage] = top ? top.title : 'none';
  }
  const worst = findings.reduce((max, f) => Math.max(max, severityScore(f.severity)), 0);
  const fullArtifactAvailable = ['Stage3', 'Stage4', 'Stage5'].every((stage) => sourceRows[stage].mode === 'full_stage_artifact');
  const overall = worst >= 4
    ? 'fail_methodology_contract_violation'
    : worst >= 3
      ? 'review_required_high'
      : fullArtifactAvailable
        ? 'pass_full_artifact_methodology_review'
        : 'review_required_full_artifacts_missing';
  const artifactSources = Object.fromEntries(Object.entries(sourceRows).map(([stage, src]) => [stage, {
    mode: src.mode,
    file: src.file,
    hash: src.hash,
    count: src.count,
    source: artifacts[stage].source,
    path: artifacts[stage].path
  }]));
  artifactSources.InterStage = {
    mode: 'stage6_contract',
    file: stage6Path ? path.basename(stage6Path) : null,
    hash: stage6Path ? fileSha256(stage6Path) : null,
    count: stage6Rows.length,
    source: stage6Path ? 'latest_stage6' : 'missing',
    path: stage6Path
  };
  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: stage6Path ? path.basename(stage6Path) : null,
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || (stage6Path ? fileSha256(stage6Path) : null),
      manifestTimestamp: stage6?.manifest?.timestamp || null
    },
    stageScores,
    stageMainRisks,
    artifactSources,
    artifactAudits,
    staticMethodChecks,
    findings: findings.sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || a.stage.localeCompare(b.stage)),
    safety: { reportOnly: true, brokerMutation: false, stateMutation: false },
    nextRecommendedActions: [
      'Generate or provide full Stage3/Stage4/Stage5 artifacts for a full-universe audit.',
      'Regenerate fresh Stage6 after Stage3 score-bound and weak-pillar gate fixes, then confirm stale findings disappear.',
      'Only after methodology contracts pass, tune structure/breakout/target recalibration policies.'
    ]
  };
  writeTextAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.log(`[STAGE3_5_METHODOLOGY_AUDIT] overall=${overall} findings=${findings.length} stage6Rows=${stage6Rows.length} json=${OUT_JSON}`);
  if (process.env.STAGE35_METHODOLOGY_STRICT === 'true' && overall.startsWith('fail')) process.exit(1);
}

main();
