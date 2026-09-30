import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { utcTimestamp } from '../services/autoSchedulerTiming.mjs';

const endpoint = 'https://api.github.com/repos/pungking/US_Alpha_Seeker/dispatches';
const eventType = 'auto_scheduler_external_trigger';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const result = (status, requestCount = 0) => ({ status, requestCount, retryCount: 0,
  marketSessionEligibilityVerified: false, analysisCompletionVerified: false });

function windowStatus(scheduledFor, dispatchBefore, now) {
  const current = utcTimestamp(now());
  return !current ? 'CLOCK_INVALID' : current < scheduledFor ? 'WINDOW_NOT_OPEN'
    : current >= dispatchBefore ? 'WINDOW_EXPIRED' : null;
}

function reserveAttempt(directory, slotHash, record) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) return 'RECEIPT_DIRECTORY_INVALID';
  try {
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0
      || (process.getuid && stat.uid !== process.getuid())) return 'RECEIPT_DIRECTORY_INVALID';
  } catch { return 'RECEIPT_DIRECTORY_INVALID'; }
  try {
    // Immutable attempt marker, not a success receipt. Even partial writes suppress retry.
    const fd = fs.openSync(path.join(directory, `${slotHash}.attempt.json`), 'wx', 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(record) + '\n');
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    const dirFd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
  } catch (error) {
    return error?.code === 'EEXIST' ? 'ATTEMPT_ALREADY_RECORDED' : 'ATTEMPT_RECORD_FAILED';
  }
  return null;
}

export async function dispatchAutomaticAnalysis(options, {
  token = process.env.GITHUB_DISPATCH_TOKEN, now = () => new Date().toISOString(), fetchImpl = fetch
} = {}) {
  const scheduledFor = utcTimestamp(options.scheduledFor);
  const dispatchBefore = utcTimestamp(options.dispatchBefore);
  const completionDeadline = utcTimestamp(options.completionDeadline);
  if (!scheduledFor || !dispatchBefore || !completionDeadline
    || scheduledFor >= dispatchBefore || dispatchBefore >= completionDeadline) return result('WINDOW_INVALID');
  const blocked = windowStatus(scheduledFor, dispatchBefore, now);
  if (blocked) return result(blocked);
  if (options.send !== true) return result('DRY_RUN_VALIDATED');
  if (typeof token !== 'string' || !token || /\s/.test(token)) return result('CREDENTIAL_MISSING');
  const body = JSON.stringify({ event_type: eventType,
    client_payload: { source: 'external_scheduler', scheduledFor, completionDeadline } });
  // Scope excludes deadline so editing a deadline cannot replay the same slot.
  const slotSha256 = sha256(`${endpoint}\n${eventType}\n${scheduledFor}`);
  const reservation = reserveAttempt(options.receiptDir, slotSha256, {
    schemaVersion: 'auto-scheduler-trigger-attempt.v1', status: 'ATTEMPT_RESERVED_DO_NOT_RETRY',
    scheduledFor, dispatchBefore, completionDeadline, slotSha256, requestSha256: sha256(body)
  });
  if (reservation) return result(reservation);
  const dispatchNow = utcTimestamp(now());
  const expired = windowStatus(scheduledFor, dispatchBefore, () => dispatchNow);
  if (expired) return result(expired);
  const timeoutMs = Math.min(15000, Date.parse(dispatchBefore) - Date.parse(dispatchNow));
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body
    });
    // Never read/log a response body or an exception that could contain credentials.
    return result(response.status === 204 ? 'DISPATCH_ACCEPTED_NOT_ANALYSIS_PROOF'
      : 'DISPATCH_NOT_CONFIRMED_DO_NOT_RETRY', 1);
  } catch { return result('DISPATCH_OUTCOME_UNKNOWN_DO_NOT_RETRY', 1); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let outcome;
  try {
    const { values } = parseArgs({ options: { 'scheduled-for': { type: 'string' },
      'dispatch-before': { type: 'string' }, 'completion-deadline': { type: 'string' },
      'receipt-dir': { type: 'string' }, send: { type: 'boolean', default: false } } });
    outcome = await dispatchAutomaticAnalysis({ scheduledFor: values['scheduled-for'],
      dispatchBefore: values['dispatch-before'], completionDeadline: values['completion-deadline'],
      receiptDir: values['receipt-dir'], send: values.send });
  } catch { outcome = result('ARGUMENTS_INVALID'); }
  console.log(JSON.stringify(outcome));
  if (!['DRY_RUN_VALIDATED', 'DISPATCH_ACCEPTED_NOT_ANALYSIS_PROOF'].includes(outcome.status)) process.exitCode = 1;
}
