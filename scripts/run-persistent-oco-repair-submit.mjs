import fs from "node:fs";

const STATE_DIR = String(
  process.env.PERSISTENT_OCO_REPAIR_SUBMIT_STATE_DIR ||
    process.env.PERSISTENT_OCO_REPAIR_STATE_DIR ||
    "state"
).trim() || "state";
const PLAN_PATH = `${STATE_DIR}/persistent-oco-repair-plan.json`;
const LEDGER_PATH = `${STATE_DIR}/persistent-oco-repair-submit-ledger.json`;
const OUTPUT_JSON = `${STATE_DIR}/persistent-oco-repair-submit-report.json`;
const OUTPUT_MD = `${STATE_DIR}/persistent-oco-repair-submit-report.md`;

const REQUIRED_APPROVAL_PHRASE = "CONFIRM LIVE EXECUTION";
const PAPER_BASE_URL = "https://paper-api.alpaca.markets";

const boolEnv = (key, fallback = false) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
};

const readJson = (path) => {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const writeJson = (path, value) => {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, path);
};

const toNum = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asSymbol = (value) => String(value || "").trim().toUpperCase();
const short = (value, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fmt = (value, digits = 2) => {
  const n = toNum(value);
  if (n == null) return "N/A";
  return n.toFixed(digits);
};

const priceString = (value) => {
  const n = toNum(value);
  if (n == null || n <= 0) return null;
  return n.toFixed(n >= 1 ? 2 : 4);
};

const qtyString = (value) => {
  const n = toNum(value);
  if (n == null || n <= 0 || !Number.isInteger(n)) return null;
  return String(n);
};

const addGate = (gates, id, status, detail) => {
  gates.push({ id, status, detail: short(detail, 360) });
};

const sanitizeScalar = (key, value) => {
  const k = String(key || "").toLowerCase();
  if (/(account|secret|token|authorization|api[-_]?key|password)/i.test(k)) return "[REDACTED]";
  if ((k === "id" || k.endsWith("_id") || k === "parent_order_id") && typeof value === "string" && value.length > 10) {
    return `redacted_${value.slice(-6)}`;
  }
  return value;
};

const sanitizeBrokerObject = (value, key = "") => {
  if (Array.isArray(value)) return value.map((item) => sanitizeBrokerObject(item, key));
  if (!value || typeof value !== "object") return sanitizeScalar(key, value);
  const out = {};
  for (const [childKey, childValue] of Object.entries(value)) out[childKey] = sanitizeBrokerObject(childValue, childKey);
  return out;
};

const flattenOrders = (orders, depth = 0) => {
  const out = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== "object") continue;
    out.push({ ...order, _nestedDepth: depth });
    if (Array.isArray(order.legs)) out.push(...flattenOrders(order.legs, depth + 1));
  }
  return out;
};

const isTerminalStatus = (status) => ["filled", "canceled", "cancelled", "expired", "rejected"].includes(String(status ?? "").trim().toLowerCase());
const isActiveStatus = (status) => !isTerminalStatus(status);

const classifySellProtection = (orders, symbol) => {
  const target = asSymbol(symbol);
  const activeSellOrders = flattenOrders(orders).filter((order) => {
    return asSymbol(order?.symbol) === target && String(order?.side || "").toLowerCase() === "sell" && !isTerminalStatus(order?.status);
  });
  const stopOrders = [];
  const targetOrders = [];
  for (const order of activeSellOrders) {
    const type = String(order?.type || order?.order_type || "").toLowerCase();
    const stop = toNum(order?.stop_price);
    const limit = toNum(order?.limit_price);
    if (type === "stop" || type === "stop_limit" || type === "trailing_stop" || stop != null) stopOrders.push(order);
    if (type === "limit" && limit != null) targetOrders.push(order);
  }
  return {
    activeSellOrderCount: activeSellOrders.length,
    stopOrderCount: stopOrders.length,
    targetOrderCount: targetOrders.length,
    hasStop: stopOrders.length > 0,
    hasTarget: targetOrders.length > 0,
    ocoParentCount: activeSellOrders.filter((order) => String(order?.order_class || "").toLowerCase() === "oco").length
  };
};

