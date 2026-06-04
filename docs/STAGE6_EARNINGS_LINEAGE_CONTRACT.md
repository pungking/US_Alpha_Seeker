# Stage6 Earnings Lineage Contract

## Scope

This is an analysis-side Stage6 producer contract. It does not authorize broker submit, reprice, replace, or protective-order repair behavior.

## Required Row Fields

Every Stage6 candidate row should carry these earnings lineage fields when available:

| Field | Type | Meaning |
| --- | --- | --- |
| `earningsDate` | `string \| null` | ISO date (`YYYY-MM-DD`) for the next known earnings event. |
| `earningsDaysToEvent` | `number \| null` | Rounded D-day distance from the Stage6 production date or source-provided distance. |
| `earningsSource` | `string \| null` | Source name for the earnings event, e.g. `stage4_earnings_event_map`, `alpha_vantage`, or vendor-specific source. |
| `earningsRetrievedAt` | `string \| null` | ISO timestamp proving when the source event map/vendor payload was captured. |
| `earningsDateSource` | `string \| null` | Producer field path used for `earningsDate`. |
| `earningsDaysToEventSource` | `string \| null` | Producer field path used for `earningsDaysToEvent`, or `computed_from_earningsDate`. |
| `earningsCoverageStatus` | `string` | `EARNINGS_PRESENT`, `EARNINGS_LINEAGE_PARTIAL`, `EARNINGS_SOURCE_MISSING`, `EARNINGS_DATE_ONLY_DAYS_MISSING`, or `EARNINGS_DAYS_ONLY_DATE_MISSING`. |

## Producer Precedence

1. Explicit Stage6 candidate fields: `earningsDate`, `earningsDaysToEvent`, `earningsSource`, `earningsRetrievedAt`.
2. Stage4 technical overlay: `techMetrics.earningsDate`, `techMetrics.daysToEarnings`, `techMetrics.earningsSource`, `techMetrics.earningsRetrievedAt`.
3. Vendor/shadow metadata: `alphaVantage.earningsDate` or `shadow.alphaVantage.earningsDate`.
4. If a date exists but numeric days is missing, Stage6 may compute `earningsDaysToEvent` from the date and mark `earningsDaysToEventSource=computed_from_earningsDate`.

## Execution Policy Boundary

Earnings coverage repair is not an execution promotion. If `earningsCoverageStatus` improves but current target/stop geometry remains invalid, Stage6 must keep the row as `WAIT_PRICE`, `BLOCKED_RISK`, or `NO_TRADE` according to the current-entry feasibility verdict.

Done-when examples:

- TDC-like rows no longer have `EARNINGS_SOURCE_MISSING` when Stage4 has a dated earnings event.
- Rows with `targetBufferFromCurrentPct` below the current-entry minimum remain `WAIT_PRICE` with `wait_target_near_current` or equivalent geometry reason.
- `executionPolicyChanged=false` and broker mutation remains impossible from this repository.
