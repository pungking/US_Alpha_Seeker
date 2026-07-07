# Stage3-6 Specialist Agent Roster

Operating model: `docs/TRADING_CODEX_OPERATING_MODEL.md`.

## Purpose

This roster defines the specialist viewpoints used by TradingCodex for Stage3-6
and future Stage7-8 work. It is an operating model for Codex-assisted review,
not a new autonomous agent runtime.

The lead Codex session remains responsible for final synthesis, repository
boundaries, and safety gates.

## Core Rule

Specialists provide bounded judgments. They do not approve execution and do not
mutate broker or sidecar state. Their findings also label mRNA transcript lanes
for temporary strategy classification and later producer tuning.

## Roster

| Specialist | Stage/repo scope | Primary question | Evidence | Output |
| --- | --- | --- | --- | --- |
| Head Manager | Cross-repo | What is the owner, boundary, and safest next action? | Goal, AGENTS.md, latest artifacts | Scope decision and final synthesis |
| Fundamental Analyst | Stage3 | Are fundamentals bounded, fresh, comparable, and economically meaningful? | Stage3 artifact, score bounds, imputation, financial source lineage | Fundamental quality finding |
| Technical Analyst | Stage4 | Is technical evidence computed from fresh enough OHLCV with visible assumptions? | OHLCV, indicators, liquidity, history length, fallback flags | Technical quality finding |
| Structure Analyst | Stage5 | Is structure evidence strong enough for Stage6 to trust? | ICT/SMC metrics, execution box, PD zone, support/resistance evidence | Structure/geometry finding |
| Alpha Policy Analyst | Stage6 | Did Stage6 classify executable/wait/no-trade correctly? | Stage6 row, verdict gates, target/risk/breakout/structure fields | Stage6 policy finding |
| Formula Evidence Analyst | Stage6 | Does every blocked lane have actionable formula evidence? | fresh-focus audit, runtime formula proof, tuning backlog | Formula backlog finding |
| Contract Reviewer | Stage6.5 | Can sidecar classify without recomputing alpha? | entry/fillability contract, reason taxonomy, decision audit | Contract gap finding |
| Data Lineage Analyst | Harvester/Stage4 | Are source, freshness, symbol mapping, and missing-data reasons auditable? | Harvester audits, Stage4 readiness, earnings lineage | Data lineage finding |
| Portfolio Risk Reviewer | alpha-exec-engine | Is the portfolio/order state safe to observe or simulate? | market guard, live-readiness, ledger/idempotency, ops-health | Risk readiness finding |
| Execution Gatekeeper | alpha-exec-engine | Is there exact scoped approval for mutation? | approval phrase, selected dynamic row, rollback, idempotency | Approval package review only |
| Stage7 Simulation Analyst | Future | Does the strategy family survive walk-forward and costs? | backtest, paper replay, slippage/spread assumptions | Simulation validation finding |
| Stage8 Live Readiness Analyst | Future | Is the system ready for paper pilot or micro-live review? | live-readiness scorecard, ops-health root classes | Readiness verdict |

## Stage Ownership Details

### Stage3 - Fundamental Analyst

Checks:

- score bounds and clamps,
- `compositeAlpha` formula consistency,
- imputation impact,
- ROIC/debt/fiscal period source lineage,
- sector/momentum bonuses after normalization,
- weak-pillar risk.

Blocks:

- `score_bounds`,
- `fundamental_data_missing`,
- `weak_pillar_execution_gate`,
- `financial_source_stale`.

### Stage4 - Technical Analyst

Checks:

- OHLCV freshness,
- missing sessions,
- short-history policy,
- liquidity and spread assumptions,
- indicator lookbacks,
- fallback source flags.

Blocks:

- `ohlcv_stale`,
- `short_history`,
- `technical_fallback`,
- `liquidity_insufficient`.

### Stage5 - Structure Analyst

Checks:

