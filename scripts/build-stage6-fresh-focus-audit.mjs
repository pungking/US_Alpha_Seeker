#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = 'state/stage6-fresh-focus-audit.json';
const OUT_MD = 'docs/STAGE6_FRESH_FOCUS_AUDIT.md';

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE6_FOCUS_AUDIT_STAGE6_PATH) return process.env.STAGE6_FOCUS_AUDIT_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE6_FOCUS_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}`);
  return files[0].full;
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function decisionOf(row) {
  return String(row?.finalDecision || row?.decision || 'UNKNOWN').trim().toUpperCase();
}

function reasonOf(row) {
  return String(row?.decisionReason || row?.executionReason || 'unknown').trim().toLowerCase();
}

function verdictOf(row) {
  return String(row?.verdict || row?.aiVerdict || row?.finalVerdict || row?.verdictFinal || 'UNKNOWN').trim().toUpperCase();
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function rowScore(row) {
  if (decisionOf(row) === 'EXECUTABLE_NOW') return 6;
  if (row?.zeroExecutableTuningLane) return 5;
  if (row?.targetRecalibrationViabilityVerdict) return 4;
  if (row?.breakoutRetestProofVerdict) return 3;
  if (String(row?.executionBucket || '').toUpperCase() === 'WATCHLIST') return 2;
  return 1;
}

function uniqueRows(stage6) {
  const contract = stage6?.execution_contract || {};
  const rows = [
    ...(Array.isArray(contract.modelTop6) ? contract.modelTop6 : []),
    ...(Array.isArray(contract.executablePicks) ? contract.executablePicks : []),
    ...(Array.isArray(contract.watchlistTop) ? contract.watchlistTop : []),
    ...(Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates : []),
    ...(Array.isArray(stage6?.candidates) ? stage6.candidates : [])
  ];
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = normalizeSymbol(row);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || rowScore(row) > rowScore(existing)) bySymbol.set(symbol, row);
  }
  return [...bySymbol.values()];
}

function qualityGateLane(row) {
  const reason = reasonOf(row);
  if (reason === 'wait_earnings_data_missing_quality_floor' || reason === 'wait_earnings_data_missing') return 'earnings_data_coverage';
  if (reason === 'wait_verdict_not_sidecar_actionable') return 'non_actionable_verdict';
  if (reason === 'blocked_quality_verdict_unusable') return 'verdict_unusable';
  if (reason === 'blocked_quality_conviction_floor') return 'conviction_floor';
  if (reason === 'blocked_quality_missing_expected_return') return 'expected_return_missing';
  if (reason.startsWith('blocked_quality_')) return 'quality_gate_other';
  return null;
}

function blockerCategory(row) {
  const reason = reasonOf(row);
  if (reason.includes('structure')) return 'structure';
  if (reason.includes('breakout') || reason.includes('retest')) return 'breakout';
  if (reason.includes('target')) return 'target_recalibration';
  if (reason.includes('earnings') || reason.includes('quality') || reason.includes('verdict')) return 'quality_gate';
  if (reason.includes('rr') || reason.includes('stop') || reason.includes('geometry')) return 'risk_geometry';
  if (reason.includes('pullback') || reason.includes('distance')) return 'entry_distance';
  return 'other';
}

function requiredFieldCoverage(rows, field) {
  return {
    present: rows.filter((row) => Object.prototype.hasOwnProperty.call(row, field)).length,
    total: rows.length
  };
}

function compactRow(row) {
  return {
    symbol: normalizeSymbol(row),
    verdict: verdictOf(row),
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row),
    blockerCategory: blockerCategory(row),
    qualityGateLane: qualityGateLane(row),
    zeroExecutableTuningLane: row?.zeroExecutableTuningLane || null,
    zeroExecutableTuningVerdict: row?.zeroExecutableTuningVerdict || null,
    breakoutRetestProofConfirmed: row?.breakoutRetestProofConfirmed ?? null,
    breakoutRetestProofReviewReady: row?.breakoutRetestProofReviewReady ?? null,
    breakoutRetestProofContinuationConfirmed: row?.breakoutRetestProofContinuationConfirmed ?? null,
    breakoutRetestProofMaxContinuationExtensionPct: numberOrNull(row?.breakoutRetestProofMaxContinuationExtensionPct),
    breakoutRetestProofContinuationMinRr: numberOrNull(row?.breakoutRetestProofContinuationMinRr),
    breakoutRetestProofContinuationMinTargetBufferPct: numberOrNull(row?.breakoutRetestProofContinuationMinTargetBufferPct),
    breakoutRetestPromotionVerdict: row?.breakoutRetestPromotionVerdict || null,
    breakoutRetestPromotionReady: row?.breakoutRetestPromotionReady ?? null,
    breakoutRetestPromotionPolicyDecision: row?.breakoutRetestPromotionPolicyDecision || null,
    breakoutRetestPromotionBlockedBy: Array.isArray(row?.breakoutRetestPromotionBlockedBy) ? row.breakoutRetestPromotionBlockedBy : [],
    targetRecalibrationVerdict: row?.targetRecalibrationVerdict || null,
    targetRecalibrationCandidate: row?.targetRecalibrationCandidate ?? null,
    targetNoTradeConfirmed: row?.targetNoTradeConfirmed ?? null,
    targetRecalibrationViabilityVerdict: row?.targetRecalibrationViabilityVerdict || null,
    targetRecalibrationCurrentTargetGapPct: numberOrNull(row?.targetRecalibrationCurrentTargetGapPct),
    targetRecalibrationRequiredTargetSource: row?.targetRecalibrationRequiredTargetSource || null,
    targetRecalibrationRiskBasisStopDistancePct: numberOrNull(row?.targetRecalibrationRiskBasisStopDistancePct),
    targetRecalibrationShortfallPct: numberOrNull(row?.targetRecalibrationShortfallPct),
    riskGeometryPolicyVerdict: row?.riskGeometryPolicyVerdict || null,
    riskGeometryRequiredTargetPrice: numberOrNull(row?.riskGeometryRequiredTargetPrice),
    riskGeometryRequiredTargetBufferPct: numberOrNull(row?.riskGeometryRequiredTargetBufferPct),
    riskGeometryTargetGapPct: numberOrNull(row?.riskGeometryTargetGapPct),
    riskGeometryTargetRecalibrationCandidate: row?.riskGeometryTargetRecalibrationCandidate ?? null,
    rrAtCurrentPrice: numberOrNull(row?.rrAtCurrentPrice),
    entryDistancePct: numberOrNull(row?.entryDistancePctShadow ?? row?.entryDistancePct),
    targetBufferFromCurrentPct: numberOrNull(row?.targetBufferFromCurrentPct)
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Fresh Focus Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Stage6: ${report.stage6.file}`);
  lines.push(`- Hash: ${report.stage6.hash}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Executable Rows: ${report.summary.executableRows}`);
  lines.push(`- Safety: report-only; no broker/state mutation.`);
  lines.push('');
  lines.push('## Required Focus Metrics');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| latestQualityGateLaneCounts | ${esc(JSON.stringify(report.summary.latestQualityGateLaneCounts))} |`);
  lines.push(`| zeroExecutableTuningLaneCounts | ${esc(JSON.stringify(report.summary.zeroExecutableTuningLaneCounts))} |`);
  lines.push(`| breakoutRetestProofConfirmedCounts | ${esc(JSON.stringify(report.summary.breakoutRetestProofConfirmedCounts))} |`);
  lines.push(`| breakoutContinuationConfirmedCounts | ${esc(JSON.stringify(report.summary.breakoutContinuationConfirmedCounts))} |`);
  lines.push(`| targetRecalibrationViabilityVerdictCounts | ${esc(JSON.stringify(report.summary.targetRecalibrationViabilityVerdictCounts))} |`);
  lines.push(`| targetRecalibrationRequiredTargetSourceCounts | ${esc(JSON.stringify(report.summary.targetRecalibrationRequiredTargetSourceCounts))} |`);
  lines.push(`| riskGeometryTargetRecalibrationCandidateCounts | ${esc(JSON.stringify(report.summary.riskGeometryTargetRecalibrationCandidateCounts))} |`);
  lines.push(`| blockerCategoryCounts | ${esc(JSON.stringify(report.summary.blockerCategoryCounts))} |`);
  lines.push('');
  lines.push('## Field Coverage');
  lines.push('');
  lines.push('| Field | Present / Total |');
  lines.push('| --- | ---: |');
  for (const [field, coverage] of Object.entries(report.fieldCoverage)) {
    lines.push(`| ${field} | ${coverage.present}/${coverage.total} |`);
  }
  lines.push('');
  lines.push('## Row Focus');
  lines.push('');
  lines.push('| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
  for (const row of report.rows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(row.finalDecision)}/${esc(row.decisionReason)} | ${esc(row.blockerCategory)} | ${esc(row.qualityGateLane)} | ${esc(row.zeroExecutableTuningLane)} | ${esc(row.breakoutRetestProofConfirmed)} | ${esc(row.breakoutRetestPromotionPolicyDecision)} | ${esc((row.breakoutRetestPromotionBlockedBy || []).join(', ') || 'none')} | ${esc(row.targetRecalibrationRequiredTargetSource)} | ${esc(row.targetRecalibrationViabilityVerdict)} | ${esc(row.riskGeometryTargetGapPct)} | ${esc(row.rrAtCurrentPrice)} | ${esc(row.entryDistancePct)} | ${esc(row.targetBufferFromCurrentPct)} |`);
  }
  lines.push('');
  lines.push('## Track Separation');
  lines.push('');
  lines.push('- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.');
  lines.push('- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.');
  lines.push('- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const rows = uniqueRows(stage6);
  const executableRows = rows.filter((row) => decisionOf(row) === 'EXECUTABLE_NOW');
  const qualityGateRows = rows.filter((row) => qualityGateLane(row));
  const requiredFocusFields = [
    'zeroExecutableTuningLane',
    'breakoutRetestProofConfirmed',
    'targetRecalibrationViabilityVerdict'
  ];
  const fieldCoverage = {
    zeroExecutableTuningLane: requiredFieldCoverage(rows, 'zeroExecutableTuningLane'),
    breakoutRetestProofConfirmed: requiredFieldCoverage(rows, 'breakoutRetestProofConfirmed'),
    breakoutRetestProofContinuationConfirmed: requiredFieldCoverage(rows, 'breakoutRetestProofContinuationConfirmed'),
    breakoutRetestPromotionPolicyDecision: requiredFieldCoverage(rows, 'breakoutRetestPromotionPolicyDecision'),
    breakoutRetestPromotionBlockedBy: requiredFieldCoverage(rows, 'breakoutRetestPromotionBlockedBy'),
    targetRecalibrationViabilityVerdict: requiredFieldCoverage(rows, 'targetRecalibrationViabilityVerdict'),
    targetRecalibrationRequiredTargetSource: requiredFieldCoverage(rows, 'targetRecalibrationRequiredTargetSource'),
    riskGeometryTargetGapPct: requiredFieldCoverage(rows, 'riskGeometryTargetGapPct')
  };
  const requiredCoveragePass = requiredFocusFields.every((field) => {
    const coverage = fieldCoverage[field];
    return coverage?.total > 0 && coverage.present === coverage.total;
  });
  const hasOpaqueOtherOnly = rows.length > 0 && Object.keys(countBy(rows, blockerCategory)).length === 1 && countBy(rows, blockerCategory).other === rows.length;
  const overall = rows.length === 0
    ? 'fail_no_rows'
    : !requiredCoveragePass
      ? 'fail_required_focus_fields_missing'
      : hasOpaqueOtherOnly
        ? 'warn_opaque_blocker_categories'
        : executableRows.length > 0
          ? 'pass_executable_present_focus_fields_ok'
          : 'pass_zero_executable_focus_fields_ok';
  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || fileSha256(stage6Path)
    },
    summary: {
      rows: rows.length,
      executableRows: executableRows.length,
      latestQualityGateLaneCounts: countBy(qualityGateRows, qualityGateLane),
      zeroExecutableTuningLaneCounts: countBy(rows, (row) => row?.zeroExecutableTuningLane || 'missing'),
      breakoutRetestProofConfirmedCounts: countBy(rows, (row) => String(row?.breakoutRetestProofConfirmed ?? 'missing')),
      breakoutRetestProofReviewReadyCounts: countBy(rows, (row) => String(row?.breakoutRetestProofReviewReady ?? 'missing')),
      breakoutContinuationConfirmedCounts: countBy(rows, (row) => String(row?.breakoutRetestProofContinuationConfirmed ?? 'missing')),
      breakoutPromotionPolicyDecisionCounts: countBy(rows, (row) => row?.breakoutRetestPromotionPolicyDecision || 'missing'),
      targetRecalibrationViabilityVerdictCounts: countBy(rows, (row) => row?.targetRecalibrationViabilityVerdict || 'missing'),
      targetRecalibrationRequiredTargetSourceCounts: countBy(rows, (row) => row?.targetRecalibrationRequiredTargetSource || 'missing'),
      riskGeometryTargetRecalibrationCandidateCounts: countBy(rows, (row) => String(row?.riskGeometryTargetRecalibrationCandidate ?? 'missing')),
      blockerCategoryCounts: countBy(rows, blockerCategory)
    },
    fieldCoverage,
    requiredFocusFields,
    trackSeparation: {
      stage6ProducerTuning: ['breakout_proofConfirmed_criteria', 'target_recalibration_formula', 'risk_geometry_recalculation_evidence'],
      sidecarSubmitReprice: 'out_of_scope_until_executable_payload_and_explicit_approval',
      opsHealthFail: 'separate_alpha_exec_engine_guard_metadata_track'
    },
    safety: {
      reportOnly: true,
      brokerMutation: false,
      stateMutation: false
    },
    rows: rows.map(compactRow)
  };
  ensureParent(OUT_JSON);
  ensureParent(OUT_MD);
  fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(resolveRepo(OUT_MD), buildMarkdown(report), 'utf8');
  console.log(`[STAGE6_FRESH_FOCUS_AUDIT] overall=${overall} rows=${rows.length} executable=${executableRows.length} json=${OUT_JSON}`);
  if (overall.startsWith('fail')) process.exit(1);
}

main();
