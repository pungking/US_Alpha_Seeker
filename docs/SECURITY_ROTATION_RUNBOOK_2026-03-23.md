# Security Rotation Runbook (2026-03-23)

목적: 5-D/5-E 운영 보안 항목을 실무 기준으로 고정한다.

## 1) 로컬 저장 정책 (Web App)

### 1-1. 원칙

- 우선순위: `ENV > LOCAL_OVERRIDE > MANUAL_INPUT`
- 민감 토큰(`gdrive_access_token`)은 `sessionStorage`만 사용
- `localStorage`는 운영 편의용 비민감 키에 한해 제한적으로 사용

### 1-2. 허용 키

| 키 | 저장소 | 목적 | TTL/정책 |
|---|---|---|---|
| `gdrive_client_id` | localStorage | 수동 Client ID override | Env 설정 시 무시, 수동 clear 가능 |
| `US_ALPHA_STAGE5_LOCK_OVERRIDE` | localStorage | Stage5 lock 운영자 오버라이드 | `updatedAt` 기반 TTL 만료 시 자동 해제 |
| `US_ALPHA_STAGE5_LOCK_FILE_ID` | local/session | 호환성 키 | override 만료/해제 시 제거 |
| `US_ALPHA_STAGE5_LOCK_FILE_NAME` | local/session | 호환성 키 | override 만료/해제 시 제거 |

### 1-3. 운영자 정리 절차

1. 웹 앱 열기 -> Stage6 화면
2. Stage5 lock override OFF 확인
3. 브라우저 DevTools -> Application -> Local Storage
4. 아래 키 제거:
   - `gdrive_client_id`
   - `US_ALPHA_STAGE5_LOCK_OVERRIDE`
   - `US_ALPHA_STAGE5_LOCK_FILE_ID`
   - `US_ALPHA_STAGE5_LOCK_FILE_NAME`

## 2) 시크릿 로테이션 절차

### 2-1. 대상

- AI: GEMINI, PERPLEXITY
- Data: RAPID/POLYGON/ALPACA/FINNHUB/FMP/TWELVE/ALPHA_VANTAGE
- Infra: GDRIVE OAuth, Telegram, GitHub PAT

### 2-2. 순서

1. 공급자 콘솔에서 신규 키 발급
2. 기존 키 즉시 폐기(Disable/Revoke)
3. GitHub Actions Secrets/Variables 갱신
4. Vercel Environment Variables 갱신
5. `.env.vercel.example`는 placeholder 유지(`__SET_ME__`)

## 3) 롤백 절차 (운영 장애 시)

1. 최근 정상 동작 시점의 Secrets/Vars 스냅샷 식별
2. 영향 범위 확인(Stage0/6/Sidecar 중 어느 경로 실패인지)
3. 키 롤백 반영 후 최소 검증:
   - Stage0 auth
   - Stage6 lock
   - Sidecar dry-run
4. 장애 리포트 기록 후 재-로테이션 일정 확정

## 4) 실행 증적 템플릿

아래 항목을 채워서 운영 로그로 남긴다.

```md
## Security Rotation Evidence
- rotated_by:
- rotated_at:
- scope:
- provider_console_ticket:
- github_vars_updated: yes/no
- vercel_env_updated: yes/no
- old_key_revoked: yes/no
- validation_run_id:
- rollback_point:
- notes:
```

## 5) 현재 코드 계약

- `components/UniverseGathering.tsx`
  - Client ID source 노출 (`ENV/LOCAL/MANUAL/EMPTY`)
  - `Clear Local Override` 버튼 제공
- `components/AlphaAnalysis.tsx`
  - Stage5 lock override payload에 `updatedAt` 저장
  - `VITE_STAGE5_LOCK_OVERRIDE_MAX_AGE_MIN` 만료 시 stale lock 자동 제거

