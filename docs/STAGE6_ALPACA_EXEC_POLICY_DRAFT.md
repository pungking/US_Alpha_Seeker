# US_Alpha_Seeker 자동매매 정책표 (Draft v1.0-rc1)

Doc-Tier: P2 (Engineering)


## 0) 적용 범위
- 대상: `Stage6 Top6 (alpha_candidates)`
- 소스 오브 트루스: `STAGE6_ALPHA_FINAL_*.json`
- 모드: `Paper Trading` only (실거래 금지)
- 실행 주기: 일 1회 기본 + 장중 리스크 가드
- 정책 버전: `policyVersion=stage6-exec-v1.0-rc1`

## 0-1) 충돌 우선순위 (Hard Rule)
- 우선순위: `하드중단 > 리스크가드 > 청산 > 진입 > 탐색슬리브`
- 상위 규칙이 발동하면 하위 규칙은 실행하지 않음.

## 0-2) 데이터 권한 규칙 (신뢰성 핵심)
- 수치 소스 오브 트루스는 Stage6 최종 JSON의 정량 필드로 고정한다.
- `entryPrice/targetPrice/stopLoss/expectedReturn/finalVerdict/finalSelectionScore`는 자동매매 직전 단계에서 AI가 재작성하지 않는다.
- AI는 서술/설명(리포트 문장)만 생성 가능하며, 주문 의사결정 수치에는 개입하지 않는다.
- 주문/메시지 전송 전, Stage6 hash와 Top6 심볼 순서를 기준으로 계약 일치 검증을 수행한다.

## 1) 진입(Entry) 정책
| 항목 | 규칙 |
|---|---|
| 진입 후보 | `finalVerdict ∈ {BUY, STRONG_BUY}` |
| 필수 조건 | `tradePlanStatus=VALID`, `entryPrice/targetPrice/stopLoss` 모두 유효 |
| 품질 조건 | `convictionScore >= 70` (STRONG_BUY는 80+) |
| 실행 가능성 | `executionFactor >= 0.85` |
| 기하학 조건 | `targetPrice > entryPrice > stopLoss`, 최소 `R:R >= 1.5` (권장 1.8) |
| 주문 방식 | 기본 `Limit @ entryPrice` (추격매수 금지) |
| 갭 예외 | 시가가 entry 대비 +0.5% 이내일 때만 제한적 허용, 초과 시 당일 진입 금지 |
| 오픈갭 보호 | 장 시작 후 15분 동안 `abs(last-entry)/entry >= 0.8%`면 신규 진입 보류 후 당일 재평가 |
| 미체결 정책 | 당일 미체결 시 취소 (`DAY`) |
| 포지션 수 | 최대 6개 |
| 종목당 리스크 | 기본 `riskPct=0.75%` (허용 0.5~1.0%) |
| 수량 산식 | `qty = floor((equity * riskPct) / (entryPrice - stopLoss + slipBuffer))`, `slipBuffer=entry*0.10%` |
| 섹터 캡 | 동일 섹터 최대 2종목 |
| 상관도 캡 | 고상관 클러스터(0.75+) 최대 2종목 |

## 2) 유지(Hold) 정책
| 항목 | 규칙 |
|---|---|
| 추천 탈락 시 | 즉시 청산 안 함 (기존 TP/SL 유지) |
| 이익 진행 | +1R 도달 시 stop을 진입가(손익분기)로 상향 |
| 추가매수 | 금지 (초기 진입 1회만) |
| 최대 보유기간 | 20거래일 (미도달 시 타임아웃 청산 검토) |
| 포지션 상태 | `NEW -> PARTIAL -> FILLED -> TP/SL/EXPIRED/CANCELED` 전이만 허용 |

## 3) 청산(Exit) 정책
| 트리거 | 동작 |
|---|---|
| `price >= targetPrice` | 전량 익절 |
| `price <= stopLoss` | 전량 손절 |
| 연속 하향 신호 | 2회 연속 `SELL/REDUCE`면 50% 축소, 3회면 전량 청산 |
| 구조 무효화 | `tradePlanStatus=INVALID` 발생 시 즉시 청산 |
| 타임아웃 | 20거래일 경과 시 규칙 기반 강제 정리 |
| 슬리피지 초과 | 주문 기준 괴리 `>25bps` 2회 연속 발생 시 당일 신규진입 중단 + 재평가 |

## 4) 재조정(Rebalance/Adjust) 정책
| 조건 | 조치 |
|---|---|
| 레짐 전환 | 히스테리시스 적용: Risk-Off 진입 `VIX >= 22.0`, 해제 `VIX <= 21.0` |
| `VIX >= 25` (Risk-Off 강화) | 신규 진입 중단, 기존 포지션 stop 5~10% 타이트닝 |
| 실적 이벤트 HIGH (D-1~D+1) | 신규 진입 금지 + 기존 50% 축소 |
| 실적 이벤트 MED (D-3~D+3) | 신규 진입 보수화 + 기존 30% 축소 |
| 실적 이벤트 LOW | 기존 정책 유지 |
| Stage6 재분석 급변 | `conviction -15 이상 하락` 또는 `finalVerdict 하향` 시 즉시 재평가 |
| 시장 급변(서킷/급락) | Kill-Switch: 신규/미체결 주문 전면 취소 |
| 시스템 불일치 | Stage6-텔레그램/주문계약 불일치 시 송신/주문 중단 후 수동 확인 |

