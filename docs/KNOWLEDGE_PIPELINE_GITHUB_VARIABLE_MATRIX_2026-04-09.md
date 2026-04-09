# Knowledge Pipeline GitHub Variable Matrix (2026-04-09)

목적: `NotebookLM -> Obsidian -> Notion 승인 -> 코드반영 큐` 루프를 운영 안정성 기준으로 단계 전환한다.

---

## 1) 권장 변수 세팅 (Phase-1: Queue Only)

| 변수 | 권장값 | 이유 |
|---|---|---|
| `KNOWLEDGE_PIPELINE_APPLY` | `false` | 승인 항목을 바로 상태 전이하지 않고 큐 산출물만 생성 |
| `KNOWLEDGE_PIPELINE_REQUIRED` | `false` | 초기에는 Notion/API 이슈로 워크플로우 전체 실패 방지 |
| `KNOWLEDGE_PIPELINE_PENDING_STATUS` | `승인대기` | 아이디어 검토 대기 |
| `KNOWLEDGE_PIPELINE_APPROVED_STATUS` | `승인` | 사람 승인 완료 상태 |
| `KNOWLEDGE_PIPELINE_REFLECT_STATUS` | `코드반영` | 코드 반영 단계 상태 |
| `KNOWLEDGE_PIPELINE_CATEGORY_FILTER` | `MCP` | MCP 확장안만 우선 처리 |
| `KNOWLEDGE_PIPELINE_LIMIT` | `20` | 1회 처리량 상한으로 노이즈 방지 |
| `NOTION_WORK_LIST` | 실제 DB ID | 승인 큐 소스 DB |

Secret:
- `NOTION_TOKEN` (필수)

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

---

## 3) 운영 권장 시퀀스

1. NotebookLM에서 리서치 소스 요약
2. Obsidian `Templates/05_NotebookLM_Intake.md`로 정규화
3. Notion에서 `승인대기 -> 승인` 수동 결정
4. GitHub pipeline이 승인 항목 큐 산출
5. 코드 반영(PR) 후 evidence 링크를 Notion/Obsidian에 역기록

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
