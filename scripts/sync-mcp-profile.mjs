import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const OUTPUT_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.json");
const BASE_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.base.json");
const PROFILE_TEMPLATES = {
  ops: [path.join(CWD, ".vscode", "mcp.profile.ops.template.json")],
  research: [path.join(CWD, ".vscode", "mcp.profile.research.template.json")],
  full: [
    path.join(CWD, ".vscode", "mcp.profile.ops.template.json"),
    path.join(CWD, ".vscode", "mcp.profile.research.template.json")
  ]
};
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
  // Alpaca MCP compatibility aliases/defaults:
  // - Some local setups only define ALPACA_KEY (legacy) without ALPACA_KEY_ID.
  // - Keep paper + read-only toolset defaults when not explicitly set.
  if (!String(map.ALPACA_KEY_ID || "").trim() && String(map.ALPACA_KEY || "").trim()) {
    map.ALPACA_KEY_ID = String(map.ALPACA_KEY || "").trim();
  }
  if (!String(map.MCP_ALPACA_PAPER_TRADE || "").trim()) {
    map.MCP_ALPACA_PAPER_TRADE = "true";
  }
  if (!String(map.MCP_ALPACA_TOOLSETS_READONLY || "").trim()) {
    map.MCP_ALPACA_TOOLSETS_READONLY =
      "assets,stock-data,crypto-data,options-data,corporate-actions,news";
  }
  return map;
};

const env = (envMap, name, fallback = "") => String(envMap[name] ?? fallback).trim();
const parseJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const walkStrings = (value, fn) => {
  if (typeof value === "string") return fn(value);
  if (Array.isArray(value)) return value.map((item) => walkStrings(item, fn));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = walkStrings(item, fn);
    }
    return out;
  }
  return value;
};

const extractPlaceholders = (value) => {
  const placeholders = new Set();
  const regex = /\$\{([A-Z0-9_]+)\}/g;
  walkStrings(value, (text) => {
    let match = regex.exec(text);
    while (match) {
      placeholders.add(match[1]);
      match = regex.exec(text);
    }
    regex.lastIndex = 0;
    return text;
  });
  return [...placeholders].sort();
};

const main = () => {
  if (!fs.existsSync(BASE_CONFIG_PATH)) {
    throw new Error(`missing ${path.relative(CWD, BASE_CONFIG_PATH)}`);
  }

  const envMap = buildEnvMap();
  const profile = env(envMap, "MCP_PROFILE", "ops").toLowerCase();
  const templatePaths = PROFILE_TEMPLATES[profile];
  if (!templatePaths) {
    throw new Error(`unknown MCP_PROFILE=${profile}; use ops|research|full`);
  }

  const includeUnresolved = (() => {
    const raw = env(envMap, "MCP_SYNC_INCLUDE_UNRESOLVED", "false").toLowerCase();
    return ["1", "true", "yes", "on"].includes(raw);
  })();

  const baseConfig = parseJson(BASE_CONFIG_PATH);
  const baseServers = baseConfig?.servers && typeof baseConfig.servers === "object" ? baseConfig.servers : {};
  const nextServers = { ...baseServers };
  const added = [];
  const skipped = [];

  for (const templatePath of templatePaths) {
    if (!fs.existsSync(templatePath)) {
      skipped.push({ name: path.relative(CWD, templatePath), reason: "missing_template" });
      continue;
    }
    const templateConfig = parseJson(templatePath);
    const templateServers =
      templateConfig?.servers && typeof templateConfig.servers === "object" ? templateConfig.servers : {};
    for (const [name, serverDef] of Object.entries(templateServers)) {
      const placeholders = extractPlaceholders(serverDef);
      const missing = placeholders.filter((key) => !String(envMap[key] ?? "").trim());
      if (missing.length > 0 && !includeUnresolved) {
        skipped.push({ name, reason: `missing_env(${missing.join(",")})` });
        continue;
      }
      // Keep placeholders in config to avoid writing secrets to disk.
      nextServers[name] = JSON.parse(JSON.stringify(serverDef));
      added.push(name);
    }
  }

  const output = {
    ...baseConfig,
    servers: nextServers
  };
  fs.writeFileSync(OUTPUT_CONFIG_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(
    `[MCP_PROFILE_SYNC] profile=${profile} includeUnresolved=${includeUnresolved ? "true" : "false"} updated ${path.relative(
      CWD,
      OUTPUT_CONFIG_PATH
    )}`
  );
  if (added.length > 0) {
    console.log(`[MCP_PROFILE_SYNC] added_or_updated: ${added.join(", ")}`);
  } else {
    console.log("[MCP_PROFILE_SYNC] added_or_updated: none");
  }
  if (skipped.length > 0) {
    for (const row of skipped) {
      console.log(`[MCP_PROFILE_SYNC] skipped ${row.name}: ${row.reason}`);
    }
  }
};

main();
