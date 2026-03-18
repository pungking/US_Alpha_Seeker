# US_Alpha_Seeker v2 종합보고서 보완 우선순위 실행계획 (2026-03-17)

## 0) 분석 범위/방법

- 대상 문서: `docs/US_Alpha_Seeker_초정밀_종합_분석_보고서_v2.md` (총 2,152 lines) 전체.
- 요청사항에 따라 문서 전체를 기준으로, 수집/웹앱/사이드카 3개 영역을 통합 관점으로 재분류.
- 추가로 현재 코드 상태를 교차 점검해, **이미 반영된 항목/미반영 항목/운영 설정 이슈**를 구분.

---

## 1) 핵심 결론 (요약)

현재 병목은 단일 버그가 아니라 아래 4개 축의 결합이다.

1. **AI 입력 계약 붕괴**: Stage6 AI에 핵심 퀀트 문맥이 누락(C2/C3/C5), 병합 시 AI가 quant를 덮어씀(C4).
2. **실행 기하(가격 박스) 왜곡**: Stage5의 52주 기준 OTE/Stop(C9)이 Stage6/exec gate와 시간축이 다름.
3. **리스크 게이트 fail-open**: guard stale 시 무조건 차단 해제(C10).
4. **운영/보안 기술부채 누적**: 하드코딩 키, 업로드 응답 미검증, fallback/trigger 관측성 불일치.

즉, “추천 정확도 + 실전 집행 가능성”을 동시에 올리려면 P0에서 **AI 계약/병합/실행박스/가드**를 먼저 고쳐야 한다.

---

## 2) 현재 코드 기준 즉시 확인 결과 (2026-03-17, 최신 반영 포함)

v2 보고서의 핵심 이슈는 다수 **현재 코드에도 그대로 존재**한다.

- C1 모델명 오류: **반영 완료**. `constants.ts` 기준 모델 계약 중앙화 + free-tier 체인 적용 + workflow vars 연결 완료(운영 로그 1회 최종 확인 필요).
- C2 필드 오타: `services/intelligenceService.ts`에 `ictMetrics?.displacementScore` 존재.
- C3 slimCandidates 누락: 동일 파일 slimCandidates에 `fundamentalScore/technicalScore/compositeAlpha/quantConviction` 미포함.
- C4 점수 대체: `components/AlphaAnalysis.tsx`에서 `safeConviction = aiData.convictionScore || item.convictionScore`.
- C5 verdict 불일치: **코드 반영 완료**. `services/intelligenceService.ts`의 SYSTEM/SCHEMA/BATCH verdict set 단일화 + ingest 정규화 레이어 추가(운영 로그 검증 대기).
- C6 0값 결측 처리: `DeepQualityFilter.tsx`의 `debtVal` 계산이 `allowZero=false`.
- C8 EMA 초기화: `TechnicalAnalysis.tsx`에서 `const ema = [data[0]]`.
- C9 52주 저점 stop: `IctAnalysis.tsx`에서 `ictStopLoss = low52 * 0.985`.
- C10 stale fail-open: `sidecar-template/alpha-exec-engine/src/index.ts` stale 분기 `blocked: false`.

---

## 3) 우선순위별 보완안

## P0 (즉시: 24~72시간) — 실전 오판/미집행 직접 유발

### P0-1. Stage6 AI 입력 계약 정상화 (C2, C3, C5)
- 원인: 필드 오타 + slimCandidates 핵심 필드 누락 + aiVerdict 허용값 불일치.
- 영향: AI가 종목 문맥을 잃고 보수/왜곡된 판정을 반환, verdictConflict 누적.
- 조치:
  - `displacementScore -> displacement` 등 타입 일치.
  - slimCandidates에 `fundamentalScore`, `technicalScore`, `compositeAlpha`, `quantConviction` 추가.
  - `SYSTEM_INSTRUCTION`, `ALPHA_SCHEMA`, `batchPrompt` verdict set 단일화.
- 완료 기준:
  - Stage6 Part2 결과에서 `verdictConflict` 비율 유의미 감소.
  - `executionReason` 분포에서 `blocked_quality_verdict_unusable` 급감.

### P0-2. Conviction 병합 정책 수정 (C4)
- 원인: AI 점수가 quant를 1:1 대체.
- 영향: high-quant 종목이 AI 편향으로 급락(Conviction Cliff).
- 조치:
  - `finalConviction = blend(quant, ai)` + `quant floor(예: 70%)`.
  - fallback/coverage 낮을 때 AI 가중치 자동 축소.
