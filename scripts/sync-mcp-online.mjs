import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const MAIN_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.json");
const TEMPLATE_CONFIG_PATH = path.join(CWD, ".vscode", "mcp.online.template.json");
const ENV_FILE_PATH = path.join(CWD, ".env");

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const includeUnresolved = (() => {
  const raw = env("MCP_SYNC_INCLUDE_UNRESOLVED", "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
})();

const parseJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

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

const mergeEnv = () => {
  const map = parseDotEnv(ENV_FILE_PATH);
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    map[key] = String(value);
  }
  return map;
};

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

const replacePlaceholders = (value, envMap) =>
  walkStrings(value, (text) =>
    text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => String(envMap[name] ?? "").trim())
  );

const main = () => {
  if (!fs.existsSync(MAIN_CONFIG_PATH)) {
    throw new Error(`missing ${path.relative(CWD, MAIN_CONFIG_PATH)}`);
  }
  if (!fs.existsSync(TEMPLATE_CONFIG_PATH)) {
    throw new Error(`missing ${path.relative(CWD, TEMPLATE_CONFIG_PATH)}`);
  }

  const mainConfig = parseJson(MAIN_CONFIG_PATH);
  const templateConfig = parseJson(TEMPLATE_CONFIG_PATH);
  const envMap = mergeEnv();

  const baseServers = mainConfig?.servers && typeof mainConfig.servers === "object" ? mainConfig.servers : {};
  const templateServers =
    templateConfig?.servers && typeof templateConfig.servers === "object" ? templateConfig.servers : {};

  const nextServers = { ...baseServers };
  const added = [];
  const skipped = [];

  for (const [name, serverDef] of Object.entries(templateServers)) {
    const placeholders = extractPlaceholders(serverDef);
    const missing = placeholders.filter((key) => !String(envMap[key] ?? "").trim());
    if (missing.length > 0 && !includeUnresolved) {
      skipped.push({ name, reason: `missing_env(${missing.join(",")})` });
      continue;
    }
    nextServers[name] = replacePlaceholders(serverDef, envMap);
    added.push(name);
  }

  const next = {
    ...mainConfig,
    servers: nextServers
  };
  fs.writeFileSync(MAIN_CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  console.log(
    `[MCP_SYNC] updated ${path.relative(CWD, MAIN_CONFIG_PATH)} includeUnresolved=${
      includeUnresolved ? "true" : "false"
    }`
  );
  if (added.length > 0) {
    console.log(`[MCP_SYNC] added_or_updated: ${added.join(", ")}`);
  } else {
    console.log("[MCP_SYNC] added_or_updated: none");
  }
  if (skipped.length > 0) {
    for (const row of skipped) {
      console.log(`[MCP_SYNC] skipped ${row.name}: ${row.reason}`);
    }
  }
};

main();
