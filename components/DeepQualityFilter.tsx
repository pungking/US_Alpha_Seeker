
import React, { useState, useEffect, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

// [STAGE 0 -> 2 DATA STRUCTURE]
interface MasterTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  industry: string;
  
  // Value
  pe: number;
  pbr: number;
  psr: number;
  pegRatio: number;
  
  // Quality
  roe: number;
  operatingMargins: number;
  debtToEquity: number;
  
  // Growth & Cash
  revenueGrowth: number;
  operatingCashflow: number;
  
  // Scores (Calculated in Stage 2)
  zScore?: number;        // Bankruptcy Risk
  fScore?: number;        // Financial Health
  qualityScore?: number;  // Absolute Quality
  sectorNeutralScore?: number; // Relative Value
  earningsQuality?: number; // Cash vs Income
  
  [key: string]: any;
}

interface SectorStat {
    sector: string;
    medianPE: number;
    medianPB: number;
    medianROE: number;
    count: number;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>("Standby");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [eliteUniverse, setEliteUniverse] = useState<MasterTicker[]>([]);
  const [sectorStats, setSectorStats] = useState<SectorStat[]>([]);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v2.0: "Supercar Heart" Protocol Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // AUTO START
  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
        executeQuantPipeline();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const executeQuantPipeline = async () => {
      if (!accessToken) {
          addLog("Cloud link required.", "err");
          return;
      }
      setLoading(true);
      setStatus("Loading Universe");

      try {
          // 1. Load Stage 0 Data (The Supercar Heart)
          addLog("Phase 1: Loading 28-Metric Master Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 0 Data not found. Run Stage 0.");

          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const universe: MasterTicker[] = content.universe || [];
          setRawUniverse(universe);
          addLog(`Matrix Loaded: ${universe.length} Assets with Full Metrics.`, "ok");

          // 2. Sector Normalization
          setStatus("Sector Analysis");
          addLog("Phase 2: Calculating Sector Neutral Benchmarks...", "info");
          const stats = calculateSectorStats(universe);
          setSectorStats(stats);
          addLog(`Sector Map Built: ${stats.length} Sectors Indexed.`, "ok");

          // 3. Deep Scoring (The Quant Engine)
          setStatus("Scoring Assets");
          addLog("Phase 3: Running Z-Score / F-Score / Valuation Models...", "info");
          
          const scoredUniverse = universe.map(ticker => {
              // A. Modified Altman Z-Score Proxy
              // 1.2(Working Cap) + 1.4(RE) + 3.3(EBIT) + 0.6(MktCap/Liab) + 1.0(Sales/Asset)
              // Simplified for available data:
              const safeDebt = ticker.debtToEquity > 0 ? ticker.debtToEquity : 100;
              const zProxy = (1.2 * (ticker.currentRatio || 1)) + (3.3 * (ticker.operatingMargins || 0)) + (0.6 * (100 / safeDebt));
              
              // B. F-Score Proxy (0-5 scale based on snapshots)
              let fScore = 0;
              if (ticker.roe > 0) fScore++; // Profitability
              if (ticker.operatingCashflow > 0) fScore++; // CashGen
              if (ticker.revenueGrowth > 0) fScore++; // Growth
              if (ticker.operatingMargins > 0.05) fScore++; // Efficiency
              if (ticker.debtToEquity < 100) fScore++; // Safety

              // C. Earnings Quality
              // OCF should ideally be > Net Income (Implied by EPS * Shares, approximated)
              // Ratio > 1.0 is good.
              const estimatedIncome = (ticker.eps || 0) * (ticker.marketCap / ticker.price);
              const eq = estimatedIncome > 0 ? (ticker.operatingCashflow / estimatedIncome) : 0;

              // D. Sector Neutral Valuation Score (0-100)
              const sectorStat = stats.find(s => s.sector === ticker.sector);
              let valScore = 50;
              if (sectorStat && ticker.pe > 0 && ticker.pbr > 0) {
                  const peRel = sectorStat.medianPE / ticker.pe; // Higher is cheaper
                  const pbRel = sectorStat.medianPB / ticker.pbr;
                  valScore = Math.min(100, ((peRel + pbRel) / 2) * 50);
              }

              // Final Composite Quality Score
              const qScore = (ticker.roe * 2) + (fScore * 10) + (Math.min(eq, 2) * 10) + (valScore * 0.3);

              return {
                  ...ticker,
                  zScore: Number(zProxy.toFixed(2)),
                  fScore: fScore,
                  earningsQuality: Number(eq.toFixed(2)),
                  sectorNeutralScore: Number(valScore.toFixed(2)),
                  qualityScore: Number(qScore.toFixed(2))
              };
          });

          // 4. Filtering Elite 500
          const elite = scoredUniverse
              .filter(t => t.qualityScore > 40 && t.marketCap > 50000000) // Basic filters
              .sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0))
              .slice(0, 500);

