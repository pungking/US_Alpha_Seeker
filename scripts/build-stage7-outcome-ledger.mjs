#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stage6Dir = path.resolve(root, process.env.STAGE7_STAGE6_DIR || 'state/stage6-audit-source');
const stage4Dir = path.resolve(root, process.env.STAGE7_STAGE4_DIR || 'state/stage4-audit-source');
const ledgerOut = path.resolve(root, process.env.STAGE7_OUTCOME_LEDGER_OUT || 'state/stage7-outcome-ledger.json');
const oosOut = path.resolve(root, process.env.STAGE7_OOS_OUT || 'state/stage3-5-oos-outcomes.json');
const markdownOut = path.resolve(root, process.env.STAGE7_OUTCOME_MD_OUT || 'docs/STAGE7_OUTCOME_LEDGER.md');
const horizonBars = positiveInt(process.env.STAGE7_HORIZON_BARS, 20);
const costs = {
  spreadBps: nonNegativeNumber(process.env.STAGE7_SPREAD_BPS, 10),
  slippageBps: nonNegativeNumber(process.env.STAGE7_SLIPPAGE_BPS, 5),
  commissionBps: nonNegativeNumber(process.env.STAGE7_COMMISSION_BPS, 1),
  basis: 'conservative_policy_assumption_v1'
};

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function jsonFiles(directory, prefix) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(directory, name));
}

function marketTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = (Number(value.hour) * 60) + Number(value.minute);
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes,
    phase: minutes < 570 ? 'PRE_RTH' : minutes < 960 ? 'RTH' : 'POST_RTH'
  };
}

function readStage6Seeds() {
  const seeds = [];
  const rejected = [];
  const sourceFiles = [];
  for (const filePath of jsonFiles(stage6Dir, 'STAGE6_ALPHA_FINAL_')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      rejected.push({ file: path.basename(filePath), reason: `invalid_json:${error.name}` });
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const generatedAt = payload?.manifest?.timestamp || payload?.execution_contract?.generatedAt || null;
    const signalMarket = marketTimestamp(generatedAt);
    const signalDate = signalMarket?.date || null;
    const stage6Hash = crypto.createHash('sha256').update(raw).digest('hex');
    const picks = Array.isArray(payload?.execution_contract?.executablePicks)
      ? payload.execution_contract.executablePicks
      : [];
    for (const pick of picks) {
      const symbol = String(pick?.symbol || '').trim().toUpperCase();
      const entryPrice = finitePositive(pick?.entryExecPrice ?? pick?.entryAnchorPrice ?? pick?.entryPrice);
      const targetPrice = finitePositive(pick?.targetPrice);
      const stopPrice = finitePositive(pick?.stopPrice ?? pick?.stopLoss);
      if (!symbol || !generatedAt || !signalDate || !entryPrice || !targetPrice || !stopPrice || !(stopPrice < entryPrice && entryPrice < targetPrice)) {
        rejected.push({ file: path.basename(filePath), symbol: symbol || null, reason: 'invalid_or_incomplete_executable_geometry' });
        continue;
      }
      seeds.push({
        ledgerId: crypto.createHash('sha256').update(`${stage6Hash}|${symbol}`).digest('hex').slice(0, 24),
        stage6File: path.basename(filePath),
        stage6Hash,
        sourceRunId: payload?.manifest?.sourceRunId || null,
        sourceSha: payload?.manifest?.sourceSha || null,
        symbol,
        generatedAt,
        signalDate,
        signalMarketPhase: signalMarket.phase,
        signalMarketMinutes: signalMarket.minutes,
        side: 'LONG',
        modelRank: pick?.modelRank ?? null,
        executionRank: pick?.executionRank ?? null,
        finalDecision: pick?.finalDecision || 'EXECUTABLE_NOW',
        decisionReason: pick?.decisionReason || null,
        entryPrice,
        targetPrice,
        stopPrice
      });
    }
  }
  const deduped = new Map(seeds.map((row) => [row.ledgerId, row]));
  return { seeds: [...deduped.values()], rejected, sourceFiles };
}

function readPriceHistory() {
  const bySymbol = new Map();
  const sourceFiles = [];
  for (const filePath of jsonFiles(stage4Dir, 'STAGE4_TECHNICAL_FULL_')) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const rows = Array.isArray(payload?.technical_universe) ? payload.technical_universe : [];
    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      if (!symbol || !Array.isArray(row?.priceHistory)) continue;
      const merged = bySymbol.get(symbol) || new Map();
      for (const bar of row.priceHistory) {
        const date = String(bar?.date || '').slice(0, 10);
        const open = finitePositive(bar?.open);
        const high = finitePositive(bar?.high);
        const low = finitePositive(bar?.low);
        const close = finitePositive(bar?.close);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !open || !high || !low || !close || low > high) continue;
        merged.set(date, { date, open, high, low, close });
      }
      bySymbol.set(symbol, merged);
    }
  }
  return {
    sourceFiles,
    bySymbol: new Map([...bySymbol].map(([symbol, bars]) => [symbol, [...bars.values()].sort((a, b) => a.date.localeCompare(b.date))]))
  };
}

