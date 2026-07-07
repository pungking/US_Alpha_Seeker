# mRNA Adaptive Strategy Architecture

## Purpose

This document defines how US Alpha Seeker can borrow the useful control pattern
of biological mRNA without turning the system into an uncontrolled trading bot.

The goal is to generate temporary, market-context-aware strategy transcripts
from stable research contracts, then let Stage3-6 audits and sidecar safety gates
judge whether the transcript is valid, stale, blocked, or ready for a separately
approved execution review.

This is an analysis-side architecture document. It does not authorize broker
submit, replace, cancel, repair, or sidecar mutation.

## Core Principle

Stable contracts behave like DNA. Run-specific strategy intent behaves like
mRNA. Candidate outcomes behave like proteins. Risk and approval gates behave
like the immune system.

A strategy transcript may guide analysis and classification. It must not bypass
Stage6, sidecar safety checks, market session checks, idempotency, or explicit
execution approval.

## Biology-to-System Mapping

| Biology concept | System equivalent | Hard rule |
| --- | --- | --- |
| DNA | AGENTS.md, schemas, stage contracts, safety defaults | Changes slowly and requires tests |
| Gene | A stable strategy family such as pullback, breakout retest, target recalibration | Must have named evidence |
| mRNA transcript | Run-specific strategy blueprint derived from market and stage context | Temporary, hash-bound, expires |
| Ribosome | Stage3-6 producer/audit scripts translating evidence into decisions | May classify, must not execute |
| Protein | WAIT, NO_TRADE, ACTIONABLE_RESEARCH, or payload proposal | Must trace back to transcript and Stage6 row |
| Immune system | Freshness, schema, risk, idempotency, approval, market clock gates | Blocks unsafe or stale output |
| Decay | Stale hash, expired order, no-event termination | Old transcripts cannot remain actionable |
| Mutation | Formula or policy tuning | Requires fixture, audit, and fresh runtime proof |

## Strategy Genome

The strategy genome is the stable catalogue of allowed strategy families. It is
not a ticker list and not an order instruction.

| Strategy family | Required evidence | Typical blocked lane | Owner |
| --- | --- | --- | --- |
| `pullback_continuation` | Fresh trend, valid entry distance, RR above minimum | `entry_distance`, `risk_geometry` | Stage4/Stage6 |
| `breakout_retest` | `breakoutRetestProofConfirmed=true`, fresh retest, acceptable extension | `breakout_review_only` | Stage5/Stage6 |
| `structure_confirmation` | Support/box proof, ATR-normalized gap, current RR | `structure_unconfirmed` | Stage5/Stage6 |
| `current_entry_recalculated_stop` | Recalculated stop valid, target buffer valid, RR valid | `risk_geometry_invalid` | Stage6 |
| `target_recalibration` | Required target clears current price, buffer, expected return, and RR | `target_reached`, `target_recalibration` | Stage6 |
| `high_price_min_one_share_review` | One-share notional policy review, fillability, risk cap | `manual_policy_review_required` | Stage6.5/Sidecar |
| `wait_event_or_data` | Earnings/event/data uncertainty clearly marked | `data_freshness`, `event_risk` | Stage3/Stage4/Stage6 |

## Strategy Transcript Shape

A future report-only transcript should be hash-bound and expiring. It should be
created only after Stage6 evidence exists, not before.

```json
{
  "schemaVersion": "strategy_transcript.v1",
  "transcriptId": "<run-id-or-stage6-hash>",
  "sourceStage6File": "STAGE6_ALPHA_FINAL_*.json",
  "sourceStage6Hash": "<sha256>",
  "generatedAt": "<iso8601>",
  "expiresAt": "<iso8601>",
  "marketRegime": {
    "riskMode": "DEFAULT",
    "vixLevel": "L0",
    "sourceQuality": "HIGH"
  },
  "preferredStrategyFamilies": [
    "pullback_continuation",
    "target_recalibration"
  ],
  "disabledStrategyFamilies": [
    "target_chase",
    "stale_geometry_repair"
  ],
  "lanePolicies": {
    "breakout_retest": "proof_confirmed_required",
    "target_recalibration": "report_only_until_viable",
    "high_price_min_one_share_review": "manual_policy_review_only"
  },
  "mutationAllowed": false,
  "brokerMutationAuthorized": false
}
```

