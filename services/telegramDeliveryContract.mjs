export const TELEGRAM_DELIVERY_STATUS = Object.freeze({
  DELIVERED: 'TELEGRAM_DELIVERED',
  SUPPRESSED_CONTRACT_MISMATCH: 'TELEGRAM_SUPPRESSED_CONTRACT_MISMATCH',
  SKIPPED_EMPTY_PAYLOAD: 'TELEGRAM_SKIPPED_EMPTY_PAYLOAD',
  CONFIG_MISSING: 'TELEGRAM_CONFIG_MISSING',
  DELIVERY_FAILED: 'TELEGRAM_DELIVERY_FAILED',
  DELIVERY_RECEIPT_MISSING: 'TELEGRAM_DELIVERY_RECEIPT_MISSING'
});

const TELEGRAM_DECISION_REASON_LABELS_KO = Object.freeze({
  executable_pullback: '눌림목 조건 충족',
  executable_current_recalculated_stop: '현재가 진입/손절 재계산 조건 충족',
  valid_exec: '실행 조건 충족',
  wait_pullback_not_reached: '진입 가격 미도달',
  wait_pullback_too_deep: '진입 가격 미도달',
  wait_current_distance_above_adaptive: '현재가-진입가 괴리 과대',
  wait_earnings_data_missing: '실적 일정 데이터 누락(대기)',
  wait_earnings_data_missing_quality_floor: '실적 일정 데이터 누락(품질 기준 미달)',
  wait_structure_confirmation_required: '진입 구조 확인 필요',
  wait_target_near_current: '현재가 대비 목표 여유 부족',
  wait_state_verdict_conflict: '시장구조-판정 충돌(대기)',
  invalid_geometry: '가격 구조 오류',
  invalid_data: '가격 데이터 부족',
  blocked_invalid_geometry: '가격 구조 오류',
  blocked_missing_trade_box: '진입/목표/손절 데이터 누락',
  blocked_quality_missing_expected_return: '기대수익 계산 불가',
  blocked_quality_conviction_floor: '신뢰도 점수 미달',
  blocked_quality_verdict_unusable: 'AI 판정 신뢰 불가',
  blocked_stop_too_tight: '손절폭 과소',
  blocked_stop_too_wide: '손절폭 과다',
  blocked_target_too_close: '목표폭 과소',
  blocked_anchor_exec_gap: '앵커/실행 괴리 과다',
  blocked_rr_below_min: '손익비 기준 미달',
  blocked_ev_non_positive: '기대수익 기준 미달',
  blocked_earnings_data_missing: '실적 일정 데이터 누락(차단)',
  blocked_earnings_window: '실적 임박 구간',
  blocked_state_verdict_conflict: '시장구조-판정 충돌(차단)',
  blocked_verdict_risk_off: '리스크오프 판정'
});

const normalizeDecisionReason = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '_')
  .replace(/-/g, '_');

export function resolveTelegramDecisionReason(item, decision, executionReason) {
  const finalReason = normalizeDecisionReason(item?.decisionReason);
  if (finalReason) return finalReason;

  const decisionKey = String(decision || item?.finalDecision || '').trim().toUpperCase();
  if (decisionKey !== 'EXECUTABLE_NOW') return 'n/a';

  return normalizeDecisionReason(executionReason || item?.executionReason || item?.tradePlanStatusShadow) || 'n/a';
}

export function toTelegramDecisionReasonLabelKo(reason) {
  const key = normalizeDecisionReason(reason);
  if (!key || ['n/a', 'na', 'none', 'null', 'undefined'].includes(key)) return '최종 판정 사유 미확인';
  return TELEGRAM_DECISION_REASON_LABELS_KO[key] || '최종 게이트 사유 확인 필요';
}

export function evaluateTelegramApiReceipt(httpOk, httpStatus, body) {
  const description = body && typeof body === 'object' ? String(body.description || '') : '';
  if (/can't parse entities|parse entities|can't find end of the entity/i.test(description)) {
    return { ok: false, parseError: true, errorCategory: 'TELEGRAM_PARSE_REJECTED' };
  }
  if (/chat not found|bot was blocked|not enough rights|forbidden/i.test(description)) {
    return { ok: false, parseError: false, errorCategory: 'TELEGRAM_DESTINATION_REJECTED' };
  }
  if (!httpOk) {
    const errorCategory = httpStatus === 429
        ? 'RATE_LIMITED'
        : httpStatus >= 500
          ? 'HTTP_5XX'
          : 'HTTP_REQUEST_FAILED';
    return { ok: false, parseError: false, errorCategory };
  }
  if (!body || typeof body !== 'object') {
    return { ok: false, parseError: false, errorCategory: 'RESPONSE_BODY_INVALID' };
  }
  if (body.ok !== true) {
    return {
      ok: false,
      parseError: /parse/i.test(String(body.description || '')),
      errorCategory: 'TELEGRAM_API_REJECTED'
    };
  }
  return { ok: true, parseError: false, errorCategory: null };
}

