import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { dispatchAutomaticAnalysis } from './dispatch-auto-scheduler.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-trigger-test-'));
const slot = { scheduledFor: '2026-10-01T11:00:00Z', dispatchBefore: '2026-10-01T11:05:00Z',
  completionDeadline: '2026-10-01T13:20:00Z' };
const now = () => '2026-10-01T11:00:01Z';
const token = 'synthetic-test-token';
let calls = 0;
let receipts = 0;
const fresh = () => ({ ...slot, send: true, receiptDir: path.join(root, String(++receipts)) });
const mock = async (url, request) => {
  calls++;
  assert.equal(url, 'https://api.github.com/repos/pungking/US_Alpha_Seeker/dispatches');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  assert.equal(request.headers.Authorization, `Bearer ${token}`);
  assert.ok(request.signal instanceof AbortSignal);
  const body = JSON.parse(request.body);
  assert.deepEqual(Object.keys(body).sort(), ['client_payload', 'event_type']);
  assert.equal(body.event_type, 'auto_scheduler_external_trigger');
  assert.deepEqual(Object.keys(body.client_payload).sort(), ['completionDeadline', 'scheduledFor', 'source']);
  assert.equal(body.client_payload.source, 'external_scheduler');
  assert.equal(body.client_payload.scheduledFor, '2026-10-01T11:00:00.000Z');
  return { status: 204, text: () => { throw new Error('Response body must never be read'); } };
};
const deps = { token, now, fetchImpl: mock };
const run = (options, overrides = {}) => dispatchAutomaticAnalysis(options, { ...deps, ...overrides });
const blocked = async (options, status, overrides) => {
  const before = calls;
  const result = await run(options, overrides);
  assert.equal(result.status, status);
  assert.equal(result.requestCount, 0);
  assert.equal(calls, before);
};
try {
  const dry = fresh();
  await blocked({ ...dry, send: false }, 'DRY_RUN_VALIDATED', { token: '' });
  assert.equal(fs.existsSync(dry.receiptDir), false);
  await blocked(fresh(), 'CREDENTIAL_MISSING', { token: '' });
  for (const invalid of [null, '', 'invalid', '2026-02-30T11:00:00Z', '2026-10-01T11:00:00+00:00']) {
    await blocked({ ...fresh(), scheduledFor: invalid }, 'WINDOW_INVALID');
  }
  await blocked({ ...fresh(), dispatchBefore: slot.scheduledFor }, 'WINDOW_INVALID');
  await blocked({ ...fresh(), completionDeadline: slot.dispatchBefore }, 'WINDOW_INVALID');
  await blocked(fresh(), 'WINDOW_NOT_OPEN', { now: () => '2026-10-01T10:59:59Z' });
  await blocked(fresh(), 'WINDOW_EXPIRED', { now: () => slot.dispatchBefore });
  await blocked(fresh(), 'CLOCK_INVALID', { now: () => 'invalid' });
  await blocked({ ...fresh(), receiptDir: 'relative' }, 'RECEIPT_DIRECTORY_INVALID');
  const insecure = fresh();
  fs.mkdirSync(insecure.receiptDir, { mode: 0o755 });
  fs.chmodSync(insecure.receiptDir, 0o755); // Fixture must remain insecure under umask 077.
  await blocked(insecure, 'RECEIPT_DIRECTORY_INVALID');

  const send = fresh();
  const result = await run(send);
  assert.equal(result.status, 'DISPATCH_ACCEPTED_NOT_ANALYSIS_PROOF');
  assert.equal(result.requestCount, 1);
  const [name] = fs.readdirSync(send.receiptDir);
  const receiptPath = path.join(send.receiptDir, name);
  const bytes = fs.readFileSync(receiptPath);
  assert.equal(fs.statSync(receiptPath).mode & 0o777, 0o600);
  assert.equal(JSON.parse(bytes).status, 'ATTEMPT_RESERVED_DO_NOT_RETRY');
  await blocked(send, 'ATTEMPT_ALREADY_RECORDED');
  await blocked({ ...send, scheduledFor: '2026-10-01T11:00:00.000Z',
    completionDeadline: '2026-10-01T13:25:00Z' }, 'ATTEMPT_ALREADY_RECORDED');
  assert.deepEqual(fs.readFileSync(receiptPath), bytes);
  assert.ok(!bytes.includes(token));
  // Exclusive reservation must exist before network access, including concurrent invocations.
  const concurrent = fresh();
  const results = await Promise.all([run(concurrent), run(concurrent)]);
  assert.equal(results.reduce((sum, r) => sum + r.requestCount, 0), 1);

  for (const httpStatus of [301, 401, 403, 429, 500, 200]) {
    const options = fresh();
    const r = await run(options, { fetchImpl: async () => { calls++; return { status: httpStatus }; } });
    assert.equal(r.status, 'DISPATCH_NOT_CONFIRMED_DO_NOT_RETRY');
    assert.equal(r.requestCount, 1);
    await blocked(options, 'ATTEMPT_ALREADY_RECORDED');
  }
  const uncertain = fresh();
  const failed = await run(uncertain, { fetchImpl: async () => {
    calls++;
    assert.equal(fs.readdirSync(uncertain.receiptDir).length, 1);
    throw new Error(`timeout or disconnect: ${token}`);
  } });
  assert.equal(failed.status, 'DISPATCH_OUTCOME_UNKNOWN_DO_NOT_RETRY');
  assert.equal(failed.requestCount, 1);
  assert.ok(!JSON.stringify(failed).includes(token));
  await blocked(uncertain, 'ATTEMPT_ALREADY_RECORDED');
  let clockReads = 0;
  await blocked(fresh(), 'WINDOW_EXPIRED', { now: () => ++clockReads === 1 ? now() : slot.dispatchBefore });

  const cli = spawnSync(process.execPath, ['scripts/dispatch-auto-scheduler.mjs', '--unexpected', token],
    { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.notEqual(cli.status, 0);
  assert.ok(!`${cli.stdout}${cli.stderr}`.includes(token));
  assert.equal(JSON.parse(cli.stdout).status, 'ARGUMENTS_INVALID');
  console.log('PASS portable trigger: offline mocks only; dry-run, window, exclusive receipt, no retry, redaction; external requests=0');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
