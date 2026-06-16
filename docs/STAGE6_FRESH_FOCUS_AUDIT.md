# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-16T23:21:01.847Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_23-59-28.json
- Hash: 191e5e5231619841e5c83cc9b20142a333ce57c0dd235e214849eff553e985c7
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Contract Executable Picks: 0
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"non_actionable_verdict":1} |
| zeroExecutableTuningLaneCounts | {"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":4,"NO_ZERO_EXECUTABLE_TUNING_ACTION":1,"TARGET_RECALIBRATION":1} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| breakoutContinuationConfirmedCounts | {"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"actual_stop_risk":5,"expected_return_and_actual_stop_risk":1} |
| riskGeometryTargetRecalibrationCandidateCounts | {"missing":5,"false":1} |
| blockerCategoryCounts | {"structure":4,"quality_gate":1,"target_recalibration":1} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 6/6 |
| breakoutRetestPromotionPolicyDecision | 6/6 |
| breakoutRetestPromotionBlockedBy | 6/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetByBufferPrice | 6/6 |
| targetRecalibrationRequiredTargetByRrPrice | 6/6 |
| targetRecalibrationRequiredTargetByExpectedReturnPrice | 6/6 |
| targetRecalibrationSourcePrice | 6/6 |
| targetRecalibrationSourceStopPrice | 6/6 |
| targetRecalibrationStopDistanceAtCurrent | 6/6 |
| targetRecalibrationRequiredTargetSource | 6/6 |
| structurePolicyBlockerLane | 0/6 |
| structurePolicyCurrentRrOk | 0/6 |
| structurePolicyTargetBufferOk | 0/6 |
| structurePolicyDistanceWithinReviewBand | 0/6 |
| riskGeometryRequiredTargetByStopPrice | 0/6 |
| riskGeometryRequiredTargetByBufferPrice | 0/6 |
| riskGeometryRequiredTargetByExpectedReturnPrice | 0/6 |
| riskGeometryRequiredTargetSource | 0/6 |
| riskGeometryTargetGapPct | 6/6 |
| riskGeometryTargetShortfallPct | 0/6 |
| riskGeometryTargetAboveCurrent | 6/6 |
| riskGeometryRequiredStopValid | 6/6 |
| riskGeometryRequiredStopDistanceValid | 6/6 |
| riskGeometryRecalculatedStopRrOk | 6/6 |
| riskGeometryTargetBufferOk | 6/6 |
| riskGeometryRepairLane | 0/6 |
| riskGeometryProofConfirmed | 0/6 |
| qualityGateLane | 0/6 |
| qualityGatePolicyVerdict | 0/6 |
| currentEntryStructureSupportReference | 6/6 |
| currentEntryStructureSupportGapAtr | 6/6 |
| currentEntryStructureStopAlignedSupportGapAtr | 6/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Quality Verdict | Zero-Exec Lane | Structure Lane | Structure OK | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | Target By ER | Risk Source | Risk Repair | Risk Confirmed | Risk Checks | Risk Target Gap% | Risk Shortfall% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| AUPH | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.5315 | 19.291 | 18.4575 | N/A | N/A | N/A | target=null,stop=null,dist=null,rr=null,buf=null | N/A | N/A | 0.59 | 8.31 | 5.92 |
| LTM | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 57.2474 | 79.284 | 78.3678 | N/A | N/A | N/A | target=null,stop=null,dist=null,rr=null,buf=null | N/A | N/A | 1.27 | 12.41 | 27.1 |
| ZVRA | SPECULATIVE_BUY | WAIT_PRICE/wait_verdict_not_sidecar_actionable | quality_gate | non_actionable_verdict | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | expected_return_and_actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 12.9265 | 19.119 | 29.618 | N/A | N/A | N/A | target=null,stop=null,dist=null,rr=null,buf=null | N/A | N/A | 4.67 | 17.53 | 122.22 |
| MLI | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 144.9107 | 190.8495 | 178.6763 | N/A | N/A | N/A | target=null,stop=null,dist=null,rr=null,buf=null | N/A | N/A | 0.33 | 16.57 | 5.91 |
| DAVE | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 317.6005 | 517.905 | 468.692 | N/A | N/A | N/A | target=null,stop=null,dist=null,rr=null,buf=null | N/A | N/A | 0.26 | 32.37 | 8.88 |
| VIRT | STRONG_BUY | WAIT_PRICE/wait_target_near_current | target_recalibration | N/A | N/A | TARGET_RECALIBRATION | N/A | rr=null,buf=null,dist=null | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 60.2241 | 86.0732 | 66.6558 | N/A | N/A | N/A | target=false,stop=false,dist=false,rr=false,buf=false | -12.94 | N/A | N/A | 22.44 | -10.33 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
