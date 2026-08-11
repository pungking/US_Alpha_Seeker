# Toss Phase 2 Analysis Integration Readiness

Status: `PHASE2A_HARVESTER_IMPLEMENTED_RUNTIME_REPROOF_REQUIRED`

This document defines the smallest safe analysis-side use of Toss Securities
Open API after the existing Phase 1 capability probe passes in a natural
Harvester run. It is a design and migration contract only. It does not enable a
provider inside this repository, call Toss from the browser, change Stage6
policy, or authorize broker/state mutation.

Current implementation state:

- Phase 1 capability passed from the registered Mac egress.
- Harvester Phase2a producer and fail-open alert contract merged in Harvester
  commit `08ce721`.
- The first bounded Phase2a run used OAuth=1, calendar=1, and prices=2, excluded
  incomplete Toss evidence, continued canonical analysis, and delivered one
  aggregate alert.
- That run exposed a response-receipt timestamp defect; the minimal correction
  merged in Harvester commit `1d07004` without an additional Toss request.
- Stage4-Stage7 propagation remains gated on one separately authorized,
  post-fix `TOSS_SHADOW_PASS` artifact.

## Sources and existing contracts

- Toss API overview: <https://developers.tossinvest.com/docs>
- Toss market-data contract: <https://developers.tossinvest.com/docs/market-data>
- Canonical OpenAPI document:
  <https://openapi.tossinvest.com/openapi-docs/latest/openapi.json>
- Research/Sidecar ownership: `docs/DECISION_PACKAGE_CONTRACT.md`
- Stage7 immutability and OOS eligibility:
  `docs/STAGE7_OUTCOME_LEDGER_CONTRACT.md`
- Current Harvester Phase 1 contract:
  <https://github.com/pungking/US_Alpha_Seeker_Harvester#toss-read-only-capability-probe>

The official contract currently describes REST endpoints only. Market-data,
stock-information, and market-information requests require OAuth but not
`X-Tossinvest-Account`. Account, asset, order, and conditional-order endpoints
are outside this plan.

## Fixed decisions

1. Google Drive OHLCV produced from yfinance remains canonical.
2. Toss is optional `SHADOW_ONLY` evidence and never a silent fallback.
3. Missing, stale, partial, rate-limited, or conflicting Toss evidence has no
   Stage6 rank, threshold, verdict, or execution effect.
4. `TOSS_CLIENT_SECRET` stays server-side in Harvester. The browser analysis
   application must not receive it, including through a `VITE_*` variable.
5. No historical Stage7 decision is backfilled with later Toss evidence.
6. Phase2a Harvester production is implemented, but analysis-side propagation
   cannot start until a post-fix artifact says `TOSS_SHADOW_PASS`.

## Repository ownership

| Repository | Phase 2 responsibility | Explicit non-goal |
| --- | --- | --- |
| `US_Alpha_Seeker_Harvester` | OAuth, read-only collection, safe hashes, request budgets, Drive artifact production | No account header or order endpoint |
| `US_Alpha_Seeker` | Validate and propagate optional evidence through Stage4-7 | No secret, direct Toss fetch, or Stage6 policy change |
| `alpha-exec-engine` | No Phase 2 change | No Toss adapter or broker mutation in this track |

Stage0 precedes the Harvester in the canonical run. Therefore a Harvester stock
snapshot may only inform the next Stage0 universe refresh; it must not create a
cyclic same-run Stage0 dependency.

## Endpoint-to-stage map

| Endpoint | Owner and stage | Intended evidence | Initial request budget after Phase 1 PASS | Phase 2 decision |
| --- | --- | --- | --- | --- |
| `GET /api/v1/prices` | Harvester -> Stage4 -> Stage6/7 | Latest price, currency, source timestamp, cross-vendor price difference | `ceil(candidateSymbols / 200)` per one snapshot; 300 symbols means 2 requests | First implementation candidate |
| `GET /api/v1/stocks` | Harvester -> next-run Stage0 audit | Current market, currency, listing status, issued-share evidence | One bounded candidate batch; exact server batch limit must be proven before code | Contract verification required |
| `GET /api/v1/stocks/{symbol}/warnings` | Harvester hygiene audit | Current trading-warning evidence | Zero initially; per-symbol fan-out requires measured value and a separate budget | Deferred |
| `GET /api/v1/market-calendar/US` | Harvester run manifest -> Stage4 | US session/date evidence | 1 per natural analysis collection | First implementation candidate |
| `GET /api/v1/exchange-rate` | Harvester run manifest -> Stage7 cost reporting | KRW/USD conversion timestamp and rate | 1 only when KRW normalization is requested; otherwise 0 | Optional first implementation |
| `GET /api/v1/orderbook` | Future Stage6.5/Sidecar evidence | Bid/ask spread and displayed depth | Zero in Phase 2a | Deferred: finalists do not exist when Harvester runs |
| `GET /api/v1/trades` | Future Stage6.5/Sidecar evidence | Recent trade recency and observed liquidity | Zero in Phase 2a | Deferred: finalists do not exist when Harvester runs |

