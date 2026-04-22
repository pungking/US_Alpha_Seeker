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
const NOTEBOOKLM_SANITIZED_MAX_CHARS = Number.parseInt(env("KNOWLEDGE_PIPELINE_NOTEBOOKLM_SANITIZED_MAX_CHARS", "12000"), 10) || 12000;

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
const shortStableHash = (value, len = 6) => {
  const text = String(value || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const out = hash.toString(36);
  if (!out) return "0".repeat(Math.max(1, len));
  return out.padStart(Math.max(1, len), "0").slice(-Math.max(1, len));
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
const truncateAtNaturalBoundary = (value, max = 2600) => {
  const text = String(value || "");
  if (!text || text.length <= max) return text;
  const hard = Math.max(400, max);
  const slice = text.slice(0, hard);
  const candidates = [
    slice.lastIndexOf("\n\n"),
    slice.lastIndexOf("\n"),
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("다. "),
    slice.lastIndexOf(" ")
  ].filter((x) => x >= Math.max(120, hard - 240));
  const cut = candidates.length > 0 ? Math.max(...candidates) : hard;
  return `${slice.slice(0, cut).trim()}\n\n- (본문 길이 제한으로 일부 생략)`;
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
  if (/(rsi|macd|bollinger|breakout|chart[- ]?pattern|technical[- ]?analysis|candlestick|fibonacci|ichimoku|wyckoff|volume[- ]?profile)/.test(text)) return "기술적분석/차트";
  if (/(portfolio|position[- ]?sizing|kelly|allocation|sharpe|sortino|diversif)/.test(text)) return "포트폴리오/사이징";
  if (/(self[- ]?healing|circuit[- ]?breaker|flash[- ]?crash|auto[- ]?hedging|emergency)/.test(text)) return "자가치유/긴급대응";
  if (String(theme || "").trim()) return themeLabelKo(theme);
  return "";
};
const inferActionHintKo = ({ title, summary, sourceUrl }) => {
  const text = `${title || ""} ${summary || ""} ${sourceUrl || ""}`.toLowerCase();
  if (/(ohlcv|entry|validation|checklist|false-positive)/.test(text)) return "진입검증";
  if (/(risk[- ]?off|gating|guard|stop[- ]?loss|position[- ]?sizing|drawdown)/.test(text)) return "리스크게이팅";
  if (/(sector|rotation|flow|momentum|trend)/.test(text)) return "섹터로테이션";
  if (/(feature|model|win[- ]?rate|expectancy|precision)/.test(text)) return "모델개선";
  if (/(monitor|incident|trigger|alert|ops)/.test(text)) return "운영트리거";
  if (/(policy|compliance|sec|edgar|regulation)/.test(text)) return "정책준수";
  if (/(earnings|guidance|fundamental|eps|revenue)/.test(text)) return "실적체크";
  if (/(vix|volatility|tail risk|skew)/.test(text)) return "변동성대응";
  if (/(rsi|macd|bollinger|breakout|chart|technical|candlestick|fibonacci|ichimoku|squeeze)/.test(text)) return "기술적신호";
  if (/(portfolio|allocation|kelly|correlation|sharpe|rebalancing)/.test(text)) return "포트폴리오최적화";
  if (/(self[- ]?healing|circuit[- ]?breaker|flash[- ]?crash|emergency|auto[- ]?hedge)/.test(text)) return "자가치유";
  return "";
};
const isGenericKoreanHeadline = (value) => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return true;
  if (/(gdpnow\/성장|미국 cpi|변동성\/리스크|섹터\/트렌드|시장 인텔|거시체크|리스크게이팅)$/.test(v)) return true;
  if (/^인사이트[- ]?\d+$/.test(v)) return true;
  return false;
};
const stripThemePrefixFromTitle = (title, themeLabel) => {
  let out = String(title || "").trim();
  const theme = String(themeLabel || "").trim();
  if (!out || !theme) return out;
  const prefixes = [theme, theme.replace(/\s+/g, "-"), theme.replace(/\s+/g, " ")].filter(Boolean);
  for (const prefix of prefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}\\s*(?:[·|:/-]\\s*)?`, "i");
    out = out.replace(re, "").trim();
  }
  return out || String(title || "").trim();
};
const looksNoisyNoteName = (name) => {
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  return (
    n.includes("-nlm-") ||
    n.includes("-http-") ||
    n.startsWith("seed-") ||
    n.startsWith("nlm-") ||
    /^.*-\d{10,}$/.test(n) ||
    /^.+-\d{1,2}$/.test(n)
  );
};
const stemKeywordHint = (keywords = []) => {
  const uniq = [];
  for (const kwRaw of Array.isArray(keywords) ? keywords : []) {
    const kw = String(kwRaw || "").trim().toLowerCase();
    if (!kw || kw.length < 2) continue;
    if (uniq.includes(kw)) continue;
    uniq.push(kw);
    if (uniq.length >= 2) break;
  }
  return uniq.join("-");
};
const buildFriendlyGraphNoteStem = ({
  finalTitle,
  rawTitle,
  themeLabel,
  themeCanonical,
  sourceUrl,
  mergeKey,
  keywords
}) => {
  const stripped = stripThemePrefixFromTitle(finalTitle || rawTitle, themeLabel);
  const sourceHint = inferSourceHintKo({ title: rawTitle, sourceUrl, summary: "", theme: themeCanonical || themeLabel });
  const actionHint = inferActionHintKo({ title: rawTitle, summary: "", sourceUrl });
  const candidate = short(String(stripped || `${sourceHint} ${actionHint}` || rawTitle || finalTitle || "").replace(/\s+/g, " "), 96).trim();
  const core = candidate && !looksMachineTitle(candidate) && !looksNoisyNoteName(candidate) ? candidate : sourceHint || candidate;
  const keywordHint = stemKeywordHint(keywords);
  const stable = shortStableHash(`${mergeKey}|${sourceUrl}|${rawTitle}|${finalTitle}|${keywordHint}`, 3);
  const stitched = [core, actionHint, keywordHint, stable].filter(Boolean).join(" ");
  return slugifyFileName(stitched, `insight-${stable}`).slice(0, 64);
};
const allocateUniqueNotePath = ({ itemDir, themeSlug, baseStem, usedNotePaths }) => {
  const root = itemDir.replace(/\/+$/, "");
  let notePath = `${root}/${themeSlug}/${baseStem}.md`;
  let dupe = 2;
  while (usedNotePaths.has(notePath)) {
    notePath = `${root}/${themeSlug}/${baseStem}-${dupe}.md`;
    dupe += 1;
  }
  return notePath;
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
const stripNotebookCitationNoise = (value) => {
  let s = String(value || "");
  // Bracket citations only: [1], [1,2] — safe because bracket-number combos are almost always citations.
  s = s.replace(/\s*\[(?:\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g, "");
  // Parenthesised citations only when clearly not numeric context (preceded by word char, not digit/%).
  s = s.replace(/(?<=[가-힣a-zA-Z])\s*\((?:\d{1,2}(?:\s*,\s*\d{1,2})*)\)/g, "");
  // NOTE: Removed aggressive spaced-number tail stripping that was deleting real numbers
  // (e.g. "GDPNow 1.3%" → "GDPNow%", "Skew 99th" → "Skew th").
  // Only strip trailing lone numbers at absolute end of line after Korean sentence-ender.
  s = s.replace(/(?<=다)\s+\d{1,2}\s*\.\s*$/gm, ".");
  // Strip citation-like trailing numbers left behind after bracket removal.
  // Example: "검증합니다 8" -> "검증합니다"
  s = s.replace(/(?<=[가-힣A-Za-z])\s+\d{1,2}(?=\s*(?:[.!?…])?\s*$)/gm, "");
  // Cleanup punctuation spacing after citation strip.
  s = s.replace(/\s+([.,;:!?])/g, "$1");
  return s;
};
const canonicalSectionHeading = (value) => {
  const token = String(value || "").trim().toLowerCase();
  if (!token) return "";
  if (/(executive|summary|핵심\s*요약)/.test(token)) return "핵심 요약";
  if (/(strategic|analysis|전략\s*해석)/.test(token)) return "전략 해석";
  if (/(technical|validation|기술\s*검증)/.test(token)) return "기술 검증";
  if (/(operational|checklist|운영\s*체크포인트)/.test(token)) return "운영 체크포인트";
  return "";
};
const looksDegradedMarkdown = (value) => {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim());
  if (lines.length === 0) return false;
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return true;
  const emptyBullets = nonEmpty.filter((line) => /^[-*•]\s*$/.test(line)).length;
  const shortNoise = nonEmpty.filter((line) => /^[^가-힣A-Za-z0-9]{1,3}$/.test(line)).length;
  const ratio = (emptyBullets + shortNoise) / nonEmpty.length;
  return ratio >= 0.18;
};
const conservativeMarkdownRepair = (value) => {
  let out = String(value || "").trim();
  if (!out) return "";
  out = out
    .replace(/\[Executive Summary\]/gi, "\n## 핵심 요약\n")
    .replace(/\[Strategic[^\]]*\]/gi, "\n## 전략 해석\n")
    .replace(/\[Technical[^\]]*\]/gi, "\n## 기술 검증\n")
    .replace(/\[Operational[^\]]*\]/gi, "\n## 운영 체크포인트\n")
    .replace(/^[-–—=_]{4,}\s*$/gim, "\n")
    .replace(/\n[-*•]\s*\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!/^##\s+/m.test(out)) out = `## 핵심 요약\n${out}`;
  return out;
};
const splitSummarySentences = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?]|다\.)\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
const bulletizeDenseParagraph = (value, maxItems = 8) => {
  const sentences = splitSummarySentences(value);
  if (sentences.length <= 1) return [String(value || "").trim()];
  return sentences.slice(0, Math.max(1, maxItems)).map((x) => `- ${x}`);
};
const prettifyNotebookSummaryMarkdown = (value) => {
  const lines = String(value || "").split(/\r?\n/);
  const out = [];
  let lastPushed = "";
  const normalizeLine = (lineRaw) => {
    let line = String(lineRaw || "").trim();
    if (!line) return "";
    if (/^[-*•]\s*$/.test(line)) return "";
    line = line
      .replace(/^#\s*#\s+/g, "## ")
      .replace(/^#{4,}\s+/g, "### ")
      .replace(/^###\s*-\s*$/g, "---")
      .replace(/^[\-*]\s*#\s*#\s+/g, "- ")
      .replace(/^\*\*\s*(.+?)\s*\*\*:?$/g, "### $1")
      .replace(/^\*\*\s*(.+?)\s*\*\*\s*$/g, "### $1")
      .replace(/^[-–—=_]{3,}\s*(.+)$/g, "### $1")
      .replace(/^\s*#+\s*([가-힣A-Za-z].+)\s*$/g, "## $1")
      .replace(/\s{2,}/g, " ");
    const inlineLabelMatch = line.match(/^[-*]\s*\[([^\]]{2,80})\]\s*(.*)$/);
    if (inlineLabelMatch) {
      const label = inlineLabelMatch[1].trim();
      const rest = inlineLabelMatch[2].trim();
      return rest ? `### ${label}\n- ${rest}` : `### ${label}`;
    }
    const sectionLabel = canonicalSectionHeading(line.replace(/^[\[\]-]+|[\]-]+$/g, ""));
    if (sectionLabel) return `## ${sectionLabel}`;
    // Drop visual-noise separators copied from rich UI.
    if (/^[-–—=_]{3,}$/.test(line)) return "";
    if (/^[`"'“”‘’]+$/.test(line)) return "";
    if (/^[-*]\s*(?:\[[^\]]*\])?\s*$/.test(line)) return "";
    return line;
  };
  const flushBuffer = (buffer, sectionTitle = "") => {
    if (!Array.isArray(buffer) || buffer.length === 0) return;
    const paragraph = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (!paragraph) return;
    const hasBullets = /(^|\n)\s*[-*]\s+/.test(paragraph);
    if (hasBullets) {
      out.push(paragraph);
      return;
    }
    const section = String(sectionTitle || "").toLowerCase();
    const sentenceCount = splitSummarySentences(paragraph).length;
    const shouldBullet =
      section.includes("핵심 요약") || paragraph.length >= 180 || sentenceCount >= 3;
    if (shouldBullet) {
      out.push(...bulletizeDenseParagraph(paragraph, section.includes("핵심 요약") ? 6 : 8));
      return;
    }
    out.push(paragraph);
  };
  let buffer = [];
  let currentSection = "";
  const processNormalizedLine = (line) => {
    if (!line) {
      flushBuffer(buffer, currentSection);
      buffer = [];
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      return;
    }
    const isSection = /^##\s+/.test(line);
    const isBullet = /^[-*]\s+/.test(line);
    const isDivider = /^---$/.test(line);
    if (isSection || isBullet || isDivider) {
      flushBuffer(buffer, currentSection);
      buffer = [];
      if (isSection && lastPushed === line) {
        // Avoid noisy duplicate section headers from repeated inline labels.
        return;
      }
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      out.push(line);
      lastPushed = line;
      if (isSection) currentSection = line.replace(/^##\s+/, "").trim();
      return;
    }
    buffer.push(line);
  };
  for (const lineRaw of lines) {
    const normalized = normalizeLine(lineRaw);
    if (!normalized) {
      processNormalizedLine("");
      continue;
    }
    const expanded = normalized.split("\n");
    for (const row of expanded) {
      processNormalizedLine(String(row || "").trim());
    }
  }
  flushBuffer(buffer, currentSection);
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};
const sanitizeNotebookSummary = (value) => {
  const raw = stripNotebookLmMetaSuffix(String(value || "").trim());
  if (!raw) return "";
  if (isInvalidNotebookLmMetaAnswer(raw)) return invalidNotebookLmSummary();
  let s = stripNotebookCitationNoise(raw)
    .replace(/\[Executive Summary\]/gi, "\n## 핵심 요약\n")
    .replace(/\[Strategic Analysis\]/gi, "\n## 전략 해석\n")
    .replace(/\[Technical Validation[^\]]*\]/gi, "\n## 기술 검증\n")
    .replace(/\[Operational Checklist[^\]]*\]/gi, "\n## 운영 체크포인트\n")
    .replace(/\*\*\s*Executive Summary\s*\*\*:?\s*/gi, "\n## 핵심 요약\n")
    .replace(/\*\*\s*Strategic Analysis\s*:\s*([^*]+?)\s*\*\*:?\s*/gi, "\n## 전략 해석\n")
    .replace(/\*\*\s*Technical Validation\s*:\s*([^*]+?)\s*\*\*:?\s*/gi, "\n## 기술 검증\n")
    .replace(/\*\*\s*Operational Checklist\s*:\s*([^*]+?)\s*\*\*:?\s*/gi, "\n## 운영 체크포인트\n")
    .replace(/^\s*[*-]?\s*핵심\s*요약[^\n]*$/gim, "## 핵심 요약")
    .replace(/^\s*[*-]?\s*전략\s*해석[^\n]*$/gim, "## 전략 해석")
    .replace(/^\s*[*-]?\s*기술\s*검증[^\n]*$/gim, "## 기술 검증")
    .replace(/^\s*[*-]?\s*운영\s*체크포인트[^\n]*$/gim, "## 운영 체크포인트")
    .replace(/^\s*(?:핵심\s*요약|Executive Summary)\s*[.:：]\s*/gim, "\n## 핵심 요약\n")
    .replace(/^\s*(?:전략\s*해석|Strategic Analysis)\s*[.:：]\s*/gim, "\n## 전략 해석\n")
    .replace(/^\s*(?:기술\s*검증|Technical Validation)\s*[.:：]\s*/gim, "\n## 기술 검증\n")
    .replace(/^\s*(?:운영\s*체크포인트|Operational Checklist)\s*[.:：]\s*/gim, "\n## 운영 체크포인트\n")
    .replace(/\[Strategic\]/gi, "\n## 전략 해석\n")
    .replace(/\[Analysis[^\]]*\]/gi, "\n## 전략 해석\n")
    .replace(/\[Technical[^\]]*\]/gi, "\n## 기술 검증\n")
    .replace(/\[Operational[^\]]*\]/gi, "\n## 운영 체크포인트\n")
    .replace(/^[-–—=_]{3,}\s*Strategic\s*$/gim, "\n## 전략 해석\n")
    .replace(/^[-–—=_]{3,}\s*Technical\s*$/gim, "\n## 기술 검증\n")
    .replace(/^[-–—=_]{3,}\s*Executive\s*$/gim, "\n## 핵심 요약\n")
    .replace(/^[-–—=_]{3,}\s*Operational\s*$/gim, "\n## 운영 체크포인트\n")
    .replace(/\n[-*•]\s*\n/g, "\n")
    .replace(/^[-–—=_]{3,}\s*(Strategic Analysis|Technical Validation|Executive Summary|Operational Checklist)\s*$/gim, "\n## $1\n")
    .replace(/more_horiz/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s.includes("## ")) {
    s = `## 핵심 요약\n${s}`;
  }
  s = prettifyNotebookSummaryMarkdown(s);
  if (looksDegradedMarkdown(s)) {
    s = conservativeMarkdownRepair(raw);
    s = prettifyNotebookSummaryMarkdown(s);
  }
  return truncateAtNaturalBoundary(s, NOTEBOOKLM_SANITIZED_MAX_CHARS);
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
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
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
    "seed",
    "핵심",
    "요약",
    "전략",
    "해석",
    "기술",
    "검증",
    "운영",
    "체크포인트",
    "시장",
    "인텔",
    "노트"
  ]);
  const freq = new Map();
  for (const token of raw) {
    if (/^\d+$/.test(token)) continue;
    if (token.length < 2 || stop.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([word]) => word);
};
const inferTheme = (item) => {
  const title = String(item?.title || "").toLowerCase();
  const summary = String(item?.summary || "").toLowerCase();
  const sourceUrl = String(item?.sourceUrl || "").toLowerCase();
  const category = String(item?.category || "").toLowerCase();
  const scores = new Map([
    ["Macro & Rates", 0],
    ["Volatility & Risk", 0],
    ["Earnings & Fundamentals", 0],
    ["Sector & Trend", 0],
    ["Policy & Compliance", 0],
    ["Technical & Chart", 0],
    ["Portfolio & Sizing", 0]
  ]);
  const add = (theme, score) => scores.set(theme, (scores.get(theme) || 0) + score);
  const applyTextScore = (text, score) => {
    if (!text) return;
    if (/(federalreserve|fomc|fedwatch|cpi|employment|payroll|gdp|pce|rates?|treasury|inflation)/.test(text)) {
      add("Macro & Rates", score);
    }
    if (/(vix|volatility|skew|cboe|drawdown|risk[- ]?off|tail[- ]?risk|hedge|var\b|circuit[- ]?breaker|flash[- ]?crash)/.test(text)) {
      add("Volatility & Risk", score);
    }
    if (/(earnings|guidance|revenue|eps\b|profit|margin|season)/.test(text)) {
      add("Earnings & Fundamentals", score);
    }
    if (/(sector|rotation|flow|momentum|trend|relative strength|rs\b|rebalancing|etf[- ]?flow)/.test(text)) {
      add("Sector & Trend", score);
    }
    if (/(policy|regulation|compliance|sec\b|edgar|filing)/.test(text)) {
      add("Policy & Compliance", score);
    }
    // Technical Analysis & Chart Patterns
    if (/(rsi|macd|bollinger|moving average|breakout|head[- ]?and[- ]?shoulders|cup[- ]?and[- ]?handle|double[- ]?bottom|chart[- ]?pattern|candlestick|fibonacci|volume[- ]?profile|ichimoku|stochastic|technical[- ]?(analysis|indicator|signal)|ohlcv|wyckoff|regime[- ]?detection|breadth[- ]?divergence|squeeze|adaptive[- ]?ma)/.test(text)) {
      add("Technical & Chart", score);
    }
    // Portfolio Construction & Position Sizing
    if (/(portfolio|position[- ]?sizing|kelly[- ]?criterion|allocation|correlation|sharpe|sortino|risk[- ]?adjusted|diversif|max[- ]?drawdown|win[- ]?rate|false[- ]?positive|precision|expectancy|r[- ]?multiple)/.test(text)) {
      add("Portfolio & Sizing", score);
    }
  };
  applyTextScore(title, 5);
  applyTextScore(summary, 2);
  applyTextScore(sourceUrl, 1);
  if (/(macro|거시|금리)/.test(category)) add("Macro & Rates", 3);
  if (/(volatility|변동성|리스크)/.test(category)) add("Volatility & Risk", 3);
  if (/(earning|실적|펀더멘털)/.test(category)) add("Earnings & Fundamentals", 3);
  if (/(trend|섹터|트렌드)/.test(category)) add("Sector & Trend", 3);
  if (/(policy|정책|컴플라이언스|규제)/.test(category)) add("Policy & Compliance", 3);
  if (/(technical|기술적|차트|패턴|지표)/.test(category)) add("Technical & Chart", 3);
  if (/(portfolio|포트폴리오|포지션|사이징)/.test(category)) add("Portfolio & Sizing", 3);

  const priority = [
    "Technical & Chart",
    "Portfolio & Sizing",
    "Policy & Compliance",
    "Earnings & Fundamentals",
    "Sector & Trend",
    "Volatility & Risk",
    "Macro & Rates"
  ];
  let bestTheme = "General Market Intel";
  let bestScore = 0;
  for (const theme of priority) {
    const score = scores.get(theme) || 0;
    if (score > bestScore) {
      bestScore = score;
      bestTheme = theme;
    }
  }
  return bestScore > 0 ? bestTheme : "General Market Intel";
};
const themeLabelKo = (theme) => {
  const key = String(theme || "");
  const map = {
    "Macro & Rates": "거시-금리",
    "Volatility & Risk": "변동성-리스크",
    "Earnings & Fundamentals": "실적-펀더멘털",
    "Sector & Trend": "섹터-트렌드",
    "Policy & Compliance": "정책-컴플라이언스",
    "Technical & Chart": "기술적분석-차트",
    "Portfolio & Sizing": "포트폴리오-사이징",
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
    "Technical & Chart": "Technical & Chart",
    "Portfolio & Sizing": "Portfolio & Sizing",
    "General Market Intel": "General Market Intel",
    "거시-금리": "Macro & Rates",
    "변동성-리스크": "Volatility & Risk",
    "실적-펀더멘털": "Earnings & Fundamentals",
    "섹터-트렌드": "Sector & Trend",
    "정책-컴플라이언스": "Policy & Compliance",
    "기술적분석-차트": "Technical & Chart",
    "포트폴리오-사이징": "Portfolio & Sizing",
    "시장-인텔": "General Market Intel"
  };
  if (direct[raw]) return direct[raw];
  const lower = raw.toLowerCase();
  if (lower.includes("macro") || lower.includes("금리")) return "Macro & Rates";
  if (lower.includes("volatility") || lower.includes("리스크")) return "Volatility & Risk";
  if (lower.includes("earning") || lower.includes("실적")) return "Earnings & Fundamentals";
  if (lower.includes("sector") || lower.includes("trend") || lower.includes("섹터")) return "Sector & Trend";
  if (lower.includes("policy") || lower.includes("compliance") || lower.includes("정책")) return "Policy & Compliance";
  if (lower.includes("technical") || lower.includes("chart") || lower.includes("차트") || lower.includes("기술적")) return "Technical & Chart";
  if (lower.includes("portfolio") || lower.includes("sizing") || lower.includes("포트폴리오")) return "Portfolio & Sizing";
  return "General Market Intel";
};
const BASE_THEME_CANONICALS = [
  "Macro & Rates",
  "Volatility & Risk",
  "Sector & Trend",
  "Earnings & Fundamentals",
  "Policy & Compliance",
  "Technical & Chart",
  "Portfolio & Sizing",
  "General Market Intel"
];
const themeDisplayLabel = (themeCanonical, preferKorean) =>
  preferKorean ? themeLabelKo(themeCanonical) : themeCanonical;
const themeHubPathFromLabel = (itemDir, themeLabel) =>
  `${itemDir.replace(/\/+$/, "")}/_themes/theme-${slugifyFileName(themeLabel, "general-market-intel")}.md`;
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
const isEphemeralNotebooklmPageId = (pageId, sourceType) => {
  const pid = String(pageId || "").trim().toLowerCase();
  if (!pid) return false;
  const src = String(sourceType || "").trim().toLowerCase();
  if (src && !src.includes("notebooklm")) return false;
  return /^nlm-\d{10,}-\d+$/.test(pid);
};
const mergeKeyFromItem = (item, index = 0) => {
  const sourceType = String(item?.sourceType || "").trim().toLowerCase();
  const pageId = String(item?.pageId || "").trim().toLowerCase();
  if (pageId && !isEphemeralNotebooklmPageId(pageId, sourceType)) return `id:${pageId}`;
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
const localizedDisplayTitle = ({ displayTitle, theme, index, preferKorean, sourceUrl, summary }) => {
  const normalized = short(String(displayTitle || "").replace(/\s+/g, " "), 120).trim();
  if (!preferKorean) return normalized || `NotebookLM Insight ${index}`;
  const themeKo = themeLabelKo(theme);
  const sourceHint = inferSourceHintKo({ title: normalized, sourceUrl, summary, theme });
  const actionHint = inferActionHintKo({ title: normalized, summary, sourceUrl });
  if (hasKorean(normalized) && !isGenericKoreanHeadline(normalized)) return normalized;
  if (normalized && !looksMachineTitle(normalized) && !looksLikeUrl(normalized)) {
    const readable = compactReadableTitle(normalized, 72);
    if (hasKorean(readable) && !isGenericKoreanHeadline(readable)) return readable;
  }
  const core = sourceHint || "시장 인텔";
  if (actionHint) return `${themeKo} · ${core} · ${actionHint}`;
  return `${themeKo} · ${core}`;
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

const markdownGraphItem = ({
  generatedAt,
  item,
  hubLink,
  packLink,
  playbookLink,
  themeHubLink,
  relatedLinks = [],
  includeGraphHubRef = false,
  includeCoreDocs = false
}) => {
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
  if (includeGraphHubRef && hubLink) lines.push(`- graphHub: ${hubLink}`);
  if (includeCoreDocs && packLink) lines.push(`- pack: ${packLink}`);
  if (includeCoreDocs && playbookLink) lines.push(`- playbook: ${playbookLink}`);
  lines.push("");
  lines.push("## 대응안(초안)");
  lines.push("- [ ] 시그널/지표 반영 포인트 정리");
  lines.push("- [ ] shadow-only 검증 설계");
  lines.push("- [ ] 롤백 조건 명시");
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownThemeHub = ({
  generatedAt,
  theme,
  items,
  hubLink,
  packLink,
  playbookLink,
  includeHubLink = false,
  relatedThemeLinks = [],
  includeGraphHubRef = false,
  includeCoreDocs = false
}) => {
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
  if (includeGraphHubRef || includeCoreDocs) {
    lines.push("## 연결");
    if (includeGraphHubRef && hubLink) {
      if (includeHubLink) lines.push(`- [[${hubLink}]]`);
      else lines.push(`- graphHub: ${hubLink}`);
    }
    if (includeCoreDocs && packLink) lines.push(`- pack: ${packLink}`);
    if (includeCoreDocs && playbookLink) lines.push(`- playbook: ${playbookLink}`);
    lines.push("");
  }
  lines.push("## 연관 테마");
  if (!Array.isArray(relatedThemeLinks) || relatedThemeLinks.length === 0) {
    lines.push("- (직접 연관 테마 없음)");
  } else {
    for (const row of relatedThemeLinks) lines.push(`- [[${row.noteName}]] · 공통 키워드: ${row.keywords.join(", ")}`);
  }
  lines.push("");
  lines.push("## 인사이트 노트");
  if (items.length === 0) lines.push("- (현재 테마 노트 없음)");
  else for (const item of items) lines.push(`- [[${item.noteName}]] · ${item.displayTitle || item.title}`);
  lines.push("");
  lines.push("## 키워드 렌즈");
  if (topKeywords.length === 0) lines.push("- (none)");
  else for (const row of topKeywords) lines.push(`- ${row}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
};

const markdownGraphHub = ({
  generatedAt,
  sourceMode,
  items,
  packLink,
  playbookLink,
  linkThemeNodes = false,
  includeCoreDocs = false
}) => {
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
  if (includeCoreDocs) {
    lines.push("## Core Docs");
    if (packLink) lines.push(`- pack: ${packLink}`);
    if (playbookLink) lines.push(`- playbook: ${playbookLink}`);
    lines.push("");
  }
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
      const themeRef = rows[0]?.themeHubName || theme;
      lines.push(
        linkThemeNodes
          ? `- [[${themeRef}]] · ${rows.length}개 노트 · 키워드: ${top || "(none)"}`
          : `- ${themeRef} · ${rows.length}개 노트 · 키워드: ${top || "(none)"}`
      );
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
        const themeRefA = rowsA[0]?.themeHubName || themeA;
        const themeRefB = rowsB[0]?.themeHubName || themeB;
        lines.push(
          linkThemeNodes
            ? `- [[${themeRefA}]] ↔ [[${themeRefB}]] · 공통 키워드: ${overlap.join(", ")}`
            : `- ${themeRefA} ↔ ${themeRefB} · 공통 키워드: ${overlap.join(", ")}`
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
  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : body
    });
  } catch (error) {
    const message = error?.cause?.message || error?.message || String(error);
    throw new Error(`Obsidian ${method} ${route} fetch failed (${url}): ${message}`);
  }
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
const normalizeManifestMergeKey = (entry, fallbackIndex = 0) => {
  const raw = String(entry?.mergeKey || "").trim().toLowerCase();
  if (raw.startsWith("id:")) {
    const pageId = raw.slice(3);
    if (isEphemeralNotebooklmPageId(pageId, entry?.sourceType || "")) {
      return mergeKeyFromItem({ ...entry, pageId: "" }, fallbackIndex);
    }
  }
  if (raw) return raw;
  return mergeKeyFromItem(entry, fallbackIndex);
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

const safeReadJson = (jsonPath) => {
  if (!fs.existsSync(jsonPath)) return null;
  const raw = fs.readFileSync(jsonPath, "utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const notebooklmZeroReasonCode = ({ sourceStatus, sourceReason, collectStatus, collectReason, queueCount }) => {
  if (Number(queueCount || 0) > 0) return "ok";
  const text = `${String(sourceStatus || "")} ${String(sourceReason || "")} ${String(collectStatus || "")} ${String(
    collectReason || ""
  )}`.toLowerCase();
  if (/not_authenticated_or_notebook_access_denied|fail_auth_required|auth_required/.test(text)) return "auth";
  if (/invalid_assistant_meta_answer|extremely important|시스템에서 답변할 수 없습니다/.test(text)) return "guard";
  if (/runtime_budget_guard|timeout|time(?:d)? out|max_runtime/.test(text)) return "timeout";
  if (/items_empty|ask_question_returned_no_content|no_items|approved queue is empty/.test(text)) return "empty";
  if (/missing|fail_parse|skip_empty_file|skip_missing_file/.test(text)) return "source";
  return "other";
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

const cleanupObsidianThemeHubPaths = async ({ baseUrl, apiKey, themesDir, currentPaths }) => {
  const stats = { scanned: 0, stale: 0, deleted: 0, missing: false };
  const baseDir = String(themesDir || "").replace(/\/+$/, "");
  if (!baseDir) return stats;
  const listRoute = `/vault/${encodeVaultPath(`${baseDir}/`)}`;
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
  const allowSet = new Set((Array.isArray(currentPaths) ? currentPaths : []).map((x) => String(x || "").trim()).filter(Boolean));
  for (const fileName of files) {
    if (!fileName || fileName.endsWith("/")) continue;
    if (!fileName.toLowerCase().endsWith(".md")) continue;
    if (!fileName.toLowerCase().startsWith("theme-")) continue;
    stats.scanned += 1;
    const fullPath = `${baseDir}/${fileName}`;
    if (allowSet.has(fullPath)) continue;
    stats.stale += 1;
    const removed = await obsidianDeleteIfExists({
      baseUrl,
      apiKey,
      route: `/vault/${encodeVaultPath(fullPath)}`
    });
    if (removed.deleted) stats.deleted += 1;
  }
  return stats;
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

const listObsidianDirEntries = async ({ baseUrl, apiKey, dirPath }) => {
  const normalizedDir = String(dirPath || "").replace(/\/+$/, "");
  if (!normalizedDir) return { missing: true, files: [], folders: [] };
  const route = `/vault/${encodeVaultPath(`${normalizedDir}/`)}`;
  const listing = await obsidianRawRequest({
    baseUrl,
    apiKey,
    method: "GET",
    route,
    contentType: "application/json"
  });
  if (listing.status === 404) return { missing: true, files: [], folders: [] };
  if (!listing.ok) {
    throw new Error(`Obsidian ${route} failed (${listing.status}): ${short(listing.text, 400)}`);
  }
  const parsed = parseJsonOrNull(listing.text);
  const files = Array.isArray(parsed?.files) ? parsed.files.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const folders = Array.isArray(parsed?.folders)
    ? parsed.folders.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  return { missing: false, files, folders };
};

const normalizeListedPath = ({ rootDir, currentDir, entry, forceDirectory = false }) => {
  const root = String(rootDir || "").replace(/^\/+|\/+$/g, "");
  const current = String(currentDir || "").replace(/^\/+|\/+$/g, "");
  let raw = String(entry || "").trim();
  if (!root || !current || !raw) return null;
  const treatedAsDirectory = forceDirectory || raw.endsWith("/");
  raw = raw.replace(/^\/+|\/+$/g, "");
  if (!raw) return null;
  let pathValue = "";
  if (raw === root || raw.startsWith(`${root}/`)) {
    pathValue = raw;
  } else if (raw === current || raw.startsWith(`${current}/`)) {
    pathValue = raw;
  } else {
    pathValue = `${current}/${raw}`;
  }
  pathValue = pathValue.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
  if (!pathValue) return null;
  if (pathValue !== root && !pathValue.startsWith(`${root}/`)) return null;
  return { path: pathValue, isDirectory: treatedAsDirectory };
};

const collectObsidianTreeFiles = async ({ baseUrl, apiKey, rootDir, maxScan = 20000 }) => {
  const root = String(rootDir || "").replace(/^\/+|\/+$/g, "");
  if (!root) return { missing: true, files: [], scannedDirs: 0, capped: false };
  const queue = [root];
  const seenDirs = new Set();
  const files = [];
  let scannedDirs = 0;
  let capped = false;
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seenDirs.has(current)) continue;
    seenDirs.add(current);
    scannedDirs += 1;
    if (scannedDirs > maxScan) {
      capped = true;
      break;
    }
    const listed = await listObsidianDirEntries({ baseUrl, apiKey, dirPath: current });
    if (listed.missing) continue;
    for (const fileNameRaw of listed.files) {
      const normalized = normalizeListedPath({ rootDir: root, currentDir: current, entry: fileNameRaw });
      if (!normalized) continue;
      if (normalized.isDirectory) {
        queue.push(normalized.path);
        continue;
      }
      files.push(normalized.path);
    }
    for (const folderRaw of listed.folders) {
      const normalized = normalizeListedPath({ rootDir: root, currentDir: current, entry: folderRaw, forceDirectory: true });
      if (!normalized) continue;
      queue.push(normalized.path);
    }
  }
  return { missing: false, files: [...new Set(files)], scannedDirs, capped };
};

const purgeObsidianTreeFiles = async ({ baseUrl, apiKey, rootDir, maxScan = 20000 }) => {
  const listed = await collectObsidianTreeFiles({ baseUrl, apiKey, rootDir, maxScan });
  const stats = {
    rootDir: String(rootDir || ""),
    missing: listed.missing,
    scannedDirs: listed.scannedDirs || 0,
    capped: listed.capped || false,
    foundFiles: Array.isArray(listed.files) ? listed.files.length : 0,
    deletedFiles: 0
  };
  if (listed.missing || !Array.isArray(listed.files) || listed.files.length === 0) return stats;
  const sortedFiles = [...listed.files].sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const filePath of sortedFiles) {
    const route = `/vault/${encodeVaultPath(filePath)}`;
    const removed = await obsidianDeleteIfExists({ baseUrl, apiKey, route });
    if (removed.deleted) stats.deletedFiles += 1;
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
  const handoffEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_ENABLED", true);
  const handoffRequired = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRED", false);
  const handoffRequirePass = boolFromEnv("KNOWLEDGE_PIPELINE_HANDOFF_REQUIRE_PASS", true);
  const handoffPath = resolvePath(env("OPS_KNOWLEDGE_HANDOFF_PATH"), path.join(CWD, "state", "ops-knowledge-handoff.json"));

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
  const obsidianGraphThemeHubKeepBase = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_HUB_KEEP_BASE",
    true
  );
  const obsidianGraphThemeHubLinkHub = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_HUB_LINK_HUB", false);
  const obsidianGraphHubLinkThemes = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_LINK_THEMES", false);
  const obsidianGraphHubEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_HUB_ENABLED", false);
  const obsidianGraphCoreDocsEnabled = boolFromEnv("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_CORE_DOCS_ENABLED", false);
  const obsidianGraphThemeCrosslinkEnabled = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_THEME_CROSSLINK_ENABLED",
    true
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
      "Macro & Rates,Volatility & Risk,Sector & Trend,Earnings & Fundamentals,Policy & Compliance,Technical & Chart,Portfolio & Sizing"
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
  const obsidianGraphFriendlyFilenameEnabled = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_FRIENDLY_FILENAME_ENABLED",
    true
  );
  const obsidianGraphRenameLegacyNoisyFilenames = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_RENAME_LEGACY_NOISY_FILENAMES",
    true
  );
  const obsidianGraphRebuildFilenames = boolFromEnv(
    "KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_REBUILD_FILENAMES",
    false
  );
  const obsidianGraphResetMode = env("KNOWLEDGE_PIPELINE_OBSIDIAN_GRAPH_RESET_MODE", "off").toLowerCase();
  const obsidianGraphResetEnabled = ["true", "1", "yes", "on", "intake", "full"].includes(obsidianGraphResetMode);
  const obsidianGraphResetPurgeArchive = ["full", "all", "archive"].includes(obsidianGraphResetMode);
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
      notebooklmCollectStatus: "skip",
      notebooklmCollectReason: "",
      notebooklmZeroReasonCode: "n/a",
      notebooklmLoaded: 0,
      notebooklmDropInvalidItems,
      notebooklmInvalidDropped: 0
    },
    handoff: {
      enabled: handoffEnabled,
      required: handoffRequired,
      requirePass: handoffRequirePass,
      path: path.relative(CWD, handoffPath),
      loaded: false,
      schemaVersion: "",
      status: "skip_disabled",
      reason: "",
      runKey: "",
      generatedAt: "",
      requiredMissingCount: 0,
      gateAllowed: true
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
      graphThemeHubKeepBaseEnabled: obsidianGraphThemeHubKeepBase,
      graphKoreanTitleEnabled: obsidianGraphKoreanTitle,
      graphThemeHubLinkHubEnabled: obsidianGraphThemeHubLinkHub,
      graphHubLinkThemesEnabled: obsidianGraphHubLinkThemes,
      graphHubEnabled: obsidianGraphHubEnabled,
      graphCoreDocsEnabled: obsidianGraphCoreDocsEnabled,
      graphThemeCrosslinkEnabled: obsidianGraphThemeCrosslinkEnabled,
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
      graphFriendlyFilenameEnabled: obsidianGraphFriendlyFilenameEnabled,
      graphRenameLegacyNoisyFilenamesEnabled: obsidianGraphRenameLegacyNoisyFilenames,
      graphRebuildFilenamesEnabled: obsidianGraphRebuildFilenames,
      graphResetMode: obsidianGraphResetMode,
      graphResetEnabled: obsidianGraphResetEnabled,
      graphResetPurgeArchiveEnabled: obsidianGraphResetPurgeArchive,
      graphResetApplied: false,
      graphResetDeletedIntakeFiles: 0,
      graphResetDeletedArchiveFiles: 0,
      graphResetDeletedHub: false,
      graphResetDeletedManifest: false,
      graphLegacyDeleted: 0,
      graphFriendlyRenamed: 0,
      graphStaleThemeScanned: 0,
      graphStaleThemeDeleted: 0,
      graphStaleThemeMissing: false,
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

  const collectReport = safeReadJson(NOTEBOOKLM_MCP_COLLECT_REPORT_PATH) || {};
  report.source.notebooklmCollectStatus = String(collectReport?.status || "skip").trim() || "skip";
  report.source.notebooklmCollectReason = String(collectReport?.reason || "").trim();
  if (!handoffEnabled) {
    report.handoff.status = "skip_disabled";
    report.handoff.reason = "KNOWLEDGE_PIPELINE_HANDOFF_ENABLED=false";
    report.handoff.gateAllowed = true;
  } else {
    const handoff = safeReadJson(handoffPath);
    if (!handoff) {
      report.handoff.status = "fail_missing_file";
      report.handoff.reason = "handoff_file_missing_or_invalid_json";
      report.handoff.gateAllowed = !handoffRequired;
    } else {
      report.handoff.loaded = true;
      report.handoff.schemaVersion = String(handoff?.schemaVersion || "").trim();
      report.handoff.status = String(handoff?.handoffStatus || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      report.handoff.reason = String(handoff?.handoffReason || "").trim();
      report.handoff.runKey = String(handoff?.runKey || "").trim();
      report.handoff.generatedAt = String(handoff?.generatedAt || "").trim();
      report.handoff.requiredMissingCount = Array.isArray(handoff?.requiredMissing)
        ? handoff.requiredMissing.length
        : 0;
      if (handoffRequirePass) {
        report.handoff.gateAllowed = report.handoff.status === "PASS";
      } else {
        report.handoff.gateAllowed = !["BLOCK"].includes(report.handoff.status);
      }
    }
  }

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
  report.source.notebooklmZeroReasonCode = notebooklmZeroReasonCode({
    sourceStatus: report.source.notebooklmStatus,
    sourceReason: report.source.notebooklmReason,
    collectStatus: report.source.notebooklmCollectStatus,
    collectReason: report.source.notebooklmCollectReason,
    queueCount: report.queue.count
  });

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
        const hubLink = obsidianGraphHubEnabled ? noteNameFromPath(obsidianGraphHubPath) : "";
        const packLink = obsidianGraphCoreDocsEnabled ? noteNameFromPath(obsidianGraphPackNote) : "";
        const playbookLink = obsidianGraphCoreDocsEnabled ? noteNameFromPath(obsidianGraphPlaybookNote) : "";
        const manifestRoute = obsidianManifestRoute(obsidianGraphManifestPath);
        if (obsidianGraphResetEnabled) {
          report.obsidian.graphResetApplied = true;
          const resetIntake = await purgeObsidianTreeFiles({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            rootDir: obsidianGraphItemDir
          });
          report.obsidian.graphResetDeletedIntakeFiles = resetIntake.deletedFiles;
          if (obsidianGraphResetPurgeArchive) {
            const resetArchive = await purgeObsidianTreeFiles({
              baseUrl: obsidianBaseUrl,
              apiKey: obsidianApiKey,
              rootDir: obsidianGraphArchiveDir
            });
            report.obsidian.graphResetDeletedArchiveFiles = resetArchive.deletedFiles;
          }
          const removedHub = await obsidianDeleteIfExists({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            route: `/vault/${encodeVaultPath(obsidianGraphHubPath)}`
          });
          const removedManifest = await obsidianDeleteIfExists({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            route: manifestRoute
          });
          report.obsidian.graphResetDeletedHub = Boolean(removedHub.deleted);
          report.obsidian.graphResetDeletedManifest = Boolean(removedManifest.deleted);
        }
        const previousManifest = await obsidianReadIfExists({
          baseUrl: obsidianBaseUrl,
          apiKey: obsidianApiKey,
          route: manifestRoute,
          contentType: null
        });
        const previousManifestEntries = previousManifest.exists ? parseManifest(previousManifest.text) : [];
        const previousManifestPaths = previousManifestEntries.map((x) => String(x?.path || "").trim()).filter(Boolean);
        const previousByKey = new Map();
        let previousOrder = 1;
        for (const entry of previousManifestEntries) {
          const key = normalizeManifestMergeKey(entry, previousOrder);
          if (!key) continue;
          previousByKey.set(key, { ...entry, mergeKey: key });
          previousOrder += 1;
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
        const ensureThemeHub = (themeLabel) => {
          if (themeHubMap.has(themeLabel)) return themeHubMap.get(themeLabel);
          const themeHubPath = themeHubPathFromLabel(obsidianGraphItemDir, themeLabel);
          const themeHubName = noteNameFromPath(themeHubPath);
          const entry = { themeHubPath, themeHubName };
          themeHubMap.set(themeLabel, entry);
          return entry;
        };
        if (obsidianGraphThemeHubKeepBase) {
          for (const canonical of BASE_THEME_CANONICALS) {
            const label = themeDisplayLabel(canonical, obsidianGraphKoreanTitle);
            ensureThemeHub(label);
          }
        }
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
          const actionHint = inferActionHintKo({
            title: rawTitle,
            sourceUrl: item.sourceUrl,
            summary: item.summary
          });
          const baseDisplay =
            obsidianGraphKoreanTitle && hintTitle && isGenericKoreanHeadline(displayTitle)
              ? `${themeLabelKo(themeCanonical)} · ${hintTitle}`
              : displayTitle;
          const finalTitle =
            obsidianGraphKoreanTitle && actionHint && !String(baseDisplay).includes(actionHint)
              ? `${baseDisplay} · ${actionHint}`
              : baseDisplay;
          const keywords = extractKeywords({ ...item, title: rawTitle });
          const mergeKey = mergeKeyFromItem({ ...item, displayTitle: finalTitle, title: rawTitle }, index);
          const previous = previousByKey.get(mergeKey);
          const themeSlug = slugifyFileName(theme, "general-market-intel");
          let notePath = "";
          const previousNoteName = noteNameFromPath(previous?.path || "");
          const shouldRenameNoisyLegacyPath =
            Boolean(previous?.path) &&
            obsidianGraphFriendlyFilenameEnabled &&
            (obsidianGraphRebuildFilenames ||
              (obsidianGraphRenameLegacyNoisyFilenames && looksNoisyNoteName(previousNoteName)));
          if (previous?.path && !shouldRenameNoisyLegacyPath) {
            notePath = previous.path;
          } else {
            const baseStem = obsidianGraphFriendlyFilenameEnabled
              ? buildFriendlyGraphNoteStem({
                  finalTitle,
                  rawTitle,
                  themeLabel: theme,
                  themeCanonical,
                  sourceUrl: item.sourceUrl,
                  mergeKey,
                  keywords
                })
              : `${slugifyFileName(finalTitle, `insight-${index}`).slice(0, 56)}-${slugifyFileName(
                  String(item?.pageId || item?.sourceUrl || mergeKey).slice(-32),
                  `i${index}`
                ).slice(0, 12)}`;
            notePath = allocateUniqueNotePath({
              itemDir: obsidianGraphItemDir,
              themeSlug,
              baseStem,
              usedNotePaths
            });
            if (shouldRenameNoisyLegacyPath) report.obsidian.graphFriendlyRenamed += 1;
          }
          usedNotePaths.add(notePath);
          const noteName = noteNameFromPath(notePath);
          const themeHub = ensureThemeHub(theme);
          const themeHubPath = themeHub.themeHubPath;
          const themeHubName = themeHub.themeHubName;
          preparedCurrent.push({
            ...item,
            mergeKey,
            generatedAt: report.generatedAt,
            updatedAt: report.generatedAt,
            title: rawTitle,
            displayTitle: finalTitle,
            summary: sanitizeNotebookSummary(String(item?.summary || "")),
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
          let manifestOrder = 1;
          for (const row of previousManifestEntries) {
            const baseKey = normalizeManifestMergeKey(row, manifestOrder);
            const hasIdentity = Boolean(String(row?.sourceUrl || "").trim() || String(row?.title || "").trim() || String(row?.pageId || "").trim());
            if (!baseKey || !hasIdentity || !row?.path) continue;
            const summarySanitized = sanitizeNotebookSummary(String(row?.summary || "").trim());
            if (obsidianGraphDropInvalid && isInvalidNotebookSummaryPlaceholder(summarySanitized)) {
              report.obsidian.graphInvalidDroppedFromAccumulated += 1;
              continue;
            }
            const canonical = themeCanonicalFromAny(row?.themeCanonical || row?.theme);
            const themeLabel = themeDisplayLabel(canonical, obsidianGraphKoreanTitle);
            const notePath = row.path;
            const themeHub = ensureThemeHub(themeLabel);
            const keywordNormalized = extractKeywords({
              title: row.title || row.displayTitle || "",
              summary: summarySanitized || row.summary || "",
              sourceUrl: row.sourceUrl || ""
            });
            accumulatedMap.set(baseKey, {
              mergeKey: baseKey,
              pageId: row.pageId || "",
              title: row.title || row.displayTitle || noteNameFromPath(notePath),
              displayTitle: row.displayTitle || row.title || noteNameFromPath(notePath),
              status: "승인",
              category: row.category || "시장 인텔",
              priority: row.priority || "P2",
              summary: summarySanitized || "",
              sourceUrl: row.sourceUrl || "",
              sourceRef: row.sourceRef || "",
              sourceType: row.sourceType || "notebooklm_json",
              keywords: keywordNormalized.length > 0 ? keywordNormalized : Array.isArray(row.keywords) ? row.keywords : [],
              themeCanonical: canonical,
              theme: themeLabel,
              notePath,
              noteName: noteNameFromPath(notePath),
              themeHubPath: themeHub.themeHubPath,
              themeHubName: themeHub.themeHubName,
              generatedAt: row.generatedAt || report.generatedAt,
              updatedAt: row.updatedAt || row.generatedAt || "1970-01-01T00:00:00.000Z"
            });
            manifestOrder += 1;
          }
          for (const row of preparedCurrent) accumulatedMap.set(row.mergeKey, row);
          const accumulateCap = obsidianGraphRebuildFilenames
            ? Number.MAX_SAFE_INTEGER
            : Math.max(1, obsidianGraphAccumulateMax);
          prepared = [...accumulatedMap.values()]
            .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
            .slice(0, accumulateCap);
        }
        if (obsidianGraphFriendlyFilenameEnabled && obsidianGraphRenameLegacyNoisyFilenames && prepared.length > 0) {
          const normalized = [];
          const usedPreparedPaths = new Set();
          let renamedCount = 0;
          let order = 1;
          for (const row of prepared) {
            const canonical = themeCanonicalFromAny(row?.themeCanonical || row?.theme);
            const themeLabel = themeDisplayLabel(canonical, obsidianGraphKoreanTitle);
            const themeHub = ensureThemeHub(themeLabel);
            const mergeKey = String(row?.mergeKey || "").trim() || mergeKeyFromItem(row, order);
            const sourceUrl = String(row?.sourceUrl || "").trim();
            const rawTitle = String(row?.title || row?.displayTitle || "").trim();
            const finalTitle = String(row?.displayTitle || row?.title || "").trim();
            let notePath = String(row?.notePath || "").trim();
            const noteName = noteNameFromPath(notePath);
            const needsRename =
              obsidianGraphRebuildFilenames ||
              !notePath ||
              (obsidianGraphRenameLegacyNoisyFilenames && looksNoisyNoteName(noteName));
            if (needsRename) {
              const themeSlug = slugifyFileName(themeLabel, "general-market-intel");
              const baseStem = buildFriendlyGraphNoteStem({
                finalTitle,
                rawTitle,
                themeLabel,
                themeCanonical: canonical,
                sourceUrl,
                mergeKey,
                keywords: row?.keywords
              });
              const nextPath = allocateUniqueNotePath({
                itemDir: obsidianGraphItemDir,
                themeSlug,
                baseStem,
                usedNotePaths: usedPreparedPaths
              });
              if (nextPath !== notePath) renamedCount += 1;
              notePath = nextPath;
            } else if (usedPreparedPaths.has(notePath)) {
              const themeSlug = slugifyFileName(themeLabel, "general-market-intel");
              const baseStem = slugifyFileName(noteName || finalTitle || rawTitle || `insight-${order}`, `insight-${order}`);
              notePath = allocateUniqueNotePath({
                itemDir: obsidianGraphItemDir,
                themeSlug,
                baseStem,
                usedNotePaths: usedPreparedPaths
              });
            }
            usedPreparedPaths.add(notePath);
            normalized.push({
              ...row,
              mergeKey,
              themeCanonical: canonical,
              theme: themeLabel,
              notePath,
              noteName: noteNameFromPath(notePath),
              themeHubPath: themeHub.themeHubPath,
              themeHubName: themeHub.themeHubName
            });
            order += 1;
          }
          prepared = normalized;
          report.obsidian.graphFriendlyRenamed += renamedCount;
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
          if (!themeHubMap.has(item.theme)) ensureThemeHub(item.theme);
          if (!preparedByTheme.has(item.theme)) preparedByTheme.set(item.theme, []);
          preparedByTheme.get(item.theme).push(item);
        }
        const themeKeywordSets = new Map();
        for (const [theme, rows] of preparedByTheme.entries()) {
          const set = new Set();
          for (const row of rows) for (const keyword of row.keywords || []) set.add(keyword);
          themeKeywordSets.set(theme, set);
        }
        const themeRelations = new Map();
        for (const theme of themeHubMap.keys()) themeRelations.set(theme, []);
        if (obsidianGraphThemeCrosslinkEnabled) {
          const themes = [...preparedByTheme.keys()];
          for (let i = 0; i < themes.length; i += 1) {
            for (let j = i + 1; j < themes.length; j += 1) {
              const themeA = themes[i];
              const themeB = themes[j];
              const setA = themeKeywordSets.get(themeA) || new Set();
              const setB = themeKeywordSets.get(themeB) || new Set();
              const overlap = [...setA].filter((x) => setB.has(x)).slice(0, 4);
              if (overlap.length === 0) continue;
              themeRelations.get(themeA).push({ targetTheme: themeB, keywords: overlap, score: overlap.length });
              themeRelations.get(themeB).push({ targetTheme: themeA, keywords: overlap, score: overlap.length });
            }
          }
          for (const [theme, rows] of themeRelations.entries()) {
            rows.sort((a, b) => b.score - a.score || a.targetTheme.localeCompare(b.targetTheme));
            themeRelations.set(theme, rows.slice(0, 4));
          }
        }
        if (obsidianGraphStaleCleanup) {
          const themeHubPaths = [...themeHubMap.values()].map((x) => x.themeHubPath);
          const staleThemeResult = await cleanupObsidianThemeHubPaths({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            themesDir: `${obsidianGraphItemDir.replace(/\/+$/, "")}/_themes`,
            currentPaths: themeHubPaths
          });
          report.obsidian.graphStaleThemeScanned = staleThemeResult.scanned;
          report.obsidian.graphStaleThemeDeleted = staleThemeResult.deleted;
          report.obsidian.graphStaleThemeMissing = staleThemeResult.missing;
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
            relatedLinks: scored,
            includeGraphHubRef: obsidianGraphHubEnabled,
            includeCoreDocs: obsidianGraphCoreDocsEnabled
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
        for (const [theme, themeHub] of themeHubMap.entries()) {
          const rows = preparedByTheme.get(theme) || [];
          const relatedThemeLinks = (themeRelations.get(theme) || [])
            .map((row) => ({
              noteName: themeHubMap.get(row.targetTheme)?.themeHubName || row.targetTheme,
              keywords: row.keywords
            }))
            .filter((row) => !!row.noteName);
          const themeMarkdown = markdownThemeHub({
            generatedAt: report.generatedAt,
            theme,
            items: rows,
            hubLink,
            packLink,
            playbookLink,
            includeHubLink: obsidianGraphThemeHubLinkHub,
            relatedThemeLinks,
            includeGraphHubRef: obsidianGraphHubEnabled,
            includeCoreDocs: obsidianGraphCoreDocsEnabled
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
        if (obsidianGraphHubEnabled) {
          const hubMarkdown = markdownGraphHub({
            generatedAt: report.generatedAt,
            sourceMode,
            items: prepared,
            packLink,
            playbookLink,
            linkThemeNodes: obsidianGraphHubLinkThemes,
            includeCoreDocs: obsidianGraphCoreDocsEnabled
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
        } else {
          await obsidianDeleteIfExists({
            baseUrl: obsidianBaseUrl,
            apiKey: obsidianApiKey,
            route: `/vault/${encodeVaultPath(obsidianGraphHubPath)}`
          });
        }
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
        report.obsidian.graphUploadedHub = obsidianGraphHubEnabled;
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
      const errMsg = error?.message || String(error);
      const isConnectionError = /EPERM|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH/.test(errMsg);
      report.obsidian.status = "fail";
      report.obsidian.reason = errMsg;

      // ── Filesystem fallback: save to local vault-sync directory ──
      // When Obsidian REST API is unreachable, write files locally so they can
      // be synced to the vault via Git/iCloud/Google Drive.
      if (isConnectionError && queueItems.length > 0) {
        const fallbackDir = path.join(CWD, "state", "obsidian-vault-sync");
        try {
          fs.mkdirSync(path.join(fallbackDir, "99_Automation", "NotebookLM", "Intake"), { recursive: true });
          // Write the queue markdown
          const queueContent = fs.readFileSync(OBSIDIAN_QUEUE_MD_PATH, "utf8");
          fs.writeFileSync(
            path.join(fallbackDir, "99_Automation", "Knowledge Approved Queue.md"),
            queueContent,
            "utf8"
          );
          // Write individual note files for each queue item
          const hubLink = noteNameFromPath(obsidianGraphHubPath);
          const packLink = obsidianGraphCoreDocsEnabled ? noteNameFromPath(obsidianGraphPackNote) : "";
          const playbookLink = obsidianGraphCoreDocsEnabled ? noteNameFromPath(obsidianGraphPlaybookNote) : "";
          for (const item of queueItems) {
            const themeCanonical = themeCanonicalFromAny(item.themeCanonical || item.theme);
            const themeLabel = themeDisplayLabel(themeCanonical, obsidianGraphKoreanTitle);
            const themeHubPath = themeHubPathFromLabel(obsidianGraphItemDir, themeLabel);
            const themeHubName = noteNameFromPath(themeHubPath);
            const markdown = markdownGraphItem({
              generatedAt: report.generatedAt,
              item: { ...item, themeCanonical, theme: themeLabel, themeHubName },
              hubLink,
              packLink,
              playbookLink,
              themeHubLink: themeHubName,
              relatedLinks: [],
              includeGraphHubRef: obsidianGraphHubEnabled,
              includeCoreDocs: obsidianGraphCoreDocsEnabled
            });
            const notePath = item.notePath || `99_Automation/NotebookLM/Intake/${slugifyFileName(item.title || item.pageId, "insight")}.md`;
            fs.mkdirSync(path.dirname(path.join(fallbackDir, notePath)), { recursive: true });
            fs.writeFileSync(path.join(fallbackDir, notePath), markdown, "utf8");
          }
          report.obsidian.fallback = "filesystem_sync";
          report.obsidian.fallbackDir = path.relative(CWD, fallbackDir);
          report.obsidian.fallbackItems = queueItems.length;
          console.log(
            `[KNOWLEDGE_PIPELINE][OBSIDIAN_FALLBACK] REST API unreachable → wrote ${queueItems.length} items to ${path.relative(CWD, fallbackDir)}`
          );
        } catch (fallbackError) {
          console.error(`[KNOWLEDGE_PIPELINE][OBSIDIAN_FALLBACK] filesystem write also failed: ${fallbackError?.message || fallbackError}`);
          report.obsidian.fallback = "filesystem_fail";
        }
      }
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  if (report.obsidian.status === "fail" || report.notion.status === "fail") {
    report.status = "fail";
  } else if (report.handoff.enabled && report.handoff.required && !report.handoff.gateAllowed) {
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
    `[KNOWLEDGE_PIPELINE] source=${sourceMode} notebooklm=${report.source.notebooklmStatus}/${report.source.notebooklmLoaded} collect=${report.source.notebooklmCollectStatus} zeroCode=${report.source.notebooklmZeroReasonCode} handoff=${report.handoff.status} handoffGate=${report.handoff.gateAllowed} notion=${report.notion.status} approved=${report.notion.approved} transitioned=${report.notion.transitioned} apply=${apply} obsidian=${report.obsidian.status} obsidianApply=${obsidianApply} queue=${path.relative(
      CWD,
      QUEUE_MD_PATH
    )} obsidianQueue=${path.relative(CWD, OBSIDIAN_QUEUE_MD_PATH)} report=${path.relative(CWD, REPORT_PATH)}`
  );

  if (report.notion.status === "fail" && required) {
    process.exit(1);
  }
  if (["notebooklm_json", "hybrid"].includes(sourceMode) && report.source.notebooklmStatus.startsWith("fail") && notebooklmRequired) {
    console.error(
      `[KNOWLEDGE_PIPELINE][EXIT] notebooklm required + source fail (${report.source.notebooklmStatus}:${report.source.notebooklmReason || "n/a"}) code=${report.source.notebooklmZeroReasonCode}`
    );
    process.exit(1);
  }
  if (sourceMode === "notebooklm_json" && queueItems.length === 0 && notebooklmRequired) {
    console.error(
      `[KNOWLEDGE_PIPELINE][EXIT] notebooklm required + queue empty (status=${report.source.notebooklmStatus}, reason=${report.source.notebooklmReason || "n/a"}, collect=${report.source.notebooklmCollectStatus}/${report.source.notebooklmCollectReason || "n/a"}, code=${report.source.notebooklmZeroReasonCode})`
    );
    process.exit(1);
  }
  if (report.obsidian.status === "fail" && obsidianRequired) {
    process.exit(1);
  }
  if (report.handoff.enabled && report.handoff.required && !report.handoff.gateAllowed) {
    console.error(
      `[KNOWLEDGE_PIPELINE][EXIT] handoff gate blocked (status=${report.handoff.status}, reason=${report.handoff.reason || "n/a"}, requirePass=${report.handoff.requirePass})`
    );
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[KNOWLEDGE_PIPELINE] fail: ${error?.message || error}`);
  process.exit(1);
});
