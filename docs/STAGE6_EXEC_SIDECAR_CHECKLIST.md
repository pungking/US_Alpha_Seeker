# STAGE6 실행/시뮬레이션 사이드카 구현 체크리스트

## 0) 목적 / 원칙
- 기존 `US_Alpha_Seeker` 분석 엔진(웹앱)은 최대한 유지한다.
- 자동매매/시뮬레이션/장중 가드는 별도 실행 엔진(sidecar)으로 분리한다.
- Source of Truth는 `STAGE6_ALPHA_FINAL_*.json` 정량 필드로 고정한다.
- AI는 수치 수정 금지, 설명/리포트 보조만 허용한다.
- 하드룰: 본 문서 진행 중 기존 분석 엔진의 업무 로직 코드는 수정하지 않는다(문서/로그 제외).
- 운영 안전장치: `EXEC_ENABLED=false`, `READ_ONLY=true`를 초기 기본값으로 유지한다.

---

## 1) 준비 단계 (변경 통제)
- [x] 실행 전 기준점 태깅(현재 main 기준)
- [x] 기준점 메타 고정(tag + commit SHA + `package-lock.json` 해시)
- [x] 정책서 버전 고정: `stage6-exec-v1.0-rc1` (`docs/STAGE6_ALPACA_EXEC_POLICY_DRAFT.md`)
- [x] 운영 환경 변수 목록 확정(Alpaca/Drive/Telegram) (`docs/SIDECAR_ENV_MATRIX.md`)
- [x] 분석 레포/실행 레포 Secrets 분리 정책 문서화 (`docs/SIDECAR_ENV_MATRIX.md`)
- [x] 롤백 절차 문서화(1페이지) (`docs/SIDECAR_ROLLBACK_RUNBOOK.md`)
- [x] Kill-Switch 문서화(`EXEC_ENABLED=false` 즉시 중단) (`docs/SIDECAR_ENV_MATRIX.md`, `docs/SIDECAR_ROLLBACK_RUNBOOK.md`)
- [x] 드라이런 기본값 문서화(`READ_ONLY=true`에서만 1차 운영) (`docs/SIDECAR_ENV_MATRIX.md`)
- [x] Stage6 계약 검증용 골든 파일 1개 고정 (`docs/SIDECAR_GOLDEN_CONTRACT.md`, `docs/fixtures/stage6_golden_contract_v1.json`)
- [x] 장 시간 기준 확정(뉴욕 타임존 + 미국 휴장 캘린더 기준) (`docs/SIDECAR_MARKET_CALENDAR.md`)
- [x] Telegram 심각도 표준 확정(`INFO/WARN/CRITICAL`) (`docs/SIDECAR_TELEGRAM_SEVERITY.md`)

완료 기준:
- 태그/버전/환경변수/롤백 문서가 모두 존재해야 함
- 기준점 SHA/해시 기록이 있어야 함
- 코드 변경 0건(분석 엔진 기준) 확인
- 골든 파일 계약 체크가 PASS여야 함

준비단계 산출물:
- [x] `docs/SIDECAR_BASELINE_FREEZE.md`
- [x] `docs/SIDECAR_ENV_MATRIX.md`
- [x] `docs/SIDECAR_ROLLBACK_RUNBOOK.md`
- [x] `docs/SIDECAR_GOLDEN_CONTRACT.md`
- [x] `docs/SIDECAR_MARKET_CALENDAR.md`
- [x] `docs/SIDECAR_TELEGRAM_SEVERITY.md`
- [x] `docs/fixtures/stage6_golden_contract_v1.json`

---

## 2) 사이드카 레포 생성 (Private)
- [ ] `alpha-exec-engine` private 레포 생성
- [ ] 최소 폴더 구조 생성 (`src/`, `config/`, `state/`, `.github/workflows/`)
- [ ] README에 운영 범위 명시(분석 엔진과 책임 분리)
- [ ] CI 기본 파이프라인(빌드/린트) 추가

완료 기준:
- 사이드카 레포 단독으로 빌드/실행 가능

---

