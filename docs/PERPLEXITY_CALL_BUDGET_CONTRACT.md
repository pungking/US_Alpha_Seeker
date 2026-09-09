# Perplexity paid-call containment

## Scope and migration

All five analysis-side Sonar consumers use `services/perplexityRequest.mjs`.
The proxy preserves caller `max_tokens` and zero temperature. Only Sonar and
Sonar Pro text chat requests are accepted; Agent API, tools, streaming and
unmodeled request options are rejected. No dependency or stage scoring change.

`PERPLEXITY_RUN_MAX_COST_USD` and `PERPLEXITY_RUN_MAX_REQUESTS` both default to
zero. This intentionally blocks paid Perplexity requests until the operator
approves a budget. The scheduler validates configuration before analysis.
Manual workflow inputs supply the limits for that invocation; scheduled runs
use repository variables, which require a separate recurring budget decision.
This change does not configure variables, rotate keys, refill credit or dispatch
a workflow. Existing same-SHA failure and duplicate-run guards remain intact.

The existing `US_ALPHA_SEEKER_AI_USAGE.perplexity` record gains a `budget` object.
Legacy token/request counters retain their meaning. New fields are integer
micro-USD amounts, attempted transport count, fixed limits, rate basis and a
latched stop reason. No prompt, key, raw error or response is stored there.
Reloading the same browser session or changing its configuration cannot reset
the reservation. A new browser context is a new budget, not an account cap.

## Reservation basis

Rates checked against official documentation on 2026-09-09:

| Model | Input USD / 1M tokens | Output USD / 1M tokens | Request USD / 1K (low / medium / high) | Context reserved |
| --- | ---: | ---: | --- | ---: |
| sonar | 1 | 1 | 5 / 8 / 12 | 128 * 1024 |
| sonar-pro | 3 | 15 | 6 / 10 / 14 | 200 * 1024 |

Sources: [pricing](https://docs.perplexity.ai/docs/getting-started/pricing),
[Sonar](https://docs.perplexity.ai/docs/sonar/models/sonar),
[Sonar Pro](https://docs.perplexity.ai/docs/sonar/models/sonar-pro).

Before every outbound attempt, reserve the entire documented input context,
the explicit output-token cap, the request fee and 10 micro-USD for rounding.
This avoids estimating token counts or assuming retrieved search tokens are
free. Reservations are deliberately conservative; actual returned cost is
recorded separately and never refunds a reservation. A missing local proxy
route also consumes a reservation, despite not necessarily being billable.

This is a cooperative **single browser session Perplexity reservation limit**
under the named rate basis, not a provider-enforced account spending limit.
Other tabs, processes, stolen keys, Gemini and other providers are outside it.
Rate changes require review before budget approval. Upstream token/cost
evidence missing or exceeding its reservation stops subsequent requests; it
cannot retroactively prevent an unexpected upstream charge.

## Failure and delivery behavior

- Persist the reservation synchronously before network access. Corrupt or
  unavailable session storage blocks requests and finalization.
- No automatic network retry. A 404 from the local route permits one direct
  fallback only without the upstream-attempt marker. An upstream 404 does not.
- HTTP failures, uncertain transport/timeouts and invalid usage evidence latch
  a stop shared by all callers and all model fallback paths in the session.
- Abort timed-out transport; never refund an uncertain request.
- Unconfigured/exhausted/changed budgets remain fail-closed if a caller catches
  the error. Stage6 final publication and Telegram brief generation check the
  stored stop. A budget failure is not a legitimate zero-executable result.
- Successful prior canonical artifacts are not rewritten. A later narrative
  failure does not certify Report/Telegram/Notion delivery or undo an already
  published, otherwise valid Stage6 artifact.

No key-acceptance test proves old-key revocation or identifies who spent the
earlier credit. Those require provider-side key and usage records. No actual
paid calls or delivery writes are required by the mock validation below.

## Verification and rollback

`npm run ops:test:perplexity-call-budget` runs the real proxy and consumers
with fake transport: cap propagation, zero-temperature preservation, all five
call sites, missing configuration, storage corruption, concurrency, budget
exhaustion, errors/timeouts, direct-route fallback, redaction and finalization
suppression. Existing Stage1, Telegram, Notion, safety and OOS fixtures remain
required. No historical stage artifact is migrated.

Rollback: revert this merge commit. This restores the prior unbounded caller
behavior, so rollback must not be treated as permission for another paid run.

## Original delivery closure remains separate

A passing mock suite is not a delivered report. Resume the preserved
`STAGE6_REPORT_TELEGRAM_NOTION_DELIVERY_CLOSURE_V1` against one eligible
post-fix completed analysis: canonical Stage6 full hash, report parity, actual
Telegram receipt and actual Notion analysis-only row/source hash parity.
No qualifying completed analysis means pending, not PASS. No forced analysis,
send, Notion write, broker call or execution activation is authorized here.
