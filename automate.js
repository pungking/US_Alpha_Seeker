
import puppeteer from 'puppeteer';

/**
 * US_Alpha_Seeker Headless Automation Protocol v2.5
 * 
 * Updates:
 * - Synced Fallback Client ID with Frontend (UniverseGathering.tsx)
 * - Optimized Token Refresh Logic (Removed futile retry combinations)
 * - Prioritized Static Access Token usage on Refresh Failure
 * - Extended Timeout to 100 minutes for deep analysis cycles
 */

// Synced with UniverseGathering.tsx
const FALLBACK_CLIENT_ID = '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com';

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
  console.log("🚀 Starting US_Alpha_Seeker Automation Protocol...");

  const token = await getAccessToken();
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        // [CI FIX] Disable Web Security to allow direct Telegram API calls (CORS bypass)
        // since the local Vite Preview server cannot host the /api proxy.
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ],
    protocolTimeout: 7200000 // 2 hours protocol timeout
  });
  
  try {
    const page = await browser.newPage();
    
    // [CI FIX] Bypass CORS for all requests
    await page.setBypassCSP(true);
    
    page.setDefaultNavigationTimeout(60000); 
    page.setDefaultTimeout(7200000); // 2 hours page timeout
    
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('AUTO-PILOT') || text.includes('Phase') || text.includes('Complete') || text.includes('Error') || text.includes('EXECUTED') || text.includes('[AUTH]') || text.includes('Telegram')) {
            console.log(`[BROWSER] ${text}`);
        }
    });

    const APP_URL = 'http://localhost:3000';

    console.log("🔌 Connecting to Alpha Node...");
    // [CI FIX] Add ?auto=true to initial navigation to prevent WebSocket 429 errors on mount
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'networkidle0' });
    
    console.log("🔐 Injecting Security Context...");
    await page.evaluate((accessToken, clientId) => {
        if (accessToken === "OFFLINE_MODE_TOKEN") {
            sessionStorage.setItem('offline_mode', 'true');
            console.log("[BROWSER] Offline Mode Flag Set");
        } else {
            sessionStorage.setItem('gdrive_access_token', accessToken);
        }
        
        // Inject Client ID for UI consistency
        if (clientId) localStorage.setItem('gdrive_client_id', clientId);
        
    }, token, process.env.GDRIVE_CLIENT_ID || FALLBACK_CLIENT_ID);

    console.log("🤖 Engaging Headless Auto-Pilot...");
    // Reload with auto=true (token is now in session storage)
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'domcontentloaded' });

    console.log("⏳ Pipeline Execution in Progress...");
    
    // Increased timeout to 100 minutes to accommodate long analysis cycles and API rate limits
    const TIMEOUT_MS = 100 * 60 * 1000; 
    
    await page.waitForFunction(
        () => {
            const bodyText = document.body.innerText;
            // Ensure we wait for the final state
            return bodyText.includes("ALL PIPELINES EXECUTED") || 
                   bodyText.includes("TELEGRAM SEND FAILED");
        },
        { timeout: TIMEOUT_MS, polling: 5000 }
    );

    const finalState = await page.evaluate(() => document.body.innerText);
    
    if (finalState.includes("ALL PIPELINES EXECUTED")) {
        console.log("✅ SUCCESS: Alpha Report Generated & Telegram Triggered.");
        await page.screenshot({ path: 'alpha_report_success.png', fullPage: true });
    } else {
        console.warn("⚠️ WARNING: Pipeline finished with unexpected state.");
        await page.screenshot({ path: 'alpha_report_warning.png', fullPage: true });
    }

  } catch (error) {
    console.error("❌ Automation Failed:", error);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("👋 Session Terminated.");
  }
})();
