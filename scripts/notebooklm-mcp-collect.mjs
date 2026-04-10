import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CWD = process.cwd();
const DEFAULT_OUTPUT = path.join(CWD, "state", "notebooklm-intake.json");
const REPORT_PATH = path.join(CWD, "state", "notebooklm-mcp-collect-report.json");

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
  const candidates = [path.join(CWD, ".env"), path.join(CWD, ".vscode", "mcp.env"), path.join(CWD, ".vscode", "mcp.env.local")];
  for (const filePath of candidates) {
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
const numberFromEnv = (name, fallback) => {
  const raw = Number.parseInt(env(name, ""), 10);
  return Number.isFinite(raw) ? raw : fallback;
};

const short = (value, max = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const safeJsonParse = (text, fallback = null) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const parseJsonArrayEnv = (name, fallback) => {
  const raw = env(name, "");
  if (!raw) return fallback;
  const parsed = safeJsonParse(raw, null);
  if (Array.isArray(parsed)) return parsed.map((x) => String(x || "").trim()).filter(Boolean);
  return raw
    .split("||")
    .map((x) => String(x || "").trim())
    .filter(Boolean);
};

const resolvePath = (value, fallbackPath) => {
  const raw = String(value || "").trim();
  if (!raw) return fallbackPath;
  if (path.isAbsolute(raw)) return raw;
  return path.join(CWD, raw);
};

const parseToolTextResult = (toolResult) => {
  const text = String(toolResult?.result?.content?.find((x) => x?.type === "text")?.text || "").trim();
  const parsed = safeJsonParse(text, null);
  return { text, parsed };
};

const titleFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const hostLabel = host.split(".")[0] || "Notebook";
    return short(`${hostLabel.toUpperCase()} Market Intel`, 80);
  } catch {
    return "NotebookLM Market Intel";
  }
};

const guessCategory = (question, answer) => {
  const text = `${question} ${answer}`.toLowerCase();
  if (/(fomc|federal reserve|rates|cpi|employment|gdp|fedwatch)/.test(text)) return "Macro";
  if (/(vix|volatility|drawdown|risk|hedge)/.test(text)) return "Volatility";
  if (/(earnings|guidance|revenue|profit)/.test(text)) return "Earnings";
  if (/(sector|rotation|momentum|trend)/.test(text)) return "Trend";
  return "MCP";
};

const extractAnswerText = (resultText, parsed) => {
  const candidates = [
    parsed?.data?.answer,
    parsed?.data?.response,
    parsed?.data?.finalAnswer,
    parsed?.answer,
    parsed?.response,
    parsed?.message
  ];
  for (const item of candidates) {
    if (typeof item === "string" && item.trim()) return item.trim();
  }
  return resultText;
};

const isNoSourceUiError = (text) => {
  const s = String(text || "");
  return /(시작하려면 출처를 업로드하세요|upload.*source|element is not enabled)/i.test(s);
};

class JsonLineRpcClient {
  constructor({ command, args, commandEnv, timeoutMs = 90000 }) {
    this.command = command;
    this.args = args;
    this.commandEnv = commandEnv;
    this.timeoutMs = timeoutMs;
    this.proc = null;
    this.buffer = "";
    this.nextId = 1;
    this.pending = new Map();
    this.exitCode = null;
  }

  async start() {
    this.proc = spawn(this.command, this.args, {
      cwd: CWD,
      env: this.commandEnv,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.proc.stdout.on("data", (chunk) => this.#onStdout(chunk));
    this.proc.stderr.on("data", (chunk) => process.stderr.write(String(chunk)));
    this.proc.on("error", (error) => {
      this.exitCode = -1;
      for (const [, resolve] of this.pending.entries()) {
        resolve({ error: { message: `mcp_process_error:${error?.message || error}` } });
      }
      this.pending.clear();
    });
    this.proc.on("exit", (code) => {
      this.exitCode = code;
      for (const [, resolve] of this.pending.entries()) {
        resolve({ error: { message: `mcp_process_exit:${code}` } });
      }
      this.pending.clear();
    });
    await this.request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "knowledge-intake-notebooklm", version: "1.0.0" }
    });
    this.notify("notifications/initialized", {});
  }

  async stop() {
    if (!this.proc) return;
    this.proc.kill("SIGTERM");
    this.proc = null;
  }

  notify(method, params = {}) {
    this.#send({ jsonrpc: "2.0", method, params });
  }

