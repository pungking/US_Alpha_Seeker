# US Alpha Seeker Full Pipeline Architecture & Ops (2026-03-12)

Doc-Tier: P2 (Engineering)


## 1) 문서 목적
- 현재 운영 중인 전체 파이프라인(수집 -> 분석 -> 주문/시뮬레이션 -> 감시)을 단일 문서로 정리한다.
- 레포 분리 구조, 트리거 체인, 데이터 계약, 운영 안전정책, 점검 포인트를 명확히 고정한다.
- 운영/장애 대응 시 "어디를 먼저 확인해야 하는지"를 표준화한다.

---

## 2) 시스템 경계와 레포 역할

### A. `US_Alpha_Seeker` (분석 엔진, 웹앱)
- 역할: Stage 0~6 분석 파이프라인 실행, 최종 리포트/Stage6 파일 생성.
- 주요 워크플로우: `.github/workflows/schedule.yml`
- 산출물(핵심): `STAGE6_ALPHA_FINAL_*.json`

### B. `US_Alpha_Seeker_Harvester` (외부 수집 엔진)
- 역할: Stage3 완료 신호를 받아 OHLCV/보조 데이터 수집.
- 트리거:
  - 정기 스케줄(해당 레포에서 관리)
  - Stage3 완료 시 `repository_dispatch(stage3_completed)`로 추가 트리거
- 산출물(핵심): `LATEST_STAGE4_READY.json`, 종목별 `*_OHLCV.json`

### C. `alpha-exec-engine` (sidecar 실행/감시 엔진)
- 역할: Stage6를 실행 정책에 맞게 처리(현재는 안전 모드 중심), 장중 가드 실행.
- 워크플로우:
  - `sidecar-dry-run`: Stage6 기반 시뮬레이션/정책 검증
  - `sidecar-market-guard`: 5분 주기 감시(L0~L3)
- 산출물: run summary + `state/*.json` 아티팩트 + 텔레그램 이벤트

---

## 3) End-to-End 실행 흐름 (정확 순서)

1. **사전 수집(Harvester)**  
   - 데일리 히스토리/보조 데이터 수집(스케줄은 Harvester 레포 정책 기준)

2. **분석 파이프라인(`US_Alpha_Seeker`)**
   - Stage 0 -> Stage 1 -> Stage 2 -> Stage 3 진행
   - Stage3 완료 시 Harvester에 `stage3_completed` dispatch

3. **OHLCV 동기화 대기**
   - Stage4는 `LATEST_STAGE4_READY.json`의 `trigger_file` 매칭을 확인한 뒤 진행

4. **후반 분석**
   - Stage 4 -> Stage 5 -> Stage 6 실행
   - `STAGE6_ALPHA_FINAL_*.json` 생성/저장 + 분석 텔레그램 리포트 전송
   - 완료 직후 `alpha-exec-engine`로 `repository_dispatch(event_type=stage6_result_created)` 전송

5. **실행 사이드카(`alpha-exec-engine`)**
   - Stage6 파일 로드/검증
   - 정책 게이트/리스크 게이트/중복 방지 처리
   - (안전모드) 주문 미실행 + 시뮬레이션 텔레그램/상태 저장
   - (활성모드) 정책 허용 시 주문/포지션 제어 액션 실행

6. **장중 감시(`market-guard`)**
   - 5분 간격으로 VIX/지수/품질 점수 감시
   - observe/active 모드에 따라 알림-only 또는 실행 액션 수행

---

## 4) 분석 엔진 Stage 계약 (0~6)

## Stage 0 Gathering
- 입력: 데이터 제공자/기본 유니버스
- 출력: `STAGE0_MASTER_UNIVERSE_*.json`

## Stage 1 Pre-Filter
- 입력: Stage0
- 출력: `STAGE1_PURIFIED_UNIVERSE_*.json`

## Stage 2 Deep Quality
- 입력: Stage1
- 출력: `STAGE2_ELITE_UNIVERSE_*.json`

## Stage 3 Fundamental
- 입력: Stage2
- 출력: `STAGE3_FUNDAMENTAL_FULL_*.json`
- 후속 트리거:
  - `US_Alpha_Seeker_Harvester`로 `repository_dispatch(event_type=stage3_completed)`
  - payload에 `trigger_file`(Stage3 파일명) 포함

## Stage 4 Technical
- 시작 조건:
  - `LATEST_STAGE4_READY.json` 존재
  - `status=COMPLETED`
  - `trigger_file`가 현재 Stage3 결과와 일치
