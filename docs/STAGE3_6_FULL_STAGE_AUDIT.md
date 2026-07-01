# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-07-01T23:22:23.033Z
- Overall: **warn_stage6_runtime_proof_pending**
- Lineage: **pass_same_run_lineage**; final quality judgement: **enabled**
- Stage6 Runtime Proof: **pending_fresh_runtime_proof_after_e3708e2f**
- Formula Evidence: **pass_formula_evidence_present** (27/27)
- Blocker Classification: **pass_blocker_classification_specific**
- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.

## Lineage

| Edge | Producer Source | Local Artifact | Match | Source Status |
| --- | --- | --- | --- | --- |
| Stage4<-Stage3 | STAGE3_FUNDAMENTAL_FULL_2026-06-24_01-08-10.json | STAGE3_FUNDAMENTAL_FULL_2026-06-24_01-08-10.json | true | N/A |
| Stage5<-Stage4 | STAGE4_TECHNICAL_FULL_2026-06-24_01-26-17.json | STAGE4_TECHNICAL_FULL_2026-06-24_01-26-17.json | true | present |
| Stage6<-Stage5 | STAGE5_ICT_ELITE_50_2026-06-24_01-26-27.json | STAGE5_ICT_ELITE_50_2026-06-24_01-26-27.json | true | N/A |

Reasons: stage3_stage4_stage5_stage6_chain_consistent

## Stage Verdicts

