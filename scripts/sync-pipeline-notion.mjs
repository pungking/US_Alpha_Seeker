import fs from "node:fs";

const NOTION_VERSION = "2022-06-28";
const OUTPUT_PATH = "state/notion-pipeline-sync.json";

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();

const boolFromEnv = (name, fallback = true) => {
  const raw = env(name);
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const short = (value, max = 1800) => String(value ?? "").trim().slice(0, max);
const parseNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const roundNumber = (value, digits = 2) => {
  const n = parseNumber(value);
  if (n == null) return null;
  return Number(n.toFixed(digits));
};

const toDateOnly = (isoLike) => {
  const dt = new Date(isoLike || "");
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
};

const notionHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
});

const notionRequest = async (token, path, init = {}) => {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      ...notionHeaders(token),
      ...(init.headers || {})
    }
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : {};
  if (!response.ok) {
    throw new Error(`Notion ${path} failed (${response.status}): ${short(JSON.stringify(data), 400)}`);
  }
  return data;
};

const titleProp = (value) => ({
  title: [{ text: { content: short(value, 200) } }]
});

const textProp = (value) => ({
  rich_text: [{ text: { content: short(value, 1900) } }]
});

const numberProp = (value, digits = 2) => ({
  number: roundNumber(value, digits)
});

const selectProp = (value, fallback = "NEUTRAL") => ({
  select: { name: short(value, 100) || fallback }
});

const statusProp = (value, fallback = "NEUTRAL") => ({
  status: { name: short(value, 100) || fallback }
});

const dateProp = (value) => ({
  date: { start: toDateOnly(value) }
});

const nowIso = () => new Date().toISOString();

const writeState = (payload) => {
  fs.mkdirSync("state", { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const readJson = (path) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const findTitlePropertyName = (schema) => {
  for (const [name, def] of Object.entries(schema || {})) {
    if (String(def?.type || "") === "title") return name;
  }
  return null;
};

const chooseField = (schema, names, allowedTypes = []) => {
  for (const name of names) {
    const def = schema?.[name];
    if (!def?.type) continue;
    if (allowedTypes.length > 0 && !allowedTypes.includes(def.type)) continue;
    return { name, type: def.type };
  }
  return null;
};

const setAliasProp = (target, schema, names, handlers) => {
  const hit = chooseField(schema, names);
  if (!hit) return false;
  const handler = handlers[hit.type];
  if (!handler) return false;
  target[hit.name] = handler();
  return true;
};

const queryPageByTitle = async (token, databaseId, titlePropertyName, titleValue) => {
  const payload = {
    filter: {
      property: titlePropertyName,
      title: { equals: titleValue }
    },
    page_size: 1
  };
  const data = await notionRequest(token, `/v1/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return Array.isArray(data?.results) && data.results.length > 0 ? data.results[0] : null;
};

const upsertByTitle = async (token, databaseId, titlePropertyName, titleValue, properties) => {
  const existing = await queryPageByTitle(token, databaseId, titlePropertyName, titleValue);
  if (existing?.id) {
    await notionRequest(token, `/v1/pages/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties })
    });
    return "updated";
  }
  await notionRequest(token, "/v1/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties
    })
  });
  return "created";
};

const alphaSignalFromVerdict = (verdict) => {
  const v = String(verdict || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!v) return "NEUTRAL";
  if (v.includes("STRONG") && v.includes("BUY")) return "STRONG BUY";
  if (v.includes("BUY")) return "BUY";
  if (v.includes("STRONG") && v.includes("SELL")) return "STRONG SELL";
  if (v.includes("SELL")) return "SELL";
  return "NEUTRAL";
};

