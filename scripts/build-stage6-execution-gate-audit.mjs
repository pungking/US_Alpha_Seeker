#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_OUT_JSON = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_EXECUTION_GATE_AUDIT_2026-05-09.md';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] != null && process.env[key] !== '') continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function parseBool(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function walkFiles(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositiveNumber(...values) {
  for (const value of values) {
    const n = toOptionalNumber(value);
    if (n != null && n > 0) return n;
  }
  return null;
}

function normalizeText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (['N/A', 'NA', 'NULL', 'UNDEFINED', 'TBD'].includes(upper)) return null;
  return text;
}

function normalizeSymbol(value) {
  const text = normalizeText(value);
  return text ? text.replace(/[^A-Za-z0-9.\-]/g, '').toUpperCase() : null;
}

function hashText(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
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
  if (!response.ok || !json?.access_token) {
    throw new Error(`google_token_refresh_failed(${response.status})`);
  }
  return json.access_token;
}

async function driveList(token, query, fields, orderBy = 'modifiedTime desc', pageSize = 20) {
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', query);
  url.searchParams.set('fields', fields);
  url.searchParams.set('orderBy', orderBy);
  url.searchParams.set('pageSize', String(pageSize));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`drive_list_failed(${response.status}): ${JSON.stringify(json).slice(0, 200)}`);
  }
  return Array.isArray(json.files) ? json.files : [];
}

async function fetchDriveStage6Files() {
  const fetchDrive = parseBool(process.env.STAGE6_AUDIT_FETCH_DRIVE, true);
  const rootFolderId = process.env.GDRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!fetchDrive || !rootFolderId) return { status: 'skipped', reason: fetchDrive ? 'missing_root_folder' : 'disabled', files: [] };
  const token = await refreshGoogleAccessToken();
  if (!token) return { status: 'skipped', reason: 'missing_oauth_env', files: [] };
  const limit = Math.max(1, Math.min(50, Math.round(parseNumber(process.env.STAGE6_AUDIT_DRIVE_LIMIT, 12))));
  const outDir = path.resolve(REPO_ROOT, process.env.STAGE6_AUDIT_DRIVE_CACHE_DIR || 'state/stage6-audit-source');
  fs.mkdirSync(outDir, { recursive: true });
  const folders = await driveList(
    token,
    `name = 'Stage6_Alpha_Final' and '${rootFolderId}' in parents and trashed = false and mimeType = '${FOLDER_MIME_TYPE}'`,
    'files(id,name,modifiedTime)',
    'modifiedTime desc',
    5
  );
  const folderId = folders[0]?.id;
  if (!folderId) return { status: 'skipped', reason: 'stage6_folder_not_found', files: [] };
  const files = await driveList(
    token,
    `name contains 'STAGE6_ALPHA_FINAL_' and '${folderId}' in parents and trashed = false`,
    'files(id,name,modifiedTime,size)',
    'modifiedTime desc',
    limit
  );
  const downloaded = [];
  for (const file of files) {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`drive_download_failed(${response.status}): ${file.name}`);
    const outPath = path.join(outDir, file.name);
    fs.writeFileSync(outPath, text, 'utf8');
    downloaded.push({ ...file, path: outPath, sha256: hashText(text) });
  }
  return { status: 'ok', reason: 'downloaded', files: downloaded };
}

function collectInputRoots() {
  const raw = process.env.STAGE6_AUDIT_INPUT_ROOTS;
  const defaults = [
    'state/stage6-audit-source',
    'state',
    '/tmp/us_alpha_stage6_audit/drive',
    '/tmp/us_alpha_stage6_audit/us'
  ];
  const roots = raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : defaults;
  return roots.map((root) => (path.isAbsolute(root) ? root : path.resolve(REPO_ROOT, root)));
}

