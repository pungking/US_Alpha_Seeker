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

