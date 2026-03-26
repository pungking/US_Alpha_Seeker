# US Alpha Seeker 문서 중요도 관리 레지스트리 (2026-03-25)

Doc-Tier: P0 (Control Tower)


목적: 문서 종류별 중요도를 고정하고, 운영 중 업데이트 우선순위를 명확히 관리한다.

연동 인덱스: `docs/DOC_TIER_INDEX_2026-03-26.md`

---

## 1) 중요도 등급

| 등급 | 의미 | 사용 목적 | 업데이트 주기 |
|---|---|---|---|
| P0 (Control Tower) | 운영 의사결정 직결 | Go/No-Go, 잔여율, 일일 상태판 | 매 실행/매일 |
| P1 (Operational) | 실행/복구 절차 직결 | Runbook, 증적 로그, 체크리스트 | 이벤트 발생 시 즉시 |
| P2 (Engineering) | 구현/개선 참고 | 패치 플랜, 기술 명세, 계약 문서 | 변경 시 |
| P3 (Archive/Reference) | 과거 이력/참조 | 히스토리 보고서, 회고/보조 자료 | 필요 시 |

---

## 2) 현재 문서 매핑

### P0 (Control Tower)

- `docs/PROGRAM_MASTER_STATUS_BOARD_2026-03-23.md`
- `docs/GO_LIVE_REMAINING_WORK_BREAKDOWN_2026-03-23.md`
- `docs/SECURITY_ROTATION_EVIDENCE_LOG_2026-03-23.md`
- `docs/US_Alpha_Seeker_초정밀_종합_분석_보고서_v2.md`

### P1 (Operational)

- `docs/SECURITY_ROTATION_RUNBOOK_2026-03-23.md`
- `docs/SIDECAR_3DAY_OBSERVATION_CHECKLIST_2026-03-12.md`
- `docs/SIDECAR_ACTIVE_REENTRY_REHEARSAL_RUNBOOK_2026-03-12.md`
- `docs/SIDECAR_ROLLBACK_RUNBOOK.md`
- `docs/STAGE6_EXEC_SIDECAR_CHECKLIST.md`
- `docs/H8_H10_AND_SIDECAR_AB_CLOSURE_2026-03-21.md`
- `docs/H11_H13_CLOSURE_CHECKLIST_2026-03-21.md`

### P2 (Engineering)

- `docs/STAGE6_REQUIREMENTS_MASTER_v1_2026-03-14.md`
- `docs/STAGE6_ALPACA_EXEC_POLICY_DRAFT.md`
- `docs/SIDECAR_GOLDEN_CONTRACT.md`
- `docs/SIDECAR_ENV_MATRIX.md`
- `docs/SIDECAR_DATA_DICTIONARY_2026-03-13.md`
- `docs/FULL_PIPELINE_ARCHITECTURE_AND_OPS_2026-03-12.md`
- `docs/STAGE4_*`, `docs/STAGE5_*`, `docs/STAGE6_*` 패치/가이드 문서군

### P3 (Archive/Reference)

- `docs/US_ALPHA_SEEKER_V2_FULL_TRACE_MATRIX_2026-03-17.md`
- `docs/US_ALPHA_SEEKER_V2_PRIORITIZED_REMEDIATION_2026-03-17.md`
- `docs/US_ALPHA_SEEKER_V2_ULTRA_CHECKLIST_REPORT_2026-03-17.md`
- `docs/SIDECAR_DELIVERY_STATUS_2026-03-11.md`
- `docs/SIDECAR_EXPANSION_BACKLOG_2026-03-11.md`
- 기타 과거 회차 중심 분석/계획 문서

---

## 3) 운영 규칙

1. **판정은 P0만 사용**  
   - 운영 진행률, Go/No-Go, 잔여율은 P0 기준으로만 확정한다.
2. **절차는 P1 우선**  
   - 장애/복구/보안 회전/체크리스트는 P1을 실행 기준으로 사용한다.
3. **P2/P3는 참조용**  
   - 충돌 시 P0/P1 우선, P2/P3는 근거 참고로만 사용한다.
4. **신규 문서 생성 시 등급 라벨 필수**  
   - 문서 상단에 `Doc-Tier: P0|P1|P2|P3` 명시.
5. **주간 정리 규칙**  
   - P3 누적 문서는 주 1회 인덱스 정리(중복/폐기 후보 표시).

---

## 4) 이번 주 즉시 적용 체크

- [ ] P0 4개 문서 최신 실행 결과 반영
- [ ] P1 증적 문서(보안 회전/관측 체크리스트) 누락 항목 반영
- [ ] 신규/수정 문서에 Tier 라벨 적용 시작
- [ ] 다음 Go/No-Go 전 문서 등급 충돌(중복 판정 기준) 0건 확인
