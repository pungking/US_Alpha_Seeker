import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const DEFAULT_REPORT_PATH = path.join(
  CWD,
  "sidecar-template",
  "alpha-exec-engine",
  "state",
  "ops-daily-report.json"
);
const DEFAULT_NOTION_SYNC_PATH = path.join(
  CWD,
  "sidecar-template",
  "alpha-exec-engine",
  "state",
  "notion-ops-daily-sync.json"
);
const DEFAULT_OUTPUT_PATH = path.join(CWD, "state", "ops-knowledge-handoff.json");
const DEFAULT_OUTPUT_MD_PATH = path.join(CWD, "state", "ops-knowledge-handoff.md");
const DEFAULT_HISTORY_PATH = path.join(CWD, "state", "ops-knowledge-handoff-history.jsonl");

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};
const numFromEnv = (name, fallback) => {
  const n = Number(env(name, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
};
const resolvePath = (raw, fallbackPath) => {
  const value = String(raw || "").trim();
  if (!value) return fallbackPath;
  if (path.isAbsolute(value)) return value;
  return path.join(CWD, value);
};
const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};
const writeJson = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
};
const writeText = (filePath, data) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data, "utf8");
};
const readJsonl = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  return String(fs.readFileSync(filePath, "utf8") || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};
const writeJsonl = (filePath, rows) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join("\n");
  fs.writeFileSync(filePath, payload ? `${payload}\n` : "", "utf8");
};
const toIso = (value) => {
  const dt = new Date(String(value || ""));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};
const ageMin = (iso) => {
  const ts = Date.parse(String(iso || ""));
  if (!Number.isFinite(ts)) return null;
  return Number(((Date.now() - ts) / 60000).toFixed(1));
};

