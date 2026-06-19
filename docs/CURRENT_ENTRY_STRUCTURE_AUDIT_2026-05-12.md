# Current Entry Structure Audit

- GeneratedAt: 2026-06-19T17:07:20.113Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Rows: 69
- Recent Runs: 10
- Price Source: Stage6 price field for current-entry geometry; local OHLCV JSON for ATR/support when available
- Adjustment: OHLCV adjustment is inherited from upstream harvester/local file; this audit does not rewrite or forward-fill bars
- Timezone: OHLCV dates are treated as US regular trading sessions; generatedAt is UTC ISO8601
- Drive OHLCV Fetch: ok (resolved_by_name)

## Verdict Counts

| Verdict | Count |
| --- | ---: |
| STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | 20 |
| STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | 13 |
| NOT_RECALC_CANDIDATE | 25 |
| STRUCTURE_CONFIRMED_RECALC_CANDIDATE | 2 |
| STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | 2 |
| STRUCTURE_REJECT_PRICE_DRIFT_HIGH | 5 |
| STRUCTURE_REJECT_CLOSE_BELOW_SMA20 | 2 |

## Stage6 File Counts

| Stage6 File | Count |
| --- | ---: |
| STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-19_22-40-48.json | 9 |
| STAGE6_ALPHA_FINAL_2026-06-18_22-21-07.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-17_22-27-46.json | 8 |
| STAGE6_ALPHA_FINAL_2026-06-17_11-14-24.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-16_23-59-28.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-16_22-56-56.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-16_13-54-55.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-16_13-22-59.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-16_10-06-34.json | 6 |

## Latest Candidates

