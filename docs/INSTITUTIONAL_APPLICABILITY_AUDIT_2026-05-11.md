# Institutional Applicability Audit

- GeneratedAt: 2026-08-03T14:42:50.222Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Rows: 449
- Schema: institutional-applicability-audit-v2
- Contrarian review: rows=449, insufficient=0, unsupportedClaims=0
- Decision ticket: complete=0, partial=449, insufficient=0, unknown=0

## External Guide Gap Mapping

| Concept | Classification | Existing contract | Remaining gap |
| --- | --- | --- | --- |
| source_backed_analysis | PARTIALLY_COVERED | Stage3-7 lineage, freshness, and artifact evidence | AI narrative claims are not independently source-cited row by row. |
| analyst_risk_reviewer_role_separation | ALREADY_COVERED | TradingCodex specialist roster and repository boundaries | None |
| pre_trade_decision_ticket | PARTIALLY_COVERED | Decision Package plus Stage6 entry/stop/target evidence | Explicit thesis, holding horizon, and time-review evidence are not universally present. |
| independent_bear_case_challenge | PARTIALLY_COVERED | Deterministic report-only contrarian evidence review | No separate source provider or autonomous reviewer is introduced. |
| observable_thesis_invalidation | PARTIALLY_COVERED | Stage6 stop, structure, breakout, target, and risk evidence | Time-based invalidation is not universally source-backed. |
| post_trade_process_review | PARTIALLY_COVERED | Stage7 outcome ledger with process review pending contract | Verified process scoring requires broker-confirmed terminal PAPER lifecycle evidence. |
| generic_fixed_thresholds_or_stop_ranges | REJECT_GENERIC_RULE | Stage-specific, regime-aware, geometry-aware policy | None |

## Latest Run Readiness

| Readiness | Count |
| --- | ---: |
| STOP_GEOMETRY_REVIEW | 1 |
| TARGET_ALREADY_NEAR_CURRENT | 1 |
| STRUCTURE_CONFIRMATION_REQUIRED | 1 |
| BAD_RR_GEOMETRY | 1 |
| SIDE_CAR_FILLABILITY_TEST | 1 |
| CURRENT_RR_BAD | 1 |
| BREAKOUT_RETEST_REQUIRED | 1 |

## Top Institutional Contract Gaps

| Gap | Count |
| --- | ---: |
| source_quality_contract_missing | 449 |
| peer_valuation_contract_missing | 449 |
| macro_policy_risk_contract_missing | 449 |
| earnings_date_missing | 198 |
| current_price_rr_missing | 140 |
| current_required_stop_missing | 140 |
| trade_plan_contract_missing | 89 |
| current_price_missing | 83 |
| current_target_buffer_missing | 83 |
| rr_missing | 4 |

## Latest Candidate Table

| Symbol | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | ReqStop | ReqStopDist% | Price | Entry | Target | Stop | Readiness | Fix |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| ASB | blocked_stop_too_tight | PULLBACK_LIMIT | 15.00 | 127.83 | 0.37 | 11.46 | 4.31 | 29.08 | 2.15 | 29.72 | 26.32 | 31.00 | 26.28 | STOP_GEOMETRY_REVIEW | Review stop floor/tick/ATR buffer; current stop invalidates otherwise high RR names. |
| AUPH | wait_target_near_current | NO_TRADE_CURRENT_RR_BAD | 12.00 | 2.33 | N/A | 13.99 | -3.57 | N/A | N/A | 17.63 | 15.16 | 17.00 | 14.38 | TARGET_ALREADY_NEAR_CURRENT | Target is too close to current price; refresh upside thesis or reject. |
| DAVE | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 48.00 | 13.81 | 0.17 | 33.43 | 6.12 | 306.68 | 3.06 | 316.36 | 210.61 | 335.73 | 201.55 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| DUOL | blocked_rr_below_min | PULLBACK_LIMIT | 4.00 | 1.06 | N/A | 22.88 | -18.74 | N/A | N/A | 130.83 | 100.90 | 106.31 | 95.82 | BAD_RR_GEOMETRY | Keep blocked unless target/stop thesis is recalculated by Stage6. |
| GOOG | executable_current_recalculated_stop | CONFIRMED_RECALCULATED_STOP_ENTRY | 35.00 | 2.00 | 2.00 | 0.00 | 23.03 | 306.83 | 11.51 | 346.76 | 346.76 | 426.62 | 306.83 | SIDE_CAR_FILLABILITY_TEST | Inspect with institutionalResearch/tradePlan schema before execution changes. |
| TRIN | wait_weak_pillar_execution_gate | PULLBACK_LIMIT | 16.00 | 12.13 | 0.46 | 10.67 | 5.58 | 16.50 | 2.79 | 16.97 | 15.16 | 17.92 | 14.93 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| ZVRA | wait_breakout_retest_required | BREAKOUT_RETEST | 119.00 | 16.27 | 4.12 | 19.83 | 116.03 | 5.42 | 58.01 | 12.91 | 10.35 | 27.89 | 9.27 | BREAKOUT_RETEST_REQUIRED | Route to confirmed breakout/retest monitoring lane; keep execution blocked until confirmation. |

## Policy Conclusion

- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.
- Latest dominant readiness: `STOP_GEOMETRY_REVIEW`.
- `BREAKOUT_RETEST_REQUIRED`, `STRUCTURE_CONFIRMATION_REQUIRED`, `CURRENT_STOP_RECALC_REQUIRED`, `CURRENT_RR_BAD`, `CURRENT_DISTANCE_ABOVE_ADAPTIVE_BAND`, and `TARGET_ALREADY_NEAR_CURRENT` are distinct from broker/order failures and must not be fixed with a wider sidecar chase.
- If `CURRENT_STOP_RECALC_REQUIRED` dominates, current-entry may become viable only after ATR/structure validates the required stop; default action remains no-order.
- If `CURRENT_RR_BAD` dominates, the correct fix is Stage6 trade-box recalibration or no-trade, not sidecar price chasing.
- If `GOOD_STOCK_BAD_ENTRY` dominates, add a Stage6 breakout/retest or nearer-entry lane with RR preserved.
- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.
- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.

