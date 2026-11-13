// Disposable browser smoke only: data: URL; no credentials, providers, trading or production artifacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

// Resolve executablePath() before stat: Puppeteer 25 returns a Promise here.
// This CI fixture uses only an already installed local browser, never downloads one.
const configured = process.env.PUPPETEER_EXECUTABLE_PATH;
let managedPath = null;
if (!configured) {
  try {
    managedPath = await puppeteer.executablePath();
  } catch {
    // Absence of a managed Chrome is expected with browser downloads disabled.
  }
}
const candidates = configured ? [
  { source: 'explicit-local-configuration', path: configured },
] : [
  { source: 'puppeteer-managed', path: managedPath },
  { source: 'system-google-chrome', path: '/usr/bin/google-chrome' },
  { source: 'system-google-chrome-stable', path: '/usr/bin/google-chrome-stable' },
  { source: 'system-chromium', path: '/usr/bin/chromium' },
  { source: 'system-chromium-browser', path: '/usr/bin/chromium-browser' },
  { source: 'system-google-chrome-alt', path: '/opt/google/chrome/chrome' },
  { source: 'macos-google-chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  { source: 'macos-chrome-for-testing', path: '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' },
  { source: 'macos-chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
];
function isExistingExecutable(candidate) {
  if (typeof candidate.path !== 'string' || !candidate.path.trim()) return false;
  try { return fs.statSync(candidate.path).isFile(); }
  catch { return false; }
}
const selected = candidates.find(isExistingExecutable);
assert.ok(selected, 'No installed Chrome/Chromium executable found on this runner; offline smoke NOT VERIFIED');
const browserPath = selected.path;

const offlineDocument = '<!doctype html><html><head><title>OFFLINE_PUPPETEER_CONTRACT</title></head><body><div id="fixture">LOCAL_ONLY</div></body></html>';
const checks = [];
let blockedPageHttpRequests = 0;

for (const protocol of ['cdp', 'webDriverBiDi']) {
  let browser;
  try {
    // --no-sandbox is confined to this disposable CI runner, never the scheduled production workflow.
    browser = await puppeteer.launch({
      protocol,
      executablePath: browserPath,
      headless: true,
      timeout: 25000,
      args: [
        ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
        '--disable-background-networking',
        '--disable-extensions',
        '--disable-sync',
        '--no-first-run',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
      ],
    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        blockedPageHttpRequests++;
        request.abort('blockedbyclient');
      }
      else request.continue();
    });
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(offlineDocument)}`, {
      waitUntil: 'load',
      timeout: 15000,
    });
    assert.equal(await page.title(), 'OFFLINE_PUPPETEER_CONTRACT');
    assert.equal(await page.$eval('#fixture', (el) => el.textContent), 'LOCAL_ONLY');
    assert.equal(blockedPageHttpRequests, 0, 'fixture must not attempt HTTP(S) page requests');
    checks.push({ protocol, status: 'PASS', pageHTTPRequests: 0 });
  } finally {
    if (browser) await browser.close();
  }
}
console.log(JSON.stringify({
  check: 'OFFLINE_PUPPETEER_CDP_BIDI_SMOKE',
  checks,
  browserSource: selected.source,
  platform: process.platform,
  browserPath: 'redacted-local-executable',
  scheduledAnalysisExecuted: false,
  fixtureProviderRequests: 0,
  fixtureTradingRequests: 0,
  blockedPageHttpRequests,
  proofLimit: 'disposable CI browser only; does not certify scheduled provider-integrated runtime',
}));
