# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-06-24T00:30:58.688Z
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
| blockerCategoryCounts | {"risk_geometry":3,"target_recalibration":1,"structure":1,"breakout":1,"other":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":2,"TARGET_RECALIBRATION":2,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":1} |
| qualityGateLaneCounts | {"unknown":1} |
| structurePolicyBlockerLaneCounts | {"not_applicable":1} |
| riskGeometryRepairLaneCounts | {"not_applicable":1} |
| breakoutRetestProofConfirmedCounts | {"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":2} |

Root cause summary: {"structureWaitRootCauses":{},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":2,"STOP_GEOMETRY_RECALIBRATION_REQUIRED":1},"qualityGateRootCauses":{"QUALITY_GATE_REASON_UNRESOLVED":1}}

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-06-24T00:30:56.319Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | pass_report_only | 2026-06-24T00:30:57.916Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | pass_executable_present_focus_fields_ok | 2026-06-23T21:51:49.964Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-06-23T21:51:48.943Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pending_fresh_stage6_after_expected_head | 2026-06-24T00:30:57.381Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-06-23T21:51:52.447Z | state/stage6-formula-audit-backlog-alignment.json |
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