| Stage | Verdict | Rows | Source | Coverage |
| --- | --- | --- | --- | --- |
| Stage3 | audited_report_only | 300 | STAGE3_FUNDAMENTAL_FULL_2026-06-24_01-08-10.json | fundamentalScore:300/300<br>compositeAlpha:300/300<br>qualityScore:300/300<br>integrityReasons:37/300<br>isImputed:300/300<br>dataQuality:300/300<br>roicDebtSource:300/300 |
| Stage4 | audited_report_only | 300 | STAGE4_TECHNICAL_FULL_2026-06-24_01-26-17.json | technicalScore:300/300<br>scoreBreakdown.finalScore:300/300<br>techMetrics:300/300<br>priceHistory:300/300<br>dataSource:300/300<br>techMetrics.dataQualityState:300/300<br>techMetrics.avgDollarVolume20:300/300 |
| Stage5 | audited_report_only | 50 | STAGE5_ICT_ELITE_50_2026-06-24_01-26-27.json | ictScore:50/50<br>ictMetrics:50/50<br>otePrice:50/50<br>ictStopLoss:50/50<br>executionGeometrySource:50/50<br>pdZone:50/50<br>compositeBreakdown.dataQualityMultiplier:50/50 |
| Stage6 | warn_runtime_proof_pending | 1 | STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json | finalDecision:1/1<br>decisionReason:1/1<br>weakPillarGateVerdict:1/1<br>qualityGateLane:0/1<br>zeroExecutableTuningLane:1/1<br>targetRecalibrationViabilityVerdict:1/1<br>riskGeometryRepairLane:1/1<br>breakoutRetestProofConfirmed:1/1 |

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
| stage3 | 300 | {"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0},"qualityScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"source":{"V13_Cylinder":300},"quoteSource":{"YFINANCE_INFO":300},"netIncomeSource":{"INFO":298,"HISTORY":2},"roicDebtSource":{"ABSOLUTE":300}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"netIncomeAsOf":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":8.3},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":9.14},"netIncomeAsOf":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-03-31T00:00:00.000Z","latest":"2026-06-23T06:54:07.000Z","maxAgeDays":92.97}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"fundamentalScoreClampApplied":{"false":278,"true":22}} | N/A |
| stage4 | 300 | {"technicalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"scoreBreakdown.finalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"dataSource":{"DRIVE":300},"quoteSource":{"YFINANCE_INFO":300},"techMetrics.dataQualityState":{"THIN":250,"NORMAL":50}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"lastUpdate":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":8.3},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":9.14},"lastUpdate":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:22:46.575Z","latest":"2026-06-23T16:26:17.502Z","maxAgeDays":8.29}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"isTechnicalBreakout":{"false":202,"true":98}} | {"present":300,"total":300,"minBars":70,"maxBars":120,"shortHistoryRowsLt80":1,"missingHistoryRows":0,"lastBarDateCoverage":{"present":300,"total":300,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-23","maxLastBarAgeDays":9.97} |
| stage5 | 50 | {"ictScore":{"present":50,"total":50,"min":47.05,"max":100,"outOfBounds":0},"technicalScore":{"present":50,"total":50,"min":12,"max":99,"outOfBounds":0},"fundamentalScore":{"present":50,"total":50,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":50,"total":50,"min":54.62,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":50},"dataSource":{"DRIVE":50},"executionGeometrySource":{"RECENT_SWING_ATR":50},"factorCarryGuard":{"THIN_REDUCED":34,"NORMAL":16},"compositeBreakdown.dataQualityMultiplier":{"1":16,"0.97":34}} | {"updated":{"present":50,"total":50,"pct":100},"quoteTimestamp":{"present":50,"total":50,"pct":100},"lastUpdate":{"present":50,"total":50,"pct":100}} | {"updated":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":8.3},"quoteTimestamp":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":9.14},"lastUpdate":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-23T16:22:46.575Z","latest":"2026-06-23T16:26:17.502Z","maxAgeDays":8.29}} | {"isImputed":{"false":50},"cashflowProxyUsed":{"false":50},"isDataDoubtful":{"false":50}} | {"present":50,"total":50,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":50,"total":50,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-23","maxLastBarAgeDays":9.97} |
| stage6 | 1 | {"convictionScore":{"present":1,"total":1,"min":100,"max":100,"outOfBounds":0},"expectedReturn":{"present":0,"total":1,"min":null,"max":null,"outOfBounds":0},"fundamentalScore":{"present":1,"total":1,"min":75.87,"max":75.87,"outOfBounds":0},"technicalScore":{"present":1,"total":1,"min":73.73,"max":73.73,"outOfBounds":0},"ictScore":{"present":1,"total":1,"min":77.98,"max":77.98,"outOfBounds":0}} | {"dataQuality":{"HIGH":1},"aiProvider":{"PERPLEXITY_FALLBACK":1},"finalDecision":{"EXECUTABLE_NOW":1},"decisionReason":{"executable_current_recalculated_stop":1},"zeroExecutableTuningLane":{"NO_ZERO_EXECUTABLE_TUNING_ACTION":1}} | {"updated":{"present":1,"total":1,"pct":100},"quoteTimestamp":{"present":1,"total":1,"pct":100},"lastUpdate":{"present":1,"total":1,"pct":100}} | {"updated":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-23T16:04:39.143Z","latest":"2026-06-23T16:04:39.143Z","maxAgeDays":8.3},"quoteTimestamp":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-22T20:00:01.000Z","latest":"2026-06-22T20:00:01.000Z","maxAgeDays":9.14},"lastUpdate":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-23T16:24:08.325Z","latest":"2026-06-23T16:24:08.325Z","maxAgeDays":8.29}} | {"aiFallbackDetected":{"false":1},"breakoutRetestProofConfirmed":{"true":1}} | {"present":1,"total":1,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":1,"total":1,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-22","maxLastBarAgeDays":9.97} |

Data freshness policy: **warn_stale_stage_artifacts_for_policy_tuning**. Thresholds: {"maxFreshnessAgeDays":5,"maxPriceHistoryAgeDays":5}

