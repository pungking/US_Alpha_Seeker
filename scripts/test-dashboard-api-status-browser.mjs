import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const executablePath = [process.env.PUPPETEER_EXECUTABLE_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(file => file && fs.existsSync(file));
assert.ok(executablePath, 'Installed Chrome required; UI proof NOT VERIFIED without it');
const root = path.resolve('dist');
assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build the current source before the offline UI test');
const browser = await puppeteer.launch({ executablePath, headless: true, args: [
  '--disable-background-networking', '--disable-sync', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
  ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : [])
] });
let stage = 'startup';
let failureContext = async () => ({});
try {
  const page = await browser.newPage();
  const click = selector => page.$eval(selector, button => {
    if (button.disabled) throw new Error('Fixture control unexpectedly disabled');
    button.click();
  });
  const waitForHeldRequest = async read => {
    const deadline = Date.now() + 5000;
    while (!read()) {
      assert.ok(Date.now() < deadline, 'Expected intercepted fixture request');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return read();
  };
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(() => sessionStorage.setItem('gdrive_access_token', 'synthetic-drive'));
  await page.setRequestInterception(true);
  let configurationGets = 0, geminiPosts = 0, sonarPosts = 0, wrongDeployment = false, blocked = 0;
  let buildSha = 'a'.repeat(40), releaseOldSettings, releaseOldProbe, holdNextProbe = false, holdNextSettings = false;
  let oldSettingsRequest, oldProbeRequest;
  const errors = [];
  failureContext = async () => ({ configurationGets, geminiPosts, sonarPosts, errors,
    cards: await page.$$eval('button[aria-label^="Check "]', buttons => buttons.map(button => ({ disabled: button.disabled, text: button.closest('.glass-panel')?.textContent }))) });
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  page.on('request', async request => {
    const url = new URL(request.url());
    const respond = data => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    if (url.origin === 'https://us-alpha-seeker.vercel.app' && (url.pathname === '/' || url.pathname.startsWith('/assets/'))) {
      const file = path.resolve(root, url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
      if (file.startsWith(root + path.sep) && fs.existsSync(file)) return request.respond({ status: 200,
        contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html', body: fs.readFileSync(file) });
    }
    if (url.origin === 'https://us-alpha-seeker.vercel.app' && url.pathname === '/api/dashboard_ai') {
      if (request.method() === 'GET') {
        configurationGets++;
        const responseBuild = buildSha;
        if (holdNextSettings) {
          holdNextSettings = false;
          await new Promise(resolve => { releaseOldSettings = resolve; oldSettingsRequest = request; });
        }
        if (wrongDeployment) return request.respond({ status: 404, body: 'fixture route missing' });
        return respond({ authenticated: true, gemini: true, perplexity: true, providerVerified: false, buildSha: responseBuild,
          budget: { RUN_MAX_COST_USD: '5', RUN_MAX_REQUESTS: '20' }, providers: {
            RapidAPI: true, Polygon: true, Alpaca: true, Finnhub: true, 'Financial Modeling Prep': true,
            'Twelve Data': true, 'Alpha Vantage': true, 'Google Gemini': true, Perplexity: true
          } });
      }
      const body = JSON.parse(request.postData());
      if (body.provider === 'gemini') {
        geminiPosts++;
        assert.equal(body.payload.model, 'gemini-2.5-flash');
        assert.equal(body.payload.config.maxOutputTokens, 16);
        assert.equal(body.payload.config.thinkingConfig.thinkingBudget, 0);
        const responseBuild = buildSha;
        if (holdNextProbe) { holdNextProbe = false; await new Promise(resolve => { releaseOldProbe = resolve; oldProbeRequest = request; }); }
        return respond({ text: 'OK', usageMetadata: { totalTokenCount: 7 }, buildSha: responseBuild });
      }
      assert.equal(body.provider, 'perplexity'); sonarPosts++;
      assert.equal(body.payload.model, 'sonar'); assert.equal(body.payload.max_tokens, 16); assert.equal(body.payload.disable_search, true);
      return respond({ model: 'sonar', buildSha, choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5, cost: { total_cost: 0.00501 } } });
    }
    blocked++;
    return request.respond({ status: 404, contentType: 'application/json', body: '{"error":"offline fixture blocked"}' });
  });
  await page.goto('https://us-alpha-seeker.vercel.app', { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('CONFIGURED / UNTESTED'));
  assert.equal(await page.$$eval('button[aria-label^="Refresh "]', nodes => nodes.length), 11);
  assert.equal(geminiPosts + sonarPosts, 0, 'no automatic paid/vendor pings');
  assert.equal(configurationGets, 1, 'startup settings checks must be deduplicated');
  assert.ok(!(await page.content()).includes('OFF • 401'));

  await page.$eval('button[aria-label="Check Google Gemini with one real request"]', button => { button.click(); button.click(); });
  await page.waitForFunction(() => document.body.innerText.includes('RESPONSE VERIFIED'));
  assert.equal(geminiPosts, 1, 'immediate duplicate click must not submit a second request');
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Check Perplexity with one real request"]').disabled);
  await click('button[aria-label="Check Perplexity with one real request"]');
  await page.waitForFunction(() => [...document.querySelectorAll('p')].filter(node => node.textContent === 'RESPONSE VERIFIED').length === 2);
  assert.equal(sonarPosts, 1);
  const budget = await page.evaluate(() => JSON.parse(sessionStorage.getItem('US_ALPHA_SEEKER_AI_USAGE')).perplexity.budget);
  assert.equal(budget.requestsAttempted, 1); assert.ok(budget.reservedMicroUsd > 0); assert.equal(budget.reportedMicroUsd, 5010);

  stage = 'build-change';
  buildSha = 'b'.repeat(40);
  await click('button[aria-label="Refresh Google Gemini configuration"]');
  await page.waitForFunction(() => document.body.innerText.includes('bbbbbbbbbbbb'));
  assert.ok(!(await page.content()).includes('RESPONSE VERIFIED'), 'new build invalidates old success without another provider request');

  stage = 'settings-race';
  holdNextSettings = true;
  await page.evaluate(() => sessionStorage.setItem('gdrive_access_token', 'synthetic-delayed-A'));
  await click('button[aria-label="Refresh Google Gemini configuration"]');
  const oldRequest = await waitForHeldRequest(() => oldSettingsRequest);
  stage = 'settings-race/old-request-observed';
  assert.equal(Object.entries(oldRequest.headers()).find(([name]) => name.toLowerCase() === 'authorization')?.[1], 'Bearer synthetic-delayed-A');
  buildSha = 'c'.repeat(40);
  await page.evaluate(() => sessionStorage.setItem('gdrive_access_token', 'synthetic-new-B'));
  await page.waitForFunction(() => document.body.innerText.includes('cccccccccccc'), { timeout: 8000 });
  stage = 'settings-race/new-settings-observed';
  releaseOldSettings();
  await page.waitForFunction(() => document.body.innerText.includes('CONFIGURED / UNTESTED'));
  assert.ok((await page.content()).includes('cccccccccccc'), 'late token-A settings cannot overwrite token-B build');
  assert.ok(!(await page.content()).includes('LOGIN REQUIRED'), 'late token-A failure cannot invalidate token-B login');

  stage = 'probe-race';
  holdNextProbe = true;
  await click('button[aria-label="Check Google Gemini with one real request"]');
  await waitForHeldRequest(() => oldProbeRequest);
  stage = 'probe-race/old-request-observed';
  buildSha = 'd'.repeat(40);
  await page.evaluate(() => sessionStorage.setItem('gdrive_access_token', 'synthetic-new-C'));
  await page.waitForFunction(() => document.body.innerText.includes('dddddddddddd'), { timeout: 8000 });
  releaseOldProbe();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Check Google Gemini with one real request"]').disabled);
  assert.ok(!(await page.content()).includes('RESPONSE VERIFIED'), 'late probe from old identity/build cannot verify new session');

  stage = 'wrong-deployment';
  wrongDeployment = true;
  await click('button[aria-label="Refresh Google Gemini configuration"]');
  await page.waitForFunction(() => document.body.innerText.includes('DEPLOYMENT ERROR'));
  assert.ok(!(await page.content()).includes('RESPONSE VERIFIED'), 'auth/config failure must override old success');
  assert.equal(geminiPosts, 2); assert.equal(sonarPosts, 1);
  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.$$eval('button[aria-label^="Refresh "]', nodes => nodes.length), 11);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: 'OFFLINE_DASHBOARD_API_CARDS', cards: 11, syntheticGeminiPosts: geminiPosts,
    syntheticSonarPosts: sonarPosts, automaticPaidRequests: 0, externalProviderRequests: 0, blockedRequests: blocked,
    doubleClickDeduplicated: true, paidReservationPreserved: true, wrongDeploymentVisible: true,
    identityAndBuildIsolation: true, staleSettingsDiscarded: true, mobileRendered: true, result: 'PASS' }));
} catch (error) {
  console.error(`OFFLINE_DASHBOARD_API_CARDS failed at ${stage}`);
  console.error(JSON.stringify(await failureContext()));
  throw error;
} finally { await browser.close(); }
