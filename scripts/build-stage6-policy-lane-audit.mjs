#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_JSON = 'state/stage6-policy-lane-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_POLICY_LANE_AUDIT_2026-05-29.md';

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

function countBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isLatestRow(row, latestStage6File) {
  return !latestStage6File || row.stage6File === latestStage6File;
}

function isBuyOrStrongBuy(row) {
  const verdict = String(row?.verdict || '').toUpperCase();
  return verdict === 'BUY' || verdict === 'STRONG_BUY';
}

function isReason(row, reason) {
  return String(row?.decisionReason || '').toLowerCase() === reason;
}

function isValidGeometry(row) {
  return row.geometryStatus === 'VALID_GEOMETRY';
}

function isCurrentRrAcceptable(row) {
  return row.currentRrStatus === 'RR_CURRENT_ACCEPTABLE';
}

function hasDeepDistance(row) {
  return row.entryDistanceStatus === 'DISTANCE_DEEP_PULLBACK';
}

function targetNearCurrentDecision(row) {
  if (!isReason(row, 'wait_target_near_current')) return null;
  if (row.currentRrStatus === 'RR_CURRENT_TARGET_ALREADY_REACHED') {
    return {
      laneDecision: 'TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE',
      recommendedAction: 'Keep no-trade; require target refresh or fresh thesis before any execution candidate.'
    };
  }
  return {
    laneDecision: 'TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED',
    recommendedAction: 'Recompute target/stop thesis; do not use sidecar chase to make this executable.'
  };
}

function earningsMissingDecision(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  if (reason !== 'wait_earnings_data_missing_quality_floor' && reason !== 'wait_earnings_data_missing') return null;
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && row.entryDistanceStatus === 'DISTANCE_EXECUTION_WINDOW') {
    return {
      laneDecision: 'EARNINGS_DATA_OVERBLOCK_REVIEW_READY',
      recommendedAction: 'Do not lower quality gates blindly; first repair earnings coverage/freshness, then rerun Stage6.'
    };
  }
  return {
    laneDecision: 'EARNINGS_DATA_COVERAGE_REQUIRED',
    recommendedAction: 'Separate data freshness/coverage from execution policy; current evidence does not justify promotion.'
  };
}

function breakoutDecision(row) {
  if (!isReason(row, 'wait_breakout_retest_required')) return null;
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && hasDeepDistance(row)) {
    return {
      laneDecision: 'BREAKOUT_RETEST_POLICY_REVIEW_READY',
      recommendedAction: 'Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase.'
    };
  }
  if (isValidGeometry(row) && isCurrentRrAcceptable(row)) {
    return {
      laneDecision: 'BREAKOUT_RETEST_REVIEW_LOW_DISTANCE',
      recommendedAction: 'Inspect retest evidence; promotion still requires Stage6 producer proof fields.'
    };
  }
  return {
    laneDecision: 'BREAKOUT_RETEST_WAIT_JUSTIFIED',
    recommendedAction: 'Keep WAIT_PRICE until retest/current RR evidence improves.'
  };
}

function structureDecision(row) {
  if (!isReason(row, 'wait_structure_confirmation_required')) return null;
  const structureVerdict = String(row.currentEntryStructureVerdict || '').trim();
  const missingStructureEvidence = !structureVerdict || structureVerdict === 'N/A';
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && missingStructureEvidence) {
    return {
      laneDecision: 'STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY',
      recommendedAction: 'Add explicit current structure evidence fields; avoid broad WAIT without proof metadata.'
    };
  }
  if (isValidGeometry(row) && missingStructureEvidence) {
    return {
      laneDecision: 'STRUCTURE_WAIT_JUSTIFIED_BY_RR_BUT_METADATA_MISSING',
      recommendedAction: 'WAIT is defensible from current RR/distance, but Stage6 should still emit structure proof/failure metadata.'
    };
  }
  return {
    laneDecision: 'STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED',
    recommendedAction: 'Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact.'
  };
}

