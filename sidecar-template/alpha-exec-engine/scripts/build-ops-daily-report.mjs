import fs from "node:fs";

const STATE_DIR = "state";
const OUTPUT_JSON = `${STATE_DIR}/ops-daily-report.json`;
const OUTPUT_MD = `${STATE_DIR}/ops-daily-report.md`;

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const toNum = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const now = () => new Date();
const nowIso = () => now().toISOString();
const fmtPct = (num, den) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "N/A");
const safeJsonRead = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const writeJson = (path, data) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
};

const writeText = (path, text) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(path, text, "utf8");
};

const parseRepo = (value, fallback) => {
  const raw = value || fallback;
  const [owner, repo] = raw.split("/").map((v) => v.trim());
  if (!owner || !repo) return null;
  return { owner, repo };
};

const parseIso = (value) => {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : NaN;
};

const makeKst = (date) => {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
};

const fetchRuns = async ({ token, owner, repo, workflow, perPage }) => {
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs`
  );
  url.searchParams.set("per_page", String(perPage));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message = String(data?.message || text || "unknown").slice(0, 280);
    throw new Error(`GitHub API failed (${response.status}): ${message}`);
  }

  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
};

const summarizeRuns = (runs, sinceMs) => {
  const scoped = runs.filter((run) => {
    const createdMs = parseIso(run?.created_at);
    return Number.isFinite(createdMs) && createdMs >= sinceMs;
  });

  const completed = scoped.filter((run) => run?.status === "completed");
  const success = completed.filter((run) => run?.conclusion === "success");
  const failed = completed.filter((run) => run?.conclusion && run?.conclusion !== "success");

  return {
    scanned: runs.length,
    inWindow: scoped.length,
    completed: completed.length,
    success: success.length,
    failed: failed.length,
    successRatePct: completed.length > 0 ? Number(((success.length / completed.length) * 100).toFixed(2)) : null,
    latest: scoped.slice(0, 5).map((run) => ({
      id: run.id,
      runNumber: run.run_number,
      status: run.status,
      conclusion: run.conclusion,
      event: run.event,
      createdAt: run.created_at,
      htmlUrl: run.html_url,
      displayTitle: run.display_title || ""
    }))
  };
};

const buildMarkdown = (report) => {
  const lines = [];
  lines.push("## Ops Daily Report (Auto)");
  lines.push(`- generatedAtUTC: \`${report.generatedAt}\``);
  lines.push(`- generatedAtKST: \`${report.generatedAtKst}\``);
  lines.push(`- windowHours: \`${report.windowHours}\``);
  lines.push(`- windowStartUTC: \`${report.windowStartUtc}\``);
  lines.push(`- overallStatus: \`${report.status.toUpperCase()}\``);
  if (report.reason) lines.push(`- reason: \`${report.reason}\``);
  lines.push("");

  lines.push("### GitHub Workflow KPIs");
  lines.push(
    `- canary: success \`${report.canary.success}/${report.canary.completed}\` (${fmtPct(report.canary.success, report.canary.completed)}) | inWindow=\`${report.canary.inWindow}\``
  );
  lines.push(
    `- dryrun: success \`${report.dryRun.success}/${report.dryRun.completed}\` (${fmtPct(report.dryRun.success, report.dryRun.completed)}) | inWindow=\`${report.dryRun.inWindow}\``
  );
  lines.push("");

  lines.push("### Notion Audit Snapshot");
  lines.push(`- status: \`${report.notionAudit.status}\``);
  lines.push(`- rowsChecked: \`${report.notionAudit.rowsChecked}\``);
  lines.push(`- missingRows: \`${report.notionAudit.requiredFieldMissingRows}\``);
  lines.push(`- duplicateRunKeys: \`${report.notionAudit.duplicateRunKeyCount}\``);
  lines.push(`- staleLatestMinutes: \`${report.notionAudit.staleLatestMinutes ?? "N/A"}\``);
  lines.push("");

  const appendRuns = (title, items) => {
    lines.push(`### ${title}`);
    if (!items.length) {
      lines.push("- N/A");
      lines.push("");
      return;
    }
    for (const row of items) {
      lines.push(
        `- #${row.runNumber} \`${row.status}/${row.conclusion || "n/a"}\` ${row.displayTitle ? `- ${row.displayTitle} ` : ""}(${row.htmlUrl})`
      );
    }
    lines.push("");
  };

  appendRuns("Latest Canary Runs", report.canary.latest);
  appendRuns("Latest Dry-Run Runs", report.dryRun.latest);

  lines.push("### Decision");
  lines.push(`- automatedSummary: ${report.decision}`);

  return `${lines.join("\n")}\n`;
};

const main = async () => {
  const token = env("GITHUB_TOKEN");
  const canaryRepo = parseRepo(env("OPS_REPORT_CANARY_REPO"), "pungking/US_Alpha_Seeker");
  const dryRunRepo = parseRepo(env("OPS_REPORT_DRYRUN_REPO"), "pungking/alpha-exec-engine");
  const canaryWorkflow = env("OPS_REPORT_CANARY_WORKFLOW", "sidecar-preflight-canary-recheck.yml");
  const dryRunWorkflow = env("OPS_REPORT_DRYRUN_WORKFLOW", "dry-run.yml");
  const windowHours = Math.max(1, Math.min(168, toNum(env("OPS_REPORT_LOOKBACK_HOURS", "24"), 24)));
  const perPage = Math.max(10, Math.min(100, toNum(env("OPS_REPORT_MAX_RUNS", "30"), 30)));

  if (!canaryRepo || !dryRunRepo) {
    throw new Error("invalid OPS_REPORT_*_REPO format (expected owner/repo)");
  }

  const current = now();
  const sinceMs = current.getTime() - windowHours * 60 * 60 * 1000;

  const notionAudit = safeJsonRead(`${STATE_DIR}/notion-ops-audit.json`) || {
    status: "missing",
    rowsChecked: 0,
    requiredFieldMissingRows: 0,
    duplicateRunKeyCount: 0,
    staleLatestMinutes: null
  };

  if (!token) {
    const skipped = {
      generatedAt: nowIso(),
      generatedAtKst: makeKst(current),
      status: "skip",
      reason: "missing_github_token",
      windowHours,
      windowStartUtc: new Date(sinceMs).toISOString(),
      canary: { scanned: 0, inWindow: 0, completed: 0, success: 0, failed: 0, successRatePct: null, latest: [] },
      dryRun: { scanned: 0, inWindow: 0, completed: 0, success: 0, failed: 0, successRatePct: null, latest: [] },
      notionAudit,
      decision: "GitHub token missing; cannot compute workflow KPIs."
    };
    writeJson(OUTPUT_JSON, skipped);
    writeText(OUTPUT_MD, buildMarkdown(skipped));
    console.log("[OPS_DAILY] skipped missing github token");
    return;
  }

  const [canaryRuns, dryRunRuns] = await Promise.all([
    fetchRuns({
      token,
      owner: canaryRepo.owner,
      repo: canaryRepo.repo,
      workflow: canaryWorkflow,
      perPage
    }),
    fetchRuns({
      token,
      owner: dryRunRepo.owner,
      repo: dryRunRepo.repo,
      workflow: dryRunWorkflow,
      perPage
    })
  ]);

  const canary = summarizeRuns(canaryRuns, sinceMs);
  const dryRun = summarizeRuns(dryRunRuns, sinceMs);

  let status = "pass";
  let reason = "healthy";
  if (canary.completed === 0 || dryRun.completed === 0) {
    status = "warn";
    reason = "insufficient_completed_runs";
  }
  if (canary.failed > 0 || dryRun.failed > 0) {
    status = "warn";
    reason = "failed_runs_detected";
  }
  if (String(notionAudit.status || "").toLowerCase() !== "pass") {
    status = "warn";
    reason = reason === "healthy" ? "notion_audit_not_pass" : `${reason}+notion_audit_not_pass`;
  }

  const decision =
    status === "pass"
      ? "No immediate blocker in lookback window. Continue baseline/tuning workflow."
      : "Investigate failed runs or Notion audit warnings before changing policy thresholds.";

  const report = {
    generatedAt: nowIso(),
    generatedAtKst: makeKst(current),
    status,
    reason,
    windowHours,
    windowStartUtc: new Date(sinceMs).toISOString(),
    canary,
    dryRun,
    notionAudit: {
      status: notionAudit.status || "missing",
      rowsChecked: notionAudit.rowsChecked ?? 0,
      requiredFieldMissingRows: notionAudit.requiredFieldMissingRows ?? 0,
      duplicateRunKeyCount: notionAudit.duplicateRunKeyCount ?? 0,
      staleLatestMinutes: notionAudit.staleLatestMinutes ?? null
    },
    decision
  };

  writeJson(OUTPUT_JSON, report);
  writeText(OUTPUT_MD, buildMarkdown(report));

  console.log(
    `[OPS_DAILY] status=${report.status} reason=${report.reason} canary=${report.canary.success}/${report.canary.completed} dryrun=${report.dryRun.success}/${report.dryRun.completed}`
  );
};

main().catch((error) => {
  console.error("[OPS_DAILY] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
