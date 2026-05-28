# Stage6 Policy Lane Audit

- GeneratedAt: 2026-05-28T15:12:45.649Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-28_22-15-31.json
- Latest Verdict: **STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED**
- Latest Review-Ready Rows: 2
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 2 | BREAKOUT_RETEST_POLICY_REVIEW_READY:2 |
| structureConfirmation | 2 | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED:2 |
| targetNearCurrent | 1 | TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE:1 |
| earningsDataMissing | 1 | EARNINGS_DATA_COVERAGE_REQUIRED:1 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | breakoutRetest | BREAKOUT_RETEST_POLICY_REVIEW_READY | 99.00 | 80.23 | 4.28 | 17.74 | 81.25 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |
| ZVRA | breakoutRetest | BREAKOUT_RETEST_POLICY_REVIEW_READY | 131.00 | 20.83 | 5.73 | 13.30 | 110.05 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| AUPH | BUY | earningsDataMissing | wait_earnings_data_missing_quality_floor | EARNINGS_DATA_COVERAGE_REQUIRED | 16.00 | 0.82 | 5.30 | 9.40 | VALID_GEOMETRY | RR_CURRENT_WEAK | Separate data freshness/coverage from execution policy; current evidence does not justify promotion. |
| CRMD | STRONG_BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_POLICY_REVIEW_READY | 99.00 | 4.28 | 17.74 | 81.25 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |
| DAVE | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 63.00 | 1.37 | 21.76 | 31.42 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| EXEL | BUY | targetNearCurrent | wait_target_near_current | TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE | 14.00 | N/A | 13.60 | -0.77 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade; require target refresh or fresh thesis before any execution candidate. |
| QFIN | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 68.00 | 1.27 | 18.47 | 41.45 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| ZVRA | STRONG_BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_POLICY_REVIEW_READY | 131.00 | 5.73 | 13.30 | 110.05 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

