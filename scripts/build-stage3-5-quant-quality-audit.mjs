#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const DEFAULT_STAGE3_DIR = 'state/stage3-audit-source';
const DEFAULT_STAGE4_DIR = 'state/stage4-audit-source';
const DEFAULT_STAGE5_DIR = 'state/stage5-audit-source';
const OUT_JSON = 'state/stage3-5-quant-quality-audit.json';
const OUT_MD = 'docs/STAGE3_5_QUANT_QUALITY_AUDIT.md';

const SOURCE_FILES = {
  stage3: 'components/FundamentalAnalysis.tsx',
  stage4: 'components/TechnicalAnalysis.tsx',
  stage5: 'components/IctAnalysis.tsx',
  stage6Bridge: 'components/AlphaAnalysis.tsx'
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
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

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE35_AUDIT_STAGE6_PATH) return process.env.STAGE35_AUDIT_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE35_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}`);
  return files[0].full;
}

function latestArtifactPath({ envPath, envDir, defaultDir, pattern }) {
  if (process.env[envPath]) return { path: process.env[envPath], source: envPath };
  const dir = resolveRepo(process.env[envDir] || defaultDir);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => pattern.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  return files.length ? { path: files[0].full, source: envDir } : { path: null, source: 'fallback_stage6_finalists' };
}

function num(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(digits));
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

function loadStageRows({ stage, artifactPath, fallbackRows }) {
  if (!artifactPath) return { rows: fallbackRows, mode: 'stage6_finalist_fallback', file: null, count: fallbackRows.length };
  const payload = readJson(artifactPath);
  const rows = rowsFromStageArtifact(payload, stage);
  return {
    rows: rows.length ? rows : fallbackRows,
    mode: rows.length ? 'full_stage_artifact' : 'stage6_finalist_fallback_empty_artifact',
    file: path.basename(artifactPath),
    count: rows.length || fallbackRows.length,
    hash: fileSha256(artifactPath)
  };
}

function coverage(rows, fields) {
  const result = {};
  for (const field of fields) {
    const present = rows.filter((row) => row?.[field] !== undefined && row?.[field] !== null && row?.[field] !== '').length;
    result[field] = { present, total: rows.length, pct: pct(present, rows.length) };
  }
  return result;
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
  const result = {};
  for (const row of rows) {
    const key = fn(row) || 'unknown';
    result[key] = (result[key] || 0) + 1;
  }
  return result;
}

function addFinding(findings, stage, severity, id, title, evidence, recommendation, file = null, line = null) {
  findings.push({ stage, severity, id, title, evidence, recommendation, file, line });
}

function severityScore(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1, info: 0 }[severity] ?? 0;
}

function lineOf(file, pattern) {
  const text = fs.readFileSync(resolveRepo(file), 'utf8');
  const idx = text.search(pattern);
  if (idx < 0) return null;
  return text.slice(0, idx).split('\n').length;
}

function hasPattern(file, pattern) {
  return pattern.test(fs.readFileSync(resolveRepo(file), 'utf8'));
}

function extractStaticFormulaEvidence() {
  const rules = [
    {
      stage: 'Stage3',
      id: 'stage3_integrity_penalty',
      file: SOURCE_FILES.stage3,
      pattern: /analysis\.fundamentalScore\s*=\s*clampScore\(analysis\.fundamentalScore\s*-\s*integrityPenalty\)/,
      title: 'Cashflow/net-income integrity penalty is applied before Stage3 output.'
    },
    {
      stage: 'Stage3',
      id: 'stage3_sector_bonus_score_clamp',
      file: SOURCE_FILES.stage3,
      pattern: /fundamentalScoreRawAfterSectorBonus[\s\S]*r\.fundamentalScore\s*=\s*clampScore\(fundamentalScoreRawAfterSectorBonus\)/,
      title: 'Stage3 sector momentum bonus is clamped back into the 0-100 score contract.'
    },
    {
      stage: 'Stage3',
      id: 'stage3_composite_formula',
      file: SOURCE_FILES.stage3,
      pattern: /r\.compositeAlpha\s*=\s*clampScore\(\(clampScore\(r\.qualityScore\)\s*\*\s*0\.3\)\s*\+\s*\(r\.fundamentalScore\s*\*\s*0\.7\)\)/,
      title: 'Stage3 compositeAlpha uses 30% qualityScore and 70% fundamentalScore after sector bonus with score-scale clamp.'
    },
    {
      stage: 'Stage4',
      id: 'stage4_data_quality_cap',
      file: SOURCE_FILES.stage4,
      pattern: /dataQualityScoreCap\s*=\s*68/,
      title: 'Stage4 caps stale technical scores.'
    },
    {
      stage: 'Stage4',
      id: 'stage4_illiquid_cap',
      file: SOURCE_FILES.stage4,
      pattern: /dataQualityScoreCap\s*=\s*58/,
      title: 'Stage4 caps illiquid technical scores.'
    },
    {
      stage: 'Stage4',
      id: 'stage4_displacement_floor',
      file: SOURCE_FILES.stage4,
      pattern: /techScore\s*=\s*Math\.max\(techScore,\s*92\)/,
      title: 'Stage4 displacement can floor technicalScore at 92.'
    },
    {
      stage: 'Stage4',
      id: 'stage4_heuristic_fallback',
      file: SOURCE_FILES.stage4,
      pattern: /dataSource:\s*'HEURISTIC'/,
      title: 'Stage4 has a heuristic fallback path when OHLCV is unavailable.'
    },
    {
      stage: 'Stage5',
      id: 'stage5_risk_on_weights',
      file: SOURCE_FILES.stage5,
      pattern: /baseFundamentalPart\s*=\s*item\.fundamentalScore\s*\*\s*0\.20[\s\S]*baseTechnicalPart\s*=\s*item\.technicalScore\s*\*\s*0\.30[\s\S]*baseIctPart\s*=\s*ictAnalysis\.score\s*\*\s*0\.50/,
      title: 'Stage5 risk-on composite uses 20% fundamental, 30% technical, 50% ICT.'
    },
    {
      stage: 'Stage5',
      id: 'stage5_data_quality_multiplier',
      file: SOURCE_FILES.stage5,
      pattern: /dataQualityMultiplier\s*=\s*0\.75/,
      title: 'Stage5 heavily discounts stale technical data.'
    },
    {
      stage: 'Stage5',
      id: 'stage5_geometry_fallback_counter',
      file: SOURCE_FILES.stage5,
      pattern: /fallback_52w/,
      title: 'Stage5 logs fallback 52-week execution geometry usage.'
    },
    {
      stage: 'Stage6Bridge',
      id: 'stage6_final_gate_pillars',
      file: SOURCE_FILES.stage6Bridge,
      pattern: /fundScore\s*>=\s*70\s*&&\s*techScore\s*>=\s*70\s*&&\s*ictScore\s*>=\s*80/,
      title: 'Stage6 final gate rewards all-three-pillar strength.'
    }
  ];

  return rules.map((rule) => ({
    ...rule,
    present: hasPattern(rule.file, rule.pattern),
    line: lineOf(rule.file, rule.pattern)
  }));
}

function stage3Audit(rows, findings) {
  const fields = [
    'fundamentalScore',
    'qualityScore',
    'profitScore',
    'safeScore',
    'valueScore',
    'roe',
    'debtToEquity',
    'zScoreModel',
    'zScoreCoveragePct',
    'dataQuality',
    'isImputed',
    'integrityReasons',
    'trendScore',
    'trendAdjustment',
    'seasonalityScore',
    'qualityFactorScore',
    'regimeAdjustment',
    'compositeAlpha'
  ];
  const cov = coverage(rows, fields);
  const outOfRange = rows
    .filter((row) => {
      const v = num(row?.fundamentalScore);
      return v == null || v < 0 || v > 100;
    })
    .map((row) => ({ symbol: normalizeSymbol(row), fundamentalScore: row?.fundamentalScore }));
  if (outOfRange.length) {
    addFinding(
      findings,
      'Stage3',
      'critical',
      'stage3_fundamental_score_out_of_range',
      'fundamentalScore escaped the expected 0-100 score scale.',
      outOfRange,
      'Clamp or re-normalize Stage3 fundamentalScore after sector/momentum bonuses, then update fixture expectations.',
      SOURCE_FILES.stage3,
      lineOf(SOURCE_FILES.stage3, /fundamentalScoreRawAfterSectorBonus/)
    );
  }
  const missingIntegrity = rows
    .filter((row) => !Array.isArray(row?.integrityReasons))
    .map((row) => normalizeSymbol(row));
  if (missingIntegrity.length) {
    addFinding(
      findings,
      'Stage3',
      'medium',
      'stage3_integrity_reasons_missing',
      'Some rows lack an integrityReasons array.',
      missingIntegrity,
      'Always emit integrityReasons, even when empty, so downstream audits can distinguish clean data from missing metadata.'
    );
  }
  const qualityDivergence = rows
    .map((row) => ({
      symbol: normalizeSymbol(row),
      fundamentalScore: num(row?.fundamentalScore),
      qualityScore: num(row?.qualityScore),
      delta: num(row?.fundamentalScore) != null && num(row?.qualityScore) != null
        ? round(Math.abs(num(row.fundamentalScore) - num(row.qualityScore)))
        : null
    }))
    .filter((row) => row.delta != null && row.delta >= 20);
  if (qualityDivergence.length) {
    addFinding(
      findings,
      'Stage3',
      'medium',
      'stage3_score_semantics_ambiguous',
      'qualityScore and fundamentalScore diverge materially; this may be valid, but the score semantics need a data dictionary.',
      qualityDivergence,
      'Document qualityScore vs fundamentalScore semantics and add a fixture proving expected post-sector-bonus behavior.'
    );
  }
  return {
    coverage: cov,
    outOfRange,
    qualityDivergence,
    scoreStats: numericStats(rows, 'fundamentalScore'),
    dataQualityCounts: countBy(rows, (row) => String(row?.dataQuality || 'missing')),
    zScoreModelCounts: countBy(rows, (row) => String(row?.zScoreModel || 'missing')),
    imputedCount: rows.filter((row) => bool(row?.isImputed)).length
  };
}

function stage4Audit(rows, findings) {
  const fields = [
    'technicalScore',
    'scoreBreakdown',
    'priceHistory',
    'dataSource',
    'techMetrics',
    'high52',
    'low52',
    'recentSwingHigh',
    'recentSwingLow'
  ];
  const cov = coverage(rows, fields);
  const nested = {
    scoreBreakdownFinalScore: nestedCoverage(rows, 'scoreBreakdown.finalScore'),
    techRsi: nestedCoverage(rows, 'techMetrics.rsi'),
    techAdx: nestedCoverage(rows, 'techMetrics.adx'),
    techRawRvol: nestedCoverage(rows, 'techMetrics.rawRvol'),
    techSqueezeState: nestedCoverage(rows, 'techMetrics.squeezeState'),
    techMinerviniPassCount: nestedCoverage(rows, 'techMetrics.minerviniPassCount'),
    techSignalQualityState: nestedCoverage(rows, 'techMetrics.signalQualityState'),
    techDataQualityState: nestedCoverage(rows, 'techMetrics.dataQualityState')
  };
  const scoreMismatch = rows
    .map((row) => {
      const a = num(row?.technicalScore);
      const b = num(row?.scoreBreakdown?.finalScore);
      return { symbol: normalizeSymbol(row), technicalScore: a, finalScore: b, delta: a != null && b != null ? round(Math.abs(a - b)) : null };
    })
    .filter((row) => row.delta != null && row.delta > 0.1);
  if (scoreMismatch.length) {
    addFinding(
      findings,
      'Stage4',
      'high',
      'stage4_technical_score_breakdown_mismatch',
      'technicalScore differs from scoreBreakdown.finalScore.',
      scoreMismatch,
      'Keep finalScore and technicalScore synchronized after all overlays and data-quality caps.',
      SOURCE_FILES.stage4,
      lineOf(SOURCE_FILES.stage4, /scoreBreakdownCoverage/)
    );
  }
  const heuristicHighScore = rows
    .filter((row) => String(row?.dataSource || '').toUpperCase() === 'HEURISTIC' && (num(row?.technicalScore) ?? 0) > 58)
    .map((row) => ({ symbol: normalizeSymbol(row), technicalScore: row?.technicalScore, dataSource: row?.dataSource }));
  if (heuristicHighScore.length) {
    addFinding(
      findings,
      'Stage4',
      'high',
      'stage4_heuristic_high_score',
      'Heuristic technical fallback produced a high technicalScore.',
      heuristicHighScore,
      'Cap non-Drive/non-OHLCV technical scores and block breakout promotion from heuristic rows.',
      SOURCE_FILES.stage4,
      lineOf(SOURCE_FILES.stage4, /dataSource:\s*'HEURISTIC'/)
    );
  }
  const shortHistory = rows
    .filter((row) => Array.isArray(row?.priceHistory) && row.priceHistory.length < 80)
    .map((row) => ({ symbol: normalizeSymbol(row), bars: row.priceHistory.length }));
  if (shortHistory.length) {
    addFinding(
      findings,
      'Stage4',
      'medium',
      'stage4_price_history_short',
      'Some technical rows carry fewer than 80 priceHistory bars.',
      shortHistory,
      'Downgrade ICT/structure confidence when Stage4 evidence has short history.'
    );
  }
  return {
    coverage: cov,
    nestedCoverage: nested,
    scoreMismatch,
    heuristicHighScore,
    shortHistory,
    scoreStats: numericStats(rows, 'technicalScore'),
    dataSourceCounts: countBy(rows, (row) => String(row?.dataSource || 'missing')),
    techDataQualityCounts: countBy(rows, (row) => String(row?.techMetrics?.dataQualityState || 'missing')),
    priceHistoryBars: rows.map((row) => ({ symbol: normalizeSymbol(row), bars: Array.isArray(row?.priceHistory) ? row.priceHistory.length : 0 }))
  };
}

function stage5Audit(rows, findings) {
  const fields = [
    'ictScore',
    'ictMetrics',
    'ictPos',
    'pdZone',
    'otePrice',
    'ictStopLoss',
    'executionGeometrySource',
    'compositeAlpha',
    'compositeBreakdown',
    'factorCarryApplied',
    'factorCarryGuard'
  ];
  const cov = coverage(rows, fields);
  const nested = {
    displacement: nestedCoverage(rows, 'ictMetrics.displacement'),
    liquiditySweep: nestedCoverage(rows, 'ictMetrics.liquiditySweep'),
    marketStructure: nestedCoverage(rows, 'ictMetrics.marketStructure'),
    orderBlock: nestedCoverage(rows, 'ictMetrics.orderBlock'),
    smartMoneyFlow: nestedCoverage(rows, 'ictMetrics.smartMoneyFlow'),
    baseFundamentalPart: nestedCoverage(rows, 'compositeBreakdown.baseFundamentalPart'),
    baseTechnicalPart: nestedCoverage(rows, 'compositeBreakdown.baseTechnicalPart'),
    baseIctPart: nestedCoverage(rows, 'compositeBreakdown.baseIctPart'),
    dataQualityMultiplier: nestedCoverage(rows, 'compositeBreakdown.dataQualityMultiplier')
  };
  const outOfRange = rows
    .filter((row) => {
      const v = num(row?.ictScore);
      return v == null || v < 0 || v > 100;
    })
    .map((row) => ({ symbol: normalizeSymbol(row), ictScore: row?.ictScore }));
  if (outOfRange.length) {
    addFinding(
      findings,
      'Stage5',
      'critical',
      'stage5_ict_score_out_of_range',
      'ictScore escaped the expected 0-100 score scale.',
      outOfRange,
      'Clamp and audit ICT score after all bonuses/penalties before Stage5 artifact write.',
      SOURCE_FILES.stage5,
      lineOf(SOURCE_FILES.stage5, /ictAnalysis\.score\s*=\s*Math\.min\(100/)
    );
  }
  const weakMetricsHighIct = rows
    .filter((row) => {
      const ictScore = num(row?.ictScore) ?? 0;
      const metrics = row?.ictMetrics || {};
      const evidenceCount = ['displacement', 'liquiditySweep', 'marketStructure', 'orderBlock', 'smartMoneyFlow']
        .filter((key) => num(metrics[key]) != null).length;
      return ictScore >= 80 && evidenceCount < 5;
    })
    .map((row) => ({ symbol: normalizeSymbol(row), ictScore: row?.ictScore, ictMetrics: row?.ictMetrics || null }));
  if (weakMetricsHighIct.length) {
    addFinding(
      findings,
      'Stage5',
      'high',
      'stage5_high_ict_without_metrics',
      'High ICT score lacks full metric evidence.',
      weakMetricsHighIct,
      'Require all ICT metric components before allowing high ICT confidence or Stage6 breakout/structure use.'
    );
  }
  const invalidIctPos = rows
    .filter((row) => {
      const v = num(row?.ictPos);
      return v != null && (v < -0.05 || v > 1.05);
    })
    .map((row) => ({ symbol: normalizeSymbol(row), ictPos: row?.ictPos }));
  if (invalidIctPos.length) {
    addFinding(
      findings,
      'Stage5',
      'medium',
      'stage5_ict_pos_outside_range',
      'ictPos is outside the expected 0-1 range.',
      invalidIctPos,
      'Clamp ictPos or flag distorted 52-week range / stale price inputs before Stage6.'
    );
  }
  return {
    coverage: cov,
    nestedCoverage: nested,
    outOfRange,
    weakMetricsHighIct,
    invalidIctPos,
    scoreStats: numericStats(rows, 'ictScore'),
    pdZoneCounts: countBy(rows, (row) => String(row?.pdZone || 'missing')),
    geometrySourceCounts: countBy(rows, (row) => String(row?.executionGeometrySource || 'missing')),
    factorCarryGuardCounts: countBy(rows, (row) => String(row?.factorCarryGuard || row?.compositeBreakdown?.factorCarryGuard || 'missing'))
  };
}

function numericStats(rows, field) {
  const values = rows.map((row) => num(row?.[field])).filter((value) => value != null).sort((a, b) => a - b);
  if (!values.length) return { count: 0, min: null, max: null, avg: null };
  return {
    count: values.length,
    min: round(values[0]),
    max: round(values[values.length - 1]),
    avg: round(values.reduce((sum, value) => sum + value, 0) / values.length)
  };
}

function contractLinkAudit(stage6, rows, findings) {
  const manifest = stage6?.manifest || {};
  const stage5SourcePresent = Boolean(manifest.sourceStage5File || manifest.sourceStage5Hash || manifest.sourceStage5Count);
  if (!stage5SourcePresent) {
    addFinding(
      findings,
      'Stage5->Stage6',
      'high',
      'stage5_source_lineage_missing',
      'Stage6 manifest does not expose Stage5 source file/hash/count.',
      { sourceStage5File: manifest.sourceStage5File || null, sourceStage5Hash: manifest.sourceStage5Hash || null },
      'Preserve Stage5 source identity in every Stage6 artifact so score regressions can be traced.'
    );
  }
  const executableRows = rows.filter((row) => String(row?.finalDecision || '').toUpperCase() === 'EXECUTABLE_NOW');
  const weakPillarExec = executableRows
    .filter((row) => (num(row?.fundamentalScore) ?? 0) < 50 || (num(row?.technicalScore) ?? 0) < 50 || (num(row?.ictScore) ?? 0) < 60)
    .map((row) => ({
      symbol: normalizeSymbol(row),
      finalDecision: row?.finalDecision,
      fundamentalScore: row?.fundamentalScore,
      technicalScore: row?.technicalScore,
      ictScore: row?.ictScore
    }));
  if (weakPillarExec.length) {
    addFinding(
      findings,
      'Stage5->Stage6',
      'high',
      'executable_with_weak_pillar',
      'Executable rows include a weak Stage3/4/5 pillar.',
      weakPillarExec,
      'Require an explicit waiver or downgrade executable status when one pillar is materially weak.'
    );
  }
  return {
    stage5Source: {
      sourceStage5File: manifest.sourceStage5File || null,
      sourceStage5Hash: manifest.sourceStage5Hash || null,
      sourceStage5Count: manifest.sourceStage5Count || null,
      present: stage5SourcePresent
    },
    executableRows: executableRows.length,
    weakPillarExec
  };
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function tableCountMap(obj) {
  const entries = Object.entries(obj || {});
  if (!entries.length) return 'none';
  return entries.map(([k, v]) => `${k}:${v}`).join(', ');
}

function buildMarkdown(report) {
  const lines = [
    '# Stage3-5 Quant Quality Audit',
    '',
    `- GeneratedAt: ${report.generatedAt}`,
    `- Stage6: ${report.stage6.file}`,
    `- Hash: ${report.stage6.hash}`,
    `- Stage6 finalist rows audited: ${report.summary.rows}`,
    `- Stage3 rows audited: ${report.summary.stage3Rows}`,
    `- Stage4 rows audited: ${report.summary.stage4Rows}`,
    `- Stage5 rows audited: ${report.summary.stage5Rows}`,
    `- Overall: **${report.overall}**`,
    `- Safety: report-only; no broker/state mutation.`,
    '',
    '## Summary',
    '',
    '| Stage | Score | Main Risk |',
    '| --- | ---: | --- |'
  ];
  for (const [stage, score] of Object.entries(report.stageScores)) {
    lines.push(`| ${esc(stage)} | ${score}/100 | ${esc(report.stageMainRisks[stage] || 'none')} |`);
  }
  lines.push('', '## Artifact Sources', '', '| Stage | Mode | File | Rows |', '| --- | --- | --- | ---: |');
  for (const [stage, source] of Object.entries(report.artifactSources || {})) {
    lines.push(`| ${esc(stage)} | ${esc(source.mode)} | ${esc(source.file || 'Stage6 finalist fallback')} | ${esc(source.count)} |`);
  }
  lines.push('', '## Findings', '', '| Severity | Stage | ID | Evidence | Recommendation | File | Line |', '| --- | --- | --- | --- | --- | --- | ---: |');
  if (!report.findings.length) {
    lines.push('| PASS | all | none | no findings | keep monitoring | N/A | 0 |');
  } else {
    for (const f of report.findings) {
      lines.push(`| ${f.severity} | ${f.stage} | ${f.id} | ${esc(JSON.stringify(f.evidence).slice(0, 420))} | ${esc(f.recommendation)} | ${esc(f.file)} | ${f.line || 0} |`);
    }
  }
  lines.push('', '## Latest Row Score Table', '', '| Symbol | Decision | Fund | Quality | Tech | TechFinal | ICT | DataSource | Bars | DataQuality | ICT Zone | Geometry |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.decision)} | ${esc(row.fundamentalScore)} | ${esc(row.qualityScore)} | ${esc(row.technicalScore)} | ${esc(row.technicalFinalScore)} | ${esc(row.ictScore)} | ${esc(row.dataSource)} | ${esc(row.priceHistoryBars)} | ${esc(row.dataQualityState)} | ${esc(row.pdZone)} | ${esc(row.executionGeometrySource)} |`);
  }
  lines.push('', '## Stage Coverage');
  for (const [stage, section] of Object.entries(report.stageAudits)) {
    lines.push('', `### ${stage}`, '', '| Metric | Value |', '| --- | --- |');
    lines.push(`| scoreStats | ${esc(JSON.stringify(section.scoreStats || {}))} |`);
    if (section.dataQualityCounts) lines.push(`| dataQualityCounts | ${esc(tableCountMap(section.dataQualityCounts))} |`);
    if (section.dataSourceCounts) lines.push(`| dataSourceCounts | ${esc(tableCountMap(section.dataSourceCounts))} |`);
    if (section.techDataQualityCounts) lines.push(`| techDataQualityCounts | ${esc(tableCountMap(section.techDataQualityCounts))} |`);
    if (section.pdZoneCounts) lines.push(`| pdZoneCounts | ${esc(tableCountMap(section.pdZoneCounts))} |`);
    if (section.geometrySourceCounts) lines.push(`| geometrySourceCounts | ${esc(tableCountMap(section.geometrySourceCounts))} |`);
  }
  lines.push('', '## Static Formula Evidence', '', '| Stage | Present | Rule | File | Line |', '| --- | --- | --- | --- | ---: |');
  for (const item of report.staticFormulaEvidence) {
    lines.push(`| ${esc(item.stage)} | ${item.present ? 'yes' : 'no'} | ${esc(item.id)} | ${esc(item.file)} | ${item.line || 0} |`);
  }
  lines.push(
    '',
    '## Interpretation',
    '',
    '- This audit is not a backtest and does not prove alpha performance.',
    '- It checks score-scale integrity, evidence coverage, formula guardrails, and Stage3->Stage5->Stage6 traceability.',
    '- For full-stage coverage, provide `STAGE35_AUDIT_STAGE3_PATH`, `STAGE35_AUDIT_STAGE4_PATH`, and `STAGE35_AUDIT_STAGE5_PATH`, or place artifacts under `state/stage3-audit-source`, `state/stage4-audit-source`, and `state/stage5-audit-source`.',
    '- Formula changes should be made only after this report identifies a bounded, testable defect.'
  );
  return `${lines.join('\n')}\n`;
}

