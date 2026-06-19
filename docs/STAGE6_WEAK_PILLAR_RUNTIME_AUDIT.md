# Stage6 Weak Pillar Runtime Audit

- GeneratedAt: 2026-06-19T23:25:52.874Z
- Stage6: STAGE6_ALPHA_FINAL_2026-06-20_02-03-33.json
- Hash: 2ea6fd5b26acbe89c2334543e1a94c10f9629c2b9e7904e353cfebfc0342d207
- Overall: **pass_no_latest_weak_pillar_runtime_observed_fixture_required**
- Safety: analysis-only; no broker/state mutation.

## Summary

| Metric | Value |
| --- | ---: |
| latestRows | 15 |
| latestWeakRows | 0 |
| latestWeakWaitRows | 0 |
| latestExecutableViolations | 0 |
| latestQualityGateViolations | 0 |
| allFilesScanned | 61 |
| historicalWeakRows | 14 |

## Thresholds

| Field | Value |
| --- | ---: |
| enabled | true |
| waiverEnabled | false |
| minFundamentalScore | 50 |
| minTechnicalScore | 50 |
| minIctScore | 60 |

## Latest Weak Rows

- No weak-pillar row appeared in the latest Stage6 artifact. Fixture contract remains the current proof until the next runtime occurrence.

## Done-When

- If a weak-pillar candidate appears, it must be `WAIT_PRICE / wait_weak_pillar_execution_gate`.
- It must expose `qualityGateLane=weak_pillar_execution_gate`.
- It must expose `qualityGatePolicyVerdict=QUALITY_GATE_WEAK_PILLAR_EXECUTION_WAIT`.
- It must not remain `EXECUTABLE_NOW` unless an explicit audited waiver is present.
