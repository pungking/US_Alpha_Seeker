# STEP #AS-INTEGRATION-45 — GitHub read-only observation boundary (HOLD)

## Scope
This change adds an **offline-testable contract for a caller-supplied GitHub read-only transport**, rather than a live GitHub client, persistent credential handler, scheduled job or workflow mutation.

The contract pins four read locations in a fixed order:
1. `GET https://api.github.com/repos/{owner}/{repo}` — independent repository ID and full name;
2. `GET https://api.github.com/repos/{owner}/{repo}/actions/runs/{run_id}` — Run ID, Attempt, Commit SHA, workflow, status/conclusion and repository identity;
3. `GET https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifact_id}` — Artifact ID, associated Run ID, repository ID, SHA, expiration and API SHA-256 digest;
4. `GET https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` — original binary bytes, via an injected download adapter.

The module accepts `readJson` and `readArtifactBytes` functions and has **no direct network calls, credentials or authentication assertions**. This is deliberate: a malicious caller can fake both adapters and return mutually consistent values. A matching GitHub API digest, ZIP SHA-256 and CRC checks **do not attest the actual origin of caller-provided responses**. `originAuthenticated=false`, `provenanceAttested=false` and `finalQualityJudgement=withheld` are unconditional. Never use `READBACK_CORRELATED_UNATTESTED` as permission to trade or claim market-data truth.

## Fail-closed acceptance
- Exact repository and numeric repository ID must agree across repository, run and artifact.
- Exact Run ID, Attempt, 40-digit Commit SHA, completed/success status and workflow identity are required.
- Artifact ID, associated Run ID/SHA/repository identity and unexpired SHA-256 digest must match.
- ZIP bytes are limited to 100 MiB downloaded, independently hashed by the previously merged archive validator, then fully CRC checked and bounded at 128 MiB per entry/400 MiB aggregate.
- Stage0/1 original JSON must be present for v2 validation; absent originals remain `NOT_EXPORTED` and the result `WITHHELD`. An observed `SKIPPED` or failed Run must be rejected before ZIP acquisition.
- A downstream cross-Run Producer→Consumer handoff is **not authenticated by this contract**, and still requires independent verified edge evidence.
- Request order is inspectable in `requestedEndpoints`; no workflow dispatch, reruns, Drive writes, external AI provider or broker calls.

## Test and deployment boundary
Synthetic test responses (not GitHub credentials) exercise positive metadata identity, wrong repository ID, changed Run ID/Attempt/Commit SHA, skipped/failed/incomplete Run, wrong artifact association, expired/missing digest, ZIP substitution, missing downloads, missing originals and no source promotion. The existing Stage0/1 through Stage6 offline CI runs unchanged.

Future separately approved integration can connect a **trusted, audited GitHub connector invocation** to this adapter and store immutable observation receipts. The transport's security context, token permissions, redirect handling and provenance are not currently certified here. No actual runtime collection, provider invocation, workflow mutation or PAPER/LIVE authorization is part of this PR.

## Stable baseline
- Parent `main` before this STEP: `3b52f66e43d94457da76bccad05db98a275c3a50`
- PR #82 completed with merged GitHub push CI: https://github.com/pungking/US_Alpha_Seeker/actions/runs/43806631489
- Stage6 runtime formula goal remains separately unresolved, and `NOT_EXPORTED` does not become `SKIPPED`.
