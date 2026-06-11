# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-11T07:59:24.756Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-10_22-22-25.json
- Hash: 850f2e296802c06e3fe09df938a196ad5055d7490d1bcefe3fd76b9052843326
- Rows audited: 6
- Risk geometry rows: 0
- Quality gate rows: 0
- Safety: report-only; broker/order mutation is out of scope.

## Risk Geometry

| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |

## Quality Gate

| Symbol | Verdict | Decision | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
