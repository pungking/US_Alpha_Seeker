/**
 * Vercel Serverless Function: Telegram Bot Webhook Handler
 * 
 * Receives incoming Telegram Bot updates (commands) and processes them.
 * Supports: /approve, /reject, /status, /emergency, /help
 * 
 * Webhook Setup:
 *   POST https://api.telegram.org/bot<TOKEN>/setWebhook
 *   Body: { "url": "https://us-alpha-seeker.vercel.app/api/telegram_webhook", "secret_token": "<WEBHOOK_SECRET>" }
 *
 * Security:
 *   - Validates X-Telegram-Bot-Api-Secret-Token header
 *   - Only processes commands from TELEGRAM_ADMIN_CHAT_ID
 */

import { captureApiError, withSentryApi } from "./sentryApiNode.js";

// ─── Types ───────────────────────────────────────────────────────────────────

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string; is_bot?: boolean };
    chat?: { id: number; type?: string };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id: number };
    message?: { chat?: { id: number }; message_id?: number };
    data?: string;
  };
};

type CommandContext = {
  chatId: number;
  userId: number;
  username: string;
  text: string;
  command: string;
  args: string[];
  messageId: number;
};

// ─── Environment Helpers ─────────────────────────────────────────────────────

const env = (key: string, fallback = ""): string =>
  String(process.env[key] ?? process.env[`VITE_${key}`] ?? fallback).trim();

const readAdminChatIds = (): Set<number> => {
  const raw = env("TELEGRAM_ADMIN_CHAT_ID", env("TELEGRAM_CHAT_ID"));
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))
  );
};

// ─── Telegram API Helper ─────────────────────────────────────────────────────

async function sendMessage(chatId: number, text: string, options: Record<string, unknown> = {}): Promise<boolean> {
  const token = env("TELEGRAM_TOKEN");
  if (!token) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...options,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  const token = env("TELEGRAM_TOKEN");
  if (!token) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
    });
  } catch { /* best-effort */ }
}

// ─── Approval Queue (Google Drive) ───────────────────────────────────────────

type ApprovalRecord = {
  id: string;
  type: "trade" | "param_change" | "live_switch";
  symbol?: string;
  side?: string;
  notional?: number;
  limitPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  detail: string;
  status: "pending" | "approved" | "rejected" | "expired";
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  stage6Hash?: string;
  ttlMinutes: number;
};

type ApprovalQueueState = {
  queue: ApprovalRecord[];
  updatedAt: string;
};

async function getGoogleAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: env("GDRIVE_CLIENT_ID"),
    client_secret: env("GDRIVE_CLIENT_SECRET"),
    refresh_token: env("GDRIVE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Token refresh failed (${response.status})`);
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Missing access_token");
  return data.access_token;
}

async function loadApprovalQueue(): Promise<ApprovalQueueState> {
  const rootFolderId = env("GDRIVE_ROOT_FOLDER_ID");
  if (!rootFolderId) return { queue: [], updatedAt: new Date().toISOString() };

  try {
    const token = await getGoogleAccessToken();
    const query = encodeURIComponent(
      `name = 'APPROVAL_QUEUE.json' and '${rootFolderId}' in parents and trashed = false`
    );
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!listRes.ok) return { queue: [], updatedAt: new Date().toISOString() };
    const listData = (await listRes.json()) as { files?: Array<{ id: string }> };
    const fileId = listData.files?.[0]?.id;
    if (!fileId) return { queue: [], updatedAt: new Date().toISOString() };

    const dlRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) return { queue: [], updatedAt: new Date().toISOString() };
    const text = await dlRes.text();
    return JSON.parse(text) as ApprovalQueueState;
  } catch {
    return { queue: [], updatedAt: new Date().toISOString() };
  }
}

async function saveApprovalQueue(state: ApprovalQueueState): Promise<boolean> {
  const rootFolderId = env("GDRIVE_ROOT_FOLDER_ID");
  if (!rootFolderId) return false;

  try {
    const token = await getGoogleAccessToken();
    const fileName = "APPROVAL_QUEUE.json";
    const query = encodeURIComponent(
      `name = '${fileName}' and '${rootFolderId}' in parents and trashed = false`
    );
    const listRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const listData = (await listRes.json()) as { files?: Array<{ id: string }> };
    const existingId = listData.files?.[0]?.id;

    const metadata = { name: fileName, mimeType: "application/json", parents: existingId ? undefined : [rootFolderId] };
    const boundary = "----ApprovalQueueBoundary";
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json",
      "",
      JSON.stringify(state, null, 2),
      `--${boundary}--`,
    ].join("\r\n");

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    const method = existingId ? "PATCH" : "POST";

    const uploadRes = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    return uploadRes.ok;
  } catch {
    return false;
  }
}

