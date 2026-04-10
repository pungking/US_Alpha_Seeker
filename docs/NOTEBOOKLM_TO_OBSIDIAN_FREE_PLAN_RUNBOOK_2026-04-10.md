# NotebookLM -> Obsidian Free Plan Runbook (2026-04-10)

목표: 유료 플랜 없이 `NotebookLM 수집 -> Obsidian 자동 정리` 루프를 운영한다.

---

## 1) 운영 모드

- `KNOWLEDGE_PIPELINE_SOURCE_MODE=notebooklm_json`
- Notion 승인 단계를 우회하고 JSON 큐를 바로 Obsidian으로 반영

---

## 2) 필수 설정

GitHub Variables:

- `KNOWLEDGE_PIPELINE_SOURCE_MODE=notebooklm_json`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH=state/notebooklm-intake.json`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED=false` (초기)
- `KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY=true`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED=false` (초기)
- `KNOWLEDGE_PIPELINE_OBSIDIAN_NOTE_PATH=99_Automation/Knowledge Approved Queue.md`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_APPLY=true`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_PATH=99_Automation/NotebookLM/NotebookLM_Intake_Graph_Hub.md`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ITEM_DIR=99_Automation/NotebookLM/Intake`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PACK_NOTE=99_Automation/NotebookLM_US_Stock_Research_Pack_2026-04-10.md`
- `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PLAYBOOK_NOTE=99_Automation/Market_Intel_AutoTrading_Uplift_Playbook_2026-04-10.md`
- `OBSIDIAN_BASE_URL=http://127.0.0.1:27123`
- `KNOWLEDGE_PIPELINE_RUNS_ON=self-hosted` (Obsidian Local REST 접근 필요)

GitHub Secret:

- `OBSIDIAN_API_KEY`

---

## 3) 입력 파일 포맷

`state/notebooklm-intake.json`

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

## 4) 실행

NotebookLM 소스 업로드 배치(고신뢰 링크):

- `docs/NOTEBOOKLM_SOURCE_UPLOAD_BATCH_US_MARKET_2026-04-10.md`

로컬 검증:

```bash
npm run ops:knowledge:pipeline
cat state/knowledge-intake-pipeline-report.json
```

성공 기준:

- `report.source.mode = notebooklm_json`
- `report.source.notebooklmStatus = ok`
- `report.obsidian.status = ok`
- `report.obsidian.graphUploadedItems > 0`
- `report.obsidian.graphUploadedHub = true`

실패 케이스 빠른 해석:

- `notebooklm=skip_missing_file/0`
  - `state/notebooklm-intake.json`이 runner 경로에 없음 (NotebookLM 결과 파일 미주입)
- `obsidian=skip_no_queue`
  - NotebookLM 입력이 비어 queue가 0개

---

## 5) 점진 승격

1. 3회 연속 성공 후 `KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED=true`
2. 5회 연속 성공 후 `KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED=true`
3. 실패 시 즉시 둘 다 `false`로 롤백
