# Issue #61 — Scheduled Puppeteer runtime source compatibility proposal

Updated 2026-11-14 KST after user-approved security PR #60, Drive-token PR #65 and ws override PR #67 merges. This is a **source-only, offline-verified proposal**. PR #62 is **Draft/unmerged**; no authorization for an actual scheduled provider run or PAPER/LIVE execution is implied.

## Baseline, lineage and scope

- Current main baseline at reconciliation: `cc6d822b5d4c35fd5f5bf4026b02ce22526af56e`. PR #60 and PR #65 are already merged; **both security audit and Drive-token polling regression steps must remain in CI**.
- Dependency PR #67 merged with `ws@^8.0.0 -> 8.21.3`; `puppeteer-core 25.13.0` requires `ws ^8.21.3`; `@google/genai 1.39.0` requires `ws ^8.18.0`. These declarations are satisfied in the merged lockfile. The offline contract now **fails** if a previously known ws mismatch recurs rather than printing an acceptable HOLD.
- Current main scheduled `alpha-mining` job still uses Node **20**, while Puppeteer requires **>=22.12.0**. This PR changes **only this job's** `actions/setup-node` major to `22`. It does not change the separate jobs, cron, triggers, provider integrations, budgets, stage gates, auth flows, Secrets, or trading HOLD.
- The scheduled job still uses `npm install` because of a historical lockfile-mismatch comment. This PR deliberately leaves it unchanged. npm CI reproducibility and the scheduled installer are separate proof boundaries.

## Offline integration evidence and tests

1. The existing `analysis-safety` Ubuntu job retains merged PR #65's Drive token rotation and web bundle steps and adds Node engine/ws and disposable Chrome CDP/BiDi tests before those existing steps.
2. A **separate targeted macOS GitHub-hosted CI job** runs Node22, clean `PUPPETEER_SKIP_DOWNLOAD=true npm ci`, static engine/ws contract and disposable CDP/BiDi Chrome smoke. It uses only browser executables already installed on the runner; no Puppeteer browser download and no provider credentials. Do not mistake npm package downloads for a full network isolation proof.
3. Browser path discovery awaits the Puppeteer 25 async `executablePath()` and accepts explicit `PUPPETEER_EXECUTABLE_PATH`, Linux system paths, and macOS application binaries. Invalid explicit paths fail closed. Linux CI's `--no-sandbox` flags apply only to the disposable CI fixture and are **not** set in the scheduled production workflow. macOS does not receive those Linux-only flags.
4. Both browser protocols navigate only a local `data:` HTML fixture; browser page HTTP(S) requests are intercepted, denied and counted. This is not an OS-level egress firewall and does **not** certify a provider-integrated production run.
5. CI must prove Linux and macOS exact-head results; failure or missing Chrome is a blocker and cannot be waived as PASS. The already observed Linux Chrome and current macOS system Chrome are **not guaranteed to equal Puppeteer's preferred Chrome 155.0.8059.39** for v25.13.0. Smoke success only verifies exercised behavior.

## Merge, risks, and rollback

- Do not merge PR #62 without a **distinct user PR-specific source-merge approval**, an independent exact-HEAD code review and GitHub CI checks.
- Merging this source-only PR would alter future scheduled job Node runtime. It is **not** permission to trigger or manually replay any actual analysis, change providers, modify Google Drive, or enable PAPER/LIVE. These permissions remain separately gated.
- After source merge, verify fresh new-main push CI. Keep broader Issue #61 open until scheduled installer and operational runtime evidence are separately verified without weakening HOLD.
- Rollback is a separately approved reviewed revert; do not rewrite Git history or revert merged security/Drive-token fixes. Reverting Node22 restores the known unsupported Node20/Puppeteer engine mismatch.
