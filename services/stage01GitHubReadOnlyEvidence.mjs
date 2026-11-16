// AS-INTEGRATION-45: bounded read-only GitHub evidence acquisition boundary.
// All I/O is delegated to caller-supplied adapters; no credentials, network,
// artifact persistence, workflow dispatch or execution in this module.
// An injected reader can be forged. Never promote transport to trusted proof.
import { auditGitHubArchiveReadback } from './stage01GitHubArchiveReadback.mjs';

const ID = n => Number.isSafeInteger(n) && n > 0;
const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_DOWNLOAD = 100 * 1024 * 1024;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const origin = repo => 'https://api.github.com/repos/' + repo;

function baseResult(repository, runId, artifactId, issues, requests, audit = null) {
  return {
    schemaVersion: 'stage01-github-readonly-evidence-v1',
    repository,
    runId,
    artifactId,
    requestCount: requests.length,
    requestedEndpoints: requests,
    issues,
    // A returned audit object is not evidence of correlation when it WITHHELD.
    readbackCorrelated: issues.length === 0 && audit?.verdict === 'CORRELATED_UNATTESTED',
    audit,
    verdict: issues.length === 0 && audit?.verdict === 'CORRELATED_UNATTESTED'
      ? 'READBACK_CORRELATED_UNATTESTED' : 'WITHHELD',
    // GitHub responses and ZIP bytes are delivered by an injected adapter.
    // Their origin, TLS identity and any authorization are NOT verified here.
    provenanceAttested: false,
    originAuthenticated: false,
    finalQualityJudgement: 'withheld'
  };
}

export async function auditReadOnlyGitHubEvidence({
  repository, runId, runAttempt, commitSha, artifactId, readJson, readArtifactBytes
} = {}) {
  const requests = [], issues = [];
  const add = code => { if (!issues.includes(code)) issues.push(code); };
  if (!REPO.test(repository || '') || !ID(runId) || !ID(artifactId)
    || !ID(runAttempt) || !SHA.test(commitSha || '')
    || typeof readJson !== 'function' || typeof readArtifactBytes !== 'function') {
    return baseResult(repository ?? null, runId ?? null, artifactId ?? null,
      ['INPUT_INVALID'], requests);
  }
  const root = origin(repository);
  const urls = [
    root,
    root + '/actions/runs/' + runId,
    root + '/actions/artifacts/' + artifactId
  ];
  let repo, run, artifact;
  try {
    for (const [index, url] of urls.entries()) {
      requests.push(url);
      const response = await readJson(url);
      if (!object(response)) throw Error('not JSON object');
      if (index === 0) repo = response;
      if (index === 1) run = response;
      if (index === 2) artifact = response;
    }
  } catch {
    add('GITHUB_READBACK_UNAVAILABLE');
    return baseResult(repository, runId, artifactId, issues, requests);
  }
  if (!ID(repo.id) || repo.full_name !== repository
    || run.id !== runId || run.run_attempt !== runAttempt
    || run.head_sha !== commitSha || run.repository?.id !== repo.id
    || run.repository?.full_name !== repository
    || run.status !== 'completed' || run.conclusion !== 'success'
    || !ID(run.workflow_id) || typeof run.path !== 'string'
    || !/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(run.path)) add('GITHUB_RUN_IDENTITY_MISMATCH');
  if (artifact.id !== artifactId || artifact.workflow_run?.id !== runId
    || artifact.workflow_run?.repository_id !== repo.id
    || artifact.workflow_run?.head_repository_id !== repo.id
    || artifact.workflow_run?.head_sha !== commitSha
    || artifact.expired !== false || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')) {
    add('GITHUB_ARTIFACT_IDENTITY_MISMATCH');
  }
  if (issues.length) return baseResult(repository, runId, artifactId, issues, requests);
  const zipUrl = root + '/actions/artifacts/' + artifactId + '/zip';
  let zip;
  try {
    requests.push(zipUrl);
    zip = await readArtifactBytes(zipUrl);
    if (!(zip instanceof Uint8Array) || zip.byteLength < 22 || zip.byteLength > MAX_DOWNLOAD) {
      throw Error('invalid ZIP bytes or size');
    }
  } catch {
    add('GITHUB_ARTIFACT_BYTES_UNAVAILABLE');
    return baseResult(repository, runId, artifactId, issues, requests);
  }
  let audit;
  try {
    audit = await auditGitHubArchiveReadback({
      repository, run, artifact, zipBytes: zip
    });
  } catch {
    add('GITHUB_ARCHIVE_AUDIT_ERROR');
    return baseResult(repository, runId, artifactId, issues, requests);
  }
  // A fully checked archive can still legitimately have no Stage0/1 originals.
  // NOT_EXPORTED and SKIPPED must not be treated as quality PASS or origin proof.
  if (audit.issues.length > 0) add('GITHUB_ARCHIVE_AUDIT_WITHHELD');
  return baseResult(repository, runId, artifactId, issues, requests, audit);
}
