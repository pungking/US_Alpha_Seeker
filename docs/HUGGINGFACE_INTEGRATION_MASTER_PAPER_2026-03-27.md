# Hugging Face Integration Master Paper (2026-03-27)

Doc-Tier: P1 (Operational)

목적: Hugging Face(HF) 연동의 현재 상태, 남은 구현(Advisory/Blend), 운영 전환 기준을 한 문서에서 관리한다.

연계 문서:
- `docs/PROGRAM_MASTER_STATUS_BOARD_2026-03-23.md`
- `docs/GO_LIVE_REMAINING_WORK_BREAKDOWN_2026-03-23.md`
- `docs/US_Alpha_Seeker_초정밀_종합_분석_보고서_v2.md`

---

## 1) Executive Summary

- 현재 HF는 "연결 검증 + 안정성 가드(smoke/strict) + Advisory + Blend"까지 적용되었고, Stage6 실행 점수에 제한 반영이 동작 중이다.
- 로컬 기준 HF 연결은 정상(라우터 엔드포인트, 인증, 추론 응답 확인)이며, 기존 `api-inference.huggingface.co`는 종료되어 `router.huggingface.co` 사용이 필수다.
- 운영 전환은 `Advisory -> Blend` 2단계로 진행하며, 기본값은 항상 보수적으로 유지한다.
- 최신 운영 검증에서 `HF_BLEND enabled=true` 및 실제 적용(`applied>0`, `netDeltaExecution != 0`)이 확인되었다.

---

## 2) 현재 구현 상태 (As-Is)

### 2.1 적용 완료

1. HF 라우터 엔드포인트 반영
   - 기본 URL: `https://router.huggingface.co/hf-inference/models`
2. Stage6 AI 합성 전 HF smoke 테스트 함수 탑재
   - 성공 시 `[HF_SMOKE] ok ...` 로그
   - 실패 시 `[HF_SMOKE] fail ...` 로그
3. Strict 차단 로직 반영
   - `HUGGINGFACE_SMOKE_STRICT=true` 이고 smoke 실패 시 Stage6 fail-fast
4. GitHub Actions 스케줄 워크플로우 환경변수 매핑 반영
5. 로컬 실측 검증 완료
   - `curl` 기준 `router` endpoint 200 응답 확인
6. Advisory/Blend 반영 완료
   - 후보별 `hfSentimentStatus/Label/Score` 기록
   - Blend 적용 시 `hfBlendApplied`, `hfBlendDeltaExecution`, `hfBlendReason` 저장
   - `manifest.hfBlendSummary` 집계 저장
7. 운영/백엔드 경로 반영 완료
   - Stage6 로그에 `[HF_BLEND] enabled=... rawVite=... rawLegacy=... rawProcess=...` 출력
   - 스케줄 워크플로우(`.github/workflows/schedule.yml`)에 `HUGGINGFACE_BLEND_*` 매핑 반영

### 2.2 아직 미적용

1. 서버 경유(proxy) 강제 구조(클라이언트 직접 호출 최소화)
2. HF 결과 기반 텔레그램 리포트 강화(운영용 해석 문구)
3. 런별 모니터링 자동 리포트(5~10런 집계 자동화)

---

## 3) 환경별 운영 정책 (To-Be Baseline)

| 환경 | ENABLE_SMOKE_TEST | SMOKE_STRICT | 운영 의도 |
|---|---:|---:|---|
| Local | true | false | 개발/관측용, 실패 허용 |
| GitHub Actions (Schedule) | true | false | 자동 검증, 파이프라인 안정 우선 |
| Vercel (Web App) | false | false | 운영 화면 안정, 키 노출면 최소화 |

주의:
- `VITE_*`는 클라이언트 번들 노출 가능성이 있으므로 Production에서는 최소화한다.
- Vercel에서 smoke를 끌 경우 HF 관련 네트워크/콘솔 로그가 안 나오는 것이 정상이다.

추가 정책(현재 고정값):
- `HUGGINGFACE_ENABLE_ADVISORY=true`
- `HUGGINGFACE_BLEND_ENABLED=true`
- `HUGGINGFACE_BLEND_WEIGHT=0.25`
- `HUGGINGFACE_BLEND_MAX_DELTA=8`

---

## 4) 구현 로드맵 (Advisory -> Blend)

### Phase A - Advisory Mode (우선 적용)

목표: HF 결과를 점수에 반영하지 않고 관측 데이터로만 축적한다.

적용 범위:
- 후보별 `hfSentimentLabel`, `hfSentimentScore`, `hfAuditReason` 기록
- Stage6 결과 JSON/로그/요약에 "참고 지표"로만 출력
- 매매 의사결정값(conviction, verdict, execution gate) 미변경

완료 기준:
- 3회 이상 실행에서 누락 없이 HF audit 필드 수집
- 기존 Top6/Executable 결과 변동 0 (Advisory이므로)
- 상태: **완료**

### Phase B - Blend Mode (다음 단계)

목표: HF 점수를 낮은 가중치로 제한 반영한다.

권장 정책:
- Conviction 보정폭 상한: `+-2` 또는 `+-3` 포인트 캡
- 음수 보정 조건을 더 보수적으로(positive보다 negative 영향 기준 엄격)
- 환경 플래그 기본값 OFF

