# Notion Workspace Tune-Up Checklist

This checklist is for manual Notion changes while code-based sync remains automated.

## 1) Keep / Archive Decision

### Keep (recommended)
- `📅 Daily Snapshot` (run-level ops timeline; now receives sidecar dry-run + market-guard rows)
- `📊 Stock Scores` (stage scoring history)
- `🧠 AI Alpha Analysis` (model interpretation and signal rationale)
- `🎯 Portfolio Watchlist` (execution-facing watchlist)

## Optional archive (not delete)
- Temporary smoke/test entries in `📅 Daily Snapshot` (example: `vercel-smoke`)
  - Keep data, but hide from production views using a filter.

## Optional add (later)
- `🛡️ Guard Action Log` (one row per guard action: symbol/action/result/reason)
- `📈 HF Tuning Tracker` (gate progress/freeze/live-promotion timeline)

---

## 2) Daily Snapshot Schema (manual add if missing)

Current sync works with existing columns and auto-fills extra columns **if they exist**.
Add these for better readability:

- `Source` (Select)
  - Suggested options: `sidecar_dry_run`, `sidecar_market_guard`, `harvester`, `smoke`
- `Engine` (Select)
  - Suggested options: `sidecar_dry_run`, `sidecar_market_guard`, `harvester`
- `Stage6 File` (Text)
- `Stage6 Hash` (Text)
- `Payload Count` (Number)
- `Skipped Count` (Number)
- `Guard Level` (Number)
- `HF Gate` (Select or Text)
- `HF Live Promotion` (Select or Text)
- `Action Reason` (Text)
- `Run Actions` (Text)

Already used heavily:
- `Run Date` (Title), `Date`, `Status`, `Summary`, `Top Tickers`
- `VIX Level`, `Market Condition`, `Stage 6 Count`, `Final Picks Count`

---

## 3) View Layout (manual)

Create two table views:

1) `01_Production Runs`
- Filter: `Source != smoke`
- Sort: `Date desc`, then `Created desc`
- Show columns:
  - `Run Date`, `Date`, `Status`, `Source`, `Engine`,
  - `Market Condition`, `VIX Level`,
  - `Stage 6 Count`, `Final Picks Count`,
  - `Payload Count`, `Skipped Count`,
  - `Guard Level`, `HF Gate`, `HF Live Promotion`,
  - `Summary`, `Top Tickers`

2) `99_Smoke/Test`
- Filter: `Source == smoke` OR `Run Date contains smoke`
- Sort: `Created desc`

---

## 4) Stock / AI / Watchlist Minimal Hygiene

- `📊 Stock Scores`
  - Ensure `Ticker + Date` combination can be visually deduped in view.
  - Keep `Composite Alpha`, `Quality/Fundamental/Tech` visible.

- `🧠 AI Alpha Analysis`
  - Keep `Ticker`, `Date`, `AI Model`, `Alpha Signal`, `Confidence Score`, `Analysis Summary`.
  - Optional formula/tag: `Signal Strength` from confidence buckets.

- `🎯 Portfolio Watchlist`
  - Keep `Ticker`, `Status`, `Entry Price`, `Target Price`, `Stop Loss`, `Alpha Signal`, `Notes`.
  - Suggested statuses: `Watching`, `Position Open`, `Exited`, `Rejected`.

---

## 5) Ops Rule

- Do not delete databases during tuning.
- Archive old views/pages first, then prune after 2+ weeks of stable automation.
- Treat `Summary` as machine log; use dedicated columns for dashboard-style reading.

---

## 6) Optional Env Pointers (Project / Work List)

If you want to anchor automation to a specific Notion project page + work-list database,
keep these IDs in env as references:

- `NOTION_PROJECT` = Notion project page ID (example: `ae7aec5b2d1a4f409933d893312cf1c6`)
- `NOTION_WORK_LIST` = Notion work-list database ID (example: `cb0c6f8d60414300a6e89a4a62ea15b8`)

Naming tip (recommended for long-term clarity):
- `NOTION_PROJECT_PAGE_ID`
- `NOTION_WORK_LIST_DB_ID`

Both naming styles are fine as long as the team uses one standard consistently.

---

## 7) Notion AI Work Order (copy/paste)

Use this prompt in Notion AI inside your Project page:

```md
You are organizing an ops workspace for automated trading pipeline monitoring.

Context:
- Project page ID: {{NOTION_PROJECT}}
- Work-list DB ID: {{NOTION_WORK_LIST}}
- Existing core DBs: Daily Snapshot / Stock Scores / AI Alpha Analysis / Portfolio Watchlist

Please do the following:
1) In Work List DB, ensure these properties exist:
   - Name (title)
   - Status (select: Backlog, In Progress, Blocked, Done)
   - Priority (select: P0, P1, P2, P3)
   - Area (select: Sidecar, Market Guard, Harvester, Notion Sync, Security, Infra)
   - Owner (people or text)
   - Due Date (date)
   - Run Key (text)
   - Workflow (text)
   - Evidence Link (url)
   - Notes (text)

2) Create views:
   - `01_Active`: Status is Backlog/In Progress/Blocked, sort by Priority then Due Date
   - `02_Blocked`: Status is Blocked
   - `03_Done_Recent`: Status is Done, sort by Last edited desc
   - `99_Automation`: Area in (Sidecar, Market Guard, Harvester)

3) In the Project page, add linked views for:
   - Daily Snapshot (latest runs)
   - Work List (01_Active)
   - Guard Action Log (recent 7 days, if exists)
   - HF Tuning Tracker (latest, if exists)

4) Keep existing data intact; do not delete old rows. Only add/update schema and views.
```
