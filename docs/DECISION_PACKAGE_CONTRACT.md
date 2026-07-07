# Decision Package Contract

Operating model: `docs/TRADING_CODEX_OPERATING_MODEL.md`.

## Purpose

A Decision Package is the minimum evidence bundle required before US Alpha
Seeker can classify a row, run, or workflow as actionable research, wait,
no-trade, blocked, or approval-required.

This contract prevents a ticker, ranking, or Telegram message from being treated
as a trade decision.

## Package Levels

| Level | Owner | Purpose | Mutation allowed |
| --- | --- | --- | --- |
| Research Package | `US_Alpha_Seeker` | Stage0-6 evidence and policy classification | No |
| Sidecar Package | `alpha-exec-engine` | Dry-run/fillability/market guard/no-mutation proof | No |
| Approval Package | `alpha-exec-engine` | Scoped paper/live broker or state mutation review | Only after exact approval |

## Universal Invariants

Every package must state:

- package level,
- source repo,
- source workflow/run id,
- source head commit,
- source artifact file,
- source artifact hash,
- generated timestamp,
- decision scope,
- mutation status,
- next owner.

If any of these are unknown, the package cannot support promotion beyond its
current level.

## Research Package Contract

Research Package is produced from Stage artifacts. It can support analysis,
watch/wait decisions, and sidecar dry-run handoff. It cannot authorize broker
mutation.

Required evidence:

| Evidence | Source |
| --- | --- |
| Stage6 file and hash | `STAGE6_ALPHA_FINAL_*.json`, dispatch payload |
| Source run/head | Auto-Scheduler artifact |
| Candidate row scope | Stage6 row or audit row |
| Verdict normalization | Stage6 row |
| Entry/stop/target finite geometry | Stage6 row |
| Weak-pillar gate | Stage6 row and audit |
| Quality gate lane | `qualityGateLane`, fresh-focus audit |
| Zero-executable lane | `zeroExecutableTuningLane`, fresh-focus audit |
| Structure proof | `structurePolicy*`, `currentEntryStructure*` |
| Breakout proof | `breakoutRetestProof*` |
| Target recalibration | `targetRecalibration*` |
| Risk geometry | `riskGeometry*` |
| Earnings/data freshness | Stage4/Stage6/Harvester lineage reports |

Research outcomes:

| Outcome | Meaning | Next owner |
| --- | --- | --- |
| `ACTIONABLE_RESEARCH` | Stage6 supports a candidate for sidecar dry-run | Sidecar Package |
| `WAIT_PRICE` | Candidate is valid research but entry is not ready | Stage6/watchlist |
| `NO_TRADE` | Geometry or target state invalidates entry | Stage6 formula owner |
| `BLOCKED_DATA` | Freshness or lineage is insufficient | Harvester/Stage owner |
| `BLOCKED_POLICY` | Verdict/proof/weak-pillar gate blocks | Stage6 policy owner |
| `BLOCKED_CONTRACT` | Downstream cannot classify without guessing | Stage6.5 contract owner |

## Stage3-6 Evidence Ownership

The Research Package must carry enough evidence for a reviewer to map every Stage6 blocker to one owner.

| Evidence field | Required when | Specialist owner | Valid package outcome |
| --- | --- | --- | --- |
| `zeroExecutableTuningLane` | Any zero-executable or no-payload analysis | Formula Evidence Analyst | `BLOCKED_POLICY`, `NO_TRADE`, or `WAIT_PRICE` |
| `qualityGateLane` | Verdict, weak pillar, coverage, event, or quality issue | Alpha Policy Analyst | `BLOCKED_POLICY` or `BLOCKED_DATA` |
| `structurePolicyBlockerLane` | `wait_structure_confirmation_required` or structure reject | Structure Analyst | `WAIT_PRICE` or `BLOCKED_POLICY` |
| `riskGeometryRepairLane` | Stop/target/RR geometry issue | Alpha Policy Analyst | `NO_TRADE` or `BLOCKED_POLICY` |
| `targetRecalibrationViabilityVerdict` | Target near/current/reached or target refresh issue | Alpha Policy Analyst | `NO_TRADE` or `WAIT_PRICE` |
| `breakoutRetestProofConfirmed` | Breakout/retest wait or promotion review | Structure Analyst / Alpha Policy Analyst | `WAIT_PRICE` until proof confirmed and promotion policy allows it |

