# Sidecar Position Lifecycle Policy Blueprint (2026-03-26)

Doc-Tier: P2 (Engineering)


목적: 현재의 `신규 진입(BUY) 중심` 구조를 유지하면서, 향후 `관망/비중확대/비중축소/청산`을
일관된 정책으로 확장하기 위한 기준안을 고정한다.

---

## 1) 현재 기준선 (As-Is)

- Stage6 -> Sidecar 본 파이프라인은 신규 진입 payload(`buy`) 중심이다.
- 포지션 축소/청산은 `market-guard` 액션 체인(`tighten_stops`, `reduce_positions_50`, `flatten_if_triggered`)으로 처리 가능하다.
- 운영 모드가 `observe + readOnly`이면 액션은 계획(planned)만 기록되고 실제 주문은 전송되지 않는다.

---

## 2) 목표 상태 (To-Be)

### 2-1. 액션 타입 표준

| Action | 의미 | 기본 우선순위 |
|---|---|---|
| `ENTRY_NEW` | 신규 진입 | 4 |
| `HOLD_WAIT` | 관망/유지 | 3 |
| `SCALE_UP` | 비중 확대(추가 매수) | 5 |
| `SCALE_DOWN` | 비중 축소(부분 매도) | 2 |
| `EXIT_PARTIAL` | 부분 청산 | 2 |
| `EXIT_FULL` | 전량 청산 | 1 |

우선순위 원칙: `EXIT_FULL/EXIT_PARTIAL > SCALE_DOWN > HOLD_WAIT > ENTRY_NEW > SCALE_UP`

### 2-2. 레짐/가드 레벨별 허용 액션

| 상태 | 신규 진입 | 비중 확대 | 비중 축소 | 청산 |
|---|---|---|---|---|
| `L0` | 허용 | 조건부 허용 | 조건부 | 조건부 |
| `L1` | 제한 허용 | 제한 허용 | 허용 | 허용 |
| `L2` | 금지(기본) | 금지 | 허용(우선) | 허용 |
| `L3` | 금지 | 금지 | 강제 축소 | 강제 청산 조건 허용 |

---

## 3) 의사결정 매트릭스 (초안)

### 3-1. 비중 확대 (`SCALE_UP`)

필수 조건(모두 충족):
- 기존 포지션이 `+1R` 이상 진행
- `conviction >= scale_up_floor` (초기 제안: 82)
- `entry_feasibility=true`, `executionBucket=EXECUTABLE`
- 레짐 `L0~L1`
- 이벤트 블랙아웃 아님(earnings high window 제외)

차단 조건(하나라도 해당 시 금지):
- `L2/L3`
- `stop_distance_out_of_range`
- `portfolio sector cap` 초과

### 3-2. 비중 축소 (`SCALE_DOWN` / `EXIT_PARTIAL`)

유도 조건(하나 이상):
- `conviction` 급락(예: 이전 대비 -15 이상)
- `risk_off` 강화(L2/L3)
- 실적 고위험 구간 진입
- 목표가 근접 후 변동성 급증

실행 규칙(초기):
- 1차: 30~50% 축소
- 2차: 조건 지속 시 추가 30~50% 축소

### 3-3. 전량 청산 (`EXIT_FULL`)

트리거:
- stop hit / 구조 무효화
- guard L3 + 추가 악화 조건
- 정책 위반(계약 불일치/데이터 무결성 실패)

---

## 4) 리스크/비중 관리 가드레일

- 종목 최대 비중: `max_position_pct` (초기 15%)
- 총 익스포저 상한: 레짐별 캡 (`risk_off`에서 축소)
- 동일 섹터/고상관군 집중 제한 유지
- 일일 리스크 예산 초과 시 신규/확대 금지

---

## 5) 구현 단계 (권장)

### Phase A (지금)
- 문서 정책 고정 (본 문서)
- 텔레그램/요약 리포트에 `action intent` 필드 추가 설계만 진행

### Phase B (Paper/Simulated Live)
- `SCALE_UP/SCALE_DOWN/EXIT_*` 결정을 payload preview에만 반영
- 실제 주문 미전송 상태에서 KPI/로그 검증

### Phase C (Execution Enable 전)
- 액션별 안전장치(쿨다운, 최대 횟수, 중복 방지) 적용
- Go/No-Go 문서에 액션별 승격 기준 추가

---

## 6) 데이터/로그 확장 (필수)

신규 기록 필드(제안):
- `actionType`, `actionReason`
- `positionBeforePct`, `positionAfterPct`
- `riskBudgetBefore`, `riskBudgetAfter`
- `guardLevelAtDecision`, `regimeProfileAtDecision`

검증 지표:
- 액션별 승률/평균 R
- 축소 후 MDD 완화율
- 확대 후 기대값 개선 여부

---

## 7) 운영 결정 원칙

- 현재 운영 안정성을 깨지 않기 위해, 즉시 실주문 로직 변경은 하지 않는다.
- 먼저 Paper/Simulated Live에서 액션별 증적을 쌓고, 임계치 충족 시 실행 승격한다.
- P0/P1 문서(상태판/Go-No-Go/증적 로그)와 충돌 시 해당 문서 기준을 우선한다.
