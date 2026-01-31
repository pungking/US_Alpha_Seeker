
import { TELEGRAM_CONFIG } from "../constants";

export async function sendTelegramReport(reportContent: string): Promise<boolean> {
  const { TOKEN, CHAT_ID } = TELEGRAM_CONFIG;
  if (!TOKEN || !CHAT_ID) {
    console.error("Telegram Credentials Missing");
    return false;
  }

  const header = `🚀 *US Alpha Seeker Report* 🚀\n\n`;
  
  const cleanReport = reportContent.replace(/\*\*(.*?)\*\*/g, '*$1*');
  
  const fullMessage = header + cleanReport;

  const sendMessageChunk = async (text: string, useMarkdown = true): Promise<boolean> => {
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

  const MAX_LENGTH = 4000;
  const chunks = [];
  
  for (let i = 0; i < fullMessage.length; i += MAX_LENGTH) {
    chunks.push(fullMessage.substring(i, i + MAX_LENGTH));
  }

  let success = true;
  for (const chunk of chunks) {
    const result = await sendMessageChunk(chunk);
    if (!result) success = false;
    await new Promise(r => setTimeout(r, 500));
  }

  return success;
}
