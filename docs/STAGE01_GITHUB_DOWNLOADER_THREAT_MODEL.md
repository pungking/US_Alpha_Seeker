# STEP #AS-INTEGRATION-57 — Real downloader predeployment security threat model and approval gates

## Baseline, scope and strict boundary

Verified analysis-repository main `94b15bbb56027e707f3eabfc65a69fafd2bb19f0`, post-PR #86 main CI [43818483488](https://github.com/pungking/US_Alpha_Seeker/actions/runs/43818483488) passed. No real network or ZIP retrieval is authorized. These functions are **pure synthetic observation checks**; they do not open sockets, resolve DNS, negotiate TLS, read credentials, or prove authenticated provenance. The caller can forge ALL observation fields, including `independentAttemptProof=true`. A `DESIGN_CONTRACT_READY_UNATTESTED` decision is ONLY structural test readiness, never permission to deploy or elevate Stage quality. `actualDownloaderApproval=HOLD` is unconditional.

## Threat model

| Boundary | Threat | Control to require before real integration |
|---|---|---|
| API caller | broad-scoped token, SSRF, credential persisted or logged | read-only `actions:read`, constrained GitHub API hostname and GET paths, process-isolated ephemeral credential, secret redaction, token revocation |
| 302 redirect | open redirect to untrusted host, signed URL exfiltration, chained redirect | fixed **externally approved** exact storage-host inventory, no arbitrary Location following, canonical HTTPS URL, no signed query in logs |
| DNS and transport | rebinding, split horizon, localhost/metadata/internal IP, CNAME surprise | trusted resolver, validate every address before connect, pin actual socket peer, reject private/non-public addresses; separate IPv6 policy; no proxy tunneling without review |
| TLS | hostname forgery, certificate trust bypass, wrong SNI, interception | full PKIX chain/hostname validation with `rejectUnauthorized=true`; verify actual peer identity, no silent proxy, no TLS fallback |
| storage GET | GitHub bearer token forwarded through redirect, custom-header smuggling | distinct credential-free GET with reviewed `accept` only; no Authorization, Cookie, proxy auth or token aliases |
| artifact origin | Run ID and Commit equal but wrong workflow Attempt | bind repo ID/name, Run ID/Attempt, SHA, Workflow, Artifact ID, producer identity using **attempt-specific independent evidence**; if GitHub API does not expose sufficient linkage, WITHHOLD |
| ZIP integrity | partial transfer, byte substitution, ZIP bomb, misleading Content-Length | streaming byte limit/timeout, independent Artifact SHA-256, ZIP CRC/entry limits and Stage0/1 source evidence; missing or SKIPPED means withheld |
| audit receipt | laundering caller assertions into trusted proof | cryptographically protected immutable receipts from controlled transport and independent verification; do not store credentials or signed URL; keep `originAuthenticated=false` until independently established |

## Offline contract checks

`services/stage01GitHubDownloaderPreflight.mjs` checks supplied observations for an exact approved storage host; API host/method and `actions:read`; no credential propagation; one public IPv4 DNS A response without CNAME and matching observed peer; TLS SNI/hostname/chain/rejectUnauthorized and matching peer; completed successful GitHub Run identity plus claimed independent attempt-specific artifact evidence; ZIP SHA-256 receipt bound to Artifact metadata without upgrading trust.

This **intentionally conservative IPv4-only fixture** is NOT a tested full IP classification algorithm or adequate live SSRF defense. Production requirements include comprehensive special-use IP inventories and all address families. A supplied `dnsObservation` or `tlsObservation` is not independently attested. `independentAttemptProof` is merely a synthetic shape placeholder and does not constitute real Attempt provenance. Independently authenticated attempt evidence is currently unavailable and must be treated as a separate blocker.

Both a passing and failing synthetic check retain `actualDownloaderApproval=HOLD`, `originAuthenticated=false`, `tlsAuthenticated=false`, `provenanceAttested=false`, `attemptProven=false`, `finalQualityJudgement=withheld`, `networkRequests=0`.

## Formal approval gates before implementation

1. **Architecture approval:** choose exact repository owner, approved GitHub auth mechanism, storage service destination host policy and immutable offline test snapshots. No wildcard host approval.
2. **Credential and network review:** minimal GitHub Actions **read** permissions, no redirect token forwarding, IP/IPv6/DNS/proxy/PKIX controls, TLS validation and strict HTTP GET endpoints. Conduct external independent human security review.
3. **Attempt-origin proof:** demonstrate artifact-to-exact-Run-Attempt association from trusted independent evidence, not only `artifact.workflow_run` fields or caller boolean. Fail closed if ambiguous.
4. **Integrity and data-quality review:** independent binary digest, ZIP parser safety, Stage0/1 source PIT, `NOT_EXPORTED`, `SKIPPED`, cross-Run and Stage3–6 original-byte regression tests; never confuse successful CI with actual quality or provenance.
5. **Deployment approval:** isolated branch and Draft PR, natural Linux/macOS CI, independent code review, explicit separate user merge approval, new main CI, then a **further** distinct approval to enable real authenticated network reads. PAPER/LIVE and provider/Drive/writer changes remain HOLD.

## Failure containment and recovery

Fail closed on disallowed IP/host, TLS error, leaked credential, attempt mismatch, ZIP byte/hash mismatch, timeouts or absent evidence. Preserve non-secret error code, Run/Attempt SHA and raw-byte hash, isolate affected receiver, default the future downloader OFF, and seek user-approved minimal fix or revert. Never bypass security checks, trigger/rerun a Workflow, mutate provider/Drive state or place a trade as a recovery tactic.

The existing Draft PR #84 and #80/#74/#73/#58 remain outside this change; Workflow/Ruleset/Admission unchanged. `docs/AI_DEVELOPMENT_CONTINUITY.md` and `docs/DEVELOPMENT_HANDOFF.md` returned 404 on the verified main; `AGENTS.md` and `goal/goal.yaml` were read. Existing Stage3–6 artifact-missing warning and Stage6 runtime-formula goal failure remain open.
