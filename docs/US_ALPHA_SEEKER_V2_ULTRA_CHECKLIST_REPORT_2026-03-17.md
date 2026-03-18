# US Alpha Seeker v2 초정밀 체크리스트 리포트

작성일: 2026-03-17  
기준문서: `docs/US_Alpha_Seeker_초정밀_종합_분석_보고서_v2.md`

---

## 0) 결론: 진행 순서

네 생각(수집 → 웹앱 → 사이드카) **맞다**.  
다만 더 안전하게는 아래 순서가 최적:

1. **수집/데이터 정합 계층** (Stage0~5 + Harvester)  
2. **웹앱 분석/선정 계층** (Stage6 + UI/리포트)  
3. **사이드카 실행 계층** (exec-engine + market guard)  
4. **통합 E2E 검증**

핵심 이유: 앞단 데이터 품질이 고정되지 않으면 뒤단(선정/실행)을 고쳐도 다시 흔들린다.

---

## 1) 공통 운영 규칙 (필수)

- [ ] 항목 1개 = 커밋 1개 원칙
- [ ] 각 커밋마다 “검증 근거 파일/로그” 1개 이상 남기기
- [ ] 크레딧 절약: 단계별 단일 테스트 후 다음 단계 진행
- [ ] 하드코딩 키/토큰은 즉시 제거(보안 항목 우선)
- [ ] 결과 판단은 “로그 + 산출 JSON”으로만 한다 (화면만 보고 판정 금지)

---

## 2) Layer A — 수집/데이터 정합 체크리스트 (Stage0~5 + Harvester)

## A-1. P0 (즉시)

- [x] **C9** `IctAnalysis.tsx`: `ictStopLoss`/`otePrice` 52주 기준 제거, 최근 스윙+ATR 기반으로 교체 (코드 반영, 운영 검증 대기)
- [x] **H1** `IctAnalysis.tsx`: RISK_OFF 가중치 합 1.10 정규화(합=1.0) + compositeAlpha calibration(0~100 clamp) 반영
- [ ] **C6** `DeepQualityFilter.tsx`: `debtToEquity=0` 결측 처리 제거 (`allowZero=true`)
- [ ] **C7** `FundamentalAnalysis.tsx`: ROIC 계산식 절대 부채 기준 우선
- [ ] **C8** `TechnicalAnalysis.tsx`: EMA 초기화 SMA 방식으로 수정
- [ ] **H10** `TechnicalAnalysis.tsx`: Drive miss 시 `fetchCandlesFromAPI()` 실제 fallback 연결
- [ ] **H9** `harvester.py`: bare except 제거 + 실패 원인 로깅
- [ ] **H5** Stage0/1/2/3/4/5 업로드 응답 `res.ok` 검증 강제

## A-2. P1 (1주)

- [ ] **H3** PEG ratio 단위 스케일 자동 감지
- [ ] **H7/H8** ADX Wilder/TTM Squeeze 파라미터 표준화
- [ ] **H6** KST 파일명 생성 로직(`toISOString`) 정리
- [ ] Drive 검색에 parent folder 제한 추가 (오탐 파일 방지)

## A-3. Layer A 완료 기준 (DoD)

- [ ] Stage0~5 각 산출 파일 1회씩 정상 생성
- [ ] Stage5 Top50에서 `blocked_stop_too_wide` 비중 유의미 감소
- [ ] Harvester 실패 종목은 원인 로그가 남음(“FAILED” 단일 문자열 금지)

### A-4. H1 반영 메모 (2026-03-18)

- [x] `STRATEGY_CONFIG`에 RISK_OFF 정규화 가중치(`RISK_OFF_FUND_WEIGHT`, `RISK_OFF_TECH_WEIGHT`, `RISK_OFF_ICT_WEIGHT`) 추가
- [x] `components/IctAnalysis.tsx` RISK_OFF 산식 정규화 적용(합=1.0)
- [x] `compositeAlpha` calibration 적용(`ALPHA_SCORE_MIN/MAX`, 0~100 guard clamp)
- [x] `compositeBreakdown`에 `calibrationApplied`, `calibrationDelta` 추적 필드 추가
- [ ] **동적 가중치(후속)**: VIX/시장폭/금리 기반 자동 가중치 엔진은 20-trade 루프 데이터 확보 후 P1-2에서 재개

