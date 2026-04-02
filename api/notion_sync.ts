import { captureApiError, withSentryApi } from "./_sentry.js";
type Json = Record<string, any>;

const NOTION_VERSION = "2022-06-28";

const sanitizeDatabaseId = (value: string): string => String(value || "").trim();

const parseNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toDateOnly = (isoLike: string): string => {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
};

const shortText = (value: unknown, max = 1800): string => String(value || "").trim().slice(0, max);

const alphaSignalFromVerdict = (verdict: unknown): string => {
  const v = String(verdict || "").trim().toUpperCase().replace(/\s+/g, "_");
  if (!v) return "NEUTRAL";
  if (v.includes("STRONG") && v.includes("BUY")) return "STRONG BUY";
  if (v.includes("BUY")) return "BUY";
  if (v.includes("STRONG") && v.includes("SELL")) return "STRONG SELL";
  if (v.includes("SELL")) return "SELL";
  return "NEUTRAL";
};

const modelFromEngine = (engine: unknown): string => {
  const e = String(engine || "").trim().toUpperCase();
  if (e.includes("GEMINI")) return "Gemini";
  if (e.includes("PERPLEXITY") || e.includes("SONAR")) return "Sonar";
  return "Combined";
};

const marketConditionFromPulse = (pulse: Json | undefined): string => {
  const vix = parseNumber(pulse?.vix?.price);
  const spy = parseNumber(pulse?.spy?.change);
  const qqq = parseNumber(pulse?.qqq?.change);
  if (vix != null && vix >= 28) return "VOLATILE";
  const avg = [spy, qqq].filter((n): n is number => n != null);
  if (avg.length === 0) return "NEUTRAL";
  const mean = avg.reduce((a, b) => a + b, 0) / avg.length;
  if (mean >= 0.8) return "BULL";
  if (mean <= -0.8) return "BEAR";
  return "NEUTRAL";
};

const toNotionHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  "Content-Type": "application/json"
});

