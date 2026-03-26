# Stage6 Patch Plan: Label Consistency + Output Contract Stability

Doc-Tier: P2 (Engineering)


## Scope
- Target only the two requested issues:
  1) Telegram index label consistency (`NASDAQ` vs `NASDAQ100`)
  2) Stage6 final JSON contract stability for downstream consumers
- Add Telegram contract-first rendering to reduce Stage6/Telegram drift.
- Keep Stage6 scoring/ranking/selection logic unchanged.
- Keep Stage3/4/5 logic and UI design unchanged.

## Requested Items
1. **Review only** (no code change required in this patch)
2. **Label consistency**  
   - File: `services/intelligenceService.ts`
   - Fix mixed output label in Telegram brief text.
   - Data-fetch logic remains unchanged.
3. **Stage6 JSON contract stability**
   - File: `components/AlphaAnalysis.tsx`
   - In final `alpha_candidates`, ensure:
     - `finalVerdict` mirrors `aiVerdict`
     - `entryPrice` mirrors quant trade-box entry (`otePrice` first)
     - `targetPrice` mirrors quant trade-box target (`targetMeanPrice` first)
   - No scoring formula change.

## Patch Design

### 0) Review-only item
- Confirmed: requested item #1 remains review-only for this cycle.

### A) Telegram label normalization (output-only)
**File:** `services/intelligenceService.ts`  
**Function:** `generateTelegramBrief(...)`

- Add a small normalization step to enforce a single display label:
  - English: `NASDAQ` -> `NASDAQ100` (when not already `NASDAQ100`)
  - Korean: `나스닥` -> `나스닥100` (when not already `나스닥100`)
- Apply to AI-generated `macroSection` only (output text hygiene).
- Do not change index hydration, fallback fetch, or value calculations.

Checklist:
- [x] Add label normalizer helper in `generateTelegramBrief`.
- [x] Normalize `macroSection` before final report composition.

---

### B) Stage6 output contract mirrors (downstream-safe)
**File:** `components/AlphaAnalysis.tsx`  
**Flow:** Stage6 Top6 finalization (before cache/archive)

- Add a post-processing mirror pass for Top6 only:
  - `finalVerdict = aiVerdict`
  - `entryPrice = otePrice` (fallback: `supportLevel`, existing `entryPrice`)
  - `targetPrice = targetMeanPrice` (fallback: `resistanceLevel`, existing `targetPrice`)
  - If `targetMeanPrice` is missing but `targetPrice` is resolved, backfill `targetMeanPrice` with the same numeric target.
- This is payload-contract stabilization only; no score math, ranking, or AI merge changes.

Checklist:
- [x] Add small mirror function for Top6 candidate payload.
- [x] Apply mirror function to `top6Elite` before `setResultsCache` and final archive payload.

## Acceptance Criteria
- [ ] Telegram `Market Pulse` no longer mixes `NASDAQ`/`NASDAQ100` label in output text.
- [ ] `STAGE6_ALPHA_FINAL_*.json` `alpha_candidates[*]` always includes stable:
  - `finalVerdict`
  - `entryPrice`
  - `targetPrice`
- [ ] Telegram candidate block prefers Stage6 contract fields:
  - verdict: `finalVerdict -> aiVerdict -> verdict`
  - plan: `entryPrice/targetPrice/stopLoss` (with quant fallbacks)
  - return: `gatedExpectedReturn -> expectedReturn`
  - logic: `selectionReasons[0..2]` 그대로 사용(없을 때만 fallback)
- [ ] Index helper symbols (`SPY/QQQ/VIX/SPX/NDX/...`) are excluded from Top6 section.
- [ ] Company name truncation no longer cuts meaningful names (e.g. `Joint Stock ...`).
- [ ] No change in Top6 ranking order for same input snapshot.
- [ ] No changes in Stage6 gate/scoring logs besides unchanged baseline.

---

## C) Telegram contract-first rendering (output-only hardening)
**File:** `services/intelligenceService.ts`  
**Function:** `generateTelegramBrief(...)`

Goal: keep message structure 100% unchanged while reducing mismatch against Stage6 `alpha_candidates`.

Applied changes:
- [x] Top6 generation now excludes index helper symbols.
- [x] Verdict mapping now prefers `finalVerdict` (fallback `aiVerdict`, `verdict`).
- [x] Plan mapping now prefers `entryPrice/targetPrice/stopLoss` (quant-authoritative fallbacks remain).
- [x] Return mapping now prefers `gatedExpectedReturn`.
- [x] Logic 3-line block now uses `selectionReasons[0..2]` directly (fallback only when missing).
- [x] Name cleaner changed to strip only trailing legal suffixes (no mid-name truncation).
