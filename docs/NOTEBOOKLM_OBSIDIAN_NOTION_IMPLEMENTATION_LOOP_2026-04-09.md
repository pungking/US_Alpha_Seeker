# NotebookLM + Obsidian -> Notion -> Code Implementation Loop (2026-04-09)

목적: 리서치 아이디어를 빠르게 모으되, 운영 리스크를 통제하면서 코드 반영까지 일관된 루프로 연결한다.
환경 기준: Antigravity 용어 대신 VSCode/Codex 기준은 `docs/VSCODE_NOTEBOOKLM_OBSIDIAN_ADAPTATION_2026-04-10.md`를 따른다.

---

## 1) 권장 운영 형태 (요약)

1. NotebookLM
   - 논문/아티클/영상 요약과 핵심 주장 수집
2. Obsidian
   - `Templates/05_NotebookLM_Intake.md`로 아이디어를 정규화
3. Notion
   - 확장안(작업/운영 히스토리)으로 승격, 우선순위/상태/증적 링크 관리
4. Code
   - shadow lane에서 feature flag 기반으로 구현 후 dry-run 검증

핵심 원칙:
- `20/20` 이전은 shadow-only
- 실주문 경로/핵심 전략 자동 변경 금지
- 증적 없는 파라미터 변경 금지

---

## 2) Obsidian 노트 표준 (Intake)

필수 항목:
- source (NotebookLM notebook/topic + 원문 링크)
- claim (무엇이 개선되는가)
- expected impact (precision/risk/latency)
- validation design (shadow metric, rollback condition)
- code reflection plan (대상 파일, 계약 변경, evidence 위치)

권장 파일:
- `Templates/05_NotebookLM_Intake.md`

---

## 3) Notion 승격 규칙

Intake 노트를 Notion으로 승격하는 기준:
- 재현 가능한 출처 2개 이상
- 운영 가드레일 위반 없음
- shadow 실험 설계가 명확함

승격 대상:
- 작업 목록: 구현/검증 TODO
- 운영 히스토리: 결정/근거/상태(완료/진행 중/예정)
- 프로젝트 보드: Next 항목으로 노출

---

## 4) 코드 반영 형태 (권장)

### A. Feature flag first
- 예: `SHADOW_*`, `HF_*`, `REGIME_*` 계열 플래그
- 기본값은 보수적으로 유지(`false` 또는 관측 모드)

### B. Read path -> summary -> evidence
- 신규 신호를 주문 로직에 바로 연결하지 말고:
  1) read-path 수집
  2) run summary 출력
  3) ops-health/Notion 증적으로 남김

### C. Promotion gate
- `20/20` + perf/freeze/payload-path 조건 충족 전 승격 금지

---

## 5) MCP 관점 제안 (현재 우선순위와 정합)

- 계속 추진:
  - Perplexity, Alpha Vantage, SEC EDGAR (shadow lane)
- 병행 준비:
  - Supabase/Postgres (상태 가시성)
- 문서화 강화:
  - NotebookLM/Obsidian intake를 Notion과 코드 TODO로 즉시 연결

---

## 6) 실행 체크리스트

- [ ] NotebookLM 요약을 Obsidian intake 템플릿으로 기록
- [ ] Notion 작업/히스토리에 승격(근거 링크 포함)
- [ ] feature flag 기반으로 shadow 구현
- [ ] dry-run 3회 이상 증적 수집
- [ ] PASS 시에만 다음 단계(확장/승격) 진행

## 7) Markdown 품질 재발 방지 (2026-04-22 추가)

- 회귀 방지 기준 문서:
  - `docs/KNOWLEDGE_MARKDOWN_ERROR_PREVENTION_2026-04-22.md`
- 자동 점검 스크립트:
  - `npm run ops:knowledge:quality`
- 워크플로우 반영:
  - `.github/workflows/knowledge-intake-pipeline.yml`에서 pipeline 직후 quality check 실행
- Strict fail 옵션:
  - `KNOWLEDGE_MARKDOWN_QUALITY_REQUIRED=true`일 때 품질 이슈 발생 시 workflow fail
