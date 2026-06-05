#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT_DIR = 'state/stage6-audit-source';
const DEFAULT_OUT_JSON = 'state/stage6-earnings-coverage-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_EARNINGS_COVERAGE_AUDIT.md';

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

const EARNINGS_DATE_PATHS = [
  ['earningsDate'],
  ['nextEarningsDate'],
  ['reportDate'],
  ['alphaVantage', 'earningsDate'],
  ['shadow', 'alphaVantage', 'earningsDate'],
  ['techMetrics', 'earningsDate']
];

const EARNINGS_DAYS_PATHS = [
  ['earningsDaysToEvent'],
  ['techMetrics', 'daysToEarnings'],
  ['nextEarningsInDays'],
  ['daysToEarnings'],
  ['earningsDday']
];

const EARNINGS_SOURCE_PATHS = [
  ['earningsSource'],
  ['techMetrics', 'earningsSource'],
  ['alphaVantage', 'source'],
  ['shadow', 'alphaVantage', 'source']
];

const EARNINGS_RETRIEVED_AT_PATHS = [
  ['earningsRetrievedAt'],
  ['techMetrics', 'earningsRetrievedAt'],
  ['alphaVantage', 'retrievedAt'],
  ['shadow', 'alphaVantage', 'retrievedAt'],
  ['retrievedAt'],
  ['generatedAt']
];

function collectPathHits(row, paths) {
  return paths
    .map((pathParts) => {
      const value = getByPath(row, pathParts);
      const present = value !== null && value !== undefined && value !== '';
      return {
        path: pathParts.join('.'),
        present,
        valueType: present ? typeof value : null
      };
    })
    .filter((hit) => hit.present);
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
  const datePick = firstValueWithPath(row, EARNINGS_DATE_PATHS);
  const daysPick = firstValueWithPath(row, EARNINGS_DAYS_PATHS);
  const sourcePick = firstValueWithPath(row, EARNINGS_SOURCE_PATHS);
  const retrievedAtPick = firstValueWithPath(row, EARNINGS_RETRIEVED_AT_PATHS);
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

  const hasEarningsDatum = Boolean(earningsDate || daysToEvent != null);
  return {
    coverageStatus,
    earningsDate: earningsDate ? earningsDate.toISOString().slice(0, 10) : null,
    earningsDateSource: datePick.path,
    earningsSource: hasEarningsDatum ? textOrNull(sourcePick.value) : null,
    earningsSourcePath: hasEarningsDatum ? sourcePick.path : null,
    earningsRetrievedAt: hasEarningsDatum ? parseDate(retrievedAtPick.value)?.toISOString() || null : null,
    earningsRetrievedAtPath: hasEarningsDatum ? retrievedAtPick.path : null,
    earningsDaysToEvent: daysToEvent,
    earningsDaysSource: daysPick.path,
    computedDaysToEvent: computedDays,
    freshnessStatus: freshnessFindings.length > 0 ? 'FRESHNESS_REVIEW_REQUIRED' : 'FRESH',
    freshnessFindings,
    sourceProbe: {
      datePathHits: collectPathHits(row, EARNINGS_DATE_PATHS),
      daysPathHits: collectPathHits(row, EARNINGS_DAYS_PATHS),
      sourcePathHits: collectPathHits(row, EARNINGS_SOURCE_PATHS),
      retrievedAtPathHits: collectPathHits(row, EARNINGS_RETRIEVED_AT_PATHS)
    }
  };
}

function classifyCoverageRootCause(coverage) {
  if (coverage.coverageStatus === 'EARNINGS_SOURCE_MISSING') return 'UPSTREAM_EARNINGS_EVENT_ABSENT';
  if (coverage.coverageStatus === 'EARNINGS_DAYS_ONLY_DATE_MISSING') return 'DATED_SOURCE_NOT_PERSISTED';
  if (coverage.coverageStatus === 'EARNINGS_DATE_ONLY_DAYS_MISSING') return 'DAYS_TO_EVENT_NOT_PERSISTED';
  if (coverage.freshnessFindings.includes('earnings_date_in_past')) return 'STALE_EARNINGS_EVENT_DATE';
  if (coverage.freshnessFindings.includes('earnings_days_date_mismatch')) return 'EARNINGS_DAYS_DATE_MISMATCH';
  if (coverage.coverageStatus === 'EARNINGS_PRESENT' && coverage.freshnessStatus === 'FRESH') return 'SOURCE_PRESENT_FRESH';
  return 'EARNINGS_SOURCE_REVIEW_REQUIRED';
}