---

## 3) Layer B — 웹앱 분석/선정 체크리스트 (Stage6)

## B-1. P0 (즉시)

- [x] **C2** `intelligenceService.ts`: `ictMetrics` 필드명 오타/타입 정합 (코드 반영)
- [x] **C3** slimCandidates에 `fundamentalScore/technicalScore/compositeAlpha/quantConviction` 추가 (코드 반영)
- [x] **C5** aiVerdict 허용값 3곳 통일 + 정규화 레이어 추가 (SYSTEM/SCHEMA/BATCH)
- [x] **C4** conviction 병합 정책: AI 단일 대체 금지, quant floor 포함 블렌딩 (코드 반영)
- [x] **C1** Gemini 모델명 실존값으로 교체 (Stage1/Stage6 공통)
- [ ] **H2** PREMIUM 자동 강등 규칙 완화(조건부 페널티)
- [ ] **H4** `engineFallbackUsed`: `SHARDED` 오탐 제거

### B-1-1. C1 반영 내역 (완료)

- [x] `constants.ts` 모델 계약 중앙화 + 레거시 alias 정규화 적용
- [x] 기본 체인 free-tier 안전값 적용 (`gemini-3-flash` → `gemini-2.5-flash` → `gemini-2.5-flash-lite`)
- [x] `components/PreliminaryFilter.tsx` Stage1 단일 모델 하드코딩 제거, `GEMINI_MODELS.CHAIN` 사용
- [x] `services/intelligenceService.ts` Stage6 단일 모델 하드코딩 제거, `GEMINI_MODELS.CHAIN` 사용
- [x] `.github/workflows/schedule.yml`에 `GEMINI_*` + `VITE_GEMINI_*` vars 연결
- [ ] 운영 검증 1회: Stage1 로그에서 실제 시도 모델명이 free-tier 체인 순서로 출력되는지 확인

### B-1-2. C5 반영 내역 (코드 완료, 운영 검증 대기)

- [x] `services/intelligenceService.ts` verdict 계약 단일화 (`STRONG_BUY|BUY|HOLD|PARTIAL_EXIT|SPECULATIVE_BUY`)
- [x] `batchPrompt`의 `WATCH` 제거, `WATCH/WAIT -> HOLD` 지침 명시
- [x] `hydrateAndValidate()`에 verdict 정규화 레이어 추가 (`aiVerdictRaw`, `aiVerdictNormalized`, `aiVerdictNormalizationReason`)
- [ ] 운영 검증 1회: `blocked_quality_verdict_unusable` 감소 및 Stage6/sidecar 요약 계약 일치 확인

### B-1-3. C2/C3 반영 내역 (코드 완료, 운영 검증 대기)

- [x] `services/intelligenceService.ts` slimCandidates에 `fundamentalScore`, `technicalScore`, `compositeAlpha`, `quantConviction` 전달
- [x] `services/intelligenceService.ts` `ictMetrics.displacement`를 `displacement ?? displacementScore`로 정규화
- [ ] 운영 검증 1회: Stage6 Part2에서 verdictConflict/quality 차단 사유 분포 개선 여부 확인

### B-1-4. C4 반영 내역 (코드 완료, 운영 검증 대기)

- [x] `components/AlphaAnalysis.tsx` conviction 병합을 `AI 단일 대체`에서 `동적 가중 블렌딩`으로 변경
- [x] quant floor(70%) 적용으로 Conviction Cliff 방지 (`convictionFloor`, `convictionFloorApplied` 추적 필드 추가)
- [x] Final Gate의 `rawConvictionScore` 기준을 `item.rawConvictionScore` 우선으로 교정
- [ ] 운영 검증 1회: `blocked_quality_conviction_floor`/`verdictConflict`/실행 가능 종목 분포 개선 여부 확인

### B-1-5. C9 확장(Adaptive Tier Overlay) 반영 계획

