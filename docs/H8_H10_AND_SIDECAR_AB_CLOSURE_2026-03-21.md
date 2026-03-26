# H8/H10 + Sidecar A/B 최종 종료 체크리스트 (2026-03-21)

Doc-Tier: P1 (Operational)


## 목적
- H8/H10 관련 Stage4 무결성/복구 동작을 **A/B 실측으로 종료 판정**한다.
- Sidecar Telegram 길이 초과 이슈를 패치 후 **운영 가능한 상태인지** 판정한다.

## 검증 범위
- Stage4 A/B 기준 파일
  - A(원복): `STAGE4_TECHNICAL_FULL_2026-03-21_19-50-26.json`
  - B(제거): `STAGE4_TECHNICAL_FULL_2026-03-21_20-21-23.json`
- Stage5/6 산출물
  - A: `STAGE5_ICT_ELITE_50_2026-03-21_20-54-47.json`, `STAGE6_ALPHA_FINAL_2026-03-21_21-00-29.json`
  - B: `STAGE5_ICT_ELITE_50_2026-03-21_21-07-29.json`, `STAGE6_ALPHA_FINAL_2026-03-21_21-11-35.json`
- Sidecar 실행/상태
  - 실패 런: `logs_61476114744.zip`
  - 패치 후 성공 런: `logs_61477067814.zip`, `sidecar-state-23379832903.zip`

---

## H8/H10 판정 기준
1. Drive OHLCV 정상 시와 누락 시 경로가 로그로 구분된다.
2. 누락 시 API fallback이 활성 정책 범위 내에서만 동작한다.
3. 무결성 가드(`INTEGRITY_GUARD`)가 non-drive 데이터를 추적/제어한다.
4. Stage4 결과 차이가 Stage5/6에 **정상 전파**된다(비결정성 아님).

## 실측 결과
- A(원복) 로그 핵심
  - `API Fallback Usage: attempted 0/5, recovered 0, failed 0`
  - Top10에 `WDC` 포함
- B(제거) 로그 핵심
  - `Missing OHLCV detected: WDC_OHLCV.json`
  - `API fallback recovered OHLCV: WDC (174 bars)`
  - `API Fallback Usage: attempted 1/5, recovered 1, failed 0`
  - `[INTEGRITY_GUARD] ... nonDrive=1 (api 1, heuristic 0) capped=1 ...`
- Stage5 Top50 차이
  - A-B: `WDC` 제외
  - B-A: `IDCC` 포함
- Stage6 결과 차이
  - A: executable 4 (`GCT,TGTX,OPRA,FINV`)
  - B: executable 6 (`GCT,TGTX,UTHR,INVA,OPRA,FINV`)
  - B에서 AI coverage `12/12 verified`, A는 fallback 2건

## H8/H10 최종 판정
- **완료 (PASS)**
- 근거: Stage4 fallback/무결성 가드가 의도대로 동작했고, A/B 차이는 후보 풀/AI 커버리지 차이로 설명 가능하며 재현됨.

---

## Sidecar Telegram 길이 초과 이슈

### 증상
- 실패 로그: `Telegram send failed (400): Bad Request: message is too long`
- 결과: 런이 exit 1로 종료되어 `last-run` 갱신이 이전 Stage6 기준으로 남음.

### 패치
- 파일:
  - `sidecar-template/alpha-exec-engine/src/index.ts`
  - `sidecar-template/alpha-exec-engine/src/market-guard.ts`
- 내용:
  - Telegram 전송 전 텍스트를 줄 단위로 분할(`splitTelegramText`)
  - 기본 최대 길이 `3900` (환경변수 `TELEGRAM_MAX_MESSAGE_LENGTH`로 조정 가능)
  - 로그에 `chunks=n` 출력

### 패치 후 검증
- 성공 로그:
  - `[STAGE6_LOCK] ... STAGE6_ALPHA_FINAL_2026-03-21_21-11-35.json ... sha256=b03e54a34527`
  - `[TELEGRAM_SIM] sent ... chunks=2`
  - `[RUN_SUMMARY] ... hash=b03e54a34527 ...`
- 상태 파일:
  - `lastStage6FileName=STAGE6_ALPHA_FINAL_2026-03-21_21-11-35.json`
  - `lastStage6Sha256`가 `b03e54a34527...`로 갱신

## Sidecar 최종 판정
- **완료 (PASS)**

---

## 운영 권고
- 기본값 유지:
  - `TELEGRAM_MAX_MESSAGE_LENGTH=3900` (미설정 시 기본 적용)
- A/B 검증 종료 후에는 Stage4 fallback 옵션을 운영 정책대로 고정하고, 강제 테스트용 임계값(`999`류)은 제거한다.
