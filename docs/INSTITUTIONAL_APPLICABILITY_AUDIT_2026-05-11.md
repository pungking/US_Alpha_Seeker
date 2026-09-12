# Institutional Applicability Audit

- GeneratedAt: 2026-08-21T00:05:08.751Z
- Source: state/stage6-execution-gate-audit.json
- Latest Stage6: STAGE6_ALPHA_FINAL_2026-06-24_01-30-56.json
- Rows: 449
- Schema: institutional-applicability-audit-v3
- Contrarian review: rows=449, insufficient=0, unsupportedClaims=0
- Decision ticket: complete=0, partial=449, insufficient=0, unknown=0

## External Guide Gap Mapping

| Concept | Classification | Existing contract | Remaining gap |
| --- | --- | --- | --- |
| source_backed_analysis | PARTIALLY_COVERED | Stage3-7 lineage, freshness, and artifact evidence | AI narrative claims are not independently source-cited row by row. |
| analyst_risk_reviewer_role_separation | ALREADY_COVERED | TradingCodex specialist roster and repository boundaries | None |
| pre_trade_decision_ticket | PARTIALLY_COVERED | Decision Package plus Stage6 entry/stop/target evidence | Explicit thesis, holding horizon, and time-review evidence are not universally present. |
| independent_bear_case_challenge | PARTIALLY_COVERED | Deterministic report-only contrarian evidence review | No separate source provider or autonomous reviewer is introduced. |
| observable_thesis_invalidation | PARTIALLY_COVERED | Stage6 stop, structure, breakout, target, and risk evidence | Time-based invalidation is not universally source-backed. |
| post_trade_process_review | PARTIALLY_COVERED | Stage7 outcome ledger with process review pending contract | Verified process scoring requires broker-confirmed terminal PAPER lifecycle evidence. |
| generic_fixed_thresholds_or_stop_ranges | REJECT_GENERIC_RULE | Stage-specific, regime-aware, geometry-aware policy | None |

## StockHub Public Capability Absorption

- Role: PUBLIC_FEATURE_IDEA_CATALOG_ONLY
- Snapshot: https://stockhub.kr/features (2026-08-21T00:00:00+09:00, sha256=187064a8040db8b43a637b55dc5469ebfef3bdf1d032bc6d34ecc3d4ce523243)
- Public feature cards: 65/65 (100%)
- Unique public capabilities: 70/70 (100%)
- Public navigation routes: 79/79 (100%)
- Unknown/unclassified: 0
- Identifier/publication-delay unknown: 0/0
- StockHub credentials/authenticated access: NOT_USED

### Coverage Status

| Status | Count |
| --- | ---: |
| ALREADY_COVERED | 9 |
| PARTIALLY_COVERED | 13 |
| MISSING_HIGH_VALUE | 6 |
| MISSING_MEDIUM_VALUE | 5 |
| DUPLICATE_REJECTED | 8 |
| LOW_SIGNAL_REJECTED | 2 |
| UNSOURCED_CLAIM_REJECTED | 3 |
| OUT_OF_SCOPE_NON_US_EQUITY | 15 |
| LICENSE_OR_ACCESS_REVIEW_REQUIRED | 6 |
| AUTHENTICATED_UX_REVIEW_REQUIRED | 3 |
| EXECUTION_RELATED_SEPARATE_APPROVAL | 0 |

### Full Public Feature Coverage

