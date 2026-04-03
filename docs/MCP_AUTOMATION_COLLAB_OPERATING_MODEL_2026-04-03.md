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

---

## 7) 실행 프로토콜 (문서 중심 운영 고정)

아래 순서를 모든 작업의 기본 프로토콜로 고정한다.

1. 문서화
   - 목표/범위/리스크/완료조건을 먼저 기록한다.
2. 작업 실행
   - 코드/워크플로/변수 변경은 문서 범위 내에서만 진행한다.
3. 검증
   - 실행 로그/지표/액션 결과를 증거로 남긴다.
4. 문서 업데이트
   - 무엇을 왜 바꿨는지, 결과가 어땠는지 즉시 반영한다.
5. 다음 작업 확정
   - 다음 1단계 액션과 성공 조건을 명시한다.
6. 경로 이탈 시
   - 이탈 작업을 먼저 종료 기록한 뒤 원래 트랙으로 복귀한다.

핵심 원칙:
- `20/20` 수집 완료 전에는 전략 파라미터 자동 반영 금지
- `ops`는 기본, `full`은 조사 세션에서만 일시 사용
- 운영 기준 문서는 Git 레포 `docs/`를 정본으로 유지

---

## 8) 최신 검증 로그 (2026-04-03)

### A. Ops 프로필 검증

- `npm run mcp:sync:ops` 성공
- `npm run mcp:check` 성공
- `npm run mcp:smoke` 성공
- 결과: `PASS, servers=10, passed=10, failed=0`

### B. Full 프로필(연구 포함) 검증

- `npm run mcp:sync:full` 성공
- `npm run mcp:check` 성공
- `npm run mcp:smoke` 성공
- 결과: `PASS, servers=12, passed=12, failed=0`
  - 포함: `perplexity-mcp`, `obsidian-mcp`

### C. 운영 복귀 확인

- `npm run mcp:sync:ops` 재실행 완료
- 현재 기본 운영 상태는 `ops` 프로필로 복귀됨

### D. Repo↔Notion↔Obsidian 동기 실행 검증 (2026-04-03)

- Repo:
  - 본 문서에 실행 프로토콜/일일/주간 루틴 반영 완료
- Notion:
  - `NOTION_PROJECT` 페이지에 자동 동기 로그 블록 append 성공
  - 내용: 루틴 확정, MCP 검증 결과(ops/full), 기본 프로필 복귀 상태
- Notion Work List DB:
  - `NOTION_WORK_LIST` 접근 재검증 완료 (DB 조회/쿼리 200)
  - 쓰기 권한 재검증 완료 (페이지 생성 200 + archive 200)
- Notion Project Page DB:
  - 프로젝트 페이지 내 `작업`/`프로젝트` child DB 탐지 기반으로 표 행(upsert) 가능
  - 텍스트 안내 블록은 기본 비활성, 표(데이터베이스) 중심 운영으로 전환
- Obsidian:
  - Local REST API(`127.0.0.1:27123/27124`) 연결/인증 정상 확인
  - `/vault/{filename}` PUT/GET 테스트로 노트 생성/조회 성공
  - 생성 노트: `AUTO_SYNC_CHECK_2026-04-03.md`
  - 템플릿 간 `[[wikilink]]` 연결과 `00_Ops_Hub`로 그래프 가독성 개선

### E. Program Status 보드/레거시 정리 동기 (2026-04-03)

- `ops:knowledge:sync` 실행 시 Notion 프로젝트 페이지에
  - `[AUTO] US Alpha Seeker Program Status` 섹션을 재생성
  - 완료/진행중/다음/가드레일/뷰설정값을 최신 기준으로 갱신
- 프로젝트/작업 child DB에서 `샘플`/`템플릿`/초기 온보딩 행은 자동 archive 가능
  - 기본값: `KNOWLEDGE_SYNC_ARCHIVE_LEGACY_SAMPLES=true`
  - 필요 시 `false`로 비활성화 가능

---

## 9) Repo↔Notion↔Obsidian 동기 운영 루틴 (일일/주간)

본 섹션은 2026-04-03 기준 v1으로 확정한다.

### A. 일일 루틴 (Daily)

1. 시작 점검 (Ops 고정)
   - `npm run mcp:sync:ops`
   - `npm run mcp:check`
   - `npm run mcp:smoke`
2. Repo 운영
   - GitHub Actions 핵심 런(dry-run/market-guard/master-control) 상태 확인
   - 실패 런은 Sentry/PagerDuty/Telegram 기준으로 triage
3. Notion 운영 업데이트
   - 작업지시 상태(진행/보류/완료) 업데이트
   - 인시던트 원인/조치/재발방지 항목 기록
4. Obsidian 연구 기록
   - 당일 가설/실험 메모 작성
   - 확정안은 Notion으로 승격, 미확정안은 Obsidian에 유지
5. 종료 체크
   - 다음 액션 1개를 Notion에 명시
   - 기준 상태를 `ops` 프로필로 다시 확인

### B. 주간 루틴 (Weekly)

1. 주간 시작(월)
   - 지난주 incident/alert/top issue 리뷰
   - 이번 주 우선순위(20/20 수집, 게이트 상태) 확정
2. 중간 점검(수)
   - KPI 추세 점검(수집 진행도, hf alert, smoke pass율)
   - 문서-코드-운영 불일치 여부 교정
3. 주간 마감(금)
   - Notion 운영보드 정리(완료/이월/보류)
   - Obsidian 연구노트에서 확정안만 Notion 반영
   - 레포 `docs/`에 주간 변경 로그 업데이트

### C. 동기화 원칙 (SSOT)

- 최종 정본(SSOT): 레포 `docs/`
- 운영 보드/상태 관리: Notion
- 연구/아이디어 초안: Obsidian
- 충돌 시 우선순위: `docs/` > Notion > Obsidian

### D. 실행 커맨드

- 동기 루틴 실행:
  - `npm run ops:knowledge:sync`
- 결과 리포트:
  - `state/knowledge-routine-sync-report.json`
