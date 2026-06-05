#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_PAYLOAD = 'stage6-dispatch-payload.json';

function parseBool(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function readJson(filePath) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function checkFlag({ envName, manifestPath, actual, expected }) {
  const ok = actual === expected;
  return {
    envName,
    manifestPath,
    expected,
    actual,
    ok,
    reason: ok ? 'matched' : 'env_manifest_mismatch'
  };
}

function main() {
  const payloadPath = process.env.STAGE6_FLAG_PARITY_PAYLOAD || DEFAULT_PAYLOAD;
  const payload = readJson(payloadPath);
  const gate = payload?.decisionGate || {};
  const flagAudit = payload?.flagPropagationAudit || gate?.flagPropagationAudit || {};
  const checks = [
    checkFlag({
      envName: 'VITE_STAGE6_ADAPTIVE_CURRENT_ENTRY_ENABLED',
      manifestPath: 'decisionGate.adaptiveCurrentEntryEnabled',
      expected: parseBool(process.env.VITE_STAGE6_ADAPTIVE_CURRENT_ENTRY_ENABLED, false),
      actual: Boolean(gate.adaptiveCurrentEntryEnabled)
    }),
    checkFlag({
      envName: 'VITE_STAGE6_CURRENT_ENTRY_STOP_RECALC_ENABLED',
      manifestPath: 'decisionGate.currentEntryStopRecalcEnabled',
      expected: parseBool(process.env.VITE_STAGE6_CURRENT_ENTRY_STOP_RECALC_ENABLED, false),
      actual: Boolean(gate.currentEntryStopRecalcEnabled)
    }),
    checkFlag({
      envName: 'VITE_STAGE6_BREAKOUT_RETEST_PROOF_PROMOTION_ENABLED',
      manifestPath: 'decisionGate.breakoutRetestProofPromotionEnabled',
      expected: parseBool(process.env.VITE_STAGE6_BREAKOUT_RETEST_PROOF_PROMOTION_ENABLED, false),
      actual: Boolean(gate.breakoutRetestProofPromotionEnabled)
    })
  ];
  const missingPayloadFields = [
    !payload?.stage6File ? 'stage6File' : null,
    !payload?.stage6Hash ? 'stage6Hash' : null,
    !payload?.decisionGate ? 'decisionGate' : null
  ].filter(Boolean);
  const mismatches = checks.filter((check) => !check.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    payloadPath,
    stage6File: payload?.stage6File || null,
    stage6Hash: payload?.stage6Hash || null,
    overall: missingPayloadFields.length || mismatches.length ? 'fail' : 'pass',
    missingPayloadFields,
    checks,
    flagPropagationAudit: flagAudit,
    safety: {
      reportOnly: true,
      brokerMutation: false,
      executionPolicyChange: false
    }
  };
  fs.mkdirSync(path.resolve(REPO_ROOT, 'state'), { recursive: true });
  fs.writeFileSync(path.resolve(REPO_ROOT, 'state/stage6-flag-parity-assertion.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[STAGE6_FLAG_PARITY] overall=${report.overall} mismatches=${mismatches.length} missing=${missingPayloadFields.join(',') || 'none'} json=state/stage6-flag-parity-assertion.json`);
  if (report.overall !== 'pass') {
    for (const check of mismatches) {
      console.error(`[STAGE6_FLAG_PARITY_MISMATCH] ${check.envName} expected=${check.expected} actual=${check.actual} path=${check.manifestPath}`);
    }
    process.exit(1);
  }
}

main();
