# Stage3-5 Quant Quality Audit

- GeneratedAt: 2026-06-23T07:33:55.124Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-23_01-06-52.json
- Hash: b149b044845b848196bfd08608b6e2f71ecca9634499ccea806a8c637259b49a
- Stage6 finalist rows audited: 2
- Stage3 rows audited: 300
- Stage4 rows audited: 300
- Stage5 rows audited: 50
- Overall: **pass_report_only**
- Safety: report-only; no broker/state mutation.

## Summary

| Stage | Score | Main Risk |
| --- | ---: | --- |
| Stage3 | 100/100 | none |
| Stage4 | 94/100 | Short technical history was observed, but it did not reach Stage6 executable rows. |
| Stage5 | 100/100 | none |
| Stage5ToStage6 | 100/100 | none |

## Artifact Sources

| Stage | Mode | File | Rows |
| --- | --- | --- | ---: |
| Stage3 | full_stage_artifact | STAGE3_FUNDAMENTAL_FULL_2026-06-23_00-40-55.json | 300 |
| Stage4 | full_stage_artifact | STAGE4_TECHNICAL_FULL_2026-06-23_01-02-53.json | 300 |
| Stage5 | full_stage_artifact | STAGE5_ICT_ELITE_50_2026-06-23_01-03-03.json | 50 |

## Findings

| Severity | Stage | ID | Evidence | Recommendation | File | Line |
| --- | --- | --- | --- | --- | --- | ---: |
| low | Stage4 | stage4_short_history_non_executable_observation | [{"symbol":"PAYP","bars":70,"dataSource":"DRIVE","dataQualityState":"NORMAL","technicalScore":7.72,"promotedToStage5":false,"presentInStage6":false,"executableInStage6":false,"stage6Decision":null}] | Keep this visible as data-quality telemetry; escalate only if a short-history row is promoted to executable. | N/A | 0 |
| low | Stage4 | stage4_ohlcv_relative_stale_non_promoted_observation | [{"symbol":"LC","lastDate":"2026-06-18","lagDaysFromMax":4,"bars":120,"dataSource":"DRIVE","dataQualityState":"THIN","technicalScore":78.24,"promotedToStage5":false,"presentInStage6":false,"executableInStage6":false,"stage6Decision":null}] | Keep this as data-quality telemetry; escalate only if stale rows are promoted or become executable. | N/A | 0 |

## Latest Row Score Table

| Symbol | Decision | Fund | Quality | Tech | TechFinal | ICT | DataSource | Bars | DataQuality | ICT Zone | Geometry |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| ACAD | EXECUTABLE_NOW/executable_pullback | 100 | 92.9 | 51.05 | 51.05 | 79.88 | DRIVE | 120 | THIN | DISCOUNT | RECENT_SWING_ATR |
| FFBC | EXECUTABLE_NOW/executable_current_recalculated_stop | 70.77 | 77.5 | 86.37 | 86.37 | 75.07 | DRIVE | 120 | THIN | PREMIUM | RECENT_SWING_ATR |

## Stage Coverage

### Stage3

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":4.51,"max":100,"avg":59.94} |
| scoreSemanticsContract | {"dataDictionaryPresent":true,"boundsFixturePresent":true,"status":"documented_expected_divergence"} |
| sectorBonusStats | {"sectorBonusRows":66,"rawAfterSectorAbove100Rows":21,"clampAppliedRows":21} |
| imputationStats | {"imputedCount":0,"imputedPct":0,"integrityReasonsCoveragePct":100,"roicDebtSourceCoveragePct":100,"imputedStage6Rows":0,"imputedExecutableRows":0,"missingRoicDebtSourceRows":0,"missingRoicDebtSourceExecutableRows":0} |
| compositeAlphaStats | {"count":300,"min":9.88,"max":100,"avg":55.71} |
| dataQualityCounts | HIGH:300 |

### Stage4

| Metric | Value |
| --- | --- |
| scoreStats | {"count":300,"min":1,"max":96,"avg":37.03} |
| shortHistoryPolicy | {"policyPresent":true,"shortHistoryRows":1,"shortHistoryExecutableRows":0,"shortHistoryPromotedRows":0,"shortHistoryTelemetryOnlyRows":1,"status":"short_history_non_executable_observation"} |
| historyFreshness | {"maxLastDate":"2026-06-22","missingLastDateRows":[],"staleRelativeRows":[{"symbol":"LC","lastDate":"2026-06-18","lagDaysFromMax":4,"bars":120,"dataSource":"DRIVE","dataQualityState":"THIN","technicalScore":78.24,"promotedToStage5":false,"presentInStage6":false,"executableInStage6":false,"stage6Decision":null}],"staleRelativeRowsPromotedCount":0,"staleRelativeRowsExecutableCount":0,"staleRelativeRowsTelemetryOnlyCount":1} |
| dataSourceCounts | DRIVE:300 |
| techDataQualityCounts | THIN:271, NORMAL:29 |

### Stage5

| Metric | Value |
| --- | --- |
| scoreStats | {"count":50,"min":46.08,"max":93.07,"avg":71.85} |
| pdZoneCounts | PREMIUM:38, DISCOUNT:11, EQUILIBRIUM:1 |
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
