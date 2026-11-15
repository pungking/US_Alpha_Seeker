import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

// AS-INTEGRATION-24: run the ACTUAL offline report builder over byte-identified
// fixture artifacts. No provider, Drive, dispatch, Sidecar, broker or repo state.
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const names = {
  stage3: 'STAGE3_FUNDAMENTAL_FULL_TEST.json',
  stage4: 'STAGE4_TECHNICAL_FULL_TEST.json',
  stage5: 'STAGE5_ICT_ELITE_TEST.json',
  stage6: 'STAGE6_ALPHA_FINAL_TEST.json'
};
const rows = {
  stage3: 'fundamental_universe', stage4: 'technical_universe',
  stage5: 'ict_universe', stage6: 'alpha_candidates'
};
function audit(mode = 'baseline') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stage36-sha-lineage-'));
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('STAGE36_FULL_AUDIT_')) delete env[key];
    }
    let prior = null;
    for (const stage of ['stage3', 'stage4', 'stage5', 'stage6']) {
      const dir = path.join(root, stage);
      fs.mkdirSync(dir);
      env[`STAGE36_FULL_AUDIT_${stage.toUpperCase()}_DIR`] = dir;
      const manifest = {};
      if (prior) {
        const n = Number(stage.slice(-1));
        manifest[`sourceStage${n - 1}File`] = names[`stage${n - 1}`];
        manifest[`sourceStage${n - 1}ContentSha256`] = sha256(prior);
      }
      if (stage === 'stage6' && mode === 'missing_stage6_sha') delete manifest.sourceStage5ContentSha256;
      if (stage === 'stage4' && mode === 'falsified_declared_stage3_sha') manifest.sourceStage3ContentSha256 = 'f'.repeat(64);
      const row = { symbol: 'MOCK', fundamentalScore: 65, technicalScore: 66,
        ictScore: 67, compositeAlpha: 68, finalDecision: 'WAIT_PRICE',
        source: 'OFFLINE_FIXTURE', updated: new Date().toISOString(),
        priceHistory: [{ date: new Date().toISOString().slice(0,10), close: 12 }] };
      const original = Buffer.from(JSON.stringify({ manifest, [rows[stage]]: [row] }), 'utf8');
      const bytes = (mode === 'mutated_stage3_bytes' && stage === 'stage3')
        ? Buffer.concat([original, Buffer.from('\n')])
        : original;
      fs.writeFileSync(path.join(dir, names[stage]), bytes);
      // For a real tampering case, Stage4's original expected SHA remains the
      // SHA of the pre-mutation Stage3 bytes. Other stages preserve their bytes.
      prior = mode === 'mutated_stage3_bytes' && stage === 'stage3' ? original : bytes;
    }
    const out = path.join(root, 'report.json');
    env.STAGE36_FULL_AUDIT_OUT_JSON = out;
    env.STAGE36_FULL_AUDIT_OUT_MD = path.join(root, 'report.md');
    env.STAGE36_FULL_AUDIT_SUBREPORT_DIR = path.join(root, 'no-subreports');
    const result = spawnSync(process.execPath, ['scripts/build-stage3-6-full-stage-audit.mjs'],
      { cwd: process.cwd(), env, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(fs.readFileSync(out, 'utf8'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const valid = audit();
assert.equal(valid.lineage.status, 'pass_same_run_lineage');
assert.equal(valid.lineage.finalQualityJudgement, 'enabled');
assert.deepEqual(Object.values(valid.lineage.contentSha256Matches), [true,true,true]);

const changedStage3 = audit('mutated_stage3_bytes');
assert.equal(changedStage3.lineage.status, 'warn_lineage_mismatch');
assert.equal(changedStage3.lineage.contentSha256Matches.stage4_source_stage3, false);
assert.ok(changedStage3.lineage.reason.includes('stage4_source_stage3_raw_sha256_mismatch'));
assert.notEqual(changedStage3.overall, 'pass_stage3_6_full_stage_audit');
assert.equal(changedStage3.lineage.finalQualityJudgement, 'withheld');

const forgedHash = audit('falsified_declared_stage3_sha');
assert.equal(forgedHash.lineage.status, 'warn_lineage_mismatch');
assert.equal(forgedHash.lineage.contentSha256Matches.stage4_source_stage3, false);

const absentHash = audit('missing_stage6_sha');
assert.equal(absentHash.lineage.status, 'warn_lineage_incomplete');
assert.equal(absentHash.lineage.contentSha256Matches.stage6_source_stage5, null);
assert.ok(absentHash.lineage.reason.includes('stage6_source_stage5_raw_sha256_missing_or_invalid'));
for (const a of [valid, changedStage3, forgedHash, absentHash]) {
  assert.equal(a.safety.reportOnly, true);
  assert.equal(a.safety.brokerMutationAllowed, false);
  assert.equal(a.safety.sidecarMutationAllowed, false);
  assert.equal(a.safety.stateMutationAllowed, false);
}
console.log('[STAGE36_BYTE_LINEAGE] PASS (actual file bytes, tampering, declared-hash substitution, missing source SHA; requests=0)');
