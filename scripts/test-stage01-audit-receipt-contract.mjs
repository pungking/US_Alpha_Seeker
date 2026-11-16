import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditStage01Receipts, auditStage01ReceiptsWithV2 } from '../services/stage01AuditReceiptContract.mjs';

const H = s => createHash('sha256').update(s).digest('hex');
const h = k => k.repeat(64);
const run = { repository: 'pungking/US_Alpha_Seeker', workflow: 'fixture', githubRunId: 17, runAttempt: 1,
  commitSha: 'a'.repeat(40), referenceTime: '2026-11-13T17:45:00Z' };
const s0 = { manifest: { schemaVersion: 'stage0-source-truth-v2', runId: 'stage0-fixture', generatedAt: '2026-11-13T17:00:00Z',
  sourceInventorySha256: h('a'), inputHash: h('b'), outputHash: h('c'), stageProgressionGate: 'STAGE0_LOCKED' }, universe: [] };
const encode = o => new TextEncoder().encode(JSON.stringify(o));
const raw0 = encode(s0);
const s1 = { manifest: { schemaVersion: 'stage1-point-in-time-v2', runId: 'stage1-fixture', generatedAt: '2026-11-13T17:30:00Z',
  decisionAt: '2026-11-13T17:25:00Z', sourceStage0File: 'STAGE0_MASTER_UNIVERSE_FIXTURE.json', sourceStage0RunId: s0.manifest.runId,
  sourceStage0InputHash: s0.manifest.inputHash, sourceStage0OutputHash: s0.manifest.outputHash,
  sourceStage0InventorySha256: s0.manifest.sourceInventorySha256, inputHash: h('d'), outputHash: h('e'),
  unresolvedPromotionRows: 0, downstreamPolicyChanged: false }, investable_universe: [] };
const item = (fileName, bytes) => ({ availability: 'PRESENT', bytes, expectedRawSha256: H(bytes), fileName, origin: { ...run } });
const valid = () => ({ run: { ...run }, stage0: item('STAGE0_MASTER_UNIVERSE_FIXTURE.json', raw0),
  stage1: { ...item('STAGE1_PURIFIED_UNIVERSE_FIXTURE.json', encode(s1)), sourceStage0RawSha256: H(raw0) } });
const check = (label, mutate, expected) => {
  const v = valid(); mutate(v);
  const result = auditStage01Receipts(v);
  assert.equal(result.verdict, 'WITHHELD', label);
  assert.equal(result.finalQualityJudgement, 'withheld', label);
  assert.ok(result.issues.includes(expected), label + ': ' + JSON.stringify(result.issues));
  assert.equal(result.requestCount, 0);
};
const selfConsistent = auditStage01Receipts(valid()); // A01 A02: consistency alone cannot attest provenance
assert.equal(selfConsistent.verdict, 'CONSISTENT_UNATTESTED');
assert.equal(selfConsistent.finalQualityJudgement, 'withheld');
assert.equal(selfConsistent.provenanceAttested, false);
assert.equal(selfConsistent.stageV2Validated, false);
assert.equal(selfConsistent.status.stage0, 'PRESENT_SELF_CONSISTENT');
assert.equal(selfConsistent.status.stage1, 'PRESENT_SELF_CONSISTENT');
// Critical regression: plausible but entirely fabricated fixture hashes/Run values
// must NEVER be promoted to evidence or investment-quality PASS.
const forged = valid();
forged.run.githubRunId = 987654321;
forged.run.commitSha = 'f'.repeat(40);
forged.stage0.origin = { ...forged.run };
forged.stage1.origin = { ...forged.run };
forged.stage0.expectedRawSha256 = H(forged.stage0.bytes);
forged.stage1.expectedRawSha256 = H(forged.stage1.bytes);
const forgedResult = auditStage01Receipts(forged);
assert.equal(forgedResult.verdict, 'CONSISTENT_UNATTESTED');
assert.equal(forgedResult.finalQualityJudgement, 'withheld');
assert.equal(forgedResult.provenanceAttested, false);
check('A03 raw tamper', v => { v.stage0.bytes = new Uint8Array([...v.stage0.bytes, 32]); }, 'STAGE0_RAW_SHA_MISMATCH');
check('A04 historical not exported', v => { v.stage0 = { availability: 'NOT_EXPORTED' }; }, 'CHAIN_INCOMPLETE');
check('A05 source hash forged', v => { v.stage1.sourceStage0RawSha256 = h('f'); }, 'STAGE1_SOURCE_RAW_SHA_UNBOUND');
check('A06 Stage0 future', v => { const j = structuredClone(s0); j.manifest.generatedAt = '2026-11-14T17:00:00Z'; v.stage0 = item(v.stage0.fileName, encode(j)); }, 'STAGE0_PIT_OR_SCHEMA_INVALID');
check('A07 Stage0 bad timestamp', v => { const j = structuredClone(s0); j.manifest.generatedAt = '2026-11-13 17:00:00'; v.stage0 = item(v.stage0.fileName, encode(j)); }, 'STAGE0_PIT_OR_SCHEMA_INVALID');
check('A08 Stage1 lookahead', v => { const j = structuredClone(s1); j.manifest.decisionAt = '2026-11-13T16:00:00Z'; v.stage1 = { ...item(v.stage1.fileName, encode(j)), sourceStage0RawSha256: H(raw0) }; }, 'STAGE1_STAGE0_LOOKAHEAD');
// A09 analyst-target report-only behavior is enforced by existing Stage1 fixture, not by receipt.
check('A10 skipped', v => { v.stage0 = { availability: 'SKIPPED' }; }, 'CHAIN_INCOMPLETE');
check('A11 wrong run', v => { v.stage1.origin.githubRunId++; }, 'STAGE1_CROSS_RUN_MISMATCH');
check('A11 wrong attempt', v => { v.stage1.origin.runAttempt++; }, 'STAGE1_CROSS_RUN_MISMATCH');
check('A11 wrong source commit', v => { v.stage1.origin.commitSha = 'b'.repeat(40); }, 'STAGE1_CROSS_RUN_MISMATCH');
check('A12 invalid JSON', v => { const bytes = new TextEncoder().encode('{oops'); v.stage1 = item(v.stage1.fileName, bytes); }, 'STAGE1_JSON_INVALID');
check('A12 duplicate stage filenames', v => { v.stage1.fileName = v.stage0.fileName; }, 'STAGE1_FILE_IDENTITY_INVALID');
check('A12 unknown availability', v => { v.stage1.availability = 'UNKNOWN'; }, 'STAGE1_AVAILABILITY_UNKNOWN');
assert.deepEqual(auditStage01Receipts(valid()), auditStage01Receipts(valid())); // A13 deterministic
const absent = auditStage01Receipts({ run, stage0: { availability: 'NOT_EXPORTED' }, stage1: { availability: 'NOT_EXPORTED' } });
assert.equal(absent.verdict, 'WITHHELD');
assert.equal(absent.status.stage0, 'NOT_EXPORTED');
assert.equal(absent.status.stage1, 'NOT_EXPORTED'); // A14

