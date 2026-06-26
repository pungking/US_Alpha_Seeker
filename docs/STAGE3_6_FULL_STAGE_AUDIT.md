# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-06-26T04:28:57.207Z
- Overall: **warn_stage6_runtime_proof_pending**
- Lineage: **pass_same_run_lineage**; final quality judgement: **enabled**
- Stage6 Runtime Proof: **pending_fresh_runtime_proof_after_e3708e2f**
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

## Stage Data Health

| Stage | Rows | Score Bounds | Freshness Coverage | Fallback Flags | Price History |
| --- | --- | --- | --- | --- | --- |
| stage3 | 300 | {"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0},"qualityScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"netIncomeAsOf":{"present":300,"total":300,"pct":100}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"fundamentalScoreClampApplied":{"false":278,"true":22}} | N/A |
| stage4 | 300 | {"technicalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"scoreBreakdown.finalScore":{"present":300,"total":300,"min":1,"max":99,"outOfBounds":0},"fundamentalScore":{"present":300,"total":300,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":300,"total":300,"min":9.88,"max":100,"outOfBounds":0}} | {"updated":{"present":300,"total":300,"pct":100},"quoteTimestamp":{"present":300,"total":300,"pct":100},"lastUpdate":{"present":300,"total":300,"pct":100}} | {"isImputed":{"false":300},"cashflowProxyUsed":{"false":300},"isTechnicalBreakout":{"false":202,"true":98}} | {"present":300,"total":300,"minBars":70,"maxBars":120,"shortHistoryRowsLt80":1,"missingHistoryRows":0} |
| stage5 | 50 | {"ictScore":{"present":50,"total":50,"min":47.05,"max":100,"outOfBounds":0},"technicalScore":{"present":50,"total":50,"min":12,"max":99,"outOfBounds":0},"fundamentalScore":{"present":50,"total":50,"min":0,"max":100,"outOfBounds":0},"compositeAlpha":{"present":50,"total":50,"min":54.62,"max":100,"outOfBounds":0}} | {"updated":{"present":50,"total":50,"pct":100},"quoteTimestamp":{"present":50,"total":50,"pct":100},"lastUpdate":{"present":50,"total":50,"pct":100}} | {"isImputed":{"false":50},"cashflowProxyUsed":{"false":50},"isDataDoubtful":{"false":50}} | {"present":50,"total":50,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0} |
| stage6 | 1 | {"convictionScore":{"present":1,"total":1,"min":100,"max":100,"outOfBounds":0},"expectedReturn":{"present":0,"total":1,"min":null,"max":null,"outOfBounds":0},"fundamentalScore":{"present":1,"total":1,"min":75.87,"max":75.87,"outOfBounds":0},"technicalScore":{"present":1,"total":1,"min":73.73,"max":73.73,"outOfBounds":0},"ictScore":{"present":1,"total":1,"min":77.98,"max":77.98,"outOfBounds":0}} | {"updated":{"present":1,"total":1,"pct":100},"quoteTimestamp":{"present":1,"total":1,"pct":100},"lastUpdate":{"present":1,"total":1,"pct":100}} | {"aiFallbackDetected":{"false":1},"breakoutRetestProofConfirmed":{"true":1}} | {"present":1,"total":1,"minBars":120,"maxBars":120,"shortHistoryRowsLt80":0,"missingHistoryRows":0} |

Data health findings: none

## Stage6 Entry / Fillability Evidence

| Field | Present / Total | Pct | Numeric Range |
| --- | --- | --- | --- |
| entryDistancePct | 1/1 | 100 | 0..0 |
| rrAtCurrent | 1/1 | 100 | 2..2 |
| rrAtEntry | 0/1 | 0 | N/A..N/A |
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

Root cause summary: {"structureWaitRootCauses":{},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":2,"STOP_GEOMETRY_RECALIBRATION_REQUIRED":1},"qualityGateRootCauses":{"weak_pillar_execution_gate":1}}

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-06-26T04:24:31.268Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | pass_report_only | 2026-06-26T04:24:33.535Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | pass_executable_present_focus_fields_ok | 2026-06-26T04:24:34.856Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-06-24T23:17:57.616Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pending_fresh_stage6_after_expected_head | 2026-06-25T23:16:57.643Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-06-24T23:18:00.404Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-06-22T16:07:32.922Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-22T16:07:34.780Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.
- Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
