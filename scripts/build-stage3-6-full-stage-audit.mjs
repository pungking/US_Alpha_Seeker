#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT_JSON = process.env.STAGE36_FULL_AUDIT_OUT_JSON || 'state/stage3-6-full-stage-audit.json';
const OUT_MD = process.env.STAGE36_FULL_AUDIT_OUT_MD || 'docs/STAGE3_6_FULL_STAGE_AUDIT.md';

const STAGE_CONFIGS = {
  stage3: {
    label: 'Stage3',
    envPath: 'STAGE36_FULL_AUDIT_STAGE3_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE3_DIR',
    defaultDir: 'state/stage3-audit-source',
    pattern: /^STAGE3_.*\.json$/,
    rowKeys: ['fundamental_universe', 'fundamentalUniverse', 'stage3', 'candidates', 'results', 'data']
  },
  stage4: {
    label: 'Stage4',
    envPath: 'STAGE36_FULL_AUDIT_STAGE4_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE4_DIR',
    defaultDir: 'state/stage4-audit-source',
    pattern: /^STAGE4_.*\.json$/,
    rowKeys: ['technical_universe', 'technicalUniverse', 'stage4', 'technical_candidates', 'stage4_candidates', 'candidates', 'results', 'data']
  },
  stage5: {
    label: 'Stage5',
    envPath: 'STAGE36_FULL_AUDIT_STAGE5_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE5_DIR',
    defaultDir: 'state/stage5-audit-source',
    pattern: /^STAGE5_.*\.json$/,
    rowKeys: ['ict_universe', 'ictUniverse', 'stage5', 'ict_candidates', 'elite_candidates', 'stage5_candidates', 'candidates', 'results', 'data']
  },
  stage6: {
    label: 'Stage6',
    envPath: 'STAGE36_FULL_AUDIT_STAGE6_PATH',
    envDir: 'STAGE36_FULL_AUDIT_STAGE6_DIR',
    defaultDir: 'state/stage6-audit-source',
    pattern: /^STAGE6_ALPHA_FINAL_.*\.json$/,
    rowKeys: ['alpha_candidates', 'candidates', 'results', 'data']
  }
};

const SUBREPORTS = {
  stage35Methodology: 'state/stage3-5-methodology-audit.json',
  stage35QuantQuality: 'state/stage3-5-quant-quality-audit.json',
  stage6FreshFocus: 'state/stage6-fresh-focus-audit.json',
  stage6FormulaTuningBacklog: 'state/stage6-formula-tuning-backlog.json',
  stage6RuntimeFormulaContractProof: 'state/stage6-runtime-formula-contract-proof.json',
  stage6FormulaBacklogAlignment: 'state/stage6-formula-audit-backlog-alignment.json',
  stage6BlockerRootCause: 'state/stage6-blocker-root-cause-audit.json',
  stage6QualityTrend: 'state/stage6-quality-trend-audit.json'
};

const RUNTIME_PROOF_FIELDS = [
  'targetRecalibrationExecutionFloorViable',
  'riskGeometryTargetRecalibrationProofReady',
  'riskGeometryRrAtRequiredTargetAndRecalculatedStop',
  'breakoutRetestProofUndercutReclaimFound',
  'zeroExecutableTuningLane',
  'structurePolicyBlockerLane',
  'qualityGateLane'
];

const STAGE_FIELD_GROUPS = {
  stage3: [
    'fundamentalScore',
    'compositeAlpha',
    'qualityScore',
    'integrityReasons',
    'isImputed',
    'dataQuality',
    'roicDebtSource'
  ],
  stage4: [
    'technicalScore',
    'scoreBreakdown.finalScore',
    'techMetrics',
    'priceHistory',
    'dataSource',
    'techMetrics.dataQualityState',
    'techMetrics.avgDollarVolume20'
  ],
  stage5: [
    'ictScore',
    'ictMetrics',
    'otePrice',
    'ictStopLoss',
    'executionGeometrySource',
    'pdZone',
    'compositeBreakdown.dataQualityMultiplier'
  ],
  stage6: [
    'finalDecision',
    'decisionReason',
    'weakPillarGateVerdict',
    'qualityGateLane',
    'zeroExecutableTuningLane',
    'targetRecalibrationViabilityVerdict',
    'riskGeometryRepairLane',
    'breakoutRetestProofConfirmed'
  ]
};

