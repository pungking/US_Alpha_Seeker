
import React, { useState, useEffect, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  
  // Quality Metrics
  roe: number;
  debtToEquity: number;
  pe: number;
  
  // Computed Scores
  qualityScore: number;
  profitScore: number;
  safeScore: number;
  valueScore: number;
  
  sector: string;
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [eliteUniverse, setEliteUniverse] = useState<QualityTicker[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0.0: Scoring Logic Ready.']);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const logRef = useRef<HTMLDivElement>(null);
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Timer for elapsed time
  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        setTimeStats({ elapsed: elapsedSec, eta: 0 });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Auto-start logic
  useEffect(() => {
    if (autoStart && !loading && eliteUniverse.length === 0) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
        executeQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const calculateScores = (item: any) => {
      const roe = Number(item.roe || item.returnOnEquity || 0);
      const debt = Number(item.debtToEquity || item.totalDebtToEquity || 100);
      const pe = Number(item.pe || item.per || 0);

      // Profitability (ROE) - Cap at 30%
      const profitScore = Math.min(100, Math.max(0, (roe / 25) * 100));

      // Safety (Debt) - 0 is best, 200 is worst
      const safeScore = Math.max(0, 100 - (debt / 2));

      // Value (PE) - 15 is ideal (100), >50 is 0
      let valueScore = 50;
      if (pe > 0 && pe <= 15) valueScore = 100;
      else if (pe > 15 && pe <= 25) valueScore = 80;
      else if (pe > 25 && pe <= 50) valueScore = 50;
      else valueScore = 20;

      // Composite
      const qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

      return {
          profitScore: Math.round(profitScore),
          safeScore: Math.round(safeScore),
          valueScore: Math.round(valueScore),
          qualityScore: Number(qualityScore.toFixed(1))
      };
  };

  const executeQualityScan = async () => {
      if (!accessToken) {
          addLog("Cloud Vault Disconnected.", "err");
          return;
      }
      setLoading(true);
      startTimeRef.current = Date.now();
      
      try {
          // 1. Fetch Stage 1 Data
          addLog("Phase 1: Retrieving Stage 1 Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 1 data missing.");
          
          const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
          
          const rawList = content.investable_universe || [];
          addLog(`Scanning ${rawList.length} assets...`, "info");
          setProgress({ current: 0, total: rawList.length });

          // 2. Score & Filter
          const scored = rawList.map((item: any) => {
              const scores = calculateScores(item);
              return { ...item, ...scores };
          });

          // Filter: Quality Score > 60 (Elite)
          const elite = scored.filter((s: any) => s.qualityScore >= 60).sort((a: any, b: any) => b.qualityScore - a.qualityScore);
          
          setEliteUniverse(elite);
          addLog(`${elite.length} Elite Assets Qualified.`, "ok");
          setProgress({ current: rawList.length, total: rawList.length });

          // 3. Save Stage 2
          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
          
          const payload = {
            manifest: { version: "5.0.0", count: elite.length, timestamp: new Date().toISOString(), strategy: "3-Factor_Quant_Model" },
            elite_universe: elite
          };

          const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
          });

          addLog(`Vault Synchronized: ${fileName}`, "ok");
          
          if (elite.length > 0) {
              handleSelectStock(elite[0]);
          }

          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Error: ${e.message}`, "err");
      } finally {
          setLoading(false);
      }
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
      if (res.files?.length > 0) return res.files[0].id;
      const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      }).then(r => r.json());
      return create.id;
  };

  const handleSelectStock = (stock: QualityTicker) => {
      setSelectedSymbol(stock.symbol);
      if (onStockSelected) onStockSelected(stock);
  };

  const getScoreColor = (type: string, score: number) => {
      if (score >= 80) return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      if (score >= 50) return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.0.0</h2>
                <div className="flex items-center space-x-3 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                     {loading ? `Scanning: ${progress.current}/${progress.total}` : '3-Factor Quant Active'}
                   </span>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
                 {loading && (
                     <div className="flex items-center space-x-2 mt-1">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span></span>
                     </div>
                 )}
              </div>
            </div>
            <button 
                onClick={executeQualityScan} 
                disabled={loading} 
                className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-cyan-800 text-cyan-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
                }`}
            >
              {loading ? 'Quant Processing...' : 'Start Deep Quality Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
             {/* Quality vs Value Matrix */}
             <div className="bg-black/40 p-4 rounded-3xl border border-white/5 h-[600px] flex flex-col relative">
                <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-2 absolute top-6 left-6 z-10">Quality Matrix (Top 100 Samples)</p>
                <div className="flex-1 w-full h-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart 
                            margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                            onClick={(e: any) => {
                                if (e && e.activePayload && e.activePayload[0]) {
                                    handleSelectStock(e.activePayload[0].payload);
                                }
                            }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                            <XAxis type="number" dataKey="valueScore" name="Value" stroke="#64748b" fontSize={9} label={{ value: "Value Score", position: 'bottom', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                            <YAxis type="number" dataKey="profitScore" name="Profit" stroke="#64748b" fontSize={9} label={{ value: "Profit Score", angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} domain={[0, 100]} />
                            <RechartsTooltip 
                                cursor={{ strokeDasharray: '3 3' }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">
                                                <p className="text-xs font-black text-white mb-1">{data.symbol}</p>
                                                <p className="text-[9px] text-cyan-400">Total: {data.qualityScore}</p>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[8px] text-emerald-400">P:{data.profitScore}</span>
                                                    <span className="text-[8px] text-blue-400">S:{data.safeScore}</span>
                                                    <span className="text-[8px] text-amber-400">V:{data.valueScore}</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <ReferenceLine x={50} stroke="#475569" strokeDasharray="3 3" />
                            <ReferenceLine y={50} stroke="#475569" strokeDasharray="3 3" />
                            <Scatter name="Elite Stocks" data={eliteUniverse.slice(0, 100)} fill="#06b6d4" cursor="pointer">
                                {eliteUniverse.slice(0, 100).map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.symbol === selectedSymbol ? '#f43f5e' : entry.qualityScore > 80 ? '#10b981' : '#06b6d4'} />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
             </div>

             {/* Elite Ranking List (Scrollable) */}
             <div className="bg-black/40 p-6 rounded-3xl border border-white/5 flex flex-col overflow-hidden h-[600px]">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Elite Candidates</p>
                    <span className="text-[8px] text-slate-500 font-mono">{eliteUniverse.length} Qualified</span>
                </div>
                <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                    {eliteUniverse.length > 0 ? eliteUniverse.map((s, i) => (
                        <div 
                            key={i} 
                            onClick={() => handleSelectStock(s)}
                            className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition-all ${selectedSymbol === s.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className={`text-[9px] font-mono font-bold w-6 ${i < 10 ? 'text-cyan-400' : 'text-slate-600'}`}>#{i + 1}</span>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] font-bold text-white uppercase">{s.symbol}</p>
                                        <span className="text-[6px] text-slate-500 px-1 bg-white/5 rounded border border-white/5">
                                            ROE {Number(s.roe).toFixed(2)}% | PER {s.pe ? Number(s.pe).toFixed(1) : 'N/A'}
                                        </span>
                                    </div>
                                    <p className="text-[7px] text-slate-500 truncate w-32">{s.name}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[12px] font-mono font-black text-white mb-1">{s.qualityScore}</p>
                                <div className="flex gap-1 justify-end">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getScoreColor('P', s.profitScore)}`} title={`Profitability Score (ROE: ${s.roe}%)`}>P:{s.profitScore}</span>
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getScoreColor('S', s.safeScore)}`} title={`Safety Score (D/E: ${s.debtToEquity})`}>S:{s.safeScore}</span>
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${getScoreColor('V', s.valueScore)}`} title={`Value Score (PER: ${s.pe})`}>V:{s.valueScore}</span>
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
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-4 rounded-[24px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
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
