
import puppeteer from 'puppeteer';

/**
 * US_Alpha_Seeker Headless Automation Protocol v2.0
 * 
 * Features:
 * 1. Robust Token Refresh with Fallback Client ID
 * 2. Whitespace trimming for Env Vars
 * 3. Graceful fallback to static Access Token
 * 4. Puppeteer automation for App execution
 */

// Fallback ID from UniverseGathering.tsx to ensure continuity if Secrets fail
const FALLBACK_CLIENT_ID = '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com';

async function refreshWithCredentials(clientId, clientSecret, refreshToken) {
    if (!clientId || !refreshToken) return null;
    
    const params = {
        client_id: clientId,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
    };
    if (clientSecret) params.client_secret = clientSecret;

    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params)
        });

        if (!response.ok) {
            const txt = await response.text();
            // Log error but mask credentials
            console.log(`⚠️ Token Refresh Failed for Client ID ...${clientId.slice(-6)}: ${txt}`);
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
    // 1. Sanitize Inputs
    const envClientId = (process.env.GDRIVE_CLIENT_ID || '').trim();
    const envClientSecret = (process.env.GDRIVE_CLIENT_SECRET || '').trim();
    const envRefreshToken = (process.env.GDRIVE_REFRESH_TOKEN || '').trim();
    const envAccessToken = (process.env.GDRIVE_ACCESS_TOKEN || '').trim();

    console.log("🔄 [AUTH] Initiating Secure Token Exchange...");

    // 2. Attempt with Environment Credentials
    if (envClientId && envRefreshToken) {
        const token = await refreshWithCredentials(envClientId, envClientSecret, envRefreshToken);
        if (token) {
            console.log("✅ [AUTH] Authenticated via Environment Secrets.");
            return token;
        }
    }

    // 3. Attempt with Fallback Client ID (Robustness for Mismatched Secrets)
    if (FALLBACK_CLIENT_ID !== envClientId && envRefreshToken) {
        console.log("🔄 [AUTH] Retrying with System Fallback ID...");
        // Try with secret
        let token = await refreshWithCredentials(FALLBACK_CLIENT_ID, envClientSecret, envRefreshToken);
        if (token) {
             console.log("✅ [AUTH] Authenticated via Fallback ID (w/ Secret).");
             return token;
        }
        // Try without secret (Native App Flow support)
        token = await refreshWithCredentials(FALLBACK_CLIENT_ID, '', envRefreshToken);
        if (token) {
             console.log("✅ [AUTH] Authenticated via Fallback ID (No Secret).");
             return token;
        }
    }

    // 4. Last Resort: Static Token
    if (envAccessToken) {
        console.warn("⚠️ [AUTH] Refresh failed. Using static Access Token (Risk of Expiration).");
        return envAccessToken;
    }

    return null;
}

(async () => {
  console.log("🚀 Starting US_Alpha_Seeker Automation Protocol...");

  const token = await getAccessToken();
  if (!token) {
    console.error("❌ [CRITICAL] Authentication Failed. Check GitHub Secrets (GDRIVE_REFRESH_TOKEN, GDRIVE_CLIENT_ID).");
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('AUTO-PILOT') || text.includes('Phase') || text.includes('Complete') || text.includes('Error') || text.includes('EXECUTED') || text.includes('[AUTH]')) {
            console.log(`[BROWSER] ${text}`);
        }
    });

    const APP_URL = 'http://localhost:3000';

    console.log("🔌 Connecting to Alpha Node...");
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    
    console.log("🔐 Injecting Security Context...");
    await page.evaluate((accessToken, clientId) => {
        sessionStorage.setItem('gdrive_access_token', accessToken);
        if (clientId) localStorage.setItem('gdrive_client_id', clientId);
    }, token, process.env.GDRIVE_CLIENT_ID || FALLBACK_CLIENT_ID);

    console.log("🤖 Engaging Headless Auto-Pilot...");
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log("⏳ Pipeline Execution in Progress...");
    
    const TIMEOUT_MS = 25 * 60 * 1000; // 25 Minutes
    
    await page.waitForFunction(
        () => {
            const bodyText = document.body.innerText;
            return bodyText.includes("ALL PIPELINES EXECUTED") || 
                   bodyText.includes("TELEGRAM SEND FAILED");
        },
        { timeout: TIMEOUT_MS, polling: 10000 }
    );

    const finalState = await page.evaluate(() => document.body.innerText);
    
    if (finalState.includes("ALL PIPELINES EXECUTED")) {
        console.log("✅ SUCCESS: Alpha Report Generated & Transmitted.");
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