function resolveRepo(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(ROOT, filePath);
}

function exists(filePath) {
  return Boolean(filePath) && fs.existsSync(resolveRepo(filePath));
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(resolveRepo(filePath)), { recursive: true });
}

function writeTextAtomic(filePath, text) {
  const fullPath = resolveRepo(filePath);
  ensureParent(fullPath);
  const tmpPath = `${fullPath}.tmp`;
  fs.writeFileSync(tmpPath, text, 'utf8');
  fs.renameSync(tmpPath, fullPath);
}

function writeJsonAtomic(filePath, payload) {
  writeTextAtomic(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolveRepo(filePath), 'utf8'));
}

function readJsonOptional(filePath) {
  if (!exists(filePath)) return null;
  try {
    return readJson(filePath);
  } catch (error) {
    return { readError: String(error?.message || error) };
  }
}

function sha256(filePath) {
  if (!exists(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(resolveRepo(filePath))).digest('hex');
}

function basename(filePath) {
  return filePath ? path.basename(filePath) : null;
}

function artifactSortKey(name) {
  const match = String(name).match(/(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})/);
  return match ? `${match[1]}_${match[2]}` : '';
}

function latestArtifact({ envPath, envDir, defaultDir, pattern }) {
  const direct = process.env[envPath];
  if (direct) {
    const resolved = resolveRepo(direct);
    return fs.existsSync(resolved) ? { path: resolved, source: envPath } : { path: resolved, source: envPath, missing: true };
  }
  const dir = resolveRepo(process.env[envDir] || defaultDir);
  if (!fs.existsSync(dir)) return { path: null, source: 'missing_dir', dir };
  const files = fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, full, mtime: fs.statSync(full).mtimeMs, key: artifactSortKey(name) };
    })
    .sort((a, b) => b.key.localeCompare(a.key) || b.mtime - a.mtime || b.name.localeCompare(a.name));
  return files[0] ? { path: files[0].full, source: envDir, dir } : { path: null, source: 'no_matching_files', dir };
}

function normalizeSymbol(row) {
  return String(row?.symbol || row?.ticker || '').trim().toUpperCase();
}

function isPresent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function nestedGet(row, fieldPath) {
  return String(fieldPath).split('.').reduce((cur, part) => cur?.[part], row);
}

function rowsFromStageArtifact(payload, config) {
  if (Array.isArray(payload)) return payload.filter((row) => normalizeSymbol(row));
  for (const key of config.rowKeys) {
    const rows = payload?.[key];
    if (Array.isArray(rows)) return rows.filter((row) => normalizeSymbol(row));
  }
  if (config.label === 'Stage6') {
    const contract = payload?.execution_contract || {};
    const rows = [];
    const seen = new Set();
    for (const group of ['executablePicks', 'watchlistTop', 'modelTop6']) {
      for (const row of Array.isArray(contract[group]) ? contract[group] : []) {
        const symbol = normalizeSymbol(row);
        if (!symbol || seen.has(symbol)) continue;
        seen.add(symbol);
        rows.push(row);
      }
    }
    return rows;
  }
  return [];
}

function loadStage(stageKey) {
  const config = STAGE_CONFIGS[stageKey];
  const artifact = latestArtifact(config);
  const payload = artifact.path && fs.existsSync(artifact.path) ? readJsonOptional(artifact.path) : null;
  const rows = payload && !payload.readError ? rowsFromStageArtifact(payload, config) : [];
  return {
    stage: config.label,
    path: artifact.path,
    file: basename(artifact.path),
    hash: sha256(artifact.path),
    source: artifact.source,
    missing: !artifact.path || artifact.missing || !fs.existsSync(artifact.path),
    readError: payload?.readError || null,
    manifest: payload && !payload.readError ? payload.manifest || {} : {},
    rows,
    rowCount: rows.length
  };
}

