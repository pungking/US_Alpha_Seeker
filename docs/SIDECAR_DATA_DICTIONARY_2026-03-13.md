# Sidecar Data Dictionary (2026-03-13)

목적: `alpha-exec-engine`의 관찰/운영 데이터 파일을 동일 의미로 해석하기 위한 기준 사전.

적용 범위:
- `sidecar-template/alpha-exec-engine/src/index.ts`
- `sidecar-template/alpha-exec-engine/src/market-guard.ts`

비범위:
- 주문 체결 성과 산출 공식(별도 KPI 문서)
- 전략 승격 기준(별도 Go/No-Go 문서)

---

## 1) 공통 규칙

- 시간 필드: ISO-8601 UTC 문자열(예: `2026-03-13T01:23:45.678Z`)
- 수치 필드: `number` 또는 결측 시 `null`
- 상태 파일은 `state/*.json` 단건 스냅샷(append 로그 아님)
- Day 판정 기준 날짜는 ET 거래일 기준으로 집계

## 1.1) Stage6 계약(Phase-1 호환 필드)

목적: 실행 불가능 진입가/평결 충돌 이슈를 점진적으로 제거하기 위해
Phase-1에서 신규 필드를 **추가만** 하고, 기존 필드는 하위호환으로 유지한다.

### verdict 계열

| 필드 | 의미 | 비고 |
|---|---|---|
| `verdictRaw` | AI 원문 평결 | 분석 원문 추적용 |
| `verdictFinal` | 정책 반영 최종 평결 | 출력/실행 단일 기준(우선 사용) |
| `finalVerdict` | 하위호환 미러 | `verdictFinal`과 동일 값 유지 |
| `verdict` | 레거시 필드 | 점진 축소 대상 |

권장 우선순위:
`verdictFinal -> finalVerdict -> aiVerdict -> verdict`

### entry 계열 (Phase-1 Shadow)

| 필드 | 의미 | 비고 |
|---|---|---|
| `entryAnchorPrice` | 분석 앵커 진입가(OTE 등) | 구조 해석용 |
| `entryExecPriceShadow` | 실행용 shadow 진입가 | Phase-1에서는 관측 전용 |
| `entryDistancePctShadow` | 현재가 대비 진입 거리(%) | Phase-1에서는 관측 전용 |
| `entryFeasibleShadow` | 실행 가능성 판정 | Phase-1에서는 관측 전용 |
| `tradePlanStatusShadow` | `VALID_EXEC / WAIT_PULLBACK_TOO_DEEP / INVALID_GEOMETRY / INVALID_DATA` | Phase-1에서는 관측 전용 |

주의:
- Phase-1에서는 신규 shadow 필드로 인해 주문 생성/스킵 로직이 바뀌면 안 된다.
- 실제 enforce는 별도 전환 단계에서만 적용한다.

### Market Pulse 계열 (Phase-2 정규화)

목적: Market Pulse에서 NASDAQ100(NDX)과 NASDAQ Composite(IXIC) 혼선을 제거한다.

| 필드/키 | 의미 | 규칙 |
|---|---|---|
| `SPX` | S&P500 지수 | 표준 키 고정 |
| `NDX` | NASDAQ100 지수 | 표준 키 고정 |
| `IXIC` | NASDAQ Composite 지수 | 참조값(옵션 출력) |
| `VIX` | 변동성 지수 | 표준 키 고정 |
| `source` | 지수 수집 소스 | 보고서에 반드시 출력 |
| `capturedAt` | 지수 캡처 시각(ISO-8601 UTC) | 보고서에 반드시 출력 |

호환 규칙:
- `window.latestMarketPulse.spy`는 `SPX` 호환 키로 유지
- `window.latestMarketPulse.qqq`는 `NDX` 호환 키로 유지
- 단, 리포트 표기는 `SPX/NDX/VIX`를 기준으로만 해석한다.

### 리포트 Plan 라인 계약 (Phase-3 템플릿 동기화)

목적: Stage6 필드와 텔레그램/리포트 문구를 동일 계약으로 유지한다.

권장 출력 형식:
- `진입(실행) $X | 진입(앵커) $Y | 목표 $T | 손절 $S`
- `feasible=<true/false/N/A> | status=<tradePlanStatus*> | distance=<pct/N/A>`

해석 규칙:
- `진입(앵커)`은 분석 기준선(OTE/support)이다.
- `진입(실행)`은 주문 후보 가격이다(`entryExecPrice -> entryExecPriceShadow -> entryPrice` 우선).
- `tradePlanStatus*`는 `tradePlanStatus` 또는 `tradePlanStatusShadow`를 의미한다.

