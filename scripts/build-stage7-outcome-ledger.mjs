#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stage6Dir = path.resolve(root, process.env.STAGE7_STAGE6_DIR || 'state/stage6-audit-source');
const stage4Dir = path.resolve(root, process.env.STAGE7_STAGE4_DIR || 'state/stage4-audit-source');
const ledgerOut = path.resolve(root, process.env.STAGE7_OUTCOME_LEDGER_OUT || 'state/stage7-outcome-ledger.json');
const oosOut = path.resolve(root, process.env.STAGE7_OOS_OUT || 'state/stage3-5-oos-outcomes.json');
const markdownOut = path.resolve(root, process.env.STAGE7_OUTCOME_MD_OUT || 'docs/STAGE7_OUTCOME_LEDGER.md');
const horizonBars = positiveInt(process.env.STAGE7_HORIZON_BARS, 20);
const costs = {
  spreadBps: nonNegativeNumber(process.env.STAGE7_SPREAD_BPS, 10),
  slippageBps: nonNegativeNumber(process.env.STAGE7_SLIPPAGE_BPS, 5),
  commissionBps: nonNegativeNumber(process.env.STAGE7_COMMISSION_BPS, 1),
  basis: 'conservative_policy_assumption_v1'
};
const COHORTS = {
  executable: 'EXECUTABLE_COHORT',
  blocked: 'ACTIONABLE_BLOCKED_COHORT',
  control: 'NON_ACTIONABLE_CONTROL_COHORT'
};
const DEFAULT_ACTIONABLE_VERDICTS = ['BUY', 'STRONG_BUY', 'STRONGBUY'];

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function round(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalized(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isoTimestamp(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const SYMBOL_MATCH_METHOD = 'DETERMINISTIC_EXACT_NORMALIZED_SYMBOL_LOOKUP';

function verifiedSymbolAliasChain(evidence, lineageSymbol, sourceSymbol, evidenceAsOfMs) {
  if (evidence?.status !== 'VERIFIED_SYMBOL_CHANGE') return false;
  const target = normalized(lineageSymbol);
  const source = normalized(sourceSymbol);
  const events = Array.isArray(evidence.events) && evidence.events.length
    ? evidence.events
    : [evidence];
  const normalizedEvents = events
    .map((event) => ({
      oldSymbol: normalized(event?.oldSymbol),
      newSymbol: normalized(event?.newSymbol),
      eventEffectiveAt: isoTimestamp(event?.eventEffectiveAt)
    }))
    .filter((event) => event.oldSymbol && event.newSymbol && event.eventEffectiveAt)
    .sort((a, b) => a.eventEffectiveAt.localeCompare(b.eventEffectiveAt));
  if (!target
    || normalizedEvents.length !== events.length
    || normalizedEvents.some((event) => Date.parse(event.eventEffectiveAt) > evidenceAsOfMs)) {
    return false;
  }
  if (normalized(evidence.newSymbol) !== target) return false;
  let cursor = source && source !== target
    ? source
    : normalized(evidence.oldSymbol) || normalizedEvents[0]?.oldSymbol;
  const visited = new Set();
  for (let index = 0; index < normalizedEvents.length && cursor; index += 1) {
    if (cursor === target) return true;
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const next = normalizedEvents.find((event) => event.oldSymbol === cursor);
    if (!next) return false;
    cursor = next.newSymbol;
  }
  return cursor === target;
}

function evidenceContractValid(
  evidence,
  expectedStatuses,
  {
    lineageSymbol,
    sourceSymbol,
    historySourceAsOf,
    lineageEvaluatedAt,
    historyLookbackStart
  }
) {
  if (!evidence || typeof evidence !== 'object') return false;
  const status = String(evidence.status || '');
  const targetSymbol = normalized(lineageSymbol);
  const requestedSymbol = normalized(evidence.requestedSymbol);
  const matchedSymbol = normalized(evidence.matchedSymbol);
  const matchStatus = normalized(evidence.symbolMatchStatus);
  const sourceAsOfMs = Date.parse(String(evidence.sourceAsOf || ''));
  const evidenceRetrievedAtMs = Date.parse(String(evidence.retrievedAt || ''));
  const historyAsOfMs = Date.parse(String(historySourceAsOf || ''));
  const lineageEvaluatedAtMs = Date.parse(String(lineageEvaluatedAt || ''));
  const historyLookbackStartMs = Date.parse(String(historyLookbackStart || ''));
  const coverageStartMs = Date.parse(String(evidence.coverageStart || ''));
  const coverageEndMs = Date.parse(`${String(evidence.coverageEnd || '').slice(0, 10)}T23:59:59.999Z`);
  if (!expectedStatuses.has(status)
    || !String(evidence.source || '').trim()
    || evidence.requestStatus !== 'SUCCESS'
    || !targetSymbol
    || requestedSymbol !== targetSymbol
    || evidence.symbolMatchMethod !== SYMBOL_MATCH_METHOD
    || evidence.sourceScopeComplete !== true
    || !String(evidence.queryScope || '').trim()
    || evidence.partialResponse !== false
    || !SHA256_PATTERN.test(String(evidence.responseSha256 || ''))
    || !SHA256_PATTERN.test(String(evidence.requestScopeSymbolsSha256 || ''))
    || ![
      sourceAsOfMs,
      evidenceRetrievedAtMs,
      historyAsOfMs,
      lineageEvaluatedAtMs,
      historyLookbackStartMs,
      coverageStartMs,
      coverageEndMs
    ].every(Number.isFinite)
    || coverageStartMs > coverageEndMs
    || coverageStartMs > historyLookbackStartMs
    || historyLookbackStartMs > historyAsOfMs
    || historyAsOfMs > sourceAsOfMs
    || sourceAsOfMs > evidenceRetrievedAtMs
    || evidenceRetrievedAtMs > lineageEvaluatedAtMs
    || historyAsOfMs > coverageEndMs) {
    return false;
  }
  if (evidence.eventEffectiveAt) {
    const effectiveAtMs = Date.parse(String(evidence.eventEffectiveAt));
    if (!Number.isFinite(effectiveAtMs) || effectiveAtMs > sourceAsOfMs) return false;
  }
  if (status === 'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE'
    || status === 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE') {
    return !matchedSymbol && matchStatus === 'NO_EXACT_EVENT_MATCH_IN_COMPLETE_RESPONSE';
  }
  if (status === 'VERIFIED_SYMBOL_CHANGE') {
    return matchedSymbol === targetSymbol
      && matchStatus === 'EXACT_EVENT_MATCH'
      && verifiedSymbolAliasChain(evidence, targetSymbol, sourceSymbol, sourceAsOfMs);
  }
  if (status === 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE') {
    return (
      (!matchedSymbol && matchStatus === 'NO_EXACT_EVENT_MATCH_IN_COMPLETE_RESPONSE')
      || (
        matchedSymbol === targetSymbol
        && [
          'EXACT_HISTORICAL_EVENT_MATCH_CURRENTLY_RESUMED',
          'EXACT_HISTORICAL_EVENT_MATCH_NOT_IN_CURRENT_FEED'
        ].includes(matchStatus)
      )
    );
  }
  return false;
}

function evaluateHistoryLineage(lineage) {
  const reasons = [];
  const sourceAsOfMs = Date.parse(String(lineage?.sourceAsOf || ''));
  const retrievedAtMs = Date.parse(String(lineage?.retrievedAt || ''));
  const allowedCorporateActionStatuses = new Set([
    'VERIFIED_SPLIT_DIVIDEND_EVENTS_IN_WINDOW',
    'VERIFIED_NO_SPLIT_OR_DIVIDEND_EVENT_IN_WINDOW'
  ]);
  const symbolChangeStatuses = new Set([
    'VERIFIED_NO_SYMBOL_CHANGE_AS_OF_SOURCE',
    'VERIFIED_SYMBOL_CHANGE'
  ]);
  const symbolChangeEvidenceValid = evidenceContractValid(
    lineage?.symbolChangeEvidence,
    symbolChangeStatuses,
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  );
  const aliasKeyMatch = Boolean(
    lineage?.lineageSymbol
    && lineage?.stage4Symbol
    && (
      normalized(lineage.lineageSymbol) === normalized(lineage.stage4Symbol)
      || (
        lineage?.symbolChangeStatus === 'VERIFIED_SYMBOL_CHANGE'
        && symbolChangeEvidenceValid
        && [
          normalized(lineage?.sourceSymbol),
          normalized(lineage?.lineageSymbol)
        ].includes(normalized(lineage.stage4Symbol))
      )
    )
  );

  if (lineage?.schemaVersion !== 'corporate-action-lineage-v1') reasons.push('lineage_schema_not_verified');
  if (lineage?.lineageContractStatus !== 'PRESENT') reasons.push('lineage_not_present');
  if (!aliasKeyMatch) reasons.push('lineage_symbol_mismatch');
  if (!lineage?.vendor) reasons.push('vendor_missing');
  if (!Number.isFinite(sourceAsOfMs)) reasons.push('source_as_of_missing_or_invalid');
  if (!Number.isFinite(retrievedAtMs)) reasons.push('retrieved_at_missing_or_invalid');
  if (Number.isFinite(sourceAsOfMs) && Number.isFinite(retrievedAtMs) && sourceAsOfMs > retrievedAtMs) {
    reasons.push('source_as_of_after_retrieval');
  }
  if (lineage?.marketTimezone !== 'America/New_York') reasons.push('market_timezone_unverified');
  if (lineage?.adjustmentType !== 'YFINANCE_AUTO_ADJUSTED_OHLC') reasons.push('adjustment_type_unverified');
  if (lineage?.splitAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED') reasons.push('split_adjustment_unverified');
  if (lineage?.dividendAdjustmentStatus !== 'VERIFIED_YFINANCE_AUTO_ADJUSTED') reasons.push('dividend_adjustment_unverified');
  if (!allowedCorporateActionStatuses.has(String(lineage?.corporateActionStatus || ''))) reasons.push('corporate_action_status_unverified');
  if (!symbolChangeStatuses.has(String(lineage?.symbolChangeStatus || ''))) reasons.push('symbol_change_status_unverified');
  if (lineage?.delistingStatus !== 'VERIFIED_NOT_DELISTED_AS_OF_SOURCE') reasons.push('delisting_status_unverified_or_delisted');
  if (lineage?.suspensionStatus !== 'VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE') reasons.push('suspension_status_unverified_or_suspended');
  if (lineage?.sourceFreshnessStatus !== 'FRESH') reasons.push('source_not_fresh');
  if (lineage?.historyCoverageStatus !== 'VERIFIED_OBSERVED_HISTORY') reasons.push('history_coverage_unverified');
  if (lineage?.survivorshipBiasStatus !== 'VERIFIED_CORPORATE_ACTION_LINEAGE') reasons.push('survivorship_lineage_unverified');
  if (lineage?.returnBasis !== 'DIVIDEND_AND_SPLIT_ADJUSTED_PRICE_RETURN') reasons.push('return_basis_unverified');
  if (lineage?.lineageVerifiedByProducer !== true) reasons.push('producer_comparison_contract_not_verified');
  if (!symbolChangeEvidenceValid) reasons.push('symbol_change_evidence_invalid');
  if (!evidenceContractValid(
    lineage?.delistingEvidence,
    new Set(['VERIFIED_NOT_DELISTED_AS_OF_SOURCE']),
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  )) reasons.push('delisting_evidence_invalid');
  if (!evidenceContractValid(
    lineage?.suspensionEvidence,
    new Set(['VERIFIED_NOT_SUSPENDED_AS_OF_SOURCE']),
    {
      lineageSymbol: lineage?.lineageSymbol,
      sourceSymbol: lineage?.sourceSymbol,
      historySourceAsOf: lineage?.sourceAsOf,
      lineageEvaluatedAt: lineage?.lineageEvaluatedAt,
      historyLookbackStart: lineage?.producerLookbackStart
    }
  )) reasons.push('suspension_evidence_invalid');

  return {
    status: reasons.length ? 'UNVERIFIED_FOR_COMPARISON' : 'VERIFIED_FOR_COMPARISON',
    reasons: [...new Set(reasons)]
  };
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function jsonFiles(directory, prefix) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .sort()
    .map((name) => path.join(directory, name));
}

function marketTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const minutes = (Number(value.hour) * 60) + Number(value.minute);
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes,
    phase: minutes < 570 ? 'PRE_RTH' : minutes < 960 ? 'RTH' : 'POST_RTH'
  };
}

function primaryBlocker(row, actionable, sourceLineageValid) {
  const finalDecision = normalized(row?.finalDecision);
  const decisionReason = normalized(row?.decisionReason);
  const qualityLane = normalized(row?.qualityGateLane);
  const structureLane = normalized(row?.structurePolicyBlockerLane);
  const riskLane = normalized(row?.riskGeometryRepairLane);
  const tuningLane = normalized(row?.zeroExecutableTuningLane);

  if (!sourceLineageValid) return 'SCHEMA_OR_LINEAGE_MISMATCH';
  if (!actionable) return 'QUALITY_NON_ACTIONABLE_VERDICT';
  if (finalDecision === 'EXECUTABLE_NOW') return 'NONE';
  if (qualityLane && qualityLane !== 'NOT_APPLICABLE') {
    return qualityLane.includes('WEAK_PILLAR') ? 'WEAK_PILLAR' : 'QUALITY_GATE';
  }
  if (row?.targetNoTradeConfirmed === true || tuningLane === 'TARGET_RECALIBRATION') {
    return 'TARGET_RECALIBRATION_NO_TRADE';
  }
  if ((riskLane && riskLane !== 'NOT_APPLICABLE')
    || tuningLane.includes('RISK_GEOMETRY')
    || decisionReason.includes('INVALID_GEOMETRY')
    || decisionReason.includes('RR_BELOW')
    || decisionReason.includes('STOP_TOO')) {
    return 'RISK_GEOMETRY';
  }
  if ((structureLane && structureLane !== 'NOT_APPLICABLE') || decisionReason.includes('STRUCTURE')) {
    return 'STRUCTURE_PROOF';
  }
  if (decisionReason.includes('BREAKOUT') || tuningLane.includes('BREAKOUT_PROOF')) {
    return 'BREAKOUT_PROOF_NOT_CONFIRMED';
  }
  if (decisionReason.includes('EARNINGS') || decisionReason.includes('STALE')) {
    return 'EARNINGS_OR_DATA_FRESHNESS';
  }
  return 'SCHEMA_OR_LINEAGE_MISMATCH';
}

function decisionSurface(payload) {
  const surfaces = [
    [payload?.execution_contract?.executablePicks, 30],
    [payload?.execution_contract?.modelTop6, 20],
    [payload?.execution_contract?.watchlistTop, 10]
  ];
  const selected = new Map();
  let inputRows = 0;
  for (const [rows, priority] of surfaces) {
    for (const row of Array.isArray(rows) ? rows : []) {
      inputRows += 1;
      const symbol = normalized(row?.symbol);
      if (!symbol || (selected.get(symbol)?.priority ?? -1) >= priority) continue;
      selected.set(symbol, { row, priority });
    }
  }
  return {
    rows: [...selected.values()].map(({ row }) => row),
    deduplicatedRows: inputRows - selected.size
  };
}

function readStage6Seeds() {
  const seeds = [];
  const rejected = [];
  const sourceFiles = [];
  let deduplicatedSurfaceRows = 0;
  for (const filePath of jsonFiles(stage6Dir, 'STAGE6_ALPHA_FINAL_')) {
    const raw = fs.readFileSync(filePath, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      rejected.push({ file: path.basename(filePath), reason: `invalid_json:${error.name}` });
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const generatedAt = payload?.manifest?.timestamp || payload?.execution_contract?.generatedAt || null;
    const signalMarket = marketTimestamp(generatedAt);
    const signalDate = signalMarket?.date || null;
    const stage6Hash = crypto.createHash('sha256').update(raw).digest('hex');
    const decisionGate = payload?.execution_contract?.decisionGate || payload?.manifest?.decisionGate || {};
    const actionableVerdicts = new Set(
      Array.isArray(decisionGate.actionableVerdicts)
        ? decisionGate.actionableVerdicts.map(normalized)
        : DEFAULT_ACTIONABLE_VERDICTS
    );
    const surface = decisionSurface(payload);
    deduplicatedSurfaceRows += surface.deduplicatedRows;
    for (const pick of surface.rows) {
      const symbol = String(pick?.symbol || '').trim().toUpperCase();
      const entryPrice = finitePositive(pick?.entryExecPrice ?? pick?.entryAnchorPrice ?? pick?.entryPrice);
      const targetPrice = finitePositive(pick?.targetPrice);
      const stopPrice = finitePositive(pick?.stopPrice ?? pick?.stopLoss);
      if (!symbol || !generatedAt || !signalDate) {
        rejected.push({ file: path.basename(filePath), symbol: symbol || null, reason: 'invalid_or_incomplete_decision_identity' });
        continue;
      }
      const verdict = normalized(pick?.executionVerdict ?? pick?.aiVerdict ?? pick?.verdictFinal ?? pick?.verdict);
      const actionable = typeof pick?.executionActionableVerdict === 'boolean'
        ? pick.executionActionableVerdict && actionableVerdicts.has(verdict)
        : actionableVerdicts.has(verdict);
      const decisionReason = String(pick?.decisionReason || '').trim();
      const stage6GeneratedAt = isoTimestamp(generatedAt);
      const sourceStage5Timestamp = isoTimestamp(payload?.manifest?.sourceStage5Timestamp);
      const sourceTimestampOrderValid = Boolean(
        stage6GeneratedAt
        && sourceStage5Timestamp
        && sourceStage5Timestamp <= stage6GeneratedAt
      );
      const sourceMarkedStale = normalized(decisionReason).includes('STALE');
      const sourceFreshnessStatus = sourceMarkedStale
        ? 'SOURCE_MARKED_STALE_AT_DECISION'
        : !sourceStage5Timestamp
          ? 'SOURCE_TIMESTAMP_MISSING'
          : sourceTimestampOrderValid
            ? 'SOURCE_TIMESTAMP_ORDER_VALID'
            : 'SOURCE_TIMESTAMP_AFTER_DECISION';
      const sourceLineageValid = Boolean(payload?.manifest?.sourceSha)
        && sourceTimestampOrderValid
        && !sourceMarkedStale;
      const blocker = primaryBlocker(pick, actionable, sourceLineageValid);
      const finalDecision = normalized(pick?.finalDecision) || 'UNKNOWN';
      const decisionCohort = finalDecision === 'EXECUTABLE_NOW' && actionable && sourceLineageValid
        ? COHORTS.executable
        : actionable && sourceLineageValid && blocker !== 'SCHEMA_OR_LINEAGE_MISMATCH'
          ? COHORTS.blocked
          : COHORTS.control;
      const geometryValid = Boolean(entryPrice && targetPrice && stopPrice && stopPrice < entryPrice && entryPrice < targetPrice);
      const decisionSnapshot = {
        symbol,
        generatedAt,
        stage6File: path.basename(filePath),
        stage6Hash,
        sourceRunId: payload?.manifest?.sourceRunId || null,
        sourceSha: payload?.manifest?.sourceSha || null,
        sourceLineageStatus: sourceLineageValid ? 'STAGE6_LINEAGE_PRESENT' : 'STAGE6_LINEAGE_MISSING_OR_STALE',
        sourceStage5File: payload?.manifest?.sourceStage5File || null,
        sourceStage5Hash: payload?.manifest?.sourceStage5Hash || null,
        sourceStage5Timestamp,
        sourceFreshnessStatus,
        verdict,
        actionable,
        finalDecision,
        decisionReason: decisionReason || null,
        primaryBlocker: blocker,
        decisionCohort,
        zeroExecutableTuningLane: pick?.zeroExecutableTuningLane || null,
        qualityGateLane: pick?.qualityGateLane || null,
        structurePolicyBlockerLane: pick?.structurePolicyBlockerLane || null,
        riskGeometryRepairLane: pick?.riskGeometryRepairLane || null,
        targetRecalibrationViabilityVerdict: pick?.targetRecalibrationViabilityVerdict || null,
        targetNoTradeConfirmed: pick?.targetNoTradeConfirmed ?? null,
        breakoutRetestProofConfirmed: pick?.breakoutRetestProofConfirmed ?? null,
        symbolChangeReference: pick?.previousSymbol ?? pick?.priorSymbol ?? null,
        entryPrice,
        currentPrice: finitePositive(pick?.price ?? pick?.currentPrice),
        targetPrice,
        stopPrice,
        rrAtEntry: finitePositive(pick?.riskRewardRatioValue),
        rrAtCurrent: finitePositive(pick?.rrAtCurrentPrice ?? pick?.executionFeasibilityAtCurrentRr),
        entryDistancePct: Number.isFinite(Number(pick?.entryDistancePct)) ? Number(pick.entryDistancePct) : null,
        geometryValid
      };
      const decisionSnapshotSha256 = crypto.createHash('sha256')
        .update(JSON.stringify(decisionSnapshot))
        .digest('hex');
      seeds.push({
        ledgerId: crypto.createHash('sha256').update(`${stage6Hash}|${symbol}`).digest('hex').slice(0, 24),
        stage6File: path.basename(filePath),
        stage6Hash,
        sourceRunId: payload?.manifest?.sourceRunId || null,
        sourceSha: payload?.manifest?.sourceSha || null,
        symbol,
        generatedAt,
        signalDate,
        signalMarketPhase: signalMarket.phase,
        signalMarketMinutes: signalMarket.minutes,
        side: 'LONG',
        decisionCohort,
        primaryBlocker: blocker,
        falseNegativeEligible: decisionCohort === COHORTS.blocked && geometryValid,
        sourceLineageValid,
        decisionSnapshot,
        decisionSnapshotSha256,
        modelRank: pick?.modelRank ?? null,
        executionRank: pick?.executionRank ?? null,
        finalDecision,
        decisionReason: decisionReason || null,
        entryPrice,
        currentPrice: decisionSnapshot.currentPrice,
        targetPrice,
        stopPrice,
        geometryValid
      });
    }
  }
  const deduped = new Map(seeds.map((row) => [row.ledgerId, row]));
  return {
    seeds: [...deduped.values()],
    rejected,
    sourceFiles,
    duplicateSeedRows: seeds.length - deduped.size,
    deduplicatedSurfaceRows
  };
}

function readPriceHistory() {
  const bySymbol = new Map();
  const sourceFiles = [];
  for (const filePath of jsonFiles(stage4Dir, 'STAGE4_TECHNICAL_FULL_')) {
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    sourceFiles.push(path.basename(filePath));
    const rows = Array.isArray(payload?.technical_universe) ? payload.technical_universe : [];
    for (const row of rows) {
      const symbol = String(row?.symbol || '').trim().toUpperCase();
      if (!symbol || !Array.isArray(row?.priceHistory)) continue;
      const record = bySymbol.get(symbol) || { bars: new Map(), sourceFiles: new Set(), lineage: null };
      for (const bar of row.priceHistory) {
        const date = String(bar?.date || '').slice(0, 10);
        const open = finitePositive(bar?.open);
        const high = finitePositive(bar?.high);
        const low = finitePositive(bar?.low);
        const close = finitePositive(bar?.close);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !open || !high || !low || !close || low > high) continue;
        record.bars.set(date, { date, open, high, low, close });
      }
      record.sourceFiles.add(path.basename(filePath));
      const rawLineage = row?.corporateActionLineage && typeof row.corporateActionLineage === 'object'
        ? row.corporateActionLineage
        : row?.ohlcvLineage && typeof row.ohlcvLineage === 'object'
          ? row.ohlcvLineage
          : null;
      const retrievedAt = isoTimestamp(
        rawLineage?.retrievedAt
        ?? row?.updated
        ?? row?.lastUpdate
        ?? row?.quoteTimestamp
        ?? payload?.manifest?.timestamp
      );
      const lineageEvaluatedAt = [
        rawLineage?.lineageEvaluatedAt,
        rawLineage?.symbolChangeEvidence?.retrievedAt,
        rawLineage?.delistingEvidence?.retrievedAt,
        rawLineage?.suspensionEvidence?.retrievedAt,
        retrievedAt
      ]
        .map(isoTimestamp)
        .filter(Boolean)
        .sort()
        .at(-1) || null;
      const externalEvidenceSha256 = rawLineage
        ? crypto.createHash('sha256').update(canonicalJson({
          symbolChangeEvidence: rawLineage.symbolChangeEvidence || null,
          delistingEvidence: rawLineage.delistingEvidence || null,
          suspensionEvidence: rawLineage.suspensionEvidence || null
        })).digest('hex')
        : null;
      if (
        !record.lineage
        || String(lineageEvaluatedAt || retrievedAt || '')
          >= String(record.lineage.lineageEvaluatedAt || record.lineage.retrievedAt || '')
      ) {
        const lineage = {
          schemaVersion: rawLineage?.schemaVersion || null,
          status: 'PRESENT',
          lineageContractStatus: rawLineage?.lineageStatus || (rawLineage ? 'PRESENT' : 'LEGACY_ROW_WITHOUT_CORPORATE_ACTION_LINEAGE'),
          stage4File: path.basename(filePath),
          sourceStage3File: payload?.manifest?.sourceStage3File || null,
          storageSource: row?.dataSource || null,
          stage4Symbol: symbol,
          lineageSymbol: normalized(rawLineage?.symbol),
          sourceSymbol: normalized(rawLineage?.sourceSymbol),
          lineageKeyMatchesStage4Symbol: Boolean(rawLineage?.symbol) && normalized(rawLineage.symbol) === symbol,
          vendor: rawLineage?.vendor || row?.quoteSource || row?.source || null,
          retrievedAt,
          lineageEvaluatedAt,
          externalEvidenceSha256,
          sourceAsOf: isoTimestamp(rawLineage?.sourceAsOf),
          eventEffectiveAt: isoTimestamp(rawLineage?.eventEffectiveAt),
          marketTimezone: rawLineage?.marketTimezone || payload?.manifest?.marketTimezone || null,
          adjustmentType: rawLineage?.adjustmentType ?? row?.adjustmentType ?? row?.adjustment_type ?? null,
          splitAdjustmentStatus: rawLineage?.splitAdjustmentStatus ?? row?.splitAdjustmentStatus ?? 'UNVERIFIED_SPLIT_ADJUSTMENT_LINEAGE',
          dividendAdjustmentStatus: rawLineage?.dividendAdjustmentStatus ?? row?.dividendAdjustmentStatus ?? 'UNVERIFIED_DIVIDEND_ADJUSTMENT_LINEAGE',
          sourceFreshnessStatus: rawLineage?.sourceFreshnessStatus || 'UNVERIFIED_SOURCE_FRESHNESS',
          historyCoverageStatus: rawLineage?.historyCoverageStatus || 'UNVERIFIED_HISTORY_COVERAGE',
          missingSessions: Array.isArray(rawLineage?.missingSessions)
            ? rawLineage.missingSessions
            : Array.isArray(row?.missingSessions)
              ? row.missingSessions
              : null,
          corporateActionStatus: rawLineage?.corporateActionStatus ?? row?.corporateActionStatus ?? 'UNVERIFIED_CORPORATE_ACTION_LINEAGE',
          symbolChangeStatus: rawLineage?.symbolChangeStatus ?? row?.symbolChangeStatus ?? 'UNVERIFIED_SYMBOL_CHANGE_LINEAGE',
          delistingStatus: rawLineage?.delistingStatus ?? row?.delistingStatus ?? 'UNVERIFIED_DELISTING_LINEAGE',
          suspensionStatus: rawLineage?.suspensionStatus ?? row?.suspensionStatus ?? 'UNVERIFIED_SUSPENSION_LINEAGE',
          symbolChangeEvidence: rawLineage?.symbolChangeEvidence || null,
          delistingEvidence: rawLineage?.delistingEvidence || null,
          suspensionEvidence: rawLineage?.suspensionEvidence || null,
          splitEvents: Array.isArray(rawLineage?.splitEvents) ? rawLineage.splitEvents : [],
          dividendEvents: Array.isArray(rawLineage?.dividendEvents) ? rawLineage.dividendEvents : [],
          survivorshipBiasStatus: rawLineage?.survivorshipBiasStatus ?? row?.survivorshipBiasStatus ?? 'UNVERIFIED_CORPORATE_ACTION_LINEAGE',
          returnBasis: rawLineage?.returnBasis ?? row?.returnBasis ?? row?.totalReturnBasis ?? 'PRICE_RETURN_NOT_TOTAL_RETURN',
          lineageVerifiedByProducer: rawLineage?.lineageVerifiedForComparison === true,
          producerLookbackStart: rawLineage?.lookbackStart || null,
          producerLookbackEnd: rawLineage?.lookbackEnd || null,
          producerObservationCount: Number.isFinite(Number(rawLineage?.observationCount))
            ? Number(rawLineage.observationCount)
            : null
        };
        const eligibility = evaluateHistoryLineage(lineage);
        record.lineage = {
          ...lineage,
          comparisonEligibilityStatus: eligibility.status,
          comparisonExclusionReasons: eligibility.reasons
        };
      }
      bySymbol.set(symbol, record);
    }
  }
  const normalizedHistory = new Map();
  for (const [symbol, record] of bySymbol) {
    const bars = [...record.bars.values()].sort((a, b) => a.date.localeCompare(b.date));
    const historyRecord = {
      bars,
      lineage: {
        ...record.lineage,
        sourceFiles: [...record.sourceFiles].sort(),
        lookbackStart: bars[0]?.date || null,
        lookbackEnd: bars.at(-1)?.date || null,
        observationCount: bars.length
      }
    };
    normalizedHistory.set(symbol, historyRecord);
    if (record.lineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON'
      && record.lineage?.symbolChangeStatus === 'VERIFIED_SYMBOL_CHANGE') {
      for (const alias of [record.lineage.lineageSymbol, record.lineage.sourceSymbol].map(normalized).filter(Boolean)) {
        const existing = normalizedHistory.get(alias);
        if (!existing || existing === historyRecord) normalizedHistory.set(alias, historyRecord);
      }
    }
  }
  return {
    sourceFiles,
    bySymbol: normalizedHistory
  };
}

function resolveSeed(seed, historyRecord) {
  const allBars = historyRecord?.bars;
  const historyLineage = historyRecord?.lineage || {
    schemaVersion: null,
    status: 'MISSING_SOURCE_HISTORY',
    lineageContractStatus: 'MISSING_SOURCE_HISTORY',
    stage4File: null,
    sourceFiles: [],
    storageSource: null,
    vendor: null,
    retrievedAt: null,
    sourceAsOf: null,
    adjustmentType: null,
    splitAdjustmentStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    dividendAdjustmentStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    marketTimezone: 'America/New_York',
    missingSessions: null,
    sourceFreshnessStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    historyCoverageStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    corporateActionStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    symbolChangeStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    delistingStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    suspensionStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    survivorshipBiasStatus: 'UNVERIFIED_NO_SOURCE_HISTORY',
    returnBasis: 'PRICE_RETURN_NOT_TOTAL_RETURN',
    lineageVerifiedByProducer: false,
    lineageKeyMatchesStage4Symbol: false,
    comparisonEligibilityStatus: 'UNVERIFIED_FOR_COMPARISON',
    comparisonExclusionReasons: ['source_history_missing'],
    lookbackStart: null,
    lookbackEnd: null,
    observationCount: 0
  };
  const base = {
    ...seed,
    historyLineage,
    biasAudit: {
      lookAheadViolation: false,
      survivorshipBiasViolation: false,
      survivorshipBiasStatus: historyLineage?.survivorshipBiasStatus || 'UNVERIFIED_NO_SOURCE_HISTORY'
    }
  };
  if (!seed.sourceLineageValid) {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_SOURCE_LINEAGE_INVALID',
      outcomeStatus: 'excluded_source_lineage_invalid',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  if (!seed.geometryValid) {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_INVALID_GEOMETRY',
      outcomeStatus: 'excluded_invalid_geometry',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  if (!Array.isArray(allBars) || allBars.length === 0) {
    return {
      ...base,
      outcomeLabel: 'PENDING_SOURCE_HISTORY',
      outcomeStatus: 'pending_source_history',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  if (historyLineage.comparisonEligibilityStatus !== 'VERIFIED_FOR_COMPARISON') {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED',
      outcomeStatus: 'excluded_corporate_action_lineage_unverified',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null
    };
  }
  const postDecisionAdjustmentEvents = [
    ...(Array.isArray(historyLineage.splitEvents) ? historyLineage.splitEvents : []),
    ...(Array.isArray(historyLineage.dividendEvents) ? historyLineage.dividendEvents : [])
  ].filter((event) => {
    const eventDate = String(event?.eventEffectiveAt || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && eventDate > seed.signalDate;
  });
  if (postDecisionAdjustmentEvents.length) {
    return {
      ...base,
      outcomeLabel: 'EXCLUDED_CORPORATE_ACTION_REBASE_REQUIRED',
      outcomeStatus: 'excluded_corporate_action_rebase_required',
      observedBars: 0,
      fillDate: null,
      resolvedAt: null,
      postDecisionAdjustmentEvents
    };
  }
  const signalDateBarAllowed = seed.signalMarketPhase === 'PRE_RTH';
  const eligible = allBars.filter((bar) => bar.date > seed.signalDate || (signalDateBarAllowed && bar.date === seed.signalDate));
  base.biasAudit.lookAheadViolation = eligible.some((bar) => bar.date < seed.signalDate || (!signalDateBarAllowed && bar.date === seed.signalDate));
  const preSignalBarsExcluded = allBars.length - eligible.length;
  const bars = eligible.slice(0, horizonBars);
  if (!bars.length) {
    return { ...base, outcomeLabel: 'PENDING_MARKET_DATA', outcomeStatus: 'pending', observedBars: 0, preSignalBarsExcluded };
  }

  let fillIndex = -1;
  let exitIndex = -1;
  let outcomeLabel = null;
  let exitPrice = null;
  let ambiguityReason = null;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (fillIndex < 0) {
      if (bar.low > seed.entryPrice) continue;
      fillIndex = index;
      const targetTouched = bar.high >= seed.targetPrice;
      const stopTouched = bar.low <= seed.stopPrice;
      if (targetTouched || stopTouched) {
        outcomeLabel = 'AMBIGUOUS_INTRABAR';
        ambiguityReason = 'entry_and_exit_threshold_touched_same_daily_bar';
        exitIndex = index;
        break;
      }
      continue;
    }

    const targetTouched = bar.high >= seed.targetPrice;
    const stopTouched = bar.low <= seed.stopPrice;
    if (targetTouched && stopTouched) {
      outcomeLabel = 'AMBIGUOUS_INTRABAR';
      ambiguityReason = 'target_and_stop_touched_same_daily_bar';
      exitIndex = index;
      break;
    }
    if (targetTouched) {
      outcomeLabel = 'TP_FIRST';
      exitPrice = seed.targetPrice;
      exitIndex = index;
      break;
    }
    if (stopTouched) {
      outcomeLabel = 'SL_FIRST';
      exitPrice = seed.stopPrice;
      exitIndex = index;
      break;
    }
  }

  if (fillIndex < 0) {
    return {
      ...base,
      outcomeLabel: bars.length >= horizonBars ? 'NO_FILL' : 'PENDING_MARKET_DATA',
      outcomeStatus: bars.length >= horizonBars ? 'resolved' : 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: null,
      resolvedAt: bars.length >= horizonBars ? bars.at(-1).date : null
    };
  }

  if (!outcomeLabel && bars.length >= horizonBars) {
    outcomeLabel = 'TIMEOUT';
    exitIndex = bars.length - 1;
    exitPrice = bars[exitIndex].close;
  }
  if (!outcomeLabel) {
    return {
      ...base,
      outcomeLabel: 'PENDING_MARKET_DATA',
      outcomeStatus: 'pending',
      observedBars: bars.length,
      preSignalBarsExcluded,
      fillDate: bars[fillIndex].date
    };
  }

  const observed = bars.slice(fillIndex, exitIndex + 1);
  const maxHigh = Math.max(...observed.map((bar) => bar.high));
  const minLow = Math.min(...observed.map((bar) => bar.low));
  const riskPerShare = seed.entryPrice - seed.stopPrice;
  const realizedR = exitPrice == null ? null : (exitPrice - seed.entryPrice) / riskPerShare;
  return {
    ...base,
    outcomeLabel,
    outcomeStatus: outcomeLabel === 'AMBIGUOUS_INTRABAR' ? 'excluded_ambiguous' : 'resolved',
    ambiguityReason,
    observedBars: bars.length,
    preSignalBarsExcluded,
    fillDate: bars[fillIndex].date,
    fillBasis: 'daily_bar_low_touched_limit_assumed_at_limit',
    resolvedAt: bars[exitIndex].date,
    exitPrice: exitPrice == null ? null : round(exitPrice),
    holdingBars: exitIndex - fillIndex + 1,
    mfePct: round(((maxHigh / seed.entryPrice) - 1) * 100),
    maePct: round(((minLow / seed.entryPrice) - 1) * 100),
    realizedR: realizedR == null ? null : round(realizedR)
  };
}

const {
  seeds,
  rejected,
  sourceFiles: stage6Files,
  duplicateSeedRows,
  deduplicatedSurfaceRows
} = readStage6Seeds();
const history = readPriceHistory();
const rows = seeds
  .map((seed) => resolveSeed(seed, history.bySymbol.get(seed.symbol)))
  .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.symbol.localeCompare(b.symbol));
const oosRows = rows
  .filter((row) => ['TP_FIRST', 'SL_FIRST', 'TIMEOUT'].includes(row.outcomeLabel))
  .map((row) => ({
    split: 'OOS',
    side: 'LONG',
    evaluationMode: row.decisionCohort === COHORTS.executable
      ? 'stage6_executable_policy'
      : row.decisionCohort === COHORTS.blocked
        ? 'stage6_actionable_blocked_counterfactual'
        : 'stage6_non_actionable_control',
    decisionCohort: row.decisionCohort,
    primaryBlocker: row.primaryBlocker,
    falseNegativeEligible: row.falseNegativeEligible,
    ledgerId: row.ledgerId,
    stage6Hash: row.stage6Hash,
    symbol: row.symbol,
    signalDate: row.signalDate,
    signalMarketPhase: row.signalMarketPhase,
    walkForwardCohort: row.signalDate.slice(0, 7),
    resolvedAt: row.resolvedAt,
    outcomeLabel: row.outcomeLabel,
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    holdingDays: row.holdingBars,
    mfePct: row.mfePct,
    maePct: row.maePct,
    realizedR: row.realizedR,
    decisionSnapshotSha256: row.decisionSnapshotSha256,
    corporateActionLineageSchemaVersion: row.historyLineage?.schemaVersion || null,
    adjustmentType: row.historyLineage?.adjustmentType || null,
    splitAdjustmentStatus: row.historyLineage?.splitAdjustmentStatus || null,
    dividendAdjustmentStatus: row.historyLineage?.dividendAdjustmentStatus || null,
    vendor: row.historyLineage?.vendor || null,
    retrievedAt: row.historyLineage?.retrievedAt || null,
    lineageEvaluatedAt: row.historyLineage?.lineageEvaluatedAt || null,
    externalEvidenceSha256: row.historyLineage?.externalEvidenceSha256 || null,
    sourceAsOf: row.historyLineage?.sourceAsOf || null,
    eventEffectiveAt: row.historyLineage?.eventEffectiveAt || null,
    marketTimezone: row.historyLineage?.marketTimezone || null,
    sourceFreshnessStatus: row.historyLineage?.sourceFreshnessStatus || null,
    historyCoverageStatus: row.historyLineage?.historyCoverageStatus || null,
    corporateActionStatus: row.historyLineage?.corporateActionStatus || null,
    symbolChangeStatus: row.historyLineage?.symbolChangeStatus || null,
    delistingStatus: row.historyLineage?.delistingStatus || null,
    suspensionStatus: row.historyLineage?.suspensionStatus || null,
    survivorshipBiasStatus: row.historyLineage?.survivorshipBiasStatus || null,
    returnBasis: row.historyLineage?.returnBasis || 'PRICE_RETURN_NOT_TOTAL_RETURN',
    comparisonEligibilityStatus: row.historyLineage?.comparisonEligibilityStatus || 'UNVERIFIED_FOR_COMPARISON',
    comparisonExclusionReasons: row.historyLineage?.comparisonExclusionReasons || [],
    lineageVerifiedForComparison: row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON',
    spreadBps: costs.spreadBps,
    slippageBps: costs.slippageBps,
    commissionBps: costs.commissionBps,
    costInputBasis: costs.basis
  }));

function summarizeOutcomes(groupRows) {
  const average = (field) => {
    const values = groupRows.flatMap((row) => {
      const value = Number(row?.[field]);
      return row?.[field] != null && Number.isFinite(value) ? [value] : [];
    });
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
  };
  const outcomeCounts = {};
  for (const row of groupRows) outcomeCounts[row.outcomeLabel] = (outcomeCounts[row.outcomeLabel] || 0) + 1;
  return {
    rows: groupRows.length,
    resolvedRows: groupRows.filter((row) => row.outcomeStatus === 'resolved').length,
    pendingRows: groupRows.filter((row) => String(row.outcomeStatus).startsWith('pending')).length,
    excludedRows: groupRows.filter((row) => String(row.outcomeStatus).startsWith('excluded')).length,
    falseNegativeEligibleRows: groupRows.filter((row) => row.falseNegativeEligible).length,
    outcomeCounts,
    meanMfePct: average('mfePct'),
    meanMaePct: average('maePct'),
    meanRealizedR: average('realizedR')
  };
}

const cohortCounts = Object.fromEntries(Object.values(COHORTS).map((cohort) => [cohort, rows.filter((row) => row.decisionCohort === cohort).length]));
const blockerCounts = {};
for (const row of rows) blockerCounts[row.primaryBlocker] = (blockerCounts[row.primaryBlocker] || 0) + 1;
const cohortOutcomes = Object.fromEntries(Object.values(COHORTS).map((cohort) => [cohort, summarizeOutcomes(rows.filter((row) => row.decisionCohort === cohort))]));
const blockerOutcomes = Object.fromEntries([...new Set(rows.map((row) => row.primaryBlocker))].sort().map((blocker) => [blocker, summarizeOutcomes(rows.filter((row) => row.primaryBlocker === blocker))]));
const summary = {
  seedRows: seeds.length,
  historyCoverageRows: rows.filter((row) => row.historyLineage?.status === 'PRESENT').length,
  missingHistoryRows: rows.filter((row) => row.historyLineage?.status !== 'PRESENT').length,
  resolvedRows: rows.filter((row) => row.outcomeStatus === 'resolved').length,
  pendingRows: rows.filter((row) => String(row.outcomeStatus).startsWith('pending')).length,
  excludedRows: rows.filter((row) => String(row.outcomeStatus).startsWith('excluded')).length,
  oosRows: oosRows.length,
  rejectedSeedRows: rejected.length,
  ambiguousRows: rows.filter((row) => row.outcomeLabel === 'AMBIGUOUS_INTRABAR').length,
  noFillRows: rows.filter((row) => row.outcomeLabel === 'NO_FILL').length,
  preSignalBarsExcluded: rows.reduce((sum, row) => sum + Number(row.preSignalBarsExcluded || 0), 0),
  duplicateSeedRows,
  deduplicatedSurfaceRows,
  cohortCounts,
  blockerCounts,
  unknownCohortRows: rows.filter((row) => !Object.values(COHORTS).includes(row.decisionCohort)).length,
  falseNegativeEligibleRows: rows.filter((row) => row.falseNegativeEligible).length,
  lookAheadViolationRows: rows.filter((row) => row.biasAudit?.lookAheadViolation).length,
  survivorshipBiasViolationRows: rows.filter((row) => row.biasAudit?.survivorshipBiasViolation).length,
  survivorshipBiasUnverifiedRows: rows.filter((row) => String(row.biasAudit?.survivorshipBiasStatus).startsWith('UNVERIFIED')).length,
  comparisonLineageExcludedRows: rows.filter((row) => row.outcomeLabel === 'EXCLUDED_CORPORATE_ACTION_LINEAGE_UNVERIFIED').length,
  comparisonEligibleHistoryRows: rows.filter((row) => row.historyLineage?.comparisonEligibilityStatus === 'VERIFIED_FOR_COMPARISON').length
};
const ledger = {
  schemaVersion: 'stage7-outcome-ledger-v2',
  generatedAt: new Date().toISOString(),
  overall: seeds.length ? 'report_only_outcomes_collected' : 'no_executable_stage6_seeds',
  interpretation: 'timestamped_forward_evidence_only_not_execution_or_alpha_approval',
  source: {
    stage6Directory: path.relative(root, stage6Dir),
    stage6Files,
    stage4Directory: path.relative(root, stage4Dir),
    stage4Files: history.sourceFiles
  },
  policy: {
    signalCohort: 'execution_contract executablePicks/modelTop6/watchlistTop final decision surface',
    cohorts: COHORTS,
    actionableVerdictSource: 'per_stage6_decisionGate_with_fallback',
    fallbackActionableVerdicts: DEFAULT_ACTIONABLE_VERDICTS,
    marketTimezone: 'America/New_York',
    horizonBars,
    barFrequency: 'daily',
    forwardBarRule: 'bar.date > signalMarketDate; signal-date daily bar allowed only when Stage6 was generated before 09:30 America/New_York',
    intrabarRule: 'exclude_when_entry_and_exit_or_target_and_stop_share_a_daily_bar',
    fillRule: 'long_limit_filled_when_daily_low_lte_entry_assume_entry_price',
    costInputs: costs,
    biasPolicy: 'decision snapshot is immutable; outcomes use only eligible post-decision daily bars; unverified corporate-action lineage remains explicit'
  },
  summary,
  cohortOutcomes,
  blockerOutcomes,
  rows,
  rejected
};
const oosPayload = {
  schemaVersion: 'stage3-5-oos-v2',
  generatedAt: ledger.generatedAt,
  sourceLedger: path.relative(root, ledgerOut),
  sourceLedgerSchemaVersion: ledger.schemaVersion,
  walkForwardPolicy: {
    split: 'OOS',
    cohort: 'signal_market_month',
    temporalRule: 'resolvedAt_after_signalDate_or_same_date_only_for_pre_rth_signal',
    ambiguousAndUnfilledRowsExcluded: true
  },
  rows: oosRows
};
const markdown = `# Stage7 Outcome Ledger\n\n` +
  `- Overall: \`${ledger.overall}\`\n` +
  `- Seed rows: ${summary.seedRows}\n` +
  `- Cohorts: ${Object.entries(summary.cohortCounts).map(([key, value]) => `${key}=${value}`).join(', ')}\n` +
  `- Resolved rows: ${summary.resolvedRows}\n` +
  `- Pending rows: ${summary.pendingRows}\n` +
  `- Missing source history rows: ${summary.missingHistoryRows}\n` +
  `- Pre-signal bars excluded: ${summary.preSignalBarsExcluded}\n` +
  `- OOS rows emitted: ${summary.oosRows}\n` +
  `- Ambiguous rows excluded: ${summary.ambiguousRows}\n` +
  `- Invalid-geometry rows excluded: ${rows.filter((row) => row.outcomeLabel === 'EXCLUDED_INVALID_GEOMETRY').length}\n` +
  `- Look-ahead violations: ${summary.lookAheadViolationRows}\n` +
  `- Survivorship lineage unverified rows: ${summary.survivorshipBiasUnverifiedRows}\n` +
  `- Horizon: ${horizonBars} daily bars\n` +
  `- Cost basis: \`${costs.basis}\` (${costs.spreadBps}/${costs.slippageBps}/${costs.commissionBps} bps spread/slippage/commission)\n\n` +
  `Bars after the Stage6 market date are evaluated; the signal-date bar is admitted only for a pre-RTH signal. Ambiguous daily-bar ordering is excluded and no broker behavior is authorized.\n`;

atomicWrite(ledgerOut, `${JSON.stringify(ledger, null, 2)}\n`);
atomicWrite(oosOut, `${JSON.stringify(oosPayload, null, 2)}\n`);
atomicWrite(markdownOut, markdown);
console.log(`[STAGE7_OUTCOME_LEDGER] overall=${ledger.overall} seeds=${summary.seedRows} resolved=${summary.resolvedRows} oos=${summary.oosRows}`);