function countBy(rows, fn) {
  const out = {};
  for (const row of rows) {
    const key = String(fn(row) ?? 'unknown').trim() || 'unknown';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function coverage(rows, fields) {
  return Object.fromEntries(fields.map((field) => {
    const present = rows.filter((row) => isPresent(nestedGet(row, field))).length;
    return [field, { present, total: rows.length, pct: rows.length ? Number(((present / rows.length) * 100).toFixed(1)) : 0 }];
  }));
}

function boolString(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (value == null || value === '') return 'missing';
  return String(value);
}

function pickOverall(report) {
  return report?.overall || report?.status || report?.summary?.overall || report?.verdict || 'not_available';
}

function summarizeSubreports() {
  const out = {};
  for (const [name, file] of Object.entries(SUBREPORTS)) {
    const report = readJsonOptional(file);
    out[name] = {
      path: file,
      present: Boolean(report && !report.readError),
      generatedAt: report?.generatedAt || null,
      overall: report && !report.readError ? pickOverall(report) : report?.readError ? 'read_error' : 'missing',
      summary: report?.summary || {},
      runtimeProof: report?.runtimeProof || null,
      sourceFreshness: report?.sourceFreshness || null,
      contract: report?.contract || null,
      backlog: report?.backlog || null,
      splitTuning: report?.splitTuning || null,
      nextAction: report?.nextAction || null
    };
  }
  return out;
}

function compareNames(actual, expected) {
  if (!actual || !expected) return null;
  return String(actual) === String(expected);
}

function deriveLineage(stages) {
  const s3 = stages.stage3;
  const s4 = stages.stage4;
  const s5 = stages.stage5;
  const s6 = stages.stage6;
  const s4SourceStage3File = s4.manifest.sourceStage3File || s4.manifest.stage3File || null;
  const s5SourceStage4File = s5.manifest.sourceStage4File || s5.manifest.stage4File || null;
  const s5SourceStage4LineageStatus = s5.manifest.sourceStage4LineageStatus || null;
  const s5SourceStage4SourceStage3File = s5.manifest.sourceStage4SourceStage3File || null;
  const s6SourceStage5File = s6.manifest.sourceStage5File || s6.manifest.stage5File || null;
  const stage4MatchesStage3 = compareNames(s4SourceStage3File, s3.file);
  const stage5MatchesStage4 = compareNames(s5SourceStage4File, s4.file);
  const stage6MatchesStage5 = compareNames(s6SourceStage5File, s5.file);
  const missingArtifacts = [s3, s4, s5, s6].filter((stage) => stage.missing).map((stage) => stage.stage);
  const mismatches = [];
  const incomplete = [];

  if (missingArtifacts.length) mismatches.push(`missing_artifacts:${missingArtifacts.join(',')}`);
  if (stage4MatchesStage3 === false) mismatches.push('stage4_source_stage3_mismatch');
  if (stage5MatchesStage4 === false) mismatches.push('stage5_source_stage4_mismatch');
  if (stage6MatchesStage5 === false) mismatches.push('stage6_source_stage5_mismatch');
  if (stage4MatchesStage3 == null && !s4.missing && !s3.missing) incomplete.push('stage4_source_stage3_missing');
  if (stage5MatchesStage4 == null && !s5.missing && !s4.missing) incomplete.push('stage5_source_stage4_missing');
  if (stage6MatchesStage5 == null && !s6.missing && !s5.missing) incomplete.push('stage6_source_stage5_missing');

  let status = 'pass_same_run_lineage';
  if (missingArtifacts.length) status = 'warn_artifacts_missing';
  else if (mismatches.length) status = 'warn_lineage_mismatch';
  else if (incomplete.length) status = 'warn_lineage_incomplete';

  return {
    status,
    finalQualityJudgement: status === 'pass_same_run_lineage' ? 'enabled' : 'withheld',
    reason: mismatches.length || incomplete.length ? [...mismatches, ...incomplete] : ['stage3_stage4_stage5_stage6_chain_consistent'],
    stage3File: s3.file,
    stage4File: s4.file,
    stage4SourceStage3File: s4SourceStage3File,
    stage4MatchesStage3,
    stage5File: s5.file,
    stage5SourceStage4File: s5SourceStage4File,
    stage5SourceStage4LineageStatus: s5SourceStage4LineageStatus,
    stage5SourceStage4SourceStage3File: s5SourceStage4SourceStage3File,
    stage5MatchesStage4,
    stage6File: s6.file,
    stage6SourceStage5File: s6SourceStage5File,
    stage6MatchesStage5
  };
}

function deriveRuntimeProof(stage6Rows, subreports) {
  const fieldCoverage = coverage(stage6Rows, RUNTIME_PROOF_FIELDS);
  const missingFields = Object.entries(fieldCoverage)
    .filter(([, info]) => info.present < info.total || info.total === 0)
    .map(([field]) => field);
  const formulaBacklog = subreports.stage6FormulaTuningBacklog;
  const freshFocus = subreports.stage6FreshFocus;
  const contractProof = subreports.stage6RuntimeFormulaContractProof || {};
  const freshRuntime = freshFocus.runtimeProof || {};
  const freshOverall = String(freshFocus.overall || '');
  const freshRuntimeStatus = String(freshRuntime.status || '');
  const formulaBacklogOverall = String(formulaBacklog.overall || '');
  const freshManifestIssues = Number(freshFocus.summary?.formulaManifestContractIssues || 0);
  const backlogContractIssues = Number(formulaBacklog.summary?.formulaContractIssues || 0);
  const contractSourceFreshness = contractProof.sourceFreshness || {};
  const contractProofPass = /^pass_/i.test(String(contractProof.overall || ''));
  const freshSourcePass =
    freshRuntime.sourceShaMatchesExpected === true ||
    freshRuntime.sourceShaMatchesExpected === 'true' ||
    contractSourceFreshness.covers === true ||
    contractSourceFreshness.covers === 'true';
  const formulaCoveragePass = freshRuntime.formulaCoveragePass === true || freshRuntime.formulaCoveragePass === 'true';
  const requiredCoveragePass = freshRuntime.requiredCoveragePass === true || freshRuntime.requiredCoveragePass === 'true';
  const evidenceIssueCount = Number(freshRuntime.formulaEvidenceQualityIssues || 0);
  const pendingFreshFocus =
    /pending/i.test(freshRuntimeStatus) ||
    /contract_missing|contract_incomplete|missing_or_mismatch|pending/i.test(`${freshOverall} ${formulaBacklogOverall}`) ||
    freshManifestIssues > 0 ||
    backlogContractIssues > 0;
  const staleOrMissingSource = /stale|missing|pending|incomplete|mismatch/i.test(`${formulaBacklog.overall} ${freshFocus.overall} ${freshRuntimeStatus}`);
  const subreportRuntimeProofPass = !pendingFreshFocus && contractProofPass && freshSourcePass && formulaCoveragePass && requiredCoveragePass;
  const status = subreportRuntimeProofPass
    ? evidenceIssueCount > 0
      ? 'warn_runtime_formula_evidence_weak'
      : 'pass_runtime_proof_fields_present'
    : missingFields.length || staleOrMissingSource
      ? 'pending_fresh_runtime_proof_after_e3708e2f'
      : 'pass_runtime_proof_fields_present';
  return {
    status,
    expectedProducerHead: 'e3708e2f_or_later',
    fieldCoverage,
    missingFields,
    subreportSignals: {
      stage6FreshFocusOverall: freshFocus.overall,
      stage6FormulaTuningBacklogOverall: formulaBacklog.overall,
      stage6RuntimeFormulaContractProofOverall: contractProof.overall,
      freshFocusRuntimeProofStatus: freshRuntime.status,
      formulaEvidenceQualityIssues: Number.isFinite(evidenceIssueCount) ? evidenceIssueCount : null,
      formulaManifestContractIssues: Number.isFinite(freshManifestIssues) ? freshManifestIssues : null,
      formulaBacklogContractIssues: Number.isFinite(backlogContractIssues) ? backlogContractIssues : null,
      formulaEvidenceIssueReasonCounts: freshFocus.summary?.formulaEvidenceIssueReasonCounts || {},
      laneSpecificFormulaEvidenceIssueReasonCounts: freshFocus.summary?.laneSpecificFormulaEvidenceIssueReasonCounts || {},
      pendingFreshFocus
    },
    note: 'Runtime proof is intentionally separate from the Stage3-6 methodology audit. Fresh subreport proof takes precedence over raw finalist field coverage because zero-executable diagnostics may be emitted on audit rows beyond alpha_candidates.'
  };
}

function deriveStageVerdicts(stages, subreports, runtimeProof) {
  const quant = subreports.stage35QuantQuality;
  const methodology = subreports.stage35Methodology;
  const stage6Fresh = subreports.stage6FreshFocus;
  const stage6Blockers = subreports.stage6BlockerRootCause;
  return {
    Stage3: {
      verdict: stages.stage3.rowCount ? 'audited_report_only' : 'warn_missing_stage3_artifact',
      rows: stages.stage3.rowCount,
      source: stages.stage3.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage3.rows, STAGE_FIELD_GROUPS.stage3)
    },
    Stage4: {
      verdict: stages.stage4.rowCount ? 'audited_report_only' : 'warn_missing_stage4_artifact',
      rows: stages.stage4.rowCount,
      source: stages.stage4.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage4.rows, STAGE_FIELD_GROUPS.stage4)
    },
    Stage5: {
      verdict: stages.stage5.rowCount ? 'audited_report_only' : 'warn_missing_stage5_artifact',
      rows: stages.stage5.rowCount,
      source: stages.stage5.file,
      methodStatus: methodology.overall,
      quantStatus: quant.overall,
      coverage: coverage(stages.stage5.rows, STAGE_FIELD_GROUPS.stage5)
    },
    Stage6: {
      verdict:
        runtimeProof.status === 'pass_runtime_proof_fields_present'
          ? 'audited_runtime_proof_present'
          : runtimeProof.status === 'warn_runtime_formula_evidence_weak'
            ? 'warn_runtime_formula_evidence_weak'
            : 'warn_runtime_proof_pending',
      rows: stages.stage6.rowCount,
      source: stages.stage6.file,
      freshFocusStatus: stage6Fresh.overall,
      blockerRootCauseStatus: stage6Blockers.overall,
      coverage: coverage(stages.stage6.rows, STAGE_FIELD_GROUPS.stage6)
    }
  };
}

