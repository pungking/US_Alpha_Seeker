import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const CWD = process.cwd();
const DEFAULT_OUTPUT = path.join(CWD, "state", "notebooklm-intake.json");
const REPORT_PATH = path.join(CWD, "state", "notebooklm-mcp-collect-report.json");
const HEALTH_STATE_PATH = path.join(CWD, "state", "notebooklm-mcp-health.json");
const QUESTION_CURSOR_PATH = path.join(CWD, "state", "notebooklm-mcp-question-cursor.json");

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
const clampMin = (value, floor) => {
  const v = Number(value);
  const f = Number(floor);
  if (!Number.isFinite(v)) return Number.isFinite(f) ? f : value;
  if (!Number.isFinite(f)) return v;
  return Math.max(v, f);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const short = (value, max = 240) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const truncateAtNaturalBoundary = (value, max = 4200) => {
  const text = String(value || "");
  if (!text || text.length <= max) return text;
  const hard = Math.max(700, max);
  const head = text.slice(0, hard);
  const candidates = [
    head.lastIndexOf("\n\n"),
    head.lastIndexOf("\n"),
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf("다. "),
    head.lastIndexOf(" ")
  ].filter((idx) => idx >= Math.max(240, hard - 320));
  const cut = candidates.length > 0 ? Math.max(...candidates) : hard;
  return `${head.slice(0, cut).trim()}\n\n- (원문 길이 제한으로 일부 생략)`;
};
const sanitizeNotebookAnswerForStorage = (answer, maxChars) => {
  const raw = String(answer || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!raw) return "";
  return truncateAtNaturalBoundary(raw, Math.max(1200, Number(maxChars) || 4200));
};
const headingFromAnswer = (answer) => {
  const lines = String(answer || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const skip = new Set([
    "핵심 요약",
    "전략 해석",
    "기술 검증",
    "운영 체크포인트",
    "executive summary",
    "strategic analysis",
    "technical validation",
    "operational checklist"
  ]);
  for (const line of lines) {
    const cleaned = line
      .replace(/^#+\s*/, "")
      .replace(/^[-*]\s+/, "")
      .replace(/^\d+[.)]\s*/, "")
      .replace(/\*\*/g, "")
      .replace(/`/g, "")
      .replace(/\[[^\]]+\]\([^)]+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    if (skip.has(cleaned.toLowerCase())) continue;
    if (cleaned.length < 6) continue;
    return short(cleaned, 84);
  }
  return "";
};
const inferActionHintKo = (question, answer, category) => {
  const text = `${String(question || "")} ${String(answer || "")}`.toLowerCase();
  if (/(ohlcv|entry|validation|checklist|false-positive)/.test(text)) return "진입검증";
  if (/(risk[- ]?off|gating|guard|stop[- ]?loss|position[- ]?sizing|drawdown)/.test(text)) return "리스크게이팅";
  if (/(sector|rotation|flow|momentum|trend)/.test(text)) return "섹터로테이션";
  if (/(feature|model|win[- ]?rate|expectancy|precision)/.test(text)) return "모델개선";
  if (/(monitor|incident|trigger|alert|ops)/.test(text)) return "운영트리거";
  if (/(policy|compliance|sec|edgar|regulation)/.test(text)) return "정책준수";
  if (/(earnings|guidance|fundamental|eps|revenue)/.test(text)) return "실적체크";
  if (/(vix|volatility|tail risk|skew)/.test(text)) return "변동성대응";
  if (String(category || "").toLowerCase() === "macro") return "거시체크";
  return "";
};
const categoryPrefixKo = (category) => {
  const key = String(category || "").toLowerCase();
  if (key.includes("macro")) return "거시-금리";
  if (key.includes("volatility")) return "변동성-리스크";
  if (key.includes("earning")) return "실적-펀더멘털";
  if (key.includes("trend")) return "섹터-트렌드";
  if (key.includes("policy")) return "정책-컴플라이언스";
  return "시장-인텔";
};
const buildItemTitle = ({ question, answer, category, index }) => {
  const heading = headingFromAnswer(answer);
  const action = inferActionHintKo(question, answer, category);
  const prefix = categoryPrefixKo(category);
  const questionHint = short(
    String(question || "")
      .replace(/\s+/g, " ")
      .replace(/[?.!]+$/g, "")
      .trim(),
    56
  );
  const core = heading || action || questionHint || `인사이트-${index}`;
  const compactCore = short(
    String(core || "")
      .replace(/\s+/g, " ")
      .replace(/[.:：]\s*$/g, "")
      .trim(),
    68
  );
  return compactCore.startsWith(prefix) ? compactCore : `${prefix} · ${compactCore}`;
};

const safeJsonParse = (text, fallback = null) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const readJsonFile = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return fallback;
  return safeJsonParse(raw, fallback);
};

const writeJsonFile = (filePath, payload) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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

const readQuestionCursor = (filePath) => {
  const payload = readJsonFile(filePath, {});
  const cursor = Number.parseInt(String(payload?.cursor ?? "0"), 10);
  return Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
};

const writeQuestionCursor = (filePath, cursor) => {
  writeJsonFile(filePath, {
    generatedAt: new Date().toISOString(),
    cursor: Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0
  });
};

const selectQuestions = ({ allQuestions, maxItems, rotate, startCursor }) => {
  const source = Array.isArray(allQuestions) ? allQuestions : [];
  const cap = Math.max(1, Number(maxItems) || source.length || 1);
  if (source.length <= cap) {
    return {
      selected: [...source],
      selectedIndexes: source.map((_, index) => index),
      startCursor: 0,
      nextCursor: 0
    };
  }
  if (!rotate) {
    const selected = source.slice(0, cap);
    return {
      selected,
      selectedIndexes: selected.map((_, index) => index),
      startCursor: 0,
      nextCursor: 0
    };
  }
  const len = source.length;
  const cursor = Math.max(0, Number(startCursor) || 0) % len;
  const selected = [];
  const selectedIndexes = [];
  for (let offset = 0; offset < cap; offset += 1) {
    const idx = (cursor + offset) % len;
    selected.push(source[idx]);
    selectedIndexes.push(idx);
  }
  return {
    selected,
    selectedIndexes,
    startCursor: cursor,
    nextCursor: (cursor + selected.length) % len
  };
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

const META_SUFFIX_RE =
  /\n*\s*(?:©\s*\d{4}[^\n]*\n+)?EXTREMELY IMPORTANT:\s*Is that ALL you need to know\?[\s\S]*$/i;
const KR_BLOCK_RE = /^\s*시스템에서 답변할 수 없습니다\./;

const stripAssistantMetaSuffix = (text) => String(text || "").replace(META_SUFFIX_RE, "").trim();

const isInvalidAssistantMetaAnswer = (text) => {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const cleaned = stripAssistantMetaSuffix(raw);
  if (!cleaned) return true;
  // Guard-only responses start with this Korean fallback sentence and carry no analysis body.
  return KR_BLOCK_RE.test(cleaned) && cleaned.length < 220;
};

const isNoSourceUiError = (text) => {
  const s = String(text || "");
  return /(시작하려면 출처를 업로드하세요|upload.*source|element is not enabled)/i.test(s);
};

const isAuthFailureReason = (reason) => /not_authenticated_or_notebook_access_denied/i.test(String(reason || ""));
const isNoItemsReason = (status, reason) =>
  String(status || "").trim() === "no_items" ||
  /(items_empty|ask_question_returned_no_content|invalid_assistant_meta_answer|no_items)/i.test(
    `${String(status || "")} ${String(reason || "")}`
  );

const deriveNoItemsReason = ({
  noSourceUiBlocked,
  authenticated,
  invalidAnswerCount,
  asked,
  failCount,
  timeoutCount = 0
}) => {
  if (noSourceUiBlocked) return "notebook_has_no_sources_or_query_disabled";
  if (authenticated === false) return "not_authenticated_or_notebook_access_denied";
  if (timeoutCount > 0 && timeoutCount === asked) return "ask_question_timeout_for_all_items";
  if (timeoutCount > 0) return "ask_question_timeout_partial";
  if (invalidAnswerCount > 0 && invalidAnswerCount === asked) return "invalid_assistant_meta_answer_for_all_items";
  if (invalidAnswerCount > 0) return "invalid_assistant_meta_answer_partial";
  if (failCount > 0) return "ask_question_failed_for_all_items";
  return "ask_question_returned_no_content";
};

const isAskQuestionTimeoutReason = (reason) =>
  /(timeout\s+tools\/call|page\.goto:\s*Timeout|timed out)/i.test(String(reason || ""));

const buildNotebooklmSessionId = (label = "s") =>
  `kp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${label}`;

const defaultRetryQuestions = [
  "Summarize one actionable US equity risk-on vs risk-off signal for this week with numeric trigger.",
  "Give one volatility guard rule (entry block + size reduction) with exact thresholds.",
  "Provide one OHLCV validation rule to reduce false-positive long entries with numeric cutoff."
];

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

  async stop({ gracefulMs = 3000, forceMs = 2000 } = {}) {
    if (!this.proc) return;
    const proc = this.proc;
    this.proc = null;

    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const onExit = () => done();
      const onError = () => done();
      proc.once("exit", onExit);
      proc.once("error", onError);

      try {
        proc.kill("SIGTERM");
      } catch {
        done();
        return;
      }

      setTimeout(() => {
        if (proc.exitCode == null) {
          try {
            proc.kill("SIGKILL");
          } catch {
            // ignore
          }
        }
        setTimeout(done, forceMs);
      }, gracefulMs);
    });
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
  "Summarize the next 2-6 week earnings/fundamental checkpoints that should gate long entries.",
  "List policy/compliance signals that should trigger tighter risk control in automation.",
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
  const rotateQuestions = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_ROTATE_QUESTIONS", true);
  const questionCursorPath = resolvePath(
    env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTION_CURSOR_PATH"),
    QUESTION_CURSOR_PATH
  );
  const maxRuntimeMsRaw = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_RUNTIME_MS", 24 * 60 * 1000);
  const maxRuntimeFloorMs = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_RUNTIME_FLOOR_MS", 300000);
  const maxRuntimeMs = clampMin(maxRuntimeMsRaw, maxRuntimeFloorMs);
  const minQuestionBudgetMs = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MIN_QUESTION_BUDGET_MS", 90 * 1000);
  const rpcTimeoutMsRaw = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_TIMEOUT_MS", 300000);
  const rpcTimeoutFloorMs = numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MCP_TIMEOUT_FLOOR_MS", 300000);
  const rpcTimeoutMs = clampMin(rpcTimeoutMsRaw, rpcTimeoutFloorMs);
  const maxQuestionChars = Math.max(80, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_MAX_QUESTION_CHARS", 220));
  const answerMaxChars = Math.max(1200, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_ANSWER_MAX_CHARS", 4200));
  const allQuestions = parseJsonArrayEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_QUESTIONS", defaultQuestions);
  const questionPlan = selectQuestions({
    allQuestions,
    maxItems,
    rotate: rotateQuestions,
    startCursor: readQuestionCursor(questionCursorPath)
  });
  const questions = questionPlan.selected.map((q) =>
    short(
      String(q || "")
        .replace(/\s+/g, " ")
        .trim(),
      maxQuestionChars
    )
  );
  const showBrowser = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_SHOW_BROWSER", false);
  const browserTimeoutMs = Math.max(
    30000,
    numberFromEnv(
      "KNOWLEDGE_PIPELINE_NOTEBOOKLM_BROWSER_TIMEOUT_MS",
      numberFromEnv("BROWSER_TIMEOUT", 90000)
    )
  );
  const browserHeadless = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BROWSER_HEADLESS", !showBrowser);
  const bootstrapUrls = parseJsonArrayEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_BOOTSTRAP_URLS", []);
  const invalidStreakAlertThreshold = Math.max(
    1,
    numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_INVALID_STREAK_ALERT_THRESHOLD", 2)
  );
  const invalidStreakAlertFail = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_INVALID_STREAK_ALERT_FAIL", false);
  const authHardFail = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_HARD_FAIL", true);
  const authAutoSetup = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_AUTO_SETUP", true);
  const authAutoSetupShowBrowser = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_AUTH_AUTO_SETUP_SHOW_BROWSER", false);
  const retryEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_ENABLED", true);
  const retryTriggerStreak = Math.max(2, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_TRIGGER_STREAK", 2));
  const retrySimpleMaxItems = Math.max(1, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_SIMPLE_MAX_ITEMS", 1));
  const retrySimpleQuestionsRaw = parseJsonArrayEnv(
    "KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_SIMPLE_QUESTIONS",
    defaultRetryQuestions
  );
  const retryAuthShowBrowser = boolFromEnv(
    "KNOWLEDGE_PIPELINE_NOTEBOOKLM_RETRY_AUTH_SHOW_BROWSER",
    authAutoSetupShowBrowser || showBrowser
  );
  const sessionReuseEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_REUSE_SESSION", true);
  const callRetryOnTimeout = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_CALL_RETRY_ON_TIMEOUT", true);
  const callRetryMax = Math.max(0, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_CALL_RETRY_MAX", 1));
  const callRetryBackoffMs = Math.max(250, numberFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_CALL_RETRY_BACKOFF_MS", 1500));
  const healthState = readJsonFile(HEALTH_STATE_PATH, {
    generatedAt: null,
    status: "init",
    reason: "",
    invalidMetaNoItemsStreak: 0,
    noItemsStreak: 0,
    authFailureStreak: 0,
    successStreak: 0
  });

  const report = {
    generatedAt: new Date().toISOString(),
    enabled,
    required,
    status: "skip_disabled",
    reason: "",
    outputPath: path.relative(CWD, outputPath),
    questionCursorPath: path.relative(CWD, questionCursorPath),
    command,
    args,
    rpcTimeoutMs,
    notebook: { requestedId: notebookId || null, requestedUrl: notebookUrl || null, query: notebookQuery || null, selected: null },
    health: { authenticated: null, status: null },
    healthStatePath: path.relative(CWD, HEALTH_STATE_PATH),
    asked: 0,
    collected: 0,
    questionSelection: {
      rotateQuestions,
      totalQuestions: allQuestions.length,
      requestedMaxItems: maxItems,
      selectedCount: questions.length,
      startCursor: questionPlan.startCursor,
      nextCursor: questionPlan.nextCursor,
      selectedIndexes: questionPlan.selectedIndexes
    },
    alert: {
      invalidMetaNoItemsThreshold: invalidStreakAlertThreshold,
      invalidMetaNoItemsStreak: Number(healthState?.invalidMetaNoItemsStreak || 0),
      noItemsStreak: Number(healthState?.noItemsStreak || 0),
      authFailureStreak: Number(healthState?.authFailureStreak || 0),
      successStreak: Number(healthState?.successStreak || 0),
      triggered: false,
      failOnTriggered: invalidStreakAlertFail
    },
    auth: {
      hardFail: authHardFail,
      autoSetup: authAutoSetup,
      autoSetupShowBrowser: authAutoSetupShowBrowser
    },
    retry: {
      enabled: retryEnabled,
      triggerStreak: retryTriggerStreak,
      simpleMaxItems: retrySimpleMaxItems,
      attempted: false,
      attempts: 1,
      triggeredBy: "",
      reason: "",
      collectedOnRetry: 0,
      authShowBrowser: retryAuthShowBrowser
    },
    askQuestion: {
      sessionReuseEnabled,
      callRetryOnTimeout,
      callRetryMax,
      callRetryBackoffMs,
      browserTimeoutMs,
      browserHeadless,
      timeoutRetryAttempts: 0
    },
    runtime: {
      maxRuntimeMs,
      maxRuntimeMsRaw,
      maxRuntimeFloorMs,
      minQuestionBudgetMs,
      budgetStop: false
    }
  };
  report.rpcTimeoutMsRaw = rpcTimeoutMsRaw;
  report.rpcTimeoutFloorMs = rpcTimeoutFloorMs;
  report.maxQuestionChars = maxQuestionChars;
  report.answerMaxChars = answerMaxChars;
  if (rpcTimeoutMsRaw < rpcTimeoutFloorMs) {
    report.runtime.timeoutClamped = true;
    report.runtime.timeoutClampReason = `rpc_timeout_floor_applied(${rpcTimeoutMsRaw}->${rpcTimeoutMs})`;
  }
  if (maxRuntimeMsRaw < maxRuntimeFloorMs) {
    report.runtime.maxRuntimeClamped = true;
    report.runtime.maxRuntimeClampReason = `max_runtime_floor_applied(${maxRuntimeMsRaw}->${maxRuntimeMs})`;
  }

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
  commandEnv.BROWSER_TIMEOUT = String(browserTimeoutMs);

  const client = new JsonLineRpcClient({ command, args, commandEnv, timeoutMs: rpcTimeoutMs });
  const buildBrowserOptions = ({ forceShow } = {}) => {
    const show = typeof forceShow === "boolean" ? forceShow : showBrowser;
    return {
      show,
      headless: show ? false : browserHeadless,
      timeout_ms: browserTimeoutMs
    };
  };
  let hardFailAfterFinally = false;
  try {
    await client.start();
    const refreshHealth = async () => {
      const healthRes = await client.request("tools/call", { name: "get_health", arguments: {} });
      const healthParsed = parseToolTextResult(healthRes);
      report.health.status = healthParsed.parsed?.data?.status ?? null;
      report.health.authenticated = healthParsed.parsed?.data?.authenticated ?? null;
    };
    await refreshHealth();

    // If auth is missing, try one recovery path before failing.
    if (report.health.authenticated === false && authAutoSetup) {
      try {
        await client.request("tools/call", {
          name: "setup_auth",
          arguments: {
            show_browser: authAutoSetupShowBrowser || showBrowser,
            browser_options: buildBrowserOptions({ forceShow: authAutoSetupShowBrowser || showBrowser })
          }
        });
        report.authSetup = {
          status: "attempted",
          showBrowser: authAutoSetupShowBrowser || showBrowser
        };
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

    const predictedAuthFailureStreak = Number(healthState?.authFailureStreak || 0) + 1;
    if (
      report.health.authenticated === false &&
      retryEnabled &&
      authAutoSetup &&
      predictedAuthFailureStreak >= retryTriggerStreak
    ) {
      report.retry.attempted = true;
      report.retry.attempts = 2;
      report.retry.triggeredBy = "auth_failure_streak";
      try {
        await client.request("tools/call", {
          name: "setup_auth",
          arguments: {
            show_browser: retryAuthShowBrowser,
            browser_options: buildBrowserOptions({ forceShow: retryAuthShowBrowser })
          }
        });
        report.authSetupRetry = { status: "attempted", showBrowser: retryAuthShowBrowser };
      } catch (authRetryErr) {
        report.authSetupRetry = { status: "failed", reason: authRetryErr?.message || String(authRetryErr) };
      }
      await refreshHealth();
    }

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
      if (report.retry.triggeredBy === "auth_failure_streak") {
        report.retry.reason = "retry_auth_setup_exhausted";
      }
      console.log(
        `[NOTEBOOKLM_MCP_COLLECT] status=${report.status} notebooks=${notebooks.length} asked=${report.asked} collected=${report.collected} output=${path.relative(CWD, outputPath)}`
      );
      if (rotateQuestions && allQuestions.length > 0) writeQuestionCursor(questionCursorPath, questionPlan.nextCursor);
      if (authHardFail) hardFailAfterFinally = true;
      return;
    }

    const items = [];
    let index = 1;
    const startedAtMs = Date.now();
    const runQuestionBatch = async (batchQuestions) => {
      let failCount = 0;
      let timeoutCount = 0;
      let invalidAnswerCount = 0;
      let noSourceUiBlocked = false;
      let askedCount = 0;
      const collected = [];
      let sessionId = sessionReuseEnabled ? buildNotebooklmSessionId("batch") : "";
      for (const question of batchQuestions) {
        const elapsedMs = Date.now() - startedAtMs;
        const remainingMs = maxRuntimeMs - elapsedMs;
        if (remainingMs < minQuestionBudgetMs) {
          report.runtime.budgetStop = true;
          report.runtime.elapsedMs = elapsedMs;
          report.runtime.remainingMs = remainingMs;
          break;
        }
        const args = {
          question,
          show_browser: showBrowser,
          browser_options: buildBrowserOptions()
        };
        if (sessionReuseEnabled && sessionId) args.session_id = sessionId;
        if (selected?.id) args.notebook_id = selected.id;
        if (selected?.url && !selected?.id) args.notebook_url = selected.url;
        report.asked += 1;
        askedCount += 1;
        let callRes = null;
        let attempt = 0;
        while (attempt <= callRetryMax) {
          attempt += 1;
          try {
            callRes = await client.request("tools/call", { name: "ask_question", arguments: args });
            break;
          } catch (requestError) {
            const reason = String(requestError?.message || requestError);
            const timeoutHit = isAskQuestionTimeoutReason(reason);
            if (timeoutHit) timeoutCount += 1;
            if (timeoutHit && callRetryOnTimeout && attempt <= callRetryMax) {
              report.askQuestion.timeoutRetryAttempts += 1;
              if (sessionReuseEnabled) {
                sessionId = buildNotebooklmSessionId(`retry${attempt}`);
                args.session_id = sessionId;
              }
              await sleep(callRetryBackoffMs * attempt);
              continue;
            }
            failCount += 1;
            callRes = null;
            break;
          }
        }
        if (!callRes) continue;
        const parsed = parseToolTextResult(callRes);
        const ok = parsed.parsed?.success !== false;
        if (!ok) {
          failCount += 1;
          if (isAskQuestionTimeoutReason(parsed.text)) timeoutCount += 1;
          if (isNoSourceUiError(parsed.text)) {
            noSourceUiBlocked = true;
            break;
          }
          continue;
        }
        const answer = stripAssistantMetaSuffix(extractAnswerText(parsed.text, parsed.parsed));
        if (!answer) continue;
        if (isInvalidAssistantMetaAnswer(answer)) {
          invalidAnswerCount += 1;
          continue;
        }
        const category = guessCategory(question, answer);
        collected.push({
          id: `nlm-${Date.now()}-${index}`,
          title: buildItemTitle({ question, answer, category, index }),
          summary: sanitizeNotebookAnswerForStorage(answer, answerMaxChars),
          category,
          priority: index <= 3 ? "P1" : "P2",
          sourceUrl: selected?.url || "",
          sourceRef: `notebooklm_mcp:${selected?.id || "url"}`,
          sourceType: "notebooklm_mcp"
        });
        index += 1;
      }
      return { items: collected, failCount, timeoutCount, invalidAnswerCount, noSourceUiBlocked, askedCount };
    };

    const primaryBatch = await runQuestionBatch(questions);
    items.push(...primaryBatch.items);

    const primaryNoItemsReason = deriveNoItemsReason({
      noSourceUiBlocked: primaryBatch.noSourceUiBlocked,
      authenticated: report.health.authenticated,
      invalidAnswerCount: primaryBatch.invalidAnswerCount,
      asked: Math.max(0, primaryBatch.askedCount),
      failCount: primaryBatch.failCount,
      timeoutCount: primaryBatch.timeoutCount
    });
    const predictedNoItemsStreak = Number(healthState?.noItemsStreak || 0) + 1;
    const timeoutAllPrimary = /ask_question_timeout_for_all_items/i.test(primaryNoItemsReason);

    if (
      retryEnabled &&
      items.length === 0 &&
      !primaryBatch.noSourceUiBlocked &&
      (timeoutAllPrimary || (predictedNoItemsStreak >= retryTriggerStreak && isNoItemsReason("no_items", primaryNoItemsReason))) &&
      !report.runtime.budgetStop
    ) {
      const simpleQuestions = retrySimpleQuestionsRaw
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .slice(0, retrySimpleMaxItems);
      if (simpleQuestions.length > 0) {
        report.retry.attempted = true;
        report.retry.attempts = 2;
        report.retry.triggeredBy = timeoutAllPrimary ? "timeout_all_primary" : "no_items_streak";
        report.retry.reason = primaryNoItemsReason;
        const retryBatch = await runQuestionBatch(simpleQuestions);
        items.push(...retryBatch.items);
        report.retry.collectedOnRetry = retryBatch.items.length;
        if (retryBatch.items.length === 0) {
          const retryReason = deriveNoItemsReason({
            noSourceUiBlocked: retryBatch.noSourceUiBlocked,
            authenticated: report.health.authenticated,
            invalidAnswerCount: retryBatch.invalidAnswerCount,
            asked: Math.max(0, retryBatch.askedCount),
            failCount: retryBatch.failCount,
            timeoutCount: retryBatch.timeoutCount
          });
          report.retry.reason = `retry_exhausted:${retryReason}`;
        } else {
          report.retry.reason = "retry_recovered_simple_questions";
        }
      }
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
    if (items.length > 0 && report.runtime.budgetStop) {
      report.status = "ok_partial";
      report.reason = "runtime_budget_guard";
    } else if (items.length > 0 && report.retry.attempted && report.retry.collectedOnRetry > 0) {
      report.status = "ok_retry";
      report.reason = report.retry.reason || "";
    } else if (items.length > 0) {
      report.reason = "";
    } else {
      report.reason = report.retry.attempted
        ? report.retry.reason || primaryNoItemsReason
        : primaryNoItemsReason;
    }
    report.collected = items.length;
    console.log(
      `[NOTEBOOKLM_MCP_COLLECT] status=${report.status} notebooks=${notebooks.length} asked=${report.asked} collected=${report.collected} output=${path.relative(CWD, outputPath)}`
    );
    if (rotateQuestions && allQuestions.length > 0) writeQuestionCursor(questionCursorPath, questionPlan.nextCursor);
  } catch (error) {
    if (report.status === "skip_no_notebook") {
      console.log(`[NOTEBOOKLM_MCP_COLLECT] status=skip_no_notebook available=${report.notebook.available || 0}`);
    } else {
      report.status = "fail";
      report.reason = error?.message || String(error);
      console.log(`[NOTEBOOKLM_MCP_COLLECT] status=fail reason=${report.reason}`);
    }
    if (required && !["ok", "ok_partial", "ok_retry", "no_items"].includes(report.status)) {
      writeJsonFile(REPORT_PATH, report);
      throw new Error(`NotebookLM MCP collect failed: ${report.reason}`);
    }
  } finally {
    await client.stop();
    const nowIso = new Date().toISOString();
    const invalidNoItems =
      report.status === "no_items" && /invalid_assistant_meta_answer/i.test(String(report.reason || ""));
    const nextHealth = {
      generatedAt: nowIso,
      status: report.status,
      reason: report.reason,
      invalidMetaNoItemsStreak: invalidNoItems
        ? Number(healthState?.invalidMetaNoItemsStreak || 0) + 1
        : 0,
      noItemsStreak:
        report.status === "no_items" ? Number(healthState?.noItemsStreak || 0) + 1 : 0,
      authFailureStreak: isAuthFailureReason(report.reason)
        ? Number(healthState?.authFailureStreak || 0) + 1
        : 0,
      successStreak:
        report.status === "ok" || report.status === "ok_partial" || report.status === "ok_retry"
          ? Number(healthState?.successStreak || 0) + 1
          : 0
    };
    report.alert.invalidMetaNoItemsStreak = nextHealth.invalidMetaNoItemsStreak;
    report.alert.noItemsStreak = nextHealth.noItemsStreak;
    report.alert.authFailureStreak = nextHealth.authFailureStreak;
    report.alert.successStreak = nextHealth.successStreak;
    report.alert.triggered = nextHealth.invalidMetaNoItemsStreak >= invalidStreakAlertThreshold;
    if (report.alert.triggered) {
      console.log(
        `[NOTEBOOKLM_MCP_COLLECT][ALERT] invalid_meta_streak=${nextHealth.invalidMetaNoItemsStreak}/${invalidStreakAlertThreshold}`
      );
      if (invalidStreakAlertFail) {
        hardFailAfterFinally = true;
        report.status = "fail_invalid_meta_streak";
        report.reason = `invalid_meta_streak(${nextHealth.invalidMetaNoItemsStreak}/${invalidStreakAlertThreshold})`;
      }
    }
    if (authHardFail && isAuthFailureReason(report.reason)) {
      hardFailAfterFinally = true;
      report.status = "fail_auth_required";
      report.reason = "not_authenticated_or_notebook_access_denied";
      report.auth.nextAction = "run setup_auth (show_browser=true) on self-hosted runner and retry";
    }
    writeJsonFile(HEALTH_STATE_PATH, nextHealth);
    writeJsonFile(REPORT_PATH, report);
  }
  if (hardFailAfterFinally) {
    if (isAuthFailureReason(report.reason)) {
      throw new Error("NotebookLM MCP auth required: setup_auth(show_browser=true) 후 재실행 필요");
    }
    throw new Error(`NotebookLM MCP invalid-meta streak threshold exceeded (${invalidStreakAlertThreshold})`);
  }
};

main().catch((error) => {
  console.error(`[NOTEBOOKLM_MCP_COLLECT] fatal: ${error?.message || error}`);
  process.exit(1);
});
