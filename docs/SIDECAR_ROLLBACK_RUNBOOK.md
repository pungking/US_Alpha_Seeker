# SIDECAR Rollback Runbook

## 목적
- 실행 엔진(sidecar) 문제 발생 시 5분 내 안정 상태로 복귀한다.

## 즉시 중단 (T+0)
1. `EXEC_ENABLED=false`로 전환
2. 실행 워크플로우 수동 중지 (`market-guard`, `daily-plan`, `eod-reconcile`)
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

## 재개 조건
- 계약 검증 PASS
- 리스크 트리거 정상화
- 최근 1회 드라이런 성공
- 운영자 확인 후 `EXEC_ENABLED=true`
