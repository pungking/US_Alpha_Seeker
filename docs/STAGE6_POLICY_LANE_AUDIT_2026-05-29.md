# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-13T00:37:09.807Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-13_09-33-41.json
- Latest Verdict: **WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED**
- Latest Review-Ready Rows: 1
- Latest Promotion-Review Rows: 0
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope
- Promotion Rule: reviewReady is diagnostic only; only proofConfirmed plus a separate producer policy change can create EXECUTABLE_NOW

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 0 | none |
| currentDistance | 0 | none |
| structureConfirmation | 1 | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED:1 |
| riskGeometry | 0 | none |
| targetNearCurrent | 3 | TARGET_ALREADY_REACHED_NO_TRADE:2, TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED:1 |
| earningsDataMissing | 1 | EARNINGS_DATA_COVERAGE_REQUIRED:1 |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| all | structureConfirmation | 75 | 0 | 75 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 32 | 0 | 0 | 0 | 18 | 18 | 32 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| INCY | targetNearCurrent | TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED | 13.00 | 2.03 | 0.03 | 12.03 | 0.51 | VALID_GEOMETRY | RR_CURRENT_WEAK | Recompute target/stop thesis. Do not solve with sidecar chase or open-order replace. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| ASB | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 21.00 | 0.33 | 13.30 | 4.87 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| ATEX | STRONG_BUY | targetNearCurrent | wait_target_near_current | TARGET_ALREADY_REACHED_NO_TRADE | 22.00 | N/A | 38.79 | -22.83 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Require fresh target/thesis recalibration before this can become executable. |
| DUOL | STRONG_BUY | earningsDataMissing | wait_earnings_data_missing_quality_floor | EARNINGS_DATA_COVERAGE_REQUIRED | 5.00 | N/A | 18.93 | -13.31 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Separate data freshness/coverage from execution policy; current evidence does not justify promotion. |
| INCY | STRONG_BUY | targetNearCurrent | wait_target_near_current | TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED | 13.00 | 0.03 | 12.03 | 0.51 | VALID_GEOMETRY | RR_CURRENT_WEAK | Recompute target/stop thesis. Do not solve with sidecar chase or open-order replace. |
| VIRT | BUY | targetNearCurrent | wait_target_near_current | TARGET_ALREADY_REACHED_NO_TRADE | 15.00 | N/A | 22.55 | -9.01 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Require fresh target/thesis recalibration before this can become executable. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `STOP_GEOMETRY_*`, `RR_GEOMETRY_*`, and `RECALCULATED_STOP_*` are producer-side risk-geometry decisions. They require Stage6 recalibration proof or no-trade; sidecar must not relax risk gates.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

