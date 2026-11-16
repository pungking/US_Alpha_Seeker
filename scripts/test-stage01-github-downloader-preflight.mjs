import assert from 'node:assert/strict';
import {assessOfflineDownloaderPreflight} from '../services/stage01GitHubDownloaderPreflight.mjs';

const repository='pungking/US_Alpha_Seeker',runId=123456789,runAttempt=2,artifactId=987654321;
const commitSha='c'.repeat(40), storageHost='storage.example.test',digest='e'.repeat(64);
function fixture(){
 return {
  repository,runId,runAttempt,artifactId,commitSha,storageHost,
  approvedHosts:[storageHost],
  credentialBoundary:{apiHost:'api.github.com',permission:'actions:read',apiMethod:'GET',
    storageMethod:'GET',storageAuthorizationSent:false,storageCookieSent:false,
    storageProxyAuthorizationSent:false,storageHeaderNames:['accept'],
    tokenPersisted:false,secretInLogs:false},
  dnsObservation:{host:storageHost,answers:[{type:'A',address:'8.8.8.8'}],
    peerAddress:'8.8.8.8',cnameCount:0,connectAfterResolve:true},
  tlsObservation:{host:storageHost,servername:storageHost,scheme:'https',
    chainVerified:true,hostnameVerified:true,rejectUnauthorized:true,
    proxyIntercepted:false,peerAddress:'8.8.8.8'},
  run:{id:runId,run_attempt:runAttempt,head_sha:commitSha,
    repository:{full_name:repository},status:'completed',conclusion:'success'},
  artifact:{id:artifactId,digest:'sha256:'+digest,
    workflow_run:{id:runId,head_sha:commitSha}},
  attemptEvidence:{runId,runAttempt,commitSha,artifactId,
    independentAttemptProof:true},
  archiveReceipt:{rawSha256:digest,byteLength:256,
    originAuthenticated:false,tlsAuthenticated:false,
    provenanceAttested:false,finalQualityJudgement:'withheld'}
 };
}
const ok=assessOfflineDownloaderPreflight(fixture());
assert.equal(ok.designGate,'DESIGN_CONTRACT_READY_UNATTESTED');
assert.equal(ok.actualDownloaderApproval,'HOLD');
assert.equal(ok.originAuthenticated,false);
assert.equal(ok.tlsAuthenticated,false);
assert.equal(ok.attemptProven,false);
assert.equal(ok.finalQualityJudgement,'withheld');
assert.equal(ok.networkRequests,0);
assert.equal(ok.credentialsRead,0);
assert.deepEqual(ok.issues,[]);
const fail=(name,mutate,issue)=>{
 const x=fixture();mutate(x);const r=assessOfflineDownloaderPreflight(x);
 assert.equal(r.designGate,'HOLD',name);
 assert.ok(r.issues.includes(issue),name+': '+r.issues);
 assert.equal(r.actualDownloaderApproval,'HOLD');
 assert.equal(r.originAuthenticated,false);
 assert.equal(r.attemptProven,false);
};
fail('unapproved host',x=>{x.approvedHosts=['other.example.test']},'GATE_INPUT_INVALID');
fail('localhost storage',x=>{x.storageHost='localhost';x.approvedHosts=['localhost']},'GATE_INPUT_INVALID');
fail('invalid SHA',x=>{x.commitSha='?'},'GATE_INPUT_INVALID');
fail('storage token',x=>{x.credentialBoundary.storageAuthorizationSent=true},'GATE_CREDENTIAL_BOUNDARY');
fail('cookie',x=>{x.credentialBoundary.storageCookieSent=true},'GATE_CREDENTIAL_BOUNDARY');
fail('custom credential header',x=>{x.credentialBoundary.storageHeaderNames=['accept','x-token']},'GATE_CREDENTIAL_BOUNDARY');
fail('wrong API permission',x=>{x.credentialBoundary.permission='contents:write'},'GATE_CREDENTIAL_BOUNDARY');
fail('persisted secret',x=>{x.credentialBoundary.tokenPersisted=true},'GATE_CREDENTIAL_BOUNDARY');
fail('token in logs',x=>{x.credentialBoundary.secretInLogs=true},'GATE_CREDENTIAL_BOUNDARY');
fail('HTTP method',x=>{x.credentialBoundary.storageMethod='POST'},'GATE_CREDENTIAL_BOUNDARY');
fail('private IPv4',x=>{x.dnsObservation.answers[0].address='10.0.0.2';x.dnsObservation.peerAddress='10.0.0.2';x.tlsObservation.peerAddress='10.0.0.2'},'GATE_DNS_BOUNDARY');
fail('loopback IPv4',x=>{x.dnsObservation.answers[0].address='127.0.0.1';x.dnsObservation.peerAddress='127.0.0.1';x.tlsObservation.peerAddress='127.0.0.1'},'GATE_DNS_BOUNDARY');
fail('link local IPv4',x=>{x.dnsObservation.answers[0].address='169.254.2.3'},'GATE_DNS_BOUNDARY');
fail('metadata IP',x=>{x.dnsObservation.answers[0].address='169.254.169.254'},'GATE_DNS_BOUNDARY');
fail('CGNAT',x=>{x.dnsObservation.answers[0].address='100.64.5.7'},'GATE_DNS_BOUNDARY');
fail('IPv6 pending separate policy',x=>{x.dnsObservation.answers[0].type='AAAA';x.dnsObservation.answers[0].address='::1'},'GATE_DNS_BOUNDARY');
fail('DNS CNAME',x=>{x.dnsObservation.cnameCount=1},'GATE_DNS_BOUNDARY');
fail('DNS rebinding peer mismatch',x=>{x.dnsObservation.peerAddress='1.1.1.1'},'GATE_DNS_BOUNDARY');
fail('multiple DNS answers',x=>{x.dnsObservation.answers.push({type:'A',address:'1.1.1.1'})},'GATE_DNS_BOUNDARY');
fail('TLS hostname mismatch',x=>{x.tlsObservation.servername='other.example.test'},'GATE_TLS_BOUNDARY');
fail('TLS chain invalid',x=>{x.tlsObservation.chainVerified=false},'GATE_TLS_BOUNDARY');
fail('TLS unauthorized bypass',x=>{x.tlsObservation.rejectUnauthorized=false},'GATE_TLS_BOUNDARY');
fail('intercepting proxy',x=>{x.tlsObservation.proxyIntercepted=true},'GATE_TLS_BOUNDARY');
fail('TLS to different peer',x=>{x.tlsObservation.peerAddress='1.1.1.1'},'GATE_TLS_BOUNDARY');
fail('wrong artifact run',x=>{x.artifact.workflow_run.id=42},'GATE_ATTEMPT_UNATTESTED');
fail('cross commit',x=>{x.attemptEvidence.commitSha='a'.repeat(40)},'GATE_ATTEMPT_UNATTESTED');
fail('wrong attempt',x=>{x.attemptEvidence.runAttempt=1},'GATE_ATTEMPT_UNATTESTED');
fail('independent proof missing',x=>{x.attemptEvidence.independentAttemptProof=false},'GATE_ATTEMPT_UNATTESTED');
fail('unhealthy run',x=>{x.run.conclusion='failure'},'GATE_ATTEMPT_UNATTESTED');
fail('cross artifact',x=>{x.attemptEvidence.artifactId=1},'GATE_ATTEMPT_UNATTESTED');
fail('replaced ZIP',x=>{x.archiveReceipt.rawSha256='b'.repeat(64)},'GATE_ARCHIVE_BINDING');
fail('withheld promoted',x=>{x.archiveReceipt.finalQualityJudgement='pass'},'GATE_ARCHIVE_BINDING');
fail('fake TLS attestation',x=>{x.archiveReceipt.tlsAuthenticated=true},'GATE_ARCHIVE_BINDING');
fail('oversize ZIP',x=>{x.archiveReceipt.byteLength=104857601},'GATE_ARCHIVE_BINDING');
console.log('[STAGE01_GITHUB_DOWNLOADER_PREFLIGHT] PASS (offline DNS/TLS/credential/attempt/ZIP fail-closed, no real transport, actual approval=HOLD)');
