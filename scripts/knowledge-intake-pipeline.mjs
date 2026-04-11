import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const NOTION_VERSION = "2022-06-28";
const REPORT_PATH = path.join(CWD, "state", "knowledge-intake-pipeline-report.json");
const QUEUE_JSON_PATH = path.join(CWD, "state", "knowledge-approved-queue.json");
const QUEUE_LAST_GOOD_JSON_PATH = path.join(CWD, "state", "knowledge-approved-queue.last-good.json");
const QUEUE_MD_PATH = path.join(CWD, "state", "knowledge-approved-queue.md");
const OBSIDIAN_QUEUE_MD_PATH = path.join(CWD, "state", "knowledge-approved-queue-obsidian.md");
const NOTEBOOKLM_DEFAULT_JSON_PATH = path.join(CWD, "state", "notebooklm-intake.json");
const NOTEBOOKLM_MCP_COLLECT_REPORT_PATH = path.join(CWD, "state", "notebooklm-mcp-collect-report.json");
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
const hasKorean = (value) => /[가-힣]/.test(String(value || ""));
const slugifyFileName = (value, fallback = "item") => {
  const raw = String(value || "")
    .normalize("NFKC")
    .toLowerCase();
  const normalized = raw
    .replace(/[\/\\:?*"<>|]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[^\p{L}\p{N}\s._-]+/gu, " ")
    .replace(/[._]+/g, "-")
    .replace(/\s+/g, "-")
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
const compactReadableTitle = (value, max = 64) =>
  short(
    String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\b(insight|analysis|summary|response)\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
    max
  );
const summaryOneLiner = (summary) => {
  const text = String(summary || "")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*-\s+/gm, "")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";
  return short(text, 120);
};
const inferSourceHintKo = ({ title, sourceUrl, summary, theme }) => {
  const text = `${title || ""} ${summary || ""} ${sourceUrl || ""}`.toLowerCase();
  if (/(fomc|federalreserve|monetary)/.test(text)) return "연준 통화정책";
  if (/(cpi|inflation|bls)/.test(text)) return "미국 CPI";
  if (/(employment|nfp|jobs|payroll)/.test(text)) return "미국 고용";
  if (/(gdpnow|gdp)/.test(text)) return "GDPNow/성장";
  if (/(fedwatch|interest rates|rate cut|rate hike|cme)/.test(text)) return "금리 확률";
  if (/(vix|volatility|drawdown|hedge|risk)/.test(text)) return "변동성/리스크";
  if (/(earnings|guidance|profit|revenue)/.test(text)) return "실적/펀더멘털";
  if (/(sector|rotation|momentum|trend)/.test(text)) return "섹터/트렌드";
  if (/(policy|regulation|sec|edgar|compliance)/.test(text)) return "정책/컴플라이언스";
  if (String(theme || "").trim()) return themeLabelKo(theme);
  return "";
};
const isSeedPlaceholder = (summary) => {
  const text = String(summary || "").toLowerCase();
  return text.includes("seed source from") || text.includes("replace with notebooklm analysis output");
};
const seedPlaceholderSummary = (sourceUrl) => {
  const lines = [];
  lines.push("## 상태");
  lines.push("NotebookLM 실제 분석 응답이 아직 수집되지 않았습니다.");
  lines.push("");
  lines.push("## 현재 항목 의미");
  lines.push("- 소스 URL만 연결된 시드(placeholder) 노트입니다.");
  if (sourceUrl) lines.push(`- sourceUrl: ${sourceUrl}`);
  lines.push("");
  lines.push("## 다음 조치");
  lines.push("- NotebookLM MCP collect 타임아웃/세션 상태 점검");
  lines.push("- 질문 수를 줄여 재실행 후 실제 답변으로 덮어쓰기");
  return `${lines.join("\n")}`.trim();
};
const NOTEBOOKLM_META_SUFFIX_RE =
  /\n*\s*(?:©\s*\d{4}[^\n]*\n+)?EXTREMELY IMPORTANT:\s*Is that ALL you need to know\?[\s\S]*$/i;
const NOTEBOOKLM_KR_BLOCK_RE = /^\s*시스템에서 답변할 수 없습니다\./;
const stripNotebookLmMetaSuffix = (value) => String(value || "").replace(NOTEBOOKLM_META_SUFFIX_RE, "").trim();
const isInvalidNotebookLmMetaAnswer = (value) => {
  const text = String(value || "").trim();
  if (!text) return true;
  const cleaned = stripNotebookLmMetaSuffix(text);
  if (!cleaned) return true;
  // Guard-only payloads start with this sentence and do not include meaningful analysis.
  return NOTEBOOKLM_KR_BLOCK_RE.test(cleaned) && cleaned.length < 220;
};
const invalidNotebookLmSummary = () => {
  const lines = [];
  lines.push("## 상태");
  lines.push("NotebookLM 응답이 유효하지 않아 본문을 반영하지 않았습니다.");
  lines.push("");
  lines.push("## 감지된 문제");
  lines.push("- 시스템 가드 문구(분석 본문 아님)가 수집되었습니다.");
  lines.push("- 동일 세션 재질문 또는 질문 단순화가 필요합니다.");
  lines.push("");
  lines.push("## 다음 조치");
  lines.push("- 질문 수를 줄이고(`MAX_ITEMS=1~2`) 재실행");
  lines.push("- 장문 질문을 1문장 핵심 질의로 축약");
  lines.push("- 수집 성공 후 본 노트를 최신 응답으로 덮어쓰기");
  return `${lines.join("\n")}`.trim();
};
const isInvalidNotebookSummaryPlaceholder = (value) => {
  const text = String(value || "");
  return (
    /NotebookLM 응답이 유효하지 않아 본문을 반영하지 않았습니다\./.test(text) ||
    /시스템 가드 문구\(분석 본문 아님\)가 수집되었습니다\./.test(text)
  );
};
const sanitizeNotebookSummary = (value) => {
  const raw = stripNotebookLmMetaSuffix(String(value || "").trim());
  if (!raw) return "";
  if (isInvalidNotebookLmMetaAnswer(raw)) return invalidNotebookLmSummary();
  let s = raw
    .replace(/\[Executive Summary\]/gi, "\n## 핵심 요약\n")
    .replace(/\[Strategic Analysis\]/gi, "\n## 전략 해석\n")
    .replace(/\[Technical Validation[^\]]*\]/gi, "\n## 기술 검증\n")
    .replace(/\[Operational Checklist[^\]]*\]/gi, "\n## 운영 체크포인트\n")
    .replace(/more_horiz/gi, " ")
    .replace(/\s+\d+(?:\s+\d+){1,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s.includes("## ")) {
    s = `## 핵심 요약\n${s}`;
  }
  return short(s, 1800);
};
const categoryLabelKo = (value) => {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "시장 인텔";
  if (key.includes("macro")) return "거시";
  if (key.includes("risk")) return "리스크";
  if (key.includes("volatility")) return "변동성";
  if (key.includes("earning")) return "실적";
  if (key.includes("trend")) return "트렌드";
  if (key.includes("policy")) return "정책";
  if (key.includes("chart")) return "차트";
  return "시장 인텔";
};
const unlinkWikiLinksForArchive = (text) =>
  String(text || "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
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
const themeLabelKo = (theme) => {
  const key = String(theme || "");
  const map = {
    "Macro & Rates": "거시-금리",
    "Volatility & Risk": "변동성-리스크",
    "Earnings & Fundamentals": "실적-펀더멘털",
    "Sector & Trend": "섹터-트렌드",
    "Policy & Compliance": "정책-컴플라이언스",
    "General Market Intel": "시장-인텔"
  };
  return map[key] || "시장-인텔";
};
const themeCanonicalFromAny = (value) => {
  const raw = String(value || "").trim();
  const direct = {
    "Macro & Rates": "Macro & Rates",
    "Volatility & Risk": "Volatility & Risk",
    "Earnings & Fundamentals": "Earnings & Fundamentals",
    "Sector & Trend": "Sector & Trend",
    "Policy & Compliance": "Policy & Compliance",
    "General Market Intel": "General Market Intel",
    "거시-금리": "Macro & Rates",
    "변동성-리스크": "Volatility & Risk",
    "실적-펀더멘털": "Earnings & Fundamentals",
    "섹터-트렌드": "Sector & Trend",
    "정책-컴플라이언스": "Policy & Compliance",
    "시장-인텔": "General Market Intel"
  };
  if (direct[raw]) return direct[raw];
  const lower = raw.toLowerCase();
  if (lower.includes("macro") || lower.includes("금리")) return "Macro & Rates";
  if (lower.includes("volatility") || lower.includes("리스크")) return "Volatility & Risk";
  if (lower.includes("earning") || lower.includes("실적")) return "Earnings & Fundamentals";
  if (lower.includes("sector") || lower.includes("trend") || lower.includes("섹터")) return "Sector & Trend";
  if (lower.includes("policy") || lower.includes("compliance") || lower.includes("정책")) return "Policy & Compliance";
  return "General Market Intel";
};
const parseThemeTargets = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const rows = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const canonical = themeCanonicalFromAny(row);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
};
const mergeKeyFromItem = (item, index = 0) => {
  const pageId = String(item?.pageId || "").trim().toLowerCase();
  if (pageId) return `id:${pageId}`;
  const sourceUrl = String(item?.sourceUrl || "").trim().toLowerCase();
  const sourceRef = String(item?.sourceRef || "").trim().toLowerCase();
  const title = slugifyFileName(item?.displayTitle || item?.title || `item-${index + 1}`, `item-${index + 1}`);
  // NotebookLM item URLs are often the same notebook URL for every question.
  // Use title/sourceRef to avoid collapsing all entries into one merge key.
  if (sourceUrl.includes("notebooklm.google.com/notebook/")) return `nlm:${sourceRef || "na"}:${title}`;
  if (sourceUrl) return `url:${sourceUrl}`;
  if (sourceRef) return `ref:${sourceRef}:${title}`;
  return `title:${title}`;
};
const scoreQueueItem = (item, index) => {
  const priority = String(item?.priority || "").toUpperCase();
  const p = priority === "P1" ? 30 : priority === "P2" ? 20 : priority === "P3" ? 10 : 0;
  const s = Math.min(30, Math.floor(String(item?.summary || "").length / 90));
  const u = item?.sourceUrl ? 15 : 0;
  return p + s + u + Math.max(0, 50 - index);
};
const selectWithThemeQuota = ({ items, runLimit, enabled, minQuota, targets }) => {
  if (!Array.isArray(items) || items.length === 0) return [];
  const cap = Math.max(1, Number(runLimit) || items.length);
  const annotated = items.map((item, index) => ({
    ...item,
    _idx: index,
    _themeCanonical: themeCanonicalFromAny(item?.themeCanonical || inferTheme(item)),
    _score: scoreQueueItem(item, index)
  }));
  if (!enabled) {
    return annotated
      .sort((a, b) => b._score - a._score || a._idx - b._idx)
      .slice(0, cap)
      .map(({ _idx, _themeCanonical, _score, ...row }) => ({ ...row, themeCanonical: _themeCanonical }));
  }
  const selected = [];
  const selectedIdx = new Set();
  const quota = Math.max(1, Number(minQuota) || 1);
  const targetRows = (Array.isArray(targets) && targets.length > 0 ? targets : [
    "Macro & Rates",
    "Volatility & Risk",
    "Sector & Trend",
    "Earnings & Fundamentals",
    "Policy & Compliance"
  ]).map((x) => themeCanonicalFromAny(x));
  for (const theme of targetRows) {
    if (selected.length >= cap) break;
    const pool = annotated
      .filter((row) => !selectedIdx.has(row._idx) && row._themeCanonical === theme)
      .sort((a, b) => b._score - a._score || a._idx - b._idx);
    for (let k = 0; k < Math.min(quota, pool.length); k += 1) {
      if (selected.length >= cap) break;
      selected.push(pool[k]);
      selectedIdx.add(pool[k]._idx);
    }
  }
  const rest = annotated
    .filter((row) => !selectedIdx.has(row._idx))
    .sort((a, b) => b._score - a._score || a._idx - b._idx);
  for (const row of rest) {
    if (selected.length >= cap) break;
    selected.push(row);
    selectedIdx.add(row._idx);
  }
  return selected.map(({ _idx, _themeCanonical, _score, ...row }) => ({ ...row, themeCanonical: _themeCanonical }));
};
const localizedDisplayTitle = ({ displayTitle, theme, index, preferKorean }) => {
  const normalized = short(String(displayTitle || "").replace(/\s+/g, " "), 120).trim();
  if (!preferKorean) return normalized || `NotebookLM Insight ${index}`;
  if (hasKorean(normalized)) return normalized;
  if (normalized && !looksMachineTitle(normalized) && !looksLikeUrl(normalized)) return compactReadableTitle(normalized, 72);
  return `${themeLabelKo(theme)} 인사이트 ${String(index).padStart(2, "0")}`;
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

const markdownQueue = ({ generatedAt, apply, pendingStatus, approvedStatus, reflectStatus, items, fallbackInfo = null }) => {
  const lines = [];
  lines.push(`# Knowledge Approved Queue`);
  lines.push("");
  lines.push(`- generatedAt: \`${generatedAt}\``);
  lines.push(`- apply: \`${apply}\``);
  lines.push(`- status flow: \`${pendingStatus} -> ${approvedStatus} -> ${reflectStatus}\``);
  lines.push(`- approved count: \`${items.length}\``);
  if (fallbackInfo?.applied) {
    lines.push(`- fallback: \`last_good\` (\`${fallbackInfo.count || 0}\`)`);
    if (fallbackInfo?.reason) lines.push(`- fallback reason: \`${fallbackInfo.reason}\``);
  }
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

const markdownObsidianQueue = ({ generatedAt, sourcePath, statusFlow, items, fallbackInfo = null }) => {
  const lines = [];
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`sourceQueue: "${sourcePath}"`);
  lines.push(`statusFlow: "${statusFlow}"`);
  lines.push(`fallbackApplied: "${fallbackInfo?.applied ? "true" : "false"}"`);
  if (fallbackInfo?.applied) {
    lines.push(`fallbackSource: "last_good"`);
    lines.push(`fallbackCount: ${Math.max(0, Number(fallbackInfo?.count || 0))}`);
    if (fallbackInfo?.reason) lines.push(`fallbackReason: "${String(fallbackInfo.reason).replace(/"/g, '\\"')}"`);
  }
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
  const oneLiner = summaryOneLiner(item.summary);
  lines.push("---");
  lines.push(`generatedAt: "${generatedAt}"`);
  lines.push(`title: "${String(item.displayTitle || item.title || "").replace(/"/g, '\\"')}"`);
  lines.push(`sourceType: "${item.sourceType || "N/A"}"`);
  lines.push(`itemId: "${item.pageId}"`);
  lines.push(`priority: "${item.priority || "N/A"}"`);
  lines.push(`category: "${item.category || "N/A"}"`);
  lines.push(`theme: "${item.theme || "General Market Intel"}"`);
  if (item.sourceUrl) lines.push(`sourceUrl: "${String(item.sourceUrl).replace(/"/g, '\\"')}"`);
  if (item.sourceRef) lines.push(`sourceRef: "${String(item.sourceRef).replace(/"/g, '\\"')}"`);
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
  if (oneLiner) lines.push(`> ${oneLiner}`);
  if (oneLiner) lines.push("");
  lines.push("## 핵심 내용");
  lines.push(item.summary || "N/A");
  lines.push("");
  lines.push("## 근거 소스");
  if (item.sourceUrl) lines.push(`- sourceUrl: ${item.sourceUrl}`);
  else lines.push("- sourceUrl: N/A");
  if (item.sourceRef) lines.push(`- sourceRef: ${item.sourceRef}`);
  lines.push("");
  lines.push("## 연관 노트");
  lines.push(`- [[${themeHubLink}]]`);
  lines.push(`- 클러스터: ${item.theme || "General Market Intel"}`);
  if (keywords.length > 0) lines.push(`- keywords: ${keywords.join(", ")}`);
  if (relatedLinks.length > 0) lines.push(`- related: ${relatedLinks.map((x) => `[[${x}]]`).join(", ")}`);
  lines.push("");
  lines.push("## 실행 메모");
  lines.push(`- category: ${item.category || "N/A"}`);
  lines.push(`- priority: ${item.priority || "N/A"}`);
  lines.push(`- graphHub: ${hubLink}`);
  lines.push(`- pack: ${packLink}`);
  lines.push(`- playbook: ${playbookLink}`);
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
  lines.push(`# 테마 허브 - ${theme}`);
  lines.push("");
  lines.push("## 요약");
  lines.push(`- 노트 수: ${items.length}`);
  lines.push(`- 중심 키워드: ${topKeywords.slice(0, 4).join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## 연결");
  lines.push(`- [[${hubLink}]]`);
  lines.push(`- pack: ${packLink}`);
  lines.push(`- playbook: ${playbookLink}`);
  lines.push("");
  lines.push("## 인사이트 노트");
  for (const item of items) lines.push(`- [[${item.noteName}]] · ${item.displayTitle || item.title}`);
  lines.push("");
  lines.push("## 키워드 렌즈");
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
  lines.push("# NotebookLM 인테이크 그래프 허브");
  lines.push("");
  lines.push("## Core Docs");
  lines.push(`- pack: ${packLink}`);
  lines.push(`- playbook: ${playbookLink}`);
  lines.push("");
  lines.push("## 테마 클러스터");
  if (items.length === 0) {
    lines.push("- (none)");
  } else {
    for (const [theme, rows] of themeMap.entries()) {
      const keywords = new Map();
      for (const row of rows) for (const keyword of row.keywords || []) keywords.set(keyword, (keywords.get(keyword) || 0) + 1);
      const top = [...keywords.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([w]) => w)
        .join(", ");
      lines.push(`- [[${rows[0]?.themeHubName || theme}]] · ${rows.length}개 노트 · 키워드: ${top || "(none)"}`);
    }
    lines.push("");
    lines.push("## 테마 상관관계");
    const themes = [...themeMap.entries()];
    let relationCount = 0;
    for (let i = 0; i < themes.length; i += 1) {
      for (let j = i + 1; j < themes.length; j += 1) {
        const [themeA, rowsA] = themes[i];
        const [themeB, rowsB] = themes[j];
        const setA = new Set(rowsA.flatMap((x) => x.keywords || []));
        const setB = new Set(rowsB.flatMap((x) => x.keywords || []));
        const overlap = [...setA].filter((x) => setB.has(x)).slice(0, 4);
        if (overlap.length === 0) continue;
        relationCount += 1;
        lines.push(
          `- [[${rowsA[0]?.themeHubName || themeA}]] ↔ [[${rowsB[0]?.themeHubName || themeB}]] · 공통 키워드: ${overlap.join(", ")}`
        );
      }
    }
    if (relationCount === 0) lines.push("- (공통 키워드 기반 연결 없음)");
    lines.push("");
    lines.push("## 노트 인덱스(텍스트)");
    for (const [theme, rows] of themeMap.entries()) {
      lines.push(`### ${theme}`);
      for (const item of rows) lines.push(`- ${item.displayTitle || item.title} (${item.noteName})`);
      lines.push("");
    }
  }
  lines.push("## Note Legend");
  lines.push("- `NotebookLM_US_Stock_Research_Pack...`: source batch used to collect references.");
  lines.push("- `Market_Intel_AutoTrading_Uplift_Playbook...`: candidate response actions and rollout ideas.");
  lines.push("- `테마 허브`: 주제별 탐색 시작점.");
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

const obsidianRawRequest = async ({ baseUrl, apiKey, method = "GET", route = "/", body = null, contentType = "application/json" }) => {
  const url = `${baseUrl.replace(/\/+$/, "")}${route}`;
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (contentType) headers["Content-Type"] = contentType;
  const response = await fetch(url, {
    method,
    headers,
    body: body == null ? undefined : body
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, text };
};

const obsidianRequest = async ({ baseUrl, apiKey, method = "GET", route = "/", body = null, contentType = "application/json" }) => {
  const { status, ok, text } = await obsidianRawRequest({ baseUrl, apiKey, method, route, body, contentType });
  if (!ok) {
    throw new Error(`Obsidian ${route} failed (${status}): ${short(text, 400)}`);
  }
  return text;
};

const obsidianDeleteIfExists = async ({ baseUrl, apiKey, route }) => {
  const { status, ok, text } = await obsidianRawRequest({
    baseUrl,
    apiKey,
    method: "DELETE",
    route,
    contentType: null
  });
  if (ok || status === 404) return { deleted: status !== 404, status };
  throw new Error(`Obsidian ${route} failed (${status}): ${short(text, 400)}`);
};

const obsidianReadIfExists = async ({ baseUrl, apiKey, route, contentType = null }) => {
  const { status, ok, text } = await obsidianRawRequest({
    baseUrl,
    apiKey,
    method: "GET",
    route,
    contentType
  });
  if (ok) return { exists: true, text };
  if (status === 404) return { exists: false, text: "" };
  throw new Error(`Obsidian ${route} failed (${status}): ${short(text, 400)}`);
};

const parseJsonOrNull = (value) => {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
};

const archivePathFor = (archiveDir, stalePath, generatedAt) => {
  const stamp = String(generatedAt || "").slice(0, 10).replace(/-/g, "") || "unknown";
  const stem = path.basename(stalePath, path.extname(stalePath));
  return `${archiveDir.replace(/\/+$/, "")}/${stem}__archived_${stamp}.md`;
};

const legacyPathFromOldPattern = (itemDir, item, index) => {
  const displayTitle = short(String(item?.title || "").replace(/\s+/g, " "), 120).trim() || `NotebookLM Insight ${index}`;
  const compactId = slugifyFileName(item?.pageId, `i${index}`).slice(0, 10) || `i${index}`;
  const base = `${String(index).padStart(2, "0")}-${slugifyFileName(displayTitle, `item-${index}`).slice(0, 42)}-${compactId}`;
  return `${itemDir.replace(/\/+$/, "")}/${base}.md`;
};

const parseManifest = (text) => {
  const parsed = parseJsonOrNull(text);
  if (!parsed || !Array.isArray(parsed?.items)) return [];
  return parsed.items
    .map((row) => {
      const pathValue = String(row?.path || "").trim();
      if (!pathValue) return null;
      const keywords = Array.isArray(row?.keywords)
        ? row.keywords.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      return {
        path: pathValue,
        mergeKey: String(row?.mergeKey || "").trim(),
        pageId: String(row?.pageId || "").trim(),
        title: String(row?.title || "").trim(),
        displayTitle: String(row?.displayTitle || "").trim(),
        summary: sanitizeNotebookSummary(String(row?.summary || "").trim()),
        sourceType: String(row?.sourceType || "").trim(),
        sourceUrl: String(row?.sourceUrl || "").trim(),
        sourceRef: String(row?.sourceRef || "").trim(),
        category: String(row?.category || "").trim(),
        priority: String(row?.priority || "").trim(),
        themeCanonical: themeCanonicalFromAny(String(row?.themeCanonical || row?.theme || "").trim()),
        theme: String(row?.theme || "").trim(),
        keywords,
        generatedAt: String(row?.generatedAt || "").trim(),
        updatedAt: String(row?.updatedAt || row?.generatedAt || "").trim()
      };
    })
    .filter(Boolean);
};

const parseQueueSnapshot = (jsonPath) => {
  if (!fs.existsSync(jsonPath)) return { status: "skip_missing_file", reason: `missing ${path.relative(CWD, jsonPath)}`, items: [] };
  const raw = fs.readFileSync(jsonPath, "utf8").trim();
  if (!raw) return { status: "skip_empty_file", reason: `empty ${path.relative(CWD, jsonPath)}`, items: [] };
  const parsed = parseJsonOrNull(raw);
  if (!parsed) return { status: "fail_parse", reason: `invalid json ${path.relative(CWD, jsonPath)}`, items: [] };
  const list = Array.isArray(parsed?.queueItems) ? parsed.queueItems : [];
  const items = list
    .map((row, index) => {
      const rawTitle = String(row?.title || row?.topic || row?.headline || "").trim();
      const summaryRaw = String(row?.summary || row?.insight || row?.notes || "").trim();
      const sourceUrl = String(row?.sourceUrl || row?.url || row?.source || "").trim();
      const title = readableHeadline(rawTitle, sourceUrl, `Queue Item ${index + 1}`);
      const summary = sanitizeNotebookSummary(summaryRaw);
      if (!title || !summary || isInvalidNotebookSummaryPlaceholder(summary)) return null;
      return {
        pageId: safeId(row?.pageId, `fallback-${index + 1}`),
        title,
        status: String(row?.status || "승인").trim() || "승인",
        category: String(row?.category || "시장 인텔").trim() || "시장 인텔",
        priority: String(row?.priority || "P2").trim() || "P2",
        summary,
        sourceUrl,
        sourceRef: String(row?.sourceRef || "").trim(),
        sourceType: String(row?.sourceType || "notebooklm_json").trim() || "notebooklm_json"
      };
    })
    .filter(Boolean);
  return { status: "ok", reason: "", items };
};

const buildManifest = ({ generatedAt, sourceMode, itemDir, items }) => ({
  generatedAt,
  sourceMode,
  itemDir,
  count: items.length,
  items: items.map((item) => ({
    path: item.notePath,
    mergeKey: item.mergeKey || mergeKeyFromItem(item),
    pageId: item.pageId || "",
    title: item.title || "",
    displayTitle: item.displayTitle || "",
    summary: item.summary || "",
    sourceType: item.sourceType || "",
    sourceUrl: item.sourceUrl || "",
    sourceRef: item.sourceRef || "",
    category: item.category || "",
    priority: item.priority || "",
    themeCanonical: item.themeCanonical || themeCanonicalFromAny(item.theme || ""),
    theme: item.theme || "",
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    generatedAt: item.generatedAt || generatedAt,
    updatedAt: item.updatedAt || generatedAt
  }))
});

const obsidianManifestRoute = (manifestPath) => `/vault/${encodeVaultPath(manifestPath)}`;

const cleanupObsidianStalePaths = async ({
  baseUrl,
  apiKey,
  stalePaths,
  archiveEnabled,
  archiveDir,
  generatedAt
}) => {
  let archived = 0;
  let deleted = 0;
  for (const stalePath of stalePaths) {
    const staleRoute = `/vault/${encodeVaultPath(stalePath)}`;
    if (archiveEnabled) {
      const read = await obsidianReadIfExists({ baseUrl, apiKey, route: staleRoute, contentType: null });
      if (read.exists) {
        const archivedPath = archivePathFor(archiveDir, stalePath, generatedAt);
        const archivedRoute = `/vault/${encodeVaultPath(archivedPath)}`;
        const archivedBody = unlinkWikiLinksForArchive(read.text);
        await obsidianRequest({
          baseUrl,
          apiKey,
          method: "PUT",
          route: archivedRoute,
          body: archivedBody,
          contentType: "text/markdown"
        });
        archived += 1;
      }
    }
    const removed = await obsidianDeleteIfExists({ baseUrl, apiKey, route: staleRoute });
    if (removed.deleted) deleted += 1;
  }
  return { archived, deleted };
};

const cleanupObsidianLegacyPaths = async ({ baseUrl, apiKey, legacyPaths }) => {
  let deleted = 0;
  for (const legacyPath of legacyPaths) {
    const route = `/vault/${encodeVaultPath(legacyPath)}`;
    const removed = await obsidianDeleteIfExists({ baseUrl, apiKey, route });
    if (removed.deleted) deleted += 1;
  }
  return { deleted };
};

const parseArchiveStampFromName = (fileName) => {
  const match = String(fileName || "").match(/__archived_(\d{4})(\d{2})(\d{2})\.md$/i);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, Math.max(0, month - 1), day));
};

const cleanupObsidianArchiveRetention = async ({
  baseUrl,
  apiKey,
  archiveDir,
  retentionDays,
  maxDelete,
  generatedAt
}) => {
  const stats = {
    scanned: 0,
    eligible: 0,
    deleted: 0,
    skippedNoStamp: 0,
    capped: false,
    missing: false
  };
  const archiveBase = archiveDir.replace(/\/+$/, "");
  const listRoute = `/vault/${encodeVaultPath(`${archiveBase}/`)}`;
  const listing = await obsidianRawRequest({
    baseUrl,
    apiKey,
    method: "GET",
    route: listRoute,
    contentType: "application/json"
  });
  if (listing.status === 404) {
    stats.missing = true;
    return stats;
  }
  if (!listing.ok) {
    throw new Error(`Obsidian ${listRoute} failed (${listing.status}): ${short(listing.text, 400)}`);
  }
  const parsed = parseJsonOrNull(listing.text);
  const files = Array.isArray(parsed?.files) ? parsed.files.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const nowMs = new Date(String(generatedAt || new Date().toISOString())).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const fileName of files) {
    stats.scanned += 1;
    const stamp = parseArchiveStampFromName(fileName);
    if (!stamp) {
      stats.skippedNoStamp += 1;
      continue;
    }
    const ageDays = Math.floor((nowMs - stamp.getTime()) / dayMs);
    if (!Number.isFinite(ageDays) || ageDays <= retentionDays) continue;
    stats.eligible += 1;
    if (stats.deleted >= maxDelete) {
      stats.capped = true;
      continue;
    }
    const route = `/vault/${encodeVaultPath(`${archiveBase}/${fileName}`)}`;
    const removed = await obsidianDeleteIfExists({ baseUrl, apiKey, route });
    if (removed.deleted) stats.deleted += 1;
  }
  return stats;
};

