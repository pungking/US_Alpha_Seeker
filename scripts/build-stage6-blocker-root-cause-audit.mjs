#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const DEFAULT_OUT_JSON = 'state/stage6-blocker-root-cause-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_BLOCKER_ROOT_CAUSE_AUDIT.md';
const DEFAULT_ACTIONABLE_VERDICTS = ['BUY', 'STRONG_BUY', 'STRONGBUY'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
}

function fileSha256(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
  return crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
}

function readJsonIfExists(filePath) {
  if (!filePath) return null;
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function latestStage6Path() {
  const explicit = process.env.STAGE6_BLOCKER_AUDIT_STAGE6_PATH;
  if (explicit) return explicit;
  const dir = path.resolve(REPO_ROOT, process.env.STAGE6_BLOCKER_AUDIT_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const stage6Timestamp = (name) => {
    const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
    return match ? `${match[1]}_${match[2]}` : '';
  };
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}; set STAGE6_BLOCKER_AUDIT_STAGE6_PATH`);
  return files[0].full;
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? null : Number(n.toFixed(digits));
}

function text(value) {
  if (value == null) return null;
  const out = String(value).trim();
  return out ? out : null;
}

function bool(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function arr(value) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function fmt(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? 'N/A' : n.toFixed(digits);
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function uniqueRows(stage6) {
  const buckets = [
    ...(stage6?.execution_contract?.modelTop6 || []),
    ...(stage6?.execution_contract?.executablePicks || []),
    ...(stage6?.execution_contract?.watchlistTop || []),
    ...(stage6?.alpha_candidates || [])
  ];
  const bySymbol = new Map();
  for (const row of buckets) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    const score = rowScore(row);
    if (!existing || score > rowScore(existing)) bySymbol.set(symbol, row);
  }
  return [...bySymbol.values()];
}

function rowScore(row) {
  if (row?.finalDecision === 'EXECUTABLE_NOW') return 5;
  if (row?.currentEntryStructureConfirmed) return 4;
  if (row?.currentEntryRecalcFeasible) return 3;
  if (row?.executionBucket === 'WATCHLIST') return 2;
  return 1;
}

function decisionGate(stage6) {
  return stage6?.manifest?.decisionGate || stage6?.decisionGate || stage6?.execution_contract?.decisionGate || {};
}

function policyFromStage6(stage6) {
  const gate = decisionGate(stage6);
  const actionableVerdicts = Array.isArray(gate.actionableVerdicts) && gate.actionableVerdicts.length
    ? gate.actionableVerdicts.map((item) => String(item).toUpperCase())
    : DEFAULT_ACTIONABLE_VERDICTS;
  return {
    actionableVerdicts,
    currentEntryMinRr: numberOrNull(gate.currentEntryMinRr ?? gate.minRr) ?? 2,
    currentEntryMinTargetBufferPct: numberOrNull(gate.currentEntryMinTargetBufferPct ?? gate.minTargetDistancePct) ?? 3,
    minStopDistancePct: numberOrNull(gate.minStopDistancePct) ?? 1.5,
    maxStopDistancePct: numberOrNull(gate.maxStopDistancePct) ?? 22,
    adaptiveCurrentEntryEnabled: bool(gate.adaptiveCurrentEntryEnabled),
    currentEntryStopRecalcEnabled: bool(gate.currentEntryStopRecalcEnabled),
    currentEntryStructureGateRequired: gate.currentEntryStructureGateRequired !== false
  };
}

function rowVerdict(row) {
  return String(row?.verdict || row?.aiVerdict || row?.executionVerdict || '').trim().toUpperCase() || null;
}

function prices(row) {
  const price = numberOrNull(row?.price);
  const entry = numberOrNull(row?.entryPrice ?? row?.entryExecPrice ?? row?.entryAnchorPrice ?? row?.entry);
  const target = numberOrNull(row?.targetPrice ?? row?.target ?? row?.resistanceLevel ?? row?.targetMeanPrice);
  const stop = numberOrNull(row?.stopPrice ?? row?.stopLoss ?? row?.stop);
  const requiredStop = numberOrNull(row?.currentEntryRequiredStopPrice ?? row?.currentEntryRecalcStopPrice);
  const requiredStopDistancePct = numberOrNull(row?.currentEntryRequiredStopDistancePct ?? row?.currentEntryRecalcStopDistancePct);
  const targetBufferFromCurrentPct =
    numberOrNull(row?.targetBufferFromCurrentPct) ??
    (price != null && target != null && price > 0 ? ((target - price) / price) * 100 : null);
  const rrWithRecalc =
    price != null && target != null && requiredStop != null && target > price && requiredStop > 0 && requiredStop < price
      ? (target - price) / (price - requiredStop)
      : null;
  return {
    price,
    entry,
    target,
    stop,
    requiredStop,
    requiredStopDistancePct,
    targetBufferFromCurrentPct,
    rrAtCurrentPrice: numberOrNull(row?.rrAtCurrentPrice ?? row?.executionFeasibilityAtCurrentRr),
    rrWithRecalc
  };
}

function sidecarEvidence(sidecarDir) {
  if (!sidecarDir) return {};
  const root = path.isAbsolute(sidecarDir) ? sidecarDir : path.resolve(REPO_ROOT, sidecarDir);
  const fillability = readJsonIfExists(path.join(root, 'fillability-report.json'));
  const mismatch = readJsonIfExists(path.join(root, 'stage6-fillability-mismatch-audit.json'));
  const orderAudit = readJsonIfExists(path.join(root, 'last-order-decision-audit.json'));
  return { root, fillability, mismatch, orderAudit };
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function findEvidenceRows(evidence, symbol) {
  const fillabilityRows = [
    ...list(evidence?.fillability?.rows),
    ...list(evidence?.fillability?.candidates),
    ...list(evidence?.fillability?.items)
  ].filter((row) => String(row?.symbol || '').toUpperCase() === symbol);
  const mismatchRows = [
    ...list(evidence?.mismatch?.rows),
    ...list(evidence?.mismatch?.candidates),
    ...list(evidence?.mismatch?.items)
  ].filter((row) => String(row?.symbol || '').toUpperCase() === symbol);
  const decisionRows = [
    ...list(evidence?.orderAudit?.rows),
    ...list(evidence?.orderAudit?.candidates),
    ...list(evidence?.orderAudit?.summary?.candidates)
  ].filter((row) => String(row?.symbol || '').toUpperCase() === symbol);
  return { fillabilityRows, mismatchRows, decisionRows };
}

function classifyRiskGeometry(row, policy) {
  const p = prices(row);
  const reason = String(row?.decisionReason || '').toLowerCase();
  const reasons = [];
  const structureConfirmed = bool(row?.currentEntryStructureConfirmed) || row?.currentEntryStructureVerdict === 'STRUCTURE_CONFIRMED_RECALC_CANDIDATE';
  const recalcFeasible = bool(row?.currentEntryRecalcFeasible);

  if (!recalcFeasible) reasons.push('current_entry_recalc_not_feasible');
  if (policy.currentEntryStructureGateRequired && !structureConfirmed) reasons.push('structure_not_confirmed');
  if (!(p.price != null && p.target != null && p.target > p.price)) reasons.push('target_not_above_current');
  if (!(p.requiredStop != null && p.price != null && p.requiredStop > 0 && p.requiredStop < p.price)) reasons.push('required_stop_invalid');
  if (!(p.requiredStopDistancePct != null && p.requiredStopDistancePct >= policy.minStopDistancePct && p.requiredStopDistancePct <= policy.maxStopDistancePct)) {
    reasons.push('required_stop_distance_out_of_policy');
  }
  if (!(p.rrWithRecalc != null && p.rrWithRecalc >= policy.currentEntryMinRr)) reasons.push('recalculated_rr_below_min');
  if (!(p.targetBufferFromCurrentPct != null && p.targetBufferFromCurrentPct >= policy.currentEntryMinTargetBufferPct)) {
    reasons.push('target_buffer_below_min');
  }

  let rootCause = 'CURRENT_RR_WEAK_WAIT_JUSTIFIED';
  let recommendedAction = 'Keep WAIT_PRICE. Current RR remains weak after recalculation checks.';
  const hasProducerRiskPolicy = Boolean(row?.riskGeometryPolicyVerdict);
  let classifiedByReason = false;
  if (hasProducerRiskPolicy) {
    rootCause = String(row.riskGeometryPolicyVerdict);
    recommendedAction = row?.riskGeometryRecommendedAction || 'Use producer risk-geometry policy fields; do not relax sidecar risk gates.';
    classifiedByReason = true;
  } else if (reason === 'blocked_invalid_geometry') {
    rootCause = 'INVALID_GEOMETRY_NO_TRADE';
    recommendedAction = 'Keep blocked. Require Stage6 target/stop geometry repair before any execution candidate.';
    classifiedByReason = true;
  } else if (reason === 'blocked_target_too_close' || reason === 'wait_target_near_current') {
    rootCause = 'TARGET_GEOMETRY_RECALIBRATION_REQUIRED';
    recommendedAction = 'Keep no-trade/recalibration. Sidecar reprice must not chase target-near-current cases.';
    classifiedByReason = true;
  } else if (reason === 'blocked_stop_too_tight' || reason === 'blocked_stop_too_wide') {
    rootCause = recalcFeasible && structureConfirmed
      ? 'STOP_GEOMETRY_RECALCULATED_STOP_REVIEW_READY'
      : 'STOP_GEOMETRY_RECALIBRATION_REQUIRED';
    recommendedAction = recalcFeasible && structureConfirmed
      ? 'Review producer-side recalculated stop promotion; do not lower stop-distance gates.'
      : 'Keep blocked until Stage6 emits valid stop recalibration evidence.';
    classifiedByReason = true;
  }
  if (!classifiedByReason && reasons.length === 0 && (!policy.adaptiveCurrentEntryEnabled || !policy.currentEntryStopRecalcEnabled)) {
    rootCause = 'RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS';
    recommendedAction = 'Audit Stage6 producer flag propagation before changing sidecar behavior. This row has valid recalculated-stop geometry but producer flags are disabled in the Stage6 manifest.';
  } else if (!classifiedByReason && reasons.length === 0) {
    rootCause = 'RECALC_CANDIDATE_SHOULD_PROMOTE_REVIEW';
    recommendedAction = 'Producer policy appears eligible for executable_current_recalculated_stop; verify why Stage6 did not promote.';
  } else if (!classifiedByReason && recalcFeasible && structureConfirmed) {
    rootCause = 'RECALC_CANDIDATE_FAILED_NUMERIC_POLICY';
    recommendedAction = 'Keep WAIT_PRICE and inspect failed numeric policy reasons before any promotion.';
  } else if (!classifiedByReason && recalcFeasible && !structureConfirmed) {
    rootCause = 'RECALC_CANDIDATE_STRUCTURE_NOT_CONFIRMED';
    recommendedAction = 'Keep WAIT_PRICE until structure confirmation evidence is present.';
  }

  return {
    type: 'risk_geometry',
    symbol: String(row?.symbol || '').toUpperCase(),
    finalDecision: row?.finalDecision || null,
    decisionReason: row?.decisionReason || null,
    verdict: rowVerdict(row),
    rootCause,
    isActualRecalculatedStopCandidate: recalcFeasible && structureConfirmed,
    isCurrentRrWeakWaitJustified: rootCause === 'CURRENT_RR_WEAK_WAIT_JUSTIFIED',
    recommendation: recommendedAction,
    evidence: {
      price: p.price,
      entry: p.entry,
      target: p.target,
      stop: p.stop,
      originalRrAtCurrent: round(p.rrAtCurrentPrice),
      rrWithRecalculatedStop: round(p.rrWithRecalc),
      targetBufferFromCurrentPct: round(p.targetBufferFromCurrentPct),
      requiredStop: p.requiredStop,
      requiredStopDistancePct: round(p.requiredStopDistancePct),
      entryDistancePct: round(row?.entryDistancePct),
      currentEntryRecalcFeasible: recalcFeasible,
      currentEntryStructureConfirmed: structureConfirmed,
      currentEntryStructureVerdict: row?.currentEntryStructureVerdict || null,
      currentEntryStructureReasons: arr(row?.currentEntryStructureReasons),
      executionFeasibilityAtCurrent: row?.executionFeasibilityAtCurrent || null,
      executionFeasibilityAtCurrentVerdict: row?.executionFeasibilityAtCurrentVerdict || null,
      executionFeasibilityAtCurrentReason: row?.executionFeasibilityAtCurrentReason || null,
      riskGeometryPolicyVerdict: row?.riskGeometryPolicyVerdict || null,
      riskGeometryRecalibrationRequired: row?.riskGeometryRecalibrationRequired ?? null,
      riskGeometryNoTradeRequired: row?.riskGeometryNoTradeRequired ?? null,
      riskGeometryRecalculatedStopCandidate: row?.riskGeometryRecalculatedStopCandidate ?? null,
      riskGeometryReasons: arr(row?.riskGeometryReasons),
      policyFailures: reasons,
      producerFlags: {
        adaptiveCurrentEntryEnabled: policy.adaptiveCurrentEntryEnabled,
        currentEntryStopRecalcEnabled: policy.currentEntryStopRecalcEnabled,
        currentEntryStructureGateRequired: policy.currentEntryStructureGateRequired
      }
    }
  };
}

function isRiskGeometryReason(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  return [
    'wait_recalculated_stop_required',
    'wait_current_rr_below_min',
    'wait_target_near_current',
    'blocked_invalid_geometry',
    'blocked_stop_too_tight',
    'blocked_stop_too_wide',
    'blocked_target_too_close',
    'blocked_rr_below_min'
  ].includes(reason);
}

function classifyQualityGate(row, policy) {
  const p = prices(row);
  const verdict = rowVerdict(row);
  const actionable = verdict ? policy.actionableVerdicts.includes(verdict) : false;
  const targetGeometryInvalid = !(p.price != null && p.target != null && p.target > p.price);
  const targetBufferBelowMin = p.targetBufferFromCurrentPct != null && p.targetBufferFromCurrentPct < policy.currentEntryMinTargetBufferPct;
  const holdOrUnusable = !actionable;
  const normalizationSuspicious = Boolean(
    row?.executionActionableVerdict === true && !actionable
  );

  const rootCauses = [];
  if (holdOrUnusable) rootCauses.push('NON_ACTIONABLE_AI_VERDICT');
  if (String(verdict || '').toUpperCase() === 'HOLD') rootCauses.push('AI_VERDICT_HOLD');
  if (targetGeometryInvalid) rootCauses.push('TARGET_NOT_ABOVE_CURRENT');
  else if (targetBufferBelowMin) rootCauses.push('TARGET_BUFFER_BELOW_MIN');
  if (normalizationSuspicious) rootCauses.push('AI_VERDICT_NORMALIZATION_SUSPICIOUS');

  const rootCause = normalizationSuspicious
    ? 'QUALITY_GATE_NORMALIZATION_REVIEW'
    : holdOrUnusable && (targetGeometryInvalid || targetBufferBelowMin)
      ? 'QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK'
      : holdOrUnusable
        ? 'QUALITY_GATE_VALID_NON_ACTIONABLE_VERDICT'
        : targetGeometryInvalid || targetBufferBelowMin
          ? 'QUALITY_GATE_TARGET_GEOMETRY_BLOCK'
          : 'QUALITY_GATE_REASON_UNRESOLVED';

  return {
    type: 'quality_gate',
    symbol: String(row?.symbol || '').toUpperCase(),
    finalDecision: row?.finalDecision || null,
    decisionReason: row?.decisionReason || null,
    verdict,
    rootCause,
    isVerdictUnusable: holdOrUnusable,
    isHold: String(verdict || '').toUpperCase() === 'HOLD',
    isTargetGeometryBlock: targetGeometryInvalid || targetBufferBelowMin,
    isAiVerdictNormalizationIssue: normalizationSuspicious,
    recommendation: normalizationSuspicious
      ? 'Inspect raw AI verdict normalization before changing execution policy.'
      : targetGeometryInvalid || targetBufferBelowMin
        ? 'Keep blocked/no-trade until target is recalibrated by Stage6; do not solve this in sidecar chase/reprice.'
        : 'Keep blocked until Stage6 emits an actionable BUY/STRONG_BUY verdict or explicit waiver.',
    evidence: {
      price: p.price,
      entry: p.entry,
      target: p.target,
      stop: p.stop,
      rrAtCurrent: round(p.rrAtCurrentPrice),
      targetBufferFromCurrentPct: round(p.targetBufferFromCurrentPct),
      entryDistancePct: round(row?.entryDistancePct),
      aiVerdict: row?.aiVerdict || null,
      executionVerdict: row?.executionVerdict || null,
      executionActionableVerdict: row?.executionActionableVerdict ?? null,
      executionActionablePolicy: row?.executionActionablePolicy || policy.actionableVerdicts.join(','),
      executionActionableWaiver: row?.executionActionableWaiver ?? null,
      verdictConflict: row?.verdictConflict ?? null,
      stateVerdictConflict: row?.stateVerdictConflict ?? null,
      executionFeasibilityAtCurrent: row?.executionFeasibilityAtCurrent || null,
      executionFeasibilityAtCurrentVerdict: row?.executionFeasibilityAtCurrentVerdict || null,
      executionFeasibilityAtCurrentReason: row?.executionFeasibilityAtCurrentReason || null,
      executionFeasibilityAtCurrentReasons: arr(row?.executionFeasibilityAtCurrentReasons),
      rootCauses
    }
  };
}

function attachSidecarEvidence(items, evidence) {
  return items.map((item) => {
    const sidecar = findEvidenceRows(evidence, item.symbol);
    return {
      ...item,
      sidecarEvidence: {
        fillabilityRows: sidecar.fillabilityRows.slice(0, 3),
        mismatchRows: sidecar.mismatchRows.slice(0, 3),
        decisionRows: sidecar.decisionRows.slice(0, 3)
      }
    };
  });
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Blocker Root Cause Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Stage6: ${report.stage6.file}`);
  lines.push(`- Hash: ${report.stage6.hash || 'N/A'}`);
  lines.push(`- Rows audited: ${report.summary.rowsAudited}`);
  lines.push(`- Risk geometry rows: ${report.summary.riskGeometryRows}`);
  lines.push(`- Quality gate rows: ${report.summary.qualityGateRows}`);
  lines.push(`- Safety: report-only; broker/order mutation is out of scope.`);
  lines.push('');
  lines.push('## Risk Geometry');
  lines.push('');
  lines.push('| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.riskGeometry) {
    const flags = row.evidence.producerFlags;
    lines.push(`| ${esc(row.symbol)} | ${esc(`${row.finalDecision}/${row.decisionReason}`)} | ${esc(row.rootCause)} | ${row.isActualRecalculatedStopCandidate ? 'yes' : 'no'} | ${fmt(row.evidence.originalRrAtCurrent)} | ${fmt(row.evidence.rrWithRecalculatedStop)} | ${fmt(row.evidence.targetBufferFromCurrentPct)} | ${fmt(row.evidence.requiredStopDistancePct)} | ${esc(`adaptive=${flags.adaptiveCurrentEntryEnabled}, stopRecalc=${flags.currentEntryStopRecalcEnabled}`)} | ${esc(row.recommendation)} |`);
  }
  lines.push('');
  lines.push('## Quality Gate');
  lines.push('');
  lines.push('| Symbol | Verdict | Decision | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |');
  for (const row of report.qualityGate) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(`${row.finalDecision}/${row.decisionReason}`)} | ${esc(row.rootCause)} | ${row.isVerdictUnusable ? 'yes' : 'no'} | ${row.isHold ? 'yes' : 'no'} | ${row.isTargetGeometryBlock ? 'yes' : 'no'} | ${row.isAiVerdictNormalizationIssue ? 'yes' : 'no'} | ${fmt(row.evidence.targetBufferFromCurrentPct)} | ${esc(row.recommendation)} |`);
  }
  lines.push('');
  lines.push('## Done-When Interpretation');
  lines.push('');
  lines.push('- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.');
  lines.push('- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.');
  lines.push('- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const policy = policyFromStage6(stage6);
  const rows = uniqueRows(stage6);
  const riskGeometry = rows.filter(isRiskGeometryReason).map((row) => classifyRiskGeometry(row, policy));
  const qualityGate = rows.filter((row) => row?.decisionReason === 'blocked_quality_verdict_unusable').map((row) => classifyQualityGate(row, policy));
  const evidence = sidecarEvidence(process.env.STAGE6_BLOCKER_AUDIT_SIDECAR_STATE_DIR);
  const report = {
    generatedAt: new Date().toISOString(),
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.manifest?.hash || stage6?.stage6Hash || fileSha256(stage6Path)
    },
    policy,
    sidecarEvidenceRoot: evidence.root || null,
    summary: {
      rowsAudited: rows.length,
      riskGeometryRows: riskGeometry.length,
      qualityGateRows: qualityGate.length,
      riskGeometryRootCauses: riskGeometry.reduce((acc, row) => ({ ...acc, [row.rootCause]: (acc[row.rootCause] || 0) + 1 }), {}),
      qualityGateRootCauses: qualityGate.reduce((acc, row) => ({ ...acc, [row.rootCause]: (acc[row.rootCause] || 0) + 1 }), {})
    },
    riskGeometry: attachSidecarEvidence(riskGeometry, evidence),
    qualityGate: attachSidecarEvidence(qualityGate, evidence),
    safety: {
      reportOnly: true,
      brokerMutation: false,
      orderPolicyChange: false
    }
  };
  const outJson = process.env.STAGE6_BLOCKER_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_BLOCKER_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  ensureParent(outJson);
  ensureParent(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(`[STAGE6_BLOCKER_ROOT_CAUSE_AUDIT] risk_geometry=${riskGeometry.length} quality_gate=${qualityGate.length} json=${outJson} md=${outMd}`);
}

main();
