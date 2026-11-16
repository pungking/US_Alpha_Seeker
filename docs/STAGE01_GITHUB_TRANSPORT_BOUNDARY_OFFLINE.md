# STEP #AS-INTEGRATION-49 — Offline GitHub transport observation boundary

## Purpose and security claim

This change defines an **offline deterministic validator** for externally observed GitHub REST responses; it **does not implement an authenticated HTTP client**. It does not call fetch, store tokens, read secrets, access providers, mutate workflows or run scheduled jobs. The injected observation records can be forged, and neither API authority nor the TLS chain is authenticated by these fixtures. All receipts retain `originAuthenticated=false`, `provenanceAttested=false` and `finalQualityJudgement=withheld` in the downstream Stage0/1 audit. No receipt is an authorization to trade or quality PASS.

## Allowed observations

Exactly four pinned endpoints, in order, under `https://api.github.com/repos/{owner}/{repo}`: repository metadata; `actions/runs/{runId}`; `actions/artifacts/{artifactId}`; `actions/artifacts/{artifactId}/zip`.

Each record must represent a `GET` to the exact expected URL with status `200`, equal initial/final URL, `redirectCount=0`, `truncated=false`, `timedOut=false`, approved media type and matching content-length when present. Replayed JSON must be valid UTF-8 JSON object at most 4 MiB; ZIP must be binary at most 100 MiB. Exact raw response bytes are SHA-256 hashed into stripped observation receipts. These receipts never contain token, cookie, Authorization header or response body.

This conservative **no redirects** contract is for test observations. The real GitHub artifact download endpoint commonly responds with a temporary redirect to storage. A later implementation must handle that redirect in a **separate isolated trusted downloader**, validating the destination allowlist, scheme, TLS, permissions, timeout and byte cap before passing the final bytes as verified evidence. Do not weaken this policy automatically. A connector-produced ZIP is not automatically trusted merely because it was downloaded from the API endpoint.

## Positive/negative synthetic fixtures

In-memory GET responses exercise: fixed endpoint ordering; raw SHA-256 receipts; endpoint, method and final URL tampering; redirects; HTTP 206/401, partial/truncated/timed-out responses; invalid content types, length mismatch, bad JSON and invalid UTF-8; JSON/ZIP size limits; transport-order violation; changed Run Attempt and withheld Stage0/1 originals.

The offline adapter is passed into the previously merged `auditReadOnlyGitHubEvidence` function. Cross-Run, Stage0→1 PIT, Stage3–6 lineage, Stage6 safety and no-provider/no-Drive tests remain in existing CI. No live GitHub API or download is executed by the tests.

## Independent STEP #AS-INTEGRATION-50 security review

GitHub's official REST specification confirms that `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` returns an **HTTP 302 redirect to a temporary archive URL that expires after one minute**. See [GitHub Actions artifacts REST API](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2022-11-28#download-an-artifact). A `302` with `Location` is **not a ZIP byte response**, and an assertion of `finalUrl === requestedUrl` is not valid evidence that the redirect chain has been securely checked. The offline validator deliberately refuses 302 rather than performing a network fetch.

An eventual real downloader must validate the GitHub API 302 response and ephemeral URL in a **separately approved, isolated stage**. Never accept arbitrary `Location` origins, userinfo, plaintext HTTP, chained redirects, DNS rebinding or credential forwarding to the redirected host. Transfer no GitHub Authorization header to a storage origin by default. Enforce a bounded expiry, timeouts, bytes, TLS validation and hash match against independently retrieved artifact metadata. Avoid logging the full signed URL, whose query may contain sensitive parameters.

The independent review found that the standalone response verifier previously allowed an incorrect `runs/{run_id}/zip` URL shape and did not bind JSON-vs-ZIP kind to the corresponding path. Both are rejected now, even if that verifier is called outside the ordered adapter. Tests additionally check 302 refusal and redaction of Authorization/Cookie in observation receipts.

**Trust boundary:** a receipt is a digest of **caller-provided bytes** plus declared GET metadata, not independent proof of server response, TLS identity, token authority, Artifact producer Attempt, or source correctness. All `originAuthenticated` and `provenanceAttested` flags remain false, Stage0/1 absence remains `NOT_EXPORTED`, and quality is withheld. The transport policy does not turn a `SKIPPED`, incomplete or cross-Run artifact into PASS.

### Recovery after future integration (not authorized here)
If a future credentialed downloader exhibits redirects to unexpected hosts, archive hash mismatch, ZIP truncation or Stage0/1 source mismatch, stop acceptance, preserve non-secret error codes plus immutable raw-byte hashes, disable only the newly added reader using its default-off gate, and revert its own PR after a separate owner approval if needed. Never downgrade TLS, bypass hash checks, modify Workflow/Ruleset, rerun production workflows or activate PAPER/LIVE to force a green result.

## Prerequisites for any authenticated integration (not in scope)

1. Explicit separate approval for a real read-only GitHub transport, least-privilege token scopes, credential handling, source identity and destination/TLS controls; no write or dispatch endpoints.
2. Strict GET-only allowlist, no following redirects except a separately reviewed storage-download path with TLS peer validation, an approved destination policy, size/time and retry budgets. No query token leakage into receipts or logs.
3. Independent capture of repository ID/name, Run ID/Attempt/Commit SHA/workflow, Artifact ID/Run/source repo and ZIP bytes, with raw bytes and immutable receipts bound to the same observation session.
4. Independent evidence of exactly which Run Attempt generated an Artifact: the GitHub `artifact.workflow_run` object alone lacks a proven attempt claim. Fail closed when ambiguous.
5. Keep `NOT_EXPORTED` distinct from `SKIPPED`. Never mark origin authenticated solely from caller-provided metadata, matching hashes or CRC.
6. Separate PR, independent review, explicit merge approval and new main CI before any acceptance. No provider/Drive/dispatch/rerun/PAPER/LIVE change.

## Baseline and boundaries

Base main `f41cb87ce2a2163ec1c4d952ff3e03fbafd28e7b`. Existing Draft PR #84 (dashboard AI + workflow) is outside scope and remains untouched. The missing `docs/AI_DEVELOPMENT_CONTINUITY.md` and `docs/DEVELOPMENT_HANDOFF.md` could not be read at this main. `AGENTS.md` and `goal/goal.yaml` remain authoritative. Existing Stage6 runtime goal and actual Stage0/1 provenance remain HOLD.
