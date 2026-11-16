// AS-INTEGRATION-42: offline-only GitHub Actions archive readback.
// API response data are independently *supplied* to this function; this module
// does not query GitHub and never attests the authenticity of caller inputs.
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import {
  validateStage0ArtifactForStage1
} from './stage0SourceEvidenceContract.mjs';
import {
  validateStage1ArtifactForStage2
} from './stage1PointInTimeFilterContract.mjs';

const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const positiveId = v => Number.isSafeInteger(v) && v > 0;
const fail = message => { throw new Error(message); };
const uint8 = bytes => bytes instanceof Uint8Array ? Buffer.from(bytes) : null;
const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

// Central-directory readback: no extraction to disk; reject path traversal,
// duplicates, encryption, multi-disk, ZIP64 and malformed compression.
export function inspectOfflineZip(zipBytes) {
  const buf = uint8(zipBytes);
  if (!buf || buf.length < 22) fail('ZIP_BYTES_MISSING');
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { end = i; break; }
  }
  if (end < 0) fail('ZIP_EOCD_INVALID');
  if (buf.readUInt16LE(end + 4) !== 0 || buf.readUInt16LE(end + 6) !== 0) fail('ZIP_MULTIDISK_UNSUPPORTED');
  const count = buf.readUInt16LE(end + 10);
  const size = buf.readUInt32LE(end + 12);
  const offset = buf.readUInt32LE(end + 16);
  if (count !== buf.readUInt16LE(end + 8) || count > 2000 || count === 65535
    || size === 0xffffffff || offset === 0xffffffff || offset + size > end) fail('ZIP_CENTRAL_INVALID');
  const entries = new Map();
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) fail('ZIP_DIRECTORY_INVALID');
    const flags = buf.readUInt16LE(at + 8), method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16), compressed = buf.readUInt32LE(at + 20);
    const uncompressed = buf.readUInt32LE(at + 24), nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const localOffset = buf.readUInt32LE(at + 42);
    const next = at + 46 + nameLen + extraLen + commentLen;
    if (next > offset + size || nameLen === 0 || (flags & 1) || ![0, 8].includes(method)
      || [compressed, uncompressed, localOffset].includes(0xffffffff)) fail('ZIP_ENTRY_INVALID');
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString('utf8');
    if (name.includes('\0') || name.startsWith('/') || name.includes('\\')
      || name.split('/').includes('..') || entries.has(name)) fail('ZIP_PATH_INVALID');
    if (localOffset + 30 > offset || buf.readUInt32LE(localOffset) !== 0x04034b50
      || buf.readUInt16LE(localOffset + 8) !== method) fail('ZIP_LOCAL_INVALID');
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (start + compressed > offset) fail('ZIP_LOCAL_BOUNDS_INVALID');
    entries.set(name, { name, method, crc, compressed, uncompressed, start });
    at = next;
  }
  if (at !== offset + size) fail('ZIP_CENTRAL_SIZE_MISMATCH');
  return {
    names: [...entries.keys()].sort(),
    readEntry(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.uncompressed > 128 * 1024 * 1024) fail('ZIP_ENTRY_TOO_LARGE');
      const data = buf.subarray(e.start, e.start + e.compressed);
      const raw = e.method === 0 ? data : inflateRawSync(data, { maxOutputLength: 128 * 1024 * 1024 });
      if (raw.length !== e.uncompressed || crc32(raw) !== e.crc) fail('ZIP_ENTRY_CRC_INVALID');
      return raw;
    }
  };
}

