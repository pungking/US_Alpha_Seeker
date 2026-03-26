# Stage6 Execution-First Patch Plan (2026-03-14)

Doc-Tier: P2 (Engineering)


목적: Stage5에서 올라온 50개 중 “좋은 종목”과 “지금 실행 가능한 종목”을 분리해,
Top6가 실전 관점에서 일관되게 해석되도록 Stage6를 재정렬한다.

주의:
- Stage5 50개는 고품질 후보군이지만, "무조건 상승"을 전제하면 리스크가 과소평가된다.
- Stage6는 후보군 내부에서 **실행 시점/손익비/승률 기대값**을 재정렬하는 계층으로 정의한다.

요구사항 기준 문서:
- `docs/STAGE6_REQUIREMENTS_MASTER_v1_2026-03-14.md`
- `docs/SIDECAR_POSITION_LIFECYCLE_POLICY_BLUEPRINT_2026-03-26.md`
- 본 문서는 위 마스터 요구사항을 구현하기 위한 커밋 실행 계획이다.

---

## 1) 현재 문제 정의 (원인 고정)

- 현재 파이프라인은 `점수 기반 Top6 선발 -> 실행 가능성 강등(WAIT)` 순서다.
- 결과적으로 1~2순위가 `WAIT_PULLBACK_TOO_DEEP`가 되어도 카드 상단에 남는다.
- 즉, 연구용 순위(Model Rank)와 실행용 순위(Execution Rank)가 섞여 있다.

핵심 원인:
- Top6 컷 시점: `finalSelectionScore` 기준 선발
- 실행가능성 적용 시점: Top6 확정 이후

---

## 2) 목표 상태 (Target Behavior)

1. **Model Rank 유지**  
   - “분석 품질” 순위는 기존처럼 유지(연구/설명 용도).
2. **Execution Rank 신설**  
   - “지금 체결 가능” 기준 순위를 별도로 계산.
3. **Top6 출력 규칙 변경**  
   - 기본: 실행가능(`VALID_EXEC`) 후보 우선 Top6.
   - 예외: 실행가능 후보가 6 미만이면 `WAIT` 후보로 부족분만 보충(명시 로그).
4. **Sidecar 계약 일관성**
   - `verdictFinal=WAIT`는 실행 후보에서 자동 제외.
5. **성과기반 재학습 가능성 확보**
   - 추천 이후 실현 성과를 누적해 랭크/가중치를 재보정할 수 있어야 한다.

---

## 3) 커밋 단위 패치 순서

## Commit 1 — Contract 확장 (동작 불변)

목적: 기존 동작을 바꾸지 않고 랭크 분리 필드만 먼저 추가.

대상 파일:
- `components/AlphaAnalysis.tsx`
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

추가 필드(Top6 candidate):
- `modelRank` (점수 순위)
- `executionRank` (실행순위, 없으면 null)
- `executionBucket` (`EXECUTABLE | WATCHLIST`)
- `executionReason` (`VALID_EXEC | WAIT_PULLBACK_TOO_DEEP | INVALID_GEOMETRY | INVALID_DATA`)

완료 기준:
- [ ] Stage6 JSON에 신규 필드 출력
- [ ] 기존 Top6 구성/갯수 변화 없음

커밋 메시지:
- `feat(stage6-contract): add model/execution rank fields without behavior change`

---

## Commit 2 — Selection 순서 변경 (핵심 로직)

목적: Top6 선발을 Execution-only로 전환.

대상 파일:
- `components/AlphaAnalysis.tsx`

변경 규칙:
- `executionBucket=EXECUTABLE` 후보만 점수순 선발
- `WATCHLIST` 폴백 제거(최종 후보 수 `0~6` 허용)
- 로그 추가:
  - `Execution-only: executable=X selected=Y dropped_watchlist=Z`
  - `Execution-only reasons: VALID_EXEC=... WAIT_PULLBACK_TOO_DEEP=... INVALID_GEOMETRY=... INVALID_DATA=...`

완료 기준:
- [ ] 최종 추천에는 `VALID_EXEC`만 포함
- [ ] 실행가능 후보 부족 시 추천 수를 억지로 채우지 않음
- [ ] 부족 사유(reason) 카운트를 로그로 추적 가능

커밋 메시지:
- `feat(stage6): enforce executable-only selection and remove watchlist fallback`

---

## Commit 3 — UI 정렬/표시 분리

목적: 사용자 화면에서 혼선을 제거.

대상 파일:
- `components/AlphaAnalysis.tsx`

변경:
- 카드 정렬 기준: `executionBucket` 우선, 그 다음 점수
- 카드에 `Model #`, `Exec #` 표시
- 기존 라벨(`ICT OTE`, `Target`, `ICT Stop`) 유지
- Execution 라인(실행가/괴리/status)은 유지

