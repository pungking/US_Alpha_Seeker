import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const NOTION_VERSION = "2022-06-28";
const REPORT_PATH = path.join(CWD, "state", "knowledge-routine-sync-report.json");

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

const env = (envMap, key, fallback = "") => String(envMap[key] ?? fallback).trim();
const boolFromEnv = (envMap, key, fallback = false) => {
  const raw = String(envMap[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
};

const notionHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
});

const notionRequest = async (token, route, init = {}) => {
  const response = await fetch(`https://api.notion.com${route}`, {
    method: "GET",
    headers: notionHeaders(token),
    ...init,
    headers: {
      ...notionHeaders(token),
      ...(init.headers || {})
    }
  });
  const bodyText = await response.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`Notion ${route} failed (${response.status}): ${message}`);
  }
  return body;
};

const ensureDatabaseProperties = async ({ token, databaseId, currentProperties = {}, desiredProperties = {} }) => {
  const missing = {};
  for (const [name, def] of Object.entries(desiredProperties)) {
    if (!currentProperties[name]) missing[name] = def;
  }
  const added = Object.keys(missing);
  if (added.length === 0) return { status: "no_change", added };
  await notionRequest(token, `/v1/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: missing })
  });
  return { status: "patched", added };
};

const queryDatabaseAll = async (token, databaseId, query = {}) => {
  const results = [];
  let startCursor = null;
  do {
    const payload = {
      page_size: 100,
      ...query
    };
    if (startCursor) payload.start_cursor = startCursor;
    const data = await notionRequest(token, `/v1/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    results.push(...(Array.isArray(data?.results) ? data.results : []));
    startCursor = data?.has_more ? data?.next_cursor || null : null;
  } while (startCursor);
  return results;
};

const archivePage = async (token, pageId) => {
  await notionRequest(token, `/v1/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true })
  });
};

const findTitleProperty = (properties = {}) => {
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "title") return name;
  }
  return null;
};

const findStatusProperty = (properties = {}) => {
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type !== "status") continue;
    const optionNames = Array.isArray(def?.status?.options) ? def.status.options.map((x) => x.name) : [];
    const preferred = optionNames.includes("시작 전")
      ? "시작 전"
      : optionNames.includes("할 일")
        ? "할 일"
        : optionNames[0] || null;
    return { name, type: "status", defaultOption: preferred, options: optionNames };
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type !== "select") continue;
    const optionNames = Array.isArray(def?.select?.options) ? def.select.options.map((x) => x.name) : [];
    if (optionNames.includes("할 일")) {
      return { name, type: "select", defaultOption: "할 일", options: optionNames };
    }
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type !== "select") continue;
    const optionNames = Array.isArray(def?.select?.options) ? def.select.options.map((x) => x.name) : [];
    const firstOption = optionNames.length > 0 ? optionNames[0] : null;
    return { name, type: "select", defaultOption: firstOption || null, options: optionNames };
  }
  return null;
};

const findPriorityProperty = (properties = {}) => {
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type !== "select") continue;
    const options = Array.isArray(def?.select?.options) ? def.select.options.map((x) => x.name) : [];
    if (["우선순위", "Priority"].includes(name) || options.includes("중간")) {
      const defaultOption = options.includes("중간") ? "중간" : options[0] || null;
      return { name, type: "select", defaultOption, options };
    }
  }
  return null;
};

const findSelectProperty = (properties = {}, preferredNames = []) => {
  for (const name of preferredNames) {
    if (properties?.[name]?.type === "select") {
      const options = Array.isArray(properties[name]?.select?.options) ? properties[name].select.options.map((x) => x.name) : [];
      return { name, type: "select", options, defaultOption: options[0] || null };
    }
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type !== "select") continue;
    const options = Array.isArray(def?.select?.options) ? def.select.options.map((x) => x.name) : [];
    return { name, type: "select", options, defaultOption: options[0] || null };
  }
  return null;
};

const findDateProperty = (properties = {}, preferredNames = []) => {
  for (const name of preferredNames) {
    if (properties?.[name]?.type === "date") return { name, type: "date" };
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "date") return { name, type: "date" };
  }
  return null;
};

const findRichTextProperty = (properties = {}, preferredNames = []) => {
  for (const name of preferredNames) {
    if (properties?.[name]?.type === "rich_text") return name;
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "rich_text") return name;
  }
  return null;
};

const findRelationProperty = (properties = {}, preferredNames = []) => {
  for (const name of preferredNames) {
    const def = properties?.[name];
    if (def?.type === "relation") {
      return { name, type: "relation" };
    }
  }
  for (const [name, def] of Object.entries(properties)) {
    if (def?.type === "relation") {
      return { name, type: "relation" };
    }
  }
  return null;
};

const queryExistingByTitle = async (token, databaseId, titlePropertyName, title) => {
  const payload = {
    page_size: 1,
    filter: {
      property: titlePropertyName,
      title: { equals: title }
    }
  };
  const data = await notionRequest(token, `/v1/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return Array.isArray(data?.results) && data.results.length > 0 ? data.results[0] : null;
};

const chooseStatusOption = (statusProperty, preferredOptions = []) => {
  const candidates = Array.isArray(preferredOptions) ? preferredOptions.filter(Boolean) : [];
  if (!statusProperty) return null;
  if (!Array.isArray(statusProperty?.options) || statusProperty.options.length === 0) {
    return statusProperty.defaultOption || null;
  }
  for (const preferred of candidates) {
    if (statusProperty.options.includes(preferred)) return preferred;
  }
  return statusProperty.defaultOption || statusProperty.options[0] || null;
};

const upsertRow = async ({
  token,
  databaseId,
  titlePropertyName,
  statusProperty,
  statusOptionName = null,
  priorityProperty,
  priorityOptionName = null,
  relationProperty,
  relationPageId,
  summaryPropertyName,
  summaryText,
  extraProperties = {},
  title
}) => {
  const existing = await queryExistingByTitle(token, databaseId, titlePropertyName, title);
  const properties = {
    [titlePropertyName]: {
      title: [{ text: { content: title } }]
    }
  };
  const resolvedStatus = statusOptionName || statusProperty?.defaultOption || null;
  if (statusProperty?.name && resolvedStatus) {
    properties[statusProperty.name] =
      statusProperty.type === "status"
        ? { status: { name: resolvedStatus } }
        : { select: { name: resolvedStatus } };
  }
  const resolvedPriority = priorityOptionName || priorityProperty?.defaultOption || null;
  if (priorityProperty?.name && resolvedPriority) {
    properties[priorityProperty.name] = { select: { name: resolvedPriority } };
  }
  if (relationProperty?.name && relationPageId) {
    properties[relationProperty.name] = {
      relation: [{ id: relationPageId }]
    };
  }
  if (summaryPropertyName && summaryText) {
    properties[summaryPropertyName] = {
      rich_text: [{ text: { content: summaryText } }]
    };
  }
  for (const [name, value] of Object.entries(extraProperties || {})) {
    if (!name || !value) continue;
    properties[name] = value;
  }
  if (existing?.id) {
    await notionRequest(token, `/v1/pages/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties })
    });
    return { status: "updated", pageId: existing.id };
  }
  const created = await notionRequest(token, "/v1/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties
    })
  });
  return { status: "created", pageId: created.id };
};

const appendProjectBlocks = async ({ token, projectPageId, viewSpecTitles }) => {
  if (!projectPageId) return { status: "skip", reason: "missing_project_page" };
  const existingChildren = await notionRequest(token, `/v1/blocks/${projectPageId}/children?page_size=100`, { method: "GET" });
  const hasMarker = Array.isArray(existingChildren?.results)
    ? existingChildren.results.some((block) => {
        if (block?.type !== "heading_3") return false;
        const texts = Array.isArray(block?.heading_3?.rich_text) ? block.heading_3.rich_text.map((x) => x?.plain_text || "").join(" ") : "";
        return texts.includes("[AUTO] Ops View Setup Guide");
      })
    : false;
  if (hasMarker) {
    return { status: "exists", blocks: 0 };
  }

  const date = new Date().toISOString().slice(0, 10);
  const children = [
    {
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: `[AUTO] Ops View Setup Guide (${date})` } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: "Today: 상태=할 일, 생성일=오늘" } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: "This Week: 상태!=완료, 생성일=이번 주" } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: "Blocked: 제목에 [Blocked] 포함 또는 별도 select/status 컬럼으로 분리" } }]
      }
    },
    {
      object: "block",
      type: "bulleted_list_item",
      bulleted_list_item: {
        rich_text: [{ type: "text", text: { content: "Incident: 제목에 [Incident] 포함 + 인시던트 로그 링크 relation 권장" } }]
      }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: `Seeded Tasks: ${viewSpecTitles.join(" | ")}` } }]
      }
    }
  ];
  await notionRequest(token, `/v1/blocks/${projectPageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children })
  });
  return { status: "appended", blocks: children.length };
};

