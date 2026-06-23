# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-23T05:55:22.625Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json
- Hash: b149b044845b848196bfd08608b6e2f71ecca9634499ccea806a8c637259b49a
- Source SHA: 3b5c01c1bc52594b13d641f94624e1d36b6836ac
- Overall: **warn_formula_contract_missing_or_mismatch**
- Rows: 7
- Executable Rows: 2
- Contract Executable Picks: 2
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"weak_pillar_execution_gate":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"TARGET_RECALIBRATION":2,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1} |
| breakoutRetestProofConfirmedCounts | {"true":2,"false":5} |
| breakoutContinuationConfirmedCounts | {"false":6,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":2} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":3,"actual_stop_risk":4} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":7} |
| zeroExecutableFormulaBottleneckCounts | {"NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK":3,"TARGET_RECALIBRATION_FORMULA":2,"RISK_GEOMETRY_RECALCULATION_FORMULA":1,"BREAKOUT_PROOF_FORMULA":1} |
| formulaManifestContractIssues | 10 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| laneSpecificFormulaEvidenceIssues | 0 |
| blockerCategoryCounts | {"entry_distance":1,"risk_geometry":3,"target_recalibration":1,"other":1,"breakout":1} |
| rawExecutableDowngrades | [] |
| runtimeProof.status | pending_fresh_stage6_formula_v4_runtime_proof |
| guardrails.nextAction | generate_fresh_stage6_after_formula_v4_head |

## Runtime Proof Gate

