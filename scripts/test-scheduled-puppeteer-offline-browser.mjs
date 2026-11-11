// Disposable browser smoke only: data: URL; no credentials, providers, trading or production artifacts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer';

const browserPath = puppeteer.executablePath();
assert.ok(fs.existsSync(browserPath), 'Puppeteer browser not installed; runtime compatibility unverified');

const offlineDocument = '<!doctype html><html><head><title>OFFLINE_PUPPETEER_CONTRACT</title></head><body><div id="fixture">LOCAL_ONLY</div></body></html>';
const checks = [];

for (const protocol of ['cdp', 'webDriverBiDi']) {
  let browser;
  try {
    // --no-sandbox is confined to this disposable CI runner, never the scheduled production workflow.
    browser = await puppeteer.launch({
      protocol,
      headless: true,
      timeout: 25000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
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
      if (/^https?:/i.test(request.url())) request.abort('blockedbyclient');
      else request.continue();
    });
    await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(offlineDocument)}`, {
      waitUntil: 'load',
      timeout: 15000,
    });
    assert.equal(await page.title(), 'OFFLINE_PUPPETEER_CONTRACT');
    assert.equal(await page.$eval('#fixture', (el) => el.textContent), 'LOCAL_ONLY');
    checks.push({ protocol, status: 'PASS', externalRequests: 0 });
  } finally {
    if (browser) await browser.close();
  }
}
console.log(JSON.stringify({
  check: 'OFFLINE_PUPPETEER_CDP_BIDI_SMOKE',
  checks,
  scheduledAnalysisExecuted: false,
  providerRequests: 0,
  tradingRequests: 0,
  proofLimit: 'disposable CI browser only; does not certify scheduled provider-integrated runtime',
}));