function deriveBlockerSummary(stage6Rows, subreports) {
  const fresh = subreports.stage6FreshFocus.summary || {};
  const blocker = subreports.stage6BlockerRootCause.summary || {};
  return {
    blockerCategoryCounts: fresh.blockerCategoryCounts || {},
    zeroExecutableTuningLaneCounts: fresh.zeroExecutableTuningLaneCounts || countBy(stage6Rows, (row) => row.zeroExecutableTuningLane),
    qualityGateLaneCounts: countBy(stage6Rows, (row) => row.qualityGateLane),
    structurePolicyBlockerLaneCounts: countBy(stage6Rows, (row) => row.structurePolicyBlockerLane),
    riskGeometryRepairLaneCounts: countBy(stage6Rows, (row) => row.riskGeometryRepairLane),
    breakoutRetestProofConfirmedCounts: countBy(stage6Rows, (row) => boolString(row.breakoutRetestProofConfirmed)),
    targetRecalibrationViabilityVerdictCounts: fresh.targetRecalibrationViabilityVerdictCounts || countBy(stage6Rows, (row) => row.targetRecalibrationViabilityVerdict),
    rootCauseSummary: {
      structureWaitRootCauses: blocker.structureWaitRootCauses || {},
      riskGeometryRootCauses: blocker.riskGeometryRootCauses || {},
      qualityGateRootCauses: blocker.qualityGateRootCauses || {}
    }
  };
}

