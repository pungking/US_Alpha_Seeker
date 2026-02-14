
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// --- QUANT ENGINE UTILS v6.6.0 (Enhanced Logic) ---

// 1. Smart Normalizer: Handles Mixed Units (0.15 vs 15.0) & Winsorization
const normalizeMetric = (val: any, min: number, max: number, isPercent: boolean = true): number => {
    if (val === null || val === undefined || val === '') return 0;
    let num = Number(val);
    if (isNaN(num) || !isFinite(num)) return 0;

    // Unit Correction (0.15 -> 15.0)
    // Only apply if it's very small and likely a decimal fraction representation of percent
    if (isPercent && Math.abs(num) <= 2.0 && num !== 0) {
        num = num * 100;
    }

    // Winsorization (Clipping Outliers)
    // Prevents one ticker with ROE 493% from breaking the entire scale
    return Math.max(min, Math.min(max, num));
};

// 2. Zero Imputation (Missing Data Defense)
// If critical metrics are 0 (likely missing), replace with a "Safe Penalty" value
const imputeValue = (val: number, fallback: number, allowZero: boolean = false): number => {
    // If it's undefined, null, or NaN, return fallback
    if (val === null || val === undefined || isNaN(val)) return fallback;
    // If it's exactly 0 and zero is NOT allowed, return fallback
    if (val === 0 && !allowZero) return fallback;
    return val;
};

