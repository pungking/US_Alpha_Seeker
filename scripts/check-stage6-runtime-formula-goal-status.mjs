#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROOF_PATH = process.env.STAGE6_RUNTIME_GOAL_STATUS_PROOF_PATH || 'state/stage6-runtime-formula-contract-proof.json';
const BACKLOG_PATH = process.env.STAGE6_RUNTIME_GOAL_STATUS_BACKLOG_PATH || 'state/stage6-formula-tuning-backlog.json';
const FULL_STAGE_AUDIT_PATH = process.env.STAGE6_RUNTIME_GOAL_STATUS_FULL_STAGE_AUDIT_PATH || 'state/stage3-6-full-stage-audit.json';
const OUT_JSON = process.env.STAGE6_RUNTIME_GOAL_STATUS_OUT_JSON || 'state/stage6-runtime-formula-goal-status.json';
const OUT_MD = process.env.STAGE6_RUNTIME_GOAL_STATUS_OUT_MD || 'state/stage6-runtime-formula-goal-status.md';

const REQUIRED_SPLIT_TRACKS = new Set([
  'target_recalibration',
  'structure_proof_generation',
  'risk_geometry_recalculation',
  'breakout_proof_confirmed_generation'
]);

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

function readJsonOptional(filePath) {
  const fullPath = resolveRepo(filePath);
  if (!fs.existsSync(fullPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    return { readError: String(error?.message || error) };
  }
}

function statusRank(status) {
  if (status === 'fail') return 3;
  if (status === 'pending') return 2;
  if (status === 'warn') return 1;
  return 0;
}

function overallFrom(requirements) {
  const statuses = requirements.map((item) => item.status);
  if (statuses.includes('fail')) return 'fail_stage6_runtime_formula_goal';
  if (statuses.includes('pending')) return 'pending_fresh_autoscheduler_stage6';
  if (statuses.includes('warn')) return 'warn_stage6_runtime_formula_goal';
  return 'pass_stage6_runtime_formula_goal';
}

function requirement(id, status, evidence, nextAction = null) {
  return { id, status, evidence, nextAction };
}

function numberValue(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function validTargetProofSummary(row) {
  const summary = String(row?.targetRecalibrationProofSummary || '').trim();
  return Boolean(
    summary &&
    summary !== 'not_target_recalibration' &&
    summary.includes('executionFloor=') &&
    summary.includes('proofGaps=')
  );
}

function deriveRequirements(proof, backlog, fullStageAudit) {
  const requirements = [];
  const proofMissing = !proof || proof.readError;
  const backlogMissing = !backlog || backlog.readError;
  const fullStageAuditMissing = !fullStageAudit || fullStageAudit.readError;
  const freshCovers = proof?.sourceFreshness?.covers === true;
  const zeroExecutable = proof?.stage6?.zeroExecutable === true;
  const contract = proof?.contract || {};
  const fullStageFormulaFocus = fullStageAudit?.formulaTuningFocus || {};
  const fullStageDataFreshnessPolicy = fullStageAudit?.dataFreshnessPolicy || {};
  const dataFreshnessPolicyStatus = String(fullStageDataFreshnessPolicy.status || '').trim();
  const dataFreshnessPolicyReady = Boolean(
    dataFreshnessPolicyStatus &&
    fullStageDataFreshnessPolicy.thresholds &&
    fullStageDataFreshnessPolicy.nextAction &&
    fullStageDataFreshnessPolicy.reportOnly === true
  );
  const dataFreshnessPolicyPass = dataFreshnessPolicyStatus === 'pass_data_freshness_policy';
  const fullStageProducerReviewRows = numberValue(fullStageFormulaFocus.producerReviewRows);
  const fullStageRowEvidenceSamples = arrayValue(fullStageFormulaFocus.rowEvidenceSamples);
  const targetRecalibrationSamples = fullStageRowEvidenceSamples.filter(
    (row) => row?.producerTrack === 'target_recalibration'
  );
  const targetProofSummaryReadyCount = targetRecalibrationSamples.filter(validTargetProofSummary).length;
  const targetProofSummaryReady = targetRecalibrationSamples.length === targetProofSummaryReadyCount;
  const producerReviewRowsPresent = fullStageProducerReviewRows > 0;
  const producerTuningFreshDataStatus = fullStageAuditMissing
    ? 'pending'
    : !producerReviewRowsPresent
      ? 'not_applicable'
      : dataFreshnessPolicyPass && fullStageFormulaFocus.tuningActionAllowed === true
        ? 'pass'
        : 'warn';
  const producerFieldRecommendations = arrayValue(backlog?.producerFieldRecommendations);
  const tuningRecommendations = arrayValue(backlog?.tuningRecommendations);
  const producerFieldRecommendationCount = Math.max(
    producerFieldRecommendations.length,
    numberValue(backlog?.summary?.producerFieldRecommendationCount)
  );
  const recommendationTracks = unique([
    ...producerFieldRecommendations.map((item) => item.producerTrack),
    ...tuningRecommendations.map((item) => item.producerTrack)
  ]);
  const splitTrackIssues = recommendationTracks.filter((track) => !REQUIRED_SPLIT_TRACKS.has(track));

  requirements.push(requirement(
    'fresh_autoscheduler_stage6_after_current_head',
    proofMissing ? 'pending' : freshCovers ? 'pass' : 'pending',
    {
      proofPath: PROOF_PATH,
      proofOverall: proof?.overall || null,
      sourceFreshness: proof?.sourceFreshness || null,
      stage6File: proof?.stage6?.file || null,
      sourceSha: proof?.stage6?.source?.sha || null
    },
    freshCovers ? null : 'wait_for_or_generate_fresh_autoscheduler_stage6_after_current_head'
  ));

  requirements.push(requirement(
    'manifest_has_tunable_policy_fields',
    proofMissing ? 'pending' : contract.tunablePolicyFieldsPresent === true ? 'pass' : freshCovers ? 'fail' : 'pending',
    {
      contractVersion: contract.version || null,
      tunablePolicyFieldsPresent: contract.tunablePolicyFieldsPresent ?? null,
      contractIssues: contract.issues || []
    },
    contract.tunablePolicyFieldsPresent === true
      ? null
      : freshCovers
        ? 'fix_stage6_manifest_zero_executable_formula_contract_tunable_policy_fields'
        : 'wait_for_or_generate_fresh_autoscheduler_stage6_after_current_head'
  ));

  requirements.push(requirement(
    'manifest_has_promotion_safety_rules',
    proofMissing ? 'pending' : contract.promotionSafetyRulesPresent === true ? 'pass' : freshCovers ? 'fail' : 'pending',
    {
      contractVersion: contract.version || null,
      promotionSafetyRulesPresent: contract.promotionSafetyRulesPresent ?? null,
      contractIssues: contract.issues || []
    },
    contract.promotionSafetyRulesPresent === true
      ? null
      : freshCovers
        ? 'fix_stage6_manifest_zero_executable_formula_contract_promotion_safety_rules'
        : 'wait_for_or_generate_fresh_autoscheduler_stage6_after_current_head'
  ));

  requirements.push(requirement(
    'zero_executable_backlog_names_producer_fields',
    proofMissing || backlogMissing
      ? 'pending'
      : zeroExecutable
        ? producerFieldRecommendationCount > 0 ? 'pass' : 'fail'
        : 'not_applicable',
    {
      zeroExecutable,
      backlogPath: BACKLOG_PATH,
      backlogOverall: backlog?.overall || null,
      producerFieldRecommendationCount,
      topProducerTrack: backlog?.summary?.topProducerTrack || null,
      topAdjustmentKnob: backlog?.summary?.topAdjustmentKnob || null
    },
    zeroExecutable && producerFieldRecommendationCount === 0
      ? 'add_direct_producer_field_recommendations_to_stage6_formula_backlog'
      : null
  ));

  requirements.push(requirement(
    'formula_tuning_tracks_are_split',
    proofMissing || backlogMissing
      ? 'pending'
      : zeroExecutable
        ? splitTrackIssues.length === 0 && recommendationTracks.length > 0 ? 'pass' : 'fail'
        : 'not_applicable',
    {
      zeroExecutable,
      recommendationTracks,
      allowedTracks: [...REQUIRED_SPLIT_TRACKS].sort(),
      splitTrackIssues
    },
    splitTrackIssues.length > 0 || (zeroExecutable && recommendationTracks.length === 0)
      ? 'split_stage6_tuning_into_target_recalibration_risk_geometry_breakout_proof_tracks'
      : null
  ));

  requirements.push(requirement(
    'full_stage_audit_exposes_formula_tuning_row_evidence',
    fullStageAuditMissing
      ? 'pending'
      : fullStageProducerReviewRows > 0
        ? fullStageRowEvidenceSamples.length > 0 ? 'pass' : 'fail'
        : 'not_applicable',
    {
      fullStageAuditPath: FULL_STAGE_AUDIT_PATH,
      fullStageAuditOverall: fullStageAudit?.overall || null,
      producerReviewRows: fullStageProducerReviewRows,
      rowEvidenceSampleCount: fullStageRowEvidenceSamples.length,
      topProducerTrack: fullStageFormulaFocus.topProducerTrack || null,
      topAdjustmentKnob: fullStageFormulaFocus.topAdjustmentKnob || null,
      tuningActionAllowed: fullStageFormulaFocus.tuningActionAllowed ?? null,
      sampleOnly: fullStageRowEvidenceSamples.every((row) => row?.sampleOnly === true),
      rowEvidenceSamples: fullStageRowEvidenceSamples.slice(0, 6)
    },
    fullStageAuditMissing
      ? 'run_stage3_6_full_stage_audit_before_runtime_goal_status'
      : fullStageProducerReviewRows > 0 && fullStageRowEvidenceSamples.length === 0
        ? 'preserve_formula_tuning_row_evidence_samples_in_full_stage_audit'
        : null
  ));

  requirements.push(requirement(
    'target_recalibration_rows_expose_proof_summary',
    fullStageAuditMissing
      ? 'pending'
      : targetRecalibrationSamples.length === 0
        ? 'not_applicable'
        : targetProofSummaryReady ? 'pass' : 'fail',
    {
      fullStageAuditPath: FULL_STAGE_AUDIT_PATH,
      fullStageAuditOverall: fullStageAudit?.overall || null,
      targetRecalibrationSampleCount: targetRecalibrationSamples.length,
      targetProofSummaryReadyCount,
      sampleOnly: targetRecalibrationSamples.every((row) => row?.sampleOnly === true),
      samples: targetRecalibrationSamples.slice(0, 6).map((row) => ({
        symbol: row?.symbol || null,
        producerTrack: row?.producerTrack || null,
        targetRecalibrationProofSummary: row?.targetRecalibrationProofSummary || null,
        targetRecalibrationProofGaps: row?.targetRecalibrationProofGaps || []
      }))
    },
    fullStageAuditMissing
      ? 'run_stage3_6_full_stage_audit_before_runtime_goal_status'
      : targetRecalibrationSamples.length > 0 && !targetProofSummaryReady
        ? 'preserve_target_recalibration_proof_summary_in_full_stage_audit'
        : null
  ));

  requirements.push(requirement(
    'full_stage_audit_exposes_data_freshness_policy',
    fullStageAuditMissing
      ? 'pending'
      : dataFreshnessPolicyReady ? 'pass' : 'fail',
    {
      fullStageAuditPath: FULL_STAGE_AUDIT_PATH,
      fullStageAuditOverall: fullStageAudit?.overall || null,
      dataFreshnessPolicyStatus: dataFreshnessPolicyStatus || null,
      thresholds: fullStageDataFreshnessPolicy.thresholds || null,
      findingCount: fullStageDataFreshnessPolicy.findingCount ?? null,
      staleStages: fullStageDataFreshnessPolicy.staleStages || [],
      staleFields: fullStageDataFreshnessPolicy.staleFields || [],
      worstFreshnessAgeDays: fullStageDataFreshnessPolicy.worstFreshnessAgeDays ?? null,
      worstPriceHistoryAgeDays: fullStageDataFreshnessPolicy.worstPriceHistoryAgeDays ?? null,
      nextAction: fullStageDataFreshnessPolicy.nextAction || null,
      reportOnly: fullStageDataFreshnessPolicy.reportOnly ?? null
    },
    fullStageAuditMissing
      ? 'run_stage3_6_full_stage_audit_before_runtime_goal_status'
      : dataFreshnessPolicyReady
        ? null
        : 'preserve_data_freshness_policy_summary_in_full_stage_audit'
  ));

  requirements.push(requirement(
    'stage6_producer_tuning_requires_fresh_stage_data',
    producerTuningFreshDataStatus,
    {
      fullStageAuditPath: FULL_STAGE_AUDIT_PATH,
      producerReviewRows: fullStageProducerReviewRows,
      tuningActionAllowed: fullStageFormulaFocus.tuningActionAllowed ?? null,
      dataFreshnessPolicyStatus: dataFreshnessPolicyStatus || null,
      formulaTuningNextAction: fullStageFormulaFocus.nextAction || null
    },
    fullStageAuditMissing
      ? 'run_stage3_6_full_stage_audit_before_runtime_goal_status'
      : !producerReviewRowsPresent
        ? null
        : dataFreshnessPolicyPass && fullStageFormulaFocus.tuningActionAllowed !== true
          ? 'verify_formula_tuning_focus_allows_fresh_data_producer_tuning'
          : dataFreshnessPolicyPass
            ? null
            : 'refresh_same_run_stage_artifacts_before_stage6_policy_tuning'
  ));

  requirements.push(requirement(
    'broker_and_sidecar_mutation_remain_forbidden',
    backlogMissing
      ? 'pending'
      : backlog?.summary?.brokerMutationAllowed === false && backlog?.summary?.sidecarMutationAllowed === false
        ? 'pass'
        : 'fail',
    {
      backlogPath: BACKLOG_PATH,
      brokerMutationAllowed: backlog?.summary?.brokerMutationAllowed ?? null,
      sidecarMutationAllowed: backlog?.summary?.sidecarMutationAllowed ?? null
    },
    backlog?.summary?.brokerMutationAllowed === false && backlog?.summary?.sidecarMutationAllowed === false
      ? null
      : backlogMissing
        ? 'wait_for_formula_tuning_backlog_artifact'
        : 'restore_report_only_formula_tuning_backlog_safety_flags'
  ));

  return requirements.sort((a, b) => statusRank(b.status) - statusRank(a.status));
}

function markdown(report) {
  const lines = [];
  lines.push('# Stage6 Runtime Formula Goal Status');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Next Action: ${report.nextAction}`);
  lines.push('');
  lines.push('## Requirement Status');
  lines.push('');
  lines.push('| Requirement | Status | Next Action |');
  lines.push('|---|---:|---|');
  for (const item of report.requirements) {
    lines.push(`| ${item.id} | ${item.status} | ${item.nextAction || 'none'} |`);
  }
  lines.push('');
  lines.push('## Runtime Evidence');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.evidence, null, 2));
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

const proof = readJsonOptional(PROOF_PATH);
const backlog = readJsonOptional(BACKLOG_PATH);
const fullStageAudit = readJsonOptional(FULL_STAGE_AUDIT_PATH);
const requirements = deriveRequirements(proof, backlog, fullStageAudit);
const overall = overallFrom(requirements);
const nextAction = requirements.find((item) => item.status === 'fail' || item.status === 'pending' || item.status === 'warn')?.nextAction || 'proceed_to_split_stage6_producer_formula_tuning';
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'stage6_runtime_formula_goal_status_report_only',
  overall,
  nextAction,
  safety: {
    brokerMutationAllowed: false,
    sidecarMutationAllowed: false,
    stateMutationAllowed: false
  },
  inputs: {
    proofPath: PROOF_PATH,
    backlogPath: BACKLOG_PATH,
    fullStageAuditPath: FULL_STAGE_AUDIT_PATH,
    proofAvailable: Boolean(proof && !proof.readError),
    backlogAvailable: Boolean(backlog && !backlog.readError),
    fullStageAuditAvailable: Boolean(fullStageAudit && !fullStageAudit.readError)
  },
  evidence: {
    proofOverall: proof?.overall || null,
    backlogOverall: backlog?.overall || null,
    sourceFreshness: proof?.sourceFreshness || null,
    stage6: proof?.stage6 || null,
    contract: proof?.contract || null,
    backlogSummary: backlog?.summary || null,
    fullStageFormulaTuningFocus: fullStageAudit?.formulaTuningFocus || null,
    fullStageDataFreshnessPolicy: fullStageAudit?.dataFreshnessPolicy || null
  },
  requirements
};

writeJsonAtomic(OUT_JSON, report);
writeTextAtomic(OUT_MD, markdown(report));
console.log(`[STAGE6_RUNTIME_FORMULA_GOAL_STATUS] overall=${overall} next=${nextAction} json=${OUT_JSON}`);
