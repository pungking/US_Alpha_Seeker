# US_Alpha_Seeker 초정밀 종합 분석 보고서 v2.0

Doc-Tier: P0 (Control Tower)


**분석일**: 2026-03-17 KST | **분석 대상**: US_Alpha_Seeker (3 repos) | **GPT-Codex 검증용**

> 이 보고서는 5개의 정밀 분석 파일을 통합·종합한 최종 보고서입니다.  
> 모든 라인 번호, 변수명, 파일명은 원본 코드 기준입니다.  
> GPT-Codex가 즉시 코드 수정에 착수할 수 있는 수준의 정밀도로 작성되었습니다.

> 2026-03-21 업데이트: H11/H13 최종 종료 체크리스트는 `docs/H11_H13_CLOSURE_CHECKLIST_2026-03-21.md`를 기준으로 합니다.
>
> 2026-03-21 업데이트: H8/H10 + Sidecar A/B 종료 체크리스트는 `docs/H8_H10_AND_SIDECAR_AB_CLOSURE_2026-03-21.md`를 기준으로 합니다.
>
> 2026-03-23 업데이트(재검증): 4-G/4-H/5-A는 코드 기준 완료 상태로 재확인되었습니다. 최신 E2E 기준 해시는 `STAGE6_ALPHA_FINAL_2026-03-23_12-11-31.json` / `770d850001e2`이며 Sidecar 요약과 해시가 일치합니다. 현재 잔여 작업은 **M-UI-4 문구 품질**, **5-D(클라이언트 ID 저장 정책 정리)**, **perf_loop 표본 11/20→20/20 달성**입니다.

---

## 목차