function stageScore(stageFindings) {
  let score = 100;
  for (const f of stageFindings) {
    const s = severityScore(f.severity);
    if (s === 4) score -= 25;
    else if (s === 3) score -= 15;
    else if (s === 2) score -= 8;
    else if (s === 1) score -= 3;
  }
  return Math.max(0, score);
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const rows = rowsFromStage6(stage6);
  const stage3Artifact = latestArtifactPath({
    envPath: 'STAGE35_AUDIT_STAGE3_PATH',
    envDir: 'STAGE35_AUDIT_STAGE3_DIR',
    defaultDir: DEFAULT_STAGE3_DIR,
    pattern: /^STAGE3_.*\.json$/i
  });
  const stage4Artifact = latestArtifactPath({
    envPath: 'STAGE35_AUDIT_STAGE4_PATH',
    envDir: 'STAGE35_AUDIT_STAGE4_DIR',
    defaultDir: DEFAULT_STAGE4_DIR,
    pattern: /^STAGE4_.*\.json$/i
  });
  const stage5Artifact = latestArtifactPath({
    envPath: 'STAGE35_AUDIT_STAGE5_PATH',
    envDir: 'STAGE35_AUDIT_STAGE5_DIR',
    defaultDir: DEFAULT_STAGE5_DIR,
    pattern: /^STAGE5_.*\.json$/i
  });
  const stage3Rows = loadStageRows({ stage: 'Stage3', artifactPath: stage3Artifact.path, fallbackRows: rows });
  const stage4Rows = loadStageRows({ stage: 'Stage4', artifactPath: stage4Artifact.path, fallbackRows: rows });
  const stage5Rows = loadStageRows({ stage: 'Stage5', artifactPath: stage5Artifact.path, fallbackRows: rows });
  const findings = [];
  const staticFormulaEvidence = extractStaticFormulaEvidence();
  for (const item of staticFormulaEvidence) {
    if (!item.present) {
      addFinding(
        findings,
        item.stage,
        'medium',
        `${item.id}_missing`,
        `Expected formula/guardrail pattern not found: ${item.title}`,
        { file: item.file },
        'Inspect the producer manually and update the audit rule or restore the missing guardrail.',
        item.file,
        null
      );
    }
  }

  const stageAudits = {
    Stage3: stage3Audit(stage3Rows.rows, findings),
    Stage4: stage4Audit(stage4Rows.rows, findings),
    Stage5: stage5Audit(stage5Rows.rows, findings),
    Stage5ToStage6: contractLinkAudit(stage6, rows, findings)
  };
  const stageScores = {};
  const stageMainRisks = {};
  for (const stage of Object.keys(stageAudits)) {
    const stageFindings = findings.filter((f) => f.stage === stage || (stage === 'Stage5ToStage6' && f.stage === 'Stage5->Stage6'));
    stageScores[stage] = stageScore(stageFindings);
    const top = stageFindings.sort((a, b) => severityScore(b.severity) - severityScore(a.severity))[0];
    stageMainRisks[stage] = top ? top.title : 'none';
  }
  const worstSeverity = findings.reduce((max, f) => Math.max(max, severityScore(f.severity)), 0);
  const overall =
    worstSeverity >= 4 ? 'fail_score_contract_violation'
      : worstSeverity >= 3 ? 'review_required_high'
        : worstSeverity >= 2 ? 'review_required_medium'
          : 'pass_report_only';

  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || fileSha256(stage6Path),
      manifest: {
        timestamp: stage6?.manifest?.timestamp || null,
        sourceStage5File: stage6?.manifest?.sourceStage5File || null,
        sourceStage5Hash: stage6?.manifest?.sourceStage5Hash || null,
        sourceStage5Count: stage6?.manifest?.sourceStage5Count || null
      }
    },
    artifactSources: {
      Stage3: {
        mode: stage3Rows.mode,
        file: stage3Rows.file,
        count: stage3Rows.count,
        hash: stage3Rows.hash || null,
        path: stage3Artifact.path,
        source: stage3Artifact.source
      },
      Stage4: {
        mode: stage4Rows.mode,
        file: stage4Rows.file,
        count: stage4Rows.count,
        hash: stage4Rows.hash || null,
        path: stage4Artifact.path,
        source: stage4Artifact.source
      },
      Stage5: {
        mode: stage5Rows.mode,
        file: stage5Rows.file,
        count: stage5Rows.count,
        hash: stage5Rows.hash || null,
        path: stage5Artifact.path,
        source: stage5Artifact.source
      }
    },
    summary: {
      rows: rows.length,
      stage3Rows: stage3Rows.count,
      stage4Rows: stage4Rows.count,
      stage5Rows: stage5Rows.count,
      findings: findings.length,
      critical: findings.filter((f) => f.severity === 'critical').length,
      high: findings.filter((f) => f.severity === 'high').length,
      medium: findings.filter((f) => f.severity === 'medium').length,
      low: findings.filter((f) => f.severity === 'low').length
    },
    stageScores,
    stageMainRisks,
    stageAudits,
    staticFormulaEvidence,
    findings: findings.sort((a, b) => severityScore(b.severity) - severityScore(a.severity) || a.stage.localeCompare(b.stage)),
    rows: rows.map((row) => ({
      symbol: normalizeSymbol(row),
      decision: `${row?.finalDecision || 'UNKNOWN'}/${row?.decisionReason || 'unknown'}`,
      verdict: row?.aiVerdict || row?.verdict || null,
      fundamentalScore: round(row?.fundamentalScore),
      qualityScore: round(row?.qualityScore),
      technicalScore: round(row?.technicalScore),
      technicalFinalScore: round(row?.scoreBreakdown?.finalScore),
      ictScore: round(row?.ictScore),
      compositeAlpha: round(row?.compositeAlpha),
      dataSource: row?.dataSource || null,
      priceHistoryBars: Array.isArray(row?.priceHistory) ? row.priceHistory.length : 0,
      dataQuality: row?.dataQuality || null,
      dataQualityState: row?.techMetrics?.dataQualityState || null,
      pdZone: row?.pdZone || null,
      executionGeometrySource: row?.executionGeometrySource || null
    })),
    safety: {
      reportOnly: true,
      brokerMutation: false,
      stateMutation: false
    },
    nextRecommendedActions: [
      'Fix Stage3 score-scale contract first if any fundamentalScore is outside 0-100.',
      'Add fixture coverage for Stage3 post-sector-bonus clamping before changing ranking behavior.',
      'Use Stage4/Stage5 evidence coverage to decide whether structure/breakout gates are too strict or data evidence is simply weak.'
    ]
  };

  writeTextAtomic(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.log(`[STAGE3_5_QUANT_AUDIT] overall=${overall} rows=${rows.length} findings=${findings.length} json=${OUT_JSON}`);
  if (process.env.STAGE35_AUDIT_STRICT === 'true' && overall.startsWith('fail')) process.exit(1);
}

main();
