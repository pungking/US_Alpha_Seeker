#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const OUT_JSON = 'state/tsc-debt-report.json';
const OUT_MD = 'state/tsc-debt-report.md';
const res = spawnSync('./node_modules/.bin/tsc', ['--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
const output = `${res.stdout || ''}${res.stderr || ''}`;
const lines = output.split('\n').filter(Boolean);
const rows = lines.map((line) => {
  const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/);
  return m ? { file: m[1], line: Number(m[2]), col: Number(m[3]), code: m[4], message: m[5] } : { file: 'unknown', line: null, col: null, code: 'UNKNOWN', message: line };
});
const categoryOf = (r) => {
  if (r.message.includes("ImportMeta") || r.message.includes("env")) return 'import_meta_env_typing';
  if (r.file.includes('sidecar-template/')) return 'sidecar_template_in_analysis_tsc_scope';
  if (r.message.includes("does not exist on type 'unknown'")) return 'unknown_object_typing';
  if (r.file.includes('UniverseGathering')) return 'stage0_master_ticker_contract';
  if (r.file.includes('intelligenceService')) return 'ai_provider_union_typing';
  if (r.file.includes('AlphaAnalysis')) return 'alpha_analysis_structural_typing';
  return 'other';
};
const counts = {};
for (const r of rows) counts[categoryOf(r)] = (counts[categoryOf(r)] || 0) + 1;
const report = { generatedAt: new Date().toISOString(), tscExitCode: res.status, totalErrors: rows.length, categoryCounts: counts, rows };
fs.mkdirSync('state', { recursive: true });
fs.writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
const md = ['# TypeScript Debt Report', '', `- tscExitCode: ${res.status}`, `- totalErrors: ${rows.length}`, '', '## Category Counts', '', '| Category | Count |', '| --- | ---: |', ...Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`| ${k} | ${v} |`), '', '## First 40 Errors', '', '| File | Line | Code | Category | Message |', '| --- | ---: | --- | --- | --- |', ...rows.slice(0,40).map((r)=>`| ${r.file} | ${r.line ?? ''} | ${r.code} | ${categoryOf(r)} | ${String(r.message).replace(/\|/g,'\\|')} |`)];
fs.writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(`[TSC_DEBT] errors=${rows.length} categories=${Object.keys(counts).length} json=${OUT_JSON}`);
