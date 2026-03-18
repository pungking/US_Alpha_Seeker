
import fs from 'node:fs';
import puppeteer from 'puppeteer';

/**
 * US_Alpha_Seeker Headless Automation Protocol v2.6 (Debug Mode)
 * 
 * Updates:
 * - Enabled VERBOSE logging from browser console.
 * - Added page content dump on timeout for debugging.
 */

// Synced with UniverseGathering.tsx
const FALLBACK_CLIENT_ID = '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com';
const DEFAULT_APP_URL = 'http://localhost:3000';
const SUCCESS_STATUS = "ALL PIPELINES EXECUTED.";
const FAILURE_MARKERS = ["TELEGRAM SEND FAILED.", "AUTO ABORTED:"];

async function waitForServer(baseUrl, timeoutMs = 120000, pollMs = 2000) {
    const startedAt = Date.now();
    const pingUrl = `${baseUrl}/`;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const res = await fetch(pingUrl, { method: 'GET' });
            if (res.ok) return true;
        } catch {
            // Continue polling until timeout.
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
    return false;
}

async function refreshWithCredentials(clientId, clientSecret, refreshToken) {
    if (!clientId || !refreshToken || !clientSecret) return null;
    
    const params = {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    };

    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params)
        });

        if (!response.ok) {
            const txt = await response.text();
            console.log(`⚠️ Token Refresh Failed: ${txt}`);
            return null;
        }
        const data = await response.json();
        return data.access_token;
    } catch (e) {
        console.error("❌ Network Error during refresh:", e.message);
        return null;
    }
}

async function getAccessToken() {
    const envClientId = (process.env.GDRIVE_CLIENT_ID || '').trim();
    const envClientSecret = (process.env.GDRIVE_CLIENT_SECRET || '').trim();
    const envRefreshToken = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
    const envAccessToken = (process.env.GDRIVE_ACCESS_TOKEN || '').trim();

    console.log("🔄 [AUTH] Checking Authentication Strategies...");

    // Strategy 1: Refresh Token (Preferred for long-running auth)
    if (envClientId && envClientSecret && envRefreshToken) {
        console.log("🔄 [AUTH] Attempting Token Refresh via Secrets...");
        const token = await refreshWithCredentials(envClientId, envClientSecret, envRefreshToken);
        if (token) {
            console.log("✅ [AUTH] Authenticated via Refresh Token.");
            return token;
        }
    } else if (envRefreshToken) {
        console.warn("⚠️ [AUTH] Refresh Token present but Client ID/Secret missing. Skipping Refresh.");
    }

    // Strategy 2: Static Access Token (Short-lived, good for CI debug or one-off)
    if (envAccessToken) {
        console.log("⚠️ [AUTH] Using Static Access Token from Secrets (May expire).");
        return envAccessToken;
    }

    // Strategy 3: Offline Mode
    console.warn("⚠️ [AUTH] All authentication methods failed. Proceeding in OFFLINE SIMULATION MODE.");
    return "OFFLINE_MODE_TOKEN";
}