- ICT/SMC component evidence,
- support and resistance proof,
- execution box geometry,
- fallback 52-week geometry usage,
- structure confidence versus current RR.

Blocks:

- `structure_unconfirmed`,
- `structure_current_rr_weak`,
- `fallback_geometry_only`,
- `support_gap_excessive`.

### Stage6 - Alpha Policy Analyst

Checks:

- actionable verdict gate,
- weak-pillar gate,
- target recalibration,
- risk geometry recalculation,
- breakout proofConfirmed generation,
- zero-executable tuning lane consistency.

Blocks:

- `quality_gate`,
- `target_recalibration`,
- `risk_geometry`,
- `breakout`,
- `structure`,
- `data_freshness`.

### Stage6.5 - Contract Reviewer

Checks:

- sidecar-readable reason taxonomy,
- finite entry/stop/target fields,
- current distance and current RR,
- high-price min-one-share review status,
- no alpha recomputation in sidecar.

Blocks:

- `execution_contract_gap`,
- `reason_taxonomy_unknown`,
- `sidecar_requires_guessing`.

## Decision Evidence Ownership Matrix

| Field | Primary specialist | Secondary reviewer | Required handoff if blocked |
| --- | --- | --- | --- |
| `zeroExecutableTuningLane` | Formula Evidence Analyst | Head Manager | Assign to target, risk geometry, breakout, structure, or quality tuning backlog. |
| `qualityGateLane` | Alpha Policy Analyst | Fundamental/Data Lineage Analyst when data related | Keep out of structure/risk tuning until quality reason is resolved. |
| `structurePolicyBlockerLane` | Structure Analyst | Alpha Policy Analyst | Improve structure proof or keep WAIT; do not relax gate blindly. |
| `riskGeometryRepairLane` | Alpha Policy Analyst | Contract Reviewer | Recalculate stop/target or keep NO_TRADE; do not move to sidecar reprice. |
| `targetRecalibrationViabilityVerdict` | Alpha Policy Analyst | Formula Evidence Analyst | Refresh target thesis/source or keep no-trade. |
| `breakoutRetestProofConfirmed` | Structure Analyst | Alpha Policy Analyst | Promotion remains blocked until proof is true and promotion policy allows it. |

Specialist outputs become Decision Package evidence. They do not become execution approval.

## Handoff Rules

1. If data is stale, return to Data Lineage Analyst before policy tuning.
2. If formulas are missing evidence, return to Formula Evidence Analyst before
   sidecar work.
3. If Stage6 emits an explicit WAIT/NO_TRADE lane, sidecar must not chase it.
4. If sidecar cannot classify a row, fix the Stage6 contract before broker work.
5. If mutation is requested, Execution Gatekeeper requires a separate Approval
   Package in `alpha-exec-engine`.

## Decision Review Flow

```text
Request or failed run
  -> Head Manager scope check
  -> One or more specialist findings
  -> Decision Package
  -> Contract review
  -> Risk review if sidecar artifact exists
  -> Service-gated execution only after separate approval
```

## Future Stage7-8 Integration

Stage7 and Stage8 must be added as validation layers, not broker automation
shortcuts.

| Future stage | Role | Must prove |
| --- | --- | --- |
| Stage7 | Walk-forward, replay, and strategy-family validation | no look-ahead bias, cost-aware expectancy, regime stability |
| Stage8 | Live-readiness and operations scorecard | state separation, idempotency, ops-health root classes, safety gate compliance |

Stage7/8 may recommend `BLOCKED`, `PAPER_PILOT`, or `MICRO_LIVE_REVIEW_READY`.
They must not enable live execution.

## Operating Defaults

- Use one lead integrator for final decisions.
- Use specialist labels in reports when they improve clarity.
- Avoid spawning new runtime agents until artifact evidence proves a real need.
- Keep all specialist outputs report-only unless an explicit execution approval
  lane exists in the execution repository.
