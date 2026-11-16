// Offline, report-only audit receipts. Does not modify Stage0/1 v2 artifacts.
import { createHash } from 'node:crypto';
import { validateStage0ArtifactForStage1 } from './stage0SourceEvidenceContract.mjs';
import { validateStage1ArtifactForStage2 } from './stage1PointInTimeFilterContract.mjs';

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

// Compound audit is deliberately stricter than the receipt self-consistency
// check. Both existing v2 contracts must validate against the *exact* parsed
// original bytes. No caller-supplied anchor can promote provenance to trusted.
// Cross-Run handoffs require future independently verified GitHub evidence.
export async function auditStage01ReceiptsWithV2(input = {}) {
  const receipt = auditStage01Receipts(input);
  const issues = [...receipt.issues];
  const add = reason => { if (!issues.includes(reason)) issues.push(reason); };
  let stage0Valid = false;
  let stage1Valid = false;
  const v2Reasons = { stage0: [], stage1: [] };
  if (receipt.verdict === 'CONSISTENT_UNATTESTED') {
    try {
      const parse = item => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(item.bytes));
      const stage0Artifact = parse(input.stage0);
      const stage1Artifact = parse(input.stage1);
      const stage0 = await validateStage0ArtifactForStage1(stage0Artifact);
      const stage1 = await validateStage1ArtifactForStage2(stage1Artifact);
      stage0Valid = stage0.valid === true;
      stage1Valid = stage1.valid === true;
      v2Reasons.stage0 = [...(stage0.reasons || [])];
      v2Reasons.stage1 = [...(stage1.reasons || [])];
      if (!stage0Valid) add('STAGE0_V2_CONTRACT_INVALID');
      if (!stage1Valid) add('STAGE1_V2_CONTRACT_INVALID');
    } catch {
      add('STAGE01_V2_VALIDATION_ERROR');
    }
  } else {
    add('STAGE01_RECEIPT_INCOMPLETE');
  }
  // Externally authenticated run/attempt/SHA/artifact anchors are not
  // available in this offline API. `trusted: true` passed by a caller
  // is never recognized as proof, even when all metadata matches.
  const bothValid = stage0Valid && stage1Valid && issues.length === 0;
  return {
    ...receipt,
    verdict: bothValid ? 'V2_VALIDATED_UNATTESTED' : 'WITHHELD',
    finalQualityJudgement: 'withheld',
    provenanceAttested: false,
    stageV2Validated: bothValid,
    anchorAttested: false,
    runRelationship: 'SAME_RUN_CLAIM_ONLY',
    trustBasis: 'OFFLINE_V2_VALIDATION_WITHOUT_AUTHENTICATED_GITHUB_ANCHOR',
    issues,
    v2Reasons
  };
}


