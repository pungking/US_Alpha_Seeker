// AS-INTEGRATION-19: offline-only negative tests of the actual Stage3–6 report producer.
// The fixture directory is temporary; no Drive, providers, broker, dispatch or repo state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const stageFiles = {
  stage3: 'STAGE3_FUNDAMENTAL_FULL_FIXTURE.json',
  stage4: 'STAGE4_TECHNICAL_FULL_FIXTURE.json',
  stage5: 'STAGE5_ICT_ELITE_FIXTURE.json',
  stage6: 'STAGE6_ALPHA_FINAL_FIXTURE.json'
};
const keys = {
  stage3: 'fundamental_universe',
  stage4: 'technical_universe',
  stage5: 'ict_universe',
  stage6: 'alpha_candidates'
};
const testRun = (presence) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'stage36-freshness-offline-'));
  try {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith('STAGE36_FULL_AUDIT_')) delete env[key];
    }
    for (const stage of Object.keys(stageFiles)) {
      const dir = path.join(temp, stage);
      fs.mkdirSync(dir, { recursive: true });
      env[`STAGE36_FULL_AUDIT_${stage.toUpperCase()}_DIR`] = dir;
      if (presence.includes(stage)) {
        const recent = new Date().toISOString();
        const barDate = recent.slice(0, 10);
        const row = {
          symbol: 'MOCK', fundamentalScore: 70, qualityScore: 65, compositeAlpha: 68,
          technicalScore: 72, ictScore: 71, convictionScore: 74, expectedReturn: 14,
          updated: recent, quoteTimestamp: recent, lastUpdate: recent,
          priceHistory: [{ date: barDate, open: 10, high: 11, low: 9, close: 10.5, volume: 20 }]
        };
        const manifest = {
          sourceStage3File: stageFiles.stage3,
          sourceStage4File: stageFiles.stage4,
          sourceStage5File: stageFiles.stage5
        };
        fs.writeFileSync(path.join(dir, stageFiles[stage]),
          JSON.stringify({ manifest, [keys[stage]]: [row] }), 'utf8');
      }
    }
    const outJson = path.join(temp, 'full.json');
    env.STAGE36_FULL_AUDIT_OUT_JSON = outJson;
    env.STAGE36_FULL_AUDIT_OUT_MD = path.join(temp, 'full.md');
    env.STAGE36_FULL_AUDIT_SUBREPORT_DIR = path.join(temp, 'subreports');
    const command = spawnSync(process.execPath, ['scripts/build-stage3-6-full-stage-audit.mjs'], {
      cwd: root, env, encoding: 'utf8', timeout: 25000
    });
    assert.equal(command.status, 0, `audit fixture failed: ${command.stderr || command.stdout}`);
    return JSON.parse(fs.readFileSync(outJson, 'utf8'));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
};

const empty = testRun([]);
assert.equal(empty.overall, 'warn_artifacts_missing');
assert.deepEqual(Object.values(empty.inputs).map(item => item.rowCount), [0, 0, 0, 0]);
assert.equal(empty.dataFreshnessPolicy.status, 'warn_data_lineage_or_price_history_gap');
assert.equal(empty.dataFreshnessPolicy.categoryCounts.stage_source_unverified, 4);
assert.equal(empty.dataFreshnessPolicy.reportOnly, true);
assert.equal(empty.formulaTuningFocus.tuningActionAllowed, false);
assert.deepEqual(empty.dataFreshnessPolicy.thresholds, {
  maxFreshnessAgeDays: 5, maxPriceHistoryAgeDays: 5
});

const partial = testRun(['stage3']);
assert.equal(partial.overall, 'warn_artifacts_missing');
assert.equal(partial.dataFreshnessPolicy.categoryCounts.stage_source_unverified, 3);
assert.equal(partial.dataFreshnessPolicy.status, 'warn_data_lineage_or_price_history_gap');
assert.equal(partial.formulaTuningFocus.tuningActionAllowed, false);

const completeFixture = testRun(['stage3', 'stage4', 'stage5', 'stage6']);
assert.equal(completeFixture.dataFreshnessPolicy.categoryCounts.stage_source_unverified, undefined,
  'fixture rows with source files must not be misreported as absent');
assert.equal(completeFixture.dataFreshnessPolicy.thresholds.maxFreshnessAgeDays, 5);
assert.equal(completeFixture.dataFreshnessPolicy.thresholds.maxPriceHistoryAgeDays, 5);
assert.equal(completeFixture.formulaTuningFocus.tuningActionAllowed, false,
  'synthetic input cannot provide real fresh Stage6 runtime proof');
for (const report of [empty, partial, completeFixture]) {
  assert.equal(report.safety.reportOnly, true);
  assert.equal(report.safety.brokerMutationAllowed, false);
  assert.equal(report.safety.sidecarMutationAllowed, false);
  assert.equal(report.safety.stateMutationAllowed, false);
}
console.log('[STAGE36_MISSING_SOURCE_FRESHNESS] PASS (no source=no freshness PASS, partial missing, synthetic complete; provider/Drive/broker calls=0)');
