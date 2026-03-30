export interface DashboardSeriesPoint {
  at: string;
  fillRatePct?: number | null;
  avgR?: number | null;
  closedCount?: number | null;
}

export interface PerformanceDashboardPayload {
  source: string;
  generatedAt: string;
  runKey: string;
  kind: string;
  status: string;
  summary?: string;
  simulation: {
    batchId?: string;
    totalRows?: number | null;
    filledRows?: number | null;
    openRows?: number | null;
    closedRows?: number | null;
    winRatePct?: number | null;
    avgClosedReturnPct?: number | null;
    avgClosedR?: number | null;
    topWinners?: string;
    topLosers?: string;
    chartSeries?: DashboardSeriesPoint[];
  };
  live: {
    available?: boolean;
    positionCount?: number | null;
    totalUnrealizedPl?: number | null;
    totalReturnPct?: number | null;
    equity?: number | null;
  };
}

export const fetchPerformanceDashboard = async (): Promise<PerformanceDashboardPayload> => {
  const response = await fetch("/api/performance_dashboard", { method: "GET" });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok || !data?.ok) {
    const reason = data?.message || data?.error || `http_${response.status}`;
    throw new Error(String(reason));
  }
  return data.data as PerformanceDashboardPayload;
};

