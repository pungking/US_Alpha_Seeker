#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { summarizeAutoTiming, sanitizeTimingEvents } from '../services/autoSchedulerTiming.mjs';

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

const existing = readExisting(outJson);
const sameRun = (!process.env.GITHUB_RUN_ID || process.env.GITHUB_RUN_ID === existing?.runId)
  && (!process.env.GITHUB_RUN_ATTEMPT || process.env.GITHUB_RUN_ATTEMPT === existing?.runAttempt);
const previous = sameRun ? existing : null;
const event = readExisting(process.env.GITHUB_EVENT_PATH || '');
const external = process.env.GITHUB_EVENT_NAME === 'repository_dispatch' ? event?.client_payload : null;
const events = sanitizeTimingEvents(previous?.timing?.events);
const marker = sanitizeTimingEvents({ [process.env.AUTO_TIMING_EVENT]: new Date().toISOString() });
for (const [name, at] of Object.entries(marker)) if (!events[name]) events[name] = at;
const phaseEvent = { started: 'AUTOMATION_STARTED', completed: 'AUTOMATION_ENDED' }[process.env.AUTOMATION_PHASE];
if (phaseEvent && !events[phaseEvent]) events[phaseEvent] = new Date().toISOString();
const timing = summarizeAutoTiming({
  events,
  scheduledFor: external?.scheduledFor,
  completionDeadline: external?.completionDeadline,
  workflowCreatedAt: process.env.AUTO_WORKFLOW_CREATED_AT || previous?.timing?.workflowCreatedAt,
  workflowStartedAt: process.env.AUTO_WORKFLOW_STARTED_AT || previous?.timing?.workflowStartedAt
});
timing.triggerSchedule = process.env.GITHUB_EVENT_NAME === 'schedule'
  && typeof event?.schedule === 'string' && /^[\d\s*,/\-]{1,64}$/.test(event.schedule) ? event.schedule : null;
timing.scheduleBasis = external ? 'EXTERNAL_CALLER_ASSERTED_NOT_CALENDAR_VERIFIED' : 'ORIGINATING_SLOT_DATE_UNAVAILABLE';
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
  telegram: previous?.telegram || null,
  stage6: previous?.stage6 || null,
  timing,
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
  `- TelegramStatus: ${payload.telegram?.status || 'not_recorded'}`,
  `- TelegramSendAttempted: ${payload.telegram?.sendAttempted ?? false}`,
  `- TelegramDeliverySucceeded: ${payload.telegram?.deliverySucceeded ?? false}`,
  `- Stage6File: ${payload.stage6?.file || 'not_recorded'}`,
  `- Stage6Hash: ${payload.stage6?.hash || 'not_recorded'}`,
  `- TimingIntegrity: ${timing.integrityStatus}`,
  `- DeadlineStatus: ${timing.deadlineStatus}`,
  '',
  'Safety: report-only status evidence; brokerMutationAllowed=false; sidecarMutationAllowed=false.'
].join('\n') + '\n');

console.log(`[AUTO_SCHEDULER_STATUS] phase=${payload.automation.phase} automation=${payload.automation.outcome}/${payload.automation.conclusion} exitCode=${payload.automation.exitCode} dailyGate=${payload.dailyGate.shouldRun}/${payload.dailyGate.reason}`);
