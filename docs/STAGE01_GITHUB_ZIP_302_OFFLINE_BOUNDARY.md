# STEP #AS-INTEGRATION-52 — GitHub ZIP HTTP 302 offline downloader contract

## Authority and scope
This new module is **only an offline validation boundary for caller-supplied observations**. It does not execute HTTP, follow redirects, query DNS, check TLS certificates, read credentials or attest the real source of an artifact. All of `originAuthenticated`, `tlsAuthenticated`, `provenanceAttested` remain `false`, and `finalQualityJudgement=withheld`. Use no results for real Stage0/1 quality promotion, workflow dispatch or trading.

The existing GitHub API JSON → artifact ZIP evidence reader and Stage0/1 audit remain separate and unchanged. GitHub Actions official [Download an artifact](https://docs.github.com/en/rest/actions/artifacts?apiVersion=2022-11-28#download-an-artifact) specifies HTTP 302 and a temporary URL; this does not authorize blindly following its Location.

## Caller-injected strict observation protocol
1. An authenticated transport to be approved in a future step would request the **exact** `GET https://api.github.com/repos/{owner}/{repo}/actions/artifacts/{id}/zip` using credentials ONLY on `api.github.com`. Here, the caller supplies an *untrusted* `redirect` observation indicating HTTP 302 with an opaque Location.
2. `approvedStorageHosts` must be fixed by independently reviewed policy, **never learned from the redirect**. Exact lower-case DNS host matching is required; no wildcard, IP literal, local hostname, unapproved host, userinfo, fragment, alternate port, HTTP, whitespace or backslash. This is an offline URL parser check, **not real DNS/TLS/SSRF protection**.
3. `storage` must show a **single GET** for the signed URL, unchanged final URL, 200 success, no additional redirect, no timeout, no truncation; recorded request headers must not include Authorization, Cookie, Proxy-Authorization or X-API-Key. **Do not forward GitHub tokens to signed storage hosts**.
4. An independently pinned artifact digest `sha256:<64 lowercase hex>` must match the observed ZIP bytes; 22–104,857,600 bytes inclusive, required binary body, limited media type, optional content-length equality. Signature URL query bytes, request/response headers, cookies and token values are excluded from sanitized receipts.
5. Observations expire after 60 seconds against the caller-supplied observation time, with monotonicity checked. A future real downloader must enforce a trusted monotonic clock and the storage URL's actual validity; the caller-supplied timestamps and signed URL are **not trusted expiry evidence**.
6. Receipt includes only the API coordinates, storage hostname (without path/query), byte count and raw SHA-256. The receiver must independently inspect ZIP structure/CRC and the Stage0/1 contract and treat missing originals as `NOT_EXPORTED`.

## Negative tests
Offline fixtures reject forged/unapproved storage hosts, HTTP, userinfo, alternate ports, fragments, CRLF, empty query, URL drift, storage double redirects, stale and reversed observation times, API 200/partial responses instead of 302, storage 206/302, truncated/timeout, leaked Authorization/Cookie/Proxy-Authorization, missing body, over-limit ZIP, bad content length/media type, replaced ZIP or mismatched artifact digest. An opaque signed token is never emitted into the receipt.

## Non-goals and next approval
This does not implement a downloader, authenticate TLS or assert exact artifact-producing Run Attempt. Actual HTTPS peer identity, DNS rebinding protection, approved storage host inventory, signed URL lifetime, HTTP authorization separation, streaming decompression limits, retry policy and immutable receipt custody require **independent approval and isolation** before any real connection. No workflow, Ruleset, Admission, external provider, Drive, dispatch/rerun, PAPER/LIVE, accounts or orders may be changed.

Baseline `main`: `d72fbf2034e411b9fe5b9d0f0fc05002da7d32c6`, PR #85 merged with natural CI run https://github.com/pungking/US_Alpha_Seeker/actions/runs/43815200629. Existing Stage3–6 artifact availability warning and Stage6 runtime formula goal failure are unchanged.

## Recovery
On future host, TLS, ZIP digest or lineage mismatch: fail closed, log non-secret reason and raw-byte hashes, preserve original state, disable the future downloader (default OFF) and seek separate authorization for a minimal fix/revert. Never rerun workflows or enable PAPER/LIVE to make tests pass.
