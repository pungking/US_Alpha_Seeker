# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-16T01:21:04.826Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_10-06-34.json
- Hash: a15e1c61dadffc837587c775ec51ccd47e02456ddef462f6a95b1e961c20e9ee
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Contract Executable Picks: 0
- Raw Model Executable Downgraded: 2
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {"verdict_unusable":1} |
| zeroExecutableTuningLaneCounts | {"NO_ZERO_EXECUTABLE_TUNING_ACTION":3,"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":2,"TARGET_RECALIBRATION":1} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| breakoutContinuationConfirmedCounts | {"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"actual_stop_risk":6} |
| riskGeometryTargetRecalibrationCandidateCounts | {"false":3,"missing":3} |
| blockerCategoryCounts | {"risk_geometry":3,"structure":2,"quality_gate":1} |
| rawExecutableDowngrades | [{"symbol":"ERO","rawDecision":"EXECUTABLE_NOW","rawReason":"executable_current_recalculated_stop","finalDecision":"BLOCKED_RISK","finalReason":"blocked_invalid_geometry"},{"symbol":"INCY","rawDecision":"EXECUTABLE_NOW","rawReason":"executable_current_recalculated_stop","finalDecision":"BLOCKED_RISK","finalReason":"blocked_invalid_geometry"}] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 6/6 |
| breakoutRetestPromotionPolicyDecision | 6/6 |
| breakoutRetestPromotionBlockedBy | 6/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetSource | 6/6 |
| riskGeometryTargetGapPct | 6/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| ERO | STRONG_BUY | BLOCKED_RISK/blocked_invalid_geometry | risk_geometry | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 0 | N/A | 15.2 | 11.36 |
| INCY | STRONG_BUY | BLOCKED_RISK/blocked_invalid_geometry | risk_geometry | N/A | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 0 | N/A | 6.38 | 6.97 |
| DHT | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.58 | 7.35 | 9.76 |
| DAVE | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.24 | 32.46 | 8.15 |
| DUOL | BUY | BLOCKED_RISK/blocked_rr_below_min | risk_geometry | N/A | TARGET_RECALIBRATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | -18.77 | N/A | 21.1 | -16.33 |
| AUPH | HOLD | BLOCKED_RISK/blocked_quality_verdict_unusable | quality_gate | verdict_unusable | NO_ZERO_EXECUTABLE_TUNING_ACTION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | N/A | 0.64 | 8.03 | 6.25 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
