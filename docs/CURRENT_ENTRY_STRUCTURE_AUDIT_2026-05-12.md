# Current Entry Structure Audit

- GeneratedAt: 2026-05-12T01:55:49.341Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json
- Rows: 8
- Price Source: Stage6 price field for current-entry geometry; local OHLCV JSON for ATR/support when available
- Adjustment: OHLCV adjustment is inherited from upstream harvester/local file; this audit does not rewrite or forward-fill bars
- Timezone: OHLCV dates are treated as US regular trading sessions; generatedAt is UTC ISO8601
- Drive OHLCV Fetch: ok (resolved_by_name)

## Verdict Counts

| Verdict | Count |
| --- | ---: |
| NOT_RECALC_CANDIDATE | 5 |
| STRUCTURE_CONFIRMED_RECALC_CANDIDATE | 1 |
| STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | 2 |

## Latest Candidates

| Symbol | Reason | Verdict | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Bars | Source |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BZ | executable_pullback | NOT_RECALC_CANDIDATE | recalc_not_feasible | 14.31 | 10.62 | 25.82 | 4.56 | 51.64 | 0.46 | 7.98 | N/A | 537 | gdrive:BZ_OHLCV.json |
| CARE | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 26.57 | 26.48 | 0.34 | 0.03 | 0.68 | 0.72 | 0.12 | N/A | 1286 | gdrive:CARE_OHLCV.json |
| IMPP | wait_breakout_retest_required | NOT_RECALC_CANDIDATE | recalc_not_feasible | 5.08 | 3.62 | 28.74 | 2.46 | 57.48 | 0.23 | 6.27 | N/A | 537 | gdrive:IMPP_OHLCV.json |
| INCY | wait_recalculated_stop_required | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 100.32 | 96.23 | 4.08 | 0.78 | 8.15 | 3.24 | 1.26 | 97.12 | 537 | gdrive:INCY_OHLCV.json |
| SKYT | blocked_stop_too_tight | NOT_RECALC_CANDIDATE | recalc_not_feasible | 35.09 | N/A | N/A | N/A | -0.26 | 1.51 | N/A | N/A | 538 | gdrive:SKYT_OHLCV.json |
| TDC | wait_earnings_data_missing_quality_floor | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 32.31 | 31.74 | 1.76 | 0.13 | 3.51 | 1.63 | 0.35 | 29.25 | 537 | gdrive:TDC_OHLCV.json |
| TFPM | executable_earnings_data_missing_haircut | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 35.52 | 31.91 | 10.18 | 1.28 | 20.35 | 1.20 | 3.02 | 35.48 | 537 | gdrive:TFPM_OHLCV.json |
| VIRT | wait_target_near_current | NOT_RECALC_CANDIDATE | recalc_not_feasible | 51.54 | 51.45 | 0.17 | 0.02 | 0.34 | 1.75 | 0.05 | N/A | 537 | gdrive:VIRT_OHLCV.json |

## Policy

- This audit does not authorize orders. It only decides whether a current-entry recalculated stop has enough OHLCV structure support to be reviewed.
- `STRUCTURE_DATA_MISSING` means the correct next fix is OHLCV handoff into Stage6/audit, not wider sidecar chasing.
- A candidate can only progress toward execution review after `STRUCTURE_CONFIRMED_RECALC_CANDIDATE`, and still needs sidecar preflight, idempotency, market-open, and broker submission gates.

