import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fixedGitHubReadEndpoints, makeOfflineGitHubReadAdapter, verifyReadOnlyExchange }
  from '../services/stage01GitHubTransportBoundary.mjs';
import { auditReadOnlyGitHubEvidence } from '../services/stage01GitHubReadOnlyEvidence.mjs';

const repo='pungking/US_Alpha_Seeker', id=43470901390, artifactId=14062682867;
const sha='77c40cb70d65197466e8382cde1c6f71690bbc6a';
const urls=fixedGitHubReadEndpoints({repository:repo,runId:id,artifactId});
assert.equal(urls.length,4);
assert.equal(urls[3],'https://api.github.com/repos/'+repo+'/actions/artifacts/'+artifactId+'/zip');
const crc32 = bytes => {
  let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^(n&1?0xedb88320:0);}
  return (n^0xffffffff)>>>0;
};
function makeZip(){
  const body=Buffer.from('synthetic'),name=Buffer.from('state/evidence.txt');
  const local=Buffer.alloc(30),cd=Buffer.alloc(46),end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt32LE(crc32(body),14);local.writeUInt32LE(body.length,18);
  local.writeUInt32LE(body.length,22);local.writeUInt16LE(name.length,26);
  cd.writeUInt32LE(0x02014b50,0);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);
  cd.writeUInt32LE(crc32(body),16);cd.writeUInt32LE(body.length,20);cd.writeUInt32LE(body.length,24);
  cd.writeUInt16LE(name.length,28);
  const offset=30+name.length+body.length;
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);
  end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([local,name,body,cd,name,end]);
}
const zip=makeZip(),hash=v=>createHash('sha256').update(v).digest('hex');
const data=[
  {id:1139620490,full_name:repo},
  {id,run_attempt:1,head_sha:sha,workflow_id:230326556,
    repository:{id:1139620490,full_name:repo},path:'.github/workflows/schedule.yml',
    status:'completed',conclusion:'success'},
  {id:artifactId,name:'automation-evidence',expired:false,digest:'sha256:'+hash(zip),
    workflow_run:{id,repository_id:1139620490,head_repository_id:1139620490,head_sha:sha}}
];
const observed=(url,body,kind)=>({
  method:'GET',url,finalUrl:url,redirectCount:0,status:200,
  truncated:false,timedOut:false,
  headers:{'content-type':kind==='zip'?'application/zip':'application/json','content-length':String(body.length)},
  body
});
const exchanges=()=>urls.map((url,i)=>observed(url,i===3?zip:Buffer.from(JSON.stringify(data[i])),i===3?'zip':'json'));
const adapter=makeOfflineGitHubReadAdapter({repository:repo,runId:id,artifactId,exchanges:exchanges()});
const result=await auditReadOnlyGitHubEvidence({
  repository:repo,runId:id,runAttempt:1,commitSha:sha,artifactId,
  readJson:adapter.readJson,readArtifactBytes:adapter.readArtifactBytes
});
assert.equal(result.verdict,'WITHHELD');
assert.equal(result.readbackCorrelated,false);
assert.equal(result.audit.stages.stage0.availability,'NOT_EXPORTED');
assert.equal(result.audit.stages.stage1.availability,'NOT_EXPORTED');
assert.equal(result.originAuthenticated,false);
assert.equal(result.provenanceAttested,false);
assert.equal(adapter.receipts().length,4);
assert.deepEqual(adapter.receipts().map(x=>x.rawSha256),
  [...data.map(x=>hash(Buffer.from(JSON.stringify(x)))),hash(zip)]);
