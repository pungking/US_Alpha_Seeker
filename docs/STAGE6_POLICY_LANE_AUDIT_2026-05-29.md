# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-15T14:31:54.232Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-15_22-50-32.json
- Latest Verdict: **WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED**
- Latest Review-Ready Rows: 1
- Latest Promotion-Review Rows: 0
- Latest Quality-Gate Rows: 2
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope
- Promotion Rule: reviewReady is diagnostic only; only proofConfirmed plus a separate producer policy change can create EXECUTABLE_NOW

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 1 | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE:1 |
| currentDistance | 0 | none |
| structureConfirmation | 3 | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED:3 |
| riskGeometry | 0 | none |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 1 | EARNINGS_DATA_COVERAGE_REQUIRED:1 |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 1 | 0 | 0 | 0 | 1 | 1 | 1 |
| all | structureConfirmation | 78 | 0 | 78 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 33 | 0 | 0 | 0 | 19 | 19 | 33 |

### Proof Criteria

- Breakout proofConfirmed requires: current_rr_and_target_buffer_pass, retest_touch_found, retest_fresh_within_maxBarsSinceRetest, current_extension_within_maxCurrentExtensionFromRetestPct, latest_close_above_retest_level.
- Structure overblock review rule: structure wait is overblock-review only when explicit reject or missing proof coexists with acceptable current RR, target buffer, and distance inside the structure review band.

## Latest Quality Gate Separation

| Symbol | Verdict | Quality Lane | Stage6 Reason | Lane Decision | Target Verdict | Target Viability | Zero-Exec Lane | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DUOL | BUY | earnings_data_coverage | wait_earnings_data_missing_quality_floor | QUALITY_GATE_EARNINGS_COVERAGE_REQUIRED | TARGET_ALREADY_REACHED_NO_TRADE | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | TARGET_RECALIBRATION | Keep WAIT_PRICE. Repair earnings coverage/freshness first; do not lower execution gates or solve this in sidecar. |
| ZVRA | SPECULATIVE_BUY | non_actionable_verdict | wait_verdict_not_sidecar_actionable | QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT | TARGET_POLICY_NOT_APPLICABLE | TARGET_VIABILITY_NOT_APPLICABLE | NO_ZERO_EXECUTABLE_TUNING_ACTION | Keep WAIT_PRICE. SPECULATIVE_BUY/HOLD-style rows are analysis watchlist only unless Stage6 emits an explicit waiver. |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | breakoutRetest | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE | 106.00 | 78.86 | 3.78 | 19.07 | 76.65 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Review-ready is diagnostic only. Promotion requires proofConfirmed=true. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| ASB | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 21.00 | 0.25 | 14.14 | 3.85 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| CRMD | BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE | 106.00 | 3.78 | 19.07 | 76.65 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Review-ready is diagnostic only. Promotion requires proofConfirmed=true. |
| DAVE | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 54.00 | 0.31 | 32.52 | 10.37 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| DUOL | BUY | earningsDataMissing | wait_earnings_data_missing_quality_floor | EARNINGS_DATA_COVERAGE_REQUIRED | 5.00 | N/A | 19.08 | -13.46 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Separate data freshness/coverage from execution policy; current evidence does not justify promotion. |
| INCY | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 13.00 | 0.39 | 7.62 | 5.55 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `QUALITY_GATE_EARNINGS_COVERAGE_REQUIRED` and `QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT` are intentionally separated from structure/breakout/risk geometry tuning.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `STOP_GEOMETRY_*`, `RR_GEOMETRY_*`, and `RECALCULATED_STOP_*` are producer-side risk-geometry decisions. They require Stage6 recalibration proof or no-trade; sidecar must not relax risk gates.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