완료 기준:
- [ ] WAIT 종목이 최상단 고정되는 현상 제거
- [ ] 같은 종목의 연구순위/실행순위 동시 확인 가능

커밋 메시지:
- `feat(ui): separate model rank and execution rank in card ordering`

---

## Commit 4 — Sidecar 계약 동기화

목적: Stage6 출력 변경과 sidecar 해석 규칙 완전 일치.

대상 파일:
- `sidecar-template/alpha-exec-engine/src/index.ts`
- `sidecar-template/alpha-exec-engine/README.md`
- `sidecar-template/alpha-exec-engine/.env.example`

변경:
- 가능하면 `executionBucket`/`executionReason` 읽어서 skip reason 강화
- 기존 `ENTRY_FEASIBILITY_ENFORCE` 동작은 그대로 유지

완료 기준:
- [ ] Stage6-UI-Sidecar skip reason 불일치 0건
- [ ] `payload=0`일 때 원인 분해(Conviction vs Entry Feasibility) 명확

커밋 메시지:
- `feat(sidecar): align execution-bucket contract and skip diagnostics`

---

## Commit 5 — Report/Telegram 문구 동기화

목적: 사용자 메시지에서 “추천”과 “대기” 경계를 명확히 표현.

대상 파일:
- `services/intelligenceService.ts`
- `components/AlphaAnalysis.tsx`

변경:
- `Top6 (Model)` vs `Executable Picks` 구분 출력
- WAIT 종목은 `Watchlist` 섹션으로 분리

완료 기준:
- [ ] 추천 1~2위가 WAIT일 때도 메시지 해석 혼선 없음

커밋 메시지:
- `feat(report): split model top6 and executable picks in stage6 messaging`

---

## Commit 6 — 검증/증빙 마감

목적: 변경 후 검증 결과를 운영 문서에 고정.

대상 파일:
- `sidecar-template/alpha-exec-engine/docs/P3_3_ACTIVE_EXEC_TEST_CHECKLIST.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
- `docs/SIDECAR_GO_NO_GO_DECISION_TEMPLATE_2026-03-12.md`

검증:
- [ ] validation pack 1회 실행(OFF/ON/STRICT)
- [ ] Stage6 1회 생성 기준으로 sidecar 3케이스 비교
- [ ] 실행가능 Top6 비율 개선 확인

커밋 메시지:
- `docs: finalize execution-first validation evidence and rollout checklist`

---

## Commit 7 — Outcome Ledger (성과 회계 계층)

목적: "추천 정확도/승률/손익비"를 감으로 보지 않고, 종목별/레짐별로 수치화한다.

대상 파일:
- `components/AlphaAnalysis.tsx` (Stage6 출력 시 outcome seed 포함)
- `sidecar-template/alpha-exec-engine/src/index.ts` (entry/skip 체인 기록)
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`

신규 레코드(예: `state/stage6-outcome-ledger.json`):
- `stage6Hash`, `symbol`, `modelRank`, `executionRank`, `verdictFinal`
- `entryExecPrice`, `targetPrice`, `stopLoss`, `entryDistancePct`
- `regimeProfile`, `generatedAt`, `resolvedAt`
- `outcomeLabel` (`TP_FIRST | SL_FIRST | TIMEOUT | NO_FILL`)
- `mfePct`, `maePct`, `realizedR`, `holdingBars`

완료 기준:
- [ ] 추천 건당 결과 라벨 누적
- [ ] 최소 20건 누적 시 승률/평균R 산출 가능

커밋 메시지:
- `feat(ledger): add stage6 outcome ledger for win-rate and expectancy tracking`

---

## Commit 8 — Objective Function 분리 (연구점수 vs 실행점수)

목적: "먼저 오를/많이 오를/손익비 좋은" 목표를 수식으로 분리한다.

대상 파일:
- `components/AlphaAnalysis.tsx`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

도입 점수:
- `modelScore` (기존 finalSelectionScore 계열)
- `executionScore` (실행가능성/거리/유동성/이벤트 리스크 반영)
- `alphaPriorityScore` (최종 우선순위; 레짐별 가중치 적용)

권장 기본식(초기):
- `alphaPriorityScore = 0.45*modelScore + 0.35*executionScore + 0.20*riskAdjustedEdge`

완료 기준:
- [ ] 동일 후보에 대해 모델/실행 점수 분리 출력
- [ ] WAIT가 상위 노출되는 빈도 감소

커밋 메시지:
- `feat(stage6): split modelScore and executionScore with unified alpha priority`

---

## Commit 9 — Walk-Forward 검증 루프

목적: 파라미터를 과최적화 없이 개선한다.

대상 파일:
- `scripts/` (신규 검증 스크립트)
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

