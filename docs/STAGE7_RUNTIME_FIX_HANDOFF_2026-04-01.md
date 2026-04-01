# Stage 7 Runtime Fix Handoff (2026-04-01)

다음 세션에서 바로 이어서 고치기 위한 최소 핸드오프 메모입니다.

## 1) 사용자 전달 포맷 (딱 이것만)

1. 같은 화면에서 DevTools 열기  
2. Console 첫 에러 1~2줄 복사  
3. 그대로 전달

## 2) 전달받으면 즉시 처리할 범위

- 런타임 에러 원인 픽스
- Stage 7 최소 안전 UI 보장
  - 차트 실패 시에도 카드/요약은 항상 표시
- 모바일/웹 공통 동작까지 1회에 정리

## 3) 완료 기준

- 에러 발생 시에도 Stage 7 빈 화면이 아닌 안전 카드/요약 렌더링
- 모바일/데스크톱 모두 동일하게 폴백 동작
- 콘솔 치명 에러 재발 없음(같은 재현 조건 기준)

## 4) 우선 수정 대상 파일

- `components/PerformanceDashboard.tsx`
- 필요 시 `App.tsx` (Stage 7 연결부)
- 필요 시 공통 에러 경계 컴포넌트(`components/RenderGuard.tsx` 또는 신규 Error Boundary)