## 5) 일일 추천 변경 처리 규칙
| 상황 | 규칙 |
|---|---|
| 신규 Top6 등장 | 미보유 슬롯 있을 때만 신규 진입 |
| 기존 포지션과 충돌 | 점수 우위가 충분할 때만 교체 (`Δscore >= 10`) |
| 교체 우선순위 | 약한 conviction + Risk-Off 노출 큰 포지션부터 축소 |

## 6) 데이터/무결성 게이트 (주문 전 필수)
- Stage5 Lock hash 확인
- Stage6 계약 필드 유효성 확인 (`entry/target/stop/verdict`)
- Telegram 게이트와 별도로 주문 게이트 통과 필요
- 하나라도 실패 시: 주문 미실행 + 경고 로그 + 리포트 저장
- 감사 필수 저장: `runId`, `stage5Hash`, `policyVersion`, `configSnapshot`, `orderDecisionReason`
- 필수 저장 확장: `stage6Hash`, `top6SymbolsSnapshot`, `manual/autopilot mode`, `lockMode(latest/locked)`
- 최신성 TTL: `MARKET_REGIME_SNAPSHOT <= 30분`, `EARNINGS_EVENT_MAP <= 24시간`, `STAGE6_ALPHA_FINAL <= 90분` (장중 기준)

## 7) 성과 평가 KPI (주간/월간)
- Hit Rate, Avg R, Expectancy
- Max Drawdown, Sharpe Proxy
- Fill Rate(체결률), Slippage
- 규칙 위반 건수(0 목표)

## 8) 자동 튜닝 가드레일
- 튜닝 대상: 소수 파라미터만 (예: conviction floor, executionFactor cutoff)
- 변화폭 제한: 회차당 ±5%, 주 1회만 반영
- 최소 샘플 수 미달 시 튜닝 금지 (예: 최근 20회 미만)
- 악화 시 자동 롤백: 2주 연속 KPI 악화 시 이전 파라미터 복귀

## 9) 코어/탐색 슬리브 분리 (필수)
- Core Sleeve (기본): 80~90%, 안정 수익/리스크 관리 목적
- Explore Sleeve (유니콘/텐베거 탐색): 10~20%, 고변동 고성장 목적
- 두 슬리브는 성과/KPI/튜닝 파라미터를 분리해서 관리

## 10) 운영 모드 규칙 (수동/오토 일치)
- 수동/오토 모두 동일 Stage6 실행 정책을 사용한다.
- 차이는 실행 트리거만 허용한다(수동 클릭 vs 스케줄러 시작).
- `LOCKED` 모드에서는 지정된 Stage5 파일 고정, `LATEST` 모드에서는 최신 파일 자동 선택.
- 디버깅 종료 시 `LATEST` 복귀를 원칙으로 한다.
- 주말/미국 휴장일은 신규 주문 금지, 리포트는 `NO_EXECUTION_DAY`로 송신한다.

## 11) 실행 전 체크리스트 (운영자용)
- [ ] Stage5 lock 상태 확인 (`LATEST` 또는 지정 `LOCKED`)
- [ ] Stage6 hash/Top6 심볼 스냅샷 로그 확인
- [ ] Market Regime/VIX 값 최신성 확인
- [ ] Telegram/Order 계약 검증 성공 로그 확인
- [ ] 실패 시 재시도 전에 원인코드(`CONTRACT_*`, `RISK_*`, `LOCK_*`) 확인

## 12) 상태머신 표준 (브로커 연동)
- 허용 상태: `NEW -> ACCEPTED -> PARTIAL -> FILLED -> TP/SL/EXPIRED/CANCELED`
- 예외 상태: `REJECTED`, `AMEND_PENDING`, `AMENDED`
- `REJECTED` 발생 시 동일 티커 당일 재진입 금지 (수동 승인 없으면 종료)
- `AMEND_PENDING` 60초 초과 시 원주문 취소 후 신규 생성

## 13) Telegram 실행 리포트 정책
- 기본 원칙: 주문/체결/청산/손익 이벤트를 모두 Telegram으로 송신한다.
- 필수 이벤트:
  - `ORDER_SUBMITTED` (티커, 수량, 진입/목표/손절, lockMode)
  - `ORDER_FILLED` (평균체결가, 슬리피지 bps)
  - `PARTIAL_FILLED` (체결률, 잔량)
  - `EXIT_TP`, `EXIT_SL`, `EXIT_TIMEOUT`, `EXIT_MANUAL`
  - `DAILY_PNL` (실현손익, 미실현손익, 승률, 평균 R)
  - `NO_EXECUTION_DAY` (휴장/주말/리스크중단 사유)
- 메시지 신뢰 규칙:
  - Stage6 수치 필드와 주문 필드는 1:1 매핑
  - 메시지 생성 전 계약 검증 실패 시 송신 중단 + `TELEGRAM_CONTRACT_BLOCKED`
