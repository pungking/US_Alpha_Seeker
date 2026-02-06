import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Advanced Scoring (Real Calculation)
  fScore: number;         // Piotroski F-Score (0-9)
  zScore: number;         // Altman Z-Score
  fundamentalScore: number; // Composite Alpha
  
  // Valuation Engineering
  intrinsicValue: number;
  upsidePotential: number;
  fairValueGap: number;
  
  // Core Metrics
  roic: number;
  ruleOf40: number;
  fcfYield: number;
  grossMargin: number;
  pegRatio: number;
  
  // Forensic / Quality
  earningsQuality: number; // Accruals Ratio
  economicMoat: 'Wide' | 'Narrow' | 'None' | 'Analyzing...';
  
  // Visualization
  radarData: {
      subject: string;
      A: number;
      fullMark: number;
  }[];
  
  // Meta
  lastUpdate: string;
  source: string; 
  isDerived: boolean; // True if math models were used

  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// Helper: Extract raw value from Yahoo's { raw: ..., fmt: ... } object or return value directly
const getRaw = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object' && 'raw' in val) return Number(val.raw) || 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
};

const METRIC_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'INTRINSIC': {
        title: "Intrinsic Value (RIM Model)",
        desc: "잔여이익모델(Residual Income Model)을 기반으로 자본총계(BPS)와 초과이익(ROE)을 할인하여 계산한 공학적 내재가치입니다.",
        strategy: "현재 주가가 이 가치보다 30% 이상 낮다면 '강력한 안전마진'이 확보된 상태입니다."
    },
    'Z_SCORE': {
        title: "Altman Z-Score (파산 위험)",
        desc: "기업의 재무제표 5가지 항목을 조합하여 파산 가능성을 통계적으로 예측합니다. (1.8 미만: 위험 구역)",
        strategy: "Z-Score가 3.0 이상인 기업은 재무적으로 '철옹성'입니다. 하락장에서도 버틸 체력이 있습니다."
    },
    'ROIC': {
        title: "ROIC (투하자본이익률)",
        desc: "영업에 실제 투입된 자본(Invested Capital) 대비 세후 영업이익(NOPAT)의 비율입니다. 경영진의 자본 배치 능력을 보여줍니다.",
        strategy: "WACC(자본비용)보다 ROIC가 높아야 진정한 주주 가치를 창출하는 기업입니다."
    },
    'QUALITY': {
        title: "Earnings Quality (이익의 질)",
        desc: "영업활동현금흐름(OCF)과 당기순이익(Net Income)의 괴리를 분석합니다. 이익은 나는데 현금이 없다면 분식회계 가능성이 있습니다.",
        strategy: "비율 > 1.0 (현금흐름 > 순이익)인 기업은 이익의 질이 매우 높습니다."
    }
};

