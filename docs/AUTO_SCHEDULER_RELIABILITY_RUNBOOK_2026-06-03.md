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

Use the bounded client below instead of ad-hoc curl. The token must have
permission to create repository dispatch events for this repository only.
Do not put tokens in repository files, command arguments, or public logs.

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

## Timing evidence (additive, report-only)

`state/auto-scheduler-run-status.json` now includes `timing` with schema
`auto-scheduler-timing.v1`; existing consumers and Stage artifacts are unchanged.
No new scheduler, ledger, dependency, execution flag or paid request is added.

- One read-only GitHub run-metadata lookup records workflow creation/start times.
  Failure leaves these fields unavailable and does not block analysis.
- `github.event.schedule` identifies the cron expression, not the date of the
  originating slot. Do not infer a scheduled timestamp from the nearest slot.
- An external caller may supply UTC `client_payload.scheduledFor` and
  `client_payload.completionDeadline`. These are caller assertions, not verified
  exchange-session evidence. Missing/invalid timestamps do not become a pass.
- Stage entry-to-callback intervals include IO and UI transition overhead. Stage3
  includes the Harvester wait; `STAGE3_PERSISTED`, `HARVESTER_DISPATCHED` and
  `STAGE4_READY_OBSERVED` separate that wait. Callback arrival is not stage success.
- Ready observation is recorded only for the matching handshake. The legacy
  Harvester `timestamp` must not be treated as ready-publication time.
- Stage6/report persistence is recorded after successful Drive writes. Telegram
  delivery is recorded only with a successful receipt. Sidecar dispatch acceptance
  is not sidecar job start or an order; fallback acceptance is labeled separately.
- Only allowlisted event names and UTC timestamps are captured. First observations
  survive final/post-step status writes; another run/attempt cannot inherit them.
  Browser failure captures available markers; a killed/unreachable browser may
  leave missing markers, which must not be synthesized.

Run `npm run ops:test:auto-scheduler-timing` offline. This instruments the latency
contract; it does not repair GitHub event-creation delays or activate an external
scheduler. Watchdog/deadline cron share that same scheduling dependency. External
activation requires a separately confirmed host/service, credential boundary and
session-aware schedule. Existing paid caps, Agent API prohibition and duplicate
guards remain enforced. Do not dispatch analysis just to test timestamps.

## Portable trigger readiness (not activated)

`scripts/dispatch-auto-scheduler.mjs` is a Node 22+ command for Mac/Linux, not a
daemon. It defaults to validation only: no network, credential requirement, or
receipt write. No launchd/cron/systemd timer is installed or enabled by this PR.

```bash
node scripts/dispatch-auto-scheduler.mjs \
  --scheduled-for "$SCHEDULED_FOR_UTC" \
  --dispatch-before "$DISPATCH_BEFORE_UTC" \
  --completion-deadline "$COMPLETION_DEADLINE_UTC"
```

- All three timestamps must be explicit UTC instants (`YYYY-MM-DDTHH:mm:ssZ`,
  optional milliseconds). Require `scheduledFor <= now < dispatchBefore <
  completionDeadline`. A late laptop wake-up expires the slot; no catch-up retry.
  The approved operator schedule supplies the dispatch window; no universal TTL,
  NY holiday calendar, or market-open inference is introduced.
- Actual dispatch requires **separate activation approval**, then `--send`, an
  absolute `--receipt-dir` outside the checkout, and `GITHUB_DISPATCH_TOKEN` in
  the process environment. Use one designated caller and one stable, owner-only
  persistent receipt directory (0700), provisioned before activation; the client
  will not create a missing directory. Token permission must be limited to this repository.
- An exclusive 0600 attempt marker is flushed before the sole POST. Its key is
  the fixed repository/event plus normalized scheduled instant, not the deadline.
  Existing, partial, failed, and uncertain attempts all prevent another attempt
  with that key. Markers are immutable local dispatch receipts, not broker ledgers
  or proof of workflow success. Never delete them to retry or change directories
  to bypass suppression. Keep them through reboot and any future host migration.
