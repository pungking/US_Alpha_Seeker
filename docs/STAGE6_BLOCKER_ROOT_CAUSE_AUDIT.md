# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-05T19:28:53.252Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-06_04-11-37.json
- Hash: 30f396e7c275b2c73c5d12e39f61f2e404bcb7997350191859e1005069af4a0e
- Rows audited: 6
- Risk geometry rows: 1
- Quality gate rows: 1
- Safety: report-only; broker/order mutation is out of scope.

## Risk Geometry

| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| BFH | WAIT_PRICE/wait_recalculated_stop_required | RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS | yes | 0.45 | 2.00 | 6.51 | 3.25 | adaptive=false, stopRecalc=false | Audit Stage6 producer flag propagation before changing sidecar behavior. This row has valid recalculated-stop geometry but producer flags are disabled in the Stage6 manifest. |

## Quality Gate

| Symbol | Verdict | Decision | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| EXEL | HOLD | BLOCKED_RISK/blocked_quality_verdict_unusable | QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK | yes | yes | yes | no | -5.70 | Keep blocked/no-trade until target is recalibrated by Stage6; do not solve this in sidecar chase/reprice. |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
