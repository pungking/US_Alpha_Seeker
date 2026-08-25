const normalizeSymbol = (value) => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().trim();

export const isExecutableForTelegramContract = (item = {}) => {
  const finalDecision = String(item?.finalDecision || '').trim().toUpperCase();
  if (finalDecision) return finalDecision === 'EXECUTABLE_NOW';

  const bucket = String(item?.executionBucket || '').trim().toUpperCase();
  if (bucket === 'EXECUTABLE') return true;
  if (bucket === 'WATCHLIST') return false;

  const reason = String(item?.executionReason || item?.tradePlanStatusShadow || '').trim().toUpperCase();
  if (reason) return reason === 'VALID_EXEC';

  const verdict = String(item?.verdictFinal || item?.finalVerdict || item?.aiVerdict || item?.verdict || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (verdict === 'WAIT' || verdict === 'HOLD') return false;

  const feasible = item?.entryFeasible ?? item?.entryFeasibleShadow;
  return typeof feasible === 'boolean' ? feasible : true;
};

export const reconcileStage6ExecutionSurfaces = (modelTop6 = [], finalizedCandidates = []) => {
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