function classifyPolicyLane(row) {
  return (
    breakoutDecision(row) ||
    structureDecision(row) ||
    targetNearCurrentDecision(row) ||
    earningsMissingDecision(row) ||
    {
      laneDecision: 'OUT_OF_SCOPE_FOR_POLICY_LANE',
      recommendedAction: 'Use execution gate audit blocker class and sidecar-safe validation path.'
    }
  );
}

function laneName(row) {
  if (isReason(row, 'wait_breakout_retest_required')) return 'breakoutRetest';
  if (isReason(row, 'wait_structure_confirmation_required')) return 'structureConfirmation';
  if (isReason(row, 'wait_target_near_current')) return 'targetNearCurrent';
  if (isReason(row, 'wait_earnings_data_missing_quality_floor') || isReason(row, 'wait_earnings_data_missing')) return 'earningsDataMissing';
  return 'other';
}

function buildReport(input) {
  const latestStage6File = input.latestRun?.stage6File || input.runSummaries?.[0]?.stage6File || null;
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const watchlistRows = rows
    .filter((row) => String(row.finalDecision || '').toUpperCase() !== 'EXECUTABLE_NOW')
    .filter(isBuyOrStrongBuy)
    .map((row) => ({ ...row, lane: laneName(row), ...classifyPolicyLane(row) }));
  const latestRows = watchlistRows.filter((row) => isLatestRow(row, latestStage6File));
  const lanes = {
    breakoutRetest: watchlistRows.filter((row) => row.lane === 'breakoutRetest'),
    structureConfirmation: watchlistRows.filter((row) => row.lane === 'structureConfirmation'),
    targetNearCurrent: watchlistRows.filter((row) => row.lane === 'targetNearCurrent'),
    earningsDataMissing: watchlistRows.filter((row) => row.lane === 'earningsDataMissing')
  };
  const latestLaneRows = {
    breakoutRetest: latestRows.filter((row) => row.lane === 'breakoutRetest'),
    structureConfirmation: latestRows.filter((row) => row.lane === 'structureConfirmation'),
    targetNearCurrent: latestRows.filter((row) => row.lane === 'targetNearCurrent'),
    earningsDataMissing: latestRows.filter((row) => row.lane === 'earningsDataMissing')
  };
  const reviewReadyDecisions = new Set([
    'BREAKOUT_RETEST_POLICY_REVIEW_READY',
    'BREAKOUT_RETEST_REVIEW_LOW_DISTANCE',
    'STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY',
    'EARNINGS_DATA_OVERBLOCK_REVIEW_READY'
  ]);
  const latestReviewReadyRows = latestRows.filter((row) => reviewReadyDecisions.has(row.laneDecision));
  const summary = {
    sourceAuditGeneratedAt: input.generatedAt || null,
    latestStage6File,
    rows: watchlistRows.length,
    latestRows: latestRows.length,
    latestReviewReadyRows: latestReviewReadyRows.length,
    laneCounts: countBy(watchlistRows, (row) => row.lane),
    latestLaneCounts: countBy(latestRows, (row) => row.lane),
    decisionCounts: countBy(watchlistRows, (row) => row.laneDecision),
    latestDecisionCounts: countBy(latestRows, (row) => row.laneDecision),
    brokerMutationAuthorized: false,
    executionPolicyChanged: false
  };
  const latestVerdict =
    latestReviewReadyRows.length > 0
      ? 'STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED'
      : latestRows.length > 0
        ? 'WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED'
        : 'NO_BUY_STRONG_BUY_WATCHLIST_ROWS';
  return {
    generatedAt: new Date().toISOString(),
    sourceAudit: DEFAULT_INPUT,
    safety: {
      brokerMutationAuthorized: false,
      executionPolicyChanged: false,
      reason: 'analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope'
    },
    summary: { ...summary, latestVerdict },
    latestReviewReadyRows: latestReviewReadyRows.map(compactRow),
    latestRows: latestRows.map(compactRow),
    laneSummary: Object.fromEntries(
      Object.entries(lanes).map(([key, laneRows]) => [
        key,
        {
          rows: laneRows.length,
          latestRows: latestLaneRows[key]?.length || 0,
          decisionCounts: countBy(laneRows, (row) => row.laneDecision),
          latestDecisionCounts: countBy(latestLaneRows[key] || [], (row) => row.laneDecision)
        }
      ])
    ),
    rows: watchlistRows.map(compactRow)
  };
}

