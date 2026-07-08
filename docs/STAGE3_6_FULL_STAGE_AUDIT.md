# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-07-08T14:36:02.629Z
- Overall: **pass_stage3_6_full_stage_audit**
- Lineage: **pass_same_run_lineage**; final quality judgement: **enabled**
- Stage6 Runtime Proof: **pass_runtime_proof_fields_present**
- Formula Evidence: **pass_formula_evidence_present** (27/27)
- Blocker Classification: **pass_blocker_classification_specific**
- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.

## Lineage

| Edge | Producer Source | Local Artifact | Match | Source Status |
| --- | --- | --- | --- | --- |
| Stage4<-Stage3 | STAGE3_FUNDAMENTAL_FULL_2026-07-08_23-01-40.json | STAGE3_FUNDAMENTAL_FULL_2026-07-08_23-01-40.json | true | N/A |
| Stage5<-Stage4 | STAGE4_TECHNICAL_FULL_2026-07-08_23-18-26.json | STAGE4_TECHNICAL_FULL_2026-07-08_23-18-26.json | true | present |
| Stage6<-Stage5 | STAGE5_ICT_ELITE_50_2026-07-08_23-18-35.json | STAGE5_ICT_ELITE_50_2026-07-08_23-18-35.json | true | N/A |

Reasons: stage3_stage4_stage5_stage6_chain_consistent

## Stage Verdicts

| Stage | Verdict | Rows | Source | Coverage |
| --- | --- | --- | --- | --- |
| Stage3 | audited_report_only | 300 | STAGE3_FUNDAMENTAL_FULL_2026-07-08_23-01-40.json | fundamentalScore:300/300<br>compositeAlpha:300/300<br>qualityScore:300/300<br>integrityReasons:42/300<br>isImputed:300/300<br>dataQuality:300/300<br>roicDebtSource:300/300 |
| Stage4 | audited_report_only | 300 | STAGE4_TECHNICAL_FULL_2026-07-08_23-18-26.json | technicalScore:300/300<br>scoreBreakdown.finalScore:300/300<br>techMetrics:300/300<br>priceHistory:300/300<br>dataSource:300/300<br>techMetrics.dataQualityState:300/300<br>techMetrics.avgDollarVolume20:300/300 |
| Stage5 | audited_report_only | 50 | STAGE5_ICT_ELITE_50_2026-07-08_23-18-35.json | ictScore:50/50<br>ictMetrics:50/50<br>otePrice:50/50<br>ictStopLoss:50/50<br>executionGeometrySource:50/50<br>pdZone:50/50<br>compositeBreakdown.dataQualityMultiplier:50/50 |
| Stage6 | audited_runtime_proof_present | 0 | STAGE6_ALPHA_FINAL_2026-07-08_23-21-56.json | finalDecision:0/0<br>decisionReason:0/0<br>weakPillarGateVerdict:0/0<br>qualityGateLane:0/0<br>zeroExecutableTuningLane:0/0<br>targetRecalibrationViabilityVerdict:0/0<br>riskGeometryRepairLane:0/0<br>breakoutRetestProofConfirmed:0/0 |

## Stage Formula Evidence

| Stage | Present / Checks | Missing Required | Evidence Sources |
| --- | --- | --- | --- |
| Stage3 | 8/8 | 0 | {"quant_formula":3,"methodology":5} |
| Stage4 | 8/8 | 0 | {"quant_formula":4,"methodology":4} |
| Stage5 | 7/7 | 0 | {"quant_formula":3,"methodology":4} |
| Stage6 | 3/3 | 0 | {"methodology":3} |
| Stage6Bridge | 1/1 | 0 | {"quant_formula":1} |

Missing required formula evidence: none

## Stage Data Health

