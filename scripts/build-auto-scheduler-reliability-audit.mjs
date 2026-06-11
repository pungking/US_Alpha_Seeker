#!/usr/bin/env node
import fs from 'node:fs';
const OUT_JSON='state/auto-scheduler-reliability-audit.json';
const OUT_MD='state/auto-scheduler-reliability-audit.md';
const files=['.github/workflows/schedule.yml','.github/workflows/auto-scheduler-watchdog.yml','.github/workflows/auto-scheduler-deadline-guard.yml'];
const checks=[];
for (const file of files) {
  const exists=fs.existsSync(file); const text=exists?fs.readFileSync(file,'utf8'):'';
  checks.push({id:`${file}:present`,status:exists?'PASS':'FAIL',detail:exists?'workflow present':'missing workflow'});
  if (exists) checks.push({id:`${file}:manual_dispatch`,status:/workflow_dispatch:/.test(text)?'PASS':'WARN',detail:'manual rerun path'});
  if (file.endsWith('schedule.yml') && exists) checks.push({id:'schedule:cron',status:/cron:/.test(text)?'PASS':'FAIL',detail:'cron trigger exists'});
  if (exists) checks.push({id:`${file}:artifact_or_summary`,status:/upload-artifact|GITHUB_STEP_SUMMARY|artifact/i.test(text)?'PASS':'WARN',detail:'failure evidence path'});
}
const alphaFile='components/AlphaAnalysis.tsx';
const autoText=fs.existsSync(alphaFile)?fs.readFileSync(alphaFile,'utf8'):'';
const autoMismatchPattern=/code:\s*['"]TELEGRAM_CONTRACT_MISMATCH['"][\s\S]{0,800}?telegram_transmission_suppressed_stage6_dispatch_allowed/;
checks.push({
  id:'auto:telegram_contract_mismatch_non_blocking',
  status:autoMismatchPattern.test(autoText)?'PASS':'FAIL',
  detail:'TELEGRAM_CONTRACT_MISMATCH suppresses Telegram only and leaves Stage6 dispatch allowed'
});
const mismatchThrowPattern=/throw new Error\([^;\n]*(TELEGRAM_CONTRACT_MISMATCH|CONTRACT_MISMATCH)[^;\n]*\)/;
checks.push({
  id:'auto:telegram_contract_mismatch_no_throw',
  status:mismatchThrowPattern.test(autoText)?'FAIL':'PASS',
  detail:'contract mismatch must not throw from Auto-Scheduler path'
});
checks.push({
  id:'auto:telegram_integrity_failure_archived',
  status:/archiveTelegramIntegrityFailure\(\s*['"]AUTO['"][\s\S]{0,900}?TELEGRAM_CONTRACT_MISMATCH/.test(autoText)?'PASS':'WARN',
  detail:'non-blocking contract mismatch still leaves Drive/audit evidence'
});
const fail=checks.filter(c=>c.status==='FAIL').length;
const warn=checks.filter(c=>c.status==='WARN').length;
const report={generatedAt:new Date().toISOString(),overall:fail?'fail':warn?'warn':'pass',checks};
fs.mkdirSync('state',{recursive:true});
fs.writeFileSync(OUT_JSON,`${JSON.stringify(report,null,2)}\n`);
const md=['# Auto-Scheduler Reliability Audit','',`- overall: **${report.overall}**`,'','| Check | Status | Detail |','| --- | --- | --- |',...checks.map(c=>`| ${c.id} | ${c.status} | ${c.detail} |`)];
fs.writeFileSync(OUT_MD,`${md.join('\n')}\n`);
console.log(`[AUTO_SCHED_AUDIT] overall=${report.overall} checks=${checks.length} json=${OUT_JSON}`);
if(fail) process.exit(1);
