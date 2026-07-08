# Stage3-6 Fresh Evidence Audit Runbook

This runbook is for auditing a downloaded Auto-Scheduler `automation-evidence`
artifact without accidentally reading stale local files under `state/*-audit-source`.

## Scope

- Repository: `US_Alpha_Seeker`
- Mode: report-only
- Broker mutation: forbidden
- Sidecar mutation: forbidden
- Execution policy change: forbidden

## When To Use

Use this when GitHub Actions produced a fresh Stage6 hash and the local default
audit commands still show one of these stale-source states:

- `pending_fresh_stage6_after_expected_head`
- `pending_fresh_stage6_formula_v4_runtime_proof`
- `warn_formula_bottleneck_fields_missing` while the downloaded artifact shows
  fresh formula evidence

## Inputs

Download the Auto-Scheduler artifact first:

```bash
gh run download <AUTO_SCHEDULER_RUN_ID> --dir /tmp/us-alpha-run
```

The evidence directory is usually:

```text
/tmp/us-alpha-run/automation-evidence
```

It must contain:

- `stage6-dispatch-payload.json`
- `state/stage3-audit-source/`
- `state/stage4-audit-source/`
- `state/stage5-audit-source/`
- `state/stage6-audit-source/`

## Command

```bash
npm run ops:stage3-6:fresh-evidence:audit -- \
  --evidence-dir /tmp/us-alpha-run/automation-evidence
```

If the dispatch payload is missing `sourceSha`, pass it explicitly:

```bash
npm run ops:stage3-6:fresh-evidence:audit -- \
  --evidence-dir /tmp/us-alpha-run/automation-evidence \
  --expected-source-sha <HEAD_SHA>
```

## Expected Output

The command regenerates the local report-only audit outputs using the downloaded
fresh artifact as the source of truth:

- `state/stage6-fresh-focus-audit.json`
- `state/stage6-runtime-formula-contract-proof.json`
- `state/stage6-formula-tuning-backlog.json`
- `state/stage6-producer-tuning-2-audit.json`
- `state/stage3-6-full-stage-audit.json`
- `docs/STAGE6_FRESH_FOCUS_AUDIT.md`
- `docs/STAGE3_6_FULL_STAGE_AUDIT.md`

The final line should look like:

```text
[STAGE3_6_EVIDENCE_AUDIT] stage6File=... stage6Hash=... sourceSha=... full=pass_stage3_6_full_stage_audit freshFocus=pass_zero_executable_focus_fields_ok freshFocusRuntime=pass_formula_v4_runtime_proof
```

## Interpretation

If the fresh-evidence audit passes but the plain local audit still shows pending
fresh proof, the plain local audit is reading older local source files. Do not
tune Stage6 policy from the stale local result.

If both the fresh-evidence audit and the plain local audit fail, treat it as a
real Stage3-6 audit issue and inspect the generated JSON reports before changing
producer policy.

## Safety Boundary

This runbook only regenerates analysis-side audit reports. It does not authorize:

- broker submit,
- broker replace,
- broker reprice,
- sidecar state mutation,
- execution policy changes,
- filter relaxation to force executable picks.
