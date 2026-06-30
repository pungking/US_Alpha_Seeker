# RTH One-Time Stage6 Sidecar Checklist

This checklist is the bounded RTH verification path after a fresh Stage6 hash is generated. It is intentionally one-shot: if there is no actionable event, stop observing and route the evidence back to Stage6 policy tuning.

## Scope

- Repo: `US_Alpha_Seeker` produces the canonical `STAGE6_ALPHA_FINAL_*.json` signal artifact.
- Consumer: `alpha-exec-engine` sidecar consumes the fresh hash in safe/report-only mode.
- Mutation policy: no broker mutation, no state mutation, no replace/submit without a separate approval gate.
- Verification policy: symbol-agnostic contract check only. Ticker symbols in reports are evidence rows, not manual watch targets.

## Symbol-Agnostic Bounded Verification Contract

Do not start a new manual review loop for every recommended ticker. The bounded check is triggered by artifact state, not by symbol name.

Follow-up is allowed only when at least one of these event classes appears:

- stale or mismatched Stage6/hash consumption,
- missing or zero `decisionAuditRows` when Stage6 candidates exist,
- missing or opaque `payloadExpectation` / `topSkipReasonCategories`,
- broker or state mutation flag becomes true in a safe/report-only run,
- a new lane appears that is not already classified,
- a lane becomes approval-ready and requires a separate explicit approval gate.

If none of those events appears, stop after the first fresh sidecar run and return to Stage6 producer audits. Do not keep observing because a specific ticker looks interesting.

## Track A - Fresh Stage6 Evidence

Confirm the latest Auto-Scheduler run is at or after `14ddb145` (or a later
head), then inspect the Stage6 dispatch artifact and final row payload.

Before any sidecar handoff, check the dispatch artifact holiday guard:

- `holidayGeneratedStage6Safety.status`
- `holidayGeneratedStage6Safety.marketClosed`
- `holidayGeneratedStage6Safety.analysisOnly`
- `holidayGeneratedStage6Safety.sidecarDispatchAllowed`

If the Stage6 hash was generated on a weekend or NYSE full-day holiday, it is analysis-only evidence. Do not treat it as execution-ready, and do not trigger/continue sidecar submit, reprice, or replace paths from that hash. The Auto-Scheduler may still produce the analysis artifact, but `sidecarDispatchAllowed=false` must suppress the sidecar dispatch path.

Run the focused audit after downloading the fresh Stage6 artifact:

```bash
npm run ops:stage3-6:full:audit
npm run ops:stage6:exec:audit
npm run ops:stage6:fresh-focus:audit
npm run ops:stage6:runtime-formula-contract:proof
npm run ops:stage6:formula-tuning-backlog:validate
```

The full-stage command verifies Stage3 -> Stage4 -> Stage5 -> Stage6 same-run lineage and keeps Stage6 runtime proof separate from methodology quality. The focused Stage6 command writes:

- `state/stage6-fresh-focus-audit.json`
- `docs/STAGE6_FRESH_FOCUS_AUDIT.md`

The primary question is not simply whether `Executable Picks` is zero. The required focus metrics are:

- `formulaTuningFocus.freshRuntimeProofStatus`
- `formulaTuningFocus.tuningActionAllowed`
- `formulaTuningFocus.rowEvidenceSamples`
- `latestQualityGateLaneCounts`
- `zeroExecutableTuningLaneCounts`
- `breakoutRetestProofConfirmedCounts`
- `breakoutContinuationConfirmedCounts`
- `targetRecalibrationViabilityVerdictCounts`
- `targetRecalibrationRequiredTargetSourceCounts`
- `riskGeometryTargetRecalibrationCandidateCounts`
- `zeroExecutableFormulaBottleneckCounts`

Done when the Stage6 row evidence includes:

- `targetRecalibrationRequiredTargetPrice`
- `targetRecalibrationCurrentTargetGapPct`
- `targetRecalibrationRequiredTargetSource`
- `targetRecalibrationRiskBasisStopDistancePct`
- `targetRecalibrationShortfallPct`
- `targetRecalibrationCandidate`
- `targetNoTradeConfirmed`
- `targetRecalibrationViabilityVerdict`
- `targetRecalibrationGapPolicyPct`
- `riskGeometryProofVerdict`
- `riskGeometryProofReasons`
- `riskGeometryRequiredTargetPrice`
- `riskGeometryRequiredTargetBufferPct`
- `riskGeometryTargetGapPct`
- `riskGeometryTargetRecalibrationCandidate`
- `breakoutRetestProofRetestTouchFound`
- `breakoutRetestProofRetestFresh`
- `breakoutRetestProofCurrentExtensionOk`
- `breakoutRetestProofContinuationConfirmed`
- `breakoutRetestProofContinuationExtensionOk`
- `breakoutRetestProofMaxContinuationExtensionPct`
- `breakoutRetestProofContinuationMinRr`
- `breakoutRetestProofContinuationMinTargetBufferPct`
- `zeroExecutableFormulaBottleneck`
- `zeroExecutableFormulaSeverity`
- `zeroExecutableTargetShortfallPct`
- `zeroExecutableRiskTargetShortfallPct`
- `zeroExecutableBreakoutProofGapCount`
- `zeroExecutableStructureProofGapCount`
- `zeroExecutableFormulaReasons`
- `zeroExecutableFormulaRecommendedAction`

