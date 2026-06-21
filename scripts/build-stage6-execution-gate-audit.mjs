#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_OUT_JSON = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_EXECUTION_GATE_AUDIT_2026-05-09.md';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DEFAULT_ZERO_EXECUTABLE_WINDOW = 10;
const DEFAULT_MAX_CONSECUTIVE_ZERO_EXECUTABLE_RUNS = 3;
const DEFAULT_MAX_RECENT_ZERO_EXECUTABLE_RUNS = 5;
const DEFAULT_ACTIONABLE_VERDICTS = ['BUY', 'STRONG_BUY', 'STRONGBUY'];

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

function getCurrentEntryPolicy() {
  const minRr = parseNumber(process.env.STAGE6_AUDIT_CURRENT_ENTRY_MIN_RR ?? process.env.VITE_STAGE6_CURRENT_ENTRY_MIN_RR, 1.8);
  const minTargetBufferPct = parseNumber(
    process.env.STAGE6_AUDIT_CURRENT_ENTRY_MIN_TARGET_BUFFER_PCT ?? process.env.VITE_STAGE6_CURRENT_ENTRY_MIN_TARGET_BUFFER_PCT,
    2
  );
  const minStopDistancePct = parseNumber(
    process.env.STAGE6_AUDIT_CURRENT_ENTRY_MIN_STOP_DISTANCE_PCT ?? process.env.VITE_STAGE6_MIN_STOP_DISTANCE_PCT,
    1.5
  );
  const maxStopDistancePct = parseNumber(
    process.env.STAGE6_AUDIT_CURRENT_ENTRY_MAX_STOP_DISTANCE_PCT ?? process.env.VITE_STAGE6_MAX_STOP_DISTANCE_PCT,
    22
  );
  return { minRr, minTargetBufferPct, minStopDistancePct, maxStopDistancePct };
}

