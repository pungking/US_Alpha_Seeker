import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { auditReadOnlyGitHubEvidence } from '../services/stage01GitHubReadOnlyEvidence.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const crc32 = bytes => {
  let n = 0xffffffff;
  for (const b of bytes) { n ^= b; for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0); }
  return (n ^ 0xffffffff) >>> 0;
};
function storedZip(name, contents) {
  const n = Buffer.from(name), body = Buffer.from(contents), crc = crc32(body);
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);
  local.writeUInt32LE(body.length,22);local.writeUInt16LE(n.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);
  central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);
  central.writeUInt16LE(n.length,28);
  const directoryOffset = local.length+n.length+body.length;
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(directoryOffset,16);
  return Buffer.concat([local,n,body,central,n,end]);
}
const repository='pungking/US_Alpha_Seeker', repoId=1139620490;
const runId=43470901390, attempt=1, commit='77c40cb70d65197466e8382cde1c6f71690bbc6a';
const artifactId=14062682867;
const root='https://api.github.com/repos/'+repository;
const zip=storedZip('state/analysis-evidence.json','{"offline":true}');
const build = () => ({
  repository,runId,runAttempt:attempt,commitSha:commit,artifactId,
  records: [
    {id:repoId,full_name:repository},
    {id:runId,run_attempt:attempt,head_sha:commit,workflow_id:230326556,
      path:'.github/workflows/schedule.yml',status:'completed',conclusion:'success',
      repository:{id:repoId,full_name:repository}},
    {id:artifactId,name:'automation-evidence',expired:false,digest:'sha256:'+hash(zip),
      workflow_run:{id:runId,repository_id:repoId,head_repository_id:repoId,head_sha:commit}}
  ]
});
async function observe(mutator, expectedIssue, expectedReads) {
  const c=build();if(mutator) mutator(c);
  let index=0, bytes=0;const urls=[];
  const data=await auditReadOnlyGitHubEvidence({
    repository:c.repository,runId:c.runId,runAttempt:c.runAttempt,commitSha:c.commitSha,artifactId:c.artifactId,
    readJson: async url => {
      urls.push(url);
      assert.equal(url,[root,root+'/actions/runs/'+runId,root+'/actions/artifacts/'+artifactId][index]);
      return c.records[index++];
    },
    readArtifactBytes: async url => { bytes++;assert.equal(url,root+'/actions/artifacts/'+artifactId+'/zip');return c.overrideZip ?? zip; }
  });
  assert.equal(data.provenanceAttested,false);
  assert.equal(data.originAuthenticated,false);
  // Metadata success cannot be promoted when inner archive integrity/lineage withholds.
  assert.equal(data.readbackCorrelated,false);
  assert.equal(data.finalQualityJudgement,'withheld');
  assert.equal(data.requestCount, expectedReads);
  assert.equal(urls.length + bytes,expectedReads);
  if(expectedIssue) {
    assert.equal(data.verdict,'WITHHELD');
    assert.ok(data.issues.includes(expectedIssue),JSON.stringify(data.issues));
  }
  return data;
}
const ok = await observe(null,'GITHUB_ARCHIVE_AUDIT_WITHHELD',4);
assert.equal(ok.audit.stages.stage0.availability,'NOT_EXPORTED');
assert.equal(ok.audit.stages.stage1.availability,'NOT_EXPORTED');
assert.equal(ok.audit.verdict,'WITHHELD');
const cases = [
  [x=>{x.records[0].id=4;},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[0].full_name='forged/repository';},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].id++;},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].repository.full_name='other/repo';},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].repository.id++;},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].run_attempt=2;},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].head_sha='f'.repeat(40);},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].conclusion='failure';},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].conclusion='skipped';},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[1].status='in_progress';},'GITHUB_RUN_IDENTITY_MISMATCH'],
  [x=>{x.records[2].id++;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].workflow_run.id++;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].workflow_run.repository_id++;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].workflow_run.head_repository_id++;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].workflow_run.head_sha='e'.repeat(40);},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].expired=true;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH'],
  [x=>{x.records[2].digest=null;},'GITHUB_ARTIFACT_IDENTITY_MISMATCH']
];
for(const [mutate,reason] of cases) await observe(mutate,reason,3);
await observe(x=>{x.overrideZip=storedZip('other.json','changed');},'GITHUB_ARCHIVE_AUDIT_WITHHELD',4);
// A forged, self-consistent transport is still NEVER an authenticated GitHub source.
const counterfeit=build();
counterfeit.records[0].id=777;
counterfeit.records[1].repository.id=777;
counterfeit.records[2].workflow_run.repository_id=777;
counterfeit.records[2].workflow_run.head_repository_id=777;
const counterfeitResult=await auditReadOnlyGitHubEvidence({
  repository,runId,runAttempt:attempt,commitSha:commit,artifactId,
  readJson:async url=>counterfeit.records[[root,root+'/actions/runs/'+runId,root+'/actions/artifacts/'+artifactId].indexOf(url)],
  readArtifactBytes:async()=>zip
});
assert.equal(counterfeitResult.provenanceAttested,false);
assert.equal(counterfeitResult.originAuthenticated,false);
assert.equal(counterfeitResult.finalQualityJudgement,'withheld');
assert.equal(counterfeitResult.readbackCorrelated,false);
await observe(x=>{x.overrideZip=Buffer.alloc(0);},'GITHUB_ARTIFACT_BYTES_UNAVAILABLE',4);
// Reader failures must never fall through to a caller-claimed authenticated PASS.
const failed = await auditReadOnlyGitHubEvidence({
  ...build(),readJson:async()=>{throw Error('offline');},readArtifactBytes:async()=>{throw Error('should not call');}
});
assert.equal(failed.verdict,'WITHHELD');
assert.deepEqual(failed.issues,['GITHUB_READBACK_UNAVAILABLE']);
assert.equal(failed.requestCount,1);
assert.equal(failed.provenanceAttested,false);
const invalid = await auditReadOnlyGitHubEvidence({repository:'https://evil.example',runId,runAttempt:attempt,commitSha:commit,artifactId,readJson:()=>{},readArtifactBytes:()=>{}});
assert.equal(invalid.verdict,'WITHHELD');
assert.equal(invalid.requestCount,0);
assert.deepEqual(invalid.issues,['INPUT_INVALID']);
console.log('[STAGE01_GITHUB_READONLY_EVIDENCE] PASS (pinned GET coordinates, strict identity/attempt, ZIP digest, skip/partial/missing, NOT_EXPORTED, no trust promotion)');