Interpretation:

- `formulaTuningFocus.rowEvidenceSamples` are current-artifact examples only.
  Use them to diagnose the lane; never turn those symbols into manual watch
  targets or symbol-specific policy.
- If `formulaTuningFocus.tuningActionAllowed=false`, do not tune Stage6
  thresholds from stale runtime proof. Wait for a fresh Auto-Scheduler artifact
  at or after the expected head, then rerun Track A.
- `targetRecalibrationCandidate=true` means producer-side target recalibration is review-ready, not executable.
- `targetNoTradeConfirmed=true` means keep no-trade until fresh target/thesis evidence exists.
- `breakoutRetestProofReviewReady=true` is diagnostic only.
- `breakoutRetestProofConfirmed=true` may be generated by either fresh retest proof or strong continuation proof, but may become executable only if the explicit promotion flag is enabled; review-ready never promotes.
- If zero-executable repeats while the fresh-focus audit passes, stop waiting and tune Stage6 producer logic: breakout `proofConfirmed` criteria, target recalibration formula, and risk-geometry recalculation evidence.
- If `zeroExecutableFormulaBottleneckCounts` clusters around one lane, tune that
  producer formula first. Do not lower sidecar fillability floors as a substitute
  for missing Stage6 evidence.
- `zeroExecutableFormulaBottleneck` is the primary formula bottleneck for the
  row's `zeroExecutableTuningLane`; secondary target/risk proof weaknesses
  should remain in `zeroExecutableFormulaReasons`, not override the primary lane.
- `warn_formula_bottleneck_fields_missing` means the Stage6 artifact is stale
  relative to the current producer contract or the producer failed to emit the
  formula fields. Generate/inspect a fresh Stage6 before tuning sidecar policy.
- `ops-health-report=fail` is not part of Track A. It belongs to the `alpha-exec-engine` protection/guard-metadata track and must not be mixed into Stage6 entry policy tuning.

## Track B - First Fresh RTH Sidecar Run

After RTH opens, inspect only the first sidecar run that consumes the fresh Stage6 hash.

Precondition:

- Track A must have already identified the exact Stage6 file/hash.
- The sidecar run must reference that same hash or a newer expected fresh hash.
- If no fresh sidecar run exists yet, do not poll indefinitely. Wait for the first
  scheduled sidecar run, inspect it once, then stop.

Required safe-mode checks:

- `previewStale=false`
- `decisionAuditRows>0`
- `payloadExpectation.status` present
- `topSkipReasonCategories` present and not opaque `none`/`other` when candidates exist
- `brokerMutationAttempted=false` or `attempted=0`
- `brokerMutationSubmitted=false` or `submitted=0`

If there is no payload, classify the blocker and stop the watch loop. Do not wait indefinitely.

Expected zero-executable routing:

- target/current issues -> `TARGET_RECALIBRATION`
- stop/target geometry issues -> `STOP_TARGET_RISK_GEOMETRY_RECALCULATION` or `RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION`
- breakout waits -> `BREAKOUT_PROOF_CONFIRMED_GENERATION`
- explicit structure rejects -> `STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION`
- weak-pillar, earnings coverage, unusable verdict, conviction, or non-actionable verdict issues -> `quality_gate`

## Exit Rules

- If an actionable payload appears in safe mode, verify it remains non-mutating and wait for an explicit execution approval gate before any broker path.
- If zero-executable repeats, do not keep observing. Move to Stage6 producer tuning using the row-level proof fields.
- If sidecar consumes a stale hash, fix artifact handoff/freshness before discussing entry/reprice/submit behavior.
- If there is no actionable event and the hash was consumed correctly, close the
  RTH check as `no_event_observed_once` and return to producer audits rather than
  opening a multi-hour monitor loop.

## Evidence Template

Record the one-shot result in this shape:

```json
{
  "stage6Hash": "<fresh hash>",
  "sidecarConsumedHash": "<sidecar hash>",
  "previewStale": false,
  "decisionAuditRows": 1,
  "payloadExpectation": "<status>",
  "topSkipReasonCategories": {},
  "brokerMutationAttempted": false,
  "brokerMutationSubmitted": false,
  "result": "pass_no_event_observed_once"
}
```
