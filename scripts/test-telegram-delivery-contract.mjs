#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let contract;
try {
  contract = await import('../services/telegramDeliveryContract.mjs');
} catch {
  assert.fail('Telegram delivery contract helper must exist.');
}

let executionSurfaceContract;
try {
  executionSurfaceContract = await import('../services/stage6ExecutionSurfaceContract.mjs');
} catch {
  assert.fail('Stage6 execution surface contract helper must exist.');
}

const {
  classifyTelegramNotification,
  evaluateTelegramApiReceipt,
  resolveDeliveryAttempts,
  summarizeChunkDeliveries
} = contract;
const {
  classifyMarketPulseIntegrity,
  isExecutableForTelegramContract,
  reconcileStage6ExecutionSurfaces,
  summarizeReportOnlyConcentration
} = executionSurfaceContract;

const finalizedSurfaces = reconcileStage6ExecutionSurfaces(
  [
    { symbol: 'LATEWAIT', finalDecision: 'EXECUTABLE_NOW', executionBucket: 'EXECUTABLE' },
    { symbol: 'WAIT', finalDecision: 'WAIT_PRICE', executionBucket: 'WATCHLIST' }
  ],
  [{ symbol: 'LATEWAIT', finalDecision: 'WAIT_PRICE', executionBucket: 'WATCHLIST' }]
);
assert.equal(finalizedSurfaces.modelTop6[0].finalDecision, 'WAIT_PRICE');
assert.deepEqual(finalizedSurfaces.executablePicks, []);
assert.deepEqual(finalizedSurfaces.watchlistTop.map((row) => row.symbol), ['LATEWAIT', 'WAIT']);
assert.equal(isExecutableForTelegramContract({ finalDecision: 'EXECUTABLE_NOW' }), true);
assert.equal(isExecutableForTelegramContract({ finalDecision: 'WAIT_PRICE', executionBucket: 'EXECUTABLE' }), false);
assert.equal(
  isExecutableForTelegramContract({ executionBucket: 'EXECUTABLE', executionReason: 'VALID_EXEC' }),
  false,
  'missing finalized decision must fail closed'
);

const paritySurfaces = reconcileStage6ExecutionSurfaces(
  [
    { symbol: 'EXEC', finalDecision: 'EXECUTABLE_NOW' },
    { symbol: 'BLOCKED', finalDecision: 'WAIT_PRICE' }
  ],
  [
    { symbol: 'EXEC', finalDecision: 'EXECUTABLE_NOW' },
    { symbol: 'BLOCKED', finalDecision: 'WAIT_PRICE' }
  ]
);
assert.deepEqual(paritySurfaces.executablePicks.map((row) => row.symbol), ['EXEC']);
assert.deepEqual(paritySurfaces.watchlistTop.map((row) => row.symbol), ['BLOCKED']);
assert.deepEqual(
  new Set([...paritySurfaces.executablePicks, ...paritySurfaces.watchlistTop].map((row) => row.symbol)),
  new Set(paritySurfaces.modelTop6.map((row) => row.symbol))
);

const earningsSurface = reconcileStage6ExecutionSurfaces(
  [{ symbol: 'EVENT', finalDecision: 'EXECUTABLE_NOW' }],
  [{
    symbol: 'EVENT',
    finalDecision: 'WAIT_PRICE',
    decisionReason: 'wait_earnings_data_missing_quality_floor',
    earningsCoverageStatus: 'EARNINGS_SOURCE_MISSING'
  }]
);
assert.equal(earningsSurface.executablePicks.length, 0);
assert.equal(earningsSurface.watchlistTop[0].earningsCoverageStatus, 'EARNINGS_SOURCE_MISSING');

