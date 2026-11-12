import assert from 'node:assert/strict';
import fs from 'node:fs';
import { currentDriveProgressToken } from '../services/driveProgressToken.mjs';

// Offline pure token snapshots: a polling closure must see a rotation without a React rerender.
const store = new Map();
const storage = { getItem: (key) => store.get(key) ?? null };
const requests = [];
const poll = () => {
  const live = currentDriveProgressToken(storage);
  if (live) requests.push({ token: live, file: 'COLLECTION_PROGRESS.json' });
};
assert.equal(currentDriveProgressToken(storage), null);
store.set('gdrive_access_token', 'bearer-A');
poll();
store.set('gdrive_access_token', 'bearer-B');
poll();
assert.deepEqual(requests.map(x => x.token), ['bearer-A', 'bearer-B']);
store.delete('gdrive_access_token');
poll();
assert.equal(requests.length, 2, 'missing token must not reuse prior bearer');
store.set('gdrive_access_token', '  ');
poll();
assert.equal(requests.length, 2, 'blank bearer must not trigger a Drive request');
store.set('gdrive_access_token', 'bearer-C');
poll();
assert.deepEqual(requests.map(x => x.token), ['bearer-A', 'bearer-B', 'bearer-C']);
assert.equal(currentDriveProgressToken({ getItem: () => { throw new Error('SecurityError'); } }), null);
assert.equal(currentDriveProgressToken(null), null);
assert.equal(currentDriveProgressToken({ getItem: () => 123 }), null);

// Guard that the REAL progress interval uses current storage, not a stale render-time capture.
// This guards integration, while the mock above tests the pure selector's actual behavior.
const source = fs.readFileSync(new URL('../components/FundamentalAnalysis.tsx', import.meta.url), 'utf8');
const interval = source.match(/pollingInterval\.current\s*=\s*setInterval\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*10000\);/);
assert.ok(interval, '10-second Drive progress interval missing');
assert.match(interval[1], /const pollingToken\s*=\s*currentDriveProgressToken\(sessionStorage\)/);
assert.match(interval[1], /if\s*\(!pollingToken\)/);
assert.match(interval[1], /checkProgress\(pollingToken,\s*systemMapId\)/);
assert.doesNotMatch(interval[1], /checkProgress\(accessToken,/);
assert.match(source, /readyData\?\.status\s*===\s*"COMPLETED"\s*&&\s*readyData\?\.trigger_file\s*===\s*expectedTriggerFile/,
  'Stage4 ready signal must remain bound to the exact expected trigger');
assert.match(source, /stopSyncPolling\(\);/);
console.log('PASS Drive progress token rotation A->B->C, missing-token fail-closed, stable 10s polling and Stage4 trigger guard; externalRequests=0');