// STEP #AS-INTEGRATION-38: independent v2 contract check must reject a
// self-consistent synthetic manifest with arbitrary 64-hex hash claims.
const fakeV2 = await auditStage01ReceiptsWithV2(valid());
assert.equal(fakeV2.verdict, 'WITHHELD');
assert.equal(fakeV2.stageV2Validated, false);
assert.equal(fakeV2.provenanceAttested, false);
assert.equal(fakeV2.anchorAttested, false);
assert.equal(fakeV2.finalQualityJudgement, 'withheld');
assert.ok(fakeV2.issues.includes('STAGE0_V2_CONTRACT_INVALID'));
assert.ok(fakeV2.issues.includes('STAGE1_V2_CONTRACT_INVALID'));
assert.ok(fakeV2.v2Reasons.stage0.length > 0);
assert.ok(fakeV2.v2Reasons.stage1.length > 0);
// Fabricated anchors, even when syntactically plausible, are not trusted.
const forgedV2 = await auditStage01ReceiptsWithV2({
  ...forged, trusted: true, anchorAttested: true,
  signedAnchor: { ...forged.run, trusted: true, sha256: H(forged.stage0.bytes) }
});
assert.equal(forgedV2.verdict, 'WITHHELD');
assert.equal(forgedV2.anchorAttested, false);
assert.equal(forgedV2.provenanceAttested, false);
// Cross-Run Stage0 producer and Stage1 consumer cannot be implicitly approved.
const otherRun = valid();
otherRun.stage1.origin.githubRunId += 1;
const otherRunResult = await auditStage01ReceiptsWithV2(otherRun);
assert.equal(otherRunResult.verdict, 'WITHHELD');
assert.ok(otherRunResult.issues.includes('STAGE1_CROSS_RUN_MISMATCH'));
const otherAttempt = valid();
otherAttempt.stage1.origin.runAttempt += 1;
assert.equal((await auditStage01ReceiptsWithV2(otherAttempt)).verdict, 'WITHHELD');
// Missing/exported-not/skipped cannot be silently treated as verified.
for (const availability of ['MISSING', 'SKIPPED', 'NOT_EXPORTED']) {
  const incomplete = valid();
  incomplete.stage0 = { availability };
  const out = await auditStage01ReceiptsWithV2(incomplete);
  assert.equal(out.verdict, 'WITHHELD');
  assert.equal(out.status.stage0, availability);
  assert.equal(out.stageV2Validated, false);
}
for (const mutate of [
  v => { v.stage1.sourceStage0RawSha256 = h('f'); },
  v => { v.stage0.expectedRawSha256 = h('f'); },
  v => { const b = structuredClone(s1); b.manifest.decisionAt = '2026-11-13T16:00:00Z'; v.stage1 = { ...item(v.stage1.fileName, encode(b)), sourceStage0RawSha256: H(raw0) }; }
]) {
  const input = valid(); mutate(input);
  const out = await auditStage01ReceiptsWithV2(input);
  assert.equal(out.verdict, 'WITHHELD');
  assert.equal(out.finalQualityJudgement, 'withheld');
}
assert.deepEqual(await auditStage01ReceiptsWithV2(valid()), await auditStage01ReceiptsWithV2(valid()));
console.log('[STAGE01_V2_COMPOUND_AUDIT] PASS (v2 contract rejection, forged anchors, cross-run, PIT, skip/export; authenticated provenance=HOLD)');

console.log('[STAGE01_AUDIT_RECEIPT] PASS (offline fail-closed; untrusted receipt cannot attest provenance; raw SHA/PIT/skip/export negatives; requests=0)');
