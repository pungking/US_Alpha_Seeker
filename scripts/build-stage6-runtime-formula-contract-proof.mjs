#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = process.env.STAGE6_RUNTIME_FORMULA_PROOF_OUT_JSON || 'state/stage6-runtime-formula-contract-proof.json';
const OUT_MD = process.env.STAGE6_RUNTIME_FORMULA_PROOF_OUT_MD || 'state/stage6-runtime-formula-contract-proof.md';
const BACKLOG_SCRIPT = 'scripts/build-stage6-formula-tuning-backlog.mjs';
const REQUIRED_CONTRACT_VERSION = 'zero_executable_formula_v4';
const REQUIRED_LANES = [
  'TARGET_RECALIBRATION',
  'STOP_TARGET_RISK_GEOMETRY_RECALCULATION',
  'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION',
  'BREAKOUT_PROOF_CONFIRMED_GENERATION',
  'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION',
  'NO_ZERO_EXECUTABLE_TUNING_ACTION'
];
const REQUIRED_PROMOTION_SAFETY_RULES = [
  'breakout_review_ready_never_promotes',
  'breakout_proof_confirmed_requires_promotion_flag',
  'target_already_reached_requires_recalibration_or_no_trade',
  'structure_reject_never_promotes_without_confirmed_structure',
  'sidecar_reprice_never_solves_stage6_target_geometry'
];

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
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, fullPath);
}

function writeJsonAtomic(filePath, payload) {
  writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE6_RUNTIME_FORMULA_PROOF_STAGE6_PATH) return resolveRepo(process.env.STAGE6_RUNTIME_FORMULA_PROOF_STAGE6_PATH);
  if (process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH) return resolveRepo(process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH);
  const dir = resolveRepo(process.env.STAGE6_RUNTIME_FORMULA_PROOF_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => {
        const full = path.join(dir, name);
        return { name, full, mtime: fs.statSync(full).mtimeMs, key: stage6Timestamp(name) };
      })
      .sort((a, b) => b.key.localeCompare(a.key) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  return files[0]?.full || null;
}

