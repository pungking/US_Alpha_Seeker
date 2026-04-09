import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const NOTION_VERSION = "2022-06-28";
const REPORT_PATH = path.join(CWD, "state", "knowledge-intake-pipeline-report.json");
const QUEUE_JSON_PATH = path.join(CWD, "state", "knowledge-approved-queue.json");
const QUEUE_MD_PATH = path.join(CWD, "state", "knowledge-approved-queue.md");
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

const main = async () => {
  const notionToken = env("NOTION_TOKEN");
  const notionWorkList = env("NOTION_WORK_LIST");
  const apply = boolFromEnv("KNOWLEDGE_PIPELINE_APPLY", false);
  const required = boolFromEnv("KNOWLEDGE_PIPELINE_REQUIRED", false);

  const pendingStatus = env("KNOWLEDGE_PIPELINE_PENDING_STATUS", "승인대기");
  const approvedStatus = env("KNOWLEDGE_PIPELINE_APPROVED_STATUS", "승인");
  const reflectStatus = env("KNOWLEDGE_PIPELINE_REFLECT_STATUS", "코드반영");
  const categoryFilter = env("KNOWLEDGE_PIPELINE_CATEGORY_FILTER", "MCP");
  const limit = Number.parseInt(env("KNOWLEDGE_PIPELINE_LIMIT", "20"), 10) || 20;

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    required,
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
    }
  };

  try {
    if (!notionToken || !notionWorkList) {
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

      const queueItems = approvedRows.map((row) => ({
        pageId: row.id,
        title: titleFromPage(row, titleName),
        status: statusFromPage(row, statusProp),
        category: categoryProp?.name ? selectFromPage(row, categoryProp.name) : "",
        priority: priorityProp?.name ? selectFromPage(row, priorityProp.name) : "",
        summary: summaryProp ? richTextFromPage(row, summaryProp) : ""
      }));

      fs.mkdirSync(path.dirname(QUEUE_JSON_PATH), { recursive: true });
      fs.writeFileSync(QUEUE_JSON_PATH, `${JSON.stringify({ generatedAt: report.generatedAt, queueItems }, null, 2)}\n`, "utf8");
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

      let transitioned = 0;
      if (apply && queueItems.length > 0) {
        if (!statusProp.options.includes(reflectStatus)) {
          throw new Error(`reflect status option not found: ${reflectStatus}`);
        }
        for (const item of queueItems) {
          const patch = statusPatch(statusProp, reflectStatus);
          await notionRequest(notionToken, `/v1/pages/${item.pageId}`, {
            method: "PATCH",
            body: JSON.stringify({ properties: patch })
          });
          transitioned += 1;
        }
      }

      report.notion.status = "ok";
      report.notion.approved = queueItems.length;
      report.notion.transitioned = transitioned;
      report.queue.count = queueItems.length;
    }
  } catch (error) {
    report.notion.status = "fail";
    report.notion.reason = error?.message || String(error);
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[KNOWLEDGE_PIPELINE] notion=${report.notion.status} approved=${report.notion.approved} transitioned=${report.notion.transitioned} apply=${apply} queue=${path.relative(
      CWD,
      QUEUE_MD_PATH
    )} report=${path.relative(CWD, REPORT_PATH)}`
  );

  if (report.notion.status === "fail" && required) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[KNOWLEDGE_PIPELINE] fail: ${error?.message || error}`);
  process.exit(1);
});
