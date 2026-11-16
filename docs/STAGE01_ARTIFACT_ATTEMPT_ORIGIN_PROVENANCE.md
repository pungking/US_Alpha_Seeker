# AS-INTEGRATION-61 — Artifact producer Run Attempt provenance: REST-only limits and approval plan

Baseline main: `c411f1bdd2fb3f2c0b97aee480ebbf7b73a682e3` (PR #87 merged, natural main push CI #43823841886 succeeded). This analysis is read-only except for an isolated Draft PR containing **offline test contracts only**. No Workflow, Ruleset, Admission, dispatch/rerun, real ZIP download, provider/Drive or PAPER/LIVE is authorized.

## Independently verifiable API field coverage

| Source | What API can show | What API alone cannot show |
|---|---|---|
| `GET /repos/{owner}/{repo}/actions/runs/{runId}` | Run ID, `run_attempt` (current attempt), Workflow ID/path, commit SHA, run state/conclusion | The attempt in which a particular archive was uploaded |
| `GET /repos/{owner}/{repo}/actions/runs/{runId}/attempts/{attempt}` | Historical attempt identity and SHA | Artifact ID uploaded from that attempt |
| `GET /repos/{owner}/{repo}/actions/runs/{runId}/attempts/{attempt}/jobs` | Jobs and start/end timestamps for that attempt | Authenticated per-artifact uploader Job/Attempt mapping |
| `GET /repos/{owner}/{repo}/actions/artifacts/{artifactId}` | Artifact ID, Run ID, repository ID, head SHA, SHA-256, created_at, expiry | An explicit producing `run_attempt` field |
| `GET /repos/{owner}/{repo}/actions/runs/{runId}/artifacts` | Artifact association to Run (not attempt), artifacts may persist across reruns | Independent signed proof of the producing attempt |

**Critical rule:** A metadata correlation such as same Run ID and SHA, artifact created_at within an attempt window, matching job timestamps, or a caller-supplied `independentAttemptProof=true` is *not* proof that the artifact was emitted by that exact attempt. Treat all such checks as `RUN_CORRELATED`, never `ATTEMPT_PROVEN`. Artifacts can originate from a previous attempt of the same Run; current run_attempt cannot be substituted for producer attempt.

## Observed read-only example (not runtime provenance attestation)

Real GitHub main push Run **43823841886** and Attempt **1**:
- `main` SHA: `c411f1bdd2fb3f2c0b97aee480ebbf7b73a682e3`.
- Workflow ID **289086216**, path `.github/workflows/analysis-safety-ci.yml`, Run status `completed/success`.
- Repo ID **1139620490**, Artifact **14205447992** (`analysis-safety-reports`), `created_at=2026-11-16T07:27:38Z`, `expired=false`.
- Artifact metadata digest `sha256:2212c394bf69f226b9572f9e2cf1e4d4f190c2120ea61dda31855911ff299668`, with matching Run ID/commit/repository.
- Attempt Jobs IDs **133152858730** (macOS), **133152858928** (Linux). These are metadata observations, not authenticated proof of which job uploaded Artifact **14205447992**.
- No ZIP bytes were downloaded or authenticated; the Artifact digest was not rehashed from physical bytes during this review.
- **Verdict:** Run correlation observed, exact producer Attempt **UNPROVEN**. Even though the current Run reports Attempt 1, the artifact's explicit originating attempt is not provided by the Artifact metadata.

## Candidate approaches and priority

1. **Recommended future design: cryptographically signed provenance** covering the **exact subject bytes/digest**, provenance repository/workflow/commit and independently authenticated `run_id` + `run_attempt` claims. GitHub OIDC documents `run_attempt`, and GitHub Artifact Attestations supports signed build provenance. A security review must verify that the particular attestation format used exposes and cryptographically binds **all required fields**, and that the attested subject is the same archive or manifest whose hash is read, not merely an unrelated file within the ZIP. A boolean/synthetic claim or unverified manifest is insufficient.
2. **Future diagnostic supporting evidence:** attempt-scoped jobs and immutable uploader step logs/recorded Artifact ID + digest, plus timestamp cross-checks. This narrows candidates but does not by itself establish independently authenticated creation origin.
3. **Fallback:** without a cryptographically verified attempt-specific attestation (or equally strong independently authenticated attempt-specific evidence), keep the producer Attempt `UNPROVEN`, block provenance and quality promotion, leave real downloader **HOLD**.

GitHub OIDC and attestation changes would require future isolated Workflow/permissions changes and separate authorization. No such changes are made here. Check GitHub plan/repository eligibility and verify exact attestation field coverage before proposing an implementation; GitHub documentation does not by itself establish that an Actions Artifact ZIP automatically carries signed attempt provenance.

## Offline contract and failure handling

`services/stage01GitHubArtifactAttemptOriginOffline.mjs` checks strictly supplied repository/Run/Attempt/Job/Artifact metadata, SHA-256 format, timestamp consistency and known failures. It **always** returns `producingAttempt=UNPROVEN`, `originAuthenticated=false`, `provenanceAttested=false`, `actualDownloaderApproval=HOLD`, `finalQualityJudgement=withheld`, `networkRequests=0`. Positive tests assert no trust elevation; negative tests include mismatched attempts, Run, SHA, Workflow, Repository, expired artifact, malformed digest, bad timestamps, absent jobs, and forged self-proclaimed proof.

A future attestation verifier must fail closed on missing/expired/unverifiable signatures, certificate identity, incompatible key/issuer trust, absent `run_attempt`, SHA mismatch, cross-run and cross-attempt substitutions, stale/replay evidence, and ambiguity; preserve non-secret audit receipts. No claim of true provenance based on this Draft PR.

## Official source documentation

- [GitHub REST — Artifacts](https://docs.github.com/en/rest/actions/artifacts)
- [GitHub REST — Workflow Run Attempts](https://docs.github.com/en/rest/actions/workflow-runs)
- [GitHub REST — Jobs per Attempt](https://docs.github.com/en/rest/actions/workflow-jobs)
- [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc)
- [GitHub Artifact Attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [Build provenance attestation setup](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

The existing `Stage3–6 warn_artifacts_missing` and `Stage6 fail_stage6_runtime_formula_goal` are unrelated unresolved readiness blockers and remain unchanged.
