#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_JSON = 'state/client-secret-exposure-audit.json';
const OUT_MD = 'state/client-secret-exposure-audit.md';

const SECRETISH_VITE_NAMES = [
  'VITE_GEMINI_API_KEY',
  'VITE_API_KEY',
  'VITE_PERPLEXITY_API_KEY',
  'VITE_HUGGINGFACE_API_KEY',
  'VITE_RAPID_API_KEY',
  'VITE_POLYGON_API_KEY',
  'VITE_ALPACA_KEY',
  'VITE_ALPACA_SECRET',
  'VITE_ALPACA_SECRET_KEY',
  'VITE_FINNHUB_KEY',
  'VITE_FMP_KEY',
  'VITE_TWELVE_DATA_KEY',
  'VITE_ALPHA_VANTAGE_KEY',
  'VITE_GDRIVE_API_KEY',
  'VITE_GITHUB_TOKEN',
  'VITE_GITHUB_PAT',
  'VITE_GH_PAT',
  'VITE_SIDECAR_DISPATCH_TOKEN',
  'VITE_TELEGRAM_TOKEN',
  'VITE_TELEGRAM_WEBHOOK_SECRET',
  'VITE_TELEGRAM_ADMIN_CHAT_ID',
  'VITE_TELEGRAM_CHAT_ID',
  'VITE_TELEGRAM_SIMULATION_CHAT_ID',
  'VITE_TELEGRAM_ALERT_CHAT_ID'
];