function deriveCurrentEntryRecalc(row, metrics) {
  const explicitStop = toOptionalNumber(row?.currentEntryRequiredStopPrice ?? row?.currentEntryRecalcStopPrice);
  const explicitStopDistance = toOptionalNumber(row?.currentEntryRequiredStopDistancePct ?? row?.currentEntryRecalcStopDistancePct);
  const explicitFeasible = typeof row?.currentEntryRecalcFeasible === 'boolean' ? row.currentEntryRecalcFeasible : null;
  const policy = getCurrentEntryPolicy();
  const { price, target, stop, targetBufferFromCurrentPct } = metrics;
  const requiredStopPrice =
    explicitStop ??
    (price && target && target > price && policy.minRr > 0
      ? price - ((target - price) / policy.minRr)
      : null);
  const requiredStopDistancePct =
    explicitStopDistance ??
    (price && requiredStopPrice && requiredStopPrice > 0 && requiredStopPrice < price
      ? ((price - requiredStopPrice) / price) * 100
      : null);
  const feasible =
    explicitFeasible ??
    Boolean(
      price &&
      target &&
      stop &&
      requiredStopPrice &&
      requiredStopDistancePct != null &&
      requiredStopPrice > stop &&
      requiredStopPrice < price &&
      targetBufferFromCurrentPct != null &&
      targetBufferFromCurrentPct >= policy.minTargetBufferPct &&
      requiredStopDistancePct >= policy.minStopDistancePct &&
      requiredStopDistancePct <= policy.maxStopDistancePct
    );
  return {
    currentEntryRequiredStopPrice: requiredStopPrice == null ? null : Number(requiredStopPrice.toFixed(4)),
    currentEntryRequiredStopDistancePct: requiredStopDistancePct == null ? null : Number(requiredStopDistancePct.toFixed(2)),
    currentEntryRecalcFeasible: feasible
  };
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


function normalizeReasonArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function extractCurrentEntryStructure(row, fallback = {}) {
  const verdict = normalizeText(row?.currentEntryStructureVerdict ?? row?.structureVerdict ?? row?.currentEntryStructure?.verdict ?? fallback?.currentEntryStructureVerdict);
  const reasons = normalizeReasonArray(row?.currentEntryStructureReasons ?? row?.currentEntryStructure?.reasons ?? fallback?.currentEntryStructureReasons);
  const confirmed = Boolean(
    row?.currentEntryStructureConfirmed === true ||
    row?.currentEntryStructure?.confirmed === true ||
    fallback?.currentEntryStructureConfirmed === true ||
    verdict === 'STRUCTURE_CONFIRMED_RECALC_CANDIDATE'
  );
  return { verdict, confirmed, reasons };
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

function inferFinalDecision(row) {
  const explicit = normalizeText(row?.finalDecision || row?.decisionCode);
  if (explicit) return explicit;
  const bucket = String(row?.executionBucket || '').toUpperCase();
  const reason = String(row?.decisionReason || row?.executionReason || '').toLowerCase();
  if (bucket === 'EXECUTABLE' || reason.startsWith('executable_')) return 'EXECUTABLE_NOW';
  if (reason.startsWith('wait_')) return 'WAIT_PRICE';
  if (reason.startsWith('blocked_earnings') || reason.includes('event')) return 'BLOCKED_EVENT';
  if (reason.startsWith('blocked_')) return 'BLOCKED_RISK';
  return 'UNKNOWN';
}

function extractRowsFromNotionPipelinePayload(filePath, payload) {
  const stage6File = normalizeText(payload?.stage6File) || `notion-pipeline-sync:${path.basename(filePath)}`;
  const groups = [
    ['notion_executable', payload?.executablePicks],
    ['notion_watchlist', payload?.watchlist],
    ['notion_final', payload?.finalPicks]
  ];
  const out = [];
  const seenSymbols = new Set();
  for (const [group, list] of groups) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      const symbol = normalizeSymbol(row?.symbol);
      if (!symbol || seenSymbols.has(symbol)) continue;
      seenSymbols.add(symbol);
      const price = toPositiveNumber(row?.price, row?.currentPrice, row?.lastPrice);
      const entry = toPositiveNumber(row?.entryExecPrice, row?.entryPrice, row?.entryAnchorPrice);
      const target = toPositiveNumber(row?.targetPrice, row?.targetMeanPrice);
      const stop = toPositiveNumber(row?.stopPrice, row?.stopLoss, row?.ictStopLoss);
      const rr = toOptionalNumber(row?.riskRewardRatioValue) ?? (entry && target && stop && entry > stop ? (target - entry) / (entry - stop) : null);
      const expectedReturnPct = toOptionalNumber(row?.expectedReturnPct);
      const entryDistancePct =
        toOptionalNumber(row?.entryDistancePct) ??
        (price && entry ? Math.abs(price - entry) / price * 100 : null);
      const targetUpsideFromPricePct = price && target ? ((target - price) / price) * 100 : null;
      const stopRiskFromEntryPct = entry && stop ? ((entry - stop) / entry) * 100 : null;
      const rrAtCurrentPrice =
        toOptionalNumber(row?.rrAtCurrentPrice) ??
        (price && target && stop && price > stop && target > price ? (target - price) / (price - stop) : null);
      const targetBufferFromCurrentPct =
        toOptionalNumber(row?.targetBufferFromCurrentPct) ??
        (targetUpsideFromPricePct == null ? null : targetUpsideFromPricePct);
      const currentPriceStopDistancePct =
        toOptionalNumber(row?.currentPriceStopDistancePct) ??
        (price && stop ? ((price - stop) / price) * 100 : null);
      const currentEntryRecalc = deriveCurrentEntryRecalc(row, {
        price,
        target,
        stop,
        targetBufferFromCurrentPct
      });
      const currentEntryStructure = extractCurrentEntryStructure(row);
      out.push({
        stage6File,
        stage6ModifiedTime: payload?.runDateIso || payload?.generatedAt || null,
        symbol,
        groups: [group],
        verdict: normalizeText(row?.aiVerdict || row?.verdictFinal || row?.finalVerdict || row?.verdict) || 'UNKNOWN',
        finalDecision: inferFinalDecision(row),
        decisionReason: normalizeText(row?.decisionReason || row?.executionReason) || 'unknown',
        executionBucket: normalizeText(row?.executionBucket) || 'UNKNOWN',
        executionReason: normalizeText(row?.executionReason) || 'UNKNOWN',
        price,
        entry,
        target,
        stop,
        rr: rr == null ? null : Number(rr.toFixed(2)),
        expectedReturnPct: expectedReturnPct == null ? null : Number(expectedReturnPct.toFixed(2)),
        entryDistancePct: entryDistancePct == null ? null : Number(entryDistancePct.toFixed(2)),
        targetUpsideFromPricePct: targetUpsideFromPricePct == null ? null : Number(targetUpsideFromPricePct.toFixed(2)),
        stopRiskFromEntryPct: stopRiskFromEntryPct == null ? null : Number(stopRiskFromEntryPct.toFixed(2)),
        earningsDaysToEvent: toOptionalNumber(row?.earningsDaysToEvent ?? row?.techMetrics?.daysToEarnings),
        qualityScore: toOptionalNumber(row?.qualityScore),
        executionScore: toOptionalNumber(row?.executionScore),
        convictionScore: toOptionalNumber(row?.convictionScore),
        stage6Tier: normalizeText(row?.stage6Tier) || null,
        chosenPlanType: normalizeText(row?.chosenPlanType) || null,
        entryTactic: normalizeText(row?.entryTactic) || null,
        rrAtCurrentPrice: rrAtCurrentPrice == null ? null : Number(rrAtCurrentPrice.toFixed(2)),
        targetBufferFromCurrentPct: targetBufferFromCurrentPct == null ? null : Number(targetBufferFromCurrentPct.toFixed(2)),
        currentPriceStopDistancePct: currentPriceStopDistancePct == null ? null : Number(currentPriceStopDistancePct.toFixed(2)),
        currentEntryRequiredStopPrice: currentEntryRecalc.currentEntryRequiredStopPrice,
        currentEntryRequiredStopDistancePct: currentEntryRecalc.currentEntryRequiredStopDistancePct,
        currentEntryRecalcFeasible: currentEntryRecalc.currentEntryRecalcFeasible,
        currentEntryStructureVerdict: currentEntryStructure.verdict,
        currentEntryStructureConfirmed: currentEntryStructure.confirmed,
        currentEntryStructureReasons: currentEntryStructure.reasons,
        structurePolicyVerdict: normalizeText(row?.structurePolicyVerdict ?? row?.structurePolicy?.verdict),
        structurePolicyReviewReady: Boolean(row?.structurePolicyReviewReady ?? row?.structurePolicy?.reviewReady),
        structurePolicyFormulaEvidenceBasis: normalizeText(row?.structurePolicyFormulaEvidenceBasis ?? row?.structurePolicy?.formulaEvidenceBasis),
        structurePolicyFormulaObservedValue: toOptionalNumber(row?.structurePolicyFormulaObservedValue ?? row?.structurePolicy?.formulaObservedValue),
        structurePolicyFormulaThresholdValue: toOptionalNumber(row?.structurePolicyFormulaThresholdValue ?? row?.structurePolicy?.formulaThresholdValue),
        structurePolicyFormulaDeltaValue: toOptionalNumber(row?.structurePolicyFormulaDeltaValue ?? row?.structurePolicy?.formulaDeltaValue),
        structurePolicyFormulaUnit: normalizeText(row?.structurePolicyFormulaUnit ?? row?.structurePolicy?.formulaUnit),
        structurePolicyReasons: normalizeReasonArray(row?.structurePolicyReasons ?? row?.structurePolicy?.reasons),
        structurePolicyRecommendedAction: normalizeText(row?.structurePolicyRecommendedAction ?? row?.structurePolicy?.recommendedAction),
        breakoutRetestProofVerdict: normalizeText(row?.breakoutRetestProofVerdict ?? row?.breakoutRetestProof?.verdict),
        breakoutRetestProofConfirmed: Boolean(row?.breakoutRetestProofConfirmed ?? row?.breakoutRetestProof?.confirmed),
        breakoutRetestProofReviewReady: Boolean(row?.breakoutRetestProofReviewReady ?? row?.breakoutRetestProof?.reviewReady),
        breakoutRetestProofReasons: normalizeReasonArray(row?.breakoutRetestProofReasons ?? row?.breakoutRetestProof?.reasons),
        breakoutRetestProofRetestLevel: toOptionalNumber(row?.breakoutRetestProofRetestLevel ?? row?.breakoutRetestProof?.retestLevel),
        breakoutRetestProofBarsSinceRetest: toOptionalNumber(row?.breakoutRetestProofBarsSinceRetest ?? row?.breakoutRetestProof?.barsSinceRetest),
        breakoutRetestProofCurrentExtensionPct: toOptionalNumber(row?.breakoutRetestProofCurrentExtensionPct ?? row?.breakoutRetestProof?.currentExtensionFromRetestPct),
        breakoutRetestProofTolerancePct: toOptionalNumber(row?.breakoutRetestProofTolerancePct ?? row?.breakoutRetestProof?.tolerancePct),
        breakoutRetestProofMaxBarsSinceRetest: toOptionalNumber(row?.breakoutRetestProofMaxBarsSinceRetest ?? row?.breakoutRetestProof?.maxBarsSinceRetest),
        breakoutRetestProofMaxExtensionPct: toOptionalNumber(row?.breakoutRetestProofMaxExtensionPct ?? row?.breakoutRetestProof?.maxCurrentExtensionFromRetestPct),
        breakoutRetestProofRetestTouchFound: Boolean(row?.breakoutRetestProofRetestTouchFound ?? row?.breakoutRetestProof?.retestTouchFound),
        breakoutRetestProofRetestFresh: Boolean(row?.breakoutRetestProofRetestFresh ?? row?.breakoutRetestProof?.retestFresh),
        breakoutRetestProofCurrentExtensionOk: Boolean(row?.breakoutRetestProofCurrentExtensionOk ?? row?.breakoutRetestProof?.currentExtensionOk),
        breakoutRetestProofLatestCloseAboveRetest: Boolean(row?.breakoutRetestProofLatestCloseAboveRetest ?? row?.breakoutRetestProof?.latestCloseAboveRetest),
        breakoutRetestPromotionVerdict: normalizeText(row?.breakoutRetestPromotionVerdict ?? row?.breakoutRetestPromotion?.verdict),
        breakoutRetestPromotionEligible: Boolean(row?.breakoutRetestPromotionEligible ?? row?.breakoutRetestPromotion?.eligible),
        breakoutRetestPromotionEnabled: Boolean(row?.breakoutRetestPromotionEnabled ?? row?.breakoutRetestPromotion?.enabled),
        breakoutRetestPromotionReasons: normalizeReasonArray(row?.breakoutRetestPromotionReasons ?? row?.breakoutRetestPromotion?.reasons),
        breakoutRetestPromotionRecommendedAction: normalizeText(row?.breakoutRetestPromotionRecommendedAction ?? row?.breakoutRetestPromotion?.recommendedAction),
        targetRecalibrationVerdict: normalizeText(row?.targetRecalibrationVerdict ?? row?.targetRecalibrationPolicy?.verdict),
        targetRecalibrationRequired: Boolean(row?.targetRecalibrationRequired ?? row?.targetRecalibrationPolicy?.recalibrationRequired),
        targetNoChaseRequired: Boolean(row?.targetNoChaseRequired ?? row?.targetRecalibrationPolicy?.noChaseRequired),
        targetRecalibrationCurrentTargetPrice: toOptionalNumber(row?.targetRecalibrationCurrentTargetPrice ?? row?.targetRecalibrationPolicy?.currentTargetPrice),
        targetRecalibrationRequiredTargetPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetPrice ?? row?.targetRecalibrationPolicy?.requiredTargetPrice),
        targetRecalibrationRequiredTargetByBufferPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetByBufferPrice ?? row?.targetRecalibrationPolicy?.requiredTargetByBufferPrice),
        targetRecalibrationRequiredTargetByRrPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetByRrPrice ?? row?.targetRecalibrationPolicy?.requiredTargetByRrPrice),
        targetRecalibrationRequiredTargetBufferPct: toOptionalNumber(row?.targetRecalibrationRequiredTargetBufferPct ?? row?.targetRecalibrationPolicy?.requiredTargetBufferPct),
        targetRecalibrationRequiredRr: toOptionalNumber(row?.targetRecalibrationRequiredRr ?? row?.targetRecalibrationPolicy?.requiredRr),
        targetRecalibrationCurrentTargetGapPct: toOptionalNumber(row?.targetRecalibrationCurrentTargetGapPct ?? row?.targetRecalibrationPolicy?.currentTargetGapPct),
        targetRecalibrationSourcePrice: toOptionalNumber(row?.targetRecalibrationSourcePrice ?? row?.targetRecalibrationPolicy?.sourcePrice),
        targetRecalibrationSourceStopPrice: toOptionalNumber(row?.targetRecalibrationSourceStopPrice ?? row?.targetRecalibrationPolicy?.sourceStopPrice),
        targetRecalibrationStopDistanceAtCurrent: toOptionalNumber(row?.targetRecalibrationStopDistanceAtCurrent ?? row?.targetRecalibrationPolicy?.stopDistanceAtCurrent),
        targetRecalibrationCandidate: Boolean(row?.targetRecalibrationCandidate ?? row?.targetRecalibrationPolicy?.recalibrationCandidate),
        targetNoTradeConfirmed: Boolean(row?.targetNoTradeConfirmed ?? row?.targetRecalibrationPolicy?.noTradeConfirmed),
        targetRecalibrationViabilityVerdict: normalizeText(row?.targetRecalibrationViabilityVerdict ?? row?.targetRecalibrationPolicy?.viabilityVerdict),
        targetRecalibrationViabilityReasons: normalizeReasonArray(row?.targetRecalibrationViabilityReasons ?? row?.targetRecalibrationPolicy?.viabilityReasons),
        targetRecalibrationGapPolicyPct: toOptionalNumber(row?.targetRecalibrationGapPolicyPct ?? row?.targetRecalibrationPolicy?.gapPolicyPct),
        targetRecalibrationReasons: normalizeReasonArray(row?.targetRecalibrationReasons ?? row?.targetRecalibrationPolicy?.reasons),
        targetRecalibrationRecommendedAction: normalizeText(row?.targetRecalibrationRecommendedAction ?? row?.targetRecalibrationPolicy?.recommendedAction),
        riskGeometryPolicyVerdict: normalizeText(row?.riskGeometryPolicyVerdict ?? row?.riskGeometryPolicy?.verdict),
        riskGeometryRecalibrationRequired: Boolean(row?.riskGeometryRecalibrationRequired ?? row?.riskGeometryPolicy?.recalibrationRequired),
        riskGeometryNoTradeRequired: Boolean(row?.riskGeometryNoTradeRequired ?? row?.riskGeometryPolicy?.noTradeRequired),
        riskGeometryRecalculatedStopCandidate: Boolean(row?.riskGeometryRecalculatedStopCandidate ?? row?.riskGeometryPolicy?.recalculatedStopCandidate),
        riskGeometryProofVerdict: normalizeText(row?.riskGeometryProofVerdict ?? row?.riskGeometryPolicy?.proofVerdict),
        riskGeometryRecalculatedStopPrice: toOptionalNumber(row?.riskGeometryRecalculatedStopPrice ?? row?.riskGeometryPolicy?.recalculatedStopPrice),
        riskGeometryRecalculatedStopDistancePct: toOptionalNumber(row?.riskGeometryRecalculatedStopDistancePct ?? row?.riskGeometryPolicy?.recalculatedStopDistancePct),
        riskGeometryRrAtRecalculatedStop: toOptionalNumber(row?.riskGeometryRrAtRecalculatedStop ?? row?.riskGeometryPolicy?.rrAtRecalculatedStop),
        riskGeometryTargetBufferPct: toOptionalNumber(row?.riskGeometryTargetBufferPct ?? row?.riskGeometryPolicy?.targetBufferPct),
        riskGeometryProofReasons: normalizeReasonArray(row?.riskGeometryProofReasons ?? row?.riskGeometryPolicy?.proofReasons),
        riskGeometryReasons: normalizeReasonArray(row?.riskGeometryReasons ?? row?.riskGeometryPolicy?.reasons),
        riskGeometryRecommendedAction: normalizeText(row?.riskGeometryRecommendedAction ?? row?.riskGeometryPolicy?.recommendedAction),
        zeroExecutableTuningLane: normalizeText(row?.zeroExecutableTuningLane ?? row?.zeroExecutableTuning?.lane),
        zeroExecutableTuningVerdict: normalizeText(row?.zeroExecutableTuningVerdict ?? row?.zeroExecutableTuning?.verdict),
        zeroExecutablePrimaryTuningTarget: Boolean(row?.zeroExecutablePrimaryTuningTarget ?? row?.zeroExecutableTuning?.primaryTuningTarget),
        zeroExecutableTuningReasons: normalizeReasonArray(row?.zeroExecutableTuningReasons ?? row?.zeroExecutableTuning?.reasons),
        zeroExecutableTuningRecommendedAction: normalizeText(row?.zeroExecutableTuningRecommendedAction ?? row?.zeroExecutableTuning?.recommendedAction),
        zeroExecutableFormulaBottleneck: normalizeText(row?.zeroExecutableFormulaBottleneck ?? row?.zeroExecutableFormula?.bottleneck),
        zeroExecutableFormulaSeverity: toOptionalNumber(row?.zeroExecutableFormulaSeverity ?? row?.zeroExecutableFormula?.severity),
        zeroExecutableTargetShortfallPct: toOptionalNumber(row?.zeroExecutableTargetShortfallPct ?? row?.zeroExecutableFormula?.targetShortfallPct),
        zeroExecutableRiskTargetShortfallPct: toOptionalNumber(row?.zeroExecutableRiskTargetShortfallPct ?? row?.zeroExecutableFormula?.riskTargetShortfallPct),
        zeroExecutableBreakoutProofGapCount: toOptionalNumber(row?.zeroExecutableBreakoutProofGapCount ?? row?.zeroExecutableFormula?.breakoutProofGapCount),
        zeroExecutableStructureProofGapCount: toOptionalNumber(row?.zeroExecutableStructureProofGapCount ?? row?.zeroExecutableFormula?.structureProofGapCount),
        zeroExecutableFormulaObservedValue: toOptionalNumber(row?.zeroExecutableFormulaObservedValue ?? row?.zeroExecutableFormula?.observedValue),
        zeroExecutableFormulaThresholdValue: toOptionalNumber(row?.zeroExecutableFormulaThresholdValue ?? row?.zeroExecutableFormula?.thresholdValue),
        zeroExecutableFormulaDeltaValue: toOptionalNumber(row?.zeroExecutableFormulaDeltaValue ?? row?.zeroExecutableFormula?.deltaValue),
        zeroExecutableFormulaUnit: normalizeText(row?.zeroExecutableFormulaUnit ?? row?.zeroExecutableFormula?.unit),
        zeroExecutableFormulaEvidenceBasis: normalizeText(row?.zeroExecutableFormulaEvidenceBasis ?? row?.zeroExecutableFormula?.evidenceBasis),
        zeroExecutableFormulaAdjustmentKnob: normalizeText(row?.zeroExecutableFormulaAdjustmentKnob ?? row?.zeroExecutableFormula?.adjustmentKnob),
        zeroExecutableFormulaAdjustmentDirection: normalizeText(row?.zeroExecutableFormulaAdjustmentDirection ?? row?.zeroExecutableFormula?.adjustmentDirection),
        zeroExecutableFormulaAdjustmentMagnitude: toOptionalNumber(row?.zeroExecutableFormulaAdjustmentMagnitude ?? row?.zeroExecutableFormula?.adjustmentMagnitude),
        zeroExecutableFormulaAdjustmentRationale: normalizeText(row?.zeroExecutableFormulaAdjustmentRationale ?? row?.zeroExecutableFormula?.adjustmentRationale),
        zeroExecutableFormulaReasons: normalizeReasonArray(row?.zeroExecutableFormulaReasons ?? row?.zeroExecutableFormula?.reasons),
        zeroExecutableFormulaRecommendedAction: normalizeText(row?.zeroExecutableFormulaRecommendedAction ?? row?.zeroExecutableFormula?.recommendedAction),
        tradePlanDecision: normalizeText(row?.tradePlanDecision) || null,
        tradePlanReason: normalizeText(row?.tradePlanReason) || null,
        trendAlignment: normalizeText(row?.trendAlignment || row?.stage6TrendAlignment || row?.techMetrics?.trendAlignment) || null,
        verdictConflict: Boolean(row?.verdictConflict),
        stateVerdictConflict: Boolean(row?.stateVerdictConflict),
        hasNotionPrice: Boolean(row?.price),
        sourcePath: path.relative(REPO_ROOT, filePath)
      });
    }
  }
  return out;
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
    // Final execution surfaces must override raw modelTop6 diagnostics.
    // Stage6 can downgrade raw EXECUTABLE_NOW rows after late geometry gates;
    // treating modelTop6 as higher priority makes audits report false payload
    // readiness.
    const priority = ['executable', 'alpha_candidates', 'watchlist', 'modelTop6'];
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
    const rrAtCurrentPrice =
      toOptionalNumber(row?.rrAtCurrentPrice ?? notion?.rrAtCurrentPrice) ??
      (price && target && stop && price > stop && target > price ? (target - price) / (price - stop) : null);
    const targetBufferFromCurrentPct =
      toOptionalNumber(row?.targetBufferFromCurrentPct ?? notion?.targetBufferFromCurrentPct) ??
      (targetUpsideFromPricePct == null ? null : targetUpsideFromPricePct);
    const currentPriceStopDistancePct =
      toOptionalNumber(row?.currentPriceStopDistancePct ?? notion?.currentPriceStopDistancePct) ??
      (price && stop ? ((price - stop) / price) * 100 : null);
    const currentEntryRecalc = deriveCurrentEntryRecalc({ ...notion, ...row }, {
      price,
      target,
      stop,
      targetBufferFromCurrentPct
    });
    const currentEntryStructure = extractCurrentEntryStructure(row, notion);
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
      chosenPlanType: normalizeText(row?.chosenPlanType || notion?.chosenPlanType) || null,
      entryTactic: normalizeText(row?.entryTactic || notion?.entryTactic) || null,
      rrAtCurrentPrice: rrAtCurrentPrice == null ? null : Number(rrAtCurrentPrice.toFixed(2)),
      targetBufferFromCurrentPct: targetBufferFromCurrentPct == null ? null : Number(targetBufferFromCurrentPct.toFixed(2)),
      currentPriceStopDistancePct: currentPriceStopDistancePct == null ? null : Number(currentPriceStopDistancePct.toFixed(2)),
      executionFeasibilityAtCurrent: normalizeText(row?.executionFeasibilityAtCurrent ?? notion?.executionFeasibilityAtCurrent) || null,
      executionFeasibilityAtCurrentVerdict: normalizeText(row?.executionFeasibilityAtCurrentVerdict ?? notion?.executionFeasibilityAtCurrentVerdict) || null,
      executionFeasibilityAtCurrentReason: normalizeText(row?.executionFeasibilityAtCurrentReason ?? notion?.executionFeasibilityAtCurrentReason) || null,
      executionFeasibilityAtCurrentRr: toOptionalNumber(row?.executionFeasibilityAtCurrentRr ?? notion?.executionFeasibilityAtCurrentRr),
      executionFeasibilityAtCurrentDistancePct: toOptionalNumber(row?.executionFeasibilityAtCurrentDistancePct ?? notion?.executionFeasibilityAtCurrentDistancePct),
      executionFeasibilityAtCurrentMaxDistancePct: toOptionalNumber(row?.executionFeasibilityAtCurrentMaxDistancePct ?? notion?.executionFeasibilityAtCurrentMaxDistancePct),
      currentEntryRequiredStopPrice: currentEntryRecalc.currentEntryRequiredStopPrice,
      currentEntryRequiredStopDistancePct: currentEntryRecalc.currentEntryRequiredStopDistancePct,
      currentEntryRecalcFeasible: currentEntryRecalc.currentEntryRecalcFeasible,
      currentEntryStructureVerdict: currentEntryStructure.verdict,
      currentEntryStructureConfirmed: currentEntryStructure.confirmed,
      currentEntryStructureReasons: currentEntryStructure.reasons,
      structurePolicyVerdict: normalizeText(row?.structurePolicyVerdict ?? notion?.structurePolicyVerdict ?? row?.structurePolicy?.verdict),
      structurePolicyReviewReady: Boolean(row?.structurePolicyReviewReady ?? notion?.structurePolicyReviewReady ?? row?.structurePolicy?.reviewReady),
      structurePolicyFormulaEvidenceBasis: normalizeText(row?.structurePolicyFormulaEvidenceBasis ?? notion?.structurePolicyFormulaEvidenceBasis ?? row?.structurePolicy?.formulaEvidenceBasis),
      structurePolicyFormulaObservedValue: toOptionalNumber(row?.structurePolicyFormulaObservedValue ?? notion?.structurePolicyFormulaObservedValue ?? row?.structurePolicy?.formulaObservedValue),
      structurePolicyFormulaThresholdValue: toOptionalNumber(row?.structurePolicyFormulaThresholdValue ?? notion?.structurePolicyFormulaThresholdValue ?? row?.structurePolicy?.formulaThresholdValue),
      structurePolicyFormulaDeltaValue: toOptionalNumber(row?.structurePolicyFormulaDeltaValue ?? notion?.structurePolicyFormulaDeltaValue ?? row?.structurePolicy?.formulaDeltaValue),
      structurePolicyFormulaUnit: normalizeText(row?.structurePolicyFormulaUnit ?? notion?.structurePolicyFormulaUnit ?? row?.structurePolicy?.formulaUnit),
      structurePolicyReasons: normalizeReasonArray(row?.structurePolicyReasons ?? notion?.structurePolicyReasons ?? row?.structurePolicy?.reasons),
      structurePolicyRecommendedAction: normalizeText(row?.structurePolicyRecommendedAction ?? notion?.structurePolicyRecommendedAction ?? row?.structurePolicy?.recommendedAction),
      breakoutRetestProofVerdict: normalizeText(row?.breakoutRetestProofVerdict ?? notion?.breakoutRetestProofVerdict ?? row?.breakoutRetestProof?.verdict),
      breakoutRetestProofConfirmed: Boolean(row?.breakoutRetestProofConfirmed ?? notion?.breakoutRetestProofConfirmed ?? row?.breakoutRetestProof?.confirmed),
      breakoutRetestProofReviewReady: Boolean(row?.breakoutRetestProofReviewReady ?? notion?.breakoutRetestProofReviewReady ?? row?.breakoutRetestProof?.reviewReady),
      breakoutRetestProofReasons: normalizeReasonArray(row?.breakoutRetestProofReasons ?? notion?.breakoutRetestProofReasons ?? row?.breakoutRetestProof?.reasons),
      breakoutRetestProofRetestLevel: toOptionalNumber(row?.breakoutRetestProofRetestLevel ?? notion?.breakoutRetestProofRetestLevel ?? row?.breakoutRetestProof?.retestLevel),
      breakoutRetestProofBarsSinceRetest: toOptionalNumber(row?.breakoutRetestProofBarsSinceRetest ?? notion?.breakoutRetestProofBarsSinceRetest ?? row?.breakoutRetestProof?.barsSinceRetest),
      breakoutRetestProofCurrentExtensionPct: toOptionalNumber(row?.breakoutRetestProofCurrentExtensionPct ?? notion?.breakoutRetestProofCurrentExtensionPct ?? row?.breakoutRetestProof?.currentExtensionFromRetestPct),
      breakoutRetestProofTolerancePct: toOptionalNumber(row?.breakoutRetestProofTolerancePct ?? notion?.breakoutRetestProofTolerancePct ?? row?.breakoutRetestProof?.tolerancePct),
      breakoutRetestProofMaxBarsSinceRetest: toOptionalNumber(row?.breakoutRetestProofMaxBarsSinceRetest ?? notion?.breakoutRetestProofMaxBarsSinceRetest ?? row?.breakoutRetestProof?.maxBarsSinceRetest),
      breakoutRetestProofMaxExtensionPct: toOptionalNumber(row?.breakoutRetestProofMaxExtensionPct ?? notion?.breakoutRetestProofMaxExtensionPct ?? row?.breakoutRetestProof?.maxCurrentExtensionFromRetestPct),
      breakoutRetestProofRetestTouchFound: Boolean(row?.breakoutRetestProofRetestTouchFound ?? notion?.breakoutRetestProofRetestTouchFound ?? row?.breakoutRetestProof?.retestTouchFound),
      breakoutRetestProofRetestFresh: Boolean(row?.breakoutRetestProofRetestFresh ?? notion?.breakoutRetestProofRetestFresh ?? row?.breakoutRetestProof?.retestFresh),
      breakoutRetestProofCurrentExtensionOk: Boolean(row?.breakoutRetestProofCurrentExtensionOk ?? notion?.breakoutRetestProofCurrentExtensionOk ?? row?.breakoutRetestProof?.currentExtensionOk),
      breakoutRetestProofLatestCloseAboveRetest: Boolean(row?.breakoutRetestProofLatestCloseAboveRetest ?? notion?.breakoutRetestProofLatestCloseAboveRetest ?? row?.breakoutRetestProof?.latestCloseAboveRetest),
      breakoutRetestPromotionVerdict: normalizeText(row?.breakoutRetestPromotionVerdict ?? notion?.breakoutRetestPromotionVerdict ?? row?.breakoutRetestPromotion?.verdict),
      breakoutRetestPromotionEligible: Boolean(row?.breakoutRetestPromotionEligible ?? notion?.breakoutRetestPromotionEligible ?? row?.breakoutRetestPromotion?.eligible),
      breakoutRetestPromotionEnabled: Boolean(row?.breakoutRetestPromotionEnabled ?? notion?.breakoutRetestPromotionEnabled ?? row?.breakoutRetestPromotion?.enabled),
      breakoutRetestPromotionReasons: normalizeReasonArray(row?.breakoutRetestPromotionReasons ?? notion?.breakoutRetestPromotionReasons ?? row?.breakoutRetestPromotion?.reasons),
      breakoutRetestPromotionRecommendedAction: normalizeText(row?.breakoutRetestPromotionRecommendedAction ?? notion?.breakoutRetestPromotionRecommendedAction ?? row?.breakoutRetestPromotion?.recommendedAction),
      targetRecalibrationVerdict: normalizeText(row?.targetRecalibrationVerdict ?? notion?.targetRecalibrationVerdict ?? row?.targetRecalibrationPolicy?.verdict),
      targetRecalibrationRequired: Boolean(row?.targetRecalibrationRequired ?? notion?.targetRecalibrationRequired ?? row?.targetRecalibrationPolicy?.recalibrationRequired),
      targetNoChaseRequired: Boolean(row?.targetNoChaseRequired ?? notion?.targetNoChaseRequired ?? row?.targetRecalibrationPolicy?.noChaseRequired),
      targetRecalibrationCurrentTargetPrice: toOptionalNumber(row?.targetRecalibrationCurrentTargetPrice ?? notion?.targetRecalibrationCurrentTargetPrice ?? row?.targetRecalibrationPolicy?.currentTargetPrice),
      targetRecalibrationRequiredTargetPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetPrice ?? notion?.targetRecalibrationRequiredTargetPrice ?? row?.targetRecalibrationPolicy?.requiredTargetPrice),
      targetRecalibrationRequiredTargetByBufferPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetByBufferPrice ?? notion?.targetRecalibrationRequiredTargetByBufferPrice ?? row?.targetRecalibrationPolicy?.requiredTargetByBufferPrice),
      targetRecalibrationRequiredTargetByRrPrice: toOptionalNumber(row?.targetRecalibrationRequiredTargetByRrPrice ?? notion?.targetRecalibrationRequiredTargetByRrPrice ?? row?.targetRecalibrationPolicy?.requiredTargetByRrPrice),
      targetRecalibrationRequiredTargetBufferPct: toOptionalNumber(row?.targetRecalibrationRequiredTargetBufferPct ?? notion?.targetRecalibrationRequiredTargetBufferPct ?? row?.targetRecalibrationPolicy?.requiredTargetBufferPct),
      targetRecalibrationRequiredRr: toOptionalNumber(row?.targetRecalibrationRequiredRr ?? notion?.targetRecalibrationRequiredRr ?? row?.targetRecalibrationPolicy?.requiredRr),
      targetRecalibrationCurrentTargetGapPct: toOptionalNumber(row?.targetRecalibrationCurrentTargetGapPct ?? notion?.targetRecalibrationCurrentTargetGapPct ?? row?.targetRecalibrationPolicy?.currentTargetGapPct),
      targetRecalibrationSourcePrice: toOptionalNumber(row?.targetRecalibrationSourcePrice ?? notion?.targetRecalibrationSourcePrice ?? row?.targetRecalibrationPolicy?.sourcePrice),
      targetRecalibrationSourceStopPrice: toOptionalNumber(row?.targetRecalibrationSourceStopPrice ?? notion?.targetRecalibrationSourceStopPrice ?? row?.targetRecalibrationPolicy?.sourceStopPrice),
      targetRecalibrationStopDistanceAtCurrent: toOptionalNumber(row?.targetRecalibrationStopDistanceAtCurrent ?? notion?.targetRecalibrationStopDistanceAtCurrent ?? row?.targetRecalibrationPolicy?.stopDistanceAtCurrent),
      targetRecalibrationCandidate: Boolean(row?.targetRecalibrationCandidate ?? notion?.targetRecalibrationCandidate ?? row?.targetRecalibrationPolicy?.recalibrationCandidate),
      targetNoTradeConfirmed: Boolean(row?.targetNoTradeConfirmed ?? notion?.targetNoTradeConfirmed ?? row?.targetRecalibrationPolicy?.noTradeConfirmed),
      targetRecalibrationViabilityVerdict: normalizeText(row?.targetRecalibrationViabilityVerdict ?? notion?.targetRecalibrationViabilityVerdict ?? row?.targetRecalibrationPolicy?.viabilityVerdict),
      targetRecalibrationViabilityReasons: normalizeReasonArray(row?.targetRecalibrationViabilityReasons ?? notion?.targetRecalibrationViabilityReasons ?? row?.targetRecalibrationPolicy?.viabilityReasons),
      targetRecalibrationGapPolicyPct: toOptionalNumber(row?.targetRecalibrationGapPolicyPct ?? notion?.targetRecalibrationGapPolicyPct ?? row?.targetRecalibrationPolicy?.gapPolicyPct),
      targetRecalibrationReasons: normalizeReasonArray(row?.targetRecalibrationReasons ?? notion?.targetRecalibrationReasons ?? row?.targetRecalibrationPolicy?.reasons),
      targetRecalibrationRecommendedAction: normalizeText(row?.targetRecalibrationRecommendedAction ?? notion?.targetRecalibrationRecommendedAction ?? row?.targetRecalibrationPolicy?.recommendedAction),
      riskGeometryPolicyVerdict: normalizeText(row?.riskGeometryPolicyVerdict ?? notion?.riskGeometryPolicyVerdict ?? row?.riskGeometryPolicy?.verdict),
      riskGeometryRecalibrationRequired: Boolean(row?.riskGeometryRecalibrationRequired ?? notion?.riskGeometryRecalibrationRequired ?? row?.riskGeometryPolicy?.recalibrationRequired),
      riskGeometryNoTradeRequired: Boolean(row?.riskGeometryNoTradeRequired ?? notion?.riskGeometryNoTradeRequired ?? row?.riskGeometryPolicy?.noTradeRequired),
      riskGeometryRecalculatedStopCandidate: Boolean(row?.riskGeometryRecalculatedStopCandidate ?? notion?.riskGeometryRecalculatedStopCandidate ?? row?.riskGeometryPolicy?.recalculatedStopCandidate),
      riskGeometryProofVerdict: normalizeText(row?.riskGeometryProofVerdict ?? notion?.riskGeometryProofVerdict ?? row?.riskGeometryPolicy?.proofVerdict),
      riskGeometryRecalculatedStopPrice: toOptionalNumber(row?.riskGeometryRecalculatedStopPrice ?? notion?.riskGeometryRecalculatedStopPrice ?? row?.riskGeometryPolicy?.recalculatedStopPrice),
      riskGeometryRecalculatedStopDistancePct: toOptionalNumber(row?.riskGeometryRecalculatedStopDistancePct ?? notion?.riskGeometryRecalculatedStopDistancePct ?? row?.riskGeometryPolicy?.recalculatedStopDistancePct),
      riskGeometryRrAtRecalculatedStop: toOptionalNumber(row?.riskGeometryRrAtRecalculatedStop ?? notion?.riskGeometryRrAtRecalculatedStop ?? row?.riskGeometryPolicy?.rrAtRecalculatedStop),
      riskGeometryTargetBufferPct: toOptionalNumber(row?.riskGeometryTargetBufferPct ?? notion?.riskGeometryTargetBufferPct ?? row?.riskGeometryPolicy?.targetBufferPct),
      riskGeometryProofReasons: normalizeReasonArray(row?.riskGeometryProofReasons ?? notion?.riskGeometryProofReasons ?? row?.riskGeometryPolicy?.proofReasons),
      riskGeometryReasons: normalizeReasonArray(row?.riskGeometryReasons ?? notion?.riskGeometryReasons ?? row?.riskGeometryPolicy?.reasons),
      riskGeometryRecommendedAction: normalizeText(row?.riskGeometryRecommendedAction ?? notion?.riskGeometryRecommendedAction ?? row?.riskGeometryPolicy?.recommendedAction),
      zeroExecutableTuningLane: normalizeText(row?.zeroExecutableTuningLane ?? notion?.zeroExecutableTuningLane ?? row?.zeroExecutableTuning?.lane),
      zeroExecutableTuningVerdict: normalizeText(row?.zeroExecutableTuningVerdict ?? notion?.zeroExecutableTuningVerdict ?? row?.zeroExecutableTuning?.verdict),
      zeroExecutablePrimaryTuningTarget: Boolean(row?.zeroExecutablePrimaryTuningTarget ?? notion?.zeroExecutablePrimaryTuningTarget ?? row?.zeroExecutableTuning?.primaryTuningTarget),
      zeroExecutableTuningReasons: normalizeReasonArray(row?.zeroExecutableTuningReasons ?? notion?.zeroExecutableTuningReasons ?? row?.zeroExecutableTuning?.reasons),
      zeroExecutableTuningRecommendedAction: normalizeText(row?.zeroExecutableTuningRecommendedAction ?? notion?.zeroExecutableTuningRecommendedAction ?? row?.zeroExecutableTuning?.recommendedAction),
      zeroExecutableFormulaBottleneck: normalizeText(row?.zeroExecutableFormulaBottleneck ?? notion?.zeroExecutableFormulaBottleneck ?? row?.zeroExecutableFormula?.bottleneck),
      zeroExecutableFormulaSeverity: toOptionalNumber(row?.zeroExecutableFormulaSeverity ?? notion?.zeroExecutableFormulaSeverity ?? row?.zeroExecutableFormula?.severity),
      zeroExecutableTargetShortfallPct: toOptionalNumber(row?.zeroExecutableTargetShortfallPct ?? notion?.zeroExecutableTargetShortfallPct ?? row?.zeroExecutableFormula?.targetShortfallPct),
      zeroExecutableRiskTargetShortfallPct: toOptionalNumber(row?.zeroExecutableRiskTargetShortfallPct ?? notion?.zeroExecutableRiskTargetShortfallPct ?? row?.zeroExecutableFormula?.riskTargetShortfallPct),
      zeroExecutableBreakoutProofGapCount: toOptionalNumber(row?.zeroExecutableBreakoutProofGapCount ?? notion?.zeroExecutableBreakoutProofGapCount ?? row?.zeroExecutableFormula?.breakoutProofGapCount),
      zeroExecutableStructureProofGapCount: toOptionalNumber(row?.zeroExecutableStructureProofGapCount ?? notion?.zeroExecutableStructureProofGapCount ?? row?.zeroExecutableFormula?.structureProofGapCount),
      zeroExecutableFormulaObservedValue: toOptionalNumber(row?.zeroExecutableFormulaObservedValue ?? notion?.zeroExecutableFormulaObservedValue ?? row?.zeroExecutableFormula?.observedValue),
      zeroExecutableFormulaThresholdValue: toOptionalNumber(row?.zeroExecutableFormulaThresholdValue ?? notion?.zeroExecutableFormulaThresholdValue ?? row?.zeroExecutableFormula?.thresholdValue),
      zeroExecutableFormulaDeltaValue: toOptionalNumber(row?.zeroExecutableFormulaDeltaValue ?? notion?.zeroExecutableFormulaDeltaValue ?? row?.zeroExecutableFormula?.deltaValue),
      zeroExecutableFormulaUnit: normalizeText(row?.zeroExecutableFormulaUnit ?? notion?.zeroExecutableFormulaUnit ?? row?.zeroExecutableFormula?.unit),
      zeroExecutableFormulaEvidenceBasis: normalizeText(row?.zeroExecutableFormulaEvidenceBasis ?? notion?.zeroExecutableFormulaEvidenceBasis ?? row?.zeroExecutableFormula?.evidenceBasis),
      zeroExecutableFormulaAdjustmentKnob: normalizeText(row?.zeroExecutableFormulaAdjustmentKnob ?? notion?.zeroExecutableFormulaAdjustmentKnob ?? row?.zeroExecutableFormula?.adjustmentKnob),
      zeroExecutableFormulaAdjustmentDirection: normalizeText(row?.zeroExecutableFormulaAdjustmentDirection ?? notion?.zeroExecutableFormulaAdjustmentDirection ?? row?.zeroExecutableFormula?.adjustmentDirection),
      zeroExecutableFormulaAdjustmentMagnitude: toOptionalNumber(row?.zeroExecutableFormulaAdjustmentMagnitude ?? notion?.zeroExecutableFormulaAdjustmentMagnitude ?? row?.zeroExecutableFormula?.adjustmentMagnitude),
      zeroExecutableFormulaAdjustmentRationale: normalizeText(row?.zeroExecutableFormulaAdjustmentRationale ?? notion?.zeroExecutableFormulaAdjustmentRationale ?? row?.zeroExecutableFormula?.adjustmentRationale),
      zeroExecutableFormulaReasons: normalizeReasonArray(row?.zeroExecutableFormulaReasons ?? notion?.zeroExecutableFormulaReasons ?? row?.zeroExecutableFormula?.reasons),
      zeroExecutableFormulaRecommendedAction: normalizeText(row?.zeroExecutableFormulaRecommendedAction ?? notion?.zeroExecutableFormulaRecommendedAction ?? row?.zeroExecutableFormula?.recommendedAction),
      tradePlanDecision: normalizeText(row?.tradePlanDecision || notion?.tradePlanDecision) || null,
      tradePlanReason: normalizeText(row?.tradePlanReason || notion?.tradePlanReason) || null,
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
  if (reason === 'wait_pullback_too_deep_valid_thesis') {
    return {
      class: 'ENTRY_MODEL_TOO_DEEP',
      severity: 'high',
      fixLane: 'entry_model_recalibration'
    };
  }
  if (reason === 'wait_breakout_retest_required') {
    if (row.breakoutRetestPromotionVerdict) {
      return {
        class: row.breakoutRetestPromotionEligible ? 'BREAKOUT_PROOF_CONFIRMED_REVIEW' : 'BREAKOUT_RETEST_REQUIRED',
        severity: row.breakoutRetestPromotionEligible ? 'medium' : 'high',
        fixLane: row.breakoutRetestPromotionEligible
          ? 'stage6_breakout_proof_confirmed_policy_gate'
          : 'stage6_breakout_retest_proof_confirmation'
      };
    }
    return {
      class: 'BREAKOUT_RETEST_REQUIRED',
      severity: 'high',
      fixLane: 'stage6_breakout_retest_proof_confirmation'
    };
  }
  if (reason === 'wait_current_rr_below_min') {
    if (row.currentEntryRecalcFeasible) {
      return {
        class: 'CURRENT_STOP_RECALC_REQUIRED',
        severity: 'high',
        fixLane: 'stage6_current_entry_stop_recalibration'
      };
    }
    return {
      class: 'CURRENT_RR_BAD',
      severity: 'medium',
      fixLane: 'no_chase_current_price_or_recompute_trade_box'
    };
  }
  if (reason === 'wait_current_distance_above_adaptive') {
    return {
      class: 'CURRENT_DISTANCE_ABOVE_ADAPTIVE_BAND',
      severity: 'medium',
      fixLane: 'stage6_entry_distance_or_reprice_policy'
    };
  }
  if (reason === 'wait_verdict_not_sidecar_actionable') {
    return {
      class: 'NON_ACTIONABLE_VERDICT_WAIT',
      severity: 'high',
      fixLane: 'stage6_sidecar_actionable_verdict_contract'
    };
  }
  if (reason === 'wait_target_near_current') {
    return {
      class: row.targetNoChaseRequired ? 'TARGET_RECALIBRATION_OR_NO_TRADE' : 'TARGET_ALREADY_NEAR_CURRENT',
      severity: 'medium',
      fixLane: 'target_recalibration_or_no_trade'
    };
  }
  if (reason === 'wait_pullback_not_reached') {
    const severeDistance = row.entryDistancePct != null && row.entryDistancePct > 10;
    if (severeDistance && row.currentEntryRecalcFeasible) {
      return {
        class: 'CURRENT_STOP_RECALC_REQUIRED',
        severity: 'high',
        fixLane: 'stage6_current_entry_stop_recalibration'
      };
    }
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
    if (row.currentEntryRecalcFeasible) {
      return {
        class: 'CURRENT_STOP_RECALC_REQUIRED',
        severity: 'high',
        fixLane: 'stage6_current_entry_stop_recalibration'
      };
    }
    return { class: 'NORMAL_RR_BLOCK', severity: 'ok', fixLane: 'none' };
  }
  if (reason === 'wait_structure_confirmation_required') {
    if (row.structurePolicyVerdict) {
      return {
        class: row.structurePolicyReviewReady ? 'STRUCTURE_CONFIRMATION_OVERBLOCK_REVIEW' : 'STRUCTURE_CONFIRMATION_REQUIRED',
        severity: row.structurePolicyReviewReady ? 'medium' : 'high',
        fixLane: row.structurePolicyReviewReady
          ? 'stage6_structure_proof_policy_review'
          : 'current_entry_structure_validation'
      };
    }
    return {
      class: 'STRUCTURE_CONFIRMATION_REQUIRED',
      severity: 'high',
      fixLane: 'current_entry_structure_validation'
    };
  }
  if (reason === 'wait_recalculated_stop_required') {
    return {
      class: 'CURRENT_STOP_RECALC_REQUIRED',
      severity: 'high',
      fixLane: 'stage6_current_entry_stop_recalibration'
    };
  }
  return { class: 'OTHER_BLOCK', severity: 'medium', fixLane: 'inspect' };
}