| Stage | Rows | Score Bounds | Source Counts | Freshness Coverage | Freshness Age | Fallback Flags | Price History |
| --- | --- | --- | --- | --- | --- | --- | --- |
| stage3 | 300 | {"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":5.05,"max":100,"outOfBounds":0},"qualityScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"source":{"V13_Cylinder":300},"quoteSource":{"YFINANCE_INFO":300},"netIncomeSource":{"INFO":297,"HISTORY":3},"roicDebtSource":{"ABSOLUTE":300}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"netIncomeAsOf":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-07-08T13:58:21.112Z","latest":"2026-07-08T13:58:40.954Z","maxAgeDays":0.03},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-07-07T20:00:00.000Z","latest":"2026-07-07T20:04:37.000Z","maxAgeDays":0.78},"netIncomeAsOf":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-03-31T00:00:00.000Z","latest":"2026-07-08T05:55:57.000Z","maxAgeDays":99.61}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"fundamentalScoreClampApplied":{"false":278,"true":22}} | N/A |
| stage4 | 300 | {"technicalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"scoreBreakdown.finalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":5.05,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"dataSource":{"DRIVE":300},"quoteSource":{"YFINANCE_INFO":300},"techMetrics.dataQualityState":{"NORMAL":254,"THIN":45,"ILLIQUID":1}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"lastUpdate":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-07-08T13:58:21.112Z","latest":"2026-07-08T13:58:40.954Z","maxAgeDays":0.03},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-07-07T20:00:00.000Z","latest":"2026-07-07T20:04:37.000Z","maxAgeDays":0.78},"lastUpdate":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-07-08T14:15:44.284Z","latest":"2026-07-08T14:18:25.951Z","maxAgeDays":0.01}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"isTechnicalBreakout":{"false":190,"true":110}} | {"present":300,"total":300,"minBars":80,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":300,"total":300,"pct":100},"oldestLastBarDate":"2026-07-07","latestLastBarDate":"2026-07-08","maxLastBarAgeDays":1.61} |
| stage5 | 50 | {"ictScore":{"present":50,"total":50,"min":58.11,"max":95.51,"outOfBounds":0},"technicalScore":{"present":50,"total":50,"min":42.98,"max":99,"outOfBounds":0},"fundamentalScore":{"present":50,"total":50,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":50,"total":50,"min":63.06,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":50},"dataSource":{"DRIVE":50},"executionGeometrySource":{"RECENT_SWING_ATR":50},"factorCarryGuard":{"NORMAL":48,"THIN_REDUCED":2},"compositeBreakdown.dataQualityMultiplier":{"1":48,"0.97":2}} | {"updated":{"present":50,"total":50,"pct":100},"quoteTimestamp":{"present":50,"total":50,"pct":100},"lastUpdate":{"present":50,"total":50,"pct":100}} | {"updated":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-07-08T13:58:21.112Z","latest":"2026-07-08T13:58:40.954Z","maxAgeDays":0.03},"quoteTimestamp":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-07-07T20:00:00.000Z","latest":"2026-07-07T20:00:55.000Z","maxAgeDays":0.78},"lastUpdate":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-07-08T14:15:50.544Z","latest":"2026-07-08T14:18:25.951Z","maxAgeDays":0.01}} | {"isImputed":{"false":50},"cashflowProxyUsed":{"false":50},"isDataDoubtful":{"false":50}} | {"present":50,"total":50,"minBars":104,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":50,"total":50,"pct":100},"oldestLastBarDate":"2026-07-07","latestLastBarDate":"2026-07-07","maxLastBarAgeDays":1.61} |
| stage6 | 0 | {"convictionScore":{"present":0,"total":0,"min":null,"max":null,"outOfBounds":0},"expectedReturn":{"present":0,"total":0,"min":null,"max":null,"outOfBounds":0},"fundamentalScore":{"present":0,"total":0,"min":null,"max":null,"outOfBounds":0},"technicalScore":{"present":0,"total":0,"min":null,"max":null,"outOfBounds":0},"ictScore":{"present":0,"total":0,"min":null,"max":null,"outOfBounds":0}} | {"dataQuality":{},"aiProvider":{},"finalDecision":{},"decisionReason":{},"zeroExecutableTuningLane":{}} | {"updated":{"present":0,"total":0,"pct":0},"quoteTimestamp":{"present":0,"total":0,"pct":0},"lastUpdate":{"present":0,"total":0,"pct":0}} | {"updated":{"present":0,"total":0,"parsed":0,"pct":0,"oldest":null,"latest":null,"maxAgeDays":null},"quoteTimestamp":{"present":0,"total":0,"parsed":0,"pct":0,"oldest":null,"latest":null,"maxAgeDays":null},"lastUpdate":{"present":0,"total":0,"parsed":0,"pct":0,"oldest":null,"latest":null,"maxAgeDays":null}} | {"aiFallbackDetected":{},"breakoutRetestProofConfirmed":{}} | {"present":0,"total":0,"minBars":null,"maxBars":null,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":0,"total":0,"pct":0},"oldestLastBarDate":null,"latestLastBarDate":null,"maxLastBarAgeDays":null} |

Data freshness policy: **pass_data_freshness_policy**. Thresholds: {"maxFreshnessAgeDays":5,"maxPriceHistoryAgeDays":5}

| Metric | Value |
| --- | --- |
| status | pass_data_freshness_policy |
| findingCount | 0 |
| categoryCounts | {} |
| staleStages | none |
| staleFields | none |
| worstFreshnessAgeDays | 0.78 |
| worstPriceHistoryAgeDays | 1.61 |
| nextAction | none |

Data health findings: none

## Stage6 Entry / Fillability Evidence

Status: **no_stage6_rows**. Missing core fields: entryDistancePct, rrAtCurrent, rrAtEntry, targetBufferPct, fillabilityPolicyVerdict, entryTimingPolicyVerdict

| Field | Present / Total | Pct | Numeric Range |
| --- | --- | --- | --- |
| entryDistancePct | 0/0 | 0 | N/A..N/A |
| rrAtCurrent | 0/0 | 0 | N/A..N/A |
| rrAtEntry | 0/0 | 0 | N/A..N/A |
| targetBufferPct | 0/0 | 0 | N/A..N/A |
| fillabilityPolicyVerdict | 0/0 | 0 | N/A |
| entryTimingPolicyVerdict | 0/0 | 0 | N/A |
| zeroExecutableTuningLane | 0/0 | 0 | N/A |
| qualityGateLane | 0/0 | 0 | N/A |
| targetRecalibrationViabilityVerdict | 0/0 | 0 | N/A |
| riskGeometryPolicyVerdict | 0/0 | 0 | N/A |
| breakoutRetestProofConfirmed | 0/0 | 0 | N/A |

| Policy Field | Counts |
| --- | --- |
| fillabilityPolicyVerdict | {} |
| entryTimingPolicyVerdict | {} |
| finalDecision | {} |
| decisionReason | {} |
| zeroExecutableTuningLane | {} |
| qualityGateLane | {} |

## Stage6 Formula Tuning Focus

| Metric | Value |
| --- | --- |
| status | pass_formula_tuning_backlog_ready |
| freshRuntimeProofStatus | pass_runtime_proof_fields_present |
| tuningActionAllowed | true |
| topProducerTrack | target_recalibration |
| topAdjustmentKnob | TARGET_RECALIBRATION_SOURCE_REFRESH |
| producerReviewRows | 6 |
| tuningRecommendationCount | 3 |
| producerFieldRecommendationCount | 14 |
| targetRecalibrationProofGapCounts | {} |
| producerTrackAggregation | {"breakout_proof_confirmed_generation":{"count":1,"totalMagnitude":25.85,"symbols":["ZVRA"]},"target_recalibration":{"count":3,"totalMagnitude":104.72,"symbols":["ALL","DUOL","INCY"]},"structure_proof_generation":{"count":2,"totalMagnitude":31.88,"symbols":["GRND","SGHC"]}} |
| adjustmentKnobAggregation | {"BREAKOUT_RETEST_FRESHNESS_WINDOW":{"count":1,"totalMagnitude":25.85,"symbols":["ZVRA"]},"TARGET_RECALIBRATION_SOURCE_REFRESH":{"count":3,"totalMagnitude":104.72,"symbols":["ALL","DUOL","INCY"]},"CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND":{"count":2,"totalMagnitude":31.88,"symbols":["GRND","SGHC"]}} |
| nextAction | tune_stage6_producer_formula_or_proof_generation |

Row evidence samples are current-artifact examples only; they must not become symbol-specific rules.

| Symbol | Track | Lane | Knob | Magnitude | Decision | Evidence Basis | Evidence Summary | Target Proof Summary | Target Proof Gaps | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DUOL | target_recalibration | TARGET_RECALIBRATION | TARGET_RECALIBRATION_SOURCE_REFRESH | 44.3 | BLOCKED_RISK/blocked_target_too_close | target_already_reached_required_target_shortfall_pct | target_already_reached_required_target_shortfall_pct: observed=44.3 threshold=0 delta=44.3 pct_shortfall; blockedBy=target_no_trade_confirmed,target_recalibration_candidate_false,execution_floor_not_viable,required_target_shortfall_positive,target_viability:TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT; nextAction=refresh_stage6_target_source_or_keep_no_trade; doneWhen=targetRecalibrationCandidate=true or targetNoTradeConfirmed=true with fresh source timestamp,targetRecalibrationRequiredTargetPrice > currentPrice,targetRecalibrationViabilityVerdict is not evidence_incomplete,zeroExecutableFormulaDeltaValue explains the remaining target shortfall; relationship=target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh secondaryLane=RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION; target=106.31 required=190.87 executionFloor=190.87 expectedReturn=131.65 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-44.3% execFloorShortfall=44.3% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | target=106.31 required=190.87 executionFloor=190.87 expectedReturn=131.65 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-44.3% execFloorShortfall=44.3% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | none | PRODUCER_TUNING_REVIEW |
| INCY | target_recalibration | TARGET_RECALIBRATION | TARGET_RECALIBRATION_SOURCE_REFRESH | 33.73 | BLOCKED_RISK/blocked_rr_below_min | target_already_reached_required_target_shortfall_pct | target_already_reached_required_target_shortfall_pct: observed=33.73 threshold=0 delta=33.73 pct_shortfall; blockedBy=target_no_trade_confirmed,target_recalibration_candidate_false,execution_floor_not_viable,required_target_shortfall_positive,target_viability:TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT; nextAction=refresh_stage6_target_source_or_keep_no_trade; doneWhen=targetRecalibrationCandidate=true or targetNoTradeConfirmed=true with fresh source timestamp,targetRecalibrationRequiredTargetPrice > currentPrice,targetRecalibrationViabilityVerdict is not evidence_incomplete,zeroExecutableFormulaDeltaValue explains the remaining target shortfall; relationship=target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh secondaryLane=RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION; target=111.45 required=168.17 executionFloor=168.17 expectedReturn=128.99 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-33.73% execFloorShortfall=33.73% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | target=111.45 required=168.17 executionFloor=168.17 expectedReturn=128.99 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-33.73% execFloorShortfall=33.73% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | none | PRODUCER_TUNING_REVIEW |
| ALL | target_recalibration | TARGET_RECALIBRATION | TARGET_RECALIBRATION_SOURCE_REFRESH | 26.69 | WAIT_PRICE/wait_target_near_current | target_already_reached_required_target_shortfall_pct | target_already_reached_required_target_shortfall_pct: observed=26.69 threshold=0 delta=26.69 pct_shortfall; blockedBy=target_no_trade_confirmed,target_recalibration_candidate_false,execution_floor_not_viable,required_target_shortfall_positive,target_viability:TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT; nextAction=refresh_stage6_target_source_or_keep_no_trade; doneWhen=targetRecalibrationCandidate=true or targetNoTradeConfirmed=true with fresh source timestamp,targetRecalibrationRequiredTargetPrice > currentPrice,targetRecalibrationViabilityVerdict is not evidence_incomplete,zeroExecutableFormulaDeltaValue explains the remaining target shortfall; relationship=target_recalibration_required_but_risk_geometry_no_trade_confirms_target_refresh secondaryLane=RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION; target=245.95 required=335.51 executionFloor=335.51 expectedReturn=283.46 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-26.69% execFloorShortfall=26.69% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | target=245.95 required=335.51 executionFloor=335.51 expectedReturn=283.46 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-26.69% execFloorShortfall=26.69% execFloorViable=false viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=none | none | PRODUCER_TUNING_REVIEW |
| ZVRA | breakout_proof_confirmed_generation | BREAKOUT_PROOF_CONFIRMED_GENERATION | BREAKOUT_RETEST_FRESHNESS_WINDOW | 25.85 | WAIT_PRICE/wait_breakout_retest_required | breakout_current_extension_excess_pct | breakout_current_extension_excess_pct: observed=33.85 threshold=8 delta=25.85 pct; blockedBy=breakout_proof_not_confirmed,proof_not_confirmed,current_stop_distance_outside_policy,proof_confirmed_promotion_flag_disabled,breakout_promotion_not_ready,breakout_policy_decision:WAIT_REVIEW_READY_ONLY; nextAction=generate_breakout_proof_confirmed_from_retest_or_continuation_evidence; doneWhen=breakoutRetestProofConfirmed=true,breakoutRetestProofRetestFresh=true or breakoutRetestProofContinuationConfirmed=true,breakoutRetestProofCurrentExtensionOk=true,breakoutRetestPromotionPolicyDecision is not WAIT_REVIEW_READY_ONLY; relationship=review_ready_waits_for_proof_confirmed secondaryLane=none | target=27.89 required=34.41 executionFloor=24.1 expectedReturn=34.41 source=expected_return_and_actual_stop_risk dominant=expected_return_required_target_dominates execFloorGap=15.73% execFloorShortfall=0% execFloorViable=false viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=none | none | PRODUCER_TUNING_REVIEW |
| SGHC | structure_proof_generation | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND | 16.24 | WAIT_PRICE/wait_structure_confirmation_required | structure_distance_excess | structure_distance_excess: observed=24.24 threshold=8 delta=16.24 pct; blockedBy=structure_current_rr_below_min,structure_distance_outside_review_band,structure_blocker_lane:STRUCTURE_CURRENT_RR_WEAK,structure_verdict:STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED; nextAction=improve_structure_support_stop_rr_proof_or_keep_wait; doneWhen=structurePolicyCurrentRrOk=true,structurePolicyTargetBufferOk=true,structurePolicyDistanceWithinReviewBand=true,currentEntryStructureVerdict confirms support/stop relation,structurePolicyBlockerLane is not STRUCTURE_CURRENT_RR_WEAK; relationship=structure_wait_requires_proof_not_gate_relaxation secondaryLane=none; structure=STRUCTURE_REJECT_STOP_ABOVE_SUPPORT blocker=STRUCTURE_CURRENT_RR_WEAK rrOk=false bufferOk=true distOk=false | target=18.13 required=22.98 executionFloor=22.79 expectedReturn=22.98 source=expected_return_and_actual_stop_risk dominant=expected_return_required_target_dominates execFloorGap=-20.48% execFloorShortfall=20.48% execFloorViable=false viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=none | none | PRODUCER_TUNING_REVIEW |
| GRND | structure_proof_generation | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND | 15.64 | WAIT_PRICE/wait_structure_confirmation_required | structure_distance_excess | structure_distance_excess: observed=23.64 threshold=8 delta=15.64 pct; blockedBy=structure_current_rr_below_min,structure_distance_outside_review_band,structure_blocker_lane:STRUCTURE_CURRENT_RR_WEAK,structure_verdict:STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED; nextAction=improve_structure_support_stop_rr_proof_or_keep_wait; doneWhen=structurePolicyCurrentRrOk=true,structurePolicyTargetBufferOk=true,structurePolicyDistanceWithinReviewBand=true,currentEntryStructureVerdict confirms support/stop relation,structurePolicyBlockerLane is not STRUCTURE_CURRENT_RR_WEAK; relationship=structure_wait_requires_proof_not_gate_relaxation secondaryLane=none; structure=STRUCTURE_REJECT_STOP_ABOVE_SUPPORT blocker=STRUCTURE_CURRENT_RR_WEAK rrOk=false bufferOk=true distOk=false | target=18.8 required=27.98 executionFloor=27.98 expectedReturn=23.59 source=actual_stop_risk dominant=risk_stop_required_target_dominates execFloorGap=-32.81% execFloorShortfall=32.81% execFloorViable=false viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=none | none | PRODUCER_TUNING_REVIEW |

## Stage6 Runtime Proof Gate

Expected producer head: e3708e2f_or_later

| Field | Present / Total | Pct |
| --- | --- | --- |
| targetRecalibrationExecutionFloorViable | 0/0 | 0 |
| riskGeometryTargetRecalibrationProofReady | 0/0 | 0 |
| riskGeometryRrAtRequiredTargetAndRecalculatedStop | 0/0 | 0 |
| breakoutRetestProofUndercutReclaimFound | 0/0 | 0 |
| zeroExecutableTuningLane | 0/0 | 0 |
| structurePolicyBlockerLane | 0/0 | 0 |
| qualityGateLane | 0/0 | 0 |

Raw finalist-only missing fields (non-blocking; subreport proof passed): targetRecalibrationExecutionFloorViable, riskGeometryTargetRecalibrationProofReady, riskGeometryRrAtRequiredTargetAndRecalculatedStop, breakoutRetestProofUndercutReclaimFound, zeroExecutableTuningLane, structurePolicyBlockerLane, qualityGateLane

## Blocker Summary

| Metric | Counts |
| --- | --- |
| blockerCategoryCounts | {"breakout":1,"target_recalibration":2,"structure":2,"risk_geometry":1} |
| zeroExecutableTuningLaneCounts | {"BREAKOUT_PROOF_CONFIRMED_GENERATION":1,"TARGET_RECALIBRATION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":2} |
| qualityGateLaneCounts | {} |
| structurePolicyBlockerLaneCounts | {"not_applicable":4,"STRUCTURE_CURRENT_RR_WEAK":2} |
| riskGeometryRepairLaneCounts | {"not_applicable":3,"TARGET_NO_TRADE":3} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":3,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":3} |

