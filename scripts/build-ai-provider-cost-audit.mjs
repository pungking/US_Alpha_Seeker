import fs from "node:fs";
import path from "node:path";

const ROOTS = ["constants.ts", "services", "components"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs"]);
const ALLOWED_SONAR_PRO_LINES = [
  {
    filePath: path.normalize("constants.ts"),
    includes: "['sonar', 'sonar-pro']",
    reason: "fallback_model_chain_not_default"
  },
  {
    filePath: path.normalize("constants.ts"),
    includes: "`sonar-pro` remains a fallback",
    reason: "comment_documents_fallback"
  }
];

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

const isAllowedSonarProLine = (filePath, text) =>
  ALLOWED_SONAR_PRO_LINES.find((rule) => rule.filePath === path.normalize(filePath) && text.includes(rule.includes));

const hardcodedSonarProFindings = [];
const modelLiteralFindings = [];
const checkedFiles = [];

for (const root of ROOTS) {
  for (const filePath of walk(root)) {
    if (!TEXT_EXTENSIONS.has(path.extname(filePath))) continue;
    const normalized = path.normalize(filePath);
    checkedFiles.push(normalized);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes("sonar-pro")) {
        const allowRule = isAllowedSonarProLine(normalized, line);
        if (!allowRule) {
          hardcodedSonarProFindings.push({
            filePath: normalized,
            line: index + 1,
            text: line.trim().slice(0, 240)
          });
        }
      }
      if (/model\s*:\s*['"]sonar(?:-pro)?['"]/.test(line)) {
        modelLiteralFindings.push({
          filePath: normalized,
          line: index + 1,
          text: line.trim().slice(0, 240)
        });
      }
    });
  }
}

const constantsText = fs.readFileSync("constants.ts", "utf8");
const stage2FallbackDefaultDisabled = /STAGE2_FULL_FALLBACK_ENABLED:\s*parseBooleanEnv\([^)]*,\s*false\)/.test(
  constantsText
);
const modelChainDefaultSonarFirst = /\['sonar',\s*'sonar-pro'\]/.test(constantsText);
const stage2ShardDefault = Number(
  constantsText.match(/STAGE2_SHARD_SIZE:[^\n]*,\s*(\d+)\)\)\)/)?.[1] || NaN
);
const stage2MaxTokens = Number(
  constantsText.match(/STAGE2_MAX_TOKENS:[^\n]*,\s*(\d+)\)\)/)?.[1] || NaN
);
const tokenWarnThreshold = Number(
  constantsText.match(/TOKEN_WARN_THRESHOLD:[^\n]*,\s*(\d+)\)\)/)?.[1] || NaN
);

const findings = [];
if (hardcodedSonarProFindings.length > 0) findings.push("runtime_sonar_pro_hardcode");
if (modelLiteralFindings.length > 0) findings.push("runtime_sonar_model_literal");
if (!stage2FallbackDefaultDisabled) findings.push("stage2_full_fallback_default_not_disabled");
if (!modelChainDefaultSonarFirst) findings.push("model_chain_default_not_sonar_first");
if (!Number.isFinite(stage2ShardDefault) || stage2ShardDefault > 4) findings.push("stage2_shard_default_too_large");
if (!Number.isFinite(stage2MaxTokens) || stage2MaxTokens > 2200) findings.push("stage2_max_tokens_default_too_high");
if (!Number.isFinite(tokenWarnThreshold) || tokenWarnThreshold > 12000) findings.push("token_warn_threshold_default_too_high");

const report = {
  generatedAt: new Date().toISOString(),
  overall: findings.length === 0 ? "pass" : "fail",
  invariant:
    "Perplexity Sonar must stay cost-bounded: no runtime sonar-pro hardcode, no unguarded full-candidate fallback, and token-budget warnings enabled.",
  checkedRoots: ROOTS,
  checkedFileCount: checkedFiles.length,
  defaults: {
    modelChainDefaultSonarFirst,
    stage2FallbackDefaultDisabled,
    stage2ShardDefault,
    stage2MaxTokens,
    tokenWarnThreshold
  },
  findings,
  hardcodedSonarProFindings,
  modelLiteralFindings,
  allowedSonarProFallbacks: ALLOWED_SONAR_PRO_LINES
};

fs.mkdirSync("state", { recursive: true });
fs.writeFileSync("state/ai-provider-cost-audit.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");

const md = [
  "## AI Provider Cost Audit",
  `- generatedAt: \`${report.generatedAt}\``,
  `- overall: \`${report.overall.toUpperCase()}\``,
  `- checkedFiles: \`${checkedFiles.length}\``,
  `- modelChainDefaultSonarFirst: \`${modelChainDefaultSonarFirst}\``,
  `- stage2FallbackDefaultDisabled: \`${stage2FallbackDefaultDisabled}\``,
  `- stage2ShardDefault: \`${Number.isFinite(stage2ShardDefault) ? stage2ShardDefault : "N/A"}\``,
  `- stage2MaxTokens: \`${Number.isFinite(stage2MaxTokens) ? stage2MaxTokens : "N/A"}\``,
  `- tokenWarnThreshold: \`${Number.isFinite(tokenWarnThreshold) ? tokenWarnThreshold : "N/A"}\``,
  `- hardcodedSonarProFindings: \`${hardcodedSonarProFindings.length}\``,
  `- modelLiteralFindings: \`${modelLiteralFindings.length}\``,
  `- findings: \`${findings.join(",") || "none"}\``,
  "- invariant: runtime must not hard-code Sonar Pro or trigger unbounded full-candidate fallback by default.",
  ...hardcodedSonarProFindings.map(
    (row) => `  - sonar-pro ${row.filePath}:${row.line} text=${row.text}`
  ),
  ...modelLiteralFindings.map((row) => `  - model literal ${row.filePath}:${row.line} text=${row.text}`),
  ""
].join("\n");

fs.writeFileSync("state/ai-provider-cost-audit.md", `${md}\n`, "utf8");
console.log(
  `[AI_PROVIDER_COST_AUDIT] overall=${report.overall} findings=${findings.length} hardcodedSonarPro=${hardcodedSonarProFindings.length}`
);
if (findings.length) process.exitCode = 1;
