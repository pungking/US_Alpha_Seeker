# Stage6 Execution-First Patch Plan (2026-03-14)

목적: Stage5에서 올라온 50개 중 “좋은 종목”과 “지금 실행 가능한 종목”을 분리해,
Top6가 실전 관점에서 일관되게 해석되도록 Stage6를 재정렬한다.

---

## 1) 현재 문제 정의 (원인 고정)

- 현재 파이프라인은 `점수 기반 Top6 선발 -> 실행 가능성 강등(WAIT)` 순서다.
- 결과적으로 1~2순위가 `WAIT_PULLBACK_TOO_DEEP`가 되어도 카드 상단에 남는다.
- 즉, 연구용 순위(Model Rank)와 실행용 순위(Execution Rank)가 섞여 있다.

핵심 원인:
- Top6 컷 시점: `finalSelectionScore` 기준 선발
- 실행가능성 적용 시점: Top6 확정 이후

---

## 2) 목표 상태 (Target Behavior)

1. **Model Rank 유지**  
   - “분석 품질” 순위는 기존처럼 유지(연구/설명 용도).
2. **Execution Rank 신설**  
   - “지금 체결 가능” 기준 순위를 별도로 계산.
3. **Top6 출력 규칙 변경**  
   - 기본: 실행가능(`VALID_EXEC`) 후보 우선 Top6.
   - 예외: 실행가능 후보가 6 미만이면 `WAIT` 후보로 부족분만 보충(명시 로그).
4. **Sidecar 계약 일관성**
   - `verdictFinal=WAIT`는 실행 후보에서 자동 제외.

---

## 3) 커밋 단위 패치 순서

## Commit 1 — Contract 확장 (동작 불변)

목적: 기존 동작을 바꾸지 않고 랭크 분리 필드만 먼저 추가.

대상 파일:
- `components/AlphaAnalysis.tsx`
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`

추가 필드(Top6 candidate):
- `modelRank` (점수 순위)
- `executionRank` (실행순위, 없으면 null)
- `executionBucket` (`EXECUTABLE | WATCHLIST`)
- `executionReason` (`VALID_EXEC | WAIT_PULLBACK_TOO_DEEP | INVALID_GEOMETRY | INVALID_DATA`)

완료 기준:
- [ ] Stage6 JSON에 신규 필드 출력
- [ ] 기존 Top6 구성/갯수 변화 없음

커밋 메시지:
- `feat(stage6-contract): add model/execution rank fields without behavior change`

---

## Commit 2 — Selection 순서 변경 (핵심 로직)

목적: Top6 선발을 Execution-first로 전환.

대상 파일:
- `components/AlphaAnalysis.tsx`

변경 규칙:
- `executionBucket=EXECUTABLE` 후보를 먼저 점수순 정렬 후 Top6 채움
- 부족분만 `WATCHLIST`에서 보충
- 로그 추가:
  - `Execution-first: executable=X watchlist=Y selected_exec=A fallback_watch=B`

완료 기준:
- [ ] 실행가능 후보가 충분하면 Top6에 WAIT=0
- [ ] 실행가능 후보 부족 시 fallback 개수 로그로 추적 가능

커밋 메시지:
- `feat(stage6): switch top6 selection to execution-first with watchlist fallback`

---

## Commit 3 — UI 정렬/표시 분리

목적: 사용자 화면에서 혼선을 제거.

대상 파일:
- `components/AlphaAnalysis.tsx`

변경:
- 카드 정렬 기준: `executionBucket` 우선, 그 다음 점수
- 카드에 `Model #`, `Exec #` 표시
- 기존 라벨(`ICT OTE`, `Target`, `ICT Stop`) 유지
- Execution 라인(실행가/괴리/status)은 유지

완료 기준:
- [ ] WAIT 종목이 최상단 고정되는 현상 제거
- [ ] 같은 종목의 연구순위/실행순위 동시 확인 가능

커밋 메시지:
- `feat(ui): separate model rank and execution rank in card ordering`

---

## Commit 4 — Sidecar 계약 동기화

목적: Stage6 출력 변경과 sidecar 해석 규칙 완전 일치.

대상 파일:
- `sidecar-template/alpha-exec-engine/src/index.ts`
- `sidecar-template/alpha-exec-engine/README.md`
- `sidecar-template/alpha-exec-engine/.env.example`

변경:
- 가능하면 `executionBucket`/`executionReason` 읽어서 skip reason 강화
- 기존 `ENTRY_FEASIBILITY_ENFORCE` 동작은 그대로 유지

완료 기준:
- [ ] Stage6-UI-Sidecar skip reason 불일치 0건
- [ ] `payload=0`일 때 원인 분해(Conviction vs Entry Feasibility) 명확

커밋 메시지:
- `feat(sidecar): align execution-bucket contract and skip diagnostics`

---

## Commit 5 — Report/Telegram 문구 동기화

목적: 사용자 메시지에서 “추천”과 “대기” 경계를 명확히 표현.

대상 파일:
- `services/intelligenceService.ts`
- `components/AlphaAnalysis.tsx`

변경:
- `Top6 (Model)` vs `Executable Picks` 구분 출력
- WAIT 종목은 `Watchlist` 섹션으로 분리

완료 기준:
- [ ] 추천 1~2위가 WAIT일 때도 메시지 해석 혼선 없음

커밋 메시지:
- `feat(report): split model top6 and executable picks in stage6 messaging`

---

## Commit 6 — 검증/증빙 마감

목적: 변경 후 검증 결과를 운영 문서에 고정.

대상 파일:
- `sidecar-template/alpha-exec-engine/docs/P3_3_ACTIVE_EXEC_TEST_CHECKLIST.md`
- `docs/SIDECAR_KPI_SCORECARD_TEMPLATE_2026-03-12.md`
- `docs/SIDECAR_GO_NO_GO_DECISION_TEMPLATE_2026-03-12.md`

검증:
- [ ] validation pack 1회 실행(OFF/ON/STRICT)
- [ ] Stage6 1회 생성 기준으로 sidecar 3케이스 비교
- [ ] 실행가능 Top6 비율 개선 확인

커밋 메시지:
- `docs: finalize execution-first validation evidence and rollout checklist`

---

## 4) 리스크 / 대응

- 리스크: 실행가능 우선으로 바꾸면 기대수익 수치가 낮아보일 수 있음  
  - 대응: Model Rank는 별도 유지해 연구 성과 추적 보존

- 리스크: Top6 카드/리포트 형식 변경으로 혼선  
  - 대응: 기존 라벨 유지 + Rank/버킷만 추가

- 리스크: Sidecar와 Stage6 해석 차이  
  - 대응: Commit 4에서 skip reason 계약 강제 동기화

---

## 5) 실행 순서 (실제 작업)

- [ ] Commit 1
- [ ] Commit 2
- [ ] Commit 3
- [ ] Commit 4
- [ ] Commit 5
- [ ] Commit 6

운영 원칙:
- 각 커밋마다 빌드/로그 검증 후 다음 커밋 진행
- 한 커밋에서 로직 + UI + sidecar를 동시에 바꾸지 않는다
