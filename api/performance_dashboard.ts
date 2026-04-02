import fs from "node:fs";
import path from "node:path";
import { captureApiError, withSentryApi } from "./_sentry";

type Json = Record<string, any>;

const NOTION_VERSION = "2022-06-28";

const shortText = (value: unknown, max = 1800): string => String(value ?? "").trim().slice(0, max);

const toNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toIso = (value: unknown): string => {
  const d = new Date(String(value || ""));
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
};

const readJson = (filePath: string): Json | null => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const notionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
});

const notionRequest = async (token: string, apiPath: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.notion.com${apiPath}`, {
    ...init,
    headers: {
      ...notionHeaders(token),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Notion ${apiPath} failed (${response.status}): ${JSON.stringify(data).slice(0, 320)}`);
  }
  return data;
};

const propToText = (prop: any): string => {
  if (!prop || typeof prop !== "object") return "";
  if (prop.type === "title") return (prop.title || []).map((t: any) => t?.plain_text || "").join("").trim();
  if (prop.type === "rich_text") return (prop.rich_text || []).map((t: any) => t?.plain_text || "").join("").trim();
  if (prop.type === "select") return shortText(prop.select?.name || "", 200);
  if (prop.type === "date") return shortText(prop.date?.start || "", 200);
  if (prop.type === "number") {
    const n = toNumber(prop.number);
    return n == null ? "" : String(n);
  }
  if (prop.type === "checkbox") return prop.checkbox ? "true" : "false";
  return "";
};

const propToNumber = (prop: any): number | null => {
  if (!prop || typeof prop !== "object") return null;
  if (prop.type === "number") return toNumber(prop.number);
  if (prop.type === "rich_text" || prop.type === "title") return toNumber(propToText(prop));
  if (prop.type === "select") return toNumber(prop.select?.name);
  return null;
};

const propToCheckbox = (prop: any): boolean | null => {
  if (!prop || typeof prop !== "object") return null;
  if (prop.type === "checkbox") return Boolean(prop.checkbox);
  const text = propToText(prop).toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return null;
};

const pickProp = (properties: Json, names: string[]) => {
  for (const name of names) {
    if (properties && properties[name]) return properties[name];
  }
  return null;
};

const parseSeries = (raw: string) => {
  const chunks = String(raw || "")
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
  return chunks
    .map((line) => {
      const [at, fillRatePct, avgR, closedCount] = line.split("|");
      return {
        at: toIso(at || new Date().toISOString()),
        fillRatePct: toNumber(fillRatePct),
        avgR: toNumber(avgR),
        closedCount: toNumber(closedCount)
      };
    })
    .filter((row) => row.at);
};

const emptyDashboard = (reason: string, message: string) => ({
  source: "unavailable",
  generatedAt: new Date().toISOString(),
  runKey: "N/A",
  kind: "N/A",
  status: "N/A",
  summary: `${reason}: ${message}`,
  simulation: {
    batchId: "N/A",
    totalRows: null,
    filledRows: null,
    openRows: null,
    closedRows: null,
    winRatePct: null,
    avgClosedReturnPct: null,
    avgClosedR: null,
    topWinners: "N/A",
    topLosers: "N/A",
    chartSeries: []
  },
  live: {
    available: false,
    positionCount: null,
    totalUnrealizedPl: null,
    totalReturnPct: null,
    equity: null
  }
});