// Never returns a trusted provenance or execution-quality PASS. A future
// GitHub readback adapter must independently establish both API and ZIP origin.
export async function auditGitHubArchiveReadback({ repository, run, artifact, zipBytes } = {}) {
  const issues = [];
  const add = reason => { if (!issues.includes(reason)) issues.push(reason); };
  const stages = { stage0: { availability: 'UNKNOWN' }, stage1: { availability: 'UNKNOWN' } };
  const sha = uint8(zipBytes) ? digest(uint8(zipBytes)) : null;
  const expected = typeof artifact?.digest === 'string' && artifact.digest.startsWith('sha256:')
    ? artifact.digest.slice(7) : null;
  if (!obj(run) || !obj(artifact) || typeof repository !== 'string'
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !positiveId(run.id) || !positiveId(run.run_attempt)
    || !HEX40.test(run.head_sha || '') || !positiveId(run.workflow_id)
    || typeof run.path !== 'string' || !run.path.startsWith('.github/workflows/')
    || !positiveId(artifact.id) || !positiveId(artifact.workflow_run?.id)
    || artifact.workflow_run.id !== run.id
    || artifact.workflow_run.head_sha !== run.head_sha
    || artifact.workflow_run.repository_id !== artifact.workflow_run.head_repository_id
    || artifact.expired !== false || run.status !== 'completed'
    || run.conclusion !== 'success' || !HEX64.test(expected || '')
    || typeof artifact.name !== 'string' || !artifact.name) add('GITHUB_API_CLAIM_INCOMPLETE');
  if (!sha || !HEX64.test(expected || '') || sha !== expected) add('ARCHIVE_SHA256_MISMATCH');
  let zip;
  if (issues.length === 0) {
    try { zip = inspectOfflineZip(zipBytes); }
    catch { add('ARCHIVE_ZIP_INVALID'); }
  }
  const files = {};
  if (zip) {
    for (const [stage, re] of [
      ['stage0', /(?:^|\/)STAGE0_[^/]*\.json$/i],
      ['stage1', /(?:^|\/)STAGE1_[^/]*\.json$/i]
    ]) {
      const matching = zip.names.filter(name => re.test(name));
      if (matching.length === 0) { stages[stage] = { availability: 'NOT_EXPORTED' }; continue; }
      if (matching.length !== 1) { add(stage.toUpperCase() + '_AMBIGUOUS_ORIGINALS'); continue; }
      try {
        const bytes = zip.readEntry(matching[0]);
        const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!obj(json) || !obj(json.manifest)) throw Error('missing manifest');
        files[stage] = { json, sha256: digest(bytes), fileName: matching[0], size: bytes.length };
        stages[stage] = { availability: 'PRESENT_UNATTESTED', rawSha256: files[stage].sha256, fileName: matching[0] };
      } catch { add(stage.toUpperCase() + '_ORIGINAL_INVALID'); }
    }
  }
  if (files.stage0 && files.stage1) {
    try {
      const v0 = await validateStage0ArtifactForStage1(files.stage0.json);
      const v1 = await validateStage1ArtifactForStage2(files.stage1.json);
      if (!v0.valid) add('STAGE0_V2_CONTRACT_INVALID');
      if (!v1.valid) add('STAGE1_V2_CONTRACT_INVALID');
      const m0 = files.stage0.json.manifest, m1 = files.stage1.json.manifest;
      if (m1.sourceStage0RunId !== m0.runId || m1.sourceStage0OutputHash !== m0.outputHash
        || m1.sourceStage0InputHash !== m0.inputHash || m1.sourceStage0InventorySha256 !== m0.sourceInventorySha256
        || !Number.isFinite(Date.parse(m1.decisionAt)) || !Number.isFinite(Date.parse(m0.generatedAt))
        || Date.parse(m0.generatedAt) > Date.parse(m1.decisionAt)) add('STAGE01_LINEAGE_OR_PIT_INVALID');
    } catch { add('STAGE01_V2_VALIDATION_ERROR'); }
  }
  if (stages.stage0.availability !== 'PRESENT_UNATTESTED' || stages.stage1.availability !== 'PRESENT_UNATTESTED') {
    add('STAGE01_ORIGINALS_NOT_EXPORTED');
  }
  return {
    schemaVersion: 'stage01-github-archive-readback-v1',
    runId: positiveId(run?.id) ? run.id : null,
    attempt: positiveId(run?.run_attempt) ? run.run_attempt : null,
    commitSha: HEX40.test(run?.head_sha || '') ? run.head_sha : null,
    artifactId: positiveId(artifact?.id) ? artifact.id : null,
    observedZipSha256: sha,
    stages, issues,
    verdict: issues.length ? 'WITHHELD' : 'CORRELATED_UNATTESTED',
    provenanceAttested: false, finalQualityJudgement: 'withheld',
    networkRequests: 0
  };
}
