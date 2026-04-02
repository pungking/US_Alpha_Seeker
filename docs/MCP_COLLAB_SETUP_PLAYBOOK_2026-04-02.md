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
  - Notion MCP
  - Google Drive MCP
- 온라인 MCP 템플릿: `.vscode/mcp.online.template.json`
  - GitHub/Vercel/Telegram/Perplexity command + token placeholder
- MCP env 템플릿: `.vscode/mcp.env.example`
- 설정 점검 스크립트: `scripts/check-mcp-config.mjs`

---

## 3) 운영자가 해야 할 일 (로컬)

### Step A. 현재 활성 MCP 점검

```bash
npm run mcp:check
```

정상 기준:
- `.vscode/mcp.json` JSON 파싱 성공
- placeholder env 누락이 있으면 메시지로 확인 가능

### Step B. 온라인 MCP 확장 시

1. `.vscode/mcp.env.example` 기준으로 각 서버별 `*_COMMAND_PACKAGE`, `*_TOKEN` 값 준비
2. 해당 값을 shell env 또는 `.env`에 주입
3. 자동 병합 실행:

```bash
npm run mcp:sync
```

4. 재검증:

```bash
npm run mcp:check
```

엄격 검사(누락 시 exit 1):

```bash
MCP_CHECK_STRICT=true npm run mcp:check
```

강제 전체 병합(권장 X, placeholder 포함):

```bash
npm run mcp:sync:all
```

토큰 변수는 기존 앱 변수명을 재사용:

- GitHub: `GITHUB_TOKEN`
- Vercel: `VERCEL_TOKEN`
- Telegram: `TELEGRAM_TOKEN`
- Perplexity: `PERPLEXITY_API_KEY`

Telegram MCP 라우팅 기본값:

- `TELEGRAM_SIMULATION_CHAT_ID`를 MCP 템플릿에서 기본 chat id로 사용

---

## 4) 권장 도입 순서

1. GitHub MCP
2. Vercel MCP
3. Telegram MCP
4. Perplexity MCP (리서치 보조 전용)

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
- 또는 `npm run mcp:sync` 재실행(해당 env 없는 서버는 자동 skip)

### 케이스: MCP 연결 실패/timeout

- command package 이름/버전 재확인
- 토큰/권한 확인
- 서버별 heartbeat 테스트 후 다시 연결

---

## 7) 다음 액션(운영 기준)

1. 당장은 기존 Notion/GDrive MCP 유지
2. GitHub MCP → Vercel MCP 순으로 붙이기
3. 붙일 때마다 `npm run mcp:check` 결과를 기록
4. `perf_loop 20/20` 달성 전까지는 Trade Plane 설정 고정 유지
