#!/usr/bin/env node

function parseArgs(argv) {
  const out = {};
  for (let idx = 0; idx < argv.length; idx += 1) {
    const token = String(argv[idx] || "").trim();
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[idx + 1];
    if (next == null || String(next).startsWith("--")) {
      out[key] = "true";
      continue;
    }
    out[key] = String(next);
    idx += 1;
  }
  return out;
}

function parseBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function requireEnv(key) {
  const value = String(process.env[key] || "").trim();
  if (!value) {
    throw new Error(`${key} missing`);
  }
  return value;
}

function normalizeStatus(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "approved") return "approved";
  if (key === "rejected") return "rejected";
  if (key === "expired") return "expired";
  return "pending";
}

function createQueueState() {
  return {
    queue: [],
    updatedAt: ""
  };
}

function normalizeQueueState(raw) {
  if (!raw || typeof raw !== "object") return createQueueState();
  const stateNode = raw;
  const queueRaw = Array.isArray(stateNode.queue) ? stateNode.queue : [];
  const queue = [];
  for (let idx = 0; idx < queueRaw.length; idx += 1) {
    const row = queueRaw[idx];
    if (!row || typeof row !== "object") continue;
    const id = String(row.id || "").trim() || `auto-${idx + 1}`;
    const symbol = String(row.symbol || "").trim().toUpperCase();
    queue.push({
      id,
      type: row.type === "param_change" || row.type === "live_switch" ? row.type : "trade",
      symbol,
      side: typeof row.side === "string" ? row.side : undefined,
      notional: Number.isFinite(Number(row.notional)) ? Number(row.notional) : undefined,
      limitPrice: Number.isFinite(Number(row.limitPrice)) ? Number(row.limitPrice) : undefined,
      takeProfit: Number.isFinite(Number(row.takeProfit)) ? Number(row.takeProfit) : undefined,
      stopLoss: Number.isFinite(Number(row.stopLoss)) ? Number(row.stopLoss) : undefined,
      detail: typeof row.detail === "string" ? row.detail : undefined,
      status: normalizeStatus(row.status),
      requestedAt: typeof row.requestedAt === "string" ? row.requestedAt : "",
      resolvedAt: typeof row.resolvedAt === "string" ? row.resolvedAt : undefined,
      resolvedBy: typeof row.resolvedBy === "string" ? row.resolvedBy : undefined,
      stage6Hash: typeof row.stage6Hash === "string" ? row.stage6Hash : undefined,
      ttlMinutes: Number.isFinite(Number(row.ttlMinutes)) ? Number(row.ttlMinutes) : undefined
    });
  }
  return {
    queue,
    updatedAt: typeof stateNode.updatedAt === "string" ? stateNode.updatedAt : ""
  };
}

async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`oauth refresh failed (${response.status}): ${text.slice(0, 180)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("oauth refresh returned non-json payload");
  }
  const token = String(parsed.access_token || "").trim();
  if (!token) throw new Error("oauth refresh missing access_token");
  return token;
}

async function findQueueFile(accessToken, rootFolderId, queueFileName) {
  const escapedName = queueFileName.replace(/'/g, "\\'");
  const query = encodeURIComponent(`name='${escapedName}' and '${rootFolderId}' in parents and trashed=false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`drive list failed (${response.status}): ${text.slice(0, 180)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("drive list returned non-json payload");
  }
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  if (files.length === 0) return null;
  const picked = files[0];
  const fileId = String(picked.id || "").trim();
  if (!fileId) return null;
  return {
    id: fileId,
    name: String(picked.name || "").trim(),
    modifiedTime: String(picked.modifiedTime || "").trim()
  };
}

async function downloadQueueState(accessToken, fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`drive download failed (${response.status}): ${text.slice(0, 180)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("approval queue file is not valid json");
  }
  return normalizeQueueState(parsed);
}

async function uploadQueueState(accessToken, fileId, queueState) {
  const boundary = `----ApprovalQueueBoundary${Date.now()}`;
  const metadataPart = JSON.stringify({
    mimeType: "application/json"
  });
  const dataPart = JSON.stringify(queueState, null, 2);
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadataPart,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    dataPart,
    `--${boundary}--`
  ].join("\r\n");

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`drive upload failed (${response.status}): ${text.slice(0, 180)}`);
  }
}

