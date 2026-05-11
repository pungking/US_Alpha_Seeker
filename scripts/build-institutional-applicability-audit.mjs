#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_JSON = 'state/institutional-applicability-audit.json';
const DEFAULT_OUT_MD = 'docs/INSTITUTIONAL_APPLICABILITY_AUDIT_2026-05-11.md';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? 'N/A' : n.toFixed(digits);
}

function esc(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function classifyTradeReadiness(row) {
  const rr = numberOrNull(row.rr);
  const er = numberOrNull(row.expectedReturnPct);
  const dist = numberOrNull(row.entryDistancePct);
  const reason = String(row.decisionReason || '').toLowerCase();
  if (row.finalDecision === 'EXECUTABLE_NOW') return 'SIDE_CAR_FILLABILITY_TEST';
  if (reason === 'blocked_rr_below_min' || (rr != null && rr < 1.8)) return 'BAD_RR_GEOMETRY';
  if (reason === 'blocked_stop_too_tight') return 'STOP_GEOMETRY_REVIEW';
  if (dist != null && dist > 10 && er != null && er >= 15 && rr != null && rr >= 1.8) return 'GOOD_STOCK_BAD_ENTRY';
  if (dist != null && dist <= 6 && rr != null && rr >= 1.8) return 'NEAR_EXEC_REVIEW';
  if (reason.includes('earnings_data_missing')) return 'DATA_GAP_REVIEW';
  return 'REVIEW_REQUIRED';
}

function institutionalGaps(row) {
  const gaps = [];
  if (row.earningsDaysToEvent == null) gaps.push('earnings_date_missing');
  if (!row.verdict || row.verdict === 'UNKNOWN') gaps.push('verdict_or_research_thesis_missing');
  if (row.qualityScore == null) gaps.push('quality_score_missing');
  if (row.executionScore == null) gaps.push('execution_score_missing');
  if (row.price == null) gaps.push('current_price_missing');
  if (row.rr == null) gaps.push('rr_missing');
  if (row.entryDistancePct == null) gaps.push('entry_distance_missing');
  // These fields do not exist yet in the Stage6 contract; keep them explicit so schema work is not hand-waved.
  gaps.push('source_quality_contract_missing');
  gaps.push('peer_valuation_contract_missing');
  gaps.push('macro_policy_risk_contract_missing');
  gaps.push('trade_plan_contract_missing');
  return gaps;
}

function recommendedFix(row, readiness, gaps) {
  if (readiness === 'GOOD_STOCK_BAD_ENTRY') return 'Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first.';
  if (readiness === 'BAD_RR_GEOMETRY') return 'Keep blocked unless target/stop thesis is recalculated by Stage6.';
  if (readiness === 'STOP_GEOMETRY_REVIEW') return 'Review stop floor/tick/ATR buffer; current stop invalidates otherwise high RR names.';
  if (gaps.includes('earnings_date_missing')) return 'Fix earnings-date source and null-safe serialization before event gating.';
  return 'Inspect with institutionalResearch/tradePlan schema before execution changes.';
}

function buildReport(stage6Audit) {
  const rows = (stage6Audit.rows || []).map((row) => {
    const readiness = classifyTradeReadiness(row);
    const gaps = institutionalGaps(row);
    return {
      stage6File: row.stage6File,
      symbol: row.symbol,
      finalDecision: row.finalDecision,
      decisionReason: row.decisionReason,
      blockerClass: row.blockerClass,
      expectedReturnPct: row.expectedReturnPct,
      rr: row.rr,
      entryDistancePct: row.entryDistancePct,
      price: row.price,
      entry: row.entry,
      target: row.target,
      stop: row.stop,
      earningsDaysToEvent: row.earningsDaysToEvent,
      readiness,
      institutionalGaps: gaps,
      recommendedFix: recommendedFix(row, readiness, gaps)
    };
  });
  const latestFile = rows[0]?.stage6File || null;
  const latestRows = latestFile ? rows.filter((row) => row.stage6File === latestFile) : [];
  const counts = rows.reduce((acc, row) => {
    acc.readiness[row.readiness] = (acc.readiness[row.readiness] || 0) + 1;
    for (const gap of row.institutionalGaps) acc.gaps[gap] = (acc.gaps[gap] || 0) + 1;
    return acc;
  }, { readiness: {}, gaps: {} });
  const latestCounts = latestRows.reduce((acc, row) => {
    acc[row.readiness] = (acc[row.readiness] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    sourceAudit: DEFAULT_INPUT,
    latestStage6File: latestFile,
    summary: {
      totalRows: rows.length,
      latestRows: latestRows.length,
      latestReadiness: latestCounts,
      readiness: counts.readiness,
      topGaps: Object.entries(counts.gaps).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([key, count]) => ({ key, count }))
    },
    rows
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Institutional Applicability Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source: ${report.sourceAudit}`);
  lines.push(`- Latest Stage6: ${report.latestStage6File || 'N/A'}`);
  lines.push(`- Rows: ${report.summary.totalRows}`);
  lines.push('');
  lines.push('## Latest Run Readiness');
  lines.push('');
  lines.push('| Readiness | Count |');
  lines.push('| --- | ---: |');
  for (const [key, count] of Object.entries(report.summary.latestReadiness)) lines.push(`| ${esc(key)} | ${count} |`);
  lines.push('');
  lines.push('## Top Institutional Contract Gaps');
  lines.push('');
  lines.push('| Gap | Count |');
  lines.push('| --- | ---: |');
  for (const item of report.summary.topGaps) lines.push(`| ${esc(item.key)} | ${item.count} |`);
  lines.push('');
  lines.push('## Latest Candidate Table');
  lines.push('');
  lines.push('| Symbol | Reason | ER% | RR | Dist% | Price | Entry | Target | Stop | Readiness | Fix |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows.filter((item) => item.stage6File === report.latestStage6File)) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.decisionReason)} | ${fmt(row.expectedReturnPct)} | ${fmt(row.rr)} | ${fmt(row.entryDistancePct)} | ${fmt(row.price)} | ${fmt(row.entry)} | ${fmt(row.target)} | ${fmt(row.stop)} | ${esc(row.readiness)} | ${esc(row.recommendedFix)} |`);
  }
  lines.push('');
  lines.push('## Policy Conclusion');
  lines.push('');
  lines.push('- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.');
  lines.push('- The dominant current problem is `GOOD_STOCK_BAD_ENTRY`: high ER/RR names with entry targets 16-25% below current price.');
  lines.push('- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.');
  lines.push('- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const input = process.env.INSTITUTIONAL_AUDIT_INPUT || DEFAULT_INPUT;
  const outJson = process.env.INSTITUTIONAL_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.INSTITUTIONAL_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport(readJson(input));
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(`[INSTITUTIONAL_AUDIT] rows=${report.summary.totalRows} latest=${report.latestStage6File} json=${outJson} md=${outMd}`);
}

main();