function resolveSeed(seed, allBars) {
  if (!Array.isArray(allBars) || allBars.length === 0) {
    return {
      ...seed,
      outcomeLabel: 'PENDING_SOURCE_HISTORY',
      outcomeStatus: 'pending_source_history',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  const signalDateBarAllowed = seed.signalMarketPhase === 'PRE_RTH';
  const eligible = allBars.filter((bar) => bar.date > seed.signalDate || (signalDateBarAllowed && bar.date === seed.signalDate));
  const preSignalBarsExcluded = allBars.length - eligible.length;
  const bars = eligible.slice(0, horizonBars);
  if (!bars.length) {
    return { ...seed, outcomeLabel: 'PENDING_MARKET_DATA', outcomeStatus: 'pending', observedBars: 0, preSignalBarsExcluded };
  }

  let fillIndex = -1;
  let exitIndex = -1;
  let outcomeLabel = null;
  let exitPrice = null;
  let ambiguityReason = null;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (fillIndex < 0) {
      if (bar.low > seed.entryPrice) continue;
      fillIndex = index;
      const targetTouched = bar.high >= seed.targetPrice;
      const stopTouched = bar.low <= seed.stopPrice;
      if (targetTouched || stopTouched) {
        outcomeLabel = 'AMBIGUOUS_INTRABAR';
        ambiguityReason = 'entry_and_exit_threshold_touched_same_daily_bar';
        exitIndex = index;
        break;
      }
      continue;
    }

    const targetTouched = bar.high >= seed.targetPrice;
    const stopTouched = bar.low <= seed.stopPrice;
    if (targetTouched && stopTouched) {
      outcomeLabel = 'AMBIGUOUS_INTRABAR';
      ambiguityReason = 'target_and_stop_touched_same_daily_bar';
      exitIndex = index;
      break;
    }
    if (targetTouched) {
      outcomeLabel = 'TP_FIRST';
      exitPrice = seed.targetPrice;
      exitIndex = index;
      break;
    }
    if (stopTouched) {
      outcomeLabel = 'SL_FIRST';
      exitPrice = seed.stopPrice;
      exitIndex = index;
      break;
    }
  }

  if (fillIndex < 0) {
    return {
      ...seed,
      outcomeLabel: bars.length >= horizonBars ? 'NO_FILL' : 'PENDING_MARKET_DATA',
      outcomeStatus: bars.length >= horizonBars ? 'resolved' : 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: null,
      resolvedAt: bars.length >= horizonBars ? bars.at(-1).date : null
    };
  }

  if (!outcomeLabel && bars.length >= horizonBars) {
    outcomeLabel = 'TIMEOUT';
    exitIndex = bars.length - 1;
    exitPrice = bars[exitIndex].close;
  }
  if (!outcomeLabel) {
    return {
      ...seed,
      outcomeLabel: 'PENDING_MARKET_DATA',
      outcomeStatus: 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: bars[fillIndex].date
    };
  }

  const observed = bars.slice(fillIndex, exitIndex + 1);
  const maxHigh = Math.max(...observed.map((bar) => bar.high));
  const minLow = Math.min(...observed.map((bar) => bar.low));
  const riskPerShare = seed.entryPrice - seed.stopPrice;
  const realizedR = exitPrice == null ? null : (exitPrice - seed.entryPrice) / riskPerShare;
  return {
    ...seed,
    outcomeLabel,
    outcomeStatus: outcomeLabel === 'AMBIGUOUS_INTRABAR' ? 'excluded_ambiguous' : 'resolved',
    ambiguityReason,
    observedBars: bars.length,
    preSignalBarsExcluded,
    fillDate: bars[fillIndex].date,
    fillBasis: 'daily_bar_low_touched_limit_assumed_at_limit',
    resolvedAt: bars[exitIndex].date,
    exitPrice: exitPrice == null ? null : round(exitPrice),
    holdingBars: exitIndex - fillIndex + 1,
    mfePct: round(((maxHigh / seed.entryPrice) - 1) * 100),
    maePct: round(((minLow / seed.entryPrice) - 1) * 100),
    realizedR: realizedR == null ? null : round(realizedR)
  };
}

const { seeds, rejected, sourceFiles: stage6Files } = readStage6Seeds();
const history = readPriceHistory();
const rows = seeds
  .map((seed) => resolveSeed(seed, history.bySymbol.get(seed.symbol)))
  .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.symbol.localeCompare(b.symbol));