If a Sidecar Package has no payload, it should cite these Research Package fields through `topSkipReasonCategories` and `payloadExpectation` rather than inventing a new alpha reason.

## Sidecar Package Contract

Sidecar Package proves the execution sidecar consumed the same hash and did not
mutate broker or state unless a separate approval lane exists.

Required evidence:

| Evidence | Source |
| --- | --- |
| Consumed Stage6 file/hash | `last-dry-exec-preview.json`, decision audit |
| Preview stale status | Sidecar preview/source fields |
| Decision audit row count | `last-order-decision-audit.json` |
| Payload expectation | decision audit summary |
| Top skip categories | decision audit summary |
| Fillability status | `fillability-report.json` |
| Market guard status | `last-market-guard.json` |
| Broker mutation flags | preview/fillability/live-readiness reports |
| State mutation flags | live-readiness/state audit reports |

Sidecar outcomes:

| Outcome | Meaning | Next owner |
| --- | --- | --- |
| `PAYLOAD_READY_REPORT_ONLY` | Payload could exist but mutation is not approved | User/approval lane |
| `NO_UNHELD_EXECUTABLE` | No new executable unheld candidate | Stage6 producer if repeated |
| `NO_PAYLOAD_EXPECTED` | No payload by policy | End or Stage owner |
| `BLOCKED_FILLABILITY` | Entry/fillability/risk blocks | Stage6/Sidecar contract owner |
| `BLOCKED_MARKET_GUARD` | Guard blocks entry | Sidecar risk owner |
| `BLOCKED_STATE` | Ledger/idempotency/guard metadata issue | Sidecar state owner |

## Approval Package Contract

Approval Package belongs to `alpha-exec-engine`. It is required for paper/live
broker mutation or state mutation.

It must include:

- exact approval phrase,
- environment and account class,
- selected dynamic row,
- max orders and max notional,
- market-open requirement,
- idempotency plan,
- broker visibility plan,
- rollback plan,
- post-submit or post-migration verification.

Approval is narrow. It does not authorize future runs, different symbols,
different accounts, different repos, or permanent policy changes.

## Decision Package Minimal Shape

```json
{
  "schemaVersion": "decision_package.v1",
  "packageLevel": "research",
  "sourceRepo": "US_Alpha_Seeker",
  "sourceRunId": "<run-id>",
  "sourceHeadSha": "<sha>",
  "sourceArtifact": "STAGE6_ALPHA_FINAL_*.json",
  "sourceArtifactHash": "<sha256>",
  "decisionScope": "all_stage6_rows",
  "researchOutcome": "WAIT_PRICE",
  "primaryLane": "target_recalibration",
  "sidecarOutcome": "not_checked",
  "brokerMutationAttempted": false,
  "brokerMutationSubmitted": false,
  "stateMutationAttempted": false,
  "nextOwner": "Stage6",
  "evidence": {
    "zeroExecutableTuningLane": "TARGET_RECALIBRATION",
    "targetRecalibrationViabilityVerdict": "target_no_trade_confirmed"
  }
}
```

## Required Report Format

Use this format in summaries and handoffs:

```text
Decision Package
- Level: <Research | Sidecar | Approval>
- Source: <repo> / <run> / <head>
- Artifact: <file> / <hash>
- Scope: <all rows | selected row | none>
- Outcome: <ACTIONABLE_RESEARCH | WAIT_PRICE | NO_TRADE | BLOCKED_* | APPROVAL_REQUIRED>
- Primary lane: <quality_gate | structure | breakout | target_recalibration | risk_geometry | data_freshness | fillability | state>
- Mutation: brokerAttempted=<0|1> brokerSubmitted=<0|1> stateAttempted=<0|1>
- Next owner: <Stage3 | Stage4 | Stage5 | Stage6 | Stage6.5 | Harvester | Sidecar | User approval>
```

## Contract With TradingCodex and mRNA Architecture

TradingCodex defines who reviews the package. mRNA architecture defines how a
run-specific strategy transcript is derived and invalidated. Decision Package is
the evidence envelope that prevents either model from becoming an execution
shortcut.

## Non-Goals

- Do not replace Stage6.
- Do not create a second signal artifact.
- Do not use package completeness as execution approval.
- Do not allow sidecar to infer alpha intent missing from Stage6.
- Do not allow Research Package or Sidecar Package to mutate broker state.