- 입력: Stage3 + Harvester OHLCV
- 출력: `STAGE4_TECHNICAL_FULL_*.json`

## Stage 5 ICT
- 입력: Stage4
- 출력: `STAGE5_ICT_ELITE_50_*.json`

## Stage 6 Alpha
- 입력: Stage5 (lock/fallback 규칙 적용)
- 출력:
  - `STAGE6_ALPHA_FINAL_*.json` (sidecar의 Source of Truth)
  - `STAGE6_PART1_*`, `STAGE6_PART2_*` 보조 리포트
- 종료:
  - 텔레그램 분석 리포트 송신
  - `alpha-exec-engine` sidecar-dry-run 자동 트리거(`stage6_result_created`)
  - 앱 자동화 상태 `ALL PIPELINES EXECUTED.` 또는 `AUTO ABORTED:*`

운영 메모:
- cross-repo dispatch를 위해 `US_Alpha_Seeker` 레포에 `SIDECAR_DISPATCH_TOKEN` secret 필요
  - scope: target repo(`pungking/alpha-exec-engine`)에 `repository_dispatch` 호출 가능 권한

---

## 5) sidecar-dry-run 상세 정책 체인

1. **부트스트랩/ENV_GUARD**
   - 필수 env/secret 확인, timezone/policy 출력

2. **Stage6 lock**
   - 최신 `STAGE6_ALPHA_FINAL_*.json` 메타(fileId, md5, sha256) 고정

3. **Regime 판정**
   - VIX 소스 체인: `Finnhub -> CNBC Direct -> CNBC RapidAPI -> Snapshot`
   - 품질 점수(`REGIME_QUALITY_*`) + 히스테리시스(`REGIME_HYSTERESIS_*`)
   - 결과는 `state/regime-guard-state.json`에 저장

4. **Dry payload 생성**
   - conviction/stop distance/notional/max orders/max total 규칙 적용

5. **Guard Control 연동**
   - `state/guard-control.json` 읽고 신규진입 차단 여부 평가
   - `GUARD_CONTROL_ENFORCE=true`여도 non-live(`READ_ONLY=true` 또는 `EXEC_ENABLED=false`)면 차단하지 않음

6. **Idempotency + Dedupe**
   - 키 스토어: `state/order-idempotency.json`
   - 동일 hash/mode 중복 송신 차단
   - `FORCE_SEND_ONCE=true`는 1회 우회

7. **Preflight**
   - account/clock/buying power/daily max notional 점검

8. **Lifecycle Ledger**
   - `state/order-ledger.json` 상태 전이 추적

9. **출력/보고**
   - 텔레그램(sim)
   - `state/last-dry-exec-preview.json`, `state/last-run.json`
   - Step Summary + Artifact 업로드

---

## 6) sidecar-market-guard 상세 정책 체인

1. **레벨 산정**
   - `L0~L3` 계산: VIX + index drop + 품질 보정
   - de-escalation hold + action cooldown 적용

2. **모드**
   - `observe`: 알림/원장 중심, 실행 액션 비활성
   - `active`: 실행 가능(단, 안전 게이트 통과 시)

3. **실행 안전 게이트**
   - `MARKET_GUARD_MODE=active`
   - `EXEC_ENABLED=true`
   - `READ_ONLY=false`
   - 액션별 개별 토글:
     - `GUARD_EXECUTE_TIGHTEN_STOPS`
     - `GUARD_EXECUTE_REDUCE_POSITIONS`
     - `GUARD_EXECUTE_FLATTEN`

4. **실행 결과 저장**
   - `state/last-market-guard.json`
   - `state/market-guard-state.json`
   - `state/guard-action-ledger.json`
   - `state/guard-control.json` (`halt_new_entries` 제어 플래그)

---

## 7) 스케줄 및 시간대 기준

### 공통
- 실행 판단 시간대: `America/New_York` (ET)

### `US_Alpha_Seeker` 메인 스케줄
- 파일: `.github/workflows/schedule.yml`
- cron: `0 9 * * 1-5` (UTC)
- 의미: 평일 UTC 09:00 = 한국시간 18:00 (ET 새벽/아침 시간대)

### `alpha-exec-engine` dry-run
- 파일: `sidecar-template/alpha-exec-engine/.github/workflows/dry-run.yml`
- cron: `7 * * * 1-5` (UTC) -> 평일 매시 07분