// ─── Command Handlers ────────────────────────────────────────────────────────

async function handleHelp(ctx: CommandContext): Promise<void> {
  const helpText = `🤖 *US Alpha Seeker Control Bot*

📋 *사용 가능한 명령어:*
\`/status\` — 현재 대기 중인 승인 요청 조회
\`/approve [ID|all]\` — 매매 요청 승인
\`/reject [ID|all]\` — 매매 요청 거부
\`/emergency\` — 🚨 전체 포지션 긴급 청산
\`/help\` — 이 도움말 표시

⚙️ *시스템 정보:*
• Admin Chat IDs: ${Array.from(readAdminChatIds()).join(", ")}
• Webhook: Active ✅`;

  await sendMessage(ctx.chatId, helpText);
}

async function handleStatus(ctx: CommandContext): Promise<void> {
  try {
    const state = await loadApprovalQueue();
    const pending = state.queue.filter((r) => r.status === "pending");

    // Expire stale records
    const now = Date.now();
    let expiredCount = 0;
    for (const record of pending) {
      const requestedAt = new Date(record.requestedAt).getTime();
      if (now - requestedAt > record.ttlMinutes * 60 * 1000) {
        record.status = "expired";
        expiredCount++;
      }
    }
    if (expiredCount > 0) await saveApprovalQueue(state);

    const activePending = state.queue.filter((r) => r.status === "pending");
    if (activePending.length === 0) {
      await sendMessage(ctx.chatId, "✅ *현재 대기 중인 승인 요청이 없습니다.*\n\n시스템이 정상 작동 중입니다.");
      return;
    }

    const lines = activePending.map((r, i) => {
      const sym = r.symbol ? ` ${r.symbol}` : "";
      const price = r.limitPrice ? ` @$${r.limitPrice.toFixed(2)}` : "";
      const size = r.notional ? ` $${r.notional.toFixed(0)}` : "";
      return `${i + 1}) \`${r.id}\` — ${r.type}${sym}${price}${size}\n   📝 ${r.detail}`;
    });

    const msg = `⏳ *대기 중인 승인 요청 (${activePending.length}건)*\n\n${lines.join("\n\n")}\n\n💡 승인: \`/approve ID\` 또는 \`/approve all\`\n❌ 거부: \`/reject ID\` 또는 \`/reject all\``;
    await sendMessage(ctx.chatId, msg);
  } catch (error: any) {
    await sendMessage(ctx.chatId, `❌ *상태 조회 실패*\n\`${error.message}\``);
  }
}

async function handleApprove(ctx: CommandContext): Promise<void> {
  const target = ctx.args[0]?.toLowerCase();
  if (!target) {
    await sendMessage(ctx.chatId, "⚠️ 사용법: `/approve ID` 또는 `/approve all`");
    return;
  }

  try {
    const state = await loadApprovalQueue();
    const pending = state.queue.filter((r) => r.status === "pending");

    if (pending.length === 0) {
      await sendMessage(ctx.chatId, "✅ 대기 중인 승인 요청이 없습니다.");
      return;
    }

    let approved: ApprovalRecord[] = [];
    if (target === "all") {
      approved = pending;
    } else {
      const found = pending.find((r) => r.id === target || r.id.startsWith(target));
      if (!found) {
        await sendMessage(ctx.chatId, `❌ ID \`${target}\`에 해당하는 대기 요청을 찾을 수 없습니다.`);
        return;
      }
      approved = [found];
    }

    const now = new Date().toISOString();
    for (const record of approved) {
      record.status = "approved";
      record.resolvedAt = now;
      record.resolvedBy = ctx.username || `user_${ctx.userId}`;
    }

    state.updatedAt = now;
    await saveApprovalQueue(state);

    const symbols = approved.map((r) => r.symbol || r.type).join(", ");
    await sendMessage(
      ctx.chatId,
      `✅ *${approved.length}건 승인 완료*\n\n승인됨: ${symbols}\n승인자: @${ctx.username || ctx.userId}\n시각: ${now}\n\n실행 엔진이 다음 사이클에 주문을 처리합니다.`
    );
  } catch (error: any) {
    await sendMessage(ctx.chatId, `❌ *승인 처리 실패*\n\`${error.message}\``);
  }
}