function isBuyOrStrongBuy(row) {
  const verdict = String(row?.verdict || '').trim().toUpperCase();
  return verdict === 'BUY' || verdict === 'STRONG_BUY' || verdict === 'STRONGBUY';
}

function getActionableVerdicts() {
  const raw = process.env.STAGE6_AUDIT_ACTIONABLE_VERDICTS || DEFAULT_ACTIONABLE_VERDICTS.join(',');
  const values = raw
    .split(',')
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);
  return values.length > 0 ? new Set(values) : new Set(DEFAULT_ACTIONABLE_VERDICTS);
}

function isActionableVerdict(row, actionableVerdicts = getActionableVerdicts()) {
  return actionableVerdicts.has(String(row?.verdict || '').trim().toUpperCase());
}

function classifyEntryDistance(row) {
  const distance = toOptionalNumber(row?.entryDistancePct);
  if (distance == null) return 'DISTANCE_UNKNOWN';
  if (distance <= 6) return 'DISTANCE_EXECUTION_WINDOW';
  if (distance <= 12) return 'DISTANCE_MODERATE_WAIT';
  return 'DISTANCE_DEEP_PULLBACK';
}

function assessTradeGeometry(row) {
  const price = toOptionalNumber(row?.price);
  const entry = toOptionalNumber(row?.entry);
  const target = toOptionalNumber(row?.target);
  const stop = toOptionalNumber(row?.stop);
  const reasons = [];
  if (entry == null) reasons.push('missing_entry');
  if (target == null) reasons.push('missing_target');
  if (stop == null) reasons.push('missing_stop');
  if (price == null) reasons.push('missing_current_price');
  if (reasons.length > 0) return { status: 'MISSING_GEOMETRY', reasons };
  if (!(target > entry)) reasons.push('target_not_above_entry');
  if (!(entry > stop)) reasons.push('entry_not_above_stop');
  if (!(target > price)) reasons.push('target_not_above_current');
  if (!(price > stop)) reasons.push('current_not_above_stop');
  return {
    status: reasons.length > 0 ? 'INVALID_OR_STALE_GEOMETRY' : 'VALID_GEOMETRY',
    reasons
  };
}