- One request, transport timeout capped at the lesser of 15 seconds and remaining
  dispatch-window time, no redirect, no retries or pagination;
  raw response/error bodies and tokens are never printed/stored. A 204 only means
  `DISPATCH_ACCEPTED_NOT_ANALYSIS_PROOF`. A timeout/disconnect may already have
  reached GitHub: stop, preserve the marker, and review metadata before any new
  authorization. Do not turn a nonzero exit code into a service-manager retry.
- The existing receiver, concurrency, RTH-success dedup, premarket freshness,
  same-SHA failure circuit, and approved Perplexity caps are unchanged. No force,
  cap override, model choice or execution flag is supplied. Agent API stays banned.
  Delayed GitHub execution is still possible: `dispatchBefore` bounds submission,
  NOT runner start or Stage6 completion; deadline misses remain report-only.
- Readiness does not prove clock synchronization, exchange eligibility, paid
  analysis success, broker orders, or pre-open delivery. Activation must specify
  verified host clock, timezone/DST/holiday schedule, timing buffer, paid budget,
  stop/rollback (disable external caller, retain GitHub cron), and one bounded proof.
  Do not configure a second active caller on Agent_Javis; that migration is deferred.

Offline check: `npm run ops:test:auto-scheduler-trigger`. Network functions are
injected mocks; CI never uses a dispatch token or sends an analysis event.

## Smoke and Stage2 persistence failure closure (2026-10-16)

The 2026-10-15 first scheduled attempt stopped in Gemini smoke after two
non-exact-text responses and one model 404. Watchdog's recovery passed smoke but
stopped on a Stage2 upload timeout. Later green workflows skipped the analysis
job because two same-SHA failures opened the existing circuit. A green gate-only
workflow is not a successful analysis, Stage6 result or Telegram delivery.

Gemini smoke now checks a nonempty completed text response (one candidate,
`finishReason=STOP`, no prompt block), not exact prose `OK`. This proves only
generation capability; it does not certify reasoning accuracy. Credential errors,
empty/malformed/blocked responses still fail; the existing transient/strict rule
and model configuration are unchanged. No generated text is saved in its report.

Stage2 reserves one Drive-generated file ID before its single multipart create.
Whether the create returns normally or its result is uncertain, the same ID's
name, parent, MIME type, non-trashed status and downloaded content SHA-256 must
match before the Stage2 completion callback runs. No list/latest lookup or second
create is used. Hard create rejection stops immediately; timeout/transport/5xx
or conflict may be reconciled, never promoted without the exact stored bytes.
The stage payload, file naming, score/filter policy and downstream schema do not
change. A successful response without an ID no longer silently advances Stage3.

Bounds per persistence attempt: generate-ID GET <=1, create POST <=1,
metadata GET <=1, media GET <=1; no retries or redirects. Each request including
body consumption has a 30-second deadline. Multipart JSON is bounded to 5 MiB;
larger inputs fail closed rather than introducing a resumable transfer here.
Only the new Stage2 file is written; no existing file or latest pointer is changed.
IDs, tokens, payloads and remote error bodies are not returned/logged by this path.

An unavailable or still-in-flight Drive write can remain unconfirmed: preserve
that failure and stop. This fix cannot guarantee third-party availability or
GitHub cron delivery time. Do not reset the daily circuit or force another paid
analysis to validate this change. Existing successful-RTH dedup and approved
Perplexity Sonar-only limits remain unchanged. Runtime closure needs a separate
approved/natural run; offline fixtures are not runtime proof.

Offline check: `npm run ops:test:scheduler-persistence` (mock transport only).
Provider semantics: [Drive pre-generated upload IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads#use_a_pre-generated_id_to_upload_files)
and [Gemini completed responses](https://ai.google.dev/api/generate-content).
