#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT_DIR = 'state/stage6-audit-source';
const DEFAULT_OUT_JSON = 'state/stage6-earnings-coverage-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_EARNINGS_COVERAGE_AUDIT_2026-06-04.md';

function resolveRepoPath(filePath) {
  return path.resolve(REPO_ROOT, filePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(resolveRepoPath(filePath)), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(filePath), 'utf8'));
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (['N/A', 'NA', 'NULL', 'UNDEFINED', 'TBD'].includes(text.toUpperCase())) return null;
  return text;
}

function fmt(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? 'N/A' : n.toFixed(digits);
}

function esc(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function normalizeSymbol(value) {
  return textOrNull(value)?.replace(/[^A-Za-z0-9.\-]/g, '').toUpperCase() || null;
}

function normalizeReason(value) {
  return String(value || '').trim().toLowerCase();
}

function getByPath(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return current ?? null;
}

function firstValueWithPath(row, paths) {
  for (const pathParts of paths) {
    const value = getByPath(row, pathParts);
    if (value !== null && value !== undefined && value !== '') {
      return { value, path: pathParts.join('.') };
    }
  }
  return { value: null, path: null };
}

function collectRows(stage6) {
  const groups = [
    ['execution_contract', 'modelTop6'],
    ['execution_contract', 'watchlistTop'],
    ['execution_contract', 'executablePicks'],
    ['alpha_candidates'],
    ['candidates'],
    ['data'],
    ['audit_trail']
  ];
  const rows = [];
  const seen = new Set();
  for (const groupPath of groups) {
    const value = getByPath(stage6, groupPath);
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== 'object') continue;
      const symbol = normalizeSymbol(row.symbol);
      if (!symbol) continue;
      const finalDecision = String(row.finalDecision || row.tradePlanDecision || row.executionBucket || 'UNKNOWN');
      const decisionReason = String(row.decisionReason || row.tradePlanReason || row.executionReason || 'unknown');
      const key = `${symbol}|${finalDecision}|${decisionReason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, symbol, _sourceGroup: groupPath.join('.') });
    }
  }
  return rows;
}

function isEarningsRelevant(row) {
  const reason = normalizeReason(row.decisionReason || row.tradePlanReason || row.executionReason);
  if (reason.includes('earnings')) return true;
  if (row.earningsDaysToEvent == null && row.alphaVantage?.earningsDate == null && row.shadow?.alphaVantage?.earningsDate == null) {
    return false;
  }
  return false;
}

function parseDate(value) {
  const text = textOrNull(value);
  if (!text) return null;
  const normalized = text.includes('T') ? text : `${text}T00:00:00Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function daysBetween(startIso, eventDate) {
  const startMs = Date.parse(startIso || '');
  if (!Number.isFinite(startMs) || !(eventDate instanceof Date)) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.ceil((eventDate.getTime() - startMs) / dayMs);
}

function classifyCoverage(row, generatedAt) {
  const datePick = firstValueWithPath(row, [
    ['earningsDate'],
    ['nextEarningsDate'],
    ['reportDate'],
    ['alphaVantage', 'earningsDate'],
    ['shadow', 'alphaVantage', 'earningsDate'],
    ['techMetrics', 'earningsDate']
  ]);
  const daysPick = firstValueWithPath(row, [
    ['earningsDaysToEvent'],
    ['techMetrics', 'daysToEarnings'],
    ['nextEarningsInDays'],
    ['daysToEarnings'],
    ['earningsDday']
  ]);
  const earningsDate = parseDate(datePick.value);
  const daysToEvent = numberOrNull(daysPick.value);
  const computedDays = earningsDate ? daysBetween(generatedAt, earningsDate) : null;

  let coverageStatus = 'EARNINGS_SOURCE_MISSING';
  if (earningsDate && daysToEvent != null) coverageStatus = 'EARNINGS_PRESENT';
  else if (earningsDate) coverageStatus = 'EARNINGS_DATE_ONLY_DAYS_MISSING';
  else if (daysToEvent != null) coverageStatus = 'EARNINGS_DAYS_ONLY_DATE_MISSING';

  const freshnessFindings = [];
  if (earningsDate && computedDays != null && computedDays < -1) {
    freshnessFindings.push('earnings_date_in_past');
  }
  if (earningsDate && daysToEvent != null && computedDays != null && Math.abs(daysToEvent - computedDays) > 3) {
    freshnessFindings.push('earnings_days_date_mismatch');
  }
  if (!earningsDate && daysToEvent == null) {
    freshnessFindings.push('earnings_date_and_days_missing');
  }
  if (!earningsDate && daysToEvent != null) {
    freshnessFindings.push('earnings_date_missing_days_only');
  }

  return {
    coverageStatus,
    earningsDate: earningsDate ? earningsDate.toISOString().slice(0, 10) : null,
    earningsDateSource: datePick.path,
    earningsDaysToEvent: daysToEvent,
    earningsDaysSource: daysPick.path,
    computedDaysToEvent: computedDays,
    freshnessStatus: freshnessFindings.length > 0 ? 'FRESHNESS_REVIEW_REQUIRED' : 'FRESH',
    freshnessFindings
  };
}

function classifyExecutionOverlap(row, decisionGate = {}) {
  const targetBuffer = numberOrNull(row.targetBufferFromCurrentPct);
  const rrAtCurrent = numberOrNull(row.rrAtCurrentPrice);
  const distance = numberOrNull(row.entryDistancePct);
  const geometryInvalid =
    String(row.executionFeasibilityAtCurrentVerdict || '').includes('INVALID') ||
    String(row.tradePlanStatusShadow || '').includes('INVALID') ||
    (numberOrNull(row.targetPrice) != null && numberOrNull(row.price) != null && Number(row.targetPrice) <= Number(row.price));
  const minTargetBuffer = numberOrNull(decisionGate.currentEntryMinTargetBufferPct) ?? 3;
  const minRr = numberOrNull(decisionGate.currentEntryMinRr) ?? 2;
  const maxDistance = numberOrNull(decisionGate.currentEntryMaxAdaptiveDistancePct) ?? 6;
  const blockers = [];
  if (targetBuffer != null && targetBuffer < minTargetBuffer) blockers.push('target_buffer_below_min');
  if (rrAtCurrent != null && rrAtCurrent < minRr) blockers.push('rr_current_below_min');
  if (distance != null && distance > maxDistance) blockers.push('entry_distance_above_adaptive_band');
  if (geometryInvalid) blockers.push('geometry_or_target_invalid_at_current');
  return {
    currentExecutionStillBlocked: blockers.length > 0,
    blockers,
    targetBufferFromCurrentPct: targetBuffer,
    rrAtCurrentPrice: rrAtCurrent,
    entryDistancePct: distance
  };
}

function classifyRow(stage6File, stage6, row) {
  const generatedAt = stage6.execution_contract?.generatedAt || stage6.manifest?.timestamp || stage6.generated_at || stage6.generatedAt || null;
  const decisionGate = stage6.manifest?.decisionGate || {};
  const coverage = classifyCoverage(row, generatedAt);
  const executionOverlap = classifyExecutionOverlap(row, decisionGate);
  const reason = normalizeReason(row.decisionReason || row.tradePlanReason || row.executionReason);
  let rowVerdict = 'EARNINGS_COVERAGE_REPAIR_REQUIRED';
  if (reason === 'blocked_earnings_window') {
    rowVerdict = 'EARNINGS_WINDOW_POLICY_APPLIED';
  } else if (coverage.coverageStatus === 'EARNINGS_PRESENT' && coverage.freshnessStatus === 'FRESH') {
    rowVerdict = executionOverlap.currentExecutionStillBlocked
      ? 'EARNINGS_PRESENT_BUT_EXECUTION_STILL_BLOCKED'
      : 'EARNINGS_PRESENT_POLICY_REVIEW';
  } else if (coverage.coverageStatus === 'EARNINGS_DAYS_ONLY_DATE_MISSING') {
    rowVerdict = 'EARNINGS_DATE_AUDITABILITY_REPAIR_REQUIRED';
  } else if (coverage.coverageStatus === 'EARNINGS_DATE_ONLY_DAYS_MISSING') {
    rowVerdict = 'EARNINGS_DAYS_RECOMPUTE_AVAILABLE';
  }
  const recommendedAction = (() => {
    if (rowVerdict === 'EARNINGS_PRESENT_BUT_EXECUTION_STILL_BLOCKED') {
      return 'Do not change execution policy; fix current-entry/target geometry separately if still relevant.';
    }
    if (rowVerdict === 'EARNINGS_DATE_AUDITABILITY_REPAIR_REQUIRED') {
      return 'Persist the actual earnings date/source alongside daysToEvent so downstream audits can verify freshness.';
    }
    if (rowVerdict === 'EARNINGS_DAYS_RECOMPUTE_AVAILABLE') {
      return 'Recompute daysToEvent from dated source and persist both fields in Stage6.';
    }
    if (rowVerdict === 'EARNINGS_WINDOW_POLICY_APPLIED') {
      return 'Keep event blackout separate from missing-data repair; verify date freshness before changing blackout policy.';
    }
    if (executionOverlap.currentExecutionStillBlocked) {
      return 'Repair earnings source, but do not promote; current price/target/geometry still blocks execution.';
    }
    return 'Repair earnings source coverage, then rerun Stage6 before any execution-policy discussion.';
  })();
  return {
    stage6File,
    generatedAt,
    symbol: row.symbol,
    verdict: row.aiVerdict || row.verdict || null,
    finalDecision: row.finalDecision || null,
    decisionReason: row.decisionReason || row.tradePlanReason || row.executionReason || null,
    sourceGroup: row._sourceGroup,
    price: numberOrNull(row.price),
    entry: numberOrNull(row.entryExecPrice ?? row.entryPrice ?? row.otePrice),
    target: numberOrNull(row.targetPrice ?? row.resistanceLevel),
    stop: numberOrNull(row.stopPrice ?? row.stopLoss ?? row.ictStopLoss),
    expectedReturnPct: numberOrNull(row.expectedReturnPct),
    rr: numberOrNull(row.riskRewardRatioValue),
    ...coverage,
    ...executionOverlap,
    rowVerdict,
    recommendedAction
  };
}

function countBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function listStage6Files(inputDir) {
  const dir = resolveRepoPath(inputDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
    .sort()
    .map((name) => path.join(inputDir, name));
}

function buildReport() {
  const inputDir = process.env.STAGE6_EARNINGS_AUDIT_INPUT_DIR || DEFAULT_INPUT_DIR;
  const files = listStage6Files(inputDir);
  const runs = [];
  const allRows = [];
  for (const filePath of files) {
    const stage6 = readJson(filePath);
    const stage6File = path.basename(filePath);
    const rows = collectRows(stage6);
    const earningsRows = rows.filter(isEarningsRelevant).map((row) => classifyRow(stage6File, stage6, row));
    runs.push({
      stage6File,
      generatedAt: stage6.execution_contract?.generatedAt || stage6.manifest?.timestamp || null,
      rows: rows.length,
      earningsRows: earningsRows.length,
      coverageCounts: countBy(earningsRows, (row) => row.coverageStatus),
      rowVerdicts: countBy(earningsRows, (row) => row.rowVerdict)
    });
    allRows.push(...earningsRows);
  }
  const latestRun = runs.at(-1) || null;
  const latestRows = latestRun ? allRows.filter((row) => row.stage6File === latestRun.stage6File) : [];
  const latestCoverageMissing = latestRows.filter((row) => row.coverageStatus === 'EARNINGS_SOURCE_MISSING').length;
  const latestAuditabilityMissing = latestRows.filter((row) => row.coverageStatus === 'EARNINGS_DAYS_ONLY_DATE_MISSING').length;
  const latestExecutionStillBlocked = latestRows.filter((row) => row.currentExecutionStillBlocked).length;
  const latestAction =
    latestRows.length === 0
      ? 'NO_LATEST_EARNINGS_ROWS'
      : latestCoverageMissing > 0
        ? 'REPAIR_EARNINGS_SOURCE_COVERAGE'
        : latestAuditabilityMissing > 0
          ? 'REPAIR_EARNINGS_AUDITABILITY'
          : latestExecutionStillBlocked === latestRows.length
            ? 'EARNINGS_OK_BUT_EXECUTION_BLOCKED_ELSEWHERE'
            : 'EARNINGS_POLICY_REVIEW_AFTER_SOURCE_VERIFICATION';
  return {
    generatedAt: new Date().toISOString(),
    scope: 'stage6_earnings_coverage_freshness_report_only',
    safety: {
      brokerMutationAuthorized: false,
      executionPolicyChanged: false,
      reason: 'analysis-side data coverage audit only; no sidecar submit/reprice/replace behavior'
    },
    source: {
      inputDir,
      files: files.length
    },
    summary: {
      latestStage6File: latestRun?.stage6File || null,
      latestGeneratedAt: latestRun?.generatedAt || null,
      latestRows: latestRows.length,
      latestCoverageMissing,
      latestAuditabilityMissing,
      latestExecutionStillBlocked,
      latestCoverageCounts: countBy(latestRows, (row) => row.coverageStatus),
      latestFreshnessCounts: countBy(latestRows, (row) => row.freshnessStatus),
      latestVerdictCounts: countBy(latestRows, (row) => row.rowVerdict),
      allCoverageCounts: countBy(allRows, (row) => row.coverageStatus),
      allVerdictCounts: countBy(allRows, (row) => row.rowVerdict),
      latestAction
    },
    latestRows,
    runs,
    rows: allRows
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Earnings Coverage/Freshness Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Scope: ${report.scope}`);
  lines.push(`- Latest Stage6: ${report.summary.latestStage6File || 'N/A'}`);
  lines.push(`- Latest Earnings Rows: ${report.summary.latestRows}`);
  lines.push(`- Latest Coverage Missing: ${report.summary.latestCoverageMissing}`);
  lines.push(`- Latest Auditability Missing: ${report.summary.latestAuditabilityMissing}`);
  lines.push(`- Latest Execution Still Blocked Elsewhere: ${report.summary.latestExecutionStillBlocked}`);
  lines.push(`- Latest Action: **${report.summary.latestAction}**`);
  lines.push(`- Broker Mutation Authorized: ${report.safety.brokerMutationAuthorized}`);
  lines.push(`- Execution Policy Changed: ${report.safety.executionPolicyChanged}`);
  lines.push('');
  lines.push('## Latest Coverage Counts');
  lines.push('');
  lines.push('| Coverage/Freshness/Verdict | Count |');
  lines.push('| --- | ---: |');
  for (const [key, value] of Object.entries(report.summary.latestCoverageCounts || {})) {
    lines.push(`| coverage:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.latestFreshnessCounts || {})) {
    lines.push(`| freshness:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.latestVerdictCounts || {})) {
    lines.push(`| verdict:${esc(key)} | ${value} |`);
  }
  if (report.summary.latestRows === 0) lines.push('| none | 0 |');
  lines.push('');
  lines.push('## Latest Rows');
  lines.push('');
  lines.push('| Symbol | Decision | Reason | Coverage | Freshness | Date | Days | TargetBuf% | RR@Cur | Dist% | Other Blockers | Row Verdict | Action |');
  lines.push('| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.finalDecision)} | ${esc(row.decisionReason)} | ${esc(row.coverageStatus)} | ${esc(row.freshnessStatus)} | ${esc(row.earningsDate || 'N/A')} | ${fmt(row.earningsDaysToEvent, 0)} | ${fmt(row.targetBufferFromCurrentPct)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${esc((row.blockers || []).join(', ') || 'none')} | ${esc(row.rowVerdict)} | ${esc(row.recommendedAction)} |`);
  }
  if (report.latestRows.length === 0) {
    lines.push('| none | none | none | none | none | N/A | N/A | N/A | N/A | N/A | none | none | none |');
  }
  lines.push('');
  lines.push('## Recent Runs');
  lines.push('');
  lines.push('| Stage6 File | Rows | Earnings Rows | Coverage Counts | Verdict Counts |');
  lines.push('| --- | ---: | ---: | --- | --- |');
  for (const run of report.runs.slice(-12)) {
    const coverage = Object.entries(run.coverageCounts || {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'none';
    const verdicts = Object.entries(run.rowVerdicts || {}).map(([k, v]) => `${k}:${v}`).join(', ') || 'none';
    lines.push(`| ${esc(run.stage6File)} | ${run.rows} | ${run.earningsRows} | ${esc(coverage)} | ${esc(verdicts)} |`);
  }
  lines.push('');
  lines.push('## Policy Interpretation');
  lines.push('');
  lines.push('- `EARNINGS_SOURCE_MISSING` means both dated source and days-to-event are absent. This is data coverage repair, not execution-policy tuning.');
  lines.push('- `EARNINGS_DAYS_ONLY_DATE_MISSING` means Stage6 has a days number but lacks an auditable event date/source. Persist the date before trusting freshness.');
  lines.push('- `EARNINGS_PRESENT_BUT_EXECUTION_STILL_BLOCKED` means earnings data is not the active execution blocker; do not lower earnings gates to force a trade.');
  lines.push('- If `target_buffer_below_min` or invalid geometry appears with earnings missing, repair earnings first but keep execution blocked until price/target geometry is valid.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const outJson = process.env.STAGE6_EARNINGS_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_EARNINGS_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport();
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(resolveRepoPath(outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolveRepoPath(outMd), buildMarkdown(report), 'utf8');
  console.log(
    `[STAGE6_EARNINGS_AUDIT] latest=${report.summary.latestStage6File || 'N/A'} rows=${report.summary.latestRows} action=${report.summary.latestAction} json=${outJson} md=${outMd}`
  );
}

main();