function loadNotionRows(files) {
  const rowsByKey = new Map();
  for (const file of files) {
    if (path.basename(file) !== 'notion-pipeline-sync-payload.json') continue;
    const payload = readJson(file);
    if (!payload) continue;
    const stage6File = normalizeText(payload.stage6File) || 'unknown_stage6';
    const appendRows = (group, rows) => {
      if (!Array.isArray(rows)) return;
      for (const row of rows) {
        const symbol = normalizeSymbol(row?.symbol);
        if (!symbol) continue;
        rowsByKey.set(`${stage6File}:${symbol}`, { group, row });
      }
    };
    appendRows('notion_executable', payload.executablePicks);
    appendRows('notion_watchlist', payload.watchlist);
    appendRows('notion_final', payload.finalPicks);
  }
  return rowsByKey;
}

function extractRowsFromStage6(filePath, payload, notionRows) {
  const fileName = path.basename(filePath);
  const contract = payload?.execution_contract || {};
  const manifest = payload?.manifest || {};
  const groups = [
    ['executable', contract.executablePicks],
    ['modelTop6', contract.modelTop6],
    ['watchlist', contract.watchlistTop],
    ['alpha_candidates', payload?.alpha_candidates]
  ];
  const bySymbol = new Map();
  for (const [group, list] of groups) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const symbol = normalizeSymbol(row?.symbol);
      if (!symbol) continue;
      const existing = bySymbol.get(symbol) || { groups: new Set(), rows: [] };
      existing.groups.add(group);
      existing.rows.push({ group, row });
      bySymbol.set(symbol, existing);
    }
  }

  const pickRow = (rows) => {
    const priority = ['executable', 'modelTop6', 'watchlist', 'alpha_candidates'];
    for (const group of priority) {
      const found = rows.find((item) => item.group === group);
      if (found) return found.row;
    }
    return rows[0]?.row || {};
  };

  const out = [];
  for (const [symbol, bundle] of bySymbol.entries()) {
    const row = pickRow(bundle.rows);
    const notion = notionRows.get(`${fileName}:${symbol}`)?.row || null;
    const price = toPositiveNumber(row?.price, row?.currentPrice, row?.lastPrice, notion?.price);
    const entry = toPositiveNumber(row?.entryExecPrice, row?.entryPrice, row?.entryAnchorPrice, notion?.entryPrice);
    const target = toPositiveNumber(row?.targetPrice, row?.targetMeanPrice, notion?.targetPrice);
    const stop = toPositiveNumber(row?.stopPrice, row?.stopLoss, row?.ictStopLoss, notion?.stopLoss);
    const rr = toOptionalNumber(row?.riskRewardRatioValue) ?? (entry && target && stop && entry > stop ? (target - entry) / (entry - stop) : null);
    const expectedReturnPct = toOptionalNumber(row?.expectedReturnPct) ?? toOptionalNumber(notion?.expectedReturnPct);
    const entryDistancePct =
      toOptionalNumber(row?.entryDistancePct) ??
      toOptionalNumber(notion?.entryDistancePct) ??
      (price && entry ? Math.abs(price - entry) / price * 100 : null);
    const targetUpsideFromPricePct = price && target ? ((target - price) / price) * 100 : null;
    const stopRiskFromEntryPct = entry && stop ? ((entry - stop) / entry) * 100 : null;
    const finalDecision = normalizeText(row?.finalDecision || notion?.finalDecision) || 'UNKNOWN';
    const decisionReason = normalizeText(row?.decisionReason || notion?.decisionReason || row?.executionReason) || 'unknown';
    const executionBucket = normalizeText(row?.executionBucket || notion?.executionBucket) || 'UNKNOWN';
    const executionReason = normalizeText(row?.executionReason || notion?.executionReason) || 'UNKNOWN';
    const earningsDaysToEvent = toOptionalNumber(row?.earningsDaysToEvent ?? notion?.earningsDaysToEvent ?? row?.techMetrics?.daysToEarnings);
    const verdict = normalizeText(row?.aiVerdict || row?.verdictFinal || row?.finalVerdict || notion?.aiVerdict || row?.verdict) || 'UNKNOWN';
    const qualityScore = toOptionalNumber(row?.qualityScore ?? notion?.qualityScore);
    const executionScore = toOptionalNumber(row?.executionScore ?? notion?.executionScore);
    const convictionScore = toOptionalNumber(row?.convictionScore ?? notion?.convictionScore);
    out.push({
      stage6File: fileName,
      stage6ModifiedTime: manifest?.generatedAt || contract?.generatedAt || null,
      symbol,
      groups: [...bundle.groups].sort(),
      verdict,
      finalDecision,
      decisionReason,
      executionBucket,
      executionReason,
      price,
      entry,
      target,
      stop,
      rr: rr == null ? null : Number(rr.toFixed(2)),
      expectedReturnPct: expectedReturnPct == null ? null : Number(expectedReturnPct.toFixed(2)),
      entryDistancePct: entryDistancePct == null ? null : Number(entryDistancePct.toFixed(2)),
      targetUpsideFromPricePct: targetUpsideFromPricePct == null ? null : Number(targetUpsideFromPricePct.toFixed(2)),
      stopRiskFromEntryPct: stopRiskFromEntryPct == null ? null : Number(stopRiskFromEntryPct.toFixed(2)),
      earningsDaysToEvent,
      qualityScore,
      executionScore,
      convictionScore,
      stage6Tier: normalizeText(row?.stage6Tier) || null,
      trendAlignment: normalizeText(row?.trendAlignment || row?.stage6TrendAlignment || row?.techMetrics?.trendAlignment) || null,
      verdictConflict: Boolean(row?.verdictConflict),
      stateVerdictConflict: Boolean(row?.stateVerdictConflict),
      hasNotionPrice: Boolean(notion?.price),
      sourcePath: path.relative(REPO_ROOT, filePath)
    });
  }
  return out;
}

