import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const REPORT_PATH = path.join(CWD, "state", "knowledge-intake-pipeline-report.json");
const COLLECT_REPORT_PATH = path.join(CWD, "state", "notebooklm-mcp-collect-report.json");

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const safeReadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const sendTelegram = async (token, chatId, text) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ chat_id: String(chatId), text })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram_send_failed(${response.status}): ${body}`);
  }
};

const buildRunUrl = () => {
  const server = env("GITHUB_SERVER_URL", "https://github.com");
  const repo = env("GITHUB_REPOSITORY", "");
  const runId = env("GITHUB_RUN_ID", "");
  if (!repo || !runId) return "";
  return `${server}/${repo}/actions/runs/${runId}`;
};

const classify = (report, collectReport) => {
  if (!report) return { shouldNotify: true, code: "REPORT_MISSING", reason: "knowledge pipeline report missing" };

  const sourceStatus = String(report?.source?.notebooklmStatus || "").trim();
  const sourceReason = String(report?.source?.notebooklmReason || "").trim();
  const required = String(report?.source?.notebooklmRequired || "").trim() === "true";
  const queueCount = Number(report?.queue?.count || 0);
  const overallStatus = String(report?.status || "").trim();
  const collectStatus = String(collectReport?.status || "").trim();
  const collectReason = String(collectReport?.reason || "").trim();

  if (sourceStatus.startsWith("fail") || collectStatus.startsWith("fail")) {
    return {
      shouldNotify: true,
      code: "NOTEBOOKLM_FAIL",
      reason: sourceReason || collectReason || "notebooklm failure",
      sourceStatus,
      collectStatus
    };
  }

  if (
    sourceStatus === "no_items" &&
    /invalid_assistant_meta_answer_for_all_items/i.test(`${sourceReason} ${collectReason}`)
  ) {
    return {
      shouldNotify: true,
      code: "NOTEBOOKLM_INVALID_META",
      reason: sourceReason || collectReason || "all answers invalid meta",
      sourceStatus,
      collectStatus
    };
  }

  if (required && queueCount === 0 && sourceStatus !== "ok") {
    return {
      shouldNotify: true,
      code: "NOTEBOOKLM_REQUIRED_EMPTY",
      reason: sourceReason || "required mode + queue empty",
      sourceStatus,
      collectStatus
    };
  }

  if (overallStatus === "fail") {
    return {
      shouldNotify: true,
      code: "PIPELINE_FAIL",
      reason: sourceReason || "pipeline fail",
      sourceStatus,
      collectStatus
    };
  }

  return {
    shouldNotify: false,
    code: "OK",
    reason: "",
    sourceStatus,
    collectStatus
  };
};

const main = async () => {
  const notifyMode = env("KNOWLEDGE_PIPELINE_ALERT_NOTIFY_ON", "fail").toLowerCase();
  if (notifyMode === "never") {
    console.log("[KNOWLEDGE_ALERT] status=skip_notify_mode_never");
    return;
  }

  const report = safeReadJson(REPORT_PATH);
  const collectReport = safeReadJson(COLLECT_REPORT_PATH);
  const decision = classify(report, collectReport);
  const shouldNotify = notifyMode === "always" ? true : decision.shouldNotify;

  if (!shouldNotify) {
    console.log("[KNOWLEDGE_ALERT] status=skip_ok");
    return;
  }

  const token = env("TELEGRAM_TOKEN", "");
  const chatId = env("TELEGRAM_ALERT_CHAT_ID", "");
  if (!token || !chatId) {
    console.log("[KNOWLEDGE_ALERT] status=skip_missing_telegram_config");
    return;
  }

  const runUrl = buildRunUrl();
  const lines = [];
  lines.push(`[KNOWLEDGE_PIPELINE] ${decision.code}`);
  lines.push(`reason=${decision.reason || "n/a"}`);
  if (decision.sourceStatus) lines.push(`sourceStatus=${decision.sourceStatus}`);
  if (decision.collectStatus) lines.push(`collectStatus=${decision.collectStatus}`);
  lines.push(`report=${path.relative(CWD, REPORT_PATH)}`);
  if (runUrl) lines.push(`run=${runUrl}`);
  const text = lines.join("\n");

  try {
    await sendTelegram(token, chatId, text);
    console.log(`[KNOWLEDGE_ALERT] status=sent code=${decision.code}`);
  } catch (error) {
    console.log(`[KNOWLEDGE_ALERT] status=send_failed reason=${error?.message || error}`);
  }

  // Alert sender is observational; it must not change pipeline exit result.
  if (boolFromEnv("KNOWLEDGE_PIPELINE_ALERT_DEBUG_PRINT", false)) {
    console.log(`[KNOWLEDGE_ALERT] payload=${JSON.stringify({ decision, text })}`);
  }
};

main().catch((error) => {
  console.log(`[KNOWLEDGE_ALERT] status=error reason=${error?.message || error}`);
});