const encodeVaultPath = (filePath) => filePath.split("/").map((part) => encodeURIComponent(part)).join("/");

const parseNotebooklmQueue = (jsonPath, fallbackCategory, fallbackPriority, limit, options = {}) => {
  const dropInvalidItems = options?.dropInvalidItems !== false;
  const collectReportPath = options?.collectReportPath || NOTEBOOKLM_MCP_COLLECT_REPORT_PATH;
  if (!fs.existsSync(jsonPath)) {
    return {
      status: "skip_missing_file",
      reason: `missing ${path.relative(CWD, jsonPath)}`,
      items: [],
      invalidItemsDropped: 0,
      totalRows: 0,
      dropInvalidItems
    };
  }
  const raw = fs.readFileSync(jsonPath, "utf8").trim();
  if (!raw) {
    return {
      status: "skip_empty_file",
      reason: `empty ${path.relative(CWD, jsonPath)}`,
      items: [],
      invalidItemsDropped: 0,
      totalRows: 0,
      dropInvalidItems
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      status: "fail_parse",
      reason: `invalid json ${path.relative(CWD, jsonPath)}: ${error?.message || error}`,
      items: [],
      invalidItemsDropped: 0,
      totalRows: 0,
      dropInvalidItems
    };
  }
  const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
  const rows = list.slice(0, Math.max(1, limit));
  if (rows.length === 0) {
    let status = "no_items";
    let reason = "items_empty";
    if (fs.existsSync(collectReportPath)) {
      try {
        const collectRaw = fs.readFileSync(collectReportPath, "utf8").trim();
        const collectParsed = collectRaw ? JSON.parse(collectRaw) : {};
        const collectStatus = String(collectParsed?.status || "").trim();
        const collectReason = String(collectParsed?.reason || "").trim();
        if (collectStatus) status = collectStatus === "ok" ? "no_items" : collectStatus;
        if (collectReason) reason = `${reason}:${collectReason}`;
      } catch {
        // keep default no_items reason when report parse fails
      }
    }
    return {
      status,
      reason,
      items: [],
      invalidItemsDropped: 0,
      totalRows: 0,
      dropInvalidItems
    };
  }
  let invalidItemsDropped = 0;
  const items = rows
    .map((row, index) => {
      const rawTitle = String(row?.title || row?.topic || row?.headline || "").trim();
      const summaryRaw = String(row?.summary || row?.insight || row?.notes || "").trim();
      if (dropInvalidItems && isInvalidNotebookLmMetaAnswer(summaryRaw)) {
        invalidItemsDropped += 1;
        return null;
      }
      const sourceUrl = String(row?.sourceUrl || row?.url || row?.source || "").trim();
      const summarySanitized = sanitizeNotebookSummary(summaryRaw);
      if (dropInvalidItems && isInvalidNotebookSummaryPlaceholder(summarySanitized)) {
        invalidItemsDropped += 1;
        return null;
      }
      const summary = isSeedPlaceholder(summaryRaw) ? seedPlaceholderSummary(sourceUrl) : summarySanitized;
      const category = String(row?.category || row?.area || fallbackCategory || "").trim();
      const priority = String(row?.priority || fallbackPriority || "").trim();
      const sourceRef = String(row?.sourceRef || row?.notebook || row?.notebookId || "").trim();
      const idBase = safeId(row?.id, `notebooklm-${index + 1}`);
      const title = readableHeadline(rawTitle, sourceUrl, `NotebookLM Item ${index + 1}`);
      return {
        pageId: idBase,
        title,
        status: "승인",
        category: categoryLabelKo(category || "NotebookLM"),
        priority: priority || "P2",
        summary,
        sourceUrl,
        sourceRef,
        sourceType: "notebooklm_json"
      };
    })
    .filter(Boolean);
  let status = "ok";
  let reason = "";
  if (items.length === 0 && rows.length > 0 && invalidItemsDropped > 0) {
    status = "ok_filtered_empty";
    reason = `invalid_items_filtered:${invalidItemsDropped}/${rows.length}`;
  }
  return {
    status,
    reason,
    items,
    invalidItemsDropped,
    totalRows: rows.length,
    dropInvalidItems
  };
};

