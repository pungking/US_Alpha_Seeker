# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-11T09:33:21.282Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-10_22-22-25.json
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
| breakoutRetest | 1 | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE:1 |
| currentDistance | 0 | none |
| structureConfirmation | 3 | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED:3 |
| targetNearCurrent | 1 | TARGET_ALREADY_REACHED_NO_TRADE:1 |
| earningsDataMissing | 0 | none |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 1 | 0 | 0 | 0 | 1 | 1 | 1 |
| all | structureConfirmation | 66 | 0 | 66 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 28 | 0 | 0 | 0 | 14 | 14 | 28 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| ZVRA | breakoutRetest | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE | 155.00 | 37.84 | 2.94 | 28.38 | 92.78 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Review-ready is diagnostic only. Promotion requires proofConfirmed=true. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| DAVE | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 52.00 | 0.69 | 27.41 | 19.81 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| DUOL | STRONG_BUY | targetNearCurrent | wait_target_near_current | TARGET_ALREADY_REACHED_NO_TRADE | 8.00 | N/A | 17.31 | -9.80 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Require fresh target/thesis recalibration before this can become executable. |
| FFBC | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 20.00 | 0.50 | 11.79 | 6.53 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| INCY | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | 15.00 | 0.40 | 8.65 | 5.42 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Explicit structure reject plus weak current execution evidence does not justify promotion. |
| ZVRA | STRONG_BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_REVIEW_READY_NOT_PROMOTABLE | 155.00 | 2.94 | 28.38 | 92.78 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Review-ready is diagnostic only. Promotion requires proofConfirmed=true. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

