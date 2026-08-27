# Stage0 Source Truth Contract

## Additive migration

New `STAGE0_MASTER_UNIVERSE_*.json` artifacts use
`manifest.schemaVersion=stage0-source-truth-v1`. The existing `universe`,
`eligible_universe`, `monitoring_universe`, `dataQuality`, and count fields are
retained. Stage1 now rejects legacy or malformed Stage0 artifacts before it
runs any filter.

The manifest records every A-Z cylinder by deterministic ordinal and file
name, SHA-256 of the downloaded raw bytes, retrieval time, source-as-of range,
row counts, and parse status. `sourceInventorySha256` excludes retrieval time;
`outputHash` excludes only Stage0-generated `updated` and `quoteRetrievedAt`
fields. Raw source content and Drive file IDs are not persisted.

`dataQuality` remains a compatibility field with
`dataQualityLegacyBasis=PRICE_PRESENT_ONLY`. `evidenceQualityStatus` is the
canonical quality classification. Quote, financial, analyst-target, and
identifier evidence are classified independently. Missing publication or
vendor as-of timestamps are preserved as missing and are not replaced by a
retrieval timestamp.

No Stage1 filter, Stage2-7 score, threshold, ranking, or verdict changes are
part of this migration.
