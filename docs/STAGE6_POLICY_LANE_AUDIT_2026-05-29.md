# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-04T07:50:51.217Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-03_23-33-11.json
- Latest Verdict: **STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED**
- Latest Review-Ready Rows: 1
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 1 | BREAKOUT_RETEST_REVIEW_LOW_DISTANCE:1 |
| currentDistance | 0 | none |
| structureConfirmation | 4 | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED:4 |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 1 | EARNINGS_DATA_COVERAGE_REQUIRED:1 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| ZVRA | breakoutRetest | BREAKOUT_RETEST_REVIEW_LOW_DISTANCE | 104.00 | 41.09 | 7.65 | 11.43 | 110.05 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Inspect retest evidence; promotion still requires Stage6 producer proof fields. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| AUPH | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 13.00 | 0.57 | 7.10 | 7.32 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| TDC | BUY | earningsDataMissing | wait_earnings_data_missing_quality_floor | EARNINGS_DATA_COVERAGE_REQUIRED | 16.00 | N/A | 22.51 | -6.42 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Separate data freshness/coverage from execution policy; current evidence does not justify promotion. |
| TGTX | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 41.00 | 0.89 | 20.38 | 19.28 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| TOYO | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 43.00 | 0.09 | 37.62 | 3.71 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| VIST | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 39.00 | 1.27 | 15.82 | 27.33 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| ZVRA | STRONG_BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_REVIEW_LOW_DISTANCE | 104.00 | 7.65 | 11.43 | 110.05 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Inspect retest evidence; promotion still requires Stage6 producer proof fields. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

