# Stage6 Producer Tuning 2 And RTH Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage6 producer의 target recalibration / risk geometry / structure / breakout 증거를 report-only로 2차 감사하고, RTH에는 sidecar가 fresh hash를 안전 모드로 1회 소비하는지만 확인한다.

**Architecture:** RTH 전에는 `US_Alpha_Seeker` 안에서 Stage6 artifact와 기존 audit artifact만 읽는 report-only 감사 산출물을 추가한다. RTH 후에는 `alpha-exec-engine` artifact를 읽어 fresh hash 소비와 `attempted=0/submitted=0` 유지 여부만 확인한다. ops-health fail은 guard metadata/protective order 전용 트랙으로 분리하고, Stage6 entry/reprice 문제와 섞지 않는다.

**Tech Stack:** Node.js ESM scripts, npm scripts, JSON/Markdown audit artifacts, GitHub Actions artifact evidence.

---

## Scope Lock

### Allowed

- `/Users/givet-bsm/US_Alpha_Seeker`의 Stage6 report-only audit 스크립트 추가 또는 보강.
- 기존 `state/stage6-formula-tuning-backlog.json`, `state/stage6-runtime-formula-contract-proof.json`, `state/stage6-fresh-focus-audit.json` 읽기.
- `state/stage6-producer-tuning-2-audit.json`와 `state/stage6-producer-tuning-2-audit.md` 생성.
- npm script 추가.
- GitHub Actions 감사 단계명 정리 또는 audit summary 추가.

### Forbidden

- broker submit / replace / reprice.
- sidecar mutation.
- execution policy 변경.
- zero-executable 단순 필터 완화.
- `alpha-exec-engine`가 Stage6 alpha logic을 재계산하도록 변경.
- ops-health guard metadata/protective order fail을 Stage6 entry 문제로 합치기.

---

## Files

