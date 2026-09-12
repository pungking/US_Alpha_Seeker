#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  STOCKHUB_PUBLIC_FEATURES,
  buildStockHubCapabilityAbsorption
} from './lib/stockhub-capability-absorption.mjs';

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
const stockHub = report.stockHubCapabilityAbsorption;
const stockHubStatuses = new Set([
  'ALREADY_COVERED',
  'PARTIALLY_COVERED',
  'MISSING_HIGH_VALUE',
  'MISSING_MEDIUM_VALUE',
  'DUPLICATE_REJECTED',
  'LOW_SIGNAL_REJECTED',
  'UNSOURCED_CLAIM_REJECTED',
  'OUT_OF_SCOPE_NON_US_EQUITY',
  'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
  'AUTHENTICATED_UX_REVIEW_REQUIRED',
  'EXECUTION_RELATED_SEPARATE_APPROVAL'
]);
const requiredFeatureFields = [
  'featureName',
  'publicRoute',
  'category',
  'reviewedAt',
  'intendedMeaning',
  'existingRepository',
  'existingArtifactOrConsumer',
  'officialCandidateSource',
  'publicationDelay',
  'timestampBasis',
  'identifierBasis',
  'currentCoverageStatus',
  'valuePriority',
  'policyRisk',
  'implementationDisposition',
  'primaryBlocker',
  'nextAction'
];
const expectedCategories = new Set([
  'market_global_context',
  'pre_market_after_hours_movers',
  'market_breadth_sector_industry_leadership',
  'volatility_rates_fx_commodities',
  'earnings_economic_fomc_calendar',
  'analyst_ratings_targets_revisions',
  'etf_fund_institutional_flow',
  'sec_ownership_insider_13dg_13f',
  'finra_short_interest_short_sale_volume_ats_blocks',
  'reg_sho_halts_managed_securities',
  'corporate_actions_ipo_lockup_delisting_merger',
  'congressional_public_official_disclosures',
  'news_source_reliability',
  'thematic_supply_chain_maps',
  'screener_leader_anomaly_tools',
  'pick_performance_process_review',
  'watchlist_portfolio_calculator_ux',
  'community_chat',
  'crypto_non_us_equity_features'
]);
const requiredPackageFields = [
  'capabilityId',
  'capabilityStatus',
  'implementationRepository',
  'officialSource',
  'officialDocumentation',
  'machineReadableContract',
  'authenticationRequirement',
  'licenseOrTermsStatus',
  'endpointOrDataset',
  'requestBudget',
  'rateLimit',
  'pagination',
  'sourceTimestamp',
  'publicationTimestamp',
  'marketTimezone',
  'amendmentOrCorrectionHandling',
  'identifierLineage',
  'tickerRenameMergerDelistingHandling',
  'rawResponseRetention',
  'canonicalSourceChanged',
  'policyImpact',
  'failOpenBehavior',
  'telegramAggregateAlertContract',
  'approvalRequired',
  'externalRequestPerformed'
];
assert.ok(stockHub);
assert.equal(stockHub.sourceRole, 'PUBLIC_FEATURE_IDEA_CATALOG_ONLY');
assert.equal(stockHub.sourceSnapshot.authenticatedAccessUsed, false);
assert.equal(stockHub.sourceSnapshot.credentialReceivedOrStored, false);
assert.equal(
  stockHub.inventory.length,
  stockHub.sourceSnapshot.declaredFeatureCardCount + stockHub.sourceSnapshot.navigationOnlyFeatureCount
);
assert.equal(stockHub.summary.reviewedFeatureCount, stockHub.inventory.length);
assert.equal(stockHub.summary.classifiedFeatureCardRows, stockHub.sourceSnapshot.declaredFeatureCardCount);
assert.equal(stockHub.summary.featureCardCoveragePercent, 100);
assert.equal(stockHub.summary.featureCoveragePercent, 100);
assert.equal(stockHub.summary.navigationReviewedRouteCount, stockHub.sourceSnapshot.observedUniqueInternalRouteCount);
assert.equal(stockHub.summary.navigationRouteCoveragePercent, 100);
assert.equal(stockHub.summary.duplicateNavigationRouteRows, 0);
assert.equal(stockHub.summary.unknownOrUnclassified, 0);
assert.equal(stockHub.summary.identifierUnknownOrUnclassifiedRows, 0);
assert.equal(stockHub.summary.publicationDelayUnknownOrUnclassifiedRows, 0);
assert.equal(stockHub.summary.duplicatePublicRouteRows, 0);
assert.equal(stockHub.summary.duplicateFeatureNameRows, 0);
assert.equal(stockHub.summary.symbolHardcodeCount, 0);
assert.deepEqual(new Set(Object.keys(stockHub.summary.categoryCounts)), expectedCategories);
assert.equal(Object.values(stockHub.summary.categoryCounts).reduce((sum, count) => sum + count, 0), stockHub.inventory.length);
assert.equal(Object.values(stockHub.summary.statusCounts).reduce((sum, count) => sum + count, 0), stockHub.inventory.length);
assert.equal(stockHub.invariants.canonicalSourceChanged, false);
assert.equal(stockHub.invariants.policyImpact, 'NONE_REPORT_ONLY');
assert.equal(stockHub.invariants.stage6PolicyChanged, false);
assert.equal(stockHub.invariants.stage7LegacySnapshotChanged, false);
assert.equal(stockHub.invariants.publicationDelayLookAheadAllowed, false);
assert.equal(stockHub.invariants.shortInterestCombinedWithShortSaleVolume, false);
assert.equal(stockHub.invariants.regShoUsedAsDirectSignal, false);
assert.equal(stockHub.invariants.communitySignalUsed, false);
assert.equal(stockHub.invariants.fixedThresholdImported, false);
assert.equal(stockHub.invariants.executionEffectAuthorized, false);
assert.equal(stockHub.invariants.duplicateArchitectureAdded, false);
assert.equal(stockHub.invariants.brokerOrStateMutation, false);
assert.equal(stockHub.invariants.externalRequestCount, 0);
for (const feature of stockHub.inventory) {
  for (const field of requiredFeatureFields) assert.ok(Object.hasOwn(feature, field), `${feature.featureName}:${field}`);
  assert.ok(stockHubStatuses.has(feature.currentCoverageStatus), feature.currentCoverageStatus);
  assert.equal(feature.policyImpact, 'NONE_REPORT_ONLY');
}
assert.ok(stockHub.inventory.some((feature) => feature.currentCoverageStatus === 'AUTHENTICATED_UX_REVIEW_REQUIRED'));
assert.ok(stockHub.inventory.some((feature) => feature.currentCoverageStatus === 'LICENSE_OR_ACCESS_REVIEW_REQUIRED'));
assert.ok(stockHub.inventory.some((feature) => feature.currentCoverageStatus === 'OUT_OF_SCOPE_NON_US_EQUITY'));
assert.ok(stockHub.inventory.some((feature) => feature.currentCoverageStatus === 'DUPLICATE_REJECTED'));
assert.ok(stockHub.inventory.some((feature) => feature.currentCoverageStatus === 'UNSOURCED_CLAIM_REJECTED'));
assert.ok(stockHub.priority0ReportOnlyEvidence.every((item) => item.policyImpact === 'NONE_REPORT_ONLY'));
for (const item of stockHub.officialSourceCapabilityPackages) {
  for (const field of requiredPackageFields) assert.ok(Object.hasOwn(item, field), `${item.capabilityId}:${field}`);
  assert.equal(item.externalRequestPerformed, false);
  assert.equal(item.approvalRequired, true);
  assert.equal(item.rawResponseRetention, false);
  assert.equal(item.canonicalSourceChanged, false);
  assert.equal(item.policyImpact, 'NONE_REPORT_ONLY');
}
const shortEvidence = stockHub.inventory.find((feature) => feature.semanticKey === 'us_short_market_evidence');
assert.match(shortEvidence.nextAction, /never combine short interest and short-sale volume/i);
const regSho = stockHub.inventory.find((feature) => feature.semanticKey === 'exchange_reg_sho_thresholds');
assert.match(regSho.nextAction, /direct-signal rejection/i);
const analystRevision = stockHub.inventory.find((feature) => feature.semanticKey === 'analyst_revision_target_dispersion');
assert.equal(analystRevision.currentCoverageStatus, 'LICENSE_OR_ACCESS_REVIEW_REQUIRED');
assert.equal(stockHub.inventory.find((feature) => feature.semanticKey === 'market_breadth').currentCoverageStatus, 'ALREADY_COVERED');
assert.equal(stockHub.inventory.find((feature) => feature.semanticKey === 'economic_release_calendar').currentCoverageStatus, 'MISSING_HIGH_VALUE');
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
assert.deepEqual(renamed.stockHubCapabilityAbsorption, stockHub);
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
assert.deepEqual(replay.stockHubCapabilityAbsorption, stockHub);

const renamedPublicRoute = STOCKHUB_PUBLIC_FEATURES.map((feature, index) => index === 0
  ? { ...feature, publicRoute: '/renamed-public-route' }
  : feature);
const renamedRouteAudit = buildStockHubCapabilityAbsorption(renamedPublicRoute);
assert.equal(renamedRouteAudit.summary.featureCoveragePercent, 100);
assert.equal(renamedRouteAudit.inventory[0].semanticKey, stockHub.inventory[0].semanticKey);
assert.equal(renamedRouteAudit.inventory[0].currentCoverageStatus, stockHub.inventory[0].currentCoverageStatus);
assert.throws(
  () => buildStockHubCapabilityAbsorption([
    ...STOCKHUB_PUBLIC_FEATURES,
    { ...STOCKHUB_PUBLIC_FEATURES[0], publicRoute: '/duplicate-semantic-route' }
  ]),
  /duplicate feature semantic key/
);

console.log('[INSTITUTIONAL_APPLICABILITY_VALIDATE] pass');