function deriveOverall({ lineage, runtimeProof, stages }) {
  if (lineage.status === 'warn_artifacts_missing') return 'warn_artifacts_missing';
  if (lineage.status === 'warn_lineage_mismatch') return 'warn_lineage_mismatch';
  if (lineage.status === 'warn_lineage_incomplete') return 'warn_lineage_incomplete';
  if (Object.values(stages).some((stage) => stage.readError)) return 'warn_artifact_read_error';
  if (runtimeProof.status === 'warn_runtime_formula_evidence_weak') return 'warn_stage6_formula_evidence_weak';
  if (runtimeProof.status !== 'pass_runtime_proof_fields_present') return 'warn_stage6_runtime_proof_pending';
  return 'pass_stage3_6_full_stage_audit';
}

function nextActions(overall, lineage, runtimeProof) {
  const actions = [];
  if (lineage.status !== 'pass_same_run_lineage') {
    actions.push('Refresh or download same-run Stage3/4/5/6 artifacts before making a final full-chain quality judgement.');
    if (Array.isArray(lineage.reason) && lineage.reason.includes('stage5_source_stage4_missing')) {
      actions.push('Add or verify Stage5 manifest sourceStage4File/stage4File lineage so Stage4->Stage5 same-run ownership can be proven.');
    }
  }
  if (runtimeProof.status === 'warn_runtime_formula_evidence_weak') {
    actions.push('Refresh Stage6 formula evidence so neutral rows do not expose positive zero-executable tuning gaps.');
  } else if (runtimeProof.status !== 'pass_runtime_proof_fields_present') {
    actions.push('Wait for the next Auto-Scheduler run on e3708e2f or later, then run Track S6 runtime proof.');
  }
  if (overall === 'pass_stage3_6_full_stage_audit') {
    actions.push('Proceed to bounded Stage6 producer tuning only for proven formula or blocker defects.');
  } else {
    actions.push('Continue report-only Stage3-6 audit expansion; do not submit, replace, reprice, or mutate sidecar state.');
  }
  return actions;
}

