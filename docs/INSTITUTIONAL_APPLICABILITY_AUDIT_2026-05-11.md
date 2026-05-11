# Institutional Applicability Audit

- GeneratedAt: 2026-05-11T14:01:01.979Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json
- Rows: 89

## Latest Run Readiness

| Readiness | Count |
| --- | ---: |
| CURRENT_RR_BAD | 6 |

## Top Institutional Contract Gaps

| Gap | Count |
| --- | ---: |
| source_quality_contract_missing | 89 |
| peer_valuation_contract_missing | 89 |
| macro_policy_risk_contract_missing | 89 |
| trade_plan_contract_missing | 89 |
| current_price_missing | 57 |
| current_price_rr_missing | 57 |
| current_target_buffer_missing | 57 |
| earnings_date_missing | 6 |

## Latest Candidate Table

| Symbol | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | Price | Entry | Target | Stop | Readiness | Fix |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| CSTM | wait_pullback_not_reached | N/A | 42.00 | 32.25 | 0.46 | 24.65 | 11.80 | 33.88 | 25.53 | 37.88 | 25.15 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| EXEL | blocked_stop_too_tight | N/A | 14.00 | 11.59 | 0.11 | 11.90 | 1.38 | 48.16 | 42.43 | 48.82 | 41.88 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| MLI | wait_pullback_not_reached | N/A | 24.00 | 9.44 | 0.32 | 16.66 | 6.16 | 140.83 | 117.37 | 149.50 | 113.97 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| TDC | blocked_rr_below_min | N/A | 18.00 | 1.20 | 0.22 | 11.96 | 5.87 | 31.59 | 27.81 | 33.44 | 23.11 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| TGTX | wait_pullback_not_reached | N/A | 46.00 | 31.48 | 0.47 | 25.25 | 12.33 | 42.86 | 32.04 | 48.14 | 31.53 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| VIRT | wait_pullback_not_reached | N/A | 25.00 | 16.73 | 0.04 | 19.43 | 0.79 | 51.31 | 41.34 | 51.71 | 40.72 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |

## Policy Conclusion

- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.
- Latest dominant readiness: `CURRENT_RR_BAD`.
- `BREAKOUT_RETEST_REQUIRED`, `CURRENT_RR_BAD`, and `TARGET_ALREADY_NEAR_CURRENT` are distinct from broker/order failures and must not be fixed with a wider sidecar chase.
- If `CURRENT_RR_BAD` dominates, the correct fix is Stage6 trade-box recalibration or no-trade, not sidecar price chasing.
- If `GOOD_STOCK_BAD_ENTRY` dominates, add a Stage6 breakout/retest or nearer-entry lane with RR preserved.
- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.
- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.