## 3) Stage6 계약 입력 모듈
- [ ] Drive에서 최신 Stage6 파일 읽기
- [ ] Stage5 lock hash + symbols 스냅샷 검증
- [ ] Top6 계약 검증(심볼/순서/entry/target/stop/verdict)
- [ ] 실패 시 즉시 중단 + 에러코드 기록(`CONTRACT_*`)

완료 기준:
- 계약 불일치 데이터 입력 시 주문 미실행 확인

---

## 4) 정책 엔진 구현 (문서 -> 코드)
- [ ] `STAGE6_ALPACA_EXEC_POLICY_DRAFT.md`를 코드 설정으로 매핑
- [ ] 진입 규칙(geometry/R:R/conviction/executionFactor) 구현
- [ ] 리스크 규칙(VIX/이벤트/갭/슬리피지) 구현
- [ ] 우선순위 충돌 처리(`하드중단 > 가드 > 청산 > 진입`) 구현

완료 기준:
- 정책 단위 테스트 통과(핵심 규칙/경계값 포함)

---

## 5) Alpaca Paper 실행 모듈
- [ ] 주문 생성(기본 Limit + bracket TP/SL)
- [ ] 미체결 취소/재평가 로직
- [ ] 부분체결/전량체결 상태 처리
- [ ] 주문 idempotency key 중복 방지

완료 기준:
- 동일 이벤트 재실행 시 중복 주문이 발생하지 않아야 함

---

## 6) 본장 감시 잡 (5~10분)
- [ ] 미국 정규장 시간 판별(뉴욕 타임존 기준)
- [ ] `market-guard` 주기 실행 워크플로우 추가
- [ ] 긴급 트리거(Level1/2/3)별 대응 연결
- [ ] 쿨다운/중복조치 방지 로직 추가

완료 기준:
- 장중 급변 시 신규 중단/취소/타이트닝/청산이 규칙대로 동작

---

## 7) Telegram 라우팅
- [ ] 분석 리포트 채널: `-1003800785574` 유지
- [ ] 시뮬레이션/체결 이벤트 채널: `1281749368` 고정
- [ ] 이벤트 메시지 포맷 표준화 (`ORDER_SUBMITTED`, `FILLED`, `EXIT_*`, `DAILY_PNL`)
- [ ] 전송 실패 재시도 + 실패 로그 코드화

완료 기준:
- 이벤트별 메시지가 올바른 채널로 분리 송신

---

## 8) 상태 저장/복구
- [ ] `exec_state`(진행 상태) 저장
- [ ] `order_ledger`(주문 원장) 저장
- [ ] `pnl_ledger`(손익 원장) 저장
- [ ] 재시작 시 상태 복구 및 연속성 검증

완료 기준:
- 프로세스 중단 후 재실행해도 주문/포지션 정합성 유지

---

## 9) 학습/튜닝 루프 (가드레일 포함)
- [ ] KPI 집계(승률, Expectancy, MDD, FillRate, Slippage)
- [ ] 튜닝 대상 파라미터 제한(conviction floor 등)
- [ ] 주 1회, ±5% 내 변경, 최소 샘플 조건 구현
- [ ] 2주 연속 악화 시 자동 롤백 구현

완료 기준:
- 자동 튜닝이 있어도 규칙 위반/급격 파라미터 변동 없음

---

## 10) 검증 시나리오
- [ ] 수동 Stage6 vs 오토 Stage6 결과 일치성
- [ ] Stage6 -> Telegram 계약 일치성
- [ ] 주말/휴장일 `NO_EXECUTION_DAY` 동작
- [ ] 리스크오프/긴급트리거 회귀 테스트

완료 기준:
- 핵심 시나리오 전부 PASS

---

## 11) 배포/운영 전환
- [ ] Read-Only 모드 1주 운영
- [ ] Paper 소규모(1~2종목) 1주 운영
- [ ] Paper Full(Top6) 전환
- [ ] 운영 대시보드/알림 기준선 확정

완료 기준:
- 운영 중단 없이 단계 전환 완료

---

## 진행 메모
- 담당:
- 시작일:
- 목표 완료일:
- 현재 단계:
- 차단 이슈:
