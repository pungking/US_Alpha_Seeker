# Stage3-5 Methodology Audit

- GeneratedAt: 2026-06-19T17:03:54.384Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Stage6Hash: 2ea6fd5b26acbe89c2334543e1a94c10f9629c2b9e7904e353cfebfc0342d207
- Overall: **pass_full_artifact_methodology_review**
- Safety: report-only; no broker/state mutation.

## Methodology Scores

| Stage | Score | Artifact Mode | Main Risk |
| --- | ---: | --- | --- |
| Stage3 | 100/100 | full_stage_artifact | none |
| Stage4 | 93/100 | full_stage_artifact | Some Stage4 rows have fewer than 80 bars. |
| Stage5 | 100/100 | full_stage_artifact | none |
| InterStage | 92/100 | stage6_contract | none |

## Artifact Sources

| Stage | Mode | File | Rows | Hash |
| --- | --- | --- | ---: | --- |
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-20_01-37-55.json | 300 | 016e3425e9b3 |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-20_01-59-17.json | 300 | f7bc02461271 |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-20_01-59-27.json | 50 | e1cef12e9dc2 |
| InterStage | stage6_contract | STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json | 3 | 2ea6fd5b26ac |

## Findings

| Severity | Stage | ID | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| medium | Stage4 | stage4_short_price_history | [{"symbol":"PAYP","bars":69}] | Downgrade structure/ICT confidence or block execution promotion when history is short. |

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
| Stage5 | yes | stage5_weighted_composite | components/IctAnalysis.tsx | 991 |
| Stage5 | yes | stage5_stale_multiplier | components/IctAnalysis.tsx | 1040 |
| Stage5 | yes | stage5_geometry_fallback_counter | components/IctAnalysis.tsx | 1138 |
| Stage5 | yes | stage5_ict_metric_components | components/IctAnalysis.tsx | 19 |
| Stage6 | yes | stage6_weak_pillar_gate | components/AlphaAnalysis.tsx | 64 |
| Stage6 | yes | stage6_non_actionable_verdict_gate | components/AlphaAnalysis.tsx | 63 |
| Stage6 | yes | stage6_breakout_proof_gate | components/AlphaAnalysis.tsx | 8652 |

## Artifact Audit Snapshot

### Stage3

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":4.51,"max":100,"avg":59.4} |
| dataQualityCounts | {"HIGH":300} |

### Stage4

| Metric | Value |
| --- | --- |
| rows | 300 |
| scoreStats | {"count":300,"min":1,"max":99,"avg":53.68} |
| dataSourceCounts | {"DRIVE":300} |

### Stage5

| Metric | Value |
| --- | --- |
| rows | 50 |
| scoreStats | {"count":50,"min":67.41,"max":100,"avg":85.9} |
| pdZoneCounts | {"PREMIUM":31,"DISCOUNT":18,"EQUILIBRIUM":1} |

## Interpretation

- This audit evaluates methodology, not realized alpha performance.
- Full confidence requires full Stage3/Stage4/Stage5 artifacts; Stage6 finalist fallback is useful but incomplete.
- Score bounds, data lineage, fallback visibility, and weak-pillar contracts are prerequisites before tuning structure/breakout/target policies.