const alpacaRequest = async (method, path, payload = null) => {
  const baseUrl = String(process.env.ALPACA_BASE_URL || "").trim().replace(/\/+$/, "");
  const keyId = String(process.env.ALPACA_KEY_ID || "").trim();
  const secret = String(process.env.ALPACA_SECRET_KEY || "").trim();
  if (!baseUrl) return { ok: false, status: null, data: null, reason: "ALPACA_BASE_URL_missing" };
  if (!keyId || !secret) return { ok: false, status: null, data: null, reason: "alpaca_credentials_missing" };
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secret,
        ...(payload ? { "Content-Type": "application/json" } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: response.ok, status: response.status, data, reason: response.ok ? "ok" : `alpaca_http_${response.status}` };
  } catch (error) {
    return { ok: false, status: null, data: null, reason: `alpaca_network:${short(error?.message || error, 180)}` };
  }
};

const fetchAlpaca = (path) => alpacaRequest("GET", path);
const postAlpaca = (path, payload) => alpacaRequest("POST", path, payload);

const findPosition = (positions, symbol) => (Array.isArray(positions) ? positions : []).find((row) => asSymbol(row?.symbol) === asSymbol(symbol)) || null;

const findOrderByClientId = (orders, clientOrderId) => {
  const target = String(clientOrderId || "").trim();
  if (!target) return null;
  return flattenOrders(orders).find((order) => String(order?.client_order_id || "").trim() === target) || null;
};

const findActiveOrderByClientId = (orders, clientOrderId) => {
  const order = findOrderByClientId(orders, clientOrderId);
  return order && isActiveStatus(order.status) ? order : null;
};

const buildPayload = (selected) => {
  const preview = selected?.payloadPreview && typeof selected.payloadPreview === "object" ? selected.payloadPreview : null;
  const symbol = asSymbol(preview?.symbol || selected?.symbol);
  const qty = qtyString(toNum(preview?.qty ?? selected?.repairQty));
  const target = priceString(preview?.take_profit?.limit_price ?? selected?.plannedTargetPrice);
  const stop = priceString(preview?.stop_loss?.stop_price ?? selected?.plannedStopPrice);
  const clientOrderId = String(preview?.client_order_id || `persistent_oco_${symbol.toLowerCase()}_q${qty || "1"}`)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 48);
  if (!symbol || !qty || !target || !stop) return null;
  return {
    symbol,
    side: "sell",
    type: "limit",
    time_in_force: "day",
    order_class: "oco",
    qty,
    take_profit: { limit_price: target },
    stop_loss: { stop_price: stop },
    client_order_id: clientOrderId
  };
};

const readLedger = () => readJson(LEDGER_PATH) || { schemaVersion: 1, generatedAt: nowIso(), entries: {} };
const writeLedger = (ledger) => writeJson(LEDGER_PATH, { ...ledger, updatedAt: nowIso() });
const activeLedgerStatuses = new Set(["submit_started", "submitted", "visibility_pass", "persistent_visible_open"]);

const loadActiveLedgerDuplicate = (idempotencyKey) => {
  const ledger = readLedger();
  const entry = ledger?.entries?.[idempotencyKey] || null;
  return { entry, duplicate: Boolean(entry && activeLedgerStatuses.has(String(entry.status || "")) && entry.terminal !== true) };
};

const updateLedgerEntry = (idempotencyKey, patch) => {
  const ledger = readLedger();
  const prior = ledger.entries[idempotencyKey] || { idempotencyKey, history: [] };
  const entry = {
    ...prior,
    ...patch,
    updatedAt: nowIso(),
    history: [
      ...(Array.isArray(prior.history) ? prior.history : []),
      {
        at: nowIso(),
        status: patch.status || prior.status || "unknown",
        reason: patch.reason || null,
        brokerOrderId: patch.brokerOrderId || prior.brokerOrderId || null,
        terminal: patch.terminal ?? prior.terminal ?? false
      }
    ].slice(-20)
  };
  ledger.entries[idempotencyKey] = entry;
  writeLedger(ledger);
  return entry;
};

