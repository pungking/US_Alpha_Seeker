# Stage3-5 Quant Quality Audit

- GeneratedAt: 2026-06-24T00:30:57.916Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Hash: ea95063da8d317a9815b98329be26842853ee1678e4db93f385192ac61d12a49
- Stage6 finalist rows audited: 1
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
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-24_01-08-10.json | 300 |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-24_01-26-17.json | 300 |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-24_01-26-27.json | 50 |

## Findings

| Severity | Stage | ID | Evidence | Recommendation | File | Line |
| --- | --- | --- | --- | --- | --- | ---: |
| low | Stage4 | stage4_short_history_non_executable_observation | [{"symbol":"PAYP","bars":70,"dataSource":"DRIVE","dataQualityState":"NORMAL","technicalScore":7.72,"promotedToStage5":false,"presentInStage6":false,"executableInStage6":false,"stage6Decision":null}] | Keep this visible as data-quality telemetry; escalate only if a short-history row is promoted to executable. | N/A | 0 |

## Latest Row Score Table

| Symbol | Decision | Fund | Quality | Tech | TechFinal | ICT | DataSource | Bars | DataQuality | ICT Zone | Geometry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| GOOG | EXECUTABLE_NOW/executable_current_recalculated_stop | 75.87 | 92.8 | 73.73 | 73.73 | 77.98 | DRIVE | 120 | NORMAL | PREMIUM | RECENT_SWING_ATR |

## Stage Coverage

### Stage3

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":0,"max":100,"avg":59.54} |
| scoreSemanticsContract | {"dataDictionaryPresent":true,"boundsFixturePresent":true,"status":"documented_expected_divergence"} |
| sectorBonusStats | {"sectorBonusRows":66,"rawAfterSectorAbove100Rows":22,"clampAppliedRows":22} |
| imputationStats | {"imputedCount":0,"imputedPct":0,"integrityReasonsCoveragePct":100,"roicDebtSourceCoveragePct":100,"imputedStage6Rows":0,"imputedExecutableRows":0,"missingRoicDebtSourceRows":0,"missingRoicDebtSourceExecutableRows":0} |
| compositeAlphaStats | {"count":300,"min":9.88,"max":100,"avg":56.6} |
| dataQualityCounts | HIGH:300 |

### Stage4

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":1,"max":99,"avg":35.68} |
| shortHistoryPolicy | {"policyPresent":true,"shortHistoryRows":1,"shortHistoryExecutableRows":0,"shortHistoryPromotedRows":0,"shortHistoryTelemetryOnlyRows":1,"status":"short_history_non_executable_observation"} |
| historyFreshness | {"maxLastDate":"2026-06-23","missingLastDateRows":[],"staleRelativeRows":[],"staleRelativeRowsPromotedCount":0,"staleRelativeRowsExecutableCount":0,"staleRelativeRowsTelemetryOnlyCount":0} |
| dataSourceCounts | DRIVE:300 |
| techDataQualityCounts | NORMAL:50, THIN:250 |

### Stage5

| Metric | Value |
| --- | --- |
| scoreStats | {"count":50,"min":47.05,"max":100,"avg":75.03} |
| pdZoneCounts | PREMIUM:41, DISCOUNT:8, EQUILIBRIUM:1 |
| geometrySourceCounts | RECENT_SWING_ATR:50 |
| executionGeometryStats | {"fallback52wRows":0,"fallback52wStage6Rows":0,"fallback52wExecutableRows":0,"validEntryStopRows":50,"invalidExecutionBoxRows":0} |

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
| Stage5 | yes | stage5_risk_on_weights | components/IctAnalysis.tsx | 997 |
| Stage5 | yes | stage5_data_quality_multiplier | components/IctAnalysis.tsx | 1046 |
| Stage5 | yes | stage5_geometry_fallback_counter | components/IctAnalysis.tsx | 1144 |
| Stage6Bridge | yes | stage6_final_gate_pillars | components/AlphaAnalysis.tsx | 6541 |

## Interpretation

- This audit is not a backtest and does not prove alpha performance.
- It checks score-scale integrity, evidence coverage, formula guardrails, and Stage3->Stage5->Stage6 traceability.
- For full-stage coverage, provide `STAGE35_AUDIT_STAGE3_PATH`, `STAGE35_AUDIT_STAGE4_PATH`, and `STAGE35_AUDIT_STAGE5_PATH`, or place artifacts under `state/stage3-audit-source`, `state/stage4-audit-source`, and `state/stage5-audit-source`.
- Formula changes should be made only after this report identifies a bounded, testable defect.
