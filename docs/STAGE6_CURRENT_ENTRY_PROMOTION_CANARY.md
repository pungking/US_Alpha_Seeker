# Stage6 Current Entry Promotion Canary

- GeneratedAt: 2026-05-12T05:22:55.399Z
- Stage6: STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json
- Hash: N/A
- Drive Upload: false
- Sidecar Submit: false
- Expected Symbol: INCY
- Verdict: **PASS**

## Policy

| Key | Value |
| --- | ---: |
| adaptiveEnabled | true |
| stopRecalcEnabled | true |
| minRr | 2 |
| minTargetBufferPct | 1 |
| stopMinPct | 1.5 |
| stopMaxPct | 22 |

## Candidates

| Symbol | Current | Structure | Recalc | RR(recalc) | StopDist% | TargetBuf% | Would Promote | Simulated Decision | Reasons |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| INCY | WAIT_PRICE/wait_recalculated_stop_required | STRUCTURE_CONFIRMED_RECALC_CANDIDATE | true | 2 | 4.08 | 8.15 | true | EXECUTABLE_NOW/executable_current_recalculated_stop |  |
| IMPP | WAIT_PRICE/wait_breakout_retest_required | NOT_RECALC_CANDIDATE | false | 2 | 28.74 | 57.48 | false | WAIT_PRICE/wait_breakout_retest_required | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy |
| TDC | WAIT_PRICE/wait_earnings_data_missing_quality_floor | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | true | 2 | 1.76 | 3.51 | false | WAIT_PRICE/wait_earnings_data_missing_quality_floor | structure_not_confirmed |
| SKYT | BLOCKED_RISK/blocked_stop_too_tight | NOT_RECALC_CANDIDATE | false | N/A | N/A | -0.26 | false | BLOCKED_RISK/blocked_stop_too_tight | recalc_not_feasible,structure_not_confirmed,target_not_above_current,required_stop_invalid,required_stop_distance_out_of_policy,recalculated_rr_below_min,target_buffer_below_min |
| VIRT | WAIT_PRICE/wait_target_near_current | NOT_RECALC_CANDIDATE | false | 2 | 0.17 | 0.34 | false | WAIT_PRICE/wait_target_near_current | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy,target_buffer_below_min |
| CARE | WAIT_PRICE/wait_target_near_current | NOT_RECALC_CANDIDATE | false | 2 | 0.34 | 0.68 | false | WAIT_PRICE/wait_target_near_current | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy,target_buffer_below_min |
| BZ | EXECUTABLE_NOW/executable_pullback | NOT_RECALC_CANDIDATE | false | 2 | 25.82 | 51.64 | false | EXECUTABLE_NOW/executable_pullback | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy |
| TFPM | EXECUTABLE_NOW/executable_earnings_data_missing_haircut | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | true | 2 | 10.18 | 20.35 | false | EXECUTABLE_NOW/executable_earnings_data_missing_haircut | structure_not_confirmed,recalculated_rr_below_min |

## Interpretation

- This canary does not upload a modified Stage6 file and does not trigger sidecar submission.
- A PASS only means the next explicit Stage6 run with both current-entry flags enabled should promote the same structure-confirmed lane.