`/prices`, `/orderbook`, and `/trades` share the `MARKET_DATA` rate-limit
group. Stock endpoints use `STOCK`; calendar and exchange-rate endpoints use
`MARKET_INFO`. Runtime pacing must use `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset`, and `Retry-After` rather than
assuming documentation limits never change. The published reference limits are
15 TPS for `MARKET_DATA`, 5 TPS for `STOCK`, and 3 TPS for `MARKET_INFO`; these
are ceilings, not the collection budget. A 429 produces shadow status
`RATE_LIMITED`; it does not trigger a tight retry loop or a canonical fallback.

The existing Phase 1 adjusted daily-candle probe remains a capability check.
Phase 2 does not mirror five years of candles from Toss and does not replace
Drive history.

## Why orderbook and trades are deferred

The Harvester runs between Stage3 and Stage4, before Stage6 finalists exist.
Collecting orderbook/trade snapshots for the full Stage3 universe would be
expensive and stale by the Stage6 decision. Fetching directly from the browser
would expose credentials. A post-Stage6 fetch would be a new handoff and could
not be retroactively inserted into the immutable Stage6 decision.

Consequently these endpoints belong to a later report-only Stage6.5 or sidecar
fillability contract. That contract must be designed separately after Phase 2a
proves that Toss timestamps and symbols align with the current pipeline.

## Source precedence and conflict contract

### Historical price calculations

1. Google Drive `ohlcv-lineage-v1` / yfinance adjusted OHLCV.
2. Existing explicitly configured Stage4 fallback, with its current downgrade.
3. Toss is not eligible as a canonical fallback in Phase 2.

### Universe and current-market evidence

1. Existing authoritative listing/mapping and market-regime contracts.
2. Existing Harvester freshness and corporate-action evidence.
3. Toss shadow observation.

Toss can corroborate or challenge the canonical observation; it cannot
overwrite it. Each comparison has exactly one status:

- `MATCHED`
- `DIVERGENT_REVIEW_REQUIRED`
- `NOT_COMPARABLE_TIMESTAMP`
- `ADJUSTMENT_BASIS_MISMATCH`
- `CURRENCY_MISMATCH`
- `SYMBOL_MISMATCH`
- `STALE`
- `PARTIAL`
- `RATE_LIMITED`
- `UNAVAILABLE`

No new price-difference threshold is introduced in this static phase. The
producer records deterministic `differenceBps` and timestamp skew. A later OOS
calibration may justify a threshold; until then any non-zero disagreement is
evidence, not an automatic policy decision.

## Minimum additive evidence

Reuse the existing `shadow` namespace already present in Stage6 archives. The
minimum row-level shape is optional and additive:

```json
{
  "shadow": {
    "toss": {
      "schemaVersion": "toss-market-data-shadow-v1",
      "mode": "SHADOW_ONLY",
      "provider": "TOSS_OPEN_API",
      "endpoint": "/api/v1/prices",
      "requestScopeSha256": "<sha256>",
      "responseSha256": "<sha256>",
      "sourceAsOf": "<ISO8601 with source offset>",
      "retrievedAt": "<UTC ISO8601>",
      "marketTimezone": "America/New_York",
      "currency": "USD",
      "status": "MATCHED",
      "comparison": {
        "canonicalSource": "GOOGLE_DRIVE_YFINANCE",
        "canonicalSourceAsOf": "<ISO8601>",
        "differenceBps": 0,
        "timestampSkewSec": 0,
        "adjustmentBasisComparable": false
      },
      "policyImpact": "NONE_REPORT_ONLY"
    }
  }
}
```

The sample names the intended contract; it does not assert that an unobserved
response carries these values. Implementation must validate the captured
response before materializing a field.

Run-level evidence belongs in the existing Harvester summary or manifest and
contains only counts and safe metadata:

- Phase 1 capability artifact/hash and status
- endpoint and rate-limit group
- requested/matched/missing/invalid symbol counts
- request count by endpoint
- source/retrieval timestamp coverage
- response-hash coverage
- conflict-status counts
- `canonicalSourceChanged=false`
- `accountHeaderUsed=false`
- `orderEndpointUsed=false`

Raw payloads, access tokens, client credentials, account identifiers, and raw
portfolio information are not part of this contract.

## Timestamp and adjustment rules

1. Preserve the source ISO8601 offset and also normalize timestamps to UTC for
   ordering checks.
2. Decision-time evidence requires
   `sourceAsOf <= retrievedAt <= Stage6 decision timestamp`.
3. Evidence retrieved after the decision may be outcome/process evidence but
   cannot modify `decisionSnapshot`.
