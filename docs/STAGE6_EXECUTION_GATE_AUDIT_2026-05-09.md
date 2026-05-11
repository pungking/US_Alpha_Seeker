# Stage6 Execution Gate Audit

- GeneratedAt: 2026-05-11T13:09:21.144Z
- Source files: 13
- Rows: 89
- Zero executable runs: 3
- Overall verdict: **MODEL_OR_DATA_POLICY_ERROR**

## Run Verdicts

| Stage6 File | Rows | Exec | Verdict | Top Reasons |
| --- | ---: | ---: | --- | --- |
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

| File | Symbol | Decision | Reason | ER% | RR | Dist% | Price | Entry | Target | Stop | EarningsD | Class | Fix Lane |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | CSTM | WAIT_PRICE | wait_pullback_not_reached | 42.00 | 32.25 | 24.65 | 33.88 | 25.53 | 37.88 | 25.15 | N/A | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | EXEL | BLOCKED_RISK | blocked_stop_too_tight | 14.00 | 11.59 | 11.90 | 48.16 | 42.43 | 48.82 | 41.88 | N/A | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | MLI | WAIT_PRICE | wait_pullback_not_reached | 24.00 | 9.44 | 16.66 | 140.83 | 117.37 | 149.50 | 113.97 | N/A | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | TDC | BLOCKED_RISK | blocked_rr_below_min | 18.00 | 1.20 | 11.96 | 31.59 | 27.81 | 33.44 | 23.11 | N/A | NORMAL_RR_BLOCK | none |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | 46.00 | 31.48 | 25.25 | 42.86 | 32.04 | 48.14 | 31.53 | N/A | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json | VIRT | WAIT_PRICE | wait_pullback_not_reached | 25.00 | 16.73 | 19.43 | 51.31 | 41.34 | 51.71 | 40.72 | N/A | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | CGEN | WAIT_PRICE | wait_pullback_not_reached | 137.00 | 129.70 | 26.40 | N/A | 2.10 | 6.20 | 2.07 | 10 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | CPRX | BLOCKED_EVENT | blocked_earnings_window | 32.00 | 5.18 | 19.05 | N/A | 25.23 | 34.14 | 23.51 | 3 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | DHT | BLOCKED_RISK | blocked_stop_too_tight | 22.00 | 34.69 | 13.19 | N/A | 16.51 | 20.20 | 16.40 | 0 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | JHG | BLOCKED_EVENT | blocked_earnings_window | 5.00 | 3.91 | 3.74 | N/A | 49.75 | 52.67 | 49.00 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | PTC | WAIT_PRICE | wait_earnings_data_missing_quality_floor | 28.00 | 2.60 | 3.83 | N/A | 142.00 | 184.44 | 125.69 | 0 | DATA_POLICY_OVERBLOCK | earnings_missing_threshold_policy |
| STAGE6_ALPHA_FINAL_2026-05-08_20-25-34.json | SPNT | WAIT_PRICE | wait_pullback_not_reached | 26.00 | 17.12 | 10.80 | N/A | 20.95 | 26.33 | 20.64 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | ASB | WAIT_PRICE | wait_pullback_not_reached | 21.00 | 14.28 | 11.88 | N/A | 25.45 | 30.90 | 25.07 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | DLO | BLOCKED_RISK | blocked_stop_too_tight | 45.00 | 40.25 | 13.45 | N/A | 12.14 | 17.65 | 12.01 | 7 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | HNRG | WAIT_PRICE | wait_pullback_not_reached | 57.00 | 3.54 | 9.94 | N/A | 16.71 | 27.13 | 13.76 | 0 | CONSERVATIVE_PULLBACK_WAIT | sidecar_reprice_or_watch |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | INCY | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | 14.00 | 3.22 | 5.61 | N/A | 94.25 | 108.50 | 89.83 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | MLI | WAIT_PRICE | wait_pullback_not_reached | 27.00 | 11.27 | 15.92 | N/A | 116.98 | 149.50 | 114.09 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | PDD | EXECUTABLE_NOW | executable_pullback | 44.00 | 8.05 | 3.08 | N/A | 99.16 | 142.87 | 93.73 | 20 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_20-49-27.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | 39.00 | 28.32 | 25.46 | N/A | 31.28 | 44.57 | 30.81 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | AUPH | BLOCKED_EVENT | blocked_earnings_window | 16.00 | 12.95 | 10.09 | N/A | 14.51 | 17.00 | 14.32 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | CSTM | WAIT_PRICE | wait_pullback_not_reached | 39.00 | 31.47 | 24.14 | N/A | 25.51 | 37.54 | 25.12 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | DAVE | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | 55.00 | 3.38 | 13.21 | N/A | 197.47 | 325.50 | 159.54 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | HNRG | EXECUTABLE_NOW | executable_earnings_data_missing_haircut | 57.00 | 3.59 | 10.08 | N/A | 16.71 | 27.13 | 13.81 | 0 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | JHG | BLOCKED_EVENT | blocked_earnings_window | 5.00 | 3.91 | 3.66 | N/A | 49.75 | 52.67 | 49.00 | 1 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | MLI | WAIT_PRICE | wait_pullback_not_reached | 25.00 | 7.55 | 16.16 | N/A | 116.83 | 149.50 | 112.50 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-07_01-11-52.json | TGTX | WAIT_PRICE | wait_pullback_not_reached | 44.00 | 31.76 | 21.04 | N/A | 30.19 | 44.57 | 29.74 | 0 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | AUPH | BLOCKED_EVENT | blocked_earnings_window | 16.00 | 12.95 | 9.53 | N/A | 14.51 | 17.00 | 14.32 | 5 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | CPRX | BLOCKED_EVENT | blocked_earnings_window | 32.00 | 5.23 | 18.25 | N/A | 25.23 | 34.14 | 23.52 | 5 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | JHG | BLOCKED_EVENT | blocked_earnings_window | 5.00 | 3.91 | 3.59 | N/A | 49.75 | 52.67 | 49.00 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | MLI | WAIT_PRICE | wait_earnings_data_missing | 25.00 | 7.55 | 14.26 | N/A | 116.83 | 149.50 | 112.50 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | SN | BLOCKED_EVENT | blocked_earnings_window | 33.00 | 24.96 | 8.17 | N/A | 107.81 | 149.01 | 106.16 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-06_20-46-43.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | 24.00 | 16.73 | 18.32 | N/A | 41.34 | 51.71 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | ADBE | EXECUTABLE_NOW | executable_pullback | 36.00 | 3.13 | 4.63 | N/A | 242.19 | 329.11 | 214.40 | 37 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | ALL | WAIT_PRICE | wait_earnings_data_missing | 18.00 | 20.19 | 7.10 | N/A | 204.26 | 241.71 | 202.40 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | AUPH | BLOCKED_RISK | blocked_stop_too_tight | 17.00 | 13.15 | 7.98 | N/A | 14.51 | 17.00 | 14.32 | 6 | GEOMETRY_POLICY_REVIEW | stop_floor_or_tick_buffer_review |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | CPRX | EXECUTABLE_NOW | executable_pullback | 29.00 | 5.49 | 12.83 | N/A | 25.23 | 34.14 | 23.60 | 6 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | 97.00 | 76.61 | 26.14 | N/A | 3.72 | 8.00 | 3.67 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | JHG | BLOCKED_EVENT | blocked_earnings_window | 6.00 | 3.91 | 3.66 | N/A | 49.75 | 52.67 | 49.00 | 3 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | LNG | BLOCKED_EVENT | blocked_earnings_window | 29.00 | 20.14 | 14.72 | N/A | 232.69 | 303.00 | 229.20 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-05_20-31-44.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | 22.00 | 14.89 | 16.57 | N/A | 41.34 | 50.57 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | ADBE | EXECUTABLE_NOW | executable_pullback | 31.00 | 3.10 | 3.40 | N/A | 242.19 | 327.95 | 214.50 | 38 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | BUSE | WAIT_PRICE | wait_earnings_data_missing | 11.00 | 100.50 | 6.24 | N/A | 24.95 | 28.00 | 24.92 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | CPRX | EXECUTABLE_NOW | executable_pullback | 29.00 | 5.08 | 12.22 | N/A | 25.23 | 34.14 | 23.47 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | INCY | WAIT_PRICE | wait_earnings_data_missing | 13.00 | 2.47 | 1.75 | N/A | 95.22 | 108.50 | 89.84 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | INVA | BLOCKED_EVENT | blocked_earnings_window | 43.00 | 40.19 | 3.04 | N/A | 22.41 | 33.20 | 22.14 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | JHG | BLOCKED_EVENT | blocked_earnings_window | 6.00 | 3.99 | 3.70 | N/A | 49.69 | 52.67 | 48.95 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-04_20-45-27.json | UMBF | WAIT_PRICE | wait_earnings_data_missing | 27.00 | 5.87 | 10.50 | N/A | 115.67 | 146.75 | 110.38 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | ANET | BLOCKED_EVENT | blocked_earnings_window | 32.00 | 2.14 | 22.17 | N/A | 134.41 | 179.75 | 113.21 | 4 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | DLO | EXECUTABLE_NOW | executable_pullback | 48.00 | 11.17 | 13.56 | N/A | 12.00 | 17.75 | 11.48 | 13 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | HG | WAIT_PRICE | wait_earnings_data_missing | 14.00 | 9.58 | 11.95 | N/A | 28.85 | 33.00 | 28.42 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | 106.00 | 76.84 | 26.55 | N/A | 3.72 | 8.00 | 3.66 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | JHG | EXECUTABLE_NOW | executable_pullback | 6.00 | 3.99 | 3.72 | N/A | 49.69 | 52.67 | 48.95 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-05-01_20-12-01.json | MLI | WAIT_PRICE | wait_earnings_data_missing | 25.00 | 2.84 | 13.73 | N/A | 116.83 | 149.50 | 105.33 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | HG | BLOCKED_EVENT | blocked_earnings_window | 12.00 | 9.58 | 9.69 | N/A | 28.85 | 33.00 | 28.42 | 0 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | IMPP | WAIT_PRICE | wait_earnings_data_missing | 107.00 | 77.64 | 25.19 | N/A | 3.70 | 8.00 | 3.64 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | INCY | WAIT_PRICE | wait_earnings_data_missing | 14.00 | 2.35 | 3.92 | N/A | 95.22 | 108.09 | 89.74 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | INVA | EXECUTABLE_NOW | executable_pullback | 48.00 | 34.04 | 4.65 | N/A | 21.98 | 33.20 | 21.65 | 6 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | JHG | EXECUTABLE_NOW | executable_pullback | 6.00 | 3.99 | 3.64 | N/A | 49.69 | 52.67 | 48.95 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | VIRT | WAIT_PRICE | wait_earnings_data_missing | 18.00 | 12.12 | 18.66 | N/A | 41.34 | 48.86 | 40.72 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-30_20-45-42.json | ZM | WAIT_PRICE | wait_pullback_not_reached | 22.00 | 3.83 | 18.22 | N/A | 78.32 | 97.33 | 73.36 | 21 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | AUPH | EXECUTABLE_NOW | executable_pullback | 15.00 | 2.84 | 9.53 | N/A | 14.51 | 17.00 | 13.64 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | CPRX | EXECUTABLE_NOW | executable_pullback | 32.00 | 3.94 | 14.31 | N/A | 25.23 | 34.00 | 23.00 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | INCY | WAIT_PRICE | wait_earnings_data_missing | 13.00 | 1.81 | 2.58 | N/A | 95.22 | 107.36 | 88.51 | 0 | EARNINGS_MISSING_CONSERVATIVE_WAIT | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | INVA | EXECUTABLE_NOW | executable_pullback | 52.00 | 36.83 | 9.73 | N/A | 21.39 | 33.20 | 21.06 | 7 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | JHG | EXECUTABLE_NOW | executable_pullback | 5.00 | 3.99 | 3.64 | N/A | 49.69 | 52.67 | 48.95 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | MLI | WAIT_PRICE | wait_earnings_data_missing | 25.00 | 2.57 | 13.87 | N/A | 116.83 | 149.50 | 104.12 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | OPRA | WAIT_PRICE | wait_earnings_data_missing | 79.00 | 14.41 | 22.54 | N/A | 13.80 | 25.64 | 12.97 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-29_20-39-29.json | SPG | EXECUTABLE_NOW | executable_pullback | 11.00 | 3.01 | 7.05 | N/A | 188.46 | 208.55 | 181.79 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | AUPH | EXECUTABLE_NOW | executable_pullback | 17.00 | 2.02 | 11.35 | N/A | 14.51 | 17.00 | 13.28 | 13 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | CPRX | EXECUTABLE_NOW | executable_pullback | 35.00 | 2.78 | 13.81 | N/A | 25.23 | 34.00 | 22.07 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | CRMD | EXECUTABLE_NOW | executable_pullback | 108.00 | 14.62 | 12.56 | N/A | 6.84 | 14.86 | 6.29 | 8 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | GNTX | WAIT_PRICE | wait_earnings_data_missing | 31.00 | 4.51 | 8.40 | N/A | 21.85 | 28.67 | 20.35 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | HG | BLOCKED_EVENT | blocked_earnings_window | 14.00 | 6.20 | 11.67 | N/A | 28.71 | 33.00 | 28.01 | 2 | NORMAL_EVENT_BLACKOUT | none_unless_date_wrong |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | MLI | WAIT_PRICE | wait_earnings_data_missing | 27.00 | 2.48 | 14.41 | N/A | 116.83 | 149.50 | 103.65 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-28_20-52-15.json | NVDA | WAIT_PRICE | wait_pullback_not_reached | 49.00 | 4.24 | 17.01 | N/A | 179.78 | 268.61 | 158.81 | 22 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | AUPH | EXECUTABLE_NOW | executable_pullback | 17.00 | 2.06 | 9.19 | N/A | 14.51 | 17.00 | 13.30 | 14 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | CPRX | EXECUTABLE_NOW | executable_pullback | 42.00 | 6.21 | 12.63 | N/A | 23.91 | 34.00 | 22.29 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | FFBC | WAIT_PRICE | wait_earnings_data_missing | 17.00 | 4.55 | 9.92 | N/A | 27.55 | 32.14 | 26.54 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | GNTX | WAIT_PRICE | wait_earnings_data_missing | 28.00 | 4.09 | 8.48 | N/A | 21.85 | 27.89 | 20.38 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | INVA | EXECUTABLE_NOW | executable_pullback | 50.00 | 37.62 | 9.96 | N/A | 21.22 | 33.20 | 20.90 | 9 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | NVDA | EXECUTABLE_NOW | executable_pullback | 51.00 | 4.78 | 14.51 | N/A | 178.04 | 268.61 | 159.09 | 23 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-27_20-52-54.json | PD | BLOCKED_RISK | blocked_stop_too_wide | 9.00 | 0.42 | 1.04 | N/A | 7.20 | 8.00 | 5.30 | 31 | OTHER_BLOCK | inspect |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | AMSC | WAIT_PRICE | wait_pullback_not_reached | 47.00 | 4.30 | 29.11 | N/A | 32.72 | 52.33 | 28.15 | 33 | ENTRY_MODEL_TOO_DEEP | entry_model_recalibration |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | AUPH | EXECUTABLE_NOW | executable_pullback | 17.00 | 2.05 | 10.09 | N/A | 14.51 | 17.00 | 13.30 | 17 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | BYD | WAIT_PRICE | wait_earnings_data_missing | 18.00 | 4.33 | 9.78 | N/A | 80.43 | 94.73 | 77.13 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | CPRX | EXECUTABLE_NOW | executable_pullback | 43.00 | 6.90 | 14.03 | N/A | 23.80 | 34.00 | 22.32 | 12 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | DECK | EXECUTABLE_NOW | executable_pullback | 26.00 | 2.15 | 5.92 | N/A | 101.33 | 128.76 | 88.59 | 27 | EXECUTABLE | sidecar_fillability |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | KTB | BLOCKED_RISK | blocked_quality_verdict_unusable | 45.00 | 95.95 | 16.58 | N/A | 63.21 | 92.67 | 62.91 | 13 | VERDICT_NORMALIZATION_BLOCK | verdict_contract_normalization |
| STAGE6_ALPHA_FINAL_2026-04-24_20-11-15.json | MLI | WAIT_PRICE | wait_earnings_data_missing | 25.00 | 2.49 | 13.93 | N/A | 116.83 | 149.50 | 103.73 | 0 | EARNINGS_DATA_GAP | earnings_data_collection |

## Policy Decision

- `EXECUTABLE_NOW`가 0개인 run 중 `DATA_POLICY_OVERBLOCK` 또는 `ENTRY_MODEL_TOO_DEEP`가 있으면 정상적인 보수 필터가 아니라 Stage6 정책/모델 설계 문제로 판정한다.
- 실적일이 진짜 임박한 `blocked_earnings_window`는 정상 차단이다. 단, null 실적일이 0으로 직렬화되면 잘못된 D-0 표시/판정이 되므로 optional number 직렬화는 반드시 null-safe여야 한다.
- 진입거리 초과가 반복되면 sidecar chase 폭을 키우는 방식이 아니라 Stage6 진입가 산출/브레이크아웃 lane 재설계를 우선한다.

