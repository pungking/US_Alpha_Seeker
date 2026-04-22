#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function readBool(raw, fallback = false) {
  if (raw == null || String(raw).trim() === "") return fallback;
  const v = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(v)) return true;
  if (["0", "false", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

function mask(value) {
  const text = String(value || "").trim();
  if (!text) return "(missing)";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function runCommand(command, args) {
  try {
    const out = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, text: String(out || "").trim() };
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr || "") : "";
    const stdout = error && typeof error === "object" && "stdout" in error ? String(error.stdout || "") : "";
    return { ok: false, text: [stdout, stderr].filter(Boolean).join("\n").trim() };
  }
}

function probeAccount(baseUrl, keyId, secretKey) {
  try {
    const out = execFileSync(
      "node",
      [
        "-e",
        `const https=require('https');
const url='${baseUrl.replace(/'/g, "")}/v2/account';
const req=https.request(url,{method:'GET',headers:{'APCA-API-KEY-ID':'${keyId.replace(/'/g, "")}','APCA-API-SECRET-KEY':'${secretKey.replace(/'/g, "")}'}} ,(res)=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>{console.log(JSON.stringify({status:res.statusCode,body:body.slice(0,160)}));});});
req.on('error',(e)=>{console.log(JSON.stringify({status:0,error:String(e.message||e)}));});
req.end();`
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();
    const parsed = JSON.parse(out);
    return parsed;
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

const strict = readBool(process.env.ALPACA_CLI_HEALTH_STRICT, false);
const httpProbe = readBool(process.env.ALPACA_CLI_HEALTH_HTTP_PROBE, false);
const baseUrl = String(process.env.ALPACA_BASE_URL || "https://paper-api.alpaca.markets").trim();
const keyId = String(process.env.ALPACA_KEY_ID || process.env.ALPACA_API_KEY || "").trim();
const secretKey = String(process.env.ALPACA_SECRET_KEY || "").trim();

const checks = [];

const cliVersion = runCommand("alpaca", ["version"]);
if (!cliVersion.ok) {
  const alt = runCommand("alpaca", ["--version"]);
  if (alt.ok) {
    checks.push({ name: "alpaca_cli_installed", ok: true, detail: alt.text || "alpaca --version ok" });
  } else {
    checks.push({ name: "alpaca_cli_installed", ok: false, detail: "alpaca command not found" });
  }
} else {
  checks.push({ name: "alpaca_cli_installed", ok: true, detail: cliVersion.text || "alpaca version ok" });
}

checks.push({
  name: "paper_base_url",
  ok: /paper-api\.alpaca\.markets/i.test(baseUrl),
  detail: `ALPACA_BASE_URL=${baseUrl}`
});

checks.push({
  name: "api_key_present",
  ok: keyId.length > 0,
  detail: `ALPACA_KEY_ID=${mask(keyId)}`
});
checks.push({
  name: "secret_present",
  ok: secretKey.length > 0,
  detail: `ALPACA_SECRET_KEY=${mask(secretKey)}`
});

if (httpProbe) {
  if (keyId && secretKey) {
    const probe = probeAccount(baseUrl, keyId, secretKey);
    const ok = Number(probe.status) >= 200 && Number(probe.status) < 300;
    checks.push({
      name: "account_http_probe",
      ok,
      detail: ok
        ? `status=${probe.status}`
        : `status=${probe.status || 0} ${probe.error ? `error=${probe.error}` : `body=${String(probe.body || "").slice(0, 80)}`}`
    });
  } else {
    checks.push({ name: "account_http_probe", ok: false, detail: "skipped: missing API credentials" });
  }
}

const failed = checks.filter((row) => !row.ok);
for (const row of checks) {
  console.log(`[ALPACA_CLI_HEALTH] ${row.ok ? "PASS" : "FAIL"} ${row.name} ${row.detail}`);
}

const mode = strict ? "strict" : "warn";
console.log(`[ALPACA_CLI_HEALTH] mode=${mode} checks=${checks.length} failed=${failed.length}`);

if (strict && failed.length > 0) {
  process.exit(1);
}
