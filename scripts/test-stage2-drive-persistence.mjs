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
for (const change of [{ token: '' }, { folderId: 'unsafe/path' }]) {
  const f = fixture();
  await assert.rejects(upload({ ...options, ...change }, f), /^Error: STAGE2_DRIVE_/);
  assert.equal(f.calls.length, 0);
}
const largeContent = { ...content, evidence: 'x'.repeat(5 * 1024 * 1024), label: '\u00e9' };
const largeBytes = JSON.stringify(largeContent, null, 2);
const largeSha256 = await hashTextSha256(largeBytes);
const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture-session';
function resumableFixture({ location = sessionUrl, sessionStatus = 200, put = 200, ...rest } = {}) {
  const f = fixture({ media: largeBytes, ...rest }), originalFetch = f.fetchImpl;
  f.fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST') {
      f.calls.push({ url, method: 'POST', init });
      assert.ok(url.includes('uploadType=resumable'));
      if (sessionStatus === 'timeout') throw new DOMException('private-token session', 'AbortError');
      return new Response(null, { status: sessionStatus, headers: location === null ? {} : { Location: location } });
    }
    if (init.method === 'PUT') {
      f.calls.push({ url, method: 'PUT', init });
      if (put === 'timeout') throw new DOMException('private-token session', 'AbortError');
      return new Response('untrusted upload response', { status: put });
    }
    return originalFetch(url, init);
  };
  return f;
}
const large = resumableFixture();
const largeResult = await upload({ ...options, content: largeContent }, large);
assert.equal(largeResult.status, 'STAGE2_PERSISTED_HASH_VERIFIED');
assert.equal(largeResult.contentSha256, largeSha256);
assert.deepEqual(large.calls.map(c => c.method), ['GET', 'POST', 'PUT', 'GET', 'GET']);
const start = large.calls[1], put = large.calls[2];
assert.equal(JSON.parse(start.init.body).id, 'generated-fixture-id');
assert.equal(start.init.headers['X-Upload-Content-Type'], 'application/json');
assert.equal(start.init.headers['X-Upload-Content-Length'], String(Buffer.byteLength(largeBytes)));
assert.equal(put.url, sessionUrl);
assert.equal(new TextDecoder().decode(put.init.body), largeBytes);
assert.ok(large.calls.every(c => c.init.signal instanceof AbortSignal && c.init.redirect === 'error'));
assert.ok(!JSON.stringify(largeResult).includes('fixture-session'));
assert.ok(!JSON.stringify(largeResult).includes('private-token'));

for (const put of [201, 500, 'timeout']) {
  const f = resumableFixture({ put });
  assert.equal((await upload({ ...options, content: largeContent }, f)).contentSha256, largeSha256);
  assert.deepEqual(f.calls.map(c => c.method), ['GET', 'POST', 'PUT', 'GET', 'GET']);
}
const boundaryContent = { evidence: 'x'.repeat(5 * 1024 * 1024 - JSON.stringify({ evidence: '' }, null, 2).length) };
const boundaryBytes = JSON.stringify(boundaryContent, null, 2);
assert.equal(Buffer.byteLength(boundaryBytes), 5 * 1024 * 1024);
const boundaryFixture = fixture({ post: 200, media: boundaryBytes });
await upload({ ...options, content: boundaryContent }, boundaryFixture);
assert.deepEqual(boundaryFixture.calls.map(c => c.method), ['GET', 'POST', 'GET', 'GET']);
const unicodeContent = { evidence: `${boundaryContent.evidence.slice(0, -1)}\u00e9` };
const unicodeBytes = JSON.stringify(unicodeContent, null, 2);
assert.equal(unicodeBytes.length, boundaryBytes.length);
assert.equal(Buffer.byteLength(unicodeBytes), Buffer.byteLength(boundaryBytes) + 1);
const unicodeFixture = resumableFixture({ media: unicodeBytes });
assert.equal((await upload({ ...options, content: unicodeContent }, unicodeFixture)).contentSha256, await hashTextSha256(unicodeBytes));
assert.equal(unicodeFixture.calls[1].init.headers['X-Upload-Content-Length'], String(Buffer.byteLength(unicodeBytes)));
for (const change of [{ media: largeBytes.replace('fixture', 'fixturE') }, { meta: { id: 'wrong-id' } },
  { meta: { name: 'wrong.json' } }, { meta: { parents: ['wrong-folder'] } },
  { getStatus: 404 }, { put: 308 }, { put: 401 }, { put: 403 },
  { sessionStatus: 500 }, { sessionStatus: 'timeout' }, { location: null },
  { location: 'https://untrusted.invalid/upload?upload_id=fixture' },
  { location: sessionUrl.replace('https:', 'http:') },
  { location: sessionUrl.replace('www.googleapis.com', 'www.googleapis.com.untrusted.invalid') },
  { location: sessionUrl.replace('www.googleapis.com', 'www.googleapis.com:444') },
  { location: sessionUrl.replace('www.googleapis.com', 'user:password@www.googleapis.com') },
  { location: sessionUrl.replace('/upload/drive/v3/files', '/other') },
  { location: sessionUrl.replace('upload_id=fixture-session', 'upload_id=') },
  { location: `${sessionUrl}&upload_id=other` }, { location: `${sessionUrl}&uploadType=media` },
  { location: `${sessionUrl}#fragment` }]) {
  const f = resumableFixture(change);
  await assert.rejects(upload({ ...options, content: largeContent }, f), e => /^STAGE2_DRIVE_[A-Z0-9_]+$/.test(e.message));
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(f.calls.filter(c => c.method === 'PUT').length <= 1);
  assert.ok(f.calls.length <= 5);
  if ('location' in change || 'sessionStatus' in change) assert.equal(f.calls.length, 2);
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
  for (const method of ['POST', 'PUT']) {
    for (const stall of ['headers', 'body']) {
      const f = resumableFixture(), originalFetch = f.fetchImpl;
      f.fetchImpl = async (url, init) => {
        if (init.method !== method) return originalFetch(url, init);
        f.calls.push({ url, method, init });
        if (stall === 'headers') return new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('private-token', 'AbortError')), { once: true });
        });
        return new Response(new ReadableStream({ start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new DOMException('private-token', 'AbortError')), { once: true });
        } }));
      };
      if (method === 'POST') {
        await assert.rejects(upload({ ...options, content: largeContent }, f), /^Error: STAGE2_DRIVE_PERSISTENCE_UNCONFIRMED$/);
        assert.deepEqual(f.calls.map(c => c.method), ['GET', 'POST']);
      } else {
        assert.equal((await upload({ ...options, content: largeContent }, f)).contentSha256, largeSha256);
        assert.deepEqual(f.calls.map(c => c.method), ['GET', 'POST', 'PUT', 'GET', 'GET']);
      }
    }
  }
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
console.log('PASS Stage2 multipart/resumable size boundary, byte-exact hashing, session URI validation, bounded timeout reconciliation and awaited completion; Drive requests=0');
