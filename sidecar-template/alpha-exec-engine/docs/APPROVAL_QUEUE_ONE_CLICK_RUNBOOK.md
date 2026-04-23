# Approval Queue One-Click Runbook

## Purpose
Remove manual Drive JSON editing for `APPROVAL_QUEUE.json` when handling `ENTRY_NEW` / `SCALE_UP` approval decisions.

## Workflows
- Sidecar owner repo: `sidecar-approval-queue-action` (`approval-queue-action.yml`)
- Webapp bridge repo: `Sidecar Approval Action Bridge` (`.github/workflows/sidecar-approval-action-bridge.yml`)

## Inputs
- `action`: `approve` or `reject`
- `request_id`: preferred exact target
- `symbol`: fallback target when `request_id` is empty
- `stage6_hash`: optional filter with symbol mode
- `reason`: optional operator note
- `dry_run`: `true` for preview-only

## Execution model (important)
- This is **operator-triggered** manual dispatch.
- No Telegram click action is required in current version.
- No auto-approve logic is applied by default.

## Safety behavior
- Script updates only the latest matching `pending` record by default.
- It stamps `resolvedAt` and `resolvedBy`.
- If no matching pending row exists, workflow fails with explicit reason.

## Example flow
1. Read pending `request_id` from dry-run preview/log (`approval_pending request_id=...`).
2. Run bridge workflow with `action=approve`, `request_id=<id>`.
3. Trigger next dry-run/exec cycle.
4. Confirm dry-run summary shows `approval_queue ... matchedApproved>=1` and payload is no longer blocked by approval.

## Failure triage
- `approval queue file not found`: verify `GDRIVE_ROOT_FOLDER_ID` and `APPROVAL_QUEUE_FILE_NAME`.
- `oauth refresh failed`: verify `GDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN` secrets.
- `no matching pending approval record`: check `request_id`, symbol, and stage hash scope.
