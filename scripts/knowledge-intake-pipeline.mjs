import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const NOTION_VERSION = "2022-06-28";
const REPORT_PATH = path.join(CWD, "state", "knowledge-intake-pipeline-report.json");
const QUEUE_JSON_PATH = path.join(CWD, "state", "knowledge-approved-queue.json");
const QUEUE_MD_PATH = path.join(CWD, "state", "knowledge-approved-queue.md");
const OBSIDIAN_QUEUE_MD_PATH = path.join(CWD, "state", "knowledge-approved-queue-obsidian.md");
const NOTEBOOKLM_DEFAULT_JSON_PATH = path.join(CWD, "state", "notebooklm-intake.json");
const ENV_FILE_CANDIDATES = [
  path.join(CWD, ".env"),
  path.join(CWD, ".vscode", "mcp.env"),
  path.join(CWD, ".vscode", "mcp.env.local")
];

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

const buildEnvMap = () => {
  const map = {};
  for (const filePath of ENV_FILE_CANDIDATES) {
    const chunk = parseDotEnv(filePath);
    for (const [key, value] of Object.entries(chunk)) map[key] = value;
  }
  for (const [key, value] of Object.entries(process.env)) {
    if (value == null) continue;
    map[key] = String(value);
  }
  return map;
};

const ENV_MAP = buildEnvMap();
const env = (name, fallback = "") => String(ENV_MAP[name] ?? fallback).trim();
const boolFromEnv = (name, fallback = false) => {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const short = (value, max = 1800) => String(value ?? "").trim().slice(0, max);
const safeId = (value, fallback) => {
  const text = String(value ?? "").trim();
  if (text) return text;
  return fallback;
};
const noteNameFromPath = (filePath) => path.basename(String(filePath || "").replace(/\\/g, "/"), ".md").trim();
const slugifyFileName = (value, fallback = "item") => {
  const raw = String(value || "").toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
};
const looksLikeUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
const looksMachineTitle = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (text.startsWith("seed-") || text.startsWith("nlm-")) return true;
  if (text.includes("https-") || text.includes("-http-")) return true;
  const hyphenCount = (text.match(/-/g) || []).length;
  const spaceCount = (text.match(/\s/g) || []).length;
  if (spaceCount === 0 && hyphenCount >= 4) return true;
  if (/^[a-z0-9]+(?:-[a-z0-9]+){5,}$/.test(text)) return true;
  return false;
};
const titleCase = (value) =>
  String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
