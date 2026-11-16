import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateOfflineGitHubZipRedirect} from '../services/stage01GitHubZipRedirectOffline.mjs';

const sha = x => createHash('sha256').update(x).digest('hex');
const API = 'https://api.github.com/repos/pungking/US_Alpha_Seeker/actions/artifacts/14062682867/zip';
const SIGNED = 'https://artifacts.example-storage.test/blob.zip?sig=SECRET_DO_NOT_LOG&se=2026-11-16T16%3A00%3A00Z';
const now = Date.UTC(2026,10,16,6,0,0);
const zip = Buffer.concat([Buffer.from('PK\x03\x04'),Buffer.alloc(32)]);
const base=()=>({
 apiUrl:API,approvedStorageHosts:['artifacts.example-storage.test'],expectedDigest:'sha256:'+sha(zip),
 observedAtMs:now,evaluatedAtMs:now+1000,
 redirect:{method:'GET',url:API,status:302,redirectCount:0,truncated:false,timedOut:false,location:SIGNED},
 storage:{method:'GET',url:SIGNED,finalUrl:SIGNED,status:200,redirectCount:0,
   truncated:false,timedOut:false,requestHeaders:{'accept':'application/zip'},
   headers:{'content-type':'application/octet-stream','content-length':String(zip.length)},body:zip}
});
const result=validateOfflineGitHubZipRedirect(base());
assert.equal(result.receipt.rawSha256,sha(zip));
assert.equal(result.receipt.byteLength,zip.length);
assert.equal(result.receipt.storageHost,'artifacts.example-storage.test');
assert.equal(result.receipt.originAuthenticated,false);
assert.equal(result.receipt.tlsAuthenticated,false);
assert.equal(result.receipt.provenanceAttested,false);
assert.equal(result.receipt.finalQualityJudgement,'withheld');
assert.deepEqual(result.bytes,zip);
for(const sensitive of ['SECRET_DO_NOT_LOG','?sig=','requestHeaders','authorization','cookie']){
 assert.equal(JSON.stringify(result.receipt).includes(sensitive),false,sensitive);
}
const block=(title,change,expected)=>{
 const input=base();change(input);
 assert.throws(()=>validateOfflineGitHubZipRedirect(input),new RegExp(expected),title);
};
block('non API ZIP',x=>{x.apiUrl='https://evil.example/a';},'REDIRECT_API_URL_INVALID');
block('wrong API HTTP status',x=>{x.redirect.status=200;},'REDIRECT_API_RESPONSE_INVALID');
block('API changed',x=>{x.redirect.url='https://evil.example/';},'REDIRECT_API_RESPONSE_INVALID');
block('API method',x=>{x.redirect.method='POST';},'REDIRECT_API_RESPONSE_INVALID');
block('API partial',x=>{x.redirect.truncated=true;},'REDIRECT_API_RESPONSE_INVALID');
block('API timeout',x=>{x.redirect.timedOut=true;},'REDIRECT_API_RESPONSE_INVALID');
block('chained API redirect',x=>{x.redirect.redirectCount=1;},'REDIRECT_API_RESPONSE_INVALID');
block('unapproved host',x=>{x.redirect.location='https://evil.example/blob?sig=1';},'REDIRECT_STORAGE_HOST_DENIED');
block('storage URL is HTTP',x=>{x.redirect.location='http://artifacts.example-storage.test/blob?sig=1';},'REDIRECT_LOCATION_INVALID');
block('userinfo',x=>{x.redirect.location='https://a@artifacts.example-storage.test/blob?sig=1';},'REDIRECT_LOCATION_INVALID');
block('non default port',x=>{x.redirect.location='https://artifacts.example-storage.test:444/blob?sig=1';},'REDIRECT_LOCATION_INVALID');
block('fragment',x=>{x.redirect.location=SIGNED+'#fragment';},'REDIRECT_LOCATION_INVALID');
block('CRLF location',x=>{x.redirect.location=SIGNED+'\r\nx:y';},'REDIRECT_LOCATION_INVALID');
block('no signed query',x=>{x.redirect.location='https://artifacts.example-storage.test/blob.zip';},'REDIRECT_LOCATION_INVALID');
block('localhost host policy',x=>{x.approvedStorageHosts=['localhost'];},'REDIRECT_HOST_POLICY_INVALID');
block('IP literal host policy',x=>{x.approvedStorageHosts=['127.0.0.1'];},'REDIRECT_HOST_POLICY_INVALID');
block('API host as storage',x=>{x.approvedStorageHosts=['api.github.com'];x.redirect.location='https://api.github.com/blob?sig=1';},'REDIRECT_STORAGE_HOST_DENIED');
block('untrusted widened host policy',x=>{x.approvedStorageHosts=['other.example'];},'REDIRECT_STORAGE_HOST_DENIED');
block('missing allowlist',x=>{x.approvedStorageHosts=[];},'REDIRECT_HOST_POLICY_INVALID');
block('elapsed 60 sec boundary',x=>{x.evaluatedAtMs=now+60001;},'REDIRECT_OBSERVATION_EXPIRED');
block('clock rollback',x=>{x.evaluatedAtMs=now-1;},'REDIRECT_OBSERVATION_EXPIRED');
block('storage method',x=>{x.storage.method='POST';},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage URL mismatch',x=>{x.storage.url='https://evil.example/blob?sig=1';},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage final URL mismatch',x=>{x.storage.finalUrl='https://evil.example/blob?sig=1';},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage 206',x=>{x.storage.status=206;},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage 302',x=>{x.storage.status=302;},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage double redirect',x=>{x.storage.redirectCount=1;},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage truncated',x=>{x.storage.truncated=true;},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('storage timed out',x=>{x.storage.timedOut=true;},'REDIRECT_STORAGE_RESPONSE_INVALID');
block('header missing',x=>{delete x.storage.requestHeaders;},'REDIRECT_REQUEST_HEADERS_UNVERIFIED');
block('Authorization forwarded',x=>{x.storage.requestHeaders.Authorization='Bearer secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('Cookie forwarded',x=>{x.storage.requestHeaders.Cookie='secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('proxy Authorization forwarded',x=>{x.storage.requestHeaders['Proxy-Authorization']='secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('custom token forwarded',x=>{x.storage.requestHeaders['X-GitHub-Token']='secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('unreviewed header',x=>{x.storage.requestHeaders['x-observability-token']='secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('alternate-cased Accept with hidden token',x=>{delete x.storage.requestHeaders.accept;x.storage.requestHeaders.Accept='Bearer secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('Accept containing token',x=>{x.storage.requestHeaders.accept='Bearer secret';},'REDIRECT_CREDENTIAL_FORWARDING_DENIED');
block('content length mismatch',x=>{x.storage.headers['content-length']='9000';},'REDIRECT_CONTENT_LENGTH_INVALID');
block('content type invalid',x=>{x.storage.headers['content-type']='text/html';},'REDIRECT_CONTENT_TYPE_INVALID');
block('missing bytes',x=>{x.storage.body=Buffer.alloc(0);},'REDIRECT_ZIP_BYTES_INVALID');
block('oversize ZIP',x=>{x.storage.body=Buffer.alloc(100*1024*1024+1);},'REDIRECT_ZIP_BYTES_INVALID');
block('ZIP replaced',x=>{x.storage.body=Buffer.concat([zip,Buffer.from('ATTACK')]);x.storage.headers['content-length']=String(x.storage.body.length);},'REDIRECT_ARCHIVE_SHA256_MISMATCH');
block('digest forged',x=>{x.expectedDigest='sha256:'+'a'.repeat(64);},'REDIRECT_ARCHIVE_SHA256_MISMATCH');
block('missing digest',x=>{x.expectedDigest='';},'REDIRECT_EXPECTED_DIGEST_INVALID');
console.log('[STAGE01_GITHUB_ZIP_302_OFFLINE] PASS (synthetic 302 strict host/TLS assertions, no credential forwarding, content SHA and expiry; network=0, trust withheld)');
