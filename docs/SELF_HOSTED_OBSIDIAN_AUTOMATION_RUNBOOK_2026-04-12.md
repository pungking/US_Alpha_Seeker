# Self-Hosted Obsidian 완전 자동화 런북 (2026-04-12)

## 목표
- NotebookLM 수집 → Queue 생성 → Obsidian 반영을 **무인 자동화**로 유지
- 인증 만료/수집 실패 시 Telegram으로 즉시 알림

## 권장 아키텍처
- 상시 켜진 사무실 데스크탑(macOS)
  - GitHub self-hosted runner
  - Google Chrome(NotebookLM 세션 유지)
  - Obsidian + Local REST API 플러그인
- GitHub Actions
  - `knowledge-intake-pipeline.yml`이 self-hosted 라벨로 실행

## 필수 GitHub Variables
- `KNOWLEDGE_PIPELINE_RUNS_ON_JSON=["self-hosted","macOS","X64","knowledge-intake","obsidian-local"]`
- `KNOWLEDGE_PIPELINE_REQUIRE_SELF_HOSTED=true`
- `KNOWLEDGE_PIPELINE_ENFORCE_STRICT=true`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ENABLED=true`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED=true`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_REQUIRED=true`
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_HARD_FAIL=true`
- `KNOWLEDGE_PIPELINE_QUEUE_KEEP_LAST_GOOD_ON_EMPTY=false`
- `KNOWLEDGE_PIPELINE_ALERT_NOTIFY_ON=fail`

## 필수 GitHub Secrets
- `OBSIDIAN_API_KEY`
- `TELEGRAM_TOKEN`
- `TELEGRAM_ALERT_CHAT_ID` (없으면 `TELEGRAM_SIMULATION_CHAT_ID`로 fallback)

## 데스크탑(운영 머신) 설정 체크
- 절전 해제: 시스템 잠자기/디스크 잠자기 OFF
- 로그인 후 자동 시작
  - self-hosted runner 서비스
  - Obsidian 앱
- Obsidian Local REST API
  - HTTP endpoint: `http://127.0.0.1:27123`
  - API key 최신값 유지
- Chrome
  - NotebookLM 계정 로그인 유지(동일 Google 계정)

## 인증 만료 대응 정책
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_HARD_FAIL=true` 유지
- `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_AUTO_SETUP=true` + `...SHOW_BROWSER=false`는 백그라운드 복구 시도용
- 인증이 실제로 끊긴 경우:
  1) 운영 데스크탑에서 Chrome 로그인 재확인
  2) 필요 시 1회 수동 `setup_auth(show_browser=true)`
  3) 이후 스케줄 재개

## 운영 점검 루틴 (일일)
- 액션 런 1회 확인
  - `state/notebooklm-mcp-collect-report.json`의 `status=ok`
  - `state/knowledge-intake-pipeline-report.json`의 `source.notebooklmStatus=ok`
- Obsidian 반영 확인
  - `99_Automation/NotebookLM/Intake` 신규 노트 생성
  - `NotebookLM_Intake_Graph_Hub` 업데이트
- 장애 시 Telegram 알림 확인

## 실패 시 빠른 진단
- `no_items + invalid_assistant_meta_answer_for_all_items`
  - 현재 패치로 guard suffix 제거됨. 재발 시 NotebookLM MCP upstream 동작 점검
- `fail_auth_required`
  - Chrome 세션/계정 상태 우선 확인
- `obsidian fail`
  - Local REST 플러그인 실행 상태와 API key 확인