const main = () => {
  const reportPath = resolvePath(env("OPS_DAILY_REPORT_PATH"), DEFAULT_REPORT_PATH);
  const notionSyncPath = resolvePath(env("OPS_DAILY_NOTION_SYNC_PATH"), DEFAULT_NOTION_SYNC_PATH);
  const outputPath = resolvePath(env("OPS_KNOWLEDGE_HANDOFF_PATH"), DEFAULT_OUTPUT_PATH);
  const outputMdPath = resolvePath(env("OPS_KNOWLEDGE_HANDOFF_MD_PATH"), DEFAULT_OUTPUT_MD_PATH);
  const historyPath = resolvePath(env("OPS_KNOWLEDGE_HANDOFF_HISTORY_PATH"), DEFAULT_HISTORY_PATH);

  const maxAgeMin = Math.max(30, Math.min(10080, numFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_MAX_AGE_MIN", 1440)));
  const requireExecReady = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRE_EXEC_READY", false);
  const requireCanaryFresh = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRE_CANARY_FRESH", false);
  const historyMax = Math.max(20, Math.min(2000, numFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_HISTORY_MAX", 200)));
  const trendWindow = Math.max(3, Math.min(60, numFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_TREND_WINDOW", 7)));

  const report = readJson(reportPath);
  const notionSync = readJson(notionSyncPath);

  const requiredMissing = [];
  const reportGeneratedAt = toIso(report?.generatedAt);
  if (!report) requiredMissing.push("opsDailyReport");
  if (!reportGeneratedAt) requiredMissing.push("opsDaily.generatedAt");
  const opsAgeMin = ageMin(reportGeneratedAt);
  if (opsAgeMin == null) requiredMissing.push("opsDaily.ageMin");

  const canaryLatest = report?.canary?.latest?.[0] || null;
  const dryRunLatest = report?.dryRun?.latest?.[0] || null;
  const marketGuardLatest = report?.marketGuard?.latest?.[0] || null;
  const canaryVerifyLatest = report?.canaryVerify?.perRun?.[0] || null;

  const canaryFreshStatus = String(report?.canaryFreshness?.status || "unknown");
  const execReadinessStatus = String(report?.execReadinessNow?.status || "UNKNOWN");
  const opsStatus = String(report?.status || "missing").toLowerCase();

  let handoffStatus = "PASS";
  let handoffReason = "ready";
  if (requiredMissing.length > 0) {
    handoffStatus = "BLOCK";
    handoffReason = "missing_required_fields";
  } else if (opsAgeMin != null && opsAgeMin > maxAgeMin) {
    handoffStatus = "BLOCK";
    handoffReason = "ops_daily_stale";
  } else if (opsStatus === "fail") {
    handoffStatus = "BLOCK";
    handoffReason = "ops_daily_fail";
  } else if (opsStatus === "warn" || opsStatus === "skip") {
    handoffStatus = "HOLD";
    handoffReason = `ops_daily_${opsStatus}`;
  } else if (requireCanaryFresh && canaryFreshStatus !== "fresh") {
    handoffStatus = "HOLD";
    handoffReason = "canary_not_fresh";
  } else if (requireExecReady && execReadinessStatus !== "READY") {
    handoffStatus = "HOLD";
    handoffReason = "exec_not_ready";
  }

  const runKey =
    String(notionSync?.runKey || "").trim() ||
    (reportGeneratedAt ? `ops-daily-${reportGeneratedAt.slice(0, 10)}` : "ops-daily-unknown");

  const contract = {
    schemaVersion: "ops-knowledge-handoff/v1",
    generatedAt: new Date().toISOString(),
    runKey,
    handoffStatus,
    handoffReason,
    requiredMissing,
    policies: {
      maxAgeMin,
      requireExecReady,
      requireCanaryFresh
    },
    opsDaily: {
      generatedAt: reportGeneratedAt,
      ageMin: opsAgeMin,
      status: String(report?.status || "missing"),
      reason: String(report?.reason || ""),
      decision: String(report?.decision || "")
    },
    execution: {
      execReadinessNow: execReadinessStatus,
      preflightStatus: String(report?.execReadinessNow?.preflightStatus || ""),
      preflightCode: String(report?.execReadinessNow?.preflightCode || ""),
      attempted: Number(report?.execReadinessNow?.attempted || 0),
      submitted: Number(report?.execReadinessNow?.submitted || 0)
    },
    canary: {
      freshness: canaryFreshStatus,
      latestAgeMin: report?.canaryFreshness?.latestAgeMin ?? null,
      verifyParsed: Number(report?.canaryVerify?.parsed || 0),
      verifyInspected: Number(report?.canaryVerify?.inspected || 0),
      verifySubmittedTotal: Number(report?.canaryVerify?.submittedTotal || 0)
    },
    marketGuard: {
      mode: String(report?.latestGuard?.mode || ""),
      level: String(report?.latestGuard?.level || ""),
      source: String(report?.latestGuard?.source || ""),
      actionReason: String(report?.latestGuard?.actionReason || "")
    },
    links: {
      dryRunUrl: String(dryRunLatest?.htmlUrl || ""),
      canaryUrl: String(canaryLatest?.htmlUrl || ""),
      canaryVerifyUrl: String(canaryVerifyLatest?.htmlUrl || ""),
      marketGuardUrl: String(marketGuardLatest?.htmlUrl || "")
    },
    notion: {
      syncStatus: String(notionSync?.status || "missing"),
      action: String(notionSync?.action || ""),
      runKey: String(notionSync?.runKey || ""),
      reason: String(notionSync?.reason || "")
    },
    sourceFiles: {
      opsDailyReportPath: path.relative(CWD, reportPath),
      opsDailyNotionSyncPath: path.relative(CWD, notionSyncPath)
    }
  };

  const historySeed = readJsonl(historyPath);
  const historyRows = historySeed
    .filter((row) => {
      const key = String(row?.runKey || "").trim();
      const at = String(row?.generatedAt || "").trim();
      return !(key === contract.runKey && at === contract.generatedAt);
    })
    .concat([
      {
        generatedAt: contract.generatedAt,
        runKey: contract.runKey,
        handoffStatus: contract.handoffStatus,
        handoffReason: contract.handoffReason,
        opsDailyStatus: contract.opsDaily.status,
        execReadinessNow: contract.execution.execReadinessNow,
        canaryFreshness: contract.canary.freshness
      }
    ])
    .slice(-historyMax);
  writeJsonl(historyPath, historyRows);

  const trendPool = historyRows.slice(-trendWindow);
  const passCount = trendPool.filter((row) => String(row?.handoffStatus || "").toUpperCase() === "PASS").length;
  const holdCount = trendPool.filter((row) => String(row?.handoffStatus || "").toUpperCase() === "HOLD").length;
  const blockCount = trendPool.filter((row) => String(row?.handoffStatus || "").toUpperCase() === "BLOCK").length;
  const passRatePct =
    trendPool.length > 0 ? Number(((passCount / trendPool.length) * 100).toFixed(2)) : null;
  contract.trend = {
    historyPath: path.relative(CWD, historyPath),
    historySize: historyRows.length,
    windowSize: trendPool.length,
    passCount,
    holdCount,
    blockCount,
    passRatePct
  };

  const lines = [];
  lines.push("## Ops -> Knowledge Handoff Contract");
  lines.push(`- generatedAt: \`${contract.generatedAt}\``);
  lines.push(`- runKey: \`${contract.runKey}\``);
  lines.push(`- status: \`${contract.handoffStatus}\``);
  lines.push(`- reason: \`${contract.handoffReason}\``);
  lines.push(`- opsDaily: \`${contract.opsDaily.status}\` ageMin=\`${contract.opsDaily.ageMin ?? "N/A"}\``);
  lines.push(
    `- execution: \`${contract.execution.execReadinessNow}\` attempted=\`${contract.execution.attempted}\` submitted=\`${contract.execution.submitted}\``
  );
  lines.push(
    `- canary: freshness=\`${contract.canary.freshness}\` parsed=\`${contract.canary.verifyParsed}/${contract.canary.verifyInspected}\``
  );
  lines.push(
    `- guard: mode=\`${contract.marketGuard.mode || "n/a"}\` level=\`${contract.marketGuard.level || "n/a"}\` source=\`${contract.marketGuard.source || "n/a"}\``
  );
  lines.push(
    `- trend: passRate=\`${contract.trend.passRatePct ?? "N/A"}%\` pass/hold/block=\`${contract.trend.passCount}/${contract.trend.holdCount}/${contract.trend.blockCount}\` window=\`${contract.trend.windowSize}\``
  );
  if (contract.requiredMissing.length > 0) {
    lines.push(`- requiredMissing: \`${contract.requiredMissing.join(",")}\``);
  }
  lines.push("");

  writeJson(outputPath, contract);
  writeText(outputMdPath, `${lines.join("\n")}\n`);

  console.log(
    `[OPS_KNOWLEDGE_HANDOFF] status=${contract.handoffStatus} reason=${contract.handoffReason} runKey=${contract.runKey} missing=${contract.requiredMissing.length}`
  );
};

main();
