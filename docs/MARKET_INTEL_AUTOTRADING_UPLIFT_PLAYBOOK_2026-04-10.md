# Market Intel AutoTrading Uplift Playbook (2026-04-10)

## Objective
- Maximize reliability and upside for:
  - analysis
  - recommendation
  - simulation
  - execution automation
  - emergency response
  - self-healing

## North-Star Metrics
- Signal quality:
  - precision@topN
  - false-positive rate
  - skip reason explainability rate
- Execution quality:
  - fill-rate
  - slippage bps
  - preflight block correctness
- Risk quality:
  - max drawdown
  - tail loss frequency
  - emergency stop reaction time
- Operations quality:
  - pipeline success rate
  - state consistency rate
  - MTTR (incident recovery)

## Trend Radar (2026)
- Multi-horizon regime detection:
  - intraday / daily / macro regime blended gating
- AI + rules hybrid stack:
  - AI for context ranking, deterministic rules for execution safety
- Shadow-first rollout:
  - all new signals in shadow lanes before promotion
- Policy-as-data:
  - thresholds and kill-switches externalized and auditable
- Reliability engineering for trading:
  - marker audits, payload path verification, replay-driven regression tests

## Priority Research Themes

### 1) Technical signal stack uplift
- Structure:
  - trend + momentum + volatility + breadth
- Signal candidates:
  - breakout quality score
  - pullback quality score
  - volatility compression -> expansion trigger
  - relative strength rank over sector + index
- Validation:
  - walk-forward windows
  - symbol holdout split
  - regime-conditioned metrics

### 2) Portfolio + sector intelligence
- Sector rotation model:
  - risk-on/off sector weights by regime
- Position sizing:
  - conviction + volatility-adjusted sizing
- Correlation-aware cap:
  - avoid concentration by latent factor overlap
- Dynamic exposure control:
  - max gross/net exposure by guard level

### 3) Event/risk intelligence
- Earnings proximity policy:
  - pre-event reduction / no-new-entry windows
- News shock classifier:
  - negative event severity tiers
- Liquidity guard:
  - spread/volume gates before action intent

### 4) Self-healing and emergency automation
- Automated fallback tree:
  - provider failover
  - stale snapshot mitigation
  - safe degraded mode
- Incident auto-triage:
  - classify and route by root-cause class
- Recovery verification:
  - post-recovery replay and marker audit required

## Implementation Blueprint (for current codebase)

### Phase A: Data/feature reliability
- Normalize all sync paths to typed numeric helpers
- Add field fallback map for market pulse + candidate schema variants
- Add per-field fill-rate telemetry in run summary

### Phase B: Signal quality uplift
- Add shadow feature flags for new technical/sector signals
- Record before/after delta:
  - payload count
  - notional
  - skip reasons
  - downstream PnL proxies

### Phase C: Risk/portfolio control
- Add factor-concentration guard in stage6 contract layer
- Add dynamic stop/take adjustments by regime volatility bucket

### Phase D: Promotion gate hardening
- Promotion prerequisites:
  - shadow stability
  - payload path verification
  - sample size complete
  - no marker audit gaps

## Research Intake SOP (NotebookLM -> Obsidian -> Notion -> Code)
- Intake:
  - capture source, hypothesis, expected impact
- Qualification:
  - map to one of: precision / risk / ops
- Decision:
  - shadow-only / reject / defer
- Execution:
  - one-flag implementation + rollback path mandatory
- Evidence:
  - minimum 3 dry-run evidence sets before live promotion request

## Weekly Operating Cadence
- Mon:
  - update regime + sector hypothesis set
- Tue-Thu:
  - shadow experiments and evidence collection
- Fri:
  - review metrics and decide promote/defer/revert

## Immediate Next 5 Actions
- [ ] Add fill-rate telemetry report for Notion sync fields
- [ ] Add shadow feature flag pack for sector rotation hints
- [ ] Add concentration guard prototype (shadow-only)
- [ ] Add emergency reaction latency metric in ops-health
- [ ] Create promotion checklist page with required evidence links

## Guardrails
- No direct live-order path change without shadow evidence
- No threshold tuning without rollback switch
- No promotion when marker audit has missing keys
- No claim of improvement without before/after metric diff
