import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const resolvePath = (value, fallbackPath) => {
  const raw = String(value || "").trim();
  if (!raw) return fallbackPath;
  if (path.isAbsolute(raw)) return raw;
  return path.join(CWD, raw);
};

const short = (value, max = 160) => String(value ?? "").trim().slice(0, max);
const looksLikeUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const readText = (filePath) => {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
};

const markdownLinks = (content) => {
  const out = [];
  const seen = new Set();
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = mdLink.exec(content)) !== null) {
    const title = short(m[1] || "");
    const url = String(m[2] || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: title || url, url });
  }
  const bareUrl = /(^|\s)(https?:\/\/[^\s)]+)(?=\s|$)/g;
  while ((m = bareUrl.exec(content)) !== null) {
    const url = String(m[2] || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: url, url });
  }
  return out;
};

const domainFromUrl = (url) => {
  try {
    return new URL(url).hostname || "unknown";
  } catch {
    return "unknown";
  }
};

const titleCase = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");

const titleFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const hostStem = host.split(".")[0] || "source";
    const pathTokens = parsed.pathname
      .split("/")
      .map((x) => decodeURIComponent(x))
      .map((x) => x.replace(/\.[a-z0-9]+$/i, ""))
      .map((x) => x.replace(/[^a-zA-Z0-9]+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 4);
    const hostLabel = titleCase(hostStem.replace(/[^a-zA-Z0-9]+/g, " "));
    const pathLabel = titleCase(pathTokens.join(" "));
    return short(pathLabel ? `${hostLabel} ${pathLabel}` : hostLabel, 120);
  } catch {
    return short(url, 120);
  }
};

const pickTitle = (rawTitle, url, index) => {
  const normalized = short(rawTitle || "", 120).replace(/\s+/g, " ").trim();
  if (normalized && !looksLikeUrl(normalized) && normalized.length >= 8) return normalized;
  const fromUrl = titleFromUrl(url);
  if (fromUrl) return fromUrl;
  return `NotebookLM Seed ${index + 1}`;
};

const inferCategory = (url, fallback) => {
  const text = `${url}`.toLowerCase();
  if (text.includes("federalreserve") || text.includes("fomc") || text.includes("fedwatch")) return "Macro";
  if (text.includes("cpi") || text.includes("employment") || text.includes("gdp")) return "Macro";
  if (text.includes("vix") || text.includes("cboe")) return "Volatility";
  if (text.includes("earnings")) return "Earnings";
  return fallback || "MCP";
};

const idFromUrl = (url, index) => {
  const digest = crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 10);
  return `seed-${index + 1}-${digest}`;
};

const buildSeedItems = ({ links, limit, category }) => {
  const items = [];
  const rows = links.slice(0, Math.max(1, limit));
  let idx = 0;
  for (const row of rows) {
    const title = pickTitle(row.title, row.url, idx);
    const domain = domainFromUrl(row.url);
    const itemCategory = inferCategory(row.url, category || "MCP");
    items.push({
      id: idFromUrl(row.url, idx),
      title,
      summary: `Seed source from ${domain}. Replace with NotebookLM analysis output.`,
      category: itemCategory,
      priority: idx < 5 ? "P1" : "P2",
      sourceUrl: row.url,
      sourceRef: "bridge_seed_pack"
    });
    idx += 1;
  }
  return items;
};

const main = async () => {
  const enabled = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_ENABLED", true);
  const mode = env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_MODE", "seed_pack").toLowerCase();
  const outputPath = resolvePath(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH"), path.join(CWD, "state", "notebooklm-intake.json"));
  const overwrite = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BRIDGE_OVERWRITE", false);
  const limit = Number.parseInt(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_SEED_LIMIT", "20"), 10) || 20;
  const category = env("KNOWLEDGE_PIPELINE_CATEGORY_FILTER", "MCP");
  const packPath = resolvePath(
    env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_PACK_PATH"),
    path.join(CWD, "docs", "NOTEBOOKLM_US_STOCK_RESEARCH_PACK_2026-04-10.md")
  );
  const playbookPath = resolvePath(
    env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_PLAYBOOK_PATH"),
    path.join(CWD, "docs", "MARKET_INTEL_AUTOTRADING_UPLIFT_PLAYBOOK_2026-04-10.md")
  );

  if (!enabled) {
    console.log("[NOTEBOOKLM_BRIDGE] status=skip_disabled");
    return;
  }
  if (!overwrite && fs.existsSync(outputPath)) {
    console.log(`[NOTEBOOKLM_BRIDGE] status=skip_existing output=${path.relative(CWD, outputPath)}`);
    return;
  }
  if (mode !== "seed_pack") {
    console.log(`[NOTEBOOKLM_BRIDGE] status=skip_unknown_mode mode=${mode}`);
    return;
  }

  const content = `${readText(packPath)}\n${readText(playbookPath)}`;
  const links = markdownLinks(content);
  const items = buildSeedItems({ links, limit, category });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: "seed_pack",
        source: {
          packPath: path.relative(CWD, packPath),
          playbookPath: path.relative(CWD, playbookPath)
        },
        items
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(
    `[NOTEBOOKLM_BRIDGE] status=ok mode=seed_pack links=${links.length} items=${items.length} output=${path.relative(CWD, outputPath)}`
  );
};

main().catch((error) => {
  console.error(`[NOTEBOOKLM_BRIDGE] fail: ${error?.message || error}`);
  process.exit(1);
});