| # | Feature | Route | Category | Coverage | Priority | Existing contract | Official candidate | Disposition | Primary blocker | Next action |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Japan listed equities view | /japan-stocks | market_global_context | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Japan Exchange Group | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 2 | China listed equities view | /china-stocks | market_global_context | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Official mainland exchange sources | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 3 | Japan-linked US ADR view | /markets/japan | market_global_context | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: components/UniverseGathering.tsx | SEC issuer filings plus exchange listing metadata | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | ISSUER_DOMICILE_LINEAGE_NOT_EXPLICIT | Reuse the existing artifact and close only the documented lineage gap. |
| 4 | China-linked US ADR view | /markets/china | market_global_context | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: components/UniverseGathering.tsx | SEC issuer filings plus exchange listing metadata | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | ISSUER_DOMICILE_LINEAGE_NOT_EXPLICIT | Reuse the existing artifact and close only the documented lineage gap. |
| 5 | US pre-market and after-hours context | /backpack | pre_market_after_hours_movers | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: toss-market-data-shadow-v1 plus canonical OHLCV handoff | Licensed exchange or broker market-data contract | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SESSION_SPECIFIC_QUOTE_PROVENANCE_NOT_ESTABLISHED | Reuse the existing artifact and close only the documented lineage gap. |
| 6 | Cross-asset market-cap table | /markets/assets | market_global_context | LOW_SIGNAL_REJECTED | REJECT_LOW_SIGNAL | NONE: NONE | Multiple official and licensed asset-class sources | REJECT_AS_DECISION_EVIDENCE | INSUFFICIENT_DECISION_VALUE | Do not ingest unless a future source-backed report-only use is proven. |
| 7 | KOSPI futures context | /markets/kospi-futures | market_global_context | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 8 | Nasdaq futures context | /markets/nasdaq-futures | volatility_rates_fx_commodities | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | US_Alpha_Seeker: components/TechnicalAnalysis.tsx market regime overlay | CME market-data license | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | NO_VERIFIED_FREE_OFFICIAL_PRODUCTION_SOURCE | Review official terms and machine-readable access before any probe. |
| 9 | Trading halt and managed-security status | /markets/trading-halt | reg_sho_halts_managed_securities | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: Nasdaq trading-halt and listing lifecycle contracts | Nasdaq Trader plus NYSE/Cboe official SRO feeds | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | ALL_VENUE_SOURCE_MATRIX_INCOMPLETE | Reuse the existing artifact and close only the documented lineage gap. |
| 10 | Global market context | /markets/global | market_global_context | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: components/TechnicalAnalysis.tsx marketRegimeSnapshot and Telegram market pulse | Federal Reserve, FRED source agencies, CFTC, and licensed exchange data | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE | Reuse the existing artifact and close only the documented lineage gap. |
| 11 | Fund-flow context | /flows | etf_fund_institutional_flow | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | NONE: NONE | SEC Form N-PORT for delayed holdings; licensed source for daily flows | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | NO_VERIFIED_FREE_OFFICIAL_PRODUCTION_SOURCE | Review official terms and machine-readable access before any probe. |
| 12 | Korean corporate-group flow | /group-flows | etf_fund_institutional_flow | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 13 | Korean foreign ownership | /markets/foreign | etf_fund_institutional_flow | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 14 | Korean foreign-broker flow | /foreign-brokers | etf_fund_institutional_flow | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange or licensed Korean broker data | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 15 | Composite supply-demand score | /supply-score | screener_leader_anomaly_tools | UNSOURCED_CLAIM_REJECTED | REJECT_UNSOURCED | US_Alpha_Seeker: Stage6 evidence lanes remain canonical | NONE_SINGLE_SCORE_IS_NOT_AN_OFFICIAL_SOURCE | REJECT_UNTIL_OFFICIAL_EVIDENCE_EXISTS | PROPRIETARY_SCORE_METHOD_AND_SOURCE_NOT_VERIFIED | Do not import the score, label, threshold, or directional interpretation. |
| 16 | Korean margin balance and deposits | /leverage | volatility_rates_fx_commodities | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange and Korean financial authorities | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 17 | US short-market evidence | /markets/short-selling | finra_short_interest_short_sale_volume_ats_blocks | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: sec-finra-shadow-capability-v1 and sec-finra-shadow-evidence-v1 | FINRA consolidatedShortInterest and regShoDaily | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE | Reuse the disabled SEC/FINRA SHADOW producer; never combine short interest and short-sale volume. |
| 18 | FINRA ATS activity | /markets/darkpool | finra_short_interest_short_sale_volume_ats_blocks | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | US_Alpha_Seeker_Harvester: SEC/FINRA SHADOW source abstraction | FINRA Weekly Summary ATS dataset | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN | Use FINRA_ATS_BLOCK_SHADOW bounded package; do not label as live smart-money trading. |
| 19 | FINRA block-trade aggregate | /markets/blocks | finra_short_interest_short_sale_volume_ats_blocks | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | US_Alpha_Seeker_Harvester: SEC/FINRA SHADOW source abstraction | FINRA Blocks Summary dataset | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN | Use FINRA_ATS_BLOCK_SHADOW bounded package; do not infer buyer direction. |
| 20 | Korean intraday investor flow | /markets?tab=fundflow | etf_fund_institutional_flow | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange or licensed Korean market data | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 21 | US ownership and institutional filing context | /research/investors | sec_ownership_insider_13dg_13f | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: sec-finra-shadow-evidence-v1 | SEC Forms 3/4/5, Schedule 13D/13G, and Form 13F | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE | Reuse the existing artifact and close only the documented lineage gap. |
| 22 | Korean insider transactions | /insider | sec_ownership_insider_13dg_13f | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korean regulatory filing source | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 23 | US congressional transaction disclosures | /politician-stocks | congressional_public_official_disclosures | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | NONE: NONE | U.S. House Clerk and U.S. Senate eFD official disclosure portals | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | MACHINE_READABLE_ACCESS_AND_ASSET_IDENTIFIER_LINEAGE_UNPROVEN | Use the matching bounded official-source package; do not affect policy. |
| 24 | Korean national-pension holdings | /national-pension | etf_fund_institutional_flow | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korean National Pension Service disclosures | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 25 | Institutional holder view | /investors | sec_ownership_insider_13dg_13f | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: Form 13F SEC/FINRA SHADOW family | SEC Form 13F | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE | Reuse 13F evidence and keep the reporting-period delay visible. |
| 26 | Flow lead or divergence label | /markets/flow-lead | screener_leader_anomaly_tools | UNSOURCED_CLAIM_REJECTED | REJECT_UNSOURCED | NONE: NONE | NO_SINGLE_OFFICIAL_DIRECTIONAL_LABEL | REJECT_UNTIL_OFFICIAL_EVIDENCE_EXISTS | DIRECTIONAL_METHOD_AND_COMPARABLE_SOURCE_UNVERIFIED | Do not import the score, label, threshold, or directional interpretation. |
| 27 | IPO lockup event clock | /markets/lockups | corporate_actions_ipo_lockup_delisting_merger | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | US_Alpha_Seeker_Harvester: corporate-action and listing-lifecycle source abstractions | SEC registration statements, prospectuses, and issuer filings | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN | Use the matching bounded official-source package; do not affect policy. |
| 28 | Corporate-action event evidence | /markets/corp-actions | corporate_actions_ipo_lockup_delisting_merger | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker_Harvester: fixtures/corporate_action_lineage_contract.json and listing_lifecycle_contract.json | Issuer filings and official listing venues | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 29 | Reg SHO threshold evidence | /markets/regsho | reg_sho_halts_managed_securities | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: FINRA thresholdList SHADOW evidence | FINRA plus Nasdaq and NYSE official threshold lists | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | EXCHANGE_LISTED_SRO_SOURCE_MATRIX_NOT_IMPLEMENTED | Use EXCHANGE_REG_SHO_MATRIX_SHADOW package; keep direct-signal rejection. |
| 30 | Short-squeeze watch score | /markets/squeeze | screener_leader_anomaly_tools | UNSOURCED_CLAIM_REJECTED | REJECT_UNSOURCED | US_Alpha_Seeker_Harvester: SEC/FINRA SHADOW evidence remains raw report-only context | MULTIPLE_SOURCES_REQUIRED_NO_OFFICIAL_SQUEEZE_SCORE | REJECT_UNTIL_OFFICIAL_EVIDENCE_EXISTS | BORROW_COST_AND_FLOAT_SOURCE_CONTRACT_NOT_PROVEN | Do not import the score, label, threshold, or directional interpretation. |
| 31 | Schedule 13D and 13G ownership changes | /smart-money/13f/13dg | sec_ownership_insider_13dg_13f | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker_Harvester: Schedule 13D/13G SEC SHADOW family | SEC EDGAR Schedule 13D/13G filings | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | SOURCE_OR_PUBLICATION_LINEAGE_INCOMPLETE | Reuse the existing artifact and close only the documented lineage gap. |
| 32 | Official macro-series context | /macro | volatility_rates_fx_commodities | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: components/TechnicalAnalysis.tsx market regime and macro overlay | Federal Reserve, BLS, BEA, and FRED source agencies | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | UNIFIED_OFFICIAL_RELEASE_AND_REVISION_LINEAGE_MISSING | Reuse the existing artifact and close only the documented lineage gap. |
| 33 | Economic release calendar | /events?tab=economic | earnings_economic_fomc_calendar | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | US_Alpha_Seeker_Harvester: existing event-map handoff can be reused | Federal Reserve, BLS, and BEA official release calendars | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN | Use the matching bounded official-source package; do not affect policy. |
| 34 | Earnings event calendar | /events?tab=earnings | earnings_economic_fomc_calendar | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker_Harvester: EARNINGS_EVENT_MAP and components/TechnicalAnalysis.tsx | Issuer investor-relations announcements and SEC filings | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 35 | Policy-rate probability view | /fed-watch | earnings_economic_fomc_calendar | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | US_Alpha_Seeker: FOMC dates may map to event-risk clock; probabilities are absent | Federal Reserve for calendar; CME FedWatch or licensed futures data for probabilities | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | PROBABILITY_DATA_LICENSE_NOT_ESTABLISHED | Review official terms and machine-readable access before any probe. |
| 36 | AI-related revenue disclosure context | /markets/ai-revenue | thematic_supply_chain_maps | MISSING_MEDIUM_VALUE | P2_AFTER_HIGH_VALUE_CAPABILITIES | US_Alpha_Seeker: Stage3 fundamentals and source-backed research contract | Issuer 10-K, 10-Q, 8-K, and earnings materials | DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN | OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE | Keep report-only and defer implementation until lineage is proven. |
| 37 | Integrated market situation view | /markets/command | market_global_context | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: TradingCodex, Stage4 marketRegimeSnapshot, Stage6 execution_contract, and Telegram report | EXISTING_SOURCE_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 38 | US IPO filing and listing event clock | /ipo | corporate_actions_ipo_lockup_delisting_merger | MISSING_HIGH_VALUE | P1_BOUNDED_CAPABILITY | US_Alpha_Seeker_Harvester: listing lifecycle and corporate-action source abstractions | SEC registration statements/prospectuses and official listing venues | BOUNDED_OFFICIAL_SOURCE_CAPABILITY_REQUIRED | OFFICIAL_SOURCE_CAPABILITY_NOT_PROVEN | Use the matching bounded official-source package; do not affect policy. |
| 39 | Generic factor screener | /screener | screener_leader_anomaly_tools | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: Stage0-Stage3 screening pipeline | EXISTING_CANONICAL_STAGE_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 40 | Ranked market leaders | /markets/leaders | screener_leader_anomaly_tools | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: Stage4 technical output and Stage6 modelTop6 | CANONICAL_STAGE3_AND_OHLCV_ARTIFACTS | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 41 | Published decision post-performance review | /research/picks | pick_performance_process_review | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: scripts/build-stage7-outcome-ledger.mjs and state/stage7-outcome-ledger.json | IMMUTABLE_STAGE6_DECISION_AND_PROSPECTIVE_OHLCV_EVIDENCE | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 42 | Korean preferred-share disparity | /tools/pref-disparity | screener_leader_anomaly_tools | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | Korea Exchange | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 43 | Generic stock comparison | /compare | screener_leader_anomaly_tools | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: existing Stage3-Stage6 artifacts and dashboard | EXISTING_CANONICAL_STAGE_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 44 | Semiconductor relationship map | /semiconductor | thematic_supply_chain_maps | MISSING_MEDIUM_VALUE | P2_AFTER_HIGH_VALUE_CAPABILITIES | US_Alpha_Seeker: TradingCodex source-backed research package | Issuer filings and official investor materials | DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN | OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE | Keep report-only and defer implementation until lineage is proven. |
| 45 | HBM supply-chain relationship map | /markets/hbm-map | thematic_supply_chain_maps | MISSING_MEDIUM_VALUE | P2_AFTER_HIGH_VALUE_CAPABILITIES | US_Alpha_Seeker: TradingCodex source-backed research package | Issuer filings and official investor materials | DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN | OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE | Keep report-only and defer implementation until lineage is proven. |
| 46 | US ETF metadata view | /etf | etf_fund_institutional_flow | MISSING_MEDIUM_VALUE | P2_AFTER_HIGH_VALUE_CAPABILITIES | US_Alpha_Seeker: Stage0 universe can retain listed ETF rows but has no dedicated fund contract | SEC Form N-PORT and issuer fund documents | DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN | OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE | Keep report-only and defer implementation until lineage is proven. |
| 47 | ETF price-to-NAV context | /markets/etf-disparity | etf_fund_institutional_flow | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | NONE: NONE | Fund issuer NAV plus licensed intraday market data | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | TEMPORALLY_COMPARABLE_NAV_AND_QUOTE_SOURCE_NOT_ESTABLISHED | Review official terms and machine-readable access before any probe. |
| 48 | US market breadth context | /markets/breadth | market_breadth_sector_industry_leadership | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: components/TechnicalAnalysis.tsx marketRegimeSnapshot.breadth | CANONICAL_STAGE3_SCOPE_AND_ADJUSTED_OHLCV | REUSE_EXISTING_CONTRACT | NONE | Reuse existing breadth fields; do not add a second breadth report or change its score impact. |
| 49 | ARK published trade context | /markets/ark | etf_fund_institutional_flow | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | NONE: NONE | ARK publisher disclosures subject to terms review | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | NO_VERIFIED_FREE_OFFICIAL_PRODUCTION_SOURCE | Review official terms and machine-readable access before any probe. |
| 50 | Crypto market dashboard | /markets/crypto | crypto_non_us_equity_features | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | CRYPTO_EXCHANGE_OR_VENDOR | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 51 | Hyperliquid market context | /markets/hyperliquid | crypto_non_us_equity_features | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | HYPERLIQUID_PROTOCOL_DATA | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 52 | Token unlock calendar | /markets/token-unlocks | crypto_non_us_equity_features | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | TOKEN_ISSUER_OR_CHAIN_DATA | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 53 | Tokenized-equity instruments | /markets/tokenized-stocks | crypto_non_us_equity_features | OUT_OF_SCOPE_NON_US_EQUITY | OUT_OF_SCOPE | NONE: NONE | TOKEN_ISSUER_AND_UNDERLYING_LISTING_SOURCE | REJECT_NON_US_EQUITY_SCOPE | US_EQUITY_SCOPE_BOUNDARY | Keep outside the US Alpha Seeker universe. |
| 54 | Research insight hub | /insights | news_source_reliability | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: TradingCodex Research Package and Decision Package | EXISTING_SOURCE_BACKED_RESEARCH_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 55 | Market brief | /market | market_global_context | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: Telegram Market Pulse and Stage4 market regime summary | EXISTING_MARKET_REGIME_AND_INDEX_SOURCE_CHAIN | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 56 | Source-attributed market news | /news | news_source_reliability | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: HF/news research evidence and TradingCodex source-backed contract | Issuer, regulator, and licensed news sources | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | ROW_LEVEL_SOURCE_RELIABILITY_NOT_UNIVERSALLY_PRESENT | Reuse the existing artifact and close only the documented lineage gap. |
| 57 | Generic investment guide | /guide | watchlist_portfolio_calculator_ux | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: docs/TRADING_CODEX_OPERATING_MODEL.md and docs/DECISION_PACKAGE_CONTRACT.md | EXISTING_PROJECT_DOCUMENTATION | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 58 | Investment glossary | /glossary | watchlist_portfolio_calculator_ux | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: existing project documentation and UI labels | EXISTING_PROJECT_DOCUMENTATION | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 59 | Daily prediction game | /predictions | community_chat | LOW_SIGNAL_REJECTED | REJECT_LOW_SIGNAL | NONE: NONE | NONE_COMMUNITY_PREDICTION_IS_NOT_OFFICIAL_EVIDENCE | REJECT_AS_DECISION_EVIDENCE | UNVERIFIED_CROWD_SIGNAL | Do not ingest unless a future source-backed report-only use is proven. |
| 60 | Investment calculators | /tools | watchlist_portfolio_calculator_ux | DUPLICATE_REJECTED | REJECT_DUPLICATE | MULTI_REPOSITORY: Decision Package risk geometry and alpha-exec sizing/readiness contracts | EXISTING_CANONICAL_DECISION_AND_EXECUTION_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 61 | Interactive technical chart | /charts | screener_leader_anomaly_tools | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: components/TechnicalAnalysis.tsx and dashboard chart components | CANONICAL_ADJUSTED_OHLCV_ARTIFACT | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 62 | Analysis watchlist | /watchlist | watchlist_portfolio_calculator_ux | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: Stage6 execution_contract.watchlistTop and application watchlist views | CANONICAL_STAGE6_ARTIFACT | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |
| 63 | Community forum UX | /community | community_chat | AUTHENTICATED_UX_REVIEW_REQUIRED | UX_ONLY_DEFERRED | NONE: NONE | NONE_USER_GENERATED_CONTENT_NOT_PRODUCTION_EVIDENCE | NO_CODE_OR_CREDENTIAL_COLLECTION | LOGIN_REQUIRED_FOR_COMPLETE_UX_REVIEW | If ever reviewed, the user logs in directly; do not receive credentials or cookies. |
| 64 | Real-time chat UX | /chat | community_chat | AUTHENTICATED_UX_REVIEW_REQUIRED | UX_ONLY_DEFERRED | NONE: NONE | NONE_USER_GENERATED_CONTENT_NOT_PRODUCTION_EVIDENCE | NO_CODE_OR_CREDENTIAL_COLLECTION | LOGIN_REQUIRED_FOR_COMPLETE_UX_REVIEW | If ever reviewed, the user logs in directly; do not receive credentials or cookies. |
| 65 | Multi-market stock explorer | /stocks?market=KR | watchlist_portfolio_calculator_ux | PARTIALLY_COVERED | P0_OR_P1_COMPLETE_EXISTING_CONTRACT | US_Alpha_Seeker: components/UniverseGathering.tsx covers the US universe only | US official listing sources; non-US expansion rejected | EXTEND_EXISTING_CONTRACT_ONLY_IF_SOURCE_PROVEN | NON_US_MARKETS_OUT_OF_SCOPE | Retain the US universe contract; do not expand to KR, JP, or HK. |
| 66 | Authenticated portfolio UX | /portfolio | watchlist_portfolio_calculator_ux | AUTHENTICATED_UX_REVIEW_REQUIRED | UX_ONLY_DEFERRED | alpha-exec-engine: private PAPER performance and position reports are not public analysis inputs | BROKER_VERIFIED_PRIVATE_ACCOUNT_EVIDENCE_ONLY | NO_CODE_OR_CREDENTIAL_COLLECTION | LOGIN_REQUIRED_FOR_COMPLETE_UX_REVIEW | If ever reviewed, the user logs in directly; do not receive credentials or cookies. |
| 67 | Generic site search | /search | watchlist_portfolio_calculator_ux | DUPLICATE_REJECTED | REJECT_DUPLICATE | US_Alpha_Seeker: existing universe and application navigation | EXISTING_CANONICAL_STAGE_ARTIFACTS | REJECT_DUPLICATE_EXISTING_CONTRACT | EXISTING_CONTRACT_ALREADY_OWNS_MEANING | Do not add another planner, ledger, screener, or dashboard contract. |
| 68 | AI infrastructure relationship map | /ai-infra-map | thematic_supply_chain_maps | MISSING_MEDIUM_VALUE | P2_AFTER_HIGH_VALUE_CAPABILITIES | US_Alpha_Seeker: TradingCodex source-backed research package | Issuer SEC filings and official investor materials | DEFER_UNTIL_OFFICIAL_LINEAGE_PROVEN | OFFICIAL_SOURCE_OR_IDENTIFIER_LINEAGE_INCOMPLETE | Keep report-only and defer implementation until lineage is proven. |
| 69 | Analyst revision and target-dispersion evidence | /research | analyst_ratings_targets_revisions | LICENSE_OR_ACCESS_REVIEW_REQUIRED | P1_OR_P2_AFTER_TERMS_REVIEW | US_Alpha_Seeker: Decision Package has no verified comprehensive analyst-history source | No comprehensive free official source identified | DEFER_FOR_LICENSE_OR_ACCESS_REVIEW | LICENSED_REPORT_HISTORY_AND_REVISION_LINEAGE_REQUIRED | Review official terms and machine-readable access before any probe. |
| 70 | Market and sector heatmap | /markets | market_breadth_sector_industry_leadership | ALREADY_COVERED | P0_REUSE_EXISTING | US_Alpha_Seeker: components/TechnicalAnalysis.tsx breadth and components/FundamentalAnalysis.tsx sector baselines | CANONICAL_STAGE3_SCOPE_AND_ADJUSTED_OHLCV | REUSE_EXISTING_CONTRACT | NONE | Keep the existing artifact and verify prospective lineage. |

