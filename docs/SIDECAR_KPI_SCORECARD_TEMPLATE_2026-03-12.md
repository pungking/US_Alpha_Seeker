# Sidecar KPI Scorecard Template (2026-03-12)

목적: 관찰/리허설/운영 단계에서 성과를 동일 기준으로 측정하고, 감으로 판단하지 않도록 KPI를 고정한다.

---

## 1) 측정 단계

- Phase O (Observe, Non-Live)
  - 목표: 안정성/일관성 검증
  - 주문 체결 KPI는 참고치로만 관리
- Phase P (Paper Active)
  - 목표: 실행 품질 검증(Fill/Slippage/부분체결/취소)
- Phase L (Live)
  - 목표: 위험대비 성과(Expectancy, MDD, 안정성) 최적화

---

## 2) 데이터 소스 맵

상세 필드 정의는 `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`를 기준으로 해석한다.

| 구분 | 파일/출처 | 핵심 필드 |
|---|---|---|
| Dry run 요약 | `state/last-dry-exec-preview.json` | `payloadCount`, `skippedCount`, `idempotency`, `preflight`, `regime` |
| Run 요약 | `state/last-run.json` | `lastSentAt`, `lastStage6FileName`, `lastStage6Sha256` |
| Guard 요약 | `state/last-market-guard.json` | `level`, `rawLevel`, `quality`, `actions`, `actionReason` |
| Guard 상태 | `state/market-guard-state.json` | `lastLevel`, `cooldownUntil` |
| Guard 액션 원장 | `state/guard-action-ledger.json` | 액션별 상태/횟수 |
| 주문 원장 | `state/order-ledger.json` | 상태 전이(`planned/submitted/filled/...`) |
| 중복 방지 원장 | `state/order-idempotency.json` | `new/duplicate/pruned` 추세 |
| Actions Run Summary | GitHub Actions Summary | run별 최종 수치 스냅샷 |

---

## 2.1 Observe/Non-Live Day PASS 하드게이트

목적: Day 1~3 판정을 숫자/문구 고정으로 수행한다.

| 영역 | PASS 조건 | 근거 소스 |
|---|---|---|
| market-guard 실행 | run 성공(실패/타임아웃 없음) | GitHub run status |
| market-guard 모드 | `mode=observe` | `[GUARD_SUMMARY]` 또는 `last-market-guard.json.mode` |
| market-guard 안전성 | `exec_allowed=false`, `executed=0`, `failed=0` | `[GUARD_LEDGER]` |
| market-guard 이벤트 | `event=sent` 또는 `event=dedupe` | `[GUARD_SUMMARY]` |
| dry-run 실행 | run 성공(실패/타임아웃 없음) | GitHub run status |
| dry-run 게이트 | `guardControl.blocked=false` | `last-dry-exec-preview.json.guardControl` / Summary |
| dry-run 이벤트 | `event=sent` 또는 `event=dedupe` | `[RUN_SUMMARY]` |
| preflight 해석 | `event=sent`면 `pass|warn`, `event=dedupe`면 `skip:PREFLIGHT_NOT_RUN_DEDUPE` 허용 | `[PREFLIGHT]`, `[RUN_SUMMARY]` |
| guard_control reason | `non_live_mode(...)` 또는 `stale(...)` 허용(핵심은 `blocked=false`) | `guardControl.reason` |

참고:
- dedupe run에서는 `state/last-run.json`, `state/last-dry-exec-preview.json`이 갱신되지 않을 수 있다.
- 해석 우선순위는 `RUN_SUMMARY/GUARD_SUMMARY` -> state 파일 순으로 적용한다.

## 2.2 Observe/Non-Live Day FAIL 트리거

하나라도 해당하면 해당 Day는 FAIL:
- `mode!=observe`
- `exec_allowed=true` 또는 `executed>0` 또는 `failed>0`
- `guardControl.blocked=true`
- workflow 실패/중단

## 2.3 일일 최소 증빙 세트

- `sidecar-market-guard` 대표 run URL 1건 + 핵심 summary
- `sidecar-dry-run` 대표 run URL 1건 + 핵심 summary
- Day 판정 1줄(`PASS/WARN/FAIL`) + 원인 1줄

## 2.4 Phase-1(호환/Shadow) 무변경 검증

목적: 계약 보강 필드 추가 후에도 기존 동작이 변하지 않았는지 확인한다.

| 체크 | PASS 조건 | 근거 소스 |
|---|---|---|
| verdict 계약 | `verdictFinal` 존재 + `finalVerdict`와 동일 | Stage6 JSON 샘플 |
| entry shadow 필드 | `entryExecPriceShadow`, `entryDistancePctShadow`, `entryFeasibleShadow`, `tradePlanStatusShadow` 출력 | Stage6 JSON 샘플 |
| dry-run 동작 불변 | 동일 Stage6 hash에서 `payloadCount/skippedCount` 기존 대비 변화 없음 | `last-dry-exec-preview.json`, `[RUN_SUMMARY]` |
| integrity gate | `INTEGRITY_GATE_BLOCKED` 신규 발생 0건 | Actions 로그 |
| sidecar 파서 호환 | 요약 verdict/plan 파싱 실패 0건 | dry-run summary / Telegram summary |

