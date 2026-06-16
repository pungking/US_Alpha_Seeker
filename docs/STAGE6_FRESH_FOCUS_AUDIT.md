# Stage6 Fresh Focus Audit

- GeneratedAt: 2026-06-16T14:07:47.100Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_22-56-56.json
- Hash: 8598d3408722bfc8a99c53ed8b74b73e63e524f8cb862d095469c46b5566fd23
- Overall: **pass_zero_executable_focus_fields_ok**
- Rows: 6
- Executable Rows: 0
- Contract Executable Picks: 0
- Raw Model Executable Downgraded: 0
- Safety: report-only; no broker/state mutation.

## Required Focus Metrics

| Metric | Value |
| --- | --- |
| latestQualityGateLaneCounts | {} |
| zeroExecutableTuningLaneCounts | {"STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION":5,"TARGET_RECALIBRATION":1} |
| breakoutRetestProofConfirmedCounts | {"false":6} |
| breakoutContinuationConfirmedCounts | {"false":6} |
| targetRecalibrationViabilityVerdictCounts | {"TARGET_VIABILITY_NOT_APPLICABLE":5,"TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT":1} |
| targetRecalibrationRequiredTargetSourceCounts | {"actual_stop_risk":6} |
| riskGeometryTargetRecalibrationCandidateCounts | {"missing":5,"false":1} |
| blockerCategoryCounts | {"structure":5,"target_recalibration":1} |
| rawExecutableDowngrades | [] |

## Field Coverage

| Field | Present / Total |
| --- | ---: |
| zeroExecutableTuningLane | 6/6 |
| breakoutRetestProofConfirmed | 6/6 |
| breakoutRetestProofContinuationConfirmed | 6/6 |
| breakoutRetestPromotionPolicyDecision | 6/6 |
| breakoutRetestPromotionBlockedBy | 6/6 |
| targetRecalibrationViabilityVerdict | 6/6 |
| targetRecalibrationRequiredTargetByBufferPrice | 6/6 |
| targetRecalibrationRequiredTargetByRrPrice | 6/6 |
| targetRecalibrationSourcePrice | 6/6 |
| targetRecalibrationSourceStopPrice | 6/6 |
| targetRecalibrationStopDistanceAtCurrent | 6/6 |
| targetRecalibrationRequiredTargetSource | 6/6 |
| riskGeometryTargetGapPct | 6/6 |

## Row Focus

| Symbol | Verdict | Decision | Category | Quality Lane | Zero-Exec Lane | Breakout Confirmed | Promotion Decision | Promotion BlockedBy | Target Source | Target Viability | Target By Buffer | Target By RR | StopDist@Cur | Risk Target Gap% | RR@Cur | Dist% | TargetBuf% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| AUPH | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 16.5624 | 19.381 | 1.6505 | N/A | 0.56 | 8.48 | 5.72 |
| LTM | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 57.4431 | 79.854 | 12.042 | N/A | 1.24 | 12.71 | 26.67 |
| MLI | STRONG_BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 144.4884 | 189.6195 | 24.6698 | N/A | 0.35 | 16.33 | 6.22 |
| DAVE | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 324.3676 | 537.615 | 111.3475 | N/A | 0.19 | 33.78 | 6.61 |
| VIRT | STRONG_BUY | WAIT_PRICE/wait_target_near_current | target_recalibration | N/A | TARGET_RECALIBRATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT | 60.0696 | 85.6232 | 13.6516 | -12.72 | N/A | 22.24 | -10.1 |
| ASB | BUY | WAIT_PRICE/wait_structure_confirmation_required | structure | N/A | STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION | false | NOT_APPLICABLE | not_breakout_wait | actual_stop_risk | TARGET_VIABILITY_NOT_APPLICABLE | 30.4674 | 37.7741 | 4.0971 | N/A | 0.35 | 12.54 | 4.8 |

## Track Separation

- Stage6 zero-executable tuning belongs to the analysis producer track, not sidecar submit/reprice.
- `ops-health-report=fail` belongs to the alpha-exec-engine protection/guard metadata track and must not be used to tune Stage6 entry policy.
- If zero-executable repeats with clear focus metrics, move to producer tuning: breakout proofConfirmed criteria, target recalibration formula, and risk-geometry recalculation evidence.
