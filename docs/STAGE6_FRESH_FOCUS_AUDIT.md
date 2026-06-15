# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-15T15:09:02.844Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-15_22-50-32.json
- Hash: ba3ad94984d6236a3a3730f00bd498eec017fd091da711973aa221d08c62fb3c
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"earnings_data_coverage":1,"non_actionable_verdict":1} |
| zeroExecutableTuningLaneCounts | {"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":3,"TARGET_RECALIBRATION":1,"NO_ZERO_EXECUTABLE_TUNING_ACTION":1,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| breakoutContinuationConfirmedCounts | {"missing":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"missing":6} |
| riskGeometryTargetRecalibrationCandidateCounts | {"missing":6} |
| blockerCategoryCounts | {"structure":3,"quality_gate":2,"breakout":1} |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 0/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetSource | 0/6 |
| riskGeometryTargetGapPct | 0/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Continuation | Target Source | Target Viability | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| DAVE | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | N/A | N/A | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.31 | 32.52 | 10.37 |
| DUOL | BUY | WAIT_PRICE/wait_earnings_data_missing_quality_floor | quality_gate | earnings_data_coverage | TARGET_RECALIBRATION | false | N/A | N/A | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | N/A | N/A | 19.08 | -13.46 |
| INCY | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | N/A | N/A | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.39 | 7.62 | 5.55 |
| ZVRA | SPECULATIVE_BUY | WAIT_PRICE/wait_verdict_not_sidecar_actionable | quality_gate | non_actionable_verdict | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | N/A | N/A | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 4.39 | 18.69 | 119.08 |
| CRMD | BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | false | N/A | N/A | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 3.78 | 19.07 | 76.65 |
| ASB | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | N/A | N/A | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.25 | 14.14 | 3.85 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
