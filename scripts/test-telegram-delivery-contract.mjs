#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

let contract;
try {
  contract = await import('../services/telegramDeliveryContract.mjs');
} catch {
  assert.fail('Telegram delivery contract helper must exist.');
}

const {
  classifyTelegramNotification,
  evaluateTelegramApiReceipt,
  resolveDeliveryAttempts,
  summarizeChunkDeliveries
} = contract;

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
  alphaAnalysis,
  /const finalDecision = String\(item\?\.finalDecision[\s\S]*?if \(finalDecision\) return finalDecision === 'EXECUTABLE_NOW';[\s\S]*?const bucket/
);
assert.match(
  alphaAnalysis,
  /stage6ExecutableRef\.current = top6Elite\s*\.filter\(isExecutableForTelegramContract\)\s*\.map/
);
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
