# Knowledge Pipeline GitHub Variable Matrix (2026-04-09)

목적: `NotebookLM -> Obsidian -> Notion 승인 -> 코드반영 큐` 루프를 운영 안정성 기준으로 단계 전환한다.

---

## 1) 권장 변수 세팅 (Phase-1: Queue Only)

| 변수 | 권장값 | 이유 |
|---|---|---|
| `KNOWLEDGE_PIPELINE_APPLY` | `false` | 승인 항목을 바로 상태 전이하지 않고 큐 산출물만 생성 |
| `KNOWLEDGE_PIPELINE_RUNS_ON` | `ubuntu-latest` | 기본은 hosted runner, Obsidian 무인 반영 시 `self-hosted`로 전환 |
| `KNOWLEDGE_PIPELINE_REQUIRED` | `false` | 초기에는 Notion/API 이슈로 워크플로우 전체 실패 방지 |
| `KNOWLEDGE_PIPELINE_SOURCE_MODE` | `notebooklm_json` (무료 자동화 권장) | Notion 승인 없이 NotebookLM JSON -> Obsidian 직행 가능 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH` | `state/notebooklm-intake.json` | NotebookLM 수집 결과 파일 경로 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED` | `false` (초기), 안정화 후 `true` | NotebookLM 파일 누락 시 hard-fail 여부 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ENABLED` | `false` (초기), 이후 `true` | NotebookLM MCP 직접 수집 on/off |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_REQUIRED` | `false` | NotebookLM MCP 수집 실패 시 hard-fail 여부 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_OVERWRITE` | `false` | 기존 `notebooklm-intake.json` 덮어쓰기 제어 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_COMMAND` | `npx` | NotebookLM MCP 실행 커맨드 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ARGS` | `["-y","notebooklm-mcp"]` | NotebookLM MCP 실행 인자 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_ID` | 빈값(선택) | 특정 notebook ID 고정 선택 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_URL` | 빈값(선택) | ad-hoc NotebookLM URL 직접 지정 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_QUERY` | 빈값(선택) | 이름/설명 검색 기반 notebook 선택 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BOOTSTRAP_URLS` | 빈값(선택) | 라이브러리 비어있을 때 자동 add_notebook할 URL 목록 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTIONS` | 빈값(기본 질문세트 사용) | `||` 구분 또는 JSON array |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_ITEMS` | `2` | 1회 수집 질문 상한(타임아웃 안정화 기본값) |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_SHOW_BROWSER` | `false` | 디버깅용 브라우저 표시 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_ENABLED` | `true` | `notebooklm-intake.json` 자동 seed 생성 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_MODE` | `seed_pack` | docs 소스 팩 기반 seed 모드 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_OVERWRITE` | `false` | 기존 분석 JSON 덮어쓰기 방지 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_SEED_LIMIT` | `20` | seed 항목 상한 |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_PACK_PATH` | `docs/NOTEBOOKLM_US_STOCK_RESEARCH_PACK_2026-04-10.md` | 소스 팩 markdown |
| `KNOWLEDGE_PIPELINE_NOTEBOOKLM_PLAYBOOK_PATH` | `docs/MARKET_INTEL_AUTOTRADING_UPLIFT_PLAYBOOK_2026-04-10.md` | 대응안 markdown |
| `KNOWLEDGE_PIPELINE_PENDING_STATUS` | `승인대기` | 아이디어 검토 대기 |
| `KNOWLEDGE_PIPELINE_APPROVED_STATUS` | `승인` | 사람 승인 완료 상태 |
| `KNOWLEDGE_PIPELINE_REFLECT_STATUS` | `코드반영` | 코드 반영 단계 상태 |
| `KNOWLEDGE_PIPELINE_CATEGORY_FILTER` | `MCP` | MCP 확장안만 우선 처리 |
| `KNOWLEDGE_PIPELINE_LIMIT` | `20` | 1회 처리량 상한으로 노이즈 방지 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY` | `false` | 기본은 Notion 큐 산출물만 운영(Obsidian 반영은 점진 적용) |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED` | `false` | Obsidian 연결 실패가 워크플로우를 깨지 않도록 안전 운용 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_DRY_RUN` | `false` | 실제 반영 전, 파이프라인 smoke 검증용 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_NOTE_PATH` | `99_Automation/Knowledge Approved Queue.md` | Obsidian 내 승인 큐 대상 노트 경로 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_APPLY` | `true` | item별 노트 + 허브 노트 생성으로 Graph View 연관성 강화 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_PATH` | `99_Automation/NotebookLM/NotebookLM_Intake_Graph_Hub.md` | Graph 허브 노트 경로 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ITEM_DIR` | `99_Automation/NotebookLM/Intake` | item 노트 저장 디렉토리 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PACK_NOTE` | `99_Automation/NotebookLM_US_Stock_Research_Pack_2026-04-10.md` | 소스 팩 기준 노트 링크 |
| `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PLAYBOOK_NOTE` | `99_Automation/Market_Intel_AutoTrading_Uplift_Playbook_2026-04-10.md` | 대응안 기준 노트 링크 |
| `OBSIDIAN_BASE_URL` | `http://127.0.0.1:27123` | Obsidian Local REST API endpoint |
| `NOTION_WORK_LIST` | 실제 DB ID | 승인 큐 소스 DB |