const notionRequest = async (token: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`https://api.notion.com${path}`, {
    ...init,
    headers: {
      ...toNotionHeaders(token),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Notion ${path} failed (${response.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
};

const queryPageByTitle = async (token: string, databaseId: string, propertyName: string, titleValue: string) => {
  const payload = {
    filter: {
      property: propertyName,
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

const upsertByTitle = async (
  token: string,
  databaseId: string,
  titleProperty: string,
  titleValue: string,
  properties: Json
) => {
  const existing = await queryPageByTitle(token, databaseId, titleProperty, titleValue);
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

const titleProp = (value: string) => ({
  title: [{ text: { content: shortText(value, 200) } }]
});

const textProp = (value: unknown) => ({
  rich_text: [{ text: { content: shortText(value, 1900) } }]
});

const numberProp = (value: unknown) => ({
  number: parseNumber(value)
});

const selectProp = (value: unknown) => ({
  select: { name: String(value || "").trim() || "NEUTRAL" }
});

const dateProp = (value: string) => ({
  date: { start: value }
});

const handler = async (req: any, res: any) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const notionToken = String(process.env.NOTION_TOKEN || "").trim();
  const dbDaily = sanitizeDatabaseId(String(process.env.NOTION_DB_DAILY_SNAPSHOT || ""));
  const dbScores = sanitizeDatabaseId(String(process.env.NOTION_DB_STOCK_SCORES || ""));
  const dbAi = sanitizeDatabaseId(String(process.env.NOTION_DB_AI_ALPHA_ANALYSIS || ""));
  const dbWatchlist = sanitizeDatabaseId(String(process.env.NOTION_DB_WATCHLIST || ""));

  if (!notionToken) {
    res.status(503).json({ error: "notion_token_missing" });
    return;
  }

  if (!dbDaily || !dbScores || !dbAi || !dbWatchlist) {
    res.status(503).json({
      error: "notion_db_ids_missing",
      message: "Set NOTION_DB_DAILY_SNAPSHOT / NOTION_DB_STOCK_SCORES / NOTION_DB_AI_ALPHA_ANALYSIS / NOTION_DB_WATCHLIST"
    });
    return;
  }

  try {
    const body = req.body || {};
    const runId = shortText(body.runId || new Date().toISOString(), 100);
    const runDateIso = String(body.runDateIso || new Date().toISOString());
    const runDateOnly = toDateOnly(runDateIso);
    const engine = modelFromEngine(body.engine);
    const stageCounts = body.stageCounts || {};
    const pulse = body.marketPulse || {};
    const executablePicks = Array.isArray(body.executablePicks) ? body.executablePicks : [];
    const watchlist = Array.isArray(body.watchlist) ? body.watchlist : [];
    const topTickers = executablePicks.map((row: any) => String(row?.symbol || "").toUpperCase()).filter(Boolean).slice(0, 6);

    const details = {
      dailySnapshot: 0,
      stockScores: 0,
      aiAnalysis: 0,
      watchlist: 0
    };

    // 1) Daily Snapshot
    await upsertByTitle(notionToken, dbDaily, "Run Date", runId, {
      "Run Date": titleProp(runId),
      Date: dateProp(runDateOnly),
      Status: selectProp((stageCounts.finalPicks || 0) > 0 ? "Success" : "Partial"),
      "Market Condition": selectProp(marketConditionFromPulse(pulse)),
      "VIX Level": numberProp(pulse?.vix?.price),
      "SP500 Change %": numberProp(pulse?.spy?.change),
      "NASDAQ Change %": numberProp(pulse?.qqq?.change),
      "Stage 1 Count": numberProp(stageCounts.stage1),
      "Stage 2 Count": numberProp(stageCounts.stage2),
      "Stage 3 Count": numberProp(stageCounts.stage3),
      "Stage 4 Count": numberProp(stageCounts.stage4),
      "Stage 5 Count": numberProp(stageCounts.stage5),
      "Stage 6 Count": numberProp(stageCounts.stage6),
      "Final Picks Count": numberProp(stageCounts.finalPicks),
      "Run Duration (s)": numberProp(stageCounts.runDurationSec),
      Summary: textProp(
        `engine=${String(body.engine || "N/A")} stage6File=${String(body.stage6File || "N/A")} stage6Hash=${String(body.stage6Hash || "N/A").slice(0, 12)}`
      ),
      "Top Tickers": textProp(topTickers.join(", "))
    });
    details.dailySnapshot += 1;

    // 2) Stock Scores + AI Analysis + Watchlist
    const syncRows = [...executablePicks, ...watchlist];
    for (const row of syncRows) {
      const symbol = String(row?.symbol || "").trim().toUpperCase();
      if (!symbol) continue;

      const alphaSignal = alphaSignalFromVerdict(row?.aiVerdict);
      const baseNotes = `decision=${String(row?.finalDecision || "N/A")} reason=${String(row?.decisionReason || "N/A")} bucket=${String(
        row?.executionBucket || "N/A"
      )}`;

      await upsertByTitle(notionToken, dbScores, "Ticker", symbol, {
        Ticker: titleProp(symbol),
        Date: dateProp(runDateOnly),
        "Stage Reached": selectProp("Stage 6"),
        "Composite Alpha": numberProp(row?.compositeAlpha),
        "Quality Score": numberProp(row?.qualityScore),
        "Fundamental Score": numberProp(row?.fundamentalScore),
        "Tech Score": numberProp(row?.technicalScore),
        Price: numberProp(row?.price),
        "Price Change %": numberProp(row?.changePct),
        "Market Cap": numberProp(row?.marketCap),
        Volume: numberProp(row?.volume),
        Sector: textProp(row?.sector || ""),
        Notes: textProp(baseNotes)
      });
      details.stockScores += 1;

      await upsertByTitle(notionToken, dbAi, "Ticker", symbol, {
        Ticker: titleProp(symbol),
        Date: dateProp(runDateOnly),
        "AI Model": selectProp(engine),
        "Alpha Signal": selectProp(alphaSignal),
        "Analysis Summary": textProp(row?.investmentOutlook || ""),
        "Composite Alpha": numberProp(row?.compositeAlpha),
        "Confidence Score": numberProp(row?.convictionScore),
        "Price Target": numberProp(row?.targetPrice),
        "Key Catalysts": textProp(Array.isArray(row?.selectionReasons) ? row.selectionReasons.join(", ") : ""),
        "Risk Factors": textProp(baseNotes),
        "Time Horizon": selectProp("Mid-term")
      });
      details.aiAnalysis += 1;

      const status = executablePicks.some((pick: any) => String(pick?.symbol || "").toUpperCase() === symbol)
        ? "Position Open"
        : "Watching";
      await upsertByTitle(notionToken, dbWatchlist, "Ticker", symbol, {
        Ticker: titleProp(symbol),
        "Added Date": dateProp(runDateOnly),
        Status: selectProp(status),
        "Alpha Signal": selectProp(alphaSignal),
        "Composite Alpha": numberProp(row?.compositeAlpha),
        "Quality Score": numberProp(row?.qualityScore),
        "Fundamental Score": numberProp(row?.fundamentalScore),
        "Tech Score": numberProp(row?.technicalScore),
        "Current Price": numberProp(row?.price),
        "Entry Price": numberProp(row?.entryPrice),
        "Target Price": numberProp(row?.targetPrice),
        "Stop Loss": numberProp(row?.stopLoss),
        Sector: textProp(row?.sector || ""),
        Notes: textProp(baseNotes)
      });
      details.watchlist += 1;
    }

    res.status(200).json({
      ok: true,
      message: "notion_sync_completed",
      details
    });
  } catch (error: any) {
    console.error("[NOTION_SYNC] failed:", error);
    captureApiError(error, {
      source: "notion_sync",
      method: req?.method || "UNKNOWN",
      runId: shortText(req?.body?.runId || "", 80),
      stage6File: shortText(req?.body?.stage6File || "", 160)
    });
    res.status(500).json({
      error: "notion_sync_failed",
      message: String(error?.message || error)
    });
  }
};

export default withSentryApi(handler);