검증 규칙:
- 레짐 분리(`risk_off/default`) 성능 측정
- 월별 walk-forward (train N주, validate 1주)
- 승격 조건 미달 시 자동 롤백(가중치 고정)

완료 기준:
- [ ] 파라미터 변경마다 OOS 성능표 생성
- [ ] 변경 전/후 비교 리포트 자동 생성

커밋 메시지:
- `feat(research): add walk-forward validation loop for stage6 parameter tuning`

---

## Commit 10 — Promotion Gate (운영 승격 규칙)

목적: "느낌 개선"이 아니라 "지표 개선"일 때만 배포한다.

대상 파일:
- `docs/SIDECAR_GO_NO_GO_DECISION_TEMPLATE_2026-03-12.md`
- `sidecar-template/alpha-exec-engine/docs/P3_3_ACTIVE_EXEC_TEST_CHECKLIST.md`

승격 최소 조건(예시):
- 최근 20~50건 기준:
  - `hitRate >= baseline + 3%p`
  - `avgRealizedR > baseline`
  - `maxDrawdownR <= baseline`
  - `WAIT_top2_incidence` 유의미 감소

완료 기준:
- [ ] 조건 미충족 시 NO-GO 자동 판단 가능
- [ ] 롤백 경로 문서화 완료

커밋 메시지:
- `docs(gate): add promotion criteria based on outcome ledger metrics`

비고:
- Commit 10은 baseline gate(v1)이며, Commit 16에서 통계 게이트(v2)로 승격/대체한다.

---

## Commit 11 — KPI Time-Horizon 고정 (목표함수 명세)

목적: “먼저 오름/많이 오름/손익비”를 모호하지 않은 수식으로 고정한다.

대상 파일:
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
- `docs/STAGE6_EXECUTION_FIRST_PATCH_PLAN_2026-03-14.md`

필수 KPI 정의:
- `EarlyHit@T`: 추천 시점부터 T bar 내 TP 선도 도달 여부
- `MFE@T`: T bar 내 최대 유리 변동(%)
- `MAE@T`: T bar 내 최대 불리 변동(%)
- `Expectancy_R`: `hitRate * avgWinR - (1-hitRate) * avgLossR`
- 기본 창: `T=5D`, 보조 창: `T=10D`, `T=20D`

완료 기준:
- [ ] 모든 리포트/검증이 동일 T 기준 사용
- [ ] KPI 산식/단위(%, R, bar) 명시

커밋 메시지:
- `docs(kpi): lock stage6 objective horizons and formulas`

---

## Commit 12 — Outcome Resolver 규칙 고정

목적: 결과 라벨링을 결정론적으로 고정해 재현성을 확보한다.

대상 파일:
- `sidecar-template/alpha-exec-engine/src/index.ts`
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`

필수 규칙:
- 라벨: `TP_FIRST | SL_FIRST | TIMEOUT | NO_FILL`
- 동시터치 처리: 보수적으로 `SL_FIRST` 우선(옵션화 금지)
- `NO_FILL`: 진입 미체결 + T 만료
- `TIMEOUT`: 체결 후 TP/SL 미도달 + T 만료

완료 기준:
- [ ] 같은 입력 데이터에서 라벨 100% 재현
- [ ] 라벨 계산 버전(`resolverVersion`) 기록

커밋 메시지:
- `feat(resolver): add deterministic outcome labeling rules for stage6`

---

## Commit 13 — 거래비용/슬리피지 모델 반영

목적: 실현 기대값 과대평가를 제거한다.

대상 파일:
- `sidecar-template/alpha-exec-engine/src/index.ts`
- `sidecar-template/alpha-exec-engine/.env.example`
- `sidecar-template/alpha-exec-engine/README.md`

필수 입력:
- `SIM_FEE_BPS`
- `SIM_SLIPPAGE_BPS_ENTRY`
- `SIM_SLIPPAGE_BPS_EXIT`
- `SIM_PARTIAL_FILL_HAIRCUT_PCT`

완료 기준:
- [ ] `realizedR`가 비용 차감 후 계산
- [ ] 비용 0/기본값 경로 회귀 테스트 통과

커밋 메시지:
- `feat(sim): apply fees and slippage to realized R accounting`

---

## Commit 14 — Stage5 Lock Freshness Guard

목적: 오래된 Stage5 lock으로 인한 가격 괴리 폭증을 사전 제어한다.

대상 파일:
- `components/AlphaAnalysis.tsx`
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`

가드 정책:
- `LOCK_MAX_AGE_MIN` 초과 시 `stale_lock=true`
- stale 시:
  - `executionScore` 패널티
  - 상위 카드 경고 뱃지 표시
  - 로그에 `LOCK_STALE_GUARD` 출력

