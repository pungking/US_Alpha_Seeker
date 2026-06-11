#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'state/stage6-audit-source';
const OUT_JSON = 'state/stage6-quality-trend-audit.json';
const OUT_MD = 'state/stage6-quality-trend-audit.md';
const DEFAULT_ACTIONABLE_VERDICTS = ['BUY', 'STRONG_BUY'];

function actionableVerdicts() {
  const raw = process.env.STAGE6_AUDIT_ACTIONABLE_VERDICTS || DEFAULT_ACTIONABLE_VERDICTS.join(',');
  const values = raw
    .split(',')
    .map((item) => String(item || '').trim().toUpperCase())
    .filter(Boolean);
  return new Set(values.length > 0 ? values : DEFAULT_ACTIONABLE_VERDICTS);
}

function rowScore(row) {
  const decision = decisionOf(row);
  if (decision === 'EXECUTABLE_NOW') return 5;
  if (row?.currentEntryStructureConfirmed === true) return 4;
  if (row?.currentEntryRecalcFeasible === true) return 3;
  if (String(row?.executionBucket || '').toUpperCase() === 'WATCHLIST') return 2;
  return 1;
}

function uniqueBySymbol(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = String(row?.symbol || row?.ticker || '').trim().toUpperCase();
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || rowScore(row) > rowScore(existing)) bySymbol.set(symbol, row);
  }
  return [...bySymbol.values()];
}

function pickRows(payload) {
  const contractRows = [
    ...(Array.isArray(payload?.execution_contract?.modelTop6) ? payload.execution_contract.modelTop6 : []),
    ...(Array.isArray(payload?.execution_contract?.executablePicks) ? payload.execution_contract.executablePicks : []),
    ...(Array.isArray(payload?.execution_contract?.watchlistTop) ? payload.execution_contract.watchlistTop : [])
  ];
  if (contractRows.length > 0) return uniqueBySymbol(contractRows);
  if (Array.isArray(payload?.alpha_candidates)) return payload.alpha_candidates;
  if (Array.isArray(payload?.candidates)) return payload.candidates;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function verdictOf(row) {
  return String(row?.aiVerdict || row?.verdictFinal || row?.finalVerdict || row?.verdict || 'UNKNOWN')
    .trim()
    .toUpperCase();
}

function decisionOf(row) {
  return String(row?.finalDecision || 'UNKNOWN').trim().toUpperCase();
}

function reasonOf(row) {
  return String(row?.decisionReason || row?.executionReason || 'unknown').trim().toLowerCase();
}

function blockerClass(reason) {
  if (reason.includes('structure')) return 'structure';
  if (reason.includes('breakout') || reason.includes('retest')) return 'breakout';
  if (reason.includes('target')) return 'target_recalibration';
  if (reason.includes('earnings')) return 'earnings_coverage';
  if (reason.includes('quality') || reason.includes('verdict')) return 'quality_gate';
  if (reason.includes('rr') || reason.includes('stop') || reason.includes('geometry')) return 'risk_geometry';
  if (reason.includes('pullback') || reason.includes('distance')) return 'entry_distance';
  return 'other';
}

function increment(bucket, key) {
  bucket[key] = (bucket[key] || 0) + 1;
}

const actionable = actionableVerdicts();
const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((file) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(file)).sort()
  : [];
const runs = [];

for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
  const rows = pickRows(payload);
  const reasonCounts = {};
  const blockerClassCounts = {};
  const nonActionableExecReasons = {};
  let exec = 0;
  let actionableExec = 0;
  let nonActionableExec = 0;
  let wait = 0;
  let blocked = 0;

  for (const row of rows) {
    const decision = decisionOf(row);
    const reason = reasonOf(row);
    const verdict = verdictOf(row);
    increment(reasonCounts, reason);
    increment(blockerClassCounts, blockerClass(reason));
    if (decision === 'EXECUTABLE_NOW') {
      exec += 1;
      if (actionable.has(verdict)) actionableExec += 1;
      else {
        nonActionableExec += 1;
        increment(nonActionableExecReasons, verdict || 'UNKNOWN');
      }
    } else if (decision === 'WAIT_PRICE') {
      wait += 1;
    } else if (decision.startsWith('BLOCKED')) {
      blocked += 1;
    }
  }

  runs.push({
    file,
    rows: rows.length,
    exec,
    actionableExec,
    nonActionableExec,
    wait,
    blocked,
    reasonCounts,
    blockerClassCounts,
    nonActionableExecReasons
  });
}

