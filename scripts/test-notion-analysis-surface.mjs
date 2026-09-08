import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const rows = [
  { symbol: 'FIXTURE_EXEC', finalDecision: 'EXECUTABLE_NOW', executionBucket: 'EXECUTABLE', decisionReason: 'valid' },
  { symbol: 'FIXTURE_WAIT', finalDecision: 'WAIT_PRICE', executionBucket: 'WATCHLIST', decisionReason: 'distance' }
];
const payload = {
  runId: 'fixture-run', runDateIso: '2026-09-07T15:00:00Z', engine: 'fixture',
  stage6File: 'STAGE6_ALPHA_FINAL_fixture.json', stage6Hash: 'a'.repeat(64),
  stageCounts: { finalPicks: 1 }, executablePicks: rows.slice(0, 1), watchlist: rows.slice(1)
};

// Execute both real writers with an in-memory Notion API; no credentials or network.
async function captureWrites(kind, statusType = 'select') {
  const writes = [];
  const schema = {
    Ticker: { type: 'title' }, Status: { type: statusType },
    Notes: { type: 'rich_text' }, 'Risk Factors': { type: 'rich_text' }
  };
  const context = vm.createContext({
    AbortController, setTimeout, clearTimeout, console,
    process: { env: {
      NOTION_TOKEN: 'fixture-only', NOTION_DB_DAILY_SNAPSHOT: 'daily',
      NOTION_DB_STOCK_SCORES: 'scores', NOTION_DB_AI_ALPHA_ANALYSIS: 'ai', NOTION_DB_WATCHLIST: 'watch'
    } },
    captureApiError: () => assert.fail('writer failed'), withSentryApi: (fn) => fn,
    fetch: async (url, init) => {
      assert.ok(url.startsWith('https://api.notion.com/'));
      let data;
      if (init.method === 'GET') data = { properties: schema };
      else if (url.endsWith('/query')) data = { results: [] };
      else {
        assert.equal(init.method, 'POST');
        assert.ok(url.endsWith('/v1/pages'));
        writes.push(JSON.parse(init.body));
        data = {};
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(data) };
    }
  });
  if (kind === 'cli') {
    const source = read('scripts/sync-pipeline-notion.mjs').replace(/^import fs from "node:fs";\s*/, '').split('const main = async () => {')[0];
    const writers = vm.runInContext(`${source}\n({syncStockScores, syncAiAnalysis, syncWatchlist})`, context);
    const args = { token: 'fixture-only', runDate: payload.runDateIso, rows, runMeta: payload,
      executableSymbols: new Set([rows[0].symbol]) };
    await writers.syncStockScores({ ...args, databaseId: 'scores' });
    await writers.syncAiAnalysis({ ...args, databaseId: 'ai' });
    await writers.syncWatchlist({ ...args, databaseId: 'watch' });
  } else {
    const source = read('api/notion_sync.ts').replace(/^import[^\n]+\n/, '').replace('export default withSentryApi(handler);', '');
    const compiled = ts.transpileModule(`${source}\nglobalThis.testHandler = handler;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText;
    vm.runInContext(compiled, context);
    const response = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, json(body) { assert.equal(body.ok, true); } };
    await context.testHandler({ method: 'POST', body: payload }, response);
  }
  return writes.filter((write) => write.parent.database_id !== 'daily');
}

for (const [kind, type] of [['cli', 'select'], ['cli', 'status'], ['cli', 'rich_text'], ['api', 'select']]) {
  const writes = await captureWrites(kind, type);
  assert.equal(writes.length, 6);
  const watches = writes.filter((write) => write.parent.database_id === 'watch');
  for (const write of watches) {
    const status = write.properties.Status;
    assert.equal(status.select?.name ?? status.status?.name ?? status.rich_text?.[0]?.text?.content,
      'Watching', `${kind}: an analysis candidate is not a broker position`);
  }
  for (const write of writes) {
    const props = write.properties;
    const row = rows.find((item) => item.symbol === props.Ticker.title[0].text.content);
    assert.ok(row);
    const notes = (props.Notes ?? props['Risk Factors']).rich_text[0].text.content;
    for (const value of [
      `decision=${row.finalDecision}`, `reason=${row.decisionReason}`, `bucket=${row.executionBucket}`,
      `run=${payload.runId}`, `stage6=${payload.stage6File}`, `hash=${payload.stage6Hash}`
    ]) assert.ok(notes.includes(value), `${kind}: missing canonical decision/lineage`);
  }
  assert.deepEqual(await captureWrites(kind, type), writes, 'deterministic surface');
}
console.log('PASS Notion analysis-only status and exact Stage6 lineage: both writers, network=0');