const humanizeToken = (value) =>
  titleCase(
    String(value || "")
      .replace(/newsevents/gi, "news events")
      .replace(/pressreleases/gi, "press releases")
      .replace(/monetarypolicy/gi, "monetary policy")
      .replace(/fomccalendars/gi, "FOMC calendars")
      .replace(/searchedgar/gi, "search EDGAR")
      .replace(/companysearch/gi, "company search")
      .replace(/marketreports/gi, "market reports")
      .replace(/commitmentsoftraders/gi, "commitments of traders")
      .replace(/gdpnow/gi, "GDPNow")
      .replace(/empsit(?=[_-]|\b)/gi, "employment situation")
      .replace(/cpi(?=[_-]|\b)/gi, "CPI")
      .replace(/fedwatch/gi, "FedWatch")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/([a-zA-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([a-zA-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
  );
const headlineFromUrl = (url) => {
  try {
    const parsed = new URL(String(url || ""));
    const host = parsed.hostname.replace(/^www\./, "");
    const hostStem = host.split(".")[0] || "source";
    const pathTokens = parsed.pathname
      .split("/")
      .map((x) => decodeURIComponent(x))
      .map((x) => x.replace(/\.[a-z0-9]+$/i, ""))
      .map((x) => x.replace(/[^a-zA-Z0-9_-]+/g, " ").trim())
      .map((x) => humanizeToken(x))
      .filter(Boolean)
      .slice(0, 4);
    const hostLabel = humanizeToken(hostStem.replace(/[^a-zA-Z0-9_-]+/g, " "));
    const pathLabel = titleCase(pathTokens.join(" "));
    return short(pathLabel ? `${hostLabel} ${pathLabel}` : hostLabel, 120);
  } catch {
    return "";
  }
};
const readableHeadline = (title, sourceUrl, fallback) => {
  const normalized = short(String(title || "").replace(/\s+/g, " "), 120).trim();
  if (normalized && !looksLikeUrl(normalized) && normalized.length >= 8 && !looksMachineTitle(normalized)) return normalized;
  const fromUrl = headlineFromUrl(sourceUrl);
  if (fromUrl) return fromUrl;
  return fallback;
};
const extractKeywords = (item) => {
  const text = `${item?.title || ""} ${item?.summary || ""} ${item?.sourceUrl || ""}`.toLowerCase();
  const raw = text
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const stop = new Set([
    "https",
    "http",
    "www",
    "com",
    "org",
    "html",
    "news",
    "market",
    "markets",
    "index",
    "report",
    "analysis",
    "source",
    "notebooklm",
    "seed"
  ]);
  const freq = new Map();
  for (const token of raw) {
    if (token.length < 3 || stop.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word);
};
const inferTheme = (item) => {
  const text = `${item?.title || ""} ${item?.summary || ""} ${item?.sourceUrl || ""}`.toLowerCase();
  if (/(federalreserve|fomc|fedwatch|cpi|employment|gdp|rates|interest)/.test(text)) return "Macro & Rates";
  if (/(vix|volatility|cboe|drawdown|risk|hedge)/.test(text)) return "Volatility & Risk";
  if (/(earnings|guidance|revenue|profit|season)/.test(text)) return "Earnings & Fundamentals";
  if (/(sector|rotation|flow|momentum|trend)/.test(text)) return "Sector & Trend";
  if (/(policy|regulation|sec|edgar)/.test(text)) return "Policy & Compliance";
  return "General Market Intel";
};
const resolvePath = (value, fallbackPath) => {
  const raw = String(value || "").trim();
  if (!raw) return fallbackPath;
  if (path.isAbsolute(raw)) return raw;
  return path.join(CWD, raw);
};

const notionHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
});

const notionRequest = async (token, route, init = {}) => {
  const response = await fetch(`https://api.notion.com${route}`, {
    method: "GET",
    ...init,
    headers: {
      ...notionHeaders(token),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Notion ${route} failed (${response.status}): ${JSON.stringify(body).slice(0, 400)}`);
  }
  return body;
};

const queryDatabaseAll = async (token, databaseId, payload = {}) => {
  const out = [];
  let cursor = null;
  do {
    const req = {
      page_size: 100,
      ...payload
    };
    if (cursor) req.start_cursor = cursor;
    const res = await notionRequest(token, `/v1/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(req)
    });
    out.push(...(Array.isArray(res?.results) ? res.results : []));
    cursor = res?.has_more ? res?.next_cursor || null : null;
  } while (cursor);
  return out;
};

const findTitleProperty = (properties = {}) => {
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "title") return name;
  }
  return null;
};

const findStatusProperty = (properties = {}) => {
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "status") {
      const options = Array.isArray(def?.status?.options) ? def.status.options.map((x) => x.name) : [];
      return { name, type: "status", options };
    }
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "select" && (name === "상태" || name.toLowerCase() === "status")) {
      const options = Array.isArray(def?.select?.options) ? def.select.options.map((x) => x.name) : [];
      return { name, type: "select", options };
    }
  }
  return null;
};

const findSelectProperty = (properties = {}, names = []) => {
  for (const name of names) {
    if (properties?.[name]?.type === "select") {
      const options = Array.isArray(properties[name]?.select?.options)
        ? properties[name].select.options.map((x) => x.name)
        : [];
      return { name, options };
    }
  }
  return null;
};

const findRichTextProperty = (properties = {}, names = []) => {
  for (const name of names) {
    if (properties?.[name]?.type === "rich_text") return name;
  }
  return null;
};

const titleFromPage = (page, titleName) => {
  const arr = page?.properties?.[titleName]?.title || [];
  return arr.map((x) => x?.plain_text || "").join("").trim();
};

const richTextFromPage = (page, name) => {
  if (!name) return "";
  const arr = page?.properties?.[name]?.rich_text || [];
  return arr.map((x) => x?.plain_text || "").join("").trim();
};

const selectFromPage = (page, name) => {
  if (!name) return "";
  return String(page?.properties?.[name]?.select?.name || "").trim();
};

const statusFromPage = (page, statusProperty) => {
  if (!statusProperty) return "";
  if (statusProperty.type === "status") return String(page?.properties?.[statusProperty.name]?.status?.name || "").trim();
  return String(page?.properties?.[statusProperty.name]?.select?.name || "").trim();
};

const statusPatch = (statusProperty, optionName) => {
  if (!statusProperty || !optionName) return null;
  if (statusProperty.type === "status") return { [statusProperty.name]: { status: { name: optionName } } };
  return { [statusProperty.name]: { select: { name: optionName } } };
};