완료 기준:
- [ ] stale lock 상태를 UI/로그/JSON에서 동일하게 확인
- [ ] stale 상태에서 WAIT 비율 증가 원인 추적 가능

커밋 메시지:
- `feat(stage5-lock): add freshness guard and stale-lock diagnostics`

---

## Commit 15 — Confidence Calibration + Abstain

목적: 불확실 종목의 오탐 추천을 줄인다.

대상 파일:
- `components/AlphaAnalysis.tsx`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

정책:
- `confidenceScore` 산출(데이터품질/합의도/레짐정합)
- 임계값 미만은 `ABSTAIN` 또는 `WATCHLIST`로 강등
- Top6는 기본적으로 `confidenceScore >= minConfidence` 후보 우선

완료 기준:
- [ ] 고변동/저신뢰 구간에서 오탐 비율 감소
- [ ] 강등 근거(`confidence_reason`) 출력

커밋 메시지:
- `feat(calibration): add confidence score and abstain policy for low-certainty picks`

---

## Commit 16 — 통계적 Promotion Gate 강화

목적: 우연 개선을 배포하지 않도록 승격 기준을 통계화한다.

대상 파일:
- `docs/SIDECAR_GO_NO_GO_DECISION_TEMPLATE_2026-03-12.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

필수 규칙:
- 레짐별 최소 표본(예: 각 30건 이상)
- `Expectancy_R` 95% 하한이 baseline 초과 시에만 승격
- `maxDrawdownR` 악화 시 자동 NO-GO
- 승격/롤백 기록에 `gateVersion` 남김

완료 기준:
- [ ] GO/NO-GO가 수치와 버전으로 재현 가능
- [ ] 릴리즈 승인 근거 자동 생성

커밋 메시지:
- `docs(gate): enforce statistical promotion criteria with regime minimum samples`

---

## 4) 리스크 / 대응

- 리스크: 실행가능 우선으로 바꾸면 기대수익 수치가 낮아보일 수 있음  
  - 대응: Model Rank는 별도 유지해 연구 성과 추적 보존

- 리스크: Top6 카드/리포트 형식 변경으로 혼선  
  - 대응: 기존 라벨 유지 + Rank/버킷만 추가

- 리스크: Sidecar와 Stage6 해석 차이  
  - 대응: Commit 4에서 skip reason 계약 강제 동기화

- 리스크: 표본 부족 상태에서 과도한 튜닝
  - 대응: Commit 16 최소 표본/신뢰구간 게이트로 차단

---

## 5) MUST 고정값 (선행 의사결정)

아래 항목은 Commit 1 착수 전에 반드시 고정한다.

- KPI 창:
  - Primary: `T=5D`
  - Secondary: `T=10D`, `T=20D`
- 라벨링 우선순위:
  - 동일 bar에서 TP/SL 동시 충족 시 `SL_FIRST` 우선
- 데이터 기준:
  - Outcome 판정용 가격은 split/dividend 조정 반영 데이터 사용
  - 캔들 해상도는 기본 `1D OHLC`로 고정(초기 버전)
  - 타임존은 ET 기준으로 고정
- 체결 가정:
  - 진입 한도가는 `bar.low <= entry <= bar.high`일 때 체결로 판정
  - 체결가는 `entry + entry_slippage` 적용
  - 청산가는 TP/SL 터치 시 각각 `tp - exit_slippage`, `sl + exit_slippage` 적용
- 비용 기본값:
  - `SIM_FEE_BPS=0`
  - `SIM_SLIPPAGE_BPS_ENTRY=5`
  - `SIM_SLIPPAGE_BPS_EXIT=5`
  - `SIM_PARTIAL_FILL_HAIRCUT_PCT=15`
- 레짐별 우선순위 가중치(초기):
  - `default: 0.45*model + 0.35*execution + 0.20*edge`
  - `risk_off: 0.35*model + 0.45*execution + 0.20*edge`
- 버전 고정:
  - `objectiveVersion`, `resolverVersion`, `gateVersion`를 모든 산출물에 기록

---

## 6) 실행 순서 (실제 작업)

- [ ] Commit 1
- [ ] Commit 2
- [ ] Commit 3
- [ ] Commit 4
- [ ] Commit 5
- [ ] Commit 6
- [ ] Commit 7
- [ ] Commit 8
- [ ] Commit 9
- [ ] Commit 10
- [ ] Commit 11
- [ ] Commit 12
- [ ] Commit 13
- [ ] Commit 14
- [ ] Commit 15
- [ ] Commit 16

운영 원칙:
- 각 커밋마다 빌드/로그 검증 후 다음 커밋 진행
- 한 커밋에서 로직 + UI + sidecar를 동시에 바꾸지 않는다
