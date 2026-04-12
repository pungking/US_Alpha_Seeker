<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1lqSSMMcjR77PH7ha1XYvxZa0DrNZmL3q

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Optional: Notion Sync

This project can sync Stage6 outputs to Notion through a server-side proxy (`/api/notion_sync`).

Required server envs:
- `NOTION_TOKEN`
- `NOTION_DB_DAILY_SNAPSHOT`
- `NOTION_DB_STOCK_SCORES`
- `NOTION_DB_AI_ALPHA_ANALYSIS`
- `NOTION_DB_WATCHLIST`

Optional workspace pointers (for ops linking/manual workflows):
- `NOTION_PROJECT` (project page ID)
- `NOTION_WORK_LIST` (work-list database ID)

Optional client toggle:
- `VITE_NOTION_SYNC_ENABLED=true|false` (default: `true`)

## Optional: Performance Dashboard API (Simulation/Live)

Web UI panel `Trading Performance Board` reads from `/api/performance_dashboard`.

Source priority:
1. local state file (`sidecar-template/alpha-exec-engine/state/performance-dashboard.json`)
2. Notion DB latest row (`NOTION_DB_PERFORMANCE_DASHBOARD`)

Required server envs for Notion fallback:
- `NOTION_TOKEN`
- `NOTION_DB_PERFORMANCE_DASHBOARD`

## Optional: Sentry Runtime Observability (Phase A)

Minimal runtime capture is now wired for:
- Frontend render/runtime exceptions (React)
- API routes (`/api/notion_sync`, `/api/performance_dashboard`, `/api/telegram`, `/api/perplexity`, `/api/portal_indices`, `/api/yahoo`, `/api/nasdaq`, `/api/msn`, `/api/sec`)

Required envs:
- Frontend: `VITE_SENTRY_DSN`
- API/server: `SENTRY_DSN`

Recommended envs:
- `VITE_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`
- `VITE_SENTRY_RELEASE`, `SENTRY_RELEASE`
- `VITE_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`

## Optional: GitHub Automation -> Notion Sync

GitHub Actions (`.github/workflows/schedule.yml`) can also write a run-level snapshot into the same Notion Daily Snapshot DB.

Set in GitHub (Secrets/Variables):
- `NOTION_TOKEN` (secret)
- `NOTION_DB_DAILY_SNAPSHOT` (variable or secret)

Optional GitHub variables:
- `NOTION_GHA_SYNC_ENABLED=true|false` (default: `true`)
- `NOTION_GHA_SYNC_REQUIRED=true|false` (default: `false`, if `true` then sync failure fails workflow)

## Notion Workspace Operations

Recommended schema/view cleanup and extension plan:

- `docs/NOTION_WORKSPACE_TUNEUP_CHECKLIST.md`

This document includes:
- what to keep vs archive,
- which Daily Snapshot columns to add for readability,
- production vs test view filters,
- and optional next-phase DB expansions.

## Optional: MCP Collaboration Setup

For smoother Codex+operator collaboration, keep the active MCP config and profile templates separate.

- Active config:
  - `.vscode/mcp.json`
- Base config:
  - `.vscode/mcp.base.json` (Notion + Google Drive)
- Profile templates:
  - `.vscode/mcp.profile.ops.template.json` (GitHub/Vercel/Telegram/Sentry/Playwright/Grafana/PagerDuty/Cloudflare)
  - `.vscode/mcp.profile.research.template.json` (Perplexity/Obsidian optional)
- Optional all-in-one template:
  - `.vscode/mcp.online.template.json`
- Optional env template:
  - `.vscode/mcp.env.example`
  - token vars reuse existing names where possible: `GITHUB_TOKEN`, `VERCEL_TOKEN`, `TELEGRAM_TOKEN`, `SENTRY_ACCESS_TOKEN`, `PERPLEXITY_API_KEY`
  - Grafana vars (recommended read-only MCP): `MCP_GRAFANA_COMMAND=uvx`, `MCP_GRAFANA_COMMAND_PACKAGE=mcp-grafana`, `GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN`
  - PagerDuty vars (recommended read-only MCP): `MCP_PAGERDUTY_COMMAND=uvx`, `MCP_PAGERDUTY_COMMAND_PACKAGE=pagerduty-mcp`, `PAGERDUTY_USER_API_KEY`, `PAGERDUTY_API_HOST=https://api.pagerduty.com`
  - Cloudflare vars (remote MCP bridge): `MCP_CLOUDFLARE_COMMAND_PACKAGE=mcp-remote`, `MCP_CLOUDFLARE_URL` (optional: `CLOUDFLARE_API_TOKEN`)
  - optional Obsidian vars: `MCP_OBSIDIAN_COMMAND_PACKAGE`, `OBSIDIAN_API_KEY`, `OBSIDIAN_BASE_URL`
  - telegram routing defaults can use `TELEGRAM_SIMULATION_CHAT_ID`

