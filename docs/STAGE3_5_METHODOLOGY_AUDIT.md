# Stage3-5 Methodology Audit

- GeneratedAt: 2026-06-23T07:04:55.465Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json
- Stage6Hash: b149b044845b848196bfd08608b6e2f71ecca9634499ccea806a8c637259b49a
- Overall: **pass_full_artifact_methodology_review**
- Safety: report-only; no broker/state mutation.

## Methodology Scores

| Stage | Score | Artifact Mode | Main Risk |
| --- | ---: | --- | --- |
| Stage3 | 100/100 | full_stage_artifact | none |
| Stage4 | 97/100 | full_stage_artifact | Short technical history was observed, but it did not reach Stage6 executable rows. |
| Stage5 | 100/100 | full_stage_artifact | none |
| InterStage | 92/100 | stage6_contract | none |

## Artifact Sources

| Stage | Mode | File | Rows | Hash |
| --- | --- | --- | ---: | --- |
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-23_00-40-55.json | 300 | 487eb0917936 |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-23_01-02-53.json | 300 | d34f4d6621e4 |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-23_01-03-03.json | 50 | e9119680a05f |
| InterStage | stage6_contract | STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json | 2 | b149b044845b |

## Findings

| Severity | Stage | ID | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| low | Stage4 | stage4_short_history_non_executable_observation | [{"symbol":"PAYP","bars":70}] | Keep this visible as data-quality telemetry; escalate only if a short-history row is promoted to executable. |

## Static Method Checks

| Stage | Present | Check | File | Line |
| --- | --- | --- | --- | ---: |
| Stage3 | yes | stage3_score_bounds_clamp | components/FundamentalAnalysis.tsx | 58 |
| Stage3 | yes | stage3_imputation_flag | components/FundamentalAnalysis.tsx | 1187 |
| Stage3 | yes | stage3_integrity_reasons | components/FundamentalAnalysis.tsx | 1223 |
| Stage3 | yes | stage3_roic_debt_source_audit | components/FundamentalAnalysis.tsx | 1113 |
| Stage3 | yes | stage3_zscore_coverage | components/FundamentalAnalysis.tsx | 533 |
| Stage4 | yes | stage4_data_quality_caps | components/TechnicalAnalysis.tsx | 1554 |
| Stage4 | yes | stage4_heuristic_fallback_visible | components/TechnicalAnalysis.tsx | 1766 |
| Stage4 | yes | stage4_price_history_and_metrics | components/TechnicalAnalysis.tsx | 28 |
| Stage4 | yes | stage4_score_breakdown | components/TechnicalAnalysis.tsx | 118 |
| Stage5 | yes | stage5_weighted_composite | components/IctAnalysis.tsx | 994 |
| Stage5 | yes | stage5_stale_multiplier | components/IctAnalysis.tsx | 1043 |
| Stage5 | yes | stage5_geometry_fallback_counter | components/IctAnalysis.tsx | 1141 |
| Stage5 | yes | stage5_ict_metric_components | components/IctAnalysis.tsx | 19 |
| Stage6 | yes | stage6_weak_pillar_gate | components/AlphaAnalysis.tsx | 64 |
| Stage6 | yes | stage6_non_actionable_verdict_gate | components/AlphaAnalysis.tsx | 63 |
| Stage6 | yes | stage6_breakout_proof_gate | components/AlphaAnalysis.tsx | 10103 |

## Artifact Audit Snapshot

### Stage3

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":4.51,"max":100,"avg":59.94} |
| formulaConsistency | {"compositeFormula":"clamp(qualityScore * 0.3 + fundamentalScore * 0.7)","tolerance":0.15,"mismatches":0,"sample":[]} |
| dataQualityCounts | {"HIGH":300} |

### Stage4

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":1,"max":96,"avg":37.03} |
| formulaConsistency | {"finalScoreContract":"technicalScore == scoreBreakdown.finalScore after all Stage4 overlays","tolerance":0.15,"mismatches":0,"sample":[]} |
| shortHistoryPolicy | {"policyPresent":true,"shortHistoryRows":1,"shortHistoryExecutableRows":0,"status":"short_history_non_executable_observation"} |
| dataSourceCounts | {"DRIVE":300} |

### Stage5

| Metric | Value |
| --- | --- |
| rows | 50 |
| scoreStats | {"count":50,"min":46.08,"max":93.07,"avg":71.85} |
| formulaConsistency | {"baseWeightContract":"baseFundamentalPart=fundamentalScore*0.20; baseTechnicalPart=technicalScore*0.30; baseIctPart=ictScore*0.50","tolerance":0.15,"mismatches":0,"sample":[]} |
| pdZoneCounts | {"PREMIUM":38,"DISCOUNT":11,"EQUILIBRIUM":1} |

## Interpretation

- This audit evaluates methodology, not realized alpha performance.
- Full confidence requires full Stage3/Stage4/Stage5 artifacts; Stage6 finalist fallback is useful but incomplete.
- Score bounds, data lineage, fallback visibility, and weak-pillar contracts are prerequisites before tuning structure/breakout/target policies.