## 2.5 Phase-2(Market Pulse 정규화) 검증

목적: Market Pulse 지표 라벨/소스 불일치를 제거했는지 확인한다.

| 체크 | PASS 조건 | 근거 소스 |
|---|---|---|
| 표준 라벨 | `S&P500(SPX)`, `NASDAQ100(NDX)`, `VIX` 표기 고정 | Telegram Brief |
| Composite 분리 | `IXIC`는 `NASDAQ Composite(IXIC)`로만 표기(옵션) | Telegram Brief |
| 소스/시각 | `Source`, `CapturedAt` 라인 출력 | Telegram Brief |
| 혼선 제거 | `NASDAQ` 단독 라벨로 인한 NDX/IXIC 혼용 문구 0건 | Telegram Brief 샘플 |

## 2.6 Phase-3(리포트 템플릿 동기화) 검증

목적: Stage6 계약값과 리포트/브리프 문구를 동일 의미로 맞춘다.

| 체크 | PASS 조건 | 근거 소스 |
|---|---|---|
| Plan 라인 분리 | `진입(실행)` + `진입(앵커)` 동시 표기 | Telegram Brief |
| 실행 컨텍스트 | `feasible/status/distance` 라인 출력 | Telegram Brief, Outlook |
| 1/2/3 구조 유지 | `전설적 투자자 위원회/전문가 3인/전략적 투자 시나리오` 섹션 유지 | Stage6 investmentOutlook |
| 파서 호환 | 계약 검증 실패(`INTEGRITY_GATE_BLOCKED`) 0건 | Actions 로그 |

---

## 3) KPI 카테고리

## A. 시스템 신뢰성 KPI (필수)

| KPI | 계산식 | 목표 |
|---|---|---|
| Workflow Success Rate | `성공 run / 전체 run` | `>= 99%` |
| State Artifact Completeness | `필수 state 파일 존재 run / 전체 run` | `= 100%` |
| Critical Error Count | `failed/timed_out + 비정상 실행` | `= 0` |
| Guard Safety Violations | `observe/non-live에서 executed>0 건수` | `= 0` |

## B. 실행 품질 KPI (Paper/Live)

| KPI | 계산식 | 목표(초기) |
|---|---|---|
| Fill Rate | `filled / submitted` | `>= 85%` |
| Cancel Rate | `canceled / submitted` | `< 25%` |
| Duplicate Prevention Rate | `1 - duplicate_executed / duplicate_detected` | `= 100%` |
| Preflight Block Accuracy | `정상 차단 + 정상 통과 / 전체 preflight` | `>= 98%` |

## C. 리스크/가드 KPI

| KPI | 계산식 | 목표 |
|---|---|---|
| Regime Stability | `불필요 전환 건수/주` | 감소 추세 |
| Guard Action False Positive | `불필요 액션 / 전체 액션` | `< 10%` |
| Quality Degradation Handling | `저품질 시 방어모드 전환 성공률` | `= 100%` |
| Cooldown/Hold Compliance | `규칙 위반 건수` | `= 0` |

## D. 전략 성과 KPI (Paper/Live)

| KPI | 계산식 | 목표(초기) |
|---|---|---|
| Expectancy (R) | `WinRate*AvgWinR - (1-WinRate)*AvgLossR` | `> 0` |
| Max Drawdown | equity curve 기반 | 전략 허용치 이내 |
| Profit Factor | `총 이익 / 총 손실` | `> 1.2` |
| Sharpe (일간) | `평균수익률 / 표준편차` | 개선 추세 |

---

## 4) Scorecard (100점)

- 시스템 신뢰성: 35점
- 실행 품질: 25점
- 리스크/가드: 20점
- 전략 성과: 20점

등급:
- A: 90~100
- B: 80~89
- C: 70~79
- D: 69 이하

---

## 5) 일일 입력 템플릿

## 기본
- ET Date:
- KST Date:
- 관찰 단계: O / P / L

## 핵심 수치
- Workflow Success Rate:
- Artifact Completeness:
- Guard Safety Violations:
- payload/skipped:
- preflight pass/warn/fail:
- regime level/profile:
- quality score:

## 코멘트
- 이상 징후:
- 조치:
- 내일 확인 항목:

---

## 6) 주간 의사결정 게이트

## Observe -> Active (Paper) 전환 조건
- [ ] 3거래일 연속 시스템 신뢰성 KPI 통과
- [ ] Guard Safety Violations 0건
- [ ] Preflight/Guard 판정 불일치 0건
- [ ] 운영자 검토 완료

## Active 확장(단일 액션 -> 다중 액션) 조건
- [ ] 단일 액션 단계 실패 0건
- [ ] 실행 품질 KPI 기준 충족
- [ ] 리스크 KPI 악화 없음

## Rollback 트리거
- [ ] Critical Error 1건 이상
- [ ] Guard 오동작(비의도 실행) 1건 이상
- [ ] Expectancy 악화 + MDD 급증

---

## 7) 운영 규칙

- KPI는 run 단위 raw log가 아니라 `state + summary`를 기준으로 집계한다.
- KPI 정의/임계값 변경 시 문서 버전과 변경 사유를 남긴다.
- 성과 KPI는 최소 표본(예: 20트레이드) 미만일 때 참고 지표로만 사용한다.