const ensureChildDatabase = async ({
  token,
  projectPageId,
  existingChildDatabases,
  title,
  properties
}) => {
  const existing = (existingChildDatabases || []).find((x) => x.title === title);
  if (existing?.id) return { id: existing.id, status: "existing" };
  const created = await notionRequest(token, "/v1/databases", {
    method: "POST",
    body: JSON.stringify({
      parent: {
        type: "page_id",
        page_id: projectPageId
      },
      title: [
        {
          type: "text",
          text: { content: title }
        }
      ],
      is_inline: true,
      properties
    })
  });
  return { id: created?.id || "", status: "created" };
};

const listProjectChildDatabases = async ({ token, projectPageId }) => {
  if (!projectPageId) return [];
  const data = await notionRequest(token, `/v1/blocks/${projectPageId}/children?page_size=100`, { method: "GET" });
  const out = [];
  for (const block of data?.results || []) {
    if (block?.type !== "child_database") continue;
    out.push({
      id: block.id,
      title: block?.child_database?.title || "N/A"
    });
  }
  return out;
};

const listProjectRows = async ({ token, projectDbId }) => {
  if (!projectDbId) return [];
  const data = await notionRequest(token, `/v1/databases/${projectDbId}/query`, {
    method: "POST",
    body: JSON.stringify({ page_size: 50 })
  });
  return Array.isArray(data?.results) ? data.results : [];
};

const pageTitleFromRow = (row, titlePropertyName) =>
  Array.isArray(row?.properties?.[titlePropertyName]?.title)
    ? row.properties[titlePropertyName].title.map((x) => x.plain_text || "").join("")
    : "";

const extractPlainTextFromBlock = (block) => {
  if (!block || typeof block !== "object") return "";
  const type = block.type;
  const rich = Array.isArray(block?.[type]?.rich_text) ? block[type].rich_text : [];
  return rich.map((x) => x?.plain_text || "").join("").trim();
};

const cleanupAutoBlocksInProjectPage = async ({ token, projectPageId }) => {
  if (!projectPageId) return { status: "skip", archived: 0 };
  const data = await notionRequest(token, `/v1/blocks/${projectPageId}/children?page_size=100`, { method: "GET" });
  const blocks = Array.isArray(data?.results) ? data.results : [];
  let inAuto = false;
  const toArchive = [];

  for (const block of blocks) {
    const text = extractPlainTextFromBlock(block);
    if (block.type === "heading_3" && text.startsWith("[AUTO]")) {
      inAuto = true;
      toArchive.push(block.id);
      continue;
    }
    if (!inAuto) continue;
    if (["bulleted_list_item", "numbered_list_item", "paragraph", "to_do", "callout", "quote"].includes(block.type)) {
      toArchive.push(block.id);
      continue;
    }
    if (block.type === "heading_3" && text.startsWith("[AUTO]")) {
      toArchive.push(block.id);
      continue;
    }
    inAuto = false;
  }

  for (const blockId of toArchive) {
    await notionRequest(token, `/v1/blocks/${blockId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true })
    });
  }
  return { status: toArchive.length > 0 ? "cleaned" : "no_auto_block", archived: toArchive.length };
};

const cleanupProgramBoardBlocksInProjectPage = async ({ token, projectPageId, markerTitle, sectionTitles = [] }) => {
  if (!projectPageId) return { status: "skip", archived: 0 };
  const data = await notionRequest(token, `/v1/blocks/${projectPageId}/children?page_size=100`, { method: "GET" });
  const blocks = Array.isArray(data?.results) ? data.results : [];
  const sectionTitleSet = new Set(sectionTitles);
  let inMarker = false;
  const toArchive = [];

  for (const block of blocks) {
    const text = extractPlainTextFromBlock(block);
    const isHeading = block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3";
    const isBoardHeading = block.type === "heading_3" && sectionTitleSet.has(text);
    const isUpdateLine = block.type === "paragraph" && text.startsWith("업데이트 기준일:");
    if (isHeading && text === markerTitle) {
      inMarker = true;
      toArchive.push(block.id);
      continue;
    }
    if (isBoardHeading || isUpdateLine) {
      inMarker = true;
      toArchive.push(block.id);
      continue;
    }
    if (!inMarker) continue;
    if (isHeading) {
      inMarker = false;
      continue;
    }
    if (["bulleted_list_item", "numbered_list_item", "paragraph", "to_do", "callout", "quote", "divider"].includes(block.type)) {
      toArchive.push(block.id);
      continue;
    }
    inMarker = false;
  }

  for (const blockId of toArchive) {
    await notionRequest(token, `/v1/blocks/${blockId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true })
    });
  }
  return { status: toArchive.length > 0 ? "replaced" : "no_marker", archived: toArchive.length };
};

