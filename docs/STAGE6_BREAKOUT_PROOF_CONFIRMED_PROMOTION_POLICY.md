# Stage6 Breakout Proof-Confirmed Promotion Policy

## Decision

`breakoutRetestProofConfirmed=true` is necessary but not sufficient for `EXECUTABLE_NOW`.

Default behavior remains conservative:

- `VITE_STAGE6_BREAKOUT_RETEST_PROOF_PROMOTION_ENABLED=false`
- proof-confirmed breakout/continuation rows stay `WAIT_PRICE`
- sidecar must not promote or chase these rows
- Stage6 producer must expose `breakoutRetestPromotionPolicyDecision`, `breakoutRetestPromotionEntryBasis`, and `breakoutRetestPromotionBlockedBy` so a proof-confirmed row cannot be mistaken for an executable row.

As of the current policy decision, keep promotion disabled. This is intentional,
not a missing implementation. A proof-confirmed row may become
`breakoutRetestPromotionReady=true`, but it remains `WAIT_PRICE` until a
separate producer-policy change explicitly enables promotion.

## Why

A proof-confirmed breakout row proves that the producer found stronger structure evidence than review-ready, but it does not by itself decide execution timing, order entry basis, or target/stop geometry. Promoting without an explicit producer policy flag would silently change execution behavior downstream.

## Promotion Candidate Conditions

If promotion is explicitly enabled in a future producer policy, the row must satisfy all of the following before it can become an executable candidate:

1. `verdict` is one of the actionable verdicts: `BUY`, `STRONG_BUY`, `STRONGBUY`.
2. `breakoutRetestProofConfirmed=true`.
3. `breakoutRetestProofReviewReady` alone is not enough.
4. Retest proof must separate the touch from the reclaim:
   - `breakoutRetestProofRetestTouchFound=true`
   - `breakoutRetestProofRetestCloseReclaimed=true`
   - `breakoutRetestProofRetestLowGapPct` and
     `breakoutRetestProofRetestCloseGapPct` are finite.
   A wick/touch without a close reclaim is diagnostic review evidence only.
5. Current-price RR evidence is valid and `rrAtCurrentPrice >= decisionGate.currentEntryMinRr`.
6. Current target buffer is valid and `targetBufferFromCurrentPct >= decisionGate.currentEntryMinTargetBufferPct`.
7. Continuation proofs must also satisfy:
   - `breakoutRetestProofContinuationConfirmed=true`
   - `breakoutRetestProofContinuationExtensionOk=true`
   - current extension is within `maxContinuationExtensionPct`
8. Target/current geometry must not be in no-trade state:
   - `targetNoTradeConfirmed` must not be true
   - `targetRecalibrationViabilityVerdict` must not be a no-trade verdict
9. Risk geometry must not require unresolved recalibration/no-trade.
10. Current-entry stop distance must remain inside the Stage6 stop-distance policy band.
11. The Stage6 row must explicitly state the intended entry basis as `BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT`; sidecar must not infer or rewrite the entry basis.

## Policy State Matrix

| Proof State | Input Geometry | Promotion Flag | Producer Output |
| --- | --- | --- | --- |
| `reviewReady=true`, `proofConfirmed=false` | any | any | `WAIT_PRICE / wait_breakout_retest_required` |
| `proofConfirmed=true` | blocked RR, buffer, stop, target, or verdict | any | `WAIT_PRICE` with explicit blockers |
| `proofConfirmed=true` | all candidate conditions pass | disabled | `WAIT_PRICE`, `breakoutRetestPromotionReady=true`, `breakoutRetestPromotionPolicyDecision=WAIT_CONSERVATIVE_DEFAULT` |
| `proofConfirmed=true` | all candidate conditions pass | enabled by future approved producer policy | `EXECUTABLE_NOW` with `breakoutRetestPromotionPolicyDecision=PROMOTE_CURRENT_ENTRY` |

The current repository state is the third row: proof can be ready, but promotion
is still disabled. The next policy change, if any, must be made in the Stage6
producer and protected by fixture validation before any sidecar behavior is
considered.

## Producer Policy Decision Fields

Stage6 producer rows must keep these fields explicit:

- `breakoutRetestPromotionReady`: true only when proof, current-entry feasibility, and current stop-distance policy all pass. It may be true while the row remains `WAIT_PRICE` if the only remaining blocker is `proof_confirmed_promotion_flag_disabled`.
- `breakoutRetestPromotionPolicyDecision`: one of the producer decision states such as `WAIT_CONSERVATIVE_DEFAULT`, `WAIT_INPUTS_BLOCKED`, or `PROMOTE_CURRENT_ENTRY`.
- `breakoutRetestPromotionEntryBasis`: the entry contract the producer is authorizing; for this lane it must be `BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT`.
- `breakoutRetestPromotionBlockedBy`: cumulative blockers including `proof_confirmed_promotion_flag_disabled`, `current_entry_feasibility_not_pass`, or `current_stop_distance_outside_policy`.
- `non_actionable_verdict`: must appear in `breakoutRetestPromotionBlockedBy` whenever the row is not sidecar-actionable. A proof-confirmed breakout cannot be `ready` unless `executionActionableVerdict=true`.
- `zeroExecutableFormulaBottleneck=BREAKOUT_PROOF_FORMULA`: must be emitted
  when the row is blocked because breakout proof is not confirmed or because
  proof-confirmed promotion remains disabled by producer policy. This keeps
  breakout tuning separate from target/risk/structure formula work.
- `breakoutRetestProofRetestCloseReclaimed`: must be false when the retest
  touched but did not close back above the retest level. This prevents
  `proofConfirmed=true` from being generated from a wick-only retest.

## Current Runtime Interpretation

For current runtime interpretation, a proof-confirmed continuation row can be classified as policy-ready but still conservative-wait when `VITE_STAGE6_BREAKOUT_RETEST_PROOF_PROMOTION_ENABLED=false`. In that case:

- `breakoutRetestPromotionReady=true`
- `breakoutRetestPromotionPolicyDecision=WAIT_CONSERVATIVE_DEFAULT`
- `breakoutRetestPromotionBlockedBy` includes `proof_confirmed_promotion_flag_disabled`
- `finalDecision` remains `WAIT_PRICE`

This separates "producer inputs are ready" from "producer policy is allowed to promote." Sidecar must still treat the row as non-executable until the producer emits `EXECUTABLE_NOW`.

## Done-When

- Stage6 rows expose proof-confirmed evidence fields.
- Sidecar summary counts proof-confirmed rows correctly.
- Stage6 rows expose promotion policy decision fields and blockers.
- No broker mutation occurs.
- Promotion remains disabled until a separate producer policy change is explicitly requested.
- The fixture suite proves that disabled-but-ready proofConfirmed rows stay
  `WAIT_PRICE` and expose `proof_confirmed_promotion_flag_disabled`.
