
import { TELEGRAM_CONFIG } from "../constants";

/**
 * Sends a message to the configured Telegram Chat.
 * Automatically handles long messages and retries with plain text if Markdown fails.
 */
export async function sendTelegramReport(reportContent: string): Promise<boolean> {
  const { TOKEN, CHAT_ID } = TELEGRAM_CONFIG;
  if (!TOKEN || !CHAT_ID) {
    console.error("Telegram Credentials Missing");
    return false;
  }

  // 1. Prepare Header
  const today = new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const header = `🚀 *US Alpha Seeker Report* 🚀\n📅 ${today}\n\n`;
  
  // Clean up standard Markdown to Telegram Legacy Markdown if possible
  // Replace **bold** with *bold* for Telegram compatibility
  const cleanReport = reportContent.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  const fullMessage = header + cleanReport;

  // 2. Helper to send chunks via Proxy
  const sendMessageChunk = async (text: string, useMarkdown = true): Promise<boolean> => {
    // Use internal proxy to avoid CORS issues
    const url = `/api/telegram`; 
    
    try {
      const payload: any = {
        chat_id: CHAT_ID,
        text: text,
      };
      if (useMarkdown) payload.parse_mode = 'Markdown';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: TOKEN,
            method: 'sendMessage',
            body: payload
        })
      });

      const json = await res.json();
      
      // If Markdown fails (400 Bad Request usually due to unclosed tags or invalid syntax), retry as Plain Text
      if (!res.ok && useMarkdown && (json.description?.includes('parse') || json.description?.includes('can\'t parse'))) {
        console.warn("Telegram Markdown Parse Error. Retrying as Plain Text...");
        return sendMessageChunk(text, false);
      }

      if (!res.ok) {
          console.error("Telegram API Error:", json);
      }

      return res.ok;
    } catch (e) {
      console.error("Telegram Network Error:", e);
      return false;
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
