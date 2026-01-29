
import puppeteer from 'puppeteer';
import 'dotenv/config';

// --- CONFIGURATION ---
const APP_URL = process.env.APP_URL || 'https://us-alpha-seeker.vercel.app';
const TIMEOUT_MS = 90 * 60 * 1000; // 90 Minutes Max Runtime

// --- UTILITIES ---

/**
 * Check if US Market (New York) is currently in Daylight Savings Time (EDT)
 * Standard Time: EST (UTC-5), Daylight Time: EDT (UTC-4)
 */
function isUsDaylightSavings() {
    // New York time now
    const nyTime = new Date().toLocaleString("en-US", {timeZone: "America/New_York", timeZoneName: "short"});
    return nyTime.includes("EDT"); // "EDT" means Summer/DST is active
}

/**
 * Decide whether to run based on current UTC hour and DST status.
 * Target Delivery KST 20:30 (Summer) -> Start KST 19:30 -> UTC 10:30
 * Target Delivery KST 21:30 (Winter) -> Start KST 20:30 -> UTC 11:30
 */
function shouldRunNow() {
    const currentUtcHour = new Date().getUTCHours();
    const isDst = isUsDaylightSavings();

    console.log(`[Clock] Current UTC Hour: ${currentUtcHour}, US DST Active: ${isDst}`);

    if (isDst) {
        // Summer: Run only if it's 10 UTC
        if (currentUtcHour === 10) return true;
        console.log(">> DST Active (Summer). Scheduled for 10:xx UTC. Current is not match. Skipping.");
    } else {
        // Winter: Run only if it's 11 UTC
        if (currentUtcHour === 11) return true;
        console.log(">> STD Active (Winter). Scheduled for 11:xx UTC. Current is not match. Skipping.");
    }
    
    // Safety override for manual testing
    if (process.env.FORCE_RUN === 'true') {
        console.log(">> FORCE_RUN detected. Ignoring schedule check.");
        return true;
    }

    return false;
}

/**
 * Exchange Refresh Token for a fresh Access Token
 * This is crucial because Puppeteer opens a fresh session without login cookies.
 */
async function getFreshAccessToken() {
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error("Missing Google OAuth Credentials (CLIENT_ID, SECRET, or REFRESH_TOKEN)");
    }

    console.log("[Auth] Refreshing Google Drive Access Token...");
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(`Auth Refresh Failed: ${data.error_description || JSON.stringify(data)}`);
    }
    
    console.log("[Auth] Token Refreshed Successfully.");
    return data.access_token;
}

// --- MAIN ENGINE ---

async function runAlphaSeeker() {
    if (!shouldRunNow()) {
        console.log("🚫 Schedule Mismatch. Exiting gracefully.");
        process.exit(0);
    }

    console.log("🚀 Starting US_Alpha_Seeker Autopilot Protocol...");
    let browser;

    try {
        // 1. Get Credentials
        const accessToken = await getFreshAccessToken();

        // 2. Launch Browser
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for GitHub Actions
        });
        const page = await browser.newPage();

        // 3. Set Viewport & Console forwarding
        await page.setViewport({ width: 1920, height: 1080 });
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        // 4. Navigate & Inject Token
        console.log(`[Nav] navigating to ${APP_URL}...`);
        await page.goto(APP_URL, { waitUntil: 'networkidle0' });

        // Inject Token into SessionStorage so App.tsx sees us as "Logged In"
        console.log("[Inject] Injecting Access Token...");
        await page.evaluate((token) => {
            sessionStorage.setItem('gdrive_access_token', token);
        }, accessToken);

        // 5. Trigger Automation
        // We reload with ?auto=true parameter. 
        // Since session storage persists on same-tab reload (mostly), or we navigate to specific URL.
        const autoUrl = `${APP_URL}/?auto=true`;
        console.log(`[Trigger] Navigating to Auto-Mode: ${autoUrl}`);
        await page.goto(autoUrl, { waitUntil: 'networkidle0' });

        // 6. Monitor Progress
        // We look for specific log message "✅ Auto Pilot Complete" in the browser console
        // or a specific UI element change.
        console.log("[Monitor] Watching for completion signal (Timeout: 90m)...");
        
        await page.waitForFunction(
            () => {
                // Check the logs array in AlphaAnalysis or App state if accessible, 
                // OR check for the specific status text in the DOM.
                const statusEl = document.querySelector('span.text-rose-400.animate-pulse'); // "AUTOMATION_RUNNING" text class roughly
                const allText = document.body.innerText;
                return allText.includes("ALL PIPELINES EXECUTED") || allText.includes("AUTOMATION_COMPLETE");
            },
            { timeout: TIMEOUT_MS, polling: 5000 }
        );

        console.log("✅ Mission Accomplished: Target Alpha Report Generated & Transmitted.");

    } catch (error) {
        console.error("❌ FATAL ERROR in Autopilot:", error);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
}

runAlphaSeeker();
