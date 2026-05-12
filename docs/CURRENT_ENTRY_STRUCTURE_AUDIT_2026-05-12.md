# Current Entry Structure Audit

- GeneratedAt: 2026-05-12T00:16:26.205Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json
- Rows: 6
- Price Source: Stage6 price field for current-entry geometry; local OHLCV JSON for ATR/support when available
- Adjustment: OHLCV adjustment is inherited from upstream harvester/local file; this audit does not rewrite or forward-fill bars
- Timezone: OHLCV dates are treated as US regular trading sessions; generatedAt is UTC ISO8601
- Drive OHLCV Fetch: ok (resolved_by_name)

## Verdict Counts

| Verdict | Count |
| --- | ---: |
| STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | 1 |
| NOT_RECALC_CANDIDATE | 2 |
| STRUCTURE_CONFIRMED_RECALC_CANDIDATE | 1 |
| STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | 1 |
| STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | 1 |

## Latest Candidates

| Symbol | Reason | Verdict | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Bars | Source |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CSTM | wait_pullback_not_reached | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 33.88 | 31.66 | 6.56 | 0.46 | 11.80 | 1.39 | 1.59 | 32.68 | 1287 | gdrive:CSTM_OHLCV.json |
| EXEL | blocked_stop_too_tight | NOT_RECALC_CANDIDATE | recalc_not_feasible | 48.16 | 47.79 | 0.77 | 0.11 | 1.38 | 1.76 | 0.21 | N/A | 543 | gdrive:EXEL_OHLCV.json |
| MLI | wait_pullback_not_reached | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 140.83 | 136.01 | 3.42 | 0.32 | 6.16 | 4.54 | 1.06 | 137.42 | 537 | gdrive:MLI_OHLCV.json |
| TDC | blocked_rr_below_min | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 31.59 | 30.56 | 3.26 | 0.22 | 5.87 | 1.60 | 0.64 | 28.49 | 536 | gdrive:TDC_OHLCV.json |
| TGTX | wait_pullback_not_reached | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 42.86 | 39.93 | 6.85 | 0.47 | 12.33 | 1.95 | 1.50 | 33.42 | 536 | gdrive:TGTX_OHLCV.json |
| VIRT | wait_pullback_not_reached | NOT_RECALC_CANDIDATE | recalc_not_feasible | 51.31 | 51.09 | 0.44 | 0.04 | 0.79 | 1.86 | 0.12 | N/A | 536 | gdrive:VIRT_OHLCV.json |

## Policy

- This audit does not authorize orders. It only decides whether a current-entry recalculated stop has enough OHLCV structure support to be reviewed.
- `STRUCTURE_DATA_MISSING` means the correct next fix is OHLCV handoff into Stage6/audit, not wider sidecar chasing.
- A candidate can only progress toward execution review after `STRUCTURE_CONFIRMED_RECALC_CANDIDATE`, and still needs sidecar preflight, idempotency, market-open, and broker submission gates.

