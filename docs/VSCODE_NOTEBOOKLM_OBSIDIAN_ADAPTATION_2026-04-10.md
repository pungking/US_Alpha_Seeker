# VSCode Baseline Adaptation: NotebookLM + Obsidian MCP (2026-04-10)

목적: 외부 문서의 "Antigravity 기반" 지침을 현재 우리 운영 기준인 VSCode/Codex 환경에 맞게 재정의한다.

---

## 1) 핵심 결론

- 방향 자체는 유효: `NotebookLM -> Obsidian -> Notion -> Code` 루프는 현재 프로젝트 목표와 정합.
- 단, Antigravity 전용 용어/절차는 그대로 쓰면 오해가 생김.
- 우리 기준 SSOT는 VSCode MCP 설정 + 레포 스크립트로 운영한다.

---

## 2) 용어 매핑 (Antigravity -> VSCode)

- `Antigravity config.json` -> `.vscode/mcp.json`
- `Antigravity profile` -> `.vscode/mcp.profile.*.template.json`
- `Antigravity 환경변수` -> `.vscode/mcp.env.local` (로컬), `.vscode/mcp.env.example` (템플릿)
- `서브 에이전트 설치기` -> npm 스크립트 기반 운영 루틴
  - `npm run mcp:sync:profile`
  - `npm run mcp:check`
  - `npm run mcp:smoke`

---

## 3) 현재 레포 기준 실제 운영 루틴

1. 프로필 반영
   - `npm run mcp:sync:research` (NotebookLM/Obsidian 연구 모드)
2. 설정 검증
   - `npm run mcp:check`
3. 연결 스모크
   - `npm run mcp:smoke`
4. 지식 루틴 동기화
   - `npm run ops:knowledge:sync`
5. 승인 큐 반영
   - `npm run ops:knowledge:pipeline`

참고:
- Obsidian 자동 반영은 로컬 REST(`OBSIDIAN_BASE_URL`)에 의존한다.
- GitHub hosted runner에서는 로컬 Obsidian 접근이 불가하므로, 완전 무인 반영 시 self-hosted 분리가 필요하다.

---

## 4) 첨부 문서의 주의 포인트 (VSCode 관점 보정)

- "툴 50개 이하 권장"은 유용한 운영 가이드지만, 하드 리밋 규칙으로 고정하면 안 된다.
  - 실제는 "응답 지연/충돌/불필요 툴 난립 방지"를 위한 운영 임계치로 사용.
- "NotebookLM 32개 툴"은 서버 구현체/버전에 따라 변동 가능.
  - 고정 수치가 아니라 `mcp:check` 결과를 기준으로 관리.
- "재시작 필수"는 VSCode에서도 대체로 맞다.
  - MCP 설정/환경변수 변경 후 VSCode(또는 MCP host 세션) 재시작을 기본 절차로 둔다.

---

## 5) 즉시 적용 항목

- `.vscode/mcp.env.example`에 `GEMINI_API_KEY` 템플릿 키를 명시했다.
  - `notebooklm-mcp`가 `GOOGLE_API_KEY <- GEMINI_API_KEY` 매핑을 사용하므로 필수.

---

## 6) 운영 기준 (우리 프로젝트 버전)

- 연구/확장 아이디어는 반드시 `shadow-only`로 시작.
- Notion 승인 없는 직접 전략 변경 금지.
- 코드 반영은 feature flag 우선, 증적(dry-run/ops-health) 없이 승격 금지.
- 실거래 경로 변경은 별도 게이트(20/20 + perf/freeze/path) 충족 후 진행.

---

## 7) 다음 액션

- 장중 전: `mcp:sync:research -> mcp:check -> mcp:smoke` 1회 검증.
- 장중 후: `ops:knowledge:pipeline` 결과(보고서/큐 파일) 점검.
- 주간: 미사용 MCP 정리(툴 밀도 관리) + Obsidian/Notion 증적 링크 정합성 점검.

