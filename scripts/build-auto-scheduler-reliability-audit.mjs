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
  if (exists) checks.push({
    id:`${file}:freshness_aware_duplicate_gate`,
    status:/DUPLICATE_FRESHNESS_MIN/.test(text)&&/fresh_since_iso|freshSince/.test(text)&&/fresh_same_market_day_run_exists|missing_or_stale_dispatch_recovery|skip_fresh_existing_run/.test(text)?'PASS':'FAIL',
    detail:'duplicate suppression must use freshness window, not only same-market-day success'
  });
  if (file.endsWith('schedule.yml') && exists) checks.push({id:'schedule:cron',status:/cron:/.test(text)?'PASS':'FAIL',detail:'cron trigger exists'});
  if (file.endsWith('schedule.yml') && exists) checks.push({
    id:'schedule:rth_catchup_slots',
    status:/37 13 \* \* 1-5/.test(text)&&/57 13 \* \* 1-5/.test(text)&&/17 14 \* \* 1-5/.test(text)?'PASS':'FAIL',
    detail:'canonical Auto-Scheduler has RTH catch-up slots guarded by freshness-aware gate'
  });
  if (file.endsWith('auto-scheduler-deadline-guard.yml') && exists) checks.push({
    id:'deadline_guard:rth_catchup_slots',
    status:/35 13 \* \* 1-5/.test(text)&&/45 13 \* \* 1-5/.test(text)&&/55 13 \* \* 1-5/.test(text)&&/20 14 \* \* 1-5/.test(text)?'PASS':'FAIL',
    detail:'deadline guard has redundant RTH dispatch checks when canonical run is missing or stale'
  });
  if (file.endsWith('auto-scheduler-watchdog.yml') && exists) checks.push({
    id:'watchdog:rth_catchup_slots',
    status:/37 13 \* \* 1-5/.test(text)&&/57 13 \* \* 1-5/.test(text)&&/17 14 \* \* 1-5/.test(text)?'PASS':'FAIL',
    detail:'watchdog has RTH recovery slots; target workflow gate prevents duplicate analysis'
  });
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
