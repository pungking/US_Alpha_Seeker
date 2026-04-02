# Sentry SDK Integration Plan (File-Level) - 2026-04-02

Goal: connect real runtime errors (web + Vercel API) into Sentry so MCP can inspect incidents with production context.

Progress Status:
- [x] Phase A implementation (client init + core API capture)
- [x] API rollout expansion (`/api/msn`, `/api/nasdaq`, `/api/perplexity`, `/api/portal_indices`, `/api/sec`, `/api/yahoo`)
- [ ] Phase B (release/sourcemap quality)
- [ ] Phase C (Notion incident linkage automation)

Scope:
- Web app (Vite + React): uncaught errors, render errors, optional tracing/replay.
- API routes (`/api/*.ts`): handler exceptions and upstream failures.
- Keep current ops flow stable (no trade-plane behavior change).

---

## 0) Prerequisites (Secrets/Env)

Add env vars:
- `VITE_SENTRY_DSN` (frontend)
- `SENTRY_DSN` (server/API)
- Optional:
  - `SENTRY_ENVIRONMENT` (e.g., `production`, `preview`, `local`)
  - `SENTRY_RELEASE` (e.g., commit SHA)
  - `SENTRY_TRACES_SAMPLE_RATE` (default `0.05`)
  - `SENTRY_REPLAY_SAMPLE_RATE` (default `0`)
  - `SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE` (default `1`)

Where to set:
- Local `.env`
- Vercel Project Environment Variables
- (optional) GitHub Actions secrets/vars for release metadata

---

## 1) Dependencies

File: `package.json`

Add:
- `@sentry/react`
- `@sentry/node`
- (optional build upload) `@sentry/vite-plugin`

Acceptance:
- `npm install` succeeds
- app builds without type/runtime regression

---

## 2) Frontend Sentry bootstrap

New file: `services/sentryClient.ts`

Responsibilities:
- `initSentryClient()` with DSN from `import.meta.env.VITE_SENTRY_DSN`
- set `environment`, `release`, trace/replay sample rates
- safe no-op when DSN missing

File: `index.tsx`

Changes:
- call `initSentryClient()` before `ReactDOM.createRoot(...)`

Acceptance:
- no console breakage when DSN missing
- source still renders normally

---

## 3) React error boundary wiring

File: `components/RenderGuard.tsx`
or New file: `components/SentryErrorBoundary.tsx`

Changes:
- capture boundary-level errors via `Sentry.captureException`
- keep existing UI fallback behavior

File: `App.tsx` or `index.tsx`

Changes:
- wrap root/app with error boundary (without changing current UX flow)

Acceptance:
- forced render error is captured in Sentry issue stream
- existing fallback panel still shown

---

## 4) API-side Sentry helper

New file: `api/_sentry.ts`

Responsibilities:
- lazy init `@sentry/node` once per lambda runtime
- helper wrapper:
  - `withSentryApi(handler)`
  - catches exception, captures with context (`route`, method, status hints)
- helper `captureApiError(error, context)` for manual capture

Acceptance:
- wrapper reusable across all `/api` handlers

---

## 5) API handlers rollout (incremental)

Priority files:
- `api/notion_sync.ts`
- `api/performance_dashboard.ts`
- `api/telegram.ts`
- `api/perplexity.ts`
- `api/portal_indices.ts`
- `api/yahoo.ts`
- `api/msn.ts`
- `api/nasdaq.ts`
- `api/sec.ts`

Changes:
- export via `withSentryApi(...)`
- in `catch` blocks: preserve existing response contract, add capture context

Acceptance:
- response schemas unchanged
- simulated errors appear in Sentry with route tags

---

## 6) Build/release correlation

File: `vite.config.ts`

Changes (phase 2/optional):
- enable sourcemap in production build
- optionally add `@sentry/vite-plugin` for source map upload

Optional CI file:
- `.github/workflows/schedule.yml` (or dedicated deploy workflow)

Changes:
- set `SENTRY_RELEASE=${{ github.sha }}`
- (if plugin used) upload sourcemaps during build step

Acceptance:
- stack traces in Sentry map to TS/TSX lines

---

## 7) Documentation updates

Files:
- `README.md`
- `.env.vercel.example`
- (optional) new runbook `docs/SENTRY_RUNTIME_OBSERVABILITY_RUNBOOK_2026-04-02.md`

Add:
- env matrix (local/github/vercel)
- test procedure
- alert triage path (Sentry MCP -> Notion incident log)

---

## 8) Validation checklist

1. Local:
   - run app
   - throw test error in UI
   - confirm Sentry event
2. API:
   - call test endpoint with invalid payload
   - confirm API event captured
3. Vercel:
   - deploy preview
   - reproduce one UI + one API error
   - confirm environment/release tags

Success Criteria:
- UI + API errors captured with route/context
- no behavior regression in trading/notion/telegram flows
- MCP + Sentry can inspect incidents end-to-end

---

## Rollout Strategy

Phase A (safe/minimal):
- Steps 1~5 only (no source map upload)

Phase B (observability quality):
- Step 6 source map/release wiring

Phase C (ops integration):
- incident linking to Notion automation DB
