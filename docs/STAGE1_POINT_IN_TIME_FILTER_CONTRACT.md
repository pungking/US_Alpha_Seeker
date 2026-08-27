# Stage1 Point-in-Time Filter Contract

## Decision

Stage1 accepts a row only when its quote and profitability inputs are verifiable at
`decisionAt`. Analyst target evidence is report-only and is not a Stage1 hard gate.

## Artifact

`STAGE1_PURIFIED_UNIVERSE_*.json` now uses `stage1-point-in-time-v1` and records:

- the exact Stage0 run and inventory/input/output hashes;
- deterministic Stage1 input, threshold-contract, and output hashes;
- threshold source/provider/model provenance;
- row-level point-in-time gate results and analyst-target status;
- aggregate evidence-blocked and target-bias counts.

Price and volume thresholds, the small-cap volume multiplier, positive PE/PER, and
positive ROE remain unchanged. A row also needs a verified quote source/timestamp and
verified financial source/fiscal-period/publication timestamp available by
`decisionAt`.

## Compatibility

This is an intentional fail-closed consumer change: Stage2 rejects legacy Stage1
artifacts that do not prove the new hashes and point-in-time classifications. Stage2
scoring, ranking, target handling, and output selection are unchanged.

Historical artifacts are not rewritten. A fresh Stage0 artifact with complete source
lineage is required to produce a consumable Stage1 artifact.

## Safety

- No Stage2-Stage7 policy changes.
- No analyst-target timestamp fallback.
- No external source, broker, order, or state mutation.
- Rollback is the merge-commit revert; legacy artifacts remain preserved but blocked.
