# Sidecar Active Re-entry Rehearsal Runbook (2026-03-12)

Doc-Tier: P1 (Operational)


목적: 3거래일 관찰 후 `GO` 판정 시, `observe -> active` 전환을 단계적으로 검증한다.

---

## 1) 공통 전제

- 대상 계정: **Alpaca Paper only**
- 시작 전 필수:
  - `ALPACA_BASE_URL=https://paper-api.alpaca.markets`
  - 최근 `sidecar-dry-run` / `sidecar-market-guard` 성공 run 확인
  - 현재값 백업(Variables 스냅샷)

---

## 2) 즉시 원복 스위치 (모든 단계 공통)

문제 발생 시 즉시 아래로 원복:

- `MARKET_GUARD_MODE=observe`
- `EXEC_ENABLED=false`
- `READ_ONLY=true`
- `MARKET_GUARD_FORCE_SEND_ONCE=false`
- `GUARD_FORCE_LEVEL=auto`
- `GUARD_EXECUTE_TIGHTEN_STOPS=false`
- `GUARD_EXECUTE_REDUCE_POSITIONS=false`
- `GUARD_EXECUTE_FLATTEN=false`

---

## 3) 단계별 리허설

## Phase A - Active Smoke (실행 액션 없음)

목표: active 모드 진입 자체가 안정적으로 동작하는지 확인.

설정:
- `MARKET_GUARD_MODE=active`
- `EXEC_ENABLED=false`
- `READ_ONLY=true`
- `MARKET_GUARD_FORCE_SEND_ONCE=true`
- `GUARD_EXECUTE_*` 모두 `false`

기대 결과:
- `GUARD_SUMMARY`에 `mode=active`
- `exec_allowed=false`
- `executed=0`, `failed=0`
- 텔레그램/아티팩트 정상 생성

중단 조건:
- workflow 실패
- 비정상 액션 실행

---

## Phase B - 단일 액션 검증 (tighten_stops only)

목표: live gate를 열고 단일 액션만 제한적으로 검증.

사전조건:
- 최소 1개 포지션 존재(없으면 `skipped_not_applicable` 허용)

설정:
- `MARKET_GUARD_MODE=active`
- `EXEC_ENABLED=true`
- `READ_ONLY=false`
- `GUARD_FORCE_LEVEL=l3`
- `MARKET_GUARD_FORCE_SEND_ONCE=true`
- `GUARD_EXECUTE_TIGHTEN_STOPS=true`
- `GUARD_EXECUTE_REDUCE_POSITIONS=false`
- `GUARD_EXECUTE_FLATTEN=false`

기대 결과:
- `tighten_stops`: `executed` 또는 `skipped_not_applicable`
- 다른 실행 액션은 `skipped_policy`
- `failed=0`

---

## Phase C - cancel_open_entries 검증

목표: 미체결 진입 주문 취소 로직 검증.

사전조건:
- Paper 계정에 open BUY 주문 1건 이상 생성
- 이전 단계 쿨다운 경과

설정:
- `EXEC_ENABLED=true`
- `READ_ONLY=false`
- `GUARD_FORCE_LEVEL=l3`
- `MARKET_GUARD_FORCE_SEND_ONCE=true`
- `GUARD_EXECUTE_TIGHTEN_STOPS=false`
- `GUARD_EXECUTE_REDUCE_POSITIONS=false`
- `GUARD_EXECUTE_FLATTEN=false`

기대 결과:
- `cancel_open_entries=executed`
- detail에 `canceled=...` 포함
- `failed=0`

---

## Phase D - reduce_positions_50 검증

목표: 포지션 감축 액션 검증.

사전조건:
- 포지션 존재
- 테스트용 open BUY 주문 없음
- 쿨다운 경과

설정:
- `EXEC_ENABLED=true`
- `READ_ONLY=false`
- `GUARD_FORCE_LEVEL=l3`
- `MARKET_GUARD_FORCE_SEND_ONCE=true`
- `GUARD_EXECUTE_TIGHTEN_STOPS=false`
- `GUARD_EXECUTE_REDUCE_POSITIONS=true`
- `GUARD_EXECUTE_FLATTEN=false`

기대 결과:
- `reduce_positions_50=executed`
- detail에 `submitted=...` 포함
- `flatten_if_triggered=skipped_policy`
- `failed=0`

---

## Phase E - flatten_if_triggered (선택)

목표: 비상 청산 액션 최종 검증(필요 시만).

설정:
- `GUARD_EXECUTE_FLATTEN=true` (나머지 상황에 맞춰 최소화)

주의:
- 실제 포지션 영향이 가장 큼
- 운영 승인 후 수행 권장

---

## 4) 단계 승인 기준

각 단계는 아래를 모두 만족해야 다음 단계로 이동:

- [ ] Workflow success
- [ ] `failed=0`
- [ ] 기대 액션 상태 충족 (`executed`/`skipped_*`)
- [ ] 텔레그램/Step Summary/Artifact 증빙 확보

---

## 5) 증빙 템플릿

- Phase:
- Run ID:
- Run URL:
- 핵심 로그 1줄:
- 텔레그램 요약:
- Artifact:
- 판정: PASS / HOLD / FAIL
- 메모:

---

## 6) 완료 후 안전 복귀 (필수)

리허설 종료 즉시:

- `MARKET_GUARD_MODE=observe`
- `EXEC_ENABLED=false`
- `READ_ONLY=true`
- `MARKET_GUARD_FORCE_SEND_ONCE=false`
- `GUARD_FORCE_LEVEL=auto`
- `GUARD_EXECUTE_*` 전부 `false`

검증:
- 다음 1회 `sidecar-market-guard`에서 `mode=observe`, `exec_allowed=false`, `executed=0`
- 다음 1회 `sidecar-dry-run`에서 `guard_control` non-live 판정 확인

