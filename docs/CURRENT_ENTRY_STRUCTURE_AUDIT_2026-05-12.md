# Current Entry Structure Audit

- GeneratedAt: 2026-06-11T07:54:20.610Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-10_22-22-25.json
- Rows: 63
- Recent Runs: 10
- Price Source: Stage6 price field for current-entry geometry; local OHLCV JSON for ATR/support when available
- Adjustment: OHLCV adjustment is inherited from upstream harvester/local file; this audit does not rewrite or forward-fill bars
- Timezone: OHLCV dates are treated as US regular trading sessions; generatedAt is UTC ISO8601
- Drive OHLCV Fetch: ok (resolved_by_name)

## Verdict Counts

| Verdict | Count |
| --- | ---: |
| NOT_RECALC_CANDIDATE | 28 |
| STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | 16 |
| STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | 12 |
| STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | 4 |
| STRUCTURE_REJECT_PRICE_DRIFT_HIGH | 2 |
| STRUCTURE_CONFIRMED_RECALC_CANDIDATE | 1 |

## Stage6 File Counts

| Stage6 File | Count |
| --- | ---: |
| STAGE6_ALPHA_FINAL_2026-06-10_22-22-25.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-09_22-43-33.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-09_22-19-28.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-09_21-53-25.json | 7 |
| STAGE6_ALPHA_FINAL_2026-06-08_22-54-00.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-06_05-33-21.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-06_05-08-57.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-06_04-11-37.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-06_00-23-47.json | 6 |
| STAGE6_ALPHA_FINAL_2026-06-05_17-16-20.json | 7 |

## Latest Candidates

