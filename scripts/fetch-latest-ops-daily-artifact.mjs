import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
const normalizeSlash = (value) => String(value || "").replace(/\\/g, "/");

const collectFiles = (rootDir) => {
  const out = [];
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };
  if (fs.existsSync(rootDir)) walk(rootDir);
  return out;
};

const locateExtractedFile = (allFiles, expectedRelative) => {
  const expectedNorm = normalizeSlash(expectedRelative).replace(/^\/+/, "");
  const bySuffix = allFiles.find((filePath) => {
    const norm = normalizeSlash(filePath);
    return norm.endsWith(expectedNorm);
  });
  if (bySuffix) return bySuffix;
  const basename = path.basename(expectedNorm);
  const byName = allFiles.filter((filePath) => path.basename(filePath) === basename);
  return byName.length === 1 ? byName[0] : null;
};

const requestJson = async (token, url) => {
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
    const message = String(data?.message || text || "unknown").slice(0, 260);
    throw new Error(`github_api_failed(${response.status}): ${message}`);
  }
  return data;
};

const downloadArtifactZip = async (token, url, outPath) => {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    redirect: "follow"
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`artifact_download_failed(${response.status}): ${String(text).slice(0, 200)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
};

const main = async () => {
  const enabled = boolFromEnv("OPS_DAILY_ARTIFACT_PULL_ENABLED", true);
  if (!enabled) {
    console.log("[OPS_DAILY_ARTIFACT_PULL] status=skip_disabled");
    return;
  }

  const token = env("GITHUB_TOKEN");
  const repoRaw = env("OPS_DAILY_SOURCE_REPO", env("OPS_REPORT_CANARY_REPO", env("GITHUB_REPOSITORY", "")));
  const workflow = env("OPS_DAILY_SOURCE_WORKFLOW", "mcp-ops-daily.yml");
  const artifactName = env("OPS_DAILY_SOURCE_ARTIFACT_NAME", "ops-daily-report");
  const maxRuns = Math.max(5, Math.min(50, numFromEnv("OPS_DAILY_SOURCE_MAX_RUNS", 20)));
  const reportPath = resolvePath(env("OPS_DAILY_REPORT_PATH"), DEFAULT_REPORT_PATH);
  const notionSyncPath = resolvePath(env("OPS_DAILY_NOTION_SYNC_PATH"), DEFAULT_NOTION_SYNC_PATH);

  const match = repoRaw.match(/^([^/]+)\/([^/]+)$/);
  if (!match) {
    console.log(`[OPS_DAILY_ARTIFACT_PULL] status=skip_invalid_repo repo=${repoRaw || "N/A"}`);
    return;
  }
  if (!token) {
    console.log("[OPS_DAILY_ARTIFACT_PULL] status=skip_missing_token");
    return;
  }
  const owner = match[1];
  const repo = match[2];

  const runsUrl = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs`
  );
  runsUrl.searchParams.set("per_page", String(maxRuns));

  const runsData = await requestJson(token, runsUrl.toString());
  const runs = Array.isArray(runsData?.workflow_runs) ? runsData.workflow_runs : [];
  const run = runs.find(
    (row) => String(row?.status || "") === "completed" && String(row?.conclusion || "") === "success"
  );
  if (!run?.id) {
    console.log("[OPS_DAILY_ARTIFACT_PULL] status=skip_no_success_run");
    return;
  }

  const artifactsData = await requestJson(
    token,
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(String(run.id))}/artifacts?per_page=100`
  );
  const artifacts = Array.isArray(artifactsData?.artifacts) ? artifactsData.artifacts : [];
  const artifact = artifacts.find((row) => String(row?.name || "") === artifactName && !row?.expired);
  if (!artifact?.archive_download_url) {
    console.log(
      `[OPS_DAILY_ARTIFACT_PULL] status=skip_artifact_missing runId=${run.id} artifact=${artifactName}`
    );
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ops-daily-artifact-"));
  const zipPath = path.join(tmpDir, "ops-daily-report.zip");
  const extractDir = path.join(tmpDir, "extract");
  try {
    await downloadArtifactZip(token, artifact.archive_download_url, zipPath);
    fs.mkdirSync(extractDir, { recursive: true });
    const unzip = spawnSync("unzip", ["-o", zipPath, "-d", extractDir], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024
    });
    if (unzip.status !== 0) {
      const stderr = String(unzip.stderr || "").trim();
      throw new Error(`unzip_failed:${stderr.slice(0, 200) || "unknown"}`);
    }
    const extractedFiles = collectFiles(extractDir);
    const reportSrc = locateExtractedFile(extractedFiles, path.relative(CWD, reportPath));
    if (!reportSrc) {
      throw new Error(
        `required_report_missing expected=${path.relative(CWD, reportPath)} extracted=${extractedFiles.length}`
      );
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.copyFileSync(reportSrc, reportPath);

    const notionSrc = locateExtractedFile(extractedFiles, path.relative(CWD, notionSyncPath));
    if (notionSrc) {
      fs.mkdirSync(path.dirname(notionSyncPath), { recursive: true });
      fs.copyFileSync(notionSrc, notionSyncPath);
    }
    console.log(
      `[OPS_DAILY_ARTIFACT_PULL] status=ok repo=${owner}/${repo} workflow=${workflow} runId=${run.id} artifact=${artifactName} report=${path.relative(CWD, reportPath)} notionSync=${notionSrc ? path.relative(CWD, notionSyncPath) : "missing"}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.log(`[OPS_DAILY_ARTIFACT_PULL] status=fail reason=${error instanceof Error ? error.message : String(error)}`);
});
