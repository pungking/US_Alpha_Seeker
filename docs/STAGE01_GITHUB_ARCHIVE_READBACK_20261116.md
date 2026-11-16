# STEP #AS-INTEGRATION-42 — GitHub Actions ZIP readback acceptance (offline, no trust promotion)

## Source observations (read-only, 2026-11-16)
The metadata below was read from the GitHub REST API separately from ZIP bytes. No workflow dispatch, rerun, Drive access or provider calls were made by this step.

| Property | Analysis | Harvester |
|---|---|---|
| repository | `pungking/US_Alpha_Seeker` | `pungking/US_Alpha_Seeker_Harvester` |
| run ID | `43470901390` | `43471709692` |
| run attempt | `1` | `1` |
| Run SHA | `77c40cb70d65197466e8382cde1c6f71690bbc6a` | `debd60303a7038409ee1339f730646bb50694ebe` |
| workflow | `.github/workflows/schedule.yml` | `.github/workflows/main.yml` |
| event | schedule | repository_dispatch |
| Artifact ID | `14062682867` | `14063466102` |
| Artifact name | `automation-evidence` | `harvester-state-43471709692` |
| ZIP SHA-256 (API digest and downloaded bytes) | `748fd3caed671225a3209f3ff4e2c7c890a5afcff137390630ef8ed53abbb11c` | `9928269a384d1a448c91c70e7d87b66e7ccda0f198260b19b94529a4c` |
| ZIP entry count, CRC | 69, PASS | 9, PASS |
| Stage0 original JSON | NOT_EXPORTED | NOT_EXPORTED |
| Stage1 original JSON | NOT_EXPORTED | NOT_EXPORTED |

Source URLs:
- https://api.github.com/repos/pungking/US_Alpha_Seeker/actions/runs/43470901390
- https://api.github.com/repos/pungking/US_Alpha_Seeker/actions/runs/43470901390/artifacts
- https://api.github.com/repos/pungking/US_Alpha_Seeker_Harvester/actions/runs/43471709692
- https://api.github.com/repos/pungking/US_Alpha_Seeker_Harvester/actions/runs/43471709692/artifacts

## Pre-merge real preserved-artifact replay (read-only, 2026-11-16)

The two ZIPs were downloaded from the matching GitHub Actions Artifact IDs and inspected independently in an isolated local Python `zipfile` replay. This replay reads all entries, checks all CRC-32, ZIP filenames and local-header names/methods/flags, and compares exact ZIP-byte SHA-256 against independent GitHub REST Artifact API `digest`. **It does not claim that the JavaScript production module was executed against these two files**, and does not authenticate self-supplied API JSON in the Node function.

| Check | US_Alpha_Seeker | Harvester |
|---|---:|---:|
| Artifact ZIP bytes | 57,533,946 | 4,465,578 |
| API SHA-256 equals locally downloaded ZIP | PASS | PASS |
| ZIP entries | 69 | 9 |
| CRC of every entry | PASS | PASS |
| Total uncompressed original bytes | 386,407,895 (368.507 MiB) | 28,218,470 (26.911 MiB) |
| Maximum individual entry bytes | 62,372,832 | 28,176,486 |
| Local header name/method/flags parity | PASS | PASS |
| Single 128 MiB cap | PASS | PASS |
| Aggregate original 256 MiB cap | **FAIL** | PASS |
| New aggregate 400 MiB cap | PASS | PASS |
| Stage0/1 original JSON archive entries | NOT_EXPORTED | NOT_EXPORTED |

The historical analysis ZIP exceeds 256 MiB because its 69 entries decompress to 386,407,895 bytes; the initial 256 MiB cap was a **compatibility blocker**. This PR lifts only the bounded aggregate ceiling to 400 MiB (419,430,400 bytes). The 128 MiB per-entry cap, original JSON v2 validators, full-entry CRC checks, parser fail-closed semantics and all execution HOLD remain unchanged. A synthetic 5-entry aggregate declaration of 550 MiB must be rejected as `ZIP_TOTAL_TOO_LARGE`.

These are historical **archive compatibility** and metadata consistency observations only, not real Stage0/1 execution or finance-data proof. Both originals remain `NOT_EXPORTED` and both audit results must remain `WITHHELD`.

## Security / certification boundary
`auditGitHubArchiveReadback` accepts GitHub API JSON and downloaded ZIP bytes from a **caller**. It verifies structural consistency, ZIP bytes SHA-256 against API-reported artifact digest, central-directory entries, relevant original JSON CRC-32 and full Stage0/1 v2 validators if both originals exist. The module has no network access and **does not itself authenticate the origin of the inputs**. A fabricated API response plus a fabricated matching ZIP is therefore *not proof of GitHub provenance*; `provenanceAttested` is always `false` and quality is always `withheld`.

A real API readback from an authenticated GitHub connector and an independently downloaded ZIP may be audited externally; no assumptions about provenance must be carried to unrelated artifacts. In particular, GitHub reporting a successful scheduler run is not equivalent to a successful Stage0/1 extraction.

When Stage0/1 original JSON entries are not in the artifact, set `NOT_EXPORTED`. Do not claim `SKIPPED`, v2 PASS, complete audit provenance, fresh source data or trading permission. `SKIPPED` is a separately evidenced execution status and must never be inferred from missing archive entries.

## Test boundary
Synthetic ZIP fixtures cover: a valid ZIP with missing Stage0/1, corrupted archive digest, tampered bytes, incorrect Run ID and Commit SHA, repository mismatch, expired artifact, non-success/partial/skipped run, malformed Stage0/1 manifests, Stage0→1 PIT inversion, invalid CRC, traversal names and ambiguous original files. Existing Stage0/1 v2 positive and negative fixture suites and Stage2–6 CI remain unchanged. No provider, broker or Drive calls.

## Future work, separate approval
Only a separately reviewed reader can bind the authenticated GitHub API response and actual downloaded ZIP bytes to this offline validator and an explicit trusted Producer→Consumer handoff edge. Even then, data-quality certification and PAPER/LIVE gates remain independent. Workflow/Ruleset/Admission and existing stage artifact export retention are HOLD; don't modify them to manufacture missing originals.

Original GitHub status and SHA readback must be refreshed at acceptance time; the values in this document are historical observations, not live credentials or a permanently trusted anchor.