const validateStaticInputs = ({ plan, selected, payload, idempotencyKey, gates }) => {
  const { entry, duplicate } = loadActiveLedgerDuplicate(idempotencyKey);
  addGate(gates, "plan_present", plan ? "PASS" : "BLOCK", plan ? "persistent OCO repair plan loaded" : "missing persistent-oco-repair-plan.json");
  addGate(gates, "plan_manual_approval_required", plan?.overall === "manual_approval_required" ? "PASS" : "BLOCK", `overall=${plan?.overall || "N/A"}`);
  addGate(gates, "single_selected_row", selected?.symbol ? "PASS" : "BLOCK", selected?.symbol ? `selected=${selected.symbol}` : "no selected persistent repair row");
  addGate(gates, "selector_scope_dynamic", plan?.scope === "portfolio_wide_dynamic_persistent_protection_candidate_not_ticker_specific" ? "PASS" : "BLOCK", `scope=${plan?.scope || "N/A"}`);
  addGate(gates, "selected_row_not_executable_by_default", selected?.executionAllowed === false ? "PASS" : "BLOCK", `executionAllowed=${selected?.executionAllowed ?? "N/A"}`);
  addGate(gates, "repair_qty_one", toNum(selected?.repairQty) === 1 ? "PASS" : "BLOCK", `repairQty=${selected?.repairQty ?? "N/A"}`);
  addGate(gates, "payload_shape_ready", payload ? "PASS" : "BLOCK", payload ? "OCO payload can be built from selected persistent row" : "selected row lacks symbol/qty/stop/target");
  addGate(gates, "payload_is_oco_exit", payload?.order_class === "oco" && payload?.side === "sell" && payload?.type === "limit" && payload?.qty === "1" ? "PASS" : "BLOCK", `order_class=${payload?.order_class || "N/A"} side=${payload?.side || "N/A"} type=${payload?.type || "N/A"} qty=${payload?.qty || "N/A"}`);
  addGate(gates, "payload_no_notional_no_extended_hours", payload && payload.notional === undefined && payload.extended_hours === undefined ? "PASS" : "BLOCK", "persistent OCO repair must not use notional or extended_hours");
  addGate(gates, "price_geometry_valid", toNum(selected?.plannedStopPrice) != null && toNum(selected?.currentPrice) != null && toNum(selected?.plannedTargetPrice) != null && toNum(selected?.plannedStopPrice) < toNum(selected?.currentPrice) && toNum(selected?.currentPrice) < toNum(selected?.plannedTargetPrice) ? "PASS" : "BLOCK", `stop=${selected?.plannedStopPrice ?? "N/A"} current=${selected?.currentPrice ?? "N/A"} target=${selected?.plannedTargetPrice ?? "N/A"}`);
  addGate(gates, "idempotency_key_present", idempotencyKey && !idempotencyKey.includes("undefined") ? "PASS" : "BLOCK", `idempotencyKey=${idempotencyKey || "N/A"}`);
  addGate(gates, "idempotency_not_duplicate", !duplicate ? "PASS" : "BLOCK", duplicate ? `ledger already has active entry status=${entry.status}` : "no active persistent submit-ledger duplicate");
};

const validateEnvForBrokerAccess = ({ gates, readVerifyEnabled, submitEnabled, approvalPhraseProvided }) => {
  const baseUrl = String(process.env.ALPACA_BASE_URL || "").trim().replace(/\/+$/, "");
  const env = String(process.env.ALPHA_ENV || "").trim().toUpperCase();
  addGate(gates, "paper_environment_only", !readVerifyEnabled && !submitEnabled ? "PASS" : env === "PAPER" ? "PASS" : "BLOCK", `ALPHA_ENV=${process.env.ALPHA_ENV || "N/A"}`);
  addGate(gates, "paper_base_url_only", !readVerifyEnabled && !submitEnabled ? "PASS" : baseUrl === PAPER_BASE_URL ? "PASS" : "BLOCK", `ALPACA_BASE_URL=${baseUrl || "N/A"}`);
  if (submitEnabled) {
    addGate(gates, "actual_submit_explicitly_enabled", "PASS", "PERSISTENT_OCO_REPAIR_SUBMIT_ENABLED=true");
    addGate(gates, "approval_phrase_present", approvalPhraseProvided ? "PASS" : "BLOCK", `approvalPhraseProvided=${approvalPhraseProvided}`);
    addGate(gates, "read_precheck_required_for_submit", readVerifyEnabled ? "PASS" : "BLOCK", `PERSISTENT_OCO_REPAIR_READ_VERIFY=${readVerifyEnabled}`);
    addGate(gates, "auto_cancel_disabled", "PASS", "persistent repair lane intentionally leaves the approved paper OCO open; manual rollback plan is emitted");
  } else {
    addGate(gates, "actual_submit_disabled", "PASS", "no POST /v2/orders unless PERSISTENT_OCO_REPAIR_SUBMIT_ENABLED=true and approval phrase matches");
  }
};

