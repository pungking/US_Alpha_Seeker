# Attachment Execution Alignment (2026-04-09)

목적: 첨부 문서(`task.md`, `implementation_plan.md`, `full_codebase_analysis.md`) 기준으로 현재 코드/운영 상태를 재정렬하고, 실제 우선순위를 한 문서에서 관리한다.

---

## 1) 첨부 문서 기반 핵심 결론

1. Stage0~6 분석 파이프라인 자체는 자동화가 높다.
2. 실운영 병목은 분석 품질보다 `sidecar 실행 게이트(장중/RTH/preflight/승인큐)`이다.
3. `완전 자동화`의 선행 조건은 실주문 전환이 아니라:
   - 장중 자동 런 일관성
   - payload path 검증
   - 20/20 관측 게이트 충족
   - 승인/롤백 경로 명확화

---

## 2) 현재 상태 (2026-04-09 기준)

### 2.1 완료/정상

- `sidecar` preflight market-closed 차단은 `PREFLIGHT_SOFT_CODES`로 soft 처리됨
- `RUN_SUMMARY`에 `approval_queue`/`shadow_data_bus`/`preflight` 토큰 기록 정상
- `approval queue gate`가 preview + preflight 조건에서 의도대로 fail-safe 경로 동작
- `idempotency final defer` (preflight blocking 시 상태 오염 방지) 동작 확인

### 2.2 미완/대기

- 장중 자동 런에서 `preflight=pass` + approval gate 경로 실증 필요
- `perf_loop 20/20` 아직 미달 (`13/20`)
- payload path verified 조건 미충족
- Paper-to-Live 전환 게이트 문서화는 되었으나 운영 증적 부족

---

## 3) 첨부 태스크 매핑 (실행 우선순위)

### P0 (즉시 유지)

1. 장중 자동 런 증적 누적 (Telegram/ops-health/RUN_SUMMARY 동시 검증)
2. 20/20 관측 누적 + freeze/live-promotion 조건 추적
3. approval queue 정책 유지:
   - `APPROVAL_REQUIRED=true`
   - `APPROVAL_ENFORCE_IN_PREVIEW=false` (관측 오염 방지)

### P1 (다음 구현)

1. Paper Trading 플로우 명시 전환(`EXEC_ENABLED=true` + paper 계정 경로 고정)
2. 주문 결과/체결 이벤트 Telegram 연동 강화
3. 실시간 PnL 관측 채널(알림 임계값 포함) 추가

### P2 (관측 루프 고도화)

1. 매매 결과 자동 수집 -> R-Multiple 계산 자동화
2. 파라미터 튜닝 제안은 shadow lane에서만 생성
3. Walk-forward/프로모션 조건 자동 판정

---

## 4) Notion/Obsidian 운영 원칙 (현행)

1. Notion:
   - 운영 기준/진행 상태의 SSOT
   - 실행 이력, 승인 상태, TODO 추적
2. Obsidian:
   - 아이디어/리서치/실험 설계 초안
   - 확정 전 가설 관리
3. 반영 순서:
   - `첨부/리서치 -> Obsidian 정규화 -> Notion 승격 -> 코드 반영`

---

## 5) 오늘 체크포인트

- [ ] 장중 자동 런 1회에서 `preflight=pass` 확인
- [ ] `approval_queue`가 preflight_blocking이 아닌 실행 경로에서도 의도대로 기록되는지 확인
- [ ] `payloads/skipped` 사유가 설명 가능하도록 유지
- [ ] 관련 증적 zip/log를 `state` 기반으로 보관

---

## 6) 반영 증적 (2026-04-09)

- Notion 등록:
  - 제목: `[Auto] Attachment Alignment 2026-04-09`
  - DB: `NOTION_WORK_LIST`
  - pageId: `33d78c8a-7aec-8147-bf94-e61ef3f21217`
  - 로컬 리포트: `state/notion-attachment-registration-report.json`
- Obsidian 등록:
  - 노트: `99_Automation/Attachment Action Plan 2026-04-09.md`
  - 업로드 검증: `OBSIDIAN_UPLOAD_OK` 확인
  - 로컬 소스: `state/attachment-action-plan-2026-04-09-obsidian.md`