function compactRow(row) {
  return {
    stage6File: row.stage6File,
    symbol: row.symbol,
    verdict: row.verdict,
    lane: row.lane,
    finalDecision: row.finalDecision,
    decisionReason: row.decisionReason,
    executionBucket: row.executionBucket,
    entryDistanceStatus: row.entryDistanceStatus,
    geometryStatus: row.geometryStatus,
    currentRrStatus: row.currentRrStatus,
    laneDecision: row.laneDecision,
    recommendedAction: row.recommendedAction,
    expectedReturnPct: row.expectedReturnPct,
    rr: row.rr,
    rrAtCurrentPrice: row.rrAtCurrentPrice,
    entryDistancePct: row.entryDistancePct,
    targetBufferFromCurrentPct: row.targetBufferFromCurrentPct,
    price: row.price,
    entry: row.entry,
    target: row.target,
    stop: row.stop,
    currentEntryStructureVerdict: row.currentEntryStructureVerdict || null,
    currentEntryStructureConfirmed: Boolean(row.currentEntryStructureConfirmed),
    currentEntryStructureReasons: row.currentEntryStructureReasons || [],
    blockerClass: row.blockerClass,
    fixLane: row.fixLane
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Policy Lane Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source Audit: ${report.sourceAudit}`);
  lines.push(`- Latest Stage6: ${report.summary.latestStage6File || 'N/A'}`);
  lines.push(`- Latest Verdict: **${report.summary.latestVerdict}**`);
  lines.push(`- Latest Review-Ready Rows: ${report.summary.latestReviewReadyRows}`);
  lines.push(`- Broker Mutation Authorized: ${report.safety.brokerMutationAuthorized}`);
  lines.push(`- Execution Policy Changed: ${report.safety.executionPolicyChanged}`);
  lines.push(`- Safety Reason: ${report.safety.reason}`);
  lines.push('');
  lines.push('## Latest Lane Summary');
  lines.push('');
  lines.push('| Lane | Latest Rows | Latest Decisions |');
  lines.push('| --- | ---: | --- |');
  for (const [lane, info] of Object.entries(report.laneSummary)) {
    const latestDecisions = Object.entries(info.latestDecisionCounts || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(', ') || 'none';
    lines.push(`| ${esc(lane)} | ${info.latestRows} | ${esc(latestDecisions)} |`);
  }
  lines.push('');
  lines.push('## Latest Review-Ready Rows');
  lines.push('');
  lines.push('| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestReviewReadyRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.lane)} | ${esc(row.laneDecision)} | ${fmt(row.expectedReturnPct)} | ${fmt(row.rr)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${fmt(row.targetBufferFromCurrentPct)} | ${esc(row.geometryStatus)} | ${esc(row.currentRrStatus)} | ${esc(row.recommendedAction)} |`);
  }
  if (report.latestReviewReadyRows.length === 0) lines.push('| none | none | none | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |');
  lines.push('');
  lines.push('## Latest Rows');
  lines.push('');
  lines.push('| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |');
  lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(row.lane)} | ${esc(row.decisionReason)} | ${esc(row.laneDecision)} | ${fmt(row.expectedReturnPct)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${fmt(row.targetBufferFromCurrentPct)} | ${esc(row.geometryStatus)} | ${esc(row.currentRrStatus)} | ${esc(row.recommendedAction)} |`);
  }
  lines.push('');
  lines.push('## Policy Interpretation');
  lines.push('');
  lines.push('- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.');
  lines.push('- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.');
  lines.push('- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.');
  lines.push('- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const inputPath = process.env.STAGE6_POLICY_LANE_AUDIT_INPUT || DEFAULT_INPUT;
  const outJson = process.env.STAGE6_POLICY_LANE_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_POLICY_LANE_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport(readJson(inputPath));
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(
    `[STAGE6_POLICY_LANE_AUDIT] latest=${report.summary.latestStage6File || 'N/A'} verdict=${report.summary.latestVerdict} latestReviewReady=${report.summary.latestReviewReadyRows} json=${outJson} md=${outMd}`
  );
}

main();
