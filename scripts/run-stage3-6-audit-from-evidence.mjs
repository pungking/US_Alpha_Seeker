#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

function usage() {
  return [
    'Usage:',
    '  node scripts/run-stage3-6-audit-from-evidence.mjs --evidence-dir <automation-evidence-dir> [--expected-source-sha <sha>]',
    '',
    'Example:',
    '  node scripts/run-stage3-6-audit-from-evidence.mjs --evidence-dir /tmp/run/automation-evidence',
    '',
    'This is report-only. It regenerates Stage3-6 audit reports from a downloaded',
    'Auto-Scheduler automation-evidence artifact without touching broker or sidecar state.'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    evidenceDir: process.env.STAGE36_EVIDENCE_DIR || '',
    expectedSourceSha: process.env.STAGE36_EXPECTED_SOURCE_SHA || ''
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--evidence-dir') {
      args.evidenceDir = argv[++i] || '';
    } else if (arg === '--expected-source-sha') {
      args.expectedSourceSha = argv[++i] || '';
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertDir(dir, label) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`${label} directory missing: ${dir}`);
  }
}

function runStep(label, script, env) {
  const result = spawnSync(process.execPath, [path.resolve(ROOT, script)], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.evidenceDir) {
    console.error(usage());
    process.exit(2);
  }

  const evidenceDir = resolvePath(args.evidenceDir);
  assertDir(evidenceDir, 'automation-evidence');

  const stateDir = path.join(evidenceDir, 'state');
  const stage3Dir = path.join(stateDir, 'stage3-audit-source');
  const stage4Dir = path.join(stateDir, 'stage4-audit-source');
  const stage5Dir = path.join(stateDir, 'stage5-audit-source');
  const stage6Dir = path.join(stateDir, 'stage6-audit-source');
  for (const [dir, label] of [
    [stateDir, 'state'],
    [stage3Dir, 'Stage3 source'],
    [stage4Dir, 'Stage4 source'],
    [stage5Dir, 'Stage5 source'],
    [stage6Dir, 'Stage6 source']
  ]) {
    assertDir(dir, label);
  }

  const dispatchPath = path.join(evidenceDir, 'stage6-dispatch-payload.json');
  const dispatch = fs.existsSync(dispatchPath) ? readJson(dispatchPath) : {};
  const expectedSourceSha = String(args.expectedSourceSha || dispatch.sourceSha || '').trim();
  if (!expectedSourceSha) {
    throw new Error('expected source SHA missing; pass --expected-source-sha or include stage6-dispatch-payload.json');
  }

  const commonFreshEnv = {
    STAGE6_FOCUS_AUDIT_STAGE6_DIR: stage6Dir,
    STAGE6_FOCUS_AUDIT_ENFORCE_FRESH_CONTRACT: 'true',
    STAGE6_FOCUS_AUDIT_EXPECTED_SOURCE_SHA: expectedSourceSha,
    STAGE6_RUNTIME_FORMULA_PROOF_STAGE6_DIR: stage6Dir,
    STAGE6_RUNTIME_FORMULA_PROOF_EXPECTED_SOURCE_SHA: expectedSourceSha,
    STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_DIR: stage6Dir,
    STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA: expectedSourceSha,
    STAGE6_FORMULA_TUNING_BACKLOG_ENFORCE_FRESH_SOURCE: 'true'
  };

  runStep('Stage6 fresh-focus audit', 'scripts/build-stage6-fresh-focus-audit.mjs', commonFreshEnv);
  runStep('Stage6 runtime formula proof', 'scripts/build-stage6-runtime-formula-contract-proof.mjs', commonFreshEnv);
  runStep('Stage6 formula tuning backlog', 'scripts/build-stage6-formula-tuning-backlog.mjs', commonFreshEnv);
  runStep('Stage6 producer tuning 2 audit', 'scripts/build-stage6-producer-tuning-2-audit.mjs', {});
  runStep('Stage3-6 full-stage audit', 'scripts/build-stage3-6-full-stage-audit.mjs', {
    STAGE36_FULL_AUDIT_STAGE3_DIR: stage3Dir,
    STAGE36_FULL_AUDIT_STAGE4_DIR: stage4Dir,
    STAGE36_FULL_AUDIT_STAGE5_DIR: stage5Dir,
    STAGE36_FULL_AUDIT_STAGE6_DIR: stage6Dir,
    STAGE36_FULL_AUDIT_SUBREPORT_DIR: 'state'
  });

  const full = readJson(path.resolve(ROOT, 'state/stage3-6-full-stage-audit.json'));
  const fresh = readJson(path.resolve(ROOT, 'state/stage6-fresh-focus-audit.json'));
  console.log([
    '[STAGE3_6_EVIDENCE_AUDIT]',
    `stage6File=${dispatch.stage6File || 'unknown'}`,
    `stage6Hash=${dispatch.stage6Hash || 'unknown'}`,
    `sourceSha=${expectedSourceSha}`,
    `full=${full.overall}`,
    `freshFocus=${fresh.overall}`,
    `freshFocusRuntime=${fresh.runtimeProof?.status || 'unknown'}`
  ].join(' '));
}

try {
  main();
} catch (error) {
  console.error(`[STAGE3_6_EVIDENCE_AUDIT] error=${error?.message || error}`);
  process.exit(1);
}
