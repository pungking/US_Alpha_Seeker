# Sidecar Go/No-Go Decision Template (2026-03-12)

Doc-Tier: P1 (Operational)


목적: 3거래일 관찰 종료 후 `active` 전환 여부를 단일 문서로 승인/보류 결정한다.

---

## 1) 기본 정보

- 평가 기간:
  - Day 1 (ET): 2026-03-11
  - Day 2 (ET): 2026-03-12
  - Day 3 (ET): 2026-03-13
- 평가 기준 문서:
  - `docs/SIDECAR_3DAY_OBSERVATION_CHECKLIST_2026-03-12.md`
  - `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md` (2.1 하드게이트)
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md` (필드 해석 기준)
  - `docs/FULL_PIPELINE_ARCHITECTURE_AND_OPS_2026-03-12.md`
  - `docs/SIDECAR_ACTIVE_REENTRY_REHEARSAL_RUNBOOK_2026-03-12.md`
- 작성자:
- 검토자:
- 판정 일시 (KST/ET):

---

## 2) 실행 증빙 (대표 Run)

## Day 1
- market-guard Run ID / URL: `22965820863 / https://github.com/pungking/alpha-exec-engine/actions/runs/22965820863`
- dry-run Run ID / URL: `22966842912 / https://github.com/pungking/alpha-exec-engine/actions/runs/22966842912`
- 핵심 요약: `observe 유지, exec_allowed=false, executed=0, failed=0, dry-run guard_control blocked=false`

## Day 2
- market-guard Run ID / URL: `23007095270 / https://github.com/pungking/alpha-exec-engine/actions/runs/23007095270`
- dry-run Run ID / URL: `22998424941 / https://github.com/pungking/alpha-exec-engine/actions/runs/22998424941`
- 핵심 요약: `observe 유지, exec_allowed=false, executed=0, failed=0, dry-run guard_control blocked=false, preflight=warn(PREFLIGHT_MARKET_CLOSED)`

## Day 3
- market-guard Run ID / URL: `23057004252 / https://github.com/pungking/alpha-exec-engine/actions/runs/23057004252`
- dry-run Run ID / URL: `23056515799 / https://github.com/pungking/alpha-exec-engine/actions/runs/23056515799`
- 핵심 요약: `observe 유지, exec_allowed=false, executed=0, failed=0, dry-run event=dedupe, preflight=skip(PREFLIGHT_NOT_RUN_DEDUPE), guard_control blocked=false`

## Day 3 추가 근거 (Phase A 전 점검)
- dry-run Run ID / URL: `23060040495 / https://github.com/pungking/alpha-exec-engine/actions/runs/23060040495`
- 핵심 요약: `event=sent, preflight=pass(PREFLIGHT_PASS), guard_control enforce=true blocked=false reason=non_live_mode(readOnly=true,execEnabled=false), updatedAt=2026-03-13T16:15:11.099Z`

## Phase A 리허설 추가 근거 (2026-03-14)
- dry-run (OFF baseline) Run ID / URL: `23088915967 / https://github.com/pungking/alpha-exec-engine/actions/runs/23088915967`
- dry-run (validation_pack OFF/ON/STRICT) Run ID / URL: `23088939432 / https://github.com/pungking/alpha-exec-engine/actions/runs/23088939432`
- dry-run (STRICT baseline replay) Run ID / URL: `23088972490 / https://github.com/pungking/alpha-exec-engine/actions/runs/23088972490`
- 핵심 요약:
  - Stage6 contract gate: `checked=5 blocked=0` (3건 모두 동일)
  - OFF: `payload/skipped=2/3`
  - ON(15%): `payload/skipped=2/3`, `entry_feas checked=2 blocked=0`
  - STRICT(1%): `payload/skipped=0/5`, `entry_feas checked=2 blocked=2`, `preflight=skip(PREFLIGHT_NO_PAYLOAD)`

