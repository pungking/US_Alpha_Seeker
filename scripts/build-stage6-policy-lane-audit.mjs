#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_INPUT = 'state/stage6-execution-gate-audit.json';
const DEFAULT_OUT_JSON = 'state/stage6-policy-lane-audit.json';
const DEFAULT_OUT_MD = 'docs/STAGE6_POLICY_LANE_AUDIT_2026-05-29.md';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, filePath), 'utf8'));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, filePath)), { recursive: true });
}

function numberOrNull(value) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fmt(value, digits = 2) {
  const n = numberOrNull(value);
  return n == null ? 'N/A' : n.toFixed(digits);
}

function esc(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function countBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row) || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function isLatestRow(row, latestStage6File) {
  return !latestStage6File || row.stage6File === latestStage6File;
}

function isBuyOrStrongBuy(row) {
  const verdict = String(row?.verdict || '').toUpperCase();
  return verdict === 'BUY' || verdict === 'STRONG_BUY' || verdict === 'STRONGBUY';
}

function isReason(row, reason) {
  return String(row?.decisionReason || '').toLowerCase() === reason;
}

function isValidGeometry(row) {
  return row.geometryStatus === 'VALID_GEOMETRY';
}

function isCurrentRrAcceptable(row) {
  return row.currentRrStatus === 'RR_CURRENT_ACCEPTABLE';
}

function hasDeepDistance(row) {
  return row.entryDistanceStatus === 'DISTANCE_DEEP_PULLBACK';
}

function textIncludes(value, token) {
  return String(value || '').toLowerCase().includes(String(token || '').toLowerCase());
}

function rowReasonText(row, field) {
  const value = row?.[field];
  if (Array.isArray(value)) return value.map((item) => String(item || '')).join('|');
  return String(value || '');
}

function targetNearCurrentDecision(row) {
  if (!isReason(row, 'wait_target_near_current')) return null;
  if (row.targetRecalibrationVerdict) {
    return {
      laneDecision: row.targetRecalibrationVerdict,
      recommendedAction: row.targetRecalibrationRecommendedAction || 'Recompute target/stop thesis; do not use sidecar chase to make this executable.'
    };
  }
  if (row.currentRrStatus === 'RR_CURRENT_TARGET_ALREADY_REACHED') {
    return {
      laneDecision: 'TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE',
      recommendedAction: 'Keep no-trade; require target refresh or fresh thesis before any execution candidate.'
    };
  }
  return {
    laneDecision: 'TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED',
    recommendedAction: 'Recompute target/stop thesis; do not use sidecar chase to make this executable.'
  };
}

function riskGeometryDecision(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  const riskReasons = new Set([
    'blocked_invalid_geometry',
    'blocked_stop_too_tight',
    'blocked_stop_too_wide',
    'blocked_target_too_close',
    'blocked_rr_below_min',
    'wait_current_rr_below_min',
    'wait_recalculated_stop_required'
  ]);
  if (!riskReasons.has(reason)) return null;
  if (row.riskGeometryPolicyVerdict) {
    return {
      laneDecision: row.riskGeometryPolicyVerdict,
      recommendedAction:
        row.riskGeometryRecommendedAction ||
        'Keep WAIT/BLOCKED until Stage6 emits valid recalibration proof; do not relax sidecar risk gates.'
    };
  }
  if (reason === 'blocked_stop_too_tight' || reason === 'blocked_stop_too_wide') {
    return {
      laneDecision: 'STOP_GEOMETRY_RECALIBRATION_REQUIRED',
      recommendedAction: 'Stop geometry must be fixed by Stage6 recalibration proof; do not lower sidecar stop-distance gates.'
    };
  }
  if (reason === 'blocked_rr_below_min' || reason === 'wait_current_rr_below_min') {
    return {
      laneDecision: 'RR_GEOMETRY_WAIT_JUSTIFIED',
      recommendedAction: 'Keep WAIT/BLOCKED unless recalculated stop and target buffer prove current-entry RR is valid.'
    };
  }
  return {
    laneDecision: 'RISK_GEOMETRY_NO_TRADE_REVIEW',
    recommendedAction: 'Treat as no-trade or producer-side geometry recalibration. Sidecar reprice/replace is out of scope.'
  };
}

function earningsMissingDecision(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  if (reason !== 'wait_earnings_data_missing_quality_floor' && reason !== 'wait_earnings_data_missing') return null;
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && row.entryDistanceStatus === 'DISTANCE_EXECUTION_WINDOW') {
    return {
      laneDecision: 'EARNINGS_DATA_OVERBLOCK_REVIEW_READY',
      recommendedAction: 'Do not lower quality gates blindly; first repair earnings coverage/freshness, then rerun Stage6.'
    };
  }
  return {
    laneDecision: 'EARNINGS_DATA_COVERAGE_REQUIRED',
    recommendedAction: 'Separate data freshness/coverage from execution policy; current evidence does not justify promotion.'
  };
}

