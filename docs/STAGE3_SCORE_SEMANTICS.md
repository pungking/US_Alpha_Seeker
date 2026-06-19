# Stage3 Score Semantics

## Purpose

Stage3 emits multiple 0-100 scores that are intentionally related but not
interchangeable. A large gap between `qualityScore` and `fundamentalScore` is
not automatically a scoring defect if both values remain bounded and the row
preserves the required data-quality metadata.

## Score Contract

| Field | Meaning | Execution Interpretation |
| --- | --- | --- |
| `qualityScore` | Raw financial quality/value/safety signal from the fundamental analyzer before final alpha-oriented overlays. | Diagnostic pillar only. It should help explain quality, but it is not the sole execution readiness field. |
| `fundamentalScore` | Post-adjustment Stage3 fundamental score after integrity penalties, trend/sector/momentum context, and final 0-100 clamp. | Canonical Stage3 pillar score passed to Stage4/5/6. |
| `compositeAlpha` | Bounded blend of `qualityScore` and adjusted `fundamentalScore`. | Ranking support signal, not a direct order instruction. |

## Required Invariants

- `fundamentalScore` must be finite and within `0..100`.
- `compositeAlpha` must be finite and within `0..100`.
- `integrityReasons` must be emitted as an array for every row.
- Imputed or low-confidence fundamentals must remain visible through
  `isImputed`, `dataQuality`, and integrity/freshness metadata.
- A material `qualityScore` vs `fundamentalScore` divergence is acceptable only
  when the score-bound fixture passes and the row remains auditable.

## Audit Interpretation

The Stage3~5 quant audit treats score divergence as:

- **contract violation** when scores are out of bounds or integrity metadata is
  missing;
- **documented expected divergence** when score bounds and this data dictionary
  are present;
- **review required** when divergence exists but the semantics contract is
  missing.

This prevents false alarms while preserving the more important invariant:
bounded, explainable, and reproducible Stage3 scores.
