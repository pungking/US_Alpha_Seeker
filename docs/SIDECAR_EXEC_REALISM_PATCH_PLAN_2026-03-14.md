# Sidecar Exec Realism Patch Plan (2026-03-14)

목적: 기존 강점(Quant Lock, Risk Gate, Sidecar Safety)을 유지하면서,
실행 불가능 진입가/판정 충돌/리포트 불일치를 구조적으로 제거한다.

---

## 0) 운영 원칙 (장점 강화 + 단점 보완)

- 강점 유지
  - Quant trade-box 원천 보존 (`otePrice`, `resistanceLevel`, `ictStopLoss`)
  - Sidecar 실행 안전장치(`conviction`, `geometry`, `idempotency`, `preflight`) 유지
- 단점 보완
  - 실행가와 분석 앵커가 혼재된 계약 분리
  - `verdict`/`finalVerdict` 이중체계 단일화
  - Market Pulse 지표 라벨/소스 정합성 강제
- 배포 원칙
  - `Shadow -> Display -> Enforcement` 3단계
  - 가드 플래그를 통해 점진 활성화
  - 단계별 롤백 가능 상태 유지

---

## 1) 최종 목표 계약 (Target Contract)

### 1.1 Price Contract
- `entryAnchorPrice`: 분석 앵커값 (OTE/Fib)
- `entryExecPrice`: 실행용 진입가
- `entryDistancePct`: `abs(price-entryExecPrice)/price*100`
- `entryFeasible`: 실행 가능 여부 (`true/false`)
- `tradePlanStatus`: `VALID_EXEC | WAIT_PULLBACK_TOO_DEEP | INVALID_GEOMETRY | INVALID_DATA`

### 1.2 Verdict Contract
- `verdictRaw`: AI 원문 평결
- `verdictFinal`: 정책 반영 최종 평결 (출력/실행 단일 기준)
- 하위호환용 `finalVerdict`는 유지하되, `verdictFinal`을 미러링해 충돌 금지

### 1.3 Pulse Contract
- `SPX`, `NDX`, `VIX`를 표준 키로 사용
- `IXIC`는 별도 참조값으로만 출력
- 메시지에 source/timestamp 명시

---

## 2) 실제 패치 순서 + 커밋 단위 (파일별)

## Commit A — Baseline/Spec Freeze (문서 only)
- 목적: 기준선 고정, 변경 추적 시작
- 파일:
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
  - `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
  - `docs/SIDECAR_EXEC_REALISM_PATCH_PLAN_2026-03-14.md`
- 산출:
  - 신규 필드 정의/판정 기준/관측 지표 추가
- 커밋 메시지:
  - `docs: add exec-realism target contract and phased patch plan`

체크:
- [ ] 신규 계약 필드 정의 반영
- [ ] 기존 필드와의 매핑표 반영
- [ ] 롤백 기준 문구 반영

---

## Commit B — Shadow Metrics 생성 (동작 불변)
- 목적: 실행 영향 없이 관측 데이터 먼저 수집
- 파일:
  - `components/IctAnalysis.tsx`
  - `components/AlphaAnalysis.tsx`
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- 구현:
  - `entryExecPriceShadow`, `entryDistancePctShadow`, `entryFeasibleShadow`, `tradePlanStatusShadow` 생성
  - 기존 주문/선정 로직은 그대로 유지
- 커밋 메시지:
  - `feat(stage6): add shadow exec-feasibility metrics without behavior change`

체크:
- [ ] Stage5/Stage6 JSON에 shadow 필드 출력
- [ ] 기존 Top6/Sidecar payload 수량 변화 없음
- [ ] 로그에 shadow 분포 확인 가능

---

## Commit C — Verdict 단일화 (출력 정합성)
- 목적: `WAIT` vs `BUY` 충돌 제거
- 파일:
  - `components/AlphaAnalysis.tsx`
  - `services/intelligenceService.ts`
  - `sidecar-template/alpha-exec-engine/src/index.ts`
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- 구현:
  - `verdictRaw`, `verdictFinal` 확정
  - 텔레그램/리포트/사이드카 파서가 `verdictFinal` 우선 사용
  - `finalVerdict`는 `verdictFinal` 미러로만 유지
- 커밋 메시지:
  - `refactor(contract): unify verdict pipeline with verdictFinal as single source`

체크:
- [ ] 동일 종목에서 verdict 필드 충돌 0건
- [ ] 텔레그램 라벨과 Stage6 JSON 일치
- [ ] Sidecar summary verdict 일치

---

## Commit D — Market Pulse 정규화
- 목적: NASDAQ 계열 라벨/수치 불일치 제거
- 파일:
  - `services/intelligenceService.ts`
  - `components/AlphaAnalysis.tsx` (필요시 pulse 캐시 키 정규화)
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- 구현:
  - `NDX`를 `NASDAQ100` 표준으로 고정
  - `IXIC`는 별도 표기(옵션)
  - source/timestamp 출력
- 커밋 메시지:
  - `fix(market-pulse): normalize SPX/NDX/VIX source mapping and labeling`

체크:
- [ ] Telegram Market Pulse와 Snapshot 수치/키 일치
- [ ] NDX/IXIC 혼선 문구 제거

---

## Commit E — Report 템플릿 동기화 (형태 유지 + 의미 강화)
- 목적: 기존 3섹션 형식 유지하면서 실행 가능성 정보 추가
- 파일:
  - `services/intelligenceService.ts`
  - `components/AlphaAnalysis.tsx`
- 구현:
  - 유지: 
    - `1. 전설적 투자자 위원회 분석`
    - `2. 전문가 3인 성향 분석`
    - `3. 전략적 투자 시나리오`
  - 추가:
    - `진입(실행)` / `진입(앵커)` 분리 표기
    - `entryFeasible`, `tradePlanStatus`, `entryDistancePct` 반영
- 커밋 메시지:
  - `feat(report): keep 3-section format and add exec-feasibility context`

체크:
- [ ] 섹션 구조 유지
- [ ] 가격 박스에 실행/앵커 구분 표시
- [ ] 리포트/텔레그램 문구 일관

---

## Commit F — Sidecar Gate 준비 (플래그 도입, 기본 OFF)
- 목적: 운영 안전하게 enforcement 준비
- 파일:
  - `sidecar-template/alpha-exec-engine/src/index.ts`
  - `sidecar-template/alpha-exec-engine/.env.example`
  - `sidecar-template/alpha-exec-engine/README.md`
  - `sidecar-template/alpha-exec-engine/docs/P3_3_ACTIVE_EXEC_TEST_CHECKLIST.md`
- 구현:
  - 새 env:
    - `ENTRY_FEASIBILITY_ENFORCE=false`
    - `ENTRY_MAX_DISTANCE_PCT=15`
  - 파서가 `entryDistancePct`, `entryFeasible`, `tradePlanStatus` 읽고 dry-run skip reason 기록(`entry_too_far_from_market`)
- 커밋 메시지:
  - `feat(sidecar): add entry-feasibility gate flags (default off) and skip reason logging`

체크:
- [ ] 플래그 OFF 시 기존 payload 결과 동일
- [ ] 플래그 ON 시 기대 skip reason 생성
- [ ] preflight/summary에 반영

---

## Commit G — Enforcement 활성화 (점진)
- 목적: 실제 보호 로직 적용
- 파일:
  - `components/AlphaAnalysis.tsx`
  - `sidecar-template/alpha-exec-engine/src/index.ts`
  - `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
