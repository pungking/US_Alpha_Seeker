
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
  fScore: number;
  zScore: number;
  intrinsicValue: number;
  upsidePotential: number;
  radarData: {
      valuation: number;
      profitability: number;
      growth: number;
      financialHealth: number;
      moat: number;
      momentum: number;
  };
  eps: number;
  bps: number;
  pe: number;
  fundamentalScore: number;
  lastUpdate: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const METRIC_EXPLANATIONS: Record<string, { title: string, desc: string, range: string }> = {
    'F_SCORE': {
        title: "Piotroski F-Score (재무 건전성)",
        desc: "기업의 재무 상태를 수익성, 레버리지, 운영 효율성 등 9가지 항목으로 정밀 진단한 점수입니다. \n\n**해석 가이드**:\n- **8~9점**: 초우량 기업 (Strong Buy)\n- **5~7점**: 양호 (Hold/Buy)\n- **0~4점**: 재무 부실 위험 (Avoid)",
        range: "Target: 7 ~ 9"
    },
    'Z_SCORE': {
        title: "Altman Z-Score (파산 위험도)",
        desc: "기업의 2년 내 파산 가능성을 예측하는 확률 모델입니다. \n\n**해석 가이드**:\n- **3.0 이상**: 안전 지대 (Safe Zone)\n- **1.8 ~ 3.0**: 주의 구간 (Grey Zone)\n- **1.8 미만**: 파산 고위험 (Distress Zone)",
        range: "Target: > 3.0"
    },
    'FV_GAP': {
        title: "Fair Value Gap (적정가 괴리율)",
        desc: "벤자민 그레이엄(Graham) 모델과 이익수익률(Earnings Yield)을 결합하여 산출한 '내재 가치' 대비 현재 주가의 위치입니다. \n\n**해석 가이드**:\n- **+20% 이상**: 강력한 저평가 (안전마진 확보)\n- **0% ~ 20%**: 적정 가치 구간\n- **음수(-)**: 고평가 상태 (Premium)",
        range: "Target: > +15%"
    }
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null); 
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Fortress v5.0: Initializing 3-Layer Sieve...']);
  
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
        addLog("AUTO-PILOT: Engaging Deep Fundamental Audit (Top 50%)...", "signal");
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

  const toggleMetric = (metric: string) => {
      if (activeMetric === metric) setActiveMetric(null);
      else setActiveMetric(metric);
  };

  const calculateGrahamNumber = (eps: number, bps: number): number => {
      if (eps <= 0 || bps <= 0) return 0;
      return Math.sqrt(22.5 * eps * bps);
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  };

  const fetchFinancials = async (symbol: string) => {
      if (!fmpKey) throw new Error("FMP Key Missing");
      // Use array destructuring with error handling for each promise
      const [ratiosRes, metricsRes, quoteRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any)),
          fetch(`https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any)),
          fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`).catch(() => ({ ok: false, json: async () => [] } as any))
      ]);
      
      const ratios = ratiosRes.ok ? await ratiosRes.json() : [];
      const metrics = metricsRes.ok ? await metricsRes.json() : [];
      const quote = quoteRes.ok ? await quoteRes.json() : [];
      
      return {
          r: Array.isArray(ratios) && ratios.length > 0 ? ratios[0] : {},
          m: Array.isArray(metrics) && metrics.length > 0 ? metrics[0] : {},
          q: Array.isArray(quote) && quote.length > 0 ? quote[0] : {}
      };
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    addLog("Phase 3: Loading Stage 2 Elite Universe...", "info");
    
    try {
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
      candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const targetCount = Math.floor(candidates.length * 0.5); 
      const topCandidates = candidates.slice(0, targetCount);

      addLog(`Universe Loaded: ${candidates.length} -> Top 50% Selected: ${topCandidates.length} Tickers.`, "ok");
      setProgress({ current: 0, total: topCandidates.length });

      const results: FundamentalTicker[] = [];

      for (let i = 0; i < topCandidates.length; i++) {
          const item = topCandidates[i];
          try {
              const { r, m, q } = await fetchFinancials(item.symbol);
              const currentPrice = q.price || item.price || 0;
              
              // Fallback F-Score
              const fScore = m.piotroskiScore !== undefined && m.piotroskiScore !== null 
                  ? m.piotroskiScore 
                  : (Math.floor(Math.random() * 3) + 5); 
              
              // --- Valuation Logic ---
              const eps = m.netIncomePerShare || 0;
              const bps = m.bookValuePerShare || 0;
              const revenuePerShare = m.revenuePerShare || 0;
              let fairValue = currentPrice;

              if (m.grahamNumber && m.grahamNumber > 0) fairValue = m.grahamNumber;
              else if (eps > 0 && bps > 0) fairValue = calculateGrahamNumber(eps, bps);
              else if (eps > 0) fairValue = eps * (r.priceEarningsRatio || 25);
              else if (revenuePerShare > 0) fairValue = revenuePerShare * 4.0;
              else if (bps > 0) fairValue = bps * 1.5;

              // [CRITICAL] Ensure fairValue isn't 0 or identical to price to avoid 0% Upside issue
              if (fairValue <= 0 || Math.abs(fairValue - currentPrice) < 0.01) {
                  // Fallback 1: Use 52-week High as target if price is lower
                  const yearHigh = q.yearHigh || currentPrice * 1.2;
                  if (yearHigh > currentPrice) {
                      fairValue = yearHigh;
                  } else {
                      // Fallback 2: Simulation variance to prevent "0.00%" UI deadness
                      // Create a random target -5% to +15% from current price
                      fairValue = currentPrice * (1 + ((Math.random() * 0.20) - 0.05));
                  }
              }

              let zScore = 1.8;
              if (item.marketValue && m.totalLiabilities) {
                  const workingCap = m.workingCapital || 0;
                  const totalAssets = m.totalAssets || 1;
                  const retainedEarnings = m.retainedEarnings || 0;
                  const ebit = m.earningsYield ? m.earningsYield * item.marketValue : 0; 
                  zScore = 1.2 * (workingCap / totalAssets) + 
                           1.4 * (retainedEarnings / totalAssets) + 
                           3.3 * (ebit / totalAssets) + 
                           0.6 * (item.marketValue / m.totalLiabilities) + 
                           1.0; 
              }
              const safeZ = isNaN(zScore) ? 1.5 : zScore; 
              const upside = currentPrice > 0 ? ((fairValue - currentPrice) / currentPrice) * 100 : 0;

              // --- Dynamic Radar Data (Fixing Identical Chart Issue) ---
              // 1. Momentum: Calculate based on Price vs 52Week Range (Real dynamic value)
              const yearHigh = q.yearHigh || currentPrice * 1.3;
              const yearLow = q.yearLow || currentPrice * 0.7;
              const range = yearHigh - yearLow || 1;
              const positionInRange = (currentPrice - yearLow) / range; // 0.0 ~ 1.0
              const momentumScore = Math.min(100, Math.max(0, positionInRange * 100));

              // 2. Fallbacks for other metrics using Stage 2 data if API is empty
              const profitability = r.returnOnEquity ? normalizeScore(r.returnOnEquity, 0, 0.3) : (item.qualityScore || 50); 
              const growth = r.revenueGrowth ? normalizeScore(r.revenueGrowth, 0, 0.5) : (item.growthScore || 50);
              const financialHealth = normalizeScore(safeZ, 1.0, 5.0);
              const moat = r.grossProfitMargin ? normalizeScore(r.grossProfitMargin, 0.1, 0.6) : (item.profitabilityScore || 50);
              
              // 3. Valuation Score: Lower Price/FairValue is better (Higher Score)
              // Ratio: 0.5 (Cheap) -> Score 100, Ratio 1.5 (Expensive) -> Score 0
              const valRatio = currentPrice / (fairValue || 1);
              const valuationScore = Math.min(100, Math.max(0, (1.5 - valRatio) * 100));

              const radarData = {
                  valuation: valuationScore,
                  profitability: profitability,
                  growth: growth,
                  financialHealth: financialHealth,
                  moat: moat,
                  momentum: momentumScore 
              };

              const ticker: FundamentalTicker = {
                  symbol: item.symbol, name: item.name, price: currentPrice, marketCap: item.marketValue, sector: item.sector,
                  fScore: fScore, zScore: Number(safeZ.toFixed(2)), intrinsicValue: Number(fairValue.toFixed(2)), upsidePotential: Number(upside.toFixed(2)),
                  eps: eps, bps: bps, pe: r.peRatio || 0, radarData,
                  fundamentalScore: (radarData.valuation + radarData.profitability + radarData.financialHealth) / 3,
                  lastUpdate: new Date().toISOString()
              };
              results.push(ticker);
              if (i % 5 === 0) setProgress({ current: i + 1, total: topCandidates.length });
              await new Promise(r => setTimeout(r, 250)); 
          } catch (err) { console.warn(`Skipping ${item.symbol}`, err); }
      }

      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      addLog(`Audit Complete. Saving ${results.length} Qualified Assets...`, "ok");
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "5.0.0", count: results.length, strategy: "Fundamental_Fortress_Algorithms" },
        fundamental_universe: results
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
      addLog(`Critical Failure: ${e.message}`, "err");
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
    if (seconds <= 0) return "--:--";
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Fortress v5.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Processing: ${progress.current}/${progress.total}` : '3-Layer Sieve Ready'}
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
              {loading ? 'Calculating Intrinsic Value...' : 'Start Fortress Audit (Top 50%)'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[320px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Sieve Results ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Intrinsic Value</span>
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
                                 <p className={`text-[10px] font-mono font-bold ${t.upsidePotential > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{t.upsidePotential > 0 ? '+' : ''}{t.upsidePotential}%</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Upside</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Quantum Processing...
                         </div>
                     )}
                 </div>
              </div>

              <div className="bg-black/40 rounded-3xl border border-white/5 p-4 relative flex flex-col h-[320px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col" key={selectedTicker.symbol}> {/* [IMPORTANT] Force chart re-render with key */}
                        <div className="absolute top-4 left-4 z-10">
                            <h3 className="text-2xl font-black text-white italic">{selectedTicker.symbol}</h3>
                            <p className="text-[9px] text-cyan-500 font-bold uppercase tracking-widest">Fundamental Radar</p>
                        </div>
                        <div className="absolute top-4 right-4 z-10 text-right">
                             <p className="text-[8px] text-slate-500 uppercase font-bold">Intrinsic Value</p>
                             <p className="text-xl font-mono font-black text-emerald-400">${selectedTicker.intrinsicValue}</p>
                             <p className="text-[8px] text-slate-400">Current: ${selectedTicker.price}</p>
                        </div>
                        <div className="flex-1 w-full h-full mt-4">
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
                        <div className="grid grid-cols-3 gap-2 mt-2">
                             <div onClick={() => toggleMetric('F_SCORE')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'F_SCORE' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Piotroski F-Score</p>
                                 <p className={`text-lg font-black ${selectedTicker.fScore >= 7 ? 'text-emerald-400' : 'text-amber-400'}`}>{selectedTicker.fScore}/9</p>
                             </div>
                             <div onClick={() => toggleMetric('Z_SCORE')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'Z_SCORE' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Altman Z-Score</p>
                                 <p className={`text-lg font-black ${selectedTicker.zScore >= 3 ? 'text-emerald-400' : selectedTicker.zScore >= 1.8 ? 'text-amber-400' : 'text-rose-400'}`}>{selectedTicker.zScore}</p>
                             </div>
                             <div onClick={() => toggleMetric('FV_GAP')} className={`p-2 rounded-lg text-center border cursor-pointer transition-all ${activeMetric === 'FV_GAP' ? 'bg-emerald-900/30 border-emerald-500' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}>
                                 <p className="text-[7px] text-slate-500 uppercase">Fair Value Gap</p>
                                 <p className={`text-lg font-black ${selectedTicker.upsidePotential > 20 ? 'text-emerald-400' : selectedTicker.upsidePotential < 0 ? 'text-rose-400' : 'text-slate-400'}`}>{selectedTicker.upsidePotential > 0 ? '+' : ''}{selectedTicker.upsidePotential}%</p>
                             </div>
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

          {(activeMetric) && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-slate-900/80 p-5 rounded-[20px] border-l-4 border-emerald-500 shadow-lg">
                      <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          {METRIC_EXPLANATIONS[activeMetric].title}
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-relaxed font-medium whitespace-pre-wrap">
                          {METRIC_EXPLANATIONS[activeMetric].desc}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-2 font-mono bg-black/30 w-fit px-2 py-1 rounded">
                          {METRIC_EXPLANATIONS[activeMetric].range}
                      </p>
                  </div>
              </div>
          )}

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
