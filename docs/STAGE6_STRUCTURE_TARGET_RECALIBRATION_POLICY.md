# Stage6 Structure / Target Recalibration Policy

## Decision

Structure waits and target-near-current rows are producer-side policy lanes. They must not be solved by sidecar chase, open-order reprice, or broad filter relaxation.

## Structure Wait Policy

`wait_structure_confirmation_required` remains `WAIT_PRICE` when Stage6 emits an explicit structure reject.

Two structure states are intentionally separated:

1. `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED`
   - Current RR, target buffer, or distance evidence is weak.
   - The row is not a primary zero-executable tuning target.
   - Do not relax the structure gate.

2. `STRUCTURE_EXPLICIT_REJECT_OVERBLOCK_REVIEW_READY`
   - Current RR, target buffer, and distance evidence are acceptable.
   - The row is still `WAIT_PRICE` because explicit structure proof is missing or rejecting.
   - Required next action is producer-side support/stop proof repair, not execution promotion.

A structure overblock-review row must expose:

- `structurePolicyReviewReady=true`
- `structurePolicyCurrentRrOk=true`
- `structurePolicyTargetBufferOk=true`
- `structurePolicyDistanceWithinReviewBand=true`
- `zeroExecutableTuningLane=STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION`
- `zeroExecutablePrimaryTuningTarget=false`

## Target Recalibration Policy

`wait_target_near_current` rows are either recalibration candidates or no-trade rows.

1. `TARGET_NEAR_CURRENT_RECALIBRATION_REVIEW_READY`
   - Required target is above the current target but within the recalibration gap policy.
   - This is a producer target refresh candidate.
   - Sidecar must not chase the price or replace an order to solve it.

2. `TARGET_RECALIBRATION_GAP_TOO_WIDE_NO_TRADE`
   - Required target is too far above the current target.
   - Require a fresh thesis/target source before reconsideration.

3. `TARGET_ALREADY_REACHED_NO_TRADE`
   - Current target is at or below the source/current price.
   - This cannot be a recalibration candidate.
   - The row must expose `targetNoTradeConfirmed=true` and `targetRecalibrationViabilityVerdict=TARGET_NO_TRADE_CONFIRMED_TARGET_NOT_ABOVE_CURRENT`.

## Done-When

- Contract fixture includes structure justified, structure overblock-review, target recalibration candidate, target gap no-trade, and target already reached no-trade rows.
- Validator fails if structure overblock rows are promoted or marked as primary relaxation targets.
- Validator fails if target-at/below-current rows are not no-trade confirmed.
- No broker mutation or sidecar execution policy change occurs.