function breakoutDecision(row) {
  if (!isReason(row, 'wait_breakout_retest_required')) return null;
  if (row.breakoutRetestPromotionVerdict) {
    return {
      laneDecision: row.breakoutRetestPromotionVerdict,
      recommendedAction:
        row.breakoutRetestPromotionRecommendedAction ||
        'Review-ready is diagnostic only. Promotion requires proofConfirmed=true and an explicit producer policy flag.'
    };
  }
  if (row.breakoutRetestProofConfirmed === true || row.breakoutRetestProofVerdict === 'BREAKOUT_RETEST_CONFIRMED_CURRENT_ENTRY_CANDIDATE') {
    return {
      laneDecision: 'BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY',
      recommendedAction: 'Producer has explicit retest proof; next step is a separate Stage6 policy decision, not sidecar auto-promotion.'
    };
  }
  if (row.breakoutRetestProofReviewReady === true || row.breakoutRetestProofVerdict === 'BREAKOUT_RETEST_PROOF_REVIEW_READY') {
    const reasons = rowReasonText(row, 'breakoutRetestProofReasons');
    if (textIncludes(reasons, 'retest_stale') || textIncludes(reasons, 'extension')) {
      return {
        laneDecision: 'BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE',
        recommendedAction: 'Retest evidence exists but is stale or over-extended; keep WAIT_PRICE until producer emits confirmed fresh retest proof.'
      };
    }
    return {
      laneDecision: 'BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_CONFIRMED',
      recommendedAction: 'Review-ready is not executable proof. Stage6 must emit proofConfirmed=true before promotion can be considered.'
    };
  }
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && hasDeepDistance(row)) {
    return {
      laneDecision: 'BREAKOUT_RETEST_POLICY_REVIEW_READY',
      recommendedAction: 'Design a Stage6 breakout/retest proof lane with explicit retest evidence; do not promote by sidecar chase.'
    };
  }
  if (isValidGeometry(row) && isCurrentRrAcceptable(row)) {
    return {
      laneDecision: 'BREAKOUT_RETEST_REVIEW_LOW_DISTANCE',
      recommendedAction: 'Inspect retest evidence; promotion still requires Stage6 producer proof fields.'
    };
  }
  return {
    laneDecision: 'BREAKOUT_RETEST_WAIT_JUSTIFIED',
    recommendedAction: 'Keep WAIT_PRICE until retest/current RR evidence improves.'
  };
}

function structureDecision(row) {
  if (!isReason(row, 'wait_structure_confirmation_required')) return null;
  if (row.structurePolicyVerdict) {
    return {
      laneDecision: row.structurePolicyVerdict,
      recommendedAction:
        row.structurePolicyRecommendedAction ||
        'Keep WAIT_PRICE unless fresh structure proof changes in the next Stage6 artifact.'
    };
  }
  const structureVerdict = String(row.currentEntryStructureVerdict || '').trim();
  const missingStructureEvidence = !structureVerdict || structureVerdict === 'N/A';
  const structureRejected = structureVerdict.startsWith('STRUCTURE_REJECT');
  if (structureRejected && isValidGeometry(row) && isCurrentRrAcceptable(row)) {
    return {
      laneDecision: 'STRUCTURE_CONFIRMATION_REJECT_REVIEW_READY',
      recommendedAction: 'Current RR is acceptable but structure proof rejected; inspect stop/support evidence before changing producer policy.'
    };
  }
  if (structureRejected) {
    return {
      laneDecision: 'STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED',
      recommendedAction: 'Keep WAIT_PRICE. Stage6 supplied explicit structure rejection metadata, so this is not a broad unproven wait.'
    };
  }
  if (isValidGeometry(row) && isCurrentRrAcceptable(row) && missingStructureEvidence) {
    return {
      laneDecision: 'STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY',
      recommendedAction: 'Add explicit current structure evidence fields; avoid broad WAIT without proof metadata.'
    };
  }
  if (isValidGeometry(row) && missingStructureEvidence) {
    return {
      laneDecision: 'STRUCTURE_WAIT_JUSTIFIED_BY_RR_BUT_METADATA_MISSING',
      recommendedAction: 'WAIT is defensible from current RR/distance, but Stage6 should still emit structure proof/failure metadata.'
    };
  }
  return {
    laneDecision: 'STRUCTURE_CONFIRMATION_WAIT_JUSTIFIED',
    recommendedAction: 'Keep WAIT_PRICE unless structure proof changes in the next Stage6 artifact.'
  };
}