Quick validation:

1. export env vars from your local `.env`/shell (or copy from `.vscode/mcp.env.example`)
2. run:
   - `npm run mcp:check`
3. if you want hard-fail on unresolved placeholders:
   - `MCP_CHECK_STRICT=true npm run mcp:check`

Profile sync (recommended):

- ops profile:
  - `npm run mcp:sync:ops`
- research profile:
  - `npm run mcp:sync:research`
- full profile:
  - `npm run mcp:sync:full`

Profile strategy (efficiency):

- Day-to-day ops: use `mcp:sync:ops` (focus on execution/observability MCPs only)
- Research/docs sessions: use `mcp:sync:research`
- `mcp:sync:full` only when you intentionally need everything in one session

Optional online template merge:

- safe mode (only servers with resolved env vars are merged):
  - `npm run mcp:sync`
- force include all template servers (even unresolved placeholders):
  - `npm run mcp:sync:all`

Smoke/health checks:

- local smoke test (no notify):
  - `npm run mcp:smoke`
- send Telegram alert on failure:
  - `npm run mcp:health`
- send Telegram status always:
  - `npm run mcp:health:always`
- one-shot daily ops routine:
  - `npm run mcp:ops:daily`
- Repo↔Notion↔Obsidian 운영 루틴 동기화:
  - `npm run ops:knowledge:sync`
  - 결과 리포트: `state/knowledge-routine-sync-report.json`
  - 동기화 항목:
    - Notion 프로젝트 페이지에 `[AUTO] US Alpha Seeker Program Status` 보드 재생성(완료/진행중/다음/가드레일)
    - Notion child DB `운영 히스토리` 생성/업서트(완료/진행중/예정 전체 타임라인)
    - `NOTION_WORK_LIST` 스키마 보강(`우선순위`, `분류`, `마감일`, `요약`) 자동 패치
    - 프로젝트/작업 DB 내 레거시 샘플 행(`샘플`, `템플릿` 등) 자동 정리
    - Obsidian 템플릿 허브/일일로그/인시던트/튜닝 노트 갱신
  - 선택 옵션:
    - `KNOWLEDGE_SYNC_APPEND_PROJECT_NOTES=true` (프로젝트 페이지 하단 안내 텍스트 블록 append)
    - `KNOWLEDGE_SYNC_CLEANUP_PROJECT_AUTO_NOTES=true|false` (기존 `[AUTO]` 텍스트 블록 정리)
    - `KNOWLEDGE_SYNC_ARCHIVE_LEGACY_SAMPLES=true|false` (레거시 샘플 행 자동 archive, 기본 true)

