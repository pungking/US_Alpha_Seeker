// AS-INTEGRATION-52: offline-only GitHub artifact 302 observation validator.
// Never opens a socket, follows a redirect, reads a credential or asserts TLS.
import { createHash } from 'node:crypto';

const MAX_ZIP = 100 * 1024 * 1024;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const GITHUB_ARTIFACT_ZIP = /^https:\/\/api\.github\.com\/repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/artifacts\/[1-9][0-9]*\/zip$/;
const HOST = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const fail = code => { throw new Error(code); };
const record = v => v && typeof v === 'object' && !Array.isArray(v);
const sha = v => createHash('sha256').update(v).digest('hex');
const validHost = v => typeof v === 'string' && HOST.test(v) && v !== 'localhost' && !v.endsWith('.localhost');

function parseStorageUrl(location, allowedHosts) {
  if (typeof location !== 'string' || location.length > 8192 || /[\r\n\\\s]/.test(location)) fail('REDIRECT_LOCATION_INVALID');
  let u;
  try { u = new URL(location); } catch { fail('REDIRECT_LOCATION_INVALID'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port
    || u.hash || !u.pathname.startsWith('/') || !u.search) fail('REDIRECT_LOCATION_INVALID');
  if (!allowedHosts.includes(u.hostname) || !validHost(u.hostname)) fail('REDIRECT_STORAGE_HOST_DENIED');
  if (u.origin === 'https://api.github.com') fail('REDIRECT_STORAGE_HOST_DENIED');
  return u;
}

// Both the approved storage hosts and expected API digest must come from
// outside this untrusted redirect response; neither is inferred from Location.
export function validateOfflineGitHubZipRedirect({
  apiUrl, redirect, storage, approvedStorageHosts, expectedDigest,
  observedAtMs, evaluatedAtMs
} = {}) {
  if (!GITHUB_ARTIFACT_ZIP.test(apiUrl || '')) fail('REDIRECT_API_URL_INVALID');
  if (!Array.isArray(approvedStorageHosts) || approvedStorageHosts.length === 0
    || approvedStorageHosts.length > 8 || !approvedStorageHosts.every(validHost)
    || new Set(approvedStorageHosts).size !== approvedStorageHosts.length) fail('REDIRECT_HOST_POLICY_INVALID');
  if (!SHA256.test(expectedDigest || '')) fail('REDIRECT_EXPECTED_DIGEST_INVALID');
  if (!Number.isSafeInteger(observedAtMs) || !Number.isSafeInteger(evaluatedAtMs)
    || evaluatedAtMs < observedAtMs || evaluatedAtMs - observedAtMs > 60000) fail('REDIRECT_OBSERVATION_EXPIRED');
  if (!record(redirect) || redirect.method !== 'GET' || redirect.url !== apiUrl
    || redirect.status !== 302 || redirect.redirectCount !== 0
    || redirect.truncated !== false || redirect.timedOut !== false) fail('REDIRECT_API_RESPONSE_INVALID');
  const u = parseStorageUrl(redirect.location, approvedStorageHosts);
  if (!record(storage) || storage.method !== 'GET' || storage.url !== u.href
    || storage.finalUrl !== u.href || storage.status !== 200
    || storage.redirectCount !== 0 || storage.truncated !== false || storage.timedOut !== false) fail('REDIRECT_STORAGE_RESPONSE_INVALID');
  // Authentication headers and cookies must not be forwarded to the signed
  // storage endpoint. This is a check of reported request metadata ONLY.
  if (!record(storage.requestHeaders)) fail('REDIRECT_REQUEST_HEADERS_UNVERIFIED');
  // Fail closed on ALL unreviewed header names, including custom token aliases.
  // The signed storage GET needs no GitHub Authorization/Cookie; an explicit
  // Accept header is the only permitted caller-controlled request header.
  if (Object.keys(storage.requestHeaders).some(k => k !== 'accept')
    || (storage.requestHeaders.accept !== undefined && storage.requestHeaders.accept !== 'application/zip')) {
    fail('REDIRECT_CREDENTIAL_FORWARDING_DENIED');
  }
  if (!(storage.body instanceof Uint8Array) || storage.body.byteLength < 22
    || storage.body.byteLength > MAX_ZIP) fail('REDIRECT_ZIP_BYTES_INVALID');
  const headerLength = storage.headers?.['content-length'];
  if (headerLength !== undefined && (!/^(0|[1-9][0-9]*)$/.test(String(headerLength))
    || Number(headerLength) !== storage.body.byteLength)) fail('REDIRECT_CONTENT_LENGTH_INVALID');
  if (!/^(?:application\/(?:zip|octet-stream|x-zip-compressed))(?:;|$)/i.test(storage.headers?.['content-type'] || '')) fail('REDIRECT_CONTENT_TYPE_INVALID');
  const bytes = Buffer.from(storage.body);
  const observedDigest = 'sha256:' + sha(bytes);
  if (observedDigest !== expectedDigest) fail('REDIRECT_ARCHIVE_SHA256_MISMATCH');
  // Never store URL path, query, signed token, cookies or headers in receipt.
  const receipt = Object.freeze({
    schemaVersion:'github-artifact-redirect-observation-v1',
    apiUrl, storageHost:u.hostname,
    redirectStatus:302, storageStatus:200,
    byteLength:bytes.length, rawSha256:sha(bytes),
    originAuthenticated:false, tlsAuthenticated:false,
    provenanceAttested:false, finalQualityJudgement:'withheld'
  });
  return { bytes, receipt };
}
