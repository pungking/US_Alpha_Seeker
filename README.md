<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1lqSSMMcjR77PH7ha1XYvxZa0DrNZmL3q

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Optional: Notion Sync

This project can sync Stage6 outputs to Notion through a server-side proxy (`/api/notion_sync`).

Required server envs:
- `NOTION_TOKEN`
- `NOTION_DB_DAILY_SNAPSHOT`
- `NOTION_DB_STOCK_SCORES`
- `NOTION_DB_AI_ALPHA_ANALYSIS`
- `NOTION_DB_WATCHLIST`

Optional workspace pointers (for ops linking/manual workflows):
- `NOTION_PROJECT` (project page ID)
- `NOTION_WORK_LIST` (work-list database ID)

Optional client toggle:
- `VITE_NOTION_SYNC_ENABLED=true|false` (default: `true`)

## Optional: Performance Dashboard API (Simulation/Live)

Web UI panel `Trading Performance Board` reads from `/api/performance_dashboard`.

Source priority:
1. local state file (`sidecar-template/alpha-exec-engine/state/performance-dashboard.json`)
2. Notion DB latest row (`NOTION_DB_PERFORMANCE_DASHBOARD`)

Required server envs for Notion fallback:
- `NOTION_TOKEN`
- `NOTION_DB_PERFORMANCE_DASHBOARD`

## Optional: Sentry Runtime Observability (Phase A)

Minimal runtime capture is now wired for:
- Frontend render/runtime exceptions (React)
- API routes (`/api/notion_sync`, `/api/performance_dashboard`, `/api/telegram`, `/api/perplexity`, `/api/portal_indices`, `/api/yahoo`, `/api/nasdaq`, `/api/msn`, `/api/sec`)

Required envs:
- Frontend: `VITE_SENTRY_DSN`
- API/server: `SENTRY_DSN`

Recommended envs:
- `VITE_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`
- `VITE_SENTRY_RELEASE`, `SENTRY_RELEASE`
- `VITE_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`

## Optional: GitHub Automation -> Notion Sync

GitHub Actions (`.github/workflows/schedule.yml`) can also write a run-level snapshot into the same Notion Daily Snapshot DB.

Set in GitHub (Secrets/Variables):
- `NOTION_TOKEN` (secret)
- `NOTION_DB_DAILY_SNAPSHOT` (variable or secret)

Optional GitHub variables:
- `NOTION_GHA_SYNC_ENABLED=true|false` (default: `true`)
- `NOTION_GHA_SYNC_REQUIRED=true|false` (default: `false`, if `true` then sync failure fails workflow)

## Notion Workspace Operations

Recommended schema/view cleanup and extension plan:

- `docs/NOTION_WORKSPACE_TUNEUP_CHECKLIST.md`

This document includes:
- what to keep vs archive,
- which Daily Snapshot columns to add for readability,
- production vs test view filters,
- and optional next-phase DB expansions.

## Optional: MCP Collaboration Setup

For smoother Codex+operator collaboration, keep the active MCP config and profile templates separate.

- Active config:
  - `.vscode/mcp.json`
- Base config:
  - `.vscode/mcp.base.json` (Notion + Google Drive)
- Profile templates:
  - `.vscode/mcp.profile.ops.template.json` (GitHub/Vercel/Telegram/Sentry/Playwright/Grafana/PagerDuty/Cloudflare)
  - `.vscode/mcp.profile.research.template.json` (Perplexity/Obsidian optional)
- Optional all-in-one template:
  - `.vscode/mcp.online.template.json`
- Optional env template:
  - `.vscode/mcp.env.example`
  - token vars reuse existing names where possible: `GITHUB_TOKEN`, `VERCEL_TOKEN`, `TELEGRAM_TOKEN`, `SENTRY_ACCESS_TOKEN`, `PERPLEXITY_API_KEY`
  - Grafana vars (recommended read-only MCP): `MCP_GRAFANA_COMMAND=uvx`, `MCP_GRAFANA_COMMAND_PACKAGE=mcp-grafana`, `GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN`
  - PagerDuty vars (recommended read-only MCP): `MCP_PAGERDUTY_COMMAND=uvx`, `MCP_PAGERDUTY_COMMAND_PACKAGE=pagerduty-mcp`, `PAGERDUTY_USER_API_KEY`, `PAGERDUTY_API_HOST=https://api.pagerduty.com`
  - Cloudflare vars (remote MCP bridge): `MCP_CLOUDFLARE_COMMAND_PACKAGE=mcp-remote`, `MCP_CLOUDFLARE_URL` (optional: `CLOUDFLARE_API_TOKEN`)
  - optional Obsidian vars: `MCP_OBSIDIAN_COMMAND_PACKAGE`, `OBSIDIAN_API_KEY`, `OBSIDIAN_BASE_URL`
  - telegram routing defaults can use `TELEGRAM_SIMULATION_CHAT_ID`

