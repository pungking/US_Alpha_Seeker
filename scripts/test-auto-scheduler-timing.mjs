import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { recordAutoTiming, sanitizeTimingEvents, summarizeAutoTiming } from '../services/autoSchedulerTiming.mjs';

const at = n => new Date(Date.UTC(2026, 8, 28, 12, 0, n)).toISOString();
globalThis.window = { __AUTO_TIMING: {} };
recordAutoTiming('STAGE_0_ENTERED', at(1));
recordAutoTiming('STAGE_0_ENTERED', at(9));
recordAutoTiming('token', 'private-value');
assert.deepEqual(window.__AUTO_TIMING, { STAGE_0_ENTERED: at(1) });
assert.deepEqual(sanitizeTimingEvents({ STAGE_0_ENTERED: 'bad', rawResponse: 'private' }), {});
delete globalThis.window;
assert.doesNotThrow(() => recordAutoTiming('STAGE_0_ENTERED'));

const input = {
  scheduledFor: at(0), workflowCreatedAt: at(10), workflowStartedAt: at(13), completionDeadline: at(60),
  events: {
    STAGE_0_ENTERED: at(20), STAGE_0_CALLBACK: at(22), STAGE3_PERSISTED: at(25),
    HARVESTER_DISPATCHED: at(26), STAGE4_READY_OBSERVED: at(40),
    STAGE6_PERSISTED: at(50), TELEGRAM_DELIVERED: at(55), SIDECAR_DISPATCH_ACCEPTED: at(58)
  }
};
const result = summarizeAutoTiming(input);
assert.equal(result.durationsSeconds.scheduledToCreated, 10);
assert.equal(result.durationsSeconds.createdToStarted, 3);
assert.equal(result.durationsSeconds.harvesterDispatchToReadyObserved, 14);
assert.equal(result.durationsSeconds.stage6ToTelegram, 5);
assert.equal(result.durationsSeconds.stage6ToSidecarDispatchAccepted, 8);
assert.equal(result.stageIntervals[0].elapsedSeconds, 2);
assert.equal(result.deadlineStatus, 'STAGE6_PERSISTED_BY_CALLER_DEADLINE');
assert.equal(result.marketSessionEligibilityVerified, false);
assert.deepEqual(result, summarizeAutoTiming(input));
assert.equal(summarizeAutoTiming({ ...input, completionDeadline: at(45) }).deadlineStatus, 'STAGE6_PERSISTED_AFTER_CALLER_DEADLINE');
const missing = summarizeAutoTiming({ events: input.events });
assert.equal(missing.deadlineStatus, 'DEADLINE_UNAVAILABLE');
assert.equal(missing.durationsSeconds.scheduledToCreated, null);
const reversed = summarizeAutoTiming({ ...input, workflowStartedAt: at(9) });
assert.equal(reversed.durationsSeconds.createdToStarted, null);
assert.equal(reversed.integrityStatus, 'TIMESTAMP_ORDER_INVALID');
assert.equal(reversed.deadlineStatus, 'TIMING_CONTRACT_INVALID');
assert.equal(summarizeAutoTiming({ ...input, scheduledFor: at(15) }).integrityStatus, 'TIMESTAMP_ORDER_INVALID');
assert.equal(summarizeAutoTiming({ ...input, workflowCreatedAt: '2026-02-30T12:00:00Z' }).integrityStatus, 'TIMESTAMP_INVALID');
assert.equal(summarizeAutoTiming({ ...input, completionDeadline: 'secret' }).deadlineStatus, 'TIMING_CONTRACT_INVALID');
assert.equal(summarizeAutoTiming({ ...input, events: { STAGE6_PERSISTED: at(1) } }).integrityStatus, 'TIMESTAMP_ORDER_INVALID');
assert.equal(summarizeAutoTiming({ ...input, events: {} }).deadlineStatus, 'STAGE6_PERSISTENCE_UNOBSERVED');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-timing-'));
try {
  const json = path.join(dir, 'status.json');
  const event = path.join(dir, 'event.json');
  fs.writeFileSync(event, JSON.stringify({ schedule: '17 12 * * 1-5', client_payload: { scheduledFor: at(0), completionDeadline: at(60), private: 'never-copy' } }));
  const env = { ...process.env, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GITHUB_EVENT_PATH: event,
    GITHUB_EVENT_NAME: 'repository_dispatch', AUTO_WORKFLOW_CREATED_AT: at(10), AUTO_WORKFLOW_STARTED_AT: at(13),
    AUTO_SCHEDULER_RUN_STATUS_JSON: json, AUTO_SCHEDULER_RUN_STATUS_MD: path.join(dir, 'status.md') };
  const write = extra => {
    const run = spawnSync(process.execPath, ['scripts/write-auto-scheduler-run-status.mjs'], { env: { ...env, ...extra }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(fs.readFileSync(json, 'utf8'));
  };
  write({ AUTOMATION_PHASE: 'started' });
  const status = JSON.parse(fs.readFileSync(json, 'utf8'));
  status.timing.events = input.events;
  fs.writeFileSync(json, JSON.stringify(status));
  const completed = write({ AUTOMATION_PHASE: 'completed', AUTOMATION_EXIT_CODE: '0' });
  const post = write({ AUTOMATION_PHASE: 'post_step' });
  assert.equal(completed.timing.durationsSeconds.stage6ToTelegram, 5);
  assert.deepEqual(post.timing.events, completed.timing.events);
  assert.equal(post.timing.scheduledFor, at(0));
  assert.equal(JSON.stringify(post).includes('never-copy'), false);
  const dispatched = write({ AUTO_TIMING_EVENT: 'SIDECAR_FALLBACK_ACCEPTED' });
  assert.ok(dispatched.timing.events.SIDECAR_FALLBACK_ACCEPTED);
  const rerun = write({ AUTOMATION_PHASE: 'started', GITHUB_RUN_ATTEMPT: '2' });
  assert.equal(rerun.timing.events.STAGE6_PERSISTED, undefined);
  assert.equal(rerun.automation.completedSuccessfully, false);
  assert.equal(rerun.stage6, null);
  const cron = write({ GITHUB_RUN_ID: '124', GITHUB_EVENT_NAME: 'schedule' });
  assert.equal(cron.timing.scheduledFor, null, 'cron does not prove originating slot date');
  assert.equal(cron.timing.triggerSchedule, '17 12 * * 1-5');
  const workflow = fs.readFileSync('.github/workflows/schedule.yml', 'utf8');
  const metadataStep = workflow.split('name: Capture workflow timing metadata')[1].split('\n      - name:')[0]
    .split('run: |\n')[1].split('\n').map(line => line.replace(/^          /, '')).join('\n');
  for (const response of ['printf "2026-09-28T12:00:10Z\\t2026-09-28T12:00:13Z\\n"', 'return 1', 'printf "invalid\\n"']) {
    const envFile = path.join(dir, 'github-env');
    fs.writeFileSync(envFile, '');
    const run = spawnSync('/bin/bash', ['-e', '-o', 'pipefail', '-c',
      `timeout() { shift; "$@"; }; gh() { ${response}; };\n${metadataStep}`],
    { env: { ...env, GITHUB_ENV: envFile }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const saved = fs.readFileSync(envFile, 'utf8');
    assert.equal(saved.includes('AUTO_WORKFLOW_CREATED_AT='), response.includes('2026'));
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
const app = fs.readFileSync('App.tsx', 'utf8');
const fundamental = fs.readFileSync('components/FundamentalAnalysis.tsx', 'utf8');
const alpha = fs.readFileSync('components/AlphaAnalysis.tsx', 'utf8');
const automation = fs.readFileSync('automate.js', 'utf8');
assert.match(app, /if \(delivery.deliverySucceeded\) recordAutoTiming\('TELEGRAM_DELIVERED'\)/);
assert.match(fundamental, /readyData\?\.trigger_file === expectedTriggerFile\) \{\s*recordAutoTiming\('STAGE4_READY_OBSERVED'\)/);
assert.match(fundamental, /if \(dispatchResult.ok\) \{\s*recordAutoTiming\('HARVESTER_DISPATCHED'\)/);
assert.match(alpha, /await uploadFile\(accessToken, stage6FolderId, stage6FinalFileName, finalPayload, finalPayloadJson\);\s*recordAutoTiming\('STAGE6_PERSISTED'\)/);
assert.match(automation, /finally \{\s*try \{ await persistTiming\(\)/);
assert.match(automation, /catch \(error\) \{\s*try \{ await persistTiming\(\)/);
const mergeCode = automation.slice(automation.indexOf('const mergeAutoSchedulerEvidence ='), automation.indexOf('function buildRuntimeEnvPayload'));
let stored = { runId: 'old', runAttempt: '1', stage6: { file: 'old' }, timing: { events: { STAGE6_PERSISTED: at(1) } } };
const merge = attempt => vm.runInNewContext(`${mergeCode}\nmergeAutoSchedulerEvidence(undefined, undefined, { STAGE6_PERSISTED: at(50) });`, {
  automationRunId: 'new', automationRunAttempt: attempt,
  process: { env: { GITHUB_RUN_ID: 'new', GITHUB_RUN_ATTEMPT: attempt } },
  fs: { readFileSync: () => JSON.stringify(stored), mkdirSync: () => {}, renameSync: () => {},
    writeFileSync: (_path, text) => { stored = JSON.parse(text); } },
  sanitizeTimingEvents, summarizeAutoTiming, at
});
merge('1');
assert.equal(stored.runId, 'new');
assert.equal(stored.stage6, null);
assert.equal(stored.timing.events.STAGE6_PERSISTED, at(50));
stored.timing.events.STAGE6_PERSISTED = at(51);
merge('1');
assert.equal(stored.timing.events.STAGE6_PERSISTED, at(51), 'same-run first observation wins');
merge('2');
assert.equal(stored.timing.events.STAGE6_PERSISTED, at(50), 'another attempt cannot reuse observations');
const activeFinish = alpha.slice(alpha.indexOf('const finishAutoPilot ='), alpha.indexOf('finishAutoPilot();'));
assert.match(activeFinish, /if \(saved\) \{\s*recordAutoTiming\('REPORT_PERSISTED'\)/);
console.log('[AUTO_SCHEDULER_TIMING] PASS (offline; no dispatch, provider or broker calls)');
