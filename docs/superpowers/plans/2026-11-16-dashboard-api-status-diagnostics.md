# Gemini / Perplexity repair and truthful dashboard diagnostics

On resume, inspect existing Git state first. Preserve all committed and
uncommitted work; continue only unfinished tasks. Do not repeat completed
deployment mutations, probes or approvals.

## Requested goal

`DASHBOARD_GEMINI_PERPLEXITY_CONNECTION_AND_STATUS_REPAIR_V1`.
The goal tool rejected creating this goal because the unfinished PAPER parent
still occupies the goal slot. Do not mark that parent complete to clear it.
This document preserves the requested objective and its verifiable criteria.

## Verified incident evidence

PR #84 source `2e4130c53598bcaa52768d01dadd5d3625a51a4c` was merged as
`13c1fa9e47c5176227b7d9be3772f0e5a0afe04a`; production deployment
`dpl_GDr4FCKWRhDWsBci1E1JuwzTWALb` was READY and verified on the alias.
At the new failure report, the alias instead pointed to a new deployment
`dpl_ajBLkEbhPJntxnvnHuFSxV5zXa8Y` of OLD source
`c411f1bdd2fb3f2c0b97aee480ebbf7b73a682e3`. The new API returned 404.
Who/why caused that transition is unverified; do not blame browser caching or
the user without evidence. Promoting the already reviewed correct deployment
restored the route to 401/DRIVE_LOGIN_REQUIRED without rebuilding or changing keys.

The existing client also masks all auth/network/server failures as empty
configuration, and callers misleadingly report API_KEY_MISSING. This is a
demonstrated defect independent of the wrong-deployment incident.

## Minimal design

Keep owner-only server credentials and existing headless runtime injection.
Preserve safe error codes/HTTP provenance across the server/client boundary;
never relay upstream messages, credentials, prompts or arbitrary error fields.
Return authenticated configuration booleans for every existing card, not keys.
Separate settings presence, login state and last REAL provider observation.
Each card has explicit reason, last check and manual settings refresh. Only
AI cards offer an explicit, cost-labelled, one-request connection probe; no
automatic paid ping, full analysis, Drive write or broker call. Other providers
remain honestly NOT TESTED unless actual evidence exists; no synthetic 200/401.
Gemini probes use <=16 output tokens; Sonar uses the existing session reservation
and circuit guard. Do not clear budget history or broaden models/policies.

## Tasks

- [x] RED: auth/404/network/provider errors, all-card configuration and bounded probes.
- [x] Server safe metadata/errors and client diagnostics; fix misleading callers.
- [x] Functional status cards, refresh and explicitly confirmed AI-only probes.
- [x] Offline regression tests and independent technical review; auth/build races covered.
- [ ] Exact-HEAD Draft PR CI; publish the immutable run and commit in the PR evidence.
- [ ] Runtime verification within a separately approved one-request-per-AI scope.

## Offline verification evidence

- `node scripts/test-dashboard-api-status.mjs`: 27/27; synthetic requests only.
- `node scripts/test-dashboard-ai-connection.mjs`: 32/32; original auth/budget contracts retained.
- `npm run ops:test:perplexity-call-budget`: exit 0; reservations/circuit preserved.
- `npm run typecheck`, `npm run build`: exit 0.
- `npm run ops:safety:analysis-boundary`, `npm run ops:safety:client-secret-exposure`: exit 0, no findings.
- `npm audit --audit-level=high`: exit 0, zero vulnerabilities; lock unchanged.
- Offline Chrome fixture: 11 cards, explicit synthetic replies, no automatic provider call,
  duplicate-click suppression, token/build-change invalidation, delayed settings and probe
  rejection, missing route visibility, desktop/mobile viewport; all external requests intercepted.
  These results are NOT real provider or production/browser-session proof.
- Disposable regression snapshot: 43 CI commands exited 0 before the final review fixes.
  Exact-HEAD PR CI must validate the final changes; do not substitute the earlier snapshot.
- Independent reviewer identified three P2 diagnostics/race defects. All three were fixed;
  scoped re-review reported no residual findings. Main implementer ran the expanded UI fixture.
- Existing test fixtures gained explicit `gemini: false` where they model Sonar-only
  configuration; partial HTTP-200 responses now fail closed rather than imply missing keys.

Transient development fixture failures are preserved separately from final passing output.
Held browser requests use interception-entry signals, not a request-event wait that stalls
behind a held interception. No test is reported as a real provider response.

## Remaining release boundary

The already approved PR #84 deployment was restored. This new diagnostics change is
separate: publish a Draft PR and exact-HEAD CI, then obtain release authorization.
Actual generation remains unexecuted pending the explicit, bounded probe approval.
No owner token, provider key, raw vendor response or account identity belongs in PR evidence.

## Done when

Production alias and served source agree; actual owner authentication is
verified; each AI has a successful bounded real response if approved; all cards
distinguish config/not-tested from real outcomes, with no hidden auth errors.
Do not call configuration/fixture results provider verification. If a real
probe is not approved or fails, preserve the result and leave this goal unfinished.
Current $5/20 request budget remains PER BROWSER SESSION, not a global ceiling.
PAPER/LIVE, order/state controls and analysis Stage contracts remain unchanged.