function walkFiles(dir, predicate) {
  const full = path.resolve(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  const out = [];
  for (const name of fs.readdirSync(full)) {
    const child = path.join(full, name);
    const rel = path.relative(ROOT, child);
    const stat = fs.statSync(child);
    if (stat.isDirectory()) out.push(...walkFiles(rel, predicate));
    else if (predicate(rel)) out.push(rel);
  }
  return out.sort();
}

const files = [
  ...walkFiles('.github/workflows', (file) => /\.ya?ml$/i.test(file)),
  '.env.vercel.example',
  'vite.config.ts',
  'constants.ts',
  'components/UniverseGathering.tsx',
  'components/MarketTicker.tsx',
  'services/telegramService.ts',
  'sidecar-template/alpha-exec-engine/.github/workflows/dry-run.yml',
  'sidecar-template/alpha-exec-engine/.github/workflows/payload-probe-isolated.yml',
  'sidecar-template/alpha-exec-engine/scripts/build-fillability-report.mjs',
  'sidecar-template/alpha-exec-engine/src/index.ts'
];

function read(file) {
  const full = path.resolve(ROOT, file);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : '';
}

function loadDotEnv(file) {
  const full = path.resolve(ROOT, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

const findings = [];
const seen = new Set();
function addFinding(severity, id, file, line, detail) {
  const key = `${severity}|${id}|${file}|${line}|${detail}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ severity, id, file, line, detail });
}

for (const file of files) {
  const text = read(file);
  if (!text) continue;
  const lines = text.split(/\r?\n/);
  for (const name of SECRETISH_VITE_NAMES) {
    let idx = text.indexOf(name);
    while (idx !== -1) {
      const line = lineOf(text, idx);
      const context = lines[line - 1] || '';
      if (file.startsWith('.github/workflows/') || file === '.env.vercel.example' || file === 'vite.config.ts') {
        addFinding(
          'fail',
          'client_static_secret_exposure',
          file,
          line,
          `${name} appears in a build/workflow context: ${context.trim()}`
        );
      } else {
        addFinding(
          'warn',
          'client_secret_fallback_reference',
          file,
          line,
          `${name} is referenced by client code; migrate to runtime env or server proxy: ${context.trim()}`
        );
      }
      idx = text.indexOf(name, idx + name.length);
    }
  }
}

const viteConfig = read('vite.config.ts');
const envPrefixIndex = viteConfig.indexOf('envPrefix');
if (envPrefixIndex === -1) {
  addFinding('fail', 'vite_env_prefix_missing', 'vite.config.ts', 1, 'Vite must not use the default VITE_ env exposure prefix for secret-bearing builds.');
}
if (/envPrefix\s*:[\s\S]{0,500}['"]VITE_['"]/.test(viteConfig)) {
  addFinding('fail', 'vite_env_prefix_too_broad', 'vite.config.ts', lineOf(viteConfig, envPrefixIndex), 'envPrefix must not include generic VITE_; use only narrow public prefixes.');
}

const forbiddenDefine = /process\.env\.(?:GEMINI_API_KEY|API_KEY|PERPLEXITY_API_KEY|TELEGRAM_TOKEN|GITHUB_TOKEN|SIDECAR_DISPATCH_TOKEN|RAPID_API_KEY|POLYGON_API_KEY|ALPACA_KEY|FINNHUB_KEY|FMP_KEY|GDRIVE_API_KEY)/g;
let match;
while ((match = forbiddenDefine.exec(viteConfig))) {
  addFinding('fail', 'vite_define_secret_inline', 'vite.config.ts', lineOf(viteConfig, match.index), `${match[0]} must not be inlined into the client bundle`);
}

const distRoot = path.resolve(ROOT, 'dist');
const envValues = { ...loadDotEnv('.env'), ...loadDotEnv('.env.local') };
const secretEnvEntries = Object.entries(envValues)
  .filter(([name, value]) => SECRETISH_VITE_NAMES.includes(name) && typeof value === 'string' && value.length >= 8);
if (fs.existsSync(distRoot) && secretEnvEntries.length > 0) {
  const distFiles = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(js|html|css|json|map)$/.test(name)) distFiles.push(full);
    }
  };
  walk(distRoot);
  for (const [envName, secretValue] of secretEnvEntries) {
    for (const file of distFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(secretValue)) {
        addFinding(
          'fail',
          'dist_contains_vite_secret_value',
          path.relative(ROOT, file),
          1,
          `${envName} value is present in built client output; value redacted.`
        );
      }
    }
  }
}

const failCount = findings.filter((f) => f.severity === 'fail').length;
const warnCount = findings.filter((f) => f.severity === 'warn').length;
const report = {
  generatedAt: new Date().toISOString(),
  overall: failCount === 0 ? 'pass' : 'fail',
  failCount,
  warnCount,
  policy: {
    staticBundleRule: 'No API keys/tokens may be injected through Vite define, broad VITE_ envPrefix, or VITE_* workflow env for Auto-Scheduler builds.',
    runtimeRule: 'Headless Auto-Scheduler may inject required runtime env into the browser session; long-term production hardening should move paid/vendor calls behind server-side API routes.',
    distScanRule: 'If local .env contains VITE_* secrets, built dist output must not contain their exact values.'
  },
  findings
};

fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT_JSON)), { recursive: true });
fs.writeFileSync(path.resolve(ROOT, OUT_JSON), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const md = [
  '# Client Secret Exposure Audit',
  '',
  `- GeneratedAt: ${report.generatedAt}`,
  `- Overall: ${report.overall}`,
  `- Fail: ${failCount}`,
  `- Warn: ${warnCount}`,
  '',
  '## Policy',
  '',
  `- ${report.policy.staticBundleRule}`,
  `- ${report.policy.runtimeRule}`,
  `- ${report.policy.distScanRule}`,
  '',
  '## Findings',
  '',
  '| Severity | ID | File | Line | Detail |',
  '| --- | --- | --- | ---: | --- |',
  ...findings.map((f) => `| ${f.severity} | ${f.id} | ${f.file} | ${f.line} | ${String(f.detail).replace(/\|/g, '\\|')} |`),
  ''
];
fs.writeFileSync(path.resolve(ROOT, OUT_MD), `${md.join('\n')}\n`, 'utf8');
console.log(`[CLIENT_SECRET_EXPOSURE_AUDIT] overall=${report.overall} fail=${failCount} warn=${warnCount} json=${OUT_JSON}`);
if (failCount > 0) process.exit(1);