const syncStockScores = async ({ token, databaseId, runDate, rows, runMeta }) => {
  if (!databaseId) return { skipped: true, reason: "missing_db", created: 0, updated: 0 };
  const db = await notionRequest(token, `/v1/databases/${databaseId}`, { method: "GET" });
  const schema = db?.properties || {};
  const titleField = findTitlePropertyName(schema);
  if (!titleField) return { skipped: true, reason: "missing_title", created: 0, updated: 0 };

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const notes = [
      `decision=${String(row?.finalDecision || "N/A")}`,
      `reason=${String(row?.decisionReason || "N/A")}`,
      `bucket=${String(row?.executionBucket || "N/A")}`,
      `run=${runMeta.runId || "N/A"}`,
      `stage6=${runMeta.stage6File || "N/A"}`,
      `hash=${(runMeta.stage6Hash || "").slice(0, 12) || "N/A"}`
    ].join(" ");

    const props = {
      [titleField]: titleProp(symbol)
    };
    setAliasProp(props, schema, ["Date", "Run Date"], {
      date: () => dateProp(runDate)
    });
    setAliasProp(props, schema, ["Stage Reached"], {
      select: () => selectProp("Stage 6"),
      status: () => statusProp("Stage 6"),
      rich_text: () => textProp("Stage 6")
    });
    setAliasProp(props, schema, ["Composite Alpha"], {
      number: () => numberProp(row?.compositeAlpha, 2)
    });
    setAliasProp(props, schema, ["Quality Score"], {
      number: () => numberProp(row?.qualityScore, 2)
    });
    setAliasProp(props, schema, ["Fundamental Score"], {
      number: () => numberProp(row?.fundamentalScore, 2)
    });
    setAliasProp(props, schema, ["Tech Score", "Technical Score"], {
      number: () => numberProp(row?.technicalScore, 2)
    });
    setAliasProp(props, schema, ["Price", "Current Price"], {
      number: () => numberProp(row?.price, 2)
    });
    setAliasProp(props, schema, ["Price Change %"], {
      number: () => numberProp(row?.changePct, 2)
    });
    setAliasProp(props, schema, ["Market Cap"], {
      number: () => numberProp(row?.marketCap, 0)
    });
    setAliasProp(props, schema, ["Volume"], {
      number: () => numberProp(row?.volume, 0)
    });
    setAliasProp(props, schema, ["Sector"], {
      rich_text: () => textProp(row?.sector || ""),
      select: () => selectProp(row?.sector || "Unknown")
    });
    setAliasProp(props, schema, ["Notes", "Summary"], {
      rich_text: () => textProp(notes)
    });

    const action = await upsertByTitle(token, databaseId, titleField, symbol, props);
    if (action === "created") created += 1;
    else updated += 1;
  }

  return { skipped: false, reason: "ok", created, updated };
};

const syncAiAnalysis = async ({ token, databaseId, runDate, rows, runMeta }) => {
  if (!databaseId) return { skipped: true, reason: "missing_db", created: 0, updated: 0 };
  const db = await notionRequest(token, `/v1/databases/${databaseId}`, { method: "GET" });
  const schema = db?.properties || {};
  const titleField = findTitlePropertyName(schema);
  if (!titleField) return { skipped: true, reason: "missing_title", created: 0, updated: 0 };

  let created = 0;
  let updated = 0;
  const modelName = String(runMeta.engine || "").toUpperCase().includes("GEMINI")
    ? "Gemini"
    : String(runMeta.engine || "").toUpperCase().includes("PERPLEXITY")
      ? "Sonar"
      : "Combined";

  for (const row of rows) {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const alphaSignal = alphaSignalFromVerdict(row?.aiVerdict);
    const risk = [
      `decision=${String(row?.finalDecision || "N/A")}`,
      `reason=${String(row?.decisionReason || "N/A")}`,
      `bucket=${String(row?.executionBucket || "N/A")}`
    ].join(" ");
    const props = {
      [titleField]: titleProp(symbol)
    };
    setAliasProp(props, schema, ["Date", "Run Date"], {
      date: () => dateProp(runDate)
    });
    setAliasProp(props, schema, ["AI Model"], {
      select: () => selectProp(modelName),
      rich_text: () => textProp(modelName)
    });
    setAliasProp(props, schema, ["Alpha Signal"], {
      select: () => selectProp(alphaSignal),
      status: () => statusProp(alphaSignal),
      rich_text: () => textProp(alphaSignal)
    });
    setAliasProp(props, schema, ["Analysis Summary", "Summary"], {
      rich_text: () => textProp(row?.investmentOutlook || "")
    });
    setAliasProp(props, schema, ["Composite Alpha"], {
      number: () => numberProp(row?.compositeAlpha, 2)
    });
    setAliasProp(props, schema, ["Confidence Score"], {
      number: () => numberProp(row?.convictionScore, 2)
    });
    setAliasProp(props, schema, ["Price Target", "Target Price"], {
      number: () => numberProp(row?.targetPrice, 2)
    });
    setAliasProp(props, schema, ["Key Catalysts"], {
      rich_text: () =>
        textProp(Array.isArray(row?.selectionReasons) ? row.selectionReasons.filter(Boolean).join(", ") : "")
    });
    setAliasProp(props, schema, ["Risk Factors", "Notes"], {
      rich_text: () => textProp(risk)
    });
    setAliasProp(props, schema, ["Time Horizon"], {
      select: () => selectProp("Mid-term"),
      rich_text: () => textProp("Mid-term")
    });

    const action = await upsertByTitle(token, databaseId, titleField, symbol, props);
    if (action === "created") created += 1;
    else updated += 1;
  }

  return { skipped: false, reason: "ok", created, updated };
};