Quick validation:

1. export env vars from your local `.env`/shell (or copy from `.vscode/mcp.env.example`)
2. run:
   - `npm run mcp:check`
3. if you want hard-fail on unresolved placeholders:
   - `MCP_CHECK_STRICT=true npm run mcp:check`

Profile sync (recommended):

- ops profile:
  - `npm run mcp:sync:ops`
- research profile:
  - `npm run mcp:sync:research`
- full profile:
  - `npm run mcp:sync:full`

Profile strategy (efficiency):

- Day-to-day ops: use `mcp:sync:ops` (focus on execution/observability MCPs only)
- Research/docs sessions: use `mcp:sync:research`
- `mcp:sync:full` only when you intentionally need everything in one session

Optional online template merge:

- safe mode (only servers with resolved env vars are merged):
  - `npm run mcp:sync`
- force include all template servers (even unresolved placeholders):
  - `npm run mcp:sync:all`

Smoke/health checks:

- local smoke test (no notify):
  - `npm run mcp:smoke`
- send Telegram alert on failure:
  - `npm run mcp:health`
- send Telegram status always:
  - `npm run mcp:health:always`
- one-shot daily ops routine:
  - `npm run mcp:ops:daily`
- Repo↔Notion↔Obsidian 운영 루틴 동기화:
  - `npm run ops:knowledge:sync`
  - 결과 리포트: `state/knowledge-routine-sync-report.json`
  - 동기화 항목:
    - Notion 프로젝트 페이지에 `[AUTO] US Alpha Seeker Program Status` 보드 재생성(완료/진행중/다음/가드레일)
    - 프로젝트/작업 DB 내 레거시 샘플 행(`샘플`, `템플릿` 등) 자동 정리
    - Obsidian 템플릿 허브/일일로그/인시던트/튜닝 노트 갱신
  - 선택 옵션:
    - `KNOWLEDGE_SYNC_APPEND_PROJECT_NOTES=true` (프로젝트 페이지 하단 안내 텍스트 블록 append)
    - `KNOWLEDGE_SYNC_CLEANUP_PROJECT_AUTO_NOTES=true|false` (기존 `[AUTO]` 텍스트 블록 정리)
    - `KNOWLEDGE_SYNC_ARCHIVE_LEGACY_SAMPLES=true|false` (레거시 샘플 행 자동 archive, 기본 true)

Optional GitHub Actions daily automation:

- workflow: `.github/workflows/mcp-ops-daily.yml`
- schedule: daily `00:15 UTC` (`09:15 KST`)
- required secrets/vars:
  - `MCP_GITHUB_TOKEN` (or fallback `GITHUB_PAT` / `SIDECAR_DISPATCH_TOKEN`)
  - `VERCEL_TOKEN`
  - `TELEGRAM_TOKEN`
  - `TELEGRAM_SIMULATION_CHAT_ID` (secret or repo variable)
  - `SENTRY_ACCESS_TOKEN`
  - `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`

Optional master control-plane scaffold (manual-only):

- workflow:
  - `.github/workflows/master-control-plane.yml`
- reusable lanes:
  - `.github/workflows/reusable-control-collect.yml`
  - `.github/workflows/reusable-control-validate.yml`
  - `.github/workflows/reusable-control-promote.yml`
  - `.github/workflows/reusable-control-incident.yml`
- design/runbook:
  - `docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md`
- safety defaults:
  - no auto live promotion
  - promotion lane is gated by sample threshold (`20/20` default)
  - promotion action is limited to `validation_pack` dispatch request

Detailed runbook:

- `docs/MCP_COLLAB_SETUP_PLAYBOOK_2026-04-02.md`
- `docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md`
- `docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md`
