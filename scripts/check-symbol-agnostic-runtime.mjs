import fs from "node:fs";
import path from "node:path";

const ROOTS = ["automate.js", "components", "scripts", ".github/workflows"];
const DEFAULT_PROOF_SYMBOLS = ["BZ", "QFIN", "ACAD", "TSLA", "JHG", "INVA", "CPRX", "SPG", "AUPH", "INCY"];
const SELF = path.normalize("scripts/check-symbol-agnostic-runtime.mjs");
const TEXT_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".yml", ".yaml"]);
const UI_ONLY_ALLOWLIST = new Map([
  [
    path.normalize("components/MarketTicker.tsx"),
    "ui_market_ticker_display_only_not_analysis_selection"
  ]
]);

const forbiddenSymbols = String(process.env.SYMBOL_AGNOSTIC_FORBIDDEN_SYMBOLS || DEFAULT_PROOF_SYMBOLS.join(","))
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const symbolRegex = forbiddenSymbols.length
  ? new RegExp(`\\b(${forbiddenSymbols.map(escapeRegex).join("|")})\\b`, "g")
  : null;

const walk = (target) => {
  if (!fs.existsSync(target)) return [];
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

const checkedFiles = [];
const allowedFindings = [];
const findings = [];

if (symbolRegex) {
  for (const root of ROOTS) {
    for (const filePath of walk(root)) {
      const normalized = path.normalize(filePath);
      if (normalized === SELF) continue;
      if (!TEXT_EXTENSIONS.has(path.extname(filePath))) continue;
      checkedFiles.push(normalized);
      const text = fs.readFileSync(filePath, "utf8");
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        symbolRegex.lastIndex = 0;
        const matches = [...lines[index].matchAll(symbolRegex)].map((match) => match[1]);
        if (!matches.length) continue;
        const row = {
          filePath: normalized,
          line: index + 1,
          symbols: [...new Set(matches)],
          text: lines[index].trim().slice(0, 240)
        };
        const allowReason = UI_ONLY_ALLOWLIST.get(normalized);
        if (allowReason) allowedFindings.push({ ...row, allowReason });
        else findings.push(row);
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  overall: findings.length === 0 ? "pass" : "fail",
  scope: "analysis_runtime_code_and_workflows_docs_and_testdata_excluded",
  forbiddenSymbols,
  checkedRoots: ROOTS,
  checkedFileCount: checkedFiles.length,
  allowedFindings,
  findings,
  invariant:
    "Stage and automation decisions must be driven by generated Stage artifacts and data, not by current proof/sample symbols"
};

fs.mkdirSync("state", { recursive: true });
fs.writeFileSync("state/symbol-agnostic-runtime-check.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
const md = [
  "## Symbol-Agnostic Runtime Check",
  `- generatedAt: \`${report.generatedAt}\``,
  `- overall: \`${report.overall.toUpperCase()}\``,
  `- scope: \`${report.scope}\``,
  `- forbiddenSymbols: \`${forbiddenSymbols.join(",") || "N/A"}\``,
  `- checkedFiles: \`${checkedFiles.length}\``,
  `- allowedFindings: \`${allowedFindings.length}\``,
  `- findings: \`${findings.length}\``,
  "- invariant: runtime must not hard-code current proof/sample symbols; UI-only display constants are allowed when not used for analysis selection.",
  ...allowedFindings.map(
    (row) => `  - allowed ${row.filePath}:${row.line} symbols=${row.symbols.join(",")} reason=${row.allowReason}`
  ),
  ...findings.map((row) => `  - finding ${row.filePath}:${row.line} symbols=${row.symbols.join(",")} text=${row.text}`),
  ""
].join("\n");
fs.writeFileSync("state/symbol-agnostic-runtime-check.md", `${md}\n`, "utf8");
console.log(
  `[SYMBOL_AGNOSTIC_RUNTIME_CHECK] overall=${report.overall} findings=${findings.length} allowed=${allowedFindings.length}`
);
if (findings.length) process.exitCode = 1;
