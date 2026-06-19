#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = 'state/stage6-weak-pillar-runtime-audit.json';
const OUT_MD = 'docs/STAGE6_WEAK_PILLAR_RUNTIME_AUDIT.md';

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6File() {
  if (process.env.STAGE6_WEAK_PILLAR_AUDIT_STAGE6_PATH) return resolveRepo(process.env.STAGE6_WEAK_PILLAR_AUDIT_STAGE6_PATH);
  const dir = resolveRepo(process.env.STAGE6_WEAK_PILLAR_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}`);
  return files[0].full;
}

function num(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function rowsFromStage6(stage6) {
  const rows = [];
  const seen = new Set();
  const push = (row, sourceGroup) => {
    const symbol = normalizeSymbol(row);
    if (!symbol) return;
    const key = `${symbol}:${sourceGroup}:${row?.modelRank ?? row?.rank ?? ''}:${row?.decisionReason ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ ...row, _sourceGroup: sourceGroup });
  };
  for (const row of Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates : []) push(row, 'alpha_candidates');
  const contract = stage6?.execution_contract || {};
  for (const group of ['executablePicks', 'watchlistTop', 'modelTop6']) {
    for (const row of Array.isArray(contract[group]) ? contract[group] : []) push(row, `execution_contract.${group}`);
  }
  return rows;
}

function thresholdsFromStage6(stage6) {
  const gate = stage6?.manifest?.decisionGate || {};
  return {
    enabled: gate.weakPillarGateEnabled !== false,
    waiverEnabled: gate.weakPillarExecutableWaiver === true,
    minFundamentalScore: num(gate.weakPillarMinFundamentalScore) ?? 50,
    minTechnicalScore: num(gate.weakPillarMinTechnicalScore) ?? 50,
    minIctScore: num(gate.weakPillarMinIctScore) ?? 60
  };
}

function weakReasons(row, thresholds) {
  const fundamentalScore = num(row?.fundamentalScore);
  const technicalScore = num(row?.technicalScore);
  const ictScore = num(row?.ictScore);
  const gateVerdict = String(row?.weakPillarGateVerdict || '').trim().toUpperCase();
  const explicitWeakGate =
    gateVerdict === 'WEAK_PILLAR_GATE_BLOCKED_EXECUTION' ||
    gateVerdict === 'WEAK_PILLAR_GATE_UNRESOLVED' ||
    String(row?.decisionReason || '') === 'wait_weak_pillar_execution_gate';
  const hasAnyScore = [fundamentalScore, technicalScore, ictScore].some((value) => value != null);
  if (!hasAnyScore && !explicitWeakGate) return [];
  return [
    ...(fundamentalScore == null ? ['fundamental_score_missing'] : fundamentalScore < thresholds.minFundamentalScore ? [`fundamental_score_below_min:${fundamentalScore}<${thresholds.minFundamentalScore}`] : []),
    ...(technicalScore == null ? ['technical_score_missing'] : technicalScore < thresholds.minTechnicalScore ? [`technical_score_below_min:${technicalScore}<${thresholds.minTechnicalScore}`] : []),
    ...(ictScore == null ? ['ict_score_missing'] : ictScore < thresholds.minIctScore ? [`ict_score_below_min:${ictScore}<${thresholds.minIctScore}`] : [])
  ];
}