4. A current quote is not directly comparable with a completed-session close
   unless session state and timestamp basis match.
5. `adjusted=true` means only the official request option was used. It does not
   prove split-only, dividend-adjusted, or total-return semantics beyond the
   captured contract.
6. Currency mismatch blocks comparison; it is not silently converted. The
   exchange-rate observation must carry its own source/retrieval timestamps.

## Downstream impact audit

| Boundary | Current behavior | Required implementation after PASS |
| --- | --- | --- |
| Harvester OHLCV envelope | Carries canonical candles and corporate-action lineage | Add optional `shadow.toss`; never modify canonical candle rows |
| `components/TechnicalAnalysis.tsx::loadOhlcvFromDrive` | Extracts only candles and corporate-action lineage | Validate and return optional Toss shadow evidence |
| Stage4 result row | Explicitly adds corporate-action and regime lineage | Add optional `shadow.toss`; scores and `dataSource` remain unchanged |
| `components/IctAnalysis.tsx` | Uses `...item`, preserving additive Stage4 fields | Add coverage audit only; no score use |
| Stage6 archive | Candidate spread preserves additive fields | Reuse existing `shadow` namespace |
| Stage6 `execution_contract` | `toExecutionContractItem` explicitly selects fields | Explicitly copy a safe Toss summary or Stage7 will lose it |
| `scripts/build-stage7-outcome-ledger.mjs` | Seeds from `execution_contract`, not `alpha_candidates` | Snapshot optional Toss evidence and hash it only for new decisions |
| Stage7 comparison | Requires canonical corporate-action/regime lineage | Toss absence must not change base OOS eligibility; use a separate Toss evidence slice |

This audit proves that Stage4 pass-through alone is insufficient. Stage6's
explicit execution-contract mapper and Stage7's execution-contract loader are
the two mandatory downstream updates.

## Migration decision

- No production schema or migration is changed in this static task.
- The future implementation is additive and optional.
- Existing Stage7 rows and `decisionSnapshotSha256` remain immutable.
- New decisions may include Toss evidence in their snapshot; old decisions are
  not rehashed or backfilled.
- `lineageVerifiedForComparison` remains governed by existing OHLCV,
  corporate-action, and regime contracts. Toss evidence creates a separate
  analysis slice and cannot make that boolean true.
- A schema-version bump is required only if an implementation changes an
  existing field's meaning or makes Toss evidence required. Neither is planned.

## Required synthetic fixtures after Phase 1 PASS

### Harvester

- capability PASS prerequisite and disabled/non-PASS refusal
- `/prices` batches of 200 plus a deterministic remainder
- exact-symbol match, missing symbol, and duplicate symbol
- stale/future timestamp and timezone-offset preservation
- currency mismatch, partial response, 429, and transient failure
- request/response SHA-256 determinism
- no account header or account/order endpoint
- canonical Drive OHLCV unchanged

### Stage4-6

- matched, divergent, stale, unavailable, and adjustment-mismatch evidence
- Stage4 loader validation and Stage5 pass-through
- Stage6 archive and `execution_contract` propagation
- identical rank, score, verdict, and executable counts with Toss present or absent
- ticker rename invariance and deterministic ordering

### Stage7

- immutable decision snapshot for new Toss-enabled decisions
- future timestamp excluded from Toss analysis
- missing Toss evidence does not exclude the base OOS cohort
- no historical backfill or decision hash rewrite
- separate Toss evidence coverage/effect counts

## Implementation sequence after capability PASS

1. Harvester PR: complete in `08ce721`; one market-calendar request and batched
   `/prices` shadow artifact remain disabled on GitHub-hosted runners.
2. Registered-Mac one-shot: fail-open behavior and alerting passed, while quote
   eligibility exposed a receipt-timestamp defect. `1d07004` fixes that defect;
   one separately authorized post-fix proof remains required.
3. Analysis PR: Stage4 loader plus Stage5/Stage6 propagation, with no scoring or
   policy use.
4. Natural Auto-Scheduler one-shot: verify Stage4 -> Stage6 evidence loss is
   zero and all decision outputs are unchanged except additive evidence.
5. Stage7 PR: optional immutable shadow slice and coverage reporting.
6. Accumulate prospective OOS before considering any threshold or gate.

`stocks`, warnings, exchange-rate, orderbook, and trades are added only when a
named analysis question and fixture justify them. Phase 2a does not scaffold
unused clients for later.

## Static done-when

- Endpoint ownership and request budgets are explicit.
- Google Drive/yfinance remains canonical.
- Toss is `SHADOW_ONLY` with no policy impact.
- Source precedence, timestamp, adjustment, hash, and conflict semantics are
  explicit.
- Stage4, Stage6 execution-contract, and Stage7 propagation points are known.
- Required fixtures and additive migration behavior are defined.
- No API request, secret change, runtime activation, Stage6 policy change, or
  broker/state mutation occurred.
