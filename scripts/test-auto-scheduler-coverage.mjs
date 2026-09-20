import assert from 'node:assert/strict';
import fs from 'node:fs';
import { blocksAutomaticAnalysis } from './auto-scheduler-coverage.mjs';

const now = '2026-09-17T18:00:00Z';
const context = { now, marketDate: '2026-09-17', freshSince: '2026-09-17T15:00:00Z' };
const jobs = (startedAt, overrides = {}) => [{ name: 'Alpha Seeking Pipeline', conclusion: 'success',
  startedAt, completedAt: new Date(Date.parse(startedAt) + 60000).toISOString(), ...overrides }];
const check = (startedAt, expected, overrides = {}, settings = context) =>
  assert.equal(blocksAutomaticAnalysis({ jobs: jobs(startedAt, overrides), ...settings }), expected);

check('2026-09-17T14:19:17Z', true); // Observed RTH success stays covered after 180 minutes.
check('2026-09-17T13:30:00Z', true);
check('2026-09-17T13:29:59Z', false); // Stale premarket success does not suppress RTH analysis.
check('2026-09-17T13:29:59Z', true, {}, { ...context, now: '2026-09-17T14:00:00Z', freshSince: '2026-09-17T11:00:00Z' });
check('2026-09-16T14:19:17Z', false);
for (const conclusion of ['skipped', 'cancelled', 'failure', 'timed_out', null]) check('2026-09-17T14:00:00Z', false, { conclusion });
check('2026-09-17T14:00:00Z', false, { completedAt: null });
check('2026-09-17T14:00:00Z', false, { completedAt: '2026-09-17T19:00:00Z' });
check('2026-09-17T14:00:00Z', false, { completedAt: '2026-09-17T13:00:00Z' });
check('2026-09-17T14:00:00Z', false, { startedAt: 'invalid' });
check('2026-12-17T14:30:00Z', true, {}, { now: '2026-12-17T20:00:00Z', marketDate: '2026-12-17', freshSince: '2026-12-17T17:00:00Z' });
check('2026-12-17T14:29:59Z', false, {}, { now: '2026-12-17T20:00:00Z', marketDate: '2026-12-17', freshSince: '2026-12-17T17:00:00Z' });
check('2026-09-17T20:00:00Z', false, {}, { now: '2026-09-18T01:00:00Z', marketDate: '2026-09-17', freshSince: '2026-09-17T22:00:00Z' });
assert.equal(blocksAutomaticAnalysis({ jobs: [], ...context }), false);
assert.equal(blocksAutomaticAnalysis({ jobs: [{ name: 'Daily Run Gate', conclusion: 'success' }], ...context }), false);
assert.equal(blocksAutomaticAnalysis({ jobs: [...jobs('2026-09-17T14:00:00Z'), ...jobs('2026-09-17T14:00:00Z')], ...context }), false);
for (const file of ['schedule.yml', 'auto-scheduler-watchdog.yml', 'auto-scheduler-deadline-guard.yml']) {
  const workflow = fs.readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), 'utf8');
  assert.ok(workflow.includes('node scripts/auto-scheduler-coverage.mjs'), `${file}: shared coverage rule required`);
  assert.ok(!workflow.includes('and .createdAt >= $fresh_since) | .databaseId'), 'stale RTH success must reach coverage evaluator');
  assert.ok(workflow.indexOf('actions/checkout@') < workflow.indexOf('node scripts/auto-scheduler-coverage.mjs'));
}
console.log('PASS same-market-day RTH coverage, premarket freshness, DST, no-op/failure/future rejection; requests=0');