function auditRow(row, thresholds) {
  const reasons = weakReasons(row, thresholds);
  const weak = thresholds.enabled && reasons.length > 0;
  const finalDecision = String(row?.finalDecision || '').trim();
  const decisionReason = String(row?.decisionReason || '').trim();
  const qualityGateLane = row?.qualityGateLane ?? null;
  const qualityGatePolicyVerdict = row?.qualityGatePolicyVerdict ?? null;
  const weakPillarGateVerdict = row?.weakPillarGateVerdict ?? null;
  const waiver = bool(row?.weakPillarGateWaiver);
  const violations = [];

  if (weak && finalDecision === 'EXECUTABLE_NOW' && !waiver) {
    violations.push('weak_pillar_executable_without_waiver');
  }
  if (weak && decisionReason === 'wait_weak_pillar_execution_gate') {
    if (finalDecision !== 'WAIT_PRICE') violations.push('weak_pillar_wait_not_wait_price');
    if (qualityGateLane !== 'weak_pillar_execution_gate') violations.push('weak_pillar_quality_gate_lane_missing');
    if (qualityGatePolicyVerdict !== 'QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT') violations.push('weak_pillar_quality_gate_verdict_missing');
    if (weakPillarGateVerdict !== 'WEAK_PILLAR_GATE_BLOCKED_EXECUTION') violations.push('weak_pillar_gate_verdict_missing');
  }
  if (weak && finalDecision !== 'EXECUTABLE_NOW' && decisionReason !== 'wait_weak_pillar_execution_gate' && weakPillarGateVerdict === 'WEAK_PILLAR_GATE_UNRESOLVED') {
    violations.push('weak_pillar_unresolved_verdict');
  }

  return {
    symbol: normalizeSymbol(row),
    sourceGroup: row?._sourceGroup || null,
    finalDecision,
    decisionReason,
    fundamentalScore: num(row?.fundamentalScore),
    technicalScore: num(row?.technicalScore),
    ictScore: num(row?.ictScore),
    weak,
    weakReasons: reasons,
    weakPillarGateWaiver: waiver,
    weakPillarGateVerdict,
    qualityGateLane,
    qualityGatePolicyVerdict,
    violations
  };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = fn(row) || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Weak Pillar Runtime Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Stage6: ${report.latest.file}`);
  lines.push(`- Hash: ${report.latest.sha256}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Safety: analysis-only; no broker/state mutation.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| latestRows | ${report.latest.summary.rows} |`);
  lines.push(`| latestWeakRows | ${report.latest.summary.weakRows} |`);
  lines.push(`| latestWeakWaitRows | ${report.latest.summary.weakWaitRows} |`);
  lines.push(`| latestExecutableViolations | ${report.latest.summary.executableViolations} |`);
  lines.push(`| latestQualityGateViolations | ${report.latest.summary.qualityGateViolations} |`);
  lines.push(`| allFilesScanned | ${report.history.filesScanned} |`);
  lines.push(`| historicalWeakRows | ${report.history.weakRows} |`);
  lines.push('');
  lines.push('## Thresholds');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('| --- | ---: |');
  for (const [key, value] of Object.entries(report.latest.thresholds)) lines.push(`| ${esc(key)} | ${esc(value)} |`);
  lines.push('');
  lines.push('## Latest Weak Rows');
  lines.push('');
  if (!report.latest.weakRows.length) {
    lines.push('- No weak-pillar row appeared in the latest Stage6 artifact. Fixture contract remains the current proof until the next runtime occurrence.');
  } else {
    lines.push('| Symbol | Decision | Reason | Quality Lane | Gate Verdict | Fund | Tech | ICT | Violations |');
    lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |');
    for (const row of report.latest.weakRows) {
      lines.push(`| ${esc(row.symbol)} | ${esc(row.finalDecision)} | ${esc(row.decisionReason)} | ${esc(row.qualityGateLane)} | ${esc(row.weakPillarGateVerdict)} | ${esc(row.fundamentalScore)} | ${esc(row.technicalScore)} | ${esc(row.ictScore)} | ${esc(row.violations.join(', ') || 'none')} |`);
    }
  }
  lines.push('');
  lines.push('## Done-When');
  lines.push('');
  lines.push('- If a weak-pillar candidate appears, it must be `WAIT_PRICE / wait_weak_pillar_execution_gate`.');
  lines.push('- It must expose `qualityGateLane=weak_pillar_execution_gate`.');
  lines.push('- It must expose `qualityGatePolicyVerdict=QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT`.');
  lines.push('- It must not remain `EXECUTABLE_NOW` unless an explicit audited waiver is present.');
  return `${lines.join('\n')}\n`;
}

const latestPath = latestStage6File();
const latestPayload = readJson(latestPath);
const latestRows = rowsFromStage6(latestPayload).map((row) => auditRow(row, thresholdsFromStage6(latestPayload)));
const latestWeakRows = latestRows.filter((row) => row.weak);
const latestViolations = latestRows.flatMap((row) => row.violations.map((violation) => ({ symbol: row.symbol, violation })));

const dir = resolveRepo(process.env.STAGE6_WEAK_PILLAR_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
const allFiles = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name)).map((name) => path.join(dir, name))
  : [];
let historyWeakRows = 0;
let historyViolationRows = 0;
for (const file of allFiles) {
  try {
    const payload = readJson(file);
    const thresholds = thresholdsFromStage6(payload);
    const audited = rowsFromStage6(payload).map((row) => auditRow(row, thresholds));
    historyWeakRows += audited.filter((row) => row.weak).length;
    historyViolationRows += audited.filter((row) => row.violations.length > 0).length;
  } catch (_) {
    // Historical malformed files are not authoritative for the latest runtime gate.
  }
}

const qualityGateViolations = latestWeakRows.filter((row) => row.decisionReason === 'wait_weak_pillar_execution_gate' && (row.qualityGateLane !== 'weak_pillar_execution_gate' || row.qualityGatePolicyVerdict !== 'QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT')).length;
const executableViolations = latestWeakRows.filter((row) => row.finalDecision === 'EXECUTABLE_NOW' && !row.weakPillarGateWaiver).length;
const overall = latestViolations.length
  ? 'fail_latest_weak_pillar_contract_violation'
  : latestWeakRows.length
    ? 'pass_latest_weak_pillar_runtime_observed'
    : 'pass_no_latest_weak_pillar_runtime_observed_fixture_required';

const report = {
  generatedAt: new Date().toISOString(),
  overall,
  latest: {
    file: path.basename(latestPath),
    path: path.relative(ROOT, latestPath),
    sha256: fileSha256(latestPath),
    thresholds: thresholdsFromStage6(latestPayload),
    summary: {
      rows: latestRows.length,
      weakRows: latestWeakRows.length,
      weakWaitRows: latestWeakRows.filter((row) => row.decisionReason === 'wait_weak_pillar_execution_gate').length,
      executableViolations,
      qualityGateViolations,
      finalDecisionCounts: countBy(latestRows, (row) => row.finalDecision),
      decisionReasonCounts: countBy(latestRows, (row) => row.decisionReason),
      qualityGateLaneCounts: countBy(latestRows, (row) => row.qualityGateLane || 'not_applicable')
    },
    weakRows: latestWeakRows,
    violations: latestViolations
  },
  history: {
    filesScanned: allFiles.length,
    weakRows: historyWeakRows,
    violationRows: historyViolationRows
  },
  safety: {
    brokerMutationAuthorized: false,
    executionPolicyChanged: false,
    scope: 'analysis-only Stage6 weak pillar runtime contract audit'
  }
};

writeTextAtomic(OUT_JSON, JSON.stringify(report, null, 2));
writeTextAtomic(OUT_MD, buildMarkdown(report));
console.log(`[STAGE6_WEAK_PILLAR_RUNTIME_AUDIT] overall=${overall} latestWeak=${latestWeakRows.length} latestViolations=${latestViolations.length} json=${OUT_JSON}`);
if (latestViolations.length) process.exit(1);
