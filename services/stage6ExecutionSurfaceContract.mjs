const normalizeSymbol = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();
const normalizeText = (value) => String(value || '').trim();

const normalizeIso = (value) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const normalizeGrain = (value) => {
  const grain = normalizeText(value).toUpperCase();
  return grain === 'INTRADAY' || grain === 'PREVIOUS_CLOSE' ? grain : 'UNVERIFIED';
};

const assertUniqueIdentities = (rows, label) => {
  const seen = new Set();
  for (const row of rows) {
    const symbol = normalizeSymbol(row?.symbol);
    if (!symbol) continue;
    if (seen.has(symbol)) {
      throw new Error(`STAGE6_EXECUTION_SURFACE_DUPLICATE_${label}_IDENTITY`);
    }
    seen.add(symbol);
  }
};

export const isExecutableForTelegramContract = (item = {}) => {
  const finalDecision = String(item?.finalDecision || '').trim().toUpperCase();
  return finalDecision === 'EXECUTABLE_NOW';
};

export const reconcileStage6ExecutionSurfaces = (modelTop6 = [], finalizedCandidates = []) => {
  assertUniqueIdentities(modelTop6, 'MODEL_TOP6');
  assertUniqueIdentities(finalizedCandidates, 'FINALIZED');

  const finalizedBySymbol = new Map();
  for (const row of finalizedCandidates) {
    const symbol = normalizeSymbol(row?.symbol);
    if (symbol && !finalizedBySymbol.has(symbol)) finalizedBySymbol.set(symbol, row);
  }

  const finalizedModelTop6 = modelTop6.map((row) => finalizedBySymbol.get(normalizeSymbol(row?.symbol)) || row);
  return {
    modelTop6: finalizedModelTop6,
    executablePicks: finalizedCandidates.filter(isExecutableForTelegramContract),
    watchlistTop: finalizedModelTop6.filter((row) => !isExecutableForTelegramContract(row))
  };
};

export const classifyMarketPulseIntegrity = (points = {}, retrievedAt = null) => {
  const sharedRetrievedAt = normalizeIso(retrievedAt);
  const rows = ['SPX', 'NDX', 'IXIC', 'VIX'].map((sourceId) => {
    const point = points?.[sourceId] || {};
    const rawSourceAsOf = normalizeText(point?.sourceAsOf ?? point?.timestamp);
    const sourceAsOf = normalizeIso(rawSourceAsOf);
    const rowRetrievedAt = normalizeIso(point?.retrievedAt) || sharedRetrievedAt;
    const grain = normalizeGrain(point?.grain);
    const explicitlyStale = point?.stale === true
      || normalizeText(point?.freshnessStatus).toUpperCase() === 'STALE';

    let status = 'MARKET_SOURCE_TIMESTAMP_VALID';
    if (!rowRetrievedAt || (rawSourceAsOf && !sourceAsOf) || (sourceAsOf && sourceAsOf > rowRetrievedAt)) {
      status = 'MARKET_SOURCE_TIMESTAMP_INVALID';
    } else if (!sourceAsOf) {
      status = 'MARKET_SOURCE_AS_OF_UNAVAILABLE';
    } else if (explicitlyStale) {
      status = 'MARKET_SOURCE_STALE';
    }

    return { sourceId, sourceAsOf, retrievedAt: rowRetrievedAt, grain, status };
  });

  const invalidRows = rows.filter((row) => row.status === 'MARKET_SOURCE_TIMESTAMP_INVALID').length;
  const staleRows = rows.filter((row) => row.status === 'MARKET_SOURCE_STALE').length;
  const sourceAsOfUnavailableRows = rows.filter((row) => row.status === 'MARKET_SOURCE_AS_OF_UNAVAILABLE').length;
  const unverifiedGrainRows = rows.filter((row) => row.grain === 'UNVERIFIED').length;
  const grains = new Set(rows.map((row) => row.grain).filter((grain) => grain !== 'UNVERIFIED'));
  const mixedGrain = grains.size > 1;

  const status = invalidRows > 0
    ? 'MARKET_PULSE_CONTRACT_INVALID'
    : staleRows > 0 || mixedGrain
      ? 'MARKET_PULSE_STALE_OR_GRAIN_MISMATCH'
      : sourceAsOfUnavailableRows > 0
        ? 'MARKET_PULSE_SOURCE_AS_OF_UNAVAILABLE'
        : unverifiedGrainRows > 0
          ? 'MARKET_PULSE_GRAIN_UNVERIFIED'
          : 'MARKET_PULSE_INTEGRITY_PASS';

  return {
    status,
    rows,
    invalidRows,
    staleRows,
    sourceAsOfUnavailableRows,
    unverifiedGrainRows,
    mixedGrain,
    unknownOrUnclassifiedRows: 0
  };
};

export const summarizeReportOnlyConcentration = (rows = []) => {
  const dimensions = {
    sector: (row) => row?.sector,
    industry: (row) => row?.industry,
    theme: (row) => row?.theme ?? row?.sectorTheme
  };
  const summary = {};

  for (const [dimension, readValue] of Object.entries(dimensions)) {
    const counts = new Map();
    for (const row of rows) {
      const value = normalizeText(readValue(row));
      if (value) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const [topValue = null, topCount = 0] = [...counts.entries()]
      .sort(([valueA, countA], [valueB, countB]) => countB - countA || valueA.localeCompare(valueB))[0] || [];
    summary[dimension] = {
      topValue,
      topCount,
      totalRows: rows.length,
      sharePct: rows.length > 0 ? Number(((topCount / rows.length) * 100).toFixed(1)) : 0,
      distinctValues: counts.size
    };
  }

  return {
    policyImpact: 'NONE_REPORT_ONLY',
    totalRows: rows.length,
    dimensions: summary
  };
};