  async request(method, params = {}) {
    if (this.exitCode != null) throw new Error(`mcp_process_exit:${this.exitCode}`);
    const id = this.nextId++;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error) reject(new Error(msg.error?.message || JSON.stringify(msg.error)));
        else resolve(msg);
      });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  #send(message) {
    this.proc.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #onStdout(chunk) {
    this.buffer += chunk.toString("utf8");
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      const msg = safeJsonParse(line, null);
      if (!msg) continue;
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    }
  }
}

const defaultQuestions = [
  "Summarize the top macro risks for US equities this week with citations.",
  "List actionable trend/sector signals that can improve automated long-only entry timing.",
  "What volatility and drawdown guard rules should we tighten for live auto-trading?",
  "Propose 3 measurable feature ideas for higher win-rate and lower false-positive entries.",
  "What monitoring/incident triggers should be added for autonomous risk response?"
];

const main = async () => {
  const enabled = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ENABLED", false);
  const required = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_REQUIRED", false);
  const outputPath = resolvePath(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH"), DEFAULT_OUTPUT);
  const forceOverwrite = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_OVERWRITE", false);
  const command = env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_COMMAND", "npx");
  const args = parseJsonArrayEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_ARGS", ["-y", "notebooklm-mcp"]);
  const notebookId = env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_ID", "");
  const notebookUrl = env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_URL", "");
  const notebookQuery = env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_NOTEBOOK_QUERY", "");
  const maxItems = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_ITEMS", 10);
  const questions = parseJsonArrayEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTIONS", defaultQuestions).slice(0, maxItems);
  const showBrowser = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_SHOW_BROWSER", false);
  const bootstrapUrls = parseJsonArrayEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BOOTSTRAP_URLS", []);

  const report = {
    generatedAt: new Date().toISOString(),
    enabled,
    required,
    status: "skip_disabled",
    reason: "",
    outputPath: path.relative(CWD, outputPath),
    command,
    args,
    notebook: { requestedId: notebookId || null, requestedUrl: notebookUrl || null, query: notebookQuery || null, selected: null },
    health: { authenticated: null, status: null },
    asked: 0,
    collected: 0
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });

  if (!enabled) {
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log("[NOTEBOOKLM_MCP_COLLECT] status=skip_disabled");
    return;
  }

  if (!forceOverwrite && fs.existsSync(outputPath)) {
    report.status = "skip_existing";
    report.reason = "output_exists";
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`[NOTEBOOKLM_MCP_COLLECT] status=skip_existing output=${path.relative(CWD, outputPath)}`);
    return;
  }

  const commandEnv = { ...process.env };
  if (env("GEMINI_API_KEY")) commandEnv.GOOGLE_API_KEY = env("GEMINI_API_KEY");

  const client = new JsonLineRpcClient({ command, args, commandEnv });
  try {
    await client.start();
    const refreshHealth = async () => {
      const healthRes = await client.request("tools/call", { name: "get_health", arguments: {} });
      const healthParsed = parseToolTextResult(healthRes);
      report.health.status = healthParsed.parsed?.data?.status ?? null;
      report.health.authenticated = healthParsed.parsed?.data?.authenticated ?? null;
    };
    await refreshHealth();

    // If auth is missing and browser mode is enabled, request one-time manual auth first.
    if (report.health.authenticated === false && showBrowser) {
      try {
        await client.request("tools/call", { name: "setup_auth", arguments: { show_browser: true } });
      } catch (authErr) {
        report.authSetup = { status: "failed", reason: authErr?.message || String(authErr) };
      }
      await refreshHealth();
    }

    const listRes = await client.request("tools/call", { name: "list_notebooks", arguments: {} });
    const listParsed = parseToolTextResult(listRes);
    const notebooks = Array.isArray(listParsed.parsed?.data?.notebooks) ? listParsed.parsed.data.notebooks : [];
    let selected = null;

    if (notebookUrl) selected = { url: notebookUrl };
    else if (notebookId) selected = notebooks.find((x) => String(x?.id || "") === notebookId) || null;
    else if (notebookQuery) {
      const q = notebookQuery.toLowerCase();
      selected = notebooks.find((x) => `${x?.name || ""} ${x?.description || ""}`.toLowerCase().includes(q)) || null;
    } else if (notebooks.length > 0) selected = notebooks[0];

    if (!selected && notebooks.length === 0 && bootstrapUrls.length > 0) {
      for (const url of bootstrapUrls) {
        await client.request("tools/call", {
          name: "add_notebook",
          arguments: {
            url,
            name: titleFromUrl(url),
            description: "Auto-registered by knowledge intake pipeline for market intelligence automation",
            topics: ["market-intel", "automation", "signals"],
            content_types: ["research", "reports", "analysis"],
            use_cases: ["daily market intelligence update", "strategy feature ideation"],
            tags: ["auto", "knowledge-pipeline", "notebooklm"]
          }
        });
      }
      const afterAddRes = await client.request("tools/call", { name: "list_notebooks", arguments: {} });
      const afterAddParsed = parseToolTextResult(afterAddRes);
      const afterAdd = Array.isArray(afterAddParsed.parsed?.data?.notebooks) ? afterAddParsed.parsed.data.notebooks : [];
      if (notebookQuery) {
        const q = notebookQuery.toLowerCase();
        selected = afterAdd.find((x) => `${x?.name || ""} ${x?.description || ""}`.toLowerCase().includes(q)) || null;
      } else {
        selected = afterAdd[0] || null;
      }
      report.notebook.bootstrapAdded = bootstrapUrls.length;
    }

    if (!selected) {
      report.status = "skip_no_notebook";
      report.reason = "no notebook selected (set NOTEBOOKLM_NOTEBOOK_URL/ID or add notebooks to library)";
      report.notebook.available = notebooks.length;
      throw new Error(report.reason);
    }
    report.notebook.selected = {
      id: selected.id || null,
      name: selected.name || null,
      url: selected.url || notebookUrl || null
    };

    if (report.health.authenticated === false) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(
        outputPath,
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            mode: "notebooklm_mcp",
            notebook: report.notebook.selected,
            questions,
            items: []
          },
          null,
          2
        )}\n`,
        "utf8"
      );
      report.status = "no_items";
      report.reason = "not_authenticated_or_notebook_access_denied";
      report.collected = 0;
      console.log(
        `[NOTEBOOKLM_MCP_COLLECT] status=${report.status} notebooks=${notebooks.length} asked=${report.asked} collected=${report.collected} output=${path.relative(CWD, outputPath)}`
      );
      return;
    }

    const items = [];
    let failCount = 0;
    let index = 1;
    let noSourceUiBlocked = false;
    for (const question of questions) {
      const args = {
        question,
        show_browser: showBrowser
      };
      if (selected?.id) args.notebook_id = selected.id;
      if (selected?.url && !selected?.id) args.notebook_url = selected.url;
      const callRes = await client.request("tools/call", { name: "ask_question", arguments: args });
      report.asked += 1;
      const parsed = parseToolTextResult(callRes);
      const ok = parsed.parsed?.success !== false;
      if (!ok) {
        failCount += 1;
        if (isNoSourceUiError(parsed.text)) {
          noSourceUiBlocked = true;
          break;
        }
        continue;
      }
      const answer = extractAnswerText(parsed.text, parsed.parsed);
      if (!answer) continue;
      items.push({
        id: `nlm-${Date.now()}-${index}`,
        title: short(question, 120),
        summary: short(answer, 1200),
        category: guessCategory(question, answer),
        priority: index <= 3 ? "P1" : "P2",
        sourceUrl: selected?.url || "",
        sourceRef: `notebooklm_mcp:${selected?.id || "url"}`,
        sourceType: "notebooklm_mcp"
      });
      index += 1;
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          mode: "notebooklm_mcp",
          notebook: report.notebook.selected,
          questions,
          items
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    report.status = items.length > 0 ? "ok" : "no_items";
    report.reason =
      items.length > 0
        ? ""
        : noSourceUiBlocked
          ? "notebook_has_no_sources_or_query_disabled"
        : report.health.authenticated === false
          ? "not_authenticated_or_notebook_access_denied"
          : failCount > 0
            ? "ask_question_failed_for_all_items"
            : "ask_question_returned_no_content";
    report.collected = items.length;
    console.log(
      `[NOTEBOOKLM_MCP_COLLECT] status=${report.status} notebooks=${notebooks.length} asked=${report.asked} collected=${report.collected} output=${path.relative(CWD, outputPath)}`
    );
  } catch (error) {
    if (report.status === "skip_no_notebook") {
      console.log(`[NOTEBOOKLM_MCP_COLLECT] status=skip_no_notebook available=${report.notebook.available || 0}`);
    } else {
      report.status = "fail";
      report.reason = error?.message || String(error);
      console.log(`[NOTEBOOKLM_MCP_COLLECT] status=fail reason=${report.reason}`);
    }
    if (required && !["ok", "no_items"].includes(report.status)) {
      fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      throw new Error(`NotebookLM MCP collect failed: ${report.reason}`);
    }
  } finally {
    await client.stop();
    fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
};

main().catch((error) => {
  console.error(`[NOTEBOOKLM_MCP_COLLECT] fatal: ${error?.message || error}`);
  process.exit(1);
});
