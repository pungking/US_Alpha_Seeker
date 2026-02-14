
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// --- SUPER NORMALIZER ---
const findValue = (obj: any, candidates: string[]): number => {
    if (!obj || typeof obj !== 'object') return 0;
    
    // Create a flattened map of all keys (lowercase, no symbols) to values
    const normalizedMap = new Map<string, number>();
    
    const recurse = (current: any) => {
        for (const key in current) {
             const val = current[key];
             if (typeof val === 'number') {
                 const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                 normalizedMap.set(normKey, val);
             } else if (typeof val === 'string') {
                 const num = parseFloat(val.replace(/,/g, '').replace(/%/g, ''));
                 if (!isNaN(num)) {
                     const normKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
                     normalizedMap.set(normKey, num);
                 }
             }
        }
    };
    recurse(obj);

    for (const candidate of candidates) {
        const target = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normalizedMap.has(target)) return normalizedMap.get(target) || 0;
    }
    return 0;
};

// Auto-scaler: Detects if value is 0.15 (decimal) vs 15.0 (percent)
const toPercent = (val: number) => {
    if (val !== 0 && Math.abs(val) <= 5.0) {
        return Number((val * 100).toFixed(2));
    }
    return Number(val.toFixed(2));
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.2: Optimized Data Mapping.']);
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
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Download failed`);
      return await res.json();
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

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
      });
  };

  // --- ANALYSIS CORE ---
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

          if (!listRes.files?.length) throw new Error("Stage 1 Data Missing. Please run Stage 1 first.");

          const stage1Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage1Content.investable_universe || [];
          addLog(`Targets Acquired: ${candidates.length} candidates.`, "ok");
          setProgress({ current: 0, total: candidates.length, msg: 'Connecting to History Vault...' });

          // Find Folders
          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          if (!systemMapId) throw new Error("System_Identity_Maps folder not found.");

          const historyFolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId);
          if (!historyFolderId) throw new Error("Financial_Data_History folder not found.");

          const groupedByLetter: Record<string, any[]> = {};
          candidates.forEach((c: any) => {
              const letter = c.symbol.charAt(0).toUpperCase();
              if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
              groupedByLetter[letter].push(c);
          });

          const results: any[] = [];
          const sortedLetters = Object.keys(groupedByLetter).sort();

          for (const letter of sortedLetters) {
              setProgress(prev => ({ ...prev, msg: `Scanning Cylinder ${letter}...` }));
              
              // Only load HISTORY files. Daily data is already in 'candidates' from Stage 1.
              let historyDataMap = new Map();
              const histFileName = `${letter}_stocks_history.json`;
              const histFileId = await findFileId(accessToken, histFileName, historyFolderId);
              
              if (histFileId) {
                  const content = await downloadFile(accessToken, histFileId);
                  // Flexible parsing for array or object map
                  if (Array.isArray(content)) {
                      content.forEach((d: any) => { 
                          if(d.symbol) historyDataMap.set(d.symbol, d.financials || d.history || []); 
                      });
                  } else {
                      Object.keys(content).forEach(sym => {
                           historyDataMap.set(sym, content[sym].financials || content[sym] || []);
                      });
                  }
              } else {
                  addLog(`History missing for letter ${letter}`, "warn");
              }

              const batch = groupedByLetter[letter];
              for (const item of batch) {
                  // Merge Stage 1 Daily Data + Loaded History Data
                  const fullHistory = historyDataMap.get(item.symbol) || [];
                  
                  // Calculate Scores
                  // 1. ROE (Return On Equity) - Ensure Percent
                  const roe = toPercent(item.roe || findValue(item, ['returnOnEquity', 'roe']) || 0);
                  
                  // 2. Debt/Equity
                  // Handle Debt=0 Anomaly: If Debt is 0 and sector is NOT Financial/Tech, assume missing data and penalize.
                  let debt = item.debtToEquity || findValue(item, ['totalDebtToEquity', 'debtEquityRatio']) || 0;
                  const isFinancial = (item.sector || '').includes('Financial') || (item.sector || '').includes('Bank');
                  
                  // Penalize missing debt data for general industries to prevent false positives
                  if (debt === 0 && !isFinancial) {
                      debt = 1.0; // Assume average risk instead of perfect safety
                  }
                  
                  // 3. Z-Score (Altman)
                  // Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
                  let zScore = 0;
                  // Try to find Balance Sheet items from History or Daily snapshot
                  const totalAssets = findValue(item, ['totalAssets']) || 1;
                  const workingCapital = (findValue(item, ['totalCurrentAssets']) - findValue(item, ['totalCurrentLiabilities'])) || (totalAssets * 0.1);
                  const retainedEarnings = findValue(item, ['retainedEarnings']) || (totalAssets * 0.2);
                  const ebit = findValue(item, ['ebit', 'operatingIncome']) || (totalAssets * 0.1);
                  const marketCap = item.marketCap || (item.price * item.volume) || 1; // Approx
                  const totalLiab = findValue(item, ['totalLiabilities']) || (totalAssets * 0.5);
                  const sales = findValue(item, ['totalRevenue', 'revenue']) || (totalAssets * 0.8);

                  if (totalAssets > 1000) { // Ensure we have some data
                      const A = workingCapital / totalAssets;
                      const B = retainedEarnings / totalAssets;
                      const C = ebit / totalAssets;
                      const D = marketCap / totalLiab;
                      const E = sales / totalAssets;
                      zScore = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
                  } else {
                      // Proxy Z-Score if BS data is missing
                      zScore = (roe > 10 && debt < 1.0) ? 3.5 : 1.5; 
                  }
                  
                  // Ensure Revenue Growth is normalized
                  const revenueGrowth = toPercent(item.revenueGrowth || 0);

                  // 4. Scoring Logic
                  let profitScore = Math.min(100, Math.max(0, roe * 4));
                  let safeScore = Math.min(100, Math.max(0, (3 - debt) * 33));
                  let valueScore = 50; // Neutral default
                  if (item.pe > 0 && item.pe < 20) valueScore = 90;
                  else if (item.pe > 50) valueScore = 30;

                  const qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

                  if (qualityScore > 40 || (valueScore > 70 && safeScore > 50)) {
                      results.push({
                          ...item,
                          roe,
                          debtToEquity: debt,
                          revenueGrowth, // Update with normalized value
                          zScoreProxy: Number(zScore.toFixed(2)),
                          profitScore: Math.round(profitScore),
                          safeScore: Math.round(safeScore),
                          valueScore: Math.round(valueScore),
                          qualityScore: Number(qualityScore.toFixed(2)),
                          radarData: [
                            { subject: 'Profit', A: Math.round(profitScore), fullMark: 100 },
                            { subject: 'Safety', A: Math.round(safeScore), fullMark: 100 },
                            { subject: 'Value', A: Math.round(valueScore), fullMark: 100 },
                          ],
                          fullHistory: fullHistory.slice(0, 4) // Keep light
                      });
                  }
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 10)); // Yield to UI
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);
          const eliteCandidates = results.slice(0, 300);
          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

          addLog(`Deep Scan Complete. ${eliteCandidates.length} Elite Assets Selected.`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          
          const kstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "5.3.0", 
                  count: eliteCandidates.length, 
                  timestamp: new Date().toISOString(),
                  engine: "3-Factor_Quant_Model_Robust" 
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
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-emerald-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.2.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-emerald-400 text-emerald-400 animate-pulse' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'}`}>
                        {loading ? `Scanning: ${progress.msg}` : '3-Factor Quant Ready'}
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
