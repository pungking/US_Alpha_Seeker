# Stage6 Earnings Coverage/Freshness Audit

- GeneratedAt: 2026-06-04T14:56:55.845Z
- Scope: stage6_earnings_coverage_freshness_report_only
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-04_21-45-22.json
- Latest Earnings Rows: 1
- Latest Coverage Missing: 1
- Latest Auditability Missing: 0
- Latest Execution Still Blocked Elsewhere: 1
- Latest Action: **REPAIR_EARNINGS_SOURCE_COVERAGE**
- Broker Mutation Authorized: false
- Execution Policy Changed: false

## Latest Coverage Counts

| Coverage/Freshness/Verdict | Count |
| --- | ---: |
| coverage:EARNINGS_SOURCE_MISSING | 1 |
| freshness:FRESHNESS_REVIEW_REQUIRED | 1 |
| verdict:EARNINGS_COVERAGE_REPAIR_REQUIRED | 1 |

## Latest Rows

| Symbol | Decision | Reason | Coverage | Freshness | Date | Days | TargetBuf% | RR@Cur | Dist% | Other Blockers | Row Verdict | Action |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| TDC | WAIT_PRICE | wait_earnings_data_missing_quality_floor | EARNINGS_SOURCE_MISSING | FRESHNESS_REVIEW_REQUIRED | N/A | N/A | -4.36 | N/A | 20.80 | target_buffer_below_min, entry_distance_above_adaptive_band, geometry_or_target_invalid_at_current | EARNINGS_COVERAGE_REPAIR_REQUIRED | Repair earnings source, but do not promote; current price/target/geometry still blocks execution. |

## Recent Runs

| Stage6 File | Rows | Earnings Rows | Coverage Counts | Verdict Counts |
| --- | ---: | ---: | --- | --- |
| STAGE6_ALPHA_FINAL_2026-05-22_23-23-46.json | 7 | 2 | EARNINGS_SOURCE_MISSING:2 | EARNINGS_COVERAGE_REPAIR_REQUIRED:2 |
| STAGE6_ALPHA_FINAL_2026-05-24_11-45-50.json | 7 | 2 | EARNINGS_SOURCE_MISSING:2 | EARNINGS_COVERAGE_REPAIR_REQUIRED:2 |
| STAGE6_ALPHA_FINAL_2026-05-25_22-22-34.json | 7 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-05-26_22-26-35.json | 7 | 0 | none | none |
| STAGE6_ALPHA_FINAL_2026-05-27_22-09-10.json | 7 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-05-28_22-15-31.json | 6 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-05-30_03-00-48.json | 8 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-06-01_23-41-12.json | 7 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-06-02_00-15-06.json | 6 | 0 | none | none |
| STAGE6_ALPHA_FINAL_2026-06-02_22-38-42.json | 7 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |
| STAGE6_ALPHA_FINAL_2026-06-03_23-33-11.json | 7 | 2 | EARNINGS_SOURCE_MISSING:2 | EARNINGS_COVERAGE_REPAIR_REQUIRED:2 |
| STAGE6_ALPHA_FINAL_2026-06-04_21-45-22.json | 6 | 1 | EARNINGS_SOURCE_MISSING:1 | EARNINGS_COVERAGE_REPAIR_REQUIRED:1 |

## Policy Interpretation

- `EARNINGS_SOURCE_MISSING` means both dated source and days-to-event are absent. This is data coverage repair, not execution-policy tuning.
- `EARNINGS_DAYS_ONLY_DATE_MISSING` means Stage6 has a days number but lacks an auditable event date/source. Persist the date before trusting freshness.
- `EARNINGS_PRESENT_BUT_EXECUTION_STILL_BLOCKED` means earnings data is not the active execution blocker; do not lower earnings gates to force a trade.
- If `target_buffer_below_min` or invalid geometry appears with earnings missing, repair earnings first but keep execution blocked until price/target geometry is valid.