function sortByRequestedAtDesc(records) {
  return [...records].sort((a, b) => {
    const aTs = Date.parse(a.requestedAt || "");
    const bTs = Date.parse(b.requestedAt || "");
    const aValue = Number.isFinite(aTs) ? aTs : 0;
    const bValue = Number.isFinite(bTs) ? bTs : 0;
    return bValue - aValue;
  });
}

function pickTargetRecord(queue, args) {
  const requestId = String(args["request-id"] || "").trim();
  const symbol = String(args.symbol || "")
    .trim()
    .toUpperCase();
  const stage6Hash = String(args["stage6-hash"] || "").trim();
  const includeResolved = parseBool(args["include-resolved"], false);

  let candidates = queue;
  if (!includeResolved) {
    candidates = candidates.filter((row) => row.status === "pending");
  }

  if (requestId) {
    return candidates.find((row) => row.id === requestId) || null;
  }

  if (!symbol) {
    throw new Error("target missing: provide --request-id or --symbol");
  }

  let symbolCandidates = candidates.filter((row) => row.symbol === symbol);
  if (stage6Hash) {
    symbolCandidates = symbolCandidates.filter((row) => String(row.stage6Hash || "") === stage6Hash);
  }
  if (symbolCandidates.length === 0) return null;
  return sortByRequestedAtDesc(symbolCandidates)[0] || null;
}

function appendDetail(baseDetail, action, reason, resolvedBy) {
  const prefix = baseDetail && baseDetail.trim().length > 0 ? `${baseDetail.trim()} | ` : "";
  const reasonToken = reason && reason.trim().length > 0 ? reason.trim() : "manual_decision";
  const line = `${action}_by=${resolvedBy} reason=${reasonToken}`;
  const merged = `${prefix}${line}`;
  return merged.length > 500 ? merged.slice(0, 500) : merged;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const actionRaw = String(args.action || "").trim().toLowerCase();
  const action = actionRaw === "approve" ? "approved" : actionRaw === "reject" ? "rejected" : "";
  if (!action) {
    throw new Error("--action must be approve or reject");
  }
  const dryRun = parseBool(args["dry-run"], false);
  const reason = String(args.reason || "").trim();
  const resolvedBy = String(args["resolved-by"] || process.env.GITHUB_ACTOR || "workflow_dispatch").trim();

  const queueFileName =
    String(args["queue-file"] || process.env.APPROVAL_QUEUE_FILE_NAME || "APPROVAL_QUEUE.json").trim() ||
    "APPROVAL_QUEUE.json";
  const rootFolderId = requireEnv("GDRIVE_ROOT_FOLDER_ID");
  const clientId = requireEnv("GDRIVE_CLIENT_ID");
  const clientSecret = requireEnv("GDRIVE_CLIENT_SECRET");
  const refreshToken = requireEnv("GDRIVE_REFRESH_TOKEN");

  const accessToken = await refreshAccessToken(clientId, clientSecret, refreshToken);
  const queueFile = await findQueueFile(accessToken, rootFolderId, queueFileName);
  if (!queueFile) {
    throw new Error(`approval queue file not found: ${queueFileName}`);
  }

  const state = await downloadQueueState(accessToken, queueFile.id);
  const target = pickTargetRecord(state.queue, args);
  if (!target) {
    throw new Error("no matching pending approval record");
  }

  const now = new Date().toISOString();
  const updatedQueue = state.queue.map((row) => {
    if (row.id !== target.id) return row;
    return {
      ...row,
      status: action,
      resolvedAt: now,
      resolvedBy,
      detail: appendDetail(row.detail, action, reason, resolvedBy)
    };
  });

  const nextState = {
    queue: updatedQueue,
    updatedAt: now
  };

  if (!dryRun) {
    await uploadQueueState(accessToken, queueFile.id, nextState);
  }

  const summary = {
    ok: true,
    dryRun,
    action,
    queueFile: queueFileName,
    queueFileId: queueFile.id,
    matched: {
      id: target.id,
      symbol: target.symbol,
      stage6Hash: target.stage6Hash || null,
      requestedAt: target.requestedAt || null,
      priorStatus: target.status,
      nextStatus: action
    },
    updatedAt: now
  };

  console.log(`[APPROVAL_QUEUE_ACTION] ok=true dryRun=${dryRun} action=${action} id=${target.id} symbol=${target.symbol} stage6Hash=${target.stage6Hash || "n/a"}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[APPROVAL_QUEUE_ACTION] ok=false reason=${message}`);
  process.exit(1);
});