| Metric | Value |
| --- | --- |
| status | warn_stale_stage_artifacts_for_policy_tuning |
| findingCount | 14 |
| categoryCounts | {"freshness_age":11,"price_history_freshness":3} |
| staleStages | stage3, stage4, stage5, stage6 |
| staleFields | stage3.quoteTimestamp, stage3.updated, stage4.lastUpdate, stage4.priceHistory.lastBarDate, stage4.quoteTimestamp, stage4.updated, stage5.lastUpdate, stage5.priceHistory.lastBarDate, stage5.quoteTimestamp, stage5.updated, stage6.lastUpdate, stage6.priceHistory.lastBarDate, stage6.quoteTimestamp, stage6.updated |
| worstFreshnessAgeDays | 9.14 |
| worstPriceHistoryAgeDays | 9.97 |
| nextAction | refresh_same_run_stage_artifacts_before_stage6_policy_tuning |

Data health findings:

| Stage | Category | Field | Finding | Range / Coverage |
| --- | --- | --- | --- | --- |
| stage3 | freshness_age | updated | max age 8.3d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage3 | freshness_age | quoteTimestamp | max age 9.14d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage4 | price_history_freshness | priceHistory.lastBarDate | max age 9.97d | 2026-06-22..2026-06-23 |
| stage4 | freshness_age | updated | max age 8.3d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage4 | freshness_age | quoteTimestamp | max age 9.14d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage4 | freshness_age | lastUpdate | max age 8.29d | 2026-06-23T16:22:46.575Z..2026-06-23T16:26:17.502Z |
| stage5 | price_history_freshness | priceHistory.lastBarDate | max age 9.97d | 2026-06-22..2026-06-23 |
| stage5 | freshness_age | updated | max age 8.3d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage5 | freshness_age | quoteTimestamp | max age 9.14d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage5 | freshness_age | lastUpdate | max age 8.29d | 2026-06-23T16:22:46.575Z..2026-06-23T16:26:17.502Z |
| stage6 | price_history_freshness | priceHistory.lastBarDate | max age 9.97d | 2026-06-22..2026-06-22 |
| stage6 | freshness_age | updated | max age 8.3d | 2026-06-23T16:04:39.143Z..2026-06-23T16:04:39.143Z |
| stage6 | freshness_age | quoteTimestamp | max age 9.14d | 2026-06-22T20:00:01.000Z..2026-06-22T20:00:01.000Z |
| stage6 | freshness_age | lastUpdate | max age 8.29d | 2026-06-23T16:24:08.325Z..2026-06-23T16:24:08.325Z |

## Stage6 Entry / Fillability Evidence

Status: **pending_entry_fillability_evidence**. Missing core fields: fillabilityPolicyVerdict

| Field | Present / Total | Pct | Numeric Range |
| --- | --- | --- | --- |
| entryDistancePct | 1/1 | 100 | 0..0 |
| rrAtCurrent | 1/1 | 100 | 2..2 |
| rrAtEntry | 1/1 | 100 | 2..2 |
| targetBufferPct | 1/1 | 100 | 23.03..23.03 |
| fillabilityPolicyVerdict | 0/1 | 0 | N/A |
| entryTimingPolicyVerdict | 1/1 | 100 | N/A |
| zeroExecutableTuningLane | 1/1 | 100 | N/A |
| qualityGateLane | 0/1 | 0 | N/A |
| targetRecalibrationViabilityVerdict | 1/1 | 100 | N/A |
| riskGeometryPolicyVerdict | 1/1 | 100 | N/A |
| breakoutRetestProofConfirmed | 1/1 | 100 | N/A |

| Policy Field | Counts |
| --- | --- |
| fillabilityPolicyVerdict | {"unknown":1} |
| entryTimingPolicyVerdict | {"CURRENT_ENTRY_FEASIBLE":1} |
| finalDecision | {"EXECUTABLE_NOW":1} |
| decisionReason | {"executable_current_recalculated_stop":1} |
| zeroExecutableTuningLane | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":1} |
| qualityGateLane | {"unknown":1} |

## Stage6 Formula Tuning Focus

