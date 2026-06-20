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
- numeric evidence fields for current RR, minimum RR, RR shortfall, target
  buffer, buffer shortfall, entry distance, distance band, and distance excess
- `zeroExecutableTuningLane=STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION`
- `zeroExecutableFormulaBottleneck=STRUCTURE_PROOF_FORMULA`
- `structurePolicyFormulaEvidenceBasis` matching
  `zeroExecutableFormulaEvidenceBasis`
- `zeroExecutablePrimaryTuningTarget=false`

Structure formula evidence must point at the dominant measurable blocker:
`structure_current_rr_shortfall`, `structure_target_buffer_shortfall`,
`structure_distance_excess`, or a proof-gap basis such as
`structure_explicit_reject_proof_gap`. It must not collapse every structure row
into a generic proof-gap count when RR, target buffer, or distance evidence is
the real blocker.

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

## Stop / Target Risk Geometry Policy

Risk-geometry rows are separate from sidecar fillability. If Stage6 can
recalculate a current-entry stop but the resulting RR or required target is
still insufficient, the row must remain non-executable and expose the repair
lane explicitly.

1. `RECALCULATED_STOP_PROOF_CONFIRMED`
   - Recalculated stop is valid.
   - Stop distance is inside policy.
   - Target is above current price.
   - RR and target buffer pass.
   - `riskGeometryTargetRecalibrationCandidate=false`.

2. `TARGET_RECALIBRATION`
   - Recalculated stop is structurally valid, but the current target is below
     the target required by stop risk, target buffer, or expected return.
   - The row must expose a negative `riskGeometryTargetGapPct`, positive
     `riskGeometryTargetShortfallPct`, finite `riskGeometryTargetRecalibrationGapPolicyPct`,
     and `riskGeometryTargetRecalibrationCandidate=true`.
   - The shortfall must be within the same producer target gap policy used by
     target-near-current rows. If the gap is wider than policy, it is not a
     repair candidate.
   - This is producer-side target recalibration, not a sidecar chase/reprice.
   - The row must expose `zeroExecutableFormulaBottleneck=RISK_GEOMETRY_RECALCULATION_FORMULA`
     when the required target shortfall is caused by the recalculated stop/target
     geometry rather than by a simple near-target condition.

3. `TARGET_RECALIBRATION_GAP_TOO_WIDE_NO_TRADE`
   - Recalculated stop may be structurally valid, but the required target gap
     exceeds `riskGeometryTargetRecalibrationGapPolicyPct`.
   - The row must expose `riskGeometryTargetNoTradeConfirmed=true`,
     `riskGeometryTargetRecalibrationCandidate=false`, and
     `riskGeometryRepairLane=TARGET_RECALIBRATION_GAP_TOO_WIDE_NO_TRADE`.
   - The zero-executable lane must be `RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION`.
   - This prevents a very large required-target jump from being mistaken for a
     normal recalibration candidate.

4. `RISK_GEOMETRY_PROOF_INCOMPLETE`
   - Recalculated stop, structure proof, target, or distance evidence is
   incomplete.
   - Keep `WAIT_PRICE` or `BLOCKED_RISK`.

## Done-When

- Contract fixture includes structure justified, structure overblock-review, target recalibration candidate, target gap no-trade, target already reached no-trade, and stop/target risk-geometry target recalibration rows.
- Validator fails if structure overblock rows are promoted or marked as primary relaxation targets.
- Validator fails if structure rows do not expose numeric RR/buffer/distance
  evidence or if `structurePolicyFormulaEvidenceBasis` diverges from
  `zeroExecutableFormulaEvidenceBasis`.
- Validator fails if target-at/below-current rows are not no-trade confirmed.
- Validator fails if a recalculated-stop target shortfall is marked proof-confirmed instead of target-recalibration required.
- Validator fails if a recalculated-stop target shortfall above gap policy is
  marked as a normal target recalibration candidate instead of no-trade.
- Zero-executable rows expose `zeroExecutableFormulaBottleneck` and severity
  fields so tuning is directed at target recalibration, risk geometry,
  breakout proof, or structure proof instead of lowering sidecar fillability.
- No broker mutation or sidecar execution policy change occurs.