function currentDistanceDecision(row) {
  if (!isReason(row, 'wait_current_distance_above_adaptive')) return null;
  return {
    laneDecision: 'CURRENT_ENTRY_DISTANCE_POLICY_REVIEW_READY',
    recommendedAction: 'Do not chase via sidecar; decide whether Stage6 should wait for pullback, create a bounded reprice lane, or require fresh current-entry proof.'
  };
}

function actionableVerdictDecision(row) {
  if (!isReason(row, 'wait_verdict_not_sidecar_actionable')) return null;
  return {
    laneDecision: 'ACTIONABLE_VERDICT_CONTRACT_WAIT',
    recommendedAction: 'Keep WAIT_PRICE. Stage6 may track speculative alpha, but executablePicks must match sidecar actionable verdicts unless an explicit producer waiver is approved.'
  };
}

function classifyPolicyLane(row) {
  return (
    actionableVerdictDecision(row) ||
    currentDistanceDecision(row) ||
    breakoutDecision(row) ||
    structureDecision(row) ||
    riskGeometryDecision(row) ||
    targetNearCurrentDecision(row) ||
    earningsMissingDecision(row) ||
    {
      laneDecision: 'OUT_OF_SCOPE_FOR_POLICY_LANE',
      recommendedAction: 'Use execution gate audit blocker class and sidecar-safe validation path.'
    }
  );
}

function laneName(row) {
  if (isReason(row, 'wait_verdict_not_sidecar_actionable')) return 'actionableVerdictContract';
  if (isReason(row, 'wait_breakout_retest_required')) return 'breakoutRetest';
  if (isReason(row, 'wait_current_distance_above_adaptive')) return 'currentDistance';
  if (isReason(row, 'wait_structure_confirmation_required')) return 'structureConfirmation';
  if (
    isReason(row, 'blocked_invalid_geometry') ||
    isReason(row, 'blocked_stop_too_tight') ||
    isReason(row, 'blocked_stop_too_wide') ||
    isReason(row, 'blocked_target_too_close') ||
    isReason(row, 'blocked_rr_below_min') ||
    isReason(row, 'wait_current_rr_below_min') ||
    isReason(row, 'wait_recalculated_stop_required')
  ) return 'riskGeometry';
  if (isReason(row, 'wait_target_near_current')) return 'targetNearCurrent';
  if (isReason(row, 'wait_earnings_data_missing_quality_floor') || isReason(row, 'wait_earnings_data_missing')) return 'earningsDataMissing';
  return 'other';
}

function proofStats(rows) {
  const structureRows = rows.filter((row) => row.lane === 'structureConfirmation');
  const breakoutRows = rows.filter((row) => row.lane === 'breakoutRetest');
  return {
    structure: {
      rows: structureRows.length,
      missingProofMetadata: structureRows.filter((row) => !row.currentEntryStructureVerdict).length,
      explicitRejects: structureRows.filter((row) => String(row.currentEntryStructureVerdict || '').startsWith('STRUCTURE_REJECT')).length,
      confirmed: structureRows.filter((row) => row.currentEntryStructureConfirmed === true).length,
      currentRrAcceptable: structureRows.filter(isCurrentRrAcceptable).length,
      reviewReady: structureRows.filter((row) => String(row.laneDecision || '').includes('REVIEW_READY')).length
    },
    breakout: {
      rows: breakoutRows.length,
      proofConfirmed: breakoutRows.filter((row) => row.breakoutRetestProofConfirmed === true).length,
      proofReviewReady: breakoutRows.filter((row) => row.breakoutRetestProofReviewReady === true).length,
      staleOrExtended: breakoutRows.filter((row) => {
        const reasons = rowReasonText(row, 'breakoutRetestProofReasons');
        return textIncludes(reasons, 'retest_stale') || textIncludes(reasons, 'extension');
      }).length,
      currentRrAcceptable: breakoutRows.filter(isCurrentRrAcceptable).length,
      reviewReady: breakoutRows.filter((row) => String(row.laneDecision || '').includes('REVIEW_READY')).length
    }
  };
}

function isQualityGateReason(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  return (
    reason === 'wait_earnings_data_missing_quality_floor' ||
    reason === 'wait_earnings_data_missing' ||
    reason === 'wait_verdict_not_sidecar_actionable' ||
    reason.startsWith('blocked_quality_')
  );
}

function qualityGateLane(row) {
  const reason = String(row?.decisionReason || '').toLowerCase();
  if (reason === 'wait_earnings_data_missing_quality_floor' || reason === 'wait_earnings_data_missing') {
    return 'earnings_data_coverage';
  }
  if (reason === 'wait_verdict_not_sidecar_actionable') return 'non_actionable_verdict';
  if (reason === 'blocked_quality_verdict_unusable') return 'verdict_unusable';
  if (reason === 'blocked_quality_conviction_floor') return 'conviction_floor';
  if (reason === 'blocked_quality_missing_expected_return') return 'expected_return_missing';
  return 'quality_gate_other';
}

