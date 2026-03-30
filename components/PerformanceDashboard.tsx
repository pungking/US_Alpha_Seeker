import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchPerformanceDashboard, type PerformanceDashboardPayload } from "../services/performanceDashboardService";

type DashboardView = "SIMULATION" | "LIVE";
interface PerformanceDashboardProps {
  isVisible?: boolean;
}
const CACHE_KEY = "US_ALPHA_PERF_DASHBOARD_CACHE_V1";

const fmt = (value: unknown, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "N/A";
  return n.toFixed(digits);
};

const shortTime = (isoLike: string) => {
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
};

const splitList = (raw?: string) =>
  String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 5);

const readCache = (): PerformanceDashboardPayload | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as PerformanceDashboardPayload;
  } catch {
    return null;
  }
};

const writeCache = (payload: PerformanceDashboardPayload) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // noop
  }
};

const metricCard = (label: string, value: string, accent = "text-emerald-300") => (
  <div className="glass-panel rounded-xl border border-white/10 px-3 py-3">
    <div className="text-[8px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
    <div className={`mt-1 text-[13px] font-black tracking-tight ${accent}`}>{value}</div>
  </div>
);

const PerformanceDashboard: React.FC<PerformanceDashboardProps> = ({ isVisible = true }) => {
  const [payload, setPayload] = useState<PerformanceDashboardPayload | null>(null);
  const [view, setView] = useState<DashboardView>("SIMULATION");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [isCached, setIsCached] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchPerformanceDashboard();
      if (next?.source !== "unavailable") {
        writeCache(next);
      }
      setPayload(next);
      setIsCached(false);
    } catch (e: any) {
      const cached = readCache();
      if (cached) {
        setPayload(cached);
        setIsCached(true);
        setError("Live source unavailable. Showing cached snapshot.");
      } else {
        setError(String(e?.message || e || "dashboard_load_failed"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    const cached = readCache();
    if (cached) {
      setPayload(cached);
      setIsCached(true);
    }
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [isVisible, refresh]);

  if (!isVisible) return null;

  const chartRows = useMemo(() => {
    const rows = payload?.simulation?.chartSeries || [];
    return rows.map((row, idx) => ({
      idx: idx + 1,
      label: shortTime(row.at),
      fillRatePct: Number.isFinite(Number(row.fillRatePct)) ? Number(row.fillRatePct) : null,
      avgR: Number.isFinite(Number(row.avgR)) ? Number(row.avgR) : null
    }));
  }, [payload?.simulation?.chartSeries]);

  return (
    <section className="glass-panel rounded-[28px] border border-cyan-500/20 p-5 md:p-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-[8px] uppercase tracking-[0.28em] text-cyan-400">Simulation / Live Monitor</div>
          <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-white">Trading Performance Board</h3>
          <div className="mt-1 text-[10px] text-slate-400">
            source={payload?.source || "N/A"} | updated={payload ? shortTime(payload.generatedAt) : "N/A"} | run=
            {payload?.runKey || "N/A"}
            {isCached ? " | cache=ON" : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full border border-white/15 bg-black/30 p-1">
            {(["SIMULATION", "LIVE"] as DashboardView[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] transition ${
                  view === mode ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <button
            onClick={refresh}
            className="rounded-full border border-cyan-500/40 px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200 hover:bg-cyan-500/10"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2 text-[10px] text-amber-200">
          {error.includes("cached")
            ? "실시간 소스를 불러오지 못해 캐시 데이터를 표시 중입니다."
            : "데이터 소스가 아직 연결되지 않았습니다. 먼저 dry-run/market-guard 1회 실행 후 다시 확인해주세요."}
        </div>
      ) : null}

      {view === "SIMULATION" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {metricCard("Total Trades", fmt(payload?.simulation?.totalRows, 0), "text-white")}
            {metricCard("Closed Trades", fmt(payload?.simulation?.closedRows, 0), "text-white")}
            {metricCard("Win Rate", `${fmt(payload?.simulation?.winRatePct)}%`)}
            {metricCard("Avg Closed R", fmt(payload?.simulation?.avgClosedR, 4))}
            {metricCard("Avg Return", `${fmt(payload?.simulation?.avgClosedReturnPct)}%`)}
            {metricCard("Filled", fmt(payload?.simulation?.filledRows, 0), "text-cyan-300")}
            {metricCard("Open", fmt(payload?.simulation?.openRows, 0), "text-cyan-300")}
            {metricCard("Batch", String(payload?.simulation?.batchId || "N/A"), "text-cyan-300")}
          </div>

          <div className="h-56 rounded-2xl border border-white/10 bg-black/35 p-3">
            {chartRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartRows} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="avgR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(2,6,23,0.95)",
                      border: "1px solid rgba(148,163,184,0.3)",
                      borderRadius: "10px",
                      fontSize: "11px"
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="fillRatePct"
                    stroke="#22d3ee"
                    fill="url(#fillRate)"
                    strokeWidth={2}
                    name="Fill Rate %"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="avgR"
                    stroke="#a78bfa"
                    fill="url(#avgR)"
                    strokeWidth={2}
                    name="Avg R"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] text-slate-500">
                차트 데이터가 아직 없습니다. (Series not available yet)
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3">
              <div className="text-[8px] uppercase tracking-[0.24em] text-emerald-300">Top Winners</div>
              <div className="mt-2 text-[10px] text-emerald-100">
                {splitList(payload?.simulation?.topWinners).length > 0
                  ? splitList(payload?.simulation?.topWinners).join(" | ")
                  : "N/A"}
              </div>
            </div>
            <div className="rounded-xl border border-rose-500/25 bg-rose-950/20 p-3">
              <div className="text-[8px] uppercase tracking-[0.24em] text-rose-300">Top Losers</div>
              <div className="mt-2 text-[10px] text-rose-100">
                {splitList(payload?.simulation?.topLosers).length > 0
                  ? splitList(payload?.simulation?.topLosers).join(" | ")
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {metricCard("Live Available", payload?.live?.available ? "YES" : "NO", payload?.live?.available ? "text-emerald-300" : "text-amber-300")}
            {metricCard("Positions", fmt(payload?.live?.positionCount, 0), "text-white")}
            {metricCard("Unrealized PnL", fmt(payload?.live?.totalUnrealizedPl), "text-white")}
            {metricCard("Return %", `${fmt(payload?.live?.totalReturnPct)}%`)}
            {metricCard("Equity", fmt(payload?.live?.equity), "text-cyan-300")}
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-[10px] text-slate-300">
            {payload?.summary || "No live summary yet."}
          </div>
        </div>
      )}
    </section>
  );
};

export default PerformanceDashboard;
