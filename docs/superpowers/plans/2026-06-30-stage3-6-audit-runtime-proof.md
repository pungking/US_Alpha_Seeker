# Stage3-6 Audit Runtime Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the Stage3~6 audit/runtime-proof loop so zero-executable causes are classified at row level without broker, sidecar, or execution-policy mutation.

**Architecture:** Keep `US_Alpha_Seeker` as the analysis-only producer/audit repository. Use report-only scripts under `/Users/givet-bsm/US_Alpha_Seeker/scripts` to validate Stage3/4/5/6 lineage, Stage6 formula evidence, and runtime proof readiness. Runtime proof remains a waiting gate until a fresh Auto-Scheduler hash exists; static audit work continues independently.

**Tech Stack:** Node.js scripts, npm scripts, GitHub Actions, JSON/Markdown audit artifacts, Stage3~6 pipeline artifacts.

## Global Constraints

- Do not implement broker submit, replace, reprice, paper/live order mutation, or sidecar state mutation.
- Do not change execution policy or safe defaults.
- Do not solve zero-executable by simply lowering filters.
- `US_Alpha_Seeker` remains analysis-only; execution logic belongs to `alpha-exec-engine`.
- Prefer small report-only diffs with explicit verification.
- Fresh runtime proof requires a new Auto-Scheduler Stage6 artifact generated after the relevant head commit.

---

### Task 1: Runtime Proof Goal Status Hardening

**Files:**
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/scripts/check-stage6-runtime-formula-goal-status.mjs`
- Read: `/Users/givet-bsm/US_Alpha_Seeker/state/stage3-6-full-stage-audit.json`
- Read: `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-formula-tuning-backlog.json`

**Interfaces:**
- Consumes: full-stage audit row samples with `producerTrack`, `targetRecalibrationProofSummary`, `targetRecalibrationProofGaps`.
- Produces: a new report-only requirement in `state/stage6-runtime-formula-goal-status.json` that fails if target recalibration rows lose row-level proof summaries.

- [ ] Step 1: Inspect current goal-status script.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
sed -n '1,260p' scripts/check-stage6-runtime-formula-goal-status.mjs
```

Expected: Existing requirement list includes runtime proof, full-stage audit exposure, and mutation-forbidden checks.

- [ ] Step 2: Add a helper for target recalibration proof summaries.

Add logic equivalent to:
```js
function validTargetProofSummary(row) {
  const summary = String(row?.targetRecalibrationProofSummary || '').trim();
  return Boolean(
    summary &&
    summary !== 'not_target_recalibration' &&
    summary.includes('executionFloor=') &&
    summary.includes('proofGaps=')
  );
}
```

- [ ] Step 3: Add a report-only requirement.

Add a requirement named `target_recalibration_rows_expose_proof_summary`:
```js
const targetRecalibrationSamples = fullStageRowEvidenceSamples.filter(
  (row) => row?.producerTrack === 'target_recalibration'
);
const targetProofSummaryReadyCount = targetRecalibrationSamples.filter(validTargetProofSummary).length;
const targetProofSummaryReady = targetRecalibrationSamples.length === targetProofSummaryReadyCount;
```

Expected behavior:
- `pending` when full-stage audit is missing.
- `not_applicable` when no target-recalibration samples exist.
- `pass` when all sampled target-recalibration rows expose proof summaries.
- `fail` when any sampled target-recalibration row loses proof summary.

- [ ] Step 4: Run the required audit chain.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
PATH="/usr/local/bin:$PATH" npm run ops:stage6:formula-tuning-backlog
PATH="/usr/local/bin:$PATH" npm run ops:stage3-6:full:audit
PATH="/usr/local/bin:$PATH" npm run ops:stage6:runtime-formula-goal:status
```

Expected: `state/stage6-runtime-formula-goal-status.json` includes the new requirement and does not fail when current row evidence is present.

---

### Task 2: Audit Validation and Build Gate

**Files:**
- Read/verify: `/Users/givet-bsm/US_Alpha_Seeker/package.json`
- Generated/read: `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-runtime-formula-goal-status.json`
- Generated/read: `/Users/givet-bsm/US_Alpha_Seeker/docs/STAGE3_6_FULL_STAGE_AUDIT.md`

**Interfaces:**
- Consumes: npm audit scripts and generated report artifacts.
- Produces: local proof that the analysis-only audit lane remains valid.

- [ ] Step 1: Run formula backlog validation.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
PATH="/usr/local/bin:$PATH" npm run ops:stage6:formula-tuning-backlog:validate
```

Expected: PASS.

- [ ] Step 2: Run build.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
PATH="/usr/local/bin:$PATH" npm run build
```

Expected: PASS.

- [ ] Step 3: Check diff hygiene.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
git diff --check
git status --short
```

Expected: no whitespace errors; only intentional script/docs changes.

---

### Task 3: GitHub Actions Audit Step Cleanup Triage

**Files:**
- Inspect: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/schedule.yml`
- Optional modify: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/schedule.yml`

**Interfaces:**
- Consumes: existing numbered audit steps `7.02` through `7.05`.
- Produces: either no code change with a rationale, or a label-only cleanup that preserves every command and artifact.

- [ ] Step 1: Inspect current audit step grouping.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
rg -n "7\.02|7\.03|7\.031|7\.032|7\.033|7\.034|7\.035|7\.039|7\.04|7\.05|Stage3|Stage6" .github/workflows/schedule.yml
```

Expected: confirm whether names are only labels or also referenced by later steps.

- [ ] Step 2: If safe, rename labels only.

Allowed change: readable display names such as `7.03 Stage3~6 Evidence Audits`, `7.04 Stage6 Formula Proof Audits`, `7.05 Dispatch Guard Audits`.

Forbidden change: remove commands, skip reports, change job behavior, or weaken a failing audit.

- [ ] Step 3: Validate YAML semantics.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
python3 - <<'PY'
from pathlib import Path
p = Path('.github/workflows/schedule.yml')
text = p.read_text(encoding='utf-8')
assert 'ops:stage3-6:full:audit' in text
assert 'ops:stage6:runtime-formula-contract:proof' in text
assert 'repository_dispatch' in text
print('schedule.yml static checks passed')
PY
```

Expected: static checks pass.

---

### Task 4: Commit, Push, and Runtime Follow-Up Gate

**Files:**
- Commit intentional changes only.
- Verify GitHub Actions after push.

**Interfaces:**
- Produces: a pushed main branch commit if code changed.
- Produces: a next-run checklist if no code change is necessary.

- [ ] Step 1: Commit intentional changes.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
git status --short
git add <intentional files>
git commit -m "test(stage6): harden runtime proof evidence checks"
```

Expected: one focused commit, no generated noise unless intentionally part of the audit artifact/docs.

- [ ] Step 2: Push and verify CI.

Run:
```bash
cd /Users/givet-bsm/US_Alpha_Seeker
git push
gh run list --workflow analysis-safety-ci.yml --limit 3
```

Expected: latest analysis-safety CI passes, or failure is diagnosed without masking it.

- [ ] Step 3: Record next Auto-Scheduler/RTH one-shot criteria.

Next fresh Auto-Scheduler proof must check:
```text
- Fresh Stage6 generated after current head.
- stage6-runtime-formula-contract-proof.json remains pass or explicitly pending only for unavailable runtime data.
- stage6-runtime-formula-goal-status.json target_recalibration_rows_expose_proof_summary is pass/not_applicable.
- RTH sidecar one-shot: fresh hash consumed, previewStale=false, decisionAuditRows>0, payloadExpectation present, topSkipReasonCategories present, attempted=0, submitted=0.
```
