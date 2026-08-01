# Stage7 Outcome Ledger Contract

## v2 migration

`stage7-outcome-ledger-v2` extends the report-only ledger from executable picks to the deduplicated Stage6 final-decision surface:

- `EXECUTABLE_COHORT`
- `ACTIONABLE_BLOCKED_COHORT`
- `NON_ACTIONABLE_CONTROL_COHORT`

Every row carries a cohort-independent deterministic decision ID, an immutable decision snapshot hash, one primary blocker, Stage6 lineage, price-history lineage, and explicit look-ahead/survivorship audit status. Invalid geometry and unverifiable lineage remain excluded from false-negative review rather than being relabeled.

The downstream payload is `stage3-5-oos-v2`. The OOS cost audit accepts both v1 and v2; v2 requires the executable and eligible actionable-blocked cohorts to meet the existing minimum sample independently, with verified vendor/retrieval/source-as-of/split/dividend/corporate-action/symbol-change/delisting/suspension lineage, before comparison is report-ready. Missing or unmapped symbol-change history stays pending and never becomes an inferred win or loss.

The v2 OOS payload also carries the Stage7 duplicate, unknown-cohort,
look-ahead, and survivorship-violation counts plus a verified decision-time
market regime. `marketState` is the ticker's ICT state and is never treated as
the global market regime. Report-only calibration opens only when both
comparison cohorts meet the configured minimum, all four safety counts are
zero, and at least two verified regimes contain both cohorts. It reports
cost-adjusted return, MAE/MFE, blocker-lane effects, regime slices, and a
deterministic 95% percentile-bootstrap interval. Missing regime evidence or an
insufficient cohort keeps `overall=insufficient_oos_evidence`; every path keeps
`policyChangeAuthorized=false`.

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

## Accumulation liveness

The additive `accumulationLifecycle` row evidence and top-level
`accumulationLiveness` summary distinguish horizon waiting, retryable history,
immutable legacy evidence, and external-source contract blockers. A resolved
`NO_FILL` remains a terminal non-return outcome rather than being mislabeled as
an invalid row or a zero-return comparison sample.

`ZERO_GROWTH_EXTERNAL_SOURCE_BLOCKED` means natural reruns cannot produce a
comparable sample under the current evidence contract. It is not reported as
normal accumulation, and its next meaningful evaluation is a verified external
corporate-action source contract. Pending maturity is expressed as additional
eligible market sessions; the report does not invent a calendar date without an
exchange-session calendar. Cohort progress remains report-only at `N/30`, regime
progress at `N/2`, and `policyChangeAuthorized=false` on every path.

This is an additive v2 reporting change. Existing IDs, decision snapshots,
outcome labels, thresholds, and downstream comparison rules are unchanged.

## Stage6 additive migration note

`execution_contract` rows now retain the existing
`corporateActionLineage` object, and the Stage5/Stage6 manifests expose
coverage counts. This is additive: no existing field is removed or renamed,
no score semantics change, and consumers that ignore unknown fields remain
compatible.

Stage4 also attaches the additive `market-regime-lineage-v1` object sourced
from `MARKET_REGIME_SNAPSHOT.json`. It records the source file/hash, exact
Stage3 trigger match, source/retrieval timestamps, completeness quality,
freshness, and the canonical `RISK_ON|NEUTRAL|RISK_OFF` value. Stage5
preserves it and Stage6 copies it to every decision-contract row. Stage7
independently verifies schema, SHA-256, timestamp order, trigger freshness,
quality, and degraded status. Missing, future, or degraded regime evidence is
kept as `UNKNOWN` for regime slicing without discarding an otherwise valid OOS
outcome. This does not authorize calibration; `policyChangeAuthorized` remains
false.

This contract is evidence-only. It does not change Stage6 thresholds, promote candidates, or authorize broker/sidecar mutation.
