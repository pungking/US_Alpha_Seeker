# Automation Pipeline Integration Audit (2026-04-22)

Updated: 2026-04-22 UTC/KST  
Owner: givet-bsm + Codex  
Scope: `US_Alpha_Seeker` control-plane bridge + `alpha-exec-engine` sidecar automation lanes

---

## 1) Verdict

Not all implemented logic is fully connected into one end-to-end automated pipeline yet.

- **Execution core lanes** are connected and automated.
- **Ops observability lanes** are mostly connected.
- **Knowledge loop lanes** are implemented but still partially disconnected from sidecar daily outputs.

Current integration score (operational connectivity):
- **Connected:** 13
- **Partially connected:** 5
- **Not connected:** 2
- **Coverage:** `13 / 20 = 65.0%`

---

## 2) Integration Matrix (Fact Check)

| Domain | Component | Automation Link | Current Status | Notes |
|---|---|---|---|---|
| Execution | sidecar dry-run (`alpha-exec-engine`) | schedule + manual + repository_dispatch | Connected | Primary runtime lane active |
| Execution | sidecar market-guard | schedule + manual | Connected | Separate guard lane active |
| Execution | sidecar payload probe isolated | manual workflow | Connected | Safe lane; no state cache pollution |
| Execution | preflight gate | runtime + canary verify | Connected | Canary verifies pass marker |
| Execution | broker submit lane | runtime + canary verify | Connected | attempted/submitted markers validated in canary |
| Execution | order idempotency ledger | runtime state (`state/order-idempotency.json`) | Connected | dedupe path in production code |
| Execution | order lifecycle ledger | runtime state (`state/order-ledger.json`) | Connected | transition/state history persisted |
| Execution | approval queue gate | runtime + Drive queue sync | Connected | entry-expansion gating implemented |
| Execution | HF promotion/perf-gate submit dependency | runtime + dry-run summary | Connected | submit guard chain exists |
| Bridge | US webapp schedule -> sidecar dispatch | `schedule.yml` repository_dispatch + fallback workflow_dispatch | Connected | bridge layer active |
| Bridge | sidecar dispatch watchdog (US repo) | `sidecar-dispatch-watchdog.yml` | Connected | stale-run fallback dispatch |
| Sidecar | sidecar native watchdog (runtime repo) | `dry-run-watchdog.yml` | Connected | runtime self-heal lane |
| Ops | Notion per-run sync (dry-run/guard) | `sync-notion-summary.mjs` in sidecar workflows | Connected | daily snapshot rows confirmed historically |
| Ops | Notion data-quality audit | `ops:notion:audit` + `mcp-ops-daily.yml` | Connected | required-field/duplicate/stale checks wired |
| Ops | ops daily report artifact | `ops:daily:report` + `mcp-ops-daily.yml` | Connected | json/md + step summary + artifacts |
| Ops | consolidated daily Notion row | no upsert script yet | Partial | report exists but not auto-written to one daily row |
| Ops | canary KPI ingestion into ops daily report (`preflight_pass`, `attempted`, `submitted`) | not parsed in current report script | Partial | currently workflow success-centric summary |
| Knowledge | Notion -> Obsidian -> NotebookLM routine | dedicated workflows/scripts exist | Partial | loop exists, linkage to sidecar daily report is weak |
| Knowledge | sidecar daily report -> knowledge pipeline handoff | not enforced | Partial | no mandatory handoff contract |
| Governance | template/runtime workflow drift control | manual sync discipline only | Partial | mirror drift remains operational risk |

---

## 3) What is strong vs weak

### Strong
- Paper-trading execution chain is automation-ready (dry-run, guard, canary, watchdog).
- Safety gates are layered (preflight, perf gate, HF live promotion, idempotency, lifecycle controls).
- Notion operational telemetry is no longer blind; audit + daily report artifacts exist.

### Weak
- Consolidated daily governance record is still artifact-first, not Notion row-first.
- KPI quality for ops daily report is still shallow (run conclusion bias).
- Knowledge loop is operationally separate from sidecar evidence loop.
- Mirror/template drift can silently increase runbook entropy.

---

## 4) Priority Gap Closure Plan

### P0 (immediate)
1. Add `ops:daily:notion:sync` script:
   - Input: `state/ops-daily-report.json`
   - Output: one daily upsert row (`ops-daily-YYYY-MM-DD`) in Notion.
2. Extend ops daily report script to parse canary verification markers:
   - `preflight_pass=true`
   - `attempted`
   - `submitted`
3. Add hard link in daily report row to evidence URLs (canary + dry-run).

### P1 (next)
1. Add sidecar->knowledge handoff contract:
   - daily report id, generated timestamp, evidence links, status.
2. Obsidian append automation should consume the same daily JSON payload (not separate ad-hoc logic).
3. NotebookLM ingestion marker should reference same report key.

### P2 (stability hardening)
1. Add mirror drift checker between:
   - `/.github/workflows/*sidecar*`
   - `sidecar-template/alpha-exec-engine/.github/workflows/*`
2. Add fail/warn mode for drift in control-plane workflow.

---

## 5) Done-When (integration completeness target)

Target: **>= 90% connected coverage** and no critical partials in execution/ops governance.

Required completion checks:
1. Consolidated daily Notion row auto-upsert is live for 3 consecutive days.
2. Daily report includes canary trade-quality KPIs (`preflight_pass`, `attempted`, `submitted`) from logs.
3. Knowledge loop references the same daily report key without manual copy-paste.
4. Template/runtime drift checker runs at least daily and reports explicit status.