function classifyRow(row) {
  const reason = String(row.decisionReason || '').toLowerCase();
  if (String(row.finalDecision).toUpperCase() === 'EXECUTABLE_NOW') {
    return { class: 'EXECUTABLE', severity: 'ok', fixLane: 'sidecar_fillability' };
  }
  if (reason === 'wait_pullback_not_reached') {
    const severeDistance = row.entryDistancePct != null && row.entryDistancePct > 10;
    return {
      class: severeDistance ? 'ENTRY_MODEL_TOO_DEEP' : 'CONSERVATIVE_PULLBACK_WAIT',
      severity: severeDistance ? 'high' : 'medium',
      fixLane: severeDistance ? 'entry_model_recalibration' : 'sidecar_reprice_or_watch'
    };
  }
  if (reason === 'wait_earnings_data_missing_quality_floor') {
    const near = (row.rr ?? 0) >= 2.5 && (row.expectedReturnPct ?? 0) >= 8 && (row.entryDistancePct ?? 999) <= 6;
    return {
      class: near ? 'DATA_POLICY_OVERBLOCK' : 'EARNINGS_MISSING_CONSERVATIVE_WAIT',
      severity: near ? 'high' : 'medium',
      fixLane: near ? 'earnings_missing_threshold_policy' : 'earnings_data_collection'
    };
  }
  if (reason === 'wait_earnings_data_missing') {
    const otherwiseStrong = (row.rr ?? 0) >= 2 && (row.expectedReturnPct ?? 0) >= 8;
    return {
      class: otherwiseStrong ? 'EARNINGS_DATA_GAP' : 'EARNINGS_MISSING_CONSERVATIVE_WAIT',
      severity: otherwiseStrong ? 'high' : 'medium',
      fixLane: 'earnings_data_collection'
    };
  }
  if (reason === 'blocked_earnings_window') {
    return { class: 'NORMAL_EVENT_BLACKOUT', severity: 'ok', fixLane: 'none_unless_date_wrong' };
  }
  if (reason === 'blocked_stop_too_tight') {
    const highRr = (row.rr ?? 0) >= 5;
    return {
      class: highRr ? 'GEOMETRY_POLICY_REVIEW' : 'NORMAL_RISK_BLOCK',
      severity: highRr ? 'medium' : 'ok',
      fixLane: highRr ? 'stop_floor_or_tick_buffer_review' : 'none'
    };
  }
  if (reason === 'blocked_quality_verdict_unusable') {
    return { class: 'VERDICT_NORMALIZATION_BLOCK', severity: 'high', fixLane: 'verdict_contract_normalization' };
  }
  if (reason === 'blocked_rr_below_min') {
    return { class: 'NORMAL_RR_BLOCK', severity: 'ok', fixLane: 'none' };
  }
  return { class: 'OTHER_BLOCK', severity: 'medium', fixLane: 'inspect' };
}

