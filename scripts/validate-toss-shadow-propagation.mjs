#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildTossShadowEvidence,
  sanitizeTossShadowEvidence,
  summarizeTossShadowEvidence,
  validateTossShadowArtifact
} from '../services/tossShadowContract.mjs';

const hash = (char) => char.repeat(64);
const artifact = {
  schemaVersion: 'toss-market-data-shadow-v1',
  status: 'TOSS_SHADOW_PASS',
  mode: 'SHADOW_ONLY',
  provider: 'TOSS_OPEN_API',
  eligible: true,
  tossEvidenceExcluded: false,
  canonicalSourceChanged: false,
  policyImpact: 'NONE_REPORT_ONLY',
  accountHeaderUsed: false,
  orderEndpointUsed: false,
  marketTimezone: 'America/New_York',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  retrievedAt: '2026-08-11T20:00:01.000Z',
  priceSemantics: 'LATEST_QUOTE_NOT_HISTORICAL_ADJUSTED_CANDLE',
  adjustedPriceSemantics: 'NOT_APPLICABLE_TO_PRICES_ENDPOINT',
  requestScopeSha256: hash('1'),
  responseSha256: { prices: [hash('2')] },
  summary: {
    requestedRows: 2,
    matchedRows: 2,
    missingRows: 0,
    invalidRows: 0,
    duplicateRows: 0
  },
  requestLineage: {
    status: 'VERIFIED_STAGE3_REQUEST_SCOPE',
    requestScopeSha256: hash('1'),
    providerRequestScopeSha256: hash('6'),
    providerSymbolMappingStatus: 'VERIFIED_DOT_HYPHEN_ALIAS',
    providerMappedRows: 1,
    requestSourceArtifact: {
      file: 'STAGE3_FUNDAMENTAL_FULL_FIXTURE.json',
      sha256: hash('7'),
      hashBasis: 'CANONICAL_JSON',
      generatedAt: '2026-08-11T19:00:00.000Z',
      generatedAtSource: 'FIXTURE',
      requestScopeSha256: hash('1')
    },
    batches: [{
      batchIndex: 0,
      requestedCount: 2,
      returnedCount: 2,
      batchRequestScopeSha256: hash('3'),
      batchProviderRequestScopeSha256: hash('8'),
      batchReturnedScopeSha256: hash('3'),
      batchCanonicalReturnedScopeSha256: hash('3')
    }]
  },
  prices: [
    {
      symbol: 'ALPHA',
      lastPrice: 100,
      currency: 'USD',
      sourceAsOfUtc: '2026-08-11T20:00:00.000Z',
      providerSymbolSha256: hash('4')
    },
    {
      symbol: 'BRAVO',
      lastPrice: 102,
      currency: 'USD',
      sourceAsOfUtc: '2026-08-11T20:00:00.000Z',
      providerSymbolSha256: hash('5')
    }
  ]
};

const artifactBefore = JSON.stringify(artifact);
const parsed = validateTossShadowArtifact(artifact, '2026-08-11T20:00:02.000Z');
assert.equal(parsed.status, 'PASS');
assert.equal(parsed.rowsBySymbol.size, 2);
assert.equal(JSON.stringify(artifact), artifactBefore);
assert.equal(
  validateTossShadowArtifact(artifact, '2026-08-11T20:00:02.000Z', 'DIFFERENT_STAGE3.json').exclusionReason,
  'REQUEST_SOURCE_ARTIFACT_MISMATCH'
);

const matched = buildTossShadowEvidence(parsed, 'ALPHA', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  currency: 'USD',
  adjustmentBasisComparable: true
});
assert.equal(matched.comparison.status, 'MATCHED');
assert.equal(matched.policyImpact, 'NONE_REPORT_ONLY');
assert.equal(matched.providerMappedRows, 1);

const divergent = buildTossShadowEvidence(parsed, 'BRAVO', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  currency: 'USD',
  adjustmentBasisComparable: true
});
assert.equal(divergent.comparison.status, 'DIVERGENT_REVIEW_REQUIRED');
assert.equal(divergent.comparison.differenceBps, 200);

assert.equal(buildTossShadowEvidence(parsed, 'ALPHA', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T19:59:59.000Z',
  currency: 'USD',
  adjustmentBasisComparable: true
}).comparison.status, 'NOT_COMPARABLE_TIMESTAMP');
assert.equal(buildTossShadowEvidence(parsed, 'ALPHA', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  currency: 'USD',
  adjustmentBasisComparable: false
}).comparison.status, 'ADJUSTMENT_BASIS_MISMATCH');
assert.equal(buildTossShadowEvidence(parsed, 'ALPHA', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  currency: 'EUR',
  adjustmentBasisComparable: true
}).comparison.status, 'CURRENCY_MISMATCH');

const partial = validateTossShadowArtifact({
  ...artifact,
  summary: { ...artifact.summary, matchedRows: 1, missingRows: 1 }
}, '2026-08-11T20:00:02.000Z');
assert.equal(partial.status, 'EXCLUDED');
assert.equal(partial.exclusionReason, 'PARTIAL_OR_INVALID_RESPONSE');

