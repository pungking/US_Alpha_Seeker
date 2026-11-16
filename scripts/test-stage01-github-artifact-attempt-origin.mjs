import assert from 'node:assert/strict';
import {assessOfflineArtifactAttemptOrigin} from '../services/stage01GitHubArtifactAttemptOriginOffline.mjs';

const SHA='c411f1bdd2fb3f2c0b97aee480ebbf7b73a682e3';
const T='2026-11-16T07:26:11Z', U='2026-11-16T07:27:38Z';
function fixture(){
 return {
  repository:'pungking/US_Alpha_Seeker',repositoryId:1139620490,
  runId:43823841886,runAttempt:1,commitSha:SHA,workflowId:289086216,
  run:{id:43823841886,run_attempt:1,workflow_id:289086216,head_sha:SHA,
    status:'completed',conclusion:'success',created_at:T,
    repository:{id:1139620490,full_name:'pungking/US_Alpha_Seeker'}},
  attempt:{id:43823841886,run_attempt:1,workflow_id:289086216,
    head_sha:SHA,status:'completed',conclusion:'success',run_started_at:T},
  artifact:{id:14205447992,created_at:U,expired:false,
    digest:'sha256:2212c394bf69f226b9572f9e2cf1e4d4f190c2120ea61dda31855911ff299668',
    workflow_run:{id:43823841886,repository_id:1139620490,
      head_repository_id:1139620490,head_sha:SHA}},
  attemptJobs:[{id:133152858928,run_id:43823841886,head_sha:SHA,
    started_at:'2026-11-16T07:26:14Z',completed_at:'2026-11-16T07:27:40Z'}]
 };
}
const good=assessOfflineArtifactAttemptOrigin(fixture());
assert.equal(good.runCorrelation,'RUN_CORRELATED');
assert.equal(good.producingAttempt,'UNPROVEN');
assert.equal(good.attemptOriginEvidence,'NOT_AVAILABLE_FROM_ARTIFACT_REST');
assert.equal(good.independentSignatureVerified,false);
assert.equal(good.originAuthenticated,false);
assert.equal(good.provenanceAttested,false);
assert.equal(good.finalQualityJudgement,'withheld');
assert.equal(good.actualDownloaderApproval,'HOLD');
assert.equal(good.networkRequests,0);
assert.deepEqual(good.issues,[]);
const block=(name,fn,issue)=>{
 const x=fixture();fn(x);const r=assessOfflineArtifactAttemptOrigin(x);
 assert.equal(r.runCorrelation,'WITHHELD',name);
 assert.ok(r.issues.includes(issue),name+': '+r.issues);
 assert.equal(r.producingAttempt,'UNPROVEN');
 assert.equal(r.actualDownloaderApproval,'HOLD');
};
block('invalid requested run attempt',x=>x.runAttempt=0,'INPUT_INVALID');
block('wrong attempt',x=>x.attempt.run_attempt=2,'ATTEMPT_IDENTITY_MISMATCH');
block('wrong run',x=>x.run.id=1,'RUN_IDENTITY_MISMATCH');
block('wrong workflow ID',x=>x.attempt.workflow_id=99,'ATTEMPT_IDENTITY_MISMATCH');
block('wrong repository ID',x=>x.artifact.workflow_run.repository_id=1,'ARTIFACT_IDENTITY_MISMATCH');
block('cross artifact SHA',x=>x.artifact.workflow_run.head_sha='f'.repeat(40),'ARTIFACT_IDENTITY_MISMATCH');
block('missing artifact SHA',x=>delete x.artifact.digest,'ARTIFACT_IDENTITY_MISMATCH');
block('invalid digest',x=>x.artifact.digest='sha256:abc','ARTIFACT_IDENTITY_MISMATCH');
block('expired artifact',x=>x.artifact.expired=true,'ARTIFACT_IDENTITY_MISMATCH');
block('created before attempt',x=>x.artifact.created_at='2026-11-15T07:27:38Z','TIMELINE_UNVERIFIED');
block('missing timestamp',x=>delete x.artifact.created_at,'TIMELINE_UNVERIFIED');
block('no attempt jobs',x=>x.attemptJobs=[],'ATTEMPT_JOBS_UNVERIFIED');
block('wrong job run',x=>x.attemptJobs[0].run_id=1,'ATTEMPT_JOBS_UNVERIFIED');
block('wrong job SHA',x=>x.attemptJobs[0].head_sha='f'.repeat(40),'ATTEMPT_JOBS_UNVERIFIED');
block('unhealthy run',x=>x.run.conclusion='failure','RUN_IDENTITY_MISMATCH');
// A caller may forge arbitrary metadata and even a fake 'verified' boolean.
// An offline verifier MUST NOT elevate provenance or exact producer attempt.
const forged=fixture();
forged.artifact.run_attempt=1;
forged.attemptJobs[0].uploaded_artifact_id=forged.artifact.id;
forged.attempt.independentAttemptProof=true;
forged.independentSignatureVerified=true;
const untrusted=assessOfflineArtifactAttemptOrigin(forged);
assert.equal(untrusted.runCorrelation,'RUN_CORRELATED');
assert.equal(untrusted.producingAttempt,'UNPROVEN');
assert.equal(untrusted.independentSignatureVerified,false);
console.log('[STAGE01_GITHUB_ARTIFACT_ATTEMPT_ORIGIN] PASS (Run correlated != producing Attempt proven; metadata/timestamps/claims cannot elevate; network=0, trust withheld)');
