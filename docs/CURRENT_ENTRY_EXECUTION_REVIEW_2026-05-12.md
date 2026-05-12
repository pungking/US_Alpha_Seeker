# Current Entry Execution Review

- GeneratedAt: 2026-05-12T00:16:26.741Z
- Source: state/current-entry-structure-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json
- Order Authorized: false
- Safety Reason: execution review artifact only; sidecar/broker gates remain authoritative

## Decision Counts

| Decision | Count |
| --- | ---: |
| STRUCTURE_REJECTED_NO_ORDER | 3 |
| NO_TRADE_CURRENT_RR_OR_TARGET_BAD | 2 |
| EXECUTION_REVIEW_READY | 1 |

## Review Candidates

| Symbol | Decision | Structure | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Next Action |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CSTM | STRUCTURE_REJECTED_NO_ORDER | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | stop_too_far_below_support | 33.88 | 31.66 | 6.56 | 0.46 | 11.80 | 1.39 | 1.59 | 32.68 | Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes. |
| EXEL | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 48.16 | 47.79 | 0.77 | 0.11 | 1.38 | 1.76 | 0.21 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |
| MLI | EXECUTION_REVIEW_READY | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 140.83 | 136.01 | 3.42 | 0.32 | 6.16 | 4.54 | 1.06 | 137.42 | Inject structure-confirmed fields into next Stage6 generation; keep broker submit blocked until Stage6 emits executable_current_recalculated_stop and sidecar preflight passes. |
| TDC | STRUCTURE_REJECTED_NO_ORDER | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 31.59 | 30.56 | 3.26 | 0.22 | 5.87 | 1.60 | 0.64 | 28.49 | Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes. |
| TGTX | STRUCTURE_REJECTED_NO_ORDER | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | stop_above_support | 42.86 | 39.93 | 6.85 | 0.47 | 12.33 | 1.95 | 1.50 | 33.42 | Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes. |
| VIRT | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 51.31 | 51.09 | 0.44 | 0.04 | 0.79 | 1.86 | 0.12 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |

## Policy

- This file is not an order ticket and must not be consumed directly by the broker path.
- Only `EXECUTION_REVIEW_READY` symbols may be considered for the Stage6 structure-confirmed current-entry lane.
- Sidecar must still require fresh Stage6 executable output, preflight pass, idempotency pass, market-open confirmation, and broker submit proof.