const main = async () => {
  const sourceModeRaw = env("KNOWLEDGE_PIPELINE_SOURCE_MODE", "notion").toLowerCase();
  const sourceMode = ["notion", "notebooklm_json", "hybrid"].includes(sourceModeRaw) ? sourceModeRaw : "notion";
  const notebooklmJsonPath = resolvePath(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_JSON_PATH"), NOTEBOOKLM_DEFAULT_JSON_PATH);
  const notebooklmRequired = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_REQUIRED", false);
  const queueKeepLastGoodOnEmpty = boolFromEnv("KNOWLEDGE_PIPELINE_QUEUE_KEEP_LAST_GOOD_ON_EMPTY", true);

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
  const obsidianGraphManifestPath = env(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_MANIFEST_PATH",
    "99_Automation/NotebookLM/Intake/_meta/generated-manifest.json"
  );
  const obsidianGraphKoreanTitle = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_KOREAN_TITLE", true);
  const obsidianGraphLegacyCleanup = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_LEGACY_CLEANUP", true);
  const obsidianGraphStaleCleanup = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_STALE_CLEANUP", true);
  const obsidianGraphArchiveEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_ENABLED", true);
  const obsidianGraphAccumulateEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ACCUMULATE_ENABLED", true);
  const obsidianGraphAccumulateMax = Number.parseInt(
    env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ACCUMULATE_MAX", "200"),
    10
  ) || 200;
  const obsidianGraphThemeQuotaEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_QUOTA_ENABLED", true);
  const obsidianGraphThemeQuotaMin = Number.parseInt(env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_QUOTA_MIN", "1"), 10) || 1;
  const obsidianGraphRunLimit = Number.parseInt(
    env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_RUN_LIMIT", String(Math.max(1, limit))),
    10
  ) || Math.max(1, limit);
  const obsidianGraphThemeTargets = parseThemeTargets(
    env(
      "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_TARGETS",
      "Macro & Rates,Volatility & Risk,Sector & Trend,Earnings & Fundamentals,Policy & Compliance"
    )
  );
  const obsidianGraphArchiveDir = env(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_DIR",
    "99_Automation/NotebookLM/Archive"
  );
  const obsidianGraphArchiveRetentionEnabled = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_ENABLED",
    true
  );
  const obsidianGraphArchiveRetentionDays = Number.parseInt(
    env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_DAYS", "90"),
    10
  ) || 90;
  const obsidianGraphArchiveRetentionMaxDelete = Number.parseInt(
    env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_ARCHIVE_RETENTION_MAX_DELETE", "200"),
    10
  ) || 200;
  const obsidianGraphDropInvalid = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_DROP_INVALID", true);
  const notebooklmDropInvalidItems = boolFromEnv("KNOWLEDGE_PIPELINE_NOTEBOOKLM_DROP_INVALID_ITEMS", true);

  const report = {
    generatedAt: new Date().toISOString(),
    status: "init",
    apply,
    required,
    source: {
      mode: sourceMode,
      notebooklmJsonPath: path.relative(CWD, notebooklmJsonPath),
      notebooklmRequired,
      notebooklmStatus: "skip",
      notebooklmReason: "",
      notebooklmLoaded: 0,
      notebooklmDropInvalidItems,
      notebooklmInvalidDropped: 0
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
      lastGoodPath: path.relative(CWD, QUEUE_LAST_GOOD_JSON_PATH),
      pathMd: path.relative(CWD, QUEUE_MD_PATH),
      count: 0,
      sourceCount: 0,
      keepLastGoodOnEmpty: queueKeepLastGoodOnEmpty,
      fallbackApplied: false,
      fallbackSource: "none",
      fallbackReason: "",
      fallbackCount: 0,
      lastGoodStatus: "skip",
      lastGoodReason: "",
      lastGoodCount: 0,
      lastGoodUpdated: false
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
      graphUploadedHub: false,
      graphManifestPath: obsidianGraphManifestPath,
      graphKoreanTitleEnabled: obsidianGraphKoreanTitle,
      graphLegacyCleanupEnabled: obsidianGraphLegacyCleanup,
      graphStaleCleanupEnabled: obsidianGraphStaleCleanup,
      graphArchiveEnabled: obsidianGraphArchiveEnabled,
      graphAccumulateEnabled: obsidianGraphAccumulateEnabled,
      graphAccumulateMax: obsidianGraphAccumulateMax,
      graphArchiveRetentionEnabled: obsidianGraphArchiveRetentionEnabled,
      graphArchiveRetentionDays: obsidianGraphArchiveRetentionDays,
      graphArchiveRetentionMaxDelete: obsidianGraphArchiveRetentionMaxDelete,
      graphThemeQuotaEnabled: obsidianGraphThemeQuotaEnabled,
      graphThemeQuotaMin: obsidianGraphThemeQuotaMin,
      graphRunLimit: obsidianGraphRunLimit,
      graphThemeTargets: obsidianGraphThemeTargets,
      graphArchiveDir: obsidianGraphArchiveDir,
      graphDropInvalidEnabled: obsidianGraphDropInvalid,
      graphLegacyDeleted: 0,
      graphStaleArchived: 0,
      graphStaleDeleted: 0,
      graphArchiveRetentionScanned: 0,
      graphArchiveRetentionEligible: 0,
      graphArchiveRetentionDeleted: 0,
      graphArchiveRetentionSkippedNoStamp: 0,
      graphArchiveRetentionCapped: false,
      graphArchiveRetentionMissing: false,
      graphInvalidDroppedFromAccumulated: 0,
      graphManifestWritten: false
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
    const notebooklm = parseNotebooklmQueue(notebooklmJsonPath, categoryFilter, "P2", limit, {
      dropInvalidItems: notebooklmDropInvalidItems,
      collectReportPath: NOTEBOOKLM_MCP_COLLECT_REPORT_PATH
    });
    report.source.notebooklmStatus = notebooklm.status;
    report.source.notebooklmReason = notebooklm.reason;
    report.source.notebooklmInvalidDropped = notebooklm.invalidItemsDropped || 0;
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
  const sourceQueueCount = queueItems.length;
  report.queue.sourceCount = sourceQueueCount;

  const lastGoodQueue = parseQueueSnapshot(QUEUE_LAST_GOOD_JSON_PATH);
  report.queue.lastGoodStatus = lastGoodQueue.status;
  report.queue.lastGoodReason = lastGoodQueue.reason;
  report.queue.lastGoodCount = lastGoodQueue.items.length;

  if (queueKeepLastGoodOnEmpty && sourceQueueCount === 0 && lastGoodQueue.items.length > 0) {
    queueItems = lastGoodQueue.items;
    report.queue.fallbackApplied = true;
    report.queue.fallbackSource = "last_good";
    report.queue.fallbackReason =
      sourceMode === "notebooklm_json"
        ? `source_empty:${report.source.notebooklmStatus}${report.source.notebooklmReason ? `:${report.source.notebooklmReason}` : ""}`
        : "source_empty";
    report.queue.fallbackCount = queueItems.length;
  }
  report.queue.count = queueItems.length;

  fs.mkdirSync(path.dirname(OBSIDIAN_QUEUE_MD_PATH), { recursive: true });
  fs.writeFileSync(
    OBSIDIAN_QUEUE_MD_PATH,
    markdownObsidianQueue({
      generatedAt: report.generatedAt,
      sourcePath: report.queue.pathMd,
      statusFlow: `${pendingStatus} -> ${approvedStatus} -> ${reflectStatus}`,
      items: queueItems,
      fallbackInfo: {
        applied: report.queue.fallbackApplied,
        count: report.queue.fallbackCount,
        reason: report.queue.fallbackReason
      }
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
      items: queueItems,
      fallbackInfo: {
        applied: report.queue.fallbackApplied,
        count: report.queue.fallbackCount,
        reason: report.queue.fallbackReason
      }
    }),
    "utf8"
  );
  fs.writeFileSync(QUEUE_JSON_PATH, `${JSON.stringify({ generatedAt: report.generatedAt, sourceMode, queueItems }, null, 2)}\n`, "utf8");
  if (sourceQueueCount > 0) {
    fs.writeFileSync(
      QUEUE_LAST_GOOD_JSON_PATH,
      `${JSON.stringify({ generatedAt: report.generatedAt, sourceMode, queueItems }, null, 2)}\n`,
      "utf8"
    );
    report.queue.lastGoodUpdated = true;
  }

  if (!obsidianApply) {
    report.obsidian.status = "skip_disabled";
    report.obsidian.reason = "KNOWLEDGE_PIPELINE_OBSIDIAN_APPLY=false";
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
        const manifestRoute = obsidianManifestRoute(obsidianGraphManifestPath);
        const previousManifest = await obsidianReadIfExists({
          baseUrl: obsidianBaseUrl,
          apiKey: obsidianApiKey,
          route: manifestRoute,
          contentType: null
        });
        const previousManifestEntries = previousManifest.exists ? parseManifest(previousManifest.text) : [];
        const previousManifestPaths = previousManifestEntries.map((x) => String(x?.path || "").trim()).filter(Boolean);
        const previousByKey = new Map();
        for (const entry of previousManifestEntries) {
          const key = String(entry?.mergeKey || "").trim() || mergeKeyFromItem(entry);
          if (!key) continue;
          previousByKey.set(key, { ...entry, mergeKey: key });
        }
        const queueSelected = selectWithThemeQuota({
          items: queueItems,
          runLimit: obsidianGraphRunLimit,
          enabled: obsidianGraphThemeQuotaEnabled,
          minQuota: obsidianGraphThemeQuotaMin,
          targets: obsidianGraphThemeTargets
        });
        const preparedCurrent = [];
        const usedNotePaths = new Set(previousManifestPaths);
        const themeHubMap = new Map();
        let index = 1;
        for (const item of queueSelected) {
          const rawTitle = readableHeadline(item.title, item.sourceUrl, `NotebookLM Insight ${index}`);
          const themeCanonical = themeCanonicalFromAny(item?.themeCanonical || inferTheme({ ...item, title: rawTitle }));
          const theme = obsidianGraphKoreanTitle ? themeLabelKo(themeCanonical) : themeCanonical;
          const displayTitle = localizedDisplayTitle({
            displayTitle: rawTitle,
            theme: themeCanonical,
            index,
            preferKorean: obsidianGraphKoreanTitle,
            sourceUrl: item.sourceUrl,
            summary: item.summary
          });
          const hintTitle = inferSourceHintKo({
            title: rawTitle,
            sourceUrl: item.sourceUrl,
            summary: item.summary,
            theme: themeCanonical
          });
          const finalTitle =
            obsidianGraphKoreanTitle && hintTitle && !hasKorean(displayTitle)
              ? `${themeLabelKo(themeCanonical)} · ${hintTitle}`
              : displayTitle;
          const keywords = extractKeywords({ ...item, title: rawTitle });
          const mergeKey = mergeKeyFromItem({ ...item, displayTitle: finalTitle, title: rawTitle }, index);
          const previous = previousByKey.get(mergeKey);
          const themeSlug = slugifyFileName(theme, "general-market-intel");
          let notePath = "";
          if (previous?.path) {
            notePath = previous.path;
          } else {
            const stableTail = slugifyFileName(
              String(item?.pageId || item?.sourceUrl || mergeKey).slice(-32),
              `i${index}`
            ).slice(0, 12);
            const baseStem = `${slugifyFileName(finalTitle, `insight-${index}`).slice(0, 56)}-${stableTail}`;
            notePath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/${themeSlug}/${baseStem}.md`;
            let dupe = 2;
            while (usedNotePaths.has(notePath)) {
              notePath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/${themeSlug}/${baseStem}-${dupe}.md`;
              dupe += 1;
            }
          }
          usedNotePaths.add(notePath);
          const noteName = noteNameFromPath(notePath);
          const themeHubPath = `${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes/theme-${themeSlug}.md`;
          const themeHubName = noteNameFromPath(themeHubPath);
          if (!themeHubMap.has(theme)) themeHubMap.set(theme, { themeHubPath, themeHubName });
          preparedCurrent.push({
            ...item,
            mergeKey,
            generatedAt: report.generatedAt,
            updatedAt: report.generatedAt,
            title: rawTitle,
            displayTitle: finalTitle,
            keywords,
            theme,
            themeCanonical,
            noteName,
            notePath,
            themeHubPath,
            themeHubName
          });
          index += 1;
        }
        let prepared = preparedCurrent;
        if (obsidianGraphAccumulateEnabled) {
          const accumulatedMap = new Map();
          for (const row of previousManifestEntries) {
            const baseKey = String(row?.mergeKey || "").trim() || mergeKeyFromItem(row);
            const hasIdentity = Boolean(String(row?.sourceUrl || "").trim() || String(row?.title || "").trim() || String(row?.pageId || "").trim());
            if (!baseKey || !hasIdentity || !row?.path) continue;
            const summarySanitized = sanitizeNotebookSummary(String(row?.summary || "").trim());
            if (obsidianGraphDropInvalid && isInvalidNotebookSummaryPlaceholder(summarySanitized)) {
              report.obsidian.graphInvalidDroppedFromAccumulated += 1;
              continue;
            }
            const canonical = themeCanonicalFromAny(row?.themeCanonical || row?.theme);
            const themeLabel = obsidianGraphKoreanTitle ? themeLabelKo(canonical) : canonical;
            const themeSlug = slugifyFileName(themeLabel, "general-market-intel");
            const notePath = row.path;
            accumulatedMap.set(baseKey, {
              mergeKey: baseKey,
              pageId: row.pageId || "",
              title: row.title || row.displayTitle || noteNameFromPath(notePath),
              displayTitle: row.displayTitle || row.title || noteNameFromPath(notePath),
              status: "승인",
              category: row.category || "시장 인텔",
              priority: row.priority || "P2",
              summary: row.summary || "",
              sourceUrl: row.sourceUrl || "",
              sourceRef: row.sourceRef || "",
              sourceType: row.sourceType || "notebooklm_json",
              keywords: Array.isArray(row.keywords) ? row.keywords : [],
              themeCanonical: canonical,
              theme: themeLabel,
              notePath,
              noteName: noteNameFromPath(notePath),
              themeHubPath: `${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes/theme-${themeSlug}.md`,
              themeHubName: noteNameFromPath(`${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes/theme-${themeSlug}.md`),
              generatedAt: row.generatedAt || report.generatedAt,
              updatedAt: row.updatedAt || row.generatedAt || "1970-01-01T00:00:00.000Z"
            });
          }
          for (const row of preparedCurrent) accumulatedMap.set(row.mergeKey, row);
          prepared = [...accumulatedMap.values()]
            .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
            .slice(0, Math.max(1, obsidianGraphAccumulateMax));
        }
        report.obsidian.graphSelectedThisRun = queueSelected.length;
        report.obsidian.graphAccumulatedTotal = prepared.length;
        const currentNotePathSet = new Set(prepared.map((x) => x.notePath));
        if (obsidianGraphLegacyCleanup) {
          const legacySet = new Set();
          let legacyIndex = 1;
          for (const item of queueSelected) {
            const legacyPath = legacyPathFromOldPattern(obsidianGraphItemDir, item, legacyIndex);
            if (!currentNotePathSet.has(legacyPath)) legacySet.add(legacyPath);
            legacyIndex += 1;
          }
          if (legacySet.size > 0) {
            const legacyResult = await cleanupObsidianLegacyPaths({
              baseUrl: obsidianBaseUrl,
              apiKey: obsidianApiKey,
              legacyPaths: [...legacySet]
            });
            report.obsidian.graphLegacyDeleted = legacyResult.deleted;
          }
        }
        if (obsidianGraphStaleCleanup && previousManifestPaths.length > 0) {
          const stalePaths = previousManifestPaths.filter(
            (x) => !currentNotePathSet.has(x) && x.startsWith(`${obsidianGraphItemDir.replace(/\/+$/, "")}/`)
          );
          if (stalePaths.length > 0) {
            const staleResult = await cleanupObsidianStalePaths({
              baseUrl: obsidianBaseUrl,
              apiKey: obsidianApiKey,
              stalePaths,
              archiveEnabled: obsidianGraphArchiveEnabled,
              archiveDir: obsidianGraphArchiveDir,
              generatedAt: report.generatedAt
            });
            report.obsidian.graphStaleArchived = staleResult.archived;
            report.obsidian.graphStaleDeleted = staleResult.deleted;
          }
        }
        if (obsidianGraphArchiveEnabled && obsidianGraphArchiveRetentionEnabled) {
          const retention = await cleanupObsidianArchiveRetention({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            archiveDir: obsidianGraphArchiveDir,
            retentionDays: Math.max(1, obsidianGraphArchiveRetentionDays),
            maxDelete: Math.max(1, obsidianGraphArchiveRetentionMaxDelete),
            generatedAt: report.generatedAt
          });
          report.obsidian.graphArchiveRetentionScanned = retention.scanned;
          report.obsidian.graphArchiveRetentionEligible = retention.eligible;
          report.obsidian.graphArchiveRetentionDeleted = retention.deleted;
          report.obsidian.graphArchiveRetentionSkippedNoStamp = retention.skippedNoStamp;
          report.obsidian.graphArchiveRetentionCapped = retention.capped;
          report.obsidian.graphArchiveRetentionMissing = retention.missing;
        }
        const preparedByTheme = new Map();
        for (const item of prepared) {
          if (!themeHubMap.has(item.theme)) {
            const canonical = themeCanonicalFromAny(item.themeCanonical || item.theme);
            const label = obsidianGraphKoreanTitle ? themeLabelKo(canonical) : canonical;
            const slug = slugifyFileName(label, "general-market-intel");
            const themeHubPath =
              item.themeHubPath || `${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes/theme-${slug}.md`;
            const themeHubName = item.themeHubName || noteNameFromPath(themeHubPath);
            themeHubMap.set(item.theme, { themeHubPath, themeHubName });
          }
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
        const manifest = buildManifest({
          generatedAt: report.generatedAt,
          sourceMode,
          itemDir: obsidianGraphItemDir,
          items: prepared
        });
        await obsidianRequest({
          baseUrl: obsidianBaseUrl,
          apiKey: obsidianApiKey,
          method: "PUT",
          route: manifestRoute,
          body: `${JSON.stringify(manifest, null, 2)}\n`,
          contentType: "application/json"
        });
        totalBytes += Buffer.byteLength(JSON.stringify(manifest), "utf8");
        report.obsidian.graphUploadedItems = prepared.length;
        report.obsidian.graphUploadedHub = true;
        report.obsidian.graphManifestWritten = true;
      }
      if (queueItems.length === 0) {
        report.obsidian.status = "ok_empty_queue";
        report.obsidian.reason =
          sourceMode === "notebooklm_json"
            ? `approved queue is empty (${report.source.notebooklmStatus}${report.source.notebooklmReason ? `: ${report.source.notebooklmReason}` : ""})`
            : "approved queue is empty";
      } else {
        report.obsidian.status = "ok";
        report.obsidian.reason = "";
      }
      report.obsidian.uploaded = true;
      report.obsidian.bytes = totalBytes;
    } catch (error) {
      report.obsidian.status = "fail";
      report.obsidian.reason = error?.message || String(error);
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  if (report.obsidian.status === "fail" || report.notion.status === "fail") {
    report.status = "fail";
  } else if (report.queue.fallbackApplied) {
    report.status = "ok_fallback_last_good";
  } else if (report.obsidian.status === "ok_empty_queue") {
    report.status = "ok_empty_queue";
  } else {
    report.status = "ok";
  }
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
    console.error(
      `[KNOWLEDGE_PIPELINE][EXIT] notebooklm required + source fail (${report.source.notebooklmStatus}:${report.source.notebooklmReason || "n/a"})`
    );
    process.exit(1);
  }
  if (sourceMode === "notebooklm_json" && queueItems.length === 0 && notebooklmRequired) {
    console.error(
      `[KNOWLEDGE_PIPELINE][EXIT] notebooklm required + queue empty (status=${report.source.notebooklmStatus}, reason=${report.source.notebooklmReason || "n/a"})`
    );
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