| Metric | Value |
| --- | --- |
| status | pass_formula_tuning_backlog_ready |
| freshRuntimeProofStatus | pending_fresh_runtime_proof_after_e3708e2f |
| tuningActionAllowed | false |
| topProducerTrack | target_recalibration |
| topAdjustmentKnob | TARGET_RECALIBRATION_SOURCE_REFRESH |
| producerReviewRows | 5 |
| tuningRecommendationCount | 4 |
| producerFieldRecommendationCount | 20 |
| targetRecalibrationProofGapCounts | {"missing_execution_floor_price":2,"missing_execution_floor_viability":2,"missing_required_target_dominant_reason":2} |
| producerTrackAggregation | {"target_recalibration":{"count":2,"totalMagnitude":76.64,"symbols":["AUPH","DUOL"]},"structure_proof_generation":{"count":1,"totalMagnitude":25.43,"symbols":["DAVE"]},"breakout_proof_confirmed_generation":{"count":1,"totalMagnitude":16.73,"symbols":["ZVRA"]},"risk_geometry_recalculation":{"count":1,"totalMagnitude":9.3,"symbols":["ASB"]}} |
| adjustmentKnobAggregation | {"TARGET_RECALIBRATION_SOURCE_REFRESH":{"count":2,"totalMagnitude":76.64,"symbols":["AUPH","DUOL"]},"CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND":{"count":1,"totalMagnitude":25.43,"symbols":["DAVE"]},"BREAKOUT_EXTENSION_POLICY":{"count":1,"totalMagnitude":16.73,"symbols":["ZVRA"]},"RISK_GEOMETRY_REQUIRED_TARGET_PRICE":{"count":1,"totalMagnitude":9.3,"symbols":["ASB"]}} |
| nextAction | wait_for_fresh_stage6_runtime_proof_before_tuning |

Row evidence samples are current-artifact examples only; they must not become symbol-specific rules.

| Symbol | Track | Lane | Knob | Magnitude | Decision | Evidence Basis | Evidence Summary | Target Proof Summary | Target Proof Gaps | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DUOL | target_recalibration | TARGET_RECALIBRATION | TARGET_RECALIBRATION_SOURCE_REFRESH | 47.07 | BLOCKED_RISK/blocked_rr_below_min | target_already_reached_required_target_shortfall_pct | target_already_reached_required_target_shortfall_pct: observed=47.07 threshold=0 delta=47.07 pct_shortfall; target=106.31 required=200.86 executionFloor=N/A expectedReturn=136.06 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | target=106.31 required=200.86 executionFloor=N/A expectedReturn=136.06 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | missing_execution_floor_price, missing_execution_floor_viability, missing_required_target_dominant_reason | PRODUCER_TUNING_REVIEW |
| AUPH | target_recalibration | TARGET_RECALIBRATION | TARGET_RECALIBRATION_SOURCE_REFRESH | 29.57 | WAIT_PRICE/wait_target_near_current | target_already_reached_required_target_shortfall_pct | target_already_reached_required_target_shortfall_pct: observed=29.57 threshold=0 delta=29.57 pct_shortfall; target=17 required=24.14 executionFloor=N/A expectedReturn=19.75 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | target=17 required=24.14 executionFloor=N/A expectedReturn=19.75 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT noTrade=true proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | missing_execution_floor_price, missing_execution_floor_viability, missing_required_target_dominant_reason | PRODUCER_TUNING_REVIEW |
| DAVE | structure_proof_generation | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | CURRENT_ENTRY_STRUCTURE_DISTANCE_BAND | 25.43 | WAIT_PRICE/wait_structure_confirmation_required | structure_distance_excess | structure_distance_excess: observed=33.43 threshold=8 delta=25.43 pct; structure=STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND blocker=STRUCTURE_CURRENT_RR_WEAK rrOk=false bufferOk=true distOk=false | target=335.73 required=545.97 executionFloor=N/A expectedReturn=468.21 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | none | PRODUCER_TUNING_REVIEW |
| ZVRA | breakout_proof_confirmed_generation | BREAKOUT_PROOF_CONFIRMED_GENERATION | BREAKOUT_EXTENSION_POLICY | 16.73 | WAIT_PRICE/wait_breakout_retest_required | breakout_current_extension_excess_pct | breakout_current_extension_excess_pct: observed=24.73 threshold=8 delta=16.73 pct | target=27.89 required=28.27 executionFloor=N/A expectedReturn=28.27 source=expected_return_and_actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | none | PRODUCER_TUNING_REVIEW |
| ASB | risk_geometry_recalculation | RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION | RISK_GEOMETRY_REQUIRED_TARGET_PRICE | 9.3 | BLOCKED_RISK/blocked_stop_too_tight | risk_geometry_expected_return_target_shortfall_pct | risk_geometry_expected_return_target_shortfall_pct: observed=9.3 threshold=0 delta=9.3 pct_shortfall | target=31 required=36.6 executionFloor=N/A expectedReturn=34.18 source=actual_stop_risk dominant=N/A execFloorGap=N/A% execFloorShortfall=N/A% execFloorViable=N/A viability=TARGET_VIABILITY_NOT_APPLICABLE noTrade=false proofGaps=missing_execution_floor_price,missing_execution_floor_viability,missing_required_target_dominant_reason | none | PRODUCER_TUNING_REVIEW |

