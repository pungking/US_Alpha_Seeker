#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT_DIR = 'state/stage6-audit-source';
const DEFAULT_COVERAGE_AUDIT = 'state/stage6-earnings-coverage-audit.json';
const DEFAULT_OUT_JSON = 'state/stage6-earnings-lineage-trace.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_EARNINGS_LINEAGE_TRACE.md';

const STAGE6_GROUPS = [
  ['execution_contract', 'modelTop6'],
  ['execution_contract', 'watchlistTop'],
  ['execution_contract', 'executablePicks'],
  ['alpha_candidates'],
  ['candidates'],
  ['data'],
  ['audit_trail']
];

const CANONICAL_PATHS = [
  ['earningsDate'],
  ['earningsDaysToEvent'],
  ['earningsSource'],
  ['earningsRetrievedAt'],
  ['earningsDateSource'],
  ['earningsDaysToEventSource'],
  ['earningsCoverageStatus']
];

const STAGE4_EVENT_PATHS = [
  ['techMetrics', 'earningsDate'],
  ['techMetrics', 'daysToEarnings'],
  ['techMetrics', 'earningsSource'],
  ['techMetrics', 'earningsRetrievedAt'],
  ['techMetrics', 'eventRiskState'],
  ['techMetrics', 'eventDistanceBand'],
  ['techMetrics', 'eventRiskSource']
];

const VENDOR_SHADOW_PATHS = [
  ['alphaVantage', 'earningsDate'],
  ['alphaVantage', 'source'],
  ['alphaVantage', 'retrievedAt'],
  ['shadow', 'alphaVantage', 'earningsDate'],
  ['shadow', 'alphaVantage', 'source'],
  ['shadow', 'alphaVantage', 'retrievedAt']
];

function resolveRepoPath(filePath) {
  return path.resolve(REPO_ROOT, filePath);
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(resolveRepoPath(filePath)), { recursive: true });
}

function readJsonIfExists(filePath) {
  const resolved = resolveRepoPath(filePath);
  if (!fs.existsSync(resolved)) return null;
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function writeJson(filePath, payload) {
  ensureDir(filePath);
  atomicWriteText(resolveRepoPath(filePath), `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(filePath, text) {
  ensureDir(filePath);
  atomicWriteText(resolveRepoPath(filePath), text);
}

function atomicWriteText(resolvedPath, text) {
  const tmpPath = `${resolvedPath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, resolvedPath);
}

function textOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (['N/A', 'NA', 'NULL', 'UNDEFINED', 'TBD'].includes(text.toUpperCase())) return null;
  return text;
}

function normalizeSymbol(value) {
  return textOrNull(value)?.replace(/[^A-Za-z0-9.\-]/g, '').toUpperCase() || null;
}

function getByPath(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (current == null || typeof current !== 'object') return null;
    current = current[part];
  }
  return current ?? null;
}

function hasMeaningfulValue(value) {
  return textOrNull(value) != null || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
}

function pathHits(row, paths) {
  return paths.map((pathParts) => {
    const value = getByPath(row, pathParts);
    return {
      path: pathParts.join('.'),
      present: hasMeaningfulValue(value),
      valueType: value == null ? null : typeof value,
      valuePreview: previewValue(value)
    };
  });
}