- Create: `/Users/givet-bsm/US_Alpha_Seeker/scripts/build-stage6-producer-tuning-2-audit.mjs`
- Create: `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-producer-tuning-2-audit.json`
- Create: `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-producer-tuning-2-audit.md`
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/package.json`
- Optional Modify: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/analysis-safety-ci.yml`
- Optional Modify: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/schedule.yml`

---

## Task 1: Add Stage6 Producer Tuning 2 Report-Only Audit

**Files:**
- Create: `/Users/givet-bsm/US_Alpha_Seeker/scripts/build-stage6-producer-tuning-2-audit.mjs`

- [ ] **Step 1: Implement artifact readers**

Create a Node ESM script that reads these files if present:

```js
const INPUTS = {
  formulaBacklog: "state/stage6-formula-tuning-backlog.json",
  runtimeProof: "state/stage6-runtime-formula-contract-proof.json",
  freshFocus: "state/stage6-fresh-focus-audit.json",
};
```

If an input is missing, record it under `inputWarnings` and continue with degraded report-only status.

- [ ] **Step 2: Implement target recalibration classification**

Classify row-level evidence into these lanes:

```js
const TARGET_LANES = {
  EXECUTION_FLOOR_VIABLE_GAP_WIDE: "target_execution_floor_viable_expected_return_gap_wide",
  TARGET_NO_TRADE_CONFIRMED: "target_no_trade_confirmed",
  TARGET_RECALIBRATION_CANDIDATE: "target_recalibration_candidate",
  TARGET_EVIDENCE_MISSING: "target_evidence_missing",
};
```

Rules:

```js
if (row.targetNoTradeConfirmed === true) lane = TARGET_LANES.TARGET_NO_TRADE_CONFIRMED;
else if (row.targetRecalibrationExecutionFloorViable === true && row.targetRecalibrationCandidate !== true) lane = TARGET_LANES.EXECUTION_FLOOR_VIABLE_GAP_WIDE;
else if (row.targetRecalibrationCandidate === true) lane = TARGET_LANES.TARGET_RECALIBRATION_CANDIDATE;
else lane = TARGET_LANES.TARGET_EVIDENCE_MISSING;
```

- [ ] **Step 3: Implement risk geometry classification**

Classify risk geometry evidence into:

```js
const RISK_LANES = {
  TARGET_RECALIBRATION_PROOF_READY: "risk_geometry_target_recalibration_proof_ready",
  RECALCULATED_STOP_PROOF_READY: "risk_geometry_recalculated_stop_proof_ready",
  REQUIRED_TARGET_TOO_HIGH: "risk_geometry_required_target_too_high",
  REQUIRED_STOP_INVALID: "risk_geometry_required_stop_invalid",
  EVIDENCE_MISSING: "risk_geometry_evidence_missing",
};
```

Rules:

```js
if (row.riskGeometryTargetRecalibrationProofReady === true) lane = RISK_LANES.TARGET_RECALIBRATION_PROOF_READY;
else if (row.riskGeometryRecalculatedStopRrOk === true && row.riskGeometryRequiredStopValid === true) lane = RISK_LANES.RECALCULATED_STOP_PROOF_READY;
else if (row.riskGeometryTargetAboveCurrent === false || row.riskGeometryRequiredTargetSource) lane = RISK_LANES.REQUIRED_TARGET_TOO_HIGH;
else if (row.riskGeometryRequiredStopValid === false || row.riskGeometryRequiredStopDistanceValid === false) lane = RISK_LANES.REQUIRED_STOP_INVALID;
else lane = RISK_LANES.EVIDENCE_MISSING;
```

- [ ] **Step 4: Implement breakout classification**

Classify breakout evidence into:

```js
const BREAKOUT_LANES = {
  PROOF_CONFIRMED_READY: "breakout_proof_confirmed_ready",
  REVIEW_READY_BUT_NOT_CONFIRMED: "breakout_review_ready_but_not_confirmed",
  REVIEW_READY_STALE_OR_EXTENDED: "breakout_review_ready_stale_or_extended",
  NOT_BREAKOUT_BLOCKED: "not_breakout_blocked",
};
```

Rules:

```js
if (row.breakoutRetestProofConfirmed === true) lane = BREAKOUT_LANES.PROOF_CONFIRMED_READY;
else if (row.breakoutRetestProofReviewReady === true && (row.breakoutRetestProofRetestFresh === false || row.breakoutRetestProofCurrentExtensionOk === false)) lane = BREAKOUT_LANES.REVIEW_READY_STALE_OR_EXTENDED;
else if (row.breakoutRetestProofReviewReady === true) lane = BREAKOUT_LANES.REVIEW_READY_BUT_NOT_CONFIRMED;
else lane = BREAKOUT_LANES.NOT_BREAKOUT_BLOCKED;
```

- [ ] **Step 5: Implement structure classification**

Classify structure proof into:

```js
const STRUCTURE_LANES = {
  CURRENT_RR_WEAK_KEEP_WAIT: "structure_current_rr_weak_keep_wait",
  TARGET_BUFFER_WEAK_KEEP_WAIT: "structure_target_buffer_weak_keep_wait",
  SUPPORT_PROOF_GAP: "structure_support_proof_gap",
  STRUCTURE_PROOF_CANDIDATE: "structure_proof_candidate",
  NOT_STRUCTURE_BLOCKED: "not_structure_blocked",
};
```

Rules:

```js
if (row.structurePolicyCurrentRrOk === false) lane = STRUCTURE_LANES.CURRENT_RR_WEAK_KEEP_WAIT;
else if (row.structurePolicyTargetBufferOk === false) lane = STRUCTURE_LANES.TARGET_BUFFER_WEAK_KEEP_WAIT;
else if (row.currentEntryStructureSupportReference && row.currentEntryStructureSupportGapAtr !== undefined) lane = STRUCTURE_LANES.STRUCTURE_PROOF_CANDIDATE;
else if (row.structurePolicyBlockerLane) lane = STRUCTURE_LANES.SUPPORT_PROOF_GAP;
else lane = STRUCTURE_LANES.NOT_STRUCTURE_BLOCKED;
```

- [ ] **Step 6: Write report-only safety flags**

Every output must include:

```json
{
  "safety": {
    "brokerMutationAllowed": false,
    "sidecarMutationAllowed": false,
    "executionPolicyChanged": false,
    "zeroExecutableFilterRelaxation": false
  }
}
```

---

## Task 2: Add Runnable Self-Check And npm Script

**Files:**
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/scripts/build-stage6-producer-tuning-2-audit.mjs`
- Modify: `/Users/givet-bsm/US_Alpha_Seeker/package.json`

- [ ] **Step 1: Add fixture self-check inside the script**

The script must expose or run a minimal self-check before writing output:

```js
const demoRows = [
  {
    symbol: "DEMO_TARGET",
    targetRecalibrationExecutionFloorViable: true,
    targetRecalibrationCandidate: false,
    targetNoTradeConfirmed: false,
  },
  {
    symbol: "DEMO_BREAKOUT",
    breakoutRetestProofReviewReady: true,
    breakoutRetestProofConfirmed: false,
    breakoutRetestProofRetestFresh: false,
    breakoutRetestProofCurrentExtensionOk: false,
  },
];
```

Expected assertions:

```js
assert.equal(classifyTarget(demoRows[0]), "target_execution_floor_viable_expected_return_gap_wide");
assert.equal(classifyBreakout(demoRows[1]), "breakout_review_ready_stale_or_extended");
```

- [ ] **Step 2: Add npm script**

Add this key to `/Users/givet-bsm/US_Alpha_Seeker/package.json`:

```json
"ops:stage6:producer-tuning-2:audit": "node scripts/build-stage6-producer-tuning-2-audit.mjs"
```

- [ ] **Step 3: Run audit script**

Run:

```bash
cd /Users/givet-bsm/US_Alpha_Seeker
npm run ops:stage6:producer-tuning-2:audit
```

Expected:

```text
[STAGE6_PRODUCER_TUNING_2_AUDIT] overall=...
```

---

## Task 3: Optionally Wire Audit Into Analysis Safety CI

**Files:**
- Optional Modify: `/Users/givet-bsm/US_Alpha_Seeker/.github/workflows/analysis-safety-ci.yml`

- [ ] **Step 1: Add a non-mutating audit step**

Add one step after the existing Stage6 formula audits:

```yaml
- name: Stage6 producer tuning 2 audit
  run: npm run ops:stage6:producer-tuning-2:audit
```

- [ ] **Step 2: Verify workflow syntax locally**

Run:

```bash
cd /Users/givet-bsm/US_Alpha_Seeker
python3 - <<'PY'
from pathlib import Path
import yaml
path = Path(".github/workflows/analysis-safety-ci.yml")
yaml.safe_load(path.read_text())
print("yaml_ok")
PY
```

Expected:

```text
yaml_ok
```

---

## Task 4: Validate Existing Stage6 Audit Chain

**Files:**
- Read-only: `/Users/givet-bsm/US_Alpha_Seeker/state/*.json`
- Read-only: `/Users/givet-bsm/US_Alpha_Seeker/docs/*.md`

- [ ] **Step 1: Run Stage6 formula validation**

Run:

```bash
cd /Users/givet-bsm/US_Alpha_Seeker
npm run ops:stage6:formula-tuning-backlog:validate
npm run ops:stage6:runtime-formula-contract:proof
```

Expected:

```text
pass
```

or a known waiting state such as:

```text
warn_stage6_runtime_proof_pending
```

- [ ] **Step 2: Run Stage3~6 full audit**

Run:

```bash
cd /Users/givet-bsm/US_Alpha_Seeker
npm run ops:stage3-6:full:audit
npm run ops:stage3-6:audit-group-summary
```

Expected:

```text
pass
```

or a lineage warning that is explicitly labeled as non-mutating audit evidence.

- [ ] **Step 3: Run build**

Run:

```bash
cd /Users/givet-bsm/US_Alpha_Seeker
npm run build
git diff --check
```

Expected:

```text
No TypeScript/Vite build failure.
No whitespace errors.
```

---

## Task 5: RTH Sidecar One-Shot Check

**Files:**
- Read-only: `/Users/givet-bsm/Documents/GitHub/alpha-exec-engine/state/*.json`
- Read-only: `/Users/givet-bsm/Documents/GitHub/alpha-exec-engine/docs/*.md`

- [ ] **Step 1: Wait until RTH and the next sidecar safe run exists**

Do not poll indefinitely. Check once after the RTH sidecar artifact is available.

- [ ] **Step 2: Confirm fresh hash consumption**

Confirm:

```text
previewStale=false
fresh Stage6/hash consumed
decisionAuditRows>0
payloadExpectation.status exists
topSkipReasonCategories exists
```

- [ ] **Step 3: Confirm safe mode**

Confirm:

```text
attempted=0
submitted=0
brokerMutationAttempted=false
brokerMutationSubmitted=false
```

- [ ] **Step 4: Stop if no actionable event**

If no payload or no unheld executable exists, stop. Do not keep monitoring.

---

## Task 6: ops-health Fail Separation

**Files:**
- Read-only: `/Users/givet-bsm/Documents/GitHub/alpha-exec-engine/state/ops-health-report.json`
- Read-only: `/Users/givet-bsm/Documents/GitHub/alpha-exec-engine/docs/ops-health-report.md`

- [ ] **Step 1: Classify ops-health blockers**

Separate blockers into:

```text
guard_metadata_missing_or_stale
protective_order_child_missing
position_ownership_unclear
ledger_terminal_reconciliation
entry_or_reprice_policy
```

- [ ] **Step 2: Keep guard/protective failures out of Stage6 tuning**

If ops-health is fail only because of guard metadata or protective order issues, record:

```text
opsHealthOverall=fail
stage6ProducerTuningBlocked=false
executionMutationAllowed=false
```

- [ ] **Step 3: Do not run broker repair**

Any protective repair remains blocked until a separate `CONFIRM LIVE EXECUTION` scoped request.

---

## Done-When Criteria

- `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-producer-tuning-2-audit.json` exists.
- `/Users/givet-bsm/US_Alpha_Seeker/state/stage6-producer-tuning-2-audit.md` exists.
- Audit output includes `safety.brokerMutationAllowed=false`.
- Target, risk geometry, breakout, and structure lanes are row-level and not collapsed into `other`.
- Existing Stage6 formula/runtime/full-stage audits still pass or emit documented waiting warnings.
- RTH sidecar check is performed once after RTH artifact exists.
- RTH sidecar check confirms `attempted=0/submitted=0`.
- ops-health fail is classified separately from Stage6 producer tuning.

