# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-16T23:21:03.639Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-16_23-59-28.json
- Hash: 191e5e5231619841e5c83cc9b20142a333ce57c0dd235e214849eff553e985c7
- Rows audited: 6
- Structure wait rows: 4
- Risk geometry rows: 1
- Quality gate rows: 1
- Safety: report-only; broker/order mutation is out of scope.

## Structure Wait

| Symbol | Decision | Root Cause | Structure Confirmed | Recalc Feasible | RR@Current | TargetBuf% | EntryDist% | Structure Verdict | Recommendation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| AUPH | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.59 | 5.92 | 8.31 | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| LTM | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 1.27 | 27.10 | 12.41 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| MLI | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.33 | 5.91 | 16.57 | STRUCTURE_REJECT_STOP_ABOVE_SUPPORT | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| DAVE | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.26 | 8.88 | 32.37 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |

## Risk Geometry

| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| VIRT | WAIT_PRICE/wait_target_near_current | RISK_GEOMETRY_INVALID_NO_TRADE | no | N/A | N/A | -10.33 | N/A | adaptive=true, stopRecalc=true | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |

## Quality Gate

| Symbol | Verdict | Decision | Producer Lane | Producer Verdict | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| ZVRA | SPECULATIVE_BUY | WAIT_PRICE/wait_verdict_not_sidecar_actionable | N/A | N/A | QUALITY_GATE_VALID_NON_ACTIONABLE_VERDICT | yes | no | no | no | 122.22 | Keep blocked until Stage6 emits an actionable BUY/STRONG_BUY verdict or explicit waiver. |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED` means structure relaxation is not the next lever; improve proof generation or keep WAIT.
- `STRUCTURE_PROOF_MISSING_NUMERICALLY_VIABLE` means the row is numerically interesting but still lacks structure proof. Fix Stage6 proof generation, not sidecar execution.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
