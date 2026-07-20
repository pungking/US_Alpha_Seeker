#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const sourcePath = 'components/IctAnalysis.tsx';
const text = fs.readFileSync(sourcePath, 'utf8');

const requiredSnippets = [
  'sourceStage4File: selectedStage4Name || null',
  'sourceStage4FileId: selectedStage4Id || null',
  'sourceStage4Timestamp: selectedStage4Timestamp || null',
  'sourceStage4SourceStage3File: stage4SourceStage3File || null',
  'sourceStage4FactorReady: selectedStage4FactorReady',
  'sourceStage4LineageStatus'
];

const missing = requiredSnippets.filter((snippet) => !text.includes(snippet));

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function verifyFullAuditLineage() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage5-lineage-contract-'));
  const stage3 = path.join(tmp, 'STAGE3_FUNDAMENTAL_FULL_2099-01-02_09-30-00.json');
  const stage4 = path.join(tmp, 'STAGE4_TECHNICAL_FULL_2099-01-02_09-40-00.json');
  const stage5 = path.join(tmp, 'STAGE5_ICT_ELITE_50_2099-01-02_09-50-00.json');
  const stage6 = path.join(tmp, 'STAGE6_ALPHA_FINAL_2099-01-02_10-00-00.json');
  const outJson = path.join(tmp, 'full-audit.json');
  const outMd = path.join(tmp, 'full-audit.md');

  writeJson(stage3, { manifest: { timestamp: '2099-01-02T09:30:00Z' }, fundamental_universe: [{ symbol: 'TEST' }] });
  writeJson(stage4, { manifest: { sourceStage3File: path.basename(stage3), timestamp: '2099-01-02T09:40:00Z' }, technical_universe: [{ symbol: 'TEST' }] });
  writeJson(stage5, {
    manifest: {
      sourceStage4File: path.basename(stage4),
      sourceStage4FileId: 'stage4-file-id-fixture',
      sourceStage4Timestamp: '2099-01-02T09:40:00Z',
      sourceStage4SourceStage3File: path.basename(stage3),
      sourceStage4FactorReady: true,
      sourceStage4LineageStatus: 'present',
      timestamp: '2099-01-02T09:50:00Z'
    },
    ict_universe: [{ symbol: 'TEST' }]
  });
  writeJson(stage6, {
    manifest: { sourceStage5File: path.basename(stage5), timestamp: '2099-01-02T10:00:00Z' },
    execution_contract: {
      modelTop6: [{
        symbol: 'TEST',
        finalDecision: 'BLOCKED_RISK',
        decisionReason: 'blocked_rr_below_min',
        entryDistancePct: 5,
        riskRewardRatioValue: 2,
        rrAtCurrentPrice: null,
        targetBufferFromCurrentPct: -1,
        fillabilityPolicyVerdict: 'FILLABILITY_POLICY_BLOCKED',
        entryTimingPolicyVerdict: 'CURRENT_TARGET_BUFFER_BELOW_MIN',
        targetNoTradeConfirmed: true,
        targetRecalibrationNoTradeReason: 'target_not_above_current',
        targetRecalibrationViabilityVerdict: 'TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT'
      }]
    },
    alpha_candidates: []
  });

  const result = spawnSync(process.execPath, ['scripts/build-stage3-6-full-stage-audit.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      STAGE36_FULL_AUDIT_STAGE3_PATH: stage3,
      STAGE36_FULL_AUDIT_STAGE4_PATH: stage4,
      STAGE36_FULL_AUDIT_STAGE5_PATH: stage5,
      STAGE36_FULL_AUDIT_STAGE6_PATH: stage6,
      STAGE36_FULL_AUDIT_OUT_JSON: outJson,
      STAGE36_FULL_AUDIT_OUT_MD: outMd
    },
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    throw new Error(`full-stage lineage fixture failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }

  const audit = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  const lineage = audit.lineage || {};
  if (lineage.status !== 'pass_same_run_lineage' || lineage.stage5MatchesStage4 !== true) {
    throw new Error(`lineage fixture expected pass_same_run_lineage with stage5MatchesStage4=true, got ${JSON.stringify(lineage)}`);
  }
  if (audit.stageVerdicts?.Stage6?.rows !== 1) {
    throw new Error(`full-stage audit expected one execution_contract row when alpha_candidates is empty, got ${audit.stageVerdicts?.Stage6?.rows}`);
  }
  if (audit.stage6EntryEvidence?.status !== 'pass_entry_fillability_evidence_present') {
    throw new Error(`full-stage audit should accept explicit no-trade as explained missing RR evidence, got ${JSON.stringify(audit.stage6EntryEvidence)}`);
  }
  if (audit.stage6EntryEvidence?.policyCounts?.qualityGateLane?.unknown) {
    throw new Error(`non-applicable quality gate must not be reported as unknown: ${JSON.stringify(audit.stage6EntryEvidence.policyCounts.qualityGateLane)}`);
  }
  return {
    status: 'pass_same_run_lineage',
    stage5MatchesStage4: true,
    stage6Rows: 1,
    noTradeRrEvidence: 'explained'
  };
}

let lineageFixture;
try {
  lineageFixture = missing.length ? { status: 'skipped_source_contract_missing' } : verifyFullAuditLineage();
} catch (error) {
  lineageFixture = { status: 'fail_full_stage_lineage_fixture', error: String(error?.message || error) };
}

const failed = missing.length > 0 || lineageFixture.status !== 'pass_same_run_lineage';
const report = {
  generatedAt: new Date().toISOString(),
  overall: failed ? 'fail_stage5_lineage_contract_missing' : 'pass_stage5_lineage_contract',
  sourcePath,
  requiredSnippets,
  missing,
  lineageFixture
};

fs.mkdirSync('state', { recursive: true });
fs.writeFileSync('state/stage5-lineage-contract-validation.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`[STAGE5_LINEAGE_CONTRACT] overall=${report.overall} missing=${missing.length} fixture=${lineageFixture.status}`);
if (failed) process.exit(1);
