# Stage4 Earnings Event Consumer Contract

Doc-Tier: P2 (Engineering)

Goal: `STAGE4_EARNINGS_EVENT_CONSUMER_AND_RISK_WINDOW_CONTRACT_V1`.

## Diagnosis and correction

The previous consumer interpreted positive `days_to_event` as a forward distance,
but applied the documented D-2..D-5 penalty to -5..-2 instead of +2..+5. It also
copied the aggregate provider label into every row and treated the legacy naive
timestamp as retrieval evidence. Numeric D-days remained anchored to collection
even when Stage4 ran on another New York date.

`services/stage4EarningsEventContract.mjs` is the single pure overlay used by
`TechnicalAnalysis`. Each scan freezes one explicit decision instant after loading
the earnings artifact. Calendar-day distance is event date minus that instant's
America/New_York date (not elapsed 24-hour periods, and not local/UTC midnight).

| Signed days to event | Existing band | Base penalty | RISK_OFF penalty |
| --- | --- | --- | --- |
| -1 through +1 | D_MINUS_1_TO_PLUS_1 | 8 | 10 |
| +2 through +5 | D_MINUS_2_TO_MINUS_5 | 3 | 4 |
| Other verified dates | NONE | 0 | 0 |
| Unavailable/unverified | NONE, UNAVAILABLE_NOT_SAFE | 0 | 0 |

Penalty magnitudes and documented window lengths are unchanged. Fixing their
application can change technical scores, ranks and downstream decisions. This is
not a ranking-invariance claim or an empirically optimized trading policy.

## Input and evidence boundary

- Consume `earnings-event-map-v2`, exact matching Stage3 trigger, and the hash of
  the downloaded UTF-8 JSON text. The hash is observed content identity, not an
  independently signed provider attestation. Do not persist Drive IDs or raw data.
- Require timezone-explicit `retrieved_at` at or before the frozen decision instant,
  New York collection window/date parity, and reconciled coverage classifications.
- Require a valid event date inside the declared collection window, per-row source
  equal to the coverage source, and collection-time D-day parity when supplied.
  Date-only rows with otherwise valid provenance can derive D-days; numeric-only,
  label-only, invalid dates, future retrievals and conflicting metadata cannot.
- Retrieval is the producer's **collection-start timestamp**. It is not an event
  publication timestamp. `publicationTimestampAvailable=false` stays explicit;
  no provider publication-time or historical look-ahead certification is claimed.
- Freshness is exact-trigger/collection-window lineage, not a new universal TTL.
  Decision-time distance is recomputed across date/DST rollover. A later calendar
  revision cannot be inferred without a new source artifact.
- Missing/past-only/outside-window/failed provider observations remain distinct.
  They never mean confirmed absence of event risk. No dates, labels or timestamps
  are filled from wall-clock time, aggregate source labels or the legacy timestamp.

## Compatibility and migration

Stage4 manifest version becomes `7.5.2`; additive consumer schema is
`stage4-earnings-event-consumer-v1`. Existing event fields remain available in
`techMetrics`. The manifest records the source filename/hash/trigger, decision
instant, timestamp basis and row classification counts. Rows not reaching the
overlay are explicitly counted as `EARNINGS_OVERLAY_NOT_EVALUATED`.

Legacy/unverified maps no longer generate verified date fields or label-based
penalties. They remain explicitly unavailable with the existing neutral numerical
overlay. Upgrade the upstream producer (Harvester PR #49) before expecting new
verified rows. Do not rewrite old artifacts. Harvester's MEDIUM label uses a
different window and is not authoritative for Stage4's documented 2..5-day band.

Stage5 preserves `techMetrics`; the existing Stage6 reader consumes the date,
distance, row source and zoned retrieval timestamp. Stage6's independent fallback
and scoring policies are unchanged. Unavailable Stage4 evidence is not a claim
that the whole downstream pipeline is execution-ready.

## Validation and runtime boundary

`npm run ops:test:stage4-earnings-event-contract` tests window edges, both DST
transitions, UTC/New York rollover, fixed decision time, invalid/missing data,
trigger/hash/source/coverage validation, legacy exclusion, immutable inputs,
identifier rename invariance, and the actual Stage6 reader's compatibility.
CI runs this offline with existing dependencies. No provider, Telegram, Drive
write, broker or sidecar action is performed by the fixture.

Runtime proof remains separate: inspect one new/manual-authorized analysis chain
with the post-PR-49 map, source content hash, matching Stage3 trigger and Stage4
7.5.2 manifest. Recompute each evaluated row at the recorded decision instant and
check Stage5/6 propagation. Do not rerun a completed capability or claim synthetic
fixtures as provider runtime evidence. No natural-slot wait is needed for static
completion. Rollback is reverting this merge, not modifying historical evidence.