---

## 2) Dry-Run 계열 파일

## `state/last-run.json`
최신 **송신 성공(sent) 기준** 상태 스냅샷.

주의:
- dedupe run에서는 갱신되지 않는다(`PREFLIGHT_NOT_RUN_DEDUPE` 경로).
- 따라서 "해당 run 시점 상태"가 아니라 "최근 sent 시점 상태"로 해석해야 한다.

| 필드 | 타입 | 의미 |
|---|---|---|
| `lastStage6Sha256` | string | 마지막 Stage6 파일 해시 |
| `lastStage6FileId` | string | Google Drive 파일 ID |
| `lastStage6FileName` | string | Stage6 파일명 |
| `lastMode` | string | dedupe 모드 문자열(READ_ONLY/EXEC/profile 등 포함) |
| `lastSentAt` | string | 마지막 송신 시각 |
| `lastForceSendKey` | string(optional) | FORCE_SEND_ONCE 소비 키 |

## `state/last-dry-exec-preview.json`
최신 dry-run 계산 결과(핵심 분석 대상).

주의:
- dedupe run에서는 파일이 갱신되지 않는다.
- 최신 run 로그가 dedupe면, 본 파일은 직전 sent run 기준일 수 있다.

| 필드 | 타입 | 의미 |
|---|---|---|
| `stage6File` | string | Stage6 파일명 |
| `stage6FileId` | string | Stage6 파일 ID |
| `stage6Hash` | string | Stage6 sha256 |
| `generatedAt` | string | 생성 시각 |
| `regime` | object | 시장 프로파일/품질/히스테리시스/entryGuard |
| `notionalPerOrder` | number | 주문당 기준 노셔널 |
| `maxOrders` | number | 최대 주문 수 |
| `maxTotalNotional` | number | 총 노셔널 한도 |
| `minConviction` | number | 최소 conviction 컷 |
| `minStopDistancePct` | number | 최소 손절 거리(%) |
| `maxStopDistancePct` | number | 최대 손절 거리(%) |
| `idempotency` | object | 중복방지 설정/카운트 |
| `orderLifecycle` | object | 원장 갱신 결과(`upserted/transitioned/unchanged`) |
| `preflight` | object | preflight 결과 |
| `guardControl` | object | guard control 게이트 해석 결과 |
| `payloadCount` | number | 생성 payload 수 |
| `skippedCount` | number | skip 수 |
| `payloads` | array | 주문 payload 목록 |
| `skipped` | array | 심볼별 skip 이유 |

### `preflight` 해석

- `status`: `pass | warn | fail | skip`
- `code` 주요 값:
  - `PREFLIGHT_PASS`
  - `PREFLIGHT_MARKET_CLOSED`
  - `PREFLIGHT_NOT_RUN_DEDUPE`
  - `PREFLIGHT_NO_PAYLOAD`
  - `PREFLIGHT_DISABLED`
- `blocking=true`는 실제 차단 의미(보통 exec 모드에서만 fail 차단)

### `guardControl` 해석

| 필드 | 의미 |
|---|---|
| `enforce` | guard control 사용 여부 |
| `blocked` | 신규 진입 차단 여부(핵심) |
| `reason` | 차단/비차단 사유 |
| `stale` | guard-control 상태 만료 여부 |
| `level` | 마지막 guard level (`L1~L3` 원값) |
| `updatedAt` | guard-control 갱신 시각 |

주의:
- `reason=stale(...)`이더라도 `blocked=false`면 관찰 단계에서는 정상 허용.
- `reason=non_live_mode(...)` 역시 `blocked=false` 정상.

## `state/order-idempotency.json`

| 필드 | 타입 | 의미 |
|---|---|---|
| `orders` | object | `idempotencyKey -> record` |
| `updatedAt` | string | 마지막 갱신 시각 |

record 주요 필드: `symbol`, `side`, `stage6Hash`, `stage6File`, `firstSeenAt`, `lastSeenAt`

## `state/order-ledger.json`

| 필드 | 타입 | 의미 |
|---|---|---|
| `orders` | object | `idempotencyKey -> order lifecycle record` |
| `updatedAt` | string | 마지막 갱신 시각 |

order record 핵심:
- `status`: `planned | submitted | accepted | partially_filled | filled | canceled | rejected | expired`
- `statusReason`, `preflightCode`, `regimeProfile`
- `notional`, `limitPrice`, `takeProfitPrice`, `stopLossPrice`
- `history[]`: 상태 전이 이력

## `state/regime-guard-state.json`

