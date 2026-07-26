# Stage7 Outcome Ledger Contract

## v2 migration

`stage7-outcome-ledger-v2` extends the report-only ledger from executable picks to the deduplicated Stage6 final-decision surface:

- `EXECUTABLE_COHORT`
- `ACTIONABLE_BLOCKED_COHORT`
- `NON_ACTIONABLE_CONTROL_COHORT`

Every row carries a cohort-independent deterministic decision ID, an immutable decision snapshot hash, one primary blocker, Stage6 lineage, price-history lineage, and explicit look-ahead/survivorship audit status. Invalid geometry and unverifiable lineage remain excluded from false-negative review rather than being relabeled.

The downstream payload is `stage3-5-oos-v2`. The OOS cost audit accepts both v1 and v2; v2 requires the executable and eligible actionable-blocked cohorts to meet the existing minimum sample independently, with verified vendor/retrieval/source-as-of/split/dividend/corporate-action/symbol-change/delisting/suspension lineage, before comparison is report-ready. Missing or unmapped symbol-change history stays pending and never becomes an inferred win or loss.

Stage4 preserves the Harvester `corporate-action-lineage-v1` object without
inventing verified values. Stage5 keeps the complete object on each surviving
row, and Stage6 carries it into every decision-contract row as additive
evidence without changing rank, score, or execution policy. Stage7
independently requires the producer's
`lineageVerifiedForComparison=true`, exact verified status values, fresh source
and observed-history status, exact symbol or a verified effective-date alias
chain, and time-valid external event evidence. External no-event proof must
also carry a successful request, exact requested symbol, complete source
scope, explicit coverage interval, non-partial response, query scope, and
request/response SHA-256 values. Retrieval time is checked against the later
`lineageEvaluatedAt`, so a report-only evidence refresh may occur after the
OHLCV download without rewriting the original market-data timestamp. The
external coverage interval must cover the producer's complete OHLCV lookback.
Evidence hashes use canonical key ordering so semantically identical proof is
stable across deterministic reruns.

A row that fails this contract is labeled
`EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED` before TP/SL/TIMEOUT evaluation,
so it cannot become a performance or false-negative sample. This is an
additive v2 contract hardening; decision IDs and immutable decision snapshot
hashes are unchanged when later outcome evidence is refreshed. Eligible OOS
rows expose `lineageEvaluatedAt` and `externalEvidenceSha256`; the cost audit
rejects, rather than merely summarizes, any v2 row whose
`lineageVerifiedForComparison` is not true. It also independently checks the
v2 lineage schema, evidence hash, timestamp order, adjustment statuses,
external event statuses, survivorship status, and return basis instead of
trusting the boolean alone.

If a split or dividend becomes effective after the immutable Stage6 decision,
the row is labeled `EXCLUDED_CORPORATE_ACTION_REBASE_REQUIRED`. Auto-adjusted
history may have rebased prices while the stored decision thresholds must not
be rewritten, so the row stays out of TP/SL/TIMEOUT comparison until a separate
outcome-only threshold-rebase contract exists.

## Stage6 additive migration note

`execution_contract` rows now retain the existing
`corporateActionLineage` object, and the Stage5/Stage6 manifests expose
coverage counts. This is additive: no existing field is removed or renamed,
no score semantics change, and consumers that ignore unknown fields remain
compatible.

This contract is evidence-only. It does not change Stage6 thresholds, promote candidates, or authorize broker/sidecar mutation.
