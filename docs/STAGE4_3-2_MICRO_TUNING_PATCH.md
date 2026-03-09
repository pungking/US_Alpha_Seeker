# Stage4 3-2 Micro Tuning Patch Plan

## Goal
- Stage4(`TechnicalAnalysis`)의 점수 산식을 감사 가능(auditable)하게 미세조정.
- 기존 UI/디자인/분석기법/파이프라인 흐름은 유지.
- 결과를 바꾸기 위한 임의 조정 금지. (정량 근거 기반만 허용)

## Scope
- Primary: `components/TechnicalAnalysis.tsx`
- Optional(minimal): `constants.ts` (임계값 상수 추가 시에만)

## Hard Constraints
- Stage4 화면 디자인/레이아웃 변경 금지
- 기존 지표 계산 로직 삭제 금지
- Stage3/5/6 동작 방식 변경 금지
- 기존 저장 포맷 파괴 금지 (필드 추가만 허용)

---

## Patch Checklist

### 3-2A) Score Breakdown 고정 (감사 가능성)
- [x] `scoreBreakdown` 필드 스키마 추가
  - `rawSignalScore`
  - `signalBonus`
  - `regimePenalty`
  - `eventPenalty`
  - `liquidityPenalty`
  - `hygienePenalty`
  - `finalScore`
- [x] `finalScore`가 기존 `technicalScore`와 동일하게 계산/저장되는지 검증
- [x] 기존 UI는 `technicalScore` 표시 유지

### 3-2B) Regime Overlay 패널티 정형화
- [x] `MARKET_REGIME_SNAPSHOT` 기반 단계형 패널티 함수 정리
- [x] VIX 임계값(`STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL`) 대비 거리 기반 패널티 적용
- [x] 로그에 종목별 regime penalty 출력 (`[AUDIT_SCORE]`)

### 3-2C) Earnings Event Overlay 패널티 정형화
- [x] `EARNINGS_EVENT_MAP` 기반 D-day 거리 계산
- [x] 근접 이벤트 구간별 패널티 적용 (예: D-1~D+1, D-2~D-5)
- [x] 이벤트 정보 없음(`N/A`)일 때 중립 처리

### 3-2D) 실행 가능성 보정(유동성/슬리피지/데이터 신선도)
- [x] 기존 stale/illiquid 신호를 `liquidityPenalty`로 수치화
- [x] gap/volume 품질을 `hygienePenalty`로 분리
- [x] 극단값 종목만 완만한 패널티 (과도한 컷 금지)

### 3-2E) 감사 로그 고정
- [x] 종목별 점수 변환 로그 추가
  - 예: `raw -> bonus/penalty -> final`
- [x] Top N(예: 10) 종목의 핵심 penalty 원인 로그 출력
- [x] 기존 로그 포맷/톤 유지

### 3-2F) 결과 JSON 감사 필드 추가
- [x] `STAGE4_TECHNICAL_FULL_*.json`에 `scoreBreakdown` 포함
- [x] 기존 필드 호환성 유지 (소비자 코드 영향 없음)

---

## Validation Checklist (수정 후)
- [x] Stage4 1회 실행: 에러 없이 완료
- [x] Stage4 로그에 `[AUDIT_SCORE]` 노출 확인
- [x] 결과 JSON에 `scoreBreakdown` 필드 존재 확인
- [x] 기존 대시보드 디자인 변화 없음 확인
- [x] Stage5 입력(300개/필드) 호환성 확인

## Regression Guard
- [x] Survival Rate, Data Hygiene Overlay 기존 동작 유지
- [x] Selection Guard 동작 유지
- [x] Stage5/6 결과 파일 로딩 이상 없음

## Notes
- 이 문서는 체크리스트 진행용이다.
- 각 항목 완료 시 체크 후, 변경 파일/핵심 diff를 함께 기록한다.