function buildRunSummaries(rows) {
  const byRun = new Map();
  for (const row of rows) {
    const info = byRun.get(row.stage6File) || { stage6File: row.stage6File, total: 0, executable: 0, reasonCounts: {}, classes: {}, rows: [] };
    info.total += 1;
    if (row.finalDecision === 'EXECUTABLE_NOW') info.executable += 1;
    info.reasonCounts[row.decisionReason] = (info.reasonCounts[row.decisionReason] || 0) + 1;
    info.classes[row.blockerClass] = (info.classes[row.blockerClass] || 0) + 1;
    info.rows.push(row);
    byRun.set(row.stage6File, info);
  }
  return [...byRun.values()].sort((a, b) => b.stage6File.localeCompare(a.stage6File)).map((run) => {
    const zeroExecutable = run.executable === 0;
    const overblockCount = (run.classes.DATA_POLICY_OVERBLOCK || 0) + (run.classes.ENTRY_MODEL_TOO_DEEP || 0) + (run.classes.VERDICT_NORMALIZATION_BLOCK || 0);
    const normalSafetyCount = (run.classes.NORMAL_EVENT_BLACKOUT || 0) + (run.classes.NORMAL_RISK_BLOCK || 0) + (run.classes.NORMAL_RR_BLOCK || 0);
    const verdict = !zeroExecutable
      ? 'HAS_EXECUTABLE'
      : overblockCount > 0
        ? 'MODEL_OR_DATA_POLICY_ERROR'
        : normalSafetyCount >= Math.max(1, Math.ceil(run.total * 0.6))
          ? 'NORMAL_CONSERVATIVE_FILTER'
          : 'MIXED_REVIEW_REQUIRED';
    return { ...run, zeroExecutable, overblockCount, normalSafetyCount, verdict };
  });
}

