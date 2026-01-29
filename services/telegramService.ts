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
  const fullMessage = header + reportContent;

  // 2. Helper to send chunks
  const sendMessageChunk = async (text: string, useMarkdown = true): Promise<boolean> => {
    const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
    try {
      const body: any = {
        chat_id: CHAT_ID,
        text: text,
      };
      if (useMarkdown) body.parse_mode = 'Markdown';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const json = await res.json();
      
      // If Markdown fails (400 Bad Request usually due to unclosed tags), retry as Plain Text
      if (!res.ok && useMarkdown && json.description?.includes('parse')) {
        console.warn("Telegram Markdown Parse Error. Retrying as Plain Text...");
        return sendMessageChunk(text, false);
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
