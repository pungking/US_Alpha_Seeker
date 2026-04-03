# MCP Collaboration Setup Playbook (2026-04-02)

목적: 운영자(사용자) + Codex가 같은 기준으로 MCP를 관리하면서,  
실주문 안정성(Trade Plane)을 건드리지 않고 Ops 협업 속도를 높이는 것.

---

## 1) 원칙

1. 주문 경로(Alpaca)는 Direct API 유지
2. MCP는 진단/리포트/문서화 중심(Ops Plane)
3. 온라인 자동화(GitHub/Vercel)는 MCP가 아니라 API/Webhook 중심 유지

---

## 2) 현재 파일 구성

- 활성 MCP 설정: `.vscode/mcp.json`
- 베이스 설정: `.vscode/mcp.base.json`
  - Notion MCP
  - Google Drive MCP
- 프로필 템플릿:
  - `.vscode/mcp.profile.ops.template.json` (GitHub/Vercel/Telegram/Sentry/Playwright/Grafana/PagerDuty/Cloudflare)
  - `.vscode/mcp.profile.research.template.json` (Perplexity + Obsidian optional)
- 온라인 MCP 템플릿: `.vscode/mcp.online.template.json`
  - GitHub/Vercel/Telegram/Sentry/Playwright/Grafana/PagerDuty/Cloudflare/Perplexity/Obsidian command + token placeholder
- MCP env 템플릿: `.vscode/mcp.env.example`
- 설정 점검 스크립트: `scripts/check-mcp-config.mjs`
- 프로필 동기화 스크립트: `scripts/sync-mcp-profile.mjs`
- 스모크/헬스 스크립트: `scripts/mcp-smoke.mjs`

---

## 3) 운영자가 해야 할 일 (로컬)

### Step A. 현재 활성 MCP 점검

```bash
npm run mcp:check
```

정상 기준:
- `.vscode/mcp.json` JSON 파싱 성공
- placeholder env 누락이 있으면 메시지로 확인 가능

### Step B. 프로필별 MCP 구성

1. `.vscode/mcp.env.example` 기준으로 각 서버별 `*_COMMAND_PACKAGE`, `*_TOKEN` 값 준비
2. 해당 값을 `.env` 또는 `.vscode/mcp.env(.local)`에 주입
3. 프로필 동기화 실행:

```bash
npm run mcp:sync:ops
```

다른 프로필:

```bash
npm run mcp:sync:research
npm run mcp:sync:full
```

4. 재검증 및 스모크:

```bash
npm run mcp:check
npm run mcp:smoke
```

엄격 검사(누락 시 exit 1):

```bash
MCP_CHECK_STRICT=true npm run mcp:check
```

강제 전체 병합(권장 X, placeholder 포함):

```bash
npm run mcp:sync:all
```

헬스 알림(실패 시 Telegram):

```bash
npm run mcp:health
```

토큰 변수는 기존 앱 변수명을 재사용:

- GitHub: `GITHUB_TOKEN`
- Vercel: `VERCEL_TOKEN`
- Telegram: `TELEGRAM_TOKEN`
- Sentry: `SENTRY_ACCESS_TOKEN`
- Perplexity: `PERPLEXITY_API_KEY`
- Grafana: `GRAFANA_URL`, `GRAFANA_SERVICE_ACCOUNT_TOKEN`
- PagerDuty: `PAGERDUTY_USER_API_KEY`, `PAGERDUTY_API_HOST`
- Cloudflare: `MCP_CLOUDFLARE_COMMAND_PACKAGE`, `MCP_CLOUDFLARE_URL` (optional: `CLOUDFLARE_API_TOKEN`)
- Obsidian(optional): `OBSIDIAN_API_KEY`, `OBSIDIAN_BASE_URL`

Telegram MCP 라우팅 기본값:

- `TELEGRAM_SIMULATION_CHAT_ID`를 MCP 템플릿에서 기본 chat id로 사용

---

## 4) 권장 도입 순서

1. GitHub MCP
2. Vercel MCP
3. Telegram MCP
4. Sentry MCP
5. Playwright MCP (UI 재현/검증)
6. Grafana MCP (관측/대시보드 질의, 기본 read-only 권장)
7. PagerDuty MCP (인시던트 운영 연계, 기본 read-only 권장)
8. Cloudflare MCP (MCP gateway/edge 운영 보조)
9. Perplexity MCP (리서치 보조 전용)
10. Obsidian MCP (선택: 로컬 지식베이스 운영 시)

주의:
- Perplexity 결과를 매매 의사결정에 자동 반영하지 않음
- Telegram MCP로 주문 실행 트리거를 만들지 않음

---

## 5) 온라인 자동화와 MCP 경계

MCP는 협업/진단 계층.

실제 운영 자동화는 계속 아래를 사용:
- GitHub Actions
- Vercel API
- Notion API
- Telegram Bot API