const dashboardFromNotionPage = (page: Json) => {
  const properties = page?.properties || {};
  const generatedAt = propToText(pickProp(properties, ["Time", "Date", "Generated At"])) || page?.last_edited_time;
  const runKey = propToText(pickProp(properties, ["Run Key"])) || page?.id || "N/A";
  const kind = propToText(pickProp(properties, ["Kind", "Mode"])) || "N/A";
  const status = propToText(pickProp(properties, ["Status"])) || "N/A";
  const batchId = propToText(pickProp(properties, ["Batch ID"])) || "N/A";
  const summary = propToText(pickProp(properties, ["Summary"])) || "";
  const source = propToText(pickProp(properties, ["Source"])) || "notion";
  const topWinners = propToText(pickProp(properties, ["Sim Top Winners"])) || "N/A";
  const topLosers = propToText(pickProp(properties, ["Sim Top Losers"])) || "N/A";
  const chartSeries = parseSeries(propToText(pickProp(properties, ["Series"])));

  return {
    source: "notion",
    generatedAt: toIso(generatedAt),
    runKey,
    kind,
    status,
    summary,
    simulation: {
      batchId,
      totalRows: propToNumber(pickProp(properties, ["Sim Rows"])),
      filledRows: propToNumber(pickProp(properties, ["Sim Filled"])),
      openRows: propToNumber(pickProp(properties, ["Sim Open"])),
      closedRows: propToNumber(pickProp(properties, ["Sim Closed"])),
      winRatePct: propToNumber(pickProp(properties, ["Sim Win Rate %"])),
      avgClosedReturnPct: propToNumber(pickProp(properties, ["Sim Avg Closed Return %"])),
      avgClosedR: propToNumber(pickProp(properties, ["Sim Avg Closed R"])),
      topWinners,
      topLosers,
      chartSeries
    },
    live: {
      available: propToCheckbox(pickProp(properties, ["Live Available"])) ?? false,
      positionCount: propToNumber(pickProp(properties, ["Live Position Count"])),
      totalUnrealizedPl: propToNumber(pickProp(properties, ["Live Unrealized PnL"])),
      totalReturnPct: propToNumber(pickProp(properties, ["Live Return %"])),
      equity: propToNumber(pickProp(properties, ["Live Equity"]))
    }
  };
};

const tryReadLocalState = () => {
  const candidates = [
    path.resolve(process.cwd(), "sidecar-template/alpha-exec-engine/state/performance-dashboard.json"),
    path.resolve(process.cwd(), "state/performance-dashboard.json")
  ];
  for (const target of candidates) {
    const data = readJson(target);
    if (!data) continue;
    return {
      source: "local_state",
      generatedAt: toIso(data?.generatedAt || new Date().toISOString()),
      runKey: "local-state",
      kind: "local",
      status: "N/A",
      summary: "Loaded from local state/performance-dashboard.json",
      simulation: data?.simulation || {},
      live: data?.live || { available: false }
    };
  }
  return null;
};

const handler = async (req: any, res: any) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const localState = tryReadLocalState();
  if (localState) {
    res.status(200).json({ ok: true, data: localState });
    return;
  }

  const notionToken = String(process.env.NOTION_TOKEN || "").trim();
  const databaseId = String(process.env.NOTION_DB_PERFORMANCE_DASHBOARD || "").trim();
  if (!notionToken || !databaseId) {
    res.status(200).json({
      ok: true,
      warning: "dashboard_source_missing",
      data: emptyDashboard(
        "dashboard_source_missing",
        "Run sidecar dry-run/market-guard once, or set NOTION_TOKEN + NOTION_DB_PERFORMANCE_DASHBOARD."
      )
    });
    return;
  }

  try {
    const query = await notionRequest(notionToken, `/v1/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({
        page_size: 1,
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }]
      })
    });
    const first = Array.isArray(query?.results) && query.results.length > 0 ? query.results[0] : null;
    if (!first) {
      res.status(200).json({
        ok: true,
        warning: "dashboard_not_found",
        data: emptyDashboard("dashboard_not_found", "No rows in NOTION_DB_PERFORMANCE_DASHBOARD yet.")
      });
      return;
    }
    res.status(200).json({ ok: true, data: dashboardFromNotionPage(first) });
  } catch (error: any) {
    captureApiError(error, {
      source: "performance_dashboard",
      method: req?.method || "UNKNOWN",
      hasNotionToken: Boolean(notionToken),
      hasDatabaseId: Boolean(databaseId)
    });
    res.status(200).json({
      ok: true,
      warning: "dashboard_fetch_failed",
      data: emptyDashboard("dashboard_fetch_failed", shortText(error?.message || error, 240))
    });
  }
};

export default withSentryApi(handler);