const future = validateTossShadowArtifact(artifact, '2026-08-11T19:59:59.000Z');
assert.equal(future.status, 'EXCLUDED');
assert.equal(future.exclusionReason, 'SOURCE_TIMESTAMP_AFTER_CONSUMER');
assert.equal(validateTossShadowArtifact({ ...artifact, accountHeaderUsed: true }, '2026-08-11T20:00:02.000Z').status, 'EXCLUDED');
assert.equal(validateTossShadowArtifact({
  ...artifact,
  responseSha256: { prices: ['invalid'] }
}, '2026-08-11T20:00:02.000Z').exclusionReason, 'RESPONSE_HASH_INVALID');
assert.equal(buildTossShadowEvidence(validateTossShadowArtifact(null), 'ALPHA', {}), null);

const decisionSafe = sanitizeTossShadowEvidence(matched, '2026-08-11T20:00:02.000Z');
assert.equal(decisionSafe.decisionTimeStatus, 'VERIFIED_DECISION_TIME_SHADOW');
assert.equal(decisionSafe.eligibleForDecisionTimeSlice, true);
const decisionFuture = sanitizeTossShadowEvidence(matched, '2026-08-11T19:59:59.000Z');
assert.equal(decisionFuture.decisionTimeStatus, 'EXCLUDED_TIMESTAMP_AFTER_DECISION');
assert.equal(decisionFuture.eligibleForDecisionTimeSlice, false);

const summary = summarizeTossShadowEvidence([
  { tossShadowEvidence: decisionSafe },
  { tossShadowEvidence: sanitizeTossShadowEvidence(divergent, '2026-08-11T20:00:02.000Z') },
  { tossShadowEvidence: decisionFuture },
  {}
]);
assert.deepEqual(summary, {
  tossShadowSeedRows: 3,
  tossShadowEligibleRows: 2,
  tossShadowExcludedRows: 1,
  matchedRows: 1,
  divergentRows: 1,
  notComparableTimestampRows: 0,
  staleOrInvalidRows: 1,
  providerAliasMappedRows: 1
});

assert.deepEqual(
  summarizeTossShadowEvidence([{ tossShadowEvidence: matched }]),
  summarizeTossShadowEvidence([{ tossShadowEvidence: { ...matched, providerSymbolSha256: hash('9') } }])
);
assert.equal(JSON.stringify(sanitizeTossShadowEvidence(matched)), JSON.stringify(sanitizeTossShadowEvidence(matched)));

const decisionFields = ['ranking', 'alphaScore', 'executionScore', 'executionVerdict', 'decisionReason', 'executable'];
const baselineDecision = {
  ranking: 1,
  alphaScore: 88,
  executionScore: 73,
  executionVerdict: 'BUY',
  decisionReason: 'fixture_reason',
  executable: false
};
const withToss = { ...baselineDecision, shadow: { toss: matched } };
assert.deepEqual(
  Object.fromEntries(decisionFields.map((field) => [field, withToss[field]])),
  baselineDecision
);

const renamedArtifact = {
  ...artifact,
  prices: artifact.prices.map((row, index) => ({
    ...row,
    symbol: index ? 'DELTA' : 'CHARLIE',
    providerSymbolSha256: index ? hash('a') : hash('b')
  }))
};
const renamed = validateTossShadowArtifact(renamedArtifact, '2026-08-11T20:00:02.000Z');
assert.equal(buildTossShadowEvidence(renamed, 'CHARLIE', {
  price: 100,
  source: 'YFINANCE_YAHOO',
  sourceAsOf: '2026-08-11T20:00:00.000Z',
  currency: 'USD',
  adjustmentBasisComparable: true
}).comparison.status, 'MATCHED');

const root = process.cwd();
const technicalSource = fs.readFileSync(path.join(root, 'components/TechnicalAnalysis.tsx'), 'utf8');
const stage5Source = fs.readFileSync(path.join(root, 'components/IctAnalysis.tsx'), 'utf8');
const stage6Source = fs.readFileSync(path.join(root, 'components/AlphaAnalysis.tsx'), 'utf8');
const stage7Source = fs.readFileSync(path.join(root, 'scripts/build-stage7-outcome-ledger.mjs'), 'utf8');
assert.match(technicalSource, /TOSS_MARKET_DATA_SHADOW\.json/);
assert.match(technicalSource, /tossShadowEvidence/);
assert.match(stage5Source, /tossShadowEvidence/);
assert.match(stage6Source, /tossShadowEvidence:\s*sanitizeTossShadowEvidence/);
assert.match(stage7Source, /tossShadowEvidence/);
const stage6PolicyStart = stage6Source.indexOf('const deriveExecutionContractFields');
const stage6PolicyEnd = stage6Source.indexOf('finalData.sort', stage6PolicyStart);
assert.ok(stage6PolicyStart >= 0 && stage6PolicyEnd > stage6PolicyStart);
assert.doesNotMatch(stage6Source.slice(stage6PolicyStart, stage6PolicyEnd), /tossShadow/i);
assert.ok(
  stage6Source.indexOf('const attachShadowIntel') > stage6Source.indexOf('let top6ArchiveCandidates'),
  'Toss evidence must attach only after Stage6 selection'
);

console.log('[TOSS_SHADOW_PROPAGATION] PASS');