async function handleReject(ctx: CommandContext): Promise<void> {
  const target = ctx.args[0]?.toLowerCase();
  if (!target) {
    await sendMessage(ctx.chatId, "⚠️ 사용법: `/reject ID` 또는 `/reject all`");
    return;
  }

  try {
    const state = await loadApprovalQueue();
    const pending = state.queue.filter((r) => r.status === "pending");

    if (pending.length === 0) {
      await sendMessage(ctx.chatId, "✅ 대기 중인 승인 요청이 없습니다.");
      return;
    }

    let rejected: ApprovalRecord[] = [];
    if (target === "all") {
      rejected = pending;
    } else {
      const found = pending.find((r) => r.id === target || r.id.startsWith(target));
      if (!found) {
        await sendMessage(ctx.chatId, `❌ ID \`${target}\`에 해당하는 대기 요청을 찾을 수 없습니다.`);
        return;
      }
      rejected = [found];
    }

    const now = new Date().toISOString();
    for (const record of rejected) {
      record.status = "rejected";
      record.resolvedAt = now;
      record.resolvedBy = ctx.username || `user_${ctx.userId}`;
    }

    state.updatedAt = now;
    await saveApprovalQueue(state);

    const symbols = rejected.map((r) => r.symbol || r.type).join(", ");
    await sendMessage(
      ctx.chatId,
      `❌ *${rejected.length}건 거부 완료*\n\n거부됨: ${symbols}\n처리자: @${ctx.username || ctx.userId}`
    );
  } catch (error: any) {
    await sendMessage(ctx.chatId, `❌ *거부 처리 실패*\n\`${error.message}\``);
  }
}

async function handleEmergency(ctx: CommandContext): Promise<void> {
  const confirmed = ctx.args[0]?.toLowerCase() === "confirm";

  if (!confirmed) {
    await sendMessage(
      ctx.chatId,
      `🚨 *긴급 청산 확인 필요*\n\n이 명령은 모든 포지션을 즉시 청산하고 미체결 주문을 취소합니다.\n\n⚠️ *확인하려면:* \`/emergency confirm\``
    );
    return;
  }

  try {
    // Write emergency flag to Drive for exec engine to pick up
    const state = await loadApprovalQueue();
    const emergencyRecord: ApprovalRecord = {
      id: `EMG_${Date.now()}`,
      type: "param_change",
      detail: "🚨 EMERGENCY FLATTEN ALL — User initiated",
      status: "approved",
      requestedAt: new Date().toISOString(),
      resolvedAt: new Date().toISOString(),
      resolvedBy: ctx.username || `user_${ctx.userId}`,
      ttlMinutes: 60,
    };
    state.queue.push(emergencyRecord);
    state.updatedAt = new Date().toISOString();

    // Also write a dedicated emergency signal file
    const token = await getGoogleAccessToken();
    const rootFolderId = env("GDRIVE_ROOT_FOLDER_ID");
    if (token && rootFolderId) {
      const emergencyPayload = {
        action: "FLATTEN_ALL",
        requestedBy: ctx.username || `user_${ctx.userId}`,
        requestedAt: new Date().toISOString(),
        reason: "User Emergency Command via Telegram",
      };
      const boundary = "----EmergencyBoundary";
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({ name: "EMERGENCY_SIGNAL.json", mimeType: "application/json", parents: [rootFolderId] }),
        `--${boundary}`,
        "Content-Type: application/json",
        "",
        JSON.stringify(emergencyPayload, null, 2),
        `--${boundary}--`,
      ].join("\r\n");

      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });
    }

    await saveApprovalQueue(state);
    await sendMessage(
      ctx.chatId,
      `🚨 *긴급 청산 명령 전송됨*\n\n처리자: @${ctx.username || ctx.userId}\n시각: ${new Date().toISOString()}\n\n실행 엔진이 다음 사이클에 모든 포지션을 청산합니다.\n추가로 Market Guard에 L3 강제 설정됩니다.`
    );
  } catch (error: any) {
    await sendMessage(ctx.chatId, `❌ *긴급 청산 처리 실패*\n\`${error.message}\`\n\n수동으로 Alpaca에서 직접 청산하세요.`);
  }
}

