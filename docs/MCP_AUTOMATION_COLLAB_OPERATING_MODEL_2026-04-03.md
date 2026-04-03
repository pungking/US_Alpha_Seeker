# MCP Automation + Collaboration Operating Model (2026-04-03)

목적: 현재 구축된 MCP를 "많이 붙이는 것"이 아니라, **운영 효율/협업 품질을 높이는 방향으로** 일관되게 사용하는 기준을 정한다.

---

## 1) 현재 활성 아키텍처

- 기본 운영 프로필(`mcp:sync:ops`): 10개
  - `notion-mcp-remote`, `google-drive`
  - `github-mcp`, `vercel-mcp`, `telegram-mcp`
  - `sentry-mcp`, `playwright-mcp`
  - `grafana-mcp`, `pagerduty-mcp`, `cloudflare-mcp`
- 확장 연구 프로필(`mcp:sync:full`): +2개
  - `perplexity-mcp`, `obsidian-mcp`

원칙:
- 평소는 `ops` 프로필 고정
- 조사/문서화 세션에서만 `full` 사용
- Trade Plane(실주문/전략 파라미터)는 MCP로 자동 변경하지 않음

---

## 2) MCP별 역할 정의 (중복 방지)

1. `notion-mcp-remote`
   - 역할: 운영 DB/작업지시/런북 기록의 단일 소스
   - 자동화: dry-run/ops health 결과 기록 검증
   - 금지: 실주문 트리거 로직 직접 연결

2. `google-drive`
   - 역할: 문서/리포트 원본 관리, 공유 자료 허브
   - 자동화: 보고서 산출물 보관/참조

3. `github-mcp`
   - 역할: PR/워크플로/코드 변경 추적
   - 자동화: CI 상태 점검, 배포 전 변경 영향 파악

4. `vercel-mcp`
   - 역할: 웹앱 배포/런타임 상태 점검
   - 자동화: API endpoint 오류 재현, 배포/로그 확인

5. `telegram-mcp`
   - 역할: 운영 알림 채널 (사람 확인 루프)
   - 자동화: health/failure 알림 수신
   - 금지: 무인 승인/무인 주문 트리거

6. `sentry-mcp`
   - 역할: 프론트/API 에러 추적의 기준 시스템
   - 자동화: smoke 이벤트 확인, 신규 이슈 감지

7. `playwright-mcp`
   - 역할: UI 재현/검증 자동화
   - 자동화: 배포 후 브라우저 기준 동작 검증

8. `grafana-mcp`
   - 역할: 관측 지표 질의/시계열 해석
   - 자동화: 운영 상태 맥락 확인(기본 read-only)

9. `pagerduty-mcp`
   - 역할: 인시던트 대응 수명주기 관리
   - 자동화: 경보→incident 생성/추적(정책 기반)

10. `cloudflare-mcp`
    - 역할: edge/gateway 운영 도메인 보조
    - 자동화: Cloudflare 리소스 조회/운영 보조

11. `perplexity-mcp` (research only)
    - 역할: 외부 리서치 가속
    - 금지: 결과를 매매/운영 결정에 자동 반영

12. `obsidian-mcp` (research only)
    - 역할: 개인/로컬 지식 정리
    - 원칙: 운영 기준 문서는 Notion 우선

---

## 3) 자동화 시나리오 (권장 플로우)

### A. Daily Ops 루프

1) `npm run mcp:sync:ops`  
2) `npm run mcp:check`  
3) `npm run mcp:smoke`  
4) sidecar dry-run 결과 확인 (gate/hfAlert/payloads)
5) 이상 시 Telegram 알림 + Sentry/Grafana/PagerDuty 교차 확인

### B. 배포 검증 루프

1) GitHub 변경 확인(`github-mcp`)
2) Vercel 배포/런타임 확인(`vercel-mcp`)
3) UI 재현(`playwright-mcp`)
4) 에러 확인(`sentry-mcp`)
5) 필요 시 지표 교차 검증(`grafana-mcp`)

### C. 인시던트 루프

1) Sentry/Grafana 이상 탐지
2) PagerDuty incident 생성/상태관리
3) Telegram으로 운영자 통지
4) Notion에 원인/조치 기록

### D. 리서치/개선 루프

1) `npm run mcp:sync:full`
2) Perplexity 조사
3) Obsidian에 아이디어 정리
4) 확정안만 Notion 운영 문서로 승격
5) 끝나면 `npm run mcp:sync:ops` 복귀

---

## 4) 운영 KPI (MCP 관점)

- 구성 안정성: `mcp:smoke` PASS율
- 관측 대응 속도: Sentry→PagerDuty 생성 지연
- 배포 안전성: Playwright 검증 실패율
- 문서 일관성: Notion 기준 문서 누락률
- 노이즈 억제: research MCP 사용 세션의 운영 영향 0건

---

## 5) 현재 상태 스냅샷 (2026-04-03)

- MCP smoke: 10/10 PASS (ops)
- 최신 dry-run: `23929933685` success
- 게이트 진행: `13/20`
- auto validation-pack: `sample_not_complete`로 정상 skip

---

## 6) 당분간 우선순위

1. **20/20 수집 완료** (최우선)
2. 운영 파라미터 동결(원데이터 오염 방지)
3. MCP는 ops 루틴 안정 운용 중심
4. 추가 확장은 20/20 완료 후 재평가