          setEliteUniverse(elite);
          addLog(`Quant Filter Complete. Top ${elite.length} Elite Assets Selected.`, "ok");

          // 5. Commit to Drive
          await commitEliteUniverse(elite);

      } catch (e: any) {
          addLog(`Quant Error: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setStatus("Complete");
      }
  };

  const calculateSectorStats = (data: MasterTicker[]): SectorStat[] => {
      const sectors: { [key: string]: MasterTicker[] } = {};
      data.forEach(t => {
          const s = t.sector || "Unclassified";
          if (!sectors[s]) sectors[s] = [];
          sectors[s].push(t);
      });

      return Object.keys(sectors).map(sector => {
          const items = sectors[sector];
          const pes = items.map(i => i.pe).filter(v => v > 0 && v < 200).sort((a,b)=>a-b);
          const pbs = items.map(i => i.pbr).filter(v => v > 0 && v < 50).sort((a,b)=>a-b);
          const roes = items.map(i => i.roe).sort((a,b)=>a-b);

          return {
              sector,
              medianPE: pes[Math.floor(pes.length / 2)] || 20,
              medianPB: pbs[Math.floor(pbs.length / 2)] || 3,
              medianROE: roes[Math.floor(roes.length / 2)] || 10,
              count: items.length
          };
      });
  };

  const commitEliteUniverse = async (data: MasterTicker[]) => {
      if (!accessToken) return;
      addLog("Phase 4: Archiving Elite 500 to Stage 2 Vault...", "info");
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().replace('T','_').split('.')[0]}.json`;
      
      const payload = {
          manifest: {
              version: "2.0.0",
              strategy: "Sector_Neutral_Quality_Scoring",
              count: data.length,
              timestamp: new Date().toISOString()
          },
          elite_universe: data
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
      
      addLog("Vault Sync Complete. Stage 2 Finished.", "ok");
      if (onComplete) onComplete();
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v2.0</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                     {loading ? `Engine Status: ${status}` : 'Engine Ready'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button 
                onClick={executeQuantPipeline} 
                disabled={loading} 
                className={`px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${loading ? 'bg-cyan-900 text-cyan-200 cursor-wait' : 'bg-cyan-600 text-white hover:scale-105'}`}
            >
                {loading ? 'Processing...' : 'Run Quant Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
             {/* Quality vs Value Matrix */}
             <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality-Value Matrix (Top 100)</p>
                <div className="flex-1 w-full h-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                            <XAxis type="number" dataKey="sectorNeutralScore" name="Value Score" stroke="#64748b" fontSize={9} label={{ value: "Undervalued →", position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                            <YAxis type="number" dataKey="roe" name="ROE" stroke="#64748b" fontSize={9} label={{ value: "Quality (ROE) ↑", angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 'auto']} />
                            <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">
                                                <p className="text-xs font-black text-white mb-1">{data.symbol}</p>
                                                <p className="text-[9px] text-cyan-400">Score: {data.qualityScore}</p>
                                                <p className="text-[8px] text-slate-400">Val: {data.sectorNeutralScore} | ROE: {data.roe}%</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                            <ReferenceLine y={15} stroke="#475569" strokeDasharray="3 3" />
                            <Scatter name="Elite Stocks" data={eliteUniverse.slice(0, 100)} fill="#06b6d4">
                                {eliteUniverse.slice(0, 100).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.sectorNeutralScore > 60 && entry.roe > 20 ? '#10b981' : '#06b6d4'} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Sector Breakdown */}
             <div className="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col overflow-hidden">
                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-4">Sector Opportunities</p>
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {sectorStats.length > 0 ? sectorStats.map((s, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                            <div>
                                <p className="text-[9px] font-bold text-white uppercase">{s.sector}</p>
                                <p className="text-[7px] text-slate-500">Median PE: {s.medianPE.toFixed(1)}x</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-mono font-black text-cyan-400">{s.count}</p>
                                <p className="text-[7px] text-slate-600 uppercase">Assets</p>
                            </div>
                        </div>
                    )) : (
                        <div className="flex items-center justify-center h-full opacity-30 text-[9px] uppercase">
                            Waiting for calculation...
                        </div>
                    )}
                </div>
             </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[720px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden relative">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-4 rounded-[24px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
