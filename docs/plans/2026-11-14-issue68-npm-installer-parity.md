# Issue #68 — Scheduled npm install vs npm ci deterministic resolution (Draft proof)

Baseline `46c5e0e33d4bf9692b715e6cbec1fa67a63079b4` (2026-11-14 KST). The proposed PR adds only a **provider-free** npm install fixture, targeted Linux/macOS CI jobs and this evidence document. It **does not change the real `alpha-mining` npm install command**, cron, Node 22, analysis pipeline, broker interfaces or state.

## Historical reason — original commit identified

- [2026-02-04 commit 0f24d612](https://github.com/pungking/US_Alpha_Seeker/commit/0f24d6126aa8e62506ffd3b6f48e42b299d7a3f5) changed `npm ci` to `npm install` with the explanation that package-lock and package.json disagreed.
- The `package.json` at that commit directly required `puppeteer: ^22.0.0`, while the top-level `package-lock.json` dependencies omitted Puppeteer. This is actual historical source-level mismatch evidence. The exact 2026-02-04 failing GitHub Actions job log was **not recovered**, so its error output remains unverified.
- The current lockfile is version 3, includes Puppeteer at root and resolves 355 package paths; the CI on merged PR #62 demonstrates clean Node22 `npm ci` and zero vulnerabilities on Linux/macOS. This is not evidence of parity with the separately configured scheduled `npm install`.

## Bounded parity experiment (no provider or analysis workflow)

- Each dedicated `ubuntu-latest` / `macos-15` CI job copies exactly the same committed `package.json` + `package-lock.json` into a disposable directory. It seeds an isolated npm cache using `npm ci --ignore-scripts`; **this bootstrap may contact the npm registry**. All further independent `npm ci --offline` and `npm install --offline` operations use this isolated cache and `--ignore-scripts`.
- Both modes must preserve the **exact lockfile bytes** and produce an identical installed dependency graph (`npm ls --all --json`), with same Node22 npm version on each OS. A deliberately incompatible Puppeteer manifest fixture must make `npm ci` reject rather than silently heal the mismatch; original lock bytes must survive.
- Compare **within each OS**, not installed optional native module trees across Linux and Mac. No `npm run automate`, browser launch, real Drive, provider, external analysis, paid request, credential or broker access. The fixture does not touch repo state beyond an isolated temporary directory. Existing normal CI `npm ci`, audit, build/typecheck and safety tests remain intact.
- On a cache miss/registry availability failure, or a real `npm install` lock mutation, parity **fails** and must not be waived. A success would prove installation-resolution parity **under these measured conditions**; it would *not* prove full lifecycle-script behavior, true scheduled runtime or future npm/registry behavior. A separate scoped review and explicit approval are needed before any production Workflow installer change.

## Acceptance and HOLD

- Exact-HEAD Linux and macOS isolated parity jobs plus existing CI must succeed; evidence must include npm/Node versions, original lock hash, installed graph count, bad-lock negative test and baseline source SHA.
- If tests fail, investigate reproducibly; do not force npm repair or broaden dependency upgrades to make a test green.
- PR remains **Draft/unmerged**. Keep parent Issue #61 OPEN; Issue #69 separately tracks already existing naturally scheduled operational evidence. Manual analysis dispatch or real provider/data mutation is not authorized.
- PAPER/LIVE/secret/variable/market guard or broker/position state controls remain **HOLD**. Do not infer trading or operational readiness from this fixture.

## Rollback

Close the unmerged Draft PR without touching main. If separately approved and merged, revert the fixture/test additions in a reviewed PR without changing production dependencies or scheduled run history.
