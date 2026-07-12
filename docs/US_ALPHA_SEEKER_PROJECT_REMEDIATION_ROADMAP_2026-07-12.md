# US Alpha Seeker Project Remediation Roadmap - 2026-07-12

## Scope

This roadmap covers:

- `US_Alpha_Seeker` - Stage0-6 analysis and canonical signal artifacts
- `US_Alpha_Seeker_Harvester` - listing universe, OHLCV, and auxiliary data
- `alpha-exec-engine` - dry-run, paper execution safety, ledgers, and protection monitoring

The roadmap is evidence-driven and does not authorize broker mutation. Readiness scores below describe engineering evidence, not expected return or trading performance.

## Current evidence snapshot

| Area | Evidence | Current interpretation |
|---|---|---|
| Stage3-6 lineage | Latest same-run chain through `STAGE6_ALPHA_FINAL_2026-07-11_01-45-17.json` passes the full-stage lineage audit. | Pipeline handoff is auditable; formula quality still needs row-level tuning. |
| Stage6 blocker mix | Latest runtime has 4 target-recalibration, 1 structure-proof, and 1 breakout-proof blocker. | Do not relax global filters. Improve target thesis evidence first. |
| TypeScript | `npx tsc --noEmit` passes after completing the non-applicable risk-geometry return contract. | Typecheck can move from non-blocking debt report to a blocking CI gate after one clean CI run. |
| Scheduler/watchdog | 80 of the latest 100 Actions runs are `Sidecar Dispatch Watchdog`; the workflow has both cron cadence and an optional 48-run self-requeue loop seeded by the main scheduler. | P0 workflow amplification/cost risk. Fix separately from Stage6 policy. |
| Harvester universe | Authoritative listing refresh, analysis-eligible common-stock classification, mapping refresh audit, and mapping prune count exist. | Core freshness lane is present; corporate-action and partial-retry proof remain. |
| Sidecar safety | Live-readiness scorecard and report-only protection/guard lanes exist; broker mutation remains approval-gated. | Paper safety is mature, but unresolved protection metadata must keep live readiness blocked. |

## Priority 0 - correctness and operational containment

### P0.1 Stage6 target-thesis runtime proof

Owner: `US_Alpha_Seeker`

- Generate one fresh Auto-Scheduler artifact after the target-thesis evidence change.
- Require target-recalibration rows to expose source field, retrieval timestamp, as-of quality, technical ceiling, ceiling sufficiency, and thesis verdict.
- Keep `finalDecision` and promotion rules unchanged.
- Done when runtime audits report no target-lineage/thesis proof gaps and historical artifacts remain backward compatible.

### P0.2 Eliminate watchdog workflow amplification

Owner: `US_Alpha_Seeker` workflows; separate PR.

- Choose one cadence owner: GitHub cron or a bounded self-healing loop, not both concurrently.
- Stop seeding a 48-run loop from every successful Stage6 while the watchdog already has a weekday cron.
- Add `cancel-in-progress` or an explicit active-loop lease/idempotency key.
- Done when one market session creates the documented bounded number of watchdog runs and no overlapping loop chain exists.

### P0.3 Make TypeScript typecheck blocking

Owner: `US_Alpha_Seeker` CI; separate PR.

- Add a direct `tsc --noEmit` CI step.
- Keep the debt report only for diagnostics; remove `continue-on-error` after one clean CI proof.
- Done when analysis-safety CI fails on a structural type regression and passes on `main`.

### P0.4 Preserve execution boundaries

Owner: all repositories.

- Continue blocking broker code in the analysis repository.
- Keep Stage6 canonical ownership in `US_Alpha_Seeker` and execution safety in `alpha-exec-engine`.
- Require explicit approval for every broker or state mutation.
- Done when boundary scanners pass in all three repositories and state directories remain environment-separated.

## Priority 1 - data and model reliability

### P1.1 Target and fundamental source lineage

