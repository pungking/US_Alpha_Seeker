export const TELEGRAM_DELIVERY_STATUS = Object.freeze({
  DELIVERED: 'TELEGRAM_DELIVERED',
  SUPPRESSED_CONTRACT_MISMATCH: 'TELEGRAM_SUPPRESSED_CONTRACT_MISMATCH',
  SKIPPED_EMPTY_PAYLOAD: 'TELEGRAM_SKIPPED_EMPTY_PAYLOAD',
  CONFIG_MISSING: 'TELEGRAM_CONFIG_MISSING',
  DELIVERY_FAILED: 'TELEGRAM_DELIVERY_FAILED',
  DELIVERY_RECEIPT_MISSING: 'TELEGRAM_DELIVERY_RECEIPT_MISSING'
});

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