- 완료 기준:
  - `quant>=85` 종목의 최종 conviction 급락 케이스 제거.
  - exec-engine `conviction_below_floor` 스킵률 완화(시장 동일 조건 비교).

### P0-3. Stage5 실행박스 시간축 정합화 (C9)
- 원인: 52주 고저 기반 OTE/Stop을 단기 실행 게이트에 직접 사용.
- 영향: `blocked_stop_too_wide` 반복, 우량 watchlist 과도 누적.
- 조치:
  - [x] Stop: 최근 스윙/ATR 기반으로 교체(코드 반영).
  - [x] OTE: 최근 N봉(예: 60봉) 구조 기반으로 재정의(코드 반영).
  - [x] 데이터 부족 종목은 52주 fallback 유지 + `[C9_GEOMETRY]` 로그 추가.
- 완료 기준:
  - VIST/UTHR류의 `stop_too_wide` 비중 유의미 감소.
  - `WAIT_PRICE`와 `EXECUTABLE_NOW` 분포가 시장 상황에 맞게 이동.

### P0-3b. C9 확장안(Adaptive Tier Overlay) — 단계적 적용
- 배경: 최신 백테스트 제안에서 `displacement × ictPos` 조합이 선별 성능 개선 후보로 반복 제시됨.
- 원칙: **C9(실행 기하) 본체는 유지**하고, Stage6 선별 레이어에서만 overlay 적용(전면 교체 금지).
- 조치:
  - [x] Tier1(Primary): `displacement > 55 && ictPos > 0.85` (코드 반영)
  - [x] Tier2(Secondary): `trendAlignment in [BULLISH, POWER_TREND] && ictScore > 55` (코드 반영)
  - [x] 기존 하드 게이트(`RR/stop/event/conviction`) 그대로 유지
  - [x] `PREMIUM` 일괄 패널티는 조건부로 완화(고 displacement 종목 예외 허용)
  - [x] sidecar summary에 `tier/displacement/ictPos` 메타데이터 출력 추가
- 검증 기준:
  - [ ] 10/20-trade shadow run에서 기존 대비 EV/손실/skip reason 비교표 확보
  - [ ] 거래수 극소(`n<15`) 구간 결과는 “탐색 신호”로만 취급(운영 확정치로 사용 금지)

### P0-4. Guard stale fail-open 제거 (C10)
- 원인: stale이면 무조건 `blocked=false`.
- 영향: 최신 가드 상태 없을 때 신규 진입이 열릴 수 있음.
- 조치:
  - stale 시 마지막 레벨(L2+) 보수 유지(`blocked=true`) 또는 fail-safe 정책화.
- 완료 기준:
  - stale + 위험 레벨 조합에서 신규 진입 차단 검증 로그 확보.

### P0-5. 즉시 보안 차단 (5-A~5-D)
- 원인: 키/토큰/챗ID 하드코딩.
- 영향: 계정 탈취, API 남용, 비용/신뢰도 리스크.
- 조치:
  - 키 폐기/재발급.
  - 코드 하드코딩 제거, `import.meta.env`/Actions Secret 일원화.
- 완료 기준:
  - 정적 스캔에서 평문 키 0건.

---

## P1 (1주) — 데이터 무결성/신호 품질 안정화

### P1-1. Stage2/3/4 계산식 정합성 (C6, C7, C8, H3, H7, H8)
- debtToEquity=0 결측 오처리 수정.
- ROIC 계산 시 절대 부채 우선.
- EMA/ADX 표준화(Wilder 포함).
- PEG 단위 스케일 자동 감지.
- KC 승수/TTM squeeze 파라미터 기준 정리.

### P1-2. RISK_OFF 점수 정규화 (H1)
- [x] 가중치 합 1.10 -> 정규화(합=1.0) 반영.
- [x] `compositeAlpha` calibration guard(0~100 clamp) 추가로 분포 안정화.
- [ ] 동적 가중치(VIX/시장폭/금리 연동)는 20-trade 샘플 확보 후 P2 후보로 이동.

### P1-3. 업로드/응답 검증 강제 (H5, 4-D)
- Drive upload, Perplexity response에 `res.ok`/payload 검증 강제.
- 실패 시 “무음 성공” 제거.