### Priority 0 Existing-Evidence Reuse

| Capability | Evidence status | Source refs | Publication delay | Identifier lineage | Verdict | Policy impact |
| --- | --- | --- | --- | --- | --- | --- |
| stage7_process_outcome_and_source_reliability | ALREADY_AVAILABLE | scripts/build-stage7-outcome-ledger.mjs; docs/STAGE7_OUTCOME_LEDGER_CONTRACT.md | SOURCE_SPECIFIC_DELAY_RETAINED | STAGE6_FILE_HASH_LEDGER_ID_AND_CANONICAL_SYMBOL | REUSE_EXISTING_STAGE7_LEDGER | NONE_REPORT_ONLY |
| earnings_macro_fomc_event_risk_clock | PARTIAL_EXISTING_EVIDENCE | components/TechnicalAnalysis.tsx; EARNINGS_EVENT_MAP; marketRegimeSnapshot | EARNINGS_PRESENT_UNIFIED_OFFICIAL_MACRO_RELEASE_CONTRACT_MISSING | CANONICAL_SYMBOL_FOR_EARNINGS_OFFICIAL_SERIES_ID_REQUIRED_FOR_MACRO | REUSE_EARNINGS_AND_REGIME_ADD_OFFICIAL_MACRO_ONLY_AFTER_PROBE | NONE_REPORT_ONLY |
| market_breadth_sector_industry_leadership | ALREADY_AVAILABLE | components/TechnicalAnalysis.tsx marketRegimeSnapshot.breadth; components/FundamentalAnalysis.tsx sector baselines | CANONICAL_OHLCV_SESSION_BOUND | STAGE3_SCOPE_AND_CANONICAL_SYMBOL | REUSE_NO_SECOND_BREADTH_OR_SECTOR_REPORT | NONE_REPORT_ONLY |
| source_freshness_and_publication_delay_integrity | PARTIAL_EXISTING_EVIDENCE | Stage3-Stage7 input/output hashes and source timestamps; docs/STAGE7_OUTCOME_LEDGER_CONTRACT.md | NOT_UNIVERSAL_ACROSS_AUXILIARY_SOURCES | STAGE_FILE_HASH_PRESENT_SOURCE_SPECIFIC_IDENTIFIERS_PARTIAL | EXTEND_ONLY_WITH_OFFICIAL_SOURCE_SPECIFIC_DELAY | NONE_REPORT_ONLY |
| abnormal_move_and_volume_context | ALREADY_AVAILABLE | components/TechnicalAnalysis.tsx OHLCV, OBV, MFI, volume compression, and freshness evidence | CANONICAL_OHLCV_SESSION_BOUND | CANONICAL_SYMBOL_AND_OHLCV_SOURCE | REUSE_EXISTING_TECHNICAL_EVIDENCE_NO_NEW_ANOMALY_SCORE | NONE_REPORT_ONLY |
| sec_finra_ownership_short_applicability | CAPABILITY_IMPLEMENTED_DISABLED | US_Alpha_Seeker_Harvester/scripts/sec_finra_shadow_evidence.py; US_Alpha_Seeker_Harvester/fixtures/sec_finra_shadow_capability_contract.json | FORM_AND_FINRA_DATASET_SPECIFIC | CIK_ACCESSION_AND_FINRA_SYMBOL_LINEAGE | REUSE_EXISTING_PRODUCER_NO_DUPLICATE_IMPLEMENTATION | NONE_REPORT_ONLY |

