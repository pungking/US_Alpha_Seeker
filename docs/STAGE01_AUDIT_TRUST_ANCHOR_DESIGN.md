# STEP AS-INTEGRATION-38 — Stage0/1 trusted provenance anchor design (HOLD)

## Scope and non-claims
This is a design record, not an execution authorization. The offline Receipt API accepts **caller-supplied** Run, Attempt, Commit SHA and source-byte hash claims. Equality between those claims cannot authenticate their origin. Neither `CONSISTENT_UNATTESTED` nor `V2_VALIDATED_UNATTESTED` proves GitHub provenance, market-data freshness or investment quality. The final-quality verdict remains `withheld`.

The current compound validator invokes the existing `validateStage0ArtifactForStage1` and `validateStage1ArtifactForStage2` over **parsed original JSON bytes**, preserving both v2 schemas and downstream filters. A v2-invalid artifact must never be described as validated on the strength of its receipt alone.

## Required independent trust anchor (future work)
For every independently observed producer or consumer artifact, create an evidence record **outside the artifact being authenticated** with:
- Immutable repository identity, workflow identifier, GitHub Run ID, Attempt, event type, commit SHA and verified branch/ref;
- GitHub API observation time, API URL, completed-job identity and outcome, and the independently retrieved artifact ID/name;
- Exact downloaded ZIP SHA-256 plus exact *inner original JSON bytes* SHA-256, file name and byte length;
- Stage0/Stage1 producer v2 `manifest.runId`, schema version, timestamp, deterministic input/output hashes, and validation diagnostics;
- Source-of-trust label for every field. A caller-created object, a field in the artifact itself, or a bare `trusted: true` flag is **not** a trust anchor.

An immutable archive hash, download URL or GitHub API field should be marked `UNKNOWN` when unavailable. GitHub metadata consistency does not cryptographically establish that an uploaded financial fact is true; supplier/source PIT remains a separate gate.

## Same-Run vs cross-Run boundary
- Same-Run: all stage origins must match an independently verified Run/Attempt/Commit anchor; source original SHA must match the downloaded bytes; each v2 contract must pass.
- Cross-Run: two separately authenticated Run/Attempt/Commit and original-file anchors are necessary. Additionally require a separate observed handoff edge binding the Stage0 byte SHA, producer `manifest.runId`, Stage1 consumer input and its `decisionAt`. A matching filename or caller-declared producer run is **insufficient**.
- The existing PoC only accepts **claimed** identical Run coordinates for its self-consistency predicate. It intentionally withholds all cross-Run claims. Do not weaken that hold before independent provenance and handoff-edge verification are implemented.

## Fail-closed acceptance matrix
| Case | Required receipt / quality result |
| --- | --- |
| Self-consistent, v2-invalid synthetic fixture | WITHHELD / withheld |
| Self-consistent, both full v2 valid but no authenticated external anchor | V2_VALIDATED_UNATTESTED / withheld |
| Forged Run, Attempt, Commit SHA or matching `trusted: true` claim | No authenticated PASS |
| Source JSON bytes changed after claimed SHA | WITHHELD |
| Stage1 original SHA points to different Stage0 bytes | WITHHELD |
| PIT after decision, invalid timezone or Stage0 generated after Stage1 decision | WITHHELD |
| Cross-Run lacking independently verified handoff edge | WITHHELD |
| MISSING, SKIPPED or NOT_EXPORTED original JSON | WITHHELD |
| Fully verified source AND explicit handoff AND both v2 valid | **Future acceptance test only**; not implemented or approved |

## Regression and safety invariants
- Never mutate Stage0/1 v2 manifests, filtering, Stage2–6 scoring or broker state.
- Do not accept synthetic test passing as live/market-quality proof.
- Existing Stage0/1 and Stage2–6 negative fixtures must remain green.
- Prohibited: workflow/ruleset/Admission changes, dispatch/rerun, new Provider/Drive calls and any PAPER/LIVE activity without distinct approval.
- Do not merge Draft PR #81 without separate owner authorization and independent human review requirements.
