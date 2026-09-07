import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { hashTextSha256, hashBytesSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { summarizeTossShadowEvidence } from '../services/tossShadowContract.mjs';

const contract = await import('../services/stage5EvidenceContract.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  assert.fail('Stage5 input/output evidence contract is missing');
});
const { classifyStage5InputRow, buildStage5InputContext, buildStage5EvidenceArtifact,
  validateStage5EvidenceArtifact } = contract;
const decisionAt = '2026-09-07T02:00:00Z';
const metrics = Object.fromEntries(['rvol', 'rsi', 'rsRating', 'trend', 'momentum', 'mfi',
  'macdHistogram', 'diPlus', 'diMinus', 'minerviniScore', 'minerviniPassCount',
  'signalComboBonus', 'signalHeatPenalty', 'factorCoverage', 'factorConfidence',
  'factorQualityScore', 'factorAdjustmentTotal'].map(key => [key, 0]));
const row = {
  symbol: 'FIXTURE', name: 'Synthetic fixture', instrumentType: 'common', analysisEligible: true,
  price: 10, change: 0, fundamentalScore: 70, technicalScore: 70,
  dataSource: 'DRIVE',
  techMetrics: { ...metrics, rawRvol: 0, sourceIntegrityState: 'DRIVE_VERIFIED', dataQualityState: 'NORMAL', signalQualityState: 'NEUTRAL' },
  priceHistory: Array.from({ length: 25 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 7, i + 1)).toISOString().slice(0, 10),
    open: 10, high: 11, low: 9, close: 10, volume: 0
  }))
};
const regime = {
  status: 'VERIFIED_DECISION_TIME_REGIME', triggerMatches: true,
  triggerFile: 'STAGE3_FIXTURE.json', expectedTriggerFile: 'STAGE3_FIXTURE.json',
  sourceSha256: 'a'.repeat(64), sourceAsOf: '2026-09-06T23:00:00Z',
  retrievedAt: '2026-09-07T00:00:00Z', degraded: false
};
const stage4 = { manifest: { count: 1, sourceStage3File: 'STAGE3_FIXTURE.json',
  sourceStage3ContentSha256: 'b'.repeat(64), marketRegimeLineage: regime, ttmSqueezeVixRef: 18 },
technical_universe: [row] };
const fileName = 'STAGE4_TECHNICAL_FULL_FIXTURE.json';
const sourceText = JSON.stringify(stage4);
const contentSha256 = await hashTextSha256(sourceText);
const args = { payload: stage4, contentSha256, fileName, decisionAt,
  expectedHint: { fileName, contentSha256, sourceStage3File: 'STAGE3_FIXTURE.json' } };
const context = await buildStage5InputContext(args);
assert.equal(context.vix, 18);
assert.equal(context.evaluations[0].status, 'STAGE5_INPUT_VERIFIED', 'zero is valid, not missing');
assert.equal(context.inputRows, 1);
for (const edit of [
  x => { x.techMetrics.rawRvol = null; },
  x => { x.techMetrics.rvol = ''; },
  x => { delete x.techMetrics.rsi; },
  x => { x.priceHistory[0].close = null; },
  x => { x.priceHistory[0].high = 8; },
  x => { x.priceHistory[0].open = 12; },
  x => { x.priceHistory[1].date = x.priceHistory[0].date; },
  x => { x.priceHistory.reverse(); },
  x => { x.priceHistory.at(-1).date = '2026-09-08'; },
  x => { x.techMetrics.sourceIntegrityState = 'UNVERIFIED'; },
  x => { x.techMetrics.dataQualityState = 'STALE'; }
]) {
  const changed = structuredClone(row); edit(changed);
  assert.notEqual(classifyStage5InputRow(changed, { decisionAt }).status, 'STAGE5_INPUT_VERIFIED');
}
for (const change of [
  { contentSha256: 'c'.repeat(64) }, { fileName: 'STAGE4_TECHNICAL_FULL_OTHER.json' },
  { payload: { ...stage4, technical_universe: [row, row] } },
  { payload: { ...stage4, manifest: { ...stage4.manifest, count: 2 } } },
  { payload: { ...stage4, manifest: { ...stage4.manifest, ttmSqueezeVixRef: null } } },
  { payload: { ...stage4, manifest: { ...stage4.manifest,
    marketRegimeLineage: { ...regime, triggerFile: 'STAGE3_OTHER.json' } } } }
]) await assert.rejects(buildStage5InputContext({ ...args, ...change }));