| Symbol | Reason | Verdict | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Bars | Source |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.65 | 5.31 | 38.63 | 3.77 | 77.26 | 0.29 | 11.49 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 278.71 | 251.11 | 9.90 | 0.69 | 19.81 | 19.14 | 1.44 | 261.07 | 556 | gdrive:DAVE_OHLCV.json |
| DUOL | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 117.86 | N/A | N/A | N/A | -9.80 | 7.02 | N/A | N/A | 560 | gdrive:DUOL_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 31.38 | 30.36 | 3.26 | 0.50 | 6.53 | 0.63 | 1.63 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 103.23 | 100.43 | 2.71 | 0.40 | 5.42 | 3.13 | 0.90 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 13.66 | 7.32 | 46.39 | 2.94 | 92.78 | 0.64 | 9.93 | N/A | 556 | gdrive:ZVRA_OHLCV.json |
| BY | blocked_stop_too_tight | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 34.60 | 33.20 | 4.05 | 0.76 | 8.09 | 0.74 | 1.89 | 32.95 | 1265 | gdrive:BY_OHLCV.json |
| DUOL | wait_earnings_data_missing_quality_floor | NOT_RECALC_CANDIDATE | recalc_not_feasible | 119.92 | N/A | N/A | N/A | -12.82 | 7.02 | N/A | N/A | 560 | gdrive:DUOL_OHLCV.json |
| EXEL | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 53.14 | N/A | N/A | N/A | -6.57 | 1.57 | N/A | N/A | 560 | gdrive:EXEL_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 102.57 | 99.88 | 2.63 | 0.40 | 5.25 | 3.13 | 0.86 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 42.31 | 39.47 | 6.72 | 0.54 | 13.45 | 1.60 | 1.78 | 41.11 | 556 | gdrive:TGTX_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.96 | 7.94 | 38.73 | 2.78 | 77.47 | 0.64 | 7.87 | N/A | 556 | gdrive:ZVRA_OHLCV.json |
| BY | blocked_stop_too_tight | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 33.91 | 32.16 | 5.15 | 1.16 | 10.29 | 0.74 | 2.35 | 32.95 | 1265 | gdrive:BY_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.54 | 5.14 | 39.77 | 4.08 | 79.55 | 0.29 | 11.68 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 270.29 | 238.48 | 11.77 | 0.90 | 23.54 | 19.14 | 1.66 | 261.07 | 556 | gdrive:DAVE_OHLCV.json |
| DUOL | wait_earnings_data_missing_quality_floor | NOT_RECALC_CANDIDATE | recalc_not_feasible | 117.96 | N/A | N/A | N/A | -11.37 | 7.02 | N/A | N/A | 560 | gdrive:DUOL_OHLCV.json |
| IMPP | blocked_stop_too_tight | NOT_RECALC_CANDIDATE | recalc_not_feasible | 5.23 | 3.35 | 36.04 | 5.34 | 72.08 | 0.25 | 7.54 | N/A | 556 | gdrive:IMPP_OHLCV.json |
| INCY | blocked_invalid_geometry | NOT_RECALC_CANDIDATE | recalc_not_feasible | 100.64 | 96.98 | 3.64 | 2.00 | 7.27 | 3.13 | 1.17 | N/A | 556 | gdrive:INCY_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.09 | 6.63 | 45.12 | 3.98 | 90.24 | 0.64 | 8.55 | N/A | 556 | gdrive:ZVRA_OHLCV.json |
| BY | blocked_stop_too_tight | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 33.91 | 32.16 | 5.15 | 1.16 | 10.29 | 0.74 | 2.35 | 32.95 | 1265 | gdrive:BY_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.54 | 5.14 | 39.77 | 4.08 | 79.55 | 0.29 | 11.68 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| DAVE | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 270.29 | 238.48 | 11.77 | 0.90 | 23.54 | 19.14 | 1.66 | 261.07 | 556 | gdrive:DAVE_OHLCV.json |
| DUOL | wait_earnings_data_missing_quality_floor | NOT_RECALC_CANDIDATE | recalc_not_feasible | 117.96 | N/A | N/A | N/A | -11.37 | 7.02 | N/A | N/A | 560 | gdrive:DUOL_OHLCV.json |
| IMPP | blocked_stop_too_tight | NOT_RECALC_CANDIDATE | recalc_not_feasible | 5.23 | 3.35 | 36.04 | 5.34 | 72.08 | 0.25 | 7.54 | N/A | 556 | gdrive:IMPP_OHLCV.json |
| INCY | blocked_invalid_geometry | NOT_RECALC_CANDIDATE | recalc_not_feasible | 100.64 | 96.98 | 3.64 | 2.00 | 7.27 | 3.13 | 1.17 | N/A | 556 | gdrive:INCY_OHLCV.json |
| ZVRA | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 12.09 | 6.63 | 45.12 | 3.98 | 90.24 | 0.64 | 8.55 | N/A | 556 | gdrive:ZVRA_OHLCV.json |
| BFH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 91.54 | 89.22 | 2.54 | 0.33 | 5.08 | 2.96 | 0.79 | 87.45 | 556 | gdrive:BFH_OHLCV.json |
| CRDO | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band | 221.33 | 206.54 | 6.68 | 0.31 | 13.37 | 25.00 | 0.59 | 210.08 | 549 | gdrive:CRDO_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.46 | 5.02 | 40.62 | 4.34 | 81.25 | 0.29 | 11.82 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| GNTX | blocked_stop_too_tight | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 24.87 | 22.64 | 8.97 | 1.42 | 17.95 | 0.55 | 4.08 | 24.59 | 556 | gdrive:GNTX_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 103.70 | 101.57 | 2.05 | 0.30 | 4.11 | 3.13 | 0.68 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| TOYO | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support,close_below_sma20 | 15.32 | 14.73 | 3.85 | 0.19 | 7.70 | 1.73 | 0.34 | 14.00 | 1054 | gdrive:TOYO_OHLCV.json |
| BFH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 91.11 | 88.57 | 2.79 | 0.37 | 5.57 | 2.96 | 0.86 | 87.45 | 556 | gdrive:BFH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.36 | 4.87 | 41.71 | 4.70 | 83.41 | 0.29 | 11.99 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| EXEL | blocked_quality_verdict_unusable | NOT_RECALC_CANDIDATE | recalc_not_feasible | 52.70 | N/A | N/A | N/A | -5.79 | 1.57 | N/A | N/A | 560 | gdrive:EXEL_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.85 | 29.56 | 4.18 | 0.72 | 8.36 | 0.63 | 2.05 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 102.38 | 99.59 | 2.72 | 0.43 | 5.45 | 3.13 | 0.89 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 40.16 | 36.24 | 9.76 | 0.91 | 19.52 | 1.60 | 2.46 | 40.04 | 556 | gdrive:TGTX_OHLCV.json |
| BFH | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 91.11 | 88.57 | 2.79 | 0.37 | 5.57 | 2.96 | 0.86 | 87.45 | 556 | gdrive:BFH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.36 | 4.87 | 41.71 | 4.70 | 83.41 | 0.29 | 11.99 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| EXEL | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 52.70 | N/A | N/A | N/A | -5.79 | 1.57 | N/A | N/A | 560 | gdrive:EXEL_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.85 | 29.56 | 4.18 | 0.72 | 8.36 | 0.63 | 2.05 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 102.38 | 99.59 | 2.72 | 0.43 | 5.45 | 3.13 | 0.89 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 40.16 | 36.24 | 9.76 | 0.91 | 19.52 | 1.60 | 2.46 | 40.04 | 556 | gdrive:TGTX_OHLCV.json |
| BFH | wait_recalculated_stop_required | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 90.31 | 87.37 | 3.25 | 0.45 | 6.51 | 2.96 | 0.99 | 87.45 | 556 | gdrive:BFH_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.41 | 4.95 | 41.16 | 4.51 | 82.32 | 0.29 | 11.91 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| EXEL | blocked_quality_verdict_unusable | NOT_RECALC_CANDIDATE | recalc_not_feasible | 52.65 | N/A | N/A | N/A | -5.70 | 1.57 | N/A | N/A | 560 | gdrive:EXEL_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.94 | 29.70 | 4.02 | 0.68 | 8.04 | 0.63 | 1.98 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 103.21 | 100.84 | 2.30 | 0.35 | 4.60 | 3.13 | 0.76 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 40.56 | 36.84 | 9.17 | 0.83 | 18.34 | 1.60 | 2.33 | 40.04 | 556 | gdrive:TGTX_OHLCV.json |
| CPRX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 31.29 | 30.64 | 2.09 | 0.20 | 4.19 | 0.06 | 10.30 | 31.27 | 556 | gdrive:CPRX_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.59 | 5.22 | 39.25 | 3.93 | 78.50 | 0.29 | 11.60 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| EXEL | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 52.46 | N/A | N/A | N/A | -5.36 | 1.57 | N/A | N/A | 560 | gdrive:EXEL_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.85 | 29.56 | 4.18 | 0.72 | 8.36 | 0.63 | 2.05 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 106.00 | 105.02 | 0.92 | 0.12 | 1.85 | 3.13 | 0.31 | N/A | 556 | gdrive:INCY_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 40.31 | 36.47 | 9.54 | 0.88 | 19.08 | 1.60 | 2.41 | 40.04 | 556 | gdrive:TGTX_OHLCV.json |
| BZ | executable_earnings_data_missing_haircut | NOT_RECALC_CANDIDATE | recalc_not_feasible | 14.24 | 10.77 | 24.40 | 3.90 | 48.80 | 0.60 | 5.79 | N/A | 556 | gdrive:BZ_OHLCV.json |
| CRMD | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 8.54 | 5.14 | 39.77 | 4.08 | 79.55 | 0.29 | 11.68 | N/A | 556 | gdrive:CRMD_OHLCV.json |
| CSTM | wait_structure_confirmation_required | STRUCTURE_REJECT_PRICE_DRIFT_HIGH | price_drift_high,stop_atr_out_of_band,stop_above_support | 36.15 | 35.52 | 1.75 | 0.12 | 3.49 | 1.97 | 0.32 | 33.24 | 1300 | gdrive:CSTM_OHLCV.json |
| FFBC | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 30.54 | 29.10 | 4.73 | 0.88 | 9.46 | 0.63 | 2.30 | 30.12 | 556 | gdrive:FFBC_OHLCV.json |
| INCY | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 101.24 | 97.88 | 3.32 | 0.57 | 6.64 | 3.13 | 1.07 | 97.12 | 556 | gdrive:INCY_OHLCV.json |
| OSPN | blocked_quality_verdict_unusable | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 14.72 | 13.96 | 5.20 | 0.42 | 10.39 | 0.59 | 1.30 | 12.25 | 556 | gdrive:OSPN_OHLCV.json |
| TGTX | wait_structure_confirmation_required | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 40.56 | 36.84 | 9.17 | 0.83 | 18.34 | 1.60 | 2.33 | 40.04 | 556 | gdrive:TGTX_OHLCV.json |

## Policy

- This audit does not authorize orders. It only decides whether a current-entry recalculated stop has enough OHLCV structure support to be reviewed.
- `STRUCTURE_DATA_MISSING` means the correct next fix is OHLCV handoff into Stage6/audit, not wider sidecar chasing.
- A candidate can only progress toward execution review after `STRUCTURE_CONFIRMED_RECALC_CANDIDATE`, and still needs sidecar preflight, idempotency, market-open, and broker submission gates.

