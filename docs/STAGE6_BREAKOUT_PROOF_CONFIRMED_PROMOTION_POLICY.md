# Stage6 Breakout Proof-Confirmed Promotion Policy

## Decision

`breakoutRetestProofConfirmed=true` is necessary but not sufficient for `EXECUTABLE_NOW`.

Default behavior remains conservative:

- `VITE_STAGE6_BREAKOUT_RETEST_PROOF_PROMOTION_ENABLED=false`
- proof-confirmed breakout/continuation rows stay `WAIT_PRICE`
- sidecar must not promote or chase these rows
- Stage6 producer must expose `breakoutRetestPromotionPolicyDecision`, `breakoutRetestPromotionEntryBasis`, and `breakoutRetestPromotionBlockedBy` so a proof-confirmed row cannot be mistaken for an executable row.

## Why

A proof-confirmed breakout row proves that the producer found stronger structure evidence than review-ready, but it does not by itself decide execution timing, order entry basis, or target/stop geometry. Promoting without an explicit producer policy flag would silently change execution behavior downstream.

## Promotion Candidate Conditions

If promotion is explicitly enabled in a future producer policy, the row must satisfy all of the following before it can become an executable candidate:

1. `verdict` is one of the actionable verdicts: `BUY`, `STRONG_BUY`, `STRONGBUY`.
2. `breakoutRetestProofConfirmed=true`.
3. `breakoutRetestProofReviewReady` alone is not enough.
4. Current-price RR evidence is valid and `rrAtCurrentPrice >= decisionGate.currentEntryMinRr`.
5. Current target buffer is valid and `targetBufferFromCurrentPct >= decisionGate.currentEntryMinTargetBufferPct`.
6. Continuation proofs must also satisfy:
   - `breakoutRetestProofContinuationConfirmed=true`
   - `breakoutRetestProofContinuationExtensionOk=true`
   - current extension is within `maxContinuationExtensionPct`
7. Target/current geometry must not be in no-trade state:
   - `targetNoTradeConfirmed` must not be true
   - `targetRecalibrationViabilityVerdict` must not be a no-trade verdict
8. Risk geometry must not require unresolved recalibration/no-trade.
9. Current-entry stop distance must remain inside the Stage6 stop-distance policy band.
10. The Stage6 row must explicitly state the intended entry basis as `BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT`; sidecar must not infer or rewrite the entry basis.

## Producer Policy Decision Fields

Stage6 producer rows must keep these fields explicit:

- `breakoutRetestPromotionReady`: true only when proof, current-entry feasibility, and current stop-distance policy all pass.
- `breakoutRetestPromotionPolicyDecision`: one of the producer decision states such as `WAIT_CONSERVATIVE_DEFAULT`, `WAIT_INPUTS_BLOCKED`, or `PROMOTE_CURRENT_ENTRY`.
- `breakoutRetestPromotionEntryBasis`: the entry contract the producer is authorizing; for this lane it must be `BREAKOUT_RETEST_CURRENT_ENTRY_CONTRACT`.
- `breakoutRetestPromotionBlockedBy`: cumulative blockers including `proof_confirmed_promotion_flag_disabled`, `current_entry_feasibility_not_pass`, or `current_stop_distance_outside_policy`.
- `non_actionable_verdict`: must appear in `breakoutRetestPromotionBlockedBy` whenever the row is not sidecar-actionable. A proof-confirmed breakout cannot be `ready` unless `executionActionableVerdict=true`.

## Current Runtime Interpretation

For the fresh Stage6 hash `72375137d616a85901310237aef79eeba3435cc2c401eaaa20eab0432f16a5d4`, CRMD reached proof-confirmed continuation status, but promotion remains disabled. Therefore `WAIT_PRICE` is correct and safe.

## Done-When

- Stage6 rows expose proof-confirmed evidence fields.
- Sidecar summary counts proof-confirmed rows correctly.
- Stage6 rows expose promotion policy decision fields and blockers.
- No broker mutation occurs.
- Promotion remains disabled until a separate producer policy change is explicitly requested.