const runReadPrecheck = async ({ selected, payload, gates }) => {
  const symbol = asSymbol(selected?.symbol);
  const result = { enabled: true, account: null, clock: null, position: null, nestedOpenOrders: null, existingClientOrder: null, protection: null };

  const accountRes = await fetchAlpaca("/v2/account");
  result.account = { ok: accountRes.ok, status: accountRes.status, reason: accountRes.reason, data: sanitizeBrokerObject(accountRes.data) };
  addGate(gates, "alpaca_account_read", accountRes.ok ? "PASS" : "BLOCK", accountRes.reason);

  const clockRes = await fetchAlpaca("/v2/clock");
  result.clock = { ok: clockRes.ok, status: clockRes.status, reason: clockRes.reason, data: sanitizeBrokerObject(clockRes.data) };
  const requireOpen = boolEnv("PERSISTENT_OCO_REPAIR_REQUIRE_MARKET_OPEN", true);
  const isOpen = clockRes.ok && clockRes.data && typeof clockRes.data === "object" ? clockRes.data.is_open === true : null;
  addGate(gates, "market_open_for_advanced_order", !requireOpen || isOpen === true ? "PASS" : "BLOCK", `requireOpen=${requireOpen} is_open=${isOpen ?? "N/A"}`);

  const positionsRes = await fetchAlpaca("/v2/positions");
  const position = positionsRes.ok ? findPosition(positionsRes.data, symbol) : null;
  const positionQty = toNum(position?.qty);
  const currentPrice = toNum(position?.current_price ?? selected?.currentPrice);
  result.position = { ok: positionsRes.ok, status: positionsRes.status, reason: positionsRes.reason, row: sanitizeBrokerObject(position) };
  addGate(gates, "selected_symbol_still_held", positionsRes.ok && positionQty != null && positionQty >= 1 ? "PASS" : "BLOCK", `symbol=${symbol} positionQty=${positionQty ?? "N/A"}`);
  addGate(gates, "live_position_qty_covers_repair", positionQty != null && positionQty >= toNum(selected?.repairQty) ? "PASS" : "BLOCK", `positionQty=${positionQty ?? "N/A"} repairQty=${selected?.repairQty ?? "N/A"}`);
  addGate(gates, "live_price_geometry_valid", currentPrice != null && toNum(selected?.plannedStopPrice) < currentPrice && currentPrice < toNum(selected?.plannedTargetPrice) ? "PASS" : "BLOCK", `stop=${selected?.plannedStopPrice ?? "N/A"} current=${currentPrice ?? "N/A"} target=${selected?.plannedTargetPrice ?? "N/A"}`);

  const ordersRes = await fetchAlpaca(`/v2/orders?status=open&nested=true&symbols=${encodeURIComponent(symbol)}&direction=desc&limit=50`);
  const openOrders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
  const protection = classifySellProtection(openOrders, symbol);
  result.nestedOpenOrders = { ok: ordersRes.ok, status: ordersRes.status, reason: ordersRes.reason, data: sanitizeBrokerObject(openOrders) };
  result.protection = protection;
  addGate(gates, "nested_open_orders_read", ordersRes.ok ? "PASS" : "BLOCK", ordersRes.reason);
  addGate(gates, "no_existing_active_sell_protection", ordersRes.ok && protection.activeSellOrderCount === 0 ? "PASS" : "BLOCK", `activeSell=${protection.activeSellOrderCount} stop=${protection.stopOrderCount} target=${protection.targetOrderCount}`);

  const clientOrderId = String(payload?.client_order_id || "").trim();
  const clientRes = clientOrderId ? await fetchAlpaca(`/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`) : { ok: false, status: null, data: null, reason: "client_order_id_missing" };
  result.existingClientOrder = { ok: clientRes.ok, status: clientRes.status, reason: clientRes.reason, data: sanitizeBrokerObject(clientRes.data) };
  addGate(gates, "client_order_id_not_already_used", clientRes.status === 404 ? "PASS" : "BLOCK", `status=${clientRes.status ?? "N/A"} reason=${clientRes.reason}`);
  return result;
};