### `alpha-exec-engine` market-guard
- 파일: `sidecar-template/alpha-exec-engine/.github/workflows/market-guard.yml`
- cron: `*/5 * * * 1-5` (UTC) -> 평일 5분 간격

---

## 8) Drive/State 저장 구조 (핵심)

### Google Drive 주요 폴더
- `Stage0_Universe_Data`
- `Stage1_Quality_Data`
- `Stage2_Deep_Quality`
- `Stage3_Fundamental_Data`
- `Stage4_Technical_Data`
- `Stage5_ICT_Data`
- `Stage6_Alpha_Final`
- `System_Identity_Maps` (ready/progress/regime snapshot 등)
- `Financial_Data_OHLCV`

### Sidecar 로컬 상태 파일
- `state/last-run.json`
- `state/last-dry-exec-preview.json`
- `state/order-idempotency.json`
- `state/order-ledger.json`
- `state/regime-guard-state.json`
- `state/last-market-guard.json`
- `state/market-guard-state.json`
- `state/guard-action-ledger.json`
- `state/guard-control.json`

---

## 9) 운영 정책 (현재 기준)

### 안전 기본값 (권장 고정)
- `EXEC_ENABLED=false`
- `READ_ONLY=true`
- `MARKET_GUARD_MODE=observe`
- `FORCE_SEND_ONCE=false`
- `MARKET_GUARD_FORCE_SEND_ONCE=false`
- `GUARD_FORCE_LEVEL=auto`
- `GUARD_EXECUTE_TIGHTEN_STOPS=false`
- `GUARD_EXECUTE_REDUCE_POSITIONS=false`
- `GUARD_EXECUTE_FLATTEN=false`

### 현재 운영 해석
- 분석/추천/알림은 동작
- 실주문/실포지션 액션은 차단
- guard-control은 기록되지만 non-live 모드에서는 신규진입 차단을 강제하지 않음

---

## 10) 관측 포인트 (어디서 확인할지)

### GitHub Actions > Run Summary
- 메인: `US Alpha Seeker Auto-Scheduler`
- sidecar:
  - `sidecar-dry-run`
  - `sidecar-market-guard`

### 키 로그 마커
- dry-run:
  - `[REGIME]`, `[REGIME_QUALITY]`, `[REGIME_HYST]`
  - `[GUARD_CONTROL]`
  - `[ORDER_IDEMP]`, `[PREFLIGHT]`, `[ORDER_LEDGER]`
  - `[RUN_SUMMARY]`
- market-guard:
  - `[GUARD_LEVEL]`, `[GUARD_DIAG]`
  - `[GUARD_LEDGER]`
  - `[GUARD_SUMMARY]`

### Artifact
- `sidecar-state-*`
- `sidecar-guard-state-*`

---

## 11) 일일 운영 체크리스트 (간단 표준)

1. 메인 파이프라인 성공 여부 확인 (`ALL PIPELINES EXECUTED.`)
2. Stage6 파일 생성 여부/해시 확인
3. dry-run에서 `RUN_SUMMARY`의 payload/skipped, preflight, guard_control 확인
4. market-guard에서 레벨/품질/action_reason 확인
5. 비정상 시 아티팩트(`state/*.json`) 내려받아 원인 추적

---

## 12) 현재 남은 리스크/주의사항
- Finnhub VIX는 계정 구독 범위 이슈로 실패 가능성이 높음(현재 `cnbc_direct` fallback 사용 중).
- snapshot stale 경고는 발생 가능하나 품질 점수 임계 이상이면 운영 지속.
- `FORCE_SEND_ONCE`는 테스트용이다. 운영 기본값은 반드시 `false` 유지.

---

## 13) 변경 관리 원칙
- 분석 엔진 로직과 실행 엔진 로직을 혼합 수정하지 않는다.
- 신규 자동 실행 액션은 반드시 `observe -> active` 단계 검증 후 전환.
- 실행 관련 변수 변경 시:
  - 변경자
  - 변경 시각(ET/KST)
  - 변경 전/후 값
  - 영향 범위
  를 변경 로그에 남긴다.

---

## 14) 관련 문서
- `docs/STAGE6_EXEC_SIDECAR_CHECKLIST.md`
- `docs/SIDECAR_DELIVERY_STATUS_2026-03-11.md`
- `docs/SIDECAR_EXPANSION_BACKLOG_2026-03-11.md`
- `docs/SIDECAR_MARKET_CALENDAR.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
- `sidecar-template/alpha-exec-engine/README.md`
