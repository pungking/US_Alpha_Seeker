
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Scoring
  fScore: number;       // 0-9
  zScore: number;       // Bankruptcy Risk
  fundamentalScore: number; // Composite Score (0-100)
  
  // Valuation
  intrinsicValue: number;
  upsidePotential: number;
  fairValueGap: number; // Percentage
  
  // Advanced Metrics (Hedge Fund Style)
  roic: number;         // Return on Invested Capital
  ruleOf40: number;     // Growth + Margin
  fcfYield: number;     // Free Cash Flow Yield
  grossMargin: number;  
  pegRatio: number;
  
  // AI Qualitative
  economicMoat: 'Wide' | 'Narrow' | 'None' | 'Analyzing...';
  
  // Visualization
  radarData: {
      valuation: number;
      profitability: number;
      growth: number;
      financialHealth: number;
      moat: number;
      momentum: number;
  };
  
  lastUpdate: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Fortress v6.0: Quant Strategy Loaded.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const logRef = useRef<HTMLDivElement>(null);

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
        addLog("AUTO-PILOT: Engaging Fundamental Fortress Protocol...", "signal");
        executeFundamentalFortress();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const handleTickerSelect = (ticker: FundamentalTicker) => {
      setSelectedTicker(ticker);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  // --- HEDGE FUND FORMULAS ---
  
  const calculateROIC = (nopat: number, investedCapital: number) => {
      if (investedCapital <= 0) return 0;
      return (nopat / investedCapital) * 100;
  };

  const calculateRuleOf40 = (revenueGrowth: number, ebitdaMargin: number) => {
      return (revenueGrowth * 100) + (ebitdaMargin * 100);
  };

  const calculateIntrinsicValue = (eps: number, growthRate: number, currentYield: number = 4.4) => {
      // Modified Graham Formula: V = EPS * (8.5 + 2g) * 4.4 / Y
      // Conservative adjustment: Cap growth rate at 15% for safety
      const safeGrowth = Math.min(growthRate * 100, 15); 
      if (eps <= 0) return 0;
      return (eps * (8.5 + 2 * safeGrowth) * 4.4) / currentYield;
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  };

  const fetchFinancials = async (symbol: string) => {
      if (!fmpKey) throw new Error("FMP Key Missing");
      // Use Promise.all for parallel fetching (Speed Optimization)
      const [ratiosRes, metricsRes, quoteRes, growthRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any)),
          fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any)),
          fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any)),
          fetch(`https://financialmodelingprep.com/api/v3/financial-growth/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any))
      ]);
      
      const r = ratiosRes.ok ? (await ratiosRes.json())[0] || {} : {};
      const m = metricsRes.ok ? (await metricsRes.json())[0] || {} : {};
      const q = quoteRes.ok ? (await quoteRes.json())[0] || {} : {};
      const g = growthRes.ok ? (await growthRes.json())[0] || {} : {};
      
      return { r, m, q, g };
  };

  const determineEconomicMoat = (grossMargin: number, roic: number, roe: number): 'Wide' | 'Narrow' | 'None' => {
      // Algorithm-based Moat Detection (Zero Cost)
      if (grossMargin > 0.4 && roic > 15 && roe > 20) return 'Wide';
      if (grossMargin > 0.2 && roic > 8) return 'Narrow';
      return 'None';
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      // 1. Load Top 50% from Stage 2
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 Data Missing. Please run Stage 2.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let candidates = content.elite_universe || [];
      // Filter Top 50% based on Stage 2 Quality Score
      candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const cutoff = Math.ceil(candidates.length * 0.5);
      const eliteSquad = candidates.slice(0, cutoff);

      addLog(`Fortress Protocol: Analyzing Top ${eliteSquad.length} Assets (Top 50%)...`, "info");
      setProgress({ current: 0, total: eliteSquad.length });

      const results: FundamentalTicker[] = [];

      for (let i = 0; i < eliteSquad.length; i++) {
          const item = eliteSquad[i];
          
          try {
              const { r, m, q, g } = await fetchFinancials(item.symbol);
              const price = q.price || item.price || 0;
              
              // --- 1. Advanced Metrics Calculation ---
              const roic = m.roicTTM ? m.roicTTM * 100 : calculateROIC(m.netIncomePerShare * m.sharesOutstanding, m.investedCapital);
              const revenueGrowth = g.revenueGrowth || 0;
              const ebitdaMargin = r.operatingProfitMarginTTM || 0;
              const ruleOf40 = calculateRuleOf40(revenueGrowth, ebitdaMargin);
              const fcfYield = m.freeCashFlowYieldTTM ? m.freeCashFlowYieldTTM * 100 : 0;
              const pegRatio = r.pegRatioTTM || 0;
              
              // --- 2. Intrinsic Value (Valuation) ---
              // Use API DCF if available, otherwise Graham Formula
              let intrinsicValue = m.dcf && m.dcf > 0 ? m.dcf : 0;
              if (intrinsicValue === 0) {
                  intrinsicValue = calculateIntrinsicValue(m.netIncomePerShare, revenueGrowth);
              }
              // Safety Net: If intrinsic value is wild, clamp it
              if (intrinsicValue > price * 3) intrinsicValue = price * 3; 
              if (intrinsicValue <= 0) intrinsicValue = price;

              const upside = ((intrinsicValue - price) / price) * 100;

              // --- 3. Scoring Matrix (Weights) ---
              // Value (40%)
              const valScore = normalizeScore(upside, -20, 50); 
              // Growth (30%)
              const growthScore = normalizeScore(ruleOf40, 20, 60);
              // Quality (30%)
              const qualScore = normalizeScore(roic, 5, 25);
              
              const compositeScore = (valScore * 0.4) + (growthScore * 0.3) + (qualScore * 0.3);

              // --- 4. Radar Data Construction ---
              const radarData = {
                  valuation: valScore,
                  profitability: normalizeScore(r.returnOnEquityTTM || 0, 5, 30),
                  growth: growthScore,
                  financialHealth: normalizeScore(item.zScore || 3, 1.5, 5), // From Stage 2 or Default
                  moat: normalizeScore(r.grossProfitMarginTTM || 0, 0.2, 0.7),
                  momentum: normalizeScore(ruleOf40, 0, 80) // Using Rule of 40 as proxy for business momentum
              };

              const ticker: FundamentalTicker = {
                  symbol: item.symbol,
                  name: item.name,
                  price: price,
                  marketCap: item.marketCap || m.marketCap || 0,
                  sector: item.sector,
                  fScore: item.fScore || 5, // Fallback
                  zScore: item.zScore || 3, // Fallback
                  fundamentalScore: Number(compositeScore.toFixed(2)),
                  intrinsicValue: Number(intrinsicValue.toFixed(2)),
                  upsidePotential: Number(upside.toFixed(2)),
                  fairValueGap: Number(upside.toFixed(2)),
                  roic: Number(roic.toFixed(2)),
                  ruleOf40: Number(ruleOf40.toFixed(2)),
                  fcfYield: Number(fcfYield.toFixed(2)),
                  grossMargin: Number((r.grossProfitMarginTTM || 0) * 100),
                  pegRatio: Number(pegRatio.toFixed(2)),
                  economicMoat: determineEconomicMoat(r.grossProfitMarginTTM, roic, r.returnOnEquityTTM),
                  radarData,
                  lastUpdate: new Date().toISOString()
              };

              results.push(ticker);
              if (i % 5 === 0) setProgress({ current: i + 1, total: eliteSquad.length });
              await new Promise(r => setTimeout(r, 200)); // Rate limit buffer

          } catch (err) { console.warn(`Skip ${item.symbol}`, err); }
      }

      // Rank by Fundamental Score
      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      // --- 5. Selective AI Audit (Top 10 Only) ---
      // We perform AI Moat analysis ONLY on the very best to save cost/time
      // This is implicit in the UI display logic or can be a separate async enrichment
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "6.0.0", count: results.length, strategy: "Fundamental_Fortress_HedgeFund_Model" },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Fortress Secured. ${results.length} Assets Validated & Saved.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`System Failure: ${e.message}`, "err");
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

  const getRadarData = (ticker: FundamentalTicker | null) => {
      if (!ticker) return [];
      return [
          { subject: 'Valuation', A: ticker.radarData.valuation, fullMark: 100 },
          { subject: 'Profit', A: ticker.radarData.profitability, fullMark: 100 },
          { subject: 'Growth', A: ticker.radarData.growth, fullMark: 100 },
          { subject: 'Health', A: ticker.radarData.financialHealth, fullMark: 100 },
          { subject: 'Moat', A: ticker.radarData.moat, fullMark: 100 },
          { subject: 'Momentum', A: ticker.radarData.momentum, fullMark: 100 },
      ];
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Fortress v6.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Processing: ${progress.current}/${progress.total}` : 'Hedge Fund Strategy Ready'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span>
                       </span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span>
                       </span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button onClick={executeFundamentalFortress} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Calculating Intrinsic Value...' : 'Execute Fortress Protocol (Top 50%)'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Fortress Candidates ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Composite Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}/100</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Score</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Quantum Processing...
                         </div>
                     )}
                 </div>
              </div>

              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest mt-1">Fundamental Radar Analysis</p>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Intrinsic Value Gauge</p>
                                 <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                     {/* Center Marker (Fair Value) */}
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10"></div>
                                     {/* Current Price Marker */}
                                     <div 
                                        className={`absolute top-0 bottom-0 w-1 z-20 ${selectedTicker.upsidePotential > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ 
                                            left: `${Math.min(100, Math.max(0, 50 - (selectedTicker.upsidePotential / 2)))}%`
                                        }}
                                     ></div>
                                 </div>
                                 <p className={`text-[10px] font-mono font-black mt-1 ${selectedTicker.upsidePotential > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                     {selectedTicker.upsidePotential > 0 ? `Undervalued (+${selectedTicker.upsidePotential}%)` : `Premium (${selectedTicker.upsidePotential}%)`}
                                 </p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(selectedTicker)}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Magic Metrics Grid */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                 { label: 'ROIC', val: `${selectedTicker.roic.toFixed(1)}%`, good: selectedTicker.roic > 10 },
                                 { label: 'Rule of 40', val: `${selectedTicker.ruleOf40.toFixed(1)}`, good: selectedTicker.ruleOf40 > 40 },
                                 { label: 'Gross Marg', val: `${selectedTicker.grossMargin.toFixed(1)}%`, good: selectedTicker.grossMargin > 40 },
                                 { label: 'FCF Yield', val: `${selectedTicker.fcfYield.toFixed(1)}%`, good: selectedTicker.fcfYield > 3 }
                             ].map((m, idx) => (
                                 <div key={idx} className={`p-2 rounded-lg text-center border ${m.good ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800 border-white/5'}`}>
                                     <p className="text-[7px] text-slate-500 uppercase font-bold">{m.label}</p>
                                     <p className={`text-[10px] font-black ${m.good ? 'text-emerald-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select an Asset to Audit</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