const renamedParitySurfaces = reconcileStage6ExecutionSurfaces(
  paritySurfaces.modelTop6.map((row, index) => ({ ...row, symbol: `RENAMED_${index}` })),
  paritySurfaces.modelTop6.map((row, index) => ({ ...row, symbol: `RENAMED_${index}` }))
);
assert.deepEqual(
  renamedParitySurfaces.modelTop6.map((row) => row.finalDecision),
  paritySurfaces.modelTop6.map((row) => row.finalDecision),
  'ticker rename must not change finalized decision semantics'
);

assert.throws(
  () => reconcileStage6ExecutionSurfaces([], [
    { symbol: 'PRIVATE_DUPLICATE', finalDecision: 'EXECUTABLE_NOW' },
    { symbol: 'PRIVATE_DUPLICATE', finalDecision: 'EXECUTABLE_NOW' }
  ]),
  (error) => error?.message === 'STAGE6_EXECUTION_SURFACE_DUPLICATE_FINALIZED_IDENTITY'
    && !error.message.includes('PRIVATE_DUPLICATE')
);
assert.throws(
  () => reconcileStage6ExecutionSurfaces([
    { symbol: 'PRIVATE_MODEL_DUPLICATE', finalDecision: 'WAIT_PRICE' },
    { symbol: 'PRIVATE_MODEL_DUPLICATE', finalDecision: 'WAIT_PRICE' }
  ], []),
  (error) => error?.message === 'STAGE6_EXECUTION_SURFACE_DUPLICATE_MODEL_TOP6_IDENTITY'
    && !error.message.includes('PRIVATE_MODEL_DUPLICATE')
);

const staleMixedPulse = classifyMarketPulseIntegrity({
  SPX: { sourceAsOf: '2026-08-25T13:43:00.000Z', grain: 'INTRADAY' },
  NDX: { sourceAsOf: '2026-08-25T13:43:00.000Z', grain: 'INTRADAY' },
  IXIC: { sourceAsOf: '2026-08-25T13:43:00.000Z', grain: 'INTRADAY' },
  VIX: { sourceAsOf: '2026-08-24T20:00:00.000Z', grain: 'PREVIOUS_CLOSE', stale: true }
}, '2026-08-25T13:43:05.000Z');
assert.equal(staleMixedPulse.status, 'MARKET_PULSE_STALE_OR_GRAIN_MISMATCH');
assert.equal(staleMixedPulse.staleRows, 1);
assert.equal(staleMixedPulse.mixedGrain, true);
assert.equal(staleMixedPulse.unknownOrUnclassifiedRows, 0);

const unavailablePulse = classifyMarketPulseIntegrity({
  SPX: {}, NDX: {}, IXIC: {}, VIX: {}
}, '2026-08-25T13:43:05.000Z');
assert.equal(unavailablePulse.status, 'MARKET_PULSE_SOURCE_AS_OF_UNAVAILABLE');
assert.equal(unavailablePulse.sourceAsOfUnavailableRows, 4);
assert.equal(unavailablePulse.unknownOrUnclassifiedRows, 0);
assert.deepEqual(unavailablePulse, classifyMarketPulseIntegrity(
  { SPX: {}, NDX: {}, IXIC: {}, VIX: {} },
  '2026-08-25T13:43:05.000Z'
));

const unverifiedGrainPulse = classifyMarketPulseIntegrity({
  SPX: { sourceAsOf: '2026-08-25T13:43:00.000Z' },
  NDX: { sourceAsOf: '2026-08-25T13:43:00.000Z' },
  IXIC: { sourceAsOf: '2026-08-25T13:43:00.000Z' },
  VIX: { sourceAsOf: '2026-08-25T13:43:00.000Z' }
}, '2026-08-25T13:43:05.000Z');
assert.equal(unverifiedGrainPulse.status, 'MARKET_PULSE_GRAIN_UNVERIFIED');
assert.equal(unverifiedGrainPulse.unverifiedGrainRows, 4);

