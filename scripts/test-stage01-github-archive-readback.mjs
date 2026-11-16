import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditGitHubArchiveReadback, inspectOfflineZip } from '../services/stage01GitHubArchiveReadback.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const crc32 = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) { n ^= b; for (let i=0;i<8;i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
};
function zipStored(entries) {
  const locals=[], centrals=[];
  let offset=0;
  for (const [name, value] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name), body = Buffer.from(value), crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
    local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);
    local.writeUInt32LE(body.length,22);local.writeUInt16LE(nameBuf.length,26);
    locals.push(local,nameBuf,body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);
    central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);
    central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(offset,42);
    centrals.push(central,nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const centralSize = centrals.reduce((n,b)=>n+b.length,0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(entries).length,8);
  end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(centralSize,12);
  end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,...centrals,end]);
}
const repo = 'pungking/US_Alpha_Seeker';
const run = () => ({ id:43470901390, run_attempt:1,
  head_sha:'77c40cb70d65197466e8382cde1c6f71690bbc6a', workflow_id:230326556,
  path:'.github/workflows/schedule.yml', status:'completed', conclusion:'success' });
const metadata = () => ({ id:14062682867, name:'automation-evidence', expired:false, digest:null,
  workflow_run:{id:43470901390,repository_id:1139620490,head_repository_id:1139620490,
    head_sha:'77c40cb70d65197466e8382cde1c6f71690bbc6a'} });
const zip = zipStored({'state/stage3-audit-source.json':'{"status":"fixture"}','state/stage6-output.json':'{"status":"fixture"}'});
const source = () => ({repository:repo,run:run(),artifact:{...metadata(),digest:'sha256:'+hash(zip)},zipBytes:zip});
const valid = await auditGitHubArchiveReadback(source());
assert.equal(valid.verdict,'WITHHELD');
assert.equal(valid.stages.stage0.availability,'NOT_EXPORTED');
assert.equal(valid.stages.stage1.availability,'NOT_EXPORTED');
assert.ok(valid.issues.includes('STAGE01_ORIGINALS_NOT_EXPORTED'));
assert.equal(valid.observedZipSha256,hash(zip));
assert.equal(valid.networkRequests,0);
assert.equal(valid.provenanceAttested,false);
assert.equal(valid.finalQualityJudgement,'withheld');
assert.deepEqual(inspectOfflineZip(zip).names, ['state/stage3-audit-source.json','state/stage6-output.json']);
assert.equal(inspectOfflineZip(zip).verifiedEntryCount,2);
assert.equal(inspectOfflineZip(zip).readEntry('state/stage6-output.json'),null); // non-stage CRC-checked and discarded

