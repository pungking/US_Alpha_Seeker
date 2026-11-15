// STEP #AS-INTEGRATION-17 — exact Stage6 producer SHA-256 / Sidecar handoff.
// Offline-only. Does not access Drive, dispatch, providers, state or broker.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createHash, webcrypto } from 'node:crypto';

const source = fs.readFileSync('components/AlphaAnalysis.tsx', 'utf8');
const ast = ts.createSourceFile('AlphaAnalysis.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let definition = null;
const visit = node => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === 'sha256Hex' && node.initializer) {
    assert.equal(definition, null, 'one Stage6 SHA-256 implementation');
    definition = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
};
visit(ast);
assert.ok(definition, 'actual Stage6 SHA-256 implementation must exist');
const compiled = ts.transpileModule(`return (${definition});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 }
}).outputText;
const makeHash = crypto => new Function('globalThis', 'TextEncoder', compiled)({ crypto }, TextEncoder);

const sha256 = makeHash({ subtle: webcrypto.subtle });
for (const payload of ['', '{}', '{"symbol":"AAPL"}', '{"symbol":"가나다/µ","value":9}']) {
  const expected = createHash('sha256').update(payload, 'utf8').digest('hex');
  const actual = await sha256(payload);
  assert.equal(actual, expected, 'producer and Node Sidecar SHA-256 must agree on UTF8 bytes');
  assert.match(actual, /^[a-f0-9]{64}$/, 'Sidecar requires exact 64-hex digest');
}
for (const runtime of [{}, { subtle: null }, { subtle: {} }]) {
  const unavailable = makeHash(runtime);
  await assert.rejects(unavailable('payload'), { message: 'STAGE6_SHA256_UNAVAILABLE' });
}
const faulty = makeHash({ subtle: { digest: async () => { throw new Error('HASH_DIGEST_FAILURE'); } } });
await assert.rejects(faulty('payload'), { message: 'HASH_DIGEST_FAILURE' });
assert.doesNotMatch(String(definition), /fnv1aHash|fnv1a32_fallback/, 'Stage6 digest may not fall back to a non-SHA hash');
assert.match(source, /const stage6HashAlgo = 'sha256';/);
assert.match(source, /const stage6FinalHash = await sha256Hex\(finalPayloadJson\);\s*await uploadFile\(/,
  'must compute a valid digest before Stage6 persistence');
assert.doesNotMatch(source, /const stage6HashAlgo = [^;]*fnv1a32_fallback/);
console.log('[STAGE6_SHA256_HANDOFF] PASS (native SHA-256 parity, crypto-missing fail-closed, pre-upload gate; requests=0)');
