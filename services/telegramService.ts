
import { TELEGRAM_CONFIG, STRATEGY_CONFIG } from "../constants";

/**
 * Sends a message to the configured Telegram Chat.
 * Automatically handles long messages and retries with plain text if Markdown fails.
 * Includes Fallback for CI/Preview environments where /api proxy is unavailable.
 */
export async function sendTelegramReport(reportContent: string): Promise<boolean> {
  return sendTelegramReportToChat(reportContent, TELEGRAM_CONFIG.CHAT_ID, "PRIMARY");
}

/**
 * Sends simulation/backtest messages to dedicated simulation channel.
 */
export async function sendSimulationTelegramReport(reportContent: string): Promise<boolean> {
  const target = TELEGRAM_CONFIG.SIMULATION_CHAT_ID || TELEGRAM_CONFIG.CHAT_ID;
  return sendTelegramReportToChat(reportContent, target, "SIMULATION");
}

async function sendTelegramReportToChat(reportContent: string, chatId: string, channelTag: string): Promise<boolean> {
  const { TOKEN } = TELEGRAM_CONFIG;
  // Mask token for log safety
  const maskedToken = TOKEN ? `${TOKEN.substring(0, 5)}...` : 'MISSING';
  console.log(`[Telegram:${channelTag}] Initializing transmission to Chat ID: ${chatId}. Token Status: ${maskedToken}`);

  if (!TOKEN || !chatId) {
    console.error(`Telegram Credentials Missing (${channelTag}). Check .env or constants.ts.`);
    return false;
  }
  const fullMessage = buildTelegramMessage(reportContent);

  // 2. Helper to send chunks with RETRY LOGIC
  const sendMessageChunk = async (text: string, useMarkdown = true, attempt = 1): Promise<boolean> => {
    const payload: any = { chat_id: chatId, text: text };
    if (useMarkdown) payload.parse_mode = 'Markdown';

    // Helper for fetch with timeout
    const fetchWithTimeout = (url: string, options: any, timeout = 10000) => {
        return Promise.race([
            fetch(url, options),
            new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeout))
        ]);
    };

    try {
      // ATTEMPT 1: Internal Proxy
      const proxyUrl = `/api/telegram`;
      const res = await fetchWithTimeout(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, method: 'sendMessage', body: payload })
      });

      if (res.status === 404) throw new Error("Proxy 404");
      
      const json = await res.json();
      if (!res.ok) {
         console.warn(`[Telegram Proxy:${channelTag}] Failed: ${json.description}`);
         if (useMarkdown && json.description?.includes('parse')) {
             return sendMessageChunk(text, false, attempt); // Retry without Markdown
         }
         throw new Error(json.description);
      }
      return true;

    } catch (proxyError: any) {
      // ATTEMPT 2: Direct API Call (Fallback)
      console.warn(`Telegram Proxy Failed (${channelTag}, ${proxyError.message}), attempting Direct API...`);
      try {
          const directUrl = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
          const res = await fetchWithTimeout(directUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });

          const json = await res.json();
          if (!res.ok) {
             if (useMarkdown && json.description?.includes('parse')) {
                 return sendMessageChunk(text, false, attempt);
             }
             return false;
          }
          return true;
      } catch (directError: any) {
          console.error(`Telegram Direct Failed (${channelTag}):`, directError);
          
          // Final Retry (Max 2 attempts)
          if (attempt < 2) {
              await new Promise(r => setTimeout(r, 2000));
              return sendMessageChunk(text, useMarkdown, attempt + 1);
          }
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

  // 4. Send all chunks with delay
  let success = true;
  for (const chunk of chunks) {
    const result = await sendMessageChunk(chunk);
    if (!result) success = false;
    // Increased delay to 1.5s to prevent rate limiting & race conditions
    await new Promise(r => setTimeout(r, 1500));
  }

  return success;
}

/**
 * Build final Telegram payload text used by both transmission and Drive archive.
 * Keeping one formatter ensures "sent message" and "archived report" stay identical.
 */
export function buildTelegramMessage(reportContent: string): string {
  const header = `🚀 *US Alpha Seeker Report* 🚀\n\n`;

  // Clean up standard Markdown to Telegram Legacy Markdown if possible
  // Telegram MarkdownV2 requires escaping specific characters if not in code blocks, but it's complex.
  // Standard 'Markdown' mode is safer but limited. We'll try to keep it simple.
  let cleanReport = reportContent.replace(/\*\*(.*?)\*\*/g, '*$1*');

  // [FIX] Remove citations like [1], [2], [1][2] globally from the final message
  cleanReport = cleanReport.replace(/\[\d+(?:,\s*\d+)*\]/g, '');

  // [VISUAL ENHANCEMENT] Apply Strategy-Based Emojis
  const rsiRegex = /RSI[:\s]*(\d+)/gi;
  cleanReport = cleanReport.replace(rsiRegex, (match, rsiVal) => {
    const val = parseInt(rsiVal);
    if (val > STRATEGY_CONFIG.RSI_PENALTY_THRESHOLD) return `${match} 🚨`;
    return match;
  });

  const pegRegex = /PEG[:\s]*([0-9.]+)/gi;
  cleanReport = cleanReport.replace(pegRegex, (match, pegVal) => {
    const val = parseFloat(pegVal);
    if (val < 0.3 && val > 0) return `${match} 💎`;
    return match;
  });

  // Market Mode Header (VIX numeric sync only)
  let finalHeader = header;
  const vixFromMarketLine =
    cleanReport.match(/\|\s*VIX\s*:\s*(-?\d+(?:\.\d+)?)\s*\)/i) ||
    cleanReport.match(/\bVIX\s*[:：]\s*(-?\d+(?:\.\d+)?)(?!\s*\/)/i);
  const vixNumeric = vixFromMarketLine ? Number(vixFromMarketLine[1]) : NaN;
  if (Number.isFinite(vixNumeric) && vixNumeric >= STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL) {
    finalHeader += `🛡️ *[RISK-OFF MODE DETECTED]* 🛡️\n(VIX ${vixNumeric.toFixed(2)} >= ${STRATEGY_CONFIG.VIX_RISK_OFF_LEVEL})\n\n`;
  }

  if (cleanReport.includes("Sector Concentration")) {
    cleanReport = cleanReport.replace(/(⚠️ Sector Concentration:.*)/g, '*$1*');
  }

  // Safety: If the AI accidentally included the header, remove it to prevent duplication
  cleanReport = cleanReport.replace(/🚀.*?Report.*?🚀/gi, '').trim();

  return finalHeader + cleanReport;
}
