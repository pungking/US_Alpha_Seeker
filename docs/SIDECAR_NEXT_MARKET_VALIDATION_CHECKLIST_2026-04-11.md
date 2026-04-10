# Sidecar Next Market Validation Checklist (2026-04-11)

목적: 다음 미국장(ET 2026-04-13 09:30 / KST 2026-04-13 22:30)에서 승격 전 필수 검증을 한 번에 완료한다.

## 0) 사전 고정값 확인 (장 시작 전)

- [ ] `POSITION_LIFECYCLE_ENABLED=true`
- [ ] `POSITION_LIFECYCLE_PREVIEW_ONLY=true`
- [ ] `PREFLIGHT_BLOCKING_HARD_FAIL=true`
- [ ] `PREFLIGHT_SOFT_CODES` includes `PREFLIGHT_MARKET_CLOSED`
- [ ] 최근 자동 런에서 `hf_marker_audit` all `ok`

## 1) 장중 실행 확인 (필수)

- [ ] `dry-run.yml` 스케줄 런이 장중에 1회 이상 `completed/success`
- [ ] `RUN_SUMMARY` contains `event=sent` (dedupe-only 아님)
- [ ] `stage6Hash`가 직전 핵심 해시 대비 변경되었거나, 변경이 없으면 non-duplicate payload 근거 확보

## 2) 페이로드/프리플라이트 게이트

- [ ] `payloads > 0`
- [ ] `idemp_new > 0` (중복만 발생하지 않음)
- [ ] `preflight=pass:PREFLIGHT_PASS`
- [ ] `preflight_blocking=false`

## 3) 승격 관련 핵심 지표

- [ ] `perf_loop_gate_status=GO` 여부 확인
- [ ] `hf_freeze.status=FROZEN` 여부 확인
- [ ] `hf_live_promotion.requiredMissing` 감소 추세 확인
- [ ] `payloadPathVerified=true` (probe/live path 검증)

## 4) 운영 신뢰성 증적

- [ ] Telegram 시뮬레이션 메시지 수신
- [ ] `Sidecar Ops Health` = `PASS`
- [ ] 아티팩트 보관: `logs_*.zip`, `sidecar-state-*.zip`
- [ ] 이상 징후 발생 시 원인/조치/재현 여부를 Notion 운영 로그에 기록

## 5) 판정

- [ ] **승격 대기 유지**: `perf_loop_gate_status != GO` 또는 `requiredMissing` 존재
- [ ] **승격 검토 가능**: `GO + FROZEN + payloadPathVerified=true + marker_audit all ok`

