# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-07-06T15:08:21.816Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Hash: ea95063da8d317a9815b98329be26842853ee1678e4db93f385192ac61d12a49
- Source SHA: d070335291d1045b733319b41ae80766a2c04cb4
- Overall: **pass_executable_present_focus_fields_ok**
- Rows: 7
- Executable Rows: 1
- Contract Executable Picks: 1
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"weak_pillar_execution_gate":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":2,"TARGET_RECALIBRATION":2,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":1} |
| zeroExecutableSecondaryTuningLaneCounts | {"none":5,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":2} |
| zeroExecutableBlockerCategoryCounts | {"risk_geometry":4,"structure":1,"breakout":1,"quality_gate":1} |
| zeroExecutableTuningRelationshipCounts | {"not_zero_executable_policy_lane":2,"target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh":2,"structure_wait_requires_proof_not_gate_relaxation":1,"review_ready_waits_for_proof_confirmed":1,"risk_geometry_primary":1} |
| breakoutRetestProofConfirmedCounts | {"true":1,"false":6} |
| breakoutContinuationConfirmedCounts | {"false":7} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":2} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":2,"actual_stop_risk":5} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":7} |
| zeroExecutableFormulaBottleneckCounts | {"NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK":2,"TARGET_RECALIBRATION_FORMULA":2,"STRUCTURE_PROOF_FORMULA":1,"BREAKOUT_PROOF_FORMULA":1,"RISK_GEOMETRY_RECALCULATION_FORMULA":1} |
| formulaManifestContractIssues | 0 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| formulaEvidenceIssueReasonCounts | {} |
| formulaEvidenceIssueLaneCounts | {} |
| laneSpecificFormulaEvidenceIssues | 0 |
| laneSpecificFormulaEvidenceIssueReasonCounts | {} |
| laneSpecificFormulaEvidenceIssueLaneCounts | {} |
| blockerCategoryCounts | {"risk_geometry":3,"target_recalibration":1,"structure":1,"breakout":1,"quality_gate":1} |
| rawExecutableDowngrades | [] |
| runtimeProof.status | pass_formula_v4_runtime_proof |
| guardrails.nextAction | monitor_next_sidecar_fresh_hash_consumption |

## Runtime Proof Gate

| Check | Value |
| --- | --- |
| expectedContractVersion | zero_executable_formula_v4 |
| expectedSourceSha | N/A |
| sourceSha | d070335291d1045b733319b41ae80766a2c04cb4 |
| sourceShaMatchesExpected | N/A |
| formulaCoveragePass | true |
| requiredCoveragePass | true |
| formulaManifestIssues | 0 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| laneSpecificFormulaEvidenceIssues | 0 |
| nextAction | monitor_next_sidecar_fresh_hash_consumption |
| enforceFreshContract | false |
| freshContractViolation | false |

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

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Secondary Lane | Zero-Exec Category | Relationship | Formula Bottleneck | Severity | Formula Evidence | Lane Formula Basis | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| GOOG | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | risk_geometry | not_zero_executable_policy_lane | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0 | no_zero_executable_formula_bottleneck:0>0 delta=0 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | structure=not_structure_wait; breakout=breakout_continuation_rr_shortfall; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 357.1628 | 426.6184 | 468.126 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 23.03 |
| AUPH | BUY | WAIT_PRICE/wait_target_near_current | target_recalibration | N/A | N/A | TARGET_RECALIBRATION | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | risk_geometry | target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh | TARGET_RECALIBRATION_FORMULA | 29.57 | target_already_reached_required_target_shortfall_pct:29.57>0 delta=29.57 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 18.1589 | 24.139 | 19.7456 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -13.9 | 13.9 | N/A | 13.99 | -3.57 |
| DAVE | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | structure | structure_wait_requires_proof_not_gate_relaxation | STRUCTURE_PROOF_FORMULA | 7 | structure_distance_excess:33.43>8 delta=25.43 pct; knob=CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND direction=IMPROVE_STRUCTURE_PROOF_NOT_RELAX_GATE | structure=structure_distance_excess; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 325.8508 | 545.974 | 468.2128 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.17 | 33.43 | 6.12 |
| DUOL | BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | N/A | TARGET_RECALIBRATION | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | risk_geometry | target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh | TARGET_RECALIBRATION_FORMULA | 47.07 | target_already_reached_required_target_shortfall_pct:47.07>0 delta=47.07 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 134.7549 | 200.856 | 136.0632 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -21.87 | 21.87 | N/A | 22.88 | -18.74 |
| ZVRA | BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | N/A | breakout | review_ready_waits_for_proof_confirmed | BREAKOUT_PROOF_FORMULA | 4 | breakout_current_extension_excess_pct:24.73>8 delta=16.73 pct; knob=BREAKOUT_EXTENSION_POLICY direction=IMPROVE_PROOF_GENERATION_NOT_AUTO_PROMOTION | structure=not_structure_wait; breakout=breakout_current_extension_excess_pct; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | false | WAIT_REVIEW_READY_ONLY | proof_not_confirmed, current_stop_distance_outside_policy, proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 13.2973 | 20.185 | 28.2729 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.12 | 19.83 | 116.03 |
| TRIN | BUY | WAIT_PRICE/wait_weak_pillar_execution_gate | quality_gate | weak_pillar_execution_gate | QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | quality_gate | not_zero_executable_policy_lane | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0 | no_zero_executable_formula_bottleneck:0>0 delta=0 none; knob=NONE direction=NO_ADJUSTMENT_REQUIRED | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 17.4791 | 21.0463 | 19.6852 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.46 | 10.67 | 5.58 |
| ASB | BUY | BLOCKED_RISK/blocked_stop_too_tight | risk_geometry | N/A | N/A | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | N/A | risk_geometry | risk_geometry_primary | RISK_GEOMETRY_RECALCULATION_FORMULA | 9.3 | risk_geometry_expected_return_target_shortfall_pct:9.3>0 delta=9.3 pct_shortfall; knob=RISK_GEOMETRY_REQUIRED_TARGET_PRICE direction=RECALIBRATE_TARGET_OR_KEEP_NO_TRADE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 30.6116 | 36.603 | 34.178 | expected_return | RISK_GEOMETRY_PROOF_INCOMPLETE | false | target=true,stop=true,dist=true,rr=true,buf=true | -9.3 | 9.3 | 0.37 | 11.46 | 4.31 |

## Track Separation

- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact predates the formula-bottleneck contract or the producer failed to emit it. Treat that as a fresh-hash verification gap, not a sidecar problem.
- `warn_formula_contract_missing_or_mismatch` means rows may expose formula fields, but the artifact manifest does not publish the formula tuning contract version/rules.
- `warn_formula_bottleneck_lane_mismatch` means a row has formula fields, but the formula bottleneck contradicts its zero-executable tuning lane. Fix Stage6 producer mapping before tuning thresholds.
- `warn_formula_bottleneck_evidence_weak` means the formula bottleneck lane is present, but its numeric/proof evidence is too weak to support tuning.
- `warn_lane_specific_formula_evidence_mismatch` means the row has generic zero-executable formula fields, but the structure/breakout/target/risk lane-specific formula fields are missing or disagree with the primary formula basis.
- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
