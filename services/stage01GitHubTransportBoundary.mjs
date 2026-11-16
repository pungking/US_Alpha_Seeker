// AS-INTEGRATION-49: isolated deterministic evidence transport boundary.
// Pure offline consumer of externally observed responses. NO HTTP, token use,
// redirect following, credential reading or real GitHub origin attestation.
import { createHash } from 'node:crypto';

const ID = x => Number.isSafeInteger(x) && x > 0;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA = /^[a-f0-9]{40}$/;
const LIMIT_JSON = 4 * 1024 * 1024;
const LIMIT_ZIP = 100 * 1024 * 1024;
const fail = code => { throw new Error(code); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safeObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export function fixedGitHubReadEndpoints({ repository, runId, artifactId }) {
  if (!REPO.test(repository || '') || !ID(runId) || !ID(artifactId)) fail('TRANSPORT_COORDINATES_INVALID');
  const root = 'https://api.github.com/repos/' + repository;
  return Object.freeze([
    root,
    root + '/actions/runs/' + runId,
    root + '/actions/artifacts/' + artifactId,
    root + '/actions/artifacts/' + artifactId + '/zip'
  ]);
}

// Exchanges must be captured by a separately reviewed authenticated connector.
// An exchange's self-reported metadata is untrusted, even if it matches perfectly.
export function verifyReadOnlyExchange({ expectedUrl, kind, exchange }) {
  if (typeof expectedUrl !== 'string'
    || !/^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/actions\/(?:runs\/[0-9]+|artifacts\/[0-9]+(?:\/zip)?))?$/.test(expectedUrl)) fail('TRANSPORT_URL_INVALID');
  if (kind !== 'json' && kind !== 'zip') fail('TRANSPORT_KIND_INVALID');
  // Validate kind at the standalone verifier too: a ZIP cannot be accepted
  // as JSON metadata (or vice versa) even when the adapter is bypassed.
  const isArtifactZip = /\/actions\/artifacts\/[0-9]+\/zip$/.test(expectedUrl);
  if ((kind === 'zip') !== isArtifactZip) fail('TRANSPORT_KIND_URL_MISMATCH');
  if (!safeObject(exchange) || exchange.method !== 'GET' || exchange.url !== expectedUrl
    || exchange.finalUrl !== expectedUrl || exchange.redirectCount !== 0) fail('TRANSPORT_METHOD_OR_REDIRECT_DENIED');
  if (exchange.status !== 200 || exchange.truncated !== false || exchange.timedOut !== false) fail('TRANSPORT_PARTIAL_OR_FAILED');
  if (!(exchange.body instanceof Uint8Array)) fail('TRANSPORT_BYTES_INVALID');
  const limit = kind === 'json' ? LIMIT_JSON : LIMIT_ZIP;
  if (!exchange.body.byteLength || exchange.body.byteLength > limit) fail('TRANSPORT_BYTES_LIMIT');
  const declared = exchange.headers?.['content-length'];
  if (declared !== undefined && (!/^(0|[1-9][0-9]*)$/.test(String(declared))
    || Number(declared) !== exchange.body.byteLength)) fail('TRANSPORT_CONTENT_LENGTH_MISMATCH');
  if (kind === 'json' && !/^application\/(?:json|[^;\s]+\+json)(?:;|$)/i.test(exchange.headers?.['content-type'] || '')) fail('TRANSPORT_CONTENT_TYPE_INVALID');
  if (kind === 'zip' && !/^(?:application\/(?:zip|octet-stream|x-zip-compressed))(?:;|$)/i.test(exchange.headers?.['content-type'] || '')) fail('TRANSPORT_CONTENT_TYPE_INVALID');
  const bytes = Buffer.from(exchange.body);
  const receipt = Object.freeze({
    schemaVersion: 'github-readonly-transport-observation-v1',
    requestedUrl: expectedUrl,
    method: 'GET', status: 200, kind,
    byteLength: bytes.byteLength,
    rawSha256: digest(bytes),
    originAuthenticated: false,
    provenanceAttested: false
  });
  if (kind === 'zip') return { value: bytes, receipt };
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
  catch { fail('TRANSPORT_JSON_INVALID'); }
  if (!safeObject(value)) fail('TRANSPORT_JSON_INVALID');
  return { value, receipt };
}

// Adapter is intentionally limited to replayed observations; it cannot
// reach network, follow redirects or assert provenance. Receipts exclude
// Authorization, cookies and all other request or response headers.
export function makeOfflineGitHubReadAdapter({ repository, runId, artifactId, exchanges }) {
  const urls = fixedGitHubReadEndpoints({repository,runId,artifactId});
  if (!Array.isArray(exchanges) || exchanges.length !== 4) fail('TRANSPORT_EXCHANGE_COUNT_INVALID');
  const receipts=[];
  let cursor=0;
  const take=(url,kind)=>{
    if(url!==urls[cursor] || (kind==='json' && cursor>=3) || (kind==='zip' && cursor!==3)) fail('TRANSPORT_SEQUENCE_DENIED');
    const verified=verifyReadOnlyExchange({expectedUrl:url,kind,exchange:exchanges[cursor]});
    cursor++;receipts.push(verified.receipt);
    return verified.value;
  };
  return Object.freeze({
    readJson: async url=>take(url,'json'),
    readArtifactBytes: async url=>take(url,'zip'),
    receipts:()=>Object.freeze([...receipts]),
    observationOnly:true,
    originAuthenticated:false,
    provenanceAttested:false
  });
}
