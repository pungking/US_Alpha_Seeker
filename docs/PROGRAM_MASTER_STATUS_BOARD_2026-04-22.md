# US Alpha Seeker Master Status Board (2026-04-22)

Doc-Tier: P0 (Control Tower)
Snapshot time: 2026-04-22 02:15 KST (2026-04-21 17:15 UTC)

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
| US Auto-Scheduler | 30 runs | 25 | 4 | 1 | 0 | 83.3% |
| US Auto-Scheduler (recent trend) | 10 runs | 10 | 0 | 0 | 0 | 100.0% |
| Harvester (Master Stock Harvester) | 30 runs | 29 | 0 | 1 | 0 | 96.7% |
| Sidecar dry-run | 30 runs | 30 | 0 | 0 | 0 | 100.0% |
| Sidecar dry-run watchdog | 23 runs | 23 | 0 | 0 | 0 | 100.0% |
| Sidecar market-guard | 30 runs | 30 | 0 | 0 | 0 | 100.0% |
| US bridge watchdog (loop lane) | 6 completed runs | 6 | 0 | 0 | 1 | 100.0% (completed only) |

Core aggregate reliability (completed runs only, above 6 lanes + bridge watchdog completed):
- `143 / 149 = 96.0%`

### 1.2 Trading-Gate and Submit Metrics (paper lane)
Evidence run: `alpha-exec-engine` run `24735757832` (2026-04-21 17:05 UTC)
- Preflight: `PASS` (`required=200.00`, `buyingPower=199786.49`)
- Perf gate: `GO`, progress `20/20`
- HF live promotion: `PASS`, required checklist `5/5`
- Broker submit: `attempted=2`, `submitted=0`, `failed=2`
- Paper submit success rate (attempt-level, latest canary): `0 / 2 = 0.0%`
- Immediate blocker code: Alpaca `42210000` (`fractional orders must be simple orders`)

### 1.3 Program Milestone Completion (paper rollout)
Milestones:
1. Analysis scheduler stable operation: done
2. Stage3->Harvester->Stage6 handshake flow: done
3. Sidecar dry-run stable automation: done
4. Sidecar watchdog fallback + loop self-heal: done
5. Risk chain pass (preflight/perf/HF promotion): done
6. Paper submit lane enabled: done
7. Low-cap canary exposure profile applied: done
8. Paper broker order acceptance (no transport rejection): pending
9. Consecutive successful paper submits (>=3 runs): pending

Completion:
- `7 / 9 = 77.8%`

## 2) What Is Actually Working vs Not Working

### Working (green)
- Analysis automation resumed with recent 10-run clean streak on scheduler.
- Harvester dispatch/schedule lane is healthy (96.7% over last 30).
- Sidecar operational lanes (dry-run/watchdog/market-guard) are all 100% in sampled window.
- Decision gates are no longer the bottleneck:
  - preflight pass path confirmed,
  - perf gate `GO`,
  - HF live promotion `PASS`.

### Not working (red)
- Paper order transport compatibility is broken for current entry order shape.
- Root cause: broker rejects bracket submission payload under current notional-based entry format.
- Practical effect: strategy says "go", but broker transport says "reject", so execution result remains zero fill.

## 3) Repo Drift / Ownership Risk
- Runtime owner is `pungking/alpha-exec-engine`.
- `US_Alpha_Seeker` `sidecar-template/**` is a mirror/template only.
- Current state:
  - Template patch exists (commit `b38f55f`, `notional -> qty` for entry submit).
  - Runtime repo still needs equivalent patch application.

## 4) Forward Direction (recommended)

Direction principle:
- Keep paper-only mode.
- Close transport compatibility first.
- Do not widen exposure before submit success and stability criteria are met.

### Phase A (D0-D1): Transport Fix Closure
1. Apply `notional -> whole-share qty` patch in runtime repo (`alpha-exec-engine`).
2. Run one canary with idempotency bypass (`run_disable_order_idempotency=true`).
3. Target:
   - `attempted >= 1`
   - `submitted >= 1`
   - no `42210000` transport rejection.

### Phase B (D1-D3): Stability Proof
1. Restore normal idempotency.
2. Run 3-5 consecutive automated dry-runs with low caps.
3. Target:
   - submit success rate >= 95% on attempted paper orders,
   - zero critical preflight/gate regressions,
   - watchdog loop continues without stale-gap incident.

### Phase C (D3-D7): Controlled Scale-Up (still paper)
1. Increase caps only one axis at a time (orders or notional, not both).
2. Target:
   - 20 attempted paper orders aggregate,
   - submit success >= 95%,
   - no uncontrolled guard-trigger side effects.

## 5) Decision Gate to Next Program Step
- Stay in paper-rollout phase until all are true:
  - broker transport compatibility fixed,
  - consecutive submit-success evidence accumulated,
  - automation reliability sustained in recent window.

At current snapshot, decision = **Hold (not yet ready to graduate)**.

