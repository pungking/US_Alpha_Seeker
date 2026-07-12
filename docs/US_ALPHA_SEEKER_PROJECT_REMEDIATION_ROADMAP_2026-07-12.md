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
| Stage3-6 lineage | `STAGE6_ALPHA_FINAL_2026-07-12_18-25-42.json` passes same-run lineage, freshness, runtime formula, and target-thesis field coverage. | Static/runtime analysis contracts pass; this does not prove alpha performance. |
| Stage6 blocker mix | The latest holiday analysis-only run produced two actionable executable candidates and five bounded wait/risk rows. | The former zero-executable condition is not permanent; do not relax global filters. |
| TypeScript | `npm run typecheck` is a blocking `analysis-safety-ci` step and passes on `main`. | Structural TypeScript regressions now block CI; the debt report remains diagnostic only. |
| Scheduler/watchdog | The weekday cron is the single watchdog cadence owner; self-requeue and main-scheduler loop seeding were removed. | Workflow amplification is contained and guarded by a 16-check drift audit. |
| Harvester target lineage | Harvester records target vendor, retrieval time, and explicit unknown vendor as-of status; Stage0 propagation has a blocking contract check. | Full scheduled collection runtime proof is still required because dispatch mode collects OHLCV only. |
| Stage3-5 OOS/cost | The deterministic OOS/cost contract passes fixtures, but the real evidence store contains 0/30 labeled OOS rows. | No empirical alpha or net-return claim is permitted yet. |
| Dependency security | `npm audit --omit=dev` reports 1 critical, 3 high, and 9 moderate transitive findings. | Remediate in an isolated dependency/security task; do not apply a blind bulk audit fix. |
| Sidecar safety | Live-readiness scorecard and report-only protection/guard lanes exist; broker mutation remains approval-gated. | Paper safety is mature, but unresolved protection metadata must keep live readiness blocked. |

## Priority 0 - correctness and operational containment

### P0.1 Stage6 target-thesis runtime proof

Owner: `US_Alpha_Seeker`

- Generate one fresh Auto-Scheduler artifact after the target-thesis evidence change.
- Require target-recalibration rows to expose source field, retrieval timestamp, as-of quality, technical ceiling, ceiling sufficiency, and thesis verdict.
- Keep `finalDecision` and promotion rules unchanged.
- Done when runtime audits report no target-lineage/thesis proof gaps and historical artifacts remain backward compatible.

Status: **complete for Stage6 target-thesis fields** on run `29186871032`; Harvester vendor lineage runtime propagation remains under P1.1.

### P0.2 Eliminate watchdog workflow amplification

Owner: `US_Alpha_Seeker` workflows; separate PR.

- Choose one cadence owner: GitHub cron or a bounded self-healing loop, not both concurrently.
- Stop seeding a 48-run loop from every successful Stage6 while the watchdog already has a weekday cron.
- Add `cancel-in-progress` or an explicit active-loop lease/idempotency key.
- Done when one market session creates the documented bounded number of watchdog runs and no overlapping loop chain exists.

Status: **implemented and CI-verified**. The next market session supplies the bounded run-count observation only.

### P0.3 Make TypeScript typecheck blocking

Owner: `US_Alpha_Seeker` CI; separate PR.

- Add a direct `tsc --noEmit` CI step.
- Keep the debt report only for diagnostics; remove `continue-on-error` after one clean CI proof.
- Done when analysis-safety CI fails on a structural type regression and passes on `main`.

Status: **complete**; `analysis-safety-ci` passed on heads `5d495a62` and `c98b22ad`.

### P0.5 Remediate dependency vulnerabilities without a blind bulk upgrade

Owner: `US_Alpha_Seeker`; isolated dependency PR.

- Trace `protobufjs`, `ws`, `minimatch`, and `basic-ftp` through direct parents before changing the lockfile.
- Upgrade the smallest direct dependency set, then rerun build, typecheck, browser automation, Gemini smoke, and analysis safety CI.
- Do not use an unreviewed `npm audit fix` because the current dry-run proposes broad transitive churn.
- Done when production audit has no critical/high findings or every remaining finding has a documented non-reachable exception.

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

Current gate: `state/stage3-5-oos-cost-audit.json` reports `insufficient_oos_evidence` with 0/30 valid OOS rows. The next implementation must capture timestamped forward outcomes; it must not synthesize or relabel historical winners.

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

### P2.5 Web bundle and browser-automation cost

- The production bundle is approximately 1.88 MB minified / 529 KB gzip and exceeds the Vite 500 KB warning threshold.
- Characterize route-level and analysis-module loading before splitting; do not refactor Stage6 policy merely to reduce bundle size.
- Measure Auto-Scheduler startup and Puppeteer stability after any code split.

## Recommended sequence

1. Build the Stage7-style timestamped outcome ledger required by P1.3; keep the current 0/30 result explicit until real labels mature.
2. Complete P1.1 runtime proof after the next full scheduled Harvester collection; dispatch-only OHLCV runs do not exercise target lineage.
3. Remediate P0.5 dependency findings in an isolated lockfile/security change.
4. Execute P1.2 corporate-action and bounded partial-retry fixtures.
5. Simplify the scheduler state machine under P1.4 without reintroducing self-requeue.
6. Reassess sidecar live readiness only after OOS evidence and protection/ledger blockers close.

## Engineering readiness estimate

| Area | Estimate | Main remaining evidence |
|---|---:|---|
| Harvester/universe freshness | 84/100 | full-collection target lineage proof, corporate-action fixtures, bounded partial retry |
| Stage3-5 analytical reliability | 74/100 | real timestamped OOS outcomes; current valid sample is 0/30 |
| Stage6 decision contract | 84/100 | target vendor lineage runtime propagation and continued regime-diverse calibration |
| Paper execution/ledger safety | 82/100 | close remaining protection and metadata blockers |
| Micro-live review readiness | 48/100 | empirical strategy proof, operational containment, and protection closure |

These estimates are planning aids, not guarantees. A `100/100` claim requires documented out-of-sample performance, failure drills, broker-state reconciliation, and sustained paper evidence across multiple market regimes.