function classifyCurrentRr(row) {
  const rr = toOptionalNumber(row?.rrAtCurrentPrice);
  const targetBuffer = toOptionalNumber(row?.targetBufferFromCurrentPct);
  const geometry = assessTradeGeometry(row);
  if (geometry.status === 'MISSING_GEOMETRY') return 'RR_CURRENT_UNKNOWN_GEOMETRY_MISSING';
  if (geometry.reasons.includes('target_not_above_current')) return 'RR_CURRENT_TARGET_ALREADY_REACHED';
  if (geometry.reasons.includes('current_not_above_stop')) return 'RR_CURRENT_STOP_INVALID';
  if (rr == null) return 'RR_CURRENT_UNKNOWN';
  if (rr >= 1.8 && (targetBuffer == null || targetBuffer >= 2)) return 'RR_CURRENT_ACCEPTABLE';
  return 'RR_CURRENT_WEAK';
}

function classifyWatchlistOnlyAction(row, actionableVerdicts = getActionableVerdicts()) {
  const decision = String(row?.finalDecision || '').toUpperCase();
  const reason = String(row?.decisionReason || '').toLowerCase();
  if (decision === 'EXECUTABLE_NOW' && !isActionableVerdict(row, actionableVerdicts)) return 'EXECUTABLE_NON_ACTIONABLE_VERDICT_REVIEW';
  if (decision === 'EXECUTABLE_NOW') return 'EXECUTABLE_ACTIONABLE_NO_ACTION';
  if (!isBuyOrStrongBuy(row)) return 'NON_BUY_VERDICT_REVIEW';
  if (reason === 'wait_breakout_retest_required') {
    return row.breakoutRetestPromotionEligible
      ? 'BREAKOUT_PROOF_CONFIRMED_POLICY_GATE'
      : 'BREAKOUT_RETEST_PROOF_REQUIRED';
  }
  if (reason === 'wait_current_distance_above_adaptive') return 'CURRENT_ENTRY_DISTANCE_REVIEW';
  if (reason === 'wait_structure_confirmation_required') {
    return row.structurePolicyReviewReady ? 'STRUCTURE_POLICY_REVIEW_READY' : 'STRUCTURE_CONFIRMATION_REQUIRED';
  }
  if (reason === 'wait_earnings_data_missing_quality_floor' || reason === 'wait_earnings_data_missing') {
    return 'EARNINGS_DATA_FRESHNESS_REVIEW';
  }
  if (reason === 'wait_target_near_current') return 'TARGET_RECALIBRATION_NO_CHASE_REQUIRED';
  if (reason.startsWith('blocked_quality_')) return 'QUALITY_VERDICT_NORMALIZATION_REVIEW';
  if (reason.startsWith('blocked_stop_') || reason.startsWith('blocked_rr_')) return 'RISK_GEOMETRY_REVIEW';
  return 'MANUAL_STAGE6_POLICY_REVIEW';
}

