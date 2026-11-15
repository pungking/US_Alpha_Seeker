// Offline, report-only audit receipts. Does not modify Stage0/1 v2 artifacts.
import { createHash } from 'node:crypto';

const HASH = /^[a-f0-9]{64}$/;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const SHA = /^[a-f0-9]{40}$/;
const MISSING = new Set(['MISSING', 'NOT_EXPORTED', 'SKIPPED']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const isTime = s => typeof s === 'string' && ISO.test(s) && Number.isFinite(Date.parse(s));
const time = s => Date.parse(s);
const printable = x => typeof x === 'string' && x.length > 0 && x.length < 256 && !/[\\/\x00-\x1f]/.test(x);
const object = x => x && typeof x === 'object' && !Array.isArray(x);

export function auditStage01Receipts({ run, stage0, stage1 } = {}) {
  const issues = [];
  const add = code => { if (!issues.includes(code)) issues.push(code); };
  const status = { stage0: 'UNKNOWN_PROVENANCE', stage1: 'UNKNOWN_PROVENANCE' };
  const observed = { stage0: null, stage1: null };
  const provenance = object(run) && typeof run.repository === 'string'
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(run.repository) && printable(run.workflow)
    && Number.isSafeInteger(run.githubRunId) && run.githubRunId > 0
    && Number.isSafeInteger(run.runAttempt) && run.runAttempt > 0
    && SHA.test(run.commitSha || '') && isTime(run.referenceTime);
  if (!provenance) add('RUN_PROVENANCE_INVALID');
  const analyze = (item, stage) => {
    if (!object(item)) { add(`${stage.toUpperCase()}_OBSERVATION_MISSING`); return null; }
    if (MISSING.has(item.availability)) {
      status[stage] = item.availability;
      if (item.bytes != null) add(`${stage.toUpperCase()}_NONPRESENT_HAS_BYTES`);
      return null;
    }
    if (item.availability !== 'PRESENT') { add(`${stage.toUpperCase()}_AVAILABILITY_UNKNOWN`); return null; }
    if (!(item.bytes instanceof Uint8Array)) { add(`${stage.toUpperCase()}_BYTES_MISSING`); return null; }
    const digest = sha(item.bytes);
    observed[stage] = { rawContentSha256: digest, byteLength: item.bytes.byteLength, hashBasis: 'ORIGINAL_JSON_BYTES' };
    if (!HASH.test(item.expectedRawSha256 || '') || digest !== item.expectedRawSha256) {
      add(`${stage.toUpperCase()}_RAW_SHA_MISMATCH`);
      status[stage] = 'INVALID';
      return null;
    }
    if (!printable(item.fileName) || !new RegExp(`^STAGE${stage.slice(-1)}_.*\\.json$`).test(item.fileName)) add(`${stage.toUpperCase()}_FILE_IDENTITY_INVALID`);
    if (!object(item.origin) || !provenance || item.origin.repository !== run.repository
      || item.origin.workflow !== run.workflow || item.origin.githubRunId !== run.githubRunId
      || item.origin.runAttempt !== run.runAttempt || item.origin.commitSha !== run.commitSha) {
      add(`${stage.toUpperCase()}_CROSS_RUN_MISMATCH`);
    }
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(item.bytes)); }
    catch { add(`${stage.toUpperCase()}_JSON_INVALID`); status[stage] = 'INVALID'; return null; }
    if (!object(parsed) || !object(parsed.manifest)) {
      add(`${stage.toUpperCase()}_MANIFEST_MISSING`); status[stage] = 'INVALID'; return null;
    }
    status[stage] = 'PRESENT_UNVERIFIED';
    return parsed;
  };
  const a = analyze(stage0, 'stage0');
  const b = analyze(stage1, 'stage1');
  if (a) {
    if (a.manifest.schemaVersion !== 'stage0-source-truth-v2' || !printable(a.manifest.runId)
      || !isTime(a.manifest.generatedAt) || !isTime(run?.referenceTime)
      || time(a.manifest.generatedAt) > time(run.referenceTime)) add('STAGE0_PIT_OR_SCHEMA_INVALID');
    for (const key of ['sourceInventorySha256', 'inputHash', 'outputHash']) {
      if (!HASH.test(a.manifest[key] || '')) add('STAGE0_MANIFEST_HASH_INVALID');
    }
    if (a.manifest.stageProgressionGate !== 'STAGE0_LOCKED') add('STAGE0_GATE_INVALID');
  }
  if (b) {
    if (b.manifest.schemaVersion !== 'stage1-point-in-time-v2' || !printable(b.manifest.runId)
      || !isTime(b.manifest.generatedAt) || !isTime(b.manifest.decisionAt)
      || !isTime(run?.referenceTime) || time(b.manifest.generatedAt) > time(run.referenceTime)
      || time(b.manifest.decisionAt) > time(run.referenceTime)) add('STAGE1_PIT_OR_SCHEMA_INVALID');
    for (const key of ['inputHash', 'outputHash']) {
      if (!HASH.test(b.manifest[key] || '')) add('STAGE1_MANIFEST_HASH_INVALID');
    }
    if (!a || b.manifest.sourceStage0File !== stage0.fileName
      || b.manifest.sourceStage0RunId !== a.manifest.runId
      || b.manifest.sourceStage0InputHash !== a.manifest.inputHash
      || b.manifest.sourceStage0OutputHash !== a.manifest.outputHash
      || b.manifest.sourceStage0InventorySha256 !== a.manifest.sourceInventorySha256) add('STAGE1_STAGE0_LINEAGE_MISMATCH');
    if (!a || !isTime(b.manifest.decisionAt) || !isTime(a.manifest.generatedAt)
      || time(a.manifest.generatedAt) > time(b.manifest.decisionAt)) add('STAGE1_STAGE0_LOOKAHEAD');
    // Companion receipt binds original bytes independently; v2 manifest remains unchanged.
    if (!a || !HASH.test(stage1?.sourceStage0RawSha256 || '')
      || stage1.sourceStage0RawSha256 !== observed.stage0?.rawContentSha256) add('STAGE1_SOURCE_RAW_SHA_UNBOUND');
    if (b.manifest.unresolvedPromotionRows !== 0 || b.manifest.downstreamPolicyChanged !== false) add('STAGE1_PROMOTION_INVALID');
  }
  if (!a || !b) add('CHAIN_INCOMPLETE');
  // All expected hashes and GitHub-origin fields above are caller-supplied.
  // Even when internally consistent, they do not attest original-byte provenance,
  // full Stage0/1 v2 validation, or an authenticated GitHub execution.
  // Do not turn self-consistency into a quality, PIT, or execution PASS.
  const consistent = issues.length === 0;
  if (consistent) {
    status.stage0 = 'PRESENT_SELF_CONSISTENT';
    status.stage1 = 'PRESENT_SELF_CONSISTENT';
  }
  return {
    verdict: consistent ? 'CONSISTENT_UNATTESTED' : 'WITHHELD',
    finalQualityJudgement: 'withheld',
    provenanceAttested: false,
    stageV2Validated: false,
    trustBasis: 'SELF_REPORTED_RECEIPT_UNAUTHENTICATED',
    status, issues, observed, requestCount: 0
  };
}
