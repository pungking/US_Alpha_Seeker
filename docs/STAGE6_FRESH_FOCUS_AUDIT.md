# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-20T21:57:56.276Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_09-26-37.json
- Hash: ef8e15fc14518dbf513479899161038a94278d42917a3e698cea69eddc3af71a
- Overall: **warn_formula_bottleneck_fields_missing**
- Rows: 7
- Executable Rows: 3
- Contract Executable Picks: 3
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"TARGET_RECALIBRATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":2} |
| breakoutRetestProofConfirmedCounts | {"true":4,"false":3} |
| breakoutContinuationConfirmedCounts | {"false":6,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":6,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":5,"actual_stop_risk":2} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":7} |
| zeroExecutableFormulaBottleneckCounts | {"missing":7} |
| formulaManifestContractIssues | 1 |
| formulaLaneConsistencyIssues | 7 |
| formulaEvidenceQualityIssues | 7 |
| laneSpecificFormulaEvidenceIssues | 4 |
| blockerCategoryCounts | {"risk_geometry":3,"entry_distance":1,"structure":1,"breakout":2} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 7/7 |
| breakoutRetestProofConfirmed | 7/7 |
| breakoutRetestProofContinuationConfirmed | 7/7 |
| breakoutRetestPromotionPolicyDecision | 7/7 |
| breakoutRetestPromotionBlockedBy | 7/7 |
| breakoutRetestProofFormulaEvidenceBasis | 0/7 |
| breakoutRetestProofFormulaObservedValue | 0/7 |
| breakoutRetestProofFormulaThresholdValue | 0/7 |
| breakoutRetestProofFormulaDeltaValue | 0/7 |
| breakoutRetestProofFormulaUnit | 0/7 |
| targetRecalibrationViabilityVerdict | 7/7 |
| targetRecalibrationRequiredTargetByBufferPrice | 7/7 |
| targetRecalibrationRequiredTargetByRrPrice | 7/7 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 7/7 |
| targetRecalibrationSourcePrice | 7/7 |
| targetRecalibrationSourceStopPrice | 7/7 |
| targetRecalibrationStopDistanceAtCurrent | 7/7 |
| targetRecalibrationRequiredTargetSource | 7/7 |
| targetRecalibrationFormulaEvidenceBasis | 0/7 |
| targetRecalibrationFormulaObservedValue | 0/7 |
| targetRecalibrationFormulaThresholdValue | 0/7 |
| targetRecalibrationFormulaDeltaValue | 0/7 |
| targetRecalibrationFormulaUnit | 0/7 |
| structurePolicyBlockerLane | 7/7 |
| structurePolicyFormulaEvidenceBasis | 0/7 |
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
| riskGeometryFormulaEvidenceBasis | 0/7 |
| riskGeometryFormulaObservedValue | 0/7 |
| riskGeometryFormulaThresholdValue | 0/7 |
| riskGeometryFormulaDeltaValue | 0/7 |
| riskGeometryFormulaUnit | 0/7 |
| qualityGateLane | 7/7 |
| qualityGatePolicyVerdict | 7/7 |
| zeroExecutableFormulaBottleneck | 0/7 |
| zeroExecutableFormulaSeverity | 0/7 |
| zeroExecutableTargetShortfallPct | 0/7 |
| zeroExecutableRiskTargetShortfallPct | 0/7 |
| zeroExecutableBreakoutProofGapCount | 0/7 |
| zeroExecutableStructureProofGapCount | 0/7 |
| zeroExecutableFormulaObservedValue | 0/7 |
| zeroExecutableFormulaThresholdValue | 0/7 |
| zeroExecutableFormulaDeltaValue | 0/7 |
| zeroExecutableFormulaUnit | 0/7 |
| zeroExecutableFormulaEvidenceBasis | 0/7 |
| zeroExecutableFormulaAdjustmentKnob | 0/7 |
| zeroExecutableFormulaAdjustmentDirection | 0/7 |
| zeroExecutableFormulaAdjustmentMagnitude | 0/7 |
| zeroExecutableFormulaAdjustmentRationale | 0/7 |
| zeroExecutableFormulaReasons | 0/7 |
| zeroExecutableFormulaRecommendedAction | 0/7 |
| currentEntryStructureSupportReference | 7/7 |
| currentEntryStructureSupportGapAtr | 7/7 |
| currentEntryStructureStopAlignedSupportGapAtr | 7/7 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Formula Bottleneck | Severity | Formula Evidence | Lane Formula Basis | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| LIF | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 50.4906 | 60.7944 | 71.079 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 24.02 |
| IDCC | STRONG_BUY | EXECUTABLE_NOW/executable_pullback | entry_distance | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 304.9212 | 412.316 | 461.8224 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2.87 | 2.67 | 56.29 |
| ANET | BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | true | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 174.7601 | 190.0882 | 234.1446 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2 | 0 | 12.03 |
| AUPH | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.9538 | 20.475 | 18.929 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.27 | 10.6 | 3.28 |
| DUOL | BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | N/A | TARGET_RECALIBRATION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 129.3268 | 184.634 | 130.5824 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -18.59 | 18.59 | N/A | 19.64 | -15.33 |
| ZVRA | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | false | WAIT_REVIEW_READY_ONLY | proof_not_confirmed, current_stop_distance_outside_policy, proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 13.287 | 20.161 | 30.444 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.13 | 19.77 | 116.19 |
| CRMD | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | N/A | N/A | missing:N/A>N/A delta=N/A ; knob=missing direction=missing | structure=N/A; breakout=N/A; target=N/A; risk=N/A | not_applicable | rr=false,buf=false,dist=false | true | WAIT_CONSERVATIVE_DEFAULT | proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 8.9301 | 11.6998 | 18.1203 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 4.31 | 16.22 | 75.32 |

## Track Separation

- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact predates the formula-bottleneck contract or the producer failed to emit it. Treat that as a fresh-hash verification gap, not a sidecar problem.
- `warn_formula_contract_missing_or_mismatch` means rows may expose formula fields, but the artifact manifest does not publish the formula tuning contract version/rules.
- `warn_formula_bottleneck_lane_mismatch` means a row has formula fields, but the formula bottleneck contradicts its zero-executable tuning lane. Fix Stage6 producer mapping before tuning thresholds.
- `warn_formula_bottleneck_evidence_weak` means the formula bottleneck lane is present, but its numeric/proof evidence is too weak to support tuning.
- `warn_lane_specific_formula_evidence_mismatch` means the row has generic zero-executable formula fields, but the structure/breakout/target/risk lane-specific formula fields are missing or disagree with the primary formula basis.
- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