function deriveZeroExecutableTuningLane(row) {
  const explicit = normalizeText(row?.zeroExecutableTuningLane);
  if (explicit) return explicit;
  const reason = String(row?.decisionReason || '').toLowerCase();
  if (reason === 'wait_target_near_current' || row?.targetRecalibrationRequired === true) {
    return 'TARGET_RECALIBRATION';
  }
  if (row?.riskGeometryRecalculatedStopCandidate) return 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION';
  if (
    row?.riskGeometryRecalibrationRequired ||
    reason === 'blocked_stop_too_tight' ||
    reason === 'blocked_stop_too_wide' ||
    reason === 'blocked_rr_below_min' ||
    reason === 'wait_current_rr_below_min' ||
    reason === 'wait_recalculated_stop_required'
  ) {
    return row?.riskGeometryNoTradeRequired
      ? 'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION'
      : 'STOP_TARGET_RISK_GEOMETRY_RECALCULATION';
  }
  if (reason === 'wait_breakout_retest_required') return 'BREAKOUT_PROOF_CONFIRMED_GENERATION';
  if (reason === 'wait_structure_confirmation_required') return 'STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION';
  return 'NO_ZERO_EXECUTABLE_TUNING_ACTION';
}

function isPrimaryZeroExecutableTuningLane(lane) {
  return [
    'TARGET_RECALIBRATION',
    'STOP_TARGET_RISK_GEOMETRY_RECALCULATION',
    'RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION',
    'BREAKOUT_PROOF_CONFIRMED_GENERATION'
  ].includes(String(lane || '').toUpperCase());
}