1. [파이프라인 전체 흐름도](#1-파이프라인-전체-흐름도)
2. [🚨 CRITICAL 버그 (즉시 수정 필요)](#2--critical-버그-즉시-수정-필요)
3. [🔶 HIGH 버그 (데이터 품질/신뢰성)](#3--high-버그-데이터-품질신뢰성)
4. [🔷 MEDIUM/LOW 버그](#4--mediumlow-버그)
5. [🔒 보안 취약점](#5--보안-취약점)
6. [Conviction Score Cliff 루트 코즈 분석](#6-conviction-score-cliff-루트-코즈-분석)
7. [테스트 데이터 교차검증 결과](#7-테스트-데이터-교차검증-결과)
8. [성능 최적화 포인트](#8-성능-최적화-포인트)
9. [인프라/배포 이슈](#9-인프라배포-이슈)
10. [decisionGate 전체 임계값 테이블](#10-decisiongate-전체-임계값-테이블)
11. [최종 실행 결과 추적](#11-최종-실행-결과-추적)
12. [수정 우선순위 로드맵](#12-수정-우선순위-로드맵)

---

## 1. 파이프라인 전체 흐름도

### 1-A. 전체 데이터 흐름 (ASCII 다이어그램)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     US_Alpha_Seeker 전체 파이프라인                              │
└─────────────────────────────────────────────────────────────────────────────────┘

  [Stage 0: UniverseGathering.tsx]
  Google Drive (A~Z_stocks_daily.json × 26파일)
         │  processCylinderData() — 28개 필드 매핑
         │  파일: STAGE0_MASTER_UNIVERSE_{KST}.json
         │  키: symbol (MasterTicker[])
         ▼
  총 6,822종목

  [Stage 1: PreliminaryFilter.tsx]
  필터: price ≥ AI추천가($4), volume ≥ AI추천량×SmallCap보정,
        PE>0, ROE>0, targetMeanPrice>0
  AI폴백: Gemini Pro(80s) → Gemini Flash(30s) → Perplexity(15s)
         │  파일: STAGE1_PURIFIED_UNIVERSE_{KST}.json
         │  키: investable_universe[].symbol
         ▼
  1,432종목

  [Stage 2: DeepQualityFilter.tsx]
  퀀트 스코어링: qualityScore = profitScore×0.4 + debtScore×0.3 + valueScore×0.3
  통과조건: qualityScore > 35
  동적 선발: Bear=150개, Neutral=300개, Bull=450개
         │  파일: STAGE2_ELITE_UNIVERSE_{KST}.json
         │  키: elite_universe[].symbol
         ▼
  300종목

  [Stage 3: FundamentalAnalysis.tsx]
  financialEngineering: ROIC, FScore, Rule of 40, Graham내재가치
  fundamentalScore = valScore×0.40 + safetyScore×0.30 + qualScore×0.20 + growthScore×0.10
  compositeAlpha(Stage3) = qualityScore×0.3 + fundamentalScore×0.7
  GitHub Dispatch → Harvester 트리거
         │  파일: STAGE3_FUNDAMENTAL_FULL_{KST}.json
         │  키: fundamental_universe[].symbol
         ▼
  300종목 (enriched)

  [Harvester: harvester.py — GitHub Actions]
  yfinance로 300종목 OHLCV 수집 (period=2y, 최대500봉)
  벤치마크: ^GSPC, ^IXIC, ^VIX
  MARKET_REGIME_SNAPSHOT.json, EARNINGS_EVENT_MAP.json 생성
  LATEST_STAGE4_READY.json으로 Stage 4 트리거
         │  파일: {TICKER}_OHLCV.json (per ticker)
         │  키: LATEST_STAGE4_READY.json.trigger_file
         ▼
  300 OHLCV 파일

  [Stage 4: TechnicalAnalysis.tsx]
  기술지표: RSI(14), MACD(12,26,9), ADX(14), MFI(14), BB(20), KC(20), TTM Squeeze
  Minervini Template(8조건), RS Rating(63봉), RVOL(log2 스케일)
  technicalScore = rsRating×0.4 + PowerTrend보너스 + RVOL보너스 + Squeeze보너스 + SignalOverlay
  Macro Overlay(-10~+8) + EventRisk Overlay 적용
         │  파일: STAGE4_TECHNICAL_FULL_{KST}.json
         │  키: technical_universe[].symbol
         ▼
  300종목 (technical enriched)

  [Stage 5: IctAnalysis.tsx]
  ICT 스코어링: Displacement(0.25) + MSS(0.20) + LiquiditySweep(0.15) + OB(0.15) + SmFlow(0.25)
  PD-Array: DISCOUNT(<0.45) / EQUILIBRIUM(0.45~0.55) / PREMIUM(>0.55)
  compositeAlpha(RISK_OFF) = fund×0.70 + tech×0.30 + ict×0.10  [가중치합 1.10 — 버그!]
  compositeAlpha(RISK_ON)  = fund×0.20 + tech×0.30 + ict×0.50
  SectorDiversification 페널티 + Sparse Guard(< 60봉 제한)
  OTE = high52 - (range × 0.705)
  ictStopLoss = low52 × 0.985
         │  파일: STAGE5_ICT_ELITE_50_{KST}.json
         │  키: ict_universe[].symbol
         ▼
  50종목

  [Stage 6 Part1: AlphaAnalysis.tsx — runStage1()]
  sortScore/convictionScore 19단계 보정
  PREMIUM → sortScore -= 50, convictionScore는 패널티 없음 (버그!)
  enrichAllCandidates(): Finnhub profile/news/quote 보강
         │  파일: STAGE6_PART1_SCORED_{KST}.json
         │  키: [](top-level list)
         ▼
  12종목

  [Stage 6 Part2: AlphaAnalysis.tsx — runStage2()]
  intelligenceService.ts → slimCandidates (fundamentalScore 누락 — 버그!)
  AI: Gemini(batchSize=25) → 실패 시 Perplexity(shard=6개씩)
  hydrateAndValidate(): AI convictionScore로 quant 완전 대체 (버그!)
  Final Gate(19조건) → decisionGate(19조건)
         │  파일: STAGE6_PART2_AI_RESULT_FULL_{KST}.json
         │  키: [](top-level list)
         ▼
  12종목 AI 분석 완료

  [Stage 6 Final: AlphaAnalysis.tsx — runStage3()]
  modelTop6Pool: finalSelectionScore 기준 상위 6개
  executablePool: executionBucket=EXECUTABLE 상위 2개
  watchlistPool: modelTop6 중 WATCHLIST
         │  파일: STAGE6_ALPHA_FINAL_{KST}.json
         │  키: execution_contract.executablePicks + modelTop6
         ▼
  6개 (model) + 2개 (exec)

  [Exec Engine: index.ts — alpha-exec-engine repo]
  12단계 Gate: Actionable → Conviction(78) → Price → Geometry → Stop → Feasibility → Capacity → Validation → Idempotency → Preflight → RegimeGuard → GuardControl
  Market Guard: VIX L0~L3 레벨 감지 (market-guard.ts)
         │  결과: dry-exec-preview.json
         ▼
  실행 or 차단
```

### 1-B. 스테이지 간 연결 파일 및 키 정리

| 전환 | 연결 파일 | 키 필드 | 비고 |
|------|-----------|---------|------|
| Stage 0 → Stage 1 | `STAGE0_MASTER_UNIVERSE_*.json` | `universe[].symbol` | Drive 쿼리로 최신 파일 |
| Stage 1 → Stage 2 | `STAGE1_PURIFIED_UNIVERSE_*.json` | `investable_universe[].symbol` | Drive 쿼리로 최신 파일 |
| Stage 2 → Stage 3 | `STAGE2_ELITE_UNIVERSE_*.json` | `elite_universe[].symbol` | 최신 5개 중 유효 파일 |
| Stage 3 → Harvester | GitHub Actions `repository_dispatch` | `client_payload.trigger_file` | `STAGE3_FUNDAMENTAL_FULL_*.json` |
| Harvester → Stage 4 | `LATEST_STAGE4_READY.json` | `trigger_file` | 트리거 파일명 매칭 확인 |
| Stage 4 → Stage 5 | `STAGE4_TECHNICAL_FULL_*.json` | `technical_universe[].symbol` | Drive 쿼리 |
| Stage 5 → Stage 6 | `STAGE5_ICT_ELITE_50_*.json` | `ict_universe[].symbol` | Drive 쿼리 |
| Stage 6 → Exec Engine | `STAGE6_ALPHA_FINAL_*.json` | `execution_contract.executablePicks` | Drive 쿼리, modifiedTime desc |

---

## 2. 🚨 CRITICAL 버그 (즉시 수정 필요)

> **Phase 1 최우선 수정 대상 — Stage 6 정확도에 직결됨**

---

### C1: Gemini 모델명 오류

| 항목 | 내용 |
|------|------|
| **파일** | `components/PreliminaryFilter.tsx` |
| **라인** | L316, L330 |
| **심각도** | CRITICAL |
| **현상** | Stage 1 AI 분석 시 Gemini가 항상 실패하여 Perplexity 폴백만 사용됨 |
| **원인** | 존재하지 않는 Gemini 모델명 사용 |

**버그 코드:**
```typescript
// PreliminaryFilter.tsx L316
model: 'gemini-3.1-pro-preview'  // ← 존재하지 않는 모델명

// PreliminaryFilter.tsx L330
model: 'gemini-3-flash-preview'  // ← 존재하지 않는 모델명
```

**동일 버그 위치 (intelligenceService.ts):**
```typescript
// intelligenceService.ts L1085 (Gemini 내부 폴백)
gemini-3.1-pro-preview → gemini-3-flash-preview  // 둘 다 존재하지 않음
```

**영향:**
- Stage 1: AI 분석이 항상 Perplexity 폴백으로 실행 → 80s + 30s 타임아웃 낭비 후 Perplexity 사용
- Stage 6: 마찬가지로 Gemini AI 분석 불가능, 전체 AI 결과가 Perplexity 품질에 의존
- 실제 파이프라인 실행 결과: `engineFallbackUsed: True`, `engineFallbackPath: Google Gemini → Perplexity`

**해결 코드:**
```typescript
// PreliminaryFilter.tsx L316 수정
model: 'gemini-2.0-pro-exp'  // 또는 'gemini-1.5-pro'

// PreliminaryFilter.tsx L330 수정
model: 'gemini-2.0-flash'  // 또는 'gemini-1.5-flash'

// intelligenceService.ts — Gemini 모델명 동기화
const GEMINI_PRIMARY_MODEL = 'gemini-2.0-pro-exp';
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash';
```

---

### C2: ictMetrics.displacementScore 오타

| 항목 | 내용 |
|------|------|
| **파일** | `services/intelligenceService.ts` |
| **라인** | L589 |
| **심각도** | CRITICAL |
| **현상** | AI에 전달되는 displacement 값이 항상 0 |
| **원인** | 실제 필드명은 `displacement`인데 `displacementScore`로 참조 |

**버그 코드:**
```typescript
// intelligenceService.ts L575-597 (slimCandidates 생성)
ictMetrics: {
    displacement: c.ictMetrics?.displacementScore || 0,  // ← 'displacementScore' 필드 없음!
    liquiditySweep: c.ictMetrics?.liquiditySweep || false,  // ← 실제는 number, false 기본값 오류
    marketStructure: c.ictMetrics?.marketStructure || 'Neutral',  // ← 실제는 number
    ...
}
```

**IctScoredTicker 타입의 실제 필드명:**
- `ictMetrics.displacement` (number) — `displacementScore` 아님
- `ictMetrics.liquiditySweep` (number) — boolean 아님
- `ictMetrics.marketStructure` (number) — string 아님

**영향:**
- AI가 displacement=0을 받아 모든 종목의 모멘텀을 0으로 판단
- 결과적으로 AI가 모든 종목에 보수적 평가 → convictionScore 하락
- Conviction Cliff 원인 체인의 3단계에 해당

**해결 코드:**
```typescript
// intelligenceService.ts L589 수정
ictMetrics: {
    displacement:     c.ictMetrics?.displacement      ?? 0,  // ← 수정
    liquiditySweep:   c.ictMetrics?.liquiditySweep    ?? 0,  // ← 수정
    marketStructure:  c.ictMetrics?.marketStructure   ?? 0,  // ← 수정
    orderBlock:       c.ictMetrics?.orderBlock        ?? 0,
    smartMoneyFlow:   c.ictMetrics?.smartMoneyFlow    ?? 0,
}
```

---

### C3: slimCandidates에 fundamentalScore/technicalScore/compositeAlpha 누락

| 항목 | 내용 |
|------|------|
| **파일** | `services/intelligenceService.ts` |
| **라인** | L575-597 |
| **심각도** | CRITICAL |
| **현상** | AI가 퀀트 파이프라인의 종합 점수를 전혀 모른 채 독립 평가 |
| **원인** | slimCandidates 생성 시 핵심 3개 점수 필드 미포함 |

**버그 코드:**
```typescript
// intelligenceService.ts L575-597
const slimCandidates = candidates.map(c => ({
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    pe: c.pe,
    roe: c.roe,
    revenueGrowth: c.revenueGrowth,
    sector: c.sector,
    pdZone: c.pdZone,
    otePrice: c.otePrice,
    ictStopLoss: c.ictStopLoss,
    marketState: c.marketState,
    ictMetrics: { ... },
    ictScore: c.ictScore
    // ← fundamentalScore 없음!!
    // ← technicalScore 없음!!
    // ← compositeAlpha 없음!!
    // ← convictionScore 없음!!
}));
```

**영향:**
- AI는 퀀트 모델이 종목을 얼마나 높이 평가했는지 알 수 없음
- KTB(quantConviction=92)가 AI에 의해 57로 재평가됨
- PDD(quantConviction=96)가 AI에 의해 31로 재평가됨
- Conviction Score Cliff의 근본 원인

**해결 코드:**
```typescript
// intelligenceService.ts L575-597 수정
const slimCandidates = candidates.map(c => ({
    symbol: c.symbol,
    name: c.name,
    price: c.price,
    pe: c.pe,
    roe: c.roe,
    revenueGrowth: c.revenueGrowth,
    sector: c.sector,
    pdZone: c.pdZone,
    otePrice: c.otePrice,
    ictStopLoss: c.ictStopLoss,
    marketState: c.marketState,
    ictMetrics: {
        displacement:   c.ictMetrics?.displacement   ?? 0,  // C2 수정과 연동
        liquiditySweep: c.ictMetrics?.liquiditySweep ?? 0,
        marketStructure:c.ictMetrics?.marketStructure?? 0,
    },
    ictScore:        c.ictScore,
    fundamentalScore: c.fundamentalScore,  // ← 추가
    technicalScore:   c.technicalScore,    // ← 추가
    compositeAlpha:   c.compositeAlpha,    // ← 추가
    quantConviction:  c.convictionScore,   // ← 추가 (AI에 참고값 제공)
}));
```

---

### C4: AI convictionScore가 quant 점수를 완전 대체

| 항목 | 내용 |
|------|------|
| **파일** | `components/AlphaAnalysis.tsx` |
| **라인** | L2933 |
| **심각도** | CRITICAL |
| **현상** | quant 점수 92인 종목이 AI가 57을 반환하면 57로 교체 |
| **원인** | 병합 정책에서 AI convictionScore가 quant을 무조건 대체 |

**버그 코드:**
```typescript
// AlphaAnalysis.tsx L2933
const safeConviction = aiData
    ? Number(aiData.convictionScore || item.convictionScore || 0)
    : Number(item.convictionScore || 0);
// → AI 값이 0이 아닌 한 항상 AI 값이 우선
```

**영향:**
- KTB: quant 92 → AI 72 → final 57 (conv_below_floor로 차단)
- PDD: quant 96 → AI 72 → final 31 (earnings_window로 차단)
- TIGO: quant 99 → AI 45 → final 30 (blocked_verdict_risk_off)
- INVA: quant 99 → AI 45 → final 10 (blocked_verdict_risk_off)
- DAVE: quant 99 → AI 52 → final 13 (blocked_verdict_risk_off)

**해결 코드:**
```typescript
// AlphaAnalysis.tsx L2933 수정
// 퀀트 점수와 AI 점수의 가중 평균 사용
const quantConviction = Number(item.convictionScore || 0);
const aiConviction    = aiData ? Number(aiData.convictionScore || 0) : quantConviction;

// AI가 반환한 경우 가중 평균, 미반환 시 quant 사용
const blendedConviction = aiData && aiConviction > 0
    ? Math.round(quantConviction * 0.4 + aiConviction * 0.6)
    : quantConviction;

const safeConviction = Math.max(blendedConviction, Math.round(quantConviction * 0.7));
// 최소 보장: quant 점수의 70% 이상은 유지
```

---

### C5: Gemini batchPrompt의 aiVerdict 허용값 불일치

| 항목 | 내용 |
|------|------|
| **파일** | `services/intelligenceService.ts` |
| **라인** | L1032 (batchPrompt) vs L235 (ALPHA_SCHEMA) |
| **심각도** | CRITICAL |
| **현상** | Gemini가 WATCH 반환 시 처리 불능 → blocked_quality_verdict_unusable |
| **원인** | 두 프롬프트의 aiVerdict 허용값이 불일치 |

**버그 코드:**
```typescript
// intelligenceService.ts L1032 (Gemini batchPrompt):
// aiVerdict: "BUY" | "HOLD" | "WATCH"  ← batchPrompt에서 지시

// intelligenceService.ts L235 (ALPHA_SCHEMA):
// "STRONG_BUY" | "BUY" | "HOLD" | "PARTIAL_EXIT" | "SPECULATIVE_BUY"
// ← WATCH가 없음!

// intelligenceService.ts L623 (SYSTEM_INSTRUCTION):
// "STRONG_BUY", "BUY", "PARTIAL_EXIT"
// ← WATCH, HOLD 없음!
```

**3-way 불일치 상황:**
| 위치 | 허용값 |
|------|--------|
| SYSTEM_INSTRUCTION (L623) | STRONG_BUY, BUY, PARTIAL_EXIT |
| ALPHA_SCHEMA (L235) | STRONG_BUY, BUY, HOLD, PARTIAL_EXIT, SPECULATIVE_BUY |
| batchPrompt (L1032) | BUY, HOLD, WATCH |

**영향:**
- Gemini가 batchPrompt를 따라 WATCH 반환 → ALPHA_SCHEMA에 없음 → 무시 또는 HOLD로 변환
- HOLD verdict + `REQUIRE_BULLISH_VERDICT=true` → `blocked_quality_verdict_unusable`로 차단
- 실제로 ALL 12 종목 `verdictConflict=True` 관찰됨

**해결 코드:**
```typescript
// intelligenceService.ts L1032 batchPrompt 수정
// aiVerdict 허용값을 ALPHA_SCHEMA와 통일:
`Each object must follow this schema:
{
  "symbol": "string",
  "aiVerdict": "STRONG_BUY" | "BUY" | "HOLD" | "PARTIAL_EXIT" | "SPECULATIVE_BUY",
  // WATCH는 허용하지 않음 — HOLD로 대체
  ...
}`

// SYSTEM_INSTRUCTION (L623)도 동기화:
// "STRONG_BUY", "BUY", "HOLD", "PARTIAL_EXIT", "SPECULATIVE_BUY" 로 확장
```

---

### C6: debtToEquity=0 (무부채)를 결측으로 처리

| 항목 | 내용 |
|------|------|
| **파일** | `components/DeepQualityFilter.tsx` |
| **라인** | L57 |
| **심각도** | CRITICAL |
| **현상** | 무부채 기업(D/E=0)이 부채비율 1.5인 기업보다 낮은 debtScore를 받음 |
| **원인** | `imputeValue()` 함수에서 0을 결측치로 취급 |

**버그 코드:**
```typescript
// DeepQualityFilter.tsx L53-58 (imputeValue 함수)
const imputeValue = (val: any, fallback: number, allowZero: boolean = false): number => {
    const num = Number(val);
    if (isNaN(num) || !isFinite(num)) return fallback;
    if (num === 0 && !allowZero) return fallback; // ← 0을 결측으로 취급!
    return num;
};

// DeepQualityFilter.tsx L57 (debtScore 계산)
const debtVal = imputeValue(rawDebt, isFinancial ? 0.5 : 1.5, false);
// rawDebt=0 (무부채) → debtVal = 1.5 → debtScore = max(0, 100 - 75) = 25
// rawDebt=1.0 (부채 100%) → debtScore = max(0, 100 - 50) = 50
// 무부채 기업이 부채 100% 기업보다 낮은 점수를 받음 — 역전 현상!
```

**해결 코드:**
```typescript
// DeepQualityFilter.tsx L57 수정
const debtVal = imputeValue(rawDebt, isFinancial ? 0.5 : 1.5, true);
//                                                                ↑ allowZero=true로 변경
// rawDebt=0 → debtVal = 0 → debtScore = max(0, 100 - 0) = 100 (무부채 최고점)
// rawDebt=1.0 → debtScore = 50 (정상)

// roe=0도 같은 문제:
const roe = winsorize(imputeValue(item.roe, -5, true), -50, 100);
//                                           ↑ allowZero=true
```

---

### C7: ROIC 공식 오류

| 항목 | 내용 |
|------|------|
| **파일** | `components/FundamentalAnalysis.tsx` |
| **라인** | L184~190 |
| **심각도** | CRITICAL |
| **현상** | 고부채 기업(특히 금융주)의 ROIC가 실제보다 크게 과소 계산됨 |
| **원인** | `investedCapital` 공식에서 debtToEquity 비율을 절대 부채액으로 오해 |

**버그 코드:**
```typescript
// FundamentalAnalysis.tsx L184~190
const investedCapital = totalEquity + (totalDebtRatio * totalEquity);
// totalDebtRatio = debtToEquity 비율 (예: 0.5, 2.0)
// 이 공식 = totalEquity * (1 + debtToEquity) — 근사값

// 올바른 공식: totalEquity + totalDebt (절대 금액)
// 예: totalEquity=1000, totalDebt=2000 → IC=3000
// 현재: totalEquity=1000, debtToEquity=2.0 → IC=3000 (우연히 같음)
// BUT debtToEquity=10 (은행): IC = 1000×11 = 11,000
//   실제: totalEquity=1000, totalDebt=10,000 → IC=11,000 (같음)
//   그러나 debtToEquity가 다른 기준(총자산/자본 등)으로 계산된 경우 오차 발생
```

**해결 코드:**
```typescript
// FundamentalAnalysis.tsx L184~190 수정
const totalDebtAbsolute = data.totalDebt 
    || data.longTermDebt 
    || (totalDebtRatio * totalEquity);  // 절대 부채 데이터 없을 때만 근사

const investedCapital = Math.max(1, totalEquity + totalDebtAbsolute);
const roic = totalEquity > 0 
    ? (netIncome / investedCapital) * 100 
    : (roe * 0.7);  // 데이터 없는 경우 ROE 기반 근사 유지
```

---

### C8: EMA 초기화 오류

| 항목 | 내용 |
|------|------|
| **파일** | `components/TechnicalAnalysis.tsx` |
| **라인** | L383 |
| **심각도** | CRITICAL |
| **현상** | MACD, Signal Line의 초기 수십 개 값이 부정확 |
| **원인** | EMA 초기값으로 SMA 대신 첫 번째 데이터 포인트 사용 |

**버그 코드:**
```typescript
// TechnicalAnalysis.tsx L383
function calculateEMAArray(data: number[], period: number): number[] {
    const ema: number[] = [data[0]];  // ← 첫 값으로 초기화 (오류!)
    // 표준: 첫 period개의 SMA를 초기값으로 사용해야 함
    const multiplier = 2 / (period + 1);
    for (let i = 1; i < data.length; i++) {
        ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    return ema;
}
```

**영향:**
- EMA12, EMA26 모두 영향 → MACD 계산 전체 영향
- Signal Line(EMA9 of MACD)에서 초기 bias 발생
- 특히 30~100개 봉 데이터에서 큰 오차 (500봉+ 에서는 수렴으로 영향 감소)
- MACD histogram이 잘못되면 stage31SignalScore → technicalScore → compositeAlpha 연쇄 오류

**해결 코드:**
```typescript
// TechnicalAnalysis.tsx L383 수정
function calculateEMAArray(data: number[], period: number): number[] {
    if (data.length < period) return data.map(() => data[data.length - 1]);
    
    // 첫 period개의 SMA를 초기값으로 사용 (표준 방식)
    const initialSMA = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const ema: number[] = new Array(period - 1).fill(NaN);
    ema.push(initialSMA);
    
    const multiplier = 2 / (period + 1);
    for (let i = period; i < data.length; i++) {
        ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
    }
    return ema;
}
```

---

### C9: ictStopLoss = low52 × 0.985 — 52주 저점 기반 StopLoss

| 항목 | 내용 |
|------|------|
| **파일** | `components/IctAnalysis.tsx` |
| **라인** | L555 |
| **심각도** | CRITICAL |
| **현상** | PREMIUM 구간 종목 대부분이 `blocked_stop_too_wide`로 차단 |
| **원인** | 52주 저점 기반 손절가로 현재가와의 거리가 20~40%에 달함 |

**버그 코드:**
```typescript
// IctAnalysis.tsx L555
const ictStopLoss = low52 * 0.985;  // 52주 저점 -1.5%
// VIST 예시: 현재가 $56.50, 52주저점 $28.00 → stopLoss = $27.58
// stopDistance = (56.50 - 27.58) / 56.50 = 51.2% → decisionGate MAX 22% 초과 → BLOCKED

// OTE도 같은 문제:
const otePrice = high52 - (range * 0.705);  // L552 — 52주 범위 기반 OTE
```

**실제 차단 결과:**
- VIST: `blocked_stop_too_wide`, stopDistance > 22%, watchlistTop으로 강등
- UTHR: `blocked_stop_too_wide`, stopDistance > 22%, watchlistTop으로 강등

**해결 코드:**
```typescript
// IctAnalysis.tsx L555 수정
// ATR 기반 최근 저점 사용
const atr20 = calculateATR(priceHistory.slice(-20));
const recentLow20 = Math.min(...priceHistory.slice(-20).map(c => c.low));

// ATR 기반 StopLoss (ICT 표준: 최근 스윙저점 - ATR * 1.0)
const ictStopLoss = recentLow20 - (atr20 * 1.0);

// OTE도 52주 범위 대신 최근 60일 스윙 사용:
const recent60High = Math.max(...priceHistory.slice(-60).map(c => c.high));
const recent60Low  = Math.min(...priceHistory.slice(-60).map(c => c.low));
const recent60Range = recent60High - recent60Low;
const otePrice = recent60High - (recent60Range * 0.705);
```

---

### C10: Guard Control Stale 시 항상 unblocked

| 항목 | 내용 |
|------|------|
| **파일** | `exec-engine/index.ts` |
| **라인** | L1387-1396 |
| **심각도** | CRITICAL |
| **현상** | Market Guard가 L2 이상이어도 오래된 경우 차단이 해제됨 |
| **원인** | `stale → blocked=false` 로직으로 마지막 위험 상태 무시 |

**버그 코드:**
```typescript
// exec-engine/index.ts L1387-1396
if (stale) {  // age > maxAgeMin (180분)
    return {
        enforce: true,
        blocked: false,  // ← stale이면 항상 차단 해제!
        reason: `stale(age=${ageMin.toFixed(1)}m>${maxAgeMin}m)`,
        ...
    };
}
```

**실제 상황:**
- `guard-control.json`이 4011분(약 2.8일) 오래됨
- 마지막 상태: Level=2 (`halt_new_entries`)
- 현재 동작: stale이므로 `blocked=false` → Market Guard 차단 무시됨
- 위험: 만약 VEON/KTB conviction이 78 이상이었다면 L2 guard 무시하고 주문이 생성됐을 것

**해결 코드:**
```typescript
// exec-engine/index.ts L1387-1396 수정
if (stale) {
    // 마지막 레벨이 위험 수준(L2+)이면 보수적으로 차단 유지
    const lastLevelDangerous = (level != null && level >= 2);
    return {
        enforce: true,
        blocked: lastLevelDangerous,  // ← L2+ 이면 stale 상태에서도 차단 유지
        reason: `stale(age=${ageMin.toFixed(1)}m>${maxAgeMin}m)${
            lastLevelDangerous ? ',keeping_halt_conservative' : ''
        }`,
        ...
    };
}
```

---

## 3. 🔶 HIGH 버그 (데이터 품질/신뢰성)

---

### H1: RISK_OFF 가중치 합 1.1 (110%)

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/IctAnalysis.tsx` | L607-610 | `compositeAlpha` RISK_OFF 가중치 |

**버그 코드:**
```typescript
// IctAnalysis.tsx L607-610 (RISK_OFF 모드)
composite = fundamentalScore * 0.70
          + technicalScore  * 0.30
          + ictScore        * 0.10
// 합계 = 1.10 (110%) — 정규화 없음!
```

**영향:** RISK_OFF 환경(현재 VIX 27.19)에서 compositeAlpha가 최대 110점이 될 수 있음. 비교 기준이 무너지고 RISK_OFF 종목이 상대적으로 과대평가됨.

**해결 코드:**
```typescript
// IctAnalysis.tsx L607-610 수정
composite = (fundamentalScore * 0.70 + technicalScore * 0.30 + ictScore * 0.10) / 1.10;
// 또는 가중치를 0.636, 0.273, 0.091로 정규화
```

---

### H2: PREMIUM 자동 다운그레이드 지시 (강경 규칙)

| 파일 | 라인 | 변수 |
|------|------|------|
| `services/intelligenceService.ts` | L612 | `SYSTEM_INSTRUCTION` |

**버그 코드:**
```
// intelligenceService.ts L612 (SYSTEM_INSTRUCTION 내 지시문)
"IF 'pdZone' is 'PREMIUM' (Expensive) -> Automatic Downgrade, regardless of fundamentals."
```

**영향:** Stage 5 기준 56%의 종목이 PREMIUM. AI가 모든 PREMIUM 종목을 무조건 하향 평가 → Conviction Cliff 원인 체인의 2단계.

**해결 코드:**
```
// intelligenceService.ts L612 수정
"IF 'pdZone' is 'PREMIUM': Apply caution. Reduce conviction by up to 15 points based on 
 entry risk, but do NOT automatically downgrade if fundamentals are strong (fundamentalScore > 70)."
```

---

### H3: PEG Ratio 계산 오류

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/UniverseGathering.tsx` | L684-686 | `pegRatio` |

**버그 코드:**
```typescript
// UniverseGathering.tsx L684-686
if (pegRatio === 0 && per > 0 && revGrowthRaw !== 0) {
    pegRatio = per / (revGrowthRaw * 100);  // ← revGrowthRaw가 이미 %면 100배 과소
}
// revenueGrowth가 % 단위(12.0=12%)인 경우: per / (12.0 * 100) = per / 1200 → 극히 작은 PEG
// revenueGrowth가 소수(0.12=12%)인 경우: per / (0.12 * 100) = per / 12 → 올바른 PEG
```

**해결 코드:**
```typescript
// UniverseGathering.tsx L684-686 수정
if (pegRatio === 0 && per > 0 && revGrowthRaw !== 0) {
    // revGrowthRaw의 스케일 자동 감지
    const growthPct = Math.abs(revGrowthRaw) < 5 
        ? revGrowthRaw * 100  // 소수 비율 → % 변환
        : revGrowthRaw;       // 이미 % 단위
    if (growthPct > 0) {
        pegRatio = per / growthPct;
    }
}
```

---

### H4: engineFallbackUsed 오탐 (Perplexity sharded 처리)

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/AlphaAnalysis.tsx` | L4120-4122 | `engineFallbackUsed` |

**버그 코드:**
```typescript
// AlphaAnalysis.tsx L4120-4122
engineFallbackUsed: requestedProvider !== usedProvider ||
    /FALLBACK|SHARDED|REPAIR/i.test(responseUsedProviderRaw || ''),
// Perplexity의 정상 sharded 처리도 "PERPLEXITY_SHARDED" 문자열 포함 → true
```

**영향:** Perplexity가 정상적으로 sharded 방식으로 처리해도 `engineFallbackUsed=true`가 됨. Final Gate에서 aiFallback 감지 시 penalty +45 또는 finalSelectionScore=0으로 강제.

**해결 코드:**
```typescript
// AlphaAnalysis.tsx L4120-4122 수정
engineFallbackUsed: requestedProvider !== usedProvider ||
    /FALLBACK|REPAIR/i.test(responseUsedProviderRaw || ''),
    // SHARDED 제거 — Perplexity의 정상 sharded 처리는 폴백 아님
```

---

### H5: uploadFile 응답 미검증 (Stage 0, Stage 2)

| 파일 | 라인 |
|------|------|
| `components/UniverseGathering.tsx` | L793-801 |
| `components/DeepQualityFilter.tsx` | L176 |

**버그 코드:**
```typescript
// UniverseGathering.tsx L793-801
await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
});  // ← 응답 상태 체크 없음! 업로드 실패해도 에러 없이 계속 진행
```

**해결 코드:**
```typescript
const res = await fetch('...?uploadType=multipart', { method: 'POST', ... });
if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive 업로드 실패: HTTP ${res.status} — ${errText}`);
}
const uploaded = await res.json();
console.log(`Drive 업로드 성공: fileId=${uploaded.id}`);
```

---

### H6: KST 타임스탬프 UTC 출력 (전 스테이지)

| 파일 | 라인 |
|------|------|
| `components/UniverseGathering.tsx` | L805-813 |
| `components/PreliminaryFilter.tsx` | L438-439 |
| `components/DeepQualityFilter.tsx` | L400 |

**버그 코드:**
```typescript
// Stage 0 L808 (전 스테이지 동일 패턴)
const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
return kstDate.toISOString()  // toISOString()은 항상 UTC로 변환하여 출력!
    .replace('T', '_')
    .replace(/:/g, '-')
    .split('.')[0];
// 결과: KST 13:00을 의도했지만 UTC 04:00이 파일명에 기록됨
```

**해결 코드:**
```typescript
// 모든 스테이지 공통 수정
function getKSTTimestamp(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
        .replace(' ', '_')
        .replace(/:/g, '-');
    // 결과: "2026-03-17_13-00-00" (실제 KST 시간)
}
```

---

### H7: ADX 비표준 계산

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/TechnicalAnalysis.tsx` | L490 | `finalADX` |

**버그 코드:**
```typescript
// TechnicalAnalysis.tsx L490
const finalADX = dxList.slice(-period).reduce((a, b) => a + b, 0) / period;
// 마지막 14개 DX의 단순 평균 — 표준 Wilder Smoothing이 아님
// 표준: ADX[t] = (ADX[t-1] * 13 + DX[t]) / 14
```

**영향:** ADX가 실제보다 추세 전환에 더 민감하게 반응. 횡보장 억제 조건(`adx < 20 && rawRvol < 0.8`)에서 ADX를 신뢰할 수 없음.

**해결 코드:**
```typescript
// TechnicalAnalysis.tsx L490 수정
// DX 계산 후 Wilder Smoothing으로 ADX 산출
let adx = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;  // 초기 SMA
for (let i = period; i < dxList.length; i++) {
    adx = (adx * (period - 1) + dxList[i]) / period;
}
const finalADX = adx;
```

---

### H8: TTM Squeeze KC 승수 비표준

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/TechnicalAnalysis.tsx` | L605-638 | `kcUpper/kcLower` |

**코드:**
```typescript
// TechnicalAnalysis.tsx
kcUpper = basis + (ATR * 1.5)  // KC 승수 1.5
kcLower = basis - (ATR * 1.5)
// 표준 TTM Squeeze의 일반 설정은 KC 승수 2.0
// 1.5 사용 시 Squeeze가 더 자주 발생 → 신호 품질 저하
```

---

### H9: harvester.py bare except (5개 위치)

| 파일 | 라인 | 위치 |
|------|------|------|
| `harvester.py` | L73 | `send_telegram()` |
| `harvester.py` | L84 | `find_file_id()` |
| `harvester.py` | L98 | `download_json()` |
| `harvester.py` | L252 | `sync_ohlcv_incremental()` |
| `harvester.py` | L874 | `quarterly_financials` |

**가장 심각한 버그 (L252):**
```python
# harvester.py L252
try:
    stock = yf.Ticker(source_symbol)
    ...
    upload_json(file_name, final_list, ohlcv_dir_id)
    return "UPDATED"
except:     # ← LINE 252 — 모든 예외 무시!
    return "FAILED"
# 실패 원인 완전 손실 — 종목이 왜 실패했는지 알 수 없음
# NaN/Infinity 값으로 인한 ValueError도 "FAILED"로만 기록됨
```

**해결 코드:**
```python
# harvester.py L252 수정
except Exception as e:
    print(f"⚠️ OHLCV sync 실패 [{record_symbol}]: {type(e).__name__}: {e}", flush=True)
    import traceback; traceback.print_exc()
    return "FAILED"

# L73 수정
except requests.RequestException as e:
    print(f"Telegram 알림 실패: {e}")

# L84 수정
except googleapiclient.errors.HttpError as e:
    if e.resp.status in (401, 403):
        print(f"Drive API 인증 오류: {e}"); raise
    time.sleep(2)
except Exception as e:
    print(f"Drive 파일 조회 오류: {e}"); time.sleep(2)

# L98 수정
except json.JSONDecodeError as e:
    print(f"JSON 파싱 오류: {e}")
    return None  # 재시도 불필요
except Exception as e:
    print(f"다운로드 오류: {e}"); time.sleep(2)

# L874 수정
except Exception as e:
    print(f"재무제표 수집 실패 [{ticker}]: {e}")
```

---

### H10: fetchCandlesFromAPI 미연결

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/TechnicalAnalysis.tsx` | L1112-1195, L1478-1495 | `fetchCandlesFromAPI` |

**버그:**
```typescript
// TechnicalAnalysis.tsx L1112-1195: fetchCandlesFromAPI 함수 정의됨
// TechnicalAnalysis.tsx L1478-1495: executeTechnicalScan 루프
const driveCandles = await loadOhlcvFromDrive(accessToken, ohlcvFolderId, item.symbol);
if (driveCandles) candles = driveCandles;
// Drive에 없으면 → droppedCount++; continue;
// ← fetchCandlesFromAPI() 호출 없음! API fallback 완전히 누락!
```

**영향:** Harvester 실패 종목, 신규 종목은 Stage 4에서 완전히 탈락. Finnhub/Polygon/Alpha Vantage fallback은 정의만 되어 있고 실제로 호출되지 않음.

---

### H11: Z-Score Proxy 오표시

| 파일 | 라인 | 변수 |
|------|------|------|
| `components/DeepQualityFilter.tsx` | L308 | `zScoreProxy` |

**버그 코드:**
```typescript
// DeepQualityFilter.tsx L308
const zScore = (roe > 15 && rawDebt < 0.5) ? 3.5 : (roe > 5 && rawDebt < 1.0) ? 2.0 : 1.0;
// 실제 Altman Z-Score는 5개 재무비율 사용
// 이 코드는 ROE와 D/E만으로 Z-Score를 흉내냄 — 전혀 다른 측정치
```

**영향:** UI에 "Altman Z-Score (파산위험)"으로 표시 → 사용자 오인. 항상 3가지 고정값(3.5/2.0/1.0)만 반환.

**해결:** UI 라벨을 "재무건전성 Proxy (단순화)" 또는 "Safety Proxy Score"로 수정.

---

### H12: earningsBlackoutDays exec-engine에서 제어 불가

| 파일 | 라인 |
|------|------|
| `exec-engine/index.ts` | L678 |

`earningsBlackoutDays`라는 변수명이 exec-engine 코드 어디에도 존재하지 않음. 어닝스 블랙아웃(5일)은 Stage 6 모델에서 계산되어 `decisionReason`에 반영됨. exec-engine은 이를 수동적으로 수신만 할 뿐 파라미터 조정 불가.

---

### H13: Conviction Floor minConviction=78 과도

| 파일 | 라인 | 변수 |
|------|------|------|
| `exec-engine/index.ts` | L1737-1740 | `minConviction` |

현재 RISK_OFF 프로파일에서 `minConviction=78`로 설정됨. VEON(conviction=75), KTB(conviction=57) 모두 `conviction_below_floor`로 차단. C3/C4 버그 수정 후에도 이 임계값이 높으면 계속 차단될 수 있음.

---

## 4. 🔷 MEDIUM/LOW 버그

### 4-STATUS. 2026-03-23 재점검 상태 (완전 완료 / 미완료)

| 항목 | 상태 | 근거 |
|---|---|---|
| 4-A UI 불일치 | 미완료 | 잔여는 `M-UI-4`(Stage6 structured fallback 문구 품질)만 남음. `M-UI-1/2/3`은 코드 반영 완료 |
| 4-B useEffect 의존성 누락 | **완전 완료** | `components/UniverseGathering.tsx:290`, `components/PreliminaryFilter.tsx:129`, `components/DeepQualityFilter.tsx:480` |
| 4-C Drive 검색 폴더 범위 미제한 | **완전 완료** | Stage0/1/2 로드 쿼리에 parent folder 제한 추가: `components/PreliminaryFilter.tsx:193-200`, `components/DeepQualityFilter.tsx:585-592`, `components/FundamentalAnalysis.tsx:959-964` |
| 4-D Perplexity res.ok 체크 순서 | **완전 완료** | `components/PreliminaryFilter.tsx:401-405` (ok 체크 후 json 파싱) |
| 4-E AnalysisStage enum 불일치 | **완전 완료** | `types.ts:65-66` (`STAGE_1`, `STAGE_2` 명시) |
| 4-F Vite에서 process.env 미지원 경로 | **완전 완료** | `components/PreliminaryFilter.tsx:424` (`process.env` 제거, config key 사용) |
| 4-G setGatheredRegistry 과호출 | **완전 완료** | `components/UniverseGathering.tsx` 배치 동기화(5개 실린더마다 + 최종 sync)로 과호출 제거 |
| 4-H Stage3/4 추가 버그 묶음 | **완전 완료** | `FundamentalAnalysis` median/pbr 보정 + `TechnicalAnalysis` trend/표준편차 통합 + `harvester.py` 순서/주말 판정 보정 |

### 4-A. UI 불일치 버그 (세부 재검증)

| ID | 상태 | 파일 | 근거 |
|----|------|------|------|
| M-UI-1 | **완전 완료** | `components/PreliminaryFilter.tsx` | `filteredCount`를 커밋 게이트 조건과 동기화하고, slider pass count를 별도 분리 |
| M-UI-2 | **완전 완료** | `components/UniverseGathering.tsx` | heartbeat 단계별 `EXCELLENT/GOOD/POOR/CRITICAL` 상태 구간 재배치 |
| M-UI-3 | **완전 완료** | `components/DeepQualityFilter.tsx` | Distress/Altman 모델 구분 라벨 및 설명 보강(오표시 해소) |
| M-UI-4 | 미완료 | `components/AlphaAnalysis.tsx` | `buildStructuredOutlookFallback` 문구가 여전히 보일러플레이트 성향(품질 개선 잔여) |

### 4-B. useEffect 의존성 누락

```typescript
// UniverseGathering.tsx L163-173
useEffect(() => {
    if (autoStart && isActive && !isGathering) { startGathering(accessToken); }
}, [autoStart, isActive]);  // ← isGathering, accessToken 누락

// PreliminaryFilter.tsx L93-98
useEffect(() => {
    if (autoStart && !loading && rawUniverse.length === 0) { handleSyncAndAnalyze(true); }
}, [autoStart]);  // ← loading, rawUniverse.length 누락

// DeepQualityFilter.tsx L103-108
useEffect(() => {
    if (autoStart && !loading) { executeDeepFilter(); }
}, [autoStart]);  // ← loading 누락
```

### 4-C. Google Drive 검색 폴더 범위 미제한

```typescript
// PreliminaryFilter.tsx L141-144
const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
// ← 폴더 제한 없음 — 다른 프로젝트 파일 충돌 가능

// DeepQualityFilter.tsx L187 동일 문제
const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
```

**해결:** `and '${GOOGLE_DRIVE_TARGET.stage0SubFolderId}' in parents` 추가

### 4-D. Perplexity res.ok 체크 순서 오류

```typescript
// PreliminaryFilter.tsx L285-288
const res = await Promise.race([perplexityRequest, timeoutPromise(15000, "...")]);
const json = await res.json();          // ← res.ok 체크 전에 json 파싱 시도 (오류!)
if (!res.ok) throw new Error(`Perplexity API Error: ${res.status}`);  // 순서가 틀림
```

**해결:** `res.ok` 체크 먼저, 그 다음 `res.json()` 호출

### 4-E. types.ts AnalysisStage Enum 불일치

```typescript
// types.ts L63-70
export enum AnalysisStage {
    STAGE_0 = 'Universe Gathering',
    STAGE_2 = 'Quality Filter',   // ← STAGE_1이 없음!
    STAGE_3 = 'Fundamental Analysis',
    // ...
}
// STAGE_2는 실제로는 'Deep Quality Filter'이나 'Quality Filter'로 표기
```

### 4-F. Vite에서 process.env 미지원

```typescript
// PreliminaryFilter.tsx L307
const geminiKey = process.env.API_KEY || geminiConfig?.key || "";
// ← Vite 앱에서 process.env.API_KEY 존재하지 않음!
// 올바른 방법: import.meta.env.VITE_API_KEY
```

### 4-G. setGatheredRegistry 과호출

```typescript
// UniverseGathering.tsx L614
// 26번 루프마다 전체 Map 복사 생성 및 setState 호출
setGatheredRegistry(new Map(tempRegistry));  // 26회 불필요한 Map 복사
// 해결: 루프 종료 후 한 번만 호출
```

### 4-H. Stage 3/4 추가 버그

| ID | 파일 | 라인 | 설명 |
|----|------|------|------|
| M-S3-1 | `FundamentalAnalysis.tsx` | L99 | Median off-by-one: `sorted[Math.floor(len/2)]` — 짝수 배열에서 상위 중앙값 반환 |
| M-S3-2 | `FundamentalAnalysis.tsx` | L72 | `pbr > 500 → 0` 처리로 내재가치 왜곡: `bookValue = price / (pbr||1) = price` |
| M-S4-1 | `TechnicalAnalysis.tsx` | L1209 vs L1521 | POWER_TREND 조건 불일치: Heuristic(`price>sma50&&sma50>sma200`) vs Real(`price>sma20&&sma20>sma50&&...`) |
| M-S4-2 | `TechnicalAnalysis.tsx` | L370 | BB StdDev 모집단 분산(N) 사용, 표준은 표본(N-1) |
| H-PY-1 | `harvester.py` | L743 | `set()` 사용으로 티커 처리 순서 비결정적 → `dict.fromkeys()` 사용 권장 |
| H-PY-2 | `harvester.py` | L709 | `is_weekend_update = (now_kst.weekday() == 5)` — 일요일(6) 누락 |

---

## 5. 🔒 보안 취약점

### 5-STATUS. 2026-03-23 재점검 상태 (완전 완료 / 미완료)

| 항목 | 상태 | 근거 |
|---|---|---|
| 5-A 하드코딩 API 키 목록 | **완전 완료** | `constants.ts`가 env-only 정책으로 전환됨(민감값 하드코딩 폴백 제거, root folder도 env-only) |
| 5-B Perplexity 키 이중 하드코딩 | **완전 완료** | `components/PreliminaryFilter.tsx` 내 Perplexity 하드코딩 키 제거됨 |
| 5-C Telegram Chat ID 완전 하드코딩 | **완전 완료** | `constants.ts:114-117` 환경변수 경로 사용 |
| 5-D 클라이언트 ID 로컬스토리지 노출 | **완전 완료** | env 우선 + local override clear 동작 + Stage5 lock override TTL 적용 + 운영 정책 문서화 완료 |
| 5-E 보안 수정 방향 | 미완료 | 런북 문서는 작성됐으나 실제 rotation/rollback 실행 증적(운영 로그) 수집 잔여 |

### 5-A. constants.ts 하드코딩 API 키 목록 — 재점검 결과

- 상태: **완전 완료**
- 근거:
  - `constants.ts`는 `getEnvVar()` 기반의 env-only 경로로 전환됨.
  - `GITHUB_DISPATCH_CONFIG.TOKEN`, `TELEGRAM_CONFIG`, `API_CONFIGS[*].key`에 민감값 하드코딩 폴백이 제거됨.
  - `GOOGLE_DRIVE_TARGET.rootFolderId`도 env-only(`GDRIVE_ROOT_FOLDER_ID` 또는 `GOOGLE_DRIVE_ROOT_FOLDER_ID`)로 전환됨.
- 보안 원칙:
  - 본 보고서에서는 과거 민감값 문자열을 재노출하지 않음.
  - 시크릿 로테이션/폐기는 운영 체크리스트에서 별도 관리.

### 5-B. Perplexity 키 이중 하드코딩 — 재점검 결과

- 상태: **완전 완료**
- 근거:
  - `components/PreliminaryFilter.tsx`는 `API_CONFIGS`에서 로딩한 키만 사용하며, 문자열 하드코딩 fallback이 제거됨.
  - 키 부재 시에는 즉시 `Perplexity API key missing` 경고/예외 처리.

### 5-C. Telegram Chat ID 완전 하드코딩 — 재점검 결과

- 상태: **완전 완료**
- 근거:
  - `constants.ts`의 `TELEGRAM_CONFIG.CHAT_ID` / `SIMULATION_CHAT_ID` 모두 env 경로 사용.
  - 운영값은 GitHub Actions/Vercel 변수로만 주입.

### 5-D. 클라이언트 ID 로컬스토리지 노출

- 상태: **완전 완료**
- 현황:
  - `components/UniverseGathering.tsx`는 `VITE_GDRIVE_CLIENT_ID`를 우선 사용하고 local override는 보조로만 사용.
  - Config Modal에서 현재 출처(`ENV/LOCAL/MANUAL/EMPTY`)를 노출하고 `Clear Local Override` 동작 제공.
  - `components/AlphaAnalysis.tsx`의 Stage5 lock override는 `updatedAt` + TTL(`VITE_STAGE5_LOCK_OVERRIDE_MAX_AGE_MIN`)로 stale lock 자동 해제.
  - 정책 문서: `docs/SECURITY_ROTATION_RUNBOOK_2026-03-23.md`

### 5-E. 보안 수정 방향 (잔여)

- 시크릿 로테이션 완료 증적(누가/언제/무엇을 교체했는지) 실행 로그 수집
- 긴급 롤백 런북 기준으로 실제 리허설 1회 수행 후 결과 첨부

---

## 6. Conviction Score Cliff 루트 코즈 분석

### 6-STATUS. 2026-03-23 재점검 상태 (완전 완료 / 미완료)

| 항목 | 상태 | 근거 |
|---|---|---|
| 6-1 Gemini 모델 경로 안정화(C1) | **완전 완료** | `constants.ts`에서 Gemini 모델 체인/alias remap 통합 관리 |
| 6-2 ICT displacement 전달 오류(C2) | **완전 완료** | `services/intelligenceService.ts`에서 `ictMetrics.displacement` 우선 참조로 수정 |
| 6-3 slimCandidates 퀀트 컨텍스트 누락(C3) | **완전 완료** | `fundamentalScore/technicalScore/compositeAlpha`를 AI 입력 계약에 포함 |
| 6-4 AI conviction 단일 대체(C4) | **완전 완료** | `components/AlphaAnalysis.tsx`에서 quant+AI 가중 블렌딩 및 floor 보호 적용 |
| 6-5 aiVerdict 정규화 불안정(C5) | **완전 완료** | `services/intelligenceService.ts`의 `normalizeAiVerdict` canonical 경로로 통일 |
| 6-6 Conviction cliff 재발 모니터링 | 미완료 | 신규 해시 기준 추세 관측(연속 3회 이상)과 증적 축적 필요 |

### 6-A. 문제 현상

퀀트 파이프라인에서 높은 점수를 받은 종목(예: KTB compositeAlpha=92, PDD=96)이 AI 분석 후 크게 낮아지는 현상. 이를 **"Conviction Score Cliff"** 라고 명명한다.

**실측 데이터 (2026-03-16 파이프라인):**
| 종목 | quant Conviction (P1) | AI Conviction (P2) | Final Conviction | 낙폭 | 차단 이유 |
|------|----------------------|--------------------|-----------------|------|----------|
| TIGO | 99 | 45 | 30 | **-54** | blocked_verdict_risk_off |
| INVA | 99 | 45 | 10 | **-54** | blocked_verdict_risk_off |
| DAVE | 99 | 52 | 13 | **-47** | blocked_verdict_risk_off |
| EVER | 99 | 65 | 16 | **-34** | blocked_quality_conviction_floor |
| KTB | 92 | 72 | 57 | -20 | conviction_below_floor(78) |
| PDD | 96 | 72 | 31 | -24 | blocked_earnings_window |

### 6-B. 5단계 원인 체인

```
[1단계] slimCandidates에 핵심 퀀트 점수 누락
   ↓
[2단계] SYSTEM_INSTRUCTION의 PREMIUM 자동 다운그레이드 지시
   ↓
[3단계] ictMetrics.displacementScore 오타로 displacement=0 전달
   ↓
[4단계] AI convictionScore가 quant 점수를 완전 대체
   ↓
[5단계] Final Gate에서 누적 페널티로 최종 점수 급락
```

### 6-C. 각 단계 상세 분석

#### 1단계: slimCandidates 데이터 누락 (intelligenceService.ts L575-597)

```typescript
// 문제: AI가 퀀트 파이프라인의 평가를 모른 채 독립 분석
const slimCandidates = candidates.map(c => ({
    ...
    ictScore: c.ictScore,  // ICT 점수만 있음
    // fundamentalScore, technicalScore, compositeAlpha 없음!
}));
```

AI가 받는 데이터:
- `{symbol: "KTB", price: 67.5, pe: 12.3, roe: 18.5, ictScore: 68.56, pdZone: "EQUILIBRIUM"}`
- 퀀트 모델이 KTB를 92점으로 평가했다는 사실을 AI는 알 수 없음

#### 2단계: PREMIUM 자동 다운그레이드 (intelligenceService.ts L612)

```
SYSTEM_INSTRUCTION:
"IF 'pdZone' is 'PREMIUM' (Expensive) -> Automatic Downgrade, regardless of fundamentals."
```

실제 분포 (Stage 5):
- PREMIUM: 28/50 = **56%**
- DISCOUNT: 19/50 = 38%
- EQUILIBRIUM: 3/50 = 6%

이 지시로 인해 PREMIUM 56% 종목은 AI가 무조건 하향 평가를 적용함.

#### 3단계: ictMetrics 필드 오타 (intelligenceService.ts L589)

```typescript
// 전달되는 값:
ictMetrics: {
    displacement: c.ictMetrics?.displacementScore || 0,  // 항상 0!
    //                          ↑ 존재하지 않는 필드명
}
```

AI가 displacement=0을 받으면:
- 모든 종목의 스마트머니 움직임이 없다고 판단
- 모멘텀 지표가 중립으로 해석됨
- convictionScore 자체 생성 시 보수적으로 낮은 값 부여

#### 4단계: AI convictionScore가 quant 완전 대체 (AlphaAnalysis.tsx L2933)

```typescript
// hydrateAndValidate() L641-643
convictionScore: typeof aiItem.convictionScore === 'number'
                 ? aiItem.convictionScore  // ← AI 값이 0이어도 적용!
                 : 50,
// AI가 0이 아닌 정수 값만 반환하면 무조건 AI 값으로 대체됨
// supportLevel/resistanceLevel/stopLoss는 quant 보호 필드이지만 convictionScore는 미보호
```

#### 5단계: Final Gate 누적 페널티

낮아진 rawConvictionScore에 다음 페널티가 추가 적용:

| 조건 | 페널티 |
|------|--------|
| `aiFallbackDetected=true` | +45, finalSelectionScore=0 강제 |
| `isRiskOffVerdict` | +24 |
| `tradePlanStatus=INVALID` | +80 |
| `techScore < 50` | +16 |
| `ictScore < 60` | +8 |
| `minerviniPassCount < 2` | +8 |

결과: `finalSelectionScore = max(0, rawConvictionScore + bonus - penalty)`에서 0에 수렴

### 6-D. 해결방안 (코드 수정 제안)

**수정 1: slimCandidates에 핵심 점수 추가 (C3 참조)**

**수정 2: SYSTEM_INSTRUCTION PREMIUM 조항 완화**
```
// 변경 전 (L612):
"IF 'pdZone' is 'PREMIUM' -> Automatic Downgrade, regardless of fundamentals."

// 변경 후:
"IF 'pdZone' is 'PREMIUM' AND 'fundamentalScore' < 70:
 Apply caution penalty: reduce conviction by up to 15 points.
 IF 'fundamentalScore' >= 70 AND 'compositeAlpha' >= 75:
 Accept PREMIUM zone with minor caution note only."
```

**수정 3: ictMetrics 필드명 수정 (C2 참조)**

**수정 4: convictionScore 블렌딩 (C4 참조)**
```typescript
// 최종 병합 공식
const quantWeight = 0.40;
const aiWeight    = 0.60;
const blended = Math.round(quantConviction * quantWeight + aiConviction * aiWeight);
const safeConviction = Math.max(blended, Math.round(quantConviction * 0.70));
```

**수정 5: aiFallback 페널티 완화**
```typescript
// AlphaAnalysis.tsx — aiFallbackDetected 시 페널티 조정
if (aiFallbackDetected) {
    penalty += 20;  // 45 → 20으로 완화 (Perplexity도 유효한 AI)
    // finalSelectionScore = 0 강제 제거
}
```

---

## 7. 테스트 데이터 교차검증 결과

### 7-A. 파이프라인 카운트 검증

**실제 파이프라인 실행 (2026-03-16 19:14~19:37 UTC):**

| 스테이지 | 예상 | 실제 | 상태 |
|---------|------|------|------|
| Stage 0 (Master Universe) | 6822 | **6822** | ✅ |
| Stage 1 (Purified Universe) | 1432 | **1432** | ✅ |
| Stage 2 (Elite Universe) | 300 | **300** | ✅ |
| Stage 3 (Fundamental Full) | 300 | **300** | ✅ |
| Stage 4 (Technical Full) | 300 | **300** | ✅ |
| Stage 5 (ICT Elite 50) | 50 | **50** | ✅ |
| Stage 6 Part1 (Scored) | 12 | **12** | ✅ |
| Stage 6 Part2 (AI Result) | 12 | **12** | ✅ |
| Stage 6 Final (executablePicks) | 2 | **2** | ✅ |
| Stage 6 Final (modelTop6) | 6 | **6** | ✅ |

**실제 흐름:** 6822 → 1432 → 300 → 300 → 300 → 50 → 12 → 12 → 6(model) + 2(exec)

**파일 크기:**
| 파일 | 크기 |
|------|------|
| STAGE0_MASTER_UNIVERSE | 6,660KB |
| STAGE1_PURIFIED_UNIVERSE | 1,530KB |
| STAGE2_ELITE_UNIVERSE | 491.2KB |
| STAGE3_FUNDAMENTAL_FULL | 3,151.4KB |
| STAGE4_TECHNICAL_FULL | 10,128.3KB |
| STAGE5_ICT_ELITE_50 | 1,751.5KB |
| STAGE6_ALPHA_FINAL | 122.4KB |

### 7-B. Stage 6 점수 비교 테이블 (12종목 전체)

| CA Rank | 종목 | compositeAlpha | quant Conviction (P1) | AI Conviction (P2) | final Conviction | finalDecision | pdZone |
|---------|------|------------|---|----|---|----|------|
| 1 | **VIST** | 88.71 | 99 | 98 | 100 | BLOCKED_RISK (stop_too_wide) | PREMIUM |
| 2 | TIGO | 83.30 | 99 | 45 | 30 | BLOCKED_RISK (verdict_risk_off) | PREMIUM |
| 3 | **UTHR** | 82.84 | 99 | 92 | 100 | BLOCKED_RISK (stop_too_wide) | PREMIUM |
| 4 | EVER | 73.47 | 99 | 65 | 16 | BLOCKED_RISK (conviction_floor) | DISCOUNT |
| 5 | INVA | 72.92 | 99 | 45 | 10 | BLOCKED_RISK (verdict_risk_off) | PREMIUM |
| 6 | DAVE | 72.66 | 99 | 52 | 13 | BLOCKED_RISK (verdict_risk_off) | PREMIUM |
| 7 | **KTB** | 67.91 | 92 | 72 | 57 | EXECUTABLE_NOW | EQUILIBRIUM |
| 8 | **PDD** | 63.77 | 96 | 72 | 31 | BLOCKED_EVENT (earnings_window) | DISCOUNT |
| 9 | INMD | 62.91 | 95 | 75 | 28 | BLOCKED_RISK (verdict_risk_off) | DISCOUNT |
| 10 | ADBE | 62.70 | 82 | 88 | 49 | WAIT_PRICE (earnings_missing) | DISCOUNT |
| 11 | AMSC | 56.86 | 81 | 55 | 10 | BLOCKED_RISK (verdict_risk_off) | DISCOUNT |
| 12 | **VEON** | 56.63 | 67 | 92 | 75 | EXECUTABLE_NOW | EQUILIBRIUM |

> **주목:** VEON은 compositeAlpha 최하위(56.63, 12위)임에도 AI가 92 부여 → modelRank 3위, EXECUTABLE_NOW

### 7-C. ICT Zone 분포 (Stage 5, 50종목)

| pdZone | 종목 수 | 비율 |
|--------|---------|------|
| PREMIUM | 28 | **56.0%** |
| DISCOUNT | 19 | 38.0% |
| EQUILIBRIUM | 3 | 6.0% |

EQUILIBRIUM 종목: KTB(ictPos=0.4727), VEON(ictPos=0.545), LTM(ictPos=0.4825)

ICT Score 통계: min=25.05(KEP), max=100.00(CALM), mean=55.41

### 7-D. Market Regime 분석

| 지표 | 값 |
|------|-----|
| **Regime** | **RISK_OFF** |
| Score | **20/100** (극도 약세) |
| VIX | 27.19 (20일 수익률 +30.6%, SMA50/200 모두 상회) |
| S&P500 | 6,632.19, SMA50 이하, SMA200 상회 |
| Nasdaq | 22,105.36, SMA50 이하, **SMA200 이하** |
| SMA50 상회 종목 | **9.0%** (극히 약세) |
| SMA200 상회 종목 | **30.4%** (약세) |

**파이프라인 영향:** Stage 4 전 종목에 `regimePenalty=10` 적용, Stage 5 RISK_OFF 가중치(fund×0.70), exec-engine RISK_OFF 프로파일(minConviction=78, maxOrders=2)

### 7-E. CGAU 제외 이상 현상

- CGAU compositeAlpha = **91.92** (Stage 5 최고값)
- Stage 6 선발 기준 12위 내 ictScore ≥ 49.77이어야 하는데 CGAU ictScore=57.61
- Stage 5 verdict: WAIT, marketState: MANIPULATION
- **결론:** Stage5→Stage6 `stage5to6-e-v1` 계약에서 compositeAlpha/ictScore 단독이 아닌 복합 필터가 있으나 명세 미공개. CGAU 제외의 정확한 근거 불명확.

### 7-F. execution_contract null 필드 문제

```json
// STAGE6_ALPHA_FINAL의 execution_contract.modelTop6[0] (VIST)
{
    "symbol": "VIST",
    "compositeAlpha": null,      // ← null!
    "convictionScore": null,     // ← null!
    "entryPrice": null,          // ← null!
    "stopLoss": null,            // ← null!
    "finalSelectionScore": null  // ← null!
}
```

**위험:** exec-engine이 `execution_contract.executablePicks`에서 읽으면 null entry/stop 가격으로 주문 생성 시도 → `payload_invalid_price_geometry`로 차단. `alpha_candidates` 배열에서만 완전한 데이터 제공됨.

### 7-G. AI 엔진 폴백 문제

```
요청: Google Gemini
실제: Perplexity (폴백)
이유: gemini-3.1-pro-preview 모델명 오류 (C1 버그)

영향:
- ALL 12 종목 aiSentiment = 'Neutral' (균일 — 기본값 적용 의심)
- 4종목 PARTIAL_EXIT 판정 (TIGO, INVA, DAVE, AMSC)
- ALL 12 종목 verdictConflict=True
- AI 분석 품질이 Gemini 대비 현저히 낮은 것으로 추정
```

---

## 8. 성능 최적화 포인트

### 8-A. Stage 0 순차 처리 → 병렬화

**문제 위치:** `UniverseGathering.tsx` L599-625

```typescript
// 현재: 26개 파일을 순차 처리
for (const char of ALPHABET) {
    const fileId = await findFileId(char + '_stocks_daily.json', dailyFolderId);
    const content = await downloadFile(token, fileId);
    const data = processCylinderData(content);
    // ...
}
// 예상 소요: 26 × (100~500ms API 왕복) = 수십 초

// 개선: Promise.allSettled 병렬 처리
const results = await Promise.allSettled(
    ALPHABET.map(char => processAlphabetGroup(char, token))
);
// 예상 소요: Drive API rate limit 고려, 최대 5~8개 동시 처리
// → 최대 5배 속도 향상
```

### 8-B. Stage 1 AI 폴백 총 125초 대기

**문제 위치:** `PreliminaryFilter.tsx` L315, L329

```typescript
// 현재 타임아웃 구조:
// Gemini Pro: 80,000ms (존재하지 않는 모델 — 즉시 API 에러이지만 에러 응답 대기)
// Gemini Flash: 30,000ms (동일)
// Perplexity: 15,000ms
// 총 최대 125초 UI 블로킹!

// 개선:
// Gemini 모델명 수정 후 → 실제 AI 응답 시간 단축
// Gemini Pro 타임아웃: 30,000ms로 단축
// 총 최대 75초로 단축
```

### 8-C. Harvester bare except 사일런트 실패

**문제 위치:** `harvester.py` L252

300종목 수집 중 일부가 "FAILED"로 기록되어도 이유를 알 수 없음. H9에서 수정 완료 시 디버깅 가능.

### 8-D. 메인 스레드 블로킹

| 위치 | 문제 | 영향 |
|------|------|------|
| `PreliminaryFilter.tsx` | `commitPurification()` 수천 항목 동기 처리 | UI 응답 불가 |
| `DeepQualityFilter.tsx` | `executeDeepFilter()` 스코어링 루프 | UI 응답 불가 |
| `TechnicalAnalysis.tsx` | 300종목 기술지표 계산 | UI 응답 불가 |

**해결:** Web Worker로 무거운 계산 분리

```typescript
// 예시: DeepQualityFilter.tsx 개선
const worker = new Worker('./qualityFilterWorker.ts');
worker.postMessage({ candidates: data, config: CONFIG });
worker.onmessage = (e) => setProcessedData(e.data.results);
```

### 8-E. Drive API 중복 호출

| 위치 | 문제 | 예상 API 호출 수 |
|------|------|-----------------|
| Stage 0 | 26파일 순차 findFileId + downloadFile | 52회 |
| Stage 2 | 히스토리 26파일 순차 | 52회 |
| Stage 3 | 알파벳 그룹별 순차 history/daily 로드 | 최대 52회 |
| Stage 4 | 300종목 OHLCV 순차 로드 | 600회 |
| Harvester | `build_breadth_snapshot()` 300종목 개별 다운로드 | 600회 |
| Harvester | 폴링 루프 (10초마다 2파일) | 최대 240회 |

---

## 9. 인프라/배포 이슈

### 9-A. GitHub Actions market-guard 4011분 Stale

**문제:**
```yaml
# market-guard.yml
schedule:
  - cron: "*/5 * * * 1-5"  # 평일 5분마다 실행
concurrency:
  cancel-in-progress: true  # 이전 실행 취소
```

현재 `guard-control.json`이 **2026-03-13T16:15:11 이후 미업데이트** (4011분 = 약 2.8일). 원인은 GitHub Actions `cancel-in-progress: true`와 스케줄 지연의 복합 작용.

**해결:**
```yaml
# market-guard.yml 수정
concurrency:
  group: market-guard-${{ github.ref }}
  cancel-in-progress: false  # 취소 없이 대기

timeout-minutes: 5  # 5분 안에 완료 보장

# 또는 maxAgeMin 연장 (index.ts)
const maxAgeMin = readPositiveNumberEnv("GUARD_CONTROL_MAX_AGE_MIN", 720);  // 3h → 12h
```

### 9-B. TRIGGER_STAGE6_HASH 미사용

```typescript
// dry-run.yml이 repository_dispatch에서 TRIGGER_STAGE6_HASH 수신
// 그러나 exec-engine index.ts에서 이 값을 검증에 사용하지 않음
// Drive에서 항상 최신 파일을 로드 — 특정 파일 검증 불가

// 개선:
const triggerHash = process.env.TRIGGER_STAGE6_HASH;
if (triggerHash && stage6Hash !== triggerHash) {
    throw new Error(`Stage6 해시 불일치: expected ${triggerHash}, got ${stage6Hash}`);
}
```

### 9-C. 캐시 전략 문제

```yaml
# dry-run.yml L137-144
key: sidecar-state-${{ github.ref_name }}-${{ github.run_id }}
restore-keys: |
  sidecar-state-${{ github.ref_name }}-
```

`cancel-in-progress: true`와 결합 시 이전 실행이 state 저장 중 취소되면 불완전한 캐시 저장 위험.

### 9-D. Vite에서 process.env 미지원

```typescript
// PreliminaryFilter.tsx L307 (및 여러 위치)
const geminiKey = process.env.API_KEY || geminiConfig?.key || "";
// Vite 앱에서 process.env 미지원 → 환경변수 로드 실패

// 해결:
const geminiKey = import.meta.env.VITE_API_KEY || geminiConfig?.key || "";
```

### 9-E. accessToken 갱신 처리 부재

```typescript
// 전 스테이지 공통
const accessToken = sessionStorage.getItem('gdrive_access_token');
// Google OAuth 액세스 토큰은 1시간 후 만료
// 만료 후 Drive API 실패 시 재인증 유도 없음
// 특히 Stage 0의 26파일 처리 중 토큰 만료 위험
```

---

## 10. decisionGate 전체 임계값 테이블

### 10-A. exec-engine 12단계 Gate (buildDryExecPayloads)

| Gate | 조건 | 임계값 | 환경변수 | RISK_OFF 실제값 |
|------|------|--------|---------|----------------|
| 0 | Actionable Filter | verdict ∈ {BUY, STRONG_BUY} | — | — |
| 1 | Stage6 Contract | executionBucket=EXECUTABLE + reason=VALID_EXEC | `STAGE6_EXECUTION_BUCKET_ENFORCE` | enforce=true |
| 2 | Conviction | conviction ≥ minConviction | `DRY_RISK_OFF_MIN_CONVICTION` | **78** |
| 3 | Price Completeness | entry != null && target != null && stop != null | — | — |
| 4 | Price Geometry | target > entry > stop | — | — |
| 5 | Stop Distance | stopDistancePct ∈ [minStop, maxStop] | `DRY_RISK_OFF_MAX_STOP_DISTANCE_PCT` | min=4%, max=25% |
| 6 | Entry Feasibility | `ENTRY_FEASIBILITY_ENFORCE=false` → SKIP | `ENTRY_FEASIBILITY_ENFORCE` | false (unenforced) |
| 7 | Capacity | payloads < maxOrders, notional < maxTotal | `DRY_RISK_OFF_MAX_ORDERS` | maxOrders=2, maxTotal=$1600 |
| 8 | Payload Validation | target > limit > stop, notional ≥ 1 | — | — |
| 9 | Order Idempotency | 동일 hash+symbol+side 중복 차단 | `EXEC_ENABLED` | dry-run: 비활성 |
| 10 | Preflight | 계좌 ACTIVE, 시장 개장 | `EXEC_ENABLED` | dry-run: warn만 |
| 11 | Regime Entry Guard | regime.entryGuard.blocked → 전체 차단 | `REGIME_QUALITY_MIN_SCORE=60` | score=75 → 통과 |
| 12 | Guard Control Gate | guardControl.blocked → 전체 차단 | `GUARD_CONTROL_MAX_AGE_MIN=180` | **stale → 차단 해제** |

### 10-B. Stage 6 decisionGate 19단계

| # | 조건 | 결과 | 차단 이유 | 라인 |
|---|------|------|----------|------|
| 1 | isRiskOffVerdict | BLOCKED_RISK | blocked_verdict_risk_off | L3392 |
| 2 | stateVerdictConflict & POLICY=BLOCK | BLOCKED_RISK | blocked_state_verdict_conflict | L3396 |
| 3 | stateVerdictConflict & POLICY=WAIT | WAIT_PRICE | wait_state_verdict_conflict | L3400 |
| 4 | earningsDataMissing & POLICY=BLOCKED | BLOCKED_EVENT | blocked_earnings_data_missing | L3404 |
| 5 | earningsDataMissing & POLICY=WAIT | WAIT_PRICE | wait_earnings_data_missing | L3408 |
| 6 | earningsDaysToEvent ≤ 5 | BLOCKED_EVENT | blocked_earnings_window | L3412 |
| 7 | REQUIRE_BULLISH_VERDICT=true & 불리시 아님 | BLOCKED_RISK | blocked_quality_verdict_unusable | L3416 |
| 8 | convictionScore < 30 | BLOCKED_RISK | blocked_quality_conviction_floor | L3420 |
| 9 | expectedReturnPct == null | BLOCKED_RISK | blocked_quality_missing_expected_return | L3424 |
| 10 | hasPriceBox = false | BLOCKED_RISK | blocked_missing_trade_box | L3428 |
| 11 | hasGeometry = false | BLOCKED_RISK | blocked_invalid_geometry | L3432 |
| 12 | stopDistancePct < 1.5% | BLOCKED_RISK | blocked_stop_too_tight | L3436 |
| 13 | stopDistancePct > **22%** | BLOCKED_RISK | blocked_stop_too_wide | L3440 |
| 14 | targetDistancePct < 3% | BLOCKED_RISK | blocked_target_too_close | L3444 |
| 15 | anchorExecGapPct > 12% | BLOCKED_RISK | blocked_anchor_exec_gap | L3448 |
| 16 | riskRewardRatioValue < 2 | BLOCKED_RISK | blocked_rr_below_min | L3452 |
| 17 | expectedReturnPct ≤ 0 | BLOCKED_RISK | blocked_ev_non_positive | L3456 |
| 18 | executionReason = WAIT_PULLBACK_TOO_DEEP | WAIT_PRICE | wait_pullback_not_reached | L3460 |
| 19 | 통과 | EXECUTABLE_NOW | executable_pullback | L3464 |

### 10-C. Stage 6 Final Gate 보너스/페널티 항목

| 조건 | 보너스/페널티 | 라인 |
|------|-------------|------|
| aiFallbackDetected = true | **penalty += 45, finalSelectionScore = 0 강제** | L3059-3069 |
| isRiskOffVerdict | penalty += 24 | L3074 |
| HOLD/NEUTRAL verdict | penalty += 8 | L3077 |
| STRONG_BUY verdict | bonus += 2 | L3081 |
| DISCOUNT Exception (fund≥90, ict≥85) | bonus += 6 | L3085-3088 |
| techScore < 50 | penalty += 16 | L3091 |
| 50 ≤ techScore < 60 | penalty += 6 | L3092 |
| minerviniPassCount < 2 | penalty += 8 | L3094 |
| merviniPassCount<2 & tech<55 & no exception | penalty += 18 (추가) | L3095-3098 |
| ictScore < 60 | penalty += 8 | L3100 |
| fundScore < 45 | penalty += 8 | L3101 |
| signalQuality NEUTRAL | penalty += 5 | L3103 |
| dataQuality THIN | penalty += 4 | L3104 |
| dataQuality ILLIQUID | penalty += 15 | L3105 |
| dataQuality STALE | penalty += 20 | L3106 |
| tradePlanStatus INVALID | **penalty += 80, finalSelectionScore 대폭 하락** | L3107-3108 |
| tradePlanSource DERIVED_2R | penalty += 6 | L3110 |
| fund≥70 & tech≥70 & ict≥80 | bonus += 8 | L3114 |
| fund≥60 & tech≥60 & ict≥70 | bonus += 4 | L3117 |
| minerviniPassCount ≥ 7 | bonus += 4 | L3120 |
| signalQuality ALIGNED | bonus += 3 | L3121 |

### 10-D. Market Guard VIX 임계값

| 레벨 | 기본값 | RISK_OFF 조정 | RISK_OFF+forceEscalate |
|------|--------|-------------|----------------------|
| L0 | 무조건 | — | — |
| L1 (warn_risk_rising) | VIX ≥ 24 | VIX ≥ 23 | VIX ≥ 22 |
| L2 (halt_new_entries) | VIX ≥ **27** | VIX ≥ 26 | VIX ≥ 25 |
| L3 (reduce_positions_50) | VIX ≥ 30 | VIX ≥ 29 | VIX ≥ 28 |

**현재 상태 (2026-03-16):** VIX 27.19, RISK_OFF 적용 → L2 기준 26 초과 → **Level 2 발동 상태**

---

## 11. 최종 실행 결과 추적

### 11-UPDATE. 2026-03-23 최신 통합 실행 증적

| 항목 | 값 |
|------|-----|
| Stage0 | `STAGE0_MASTER_UNIVERSE_2026-03-23_19-11-30.json` |
| Stage1 | `STAGE1_PURIFIED_UNIVERSE_2026-03-23_19-11-27.json` |
| Stage2 | `STAGE2_ELITE_UNIVERSE_2026-03-23_19-12-55.json` |
| Stage3 | `STAGE3_FUNDAMENTAL_FULL_2026-03-23_19-14-27.json` |
| Stage4 | `STAGE4_TECHNICAL_FULL_2026-03-23_19-29-28.json` |
| Stage5 | `STAGE5_ICT_ELITE_50_2026-03-23_19-29-38.json` |
| Stage6 Final | `STAGE6_ALPHA_FINAL_2026-03-23_19-31-30.json` |
| Stage6 Hash | `2a168685fa2e` |
| Sidecar Trigger | `repository_dispatch(stage6_result_created)` |
| Sidecar Hash Sync | `stage6Hash=2a168685fa2e` (요약/상태 파일 일치) |
| Stage6 Contract | `checked=5 executable=5 watchlist=0 blocked=0` |
| Guard Control | `L3`, `stale=false`, `wouldBlockLive=true` |
| Dry-run 결과 | `payloads/skipped=0/5`, `preflight=PREFLIGHT_NO_PAYLOAD` |

**해석:**
- Stage5→Stage6 최신 파일 잠금 경로는 정상(구 해시 잠금 이슈 재발 없음).
- Sidecar 계약 검증과 hash/file 동기화는 정상.
- 현재 주문 미발행 원인은 시스템 오류가 아니라 정책성 차단(`guard_control_halt_new_entries`, `simulated_live_parity`, 일부 `conviction_below_floor`)이다.

> 참고: 아래 11-A~11-C는 2026-03-16 기준 historical trace(Conviction Cliff 원인 분석)로 유지한다.

### 11-A. VEON — executionRank: 1

| 항목 | 값 |
|------|-----|
| **Entry** | **$43.24** (entryAnchorPrice = $43.23775) |
| **Target** | **$76.68** |
| **Stop** | **$34.03** (stopLoss = $34.031750) |
| **R/R Ratio** | **3.63** |
| **Expected Return** | +51% (gated), +77% (raw) |
| compositeAlpha | 56.63 (Stage6 12위 — 최하위) |
| quant Conviction (P1) | 67 |
| AI Conviction (P2) | 92 (+25 lift) |
| final Conviction | 75 |
| executionScore | 90.2 (12종목 중 최고) |
| finalGateState | OPEN |
| Stop Distance | 21.29% |
| Entry Distance | 14.55% below current price |
| chartPattern | Wyckoff Accumulation |
| isConfirmedSmartMoney | True |
| earningsDaysToEvent | 58 (블랙아웃 없음) |
| stateVerdictConflict | False |

**exec-engine에서 차단 이유:** `conviction_below_floor` (75 < minConviction=78)

**상세 경로:**
```
VEON Stage5 compositeAlpha=56.63 (최하위)
→ Stage6 sortScore=94.167 (EQUILIBRIUM 보너스)
→ AI rawConvictionScore=92 (quant 67 → +25 AI lift)
→ finalSelectionScore=75 (Final Gate 통과, OPEN)
→ decisionGate: EXECUTABLE_NOW (모든 조건 충족)
→ executionBucket: EXECUTABLE
→ exec-engine Gate 2: conviction(75) < minConviction(78) → conviction_below_floor → SKIP
```

### 11-B. KTB — executionRank: 2

| 항목 | 값 |
|------|-----|
| **Entry** | **$60.92** (entryAnchorPrice = $60.915705) |
| **Target** | **$92.67** (targetPrice = $92.66667) |
| **Stop** | **$49.25** (stopLoss = $49.250985) |
| **R/R Ratio** | **2.72** |
| **Expected Return** | +37% (gated), +52% (raw) |
| compositeAlpha | 67.91 |
| quant Conviction (P1) | 92 |
| AI Conviction (P2) | 72 (-20 drop) |
| final Conviction | 57 |
| executionScore | 73.7 |
| finalGateState | OPEN |
| Stop Distance | 19.15% |
| Entry Distance | 9.74% below current price |
| chartPattern | Order Block |
| stateVerdictConflict | **True** (DISTRIBUTION state vs BUY verdict) |
| earningsDaysToEvent | 50 (블랙아웃 없음) |

**exec-engine에서 차단 이유:** `conviction_below_floor` (57 < minConviction=78)

**상세 경로:**
```
KTB Stage5 compositeAlpha=67.91 (7위)
→ Stage6 runStage1 convictionScore=92
→ intelligenceService slimCandidates: fundamentalScore 없음 (C3 버그)
→ ictMetrics.displacement=0 (C2 버그)
→ AI rawConvictionScore=72 (quant 92 → -20 AI drop)
→ safeConviction=72 (AI 우선, C4 버그)
→ Final Gate: penalty 없음
→ finalSelectionScore=57 (72 + bonus - penalty)
→ decisionGate: EXECUTABLE_NOW (convictionScore=57 ≥ Stage6 min 30)
→ executionBucket: EXECUTABLE
→ exec-engine Gate 2: conviction(57) < minConviction(78) → conviction_below_floor → SKIP
```

### 11-C. Watchlist Top 4

| modelRank | 종목 | finalDecision | 차단 이유 | targetPrice | R/R |
|-----------|------|--------------|----------|------------|-----|
| 1 | **VIST** | BLOCKED_RISK | blocked_stop_too_wide (C9 버그) | $76.34 | 3.32 |
| 2 | **UTHR** | BLOCKED_RISK | blocked_stop_too_wide (C9 버그) | $592.25 | 2.79 |
| 5 | **ADBE** | WAIT_PRICE | wait_earnings_data_missing | $385.22 | 1.57 |
| 6 | **PDD** | BLOCKED_EVENT | blocked_earnings_window (3일 후 실적) | $148.66 | 2.76 |

**VIST/UTHR blocked_stop_too_wide 원인:** C9 버그(ictStopLoss = low52 × 0.985)로 52주 저점 기반 StopLoss 계산 → Stop Distance가 22%를 크게 초과.

---

## 12. 수정 우선순위 로드맵

### 12-UPDATE. 2026-03-23 기준 실제 잔여 작업

| 우선순위 | 항목 | 상태 | 영향 |
|---------|------|------|------|
| P0 | M-UI-4 (`buildStructuredOutlookFallback`) 문구 품질 개선 | 미완료 | 텔레그램/리포트 가독성 및 사용자 신뢰도 |
| P0 | 5-E 운영 증적 수집(rotate/rollback 리허설 로그) | 미완료 | 운영 보안/추적성 |
| P1 | Sidecar perf loop 표본 `11/20 → >=20/20` 달성 | 미완료 | Paper Trading Go/No-Go 게이트 |
| P1 | Guard release path 증적 확보(L2 차단 해제 후 payload 생성) | 미완료 | 실전 페이퍼 진입 전 안정성 검증 |
| P2 | historical 섹션(11-A~11-C) 최신 회차 기준 부록 분리 | 미완료 | 문서 혼선 방지 |

**현재 결론:**  
핵심 파이프라인(Stage0~6 + Stage6 lock + Sidecar hash sync)은 정상 복구/유지 상태이며, 잔여는 **품질 고도화 + 운영 증적 수집** 중심이다.

### Phase 1: 즉시 수정 (1~2일) — Stage 6 정확도 직결

| 우선순위 | 버그 ID | 파일 | 라인 | 예상 개선 효과 |
|---------|---------|------|------|--------------|
| 1 | **C1** | PreliminaryFilter.tsx, intelligenceService.ts | L316, L330, L1085 | Gemini AI 활성화 → conviction cliff 완화 |
| 2 | **C2** | intelligenceService.ts | L589 | displacement 정상 전달 → AI 평가 개선 |
| 3 | **C3** | intelligenceService.ts | L575-597 | AI에 퀀트 점수 제공 → conviction 하락 방지 |
| 4 | **C4** | AlphaAnalysis.tsx | L2933 | AI/quant 가중 평균 → cliff 완화 |
| 5 | **C5** | intelligenceService.ts | L1032, L623, L235 | aiVerdict 불일치 해소 → WATCH/HOLD 차단 방지 |

**Phase 1 수정 효과 예측:**
- C1 수정 시: Gemini 정상 동작 → verdictConflict 감소
- C2+C3 수정 시: AI displacement=0 오류 해소, AI가 퀀트 점수 참조 가능
- C4 수정 시: KTB conviction 92 → blended ~84 (78 이상 → exec-engine 통과 가능)
- C5 수정 시: WATCH verdict로 인한 불필요한 차단 해소

---

### Phase 2: 1주 이내 — 데이터 무결성

| 우선순위 | 버그 ID | 파일 | 라인 | 예상 개선 효과 |
|---------|---------|------|------|--------------|
| 6 | **C6** | DeepQualityFilter.tsx | L57 | 무부채 기업 debtScore 역전 해소 |
| 7 | **C7** | FundamentalAnalysis.tsx | L184-190 | ROIC 공식 정확성 향상 |
| 8 | **C8** | TechnicalAnalysis.tsx | L383 | MACD 초기값 정확성 향상 |
| 9 | **C9** | IctAnalysis.tsx | L555 | VIST/UTHR blocked_stop_too_wide 해소 |
| 10 | **C10** | exec-engine/index.ts | L1387-1396 | Guard Control stale 시 보수적 차단 유지 |
| 11 | H1 | IctAnalysis.tsx | L607-610 | RISK_OFF 가중치 정규화 |
| 12 | H3 | UniverseGathering.tsx | L684-686 | PEG Ratio 계산 정확성 향상 |

---

### Phase 3: 2주 이내 — 시스템 신뢰성

| 항목 | 버그 | 파일 |
|------|------|------|
| H2 PREMIUM 자동 다운그레이드 완화 | intelligenceService.ts L612 |
| H4 engineFallbackUsed 오탐 수정 | AlphaAnalysis.tsx L4120-4122 |
| H5 uploadFile 응답 검증 추가 | UniverseGathering.tsx, DeepQualityFilter.tsx |
| H6 KST 타임스탬프 수정 | 전 스테이지 |
| H7 ADX Wilder Smoothing 적용 | TechnicalAnalysis.tsx L490 |
| H9 harvester.py bare except 수정 | harvester.py L73, L84, L98, L252, L874 |
| H10 fetchCandlesFromAPI 연결 | TechnicalAnalysis.tsx L1112-1195 |
| H12 earningsBlackoutDays 파라미터화 | AlphaAnalysis.tsx |
| H13 minConviction 임계값 재검토 | exec-engine .env |

---

### Phase 4: 지속적 개선 — 성능/인프라/보안

**보안 (최우선):**
- [ ] constants.ts 14개 API 키 전체 환경변수로 이전 + 하드코딩 제거
- [ ] `.env.local` gitignore 추가
- [ ] TELEGRAM_CHAT_ID, rootFolderId 환경변수화

**성능:**
- [ ] Stage 0/3/4 Drive API 병렬화 (Promise.allSettled + concurrency 제한)
- [ ] DeepQualityFilter/TechnicalAnalysis Web Worker 분리
- [ ] setGatheredRegistry 과호출 개선 (루프 종료 후 1회)
- [ ] Harvester `build_breadth_snapshot()` 메모리 캐시 활용

**인프라:**
- [ ] market-guard.yml `cancel-in-progress: false` 변경
- [ ] TRIGGER_STAGE6_HASH 검증 로직 추가
- [ ] Guard Control maxAgeMin 720분으로 확장
- [ ] accessToken 갱신 처리 (1시간 만료 대응)
- [ ] process.env → import.meta.env 전환

**코드 품질:**
- [ ] findFolder/findFileId/downloadFile/uploadFile 공통 Drive 유틸리티 모듈 분리
- [ ] useEffect 의존성 배열 전수 검토 및 수정
- [ ] types.ts AnalysisStage enum STAGE_1 추가

---

## 부록: 핵심 코드 위치 참조표

| 기능 | 파일 | 라인 |
|------|------|------|
| Gemini 모델명 (C1) | PreliminaryFilter.tsx | L316, L330 |
| Gemini 모델명 (C1) | intelligenceService.ts | L1085 |
| displacementScore 오타 (C2) | intelligenceService.ts | L589 |
| slimCandidates 생성 (C3) | intelligenceService.ts | L575-597 |
| AI conviction 대체 (C4) | AlphaAnalysis.tsx | L2933 |
| aiVerdict 허용값 | intelligenceService.ts | L1032 (batchPrompt) |
| aiVerdict ALPHA_SCHEMA | intelligenceService.ts | L235 |
| aiVerdict SYSTEM_INSTRUCTION | intelligenceService.ts | L623 |
| debtToEquity=0 처리 (C6) | DeepQualityFilter.tsx | L53-58 (imputeValue) |
| ROIC 공식 (C7) | FundamentalAnalysis.tsx | L184-190 |
| EMA 초기화 (C8) | TechnicalAnalysis.tsx | L383 |
| ictStopLoss (C9) | IctAnalysis.tsx | L555 |
| otePrice (C9) | IctAnalysis.tsx | L552 |
| Guard Control stale (C10) | exec-engine/index.ts | L1387-1396 |
| RISK_OFF 가중치 (H1) | IctAnalysis.tsx | L607-610 |
| PREMIUM 다운그레이드 (H2) | intelligenceService.ts | L612 |
| engineFallbackUsed (H4) | AlphaAnalysis.tsx | L4120-4122 |
| ADX 단순 평균 (H7) | TechnicalAnalysis.tsx | L490 |
| PEG Ratio (H3) | UniverseGathering.tsx | L684-686 |
| API 키 목록 | constants.ts | L45-L121 |
| Perplexity 이중 하드코딩 | PreliminaryFilter.tsx | L272 |
| Z-Score Proxy | DeepQualityFilter.tsx | L308 |
| KST 타임스탬프 오류 | UniverseGathering.tsx | L805-813 |
| KST 타임스탬프 오류 | PreliminaryFilter.tsx | L438-439 |
| KST 타임스탬프 오류 | DeepQualityFilter.tsx | L400 |
| uploadFile 응답 미검증 | UniverseGathering.tsx | L793-801 |
| fetchCandlesFromAPI 미연결 | TechnicalAnalysis.tsx | L1112-1195 |
| bare except OHLCV sync | harvester.py | L252 |
| bare except Telegram | harvester.py | L73 |
| bare except find_file_id | harvester.py | L84 |
| bare except download_json | harvester.py | L98 |
| bare except quarterly_fin | harvester.py | L874 |
| Stage6 Gate 순서 | AlphaAnalysis.tsx | L3392-3485 |
| exec-engine Gate 순서 | exec-engine/index.ts | L1633-1848 |
| Stage6 Final Gate bonus/penalty | AlphaAnalysis.tsx | L3030-3143 |
| buildDryExecPayloads() | exec-engine/index.ts | L1633-1848 |
| conviction gate | exec-engine/index.ts | L1737-1740 |
| stop distance gate | exec-engine/index.ts | L1755-1758 |
| main() exec-engine | exec-engine/index.ts | L3043-3150 |
| main() market-guard | exec-engine/market-guard.ts | L1540-1621 |
| Market Guard L1~L3 임계값 | exec-engine/market-guard.ts | L730-769 |
| resolveGuardControlGate | exec-engine/index.ts | L1351-1432 |

---

*분석 완료: 2026-03-17 KST*  
*기반 분석 파일: stage0_2_analysis.md, stage3_4_harvester_analysis.md, stage5_6_intelligence_analysis.md, exec_engine_analysis.md, data_crossvalidation.md*  
*총 분석 코드: UniverseGathering.tsx + PreliminaryFilter.tsx + DeepQualityFilter.tsx + FundamentalAnalysis.tsx + TechnicalAnalysis.tsx + harvester.py + IctAnalysis.tsx + AlphaAnalysis.tsx + intelligenceService.ts + exec-engine/index.ts + exec-engine/market-guard.ts + constants.ts + types.ts = 25,000+ 라인*

---

## 부록 A: 스테이지별 전체 버그 목록 (심각도 분류)

### A-1. Stage 0 (UniverseGathering.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S0-001 | Medium | L87-100 | `normalizePercent()` 함수 정의됐지만 미사용, `toPercent()`와 이중 정의 |
| BUG-S0-002 | Low | L639, L740 | TypeScript `as MasterTicker[]` 강제 캐스팅, null 완전 제거 미보장 |
| BUG-S0-003 | **High** | L684-686 | PEG Ratio 계산 오류 — revGrowthRaw 스케일 미검증 |
| BUG-S0-004 | Low | L738 | `dataQuality 'MEDIUM'` 미할당 — `processCylinderData`에서 항상 HIGH 또는 LOW |
| BUG-S0-005 | Low | L163-173 | `autoStart useEffect` 의존성 누락 (`isGathering`, `accessToken`) |
| BUG-S0-006 | Low | L294-299 | `fetchExternalStock()` `toPercent` 불일치 (`dividendYield` keepRaw 사용) |
| BUG-S0-007 | Medium | L614 | `setGatheredRegistry` 26회 과호출 — 불필요한 Map 복사 및 리렌더링 |
| BUG-S0-008 | Medium | L230 | 심볼 검색 `useEffect` 무한 루프 위험 (`gatheredRegistry` deps 포함) |
| BUG-S0-009 | Low | L369-376 | WebSocket heartbeat — GOOD/CRITICAL 상태 미할당, 5초 이전 무조건 EXCELLENT |
| BUG-S0-010 | **High** | L793-801 | `uploadFile()` 응답 미검증 — 업로드 실패 시 무음 처리 |
| BUG-S0-011 | **High** | L805-813 | KST 타임스탬프 UTC 출력 — 파일명 시간 오류 |

### A-2. Stage 1 (PreliminaryFilter.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S1-001 | **Critical** | L316, L330 | Gemini 모델명 오류 — `gemini-3.1-pro-preview` 존재하지 않음 |
| BUG-S1-002 | Medium | L268-272 | Perplexity 키 이중 하드코딩 (constants.ts와 중복) |
| BUG-S1-003 | Medium | L307 | `process.env.API_KEY` Vite에서 미지원 |
| BUG-S1-004 | Medium | L285-288 | Perplexity `res.ok` 체크 순서 오류 (json 파싱 먼저) |
| BUG-S1-005 | Low | L406 | `s.per > 0` 조건 — MasterTicker에 `per` 필드 없음, 항상 false |
| BUG-S1-006 | Medium | L83-90 | UI `filteredCount`와 실제 커밋 수 불일치 (2개 vs 5개 조건) |
| BUG-S1-007 | Low | L93-98 | `autoStart useEffect` 의존성 누락 (`loading`, `rawUniverse.length`) |
| BUG-S1-008 | Medium | L141-144 | Stage 0 파일 검색 폴더 제한 없음 (Drive 전체 검색) |
| BUG-S1-009 | Low | L94 | autoStart 조건 parent 컴포넌트에 의존적 |

### A-3. Stage 2 (DeepQualityFilter.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S2-001 | Medium | L70 | `sanitizeData()` ROE > 200 체크 — Stage 0 toPercent와 이중 스케일 상호작용 |
| BUG-S2-002 | **Critical** | L53-58 | `imputeValue allowZero=false` — `roe=0`, `debtToEquity=0` 결측 오처리 |
| BUG-S2-003 | Low | L280-283 | `profitScore` 금융섹터 스케일 불균형 — 금융주가 더 쉽게 만점 |
| BUG-S2-004 | **High** | L308 | Z-Score Proxy 과단순화 — UI에 "Altman Z-Score"로 오표시 |
| BUG-S2-005 | Low | L103-108 | `autoStart useEffect` 의존성 누락 (`loading`) |
| BUG-S2-006 | Low | L364 | `fullHistory.slice(0, 4)` — 4개 임의 제한 |
| BUG-S2-007 | Medium | L187 | Stage 1 파일 검색 폴더 제한 없음 |
| BUG-S2-008 | Medium | L375-382 | 동적 스케일 평균 점수 기준 편향 — 서바이버십 바이어스 |
| BUG-S2-009 | **High** | L176 | `uploadFile()` 응답 미검증 |
| BUG-S2-010 | Low | L533 | `isVisible` prop이 RadarChart에만 사용 |
| BUG-S2-011 | **Critical** | L57 | `debtToEquity=0` (무부채)를 결측으로 처리 — 역전 현상 |

### A-4. Stage 3 (FundamentalAnalysis.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S3-001 | **Critical** | L184-190 | ROIC 공식 오류 — debtToEquity를 부채액으로 오해 |
| BUG-S3-002 | Medium | L99 | Median off-by-one — 짝수 배열에서 상위 중앙값 반환 |
| BUG-S3-003 | Medium | L72 | `pbr > 500 → 0` 처리로 내재가치 왜곡 |
| BUG-S3-004 | Medium | L519-524 | `uploadFile()` 중복 생성 — 기존 파일 확인 없이 항상 새 파일 |
| BUG-S3-005 | Low | L54 | `toPct` 임계값 10 — ROE 9%인 경우 → 990%로 변환 오류 |
| BUG-S3-006 | Low | inner L187 | `isCashFlowWarning` 플래그 사용 불일치 — 이중 패널티 가능성 |
| BUG-S3-007 | Low | inner L204 | `eliteCandidates` 상한 없음 — 300개 초과 저장 가능 |

### A-5. Stage 4 (TechnicalAnalysis.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S4-001 | **Critical** | L383 | EMA 초기화 오류 — `data[0]` 대신 SMA 사용해야 함 |
| BUG-S4-002 | **Critical** | L1112-1195 | `fetchCandlesFromAPI()` 미연결 — API fallback 작동 안함 |
| BUG-S4-003 | Medium | L1700-1738 | `scoreBreakdown finalScore` 이중 계산 오류 |
| BUG-S4-004 | **High** | L490 | ADX 단순 평균 — 표준 Wilder Smoothing 미적용 |
| BUG-S4-005 | Low | L404 | OBV 초기값 0 고정 |
| BUG-S4-006 | Medium | L1553-1555 | 벤치마크 미존재 시 RS Rating 대체 공식 부정확 |
| BUG-S4-007 | Low | L1209 vs L1521 | POWER_TREND 조건 Heuristic/Real 불일치 |
| BUG-S4-008 | Low | L370 | BB StdDev 모집단 분산 사용 (표준은 표본) |
| BUG-S4-009 | Low | L1557 | 마지막 20봉 평균 거래량 계산 — slice(0,-1)로 당일 제외 (의도적이지만 문서화 부족) |
| BUG-S4-010 | Low | L1373, L1390 | `try {} catch {}` 빈 catch 블록 — 에러 내용 미기록 |

### A-6. Harvester (harvester.py) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-PY-001 | **High** | L73 | `send_telegram()` bare except — 알림 실패 무음 처리 |
| BUG-PY-002 | Medium | L84 | `find_file_id()` bare except — 인증 오류와 일반 오류 동일 처리 |
| BUG-PY-003 | Medium | L98 | `download_json()` bare except — JSON 파싱 오류 재시도 낭비 |
| BUG-PY-004 | **Critical** | L252 | `sync_ohlcv_incremental()` bare except — OHLCV 실패 원인 완전 손실 |
| BUG-PY-005 | Low | L874 | `quarterly_financials` bare except — 재무제표 실패 무음 처리 |
| BUG-PY-006 | Medium | L743 | `set()` 사용 — 티커 처리 순서 비결정적 |
| BUG-PY-007 | Low | L709 | `is_weekend_update = (weekday() == 5)` — 일요일 누락 |
| BUG-PY-008 | Low | L183-184 | DST 미반영 — UTC-5 하드코딩 (EST, EDT 혼동) |
| BUG-PY-009 | Medium | L929-933 | Daily 모드 재시도 로직 불완전 — SSL/EOF만 delay |

### A-7. Stage 5 (IctAnalysis.tsx) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S5-001 | **Critical** | L555 | `ictStopLoss = low52 * 0.985` — 52주 저점 기반, stop_too_wide 차단 유발 |
| BUG-S5-002 | **Critical** | L552 | `otePrice = high52 - (range * 0.705)` — 52주 범위 기반 OTE |
| BUG-S5-003 | **High** | L607-610 | RISK_OFF 가중치 합 1.10 (110%) — 정규화 없음 |
| BUG-S5-004 | Medium | L215-219 | `obScore` 계산이 실제 Order Block 미반영 (trend+rsi+minervini 기반) |
| BUG-S5-005 | Medium | L224-229 | `smFlow` 가격 변동 방향 미반영 (절대값만 계산) |

### A-8. Stage 6 (AlphaAnalysis.tsx + intelligenceService.ts) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-S6-001 | **Critical** | intelligenceService.ts L589 | `ictMetrics.displacementScore` 필드 없음 — displacement 항상 0 |
| BUG-S6-002 | **Critical** | intelligenceService.ts L575-597 | slimCandidates fundamentalScore/technicalScore/compositeAlpha 누락 |
| BUG-S6-003 | **Critical** | intelligenceService.ts L1032 | Gemini batchPrompt aiVerdict 허용값 ALPHA_SCHEMA와 불일치 |
| BUG-S6-004 | **Critical** | AlphaAnalysis.tsx L2933 | AI convictionScore가 quant 점수 완전 대체 |
| BUG-S6-005 | **High** | intelligenceService.ts L612 | PREMIUM 자동 다운그레이드 — 절대적 규칙 |
| BUG-S6-006 | **High** | AlphaAnalysis.tsx L4120-4122 | engineFallbackUsed 오탐 — SHARDED 정상 처리도 fallback으로 분류 |
| BUG-S6-007 | Medium | AlphaAnalysis.tsx L3017 | minimumVerifiedAiCount 기준 과도 — Perplexity fallback 시 달성 어려움 |
| BUG-S6-008 | Medium | AlphaAnalysis.tsx L1940-2037 | `buildStructuredOutlookFallback` 기계적 텍스트 생성 |
| BUG-S6-009 | Low | AlphaAnalysis.tsx L2597-2603 | integrityScore 계산 시 필드값=0이면 unfilled로 처리 |
| BUG-S6-010 | Low | intelligenceService.ts L439 | backtest `avgWin` 단순화 — 실제 P&L 추적 아님 |

### A-9. Exec Engine (index.ts + market-guard.ts) 전체 버그 목록

| ID | 심각도 | 라인 | 설명 |
|----|--------|------|------|
| BUG-EE-001 | Medium | L1755 | `stopDistancePct = (entry - stop) / entry * 100` — Stage6와 계산 기준 불일치 가능성 |
| BUG-EE-002 | Low | L908 | `parseCandidateSummaries` 6개 하드코딩 slice |
| BUG-EE-003 | **Critical** | L1387-1396 | Guard Control stale 시 항상 unblocked |
| BUG-EE-004 | Low | L707-709 | Idempotency Key `side` "buy" 하드코딩 — 미래 short 포지션 지원 불가 |
| BUG-EE-005 | Low | L1472-1473 | `riskOnThreshold` clamping 경고 없음 |
| BUG-EE-006 | Low | L1307-1312 | `applyRegimeGuards shouldSave` 조건 혼동 가능 |
| BUG-EE-007 | **High** | 없음 | `earningsBlackoutDays` exec-engine에서 제어 불가 |
| BUG-EE-008 | Low | market-guard.ts L1124 | `executeReducePositions50` 수량 반올림 미처리 |
| BUG-EE-009 | Low | market-guard.ts L946-950 | `patchOrder` 성공 코드 200만 허용 |
| BUG-EE-010 | Low | L2758-2796 | Race Condition — `applyOrderIdempotency` 비원자적 Read-Modify-Write |
| BUG-EE-011 | Low | L2568-2569 | `candidateMap` 중복 등록 시 마지막 값 우선 (조용히 덮어씀) |

---

## 부록 B: Stage 5 전체 50종목 ICT 스코어 상위 20위

| 순위 | 종목 | pdZone | ictScore | ictPos | otePrice | verdict | marketState |
|------|------|--------|----------|--------|----------|---------|-------------|
| 1 | CALM | DISCOUNT | 100.00 | 0.2924 | 87.99 | BUILD POSITION | ACCUMULATION |
| 2 | VIST | PREMIUM | 98.06 | 0.9776 | 41.62 | AGGRESSIVE BUY | MARKUP |
| 3 | GAIN | PREMIUM | 92.46 | 0.6633 | 12.58 | AGGRESSIVE BUY | MARKUP |
| 4 | AMPY | PREMIUM | 90.41 | 0.9447 | 3.60 | AGGRESSIVE BUY | MARKUP |
| 5 | UTHR | PREMIUM | 88.11 | 0.9573 | 349.92 | AGGRESSIVE BUY | MARKUP |
| 6 | VAL | PREMIUM | 85.78 | 0.8873 | 49.29 | BUILD POSITION | ACCUMULATION |
| 7 | TIGO | PREMIUM | 82.49 | 0.9374 | 40.78 | WAIT | MANIPULATION |
| 8 | DEC | PREMIUM | 73.37 | 0.6686 | 12.08 | BUY DIP | RE-ACCUMULATION |
| 9 | ADBE | DISCOUNT | 70.53 | 0.0282 | 296.99 | BUILD POSITION | ACCUMULATION |
| 10 | BCE | PREMIUM | 69.32 | 0.8478 | 22.12 | WAIT | MANIPULATION |
| 11 | KTB | EQUILIBRIUM | 68.56 | 0.4727 | 60.92 | WAIT | DISTRIBUTION |
| 12 | PDD | DISCOUNT | 68.32 | 0.2971 | 102.54 | WAIT | MANIPULATION |
| 13 | DAVE | PREMIUM | 68.25 | 0.6632 | 130.65 | BUY DIP | RE-ACCUMULATION |
| 14 | INMD | DISCOUNT | 66.71 | 0.1288 | 14.60 | WAIT | DISTRIBUTION |
| 15 | INVA | PREMIUM | 66.40 | 0.6385 | 19.07 | WAIT | MANIPULATION |
| 16 | VEON | EQUILIBRIUM | 65.59 | 0.5450 | 43.24 | BUILD POSITION | ACCUMULATION |
| 17 | AMSC | DISCOUNT | 63.27 | 0.3015 | 30.65 | WAIT | DISTRIBUTION |
| 18 | RCI | PREMIUM | 62.87 | 0.8653 | 28.48 | WAIT | DISTRIBUTION |
| 19 | UBER | DISCOUNT | 58.63 | 0.3071 | 72.83 | WAIT | DISTRIBUTION |
| 20 | PD | DISCOUNT | 57.96 | 0.0676 | 10.15 | WAIT | DISTRIBUTION |

---

## 부록 C: Stage 4 기술분석 scoreBreakdown (Stage6 12종목)

RISK_OFF 적용 결과: 전 종목 `signalBonus=0`, `regimePenalty=10` 일괄 적용

| 종목 | rawSignalScore | signalBonus | regimePenalty | eventPenalty | liquidityPenalty | hygienePenalty | finalScore |
|------|---------------|------------|--------------|-------------|-----------------|----------------|-----------|
| VIST | 99 | 0 | 10 | 0 | 0 | 0 | **89** |
| UTHR | 85.91 | 0 | 10 | 0 | 0 | 0 | **75.91** |
| VEON | 44.61 | 0 | 10 | 0 | **4** | 0 | **30.61** |
| KTB | 39.31 | 0 | 10 | 0 | 0 | 0 | **29.31** |
| ADBE | 20.85 | 0 | 10 | 0 | 0 | 0 | **10.85** |
| PDD | 32.96 | 0 | 10 | 0 | 0 | 0 | **22.96** |
| TIGO | 85.60 | 0 | 10 | 0 | 0 | 0 | **75.60** |
| EVER | 4.40 | 0 | 10 | 0 | 0 | 0 | **1** (floor) |
| INVA | 49.59 | 0 | 10 | 0 | 0 | 0 | **39.59** |
| DAVE | 50.12 | 0 | 10 | 0 | 0 | 0 | **40.12** |
| INMD | 26.93 | 0 | 10 | 0 | 0 | 0 | **16.93** |
| AMSC | 18.09 | 0 | 10 | 0 | 0 | 0 | **8.09** |

> **VEON**: 유일하게 liquidityPenalty=4 적용 (12종목 중 유일)  
> **EVER**: rawSignalScore 4.40 - regimePenalty 10 = -5.60 → floor 1로 클리핑

---

## 부록 D: Stage 6 compositeBreakdown 상세 (12종목)

RISK_OFF 모드: `fundamentalScore × 0.70 + technicalScore × 0.30 + ictScore × 0.10` ÷ **1.10 (미정규화!)**

| 종목 | baseFund | baseTech | baseICT | signalQuality | signalCombo | minervini | heat | dataDoubtful | sectDiversMult | preDivers | postDivers | sectorBucket |
|------|----------|----------|---------|--------------|-------------|----------|------|-------------|----------------|-----------|-----------|-------------|
| VIST | 46.20 | 26.70 | 9.81 | +2 | +2 | +2 | 0 | ×1.00 | 1.00 | 88.71 | 88.71 | LEADER |
| TIGO | 48.37 | 22.68 | 8.25 | +2 | 0 | +2 | 0 | ×1.00 | 1.00 | 83.30 | 83.30 | LEADER |
| UTHR | 45.25 | 22.77 | 8.81 | +2 | +2 | +2 | 0 | ×1.00 | 1.00 | 82.84 | 82.84 | LEADER |
| EVER | 66.19 | 0.30 | 4.98 | +2 | 0 | 0 | 0 | ×1.00 | 1.00 | 73.47 | 73.47 | LEADER |
| INVA | 50.40 | 11.88 | 6.64 | +2 | 0 | +2 | 0 | ×1.00 | 1.00 | 72.92 | 72.92 | LEADER |
| DAVE | 51.80 | 12.04 | 6.83 | +2 | 0 | 0 | 0 | ×1.00 | 1.00 | 72.66 | 72.66 | LEADER |
| KTB | 50.26 | 8.79 | 6.86 | +2 | 0 | 0 | 0 | ×1.00 | 1.00 | 67.91 | 67.91 | LEADER |
| PDD | 48.05 | 6.89 | 6.83 | +2 | 0 | 0 | 0 | ×1.00 | 1.00 | 63.77 | 63.77 | LEADER |
| INMD | 56.63 | 5.08 | 6.67 | 0 | 0 | 0 | 0 | ×1.00 | **0.92** | 68.38 | **62.91** | **WARNING** |
| ADBE | 50.40 | 3.25 | 7.05 | +2 | 0 | 0 | 0 | ×1.00 | 1.00 | 62.70 | 62.70 | LEADER |
| AMSC | 48.11 | 2.43 | 6.33 | 0 | 0 | 0 | 0 | ×1.00 | 1.00 | 56.86 | 56.86 | LEADER |
| VEON | 47.21 | 9.18 | 6.56 | +2 | 0 | 0 | **+1.5** | **×0.97** | **0.92** | 61.55 | **56.63** | **WARNING** |

> **INMD**: sectorCount=6 → multiplier=0.92, rankRaw 14위에서 rankFinal 23위로 9단계 하락  
> **VEON**: heat penalty 1.5 + dataQuality 0.97 + sectorDivers 0.92 → preDivers 61.55에서 56.63으로 하락

---

## 부록 E: Regime 관련 임계값 통합표

### E-1. exec-engine VIX/Regime 임계값 (2026-03-16 실제값)

| 파라미터 | 환경변수 | .env 기본값 | **실제 동작값** |
|---------|---------|-----------|-------------|
| RISK_OFF 전환 | VIX_RISK_OFF_THRESHOLD | 25 | **24** (GitHub Actions 변수) |
| RISK_ON 복귀 | VIX_RISK_ON_THRESHOLD | 22 | 22 |
| Snapshot 최대 연령 | REGIME_SNAPSHOT_MAX_AGE_MIN | 10분 | 10분 |
| 최소 보유 시간 | REGIME_MIN_HOLD_MIN | 30분 | 30분 |
| Quality 최저 점수 | REGIME_QUALITY_MIN_SCORE | 60 | 60 |
| VIX 불일치 임계 | REGIME_VIX_MISMATCH_PCT | 8% | 8% |

### E-2. VIX 소스별 실제 값 (2026-03-16 dry-run)

| 소스 | 값 | 상태 |
|------|-----|------|
| Finnhub | 실패 (invalid_quote) | 사용 불가 |
| **CNBC Direct** | **25.47** | **최종 사용됨** |
| Market Snapshot | 27.19 | Stale (42.5분) |
| CNBC RapidAPI | disabled | 스킵 |

**VIX 불일치 비율:** (27.19 - 25.47) / 25.47 = **6.75%** — 불일치 임계값 8% 미만이어서 점수 차감 없음

---

## 부록 F: Perplexity vs Gemini AI 프롬프트 비교

| 구분 | Perplexity | Gemini |
|------|-----------|--------|
| **AI 역할** | "JSON 생성 엔진 (챗봇 아님)" | "엘리트 헤지펀드 매니저" |
| **aiVerdict 허용값** | SYSTEM_INSTRUCTION: STRONG_BUY, BUY, PARTIAL_EXIT | batchPrompt: BUY, HOLD, WATCH (**불일치!**) |
| **응답 스키마** | 자유 형식 (JSON 강제만) | ALPHA_SCHEMA (typed, structured) |
| **웹 검색** | Perplexity Sonar 내장 | `googleSearch` 도구 명시 사용 |
| **배치 크기** | 6개씩 sharded | 25개씩 batched |
| **온도** | 0.1 (매우 낮음) | 명시 없음 (기본값) |
| **토큰 한도** | max_tokens=3,200 | 없음 |
| **Korean 응답** | selectionReasons, investmentOutlook 한국어 요구 | 영어도 허용 |
| **실제 활성화** | ✅ (Gemini 폴백 시) | ❌ (모델명 오류로 항상 실패) |

**핵심 문제:** Gemini batchPrompt의 WATCH verdict가 ALPHA_SCHEMA에 없어 처리 불가. Perplexity는 max_tokens=3,200으로 12종목 분석 시 종목당 약 267토큰 — 매우 짧은 분석.

---

## 부록 G: Stage 6 최종 결과 전체 요약 (12종목)

| 종목 | finalDecision | decisionReason | executionBucket | aiVerdict | compositeAlpha | executionScore | RR | earningsDays |
|------|--------------|----------------|----------------|-----------|---------------|---------------|-----|-------------|
| VIST | BLOCKED_RISK | blocked_stop_too_wide | WATCHLIST | STRONG_BUY | 88.71 | 45 | 3.32 | 37 |
| UTHR | BLOCKED_RISK | blocked_stop_too_wide | WATCHLIST | STRONG_BUY | 82.84 | 45 | 2.79 | 44 |
| **VEON** | **EXECUTABLE_NOW** | executable_pullback | **EXECUTABLE** | BUY | 56.63 | **90.2** | **3.63** | 58 |
| **KTB** | **EXECUTABLE_NOW** | executable_pullback | **EXECUTABLE** | BUY | 67.91 | 73.7 | 2.72 | 50 |
| ADBE | WAIT_PRICE | wait_earnings_data_missing | WATCHLIST | BUY | 62.70 | 38.3 | 1.57 | None |
| PDD | BLOCKED_EVENT | blocked_earnings_window | WATCHLIST | BUY | 63.77 | 33.5 | 2.76 | **3** |
| TIGO | BLOCKED_RISK | blocked_verdict_risk_off | — | PARTIAL_EXIT | 83.30 | — | — | 57 |
| EVER | BLOCKED_RISK | blocked_quality_conviction_floor | — | BUY | 73.47 | — | — | 49 |
| INVA | BLOCKED_RISK | blocked_verdict_risk_off | — | PARTIAL_EXIT | 72.92 | — | — | 51 |
| DAVE | BLOCKED_RISK | blocked_verdict_risk_off | — | PARTIAL_EXIT | 72.66 | — | — | 52 |
| INMD | BLOCKED_RISK | blocked_verdict_risk_off | — | BUY | 62.91 | — | — | 43 |
| AMSC | BLOCKED_RISK | blocked_verdict_risk_off | — | PARTIAL_EXIT | 56.86 | — | — | None |

**차단 이유 분포:**
| 이유 | 건수 |
|------|------|
| blocked_verdict_risk_off (PARTIAL_EXIT verdict) | 4 |
| blocked_stop_too_wide (C9 버그 — 52주 StopLoss) | 2 |
| EXECUTABLE_NOW | 2 |
| WAIT_PRICE (earnings missing) | 1 |
| BLOCKED_EVENT (earnings window 3일) | 1 |
| blocked_quality_conviction_floor | 1 |
| (기타) | 1 |

**버그 수정 후 예상 변화:**
- C1(Gemini 활성화) + C3(slimCandidates 개선) → PARTIAL_EXIT 4건 감소 가능
- C9(StopLoss 개선) → VIST, UTHR blocked_stop_too_wide → EXECUTABLE 전환 가능
- C4(conviction 블렌딩) → KTB conviction 57 → 약 80+ (minConviction=78 통과 가능)

---

*최종 보고서 작성 완료: 2026-03-17 KST*  
*GPT-Codex 검증용 — 모든 라인 번호, 변수명, 파일명은 원본 코드 기준*
