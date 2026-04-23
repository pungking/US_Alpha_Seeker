# US Alpha Seeker Master Status Board (2026-04-22)

Doc-Tier: P0 (Control Tower)
Snapshot time: 2026-04-23 14:09 KST (2026-04-23 05:09 UTC)

## 0) Scope and Operating Definition
- System scope:
  - `US_Alpha_Seeker` (analysis/scheduler/control-plane bridge)
  - `US_Alpha_Seeker_Harvester` (OHLCV + aux collector)
  - `alpha-exec-engine` (sidecar dry-run/guard)
- Operating definition:
  - In this program, "simulation" = **paper trading** only.
  - Broker endpoint is `https://paper-api.alpaca.markets`.

## 1) Quantified KPI Dashboard

### 1.1 Workflow Reliability (recent window)
| Lane | Window | Success | Failure | Cancelled | In-Progress | Success Rate |
|---|---:|---:|---:|---:|---:|---:|
| US Auto-Scheduler | 20 runs | 20 | 0 | 0 | 0 | 100.0% |
| Sidecar Dispatch Watchdog (US bridge) | 20 runs | 16 | 0 | 4 | 0 | 80.0% |
| Harvester (Master Stock Harvester) | 20 runs | 19 | 0 | 1 | 0 | 95.0% |
| Sidecar dry-run | 20 runs | 20 | 0 | 0 | 0 | 100.0% |
| Sidecar dry-run watchdog | 20 runs | 20 | 0 | 0 | 0 | 100.0% |
| Sidecar market-guard | 20 runs | 20 | 0 | 0 | 0 | 100.0% |

Core aggregate reliability (completed runs only, above 6 lanes):
- `115 / 120 = 95.8%`

Non-core but critical unstable lanes:
- `sidecar-dry-run-bridge`: `2/6 = 33.3%`
- `Knowledge Intake Pipeline`: `12/20 = 60.0%`
- `Knowledge Obsidian Nightly Validate`: `3/9 = 33.3%`
- `Knowledge Intake Final Check`: `9/12 = 75.0%`
- `Master Control Plane (Scaffold)`: `6/10 = 60.0%`

### 1.2 Trading-Gate and Submit Metrics (paper lane)
Evidence runs (normal preflight condition):
- Pair orchestration run: `US_Alpha_Seeker` `24817461328` (2026-04-23 13:52 KST / 2026-04-23 04:52 UTC), `success`
- Phase-1 (`submit_pass`) recheck run: `24817465506`
  - `preflight_pass=true`
  - `attempted=1`, `submitted=1`, `broker_reason=submit_ok`
  - `verify_mode_observed=submit_pass`
- Phase-2 (`guard_skip_pass`) recheck run: `24817494463`
  - `preflight_pass=true`
  - `attempted=0`, `submitted=0`, `broker_reason=submit_skipped_all`
  - `guard_reason_count=1`
  - `verify_mode_observed=guard_skip_pass`

Latest canary verification aggregate (ops daily report run `24817865979`):
- `parsed=8/8`
- `preflight_pass_runs=8/8 (100.0%)`
- `submit_pass_runs=3/8 (37.5%)`
- `attempted_total=3`, `submitted_total=3`, submit success on attempts `100.0%`

### 1.3 Program Milestone Completion (paper rollout)
Milestones:
1. Analysis scheduler stable operation: done
2. Stage3->Harvester->Stage6 handshake flow: done
3. Sidecar dry-run stable automation: done
4. Sidecar watchdog fallback + loop self-heal: done
5. Risk chain pass (preflight/perf/HF promotion): done
6. Paper submit lane enabled: done
7. Low-cap canary exposure profile applied: done
8. Paper broker order acceptance (no transport rejection): done
9. Consecutive successful paper submits (>=3 runs): pending

Completion:
- `8 / 9 = 88.9%`

## 2) What Is Actually Working vs Not Working

### Working (green)
- Analysis scheduler lane is stable in recent window (`20/20`).
- Harvester lane remains strong (`19/20`).
- Sidecar operation lanes are stable (`dry-run/watchdog/market-guard` all `20/20`).
- Normal-preflight submit path is re-proven (`attempted=1`, `submitted=1`) and guard-skip path is also re-proven.
- Sidecar Notion sync step is green in sampled runs (recent checked runs all success).

### Not working (red)
- `US_Alpha_Seeker` bridge lane has unresolved failure mode.
  - Evidence: `sidecar-dry-run-bridge` failure run `24706963413`
  - Error: `No STAGE6_ALPHA_FINAL_* file found in GDRIVE_STAGE6_FOLDER`
- Knowledge automation lanes are not yet stable enough for operations baseline.
  - NotebookLM/Obsidian/Final-check lanes remain below acceptable reliability.
- Consecutive submit-pass evidence is still insufficient for milestone close.
  - Recent canary verify aggregate: `submit_pass_runs=3/8` (not consecutive, mixed with guard-skip runs).
  - Need 3+ consecutive automated submit-pass runs under normal preflight and low-cap controls.

## 3) Repo Ownership / Drift Risk
- Runtime owner is `pungking/alpha-exec-engine`.
- `US_Alpha_Seeker` `sidecar-template/**` is a mirror/template only.
- Current state:
  - Runtime canary accepted paper orders (transport path works in tested condition).
  - Drift risk remains if template and runtime workflow/env defaults diverge again.

