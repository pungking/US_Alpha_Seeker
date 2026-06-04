#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPORT_JSON = 'state/analysis-repo-safety-boundary.json';
const REPORT_MD = 'state/analysis-repo-safety-boundary.md';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', '.vercel', 'state', 'docs', 'sidecar-template', 'harvester-template']);
const EXCLUDED_FILES = new Set(['AGENTS.md', 'README.md', 'scripts/check-analysis-repo-safety-boundary.mjs']);
const ALLOWED_WORKFLOW_PREFIXES = ['.github/workflows/sidecar-', '.github/workflows/reusable-control-'];
const SCAN_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.yml', '.yaml', '.sh']);
const FORBIDDEN = [
  { id: 'alpaca_paper_base_url', pattern: /paper-api\.alpaca\.markets/i, severity: 'block' },
  { id: 'broker_order_post_endpoint', pattern: /POST\s+\/v2\/orders|\/v2\/orders[^\n]*(method\s*[:=]\s*["']POST["'])/i, severity: 'block' },
  { id: 'persistent_oco_submit_enabled', pattern: /PERSISTENT_OCO_REPAIR_SUBMIT_ENABLED/i, severity: 'block' },
  { id: 'confirm_live_execution_in_code', pattern: /CONFIRM LIVE EXECUTION/i, severity: 'warn' },
  { id: 'unsafe_exec_enabled_default', pattern: /EXEC_ENABLED\s*[:=]\s*["']?true["']?/i, severity: 'block' },
  { id: 'unsafe_read_only_default', pattern: /READ_ONLY\s*[:=]\s*["']?false["']?/i, severity: 'block' },
  { id: 'unsafe_force_send_once_default', pattern: /FORCE_SEND_ONCE\s*[:=]\s*["']?true["']?/i, severity: 'block' }
];

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function ensureDir(file) { fs.mkdirSync(path.dirname(path.resolve(ROOT, file)), { recursive: true }); }
function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.github') continue;
    const full = path.join(dir, ent.name);
    const relative = rel(full);
    if (ent.isDirectory()) {
      if (EXCLUDED_DIRS.has(ent.name)) continue;
      out.push(...walk(full));
      continue;
    }
    if (!ent.isFile()) continue;
    if (EXCLUDED_FILES.has(relative) || EXCLUDED_FILES.has(ent.name)) continue;
    if (!SCAN_EXT.has(path.extname(ent.name))) continue;
    if (ALLOWED_WORKFLOW_PREFIXES.some((prefix) => relative.startsWith(prefix))) continue;
    out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(ROOT)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of FORBIDDEN) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const before = text.slice(0, match.index ?? 0);
    const line = before.split('\n').length;
    findings.push({ file: rel(file), line, rule: rule.id, severity: rule.severity, sample: String(match[0]).slice(0, 120) });
  }
}
const blocked = findings.filter((f) => f.severity === 'block');
const report = {
  generatedAt: new Date().toISOString(),
  overall: blocked.length ? 'fail' : 'pass',
  scannedFiles: walk(ROOT).length,
  findings,
  boundary: 'US_Alpha_Seeker must not contain broker mutation code; execution belongs in alpha-exec-engine.'
};
ensureDir(REPORT_JSON);
fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);
const lines = ['# Analysis Repo Safety Boundary', '', `- overall: **${report.overall}**`, `- scannedFiles: ${report.scannedFiles}`, `- findings: ${findings.length}`, '', '| Severity | Rule | File | Line | Sample |', '| --- | --- | --- | ---: | --- |'];
for (const f of findings) lines.push(`| ${f.severity} | ${f.rule} | ${f.file} | ${f.line} | ${String(f.sample).replace(/\|/g, '\\|')} |`);
if (!findings.length) lines.push('| PASS | none | N/A | 0 | analysis repo boundary clean |');
fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`);
console.log(`[ANALYSIS_BOUNDARY] overall=${report.overall} findings=${findings.length} json=${REPORT_JSON}`);
if (blocked.length) process.exit(1);
