# SIDECAR Rollback Runbook

## 목적
- 실행 엔진(sidecar) 문제 발생 시 5분 내 안정 상태로 복귀한다.

## 즉시 중단 (T+0)
1. `EXEC_ENABLED=false`로 전환
2. 실행 워크플로우 수동 중지 (`sidecar-market-guard`, `sidecar-dry-run`)
3. Telegram에 중단 공지 전송 (`CRITICAL`)

## 주문 안정화 (T+1~3분)
1. 신규 주문 제출 중단 확인
2. 미체결 주문 취소 여부 확인
3. 기존 포지션은 정책에 따라 유지 또는 수동 정리

## 복구 기준점 롤백 (T+3~5분)
1. sidecar 레포에서 마지막 안정 태그로 복귀
2. 환경변수(시크릿/플래그) 재검증
3. `READ_ONLY=true`로 재기동 후 점검

## 체크리스트
- [ ] `EXEC_ENABLED=false` 적용 확인
- [ ] market-guard 중지 확인
- [ ] 신규 주문 0건 확인
- [ ] 미체결 주문 정리 확인
- [ ] 롤백 태그/커밋 적용 확인
- [ ] READ_ONLY 재기동 확인

## 실패 코드 대응 기준
| 코드 | 조치 |
|---|---|
| `CONTRACT_*` | Stage6 입력 계약 검증 실패 -> 송신/주문 중단 유지 |
| `RISK_*` | 리스크 트리거 발동 -> 신규 주문 금지, 포지션 방어 우선 |
| `LOCK_*` | Stage lock 불일치 -> LOCK 해제 후 LATEST로 복귀 점검 |
| `TELEGRAM_*` | 전송 실패 -> 거래 로직과 분리, 재시도 큐로 처리 |

## 실전 트러블슈팅 (운영 빈도 상위)

| 시나리오 | 판별 포인트 | 즉시 조치 (1~2분) | 추가 점검 | 재개 기준 |
|---|---|---|---|---|
| 워크플로우 실패/타임아웃 | Actions run `failed`/`timed_out` | 1) `EXEC_ENABLED=false` 2) `READ_ONLY=true` 3) `MARKET_GUARD_MODE=observe` 고정 | 실패 run 로그에서 첫 오류 스텝 확인 (Install/Build/Run/Upload) | 수동 재실행 1회 성공 + state artifact 생성 |
| Artifact 누락 (`state/*.json`) | Step Summary에 `not found`, artifact 파일 부족 | 1) 실행 중단 유지 2) `sidecar-market-guard` 1회 수동 실행 3) `sidecar-dry-run` 1회 수동 실행 | 캐시 restore/save, `state` 폴더 write 로그(`[STATE] saved ...`) 확인 | 필수 state 파일 재생성 + artifact 업로드 확인 |
| `guard_control` 판정 불일치 | non-live인데 `blocked=true` 또는 이유 코드 비정상 | 1) `EXEC_ENABLED=false`, `READ_ONLY=true` 재확인 2) `GUARD_CONTROL_ENFORCE`/`GUARD_CONTROL_MAX_AGE_MIN` 값 확인 | `state/guard-control.json`의 `updatedAt`, `level`, `haltNewEntries` 확인 | dry-run에서 `reason=non_live_mode(...)` 확인 |
| Preflight FAIL/WARN 증가 | `[PREFLIGHT]`가 `FAIL/WARN` 반복 | 1) live 전환 금지 2) `EXEC_ENABLED=false` 유지 | 코드(`PREFLIGHT_*`) 기준으로 원인 분류: 계좌 상태, clock, buying power, daily cap | 동일 조건에서 preflight 정상화 확인 후 재개 |

## 운영자 보고 템플릿 (장애 발생 시)
1. 발생 시각(ET/KST):
2. 워크플로우/Run URL:
3. 증상 요약 (로그 1줄):
4. 즉시 조치 결과:
5. 현재 상태 (`EXEC_ENABLED`, `READ_ONLY`, `MARKET_GUARD_MODE`):
6. 재개 예정 시각:

## 재개 조건
- 계약 검증 PASS
- 리스크 트리거 정상화
- 최근 1회 드라이런 성공
- 운영자 확인 후 `EXEC_ENABLED=true`
