import assert from 'node:assert/strict';

let simulateFixedTradeBox;
try {
  ({ simulateFixedTradeBox } = await import('../services/deterministicBacktest.mjs'));
} catch (error) {
  assert.fail(`deterministic backtest implementation missing: ${error?.code || error?.name || 'unknown'}`);
}

const candle = (date, open, high, low, close) => ({
  t: Date.parse(`${date}T20:00:00Z`),
  o: open,
  h: high,
  l: low,
  c: close
});

const closedTrades = simulateFixedTradeBox({
  candles: [
    candle('2026-01-02', 11, 11, 10, 10.5),
    candle('2026-01-05', 12.5, 13, 11.5, 12.5),
    candle('2026-02-02', 10, 10.5, 9.5, 10),
    candle('2026-02-03', 8.5, 9.2, 8, 8.8)
  ],
  entry: 10,
  target: 12,
  stop: 9
});

assert.equal(closedTrades.metrics.tradeCount, 2);
assert.equal(closedTrades.metrics.wins, 1);
assert.equal(closedTrades.metrics.losses, 1);
assert.equal(closedTrades.metrics.finalReturnPct, 6.25);
assert.equal(closedTrades.metrics.profitFactor, 4 / 3);
assert.ok(Math.abs(closedTrades.metrics.sharpeRatio - 2.555330851822107) < 1e-12);
assert.deepEqual(closedTrades.equityCurve, [
  { period: '26.01', value: 25 },
  { period: '26.02', value: 6.25 }
]);

const openPosition = simulateFixedTradeBox({
  candles: [candle('2026-03-02', 11, 11, 10, 11)],
  entry: 10,
  target: 12,
  stop: 9
});
assert.equal(openPosition.metrics.tradeCount, 0);
assert.equal(openPosition.metrics.finalReturnPct, 10);
assert.equal(openPosition.metrics.profitFactor, null);
assert.equal(openPosition.openPositionAtEnd, true);

const intrabarConflict = simulateFixedTradeBox({
  candles: [
    candle('2026-04-01', 10, 10.5, 9.8, 10),
    candle('2026-04-02', 10, 13, 8, 11)
  ],
  entry: 10,
  target: 12,
  stop: 9
});
assert.equal(intrabarConflict.metrics.losses, 1);
assert.equal(intrabarConflict.metrics.finalReturnPct, -10);
assert.equal(intrabarConflict.assumptions.intrabarConflictPolicy, 'STOP_FIRST_CONSERVATIVE');
assert.equal(intrabarConflict.assumptions.sameBarReentryAllowed, false);

assert.equal(closedTrades.evidence.mode, 'CURRENT_PLAN_HISTORICAL_REPLAY');
assert.equal(closedTrades.evidence.lookAheadSafe, false);
assert.equal(closedTrades.evidence.policyEligible, false);
assert.equal(closedTrades.evidence.completedSessionOnlyVerified, false);
assert.equal(closedTrades.assumptions.riskFreeRateAnnual, 0);
assert.equal(closedTrades.assumptions.annualizationSessions, 252);

assert.throws(
  () => simulateFixedTradeBox({ candles: [candle('2026-05-01', 10, 11, 9, 10)], entry: 10, target: 9, stop: 8 }),
  /target must be greater than entry/
);
assert.throws(
  () => simulateFixedTradeBox({
    candles: [candle('2026-05-02', 10, 11, 9, 10), candle('2026-05-01', 10, 11, 9, 10)],
    entry: 10,
    target: 12,
    stop: 8
  }),
  /strictly increasing/
);

console.log('[DETERMINISTIC_BACKTEST_CONTRACT] PASS');