## Stage6 Runtime Proof Gate

Expected producer head: e3708e2f_or_later

| Field | Present / Total | Pct |
| --- | --- | --- |
| targetRecalibrationExecutionFloorViable | 0/1 | 0 |
| riskGeometryTargetRecalibrationProofReady | 0/1 | 0 |
| riskGeometryRrAtRequiredTargetAndRecalculatedStop | 0/1 | 0 |
| breakoutRetestProofUndercutReclaimFound | 0/1 | 0 |
| zeroExecutableTuningLane | 1/1 | 100 |
| structurePolicyBlockerLane | 1/1 | 100 |
| qualityGateLane | 0/1 | 0 |

Missing/Pending fields: targetRecalibrationExecutionFloorViable, riskGeometryTargetRecalibrationProofReady, riskGeometryRrAtRequiredTargetAndRecalculatedStop, breakoutRetestProofUndercutReclaimFound, qualityGateLane

## Blocker Summary

| Metric | Counts |
| --- | --- |
| blockerCategoryCounts | {"risk_geometry":3,"target_recalibration":1,"structure":1,"breakout":1,"quality_gate":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":2,"TARGET_RECALIBRATION":2,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":1} |
| qualityGateLaneCounts | {"weak_pillar_execution_gate":1} |
| structurePolicyBlockerLaneCounts | {"not_applicable":6,"STRUCTURE_CURRENT_RR_WEAK":1} |
| riskGeometryRepairLaneCounts | {"not_applicable":4,"TARGET_NO_TRADE":2,"RISK_GEOMETRY_PROOF_INCOMPLETE":1} |
| breakoutRetestProofConfirmedCounts | {"true":1,"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":2} |

Blocker classification health: **pass_blocker_classification_specific**. Ambiguous buckets: none

Root cause summary: {"structureWaitRootCauses":{},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":2,"STOP_GEOMETRY_RECALIBRATION_REQUIRED":1},"qualityGateRootCauses":{"weak_pillar_execution_gate":1}}

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-06-26T14:18:33.755Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | pass_report_only | 2026-06-26T14:18:36.120Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | pass_executable_present_focus_fields_ok | 2026-06-30T15:34:52.682Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-06-30T10:15:09.984Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pending_fresh_stage6_after_expected_head | 2026-07-01T23:22:22.419Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-07-01T15:01:23.601Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-06-22T16:07:32.922Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-22T16:07:34.780Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.
- Wait for the next Auto-Scheduler run on 2c9b66ee or later, then verify Stage6 entry/fillability evidence fields: fillabilityPolicyVerdict.
- Data freshness policy is warn_stale_stage_artifacts_for_policy_tuning; refresh same-run Stage3/4/5/6 artifacts before tuning producer thresholds from stale evidence.
- Defer Stage6 producer tuning track target_recalibration until fresh runtime proof passes; do not tune from stale Stage6 evidence.
- Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
