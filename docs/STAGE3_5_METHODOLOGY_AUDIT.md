# Stage3-5 Methodology Audit

- GeneratedAt: 2026-06-24T00:30:56.319Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Stage6Hash: ea95063da8d317a9815b98329be26842853ee1678e4db93f385192ac61d12a49
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
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-24_01-08-10.json | 300 | c84abb37a9aa |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-24_01-26-17.json | 300 | 5afb20aa673e |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-24_01-26-27.json | 50 | 3cc7dca68615 |
| InterStage | stage6_contract | STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json | 1 | ea95063da8d3 |

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
| Stage5 | yes | stage5_weighted_composite | components/IctAnalysis.tsx | 997 |
| Stage5 | yes | stage5_stale_multiplier | components/IctAnalysis.tsx | 1046 |
| Stage5 | yes | stage5_geometry_fallback_counter | components/IctAnalysis.tsx | 1144 |
| Stage5 | yes | stage5_ict_metric_components | components/IctAnalysis.tsx | 19 |
| Stage6 | yes | stage6_weak_pillar_gate | components/AlphaAnalysis.tsx | 64 |
| Stage6 | yes | stage6_non_actionable_verdict_gate | components/AlphaAnalysis.tsx | 63 |
| Stage6 | yes | stage6_breakout_proof_gate | components/AlphaAnalysis.tsx | 10103 |

## Artifact Audit Snapshot

### Stage3

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":0,"max":100,"avg":59.54} |
| formulaConsistency | {"compositeFormula":"clamp(qualityScore * 0.3 + fundamentalScore * 0.7)","tolerance":0.15,"mismatches":0,"sample":[]} |
| dataQualityCounts | {"HIGH":300} |

### Stage4

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":1,"max":99,"avg":35.68} |
| formulaConsistency | {"finalScoreContract":"technicalScore == scoreBreakdown.finalScore after all Stage4 overlays","tolerance":0.15,"mismatches":0,"sample":[]} |
| shortHistoryPolicy | {"policyPresent":true,"shortHistoryRows":1,"shortHistoryExecutableRows":0,"status":"short_history_non_executable_observation"} |
| dataSourceCounts | {"DRIVE":300} |

### Stage5

| Metric | Value |
| --- | --- |
| rows | 50 |
| scoreStats | {"count":50,"min":47.05,"max":100,"avg":75.03} |
| formulaConsistency | {"baseWeightContract":"baseFundamentalPart=fundamentalScore*0.20; baseTechnicalPart=technicalScore*0.30; baseIctPart=ictScore*0.50","tolerance":0.15,"mismatches":0,"sample":[]} |
| pdZoneCounts | {"PREMIUM":41,"DISCOUNT":8,"EQUILIBRIUM":1} |

## Interpretation

- This audit evaluates methodology, not realized alpha performance.
- Full confidence requires full Stage3/Stage4/Stage5 artifacts; Stage6 finalist fallback is useful but incomplete.
- Score bounds, data lineage, fallback visibility, and weak-pillar contracts are prerequisites before tuning structure/breakout/target policies.