// ─── Command Router ──────────────────────────────────────────────────────────

const COMMANDS: Record<string, (ctx: CommandContext) => Promise<void>> = {
  "/help": handleHelp,
  "/start": handleHelp,
  "/status": handleStatus,
  "/approve": handleApprove,
  "/reject": handleReject,
  "/emergency": handleEmergency,
};

function parseCommand(text: string): { command: string; args: string[] } | null {
  if (!text || !text.startsWith("/")) return null;
  // Strip @botname suffix: /approve@MyBot arg1 → /approve arg1
  const parts = text.split(/\s+/);
  const rawCmd = parts[0].split("@")[0].toLowerCase();
  return { command: rawCmd, args: parts.slice(1) };
}

// ─── Main Handler ────────────────────────────────────────────────────────────

const handler = async (req: any, res: any) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Telegram-Bot-Api-Secret-Token");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // ── Security: Validate Webhook Secret Token ──
  const webhookSecret = env("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    const headerSecret = req.headers["x-telegram-bot-api-secret-token"] || "";
    if (headerSecret !== webhookSecret) {
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  // ── Parse Update ──
  const update: TelegramUpdate = req.body;
  if (!update || !update.update_id) return res.status(200).json({ ok: true });

  // Handle callback queries (inline keyboard buttons)
  if (update.callback_query) {
    const cbData = update.callback_query.data || "";
    const cbChatId = update.callback_query.message?.chat?.id;
    const cbUserId = update.callback_query.from?.id;
    if (cbChatId && cbUserId) {
      const adminIds = readAdminChatIds();
      if (adminIds.has(cbChatId) || adminIds.has(cbUserId)) {
        const parsed = parseCommand(`/${cbData}`);
        if (parsed) {
          const ctx: CommandContext = {
            chatId: cbChatId,
            userId: cbUserId,
            username: String(update.callback_query.from?.id || ""),
            text: cbData,
            command: parsed.command,
            args: parsed.args,
            messageId: update.callback_query.message?.message_id || 0,
          };
          const handler = COMMANDS[parsed.command];
          if (handler) {
            await answerCallbackQuery(update.callback_query.id, "처리 중...");
            await handler(ctx);
          }
        }
      }
    }
    return res.status(200).json({ ok: true });
  }

  // Handle text messages
  const message = update.message;
  if (!message?.text || !message.chat?.id || !message.from?.id) {
    return res.status(200).json({ ok: true });
  }

  // ── Authorization: Only allow admin chat IDs ──
  const adminIds = readAdminChatIds();
  if (!adminIds.has(message.chat.id) && !adminIds.has(message.from.id)) {
    console.warn(`[WEBHOOK] Unauthorized access attempt from chat=${message.chat.id} user=${message.from.id}`);
    return res.status(200).json({ ok: true }); // 200 to prevent Telegram retry
  }

  // ── Route Command ──
  const parsed = parseCommand(message.text);
  if (!parsed) return res.status(200).json({ ok: true });

  const ctx: CommandContext = {
    chatId: message.chat.id,
    userId: message.from.id,
    username: message.from.username || message.from.first_name || `user_${message.from.id}`,
    text: message.text,
    command: parsed.command,
    args: parsed.args,
    messageId: message.message_id,
  };

  const commandHandler = COMMANDS[ctx.command];
  if (commandHandler) {
    try {
      await commandHandler(ctx);
    } catch (error: any) {
      console.error(`[WEBHOOK] Command error: ${ctx.command}`, error);
      captureApiError(error, { source: "telegram_webhook", command: ctx.command });
      await sendMessage(ctx.chatId, `❌ 명령 처리 중 오류: \`${error.message}\``);
    }
  } else {
    await sendMessage(ctx.chatId, `❓ 알 수 없는 명령: \`${ctx.command}\`\n\n도움말: /help`);
  }

  return res.status(200).json({ ok: true });
};

export default withSentryApi(handler);