function qualityGateDecision(row) {
  const lane = qualityGateLane(row);
  if (lane === 'earnings_data_coverage') {
    return {
      qualityGateLane: lane,
      laneDecision: 'QUALITY_GATE_EARNINGS_COVERAGE_REQUIRED',
      recommendedAction: 'Keep WAIT_PRICE. Repair earnings coverage/freshness first; do not lower execution gates or solve this in sidecar.'
    };
  }
  if (lane === 'non_actionable_verdict') {
    return {
      qualityGateLane: lane,
      laneDecision: 'QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT',
      recommendedAction: 'Keep WAIT_PRICE. SPECULATIVE_BUY/HOLD-style rows are analysis watchlist only unless Stage6 emits an explicit waiver.'
    };
  }
  if (lane === 'verdict_unusable') {
    return {
      qualityGateLane: lane,
      laneDecision: 'QUALITY_GATE_VERDICT_UNUSABLE_REVIEW',
      recommendedAction: 'Inspect AI verdict normalization and source response before changing execution policy.'
    };
  }
  return {
    qualityGateLane: lane,
    laneDecision: 'QUALITY_GATE_WAIT_JUSTIFIED',
    recommendedAction: 'Keep blocked/wait until Stage6 quality evidence is complete and actionable.'
  };
}

