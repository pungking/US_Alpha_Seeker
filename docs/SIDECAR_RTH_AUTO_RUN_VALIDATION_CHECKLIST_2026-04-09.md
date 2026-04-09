# Sidecar RTH Auto-Run Validation Checklist (2026-04-09)

Purpose: verify that sidecar dry-run behaves correctly during US regular trading hours (RTH), including Telegram, Notion, and ops-health evidence alignment.

---

## 0) Session Window (KST / ET)

- US market open (DST): 09:30 ET = 22:30 KST
- US market close (DST): 16:00 ET = 05:00 KST (+1 day)
- Current dry-run schedule:
  - `5,20,35,50 13-21 * * 1-5` (UTC)
  - KST: 22:05, 22:20, 22:35, ... 06:50

Notes:
- 22:05 and 22:20 KST are pre-open runs (expected market-closed preflight).
- First post-open auto-run is 22:35 KST.

---

## 1) Pre-Open Sanity (once per day)

- [ ] Workflow file on default branch contains the RTH cadence cron.
- [ ] GitHub Actions vars:
  - `POSITION_LIFECYCLE_ENABLED=true`
  - `POSITION_LIFECYCLE_PREVIEW_ONLY=true`
- [ ] `PREFLIGHT_BLOCKING_HARD_FAIL=true`
- [ ] `PREFLIGHT_SOFT_CODES` includes `PREFLIGHT_MARKET_CLOSED`
- [ ] Sidecar secrets are present (Alpaca, Telegram, Notion, Drive, etc).

Important behavior:
- For `workflow_dispatch`, input defaults can override vars.
- If manual run shows `lifecycle_enabled=false`, set input `run_position_lifecycle_enabled=true`.

---

## 2) First In-Session Validation (22:35 KST run)

From GitHub Actions run summary (`sidecar-dry-run`):

- [ ] `trigger` is `schedule` (or `repository_dispatch` if stage6 event-run)
- [ ] `preflight` is not `PREFLIGHT_MARKET_CLOSED`
- [ ] `guard_control.blocked=false`
- [ ] `hf_marker_audit` all `ok`
- [ ] `ops health` overall is `PASS` (or explainable `WARN`)
- [ ] `RUN_SUMMARY` includes `shadow_data_bus=` and `shadow_parse=`

Expected outcomes:
- Payload can still be zero if strategy gates block candidates.
- Zero payload is acceptable only when `skip_reasons` explains it.

---

## 3) Telegram Evidence Check

- [ ] Simulation channel receives dry-run summary (split chunks are acceptable).
- [ ] Alert channel receives only real failure/alert signals.
- [ ] Message timestamp is close to the same run `generatedAt`.
- [ ] No duplicated flood for same run attempt.

---

## 4) Notion Evidence Check

- [ ] Daily Snapshot row upserted for this run key.
- [ ] Core fields updated:
  - Stage6 file/hash
  - payload/skipped
  - guard level
  - HF status fields
  - action reason / run actions
- [ ] If run failed, Automation Incident log has one deduped/rolled-up record.

---

## 5) Ops-Health Check

- [ ] `state/ops-health-report.md` exists in artifact/state output.
- [ ] `overall=PASS` or explainable `WARN`
- [ ] `files=preview=ok guard=ok guardControl=ok perf=ok markerAudit=ok`
- [ ] Key metrics are consistent with run summary values.

---

## 6) Acceptance Criteria (Go for Day)

Pass if all are true:

- [ ] At least 3 consecutive in-session auto-runs complete.
- [ ] No unexplained red-fail.
- [ ] Telegram/Notion/ops-health are mutually consistent.
- [ ] `RUN_SUMMARY` diagnostics are complete (no marker gaps).

If failed:

- [ ] Capture run IDs + logs + state zip.
- [ ] Classify by bucket:
  - `preflight` / `lifecycle-intent` / `telegram` / `notion` / `shadow-parse` / `marker-audit`
- [ ] Open incident note and patch only one bucket at a time.

---

## 7) Tonight 3-Run PASS/FAIL Sheet (copy/paste)

Date (KST): `2026-04-09`

| Run | Target Time (KST) | Trigger | Preflight Code | payloads/skipped | skip_reasons explainable | Telegram | Notion | Ops Health | Final |
|---|---:|---|---|---|---|---|---|---|---|
| #1 | 22:35 | schedule |  |  |  |  |  |  |  |
| #2 | 22:50 | schedule |  |  |  |  |  |  |  |
| #3 | 23:05 | schedule |  |  |  |  |  |  |  |

Final criteria:
- `Final=PASS` when all three runs are complete and each row has no unexplained blocker.
- Any unexplained `red fail` is `Final=FAIL` and should trigger incident note + one-bucket fix.

---

## 8) Quick Triage Template (run-by-run)

Paste this block for each run and fill it in:

```text
[RUN_ID]
time(KST)=
trigger=
preflight=status: / code:
payloads/skipped=
skip_reasons=
guard_control.blocked=
hf_marker_audit=
telegram(sim/alert)=
notion(upsert/incident)=
ops_health=
verdict=PASS|FAIL
reason(if FAIL)=
```
