# Stage6 Blocker Root Cause Audit

- GeneratedAt: 2026-06-19T17:05:49.622Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Hash: 2ea6fd5b26acbe89c2334543e1a94c10f9629c2b9e7904e353cfebfc0342d207
- Rows audited: 7
- Structure wait rows: 2
- Risk geometry rows: 0
- Quality gate rows: 1
- Safety: report-only; broker/order mutation is out of scope.

## Structure Wait

| Symbol | Decision | Root Cause | Structure Confirmed | Recalc Feasible | RR@Current | TargetBuf% | EntryDist% | Structure Verdict | Recommendation |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |
| AUPH | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.26 | 3.16 | 10.71 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |
| ATEX | WAIT_PRICE/wait_structure_confirmation_required | STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED | no | yes | 0.22 | 7.31 | 32.26 | STRUCTURE_REJECT_STOP_ATR_OUT_OF_BAND | Keep WAIT_PRICE. Structure explicitly rejected and current evidence is insufficient for execution. |

## Risk Geometry

| Symbol | Decision | Root Cause | Recalc Candidate | RR@Current | RR@Recalc | TargetBuf% | StopDist% | Producer Flags | Recommendation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |

## Quality Gate

| Symbol | Verdict | Decision | Producer Lane | Producer Verdict | Root Cause | Verdict Unusable | HOLD | Target Geometry Block | Normalization Issue | TargetBuf% | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: | --- |
| WSBC | BUY | WAIT_PRICE/wait_earnings_data_missing_quality_floor | earnings_data_missing_quality_floor | QUALITY_GATE_EARNINGS_DATA_COVERAGE_REQUIRED | QUALITY_GATE_REASON_UNRESOLVED | no | no | no | no | 8.10 | Keep blocked until Stage6 emits an actionable BUY/STRONG_BUY verdict or explicit waiver. |

## Done-When Interpretation

- `RECALC_CANDIDATE_BLOCKED_BY_PRODUCER_FLAGS` means Stage6 has a real current-entry recalculated-stop candidate, but the producer manifest disables promotion. Fix producer flag propagation before touching sidecar order policy.
- `STRUCTURE_EXPLICIT_REJECT_WAIT_JUSTIFIED` means structure relaxation is not the next lever; improve proof generation or keep WAIT.
- `STRUCTURE_PROOF_MISSING_NUMERICALLY_VIABLE` means the row is numerically interesting but still lacks structure proof. Fix Stage6 proof generation, not sidecar execution.
- `QUALITY_GATE_VALID_HOLD_AND_TARGET_GEOMETRY_BLOCK` means the block is valid: non-actionable verdict plus target/current geometry failure. This is target recalibration/no-trade, not broker reprice.
- `AI_VERDICT_NORMALIZATION_SUSPICIOUS` must be present before treating quality_gate as a normalization bug.