const appendProgramBoardBlocks = async ({ token, projectPageId, markerTitle, sections }) => {
  if (!projectPageId) return { status: "skip", blocks: 0 };
  const date = new Date().toISOString().slice(0, 10);
  const children = [
    {
      object: "block",
      type: "heading_2",
      heading_2: {
        rich_text: [{ type: "text", text: { content: markerTitle } }]
      }
    },
    {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: `업데이트 기준일: ${date}` } }]
      }
    },
    { object: "block", type: "divider", divider: {} }
  ];

  for (const section of sections) {
    children.push({
      object: "block",
      type: "heading_3",
      heading_3: {
        rich_text: [{ type: "text", text: { content: section.title } }]
      }
    });
    for (const item of section.items) {
      children.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: item } }]
        }
      });
    }
  }

  await notionRequest(token, `/v1/blocks/${projectPageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children })
  });
  return { status: "appended", blocks: children.length };
};

const archiveRowsByTitlePattern = async ({ token, databaseId, titlePropertyName, pattern, keepTitles = [] }) => {
  const rows = await queryDatabaseAll(token, databaseId, {});
  const archivedTitles = [];
  for (const row of rows) {
    const title = pageTitleFromRow(row, titlePropertyName).trim();
    if (!title) continue;
    if (keepTitles.includes(title)) continue;
    if (!pattern.test(title)) continue;
    await archivePage(token, row.id);
    archivedTitles.push(title);
  }
  return { archived: archivedTitles.length, titles: archivedTitles };
};

const OBSIDIAN_TEMPLATES = {
  "Templates/00_Ops_Hub.md": `# Ops Hub

운영/검증/튜닝의 단일 진입점.

- [[01_Daily_Log]]
- [[02_Incident_Report]]
- [[03_Tuning_Note]]
- [[04_MCP_Expansion_Plan]]
- [[05_NotebookLM_Intake]]
- [[AUTO_SYNC_CHECK_2026-04-03]]
`,
  "Templates/01_Daily_Log.md": `# Daily Ops Log

Related:
- [[00_Ops_Hub]]
- [[02_Incident_Report]]
- [[03_Tuning_Note]]
- [[04_MCP_Expansion_Plan]]
- [[05_NotebookLM_Intake]]

## 1) Mission
- Today Focus:
- Success Criteria:

## 2) Runtime Snapshot
- MCP profile:
- mcp check/smoke:
- Gate progress:

## 3) Signals
- Market regime:
- Risk guard:
- Key alerts:

## 4) Actions
- Completed:
- In Progress:
- Blocked:

## 5) Decision
- Keep / Change / Rollback:
- Why:

## 6) Next Step
- Single next action:
`,
  "Templates/02_Incident_Report.md": `# Incident Report

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[03_Tuning_Note]]

## 1) Summary
- Incident Title:
- Severity:
- Detected At:
- Source (Sentry/PagerDuty/Grafana):

## 2) Impact
- User/System Impact:
- Scope:

## 3) Root Cause
- Primary Cause:
- Contributing Factors:

## 4) Response Timeline
- Detection:
- Mitigation:
- Recovery:

## 5) Corrective Action
- Immediate Fix:
- Preventive Fix:

## 6) Verification
- Reproduced:
- Fixed:
- Regression Check:

## 7) Follow-up
- Owner:
- Due Date:
`,
  "Templates/03_Tuning_Note.md": `# Tuning Note

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[02_Incident_Report]]

## 1) Objective
- Target Metric (accuracy/win-rate/return):
- Stage Scope:

## 2) Hypothesis
- What to tune:
- Why this should work:

## 3) Experiment Design
- Dataset Window:
- Baseline:
- Candidate Params:
- Guardrails:

## 4) Result
- Validation Pack:
- Delta vs Baseline:
- Risk/Drift Impact:

## 5) Decision
- Adopt / Hold / Reject:
- Reason:

## 6) Promote Conditions
- Canary criteria:
- Rollback criteria:
`,
  "Templates/04_MCP_Expansion_Plan.md": `# MCP Expansion Plan

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[03_Tuning_Note]]

## 1) Current Phase
- Phase: Shadow Lane
- Gate: 13/20 (target 20/20)
- Status: HOLD (no payload)

## 2) Priority Queue
- P0: Alpaca(read-only), Perplexity, Alpha Vantage
- P1: SEC EDGAR, Supabase/Postgres
- P2: Finnhub, Obsidian ops accumulation

## 3) Guardrails
- No live order path change before 20/20
- No strategy auto-parameter changes
- Rollback on repeated instability

## 4) Verification Checklist
- source_agreement_pct
- signal_precision_shadow
- drift_delta
- no_reason_drift

## 5) Decision
- Continue / Hold / Rollback
- Evidence link:
`,
  "Templates/05_NotebookLM_Intake.md": `# NotebookLM Intake

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[03_Tuning_Note]]
- [[04_MCP_Expansion_Plan]]

## 1) Source
- NotebookLM notebook/topic:
- Source links (paper/blog/video):
- Key quote / claim:

## 2) Hypothesis for US Alpha Seeker
- What to improve:
- Why now:
- Expected impact (precision/risk/latency):

## 3) Validation Design (shadow-first)
- Scope: stage6 / sidecar / harvester / dashboard
- Feature flag:
- Shadow metric:
- Failure rollback condition:

## 4) Code Reflection Plan
- Target files:
- Data contract changes:
- Notion fields to update:
- Telegram/ops-health evidence:

## 5) Decision
- Adopt / Hold / Reject:
- Evidence link:
`,
  "Templates/06_Technical_Analysis_Insight.md": `# Technical Analysis Insight

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[03_Tuning_Note]]
- [[05_NotebookLM_Intake]]

## 1) Signal / Pattern
- Indicator or chart pattern name:
- Timeframe (daily/weekly/intraday):
- Numeric threshold / trigger condition:

## 2) Historical Win-Rate
- Backtest period:
- Sample size:
- Win rate / Expectancy:
- Max drawdown in test:

## 3) Current Application
- Current parameter in alpha-exec-engine:
- Proposed change:
- Risk impact assessment:

## 4) Validation Plan
- Shadow lane test duration:
- Success metric:
- Rollback condition:

## 5) Decision
- Adopt / Hold / Reject:
- Evidence link:
`,
  "Templates/07_Portfolio_Optimization_Insight.md": `# Portfolio Optimization Insight

Related:
- [[00_Ops_Hub]]
- [[01_Daily_Log]]
- [[03_Tuning_Note]]
- [[05_NotebookLM_Intake]]

## 1) Optimization Target
- Metric to improve (Sharpe/Sortino/Win-Rate/MDD):
- Current value:
- Target value:

## 2) Proposed Change
- Position sizing rule:
- Sector allocation cap:
- Correlation limit:
- Kelly fraction adjustment:

## 3) Risk Assessment
- Worst-case scenario:
- Impact on existing portfolio:
- Diversification effect:

## 4) Validation Plan
- Paper trading test duration:
- Benchmark comparison:
- Rollback condition:

