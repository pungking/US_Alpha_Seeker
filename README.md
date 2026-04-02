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
  - `.vscode/mcp.profile.ops.template.json` (GitHub/Vercel/Telegram/Sentry)
  - `.vscode/mcp.profile.research.template.json` (Perplexity)
- Optional all-in-one template:
  - `.vscode/mcp.online.template.json`
- Optional env template:
  - `.vscode/mcp.env.example`
  - token vars reuse existing names where possible: `GITHUB_TOKEN`, `VERCEL_TOKEN`, `TELEGRAM_TOKEN`, `SENTRY_ACCESS_TOKEN`, `PERPLEXITY_API_KEY`
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

Detailed runbook:

- `docs/MCP_COLLAB_SETUP_PLAYBOOK_2026-04-02.md`
