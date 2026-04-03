# Master Workflow Control Plane (Scaffold) - 2026-04-03

Purpose: provide a safe control-plane skeleton for the full loop:

`code -> collect -> validate -> (optional) promote request -> incident notify`

This scaffold is intentionally conservative for current operations:

- It is **manual-only** (`workflow_dispatch`)
- It does **not** auto-change strategy parameters
- It does **not** auto-promote live mode
- It keeps the 20/20 sample gate as a hard boundary

---

## 1) State Machine (Phase-0)

`IDLE -> COLLECTING -> VALIDATING -> { HOLD | PROMOTION_REQUESTED } -> INCIDENT_HANDLING -> IDLE`

Transition rules:

1. `IDLE -> COLLECTING`
   - manual run starts (`master-control-plane.yml`)
2. `COLLECTING -> VALIDATING`
   - sidecar dry-run dispatch succeeds, or collect lane is skipped by policy
3. `VALIDATING -> HOLD`
   - validation lane disabled or validation fails or sample `< required`
4. `VALIDATING -> PROMOTION_REQUESTED`
   - all conditions pass and operator explicitly enables promote request
5. `* -> INCIDENT_HANDLING`
   - when any lane fails and incident notify is enabled

---

## 2) Workflow Files (Skeleton)

- `.github/workflows/master-control-plane.yml`
  - orchestrates collect/validate/promote/incident lanes
- `.github/workflows/reusable-control-collect.yml`
  - optional dispatch of sidecar `dry-run.yml` (safe inputs only)
- `.github/workflows/reusable-control-validate.yml`
  - optional local MCP health routine
- `.github/workflows/reusable-control-promote.yml`
  - only requests `validation_pack=true` dispatch (no live promotion)
- `.github/workflows/reusable-control-incident.yml`
  - optional Telegram incident notice

---

## 3) Guardrails

1. `allow_promote=false` is default
2. sample gate required (`sample_progress_current >= sample_progress_required`)
3. promotion lane only supports `request_validation_pack`
4. no direct writes to live trade execution toggles in this scaffold
5. incident notify is opt-in (`notify_telegram=true`)

---

## 4) Recommended Near-Term Usage

Until 20/20 is completed:

1. run `collect + validate` only
2. keep `promotion_mode=hold`
3. use `request_validation_pack` only after gate reaches final threshold

---

## 5) Example Manual Run Settings

- `mode=full`
- `dispatch_sidecar_dry_run=true`
- `run_local_mcp_health=true`
- `allow_promote=false`
- `promotion_mode=hold`
- `notify_telegram=true`
- `sample_progress_current=13`
- `sample_progress_required=20`

This configuration keeps us in a safe "observe and accumulate" loop.