| 필드 | 타입 | 의미 |
|---|---|---|
| `lastProfile` | `default | risk_off` | 마지막 적용 프로파일 |
| `lastSwitchedAt` | string | 마지막 전환 시각 |
| `updatedAt` | string | 상태 갱신 시각 |

---

## 3) Market-Guard 계열 파일

## `state/last-market-guard.json`
최신 guard 판단 결과(핵심 분석 대상).

| 필드 | 타입 | 의미 |
|---|---|---|
| `generatedAt` | string | 생성 시각 |
| `level` | number | 적용 레벨(0~3) |
| `rawLevel` | number | 신호 기반 원레벨 |
| `vixLevel` | number | VIX 기여 레벨 |
| `indexLevel` | number | 지수 하락 기여 레벨 |
| `levelReason` | string | 레벨 결정 사유 |
| `vix` | number/null | 최종 VIX |
| `vixSource` | string | 데이터 소스 |
| `indexWorstDropPct` | number/null | 최악 지수 하락률 |
| `quality` | object | 품질 점수/상태/사유 |
| `thresholds` | object | L1/L2/L3 임계값 |
| `marketOpen` | boolean/null | 장중 여부 |
| `nextOpen` | string/null | 다음 장 시작 |
| `mode` | `observe | active` | guard 모드 |
| `actionReason` | string | 액션 허용/차단 사유 |
| `shouldRunActions` | boolean | 액션 실행 가능 여부 |
| `actions` | string[] | 결정된 액션 목록 |
| `actionResult` | object | 원장 upsert/update/prune 결과 + records |
| `signature` | string | dedupe 서명 |
| `diagnostics` | string[] | 진단 로그 |

## `state/market-guard-state.json`

| 필드 | 타입 | 의미 |
|---|---|---|
| `lastLevel` | number | 마지막 레벨 |
| `lastLevelChangedAt` | string | 레벨 변경 시각 |
| `lastEvaluatedAt` | string | 마지막 평가 시각 |
| `lastActionLevel` | number | 마지막 액션 레벨 |
| `lastActionAt` | string | 마지막 액션 시각 |
| `cooldownUntil` | string | 쿨다운 종료 시각 |
| `lastSignature` | string | 마지막 dedupe 서명 |
| `lastForceSendKey` | string(optional) | force send 소비 키 |

주의:
- dedupe 조기 종료 경로에서는 본 파일이 갱신되지 않을 수 있다.
- 특히 `lastEvaluatedAt`은 "모든 run 시각"이 아니라 "state 저장이 발생한 run 시각"으로 해석한다.

## `state/guard-action-ledger.json`

| 필드 | 타입 | 의미 |
|---|---|---|
| `actions` | object | `key -> action record` |
| `updatedAt` | string | 마지막 갱신 시각 |

action record 핵심:
- `status`:  
  `planned | executed | failed | skipped_not_applicable | skipped_policy | blocked_safety_mode | execution_not_implemented`
- `count`: 누적 발생 횟수
- `firstSeenAt`, `lastSeenAt`
- `detail`: 실행/스킵 상세

## `state/guard-control.json`
market-guard가 dry-run/entry gate에 전달하는 제어 스냅샷.

주의:
- 항상 최신으로 갱신되는 파일이 아니다.
- 관찰/비실행 모드에서는 stale 상태가 장시간 유지될 수 있으며, dry-run에서 `reason=stale(...)`로 해석될 수 있다.

| 필드 | 타입 | 의미 |
|---|---|---|
| `haltNewEntries` | boolean | 신규 진입 중단 플래그 |
| `source` | string | 생성 주체(예: `market_guard`) |
| `level` | number | guard 레벨 |
| `profile` | string | profile(`default/risk_off`) |
| `reason` | string | 생성 시 action reason |
| `updatedAt` | string | 생성 시각 |

---

## 4) Day 판정 시 최소 확인 필드

- Dry-run: `guardControl.blocked`, `preflight.status/code`, `payloadCount/skippedCount`, `[RUN_SUMMARY] event`
- Market-guard: `mode`, `actionReason`, `quality.score/status`, `[GUARD_SUMMARY] event`, `exec_allowed/executed/failed`(`GUARD_LEDGER` 로그 라인 기준)

---

## 5) 변경 관리 규칙

- 신규 필드 추가: 문서에 즉시 추가 + 기존 필드 의미 변경 금지
- 기존 필드 의미 변경: 문서 버전 갱신 + 변경 사유/적용일 기록
- Day 비교 구간 중에는 필드명/판정 규칙 변경 금지
