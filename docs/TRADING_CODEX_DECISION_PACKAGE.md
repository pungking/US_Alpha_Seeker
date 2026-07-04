# TradingCodex Decision Package

## Purpose

A Decision Package is the minimum evidence bundle required before saying a
candidate is actionable, waiting, blocked, or ready for a separately approved
execution lane.

It prevents the system from treating a ticker list as a trade decision.

## Package Levels

| Level | Use | Mutation allowed |
| --- | --- | --- |
| Research Package | Stage0-6 analysis and blocker classification | No |
| Sidecar Package | Dry-run consumption, fillability, market guard, no-mutation proof | No |
| Approval Package | Paper/live mutation request with exact scope and rollback | Only after explicit approval |

## Required Research Package Evidence

| Evidence | Source |
| --- | --- |
| Stage6 file name and hash | `STAGE6_ALPHA_FINAL_*.json` or dispatch payload |
| Source run/head commit | Auto-Scheduler artifact |
| Candidate verdict | Stage6 row |
| Entry/stop/target geometry | Stage6 row |
| Weak-pillar status | Stage6 row and Stage6 audits |
| Quality gate lane | `qualityGateLane` or Stage6 audit |
| Zero-executable lane | `zeroExecutableTuningLane` and fresh-focus audit |
| Target recalibration verdict | Stage6 row and formula backlog |
| Risk geometry verdict | Stage6 row and formula backlog |
| Breakout proof status | Stage6 row and runtime proof |
| Earnings/data freshness | Stage6/Stage4/Harvester lineage reports |

## Required Sidecar Package Evidence

| Evidence | Source |
| --- | --- |
| Consumed Stage6 hash | `last-dry-exec-preview.json` or decision audit |
| Preview stale status | Sidecar preview/source fields |
| Decision audit row count | `last-order-decision-audit.json` |
| Payload expectation | `last-order-decision-audit.json` |
| Top skip categories | `last-order-decision-audit.json` |
| Fillability result | `fillability-report.json` |
| Market guard status | `last-market-guard.json` |
| Broker mutation flags | preview, fillability, live-readiness scorecard |
| State mutation flags | live-readiness scorecard |

## Required Approval Package Evidence

Approval Package is owned by `alpha-exec-engine`, not `US_Alpha_Seeker`.

It must include:

- Exact approval phrase for the requested lane.
- Environment: `PAPER` or `LIVE`.
- Selected dynamic row, not hard-coded operating policy.
- Max orders and max notional.
- Idempotency evidence.
- Broker visibility plan.
- Rollback plan.
- Post-submit verification plan.

Without that package, the answer is report-only.

## Decision Outcomes

| Outcome | Meaning | Next action |
| --- | --- | --- |
| `ACTIONABLE_RESEARCH` | Stage6 evidence supports a candidate | Send to sidecar dry-run only |
| `WAIT_PRICE` | Candidate is good but entry is not ready | Keep in watch/wait lane |
| `NO_TRADE` | Target/risk/current geometry invalid | Recalibrate or drop |
| `BLOCKED_DATA` | Source freshness or lineage is weak | Fix data owner first |
| `BLOCKED_POLICY` | Verdict, weak pillar, or proof gate blocks | Tune producer or keep wait |
| `BLOCKED_EXECUTION_CONTRACT` | Sidecar cannot safely classify | Fix Stage6/sidecar contract |
| `APPROVAL_REQUIRED` | Broker mutation could be considered | Require scoped approval |

## Package Checklist

Before moving beyond research:

- [ ] Stage6 hash is known.
- [ ] Source run/head is known.
- [ ] Stage6 row has finite entry/stop/target or an explicit no-trade reason.
- [ ] Verdict is actionable or explicitly waived.
- [ ] Weak-pillar gate is not silently bypassed.
- [ ] Breakout review-ready is not promoted without proof-confirmed evidence.
- [ ] Target already reached is handled by Stage6 recalibration/no-trade, not sidecar chase.
- [ ] Sidecar consumed the same hash.
- [ ] Sidecar mutation flags are false unless a scoped approval package exists.

## Minimal Report Format

```text
Decision Package
- Stage6: <file> / <hash> / <head>
- Candidate scope: <all rows | selected row | none>
- Research outcome: <ACTIONABLE_RESEARCH | WAIT_PRICE | NO_TRADE | BLOCKED_*>
- Primary lane: <quality_gate | structure | breakout | target_recalibration | risk_geometry | data_freshness | fillability>
- Sidecar outcome: <payload_ready | no_payload_expected | blocked_by_* | not_checked>
- Mutation: attempted=0 submitted=0
- Next owner: <Stage3 | Stage4 | Stage5 | Stage6 | Harvester | Sidecar | User approval>
```

## Non-Goals

- Do not create a second signal artifact.
- Do not bypass Stage6.
- Do not promote a candidate because a package is incomplete.
- Do not use Decision Package language as execution approval.