## 4) Forward Direction (recommended)

Direction principle:
- Keep paper-only mode.
- Prioritize operational stability gaps before capability expansion.
- Do not widen exposure before repeatability criteria are met.

### Phase A (D0-D1): Normal-Condition Submit Proof
Status update (2026-04-23): **completed**
1. Canary executed with preflight enabled and submit/guard pair verification.
2. Proven:
   - `preflight=PASS` on both phases
   - submit path (`attempted>=1`, `submitted>=1`) confirmed in phase-1
   - guard-skip path confirmed in phase-2

### Phase B (D1-D3): Bridge + Knowledge Stabilization
1. Fix bridge failure path for Stage6 file absence/timing mismatch.
2. Stabilize NotebookLM/Obsidian/final-check lane with concrete retry/backoff and timeout policy.
3. Target:
   - `sidecar-dry-run-bridge` success >= 90% in recent 10,
   - `Knowledge Obsidian Nightly Validate` 7 consecutive success,
   - `Knowledge Intake Pipeline` >= 85% in recent 20.

### Phase C (D3-D7): Repeatability Proof (paper only)
1. Restore normal idempotency.
2. Run 3-5 consecutive automated paper runs with low caps.
3. Target:
   - submit success rate >= 95% on attempted paper orders,
   - zero critical preflight/gate regressions,
   - watchdog loop continues without stale-gap incident.

### Phase D (D7+): Controlled Scale-Up (still paper)
1. Increase caps only one axis at a time (orders or notional, not both).
2. Target:
   - 20 attempted paper orders aggregate,
   - submit success >= 95%,
   - no uncontrolled guard-trigger side effects.

## 5) Alpaca CLI / Alpaca MCP Readiness Check
- Current repo state:
  - `alpacahq/cli` integration is not implemented in this repository.
  - Alpaca MCP server wiring is not present in current `.vscode/mcp*.json` templates.
  - Local machine check: `alpaca` CLI command not found.
- Operational meaning:
  - Current trading path works via sidecar native API calls.
  - CLI/MCP is currently an ops-assist gap, not execution-core blocker.
- Recommended implementation order:
  1. Add Alpaca MCP in ops profile as read-only first (account/positions/orders 조회 only).
  2. Add Alpaca CLI install/health check routine for operator workstation runbook.
  3. Keep order execution authority in sidecar runtime (do not route live order trigger through MCP).

## 6) Decision Gate to Next Program Step
- Stay in paper-rollout phase until all are true:
  - broker submit proof repeated under normal preflight condition,
  - consecutive submit-success evidence accumulated,
  - bridge/knowledge lanes reach minimum reliability thresholds.

At current snapshot, decision = **Hold (function partially proven, operations not yet stabilized)**.

## 7) Automation Pipeline Connectivity Check (2026-04-22 update)

Reference audit:
- `sidecar-template/alpha-exec-engine/docs/AUTOMATION_PIPELINE_INTEGRATION_AUDIT_2026-04-22.md`

Connectivity classification (current):
- Connected: `15`
- Partially connected: `3`
- Not connected: `2`
- Coverage: `75.0%`

What this means:
- Execution core lanes (dry-run/guard/canary/watchdog/preflight-submit) are connected.
- Ops observability improved (Notion audit + ops daily report artifact), but governance is still artifact-centric.
- Knowledge loop lanes (Notion/Obsidian/NotebookLM) are present, but not yet contract-bound to sidecar daily evidence.

Immediate closure priorities:
1. Consolidated daily Notion upsert from `state/ops-daily-report.json`. ✅
2. Daily report enrichment with canary quality markers (`preflight_pass`, `attempted`, `submitted`). ✅
3. Template/runtime workflow drift checker to control mirror divergence.

Knowledge loop hardening applied (2026-04-22):
- `scripts/knowledge-intake-pipeline.mjs` sanitizer guard 강화(인용 숫자 잔류/구분자/레이블/중복헤더).
- `.github/workflows/knowledge-intake-pipeline.yml`에 markdown quality gate 추가:
  - `npm run ops:knowledge:quality`
  - artifacts: `state/knowledge-markdown-quality-report.json`, `.md`
- 운영 기준 문서:
  - `docs/KNOWLEDGE_MARKDOWN_ERROR_PREVENTION_2026-04-22.md`

Ops reporting hardening applied (2026-04-22):
- `scripts/build-ops-daily-report.mjs` now parses canary verify markers from run logs and aggregates:
  - `preflight_pass`, `attempted`, `submitted`, `submitPass`.
- `scripts/sync-notion-ops-daily.mjs` added:
  - consolidated daily Notion row upsert (`ops-daily-YYYY-MM-DD`).
- `.github/workflows/mcp-ops-daily.yml` now runs:
  - `ops:notion:audit`
  - `ops:daily:report`
  - `ops:daily:notion:sync`

Ops reporting verification update (2026-04-23):
- Canary pair validation succeeded:
  - `24817461328` (pair orchestrator)
  - `24817465506` (`submit_pass`)
  - `24817494463` (`guard_skip_pass`)
- `build-ops-daily-report.mjs` marker parser fixed (ANSI-safe key/value parse):
  - commit: `ef6fc3c5`
  - symptom before fix: `canaryVerify.parsed=0/8` (`verify_marker_not_found`)
  - result after fix (run `24817865979`): `canaryVerify.parsed=8/8`
