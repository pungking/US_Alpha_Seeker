# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-19T17:05:50.240Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Hash: 2ea6fd5b26acbe89c2334543e1a94c10f9629c2b9e7904e353cfebfc0342d207
- Overall: **pass_executable_present_focus_fields_ok**
- Rows: 7
- Executable Rows: 2
- Contract Executable Picks: 2
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"earnings_data_missing_quality_floor":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":2,"BREAKOUT_PROOF_CONFIRMED_GENERATION":2} |
| breakoutRetestProofConfirmedCounts | {"true":2,"false":5} |
| breakoutContinuationConfirmedCounts | {"false":6,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":7} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":5,"actual_stop_risk":2} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":7} |
| blockerCategoryCounts | {"entry_distance":1,"risk_geometry":1,"quality_gate":1,"structure":2,"breakout":2} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 7/7 |
| breakoutRetestProofConfirmed | 7/7 |
| breakoutRetestProofContinuationConfirmed | 7/7 |
| breakoutRetestPromotionPolicyDecision | 7/7 |
| breakoutRetestPromotionBlockedBy | 7/7 |
| targetRecalibrationViabilityVerdict | 7/7 |
| targetRecalibrationRequiredTargetByBufferPrice | 7/7 |
| targetRecalibrationRequiredTargetByRrPrice | 7/7 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 7/7 |
| targetRecalibrationSourcePrice | 7/7 |
| targetRecalibrationSourceStopPrice | 7/7 |
| targetRecalibrationStopDistanceAtCurrent | 7/7 |
| targetRecalibrationRequiredTargetSource | 7/7 |
| structurePolicyBlockerLane | 7/7 |
| structurePolicyCurrentRrOk | 7/7 |
| structurePolicyTargetBufferOk | 7/7 |
| structurePolicyDistanceWithinReviewBand | 7/7 |
| riskGeometryRequiredTargetByStopPrice | 7/7 |
| riskGeometryRequiredTargetByBufferPrice | 7/7 |
| riskGeometryRequiredTargetByExpectedReturnPrice | 7/7 |
| riskGeometryRequiredTargetSource | 7/7 |
| riskGeometryTargetGapPct | 7/7 |
| riskGeometryTargetShortfallPct | 7/7 |
| riskGeometryTargetAboveCurrent | 7/7 |
| riskGeometryRequiredStopValid | 7/7 |
| riskGeometryRequiredStopDistanceValid | 7/7 |
| riskGeometryRecalculatedStopRrOk | 7/7 |
| riskGeometryTargetBufferOk | 7/7 |
| riskGeometryRepairLane | 7/7 |
| riskGeometryProofConfirmed | 7/7 |
| qualityGateLane | 7/7 |
| qualityGatePolicyVerdict | 7/7 |
| currentEntryStructureSupportReference | 7/7 |
| currentEntryStructureSupportGapAtr | 7/7 |
| currentEntryStructureStopAlignedSupportGapAtr | 7/7 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| IDCC | BUY | EXECUTABLE_NOW/executable_pullback | entry_distance | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 304.9624 | 412.436 | 461.8848 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2.86 | 2.69 | 56.26 |
| ANET | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 174.791 | 190.0882 | 234.186 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 12.01 |
| WSBC | BUY | WAIT_PRICE/wait_earnings_data_missing_quality_floor | quality_gate | earnings_data_missing_quality_floor | QUALITY_GATE_EARNINGS_DATA_COVERAGE_REQUIRED | NO_ZERO_EXECUTABLE_TUNING_ACTION | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 37.3993 | 39.25 | 41.7565 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 8.1 |
| AUPH | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.9744 | 20.535 | 18.952 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.26 | 10.71 | 3.16 |
| ZVRA | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | not_applicable | rr=false,buf=false,dist=false | false | WAIT_REVIEW_READY_ONLY | proof_not_confirmed, current_stop_distance_outside_policy, proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 13.3076 | 20.221 | 30.4912 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.1 | 19.89 | 115.86 |
| CRMD | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | not_applicable | rr=false,buf=false,dist=false | true | WAIT_CONSERVATIVE_DEFAULT | proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 8.9507 | 11.7598 | 18.1621 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.24 | 16.41 | 74.91 |
| ATEX | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 76.7865 | 124.1626 | 111.0795 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.22 | 32.26 | 7.31 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
