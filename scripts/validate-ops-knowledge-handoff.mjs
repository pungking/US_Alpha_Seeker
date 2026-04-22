import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const DEFAULT_HANDOFF_PATH = path.join(CWD, "state", "ops-knowledge-handoff.json");

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};
const resolvePath = (raw, fallbackPath) => {
  const value = String(raw || "").trim();
  if (!value) return fallbackPath;
  if (path.isAbsolute(value)) return value;
  return path.join(CWD, value);
};

const main = () => {
  const enabled = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_ENABLED", true);
  const required = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRED", false);
  const handoffPath = resolvePath(env("OPS_KNOWLEDGE_HANDOFF_PATH"), DEFAULT_HANDOFF_PATH);
  const requirePass = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRE_PASS", true);

  if (!enabled) {
    console.log("[OPS_KNOWLEDGE_HANDOFF_VALIDATE] skip_disabled");
    return;
  }
  if (!fs.existsSync(handoffPath)) {
    const msg = `[OPS_KNOWLEDGE_HANDOFF_VALIDATE] missing_file path=${path.relative(CWD, handoffPath)}`;
    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`${msg} (non-blocking)`);
    return;
  }

  let handoff = null;
  try {
    handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
  } catch (error) {
    const msg = `[OPS_KNOWLEDGE_HANDOFF_VALIDATE] invalid_json ${error instanceof Error ? error.message : String(error)}`;
    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`${msg} (non-blocking)`);
    return;
  }

  const missing = [];
  const has = (value) => String(value ?? "").trim().length > 0;
  if (!has(handoff?.schemaVersion)) missing.push("schemaVersion");
  if (!has(handoff?.generatedAt)) missing.push("generatedAt");
  if (!has(handoff?.runKey)) missing.push("runKey");
  if (!has(handoff?.handoffStatus)) missing.push("handoffStatus");
  if (!has(handoff?.opsDaily?.status)) missing.push("opsDaily.status");
  if (!has(handoff?.execution?.execReadinessNow)) missing.push("execution.execReadinessNow");
  if (!has(handoff?.canary?.freshness)) missing.push("canary.freshness");

  const status = String(handoff?.handoffStatus || "").toUpperCase();
  const pass = status === "PASS";
  const hold = status === "HOLD";
  const block = status === "BLOCK";

  if (missing.length > 0) {
    const msg = `[OPS_KNOWLEDGE_HANDOFF_VALIDATE] schema_missing fields=${missing.join(",")}`;
    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`${msg} (non-blocking)`);
  }

  if (requirePass && (hold || block || !pass)) {
    const msg = `[OPS_KNOWLEDGE_HANDOFF_VALIDATE] status_not_pass status=${status} reason=${String(handoff?.handoffReason || "n/a")}`;
    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(`${msg} (non-blocking)`);
  }

  console.log(
    `[OPS_KNOWLEDGE_HANDOFF_VALIDATE] ok status=${status || "UNKNOWN"} required=${required} missing=${missing.length}`
  );
};

main();
