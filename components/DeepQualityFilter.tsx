
import React, { useState, useEffect, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

// [STAGE 1 -> 2 DATA STRUCTURE]
interface MasterTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  industry: string;
  
  // Value Inputs
  pe: number;
  pbr: number;
  psr: number;
  
  // Quality Inputs
  roe: number;
  operatingMargins: number;
  debtToEquity: number;
  
  // Growth Inputs
  revenueGrowth: number;
  operatingCashflow: number;
  
  // Scoring Outputs
  qualityScore: number;  // Final Composite Score
  profitScore?: number;
  safeScore?: number;
  valueScore?: number;
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  
  const [eliteUniverse, setEliteUniverse] = useState<MasterTicker[]>([]);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.1: Waiting for Stage 1 Output...']);
  
  const logRef = useRef<HTMLDivElement>(null);
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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

      try {
          // 1. Load Stage 1 Data (Purified Universe ~2000)
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          
          // [CHANGE] Target STAGE1 file instead of STAGE0
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 1 Data not found. Please run Stage 1 first.");

          const fileId = listRes.files[0].id;
          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          // Handle array structure from Stage 1
          const universe: MasterTicker[] = content.investable_universe || [];
          addLog(`Input Loaded: ${universe.length} Candidates from Stage 1.`, "ok");

          if (universe.length === 0) throw new Error("Stage 1 file is empty.");

          // 2. Scoring Logic (The Quant Engine)
          addLog("Phase 2: Calculating 3-Factor Quality Scores...", "info");
          
          const scoredUniverse = universe.map(ticker => {
              // A. Profitability Score (ROE is King)
              // ROE > 15% is good. Max 100 points.
              const roeScore = Math.min(100, Math.max(0, (ticker.roe || 0) * 5));
              
              // B. Safety Score (Low Debt is King)
              // Debt/Equity < 50% is good. 
              const debt = ticker.debtToEquity || 100;
              const safeScore = Math.max(0, 100 - (debt * 0.5));

              // C. Value Score (Sector Neutral Proxy)
              // Low PER/PBR relative to growth. 
              // Simplification: PER < 20 is good.
              let valueScore = 50;
              if (ticker.pe > 0) {
                 if (ticker.pe < 15) valueScore = 90;
                 else if (ticker.pe < 25) valueScore = 70;
                 else if (ticker.pe < 40) valueScore = 50;
                 else valueScore = 30;
              }

              // Final Composite Score (Weighted)
              // 40% Profit + 30% Safety + 30% Value
              const finalScore = (roeScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

              return {
                  ...ticker,
                  profitScore: Number(roeScore.toFixed(0)),
                  safeScore: Number(safeScore.toFixed(0)),
                  valueScore: Number(valueScore.toFixed(0)),
                  qualityScore: Number(finalScore.toFixed(1))
              };
          });

          // 3. Filter & Sort (Elite 500)
          addLog("Phase 3: Cutting to Top 500 Elite...", "info");
          
          // Sort Descending by Quality Score
          scoredUniverse.sort((a, b) => b.qualityScore - a.qualityScore);
          
          // Slice Top 500
          const elite500 = scoredUniverse.slice(0, 500);
          setEliteUniverse(elite500);
          
          addLog(`Cutoff Score: ${elite500[elite500.length - 1].qualityScore}. Survivors: ${elite500.length}`, "ok");

          // 4. Commit to Drive
          await commitEliteUniverse(elite500);

      } catch (e: any) {
          addLog(`Quant Error: ${e.message}`, "err");
      } finally {
          setLoading(false);
      }
  };

  const commitEliteUniverse = async (data: MasterTicker[]) => {
      if (!accessToken) return;
      addLog("Phase 4: Archiving Elite 500 to Stage 2 Vault...", "info");
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      const fileName = `STAGE2_ELITE_UNIVERSE_${new Date().toISOString().replace('T','_').split('.')[0]}.json`;
      
      const payload = {
          manifest: {
              version: "2.1.0",
              strategy: "3-Factor_Quality_Score_Top500",
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v2.1</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                     {loading ? `Scoring & Filtering...` : 'Elite 500 Selection Ready'}
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
                {loading ? 'Crunching Numbers...' : 'Run Top 500 Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
             {/* Quality vs Value Matrix */}
             <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative">
                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-4 absolute top-6 left-6 z-10">Quality Matrix (Top 100 Samples)</p>
                <div className="flex-1 w-full h-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                            <XAxis type="number" dataKey="valueScore" name="Value" stroke="#64748b" fontSize={9} label={{ value: "Value Score", position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                            <YAxis type="number" dataKey="profitScore" name="Profit" stroke="#64748b" fontSize={9} label={{ value: "Profit Score", angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                            <Tooltip 
                                cursor={{ strokeDasharray: '3 3' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">
                                                <p className="text-xs font-black text-white mb-1">{data.symbol}</p>
                                                <p className="text-[9px] text-cyan-400">Total: {data.qualityScore}</p>
                                                <p className="text-[8px] text-slate-400">Profit: {data.profitScore} | Value: {data.valueScore}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                            <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                            <Scatter name="Elite Stocks" data={eliteUniverse.slice(0, 100)} fill="#06b6d4">
                                {eliteUniverse.slice(0, 100).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.qualityScore > 80 ? '#10b981' : '#06b6d4'} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Elite 500 Ranking List */}
             <div className="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col overflow-hidden h-[300px]">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Elite 500 Candidates</p>
                    <span className="text-[8px] text-slate-500 font-mono">{eliteUniverse.length} / 500</span>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {eliteUniverse.length > 0 ? eliteUniverse.slice(0, 100).map((s, i) => (
                        <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors cursor-default">
                            <div className="flex items-center gap-3">
                                <span className={`text-[9px] font-mono font-bold w-6 ${i < 10 ? 'text-cyan-400' : 'text-slate-600'}`}>#{i + 1}</span>
                                <div>
                                    <p className="text-[10px] font-bold text-white uppercase">{s.symbol}</p>
                                    <p className="text-[7px] text-slate-500 truncate w-24">{s.name}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-mono font-black text-cyan-400">{s.qualityScore}</p>
                                <div className="flex gap-1 justify-end">
                                    <span className="text-[6px] text-slate-600 px-1 border border-slate-700 rounded">P:{s.profitScore}</span>
                                    <span className="text-[6px] text-slate-600 px-1 border border-slate-700 rounded">S:{s.safeScore}</span>
                                    <span className="text-[6px] text-slate-600 px-1 border border-slate-700 rounded">V:{s.valueScore}</span>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="flex items-center justify-center h-full opacity-30 text-[9px] uppercase">
                            Awaiting Calculation...
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
