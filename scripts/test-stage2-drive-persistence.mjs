import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { hashTextSha256 } from '../services/stage0SourceEvidenceContract.mjs';
import { persistStage2Artifact as upload } from '../services/stage2DrivePersistence.mjs';

const component = readFileSync(new URL('../components/DeepQualityFilter.tsx', import.meta.url), 'utf8');
const content = { schema_version: 'fixture', elite_universe: [] };
const bytes = JSON.stringify(content, null, 2), sha256 = await hashTextSha256(bytes);
function fixture({ post = 'timeout', meta = {}, media = bytes, generate = {}, getStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || 'GET'; calls.push({ url, method, init });
    if (url.includes('/generateIds')) return Response.json({ ids: ['generated-fixture-id'], ...generate });
    if (method === 'POST') {
      if (post === 'timeout') throw new DOMException('private-token fixture url', 'AbortError');
      if (post === 'transport') throw new TypeError('private-token transport');
      if (post === 'malformed') return new Response('not-json');
      return Response.json({ id: 'generated-fixture-id' }, { status: post });
    }
    if (url.includes('alt=media')) return new Response(media);
    return Response.json({ id: 'generated-fixture-id', name: 'fixture.json', parents: ['fixture-folder'],
      mimeType: 'application/json', trashed: false, ...meta }, { status: getStatus });
  };
  return { fetchImpl, calls };
}
const options = { token: 'private-token', folderId: 'fixture-folder', name: 'fixture.json', content };
const recovered = fixture();
const result = await upload(options, recovered);
assert.equal(result.status, 'STAGE2_PERSISTED_HASH_VERIFIED');
assert.equal(result.contentSha256, sha256);
assert.equal(recovered.calls.filter(c => c.method === 'POST').length, 1);
assert.equal(recovered.calls.length, 4);
assert.ok(recovered.calls.every(c => c.init.signal instanceof AbortSignal && c.init.redirect === 'error'));
const postBody = await recovered.calls.find(c => c.method === 'POST').init.body.text();
assert.ok(postBody.includes('"id":"generated-fixture-id"'));
assert.ok(postBody.includes(bytes));
assert.ok(!JSON.stringify(result).includes('generated-fixture-id'));
for (const post of [200, 500, 409, 'transport', 'malformed']) {
  const f = fixture({ post });
  assert.equal((await upload(options, f)).status, 'STAGE2_PERSISTED_HASH_VERIFIED');
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(f.calls.length, 4);
}
for (const optionsOverride of [{ media: 'changed' }, { meta: { name: 'other.json' } },
  { meta: { id: 'other-id' } }, { meta: { parents: ['other-folder'] } },
  { meta: { mimeType: 'text/html' } }, { meta: { trashed: true } },
  { generate: { ids: [] } }, { generate: { ids: ['one', 'two'] } }, { getStatus: 404 },
  { post: 401 }, { post: 403 }, { post: 400 }]) {
  const f = fixture(optionsOverride);
  await assert.rejects(upload(options, f), e => /^STAGE2_DRIVE_[A-Z0-9_]+$/.test(e.message));
  assert.ok(f.calls.filter(c => c.method === 'POST').length <= 1);
  if ([400, 401, 403].includes(optionsOverride.post)) assert.equal(f.calls.length, 2);
}
for (const change of [{ token: '' }, { folderId: 'unsafe/path' }, { content: { tooLarge: 'x'.repeat(5 * 1024 * 1024) } }]) {
  const f = fixture();
  await assert.rejects(upload({ ...options, ...change }, f), /^Error: STAGE2_DRIVE_/);
  assert.equal(f.calls.length, 0);
}
for (const failedRead of ['generateIds', '?fields=', 'alt=media']) {
  const f = fixture({ post: 200 }), originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, init) => {
    if (url.includes(failedRead)) throw new TypeError('private-token fixture-folder source response must not escape');
    return originalFetch(url, init);
  };
  await assert.rejects(upload(options, f), /^Error: STAGE2_DRIVE_PERSISTENCE_UNCONFIRMED$/);
}
// Exercise a stalled response body: expiry must abort, and no new POST is allowed.
const realTimer = globalThis.setTimeout;
try {
  globalThis.setTimeout = callback => realTimer(callback, 5);
  for (const stall of ['headers', 'body']) {
    const f = fixture({ post: 200 }), originalFetch = f.fetchImpl;
    f.fetchImpl = async (url, init) => {
      if (init.method !== 'POST') return originalFetch(url, init);
      f.calls.push({ url, method: 'POST', init });
      if (stall === 'headers') return new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('fixture', 'AbortError')), { once: true });
      });
      return new Response(new ReadableStream({ start(controller) {
        init.signal.addEventListener('abort', () => controller.error(new DOMException('fixture', 'AbortError')), { once: true });
      } }));
    };
    assert.equal((await upload(options, f)).status, 'STAGE2_PERSISTED_HASH_VERIFIED');
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
    assert.equal(f.calls.length, 4);
  }
  const f = fixture({ post: 200 }), originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, init) => {
    if (!url.includes('alt=media')) return originalFetch(url, init);
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new DOMException('fixture', 'AbortError')), { once: true });
    } }));
  };
  await assert.rejects(upload(options, f), /^Error: STAGE2_DRIVE_PERSISTENCE_UNCONFIRMED$/);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
} finally { globalThis.setTimeout = realTimer; }
assert.ok(component.includes('await persistStage2Artifact'), 'component must use the tested helper');
function completionTail(source) {
  const uploadIndex = source.indexOf('await uploadFile(accessToken'), callbackIndex = source.indexOf('if (onComplete) onComplete()');
  assert.ok(uploadIndex >= 0 && callbackIndex > uploadIndex, 'persist must be awaited before completion');
  const start = source.indexOf('const saveFolderId = await ensureFolder'), end = source.indexOf('\n  return (', start);
  assert.ok(start >= 0 && start < uploadIndex && end > callbackIndex);
  return ts.transpileModule(`globalThis.run = async () => { try { ${source.slice(start, end)}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
assert.throws(() => completionTail(component.replace('await uploadFile(accessToken', 'uploadFile(accessToken')));
for (const outcome of ['resolve', 'reject']) {
  let settle, completed = 0, uploads = 0;
  const pending = new Promise((resolve, reject) => { settle = outcome === 'resolve' ? resolve : reject; });
  const window = {};
  const context = vm.createContext({ window, autoStart: true, accessToken: 'fixture-token', payload: content,
    GOOGLE_DRIVE_TARGET: { stage2SubFolder: 'fixture-folder' }, ensureFolder: async () => 'fixture-folder',
    formatKstFilenameTimestamp: () => 'fixture-time', uploadFile: async () => { uploads++; await pending; },
    onComplete: () => { completed++; }, addLog: () => {}, setLoading: () => {}, setProgress: () => {} });
  vm.runInContext(completionTail(component), context);
  const running = context.run();
  await new Promise(resolve => realTimer(resolve, 0));
  assert.equal(uploads, 1); assert.equal(completed, 0, 'pending persistence cannot advance Stage3');
  settle(outcome === 'reject' ? Error('fixture-storage-unconfirmed') : undefined);
  await running;
  assert.equal(completed, outcome === 'resolve' ? 1 : 0);
  assert.equal(typeof window.__AUTO_DONE, outcome === 'reject' ? 'string' : 'undefined');
}
console.log('PASS Stage2 timeout reconciliation, exact id/metadata/bytes, no repeated POST, fail-closed; Drive requests=0');
