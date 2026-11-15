// STEP #AS-INTEGRATION-21: offline Stage6 dispatch sourceRun provenance contract.
// Does not invoke any workflow, network request, provider, Drive or Sidecar.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('components/AlphaAnalysis.tsx', 'utf8');
const runner = fs.readFileSync('automate.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/schedule.yml', 'utf8');
const ast = ts.createSourceFile('AlphaAnalysis.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const assignments = [];
const visit = node => {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.left.getText(ast).includes('__STAGE6_DISPATCH_INFO') &&
      ts.isObjectLiteralExpression(node.right)) {
    assignments.push(node.right);
  }
  ts.forEachChild(node, visit);
};
visit(ast);
assert.equal(assignments.length, 1, 'one Stage6 dispatch evidence payload');
const fields = new Map(assignments[0].properties
  .filter(ts.isPropertyAssignment)
  .map(prop => [prop.name.getText(ast), prop.initializer.getText(ast)]));
assert.ok(fields.has('sourceRunId'));
assert.ok(fields.has('sourceSha'));
assert.ok(fields.has('buildSource'));
assert.equal(fields.get('sourceRunId'), "stage6BuildSourceAudit.runId || ''",
  'dispatch provenance must be the GitHub run ID, not the local Stage6 timestamp');
assert.equal(fields.get('sourceSha'), 'stage6BuildSourceAudit.sha',
  'run provenance must remain paired with source commit SHA');
const compute = new Function('stage6BuildSourceAudit', 'stage6FinalRunIdRef', 'getKstTimestamp',
  `return (${fields.get('sourceRunId')});`);
for (const [runId, expected] of [['43470901390', '43470901390'], [null, ''], ['', '']]) {
  assert.equal(compute({ runId }, { current: '2026-11-14_02-48-33' }, () => '2026-11-14_02-48-35'), expected);
}
assert.match(source, /runId: normalizeOptionalText\(readStage6RuntimeEnv\('VITE_BUILD_SOURCE_RUN_ID'/,
  'build source must record the GitHub run ID');
assert.match(source, /sourceRunId: stage6BuildSourceAudit\.runId,/,
  'Stage6 original manifest must preserve GitHub run identity');
assert.match(runner, /sourceRunId: String\(info\.sourceRunId \|\| ''\)/,
  'automation export must copy unchanged sourceRunId');
assert.match(workflow, /sourceRunId: String\(parsed\?\.sourceRunId \|\| fallback\.sourceRunId\)/,
  'workflow uses exported ID, or GitHub Run ID when absent');
assert.match(workflow, /sourceRunId: process\.env\.GITHUB_RUN_ID \|\| ""/,
  'no source ID must fall back to authenticated job environment, not timestamp');
assert.match(workflow, /sourceRunId: process\.env\.SOURCE_RUN_ID \|\| process\.env\.GITHUB_RUN_ID \|\| ""/,
  'cross-repository payload must preserve the ID');
console.log('[STAGE6_SOURCE_RUN_PROVENANCE] PASS (GitHub run ID, absent-ID fallback, SHA binding and unchanged dispatch contract; requests=0)');
