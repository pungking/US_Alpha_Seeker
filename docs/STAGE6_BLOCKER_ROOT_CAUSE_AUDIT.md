# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-07-07T23:17:13.242Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Hash: ea95063da8d317a9815b98329be26842853ee1678e4db93f385192ac61d12a49
- Rows audited: 7
- Structure wait rows: 1
- Risk geometry rows: 3
- Quality gate rows: 1
- Formula bottlenecks: {"STRUCTURE_PROOF_FORMULA":1,"TARGET_RECALIBRATION_FORMULA":2,"RISK_GEOMETRY_RECALCULATION_FORMULA":1,"NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK":1}
- Safety: report-only; broker/order mutation is out of scope.

## Structure Wait

| Symbol | Decision | Root Cause | Formula Bottleneck | Severity | Structure Confirmed | Recalc Feasible | RR@Current | TargetBuf% | EntryDist% | Structure Verdict | Recommendation |
| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | --- | --- |
| DAVE | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | STRUCTURE_PROOF_FORMULA | 7.00 | no | yes | 0.17 | 6.12 | 33.43 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |

## Risk Geometry

| Symbol | Decision | Root Cause | Formula Bottleneck | Severity | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| AUPH | WAIT_PRICE/wait_target_near_current | RISK_GEOMETRY_INVALID_NO_TRADE | TARGET_RECALIBRATION_FORMULA | 29.57 | no | N/A | N/A | -3.57 | N/A | adaptive=true, stopRecalc=true | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |
| DUOL | BLOCKED_RISK/blocked_rr_below_min | RISK_GEOMETRY_INVALID_NO_TRADE | TARGET_RECALIBRATION_FORMULA | 47.07 | no | N/A | N/A | -18.74 | N/A | adaptive=true, stopRecalc=true | Keep no-trade. Stage6 must refresh target/stop geometry before execution can be reconsidered. |
| ASB | BLOCKED_RISK/blocked_stop_too_tight | STOP_GEOMETRY_RECALIBRATION_REQUIRED | RISK_GEOMETRY_RECALCULATION_FORMULA | 9.30 | no | 0.37 | 2.00 | 4.31 | 2.15 | adaptive=true, stopRecalc=true | Keep blocked until Stage6 emits valid stop recalibration evidence. |

## Quality Gate

| Symbol | Verdict | Decision | Producer Lane | Producer Verdict | Root Cause | Formula Bottleneck | Severity | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | ---: | --- |
| TRIN | BUY | WAIT_PRICE/wait_weak_pillar_execution_gate | weak_pillar_execution_gate | QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT | QUALITY_GATE_REASON_UNRESOLVED | NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK | 0.00 | no | no | no | no | 5.58 | Keep blocked until Stage6 emits an actionable BUY/STRONG_BUY verdict or explicit waiver. |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED` means structure relaxation is not the next lever; improve proof generation or keep WAIT.
- `STRUCTURE_PROOF_MISSING_NUMERICALLY_VIABLE` means the row is numerically interesting but still lacks structure proof. Fix Stage6 proof generation, not sidecar execution.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
