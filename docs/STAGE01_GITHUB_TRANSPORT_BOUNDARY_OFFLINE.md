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

## Prerequisites for any authenticated integration (not in scope)

1. Explicit separate approval for a real read-only GitHub transport, least-privilege token scopes, credential handling, source identity and destination/TLS controls; no write or dispatch endpoints.
2. Strict GET-only allowlist, no following redirects except a separately reviewed storage-download path with TLS peer validation, an approved destination policy, size/time and retry budgets. No query token leakage into receipts or logs.
3. Independent capture of repository ID/name, Run ID/Attempt/Commit SHA/workflow, Artifact ID/Run/source repo and ZIP bytes, with raw bytes and immutable receipts bound to the same observation session.
4. Independent evidence of exactly which Run Attempt generated an Artifact: the GitHub `artifact.workflow_run` object alone lacks a proven attempt claim. Fail closed when ambiguous.
5. Keep `NOT_EXPORTED` distinct from `SKIPPED`. Never mark origin authenticated solely from caller-provided metadata, matching hashes or CRC.
6. Separate PR, independent review, explicit merge approval and new main CI before any acceptance. No provider/Drive/dispatch/rerun/PAPER/LIVE change.

## Baseline and boundaries

Base main `f41cb87ce2a2163ec1c4d952ff3e03fbafd28e7b`. Existing Draft PR #84 (dashboard AI + workflow) is outside scope and remains untouched. The missing `docs/AI_DEVELOPMENT_CONTINUITY.md` and `docs/DEVELOPMENT_HANDOFF.md` could not be read at this main. `AGENTS.md` and `goal/goal.yaml` remain authoritative. Existing Stage6 runtime goal and actual Stage0/1 provenance remain HOLD.
