const TIMEZONE = 'America/New_York';
const DAY_MS = 86_400_000;
const PRESENT = 'EARNINGS_EVENT_PRESENT';
const COVERAGE_STATUSES = new Set([
  PRESENT, 'EARNINGS_EVENT_OUTSIDE_WINDOW_FUTURE', 'EARNINGS_ONLY_PAST_EVENT_REPORTED',
  'EARNINGS_PROVIDER_NO_DATED_EVENT', 'EARNINGS_PROVIDER_LOOKUP_FAILED', 'EARNINGS_DATE_INVALID'
]);
const SOURCES = new Set(['fmp', 'finnhub', 'yfinance']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function epochDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / DAY_MS : null;
}

function instant(value) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || epochDay(value.slice(0, 10)) === null || Number(value.slice(11, 13)) > 23) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function marketDate(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(ms));
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
}

function coverageValid(map) {
  if (!object(map.events) || !object(map.coverage_statuses) || !object(map.coverage_status_counts)) return false;
  const rows = Object.entries(map.coverage_statuses);
  const counts = {};
  for (const [symbol, row] of rows) {
    if (!symbol || symbol !== symbol.trim().toUpperCase() || !object(row) || !COVERAGE_STATUSES.has(row.status)) return false;
    if ((row.status === PRESENT) !== Object.hasOwn(map.events, symbol)) return false;
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return map.coverage_contract_status === 'PASS' && map.unknown_or_unclassified_rows === 0
    && map.universe_count === rows.length && map.covered_count === Object.keys(map.events).length
    && map.missing_count === rows.length - map.covered_count
    && Object.keys(map.events).every(symbol => Object.hasOwn(map.coverage_statuses, symbol))
    && [...new Set([...Object.keys(counts), ...Object.keys(map.coverage_status_counts)])]
      .every(status => COVERAGE_STATUSES.has(status) && (counts[status] || 0) === map.coverage_status_counts[status]);
}

export function buildStage4EarningsContext({ snapshot, expectedTriggerFile, contentSha256, decisionAt }) {
  const decisionMs = instant(decisionAt);
  const retrievedMs = instant(snapshot?.retrieved_at);
  const window = snapshot?.window;
  const start = epochDay(window?.start_date);
  const end = epochDay(window?.end_date);
  const validHash = typeof contentSha256 === 'string' && /^[a-f0-9]{64}$/.test(contentSha256);
  let status = 'EARNINGS_MAP_VERIFIED';
  if (decisionMs === null) status = 'EARNINGS_DECISION_TIME_INVALID';
  else if (!object(snapshot)) status = validHash ? 'EARNINGS_MAP_CONTRACT_INVALID' : 'EARNINGS_MAP_UNAVAILABLE';
  else if (snapshot.schema_version !== 'earnings-event-map-v2') status = 'EARNINGS_MAP_LEGACY_UNVERIFIED';
  else if (!expectedTriggerFile || snapshot.trigger_file !== expectedTriggerFile) status = 'EARNINGS_TRIGGER_MISMATCH';
  else if (!validHash) status = 'EARNINGS_CONTENT_HASH_INVALID';
  else if (retrievedMs === null) status = 'EARNINGS_RETRIEVAL_INVALID';
  else if (retrievedMs > decisionMs) status = 'EARNINGS_RETRIEVAL_AFTER_DECISION';
  else if (snapshot.market_timezone !== TIMEZONE || window?.market_timezone !== TIMEZONE
    || start === null || end === null || !Number.isInteger(window?.max_forward_days)
    || window.max_forward_days < 0 || end - start !== window.max_forward_days
    || window.start_date !== marketDate(retrievedMs)) status = 'EARNINGS_WINDOW_INVALID';
  else if (snapshot.publication_timestamp_available !== false || !coverageValid(snapshot)) status = 'EARNINGS_COVERAGE_CONTRACT_INVALID';
  return {
    snapshot: status === 'EARNINGS_MAP_VERIFIED' ? snapshot : null,
    lineage: {
      schemaVersion: 'stage4-earnings-event-consumer-v1', status,
      sourceFile: 'EARNINGS_EVENT_MAP.json',
      sourceSchemaVersion: snapshot?.schema_version === 'earnings-event-map-v2' ? snapshot.schema_version : null,
      triggerMatched: Boolean(expectedTriggerFile && snapshot?.trigger_file === expectedTriggerFile),
      expectedTriggerFile, contentSha256: validHash ? contentSha256 : null,
      hashBasis: 'EXACT_DOWNLOADED_UTF8_TEXT',
      decisionAt: decisionMs === null ? null : decisionAt,
      decisionMarketDate: decisionMs === null ? null : marketDate(decisionMs),
      retrievedAt: retrievedMs === null ? null : snapshot.retrieved_at,
      retrievalBasis: 'PROVIDER_COLLECTION_START', marketTimezone: TIMEZONE,
      publicationTimestampAvailable: false,
      freshnessBasis: 'EXACT_TRIGGER_AND_COLLECTION_WINDOW_NOT_UNIVERSAL_TTL'
    }
  };
}

export function calculateEventRiskOverlay(context, symbol, marketRegime = 'UNKNOWN') {
  const { snapshot, lineage } = context;
  const key = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
  const coverage = snapshot?.coverage_statuses?.[key];
  const event = snapshot?.events?.[key];
  let status = lineage.status;
  if (snapshot) {
    const eventDay = epochDay(event?.earnings_date);
    const collectedDistance = eventDay === null ? null : eventDay - epochDay(snapshot.window.start_date);
    if (!coverage) status = 'EARNINGS_SYMBOL_NOT_COVERED';
    else if (coverage.status !== PRESENT) status = coverage.status;
    else if (!object(event) || eventDay === null) status = 'EARNINGS_EVENT_DATE_INVALID';
    else if (collectedDistance < 0 || collectedDistance > snapshot.window.max_forward_days
      || (Object.hasOwn(event, 'days_to_event') && (!Number.isInteger(event.days_to_event)
        || event.days_to_event !== collectedDistance))) status = 'EARNINGS_EVENT_DISTANCE_INVALID';
    else if (!SOURCES.has(event.source) || coverage.source !== event.source) status = 'EARNINGS_EVENT_SOURCE_INVALID';
    else status = 'EARNINGS_EVENT_DATE_VERIFIED';
  }
  const verified = status === 'EARNINGS_EVENT_DATE_VERIFIED';
  const days = verified ? epochDay(event.earnings_date) - epochDay(lineage.decisionMarketDate) : null;
  // days > 0 means BEFORE the scheduled event, not after it or before metadata publication.
  const high = days !== null && days >= -1 && days <= 1;
  const medium = days !== null && days >= 2 && days <= 5;
  return {
    earningsDate: verified ? event.earnings_date : null,
    daysToEarnings: days,
    earningsSource: verified ? event.source : null,
    earningsRetrievedAt: verified ? lineage.retrievedAt : null,
    earningsEvidenceStatus: status,
    earningsCoverageStatus: coverage?.status || null,
    earningsSourceContentSha256: lineage.contentSha256,
    earningsDecisionAt: lineage.decisionAt,
    earningsDistanceBasis: 'EVENT_DATE_MINUS_STAGE4_NEW_YORK_DATE',
    earningsPublicationTimestampAvailable: false,
    eventRiskAssessmentStatus: verified ? 'DATED_EVENT_EVALUATED' : 'UNAVAILABLE_NOT_SAFE',
    eventRiskState: high ? 'HIGH' : medium ? 'MEDIUM' : 'NONE',
    eventDistanceBand: high ? 'D_MINUS_1_TO_PLUS_1' : medium ? 'D_MINUS_2_TO_MINUS_5' : 'NONE',
    eventRiskSource: high || medium ? 'DISTANCE' : 'NONE',
    eventRiskPenalty: high ? 8 + (marketRegime === 'RISK_OFF' ? 2 : 0)
      : medium ? 3 + (marketRegime === 'RISK_OFF' ? 1 : 0) : 0
  };
}
