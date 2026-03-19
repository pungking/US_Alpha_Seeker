# Sidecar Quiz Validation and VIX Root Cause (2026-03-20)

## 입력 자료
- `/Users/givet-bsm/Downloads/처음부터 처음 보는 메시지다 생각하오 앞의 내용과 상관없이 오로지 이 메시지에만 대해서.md`
- Sidecar Dry-Run 메시지/요약 (`STAGE6_ALPHA_FINAL_2026-03-19_22-56-08.json` 기준)

## 결론 요약
- 첨부 리포트의 주장 중 **일부는 실제 코드/상태와 일치**, 일부는 과장 또는 관찰 혼동.
- “VIX가 3월 13일에 멈춤”은 **VIX 피드 정지가 아니라 guard-control 상태 파일 timestamp 정체** 문제였다.

## 사실 검증 결과

### 1) 실제 오류 (수정 완료)
1. **Top6 ER `N/A` 표시 누락**
   - 원인: 요약 파서가 문자열 ER만 우선 사용하고 `expectedReturnPct` 숫자 필드를 표시로 승격하지 않음.
   - 조치: 숫자형 ER(`expectedReturnPct/gated/raw`)을 표시 문자열로 자동 변환하도록 보강.

2. **Stop distance 경계값 오차 가능성**
   - 원인: 가격을 문자열(`$xx.xx`)로 반올림 후 재파싱해서 게이트 계산에 사용.
   - 영향: 1.5% 같은 경계 조건에서 pass/fail이 바뀔 수 있음.
   - 조치: Stage6 원본 numeric 가격(`entry/target/stop`)을 별도 필드로 보존하고, 게이트 계산은 raw numeric 우선 사용.

3. **Guard-control 상태 갱신 정체(3/13 timestamp 고정)**
   - 원인: market-guard가 `halt_new_entries` 액션 수행 시점에만 `state/guard-control.json`을 쓰는 구조.
   - 조치: market-guard 실행 시마다 guard-control을 최신 decision으로 동기화하도록 변경.

### 2) 오해/비오류 항목
1. **“VIX가 멈췄다”**
   - 실제: Dry-Run의 `Regime: ... vix=xx.xx` 값은 실시간/스냅샷 파이프라인에서 갱신됨.
   - 멈춘 것은 `guard-control.updatedAt`(시장가드 상태 파일) timestamp였음.

2. **Top6와 Actionable 목록 차이**
   - 실행 계약상 Top6(model rank)와 실행 후보(executable picks)는 의도적으로 분리됨.
   - Execution fill로 Top6 바깥 종목이 actionable에 들어오는 것은 정상 동작.

## 적용 코드
- `sidecar-template/alpha-exec-engine/src/index.ts`
  - `Stage6CandidateSummary`에 numeric 필드 추가:
    - `expectedReturnPct`, `entryValue`, `targetValue`, `stopValue`
  - ER 표시 보강:
    - 문자열 ER 부재 시 숫자 ER을 `+xx%` 형태로 렌더
  - payload gate 계산 보강:
    - 문자열 재파싱 대신 numeric 가격 필드 우선 사용

- `sidecar-template/alpha-exec-engine/src/market-guard.ts`
  - guard-control 저장 로직 보강:
    - 매 실행마다 `state/guard-control.json` 최신화
    - `haltNewEntries`를 `appliedLevel >= 2`로 계산해 저장
    - reason/mode/shouldRunActions 포함해 관측성 강화

## 운영 체크포인트
1. 다음 market-guard 실행 후 `state/guard-control.json`의 `updatedAt`가 최신 시간으로 갱신되는지 확인.
2. 다음 dry-run 텔레그램에서 Top6의 `ER N/A`가 줄고 ER 퍼센트가 표시되는지 확인.
3. stop-distance 경계값 종목에서 불필요한 오탐 skip이 줄었는지 확인.
