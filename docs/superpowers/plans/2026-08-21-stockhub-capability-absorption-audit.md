# StockHub Capability Absorption Audit Plan

**Goal:** Catalog the public StockHub feature snapshot, map each feature to an existing US Alpha Seeker contract, and add only report-only capability metadata to the existing institutional applicability audit.

**Safety:** StockHub remains an idea catalog. No StockHub credentials, authenticated crawling, external capability probes, Stage6 policy changes, or broker/state mutation.

## Task 1: Lock the public inventory contract

- Add failing assertions to `scripts/validate-institutional-applicability-audit.mjs` for complete route coverage, deterministic classification, unknown count zero, and policy invariance.
- Run `npm run ops:institutional:audit:validate` and confirm the new assertions fail before implementation.

## Task 2: Extend the existing audit, not the runtime pipeline

- Add one data-only inventory module under `scripts/lib/` containing the reviewed public feature snapshot, semantic mappings, Priority 0 report-only contracts, and bounded official-source packages.
- Reuse `scripts/build-institutional-applicability-audit.mjs` to emit the inventory and Markdown tables.
- Bump the audit schema additively and document compatibility in `docs/DECISION_PACKAGE_CONTRACT.md`.
- Do not add a planner, ledger, provider, dependency, Stage4/Stage6 field, or runtime source.

## Task 3: Verify and integrate

- Run the required institutional, Stage7, OOS, Stage3-6, safety, typecheck, build, audit, and diff checks.
- Confirm Harvester and alpha-exec-engine need no code changes; preserve their safe defaults.
- Commit, push, open a focused PR, wait for CI, and merge only after all checks pass.