const block = async (name,change,reason) => {
  const v=source();change(v);
  const result=await auditGitHubArchiveReadback(v);
  assert.equal(result.verdict,'WITHHELD',name);
  assert.ok(result.issues.includes(reason),name+': '+result.issues);
  assert.equal(result.provenanceAttested,false,name);
  assert.equal(result.finalQualityJudgement,'withheld',name);
};
await block('forged ZIP SHA',v=>{v.artifact.digest='sha256:'+'f'.repeat(64);},'ARCHIVE_SHA256_MISMATCH');
await block('tampered ZIP bytes',v=>{v.zipBytes=new Uint8Array([...v.zipBytes,32]);},'ARCHIVE_SHA256_MISMATCH');
await block('forged Run',v=>{v.run.id++;},'GITHUB_API_CLAIM_INCOMPLETE');
await block('forged Commit',v=>{v.run.head_sha='a'.repeat(40);},'GITHUB_API_CLAIM_INCOMPLETE');
await block('forged Repository',v=>{v.artifact.workflow_run.head_repository_id++;},'GITHUB_API_CLAIM_INCOMPLETE');
await block('expired',v=>{v.artifact.expired=true;},'GITHUB_API_CLAIM_INCOMPLETE');
await block('partial failure',v=>{v.run.conclusion='failure';},'GITHUB_API_CLAIM_INCOMPLETE');
await block('skipped',v=>{v.run.conclusion='skipped';},'GITHUB_API_CLAIM_INCOMPLETE');
await block('missing Attempt',v=>{v.run.run_attempt=null;},'GITHUB_API_CLAIM_INCOMPLETE');
await block('unknown ZIP digest',v=>{v.artifact.digest=null;},'GITHUB_API_CLAIM_INCOMPLETE');
// When a source appears in the ZIP, the existing v2 source-of-truth
// contract rejects synthetic and manipulated hashes, including future PIT.
const malformed = zipStored({
  'STAGE0_MASTER_UNIVERSE_FIXTURE.json':JSON.stringify({manifest:{
    schemaVersion:'stage0-source-truth-v2', generatedAt:'2026-11-14T12:00:00Z', runId:'fake',
    sourceInventorySha256:'a'.repeat(64), inputHash:'b'.repeat(64),outputHash:'c'.repeat(64)
  },universe:[]}),
  'STAGE1_PURIFIED_UNIVERSE_FIXTURE.json':JSON.stringify({manifest:{
    schemaVersion:'stage1-point-in-time-v2', decisionAt:'2026-11-13T12:00:00Z',
    sourceStage0RunId:'fake',sourceStage0InputHash:'b'.repeat(64),
    sourceStage0OutputHash:'c'.repeat(64),sourceStage0InventorySha256:'a'.repeat(64)
  },investable_universe:[]})
});
const bad = source();bad.zipBytes=malformed;bad.artifact.digest='sha256:'+hash(malformed);
const falsePIT=await auditGitHubArchiveReadback(bad);
assert.equal(falsePIT.verdict,'WITHHELD');
assert.ok(falsePIT.issues.includes('STAGE0_V2_CONTRACT_INVALID'));
assert.ok(falsePIT.issues.includes('STAGE1_V2_CONTRACT_INVALID'));
assert.ok(falsePIT.issues.includes('STAGE01_LINEAGE_OR_PIT_INVALID'));
assert.equal(falsePIT.provenanceAttested,false);
const traversal=zipStored({'../STAGE0_MASTER_UNIVERSE.json':'{}'});
assert.throws(()=>inspectOfflineZip(traversal),/ZIP_PATH_INVALID/);
const crcDamaged=Buffer.from(zip);
const idx=crcDamaged.indexOf(Buffer.from('{"status":"fixture"}'));
assert.ok(idx>0);crcDamaged[idx]^=1;
assert.throws(()=>inspectOfflineZip(crcDamaged),/ZIP_ENTRY_CRC_INVALID/);
const duplicate=zipStored({'STAGE0_MASTER_UNIVERSE_A.json':'{}','STAGE0_MASTER_UNIVERSE_B.json':'{}'});
const amb=source();amb.zipBytes=duplicate;amb.artifact.digest='sha256:'+hash(duplicate);
const ambResult=await auditGitHubArchiveReadback(amb);
assert.ok(ambResult.issues.includes('STAGE0_AMBIGUOUS_ORIGINALS'));
assert.equal(ambResult.verdict,'WITHHELD');