const syncWatchlist = async ({ token, databaseId, runDate, rows, executableSymbols }) => {
  if (!databaseId) return { skipped: true, reason: "missing_db", created: 0, updated: 0 };
  const db = await notionRequest(token, `/v1/databases/${databaseId}`, { method: "GET" });
  const schema = db?.properties || {};
  const titleField = findTitlePropertyName(schema);
  if (!titleField) return { skipped: true, reason: "missing_title", created: 0, updated: 0 };

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const alphaSignal = alphaSignalFromVerdict(row?.aiVerdict);
    const statusValue = executableSymbols.has(symbol) ? "Position Open" : "Watching";
    const notes = [
      `decision=${String(row?.finalDecision || "N/A")}`,
      `reason=${String(row?.decisionReason || "N/A")}`,
      `bucket=${String(row?.executionBucket || "N/A")}`
    ].join(" ");
    const props = {
      [titleField]: titleProp(symbol)
    };
    setAliasProp(props, schema, ["Added Date", "Date"], {
      date: () => dateProp(runDate)
    });
    setAliasProp(props, schema, ["Status"], {
      status: () => statusProp(statusValue),
      select: () => selectProp(statusValue),
      rich_text: () => textProp(statusValue)
    });
    setAliasProp(props, schema, ["Alpha Signal"], {
      select: () => selectProp(alphaSignal),
      status: () => statusProp(alphaSignal),
      rich_text: () => textProp(alphaSignal)
    });
    setAliasProp(props, schema, ["Composite Alpha"], {
      number: () => numberProp(row?.compositeAlpha, 2)
    });
    setAliasProp(props, schema, ["Quality Score"], {
      number: () => numberProp(row?.qualityScore, 2)
    });
    setAliasProp(props, schema, ["Fundamental Score"], {
      number: () => numberProp(row?.fundamentalScore, 2)
    });
    setAliasProp(props, schema, ["Tech Score", "Technical Score"], {
      number: () => numberProp(row?.technicalScore, 2)
    });
    setAliasProp(props, schema, ["Current Price", "Price"], {
      number: () => numberProp(row?.price, 2)
    });
    setAliasProp(props, schema, ["Entry Price"], {
      number: () => numberProp(row?.entryPrice, 2)
    });
    setAliasProp(props, schema, ["Target Price"], {
      number: () => numberProp(row?.targetPrice, 2)
    });
    setAliasProp(props, schema, ["Stop Loss"], {
      number: () => numberProp(row?.stopLoss, 2)
    });
    setAliasProp(props, schema, ["Sector"], {
      rich_text: () => textProp(row?.sector || ""),
      select: () => selectProp(row?.sector || "Unknown")
    });
    setAliasProp(props, schema, ["Notes", "Summary"], {
      rich_text: () => textProp(notes)
    });

    const action = await upsertByTitle(token, databaseId, titleField, symbol, props);
    if (action === "created") created += 1;
    else updated += 1;
  }
  return { skipped: false, reason: "ok", created, updated };
};

const normalizeRows = (rows) => {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => row && typeof row === "object");
};

