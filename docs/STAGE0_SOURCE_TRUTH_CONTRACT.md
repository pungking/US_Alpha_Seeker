# Stage0 Source Truth Contract

## Additive migration

New `STAGE0_MASTER_UNIVERSE_*.json` artifacts use
`manifest.schemaVersion=stage0-source-truth-v2`. The existing `universe`,
`eligible_universe`, `monitoring_universe`, `dataQuality`, and count fields are
retained. Stage1 now rejects legacy or malformed Stage0 artifacts before it
runs any filter.

The manifest records every A-Z cylinder by deterministic ordinal and file
name, SHA-256 of the downloaded raw bytes and canonical JSON content, retrieval
time, source-as-of range, row counts, and parse status.
`sourceInventorySha256` excludes retrieval time;
`outputHash` excludes only Stage0-generated `updated` and `quoteRetrievedAt`
fields. Raw source content and Drive file IDs are not persisted.

Stage0 also consumes the exact Drive files
`STAGE0_SEC_FINANCIAL_PUBLICATION_LINEAGE.json` and
`Ticker_ID_Mapping_Final.json`. The manifest records SHA-256 of each downloaded
file's exact bytes plus the producer's evidence/input/output hashes. Every Stage0
row must match exactly one producer row by identity-map lineage, daily source file,
financial metric, value, and fiscal-period end. Accession and CIK values are never
copied into Stage0. Producer canonical hashes and Stage0 raw-byte hashes remain
separate because their hash bases differ; the current A-Z payload and identity-map
canonical hashes must also equal the producer hashes before any row is accepted.

`dataQuality` remains a compatibility field with
`dataQualityLegacyBasis=PRICE_PRESENT_ONLY`. `evidenceQualityStatus` is the
canonical quality classification. Quote, financial, analyst-target, and
identifier evidence are classified independently. Missing publication or
vendor as-of timestamps are preserved as missing and are not replaced by a
retrieval timestamp. Financial evidence is verified only when the exact SEC
lineage classification, record SHA-256, source, fiscal period, publication time,
and retrieval time are all present and ordered as `financialPublishedAt <=
financialRetrievedAt <= Stage0 referenceTime`.
Stage1 independently requires the same evidence by `decisionAt`;
`netIncomeAsOf` and `updated` are not timestamp substitutes.

`stageProgressionGate=STAGE0_LOCKED` remains explicit until the first fresh
natural Stage0-to-Stage1 chain proves non-empty Stage1 output and zero unresolved
promotion. This audit lock does not weaken the Stage1 evidence gate.

No Stage1 filter, Stage2-7 score, threshold, ranking, or verdict changes are
part of this migration.
