
import puppeteer from 'puppeteer';

/**
 * US_Alpha_Seeker Headless Automation Protocol
 * 
 * 기능:
 * 1. 구글 드라이브 Access Token 자동 갱신 (Refresh Token 사용)
 * 2. 로컬 서버 접속 및 보안 토큰 주입
 * 3. Auto-Pilot 모드 가동 (?auto=true)
 * 4. 파이프라인 완료 대기 및 증거 스크린샷 캡처
 */

async function getAccessToken() {
    const clientId = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        console.warn("⚠️ Refresh Token credentials missing. Relying on static GDRIVE_ACCESS_TOKEN (Risk of Expiration).");
        return process.env.GDRIVE_ACCESS_TOKEN;
    }

    console.log("🔄 [AUTH] Refreshing Google Drive Access Token...");
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Token Refresh Failed: ${err}`);
        }

        const data = await response.json();
        console.log("✅ [AUTH] Access Token Refreshed Successfully.");
        return data.access_token;
    } catch (error) {
        console.error("❌ [AUTH] Token Refresh Error:", error);
        // 최후의 수단으로 만료되었을지 모르는 기존 토큰이라도 반환
        return process.env.GDRIVE_ACCESS_TOKEN; 
    }
}

(async () => {
  console.log("🚀 Starting US_Alpha_Seeker Automation Protocol...");

  const token = await getAccessToken();
  if (!token) {
    console.error("❌ [CRITICAL] No Access Token available. Aborting operation.");
    process.exit(1);
  }

  // GitHub Actions 환경에 최적화된 브라우저 실행 옵션
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  
  try {
    const page = await browser.newPage();
    
    // 브라우저 내부 로그를 터미널로 출력 (디버깅용)
    page.on('console', msg => {
        const text = msg.text();
        // 주요 진행 상황만 필터링해서 출력
        if (text.includes('AUTO-PILOT') || text.includes('Phase') || text.includes('Complete') || text.includes('Error') || text.includes('EXECUTED')) {
            console.log(`[BROWSER] ${text}`);
        }
    });

    const APP_URL = 'http://localhost:3000';

    // 1. 초기 접속 (컨텍스트 로드)
    console.log("🔌 Connecting to Local Node...");
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    
    // 2. 인증 토큰 주입 (로그인 과정 생략)
    console.log("🔐 Injecting Security Credentials...");
    await page.evaluate((accessToken, clientId) => {
        sessionStorage.setItem('gdrive_access_token', accessToken);
        if (clientId) localStorage.setItem('gdrive_client_id', clientId);
    }, token, process.env.GDRIVE_CLIENT_ID || '');

    // 3. Auto-Pilot 모드로 재접속
    console.log("🤖 Engaging Headless Auto-Pilot Mode...");
    await page.goto(`${APP_URL}/?auto=true`, { waitUntil: 'domcontentloaded' });

    // 4. 파이프라인 완료 대기
    console.log("⏳ Pipeline Execution in Progress. Waiting for completion signal...");
    
    // 최대 20분 대기 (분석량이 많을 경우를 대비)
    const TIMEOUT_MS = 20 * 60 * 1000; 
    
    await page.waitForFunction(
        () => {
            const bodyText = document.body.innerText;
            return bodyText.includes("ALL PIPELINES EXECUTED") || 
                   bodyText.includes("TELEGRAM SEND FAILED");
        },
        { timeout: TIMEOUT_MS, polling: 5000 }
    );

    // 5. 결과 확인 및 종료
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
