# Stage6 Policy Lane Audit

- GeneratedAt: 2026-07-07T14:06:26.227Z
- Source Audit: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json
- Latest Verdict: **STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED**
- Latest Review-Ready Rows: 1
- Latest Promotion-Review Rows: 1
- Latest Quality-Gate Rows: 0
- Latest Formula Bottlenecks: {"RISK_GEOMETRY_RECALCULATION_FORMULA":1,"TARGET_RECALIBRATION_FORMULA":2,"BREAKOUT_PROOF_FORMULA":1,"NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK":1}
- Latest All-Row Formula Bottlenecks: {"NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK":3,"RISK_GEOMETRY_RECALCULATION_FORMULA":1,"TARGET_RECALIBRATION_FORMULA":2,"BREAKOUT_PROOF_FORMULA":1}
- Latest Formula Lane Consistency Issues: 0
- Broker Mutation Authorized: false
- Execution Policy Changed: false
- Safety Reason: analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope
- Promotion Rule: reviewReady is diagnostic only; only proofConfirmed plus a separate producer policy change can create EXECUTABLE_NOW

## Formula Lane Consistency

| Symbol | Stage6 | Decision | Tuning Lane | Expected Formula | Actual Formula |
| --- | --- | --- | --- | --- | --- |
| none | none | none | none | none | none |

## Latest Lane Summary

| Lane | Latest Rows | Latest Decisions |
| --- | ---: | --- |
| breakoutRetest | 1 | BREAKOUT_PROOF_CONFIRMED_PROMOTION_DISABLED:1 |
| currentDistance | 0 | none |
| structureConfirmation | 0 | none |
| riskGeometry | 2 | STOP_GEOMETRY_RECALIBRATION_REQUIRED:1, RISK_GEOMETRY_INVALID_NO_TRADE:1 |
| targetNearCurrent | 1 | TARGET_ALREADY_REACHED_NO_TRADE:1 |
| earningsDataMissing | 0 | none |

## Confirmation Proof Quality

| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Continuation Confirmed | Review Ready | Stale/Extended | Current RR OK |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| latest | structureConfirmation | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| latest | breakoutRetest | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| all | structureConfirmation | 26 | 0 | 26 | 0 | 0 | 0 | 0 | 1 |
| all | breakoutRetest | 15 | 0 | 0 | 7 | 0 | 8 | 8 | 15 |

### Proof Criteria

- Breakout proofConfirmed requires: path_a_retest_touch_found, path_a_retest_fresh_within_maxBarsSinceRetest, path_a_current_extension_within_maxCurrentExtensionFromRetestPct, path_a_latest_close_above_retest_level, path_b_no_retest_touch_but_latest_close_above_retest, path_b_current_extension_within_maxContinuationExtensionPct, path_b_rr_at_current_above_continuationMinRr, path_b_target_buffer_above_continuationMinTargetBufferPct.
- Structure overblock review rule: structure wait is overblock-review only when explicit reject or missing proof coexists with acceptable current RR, target buffer, and distance inside the structure review band.

## Latest Quality Gate Separation

| Symbol | Verdict | Quality Lane | Stage6 Reason | Lane Decision | Target Verdict | Target Viability | Zero-Exec Lane | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| none | none | none | none | none | none | none | none | none |

## Latest Review-Ready Rows

| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| CRMD | breakoutRetest | BREAKOUT_PROOF_CONFIRMED_PROMOTION_DISABLED | 90.00 | 72.83 | 3.80 | 17.73 | 72.14 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Keep WAIT_PRICE until a separate Stage6 producer policy change explicitly enables proof-confirmed promotion. |

## Latest Rows

| Symbol | Verdict | Lane | Formula Bottleneck | Severity | Formula Evidence | Stage6 Reason | Lane Decision | Promotion Policy | Blocked By | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| ASB | STRONG_BUY | riskGeometry | RISK_GEOMETRY_RECALCULATION_FORMULA | 8.71 | risk_geometry_expected_return_target_shortfall_pct:8.71>0.00 delta=8.71 pct_shortfall; knob=RISK_GEOMETRY_REQUIRED_TARGET_PRICE direction=RECALIBRATE_TARGET_OR_KEEP_NO_TRADE | blocked_stop_too_tight | STOP_GEOMETRY_RECALIBRATION_REQUIRED | N/A | none | 15.00 | 0.45 | 10.89 | 4.98 | VALID_GEOMETRY | RR_CURRENT_WEAK | Keep blocked until Stage6 emits valid stop recalibration evidence. |
| AUPH | BUY | targetNearCurrent | TARGET_RECALIBRATION_FORMULA | 29.22 | target_already_reached_required_target_shortfall_pct:29.22>0.00 delta=29.22 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | wait_target_near_current | TARGET_ALREADY_REACHED_NO_TRADE | N/A | none | 12.00 | N/A | 13.79 | -3.35 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Require fresh target/thesis recalibration before this can become executable. |
| CRMD | STRONG_BUY | breakoutRetest | BREAKOUT_PROOF_FORMULA | 2.00 | breakout_current_extension_excess_pct:21.56>8.00 delta=13.56 pct; knob=BREAKOUT_EXTENSION_POLICY direction=IMPROVE_PROOF_GENERATION_NOT_AUTO_PROMOTION | wait_breakout_retest_required | BREAKOUT_PROOF_CONFIRMED_PROMOTION_DISABLED | N/A | none | 90.00 | 3.80 | 17.73 | 72.14 | VALID_GEOMETRY | RR_CURRENT_ACCEPTABLE | Keep WAIT_PRICE until a separate Stage6 producer policy change explicitly enables proof-confirmed promotion. |
| DUOL | STRONG_BUY | riskGeometry | TARGET_RECALIBRATION_FORMULA | 44.54 | target_already_reached_required_target_shortfall_pct:44.54>0.00 delta=44.54 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | blocked_rr_below_min | RISK_GEOMETRY_INVALID_NO_TRADE | N/A | none | 4.00 | N/A | 21.03 | -16.80 | INVALID_OR_STALE_GEOMETRY | RR_CURRENT_TARGET_ALREADY_REACHED | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |
| TRIN | BUY | other | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0.00 | no_zero_executable_formula_bottleneck:0.00>0.00 delta=0.00 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | wait_weak_pillar_execution_gate | OUT_OF_SCOPE_FOR_POLICY_LANE | N/A | none | 16.00 | 0.51 | 10.35 | 5.95 | VALID_GEOMETRY | RR_CURRENT_WEAK | Use execution gate audit blocker class and sidecar-safe validation path. |

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

