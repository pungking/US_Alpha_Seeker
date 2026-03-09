# SIDECAR Telegram Severity Standard

## Purpose
- Standardize severity levels so operational alerts are consistent and actionable.

## Channels
- Primary report channel: `-1003800785574`
- Simulation/ops channel: `1281749368`

## Severity Levels

### INFO
- Normal flow notifications.
- Examples:
  - `ORDER_SUBMITTED`
  - `ORDER_FILLED`
  - `PARTIAL_FILLED`
  - `EXIT_TP`
  - `DAILY_PNL`

### WARN
- Degradation or guarded operation; execution still controlled.
- Examples:
  - `RISK_GUARD_ACTIVE`
  - `EXIT_TIMEOUT`
  - `SLIPPAGE_ELEVATED`
  - `TELEGRAM_RETRY`
  - `LOCK_FALLBACK_TO_LATEST`

### CRITICAL
- Hard block, contract failure, or emergency stop.
- Examples:
  - `CONTRACT_*`
  - `LOCK_*` (hard mismatch)
  - `RISK_KILL_SWITCH`
  - `ORDER_REJECTED_HARD`
  - `TELEGRAM_CONTRACT_BLOCKED`

## Routing Policy
- Analysis narrative: primary report channel only.
- Execution and simulation events: simulation channel only.
- Critical failures: send to simulation channel first, then mirror summary to primary channel.

## Message Format (minimum)
- `severity`
- `eventCode`
- `runId`
- `symbol` (if symbol scoped)
- `action`
- `reason`
- `policyVersion`
- `stage5LockHash` (when applicable)

## Retry Policy
- Telegram send fail:
  - retries: 3
  - backoff: 2s, 5s, 10s
- Still failed:
  - emit local error record `TELEGRAM_SEND_FAILED`,
  - continue trading logic only if message is non-critical.
