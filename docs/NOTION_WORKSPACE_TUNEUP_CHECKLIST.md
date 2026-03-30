# Notion Workspace Tune-Up Checklist

This checklist is for manual Notion changes while code-based sync remains automated.

## 1) Keep / Archive Decision

## Keep (recommended)
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
  - Keep `Ticker`, `Status`, `Entry`, `Target`, `Stop`, `Alpha Signal`, `Notes`.
  - Suggested statuses: `Watching`, `Position Open`, `Exited`, `Rejected`.

---

## 5) Ops Rule

- Do not delete databases during tuning.
- Archive old views/pages first, then prune after 2+ weeks of stable automation.
- Treat `Summary` as machine log; use dedicated columns for dashboard-style reading.

