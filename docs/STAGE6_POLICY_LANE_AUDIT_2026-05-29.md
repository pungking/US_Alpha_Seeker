# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-05T14:32:56.628Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-05_17-16-20.json
- Latest Verdict: **WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED**
- Latest Review-Ready Rows: 0
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
| structureConfirmation | 4 | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED:4 |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 0 | none |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 4 | 0 | 4 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| all | structureConfirmation | 41 | 0 | 41 | 0 | 0 | 0 | 0 |
| all | breakoutRetest | 18 | 0 | 0 | 0 | 4 | 4 | 18 |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| none | none | none | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| CSTM | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 33.00 | 0.12 | 26.85 | 3.49 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| FFBC | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 21.00 | 0.88 | 9.36 | 9.46 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| INCY | STRONG_BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 16.00 | 0.57 | 7.83 | 6.64 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |
| TGTX | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED | 50.00 | 0.83 | 21.01 | 18.34 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