### Bounded Official-Source Packages

| Capability | Status | Repository | Official source | Access/terms | Request budget | Lineage | Fail-open |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MACRO_EVENT_CLOCK_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | Federal Reserve; U.S. Bureau of Labor Statistics; U.S. Bureau of Economic Analysis; FRED with originating-agency attribution | BLS_V1_NONE_BLS_V2_OPTIONAL_KEY_BEA_AND_FRED_KEYS_REQUIRED; OFFICIAL_PUBLIC_DATA_TERMS_AND_ATTRIBUTION_REVIEW_REQUIRED | PER_SOURCE_METADATA_LE1_DATA_LE1_NO_PAGINATION_NO_RETRY | AGENCY_SERIES_OR_RELEASE_ID | EXCLUDE_MACRO_SHADOW_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| FINRA_ATS_BLOCK_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | FINRA | FINRA_PUBLIC_OAUTH_CREDENTIAL; FINRA_EQUITY_DATA_TERMS_REVIEW_REQUIRED | OAUTH_LE1_METADATA_LE1_AND_LIMIT1_DATA_LE1_PER_DATASET_NO_RETRY | FINRA_ISSUE_SYMBOL_ATS_ID_AND_CANONICAL_SYMBOL | EXCLUDE_FINRA_ATS_BLOCK_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| EXCHANGE_REG_SHO_MATRIX_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | Nasdaq Trader; NYSE Regulation; other primary-listing SRO when mapped | NONE_EXPECTED_BUT_MUST_BE_VERIFIED; SRO_TERMS_AND_REDISTRIBUTION_REVIEW_REQUIRED | ONE_METADATA_OR_FILE_REQUEST_PER_APPROVED_SRO_NO_PAGINATION_NO_RETRY | PRIMARY_LISTING_VENUE_AND_SYMBOL_ALIAS_CHAIN | EXCLUDE_REG_SHO_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| SRO_HALT_MANAGED_STATUS_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | Nasdaq Trader; NYSE Regulation; Cboe regulatory notices | NONE_EXPECTED_BUT_MUST_BE_VERIFIED; SRO_TERMS_AND_REDISTRIBUTION_REVIEW_REQUIRED | ONE_METADATA_OR_FILE_REQUEST_PER_APPROVED_SRO_NO_PAGINATION_NO_RETRY | PRIMARY_LISTING_VENUE_SYMBOL_AND_REASON_CODE | EXCLUDE_HALT_STATUS_SLICE_AND_CONTINUE_EXISTING_CANONICAL_QUALITY_GATES |
| IPO_LOCKUP_CORPORATE_ACTION_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | SEC EDGAR; issuer filings; official listing venues | SEC_USER_AGENT_ONLY_NO_API_KEY; SEC_FAIR_ACCESS_AND_SRO_TERMS_REVIEW_REQUIRED | SEC_SUBMISSIONS_LE1_FILING_LE1_AND_ONE_APPROVED_SRO_METADATA_REQUEST_NO_RETRY | CIK_ACCESSION_CUSIP_EXCHANGE_SYMBOL_AND_ALIAS_CHAIN | EXCLUDE_EVENT_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| CONGRESSIONAL_DISCLOSURE_SHADOW | BOUNDED_READ_ONLY_PROBE_APPROVAL_REQUIRED | US_Alpha_Seeker_Harvester | U.S. House Clerk; U.S. Senate eFD | PUBLIC_PORTAL_TERMS_AND_INTERACTION_REVIEW_REQUIRED; ACCESS_AUTOMATION_AND_REDISTRIBUTION_REVIEW_REQUIRED | DISCOVERY_LE1_DOCUMENT_LE1_PER_CHAMBER_NO_PAGINATION_NO_RETRY | FILER_REPORT_ASSET_DESCRIPTION_TO_ISSUER_MAPPING_REQUIRES_REVIEW | EXCLUDE_CONGRESSIONAL_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| ANALYST_REVISION_QUALITY_SHADOW | LICENSE_OR_ACCESS_REVIEW_REQUIRED | US_Alpha_Seeker_Harvester | No comprehensive free official source identified | VENDOR_DEPENDENT; LICENSE_OR_ACCESS_REVIEW_REQUIRED | ZERO_UNTIL_VENDOR_AND_TERMS_APPROVED | ANALYST_FIRM_REPORT_ID_FIGI_OR_CANONICAL_SYMBOL | NO_EVIDENCE_PRODUCED_CANONICAL_ANALYSIS_CONTINUES |
| ETF_FUND_FLOW_SHADOW | LICENSE_OR_ACCESS_REVIEW_REQUIRED | US_Alpha_Seeker_Harvester | SEC Form N-PORT for delayed holdings; no official free daily flow source identified | NONE_FOR_SEC_DATASETS_VENDOR_DEPENDENT_FOR_DAILY_FLOW; DAILY_FLOW_LICENSE_OR_ACCESS_REVIEW_REQUIRED | ZERO_DAILY_FLOW_REQUESTS_UNTIL_SOURCE_APPROVED_METADATA_LE1_FOR_FUTURE_SEC_PROBE | CIK_SERIES_CLASS_LEI_CUSIP_AND_SYMBOL | EXCLUDE_FLOW_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |
| THEMATIC_SUPPLY_CHAIN_LINEAGE_SHADOW | OFFICIAL_SOURCE_CONTRACT_INCOMPLETE | US_Alpha_Seeker | Issuer SEC filings and official investor materials | SEC_USER_AGENT_FOR_EDGAR; OFFICIAL_FILING_ACCESS_ONLY_NO_THIRD_PARTY_MAP_COPY | ZERO_UNTIL_EXTRACTION_SCHEMA_AND_REVIEW_FIXTURE_APPROVED | ISSUER_CIK_RELATIONSHIP_TYPE_COUNTERPARTY_ID_AND_EFFECTIVE_PERIOD | NO_THEMATIC_EVIDENCE_CANONICAL_ANALYSIS_CONTINUES |
| EXTENDED_HOURS_CONTEXT_SHADOW | LICENSE_OR_ACCESS_REVIEW_REQUIRED | US_Alpha_Seeker_Harvester | Licensed exchange or broker market-data source | VENDOR_DEPENDENT; LICENSE_OR_ACCESS_REVIEW_REQUIRED | ZERO_UNTIL_PROVIDER_TERMS_AND_SESSION_FIELDS_APPROVED | PROVIDER_SYMBOL_TO_CANONICAL_SYMBOL | EXCLUDE_EXTENDED_HOURS_SLICE_AND_CONTINUE_CANONICAL_ANALYSIS |

