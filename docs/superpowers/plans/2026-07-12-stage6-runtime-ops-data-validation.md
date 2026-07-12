# Stage6 Runtime, Ops, and Data Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the five requested analysis/operations improvements without broker or sidecar mutation, and leave only genuinely RTH-dependent proof outstanding.

**Architecture:** Keep repository ownership strict. `US_Alpha_Seeker` owns Stage6 evidence, CI, watchdog dispatch policy, and report-only OOS/cost audit; `US_Alpha_Seeker_Harvester` owns target vendor lineage. Runtime proof is one analysis-only Auto-Scheduler run, never an execution test.

**Tech Stack:** TypeScript/React, Node.js audit scripts, Python 3.11 Harvester, GitHub Actions, JSON artifacts.

## Global Constraints

- No broker submit, replace, reprice, or sidecar state mutation.
- No execution-policy threshold relaxation.
- Preserve `STAGE6_ALPHA_FINAL_*.json` as the canonical signal artifact.
- Use additive nullable fields for cross-repository compatibility.
- Commit and validate each repository independently.

---

### Task 1: Remove watchdog cron/self-loop amplification

**Files:**
- Modify: `.github/workflows/sidecar-dispatch-watchdog.yml`
- Modify: `.github/workflows/schedule.yml`
- Modify: `scripts/audit-sidecar-workflow-drift.mjs`

**Interfaces:**
- Consumes: existing weekday watchdog cron and stale-run dispatch decision.
- Produces: one cron/manual watchdog invocation with no self-dispatch chain.

- [ ] Remove loop inputs, loop environment, sleep/requeue steps, and main-scheduler loop seed.
- [ ] Add drift checks that fail if self-requeue or loop seed returns.
- [ ] Run `npm run ops:sidecar:drift:audit` and verify `status=pass`.
- [ ] Commit this isolated workflow fix.

### Task 2: Promote TypeScript to blocking CI

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/analysis-safety-ci.yml`

**Interfaces:**
- Consumes: current `tsconfig.json`.
- Produces: `npm run typecheck` as a blocking main/PR check.

- [ ] Add `"typecheck": "tsc --noEmit --pretty false"`.
- [ ] Run it locally and require exit code 0.
- [ ] Add a blocking CI step before the non-blocking debt artifact.
- [ ] Commit with Task 1 only if both are operational-safety changes and independently validated.

### Task 3: Add Harvester target vendor/as-of lineage

**Files:**
- Modify: `/Users/givet-bsm/US_Alpha_Seeker_Harvester/harvester.py`
- Create: `/Users/givet-bsm/US_Alpha_Seeker_Harvester/scripts/check_target_lineage_contract.py`
- Modify: `/Users/givet-bsm/US_Alpha_Seeker_Harvester/.github/workflows/main.yml`
- Modify: `components/AlphaAnalysis.tsx`

**Interfaces:**
- Produces: `targetMeanPriceSource`, `targetMeanPriceRetrievedAt`, `targetMeanPriceAsOf`, `targetMeanPriceAsOfStatus`.
- Consumes: Stage6 target source selection, preserving fallback for historical artifacts.

- [ ] Add the four optional fields to Harvester standard records; set source/retrieval only when `targetMeanPrice` is present and keep vendor as-of null/unknown when unavailable.
- [ ] Add a small Python contract check and run it in Harvester CI before collection.
- [ ] Prefer these fields in Stage6; retain existing generic timestamp fallback for old artifacts.
- [ ] Run Python contract check, `npm run typecheck`, Stage6 fixture audits, and builds in their owning repositories.
- [ ] Commit/push Harvester and analysis changes separately.

### Task 4: Add report-only Stage3-5 OOS/cost evidence gate

**Files:**
- Create: `scripts/build-stage3-5-oos-cost-audit.mjs`
- Create: `scripts/validate-stage3-5-oos-cost-audit.mjs`
- Create: `docs/fixtures/stage3_5_oos_cost/ready.fixture.json`
- Create: `docs/fixtures/stage3_5_oos_cost/insufficient.fixture.json`
- Modify: `package.json`
- Modify: `.github/workflows/analysis-safety-ci.yml`

**Interfaces:**
- Consumes: versioned signal/outcome rows with signal date, entry/exit prices, holding period, split label, and explicit cost basis points.
- Produces: gross/net return, win rate, average return, sample count, and `pass_report_only` or `insufficient_oos_evidence`.

- [ ] Implement one deterministic stdlib-only audit; never infer missing forward outcomes.
- [ ] Apply explicit round-trip cost scenarios and keep validation/report-only.
- [ ] Validate ready and insufficient fixtures.
- [ ] Add CI fixture validation and commit.

### Task 5: Generate and inspect one fresh Stage6 artifact

**Files:** No source change unless runtime proof exposes a producer defect.

**Interfaces:**
- Consumes: `main` after Tasks 1-4.
- Produces: one fresh analysis-only Stage6 artifact and target-thesis field proof.

- [ ] Trigger `schedule.yml` with `force=true` only after holiday/weekend safety confirms sidecar dispatch is blocked.
- [ ] Verify `sourceSha` is at or after the final analysis commit.
- [ ] Verify target rows expose `targetRecalibrationSourceField`, `targetRecalibrationSourceRetrievedAt`, `targetRecalibrationSourceAsOfStatus`, `targetRecalibrationTechnicalCeilingPrice`, `targetRecalibrationTechnicalCeilingSufficient`, and `targetRecalibrationThesisVerdict`.
- [ ] Record `analysis-only` when the market is closed; do not perform RTH sidecar validation.
- [ ] If no target-recalibration row appears, mark runtime proof `not_exercised_no_matching_row` and stop rather than rerunning repeatedly.
