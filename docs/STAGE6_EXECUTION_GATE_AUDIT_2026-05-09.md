# Stage6 Execution Gate Audit

- GeneratedAt: 2026-05-12T01:55:36.065Z
- Source files: 14
- Rows: 97
- Zero executable runs: 3
- Overall verdict: **MODEL_OR_DATA_POLICY_ERROR**

## Run Verdicts

| Stage6 File | Rows | Exec | Verdict | Top Reasons |
| --- | ---: | ---: | --- | --- |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | 8 | 2 | HAS_EXECUTABLE | wait_target_near_current:2, executable_pullback:1, wait_breakout_retest_required:1, wait_recalculated_stop_required:1, blocked_stop_too_tight:1 |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | 6 | 0 | MODEL_OR_DATA_POLICY_ERROR | wait_pullback_not_reached:4, blocked_stop_too_tight:1, blocked_rr_below_min:1 |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | 6 | 0 | MODEL_OR_DATA_POLICY_ERROR | wait_pullback_not_reached:2, blocked_earnings_window:2, blocked_stop_too_tight:1, wait_earnings_data_missing_quality_floor:1 |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | 7 | 2 | HAS_EXECUTABLE | wait_pullback_not_reached:4, blocked_stop_too_tight:1, executable_earnings_data_missing_haircut:1, executable_pullback:1 |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | 7 | 2 | HAS_EXECUTABLE | wait_pullback_not_reached:3, blocked_earnings_window:2, executable_earnings_data_missing_haircut:2 |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | 6 | 0 | NORMAL_CONSERVATIVE_FILTER | blocked_earnings_window:4, wait_earnings_data_missing:2 |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | 8 | 2 | HAS_EXECUTABLE | wait_earnings_data_missing:3, executable_pullback:2, blocked_earnings_window:2, blocked_stop_too_tight:1 |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | 7 | 2 | HAS_EXECUTABLE | wait_earnings_data_missing:3, executable_pullback:2, blocked_earnings_window:2 |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | 6 | 2 | HAS_EXECUTABLE | wait_earnings_data_missing:3, executable_pullback:2, blocked_earnings_window:1 |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | 7 | 2 | HAS_EXECUTABLE | wait_earnings_data_missing:3, executable_pullback:2, blocked_earnings_window:1, wait_pullback_not_reached:1 |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | 8 | 5 | HAS_EXECUTABLE | executable_pullback:5, wait_earnings_data_missing:3 |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | 7 | 3 | HAS_EXECUTABLE | executable_pullback:3, wait_earnings_data_missing:2, blocked_earnings_window:1, wait_pullback_not_reached:1 |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | 7 | 4 | HAS_EXECUTABLE | executable_pullback:4, wait_earnings_data_missing:2, blocked_stop_too_wide:1 |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | 7 | 3 | HAS_EXECUTABLE | executable_pullback:3, wait_earnings_data_missing:2, wait_pullback_not_reached:1, blocked_quality_verdict_unusable:1 |

## Candidate Blocker Table

