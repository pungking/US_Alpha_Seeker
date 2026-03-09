import { PRODUCTION_URL } from "../constants";

export interface PortalIndexPoint {
  symbol: string;
  price: number;
  change: number;
  source?: string;
  rawSymbol?: string;
}

const INDEX_ENDPOINT_LOCAL = "/api/portal_indices";
const INDEX_ENDPOINT_REMOTE = `${PRODUCTION_URL}/api/portal_indices`;

const normalizeSymbol = (value: any): string => {
  const raw = String(value || "").trim().toUpperCase();
  switch (raw) {
    case ".SPX":
    case "SP500":
      return "SPX";
    case ".DJI":
    case "DOW":
      return "DJI";
    case ".VIX":
      return "VIX";
    case ".NDX":
    case "NASDAQ100":
      return "NDX";
    case ".IXIC":
      return "IXIC";
    default:
      return raw;
  }
};

const toSafeNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, ""));
  return Number.isFinite(parsed) ? parsed : NaN;
};

const withTimeout = async (url: string, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
};

export const fetchPortalIndices = async (timeoutMs = 4500): Promise<PortalIndexPoint[]> => {
  const urls =
    typeof window !== "undefined" && window.location.origin.includes("vercel.app")
      ? [INDEX_ENDPOINT_LOCAL]
      : [INDEX_ENDPOINT_LOCAL, INDEX_ENDPOINT_REMOTE];

  for (const url of urls) {
    try {
      const res = await withTimeout(url, timeoutMs);
      if (!res.ok) continue;

      const payload = await res.json();
      if (!Array.isArray(payload)) continue;

      const normalized = payload
        .map((row: any) => {
          const price = toSafeNumber(row?.price);
          const change = toSafeNumber(row?.change ?? row?.changePercent);
          const rawSymbol = String(row?.symbol || "");
          return {
            symbol: normalizeSymbol(rawSymbol),
            rawSymbol,
            price,
            change: Number.isFinite(change) ? change : 0,
            source: row?.source,
          } as PortalIndexPoint;
        })
        .filter((row) => !!row.symbol && Number.isFinite(row.price));

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Try next endpoint.
    }
  }

  throw new Error("PORTAL_INDICES_UNAVAILABLE");
};

