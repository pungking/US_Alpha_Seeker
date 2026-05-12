# Current Entry Execution Review

- GeneratedAt: 2026-05-12T01:55:50.658Z
- Source: state/current-entry-structure-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-12_10-51-55.json
- Order Authorized: false
- Safety Reason: execution review artifact only; sidecar/broker gates remain authoritative

## Decision Counts

| Decision | Count |
| --- | ---: |
| NO_TRADE_CURRENT_RR_OR_TARGET_BAD | 5 |
| EXECUTION_REVIEW_READY | 1 |
| STRUCTURE_REJECTED_NO_ORDER | 2 |

## Review Candidates

| Symbol | Decision | Structure | Reasons | Price | ReqStop | ReqStopDist% | RR@Cur | TargetBuf% | ATR | StopATR | Support | Next Action |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BZ | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 14.31 | 10.62 | 25.82 | 4.56 | 51.64 | 0.46 | 7.98 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |
| CARE | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 26.57 | 26.48 | 0.34 | 0.03 | 0.68 | 0.72 | 0.12 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |
| IMPP | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 5.08 | 3.62 | 28.74 | 2.46 | 57.48 | 0.23 | 6.27 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |
| INCY | EXECUTION_REVIEW_READY | STRUCTURE_CONFIRMED_RECALC_CANDIDATE |  | 100.32 | 96.23 | 4.08 | 0.78 | 8.15 | 3.24 | 1.26 | 97.12 | Inject structure-confirmed fields into next Stage6 generation; keep broker submit blocked until Stage6 emits executable_current_recalculated_stop and sidecar preflight passes. |
| SKYT | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 35.09 | N/A | N/A | N/A | -0.26 | 1.51 | N/A | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |
| TDC | STRUCTURE_REJECTED_NO_ORDER | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_above_support | 32.31 | 31.74 | 1.76 | 0.13 | 3.51 | 1.63 | 0.35 | 29.25 | Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes. |
| TFPM | STRUCTURE_REJECTED_NO_ORDER | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | stop_atr_out_of_band,stop_too_far_below_support | 35.52 | 31.91 | 10.18 | 1.28 | 20.35 | 1.20 | 3.02 | 35.48 | Keep watchlist; do not widen chase. Recompute entry/target/stop only if Stage4/Stage5 thesis changes. |
| VIRT | NO_TRADE_CURRENT_RR_OR_TARGET_BAD | NOT_RECALC_CANDIDATE | recalc_not_feasible | 51.54 | 51.45 | 0.17 | 0.02 | 0.34 | 1.75 | 0.05 | N/A | Reject current-entry lane; wait for new setup or refreshed target thesis. |

## Policy

- This file is not an order ticket and must not be consumed directly by the broker path.
- Only `EXECUTION_REVIEW_READY` symbols may be considered for the Stage6 structure-confirmed current-entry lane.
- Sidecar must still require fresh Stage6 executable output, preflight pass, idempotency pass, market-open confirmation, and broker submit proof.