const concentrationA = summarizeReportOnlyConcentration([
  { symbol: 'AAA', sector: 'Health', industry: 'Biotech', theme: 'Growth' },
  { symbol: 'BBB', sector: 'Health', industry: 'Biotech', theme: 'Growth' },
  { symbol: 'CCC', sector: 'Energy', industry: 'Tankers', theme: 'Cyclical' }
]);
const concentrationB = summarizeReportOnlyConcentration([
  { symbol: 'RENAMED1', sector: 'Health', industry: 'Biotech', theme: 'Growth' },
  { symbol: 'RENAMED2', sector: 'Health', industry: 'Biotech', theme: 'Growth' },
  { symbol: 'RENAMED3', sector: 'Energy', industry: 'Tankers', theme: 'Cyclical' }
]);
assert.deepEqual(concentrationA, concentrationB, 'ticker rename must not change concentration evidence');
assert.equal(concentrationA.policyImpact, 'NONE_REPORT_ONLY');
assert.equal(JSON.stringify(concentrationA).includes('AAA'), false, 'aggregate concentration must redact symbols');

assert.deepEqual(
  classifyTelegramNotification({
    reportGenerated: true,
    contractIntegrityStatus: 'PASS',
    sendAttempted: true,
    deliverySucceeded: true,
    chunkCount: 2,
    deliveryPath: 'direct'
  }),
  {
    status: 'TELEGRAM_DELIVERED',
    reportGenerated: true,
    contractIntegrityStatus: 'PASS',
    suppressionReason: null,
    configPresent: null,
    sendAttempted: true,
    deliverySucceeded: true,
    routeTag: 'PRIMARY',
    chunkCount: 2,
    deliveryPath: 'direct',
    errorCategory: null
  }
);

assert.equal(
  classifyTelegramNotification({
    reportGenerated: true,
    contractIntegrityStatus: 'MISMATCH',
    suppressionReason: 'TELEGRAM_CONTRACT_MISMATCH'
  }).status,
  'TELEGRAM_SUPPRESSED_CONTRACT_MISMATCH'
);
assert.equal(classifyTelegramNotification({ reportGenerated: false }).status, 'TELEGRAM_SKIPPED_EMPTY_PAYLOAD');
assert.equal(
  classifyTelegramNotification({ reportGenerated: true, configPresent: false }).status,
  'TELEGRAM_CONFIG_MISSING'
);
assert.equal(
  classifyTelegramNotification(classifyTelegramNotification({ reportGenerated: true, configPresent: false })).status,
  'TELEGRAM_CONFIG_MISSING'
);
assert.equal(
  classifyTelegramNotification({ reportGenerated: true, sendAttempted: false }).status,
  'TELEGRAM_DELIVERY_RECEIPT_MISSING'
);
assert.equal(
  classifyTelegramNotification({
    reportGenerated: true,
    sendAttempted: false,
    deliverySucceeded: true,
    chunkCount: 1
  }).deliverySucceeded,
  false
);

assert.equal(evaluateTelegramApiReceipt(true, 200, { ok: true }).ok, true);
assert.equal(evaluateTelegramApiReceipt(true, 200, { ok: false }).ok, false);
assert.equal(evaluateTelegramApiReceipt(true, 200, null).errorCategory, 'RESPONSE_BODY_INVALID');
assert.deepEqual(
  evaluateTelegramApiReceipt(false, 400, {
    ok: false,
    description: "Bad Request: can't parse entities: Can't find end of the entity"
  }),
  { ok: false, parseError: true, errorCategory: 'TELEGRAM_PARSE_REJECTED' }
);
assert.deepEqual(
  evaluateTelegramApiReceipt(false, 400, { ok: false, description: 'Bad Request: chat not found' }),
  { ok: false, parseError: false, errorCategory: 'TELEGRAM_DESTINATION_REJECTED' }
);
assert.deepEqual(
  resolveDeliveryAttempts([
    { ok: false, deliveryPath: 'proxy', errorCategory: 'PROXY_UNAVAILABLE' },
    { ok: true, deliveryPath: 'direct', errorCategory: null }
  ]),
  { ok: true, deliveryPath: 'direct', errorCategory: null }
);
assert.equal(
  resolveDeliveryAttempts([{ ok: false, deliveryPath: 'direct', errorCategory: 'NETWORK_ERROR' }]).errorCategory,
  'NETWORK_ERROR'
);

