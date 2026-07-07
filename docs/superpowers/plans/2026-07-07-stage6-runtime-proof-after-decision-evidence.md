# Stage6 Runtime Proof After Decision Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate or locate a fresh Auto-Scheduler Stage6 artifact after commit `11f3a378`, then verify that Stage6 rows carry Decision Package evidence fields for zero-executable formula bottlenecks.

**Architecture:** This is a report-only runtime proof task. The analysis repo produces Stage6 artifacts; local scripts validate formula field coverage and backlog alignment. No broker, sidecar mutation, submit, replace, or reprice behavior is allowed.

**Tech Stack:** GitHub Actions, GitHub CLI, Node.js audit scripts, Stage6 JSON artifacts, local markdown/json audit reports.

## Global Constraints

- Repository: `/Users/givet-bsm/US_Alpha_Seeker` only.
- Safe scope: analysis-only Auto-Scheduler and report-only local audits.
- Forbidden: broker submit, broker replace, broker reprice, sidecar mutation, execution policy changes.
- Freshness target: Auto-Scheduler run must use commit `11f3a378` or a descendant.
- Required row evidence: `zeroExecutableFormulaBlockedBy`, `zeroExecutableFormulaNextAction`, `zeroExecutableFormulaDoneWhenEvidence`.

---

### Task 1: Establish Current Runtime State

**Files:**
- Read: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/schedule.yml`
- Read: local git status and GitHub run list

**Interfaces:**
- Consumes: current git head, origin main head, latest GitHub Auto-Scheduler runs.
- Produces: decision whether a fresh hash already exists or must be generated.

- [x] **Step 1: Confirm local and remote head**

Run:
```bash
git status --short
git rev-parse HEAD
git ls-remote origin main | awk '{print $1}'
```
Observed: local/origin main were aligned at `11f3a378ef75a7953db91bbda81fda69d510c0f6`.

- [x] **Step 2: Check latest Auto-Scheduler runs**

Run:
```bash
gh run list --repo pungking/US_Alpha_Seeker --workflow "US Alpha Seeker Auto-Scheduler" --limit 5 --json databaseId,status,conclusion,headSha,createdAt,url
```
Observed: latest pre-check Auto-Scheduler run was older than `11f3a378`, so a fresh analysis-only run was required.

### Task 2: Generate Fresh Stage6 If Needed

**Files:**
- Read: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/schedule.yml`

**Interfaces:**
- Consumes: workflow dispatch input `force=true`.
- Produces: completed Auto-Scheduler run id with new Stage6 artifact.

- [x] **Step 1: Trigger analysis-only Auto-Scheduler if no fresh run exists**

Run:
```bash
gh workflow run schedule.yml --repo pungking/US_Alpha_Seeker --ref main -f force=true
```
Observed: workflow dispatch accepted and created run `28873032664`.

- [x] **Step 2: Poll until complete**

Run:
```bash
gh run list --repo pungking/US_Alpha_Seeker --workflow "US Alpha Seeker Auto-Scheduler" --limit 3
```
Observed: run `28873032664` completed with `success` at head `11f3a378ef75a7953db91bbda81fda69d510c0f6`.

### Task 3: Verify Fresh Stage6 Decision Evidence

**Files:**
- Read generated GitHub artifact or refreshed local `state/stage6-audit-source/STAGE6_ALPHA_FINAL_*.json`.
- Run local scripts from `/Users/givet-bsm/US_Alpha_Seeker/scripts/`.

**Interfaces:**
- Consumes: fresh Stage6 artifact generated at or after `11f3a378`.
- Produces: runtime proof verdict and row-level evidence summary.

- [x] **Step 1: Download/locate Stage6 artifact**

Run the existing artifact download path or inspect the workflow artifact list:
```bash
gh run view <run_id> --repo pungking/US_Alpha_Seeker --json artifacts,jobs
```
Observed: artifact `automation-evidence` contained `STAGE6_ALPHA_FINAL_2026-07-07_23-42-56.json` with hash `f63aabc7e1b656dd287f25107be559ceeefeff64f22386104c4b4b6ab5a55589`.

- [x] **Step 2: Validate formula coverage**

Run:
```bash
npm run ops:stage6:fresh-focus:formula-coverage
npm run ops:stage6:formula-tuning-backlog:validate
npm run ops:stage6:runtime-formula-contract:proof
```
Observed: `stage6-runtime-formula-contract-proof.json` reported `overall=pass_formula_contract_present_executable_candidates_exist`, `contract.ok=true`, and `sourceFreshness.status=pass_exact_or_prefix`.

### Task 4: Report RTH Sidecar Follow-up

**Files:**
- Update only if needed: `/Users/givet-bsm/US_Alpha_Seeker/docs/RTH_ONE_TIME_STAGE6_SIDECAR_CHECKLIST.md`

**Interfaces:**
- Consumes: Stage6 file/hash and runtime proof status.
- Produces: next RTH one-shot checklist.

- [x] **Step 1: Decide if RTH sidecar check is needed**

If fresh Stage6 exists, next RTH sidecar check is:
```text
fresh hash consumed, previewStale=false, decisionAuditRows>0, payloadExpectation, topSkipReasonCategories, attempted=0, submitted=0
```
Observed: sidecar run `28875090136` consumed Stage6 hash `f63aabc7e1b656dd287f25107be559ceeefeff64f22386104c4b4b6ab5a55589`; `guardControl.stale=false`, `decisionAuditRows=1`, `topSkipReasonCategories=quality_gate:1`, `brokerAttempted=0`, and `brokerSubmitted=0`.

- [x] **Step 2: Commit only if local files changed**

Run:
```bash
git status --short
```
Expected: commit plan/report docs only if modified intentionally.

## Completion Evidence

- Fresh Auto-Scheduler run: `28873032664`
- Fresh Stage6 file: `STAGE6_ALPHA_FINAL_2026-07-07_23-42-56.json`
- Fresh Stage6 hash: `f63aabc7e1b656dd287f25107be559ceeefeff64f22386104c4b4b6ab5a55589`
- Source head: `11f3a378ef75a7953db91bbda81fda69d510c0f6`
- Runtime formula proof: `pass_formula_contract_present_executable_candidates_exist`
- Formula contract version: `zero_executable_formula_v4`
- Fresh-focus formula evidence coverage: `zeroExecutableFormulaBlockedBy/NextAction/DoneWhenEvidence = 7/7`
- RTH sidecar one-shot run: `28875090136`
- Sidecar broker mutation: `attempted=0`, `submitted=0`
- Current non-payload reason: `quality_gate / conviction_below_floor` for one unheld executable candidate.
