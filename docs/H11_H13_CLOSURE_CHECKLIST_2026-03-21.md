# H11/H13 최종 종료 체크리스트 (2026-03-21)

Doc-Tier: P1 (Operational)


## 목적
- 초정밀 보고서의 `H11`, `H13` 항목을 **완료/미완료로 명확히 판정**한다.
- 판정 기준은 코드 + 최신 산출물(2026-03-21 KST 실행) 교차검증으로 고정한다.

## 검증 범위
- 코드:
  - `components/DeepQualityFilter.tsx`
  - `sidecar-template/alpha-exec-engine/src/index.ts`
  - `sidecar-template/alpha-exec-engine/.env.example`
  - `sidecar-template/alpha-exec-engine/README.md`
- 산출물:
  - `/Users/givet-bsm/Downloads/STAGE2_ELITE_UNIVERSE_2026-03-21_00-26-22.json`
  - `/Users/givet-bsm/Downloads/STAGE3_FUNDAMENTAL_FULL_2026-03-21_00-38-47.json`
  - `/Users/givet-bsm/Downloads/STAGE6_ALPHA_FINAL_2026-03-21_01-08-16.json`
  - `/Users/givet-bsm/Downloads/sidecar-state-23351591518.zip`

---

## H11 판정 (Z-Score Proxy 오표시)

### 완료 기준
1. 비금융/금융을 동일 공식으로 처리하지 않고, 모델을 명시적으로 분리한다.
2. UI/설명 텍스트가 "Altman 단일 지표" 오인을 유발하지 않는다.
3. Stage2 산출물에 `zScoreModel`, `zScoreCoveragePct`, `zScoreConfidence`가 실제 기록된다.
4. 최신 실행 데이터에서 모델 분포가 일관된다.

### 코드 확인
- `components/DeepQualityFilter.tsx:33-37`
  - 인사이트 설명이 `Distress Risk Score`로 변경되고, 비금융 Altman/금융 안정성 모델 분리 설명 포함.
- `components/DeepQualityFilter.tsx:96-187`
  - `computeDistressScore()`에서
    - 비금융: Altman Z 식 사용 (`model='ALTMAN_Z'`)
    - 금융: `FINANCIAL_STABILITY` 모델 사용
    - 데이터 부족 시 비금융만 `SAFETY_PROXY`로 하향
- `components/DeepQualityFilter.tsx:745-752`
  - 결과에 `zScoreProxy`, `zScoreModel`, `zScoreCoveragePct`, `zScoreConfidence` 저장.
- `components/DeepQualityFilter.tsx:804-815`
  - 런타임 로그에 모델 분포 출력(`[DISTRESS] ...`).

### 산출물 확인
- `STAGE2_ELITE_UNIVERSE_2026-03-21_00-26-22.json`
  - 300종목 모두 `zScoreProxy/zScoreModel/zScoreCoveragePct/zScoreConfidence` 존재.
  - 모델 분포: `FINANCIAL_STABILITY=189`, `ALTMAN_Z=111`, `SAFETY_PROXY=0`.
- `STAGE3_FUNDAMENTAL_FULL_2026-03-21_00-38-47.json`
  - Stage2에서 전달된 distress 필드 300/300 유지.

### H11 최종 판정
- **완료 (PASS)**

---

## H13 판정 (Conviction Floor 과도/고정 임계값)

### 완료 기준
1. `minConviction=78` 단일 고정이 아니라, 시장/품질/샘플 기반 적응형 임계값을 사용한다.
2. floor/ceiling 클램프를 환경변수로 제어 가능하다.
3. 운영 로그에 계산 근거가 노출된다.
4. 최신 sidecar 실행에서 적응형 임계값이 실제 적용된다.

### 코드 확인
- `sidecar-template/alpha-exec-engine/src/index.ts:1854-1909`
  - `base + marketTighten - qualityRelief`, `sampleCap` 반영.
  - `minConvictionFloor/minConvictionCeiling` 클램프 적용 후 최종 `minConviction` 산출.
  - `minConvictionPolicy` 구조체로 근거값 저장.
- `sidecar-template/alpha-exec-engine/src/index.ts:2001-2002`
  - 최종 게이트에서 `conviction_below_floor` 스킵 처리.
- `sidecar-template/alpha-exec-engine/src/index.ts:2535`
  - `[CONV_POLICY] ...` 로그로 감사 가능.
- `sidecar-template/alpha-exec-engine/.env.example:44-46,53-55`
  - `DRY_*_MIN_CONVICTION_{FLOOR,CEILING}` 추가.
- `sidecar-template/alpha-exec-engine/README.md:164-173`
  - Adaptive Conviction Gate 운용 설명 문서화.

### 산출물 확인
- `sidecar-state-23351591518.zip:last-dry-exec-preview.json`
  - `minConviction=75.6` (고정 78 아님)
  - `minConvictionPolicy`:
    - `base=78`
    - `marketTighten=0.63`
    - `qualityRelief=3`
    - `sampleQuantileValue=88`, `sampleCap=94`
    - `floor=58`, `ceiling=90`
  - 스킵 사유 분포:
    - `entry_blocked:...=4`
    - `conviction_below_floor=1`

### H13 최종 판정
- **완료 (PASS)**

---

## 최종 상태 요약

| 항목 | 상태 | 근거 |
|---|---|---|
| H11 | **완료** | 코드 분리(Altman/Financial Stability) + Stage2/3 필드 100% + 모델 분포 검증 |
| H13 | **완료** | 적응형 conviction gate 코드 + env 제어 + sidecar 실측값(`75.6`) 검증 |

## 비고
- 이번 판정은 "버그 정의 기준" 종료 판정이다.
- 성능 튜닝(예: floor/ceiling 값 최적화)은 운영 정책 단계이며, 완료/미완료와 별개다.
