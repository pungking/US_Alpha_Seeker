# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-15T14:11:03.111Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-15_22-50-32.json
- Hash: ba3ad94984d6236a3a3730f00bd498eec017fd091da711973aa221d08c62fb3c
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
