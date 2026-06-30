#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_JSON = process.env.STAGE36_AUDIT_GROUP_SUMMARY_OUT_JSON || 'state/stage3-6-audit-group-summary.json';
const OUT_MD = process.env.STAGE36_AUDIT_GROUP_SUMMARY_OUT_MD || 'state/stage3-6-audit-group-summary.md';
const REPORT_STATE_DIR = process.env.STAGE36_AUDIT_GROUP_SUMMARY_STATE_DIR || '';

function reportPath(filePath) {
  if (!REPORT_STATE_DIR || !filePath.startsWith('state/')) return filePath;
  return path.join(REPORT_STATE_DIR, filePath.slice('state/'.length));
}

const REPORTS = {
  stageArtifactExport: 'state/stage-artifact-export-audit.json',
  stage35Methodology: 'state/stage3-5-methodology-audit.json',
  stage35QuantQuality: 'state/stage3-5-quant-quality-audit.json',
  stage6ExecutionGate: 'state/stage6-execution-gate-audit.json',
  stage6BlockerRootCause: 'state/stage6-blocker-root-cause-audit.json',
  stage6FreshFocus: 'state/stage6-fresh-focus-audit.json',
  stage6FormulaBacklog: 'state/stage6-formula-tuning-backlog.json',
  stage6RuntimeProof: 'state/stage6-runtime-formula-contract-proof.json',
  stage6BacklogAlignment: 'state/stage6-formula-audit-backlog-alignment.json',
  stage6PolicyLane: 'state/stage6-policy-lane-audit.json',
  stage6WeakPillar: 'state/stage6-weak-pillar-runtime-audit.json',
  stage6QualityTrend: 'state/stage6-quality-trend-audit.json',
  stage36FullStage: 'state/stage3-6-full-stage-audit.json',
  stage6GoalStatus: 'state/stage6-runtime-formula-goal-status.json',
  stage6HolidaySafety: 'state/stage6-holiday-safety-audit.json',
  stage6FlagParity: 'state/stage6-flag-parity-assertion.json'
};

const GROUPS = {
  stage3_6_evidence: ['stageArtifactExport', 'stage35Methodology', 'stage35QuantQuality', 'stage36FullStage'],
  stage6_policy: ['stage6ExecutionGate', 'stage6BlockerRootCause', 'stage6PolicyLane', 'stage6WeakPillar', 'stage6QualityTrend'],
  stage6_formula: ['stage6FreshFocus', 'stage6FormulaBacklog', 'stage6RuntimeProof', 'stage6BacklogAlignment', 'stage6GoalStatus'],
  dispatch_guard: ['stage6HolidaySafety', 'stage6FlagParity']
};

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
  if (!fs.existsSync(fullPath)) return { present: false, path: filePath, overall: 'missing' };
  try {
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return {
      present: true,
      path: filePath,
      overall: String(data.overall || data.status || 'unknown'),
      generatedAt: data.generatedAt || data.generated_at || null,
      summary: data.summary || null,
      nextAction: data.nextAction || data.next_action || null
    };
  } catch (error) {
    return { present: true, path: filePath, overall: 'read_error', error: String(error?.message || error) };
  }
}

function groupOverall(items) {
  const statuses = items.map((item) => item.overall);
  if (statuses.includes('read_error')) return 'fail_read_error';
  if (statuses.includes('missing')) return 'warn_missing_report';
  if (statuses.some((status) => /^fail/.test(status))) return 'fail_report';
  if (statuses.some((status) => /^warn/.test(status))) return 'warn_report';
  if (statuses.some((status) => /^pending/.test(status))) return 'pending_runtime_evidence';
  return 'pass';
}

function esc(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function markdown(report) {
  const lines = [
    '# Stage3~6 Audit Group Summary',
    '',
    `- GeneratedAt: ${report.generatedAt}`,
    `- Overall: **${report.overall}**`,
    `- Safety: report-only; no broker, sidecar, submit, replace, reprice, state mutation, or execution-policy change.`,
    '',
    '| Group | Overall | Reports |',
    '| --- | --- | --- |'
  ];
  for (const [group, info] of Object.entries(report.groups)) {
    const reports = info.reports.map((item) => `${item.name}:${item.overall}`).join(', ');
    lines.push(`| ${esc(group)} | ${esc(info.overall)} | ${esc(reports)} |`);
  }
  lines.push('', '## Stage6 Focus', '', '| Metric | Value |', '| --- | --- |');
  for (const [key, value] of Object.entries(report.stage6Focus)) {
    lines.push(`| ${esc(key)} | ${esc(typeof value === 'object' ? JSON.stringify(value) : value)} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const reports = Object.fromEntries(Object.entries(REPORTS).map(([name, filePath]) => [name, readJsonOptional(reportPath(filePath))]));
  const groups = Object.fromEntries(Object.entries(GROUPS).map(([group, names]) => {
    const items = names.map((name) => ({ name, ...reports[name] }));
    return [group, { overall: groupOverall(items), reports: items }];
  }));
  const stage6Fresh = reports.stage6FreshFocus.summary || {};
  const stage6Backlog = reports.stage6FormulaBacklog.summary || {};
  const report = {
    generatedAt: new Date().toISOString(),
    overall: groupOverall(Object.entries(groups).map(([name, item]) => ({ name, overall: item.overall }))),
    safety: {
      reportOnly: true,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      stateMutationAllowed: false,
      executionPolicyChanged: false
    },
    groups,
    stage6Focus: {
      stage6FreshFocusOverall: reports.stage6FreshFocus.overall,
      runtimeProofOverall: reports.stage6RuntimeProof.overall,
      runtimeGoalStatus: reports.stage6GoalStatus.overall,
      blockerCategoryCounts: stage6Fresh.blockerCategoryCounts || {},
      zeroExecutableTuningLaneCounts: stage6Fresh.zeroExecutableTuningLaneCounts || {},
      producerTrackCounts: stage6Backlog.producerTrackCounts || {},
      topProducerTrack: stage6Backlog.topProducerTrack || 'none',
      topAdjustmentKnob: stage6Backlog.topAdjustmentKnob || 'none'
    }
  };
  writeJsonAtomic(OUT_JSON, report);
  const md = markdown(report);
  writeTextAtomic(OUT_MD, md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(`[STAGE3_6_AUDIT_GROUP_SUMMARY] overall=${report.overall} json=${OUT_JSON}`);
}

main();
