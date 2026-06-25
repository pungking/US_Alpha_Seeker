# Stage6 / Sidecar Entry Fillability Contract

## Scope

This contract defines the handoff between the Stage6 producer in `US_Alpha_Seeker` and the execution sidecar in `alpha-exec-engine` for entry feasibility and fillability. It is an analysis-side contract only. It does not authorize broker mutation.

## Producer Rule

Stage6 may emit `finalDecision=EXECUTABLE_NOW` only when both the original trade box and the current-market execution check are acceptable.

Required current-market checks:

- `rrAtCurrentPrice >= decisionGate.currentEntryMinRr`
- `executionFeasibilityAtCurrentDistancePct <= decisionGate.currentEntryMaxAdaptiveDistancePct`
- `targetBufferFromCurrentPct >= decisionGate.currentEntryMinTargetBufferPct`
- price box geometry remains valid: `target > entry > stop`

If the original Stage6 entry is too far from current price, or the current price has reduced RR below the minimum, Stage6 must not leave the row as `EXECUTABLE_NOW` merely because the original entry/stop/target box looked good.

## Required Candidate Fields

| Field | Type | Meaning |
|---|---:|---|
| `finalDecision` | enum | `EXECUTABLE_NOW`, `WAIT_PRICE`, `BLOCKED_RISK`, or `BLOCKED_EVENT` |
| `decisionReason` | string | Machine-readable producer reason. Current-distance failures use `wait_current_distance_above_adaptive`. |
| `entryExecPrice` / `entryExecPriceShadow` | number | Stage6 intended execution entry. |
| `targetPrice` / `targetMeanPrice` | number | Stage6 target. |
| `stopLoss` / `ictStopLoss` | number | Stage6 stop. |
| `rrAtCurrentPrice` | number or null | RR if entering at current price using the active stop/target basis. |
| `entryDistancePct` / `entryDistancePctShadow` | number or null | Absolute distance between current price and Stage6 intended entry. |
| `targetBufferFromCurrentPct` | number or null | Target upside from current price. |
| `executionFeasibilityAtCurrent` | enum | `PASS`, `BLOCKED`, or `UNKNOWN`. |
| `executionFeasibilityAtCurrentVerdict` | string | Normalized current-market feasibility verdict. |
| `executionFeasibilityAtCurrentReason` | string or null | Downgrade reason when blocked. |
| `executionFeasibilityAtCurrentRr` | number or null | RR value used by the current-market feasibility check. |
| `executionFeasibilityAtCurrentDistancePct` | number or null | Distance value used by the current-market feasibility check. |
| `executionFeasibilityAtCurrentMinRr` | number | Minimum RR applied to current-market entry feasibility. |
| `executionFeasibilityAtCurrentMaxDistancePct` | number | Adaptive max distance used for Stage6-sidecar fillability alignment. |
| `executionFeasibilityAtCurrentMinTargetBufferPct` | number | Minimum target buffer from current price. |
| `executionFeasibilityAtCurrentBasis` | string | Basis such as `ORIGINAL_STAGE6_STOP_AT_CURRENT`, `ADAPTIVE_CURRENT_ENTRY_CONTRACT`, or `RECALCULATED_STOP_CURRENT_ENTRY_CONTRACT`. |
| `fillabilityPolicyVerdict` | string | Sidecar-friendly alias derived from `executionFeasibilityAtCurrent`. |
| `entryTimingPolicyVerdict` | string | Sidecar-friendly alias derived from `executionFeasibilityAtCurrentVerdict`. |

## Downgrade Semantics

When Stage6 initially qualifies a candidate as executable but the current-market check fails:

| Failure | Stage6 output |
|---|---|
| `rrAtCurrentPrice < minRR` or RR unavailable | `finalDecision=WAIT_PRICE`, `decisionReason=wait_current_rr_below_min`, `executionFeasibilityAtCurrent=BLOCKED` |
| current/entry distance exceeds adaptive band | `finalDecision=WAIT_PRICE`, `decisionReason=wait_current_distance_above_adaptive`, `executionFeasibilityAtCurrent=BLOCKED` |
| current price is too close to target | `finalDecision=WAIT_PRICE`, `decisionReason=wait_target_near_current`, `executionFeasibilityAtCurrent=BLOCKED` |
| missing price/geometry evidence | Existing geometry/data gates apply before current-market feasibility. |

## Sidecar Consumer Rule

The sidecar may use Stage6 `EXECUTABLE_NOW` rows as input to dry-run and paper-safe checks, but it must still enforce its own portfolio, idempotency, preflight, fillability, and market-session gates.

If Stage6 emits `executionFeasibilityAtCurrent=BLOCKED`, the sidecar must treat the row as a watchlist/policy-review row and must not create an order payload from it.

## Safety

This contract preserves safe defaults. It changes signal classification only. It does not enable broker order submission, replace, repair, or state migration.
