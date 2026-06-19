# Stage3-5 Methodology Audit

- GeneratedAt: 2026-06-19T16:13:38.029Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-19_22-40-48.json
- Stage6Hash: bc5b6cafebe8f657fc7a402cb34cd7e0a1291c5591fa062d600ab8ff41773cb6
- Overall: **fail_methodology_contract_violation**
- Safety: report-only; no broker/state mutation.

## Methodology Scores

| Stage | Score | Artifact Mode | Main Risk |
| --- | ---: | --- | --- |
| Stage3 | 67/100 | stage6_finalist_fallback | Stage3 artifact rows violate bounded score contract. |
| Stage4 | 92/100 | stage6_finalist_fallback | none |
| Stage5 | 92/100 | stage6_finalist_fallback | none |
| InterStage | 77/100 | stage6_contract | Stage6 artifact contains executable rows with weak Stage3/4/5 pillar. |

## Artifact Sources

| Stage | Mode | File | Rows | Hash |
| --- | --- | --- | ---: | --- |
| Stage3 | stage6_finalist_fallback | Stage6 finalist fallback | 5 | N/A |
| Stage4 | stage6_finalist_fallback | Stage6 finalist fallback | 5 | N/A |
| Stage5 | stage6_finalist_fallback | Stage6 finalist fallback | 5 | N/A |
| InterStage | stage6_contract | STAGE6_ALPHA_FINAL_2026-06-19_22-40-48.json | 5 | bc5b6cafebe8 |

## Findings

| Severity | Stage | ID | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| critical | Stage3 | stage3_score_bounds_violation_in_artifact | [{"symbol":"ACAD","fundamentalScore":100.5846886648797,"compositeAlpha":76.53}] | Fresh Stage3 should regenerate after clamp fix; do not use stale artifacts for final policy judgement. |
| high | InterStage | stage6_weak_pillar_executable_in_artifact | [{"symbol":"ACAD","fundamentalScore":100.5846886648797,"technicalScore":48.46,"ictScore":92.34,"weakPillarGateVerdict":null}] | Fresh Stage6 should route these to WAIT_PRICE/wait_weak_pillar_execution_gate after weak-pillar gate fix. |

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
| Stage6 | yes | stage6_breakout_proof_gate | components/AlphaAnalysis.tsx | 8644 |

## Artifact Audit Snapshot

### Stage3

| Metric | Value |
| --- | --- |
| rows | 5 |
| scoreStats | {"count":5,"min":64.04,"max":100.58,"avg":80.1} |
| dataQualityCounts | {"HIGH":5} |

### Stage4

| Metric | Value |
| --- | --- |
| rows | 5 |
| scoreStats | {"count":5,"min":48.46,"max":99,"avg":81.61} |
| dataSourceCounts | {"DRIVE":5} |

### Stage5

| Metric | Value |
| --- | --- |
| rows | 5 |
| scoreStats | {"count":5,"min":71.17,"max":96.42,"avg":88.03} |
| pdZoneCounts | {"DISCOUNT":3,"PREMIUM":2} |

## Interpretation

- This audit evaluates methodology, not realized alpha performance.
- Full confidence requires full Stage3/Stage4/Stage5 artifacts; Stage6 finalist fallback is useful but incomplete.
- Score bounds, data lineage, fallback visibility, and weak-pillar contracts are prerequisites before tuning structure/breakout/target policies.
