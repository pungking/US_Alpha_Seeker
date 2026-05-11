# Institutional Applicability Audit

- GeneratedAt: 2026-05-11T13:10:28.593Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-05-11_22-01-52.json
- Rows: 89

## Latest Run Readiness

| Readiness | Count |
| --- | ---: |
| GOOD_STOCK_BAD_ENTRY | 4 |
| STOP_GEOMETRY_REVIEW | 1 |
| BAD_RR_GEOMETRY | 1 |

## Top Institutional Contract Gaps

| Gap | Count |
| --- | ---: |
| source_quality_contract_missing | 89 |
| peer_valuation_contract_missing | 89 |
| macro_policy_risk_contract_missing | 89 |
| trade_plan_contract_missing | 89 |
| current_price_missing | 83 |
| earnings_date_missing | 6 |
| execution_score_missing | 6 |

## Latest Candidate Table

| Symbol | Reason | ER% | RR | Dist% | Price | Entry | Target | Stop | Readiness | Fix |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| CSTM | wait_pullback_not_reached | 42.00 | 32.25 | 24.65 | 33.88 | 25.53 | 37.88 | 25.15 | GOOD_STOCK_BAD_ENTRY | Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first. |
| EXEL | blocked_stop_too_tight | 14.00 | 11.59 | 11.90 | 48.16 | 42.43 | 48.82 | 41.88 | STOP_GEOMETRY_REVIEW | Review stop floor/tick/ATR buffer; current stop invalidates otherwise high RR names. |
| MLI | wait_pullback_not_reached | 24.00 | 9.44 | 16.66 | 140.83 | 117.37 | 149.50 | 113.97 | GOOD_STOCK_BAD_ENTRY | Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first. |
| TDC | blocked_rr_below_min | 18.00 | 1.20 | 11.96 | 31.59 | 27.81 | 33.44 | 23.11 | BAD_RR_GEOMETRY | Keep blocked unless target/stop thesis is recalculated by Stage6. |
| TGTX | wait_pullback_not_reached | 46.00 | 31.48 | 25.25 | 42.86 | 32.04 | 48.14 | 31.53 | GOOD_STOCK_BAD_ENTRY | Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first. |
| VIRT | wait_pullback_not_reached | 25.00 | 16.73 | 19.43 | 51.31 | 41.34 | 51.71 | 40.72 | GOOD_STOCK_BAD_ENTRY | Add Stage6 breakout/retest or nearer-entry lane; do not widen sidecar chase first. |

## Policy Conclusion

- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.
- The dominant current problem is `GOOD_STOCK_BAD_ENTRY`: high ER/RR names with entry targets 16-25% below current price.
- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.
- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.

