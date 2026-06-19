#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PAYLOAD_PATH = process.env.STAGE6_HOLIDAY_SAFETY_PAYLOAD || 'stage6-dispatch-payload.json';
const REPORT_JSON = process.env.STAGE6_HOLIDAY_SAFETY_REPORT_JSON || 'state/stage6-holiday-safety-audit.json';
const REPORT_MD = process.env.STAGE6_HOLIDAY_SAFETY_REPORT_MD || 'state/stage6-holiday-safety-audit.md';
const MARKET_TZ = 'America/New_York';
const SOURCE = 'nyse_full_day_holiday_calendar_static_v1';

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(raw).trim().toLowerCase());
}

function ensureDir(file) {
  fs.mkdirSync(path.dirname(path.resolve(ROOT, file)), { recursive: true });
}

function parseDateKey(key) {
  const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`invalid market date: ${key || 'empty'}`);
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function dateKey(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function weekday(year, month, day) {
  return utcDate(year, month, day).getUTCDay();
}

function addDaysKey(key, delta) {
  const { year, month, day } = parseDateKey(key);
  const d = utcDate(year, month, day);
  d.setUTCDate(d.getUTCDate() + delta);
  return dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function nthWeekdayOfMonth(year, month, targetWeekday, nth) {
  let count = 0;
  for (let day = 1; day <= 31; day += 1) {
    const d = utcDate(year, month, day);
    if (d.getUTCMonth() + 1 !== month) break;
    if (d.getUTCDay() !== targetWeekday) continue;
    count += 1;
    if (count === nth) return dateKey(year, month, day);
  }
  throw new Error(`unable to resolve nth weekday: ${year}-${month} weekday=${targetWeekday} nth=${nth}`);
}

function lastWeekdayOfMonth(year, month, targetWeekday) {
  for (let day = 31; day >= 1; day -= 1) {
    const d = utcDate(year, month, day);
    if (d.getUTCMonth() + 1 !== month) continue;
    if (d.getUTCDay() === targetWeekday) return dateKey(year, month, day);
  }
  throw new Error(`unable to resolve last weekday: ${year}-${month} weekday=${targetWeekday}`);
}

function observedDate(year, month, day) {
  const key = dateKey(year, month, day);
  const wd = weekday(year, month, day);
  if (wd === 6) return addDaysKey(key, -1);
  if (wd === 0) return addDaysKey(key, 1);
  return key;
}

function easterSundayKey(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dateKey(year, month, day);
}

function nyseFullDayHolidayMap(year) {
  const holidays = new Map();
  const add = (key, reason) => holidays.set(key, reason);

  add(observedDate(year, 1, 1), "New Year's Day");
  add(nthWeekdayOfMonth(year, 1, 1, 3), 'Martin Luther King Jr. Day');
  add(nthWeekdayOfMonth(year, 2, 1, 3), "Washington's Birthday");
  add(addDaysKey(easterSundayKey(year), -2), 'Good Friday');
  add(lastWeekdayOfMonth(year, 5, 1), 'Memorial Day');
  add(observedDate(year, 6, 19), 'Juneteenth National Independence Day');
  add(observedDate(year, 7, 4), 'Independence Day');
  add(nthWeekdayOfMonth(year, 9, 1, 1), 'Labor Day');
  add(nthWeekdayOfMonth(year, 11, 4, 4), 'Thanksgiving Day');
  add(observedDate(year, 12, 25), 'Christmas Day');

  // If next New Year's Day falls on Saturday, NYSE observes it on Dec 31 of this year.
  const nextNewYearObserved = observedDate(year + 1, 1, 1);
  if (nextNewYearObserved.startsWith(`${year}-`)) add(nextNewYearObserved, "New Year's Day observed");

  return holidays;
}

function marketDateInNewYork(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function evaluateMarketDate(marketDate) {
  const { year, month, day } = parseDateKey(marketDate);
  const wd = weekday(year, month, day);
  if (wd === 0 || wd === 6) {
    return { marketClosed: true, reason: wd === 0 ? 'weekend_sunday' : 'weekend_saturday', holidayName: null };
  }
  const holidayName = nyseFullDayHolidayMap(year).get(marketDate) || null;
  if (holidayName) {
    return { marketClosed: true, reason: 'nyse_full_day_holiday', holidayName };
  }
  return { marketClosed: false, reason: 'regular_trading_day', holidayName: null };
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeGithubOutput(values) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\n/g, ' ')}`);
  fs.appendFileSync(out, `${lines.join('\n')}\n`);
}

const marketDate =
  process.env.STAGE6_HOLIDAY_SAFETY_MARKET_DATE ||
  process.env.MARKET_DATE ||
  marketDateInNewYork();
const evaluation = evaluateMarketDate(marketDate);
const writePayload = boolEnv('STAGE6_HOLIDAY_SAFETY_WRITE_PAYLOAD', true);
const expectAnalysisOnly = boolEnv('STAGE6_HOLIDAY_SAFETY_EXPECT_ANALYSIS_ONLY', false);
const payloadExists = fs.existsSync(PAYLOAD_PATH);
const payload = readJsonIfExists(PAYLOAD_PATH);
const hasStage6Identity = Boolean(String(payload?.stage6File || '').trim() && String(payload?.stage6Hash || '').trim());
const sidecarDispatchAllowed = !evaluation.marketClosed && hasStage6Identity;
const analysisOnly = evaluation.marketClosed || !hasStage6Identity;
const safety = {
  status: !hasStage6Identity
    ? 'analysis_only_missing_stage6_identity'
    : evaluation.marketClosed
      ? 'analysis_only_market_closed'
      : 'regular_trading_day',
  marketDate,
  marketTimezone: MARKET_TZ,
  evaluatedAt: new Date().toISOString(),
  marketClosed: evaluation.marketClosed,
  marketClosedReason: evaluation.reason,
  holidayName: evaluation.holidayName,
  analysisOnly,
  sidecarDispatchAllowed,
  brokerMutationAllowed: false,
  policy: !hasStage6Identity
    ? 'ANALYSIS_ONLY_BLOCK_SIDECAR_DISPATCH_MISSING_STAGE6_IDENTITY'
    : evaluation.marketClosed
      ? 'ANALYSIS_ONLY_SUPPRESS_SIDECAR_DISPATCH'
      : 'REGULAR_DAY_DISPATCH_ALLOWED_SIDECAR_RTH_GUARD_STILL_REQUIRED',
  source: SOURCE
};

const nextPayload = {
  ...payload,
  holidayGeneratedStage6Safety: safety
};

if (writePayload) {
  ensureDir(PAYLOAD_PATH);
  fs.writeFileSync(PAYLOAD_PATH, `${JSON.stringify(nextPayload, null, 2)}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  overall: !payloadExists || !hasStage6Identity || (expectAnalysisOnly && !safety.analysisOnly) ? 'fail' : 'pass',
  payloadPath: PAYLOAD_PATH,
  payloadExists,
  hasStage6Identity,
  payloadWritten: writePayload,
  stage6File: String(payload?.stage6File || ''),
  stage6Hash: String(payload?.stage6Hash || ''),
  sourceRunId: String(payload?.sourceRunId || ''),
  holidayGeneratedStage6Safety: safety
};

ensureDir(REPORT_JSON);
fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
const md = [
  '# Stage6 Holiday Safety Audit',
  '',
  `- overall: **${report.overall}**`,
  `- stage6File: \`${report.stage6File || 'N/A'}\``,
  `- stage6Hash: \`${report.stage6Hash ? report.stage6Hash.slice(0, 12) : 'N/A'}\``,
  `- marketDate: \`${safety.marketDate}\``,
  `- status: \`${safety.status}\``,
  `- marketClosedReason: \`${safety.marketClosedReason}\``,
  `- holidayName: \`${safety.holidayName || 'N/A'}\``,
  `- analysisOnly: \`${safety.analysisOnly}\``,
  `- sidecarDispatchAllowed: \`${safety.sidecarDispatchAllowed}\``,
  `- brokerMutationAllowed: \`${safety.brokerMutationAllowed}\``,
  `- policy: \`${safety.policy}\``
];
ensureDir(REPORT_MD);
fs.writeFileSync(REPORT_MD, `${md.join('\n')}\n`);

writeGithubOutput({
  sidecar_dispatch_allowed: safety.sidecarDispatchAllowed ? 'true' : 'false',
  market_closed: safety.marketClosed ? 'true' : 'false',
  market_date: safety.marketDate,
  holiday_safety_status: safety.status,
  holiday_name: safety.holidayName || ''
});

console.log(
  `[STAGE6_HOLIDAY_SAFETY] overall=${report.overall} marketDate=${safety.marketDate} status=${safety.status} sidecarDispatchAllowed=${safety.sidecarDispatchAllowed} holiday=${safety.holidayName || 'N/A'}`
);
if (report.overall !== 'pass') process.exit(1);
