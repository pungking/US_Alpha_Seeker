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

## Workstream A: Ops Baseline Lock (remaining 3%)

1. Lock default runtime values
   - `ACTIONABLE_INCLUDE_SPECULATIVE_BUY=false`
   - `FORCE_SEND_ONCE` unset/false
2. Confirm no Stage5 override remains
   - Vercel/GitHub/localStorage override keys all clear
3. Evidence
   - 1 run log showing default policy active

## Workstream B: Integration Milestone (remaining 0% - complete)

- 완료 증적(2026-03-23):
  - Stage6 Final: `STAGE6_ALPHA_FINAL_2026-03-23_12-11-31.json`
  - Hash sync: `770d850001e2` (Stage6/Sidecar 동일)
  - Contract: `checked=6 executable=6 watchlist=0 blocked=0`
  - Stage5 lock 최신화 확인: `STAGE5_ICT_ELITE_50_2026-03-23_12-09-22.json`

## Workstream C: Precision Report Closure (remaining 12%)

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

1. `M-UI-4` fallback 문구 품질 개선 패치 + Stage6 단독 1회 검증.
2. `gdrive_client_id` 로컬 저장 정책(운영 기본값/env 우선/삭제 절차) 문서화.
3. perf loop 샘플을 자연 증가 방식으로 `>=20`까지 누적(강제 시뮬레이션 금지).

## Done Criteria (Go-Live Ready)

- New-hash milestone run PASS (Stage0~6 + Telegram + Sidecar). ✅
- No contract mismatch across Stage6/Sidecar summaries.
- Perf loop sample >= 20 and gate status not `PENDING_SAMPLE`.
- Precision closure report finalized with evidence per item.
