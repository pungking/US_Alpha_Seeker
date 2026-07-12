#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const inputPath = path.resolve(root, process.env.STAGE35_OOS_INPUT || 'state/stage3-5-oos-outcomes.json');
const outJson = path.resolve(root, process.env.STAGE35_OOS_OUT_JSON || 'state/stage3-5-oos-cost-audit.json');
const outMd = path.resolve(root, process.env.STAGE35_OOS_OUT_MD || 'docs/STAGE3_5_OOS_COST_AUDIT.md');
const minimumSample = Math.max(1, Number.parseInt(process.env.STAGE35_OOS_MIN_SAMPLE || '30', 10) || 30);

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Number(value.toFixed(2));
}

const inputExists = fs.existsSync(inputPath);
const raw = inputExists ? fs.readFileSync(inputPath, 'utf8') : '';
const payload = inputExists ? JSON.parse(raw) : { schemaVersion: 'stage3-5-oos-v1', rows: [] };
const inputContractValid = payload.schemaVersion === 'stage3-5-oos-v1' && Array.isArray(payload.rows);
const rows = Array.isArray(payload.rows) ? payload.rows : [];
const accepted = [];
const rejected = [];

for (const row of rows) {
  const symbol = String(row?.symbol || '').trim().toUpperCase();
  if (String(row?.split || '').toUpperCase() !== 'OOS') {
    rejected.push({ symbol: symbol || null, reason: 'non_oos_split' });
    continue;
  }
  const entry = finite(row?.entryPrice);
  const exit = finite(row?.exitPrice);
  const holdingDays = finite(row?.holdingDays);
  const spreadBps = finite(row?.spreadBps);
  const slippageBps = finite(row?.slippageBps);
  const commissionBps = finite(row?.commissionBps);
  if (!symbol || String(row?.side || '').toUpperCase() !== 'LONG') {
    rejected.push({ symbol: symbol || null, reason: 'unsupported_symbol_or_side' });
    continue;
  }
  if (entry == null || exit == null || entry <= 0 || exit <= 0 || holdingDays == null || holdingDays <= 0) {
    rejected.push({ symbol, reason: 'invalid_price_or_holding_period' });
    continue;
  }
  if ([spreadBps, slippageBps, commissionBps].some((value) => value == null || value < 0)) {
    rejected.push({ symbol, reason: 'missing_or_invalid_cost_input' });
    continue;
  }

  // One full spread plus per-side slippage and commission.
  const roundTripCostBps = spreadBps + (2 * slippageBps) + (2 * commissionBps);
  const grossReturnPct = ((exit / entry) - 1) * 100;
  const netReturnPct = grossReturnPct - (roundTripCostBps / 100);
  accepted.push({
    symbol,
    signalDate: row.signalDate || null,
    holdingDays,
    grossReturnPct: round(grossReturnPct),
    roundTripCostBps: round(roundTripCostBps),
    netReturnPct: round(netReturnPct)
  });
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const validOosRows = accepted.length;
const report = {
  schemaVersion: 'stage3-5-oos-cost-audit-v1',
  generatedAt: new Date().toISOString(),
  overall: !inputContractValid
    ? 'invalid_input_contract'
    : validOosRows >= minimumSample
      ? 'pass_report_only'
      : 'insufficient_oos_evidence',
  interpretation: 'evidence_contract_only_not_alpha_performance_approval',
  source: {
    inputFile: path.relative(root, inputPath),
    inputExists,
    inputSha256: inputExists ? crypto.createHash('sha256').update(raw).digest('hex') : null,
    schemaVersion: payload.schemaVersion || null,
    contractValid: inputContractValid
  },
  policy: {
    requiredSplit: 'OOS',
    supportedSide: 'LONG',
    minimumSample,
    costFormula: 'spreadBps + 2*slippageBps + 2*commissionBps',
    returnBasis: 'price_return_not_total_return'
  },
  summary: {
    inputRows: rows.length,
    validOosRows,
    rejectedRows: rejected.length,
    rejectedNonOosRows: rejected.filter((row) => row.reason === 'non_oos_split').length,
    netWinRatePct: round(validOosRows ? (accepted.filter((row) => row.netReturnPct > 0).length / validOosRows) * 100 : 0),
    meanGrossReturnPct: round(mean(accepted.map((row) => row.grossReturnPct))),
    meanNetReturnPct: round(mean(accepted.map((row) => row.netReturnPct))),
    meanRoundTripCostBps: round(mean(accepted.map((row) => row.roundTripCostBps)))
  },
  rows: accepted,
  rejected,
  limitations: [
    'No result is inferred when forward outcome labels are absent.',
    'Market impact, borrow cost, taxes, and opportunity cost are not modeled.',
    'Passing validates sample and cost evidence only; it does not approve execution or prove alpha.'
  ],
  nextAction: !inputContractValid
    ? 'repair_oos_input_contract_before_analysis'
    : validOosRows >= minimumSample
      ? 'review_walk_forward_stability_and_regime_slices'
      : 'collect_more_timestamped_oos_outcomes_without_relabeling'
};

const markdown = `# Stage3-5 OOS and Cost Audit

- Overall: \`${report.overall}\`
- Interpretation: \`${report.interpretation}\`
- Valid OOS rows: ${validOosRows}/${minimumSample}
- Mean gross return: ${report.summary.meanGrossReturnPct}%
- Mean net return: ${report.summary.meanNetReturnPct}%
- Mean round-trip cost: ${report.summary.meanRoundTripCostBps} bps
- Next action: \`${report.nextAction}\`

This report never substitutes in-sample rows for missing OOS evidence and does not authorize broker behavior.
`;

atomicWrite(outJson, `${JSON.stringify(report, null, 2)}\n`);
atomicWrite(outMd, markdown);
console.log(`[STAGE3_5_OOS_COST_AUDIT] overall=${report.overall} rows=${validOosRows}/${minimumSample}`);
