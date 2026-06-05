# Stage6 Earnings Lineage Trace

- GeneratedAt: 2026-06-05T00:24:06.664Z
- Scope: stage6_earnings_stage4_vendor_lineage_trace_report_only
- Overall: **fail_earnings_lineage_gap_found**
- Action: **TRACE_STAGE4_VENDOR_EARNINGS_SOURCE**
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-04_21-45-22.json
- Latest Stage6 GeneratedAt: 2026-06-04T12:45:22.023Z
- Coverage Audit Loaded: true
- Local Stage4 Artifacts Available: false
- Broker Mutation Authorized: false
- Execution Policy Changed: false

## Summary Counts

| Category | Count |
| --- | ---: |
| rows | 1 |
| missingStage4DateRows | 1 |
| missingCanonicalRows | 1 |
| rootCause:STAGE4_EVENT_AND_VENDOR_DATE_MISSING | 1 |
| breakPoint:stage4_event_and_vendor_date_absent | 1 |
| repairLane:STAGE4_EVENT_MAP_OR_VENDOR_EARNINGS_DATE_REPAIR | 1 |

## Latest Trace Rows

| Symbol | Group | Decision | Reason | Break Point | Root Cause | Repair Lane | Canonical Paths | Stage4 Paths | Vendor Paths | Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TDC | execution_contract.modelTop6 | WAIT_PRICE | wait_earnings_data_missing_quality_floor | stage4_event_and_vendor_date_absent | STAGE4_EVENT_AND_VENDOR_DATE_MISSING | STAGE4_EVENT_MAP_OR_VENDOR_EARNINGS_DATE_REPAIR | none | none | alphaVantage.source, shadow.alphaVantage.source | Repair Stage4 earnings event map coverage or vendor earnings date coverage; source metadata alone is not sufficient. |

## Interpretation

- `stage4_event_and_vendor_date_absent` means neither Stage4 event overlay nor Stage6 vendor/shadow date supplied a dated earnings event.
- `stage6_canonical_copy_gap` is worse: Stage4 had event fields but Stage6 failed to persist canonical fields.
- Source metadata without an earnings date does not satisfy freshness. Do not promote earnings-gated rows on source-only evidence.
- This report is analysis-side and report-only. It must not change sidecar submit/reprice/replace behavior.

