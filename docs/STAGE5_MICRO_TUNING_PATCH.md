# Stage5 Micro Tuning Patch Plan

Doc-Tier: P2 (Engineering)


## Goal
- Stage5(`IctAnalysis`)의 점수/리스크 반영을 Stage4 실데이터와 정합되게 보완.
- 기존 UI/디자인/파이프라인 흐름 유지.
- 결과 왜곡 목적의 임의 조정 금지(정량 근거 기반만 허용).

## Scope
- Primary: `components/IctAnalysis.tsx`

## Hard Constraints
- Stage5 화면 레이아웃/디자인 변경 금지
- 기존 ICT 계산 엔진 삭제 금지
- Stage6 입력 포맷 파괴 금지 (필드 추가만 허용)
- Drive 저장 경로/파일명 규칙 유지

---

## Patch Checklist

### Stage5-A) 실 VIX 연동 (P0)
- [x] `const vix = 20` 하드코딩 제거
- [x] `Stage4_Technical_Data/MARKET_REGIME_SNAPSHOT.json`에서 VIX 로드
- [x] 스냅샷 로드 실패 시에만 `VIX=20` fallback
- [x] 로그에 `Synced/Fallback` 출처 출력

### Stage5-B) Stage4 계약 검증 강화 (P0)
- [x] `technical_universe` 존재 여부 외 필수 필드 검증 추가
- [x] 누락률 계산 + `warn-only` 계약 로그 추가 (`[CONTRACT_WARN]`)
- [x] 하드 중단 임계치(`5%/10%`) 적용

### Stage5-C) Composite 분해 저장 (P1)
- [x] `compositeAlpha` 계산 분해(가중치/패널티) 구조화 필드 추가
- [x] Top N 감사 로그에서 분해값 재현 가능하게 출력

### Stage5-D) 섹터 과밀 패널티 완만화 (P1)
- [x] 계단식 패널티를 완만한 함수형으로 조정
- [x] 상위 섹터 과밀 캡 추가(다양성 유지)

### Stage5-E) Stage6 전달 계약 고정 (P1)
- [x] `rankRaw/rankFinal/majorPenaltyCause/regimeMode` 전달 필드 추가
- [x] 기존 Stage6 호환성 유지

### Stage5-F) Sparse 데이터 진입 제한 (P2)
- [x] sparse/heurstic 자산은 보존하되 Top50 진입 제한 규칙 추가
- [x] 데이터 누적 목적과 실전 선발 품질 동시 유지

---

## Validation Checklist (수정 후)
- [x] `npm run build` 통과
- [x] Stage5 1회 실행 완료
- [x] Stage5 로그에 VIX Sync/Fallback 표시 확인
- [x] Stage5 결과 파일 생성 정상 확인
