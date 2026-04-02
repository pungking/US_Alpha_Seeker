import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const DEFAULT_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.json");
const OPTIONAL_TEMPLATE_PATH = path.join(CWD, ".vscode", "mcp.online.template.json");
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

const ENV_MAP = buildEnvMap();

const env = (name, fallback = "") => String(ENV_MAP[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `file_not_found: ${path.relative(CWD, filePath)}` };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `json_parse_failed: ${error?.message || error}` };
  }
};

const walkStrings = (value, onString) => {
  if (typeof value === "string") {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, onString));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => walkStrings(item, onString));
  }
};

const extractEnvPlaceholders = (value) => {
  const found = new Set();
  const pattern = /\$\{([A-Z0-9_]+)\}/g;
  walkStrings(value, (text) => {
    let match = pattern.exec(text);
    while (match) {
      found.add(match[1]);
      match = pattern.exec(text);
    }
    pattern.lastIndex = 0;
  });
  return [...found].sort();
};

const summarizeServers = (config) => {
  const servers = config?.servers && typeof config.servers === "object" ? config.servers : {};
  return Object.entries(servers).map(([name, def]) => {
    const type = String(def?.type || "").trim() || "command";
    const mode = type === "http" ? `http:${String(def?.url || "N/A")}` : `command:${String(def?.command || "N/A")}`;
    return { name, mode };
  });
};

const printServerSummary = (rows, label) => {
  if (!rows.length) {
    console.log(`[MCP_CHECK] ${label}: no servers configured`);
    return;
  }
  console.log(`[MCP_CHECK] ${label}: ${rows.length} server(s)`);
  for (const row of rows) {
    console.log(`- ${row.name}: ${row.mode}`);
  }
};

const main = () => {
  const strict = boolFromEnv("MCP_CHECK_STRICT", false);
  const configPath = env("MCP_CONFIG_PATH", DEFAULT_CONFIG_PATH);
  const templatePath = env("MCP_TEMPLATE_PATH", OPTIONAL_TEMPLATE_PATH);
  const loadedEnvSources = ENV_FILE_CANDIDATES
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => path.relative(CWD, filePath));
  if (loadedEnvSources.length > 0) {
    console.log(`[MCP_CHECK] env source includes ${loadedEnvSources.join(", ")}`);
  }

  const mainConfig = parseJsonFile(configPath);
  if (!mainConfig.ok) {
    console.error(`[MCP_CHECK] fail: ${mainConfig.error}`);
    process.exit(1);
  }
  const servers = summarizeServers(mainConfig.data);
  printServerSummary(servers, path.relative(CWD, configPath) || configPath);

  const usedPlaceholders = extractEnvPlaceholders(mainConfig.data);
  const missingFromMain = usedPlaceholders.filter((name) => !env(name));
  if (missingFromMain.length > 0) {
    console.log(`[MCP_CHECK] main config missing envs: ${missingFromMain.join(", ")}`);
  } else {
    console.log("[MCP_CHECK] main config env placeholders resolved");
  }

  const templateConfig = parseJsonFile(templatePath);
  if (templateConfig.ok) {
    const templateServers = summarizeServers(templateConfig.data);
    printServerSummary(templateServers, path.relative(CWD, templatePath) || templatePath);
    const templatePlaceholders = extractEnvPlaceholders(templateConfig.data);
    const missingFromTemplate = templatePlaceholders.filter((name) => !env(name));
    if (missingFromTemplate.length > 0) {
      console.log(`[MCP_CHECK] optional template missing envs: ${missingFromTemplate.join(", ")}`);
    } else if (templatePlaceholders.length > 0) {
      console.log("[MCP_CHECK] optional template env placeholders resolved");
    }
  } else {
    console.log(`[MCP_CHECK] optional template skipped: ${templateConfig.error}`);
  }

  if (strict && missingFromMain.length > 0) {
    console.error("[MCP_CHECK] strict mode enabled and main config has unresolved env placeholders");
    process.exit(1);
  }

  console.log(`[MCP_CHECK] done strict=${strict ? "true" : "false"}`);
};

main();
