# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-15T23:01:30.548Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_00-50-14.json
- Hash: 72375137d616a85901310237aef79eeba3435cc2c401eaaa20eab0432f16a5d4
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"earnings_data_coverage":1,"non_actionable_verdict":2} |
| zeroExecutableTuningLaneCounts | {"TARGET_RECALIBRATION":1,"NO_ZERO_EXECUTABLE_TUNING_ACTION":2,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":2,"BREAKOUT_PROOF_CONFIRMED_GENERATION":1} |
| breakoutRetestProofConfirmedCounts | {"false":5,"true":1} |
| breakoutContinuationConfirmedCounts | {"false":5,"true":1} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1,"TARGET_VIABILITY_NOT_APPLICABLE":5} |
| targetRecalibrationRequiredTargetSourceCounts | {"actual_stop_risk":6} |
| riskGeometryTargetRecalibrationCandidateCounts | {"missing":6} |
| blockerCategoryCounts | {"quality_gate":3,"structure":2,"breakout":1} |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 6/6 |
| breakoutRetestPromotionPolicyDecision | 0/6 |
| breakoutRetestPromotionBlockedBy | 0/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetSource | 6/6 |
| riskGeometryTargetGapPct | 6/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| DUOL | STRONG_BUY | WAIT_PRICE/wait_earnings_data_missing_quality_floor | quality_gate | earnings_data_coverage | TARGET_RECALIBRATION | false | N/A | none | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | N/A | N/A | 22.82 | -17.47 |
| DAVE | SPECULATIVE_BUY | WAIT_PRICE/wait_verdict_not_sidecar_actionable | quality_gate | non_actionable_verdict | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | N/A | none | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.32 | 32.4 | 10.57 |
| INCY | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | N/A | none | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.41 | 7.44 | 5.76 |
| ZVRA | SPECULATIVE_BUY | WAIT_PRICE/wait_verdict_not_sidecar_actionable | quality_gate | non_actionable_verdict | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | N/A | none | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 4.4 | 18.63 | 119.25 |
| GOOGL | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | N/A | none | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.55 | 18.74 | 16.48 |
| CRMD | BUY | WAIT_PRICE/wait_breakout_retest_required | breakout | N/A | BREAKOUT_PROOF_CONFIRMED_GENERATION | true | N/A | none | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 3.72 | 19.26 | 76.25 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
