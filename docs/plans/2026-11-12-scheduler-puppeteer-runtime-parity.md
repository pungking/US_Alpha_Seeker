# Issue #61 — Scheduled Puppeteer runtime compatibility proof (bounded proposal)

Recorded 2026-11-12 KST. This is an **offline-focused proposal**, not permission to dispatch scheduled analysis or change live operational settings.

## Verified baseline and dependency
- Latest inspected source `main`: `b1fb609d762274c50824681f555095c78cf2b3b4`.
- This branch is **stacked on unmerged security Draft PR #60** (HEAD `18a9f98115cf786bf9dab65b79f425ad4a3f0c15`) so CI can exercise the patched, zero-audit dependency lock. **Do not merge this stacked PR before PR #60's separately approved merge and fresh rebase/retargeting.**
- `schedule.yml` job `alpha-mining` uses Node **20** at the baseline, yet `puppeteer-core 25.6.0` (baseline) and `25.13.0` (PR #60) both require Node `>=22.12.0`.
- Existing scheduled runner uses `npm install`, not `npm ci`, reportedly due to earlier lockfile incompatibility. **Do not silently switch the installer** without deterministic evidence and historical-context review.
- Existing override `ws@^8.0.0: 8.21.0` and locked `node_modules/ws 8.21.0` are below Puppeteer core's historical `^8.21.1` and security-PR `^8.21.3` requirements. The initial browser smoke from PR #60 is not proof of all WS features or scheduled execution. This remains **KNOWN_WS_OVERRIDE_HOLD**, not PASS.

## Changes in this stacked PR
1. Switch only `alpha-mining` setup-node from `20` to `22`; leave daily gate, cron, dispatch conditions, providers, accounts and credentials unchanged.
2. Add `scripts/test-scheduled-puppeteer-runtime-contract.mjs`, an offline static proof with synthetic Node20/21 and ws drift negatives. Print a **separate explicit HOLD** for the known ws mismatch instead of falsely treating global CI success as WS compatibility.
3. Add `scripts/test-scheduled-puppeteer-offline-browser.mjs`: disposable CI Chrome launch using CDP and WebDriver BiDi, a single `data:` HTML document, blocked HTTP(S) page requests and no keys/external providers. Its `--no-sandbox` flag applies only inside the CI fixture, not to the production workflow.
4. Register both checks in the pre-existing PR-only `analysis-safety-ci.yml` workflow following `npm ci` and audit. The browser fixture must fail rather than claim success if Chrome is absent or cannot start.
   - CI browser selection first checks Puppeteer's managed binary, then the **already installed** GitHub runner system Chrome/Chromium. The 2026-11-12 Ubuntu runner image documents system Chrome **156.0.8078.79** while Puppeteer 25.13.0 prefers Chrome 155; tests therefore demonstrate disposable compatibility, **not exact preferred-browser revision parity**. The fixture does not download Chrome, and asserts zero HTTP(S) requests from its test page. It is not a full operating-system egress sandbox.

## Acceptance, risk and next boundary
- Tests and exact-HEAD GitHub CI must complete. If Chrome smoke fails, report the blocker and correct only within this isolated PR without weakening other checks.
- Scheduled Node22 *source* configuration is not operational runtime proof. New main push CI after a user-approved merge is necessary but not a live analysis/Chrome/paid provider end-to-end attestation.
- Updating Node20->22 affects future scheduled workflow environment **only if separately source-merged** and may have runtime compatibility risk for code outside this fixture. A direct production workflow rerun is NOT allowed by this PR.
- `ws` override requires a separate, reproducibly npm-generated override+lockfile patch (recommended `8.21.3` or a tested supported security-compatible version), all-dependent graph verification, offline network-restricted browser smoke, `npm ci`, `npm audit` and full CI. Do not fake lock integrity fields, weaken existing security overrides, or force the dependency graph.
- Resolve the existing `npm install`/lockfile reproducibility gap only in a separate reviewed change after a clear historical reason and offline performance/compatibility test; no schedule or provider changes.
- Existing `AGENTS.md` safety, broker/order HOLD and explicit user PR-specific merge authorization remain effective.

## Rollback
Revert this proposed schedule/fixture change via a separate reviewed PR; retain all prior security/audit artifacts and do not rewrite production run history.