## Latest Run Readiness

| Readiness | Count |
| --- | ---: |
| STOP_GEOMETRY_REVIEW | 1 |
| TARGET_ALREADY_NEAR_CURRENT | 1 |
| STRUCTURE_CONFIRMATION_REQUIRED | 1 |
| BAD_RR_GEOMETRY | 1 |
| SIDE_CAR_FILLABILITY_TEST | 1 |
| CURRENT_RR_BAD | 1 |
| BREAKOUT_RETEST_REQUIRED | 1 |

## Top Institutional Contract Gaps

| Gap | Count |
| --- | ---: |
| source_quality_contract_missing | 449 |
| peer_valuation_contract_missing | 449 |
| macro_policy_risk_contract_missing | 449 |
| earnings_date_missing | 198 |
| current_price_rr_missing | 140 |
| current_required_stop_missing | 140 |
| trade_plan_contract_missing | 89 |
| current_price_missing | 83 |
| current_target_buffer_missing | 83 |
| rr_missing | 4 |

## Latest Candidate Table

| Symbol | Reason | Tactic | ER% | RR | RR@Cur | Dist% | TargetBuf% | ReqStop | ReqStopDist% | Price | Entry | Target | Stop | Readiness | Fix |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| ASB | blocked_stop_too_tight | PULLBACK_LIMIT | 15.00 | 127.83 | 0.37 | 11.46 | 4.31 | 29.08 | 2.15 | 29.72 | 26.32 | 31.00 | 26.28 | STOP_GEOMETRY_REVIEW | Review stop floor/tick/ATR buffer; current stop invalidates otherwise high RR names. |
| AUPH | wait_target_near_current | NO_TRADE_CURRENT_RR_BAD | 12.00 | 2.33 | N/A | 13.99 | -3.57 | N/A | N/A | 17.63 | 15.16 | 17.00 | 14.38 | TARGET_ALREADY_NEAR_CURRENT | Target is too close to current price; refresh upside thesis or reject. |
| DAVE | wait_structure_confirmation_required | RECALCULATED_STOP_REVIEW | 48.00 | 13.81 | 0.17 | 33.43 | 6.12 | 306.68 | 3.06 | 316.36 | 210.61 | 335.73 | 201.55 | STRUCTURE_CONFIRMATION_REQUIRED | Run current-entry OHLCV/ATR structure audit before any order; default remains no-order. |
| DUOL | blocked_rr_below_min | PULLBACK_LIMIT | 4.00 | 1.06 | N/A | 22.88 | -18.74 | N/A | N/A | 130.83 | 100.90 | 106.31 | 95.82 | BAD_RR_GEOMETRY | Keep blocked unless target/stop thesis is recalculated by Stage6. |
| GOOG | executable_current_recalculated_stop | CONFIRMED_RECALCULATED_STOP_ENTRY | 35.00 | 2.00 | 2.00 | 0.00 | 23.03 | 306.83 | 11.51 | 346.76 | 346.76 | 426.62 | 306.83 | SIDE_CAR_FILLABILITY_TEST | Inspect with institutionalResearch/tradePlan schema before execution changes. |
| TRIN | wait_weak_pillar_execution_gate | PULLBACK_LIMIT | 16.00 | 12.13 | 0.46 | 10.67 | 5.58 | 16.50 | 2.79 | 16.97 | 15.16 | 17.92 | 14.93 | CURRENT_RR_BAD | Do not chase current price; recompute target/stop thesis or keep watchlist. |
| ZVRA | wait_breakout_retest_required | BREAKOUT_RETEST | 119.00 | 16.27 | 4.12 | 19.83 | 116.03 | 5.42 | 58.01 | 12.91 | 10.35 | 27.89 | 9.27 | BREAKOUT_RETEST_REQUIRED | Route to confirmed breakout/retest monitoring lane; keep execution blocked until confirmation. |

