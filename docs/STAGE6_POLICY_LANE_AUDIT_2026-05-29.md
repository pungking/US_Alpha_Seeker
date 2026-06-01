# Stage6 Policy Lane Audit

- GeneratedAt: 2026-06-01T14:49:11.903Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-01_23-41-12.json
- Latest Verdict: **STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED**
- Latest Review-Ready Rows: 1
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 1 | BREAKOUT_RETEST_POLICY_REVIEW_READY:1 |
| structureConfirmation | 1 | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED:1 |
| targetNearCurrent | 0 | none |
| earningsDataMissing | 0 | none |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | breakoutRetest | BREAKOUT_RETEST_POLICY_REVIEW_READY | 99.00 | 80.23 | 4.49 | 17.16 | 82.54 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |

## Latest Rows

| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | BUY | breakoutRetest | wait_breakout_retest_required | BREAKOUT_RETEST_POLICY_REVIEW_READY | 99.00 | 4.49 | 17.16 | 82.54 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase. |
| PD | STRONG_BUY | other | blocked_rr_below_min | OUT_OF_SCOPE_FOR_POLICY_LANE | 16.00 | N/A | 32.77 | -19.56 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Use execution gate audit blocker class and sidecar-safe validation path. |
| TRIN | BUY | structureConfirmation | wait_structure_confirmation_required | STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED | 16.00 | 0.35 | 11.35 | 4.45 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact. |
| ZVRA | BUY | other | blocked_stop_too_tight | OUT_OF_SCOPE_FOR_POLICY_LANE | 118.00 | 5.00 | 18.44 | 97.59 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Use execution gate audit blocker class and sidecar-safe validation path. |

## Policy Interpretation

- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.
- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.
- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.
- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.
- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.