assert.deepEqual(
  summarizeChunkDeliveries([
    { ok: true, deliveryPath: 'proxy' },
    { ok: true, deliveryPath: 'direct' }
  ]),
  { deliverySucceeded: true, chunkCount: 2, deliveryPath: 'mixed', errorCategory: null }
);
assert.equal(
  summarizeChunkDeliveries([
    { ok: true, deliveryPath: 'direct' },
    { ok: false, deliveryPath: null, errorCategory: 'TELEGRAM_API_REJECTED' }
  ]).deliverySucceeded,
  false
);

const service = read('services/telegramService.ts');
const intelligence = read('services/intelligenceService.ts');
const alphaAnalysis = read('components/AlphaAnalysis.tsx');
const executionSurfaces = read('services/stage6ExecutionSurfaceContract.mjs');
const automate = read('automate.js');
const app = read('App.tsx');
assert.match(service, /json[?.]*\.ok\s*===\s*true|evaluateTelegramApiReceipt/);
assert.doesNotMatch(automate, /Alpha Report Generated & Telegram Triggered/);
assert.match(automate, /Telegram Delivered/);
assert.match(automate, /__AUTO_TELEGRAM_STATUS/);
assert.match(app, /__AUTO_TELEGRAM_STATUS/);
assert.doesNotMatch(service, /maskedToken|maskChatId|Chat ID:|Token Status:/);
assert.match(intelligence, /const hasExecutableContract = Array\.isArray\(contractContext\?\.executablePicks\)/);
assert.match(
  intelligence,
  /const executablePicks = hasExecutableContract\s*\? contextExecutablePicks\.slice\(0, 6\)/
);
assert.match(
  executionSurfaces,
  /const finalDecision = String\(item\?\.finalDecision[\s\S]*?return finalDecision === 'EXECUTABLE_NOW';/
);
assert.doesNotMatch(executionSurfaces, /return typeof feasible === 'boolean' \? feasible : true/);
assert.match(
  alphaAnalysis,
  /const finalizedExecutionSurfaces = reconcileStage6ExecutionSurfaces\(modelTop6Pool, top6Elite\)/
);
assert.match(
  alphaAnalysis,
  /stage6ModelTop6Ref\.current = finalizedModelTop6Pool[\s\S]*?stage6WatchlistTopRef\.current = finalizedModelTop6Watchlist[\s\S]*?stage6ExecutableRef\.current = finalizedExecutionSurfaces\.executablePicks/
);
assert.match(
  alphaAnalysis,
  /execution_contract:\s*\{[\s\S]*?modelTop6: finalizedModelTop6Pool\.map\(toExecutionContractItem\)[\s\S]*?executablePicks: executableContractPool\.map\(toExecutionContractItem\)[\s\S]*?watchlistTop: finalizedModelTop6Watchlist\.map\(toExecutionContractItem\)/
);
assert.match(intelligence, /Model Expected Return/);
// Exercise the shared AUTO/MANUAL checker with the producer's actual return label.
const checkerSource = alphaAnalysis.slice(
  alphaAnalysis.indexOf('  const normalizeContractSymbol ='),
  alphaAnalysis.indexOf('  const archiveTelegramIntegrityFailure =')
);
assert.ok(checkerSource.includes('const checkTelegramContractIntegrity ='));
const checkerJs = ts.transpileModule(`${checkerSource}\nreturn checkTelegramContractIntegrity;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;
const checkBrief = new Function('isExecutableForTelegramContract', checkerJs)(isExecutableForTelegramContract);
const candidate = {
  symbol: 'LABELFIXTURE', finalDecision: 'EXECUTABLE_NOW',
  entryExecPrice: 100, targetPrice: 125, stopLoss: 90, gatedExpectedReturn: '+25%'
};
const producerReturnLine = intelligence.split('\n')
  .find((line) => line.includes('Model Expected Return: ${expReturn}'));
assert.ok(producerReturnLine, 'fixture must track the actual producer label');
const brief = (returnLine) => `1. LABELFIXTURE (fixture)\n진입 $100 | 목표 $125 | 손절 $90\n${returnLine}`;
const currentBrief = brief(producerReturnLine.trim().replace('${expReturn}', '+25%'));
assert.equal(checkBrief([candidate], currentBrief).ok, true, 'current producer label must not suppress a valid report');
for (const label of ['Exp. Return', 'Exp Return']) {
  assert.equal(checkBrief([candidate], brief(`${label}: +25%`)).ok, true, 'legacy labels remain readable');
}
for (const invalid of [
  currentBrief.replace('+25%', '+45%'),
  currentBrief.replace('$100', '$110'),
  currentBrief.replace('$125', '$145'),
  currentBrief.replace('$90', '$95'),
  currentBrief.replace('LABELFIXTURE', 'OTHERFIXTURE'),
  brief(''), brief('Model ER%: +25%'), brief('Consensus Expected Return: +25%')
]) {
  assert.equal(checkBrief([candidate], invalid).ok, false, 'missing or conflicting evidence still fails closed');
}
assert.deepEqual(checkBrief([candidate], currentBrief), checkBrief([candidate], currentBrief));
assert.match(intelligence, /Model ER/);
assert.match(intelligence, /모델확신/);
assert.match(intelligence, /데이터완전성/);
assert.match(intelligence, /EARNINGS_EVIDENCE_UNAVAILABLE/);
assert.match(intelligence, /RetrievedAt:/);
assert.match(intelligence, /SourceAsOf:/);
assert.doesNotMatch(intelligence, /Source: \$\{pulseSourceLabel\} \| CapturedAt:/);
assert.deepEqual(
  classifyTelegramNotification({ reportGenerated: true, sendAttempted: false }),
  classifyTelegramNotification({ reportGenerated: true, sendAttempted: false })
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-status-'));
const outJson = path.join(tempDir, 'status.json');
const outMd = path.join(tempDir, 'status.md');
const safeEvidence = {
  schemaVersion: 'auto_scheduler_run_status.v1',
  telegram: classifyTelegramNotification({
    reportGenerated: true,
    contractIntegrityStatus: 'MISMATCH',
    suppressionReason: 'TELEGRAM_CONTRACT_MISMATCH'
  }),
  stage6: { file: 'STAGE6_ALPHA_FINAL_fixture.json', hash: 'a'.repeat(64), sourceRunId: 'fixture-run' }
};
fs.writeFileSync(outJson, JSON.stringify(safeEvidence), 'utf8');
const writer = spawnSync(process.execPath, ['scripts/write-auto-scheduler-run-status.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    AUTO_SCHEDULER_RUN_STATUS_JSON: outJson,
    AUTO_SCHEDULER_RUN_STATUS_MD: outMd,
    AUTOMATION_PHASE: 'completed',
    AUTOMATION_EXIT_CODE: '0'
  }
});
assert.equal(writer.status, 0, writer.stderr || writer.stdout);
const rewritten = JSON.parse(fs.readFileSync(outJson, 'utf8'));
assert.deepEqual(rewritten.telegram, safeEvidence.telegram);
assert.deepEqual(rewritten.stage6, safeEvidence.stage6);

const serialized = JSON.stringify(rewritten);
for (const forbidden of ['token', 'chatId', 'rawResponse', 'messageBody']) {
  assert.equal(serialized.includes(`\"${forbidden}\"`), false, `${forbidden} leaked into status evidence`);
}

console.log('[TELEGRAM_DELIVERY_CONTRACT_TEST] pass');