function classifyRepairLane(rootCause) {
  if (rootCause === 'UPSTREAM_EARNINGS_EVENT_ABSENT') return 'STAGE4_OR_VENDOR_EARNINGS_SOURCE_REPAIR';
  if (rootCause === 'DATED_SOURCE_NOT_PERSISTED') return 'STAGE6_EARNINGS_LINEAGE_PERSISTENCE_REPAIR';
  if (rootCause === 'DAYS_TO_EVENT_NOT_PERSISTED') return 'STAGE6_DAYS_TO_EVENT_RECOMPUTE';
  if (rootCause === 'STALE_EARNINGS_EVENT_DATE') return 'EARNINGS_SOURCE_FRESHNESS_REFRESH';
  if (rootCause === 'EARNINGS_DAYS_DATE_MISMATCH') return 'EARNINGS_DATE_DAYS_RECONCILIATION';
  if (rootCause === 'SOURCE_PRESENT_FRESH') return 'NO_EARNINGS_REPAIR_REQUIRED';
  return 'EARNINGS_SOURCE_REVIEW';
}

function classifyPromotionBlockers(coverage, executionOverlap) {
  const blockers = [];
  if (coverage.coverageStatus !== 'EARNINGS_PRESENT') blockers.push(coverage.coverageStatus);
  if (coverage.freshnessStatus !== 'FRESH') blockers.push(coverage.freshnessStatus);
  blockers.push(...(executionOverlap.blockers || []));
  return blockers.length > 0 ? blockers : ['none'];
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
  const coverageRootCause = classifyCoverageRootCause(coverage);
  const repairLane = classifyRepairLane(coverageRootCause);
  const promotionBlockedBy = classifyPromotionBlockers(coverage, executionOverlap);
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
    coverageRootCause,
    repairLane,
    promotionBlockedBy,
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
  const latestRootCauseCounts = countBy(latestRows, (row) => row.coverageRootCause);
  const latestRepairLaneCounts = countBy(latestRows, (row) => row.repairLane);
  const latestPromotionBlockerCounts = countBy(
    latestRows.flatMap((row) => row.promotionBlockedBy || []),
    (blocker) => blocker
  );
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
  const overall =
    latestRows.length === 0
      ? 'pass_no_latest_earnings_rows'
      : latestCoverageMissing + latestAuditabilityMissing > 0
        ? 'fail_earnings_coverage_repair_required'
        : latestExecutionStillBlocked === latestRows.length
          ? 'warn_earnings_ok_execution_blocked_elsewhere'
          : 'review_earnings_policy_ready_after_source_verification';
  return {
    generatedAt: new Date().toISOString(),
    scope: 'stage6_earnings_coverage_freshness_report_only',
    overall,
    action: latestAction,
    latestStage6: latestRun
      ? {
          file: latestRun.stage6File,
          generatedAt: latestRun.generatedAt,
          totalRows: latestRun.rows,
          earningsRows: latestRun.earningsRows
        }
      : null,
    latestRootCause: latestRows.length === 0 ? 'none' : Object.keys(latestRootCauseCounts)[0] || 'unknown',
    safety: {
      brokerMutationAuthorized: false,
      executionPolicyChanged: false,
      reason: 'analysis-side data coverage audit only; no sidecar submit/reprice/replace behavior'
    },
    source: {
      inputDir,
      files: files.length
    },
    sourceStage6: latestRun
      ? {
          file: latestRun.stage6File,
          generatedAt: latestRun.generatedAt,
          totalRows: latestRun.rows,
          earningsRows: latestRun.earningsRows
        }
      : null,
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
      latestRootCauseCounts,
      latestRepairLaneCounts,
      latestPromotionBlockerCounts,
      allCoverageCounts: countBy(allRows, (row) => row.coverageStatus),
      allVerdictCounts: countBy(allRows, (row) => row.rowVerdict),
      latestAction
    },
    doneWhen: {
      earningsDataCoverageSeparated:
        latestRows.length === 0 ? 'NO_LATEST_EARNINGS_ROWS' : latestCoverageMissing + latestAuditabilityMissing > 0 ? 'DATA_QUALITY_TRACK' : 'NO_EARNINGS_DATA_GAP',
      executionPolicyChanged: false,
      brokerMutationAttempted: false,
      sourceFreshnessVerdict:
        latestRows.length === 0 ? 'NO_LATEST_EARNINGS_ROWS' : latestCoverageMissing > 0 ? 'COVERAGE_REPAIR_REQUIRED' : latestAuditabilityMissing > 0 ? 'AUDITABILITY_REPAIR_REQUIRED' : 'EARNINGS_SOURCE_AVAILABLE'
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
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Latest Stage6: ${report.summary.latestStage6File || 'N/A'}`);
  lines.push(`- Source Files: ${report.source.files}`);
  lines.push(`- Latest Earnings Rows: ${report.summary.latestRows}`);
  lines.push(`- Latest Coverage Missing: ${report.summary.latestCoverageMissing}`);
  lines.push(`- Latest Auditability Missing: ${report.summary.latestAuditabilityMissing}`);
  lines.push(`- Latest Execution Still Blocked Elsewhere: ${report.summary.latestExecutionStillBlocked}`);
  lines.push(`- Latest Action: **${report.summary.latestAction}**`);
  lines.push(`- Latest Root Cause: **${report.latestRootCause || 'N/A'}**`);
  lines.push(`- Broker Mutation Authorized: ${report.safety.brokerMutationAuthorized}`);
  lines.push(`- Execution Policy Changed: ${report.safety.executionPolicyChanged}`);
  lines.push(`- DoneWhen Coverage Track: ${report.doneWhen.earningsDataCoverageSeparated}`);
  lines.push(`- DoneWhen Source Freshness: ${report.doneWhen.sourceFreshnessVerdict}`);
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
  for (const [key, value] of Object.entries(report.summary.latestRootCauseCounts || {})) {
    lines.push(`| rootCause:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.latestRepairLaneCounts || {})) {
    lines.push(`| repairLane:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.latestPromotionBlockerCounts || {})) {
    lines.push(`| promotionBlockedBy:${esc(key)} | ${value} |`);
  }
  if (report.summary.latestRows === 0) lines.push('| none | 0 |');
  lines.push('');
  lines.push('## Latest Rows');
  lines.push('');
  lines.push('| Symbol | Decision | Reason | Coverage | Freshness | Root Cause | Repair Lane | Promotion Blocked By | Date | Days | Source | RetrievedAt | TargetBuf% | RR@Cur | Dist% | Other Blockers | Row Verdict | Action |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.finalDecision)} | ${esc(row.decisionReason)} | ${esc(row.coverageStatus)} | ${esc(row.freshnessStatus)} | ${esc(row.coverageRootCause)} | ${esc(row.repairLane)} | ${esc((row.promotionBlockedBy || []).join(', ') || 'none')} | ${esc(row.earningsDate || 'N/A')} | ${fmt(row.earningsDaysToEvent, 0)} | ${esc(row.earningsSource || 'N/A')} | ${esc(row.earningsRetrievedAt || 'N/A')} | ${fmt(row.targetBufferFromCurrentPct)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${esc((row.blockers || []).join(', ') || 'none')} | ${esc(row.rowVerdict)} | ${esc(row.recommendedAction)} |`);
  }
  if (report.latestRows.length === 0) {
    lines.push('| none | none | none | none | none | none | none | none | N/A | N/A | N/A | N/A | N/A | N/A | N/A | none | none | none |');
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
  lines.push('- `UPSTREAM_EARNINGS_EVENT_ABSENT` means Stage6 did not receive a dated earnings source from Stage4/vendor/shadow lineage; fix coverage upstream before changing gates.');
  lines.push('- `promotionBlockedBy` is cumulative. If it includes current-entry geometry, earnings repair alone must not promote the row.');
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
