import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { hashTextSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { buildStage4EarningsContext, calculateEventRiskOverlay } from '../services/stage4EarningsEventContract.mjs';

const decisionAt = '2026-09-06T14:00:00Z';
const trigger = 'STAGE3_FIXTURE.json';
const map = {
  schema_version: 'earnings-event-map-v2', trigger_file: trigger,
  retrieved_at: '2026-09-06T12:00:00Z', timestamp: '2026-09-06 21:00:00',
  market_timezone: 'America/New_York', publication_timestamp_available: false,
  source: 'fmp+finnhub+yfinance', universe_count: 1, covered_count: 1, missing_count: 0,
  coverage_contract_status: 'PASS', unknown_or_unclassified_rows: 0,
  coverage_statuses: { FIXTURE: { status: 'EARNINGS_EVENT_PRESENT', source: 'yfinance' } },
  coverage_status_counts: { EARNINGS_EVENT_PRESENT: 1 },
  window: { start_date: '2026-09-06', end_date: '2026-11-05', max_forward_days: 60, market_timezone: 'America/New_York' },
  events: { FIXTURE: { earnings_date: '2026-09-09', days_to_event: 3, source: 'yfinance', event_risk: 'MEDIUM' } }
};
const context = async (snapshot = map, at = decisionAt, overrides = {}) => buildStage4EarningsContext({
  snapshot, decisionAt: at, expectedTriggerFile: trigger,
  contentSha256: snapshot === null ? null : await hashTextSha256(JSON.stringify(snapshot)), ...overrides
});
const overlay = async (snapshot = map, at = decisionAt, regime = 'UNKNOWN') =>
  calculateEventRiskOverlay(await context(snapshot, at), 'FIXTURE', regime);
const changed = (edit) => { const copy = structuredClone(map); edit(copy); return copy; };

const good = await overlay();
assert.equal(good.eventRiskPenalty, 3, 'D-3 uses the existing MEDIUM penalty');
assert.equal(good.earningsSource, 'yfinance', 'never use aggregate provider label');
assert.equal(good.earningsRetrievedAt, map.retrieved_at, 'never use naive legacy timestamp');
assert.equal(good.earningsEvidenceStatus, 'EARNINGS_EVENT_DATE_VERIFIED');
assert.equal(good.earningsPublicationTimestampAvailable, false);
assert.equal(good.earningsDistanceBasis, 'EVENT_DATE_MINUS_STAGE4_NEW_YORK_DATE');
for (const [at, days, penalty, state] of [
  ['2026-09-06T14:00:00Z', 3, 3, 'MEDIUM'],
  ['2026-09-07T14:00:00Z', 2, 3, 'MEDIUM'],
  ['2026-09-08T14:00:00Z', 1, 8, 'HIGH'],
  ['2026-09-09T14:00:00Z', 0, 8, 'HIGH'],
  ['2026-09-10T14:00:00Z', -1, 8, 'HIGH'],
  ['2026-09-11T14:00:00Z', -2, 0, 'NONE'],
  ['2026-09-14T14:00:00Z', -5, 0, 'NONE']
]) {
  const row = await overlay(map, at);
  assert.equal(row.daysToEarnings, days);
  assert.equal(row.eventRiskPenalty, penalty);
  assert.equal(row.eventRiskState, state);
}
for (const [distance, penalty] of [[4, 3], [5, 3], [6, 0]]) {
  assert.equal((await overlay(changed(m => {
    m.events.FIXTURE.earnings_date = `2026-09-${6 + distance}`;
    m.events.FIXTURE.days_to_event = distance;
  }))).eventRiskPenalty, penalty);
}
assert.equal((await overlay(map, decisionAt, 'RISK_OFF')).eventRiskPenalty, 4);
assert.equal((await overlay(map, '2026-09-09T14:00:00Z', 'RISK_OFF')).eventRiskPenalty, 10);
assert.equal((await overlay(map, '2026-09-07T00:30:00Z')).daysToEarnings, 3, 'UTC midnight is not NY midnight');

for (const [start, end, retrieved, event, at] of [
  ['2026-03-07', '2026-05-06', '2026-03-07T17:00:00Z', '2026-03-09', '2026-03-08T16:00:00Z'],
  ['2026-10-31', '2026-12-30', '2026-10-31T16:00:00Z', '2026-11-02', '2026-11-01T17:00:00Z']
]) {
  const dst = changed(m => {
    m.retrieved_at = retrieved; m.window.start_date = start; m.window.end_date = end;
    m.events.FIXTURE.earnings_date = event; m.events.FIXTURE.days_to_event = 2;
  });
  assert.equal((await overlay(dst, at)).daysToEarnings, 1, 'calendar day distance survives DST');
}

const rejected = async (snapshot, status, at = decisionAt) => {
  const row = await overlay(snapshot, at);
  assert.equal(row.earningsEvidenceStatus, status);
  assert.equal(row.earningsDate, null);
  assert.equal(row.daysToEarnings, null);
  assert.equal(row.eventRiskPenalty, 0);
  assert.equal(row.eventRiskAssessmentStatus, 'UNAVAILABLE_NOT_SAFE');
};
await rejected(null, 'EARNINGS_MAP_UNAVAILABLE');
await rejected([], 'EARNINGS_MAP_CONTRACT_INVALID');
await rejected(changed(m => delete m.schema_version), 'EARNINGS_MAP_LEGACY_UNVERIFIED');
await rejected(changed(m => m.trigger_file = 'WRONG.json'), 'EARNINGS_TRIGGER_MISMATCH');
await rejected(changed(m => m.retrieved_at = '2026-09-06 12:00:00'), 'EARNINGS_RETRIEVAL_INVALID');
await rejected(changed(m => m.retrieved_at = '2026-09-07T12:00:00Z'), 'EARNINGS_RETRIEVAL_AFTER_DECISION');
await rejected(map, 'EARNINGS_DECISION_TIME_INVALID', '2026-02-30T12:00:00Z');
await rejected(changed(m => m.window.start_date = '2026-09-05'), 'EARNINGS_WINDOW_INVALID');
await rejected(changed(m => m.covered_count = 0), 'EARNINGS_COVERAGE_CONTRACT_INVALID');
await rejected(changed(m => m.coverage_status_counts.EARNINGS_EVENT_PRESENT = 2), 'EARNINGS_COVERAGE_CONTRACT_INVALID');
await rejected(changed(m => m.coverage_statuses.FIXTURE.status = 'UNKNOWN'), 'EARNINGS_COVERAGE_CONTRACT_INVALID');
await rejected(changed(m => m.events.FIXTURE.earnings_date = '2026-02-30'), 'EARNINGS_EVENT_DATE_INVALID');
await rejected(changed(m => m.events.FIXTURE.days_to_event = NaN), 'EARNINGS_EVENT_DISTANCE_INVALID');
await rejected(changed(m => m.events.FIXTURE.days_to_event = null), 'EARNINGS_EVENT_DISTANCE_INVALID');
await rejected(changed(m => m.events.FIXTURE.days_to_event = -3), 'EARNINGS_EVENT_DISTANCE_INVALID');
await rejected(changed(m => delete m.events.FIXTURE.earnings_date), 'EARNINGS_EVENT_DATE_INVALID');
await rejected(changed(m => delete m.events.FIXTURE.source), 'EARNINGS_EVENT_SOURCE_INVALID');
await rejected(changed(m => m.coverage_statuses.FIXTURE.source = 'fmp'), 'EARNINGS_EVENT_SOURCE_INVALID');
await rejected(changed(m => {
  m.events.FIXTURE.earnings_date = '2026-11-06'; m.events.FIXTURE.days_to_event = 61;
}), 'EARNINGS_EVENT_DISTANCE_INVALID');
assert.equal((await overlay(changed(m => {
  m.events.FIXTURE.earnings_date = '2026-11-05'; m.events.FIXTURE.days_to_event = 60;
}))).daysToEarnings, 60);
assert.equal((await overlay(changed(m => m.events.FIXTURE.event_risk = 'HIGH'))).eventRiskState, 'MEDIUM', 'vendor label cannot override Stage4 date window');
assert.equal((await overlay(changed(m => delete m.events.FIXTURE.days_to_event))).daysToEarnings, 3);
assert.equal(calculateEventRiskOverlay(await context(map, decisionAt, { contentSha256: null }), 'FIXTURE').earningsEvidenceStatus, 'EARNINGS_CONTENT_HASH_INVALID');
assert.equal(calculateEventRiskOverlay(await context(), 'ABSENT').earningsEvidenceStatus, 'EARNINGS_SYMBOL_NOT_COVERED');

for (const status of ['EARNINGS_EVENT_OUTSIDE_WINDOW_FUTURE', 'EARNINGS_ONLY_PAST_EVENT_REPORTED', 'EARNINGS_PROVIDER_NO_DATED_EVENT', 'EARNINGS_PROVIDER_LOOKUP_FAILED', 'EARNINGS_DATE_INVALID']) {
  const missing = changed(m => {
    m.events = {}; m.covered_count = 0; m.missing_count = 1;
    m.coverage_statuses.FIXTURE.status = status; m.coverage_status_counts = { [status]: 1 };
  });
  await rejected(missing, status);
}

const before = JSON.stringify(map);
assert.deepEqual(await overlay(), await overlay(), 'same explicit decision instant is deterministic');
assert.equal(JSON.stringify(map), before, 'source artifact is immutable');
const renamed = changed(m => {
  m.events.RENAMED = m.events.FIXTURE; delete m.events.FIXTURE;
  m.coverage_statuses.RENAMED = m.coverage_statuses.FIXTURE; delete m.coverage_statuses.FIXTURE;
});
assert.equal(calculateEventRiskOverlay(await context(renamed), 'renamed').eventRiskPenalty, good.eventRiskPenalty);
assert.notEqual((await context(renamed)).lineage.contentSha256, (await context()).lineage.contentSha256);
assert.notEqual(await hashTextSha256(JSON.stringify(map)), await hashTextSha256(JSON.stringify(map) + '\n'), 'raw-text hash includes every downloaded byte');
const tainted = changed(m => m.source = 'credential-cookie-secret-DO-NOT-PROPAGATE');
assert.equal(JSON.stringify(await overlay(tainted)).includes(tainted.source), false);
const lineage = (await context()).lineage;
assert.equal(lineage.hashBasis, 'EXACT_DOWNLOADED_UTF8_TEXT');
assert.equal(JSON.stringify(lineage).includes('FIXTURE'), true, 'trigger filename, not Drive ID, is retained');

const component = await readFile(new URL('../components/TechnicalAnalysis.tsx', import.meta.url), 'utf8');
assert.ok(/calculateEventRiskOverlay\(\s*earningsEventContext,/.test(component));
assert.ok(component.includes('earningsEventLineage: earningsEventContext.lineage'));
assert.ok(component.includes('...eventRiskOverlay'));
assert.ok(component.includes('eventPenalty: Number((techData.scoreBreakdown.eventPenalty + eventRiskOverlay.eventRiskPenalty)'));
const stage5 = await readFile(new URL('../components/ICTAnalysis.tsx', import.meta.url), 'utf8');
const stage5Mapping = stage5.slice(stage5.indexOf('const finalRankedResults = diversifiedResults.map('), stage5.indexOf('finalRankedResults.slice(0, 5)'));
assert.ok(stage5Mapping.includes('...ticker'));
const runStage5Mapping = new Function('diversifiedResults', ts.transpile(stage5Mapping, {
  target: ts.ScriptTarget.ES2022
}) + '\nreturn finalRankedResults;');
const [stage5Row] = runStage5Mapping([{ techMetrics: good }]);
assert.deepEqual(stage5Row.techMetrics, good, 'actual Stage5 ranking mapper preserves earnings evidence');
const stage6 = await readFile(new URL('../components/AlphaAnalysis.tsx', import.meta.url), 'utf8');
// Exercise the actual downstream reader, not a second implementation of its precedence.
const scalars = stage6.slice(stage6.indexOf('const normalizeOptionalText ='), stage6.indexOf('const toPositiveFiniteNumber ='));
const reader = stage6.slice(stage6.indexOf('const normalizeStage6DateOnly ='), stage6.indexOf('const readCanonicalEarningsDaysToEvent ='));
assert.ok(scalars && reader);
const js = ts.transpile(scalars + reader + '\nexport { readCanonicalEarningsLineage };', {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
});
const exports = {};
new Function('exports', js)(exports);
const consumed = exports.readCanonicalEarningsLineage(stage5Row);
assert.equal(consumed.earningsCoverageStatus, 'EARNINGS_PRESENT');
assert.equal(consumed.earningsDate, good.earningsDate);
assert.equal(consumed.earningsDaysToEvent, good.daysToEarnings);
assert.equal(consumed.earningsSource, good.earningsSource);
assert.equal(Date.parse(consumed.earningsRetrievedAt), Date.parse(good.earningsRetrievedAt));
const unavailable = exports.readCanonicalEarningsLineage({ techMetrics: await overlay(null) });
assert.equal(unavailable.earningsCoverageStatus, 'EARNINGS_SOURCE_MISSING');
assert.equal(unavailable.earningsDaysToEvent, null, 'unavailable does not become D-day zero');
console.log('PASS Stage4 earnings date, NY/DST windows, source/hash/trigger, coverage, unavailable, deterministic and consumer contracts');
