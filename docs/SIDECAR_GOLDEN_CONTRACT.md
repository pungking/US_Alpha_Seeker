# SIDECAR Golden Contract (Stage6)

Doc-Tier: P2 (Engineering)


## Purpose
- Freeze one canonical Stage6 contract fixture for sidecar validation.
- Fail fast before execution if payload shape or critical values drift.

## Contract Version
- `stage6-contract-v1`

## Golden Fixture
- File: `docs/fixtures/stage6_golden_contract_v1.json`
- Canonical source run: `STAGE6_ALPHA_FINAL_2026-03-09_21-44-55.json`

## Hash Lock
Use this after finalizing fixture content:

```bash
shasum -a 256 docs/fixtures/stage6_golden_contract_v1.json
```

Record the hash in execution logs for every sidecar run.

## Required Keys
- Root keys
  - `contractVersion` (string)
  - `sourceStage6File` (string)
  - `stage5LockHash` (string)
  - `top6` (array length must be 6)
- Per candidate (`top6[i]`)
  - `rank` (1..6)
  - `symbol` (string)
  - `entryPrice` (number > 0)
  - `targetPrice` (number > `entryPrice`)
  - `stopLoss` (number < `entryPrice`)
  - `finalVerdict` (`BUY` or `STRONG_BUY`)
  - `expectedReturn` (string, non-empty)

## Validation Rules
- Symbol set and rank order must match (`rank` + `symbol` exact match).
- Geometry must pass for all 6:
  - `targetPrice > entryPrice > stopLoss`
- Numeric tolerance:
  - Price diff <= `CONTRACT_PRICE_TOLERANCE` (default `0.05`)
  - Expected return diff <= `CONTRACT_ER_TOLERANCE_PCT` (default `1.0` percent point)

## Failure Codes
- `CONTRACT_VERSION_MISMATCH`
- `CONTRACT_TOP6_SIZE_MISMATCH`
- `CONTRACT_SYMBOL_ORDER_MISMATCH`
- `CONTRACT_PRICE_MISMATCH`
- `CONTRACT_VERDICT_MISMATCH`
- `CONTRACT_GEOMETRY_INVALID`

## Operational Rule
- Any `CONTRACT_*` failure means:
  - no execution,
  - no order submission,
  - emit Telegram `CRITICAL` to simulation channel.
