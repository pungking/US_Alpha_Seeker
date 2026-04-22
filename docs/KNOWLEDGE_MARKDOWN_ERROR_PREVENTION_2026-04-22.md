# Knowledge Markdown Error Prevention (2026-04-22)

Scope: `NotebookLM -> Obsidian -> Notion` automation loop  
Owner: givet-bsm + Codex

## Why this exists

최근 NotebookLM summary가 Obsidian에서 깨져 보이는 문제가 재발했다.
재발 방지를 위해 **변환 규칙 + 품질 게이트**를 명시한다.

## Observed Failure Types (6)

1. Citation 숫자 잔류 (`... 검증합니다 8`)
2. 중복 H2 헤더 (`## 기술 검증` 반복)
3. 표가 셀 줄바꿈으로 깨짐
4. blockquote/문장 경계 깨짐
5. divider 오매핑 (`### -`)
6. 인라인 레이블 미승격 (`- [Risk Assessment] ...`)

## Preventive Controls (implemented)

- Sanitizer hardening (`scripts/knowledge-intake-pipeline.mjs`)
  - trailing citation-like number 제거 강화
  - `### -` -> `---` 교정
  - `- [Label] text` -> `### Label` + bullet 승격
  - 연속 중복 `##` 헤더 방지
- Quality gate script 추가 (`scripts/check-knowledge-markdown-quality.mjs`)
  - detects:
    - `citationTail`
    - `badDivider`
    - `inlineLabelBullet`
    - `duplicateH2Consecutive`
    - `looseTable`
- Workflow wiring
  - `.github/workflows/knowledge-intake-pipeline.yml`
  - `Check knowledge markdown quality` step
  - artifacts: `state/knowledge-markdown-quality-report.json/.md`

## Strict Mode

- Env: `KNOWLEDGE_MARKDOWN_QUALITY_REQUIRED`
  - default: `false` (warn-only)
  - `true`: quality issue 존재 시 workflow fail

## Operating Rule

- 정책/코드 변경 전에 최소 1회 quality report 확인.
- `warn` 상태에서 `KNOWLEDGE_PIPELINE_APPLY=true`로 전환하지 않는다.
- 표 변환(table) 문제는 source payload 샘플을 fixture로 보관하고 정기적으로 회귀 점검한다.

## Next hardening (not yet done)

1. Flattened table recovery를 sanitizer에 구조적으로 추가
2. Summary fixture regression test (`node --test`) 도입
3. Obsidian note output 샘플 snapshot 테스트 추가