function buildReport(input) {
  const latestStage6File = input.latestRun?.stage6File || input.runSummaries?.[0]?.stage6File || null;
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const latestAllRows = rows.filter((row) => isLatestRow(row, latestStage6File));
  const latestQualityGateRows = latestAllRows
    .filter(isQualityGateReason)
    .map((row) => ({ ...row, lane: 'qualityGate', ...qualityGateDecision(row) }));
  const watchlistRows = rows
    .filter((row) => String(row.finalDecision || '').toUpperCase() !== 'EXECUTABLE_NOW')
    .filter(isBuyOrStrongBuy)
    .map((row) => ({ ...row, lane: laneName(row), ...classifyPolicyLane(row) }));
  const latestRows = watchlistRows.filter((row) => isLatestRow(row, latestStage6File));
  const lanes = {
    breakoutRetest: watchlistRows.filter((row) => row.lane === 'breakoutRetest'),
    currentDistance: watchlistRows.filter((row) => row.lane === 'currentDistance'),
    structureConfirmation: watchlistRows.filter((row) => row.lane === 'structureConfirmation'),
    riskGeometry: watchlistRows.filter((row) => row.lane === 'riskGeometry'),
    targetNearCurrent: watchlistRows.filter((row) => row.lane === 'targetNearCurrent'),
    earningsDataMissing: watchlistRows.filter((row) => row.lane === 'earningsDataMissing')
  };
  const latestLaneRows = {
    breakoutRetest: latestRows.filter((row) => row.lane === 'breakoutRetest'),
    currentDistance: latestRows.filter((row) => row.lane === 'currentDistance'),
    structureConfirmation: latestRows.filter((row) => row.lane === 'structureConfirmation'),
    riskGeometry: latestRows.filter((row) => row.lane === 'riskGeometry'),
    targetNearCurrent: latestRows.filter((row) => row.lane === 'targetNearCurrent'),
    earningsDataMissing: latestRows.filter((row) => row.lane === 'earningsDataMissing')
  };
  const reviewReadyDecisions = new Set([
    'STRUCTURE_EXPLICIT_REJECT_OVERBLOCK_REVIEW_READY',
    'STRUCTURE_PROOF_MISSING_OVERBLOCK_REVIEW_READY',
    'STRUCTURE_CONFIRMED_WAIT_REVIEW_READY',
    'BREAKOUT_REVIEW_READY_NOT_PROMOTABLE',
    'BREAKOUT_PROOF_CONFIRMED_PROMOTION_DISABLED',
    'TARGET_NEAR_CURRENT_RECALIBRATION_REQUIRED',
    'BREAKOUT_RETEST_POLICY_REVIEW_READY',
    'BREAKOUT_RETEST_REVIEW_LOW_DISTANCE',
    'BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY',
    'BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE',
    'BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_CONFIRMED',
    'CURRENT_ENTRY_DISTANCE_POLICY_REVIEW_READY',
    'STOP_GEOMETRY_RECALCULATED_STOP_REVIEW_READY',
    'RECALCULATED_STOP_POLICY_REVIEW_READY',
    'RR_GEOMETRY_RECALCULATED_STOP_REVIEW_READY',
    'STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY',
    'STRUCTURE_CONFIRMATION_REJECT_REVIEW_READY',
    'EARNINGS_DATA_OVERBLOCK_REVIEW_READY'
  ]);
  const promotionReviewReadyDecisions = new Set([
    'BREAKOUT_PROOF_CONFIRMED_PROMOTION_DISABLED',
    'BREAKOUT_PROOF_CONFIRMED_PROMOTION_ENABLED',
    'BREAKOUT_RETEST_POLICY_REVIEW_READY',
    'BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY',
    'CURRENT_ENTRY_DISTANCE_POLICY_REVIEW_READY',
    'STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY',
    'STRUCTURE_CONFIRMATION_REJECT_REVIEW_READY',
    'EARNINGS_DATA_OVERBLOCK_REVIEW_READY'
  ]);
  const latestReviewReadyRows = latestRows.filter((row) => reviewReadyDecisions.has(row.laneDecision));
  const latestPromotionReviewReadyRows = latestRows.filter((row) => promotionReviewReadyDecisions.has(row.laneDecision));
  const summary = {
    sourceAuditGeneratedAt: input.generatedAt || null,
    latestStage6File,
    rows: watchlistRows.length,
    latestRows: latestRows.length,
    latestReviewReadyRows: latestReviewReadyRows.length,
    latestPromotionReviewReadyRows: latestPromotionReviewReadyRows.length,
    laneCounts: countBy(watchlistRows, (row) => row.lane),
    latestLaneCounts: countBy(latestRows, (row) => row.lane),
    decisionCounts: countBy(watchlistRows, (row) => row.laneDecision),
    latestDecisionCounts: countBy(latestRows, (row) => row.laneDecision),
    latestQualityGateRows: latestQualityGateRows.length,
    latestQualityGateLaneCounts: countBy(latestQualityGateRows, (row) => row.qualityGateLane),
    latestQualityGateDecisionCounts: countBy(latestQualityGateRows, (row) => row.laneDecision),
    confirmationProofQuality: {
      all: proofStats(watchlistRows),
      latest: proofStats(latestRows),
      promotionRule: 'reviewReady is diagnostic only; only proofConfirmed plus a separate producer policy change can create EXECUTABLE_NOW',
      breakoutProofConfirmedCriteria: [
        'current_rr_and_target_buffer_pass',
        'retest_touch_found',
        'retest_fresh_within_maxBarsSinceRetest',
        'current_extension_within_maxCurrentExtensionFromRetestPct',
        'latest_close_above_retest_level'
      ],
      structureOverblockRule: 'structure wait is overblock-review only when explicit reject or missing proof coexists with acceptable current RR, target buffer, and distance inside the structure review band'
    },
    brokerMutationAuthorized: false,
    executionPolicyChanged: false
  };
  const latestVerdict =
    latestPromotionReviewReadyRows.length > 0
      ? 'STAGE6_PRODUCER_POLICY_REVIEW_REQUIRED'
      : latestRows.length > 0
        ? 'WATCHLIST_WAIT_JUSTIFIED_OR_DATA_REPAIR_REQUIRED'
        : 'NO_BUY_STRONG_BUY_WATCHLIST_ROWS';
  return {
    generatedAt: new Date().toISOString(),
    sourceAudit: DEFAULT_INPUT,
    safety: {
      brokerMutationAuthorized: false,
      executionPolicyChanged: false,
      reason: 'analysis-only Stage6 producer policy audit; sidecar submit/reprice/replace remains out of scope'
    },
    summary: { ...summary, latestVerdict },
    latestReviewReadyRows: latestReviewReadyRows.map(compactRow),
    latestQualityGateRows: latestQualityGateRows.map(compactRow),
    latestRows: latestRows.map(compactRow),
    laneSummary: Object.fromEntries(
      Object.entries(lanes).map(([key, laneRows]) => [
        key,
        {
          rows: laneRows.length,
          latestRows: latestLaneRows[key]?.length || 0,
          decisionCounts: countBy(laneRows, (row) => row.laneDecision),
          latestDecisionCounts: countBy(latestLaneRows[key] || [], (row) => row.laneDecision)
        }
      ])
    ),
    rows: watchlistRows.map(compactRow)
  };
}

