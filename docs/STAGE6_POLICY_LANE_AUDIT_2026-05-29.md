# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-04T14:28:25.875Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-04_21-45-22.json
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
| structureConfirmation | 4 | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED:4 |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 1 | EARNINGS_DATA_COVERAGE_REQUIRED:1 |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 4 | 0 | 4 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 1 | 0 | 0 | 0 | 1 | 1 | 1 |
| all | structureConfirmation | 37 | 0 | 37 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 18 | 0 | 0 | 0 | 4 | 4 | 18 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| ZVRA | breakoutRetest | BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE | 104.00 | 41.09 | 7.59 | 11.51 | 109.85 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Retest evidence exists but is stale or over-extended; keep WAIT_PRICE until producer emits confirmed fresh retest proof. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| BFH | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 19.00 | 0.71 | 11.19 | 8.86 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| BLBD | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 26.00 | 0.68 | 15.90 | 12.82 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| POWL | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 37.00 | 0.18 | 29.38 | 5.51 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| TDC | BUY | earningsDataMissing | wait_earnings_data_missing_quality_floor | EARNINGS_DATA_COVERAGE_REQUIRED | 16.00 | N/A | 20.80 | -4.36 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Separate data freshness/coverage from execution policy; current evidence does not justify promotion. |
| VIST | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 39.00 | 1.37 | 15.07 | 28.44 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| ZVRA | STRONG_BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE | 104.00 | 7.59 | 11.51 | 109.85 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Retest evidence exists but is stale or over-extended; keep WAIT_PRICE until producer emits confirmed fresh retest proof. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

