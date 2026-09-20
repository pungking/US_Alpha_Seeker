import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

// Scheduler deduplication only: this does not authorize trading or certify a market holiday.
export function blocksAutomaticAnalysis({ jobs, marketDate, freshSince, now }) {
  const pipelines = (Array.isArray(jobs) ? jobs : []).filter(job => job.name === 'Alpha Seeking Pipeline');
  if (pipelines.length !== 1 || pipelines[0].conclusion !== 'success') return false;
  const start = Date.parse(pipelines[0].startedAt);
  const end = Date.parse(pipelines[0].completedAt);
  const current = Date.parse(now);
  const fresh = Date.parse(freshSince);
  if (![start, end, current, fresh].every(Number.isFinite) || end < start || end > current || fresh > current) return false;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(start);
  const get = type => parts.find(part => part.type === type)?.value;
  if (`${get('year')}-${get('month')}-${get('day')}` !== marketDate) return false;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  return start >= fresh || (minute >= 9 * 60 + 30 && minute < 16 * 60);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [marketDate, freshSince] = process.argv.slice(2);
  const { jobs } = JSON.parse(fs.readFileSync(0, 'utf8'));
  console.log(blocksAutomaticAnalysis({ jobs, marketDate, freshSince, now: new Date().toISOString() }) ? '1' : '0');
}