const markdownQueue = ({ generatedAt, apply, pendingStatus, approvedStatus, reflectStatus, items }) => {
  const lines = [];
  lines.push(`# Knowledge Approved Queue`);
  lines.push("");
  lines.push(`- generatedAt: \`${generatedAt}\``);
  lines.push(`- apply: \`${apply}\``);
  lines.push(`- status flow: \`${pendingStatus} -> ${approvedStatus} -> ${reflectStatus}\``);
  lines.push(`- approved count: \`${items.length}\``);
  lines.push("");
  lines.push("## Queue");
  lines.push("");
  if (items.length === 0) {
    lines.push("- (none)");
  } else {
    let idx = 1;
    for (const item of items) {
      lines.push(`${idx}. ${item.title}`);
      lines.push(`   - status: ${item.status}`);
      lines.push(`   - category: ${item.category || "N/A"}`);
      lines.push(`   - priority: ${item.priority || "N/A"}`);
      lines.push(`   - summary: ${item.summary || "N/A"}`);
      if (item.sourceUrl) lines.push(`   - sourceUrl: ${item.sourceUrl}`);
      lines.push(`   - source: ${item.sourceType || "N/A"}`);
      lines.push(`   - pageId: ${item.pageId}`);
      idx += 1;
    }
  }
  lines.push("");
  lines.push("## PR Template (Approved Item)");
  lines.push("");
  lines.push("```markdown");
  lines.push("### What");
  lines.push("- [ ] Implement approved research item (shadow-only)");
  lines.push("");
  lines.push("### Why");
  lines.push("- [ ] Link NotebookLM/Obsidian evidence");
  lines.push("- [ ] Expected impact (precision/risk/latency)");
  lines.push("");
  lines.push("### Scope");
  lines.push("- [ ] feature flag added/updated");
  lines.push("- [ ] run summary evidence fields added");
  lines.push("- [ ] no live-order path change");
  lines.push("");
  lines.push("### Validation");
  lines.push("- [ ] dry-run evidence (>=3 runs)");
  lines.push("- [ ] skip_reasons explainable");
  lines.push("- [ ] ops-health PASS (or explainable WARN)");
  lines.push("");
  lines.push("### Rollback");
  lines.push("- [ ] one-flag rollback path documented");
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownObsidianQueue = ({ generatedAt, sourcePath, statusFlow, items }) => {
  const lines = [];
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`sourceQueue: "${sourcePath}"`);
  lines.push(`statusFlow: "${statusFlow}"`);
  lines.push("---");
  lines.push("");
  lines.push("# Knowledge Intake Queue (Approved)");
  lines.push("");
  if (items.length === 0) {
    lines.push("- 승인 항목 없음");
  } else {
    let idx = 1;
    for (const item of items) {
      lines.push(`## ${idx}. ${item.title}`);
      lines.push(`- status: ${item.status || "N/A"}`);
      lines.push(`- category: ${item.category || "N/A"}`);
      lines.push(`- priority: ${item.priority || "N/A"}`);
      lines.push(`- summary: ${item.summary || "N/A"}`);
      if (item.sourceUrl) lines.push(`- sourceUrl: ${item.sourceUrl}`);
      lines.push(`- source: ${item.sourceType || "N/A"}`);
      lines.push(`- notionPageId: ${item.pageId}`);
      lines.push("");
      idx += 1;
    }
  }
  lines.push("## Next");
  lines.push("- [ ] shadow-only 범위로 코드 반영");
  lines.push("- [ ] dry-run evidence >= 3회 확보");
  lines.push("- [ ] rollback flag 경로 확인");
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownGraphItem = ({ generatedAt, item, hubLink, packLink, playbookLink, themeHubLink, relatedLinks = [] }) => {
  const lines = [];
  const keywords = Array.isArray(item?.keywords) ? item.keywords : [];
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`sourceType: "${item.sourceType || "N/A"}"`);
  lines.push(`itemId: "${item.pageId}"`);
  lines.push(`priority: "${item.priority || "N/A"}"`);
  lines.push(`category: "${item.category || "N/A"}"`);
  lines.push(`theme: "${item.theme || "General Market Intel"}"`);
  lines.push("aliases:");
  lines.push(`  - "${String(item.displayTitle || item.title || "").replace(/"/g, '\\"')}"`);
  lines.push("tags:");
  lines.push("  - knowledge-intake");
  lines.push("  - notebooklm");
  lines.push("  - market-intel");
  lines.push(`  - theme-${slugifyFileName(item.theme || "general", "general")}`);
  for (const keyword of keywords) lines.push(`  - kw-${keyword}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${item.displayTitle || item.title}`);
  lines.push("");
  lines.push("## Link Graph");
  lines.push(`- [[${hubLink}]]`);
  lines.push(`- [[${packLink}]]`);
  lines.push(`- [[${playbookLink}]]`);
  lines.push(`- [[${themeHubLink}]]`);
  lines.push(`- theme: ${item.theme || "General Market Intel"}`);
  if (item.sourceUrl) lines.push(`- sourceUrl: ${item.sourceUrl}`);
  if (keywords.length > 0) lines.push(`- keywords: ${keywords.join(", ")}`);
  if (relatedLinks.length > 0) lines.push(`- related: ${relatedLinks.map((x) => `[[${x}]]`).join(", ")}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(item.summary || "N/A");
  lines.push("");
  lines.push("## Why this note exists");
  lines.push("- Captures one intake source as a reusable knowledge node.");
  lines.push("- Connects source -> theme cluster -> response playbook for fast graph navigation.");
  lines.push("");
  lines.push("## 대응안(초안)");
  lines.push("- [ ] 시그널/지표 반영 포인트 정리");
  lines.push("- [ ] shadow-only 검증 설계");
  lines.push("- [ ] 롤백 조건 명시");
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownThemeHub = ({ generatedAt, theme, items, hubLink, packLink, playbookLink }) => {
  const lines = [];
  const keywords = new Map();
  for (const item of items) {
    for (const keyword of item.keywords || []) keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
  }
  const topKeywords = [...keywords.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([word, count]) => `${word} (${count})`);
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`theme: "${theme}"`);
  lines.push("tags:");
  lines.push("  - knowledge-hub");
  lines.push("  - theme-cluster");
  lines.push(`  - theme-${slugifyFileName(theme, "general")}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Theme Hub - ${theme}`);
  lines.push("");
  lines.push("## Links");
  lines.push(`- [[${hubLink}]]`);
  lines.push(`- [[${packLink}]]`);
  lines.push(`- [[${playbookLink}]]`);
  lines.push("");
  lines.push("## Notes");
  for (const item of items) lines.push(`- [[${item.noteName}]]`);
  lines.push("");
  lines.push("## Keyword Lens");
  if (topKeywords.length === 0) lines.push("- (none)");
  else for (const row of topKeywords) lines.push(`- ${row}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownGraphHub = ({ generatedAt, sourceMode, items, packLink, playbookLink }) => {
  const themeMap = new Map();
  const keywordCounts = new Map();
  for (const item of items) {
    const theme = item.theme || "General Market Intel";
    if (!themeMap.has(theme)) themeMap.set(theme, []);
    themeMap.get(theme).push(item);
    for (const keyword of item.keywords || []) {
      keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
    }
  }
  const topKeywords = [...keywordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines = [];
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`sourceMode: "${sourceMode}"`);
  lines.push("tags:");
  lines.push("  - knowledge-hub");
  lines.push("  - notebooklm");
  lines.push("---");
  lines.push("");
  lines.push("# NotebookLM Intake Graph Hub");
  lines.push("");
  lines.push("## Core Docs");
  lines.push(`- [[${packLink}]]`);
  lines.push(`- [[${playbookLink}]]`);
  lines.push("");
  lines.push("## Headline Clusters");
  if (items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const [theme, rows] of themeMap.entries()) {
      lines.push(`### ${theme}`);
      if (rows[0]?.themeHubName) lines.push(`- Theme Hub: [[${rows[0].themeHubName}]]`);
      for (const item of rows) {
        lines.push(`- [[${item.noteName}]] · ${item.displayTitle || item.title}`);
      }
      lines.push("");
    }
  }
  lines.push("## Note Legend");
  lines.push("- `NotebookLM_US_Stock_Research_Pack...`: source batch used to collect references.");
  lines.push("- `Market_Intel_AutoTrading_Uplift_Playbook...`: candidate response actions and rollout ideas.");
  lines.push("- `Theme Hub - ...`: cluster entry point by macro/risk/earnings/trend.");
  lines.push("");
  lines.push("## Keyword Lens");
  if (topKeywords.length === 0) {
    lines.push("- (none)");
  } else {
    for (const [keyword, count] of topKeywords) lines.push(`- ${keyword} (${count})`);
  }
  lines.push("");
  lines.push("## Next");
  lines.push("- [ ] 연관 노트 상호 링크 보강");
  lines.push("- [ ] 대응안 검증 결과를 노트별로 누적");
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const obsidianRequest = async ({ baseUrl, apiKey, method = "GET", route = "/", body = null, contentType = "application/json" }) => {
  const url = `${baseUrl.replace(/\/+$/, "")}${route}`;
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (contentType) headers["Content-Type"] = contentType;
  const response = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Obsidian ${route} failed (${response.status}): ${short(text, 400)}`);
  }
  return text;
};

const encodeVaultPath = (filePath) => filePath.split("/").map((part) => encodeURIComponent(part)).join("/");

const parseNotebooklmQueue = (jsonPath, fallbackCategory, fallbackPriority, limit) => {
  if (!fs.existsSync(jsonPath)) {
    return { status: "skip_missing_file", reason: `missing ${path.relative(CWD, jsonPath)}`, items: [] };
  }
  const raw = fs.readFileSync(jsonPath, "utf8").trim();
  if (!raw) {
    return { status: "skip_empty_file", reason: `empty ${path.relative(CWD, jsonPath)}`, items: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "fail_parse",
      reason: `invalid json ${path.relative(CWD, jsonPath)}: ${error?.message || error}`,
      items: []
    };
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  const rows = list.slice(0, Math.max(1, limit));
  const items = rows.map((row, index) => {
    const rawTitle = String(row?.title || row?.topic || row?.headline || "").trim();
    const summary = String(row?.summary || row?.insight || row?.notes || "").trim();
    const category = String(row?.category || row?.area || fallbackCategory || "").trim();
    const priority = String(row?.priority || fallbackPriority || "").trim();
    const sourceUrl = String(row?.sourceUrl || row?.url || row?.source || "").trim();
    const sourceRef = String(row?.sourceRef || row?.notebook || row?.notebookId || "").trim();
    const idBase = safeId(row?.id, `notebooklm-${index + 1}`);
    const title = readableHeadline(rawTitle, sourceUrl, `NotebookLM Item ${index + 1}`);
    return {
      pageId: idBase,
      title,
      status: "승인",
      category: category || "NotebookLM",
      priority: priority || "P2",
      summary,
      sourceUrl,
      sourceRef,
      sourceType: "notebooklm_json"
    };
  });
  return {
    status: "ok",
    reason: "",
    items
  };
};

const main = async () => {
  const sourceModeRaw = env("KNOWLEDGE_PIPELINE_SOURCE_MODE", "notion").toLowerCase();
  const sourceMode = ["notion", "notebooklm_json", "hybrid"].includes(sourceModeRaw) ? sourceModeRaw : "notion";
  const notebooklmJsonPath = resolvePath(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH"), NOTEBOOKLM_DEFAULT_JSON_PATH);
  const notebooklmRequired = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED", false);

  const notionToken = env("NOTION_TOKEN");
  const notionWorkList = env("NOTION_WORK_LIST");
  const apply = boolFromEnv("KNOWLEDGE_PIPELINE_APPLY", false);
  const required = boolFromEnv("KNOWLEDGE_PIPELINE_REQUIRED", false);

  const pendingStatus = env("KNOWLEDGE_PIPELINE_PENDING_STATUS", "승인대기");
  const approvedStatus = env("KNOWLEDGE_PIPELINE_APPROVED_STATUS", "승인");
  const reflectStatus = env("KNOWLEDGE_PIPELINE_REFLECT_STATUS", "코드반영");
  const categoryFilter = env("KNOWLEDGE_PIPELINE_CATEGORY_FILTER", "MCP");
  const limit = Number.parseInt(env("KNOWLEDGE_PIPELINE_LIMIT", "20"), 10) || 20;
  const obsidianApply = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY", false);
  const obsidianRequired = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_REQUIRED", false);
  const obsidianDryRun = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_DRY_RUN", false);
  const obsidianBaseUrl = env("OBSIDIAN_BASE_URL", "http://127.0.0.1:27123");
  const obsidianApiKey = env("OBSIDIAN_API_KEY");
  const obsidianNotePath = env("KNOWLEDGE_PIPELINE_OBSIDIAN_NOTE_PATH", "99_Automation/Knowledge Approved Queue.md");
  const obsidianGraphApply = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_APPLY", true);
  const obsidianGraphHubPath = env(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_PATH",
    "99_Automation/NotebookLM/NotebookLM_Intake_Graph_Hub.md"
  );
  const obsidianGraphItemDir = env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ITEM_DIR", "99_Automation/NotebookLM/Intake");
  const obsidianGraphPackNote = env(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PACK_NOTE",
    "99_Automation/NotebookLM_US_Stock_Research_Pack_2026-04-10.md"
  );
  const obsidianGraphPlaybookNote = env(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_PLAYBOOK_NOTE",
    "99_Automation/Market_Intel_AutoTrading_Uplift_Playbook_2026-04-10.md"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    required,
    source: {
      mode: sourceMode,
      notebooklmJsonPath: path.relative(CWD, notebooklmJsonPath),
      notebooklmRequired,
      notebooklmStatus: "skip",
      notebooklmReason: "",
      notebooklmLoaded: 0
    },
    statusFlow: { pendingStatus, approvedStatus, reflectStatus },
    notion: {
      status: "skip",
      reason: "",
      databaseId: notionWorkList || null,
      approved: 0,
      transitioned: 0
    },
    queue: {
      pathJson: path.relative(CWD, QUEUE_JSON_PATH),
      pathMd: path.relative(CWD, QUEUE_MD_PATH),
      count: 0
    },
    obsidian: {
      apply: obsidianApply,
      required: obsidianRequired,
      dryRun: obsidianDryRun,
      status: "skip_disabled",
      reason: "",
      baseUrl: obsidianBaseUrl || null,
      notePath: obsidianNotePath,
      queuePath: path.relative(CWD, OBSIDIAN_QUEUE_MD_PATH),
      uploaded: false,
      bytes: 0,
      fallback: "notion_queue_only",
      graphApply: obsidianGraphApply,
      graphHubPath: obsidianGraphHubPath,
      graphItemDir: obsidianGraphItemDir,
      graphUploadedItems: 0,
      graphUploadedHub: false
    }
  };

  let queueItems = [];
  let notionItems = [];
  let notebooklmItems = [];
  try {
    if (!["notion", "hybrid"].includes(sourceMode)) {
      report.notion.status = "skip_source_mode";
      report.notion.reason = `source_mode=${sourceMode}`;
    } else if (!notionToken || !notionWorkList) {
      report.notion.status = "skip_missing_env";
      report.notion.reason = "NOTION_TOKEN or NOTION_WORK_LIST missing";
    } else {
      const db = await notionRequest(notionToken, `/v1/databases/${notionWorkList}`, { method: "GET" });
      const props = db?.properties || {};
      const titleName = findTitleProperty(props);
      const statusProp = findStatusProperty(props);
      const categoryProp = findSelectProperty(props, ["분류", "Category"]);
      const priorityProp = findSelectProperty(props, ["우선순위", "Priority"]);
      const summaryProp = findRichTextProperty(props, ["요약", "Summary"]);
      if (!titleName || !statusProp) {
        throw new Error("NOTION_WORK_LIST DB requires title + status/select property");
      }

      const rows = await queryDatabaseAll(notionToken, notionWorkList, {});
      const approvedRows = rows
        .filter((row) => statusFromPage(row, statusProp) === approvedStatus)
        .filter((row) => {
          if (!categoryFilter) return true;
          if (!categoryProp?.name) return true;
          return selectFromPage(row, categoryProp.name) === categoryFilter;
        })
        .slice(0, Math.max(1, limit));

      notionItems = approvedRows.map((row) => ({
        pageId: row.id,
        title: titleFromPage(row, titleName),
        status: statusFromPage(row, statusProp),
        category: categoryProp?.name ? selectFromPage(row, categoryProp.name) : "",
        priority: priorityProp?.name ? selectFromPage(row, priorityProp.name) : "",
        summary: summaryProp ? richTextFromPage(row, summaryProp) : "",
        sourceType: "notion"
      }));

      fs.mkdirSync(path.dirname(QUEUE_JSON_PATH), { recursive: true });
      fs.writeFileSync(QUEUE_JSON_PATH, `${JSON.stringify({ generatedAt: report.generatedAt, queueItems: notionItems }, null, 2)}\n`, "utf8");

      let transitioned = 0;
      if (apply && notionItems.length > 0) {
        if (!statusProp.options.includes(reflectStatus)) {
          throw new Error(`reflect status option not found: ${reflectStatus}`);
        }
        for (const item of notionItems) {
          const patch = statusPatch(statusProp, reflectStatus);
          await notionRequest(notionToken, `/v1/pages/${item.pageId}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: patch })
          });
          transitioned += 1;
        }
      }

      report.notion.status = "ok";
      report.notion.approved = notionItems.length;
      report.notion.transitioned = transitioned;
    }
  } catch (error) {
    report.notion.status = "fail";
    report.notion.reason = error?.message || String(error);
  }

  if (["notebooklm_json", "hybrid"].includes(sourceMode)) {
    const notebooklm = parseNotebooklmQueue(notebooklmJsonPath, categoryFilter, "P2", limit);
    report.source.notebooklmStatus = notebooklm.status;
    report.source.notebooklmReason = notebooklm.reason;
    notebooklmItems = notebooklm.items;
    report.source.notebooklmLoaded = notebooklmItems.length;
  } else {
    report.source.notebooklmStatus = "skip_source_mode";
    report.source.notebooklmReason = `source_mode=${sourceMode}`;
  }

  if (sourceMode === "notion") {
    queueItems = notionItems;
  } else if (sourceMode === "notebooklm_json") {
    queueItems = notebooklmItems;
  } else {
    // hybrid mode
    queueItems = [...notionItems, ...notebooklmItems];
  }
  report.queue.count = queueItems.length;

  fs.mkdirSync(path.dirname(OBSIDIAN_QUEUE_MD_PATH), { recursive: true });
  fs.writeFileSync(
    OBSIDIAN_QUEUE_MD_PATH,
    markdownObsidianQueue({
      generatedAt: report.generatedAt,
      sourcePath: report.queue.pathMd,
      statusFlow: `${pendingStatus} -> ${approvedStatus} -> ${reflectStatus}`,
      items: queueItems
    }),
    "utf8"
  );
  fs.writeFileSync(
    QUEUE_MD_PATH,
    markdownQueue({
      generatedAt: report.generatedAt,
      apply,
      pendingStatus,
      approvedStatus,
      reflectStatus,
      items: queueItems
    }),
    "utf8"
  );
  fs.writeFileSync(QUEUE_JSON_PATH, `${JSON.stringify({ generatedAt: report.generatedAt, sourceMode, queueItems }, null, 2)}\n`, "utf8");

  if (!obsidianApply) {
    report.obsidian.status = "skip_disabled";
    report.obsidian.reason = "KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY=false";
  } else if (queueItems.length === 0) {
    report.obsidian.status = "skip_no_queue";
    report.obsidian.reason =
      sourceMode === "notebooklm_json"
        ? `approved queue is empty (${report.source.notebooklmStatus}${report.source.notebooklmReason ? `: ${report.source.notebooklmReason}` : ""})`
        : "approved queue is empty";
  } else if (!obsidianApiKey || !obsidianBaseUrl) {
    report.obsidian.status = "skip_missing_env";
    report.obsidian.reason = "OBSIDIAN_API_KEY or OBSIDIAN_BASE_URL missing";
  } else if (obsidianDryRun) {
    report.obsidian.status = "dry_run";
    report.obsidian.reason = "KNOWLEDGE_PIPELINE_OBSIDIAN_DRY_RUN=true";
  } else {
    try {
      const content = fs.readFileSync(OBSIDIAN_QUEUE_MD_PATH, "utf8");
      const route = `/vault/${encodeVaultPath(obsidianNotePath)}`;
      await obsidianRequest({
        baseUrl: obsidianBaseUrl,
        apiKey: obsidianApiKey,
        method: "PUT",
        route,
        body: content,
        contentType: "text/markdown"
      });
      const verify = await obsidianRequest({
        baseUrl: obsidianBaseUrl,
        apiKey: obsidianApiKey,
        method: "GET",
        route,
        contentType: null
      });
      let totalBytes = Buffer.byteLength(verify, "utf8");
      if (obsidianGraphApply) {
        const hubLink = noteNameFromPath(obsidianGraphHubPath);
        const packLink = noteNameFromPath(obsidianGraphPackNote);
        const playbookLink = noteNameFromPath(obsidianGraphPlaybookNote);
        const prepared = [];
        const usedNotePaths = new Set();
        const themeHubMap = new Map();
        let index = 1;
        for (const item of queueItems) {
          const displayTitle = readableHeadline(item.title, item.sourceUrl, `NotebookLM Insight ${index}`);
          const keywords = extractKeywords({ ...item, title: displayTitle });
          const theme = inferTheme({ ...item, title: displayTitle });
          const themeSlug = slugifyFileName(theme, "general-market-intel");
          const baseStem = `${String(index).padStart(2, "0")}-${slugifyFileName(displayTitle, `insight-${index}`).slice(0, 56)}`;
          let notePath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/${themeSlug}/${baseStem}.md`;
          let dupe = 2;
          while (usedNotePaths.has(notePath)) {
            notePath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/${themeSlug}/${baseStem}-${dupe}.md`;
            dupe += 1;
          }
          usedNotePaths.add(notePath);
          const noteName = noteNameFromPath(notePath);
          const themeHubPath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes/theme-${themeSlug}.md`;
          const themeHubName = noteNameFromPath(themeHubPath);
          if (!themeHubMap.has(theme)) themeHubMap.set(theme, { themeHubPath, themeHubName });
          prepared.push({ ...item, displayTitle, keywords, theme, noteName, notePath, themeHubPath, themeHubName });
          index += 1;
        }
        const preparedByTheme = new Map();
        for (const item of prepared) {
          if (!preparedByTheme.has(item.theme)) preparedByTheme.set(item.theme, []);
          preparedByTheme.get(item.theme).push(item);
        }
        for (const item of prepared) {
          const peers = preparedByTheme.get(item.theme) || [];
          const scored = peers
            .filter((peer) => peer.noteName !== item.noteName)
            .map((peer) => ({
              noteName: peer.noteName,
              score: peer.keywords.filter((kw) => item.keywords.includes(kw)).length
            }))
            .sort((a, b) => b.score - a.score || a.noteName.localeCompare(b.noteName))
            .slice(0, 2)
            .map((row) => row.noteName);
          const markdown = markdownGraphItem({
            generatedAt: report.generatedAt,
            item,
            hubLink,
            packLink,
            playbookLink,
            themeHubLink: item.themeHubName,
            relatedLinks: scored
          });
          const itemRoute = `/vault/${encodeVaultPath(item.notePath)}`;
          await obsidianRequest({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            method: "PUT",
            route: itemRoute,
            body: markdown,
            contentType: "text/markdown"
          });
          totalBytes += Buffer.byteLength(markdown, "utf8");
        }
        for (const [theme, rows] of preparedByTheme.entries()) {
          const themeHub = themeHubMap.get(theme);
          const themeMarkdown = markdownThemeHub({
            generatedAt: report.generatedAt,
            theme,
            items: rows,
            hubLink,
            packLink,
            playbookLink
          });
          const themeRoute = `/vault/${encodeVaultPath(themeHub.themeHubPath)}`;
          await obsidianRequest({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            method: "PUT",
            route: themeRoute,
            body: themeMarkdown,
            contentType: "text/markdown"
          });
          totalBytes += Buffer.byteLength(themeMarkdown, "utf8");
        }
        const hubMarkdown = markdownGraphHub({
          generatedAt: report.generatedAt,
          sourceMode,
          items: prepared,
          packLink,
          playbookLink
        });
        const hubRoute = `/vault/${encodeVaultPath(obsidianGraphHubPath)}`;
        await obsidianRequest({
          baseUrl: obsidianBaseUrl,
          apiKey: obsidianApiKey,
          method: "PUT",
          route: hubRoute,
          body: hubMarkdown,
          contentType: "text/markdown"
        });
        totalBytes += Buffer.byteLength(hubMarkdown, "utf8");
        report.obsidian.graphUploadedItems = prepared.length;
        report.obsidian.graphUploadedHub = true;
      }
      report.obsidian.status = "ok";
      report.obsidian.uploaded = true;
      report.obsidian.bytes = totalBytes;
    } catch (error) {
      report.obsidian.status = "fail";
      report.obsidian.reason = error?.message || String(error);
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[KNOWLEDGE_PIPELINE] source=${sourceMode} notebooklm=${report.source.notebooklmStatus}/${report.source.notebooklmLoaded} notion=${report.notion.status} approved=${report.notion.approved} transitioned=${report.notion.transitioned} apply=${apply} obsidian=${report.obsidian.status} obsidianApply=${obsidianApply} queue=${path.relative(
      CWD,
      QUEUE_MD_PATH
    )} obsidianQueue=${path.relative(CWD, OBSIDIAN_QUEUE_MD_PATH)} report=${path.relative(CWD, REPORT_PATH)}`
  );

  if (report.notion.status === "fail" && required) {
    process.exit(1);
  }
  if (["notebooklm_json", "hybrid"].includes(sourceMode) && report.source.notebooklmStatus.startsWith("fail") && notebooklmRequired) {
    process.exit(1);
  }
  if (sourceMode === "notebooklm_json" && queueItems.length === 0 && notebooklmRequired) {
    process.exit(1);
  }
  if (report.obsidian.status === "fail" && obsidianRequired) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[KNOWLEDGE_PIPELINE] fail: ${error?.message || error}`);
  process.exit(1);
});
