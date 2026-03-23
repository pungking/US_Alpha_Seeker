# Go-Live Remaining Work Breakdown (2026-03-23)

## Current Snapshot

- Pipeline core stabilization: 95% complete
- Data integrity + contracts: 91% complete
- Sidecar policy/guard: 95% complete
- Precision report closure: 88% complete
- Paper trading readiness: 72% complete

## Rule (Credit Saving)

- Do not repeat tests on same Stage6 hash.
- Only run milestone tests on:
  - new Stage6 hash, or
  - code/env policy change.

## Workstream A: Ops Baseline Lock (remaining 0% - complete)

1. Lock default runtime values
   - `ACTIONABLE_INCLUDE_SPECULATIVE_BUY=false`
   - `FORCE_SEND_ONCE` unset/false
2. Confirm no Stage5 override remains
   - Vercel/GitHub/localStorage override keys all clear
3. Evidence
   - 수동 자동화 증적(2026-03-23 19:31):
     - Stage6: `STAGE6_ALPHA_FINAL_2026-03-23_19-31-30.json`
     - Hash sync: `2a168685fa2e`
     - Policy Gate: `BUY/STRONG_BUY only`
     - Sidecar Contract: `checked=5 executable=5 watchlist=0 blocked=0`

## Workstream B: Integration Milestone (remaining 0% - complete)

- 완료 증적(2026-03-23):
  - Stage6 Final: `STAGE6_ALPHA_FINAL_2026-03-23_19-31-30.json`
  - Hash sync: `2a168685fa2e` (Stage6/Sidecar 동일)
  - Contract: `checked=5 executable=5 watchlist=0 blocked=0`
  - Stage5 lock 최신화 확인: `STAGE5_ICT_ELITE_50_2026-03-23_19-29-38.json`

## Workstream C: Precision Report Closure (remaining 8%)

1. Fill closure matrix (C/H tracks)
   - only `완전 완료` and `미완료` (no ambiguous labels)
2. Attach objective evidence per item
   - file name + hash + key log lines
3. Add unresolved-risk section
   - perf loop sample insufficiency (`11/20`) explicitly documented
4. Output
   - final closure report vNext (single source of truth)

## Workstream D: Paper Trading Readiness (remaining 28%)

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

1. 보안 런북 기준으로 시크릿 로테이션/롤백 리허설 **실행 증적** 1회 완료 (`docs/SECURITY_ROTATION_EVIDENCE_LOG_2026-03-23.md` Run #1).
2. 오전 7시 스케줄 자동화 결과를 3일 누적 수집하여 6-6 모니터링/`perf_loop`를 자연 누적으로 갱신.
3. Guard release path(L3/L2 해제 이후 payload 생성) 증적 1회 확보.

## Done Criteria (Go-Live Ready)

- New-hash milestone run PASS (Stage0~6 + Telegram + Sidecar). ✅
- No contract mismatch across Stage6/Sidecar summaries.
- Perf loop sample >= 20 and gate status not `PENDING_SAMPLE`.
- Precision closure report finalized with evidence per item.
