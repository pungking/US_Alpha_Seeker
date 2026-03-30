# Notion AI Page Composition Workorder (Ops + Performance)

Use this file as a copy/paste instruction for Notion AI.

## Goal

Build one clean Notion command center page for:
- run monitoring,
- simulation/live performance tracking,
- guard/tuning operations,
- incident/security ops.

Important:
- Keep existing rows/data.
- Do not delete databases.
- Do not rename automation-critical properties listed below.

---

## Copy/Paste Prompt for Notion AI

```md
You are organizing an operations workspace for US Alpha Seeker.

Primary objective:
Create/refresh one top-level dashboard page named:
"US Alpha Seeker - Ops Command Center"

Hard rules:
1) Keep all existing data rows.
2) Do not delete existing databases.
3) Do not rename existing properties that are already used by automation.
4) If a required database does not exist, create it with the exact schema below.

Databases in scope:
- Daily Snapshot
- Stock Scores
- AI Alpha Analysis
- Portfolio Watchlist
- Guard Action Log
- HF Tuning Tracker
- Automation Incident Log
- Key Rotation Ledger
- Performance Dashboard

==================================================
STEP 1) Ensure required schema (create missing DBs only)
==================================================

A) Guard Action Log
Required properties:
- Run Key (title or text)
- Time (date)
- Level (number)
- Action (select)
- Symbol (text)
- Result (select: submitted, skipped, failed)
- Reason (text)
- OrderId (text)
- Raw Status (select or text)
- Source (select or text)
- Engine (select or text)
- Status (select or text)

B) HF Tuning Tracker
Required properties:
- Run Key (title or text)
- Time (date)
- Gate Progress (text)
- Perf Gate (select or text)
- Freeze Status (select or text)
- Live Promotion (select or text)
- Payload Probe (select or text)
- Alert (select or text)
- Decision (text)
- Stage6 File (text)
- Stage6 Hash (text)
- Source (select or text)
- Engine (select or text)
- Status (select or text)

C) Automation Incident Log
Required properties:
- Incident Key (title or text)
- Workflow (select or text)
- RunId (text)
- Error Class (select or text)
- Severity (select: P0, P1, P2, P3)
- Root Cause (text)
- Fix (text)
- Resolved (checkbox)

D) Key Rotation Ledger
Required properties:
- Key Name (title or text)
- Scope (select or text)
- Last Verified At (date or text)
- Notes (text)

E) Performance Dashboard
Required properties:
- Run Key (title or text)
- Time (date)
- Kind (select or text)
- Status (select or text)
- Source (select or text)
- Batch ID (text)
- Sim Rows (number)
- Sim Filled (number)
- Sim Open (number)
- Sim Closed (number)
- Sim Win Rate % (number)
- Sim Avg Closed Return % (number)
- Sim Avg Closed R (number)
- Sim Top Winners (text)
- Sim Top Losers (text)
- Series (text)
- Live Available (checkbox)
- Live Position Count (number)
- Live Unrealized PnL (number)
- Live Return % (number)
- Live Equity (number)
- Summary (text)

==================================================
STEP 2) Build dashboard page layout
==================================================

Create sections in this order:
1) Executive Strip
2) Performance (Simulation/Live)
3) Risk Guard + HF Tuning
4) Incidents + Security
5) Candidate Intelligence
6) Backlog / Action Queue

Section details:

1) Executive Strip
- Linked view: Daily Snapshot (latest 20 rows)
- Sort: Date desc
- Show columns:
  Run Date, Date, Status, Source, Engine, Market Condition, VIX Level,
  Stage 6 Count, Final Picks Count, Payload Count, Skipped Count, Summary

2) Performance (Simulation/Live)
- Linked view: Performance Dashboard
- Primary view name: 01_Latest
  - Sort: Time desc
  - Limit shown rows: 30
  - Visible columns:
    Time, Kind, Status, Sim Rows, Sim Closed, Sim Win Rate %, Sim Avg Closed R,
    Live Available, Live Position Count, Live Unrealized PnL, Live Return %, Live Equity, Summary
- Secondary view name: 02_Simulation_Trend
  - Filter: Kind contains "dry" OR Kind contains "local" (if possible)
  - Sort: Time desc
  - Visible columns:
    Time, Batch ID, Sim Rows, Sim Filled, Sim Open, Sim Closed,
    Sim Win Rate %, Sim Avg Closed Return %, Sim Avg Closed R, Series

3) Risk Guard + HF Tuning
- Linked view: Guard Action Log (recent rows first)
  - View: 01_Recent
  - Sort: Time desc
  - Visible: Time, Level, Action, Result, Reason, Run Key
- Linked view: HF Tuning Tracker
  - View: 01_Gate_Status
  - Sort: Time desc
  - Visible: Time, Gate Progress, Perf Gate, Freeze Status, Live Promotion, Payload Probe, Alert, Decision

4) Incidents + Security
- Linked view: Automation Incident Log
  - View: 01_Open_Incidents
  - Filter: Resolved is unchecked
  - Sort: Severity asc, last edited desc
  - Visible: Incident Key, Workflow, RunId, Error Class, Severity, Root Cause, Fix, Resolved
- Linked view: Key Rotation Ledger
  - View: 01_Verification_Status
  - Sort: Last Verified At desc
  - Visible: Key Name, Scope, Last Verified At, Notes

5) Candidate Intelligence
- Linked view: Stock Scores
  - View: 01_Latest_Scores
  - Sort: Date desc
  - Visible: Ticker, Date, Composite Alpha, Quality Score, Fundamental Score, Tech Score, Notes
- Linked view: AI Alpha Analysis
  - View: 01_Latest_AI
  - Sort: Date desc
  - Visible: Ticker, Date, AI Model, Alpha Signal, Confidence Score, Analysis Summary
- Linked view: Portfolio Watchlist
  - View: 01_Active_Watch
  - Sort: Date desc
  - Visible: Ticker, Status, Entry Price, Target Price, Stop Loss, Alpha Signal, Notes

6) Backlog / Action Queue
- If Work List DB exists, add linked view:
  - View: 01_Active
  - Filter: Status in (Backlog, In Progress, Blocked)
  - Sort: Priority asc, Due Date asc

==================================================
STEP 3) View naming convention
==================================================

Use names with numeric prefixes:
- 01_Production
- 02_Trend
- 03_Review
- 99_Test

For test/smoke filtering:
- Add a test view where Run Key contains "smoke" OR Source equals "smoke" when possible.

==================================================
STEP 4) Final validation checklist
==================================================

After edits, verify:
1) All 9 DBs are visible from the command center page.
2) Performance Dashboard view shows the latest row at top.
3) Incident view shows unresolved items only.
4) No existing data rows were removed.
5) Existing automation property names remained intact.
```

---

## Operator Notes

- If Notion AI cannot create one property type exactly, keep the same name and use `text` as fallback.
- Property names are more important than perfect type when automation maps aliases.
- After Notion AI completes, manually spot-check:
  - `Performance Dashboard` latest row,
  - `Guard Action Log` result values,
  - `HF Tuning Tracker` gate/freeze columns,
  - `Automation Incident Log` unresolved filter.

