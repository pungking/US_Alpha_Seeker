
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
const FAILURE_MARKERS = [
    "TELEGRAM SEND FAILED.",
    "AUTO ABORTED:",
    "Fatal Error:",
    "Missing/invalid GDRIVE_ROOT_FOLDER_ID",
    "[CONFIG] Missing GDRIVE_ROOT_FOLDER_ID"
];

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
        const accessToken = String(data?.access_token || '').trim();
        if (!accessToken) return null;
        const expiresInSec = Number(data?.expires_in);
        return {
            accessToken,
            expiresInSec: Number.isFinite(expiresInSec) ? expiresInSec : null
        };
    } catch (e) {
        console.error("❌ Network Error during refresh:", e.message);
        return null;
    }
}

async function getAccessTokenBundle() {
    const envClientId = (process.env.GDRIVE_CLIENT_ID || '').trim();
    const envClientSecret = (process.env.GDRIVE_CLIENT_SECRET || '').trim();
    const envRefreshToken = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
    const envAccessToken = (process.env.GDRIVE_ACCESS_TOKEN || '').trim();

    console.log("🔄 [AUTH] Checking Authentication Strategies...");

    // Strategy 1: Refresh Token (Preferred for long-running auth)
    if (envClientId && envClientSecret && envRefreshToken) {
        console.log("🔄 [AUTH] Attempting Token Refresh via Secrets...");
        const refreshed = await refreshWithCredentials(envClientId, envClientSecret, envRefreshToken);
        if (refreshed?.accessToken) {
            console.log("✅ [AUTH] Authenticated via Refresh Token.");
            return { accessToken: refreshed.accessToken, expiresInSec: refreshed.expiresInSec, mode: 'refresh' };
        }
    } else if (envRefreshToken) {
        console.warn("⚠️ [AUTH] Refresh Token present but Client ID/Secret missing. Skipping Refresh.");
    }

    // Strategy 2: Static Access Token (Short-lived, good for CI debug or one-off)
    if (envAccessToken) {
        console.log("⚠️ [AUTH] Using Static Access Token from Secrets (May expire).");
        return { accessToken: envAccessToken, expiresInSec: null, mode: 'static' };
    }

    // Strategy 3: Offline Mode
    console.warn("⚠️ [AUTH] All authentication methods failed. Proceeding in OFFLINE SIMULATION MODE.");
    return { accessToken: "OFFLINE_MODE_TOKEN", expiresInSec: null, mode: 'offline' };
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

  const initialAuth = await getAccessTokenBundle();
  let token = initialAuth.accessToken;
  let refreshInFlight = false;
  let authRefreshInterval = null;
  
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
    const syncTokenIntoPage = async (accessToken) => {
        await page.evaluate((nextToken, clientId) => {
            if (nextToken === "OFFLINE_MODE_TOKEN") {
                sessionStorage.setItem('offline_mode', 'true');
                return;
            }
            sessionStorage.setItem('gdrive_access_token', nextToken);
            if (clientId) localStorage.setItem('gdrive_client_id', clientId);
        }, accessToken, process.env.GDRIVE_CLIENT_ID || FALLBACK_CLIENT_ID);
    };

    const refreshBrowserDriveToken = async (reason = 'scheduled') => {
        if (refreshInFlight) return false;
        const envClientId = (process.env.GDRIVE_CLIENT_ID || '').trim();
        const envClientSecret = (process.env.GDRIVE_CLIENT_SECRET || '').trim();
        const envRefreshToken = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
        if (!envClientId || !envClientSecret || !envRefreshToken) return false;
        refreshInFlight = true;
        try {
            const refreshed = await refreshWithCredentials(envClientId, envClientSecret, envRefreshToken);
            if (!refreshed?.accessToken) return false;
            token = refreshed.accessToken;
            await syncTokenIntoPage(token);
            console.log(
                `🔄 [AUTH] Browser token rotated (${reason})` +
                (refreshed.expiresInSec ? ` expiresIn=${refreshed.expiresInSec}s` : '')
            );
            return true;
        } catch (e) {
            console.error(`❌ [AUTH] Browser token rotation failed (${reason}):`, e?.message || e);
            return false;
        } finally {
            refreshInFlight = false;
        }
    };

    page.on('console', msg => {
        const text = msg.text();
        console.log(`[BROWSER] ${msg.type().toUpperCase()}: ${text}`);
        if (text.includes('status of 401') || text.includes('HTTP 401')) {
            refreshBrowserDriveToken('401-detected').catch(() => {});
        }
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
    await syncTokenIntoPage(token);

    console.log("🤖 Engaging Headless Auto-Pilot...");
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'domcontentloaded' });

    if (initialAuth.mode === 'refresh') {
        // Google access tokens expire ~1h. Rotate periodically so stage sync polling never gets stuck on 401.
        authRefreshInterval = setInterval(() => {
            refreshBrowserDriveToken('interval').catch(() => {});
        }, 25 * 60 * 1000);
    }

    console.log("⏳ Pipeline Execution in Progress... (Waiting for 'ALL PIPELINES EXECUTED')");
    let progressTicker = null;
    let lastProgressSignature = "";
    progressTicker = setInterval(async () => {
        try {
            const progress = await page.evaluate(() => (window).__AUTO_PROGRESS || null);
            if (!progress) return;
            const signature = `${progress.mode}|${progress.auto}|${progress.stageId}|${progress.status}`;
            if (signature === lastProgressSignature) return;
            lastProgressSignature = signature;
            console.log(
                `📍 [PROGRESS] mode=${progress.mode} auto=${progress.auto} ` +
                `stage=${progress.stageId}(${progress.stageLabel}) status="${progress.status}"`
            );
        } catch {
            // Ignore transient evaluate failures while page is transitioning.
        }
    }, 10000);
    
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
    } finally {
        if (progressTicker) {
            clearInterval(progressTicker);
            progressTicker = null;
        }
        if (authRefreshInterval) {
            clearInterval(authRefreshInterval);
            authRefreshInterval = null;
        }
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
            stage6HashAlgo: String(info.stage6HashAlgo || ''),
            sourceRunId: String(info.sourceRunId || ''),
            generatedAt: String(info.generatedAt || '')
        };
    });

    const dispatchPayload = {
        stage6File: dispatchInfo?.stage6File || '',
        stage6Hash: dispatchInfo?.stage6Hash || '',
        stage6HashAlgo: dispatchInfo?.stage6HashAlgo || '',
        sourceRunId: dispatchInfo?.sourceRunId || process.env.GITHUB_RUN_ID || '',
        sourceRepo: process.env.GITHUB_REPOSITORY || '',
        sourceWorkflow: process.env.GITHUB_WORKFLOW || '',
        sourceSha: process.env.GITHUB_SHA || '',
        generatedAt: dispatchInfo?.generatedAt || new Date().toISOString()
    };
    fs.writeFileSync('stage6-dispatch-payload.json', JSON.stringify(dispatchPayload, null, 2), 'utf8');
    console.log(
        `[DISPATCH_PAYLOAD] stage6File=${dispatchPayload.stage6File || 'N/A'} stage6Hash=${(dispatchPayload.stage6Hash || 'N/A').slice(0, 12)} algo=${dispatchPayload.stage6HashAlgo || 'unknown'} sourceRun=${dispatchPayload.sourceRunId || 'N/A'}`
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
        const failureDiag = await page.evaluate(() => {
            const win = window;
            const bodyText = String(document.body?.innerText || "");
            const lines = bodyText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            const keys = [
                "CRITICAL FAILURE:",
                "AutoPilot Failed:",
                "AI Coverage Failure:",
                "AI Synthesis Unavailable",
                "Stage 5 Data Not Found",
                "Drive upload failed",
                "TELEGRAM_CONTRACT_MISMATCH",
                "Brief Gen Failed:",
                "AUTO ABORTED:",
                "NO CANDIDATES",
                "AI FAILED NO REPORT",
                "INTEGRITY GATE BLOCKED"
            ];
            const matched = lines.filter((line) => keys.some((key) => line.includes(key)));
            const progress = win.__AUTO_PROGRESS || null;
            const dispatch = win.__STAGE6_DISPATCH_INFO || null;
            const done = typeof win.__AUTO_DONE === "string" ? win.__AUTO_DONE : "";
            return {
                done,
                progress,
                dispatch,
                matched: matched.slice(-12)
            };
        });

        const normalized = String(finalState || '');
        const statusLine =
            normalized
                .split(/\r?\n/)
                .find((line) => line.includes(SUCCESS_STATUS) || FAILURE_MARKERS.some((marker) => line.includes(marker))) ||
            normalized.slice(0, 200);
        console.error(`❌ PIPELINE TERMINATED: ${statusLine}`);
        if (failureDiag?.progress) {
            console.error(
                `[AUTO_STATE] stage=${failureDiag.progress.stageId}(${failureDiag.progress.stageLabel}) status="${failureDiag.progress.status}"`
            );
        }
        if (failureDiag?.dispatch) {
            console.error(
                `[AUTO_STATE] dispatch stage6File=${failureDiag.dispatch.stage6File || "N/A"} ` +
                `stage6Hash=${String(failureDiag.dispatch.stage6Hash || "N/A").slice(0, 12)}`
            );
        } else {
            console.error("[AUTO_STATE] dispatch stage6File=N/A stage6Hash=N/A");
        }
        if (Array.isArray(failureDiag?.matched) && failureDiag.matched.length > 0) {
            failureDiag.matched.forEach((line) => console.error(`[AUTO_DIAG] ${line}`));
        }
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
