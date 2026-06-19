# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-19T13:55:34.058Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-19_22-40-48.json
- Hash: bc5b6cafebe8f657fc7a402cb34cd7e0a1291c5591fa062d600ab8ff41773cb6
- Overall: **pass_executable_present_focus_fields_ok**
- Rows: 9
- Executable Rows: 5
- Contract Executable Picks: 5
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":5,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"TARGET_RECALIBRATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":2} |
| breakoutRetestProofConfirmedCounts | {"false":6,"true":3} |
| breakoutContinuationConfirmedCounts | {"false":8,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":8,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":7,"actual_stop_risk":2} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":9} |
| blockerCategoryCounts | {"risk_geometry":4,"entry_distance":2,"structure":1,"breakout":2} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 9/9 |
| breakoutRetestProofConfirmed | 9/9 |
| breakoutRetestProofContinuationConfirmed | 9/9 |
| breakoutRetestPromotionPolicyDecision | 9/9 |
| breakoutRetestPromotionBlockedBy | 9/9 |
| targetRecalibrationViabilityVerdict | 9/9 |
| targetRecalibrationRequiredTargetByBufferPrice | 9/9 |
| targetRecalibrationRequiredTargetByRrPrice | 9/9 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 9/9 |
| targetRecalibrationSourcePrice | 9/9 |
| targetRecalibrationSourceStopPrice | 9/9 |
| targetRecalibrationStopDistanceAtCurrent | 9/9 |
| targetRecalibrationRequiredTargetSource | 9/9 |
| structurePolicyBlockerLane | 9/9 |
| structurePolicyCurrentRrOk | 9/9 |
| structurePolicyTargetBufferOk | 9/9 |
| structurePolicyDistanceWithinReviewBand | 9/9 |
| riskGeometryRequiredTargetByStopPrice | 9/9 |
| riskGeometryRequiredTargetByBufferPrice | 9/9 |
| riskGeometryRequiredTargetByExpectedReturnPrice | 9/9 |
| riskGeometryRequiredTargetSource | 9/9 |
| riskGeometryTargetGapPct | 9/9 |
| riskGeometryTargetShortfallPct | 9/9 |
| riskGeometryTargetAboveCurrent | 9/9 |
| riskGeometryRequiredStopValid | 9/9 |
| riskGeometryRequiredStopDistanceValid | 9/9 |
| riskGeometryRecalculatedStopRrOk | 9/9 |
| riskGeometryTargetBufferOk | 9/9 |
| riskGeometryRepairLane | 9/9 |
| riskGeometryProofConfirmed | 9/9 |
| qualityGateLane | 9/9 |
| qualityGatePolicyVerdict | 9/9 |
| currentEntryStructureSupportReference | 9/9 |
| currentEntryStructureSupportGapAtr | 9/9 |
| currentEntryStructureStopAlignedSupportGapAtr | 9/9 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| LIF | STRONG_BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 50.5112 | 60.7944 | 71.108 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 23.97 |
| IDCC | STRONG_BUY | EXECUTABLE_NOW/executable_pullback | entry_distance | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 304.9624 | 412.436 | 461.8848 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2.86 | 2.69 | 56.26 |
| ANET | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 174.791 | 190.0882 | 234.186 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 12.01 |
| ACAD | STRONG_BUY | EXECUTABLE_NOW/executable_pullback | entry_distance | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 22.2892 | 25.355 | 32.46 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 5.39 | 2.42 | 46.26 |
| GNTX | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 26.7491 | 29.3334 | 33.761 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 12.95 |
| AUPH | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.9744 | 20.535 | 18.952 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.26 | 10.71 | 3.16 |
| DUOL | BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | N/A | TARGET_RECALIBRATION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 129.3577 | 184.724 | 130.6136 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -18.6 | 18.6 | N/A | 19.66 | -15.35 |
| ZVRA | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | not_applicable | rr=false,buf=false,dist=false | false | WAIT_REVIEW_READY_ONLY | proof_not_confirmed, current_stop_distance_outside_policy, proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 13.3076 | 20.221 | 30.4912 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.1 | 19.89 | 115.86 |
| CRMD | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | not_applicable | rr=false,buf=false,dist=false | true | WAIT_CONSERVATIVE_DEFAULT | proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 8.9507 | 11.7598 | 18.1621 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.24 | 16.41 | 74.91 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
