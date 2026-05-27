# Goal Operating Contract - 2026-05-28

## Purpose

This contract turns the project-level north star into a narrow, verifiable
Codex Goal for the three-repository US Alpha Seeker system.

The immediate goal is not live trading. The immediate goal is to make the
Stage3 -> Harvester -> Stage6 -> Sidecar loop reproducible, hash-verified,
observable, and safe-by-default.

## Repository Boundaries

| Repository | Owns | Must not own |
|---|---|---|
| `US_Alpha_Seeker` | Stage 0-6 analysis, Stage6 artifact creation, dispatch metadata | Broker order mutation |
| `US_Alpha_Seeker_Harvester` | OHLCV and auxiliary data collection, symbol lifecycle summaries | Final trade decisions |
| `alpha-exec-engine` | Stage6 consumption, dry-run/paper safety gates, broker-facing audit | Recomputed alpha ranking |

## Static Contract

The static goal source of truth is `goal/goal.yaml`.

Required invariants:

- `STAGE6_ALPHA_FINAL_*.json` remains canonical.
- `LATEST_STAGE4_READY.json` remains the Stage4 handshake.
- Analysis code must not enable execution defaults.
- Broker mutation requires exact `CONFIRM LIVE EXECUTION` scope.
- Cross-repo dispatch should carry `goal_hash` and the relevant artifact hash.

## Runtime Contract

Each repo should eventually emit a `goal_status.json` shaped by
`schemas/goal_status.schema.json`.

Minimum required fields:

- `goal_id`
- `goal_version`
- `goal_hash`
- `repo`
- `run_id`
- `checkpoint`
- `status`
- `generated_at`
- `evidence`

## Current Safe Rollout Order

1. Add and validate the static goal contract in `US_Alpha_Seeker`.
2. Add goal metadata to analysis dispatch payloads without changing execution behavior.
3. Add Harvester summary propagation.
4. Add Sidecar report-only goal hash observation.
5. Only after report-only evidence is stable, make Sidecar block on goal mismatch.

## Done-When Criteria

- `npm run ops:goal:validate` passes.
- No execution defaults are changed by goal metadata work.
- Stage6 dispatch can include goal metadata without changing trade selection.
- Sidecar can report goal status before any enforcement change.
