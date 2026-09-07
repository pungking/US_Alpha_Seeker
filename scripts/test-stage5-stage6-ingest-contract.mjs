import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { artifact } from './test-stage5-evidence-contract.mjs';
import { hashBytesSha256, hashTextSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { validateStage5EvidenceArtifact } from '../services/stage5EvidenceContract.mjs';

const source = await readFile(new URL('../components/AlphaAnalysis.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('AlphaAnalysis.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    functions.set(node.name.text, node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
const fn = (name, scope) => {
  assert.ok(functions.has(name), `missing actual function ${name}`);
  const js = ts.transpileModule(`return (${functions.get(name)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), js)(...Object.values(scope));
};
const hash = fn('fnv1aHash', {});
const lock = fn('buildStage5LockMeta', { fnv1aHash: hash, toNonNegativeInt: (v, fallback) => Number.isInteger(v) && v >= 0 ? v : fallback });
const file = { id: 'fixture-id', name: 'STAGE5_ICT_ELITE_FIXTURE.json' };
const changed = structuredClone(artifact); changed.ict_universe[0].price += 1;
assert.equal(lock(file, artifact, 'LATEST').hash, lock(file, changed, 'LATEST').hash, 'legacy FNV identity semantics preserved');
assert.notEqual(await hashTextSha256(JSON.stringify(artifact)), await hashTextSha256(JSON.stringify(changed)));
const resolveHint = raw => fn('resolveStage5RecentHint', {
  window: { sessionStorage: { getItem: () => raw } }, STAGE5_RECENT_HINT_KEY: 'fixture',
  STAGE5_RECENT_HINT_MAX_AGE_MS: 45 * 60 * 1000
})();
assert.equal(resolveHint(null), null);
const validHint = { fileName: file.name, createdAt: new Date().toISOString(), contentSha256: await hashTextSha256(JSON.stringify(artifact)) };
assert.deepEqual(resolveHint(JSON.stringify(validHint)), validHint);
for (const patch of [{ createdAt: null }, { createdAt: 'invalid' }, { contentSha256: null },
  { createdAt: new Date(Date.now() + 60_000).toISOString() },
  { createdAt: new Date(Date.now() - 46 * 60_000).toISOString() }
]) assert.throws(() => resolveHint(JSON.stringify({ ...validHint, ...patch })));

async function load(payload, { override = { enabled: false }, hint = null, missing = false, text = JSON.stringify(payload), autoStart = false } = {}) {
  const sourceRef = { current: null }, eligibility = { current: null }, published = [];
  let contentRequests = 0;
  const loader = fn('loadStage5Data', {
    accessToken: 'fixture-only-not-a-real-token', autoStart,
    stage5SourceRef: sourceRef, stage5EligibilityRef: eligibility,
    resolveStage5LockOverride: () => override, resolveStage5RecentHint: () => hint,
    setElite50: rows => published.push(rows.length), addLog: () => {},
    buildStage5LockMeta: lock, isAnalysisEligibleTicker: () => true,
    toNonNegativeInt: (v, fallback) => Number.isInteger(v) && v >= 0 ? v : fallback,
    assertDriveOk: async r => { if (!r.ok) throw new Error('fixture HTTP error'); },
    parseDriveJsonText: JSON.parse, hashBytesSha256, hashTextSha256, validateStage5EvidenceArtifact,
    fetch: async url => {
      if (url.includes('alt=media')) { contentRequests++; return new Response(text); }
      if (url.includes('/files/fixture-id?')) return new Response(JSON.stringify(file), { status: missing ? 404 : 200 });
      return new Response(JSON.stringify({ files: missing ? [] : [file] }));
    }
  });
  const rows = await loader();
  return { rows, source: sourceRef.current, published, contentRequests };
}
for (const options of [ {}, { override: { enabled: true, fileId: file.id } },
  { override: { enabled: true, fileName: file.name } },
  { hint: { fileId: file.id, fileName: file.name, contentSha256: await hashTextSha256(JSON.stringify(artifact)) } },
  { hint: { fileName: file.name, contentSha256: await hashTextSha256(JSON.stringify(artifact)) } }
]) {
  const good = await load(artifact, options);
  assert.equal(good.rows.length, 1);
  assert.equal(good.source.contentSha256, await hashTextSha256(JSON.stringify(artifact)));
  assert.equal(good.source.schemaValidationStatus, 'STAGE5_EVIDENCE_CONTRACT_VALID');
}
for (const payload of [changed, { ...artifact, manifest: { ...artifact.manifest, count: 2 } },
  { ...artifact, manifest: { ...artifact.manifest, schemaVersion: 'unsupported' } },
  { manifest: { count: 1 }, ict_universe: artifact.ict_universe }
]) {
  const rejected = await load(payload);
  assert.equal(rejected.rows.length, 0);
  assert.equal(rejected.source, null);
  assert.ok(rejected.published.every(count => count === 0));
}
assert.equal((await load(artifact, { hint: { fileId: file.id, contentSha256: 'a'.repeat(64) } })).rows.length, 0);
assert.equal((await load(artifact, { hint: { fileId: file.id, contentSha256: 'a'.repeat(64) }, missing: true })).contentRequests, 0);
assert.equal((await load(artifact, { autoStart: true })).contentRequests, 0, 'auto path requires same-run hint');
assert.equal((await load(artifact, { text: JSON.stringify(artifact).replace('"price":10', '"price":NaN') })).rows.length, 0,
  'no permissive NaN repair at the trust boundary');

let enriched = false;
const execute = fn('handleExecuteEngine', { loading: false, accessToken: 'fixture', elite50: [artifact.ict_universe[0]],
  setLoading: () => {}, setLogs: () => {}, addLog: () => {},
  stage6FinalRef: {}, stage6ModelTop6Ref: {}, stage6WatchlistTopRef: {}, stage6ExecutableRef: {}, stage6FinalRunIdRef: {},
  loadStage5Data: async () => [], stage5SourceRef: { current: null },
  enrichAllCandidates: async rows => { enriched = true; return rows; },
  runStage1: async rows => rows, runStage2: async () => {}, autoStart: false
});
await execute();
assert.equal(enriched, false, 'failed Drive lock must not reuse cached elite50');
assert.ok(!source.includes('const prefetchStage5 ='), 'no background loader may overwrite an active run source');
console.log('stage5-stage6-ingest-contract: PASS (mock Drive only; external requests=0)');
