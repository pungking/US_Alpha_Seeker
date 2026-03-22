# Sidecar Speculative Buy Toggle Checklist (2026-03-23)

## Goal

Validate impact of `ACTIONABLE_INCLUDE_SPECULATIVE_BUY` without changing live guard behavior.

## Fixed Preconditions

- Same Stage6 file/hash for OFF and ON comparison.
- Same Sidecar config except `ACTIONABLE_INCLUDE_SPECULATIVE_BUY`.
- Keep `READ_ONLY=true` and `SIMULATION_LIVE_PARITY=true`.
- Keep guard settings unchanged.

## Run Matrix

| Run | ACTIONABLE_INCLUDE_SPECULATIVE_BUY | FORCE_SEND_ONCE | Expected |
| --- | --- | --- | --- |
| A (baseline) | false | true (one-shot) | Actionable only BUY/STRONG_BUY |
| B (test) | true | true (one-shot) | Actionable adds SPECULATIVE_BUY |

After each run, revert `FORCE_SEND_ONCE` to default.

## Evidence to Capture

1. Logs zip:
   - `[ACTIONABLE_POLICY] includeSpeculative=...`
   - `[RUN_SUMMARY] ... actionable=... payloads=... skipped=...`
2. Sidecar state zip:
   - `last-run.json` -> `ACTIONABLE_VERDICTS=...`
   - `last-dry-exec-preview.json` -> `payloadCount`, `skippedCount`, `stage6Contract`

## Comparison Sheet (fill after two runs)

| Metric | OFF (false) | ON (true) | Delta | Notes |
| --- | --- | --- | --- | --- |
| ACTIONABLE_POLICY verdict set |  |  |  |  |
| actionable count |  |  |  |  |
| payload count |  |  |  |  |
| skipped count |  |  |  |  |
| skip reason: conviction_below_floor |  |  |  |  |
| skip reason: entry_blocked:* |  |  |  |  |
| stage6_contract.checked |  |  |  |  |
| stage6_contract.executable |  |  |  |  |

## PASS Criteria

- OFF run shows `includeSpeculative=false` and verdict set `BUY/STRONG_BUY`.
- ON run shows `includeSpeculative=true` and verdict set `BUY/STRONG_BUY/SPECULATIVE_BUY`.
- `stage6_contract` remains consistent with Stage6 input.
- No unexpected regression in guard/preflight behavior.

## Operating Recommendation

- Production default: `ACTIONABLE_INCLUDE_SPECULATIVE_BUY=false`.
- Research mode only: temporarily set `true` and compare drift over multiple days.
- Keep a weekly OFF/ON delta log before any production policy change.
