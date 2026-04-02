import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const DEFAULT_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.json");
const DEFAULT_REPORT_PATH = path.join(CWD, "state", "mcp-smoke-report.json");
const ENV_FILE_CANDIDATES = [
  path.join(CWD, ".env"),
  path.join(CWD, ".vscode", "mcp.env"),
  path.join(CWD, ".vscode", "mcp.env.local")
];

const parseDotEnv = (filePath) => {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || "").trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
};

const buildEnvMap = () => {
  const map = {};
  for (const filePath of ENV_FILE_CANDIDATES) {
    const chunk = parseDotEnv(filePath);
    for (const [key, value] of Object.entries(chunk)) {
      map[key] = value;
    }
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    map[key] = String(value);
  }
  return map;
};

const extractPlaceholders = (value) => {
  const placeholders = new Set();
  const walk = (node) => {
    if (typeof node === "string") {
      const regex = /\$\{([A-Z0-9_]+)\}/g;
      let match = regex.exec(node);
      while (match) {
        placeholders.add(match[1]);
        match = regex.exec(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const item of Object.values(node)) walk(item);
    }
  };
  walk(value);
  return [...placeholders].sort();
};

const resolveBool = (envMap, name, fallback = false) => {
  const raw = String(envMap[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const resolveNotifyOn = (envMap) => {
  const raw = String(envMap.MCP_SMOKE_NOTIFY_ON ?? "never").trim().toLowerCase();
  if (["always", "fail", "never"].includes(raw)) return raw;
  return "never";
};

const formatServerIssues = (row) => {
  if (row.issues.length === 0) return `${row.name}: ok`;
  return `${row.name}: ${row.issues.join("; ")}`;
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

const main = async () => {
  const envMap = buildEnvMap();
  const configPath = String(envMap.MCP_CONFIG_PATH ?? DEFAULT_CONFIG_PATH).trim() || DEFAULT_CONFIG_PATH;
  const reportPath = String(envMap.MCP_SMOKE_REPORT_PATH ?? DEFAULT_REPORT_PATH).trim() || DEFAULT_REPORT_PATH;
  const notifyOn = resolveNotifyOn(envMap);
  const quietPass = resolveBool(envMap, "MCP_SMOKE_QUIET_PASS", false);

  if (!fs.existsSync(configPath)) {
    throw new Error(`missing ${path.relative(CWD, configPath)}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const servers = config?.servers && typeof config.servers === "object" ? config.servers : {};
  const rows = [];

  for (const [name, def] of Object.entries(servers)) {
    const issues = [];
    const type = String(def?.type || "").trim() || "command";
    if (type === "http") {
      const url = String(def?.url || "").trim();
      if (!url) {
        issues.push("missing_http_url");
      } else if (!/^https?:\/\//.test(url)) {
        issues.push("invalid_http_url");
      }
    } else if (type === "command") {
      const cmd = String(def?.command || "").trim();
      const args = Array.isArray(def?.args) ? def.args : [];
      if (!cmd) issues.push("missing_command");
      if (!Array.isArray(def?.args)) issues.push("missing_args_array");
      if (Array.isArray(def?.args) && args.length === 0) issues.push("empty_args_array");
    } else {
      issues.push(`unsupported_type(${type})`);
    }

    const placeholders = extractPlaceholders(def);
    const missingEnv = placeholders.filter((key) => !String(envMap[key] ?? "").trim());
    if (missingEnv.length > 0) {
      issues.push(`missing_env(${missingEnv.join(",")})`);
    }

    rows.push({
      name,
      type,
      status: issues.length === 0 ? "PASS" : "FAIL",
      issues
    });
  }

  const failed = rows.filter((row) => row.status === "FAIL");
  const passed = rows.filter((row) => row.status === "PASS");
  const overall = failed.length > 0 ? "FAIL" : "PASS";

  const report = {
    generatedAt: new Date().toISOString(),
    configPath: path.relative(CWD, configPath),
    reportPath: path.relative(CWD, reportPath),
    notifyOn,
    overall,
    totals: {
      servers: rows.length,
      passed: passed.length,
      failed: failed.length
    },
    results: rows
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[MCP_SMOKE] overall=${overall} servers=${rows.length} passed=${passed.length} failed=${failed.length} report=${path.relative(
      CWD,
      reportPath
    )}`
  );
  if (failed.length > 0 || !quietPass) {
    for (const row of rows) {
      console.log(`[MCP_SMOKE] ${formatServerIssues(row)}`);
    }
  }

  const shouldNotify = notifyOn === "always" || (notifyOn === "fail" && failed.length > 0);
  if (shouldNotify) {
    const token = String(envMap.TELEGRAM_TOKEN || "").trim();
    const chatId = String(envMap.TELEGRAM_SIMULATION_CHAT_ID || envMap.TELEGRAM_CHAT_ID || "").trim();
    if (!token || !chatId) {
      console.log("[MCP_SMOKE] telegram_notify_skipped: missing TELEGRAM_TOKEN or TELEGRAM_SIMULATION_CHAT_ID");
    } else {
      const failedNames = failed.map((row) => row.name).join(", ") || "none";
      const text = [
        `[MCP_HEALTH] ${overall}`,
        `servers=${rows.length} passed=${passed.length} failed=${failed.length}`,
        `failed_servers=${failedNames}`,
        `report=${path.relative(CWD, reportPath)}`
      ].join("\n");
      try {
        await sendTelegram(token, chatId, text);
        console.log("[MCP_SMOKE] telegram_notify_sent");
      } catch (error) {
        console.log(`[MCP_SMOKE] telegram_notify_failed: ${error?.message || error}`);
      }
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[MCP_SMOKE] fail: ${error?.message || error}`);
  process.exit(1);
});