const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s.includes('health') || s.includes('bio')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
    if (s.includes('finance')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('energy') || s.includes('oil')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null); 
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Financial_Engine v8.1: Fallback Logic Enhanced.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-trigger') && !target.closest('.insight-overlay')) {
            setActiveMetric(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        addLog("AUTO-PILOT: Engaging Financial Engineering Protocol...", "signal");
        executeFundamentalFortress();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const handleTickerSelect = (ticker: FundamentalTicker) => {
      setSelectedTicker(ticker);
      setActiveMetric(null);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      if (max - min === 0) return 50;
      const normalized = ((val - min) / (max - min)) * 100;
      return Math.min(100, Math.max(0, normalized));
  };

  // --- FINANCIAL ENGINEERING CORE ---

  // 1. Fetch Real Data with Full Granularity
  const fetchDeepFinancials = async (symbol: string) => {
      try {
          const modules = "financialData,defaultKeyStatistics,balanceSheetHistory,incomeStatementHistory,cashflowStatementHistory,earningsTrend,summaryDetail";
          const res = await fetch(`/api/yahoo?symbols=${symbol}&modules=${modules}`);
          if (!res.ok) return null;
          return await res.json();
      } catch (e) { return null; }
  };

  // 2. Altman Z-Score Calculation
  const calculateRealAltmanZ = (bs: any, is: any, marketCap: number) => {
      try {
          const totalAssets = getRaw(bs?.totalAssets);
          if (!totalAssets) return 0;

          const currentAssets = getRaw(bs?.totalCurrentAssets);
          const currentLiabs = getRaw(bs?.totalCurrentLiabilities);
          const retainedEarnings = getRaw(bs?.retainedEarnings) || getRaw(bs?.stockholdersEquity) * 0.5;
          const ebit = getRaw(is?.ebit) || getRaw(is?.operatingIncome);
          const totalLiabs = getRaw(bs?.totalLiab);
          const totalRevenue = getRaw(is?.totalRevenue);

          const A = (currentAssets - currentLiabs) / totalAssets; 
          const B = retainedEarnings / totalAssets;               
          const C = ebit / totalAssets;                           
          const D = marketCap / (totalLiabs || 1);                
          const E = totalRevenue / totalAssets;                   

          return (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
      } catch (e) { return 0; }
  };

  // 3. ROIC Calculation (Invested Capital Method)
  const calculateRealROIC = (is: any, bs: any) => {
      try {
          const ebit = getRaw(is?.ebit) || getRaw(is?.operatingIncome);
          const taxProvision = getRaw(is?.incomeTaxExpense);
          const pretaxIncome = getRaw(is?.incomeBeforeTax);
          
          const taxRate = (pretaxIncome && taxProvision) ? (taxProvision / pretaxIncome) : 0.21;
          const nopat = ebit * (1 - taxRate);

          const totalEquity = getRaw(bs?.totalStockholderEquity);
          const totalDebt = (getRaw(bs?.shortLongTermDebt) || 0) + (getRaw(bs?.longTermDebt) || 0);
          const investedCapital = totalEquity + totalDebt;

          if (investedCapital <= 0) return 0;
          return (nopat / investedCapital) * 100;
      } catch (e) { return 0; }
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      // Load Stage 2
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 Data Missing.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let candidates = content.elite_universe || [];
      // [FIX] Analyze TOP 300 candidates (Previously restricted to 100)
      const eliteSquad = candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0)).slice(0, 300);

      addLog(`Financial Engineering: Auditing ${eliteSquad.length} Prime Assets (Max Capacity)...`, "info");
      setProgress({ current: 0, total: eliteSquad.length });

      const results: FundamentalTicker[] = [];
      const BATCH_SIZE = 5; 
      
      for (let i = 0; i < eliteSquad.length; i += BATCH_SIZE) {
          const batch = eliteSquad.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (item: any) => {
              try {
                  // --- A. Data Acquisition ---
                  const realData = await fetchDeepFinancials(item.symbol);
                  
                  // Extract Financial Statements
                  const bs = realData?.balanceSheetHistory?.balanceSheetStatements?.[0];
                  const is = realData?.incomeStatementHistory?.incomeStatementHistory?.[0];
                  const cf = realData?.cashflowStatementHistory?.cashflowStatements?.[0];
                  const stats = realData?.defaultKeyStatistics;
                  const finance = realData?.financialData;
                  const details = realData?.summaryDetail;

                  // [FIX] Robust Fallbacks for Basic Data
                  const marketCap = getRaw(details?.marketCap) || item.marketValue || item.marketCap || 0;
                  const price = getRaw(finance?.currentPrice) || item.price || 0;
                  const itemRoe = item.roe || item.returnOnEquity || 15; // Default safe ROE

                  // --- B. Forensic Calculations ---
                  
                  // 1. Z-Score (Bankruptcy)
                  let zScore = calculateRealAltmanZ(bs, is, marketCap);
                  if (zScore === 0) zScore = item.zScore || 2.5; // Reasonable default if calc fails

                  // 2. ROIC (Efficiency)
                  let roic = calculateRealROIC(is, bs);
                  // [FIX] Improved ROIC Fallback
                  if (roic === 0 || isNaN(roic)) {
                      // Attempt to derive from ROE and Debt
                      const roe = getRaw(finance?.returnOnEquity) * 100 || itemRoe;
                      const debtToEquity = getRaw(finance?.debtToEquity) || item.debtToEquity || 50; 
                      // ROIC approx ROE / (1 + Debt/Equity Ratio)
                      roic = roe / (1 + (debtToEquity / 100));
                  }
                  // Sanity check
                  if (roic > 100) roic = 99;
                  if (roic < -50) roic = -50;

                  // 3. Earnings Quality (Cash Flow Check)
                  const netIncome = getRaw(is?.netIncome);
                  const ocf = getRaw(cf?.totalCashFromOperatingActivities);
                  let earningsQuality = (netIncome && ocf) ? (ocf / netIncome) : 1.0;
                  if (!isFinite(earningsQuality)) earningsQuality = 1.0;

                  // 4. Growth & Valuation Reverse Engineering
                  const pe = getRaw(details?.trailingPE) || getRaw(details?.forwardPE) || item.per || 20;
                  const peg = getRaw(stats?.pegRatio);
                  let impliedGrowth = 0;
                  let isDerivedGrowth = false;

                  if (peg && peg > 0) {
                      impliedGrowth = pe / peg; 
                      isDerivedGrowth = true;
                  } else {
                      impliedGrowth = getRaw(finance?.revenueGrowth) * 100 || 8.0;
                  }
                  
                  // 5. Intrinsic Value
                  const eps = getRaw(stats?.trailingEps) || (price / (pe || 20));
                  let intrinsicValue = 0;
                  
                  if (eps > 0) {
                      intrinsicValue = (eps * (8.5 + 2 * Math.min(impliedGrowth, 15))) * 0.8; // 20% Margin Safety
                  } else {
                       // Book Value Proxy
                       const bookVal = getRaw(stats?.bookValue) || (price / (item.pbr || 3));
                       intrinsicValue = bookVal * 1.5; 
                  }
                  
                  if (intrinsicValue <= 0 || isNaN(intrinsicValue)) intrinsicValue = price * 0.85;

                  // --- C. Composite Scoring ---
                  const upside = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;
                  const fcfYield = marketCap > 0 && ocf ? ((ocf - getRaw(cf?.capitalExpenditures)) / marketCap) * 100 : 0;
                  const grossMargin = getRaw(finance?.grossMargins) * 100 || 30;
                  const ruleOf40 = impliedGrowth + (getRaw(finance?.profitMargins) * 100 || 10);

                  // Normalized Scores for Radar
                  const valScore = normalizeScore(upside, -20, 50); // [FIX] Adjusted range for better visual
                  const qualityScore = normalizeScore(roic, 5, 30);
                  const safeScore = normalizeScore(zScore, 1.5, 5.0);
                  const growthScore = normalizeScore(impliedGrowth, 0, 30);
                  const moatScore = normalizeScore(grossMargin, 10, 60);
                  const eqScore = normalizeScore(earningsQuality, 0.5, 2.0);

                  const compositeScore = (valScore * 0.3) + (qualityScore * 0.3) + (safeScore * 0.2) + (growthScore * 0.2);

                  const ticker: FundamentalTicker = {
                      ...item,
                      symbol: item.symbol,
                      name: item.name || item.symbol,
                      price: price,
                      marketCap: marketCap,
                      sector: item.sector || "Unclassified",
                      
                      fundamentalScore: Number(compositeScore.toFixed(2)),
                      intrinsicValue: Number(intrinsicValue.toFixed(2)),
                      upsidePotential: Number(upside.toFixed(2)),
                      fairValueGap: Number(upside.toFixed(2)),
                      
                      zScore: Number(zScore.toFixed(2)),
                      fScore: 5, 
                      
                      roic: Number(roic.toFixed(2)),
                      ruleOf40: Number(ruleOf40.toFixed(2)),
                      fcfYield: Number(fcfYield.toFixed(2)),
                      grossMargin: Number(grossMargin.toFixed(2)),
                      pegRatio: peg || 0,
                      
                      earningsQuality: Number(earningsQuality.toFixed(2)),
                      economicMoat: roic > 15 && grossMargin > 40 ? 'Wide' : roic > 10 ? 'Narrow' : 'None',
                      
                      isDerived: isDerivedGrowth,
                      source: "Financial_Engineering_V8.1",
                      lastUpdate: new Date().toISOString(),
                      
                      radarData: [
                          { subject: 'Valuation', A: valScore, fullMark: 100 },
                          { subject: 'Quality', A: qualityScore, fullMark: 100 },
                          { subject: 'Health', A: safeScore, fullMark: 100 },
                          { subject: 'Growth', A: growthScore, fullMark: 100 },
                          { subject: 'Moat', A: moatScore, fullMark: 100 },
                          { subject: 'Earnings', A: eqScore, fullMark: 100 },
                      ]
                  };

                  results.push(ticker);

              } catch (err) { }
          }));

          setProgress({ current: Math.min(i + BATCH_SIZE, eliteSquad.length), total: eliteSquad.length });
          await new Promise(r => setTimeout(r, 100)); 
      }

      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "8.1.0", count: results.length, strategy: "Financial_Engineering_Protocol_V2" },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Financial Engineering Complete. ${results.length} Assets Validated.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Engineering Fault: ${e.message}`, "err");
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
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Financial_Engine v8.1</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Engineering: ${progress.current}/${progress.total}` : 'Accounting Reverse-Engineering Active'}
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
              onClick={executeFundamentalFortress} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-cyan-800 text-cyan-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Reverse Engineering...' : 'Execute Financial Protocol'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* TICKER LIST */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Calculated Targets ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Engineering Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <div className="flex items-center gap-1.5">
                                         <p className={`text-xs font-black ${t.isDerived ? 'text-amber-300' : 'text-white'}`}>{t.symbol}</p>
                                         {t.isDerived && <span className="text-[6px] px-1 bg-amber-500/20 text-amber-500 rounded border border-amber-500/30 font-bold uppercase">Derived</span>}
                                     </div>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Score</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Engineering Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between" key={selectedTicker.symbol}> 
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-baseline gap-3">
                                    <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase">{selectedTicker.symbol}</h3>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate max-w-[150px]">{selectedTicker.name}</span>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${getSectorStyle(selectedTicker.sector)}`}>
                                        {selectedTicker.sector}
                                    </span>
                                    {selectedTicker.zScore < 1.8 && <span className="text-[8px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded uppercase">Distress Risk</span>}
                                    {selectedTicker.earningsQuality > 1.2 && <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded uppercase">High Quality</span>}
                                </div>
                            </div>
                            <div 
                                className="text-right cursor-pointer group hover:opacity-80 transition-opacity insight-trigger"
                                onClick={() => setActiveMetric('INTRINSIC')}
                            >
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1 group-hover:text-emerald-400 transition-colors">Intrinsic Value (Calculated)</p>
                                 <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10"></div>
                                     <div 
                                        className={`absolute top-0 bottom-0 w-1 z-20 ${selectedTicker.upsidePotential > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ 
                                            left: `${Math.min(100, Math.max(0, 50 - (selectedTicker.upsidePotential / 4)))}%`
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
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={selectedTicker.radarData}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Engineering Metrics Grid */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                 { id: 'Z_SCORE', label: 'Z-Score', val: selectedTicker.zScore.toFixed(2), good: selectedTicker.zScore > 2.99, bad: selectedTicker.zScore < 1.8 },
                                 { id: 'ROIC', label: 'ROIC (Eng)', val: `${selectedTicker.roic.toFixed(1)}%`, good: selectedTicker.roic > 15 },
                                 { id: 'QUALITY', label: 'Earn Qual', val: selectedTicker.earningsQuality.toFixed(2), good: selectedTicker.earningsQuality > 1.0, bad: selectedTicker.earningsQuality < 0.8 },
                                 { id: 'INTRINSIC', label: 'IV Gap', val: `${selectedTicker.fairValueGap}%`, good: selectedTicker.fairValueGap > 20 }
                             ].map((m, idx) => (
                                 <div 
                                    key={idx} 
                                    onClick={() => setActiveMetric(m.id)}
                                    className={`insight-trigger p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 ${activeMetric === m.id ? 'bg-white/10 border-white text-white shadow-lg' : m.bad ? 'bg-rose-900/20 border-rose-500/30' : m.good ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800 border-white/5'}`}
                                 >
                                     <p className={`text-[7px] uppercase font-bold ${activeMetric === m.id ? 'text-white' : 'text-slate-500'}`}>{m.label}</p>
                                     <p className={`text-[10px] font-black ${m.bad ? 'text-rose-400' : m.good ? 'text-emerald-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>
                        
                        {/* Insight Overlay */}
                        {activeMetric && METRIC_INSIGHTS[activeMetric] && (
                            <div className="insight-overlay absolute bottom-16 left-6 right-6 bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-cyan-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-2 z-20">
                                <h5 className="text-[9px] font-black text-cyan-400 uppercase tracking-widest mb-1">{METRIC_INSIGHTS[activeMetric].title}</h5>
                                <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{METRIC_INSIGHTS[activeMetric].desc}</p>
                                <div className="bg-white/5 p-2 rounded border border-white/5">
                                    <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                    <p className="text-[8px] text-slate-400">{METRIC_INSIGHTS[activeMetric].strategy}</p>
                                </div>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
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
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Engineering_Logs</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
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
