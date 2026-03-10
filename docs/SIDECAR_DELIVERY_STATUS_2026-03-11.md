# SIDECAR 개발 현황 및 다음 실행 계획 (2026-03-11)

## 1) 현재 기준 상태
- 분석 엔진(`US_Alpha_Seeker`)과 실행 엔진(sidecar) 분리 원칙 유지.
- Sidecar는 현재 **Dry-Run + 운영 가드 강화 단계(P3-1)**.
- 기준 태그: `sidecar-dryrun-stable-2026-03-10`
- 최근 핵심 반영:
  - 실시간 VIX 우선 레짐 판정(`cnbc_direct` fallback 포함)
  - Dry-Exec 정책 게이트(Conviction/StopDist/노출 상한)
  - Payload 정규화/검증(가격/기하/ID 형식)
  - 주문 idempotency 저장소(`state/order-idempotency.json`)
  - dedupe 1회 우회 변수(`FORCE_SEND_ONCE`)
  - Preflight Gate(account/clock/buying power/daily max)
  - 주문 라이프사이클 원장(`state/order-ledger.json`)
  - 데이터 품질 가드 + 히스테리시스/최소 유지시간(`state/regime-guard-state.json`)
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

### P1. 실주문 전 Preflight Gate
- 상태: **완료(1차)**
- 반영:
  - `PREFLIGHT_ENABLED`, `DAILY_MAX_NOTIONAL`, `ALLOW_ENTRY_OUTSIDE_RTH`
  - 코드화된 결과(`PREFLIGHT_*`) + `blocking` 플래그
  - Dry-Run 메시지/Step Summary/Run Summary 포함

### P2. 주문 라이프사이클 상태기계
- 상태: **완료(1차)**
- 반영:
  - `state/order-ledger.json` 저장
  - `planned/submitted/...` 상태 전이 검증
  - 히스토리 트레일/TTL/prune

### P3. 본장 감시 잡(5~10분)
- 상태: **진행중(P3-1)**
- 목표:
  - X1: 데이터 품질 가드(소스 품질 점수, 저품질 시 보수모드/신규 차단)
  - X2: 히스테리시스 + 최소 유지시간(레짐 플래핑 완화)

### P4. Telegram 이벤트 체계
- 상태: **부분 완료**
- 완료: Dry-Run/Heartbeat/요약 전송 + Preflight/Lifecycle/Regime Guard 섹션
- 미완료: 실주문 이벤트 표준(`ORDER_*`, `FILL_*`, `EXIT_*`, `DAILY_PNL`)

### P5. 상태 저장/복구 확장
- 상태: **부분 완료**
- 완료: `last-run`, `last-dry-exec-preview`, `order-idempotency`, `order-ledger`, `regime-guard-state`
- 미완료: `pnl_ledger`, 재시작 복구 시나리오 완성

### P6. 운영 롤아웃
- 상태: **대기**
- 기준:
  - P1~P3 완료 후 단계 오픈
  - ReadOnly -> Paper 소규모 -> Paper Full 순서

---

## 3) P3-1 상세 브리핑 (현재 최우선)

## 3.1 목표
- 데이터 품질/레짐 플래핑 이슈를 감시잡 전 단계에서 선제 완화.
- 저품질 데이터 상황에서 신규 진입 리스크를 자동 축소/차단.

## 3.2 범위
- 품질 점수(`REGIME_QUALITY_*`) 계산:
  - VIX 누락/소스 실패/스냅샷 stale/소스 mismatch 반영
- 히스테리시스(`REGIME_HYSTERESIS_*`) 적용:
  - 최소 유지시간 내 반대 전환 억제
- 저품질 시 Entry Guard:
  - payload 생성 후 신규 진입 payload 0으로 강제

## 3.3 핵심 규칙
1. `quality.score < quality.minScore`면 `forceRiskOff=true`
2. 위 조건 시 `entryGuard.blocked=true`로 신규 진입 차단
3. 이전 레짐이 `risk_off`이면 `riskOnThreshold` 하회 + `min_hold` 만족 전까지 복귀 억제

## 3.4 환경 변수
- `REGIME_QUALITY_GUARD_ENABLED`
- `REGIME_QUALITY_MIN_SCORE`
- `REGIME_VIX_MISMATCH_PCT`
- `REGIME_HYSTERESIS_ENABLED`
- `REGIME_MIN_HOLD_MIN`

## 3.5 파이프라인 삽입 위치
1) Stage6 로드
2) base regime 판정
3) 품질 가드 + 히스테리시스 적용(최종 regime)
4) Dry-Exec payload 생성/검증
5) Entry Guard 적용(저품질 차단 시 payload 0)
6) dedupe/idempotency/preflight/lifecycle

## 3.6 완료 기준(Definition of Done)
- `[REGIME_QUALITY]`, `[REGIME_HYST]`, `[ENTRY_GUARD]` 로그 고정 출력
- `state/regime-guard-state.json` 생성/아티팩트 업로드
- Step Summary에 regime guard 상태 노출
- 텔레그램 본문에 Regime Guard 정보 포함

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
- [ ] P3-1 회귀(quality low / hysteresis hold / entry blocked) 3케이스 로그 수집
- [ ] `observe` 모드 3~5거래일 운영 후 임계치(quality min, min hold) 재튜닝
- [ ] P3-2(장중 감시 잡 레벨 L1/L2/L3) 설계 초안 확정
- [ ] P4 실주문 이벤트 템플릿(`ORDER_*`, `FILL_*`, `EXIT_*`) 초안 작성
