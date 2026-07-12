# Stage6 Target Thesis Evidence - Additive Contract Note

## Change

Stage6 candidate rows now expose optional target-source lineage and technical-ceiling evidence:

- `targetRecalibrationSourceField`
- `targetRecalibrationSourceRetrievedAt`
- `targetRecalibrationSourceAsOfStatus`
- `targetRecalibrationTechnicalCeilingPrice`
- `targetRecalibrationTechnicalCeilingSource`
- `targetRecalibrationTechnicalCeilingDate`
- `targetRecalibrationTechnicalCeilingGapPct`
- `targetRecalibrationTechnicalCeilingSufficient`
- `targetRecalibrationThesisVerdict`

## Compatibility

This is an additive, backward-compatible contract change. All new fields are optional/nullable in the sidecar fillability schema. Existing consumers may ignore them.

No score threshold, execution verdict, promotion rule, or broker behavior changes. The fields only improve auditability of target recalibration and no-trade decisions.

## Consumer impact

- `US_Alpha_Seeker`: emits and audits the fields.
- `alpha-exec-engine`: no required behavior change; it remains bound to canonical Stage6 decisions and its own safety gates.
- Historical Stage6 artifacts remain valid and will show missing coverage until a fresh producer run is generated.

## Runtime proof

A fresh Auto-Scheduler artifact completes runtime proof when target-recalibration rows contain source lineage, as-of status, technical-ceiling evidence, and an explicit thesis verdict. Missing evidence must remain report-only and must not trigger an execution promotion.