const latest = runs.at(-1) || null;
const recent = runs.slice(-10);
const aggregate = {};
const aggregateBlockerClasses = {};
for (const run of recent) {
  for (const [key, value] of Object.entries(run.reasonCounts)) {
    aggregate[key] = (aggregate[key] || 0) + value;
  }
  for (const [key, value] of Object.entries(run.blockerClassCounts)) {
    aggregateBlockerClasses[key] = (aggregateBlockerClasses[key] || 0) + value;
  }
}
const zeroExecutableRecent = recent.filter((run) => run.exec === 0).length;
const zeroActionableExecutableRecent = recent.filter((run) => run.actionableExec === 0).length;
const nonActionableExecutableRecent = recent.reduce((sum, run) => sum + run.nonActionableExec, 0);
const report = {
  generatedAt: new Date().toISOString(),
  files: runs.length,
  actionableVerdicts: [...actionable],
  latest,
  zeroExecutableRecent,
  zeroActionableExecutableRecent,
  nonActionableExecutableRecent,
  aggregateRecentReasons: aggregate,
  aggregateRecentBlockerClasses: aggregateBlockerClasses,
  runs
};

fs.mkdirSync('state', { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const top = Object.entries(aggregate).sort((a, b) => b[1] - a[1]).slice(0, 12);
const topClasses = Object.entries(aggregateBlockerClasses).sort((a, b) => b[1] - a[1]).slice(0, 12);
const md = [
  '# Stage6 Quality Trend Audit',
  '',
  `- files: ${runs.length}`,
  `- actionableVerdicts: ${[...actionable].join(', ')}`,
  `- latest: ${latest?.file || 'N/A'}`,
  `- latestRawExec: ${latest?.exec ?? 'N/A'}`,
  `- latestActionableExec: ${latest?.actionableExec ?? 'N/A'}`,
  `- latestNonActionableExec: ${latest?.nonActionableExec ?? 'N/A'}`,
  `- zeroExecutableRecent: ${zeroExecutableRecent}/10`,
  `- zeroActionableExecutableRecent: ${zeroActionableExecutableRecent}/10`,
  `- nonActionableExecutableRecent: ${nonActionableExecutableRecent}`,
  '',
  '## Recent Reason Counts',
  '',
  '| Reason | Count |',
  '| --- | ---: |',
  ...top.map(([key, value]) => `| ${key} | ${value} |`),
  '',
  '## Recent Blocker Classes',
  '',
  '| Class | Count |',
  '| --- | ---: |',
  ...topClasses.map(([key, value]) => `| ${key} | ${value} |`),
  '',
  '## Recent Runs',
  '',
  '| File | Rows | Raw Exec | Actionable Exec | Non-Actionable Exec | Wait | Blocked | Top Reasons | Top Classes | Non-Actionable Exec Verdicts |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |',
  ...recent.map((run) => {
    const topReasons = Object.entries(run.reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    const topRunClasses = Object.entries(run.blockerClassCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    const nonActionable = Object.entries(run.nonActionableExecReasons)
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => `${key}:${value}`)
      .join(', ');
    return `| ${run.file} | ${run.rows} | ${run.exec} | ${run.actionableExec} | ${run.nonActionableExec} | ${run.wait} | ${run.blocked} | ${topReasons} | ${topRunClasses} | ${nonActionable || 'none'} |`;
  })
];
fs.writeFileSync(OUT_MD, `${md.join('\n')}\n`, 'utf8');

console.log(
  `[STAGE6_QUALITY_TREND] files=${runs.length} latest=${latest?.file || 'none'} zeroActionableRecent=${zeroActionableExecutableRecent}/10 json=${OUT_JSON}`
);
