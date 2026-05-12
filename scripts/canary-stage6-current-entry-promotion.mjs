import fs from 'node:fs';
import path from 'node:path';

const STATE_DIR = 'state';
const AUDIT_SOURCE_DIR = path.join(STATE_DIR, 'stage6-audit-source');
const OUT_JSON = path.join(STATE_DIR, 'stage6-current-entry-promotion-canary.json');
const OUT_MD = path.join('docs', 'STAGE6_CURRENT_ENTRY_PROMOTION_CANARY.md');

const boolFromEnv = (name, fallback = false) => {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const numFromEnv = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const numberOrNull = (value) => {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const esc = (value) => String(value ?? 'N/A').replaceAll('|', '\\|');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function latestStage6Path() {
  const dispatchPath = 'stage6-dispatch-payload.json';
  if (fs.existsSync(dispatchPath)) {
    const dispatch = readJson(dispatchPath);
    if (dispatch?.stage6File) {
      const candidate = path.join(AUDIT_SOURCE_DIR, dispatch.stage6File);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  const files = fs.readdirSync(AUDIT_SOURCE_DIR)
    .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
    .map((name) => ({ name, full: path.join(AUDIT_SOURCE_DIR, name), mtime: fs.statSync(path.join(AUDIT_SOURCE_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name));
  if (!files.length) throw new Error(`no Stage6 files found in ${AUDIT_SOURCE_DIR}`);
  return files[0].full;
}

function uniqueRows(stage6) {
  const buckets = [
    ...(stage6?.execution_contract?.modelTop6 || []),
    ...(stage6?.execution_contract?.executablePicks || []),
    ...(stage6?.execution_contract?.watchlistTop || []),
    ...(stage6?.alpha_candidates || [])
  ];
  const seen = new Map();
  for (const row of buckets) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    if (!symbol) continue;
    const current = seen.get(symbol);
    const score = row?.currentEntryStructureConfirmed ? 3 : row?.currentEntryRecalcFeasible ? 2 : row?.finalDecision === 'EXECUTABLE_NOW' ? 1 : 0;
    const currentScore = current?.currentEntryStructureConfirmed ? 3 : current?.currentEntryRecalcFeasible ? 2 : current?.finalDecision === 'EXECUTABLE_NOW' ? 1 : 0;
    if (!current || score > currentScore) seen.set(symbol, row);
  }
  return [...seen.values()];
}

function evaluate(row, policy) {
  const symbol = String(row?.symbol || '').toUpperCase();
  const price = numberOrNull(row?.price);
  const target = numberOrNull(row?.targetPrice ?? row?.resistanceLevel ?? row?.targetMeanPrice);
  const requiredStop = numberOrNull(row?.currentEntryRequiredStopPrice);
  const requiredStopDistancePct = numberOrNull(row?.currentEntryRequiredStopDistancePct);
  const targetBufferPct = price != null && target != null && price > 0 ? ((target - price) / price) * 100 : numberOrNull(row?.targetBufferFromCurrentPct);
  const rrWithRecalc = price != null && target != null && requiredStop != null && price > requiredStop
    ? (target - price) / (price - requiredStop)
    : null;
  const reasons = [];
  if (!policy.adaptiveEnabled) reasons.push('adaptive_current_entry_disabled');
  if (!policy.stopRecalcEnabled) reasons.push('current_entry_stop_recalc_disabled');
  if (!row?.currentEntryRecalcFeasible) reasons.push('recalc_not_feasible');
  if (row?.currentEntryStructureVerdict !== 'STRUCTURE_CONFIRMED_RECALC_CANDIDATE' || row?.currentEntryStructureConfirmed !== true) {
    reasons.push('structure_not_confirmed');
  }
  if (!(price != null && target != null && target > price)) reasons.push('target_not_above_current');
  if (!(requiredStop != null && price != null && requiredStop > 0 && requiredStop < price)) reasons.push('required_stop_invalid');
  if (!(requiredStopDistancePct != null && requiredStopDistancePct >= policy.stopMinPct && requiredStopDistancePct <= policy.stopMaxPct)) {
    reasons.push('required_stop_distance_out_of_policy');
  }
  if (!(rrWithRecalc != null && rrWithRecalc >= policy.minRr)) reasons.push('recalculated_rr_below_min');
  if (!(targetBufferPct != null && targetBufferPct >= policy.minTargetBufferPct)) reasons.push('target_buffer_below_min');

  const wouldPromote = reasons.length === 0;
  return {
    symbol,
    currentFinalDecision: row?.finalDecision || null,
    currentDecisionReason: row?.decisionReason || null,
    currentExecutionBucket: row?.executionBucket || null,
    price,
    target,
    requiredStop,
    requiredStopDistancePct,
    targetBufferPct: targetBufferPct == null ? null : Number(targetBufferPct.toFixed(2)),
    rrWithRecalc: rrWithRecalc == null ? null : Number(rrWithRecalc.toFixed(2)),
    currentEntryRecalcFeasible: Boolean(row?.currentEntryRecalcFeasible),
    currentEntryStructureVerdict: row?.currentEntryStructureVerdict || null,
    currentEntryStructureConfirmed: Boolean(row?.currentEntryStructureConfirmed),
    currentEntryStructureReasons: Array.isArray(row?.currentEntryStructureReasons) ? row.currentEntryStructureReasons : [],
    currentEntryStructureSource: row?.currentEntryStructureSource || null,
    currentEntryStructureAtr14: numberOrNull(row?.currentEntryStructureAtr14),
    currentEntryStructureSupportLow: numberOrNull(row?.currentEntryStructureSupportLow),
    wouldPromote,
    simulatedFinalDecision: wouldPromote ? 'EXECUTABLE_NOW' : row?.finalDecision || null,
    simulatedDecisionReason: wouldPromote ? 'executable_current_recalculated_stop' : row?.decisionReason || null,
    simulatedExecutionBucket: wouldPromote ? 'EXECUTABLE' : row?.executionBucket || null,
    simulatedExecutionReason: wouldPromote ? 'VALID_EXEC' : row?.executionReason || null,
    simulatedChosenPlanType: wouldPromote ? 'ADAPTIVE_RECALC_STOP' : row?.chosenPlanType || null,
    simulatedEntryTactic: wouldPromote ? 'CONFIRMED_RECALCULATED_STOP_ENTRY' : row?.entryTactic || null,
    reasons
  };
}

function markdown(report) {
  const lines = [];
  lines.push('# Stage6 Current Entry Promotion Canary');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Stage6: ${report.stage6File}`);
  lines.push(`- Hash: ${String(report.stage6Hash || '').slice(0, 12) || 'N/A'}`);
  lines.push(`- Drive Upload: false`);
  lines.push(`- Sidecar Submit: false`);
  lines.push(`- Expected Symbol: ${report.expectedSymbol || 'N/A'}`);
  lines.push(`- Verdict: **${report.verdict}**`);
  lines.push('');
  lines.push('## Policy');
  lines.push('');
  lines.push('| Key | Value |');
  lines.push('| --- | ---: |');
  for (const [key, value] of Object.entries(report.policy)) lines.push(`| ${esc(key)} | ${esc(value)} |`);
  lines.push('');
  lines.push('## Candidates');
  lines.push('');
  lines.push('| Symbol | Current | Structure | Recalc | RR(recalc) | StopDist% | TargetBuf% | Would Promote | Simulated Decision | Reasons |');
  lines.push('| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(`${row.currentFinalDecision}/${row.currentDecisionReason}`)} | ${esc(row.currentEntryStructureVerdict)} | ${row.currentEntryRecalcFeasible} | ${row.rrWithRecalc ?? 'N/A'} | ${row.requiredStopDistancePct ?? 'N/A'} | ${row.targetBufferPct ?? 'N/A'} | ${row.wouldPromote} | ${esc(`${row.simulatedFinalDecision}/${row.simulatedDecisionReason}`)} | ${esc(row.reasons.join(','))} |`);
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- This canary does not upload a modified Stage6 file and does not trigger sidecar submission.');
  lines.push('- A PASS only means the next explicit Stage6 run with both current-entry flags enabled should promote the same structure-confirmed lane.');
  return `${lines.join('\n')}\n`;
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const policy = {
    adaptiveEnabled: boolFromEnv('VITE_STAGE6_ADAPTIVE_CURRENT_ENTRY_ENABLED', false),
    stopRecalcEnabled: boolFromEnv('VITE_STAGE6_CURRENT_ENTRY_STOP_RECALC_ENABLED', false),
    minRr: numFromEnv('VITE_STAGE6_CURRENT_ENTRY_MIN_RR', numFromEnv('VITE_STAGE6_MIN_RR', 2)),
    minTargetBufferPct: numFromEnv('VITE_STAGE6_CURRENT_ENTRY_MIN_TARGET_BUFFER_PCT', numFromEnv('VITE_STAGE6_MIN_TARGET_DISTANCE_PCT', 1)),
    stopMinPct: numFromEnv('VITE_STAGE6_MIN_STOP_DISTANCE_PCT', 1.5),
    stopMaxPct: numFromEnv('VITE_STAGE6_MAX_STOP_DISTANCE_PCT', 22)
  };
  const expectedSymbol = String(process.env.STAGE6_CURRENT_ENTRY_CANARY_EXPECT_SYMBOL || '').trim().toUpperCase();
  const rows = uniqueRows(stage6).map((row) => evaluate(row, policy));
  const promoted = rows.filter((row) => row.wouldPromote);
  const expected = expectedSymbol ? rows.find((row) => row.symbol === expectedSymbol) : null;
  const verdict = expectedSymbol
    ? expected?.wouldPromote ? 'PASS' : 'FAIL_EXPECTED_SYMBOL_NOT_PROMOTED'
    : promoted.length ? 'PASS' : 'FAIL_NO_PROMOTION_CANDIDATE';
  const report = {
    generatedAt: new Date().toISOString(),
    stage6File: path.basename(stage6Path),
    stage6Hash: stage6?.manifest?.stage6Hash || stage6?.manifest?.hash || null,
    sourcePath: stage6Path,
    safety: {
      driveUpload: false,
      sidecarSubmit: false,
      orderAuthorized: false
    },
    expectedSymbol: expectedSymbol || null,
    verdict,
    policy,
    summary: {
      rows: rows.length,
      promoted: promoted.length,
      promotedSymbols: promoted.map((row) => row.symbol),
      expectedSymbolPromoted: expectedSymbol ? Boolean(expected?.wouldPromote) : null
    },
    rows
  };
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, markdown(report), 'utf8');
  console.log(`[STAGE6_CURRENT_ENTRY_PROMOTION_CANARY] verdict=${verdict} promoted=${promoted.map((row) => row.symbol).join(',') || 'none'} json=${OUT_JSON} md=${OUT_MD}`);
  if (verdict !== 'PASS') process.exitCode = 1;
}

main();
