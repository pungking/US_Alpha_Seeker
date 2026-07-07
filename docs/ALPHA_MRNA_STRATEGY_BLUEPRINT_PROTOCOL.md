# Alpha mRNA Strategy Blueprint Protocol

Architecture companion: `docs/MRNA_ADAPTIVE_STRATEGY_ARCHITECTURE.md`. This protocol focuses on lifecycle, decay, and mutation control.

## Purpose

Alpha mRNA is a lifecycle model for dynamic strategy blueprints in US Alpha
Seeker. It borrows the useful shape of mRNA without adding a new execution
system.

The goal is to avoid hard-coded trade outcomes and instead generate a temporary,
market-context-aware strategy blueprint from stable research contracts.

This is report-only design guidance until a separate implementation plan is
approved.

## Biology-to-System Mapping

| Biology concept | US Alpha Seeker mapping | Rule |
| --- | --- | --- |
| DNA | Long-lived contracts, `AGENTS.md`, Stage schemas, TradingCodex docs | Changes slowly and needs tests |
| mRNA | Run-specific strategy blueprint or Decision Package | Temporary and expires |
| Ribosome | Stage6 producer, audit scripts, sidecar classifier | Translates artifacts, does not rewrite DNA |
| Protein | Candidate action, WAIT, NO_TRADE, or payload proposal | Must be traceable to the message |
| Immune system | Risk guard, freshness gate, idempotency, approval gate | Blocks unsafe or stale output |
| Decay | Stale hash, expired signal, no-event termination | Old messages must not keep acting alive |
| Mutation | Strategy/policy tuning | Requires fixture, audit, and fresh runtime proof |

## Strategy Genome

The strategy genome is the stable catalogue of allowed strategy families. It is
not a ticker list and not an order instruction.

Initial families:

| Strategy | Required evidence | Typical block |
| --- | --- | --- |
| `pullback_continuation` | Fresh trend, entry distance in band, RR valid | Entry not reached or weak pillar |
| `breakout_retest` | `breakoutRetestProofConfirmed=true`, volume/structure support | Review-ready without proof |
| `current_entry_recalculated_stop` | Current RR valid, recalculated stop geometry valid | Invalid stop/target geometry |
| `target_recalibration` | Required target can clear buffer and expected return | Target already reached/no-trade |
| `high_price_min_one_share_review` | Fillability passes and notional cap review | Manual approval required |
| `wait_event_or_data` | Earnings/FDA/data/event uncertainty | Data freshness or event blackout |

## Strategy Blueprint

A blueprint is a run-specific mRNA message. It should be derived from market
context and Stage evidence, then expire.

Minimum future shape:

```json
{
  "blueprintId": "<run-id-or-stage6-hash>",
  "sourceStage6Hash": "<hash>",
  "marketRegime": "normal_risk_on",
  "preferredLanes": ["pullback_continuation", "breakout_retest"],
  "disabledLanes": ["target_chase", "stale_geometry_repair"],
  "entryPolicy": {
    "allowCurrentEntry": false,
    "allowRecalculatedStop": true,
    "allowMinOneShare": "manual_review_only"
  },
  "expiresAt": "<iso8601>"
}
```

## Decision Rules

1. A blueprint may recommend lanes, not force execution.
2. Stage6 remains the canonical alpha signal producer.
3. Sidecar may classify and simulate, but must not recompute alpha.
4. A stale blueprint is invalid even if the ticker still looks attractive.
5. Repeated no-event outcomes should route to producer tuning, not infinite
   monitoring.
6. Strategy mutation requires fixture coverage, audit proof, and a fresh runtime
   artifact before being trusted.

## Future Report-Only Artifacts

If implemented later, start with these files only:

| Artifact | Owner | Purpose |
| --- | --- | --- |
| `state/strategy-context-snapshot.json` | `US_Alpha_Seeker` | Market/stage context for blueprint generation |
| `state/strategy-blueprint.json` | `US_Alpha_Seeker` | Run-specific strategy mRNA message |
| `state/strategy-blueprint-audit.json` | `US_Alpha_Seeker` | Explains why lanes were preferred/disabled |
| `state/strategy-blueprint-sidecar-read.json` | `alpha-exec-engine` | Read-only observation of blueprint/hash alignment |

Do not create broker-facing behavior from these artifacts without a separate
execution approval lane.

## Integration With TradingCodex

TradingCodex defines who reviews and which package is required. Alpha mRNA
defines how a strategy message lives, expires, and feeds back into the next
version of the strategy genome.

| TradingCodex layer | Alpha mRNA layer |
| --- | --- |
| Operating model | DNA governance |
| Decision Package | mRNA message envelope |
| Judgment Review | Translation quality control |
| Service-gated execution | Immune gate |
| Self-improvement loop | Mutation control |

## Non-Goals

- Do not replace Stage6.
- Do not add a new agent framework.
- Do not auto-relax filters to create orders.
- Do not allow sidecar broker mutation.
- Do not treat dynamic blueprint generation as execution approval.

## Adoption Trigger

Start implementation only after the currently blocked Stage3-6 runtime proof and
RTH sidecar no-mutation goal is complete.

The first implementation should be report-only and prove that the blueprint
improves blocker classification or strategy selection without changing broker
behavior.