// Two independently observed GitHub executions and the explicit handoff edge.
// Values are inputs to this offline checker, NOT authenticated API responses.
// Therefore even complete v2 and metadata parity cannot yield a trusted PASS.
export async function auditStage01ObservedHandoff({ stage0, stage1, observations, handoff } = {}) {
  const issues = [];
  const add = code => { if (!issues.includes(code)) issues.push(code); };
  const stages = [stage0, stage1];
  const anchors = [observations?.stage0, observations?.stage1];
  const parsed = [];
  const digests = [];
  for (let i = 0; i < 2; i++) {
    const tag = i === 0 ? 'STAGE0' : 'STAGE1';
    const entry = stages[i], anchor = anchors[i];
    if (entry?.availability !== 'PRESENT' || !(entry.bytes instanceof Uint8Array)) {
      add(tag + '_ORIGINAL_MISSING'); parsed.push(null); digests.push(null); continue;
    }
    const digest = sha(entry.bytes);
    digests.push(digest);
    if (!object(anchor) || !Number.isSafeInteger(anchor.githubRunId) || anchor.githubRunId < 1
      || !Number.isSafeInteger(anchor.runAttempt) || anchor.runAttempt < 1
      || !SHA.test(anchor.commitSha || '') || !printable(anchor.artifactName)
      || !Number.isSafeInteger(anchor.artifactId) || anchor.artifactId < 1
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(anchor.repository || '')
      || !printable(anchor.workflow) || !HASH.test(anchor.zipSha256 || '')
      || digest !== anchor.innerSha256 || entry.expectedRawSha256 !== digest
      || entry.fileName !== anchor.fileName
      || !object(entry.origin) || entry.origin.repository !== anchor.repository
      || entry.origin.workflow !== anchor.workflow || entry.origin.githubRunId !== anchor.githubRunId
      || entry.origin.runAttempt !== anchor.runAttempt || entry.origin.commitSha !== anchor.commitSha) add(tag + '_OBSERVATION_MISMATCH');
    try {
      const obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes));
      if (!object(obj) || !object(obj.manifest)) throw Error('manifest missing');
      parsed.push(obj);
    } catch { add(tag + '_JSON_INVALID'); parsed.push(null); }
  }
  let v2 = { stage0: false, stage1: false };
  if (parsed[0] && parsed[1]) {
    try {
      const [a, b] = await Promise.all([
        validateStage0ArtifactForStage1(parsed[0]),
        validateStage1ArtifactForStage2(parsed[1])
      ]);
      v2 = { stage0: a.valid === true, stage1: b.valid === true };
      if (!v2.stage0) add('STAGE0_V2_CONTRACT_INVALID');
      if (!v2.stage1) add('STAGE1_V2_CONTRACT_INVALID');
    } catch { add('STAGE01_V2_VALIDATION_ERROR'); }
    const m0 = parsed[0].manifest, m1 = parsed[1].manifest;
    if (m1.sourceStage0File !== stage0.fileName || m1.sourceStage0RunId !== m0.runId
      || m1.sourceStage0InputHash !== m0.inputHash || m1.sourceStage0OutputHash !== m0.outputHash
      || m1.sourceStage0InventorySha256 !== m0.sourceInventorySha256) add('STAGE01_V2_HANDOFF_MISMATCH');
    if (!isTime(m0.generatedAt) || !isTime(m1.decisionAt)
      || time(m0.generatedAt) > time(m1.decisionAt)) add('STAGE01_HANDOFF_LOOKAHEAD');
    if (!object(handoff) || handoff.sourceRunId !== anchors[0]?.githubRunId
      || handoff.sourceAttempt !== anchors[0]?.runAttempt
      || handoff.consumerRunId !== anchors[1]?.githubRunId
      || handoff.consumerAttempt !== anchors[1]?.runAttempt
      || handoff.stage0RawSha256 !== digests[0] || handoff.stage1RawSha256 !== digests[1]
      || handoff.stage0ManifestRunId !== m0.runId
      || handoff.stage1ManifestRunId !== m1.runId
      || handoff.sourceStage0File !== stage0.fileName) add('HANDOFF_EDGE_UNVERIFIED');
  } else add('STAGE01_CHAIN_INCOMPLETE');
  // An observed metadata object supplied by a caller is not a signed attestation.
  // It is only a candidate for a later GitHub API readback and download.
  const correlated = issues.length === 0;
  return {
    verdict: correlated ? 'CORRELATED_UNATTESTED' : 'WITHHELD',
    finalQualityJudgement: 'withheld',
    provenanceAttested: false,
    anchorAttested: false,
    stageV2Validated: correlated && v2.stage0 && v2.stage1,
    // GitHub run IDs are not sufficient to identify one execution across
    // repositories, workflows or commits. Keep all claims untrusted.
    relation: correlated && anchors[0].repository === anchors[1].repository
      && anchors[0].workflow === anchors[1].workflow
      && anchors[0].githubRunId === anchors[1].githubRunId
      && anchors[0].runAttempt === anchors[1].runAttempt
      && anchors[0].commitSha === anchors[1].commitSha
      ? 'SAME_RUN_CLAIM' : 'CROSS_RUN_OR_UNVERIFIED',
    issues, rawSha256: { stage0: digests[0], stage1: digests[1] },
    requestCount: 0
  };
}
