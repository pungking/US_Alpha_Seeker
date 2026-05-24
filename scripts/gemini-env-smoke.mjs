import { readFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

const ENV_FILES = [
  process.env.GEMINI_SMOKE_ENV_FILE,
  ".env.local",
  ".env"
].filter(Boolean);
const KEY_NAMES = ["GEMINI_API_KEY", "VITE_GEMINI_API_KEY", "API_KEY", "VITE_API_KEY"];
const REQUIRED_ALIASES = ["GEMINI_API_KEY", "VITE_GEMINI_API_KEY", "API_KEY"];
const MODEL = process.env.GEMINI_SMOKE_MODEL || "gemini-2.5-flash";

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const result = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    result[match[1]] = value;
  }
  return result;
}

function redact(value) {
  return String(value || "")
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***REDACTED***")
    .slice(0, 320);
}

function loadEnv() {
  const fileEnv = {};
  for (const file of ENV_FILES) Object.assign(fileEnv, parseEnvFile(file));
  const env = {};
  for (const key of KEY_NAMES) env[key] = process.env[key] || fileEnv[key] || "";
  return env;
}

async function main() {
  const env = loadEnv();
  const canonical = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || env.API_KEY || env.VITE_API_KEY;
  const requireAliases = String(process.env.GEMINI_SMOKE_REQUIRE_ALIASES || "false").toLowerCase() === "true";
  const aliases = KEY_NAMES.map((name) => ({
    name,
    present: Boolean(env[name]),
    sameAsCanonical: Boolean(env[name]) && env[name] === canonical
  }));

  const missing = aliases
    .filter((row) => REQUIRED_ALIASES.includes(row.name) && !row.present)
    .map((row) => row.name);
  const mismatched = aliases.filter((row) => row.present && !row.sameAsCanonical).map((row) => row.name);

  if (!canonical) {
    console.error("[GEMINI_ENV_SMOKE] overall=fail reason=missing_all_keys");
    process.exit(1);
  }
  if (requireAliases && missing.length > 0) {
    console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=missing_aliases aliases=${missing.join(",")}`);
    process.exit(1);
  }
  if (mismatched.length > 0) {
    console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=alias_mismatch aliases=${mismatched.join(",")}`);
    process.exit(1);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: canonical });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: "Return exactly OK."
    });
    const text = String(response?.text || "").trim();
    if (text !== "OK") {
      console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=unexpected_response textLen=${text.length}`);
      process.exit(1);
    }
    console.log(
      `[GEMINI_ENV_SMOKE] overall=pass model=${MODEL} aliasesAligned=true aliasesPresent=${aliases
        .filter((row) => row.present)
        .map((row) => row.name)
        .join(",")}`
    );
  } catch (error) {
    console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=api_error message=${redact(error?.message || error)}`);
    process.exit(1);
  }
}

main();