예시 포맷:
- Day 1 market-guard: `#57 / https://github.com/pungking/alpha-exec-engine/actions/runs/22977612168`
- Day 1 dry-run: `#85 / https://github.com/pungking/alpha-exec-engine/actions/runs/22961165408`
- 요약: `observe 유지, exec_allowed=false, executed=0, guard_control blocked=false`

---

## 3) 하드 게이트 체크 (필수 통과)

- [x] 3일 모두 `sidecar-market-guard` 성공
- [x] 3일 모두 `sidecar-dry-run` 성공
- [x] 3일 모두 `mode=observe`
- [x] 3일 모두 `exec_allowed=false`, `executed=0`, `failed=0`
- [x] 3일 모두 `guard_control: enforce=true blocked=false` (reason은 `non_live_mode` 또는 `stale` 허용)
- [x] 치명 오류(워크플로우 실패/비정상 실행) 0건

---

## 4) 품질/안정성 체크 (정량)

- VIX source 안정성(예: `cnbc_direct` fallback 허용 여부):
- quality score 추세(최소/최대/평균): 대표 run 기준 `medium(75/60)` 유지
- preflight 상태 분포: `pass/warn/skip` (dedupe 시 `skip:PREFLIGHT_NOT_RUN_DEDUPE` 허용)
- dedupe/idempotency 이상 여부: 중복 실행 이상 징후 없음
- state artifact 누락 여부: 누락 없음(guard/dry-run artifact 업로드 정상)

판정:
- [x] 안정
- [ ] 경계
- [ ] 불안정

---

## 5) 리스크 항목 및 완화

| 리스크 | 발생 여부 | 영향 | 완화 조치 | 담당 | 완료일 |
|---|---|---|---|---|---|
| Finnhub VIX 구독 제한 | 발생 | 낮음 (cnbc_direct fallback 동작) | fallback 유지 + 관측 지속 | 운영 | 진행중 |
| Snapshot stale 증가 | 발생 | 낮음~중간 (quality 하락 요인) | snapshot freshness 개선 과제 등록 | 운영 | 진행중 |
| Guard control stale 상태 | 발생 | 현재 낮음(관찰모드), Active 전 중간 | Active 전 freshness 하드게이트(`age<=180m`) 적용 | 운영 | 예정 |
| 기타 |  |  |  |  |  |

---

## 6) 최종 판정

- [x] **GO**: 다음 단계(active 재진입 리허설) 진행
- [ ] **NO-GO**: 관찰 연장 및 수정 후 재평가

판정 사유(필수):
- 3거래일 하드게이트 전부 통과(`observe`, `exec_allowed=false`, `executed=0`, `failed=0`, `guard_control blocked=false`)
- dry-run은 `sent/dedupe` 모두 규칙 범위 내로 확인
- 치명 오류 및 비의도 실행 미발생

다음 액션:
1. Active 전 guard_control freshness 확인(`updatedAt` 기준 `age<=180m`)을 전환 하드게이트로 적용
2. Phase A 리허설: active 전환 + 실행 액션 전부 off 스모크 테스트
3. Shadow Metrics Spec v1 문서화 착수

---

## 7) GO 시 전환 계획(점진)

1. Step A: active 전환 + 실행 액션 전부 off (스모크)
2. Step B: 단일 액션만 on (`GUARD_EXECUTE_TIGHTEN_STOPS=true`) 검증
3. Step C: `cancel_open_entries` -> `reduce_positions_50` 순차 확장
4. 각 단계 실패 시 즉시 안전 원복:
   - `MARKET_GUARD_MODE=observe`
   - `EXEC_ENABLED=false`
   - `READ_ONLY=true`
   - `GUARD_EXECUTE_* = false`

---

## 8) NO-GO 시 재관찰 계획

- 재관찰 기간(거래일):
- 수정 항목:
- 재검증 기준:
- 재판정 예정일:
