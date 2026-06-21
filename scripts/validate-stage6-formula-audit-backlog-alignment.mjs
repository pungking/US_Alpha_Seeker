#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = process.cwd();
const FIXTURE_DIR = path.join(REPO_ROOT, 'docs/fixtures/stage6_fresh_focus_formula');
const FRESH_FOCUS_SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-fresh-focus-audit.mjs');
const BACKLOG_SCRIPT = path.join(REPO_ROOT, 'scripts/build-stage6-formula-tuning-backlog.mjs');
const OUT_JSON = process.env.STAGE6_FORMULA_ALIGNMENT_OUT_JSON || 'state/stage6-formula-audit-backlog-alignment.json';
const OUT_MD = process.env.STAGE6_FORMULA_ALIGNMENT_OUT_MD || 'state/stage6-formula-audit-backlog-alignment.md';

const CASES = [
  {
    name: 'complete_formula_contract_aligns',
    fixture: 'STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json',
    expectedFreshOverall: 'pass_executable_present_focus_fields_ok',
    expectedBacklogOverall: 'pass_formula_tuning_backlog_ready',
    expectedFreshIssues: { manifest: 0, lane: 0, evidence: 0, laneSpecific: 0 },
    expectedBacklogIssues: { contract: 0, missingFormula: 0, missingLaneSpecific: 0, laneMismatch: 0, evidenceWeak: 0 }
  },
  {
    name: 'missing_formula_fields_routes_to_refresh',
    fixture: 'STAGE6_ALPHA_FINAL_MISSING_FORMULA.fixture.json',
    expectedFreshOverall: 'warn_formula_bottleneck_fields_missing',
    expectedBacklogOverall: 'warn_formula_tuning_formula_fields_missing',
    expectedFreshIssues: { manifest: 0, lane: 1, evidence: 1, laneSpecific: 1 },
    expectedBacklogIssues: { contract: 0, missingFormula: 1, missingLaneSpecific: 1, laneMismatch: 0, evidenceWeak: 0 }
  },
  {
    name: 'missing_formula_contract_routes_to_contract_refresh',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_CONTRACT_MISSING.fixture.json',
    expectedFreshOverall: 'warn_formula_contract_missing_or_mismatch',
    expectedBacklogOverall: 'warn_formula_tuning_contract_incomplete',
    expectedFreshIssues: { manifest: 1, lane: 0, evidence: 0, laneSpecific: 3 },
    expectedBacklogIssues: { contract: 1, missingFormula: 0, missingLaneSpecific: 3, laneMismatch: 0, evidenceWeak: 0 }
  },
  {
    name: 'formula_lane_mismatch_blocks_backlog_ready',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_MISMATCH.fixture.json',
    expectedFreshOverall: 'warn_formula_bottleneck_lane_mismatch',
    expectedBacklogOverall: 'warn_formula_tuning_lane_mismatch',
    expectedFreshIssues: { manifest: 0, lane: 2, evidence: 2, laneSpecific: 0 },
    expectedBacklogIssues: { contract: 0, missingFormula: 0, missingLaneSpecific: 0, laneMismatch: 2, evidenceWeak: 0 }
  },
  {
    name: 'weak_formula_evidence_blocks_backlog_ready',
    fixture: 'STAGE6_ALPHA_FINAL_FORMULA_EVIDENCE_WEAK.fixture.json',
    expectedFreshOverall: 'warn_formula_bottleneck_evidence_weak',
    expectedBacklogOverall: 'warn_formula_tuning_evidence_weak',
    expectedFreshIssues: { manifest: 0, lane: 0, evidence: 1, laneSpecific: 1 },
    expectedBacklogIssues: { contract: 0, missingFormula: 0, missingLaneSpecific: 0, laneMismatch: 0, evidenceWeak: 1 }
  }
];

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function runNode(script, env) {
  const result = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(script)} failed status=${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

function runCase(testCase) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `stage6-formula-align-${testCase.name}-`));
  const fixturePath = path.join(FIXTURE_DIR, testCase.fixture);
  const freshJson = path.join(tmp, 'fresh-focus.json');
  const freshMd = path.join(tmp, 'fresh-focus.md');
  const backlogJson = path.join(tmp, 'backlog.json');
  const backlogMd = path.join(tmp, 'backlog.md');

  runNode(FRESH_FOCUS_SCRIPT, {
    STAGE6_FOCUS_AUDIT_STAGE6_PATH: fixturePath,
    STAGE6_FOCUS_AUDIT_OUT_JSON: freshJson,
    STAGE6_FOCUS_AUDIT_OUT_MD: freshMd
  });
  runNode(BACKLOG_SCRIPT, {
    STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH: fixturePath,
    STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON: backlogJson,
    STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD: backlogMd
  });

  const fresh = readJson(freshJson);
  const backlog = readJson(backlogJson);
  assertEqual(`${testCase.name}.fresh.overall`, fresh.overall, testCase.expectedFreshOverall);
  assertEqual(`${testCase.name}.backlog.overall`, backlog.overall, testCase.expectedBacklogOverall);

  assertEqual(`${testCase.name}.fresh.formulaManifestContractIssues`, number(fresh.summary?.formulaManifestContractIssues), testCase.expectedFreshIssues.manifest);
  assertEqual(`${testCase.name}.fresh.formulaLaneConsistencyIssues`, number(fresh.summary?.formulaLaneConsistencyIssues), testCase.expectedFreshIssues.lane);
  assertEqual(`${testCase.name}.fresh.formulaEvidenceQualityIssues`, number(fresh.summary?.formulaEvidenceQualityIssues), testCase.expectedFreshIssues.evidence);
  assertEqual(`${testCase.name}.fresh.laneSpecificFormulaEvidenceIssues`, number(fresh.summary?.laneSpecificFormulaEvidenceIssues), testCase.expectedFreshIssues.laneSpecific);

  assertEqual(`${testCase.name}.backlog.formulaContractIssues`, number(backlog.summary?.formulaContractIssues), testCase.expectedBacklogIssues.contract);
  assertEqual(`${testCase.name}.backlog.missingFormulaRows`, number(backlog.summary?.missingFormulaRows), testCase.expectedBacklogIssues.missingFormula);
  assertEqual(`${testCase.name}.backlog.missingLaneSpecificRows`, number(backlog.summary?.missingLaneSpecificRows), testCase.expectedBacklogIssues.missingLaneSpecific);
  assertEqual(`${testCase.name}.backlog.formulaLaneMismatchRows`, number(backlog.summary?.formulaLaneMismatchRows), testCase.expectedBacklogIssues.laneMismatch);
  assertEqual(`${testCase.name}.backlog.formulaEvidenceWeakRows`, number(backlog.summary?.formulaEvidenceWeakRows), testCase.expectedBacklogIssues.evidenceWeak);

  if (fresh.summary?.formulaManifestContractIssues > 0 && backlog.summary?.formulaContractIssues === 0) {
    throw new Error(`${testCase.name}: fresh contract issue must be visible in backlog`);
  }
  if (
    fresh.summary?.laneSpecificFormulaEvidenceIssues > 0 &&
    backlog.summary?.missingLaneSpecificRows === 0 &&
    backlog.summary?.formulaEvidenceWeakRows === 0
  ) {
    throw new Error(`${testCase.name}: lane-specific evidence issue must be visible in backlog as missing or weak evidence`);
  }
  if (fresh.overall.startsWith('pass') && !backlog.overall.startsWith('pass')) {
    throw new Error(`${testCase.name}: fresh pass cannot map to backlog warning`);
  }

  return {
    name: testCase.name,
    fixture: testCase.fixture,
    freshOverall: fresh.overall,
    backlogOverall: backlog.overall,
    freshIssues: {
      manifest: number(fresh.summary?.formulaManifestContractIssues),
      lane: number(fresh.summary?.formulaLaneConsistencyIssues),
      evidence: number(fresh.summary?.formulaEvidenceQualityIssues),
      laneSpecific: number(fresh.summary?.laneSpecificFormulaEvidenceIssues)
    },
    backlogIssues: {
      contract: number(backlog.summary?.formulaContractIssues),
      missingFormula: number(backlog.summary?.missingFormulaRows),
      missingLaneSpecific: number(backlog.summary?.missingLaneSpecificRows),
      laneMismatch: number(backlog.summary?.formulaLaneMismatchRows),
      evidenceWeak: number(backlog.summary?.formulaEvidenceWeakRows)
    },
    safety: {
      brokerMutationAllowed: backlog.summary?.brokerMutationAllowed === false,
      sidecarMutationAllowed: backlog.summary?.sidecarMutationAllowed === false
    }
  };
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function markdown(report) {
  const lines = [];
  lines.push('# Stage6 Formula Audit / Backlog Alignment');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push('- Safety: report-only; no broker/state mutation.');
  lines.push('');
  lines.push('| Case | Fresh Focus | Backlog | Fresh Issues | Backlog Issues |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of report.cases) {
    lines.push(`| ${esc(row.name)} | ${esc(row.freshOverall)} | ${esc(row.backlogOverall)} | ${esc(JSON.stringify(row.freshIssues))} | ${esc(JSON.stringify(row.backlogIssues))} |`);
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- Fresh-focus audit owns row-level formula evidence quality.');
  lines.push('- Formula tuning backlog owns producer action routing.');
  lines.push('- Contract or lane-specific field gaps must route to refresh/contract repair, not threshold tuning.');
  lines.push('- Passing alignment means both reports agree before any Stage6 producer threshold adjustment.');
  return `${lines.join('\n')}\n`;
}

const cases = CASES.map(runCase);
const report = {
  generatedAt: new Date().toISOString(),
  overall: 'pass_formula_audit_backlog_alignment',
  cases,
  safety: {
    reportOnly: true,
    brokerMutation: false,
    stateMutation: false
  }
};
ensureParent(OUT_JSON);
fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`);
ensureParent(OUT_MD);
fs.writeFileSync(resolveRepo(OUT_MD), markdown(report));
console.log(`[STAGE6_FORMULA_AUDIT_BACKLOG_ALIGNMENT] PASS cases=${cases.length} json=${OUT_JSON}`);
