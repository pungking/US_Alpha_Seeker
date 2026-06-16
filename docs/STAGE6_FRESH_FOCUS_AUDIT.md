# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-16T04:59:14.177Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_13-54-55.json
- Hash: 0232b5ab0b1ec37a9b2d585631f61617a9ad19485ce1359794ef23075811bbd4
- Overall: **pass_executable_present_focus_fields_ok**
- Rows: 7
- Executable Rows: 2
- Contract Executable Picks: 2
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":2,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":4,"TARGET_RECALIBRATION":1} |
| breakoutRetestProofConfirmedCounts | {"true":2,"false":5} |
| breakoutContinuationConfirmedCounts | {"false":7} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":6,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"actual_stop_risk":7} |
| riskGeometryTargetRecalibrationCandidateCounts | {"missing":6,"false":1} |
| blockerCategoryCounts | {"risk_geometry":3,"structure":4} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 7/7 |
| breakoutRetestProofConfirmed | 7/7 |
| breakoutRetestProofContinuationConfirmed | 7/7 |
| breakoutRetestPromotionPolicyDecision | 7/7 |
| breakoutRetestPromotionBlockedBy | 7/7 |
| targetRecalibrationViabilityVerdict | 7/7 |
| targetRecalibrationRequiredTargetByBufferPrice | 7/7 |
| targetRecalibrationRequiredTargetByRrPrice | 7/7 |
| targetRecalibrationSourcePrice | 7/7 |
| targetRecalibrationSourceStopPrice | 7/7 |
| targetRecalibrationStopDistanceAtCurrent | 7/7 |
| targetRecalibrationRequiredTargetSource | 7/7 |
| riskGeometryTargetGapPct | 7/7 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | StopDist@Cur | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ERO | STRONG_BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | true | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 31.6313 | 34.2 | 1.745 | N/A | 2 | 0 | 11.36 |
| INCY | STRONG_BUY | EXECUTABLE_NOW/executable_current_recalculated_stop | risk_geometry | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | true | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 105.0394 | 109.087 | 3.5535 | N/A | 2 | 0 | 6.97 |
| DHT | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 19.0344 | 24.687 | 3.1035 | N/A | 0.58 | 7.35 | 9.76 |
| DAVE | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 318.0125 | 519.105 | 105.1775 | N/A | 0.26 | 32.46 | 8.74 |
| LTM | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 56.5058 | 77.124 | 11.132 | N/A | 1.42 | 11.26 | 28.77 |
| DUOL | BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | TARGET_RECALIBRATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 130.8718 | 189.047 | 30.9935 | -18.77 | N/A | 21.1 | -16.33 |
| AUPH | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.48 | 19.141 | 1.5705 | N/A | 0.64 | 8.03 | 6.25 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