function gitOutput(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function currentHeadSha() {
  return normalizeText(process.env.STAGE6_RUNTIME_FORMULA_PROOF_EXPECTED_SOURCE_SHA) || gitOutput(['rev-parse', 'HEAD']);
}

function sourceAudit(stage6) {
  const manifest = stage6?.manifest || {};
  const buildSource = manifest?.buildSource || stage6?.buildSource || {};
  return {
    repo: normalizeText(manifest.sourceRepo) || normalizeText(buildSource.repository),
    workflow: normalizeText(manifest.sourceWorkflow) || normalizeText(buildSource.workflow),
    runId: normalizeText(manifest.sourceRunId) || normalizeText(buildSource.runId),
    sha: normalizeText(manifest.sourceSha) || normalizeText(buildSource.sha),
    ref: normalizeText(manifest.sourceRef) || normalizeText(buildSource.ref),
    eventName: normalizeText(manifest.sourceEventName) || normalizeText(buildSource.eventName)
  };
}

function commitCoversExpected(sourceSha, expectedSha) {
  if (!sourceSha || !expectedSha) return { status: 'unknown', covers: false, reason: 'source_or_expected_sha_missing' };
  if (sourceSha === expectedSha || sourceSha.startsWith(expectedSha) || expectedSha.startsWith(sourceSha)) {
    return { status: 'pass_exact_or_prefix', covers: true, reason: 'source_matches_expected' };
  }
  const result = spawnSync('git', ['merge-base', '--is-ancestor', expectedSha, sourceSha], { cwd: ROOT, encoding: 'utf8' });
  if (result.status === 0) return { status: 'pass_ancestor', covers: true, reason: 'expected_head_is_ancestor_of_source' };
  return { status: 'pending_fresh_source', covers: false, reason: 'source_does_not_cover_expected_head' };
}

function formulaContract(stage6) {
  return stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract || stage6?.decisionGate?.zeroExecutableFormulaContract || null;
}

function validateContract(contract) {
  const issues = [];
  if (!contract || typeof contract !== 'object') {
    return {
      ok: false,
      version: null,
      tunablePolicyFieldsPresent: false,
      promotionSafetyRulesPresent: false,
      issues: ['zero_executable_formula_contract_missing']
    };
  }
  if (contract.version !== REQUIRED_CONTRACT_VERSION) issues.push(`contract_version_mismatch:${contract.version || 'missing'}`);
  const tunablePolicyFields = contract.tunablePolicyFields || {};
  for (const lane of REQUIRED_LANES) {
    if (!Array.isArray(tunablePolicyFields[lane])) issues.push(`tunable_policy_fields_missing:${lane}`);
  }
  const promotionSafetyRules = new Set(Array.isArray(contract.promotionSafetyRules) ? contract.promotionSafetyRules : []);
  for (const rule of REQUIRED_PROMOTION_SAFETY_RULES) {
    if (!promotionSafetyRules.has(rule)) issues.push(`promotion_safety_rule_missing:${rule}`);
  }
  return {
    ok: issues.length === 0,
    version: contract.version || null,
    tunablePolicyFieldsPresent: REQUIRED_LANES.every((lane) => Array.isArray(tunablePolicyFields[lane])),
    promotionSafetyRulesPresent: REQUIRED_PROMOTION_SAFETY_RULES.every((rule) => promotionSafetyRules.has(rule)),
    laneCount: Object.keys(tunablePolicyFields).length,
    promotionSafetyRuleCount: promotionSafetyRules.size,
    issues
  };
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function uniqueRows(stage6) {
  const contract = stage6?.execution_contract || {};
  const sourceGroups = [
    ...(Array.isArray(contract.executablePicks) ? contract.executablePicks.map((row) => [row, 50]) : []),
    ...(Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates.map((row) => [row, 40]) : []),
    ...(Array.isArray(contract.watchlistTop) ? contract.watchlistTop.map((row) => [row, 30]) : []),
    ...(Array.isArray(contract.modelTop6) ? contract.modelTop6.map((row) => [row, 20]) : []),
    ...(Array.isArray(stage6?.candidates) ? stage6.candidates.map((row) => [row, 10]) : [])
  ];
  const bySymbol = new Map();
  for (const [row, priority] of sourceGroups) {
    const symbol = normalizeSymbol(row);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || priority > existing.priority) bySymbol.set(symbol, { row, priority });
  }
  return [...bySymbol.values()].map(({ row }) => row);
}

function executableCount(stage6, rows) {
  const contractRows = stage6?.execution_contract?.executablePicks;
  if (Array.isArray(contractRows)) return contractRows.length;
  return rows.filter((row) => String(row?.finalDecision || row?.decision || '').toUpperCase() === 'EXECUTABLE_NOW').length;
}

function runBacklog(stage6Path, expectedSha) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage6-runtime-formula-proof-'));
  const outJson = path.join(tmp, 'backlog.json');
  const outMd = path.join(tmp, 'backlog.md');
  const result = spawnSync(process.execPath, [resolveRepo(BACKLOG_SCRIPT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH: stage6Path,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON: outJson,
      STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD: outMd,
      STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA: expectedSha || ''
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    return {
      ok: false,
      error: result.stderr || result.stdout || `exit_${result.status}`,
      report: null
    };
  }
  return {
    ok: true,
    error: null,
    report: readJson(outJson)
  };
}

function statusFor({ stage6Path, sourceFreshness, contractCheck, zeroExecutable, backlogResult }) {
  if (!stage6Path) return 'warn_stage6_artifact_missing';
  if (!sourceFreshness.covers) return 'pending_fresh_stage6_after_expected_head';
  if (!contractCheck.ok) return 'fail_formula_contract_missing_or_incomplete';
  if (!zeroExecutable) return 'pass_formula_contract_present_executable_candidates_exist';
  if (!backlogResult.ok) return 'fail_backlog_generation_failed';
  const report = backlogResult.report || {};
  const producerReviewRows = Number(report.summary?.producerReviewRows || 0);
  const producerFieldRecommendationCount = Number(report.summary?.producerFieldRecommendationCount || 0);
  const noFormulaAction = report.overall === 'pass_no_formula_tuning_action_required';
  if (producerReviewRows > 0 && producerFieldRecommendationCount > 0) return 'pass_zero_executable_backlog_names_producer_fields';
  if (noFormulaAction) return 'pass_zero_executable_no_formula_tuning_action_required';
  return 'warn_zero_executable_backlog_not_actionable_yet';
}

function markdown(report) {
  const fieldRows = (report.backlog?.producerFieldRecommendations || [])
    .map((row) => `| ${row.track} | ${row.knob} | ${row.field} | ${row.action} | ${row.guardrail} |`)
    .join('\n') || '| none | none | none | none | none |';
  return `# Stage6 Runtime Formula Contract Proof\n\n` +
    `- GeneratedAt: ${report.generatedAt}\n` +
    `- Overall: **${report.overall}**\n` +
    `- Stage6: ${report.stage6.file || 'missing'}\n` +
    `- Expected head: ${report.expectedSourceSha || 'missing'}\n` +
    `- Source SHA: ${report.stage6.source.sha || 'missing'}\n` +
    `- Source freshness: ${report.sourceFreshness.status}\n` +
    `- Zero executable: ${report.stage6.zeroExecutable}\n` +
    `- Safety: report-only; no broker, sidecar, submit, replace, or reprice mutation.\n\n` +
    `## Manifest Contract\n\n` +
    `| Check | Value |\n| --- | --- |\n` +
    `| version | ${report.contract.version || 'missing'} |\n` +
    `| tunablePolicyFieldsPresent | ${report.contract.tunablePolicyFieldsPresent} |\n` +
    `| promotionSafetyRulesPresent | ${report.contract.promotionSafetyRulesPresent} |\n` +
    `| issues | ${(report.contract.issues || []).join(', ') || 'none'} |\n\n` +
    `## Backlog Proof\n\n` +
    `| Metric | Value |\n| --- | --- |\n` +
    `| backlogOverall | ${report.backlog.overall || 'not_run'} |\n` +
    `| producerReviewRows | ${report.backlog.producerReviewRows ?? 'N/A'} |\n` +
    `| producerFieldRecommendationCount | ${report.backlog.producerFieldRecommendationCount ?? 'N/A'} |\n` +
    `| topProducerTrack | ${report.backlog.topProducerTrack || 'N/A'} |\n` +
    `| topAdjustmentKnob | ${report.backlog.topAdjustmentKnob || 'N/A'} |\n` +
    `| nextAction | ${report.nextAction} |\n\n` +
    `## Producer Field Recommendations\n\n` +
    `| Track | Knob | Field | Action | Guardrail |\n| --- | --- | --- | --- | --- |\n${fieldRows}\n\n` +
    `## Split Tuning Lanes\n\n` +
    `- target recalibration: ${report.splitTuning.targetRecalibration}\n` +
    `- risk geometry: ${report.splitTuning.riskGeometry}\n` +
    `- breakout proofConfirmed: ${report.splitTuning.breakoutProofConfirmed}\n`;
}

function main() {
  const generatedAt = new Date().toISOString();
  const expectedSha = currentHeadSha();
  const stage6Path = latestStage6Path();
  if (!stage6Path || !fs.existsSync(stage6Path)) {
    const report = {
      generatedAt,
      overall: 'warn_stage6_artifact_missing',
      expectedSourceSha: expectedSha,
      stage6: { file: null, path: stage6Path, hash: null, source: {}, rows: 0, executableCount: 0, zeroExecutable: null },
      sourceFreshness: { status: 'unknown', covers: false, reason: 'stage6_artifact_missing' },
      contract: validateContract(null),
      backlog: { overall: null, producerReviewRows: null, producerFieldRecommendationCount: null, producerFieldRecommendations: [] },
      splitTuning: { targetRecalibration: 'pending_stage6_artifact', riskGeometry: 'pending_stage6_artifact', breakoutProofConfirmed: 'pending_stage6_artifact' },
      nextAction: 'wait_for_or_generate_fresh_autoscheduler_stage6'
    };
    writeJsonAtomic(OUT_JSON, report);
    writeTextAtomic(OUT_MD, markdown(report));
    console.log(`[STAGE6_RUNTIME_FORMULA_PROOF] overall=${report.overall} json=${OUT_JSON}`);
    return;
  }

  const stage6 = readJson(stage6Path);
  const rows = uniqueRows(stage6);
  const source = sourceAudit(stage6);
  const sourceFreshness = commitCoversExpected(source.sha, expectedSha);
  const contractCheck = validateContract(formulaContract(stage6));
  const execCount = executableCount(stage6, rows);
  const zeroExecutable = execCount === 0;
  const backlogResult = runBacklog(stage6Path, expectedSha);
  const backlogReport = backlogResult.report || {};
  const fieldRecommendations = (backlogReport.tuningRecommendations || []).flatMap((recommendation) =>
    (recommendation.producerFieldRecommendations || []).map((fieldRecommendation) => ({
      track: recommendation.producerTrack,
      knob: recommendation.adjustmentKnob,
      ...fieldRecommendation
    }))
  );
  const overall = statusFor({ stage6Path, sourceFreshness, contractCheck, zeroExecutable, backlogResult });
  const nextAction = !sourceFreshness.covers
    ? 'wait_for_fresh_autoscheduler_stage6_after_current_head'
    : !contractCheck.ok
      ? 'fix_stage6_manifest_formula_contract_propagation'
      : zeroExecutable && Number(backlogReport.summary?.producerReviewRows || 0) > 0
        ? 'split_tuning_target_recalibration_risk_geometry_breakout_proof'
        : zeroExecutable
          ? 'inspect_zero_executable_non_formula_blockers'
          : 'monitor_runtime_contract_on_next_zero_executable';
  const report = {
    generatedAt,
    overall,
    expectedSourceSha: expectedSha,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || sha256(stage6Path),
      source,
      rows: rows.length,
      executableCount: execCount,
      zeroExecutable
    },
    sourceFreshness,
    contract: contractCheck,
    backlog: {
      ok: backlogResult.ok,
      error: backlogResult.error,
      overall: backlogReport.overall || null,
      producerReviewRows: backlogReport.summary?.producerReviewRows ?? null,
      producerFieldRecommendationCount: backlogReport.summary?.producerFieldRecommendationCount ?? null,
      topProducerTrack: backlogReport.summary?.topProducerTrack || null,
      topAdjustmentKnob: backlogReport.summary?.topAdjustmentKnob || null,
      guardrails: backlogReport.guardrails || null,
      producerFieldRecommendations: fieldRecommendations
    },
    splitTuning: {
      targetRecalibration: fieldRecommendations.some((row) => row.track === 'target_recalibration') ? 'ready_from_backlog' : 'not_ready_or_not_applicable',
      riskGeometry: fieldRecommendations.some((row) => row.track === 'risk_geometry_recalculation') ? 'ready_from_backlog' : 'not_ready_or_not_applicable',
      breakoutProofConfirmed: fieldRecommendations.some((row) => row.track === 'breakout_proof_confirmed_generation') ? 'ready_from_backlog' : 'not_ready_or_not_applicable'
    },
    nextAction,
    safety: {
      reportOnly: true,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      submitReplaceRepriceAllowed: false
    }
  };
  writeJsonAtomic(OUT_JSON, report);
  writeTextAtomic(OUT_MD, markdown(report));
  console.log(`[STAGE6_RUNTIME_FORMULA_PROOF] overall=${overall} sourceFreshness=${sourceFreshness.status} zeroExecutable=${zeroExecutable} producerFields=${fieldRecommendations.length} json=${OUT_JSON}`);
}

main();
