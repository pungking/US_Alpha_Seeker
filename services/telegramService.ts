
import { TELEGRAM_CONFIG, STRATEGY_CONFIG } from "../constants";

const parseBooleanEnv = (value: unknown): boolean | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
};

const shouldPreferTelegramDirect = (): boolean => {
  const envDecision = parseBooleanEnv((import.meta as any)?.env?.VITE_TELEGRAM_DIRECT_FIRST);
  if (envDecision !== null) return envDecision;

  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const autoMode = String(params.get("auto") || "").toLowerCase() === "true";
    const isHeadless = /HeadlessChrome/i.test(window.navigator.userAgent || "");
    return autoMode || isHeadless;
  } catch {
    return false;
  }
};

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
  const MAX_LENGTH = 4000;
  const preferDirect = shouldPreferTelegramDirect();
  if (preferDirect) {
    console.log(`[Telegram:${channelTag}] Direct-first mode enabled (automation/headless).`);
  }

  const splitLongSegment = (text: string, maxLen: number): string[] => {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    const lines = text.split('\n');
    let current = '';
    for (const line of lines) {
      const candidate = current ? `${current}\n${line}` : line;
      if (candidate.length <= maxLen) {
        current = candidate;
        continue;
      }
      if (current) {
        chunks.push(current);
        current = '';
      }
      if (line.length <= maxLen) {
        current = line;
        continue;
      }
      for (let i = 0; i < line.length; i += maxLen) {
        chunks.push(line.slice(i, i + maxLen));
      }
    }
    if (current) chunks.push(current);
    return chunks;
  };

  const packSegments = (segments: string[], maxLen: number): string[] => {
    const chunks: string[] = [];
    let current = '';
    for (const raw of segments) {
      const seg = raw.trim();
      if (!seg) continue;
      const candidate = current ? `${current}\n\n${seg}` : seg;
      if (candidate.length <= maxLen) {
        current = candidate;
        continue;
      }
      if (current) {
        chunks.push(current);
        current = '';
      }
      if (seg.length <= maxLen) {
        current = seg;
        continue;
      }
      const split = splitLongSegment(seg, maxLen);
      if (split.length > 1) {
        chunks.push(...split.slice(0, -1));
      }
      current = split[split.length - 1] || '';
    }
    if (current) chunks.push(current);
    return chunks;
  };

  const splitMessageBySections = (message: string, maxLen: number): string[] => {
    const normalized = String(message || '').replace(/\r\n/g, '\n').trim();
    if (normalized.length <= maxLen) return [normalized];

    const sectionAnchors = [
      '\n📊 Market Pulse',
      '\n🧠 Top6 (Model Rank)',
      '\n✅ Executable Picks',
      '\n⏳ Watchlist (실행 대기)',
      '\n[Alpha Signal Guide]'
    ];
    const anchorIndices = sectionAnchors
      .map((anchor) => normalized.indexOf(anchor))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b);

    if (anchorIndices.length === 0) {
      return packSegments(normalized.split(/\n\n+/), maxLen);
    }

    const sections: string[] = [];
    let cursor = 0;
    for (const idx of anchorIndices) {
      if (idx > cursor) {
        sections.push(normalized.slice(cursor, idx));
        cursor = idx;
      }
    }
    sections.push(normalized.slice(cursor));
    return packSegments(sections, maxLen);
  };

  // Helper for fetch with timeout
  const fetchWithTimeout = (url: string, options: any, timeout = 10000) => {
    return Promise.race([
      fetch(url, options),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), timeout))
    ]);
  };

  const sendViaProxy = async (payload: any): Promise<{ ok: boolean; parseError?: boolean; error?: string }> => {
    try {
      const proxyUrl = `/api/telegram`;
      const res = await fetchWithTimeout(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: TOKEN, method: "sendMessage", body: payload })
      });

      if (res.status === 404) {
        return { ok: false, error: "Proxy 404" };
      }

      const json = await res.json();
      if (!res.ok) {
        const description = String(json?.description || "Proxy request failed");
        return { ok: false, parseError: /parse/i.test(description), error: description };
      }

      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: String(error?.message || error || "Proxy error") };
    }
  };

  const sendViaDirect = async (payload: any): Promise<{ ok: boolean; parseError?: boolean; error?: string }> => {
    try {
      const directUrl = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
      const res = await fetchWithTimeout(directUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok) {
        const description = String(json?.description || "Direct request failed");
        return { ok: false, parseError: /parse/i.test(description), error: description };
      }

      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: String(error?.message || error || "Direct error") };
    }
  };

  // 2. Helper to send chunks with RETRY LOGIC
  const sendMessageChunk = async (text: string, useMarkdown = true, attempt = 1): Promise<boolean> => {
    const payload: any = { chat_id: chatId, text };
    if (useMarkdown) payload.parse_mode = "Markdown";

    const order: Array<"direct" | "proxy"> = preferDirect ? ["direct", "proxy"] : ["proxy", "direct"];
    let lastError = "unknown";

    for (const channel of order) {
      const result = channel === "direct" ? await sendViaDirect(payload) : await sendViaProxy(payload);
      if (result.ok) return true;

      if (result.parseError && useMarkdown) {
        return sendMessageChunk(text, false, attempt);
      }

      lastError = result.error || lastError;
      if (channel === "proxy" && preferDirect && lastError === "Proxy 404") {
        // Expected in automation mode when Vite dev server does not expose /api routes.
        console.info(`[Telegram:${channelTag}] Proxy unavailable (404). Direct path already attempted.`);
      } else if (channel === "proxy") {
        console.warn(`[Telegram Proxy:${channelTag}] Failed: ${lastError}`);
      } else {
        console.warn(`[Telegram Direct:${channelTag}] Failed: ${lastError}`);
      }
    }

    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 2000));
      return sendMessageChunk(text, useMarkdown, attempt + 1);
    }
    return false;
  };

  // 3. Split message by logical sections first (then safe fallback splits)
  const chunks = splitMessageBySections(fullMessage, MAX_LENGTH);

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
  const compactGuide = `[Alpha Signal Guide]
• 우선순위: 지금 진입 가능 종목 중 XS/RR/ER 높은 순서
• 가격 대기/제외: 종목 폐기가 아니라 조건 미충족(대기)
• 배지 핵심: 💎 저평가 잠재, 🏢 기관 수급, 🔥 추세 강세
• 리스크: VIX 고변동/실적 근접 구간은 보수 대응 + Stop 엄수`;
  const ultraCompactGuide = `[Alpha Signal Guide]
• 지금 진입 가능 우선, 가격 대기/제외는 대기
• XS/RR/ER 확인 후 진입, Stop 엄수`;

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

  // Keep message within Telegram single-message range whenever possible.
  const guidePattern = /\[Alpha Signal Guide\][\s\S]*$/m;
  let previewMessage = finalHeader + cleanReport;
  if (previewMessage.length > 3900 && guidePattern.test(cleanReport)) {
    cleanReport = cleanReport.replace(guidePattern, compactGuide);
    previewMessage = finalHeader + cleanReport;
  }
  if (previewMessage.length > 4000 && guidePattern.test(cleanReport)) {
    cleanReport = cleanReport.replace(guidePattern, ultraCompactGuide);
  }

  return finalHeader + cleanReport;
}
