# MCP Market Intelligence Expansion Roadmap (2026-04-08)

목적: 수집/분석 정확도와 신뢰도를 높이되, `20/20` 게이트 이전 원데이터를 오염시키지 않는 방식으로 MCP를 확장한다.

---

## 1) 운영 제약 (하드 가드레일)

- `20/20` 이전: 신규 MCP는 **shadow-only** (읽기/교차검증/근거보강)
- 주문 실행 및 핵심 전략 파라미터 자동변경 금지
- 모든 확장은 `docs -> 코드 -> 검증 -> docs` 순서 준수

---

## 2) 우선순위 매트릭스 (종합안)

| 우선순위 | MCP | 근거 | 기대 효과 |
|---|---|---|---|
| 🔴 최우선 | Alpaca MCP | alpha-exec-engine 핵심 실행 경로 | 주문 실행 디버깅/검증 자동화(우선 read-only) |
| 🔴 최우선 | Perplexity MCP | 리서치 템플릿/컨텍스트 강화 | HF sentiment 맥락 품질 향상 |
| 🔴 최우선 | Alpha Vantage MCP | 공식 MCP, 시계열/지표 교차검증 가능 | 신호 품질/신뢰도 보강 |
| 🟠 높음 | SEC EDGAR 레이어 | 공시 근거 검증 레이어 필요 | Stage6 종목 근거 강화 |
| 🟠 높음 | Supabase/Postgres MCP | JSON 상태 관리 확장 한계 | 상태 조회/감사/확장성 향상 |
| 🟡 중간 | Finnhub MCP | VIX/earnings 중요 소스 | 어닝 캘린더/리스크 맥락 개선 |
| 🟡 중간 | Obsidian MCP | 런북/튜닝 누적 구조 | 학습/튜닝 워크플로 정착 |
| 🟢 선택 | Redis MCP | 스냅샷 staleness 대응 | 레짐 전환 지연 최소화 |
| 🟢 선택 | Datadog MCP | drift/이상감지 보강 | 이상 탐지 자동화 강화 |
| 🟢 선택 | TradingView MCP | 보조 신호/패턴 탐지 | 기술 신호 보강 (shadow 검증 후) |

---

## 3) Phase-1 (첫번째 진행) - Shadow Data Bus

### 범위
- 도입 대상: `Alpaca(read-only)`, `Alpha Vantage`, `SEC EDGAR`
- 반영 대상: sidecar preview summary 근거 필드 + ops health 보조 지표
- 금지: 실주문 실행/전략 파라미터 자동반영

### 완료 조건
1. 신규 MCP 데이터가 `state/*` 산출물에 추가됨
2. 기존 Stage6 결과와 교차검증 지표(`source_agreement`, `evidence_quality`)가 생성됨
3. dry-run/market-guard 성공률 저하 없음
4. Notion `운영 히스토리`에 "shadow lane 적용" 기록 자동 누적

### 실패/롤백 조건
- dry-run 실패율 증가
- 기존 핵심 지표 누락/파손
- 2회 연속 파이프라인 불안정 발생 시 즉시 feature flag off

---

## 4) 검증 지표 (Gate 전용)

- `source_agreement_pct` (소스 간 합의율)
- `signal_precision_shadow` (shadow 신호 정밀도)
- `drift_delta` (기존 대비 편차)
- `no_reason_drift` 유지 여부
- alert 발생률 및 false positive 비율

---

## 5) 문서/동기 루틴

- SSOT 문서: `docs/`
- 운영 보드: Notion (`NOTION_PROJECT`, `운영 히스토리`, `작업 목록`)
- 연구/개인 런북: Obsidian (`Templates/00_Ops_Hub.md` 외)
- 동기 명령:
  - `npm run ops:knowledge:sync`

---

## 6) 실행 순서 (체크리스트)

1. 문서 업데이트 (본 문서 + 운영모델 문서)
2. feature flag 설계 (`SHADOW_*` 계열, 기본 false)
3. sidecar read-path 추가 (MCP 응답 파싱/요약 필드)
4. dry-run 회귀검증
5. Notion/Obsidian 동기화 및 이력 반영
6. 2~3일 관측 후 Phase-2 여부 결정

---

## 7) 다음 단계 (Phase-2 후보)

- Supabase/Postgres MCP 연동(상태 저장 계층 확장)
- Finnhub/TradingView shadow 비교
- `20/20` 달성 후 OFF/ON/STRICT + payload probe 통합 평가