### P1-4. Stage4 fallback 실제 연결 (H10)
- `fetchCandlesFromAPI` 정의만 있고 미사용 상태 해소.
- Drive 결손 시 API fallback 경로 실제 호출.

### P1-5. 하베스터 예외 투명화 (H9)
- bare except 제거, 예외 타입/원인/티커 단위 로깅.

---

## P2 (2주) — 운영 신뢰성/재현성 강화

### P2-1. 트리거/실행 경로 명확화 (9-B, 9-C)
- `repository_dispatch` vs `schedule` 경로를 summary에 명시.
- trigger hash/file/sourceRun mismatch 시 fail-fast 옵션 추가.

### P2-2. 타임스탬프/타임존 일관화 (H6)
- 파일명/로그/요약의 KST/UTC 혼용 제거.

### P2-3. 토큰/세션 만료 복구 (9-E)
- accessToken 자동 갱신 또는 재인증 유도 UX 명확화.

### P2-4. UI-계약 일치 (4-A, 4-E)
- UI 카운트와 실제 커밋 기준 정렬.
- enum/라벨/설명 텍스트를 계약에 맞춤.

---

## P3 (지속) — 성능/구조 리팩터

### P3-1. 병렬화/캐시 (8-A, 8-E)
- Drive 조회 동시성 제한 병렬 처리.
- 중복 다운로드 캐시(특히 breadth snapshot) 도입.

### P3-2. 메인스레드 블로킹 완화 (8-D)
- Stage2/4 무거운 계산 WebWorker 분리.

### P3-3. 코드 구조화
- Drive I/O 공통 유틸.
- 게이트 판정/사유코드 표준 사전(모듈) 분리.

---

## 4) 실행 순서 권고 (커밋 단위)

1. `fix(stage6-ai-contract): align slimCandidates fields + verdict schema + ictMetrics field names`
2. `fix(stage6-score-merge): blend ai/quant conviction with quant floor guard`
3. `fix(stage5-exec-geometry): replace 52w stop/ote with recent swing + ATR logic`
4. `fix(exec-guard): enforce conservative block on stale L2+ guard state`
5. `chore(security): remove hardcoded secrets and migrate to env-only config`
6. `fix(core-indicators): debt zero handling + ROIC + EMA/ADX/PEG normalization`
7. `fix(stage4-fallback): wire candle API fallback when drive candles missing`
8. `chore(observability): standardize trigger/summary/timezone and response validation`

참고: C1(모델명/체인)은 선반영 완료 상태로, 위 실행순서에서 제외.

---

## 5) 테스트/검증 게이트 (우선순위별)

### P0 검증
- Stage6 1회 + sidecar 1회로 아래 확인:
  - `verdictConflict`, `blocked_quality_*`, `blocked_stop_too_wide` 분포 변화
  - `execution_contract` 필드 null 여부
  - stale guard 시 `blocked` 동작

### P1 검증
- 고정 샘플(최근 3일 Stage5 lock) 재실행:
  - C6/C7/C8/H3 지표 값 비교표 생성(이전 vs 이후)
  - Stage4 결손 종목에서 API fallback 실제 작동 확인

### P2 검증
- dispatch/schedule 각각 1회:
  - summary에 trigger/source/hash 명시 여부
  - timezone 포맷 일관성

---

## 6) “보고서(v2) 자체” 보완 권고

문서 품질은 높지만, 개발 실행력을 더 높이려면 아래 4개를 추가하면 좋다.

1. **각 버그별 재현 절차 3줄 표준화**
   - 입력 파일
   - 실행 단계
   - 기대/실제 차이

2. **가설/확정 분리**
   - “확정(코드/로그 근거 있음)” vs “추정(데이터 추가 필요)” 태그.

3. **수정 후 성공 판정 지표 명시**
   - 예: `blocked_stop_too_wide 비중 < 10%`, `verdictConflict < 20%`.

4. **라인번호 변동 대비 앵커 키워드 병기**
   - 라인번호 + 함수명/키워드 같이 기록(리팩터 후 추적성 유지).

---

## 7) 최종 우선순위 요약 (한 줄)

**지금은 P0(계약/병합/실행박스/가드/보안) 먼저 끝내고, 그 다음 P1 지표정합으로 들어가는 순서가 가장 빠르고 안전하다.**