// AS-INTEGRATION-43: central/local disagreement and ZIP64 must fail closed.
// Mutating archive bytes is intentional: this exercises independently
// malformed ZIPs, not a builder that already forbids invalid structures.
const localNameMismatch = Buffer.from(zip);
const localNameIndex = localNameMismatch.indexOf(Buffer.from('state/stage3-audit-source.json'));
assert.ok(localNameIndex >= 0);
localNameMismatch[localNameIndex] = 'x'.charCodeAt(0);
assert.throws(() => inspectOfflineZip(localNameMismatch), /ZIP_LOCAL_NAME_MISMATCH/);
const localMethodMismatch = Buffer.from(zip);
localMethodMismatch.writeUInt16LE(8, 8); // local compression method, central still "stored"
assert.throws(() => inspectOfflineZip(localMethodMismatch), /ZIP_LOCAL_INVALID/);
const localCrcMismatch = Buffer.from(zip);
localCrcMismatch.writeUInt32LE(0, 14);
assert.throws(() => inspectOfflineZip(localCrcMismatch), /ZIP_LOCAL_METADATA_MISMATCH/);
const localFlagsMismatch = Buffer.from(zip);
localFlagsMismatch.writeUInt16LE(1, 6);
assert.throws(() => inspectOfflineZip(localFlagsMismatch), /ZIP_LOCAL_INVALID/);
const storedSizeMismatch = Buffer.from(zip);
const centralPos = storedSizeMismatch.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
assert.ok(centralPos > 0);
storedSizeMismatch.writeUInt32LE(storedSizeMismatch.readUInt32LE(centralPos+24)+1, centralPos+24);
assert.throws(() => inspectOfflineZip(storedSizeMismatch), /ZIP_ENTRY_INVALID/);
// Rebuild a valid ZIP with a central extra field set to ZIP64, even
// though the legacy 32-bit fields are not sentinel values.
const centralZip64 = Buffer.from(zip);
const centralStart = centralZip64.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
const endIndex = centralZip64.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
const zip64Extra = Buffer.from([1,0,0,0]);
const centralNameLen = centralZip64.readUInt16LE(centralStart+28);
const insertedAt = centralStart+46+centralNameLen;
const zip64File = Buffer.concat([centralZip64.subarray(0,insertedAt),zip64Extra,centralZip64.subarray(insertedAt)]);
zip64File.writeUInt16LE(4,centralStart+30);
zip64File.writeUInt32LE(centralZip64.readUInt32LE(endIndex+12)+4,endIndex+4+12);
assert.throws(() => inspectOfflineZip(zip64File), /ZIP64_UNSUPPORTED/);
// Reject advertised oversized source before attempting decompression.
const oversize = Buffer.from(zip);
oversize.writeUInt32LE(129*1024*1024, centralPos+24);
assert.throws(() => inspectOfflineZip(oversize), /ZIP_ENTRY_INVALID/);
// Both a bogus output and an observed, caller-controlled ZIP digest
// cannot establish independently verified provenance.
const manipulated = source();
manipulated.zipBytes = Buffer.from(zip);
manipulated.artifact.digest = 'sha256:'+hash(manipulated.zipBytes);
const stillUnattested = await auditGitHubArchiveReadback(manipulated);
assert.equal(stillUnattested.provenanceAttested,false);
assert.equal(stillUnattested.finalQualityJudgement,'withheld');

// AS-INTEGRATION-44: corrupted non-stage entry must prohibit NOT_EXPORTED.
const nonstageDamaged=source();
nonstageDamaged.zipBytes=crcDamaged;
nonstageDamaged.artifact.digest='sha256:'+hash(crcDamaged);
const nonstageResult=await auditGitHubArchiveReadback(nonstageDamaged);
assert.equal(nonstageResult.verdict,'WITHHELD');
assert.ok(nonstageResult.issues.includes('ARCHIVE_ZIP_INVALID'));
assert.equal(nonstageResult.stages.stage0.availability,'UNKNOWN');
assert.equal(nonstageResult.stages.stage1.availability,'UNKNOWN');
// Metadata-only huge entry and aggregate overflow must be refused before inflate.
const declaredOversize=Buffer.from(zip);
const oversizedDir=declaredOversize.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
declaredOversize.writeUInt32LE(129*1024*1024,oversizedDir+24);
assert.throws(()=>inspectOfflineZip(declaredOversize),/ZIP_ENTRY_TOO_LARGE/);
const totalOverflow=zipStored({a:'0',b:'1',c:'2'});
const totalCentral=totalOverflow.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));
const modifiedTotal=Buffer.from(totalOverflow);
let pos=totalCentral;
for(let i=0;i<3;i++){
  modifiedTotal.writeUInt32LE(100*1024*1024,pos+24);
  pos+=46+modifiedTotal.readUInt16LE(pos+28)+modifiedTotal.readUInt16LE(pos+30)+modifiedTotal.readUInt16LE(pos+32);
}
assert.throws(()=>inspectOfflineZip(modifiedTotal),/ZIP_TOTAL_TOO_LARGE/);

console.log('[STAGE01_GITHUB_ARCHIVE_READBACK] PASS (offline ZIP CRC/hash, independent API claim parity, NOT_EXPORTED, forged/partial/skipped/PIT negatives; no network)');
