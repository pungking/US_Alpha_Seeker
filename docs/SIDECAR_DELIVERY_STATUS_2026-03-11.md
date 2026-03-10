# SIDECAR 개발 현황 및 다음 실행 계획 (2026-03-11)

## 1) 현재 기준 상태
- 분석 엔진(`US_Alpha_Seeker`)과 실행 엔진(sidecar) 분리 원칙 유지.
- Sidecar는 현재 **Dry-Run 운영 안정화 단계**.
- 기준 태그: `sidecar-dryrun-stable-2026-03-10`
- 최근 핵심 반영:
  - 실시간 VIX 우선 레짐 판정(`cnbc_direct` fallback 포함)
  - Dry-Exec 정책 게이트(Conviction/StopDist/노출 상한)
  - Payload 정규화/검증(가격/기하/ID 형식)
  - 주문 idempotency 저장소(`state/order-idempotency.json`)
  - dedupe 1회 우회 변수(`FORCE_SEND_ONCE`)
  - Actions Summary + Artifact 업로드 강화

---

## 2) 단계별 개발 현황 (순위 1 ~ 운영 롤아웃 관점)

### P0. Dry-Run 안정화 (완료)
- 상태: **완료**
- 완료 항목:
  - `ENV_GUARD` 강제 체크
  - Stage6 lock/hash/candidate 로그 고정
  - dedupe + heartbeat + one-shot force send
  - state 파일 캐시/아티팩트/요약 보고
- 잔여 리스크:
  - FINNHUB VIX quote 실패 빈번(현재는 CNBC direct로 커버)

### P1. 실주문 전 Preflight Gate (다음 최우선)
- 상태: **미착수 (즉시 진행 대상)**
- 목표:
  - 주문 실행 전 계좌/장상태/노출 가능 여부를 하드체크
  - 실패 시 코드화된 사유로 차단

### P2. 주문 라이프사이클 상태기계
- 상태: **미착수**
- 목표:
  - `submitted/accepted/partially_filled/filled/canceled/rejected` 추적
  - sidecar 주문 ID와 브로커 주문 ID 맵 관리

### P3. 본장 감시 잡(5~10분)
- 상태: **미착수**
- 목표:
  - 장중 리스크 가드(중단/취소/청산) 주기 실행

### P4. Telegram 이벤트 체계
- 상태: **부분 완료**
- 완료: Dry-Run/Heartbeat/요약 전송
- 미완료: 주문/체결/청산 이벤트 표준(`ORDER_*`, `FILL_*`, `EXIT_*`, `DAILY_PNL`)

### P5. 상태 저장/복구 확장
- 상태: **부분 완료**
- 완료: `last-run`, `last-dry-exec-preview`, `order-idempotency`
- 미완료: `order_ledger`, `pnl_ledger`, 재시작 복구 시나리오 완성

### P6. 운영 롤아웃
- 상태: **대기**
- 기준:
  - P1~P3 완료 후 단계 오픈
  - ReadOnly -> Paper 소규모 -> Paper Full 순서

---

## 3) P1(Preflight Gate) 상세 브리핑

## 3.1 목표
- 실주문 직전 **거래 가능성/위험 한도/시장 시간**을 기계적으로 검증.
- 정책 위반 상태에서 주문 로직 진입 자체를 차단.

## 3.2 범위
- Alpaca Paper API:
  - `GET /v2/account` (buying power/계좌 상태)
  - `GET /v2/clock` (장 개장 여부/다음 개장 시간)
- Dry-Run에서도 결과는 로그/텔레그램에 노출(실주문 차단 경로 검증 목적).

## 3.3 검사 규칙(초안)
1. `PREFLIGHT_ACCOUNT_BLOCKED`
   - 계좌 상태가 거래 불가이면 즉시 차단.
2. `PREFLIGHT_MARKET_CLOSED`
   - `EXEC_ENABLED=true`에서 장 외 시간 신규 진입 차단.
3. `PREFLIGHT_BUYING_POWER_SHORT`
   - 생성된 주문 notional 합계가 buying power 초과 시 차단.
4. `PREFLIGHT_DAILY_NOTIONAL_LIMIT`
   - 일일 집행 상한(`DAILY_MAX_NOTIONAL`) 초과 시 차단.

## 3.4 환경 변수(추가 예정)
- `PREFLIGHT_ENABLED=true`
- `DAILY_MAX_NOTIONAL=5000` (초기 보수값)
- `ALLOW_ENTRY_OUTSIDE_RTH=false`

## 3.5 파이프라인 삽입 위치
- 현재 메인 흐름:
  1) Stage6 로드
  2) 레짐 판정
  3) Dry-Exec payload 생성/검증
  4) dedupe/force send
  5) 텔레그램/상태 저장
- P1 삽입 후:
  - **(3) 이후, (4) 이전**에 preflight 수행
  - preflight fail 시:
    - `EXEC_ENABLED=true`면 실행 차단 + 경고 전송
    - `READ_ONLY=true`면 리포트에 fail 코드만 표시(시뮬레이션 지속)

## 3.6 완료 기준(Definition of Done)
- 사유 코드가 항상 단일/명확하게 기록됨.
- Actions 로그에서 preflight pass/fail가 한 줄로 확인됨.
- fail 시 주문 단계(향후 실주문 모듈)가 절대 호출되지 않음.

---

## 4) 운영 롤아웃 계획 (P1~P3 이후)
1. **Phase A (ReadOnly)**: 3~5거래일
   - `READ_ONLY=true`, `EXEC_ENABLED=false`
   - KPI: 레짐 판정 일관성, skip 사유 품질, 알림 신뢰성
2. **Phase B (Paper Small)**: 3~5거래일
   - `READ_ONLY=false`, `EXEC_ENABLED=true`, `MAX_ORDERS=1~2`
   - KPI: 중복주문 0건, 체결 추적 누락 0건
3. **Phase C (Paper Full)**: 1~2주
   - Top6 풀 운영
   - KPI: 주문 성공률, 슬리피지, 손익 변동성, 비상 트리거 대응성

---

## 5) 즉시 실행 체크리스트 (다음 세션)
- [ ] P1 preflight 모듈 타입/인터페이스 추가
- [ ] Alpaca account/clock 호출 및 코드화된 실패 사유 구현
- [ ] Dry-Run 메시지/요약에 preflight 결과 포함
- [ ] 실패/성공 경계 케이스 회귀 테스트
