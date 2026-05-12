# Stage6 Current Entry Promotion Canary

- GeneratedAt: 2026-05-12T15:33:12.469Z
- Stage6: STAGE6_ALPHA_FINAL_2026-05-12_20-50-33.json
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
| minTargetBufferPct | 3 |
| stopMinPct | 1.5 |
| stopMaxPct | 22 |

## Candidates

| Symbol | Current | Structure | Recalc | RR(recalc) | StopDist% | TargetBuf% | Would Promote | Simulated Decision | Reasons |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| INCY | WAIT_PRICE/wait_recalculated_stop_required | STRUCTURE_CONFIRMED_RECALC_CANDIDATE | true | 2 | 4.08 | 8.15 | true | EXECUTABLE_NOW/executable_current_recalculated_stop |  |
| B | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | true | 2 | 10.63 | 21.26 | false | WAIT_PRICE/wait_structure_confirmation_required | structure_not_confirmed,recalculated_rr_below_min |
| IMPP | WAIT_PRICE/wait_breakout_retest_required | NOT_RECALC_CANDIDATE | false | 2 | 28.74 | 57.48 | false | WAIT_PRICE/wait_breakout_retest_required | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy |
| SKYT | BLOCKED_RISK/blocked_stop_too_tight | NOT_RECALC_CANDIDATE | false | N/A | N/A | -0.26 | false | BLOCKED_RISK/blocked_stop_too_tight | recalc_not_feasible,structure_not_confirmed,target_not_above_current,required_stop_invalid,required_stop_distance_out_of_policy,recalculated_rr_below_min,target_buffer_below_min |
| VIRT | WAIT_PRICE/wait_target_near_current | NOT_RECALC_CANDIDATE | false | 2 | 0.17 | 0.34 | false | WAIT_PRICE/wait_target_near_current | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy,target_buffer_below_min |
| TDC | WAIT_PRICE/wait_earnings_data_missing_quality_floor | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | true | 2 | 1.76 | 3.51 | false | WAIT_PRICE/wait_earnings_data_missing_quality_floor | structure_not_confirmed |
| BZ | EXECUTABLE_NOW/executable_pullback | NOT_RECALC_CANDIDATE | false | 2 | 25.82 | 51.64 | false | EXECUTABLE_NOW/executable_pullback | recalc_not_feasible,structure_not_confirmed,required_stop_distance_out_of_policy,recalculated_rr_below_min |

## Interpretation

- This canary does not upload a modified Stage6 file and does not trigger sidecar submission.
- A PASS only means the next explicit Stage6 run with both current-entry flags enabled should promote the same structure-confirmed lane.
