# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-21T17:42:44.668Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_09-26-37.json
- Hash: ef8e15fc14518dbf513479899161038a94278d42917a3e698cea69eddc3af71a
- Rows audited: 7
- Structure wait rows: 1
- Risk geometry rows: 1
- Quality gate rows: 0
- Formula bottlenecks: {"missing":2}
- Safety: report-only; broker/order mutation is out of scope.

## Structure Wait

| Symbol | Decision | Root Cause | Formula Bottleneck | Severity | Structure Confirmed | Recalc Feasible | RR@Current | TargetBuf% | EntryDist% | Structure Verdict | Recommendation |
| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |
| AUPH | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | missing | N/A | no | yes | 0.27 | 3.28 | 10.60 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |

## Risk Geometry

| Symbol | Decision | Root Cause | Formula Bottleneck | Severity | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| DUOL | BLOCKED_RISK/blocked_rr_below_min | RISK_GEOMETRY_INVALID_NO_TRADE | missing | N/A | no | N/A | N/A | -15.33 | N/A | adaptive=true, stopRecalc=true | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |

## Quality Gate

| Symbol | Verdict | Decision | Producer Lane | Producer Verdict | Root Cause | Formula Bottleneck | Severity | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | ---: | --- |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED` means structure relaxation is not the next lever; improve proof generation or keep WAIT.
- `STRUCTURE_PROOF_MISSING_NUMERICALLY_VIABLE` means the row is numerically interesting but still lacks structure proof. Fix Stage6 proof generation, not sidecar execution.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
