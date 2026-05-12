#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT = 'state/current-entry-structure-audit.json';
const DEFAULT_OUT_JSON = 'state/current-entry-execution-review.json';
const DEFAULT_OUT_MD = 'docs/CURRENT_ENTRY_EXECUTION_REVIEW_2026-05-12.md';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
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

function reviewDecision(row) {
  if (row.verdict === 'STRUCTURE_CONFIRMED_RECALC_CANDIDATE') return 'EXECUTION_REVIEW_READY';
  if (row.verdict === 'NOT_RECALC_CANDIDATE') return 'NO_TRADE_CURRENT_RR_OR_TARGET_BAD';
  if (String(row.verdict || '').startsWith('STRUCTURE_REJECT_')) return 'STRUCTURE_REJECTED_NO_ORDER';
  if (row.verdict === 'STRUCTURE_DATA_MISSING') return 'DATA_MISSING_NO_ORDER';
  return 'REVIEW_REQUIRED_NO_ORDER';
}

function nextAction(row, decision) {
  if (decision === 'EXECUTION_REVIEW_READY') return 'Inject structure-confirmed fields into next Stage6 generation; keep broker submit blocked until Stage6 emits executable_current_recalculated_stop and sidecar preflight passes.';
  if (decision === 'STRUCTURE_REJECTED_NO_ORDER') return 'Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes.';
  if (decision === 'NO_TRADE_CURRENT_RR_OR_TARGET_BAD') return 'Reject current-entry lane; wait for new setup or refreshed target thesis.';
  if (decision === 'DATA_MISSING_NO_ORDER') return 'Fix OHLCV handoff before execution review.';
  return 'Manual inspection required before any execution path.';
}

function buildReport(structureAudit) {
  const rows = (structureAudit.rows || []).map((row) => {
    const decision = reviewDecision(row);
    return {
      stage6File: row.stage6File,
      symbol: row.symbol,
      decision,
      structureVerdict: row.verdict,
      structureReasons: row.reasons || [],
      price: row.price,
      requiredStop: row.currentEntryRequiredStopPrice,
      requiredStopDistancePct: row.currentEntryRequiredStopDistancePct,
      rrAtCurrentPrice: row.rrAtCurrentPrice,
      targetBufferFromCurrentPct: row.targetBufferFromCurrentPct,
      atr14: row.atr14,
      stopAtr: row.stopAtr,
      supportLow: row.supportLow,
      supportDate: row.supportDate,
      barsSource: row.barsSource,
      nextAction: nextAction(row, decision)
    };
  });
  const counts = rows.reduce((acc, row) => {
    acc[row.decision] = (acc[row.decision] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    sourceAudit: DEFAULT_INPUT,
    latestStage6File: structureAudit.latestStage6File,
    safety: {
      orderAuthorized: false,
      reason: 'execution review artifact only; sidecar/broker gates remain authoritative'
    },
    summary: {
      rows: rows.length,
      decisions: counts,
      reviewReadySymbols: rows.filter((row) => row.decision === 'EXECUTION_REVIEW_READY').map((row) => row.symbol)
    },
    rows
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Current Entry Execution Review');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source: ${report.sourceAudit}`);
  lines.push(`- Latest Stage6: ${report.latestStage6File || 'N/A'}`);
  lines.push(`- Order Authorized: ${report.safety.orderAuthorized}`);
  lines.push(`- Safety Reason: ${report.safety.reason}`);
  lines.push('');
  lines.push('## Decision Counts');
  lines.push('');
  lines.push('| Decision | Count |');
  lines.push('| --- | ---: |');
  for (const [key, count] of Object.entries(report.summary.decisions)) lines.push(`| ${esc(key)} | ${count} |`);
  lines.push('');
  lines.push('## Review Candidates');
  lines.push('');
  lines.push('| Symbol | Decision | Structure | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Next Action |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of report.rows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.decision)} | ${esc(row.structureVerdict)} | ${esc(row.structureReasons.join(','))} | ${fmt(row.price)} | ${fmt(row.requiredStop)} | ${fmt(row.requiredStopDistancePct)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.targetBufferFromCurrentPct)} | ${fmt(row.atr14)} | ${fmt(row.stopAtr)} | ${fmt(row.supportLow)} | ${esc(row.nextAction)} |`);
  }
  lines.push('');
  lines.push('## Policy');
  lines.push('');
  lines.push('- This file is not an order ticket and must not be consumed directly by the broker path.');
  lines.push('- Only `EXECUTION_REVIEW_READY` symbols may be considered for the Stage6 structure-confirmed current-entry lane.');
  lines.push('- Sidecar must still require fresh Stage6 executable output, preflight pass, idempotency pass, market-open confirmation, and broker submit proof.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const input = process.env.CURRENT_ENTRY_REVIEW_INPUT || DEFAULT_INPUT;
  const outJson = process.env.CURRENT_ENTRY_REVIEW_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.CURRENT_ENTRY_REVIEW_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport(readJson(input));
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(`[CURRENT_ENTRY_EXECUTION_REVIEW] rows=${report.summary.rows} ready=${report.summary.reviewReadySymbols.join(',') || 'none'} json=${outJson} md=${outMd}`);
}

main();