운영 타임아웃 권장:
- GitHub Actions job timeout은 `35m` 이상 권장
- NotebookLM MCP step은 `continue-on-error: true` + `timeout-minutes: 20`으로 운영해 전체 파이프라인 중단 방지

Secret:
- `NOTION_TOKEN` (`source_mode=notion|hybrid`일 때 필수)
- `OBSIDIAN_API_KEY` (Obsidian 반영 사용 시 필수)

---

## 2) 전환 기준 (`apply=false -> true`)

아래 조건을 모두 만족할 때만 `KNOWLEDGE_PIPELINE_APPLY=true` 전환:

1. 연속 5회 이상 파이프라인 성공
2. `knowledge-approved-queue.md`와 Notion 승인 항목이 일치
3. 승인 항목의 PR 반영 루틴(수동/반자동)이 팀 운영에서 재현 가능
4. 잘못된 상태 전이 발생 0건
5. 롤백 절차(변수 즉시 복원 + 상태 복구)가 문서화됨

전환 후 첫 1주:
- `KNOWLEDGE_PIPELINE_REQUIRED=false` 유지 (관측 기간)
- 이상 없으면 2주차부터 `KNOWLEDGE_PIPELINE_REQUIRED=true` 검토

Obsidian 반영(`KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY=true`) 전환 기준:
1. self-hosted runner에서 Obsidian Local REST API health check 3회 연속 성공
2. `state/knowledge-approved-queue-obsidian.md`와 vault 반영 결과 일치
3. 실패 시 fallback(Notion 큐 only) 로그가 운영자에게 명확히 전달됨
4. 초기 1주간은 `KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED=false` 유지

---

## 3) 운영 권장 시퀀스

1. NotebookLM에서 리서치 소스 요약
2. 수집 결과를 `state/notebooklm-intake.json`으로 저장
3. GitHub pipeline(`source_mode=notebooklm_json`) 실행
4. Obsidian 큐 노트 + Graph 노트 자동 반영 확인
   - `99_Automation/Knowledge Approved Queue.md`
   - `99_Automation/NotebookLM/NotebookLM_Intake_Graph_Hub.md`
   - `99_Automation/NotebookLM/Intake/*.md`
5. 필요 시 Notion 승격/코드 반영(PR) 진행

JSON 예시:

```json
{
  "generatedAt": "2026-04-10T10:00:00Z",
  "items": [
    {
      "id": "nblm-001",
      "title": "US Market Regime Shift Signal",
      "summary": "VIX slope and breadth divergence imply risk-off drift.",
      "category": "MCP",
      "priority": "P1",
      "sourceUrl": "https://example.com/research"
    }
  ]
}
```

---

## 4) 롤백 정책

문제 발생 시 즉시:

1. `KNOWLEDGE_PIPELINE_APPLY=false`
2. `KNOWLEDGE_PIPELINE_REQUIRED=false`
3. 잘못 전이된 항목 상태를 Notion에서 수동 복구
4. 다음 run에서 큐 산출물(`state/knowledge-approved-queue.md`) 기준으로 재검증

---

## 5) Self-hosted Runner 적용 판단

결론(권장):
- **현재 sidecar/핵심 거래 파이프라인은 hosted 유지**
- **NotebookLM/Obsidian 지식 파이프라인만 self-hosted 분리**가 가장 안전

이유:
1. Obsidian Local REST API는 로컬 프로세스 의존 (`127.0.0.1:27123`)
2. GitHub hosted runner는 로컬 Obsidian에 접근 불가
3. 거래 파이프라인과 지식 파이프라인을 분리해야 리스크 격리 가능

적용 시점:
- Obsidian 자동 반영이 운영상 필수가 되었을 때
- 현재처럼 Notion 중심 큐 운영만으로 충분하면 hosted-only 유지 가능
