# Stage Pipeline Team Operating Model

## Purpose

This operating model turns the Stage3 -> Stage6+ quality work into a stage-owned
review system. The goal is to improve alpha quality without blurring repository
boundaries or accidentally widening execution behavior.

This is not a broker execution plan. It is an analysis-side governance model for
how Codex/subagents should audit, diagnose, and propose changes across the
pipeline.

## Core Decision

Use the stage-team model for quality work, but keep one lead integrator.

The previous single-thread approach is still useful for small tactical fixes, but
it becomes noisy when zero-executable, data freshness, target recalibration,
structure proof, and sidecar fillability are discussed in the same lane. The
stage-team model is safer because each stage owns one evidence surface and the
lead integrates only verified findings.

## Non-Negotiable Boundaries

| Boundary | Rule |
| --- | --- |
| Analysis/execution split | `US_Alpha_Seeker` may produce signals and audits only; broker mutation remains outside this repo. |
| Stage6 ownership | `STAGE6_ALPHA_FINAL_*.json` remains the canonical final signal artifact. |
| Subagent authority | Stage agents may produce findings and proposed diffs; the lead decides cross-stage changes. |
| No hidden execution | Stage7/8 may score readiness or simulate, but must not submit, replace, cancel, or mutate broker orders. |
| Evidence first | No policy tuning is accepted without artifact evidence, fixture coverage, and downstream impact notes. |

## Team Roles

| Role | Scope | Primary Questions | Required Output |
| --- | --- | --- | --- |
| Lead Integrator | Cross-stage decision, repo boundary, final policy choice | Is this a data issue, formula issue, policy issue, or execution-contract issue? | Master diagnosis, task split, final merge decision |
| Stage3 Agent | Fundamentals, quality, score normalization, lineage | Are fundamentals bounded, fresh, comparable, and economically meaningful? | Stage3 methodology/quality audit |
| Stage4 Agent | OHLCV, indicators, technical data quality | Are indicators computed from sufficient fresh OHLCV with visible fallback state? | Stage4 technical/data audit |
| Stage5 Agent | ICT/SMC, structure, PD zone, geometry evidence | Is market-structure evidence strong enough for Stage6 to trust? | Stage5 structure/geometry audit |
| Stage6 Agent | Final candidate policy, executable gates, target/risk geometry | Did Stage6 classify executable vs wait/no-trade correctly? | Stage6 policy/gate audit |
| Stage6.5 Contract Agent | Stage6 -> sidecar contract | Can sidecar consume this artifact without recomputing alpha or guessing intent? | Fillability/entry contract audit |
| Stage7 Future Agent | Backtest, walk-forward, paper replay | Does the signal policy have positive expectancy and acceptable drawdown? | Simulation validation report |
| Stage8 Future Agent | Live readiness and operations | Is the system safe enough for paper pilot or micro-live review? | Live-readiness scorecard |

## Stage Ownership Contracts

### Stage3 - Fundamental Quality

Owned evidence:

- `fundamentalScore`, `qualityScore`, `profitScore`, `safeScore`, `valueScore`
- `compositeAlpha`
- `integrityReasons`
- `isImputed`
- data source/fiscal period/freshness metadata where available

Done-when:

- Scores are bounded to the documented scale.
- `compositeAlpha` reconciles to `clamp(qualityScore * 0.3 + fundamentalScore * 0.7)`.
- Imputed or weak data cannot silently produce high-confidence candidates.
- Full Stage3 artifact can be audited without relying on Stage6 finalist fallback.

### Stage4 - Technical and OHLCV Quality

Owned evidence:

- OHLCV source and freshness
- price history length and missing sessions
- `technicalScore`
- `scoreBreakdown`
- `techMetrics`
- fallback/heuristic flags

Done-when:

- Stale, short, or heuristic-only rows are visibly capped or downgraded.
- `technicalScore` reconciles to `scoreBreakdown.finalScore` after all overlays.
- Indicator formulas expose lookback assumptions and minimum observation counts.
- Full Stage4 artifact can be audited for all candidates, not only finalists.

### Stage5 - ICT / SMC Structure

Owned evidence:

- `ictScore`
- `ictMetrics`
- PD zone
- order block / liquidity sweep / displacement / market structure metrics
- execution geometry source and fallback counters

Done-when:

- High ICT scores require component evidence.
- `compositeBreakdown` base parts reconcile to the documented 20/30/50
  fundamental/technical/ICT weights before bonuses, penalties, calibration, and
  diversification.
- Geometry fallback is visible and cannot masquerade as confirmed structure.
- Stage5 carries enough structure evidence for Stage6 to explain WAIT vs executable.

### Stage6 - Final Alpha Policy

Owned evidence:

- `finalDecision`
- alpha verdict normalization
- weak-pillar gate
- structure and breakout proof fields
- target recalibration fields
- risk geometry fields
- `zeroExecutableTuningLane`
- `zeroExecutableFormulaBottleneck`
- `zeroExecutableFormulaSeverity`
- `qualityGateLane`

Done-when:

- Only actionable verdicts can become executable unless an explicit waiver exists.
- Weak pillar candidates route to WAIT/quality gate unless waiver exists.
- Breakout review-ready never promotes without proof-confirmed evidence.
- Target already reached routes to recalibration or no-trade, not sidecar chase.
- Zero-executable rows expose the dominant formula bottleneck so tuning is
  aimed at target, risk geometry, breakout proof, or structure proof instead of
  broad filter relaxation.

