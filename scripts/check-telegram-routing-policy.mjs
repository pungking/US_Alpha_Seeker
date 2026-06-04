#!/usr/bin/env node
import fs from 'node:fs';

const checks = [];
const add = (id, status, detail) => checks.push({ id, status, detail });
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

const deadlineGuard = read('.github/workflows/auto-scheduler-deadline-guard.yml');
add(
  'deadline_guard_uses_simulation_or_alert_not_primary',
  deadlineGuard && !/TELEGRAM_CHAT_ID/.test(deadlineGuard) && /TELEGRAM_SIMULATION_CHAT_ID/.test(deadlineGuard) && /TELEGRAM_ALERT_CHAT_ID/.test(deadlineGuard) ? 'PASS' : 'FAIL',
  'Deadline guard is monitoring/recovery; it must not send to primary analysis chat.'
);

const mcpSmoke = read('scripts/mcp-smoke.mjs');
add(
  'mcp_smoke_no_primary_fallback',
  mcpSmoke && !/TELEGRAM_SIMULATION_CHAT_ID\s*\|\|\s*envMap\.TELEGRAM_CHAT_ID/.test(mcpSmoke) && !/TELEGRAM_ALERT_CHAT_ID\s*\|\|\s*envMap\.TELEGRAM_SIMULATION_CHAT_ID\s*\|\|\s*envMap\.TELEGRAM_CHAT_ID/.test(mcpSmoke) ? 'PASS' : 'FAIL',
  'Smoke/test notifications must use simulation channel, with alerts using alert then simulation only.'
);

const telegramService = read('services/telegramService.ts');
add(
  'telegram_service_simulation_no_primary_fallback',
  telegramService && !/SIMULATION_CHAT_ID\s*\|\|\s*TELEGRAM_CONFIG\.CHAT_ID/.test(telegramService) ? 'PASS' : 'FAIL',
  'Simulation reports must skip when simulation chat is missing instead of falling back to primary.'
);
add(
  'telegram_service_alert_no_primary_fallback',
  telegramService && !/ALERT_CHAT_ID[\s\S]{0,120}TELEGRAM_CONFIG\.CHAT_ID/.test(telegramService) ? 'PASS' : 'FAIL',
  'Alert reports may fall back to simulation, but never to primary.'
);

const approvalGateway = read('services/approvalGatewayService.ts');
add(
  'approval_gateway_no_primary_admin_fallback',
  approvalGateway && !/TELEGRAM_ADMIN_CHAT_ID[\s\S]{0,80}TELEGRAM_CHAT_ID/.test(approvalGateway) ? 'PASS' : 'FAIL',
  'Approval/admin webhook access must be configured explicitly, not inferred from the primary analysis chat.'
);

const schedule = read('.github/workflows/schedule.yml');
add(
  'schedule_primary_allowed_for_analysis_result',
  schedule && /TELEGRAM_CHAT_ID/.test(schedule) && /VITE_TELEGRAM_CHAT_ID/.test(schedule) ? 'PASS' : 'WARN',
  'Primary Telegram channel is allowed only for canonical web-app analysis result workflow.'
);

const fail = checks.filter((check) => check.status === 'FAIL').length;
const warn = checks.filter((check) => check.status === 'WARN').length;
const report = {
  generatedAt: new Date().toISOString(),
  overall: fail ? 'fail' : warn ? 'warn' : 'pass',
  policy: 'primary_analysis_only_simulation_for_monitoring_alert_for_errors',
  checks
};
fs.mkdirSync('state', { recursive: true });
fs.writeFileSync('state/telegram-routing-policy-audit.json', `${JSON.stringify(report, null, 2)}\n`);
const md = [
  '# Telegram Routing Policy Audit',
  '',
  `- overall: **${report.overall}**`,
  `- policy: ${report.policy}`,
  '',
  '| Check | Status | Detail |',
  '| --- | --- | --- |',
  ...checks.map((check) => `| ${check.id} | ${check.status} | ${check.detail} |`)
];
fs.writeFileSync('state/telegram-routing-policy-audit.md', `${md.join('\n')}\n`);
console.log(`[TELEGRAM_ROUTING_AUDIT] overall=${report.overall} checks=${checks.length} json=state/telegram-routing-policy-audit.json`);
if (fail) process.exit(1);