function previewValue(value) {
  if (!hasMeaningfulValue(value)) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function presentPaths(hits) {
  return hits.filter((hit) => hit.present).map((hit) => hit.path);
}

function listStage6Files(inputDir) {
  const resolved = resolveRepoPath(inputDir);
  if (!fs.existsSync(resolved)) return [];
  return fs
    .readdirSync(resolved)
    .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
    .sort()
    .map((name) => path.join(inputDir, name));
}

function collectRows(stage6) {
  const rows = [];
  const seen = new Set();
  for (const groupPath of STAGE6_GROUPS) {
    const value = getByPath(stage6, groupPath);
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      if (!row || typeof row !== 'object') continue;
      const symbol = normalizeSymbol(row.symbol);
      if (!symbol) continue;
      const decision = String(row.finalDecision || row.tradePlanDecision || row.executionBucket || 'UNKNOWN');
      const reason = String(row.decisionReason || row.tradePlanReason || row.executionReason || 'unknown');
      const key = `${symbol}|${groupPath.join('.')}|${decision}|${reason}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, symbol, _sourceGroup: groupPath.join('.') });
    }
  }
  return rows;
}

function isEarningsLineageRelevant(row, coverageSymbols) {
  if (coverageSymbols.has(row.symbol)) return true;
  const reason = String(row.decisionReason || row.tradePlanReason || row.executionReason || '').toLowerCase();
  return reason.includes('earnings');
}

function classifyBreak(row, canonicalHits, stage4Hits, vendorHits) {
  const canonicalPresent = presentPaths(canonicalHits);
  const stage4Present = presentPaths(stage4Hits);
  const vendorPresent = presentPaths(vendorHits);
  const hasCanonicalDateOrDays = canonicalPresent.some((field) =>
    ['earningsDate', 'earningsDaysToEvent'].includes(field)
  );
  const hasStage4DateOrDays = stage4Present.some((field) =>
    ['techMetrics.earningsDate', 'techMetrics.daysToEarnings'].includes(field)
  );
  const hasVendorDate = vendorPresent.some((field) => field.endsWith('earningsDate'));
  const hasVendorSource = vendorPresent.some((field) => field.endsWith('source'));
  const hasStage4EventState = stage4Present.some((field) =>
    ['techMetrics.eventRiskState', 'techMetrics.eventDistanceBand', 'techMetrics.eventRiskSource'].includes(field)
  );

  if (hasStage4DateOrDays && !hasCanonicalDateOrDays) {
    return {
      breakPoint: 'stage6_canonical_copy_gap',
      rootCause: 'STAGE4_EARNINGS_PRESENT_BUT_STAGE6_CANONICAL_MISSING',
      repairLane: 'STAGE6_CANONICAL_FIELD_PERSISTENCE_REPAIR'
    };
  }
  if (!hasStage4DateOrDays && hasStage4EventState) {
    return {
      breakPoint: 'stage4_event_overlay_no_dated_event',
      rootCause: 'STAGE4_EVENT_OVERLAY_PRESENT_BUT_NO_EARNINGS_DATE',
      repairLane: 'STAGE4_EARNINGS_EVENT_MAP_COVERAGE_REPAIR'
    };
  }
  if (!hasStage4DateOrDays && hasVendorSource && !hasVendorDate) {
    return {
      breakPoint: 'stage4_event_and_vendor_date_absent',
      rootCause: 'STAGE4_EVENT_AND_VENDOR_DATE_MISSING',
      repairLane: 'STAGE4_EVENT_MAP_OR_VENDOR_EARNINGS_DATE_REPAIR'
    };
  }
  if (!hasStage4DateOrDays && !hasVendorDate) {
    return {
      breakPoint: 'stage4_vendor_earnings_absent',
      rootCause: 'UPSTREAM_EARNINGS_EVENT_ABSENT',
      repairLane: 'STAGE4_OR_VENDOR_EARNINGS_SOURCE_REPAIR'
    };
  }
  if (hasCanonicalDateOrDays) {
    return {
      breakPoint: 'canonical_present',
      rootCause: 'STAGE6_CANONICAL_EARNINGS_PRESENT',
      repairLane: 'NO_LINEAGE_REPAIR_REQUIRED'
    };
  }
  return {
    breakPoint: 'earnings_lineage_review_required',
    rootCause: 'EARNINGS_LINEAGE_UNCLASSIFIED',
    repairLane: 'EARNINGS_LINEAGE_REVIEW'
  };
}

function countBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function dedupeRowsBySymbol(rows) {
  const priority = new Map([
    ['execution_contract.executablePicks', 0],
    ['execution_contract.modelTop6', 1],
    ['execution_contract.watchlistTop', 2],
    ['alpha_candidates', 3],
    ['candidates', 4],
    ['data', 5],
    ['audit_trail', 6]
  ]);
  const bySymbol = new Map();
  for (const row of rows) {
    const current = bySymbol.get(row.symbol);
    const rowPriority = priority.get(row._sourceGroup) ?? 99;
    const currentPriority = current ? priority.get(current._sourceGroup) ?? 99 : 100;
    if (!current || rowPriority < currentPriority) bySymbol.set(row.symbol, row);
  }
  return [...bySymbol.values()];
}

function buildReport() {
  const inputDir = process.env.STAGE6_EARNINGS_TRACE_INPUT_DIR || DEFAULT_INPUT_DIR;
  const coverageAuditPath = process.env.STAGE6_EARNINGS_TRACE_COVERAGE_AUDIT || DEFAULT_COVERAGE_AUDIT;
  const files = listStage6Files(inputDir);
  const latestFile = files.at(-1) || null;
  const stage6 = latestFile ? readJsonIfExists(latestFile) : null;
  const coverageAudit = readJsonIfExists(coverageAuditPath);
  const coverageSymbols = new Set((coverageAudit?.latestRows || []).map((row) => normalizeSymbol(row.symbol)).filter(Boolean));
  const rows = stage6
    ? dedupeRowsBySymbol(collectRows(stage6).filter((row) => isEarningsLineageRelevant(row, coverageSymbols)))
    : [];
  const traces = rows.map((row) => {
    const canonicalHits = pathHits(row, CANONICAL_PATHS);
    const stage4Hits = pathHits(row, STAGE4_EVENT_PATHS);
    const vendorHits = pathHits(row, VENDOR_SHADOW_PATHS);
    const classification = classifyBreak(row, canonicalHits, stage4Hits, vendorHits);
    const coverageRow = (coverageAudit?.latestRows || []).find((item) => normalizeSymbol(item.symbol) === row.symbol) || null;
    return {
      symbol: row.symbol,
      sourceGroup: row._sourceGroup,
      finalDecision: row.finalDecision || row.tradePlanDecision || row.executionBucket || null,
      decisionReason: row.decisionReason || row.tradePlanReason || row.executionReason || null,
      ...classification,
      canonicalPresentPaths: presentPaths(canonicalHits),
      stage4EventPresentPaths: presentPaths(stage4Hits),
      vendorShadowPresentPaths: presentPaths(vendorHits),
      canonicalHits,
      stage4EventHits: stage4Hits,
      vendorShadowHits: vendorHits,
      coverageAuditVerdict: coverageRow?.rowVerdict || null,
      coverageAuditPromotionBlockedBy: coverageRow?.promotionBlockedBy || [],
      recommendedAction: recommendedAction(classification, coverageRow)
    };
  });
  const rootCauseCounts = countBy(traces, (row) => row.rootCause);
  const breakPointCounts = countBy(traces, (row) => row.breakPoint);
  const repairLaneCounts = countBy(traces, (row) => row.repairLane);
  const missingStage4DateRows = traces.filter((row) => !row.stage4EventPresentPaths.includes('techMetrics.earningsDate')).length;
  const missingCanonicalRows = traces.filter((row) => !row.canonicalPresentPaths.includes('earningsDate') && !row.canonicalPresentPaths.includes('earningsDaysToEvent')).length;
  const overall =
    traces.length === 0
      ? 'pass_no_earnings_lineage_rows'
      : missingCanonicalRows > 0
        ? 'fail_earnings_lineage_gap_found'
        : 'pass_earnings_lineage_present';
  return {
    generatedAt: new Date().toISOString(),
    scope: 'stage6_earnings_stage4_vendor_lineage_trace_report_only',
    overall,
    action: overall === 'fail_earnings_lineage_gap_found' ? 'TRACE_STAGE4_VENDOR_EARNINGS_SOURCE' : 'NO_LINEAGE_ACTION_REQUIRED',
    safety: {
      brokerMutationAuthorized: false,
      executionPolicyChanged: false,
      reason: 'analysis-side lineage trace only'
    },
    source: {
      inputDir,
      latestStage6File: latestFile ? path.basename(latestFile) : null,
      latestStage6GeneratedAt:
        stage6?.execution_contract?.generatedAt || stage6?.manifest?.timestamp || stage6?.generated_at || stage6?.generatedAt || null,
      coverageAuditPath,
      coverageAuditLoaded: Boolean(coverageAudit),
      localStage4ArtifactsAvailable: false,
      localStage4ArtifactNote:
        'No Stage4 artifact snapshots are stored under the default local audit source. This trace uses latest Stage6 row payloads plus producer field-path contracts.'
    },
    summary: {
      rows: traces.length,
      missingStage4DateRows,
      missingCanonicalRows,
      rootCauseCounts,
      breakPointCounts,
      repairLaneCounts
    },
    doneWhen: {
      stage4VendorLineageSeparated: traces.length === 0 ? 'NO_EARNINGS_ROWS' : overall,
      brokerMutationAttempted: false,
      executionPolicyChanged: false,
      nextRepairBoundary:
        missingStage4DateRows > 0
          ? 'Add or inspect Stage4 EARNINGS_EVENT_MAP coverage evidence before changing Stage6 gates.'
          : 'If Stage4 date exists but canonical fields are missing, fix Stage6 canonical persistence.'
    },
    traces
  };
}

function recommendedAction(classification, coverageRow) {
  if (classification.rootCause === 'STAGE4_EARNINGS_PRESENT_BUT_STAGE6_CANONICAL_MISSING') {
    return 'Fix Stage6 canonical earnings persistence; Stage4 event fields are present but top-level Stage6 fields are missing.';
  }
  if (classification.rootCause === 'STAGE4_EVENT_AND_VENDOR_DATE_MISSING') {
    return 'Repair Stage4 earnings event map coverage or vendor earnings date coverage; source metadata alone is not sufficient.';
  }
  if (classification.rootCause === 'UPSTREAM_EARNINGS_EVENT_ABSENT') {
    return 'Trace EARNINGS_EVENT_MAP generation and Stage4 event overlay coverage for this symbol; do not lower Stage6 earnings gates.';
  }
  if (classification.rootCause === 'STAGE4_EVENT_OVERLAY_PRESENT_BUT_NO_EARNINGS_DATE') {
    return 'Inspect Stage4 event map row for missing earnings_date/days_to_event and persist dated source before Stage6 promotion.';
  }
  if (coverageRow?.promotionBlockedBy?.length) {
    return 'Earnings lineage is not the only blocker; keep promotion blocked until coverage and current-entry geometry are both valid.';
  }
  return 'No lineage repair action required.';
}

function esc(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Earnings Lineage Trace');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Scope: ${report.scope}`);
  lines.push(`- Overall: **${report.overall}**`);
  lines.push(`- Action: **${report.action}**`);
  lines.push(`- Latest Stage6: ${report.source.latestStage6File || 'N/A'}`);
  lines.push(`- Latest Stage6 GeneratedAt: ${report.source.latestStage6GeneratedAt || 'N/A'}`);
  lines.push(`- Coverage Audit Loaded: ${report.source.coverageAuditLoaded}`);
  lines.push(`- Local Stage4 Artifacts Available: ${report.source.localStage4ArtifactsAvailable}`);
  lines.push(`- Broker Mutation Authorized: ${report.safety.brokerMutationAuthorized}`);
  lines.push(`- Execution Policy Changed: ${report.safety.executionPolicyChanged}`);
  lines.push('');
  lines.push('## Summary Counts');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| rows | ${report.summary.rows} |`);
  lines.push(`| missingStage4DateRows | ${report.summary.missingStage4DateRows} |`);
  lines.push(`| missingCanonicalRows | ${report.summary.missingCanonicalRows} |`);
  for (const [key, value] of Object.entries(report.summary.rootCauseCounts || {})) {
    lines.push(`| rootCause:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.breakPointCounts || {})) {
    lines.push(`| breakPoint:${esc(key)} | ${value} |`);
  }
  for (const [key, value] of Object.entries(report.summary.repairLaneCounts || {})) {
    lines.push(`| repairLane:${esc(key)} | ${value} |`);
  }
  lines.push('');
  lines.push('## Latest Trace Rows');
  lines.push('');
  lines.push('| Symbol | Group | Decision | Reason | Break Point | Root Cause | Repair Lane | Canonical Paths | Stage4 Paths | Vendor Paths | Action |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.traces) {
    lines.push(
      `| ${esc(row.symbol)} | ${esc(row.sourceGroup)} | ${esc(row.finalDecision)} | ${esc(row.decisionReason)} | ${esc(row.breakPoint)} | ${esc(row.rootCause)} | ${esc(row.repairLane)} | ${esc(row.canonicalPresentPaths.join(', ') || 'none')} | ${esc(row.stage4EventPresentPaths.join(', ') || 'none')} | ${esc(row.vendorShadowPresentPaths.join(', ') || 'none')} | ${esc(row.recommendedAction)} |`
    );
  }
  if (report.traces.length === 0) {
    lines.push('| none | none | none | none | none | none | none | none | none | none | none |');
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- `stage4_event_and_vendor_date_absent` means neither Stage4 event overlay nor Stage6 vendor/shadow date supplied a dated earnings event.');
  lines.push('- `stage6_canonical_copy_gap` is worse: Stage4 had event fields but Stage6 failed to persist canonical fields.');
  lines.push('- Source metadata without an earnings date does not satisfy freshness. Do not promote earnings-gated rows on source-only evidence.');
  lines.push('- This report is analysis-side and report-only. It must not change sidecar submit/reprice/replace behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const outJson = process.env.STAGE6_EARNINGS_TRACE_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_EARNINGS_TRACE_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport();
  writeJson(outJson, report);
  writeText(outMd, buildMarkdown(report));
  console.log(
    `[STAGE6_EARNINGS_TRACE] overall=${report.overall} rows=${report.summary.rows} latest=${report.source.latestStage6File || 'N/A'} json=${outJson} md=${outMd}`
  );
}

main();
