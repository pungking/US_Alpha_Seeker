#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_JSON = 'state/current-entry-structure-audit.json';
const DEFAULT_OUT_MD = 'docs/CURRENT_ENTRY_STRUCTURE_AUDIT_2026-05-12.md';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
  } catch {
    return fallback;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseNumberEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function parseBool(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function formatNumber(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? 'N/A' : n.toFixed(digits);
}

function escapeCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function getPolicy() {
  return {
    minBars: Math.max(30, Math.round(parseNumberEnv('CURRENT_ENTRY_STRUCTURE_MIN_BARS', 60))),
    atrWindow: Math.max(5, Math.round(parseNumberEnv('CURRENT_ENTRY_STRUCTURE_ATR_WINDOW', 14))),
    swingLookback: Math.max(10, Math.round(parseNumberEnv('CURRENT_ENTRY_STRUCTURE_SWING_LOOKBACK', 50))),
    minStopAtr: parseNumberEnv('CURRENT_ENTRY_STRUCTURE_MIN_STOP_ATR', 0.75),
    maxStopAtr: parseNumberEnv('CURRENT_ENTRY_STRUCTURE_MAX_STOP_ATR', 3.0),
    supportBufferAtr: parseNumberEnv('CURRENT_ENTRY_STRUCTURE_SUPPORT_BUFFER_ATR', 0.35),
    maxPriceDriftPct: parseNumberEnv('CURRENT_ENTRY_STRUCTURE_MAX_PRICE_DRIFT_PCT', 5.0)
  };
}

function candidateRows(stage6Audit) {
  const rows = Array.isArray(stage6Audit?.rows) ? stage6Audit.rows : [];
  const recentRunLimit = Math.max(1, Math.round(parseNumberEnv('CURRENT_ENTRY_STRUCTURE_RECENT_RUNS', 10)));
  const latest = stage6Audit?.runSummaries?.[0]?.stage6File || rows[0]?.stage6File || null;
  const recentFiles = Array.isArray(stage6Audit?.runSummaries)
    ? new Set(stage6Audit.runSummaries.slice(0, recentRunLimit).map((run) => run.stage6File).filter(Boolean))
    : new Set(latest ? [latest] : []);
  return rows
    .filter((row) => recentFiles.has(row.stage6File))
    .map((row) => ({ ...row, sourceStage6File: row.stage6File || latest }));
}

function barSearchPaths(symbol) {
  const roots = String(process.env.CURRENT_ENTRY_STRUCTURE_BARS_DIRS || 'state/ohlcv,state/market-bars,data/ohlcv')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const names = [`${symbol}_OHLCV.json`, `${symbol}.json`, `${symbol}_bars.json`];
  return roots.flatMap((root) => names.map((name) => path.resolve(REPO_ROOT, root, name)));
}

function extractBarArray(payload, symbol) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.bars)) return payload.bars;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.[symbol])) return payload[symbol];
  if (Array.isArray(payload?.bars?.[symbol])) return payload.bars[symbol];
  return [];
}

function normalizeBar(row) {
  const date = row?.date ?? row?.timestamp ?? row?.t ?? row?.time;
  const open = numberOrNull(row?.open ?? row?.o);
  const high = numberOrNull(row?.high ?? row?.h);
  const low = numberOrNull(row?.low ?? row?.l);
  const close = numberOrNull(row?.close ?? row?.c ?? row?.adjClose);
  const volume = numberOrNull(row?.volume ?? row?.v);
  if (!date || open == null || high == null || low == null || close == null) return null;
  if (!(high >= Math.max(open, close) && low <= Math.min(open, close))) return null;
  return { date: String(date), open, high, low, close, volume };
}

function loadLocalBars(symbol) {
  for (const filePath of barSearchPaths(symbol)) {
    const payload = readJson(filePath);
    const bars = extractBarArray(payload, symbol).map(normalizeBar).filter(Boolean);
    if (bars.length > 0) {
      bars.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return { status: 'ok', source: path.relative(REPO_ROOT, filePath), bars };
    }
  }
  return { status: 'missing', source: null, bars: [] };
}

async function refreshGoogleAccessToken() {
  const clientId = process.env.GDRIVE_CLIENT_ID;
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json?.access_token) throw new Error(`google_token_refresh_failed(${response.status})`);
  return json.access_token;
}