| File | Symbol | Decision | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | ReqStop | ReqStopDist% | Price | Entry | Target | Stop | EarningsD | Class | Fix Lane |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | BZ | EXECUTABLE_NOW | executable_pullback | PULLBACK_LIMIT | 47.00 | 4.65 | 4.56 | 0.18 | 51.64 | 10.62 | 25.82 | 14.31 | 14.28 | 21.70 | 12.69 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | CARE | WAIT_PRICE | wait_target_near_current | NO_TRADE_CURRENT_RR_BAD | 21.00 | 15.44 | 0.03 | 18.25 | 0.68 | 26.48 | 0.34 | 26.57 | 21.72 | 26.75 | 21.39 | N/A | TARGET_ALREADY_NEAR_CURRENT | target_recalibration_or_no_trade |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | IMPP | WAIT_PRICE | wait_breakout_retest_required | BREAKOUT_RETEST | 86.00 | 57.55 | 2.46 | 22.00 | 57.48 | 3.62 | 28.74 | 5.08 | 3.96 | 8.00 | 3.89 | N/A | BREAKOUT_RETEST_REQUIRED | stage6_breakout_retest_lane |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | INCY | WAIT_PRICE | wait_recalculated_stop_required | RECALCULATED_STOP_REVIEW | 16.00 | 3.92 | 0.78 | 6.73 | 8.15 | 96.23 | 4.08 | 100.32 | 93.57 | 108.50 | 89.77 | N/A | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | SKYT | BLOCKED_RISK | blocked_stop_too_tight | PULLBACK_LIMIT | 20.00 | 22.84 | N/A | 18.43 | -0.26 | N/A | N/A | 35.09 | 28.62 | 35.00 | 28.34 | N/A | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | TDC | WAIT_PRICE | wait_earnings_data_missing_quality_floor | PULLBACK_LIMIT | 23.00 | 2.27 | 0.13 | 17.03 | 3.51 | 31.74 | 1.76 | 32.31 | 26.81 | 33.44 | 23.89 | N/A | EARNINGS_MISSING_CONSERVATIVE_WAIT | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | TFPM | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | PULLBACK_LIMIT | 28.00 | 2.55 | 1.28 | 5.74 | 20.35 | 31.91 | 10.18 | 35.52 | 33.48 | 42.75 | 29.85 | N/A | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json | VIRT | WAIT_PRICE | wait_target_near_current | NO_TRADE_CURRENT_RR_BAD | 24.00 | 16.11 | 0.02 | 19.19 | 0.34 | 51.45 | 0.17 | 51.54 | 41.65 | 51.71 | 41.02 | N/A | TARGET_ALREADY_NEAR_CURRENT | target_recalibration_or_no_trade |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | CSTM | WAIT_PRICE | wait_pullback_not_reached | N/A | 42.00 | 32.25 | 0.46 | 24.65 | 11.80 | 31.66 | 6.56 | 33.88 | 25.53 | 37.88 | 25.15 | N/A | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | EXEL | BLOCKED_RISK | blocked_stop_too_tight | N/A | 14.00 | 11.59 | 0.11 | 11.90 | 1.38 | 47.79 | 0.77 | 48.16 | 42.43 | 48.82 | 41.88 | N/A | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | MLI | WAIT_PRICE | wait_pullback_not_reached | N/A | 24.00 | 9.44 | 0.32 | 16.66 | 6.16 | 136.01 | 3.42 | 140.83 | 117.37 | 149.50 | 113.97 | N/A | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | TDC | BLOCKED_RISK | blocked_rr_below_min | N/A | 18.00 | 1.20 | 0.22 | 11.96 | 5.87 | 30.56 | 3.26 | 31.59 | 27.81 | 33.44 | 23.11 | N/A | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | N/A | 46.00 | 31.48 | 0.47 | 25.25 | 12.33 | 39.93 | 6.85 | 42.86 | 32.04 | 48.14 | 31.53 | N/A | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | VIRT | WAIT_PRICE | wait_pullback_not_reached | N/A | 25.00 | 16.73 | 0.04 | 19.43 | 0.79 | 51.09 | 0.44 | 51.31 | 41.34 | 51.71 | 40.72 | N/A | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | CGEN | WAIT_PRICE | wait_pullback_not_reached | N/A | 137.00 | 129.70 | 4.25 | 26.40 | 116.78 | 1.00 | 64.88 | 2.86 | 2.10 | 6.20 | 2.07 | 10 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | CPRX | BLOCKED_EVENT | blocked_earnings_window | N/A | 32.00 | 5.18 | 0.39 | 19.05 | 9.56 | 29.51 | 5.31 | 31.16 | 25.23 | 34.14 | 23.51 | 3 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | DHT | BLOCKED_RISK | blocked_stop_too_tight | N/A | 22.00 | 34.69 | 0.45 | 13.19 | 6.20 | 18.36 | 3.45 | 19.02 | 16.51 | 20.20 | 16.40 | 0 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | JHG | BLOCKED_EVENT | blocked_earnings_window | N/A | 5.00 | 3.91 | 0.37 | 3.74 | 1.91 | 51.13 | 1.06 | 51.68 | 49.75 | 52.67 | 49.00 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | PTC | WAIT_PRICE | wait_earnings_data_missing_quality_floor | N/A | 28.00 | 2.60 | 1.68 | 3.83 | 24.92 | 127.21 | 13.84 | 147.65 | 142.00 | 184.44 | 125.69 | 0 | DATA_POLICY_OVERBLOCK | earnings_missing_threshold_policy |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | SPNT | WAIT_PRICE | wait_pullback_not_reached | N/A | 26.00 | 17.12 | 1.00 | 10.80 | 12.10 | 21.91 | 6.72 | 23.49 | 20.95 | 26.33 | 20.64 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | ASB | WAIT_PRICE | wait_pullback_not_reached | N/A | 21.00 | 14.28 | 0.53 | 11.88 | 6.99 | 27.76 | 3.89 | 28.88 | 25.45 | 30.90 | 25.07 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | DLO | BLOCKED_RISK | blocked_stop_too_tight | N/A | 45.00 | 40.25 | 1.79 | 13.45 | 25.80 | 12.02 | 14.33 | 14.03 | 12.14 | 17.65 | 12.01 | 7 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | HNRG | WAIT_PRICE | wait_pullback_not_reached | N/A | 57.00 | 3.54 | 1.79 | 9.94 | 46.23 | 13.79 | 25.68 | 18.55 | 16.71 | 27.13 | 13.76 | 0 | CONSERVATIVE_PULLBACK_WAIT | sidecar_reprice_or_watch |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | INCY | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | N/A | 14.00 | 3.22 | 0.86 | 5.61 | 8.66 | 95.04 | 4.81 | 99.85 | 94.25 | 108.50 | 89.83 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | MLI | WAIT_PRICE | wait_pullback_not_reached | N/A | 27.00 | 11.27 | 0.41 | 15.92 | 7.45 | 133.37 | 4.14 | 139.13 | 116.98 | 149.50 | 114.09 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | PDD | EXECUTABLE_NOW | executable_pullback | N/A | 44.00 | 8.05 | 4.73 | 3.08 | 39.65 | 79.78 | 22.03 | 102.31 | 99.16 | 142.87 | 93.73 | 20 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | N/A | 39.00 | 28.32 | 0.23 | 25.46 | 6.20 | 40.52 | 3.44 | 41.97 | 31.28 | 44.57 | 30.81 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | AUPH | BLOCKED_EVENT | blocked_earnings_window | N/A | 16.00 | 12.95 | 0.47 | 10.09 | 5.33 | 15.66 | 2.96 | 16.14 | 14.51 | 17.00 | 14.32 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | CSTM | WAIT_PRICE | wait_pullback_not_reached | N/A | 39.00 | 31.47 | 0.46 | 24.14 | 11.67 | 31.44 | 6.49 | 33.62 | 25.51 | 37.54 | 25.12 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | DAVE | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | N/A | 55.00 | 3.38 | 1.44 | 13.21 | 43.05 | 173.12 | 23.92 | 227.54 | 197.47 | 325.50 | 159.54 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | HNRG | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | N/A | 57.00 | 3.59 | 1.79 | 10.08 | 45.99 | 13.83 | 25.55 | 18.58 | 16.71 | 27.13 | 13.81 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | JHG | BLOCKED_EVENT | blocked_earnings_window | N/A | 5.00 | 3.91 | 0.39 | 3.66 | 1.99 | 51.07 | 1.10 | 51.64 | 49.75 | 52.67 | 49.00 | 1 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | MLI | WAIT_PRICE | wait_pullback_not_reached | N/A | 25.00 | 7.55 | 0.38 | 16.16 | 7.28 | 133.71 | 4.05 | 139.35 | 116.83 | 149.50 | 112.50 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | N/A | 44.00 | 31.76 | 0.75 | 21.04 | 16.59 | 34.71 | 9.22 | 38.23 | 30.19 | 44.57 | 29.74 | 0 | CURRENT_STOP_RECALC_REQUIRED | stage6_current_entry_stop_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | AUPH | BLOCKED_EVENT | blocked_earnings_window | N/A | 16.00 | 12.95 | 0.56 | 9.53 | 5.99 | 15.51 | 3.33 | 16.04 | 14.51 | 17.00 | 14.32 | 5 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | CPRX | BLOCKED_EVENT | blocked_earnings_window | N/A | 32.00 | 5.23 | 0.45 | 18.25 | 10.64 | 29.04 | 5.91 | 30.86 | 25.23 | 34.14 | 23.52 | 5 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | JHG | BLOCKED_EVENT | blocked_earnings_window | N/A | 5.00 | 3.91 | 0.41 | 3.59 | 2.07 | 51.01 | 1.15 | 51.60 | 49.75 | 52.67 | 49.00 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | MLI | WAIT_PRICE | wait_earnings_data_missing | N/A | 25.00 | 7.55 | 0.56 | 14.26 | 9.72 | 128.90 | 5.40 | 136.26 | 116.83 | 149.50 | 112.50 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | SN | BLOCKED_EVENT | blocked_earnings_window | N/A | 33.00 | 24.96 | 2.81 | 8.17 | 26.91 | 99.85 | 14.95 | 117.41 | 107.81 | 149.01 | 106.16 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | N/A | 24.00 | 16.73 | 0.11 | 18.32 | 2.18 | 50.00 | 1.21 | 50.61 | 41.34 | 51.71 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | ADBE | EXECUTABLE_NOW | executable_pullback | N/A | 36.00 | 3.13 | N/A | 4.63 | N/A | N/A | N/A | N/A | 242.19 | 329.11 | 214.40 | 37 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | ALL | WAIT_PRICE | wait_earnings_data_missing | N/A | 18.00 | 20.19 | N/A | 7.10 | N/A | N/A | N/A | N/A | 204.26 | 241.71 | 202.40 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | AUPH | BLOCKED_RISK | blocked_stop_too_tight | N/A | 17.00 | 13.15 | N/A | 7.98 | N/A | N/A | N/A | N/A | 14.51 | 17.00 | 14.32 | 6 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 29.00 | 5.49 | N/A | 12.83 | N/A | N/A | N/A | N/A | 25.23 | 34.14 | 23.60 | 6 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | N/A | 97.00 | 76.61 | N/A | 26.14 | N/A | N/A | N/A | N/A | 3.72 | 8.00 | 3.67 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | JHG | BLOCKED_EVENT | blocked_earnings_window | N/A | 6.00 | 3.91 | N/A | 3.66 | N/A | N/A | N/A | N/A | 49.75 | 52.67 | 49.00 | 3 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | LNG | BLOCKED_EVENT | blocked_earnings_window | N/A | 29.00 | 20.14 | N/A | 14.72 | N/A | N/A | N/A | N/A | 232.69 | 303.00 | 229.20 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | N/A | 22.00 | 14.89 | N/A | 16.57 | N/A | N/A | N/A | N/A | 41.34 | 50.57 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | ADBE | EXECUTABLE_NOW | executable_pullback | N/A | 31.00 | 3.10 | N/A | 3.40 | N/A | N/A | N/A | N/A | 242.19 | 327.95 | 214.50 | 38 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | BUSE | WAIT_PRICE | wait_earnings_data_missing | N/A | 11.00 | 100.50 | N/A | 6.24 | N/A | N/A | N/A | N/A | 24.95 | 28.00 | 24.92 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 29.00 | 5.08 | N/A | 12.22 | N/A | N/A | N/A | N/A | 25.23 | 34.14 | 23.47 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | INCY | WAIT_PRICE | wait_earnings_data_missing | N/A | 13.00 | 2.47 | N/A | 1.75 | N/A | N/A | N/A | N/A | 95.22 | 108.50 | 89.84 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | INVA | BLOCKED_EVENT | blocked_earnings_window | N/A | 43.00 | 40.19 | N/A | 3.04 | N/A | N/A | N/A | N/A | 22.41 | 33.20 | 22.14 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | JHG | BLOCKED_EVENT | blocked_earnings_window | N/A | 6.00 | 3.99 | N/A | 3.70 | N/A | N/A | N/A | N/A | 49.69 | 52.67 | 48.95 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | UMBF | WAIT_PRICE | wait_earnings_data_missing | N/A | 27.00 | 5.87 | N/A | 10.50 | N/A | N/A | N/A | N/A | 115.67 | 146.75 | 110.38 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | ANET | BLOCKED_EVENT | blocked_earnings_window | N/A | 32.00 | 2.14 | N/A | 22.17 | N/A | N/A | N/A | N/A | 134.41 | 179.75 | 113.21 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | DLO | EXECUTABLE_NOW | executable_pullback | N/A | 48.00 | 11.17 | N/A | 13.56 | N/A | N/A | N/A | N/A | 12.00 | 17.75 | 11.48 | 13 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | HG | WAIT_PRICE | wait_earnings_data_missing | N/A | 14.00 | 9.58 | N/A | 11.95 | N/A | N/A | N/A | N/A | 28.85 | 33.00 | 28.42 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | N/A | 106.00 | 76.84 | N/A | 26.55 | N/A | N/A | N/A | N/A | 3.72 | 8.00 | 3.66 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | JHG | EXECUTABLE_NOW | executable_pullback | N/A | 6.00 | 3.99 | N/A | 3.72 | N/A | N/A | N/A | N/A | 49.69 | 52.67 | 48.95 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | MLI | WAIT_PRICE | wait_earnings_data_missing | N/A | 25.00 | 2.84 | N/A | 13.73 | N/A | N/A | N/A | N/A | 116.83 | 149.50 | 105.33 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | HG | BLOCKED_EVENT | blocked_earnings_window | N/A | 12.00 | 9.58 | N/A | 9.69 | N/A | N/A | N/A | N/A | 28.85 | 33.00 | 28.42 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | N/A | 107.00 | 77.64 | N/A | 25.19 | N/A | N/A | N/A | N/A | 3.70 | 8.00 | 3.64 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | INCY | WAIT_PRICE | wait_earnings_data_missing | N/A | 14.00 | 2.35 | N/A | 3.92 | N/A | N/A | N/A | N/A | 95.22 | 108.09 | 89.74 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | INVA | EXECUTABLE_NOW | executable_pullback | N/A | 48.00 | 34.04 | N/A | 4.65 | N/A | N/A | N/A | N/A | 21.98 | 33.20 | 21.65 | 6 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | JHG | EXECUTABLE_NOW | executable_pullback | N/A | 6.00 | 3.99 | N/A | 3.64 | N/A | N/A | N/A | N/A | 49.69 | 52.67 | 48.95 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | N/A | 18.00 | 12.12 | N/A | 18.66 | N/A | N/A | N/A | N/A | 41.34 | 48.86 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | ZM | WAIT_PRICE | wait_pullback_not_reached | N/A | 22.00 | 3.83 | N/A | 18.22 | N/A | N/A | N/A | N/A | 78.32 | 97.33 | 73.36 | 21 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | AUPH | EXECUTABLE_NOW | executable_pullback | N/A | 15.00 | 2.84 | N/A | 9.53 | N/A | N/A | N/A | N/A | 14.51 | 17.00 | 13.64 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 32.00 | 3.94 | N/A | 14.31 | N/A | N/A | N/A | N/A | 25.23 | 34.00 | 23.00 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | INCY | WAIT_PRICE | wait_earnings_data_missing | N/A | 13.00 | 1.81 | N/A | 2.58 | N/A | N/A | N/A | N/A | 95.22 | 107.36 | 88.51 | 0 | EARNINGS_MISSING_CONSERVATIVE_WAIT | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | INVA | EXECUTABLE_NOW | executable_pullback | N/A | 52.00 | 36.83 | N/A | 9.73 | N/A | N/A | N/A | N/A | 21.39 | 33.20 | 21.06 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | JHG | EXECUTABLE_NOW | executable_pullback | N/A | 5.00 | 3.99 | N/A | 3.64 | N/A | N/A | N/A | N/A | 49.69 | 52.67 | 48.95 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | MLI | WAIT_PRICE | wait_earnings_data_missing | N/A | 25.00 | 2.57 | N/A | 13.87 | N/A | N/A | N/A | N/A | 116.83 | 149.50 | 104.12 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | OPRA | WAIT_PRICE | wait_earnings_data_missing | N/A | 79.00 | 14.41 | N/A | 22.54 | N/A | N/A | N/A | N/A | 13.80 | 25.64 | 12.97 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | SPG | EXECUTABLE_NOW | executable_pullback | N/A | 11.00 | 3.01 | N/A | 7.05 | N/A | N/A | N/A | N/A | 188.46 | 208.55 | 181.79 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | AUPH | EXECUTABLE_NOW | executable_pullback | N/A | 17.00 | 2.02 | N/A | 11.35 | N/A | N/A | N/A | N/A | 14.51 | 17.00 | 13.28 | 13 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 35.00 | 2.78 | N/A | 13.81 | N/A | N/A | N/A | N/A | 25.23 | 34.00 | 22.07 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | CRMD | EXECUTABLE_NOW | executable_pullback | N/A | 108.00 | 14.62 | N/A | 12.56 | N/A | N/A | N/A | N/A | 6.84 | 14.86 | 6.29 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | GNTX | WAIT_PRICE | wait_earnings_data_missing | N/A | 31.00 | 4.51 | N/A | 8.40 | N/A | N/A | N/A | N/A | 21.85 | 28.67 | 20.35 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | HG | BLOCKED_EVENT | blocked_earnings_window | N/A | 14.00 | 6.20 | N/A | 11.67 | N/A | N/A | N/A | N/A | 28.71 | 33.00 | 28.01 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | MLI | WAIT_PRICE | wait_earnings_data_missing | N/A | 27.00 | 2.48 | N/A | 14.41 | N/A | N/A | N/A | N/A | 116.83 | 149.50 | 103.65 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | NVDA | WAIT_PRICE | wait_pullback_not_reached | N/A | 49.00 | 4.24 | N/A | 17.01 | N/A | N/A | N/A | N/A | 179.78 | 268.61 | 158.81 | 22 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | AUPH | EXECUTABLE_NOW | executable_pullback | N/A | 17.00 | 2.06 | N/A | 9.19 | N/A | N/A | N/A | N/A | 14.51 | 17.00 | 13.30 | 14 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 42.00 | 6.21 | N/A | 12.63 | N/A | N/A | N/A | N/A | 23.91 | 34.00 | 22.29 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | FFBC | WAIT_PRICE | wait_earnings_data_missing | N/A | 17.00 | 4.55 | N/A | 9.92 | N/A | N/A | N/A | N/A | 27.55 | 32.14 | 26.54 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | GNTX | WAIT_PRICE | wait_earnings_data_missing | N/A | 28.00 | 4.09 | N/A | 8.48 | N/A | N/A | N/A | N/A | 21.85 | 27.89 | 20.38 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | INVA | EXECUTABLE_NOW | executable_pullback | N/A | 50.00 | 37.62 | N/A | 9.96 | N/A | N/A | N/A | N/A | 21.22 | 33.20 | 20.90 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | NVDA | EXECUTABLE_NOW | executable_pullback | N/A | 51.00 | 4.78 | N/A | 14.51 | N/A | N/A | N/A | N/A | 178.04 | 268.61 | 159.09 | 23 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | PD | BLOCKED_RISK | blocked_stop_too_wide | N/A | 9.00 | 0.42 | N/A | 1.04 | N/A | N/A | N/A | N/A | 7.20 | 8.00 | 5.30 | 31 | OTHER_BLOCK | inspect |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | AMSC | WAIT_PRICE | wait_pullback_not_reached | N/A | 47.00 | 4.30 | N/A | 29.11 | N/A | N/A | N/A | N/A | 32.72 | 52.33 | 28.15 | 33 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | AUPH | EXECUTABLE_NOW | executable_pullback | N/A | 17.00 | 2.05 | N/A | 10.09 | N/A | N/A | N/A | N/A | 14.51 | 17.00 | 13.30 | 17 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | BYD | WAIT_PRICE | wait_earnings_data_missing | N/A | 18.00 | 4.33 | N/A | 9.78 | N/A | N/A | N/A | N/A | 80.43 | 94.73 | 77.13 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | CPRX | EXECUTABLE_NOW | executable_pullback | N/A | 43.00 | 6.90 | N/A | 14.03 | N/A | N/A | N/A | N/A | 23.80 | 34.00 | 22.32 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | DECK | EXECUTABLE_NOW | executable_pullback | N/A | 26.00 | 2.15 | N/A | 5.92 | N/A | N/A | N/A | N/A | 101.33 | 128.76 | 88.59 | 27 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | KTB | BLOCKED_RISK | blocked_quality_verdict_unusable | N/A | 45.00 | 95.95 | N/A | 16.58 | N/A | N/A | N/A | N/A | 63.21 | 92.67 | 62.91 | 13 | VERDICT_NORMALIZATION_BLOCK | verdict_contract_normalization |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | MLI | WAIT_PRICE | wait_earnings_data_missing | N/A | 25.00 | 2.49 | N/A | 13.93 | N/A | N/A | N/A | N/A | 116.83 | 149.50 | 103.73 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |

## Policy Decision

- `EXECUTABLE_NOW`가 0개인 run 중 `DATA_POLICY_OVERBLOCK` 또는 `ENTRY_MODEL_TOO_DEEP`가 있으면 정상적인 보수 필터가 아니라 Stage6 정책/모델 설계 문제로 판정한다.
- `BREAKOUT_RETEST_REQUIRED`는 종목을 즉시 매수하라는 뜻이 아니라, 기존 깊은 눌림목 단일 lane으로는 상승 추세 종목을 실행하지 못한다는 설계 신호다.
- `CURRENT_STOP_RECALC_REQUIRED`는 현재가 진입을 하려면 기존 손절이 아니라 더 가까운 구조적 손절을 재검증해야 한다는 뜻이다. 기본 설정에서는 주문으로 승격하지 않는다.
- `CURRENT_RR_BAD` 또는 `TARGET_ALREADY_NEAR_CURRENT`는 추격매수 금지 신호다. 이 경우 sidecar chase가 아니라 Stage6 target/stop 재산정 또는 no-trade가 맞다.
- 실적일이 진짜 임박한 `blocked_earnings_window`는 정상 차단이다. 단, null 실적일이 0으로 직렬화되면 잘못된 D-0 표시/판정이 되므로 optional number 직렬화는 반드시 null-safe여야 한다.
- 진입거리 초과가 반복되면 sidecar chase 폭을 키우는 방식이 아니라 Stage6 진입가 산출/브레이크아웃 lane 재설계를 우선한다.

