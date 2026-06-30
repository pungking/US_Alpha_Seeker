#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const outJson = process.env.AUTO_SCHEDULER_RUN_STATUS_JSON || 'state/auto-scheduler-run-status.json';
const outMd = process.env.AUTO_SCHEDULER_RUN_STATUS_MD || 'state/auto-scheduler-run-status.md';

function readExisting(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

const previous = readExisting(outJson);
const exitCode = process.env.AUTOMATION_EXIT_CODE ?? previous?.automation?.exitCode ?? null;
const outcome = process.env.AUTOMATION_OUTCOME || previous?.automation?.outcome || 'unknown';
const conclusion = process.env.AUTOMATION_CONCLUSION || previous?.automation?.conclusion || 'unknown';
const completedSuccessfully = (outcome === 'success' && conclusion === 'success') || exitCode === '0';

const payload = {
  schemaVersion: 'auto_scheduler_run_status.v1',
  generatedAt: new Date().toISOString(),
  workflow: process.env.GITHUB_WORKFLOW || previous?.workflow || null,
  runId: process.env.GITHUB_RUN_ID || previous?.runId || null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT || previous?.runAttempt || null,
  eventName: process.env.GITHUB_EVENT_NAME || previous?.eventName || null,
  ref: process.env.GITHUB_REF || previous?.ref || null,
  sha: process.env.GITHUB_SHA || previous?.sha || null,
  dailyGate: {
    shouldRun: process.env.DAILY_GATE_SHOULD_RUN || previous?.dailyGate?.shouldRun || null,
    reason: process.env.DAILY_GATE_REASON || previous?.dailyGate?.reason || null,
    marketDate: process.env.DAILY_GATE_MARKET_DATE || previous?.dailyGate?.marketDate || null
  },
  automation: {
    phase: process.env.AUTOMATION_PHASE || previous?.automation?.phase || 'unknown',
    outcome,
    conclusion,
    exitCode,
    completedSuccessfully
  },
  safety: {
    brokerMutationAllowed: false,
    sidecarMutationAllowed: false,
    executionPolicyChanged: false
  }
};

writeAtomic(outJson, `${JSON.stringify(payload, null, 2)}\n`);
writeAtomic(outMd, [
  '# Auto-Scheduler Run Status',
  '',
  `- GeneratedAt: ${payload.generatedAt}`,
  `- RunId: ${payload.runId}`,
  `- Sha: ${payload.sha}`,
  `- DailyGate: ${payload.dailyGate.shouldRun} / ${payload.dailyGate.reason}`,
  `- AutomationPhase: ${payload.automation.phase}`,
  `- AutomationOutcome: ${payload.automation.outcome}`,
  `- AutomationConclusion: ${payload.automation.conclusion}`,
  `- AutomationExitCode: ${payload.automation.exitCode}`,
  `- CompletedSuccessfully: ${payload.automation.completedSuccessfully}`,
  '',
  'Safety: report-only status evidence; brokerMutationAllowed=false; sidecarMutationAllowed=false.'
].join('\n') + '\n');

console.log(`[AUTO_SCHEDULER_STATUS] phase=${payload.automation.phase} automation=${payload.automation.outcome}/${payload.automation.conclusion} exitCode=${payload.automation.exitCode} dailyGate=${payload.dailyGate.shouldRun}/${payload.dailyGate.reason}`);
