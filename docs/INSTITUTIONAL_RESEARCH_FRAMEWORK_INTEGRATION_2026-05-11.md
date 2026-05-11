# Institutional Research Framework Integration Plan

GeneratedAt: 2026-05-11 (KST)
Scope: `US_Alpha_Seeker` Stage0-6 analysis contract first; sidecar consumption second
Source prompt: `docs/prompts/INSTITUTIONAL_GLOBAL_EQUITY_RESEARCH_PROMPT.md`

## 1) Verdict

The prompt is useful, but not as a runtime free-text prompt inside the execution sidecar. It should be decomposed into a deterministic research contract that enriches Stage0-6 and only then exposes bounded numeric/enum fields to the sidecar.

Directly feeding the full narrative into order creation would be a design error: it would add latency, hallucination risk, and non-reproducible trade geometry. The correct application is:

1. Stage0-3: identity, source quality, financial quality, peer/industry context.
2. Stage4-6: valuation, event, macro, supply-demand, sentiment, and uncertainty overlays.
3. Sidecar: consume only validated Stage6 numeric/enum outputs for entry/target/stop, admission, reprice, and monitoring.

## 2) Prompt Elements Worth Applying

| Prompt element | Where it belongs | Contract effect | Execution effect |
| --- | --- | --- | --- |
| Company/ticker/exchange/currency verification | Stage0 universe identity | Reject ambiguous/security-mismatched records | Prevent wrong-symbol orders |
| Official source priority | Stage2/3 data quality | `sourceQualityScore`, `sourceCoverageFlags` | No direct order effect |
| 3-5 year financial quality | Stage2/3 | quality-of-earnings, FCF, leverage, working-capital flags | Affects candidate rank and confidence |
| Industry cycle and moat | Stage3/6 | `industryCycle`, `moatScore`, peer-relative rank | Affects conviction, not raw price |
| Valuation vs peers/history/market | Stage6 | `valuationBand`, `valuationRisk`, target confidence | Target/ER credibility check |
| Earnings/call/guidance | Stage6 event gate | earnings freshness, guidance trend, event risk | Blocks/reduces entries around unverified event windows |
| Macro/policy/regulation/geopolitics | Stage6 regime overlay | `macroRiskFlags`, `policyRiskFlags` | Can downgrade action to watch/hold |
| Supply-demand/investor psychology | Stage4/5/6 | institutional flow, short interest, options stress flags | Monitoring priority and fillability context |
| Catalyst/risk probability-impact timing | Stage6 | catalyst matrix and thesis invalidation fields | Sidecar lifecycle monitoring inputs |
| Self-rebuttal / uncertainty | Stage6 | `uncertaintyFlags`, `dataGapFlags`, `thesisInvalidation` | Blocks aggressive reprice/scale-up if unresolved |

## 3) Elements That Must Not Be Applied Directly

| Element | Why not | Correct handling |
| --- | --- | --- |
| Free-form AI conclusion as buy/sell trigger | Non-deterministic and hard to audit | Convert to enum fields after validation |
| Unverified latest news claims | High hallucination/data drift risk | Require source timestamp and freshness flag |
| DCF narrative as exact target | False precision | Use as target-confidence overlay, not sole target |
| “Good company” language | Does not imply good trade | Separate business quality from current entry geometry |
| Full prompt inside sidecar | Execution engine must be deterministic | Sidecar consumes only Stage6 contract fields |

## 4) Stage0-6 Contract Additions

Recommended new optional block on each Stage6 candidate:

```json
{
  "institutionalResearch": {
    "schemaVersion": "institutional_research_v1",
    "analysisDate": "2026-05-11",
    "baseCurrency": "USD",
    "sourceQualityScore": 0,
    "sourceCoverageFlags": [],
    "dataGapFlags": [],
    "peerSet": [],
    "industryCycle": "unknown",
    "moatScore": null,
    "qualityOfEarnings": {
      "fcfConversion": null,
      "workingCapitalRisk": "unknown",
      "inventoryRisk": "unknown",
      "receivablesRisk": "unknown",
      "leverageRisk": "unknown"
    },
    "valuationBand": "unknown",
    "valuationRisk": "unknown",
    "earningsFreshness": "unknown",
    "guidanceTrend": "unknown",
    "macroRiskFlags": [],
    "policyRiskFlags": [],
    "geopoliticalRiskFlags": [],
    "supplyDemandFlags": [],
    "sentimentPositioningFlags": [],
    "catalystMatrix": [],
    "riskMatrix": [],
    "keyVariables": [],
    "selfRebuttal": [],
    "thesisInvalidation": []
  }
}
```

Rules:

- Missing data must remain `null`/`unknown`; never coerce to zero.
- Every non-derived field must carry a source or source-quality flag in the upstream data layer.
- Stage6 ranking may use these fields only through bounded score deltas and explicit reason codes.
- Stage6 price geometry (`entry`, `target`, `stop`) remains numeric and must not be generated from narrative text.

## 5) Trade Plan Contract Additions

The current failure mode is not simply “too conservative.” It is that Stage6 sometimes emits idealized pullback entries while the sidecar later has to decide whether any realistic order can be placed without destroying RR. The prompt helps only if it becomes a structured trade-plan explanation:

```json
{
  "tradePlan": {
    "schemaVersion": "trade_plan_v1",
    "entryTactic": "PULLBACK_LIMIT",
    "entryZoneLow": null,
    "entryZoneHigh": null,
    "entryReason": "support_retest",
    "breakoutAlternativeAllowed": false,
    "targetBase": null,
    "targetBull": null,
    "targetBear": null,
    "stopTechnical": null,
    "stopInvalidationReason": null,
    "rrAtEntry": null,
    "rrAtCurrent": null,
    "maxChaseAllowedPct": null,
    "monitoringPriority": "normal",
    "nextReviewTrigger": []
  }
}
```

Sidecar may consume only these fields after validation:

- `entryTactic`
- `entryZoneLow` / `entryZoneHigh`
- `breakoutAlternativeAllowed`
- `targetBase`
- `stopTechnical`
- `rrAtEntry` / `rrAtCurrent`
- `maxChaseAllowedPct`
- `monitoringPriority`
- `nextReviewTrigger`

## 6) Implementation Sequence

### P0-A: Prompt preservation and contract freeze

- Keep normalized prompt in `docs/prompts/INSTITUTIONAL_GLOBAL_EQUITY_RESEARCH_PROMPT.md`.
- Treat the prompt as a research checklist, not executable logic.
- Add `institutionalResearch` and `tradePlan` as optional Stage6 contract blocks.

### P0-B: Stage6 blocker policy review

- Use recent Stage6 blocker audits to classify zero-executable days into:
  - normal event blackout,
  - missing earnings data overblock,
  - entry model too deep,
  - stop/target geometry policy error,
  - data-source freshness issue.
- Fix Stage6 only after the blocker class is known.

### P1-A: Data enrichment

- Add peer/industry/valuation/financial-quality inputs only where data sources are reliable.
- Unknown or stale fields should lower confidence or produce `HOLD_WAIT`, not fabricate values.

### P1-B: Sidecar consumption

- Sidecar changes must be a separate task after the Stage6 contract exists.
- Sidecar should use the reduced numeric/enum fields for admission, reprice, and monitoring.
- No free-text prompt output may bypass idempotency, preflight, market clock, portfolio caps, or RR floor.

### P2: Reporting and Notion

- Store full institutional narrative in Notion/Obsidian if useful.
- Store only reduced fields in execution artifacts and telemetry.

## 7) Priority Fixes Derived From The Prompt

1. **Data uncertainty discipline**: missing earnings dates must not serialize as D-0 or silently become event blocks.
2. **Good company vs good stock split**: Stage6 must distinguish business quality from current trade geometry.
3. **Peer-relative valuation**: targets should be confidence-weighted by valuation context, not only technical resistance.
4. **Catalyst timing**: executable status should degrade near unverified catalyst/event windows.
5. **Self-rebuttal fields**: repeated zero-fill or zero-executable cases should carry explicit “what would invalidate this trade plan” reasons.
6. **Monitoring triggers**: each admitted symbol must state what data changes would cause hold, reprice, scale, reduce, or exit.

## 8) Risks & Controls

| Risk | Control |
| --- | --- |
| Prompt turns into subjective trade override | Reduced schema only; sidecar ignores free text |
| More fields create schema drift | Optional versioned blocks; no breaking Stage6 fields |
| Data costs/latency increase | Cache enrichment and degrade gracefully to unknown |
| False precision in DCF/valuation | Use bands and confidence, not exact order prices |
| Overblocking due to unknown data | Distinguish unknown-but-acceptable from hard event risk |

## 9) Done-When Criteria

- Stage6 output can explain, per candidate, business quality, stock attractiveness, valuation risk, event risk, data gaps, and trade geometry separately.
- Recent zero-executable days can be classified without manual guesswork.
- Sidecar receives deterministic fields for entry/reprice/monitoring and no longer needs to infer strategy from narrative text.
- Telegram/Notion can show: why selected, why blocked, what would change the decision, and what the next monitoring trigger is.
- Safe defaults remain unchanged: `READ_ONLY=true`, `EXEC_ENABLED=false`, and sidecar execution flags are not modified by this plan.