### Stage6.5 - Execution Contract, Not Execution

Owned evidence:

- entry/stop/target finite geometry
- current-price distance
- current RR
- fillability contract
- sidecar-readable reason taxonomy

Done-when:

- Sidecar can classify blockers without recomputing alpha.
- High-price/min-one-share and reprice candidates remain report-only unless separately approved in `alpha-exec-engine`.
- The analysis repo does not contain broker mutation logic.

### Stage7 - Future Simulation Validation

Owned evidence:

- walk-forward windows
- transaction-cost assumptions
- spread/slippage assumptions
- regime splits
- hit rate, expectancy, drawdown, exposure

Done-when:

- Simulation is deterministic and excludes look-ahead bias.
- Results are segmented by regime, market cap, liquidity, and signal lane.
- No live/paper broker mutation exists in Stage7.

### Stage8 - Future Live Readiness

Owned evidence:

- paper-submit readiness score
- lifecycle reconciliation
- ledger/idempotency health
- protective order/guard metadata health
- scheduler/fresh hash status
- broker mutation safety status

Done-when:

- Final verdict is one of `BLOCKED`, `PAPER_PILOT`, or `MICRO_LIVE_REVIEW_READY`.
- Ops-health failures are separated by root class: Stage policy, guard metadata, ledger, scheduler, or execution safety.
- Live readiness does not imply live authorization.

## Workflow

1. Lead defines the active question and allowed repository scope.
2. Relevant stage agent produces report-only evidence.
3. Lead maps evidence to blocker taxonomy.
4. If a code change is needed, make the smallest safe diff in the owning stage.
5. Add or update fixture/schema/audit coverage.
6. Regenerate fresh artifacts before judging the fix.
7. Only after Stage3/4/5/6 methodology contracts pass, tune structure, breakout, target, or risk-geometry policy.

## Blocker Taxonomy

| Blocker | Primary Owner | Escalation |
| --- | --- | --- |
| `score_bounds` | Stage3 | Regenerate Stage3/Stage6 after clamp fix |
| `fundamental_data_missing` | Stage3 | Data lineage/freshness recovery |
| `ohlcv_stale` | Stage4 | Harvester/source freshness track |
| `technical_fallback` | Stage4 | Cap or block technical confidence |
| `structure_unconfirmed` | Stage5/Stage6 | Require structure proof or keep WAIT |
| `breakout_review_only` | Stage6 | Require proofConfirmed before promotion |
| `target_reached` | Stage6 | Recalibrate target or no-trade |
| `risk_geometry_invalid` | Stage6 | Recalculate stop/target or no-trade |
| `non_actionable_verdict` | Stage6 | Normalize verdict or keep quality gate |
| `execution_contract_gap` | Stage6.5 | Fix artifact contract, not sidecar alpha logic |
| `lifecycle_state_gap` | Stage8 / alpha-exec-engine | Keep separate from Stage6 tuning |

## Current Next Use

For the current track, the lead should run this order:

1. Wait for or trigger a real fresh Stage6 after the Stage3 score-bound and weak-pillar fixes.
2. Verify no `fundamentalScore > 100` remains.
3. Verify weak-pillar rows route to `WAIT_PRICE / wait_weak_pillar_execution_gate`.
4. Verify `qualityGateLane=weak_pillar_execution_gate` appears when applicable.
5. Acquire full Stage3/4/5 artifacts and run full methodology audit.
6. Only then proceed to structure / breakout / target recalibration tuning.

## Deep Audit Contract

The Stage3~5 audit is now required to prove formula consistency, not just field
coverage. A passing full-stage methodology review must include:

| Stage | Mandatory Formula Evidence | Failure Class |
| --- | --- | --- |
| Stage3 | bounded `fundamentalScore`; bounded `compositeAlpha`; `compositeAlpha = clamp(qualityScore * 0.3 + fundamentalScore * 0.7)` | `stage3_composite_formula_mismatch` |
| Stage4 | `technicalScore = scoreBreakdown.finalScore`; short/heuristic history cannot become opaque high-confidence evidence | `stage4_final_score_mismatch` |
| Stage5 | `baseFundamentalPart = fundamentalScore * 0.20`; `baseTechnicalPart = technicalScore * 0.30`; `baseIctPart = ictScore * 0.50` | `stage5_weighted_component_mismatch` |

These checks are report-only. They do not change candidate decisions by
themselves; they decide whether policy tuning is safe to perform.

## Progress Reporting Template

Use this short progress format after each stage-team task:

```text
Stage3 data/formula confidence: __/100
Stage4 technical/freshness confidence: __/100
Stage5 structure/ICT confidence: __/100
Stage6 executable-policy confidence: __/100
Stage6.5 sidecar-contract clarity: __/100
Stage7 simulation readiness: __/100
Stage8 live-readiness separation: __/100
Next blocker: <one blocker only>
```

## Safety Statement

This model does not authorize broker execution, paper submit, live submit,
replace, cancel, stop repair, or account mutation. Any execution-capable change
must be done in `alpha-exec-engine` under the explicit safety gate.
