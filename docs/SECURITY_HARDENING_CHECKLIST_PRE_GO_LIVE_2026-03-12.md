# Security Hardening Checklist (Pre Go-Live) - 2026-03-12

Doc-Tier: P1 (Operational)


목적: 테스트/개발이 종료된 뒤, 실운영 전 보안 리스크를 일괄 정리한다.

범위:
- `US_Alpha_Seeker`
- `alpha-exec-engine`
- `US_Alpha_Seeker_Harvester`

---

## 0) 실행 전 잠금 조건

- [ ] 기능 개발/확장 완료 선언
- [ ] `main` 브랜치 코드 freeze
- [ ] 배포/실행 플래그 안전모드 확인 (`EXEC_ENABLED=false`, `READ_ONLY=true`)

---

## 1) 비밀정보 인벤토리

- [ ] 사용 중인 키/토큰 목록 최신화
  - [ ] AI: GEMINI, PERPLEXITY
  - [ ] Data: RAPID_API, POLYGON, ALPACA, FINNHUB, FMP, TWELVE_DATA, ALPHA_VANTAGE
  - [ ] Infra: GDRIVE OAuth, Telegram, GitHub PAT/APP
- [ ] 레포별 Secrets/Variables 책임 분리 재검증
- [ ] 만료 정책(주기/소유자) 문서화

---

## 2) 하드코딩 시크릿 제거

- [ ] 코드 전역 스캔(키/토큰/PAT/ChatID/계정 식별자)
- [ ] 하드코딩된 민감값 제거 후 env/secrets 참조로 대체
- [ ] `.env.example`에는 샘플/기본값만 유지
- [ ] 문서/스크린샷/로그에 남은 민감값 마스킹

검증 커맨드(예시):
- [ ] `rg -n "ghp_|AIza|xoxb-|AKIA|SECRET|TOKEN|PRIVATE KEY|BEGIN RSA|bot[0-9]{8,}:" -S .`

---

## 3) 키 전면 회전(Rotate)

- [ ] 노출 가능성 있는 키 전체 재발급
- [ ] 기존 키 즉시 폐기
- [ ] 신규 키를 GitHub Secrets/Variables에 반영
- [ ] 반영 후 최소 권한 원칙 확인(읽기 전용/필요 범위만)

---

## 4) 히스토리/스캔 정리

- [ ] 현재 트리 기준 비밀정보 스캔 통과
- [ ] 최근 커밋 범위 수동 검토(민감정보 포함 여부)
- [ ] 외부 공유물(티켓/채팅/노션) 민감값 노출 여부 점검

---

## 5) 워크플로우/운영 보안 가드

- [ ] GitHub Actions 권한 최소화(`permissions` 최소 권한)
- [ ] 불필요한 수동 override 변수 제거
- [ ] 테스트 전용 변수(`FORCE_SEND_ONCE` 등) 기본값 재확인
- [ ] Production 전환 전 승인 절차(2인 검토) 확정

---

## 6) 기능 회귀 검증 (보안 반영 후)

- [ ] `US_Alpha_Seeker` 스케줄 실행 정상
- [ ] `sidecar-dry-run` 정상 (요약/artifact/state)
- [ ] `sidecar-market-guard` 정상 (요약/artifact/state)
- [ ] Telegram/Drive/Alpaca 연동 정상
- [ ] 중복방지(idempotency/dedupe) 정상

---

## 7) Go-Live 승인 체크

- [ ] 모든 체크박스 완료
- [ ] 보안 변경 diff 리뷰 완료
- [ ] 운영 롤백 절차 최종 리허설 완료
- [ ] 승인자 서명

승인 로그:
- 작성:
- 검토:
- 승인:
- 일시:

---

## 8) 사후 운영 규칙

- [ ] 키 회전 주기 운영(예: 30/60/90일)
- [ ] 신규 기능 PR 시 secret scan 필수
- [ ] incident 발생 시 24시간 내 키 재회전 및 영향 분석

