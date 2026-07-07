# Stage6 Sidecar Conviction Floor Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Stage6 from emitting `EXECUTABLE_NOW` for candidates that are expected to fail the sidecar conviction floor gate, and preserve row-level Decision Package evidence explaining the quality-gate block.

**Architecture:** Keep the change in `US_Alpha_Seeker` only. Stage6 receives a conservative sidecar conviction floor contract via `VITE_STAGE6_SIDECAR_MIN_CONVICTION` and writes row-level evidence (`sidecarConvictionFloor*`). If an otherwise executable candidate is below the contract floor, Stage6 downgrades it to `WAIT_PRICE / wait_sidecar_conviction_floor` rather than allowing the sidecar to produce a later no-payload surprise.

**Tech Stack:** React/TypeScript Stage6 producer, JSON schema fixture validation, Node.js audit scripts, Vite build.

## Global Constraints

- Repository: `/Users/givet-bsm/US_Alpha_Seeker` only.
- Safe scope: analysis-only producer/audit/schema/docs changes.
- Forbidden: broker submit, broker replace, broker reprice, sidecar mutation, execution policy changes.
- Do not lower sidecar floors or widen execution eligibility.
- Do not recompute sidecar adaptive runtime state in Stage6; use an explicit conservative contract floor.

---

### Task 1: Add Stage6 Sidecar Conviction Contract Fields

**Files:**
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/components/AlphaAnalysis.tsx`
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/schemas/stage6_sidecar_entry_fillability_contract.schema.json`

**Interfaces:**
- Consumes: `convictionScore`, `finalDecision`, `decisionReason`.
- Produces: `sidecarConvictionFloor`, `sidecarConvictionPass`, `sidecarConvictionMargin`, `sidecarConvictionPolicyVerdict`, `sidecarConvictionReasons`, `qualityGateLane`.

- [x] Step 1: Extend `AlphaCandidate` with sidecar conviction fields.
- [x] Step 2: Add `VITE_STAGE6_SIDECAR_MIN_CONVICTION` parsing with safe default `69`.
- [x] Step 3: After verdict/actionability gates but before weak-pillar gate, downgrade `EXECUTABLE_NOW` candidates below the sidecar contract floor to `WAIT_PRICE / wait_sidecar_conviction_floor`.
- [x] Step 4: Emit sidecar conviction evidence fields on every Stage6 row.
- [x] Step 5: Add schema properties for the new fields.

### Task 2: Update Audit Classification and Fixtures

**Files:**
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/scripts/build-stage6-fresh-focus-audit.mjs`
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/docs/fixtures/stage6_sidecar_entry_fillability_contract.fixture.json`
- Modify fixture as needed: `/Users/givet-bsm/US_Alpha_Seeker/docs/fixtures/stage6_fresh_focus_formula/STAGE6_ALPHA_FINAL_WITH_FORMULA.fixture.json`

**Interfaces:**
- Consumes: `wait_sidecar_conviction_floor`, sidecar conviction evidence.
- Produces: `quality_gate` blocker classification instead of `other`.

- [x] Step 1: Treat `wait_sidecar_conviction_floor` as quality gate.
- [x] Step 2: Add fixture rows proving below-floor rows are `WAIT_PRICE`, not `EXECUTABLE_NOW`.
- [x] Step 3: Ensure fixture schema accepts and validates the new evidence fields.

### Task 3: Validate and Commit

**Files:**
- All modified files.

**Interfaces:**
- Consumes: local scripts and build.
- Produces: committed/pushed analysis-only change.

- [x] Step 1: Run `npm run ops:stage6:fillability-contract:validate`.
- [x] Step 2: Run `npm run ops:stage6:fresh-focus:formula-coverage`.
- [x] Step 3: Run `npm run ops:stage3-6:full:audit`.
- [x] Step 4: Run `npm run ops:safety:analysis-boundary`.
- [x] Step 5: Run `npm run build`.
- [x] Step 6: Commit and push if all checks pass.


## Completion Evidence

- Stage6 producer now emits `sidecarConvictionFloor`, `sidecarConvictionPass`, `sidecarConvictionMargin`, `sidecarConvictionPolicyVerdict`, and `sidecarConvictionReasons`.
- `EXECUTABLE_NOW` rows that do not pass the conservative sidecar conviction floor contract are downgraded to `WAIT_PRICE / wait_sidecar_conviction_floor`.
- `wait_sidecar_conviction_floor` is classified as `quality_gate / sidecar_conviction_floor`, not `other`.
- Contract fixture includes `FLOOR_WAIT_FIXTURE` proving a 68 conviction row is not executable when the sidecar contract floor is 69.
- Verification passed:
  - `npm run ops:stage6:fillability-contract:validate`
  - `npm run ops:stage6:fresh-focus:formula-coverage`
  - `npm run ops:stage6:formula-tuning-backlog:validate`
  - `npm run ops:stage6:formula-audit-backlog:align`
  - `npm run ops:stage3-6:full:audit`
  - `npm run ops:safety:analysis-boundary`
  - `npm run build`