function formatNumber(value, suffix = '') {
  return value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${Number(value).toFixed(2)}${suffix}`;
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Execution Gate Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source files: ${report.summary.stage6Files}`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Zero executable runs: ${report.summary.zeroExecutableRuns}`);
  lines.push(`- Overall verdict: **${report.summary.overallVerdict}**`);
  lines.push('');
  lines.push('## Run Verdicts');
  lines.push('');
  lines.push('| Stage6 File | Rows | Exec | Verdict | Top Reasons |');
  lines.push('| --- | ---: | ---: | --- | --- |');
  for (const run of report.runSummaries) {
    const topReasons = Object.entries(run.reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => `${key}:${count}`)
      .join(', ');
    lines.push(`| ${mdEscape(run.stage6File)} | ${run.total} | ${run.executable} | ${run.verdict} | ${mdEscape(topReasons)} |`);
  }
  lines.push('');
  lines.push('## Candidate Blocker Table');
  lines.push('');
  lines.push('| File | Symbol | Decision | Reason | ER% | RR | Dist% | Price | Entry | Target | Stop | EarningsD | Class | Fix Lane |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows.slice(0, 120)) {
    lines.push([
      mdEscape(row.stage6File),
      mdEscape(row.symbol),
      mdEscape(row.finalDecision),
      mdEscape(row.decisionReason),
      formatNumber(row.expectedReturnPct),
      formatNumber(row.rr),
      formatNumber(row.entryDistancePct),
      formatNumber(row.price),
      formatNumber(row.entry),
      formatNumber(row.target),
      formatNumber(row.stop),
      row.earningsDaysToEvent == null ? 'N/A' : String(row.earningsDaysToEvent),
      mdEscape(row.blockerClass),
      mdEscape(row.fixLane)
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('## Policy Decision');
  lines.push('');
  lines.push('- `EXECUTABLE_NOW`가 0개인 run 중 `DATA_POLICY_OVERBLOCK` 또는 `ENTRY_MODEL_TOO_DEEP`가 있으면 정상적인 보수 필터가 아니라 Stage6 정책/모델 설계 문제로 판정한다.');
  lines.push('- 실적일이 진짜 임박한 `blocked_earnings_window`는 정상 차단이다. 단, null 실적일이 0으로 직렬화되면 잘못된 D-0 표시/판정이 되므로 optional number 직렬화는 반드시 null-safe여야 한다.');
  lines.push('- 진입거리 초과가 반복되면 sidecar chase 폭을 키우는 방식이 아니라 Stage6 진입가 산출/브레이크아웃 lane 재설계를 우선한다.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  loadEnvFile(path.resolve(REPO_ROOT, '.env'));
  const driveFetch = await fetchDriveStage6Files().catch((error) => ({ status: 'failed', reason: error.message, files: [] }));
  const roots = collectInputRoots();
  const files = roots.flatMap(walkFiles);
  const notionRows = loadNotionRows(files);
  const stage6Files = files
    .filter((file) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(path.basename(file)))
    .sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  const seen = new Set();
  const rows = [];
  for (const file of stage6Files) {
    const fileName = path.basename(file);
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    const payload = readJson(file);
    if (!payload) continue;
    rows.push(...extractRowsFromStage6(file, payload, notionRows));
  }
  const classifiedRows = rows.map((row) => {
    const cls = classifyRow(row);
    return { ...row, blockerClass: cls.class, severity: cls.severity, fixLane: cls.fixLane };
  }).sort((a, b) => b.stage6File.localeCompare(a.stage6File) || a.symbol.localeCompare(b.symbol));
  const runSummaries = buildRunSummaries(classifiedRows);
  const zeroExecutableRuns = runSummaries.filter((run) => run.zeroExecutable).length;
  const designErrorRuns = runSummaries.filter((run) => run.verdict === 'MODEL_OR_DATA_POLICY_ERROR').length;
  const overallVerdict = designErrorRuns > 0 ? 'MODEL_OR_DATA_POLICY_ERROR' : zeroExecutableRuns > 0 ? 'MIXED_OR_CONSERVATIVE' : 'HAS_EXECUTABLES';
  const report = {
    generatedAt: new Date().toISOString(),
    driveFetch,
    summary: {
      stage6Files: seen.size,
      rows: classifiedRows.length,
      zeroExecutableRuns,
      designErrorRuns,
      overallVerdict
    },
    runSummaries: runSummaries.map(({ rows: _rows, ...run }) => run),
    rows: classifiedRows
  };
  const outJson = process.env.STAGE6_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(`[STAGE6_EXEC_AUDIT] files=${report.summary.stage6Files} rows=${report.summary.rows} zeroExec=${zeroExecutableRuns} designError=${designErrorRuns} verdict=${overallVerdict}`);
  console.log(`[STAGE6_EXEC_AUDIT] json=${outJson} md=${outMd} drive=${driveFetch.status}:${driveFetch.reason}`);
}

main().catch((error) => {
  console.error(`[STAGE6_EXEC_AUDIT_ERROR] ${error?.stack || error?.message || error}`);
  process.exit(1);
});