Blocker classification health: **pass_blocker_classification_specific**. Ambiguous buckets: none

Root cause summary: {"structureWaitRootCauses":{"STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED":1},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":2,"STOP_GEOMETRY_RECALIBRATION_REQUIRED":1},"qualityGateRootCauses":{"QUALITY_GATE_REASON_UNRESOLVED":1}}

## TradingCodex Decision Package Mapping

This report supplies Research Package evidence for TradingCodex. It does not authorize Sidecar or Approval Package mutation.

| Field | Specialist Owner | Decision Package Slot | Interpretation |
| --- | --- | --- | --- |
| zeroExecutableTuningLane | Formula Evidence Analyst | Research Package.evidence.zeroExecutableTuningLane | Primary producer tuning lane; use for backlog routing, not ticker-specific manual watch. |
| qualityGateLane | Alpha Policy Analyst | Research Package.evidence.qualityGateLane | Verdict, weak-pillar, earnings, or non-actionable quality gate classification. |
| structurePolicyBlockerLane | Structure Analyst | Research Package.evidence.structurePolicyBlockerLane | Structure proof ownership; tune proof generation before relaxing gates. |
| riskGeometryRepairLane | Alpha Policy Analyst | Research Package.evidence.riskGeometryRepairLane | Stop/target recalculation or no-trade ownership; sidecar reprice must not solve it. |
| targetRecalibrationViabilityVerdict | Alpha Policy Analyst | Research Package.evidence.targetRecalibrationViabilityVerdict | Target refresh/no-trade decision evidence. |
| breakoutRetestProofConfirmed | Structure Analyst / Alpha Policy Analyst | Research Package.evidence.breakoutRetestProofConfirmed | Promotion proof gate; review-ready without proof remains WAIT. |

mRNA transcript interpretation: blocker lanes are temporary strategy-transcript signals. They expire with the Stage6 hash and must be regenerated from a fresh artifact before tuning or RTH sidecar verification.

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-07-07T14:05:06.502Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | pass_report_only | 2026-07-07T14:05:07.910Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | pass_zero_executable_focus_fields_ok | 2026-07-08T14:36:02.154Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-07-08T14:36:02.465Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pass_zero_executable_backlog_names_producer_fields | 2026-07-08T14:36:02.243Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-07-08T13:56:01.827Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-07-07T23:17:13.242Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-22T16:07:34.780Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Prioritize Stage6 producer tuning track: target_recalibration via TARGET_RECALIBRATION_SOURCE_REFRESH; do not solve this in sidecar.
- Proceed to bounded Stage6 producer tuning only for proven formula or blocker defects.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
