# Manual dashboard AI connection restoration

On resume, inspect existing Git state first. Preserve all committed and
uncommitted work; resume only unfinished steps. No execution approval is implied.

## Approved scope

Restore manual Gemini / Sonar access without putting provider credentials in
Vite output. Preserve runtime-injected headless clients, prompts, model order,
ranking, execution HOLD and existing Perplexity session reservations/circuit.
No production deployment, provider generation, broker operation or merge.

## Tasks

- [x] RED: injected-network authentication, validation and privacy fixtures.
- [x] Owner-authenticated server endpoint and credential-free browser transport.
- [x] Connect existing callers and truthful configuration-only status cards.
- [x] GREEN: fixtures, safety regressions, typecheck, build, audit, diff check.
- [x] Independent review and targeted re-review of the deadline correction.
- [ ] Ordinary commit/push, Draft PR and exact-HEAD CI evidence (PR records outcome).

## Deployment requirements (not performed here)

Server-only `DASHBOARD_AI_OWNER_EMAIL` must identify the authorized Drive user;
`GEMINI_API_KEY` (or `API_KEY`) and `PERPLEXITY_API_KEY` stay server-only.
Perplexity additionally requires existing `PERPLEXITY_RUN_MAX_COST_USD` and
`PERPLEXITY_RUN_MAX_REQUESTS`; absent/zero limits disable paid access.
Production POST origin is exactly https://us-alpha-seeker.vercel.app.
Preview cannot send generation POSTs. Drive login authenticates each request
against Google's fixed Drive about endpoint, not a client-supplied identity.
References: https://developers.google.com/workspace/drive/api/reference/rest/v3/about
and https://developers.google.com/workspace/drive/api/reference/rest/v3/User.

Configuration presence is NOT a successful provider authentication test.
Gemini billing/free-tier eligibility is a provider/project property, not proved
by a model name. Perplexity reservations remain per browser session, NOT a
durable cross-session/server-wide spend guarantee. Server validation bounds an
individual request against configured limits; owner authentication is mandatory.
Do not enable this endpoint for multiple users or treat it as a global budget.

The manual gateway accepts only `gemini-2.5-flash` / `gemini-2.5-flash-lite`
and existing Sonar / Sonar Pro. Input is bounded at 1 MiB; Gemini output is
capped at 32,768 tokens, Sonar at 3,200 tokens. Custom models or larger output
settings require separate review; runtime-injected headless requests retain
their existing model/configuration path. No key is invented to bypass guards.

## Local verification evidence (2026-11-16)

- Existing branch resumed clean at `3b52f66e43d94457da76bccad05db98a275c3a50`.
  Main subsequently advanced to `f41cb87ce2a2163ec1c4d952ff3e03fbafd28e7b`
  through PR #83 (four unrelated read-only audit files, no overlapping diff).
  No rebase, source reset or main merge was performed.
- RED: fixture initially rejected the missing server module (exit 1).
- `npm run ops:test:dashboard-ai-connection`: 32 tests, 32 PASS, 0 FAIL.
- `npm run ops:test:perplexity-call-budget`: exit 0, including actual caller
  cancellation/circuit, formatter and headless-policy fixtures.
- All 41 local analysis-safety workflow commands other than install/audit/parity
  passed in a disposable source snapshot; generated reports did not alter the
  working source. Relevant changed-call-path tests were then rerun after fixes.
- `PUPPETEER_SKIP_DOWNLOAD=true npm ci`: exit 0 (normal lifecycle install).
- `node scripts/test-scheduled-installer-parity.mjs`: exit 0; lock unchanged,
  strict/legacy dependency graphs equal; registry bootstrap only, no providers.
- `npm audit --audit-level=high`: exit 0, zero vulnerabilities.
- `npm run typecheck`, `npm run build`, `git diff --check`: exit 0.
  Build retains its existing large-chunk warning; no dependency changes.
- Isolated Chrome loaded the local bundle with all requests intercepted:
  two AI cards CONFIG/UNVERIFIED, one synthetic status GET, zero generation
  POSTs and zero provider requests. This is NOT a production connection test.
- Browser bundle inspection excludes the server-only owner/credential resolver.
- Independent review found an earlier caller deadline could duplicate keyless
  Gemini generation. Server-backed batch/Stage1 calls now use the sole bounded
  transport deadline; an actual synthesis fake-clock fixture proves one request
  and error/hold on uncertain completion. Injected-key behavior is preserved.

Draft PR/exact-HEAD CI evidence is recorded in the PR, not inferred from these
local results. Production environment access/deployment and real provider
authentication remain unverified. The parent PAPER closeout goal is incomplete.

## Root cause

`b1f374530347a532249ddaf9712327013b74fc0f` removed public key inlining
and retained automated-browser runtime injection, without a manual server path.
Do not revert that secret-exposure fix. First affected production deployment
and historical actor attribution remain unverified.
