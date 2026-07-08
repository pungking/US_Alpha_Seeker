# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-07-08T14:36:02.154Z
- Stage6: STAGE6_ALPHA_FINAL_2026-07-08_23-21-56.json
- Hash: 2db967e72ee520a3a5bbcea387f53118f385c59418602c440e066eefa21cb8cc
- Source SHA: c9d8b8965dc29558203dbf7d88b9a5bdcf355874
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Contract Executable Picks: 0
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {} |
| zeroExecutableTuningLaneCounts | {"BREAKOUT_PROOF_CONFIRMED_GENERATION":1,"TARGET_RECALIBRATION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":2} |
| zeroExecutableSecondaryTuningLaneCounts | {"none":3,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":3} |
| zeroExecutableBlockerCategoryCounts | {"breakout":1,"risk_geometry":3,"structure":2} |
| zeroExecutableTuningRelationshipCounts | {"review_ready_waits_for_proof_confirmed":1,"target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh":3,"structure_wait_requires_proof_not_gate_relaxation":2} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| breakoutContinuationConfirmedCounts | {"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":3,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":3} |
| targetRecalibrationRequiredTargetSourceCounts | {"expected_return_and_actual_stop_risk":2,"actual_stop_risk":4} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":6} |
| zeroExecutableFormulaBottleneckCounts | {"BREAKOUT_PROOF_FORMULA":1,"TARGET_RECALIBRATION_FORMULA":3,"STRUCTURE_PROOF_FORMULA":2} |
| formulaManifestContractIssues | 0 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| formulaEvidenceIssueReasonCounts | {} |
| formulaEvidenceIssueLaneCounts | {} |
| laneSpecificFormulaEvidenceIssues | 0 |
| laneSpecificFormulaEvidenceIssueReasonCounts | {} |
| laneSpecificFormulaEvidenceIssueLaneCounts | {} |
| blockerCategoryCounts | {"breakout":1,"target_recalibration":2,"structure":2,"risk_geometry":1} |
| rawExecutableDowngrades | [] |
| runtimeProof.status | pass_formula_v4_runtime_proof |
| guardrails.nextAction | tune_stage6_target_risk_breakout_formulas |

## Runtime Proof Gate

| Check | Value |
| --- | --- |
| expectedContractVersion | zero_executable_formula_v4 |
| expectedSourceSha | N/A |
| sourceSha | c9d8b8965dc29558203dbf7d88b9a5bdcf355874 |
| sourceShaMatchesExpected | N/A |
| formulaCoveragePass | true |
| requiredCoveragePass | true |
| formulaManifestIssues | 0 |
| formulaLaneConsistencyIssues | 0 |
| formulaEvidenceQualityIssues | 0 |
| laneSpecificFormulaEvidenceIssues | 0 |
| nextAction | tune_stage6_target_risk_breakout_formulas |
| enforceFreshContract | true |
| freshContractViolation | false |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 6/6 |
| breakoutRetestPromotionPolicyDecision | 6/6 |
| breakoutRetestPromotionBlockedBy | 6/6 |
| breakoutRetestProofFormulaEvidenceBasis | 6/6 |
| breakoutRetestProofFormulaObservedValue | 6/6 |
| breakoutRetestProofFormulaThresholdValue | 6/6 |
| breakoutRetestProofFormulaDeltaValue | 6/6 |
| breakoutRetestProofFormulaUnit | 6/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetByBufferPrice | 6/6 |
| targetRecalibrationRequiredTargetByRrPrice | 6/6 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 6/6 |
| targetRecalibrationSourcePrice | 6/6 |
| targetRecalibrationSourceStopPrice | 6/6 |
| targetRecalibrationStopDistanceAtCurrent | 6/6 |
| targetRecalibrationRequiredTargetSource | 6/6 |
| targetRecalibrationFormulaEvidenceBasis | 6/6 |
| targetRecalibrationFormulaObservedValue | 6/6 |
| targetRecalibrationFormulaThresholdValue | 6/6 |
| targetRecalibrationFormulaDeltaValue | 6/6 |
| targetRecalibrationFormulaUnit | 6/6 |
| structurePolicyBlockerLane | 6/6 |
| structurePolicyFormulaEvidenceBasis | 6/6 |
| structurePolicyFormulaObservedValue | 6/6 |
| structurePolicyFormulaThresholdValue | 6/6 |
| structurePolicyFormulaDeltaValue | 6/6 |
| structurePolicyFormulaUnit | 6/6 |
| structurePolicyCurrentRrOk | 6/6 |
| structurePolicyTargetBufferOk | 6/6 |
| structurePolicyDistanceWithinReviewBand | 6/6 |
| riskGeometryRequiredTargetByStopPrice | 6/6 |
| riskGeometryRequiredTargetByBufferPrice | 6/6 |
| riskGeometryRequiredTargetByExpectedReturnPrice | 6/6 |
| riskGeometryRequiredTargetSource | 6/6 |
| riskGeometryTargetGapPct | 6/6 |
| riskGeometryTargetShortfallPct | 6/6 |
| riskGeometryTargetAboveCurrent | 6/6 |
| riskGeometryRequiredStopValid | 6/6 |
| riskGeometryRequiredStopDistanceValid | 6/6 |
| riskGeometryRecalculatedStopRrOk | 6/6 |
| riskGeometryTargetBufferOk | 6/6 |
| riskGeometryRepairLane | 6/6 |
| riskGeometryProofConfirmed | 6/6 |
| riskGeometryFormulaEvidenceBasis | 6/6 |
| riskGeometryFormulaObservedValue | 6/6 |
| riskGeometryFormulaThresholdValue | 6/6 |
| riskGeometryFormulaDeltaValue | 6/6 |
| riskGeometryFormulaUnit | 6/6 |
| qualityGateLane | 6/6 |
| qualityGatePolicyVerdict | 6/6 |
| zeroExecutableFormulaBottleneck | 6/6 |
| zeroExecutableFormulaSeverity | 6/6 |
| zeroExecutableTargetShortfallPct | 6/6 |
| zeroExecutableRiskTargetShortfallPct | 6/6 |
| zeroExecutableBreakoutProofGapCount | 6/6 |
| zeroExecutableStructureProofGapCount | 6/6 |
| zeroExecutableFormulaObservedValue | 6/6 |
| zeroExecutableFormulaThresholdValue | 6/6 |
| zeroExecutableFormulaDeltaValue | 6/6 |
| zeroExecutableFormulaUnit | 6/6 |
| zeroExecutableFormulaEvidenceBasis | 6/6 |
| zeroExecutableFormulaAdjustmentKnob | 6/6 |
| zeroExecutableFormulaAdjustmentDirection | 6/6 |
| zeroExecutableFormulaAdjustmentMagnitude | 6/6 |
| zeroExecutableFormulaAdjustmentRationale | 6/6 |
| zeroExecutableFormulaReasons | 6/6 |
| zeroExecutableFormulaRecommendedAction | 6/6 |
| zeroExecutableFormulaBlockedBy | 6/6 |
| zeroExecutableFormulaNextAction | 6/6 |
| zeroExecutableFormulaDoneWhenEvidence | 6/6 |
| currentEntryStructureSupportReference | 6/6 |
| currentEntryStructureSupportGapAtr | 6/6 |
| currentEntryStructureStopAlignedSupportGapAtr | 6/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Secondary Lane | Zero-Exec Category | Relationship | Formula Bottleneck | Severity | Formula Evidence | Lane Formula Basis | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| ZVRA | STRONG_BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | N/A | breakout | review_ready_waits_for_proof_confirmed | BREAKOUT_PROOF_FORMULA | 6 | breakout_current_extension_excess_pct:33.85>8 delta=25.85 pct; knob=BREAKOUT_RETEST_FRESHNESS_WINDOW direction=IMPROVE_PROOF_GENERATION_NOT_AUTO_PROMOTION | structure=not_structure_wait; breakout=breakout_current_extension_excess_pct; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | not_applicable | rr=false,buf=false,dist=false | false | WAIT_REVIEW_READY_ONLY | proof_not_confirmed, current_stop_distance_outside_policy, proof_confirmed_promotion_flag_disabled | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 15.0174 | 24.098 | 34.4088 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 2.8 | 25.29 | 91.28 |
| ALL | BUY | WAIT_PRICE/wait_target_near_current | target_recalibration | N/A | N/A | TARGET_RECALIBRATION | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | risk_geometry | target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh | TARGET_RECALIBRATION_FORMULA | 26.69 | target_already_reached_required_target_shortfall_pct:26.69>0 delta=26.69 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 258.3755 | 335.511 | 283.4605 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -13.23 | 13.23 | N/A | 12.87 | -1.95 |
| DUOL | STRONG_BUY | BLOCKED_RISK/blocked_target_too_close | target_recalibration | N/A | N/A | TARGET_RECALIBRATION | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | risk_geometry | target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh | TARGET_RECALIBRATION_FORMULA | 44.3 | target_already_reached_required_target_shortfall_pct:44.3>0 delta=44.3 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_target_buffer_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 132.9421 | 190.869 | 131.6514 | target_buffer | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -20.03 | 20.03 | N/A | 19.9 | -17.63 |
| GRND | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | structure | structure_wait_requires_proof_not_gate_relaxation | STRUCTURE_PROOF_FORMULA | 7 | structure_distance_excess:23.64>8 delta=15.64 pct; knob=CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND direction=IMPROVE_STRUCTURE_PROOF_NOT_RELAX_GATE | structure=structure_distance_excess; breakout=breakout_retest_input_gap; target=target_required_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.3049 | 27.982 | 23.5867 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.49 | 23.64 | 18.76 |
| SGHC | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | structure | structure_wait_requires_proof_not_gate_relaxation | STRUCTURE_PROOF_FORMULA | 7 | structure_distance_excess:24.24>8 delta=16.24 pct; knob=CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND direction=IMPROVE_STRUCTURE_PROOF_NOT_RELAX_GATE | structure=structure_distance_excess; breakout=breakout_retest_input_gap; target=target_required_expected_return_and_actual_stop_risk_shortfall_pct; risk=risk_geometry_not_applicable | STRUCTURE_CURRENT_RR_WEAK | rr=false,buf=true,dist=false | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 15.5736 | 22.7939 | 22.9824 | N/A | not_applicable | false | target=false,stop=false,dist=false,rr=false,buf=false | N/A | N/A | 0.78 | 24.24 | 19.87 |
| INCY | STRONG_BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | N/A | TARGET_RECALIBRATION | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | risk_geometry | target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh | TARGET_RECALIBRATION_FORMULA | 33.73 | target_already_reached_required_target_shortfall_pct:33.73>0 delta=33.73 pct_shortfall; knob=TARGET_RECALIBRATION_SOURCE_REFRESH direction=NO_TRADE_UNTIL_FRESH_TARGET_SOURCE | structure=not_structure_wait; breakout=breakout_retest_input_gap; target=target_already_reached_required_target_shortfall_pct; risk=risk_geometry_expected_return_target_shortfall_pct | not_applicable | rr=false,buf=false,dist=false | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 120.7778 | 168.172 | 128.986 | expected_return | TARGET_NO_TRADE | false | target=false,stop=false,dist=false,rr=false,buf=false | -13.59 | 13.59 | N/A | 14.72 | -4.95 |

## TradingCodex Field Ownership

Fresh-focus rows are Research Package evidence. They are not Approval Package evidence and do not authorize broker mutation.

| Field | Specialist Owner | Decision Package Slot | mRNA Transcript Meaning |
| --- | --- | --- | --- |
| zeroExecutableTuningLane | Formula Evidence Analyst | Research Package.evidence.zeroExecutableTuningLane | Dominant temporary strategy-transcript lane for producer tuning. |
| qualityGateLane | Alpha Policy Analyst | Research Package.evidence.qualityGateLane | Non-actionable verdict, weak pillar, event, earnings, or coverage gate. |
| structurePolicyBlockerLane | Structure Analyst | Research Package.evidence.structurePolicyBlockerLane | Structure proof gap; improve proof generation rather than relaxing filters. |
| riskGeometryRepairLane | Alpha Policy Analyst | Research Package.evidence.riskGeometryRepairLane | Target/stop recalculation or no-trade lane; not a sidecar reprice instruction. |
| targetRecalibrationViabilityVerdict | Alpha Policy Analyst | Research Package.evidence.targetRecalibrationViabilityVerdict | Target refresh viability or no-trade confirmation. |
| breakoutRetestProofConfirmed | Structure Analyst / Alpha Policy Analyst | Research Package.evidence.breakoutRetestProofConfirmed | Breakout proof gate; review-ready without proof remains WAIT. |

Decision Package rule: if these fields explain a WAIT or NO_TRADE state, sidecar must classify and report it without recomputing alpha or chasing price.

## Track Separation

- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact predates the formula-bottleneck contract or the producer failed to emit it. Treat that as a fresh-hash verification gap, not a sidecar problem.
- `warn_formula_contract_missing_or_mismatch` means rows may expose formula fields, but the artifact manifest does not publish the formula tuning contract version/rules.
- `warn_formula_bottleneck_lane_mismatch` means a row has formula fields, but the formula bottleneck contradicts its zero-executable tuning lane. Fix Stage6 producer mapping before tuning thresholds.
- `warn_formula_bottleneck_evidence_weak` means the formula bottleneck lane is present, but its numeric/proof evidence is too weak to support tuning.
- `warn_lane_specific_formula_evidence_mismatch` means the row has generic zero-executable formula fields, but the structure/breakout/target/risk lane-specific formula fields are missing or disagree with the primary formula basis.
- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
