# Dashboard API Configuration And Feedback Repair

On resume, inspect Git branch, HEAD, remote, porcelain status, existing PRs,
test evidence and in-flight work first. Preserve all work and resume only unfinished tasks.

## Verified baseline

- PR #89 merged as `2860a9dba3c8f75a80f81bd4e143e26aebb31086`.
- Production alias serves that SHA; post-merge CI 43848348620 passed both jobs.
- User screenshot reports Perplexity RESPONSE VERIFIED and Drive OWNER VERIFIED.
  Preserve this as user-reported evidence, not a Codex-executed probe.
- Codex's one-shot evidence still records zero attempts. Do not repeat Sonar merely
  to replace the user's successful observation. No paid retry/reset or full analysis.
- Production variable-name inventory contains GEMINI_API_KEY, API_KEY,
  VITE_GEMINI_API_KEY and PERPLEXITY_API_KEY. Values were not revealed.
- Seven acquisition-provider variables are absent from that inventory. Their
  original keys cannot be invented or recovered by reading GitHub Secret names.

## Demonstrated code paths to verify with RED tests

1. Credential validation rejects outer CR/LF before trimming and validates the
   Gemini primary/fallback expression only after selecting a truthy primary.
   A blank/invalid primary can therefore mask a usable fallback. Whether the
   deployed secret has this format is UNVERIFIED until safe runtime readback.
2. The status formatter returns missing configuration before showing a failed
   probe's result. Refresh can complete with unchanged settings and no durable
   feedback. Native confirm cancellation/suppression also silently returns.

## Minimal implementation

- [x] RED: outer whitespace, invalid-primary/valid-fallback, internal CR/LF denial,
  missing-setting probe feedback, no-request confirmation/cancellation.
- [x] Trim credential boundaries, reject internal CR/LF, select validated Gemini
  primary/fallback consistently for configuration and actual requests.
- [x] Show expected server variable names and local blocked-test feedback; never
  translate an absent setting into a fictional provider HTTP response.
- [x] Replace native browser confirm with explicit in-page confirmation; keep
  one-request lock, 16-token caps, budget/circuit, owner auth and no-auto-probe.
- [x] Show manual refresh completion/error and explicit probe outcome in an
  accessible status region; do not let periodic refresh overwrite that outcome.
- [x] Run focused and existing offline fixtures, typecheck/build/security audit
  and independent scoped review.
- [ ] Ordinary branch/PR and exact-HEAD CI; record immutable evidence on the PR.

## Verification evidence

- New Node fixtures: baseline 27 PASS / 4 FAIL; repaired 31 PASS / 0 FAIL.
- Original dashboard auth/transport fixtures: 32 PASS / 0 FAIL.
- Offline browser: PASS, 11 cards, explicit in-page confirmation, cancellation
  sends zero requests, immediate duplicate confirmation suppressed, missing
  settings and manual-refresh outcomes visible; synthetic proxy and SDK runtime
  replies only, with all external requests intercepted.
- Review found success feedback surviving a final-refresh build change and then
  runtime/direct-key feedback being incorrectly invalidated. Both were reproduced
  RED in the browser fixture, fixed, GREEN and re-reviewed without residual findings.
- Typecheck/build, Perplexity budget/circuit fixture, secret and analysis-boundary
  audits, npm audit high (zero vulnerabilities), git diff --check: exit 0.
- Lockfile, constants, Vite secret-exposure policy, Workflow definitions, Stage
  and goal contracts are unchanged. Final exact-HEAD CI remains required.

## Approved credential follow-up

The user supplied the existing repository directory as the source. A name-only
inventory of its owner-only `.env` found candidates for all seven providers.
The user separately approved six non-broker Production Secrets, Gemini-only
source reading/repair, and release after review/CI. Alpaca remains presence-only;
no key transfer or broker request. This is NOT approval for six live provider
pings, an additional Sonar call, or account-wide budget/reset changes.
The existing Vercel environment API returned 403, and the minimized GUI could
not initially be restored; never bypass that denial or report registration done
without actual readback. Registration and the Gemini one-shot remain unfinished.

## Runtime and authority boundary

No key values in logs, screenshots, Git, or evidence. No env pull, key generation,
GitHub Secret extraction, broker/data-provider calls or operational state changes.
Missing-provider key installation needs a user-approved source; requested while
the code repair proceeds. Do not put VITE_* credentials back in browser bundles.
No new framework/dependency, Stage policy, Workflow trigger or execution change.
The PAPER parent stays unfinished and HOLD. Settings presence is not response proof.
Any actual new AI probe remains within the original one-each authorization and
durable attempt record, with no retry after a sent/unknown attempt.

## Residual pre-existing issue

`api/msn.ts` contains an existing hard-coded authentication-like string. Its status
as an anonymous public vendor token versus a private credential is UNVERIFIED.
Do not reproduce its value or modify this separate integration in this repair.