## 5) Decision
- Adopt / Hold / Reject:
- Evidence link:
`
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
    throw new Error(`Obsidian ${route} failed (${response.status}): ${text}`);
  }
  return text;
};

const encodeVaultPath = (filePath) => filePath.split("/").map((part) => encodeURIComponent(part)).join("/");

const syncObsidianTemplates = async ({ baseUrl, apiKey }) => {
  const results = [];
  for (const [filePath, content] of Object.entries(OBSIDIAN_TEMPLATES)) {
    const route = `/vault/${encodeVaultPath(filePath)}`;
    await obsidianRequest({
      baseUrl,
      apiKey,
      method: "PUT",
      route,
      body: content,
      contentType: "text/markdown"
    });
    const verify = await obsidianRequest({
      baseUrl,
      apiKey,
      method: "GET",
      route,
      contentType: null
    });
    results.push({
      filePath,
      status: "synced",
      bytes: Buffer.byteLength(verify, "utf8")
    });
  }
  return results;
};

const main = async () => {
  const envMap = buildEnvMap();
  const dryRun = boolFromEnv(envMap, "KNOWLEDGE_SYNC_DRY_RUN", false);

  const report = {
    generatedAt: new Date().toISOString(),
    dryRun,
    notion: {
      enabled: true,
      status: "skip",
      tasks: [],
      workListTasks: [],
      projectPageTasks: [],
      projectBoard: null,
      projectAppend: null,
      projectAutoCleanup: null,
      legacyCleanup: null,
      history: null,
      childDatabases: []
    },
    obsidian: {
      enabled: true,
      status: "skip",
      templates: []
    }
  };

  const notionToken = env(envMap, "NOTION_TOKEN");
  const notionWorkList = env(envMap, "NOTION_WORK_LIST");
  const notionProject = env(envMap, "NOTION_PROJECT");
  const notionProjectTaskDbEnv = env(envMap, "KNOWLEDGE_NOTION_PROJECT_TASK_DB");
  const notionProjectDbEnv = env(envMap, "KNOWLEDGE_NOTION_PROJECT_DB");
  const notionHistoryDbEnv = env(envMap, "KNOWLEDGE_NOTION_HISTORY_DB");
  const notionHistoryDbTitle = env(envMap, "KNOWLEDGE_NOTION_HISTORY_DB_TITLE", "운영 히스토리");
  const notionPrimaryProjectTitle = env(envMap, "KNOWLEDGE_NOTION_PRIMARY_PROJECT_TITLE", "US Alpha Seeker 운영 자동화");
  const appendProjectNotes = boolFromEnv(envMap, "KNOWLEDGE_SYNC_APPEND_PROJECT_NOTES", false);
  const cleanupProjectAutoNotes = boolFromEnv(envMap, "KNOWLEDGE_SYNC_CLEANUP_PROJECT_AUTO_NOTES", true);
  const archiveLegacySamples = boolFromEnv(envMap, "KNOWLEDGE_SYNC_ARCHIVE_LEGACY_SAMPLES", true);
  const obsidianApiKey = env(envMap, "OBSIDIAN_API_KEY");
  const obsidianBaseUrl = env(envMap, "OBSIDIAN_BASE_URL", "http://127.0.0.1:27123");

  const viewTasks = [
    "[View Setup] Today 운영 뷰 구성",
    "[View Setup] This Week 운영 뷰 구성",
    "[View Setup] Blocked 운영 뷰 구성",
    "[View Setup] Incident 운영 뷰 구성"
  ];

  const historyItems = [
    {
      title: "Stage6 Requirements Master v1 기준 고정",
      status: "완료",
      category: "Stage6",
      date: "2026-03-14",
      summary: "Stage6 요구사항 문서를 단일 기준으로 고정하고 적용 범위를 명확히 정의",
      evidence: "docs/STAGE6_REQUIREMENTS_MASTER_v1_2026-03-14.md"
    },
    {
      title: "v2 전체 트레이스 매트릭스 전수 검토 완료",
      status: "완료",
      category: "문서화",
      date: "2026-03-17",
      summary: "2,152라인 원문 기반 C/H/M 이슈를 코드와 교차 검증해 상세 트레이스화",
      evidence: "docs/US_ALPHA_SEEKER_V2_FULL_TRACE_MATRIX_2026-03-17.md"
    },
    {
      title: "보안 로테이션 런북/증적 체계 문서화",
      status: "완료",
      category: "보안",
      date: "2026-03-23",
      summary: "시크릿 로테이션 실행/검증/롤백 증적 관리 절차를 문서 기준으로 고정",
      evidence: "docs/SECURITY_ROTATION_EVIDENCE_LOG_2026-03-23.md"
    },
    {
      title: "Notion 워크스페이스 정비/아카이브 보존 정책 수립",
      status: "완료",
      category: "Notion",
      date: "2026-04-02",
      summary: "워크스페이스 정리와 보관 정책을 운영 루틴으로 명문화",
      evidence: "docs/NOTION_ARCHIVE_RETENTION_WORKORDER_2026-04-02.md"
    },
    {
      title: "MCP Collaboration Playbook 구축",
      status: "완료",
      category: "MCP",
      date: "2026-04-02",
      summary: "ops/research/full 프로필 전략과 sync/check/smoke 절차를 표준화",
      evidence: "docs/MCP_COLLAB_SETUP_PLAYBOOK_2026-04-02.md"
    },
    {
      title: "Sentry SDK 최소 안전 연동 단계 착수",
      status: "완료",
      category: "관측",
      date: "2026-04-02",
      summary: "프론트/API smoke 이벤트와 오류 추적 루프를 운영 체크포인트로 반영",
      evidence: "docs/SENTRY_SDK_INTEGRATION_PLAN_2026-04-02.md"
    },
    {
      title: "Master Control Plane 워크플로우 스캐폴드 반영",
      status: "완료",
      category: "워크플로우",
      date: "2026-04-03",
      summary: "collect/validate/promote/incident lane 분리와 수동 안전 게이트 구성",
      evidence: "docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md"
    },
    {
      title: "MCP 운영모델(ops/full) 및 SSOT 원칙 확정",
      status: "완료",
      category: "운영",
      date: "2026-04-03",
      summary: "운영은 ops 고정, 연구는 full 한정, Trade Plane 자동변경 금지 원칙 확정",
      evidence: "docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md"
    },
    {
      title: "Repo↔Notion↔Obsidian 동기화 루틴 구현",
      status: "완료",
      category: "자동화",
      date: "2026-04-03",
      summary: "ops:knowledge:sync로 작업/보드/템플릿 동기화와 리포트 생성 자동화",
      evidence: "scripts/sync-knowledge-routines.mjs"
    },
    {
      title: "Notion 프로젝트 페이지 Program Status 보드 자동 재생성",
      status: "완료",
      category: "Notion",
      date: "2026-04-03",
      summary: "완료/진행중/예정/가드레일/뷰설정 섹션을 자동 업데이트하도록 반영",
      evidence: "scripts/sync-knowledge-routines.mjs"
    },
    {
      title: "Notion 프로젝트/작업 DB 레거시 샘플 행 정리 자동화",
      status: "완료",
      category: "Notion",
      date: "2026-04-03",
      summary: "샘플/템플릿/온보딩 기본행 archive를 동기화 루틴에 내장",
      evidence: "state/knowledge-routine-sync-report.json"
    },
    {
      title: "MCP ops 프로필 10/10 smoke PASS 유지",
      status: "완료",
      category: "MCP",
      date: "2026-04-03",
      summary: "운영 핵심 MCP 셋에 대한 check/smoke PASS 기준 운영 확인",
      evidence: "state/mcp-smoke-report.json"
    },
    {
      title: "MCP full 프로필 12/12 smoke PASS 검증",
      status: "완료",
      category: "MCP",
      date: "2026-04-03",
      summary: "research 확장(perplexity/obsidian) 포함 전체 프로필 검증 완료",
      evidence: "docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md"
    },
    {
      title: "20/20 gate 데이터 수집 진행",
      status: "진행 중",
      category: "검증",
      date: "2026-04-03",
      summary: "baseline 오염 없이 gate 샘플 축적을 지속하고 승격 조건을 관찰 중",
      evidence: "sidecar-template/alpha-exec-engine/docs/OPS_RUNBOOK_20TRADE_GATE.md"
    },
    {
      title: "HF alert/drift 해소 및 promotion blocker 모니터링",
      status: "진행 중",
      category: "검증",
      date: "2026-04-03",
      summary: "live promotion 차단 조건(alert/perf/freeze/shadow/payload path)을 추적 중",
      evidence: "sidecar-template/alpha-exec-engine/docs/OPS_RUNBOOK_20TRADE_GATE.md"
    },
    {
      title: "Notion 운영뷰 Today/ThisWeek/Blocked/Incident 최적화",
      status: "진행 중",
      category: "Notion",
      date: "2026-04-03",
      summary: "실사용 기준 필터/정렬/관계 컬럼 최종 미세조정 작업 진행",
      evidence: "docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md"
    },
    {
      title: "Obsidian 템플릿 기반 일일/인시던트/튜닝 노트 누적 운영",
      status: "진행 중",
      category: "Obsidian",
      date: "2026-04-03",
      summary: "Hub 중심 템플릿 연결로 연구 노트를 일관되게 누적하는 단계",
      evidence: "Templates/00_Ops_Hub.md"
    },
    {
      title: "20/20 도달 후 validation_pack OFF/ON/STRICT 비교 실행",
      status: "예정",
      category: "검증",
      date: "2026-04-04",
      summary: "수집 완료 직후 3-way 비교로 GO/NO_GO 판단 근거를 확정",
      evidence: "sidecar-template/alpha-exec-engine/docs/OPS_RUNBOOK_20TRADE_GATE.md"
    },
    {
      title: "payload_probe isolated tighten/relief 비교 리포트 확정",
      status: "예정",
      category: "검증",
      date: "2026-04-04",
      summary: "baseline과 probe 분리 데이터를 근거로 HF path 검증 결과를 고정",
      evidence: "sidecar-template/alpha-exec-engine/.github/workflows/payload-probe-isolated.yml"
    },
    {
      title: "Gate 결과 GO/NO_GO + blocker Notion/Docs 동시 반영",
      status: "예정",
      category: "운영",
      date: "2026-04-04",
      summary: "검증결과를 운영 결론으로 문서/보드/작업목록에 동기 반영",
      evidence: "docs/MASTER_WORKFLOW_CONTROL_PLANE_2026-04-03.md"
    },
    {
      title: "n8n 기반 장기 오케스트레이션 설계안 v1 확정",
      status: "예정",
      category: "자동화",
      date: "2026-04-05",
      summary: "무료 플랜 기반 승인게이트 중심 장기운영 자동화 구조를 문서화",
      evidence: "docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md"
    },
    {
      title: "MCP 시장데이터 확장 로드맵 v1 수립",
      status: "완료",
      category: "MCP",
      date: "2026-04-08",
      summary: "Alpaca/Perplexity/AlphaVantage/SEC/Supabase 중심 확장 우선순위를 문서로 확정",
      evidence: "docs/MCP_MARKET_INTEL_EXPANSION_ROADMAP_2026-04-08.md"
    },
    {
      title: "Phase-1 Shadow Data Bus 착수",
      status: "진행 중",
      category: "검증",
      date: "2026-04-08",
      summary: "20/20 이전에는 read-only 교차검증만 적용하는 확장 실행 단계 시작",
      evidence: "docs/MCP_AUTOMATION_COLLAB_OPERATING_MODEL_2026-04-03.md"
    },
    {
      title: "NotebookLM+Obsidian 리서치 인테이크 루프 설계",
      status: "진행 중",
      category: "MCP",
      date: "2026-04-09",
      summary: "NotebookLM 리서치 요약을 Obsidian intake 템플릿으로 정규화하고 Notion/코드 반영 루프로 연결",
      evidence: "docs/NOTEBOOKLM_OBSIDIAN_NOTION_IMPLEMENTATION_LOOP_2026-04-09.md"
    }
  ];

  try {
    if (!notionToken || !notionWorkList) {
      report.notion.status = "skip_missing_env";
    } else if (dryRun) {
      report.notion.status = "dry_run";
    } else {
      const workListDb = await notionRequest(notionToken, `/v1/databases/${notionWorkList}`, { method: "GET" });
      const workListSchemaPatch = await ensureDatabaseProperties({
        token: notionToken,
        databaseId: notionWorkList,
        currentProperties: workListDb?.properties || {},
        desiredProperties: {
          "우선순위": {
            select: {
              options: [
                { name: "높음", color: "red" },
                { name: "중간", color: "yellow" },
                { name: "낮음", color: "blue" }
              ]
            }
          },
          "분류": {
            select: {
              options: [
                { name: "일반", color: "default" },
                { name: "Blocked", color: "orange" },
                { name: "Incident", color: "red" }
              ]
            }
          },
          "마감일": { date: {} },
          "요약": { rich_text: {} }
        }
      });

      const workListDbRefreshed =
        workListSchemaPatch.status === "patched"
          ? await notionRequest(notionToken, `/v1/databases/${notionWorkList}`, { method: "GET" })
          : workListDb;
      const workListProps = workListDbRefreshed?.properties || {};
      const workListTitle = findTitleProperty(workListProps);
      if (!workListTitle) throw new Error("Notion work-list DB has no title property");
      const workListStatus = findStatusProperty(workListProps);
      const workListPriority = findPriorityProperty(workListProps);
      const workListCategory = findSelectProperty(workListProps, ["분류", "Category"]);
      const workListStatusOption = chooseStatusOption(workListStatus, ["할 일", "진행 중", "To Do"]);
      const workListPriorityOption = chooseStatusOption(workListPriority, ["중간", "Medium"]);
      const workListCategoryOption = chooseStatusOption(workListCategory, ["일반", "Normal"]);
      for (const title of viewTasks) {
        const extraProperties = {};
        if (workListCategory?.name && workListCategoryOption) {
          extraProperties[workListCategory.name] = { select: { name: workListCategoryOption } };
        }
        const result = await upsertRow({
          token: notionToken,
          databaseId: notionWorkList,
          titlePropertyName: workListTitle,
          statusProperty: workListStatus,
          statusOptionName: workListStatusOption,
          priorityProperty: workListPriority,
          priorityOptionName: workListPriorityOption,
          extraProperties,
          title
        });
        report.notion.tasks.push({ title, target: "NOTION_WORK_LIST", ...result });
        report.notion.workListTasks.push({ title, ...result });
      }
      report.notion.workListSchema = workListSchemaPatch;

      const childDatabases = await listProjectChildDatabases({ token: notionToken, projectPageId: notionProject });
      report.notion.childDatabases = childDatabases;
      const projectTaskDbId =
        notionProjectTaskDbEnv || childDatabases.find((x) => x.title === "작업")?.id || "";
      const projectDbId =
        notionProjectDbEnv || childDatabases.find((x) => x.title === "프로젝트")?.id || "";
      let historyDbId =
        notionHistoryDbEnv || childDatabases.find((x) => x.title === notionHistoryDbTitle)?.id || "";

      if (!historyDbId) {
        const ensuredHistoryDb = await ensureChildDatabase({
          token: notionToken,
          projectPageId: notionProject,
          existingChildDatabases: childDatabases,
          title: notionHistoryDbTitle,
          properties: {
            "이력 항목": { title: {} },
            "상태": {
              status: {
                options: [
                  { name: "완료", color: "green" },
                  { name: "진행 중", color: "blue" },
                  { name: "예정", color: "yellow" }
                ]
              }
            },
            "분류": {
              select: {
                options: [
                  { name: "Stage6", color: "purple" },
                  { name: "문서화", color: "gray" },
                  { name: "보안", color: "red" },
                  { name: "MCP", color: "blue" },
                  { name: "워크플로우", color: "orange" },
                  { name: "Notion", color: "pink" },
                  { name: "Obsidian", color: "brown" },
                  { name: "자동화", color: "green" },
                  { name: "운영", color: "default" },
                  { name: "검증", color: "yellow" },
                  { name: "관측", color: "blue" }
                ]
              }
            },
            "날짜": { date: {} },
            "요약": { rich_text: {} },
            "근거": { rich_text: {} }
          }
        });
        historyDbId = ensuredHistoryDb.id || "";
        report.notion.history = {
          dbId: historyDbId,
          dbStatus: ensuredHistoryDb.status,
          rows: [],
          counts: { done: 0, inProgress: 0, planned: 0 }
        };
      }

      if (historyDbId) {
        const historyDb = await notionRequest(notionToken, `/v1/databases/${historyDbId}`, { method: "GET" });
        const historyProps = historyDb?.properties || {};
        const historyTitle = findTitleProperty(historyProps);
        if (!historyTitle) throw new Error("History DB has no title property");
        const historyStatus = findStatusProperty(historyProps);
        const historyCategory = findSelectProperty(historyProps, ["분류", "카테고리", "Category"]);
        const historyDate = findDateProperty(historyProps, ["날짜", "Date"]);
        const historySummary = findRichTextProperty(historyProps, ["요약", "Summary"]);
        const historyEvidence = findRichTextProperty(historyProps, ["근거", "Evidence", "링크"]);

        const rows = [];
        for (const item of historyItems) {
          const statusOptionName = chooseStatusOption(historyStatus, [item.status]);
          const categoryOptionName = chooseStatusOption(historyCategory, [item.category]);
          const extraProperties = {};
          if (historyDate?.name && item.date) {
            extraProperties[historyDate.name] = { date: { start: item.date } };
          }
          if (historyCategory?.name && categoryOptionName) {
            extraProperties[historyCategory.name] = { select: { name: categoryOptionName } };
          }
          if (historyEvidence && item.evidence) {
            extraProperties[historyEvidence] = {
              rich_text: [{ text: { content: item.evidence.slice(0, 1800) } }]
            };
          }
          const row = await upsertRow({
            token: notionToken,
            databaseId: historyDbId,
            titlePropertyName: historyTitle,
            statusProperty: historyStatus,
            statusOptionName,
            summaryPropertyName: historySummary,
            summaryText: item.summary,
            extraProperties,
            title: item.title
          });
          rows.push({ title: item.title, status: item.status, ...row });
        }

        const counts = {
          done: historyItems.filter((x) => x.status === "완료").length,
          inProgress: historyItems.filter((x) => x.status === "진행 중").length,
          planned: historyItems.filter((x) => x.status === "예정").length
        };
        report.notion.history = {
          dbId: historyDbId,
          dbStatus: report.notion.history?.dbStatus || "existing",
          rows,
          counts
        };
      }

      if (projectTaskDbId) {
        const projectTaskDb = await notionRequest(notionToken, `/v1/databases/${projectTaskDbId}`, { method: "GET" });
        const taskProps = projectTaskDb?.properties || {};
        const taskTitle = findTitleProperty(taskProps);
        if (!taskTitle) throw new Error("Project page task DB has no title property");
        const taskStatus = findStatusProperty(taskProps);
        const taskPriority = findPriorityProperty(taskProps);
        const taskRelation = findRelationProperty(taskProps, ["프로젝트", "Project"]);
        const summaryProp = taskProps["요약"]?.type === "rich_text" ? "요약" : null;

        let primaryProjectId = "";
        if (projectDbId) {
          const projectDb = await notionRequest(notionToken, `/v1/databases/${projectDbId}`, { method: "GET" });
          const projectProps = projectDb?.properties || {};
          const projectTitleName = findTitleProperty(projectProps);
          if (!projectTitleName) throw new Error("Project DB has no title property");
          const projectStatus = findStatusProperty(projectProps);
          const projectPriority = findPriorityProperty(projectProps);
          const projectSummary = findRichTextProperty(projectProps, ["요약", "Summary"]);
          const statusOptionName = chooseStatusOption(projectStatus, ["진행 중", "In Progress", "활성", "Active"]);
          const priorityOptionName = chooseStatusOption(projectPriority, ["높음", "중간", "Medium"]);
          const primaryProject = await upsertRow({
            token: notionToken,
            databaseId: projectDbId,
            titlePropertyName: projectTitleName,
            statusProperty: projectStatus,
            statusOptionName,
            priorityProperty: projectPriority,
            priorityOptionName,
            summaryPropertyName: projectSummary,
            summaryText: "US Alpha Seeker 자동화 운영/검증/튜닝의 단일 프로젝트 허브",
            title: notionPrimaryProjectTitle
          });
          primaryProjectId = primaryProject.pageId || "";

          if (archiveLegacySamples) {
            const archivedProjectRows = await archiveRowsByTitlePattern({
              token: notionToken,
              databaseId: projectDbId,
              titlePropertyName: projectTitleName,
              pattern: /(샘플|템플릿|프로젝트와 작업 시작하기|sample)/i,
              keepTitles: [notionPrimaryProjectTitle]
            });
            report.notion.legacyCleanup = report.notion.legacyCleanup || {};
            report.notion.legacyCleanup.projectRows = archivedProjectRows;
          }
        }

        const summaries = {
          "[View Setup] Today 운영 뷰 구성": "오늘 처리해야 할 작업을 즉시 확인하는 뷰",
          "[View Setup] This Week 운영 뷰 구성": "이번 주 우선순위와 진행 흐름을 확인하는 뷰",
          "[View Setup] Blocked 운영 뷰 구성": "막힌 항목을 분리해 병목을 빠르게 해결하는 뷰",
          "[View Setup] Incident 운영 뷰 구성": "인시던트 트래킹과 후속 조치를 연결하는 뷰"
        };

        for (const title of viewTasks) {
          const result = await upsertRow({
            token: notionToken,
            databaseId: projectTaskDbId,
            titlePropertyName: taskTitle,
            statusProperty: taskStatus,
            priorityProperty: taskPriority,
            relationProperty: taskRelation,
            relationPageId: primaryProjectId,
            summaryPropertyName: summaryProp,
            summaryText: summaries[title] || "",
            title
          });
          report.notion.tasks.push({ title, target: "PROJECT_TASK_DB", ...result });
          report.notion.projectPageTasks.push({ title, ...result });
        }

        if (archiveLegacySamples) {
          const archivedTaskRows = await archiveRowsByTitlePattern({
            token: notionToken,
            databaseId: projectTaskDbId,
            titlePropertyName: taskTitle,
            pattern:
              /(샘플|템플릿|세 작업 추가|sample|프로젝트와 작업 시작하기|프로젝트 제안서 작성|팀 멤버 초대|데이터 대시보드 구축|킥오프 회의 일정 잡기|새 작업 추가|연구 결과 검토)/i,
            keepTitles: viewTasks
          });
          report.notion.legacyCleanup = report.notion.legacyCleanup || {};
          report.notion.legacyCleanup.taskRows = archivedTaskRows;
        }
      }

      if (cleanupProjectAutoNotes) {
        report.notion.projectAutoCleanup = await cleanupAutoBlocksInProjectPage({
          token: notionToken,
          projectPageId: notionProject
        });
      } else {
      report.notion.projectAutoCleanup = { status: "skip_disabled", archived: 0 };
      }

      const programBoardTitle = "[AUTO] US Alpha Seeker Program Status";
      const boardSections = [
        {
          title: "완료(Completed)",
          items: [
            "전체 타임라인은 child DB `운영 히스토리`에서 일자/상태 기반으로 조회",
            "운영 MCP 프로필 10종(ops) + 연구 확장 2종(full) 통합 및 검증 완료",
            "ops/full 프로필 동기화, check/smoke 루틴 고정 (`mcp:sync:ops`, `mcp:sync:full`)",
            "Sentry/Playwright/Grafana/PagerDuty/Cloudflare 포함 관측·대응 체계 구축",
            "Telegram 채널 분리 운영(스테이지6 / 운영 / Alert) 변수 체계 정리",
            "Master Control Plane + reusable workflows(collect/validate/promote/incident) 반영",
            "Repo↔Notion↔Obsidian 동기 루틴(`ops:knowledge:sync`) 구현 및 실동작 검증"
          ]
        },
        {
          title: "진행 중(In Progress)",
          items: [
            "20-trade gate 수집 진행(목표: 20/20, 수집 구간 파라미터 동결 유지)",
            "HF alert/drift 관찰 모드 유지 및 live promotion 차단 조건 모니터링",
            "Notion 운영 뷰(Today/This Week/Blocked/Incident) 실사용 기준 정렬/필터 최적화",
            "Obsidian 템플릿 기반 일일 운영 로그/인시던트/튜닝 노트 누적",
            "MCP 확장 Phase-1(Shadow Data Bus) 설계 기준으로 도입 준비"
          ]
        },
        {
          title: "다음 작업(Next)",
          items: [
            "Alpaca(read-only) + Alpha Vantage + SEC EDGAR shadow lane 우선 연결",
            "NotebookLM + Obsidian intake 노트를 Notion 확장안과 코드 반영 체크리스트로 승격",
            "Notion 운영 히스토리에 MCP 확장 이정표/증적 링크 누적",
            "20/20 도달 후 validation_pack OFF/ON/STRICT 비교 실행",
            "payload_probe isolated 결과와 baseline 분리 검증 리포트 확정",
            "Gate 결과(GO/NO_GO)와 blocker를 Notion + docs에 동시 반영",
            "추가 자동화 확장(n8n/고급 오케스트레이션)은 20/20 종료 후 단계적으로 검토"
          ]
        },
        {
          title: "운영 원칙(Guardrails)",
          items: [
            "Trade Plane(실주문/핵심 전략 파라미터)은 자동 수정 금지",
            "수집 구간에는 baseline 오염 방지를 위해 실험성 플래그 분리 실행",
            "최종 정본(SSOT): `docs/` → 운영 보드: Notion → 연구 초안: Obsidian"
          ]
        },
        {
          title: "Notion 뷰 설정값(수동 UI 적용)",
          items: [
            "Today: 상태 != 완료 🙌, 작성일시 = 오늘, 정렬 = 우선순위(desc) > 작성일시(desc)",
            "This Week: 상태 != 완료 🙌, 작성일시 = 이번 주, 정렬 = 우선순위(desc) > 마감일(asc)",
            "Blocked: 분류 = Blocked (또는 제목 contains [Blocked]), 정렬 = 최근 수정(desc)",
            "Incident: 분류 = Incident (또는 제목 contains [Incident]), 정렬 = 작성일시(desc)"
          ]
        }
      ];
      const cleanedBoard = await cleanupProgramBoardBlocksInProjectPage({
        token: notionToken,
        projectPageId: notionProject,
        markerTitle: programBoardTitle,
        sectionTitles: boardSections.map((x) => x.title)
      });
      const appendedBoard = await appendProgramBoardBlocks({
        token: notionToken,
        projectPageId: notionProject,
        markerTitle: programBoardTitle,
        sections: boardSections
      });
      report.notion.projectBoard = {
        cleanup: cleanedBoard,
        append: appendedBoard
      };

      if (appendProjectNotes) {
        report.notion.projectAppend = await appendProjectBlocks({
          token: notionToken,
          projectPageId: notionProject,
          viewSpecTitles: viewTasks
        });
      } else {
        report.notion.projectAppend = { status: "skip_disabled", blocks: 0 };
      }

      report.notion.status = "ok";
    }
  } catch (error) {
    report.notion.status = "fail";
    report.notion.error = error?.message || String(error);
  }

  try {
    if (!obsidianApiKey || !obsidianBaseUrl) {
      report.obsidian.status = "skip_missing_env";
    } else if (dryRun) {
      report.obsidian.status = "dry_run";
    } else {
      const root = await obsidianRequest({
        baseUrl: obsidianBaseUrl,
        apiKey: obsidianApiKey,
        method: "GET",
        route: "/",
        contentType: null
      });
      const rootJson = JSON.parse(root);
      report.obsidian.health = {
        status: rootJson?.status || "N/A",
        authenticated: Boolean(rootJson?.authenticated),
        version: rootJson?.versions?.self || "N/A"
      };
      report.obsidian.templates = await syncObsidianTemplates({
        baseUrl: obsidianBaseUrl,
        apiKey: obsidianApiKey
      });
      report.obsidian.status = "ok";
    }
  } catch (error) {
    report.obsidian.status = "fail";
    report.obsidian.error = error?.message || String(error);
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `[KNOWLEDGE_SYNC] notion=${report.notion.status} tasks=${report.notion.tasks.length} obsidian=${report.obsidian.status} templates=${report.obsidian.templates.length} report=${path.relative(CWD, REPORT_PATH)}`
  );

  if (report.notion.status === "fail" || report.obsidian.status === "fail") {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[KNOWLEDGE_SYNC] fail: ${error?.message || error}`);
  process.exit(1);
});
