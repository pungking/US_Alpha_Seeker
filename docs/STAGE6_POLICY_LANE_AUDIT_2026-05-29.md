# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-16T01:21:04.125Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-16_10-06-34.json
- Latest Verdict: **WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED**
- Latest Review-Ready Rows: 0
- Latest Promotion-Review Rows: 0
- Latest Quality-Gate Rows: 1
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope
- Promotion Rule: reviewReady is diagnostic only; only proofConfirmed plus a separate producer policy change can create EXECUTABLE_NOW

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 0 | none |
| currentDistance | 0 | none |
| structureConfirmation | 2 | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED:2 |
| riskGeometry | 3 | RISK_GEOMETRY_INVALID_NO_TRADE:3 |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 0 | none |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Continuation Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| all | structureConfirmation | 82 | 0 | 82 | 0 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 34 | 0 | 0 | 1 | 0 | 19 | 19 | 34 |

### Proof Criteria

- Breakout proofConfirmed requires: path_a_retest_touch_found, path_a_retest_fresh_within_maxBarsSinceRetest, path_a_current_extension_within_maxCurrentExtensionFromRetestPct, path_a_latest_close_above_retest_level, path_b_no_retest_touch_but_latest_close_above_retest, path_b_current_extension_within_maxContinuationExtensionPct, path_b_rr_at_current_above_continuationMinRr, path_b_target_buffer_above_continuationMinTargetBufferPct.
- Structure overblock review rule: structure wait is overblock-review only when explicit reject or missing proof coexists with acceptable current RR, target buffer, and distance inside the structure review band.

## Latest Quality Gate Separation

| Symbol | Verdict | Quality Lane | Stage6 Reason | Lane Decision | Target Verdict | Target Viability | Zero-Exec Lane | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUPH | HOLD | verdict_unusable | blocked_quality_verdict_unusable | QUALITY_GATE_VERDICT_UNUSABLE_REVIEW | TARGET_POLICY_NOT_APPLICABLE | TARGET_VIABILITY_NOT_APPLICABLE | NO_ZERO_EXECUTABLE_TUNING_ACTION | Inspect AI verdict normalization and source response before changing execution policy. |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| none | none | none | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | Promotion Policy | Blocked By | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| DAVE | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | N/A | none | 51.00 | 0.24 | 32.46 | 8.15 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| DHT | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | N/A | none | 18.00 | 0.58 | 7.35 | 9.76 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| DUOL | BUY | riskGeometry | blocked_rr_below_min | RISK_GEOMETRY_INVALID_NO_TRADE | N/A | none | 5.00 | N/A | 21.10 | -16.33 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |
| ERO | STRONG_BUY | riskGeometry | blocked_invalid_geometry | RISK_GEOMETRY_INVALID_NO_TRADE | N/A | none | 24.00 | 2.00 | 15.20 | 11.36 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_ACCEPTABLE | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |
| INCY | STRONG_BUY | riskGeometry | blocked_invalid_geometry | RISK_GEOMETRY_INVALID_NO_TRADE | N/A | none | 13.00 | 2.00 | 6.38 | 6.97 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_ACCEPTABLE | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires an explicit producer policy decision, current-entry feasibility, stop-distance policy pass, and promotion flag before executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `QUALITY_GATE_EARNINGS_COVERAGE_REQUIRED` and `QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT` are intentionally separated from structure/breakout/risk geometry tuning.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `STOP_GEOMETRY_*`, `RR_GEOMETRY_*`, and `RECALCULATED_STOP_*` are producer-side risk-geometry decisions. They require Stage6 recalibration proof or no-trade; sidecar must not relax risk gates.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