const selected = { ...row, ictScore: 40, compositeAlpha: 50, rankRaw: 1, rankFinal: 1,
  ictMetrics: { displacement: 20, liquiditySweep: 20, marketStructure: 20, orderBlock: 20, smartMoneyFlow: 20 },
  otePrice: 9.5, ictStopLoss: 8, compositeBreakdown: { postDiversificationComposite: 50 } };
const make = () => buildStage5EvidenceArtifact({ context, manifest: { version: '6.9.0',
  count: 1, inputCount: 1, eligibleCount: 1, sourceStage4File: fileName,
  sourceStage4SourceStage3File: 'STAGE3_FIXTURE.json', timestamp: decisionAt },
  rankedRows: [selected], selectedRows: [selected] });
const artifact = await make();
assert.deepEqual(artifact, await make());
assert.equal((await validateStage5EvidenceArtifact(artifact)).ok, true);
for (const edit of [
  x => { x.ict_universe[0].price += 1; },
  x => { x.manifest.count = 2; },
  x => { x.manifest.schemaVersion = 'unsupported'; },
  x => { x.stage5_evaluation[0].selected = false; },
  x => { x.manifest.sourceStage4ContentSha256 = '0'.repeat(64); }
]) {
  const altered = structuredClone(artifact); edit(altered);
  assert.equal((await validateStage5EvidenceArtifact(altered)).ok, false);
}
assert.equal((await validateStage5EvidenceArtifact({ manifest: {}, ict_universe: [selected] })).ok, false);
assert.notEqual(await hashTextSha256(sourceText + ' '), contentSha256, 'hash raw bytes, not parsed JSON');

