# Auto-Scheduler Reliability Runbook

Generated: 2026-06-03

## Purpose

Prevent the US Alpha Seeker pre-RTH analysis from depending on a single GitHub
scheduled event.

This runbook does not authorize broker execution. It only covers analysis
workflow triggering and coverage verification.

## Reliability Layers

| Layer | Mechanism | File | Behavior |
| --- | --- | --- | --- |
| Primary fanout | Multiple weekday cron windows | `.github/workflows/schedule.yml` | Runs the canonical Auto-Scheduler; same-market-day gate blocks duplicates. |
| Recovery fanout | Multiple weekday watchdog windows | `.github/workflows/auto-scheduler-watchdog.yml` | Dispatches `schedule.yml` if no active/successful market-date run exists. |
| Deadline guard | Pre/early-RTH coverage check | `.github/workflows/auto-scheduler-deadline-guard.yml` | Dispatches canonical scheduler and optionally sends Telegram notice if coverage is missing. |
| External scheduler | `repository_dispatch` event | `.github/workflows/schedule.yml` | Allows Vercel Cron, Cloudflare Cron, cron-job.org, or another scheduler to trigger the canonical workflow. |

## External Scheduler Contract

External services should call GitHub `repository_dispatch` with:

- repo: `pungking/US_Alpha_Seeker`
- event_type: `auto_scheduler_external_trigger`
- branch: repository default branch (`main`)
- client payload: `{"source":"external_scheduler"}`
- external dispatch cannot bypass the same-market-day duplicate gate

Example request with placeholders only:

```bash
curl -fsS \
  -X POST "https://api.github.com/repos/pungking/US_Alpha_Seeker/dispatches" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_DISPATCH_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "auto_scheduler_external_trigger",
    "client_payload": {
      "source": "external_scheduler"
    }
  }'
```

The token must have permission to create repository dispatch events. Do not put
tokens in repository files or public logs.

## Duplicate Protection

All paths enter the same `daily-run-gate` in `schedule.yml`.

The gate blocks duplicate same-market-day analysis when it finds a queued,
in-progress, or successful `US Alpha Seeker Auto-Scheduler` run for the current
New York market date.

`force=true` is reserved for manual recovery only.

## Done-When

- At least one Auto-Scheduler run is queued, in progress, or successful before
  the first RTH sidecar verification window.
- If no Auto-Scheduler run exists, deadline guard dispatches `schedule.yml`.
- If GitHub schedules are delayed or dropped, an external scheduler can still
  trigger `auto_scheduler_external_trigger`.
- A fresh Stage6 artifact is produced before sidecar RTH verification, or a
  failure artifact/run log exists for root-cause analysis.

## RTH Handoff Policy

After fresh Stage6 exists:

1. Check the first fresh sidecar RTH run only.
2. If there is no actionable event, end observation.
3. If no-actionable runs repeat, move to Stage0-6 policy correction.
4. Broker mutation still requires `CONFIRM LIVE EXECUTION`.
5. State mutation still requires `CONFIRM STATE OWNERSHIP RECOVERY`.

## Non-Goals

- This runbook does not place orders.
- This runbook does not change Stage0-6 ranking policy.
- This runbook does not guarantee GitHub Actions will never drop a scheduled
  event. It reduces single-point schedule failure and adds recovery paths.

## 2026-09-20 recovery and same-day coverage correction

- Scheduler, watchdog and deadline guard share `scripts/auto-scheduler-coverage.mjs`.
- A successful Alpha Seeking Pipeline started during 09:30-16:00 America/New_York
  covers that market date even after the 180-minute freshness window. Skipped,
  failed, cancelled, incomplete and future-dated jobs do not establish coverage.
- Premarket analysis retains freshness suppression; an old premarket success
  does not prevent the RTH analysis. This is scheduling deduplication, not a
  broker market-session/holiday eligibility check. Explicit manual force is unchanged.
- Recovery dispatch forwards the existing repository-approved Perplexity cost
  and request caps. Missing caps remain zero; direct manual dispatch does not
  inherit these caps. Sonar/sonar-pro allowlisting and Agent API rejection remain.
- UTC cron slots are unchanged. GitHub may start them late; workflow success
  alone is not proof that analysis ran. Inspect Alpha Seeking Pipeline jobs.
- Offline checks: `npm run ops:test:auto-scheduler-coverage` and
  `npm run ops:test:perplexity-call-budget`. No paid analysis is run by these tests.
