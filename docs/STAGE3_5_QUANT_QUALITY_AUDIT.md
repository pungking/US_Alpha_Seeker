# Stage3-5 Quant Quality Audit

- GeneratedAt: 2026-06-19T14:53:27.344Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-19_22-40-48.json
- Hash: bc5b6cafebe8f657fc7a402cb34cd7e0a1291c5591fa062d600ab8ff41773cb6
- Stage6 finalist rows audited: 5
- Stage3 rows audited: 5
- Stage4 rows audited: 5
- Stage5 rows audited: 5
- Overall: **fail_score_contract_violation**
- Safety: report-only; no broker/state mutation.

## Summary

| Stage | Score | Main Risk |
| --- | ---: | --- |
| Stage3 | 67/100 | fundamentalScore escaped the expected 0-100 score scale. |
| Stage4 | 100/100 | none |
| Stage5 | 100/100 | none |
| Stage5ToStage6 | 85/100 | Executable rows include a weak Stage3/4/5 pillar. |

## Artifact Sources

| Stage | Mode | File | Rows |
| --- | --- | --- | ---: |
| Stage3 | stage6_finalist_fallback | Stage6 finalist fallback | 5 |
| Stage4 | stage6_finalist_fallback | Stage6 finalist fallback | 5 |
| Stage5 | stage6_finalist_fallback | Stage6 finalist fallback | 5 |

## Findings

| Severity | Stage | ID | Evidence | Recommendation | File | Line |
| --- | --- | --- | --- | --- | --- | ---: |
| critical | Stage3 | stage3_fundamental_score_out_of_range | [{"symbol":"ACAD","fundamentalScore":100.5846886648797}] | Clamp or re-normalize Stage3 fundamentalScore after sector/momentum bonuses, then update fixture expectations. | components/FundamentalAnalysis.tsx | 1346 |
| high | Stage5->Stage6 | executable_with_weak_pillar | [{"symbol":"ACAD","finalDecision":"EXECUTABLE_NOW","fundamentalScore":100.5846886648797,"technicalScore":48.46,"ictScore":92.34}] | Require an explicit waiver or downgrade executable status when one pillar is materially weak. | N/A | 0 |
| medium | Stage3 | stage3_score_semantics_ambiguous | [{"symbol":"LIF","fundamentalScore":72.34967446001609,"qualityScore":100,"delta":27.65},{"symbol":"IDCC","fundamentalScore":64.03529531341572,"qualityScore":100,"delta":35.96},{"symbol":"ANET","fundamentalScore":67.42801952971064,"qualityScore":95.5,"delta":28.07}] | Document qualityScore vs fundamentalScore semantics and add a fixture proving expected post-sector-bonus behavior. | N/A | 0 |

## Latest Row Score Table

| Symbol | Decision | Fund | Quality | Tech | TechFinal | ICT | DataSource | Bars | DataQuality | ICT Zone | Geometry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| LIF | EXECUTABLE_NOW/executable_current_recalculated_stop | 72.35 | 100 | 71.81 | 71.81 | 89.53 | DRIVE | 120 | NORMAL | DISCOUNT | RECENT_SWING_ATR |
| IDCC | EXECUTABLE_NOW/executable_pullback | 64.04 | 100 | 99 | 99 | 96.42 | DRIVE | 120 | NORMAL | DISCOUNT | RECENT_SWING_ATR |
| ANET | EXECUTABLE_NOW/executable_current_recalculated_stop | 67.43 | 95.5 | 89.77 | 89.77 | 90.69 | DRIVE | 120 | NORMAL | PREMIUM | RECENT_SWING_ATR |
| ACAD | EXECUTABLE_NOW/executable_pullback | 100.58 | 98.3 | 48.46 | 48.46 | 92.34 | DRIVE | 120 | NORMAL | DISCOUNT | RECENT_SWING_ATR |
| GNTX | EXECUTABLE_NOW/executable_current_recalculated_stop | 96.1 | 91.9 | 99 | 99 | 71.17 | DRIVE | 120 | NORMAL | PREMIUM | RECENT_SWING_ATR |

## Stage Coverage

### Stage3

| Metric | Value |
| --- | --- |
| scoreStats | {"count":5,"min":64.04,"max":100.58,"avg":80.1} |
| dataQualityCounts | HIGH:5 |

### Stage4

| Metric | Value |
| --- | --- |
| scoreStats | {"count":5,"min":48.46,"max":99,"avg":81.61} |
| dataSourceCounts | DRIVE:5 |
| techDataQualityCounts | NORMAL:5 |

### Stage5

| Metric | Value |
| --- | --- |
| scoreStats | {"count":5,"min":71.17,"max":96.42,"avg":88.03} |
| pdZoneCounts | DISCOUNT:3, PREMIUM:2 |
| geometrySourceCounts | RECENT_SWING_ATR:5 |

### Stage5ToStage6

| Metric | Value |
| --- | --- |
| scoreStats | {} |

## Static Formula Evidence

| Stage | Present | Rule | File | Line |
| --- | --- | --- | --- | ---: |
| Stage3 | yes | stage3_integrity_penalty | components/FundamentalAnalysis.tsx | 1246 |
| Stage3 | yes | stage3_sector_bonus_score_clamp | components/FundamentalAnalysis.tsx | 1346 |
| Stage3 | yes | stage3_composite_formula | components/FundamentalAnalysis.tsx | 1356 |
| Stage4 | yes | stage4_data_quality_cap | components/TechnicalAnalysis.tsx | 1554 |
| Stage4 | yes | stage4_illiquid_cap | components/TechnicalAnalysis.tsx | 1559 |
| Stage4 | yes | stage4_displacement_floor | components/TechnicalAnalysis.tsx | 2180 |
| Stage4 | yes | stage4_heuristic_fallback | components/TechnicalAnalysis.tsx | 1766 |
| Stage5 | yes | stage5_risk_on_weights | components/IctAnalysis.tsx | 991 |
| Stage5 | yes | stage5_data_quality_multiplier | components/IctAnalysis.tsx | 1040 |
| Stage5 | yes | stage5_geometry_fallback_counter | components/IctAnalysis.tsx | 1138 |
| Stage6Bridge | yes | stage6_final_gate_pillars | components/AlphaAnalysis.tsx | 5397 |

## Interpretation

- This audit is not a backtest and does not prove alpha performance.
- It checks score-scale integrity, evidence coverage, formula guardrails, and Stage3->Stage5->Stage6 traceability.
- For full-stage coverage, provide `STAGE35_AUDIT_STAGE3_PATH`, `STAGE35_AUDIT_STAGE4_PATH`, and `STAGE35_AUDIT_STAGE5_PATH`, or place artifacts under `state/stage3-audit-source`, `state/stage4-audit-source`, and `state/stage5-audit-source`.
- Formula changes should be made only after this report identifies a bounded, testable defect.