- Extend Harvester fields so analyst targets identify vendor, retrieval timestamp, and vendor effective/as-of date when the vendor actually provides it.
- Never infer an analyst target effective date from an artifact generation timestamp.
- Carry fiscal period/filing date and adjustment metadata through Stage3-6.

### P1.2 Corporate-action and partial-retry proof

- Add explicit symbol-change, merger, split, suspension, and delisting reason codes.
- Prove that partial failures can be retried without rerunning the full universe and without preserving stale removed symbols.
- Add fixtures for a new listing, delisting, symbol change, transient vendor failure, and permanent unsupported instrument.

### P1.3 Stage3-5 calibration, not only score bounds

- Keep current bounds/freshness audits.
- Add walk-forward and out-of-sample calibration for score buckets, sector neutrality, turnover, drawdown, and transaction-cost sensitivity.
- Separate predictive quality from data availability and from execution feasibility.
- Do not claim maximum accuracy without these empirical tests.

### P1.4 Scheduler state-machine simplification

- Consolidate deadline guard, watchdog, catch-up, and main scheduler decisions into one auditable run-state contract.
- Persist one market-date idempotency key and one canonical completion status.
- Done when schedule omission, manual force, and catch-up paths have deterministic fixtures and no duplicate full analysis.

### P1.5 Sidecar protection and ledger closure

- Keep guard metadata, broker child protection, terminal reconciliation, and entry/fillability as separate blocker groups.
- Require live-readiness to remain `BLOCKED` while any protection or ledger blocker is unresolved.
- Convert repeated symbol examples into symbol-agnostic fixtures; never create ticker-specific production rules.

## Priority 2 - maintainability and adaptive architecture

### P2.1 Decompose `AlphaAnalysis.tsx` after characterization tests

- Extract pure Stage6 policy functions into typed modules only after artifact fixtures characterize current behavior.
- Preserve field names and Stage6 schema compatibility during extraction.

### P2.2 Stage7-8 Decision Package and feedback loop

- Stage7: portfolio/risk review package with evidence lineage and explicit invalidation conditions.
- Stage8: outcome/post-trade package that updates calibration evidence, never live thresholds directly.
- Connect this to the TradingCodex operating model and mRNA-style adaptive strategy transcript.

### P2.3 Provider cost and fallback observability

- Report provider request size, response size, token/cost estimate, timeout, fallback reason, and coverage quality per stage.
- Bound Sonar/Gemini failover without silently changing user-selected interactive behavior.

### P2.4 Client-secret hardening and artifact privacy

- Keep paid/vendor secrets server-side and prevent `VITE_*` exposure for secret values.
- Continue redacting account identifiers, positions, tokens, and paid-data credentials from public artifacts.

## Recommended sequence

1. Complete P0.1 with one fresh Stage6 runtime proof.
2. Fix P0.2 watchdog amplification in an isolated workflow PR.
3. Promote P0.3 typecheck to a blocking gate.
4. Implement P1.1 target lineage at the Harvester source boundary.
5. Execute P1.2 and P1.3 before any micro-live readiness review.
6. Reassess the sidecar live-readiness scorecard only after protection/ledger blockers close.

## Engineering readiness estimate

| Area | Estimate | Main remaining evidence |
|---|---:|---|
| Harvester/universe freshness | 82/100 | corporate-action fixtures and bounded partial retry |
| Stage3-5 analytical reliability | 74/100 | out-of-sample calibration and cost-aware validation |
| Stage6 decision contract | 78/100 | fresh target-thesis runtime proof and continued zero-executable calibration |
| Paper execution/ledger safety | 82/100 | close remaining protection and metadata blockers |
| Micro-live review readiness | 48/100 | empirical strategy proof, operational containment, and protection closure |

These estimates are planning aids, not guarantees. A `100/100` claim requires documented out-of-sample performance, failure drills, broker-state reconciliation, and sustained paper evidence across multiple market regimes.
