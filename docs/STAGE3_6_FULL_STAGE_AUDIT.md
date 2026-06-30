# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-06-29T23:51:12.327Z
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
| stage3 | 300 | {"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0},"qualityScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"source":{"V13_Cylinder":300},"quoteSource":{"YFINANCE_INFO":300},"netIncomeSource":{"INFO":298,"HISTORY":2},"roicDebtSource":{"ABSOLUTE":300}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"netIncomeAsOf":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":6.32},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":7.16},"netIncomeAsOf":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-03-31T00:00:00.000Z","latest":"2026-06-23T06:54:07.000Z","maxAgeDays":90.99}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"fundamentalScoreClampApplied":{"false":278,"true":22}} | N/A |
| stage4 | 300 | {"technicalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"scoreBreakdown.finalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":300},"dataSource":{"DRIVE":300},"quoteSource":{"YFINANCE_INFO":300},"techMetrics.dataQualityState":{"THIN":250,"NORMAL":50}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"lastUpdate":{"present":300,"total":300,"pct":100}} | {"updated":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":6.32},"quoteTimestamp":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":7.16},"lastUpdate":{"present":300,"total":300,"parsed":300,"pct":100,"oldest":"2026-06-23T16:22:46.575Z","latest":"2026-06-23T16:26:17.502Z","maxAgeDays":6.31}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"isTechnicalBreakout":{"false":202,"true":98}} | {"present":300,"total":300,"minBars":70,"maxBars":120,"shortHistoryRowsLt80":1,"missingHistoryRows":0,"lastBarDateCoverage":{"present":300,"total":300,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-23","maxLastBarAgeDays":7.99} |
| stage5 | 50 | {"ictScore":{"present":50,"total":50,"min":47.05,"max":100,"outOfBounds":0},"technicalScore":{"present":50,"total":50,"min":12,"max":99,"outOfBounds":0},"fundamentalScore":{"present":50,"total":50,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":50,"total":50,"min":54.62,"max":100,"outOfBounds":0}} | {"dataQuality":{"HIGH":50},"dataSource":{"DRIVE":50},"executionGeometrySource":{"RECENT_SWING_ATR":50},"factorCarryGuard":{"THIN_REDUCED":34,"NORMAL":16},"compositeBreakdown.dataQualityMultiplier":{"1":16,"0.97":34}} | {"updated":{"present":50,"total":50,"pct":100},"quoteTimestamp":{"present":50,"total":50,"pct":100},"lastUpdate":{"present":50,"total":50,"pct":100}} | {"updated":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-23T16:04:32.883Z","latest":"2026-06-23T16:04:56.680Z","maxAgeDays":6.32},"quoteTimestamp":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-22T20:00:00.000Z","latest":"2026-06-22T20:08:00.000Z","maxAgeDays":7.16},"lastUpdate":{"present":50,"total":50,"parsed":50,"pct":100,"oldest":"2026-06-23T16:22:46.575Z","latest":"2026-06-23T16:26:17.502Z","maxAgeDays":6.31}} | {"isImputed":{"false":50},"cashflowProxyUsed":{"false":50},"isDataDoubtful":{"false":50}} | {"present":50,"total":50,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":50,"total":50,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-23","maxLastBarAgeDays":7.99} |
| stage6 | 1 | {"convictionScore":{"present":1,"total":1,"min":100,"max":100,"outOfBounds":0},"expectedReturn":{"present":0,"total":1,"min":null,"max":null,"outOfBounds":0},"fundamentalScore":{"present":1,"total":1,"min":75.87,"max":75.87,"outOfBounds":0},"technicalScore":{"present":1,"total":1,"min":73.73,"max":73.73,"outOfBounds":0},"ictScore":{"present":1,"total":1,"min":77.98,"max":77.98,"outOfBounds":0}} | {"dataQuality":{"HIGH":1},"aiProvider":{"PERPLEXITY_FALLBACK":1},"finalDecision":{"EXECUTABLE_NOW":1},"decisionReason":{"executable_current_recalculated_stop":1},"zeroExecutableTuningLane":{"NO_ZERO_EXECUTABLE_TUNING_ACTION":1}} | {"updated":{"present":1,"total":1,"pct":100},"quoteTimestamp":{"present":1,"total":1,"pct":100},"lastUpdate":{"present":1,"total":1,"pct":100}} | {"updated":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-23T16:04:39.143Z","latest":"2026-06-23T16:04:39.143Z","maxAgeDays":6.32},"quoteTimestamp":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-22T20:00:01.000Z","latest":"2026-06-22T20:00:01.000Z","maxAgeDays":7.16},"lastUpdate":{"present":1,"total":1,"parsed":1,"pct":100,"oldest":"2026-06-23T16:24:08.325Z","latest":"2026-06-23T16:24:08.325Z","maxAgeDays":6.31}} | {"aiFallbackDetected":{"false":1},"breakoutRetestProofConfirmed":{"true":1}} | {"present":1,"total":1,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0,"lastBarDateCoverage":{"present":1,"total":1,"pct":100},"oldestLastBarDate":"2026-06-22","latestLastBarDate":"2026-06-22","maxLastBarAgeDays":7.99} |

Data health findings:

| Stage | Category | Field | Finding | Range / Coverage |
| --- | --- | --- | --- | --- |
| stage3 | freshness_age | updated | max age 6.32d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage3 | freshness_age | quoteTimestamp | max age 7.16d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage4 | price_history_freshness | priceHistory.lastBarDate | max age 7.99d | 2026-06-22..2026-06-23 |
| stage4 | freshness_age | updated | max age 6.32d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage4 | freshness_age | quoteTimestamp | max age 7.16d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage4 | freshness_age | lastUpdate | max age 6.31d | 2026-06-23T16:22:46.575Z..2026-06-23T16:26:17.502Z |
| stage5 | price_history_freshness | priceHistory.lastBarDate | max age 7.99d | 2026-06-22..2026-06-23 |
| stage5 | freshness_age | updated | max age 6.32d | 2026-06-23T16:04:32.883Z..2026-06-23T16:04:56.680Z |
| stage5 | freshness_age | quoteTimestamp | max age 7.16d | 2026-06-22T20:00:00.000Z..2026-06-22T20:08:00.000Z |
| stage5 | freshness_age | lastUpdate | max age 6.31d | 2026-06-23T16:22:46.575Z..2026-06-23T16:26:17.502Z |
| stage6 | price_history_freshness | priceHistory.lastBarDate | max age 7.99d | 2026-06-22..2026-06-22 |
| stage6 | freshness_age | updated | max age 6.32d | 2026-06-23T16:04:39.143Z..2026-06-23T16:04:39.143Z |
| stage6 | freshness_age | quoteTimestamp | max age 7.16d | 2026-06-22T20:00:01.000Z..2026-06-22T20:00:01.000Z |
| stage6 | freshness_age | lastUpdate | max age 6.31d | 2026-06-23T16:24:08.325Z..2026-06-23T16:24:08.325Z |

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
| stage6FreshFocus | yes | pass_executable_present_focus_fields_ok | 2026-06-29T23:49:35.794Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-06-24T23:17:57.616Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pending_fresh_stage6_after_expected_head | 2026-06-29T23:49:36.504Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-06-26T14:18:42.945Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-06-22T16:07:32.922Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-22T16:07:34.780Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.
- Wait for the next Auto-Scheduler run on 2c9b66ee or later, then verify Stage6 entry/fillability evidence fields: fillabilityPolicyVerdict.
- Defer Stage6 producer tuning track target_recalibration until fresh runtime proof passes; do not tune from stale Stage6 evidence.
- Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
