# Stage7 OOS, Dependency Security, Harvester Runtime, and RTH Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add non-mutating forward-outcome evidence, remove production critical/high dependency findings, prove Harvester target lineage on a full collection, harden listing lifecycle/retry fixtures, and complete one bounded RTH sidecar safety check.

**Architecture:** `US_Alpha_Seeker` owns Stage6-derived research outcomes and dependency CI. `US_Alpha_Seeker_Harvester` owns vendor lineage and listing lifecycle fixtures. `alpha-exec-engine` is read-only evidence for one RTH run; no broker or state mutation is authorized.

**Tech Stack:** Node.js ESM, TypeScript/Vite, Python 3.11, GitHub Actions, JSON artifacts.

## Global Constraints

- `STAGE6_ALPHA_FINAL_*.json` remains the canonical signal source.
- Outcome rows use only bars strictly after the signal timestamp; ambiguous same-bar target/stop ordering is never inferred.
- OOS evidence is report-only and cannot change Stage6 or execution policy.
- Dependency remediation must not use broad `npm audit fix`; use compatible targeted versions and a blocking high-severity audit.
- Harvester must not fabricate a vendor as-of date.
- `EXEC_ENABLED=false`, `READ_ONLY=true`, no broker submit/replace/reprice, and no sidecar state mutation.

---

### Task 1: Stage7-Style Timestamped Outcome Ledger

**Files:**
- Create: `scripts/build-stage7-outcome-ledger.mjs`
- Create: `scripts/validate-stage7-outcome-ledger.mjs`
- Create: `docs/fixtures/stage7_outcome_ledger/outcome-paths.fixture.json`
- Modify: `package.json`
- Modify: `.github/workflows/analysis-safety-ci.yml`
- Modify: `.github/workflows/schedule.yml`

**Interfaces:**
- Consumes: `state/stage6-audit-source/STAGE6_ALPHA_FINAL_*.json` and `state/stage4-audit-source/STAGE4_TECHNICAL_FULL_*.json`.
- Produces: `state/stage7-outcome-ledger.json`, `state/stage3-5-oos-outcomes.json`, and `docs/STAGE7_OUTCOME_LEDGER.md`.

- [ ] Add a failing fixture check for pending, no-fill, target-first, stop-first, timeout, and ambiguous-same-bar rows.
- [ ] Run `node scripts/validate-stage7-outcome-ledger.mjs` and confirm it fails because the builder is absent.
- [ ] Implement deterministic seed/resolution logic with strict post-signal bars and atomic writes.
- [ ] Re-run the validator and require all fixture paths to pass.
- [ ] Wire the builder before the existing OOS/cost audit and upload its artifacts.

### Task 2: Critical/High Dependency Isolation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/analysis-safety-ci.yml`

**Interfaces:**
- Consumes: npm advisory metadata.
- Produces: a lockfile with zero production critical/high findings and a blocking `npm audit --omit=dev --audit-level=high` CI step.

- [ ] Record the current production audit baseline.
- [ ] Add only compatible transitive overrides required for `protobufjs`, `ws`, `basic-ftp`, and `minimatch`; update same-major direct dependencies only when needed.
- [ ] Run `npm install`, `npm audit --omit=dev --audit-level=high`, `npm run typecheck`, and `npm run build`.
- [ ] Keep moderate findings visible; do not claim they are fixed.

### Task 3: Harvester Listing Lifecycle and Partial Retry Fixtures

**Files:**
- Create: `scripts/check_listing_lifecycle_contract.py`
- Create: `fixtures/listing_lifecycle_contract.json`
- Modify: `.github/workflows/main.yml`
- Modify: `.github/workflows/telegram-routing-ci.yml`

**Interfaces:**
- Consumes: existing mapping parser, lifecycle state, record merge, and retry classification functions.
- Produces: a deterministic contract check covering new common listings, delisting removal, class-symbol normalization, non-common exclusion, recovered partial history, and preservation of prior fields during partial refresh.

- [ ] Add fixture assertions and run them red against any missing behavior.
- [ ] Fix only shared root functions when a fixture exposes a defect.
- [ ] Run the contract check, symbol-agnostic guard, target-lineage check, and Python compilation.

### Task 4: Full Harvester Target Lineage Runtime Proof

**Files:**
- Modify only if evidence is missing: `.github/workflows/main.yml`

**Interfaces:**
- Consumes: a scheduled/manual daily Harvester artifact generated from the current head.
- Produces: runtime proof that finite `targetMeanPrice` rows carry source, retrieval timestamp, and explicit vendor-as-of status.

- [ ] Inspect the latest full daily run from commit `d743bc5` or later.
- [ ] If no such run exists, start one bounded daily batch after code/CI is pushed; do not substitute the OHLCV-only repository-dispatch path.
- [ ] Download `harvester-state-*` and verify summary/coverage evidence without exposing symbols or secrets in public logs.

### Task 5: RTH Sidecar Safe One-Shot

**Files:**
- No code changes expected in `alpha-exec-engine`.

**Interfaces:**
- Consumes: Stage6 file `STAGE6_ALPHA_FINAL_2026-07-13_21-40-48.json`, hash `e43ac14a2409887bbcd9f9024889802581ec26b8cada88f99a316b80c4a9c605` or a newer same-day canonical hash.
- Produces: one sidecar artifact proving fresh consumption and no mutation.

- [ ] Run or select exactly one RTH `safe_default` sidecar dry-run.
- [ ] Verify `previewStale=false`, `decisionAuditRows>0`, payload expectation/top-skip categorization, and source hash equality.
- [ ] Verify `brokerMutationAttempted=false` and `brokerMutationSubmitted=false`.
- [ ] Stop observing after this one evidence-bearing run.

### Task 6: Final Verification and Repository-Scoped Commits

**Files:**
- Modify: `docs/US_ALPHA_SEEKER_PROJECT_REMEDIATION_ROADMAP_2026-07-12.md` only if status evidence changed.

- [ ] Run Stage7 fixture, OOS/cost fixture, target-lineage contract, Stage3-6 audit, safety boundary, high-severity npm audit, typecheck, and build.
- [ ] Run Harvester lifecycle/target/symbol-agnostic checks and Python compilation.
- [ ] Run `git diff --check` and verify clean repository boundaries.
- [ ] Commit and push `US_Alpha_Seeker` and `US_Alpha_Seeker_Harvester` separately; do not commit sidecar artifacts or state.