async function driveList(token, query, fields, pageSize = 20) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', 'modifiedTime desc');
  url.searchParams.set('pageSize', String(pageSize));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`drive_list_failed(${response.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return Array.isArray(json.files) ? json.files : [];
}

async function driveDownloadJson(token, fileId) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
  url.searchParams.set('alt', 'media');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await response.text();
  if (!response.ok) throw new Error(`drive_download_failed(${response.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function resolveDriveOhlcvFolder(token) {
  const explicit = process.env.GDRIVE_OHLCV_FOLDER_ID || process.env.CURRENT_ENTRY_STRUCTURE_OHLCV_FOLDER_ID;
  if (explicit) return { status: 'ok', folderId: explicit, reason: 'explicit_folder_id' };
  const root = process.env.GDRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!root) return { status: 'skipped', folderId: null, reason: 'missing_root_folder' };
  const systemFolders = await driveList(token, `name = 'System_Identity_Maps' and '${root}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`, 'files(id,name)', 5);
  const parent = systemFolders[0]?.id || root;
  const folders = await driveList(token, `name = 'Financial_Data_OHLCV' and '${parent}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`, 'files(id,name)', 5);
  if (!folders[0]?.id) return { status: 'skipped', folderId: null, reason: 'ohlcv_folder_not_found' };
  return { status: 'ok', folderId: folders[0].id, reason: 'resolved_by_name' };
}

async function buildDriveContext() {
  if (!parseBool(process.env.CURRENT_ENTRY_STRUCTURE_FETCH_DRIVE, true)) return { status: 'skipped', reason: 'disabled' };
  const token = await refreshGoogleAccessToken();
  if (!token) return { status: 'skipped', reason: 'missing_oauth_env' };
  const folder = await resolveDriveOhlcvFolder(token);
  return { token, ...folder };
}

async function loadDriveBars(symbol, driveContext) {
  if (driveContext?.status !== 'ok') return { status: 'missing', source: null, bars: [] };
  const files = await driveList(driveContext.token, `name = '${symbol}_OHLCV.json' and '${driveContext.folderId}' in parents and trashed = false`, 'files(id,name,modifiedTime,size)', 3);
  if (!files[0]?.id) return { status: 'missing', source: null, bars: [] };
  const payload = await driveDownloadJson(driveContext.token, files[0].id);
  const bars = extractBarArray(payload, symbol).map(normalizeBar).filter(Boolean);
  bars.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { status: bars.length ? 'ok' : 'missing', source: `gdrive:${files[0].name}`, bars };
}

async function loadBars(symbol, driveContext) {
  const local = loadLocalBars(symbol);
  if (local.status === 'ok') return local;
  return loadDriveBars(symbol, driveContext);
}

function sma(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trueRange(current, previous) {
  if (!previous) return current.high - current.low;
  return Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
}

function averageTrueRange(bars, window) {
  if (bars.length < window + 1) return null;
  const slice = bars.slice(-window);
  const startIndex = bars.length - window;
  const ranges = slice.map((bar, idx) => trueRange(bar, bars[startIndex + idx - 1]));
  return sma(ranges);
}

function recentSwingLows(bars, lookback) {
  const recent = bars.slice(-lookback);
  const swings = [];
  for (let i = 1; i < recent.length - 1; i += 1) {
    if (recent[i].low <= recent[i - 1].low && recent[i].low <= recent[i + 1].low) swings.push(recent[i]);
  }
  return swings;
}

function nearestSupportBelow(bars, price, lookback) {
  const swings = recentSwingLows(bars, lookback).filter((bar) => bar.low < price);
  if (swings.length > 0) return swings.reduce((best, bar) => (bar.low > best.low ? bar : best));
  return bars.slice(-lookback).reduce((best, bar) => (bar.low > best.low && bar.low < price ? bar : best), { low: 0, date: null });
}

function validateStructure(row, bars, policy) {
  const price = numberOrNull(row.price);
  const requiredStop = numberOrNull(row.currentEntryRequiredStopPrice);
  if (!row.currentEntryRecalcFeasible) {
    return { verdict: 'NOT_RECALC_CANDIDATE', reasons: ['recalc_not_feasible'], ...basicBarPayload(row, bars, policy) };
  }
  if (!bars.length) return { verdict: 'STRUCTURE_DATA_MISSING', reasons: ['ohlcv_bars_missing'] };
  if (bars.length < policy.minBars) return { verdict: 'STRUCTURE_DATA_INSUFFICIENT', reasons: [`bars_lt_${policy.minBars}`] };
  if (price == null || requiredStop == null) return { verdict: 'STRUCTURE_INPUT_MISSING', reasons: ['price_or_required_stop_missing'] };
  return validateWithBars(row, bars, policy, price, requiredStop);
}

function basicBarPayload(row, bars, policy) {
  if (!bars.length) return {};
  const latest = bars[bars.length - 1];
  const price = numberOrNull(row.price);
  const requiredStop = numberOrNull(row.currentEntryRequiredStopPrice);
  const atr = averageTrueRange(bars, policy.atrWindow);
  const stopAtr = price != null && requiredStop != null && atr ? (price - requiredStop) / atr : null;
  const driftPct = price != null ? Math.abs(((latest.close - price) / price) * 100) : null;
  return {
    latestBarDate: latest.date,
    latestClose: Number(latest.close.toFixed(4)),
    atr14: atr == null ? null : Number(atr.toFixed(4)),
    stopAtr: stopAtr == null ? null : Number(stopAtr.toFixed(2)),
    priceDriftPct: driftPct == null ? null : Number(driftPct.toFixed(2))
  };
}

function validateWithBars(row, bars, policy, price, requiredStop) {
  const atr = averageTrueRange(bars, policy.atrWindow);
  const latest = bars[bars.length - 1];
  if (atr == null || atr <= 0) return { verdict: 'STRUCTURE_ATR_UNAVAILABLE', reasons: ['atr_unavailable'] };
  const support = nearestSupportBelow(bars, price, policy.swingLookback);
  const stopAtr = (price - requiredStop) / atr;
  const driftPct = Math.abs(((latest.close - price) / price) * 100);
  const reasons = structureReasons({ row, price, requiredStop, latest, atr, support, stopAtr, driftPct, policy });
  const verdict = reasons.length === 0 ? 'STRUCTURE_CONFIRMED_RECALC_CANDIDATE' : `STRUCTURE_REJECT_${reasons[0].toUpperCase()}`;
  return structurePayload(verdict, reasons, { latest, atr, support, stopAtr, driftPct });
}

function structureReasons(input) {
  const { requiredStop, latest, atr, support, stopAtr, driftPct, policy } = input;
  const reasons = [];
  const sma20 = sma(input.row._close20 || []);
  if (driftPct > policy.maxPriceDriftPct) reasons.push('price_drift_high');
  if (stopAtr < policy.minStopAtr || stopAtr > policy.maxStopAtr) reasons.push('stop_atr_out_of_band');
  if (!support?.date || support.low <= 0) reasons.push('support_missing');
  if (support?.low > 0 && requiredStop > support.low) reasons.push('stop_above_support');
  const supportGapAtr = support?.low > 0 ? (support.low - requiredStop) / atr : null;
  if (supportGapAtr != null && supportGapAtr > policy.supportBufferAtr) reasons.push('stop_too_far_below_support');
  if (sma20 != null && latest.close < sma20) reasons.push('close_below_sma20');
  return reasons;
}

function structurePayload(verdict, reasons, metrics) {
  const { latest, atr, support, stopAtr, driftPct } = metrics;
  return {
    verdict,
    reasons,
    latestBarDate: latest.date,
    latestClose: Number(latest.close.toFixed(4)),
    atr14: Number(atr.toFixed(4)),
    stopAtr: Number(stopAtr.toFixed(2)),
    supportDate: support?.date ?? null,
    supportLow: support?.low ? Number(support.low.toFixed(4)) : null,
    priceDriftPct: Number(driftPct.toFixed(2))
  };
}

function attachMovingAverages(row, bars) {
  const closes = bars.map((bar) => bar.close);
  return {
    ...row,
    _close20: closes.slice(-20),
    sma20: closes.length >= 20 ? Number(sma(closes.slice(-20)).toFixed(4)) : null,
    sma50: closes.length >= 50 ? Number(sma(closes.slice(-50)).toFixed(4)) : null
  };
}

async function buildRows(stage6Audit, driveContext) {
  const policy = getPolicy();
  const rows = [];
  for (const candidate of candidateRows(stage6Audit)) {
    const barsData = await loadBars(candidate.symbol, driveContext);
    const row = attachMovingAverages(candidate, barsData.bars);
    const structure = validateStructure(row, barsData.bars, policy);
    rows.push(normalizeOutputRow(row, barsData, structure));
  }
  return rows;
}

function normalizeOutputRow(row, barsData, structure) {
  return {
    stage6File: row.sourceStage6File,
    symbol: row.symbol,
    decisionReason: row.decisionReason,
    blockerClass: row.blockerClass,
    price: row.price,
    entry: row.entry,
    target: row.target,
    stop: row.stop,
    rrAtCurrentPrice: row.rrAtCurrentPrice,
    targetBufferFromCurrentPct: row.targetBufferFromCurrentPct,
    currentEntryRequiredStopPrice: row.currentEntryRequiredStopPrice,
    currentEntryRequiredStopDistancePct: row.currentEntryRequiredStopDistancePct,
    currentEntryRecalcFeasible: row.currentEntryRecalcFeasible,
    barsStatus: barsData.status,
    barsSource: barsData.source,
    barsCount: barsData.bars.length,
    sma20: row.sma20,
    sma50: row.sma50,
    ...structure
  };
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || 'UNKNOWN';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

async function buildReport(stage6Audit) {
  const driveContext = await buildDriveContext().catch((error) => ({ status: 'failed', reason: error.message }));
  const rows = await buildRows(stage6Audit, driveContext);
  return {
    generatedAt: new Date().toISOString(),
    sourceAudit: process.env.CURRENT_ENTRY_STRUCTURE_INPUT || DEFAULT_INPUT,
    latestStage6File: rows[0]?.stage6File || null,
    dataPolicy: {
      priceSource: 'Stage6 price field for current-entry geometry; local OHLCV JSON for ATR/support when available',
      adjustment: 'OHLCV adjustment is inherited from upstream harvester/local file; this audit does not rewrite or forward-fill bars',
      timezone: 'OHLCV dates are treated as US regular trading sessions; generatedAt is UTC ISO8601'
    },
    driveFetch: {
      status: driveContext.status,
      reason: driveContext.reason || null
    },
    policy: getPolicy(),
    summary: {
      rows: rows.length,
      recentRuns: Math.max(1, Math.round(parseNumberEnv('CURRENT_ENTRY_STRUCTURE_RECENT_RUNS', 10))),
      stage6Files: countBy(rows, 'stage6File'),
      verdicts: countBy(rows, 'verdict'),
      barsStatus: countBy(rows, 'barsStatus')
    },
    rows
  };
}

function markdownTable(rows) {
  const lines = [];
  lines.push('| Symbol | Reason | Verdict | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Bars | Source |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const row of rows) lines.push(markdownRow(row));
  return lines;
}

function markdownRow(row) {
  return `| ${escapeCell(row.symbol)} | ${escapeCell(row.decisionReason)} | ${escapeCell(row.verdict)} | ${escapeCell((row.reasons || []).join(','))} | ${formatNumber(row.price)} | ${formatNumber(row.currentEntryRequiredStopPrice)} | ${formatNumber(row.currentEntryRequiredStopDistancePct)} | ${formatNumber(row.rrAtCurrentPrice)} | ${formatNumber(row.targetBufferFromCurrentPct)} | ${formatNumber(row.atr14)} | ${formatNumber(row.stopAtr)} | ${formatNumber(row.supportLow)} | ${row.barsCount} | ${escapeCell(row.barsSource || 'N/A')} |`;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Current Entry Structure Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source: ${report.sourceAudit}`);
  lines.push(`- Latest Stage6: ${report.latestStage6File || 'N/A'}`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Recent Runs: ${report.summary.recentRuns}`);
  lines.push(`- Price Source: ${report.dataPolicy.priceSource}`);
  lines.push(`- Adjustment: ${report.dataPolicy.adjustment}`);
  lines.push(`- Timezone: ${report.dataPolicy.timezone}`);
  lines.push(`- Drive OHLCV Fetch: ${report.driveFetch.status}${report.driveFetch.reason ? ` (${report.driveFetch.reason})` : ''}`);
  lines.push('');
  lines.push('## Verdict Counts');
  lines.push('');
  lines.push('| Verdict | Count |');
  lines.push('| --- | ---: |');
  for (const [key, count] of Object.entries(report.summary.verdicts)) lines.push(`| ${escapeCell(key)} | ${count} |`);
  lines.push('');
  lines.push('## Stage6 File Counts');
  lines.push('');
  lines.push('| Stage6 File | Count |');
  lines.push('| --- | ---: |');
  for (const [key, count] of Object.entries(report.summary.stage6Files)) lines.push(`| ${escapeCell(key)} | ${count} |`);
  lines.push('');
  lines.push('## Latest Candidates');
  lines.push('');
  lines.push(...markdownTable(report.rows));
  lines.push('');
  lines.push('## Policy');
  lines.push('');
  lines.push('- This audit does not authorize orders. It only decides whether a current-entry recalculated stop has enough OHLCV structure support to be reviewed.');
  lines.push('- `STRUCTURE_DATA_MISSING` means the correct next fix is OHLCV handoff into Stage6/audit, not wider sidecar chasing.');
  lines.push('- A candidate can only progress toward execution review after `STRUCTURE_CONFIRMED_RECALC_CANDIDATE`, and still needs sidecar preflight, idempotency, market-open, and broker submission gates.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  loadEnvFile(path.resolve(REPO_ROOT, '.env'));
  loadEnvFile(path.resolve(REPO_ROOT, '.env.local'));
  const input = process.env.CURRENT_ENTRY_STRUCTURE_INPUT || DEFAULT_INPUT;
  const outJson = process.env.CURRENT_ENTRY_STRUCTURE_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.CURRENT_ENTRY_STRUCTURE_OUT_MD || DEFAULT_OUT_MD;
  const report = await buildReport(readJson(input, {}));
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(`[CURRENT_ENTRY_STRUCTURE_AUDIT] rows=${report.summary.rows} verdicts=${JSON.stringify(report.summary.verdicts)} json=${outJson} md=${outMd}`);
}

main().catch((error) => {
  console.error(`[CURRENT_ENTRY_STRUCTURE_AUDIT] failed: ${error.stack || error.message}`);
  process.exit(1);
});
