# Stage3-6 Full Stage Audit

- GeneratedAt: 2026-06-23T05:55:23.174Z
- Overall: **warn_lineage_incomplete**
- Lineage: **warn_lineage_incomplete**; final quality judgement: **withheld**
- Stage6 Runtime Proof: **pass_runtime_proof_fields_present**
- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.

## Lineage

| Edge | Producer Source | Local Artifact | Match |
| --- | --- | --- | --- |
| Stage4<-Stage3 | STAGE3_FUNDAMENTAL_FULL_2026-06-23_00-40-55.json | STAGE3_FUNDAMENTAL_FULL_2026-06-23_00-40-55.json | true |
| Stage5<-Stage4 | missing | STAGE4_TECHNICAL_FULL_2026-06-23_01-02-53.json | N/A |
| Stage6<-Stage5 | STAGE5_ICT_ELITE_50_2026-06-23_01-03-03.json | STAGE5_ICT_ELITE_50_2026-06-23_01-03-03.json | true |

Reasons: stage5_source_stage4_missing

## Stage Verdicts

| Stage | Verdict | Rows | Source | Coverage |
| --- | --- | --- | --- | --- |
| Stage3 | audited_report_only | 300 | STAGE3_FUNDAMENTAL_FULL_2026-06-23_00-40-55.json | fundamentalScore:300/300<br>compositeAlpha:300/300<br>qualityScore:300/300<br>integrityReasons:35/300<br>isImputed:300/300<br>dataQuality:300/300<br>roicDebtSource:300/300 |
| Stage4 | audited_report_only | 300 | STAGE4_TECHNICAL_FULL_2026-06-23_01-02-53.json | technicalScore:300/300<br>technicalScoreFinal:0/300<br>techMetrics:300/300<br>priceHistory:300/300<br>dataSource:300/300<br>dataQualityScore:0/300<br>liquidityState:0/300 |
| Stage5 | audited_report_only | 50 | STAGE5_ICT_ELITE_50_2026-06-23_01-03-03.json | ictScore:50/50<br>ictMetrics:50/50<br>executionBox:0/50<br>geometrySource:0/50<br>pdZone:50/50<br>dataQualityMultiplier:0/50 |
| Stage6 | audited_runtime_proof_present | 2 | STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json | weakPillarExecutionGate:0/2<br>qualityGateLane:0/2<br>zeroExecutableTuningLane:2/2<br>targetRecalibrationViabilityVerdict:2/2<br>riskGeometryRepairLane:2/2<br>breakoutRetestProofConfirmed:2/2 |

## Stage6 Runtime Proof Gate

Expected producer head: e3708e2f_or_later

| Field | Present / Total | Pct |
| --- | --- | --- |
| targetRecalibrationExecutionFloorViable | 0/2 | 0 |
| riskGeometryTargetRecalibrationProofReady | 0/2 | 0 |
| riskGeometryRrAtRequiredTargetAndRecalculatedStop | 0/2 | 0 |
| breakoutRetestProofUndercutReclaimFound | 0/2 | 0 |
| zeroExecutableTuningLane | 2/2 | 100 |
| structurePolicyBlockerLane | 2/2 | 100 |
| qualityGateLane | 0/2 | 0 |

Raw finalist-only missing fields (non-blocking; subreport proof passed): targetRecalibrationExecutionFloorViable, riskGeometryTargetRecalibrationProofReady, riskGeometryRrAtRequiredTargetAndRecalculatedStop, breakoutRetestProofUndercutReclaimFound, qualityGateLane

## Blocker Summary

| Metric | Counts |
| --- | --- |
| blockerCategoryCounts | {"entry_distance":1,"risk_geometry":3,"target_recalibration":1,"other":1,"breakout":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"TARGET_RECALIBRATION":2,"RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1} |
| qualityGateLaneCounts | {"unknown":2} |
| structurePolicyBlockerLaneCounts | {"not_applicable":2} |
| riskGeometryRepairLaneCounts | {"not_applicable":2} |
| breakoutRetestProofConfirmedCounts | {"false":1,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":2} |

Root cause summary: {"structureWaitRootCauses":{},"riskGeometryRootCauses":{"RISK_GEOMETRY_INVALID_NO_TRADE":2,"STOP_GEOMETRY_RECALIBRATION_REQUIRED":1},"qualityGateRootCauses":{"QUALITY_GATE_REASON_UNRESOLVED":1}}

## Integrated Subreports

| Report | Present | Overall | GeneratedAt | Path |
| --- | --- | --- | --- | --- |
| stage35Methodology | yes | pass_full_artifact_methodology_review | 2026-06-22T16:07:22.777Z | state/stage3-5-methodology-audit.json |
| stage35QuantQuality | yes | review_required_medium | 2026-06-23T05:33:14.465Z | state/stage3-5-quant-quality-audit.json |
| stage6FreshFocus | yes | warn_formula_contract_missing_or_mismatch | 2026-06-23T05:55:22.625Z | state/stage6-fresh-focus-audit.json |
| stage6FormulaTuningBacklog | yes | pass_formula_tuning_backlog_ready | 2026-06-22T23:54:23.322Z | state/stage6-formula-tuning-backlog.json |
| stage6RuntimeFormulaContractProof | yes | pass_formula_contract_present_executable_candidates_exist | 2026-06-23T00:05:11.494Z | state/stage6-runtime-formula-contract-proof.json |
| stage6FormulaBacklogAlignment | yes | pass_formula_audit_backlog_alignment | 2026-06-23T05:55:22.016Z | state/stage6-formula-audit-backlog-alignment.json |
| stage6BlockerRootCause | yes | not_available | 2026-06-22T16:07:32.922Z | state/stage6-blocker-root-cause-audit.json |
| stage6QualityTrend | yes | not_available | 2026-06-22T16:07:34.780Z | state/stage6-quality-trend-audit.json |

## Next Actions

- Refresh or download same-run Stage3/4/5/6 artifacts before making a final full-chain quality judgement.
- Add or verify Stage5 manifest sourceStage4File/stage4File lineage so Stage4->Stage5 same-run ownership can be proven.
- Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.

## Interpretation

- This report does not prove alpha performance or live readiness.
- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.
- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.
- Broker submit/reprice/replace and sidecar mutation are outside this audit.
