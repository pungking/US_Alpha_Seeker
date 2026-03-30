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

Optional client toggle:
- `VITE_NOTION_SYNC_ENABLED=true|false` (default: `true`)

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
