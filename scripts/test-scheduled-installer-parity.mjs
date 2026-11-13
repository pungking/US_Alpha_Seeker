// Issue #68: compare installer resolution without invoking app scripts or providers.
// The bootstrap may contact npm's public package registry; all subsequent parity
// installs are strictly npm --offline and run in disposable temporary directories.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const baselineManifest = fs.readFileSync(path.join(repositoryRoot, 'package.json'));
const baselineLock = fs.readFileSync(path.join(repositoryRoot, 'package-lock.json'));
const manifest = JSON.parse(baselineManifest.toString('utf8'));
const lock = JSON.parse(baselineLock.toString('utf8'));
const schedule = fs.readFileSync(path.join(repositoryRoot, '.github/workflows/schedule.yml'), 'utf8');
const scheduledInstall = schedule.match(/      - name: 3\. 의존성 패키지 설치\n(?:[^\n]*\n){0,5}/);
assert.ok(scheduledInstall, 'scheduled installer step missing');
assert.match(scheduledInstall[0], /^\s*run: npm ci\s*$/m,
  'proposed scheduled installer must use npm ci after Issue #68 evidence');
assert.equal(lock.lockfileVersion, 3);
for (const scope of ['dependencies', 'devDependencies']) {
  assert.deepEqual(lock.packages[''][scope], Object.fromEntries(
    Object.entries(manifest[scope] ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  ), 'manifest and lock root must agree: ' + scope);
}
const majorMinor = process.versions.node.split('.').slice(0, 2).map(Number);
assert.ok(majorMinor[0] > 22 || (majorMinor[0] === 22 && majorMinor[1] >= 12),
  'Node >=22.12 required by Puppeteer');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-npm-parity-'));
const env = {
  PATH: process.env.PATH ?? '',
  HOME: process.env.HOME ?? tempRoot,
  TMPDIR: process.env.TMPDIR ?? os.tmpdir(),
  TMP: process.env.TMP ?? os.tmpdir(),
  TEMP: process.env.TEMP ?? os.tmpdir(),
  npm_config_cache: path.join(tempRoot, 'npm-cache'),
  npm_config_update_notifier: 'false',
  PUPPETEER_SKIP_DOWNLOAD: 'true',
  CI: 'true',
};
if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
function digest(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
const expectedDigest = digest(baselineLock);
function fixture(name, packageJson = baselineManifest) {
  const dir = path.join(tempRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), packageJson);
  fs.writeFileSync(path.join(dir, 'package-lock.json'), baselineLock);
  return dir;
}
function run(cwd, label, args, expectedSuccess = true) {
  const proc = spawnSync('npm', args, {
    cwd, env, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(proc.error, undefined, label + ': failed to start npm');
  if (expectedSuccess) {
    assert.equal(proc.status, 0, label + ' failed: ' + (proc.stderr ?? '').slice(-1300));
  } else {
    assert.notEqual(proc.status, 0, label + ' was expected to reject manifest/lock mismatch');
  }
  return proc;
}
function lockHash(dir) {
  return digest(fs.readFileSync(path.join(dir, 'package-lock.json')));
}
function tree(dir) {
  const output = run(dir, 'npm ls dependency graph', ['ls', '--all', '--json', '--offline']);
  const root = JSON.parse(output.stdout);
  const rows = [];
  function visit(node, parent) {
    for (const [name, value] of Object.entries(node.dependencies ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const key = parent + '/' + name;
      rows.push([key, value.version ?? null, Boolean(value.invalid), Boolean(value.missing)]);
      visit(value, key);
    }
  }
  visit(root, '');
  return rows;
}
try {
  const version = run(repositoryRoot, 'npm version', ['--version']).stdout.trim();
  const seed = fixture('registry-bootstrap');
  // Registry-only cache seeding, with ALL package lifecycle scripts disabled.
  run(seed, 'npm ci registry cache bootstrap',
    ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(lockHash(seed), expectedDigest, 'bootstrap npm ci changed the committed lock');

  const ci = fixture('strict-ci');
  const install = fixture('scheduled-install');
  run(ci, 'offline npm ci',
    ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  run(install, 'offline npm install',
    ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(lockHash(ci), expectedDigest, 'npm ci modified the lock');
  assert.equal(lockHash(install), expectedDigest, 'npm install unexpectedly modified the lock');
  const ciGraph = tree(ci);
  const installGraph = tree(install);
  assert.ok(ciGraph.length > 0, 'empty dependency graph');
  assert.deepEqual(installGraph, ciGraph, 'installed dependency graph differs');

  const negativeManifest = structuredClone(manifest);
  assert.ok(negativeManifest.dependencies?.puppeteer, 'Puppeteer dependency missing');
  negativeManifest.dependencies.puppeteer = '0.0.0';
  const mismatch = fixture('manifest-lock-mismatch', JSON.stringify(negativeManifest, null, 2) + '\n');
  run(mismatch, 'negative: npm ci rejects incompatible lock',
    ['ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'], false);
  assert.equal(lockHash(mismatch), expectedDigest, 'negative npm ci changed the lock');

  console.log(JSON.stringify({
    check: 'SCHEDULED_NPM_INSTALLER_PARITY',
    status: 'PASS',
    platform: process.platform,
    node: process.versions.node,
    npm: version,
    packageLockSha256: expectedDigest,
    dependencyGraphNodes: ciGraph.length,
    strictCiLockUnchanged: true,
    legacyInstallLockUnchanged: true,
    offlineInstalledGraphsEqual: true,
    mismatchedManifestRejectedByCi: true,
    npmPackageLifecycleScriptsExecuted: false,
    npmRegistryBootstrapUsed: true,
    parityCommandsOffline: true,
    realScheduledAnalysisExecuted: false,
    providerOrBrokerCallsExecuted: false,
    scope: 'install resolution only; not real provider integration or lifecycle-script equivalence',
  }));
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