// 3. Score Mapper (Value to 0-100 Score)
const getScore = (val: number, target: number, type: 'HIGHER_BETTER' | 'LOWER_BETTER' = 'HIGHER_BETTER') => {
    if (type === 'HIGHER_BETTER') {
        return Math.min(100, Math.max(0, (val / target) * 100));
    } else {
        // For Debt, PER etc. Lower is better.
        // If val > target * 2, score is 0. If val is 0, score is 100.
        return Math.min(100, Math.max(0, 100 - (val / target) * 50)); 
    }
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v6.6: Dual-Engine (Fin/Non-Fin) Loaded.']);
  const logRef = useRef<HTMLDivElement>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Filter...", "signal");
        executeDeepFilter();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: any) => {
    setSelectedTicker(ticker);
    if (onStockSelected) onStockSelected(ticker);
  };

  // --- DRIVE UTILS ---
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

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form });
  };

  const executeDeepFilter = async () => {
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);

      try {
          addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 1 Data Missing.");

          const stage1Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage1Content.investable_universe || [];
          addLog(`Targets Acquired: ${candidates.length} candidates.`, "ok");
          setProgress({ current: 0, total: candidates.length, msg: 'Dual-Engine Processing...' });

          const results: any[] = [];
          
          // --- SCORING ENGINE ---
          let processedCount = 0;
          for (const item of candidates) {
              processedCount++;

              // 1. Sector Identification (Dual Engine Trigger)
              const sector = (item.sector || '').toLowerCase();
              const isFinancial = sector.includes('financial') || sector.includes('bank') || sector.includes('insurance') || sector.includes('capital');
              
              // 2. Data Cleaning & Imputation (The "Zero" Defense)
              // Debt: Impute 0 to Sector Median Proxy (1.5 for Non-Fin, Ignored for Fin)
              let debt = Number(item.debtToEquity || 0);
              // Non-financials with 0 debt usually mean missing data in bulk feeds. Financials often report high debt (deposits).
              // If it's truly 0 for a normal co, it's great, but rare. We treat 0 as potentially missing and impute a 'meh' value (1.5).
              // If financial, we ignore debt mostly anyway.
              if (debt === 0) debt = isFinancial ? 0 : 1.5; 

              // ROE/ROA: Winsorize to prevent 493% skew
              // Clamp ROE between -30% and 80%, ROA between -10% and 30%
              const roe = normalizeMetric(item.roe, -30, 80, true);
              const roa = normalizeMetric(item.roa, -10, 30, true);
              
              // Valuation: PER & PBR
              // If 0 or missing, assume 'Expensive' to be safe (penalty)
              const pe = imputeValue(Number(item.pe || item.per), 25, false); // Missing PE -> Assume 25
              const pbr = imputeValue(Number(item.pbr || item.pb), 2, false); // Missing PBR -> Assume 2.0

              // 3. Scoring Engines
              let profitScore = 0;
              let safeScore = 0;
              let valueScore = 0;
              let qualityScore = 0;

              if (isFinancial) {
                  // [ENGINE A] Financial Services Model
                  // Banks run on leverage, so Debt/Equity is high/meaningless. 
                  // Safety comes from PBR (Asset Quality) and ROA (Efficiency).
                  
                  // Profit: Heavily weighted on ROA (Return on Assets)
                  // Target: ROA > 1.5% is excellent for banks. ROE > 15%.
                  profitScore = (getScore(roa, 1.5, 'HIGHER_BETTER') * 0.7) + (getScore(roe, 15, 'HIGHER_BETTER') * 0.3);

                  // Safety: PBR is key. Low PBR (< 1.0) provides safety margin.
                  // Target: PBR < 1.0 = Safe (Score 100). PBR > 2.0 = Risky.
                  safeScore = getScore(pbr, 1.0, 'LOWER_BETTER'); 

                  // Value: Low PE is standard
                  valueScore = getScore(pe, 12, 'LOWER_BETTER');
                  
              } else {
                  // [ENGINE B] General Corporate Model
                  // Standard manufacturing/services/tech model.
                  
                  // Profit: ROE is King.
                  // Target: ROE > 20%
                  profitScore = getScore(roe, 20, 'HIGHER_BETTER');

                  // Safety: Debt/Equity matters.
                  // Target: D/E < 1.0 (100%)
                  safeScore = getScore(debt, 1.0, 'LOWER_BETTER');

                  // Value: Earnings Yield (1/PE) or standard PE check.
                  // Target: PE < 20
                  valueScore = getScore(pe, 20, 'LOWER_BETTER');
              }

              // 4. Composite Quality Score
              // Weighted average: Profit (40%), Safety (30%), Value (30%)
              qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);
              
              // 5. Data Integrity Check (Sanity Guard)
              let dataQuality = 'HIGH';
              if (item.pe === 0 || item.pe === null) dataQuality = 'LOW'; // Missing PE is major flag
              if (roe === 0 && profitScore < 10) dataQuality = 'MEDIUM'; // Suspiciously low profit data
              if (item.marketCap < 50000000) dataQuality = 'LOW'; // Nano-cap filtering

              // Z-Score Proxy (Simulated)
              // Since we don't have full balance sheet items like Working Capital in Stage 1, we use proxies.
              const zScore = isFinancial ? (roa * 1.5 + (1/pbr)) : (1.2 + (roe/10) + (1/debt));

              // 6. Selection Threshold
              // Relaxed slightly to capture Value plays, but strict on Quality
              if (qualityScore > 40 && dataQuality !== 'LOW') {
                  results.push({
                      ...item,
                      roe, // Normalized
                      roa, // Normalized
                      debtToEquity: debt, // Imputed
                      pbr, // Imputed
                      zScoreProxy: Number(zScore.toFixed(2)),
                      profitScore: Math.round(profitScore),
                      safeScore: Math.round(safeScore),
                      valueScore: Math.round(valueScore),
                      qualityScore: Number(qualityScore.toFixed(2)),
                      dataQuality,
                      radarData: [
                        { subject: 'Profit', A: Math.round(profitScore), fullMark: 100 },
                        { subject: 'Safety', A: Math.round(safeScore), fullMark: 100 },
                        { subject: 'Value', A: Math.round(valueScore), fullMark: 100 },
                      ],
                      scoringEngine: isFinancial ? 'Financial_Model_v6' : 'Standard_Corp_v6'
                  });
              }

              if (processedCount % 100 === 0) {
                  setProgress({ current: processedCount, total: candidates.length, msg: 'Running Dual-Engine...' });
                  await new Promise(r => setTimeout(r, 0));
              }
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);
          const eliteCandidates = results.slice(0, 300);
          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

          addLog(`Dual-Engine Scan Complete. ${eliteCandidates.length} Elite Assets Selected.`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "6.6.0", 
                  count: eliteCandidates.length, 
                  timestamp: new Date().toISOString(),
                  engine: "Dual_Sector_Quant_Engine_Robust" 
              },
              elite_universe: eliteCandidates
          };

          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, msg: '' });
      }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 text-emerald-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v6.6.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-emerald-400 text-emerald-400 animate-pulse' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>
                        {loading ? `Scanning: ${progress.msg}` : 'Dual-Engine Quant Ready'}
                    </span>
                </div>
              </div>
            </div>
            <button 
              onClick={executeDeepFilter} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* List */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Quality Rank ({processedData.length})</p>
                      <span className="text-[8px] font-mono text-slate-500">Sorted by Quality Score</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {processedData.length > 0 ? processedData.map((t, i) => (
                          <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-blue-900/30 border-blue-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-blue-400' : 'text-slate-500'}`}>{i + 1}</span>
                                  <div>
                                      <p className="text-xs font-black text-white">{t.symbol}</p>
                                      <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-mono font-bold text-white">{t.qualityScore.toFixed(1)}</p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                      <span className={`w-1 h-1 rounded-full ${t.profitScore > 70 ? 'bg-emerald-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.safeScore > 70 ? 'bg-blue-500' : 'bg-slate-700'}`}></span>
                                      <span className={`w-1 h-1 rounded-full ${t.valueScore > 70 ? 'bg-amber-500' : 'bg-slate-700'}`}></span>
                                  </div>
                              </div>
                          </div>
                      )) : (
                          <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                              Waiting for Quant Data...
                          </div>
                      )}
                  </div>
              </div>

              {/* Detail */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[400px]">
                   {selectedTicker ? (
                       <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                          <div className="flex justify-between items-start">
                              <div>
                                  <div className="flex items-baseline gap-3">
                                      <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                       <span className="text-[8px] font-black bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 uppercase">ROE {selectedTicker.roe.toFixed(2)}%</span>
                                       <span className="text-[8px] font-black bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">Debt {selectedTicker.debtToEquity.toFixed(2)}</span>
                                  </div>
                              </div>
                              <div className="text-right">
                                   <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Quality</p>
                                   <p className="text-2xl font-black text-blue-400 tracking-tighter">{selectedTicker.qualityScore.toFixed(1)}</p>
                              </div>
                          </div>

                          <div className="flex-1 w-full relative -ml-4 my-2">
                              <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                      <PolarGrid stroke="#334155" opacity={0.3} />
                                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                      <Radar name={selectedTicker.symbol} dataKey="A" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.4} />
                                      <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#3b82f6', fontSize: '10px' }} />
                                  </RadarChart>
                              </ResponsiveContainer>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 mt-2">
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Profit</p>
                                   <p className={`text-xs font-black ${selectedTicker.profitScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.profitScore}</p>
                               </div>
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Z-Score</p>
                                   <p className={`text-xs font-black ${selectedTicker.zScoreProxy > 2.9 ? 'text-emerald-400' : selectedTicker.zScoreProxy < 1.8 ? 'text-rose-400' : 'text-amber-400'}`}>{selectedTicker.zScoreProxy}</p>
                               </div>
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Safety</p>
                                   <p className={`text-xs font-black ${selectedTicker.safeScore > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.safeScore}</p>
                               </div>
                          </div>
                       </div>
                   ) : (
                       <div className="h-full flex flex-col items-center justify-center opacity-20">
                           <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                           <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                       </div>
                   )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
