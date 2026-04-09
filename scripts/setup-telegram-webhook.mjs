#!/usr/bin/env node
/**
 * Telegram Webhook Setup Script
 * 
 * Registers the Vercel webhook URL with the Telegram Bot API.
 * 
 * Usage:
 *   node scripts/setup-telegram-webhook.mjs
 *   node scripts/setup-telegram-webhook.mjs --delete   (remove webhook)
 *   node scripts/setup-telegram-webhook.mjs --info     (show current webhook status)
 * 
 * Required env vars:
 *   TELEGRAM_TOKEN        - Bot API token
 *   TELEGRAM_WEBHOOK_SECRET - Secret for header validation (optional but recommended)
 * 
 * Optional:
 *   WEBHOOK_URL           - Override webhook URL (default: production URL)
 */
const PRODUCTION_URL = "https://us-alpha-seeker.vercel.app";
async function main() {
  const token = (process.env.TELEGRAM_TOKEN || process.env.VITE_TELEGRAM_TOKEN || "").trim();
  if (!token) {
    console.error("❌ TELEGRAM_TOKEN is required.");
    process.exit(1);
  }
  const action = process.argv[2] || "--set";
  const baseApi = `https://api.telegram.org/bot${token}`;
  // ── Info ──
  if (action === "--info") {
    const res = await fetch(`${baseApi}/getWebhookInfo`);
    const data = await res.json();
    console.log("📋 Current Webhook Info:");
    console.log(JSON.stringify(data.result || data, null, 2));
    return;
  }
  // ── Delete ──
  if (action === "--delete") {
    const res = await fetch(`${baseApi}/deleteWebhook`);
    const data = await res.json();
    console.log(data.ok ? "✅ Webhook deleted." : `❌ Delete failed: ${JSON.stringify(data)}`);
    return;
  }
  // ── Set Webhook ──
  const webhookUrl = (process.env.WEBHOOK_URL || `${PRODUCTION_URL}/api/telegram_webhook`).trim();
  const webhookSecret = (process.env.TELEGRAM_WEBHOOK_SECRET || process.env.VITE_TELEGRAM_WEBHOOK_SECRET || "").trim();
  const body = {
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  };
  if (webhookSecret) {
    body.secret_token = webhookSecret;
  }
  console.log(`🔗 Setting webhook: ${webhookUrl}`);
  if (webhookSecret) console.log(`🔐 Secret token: ${webhookSecret.substring(0, 5)}...`);
  const res = await fetch(`${baseApi}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.ok) {
    console.log("✅ Webhook registered successfully!");
    console.log(`   URL: ${webhookUrl}`);
    console.log(`   Secret: ${webhookSecret ? "Yes" : "No"}`);
    // Also set bot commands menu
    const commands = [
      { command: "status", description: "대기 중인 승인 요청 조회" },
      { command: "approve", description: "매매 요청 승인 (/approve ID|all)" },
      { command: "reject", description: "매매 요청 거부 (/reject ID|all)" },
      { command: "emergency", description: "🚨 전체 포지션 긴급 청산" },
      { command: "help", description: "도움말 표시" },
    ];
    const cmdRes = await fetch(`${baseApi}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    const cmdData = await cmdRes.json();
    console.log(cmdData.ok ? "✅ Bot commands menu updated." : `⚠️ Commands update: ${JSON.stringify(cmdData)}`);
  } else {
    console.error(`❌ Webhook setup failed:`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }
}
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});