function compactRow(row) {
  return {
    stage6File: row.stage6File,
    symbol: row.symbol,
    verdict: row.verdict,
    lane: row.lane,
    finalDecision: row.finalDecision,
    decisionReason: row.decisionReason,
    executionBucket: row.executionBucket,
    entryDistanceStatus: row.entryDistanceStatus,
    geometryStatus: row.geometryStatus,
    currentRrStatus: row.currentRrStatus,
    laneDecision: row.laneDecision,
    recommendedAction: row.recommendedAction,
    expectedReturnPct: row.expectedReturnPct,
    rr: row.rr,
    rrAtCurrentPrice: row.rrAtCurrentPrice,
    entryDistancePct: row.entryDistancePct,
    targetBufferFromCurrentPct: row.targetBufferFromCurrentPct,
    price: row.price,
    entry: row.entry,
    target: row.target,
    stop: row.stop,
    currentEntryStructureVerdict: row.currentEntryStructureVerdict || null,
    currentEntryStructureConfirmed: Boolean(row.currentEntryStructureConfirmed),
    currentEntryStructureReasons: row.currentEntryStructureReasons || [],
    structurePolicyVerdict: row.structurePolicyVerdict || null,
    structurePolicyReviewReady: Boolean(row.structurePolicyReviewReady),
    structurePolicyReasons: row.structurePolicyReasons || [],
    breakoutRetestProofVerdict: row.breakoutRetestProofVerdict || null,
    breakoutRetestProofConfirmed: Boolean(row.breakoutRetestProofConfirmed),
    breakoutRetestProofReviewReady: Boolean(row.breakoutRetestProofReviewReady),
    breakoutRetestProofReasons: row.breakoutRetestProofReasons || [],
    breakoutRetestProofRetestLevel: row.breakoutRetestProofRetestLevel ?? null,
    breakoutRetestProofBarsSinceRetest: row.breakoutRetestProofBarsSinceRetest ?? null,
    breakoutRetestProofCurrentExtensionPct: row.breakoutRetestProofCurrentExtensionPct ?? null,
    breakoutRetestProofTolerancePct: row.breakoutRetestProofTolerancePct ?? null,
    breakoutRetestProofMaxBarsSinceRetest: row.breakoutRetestProofMaxBarsSinceRetest ?? null,
    breakoutRetestProofMaxExtensionPct: row.breakoutRetestProofMaxExtensionPct ?? null,
    breakoutRetestProofRetestTouchFound: row.breakoutRetestProofRetestTouchFound ?? null,
    breakoutRetestProofRetestFresh: row.breakoutRetestProofRetestFresh ?? null,
    breakoutRetestProofCurrentExtensionOk: row.breakoutRetestProofCurrentExtensionOk ?? null,
    breakoutRetestProofLatestCloseAboveRetest: row.breakoutRetestProofLatestCloseAboveRetest ?? null,
    breakoutRetestPromotionVerdict: row.breakoutRetestPromotionVerdict || null,
    breakoutRetestPromotionEligible: Boolean(row.breakoutRetestPromotionEligible),
    breakoutRetestPromotionEnabled: Boolean(row.breakoutRetestPromotionEnabled),
    breakoutRetestPromotionReasons: row.breakoutRetestPromotionReasons || [],
    targetRecalibrationVerdict: row.targetRecalibrationVerdict || null,
    targetRecalibrationRequired: Boolean(row.targetRecalibrationRequired),
    targetNoChaseRequired: Boolean(row.targetNoChaseRequired),
    targetRecalibrationCurrentTargetPrice: row.targetRecalibrationCurrentTargetPrice ?? null,
    targetRecalibrationRequiredTargetPrice: row.targetRecalibrationRequiredTargetPrice ?? null,
    targetRecalibrationRequiredTargetBufferPct: row.targetRecalibrationRequiredTargetBufferPct ?? null,
    targetRecalibrationRequiredRr: row.targetRecalibrationRequiredRr ?? null,
    targetRecalibrationCurrentTargetGapPct: row.targetRecalibrationCurrentTargetGapPct ?? null,
    targetRecalibrationCandidate: row.targetRecalibrationCandidate ?? null,
    targetNoTradeConfirmed: row.targetNoTradeConfirmed ?? null,
    targetRecalibrationViabilityVerdict: row.targetRecalibrationViabilityVerdict || null,
    targetRecalibrationViabilityReasons: row.targetRecalibrationViabilityReasons || [],
    targetRecalibrationGapPolicyPct: row.targetRecalibrationGapPolicyPct ?? null,
    targetRecalibrationReasons: row.targetRecalibrationReasons || [],
    riskGeometryPolicyVerdict: row.riskGeometryPolicyVerdict || null,
    riskGeometryRecalibrationRequired: Boolean(row.riskGeometryRecalibrationRequired),
    riskGeometryNoTradeRequired: Boolean(row.riskGeometryNoTradeRequired),
    riskGeometryRecalculatedStopCandidate: Boolean(row.riskGeometryRecalculatedStopCandidate),
    riskGeometryProofVerdict: row.riskGeometryProofVerdict || null,
    riskGeometryRecalculatedStopPrice: row.riskGeometryRecalculatedStopPrice ?? null,
    riskGeometryRecalculatedStopDistancePct: row.riskGeometryRecalculatedStopDistancePct ?? null,
    riskGeometryRrAtRecalculatedStop: row.riskGeometryRrAtRecalculatedStop ?? null,
    riskGeometryTargetBufferPct: row.riskGeometryTargetBufferPct ?? null,
    riskGeometryProofReasons: row.riskGeometryProofReasons || [],
    riskGeometryReasons: row.riskGeometryReasons || [],
    blockerClass: row.blockerClass,
    fixLane: row.fixLane,
    zeroExecutableTuningLane: row.zeroExecutableTuningLane || null,
    zeroExecutableTuningVerdict: row.zeroExecutableTuningVerdict || null,
    zeroExecutablePrimaryTuningTarget: row.zeroExecutablePrimaryTuningTarget ?? null,
    zeroExecutableTuningReasons: row.zeroExecutableTuningReasons || [],
    zeroExecutableTuningRecommendedAction: row.zeroExecutableTuningRecommendedAction || null,
    qualityGateLane: row.qualityGateLane || null
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Stage6 Policy Lane Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- Source Audit: ${report.sourceAudit}`);
  lines.push(`- Latest Stage6: ${report.summary.latestStage6File || 'N/A'}`);
  lines.push(`- Latest Verdict: **${report.summary.latestVerdict}**`);
  lines.push(`- Latest Review-Ready Rows: ${report.summary.latestReviewReadyRows}`);
  lines.push(`- Latest Promotion-Review Rows: ${report.summary.latestPromotionReviewReadyRows}`);
  lines.push(`- Latest Quality-Gate Rows: ${report.summary.latestQualityGateRows}`);
  lines.push(`- Broker Mutation Authorized: ${report.safety.brokerMutationAuthorized}`);
  lines.push(`- Execution Policy Changed: ${report.safety.executionPolicyChanged}`);
  lines.push(`- Safety Reason: ${report.safety.reason}`);
  lines.push(`- Promotion Rule: ${report.summary.confirmationProofQuality?.promotionRule || 'N/A'}`);
  lines.push('');
  lines.push('## Latest Lane Summary');
  lines.push('');
  lines.push('| Lane | Latest Rows | Latest Decisions |');
  lines.push('| --- | ---: | --- |');
  for (const [lane, info] of Object.entries(report.laneSummary)) {
    const latestDecisions = Object.entries(info.latestDecisionCounts || {})
      .map(([key, value]) => `${key}:${value}`)
      .join(', ') || 'none';
    lines.push(`| ${esc(lane)} | ${info.latestRows} | ${esc(latestDecisions)} |`);
  }
  lines.push('');
  lines.push('## Confirmation Proof Quality');
  lines.push('');
  lines.push('| Scope | Lane | Rows | Missing Proof | Explicit Rejects | Confirmed | Review Ready | Stale/Extended | Current RR OK |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  const proofScopes = [
    ['latest', report.summary.confirmationProofQuality?.latest],
    ['all', report.summary.confirmationProofQuality?.all]
  ];
  for (const [scope, stats] of proofScopes) {
    const structure = stats?.structure || {};
    const breakout = stats?.breakout || {};
    lines.push(`| ${scope} | structureConfirmation | ${structure.rows || 0} | ${structure.missingProofMetadata || 0} | ${structure.explicitRejects || 0} | ${structure.confirmed || 0} | ${structure.reviewReady || 0} | 0 | ${structure.currentRrAcceptable || 0} |`);
    lines.push(`| ${scope} | breakoutRetest | ${breakout.rows || 0} | 0 | 0 | ${breakout.proofConfirmed || 0} | ${breakout.proofReviewReady || 0} | ${breakout.staleOrExtended || 0} | ${breakout.currentRrAcceptable || 0} |`);
  }
  lines.push('');
  lines.push('### Proof Criteria');
  lines.push('');
  lines.push(`- Breakout proofConfirmed requires: ${(report.summary.confirmationProofQuality?.breakoutProofConfirmedCriteria || []).join(', ') || 'N/A'}.`);
  lines.push(`- Structure overblock review rule: ${report.summary.confirmationProofQuality?.structureOverblockRule || 'N/A'}.`);
  lines.push('');
  lines.push('## Latest Quality Gate Separation');
  lines.push('');
  lines.push('| Symbol | Verdict | Quality Lane | Stage6 Reason | Lane Decision | Target Verdict | Target Viability | Zero-Exec Lane | Action |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.latestQualityGateRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(row.qualityGateLane)} | ${esc(row.decisionReason)} | ${esc(row.laneDecision)} | ${esc(row.targetRecalibrationVerdict)} | ${esc(row.targetRecalibrationViabilityVerdict)} | ${esc(row.zeroExecutableTuningLane)} | ${esc(row.recommendedAction)} |`);
  }
  if (report.latestQualityGateRows.length === 0) lines.push('| none | none | none | none | none | none | none | none | none |');
  lines.push('');
  lines.push('## Latest Review-Ready Rows');
  lines.push('');
  lines.push('| Symbol | Lane | Decision | ER% | RR | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Action |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestReviewReadyRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.lane)} | ${esc(row.laneDecision)} | ${fmt(row.expectedReturnPct)} | ${fmt(row.rr)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${fmt(row.targetBufferFromCurrentPct)} | ${esc(row.geometryStatus)} | ${esc(row.currentRrStatus)} | ${esc(row.recommendedAction)} |`);
  }
  if (report.latestReviewReadyRows.length === 0) lines.push('| none | none | none | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A |');
  lines.push('');
  lines.push('## Latest Rows');
  lines.push('');
  lines.push('| Symbol | Verdict | Lane | Stage6 Reason | Lane Decision | ER% | RR@Cur | Dist% | TargetBuf% | Geometry | CurRR | Recommended Action |');
  lines.push('| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.latestRows) {
    lines.push(`| ${esc(row.symbol)} | ${esc(row.verdict)} | ${esc(row.lane)} | ${esc(row.decisionReason)} | ${esc(row.laneDecision)} | ${fmt(row.expectedReturnPct)} | ${fmt(row.rrAtCurrentPrice)} | ${fmt(row.entryDistancePct)} | ${fmt(row.targetBufferFromCurrentPct)} | ${esc(row.geometryStatus)} | ${esc(row.currentRrStatus)} | ${esc(row.recommendedAction)} |`);
  }
  lines.push('');
  lines.push('## Policy Interpretation');
  lines.push('');
  lines.push('- `BREAKOUT_RETEST_POLICY_REVIEW_READY` means current RR and geometry are good, but Stage6 lacks explicit retest proof. This is producer-side policy review, not sidecar chase approval.');
  lines.push('- `BREAKOUT_RETEST_PROOF_REVIEW_READY_NOT_PROMOTABLE` means retest metadata exists but is stale or over-extended. This is a WAIT justification, not an execution unlock.');
  lines.push('- `BREAKOUT_RETEST_PROOF_CONFIRMED_REVIEW_READY` means optional producer proof metadata is present and confirmed. It still requires a separate Stage6 policy change before any executable promotion.');
  lines.push('- `STRUCTURE_CONFIRMATION_EXPLICIT_REJECT_WAIT_JUSTIFIED` means Stage6 produced explicit structure rejection evidence, so it is not merely overbroad WAIT logic.');
  lines.push('- `STRUCTURE_CONFIRMATION_BROAD_WAIT_REVIEW_READY` means broad structure WAIT may be overblocking. Promotion still requires explicit structure evidence fields in Stage6.');
  lines.push('- `QUALITY_GATE_EARNINGS_COVERAGE_REQUIRED` and `QUALITY_GATE_NON_ACTIONABLE_VERDICT_WAIT` are intentionally separated from structure/breakout/risk geometry tuning.');
  lines.push('- `TARGET_REACHED_OR_NEAR_CURRENT_NO_CHASE` remains no-trade or target refresh. Do not convert this into a reprice/replace path.');
  lines.push('- `STOP_GEOMETRY_*`, `RR_GEOMETRY_*`, and `RECALCULATED_STOP_*` are producer-side risk-geometry decisions. They require Stage6 recalibration proof or no-trade; sidecar must not relax risk gates.');
  lines.push('- `EARNINGS_DATA_COVERAGE_REQUIRED` is a data freshness/coverage track. Do not lower execution gates until the missing data source is repaired or explicitly annotated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function main() {
  const inputPath = process.env.STAGE6_POLICY_LANE_AUDIT_INPUT || DEFAULT_INPUT;
  const outJson = process.env.STAGE6_POLICY_LANE_AUDIT_OUT_JSON || DEFAULT_OUT_JSON;
  const outMd = process.env.STAGE6_POLICY_LANE_AUDIT_OUT_MD || DEFAULT_OUT_MD;
  const report = buildReport(readJson(inputPath));
  ensureDir(outJson);
  ensureDir(outMd);
  fs.writeFileSync(path.resolve(REPO_ROOT, outJson), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(REPO_ROOT, outMd), buildMarkdown(report), 'utf8');
  console.log(
    `[STAGE6_POLICY_LANE_AUDIT] latest=${report.summary.latestStage6File || 'N/A'} verdict=${report.summary.latestVerdict} latestReviewReady=${report.summary.latestReviewReadyRows} json=${outJson} md=${outMd}`
  );
}

main();
