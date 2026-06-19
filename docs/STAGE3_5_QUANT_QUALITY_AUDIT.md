# Stage3-5 Quant Quality Audit

- GeneratedAt: 2026-06-19T23:35:46.762Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Hash: 2ea6fd5b26acbe89c2334543e1a94c10f9629c2b9e7904e353cfebfc0342d207
- Stage6 finalist rows audited: 3
- Stage3 rows audited: 300
- Stage4 rows audited: 300
- Stage5 rows audited: 50
- Overall: **pass_report_only**
- Safety: report-only; no broker/state mutation.

## Summary

| Stage | Score | Main Risk |
| --- | ---: | --- |
| Stage3 | 100/100 | none |
| Stage4 | 97/100 | Short technical history was observed, but it did not reach Stage6 executable rows. |
| Stage5 | 100/100 | none |
| Stage5ToStage6 | 100/100 | none |

## Artifact Sources

| Stage | Mode | File | Rows |
| --- | --- | --- | ---: |
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-20_01-37-55.json | 300 |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-20_01-59-17.json | 300 |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-20_01-59-27.json | 50 |

## Findings

| Severity | Stage | ID | Evidence | Recommendation | File | Line |
| --- | --- | --- | --- | --- | --- | ---: |
| low | Stage4 | stage4_short_history_non_executable_observation | [{"symbol":"PAYP","bars":69}] | Keep this visible as data-quality telemetry; escalate only if a short-history row is promoted to executable. | N/A | 0 |

## Latest Row Score Table

| Symbol | Decision | Fund | Quality | Tech | TechFinal | ICT | DataSource | Bars | DataQuality | ICT Zone | Geometry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| IDCC | EXECUTABLE_NOW/executable_pullback | 64.04 | 98.4 | 99 | 99 | 96.42 | DRIVE | 120 | NORMAL | DISCOUNT | RECENT_SWING_ATR |
| ANET | EXECUTABLE_NOW/executable_current_recalculated_stop | 67.43 | 95.5 | 89.77 | 89.77 | 90.69 | DRIVE | 120 | NORMAL | PREMIUM | RECENT_SWING_ATR |
| WSBC | WAIT_PRICE/wait_earnings_data_missing_quality_floor | 71.69 | 79.8 | 99 | 99 | 83.22 | DRIVE | 120 | NORMAL | PREMIUM | RECENT_SWING_ATR |

## Stage Coverage

### Stage3

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":4.51,"max":100,"avg":59.4} |
| scoreSemanticsContract | {"dataDictionaryPresent":true,"boundsFixturePresent":true,"status":"documented_expected_divergence"} |
| dataQualityCounts | HIGH:300 |

### Stage4

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":1,"max":99,"avg":53.68} |
| shortHistoryPolicy | {"policyPresent":true,"shortHistoryRows":1,"shortHistoryExecutableRows":0,"status":"short_history_non_executable_observation"} |
| dataSourceCounts | DRIVE:300 |
| techDataQualityCounts | NORMAL:226, THIN:74 |

### Stage5

| Metric | Value |
| --- | --- |
| scoreStats | {"count":50,"min":67.41,"max":100,"avg":85.9} |
| pdZoneCounts | PREMIUM:31, DISCOUNT:18, EQUILIBRIUM:1 |
| geometrySourceCounts | RECENT_SWING_ATR:50 |

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
| Stage6Bridge | yes | stage6_final_gate_pillars | components/AlphaAnalysis.tsx | 5404 |

## Interpretation

- This audit is not a backtest and does not prove alpha performance.
- It checks score-scale integrity, evidence coverage, formula guardrails, and Stage3->Stage5->Stage6 traceability.
- For full-stage coverage, provide `STAGE35_AUDIT_STAGE3_PATH`, `STAGE35_AUDIT_STAGE4_PATH`, and `STAGE35_AUDIT_STAGE5_PATH`, or place artifacts under `state/stage3-audit-source`, `state/stage4-audit-source`, and `state/stage5-audit-source`.
- Formula changes should be made only after this report identifies a bounded, testable defect.
