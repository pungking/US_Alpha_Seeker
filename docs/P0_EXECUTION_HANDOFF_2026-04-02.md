# P0 Execution Handoff (2026-04-02)

이 문서는 “지금 당장 무엇을 누가 할지”를 분리한 실행용 핸드오프입니다.  
원칙: **실주문 안정성 우선 + 운영 자동화는 단계적 확장**.

---

## 1) 작업 분담 (Owner 분리)

## Codex가 이미 완료한 것

- Notion 보관/보존 스캐폴딩 검증 완료
  - `📅 Daily Snapshot`
  - `🛡️ Guard Action Log`
  - `📈 HF Tuning Tracker`
  - `📉 Performance Dashboard`
- 퍼센트 이상치 백필 스크립트 반영/검증 경로 정리 완료
- MCP 확장 방향 문서화 완료
  - `docs/MCP_ONLINE_AUTOMATION_BLUEPRINT_2026-04-02.md`
  - `docs/MCP_COLLAB_SETUP_PLAYBOOK_2026-04-02.md`

## 사용자(운영자)가 해야 하는 것

- 매일 실행 결과(요약 + logs/state zip) 전달
- 변수/시크릿 drift 없이 고정 유지
- 월간 Archive 운영(현재는 수동 SOP)

---

## 2) 오늘부터 운영자가 할 일 (매우 구체적으로)

## A. 매일 1회 확인 (GitHub Actions)

1. `US_Alpha_Seeker` 스케줄 런 확인
2. `alpha-exec-engine`의 `sidecar-dry-run` 확인
3. `alpha-exec-engine`의 `sidecar-market-guard` 확인

확인 기준:

- 실패(red) 런이 있으면 run URL + 첫 에러 1~2줄 캡처
- 성공(green) 런이면 summary와 artifact(zip) 확보

## B. 매일 전달 데이터 (내게 붙여넣기)

아래 3개를 세트로 전달:

1. `Sidecar Dry-Run Summary`
2. `Sidecar Market Guard Summary`
3. artifact zip 파일명 2개
   - `logs_*.zip`
   - `sidecar-state-*.zip` 또는 `sidecar-guard-state-*.zip`

## C. 고정 변수 점검 (주 2회)

변수 점검 위치:

- GitHub repo variables/secrets
- Vercel env
- 로컬 `.env` (필요 시)

드리프트 체크 핵심:

- 키 이름 오탈자(`_` vs `-`)
- `VITE_` prefix 오용
- 토큰 만료/권한 누락

---

## 3) 운영 상태 판정표 (빠른 의사결정)

## 정상 운영 (계속 관측)

- `perf_loop_gate_progress < 20/20`
- `hf_live_promotion = HOLD` 또는 `BLOCK` (관측 단계면 정상 가능)
- `payloads = 0` (조건 미충족 시 정상 가능)

## 즉시 점검 필요

- `hf_marker_audit`에서 `missing` 반복
- `hf_alert.triggered=true`가 연속 누적
- `guard_control`이 의도와 반대로 장시간 유지
- Notion 적재 실패/누락 연속 발생

---

## 4) 월간 보관 운영 (현재 수동)

중요:

- 지금은 **후보 식별 자동**
- **실제 이동/보관은 수동**

월 1회 순서:

1. Notion `99_Archive_Candidate` 뷰 열기
2. `Bucket Month` 기준 대상 확인
3. CSV/JSON 백업
4. Archive DB로 이동/복제
5. `01_*` 운영 뷰 최신 row 가시성 재확인

---

## 5) Codex가 다음으로 바로 해줄 수 있는 것

아래는 “원하면 바로 코드 반영 가능한” 작업:

1. P0 운영체크 자동 리포트 스크립트
   - 최근 24h 런 상태 + 핵심 지표 요약 md/json 생성
2. Incident 자동 triage 템플릿 고도화
   - 에러 클래스별 복구 가이드 자동 첨부
3. Notion 월간 Archive 반자동(A안) 워크플로우
   - 후보 리포트 + 백업 + 알림(실제 이동은 수동 승인)

---

## 6) 운영자용 “복붙 템플릿”

아래 형식으로 보내주면 내가 가장 빠르게 검증 가능:

```md
## Sidecar Dry-Run Summary
(전체 붙여넣기)

## Sidecar Market Guard Summary
(전체 붙여넣기)

## Artifacts
- logs_xxx.zip
- sidecar-state_xxx.zip (or sidecar-guard-state_xxx.zip)

## Notes
- 오늘 변경한 변수: (있으면 기재, 없으면 없음)
- 수동 실행 여부: (workflow_dispatch / schedule)
```

---

## 7) 이번 주 목표 (합의본)

1. `perf_loop_gate_progress`를 `11/20 -> 20/20` 달성
2. `hf_alert` 안정화 추세 확인
3. 운영 변수 드리프트 0건 유지
4. 월간 보관 SOP 리허설 1회

이 4개가 충족되면 다음 단계(승격 판단/추가 자동화)로 자연스럽게 넘어갈 수 있습니다.
