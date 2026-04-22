import fs from "node:fs";
import path from "node:path";

const STATE_DIR = "state";
const OUTPUT_JSON = path.join(STATE_DIR, "sidecar-workflow-drift-audit.json");
const OUTPUT_MD = path.join(STATE_DIR, "sidecar-workflow-drift-audit.md");

const readText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
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

const findCron = (text, cronExpr) => {
  if (!text) return false;
  return text.includes(`cron: "${cronExpr}"`) || text.includes(`cron: '${cronExpr}'`);
};

const findDefaultInput = (text, inputName, expected) => {
  if (!text) return false;
  const marker = new RegExp(`${inputName}:([\\s\\S]{0,260}?)default:\\s*["']${expected}["']`, "m");
  return marker.test(text);
};

const asCheck = (id, pass, detail, severity = "error") => ({ id, pass, detail, severity });

const buildMarkdown = (report) => {
  const lines = [];
  lines.push("## Sidecar Workflow Drift Audit");
  lines.push(`- generatedAtUTC: \`${report.generatedAt}\``);
  lines.push(`- status: \`${report.status.toUpperCase()}\``);
  lines.push(`- pass: \`${report.passCount}/${report.totalCount}\``);
  lines.push("");
  lines.push("### Checks");
  report.checks.forEach((row) => {
    lines.push(`- [${row.pass ? "PASS" : row.severity.toUpperCase()}] ${row.id} - ${row.detail}`);
  });
  lines.push("");
  lines.push("### Decision");
  lines.push(`- ${report.decision}`);
  lines.push("");
  return lines.join("\n");
};

const main = () => {
  const files = {
    bridgeDryRun: ".github/workflows/dry-run.yml",
    bridgeWatchdog: ".github/workflows/sidecar-dispatch-watchdog.yml",
    schedule: ".github/workflows/schedule.yml",
    canary: ".github/workflows/sidecar-preflight-canary-recheck.yml",
    templateDryRun: "sidecar-template/alpha-exec-engine/.github/workflows/dry-run.yml",
    templateWatchdog: "sidecar-template/alpha-exec-engine/.github/workflows/dry-run-watchdog.yml"
  };

  const texts = Object.fromEntries(
    Object.entries(files).map(([k, p]) => [k, readText(p)])
  );

  const checks = [];

  checks.push(
    asCheck(
      "bridge_dry_run_file_exists",
      Boolean(texts.bridgeDryRun),
      files.bridgeDryRun
    )
  );
  checks.push(
    asCheck(
      "template_dry_run_file_exists",
      Boolean(texts.templateDryRun),
      files.templateDryRun
    )
  );
  checks.push(
    asCheck(
      "bridge_watchdog_file_exists",
      Boolean(texts.bridgeWatchdog),
      files.bridgeWatchdog
    )
  );
  checks.push(
    asCheck(
      "template_watchdog_file_exists",
      Boolean(texts.templateWatchdog),
      files.templateWatchdog
    )
  );
  checks.push(
    asCheck(
      "bridge_header_marker",
      /BRIDGE WORKFLOW/i.test(texts.bridgeDryRun || ""),
      "bridge dry-run banner must include BRIDGE WORKFLOW"
    )
  );
  checks.push(
    asCheck(
      "reference_header_marker",
      /REFERENCE WORKFLOW/i.test(texts.templateDryRun || ""),
      "template dry-run banner must include REFERENCE WORKFLOW"
    )
  );
  checks.push(
    asCheck(
      "bridge_target_repo_default",
      findDefaultInput(texts.bridgeDryRun, "target_repo", "pungking/alpha-exec-engine"),
      "bridge target_repo default should be pungking/alpha-exec-engine",
      "warn"
    )
  );
  checks.push(
    asCheck(
      "bridge_target_workflow_default",
      findDefaultInput(texts.bridgeDryRun, "target_workflow", "dry-run.yml"),
      "bridge target_workflow default should be dry-run.yml",
      "warn"
    )
  );
  checks.push(
    asCheck(
      "canary_target_workflow_default",
      findDefaultInput(texts.canary, "target_workflow", "dry-run.yml"),
      "canary target_workflow default should be dry-run.yml",
      "warn"
    )
  );
  checks.push(
    asCheck(
      "watchdog_target_workflow_default",
      /SIDECAR_WATCHDOG_TARGET_WORKFLOW\s*\|\|\s*'dry-run\.yml'/.test(texts.bridgeWatchdog || ""),
      "bridge watchdog fallback target workflow should be dry-run.yml",
      "warn"
    )
  );
  checks.push(
    asCheck(
      "schedule_sidecar_watchdog_kicker_cron",
      findCron(texts.schedule, "8,23,38,53 13-21 * * 1-5"),
      "schedule kicker cron should match sidecar watchdog cadence",
      "warn"
    )
  );
  checks.push(
    asCheck(
      "template_watchdog_cron",
      findCron(texts.templateWatchdog, "8,23,38,53 13-21 * * 1-5"),
      "template watchdog cron should match documented cadence",
      "warn"
    )
  );

  const failCount = checks.filter((row) => !row.pass && row.severity === "error").length;
  const warnCount = checks.filter((row) => !row.pass && row.severity === "warn").length;
  const status = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "pass";
  const passCount = checks.filter((row) => row.pass).length;

  const report = {
    generatedAt: new Date().toISOString(),
    status,
    failCount,
    warnCount,
    passCount,
    totalCount: checks.length,
    checks,
    decision:
      status === "pass"
        ? "Bridge/template ownership markers and core sidecar workflow defaults are aligned."
        : status === "warn"
          ? "No hard blocker, but workflow defaults/cadence need review before drift accumulates."
          : "Critical drift detected: fix failing checks before relying on bridge/watchdog automation."
  };

  writeJson(OUTPUT_JSON, report);
  writeText(OUTPUT_MD, buildMarkdown(report));
  console.log(
    `[SIDECAR_DRIFT_AUDIT] status=${report.status} pass=${report.passCount}/${report.totalCount} fail=${report.failCount} warn=${report.warnCount}`
  );
};

main();
