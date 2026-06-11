import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { GoogleGenAI } from "@google/genai";

const ENV_FILES = [
  process.env.GEMINI_SMOKE_ENV_FILE,
  ".env.local",
  ".env"
].filter(Boolean);
const KEY_NAMES = ["GEMINI_API_KEY", "API_KEY"];
const REQUIRED_ALIASES = ["GEMINI_API_KEY", "API_KEY"];
const MODEL = process.env.GEMINI_SMOKE_MODEL || "gemini-2.5-flash";
const REPORT_PATH = process.env.GEMINI_SMOKE_REPORT_PATH || "state/gemini-env-smoke.json";

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function resolveSmokeModels() {
  return unique([
    ...(process.env.GEMINI_SMOKE_MODELS || "").split(","),
    MODEL,
    process.env.GEMINI_PRIMARY_MODEL,
    process.env.GEMINI_FAST_MODEL,
    process.env.GEMINI_FALLBACK_MODEL,
    process.env.GEMINI_LITE_MODEL,
    process.env.VITE_GEMINI_PRIMARY_MODEL,
    process.env.VITE_GEMINI_FAST_MODEL,
    process.env.VITE_GEMINI_FALLBACK_MODEL,
    process.env.VITE_GEMINI_LITE_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite"
  ]);
}

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

function writeReport(payload) {
  const directory = dirname(REPORT_PATH);
  if (directory && directory !== ".") mkdirSync(directory, { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function extractApiError(error) {
  const rawMessage = String(error?.message || error || "");
  const jsonStart = rawMessage.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart));
      const apiError = parsed?.error || parsed;
      const details = Array.isArray(apiError?.details) ? apiError.details : [];
      const reasons = details
        .map((item) => item?.reason || item?.metadata?.reason)
        .filter(Boolean);
      return {
        code: Number(apiError?.code || 0) || null,
        status: String(apiError?.status || "").toUpperCase(),
        message: redact(apiError?.message || rawMessage),
        reasons
      };
    } catch (_) {
      // Fall through to text-only classification.
    }
  }
  return {
    code: Number(error?.status || error?.code || 0) || null,
    status: String(error?.status || error?.code || "").toUpperCase(),
    message: redact(rawMessage),
    reasons: []
  };
}

function isHardCredentialError(apiError) {
  const status = String(apiError?.status || "").toUpperCase();
  const message = String(apiError?.message || "").toUpperCase();
  const reasons = (apiError?.reasons || []).map((reason) => String(reason || "").toUpperCase());
  return (
    [401, 403].includes(Number(apiError?.code || 0)) ||
    ["UNAUTHENTICATED", "PERMISSION_DENIED"].includes(status) ||
    reasons.some((reason) => ["API_KEY_INVALID", "API_KEY_SERVICE_BLOCKED", "CONSUMER_INVALID"].includes(reason)) ||
    message.includes("API KEY EXPIRED") ||
    message.includes("API_KEY_INVALID") ||
    message.includes("API KEY NOT VALID")
  );
}

function isTransientApiError(apiError) {
  const status = String(apiError?.status || "").toUpperCase();
  const message = String(apiError?.message || "").toUpperCase();
  return (
    [408, 409, 429, 500, 502, 503, 504].includes(Number(apiError?.code || 0)) ||
    ["UNAVAILABLE", "RESOURCE_EXHAUSTED", "DEADLINE_EXCEEDED", "ABORTED", "INTERNAL"].includes(status) ||
    message.includes("HIGH DEMAND") ||
    message.includes("TRY AGAIN LATER") ||
    message.includes("QUOTA")
  );
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
  const canonical = env.GEMINI_API_KEY || env.API_KEY;
  const requireAliases = String(process.env.GEMINI_SMOKE_REQUIRE_ALIASES || "false").toLowerCase() === "true";
  const strictApi = String(process.env.GEMINI_SMOKE_STRICT_API || "false").toLowerCase() === "true";
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
    writeReport({ overall: "fail", reason: "missing_all_keys", aliases });
    console.error("[GEMINI_ENV_SMOKE] overall=fail reason=missing_all_keys");
    process.exit(1);
  }
  if (requireAliases && missing.length > 0) {
    writeReport({ overall: "fail", reason: "missing_aliases", aliases, missing });
    console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=missing_aliases aliases=${missing.join(",")}`);
    process.exit(1);
  }
  if (mismatched.length > 0) {
    writeReport({ overall: "fail", reason: "alias_mismatch", aliases, mismatched });
    console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=alias_mismatch aliases=${mismatched.join(",")}`);
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: canonical });
  const attempts = [];
  const models = resolveSmokeModels();
  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: "Return exactly OK."
      });
      const text = String(response?.text || "").trim();
      if (text !== "OK") {
        attempts.push({ model, result: "unexpected_response", textLen: text.length });
        continue;
      }
      const report = {
        overall: "pass",
        model,
        aliasesAligned: true,
        aliasesPresent: aliases.filter((row) => row.present).map((row) => row.name),
        attempts
      };
      writeReport(report);
      console.log(
        `[GEMINI_ENV_SMOKE] overall=pass model=${model} aliasesAligned=true aliasesPresent=${aliases
          .filter((row) => row.present)
          .map((row) => row.name)
          .join(",")}`
      );
      return;
    } catch (error) {
      const apiError = extractApiError(error);
      attempts.push({
        model,
        result: "api_error",
        code: apiError.code,
        status: apiError.status,
        reasons: apiError.reasons,
        message: apiError.message
      });
      if (isHardCredentialError(apiError)) {
        writeReport({ overall: "fail", reason: "credential_api_error", aliases, attempts });
        console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=credential_api_error model=${model} message=${apiError.message}`);
        process.exit(1);
      }
    }
  }

  const allTransient = attempts.length > 0 && attempts.every((attempt) => isTransientApiError(attempt));
  const report = {
    overall: allTransient && !strictApi ? "warn" : "fail",
    reason: allTransient ? "transient_api_unavailable" : "api_error",
    strictApi,
    aliasesAligned: true,
    aliasesPresent: aliases.filter((row) => row.present).map((row) => row.name),
    attempts
  };
  writeReport(report);

  if (allTransient && !strictApi) {
    console.warn(
      `[GEMINI_ENV_SMOKE] overall=warn reason=transient_api_unavailable models=${models.join(",")} action=continue_pipeline`
    );
    return;
  }

  console.error(`[GEMINI_ENV_SMOKE] overall=fail reason=api_error attempts=${attempts.length}`);
  process.exit(1);
}

main();