// Execute the real component's pure functions and scoring/selection loop, not a second formula.
const source = await readFile(new URL('../components/IctAnalysis.tsx', import.meta.url), 'utf8');
const constants = await readFile(new URL('../constants.ts', import.meta.url), 'utf8');
const configAst = ts.createSourceFile('constants.ts', constants, ts.ScriptTarget.Latest, true);
let configText;
for (const statement of configAst.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  const declaration = statement.declarationList.declarations.find(x => x.name.getText(configAst) === 'STRATEGY_CONFIG');
  if (declaration) configText = declaration.initializer.getText(configAst);
}
assert.ok(configText);
const configJs = ts.transpileModule(`return (${configText})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const config = new Function('parseNumberEnv', 'parseEnumEnv', 'parseBooleanEnv', configJs)(
  (_key, fallback) => fallback, (_key, _allowed, fallback) => fallback, (_key, fallback) => fallback);
const pure = source.slice(source.indexOf('const calculateIctScore ='), source.indexOf('const IctAnalysis:'));
const core = source.slice(source.indexOf('      const total = targets.length;'), source.indexOf('      setProcessedData(finalRankedResults);'));
assert.ok(pure.length > 1000 && core.length > 1000);
const js = ts.transpileModule(`${pure}\nreturn { calculateIctScore, normalizePriceHistoryBars, resolveIctExecutionGeometry,
  replay: async (targets, vix, context = { evaluations: targets.map(row => ({ symbol: row.symbol, status: 'STAGE5_INPUT_VERIFIED', reasons: [] })) }) => { ${core}; return { finalRankedResults, finalSurvivors }; } };`,
{ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const engine = new Function('STRATEGY_CONFIG', 'setProgress', 'addLog', 'setTimeout', js)(config, () => {}, () => {}, cb => cb());
if (process.env.STAGE5_REPLAY_DIR) {
  const root = process.env.STAGE5_REPLAY_DIR;
  const readStage = async (folder, name) => {
    assert.ok(typeof name === 'string' && !name.includes('/'), 'replay requires exact preserved filenames');
    const text = await readFile(`${root}/${folder}/${name}`, 'utf8');
    return { payload: JSON.parse(text), fileName: name, contentSha256: await hashTextSha256(text) };
  };
  const input = await readStage('stage4-audit-source', process.env.STAGE5_REPLAY_STAGE4_FILE);
  const previous = await readStage('stage5-audit-source', process.env.STAGE5_REPLAY_STAGE5_FILE);
  const at = previous.payload.manifest.timestamp;
  const inputContext = await buildStage5InputContext({ ...input, decisionAt: at });
  const targets = input.payload.technical_universe.filter((_, i) => inputContext.evaluations[i].status === 'STAGE5_INPUT_VERIFIED').map(row => ({ ...row,
    tempScore: row.technicalScore * .6 + row.fundamentalScore * .4
  })).sort((a, b) => b.tempScore - a.tempScore || a.symbol.localeCompare(b.symbol, 'en'));
  const replay = await engine.replay(targets, inputContext.vix, inputContext);
  assert.deepEqual(replay, await engine.replay(targets, inputContext.vix, inputContext), 'all-row deterministic replay');
  const sourceRows = new Map(input.payload.technical_universe.map(row => [row.symbol, row]));
  for (const computed of replay.finalRankedResults) {
    const original = sourceRows.get(computed.symbol);
    assert.deepEqual(computed.priceHistory, original.priceHistory, 'OHLCV is never rewritten');
    assert.deepEqual(computed.techMetrics, original.techMetrics, 'earnings/factor/technical evidence passes through unchanged');
    assert.deepEqual(computed.marketRegimeLineage, original.marketRegimeLineage);
    assert.deepEqual(computed.corporateActionLineage, original.corporateActionLineage);
  }
  const oldSelected = new Map(previous.payload.ict_universe.map(row => [row.symbol, row]));
  const fields = ['ictScore', 'ictMetrics', 'compositeAlpha', 'rankRaw', 'rankFinal', 'pdZone', 'otePrice', 'ictStopLoss', 'compositeBreakdown'];
  const mismatches = Object.fromEntries(fields.map(field => [field, replay.finalRankedResults.filter(row =>
    oldSelected.has(row.symbol) && JSON.stringify(row[field]) !== JSON.stringify(oldSelected.get(row.symbol)[field])).length]));
  const baseline = process.env.STAGE5_REPLAY_BASELINE === 'true';
  const built = baseline ? null : await buildStage5EvidenceArtifact({ context: inputContext,
    manifest: { ...previous.payload.manifest }, rankedRows: replay.finalRankedResults, selectedRows: replay.finalSurvivors });
  if (built) assert.equal((await validateStage5EvidenceArtifact(built)).ok, true);
  const aggregate = { inputRows: inputContext.inputRows, classifiedRows: inputContext.evaluations.length,
    verifiedInputRows: inputContext.evaluations.filter(row => row.status === 'STAGE5_INPUT_VERIFIED').length,
    rankedRows: replay.finalRankedResults.length, selectedRows: replay.finalSurvivors.length,
    retainedSelectedRows: replay.finalSurvivors.filter(row => oldSelected.has(row.symbol)).length,
    previousSelectedRows: oldSelected.size, changedFieldsAmongPreviousSelection: mismatches,
    inputSha256: input.contentSha256, previousStage5Sha256: previous.contentSha256,
    outputHash: built?.manifest.outputHash ?? null, deterministicRerun: true, externalRequestCount: 0,
    empiricalAccuracyCertified: false };
  console.log(JSON.stringify(aggregate));
}
const low = engine.calculateIctScore(row);
assert.equal(low.score, 11.55, '0 displacement, -6 internal MSS, 65 wick sweep, 20 OB, 0 flow: existing weights');
const mid = engine.calculateIctScore({ ...row, techMetrics: { ...row.techMetrics, rvol: 50 } });
assert.notEqual(low.metrics.displacement, mid.metrics.displacement, 'normalized RVOL zero must not become 50');
assert.deepEqual(engine.normalizePriceHistoryBars([{ high: 11, low: 9 }]), [], 'no synthetic midpoint close');
assert.deepEqual(engine.normalizePriceHistoryBars([{ high: 9, low: 11, close: 10 }]), [], 'no inverted range repair');
const once = await engine.replay([row], 18);
assert.deepEqual(once, await engine.replay([row], 18));
assert.equal(once.finalSurvivors.length, 1);
assert.equal(once.finalSurvivors[0].priceHistory, row.priceHistory, 'upstream evidence passes through');
const volumeRow = { ...row, techMetrics: { ...row.techMetrics, squeezeState: 'SQUEEZE_ON', rvol: 80, rawRvol: 1 } };
const unconfirmed = (await engine.replay([volumeRow], 18)).finalSurvivors[0];
const confirmed = (await engine.replay([{ ...volumeRow, techMetrics: { ...volumeRow.techMetrics, rawRvol: 2 } }], 18)).finalSurvivors[0];
assert.equal(confirmed.ictMetrics.liquiditySweep - unconfirmed.ictMetrics.liquiditySweep, 20, 'only the raw ratio confirms the overlay (capped at 100)');
assert.equal(once.finalSurvivors[0].institutionalActivityVerified, false);
const missingRange = engine.resolveIctExecutionGeometry({ ...row, priceHistory: [] });
assert.ok(!Number.isFinite(missingRange.otePrice), 'no synthetic 52-week bounds from current price');
const nullPos = (await engine.replay([{ ...row, ictPos: null }], 18)).finalSurvivors[0];
assert.equal(nullPos.pdZone, 'EQUILIBRIUM', 'null position must use measured range, not Number(null)=0');
const zeroTechnical = (await engine.replay([{ ...row, technicalScore: 0 }], 18)).finalSurvivors[0];
assert.equal(zeroTechnical.compositeBreakdown.mode, 'RISK_ON', 'a verified zero score is not missing technical evidence');

const executeText = source.slice(source.indexOf('  const executeIntegratedIctProtocol ='), source.indexOf('  const ensureFolder ='));
const executeJs = ts.transpileModule(`${pure}\n${executeText}\nreturn executeIntegratedIctProtocol;`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
async function integration(input = stage4, hint = args.expectedHint, autoStart = true) {
  const store = new Map(hint ? [[contract.STAGE4_RECENT_HINT_KEY, JSON.stringify(hint)]] : []);
  const requests = [], uploads = [], errors = [];
  let completed = false;
  class FixedDate extends Date {
    constructor(...values) { super(...(values.length ? values : [decisionAt])); }
    static now() { return Date.parse(decisionAt); }
  }
  const scope = { STRATEGY_CONFIG: config, accessToken: 'fixture-only', loading: false, autoStart,
    setLoading: () => {}, startTimeRef: {}, setTimeStats: () => {}, setProgress: () => {}, addLog: (message, level) => { if (level === 'err') errors.push(message); },
    setProcessedData: () => {}, handleTickerSelect: () => {}, onComplete: () => { completed = true; },
    Date: FixedDate, setTimeout: cb => cb(),
    window: { sessionStorage: { getItem: key => store.get(key), removeItem: key => store.delete(key), setItem: (key, value) => store.set(key, value) } },
    STAGE4_RECENT_HINT_KEY: contract.STAGE4_RECENT_HINT_KEY, STAGE5_RECENT_HINT_KEY: 'fixture-stage5-hint',
    GOOGLE_DRIVE_TARGET: { stage4SubFolder: 'fixture-stage4', stage5SubFolder: 'fixture-stage5' },
    findFolderId: async () => 'fixture-folder', ensureFolder: async () => 'fixture-folder',
    assertDriveOk: async res => { if (!res.ok) throw new Error('fixture HTTP failure'); },
    hashBytesSha256, hashTextSha256, buildStage5InputContext, buildStage5EvidenceArtifact,
    summarizeTossShadowEvidence, formatKstFilenameTimestamp: () => 'FIXTURE',
    fetch: async (url, options) => {
      requests.push(url);
      if (url.includes('/upload/')) {
        uploads.push(await options.body.get('file').text());
        return new Response(JSON.stringify({ id: 'fixture-stage5-id' }));
      }
      if (url.includes('alt=media')) return new Response(JSON.stringify(input));
      return new Response(JSON.stringify({ files: [{ id: 'fixture-stage4-id', name: fileName }] }));
    }
  };
  await new Function(...Object.keys(scope), executeJs)(...Object.values(scope))();
  return { requests, uploads, completed, errors, hint: JSON.parse(store.get('fixture-stage5-hint') || 'null') };
}
const integrated = await integration();
assert.equal(integrated.completed, true, integrated.errors.join(','));
assert.equal(integrated.uploads.length, 1);
assert.equal(integrated.hint.contentSha256, await hashTextSha256(integrated.uploads[0]));
assert.equal((await validateStage5EvidenceArtifact(JSON.parse(integrated.uploads[0]))).ok, true);
assert.equal(integrated.requests.filter(url => url.includes('alt=media')).length, 1);
for (const [input, hint] of [
  [stage4, { ...args.expectedHint, contentSha256: 'a'.repeat(64) }],
  [stage4, null],
  [{ ...stage4, manifest: { ...stage4.manifest, ttmSqueezeVixRef: null } }, args.expectedHint]
]) {
  const rejected = await integration(input, hint);
  assert.equal(rejected.completed, false);
  assert.equal(rejected.uploads.length, 0);
  assert.ok(rejected.requests.filter(url => url.includes('alt=media')).length <= 1, 'no older-file retry');
}
console.log('stage5-evidence-contract: PASS (offline; synthetic rows only)');
export { artifact };
