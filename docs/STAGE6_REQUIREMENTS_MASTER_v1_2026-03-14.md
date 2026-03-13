# Stage6 Requirements Master v1.0 (2026-03-14)

목적: Stage6 요구사항을 단일 문서로 고정해, 구현/검증/승격 판단 기준을 흔들리지 않게 유지한다.

적용 범위:
- `components/AlphaAnalysis.tsx`
- `services/intelligenceService.ts`
- `sidecar-template/alpha-exec-engine/src/index.ts`
- Stage6 출력 JSON, Telegram Brief, Sidecar Dry-Run/Guard 연계

비범위:
- Stage0~5 필터링 로직 자체 변경
- 실계좌 자동 집행 정책 최종 승격(별도 운영 승인 절차)

---

## 1) 목표 정의 (v1 고정)

- Stage5 Top50은 고품질 후보군으로 간주한다.
- Stage6는 Top50 내에서 다음을 동시에 최적화한다.
  1) 분석 품질(Model)
  2) 실행 가능성(Execution)
  3) 위험 대비 기대값(Risk-Adjusted Edge)
- Top6는 "좋은 종목"과 "지금 실행 가능한 종목"을 구분해 일관되게 출력한다.

---

## 2) 하드 요구사항 (MUST)

## 2.1 계약/출력 일관성

- `verdictFinal`을 단일 최종 평결로 사용한다.
- 하위호환 필드(`finalVerdict`, `verdict`, `aiVerdict`)는 `verdictFinal`과 동기화한다.
- 가격 계약은 아래 필드를 모두 가진다.
  - `entryAnchorPrice`
  - `entryExecPrice`
  - `entryDistancePct`
  - `entryFeasible`
  - `tradePlanStatusShadow` (`VALID_EXEC|WAIT_PULLBACK_TOO_DEEP|INVALID_GEOMETRY|INVALID_DATA`)

## 2.2 Selection 규칙

- Top6 선발은 Execution-first가 기본이다.
  - `EXECUTABLE` 후보 우선
  - 부족분만 `WATCHLIST` 보충
- 순위는 2개를 동시에 유지한다.
  - `modelRank`
  - `executionRank`

## 2.3 Sidecar 정합성

- Sidecar는 Stage6 계약을 파싱해 skip 원인을 분해 가능해야 한다.
  - conviction 탈락 vs 실행가능성 탈락 분리
- `ENTRY_FEASIBILITY_ENFORCE` ON/OFF에 따른 결과 차이가 재현 가능해야 한다.

## 2.4 KPI/평가 창 고정

- Primary Horizon: `T=5D`
- Secondary Horizon: `T=10D`, `T=20D`
- 핵심 KPI:
  - `EarlyHit@T`
  - `MFE@T`
  - `MAE@T`
  - `Expectancy_R`

## 2.5 Outcome Resolver 고정

- 라벨: `TP_FIRST | SL_FIRST | TIMEOUT | NO_FILL`
- 동시 TP/SL 터치 시 `SL_FIRST` 우선
- 판정 데이터는 split/dividend 반영 `1D OHLC`, ET 기준

## 2.6 비용/체결 현실화

- 기본 비용 모델:
  - `SIM_FEE_BPS=0`
  - `SIM_SLIPPAGE_BPS_ENTRY=5`
  - `SIM_SLIPPAGE_BPS_EXIT=5`
  - `SIM_PARTIAL_FILL_HAIRCUT_PCT=15`
- `realizedR`는 비용 차감 후 값으로 계산한다.

## 2.7 신선도/드리프트 가드

- Stage5 lock freshness 가드(`LOCK_MAX_AGE_MIN`)를 둔다.
- 스키마 드리프트/소스 이상 감지 시 자동 안전 전환(관찰 모드) 경로를 제공한다.

## 2.8 버전 추적성

- 모든 산출물에 아래 버전을 기록한다.
  - `objectiveVersion`
  - `resolverVersion`
  - `gateVersion`
- 재현성을 위해 최소 4종 해시/버전 연결을 유지한다.
  - `data_hash`, `code_commit`, `prompt_version`, `gateVersion`

---

## 3) 점수 체계 요구사항

- 최소 점수 필드:
  - `modelScore`
  - `executionScore`
  - `riskAdjustedEdge`
  - `alphaPriorityScore`

- v1 기본식:
  - default: `0.45*model + 0.35*execution + 0.20*edge`
  - risk_off: `0.35*model + 0.45*execution + 0.20*edge`

---

## 4) 성과회계 요구사항

- 결과 원장은 추천 단위로 누적한다.
- 최소 필드:
  - `stage6Hash`, `symbol`
  - `modelRank`, `executionRank`, `verdictFinal`
  - `entryExecPrice`, `targetPrice`, `stopLoss`, `entryDistancePct`
  - `outcomeLabel`, `mfePct`, `maePct`, `realizedR`, `holdingBars`
  - `regimeProfile`, `generatedAt`, `resolvedAt`

---

## 5) 검증/승격 요구사항

## 5.1 사전 검증
- validation pack 1회(OFF/ON/STRICT)로 계약/skip reason 비교

## 5.2 연구 검증
- walk-forward OOS 검증 필수
- 레짐 분리 검증 필수(`default`, `risk_off`)

## 5.3 승격 게이트
- baseline gate(v1) + statistical gate(v2) 모두 만족해야 GO
- 통계 게이트 최소 조건:
  - 레짐별 최소 표본 수 충족
  - `Expectancy_R` 95% 하한이 baseline 초과
  - `maxDrawdownR` 악화 시 자동 NO-GO

---

## 6) 수용 기준 (Definition of Done)

아래가 모두 `PASS`일 때 Stage6 v1 요구사항 100% 달성으로 선언한다.

- [ ] 계약 필드 누락 0건 (`verdictFinal`, execution 계약 필수 필드)
- [ ] Top6에서 Model/Execution rank 동시 확인 가능
- [ ] WAIT 상위노출 문제 재현 케이스에서 개선 확인
- [ ] Sidecar skip 원인 분해 보고 가능
- [ ] Outcome ledger 누적/조회 가능
- [ ] KPI(5D/10D/20D) 자동 집계 가능
- [ ] 비용 반영 realizedR 산출 가능
- [ ] walk-forward OOS 보고서 생성
- [ ] statistical gate 기준 문서화 + 판정 가능
- [ ] 버전/해시 연결로 재현성 확보

---

## 7) 변경 관리 규칙

- 이 문서는 Stage6 요구사항의 단일 소스다.
- 요구사항 변경은 반드시 버전 업데이트로 관리한다.
  - 예: `v1.0 -> v1.1`
- 구현 문서(`STAGE6_EXECUTION_FIRST_PATCH_PLAN_2026-03-14.md`)는
  본 마스터 요구사항을 충족하는 실행 계획으로만 수정한다.