const verifyNestedVisibility = async ({ symbol, clientOrderId }) => {
  const ordersRes = await fetchAlpaca(`/v2/orders?status=open&nested=true&symbols=${encodeURIComponent(symbol)}&direction=desc&limit=50`);
  const orders = Array.isArray(ordersRes.data) ? ordersRes.data : [];
  const matched = findActiveOrderByClientId(orders, clientOrderId);
  const protection = classifySellProtection(orders, symbol);
  const pass = ordersRes.ok && matched && protection.hasStop && protection.hasTarget;
  return {
    ok: Boolean(pass),
    status: ordersRes.status,
    reason: ordersRes.reason,
    matchedOrder: sanitizeBrokerObject(matched),
    matchedOrderId: matched?.id || null,
    protection,
    data: sanitizeBrokerObject(orders)
  };
};

const runApprovedPersistentSubmit = async ({ selected, payload, idempotencyKey, preflight, gates }) => {
  const symbol = asSymbol(selected?.symbol);
  const clientOrderId = String(payload?.client_order_id || "").trim();
  const brokerMutation = { attempted: false, submitted: false, status: null, reason: null, response: null };
  const postSubmitVisibility = { attempted: false, ok: false, reason: "not_run", matchedOrder: null, protection: null, persistentOpen: false };

  updateLedgerEntry(idempotencyKey, {
    status: "submit_started",
    reason: "approved_persistent_oco_repair_submit_started",
    terminal: false,
    symbol,
    clientOrderId,
    selected: sanitizeBrokerObject(selected),
    payloadPreview: sanitizeBrokerObject(payload),
    preflight: sanitizeBrokerObject(preflight)
  });

  brokerMutation.attempted = true;
  const postRes = await postAlpaca("/v2/orders", payload);
  brokerMutation.status = postRes.status;
  brokerMutation.reason = postRes.reason;
  brokerMutation.response = sanitizeBrokerObject(postRes.data);

  if (!postRes.ok) {
    updateLedgerEntry(idempotencyKey, {
      status: "submit_rejected",
      reason: postRes.reason,
      terminal: true,
      brokerResponse: sanitizeBrokerObject(postRes.data)
    });
    addGate(gates, "broker_post_order", "BLOCK", `POST /v2/orders failed status=${postRes.status ?? "N/A"} reason=${postRes.reason}`);
    return { brokerMutation, postSubmitVisibility, ledgerStatus: "submit_rejected" };
  }

  brokerMutation.submitted = true;
  const brokerOrderId = postRes.data?.id || null;
  updateLedgerEntry(idempotencyKey, {
    status: "submitted",
    reason: "persistent_paper_oco_repair_post_accepted",
    terminal: false,
    brokerOrderId,
    brokerStatus: postRes.data?.status || null,
    brokerResponse: sanitizeBrokerObject(postRes.data)
  });
  addGate(gates, "broker_post_order", "PASS", `POST /v2/orders accepted status=${postRes.status ?? "N/A"}`);

  await sleep(Number(process.env.PERSISTENT_OCO_REPAIR_VISIBILITY_DELAY_MS || 1500));
  postSubmitVisibility.attempted = true;
  const visibility = await verifyNestedVisibility({ symbol, clientOrderId });
  Object.assign(postSubmitVisibility, visibility, { persistentOpen: visibility.ok === true });
  addGate(gates, "post_submit_nested_visibility", visibility.ok ? "PASS" : "BLOCK", `ok=${visibility.ok} stop=${visibility.protection?.stopOrderCount ?? "N/A"} target=${visibility.protection?.targetOrderCount ?? "N/A"}`);
  addGate(gates, "persistent_order_left_open", visibility.ok ? "PASS" : "BLOCK", visibility.ok ? "active OCO protection remains open by design" : "persistent OCO was not visible as active open protection");

  const status = visibility.ok ? "persistent_visible_open" : "visibility_failed";
  updateLedgerEntry(idempotencyKey, {
    status,
    reason: visibility.reason,
    terminal: false,
    brokerOrderId: brokerOrderId || visibility.matchedOrderId || null,
    brokerStatus: postRes.data?.status || null,
    visibility: sanitizeBrokerObject(visibility),
    manualRollbackRequired: visibility.ok === true
  });

  return { brokerMutation, postSubmitVisibility, ledgerStatus: status };
};

const buildMarkdown = (report) => {
  const lines = [];
  lines.push("## Persistent OCO Repair Submit Report");
  lines.push(`- generatedAt: \`${report.generatedAt}\``);
  lines.push(`- overall: \`${String(report.overall).toUpperCase()}\``);
  lines.push(`- decision: \`${report.decision.status} / ${report.decision.recommendedAction}\``);
  lines.push(`- selected: \`${report.selected?.symbol || "N/A"} qty=${report.selected?.repairQty ?? "N/A