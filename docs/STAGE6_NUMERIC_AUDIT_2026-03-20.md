# STAGE6 Numeric Audit (2026-03-20)

## 목적
- Stage6 산출값이 **원천 데이터 + 수식 + 자리수(반올림)** 기준으로 정확한지 정밀 검증.
- 검증 범위: `Part1(12)`, `Part2(12)`, `Final(6)` 전종목.

## 검증 대상 파일
- `/Users/givet-bsm/Downloads/STAGE6_PART1_SCORED_2026-03-19_22-54-25.json`
- `/Users/givet-bsm/Downloads/STAGE6_PART2_AI_RESULT_FULL_2026-03-19_22-56-04.json`
- `/Users/givet-bsm/Downloads/STAGE6_ALPHA_FINAL_2026-03-19_22-56-08.json`

## 기준 수식(코드 원본)
- Stage6 계약/게이트/점수:
  - `components/AlphaAnalysis.tsx` (`deriveExecutionContractFields`, `computeExecutionScore`, `computeAlphaQualityScore`)
- Quant Strategic Master Framework:
  - `components/AlphaAnalysis.tsx` (`quantMetrics` 블록)

## 검증 항목
1. **데이터셋 정합성**
   - Part1 ↔ Part2 심볼셋 일치 여부
   - Final 심볼셋이 Part2 부분집합인지
2. **가격 박스/거리 계산**
   - `riskRewardRatioValue`
   - `entryDistancePct`, `stopDistancePct`, `targetDistancePct`
3. **수익률/라벨 파싱**
   - `expectedReturnPct` vs `gatedExpectedReturn|expectedReturn|rawExpectedReturn` 파싱 결과
4. **핵심 점수**
   - `executionScore` 재계산 일치 여부
   - `qualityScore` 재계산 일치 여부
5. **프레임워크 분산 확인(이상치 오해 방지)**
   - `VAPS Qty`, `IVG` 분포

## 결과 요약
- Part1/Part2 심볼셋: **12/12 일치**
- Final ⊂ Part2: **6/6 일치**
- `riskRewardRatioValue` 일치: **12/12**
- `entryDistancePct` 일치: **12/12**
- `stopDistancePct` 일치: **12/12**
- `targetDistancePct` 일치: **12/12**
- `expectedReturnPct` 일치: **12/12**
- `executionScore` 일치: **12/12**
- `qualityScore` 일치: **12/12**
- 검증 이슈: **0건**

## 관찰 포인트(정상 동작)
- `VAPS Qty`가 종목별로 크게 차이 나는 것은 정상:
  - 공식: `Qty = floor(1000 / (Entry - Stop))`
  - `Entry-Stop`이 좁을수록 수량이 커짐.
  - 예: INVA는 stop gap이 매우 좁아 Qty가 크게 계산됨.
- `IVG`가 100%+로 보이는 것도 현재 로직상 정상:
  - `fairValueGap = (intrinsicValue - price) / price * 100`
  - 펀더멘털 intrinsic 상한 처리(`price * 3`) 때문에 최대치가 약 `200%` 부근까지 가능.

## 결론
- 이번 Stage6 데이터(Part1/Part2/Final) 기준으로,
  - **수식/소수점/반올림/자리수 오류는 발견되지 않았고**
  - **정합성 검증은 PASS**.
- 따라서 현재 수치 체계는 “좋은 분석기로 쓰레기 출력” 상태가 아니라, **계약된 계산 로직대로 정확히 산출되는 상태**로 판단.

## 다음 권고
- 운영 측면에서 혼동을 줄이기 위해:
  - VAPS 설명 텍스트를 카드/툴팁에 더 직관적으로 노출
  - IVG에 상한/구간 배지(예: `<=50`, `50~120`, `120+`) 추가 검토
