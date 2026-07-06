# TradingCodex Operating Model

## Purpose

TradingCodex is the operating model for coordinating investment research,
analysis artifacts, review gates, and execution-safe handoff across the US Alpha
Seeker system.

This is not a new execution system and not a broker bot. It is a thin governance
layer over the existing three-repository architecture:

| Repository | TradingCodex role | Boundary |
| --- | --- | --- |
| `US_Alpha_Seeker` | Research, Stage0-6 analysis, signal artifact production | No broker mutation |
| `US_Alpha_Seeker_Harvester` | Market-data collection, symbol freshness, OHLCV preparation | No final trade decisions |
| `alpha-exec-engine` | Sidecar dry-run, paper/live safety gates, state ledgers | No alpha recomputation |

## Core Rule

Every decision must be artifact-backed, reviewer-gated, and execution-safe by
default.

Execution remains behind explicit service gates. Broker submit, replace, cancel,
repair, or state mutation requires the owning execution repository and the exact
approval phrase required by that lane.

## Architecture Mapping

| TradingCodex concept | Current implementation |
| --- | --- |
| User prompt | User request, goal, or runbook task |
| Head manager | Lead Codex session applying `AGENTS.md`, goal scope, and safety rules |
| Specialist agents | Stage/repo-specific audit lanes |
| Accepted artifacts | Stage artifacts, audit reports, sidecar state reports |
| Judgment reviewer | Stage3-6 audits, policy-lane audits, runtime proof checks |
| Decision package | Consolidated artifact bundle used for go/wait/block decisions |
| Portfolio and risk review | `alpha-exec-engine` fillability, market guard, live-readiness reports |
| Service-gated execution | Explicit approval gates in `alpha-exec-engine` |
| Self-improvement loop | Audit backlog, root-cause reports, fixture tests, fresh runtime proof |

## Specialist Roster

| Specialist | Owner | Primary evidence | Output |
| --- | --- | --- | --- |
| Head Manager | Cross-repo lead | Goal, repo boundary, latest artifacts | Scope, route, final judgement |
| Fundamental Analyst | Stage3 | Fundamental scores, imputation, financial freshness | Stage3 quality finding |
| Technical Analyst | Stage4 | OHLCV freshness, indicators, liquidity, history length | Stage4 technical finding |
| Structure Analyst | Stage5 | ICT/SMC metrics, execution box, fallback geometry | Stage5 geometry finding |
| Alpha Policy Analyst | Stage6 | Verdict, target/risk/breakout fields, weak-pillar gate | Stage6 policy finding |
| Contract Reviewer | Stage6.5 | Entry/fillability contract, sidecar-readable blockers | Contract finding |
| Harvester Analyst | Harvester | Mapping freshness, failed tickers, source attempts | Data freshness finding |
| Risk Manager | Sidecar | Market guard, fillability, ledger/idempotency, ops-health | Risk readiness finding |
| Execution Operator | Sidecar | Approval phrase, paper/live scope, broker visibility | Approved mutation only |

## Dynamic Workflow

```text
Request
  -> Head Manager scope check
  -> Specialist evidence collection
  -> Judgment review
  -> Decision Package
  -> Risk / portfolio review
  -> Service-gated execution, if separately approved
  -> Outcome and backlog update
```

Weak, stale, or missing upstream evidence returns the workflow to the owning
specialist. It must not be patched downstream by guessing.

## Gate Semantics

| Gate | Pass means | Block means |
| --- | --- | --- |
| Data freshness | Source timestamps and coverage support the analysis | Refresh Harvester/Stage source first |
| Stage contract | Downstream can consume the artifact without guessing | Fix producer/schema/fixture |
| Policy evidence | Stage6 explains executable/wait/no-trade lane | Add formula evidence or keep WAIT |
| Sidecar readiness | Sidecar classifies payload/no-payload without recomputing alpha | Fix Stage6 contract or sidecar taxonomy |
| Execution approval | Exact scoped approval exists in `alpha-exec-engine` | No broker mutation |

## Self-Improvement Loop

Alpha mRNA lifecycle guidance lives in `docs/ALPHA_MRNA_STRATEGY_BLUEPRINT_PROTOCOL.md`. It defines how temporary strategy blueprints should expire, feed back, and avoid becoming hard-coded trade outcomes.

1. Record the decision package and assumptions.
2. Compare outcome, blocker, or failed gate against the expected lane.
3. Assign the issue to one owner: data, formula, policy, contract, risk, or
   execution safety.
4. Add the smallest audit, fixture, or producer change that prevents recurrence.
5. Require a fresh artifact before claiming runtime proof.

## What This Model Does Not Authorize

- It does not authorize live trading.
- It does not authorize paper broker mutation.
- It does not allow `US_Alpha_Seeker` to place orders.
- It does not allow `alpha-exec-engine` to recompute alpha ranking.
- It does not replace `STAGE6_ALPHA_FINAL_*.json` as the canonical signal.

## Operating Default

Use this model for planning and review language. Do not build a new agent
framework until the current artifact gates prove that documentation and existing
scripts are insufficient.