const dedupeBySymbol = (rows) => {
  const out = new Map();
  for (const row of rows) {
    const symbol = String(row?.symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    out.set(symbol, { ...row, symbol });
  }
  return Array.from(out.values());
};

const main = async () => {
  const enabled = boolFromEnv("NOTION_PIPELINE_SYNC_ENABLED", true);
  const required = boolFromEnv("NOTION_PIPELINE_SYNC_REQUIRED", false);
  const token = env("NOTION_TOKEN");
  const payloadPath = env("NOTION_PIPELINE_SYNC_PAYLOAD_PATH", "notion-pipeline-sync-payload.json");
  const dbStockScores = env("NOTION_DB_STOCK_SCORES");
  const dbAiAnalysis = env("NOTION_DB_AI_ALPHA_ANALYSIS");
  const dbWatchlist = env("NOTION_DB_WATCHLIST");

  if (!enabled) {
    const out = { at: nowIso(), status: "skip", reason: "disabled" };
    writeState(out);
    console.log("[NOTION_PIPELINE_SYNC] skip disabled");
    return;
  }

  if (!token) {
    const out = { at: nowIso(), status: "skip", reason: "missing_notion_token" };
    writeState(out);
    console.log("[NOTION_PIPELINE_SYNC] skip missing token");
    if (required) process.exit(1);
    return;
  }

  const payload = readJson(payloadPath);
  if (!payload || typeof payload !== "object") {
    const out = { at: nowIso(), status: "skip", reason: `missing_or_invalid_payload:${payloadPath}` };
    writeState(out);
    console.log(`[NOTION_PIPELINE_SYNC] skip payload missing/invalid path=${payloadPath}`);
    if (required) process.exit(1);
    return;
  }

  const executablePicks = normalizeRows(payload.executablePicks);
  const watchlist = normalizeRows(payload.watchlist);
  const rows = dedupeBySymbol([...executablePicks, ...watchlist]);
  if (rows.length === 0) {
    const out = { at: nowIso(), status: "skip", reason: "empty_rows", payloadPath };
    writeState(out);
    console.log("[NOTION_PIPELINE_SYNC] skip empty rows");
    return;
  }

  const runDate = toDateOnly(payload.runDateIso || nowIso());
  const runMeta = {
    runId: short(payload.runId || "", 120),
    stage6File: short(payload.stage6File || "", 240),
    stage6Hash: short(payload.stage6Hash || "", 120),
    engine: short(payload.engine || "", 80)
  };
  const executableSymbols = new Set(
    executablePicks
      .map((row) => String(row?.symbol || "").trim().toUpperCase())
      .filter(Boolean)
  );

  const stock = await syncStockScores({
    token,
    databaseId: dbStockScores,
    runDate,
    rows,
    runMeta
  });
  const ai = await syncAiAnalysis({
    token,
    databaseId: dbAiAnalysis,
    runDate,
    rows,
    runMeta
  });
  const watch = await syncWatchlist({
    token,
    databaseId: dbWatchlist,
    runDate,
    rows,
    executableSymbols
  });

  const missingDb = [];
  if (!dbStockScores) missingDb.push("NOTION_DB_STOCK_SCORES");
  if (!dbAiAnalysis) missingDb.push("NOTION_DB_AI_ALPHA_ANALYSIS");
  if (!dbWatchlist) missingDb.push("NOTION_DB_WATCHLIST");

  const out = {
    at: nowIso(),
    status: missingDb.length > 0 ? "partial" : "ok",
    reason: missingDb.length > 0 ? `missing_db_vars:${missingDb.join(",")}` : "ok",
    payloadPath,
    rowCount: rows.length,
    runMeta,
    results: {
      stockScores: stock,
      aiAnalysis: ai,
      watchlist: watch
    }
  };
  writeState(out);
  console.log(
    `[NOTION_PIPELINE_SYNC] status=${out.status} rows=${rows.length} stock=${stock.created + stock.updated} ai=${ai.created + ai.updated} watch=${watch.created + watch.updated} reason=${out.reason}`
  );

  if (required && out.status !== "ok") {
    process.exit(1);
  }
};

main().catch((error) => {
  const required = boolFromEnv("NOTION_PIPELINE_SYNC_REQUIRED", false);
  const out = {
    at: nowIso(),
    status: "fail",
    reason: error instanceof Error ? error.message : String(error)
  };
  writeState(out);
  console.error(`[NOTION_PIPELINE_SYNC] fail: ${out.reason}`);
  if (required) process.exit(1);
});