- NotebookLM/Obsidian -> Notion 승인 -> 코드반영 큐 파이프라인:
  - `npm run ops:knowledge:pipeline`
  - 결과 리포트: `state/knowledge-intake-pipeline-report.json`
  - 승인 큐 산출물:
    - `state/knowledge-approved-queue.json`
    - `state/knowledge-approved-queue.md`
  - 기본 동작:
    - 소스 모드(`KNOWLEDGE_PIPELINE_SOURCE_MODE`)에 따라 큐 소스를 선택
      - `notion` (기본): Notion `NOTION_WORK_LIST`에서 `승인` 상태 항목 수집
    - `notebooklm_json`: `state/notebooklm-intake.json` 기반 큐 생성 (NotebookLM 분석 결과를 JSON으로 반영한 입력 파일 필요)
    - `hybrid`: Notion + NotebookLM JSON 병합
    - `ops:knowledge:notebooklm`가 활성화되면 NotebookLM MCP를 통해 질문/응답 수집 후 `notebooklm-intake.json` 자동 생성
    - `ops:knowledge:bridge`가 seed 모드에서 `notebooklm-intake.json` 자동 생성 가능(무료 운영용 기본값)
    - 코드 반영 PR 템플릿용 큐 파일 생성
    - `KNOWLEDGE_PIPELINE_APPLY=true`일 때만 상태를 `코드반영`으로 전이
    - `KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY=true`면 승인 큐를 Obsidian 노트로 반영 시도
    - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_APPLY=true`면 item별 노트 + 허브 노트를 함께 생성해 Graph View 링크를 강화
      - item 파일명은 `NN-<readable-title>.md` 형태로 생성(기계식 `seed-...` suffix 제거)
      - 기본적으로 한글 제목 모드가 활성화되어 영문 질문형 제목 대신 `거시-금리 인사이트 01` 형태로 저장
      - `Intake/<theme>/...` + `Intake/_themes/theme-...` 구조로 클러스터 구분
      - 레거시 `seed-*` 패턴 노트는 자동 정리(`KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_LEGACY_CLEANUP=true`)
      - stale 노트는 기본적으로 archive 후 제거(`...GRAPH_STALE_CLEANUP=true`, `...GRAPH_ARCHIVE_ENABLED=true`)
    - Obsidian 반영 실패 시에도 기본 fallback은 Notion 큐 산출물 유지(필요 시 hard-fail 가능)
  - 상태머신 기본값:
    - `승인대기 -> 승인 -> 코드반영`

Optional GitHub Actions daily automation:

- workflow: `.github/workflows/mcp-ops-daily.yml`
- schedule: daily `00:15 UTC` (`09:15 KST`)
- required secrets/vars:
  - `MCP_GITHUB_TOKEN` (or fallback `GITHUB_PAT` / `SIDECAR_DISPATCH_TOKEN`)
  - `VERCEL_TOKEN`
  - `TELEGRAM_TOKEN`
  - `TELEGRAM_SIMULATION_CHAT_ID` (secret or repo variable)
  - `SENTRY_ACCESS_TOKEN`
  - `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET`, `GDRIVE_REFRESH_TOKEN`

Optional knowledge pipeline automation:

- workflow: `.github/workflows/knowledge-intake-pipeline.yml`
- schedule: weekdays `09:40 UTC` (`18:40 KST`)
- 운영 목적: 수집/큐/그래프 메인 런 (주간 안정 운용, Obsidian 실패는 기본 soft)
- workflow(본장 전 경량 점검): `.github/workflows/knowledge-intake-final-check.yml`
- schedule: weekdays `12:55 UTC` (`21:55 KST`)  
  (NotebookLM 1문항 중심의 quick check + 실패 알림)
- workflow(야간 엄격 검증): `.github/workflows/knowledge-intake-obsidian-validate.yml`
- schedule: weekdays `15:20 UTC` (`00:20 KST`, 다음날)  
  (`OBSIDIAN_REQUIRED=true`, `NOTEBOOKLM_REQUIRED=false`로 write-path만 강검증)
- required (source mode에 따라 달라짐):
  - `source_mode=notion|hybrid`: `NOTION_TOKEN`, `NOTION_WORK_LIST`
  - `source_mode=notebooklm_json`: `state/notebooklm-intake.json` 파일
- optional vars:
  - `KNOWLEDGE_PIPELINE_RUNS_ON` (legacy string, default `ubuntu-latest`)
  - `KNOWLEDGE_PIPELINE_RUNS_ON_JSON` (권장, 예: `["self-hosted","macOS","X64","knowledge-intake","obsidian-local"]`)
  - `KNOWLEDGE_PIPELINE_REQUIRE_SELF_HOSTED` (default `false`, `true`면 strict 모드에서 github-hosted 실행을 차단)
  - `KNOWLEDGE_PIPELINE_SOURCE_MODE` (default `notion`, `notion|notebooklm_json|hybrid`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH` (default `state/notebooklm-intake.json`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED` (default `true`, notebooklm 소스 필수화)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ENABLED` (default `false`, true 시 NotebookLM MCP 직접 수집 사용)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_REQUIRED` (default `true`, MCP 수집 실패 시 워크플로우 fail 여부)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_OVERWRITE` (default `false`, 기존 json 덮어쓰기)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_COMMAND` (default `npx`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ARGS` (default `["-y","notebooklm-mcp"]`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_TIMEOUT_MS` (default `300000`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_RUNTIME_MS` (default `1440000`, 수집 step 자체 런타임 가드)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MIN_QUESTION_BUDGET_MS` (default `90000`, 다음 질문 시작 최소 잔여시간)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_STEP_TIMEOUT_MIN` (default `30`)
  - `KNOWLEDGE_PIPELINE_JOB_TIMEOUT_MIN` (default `45`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_VALIDATE_TIMEOUT_MIN` (default `20`, 야간 Obsidian 엄격 검증 타임아웃)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_TIMEOUT_MIN` (default `25`, 본장 전 경량 점검 전체 타임아웃)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_COLLECT_TIMEOUT_MIN` (default `18`, 본장 전 MCP 수집 step 타임아웃)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_MAX_ITEMS` (default `1`, 본장 전 점검 질문 수)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_QUESTIONS` (기본 1문항, 본장 전 리스크/게이트/사이징 점검 질문)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_MCP_TIMEOUT_MS` (default `420000`)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_MAX_RUNTIME_MS` (default `600000`)
  - `KNOWLEDGE_PIPELINE_FINAL_CHECK_MIN_QUESTION_BUDGET_MS` (default `45000`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_ID` / `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_URL` / `KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_QUERY`
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_INVALID_STREAK_ALERT_THRESHOLD` (default `2`, invalid meta 응답 연속 감지 임계치)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_INVALID_STREAK_ALERT_FAIL` (default `true`, 임계치 초과 시 fail 여부)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_HARD_FAIL` (default `true`, NotebookLM 인증/접근 실패 시 즉시 fail)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_AUTO_SETUP` (default `true`, 인증 실패 시 setup_auth 자동 재시도)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_AUTO_SETUP_SHOW_BROWSER` (default `false`, auto setup 시 브라우저 표시 여부)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_ENABLED` (default `true`, no_items/auth 연속 시 단순 질문 1회 재시도)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_TRIGGER_STREAK` (default `2`, 재시도 시작 연속 실패 기준)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_SIMPLE_MAX_ITEMS` (default `1`, 재시도 시 질문 수 축소)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_SIMPLE_QUESTIONS` (선택, 재시도 전용 질문 세트; `||` 또는 JSON array)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_AUTH_SHOW_BROWSER` (default `false`, auth 재시도 setup_auth 브라우저 표시)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BOOTSTRAP_URLS` (선택, `||` 구분 또는 JSON array; notebook library가 비어있을 때 자동 등록)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTIONS` (`||` 구분 또는 JSON array)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_ITEMS` (default `2`, 필요 시 증가)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_ROTATE_QUESTIONS` (default `true`, 질문 목록을 런마다 라운드로빈 회전)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTION_CURSOR_PATH` (default `state/notebooklm-mcp-question-cursor.json`, 질문 회전 상태 파일)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_SHOW_BROWSER` (default `false`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_DROP_INVALID_ITEMS` (default `true`, 시스템 가드 문구 응답은 큐/그래프에서 자동 제외)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_ENABLED` (default `true`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_MODE` (default `seed_pack`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_OVERWRITE` (default `false`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_SEED_LIMIT` (default `20`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_PACK_PATH` (default `docs/NOTEBOOKLM_US_STOCK_RESEARCH_PACK_2026-04-10.md`)
  - `KNOWLEDGE_PIPELINE_NOTEBOOKLM_PLAYBOOK_PATH` (default `docs/MARKET_INTEL_AUTOTRADING_UPLIFT_PLAYBOOK_2026-04-10.md`)
  - `KNOWLEDGE_PIPELINE_APPLY` (default `false`, 권장: 초기 queue-only)
  - `KNOWLEDGE_PIPELINE_REQUIRED` (default `false`)
  - `KNOWLEDGE_PIPELINE_ENFORCE_STRICT` (default `true`, strict profile 미충족 시 워크플로우 fail)
  - `KNOWLEDGE_PIPELINE_PENDING_STATUS` (default `승인대기`)
  - `KNOWLEDGE_PIPELINE_APPROVED_STATUS` (default `승인`)
  - `KNOWLEDGE_PIPELINE_REFLECT_STATUS` (default `코드반영`)
  - `KNOWLEDGE_PIPELINE_CATEGORY_FILTER` (default `MCP`)
  - `KNOWLEDGE_PIPELINE_QUEUE_KEEP_LAST_GOOD_ON_EMPTY` (default `false`, source가 비면 last-good 큐로 자동 폴백)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY` (default `false`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED` (default `false`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_DRY_RUN` (default `false`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_NOTE_PATH` (default `99_Automation/Knowledge Approved Queue.md`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_APPLY` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_PATH` (default `99_Automation/NotebookLM/NotebookLM_Intake_Graph_Hub.md`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ITEM_DIR` (default `99_Automation/NotebookLM/Intake`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PACK_NOTE` (default `99_Automation/NotebookLM_US_Stock_Research_Pack_2026-04-10.md`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PLAYBOOK_NOTE` (default `99_Automation/Market_Intel_AutoTrading_Uplift_Playbook_2026-04-10.md`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_MANIFEST_PATH` (default `99_Automation/NotebookLM/Intake/_meta/generated-manifest.json`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_KOREAN_TITLE` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_HUB_KEEP_BASE` (default `true`, 6개 기본 테마 허브를 _themes에 항상 유지)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_HUB_LINK_HUB` (default `false`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_LINK_THEMES` (default `false`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_CROSSLINK_ENABLED` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_LEGACY_CLEANUP` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_STALE_CLEANUP` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_ENABLED` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_DIR` (default `99_Automation/NotebookLM/Archive`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_ENABLED` (default `true`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_DAYS` (default `90`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_MAX_DELETE` (default `200`)
  - `KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_DROP_INVALID` (default `true`, 누적 모드에서 placeholder/가드 문구 노트 자동 제외)
  - `KNOWLEDGE_PIPELINE_ALERT_NOTIFY_ON` (default `fail`, `always|fail|never`)
  - Telegram alert uses `TELEGRAM_TOKEN` + `TELEGRAM_ALERT_CHAT_ID` (fallback: `TELEGRAM_SIMULATION_CHAT_ID`)
  - Graph note role guide:
    - `NotebookLM_US_Stock_Research_Pack...`: source bundle reference
    - `Market_Intel_AutoTrading_Uplift_Playbook...`: 대응안/실험 아이디어 기준 문서
    - `NotebookLM_Intake_Graph_Hub`: 전체 허브
    - `Intake/_themes/theme-...`: 주제별 허브
    - `Intake/<theme>/NN-...`: 개별 intake 노트
  - `OBSIDIAN_BASE_URL` (default `http://127.0.0.1:27123`)
  - `OBSIDIAN_API_KEY` (secret, Obsidian Local REST API 사용 시)
  - 운영 안정화 메모:
    - workflow 기본 timeout은 45분이며, strict profile 검증(step)으로 fail-open 설정을 사전 차단
    - NotebookLM 인증이 만료되면 `KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_HARD_FAIL=true` 기준으로 즉시 실패 처리되어 무효 런이 녹색으로 숨겨지지 않음
    - 인증 만료 시 `...AUTH_AUTO_SETUP=true` 이면 `setup_auth`를 1회 자동 시도하고, 실패 시에만 hard-fail 처리
    - NotebookLM 수집 시간이 길면 `KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_ITEMS`를 먼저 낮추고 관측 후 점진 증가 권장
    - NotebookLM 수집 스크립트는 내부 런타임 가드(`...MAX_RUNTIME_MS`)가 있어 종료 마진이 부족하면 `ok_partial`로 조기 종료
    - NotebookLM invalid meta 응답이 연속 발생하면 `state/notebooklm-mcp-health.json`에 streak가 누적되고 alert 기준을 넘으면 로그에 경고 출력
    - pipeline 요약/알림에 zero queue reason code가 포함됨 (`auth|guard|timeout|empty|source|other`) → 원인 식별을 로그/텔레그램에서 즉시 가능
    - NotebookLM source가 비어도 `last-good` 큐 폴백이 켜져 있으면 `Knowledge Approved Queue`가 즉시 0이 되지 않음
    - Archive는 기본 90일 보존 후 자동 정리(런당 삭제 상한 적용)됨
- 권장 세팅/전환 기준 문서:
  - `docs/KNOWLEDGE_PIPELINE_GITHUB_VARIABLE_MATRIX_2026-04-09.md`
  - `docs/SELF_HOSTED_OBSIDIAN_AUTOMATION_RUNBOOK_2026-04-12.md`

Optional master control-plane scaffold (manual-only):

- workflow:
  - `.github/workflows/master-control-plane.yml`
- reusable lanes:
  - `.github/workflows/reusable-control-collect.yml`
  - `.github/workflows/reusable-control-validate.yml`
  - `.github/workflows/reusable-control-promote.yml`
  - `.github/workflows/reusable-control-incident.yml`
- design/runbook:
  - `docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md`
- safety defaults:
  - no auto live promotion
  - promotion lane is gated by sample threshold (`20/20` default)
  - promotion action is limited to `validation_pack` dispatch request

Detailed runbook:

- `docs/MCP_COLLAB_SETUP_PLAYBOOK_2026-04-02.md`
- `docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md`
- `docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md`