| Check | Value |
| --- | --- |
| expectedContractVersion | zero_executable_formula_v4 |
| expectedSourceSha | N/A |
| sourceSha | 3b5c01c1bc52594b13d641f94624e1d36b6836ac |
| sourceShaMatchesExpected | N/A |
| formulaCoveragePass | true |
| requiredCoveragePass | true |
| formulaManifestIssues | 10 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| laneSpecificFormulaEvidenceIssues | 0 |
| nextAction | generate_fresh_stage6_after_formula_v4_head |
| enforceFreshContract | false |
| freshContractViolation | true |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 7/7 |
| breakoutRetestProofConfirmed | 7/7 |
| breakoutRetestProofContinuationConfirmed | 7/7 |
| breakoutRetestPromotionPolicyDecision | 7/7 |
| breakoutRetestPromotionBlockedBy | 7/7 |
| breakoutRetestProofFormulaEvidenceBasis | 7/7 |
| breakoutRetestProofFormulaObservedValue | 7/7 |
| breakoutRetestProofFormulaThresholdValue | 7/7 |
| breakoutRetestProofFormulaDeltaValue | 7/7 |
| breakoutRetestProofFormulaUnit | 7/7 |
| targetRecalibrationViabilityVerdict | 7/7 |
| targetRecalibrationRequiredTargetByBufferPrice | 7/7 |
| targetRecalibrationRequiredTargetByRrPrice | 7/7 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 7/7 |
| targetRecalibrationSourcePrice | 7/7 |
| targetRecalibrationSourceStopPrice | 7/7 |
| targetRecalibrationStopDistanceAtCurrent | 7/7 |
| targetRecalibrationRequiredTargetSource | 7/7 |
| targetRecalibrationFormulaEvidenceBasis | 7/7 |
| targetRecalibrationFormulaObservedValue | 7/7 |
| targetRecalibrationFormulaThresholdValue | 7/7 |
| targetRecalibrationFormulaDeltaValue | 7/7 |
| targetRecalibrationFormulaUnit | 7/7 |
| structurePolicyBlockerLane | 7/7 |
| structurePolicyFormulaEvidenceBasis | 7/7 |
| structurePolicyFormulaObservedValue | 7/7 |
| structurePolicyFormulaThresholdValue | 7/7 |
| structurePolicyFormulaDeltaValue | 7/7 |
| structurePolicyFormulaUnit | 7/7 |
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
| riskGeometryFormulaEvidenceBasis | 7/7 |
| riskGeometryFormulaObservedValue | 7/7 |
| riskGeometryFormulaThresholdValue | 7/7 |
| riskGeometryFormulaDeltaValue | 7/7 |
| riskGeometryFormulaUnit | 7/7 |
| qualityGateLane | 7/7 |
| qualityGatePolicyVerdict | 7/7 |
| zeroExecutableFormulaBottleneck | 7/7 |
| zeroExecutableFormulaSeverity | 7/7 |
| zeroExecutableTargetShortfallPct | 7/7 |
| zeroExecutableRiskTargetShortfallPct | 7/7 |
| zeroExecutableBreakoutProofGapCount | 7/7 |
| zeroExecutableStructureProofGapCount | 7/7 |
| zeroExecutableFormulaObservedValue | 7/7 |
| zeroExecutableFormulaThresholdValue | 7/7 |
| zeroExecutableFormulaDeltaValue | 7/7 |
| zeroExecutableFormulaUnit | 7/7 |
| zeroExecutableFormulaEvidenceBasis | 7/7 |
| zeroExecutableFormulaAdjustmentKnob | 7/7 |
| zeroExecutableFormulaAdjustmentDirection | 7/7 |
| zeroExecutableFormulaAdjustmentMagnitude | 7/7 |
| zeroExecutableFormulaAdjustmentRationale | 7/7 |
| zeroExecutableFormulaReasons | 7/7 |
| zeroExecutableFormulaRecommendedAction | 7/7 |
| currentEntryStructureSupportReference | 7/7 |
| currentEntryStructureSupportGapAtr | 7/7 |
| currentEntryStructureStopAlignedSupportGapAtr | 7/7 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Formula Bottleneck | Severity | Formula Evidence | Lane Formula Basis | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| ACAD | BUY | EXECUTABLE_NOW/executable_pullback | entry_distance | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0 | no_zero_executable_formula_bottleneck:0>0 delta=0 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | structure=not_structure_wait; breakout=breakout_proof_condition_gap_count; target=target_recalibration_not_required; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 22.969 | 26.585 | 31.443 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.36 | 5.3 | 41.93 |
| FFBC | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0 | no_zero_executable_formula_bottleneck:0>0 delta=0 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | structure=not_structure_wait; breakout=breakout_continuation_target_buffer_shortfall_pct; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 33.0527 | 33.4286 | 36.2617 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 4.17 |
| AUPH | BUY | WAIT_PRICE/wait_target_near_current | target_recalibration | N/A | N/A | TARGET_RECALIBRATION | TARGET_RECALIBRATION_FORMULA | 29.22 | target_already_reached_required_target_shortfall_pct:29.22>0 delta=29.22 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 18.1177 | 24.019 | 19.7008 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -13.71 | 13.71 | N/A | 13.79 | -3.35 |
| DUOL | STRONG_BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | N/A | TARGET_RECALIBRATION | TARGET_RECALIBRATION_FORMULA | 44.54 | target_already_reached_required_target_shortfall_pct:44.54>0 delta=44.54 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 131.6134 | 191.706 | 132.8912 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -20 | 20 | N/A | 21.03 | -16.8 |
| TRIN | BUY | WAIT_PRICE/wait_weak_pillar_execution_gate | other | weak_pillar_execution_gate | QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT | NO_ZERO_EXECUTABLE_TUNING_ACTION | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0 | no_zero_executable_formula_bottleneck:0>0 delta=0 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 17.4173 | 20.8663 | 19.6156 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.51 | 10.35 | 5.95 |
| ASB | STRONG_BUY | BLOCKED_RISK/blocked_stop_too_tight | risk_geometry | N/A | N/A | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | RISK_GEOMETRY_RECALCULATION_FORMULA | 8.71 | risk_geometry_expected_return_target_shortfall_pct:8.71>0 delta=8.71 pct_shortfall; knob=RISK_GEOMETRY_REQUIRED_TARGET_PRICE direction=RECALIBRATE_TARGET_OR_KEEP_NO_TRADE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 30.4159 | 36.033 | 33.9595 | expected_return | RISK_GEOMETRY_PROOF_INCOMPLETE | false | target=true,stop=true,dist=true,rr=true,buf=true | -8.71 | 8.71 | 0.45 | 10.89 | 4.98 |
| CRMD | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | BREAKOUT_PROOF_FORMULA | 2 | breakout_current_extension_excess_pct:21.56>8 delta=13.56 pct; knob=BREAKOUT_EXTENSION_POLICY direction=IMPROVE_PROOF_GENERATION_NOT_AUTO_PROMOTION | structure=not_structure_wait; breakout=breakout_current_extension_excess_pct; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | true | WAIT_CONSERVATIVE_DEFAULT | proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 9.0949 | 12.1798 | 16.777 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 3.8 | 17.73 | 72.14 |

## Track Separation

- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact predates the formula-bottleneck contract or the producer failed to emit it. Treat that as a fresh-hash verification gap, not a sidecar problem.
- `warn_formula_contract_missing_or_mismatch` means rows may expose formula fields, but the artifact manifest does not publish the formula tuning contract version/rules.
- `warn_formula_bottleneck_lane_mismatch` means a row has formula fields, but the formula bottleneck contradicts its zero-executable tuning lane. Fix Stage6 producer mapping before tuning thresholds.
- `warn_formula_bottleneck_evidence_weak` means the formula bottleneck lane is present, but its numeric/proof evidence is too weak to support tuning.
- `warn_lane_specific_formula_evidence_mismatch` means the row has generic zero-executable formula fields, but the structure/breakout/target/risk lane-specific formula fields are missing or disagree with the primary formula basis.
- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
