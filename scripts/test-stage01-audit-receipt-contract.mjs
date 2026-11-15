import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditStage01Receipts } from '../services/stage01AuditReceiptContract.mjs';

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
assert.equal(auditStage01Receipts(valid()).verdict, 'PASS_EVIDENCE_ONLY'); // A01 A02
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
console.log('[STAGE01_AUDIT_RECEIPT] PASS (offline; raw SHA, PIT, provenance, skip/export negatives; requests=0)');
