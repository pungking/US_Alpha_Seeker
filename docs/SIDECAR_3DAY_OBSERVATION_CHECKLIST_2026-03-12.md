# Sidecar 3-Day Observation Checklist (2026-03-12)

목적: `observe + non-live` 안전모드에서 3거래일 로그를 수집하고, `active` 재진입 전 Go/No-Go 판단 근거를 고정한다.

---

## 0) 관찰 기간

- Day 1: ET 2026-03-11 (수) / KST 2026-03-12 (목)
- Day 2: ET 2026-03-12 (목) / KST 2026-03-13 (금)
- Day 3: ET 2026-03-13 (금) / KST 2026-03-14 (토)

최종 리뷰 시점(권장): KST 2026-03-14 오전

---

## 1) 시작 전 고정값(매일 동일)

- [ ] `MARKET_GUARD_MODE=observe`
- [ ] `EXEC_ENABLED=false`
- [ ] `READ_ONLY=true`
- [ ] `FORCE_SEND_ONCE=false`
- [ ] `MARKET_GUARD_FORCE_SEND_ONCE=false`
- [ ] `GUARD_FORCE_LEVEL=auto`
- [ ] `GUARD_EXECUTE_TIGHTEN_STOPS=false`
- [ ] `GUARD_EXECUTE_REDUCE_POSITIONS=false`
- [ ] `GUARD_EXECUTE_FLATTEN=false`
- [ ] `GUARD_CONTROL_ENFORCE=true`
- [ ] `GUARD_CONTROL_MAX_AGE_MIN=180`

---

## 2) 일일 수집 체크 (Day 1~3 공통)

## A. sidecar-market-guard

- [ ] Run 성공(실패/타임아웃 없음)
- [ ] `mode=observe`
- [ ] `exec_allowed=false`
- [ ] `executed=0`, `failed=0`
- [ ] `GUARD_SUMMARY`에 level/source/quality/action_reason 기록
- [ ] Artifact 저장 확인: `sidecar-guard-state-*`

기록
- Run ID:
- level (applied/raw):
- vix/source:
- quality(score/min):
- action_reason:
- ledger(executed/failed/blocked):

## B. sidecar-dry-run

- [ ] Run 성공(실패/타임아웃 없음)
- [ ] `ENV_GUARD OK`, `STAGE6_LOCK` 정상
- [ ] `GUARD_CONTROL enforce=true blocked=false reason=non_live_mode(...)`
- [ ] `RUN_SUMMARY` 값 기록(profile/vix/payloads/skipped/preflight)
- [ ] Artifact 저장 확인: `sidecar-state-*`

기록
- Run ID:
- stage6 file/hash:
- regime(profile/source/vix):
- regime_guard(quality/hysteresis/blocked):
- guard_control(enforce/blocked/reason):
- preflight(status/code):
- payloads/skipped:

## C. 일일 판정

- [ ] PASS
- [ ] WARN
- [ ] FAIL

메모:

---

## 3) 일자별 기록 테이블

| Day | ET Date | market-guard Run ID | dry-run Run ID | 주요 결과 요약 | 일일 판정 |
|---|---|---|---|---|---|
| Day 1 | 2026-03-11 |  |  |  |  |
| Day 2 | 2026-03-12 |  |  |  |  |
| Day 3 | 2026-03-13 |  |  |  |  |

---

## 4) 예외/경고 해석 가이드

- `finnhub failed` + `cnbc_direct fallback selected`: 허용(정상 fallback)
- `snapshot stale guard`: 경고로 기록, 품질 점수와 함께 추세 확인
- `DEDUPE SKIP send`: 허용(정상)
- `GUARD_INTERVAL skip`: 스케줄 간격 내 재실행이면 허용

즉시 대응 필요(FAIL):
- run 실패/중단
- `mode`가 `active`로 변경됨
- `exec_allowed=true` 또는 `executed>0` 발생
- `guard_control blocked=true`가 non-live에서 발생

---

## 5) 3일 종료 Go/No-Go

## Go 조건 (모두 충족)
- [ ] 3일 모두 run 성공
- [ ] 3일 모두 `observe + non-live` 유지
- [ ] `market-guard`에서 `executed=0`, `failed=0`
- [ ] `dry-run`에서 `guard_control blocked=false (non_live_mode)`
- [ ] 치명 오류(실패/비정상 액션 실행) 0건

## No-Go 조건 (하나라도 해당)
- [ ] 실행 플래그 오염(의도치 않은 `active/live`)
- [ ] 액션 실행/실패 카운트 비정상 발생
- [ ] preflight/guard_control 판정 불일치 반복

최종 판정:
- [ ] GO
- [ ] NO-GO

승인자:
- 작성:
- 검토:
- 날짜:

