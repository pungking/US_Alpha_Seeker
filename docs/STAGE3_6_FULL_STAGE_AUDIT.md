# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-06-22T15:34:26.209Z
- Overall: **warn_lineage_mismatch**
- Lineage: **warn_lineage_mismatch**; final quality judgement: **withheld**
- Stage6 Runtime Proof: **pending_fresh_runtime_proof_after_e3708e2f**
- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.

## Lineage

| Edge | Producer Source | Local Artifact | Match |
| --- | --- | --- | --- |
| Stage4<-Stage3 | STAGE3_FUNDAMENTAL_FULL_2026-06-20_01-37-55.json | STAGE3_FUNDAMENTAL_FULL_2026-06-20_01-37-55.json | true |
| Stage5<-Stage4 | missing | STAGE4_TECHNICAL_FULL_2026-06-20_01-59-17.json | N/A |
| Stage6<-Stage5 | STAGE5_ICT_ELITE_50_2026-06-20_09-23-37.json | STAGE5_ICT_ELITE_50_2026-06-20_01-59-27.json | false |

Reasons: stage6_source_stage5_mismatch, stage5_source_stage4_missing

## Stage Verdicts

| Stage | Verdict | Rows | Source | Coverage |
| --- | --- | --- | --- | --- |
| Stage3 | audited_report_only | 300 | STAGE3_FUNDAMENTAL_FULL_2026-06-20_01-37-55.json | fundamentalScore:300/300<br>compositeAlpha:300/300<br>qualityScore:300/300<br>integrityReasons:40/300<br>isImputed:300/300<br>dataQuality:300/300<br>roicDebtSource:300/300 |
| Stage4 | audited_report_only | 300 | STAGE4_TECHNICAL_FULL_2026-06-20_01-59-17.json | technicalScore:300/300<br>technicalScoreFinal:0/300<br>techMetrics:300/300<br>priceHistory:300/300<br>dataSource:300/300<br>dataQualityScore:0/300<br>liquidityState:0/300 |
| Stage5 | audited_report_only | 50 | STAGE5_ICT_ELITE_50_2026-06-20_01-59-27.json | ictScore:50/50<br>ictMetrics:50/50<br>executionBox:0/50<br>geometrySource:0/50<br>pdZone:50/50<br>dataQualityMultiplier:0/50 |
| Stage6 | warn_runtime_proof_pending | 3 | STAGE6_ALPHA_FINAL_2026-06-20_09-26-37.json | weakPillarExecutionGate:0/3<br>qualityGateLane:0/3<br>zeroExecutableTuningLane:3/3<br>targetRecalibrationViabilityVerdict:3/3<br>riskGeometryRepairLane:3/3<br>breakoutRetestProofConfirmed:3/3 |

## Stage6 Runtime Proof Gate

Expected producer head: e3708e2f_or_later

| Field | Present / Total | Pct |
| --- | --- | --- |
| targetRecalibrationExecutionFloorViable | 0/3 | 0 |
| riskGeometryTargetRecalibrationProofReady | 0/3 | 0 |
| riskGeometryRrAtRequiredTargetAndRecalculatedStop | 0/3 | 0 |
| breakoutRetestProofUndercutReclaimFound | 0/3 | 0 |
| zeroExecutableTuningLane | 3/3 | 100 |
| structurePolicyBlockerLane | 3/3 | 100 |
| qualityGateLane | 0/3 | 0 |

Missing/Pending fields: targetRecalibrationExecutionFloorViable, riskGeometryTargetRecalibrationProofReady, riskGeometryRrAtRequiredTargetAndRecalculatedStop, breakoutRetestProofUndercutReclaimFound, qualityGateLane

## Blocker Summary

| Metric | Counts |
| --- | --- |
| blockerCategoryCounts | {"risk_geometry":3,"entry_distance":1,"structure":1,"breakout":2} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":1,"TARGET_RECALIBRATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":2} |
| qualityGateLaneCounts | {"unknown":3} |
| structurePolicyBlockerLaneCounts | {"not_applicable":3} |
| riskGeometryRepairLaneCounts | {"not_applicable":3} |
| breakoutRetestProofConfirmedCounts | {"true":3} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":6,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |

Root cause summary: {"structureWaitRootCauses":{"STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED":1},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":1},"qualityGateRootCauses":{}}

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-06-22T15:34:13.578Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | pass_report_only | 2026-06-22T15:34:14.669Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | warn_formula_bottleneck_fields_missing | 2026-06-21T17:19:24.259Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | warn_formula_tuning_contract_incomplete | 2026-06-21T23:10:50.693Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pending_fresh_stage6_after_expected_head | 2026-06-21T23:18:14.842Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-06-22T15:16:30.297Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-06-21T17:42:44.668Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-21T17:42:45.323Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Refresh or download same-run Stage3/4/5/6 artifacts before making a final full-chain quality judgement.
- Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.
- Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