## Translation Pipeline

```text
Market and data context
  -> Stage3 fundamental evidence
  -> Stage4 technical/liquidity evidence
  -> Stage5 structure evidence
  -> Stage6 final candidate row
  -> Strategy transcript classification
  -> Decision Package
  -> Sidecar read-only/dry-run classification
  -> Service-gated execution only after separate approval
```

The transcript is not an alternative Stage6. It is a thin layer that explains
which strategy family each Stage6 row belongs to and what evidence is missing.

## Decay and Invalidation Rules

A transcript is invalid if any of these are true:

- Source Stage6 hash no longer matches the consumed sidecar hash.
- Source run/head commit is unknown.
- Market session context changed from the transcript assumptions.
- Stage6 row has stale source or stale geometry.
- Order lifecycle reached terminal unfilled state for the same hash.
- Sidecar marks preview stale.
- Any required proof field is missing or contradictory.

Invalid transcripts must route to WAIT, NO_TRADE, or audit backlog. They must not
be patched downstream by sidecar chase or broker mutation.

## Immune System Gates

| Gate | Blocks |
| --- | --- |
| Schema gate | Unknown or malformed Stage artifacts |
| Freshness gate | stale OHLCV, stale earnings, stale Stage6 hash |
| Verdict gate | non-actionable verdict without explicit waiver |
| Weak-pillar gate | weak fundamental/technical/structure pillar without waiver |
| Geometry gate | invalid entry/stop/target, insufficient RR, target already reached |
| Breakout gate | review-ready without proof-confirmed evidence |
| Sidecar contract gate | sidecar cannot classify blocker without recomputing alpha |
| Approval gate | any broker or state mutation without exact scoped confirmation |

## Feedback and Mutation Control

Every repeated blocker should become one of these backlog classes:

| Repeated symptom | Mutation target |
| --- | --- |
| zero executable from `structure` | structure proof generation, not broad filter relaxation |
| zero executable from `target_recalibration` | target recalibration formula, not sidecar chase |
| zero executable from `risk_geometry` | stop/target recalculation proof |
| zero executable from `breakout` | proofConfirmed generation criteria |
| repeated data freshness block | Harvester or vendor lineage |
| sidecar cannot classify | Stage6-to-sidecar contract |

Mutation requires:

1. report-only audit evidence,
2. fixture or contract test,
3. code change in the owning stage,
4. fresh Auto-Scheduler runtime proof,
5. RTH sidecar read-only or dry-run proof when relevant.

## Integration With Existing Documents

| Document | Relationship |
| --- | --- |
| `docs/TRADING_CODEX_OPERATING_MODEL.md` | Defines the operating harness and role flow |
| `docs/DECISION_PACKAGE_CONTRACT.md` | Defines evidence bundle contract for decisions |
| `docs/STAGE3_6_SPECIALIST_AGENT_ROSTER.md` | Defines stage specialists and handoffs |
| `docs/ALPHA_MRNA_STRATEGY_BLUEPRINT_PROTOCOL.md` | Earlier lifecycle protocol; this document is the architecture-level contract |
| `docs/STAGE_PIPELINE_TEAM_OPERATING_MODEL.md` | Existing team model for Stage3-8 work |

## Non-Goals

- Do not create a second final signal artifact.
- Do not bypass `STAGE6_ALPHA_FINAL_*.json`.
- Do not add broker-facing behavior.
- Do not auto-relax filters to create orders.
- Do not let a strategy transcript authorize execution.
- Do not let `alpha-exec-engine` recompute Stage6 alpha logic.

## Adoption Path

1. Keep this document report-only.
2. Use the vocabulary in Stage3-6 audits and decision packages.
3. Add transcript artifacts only after current Stage6 runtime proof and RTH
   sidecar no-mutation verification are complete.
4. If implemented, start with read-only artifacts under `state/` and prove they
   improve blocker classification before any execution-adjacent work.
