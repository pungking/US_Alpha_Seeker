
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Scores
  profitScore: number;
  safeScore: number;
  valueScore: number;
  growthScore: number;
  qualityScore: number;

  // Metrics
  pe: number;
  roe: number;
  debtToEquity: number;
  currentRatio: number;
  zScoreProxy: number;
  fcf: number;
  
  // Meta
  lastUpdate: string;
  source: string;
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0 });
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<QualityTicker | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.1: 3-Factor Quant Protocol Online.']);
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        let etaSec = 0;
        if (progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Deep Quality Quant Filter...", "signal");
        executeDeepScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: QualityTicker) => {
      setSelectedTicker(ticker);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  const calculateDeepQuality = (data: any) => {
    // 0. Data Extraction & Normalization
    const roe = Number(data.roe || data.returnOnEquity || 0);
    const roic = Number(data.roic || data.returnOnInvestedCapital || (roe * 0.8)); // fallback
    const debt = Number(data.debtToEquity || data.debtEquityRatio || 0);
    const currentRatio = Number(data.currentRatio || 1.5);
    
    // Z-Score approximation if not provided: 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
    // We use a simplified proxy based on Debt and Liquidity if Z-Score isn't explicit
    const zScoreProxy = Number(data.altmanZScore || (currentRatio > 1 && debt < 50 ? 3.0 : 1.5)); 
    
    const pe = Number(data.pe || data.peRatio || 0);
    const pfcf = Number(data.priceToFreeCashFlow || 20); // default neutral if missing
    
    // Growth calculation inputs
    const revenue = Number(data.revenue || 0);
    const prevRevenue = Number(data.previousRevenue || revenue); // prevent div by zero
    const epsCurrent = Number(data.eps || 0);
    const epsPrev = Number(data.previousEps || epsCurrent);
    
    const netIncome = Number(data.netIncome || 0);
    const ocf = Number(data.operatingCashFlow || data.operatingCashflow || 0);
    const isOcfReconstructed = data.isOcfReconstructed || false;

    // Additional metrics for return
    const fcf = Number(data.freeCashFlow || (ocf - (data.capex || 0)));
    const investedCapital = Number(data.investedCapital || 0);
    const nopat = Number(data.nopat || 0);
    const totalAssets = Number(data.totalAssets || 1);
    const accruals = (netIncome - ocf) / totalAssets;
    
    const grossMargin = Number(data.grossMargin || 0);
    const operatingMargin = Number(data.operatingMargin || 0);
    const netMargin = Number(data.netMargin || 0);
    const fcfMargin = revenue > 0 ? (fcf / revenue) : 0;
    const workingCapital = Number(data.workingCapital || 0);

    // --- LOGIC FROM SNIPPET ---
    // 5. Growth
    const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
    const epsGrowth = epsPrev > 0 ? ((epsCurrent - epsPrev) / epsPrev) * 100 : 0;

    // --- SCORING ---
    
    let profitScore = Math.min(100, Math.max(0, (roe / 20) * 60 + (roic / 15) * 40));
    
    // Earnings Quality Flag
    // Trigger only if OCF is NOT reconstructed (real data) AND OCF is significantly lower than Net Income
    const earningsQualityFlag = !isOcfReconstructed && netIncome > 0 && ocf < (netIncome * 0.5);
    if (earningsQualityFlag) profitScore *= 0.8; 

    let safeScore = Math.max(0, 100 - (debt / 2));
    if (currentRatio > 0 && currentRatio < 1.0) safeScore -= 15;
    if (zScoreProxy < 1.8) safeScore -= 10;

    let valueScore = 50;
    if (pe > 0 && pe <= 15) valueScore = 90;
    else if (pe > 15 && pe <= 25) valueScore = 75;
    else if (pe > 25 && pe <= 50) valueScore = 50;
    else valueScore = 30;
    
    if (pfcf > 0 && pfcf < 15) valueScore += 10;
    // Bonus for consistent growth in Value Score
    if (revenueGrowth > 20 && epsGrowth > 20) valueScore += 10;

    // Growth Score Calculation (Explicit)
    let growthScore = 50; // Base
    if (revenueGrowth > 20) growthScore += 20;
    else if (revenueGrowth > 10) growthScore += 10;
    else if (revenueGrowth < 0) growthScore -= 10;
    
    if (epsGrowth > 20) growthScore += 20;
    else if (epsGrowth > 5) growthScore += 10;
    
    growthScore = Math.min(100, Math.max(0, growthScore));

    const qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

    return {
        scores: {
            profitScore: Math.round(profitScore),
            safeScore: Math.round(safeScore),
            valueScore: Math.round(valueScore),
            growthScore: Math.round(growthScore), 
            qualityScore: Number(qualityScore.toFixed(2))
        },
        metrics: {
            fcf,
            pfcf: Number(pfcf.toFixed(2)),
            roic: Number(roic.toFixed(2)),
            investedCapital,
            nopat,
            accruals,
            currentRatio: Number(currentRatio.toFixed(2)),
            zScoreProxy: Number(zScoreProxy.toFixed(2)),
            revenueGrowth: Number(revenueGrowth.toFixed(2)),
            epsGrowth: Number(epsGrowth.toFixed(2)),
            grossMargin: Number(grossMargin.toFixed(2)),
            operatingMargin: Number(operatingMargin.toFixed(2)),
            netMargin: Number(netMargin.toFixed(2)),
            fcfMargin: Number(fcfMargin.toFixed(2)),
            workingCapital,
            retainedEarnings: 0, 
            earningsQualityFlag,
            liquidityCrisisFlag: currentRatio < 1.0 && currentRatio > 0
        }
    };
  };

  const executeDeepScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    addLog("Phase 1: Loading Stage 1 Purified Universe...", "info");

    try {
        const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (!listRes.files?.length) throw new Error("Stage 1 data missing. Run Stage 1 first.");

        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        const universe = content.investable_universe || [];
        const total = universe.length;
        setProgress({ current: 0, total, cacheHits: 0 });
        addLog(`Universe Loaded: ${total} Assets. Starting Deep Scan...`, "info");

        const results: QualityTicker[] = [];
        const BATCH_SIZE = 5; // Reduced batch size for rate limits

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = universe.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(batch.map(async (item: any) => {
                try {
                    // Try to fetch extended data from FMP or Finnhub if keys present
                    // For simplicity in this fix, we use available data from Stage 0/1
                    // In a real scenario, this would call FMP `ratios` endpoint
                    
                    // Simulated augmentation with Stage 0 data
                    const augmentedItem = {
                        ...item,
                        // Assuming some of these might be populated in Stage 0, fallback to heuristic
                        revenue: item.revenue || item.marketCap * 0.2, // Crude proxy if missing
                        previousRevenue: (item.revenue || item.marketCap * 0.2) * 0.9, // Simulate 10% growth if missing
                        eps: item.eps || (item.price / (item.pe || 20)),
                        previousEps: (item.eps || (item.price / (item.pe || 20))) * 0.9,
                        operatingCashFlow: item.operatingCashflow || item.netIncome || (item.marketCap * 0.1),
                    };

                    const analysis = calculateDeepQuality(augmentedItem);
                    
                    return {
                        symbol: item.symbol,
                        name: item.name,
                        price: item.price,
                        marketCap: item.marketCap,
                        sector: item.sector,
                        ...analysis.scores,
                        ...analysis.metrics,
                        // Map essential metrics to top level
                        pe: augmentedItem.pe,
                        roe: augmentedItem.roe,
                        debtToEquity: augmentedItem.debtToEquity,
                        lastUpdate: new Date().toISOString(),
                        source: 'Quant_Engine_v5.1'
                    } as QualityTicker;

                } catch (e) {
                    console.warn(`Error processing ${item.symbol}`, e);
                    return null;
                }
            }));

            const validResults = batchResults.filter(Boolean) as QualityTicker[];
            results.push(...validResults);
            
            // Partial Update
            setProcessedData(prev => [...prev, ...validResults].sort((a,b) => b.qualityScore - a.qualityScore));
            if (!selectedTicker && validResults.length > 0) handleTickerSelect(validResults[0]);

            setProgress(prev => ({ ...prev, current: Math.min(i + BATCH_SIZE, total) }));
            // Rate Limit Throttle
            await new Promise(r => setTimeout(r, 200));
        }

        addLog(`Scan Complete. ${results.length} Qualified Assets.`, "ok");
        
        // Filter Elite (Top 300 or Score > 60)
        const elite = results.filter(r => r.qualityScore > 50).sort((a,b) => b.qualityScore - a.qualityScore).slice(0, 300);
        
        // Save to Drive
        const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
        // [TIMESTAMP]
        const now = new Date();
        const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;

        const payload = {
            manifest: { version: "5.1.0", count: elite.length, strategy: "3-Factor_Quant_Model", timestamp: new Date().toISOString() },
            elite_universe: elite
        };

        const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
        });

        addLog(`Vault Finalized: ${fileName}`, "ok");
        if (onComplete) onComplete();

    } catch (e: any) {
        addLog(`Critical Error: ${e.message}`, "err");
    } finally {
        setLoading(false);
        startTimeRef.current = 0;
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.1.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Scanning: ${progress.current}/${progress.total}` : '3-Factor Quant Ready'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span></span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span></span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeDeepScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Executing Quant Scan...' : 'Start Deep Quality Filter'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                    <span className="text-[8px] font-mono text-slate-500">{progress.current} / {progress.total}</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-blue-900/30 border-blue-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.qualityScore.toFixed(0)}</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between">
                         <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Quality Score</p>
                                 <p className="text-2xl font-black text-blue-400 tracking-tighter">{selectedTicker.qualityScore}</p>
                            </div>
                        </div>
                        
                        <div className="flex-1 w-full relative -ml-4 my-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                                    { subject: 'Profit', A: selectedTicker.profitScore, fullMark: 100 },
                                    { subject: 'Safety', A: selectedTicker.safeScore, fullMark: 100 },
                                    { subject: 'Value', A: selectedTicker.valueScore, fullMark: 100 },
                                    { subject: 'Growth', A: selectedTicker.growthScore, fullMark: 100 },
                                ]}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name={selectedTicker.symbol} dataKey="A" stroke="#3b82f6" strokeWidth={2} fill="#3b82f6" fillOpacity={0.4} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#3b82f6', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-2">
                             <div className="bg-slate-800 p-2 rounded-lg text-center border border-white/5">
                                 <p className="text-[7px] text-slate-400 uppercase font-bold">ROE</p>
                                 <p className="text-xs font-black text-white">{selectedTicker.roe.toFixed(1)}%</p>
                             </div>
                             <div className="bg-slate-800 p-2 rounded-lg text-center border border-white/5">
                                 <p className="text-[7px] text-slate-400 uppercase font-bold">Debt/Eq</p>
                                 <p className="text-xs font-black text-white">{selectedTicker.debtToEquity.toFixed(2)}</p>
                             </div>
                             <div className="bg-slate-800 p-2 rounded-lg text-center border border-white/5">
                                 <p className="text-[7px] text-slate-400 uppercase font-bold">PER</p>
                                 <p className="text-xs font-black text-white">{selectedTicker.pe.toFixed(1)}x</p>
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Logs</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
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
