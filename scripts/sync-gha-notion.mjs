import fs from "node:fs";

const NOTION_VERSION = "2022-06-28";

const env = (name, fallback = "") => String(process.env[name] ?? fallback).trim();

const boolFromEnv = (name, fallback = true) => {
  const raw = env(name);
  if (!raw) return fallback;
  const value = raw.toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
};

const toDateOnly = (isoLike) => {
  const parsed = new Date(isoLike);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

const shortText = (value, max = 1800) => String(value ?? "").trim().slice(0, max);

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
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Notion ${path} failed (${response.status}): ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
};

const findTitlePropertyName = (schema) => {
  const entries = Object.entries(schema || {});
  const hit = entries.find(([, def]) => String(def?.type || "") === "title");
  return hit ? hit[0] : null;
};

const titleProp = (value) => ({
  title: [{ text: { content: shortText(value, 200) } }]
});

const textProp = (value) => ({
  rich_text: [{ text: { content: shortText(value, 1900) } }]
});

const dateProp = (value) => ({
  date: { start: toDateOnly(value) }
});

const selectProp = (value) => ({
  select: { name: shortText(value, 100) || "Partial" }
});

const queryExistingByTitle = async (token, databaseId, titlePropertyName, titleValue) => {
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

const upsertPage = async (token, databaseId, titlePropertyName, titleValue, properties) => {
  const existing = await queryExistingByTitle(token, databaseId, titlePropertyName, titleValue);
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

const readDispatchPayload = () => {
  const path = env("NOTION_GHA_STAGE6_META_PATH", "stage6-dispatch-payload.json");
  if (!path || !fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    console.log(`[NOTION_GHA_SYNC] WARN cannot parse ${path}: ${error?.message || error}`);
    return null;
  }
};

const main = async () => {
  if (!boolFromEnv("NOTION_GHA_SYNC_ENABLED", true)) {
    console.log("[NOTION_GHA_SYNC] skip: disabled_by_env");
    return;
  }

  const notionToken = env("NOTION_TOKEN");
  const dbDaily = env("NOTION_DB_DAILY_SNAPSHOT");

  if (!notionToken || !dbDaily) {
    console.log("[NOTION_GHA_SYNC] skip: missing NOTION_TOKEN or NOTION_DB_DAILY_SNAPSHOT");
    return;
  }

  const statusRaw = env("GHA_JOB_STATUS", "success").toLowerCase();
  const status = statusRaw === "success" ? "Success" : "Partial";
  const runId = env("GITHUB_RUN_ID", "local");
  const runAttempt = env("GITHUB_RUN_ATTEMPT", "1");
  const runKey = `gha-${runId}-${runAttempt}`;
  const repository = env("GITHUB_REPOSITORY");
  const workflow = env("GITHUB_WORKFLOW");
  const eventName = env("GITHUB_EVENT_NAME");
  const actor = env("GITHUB_ACTOR");
  const sha = env("GITHUB_SHA");
  const serverUrl = env("GITHUB_SERVER_URL", "https://github.com");
  const runUrl = repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : "";

  const dispatchPayload = readDispatchPayload();
  const stage6File = shortText(dispatchPayload?.stage6File || env("STAGE6_FILE"), 240);
  const stage6Hash = shortText(dispatchPayload?.stage6Hash || env("STAGE6_HASH"), 64);
  const summary = [
    `source=github_actions`,
    `status=${statusRaw}`,
    `workflow=${workflow || "N/A"}`,
    `event=${eventName || "N/A"}`,
    `actor=${actor || "N/A"}`,
    `repo=${repository || "N/A"}`,
    `runUrl=${runUrl || "N/A"}`,
    `stage6File=${stage6File || "N/A"}`,
    `stage6Hash=${stage6Hash ? stage6Hash.slice(0, 12) : "N/A"}`,
    `sha=${sha ? sha.slice(0, 12) : "N/A"}`
  ].join(" ");

  const db = await notionRequest(notionToken, `/v1/databases/${dbDaily}`, { method: "GET" });
  const schema = db?.properties || {};
  const titlePropertyName = findTitlePropertyName(schema) || "Run Date";
  const has = (name) => Object.prototype.hasOwnProperty.call(schema, name);

  const properties = {
    [titlePropertyName]: titleProp(runKey)
  };

  if (has("Date")) properties.Date = dateProp(new Date().toISOString());
  if (has("Status")) properties.Status = selectProp(status);
  if (has("Summary")) properties.Summary = textProp(summary);
  if (has("Top Tickers")) {
    properties["Top Tickers"] = textProp(stage6File || stage6Hash ? `${stage6File || "N/A"} ${stage6Hash ? `(${stage6Hash.slice(0, 12)})` : ""}` : "N/A");
  }

  const upsertStatus = await upsertPage(notionToken, dbDaily, titlePropertyName, runKey, properties);
  console.log(
    `[NOTION_GHA_SYNC] ${upsertStatus} key=${runKey} status=${statusRaw} stage6File=${stage6File || "N/A"} stage6Hash=${stage6Hash ? stage6Hash.slice(0, 12) : "N/A"}`
  );
};

main().catch((error) => {
  console.error(`[NOTION_GHA_SYNC] failed: ${error?.message || error}`);
  if (boolFromEnv("NOTION_GHA_SYNC_REQUIRED", false)) {
    process.exit(1);
  }
});
