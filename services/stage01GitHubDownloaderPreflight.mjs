// AS-INTEGRATION-57: pure offline design-gate / threat-model assertions.
// Observations are ALL caller-supplied and forgeable. No network, TLS, DNS,
// credential access or provenance authentication occurs in this module.
import { isIP } from 'node:net';

const deny = code => {throw new Error(code);};
const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = v => Number.isSafeInteger(v) && v > 0;
const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const host = v => typeof v === 'string' && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(v) && v.length <= 253;
function publicIPv4(v) {
  if (isIP(v) !== 4) return false; // IPv6 needs a separate reviewed policy.
  const [a,b,c] = v.split('.').map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127
    && !(a===100 && b>=64 && b<=127) && !(a===169 && b===254)
    && !(a===172 && b>=16 && b<=31) && !(a===192 && b===168)
    && !(a===192 && b===0 && c===0) && !(a===192 && b===0 && c===2)
    && !(a===192 && b===88 && c===99)
    && !(a===198 && (b===18 || b===19 || (b===51 && c===100)))
    && !(a===203 && b===0 && c===113)
    && !(a===192 && b===0 && c===0) && a !== 255;
}
const reasons = {
  inputs:'GATE_INPUT_INVALID',
  credentials:'GATE_CREDENTIAL_BOUNDARY',
  dns:'GATE_DNS_BOUNDARY',
  tls:'GATE_TLS_BOUNDARY',
  attempt:'GATE_ATTEMPT_UNATTESTED',
  zip:'GATE_ARCHIVE_BINDING',
};
export function assessOfflineDownloaderPreflight({
  repository, runId, runAttempt, commitSha, artifactId,
  artifact, run, attemptEvidence, credentialBoundary, dnsObservation,
  tlsObservation, archiveReceipt, storageHost, approvedHosts
}={}) {
  const issues=[];
  const add=(key)=>{if(!issues.includes(reasons[key]))issues.push(reasons[key]);};
  if (typeof repository!=='string'|| !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
    || !id(runId)||!id(runAttempt)||!id(artifactId)||!sha(commitSha)
    || !host(storageHost)||!Array.isArray(approvedHosts)||!approvedHosts.includes(storageHost)
    || approvedHosts.length>8||approvedHosts.length<1||!approvedHosts.every(host)
    || new Set(approvedHosts).size!==approvedHosts.length) add('inputs');
  // Credentials are only allowed at api.github.com and with actions:read.
  // No actual token is accepted or read. Even perfect caller claims do not
  // prove credentials were handled correctly on a live connection.
  if (!obj(credentialBoundary) || credentialBoundary.apiHost!=='api.github.com'
    || credentialBoundary.permission!=='actions:read'
    || credentialBoundary.apiMethod!=='GET'
    || credentialBoundary.storageMethod!=='GET'
    || credentialBoundary.storageAuthorizationSent!==false
    || credentialBoundary.storageCookieSent!==false
    || credentialBoundary.storageProxyAuthorizationSent!==false
    || credentialBoundary.storageHeaderNames?.length>1
    || (credentialBoundary.storageHeaderNames?.length===1
      && credentialBoundary.storageHeaderNames[0]!=='accept')
    || credentialBoundary.tokenPersisted!==false
    || credentialBoundary.secretInLogs!==false) add('credentials');
  // Conservative design gate: one A record, no CNAME and a public IPv4
  // connection peer matching the pinned DNS answer. This is NOT a live
  // DNS lookup or DNS rebinding defense without a real socket peer check.
  if (!obj(dnsObservation)||dnsObservation.host!==storageHost
    || !Array.isArray(dnsObservation.answers)||dnsObservation.answers.length!==1
    || dnsObservation.answers[0]?.type!=='A'
    || !publicIPv4(dnsObservation.answers[0]?.address)
    || dnsObservation.peerAddress!==dnsObservation.answers[0]?.address
    || dnsObservation.cnameCount!==0 || dnsObservation.connectAfterResolve!==true) add('dns');
  if (!obj(tlsObservation)||tlsObservation.host!==storageHost
    || tlsObservation.servername!==storageHost || tlsObservation.scheme!=='https'
    || tlsObservation.chainVerified!==true || tlsObservation.hostnameVerified!==true
    || tlsObservation.rejectUnauthorized!==true
    || tlsObservation.proxyIntercepted!==false
    || tlsObservation.peerAddress!==dnsObservation?.peerAddress) add('tls');
  // GitHub's artifact.workflow_run does not establish producing attempt.
  // A second caller assertion must be compatible, but it is still untrusted
  // absent independently authenticated attempt-specific evidence.
  if (!obj(run)||run.id!==runId||run.run_attempt!==runAttempt
    || run.head_sha!==commitSha||run.repository?.full_name!==repository
    || run.status!=='completed'||run.conclusion!=='success'
    || !obj(artifact)||artifact.id!==artifactId
    || artifact.workflow_run?.id!==runId||artifact.workflow_run?.head_sha!==commitSha
    || !obj(attemptEvidence)||attemptEvidence.runId!==runId
    || attemptEvidence.runAttempt!==runAttempt||attemptEvidence.commitSha!==commitSha
    || attemptEvidence.artifactId!==artifactId
    || attemptEvidence.independentAttemptProof!==true) add('attempt');
  if (!obj(archiveReceipt)||archiveReceipt.rawSha256!==artifact?.digest?.replace(/^sha256:/,'')
    || archiveReceipt.originAuthenticated!==false
    || archiveReceipt.tlsAuthenticated!==false
    || archiveReceipt.provenanceAttested!==false
    || archiveReceipt.finalQualityJudgement!=='withheld'
    || !Number.isSafeInteger(archiveReceipt.byteLength)||archiveReceipt.byteLength<22
    || archiveReceipt.byteLength>104857600) add('zip');
  return Object.freeze({
    schemaVersion:'github-downloader-offline-preflight-v1',
    issues:Object.freeze(issues),
    // A "ready" result means only that synthetic gate inputs cohere.
    designGate:issues.length===0?'DESIGN_CONTRACT_READY_UNATTESTED':'HOLD',
    actualDownloaderApproval:'HOLD',
    originAuthenticated:false,tlsAuthenticated:false,
    provenanceAttested:false,attemptProven:false,
    finalQualityJudgement:'withheld',
    networkRequests:0,credentialsRead:0
  });
}