assert.ok(adapter.receipts().every(x=>!JSON.stringify(x).includes('Authorization')));
assert.ok(adapter.receipts().every(x=>x.originAuthenticated===false));
assert.throws(()=>adapter.receipts().push('x'),TypeError);
const reject = (mutate,code)=>{
  const xs=exchanges();mutate(xs);
  const idx=xs.findIndex((x,i)=>JSON.stringify(x)!==JSON.stringify(exchanges()[i]));
  const at=idx<0?0:idx;
  assert.throws(()=>verifyReadOnlyExchange({
    expectedUrl:urls[at],kind:at===3?'zip':'json',exchange:xs[at]
  }),new RegExp(code));
};
reject(x=>{x[0].method='POST';},'TRANSPORT_METHOD_OR_REDIRECT_DENIED');
reject(x=>{x[0].url='https://evil.example/';},'TRANSPORT_METHOD_OR_REDIRECT_DENIED');
reject(x=>{x[0].finalUrl='https://evil.example/';},'TRANSPORT_METHOD_OR_REDIRECT_DENIED');
reject(x=>{x[3].redirectCount=1;},'TRANSPORT_METHOD_OR_REDIRECT_DENIED');
// GitHub Actions ZIP API normally responds HTTP 302 with an ephemeral Location.
// This offline verifier must block raw redirect observations, never follow them.
reject(x=>{x[3].status=302;x[3].headers.location='https://evil.example/secret?token=fake';},'TRANSPORT_PARTIAL_OR_FAILED');
assert.throws(()=>verifyReadOnlyExchange({
  expectedUrl:urls[3],kind:'json',exchange:exchanges()[3]
}),/TRANSPORT_KIND_URL_MISMATCH/);
assert.throws(()=>verifyReadOnlyExchange({
  expectedUrl:urls[0],kind:'zip',exchange:exchanges()[0]
}),/TRANSPORT_KIND_URL_MISMATCH/);
assert.throws(()=>verifyReadOnlyExchange({
  expectedUrl:urls[1]+'/zip',kind:'zip',exchange:{...exchanges()[1],url:urls[1]+'/zip',finalUrl:urls[1]+'/zip'}
}),/TRANSPORT_URL_INVALID/);
// Headers must never enter receipts, even for otherwise accepted observations.
const secretExchange=exchanges()[0];
secretExchange.headers.authorization='Bearer TEST_SECRET_NOT_FOR_LOGS';
secretExchange.headers.cookie='session=TEST_SECRET_NOT_FOR_LOGS';
const safe=verifyReadOnlyExchange({expectedUrl:urls[0],kind:'json',exchange:secretExchange});
assert.equal(JSON.stringify(safe.receipt).includes('TEST_SECRET_NOT_FOR_LOGS'),false);
assert.equal(safe.receipt.originAuthenticated,false);
reject(x=>{x[0].status=206;},'TRANSPORT_PARTIAL_OR_FAILED');
reject(x=>{x[0].status=401;},'TRANSPORT_PARTIAL_OR_FAILED');
reject(x=>{x[0].truncated=true;},'TRANSPORT_PARTIAL_OR_FAILED');
reject(x=>{x[0].timedOut=true;},'TRANSPORT_PARTIAL_OR_FAILED');
reject(x=>{x[0].headers['content-length']='1000000';},'TRANSPORT_CONTENT_LENGTH_MISMATCH');
reject(x=>{x[0].headers['content-type']='text/html';},'TRANSPORT_CONTENT_TYPE_INVALID');
reject(x=>{x[3].headers['content-type']='text/html';},'TRANSPORT_CONTENT_TYPE_INVALID');
reject(x=>{x[0].body=Buffer.from('{broken');x[0].headers['content-length']='7';},'TRANSPORT_JSON_INVALID');
reject(x=>{x[0].body=Buffer.from([0xff]);x[0].headers['content-length']='1';},'TRANSPORT_JSON_INVALID');
reject(x=>{x[0].body=Buffer.alloc(0);},'TRANSPORT_BYTES_LIMIT');
reject(x=>{x[0].body=Buffer.alloc(4*1024*1024+1);},'TRANSPORT_BYTES_LIMIT');
reject(x=>{x[3].body=Buffer.alloc(100*1024*1024+1);},'TRANSPORT_BYTES_LIMIT');
assert.throws(()=>fixedGitHubReadEndpoints({repository:'bad/../repo',runId:id,artifactId}),/TRANSPORT_COORDINATES_INVALID/);
assert.throws(()=>fixedGitHubReadEndpoints({repository:'https://evil.example',runId:id,artifactId}),/TRANSPORT_COORDINATES_INVALID/);
assert.throws(()=>makeOfflineGitHubReadAdapter({repository:repo,runId:id,artifactId,exchanges:exchanges().slice(0,3)}),/TRANSPORT_EXCHANGE_COUNT_INVALID/);
const wrong=makeOfflineGitHubReadAdapter({repository:repo,runId:id,artifactId,exchanges:exchanges()});
await assert.rejects(()=>wrong.readArtifactBytes(urls[3]),/TRANSPORT_SEQUENCE_DENIED/);
const forged=exchanges();forged[1].body=Buffer.from(JSON.stringify({...data[1],run_attempt:2}));
forged[1].headers['content-length']=String(forged[1].body.length);
const replay=makeOfflineGitHubReadAdapter({repository:repo,runId:id,artifactId,exchanges:forged});
const mismatch=await auditReadOnlyGitHubEvidence({repository:repo,runId:id,runAttempt:1,commitSha:sha,artifactId,
  readJson:replay.readJson,readArtifactBytes:replay.readArtifactBytes});
assert.equal(mismatch.verdict,'WITHHELD');
assert.equal(mismatch.requestCount,3);
assert.equal(mismatch.originAuthenticated,false);
console.log('[STAGE01_GITHUB_TRANSPORT_BOUNDARY] PASS (offline GET allowlist, response integrity, redirects/partial/timeout, SHA receipts, untrusted transport, no network)');
