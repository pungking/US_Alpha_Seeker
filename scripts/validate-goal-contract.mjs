import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const goalPath = path.join(repoRoot, "goal", "goal.yaml");
const schemaPath = path.join(repoRoot, "schemas", "goal_status.schema.json");
const templatePath = path.join(repoRoot, "goal", "goal_status.template.json");

const requiredGoalKeys = [
  "goal_id",
  "goal_version",
  "north_star",
  "operational_goal",
  "constraints",
  "done_when",
  "owners",
  "status_contract"
];

const forbiddenDefaultPatterns = [
  /^\s*EXEC_ENABLED\s*[:=]\s*true\b/im,
  /^\s*READ_ONLY\s*[:=]\s*false\b/im,
  /^\s*MARKET_GUARD_MODE\s*[:=]\s*execute\b/im,
  /^\s*FORCE_SEND_ONCE\s*[:=]\s*true\b/im,
  /^\s*GUARD_EXECUTE_TIGHTEN_STOPS\s*[:=]\s*true\b/im,
  /^\s*GUARD_EXECUTE_REDUCE_POSITIONS\s*[:=]\s*true\b/im,
  /^\s*GUARD_EXECUTE_FLATTEN\s*[:=]\s*true\b/im
];

const readText = (filePath) => fs.readFileSync(filePath, "utf8");
const mustExist = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${path.relative(repoRoot, filePath)}`);
  }
};

for (const filePath of [goalPath, schemaPath, templatePath]) {
  mustExist(filePath);
}

const goalText = readText(goalPath);
for (const key of requiredGoalKeys) {
  const keyPattern = new RegExp(`^${key}:`, "m");
  if (!keyPattern.test(goalText)) {
    throw new Error(`goal/goal.yaml is missing top-level key: ${key}`);
  }
}

for (const pattern of forbiddenDefaultPatterns) {
  if (pattern.test(goalText)) {
    throw new Error(`goal/goal.yaml contains unsafe execution default: ${pattern}`);
  }
}

const goalHash = crypto.createHash("sha256").update(goalText).digest("hex");
const schema = JSON.parse(readText(schemaPath));
const template = JSON.parse(readText(templatePath));

for (const field of schema.required || []) {
  if (!(field in template)) {
    throw new Error(`goal_status.template.json is missing required field: ${field}`);
  }
}

if (template.goal_id !== "us-alpha-seeker-e2e-paper-loop") {
  throw new Error("goal_status.template.json goal_id does not match goal/goal.yaml contract");
}

const expectedGoalHash = `sha256:${goalHash}`;
if (template.goal_hash !== expectedGoalHash) {
  throw new Error(
    `goal_status.template.json goal_hash is stale: expected ${expectedGoalHash}, got ${template.goal_hash}`
  );
}

console.log(JSON.stringify({
  status: "PASS",
  goalPath: "goal/goal.yaml",
  goalHash: `sha256:${goalHash}`,
  schemaPath: "schemas/goal_status.schema.json",
  templatePath: "goal/goal_status.template.json"
}, null, 2));