export function summarizeChunkDeliveries(results) {
  const rows = Array.isArray(results) ? results : [];
  const deliverySucceeded = rows.length > 0 && rows.every((row) => row?.ok === true);
  const paths = [...new Set(rows.filter((row) => row?.ok).map((row) => row.deliveryPath).filter(Boolean))];
  return {
    deliverySucceeded,
    chunkCount: rows.length,
    deliveryPath: paths.length > 1 ? 'mixed' : paths[0] || null,
    errorCategory: deliverySucceeded
      ? null
      : rows.find((row) => row?.ok !== true)?.errorCategory || 'DELIVERY_RESULT_MISSING'
  };
}

export function resolveDeliveryAttempts(attempts) {
  const rows = Array.isArray(attempts) ? attempts : [];
  const success = rows.find((row) => row?.ok === true);
  if (success) {
    return { ok: true, deliveryPath: success.deliveryPath || null, errorCategory: null };
  }
  return {
    ok: false,
    deliveryPath: null,
    errorCategory: rows.at(-1)?.errorCategory || 'DELIVERY_RESULT_MISSING'
  };
}

export function classifyTelegramNotification(input = {}) {
  const reportGenerated = input.reportGenerated === true;
  const contractIntegrityStatus = ['PASS', 'MISMATCH'].includes(input.contractIntegrityStatus)
    ? input.contractIntegrityStatus
    : 'NOT_EVALUATED';
  const suppressionReason = input.suppressionReason === 'TELEGRAM_CONTRACT_MISMATCH'
    ? input.suppressionReason
    : null;
  const configPresent = typeof input.configPresent === 'boolean' ? input.configPresent : null;
  const sendAttempted = input.sendAttempted === true;
  const chunkCount = Number.isInteger(input.chunkCount) && input.chunkCount >= 0 ? input.chunkCount : 0;
  const deliverySucceeded = input.deliverySucceeded === true && sendAttempted && chunkCount > 0;
  const deliveryPath = ['direct', 'proxy', 'mixed'].includes(input.deliveryPath) ? input.deliveryPath : null;
  const safeErrorCategories = new Set([
    'BRIEF_GENERATION_FAILED',
    'DELIVERY_RESULT_MISSING',
    'HTTP_5XX',
    'HTTP_REQUEST_FAILED',
    'NETWORK_ERROR',
    'PROXY_UNAVAILABLE',
    'RATE_LIMITED',
    'RESPONSE_BODY_INVALID',
    'TELEGRAM_API_REJECTED',
    'TELEGRAM_DESTINATION_REJECTED',
    'TELEGRAM_PARSE_REJECTED',
    'TIMEOUT'
  ]);
  const errorCategory = safeErrorCategories.has(input.errorCategory) ? input.errorCategory : null;

  let status;
  if (contractIntegrityStatus === 'MISMATCH' || suppressionReason === 'TELEGRAM_CONTRACT_MISMATCH') {
    status = TELEGRAM_DELIVERY_STATUS.SUPPRESSED_CONTRACT_MISMATCH;
  } else if (!reportGenerated) {
    status = TELEGRAM_DELIVERY_STATUS.SKIPPED_EMPTY_PAYLOAD;
  } else if (configPresent === false) {
    status = TELEGRAM_DELIVERY_STATUS.CONFIG_MISSING;
  } else if (deliverySucceeded) {
    status = TELEGRAM_DELIVERY_STATUS.DELIVERED;
  } else if (sendAttempted) {
    status = TELEGRAM_DELIVERY_STATUS.DELIVERY_FAILED;
  } else {
    status = TELEGRAM_DELIVERY_STATUS.DELIVERY_RECEIPT_MISSING;
  }

  return {
    status,
    reportGenerated,
    contractIntegrityStatus,
    suppressionReason,
    configPresent,
    sendAttempted,
    deliverySucceeded,
    routeTag: ['PRIMARY', 'SIMULATION', 'ALERT'].includes(input.routeTag) ? input.routeTag : 'PRIMARY',
    chunkCount,
    deliveryPath,
    errorCategory
  };
}
