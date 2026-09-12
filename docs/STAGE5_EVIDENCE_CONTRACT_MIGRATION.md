# Stage5 ICT evidence contract v1

Goal: `STAGE5_ICT_SMC_EVIDENCE_AND_STAGE4_CONTENT_HASH_CONTRACT_V1`.
Analysis repository only. No provider, execution, state-ledger or dependency change.

## Compatibility and migration

- Stage4 adds `manifest.generatedAt` and a successful-upload session hint with
  exact filename, uploaded UTF-8 SHA-256 and original Stage3 filename. Its scores
  and row selection do not change. Automatic Stage5 requires this exact hint.
- Stage5 retains its filename, `ict_universe`, existing source references and
  legacy `manifest.version` field. New output declares
  `schemaVersion=stage5-ict-evidence-v1`, `scoringContractVersion=stage5-e-v2`
  and `stage6ContractVersion=stage5to6-e-v2`.
- Fresh Stage6 analysis requires the new validated Stage5 contract. Legacy files
  remain preserved audit evidence, not silently migrated or relabeled. Generate
  a new Stage4/5 chain to resume analysis; do not edit historical files.
- Deploy the Stage4 hint, Stage5 producer and Stage6 consumer together. A stale
  browser should reload before the next run. Failed exact locks abort, not load
  older files or cached leaders. The unused background prefetch is removed so
  it cannot overwrite an active run's source metadata.
- Stage6 retains `sourceStage5Hash` as its existing FNV identity hash. Separate
  `sourceStage5ContentSha256`, `sourceStage5ContentHashBasis`, schema-validation
  and expected-hash statuses describe the actual downloaded bytes. An explicit
  override/manual latest selection without a producer hint is observed-hash-only,
  never falsely called an expected-hash match.
- Future Stage7 snapshots may receive new Stage6 metadata normally; no old
  snapshots, base eligibility, sidecar contracts or execution policy are changed.

## Corrected defects

1. Stage5 no longer searches older files for a factor-ready substitute after
   locking the current Stage4 file. Missing/ambiguous/invalid input aborts.
2. Risk weighting uses the frozen, trigger-verified Stage4 regime and VIX, not a
   second latest-pointer lookup. Missing VIX is not synthesized as 20.
3. Numeric zero no longer becomes neutral 50. Relative volume ratios use
   `rawRvol`; normalized `rvol` remains a 0-100 score. RSI tests use `rsi`, not
   the independent relative-strength rating.
4. Missing OHLC, inverted ranges, out-of-range open/close, duplicate/unordered
   dates, future dates and upstream stale/unverified data are excluded before
   scoring. No midpoint close or price-derived 52-week bounds are fabricated.
   Unusable entry/stop geometry is separately excluded, not synthesized.
5. Every input has exactly one evaluation status. Selected rows bind to that
   evaluation by exact symbol and row hash; no symbol punctuation is stripped.
6. Proxy labels no longer assert observed institutional buying, manipulation,
   confirmed order blocks or calibrated prediction probabilities.

Weights, thresholds, OTE/ATR parameters and the existing dense-first selection
policy are unchanged. Existing sparse overflow behavior is explicitly retained;
it only considers structurally verified rows. Tie ordering is deterministic by
exact identity. Corrections can legitimately change scores and selected names.

## Evidence and hashes

- `sourceStage4ContentSha256`: actual downloaded bytes before parsing.
- `inputHash`: canonical source filename/content hash, fixed decision time and
  scoring contract version. It does not depend on log/progress/upload time.
- `outputHash`: canonical persisted `ict_universe`; undefined object fields are
  omitted consistently with JSON serialization. Non-finite output is rejected.
- `evaluationHash`: canonical `stage5_evaluation`, covering every source row,
  exclusion reason, source/result hashes, ranks and selected/not-selected state.
- `evidenceHash`: canonical whole Stage5 artifact excluding only this field.
  It is not the raw file hash; the latter travels in the post-upload hint.

## Bounded replay evidence

Preserved manual run `34045731828` is unchanged and was not downloaded again.
Stage4 content hash:
`6037b5251f7ea1e5f879aec2ec539952ea50a1438c632643a2c5fe897a29f57d`.
Stage5 content hash:
`ac2acf1e98383c40c82ab109d75d9b954b27e10c1da75b520db766df42dba9d7`.

Before the fix, replaying the actual component reconstructed all 50 saved rows'
ICT metrics, scores, ranks, geometry and composite breakdown without a mismatch.
All 272 inputs were examined: 20 normalized RVOL values were valid zeros;
4 rows contained an OHLC envelope violation. The corrected input contract accepts
268 rows and explicitly blocks those 4; it does not repair their source prices.
Replaying the corrected code selects 50, retaining 45 of the previous selection.
These are frozen-input diagnostics, not a new runtime or return-performance proof.

## Limits and verification

The current ICT engine is an OHLCV heuristic, not a full causal BOS/CHOCH,
three-candle FVG or institution/order-flow detector. Its economic predictive
validity requires prospective OOS evaluation; this patch does not certify it.
Date-only histories prove observable ordering and absence of later calendar dates,
not same-day publication availability, completed-session coverage, independently
verified corporate-action adjustment, or missing-session completeness. Metadata
records those limits instead of claiming full look-ahead safety.

Run `npm run ops:test:stage5-stage6-ingest-contract` for actual-component offline
calculation/selection, mocked upload/download, strict schema/hash and no-cache
bypass checks. Existing Stage4 earnings pass-through, full-stage lineage, Stage6
audits, Stage7/OOS validation, safety, typecheck and build remain required.

Rollback: revert this coordinated analysis-only commit/merge; preserve historical
artifacts. Never repair a failed hash by changing the saved evidence.
