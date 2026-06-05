# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-05T15:32:15.736Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-06_00-23-47.json
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
| breakoutRetest | 1 | BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE:1 |
| currentDistance | 0 | none |
| structureConfirmation | 3 | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED:3 |
| targetNearCurrent | 2 | TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE:1, TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED:1 |
| earningsDataMissing | 0 | none |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 3 | 0 | 3 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 1 | 0 | 0 | 0 | 1 | 1 | 1 |
| all | structureConfirmation | 44 | 0 | 44 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 19 | 0 | 0 | 0 | 5 | 5 | 19 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | breakoutRetest | BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE | 120.00 | 79.78 | 3.93 | 18.74 | 78.50 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Retest evidence exists but is stale or over-extended; keep WAIT_PRICE until producer emits confirmed fresh retest proof. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| CPRX | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 26.00 | 0.20 | 19.37 | 4.19 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| CRMD | BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE | 120.00 | 3.93 | 18.74 | 78.50 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Retest evidence exists but is stale or over-extended; keep WAIT_PRICE until producer emits confirmed fresh retest proof. |
| EXEL | BUY | targetNearCurrent | wait_target_near_current | TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE | 12.00 | N/A | 16.14 | -5.36 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade; require target refresh or fresh thesis before any execution candidate. |
| FFBC | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 21.00 | 0.72 | 10.27 | 8.36 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| INCY | STRONG_BUY | targetNearCurrent | wait_target_near_current | TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED | 16.00 | 0.12 | 11.97 | 1.85 | VALID_GEOMETRY | RR_CURRENT_WEAK | Recompute target/stop thesis; do not use sidecar chase to make this executable. |
| TGTX | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 50.00 | 0.88 | 20.52 | 19.08 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