const oosRows = rows
  .filter((row) => ['TP_FIRST', 'SL_FIRST', 'TIMEOUT'].includes(row.outcomeLabel))
  .map((row) => ({
    split: 'OOS',
    side: 'LONG',
    evaluationMode: 'stage6_executable_policy',
    ledgerId: row.ledgerId,
    stage6Hash: row.stage6Hash,
    symbol: row.symbol,
    signalDate: row.signalDate,
    signalMarketPhase: row.signalMarketPhase,
    walkForwardCohort: row.signalDate.slice(0, 7),
    resolvedAt: row.resolvedAt,
    outcomeLabel: row.outcomeLabel,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    holdingDays: row.holdingBars,
    spreadBps: costs.spreadBps,
    slippageBps: costs.slippageBps,
    commissionBps: costs.commissionBps,
    costInputBasis: costs.basis
  }));

const summary = {
  seedRows: seeds.length,
  historyCoverageRows: rows.filter((row) => row.outcomeStatus !== 'pending_source_history').length,
  missingHistoryRows: rows.filter((row) => row.outcomeStatus === 'pending_source_history').length,
  resolvedRows: rows.filter((row) => !String(row.outcomeStatus).startsWith('pending')).length,
  pendingRows: rows.filter((row) => String(row.outcomeStatus).startsWith('pending')).length,
  oosRows: oosRows.length,
  rejectedSeedRows: rejected.length,
  ambiguousRows: rows.filter((row) => row.outcomeLabel === 'AMBIGUOUS_INTRABAR').length,
  noFillRows: rows.filter((row) => row.outcomeLabel === 'NO_FILL').length,
  preSignalBarsExcluded: rows.reduce((sum, row) => sum + Number(row.preSignalBarsExcluded || 0), 0)
};
const ledger = {
  schemaVersion: 'stage7-outcome-ledger-v1',
  generatedAt: new Date().toISOString(),
  overall: seeds.length ? 'report_only_outcomes_collected' : 'no_executable_stage6_seeds',
  interpretation: 'timestamped_forward_evidence_only_not_execution_or_alpha_approval',
  source: {
    stage6Directory: path.relative(root, stage6Dir),
    stage6Files,
    stage4Directory: path.relative(root, stage4Dir),
    stage4Files: history.sourceFiles
  },
  policy: {
    signalCohort: 'execution_contract.executablePicks',
    marketTimezone: 'America/New_York',
    horizonBars,
    barFrequency: 'daily',
    forwardBarRule: 'bar.date > signalMarketDate; signal-date daily bar allowed only when Stage6 was generated before 09:30 America/New_York',
    intrabarRule: 'exclude_when_entry_and_exit_or_target_and_stop_share_a_daily_bar',
    fillRule: 'long_limit_filled_when_daily_low_lte_entry_assume_entry_price',
    costInputs: costs
  },
  summary,
  rows,
  rejected
};
const oosPayload = {
  schemaVersion: 'stage3-5-oos-v1',
  generatedAt: ledger.generatedAt,
  sourceLedger: path.relative(root, ledgerOut),
  sourceLedgerSchemaVersion: ledger.schemaVersion,
  walkForwardPolicy: {
    split: 'OOS',
    cohort: 'signal_market_month',
    temporalRule: 'resolvedAt_after_signalDate_or_same_date_only_for_pre_rth_signal',
    ambiguousAndUnfilledRowsExcluded: true
  },
  rows: oosRows
};
const markdown = `# Stage7 Outcome Ledger\n\n` +
  `- Overall: \`${ledger.overall}\`\n` +
  `- Seed rows: ${summary.seedRows}\n` +
  `- Resolved rows: ${summary.resolvedRows}\n` +
  `- Pending rows: ${summary.pendingRows}\n` +
  `- Missing source history rows: ${summary.missingHistoryRows}\n` +
  `- Pre-signal bars excluded: ${summary.preSignalBarsExcluded}\n` +
  `- OOS rows emitted: ${summary.oosRows}\n` +
  `- Ambiguous rows excluded: ${summary.ambiguousRows}\n` +
  `- Horizon: ${horizonBars} daily bars\n` +
  `- Cost basis: \`${costs.basis}\` (${costs.spreadBps}/${costs.slippageBps}/${costs.commissionBps} bps spread/slippage/commission)\n\n` +
  `Bars after the Stage6 market date are evaluated; the signal-date bar is admitted only for a pre-RTH signal. Ambiguous daily-bar ordering is excluded and no broker behavior is authorized.\n`;

atomicWrite(ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
atomicWrite(oosOut, `${JSON.stringify(oosPayload, null, 2)}\n`);
atomicWrite(markdownOut, markdown);
console.log(`[STAGE7_OUTCOME_LEDGER] overall=${ledger.overall} seeds=${summary.seedRows} resolved=${summary.resolvedRows} oos=${summary.oosRows}`);