(async () => {
  console.log("🚀 Starting US_Alpha_Seeker Automation Protocol (DEBUG MODE)...");
  const APP_URL = (process.env.APP_URL || DEFAULT_APP_URL).trim().replace(/\/+$/, '');
  console.log(`🌐 [BOOT] Target App URL: ${APP_URL}`);

  console.log("⏳ [BOOT] Waiting for app server...");
  const serverReady = await waitForServer(APP_URL, 120000, 2000);
  if (!serverReady) {
      console.error(`❌ [BOOT] App server is not reachable within timeout: ${APP_URL}`);
      process.exit(1);
  }
  console.log("✅ [BOOT] App server is ready.");

  const token = await getAccessToken();
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ],
    protocolTimeout: 7200000 // 2 hours
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1.5 });
    
    await page.setBypassCSP(true);
    
    // [DEBUG] Capture ALL console logs to see where it hangs
    page.on('console', msg => {
        console.log(`[BROWSER] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    // [DEBUG] Capture page errors
    page.on('pageerror', err => {
        console.error(`[BROWSER CRASH] Page Error: ${err.message}`);
    });

    const captureIndividualAnalysisDashboard = async () => {
        try {
            await page.waitForFunction(
                () => {
                    const body = document.body?.innerText || '';
                    return (
                        body.includes('ALPHA_SIEVE ENGINE') ||
                        body.includes('Executable Picks') ||
                        body.includes('WATCHLIST')
                    );
                },
                { timeout: 15000, polling: 1000 }
            ).catch(() => {});

            await page.evaluate(() => {
                const controls = Array.from(document.querySelectorAll('button,[role="button"]'));
                const individualTab = controls.find((el) =>
                    (el.textContent || '').toUpperCase().includes('INDIVIDUAL ANALYSIS')
                );
                if (individualTab instanceof HTMLElement) individualTab.click();

                const focusTexts = ['ALPHA_SIEVE ENGINE', 'EXECUTABLE PICKS', 'WATCHLIST'];
                let focusEl = null;
                const candidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,div,span,p'));
                for (const txt of focusTexts) {
                    focusEl = candidates.find((el) => (el.textContent || '').toUpperCase().includes(txt));
                    if (focusEl) break;
                }
                if (focusEl instanceof HTMLElement) {
                    focusEl.scrollIntoView({ block: 'start', behavior: 'auto' });
                    window.scrollBy(0, -80);
                }
            });

            await page.evaluate(async () => {
                const fonts = document?.fonts;
                if (fonts && typeof fonts.ready?.then === 'function') {
                    await fonts.ready;
                }
            });
            await new Promise((resolve) => setTimeout(resolve, 1200));
            await page.screenshot({ path: 'alpha_dashboard_individual_analysis.png', fullPage: true });
            console.log('📸 Saved dashboard capture: alpha_dashboard_individual_analysis.png');
        } catch (e) {
            console.warn(`⚠️ Dashboard capture skipped: ${e?.message || e}`);
        }
    };

    console.log("🔌 Connecting to Alpha Node...");
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'networkidle0' });
    
    console.log("🔐 Injecting Security Context...");
    await page.evaluate((accessToken, clientId) => {
        if (accessToken === "OFFLINE_MODE_TOKEN") {
            sessionStorage.setItem('offline_mode', 'true');
            console.log("[Setup] Offline Mode Flag Set");
        } else {
            sessionStorage.setItem('gdrive_access_token', accessToken);
        }
        if (clientId) localStorage.setItem('gdrive_client_id', clientId);
    }, token, process.env.GDRIVE_CLIENT_ID || FALLBACK_CLIENT_ID);

    console.log("🤖 Engaging Headless Auto-Pilot...");
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'domcontentloaded' });

    console.log("⏳ Pipeline Execution in Progress... (Waiting for 'ALL PIPELINES EXECUTED')");
    
    const TIMEOUT_MS = 100 * 60 * 1000; // 100 minutes
    
    try {
        await page.waitForFunction(
            () => {
                const bodyText = document.body.innerText;
                const successStatus = "ALL PIPELINES EXECUTED.";
                const failureMarkers = ["TELEGRAM SEND FAILED.", "AUTO ABORTED:"];
                // Prefer explicit completion flag; fallback to legacy text matching.
                if (typeof window.__AUTO_DONE === 'string' && window.__AUTO_DONE.length > 0) return true;
                return bodyText.includes(successStatus) ||
                       failureMarkers.some((marker) => bodyText.includes(marker));
            },
            { timeout: TIMEOUT_MS, polling: 5000 }
        );
    } catch (waitError) {
        console.error("❌ Timeout reached! Dumping current page state for debugging...");
        const bodyText = await page.evaluate(() => document.body.innerText);
        console.log("--- [CURRENT PAGE TEXT START] ---");
        console.log(bodyText.substring(0, 2000) + "... (truncated)");
        console.log("--- [CURRENT PAGE TEXT END] ---");
        throw waitError;
    }

    const finalState = await page.evaluate(() => {
        if (typeof window.__AUTO_DONE === 'string' && window.__AUTO_DONE.length > 0) return window.__AUTO_DONE;
        return document.body.innerText;
    });

    const dispatchInfo = await page.evaluate(() => {
        const info = (window).__STAGE6_DISPATCH_INFO;
        if (!info || typeof info !== 'object') return null;
        return {
            stage6File: String(info.stage6File || ''),
            stage6Hash: String(info.stage6Hash || ''),
            sourceRunId: String(info.sourceRunId || ''),
            generatedAt: String(info.generatedAt || '')
        };
    });

    const dispatchPayload = {
        stage6File: dispatchInfo?.stage6File || '',
        stage6Hash: dispatchInfo?.stage6Hash || '',
        sourceRunId: dispatchInfo?.sourceRunId || process.env.GITHUB_RUN_ID || '',
        sourceRepo: process.env.GITHUB_REPOSITORY || '',
        sourceWorkflow: process.env.GITHUB_WORKFLOW || '',
        sourceSha: process.env.GITHUB_SHA || '',
        generatedAt: dispatchInfo?.generatedAt || new Date().toISOString()
    };
    fs.writeFileSync('stage6-dispatch-payload.json', JSON.stringify(dispatchPayload, null, 2), 'utf8');
    console.log(
        `[DISPATCH_PAYLOAD] stage6File=${dispatchPayload.stage6File || 'N/A'} stage6Hash=${(dispatchPayload.stage6Hash || 'N/A').slice(0, 12)} sourceRun=${dispatchPayload.sourceRunId || 'N/A'}`
    );

    // Capture Individual Analysis dashboard section with recommended picks.
    await captureIndividualAnalysisDashboard();
    
    if (finalState.includes(SUCCESS_STATUS)) {
        console.log("✅ SUCCESS: Alpha Report Generated & Telegram Triggered.");
        await page.evaluate(async () => {
            window.scrollTo(0, 0);
            const fonts = document?.fonts;
            if (fonts && typeof fonts.ready?.then === 'function') {
                await fonts.ready;
            }
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        await page.screenshot({ path: 'alpha_report_success.png', fullPage: false });
    } else {
        const normalized = String(finalState || '');
        const statusLine =
            normalized
                .split(/\r?\n/)
                .find((line) => line.includes(SUCCESS_STATUS) || FAILURE_MARKERS.some((marker) => line.includes(marker))) ||
            normalized.slice(0, 200);
        console.error(`❌ PIPELINE TERMINATED: ${statusLine}`);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: 'alpha_report_warning.png', fullPage: false });
        process.exitCode = 1;
    }

  } catch (error) {
    console.error("❌ Automation Failed:", error);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("👋 Session Terminated.");
  }
})();