- [ ] Tier1(Primary): `displacement > 55 && ictPos > 0.85` 선별 조건 추가
- [ ] Tier2(Secondary): `trendAlignment in [BULLISH, POWER_TREND] && ictScore > 55` 보조 조건 추가
- [ ] 기존 Stage6 하드게이트(`RR/stop/event/conviction`) 유지
- [ ] `PREMIUM` 일괄 강등 로직을 조건부 페널티로 전환
- [ ] sidecar report에 `tier/displacement/ictPos` 표시(추천-실행-추적 계약 일치)
- [ ] 10/20-trade shadow run 결과가 확보되기 전까지는 “탐색 모드”로 운영

## B-2. P1 (1주)

- [ ] Stage6 decision reason/label 계약 정리(한글화 포함)
- [ ] execution_contract null 필드 방지(필수 가격 필드 non-null)
- [ ] UI에서 Executable Picks / Watchlist 분리 표시 유지

## B-3. Layer B 완료 기준 (DoD)

- [ ] Stage6 Part2에서 `verdictConflict` 비율 감소
- [ ] Stage6 Final에서 `blocked_quality_verdict_unusable` 감소
- [ ] Stage6 Final JSON에 실행 후보 가격 박스 필드 null 없음
- [ ] C1 운영 검증 로그 확보(모델명/체인/폴백 사유 확인 가능)

---

## 4) Layer C — 사이드카 실행 체크리스트 (exec-engine + market-guard)

## C-1. P0 (즉시)

- [ ] **C10** stale guard fail-open 제거 (stale + L2+ 시 보수적 차단)
- [ ] Stage6 dispatch trigger hash/file/sourceRun 검증 로깅 유지
- [ ] dedupe 이유/skip reason 분포 summary 출력 유지

## C-2. P1 (1주)

- [ ] `minConviction` 운영전략 재검토(실전/가속 배치 분리 정책)
- [ ] preflight/guard_control 결과를 summary에 일관 출력
- [ ] perf loop gate 진행률(예: `1/20`) 계속 추적

## C-3. Layer C 완료 기준 (DoD)

- [ ] sidecar summary에 trigger/source/hash 확인 가능
- [ ] stale guard 상황에서 정책대로 block/unblock 동작 일치
- [ ] payload=0일 때 skip reason 원인 자동 표기

---

## 5) 보안 체크리스트 (병렬 즉시)

- [ ] constants/컴포넌트 하드코딩 키 제거
- [ ] 유출 키 전면 폐기 + 재발급
- [ ] `import.meta.env` / GitHub Secrets로 단일화
- [ ] 로컬/레포 `.env*` 커밋 방지 재점검

---

## 6) 통합 E2E 검증 시나리오 (최종)

- [ ] Stage0~6 1회 실행 (동일 날짜)
- [ ] Stage6 결과 hash 기준 sidecar repository_dispatch 1회 자동 실행
- [ ] sidecar-state 아티팩트에서 아래 확인:
  - [ ] `trigger: repository_dispatch`
  - [ ] `trigger_stage6: hash/file/sourceRun`
  - [ ] `payload/skipped`, `skip_reasons`
  - [ ] `stage6_contract`/`preflight`/`guard_control`
- [ ] Telegram/리포트 문구와 JSON 계약 필드 불일치 없는지 확인

---

## 7) 커밋 템플릿 (권장)

- `fix(stage5): replace 52w ict stop/ote with swing+atr execution geometry`
- `fix(stage6): align ai input contract and verdict schema consistency`
- `fix(stage6): blend quant-ai conviction with quant floor guard`
- `fix(exec-guard): enforce conservative stale guard for L2+ states`
- `chore(security): migrate hardcoded secrets to env and rotate leaked keys`

---

## 8) 진행 상태판

- Layer A(수집): [ ] 시작전 / [ ] 진행중 / [ ] 완료
- Layer B(웹앱): [ ] 시작전 / [ ] 진행중 / [ ] 완료
- Layer C(사이드카): [ ] 시작전 / [ ] 진행중 / [ ] 완료
- 통합 E2E: [ ] 시작전 / [ ] 진행중 / [ ] 완료

---

이 문서는 “완전한 최강 프로그램”을 위한 실행용 체크리스트다.  
우선순위는 반드시 A → B → C → E2E 순으로 지킨다.