## Policy Conclusion

- Today is not an Alpaca/order-submit failure. Stage6 emitted zero executable candidates before sidecar could build payloads.
- Latest dominant readiness: `STOP_GEOMETRY_REVIEW`.
- `BREAKOUT_RETEST_REQUIRED`, `STRUCTURE_CONFIRMATION_REQUIRED`, `CURRENT_STOP_RECALC_REQUIRED`, `CURRENT_RR_BAD`, `CURRENT_DISTANCE_ABOVE_ADAPTIVE_BAND`, and `TARGET_ALREADY_NEAR_CURRENT` are distinct from broker/order failures and must not be fixed with a wider sidecar chase.
- If `CURRENT_STOP_RECALC_REQUIRED` dominates, current-entry may become viable only after ATR/structure validates the required stop; default action remains no-order.
- If `CURRENT_RR_BAD` dominates, the correct fix is Stage6 trade-box recalibration or no-trade, not sidecar price chasing.
- If `GOOD_STOCK_BAD_ENTRY` dominates, add a Stage6 breakout/retest or nearer-entry lane with RR preserved.
- The institutional prompt should be applied first to Stage6 contract fields: evidence quality, peer valuation, macro/policy risk, thesis invalidation, and trade plan.
- Do not fix this by widening sidecar chase. That would convert a model-entry problem into uncontrolled execution risk.
- StockHub is retained only as a public feature idea catalog; no StockHub data, UI, wording, authenticated content, credential, cookie, or session is a production source.
- Priority 0 meanings reuse existing Stage4, Stage6, Stage7, Harvester, and alpha-exec report contracts; no duplicate planner, ledger, screener, or execution path is added.
- Every missing external capability remains bounded and approval-gated with `canonicalSourceChanged=false` and `policyImpact=NONE_REPORT_ONLY`.