완료 기준:
- 5~10회 관측에서 결과 변동 추적표 확보
- 주요 왜곡(과도한 rank jump, watchlist->exec 급변) 미발생
- 상태: **진행 중(운영 관측 누적 단계)**

---

## 4-A) Track 3 운영 정책 고정 (신규)

### A. `SMOKE_STRICT` 승격 규칙

- 기본값: `false` 유지
- `true` 승격 조건(모두 충족):
  1. 최근 10런에서 HF smoke 성공률 95% 이상
  2. 최근 10런에서 HF timeout/retry exhaustion으로 인한 Stage6 실패 0회
  3. 운영 시간대(스케줄 런)에서 3일 연속 안정성 확인
- 강등 규칙:
  - 위 조건 중 하나라도 이탈하면 즉시 `SMOKE_STRICT=false`로 복귀

### B. Blend Weight 조정 규칙

- 시작 기준선: `weight=0.25`, `maxDelta=8`
- 조정 단위:
  - 10런 단위로만 검토
  - 1회 조정폭은 `±0.05` 이내
- 허용 범위:
  - `0.15 <= weight <= 0.35`
  - `maxDelta`는 운영 중 고정(기본 8), 긴급 조정 외 변경 금지

### C. 장애 폴백 규칙

- HF 상태 `FAILED/SKIPPED/DISABLED`는 Blend 미적용(`blend_disabled` or status reason)
- HF 장애 시에도 Stage6 핵심 게이트는 지속 동작(비차단)
- 장애 확산 시 우선순위:
  1. `BLEND_ENABLED=false`
  2. `ENABLE_ADVISORY=true` 유지
  3. 필요 시 `ENABLE_ADVISORY=false`로 축소

---

## 5) 운영 전환 기준 (Go/No-Go with HF)

Go 조건:
1. Smoke 성공률 기준 충족(예: 최근 N회에서 성공률 95%+)
2. HF 장애 시 비차단 운영 유지(`STRICT=false` 기준)
3. Advisory 결과와 기존 모델의 괴리 리포트 확보
4. Blend 적용 시 캡/롤백 토글 즉시 복구 가능

No-Go 조건:
1. HF API 응답 지연/실패로 Stage6 안정성 저하
2. Blend 적용 후 과도한 랭킹 왜곡
3. 운영에서 키/보안 정책 충돌 발생

---

## 6) 리스크 및 완화책

1. Endpoint 변경 리스크
   - 완화: router endpoint 고정, smoke 상시 관측
2. 인증/권한 오류 리스크
   - 완화: 로컬 `curl` 헬스체크 절차 문서화
3. CORS/브라우저 실행 경로 혼동
   - 완화: 검증 경로 분리(Local dev vs Vercel)
4. 키 노출 리스크
   - 완화: Production에서 `VITE_HUGGINGFACE_API_KEY` 비활성/제거 원칙

---

## 7) 운영 체크리스트 (반복 실행용)

Daily/Run 단위:
- [ ] GitHub Actions 로그에 `[HF_SMOKE] ok|fail` 확인
- [ ] Stage6 로그에 `[HF_BLEND] enabled=... rawVite=... rawLegacy=... rawProcess=...` 확인
- [ ] Stage6 성공/실패 원인에서 HF strict block 여부 확인
- [ ] Vercel은 smoke OFF 유지 확인
- [ ] API key/timeout/retry 정책값 드리프트 점검
- [ ] `hfBlendSummary(applied/positive/negative/netDeltaExecution)` 기록

주간:
- [ ] Advisory 관측 리포트 갱신
- [ ] Blend 전환 여부 판단 회의(변동성/왜곡 검토)

---

## 8) 표준 설정값 (현재 권장)

- `HUGGINGFACE_API_BASE_URL=https://router.huggingface.co/hf-inference/models`
- `HUGGINGFACE_FINBERT_MODEL=ProsusAI/finbert`
- `HUGGINGFACE_SUMMARY_MODEL=facebook/bart-large-cnn`
- `HUGGINGFACE_ENABLE_SMOKE_TEST=true` (Local/GHA), `false` (Vercel)
- `HUGGINGFACE_SMOKE_STRICT=false`
- `HUGGINGFACE_ENABLE_ADVISORY=true`
- `HUGGINGFACE_ADVISORY_MAX_CANDIDATES=6`
- `HUGGINGFACE_BLEND_ENABLED=true`
- `HUGGINGFACE_BLEND_WEIGHT=0.25`
- `HUGGINGFACE_BLEND_MAX_DELTA=8`
- `HUGGINGFACE_TIMEOUT_MS=4500`
- `HUGGINGFACE_RETRY=1`

---

## 9) 변경 이력

- 2026-03-27: 본 마스터 페이퍼 신규 작성
- 2026-03-27: 현재 상태를 "Smoke/Guard 완료, Analysis 반영 미적용"으로 확정
- 2026-03-27: Advisory/Blend 운영 반영 상태로 갱신, Track 3 정책(`SMOKE_STRICT` 승격/Blend 조정/폴백 규칙) 고정
