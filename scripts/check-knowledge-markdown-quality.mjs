import fs from "node:fs";
import path from "node:path";

const CWD = process.cwd();
const STATE_DIR = path.join(CWD, "state");
const INTAKE_PATH = path.join(STATE_DIR, "notebooklm-intake.json");
const QUEUE_OBSIDIAN_PATH = path.join(STATE_DIR, "knowledge-approved-queue-obsidian.md");
const OUTPUT_JSON = path.join(STATE_DIR, "knowledge-markdown-quality-report.json");
const OUTPUT_MD = path.join(STATE_DIR, "knowledge-markdown-quality-report.md");

const toBool = (v, d = false) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return d;
  return ["1", "true", "yes", "on"].includes(s);
};

const safeReadJson = (filePath, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
};

const safeReadText = (filePath) => {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
};

const strip = (v) => String(v || "").trim();

const detectConsecutiveDuplicateHeaders = (text) => {
  const lines = String(text || "").split(/\r?\n/);
  let dup = 0;
  let prevHeader = "";
  for (const line of lines) {
    const m = String(line || "").trim().match(/^##\s+(.+)$/);
    if (!m) {
      if (String(line || "").trim()) prevHeader = "";
      continue;
    }
    const cur = m[1].trim().toLowerCase();
    if (prevHeader && prevHeader === cur) dup += 1;
    prevHeader = cur;
  }
  return dup;
};

const detectLooseTableBlocks = (text) => {
  const blocks = String(text || "")
    .split(/\n\s*\n/)
    .map((x) => x.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((x) => x.length > 0);
  let hits = 0;
  for (const lines of blocks) {
    if (lines.length < 9) continue;
    if (lines.some((line) => line.includes("|"))) continue;
    const head = lines.slice(0, 3).join(" ").toLowerCase();
    const headerHint = /(지표|metrics|현재\s*수치|상태|함의|implication|항목|value)/.test(head);
    if (!headerHint) continue;
    if ((lines.length - 3) % 3 !== 0) continue;
    hits += 1;
  }
  return hits;
};

const buildSummaryChecks = (text) => {
  const citationTail = (text.match(/(?<=[가-힣A-Za-z])\s+\d{1,2}(?=\s*(?:[.!?…])?\s*$)/gm) || []).length;
  const badDivider = (text.match(/^###\s*-\s*$/gm) || []).length;
  const inlineLabelBullet = (text.match(/^[-*]\s*\[[^\]]{2,80}\]\s+\S+/gm) || []).length;
  const duplicateH2Consecutive = detectConsecutiveDuplicateHeaders(text);
  const looseTable = detectLooseTableBlocks(text);
  return {
    citationTail,
    badDivider,
    inlineLabelBullet,
    duplicateH2Consecutive,
    looseTable
  };
};

const mergeChecks = (acc, add) => {
  for (const [k, v] of Object.entries(add)) acc[k] = (acc[k] || 0) + Number(v || 0);
};

const main = () => {
  const required = toBool(process.env.KNOWLEDGE_MARKDOWN_QUALITY_REQUIRED, false);
  const intake = safeReadJson(INTAKE_PATH, { items: [] });
  const intakeItems = Array.isArray(intake?.items) ? intake.items : [];
  const queueText = safeReadText(QUEUE_OBSIDIAN_PATH);

  const aggregate = {
    citationTail: 0,
    badDivider: 0,
    inlineLabelBullet: 0,
    duplicateH2Consecutive: 0,
    looseTable: 0
  };

  const samples = [];

  intakeItems.slice(0, 80).forEach((item, idx) => {
    const summary = String(item?.summary || "");
    if (!strip(summary)) return;
    const checks = buildSummaryChecks(summary);
    mergeChecks(aggregate, checks);
    const issueCount = Object.values(checks).reduce((a, b) => a + Number(b || 0), 0);
    if (issueCount > 0 && samples.length < 12) {
      samples.push({
        index: idx,
        title: strip(item?.title || `item_${idx}`),
        checks
      });
    }
  });

  const queueChecks = buildSummaryChecks(queueText);
  mergeChecks(aggregate, queueChecks);

  const totalIssues = Object.values(aggregate).reduce((a, b) => a + Number(b || 0), 0);
  const status = totalIssues > 0 ? "warn" : "pass";

  const report = {
    generatedAt: new Date().toISOString(),
    status,
    required,
    intakePath: path.relative(CWD, INTAKE_PATH),
    queuePath: path.relative(CWD, QUEUE_OBSIDIAN_PATH),
    intakeItems: intakeItems.length,
    totals: aggregate,
    queueChecks,
    samples
  };

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const md = [];
  md.push("## Knowledge Markdown Quality Report");
  md.push(`- generatedAt: \`${report.generatedAt}\``);
  md.push(`- status: \`${status.toUpperCase()}\``);
  md.push(`- intakeItems: \`${report.intakeItems}\``);
  md.push(`- required: \`${required}\``);
  md.push("");
  md.push("### Totals");
  Object.entries(aggregate).forEach(([k, v]) => md.push(`- ${k}: \`${v}\``));
  md.push("");
  if (samples.length > 0) {
    md.push("### Sample Issues");
    samples.forEach((row) => {
      md.push(`- [${row.index}] ${row.title}`);
      Object.entries(row.checks)
        .filter(([, v]) => Number(v || 0) > 0)
        .forEach(([k, v]) => md.push(`  - ${k}: ${v}`));
    });
    md.push("");
  }
  md.push("### Queue File Checks");
  Object.entries(queueChecks).forEach(([k, v]) => md.push(`- ${k}: \`${v}\``));
  fs.writeFileSync(OUTPUT_MD, `${md.join("\n")}\n`, "utf8");

  console.log(
    `[KNOWLEDGE_MD_QUALITY] status=${status} citationTail=${aggregate.citationTail} badDivider=${aggregate.badDivider} inlineLabel=${aggregate.inlineLabelBullet} dupH2=${aggregate.duplicateH2Consecutive} looseTable=${aggregate.looseTable}`
  );

  if (required && status !== "pass") {
    process.exit(1);
  }
};

main();
