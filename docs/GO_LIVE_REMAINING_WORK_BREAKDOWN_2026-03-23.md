# Go-Live Remaining Work Breakdown (2026-03-23)

## Current Snapshot

- Pipeline core stabilization: 90% complete
- Data integrity + contracts: 85% complete
- Sidecar policy/guard: 92% complete
- Precision report closure: 75% complete
- Paper trading readiness: 68% complete

## Rule (Credit Saving)

- Do not repeat tests on same Stage6 hash.
- Only run milestone tests on:
  - new Stage6 hash, or
  - code/env policy change.

## Workstream A: Ops Baseline Lock (remaining 5%)

1. Lock default runtime values
   - `ACTIONABLE_INCLUDE_SPECULATIVE_BUY=false`
   - `FORCE_SEND_ONCE` unset/false
2. Confirm no Stage5 override remains
   - Vercel/GitHub/localStorage override keys all clear
3. Evidence
   - 1 run log showing default policy active

## Workstream B: Integration Milestone (remaining 10%)

1. Run one fresh full cycle (new Stage6 hash)
   - Stage0 -> Stage6 -> Telegram -> Sidecar
2. Validate contracts
   - Stage6 PART1/PART2/FINAL consistency
   - Sidecar `stage6_contract`/`skip_reasons`/`preflight` consistency
3. Validate lock integrity
   - Stage6 locked Stage5 file must match latest generated Stage5
4. Evidence
   - stage result JSON set + logs zip + sidecar-state zip

## Workstream C: Precision Report Closure (remaining 25%)

1. Fill closure matrix (C/H tracks)
   - only `완전 완료` and `미완료` (no ambiguous labels)
2. Attach objective evidence per item
   - file name + hash + key log lines
3. Add unresolved-risk section
   - perf loop sample insufficiency (`11/20`) explicitly documented
4. Output
   - final closure report vNext (single source of truth)

## Workstream D: Paper Trading Readiness (remaining 32%)

1. Guard behavior confirmation
   - L2 block path and release path both evidenced
2. KPI sample completion
   - perf loop progress from `11/20` to `>=20/20`
3. Phased rollout
   - Phase 1: 1-2 symbols (paper)
   - Phase 2: full executable set (paper)
4. Go/No-Go gate
   - only after KPI + guard + contract checks are all green

## Immediate Next 3 Actions

1. Commit and push checklist docs (this file + speculative toggle checklist).
2. Wait for next new Stage6 hash, then execute one integration milestone run.
3. Generate final precision closure report with evidence links and residual risks.

## Done Criteria (Go-Live Ready)

- New-hash milestone run PASS (Stage0~6 + Telegram + Sidecar).
- No contract mismatch across Stage6/Sidecar summaries.
- Perf loop sample >= 20 and gate status not `PENDING_SAMPLE`.
- Precision closure report finalized with evidence per item.