function mdTable(headers, rows) {
  const safeRows = rows.length ? rows : [headers.map(() => 'N/A')];
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...safeRows.map((row) => `| ${row.map((cell) => String(cell ?? 'N/A').replace(/\n/g, '<br>')).join(' | ')} |`)
  ].join('\n');
}

function compactJson(value) {
  return JSON.stringify(value ?? {});
}

function coverageSummary(cov) {
  return Object.entries(cov || {})
    .map(([field, info]) => `${field}:${info.present}/${info.total}`)
    .join('<br>') || 'N/A';
}

function buildMarkdown(report) {
  const stageRows = Object.entries(report.stageVerdicts).map(([stage, verdict]) => [
    stage,
    verdict.verdict,
    verdict.rows,
    verdict.source || 'N/A',
    coverageSummary(verdict.coverage)
  ]);
  const lineageRows = [
    ['Stage4<-Stage3', report.lineage.stage4SourceStage3File || 'missing', report.lineage.stage3File || 'missing', report.lineage.stage4MatchesStage3, 'N/A'],
    ['Stage5<-Stage4', report.lineage.stage5SourceStage4File || 'missing', report.lineage.stage4File || 'missing', report.lineage.stage5MatchesStage4, report.lineage.stage5SourceStage4LineageStatus || 'missing'],
    ['Stage6<-Stage5', report.lineage.stage6SourceStage5File || 'missing', report.lineage.stage5File || 'missing', report.lineage.stage6MatchesStage5, 'N/A']
  ];
  const runtimeRows = Object.entries(report.runtimeProof.fieldCoverage).map(([field, info]) => [field, `${info.present}/${info.total}`, info.pct]);
  const runtimeMissingLabel = report.runtimeProof.status === 'pass_runtime_proof_fields_present'
    ? 'Raw finalist-only missing fields (non-blocking; subreport proof passed)'
    : 'Missing/Pending fields';
  const subreportRows = Object.entries(report.auditSources).map(([name, info]) => [name, info.present ? 'yes' : 'no', info.overall, info.generatedAt || 'N/A', info.path]);
  const blockerRows = Object.entries(report.blockerSummary)
    .filter(([key]) => key !== 'rootCauseSummary')
    .map(([key, value]) => [key, compactJson(value)]);

  return `# Stage3-6 Full Stage Audit\n\n` +
    `- GeneratedAt: ${report.generatedAt}\n` +
    `- Overall: **${report.overall}**\n` +
    `- Lineage: **${report.lineage.status}**; final quality judgement: **${report.lineage.finalQualityJudgement}**\n` +
    `- Stage6 Runtime Proof: **${report.runtimeProof.status}**\n` +
    `- Safety: report-only; brokerMutationAllowed=false; sidecarMutationAllowed=false.\n\n` +
    `## Lineage\n\n${mdTable(['Edge', 'Producer Source', 'Local Artifact', 'Match', 'Source Status'], lineageRows)}\n\n` +
    `Reasons: ${report.lineage.reason.join(', ')}\n\n` +
    `## Stage Verdicts\n\n${mdTable(['Stage', 'Verdict', 'Rows', 'Source', 'Coverage'], stageRows)}\n\n` +
    `## Stage6 Runtime Proof Gate\n\n` +
    `Expected producer head: ${report.runtimeProof.expectedProducerHead}\n\n` +
    `${mdTable(['Field', 'Present / Total', 'Pct'], runtimeRows)}\n\n` +
    `${runtimeMissingLabel}: ${report.runtimeProof.missingFields.length ? report.runtimeProof.missingFields.join(', ') : 'none'}\n\n` +
    `## Blocker Summary\n\n${mdTable(['Metric', 'Counts'], blockerRows)}\n\n` +
    `Root cause summary: ${compactJson(report.blockerSummary.rootCauseSummary)}\n\n` +
    `## Integrated Subreports\n\n${mdTable(['Report', 'Present', 'Overall', 'GeneratedAt', 'Path'], subreportRows)}\n\n` +
    `## Next Actions\n\n${report.nextActions.map((item) => `- ${item}`).join('\n')}\n\n` +
    `## Interpretation\n\n` +
    `- This report does not prove alpha performance or live readiness.\n` +
    `- A lineage warning means formulas can still be reviewed, but final full-chain quality judgement is withheld until same-run artifacts are available.\n` +
    `- Stage6 runtime proof is a separate gate; missing fresh proof must not stop Stage3-6 methodology auditing.\n` +
    `- Broker submit/reprice/replace and sidecar mutation are outside this audit.\n`;
}