function incrementCount(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

function buildRunSummaries(rows, actionableVerdicts = getActionableVerdicts()) {
  const byRun = new Map();
  for (const row of rows) {
    const info = byRun.get(row.stage6File) || {
      stage6File: row.stage6File,
      total: 0,
      executable: 0,
      executableActionable: 0,
      executableNonActionable: 0,
      waitPrice: 0,
      buyStrongBuyRows: 0,
      actionableRows: 0,
      buyStrongBuyWatchlist: 0,
      confirmationGateRows: 0,
      reasonCounts: {},
      classes: {},
      geometryCounts: {},
      currentRrCounts: {},
      entryDistanceCounts: {},
      watchlistActionCounts: {},
      zeroExecutableTuningLaneCounts: {},
      zeroExecutablePrimaryTuningTargets: 0,
      rows: []
    };
    info.total += 1;
    if (row.finalDecision === 'EXECUTABLE_NOW') info.executable += 1;
    if (isActionableVerdict(row, actionableVerdicts)) info.actionableRows += 1;
    if (row.finalDecision === 'EXECUTABLE_NOW' && isActionableVerdict(row, actionableVerdicts)) info.executableActionable += 1;
    if (row.finalDecision === 'EXECUTABLE_NOW' && !isActionableVerdict(row, actionableVerdicts)) info.executableNonActionable += 1;
    if (String(row.finalDecision || '').toUpperCase() === 'WAIT_PRICE') info.waitPrice += 1;
    if (isBuyOrStrongBuy(row)) info.buyStrongBuyRows += 1;
    if (isBuyOrStrongBuy(row) && String(row.executionBucket || '').toUpperCase() !== 'EXECUTABLE') {
      info.buyStrongBuyWatchlist += 1;
    }
    const reason = String(row.decisionReason || '').toLowerCase();
    if (reason === 'wait_structure_confirmation_required' || reason === 'wait_breakout_retest_required') {
      info.confirmationGateRows += 1;
    }
    incrementCount(info.reasonCounts, row.decisionReason);
    incrementCount(info.classes, row.blockerClass);
    incrementCount(info.geometryCounts, row.geometryStatus);
    incrementCount(info.currentRrCounts, row.currentRrStatus);
    incrementCount(info.entryDistanceCounts, row.entryDistanceStatus);
    incrementCount(info.watchlistActionCounts, row.watchlistOnlyAction);
    const zeroExecutableTuningLane = deriveZeroExecutableTuningLane(row);
    const zeroExecutablePrimaryTuningTarget =
      row.zeroExecutablePrimaryTuningTarget || isPrimaryZeroExecutableTuningLane(zeroExecutableTuningLane);
    incrementCount(info.zeroExecutableTuningLaneCounts, zeroExecutableTuningLane);
    if (zeroExecutablePrimaryTuningTarget) info.zeroExecutablePrimaryTuningTargets += 1;
    info.rows.push({
      ...row,
      zeroExecutableTuningLane,
      zeroExecutablePrimaryTuningTarget
    });
    byRun.set(row.stage6File, info);
  }
  return [...byRun.values()].sort((a, b) => b.stage6File.localeCompare(a.stage6File)).map((run) => {
    const zeroExecutable = run.executable === 0;
    const zeroActionableExecutable = run.executableActionable === 0;
    const overblockCount =
      (run.classes.DATA_POLICY_OVERBLOCK || 0) +
      (run.classes.ENTRY_MODEL_TOO_DEEP || 0) +
      (run.classes.BREAKOUT_RETEST_REQUIRED || 0) +
      (run.classes.CURRENT_STOP_RECALC_REQUIRED || 0) +
      (run.classes.VERDICT_NORMALIZATION_BLOCK || 0);
    const normalSafetyCount = (run.classes.NORMAL_EVENT_BLACKOUT || 0) + (run.classes.NORMAL_RISK_BLOCK || 0) + (run.classes.NORMAL_RR_BLOCK || 0);
    const confirmationConcentration = run.total > 0 ? run.confirmationGateRows / run.total : 0;
    const hasPrimaryZeroExecutableTuningTarget = run.zeroExecutablePrimaryTuningTargets > 0;
    const verdict = run.executableActionable > 0
      ? 'HAS_ACTIONABLE_EXECUTABLE'
      : run.executableNonActionable > 0
        ? 'EXECUTABLE_NON_ACTIONABLE_CONTRACT_REVIEW'
        : !zeroExecutable
          ? 'HAS_RAW_EXECUTABLE_ONLY'
      : run.buyStrongBuyWatchlist > 0 && confirmationConcentration >= 0.5
        ? 'WATCHLIST_ONLY_CONFIRMATION_POLICY_REVIEW'
        : zeroExecutable && hasPrimaryZeroExecutableTuningTarget
          ? 'ZERO_EXECUTABLE_TUNING_TARGETS_IDENTIFIED'
        : overblockCount > 0
          ? 'MODEL_OR_DATA_POLICY_ERROR'
          : normalSafetyCount >= Math.max(1, Math.ceil(run.total * 0.6))
            ? 'NORMAL_CONSERVATIVE_FILTER'
            : 'MIXED_REVIEW_REQUIRED';
    const nextAction = verdict === 'EXECUTABLE_NON_ACTIONABLE_CONTRACT_REVIEW'
      ? 'Fix Stage6↔sidecar actionable verdict contract before any order-path tuning; do not force sidecar to accept non-actionable verdicts.'
      : verdict === 'ZERO_EXECUTABLE_TUNING_TARGETS_IDENTIFIED'
      ? 'Tune target recalibration, stop/target risk geometry recalculation, or breakout proofConfirmed generation; do not relax structure gates by default.'
      : verdict === 'WATCHLIST_ONLY_CONFIRMATION_POLICY_REVIEW'
      ? 'Audit breakout/structure confirmation lanes before touching sidecar order policy.'
      : verdict === 'MODEL_OR_DATA_POLICY_ERROR'
        ? 'Inspect Stage6 data/model policy classes and fix producer-side classification.'
        : verdict === 'NORMAL_CONSERVATIVE_FILTER'
          ? 'Keep no-order behavior; continue monitoring for fresh executable candidates.'
          : verdict === 'HAS_ACTIONABLE_EXECUTABLE'
            ? 'Use sidecar safe run to verify payload/preflight/idempotency, not Stage6 policy tuning.'
            : 'Manual Stage6 policy review required.';
    return {
      ...run,
      zeroExecutable,
      zeroActionableExecutable,
      overblockCount,
      normalSafetyCount,
      confirmationConcentration: Number(confirmationConcentration.toFixed(4)),
      verdict,
      nextAction
    };
  });
}

function countLeadingRuns(runs, predicate) {
  let count = 0;
  for (const run of runs) {
    if (!predicate(run)) break;
    count += 1;
  }
  return count;
}

function buildBoundedNoActionPolicy(runSummaries) {
  const recentWindow = Math.max(
    1,
    Math.round(parseNumber(process.env.STAGE6_AUDIT_ZERO_EXECUTABLE_WINDOW, DEFAULT_ZERO_EXECUTABLE_WINDOW))
  );
  const maxConsecutiveZeroExecutableRuns = Math.max(
    1,
    Math.round(parseNumber(process.env.STAGE6_AUDIT_MAX_CONSECUTIVE_ZERO_EXECUTABLE_RUNS, DEFAULT_MAX_CONSECUTIVE_ZERO_EXECUTABLE_RUNS))
  );
  const maxRecentZeroExecutableRuns = Math.max(
    1,
    Math.round(parseNumber(process.env.STAGE6_AUDIT_MAX_RECENT_ZERO_EXECUTABLE_RUNS, DEFAULT_MAX_RECENT_ZERO_EXECUTABLE_RUNS))
  );
  const latestRun = runSummaries[0] || null;
  const recentRuns = runSummaries.slice(0, recentWindow);
  const consecutiveZeroExecutableRuns = countLeadingRuns(runSummaries, (run) => run.zeroActionableExecutable ?? run.zeroExecutable);
  const recentZeroExecutableRuns = recentRuns.filter((run) => run.zeroActionableExecutable ?? run.zeroExecutable).length;
  const consecutiveWatchlistPolicyReviewRuns = countLeadingRuns(
    runSummaries,
    (run) => run.verdict === 'WATCHLIST_ONLY_CONFIRMATION_POLICY_REVIEW' || run.verdict === 'MODEL_OR_DATA_POLICY_ERROR' || run.verdict === 'EXECUTABLE_NON_ACTIONABLE_CONTRACT_REVIEW'
  );
  let status = 'insufficient_stage6_history';
  let recommendedAction = 'Collect Stage6 artifacts or rerun audit after the next finalized Stage6.';
  if (latestRun && latestRun.executableActionable > 0) {
    status = 'latest_has_actionable_executable';
    recommendedAction = 'Use sidecar safe run to verify payload/preflight/idempotency; do not keep Stage6 no-event monitoring open.';
  } else if (latestRun && latestRun.executable > 0 && latestRun.executableNonActionable > 0) {
    status = 'latest_raw_executable_not_actionable';
    recommendedAction = 'Stage6 emitted raw executable candidates that sidecar default policy cannot act on. Fix verdict/actionable contract or producer verdict normalization before sidecar order-path tuning.';
  } else if (
    consecutiveZeroExecutableRuns >= maxConsecutiveZeroExecutableRuns ||
    recentZeroExecutableRuns >= maxRecentZeroExecutableRuns ||
    consecutiveWatchlistPolicyReviewRuns >= maxConsecutiveZeroExecutableRuns
  ) {
    status = 'stage0_6_quality_audit_required';
    recommendedAction = 'Stop passive observation and move to Stage0-6 policy tuning: confirmation lanes, entry/current distance, RR, stop geometry, earnings coverage, and verdict normalization.';
  } else if (latestRun?.zeroExecutable) {
    status = 'zero_executable_observe_bounded';
    recommendedAction = 'One zero-executable run is acceptable; check the next fresh Stage6 only, then escalate if the bounded threshold is reached.';
  }
  return {
    status,
    recentWindow,
    recentRuns: recentRuns.length,
    consecutiveZeroExecutableRuns,
    recentZeroExecutableRuns,
    consecutiveWatchlistPolicyReviewRuns,
    maxConsecutiveZeroExecutableRuns,
    maxRecentZeroExecutableRuns,
    latestStage6File: latestRun?.stage6File || null,
    latestExecutable: latestRun?.executable ?? null,
    latestActionableExecutable: latestRun?.executableActionable ?? null,
    latestNonActionableExecutable: latestRun?.executableNonActionable ?? null,
    latestVerdict: latestRun?.verdict || null,
    recommendedAction,
    noIndefiniteObservation: true
  };
}

function formatNumber(value, suffix = '') {
  return value == null || !Number.isFinite(Number(value)) ? 'N/A' : `${Number(value).toFixed(2)}${suffix}`;
}

function mdEscape(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(report) {
  const lines = [];
  const actionableVerdicts = report.summary.actionableVerdicts || DEFAULT_ACTIONABLE_VERDICTS;
  lines.push('# Stage6 Execution Gate Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source files: ${report.summary.stage6Files}`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Actionable verdict contract: ${actionableVerdicts.join(', ')}`);
  lines.push(`- Zero executable runs: ${report.summary.zeroExecutableRuns}`);
  lines.push(`- Zero actionable-executable runs: ${report.summary.zeroActionableExecutableRuns}`);
  lines.push(`- Non-actionable executable rows: ${report.summary.nonActionableExecutableRows}`);
  lines.push(`- Watchlist-only policy review runs: ${report.summary.watchlistOnlyPolicyReviewRuns}`);
  lines.push(`- BUY/STRONG_BUY watchlist rows: ${report.summary.buyStrongBuyWatchlistRows}`);
  lines.push(`- Overall verdict: **${report.summary.overallVerdict}**`);
  lines.push(`- Bounded no-action status: **${report.summary.boundedNoActionPolicy?.status || 'N/A'}**`);
  lines.push('');
  lines.push('## Bounded No-Actionable-Event Policy');
  lines.push('');
  if (report.summary.boundedNoActionPolicy) {
    const policy = report.summary.boundedNoActionPolicy;
    lines.push(`- Status: **${policy.status}**`);
    lines.push(`- Latest Stage6: ${policy.latestStage6File || 'N/A'}`);
    lines.push(`- Latest Raw Executable: ${policy.latestExecutable ?? 'N/A'}`);
    lines.push(`- Latest Actionable Executable: ${policy.latestActionableExecutable ?? 'N/A'}`);
    lines.push(`- Latest Non-Actionable Executable: ${policy.latestNonActionableExecutable ?? 'N/A'}`);
    lines.push(`- Consecutive Zero-Actionable-Executable Runs: ${policy.consecutiveZeroExecutableRuns}/${policy.maxConsecutiveZeroExecutableRuns}`);
    lines.push(`- Recent Zero-Actionable-Executable Runs: ${policy.recentZeroExecutableRuns}/${policy.maxRecentZeroExecutableRuns} within latest ${policy.recentWindow}`);
    lines.push(`- Consecutive Policy/Error Runs: ${policy.consecutiveWatchlistPolicyReviewRuns}/${policy.maxConsecutiveZeroExecutableRuns}`);
    lines.push(`- Recommended Action: ${mdEscape(policy.recommendedAction)}`);
    lines.push('- Rule: do not wait indefinitely for an event. If bounded thresholds are reached, stop passive observation and fix Stage0-6 policy/source quality.');
  }
  lines.push('');
  lines.push('## Run Verdicts');
  lines.push('');
  lines.push('| Stage6 File | Rows | Raw Exec | Actionable Exec | Non-Actionable Exec | BUY/SB Watch | Confirm Gates | Verdict | Top Reasons | Next Action |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const run of report.runSummaries) {
    const topReasons = Object.entries(run.reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key, count]) => `${key}:${count}`)
      .join(', ');
    lines.push(`| ${mdEscape(run.stage6File)} | ${run.total} | ${run.executable} | ${run.executableActionable} | ${run.executableNonActionable} | ${run.buyStrongBuyWatchlist} | ${run.confirmationGateRows} | ${run.verdict} | ${mdEscape(topReasons)} | ${mdEscape(run.nextAction)} |`);
  }
  lines.push('');
  lines.push('## Latest Watchlist-Only Diagnosis');
  lines.push('');
  if (report.latestRun) {
    lines.push(`- Latest Stage6: ${report.latestRun.stage6File}`);
    lines.push(`- Latest Verdict: **${report.latestRun.verdict}**`);
    lines.push(`- Latest Action: ${report.latestRun.nextAction}`);
    lines.push(`- Latest Raw Executable: ${report.latestRun.executable}`);
    lines.push(`- Latest Actionable Executable: ${report.latestRun.executableActionable}`);
    lines.push(`- Latest Non-Actionable Executable: ${report.latestRun.executableNonActionable}`);
    lines.push(`- Reason Counts: ${mdEscape(Object.entries(report.latestRun.reasonCounts || {}).map(([key, value]) => `${key}:${value}`).join(', ') || 'none')}`);
    lines.push(`- Geometry Counts: ${mdEscape(Object.entries(report.latestRun.geometryCounts || {}).map(([key, value]) => `${key}:${value}`).join(', ') || 'none')}`);
    lines.push(`- Current RR Counts: ${mdEscape(Object.entries(report.latestRun.currentRrCounts || {}).map(([key, value]) => `${key}:${value}`).join(', ') || 'none')}`);
    lines.push(`- Entry Distance Counts: ${mdEscape(Object.entries(report.latestRun.entryDistanceCounts || {}).map(([key, value]) => `${key}:${value}`).join(', ') || 'none')}`);
    lines.push(`- Watchlist Action Counts: ${mdEscape(Object.entries(report.latestRun.watchlistActionCounts || {}).map(([key, value]) => `${key}:${value}`).join(', ') || 'none')}`);
  } else {
    lines.push('- No Stage6 runs were available.');
  }
  lines.push('');
  lines.push('## Candidate Blocker Table');
  lines.push('');
  lines.push('| File | Symbol | Verdict | Actionable | Decision | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR Status | Watchlist Action | Price | Entry | Target | Stop | EarningsD | Class | Fix Lane |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of report.rows.slice(0, 120)) {
    lines.push([
      mdEscape(row.stage6File),
      mdEscape(row.symbol),
      mdEscape(row.verdict),
      row.isActionableVerdict ? 'yes' : 'no',
      mdEscape(row.finalDecision),
      mdEscape(row.decisionReason),
      mdEscape(row.entryTactic || row.chosenPlanType || 'N/A'),
      formatNumber(row.expectedReturnPct),
      formatNumber(row.rr),
      formatNumber(row.rrAtCurrentPrice),
      formatNumber(row.entryDistancePct),
      formatNumber(row.targetBufferFromCurrentPct),
      mdEscape(row.geometryStatus),
      mdEscape(row.currentRrStatus),
      mdEscape(row.watchlistOnlyAction),
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
  lines.push('- `EXECUTABLE_NOW`가 있어도 verdict가 sidecar actionable contract에 없으면 실제 payload 후보가 아니다. 이 경우 sidecar를 강제로 넓히지 말고 Stage6 verdict normalization 또는 explicit policy waiver를 먼저 설계한다.');
  lines.push('- `BREAKOUT_RETEST_REQUIRED`는 종목을 즉시 매수하라는 뜻이 아니라, 기존 깊은 눌림목 단일 lane으로는 상승 추세 종목을 실행하지 못한다는 설계 신호다.');
  lines.push('- `CURRENT_STOP_RECALC_REQUIRED`는 현재가 진입을 하려면 기존 손절이 아니라 더 가까운 구조적 손절을 재검증해야 한다는 뜻이다. 기본 설정에서는 주문으로 승격하지 않는다.');
  lines.push('- `CURRENT_RR_BAD` 또는 `TARGET_ALREADY_NEAR_CURRENT`는 추격매수 금지 신호다. 이 경우 sidecar chase가 아니라 Stage6 target/stop 재산정 또는 no-trade가 맞다.');
  lines.push('- `WATCHLIST_ONLY_CONFIRMATION_POLICY_REVIEW`는 주문 경로 문제가 아니라 Stage6의 구조 확인/브레이크아웃 리테스트 lane이 실행 후보를 과도하게 0개로 만들 가능성이 있다는 뜻이다.');
  lines.push('- `BREAKOUT_RETEST_LANE_REVIEW`와 `STRUCTURE_CONFIRMATION_LANE_REVIEW`는 즉시 매수 허가가 아니다. 구조 확인 실패와 실행 가능한 현재가 재산정 가능성을 분리해 다음 Stage6 producer 개선 대상으로 올린다.');
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
  const notionPayloadFiles = files
    .filter((file) => path.basename(file) === 'notion-pipeline-sync-payload.json')
    .sort((a, b) => b.localeCompare(a));
  for (const file of notionPayloadFiles) {
    const payload = readJson(file);
    const stage6File = normalizeText(payload?.stage6File);
    if (!payload || !stage6File || seen.has(stage6File)) continue;
    seen.add(stage6File);
    rows.push(...extractRowsFromNotionPipelinePayload(file, payload));
  }
  const actionableVerdicts = getActionableVerdicts();
  const classifiedRows = rows.map((row) => {
    const cls = classifyRow(row);
    const geometry = assessTradeGeometry(row);
    return {
      ...row,
      blockerClass: cls.class,
      severity: cls.severity,
      fixLane: cls.fixLane,
      isBuyOrStrongBuy: isBuyOrStrongBuy(row),
      isActionableVerdict: isActionableVerdict(row, actionableVerdicts),
      entryDistanceStatus: classifyEntryDistance(row),
      geometryStatus: geometry.status,
      geometryReasons: geometry.reasons,
      currentRrStatus: classifyCurrentRr(row),
      watchlistOnlyAction: classifyWatchlistOnlyAction(row, actionableVerdicts)
    };
  }).sort((a, b) => b.stage6File.localeCompare(a.stage6File) || a.symbol.localeCompare(b.symbol));
  const runSummaries = buildRunSummaries(classifiedRows, actionableVerdicts);
  const boundedNoActionPolicy = buildBoundedNoActionPolicy(runSummaries);
  const zeroExecutableRuns = runSummaries.filter((run) => run.zeroExecutable).length;
  const zeroActionableExecutableRuns = runSummaries.filter((run) => run.zeroActionableExecutable).length;
  const designErrorRuns = runSummaries.filter((run) => run.verdict === 'MODEL_OR_DATA_POLICY_ERROR').length;
  const watchlistOnlyPolicyReviewRuns = runSummaries.filter((run) => run.verdict === 'WATCHLIST_ONLY_CONFIRMATION_POLICY_REVIEW').length;
  const buyStrongBuyWatchlistRows = classifiedRows.filter((row) => row.isBuyOrStrongBuy && String(row.executionBucket || '').toUpperCase() !== 'EXECUTABLE').length;
  const nonActionableExecutableRows = classifiedRows.filter((row) => row.finalDecision === 'EXECUTABLE_NOW' && !row.isActionableVerdict).length;
  const latestRun = runSummaries[0] || null;
  const contractReviewRuns = runSummaries.filter((run) => run.verdict === 'EXECUTABLE_NON_ACTIONABLE_CONTRACT_REVIEW').length;
  const overallVerdict = contractReviewRuns > 0
    ? 'ACTIONABLE_CONTRACT_REVIEW'
    : watchlistOnlyPolicyReviewRuns > 0
    ? 'WATCHLIST_ONLY_POLICY_REVIEW'
    : designErrorRuns > 0
      ? 'MODEL_OR_DATA_POLICY_ERROR'
      : zeroExecutableRuns > 0
        ? 'MIXED_OR_CONSERVATIVE'
        : 'HAS_EXECUTABLES';
  const report = {
    generatedAt: new Date().toISOString(),
    driveFetch,
    summary: {
      stage6Files: seen.size,
      rows: classifiedRows.length,
      actionableVerdicts: [...actionableVerdicts],
      zeroExecutableRuns,
      zeroActionableExecutableRuns,
      designErrorRuns,
      contractReviewRuns,
      nonActionableExecutableRows,
      watchlistOnlyPolicyReviewRuns,
      buyStrongBuyWatchlistRows,
      overallVerdict,
      boundedNoActionPolicy
    },
    latestRun: latestRun ? { ...latestRun, rows: undefined } : null,
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
