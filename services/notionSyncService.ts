export interface NotionSyncCandidate {
  symbol: string;
  name?: string;
  sector?: string;
  price?: number;
  changePct?: number;
  marketCap?: number;
  volume?: number;
  compositeAlpha?: number;
  qualityScore?: number;
  fundamentalScore?: number;
  technicalScore?: number;
  convictionScore?: number;
  expectedReturnPct?: number;
  aiVerdict?: string;
  investmentOutlook?: string;
  selectionReasons?: string[];
  finalDecision?: string;
  decisionReason?: string;
  executionBucket?: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

export interface NotionSyncPayload {
  runId: string;
  runDateIso: string;
  engine: string;
  stage6File?: string;
  stage6Hash?: string;
  marketPulse?: {
    spy?: { change?: number };
    qqq?: { change?: number };
    vix?: { price?: number };
  };
  stageCounts: {
    stage1: number;
    stage2: number;
    stage3: number;
    stage4: number;
    stage5: number;
    stage6: number;
    finalPicks: number;
    runDurationSec?: number | null;
  };
  executablePicks: NotionSyncCandidate[];
  watchlist: NotionSyncCandidate[];
}

export interface NotionSyncResult {
  ok: boolean;
  skipped?: boolean;
  message: string;
  details?: Record<string, number>;
}

const parseBoolean = (value: unknown): boolean | null => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
};

const notionSyncEnabled = (): boolean => {
  const env = parseBoolean((import.meta as any)?.env?.VITE_NOTION_SYNC_ENABLED);
  if (env !== null) return env;
  return true;
};

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 10000): Promise<Response> => {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error("NOTION_SYNC_TIMEOUT")), timeoutMs)
  );
  return Promise.race([fetch(url, options), timeout]);
};

export async function syncPipelineToNotion(payload: NotionSyncPayload): Promise<NotionSyncResult> {
  if (!notionSyncEnabled()) {
    return { ok: false, skipped: true, message: "disabled_by_env" };
  }

  try {
    const response = await fetchWithTimeout(
      "/api/notion_sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      15000
    );

    if (response.status === 404) {
      return { ok: false, skipped: true, message: "notion_sync_api_not_found" };
    }

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (!response.ok) {
      return {
        ok: false,
        message: String(body?.error || body?.message || `http_${response.status}`),
        details: body?.details
      };
    }

    return {
      ok: true,
      message: String(body?.message || "notion_sync_ok"),
      details: body?.details
    };
  } catch (error: any) {
    return {
      ok: false,
      message: String(error?.message || "notion_sync_unknown_error")
    };
  }
}