function main() {
  const generatedAt = new Date().toISOString();
  const stages = Object.fromEntries(Object.keys(STAGE_CONFIGS).map((stageKey) => [stageKey, loadStage(stageKey)]));
  const subreports = summarizeSubreports();
  const lineage = deriveLineage(stages);
  const runtimeProof = deriveRuntimeProof(stages.stage6.rows, subreports);
  const stageVerdicts = deriveStageVerdicts(stages, subreports, runtimeProof);
  const blockerSummary = deriveBlockerSummary(stages.stage6.rows, subreports);
  const overall = deriveOverall({ lineage, runtimeProof, stages });
  const report = {
    schemaVersion: 'stage3_6_full_stage_audit.v1',
    generatedAt,
    overall,
    safety: {
      reportOnly: true,
      brokerMutationAllowed: false,
      sidecarMutationAllowed: false,
      executionPolicyChanged: false
    },
    inputs: Object.fromEntries(Object.entries(stages).map(([key, stage]) => [key, {
      file: stage.file,
      path: stage.path,
      hash: stage.hash,
      source: stage.source,
      missing: stage.missing,
      rowCount: stage.rowCount,
      manifest: stage.manifest
    }])),
    lineage,
    runtimeProof,
    stageVerdicts,
    blockerSummary,
    auditSources: subreports,
    nextActions: nextActions(overall, lineage, runtimeProof)
  };

  writeJsonAtomic(OUT_JSON, report);
  writeTextAtomic(OUT_MD, buildMarkdown(report));
  console.log(`[STAGE3_6_FULL_AUDIT] overall=${overall} lineage=${lineage.status} runtimeProof=${runtimeProof.status}`);
  console.log(`[STAGE3_6_FULL_AUDIT] json=${OUT_JSON} md=${OUT_MD}`);
}

main();
