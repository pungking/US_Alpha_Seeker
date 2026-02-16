import { TELEGRAM_CONFIG } from "../constants";

/**
 * Sends a message to the configured Telegram Chat.
 * Automatically handles long messages and retries with plain text if Markdown fails.
 * Includes Fallback for CI/Preview environments where /api proxy is unavailable.
 */
export async function sendTelegramReport(reportContent: string): Promise<boolean> {
  const { TOKEN, CHAT_ID } = TELEGRAM_CONFIG;
  
  // Mask token for log safety
  const maskedToken = TOKEN ? `${TOKEN.substring(0, 5)}...` : 'MISSING';
  console.log(`[Telegram] Initializing transmission to Chat ID: ${CHAT_ID}. Token Status: ${maskedToken}`);

  if (!TOKEN || !CHAT_ID) {
    console.error("Telegram Credentials Missing. Check .env or constants.ts.");
    // Fallback attempt: check if we can get them from window/global context (rare, but sometimes used in tests)
    return false;
  }

  // 1. Prepare Header
  const header = `🚀 *US Alpha Seeker Report* 🚀\n\n`;
  
  // Clean up standard Markdown to Telegram Legacy Markdown if possible
  // Telegram MarkdownV2 requires escaping specific characters if not in code blocks, but it's complex.
  // Standard 'Markdown' mode is safer but limited. We'll try to keep it simple.
  let cleanReport = reportContent.replace(/\*\*(.*?)\*\*/g, '*$1*'); // Bold
  
  // [FIX] Remove citations like [1], [2], [1][2] globally from the final message
  cleanReport = cleanReport.replace(/\[\d+(?:,\s*\d+)*\]/g, '');

  // Safety: If the AI accidentally included the header, remove it to prevent duplication
  cleanReport = cleanReport.replace(/🚀.*?Report.*?🚀/gi, '').trim();
  
  const fullMessage = header + cleanReport;

  // 2. Helper to send chunks via Proxy or Direct
  const sendMessageChunk = async (text: string, useMarkdown = true): Promise<boolean> => {
    
    const payload: any = {
        chat_id: CHAT_ID,
        text: text,
    };
    if (useMarkdown) payload.parse_mode = 'Markdown';

    // ATTEMPT 1: Use Internal Proxy (Works in Production Vercel)
    try {
      // In CI/Preview, this might 404 immediately.
      const proxyUrl = `/api/telegram`; 
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: TOKEN,
            method: 'sendMessage',
            body: payload
        })
      });

      // If Proxy returns 404 (common in Vite Preview/CI), trigger error to jump to catch
      if (res.status === 404) throw new Error("Proxy Not Found (404)");

      const json = await res.json();
      
      if (!res.ok) {
         console.warn(`[Telegram Proxy] Failed: ${json.description || 'Unknown Error'}`);
         // Retry as Plain Text if Markdown Error
         if (useMarkdown && (json.description?.includes('parse') || json.description?.includes('can\'t parse'))) {
             console.warn("Telegram Markdown Parse Error. Retrying as Plain Text...");
             return sendMessageChunk(text, false);
         }
         return false;
      }
      return true;

    } catch (proxyError: any) {
      // ATTEMPT 2: Direct API Call (Works in CI/Puppeteer with --disable-web-security)
      console.warn(`Telegram Proxy Failed (${proxyError.message}), attempting Direct API call...`);
      
      try {
          const directUrl = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
          
          // Note: In a strict browser env without proxy, this will be blocked by CORS unless --disable-web-security is on.
          const res = await fetch(directUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          const json = await res.json();

          if (!res.ok) {
             console.error(`[Telegram Direct] Error ${res.status}:`, json);
             if (useMarkdown && (json.description?.includes('parse') || json.description?.includes('can\'t parse'))) {
                 console.warn("Telegram Markdown Parse Error (Direct). Retrying as Plain Text...");
                 return sendMessageChunk(text, false);
             }
             return false;
          }
          return true;

      } catch (directError: any) {
          console.error("Telegram Network Error (Direct):", directError);
          // Only return false after both attempts fail
          return false;
      }
    }
  };

  // 3. Split message if too long (Telegram limit is 4096, we use 4000 for safety)
  const MAX_LENGTH = 4000;
  const chunks = [];
  
  for (let i = 0; i < fullMessage.length; i += MAX_LENGTH) {
    chunks.push(fullMessage.substring(i, i + MAX_LENGTH));
  }

  // 4. Send all chunks
  let success = true;
  for (const chunk of chunks) {
    const result = await sendMessageChunk(chunk);
    if (!result) success = false;
    // Small delay between chunks to ensure order
    await new Promise(r => setTimeout(r, 500));
  }

  return success;
}
