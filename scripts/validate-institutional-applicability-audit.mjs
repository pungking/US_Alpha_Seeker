#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'institutional-applicability-audit-'));

function runAudit(rows, suffix) {
  const input = path.join(tmp, `input-${suffix}.json`);
  const output = path.join(tmp, `output-${suffix}.json`);
  fs.writeFileSync(input, JSON.stringify({ rows }), 'utf8');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/build-institutional-applicability-audit.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      INSTITUTIONAL_AUDIT_INPUT: input,
      INSTITUTIONAL_AUDIT_OUT_JSON: output,
      INSTITUTIONAL_AUDIT_OUT_MD: path.join(tmp, `output-${suffix}.md`)
    },
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

const sourceRows = [
  {
    stage6File: 'STAGE6_ALPHA_FINAL_FIXTURE.json',
    symbol: 'ALPHA',
    finalDecision: 'WAIT_PRICE',
    decisionReason: 'wait_structure_confirmation_required',
    entry: 100,
    price: 105,
    target: 125,
    stop: 94,
    rr: 4.16,
    rrAtCurrentPrice: 1.9,
    expectedReturnPct: 25,
    targetBufferFromCurrentPct: 19.05,
    currentEntryStructureConfirmed: false,
    currentEntryStructureReasons: ['support_proof_missing'],
    breakoutRetestProofConfirmed: false,
    tradePlanDecision: 'WAIT_PRICE/wait_structure_confirmation_required',
    tradePlanReason: 'wait_structure_confirmation_required',
    investmentOutlook: 'Guaranteed 87% return without cited evidence'
  },
  {
    stage6File: 'STAGE6_ALPHA_FINAL_FIXTURE.json',
    symbol: 'BETA',
    finalDecision: 'WAIT_PRICE',
    decisionReason: 'review_required',
    entry: null,
    price: null,
    target: null,
    stop: null,
    rr: null,
    rrAtCurrentPrice: null,
    expectedReturnPct: null,
    currentEntryStructureConfirmed: null,
    breakoutRetestProofConfirmed: null
  }
];

const report = runAudit(sourceRows, 'base');
assert.equal(report.guideGapMapping.unknownOrUnclassified, 0);
assert.deepEqual(
  new Set(report.guideGapMapping.items.map((item) => item.classification)),
  new Set(['ALREADY_COVERED', 'PARTIALLY_COVERED', 'REJECT_GENERIC_RULE'])
);
assert.equal(report.summary.contrarianReviewRows, 2);
assert.equal(report.summary.unsupportedContrarianClaimCount, 0);
assert.equal(report.summary.decisionTicketUnknownRows, 0);

const alpha = report.rows.find((row) => row.symbol === 'ALPHA');
assert.equal(alpha.contrarianReview.reviewStatus, 'REPORT_ONLY_EVIDENCE_COMPLETE');
assert.equal(alpha.contrarianReview.reviewerIndependenceStatus, 'DETERMINISTIC_EVIDENCE_REVIEW_NO_VERDICT_OVERRIDE');
assert.ok(alpha.contrarianReview.sourceArtifactRefs.length > 0);
assert.ok(alpha.contrarianReview.failureScenarios.length >= 1);
assert.ok(alpha.contrarianReview.observableInvalidationTriggers.some((item) => item.sourceField === 'stop'));
assert.equal(alpha.contrarianReview.unsupportedClaimCount, 0);
assert.ok(Number.isFinite(Date.parse(alpha.contrarianReview.reviewedAt)));
assert.equal(JSON.stringify(alpha).includes('Guaranteed 87%'), false);
assert.equal(alpha.decisionTicket.status, 'PARTIAL_EVIDENCE_ONLY');
assert.ok(alpha.decisionTicket.missingEvidence.includes('investment_thesis'));
assert.ok(alpha.decisionTicket.missingEvidence.includes('holding_horizon'));
assert.equal(alpha.decisionTicket.observableInvalidationTriggers[0].sourceField, 'stop');

const beta = report.rows.find((row) => row.symbol === 'BETA');
assert.equal(beta.contrarianReview.reviewStatus, 'INSUFFICIENT_SOURCE_EVIDENCE');
assert.equal(beta.decisionTicket.status, 'INSUFFICIENT_SOURCE_EVIDENCE');

const renamed = runAudit(sourceRows.map((row, index) => ({ ...row, symbol: `RENAMED_${index}` })), 'renamed');
assert.deepEqual(renamed.summary, report.summary);
assert.deepEqual(
  renamed.rows.map((row) => ({
    reviewStatus: row.contrarianReview.reviewStatus,
    strongestContraryThesis: row.contrarianReview.strongestContraryThesis,
    ticketStatus: row.decisionTicket.status,
    missingEvidence: row.decisionTicket.missingEvidence
  })),
  report.rows.map((row) => ({
    reviewStatus: row.contrarianReview.reviewStatus,
    strongestContraryThesis: row.contrarianReview.strongestContraryThesis,
    ticketStatus: row.decisionTicket.status,
    missingEvidence: row.decisionTicket.missingEvidence
  }))
);

const replay = runAudit(sourceRows, 'replay');
const stableRows = (payload) => payload.rows.map((row) => ({
  ...row,
  contrarianReview: { ...row.contrarianReview, reviewedAt: '<generated>' }
}));
assert.deepEqual(stableRows(replay), stableRows(report));

console.log('[INSTITUTIONAL_APPLICABILITY_VALIDATE] pass');
