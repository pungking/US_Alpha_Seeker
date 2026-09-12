const DEFAULT_INITIAL_EQUITY = 100;
const DEFAULT_ANNUALIZATION_SESSIONS = 252;

const finitePositive = (value, label) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return number;
};

const sampleStandardDeviation = (values, mean) => {
  if (values.length < 2) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const percent = (value) => Number(value.toFixed(10));

const validateCandles = (candles) => {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('candles must contain at least one row');
  }

  let previousTimestamp = -Infinity;
  return candles.map((row, index) => {
    const timestamp = Number(row?.t);
    const open = finitePositive(row?.o, `candles[${index}].o`);
    const high = finitePositive(row?.h, `candles[${index}].h`);
    const low = finitePositive(row?.l, `candles[${index}].l`);
    const close = finitePositive(row?.c, `candles[${index}].c`);
    if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp) {
      throw new Error('candle timestamps must be strictly increasing');
    }
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) {
      throw new Error(`candles[${index}] OHLC geometry is invalid`);
    }
    previousTimestamp = timestamp;
    return { timestamp, open, high, low, close };
  });
};

export function simulateFixedTradeBox({
  candles,
  entry,
  target,
  stop,
  initialEquity = DEFAULT_INITIAL_EQUITY,
  annualizationSessions = DEFAULT_ANNUALIZATION_SESSIONS
}) {
  const rows = validateCandles(candles);
  const entryPrice = finitePositive(entry, 'entry');
  const targetPrice = finitePositive(target, 'target');
  const stopPrice = finitePositive(stop, 'stop');
  const startingEquity = finitePositive(initialEquity, 'initialEquity');
  const annualization = finitePositive(annualizationSessions, 'annualizationSessions');
  if (targetPrice <= entryPrice) throw new Error('target must be greater than entry');
  if (stopPrice >= entryPrice) throw new Error('stop must be less than entry');

  let cash = startingEquity;
  let position = null;
  let peakEquity = startingEquity;
  let maxDrawdownPct = 0;
  let previousEquity = startingEquity;
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const dailyReturns = [];
  const monthlyEquity = new Map();

  for (const row of rows) {
    let exitedThisBar = false;
    if (position) {
      let exitPrice = null;
      if (row.low <= stopPrice) {
        exitPrice = Math.min(row.open, stopPrice);
      } else if (row.high >= targetPrice) {
        exitPrice = Math.max(row.open, targetPrice);
      }
      if (exitPrice != null) {
        cash = position.quantity * exitPrice;
        const pnl = (exitPrice - position.entryPrice) * position.quantity;
        if (pnl > 0) {
          wins += 1;
          grossProfit += pnl;
        } else {
          losses += 1;
          grossLoss += Math.abs(pnl);
        }
        position = null;
        exitedThisBar = true;
      }
    }

    if (!position && !exitedThisBar && row.low <= entryPrice && row.high >= entryPrice) {
      position = { entryPrice, quantity: cash / entryPrice };
      cash = 0;
    }

    const equity = position ? position.quantity * row.close : cash;
    dailyReturns.push((equity / previousEquity) - 1);
    previousEquity = equity;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peakEquity - equity) / peakEquity) * 100);

    const date = new Date(row.timestamp);
    const month = `${date.getUTCFullYear().toString().slice(2)}.${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    monthlyEquity.set(month, equity);
  }

  const finalEquity = previousEquity;
  const finalReturnPct = ((finalEquity / startingEquity) - 1) * 100;
  const tradeCount = wins + losses;
  const meanReturn = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
  const returnStdDev = sampleStandardDeviation(dailyReturns, meanReturn);
  const sharpeRatio = returnStdDev && returnStdDev > 0
    ? (meanReturn / returnStdDev) * Math.sqrt(annualization)
    : null;

  return {
    equityCurve: [...monthlyEquity.entries()].map(([period, equity]) => ({
      period,
      value: percent(((equity / startingEquity) - 1) * 100)
    })),
    metrics: {
      tradeCount,
      wins,
      losses,
      winRatePct: tradeCount > 0 ? percent((wins / tradeCount) * 100) : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      grossProfit: percent(grossProfit),
      grossLoss: percent(grossLoss),
      maxDrawdownPct: percent(maxDrawdownPct),
      sharpeRatio,
      finalReturnPct: percent(finalReturnPct)
    },
    openPositionAtEnd: position != null,
    evidence: {
      mode: 'CURRENT_PLAN_HISTORICAL_REPLAY',
      lookAheadSafe: false,
      policyEligible: false,
      completedSessionOnlyVerified: false,
      policyImpact: 'NONE_REPORT_ONLY'
    },
    assumptions: {
      annualizationSessions: annualization,
      riskFreeRateAnnual: 0,
      fillModel: 'DAILY_OHLC_LIMIT_TOUCH_NO_FEES_OR_SLIPPAGE',
      intrabarConflictPolicy: 'STOP_FIRST_CONSERVATIVE',
      sameBarExitAfterEntryAllowed: false,
      sameBarReentryAllowed: false,
      finalOpenPositionValuation: 'MARK_TO_MARKET_AT_LAST_CLOSE'
    }
  };
}
