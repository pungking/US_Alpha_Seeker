#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const DIR='state/stage6-audit-source';
const OUT_JSON='state/stage6-quality-trend-audit.json';
const OUT_MD='state/stage6-quality-trend-audit.md';
const files=fs.existsSync(DIR)?fs.readdirSync(DIR).filter(f=>/^STAGE6_ALPHA_FINAL_.*\.json$/.test(f)).sort():[];
const pickRows=(j)=>Array.isArray(j.alpha_candidates)?j.alpha_candidates:Array.isArray(j.candidates)?j.candidates:Array.isArray(j.data)?j.data:[];
const runs=[];
for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8')); const rows=pickRows(j); const reasonCounts={}; let exec=0, wait=0, blocked=0; for(const r of rows){const d=String(r.finalDecision||'UNKNOWN').toUpperCase(); const reason=String(r.decisionReason||r.executionReason||'unknown').toLowerCase(); reasonCounts[reason]=(reasonCounts[reason]||0)+1; if(d==='EXECUTABLE_NOW')exec++; else if(d==='WAIT_PRICE')wait++; else if(d.startsWith('BLOCKED'))blocked++;} runs.push({file:f,rows:rows.length,exec,wait,blocked,reasonCounts});}
const latest=runs.at(-1)||null; const recent=runs.slice(-10); const aggregate={}; for(const run of recent) for(const [k,v] of Object.entries(run.reasonCounts)) aggregate[k]=(aggregate[k]||0)+v;
const zeroExecutableRecent=recent.filter(r=>r.exec===0).length;
const report={generatedAt:new Date().toISOString(),files:runs.length,latest,zeroExecutableRecent,aggregateRecentReasons:aggregate,runs};
fs.mkdirSync('state',{recursive:true}); fs.writeFileSync(OUT_JSON,`${JSON.stringify(report,null,2)}\n`);
const top=Object.entries(aggregate).sort((a,b)=>b[1]-a[1]).slice(0,12);
const md=['# Stage6 Quality Trend Audit','',`- files: ${runs.length}`,`- latest: ${latest?.file||'N/A'}`,`- latestExec: ${latest?.exec??'N/A'}`,`- zeroExecutableRecent: ${zeroExecutableRecent}/10`,'','## Recent Reason Counts','','| Reason | Count |','| --- | ---: |',...top.map(([k,v])=>`| ${k} | ${v} |`),'','## Recent Runs','','| File | Rows | Exec | Wait | Blocked | Top Reasons |','| --- | ---: | ---: | ---: | ---: | --- |',...recent.map(r=>`| ${r.file} | ${r.rows} | ${r.exec} | ${r.wait} | ${r.blocked} | ${Object.entries(r.reasonCounts).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,v])=>`${k}:${v}`).join(', ')} |`)];
fs.writeFileSync(OUT_MD,`${md.join('\n')}\n`);
console.log(`[STAGE6_QUALITY_TREND] files=${runs.length} latest=${latest?.file||'none'} zeroRecent=${zeroExecutableRecent}/10 json=${OUT_JSON}`);
