# Institutional Applicability Audit

- GeneratedAt: 2026-06-04T07:50:51.395Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-03_23-33-11.json
- Rows: 226

## Latest Run Readiness

| Readiness | Count |
| --- | ---: |
| STRUCTURE_CONFIRMATION_REQUIRED | 4 |
| SIDE_CAR_FILLABILITY_TEST | 1 |
| GOOD_STOCK_BAD_ENTRY | 1 |
| BREAKOUT_RETEST_REQUIRED | 1 |

## Top Institutional Contract Gaps

| Gap | Count |
| --- | ---: |
| source_quality_contract_missing | 226 |
| peer_valuation_contract_missing | 226 |
| macro_policy_risk_contract_missing | 226 |
| earnings_date_missing | 121 |
| current_price_rr_missing | 101 |
| current_required_stop_missing | 101 |
| trade_plan_contract_missing | 89 |
| current_price_missing | 83 |
| current_target_buffer_missing | 83 |

## Latest Candidate Table

| Symbol | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | ReqStop | ReqStopDist% | Price | Entry | Target | Stop | Readiness | Fix |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| AUPH | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 13.00 | 2.51 | 0.57 | 7.10 | 7.32 | 15.26 | 3.66 | 15.84 | 14.72 | 17.00 | 13.81 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| HALO | executable_earnings_data_missing_haircut | PULLBACK_LIMIT | 24.00 | 4.63 | 2.24 | 4.40 | 23.33 | 60.09 | 11.66 | 68.03 | 65.04 | 83.90 | 60.96 | SIDE_CAR_FILLABILITY_TEST | Fix earnings-date source and null-safe serialization before event gating. |
| TDC | wait_earnings_data_missing_quality_floor | PULLBACK_LIMIT | 16.00 | 2.31 | N/A | 22.51 | -6.42 | N/A | N/A | 35.74 | 27.70 | 33.44 | 25.21 | GOOD_STOCK_BAD_ENTRY | Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first. |
| TGTX | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 41.00 | 33.22 | 0.89 | 20.38 | 19.28 | 36.36 | 9.64 | 40.24 | 32.04 | 48.00 | 31.56 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| TOYO | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 43.00 | 9.70 | 0.09 | 37.62 | 3.71 | 15.62 | 1.85 | 15.91 | 9.92 | 16.50 | 9.25 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| VIST | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 39.00 | 7.59 | 1.27 | 15.82 | 27.33 | 66.69 | 13.66 | 77.24 | 65.02 | 98.35 | 60.63 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| ZVRA | wait_breakout_retest_required | BREAKOUT_RETEST | 104.00 | 41.09 | 7.65 | 11.43 | 110.05 | 4.92 | 55.02 | 10.95 | 9.70 | 23.00 | 9.37 | BREAKOUT_RETEST_REQUIRED | Route to confirmed breakout/retest monitoring lane; keep execution blocked until confirmation. |

## Policy Conclusion

- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.
- Latest dominant readiness: `STRUCTURE_CONFIRMATION_REQUIRED`.
- `BREAKOUT_RETEST_REQUIRED`, `STRUCTURE_CONFIRMATION_REQUIRED`, `CURRENT_STOP_RECALC_REQUIRED`, `CURRENT_RR_BAD`, `CURRENT_DISTANCE_ABOVE_ADAPTIVE_BAND`, and `TARGET_ALREADY_NEAR_CURRENT` are distinct from broker/order failures and must not be fixed with a wider sidecar chase.
- If `CURRENT_STOP_RECALC_REQUIRED` dominates, current-entry may become viable only after ATR/structure validates the required stop; default action remains no-order.
- If `CURRENT_RR_BAD` dominates, the correct fix is Stage6 trade-box recalibration or no-trade, not sidecar price chasing.
- If `GOOD_STOCK_BAD_ENTRY` dominates, add a Stage6 breakout/retest or nearer-entry lane with RR preserved.
- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.
- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.

