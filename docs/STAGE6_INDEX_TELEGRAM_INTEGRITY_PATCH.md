# Stage6 Patch Plan: Index / Telegram Numeric Integrity

## Scope
- Target only index/telegram numeric integrity.
- Preserve existing Stage6 logic, UI design, ranking flow, and analysis methods.
- Do **not** change unrelated Stage3/4/5/6 scoring behavior in this patch.

## Progress (2026-03-05)
- [x] P0: Index/Telegram numeric integrity patch applied (`services/intelligenceService.ts`)
- [x] P1: Engine toggle/provider mismatch patch applied (`components/AlphaAnalysis.tsx`)
- [x] P2: Engine audit + manifest provider detail patch applied (`components/AlphaAnalysis.tsx`)
- [x] Runtime validation cycle complete (manual+autopilot end-to-end re-test)

## Problem Summary
1. Autopilot telegram can publish:
   - `S&P500: 0.00 (보합/확인중)`
   - `NASDAQ: 0.00 (보합/확인중)`
   - `VIX N/A`
2. Manual telegram can still miss VIX in some runs.
3. Root issue: `0` is treated as a valid number in some paths, so fallback fetch does not run.

## Root Cause (Code-level)
- `components/AlphaAnalysis.tsx`
  - `fetchMarketBenchmarks()` returns zero object on failure (cache gets zero values).
- `services/intelligenceService.ts`
  - `generateTelegramBrief()` only triggers fallback when value is `"N/A"`, not when value is `0.00`.
  - `pulse.vix` is not hydrated from `marketPulse`.

---

## Detailed Patch Proposal (Index/Telegram only)

### A) Normalize market value validity (single rule)
**File:** `services/intelligenceService.ts`  
**Function:** `generateTelegramBrief(...)`

Add local helper:
- `isValidIndexPrice(v) => Number.isFinite(v) && v > 0`
- `toSafePrice(v) => isValidIndexPrice(v) ? Number(v).toFixed(2) : "N/A"`

Rule:
- `0`, `NaN`, `null`, `undefined` are treated as missing values.
- Missing values must force fallback chain.

Checklist:
- [x] Add helper(s) at top of `generateTelegramBrief`.
- [x] Replace direct `(Number(x) || 0).toFixed(2)` usage for SPX/NDX/VIX.

---

### B) Fix pulse hydration (include VIX)
**File:** `services/intelligenceService.ts`  
**Function:** `generateTelegramBrief(...)`

Current:
- Reads `pulse.spy`, `pulse.qqq` only.

Patch:
- Also read `pulse.vix`.
- For change fields, support both:
  - `change`
  - `changePercent`

Checklist:
- [x] Hydrate `vix` from `pulse.vix.price`.
- [x] Hydrate `spxChg`, `ndxChg` from `change` or `changePercent`.

---

### C) Re-run fallback chain when value is invalid (not only `"N/A"`)
**File:** `services/intelligenceService.ts`  
**Function:** `generateTelegramBrief(...)`

Current:
- Fallback trigger uses string checks (`spx === "N/A"` / `ndx === "N/A"`).

Patch:
- Build `needsSpx`, `needsNdx`, `needsVix` using numeric validity.
- Trigger portal/fallback fetch if any needed.

Fallback order:
1. `marketPulse` (if valid)
2. `/api/portal_indices`
3. candidates (`SPY` / `QQQ`)
4. Finnhub (`SPY` / `QQQ`)
5. final output as `N/A` (not `0.00`)

Checklist:
- [x] Replace string-based missing checks with numeric validity checks.
- [x] Ensure VIX fallback is also attempted from portal indices.
- [x] Never emit fake `0.00` when source is missing.

---

### D) Prevent invalid benchmark contamination at source
**File:** `components/AlphaAnalysis.tsx`  
**Function:** `fetchMarketBenchmarks(...)`

Current:
- On portal failure returns zeros and caches them.

Patch:
- Keep return shape same (for compatibility), but mark invalid as `NaN` internally or skip cache update when invalid.
- Do not overwrite `(window as any).latestMarketPulse` with all-zero fallback.

Compatibility-safe approach:
- If portal fetch fails:
  - return fallback object
  - but **do not update** global pulse cache with invalid values.

Checklist:
- [x] Guard global cache update with validity check (`SPX/NDX > 0`).
- [x] Keep function signature and call sites unchanged.

---

## Acceptance Criteria
- [ ] Autopilot telegram does not print `S&P500: 0.00` / `NASDAQ: 0.00` when data is missing. (pending runtime verify)
- [ ] Missing values are shown as `N/A` and fallback fetch is attempted first. (pending runtime verify)
- [ ] VIX is included whenever pulse or portal provides it. (pending runtime verify)
- [ ] Manual and autopilot behavior is consistent for market pulse fields. (pending runtime verify)

## Regression Safety
- [ ] No changes to ranking weights or candidate selection logic.
- [ ] No UI layout/design changes.
- [ ] No changes to Stage4/5 data contracts.

## Test Plan (quick)
1. **Normal run**
   - portal indices available
   - expect non-zero SPX/NDX and VIX in telegram.
2. **Portal failure simulation**
   - force portal fetch fail
   - expect fallback values from candidates/finnhub, else `N/A` (never `0.00`).
3. **Pulse-only run**
   - provide marketPulse with SPX/NDX/VIX
   - expect telegram to use pulse values directly.
4. **VIX-missing pulse**
   - pulse has SPX/NDX only
   - expect portal attempt for VIX.

---

## Notes
- This patch intentionally does not modify Stage6 hard gate, trade-plan geometry, or AI coverage logic.
- Those will be handled in separate patch documents.
- P1/P2 were applied in parallel to keep engine/provider audit consistency:
  - `components/AlphaAnalysis.tsx` now records requested/actual/response engine in manifest.
  - `components/AlphaAnalysis.tsx` now logs `[AUDIT_ENGINE] ...` and detects provider mismatch in Top6.
