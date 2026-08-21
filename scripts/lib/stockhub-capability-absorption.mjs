const REVIEWED_AT = '2026-08-21T00:00:00+09:00';
const POLICY_IMPACT = 'NONE_REPORT_ONLY';
const SOURCE_SNAPSHOT = Object.freeze({
  publicFeaturesUrl: 'https://stockhub.kr/features',
  publicNavigationUrls: ['https://stockhub.kr/', 'https://stockhub.kr/research/picks', 'https://stockhub.kr/smart-money/13f'],
  reviewedAt: REVIEWED_AT,
  sha256: '187064a8040db8b43a637b55dc5469ebfef3bdf1d032bc6d34ecc3d4ce523243',
  declaredFeatureCardCount: 65,
  navigationOnlyFeatureCount: 5,
  expectedUniqueFeatureCount: 70,
  observedUniqueInternalRouteCount: 79,
  onePassPublicReview: true,
  authenticatedAccessUsed: false,
  credentialReceivedOrStored: false,
  rawSnapshotCommitted: false,
  sourceTextOrUiCopied: false
});

export const STOCKHUB_COVERAGE_STATUSES = new Set([
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

const PROFILES = {
  already: {
    currentCoverageStatus: 'ALREADY_COVERED',
    valuePriority: 'P0_REUSE_EXISTING',
    policyRisk: 'LOW_IF_REPORT_ONLY',
    implementationDisposition: 'REUSE_EXISTING_CONTRACT',
    primaryBlocker: 'NONE',
    nextAction: 'Keep the existing artifact and verify prospective lineage.'
  },
  partial: {
    currentCoverageStatus: 'PARTIALLY_COVERED',
    valuePriority: 'P0_OR_P1_COMPLETE_EXISTING_CONTRACT',
    policyRisk: 'MEDIUM_SOURCE_LINEAGE',
    implementationDisposition: 'EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN',
    primaryBlocker: 'SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE',
    nextAction: 'Reuse the existing artifact and close only the documented lineage gap.'
  },
  high: {
    currentCoverageStatus: 'MISSING_HIGH_VALUE',
    valuePriority: 'P1_BOUNDED_CAPABILITY',
    policyRisk: 'MEDIUM_PUBLICATION_DELAY_AND_IDENTIFIER_LINEAGE',
    implementationDisposition: 'BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED',
    primaryBlocker: 'OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN',
    nextAction: 'Use the matching bounded official-source package; do not affect policy.'
  },
  medium: {
    currentCoverageStatus: 'MISSING_MEDIUM_VALUE',
    valuePriority: 'P2_AFTER_HIGH_VALUE_CAPABILITIES',
    policyRisk: 'MEDIUM_LINEAGE_OR_COMPARABILITY',
    implementationDisposition: 'DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN',
    primaryBlocker: 'OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE',
    nextAction: 'Keep report-only and defer implementation until lineage is proven.'
  },
  duplicate: {
    currentCoverageStatus: 'DUPLICATE_REJECTED',
    valuePriority: 'REJECT_DUPLICATE',
    policyRisk: 'ARCHITECTURE_DUPLICATION',
    implementationDisposition: 'REJECT_DUPLICATE_EXISTING_CONTRACT',
    primaryBlocker: 'EXISTING_CONTRACT_ALREADY_OWNS_MEANING',
    nextAction: 'Do not add another planner, ledger, screener, or dashboard contract.'
  },
  lowSignal: {
    currentCoverageStatus: 'LOW_SIGNAL_REJECTED',
    valuePriority: 'REJECT_LOW_SIGNAL',
    policyRisk: 'HIGH_FALSE_SIGNAL_RISK',
    implementationDisposition: 'REJECT_AS_DECISION_EVIDENCE',
    primaryBlocker: 'INSUFFICIENT_DECISION_VALUE',
    nextAction: 'Do not ingest unless a future source-backed report-only use is proven.'
  },
  unsourced: {
    currentCoverageStatus: 'UNSOURCED_CLAIM_REJECTED',
    valuePriority: 'REJECT_UNSOURCED',
    policyRisk: 'HIGH_UNVERIFIED_MODEL_OR_DIRECTIONAL_CLAIM',
    implementationDisposition: 'REJECT_UNTIL_OFFICIAL_EVIDENCE_EXISTS',
    primaryBlocker: 'SOURCE_AND_METHOD_NOT_VERIFIED',
    nextAction: 'Do not import the score, label, threshold, or directional interpretation.'
  },
  nonUs: {
    currentCoverageStatus: 'OUT_OF_SCOPE_NON_US_EQUITY',
    valuePriority: 'OUT_OF_SCOPE',
    policyRisk: 'REPOSITORY_SCOPE_VIOLATION',
    implementationDisposition: 'REJECT_NON_US_EQUITY_SCOPE',
    primaryBlocker: 'US_EQUITY_SCOPE_BOUNDARY',
    nextAction: 'Keep outside the US Alpha Seeker universe.'
  },
  license: {
    currentCoverageStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    valuePriority: 'P1_OR_P2_AFTER_TERMS_REVIEW',
    policyRisk: 'LICENSE_ACCESS_AND_REDISTRIBUTION',
    implementationDisposition: 'DEFER_FOR_LICENSE_OR_ACCESS_REVIEW',
    primaryBlocker: 'NO_VERIFIED_FREE_OFFICIAL_PRODUCTION_SOURCE',
    nextAction: 'Review official terms and machine-readable access before any probe.'
  },
  authenticatedUx: {
    currentCoverageStatus: 'AUTHENTICATED_UX_REVIEW_REQUIRED',
    valuePriority: 'UX_ONLY_DEFERRED',
    policyRisk: 'CREDENTIAL_SESSION_AND_CONTENT_RIGHTS',
    implementationDisposition: 'NO_CODE_OR_CREDENTIAL_COLLECTION',
    primaryBlocker: 'LOGIN_REQUIRED_FOR_COMPLETE_UX_REVIEW',
    nextAction: 'If ever reviewed, the user logs in directly; do not receive credentials or cookies.'
  },
  execution: {
    currentCoverageStatus: 'EXECUTION_RELATED_SEPARATE_APPROVAL',
    valuePriority: 'EXECUTION_BOUNDARY',
    policyRisk: 'BROKER_OR_POSITION_MUTATION',
    implementationDisposition: 'ALPHA_EXEC_SEPARATE_APPROVAL_ONLY',
    primaryBlocker: 'EXECUTION_APPROVAL_NOT_GRANTED',
    nextAction: 'Keep report-only and route any execution effect to a separate alpha-exec goal.'
  }
};

function feature({
  semanticKey,
  featureName,
  publicRoute,
  publicSection,
  category,
  intendedMeaning,
  profile,
  existingRepository = 'NONE',
  existingArtifactOrConsumer = 'NONE',
  officialCandidateSource = 'NONE',
  publicationDelay = 'NOT_ESTABLISHED',
  timestampBasis = 'SOURCE_PUBLICATION_AND_RETRIEVAL_TIMESTAMPS_REQUIRED',
  identifierBasis = 'CANONICAL_US_SYMBOL_WITH_ISSUER_LINEAGE_REQUIRED',
  ...overrides
}) {
  return Object.freeze({
    semanticKey,
    featureName,
    publicRoute,
    publicSection,
    category,
    reviewedAt: REVIEWED_AT,
    intendedMeaning,
    existingRepository,
    existingArtifactOrConsumer,
    officialCandidateSource,
    publicationDelay,
    timestampBasis,
    identifierBasis,
    ...PROFILES[profile],
    ...overrides,
    policyImpact: POLICY_IMPACT,
    specificTickerHardcoded: false
  });
}

export const STOCKHUB_PUBLIC_FEATURES = Object.freeze([
  feature({ semanticKey: 'japan_listed_equities', featureName: 'Japan listed equities view', publicRoute: '/japan-stocks', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Browse equities listed in Japan.', profile: 'nonUs', officialCandidateSource: 'Japan Exchange Group', identifierBasis: 'NON_US_EXCHANGE_IDENTIFIER' }),
  feature({ semanticKey: 'china_listed_equities', featureName: 'China listed equities view', publicRoute: '/china-stocks', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Browse equities listed in China.', profile: 'nonUs', officialCandidateSource: 'Official mainland exchange sources', identifierBasis: 'NON_US_EXCHANGE_IDENTIFIER' }),
  feature({ semanticKey: 'japan_us_adrs', featureName: 'Japan-linked US ADR view', publicRoute: '/markets/japan', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Group US-listed ADRs by issuer home market.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/UniverseGathering.tsx', officialCandidateSource: 'SEC issuer filings plus exchange listing metadata', identifierBasis: 'CIK_TO_US_LISTED_SYMBOL_AND_ISSUER_DOMICILE', primaryBlocker: 'ISSUER_DOMICILE_LINEAGE_NOT_EXPLICIT' }),
  feature({ semanticKey: 'china_us_adrs', featureName: 'China-linked US ADR view', publicRoute: '/markets/china', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Group US-listed ADRs by issuer home market.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/UniverseGathering.tsx', officialCandidateSource: 'SEC issuer filings plus exchange listing metadata', identifierBasis: 'CIK_TO_US_LISTED_SYMBOL_AND_ISSUER_DOMICILE', primaryBlocker: 'ISSUER_DOMICILE_LINEAGE_NOT_EXPLICIT' }),
  feature({ semanticKey: 'us_extended_session_quotes', featureName: 'US pre-market and after-hours context', publicRoute: '/backpack', publicSection: 'market_global', category: 'pre_market_after_hours_movers', intendedMeaning: 'Separate regular and extended-session price context.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'toss-market-data-shadow-v1 plus canonical OHLCV handoff', officialCandidateSource: 'Licensed exchange or broker market-data contract', publicationDelay: 'REAL_TIME_OR_DELAYED_STATUS_MUST_BE_EXPLICIT', timestampBasis: 'PROVIDER_EVENT_TIMESTAMP_AND_SESSION', primaryBlocker: 'SESSION_SPECIFIC_QUOTE_PROVENANCE_NOT_ESTABLISHED' }),
  feature({ semanticKey: 'cross_asset_market_cap', featureName: 'Cross-asset market-cap table', publicRoute: '/markets/assets', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Compare market capitalization across unrelated asset classes.', profile: 'lowSignal', officialCandidateSource: 'Multiple official and licensed asset-class sources', identifierBasis: 'CROSS_ASSET_IDENTIFIER_NOT_IN_SCOPE' }),
  feature({ semanticKey: 'kospi_futures', featureName: 'KOSPI futures context', publicRoute: '/markets/kospi-futures', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Display Korean equity-index futures context.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange', identifierBasis: 'NON_US_DERIVATIVE_IDENTIFIER' }),
  feature({ semanticKey: 'nasdaq_futures', featureName: 'Nasdaq futures context', publicRoute: '/markets/nasdaq-futures', publicSection: 'market_global', category: 'volatility_rates_fx_commodities', intendedMeaning: 'Display US equity-index futures context.', profile: 'license', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx market regime overlay', officialCandidateSource: 'CME market-data license', publicationDelay: 'REAL_TIME_OR_DELAYED_LICENSE_TIER', timestampBasis: 'EXCHANGE_EVENT_TIMESTAMP', identifierBasis: 'CME_CONTRACT_AND_ROLL_LINEAGE' }),
  feature({ semanticKey: 'trading_halts_managed_status', featureName: 'Trading halt and managed-security status', publicRoute: '/markets/trading-halt', publicSection: 'market_global', category: 'reg_sho_halts_managed_securities', intendedMeaning: 'Show official security halt or exceptional listing status.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'Nasdaq trading-halt and listing lifecycle contracts', officialCandidateSource: 'Nasdaq Trader plus NYSE/Cboe official SRO feeds', publicationDelay: 'VENUE_PUBLICATION_TIME', timestampBasis: 'HALT_DECLARATION_AND_RESUMPTION_TIMESTAMPS', identifierBasis: 'PRIMARY_LISTING_VENUE_PLUS_SYMBOL_LINEAGE', primaryBlocker: 'ALL_VENUE_SOURCE_MATRIX_INCOMPLETE' }),
  feature({ semanticKey: 'global_market_context', featureName: 'Global market context', publicRoute: '/markets/global', publicSection: 'market_global', category: 'market_global_context', intendedMeaning: 'Summarize major indexes, volatility, rates, FX, and commodities.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx marketRegimeSnapshot and Telegram market pulse', officialCandidateSource: 'Federal Reserve, FRED source agencies, CFTC, and licensed exchange data', publicationDelay: 'SOURCE_SPECIFIC', timestampBasis: 'SOURCE_AS_OF_AND_RETRIEVED_AT', identifierBasis: 'SERIES_OR_CONTRACT_IDENTIFIER' }),

  feature({ semanticKey: 'fund_flow', featureName: 'Fund-flow context', publicRoute: '/flows', publicSection: 'flow_investor', category: 'etf_fund_institutional_flow', intendedMeaning: 'Track subscriptions, redemptions, or holdings changes without treating them as trades.', profile: 'license', officialCandidateSource: 'SEC Form N-PORT for delayed holdings; licensed source for daily flows', publicationDelay: 'N_PORT_MONTHLY_HOLDINGS_WITH_PUBLICATION_DELAY_NOT_DAILY_FLOW', timestampBasis: 'REPORTING_PERIOD_AND_FILING_ACCEPTANCE', identifierBasis: 'CIK_SERIES_CLASS_LEI_AND_SYMBOL_LINEAGE' }),
  feature({ semanticKey: 'korean_group_flow', featureName: 'Korean corporate-group flow', publicRoute: '/group-flows', publicSection: 'flow_investor', category: 'etf_fund_institutional_flow', intendedMeaning: 'Aggregate Korean investor flow by corporate group.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange', identifierBasis: 'NON_US_ISSUER_GROUP_IDENTIFIER' }),
  feature({ semanticKey: 'korean_foreign_ownership', featureName: 'Korean foreign ownership', publicRoute: '/markets/foreign', publicSection: 'flow_investor', category: 'etf_fund_institutional_flow', intendedMeaning: 'Track foreign ownership of Korean securities.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange', identifierBasis: 'NON_US_SECURITY_IDENTIFIER' }),
  feature({ semanticKey: 'korean_foreign_broker_flow', featureName: 'Korean foreign-broker flow', publicRoute: '/foreign-brokers', publicSection: 'flow_investor', category: 'etf_fund_institutional_flow', intendedMeaning: 'Display trading attributed to foreign broker channels in Korea.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange or licensed Korean broker data', identifierBasis: 'NON_US_BROKER_AND_SECURITY_IDENTIFIER' }),
  feature({ semanticKey: 'proprietary_supply_score', featureName: 'Composite supply-demand score', publicRoute: '/supply-score', publicSection: 'flow_investor', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Collapse heterogeneous flow evidence into one directional score.', profile: 'unsourced', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage6 evidence lanes remain canonical', officialCandidateSource: 'NONE_SINGLE_SCORE_IS_NOT_AN_OFFICIAL_SOURCE', primaryBlocker: 'PROPRIETARY_SCORE_METHOD_AND_SOURCE_NOT_VERIFIED' }),
  feature({ semanticKey: 'korean_margin_and_deposits', featureName: 'Korean margin balance and deposits', publicRoute: '/leverage', publicSection: 'flow_investor', category: 'volatility_rates_fx_commodities', intendedMeaning: 'Track Korean market leverage and customer deposits.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange and Korean financial authorities', identifierBasis: 'NON_US_MARKET_SERIES_IDENTIFIER' }),
  feature({ semanticKey: 'us_short_market_evidence', featureName: 'US short-market evidence', publicRoute: '/markets/short-selling', publicSection: 'flow_investor', category: 'finra_short_interest_short_sale_volume_ats_blocks', intendedMeaning: 'Keep short interest distinct from daily short-sale volume.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'sec-finra-shadow-capability-v1 and sec-finra-shadow-evidence-v1', officialCandidateSource: 'FINRA consolidatedShortInterest and regShoDaily', publicationDelay: 'DATASET_SPECIFIC_SHORT_INTEREST_AND_DAILY_VOLUME_DELAYS', timestampBasis: 'SETTLEMENT_OR_TRADE_DATE_PLUS_PUBLICATION_TIME', identifierBasis: 'FINRA_ISSUE_SYMBOL_WITH_CANONICAL_LINEAGE', nextAction: 'Reuse the disabled SEC/FINRA SHADOW producer; never combine short interest and short-sale volume.' }),
  feature({ semanticKey: 'finra_ats_dark_pool', featureName: 'FINRA ATS activity', publicRoute: '/markets/darkpool', publicSection: 'flow_investor', category: 'finra_short_interest_short_sale_volume_ats_blocks', intendedMeaning: 'Use delayed official ATS aggregates as market-structure context.', profile: 'high', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'SEC/FINRA SHADOW source abstraction', officialCandidateSource: 'FINRA Weekly Summary ATS dataset', publicationDelay: 'WEEKLY_DELAYED_AGGREGATE', timestampBasis: 'WEEK_START_OR_PERIOD_PLUS_PUBLICATION_TIME', identifierBasis: 'FINRA_ISSUE_SYMBOL_AND_ATS_IDENTIFIER', nextAction: 'Use FINRA_ATS_BLOCK_SHADOW bounded package; do not label as live smart-money trading.' }),
  feature({ semanticKey: 'finra_block_trades', featureName: 'FINRA block-trade aggregate', publicRoute: '/markets/blocks', publicSection: 'flow_investor', category: 'finra_short_interest_short_sale_volume_ats_blocks', intendedMeaning: 'Use official block summary aggregates as delayed context.', profile: 'high', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'SEC/FINRA SHADOW source abstraction', officialCandidateSource: 'FINRA Blocks Summary dataset', publicationDelay: 'DATASET_DEFINED_DELAYED_AGGREGATE', timestampBasis: 'REPORTING_PERIOD_PLUS_PUBLICATION_TIME', identifierBasis: 'FINRA_ISSUE_SYMBOL', nextAction: 'Use FINRA_ATS_BLOCK_SHADOW bounded package; do not infer buyer direction.' }),
  feature({ semanticKey: 'korean_intraday_flow', featureName: 'Korean intraday investor flow', publicRoute: '/markets?tab=fundflow', publicSection: 'flow_investor', category: 'etf_fund_institutional_flow', intendedMeaning: 'Display intraday Korean investor-category flows.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange or licensed Korean market data', identifierBasis: 'NON_US_MARKET_IDENTIFIER' }),

  feature({ semanticKey: 'us_smart_money', featureName: 'US ownership and institutional filing context', publicRoute: '/research/investors', publicSection: 'smart_money_disclosure', category: 'sec_ownership_insider_13dg_13f', intendedMeaning: 'Summarize delayed ownership filings without treating them as current trades.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'sec-finra-shadow-evidence-v1', officialCandidateSource: 'SEC Forms 3/4/5, Schedule 13D/13G, and Form 13F', publicationDelay: 'FORM_FAMILY_SPECIFIC_FILING_DELAY', timestampBasis: 'FILING_ACCEPTANCE_AND_REPORTING_PERIOD', identifierBasis: 'CIK_ACCESSION_ISSUER_CIK_AND_SYMBOL_LINEAGE' }),
  feature({ semanticKey: 'korean_insider_trades', featureName: 'Korean insider transactions', publicRoute: '/insider', publicSection: 'smart_money_disclosure', category: 'sec_ownership_insider_13dg_13f', intendedMeaning: 'Track insider filings for Korean issuers.', profile: 'nonUs', officialCandidateSource: 'Korean regulatory filing source', identifierBasis: 'NON_US_ISSUER_IDENTIFIER' }),
  feature({ semanticKey: 'congressional_disclosures', featureName: 'US congressional transaction disclosures', publicRoute: '/politician-stocks', publicSection: 'smart_money_disclosure', category: 'congressional_public_official_disclosures', intendedMeaning: 'Track delayed public-official disclosures with amendment and asset lineage.', profile: 'high', officialCandidateSource: 'U.S. House Clerk and U.S. Senate eFD official disclosure portals', publicationDelay: 'STATUTORY_REPORTING_AND_PORTAL_PUBLICATION_DELAY', timestampBasis: 'TRANSACTION_DATE_FILING_DATE_AND_RETRIEVAL_TIME', identifierBasis: 'FILER_REPORT_ASSET_DESCRIPTION_TO_ISSUER_LINEAGE', primaryBlocker: 'MACHINE_READABLE_ACCESS_AND_ASSET_IDENTIFIER_LINEAGE_UNPROVEN' }),
  feature({ semanticKey: 'korean_national_pension', featureName: 'Korean national-pension holdings', publicRoute: '/national-pension', publicSection: 'smart_money_disclosure', category: 'etf_fund_institutional_flow', intendedMeaning: 'Display Korean pension holdings.', profile: 'nonUs', officialCandidateSource: 'Korean National Pension Service disclosures', identifierBasis: 'NON_US_FUND_AND_ISSUER_IDENTIFIER' }),
  feature({ semanticKey: 'institutional_holders', featureName: 'Institutional holder view', publicRoute: '/investors', publicSection: 'smart_money_disclosure', category: 'sec_ownership_insider_13dg_13f', intendedMeaning: 'Present delayed institutional holdings and filing periods.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'Form 13F SEC/FINRA SHADOW family', officialCandidateSource: 'SEC Form 13F', publicationDelay: 'QUARTERLY_REPORTING_AND_FILING_DELAY', timestampBasis: 'REPORTING_PERIOD_AND_FILING_ACCEPTANCE', identifierBasis: 'FILER_CIK_ISSUER_CUSIP_AND_SYMBOL_LINEAGE', nextAction: 'Reuse 13F evidence and keep the reporting-period delay visible.' }),
  feature({ semanticKey: 'flow_lead_divergence_score', featureName: 'Flow lead or divergence label', publicRoute: '/markets/flow-lead', publicSection: 'smart_money_disclosure', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Convert mixed flow observations into a directional label.', profile: 'unsourced', officialCandidateSource: 'NO_SINGLE_OFFICIAL_DIRECTIONAL_LABEL', primaryBlocker: 'DIRECTIONAL_METHOD_AND_COMPARABLE_SOURCE_UNVERIFIED' }),
  feature({ semanticKey: 'ipo_lockup_calendar', featureName: 'IPO lockup event clock', publicRoute: '/markets/lockups', publicSection: 'smart_money_disclosure', category: 'corporate_actions_ipo_lockup_delisting_merger', intendedMeaning: 'Track prospectus-backed lockup dates and amendments.', profile: 'high', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'corporate-action and listing-lifecycle source abstractions', officialCandidateSource: 'SEC registration statements, prospectuses, and issuer filings', publicationDelay: 'FILING_ACCEPTANCE_TIME_WITH_AMENDMENTS', timestampBasis: 'FILING_ACCEPTANCE_AND_EXPLICIT_EVENT_DATE', identifierBasis: 'CIK_ACCESSION_ISSUER_AND_SECURITY_LINEAGE' }),
  feature({ semanticKey: 'corporate_action_calendar', featureName: 'Corporate-action event evidence', publicRoute: '/markets/corp-actions', publicSection: 'smart_money_disclosure', category: 'corporate_actions_ipo_lockup_delisting_merger', intendedMeaning: 'Track splits, dividends, mergers, symbol changes, and delistings.', profile: 'already', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'fixtures/corporate_action_lineage_contract.json and listing_lifecycle_contract.json', officialCandidateSource: 'Issuer filings and official listing venues', publicationDelay: 'EVENT_AND_SOURCE_SPECIFIC', timestampBasis: 'ANNOUNCEMENT_FILING_EFFECTIVE_AND_RETRIEVAL_TIMES', identifierBasis: 'CIK_CUSIP_SYMBOL_ALIAS_CHAIN_AND_CORPORATE_ACTION_LINEAGE' }),
  feature({ semanticKey: 'exchange_reg_sho_thresholds', featureName: 'Reg SHO threshold evidence', publicRoute: '/markets/regsho', publicSection: 'smart_money_disclosure', category: 'reg_sho_halts_managed_securities', intendedMeaning: 'Record threshold-list membership without converting it into a short signal.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'FINRA thresholdList SHADOW evidence', officialCandidateSource: 'FINRA plus Nasdaq and NYSE official threshold lists', publicationDelay: 'DAILY_VENUE_PUBLICATION', timestampBasis: 'LIST_DATE_FILE_CREATION_AND_RETRIEVAL_TIME', identifierBasis: 'PRIMARY_LISTING_VENUE_PLUS_SYMBOL_LINEAGE', primaryBlocker: 'EXCHANGE_LISTED_SRO_SOURCE_MATRIX_NOT_IMPLEMENTED', nextAction: 'Use EXCHANGE_REG_SHO_MATRIX_SHADOW package; keep direct-signal rejection.' }),
  feature({ semanticKey: 'short_squeeze_score', featureName: 'Short-squeeze watch score', publicRoute: '/markets/squeeze', publicSection: 'smart_money_disclosure', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Combine short, borrow, price, and volume fields into a squeeze label.', profile: 'unsourced', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'SEC/FINRA SHADOW evidence remains raw report-only context', officialCandidateSource: 'MULTIPLE_SOURCES_REQUIRED_NO_OFFICIAL_SQUEEZE_SCORE', primaryBlocker: 'BORROW_COST_AND_FLOAT_SOURCE_CONTRACT_NOT_PROVEN' }),
  feature({ semanticKey: 'schedule_13d_13g', featureName: 'Schedule 13D and 13G ownership changes', publicRoute: '/smart-money/13f/13dg', publicSection: 'smart_money_disclosure', category: 'sec_ownership_insider_13dg_13f', intendedMeaning: 'Track beneficial-ownership filings and amendments.', profile: 'partial', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'Schedule 13D/13G SEC SHADOW family', officialCandidateSource: 'SEC EDGAR Schedule 13D/13G filings', publicationDelay: 'FORM_RULE_AND_FILING_ACCEPTANCE_DELAY', timestampBasis: 'EVENT_DATE_REPORTING_PERIOD_AND_FILING_ACCEPTANCE', identifierBasis: 'FILER_CIK_ISSUER_CIK_ACCESSION_AND_SYMBOL_LINEAGE' }),

  feature({ semanticKey: 'macro_series_context', featureName: 'Official macro-series context', publicRoute: '/macro', publicSection: 'calendar_macro', category: 'volatility_rates_fx_commodities', intendedMeaning: 'Preserve official macro releases and revisions with source timing.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx market regime and macro overlay', officialCandidateSource: 'Federal Reserve, BLS, BEA, and FRED source agencies', publicationDelay: 'SERIES_RELEASE_CALENDAR_AND_REVISION_SPECIFIC', timestampBasis: 'OBSERVATION_PERIOD_RELEASE_TIME_AND_RETRIEVAL_TIME', identifierBasis: 'OFFICIAL_SERIES_ID', primaryBlocker: 'UNIFIED_OFFICIAL_RELEASE_AND_REVISION_LINEAGE_MISSING' }),
  feature({ semanticKey: 'economic_release_calendar', featureName: 'Economic release calendar', publicRoute: '/events?tab=economic', publicSection: 'calendar_macro', category: 'earnings_economic_fomc_calendar', intendedMeaning: 'Track scheduled official releases and later revisions.', profile: 'high', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'existing event-map handoff can be reused', officialCandidateSource: 'Federal Reserve, BLS, and BEA official release calendars', publicationDelay: 'SCHEDULE_PREANNOUNCED_RESULTS_AT_OFFICIAL_RELEASE_TIME', timestampBasis: 'SCHEDULED_RELEASE_ACTUAL_RELEASE_AND_RETRIEVAL_TIMES', identifierBasis: 'AGENCY_RELEASE_OR_SERIES_ID' }),
  feature({ semanticKey: 'earnings_calendar', featureName: 'Earnings event calendar', publicRoute: '/events?tab=earnings', publicSection: 'calendar_macro', category: 'earnings_economic_fomc_calendar', intendedMeaning: 'Gate analysis around issuer earnings dates with source freshness.', profile: 'already', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'EARNINGS_EVENT_MAP and components/TechnicalAnalysis.tsx', officialCandidateSource: 'Issuer investor-relations announcements and SEC filings', publicationDelay: 'ISSUER_ANNOUNCEMENT_AND_UPDATE_SPECIFIC', timestampBasis: 'EVENT_DATE_SOURCE_PUBLICATION_AND_RETRIEVAL_TIME', identifierBasis: 'CIK_AND_CANONICAL_SYMBOL' }),
  feature({ semanticKey: 'fedwatch_probability', featureName: 'Policy-rate probability view', publicRoute: '/fed-watch', publicSection: 'calendar_macro', category: 'earnings_economic_fomc_calendar', intendedMeaning: 'Show market-implied rate probabilities separately from the official FOMC calendar.', profile: 'license', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'FOMC dates may map to event-risk clock; probabilities are absent', officialCandidateSource: 'Federal Reserve for calendar; CME FedWatch or licensed futures data for probabilities', publicationDelay: 'CALENDAR_PREANNOUNCED_PROBABILITY_REAL_TIME_OR_DELAYED_LICENSE_TIER', timestampBasis: 'FOMC_EVENT_TIME_AND_FUTURES_QUOTE_TIME', identifierBasis: 'FOMC_MEETING_AND_CME_CONTRACT_LINEAGE', primaryBlocker: 'PROBABILITY_DATA_LICENSE_NOT_ESTABLISHED' }),
  feature({ semanticKey: 'ai_revenue_tracking', featureName: 'AI-related revenue disclosure context', publicRoute: '/markets/ai-revenue', publicSection: 'calendar_macro', category: 'thematic_supply_chain_maps', intendedMeaning: 'Trace issuer-reported AI revenue claims to filing periods and sources.', profile: 'medium', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage3 fundamentals and source-backed research contract', officialCandidateSource: 'Issuer 10-K, 10-Q, 8-K, and earnings materials', publicationDelay: 'FILING_OR_ISSUER_PUBLICATION_DELAY', timestampBasis: 'FISCAL_PERIOD_FILING_ACCEPTANCE_AND_RETRIEVAL_TIME', identifierBasis: 'ISSUER_CIK_FACT_CONCEPT_AND_SYMBOL_LINEAGE' }),
  feature({ semanticKey: 'market_command_center', featureName: 'Integrated market situation view', publicRoute: '/markets/command', publicSection: 'calendar_macro', category: 'market_global_context', intendedMeaning: 'Combine existing regime, event, breadth, and risk summaries in one view.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'TradingCodex, Stage4 marketRegimeSnapshot, Stage6 execution_contract, and Telegram report', officialCandidateSource: 'EXISTING_SOURCE_ARTIFACTS' }),
  feature({ semanticKey: 'ipo_calendar', featureName: 'US IPO filing and listing event clock', publicRoute: '/ipo', publicSection: 'calendar_macro', category: 'corporate_actions_ipo_lockup_delisting_merger', intendedMeaning: 'Track filing, pricing, listing, amendment, and withdrawal events.', profile: 'high', existingRepository: 'US_Alpha_Seeker_Harvester', existingArtifactOrConsumer: 'listing lifecycle and corporate-action source abstractions', officialCandidateSource: 'SEC registration statements/prospectuses and official listing venues', publicationDelay: 'FILING_AND_VENUE_EVENT_SPECIFIC', timestampBasis: 'FILING_ACCEPTANCE_PRICING_LISTING_AND_RETRIEVAL_TIMES', identifierBasis: 'CIK_ACCESSION_EXCHANGE_SYMBOL_AND_ALIAS_CHAIN' }),

  feature({ semanticKey: 'generic_factor_screener', featureName: 'Generic factor screener', publicRoute: '/screener', publicSection: 'research_analysis', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Filter securities by generic factor thresholds.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage0-Stage3 screening pipeline', officialCandidateSource: 'EXISTING_CANONICAL_STAGE_ARTIFACTS' }),
  feature({ semanticKey: 'market_leaders', featureName: 'Ranked market leaders', publicRoute: '/markets/leaders', publicSection: 'research_analysis', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Expose ranked leaders without bypassing canonical analysis.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage4 technical output and Stage6 modelTop6', officialCandidateSource: 'CANONICAL_STAGE3_AND_OHLCV_ARTIFACTS', publicationDelay: 'LATEST_COMPLETED_ANALYSIS_CHAIN', timestampBasis: 'STAGE_GENERATED_AT_AND_SOURCE_AS_OF', identifierBasis: 'CANONICAL_SYMBOL_AND_STAGE_FILE_HASH' }),
  feature({ semanticKey: 'pick_post_performance', featureName: 'Published decision post-performance review', publicRoute: '/research/picks', publicSection: 'research_analysis', category: 'pick_performance_process_review', intendedMeaning: 'Separate publication-time decision snapshot, process review, and later outcome.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'scripts/build-stage7-outcome-ledger.mjs and state/stage7-outcome-ledger.json', officialCandidateSource: 'IMMUTABLE_STAGE6_DECISION_AND_PROSPECTIVE_OHLCV_EVIDENCE', publicationDelay: 'HORIZON_MATURITY_REQUIRED', timestampBasis: 'DECISION_TIMESTAMP_AND_PROSPECTIVE_SESSION_TIMES', identifierBasis: 'LEDGER_ID_STAGE6_FILE_HASH_AND_CANONICAL_SYMBOL' }),
  feature({ semanticKey: 'korean_preferred_share_disparity', featureName: 'Korean preferred-share disparity', publicRoute: '/tools/pref-disparity', publicSection: 'research_analysis', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Compare Korean preferred and common share prices.', profile: 'nonUs', officialCandidateSource: 'Korea Exchange', identifierBasis: 'NON_US_SHARE_CLASS_IDENTIFIER' }),
  feature({ semanticKey: 'generic_stock_compare', featureName: 'Generic stock comparison', publicRoute: '/compare', publicSection: 'research_analysis', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Compare already available per-security fields side by side.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'existing Stage3-Stage6 artifacts and dashboard', officialCandidateSource: 'EXISTING_CANONICAL_STAGE_ARTIFACTS' }),
  feature({ semanticKey: 'semiconductor_ecosystem_map', featureName: 'Semiconductor relationship map', publicRoute: '/semiconductor', publicSection: 'research_analysis', category: 'thematic_supply_chain_maps', intendedMeaning: 'Represent source-backed supplier, customer, and segment relationships.', profile: 'medium', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'TradingCodex source-backed research package', officialCandidateSource: 'Issuer filings and official investor materials', publicationDelay: 'FILING_OR_ISSUER_PUBLICATION_DELAY', timestampBasis: 'RELATIONSHIP_DISCLOSURE_DATE_AND_RETRIEVAL_TIME', identifierBasis: 'ISSUER_CIK_RELATIONSHIP_TYPE_AND_EFFECTIVE_PERIOD' }),
  feature({ semanticKey: 'hbm_supply_chain_map', featureName: 'HBM supply-chain relationship map', publicRoute: '/markets/hbm-map', publicSection: 'research_analysis', category: 'thematic_supply_chain_maps', intendedMeaning: 'Represent filing-backed HBM ecosystem relationships without directional scoring.', profile: 'medium', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'TradingCodex source-backed research package', officialCandidateSource: 'Issuer filings and official investor materials', publicationDelay: 'FILING_OR_ISSUER_PUBLICATION_DELAY', timestampBasis: 'RELATIONSHIP_DISCLOSURE_DATE_AND_RETRIEVAL_TIME', identifierBasis: 'ISSUER_CIK_RELATIONSHIP_TYPE_AND_EFFECTIVE_PERIOD' }),
  feature({ semanticKey: 'etf_hub', featureName: 'US ETF metadata view', publicRoute: '/etf', publicSection: 'research_analysis', category: 'etf_fund_institutional_flow', intendedMeaning: 'Separate ETF structure, holdings, and delayed reports from daily fund flow.', profile: 'medium', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage0 universe can retain listed ETF rows but has no dedicated fund contract', officialCandidateSource: 'SEC Form N-PORT and issuer fund documents', publicationDelay: 'MONTHLY_REPORTING_WITH_PUBLICATION_DELAY', timestampBasis: 'REPORTING_PERIOD_FILING_ACCEPTANCE_AND_RETRIEVAL_TIME', identifierBasis: 'CIK_SERIES_CLASS_LEI_CUSIP_AND_SYMBOL_LINEAGE' }),
  feature({ semanticKey: 'etf_nav_disparity', featureName: 'ETF price-to-NAV context', publicRoute: '/markets/etf-disparity', publicSection: 'research_analysis', category: 'etf_fund_institutional_flow', intendedMeaning: 'Compare temporally aligned market price and official NAV or indicative value.', profile: 'license', officialCandidateSource: 'Fund issuer NAV plus licensed intraday market data', publicationDelay: 'NAV_DAILY_OR_INDICATIVE_VALUE_LICENSE_SPECIFIC', timestampBasis: 'NAV_AS_OF_AND_QUOTE_EVENT_TIME', identifierBasis: 'FUND_SERIES_CLASS_CUSIP_AND_SYMBOL_LINEAGE', primaryBlocker: 'TEMPORALLY_COMPARABLE_NAV_AND_QUOTE_SOURCE_NOT_ESTABLISHED' }),
  feature({ semanticKey: 'market_breadth', featureName: 'US market breadth context', publicRoute: '/markets/breadth', publicSection: 'research_analysis', category: 'market_breadth_sector_industry_leadership', intendedMeaning: 'Report advance and trend participation breadth from the canonical universe.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx marketRegimeSnapshot.breadth', officialCandidateSource: 'CANONICAL_STAGE3_SCOPE_AND_ADJUSTED_OHLCV', publicationDelay: 'LATEST_COMPLETED_MARKET_SESSION', timestampBasis: 'COMPLETED_SESSION_AND_ARTIFACT_RETRIEVED_AT', identifierBasis: 'CANONICAL_STAGE3_SYMBOL_SCOPE_AND_OHLCV_LINEAGE', nextAction: 'Reuse existing breadth fields; do not add a second breadth report or change its score impact.' }),
  feature({ semanticKey: 'ark_trade_disclosures', featureName: 'ARK published trade context', publicRoute: '/markets/ark', publicSection: 'research_analysis', category: 'etf_fund_institutional_flow', intendedMeaning: 'Treat publisher-disclosed fund transactions as delayed source evidence.', profile: 'license', officialCandidateSource: 'ARK publisher disclosures subject to terms review', publicationDelay: 'PUBLISHER_DISCLOSURE_DELAY', timestampBasis: 'TRADE_DATE_PUBLICATION_AND_RETRIEVAL_TIME', identifierBasis: 'FUND_SECURITY_AND_CANONICAL_SYMBOL_LINEAGE' }),
  feature({ semanticKey: 'crypto_dashboard', featureName: 'Crypto market dashboard', publicRoute: '/markets/crypto', publicSection: 'research_analysis', category: 'crypto_non_us_equity_features', intendedMeaning: 'Display crypto-asset market data.', profile: 'nonUs', officialCandidateSource: 'CRYPTO_EXCHANGE_OR_VENDOR', identifierBasis: 'CRYPTO_ASSET_IDENTIFIER' }),
  feature({ semanticKey: 'hyperliquid_context', featureName: 'Hyperliquid market context', publicRoute: '/markets/hyperliquid', publicSection: 'research_analysis', category: 'crypto_non_us_equity_features', intendedMeaning: 'Display decentralized perpetual-market activity.', profile: 'nonUs', officialCandidateSource: 'HYPERLIQUID_PROTOCOL_DATA', identifierBasis: 'CRYPTO_MARKET_IDENTIFIER' }),
  feature({ semanticKey: 'token_unlocks', featureName: 'Token unlock calendar', publicRoute: '/markets/token-unlocks', publicSection: 'research_analysis', category: 'crypto_non_us_equity_features', intendedMeaning: 'Track crypto token supply unlock events.', profile: 'nonUs', officialCandidateSource: 'TOKEN_ISSUER_OR_CHAIN_DATA', identifierBasis: 'CRYPTO_TOKEN_IDENTIFIER' }),
  feature({ semanticKey: 'tokenized_stocks', featureName: 'Tokenized-equity instruments', publicRoute: '/markets/tokenized-stocks', publicSection: 'research_analysis', category: 'crypto_non_us_equity_features', intendedMeaning: 'Display token representations of equities.', profile: 'nonUs', officialCandidateSource: 'TOKEN_ISSUER_AND_UNDERLYING_LISTING_SOURCE', identifierBasis: 'TOKEN_TO_UNDERLYING_SECURITY_LINEAGE' }),
  feature({ semanticKey: 'research_insights_hub', featureName: 'Research insight hub', publicRoute: '/insights', publicSection: 'research_analysis', category: 'news_source_reliability', intendedMeaning: 'Aggregate research narratives and deep dives.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'TradingCodex Research Package and Decision Package', officialCandidateSource: 'EXISTING_SOURCE_BACKED_RESEARCH_ARTIFACTS' }),
  feature({ semanticKey: 'market_brief', featureName: 'Market brief', publicRoute: '/market', publicSection: 'research_analysis', category: 'market_global_context', intendedMeaning: 'Summarize market regime, breadth, and risk source timing.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Telegram Market Pulse and Stage4 market regime summary', officialCandidateSource: 'EXISTING_MARKET_REGIME_AND_INDEX_SOURCE_CHAIN', publicationDelay: 'SOURCE_SPECIFIC', timestampBasis: 'SOURCE_CAPTURED_AT_AND_ANALYSIS_TIME', identifierBasis: 'MARKET_SERIES_IDENTIFIER' }),
  feature({ semanticKey: 'market_news', featureName: 'Source-attributed market news', publicRoute: '/news', publicSection: 'research_analysis', category: 'news_source_reliability', intendedMeaning: 'Retain publisher, publication time, retrieval time, and source reliability.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'HF/news research evidence and TradingCodex source-backed contract', officialCandidateSource: 'Issuer, regulator, and licensed news sources', publicationDelay: 'PUBLISHER_SPECIFIC', timestampBasis: 'PUBLISHED_AT_RETRIEVED_AT_AND_DECISION_TIME', identifierBasis: 'ISSUER_CIK_CANONICAL_SYMBOL_AND_ARTICLE_ID', primaryBlocker: 'ROW_LEVEL_SOURCE_RELIABILITY_NOT_UNIVERSALLY_PRESENT' }),
  feature({ semanticKey: 'investment_guide', featureName: 'Generic investment guide', publicRoute: '/guide', publicSection: 'research_analysis', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Explain investment concepts and workflows.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'docs/TRADING_CODEX_OPERATING_MODEL.md and docs/DECISION_PACKAGE_CONTRACT.md', officialCandidateSource: 'EXISTING_PROJECT_DOCUMENTATION' }),
  feature({ semanticKey: 'investment_glossary', featureName: 'Investment glossary', publicRoute: '/glossary', publicSection: 'research_analysis', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Define general market terminology.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'existing project documentation and UI labels', officialCandidateSource: 'EXISTING_PROJECT_DOCUMENTATION' }),
  feature({ semanticKey: 'crowd_prediction', featureName: 'Daily prediction game', publicRoute: '/predictions', publicSection: 'research_analysis', category: 'community_chat', intendedMeaning: 'Collect or display user predictions.', profile: 'lowSignal', officialCandidateSource: 'NONE_COMMUNITY_PREDICTION_IS_NOT_OFFICIAL_EVIDENCE', primaryBlocker: 'UNVERIFIED_CROWD_SIGNAL' }),

  feature({ semanticKey: 'investment_calculators', featureName: 'Investment calculators', publicRoute: '/tools', publicSection: 'tools_community', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Calculate generic returns, averaging, dividends, or position quantities.', profile: 'duplicate', existingRepository: 'MULTI_REPOSITORY', existingArtifactOrConsumer: 'Decision Package risk geometry and alpha-exec sizing/readiness contracts', officialCandidateSource: 'EXISTING_CANONICAL_DECISION_AND_EXECUTION_ARTIFACTS', policyRisk: 'DUPLICATE_SIZING_OR_EXECUTION_RESPONSIBILITY' }),
  feature({ semanticKey: 'interactive_technical_charts', featureName: 'Interactive technical chart', publicRoute: '/charts', publicSection: 'tools_community', category: 'screener_leader_anomaly_tools', intendedMeaning: 'Visualize canonical OHLCV and technical indicators.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx and dashboard chart components', officialCandidateSource: 'CANONICAL_ADJUSTED_OHLCV_ARTIFACT', publicationDelay: 'LATEST_COMPLETED_MARKET_SESSION', timestampBasis: 'OHLCV_SESSION_AND_RETRIEVAL_TIME', identifierBasis: 'CANONICAL_SYMBOL_AND_OHLCV_LINEAGE' }),
  feature({ semanticKey: 'watchlist', featureName: 'Analysis watchlist', publicRoute: '/watchlist', publicSection: 'tools_community', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Persist or display candidates awaiting evidence or price conditions.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Stage6 execution_contract.watchlistTop and application watchlist views', officialCandidateSource: 'CANONICAL_STAGE6_ARTIFACT', publicationDelay: 'ANALYSIS_CHAIN_GENERATION_TIME', timestampBasis: 'STAGE6_GENERATED_AT', identifierBasis: 'CANONICAL_SYMBOL_AND_STAGE6_FILE_HASH' }),
  feature({ semanticKey: 'community_forum', featureName: 'Community forum UX', publicRoute: '/community', publicSection: 'tools_community', category: 'community_chat', intendedMeaning: 'Allow authenticated users to discuss securities.', profile: 'authenticatedUx', officialCandidateSource: 'NONE_USER_GENERATED_CONTENT_NOT_PRODUCTION_EVIDENCE', identifierBasis: 'AUTHENTICATED_USER_CONTENT_OUTSIDE_ANALYSIS_CONTRACT' }),
  feature({ semanticKey: 'real_time_chat', featureName: 'Real-time chat UX', publicRoute: '/chat', publicSection: 'tools_community', category: 'community_chat', intendedMeaning: 'Provide authenticated real-time user chat.', profile: 'authenticatedUx', officialCandidateSource: 'NONE_USER_GENERATED_CONTENT_NOT_PRODUCTION_EVIDENCE', identifierBasis: 'AUTHENTICATED_USER_CONTENT_OUTSIDE_ANALYSIS_CONTRACT' }),
  feature({ semanticKey: 'multi_market_stock_explorer', featureName: 'Multi-market stock explorer', publicRoute: '/stocks?market=KR', publicSection: 'tools_community', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Browse US and non-US listings from one route.', profile: 'partial', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/UniverseGathering.tsx covers the US universe only', officialCandidateSource: 'US official listing sources; non-US expansion rejected', publicationDelay: 'LISTING_SOURCE_SPECIFIC', timestampBasis: 'LISTING_EFFECTIVE_AND_RETRIEVAL_TIME', identifierBasis: 'US_CANONICAL_SYMBOL_ONLY', policyRisk: 'MIXED_US_AND_NON_US_SCOPE', primaryBlocker: 'NON_US_MARKETS_OUT_OF_SCOPE', nextAction: 'Retain the US universe contract; do not expand to KR, JP, or HK.' }),

  feature({ semanticKey: 'authenticated_portfolio_ux', featureName: 'Authenticated portfolio UX', publicRoute: '/portfolio', publicSection: 'navigation_only', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Display user-entered holdings and portfolio views behind an authenticated boundary.', profile: 'authenticatedUx', existingRepository: 'alpha-exec-engine', existingArtifactOrConsumer: 'private PAPER performance and position reports are not public analysis inputs', officialCandidateSource: 'BROKER_VERIFIED_PRIVATE_ACCOUNT_EVIDENCE_ONLY', publicationDelay: 'BROKER_EVIDENCE_AS_OF', timestampBasis: 'BROKER_POSITION_AND_FILL_TIMESTAMPS', identifierBasis: 'PRIVATE_ACCOUNT_POSITION_IDENTITY_NEVER_PUBLIC', policyRisk: 'CREDENTIAL_PRIVACY_AND_EXECUTION_BOUNDARY' }),
  feature({ semanticKey: 'generic_site_search', featureName: 'Generic site search', publicRoute: '/search', publicSection: 'navigation_only', category: 'watchlist_portfolio_calculator_ux', intendedMeaning: 'Search existing public pages and securities.', profile: 'duplicate', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'existing universe and application navigation', officialCandidateSource: 'EXISTING_CANONICAL_STAGE_ARTIFACTS' }),
  feature({ semanticKey: 'ai_infrastructure_relationship_map', featureName: 'AI infrastructure relationship map', publicRoute: '/ai-infra-map', publicSection: 'navigation_only', category: 'thematic_supply_chain_maps', intendedMeaning: 'Represent source-backed AI infrastructure relationships without importing third-party topology.', profile: 'medium', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'TradingCodex source-backed research package', officialCandidateSource: 'Issuer SEC filings and official investor materials', publicationDelay: 'FILING_OR_ISSUER_PUBLICATION_DELAY', timestampBasis: 'RELATIONSHIP_DISCLOSURE_DATE_AND_RETRIEVAL_TIME', identifierBasis: 'ISSUER_CIK_RELATIONSHIP_TYPE_AND_EFFECTIVE_PERIOD' }),
  feature({ semanticKey: 'analyst_revision_target_dispersion', featureName: 'Analyst revision and target-dispersion evidence', publicRoute: '/research', publicSection: 'navigation_only', category: 'analyst_ratings_targets_revisions', intendedMeaning: 'Track published rating and target revisions, dispersion, and historical source accuracy.', profile: 'license', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'Decision Package has no verified comprehensive analyst-history source', officialCandidateSource: 'No comprehensive free official source identified', publicationDelay: 'ORIGINAL_REPORT_PUBLICATION_AND_VENDOR_CAPTURE_DELAY_REQUIRED', timestampBasis: 'REPORT_PUBLICATION_RETRIEVAL_AND_DECISION_TIMES', identifierBasis: 'ANALYST_FIRM_REPORT_ID_FIGI_OR_CANONICAL_SYMBOL', primaryBlocker: 'LICENSED_REPORT_HISTORY_AND_REVISION_LINEAGE_REQUIRED' }),
  feature({ semanticKey: 'market_heatmap', featureName: 'Market and sector heatmap', publicRoute: '/markets', publicSection: 'navigation_only', category: 'market_breadth_sector_industry_leadership', intendedMeaning: 'Visualize existing breadth and sector leadership without creating a new score.', profile: 'already', existingRepository: 'US_Alpha_Seeker', existingArtifactOrConsumer: 'components/TechnicalAnalysis.tsx breadth and components/FundamentalAnalysis.tsx sector baselines', officialCandidateSource: 'CANONICAL_STAGE3_SCOPE_AND_ADJUSTED_OHLCV', publicationDelay: 'LATEST_COMPLETED_MARKET_SESSION', timestampBasis: 'COMPLETED_SESSION_AND_ARTIFACT_RETRIEVED_AT', identifierBasis: 'CANONICAL_SYMBOL_SECTOR_AND_OHLCV_LINEAGE' })
]);

const NAVIGATION_ROUTE_ALIASES = Object.freeze([
  { publicRoute: '/미국주식-뉴스', semanticKey: 'market_news' },
  { publicRoute: '/실시간-증시속보', semanticKey: 'market_news' },
  { publicRoute: '/경제캘린더', semanticKey: 'economic_release_calendar' },
  { publicRoute: '/기업실적-캘린더', semanticKey: 'earnings_calendar' },
  { publicRoute: '/fed-fomc-일정', semanticKey: 'fedwatch_probability' }
]);

const NAVIGATION_HUB_ROUTES = Object.freeze([
  { publicRoute: '/', routeRole: 'HOME_HUB' },
  { publicRoute: '/features', routeRole: 'FEATURE_CATALOG' },
  { publicRoute: '/en/features', routeRole: 'FEATURE_CATALOG_LOCALE_ALIAS' },
  { publicRoute: '/events', routeRole: 'EVENT_HUB' }
]);

const PRIORITY0_REPORT_ONLY_EVIDENCE = Object.freeze([
  {
    capability: 'stage7_process_outcome_and_source_reliability',
    evidenceStatus: 'ALREADY_AVAILABLE',
    sourceArtifactRefs: ['scripts/build-stage7-outcome-ledger.mjs', 'docs/STAGE7_OUTCOME_LEDGER_CONTRACT.md'],
    sourceAsOf: 'DECISION_SNAPSHOT_TIMESTAMP_AND_PROSPECTIVE_SESSION',
    publicationDelayStatus: 'SOURCE_SPECIFIC_DELAY_RETAINED',
    identifierLineageStatus: 'STAGE6_FILE_HASH_LEDGER_ID_AND_CANONICAL_SYMBOL',
    comparisonStatus: 'PROSPECTIVE_ONLY_NO_LEGACY_REWRITE',
    reportOnlyVerdict: 'REUSE_EXISTING_STAGE7_LEDGER',
    policyImpact: POLICY_IMPACT
  },
  {
    capability: 'earnings_macro_fomc_event_risk_clock',
    evidenceStatus: 'PARTIAL_EXISTING_EVIDENCE',
    sourceArtifactRefs: ['components/TechnicalAnalysis.tsx', 'EARNINGS_EVENT_MAP', 'marketRegimeSnapshot'],
    sourceAsOf: 'SOURCE_ARTIFACT_RETRIEVED_AT',
    publicationDelayStatus: 'EARNINGS_PRESENT_UNIFIED_OFFICIAL_MACRO_RELEASE_CONTRACT_MISSING',
    identifierLineageStatus: 'CANONICAL_SYMBOL_FOR_EARNINGS_OFFICIAL_SERIES_ID_REQUIRED_FOR_MACRO',
    comparisonStatus: 'EVENT_CLOCK_PARTIAL',
    reportOnlyVerdict: 'REUSE_EARNINGS_AND_REGIME_ADD_OFFICIAL_MACRO_ONLY_AFTER_PROBE',
    policyImpact: POLICY_IMPACT
  },
  {
    capability: 'market_breadth_sector_industry_leadership',
    evidenceStatus: 'ALREADY_AVAILABLE',
    sourceArtifactRefs: ['components/TechnicalAnalysis.tsx marketRegimeSnapshot.breadth', 'components/FundamentalAnalysis.tsx sector baselines'],
    sourceAsOf: 'LATEST_COMPLETED_MARKET_SESSION',
    publicationDelayStatus: 'CANONICAL_OHLCV_SESSION_BOUND',
    identifierLineageStatus: 'STAGE3_SCOPE_AND_CANONICAL_SYMBOL',
    comparisonStatus: 'EXISTING_RUNTIME_CONTRACT',
    reportOnlyVerdict: 'REUSE_NO_SECOND_BREADTH_OR_SECTOR_REPORT',
    policyImpact: POLICY_IMPACT
  },
  {
    capability: 'source_freshness_and_publication_delay_integrity',
    evidenceStatus: 'PARTIAL_EXISTING_EVIDENCE',
    sourceArtifactRefs: ['Stage3-Stage7 input/output hashes and source timestamps', 'docs/STAGE7_OUTCOME_LEDGER_CONTRACT.md'],
    sourceAsOf: 'PER_SOURCE_ARTIFACT',
    publicationDelayStatus: 'NOT_UNIVERSAL_ACROSS_AUXILIARY_SOURCES',
    identifierLineageStatus: 'STAGE_FILE_HASH_PRESENT_SOURCE_SPECIFIC_IDENTIFIERS_PARTIAL',
    comparisonStatus: 'PARTIAL_SOURCE_CONTRACT',
    reportOnlyVerdict: 'EXTEND_ONLY_WITH_OFFICIAL_SOURCE_SPECIFIC_DELAY',
    policyImpact: POLICY_IMPACT
  },
  {
    capability: 'abnormal_move_and_volume_context',
    evidenceStatus: 'ALREADY_AVAILABLE',
    sourceArtifactRefs: ['components/TechnicalAnalysis.tsx OHLCV, OBV, MFI, volume compression, and freshness evidence'],
    sourceAsOf: 'LATEST_COMPLETED_MARKET_SESSION',
    publicationDelayStatus: 'CANONICAL_OHLCV_SESSION_BOUND',
    identifierLineageStatus: 'CANONICAL_SYMBOL_AND_OHLCV_SOURCE',
    comparisonStatus: 'EXISTING_TECHNICAL_CONTEXT',
    reportOnlyVerdict: 'REUSE_EXISTING_TECHNICAL_EVIDENCE_NO_NEW_ANOMALY_SCORE',
    policyImpact: POLICY_IMPACT
  },
  {
    capability: 'sec_finra_ownership_short_applicability',
    evidenceStatus: 'CAPABILITY_IMPLEMENTED_DISABLED',
    sourceArtifactRefs: ['US_Alpha_Seeker_Harvester/scripts/sec_finra_shadow_evidence.py', 'US_Alpha_Seeker_Harvester/fixtures/sec_finra_shadow_capability_contract.json'],
    sourceAsOf: 'FILING_OR_DATASET_PUBLICATION_TIMESTAMP',
    publicationDelayStatus: 'FORM_AND_FINRA_DATASET_SPECIFIC',
    identifierLineageStatus: 'CIK_ACCESSION_AND_FINRA_SYMBOL_LINEAGE',
    comparisonStatus: 'SHADOW_PROVIDER_DISABLED_BY_DEFAULT',
    reportOnlyVerdict: 'REUSE_EXISTING_PRODUCER_NO_DUPLICATE_IMPLEMENTATION',
    policyImpact: POLICY_IMPACT
  }
]);

const OFFICIAL_SOURCE_CAPABILITY_PACKAGES = Object.freeze([
  {
    capabilityId: 'MACRO_EVENT_CLOCK_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['Federal Reserve', 'U.S. Bureau of Labor Statistics', 'U.S. Bureau of Economic Analysis', 'FRED with originating-agency attribution'],
    officialDocumentation: ['https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'https://www.bls.gov/developers/', 'https://apps.bea.gov/api/signup/', 'https://fred.stlouisfed.org/docs/api/fred/overview.html'],
    machineReadableContract: 'SOURCE_CALENDAR_OR_OFFICIAL_SERIES_API_MUST_BE_PROVEN_PER_AGENCY',
    authenticationRequirement: 'BLS_V1_NONE_BLS_V2_OPTIONAL_KEY_BEA_AND_FRED_KEYS_REQUIRED',
    licenseOrTermsStatus: 'OFFICIAL_PUBLIC_DATA_TERMS_AND_ATTRIBUTION_REVIEW_REQUIRED',
    endpointOrDataset: 'FOMC calendar plus selected BLS/BEA/FRED release metadata and observations',
    requestBudget: 'PER_SOURCE_METADATA_LE1_DATA_LE1_NO_PAGINATION_NO_RETRY',
    rateLimit: 'RUNTIME_HEADERS_OR_OFFICIAL_PUBLISHED_LIMITS_CONTROL',
    pagination: 'DISABLED_FOR_CAPABILITY_PROBE',
    sourceTimestamp: 'OBSERVATION_PERIOD_AND_SOURCE_AS_OF',
    publicationTimestamp: 'OFFICIAL_RELEASE_OR_DOCUMENT_PUBLICATION_TIME',
    marketTimezone: 'SOURCE_TIMEZONE_WITH_UTC_NORMALIZATION',
    amendmentOrCorrectionHandling: 'REVISIONS_APPEND_NEW_VERSION_NEVER_REWRITE_DECISION_SNAPSHOT',
    identifierLineage: 'AGENCY_SERIES_OR_RELEASE_ID',
    tickerRenameMergerDelistingHandling: 'NOT_APPLICABLE_TO_MACRO_SERIES',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_MACRO_SHADOW_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_SOURCE_RUN_FINGERPRINT',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'FINRA_ATS_BLOCK_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['FINRA'],
    officialDocumentation: ['https://developer.finra.org/docs'],
    machineReadableContract: 'FINRA_QUERY_API_METADATA_AND_DATASET_SCHEMA',
    authenticationRequirement: 'FINRA_PUBLIC_OAUTH_CREDENTIAL',
    licenseOrTermsStatus: 'FINRA_EQUITY_DATA_TERMS_REVIEW_REQUIRED',
    endpointOrDataset: 'Weekly Summary ATS and Blocks Summary',
    requestBudget: 'OAUTH_LE1_METADATA_LE1_AND_LIMIT1_DATA_LE1_PER_DATASET_NO_RETRY',
    rateLimit: 'FINRA_RUNTIME_HEADERS_AND_PLATFORM_LIMITS',
    pagination: 'DISABLED_FOR_CAPABILITY_PROBE',
    sourceTimestamp: 'REPORTING_PERIOD',
    publicationTimestamp: 'FINRA_DATASET_PUBLICATION_TIME',
    marketTimezone: 'FINRA_DOCUMENTED_TIMEZONE',
    amendmentOrCorrectionHandling: 'DATA_VERSION_OR_ERRATA_RECORDED_AS_NEW_EVIDENCE',
    identifierLineage: 'FINRA_ISSUE_SYMBOL_ATS_ID_AND_CANONICAL_SYMBOL',
    tickerRenameMergerDelistingHandling: 'IDENTITY_MAP_ALIAS_CHAIN_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_FINRA_ATS_BLOCK_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_RUN_FINGERPRINT',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'EXCHANGE_REG_SHO_MATRIX_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['Nasdaq Trader', 'NYSE Regulation', 'other primary-listing SRO when mapped'],
    officialDocumentation: ['https://www.nasdaqtrader.com/trader.aspx?id=RegSHOThreshold', 'https://www.nyse.com/regulation/regulation-sho'],
    machineReadableContract: 'SRO_DAILY_THRESHOLD_FILE_OR_DOCUMENT_CONTRACT_PER_VENUE',
    authenticationRequirement: 'NONE_EXPECTED_BUT_MUST_BE_VERIFIED',
    licenseOrTermsStatus: 'SRO_TERMS_AND_REDISTRIBUTION_REVIEW_REQUIRED',
    endpointOrDataset: 'Daily exchange-listed Reg SHO threshold securities',
    requestBudget: 'ONE_METADATA_OR_FILE_REQUEST_PER_APPROVED_SRO_NO_PAGINATION_NO_RETRY',
    rateLimit: 'SRO_PUBLISHED_OR_RUNTIME_LIMITS',
    pagination: 'NOT_ALLOWED',
    sourceTimestamp: 'THRESHOLD_LIST_DATE',
    publicationTimestamp: 'FILE_CREATION_OR_PAGE_PUBLICATION_TIME',
    marketTimezone: 'AMERICA_NEW_YORK',
    amendmentOrCorrectionHandling: 'VENUE_REPUBLICATION_CAPTURED_AS_NEW_HASHED_VERSION',
    identifierLineage: 'PRIMARY_LISTING_VENUE_AND_SYMBOL_ALIAS_CHAIN',
    tickerRenameMergerDelistingHandling: 'LISTING_LIFECYCLE_CONTRACT_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_REG_SHO_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_VENUE_RUN',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'SRO_HALT_MANAGED_STATUS_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['Nasdaq Trader', 'NYSE Regulation', 'Cboe regulatory notices'],
    officialDocumentation: ['https://www.nasdaqtrader.com/trader.aspx?id=TradeHalts'],
    machineReadableContract: 'VENUE_HALT_AND_RESUMPTION_FILE_CONTRACT_PER_PRIMARY_LISTING_VENUE',
    authenticationRequirement: 'NONE_EXPECTED_BUT_MUST_BE_VERIFIED',
    licenseOrTermsStatus: 'SRO_TERMS_AND_REDISTRIBUTION_REVIEW_REQUIRED',
    endpointOrDataset: 'Current and historical trading halts plus managed-security status where officially published',
    requestBudget: 'ONE_METADATA_OR_FILE_REQUEST_PER_APPROVED_SRO_NO_PAGINATION_NO_RETRY',
    rateLimit: 'SRO_PUBLISHED_OR_RUNTIME_LIMITS',
    pagination: 'NOT_ALLOWED',
    sourceTimestamp: 'HALT_DECLARATION_RESUMPTION_OR_STATUS_EFFECTIVE_TIME',
    publicationTimestamp: 'VENUE_FILE_OR_NOTICE_PUBLICATION_TIME',
    marketTimezone: 'AMERICA_NEW_YORK',
    amendmentOrCorrectionHandling: 'VENUE_UPDATE_CAPTURED_AS_NEW_HASHED_VERSION',
    identifierLineage: 'PRIMARY_LISTING_VENUE_SYMBOL_AND_REASON_CODE',
    tickerRenameMergerDelistingHandling: 'EXISTING_LISTING_LIFECYCLE_CONTRACT_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_HALT_STATUS_SLICE_AND_CONTINUE_EXISTING_CANONICAL_QUALITY_GATES',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_VENUE_RUN',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'IPO_LOCKUP_CORPORATE_ACTION_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['SEC EDGAR', 'issuer filings', 'official listing venues'],
    officialDocumentation: ['https://www.sec.gov/search-filings/edgar-application-programming-interfaces'],
    machineReadableContract: 'SEC_SUBMISSIONS_METADATA_PLUS_TARGETED_FILING_PARSE_CONTRACT',
    authenticationRequirement: 'SEC_USER_AGENT_ONLY_NO_API_KEY',
    licenseOrTermsStatus: 'SEC_FAIR_ACCESS_AND_SRO_TERMS_REVIEW_REQUIRED',
    endpointOrDataset: 'Registration statements, prospectuses, amendments, and listing events',
    requestBudget: 'SEC_SUBMISSIONS_LE1_FILING_LE1_AND_ONE_APPROVED_SRO_METADATA_REQUEST_NO_RETRY',
    rateLimit: 'SEC_FAIR_ACCESS_AND_SRO_RUNTIME_LIMITS',
    pagination: 'DISABLED_FOR_CAPABILITY_PROBE',
    sourceTimestamp: 'FILING_EVENT_OR_EFFECTIVE_DATE',
    publicationTimestamp: 'EDGAR_ACCEPTANCE_OR_VENUE_PUBLICATION_TIME',
    marketTimezone: 'AMERICA_NEW_YORK_WITH_UTC_NORMALIZATION',
    amendmentOrCorrectionHandling: 'ACCESSION_CHAIN_AND_AMENDMENT_FORM_LINKED',
    identifierLineage: 'CIK_ACCESSION_CUSIP_EXCHANGE_SYMBOL_AND_ALIAS_CHAIN',
    tickerRenameMergerDelistingHandling: 'EXISTING_LISTING_LIFECYCLE_AND_CORPORATE_ACTION_CONTRACT',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_EVENT_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_SOURCE_RUN',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'CONGRESSIONAL_DISCLOSURE_SHADOW',
    capabilityStatus: 'BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['U.S. House Clerk', 'U.S. Senate eFD'],
    officialDocumentation: ['https://disclosures-clerk.house.gov/', 'https://efdsearch.senate.gov/search/'],
    machineReadableContract: 'OFFICIAL_PORTAL_DOCUMENT_AND_INDEX_CONTRACT_NOT_YET_PROVEN',
    authenticationRequirement: 'PUBLIC_PORTAL_TERMS_AND_INTERACTION_REVIEW_REQUIRED',
    licenseOrTermsStatus: 'ACCESS_AUTOMATION_AND_REDISTRIBUTION_REVIEW_REQUIRED',
    endpointOrDataset: 'Periodic transaction and financial disclosure documents',
    requestBudget: 'DISCOVERY_LE1_DOCUMENT_LE1_PER_CHAMBER_NO_PAGINATION_NO_RETRY',
    rateLimit: 'OFFICIAL_PORTAL_POLICY_CONTROLS',
    pagination: 'DISABLED_FOR_CAPABILITY_PROBE',
    sourceTimestamp: 'TRANSACTION_OR_REPORTING_DATE',
    publicationTimestamp: 'FILING_AND_PORTAL_PUBLICATION_TIME',
    marketTimezone: 'SOURCE_DOCUMENT_TIMEZONE_WITH_UTC_NORMALIZATION',
    amendmentOrCorrectionHandling: 'AMENDED_REPORT_LINKED_WITHOUT_REWRITING_PRIOR_DECISIONS',
    identifierLineage: 'FILER_REPORT_ASSET_DESCRIPTION_TO_ISSUER_MAPPING_REQUIRES_REVIEW',
    tickerRenameMergerDelistingHandling: 'ISSUER_IDENTITY_MAP_AND_ALIAS_CHAIN_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_CONGRESSIONAL_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_CHAMBER_RUN',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'ANALYST_REVISION_QUALITY_SHADOW',
    capabilityStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['No comprehensive free official source identified'],
    officialDocumentation: [],
    machineReadableContract: 'NOT_AVAILABLE',
    authenticationRequirement: 'VENDOR_DEPENDENT',
    licenseOrTermsStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    endpointOrDataset: 'Analyst ratings, target revisions, dispersion, and historical accuracy',
    requestBudget: 'ZERO_UNTIL_VENDOR_AND_TERMS_APPROVED',
    rateLimit: 'NOT_EVALUATED',
    pagination: 'NOT_EVALUATED',
    sourceTimestamp: 'RATING_PUBLICATION_TIME_REQUIRED',
    publicationTimestamp: 'VENDOR_CAPTURE_AND_ORIGINAL_PUBLICATION_TIME_REQUIRED',
    marketTimezone: 'SOURCE_SPECIFIC',
    amendmentOrCorrectionHandling: 'REVISION_CHAIN_REQUIRED',
    identifierLineage: 'ANALYST_FIRM_REPORT_ID_FIGI_OR_CANONICAL_SYMBOL',
    tickerRenameMergerDelistingHandling: 'IDENTITY_MAP_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'NO_EVIDENCE_PRODUCED_CANONICAL_ANALYSIS_CONTINUES',
    telegramAggregateAlertContract: 'NO_ALERT_UNTIL_CAPABILITY_EXISTS',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'ETF_FUND_FLOW_SHADOW',
    capabilityStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['SEC Form N-PORT for delayed holdings; no official free daily flow source identified'],
    officialDocumentation: ['https://www.sec.gov/data-research/sec-markets-data/form-n-port-data-sets'],
    machineReadableContract: 'N_PORT_DATASETS_ARE_HOLDINGS_NOT_DAILY_FLOW',
    authenticationRequirement: 'NONE_FOR_SEC_DATASETS_VENDOR_DEPENDENT_FOR_DAILY_FLOW',
    licenseOrTermsStatus: 'DAILY_FLOW_LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    endpointOrDataset: 'Form N-PORT holdings; daily creations/redemptions only after source approval',
    requestBudget: 'ZERO_DAILY_FLOW_REQUESTS_UNTIL_SOURCE_APPROVED_METADATA_LE1_FOR_FUTURE_SEC_PROBE',
    rateLimit: 'SOURCE_SPECIFIC',
    pagination: 'DISABLED_FOR_CAPABILITY_PROBE',
    sourceTimestamp: 'REPORTING_PERIOD_OR_FLOW_DATE',
    publicationTimestamp: 'FILING_OR_VENDOR_PUBLICATION_TIME',
    marketTimezone: 'SOURCE_SPECIFIC',
    amendmentOrCorrectionHandling: 'AMENDED_FILING_OR_VENDOR_REVISION_CHAIN',
    identifierLineage: 'CIK_SERIES_CLASS_LEI_CUSIP_AND_SYMBOL',
    tickerRenameMergerDelistingHandling: 'IDENTITY_MAP_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_FLOW_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_SOURCE_RUN_AFTER_ACTIVATION',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'THEMATIC_SUPPLY_CHAIN_LINEAGE_SHADOW',
    capabilityStatus: 'OFFICIAL_SOURCE_CONTRACT_INCOMPLETE',
    implementationRepository: 'US_Alpha_Seeker',
    officialSource: ['Issuer SEC filings and official investor materials'],
    officialDocumentation: ['https://www.sec.gov/search-filings/edgar-application-programming-interfaces'],
    machineReadableContract: 'RELATIONSHIP_EXTRACTION_CONTRACT_NOT_PROVEN',
    authenticationRequirement: 'SEC_USER_AGENT_FOR_EDGAR',
    licenseOrTermsStatus: 'OFFICIAL_FILING_ACCESS_ONLY_NO_THIRD_PARTY_MAP_COPY',
    endpointOrDataset: 'Filing-backed supplier, customer, segment, and product relationships',
    requestBudget: 'ZERO_UNTIL_EXTRACTION_SCHEMA_AND_REVIEW_FIXTURE_APPROVED',
    rateLimit: 'SEC_FAIR_ACCESS_IF_LATER_APPROVED',
    pagination: 'NOT_ALLOWED_IN_INITIAL_PROBE',
    sourceTimestamp: 'FILING_PERIOD_AND_ACCEPTANCE_TIME',
    publicationTimestamp: 'EDGAR_ACCEPTANCE_TIME',
    marketTimezone: 'UTC_FROM_SEC_ACCEPTANCE',
    amendmentOrCorrectionHandling: 'ACCESSION_AND_AMENDMENT_CHAIN',
    identifierLineage: 'ISSUER_CIK_RELATIONSHIP_TYPE_COUNTERPARTY_ID_AND_EFFECTIVE_PERIOD',
    tickerRenameMergerDelistingHandling: 'CIK_FIRST_ALIAS_CHAIN_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'NO_THEMATIC_EVIDENCE_CANONICAL_ANALYSIS_CONTINUES',
    telegramAggregateAlertContract: 'NO_ALERT_UNTIL_CAPABILITY_EXISTS',
    approvalRequired: true,
    externalRequestPerformed: false
  },
  {
    capabilityId: 'EXTENDED_HOURS_CONTEXT_SHADOW',
    capabilityStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    implementationRepository: 'US_Alpha_Seeker_Harvester',
    officialSource: ['Licensed exchange or broker market-data source'],
    officialDocumentation: [],
    machineReadableContract: 'SESSION_SPECIFIC_QUOTE_AND_TRADE_CONTRACT_NOT_PROVEN',
    authenticationRequirement: 'VENDOR_DEPENDENT',
    licenseOrTermsStatus: 'LICENSE_OR_ACCESS_REVIEW_REQUIRED',
    endpointOrDataset: 'Pre-market and after-hours quotes or trades',
    requestBudget: 'ZERO_UNTIL_PROVIDER_TERMS_AND_SESSION_FIELDS_APPROVED',
    rateLimit: 'NOT_EVALUATED',
    pagination: 'NOT_EVALUATED',
    sourceTimestamp: 'PROVIDER_EVENT_TIMESTAMP',
    publicationTimestamp: 'RETRIEVAL_TIME_PLUS_DELAY_TIER',
    marketTimezone: 'AMERICA_NEW_YORK',
    amendmentOrCorrectionHandling: 'PROVIDER_CORRECTION_OR_TRADE_CANCEL_STATUS_REQUIRED',
    identifierLineage: 'PROVIDER_SYMBOL_TO_CANONICAL_SYMBOL',
    tickerRenameMergerDelistingHandling: 'IDENTITY_MAP_REQUIRED',
    rawResponseRetention: false,
    canonicalSourceChanged: false,
    policyImpact: POLICY_IMPACT,
    failOpenBehavior: 'EXCLUDE_EXTENDED_HOURS_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS',
    telegramAggregateAlertContract: 'ONE_SAFE_AGGREGATE_ALERT_PER_RUN_AFTER_ACTIVATION',
    approvalRequired: true,
    externalRequestPerformed: false
  }
]);

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return repeated;
}

export function buildStockHubCapabilityAbsorption(features = STOCKHUB_PUBLIC_FEATURES) {
  const inventory = features.map((item) => ({ ...item }));
  const duplicateSemanticKeys = duplicates(inventory.map((item) => item.semanticKey));
  if (duplicateSemanticKeys.size) {
    throw new Error(`duplicate feature semantic key: ${[...duplicateSemanticKeys].sort().join(',')}`);
  }
  const duplicateRoutes = duplicates(inventory.map((item) => item.publicRoute));
  const duplicateNames = duplicates(inventory.map((item) => item.featureName));
  const unknownOrUnclassified = inventory.filter((item) => !STOCKHUB_COVERAGE_STATUSES.has(item.currentCoverageStatus)).length;
  const identifierUnknownOrUnclassifiedRows = inventory.filter((item) =>
    !item.identifierBasis || /UNKNOWN|UNCLASSIFIED/.test(item.identifierBasis)
  ).length;
  const publicationDelayUnknownOrUnclassifiedRows = inventory.filter((item) =>
    !item.publicationDelay || /UNKNOWN|UNCLASSIFIED/.test(item.publicationDelay)
  ).length;
  const requiredFields = [
    'featureName', 'publicRoute', 'category', 'reviewedAt', 'intendedMeaning',
    'existingRepository', 'existingArtifactOrConsumer', 'officialCandidateSource',
    'publicationDelay', 'timestampBasis', 'identifierBasis', 'currentCoverageStatus',
    'valuePriority', 'policyRisk', 'implementationDisposition', 'primaryBlocker', 'nextAction'
  ];
  const incompleteRows = inventory.filter((item) => requiredFields.some((key) => !Object.hasOwn(item, key))).length;
  const classifiedRows = inventory.filter((item) =>
    STOCKHUB_COVERAGE_STATUSES.has(item.currentCoverageStatus)
    && requiredFields.every((key) => Object.hasOwn(item, key))
  ).length;
  const classifiedFeatureCardRows = inventory.filter((item) =>
    item.publicSection !== 'navigation_only'
    && STOCKHUB_COVERAGE_STATUSES.has(item.currentCoverageStatus)
    && requiredFields.every((key) => Object.hasOwn(item, key))
  ).length;
  const statusCounts = Object.fromEntries([...STOCKHUB_COVERAGE_STATUSES].map((status) => [
    status,
    inventory.filter((item) => item.currentCoverageStatus === status).length
  ]));
  const categoryCounts = Object.fromEntries([...new Set(inventory.map((item) => item.category))]
    .sort()
    .map((category) => [category, inventory.filter((item) => item.category === category).length]));
  const navigationRouteAudit = [
    ...inventory.map((item) => ({ publicRoute: item.publicRoute, routeRole: 'FEATURE', semanticKey: item.semanticKey })),
    ...NAVIGATION_ROUTE_ALIASES.map((item) => ({ ...item, routeRole: 'SEMANTIC_ALIAS' })),
    ...NAVIGATION_HUB_ROUTES.map((item) => ({ ...item, semanticKey: null }))
  ].sort((a, b) => a.publicRoute.localeCompare(b.publicRoute));
  const duplicateNavigationRoutes = duplicates(navigationRouteAudit.map((item) => item.publicRoute));
  return {
    sourceRole: 'PUBLIC_FEATURE_IDEA_CATALOG_ONLY',
    sourceSnapshot: { ...SOURCE_SNAPSHOT },
    summary: {
      reviewedFeatureCount: inventory.length,
      classifiedRows,
      classifiedFeatureCardRows,
      featureCardCoveragePercent: Number((classifiedFeatureCardRows / SOURCE_SNAPSHOT.declaredFeatureCardCount * 100).toFixed(2)),
      featureCoveragePercent: Number((classifiedRows / SOURCE_SNAPSHOT.expectedUniqueFeatureCount * 100).toFixed(2)),
      navigationReviewedRouteCount: navigationRouteAudit.length,
      navigationRouteCoveragePercent: Number((navigationRouteAudit.length / SOURCE_SNAPSHOT.observedUniqueInternalRouteCount * 100).toFixed(2)),
      duplicateNavigationRouteRows: duplicateNavigationRoutes.size,
      unknownOrUnclassified,
      identifierUnknownOrUnclassifiedRows,
      publicationDelayUnknownOrUnclassifiedRows,
      incompleteRows,
      duplicatePublicRouteRows: duplicateRoutes.size,
      duplicateFeatureNameRows: duplicateNames.size,
      symbolHardcodeCount: inventory.filter((item) => item.specificTickerHardcoded === true).length,
      statusCounts,
      categoryCounts
    },
    inventory,
    navigationRouteAudit,
    priority0ReportOnlyEvidence: PRIORITY0_REPORT_ONLY_EVIDENCE.map((item) => ({ ...item })),
    officialSourceCapabilityPackages: OFFICIAL_SOURCE_CAPABILITY_PACKAGES.map((item) => ({ ...item })),
    repositoryChangeDisposition: [
      { repository: 'US_Alpha_Seeker', disposition: 'EXTEND_EXISTING_INSTITUTIONAL_AUDIT_ONLY' },
      { repository: 'US_Alpha_Seeker_Harvester', disposition: 'NO_CHANGE_EXISTING_SEC_FINRA_TOSS_CORPORATE_ACTION_CONTRACTS_REUSED' },
      { repository: 'alpha-exec-engine', disposition: 'NO_CHANGE_REPORT_ONLY_EXECUTION_MAPPING_SUFFICIENT' }
    ],
    invariants: {
      canonicalSourceChanged: false,
      policyImpact: POLICY_IMPACT,
      stage4ScoreChanged: false,
      stage6PolicyChanged: false,
      stage6RankingVerdictOrExecutableCountChanged: false,
      stage7BaseOosEligibilityChanged: false,
      stage7LegacySnapshotChanged: false,
      publicationDelayLookAheadAllowed: false,
      shortInterestCombinedWithShortSaleVolume: false,
      regShoUsedAsDirectSignal: false,
      communitySignalUsed: false,
      fixedThresholdImported: false,
      executionEffectAuthorized: false,
      duplicateArchitectureAdded: false,
      brokerOrStateMutation: false,
      externalRequestCount: 0,
      stockHubCredentialExposureCount: 0
    }
  };
}
