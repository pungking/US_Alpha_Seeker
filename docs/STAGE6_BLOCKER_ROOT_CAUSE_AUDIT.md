# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-16T14:07:47.998Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_22-56-56.json
- Hash: 8598d3408722bfc8a99c53ed8b74b73e63e524f8cb862d095469c46b5566fd23
- Rows audited: 6
- Structure wait rows: 5
- Risk geometry rows: 1
- Quality gate rows: 0
- Safety: report-only; broker/order mutation is out of scope.

## Structure Wait

| Symbol | Decision | Root Cause | Structure Confirmed | Recalc Feasible | RR@Current | TargetBuf% | EntryDist% | Structure Verdict | Recommendation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| AUPH | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.56 | 5.72 | 8.48 | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| LTM | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 1.24 | 26.67 | 12.71 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| MLI | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.35 | 6.22 | 16.33 | STRUCTURE_REJECT_STOP_TOO_FAR_BELOW_SUPPORT | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| DAVE | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.19 | 6.61 | 33.78 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| ASB | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.35 | 4.80 | 12.54 | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |

## Risk Geometry

| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| VIRT | WAIT_PRICE/wait_target_near_current | RISK_GEOMETRY_INVALID_NO_TRADE | no | N/A | N/A | -10.10 | N/A | adaptive=true, stopRecalc=true | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |

## Quality Gate

| Symbol | Verdict | Decision | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED` means structure relaxation is not the next lever; improve proof generation or keep WAIT.
- `STRUCTURE_PROOF_MISSING_NUMERICALLY_VIABLE` means the row is numerically interesting but still lacks structure proof. Fix Stage6 proof generation, not sidecar execution.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