- 구현:
  - `entryFeasible=false`면 `verdictFinal`을 `WAIT`로 강등
  - Sidecar에서 실제 주문 후보 제외
- 커밋 메시지:
  - `feat(exec-guard): enforce entry feasibility in verdict and sidecar payload selection`

체크:
- [ ] 비현실 엔트리 종목 자동 WAIT 처리
- [ ] 실행 후보 품질 지표 개선(체크리스트 기준)
- [ ] false positive 비율 허용 범위 확인

---

## Commit H — Post-Deploy 검증/문서 마감
- 목적: 운영 기준 문서 최종 반영
- 파일:
  - `docs/SIDECAR_3DAY_OBSERVATION_CHECKLIST_2026-03-12.md`
  - `docs/SIDECAR_GO_NO_GO_DECISION_TEMPLATE_2026-03-12.md`
  - `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
  - `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- 커밋 메시지:
  - `docs: finalize exec-realism rollout evidence and go/no-go criteria`

체크:
- [ ] Shadow 기간 증빙 링크 반영
- [ ] Enforcement 전환 기준/실패시 롤백 절차 반영
- [ ] 운영 문서 간 용어 일치

---

## 3) 최적 조건 (권장 기본값)

- Shadow 기간: 최소 3 거래일
- `ENTRY_MAX_DISTANCE_PCT`: 12~15 (초기 15 권장)
- verdict 강등 규칙:
  - `entryFeasible=false` -> `verdictFinal=WAIT`
  - `INVALID_GEOMETRY` -> 강제 제외
- Risk-off 모드에서는 기존 conviction/stop 가드 유지 + feasibility 가드 추가

---

## 4) 리스크와 대응

- 리스크: 초기 payload 수 감소
  - 대응: Shadow 데이터로 임계값 보정 후 Enforcement
- 리스크: 기존 백테스트와 비교 단절
  - 대응: `verdictRaw`/`verdictFinal` 동시 저장으로 비교 가능성 유지
- 리스크: 하위호환 이슈
  - 대응: `finalVerdict` 미러링 유지, 점진 이관

---

## 5) 실행 체크리스트 (운영용)

- [ ] Commit A 완료
- [ ] Commit B 완료 (Shadow 시작)
- [ ] Commit C 완료
- [ ] Commit D 완료
- [ ] Commit E 완료
- [ ] Shadow 3거래일 증빙 완료
- [ ] Commit F 완료 (Gate OFF)
- [ ] Commit G 완료 (Gate ON)
- [ ] Commit H 완료 (문서 마감)

