// Offline source-contract audit for the scheduled analysis Node/Puppeteer environment.
// Never starts the analysis workflow, contacts a provider, or reads credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow = fs.readFileSync(new URL('../.github/workflows/schedule.yml', import.meta.url), 'utf8');
const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function versionTuple(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
  assert.ok(match, 'version must be an exact semantic version');
  return match.slice(1).map(Number);
}

function atLeast(actual, minimum) {
  const a = versionTuple(actual);
  const b = versionTuple(minimum);
  return a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] >= b[2])));
}

function scheduledNodeMajor(source) {
  const match = /^  alpha-mining:\s*$/m.exec(source);
  assert.ok(match, 'alpha-mining job is required');
  const remainder = source.slice(match.index + match[0].length);
  const nextJob = /^  [\w-]+:\s*$/m.exec(remainder);
  const job = nextJob ? remainder.slice(0, nextJob.index) : remainder;
  const setup = /^      - name: 2\. Node\.js 환경 설정\s*\n\s+uses: actions\/setup-node@v\d+\s*\n\s+with:\s*\n\s+node-version: ['"]?(\d+)['"]?/m.exec(job);
  assert.ok(setup, 'alpha-mining setup-node configuration missing or dynamic');
  return Number(setup[1]);
}

function minimumNodeFromEngine(engine) {
  const match = /^>=(\d+\.\d+\.\d+)$/.exec(String(engine));
  assert.ok(match, 'Puppeteer core Node engine constraint unsupported or absent');
  return match[1];
}

function checkNodeContract(source, core = lock.packages['node_modules/puppeteer-core']) {
  assert.ok(core, 'locked Puppeteer core missing');
  const minimum = minimumNodeFromEngine(core.engines?.node);
  const major = scheduledNodeMajor(source);
  const requiredMajor = versionTuple(minimum)[0];
  assert.ok(major >= requiredMajor, `scheduled Node ${major} violates Puppeteer >=${minimum}`);
  assert.ok(atLeast(process.versions.node, minimum), `CI Node ${process.versions.node} violates Puppeteer >=${minimum}`);
  return { scheduledNodeMajor: major, minimumNode: minimum, validationNode: process.versions.node };
}

function checkWsContract({ lockfile = lock, packageJson = manifest } = {}) {
  const dependency = lockfile.packages['node_modules/puppeteer-core']?.dependencies?.ws;
  const match = /^\^(\d+\.\d+\.\d+)$/.exec(String(dependency));
  assert.ok(match, 'Puppeteer ws minimum is unknown');
  const minimum = match[1];
  const pinned = packageJson.overrides?.['ws@^8.0.0'];
  const installed = lockfile.packages['node_modules/ws']?.version;
  assert.equal(typeof pinned, 'string', 'existing ws override must be explicit');
  assert.equal(installed, pinned, 'ws lock and override must match');
  const compatible = atLeast(pinned, minimum) && versionTuple(pinned)[0] === versionTuple(minimum)[0];
  if (!compatible) {
    // Known, separately tracked pre-existing discrepancy. Do not silently declare PASS.
    assert.equal(pinned, '8.21.0', 'new/different ws incompatibility requires a failing review');
    assert.equal(installed, '8.21.0');
  }
  return { status: compatible ? 'WS_REQUIREMENT_SATISFIED' : 'KNOWN_WS_OVERRIDE_HOLD', installed, required: dependency };
}

const node = checkNodeContract(workflow);
const ws = checkWsContract();

// Negative regressions must fail if the scheduled job is downgraded or its Node setting disappears.
for (const downgraded of ['20', '21']) {
  const changed = workflow.replace(
    /(- name: 2\. Node\.js 환경 설정\s*\n\s+uses: actions\/setup-node@v\d+\s*\n\s+with:\s*\n\s+node-version: )['"]?22['"]?/,
    `$1'${downgraded}'`,
  );
  assert.notEqual(changed, workflow, 'fixture must actually change the target Node');
  assert.throws(() => checkNodeContract(changed), /violates Puppeteer/);
}
assert.throws(() => checkNodeContract(workflow.replace('  alpha-mining:', '  disabled-alpha-mining:')), /alpha-mining job is required/);
const unsafeManifest = structuredClone(manifest);
unsafeManifest.overrides['ws@^8.0.0'] = '8.20.0';
assert.throws(() => checkWsContract({ packageJson: unsafeManifest }), /lock and override must match/);
const patchedManifest = structuredClone(manifest);
const patchedLock = structuredClone(lock);
const minimumWs = /^\^(\d+\.\d+\.\d+)$/.exec(lock.packages['node_modules/puppeteer-core'].dependencies.ws)?.[1];
assert.ok(minimumWs);
patchedManifest.overrides['ws@^8.0.0'] = minimumWs;
patchedLock.packages['node_modules/ws'].version = minimumWs;
assert.equal(checkWsContract({ lockfile: patchedLock, packageJson: patchedManifest }).status, 'WS_REQUIREMENT_SATISFIED');

console.log(JSON.stringify({
  check: 'OFFLINE_SCHEDULED_PUPPETEER_RUNTIME_CONTRACT',
  node: { status: 'NODE_ENGINE_COMPAT_PASS', ...node },
  ws,
  tests: 'NODE_DOWNGRADE_AND_WS_DRIFT_REJECTED',
  externalRequests: 0,
  liveAnalysisRuns: 0,
  operationalAuthority: false,
  note: ws.status === 'KNOWN_WS_OVERRIDE_HOLD' ? 'Node fix can be reviewed; existing ws requirement remains HOLD (Issue #61)' : 'Node and ws static constraints satisfied',
}));