즉, “MCP가 내려가도 운영은 돌아가고”,  
“MCP가 살아 있으면 분석/협업 속도만 빨라지는” 구조가 목표.

---

## 6) 트러블슈팅

### 케이스: `npm run mcp:check`에서 placeholder 누락

- 해당 변수(`MCP_*`)를 shell env로 export
- 또는 `.env`/`.vscode/mcp.env.local`에 값 주입 후 `npm run mcp:sync:ops` 재실행

### 케이스: MCP 연결 실패/timeout

- command package 이름/버전 재확인
- 토큰/권한 확인
- `npm run mcp:smoke`로 누락 env/구성 실패 먼저 정리
- `npm run mcp:health`로 실패 알림 경로(Telegram) 검증

---

## 7) 다음 액션(운영 기준)

1. 당장은 기존 Notion/GDrive MCP 유지
2. GitHub MCP → Vercel MCP 순으로 붙이기
3. 붙일 때마다 `npm run mcp:check` 결과를 기록
4. `perf_loop 20/20` 달성 전까지는 Trade Plane 설정 고정 유지

추가 운영 팁(중복/효율):
- 기본은 `mcp:sync:ops`로만 운용(실전 운영 집중)
- 리서치가 필요한 세션에만 `mcp:sync:research`로 전환
- `mcp:sync:full`은 점검/마이그레이션 같은 특수 상황에만 사용

---

## 8) Playwright / Obsidian / GitHub CLI 빠른 셋업

### Playwright MCP (권장: 즉시 활성)

- 이 저장소 템플릿에는 `playwright-mcp`가 이미 반영되어 있음
- 별도 토큰은 필요 없음
- 반영 확인:

```bash
npm run mcp:sync
npm run mcp:check
npm run mcp:smoke
```

### Obsidian MCP (선택: 로컬 지식베이스 운영 시)

- Notion과 역할이 다름:
  - Notion: 운영 DB/뷰/협업
  - Obsidian: 개인 로컬 Markdown 지식베이스
- 필요 변수:
  - `MCP_OBSIDIAN_COMMAND_PACKAGE` (기본: `obsidian-mcp-server`)
  - `OBSIDIAN_API_KEY`
  - `OBSIDIAN_BASE_URL` (기본: `http://127.0.0.1:27123`)
  - `OBSIDIAN_VERIFY_SSL`, `OBSIDIAN_ENABLE_CACHE`

### GitHub CLI (`gh`) (선택: 터미널 PR/이슈 작업 시)

- GitHub MCP와 별개 도구:
  - GitHub MCP: Codex용 MCP 연결
  - `gh`: 터미널 수동/스크립트 작업 도구
- 설치 후 인증:

```bash
gh --version
gh auth login --hostname github.com --git-protocol https --web
```

- 토큰으로 인증하려면:

```bash
printf '%s' "$GITHUB_TOKEN" | gh auth login --with-token
```

### Grafana MCP (운영 관측 강화, 권장)

- 템플릿 기본값은 안전하게 read-only 모드(`--disable-write`)로 설정됨
- 필요 변수:
  - `MCP_GRAFANA_COMMAND` (권장: `uvx`)
  - `MCP_GRAFANA_COMMAND_PACKAGE` (권장: `mcp-grafana`)
  - `GRAFANA_URL` (예: `https://<stack>.grafana.net`)
  - `GRAFANA_SERVICE_ACCOUNT_TOKEN` (Grafana service account token)
- 반영:

```bash
npm run mcp:sync:ops
npm run mcp:check
npm run mcp:smoke
```

### PagerDuty MCP (인시던트 자동화 연계, 권장)

- 템플릿 기본값은 read-only(쓰기 툴 비활성)로 운영
- 필요 변수:
  - `MCP_PAGERDUTY_COMMAND` (권장: `uvx`)
  - `MCP_PAGERDUTY_COMMAND_PACKAGE` (권장: `pagerduty-mcp`)
  - `PAGERDUTY_USER_API_KEY`
  - `PAGERDUTY_API_HOST` (기본: `https://api.pagerduty.com`, EU 계정이면 `https://api.eu.pagerduty.com`)
- 반영:

```bash
npm run mcp:sync:ops
npm run mcp:check
npm run mcp:smoke
```

### Cloudflare MCP (게이트웨이/엣지 운영 보조, 선택)

- remote MCP bridge 방식(`mcp-remote`)으로 연결
- 필요 변수:
  - `MCP_CLOUDFLARE_COMMAND_PACKAGE` (권장: `mcp-remote`)
  - `MCP_CLOUDFLARE_URL` (Cloudflare MCP endpoint URL)
- 인증:
  - 기본: OAuth 로그인(권장, 토큰 없이 사용 가능)
  - 자동화/CI: `CLOUDFLARE_API_TOKEN` 사용 가능
- 반영:

```bash
npm run mcp:sync:ops
npm run mcp:check
npm run mcp:smoke
```