| Symbol | Reason | Verdict | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Bars | Source |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| ANET | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 169.70 | 159.51 | 6.01 | 2.00 | 12.01 | 8.96 | 1.14 | 169.38 | 564 | gdrive:ANET_OHLCV.json |
| ATEX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 74.55 | 71.83 | 3.66 | 0.22 | 7.31 | 6.28 | 0.43 | 63.00 | 562 | gdrive:ATEX_OHLCV.json |
| AUPH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 16.48 | 16.22 | 1.58 | 0.26 | 3.16 | 0.53 | 0.49 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.69 | 5.43 | 37.46 | 4.24 | 74.91 | 0.31 | 10.52 | N/A | 564 | gdrive:CRMD_OHLCV.json |
| IDCC | executable_pullback | NOT_RECALC_CANDIDATE | recalc_not_feasible | 296.08 | 212.79 | 28.13 | 2.86 | 56.26 | 12.48 | 6.67 | N/A | 1300 | gdrive:IDCC_OHLCV.json |
| WSBC | wait_earnings_data_missing_quality_floor | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 36.31 | 34.84 | 4.05 | 2.00 | 8.10 | 1.06 | 1.39 | 35.58 | 565 | gdrive:WSBC_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.92 | 5.44 | 57.93 | 4.10 | 115.86 | 0.80 | 9.41 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| ACAD | executable_pullback | NOT_RECALC_CANDIDATE | recalc_not_feasible | 21.64 | 16.64 | 23.13 | 5.39 | 46.26 | 0.63 | 7.94 | N/A | 564 | gdrive:ACAD_OHLCV.json |
| ANET | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 169.70 | 159.51 | 6.01 | 2.00 | 12.01 | 8.96 | 1.14 | 169.38 | 564 | gdrive:ANET_OHLCV.json |
| AUPH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 16.48 | 16.22 | 1.58 | 0.26 | 3.16 | 0.53 | 0.49 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.69 | 5.43 | 37.46 | 4.24 | 74.91 | 0.31 | 10.52 | N/A | 564 | gdrive:CRMD_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 125.59 | N/A | N/A | N/A | -15.35 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| GNTX | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 25.97 | 24.29 | 6.48 | 2.00 | 12.95 | 0.61 | 2.73 | 25.29 | 564 | gdrive:GNTX_OHLCV.json |
| IDCC | executable_pullback | NOT_RECALC_CANDIDATE | recalc_not_feasible | 296.08 | 212.79 | 28.13 | 2.86 | 56.26 | 12.48 | 6.67 | N/A | 1300 | gdrive:IDCC_OHLCV.json |
| LIF | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 49.04 | 43.16 | 11.98 | 2.00 | 23.97 | 3.05 | 1.93 | 45.56 | 510 | gdrive:LIF_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.92 | 5.44 | 57.93 | 4.10 | 115.86 | 0.80 | 9.41 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| ATEX | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 79.16 | 78.74 | 0.53 | 0.03 | 1.06 | 6.28 | 0.07 | N/A | 562 | gdrive:ATEX_OHLCV.json |
| AUPH | executable_current_recalculated_stop | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 16.14 | 15.71 | 2.66 | 2.00 | 5.33 | 0.53 | 0.81 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.67 | 5.41 | 37.66 | 3.97 | 75.32 | 0.31 | 10.56 | N/A | 564 | gdrive:CRMD_OHLCV.json |
| ERO | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.43 | 28.55 | 6.19 | 0.53 | 12.39 | 1.99 | 0.95 | 29.84 | 563 | gdrive:ERO_OHLCV.json |
| LYFT | executable_pullback | NOT_RECALC_CANDIDATE | recalc_not_feasible | 14.15 | 11.83 | 16.38 | 2.37 | 32.76 | 0.63 | 3.70 | N/A | 564 | gdrive:LYFT_OHLCV.json |
| MLI | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 138.33 | 133.00 | 3.86 | 0.48 | 7.71 | 3.68 | 1.45 | 137.42 | 565 | gdrive:MLI_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.61 | 4.97 | 60.58 | 4.58 | 121.16 | 0.80 | 9.60 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| AUPH | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band | 16.22 | 15.83 | 2.40 | 2.00 | 4.81 | 0.53 | 0.74 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DHT | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 18.41 | 17.47 | 5.09 | 2.00 | 10.18 | 0.60 | 1.55 | 18.38 | 1283 | gdrive:DHT_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 128.07 | N/A | N/A | N/A | -16.99 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| FRO | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 39.42 | 38.26 | 2.96 | 0.28 | 5.91 | 1.44 | 0.81 | 38.20 | 1273 | gdrive:FRO_OHLCV.json |
| GRND | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 13.36 | 10.94 | 18.11 | 1.33 | 36.23 | 0.67 | 3.59 | 13.32 | 1282 | gdrive:GRND_OHLCV.json |
| MLI | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 138.03 | 132.54 | 3.97 | 2.00 | 7.95 | 3.68 | 1.49 | 137.42 | 565 | gdrive:MLI_OHLCV.json |
| TGTX | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 50.54 | N/A | N/A | N/A | -5.03 | 2.34 | N/A | N/A | 562 | gdrive:TGTX_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.65 | 5.03 | 60.23 | 4.52 | 120.47 | 0.80 | 9.58 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| ATEX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 77.63 | 76.44 | 1.53 | 0.08 | 3.05 | 6.28 | 0.19 | 63.00 | 562 | gdrive:ATEX_OHLCV.json |
| AUPH | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band | 16.22 | 15.83 | 2.40 | 2.00 | 4.81 | 0.53 | 0.74 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 128.07 | N/A | N/A | N/A | -16.99 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| ERO | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.10 | 28.05 | 6.81 | 2.00 | 13.62 | 1.99 | 1.03 | 29.84 | 563 | gdrive:ERO_OHLCV.json |
| GRND | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 13.36 | 10.94 | 18.11 | 1.33 | 36.23 | 0.67 | 3.59 | 13.32 | 1282 | gdrive:GRND_OHLCV.json |
| PNFP | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support,close_below_sma20 | 96.08 | 85.86 | 10.64 | 1.97 | 21.28 | 3.07 | 3.33 | 95.14 | 562 | gdrive:PNFP_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.55 | 4.88 | 61.11 | 4.69 | 122.22 | 0.80 | 9.64 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| AUPH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 16.05 | 15.57 | 2.96 | 0.59 | 5.92 | 0.53 | 0.90 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 308.35 | 294.66 | 4.44 | 0.26 | 8.88 | 23.87 | 0.57 | 261.07 | 563 | gdrive:DAVE_OHLCV.json |
| LTM | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 55.58 | 48.05 | 13.55 | 1.27 | 27.10 | 2.22 | 3.40 | 52.59 | 475 | gdrive:LTM_OHLCV.json |
| MLI | wait_structure_confirmation_required | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 140.69 | 136.53 | 2.95 | 0.33 | 5.91 | 3.68 | 1.13 | 137.42 | 565 | gdrive:MLI_OHLCV.json |
| VIRT | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 58.47 | N/A | N/A | N/A | -10.33 | 1.85 | N/A | N/A | 562 | gdrive:VIRT_OHLCV.json |
| ZVRA | wait_verdict_not_sidecar_actionable | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.55 | 4.88 | 61.11 | 4.67 | 122.22 | 0.80 | 9.64 | N/A | 564 | gdrive:ZVRA_OHLCV.json |
| ASB | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 29.58 | 28.87 | 2.40 | 0.35 | 4.80 | 0.65 | 1.09 | 28.69 | 564 | gdrive:ASB_OHLCV.json |
| AUPH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 16.08 | 15.62 | 2.86 | 0.56 | 5.72 | 0.53 | 0.87 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 314.92 | 304.52 | 3.30 | 0.19 | 6.61 | 23.87 | 0.44 | 261.07 | 563 | gdrive:DAVE_OHLCV.json |
| LTM | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 55.77 | 48.33 | 13.34 | 1.24 | 26.67 | 2.22 | 3.35 | 52.59 | 475 | gdrive:LTM_OHLCV.json |
| MLI | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 140.28 | 135.92 | 3.11 | 0.35 | 6.22 | 3.68 | 1.18 | 137.42 | 565 | gdrive:MLI_OHLCV.json |
| VIRT | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 58.32 | N/A | N/A | N/A | -10.10 | 1.85 | N/A | N/A | 562 | gdrive:VIRT_OHLCV.json |
| AUPH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 16.00 | 15.50 | 3.13 | 0.64 | 6.25 | 0.53 | 0.94 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 308.75 | 295.26 | 4.37 | 0.26 | 8.74 | 23.87 | 0.57 | 261.07 | 563 | gdrive:DAVE_OHLCV.json |
| DHT | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 18.48 | 17.58 | 4.88 | 0.58 | 9.76 | 0.60 | 1.49 | 18.38 | 1283 | gdrive:DHT_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 127.06 | N/A | N/A | N/A | -16.33 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| ERO | executable_current_recalculated_stop | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.71 | 28.96 | 5.68 | 2.00 | 11.36 | 1.99 | 0.88 | 29.84 | 563 | gdrive:ERO_OHLCV.json |
| INCY | executable_current_recalculated_stop | STRUCTURE_REJECT_CLOSE_BELOW_SMA20 | close_below_sma20 | 101.98 | 98.43 | 3.48 | 2.00 | 6.97 | 4.58 | 0.78 | 98.78 | 564 | gdrive:INCY_OHLCV.json |
| LTM | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 54.86 | 46.97 | 14.39 | 1.42 | 28.77 | 2.22 | 3.56 | 52.59 | 475 | gdrive:LTM_OHLCV.json |
| AUPH | blocked_quality_verdict_unusable | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 16.00 | 15.50 | 3.13 | 0.64 | 6.25 | 0.53 | 0.94 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 308.75 | 295.26 | 4.37 | 0.26 | 8.74 | 23.87 | 0.57 | 261.07 | 563 | gdrive:DAVE_OHLCV.json |
| DHT | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 18.48 | 17.58 | 4.88 | 0.58 | 9.76 | 0.60 | 1.49 | 18.38 | 1283 | gdrive:DHT_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 127.06 | N/A | N/A | N/A | -16.33 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| INCY | executable_pullback | STRUCTURE_REJECT_CLOSE_BELOW_SMA20 | close_below_sma20 | 101.98 | 98.43 | 3.48 | 2.00 | 6.97 | 4.58 | 0.78 | 98.78 | 564 | gdrive:INCY_OHLCV.json |
| LTM | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 54.86 | 46.97 | 14.39 | 1.42 | 28.77 | 2.22 | 3.56 | 52.59 | 475 | gdrive:LTM_OHLCV.json |
| AUPH | blocked_quality_verdict_unusable | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 16.00 | 15.50 | 3.13 | 0.64 | 6.25 | 0.53 | 0.94 | 15.84 | 564 | gdrive:AUPH_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 308.75 | 296.17 | 4.07 | 0.24 | 8.15 | 23.87 | 0.53 | 261.07 | 563 | gdrive:DAVE_OHLCV.json |
| DHT | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 18.48 | 17.58 | 4.88 | 0.58 | 9.76 | 0.60 | 1.49 | 18.38 | 1283 | gdrive:DHT_OHLCV.json |
| DUOL | blocked_rr_below_min | NOT_RECALC_CANDIDATE | recalc_not_feasible | 127.06 | N/A | N/A | N/A | -16.33 | 8.67 | N/A | N/A | 568 | gdrive:DUOL_OHLCV.json |
| ERO | blocked_invalid_geometry | NOT_RECALC_CANDIDATE | recalc_not_feasible | 30.71 | 28.96 | 5.68 | 2.00 | 11.36 | 1.99 | 0.88 | N/A | 563 | gdrive:ERO_OHLCV.json |
| INCY | blocked_invalid_geometry | NOT_RECALC_CANDIDATE | recalc_not_feasible | 101.98 | 98.43 | 3.48 | 2.00 | 6.97 | 4.58 | 0.78 | N/A | 564 | gdrive:INCY_OHLCV.json |

## Policy

- This audit does not authorize orders. It only decides whether a current-entry recalculated stop has enough OHLCV structure support to be reviewed.
- `STRUCTURE_DATA_MISSING` means the correct next fix is OHLCV handoff into Stage6/audit, not wider sidecar chasing.
- A candidate can only progress toward execution review after `STRUCTURE_CONFIRMED_RECALC_CANDIDATE`, and still needs sidecar preflight, idempotency, market-open, and broker submission gates.

