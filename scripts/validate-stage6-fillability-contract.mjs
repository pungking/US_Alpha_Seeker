#!/usr/bin/env node
import fs from 'node:fs';
const fixturePath = process.env.STAGE6_FILLABILITY_CONTRACT_FIXTURE || 'docs/fixtures/stage6_sidecar_entry_fillability_contract.fixture.json';
const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const candidates = Array.isArray(data.candidates) ? data.candidates : [];
const errors = [];
for (const [idx, row] of candidates.entries()) {
  const label = `${row.symbol || `row_${idx}`}`;
  if (!row.symbol) errors.push(`${label}: symbol missing`);
  if (!['EXECUTABLE_NOW', 'WAIT_PRICE', 'BLOCKED_RISK', 'BLOCKED_EVENT'].includes(row.finalDecision)) errors.push(`${label}: invalid finalDecision`);
  if (!['PASS', 'BLOCKED', 'UNKNOWN'].includes(row.executionFeasibilityAtCurrent)) errors.push(`${label}: invalid executionFeasibilityAtCurrent`);
  if (row.finalDecision === 'EXECUTABLE_NOW') {
    if (row.executionFeasibilityAtCurrent !== 'PASS') errors.push(`${label}: executable must have current feasibility PASS`);
    if (Number(row.executionFeasibilityAtCurrentRr) < Number(row.executionFeasibilityAtCurrentMinRr)) errors.push(`${label}: executable current RR below min`);
    if (Number(row.executionFeasibilityAtCurrentDistancePct) > Number(row.executionFeasibilityAtCurrentMaxDistancePct)) errors.push(`${label}: executable current distance above adaptive band`);
  }
  if (row.executionFeasibilityAtCurrent === 'BLOCKED' && !String(row.decisionReason || '').startsWith('wait_') && !String(row.decisionReason || '').startsWith('blocked_')) {
    errors.push(`${label}: blocked current feasibility needs wait_/blocked_ decisionReason`);
  }
}
if (!candidates.length) errors.push('fixture has no candidates');
if (errors.length) {
  console.error(`[STAGE6_FILLABILITY_CONTRACT] FAIL ${errors.join('; ')}`);
  process.exit(1);
}
console.log(`[STAGE6_FILLABILITY_CONTRACT] PASS candidates=${candidates.length} fixture=${fixturePath}`);
