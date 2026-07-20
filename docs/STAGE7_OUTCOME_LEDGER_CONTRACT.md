# Stage7 Outcome Ledger Contract

## v2 migration

`stage7-outcome-ledger-v2` extends the report-only ledger from executable picks to the deduplicated Stage6 final-decision surface:

- `EXECUTABLE_COHORT`
- `ACTIONABLE_BLOCKED_COHORT`
- `NON_ACTIONABLE_CONTROL_COHORT`

Every row carries a cohort-independent deterministic decision ID, an immutable decision snapshot hash, one primary blocker, Stage6 lineage, price-history lineage, and explicit look-ahead/survivorship audit status. Invalid geometry and unverifiable lineage remain excluded from false-negative review rather than being relabeled.

The downstream payload is `stage3-5-oos-v2`. The OOS cost audit accepts both v1 and v2; v2 requires the executable and eligible actionable-blocked cohorts to meet the existing minimum sample independently, with verified vendor/retrieval/split/dividend/corporate-action/symbol-change/delisting lineage, before comparison is report-ready. Missing or unmapped symbol-change history stays pending and never becomes an inferred win or loss.

This contract is evidence-only. It does not change Stage6 thresholds, promote candidates, or authorize broker/sidecar mutation.
