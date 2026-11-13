# Issue #68 — Scheduled installer `npm ci` migration, bounded Draft PR

## Audited historical source reason

- On 2026-02-04, [commit `0f24d612`](https://github.com/pungking/US_Alpha_Seeker/commit/0f24d6126aa8e62506ffd3b6f48e42b299d7a3f5) explicitly replaced scheduled `npm ci` with `npm install` due to a stated `package-lock.json` mismatch.
- Historical `package.json` at that commit declares `puppeteer ^22.0.0`, but the lockfile v2 root dependencies omit Puppeteer. This is an independently verified repository-level inconsistency, **not** a retrieved historical CI failure log. The exact 2026-02-04 failing CI error is **not recoverable from the checked sources**.
- The current merged main baseline `46c5e0e33d4bf9692b715e6cbec1fa67a63079b4` uses Node22, lockfile v3 with 355 package entries, and includes Puppeteer and `ws 8.21.3`. Both normal Linux/macOS CI `npm ci` pass with zero audit vulnerabilities.

## Installer parity proof — first Draft commit

- Standalone evidence-only first commit `011039a193bfc98edcfa7dc27eb25883c8affbdd` retained scheduled `npm install`. Its exact HEAD [CI #43485974268](https://github.com/pungking/US_Alpha_Seeker/actions/runs/43485974268) **SUCCESS**, with four separate jobs: Linux installer 7/7, macOS installer 7/7, full Linux analysis safety 49/49 and macOS Chrome 9/9 steps. These are GitHub Actions `pull_request` tests, not a manually dispatched analysis workflow.
- On Linux and macOS 15 ARM64: **Node 22.23.4, npm 10.9.9**, common committed lock SHA-256 `e083ee40bacd3dae6326a09e33ed59765e7125a550a1ad0e218fe7327af1b307`. In each OS, clean `npm ci --offline --ignore-scripts` and `npm install --offline --ignore-scripts` preserved byte-identical lock contents and produced identical `npm ls --all --json` graphs (each yielded **692 traversed graph nodes**). An intentionally incompatible Puppeteer manifest caused `npm ci` to reject, preserving the lock.
- The isolated npm cache is first seeded with `npm ci --ignore-scripts`: **the initial cache bootstrap can contact the public npm registry**. The paired comparison uses npm `--offline` and `--ignore-scripts`; no provider, broker, Google Drive, scheduler or business logic is invoked. This **does not prove lifecycle-hook parity, exact production browser revision, future registry behavior, or a complete live scheduled run**.

## Proposed source change — not activated until approved merge

- Following those measured cross-platform conditions, the **Draft-only** `.github/workflows/schedule.yml` proposal changes exactly the `alpha-mining` installation step from `npm install` to `npm ci`. Node22, Puppeteer browser installation, cron, triggers, readiness gates, external data providers, paid-call budgets and all other behavior remain untouched.
- For ongoing evidence with no additional GitHub-hosted runner cost, the parity fixture is added as a step in the **existing Linux analysis-safety and macOS Puppeteer jobs**, rather than two permanent new CI jobs. The final exact-HEAD CI must therefore pass both full jobs, including the same reproducibility fixture, after this source change.
- `npm ci` enforces a lockfile match instead of opportunistically modifying it. If the lockfile drifts in the future, the scheduled job must **fail closed**; the proper remedy is a separately reviewed lockfile regeneration and audit, not automatic dependency resolution, broad `npm audit fix` or weakening validation.

## Safety / limitations / rollback

- The intended source change alters dependency installation on future naturally triggered scheduled `alpha-mining` runs **only after separate user-approved source merge**. In this Draft state, the real main Workflow continues to use `npm install`.
- All source and fixture work is analysis-only. **No actual run/rerun/manual dispatch**, provider/Drive access, API secret handling, account/position/order state mutation, PAPER/LIVE, or workflow permissions change is authorized. Browser CDP/BiDi smoke remains a disposable data-only fixture in other existing CI jobs.
- A successful main push CI after potential merge will still **not** prove the real scheduled job or paid provider integrations. Issue #69 tracks observational runtime proof; Issue #61 remains open for overarching readiness.
- Rollback only in a separately approved reviewed PR: restore `npm install` in `schedule.yml`, remove or modify fixture CI steps if justified, rerun security and regression CI; do not revert merged PRs #60/#65/#67/#62 or mutate historical artifacts.
