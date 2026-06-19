# Stage4 Short-History Policy

## Purpose

Stage4 can occasionally receive valid common-stock rows with fewer than 80
daily OHLCV bars. This is a data-depth warning, not automatically a ticker
removal event. The execution risk depends on whether that short-history row is
later promoted into Stage6 executable output.

## Policy

| Case | Policy Verdict | Required Behavior |
| --- | --- | --- |
| `<80` bars and not present in Stage6 executable rows | `short_history_non_executable_observation` | Keep visible in audit telemetry; do not block the full Stage3~5 methodology audit. |
| `<80` bars and promoted to `EXECUTABLE_NOW` | `short_history_executable_review_required` | Escalate to review; Stage6 must show enough independent structure, risk geometry, and data freshness evidence before any execution-ready treatment. |
| Missing or heuristic OHLCV evidence with high technical score | `technical_evidence_contract_violation` | Block or cap; heuristic evidence must not create high-confidence breakout or structure promotion. |

## Rationale

The system should not discard a ticker solely because the available listing
history is short. It should, however, prevent short history from silently
becoming high-confidence structure or breakout evidence.

## Audit Interpretation

The Stage3~5 audits should classify short-history rows as low-severity telemetry
when they are not executable, and escalate only when a short-history symbol
enters the final executable lane. This keeps the audit useful without turning
every young listing into a permanent false-positive blocker.
