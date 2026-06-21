#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const REPO_ROOT = process.cwd();
const DEFAULT_STAGE6_DIR = 'state/stage6-audit-source';
const OUT_JSON = process.env.STAGE6_FORMULA_TUNING_BACKLOG_OUT_JSON || 'state/stage6-formula-tuning-backlog.json';
const OUT_MD = process.env.STAGE6_FORMULA_TUNING_BACKLOG_OUT_MD || 'state/stage6-formula-tuning-backlog.md';
const EXPECTED_SOURCE_SHA_ENV =
  process.env.STAGE6_FORMULA_TUNING_BACKLOG_EXPECTED_SOURCE_SHA ||
  process.env.STAGE6_EXPECTED_SOURCE_SHA ||
  '';
const ENFORCE_FRESH_SOURCE = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.STAGE6_FORMULA_TUNING_BACKLOG_ENFORCE_FRESH_SOURCE || '').trim().toLowerCase()
);
const EXPECTED_FORMULA_CONTRACT_VERSION = 'zero_executable_formula_v4';
const REQUIRED_FORMULA_FIELDS = [
  'zeroExecutableFormulaBottleneck',
  'zeroExecutableFormulaSeverity',
  'zeroExecutableFormulaObservedValue',
  'zeroExecutableFormulaThresholdValue',
  'zeroExecutableFormulaDeltaValue',
  'zeroExecutableFormulaUnit',
  'zeroExecutableFormulaEvidenceBasis',
  'zeroExecutableFormulaAdjustmentKnob',
  'zeroExecutableFormulaAdjustmentDirection',
  'zeroExecutableFormulaAdjustmentMagnitude',
  'zeroExecutableFormulaAdjustmentRationale'
];
const PRODUCER_TRACK_BY_BOTTLENECK = {
  TARGET_RECALIBRATION_FORMULA: 'target_recalibration',
  RISK_GEOMETRY_RECALCULATION_FORMULA: 'risk_geometry_recalculation',
  BREAKOUT_PROOF_FORMULA: 'breakout_proof_confirmed_generation',
  STRUCTURE_PROOF_FORMULA: 'structure_proof_generation',
  NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK: 'no_action'
};
const EXPECTED_BOTTLENECK_BY_LANE = {
  TARGET_RECALIBRATION: 'TARGET_RECALIBRATION_FORMULA',
  STOP_TARGET_RISK_GEOMETRY_RECALCULATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
  RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: 'RISK_GEOMETRY_RECALCULATION_FORMULA',
  BREAKOUT_PROOF_CONFIRMED_GENERATION: 'BREAKOUT_PROOF_FORMULA',
  STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: 'STRUCTURE_PROOF_FORMULA',
  NO_ZERO_EXECUTABLE_TUNING_ACTION: 'NO_ZERO_EXECUTABLE_FORMULA_BOTTLENECK'
};
const EXPECTED_LANE_SPECIFIC_ROW_FIELDS = {
  TARGET_RECALIBRATION: [
    'targetRecalibrationFormulaEvidenceBasis',
    'targetRecalibrationFormulaObservedValue',
    'targetRecalibrationFormulaThresholdValue',
    'targetRecalibrationFormulaDeltaValue',
    'targetRecalibrationFormulaUnit'
  ],
  STOP_TARGET_RISK_GEOMETRY_RECALCULATION: [
    'riskGeometryFormulaEvidenceBasis',
    'riskGeometryFormulaObservedValue',
    'riskGeometryFormulaThresholdValue',
    'riskGeometryFormulaDeltaValue',
    'riskGeometryFormulaUnit'
  ],
  RISK_GEOMETRY_NO_TRADE_OR_RECALIBRATION: [
    'riskGeometryFormulaEvidenceBasis',
    'riskGeometryFormulaObservedValue',
    'riskGeometryFormulaThresholdValue',
    'riskGeometryFormulaDeltaValue',
    'riskGeometryFormulaUnit'
  ],
  BREAKOUT_PROOF_CONFIRMED_GENERATION: [
    'breakoutRetestProofFormulaEvidenceBasis',
    'breakoutRetestProofFormulaObservedValue',
    'breakoutRetestProofFormulaThresholdValue',
    'breakoutRetestProofFormulaDeltaValue',
    'breakoutRetestProofFormulaUnit'
  ],
  STRUCTURE_PROOF_REQUIRED_NOT_RELAXATION: [
    'structurePolicyFormulaEvidenceBasis',
    'structurePolicyFormulaObservedValue',
    'structurePolicyFormulaThresholdValue',
    'structurePolicyFormulaDeltaValue',
    'structurePolicyFormulaUnit'
  ],
  NO_ZERO_EXECUTABLE_TUNING_ACTION: []
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function stage6Timestamp(name) {
  const match = String(name).match(/^STAGE6_ALPHA_FINAL_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.json$/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestStage6Path() {
  if (process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH) return process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_PATH;
  const dir = resolveRepo(process.env.STAGE6_FORMULA_TUNING_BACKLOG_STAGE6_DIR || DEFAULT_STAGE6_DIR);
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir)
      .filter((name) => /^STAGE6_ALPHA_FINAL_.*\.json$/.test(name))
      .map((name) => ({ name, full: path.join(dir, name), mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => stage6Timestamp(b.name).localeCompare(stage6Timestamp(a.name)) || b.mtime - a.mtime || b.name.localeCompare(a.name))
    : [];
  if (!files.length) throw new Error(`no Stage6 files found in ${dir}`);
  return files[0].full;
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

const EXPECTED_SOURCE_SHA = normalizeText(EXPECTED_SOURCE_SHA_ENV);

function stage6SourceAudit(stage6) {
  const manifest = stage6?.manifest || {};
  const buildSource = manifest?.buildSource || stage6?.buildSource || {};
  return {
    repository: normalizeText(manifest.sourceRepo) || normalizeText(buildSource.repository),
    workflow: normalizeText(manifest.sourceWorkflow) || normalizeText(buildSource.workflow),
    runId: normalizeText(manifest.sourceRunId) || normalizeText(buildSource.runId),
    sha: normalizeText(manifest.sourceSha) || normalizeText(buildSource.sha),
    ref: normalizeText(manifest.sourceRef) || normalizeText(buildSource.ref),
    eventName: normalizeText(manifest.sourceEventName) || normalizeText(buildSource.eventName)
  };
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = numberOrNull(value);
  return number == null ? null : Number(number.toFixed(digits));
}

function decisionOf(row) {
  return String(row?.finalDecision || row?.decision || 'UNKNOWN').trim().toUpperCase();
}

function reasonOf(row) {
  return String(row?.decisionReason || row?.executionReason || 'unknown').trim().toLowerCase();
}

function verdictOf(row) {
  return String(row?.verdict || row?.aiVerdict || row?.finalVerdict || row?.verdictFinal || 'UNKNOWN').trim().toUpperCase();
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function esc(value) {
  return String(value ?? 'N/A').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function uniqueRows(stage6) {
  const contract = stage6?.execution_contract || {};
  const sourceGroups = [
    ...(Array.isArray(contract.executablePicks) ? contract.executablePicks.map((row) => [row, 50]) : []),
    ...(Array.isArray(stage6?.alpha_candidates) ? stage6.alpha_candidates.map((row) => [row, 40]) : []),
    ...(Array.isArray(contract.watchlistTop) ? contract.watchlistTop.map((row) => [row, 30]) : []),
    ...(Array.isArray(contract.modelTop6) ? contract.modelTop6.map((row) => [row, 20]) : []),
    ...(Array.isArray(stage6?.candidates) ? stage6.candidates.map((row) => [row, 10]) : [])
  ];
  const bySymbol = new Map();
  for (const [row, priority] of sourceGroups) {
    const symbol = normalizeSymbol(row);
    if (!symbol) continue;
    const existing = bySymbol.get(symbol);
    if (!existing || priority > existing.priority) bySymbol.set(symbol, { row, priority });
  }
  return [...bySymbol.values()].map(({ row }) => row);
}

function contractVersion(stage6) {
  return normalizeText(stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract?.version) || normalizeText(stage6?.decisionGate?.zeroExecutableFormulaContract?.version);
}

function formulaContract(stage6) {
  return stage6?.manifest?.decisionGate?.zeroExecutableFormulaContract || stage6?.decisionGate?.zeroExecutableFormulaContract || null;
}

function formulaContractIssues(stage6) {
  const contract = formulaContract(stage6);
  if (!contract || typeof contract !== 'object') return ['formula_contract_missing'];
  const issues = [];
  if (contract.version !== EXPECTED_FORMULA_CONTRACT_VERSION) {
    issues.push(`formula_contract_version_mismatch:${contract.version || 'missing'}`);
  }
  const requiredRowFields = new Set(Array.isArray(contract.requiredRowFields) ? contract.requiredRowFields : []);
  for (const field of REQUIRED_FORMULA_FIELDS) {
    if (!requiredRowFields.has(field)) issues.push(`formula_contract_required_field_missing:${field}`);
  }
  const laneSpecificRowFields = contract.laneSpecificRowFields || {};
  for (const [lane, fields] of Object.entries(EXPECTED_LANE_SPECIFIC_ROW_FIELDS)) {
    if (!Array.isArray(laneSpecificRowFields[lane])) {
      issues.push(`lane_specific_contract_missing:${lane}`);
      continue;
    }
    const actualFields = new Set(laneSpecificRowFields[lane]);
    for (const field of fields) {
      if (!actualFields.has(field)) issues.push(`lane_specific_contract_missing:${lane}.${field}`);
    }
  }
  return issues;
}

function missingFormulaFields(row) {
  return REQUIRED_FORMULA_FIELDS.filter((field) => !Object.prototype.hasOwnProperty.call(row, field));
}

function missingLaneSpecificFields(row) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const fields = EXPECTED_LANE_SPECIFIC_ROW_FIELDS[lane] || [];
  return fields.filter((field) => !Object.prototype.hasOwnProperty.call(row, field));
}

function formulaEvidenceWeak(row, missingFields, missingLaneFields) {
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  if (!lane || lane === 'NO_ZERO_EXECUTABLE_TUNING_ACTION') return false;
  if (missingFields.length > 0 || missingLaneFields.length > 0) return false;
  const observed = numberOrNull(row?.zeroExecutableFormulaObservedValue);
  const delta = numberOrNull(row?.zeroExecutableFormulaDeltaValue);
  const magnitude = numberOrNull(row?.zeroExecutableFormulaAdjustmentMagnitude);
  const severity = numberOrNull(row?.zeroExecutableFormulaSeverity);
  return !(observed != null && observed > 0 && delta != null && delta > 0 && magnitude != null && magnitude > 0 && severity != null && severity > 0);
}

function formulaLaneMismatch(row, missingFields) {
  if (missingFields.length > 0) return false;
  const lane = String(row?.zeroExecutableTuningLane || '').trim().toUpperCase();
  const expected = EXPECTED_BOTTLENECK_BY_LANE[lane];
  if (!expected) return false;
  const actual = String(row?.zeroExecutableFormulaBottleneck || '').trim().toUpperCase();
  return actual !== expected;
}

function rowBacklog(row, contractIncomplete = false) {
  const symbol = normalizeSymbol(row);
  const bottleneck = normalizeText(row?.zeroExecutableFormulaBottleneck) || 'missing';
  const producerTrack = PRODUCER_TRACK_BY_BOTTLENECK[bottleneck] || 'unknown';
  const missingFields = missingFormulaFields(row);
  const missingLaneFields = missingLaneSpecificFields(row);
  const laneMismatch = formulaLaneMismatch(row, missingFields);
  const weakEvidence = formulaEvidenceWeak(row, missingFields, missingLaneFields);
  const delta = round(row?.zeroExecutableFormulaDeltaValue) ?? 0;
  const magnitude = round(row?.zeroExecutableFormulaAdjustmentMagnitude) ?? delta;
  const severity = round(row?.zeroExecutableFormulaSeverity) ?? 0;
  const actionRequired = contractIncomplete
    ? 'REFRESH_STAGE6_FORMULA_CONTRACT'
    : missingFields.length > 0 || missingLaneFields.length > 0
    ? 'REFRESH_STAGE6_WITH_FORMULA_V4'
    : laneMismatch
      ? 'REFRESH_STAGE6_FORMULA_LANE_MAPPING'
    : weakEvidence
      ? 'REFRESH_STAGE6_FORMULA_EVIDENCE'
    : producerTrack === 'no_action'
      ? 'NO_PRODUCER_TUNING_ACTION'
      : 'PRODUCER_TUNING_REVIEW';
  return {
    symbol,
    verdict: verdictOf(row),
    finalDecision: decisionOf(row),
    decisionReason: reasonOf(row),
    zeroExecutableTuningLane: normalizeText(row?.zeroExecutableTuningLane),
    formulaBottleneck: bottleneck,
    producerTrack,
    observedValue: round(row?.zeroExecutableFormulaObservedValue),
    thresholdValue: round(row?.zeroExecutableFormulaThresholdValue),
    deltaValue: delta,
    unit: normalizeText(row?.zeroExecutableFormulaUnit),
    evidenceBasis: normalizeText(row?.zeroExecutableFormulaEvidenceBasis),
    adjustmentKnob: normalizeText(row?.zeroExecutableFormulaAdjustmentKnob),
    adjustmentDirection: normalizeText(row?.zeroExecutableFormulaAdjustmentDirection),
    adjustmentMagnitude: magnitude,
    adjustmentRationale: normalizeText(row?.zeroExecutableFormulaAdjustmentRationale),
    severity,
    actionRequired,
    missingFormulaFields: missingFields,
    missingLaneSpecificFields: missingLaneFields,
    formulaLaneMismatch: laneMismatch,
    expectedFormulaBottleneck: EXPECTED_BOTTLENECK_BY_LANE[String(row?.zeroExecutableTuningLane || '').trim().toUpperCase()] || null,
    formulaEvidenceWeak: weakEvidence,
    producerOnly: true,
    sidecarMutationAllowed: false
  };
}

function rankRows(rows) {
  return [...rows].sort((a, b) => {
    if (a.actionRequired !== b.actionRequired) return a.actionRequired === 'PRODUCER_TUNING_REVIEW' ? -1 : 1;
    return (b.adjustmentMagnitude || b.deltaValue || b.severity || 0) - (a.adjustmentMagnitude || a.deltaValue || a.severity || 0) || a.symbol.localeCompare(b.symbol);
  });
}

function aggregate(rows, key) {
  const out = {};
  for (const row of rows) {
    const group = row[key] || 'unknown';
    if (!out[group]) out[group] = { count: 0, totalMagnitude: 0, symbols: [] };
    out[group].count += 1;
    out[group].totalMagnitude += Number(row.adjustmentMagnitude || row.deltaValue || row.severity || 0);
    out[group].symbols.push(row.symbol);
  }
  return Object.fromEntries(Object.entries(out).map(([group, value]) => [group, {
    count: value.count,
    totalMagnitude: round(value.totalMagnitude),
    symbols: value.symbols.sort()
  }]));
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Formula Tuning Backlog');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| overall | ${esc(report.overall)} |`);
  lines.push(`| stage6 | ${esc(report.stage6.file)} |`);
  lines.push(`| sourceSha | ${esc(report.stage6.source?.sha)} |`);
  lines.push(`| expectedSourceSha | ${esc(report.runtimeProof.expectedSourceSha)} |`);
  lines.push(`| sourceShaMatchesExpected | ${esc(report.runtimeProof.sourceShaMatchesExpected)} |`);
  lines.push(`| formulaContractVersion | ${esc(report.stage6.formulaContractVersion)} |`);
  lines.push(`| runtimeProof.status | ${esc(report.runtimeProof.status)} |`);
  lines.push(`| rows | ${report.summary.rows} |`);
  lines.push(`| producerReviewRows | ${report.summary.producerReviewRows} |`);
  lines.push(`| missingFormulaRows | ${report.summary.missingFormulaRows} |`);
  lines.push(`| missingLaneSpecificRows | ${report.summary.missingLaneSpecificRows} |`);
  lines.push(`| formulaLaneMismatchRows | ${report.summary.formulaLaneMismatchRows} |`);
  lines.push(`| formulaEvidenceWeakRows | ${report.summary.formulaEvidenceWeakRows} |`);
  lines.push(`| formulaContractIssues | ${report.summary.formulaContractIssues} |`);
  lines.push(`| topProducerTrack | ${esc(report.summary.topProducerTrack)} |`);
  lines.push(`| topAdjustmentKnob | ${esc(report.summary.topAdjustmentKnob)} |`);
  lines.push('');
  lines.push('## Track Counts');
  lines.push('');
  lines.push(`- producerTrackCounts: \`${JSON.stringify(report.summary.producerTrackCounts)}\``);
  lines.push(`- adjustmentKnobCounts: \`${JSON.stringify(report.summary.adjustmentKnobCounts)}\``);
  lines.push('');
  lines.push('## Backlog Rows');
  lines.push('');
  lines.push('| Symbol | Decision | Track | Knob | Direction | Magnitude | Evidence | Lane Mismatch | Weak Evidence | Missing Lane Fields | Action |');
  lines.push('| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |');
  for (const row of report.backlogRows) {
    const evidence = `${row.evidenceBasis || 'missing'}:${row.observedValue ?? 'N/A'}>${row.thresholdValue ?? 'N/A'} delta=${row.deltaValue ?? 'N/A'} ${row.unit || ''}`;
    const laneMismatch = row.formulaLaneMismatch ? `${row.formulaBottleneck || 'missing'}!=${row.expectedFormulaBottleneck || 'unknown'}` : 'no';
    lines.push(`| ${esc(row.symbol)} | ${esc(`${row.finalDecision}/${row.decisionReason}`)} | ${esc(row.producerTrack)} | ${esc(row.adjustmentKnob)} | ${esc(row.adjustmentDirection)} | ${esc(row.adjustmentMagnitude)} | ${esc(evidence)} | ${esc(laneMismatch)} | ${row.formulaEvidenceWeak ? 'yes' : 'no'} | ${esc((row.missingLaneSpecificFields || []).join(', ') || 'none')} | ${esc(row.actionRequired)} |`);
  }
  if (!report.backlogRows.length) lines.push('| none | none | none | none | none | N/A | none | no | no | none | none |');
  lines.push('');
  lines.push('## Guardrails');
  lines.push('');
  lines.push('- This backlog is producer-only. It must not enable broker submit, replace, reprice, or sidecar mutation.');
  lines.push('- If `runtimeProof.status=pending_fresh_stage6_source_sha`, do not tune policy from this artifact; generate a fresh Stage6 from the expected head first.');
  lines.push('- `REFRESH_STAGE6_FORMULA_CONTRACT` means the artifact manifest does not publish the current formula contract; generate a fresh Stage6 or fix manifest propagation before tuning.');
  lines.push('- `REFRESH_STAGE6_WITH_FORMULA_V4` means the artifact predates the current contract; do not infer tuning from stale rows.');
  lines.push('- `REFRESH_STAGE6_FORMULA_LANE_MAPPING` means the row lane and formula bottleneck disagree; fix producer classification before threshold tuning.');
  lines.push('- `REFRESH_STAGE6_FORMULA_EVIDENCE` means the row has current formula fields but zero/weak formula evidence; refresh producer evidence before changing thresholds.');
  lines.push('- `PRODUCER_TUNING_REVIEW` means tune Stage6 formulas or proof generation, not execution-side filters.');
  return lines.join('\n') + '\n';
}

function sourceFreshnessStatus(sourceSha) {
  if (!EXPECTED_SOURCE_SHA) {
    return {
      status: 'not_required',
      sourceShaMatchesExpected: null,
      freshSourceViolation: false,
      nextAction: null
    };
  }
  const matches = sourceSha === EXPECTED_SOURCE_SHA;
  return {
    status: matches ? 'pass_fresh_stage6_source_sha' : 'pending_fresh_stage6_source_sha',
    sourceShaMatchesExpected: matches,
    freshSourceViolation: !matches,
    nextAction: matches ? null : 'generate_fresh_stage6_after_expected_head'
  };
}

function main() {
  const stage6Path = latestStage6Path();
  const stage6 = readJson(stage6Path);
  const sourceAudit = stage6SourceAudit(stage6);
  const sourceFreshness = sourceFreshnessStatus(sourceAudit.sha);
  const contractIssues = formulaContractIssues(stage6);
  const rows = uniqueRows(stage6).map((row) => rowBacklog(row, contractIssues.length > 0));
  const missingFormulaRows = rows.filter((row) => row.missingFormulaFields.length > 0);
  const missingLaneSpecificRows = rows.filter((row) => row.missingLaneSpecificFields.length > 0);
  const formulaLaneMismatchRows = rows.filter((row) => row.formulaLaneMismatch);
  const formulaEvidenceWeakRows = rows.filter((row) => row.formulaEvidenceWeak);
  const producerRows = rows.filter((row) => row.actionRequired === 'PRODUCER_TUNING_REVIEW');
  const rankedRows = rankRows(rows);
  const producerTrackAggregation = aggregate(producerRows, 'producerTrack');
  const adjustmentKnobAggregation = aggregate(producerRows, 'adjustmentKnob');
  const topProducerTrack = Object.entries(producerTrackAggregation).sort((a, b) => b[1].totalMagnitude - a[1].totalMagnitude || b[1].count - a[1].count)[0]?.[0] || 'none';
  const topAdjustmentKnob = Object.entries(adjustmentKnobAggregation).sort((a, b) => b[1].totalMagnitude - a[1].totalMagnitude || b[1].count - a[1].count)[0]?.[0] || 'none';
  const overall = rows.length === 0
    ? 'fail_no_rows'
    : sourceFreshness.freshSourceViolation
      ? 'warn_formula_tuning_stale_source'
    : contractIssues.length > 0
      ? 'warn_formula_tuning_contract_incomplete'
    : missingFormulaRows.length > 0 || missingLaneSpecificRows.length > 0
      ? 'warn_formula_tuning_formula_fields_missing'
    : formulaLaneMismatchRows.length > 0
      ? 'warn_formula_tuning_lane_mismatch'
    : formulaEvidenceWeakRows.length > 0
      ? 'warn_formula_tuning_evidence_weak'
      : producerRows.length > 0
        ? 'pass_formula_tuning_backlog_ready'
        : 'pass_no_formula_tuning_action_required';
  const report = {
    generatedAt: new Date().toISOString(),
    overall,
    stage6: {
      file: path.basename(stage6Path),
      path: stage6Path,
      hash: stage6?.manifest?.stage6Hash || stage6?.stage6Hash || sha256(stage6Path),
      formulaContractVersion: contractVersion(stage6),
      source: sourceAudit
    },
    runtimeProof: {
      status: sourceFreshness.status,
      expectedSourceSha: EXPECTED_SOURCE_SHA,
      sourceSha: sourceAudit.sha,
      sourceShaMatchesExpected: sourceFreshness.sourceShaMatchesExpected,
      enforceFreshSource: ENFORCE_FRESH_SOURCE,
      freshSourceViolation: sourceFreshness.freshSourceViolation
    },
    summary: {
      rows: rows.length,
      producerReviewRows: producerRows.length,
      missingFormulaRows: missingFormulaRows.length,
      missingLaneSpecificRows: missingLaneSpecificRows.length,
      formulaLaneMismatchRows: formulaLaneMismatchRows.length,
      formulaEvidenceWeakRows: formulaEvidenceWeakRows.length,
      formulaContractIssues: contractIssues.length,
      producerTrackCounts: countBy(rows, (row) => row.producerTrack),
      adjustmentKnobCounts: countBy(rows, (row) => row.adjustmentKnob || 'missing'),
      producerTrackAggregation,
      adjustmentKnobAggregation,
      topProducerTrack,
      topAdjustmentKnob,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false
    },
    backlogRows: rankedRows,
    formulaContractIssues: contractIssues,
    guardrails: {
      producerOnly: true,
      brokerSubmitReplaceRepriceAllowed: false,
      sidecarMutationAllowed: false,
      nextAction: sourceFreshness.nextAction
        ? sourceFreshness.nextAction
        : contractIssues.length > 0
        ? 'generate_fresh_stage6_after_formula_v4_head_or_fix_manifest_contract'
        : missingFormulaRows.length > 0 || missingLaneSpecificRows.length > 0
        ? 'generate_fresh_stage6_after_formula_v4_head'
        : formulaLaneMismatchRows.length > 0
          ? 'refresh_stage6_formula_lane_mapping'
        : formulaEvidenceWeakRows.length > 0
          ? 'refresh_stage6_formula_evidence_before_tuning_thresholds'
        : producerRows.length > 0
          ? 'tune_stage6_producer_formula_or_proof_generation'
          : 'no_formula_tuning_action_required'
    }
  };
  ensureParent(OUT_JSON);
  fs.writeFileSync(resolveRepo(OUT_JSON), `${JSON.stringify(report, null, 2)}\n`);
  ensureParent(OUT_MD);
  fs.writeFileSync(resolveRepo(OUT_MD), buildMarkdown(report));
  console.log(`[STAGE6_FORMULA_TUNING_BACKLOG] overall=${report.overall} rows=${rows.length} producerReview=${producerRows.length} topTrack=${topProducerTrack} json=${OUT_JSON}`);
  if (ENFORCE_FRESH_SOURCE && sourceFreshness.freshSourceViolation) {
    console.error(`[STAGE6_FORMULA_TUNING_BACKLOG] fresh source enforcement failed expected=${EXPECTED_SOURCE_SHA || 'none'} actual=${sourceAudit.sha || 'missing'}`);
    process.exit(1);
  }
}

main();
