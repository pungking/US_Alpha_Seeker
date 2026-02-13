
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Scores
  qualityScore: number;     // Stage 2 Score
  fundamentalScore: number; // Stage 3 Score (New)
  compositeAlpha: number;   // Accumulated Score
  
  // Advanced Scoring
  fScore: number;         // Piotroski F-Score Proxy (0-9)
  zScore: number;         // Altman Z-Score Proxy
  
  // Valuation & Metrics
  intrinsicValue: number;
  upsidePotential: number;
  fairValueGap: number;
  
  // Core Metrics (From System Map)
  roe: number;
  roa: number;
  per: number;
  pbr: number;
  debtToEquity: number;
  operatingMargins: number;
  revenueGrowth: number;
  operatingCashflow: number;
  
  // Forensic / Quality
  earningsQuality: number;
  economicMoat: 'Wide' | 'Narrow' | 'None';
  
  // Visualization
  radarData: {
      subject: string;
      A: number;
      fullMark: number;
  }[];
  
  // Meta
  lastUpdate: string;
  source: string; 
  isDerived: boolean;

  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// Insight Helpers
const METRIC_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'INTRINSIC': {
        title: "Intrinsic Value (RIM/BPS Model)",
        desc: "시스템 맵의 데이터(BPS, EPS, ROE)를 기반으로 산출된 내재가치입니다. 시장 가격과의 괴리율을 분석합니다.",
        strategy: "현재 주가가 이 가치보다 30% 이상 낮다면 '강력한 안전마진'이 확보된 상태입니다."
    },
    'Z_SCORE': {
        title: "Altman Z-Score (파산 위험)",
        desc: "부채비율, 유동성, 이익잉여금 대체 지표를 사용하여 기업의 재무적 파산 가능성을 진단합니다.",
        strategy: "Z-Score가 3.0 이상인 기업은 재무적으로 '철옹성'입니다. 하락장에서도 버틸 체력이 있습니다."
    },
    'ROIC': {
        title: "ROIC (투하자본이익률)",
        desc: "영업에 실제 투입된 자본 대비 이익 효율성을 나타냅니다. ROE와 부채비율을 통해 역산된 프록시를 사용합니다.",
        strategy: "15% 이상이면 자본 배분 효율이 뛰어난 경영진이 있다는 증거입니다."
    },
    'QUALITY': {
        title: "Earnings Quality (이익의 질)",
        desc: "영업활동현금흐름(OCF)과 순이익의 비율입니다. 장부상 이익만 내고 현금이 없는 '흑자 부도' 위험을 감지합니다.",
        strategy: "비율 > 1.0 (현금흐름 > 순이익)인 기업은 이익의 질이 매우 높습니다."
    }
};

const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s.includes('health') || s.includes('bio')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
    if (s.includes('finance')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null); 
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Financial_Engine v9.0: System_Map Link Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
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
        setTimeStats({ elapsed: elapsedSec, eta: 0 });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Initiating System_Map Data Fusion...", "signal");
        executeFundamentalEngine();
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

  // --- DRIVE HELPERS (Reused for System Map Access) ---
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

  // --- CORE LOGIC: BATCH PROCESSING ---
  const executeFundamentalEngine = async () => {
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);
      startTimeRef.current = Date.now();

      try {
          // 1. Load Stage 2 Data (The Targets)
          addLog("Phase 1: Loading Stage 2 Elite Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) {
              throw new Error("Stage 2 Data Missing. Please run Stage 2 first.");
          }

          const stage2Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage2Content.elite_universe || [];
          addLog(`Target Acquired: ${candidates.length} Elite Assets.`, "ok");
          setProgress({ current: 0, total: candidates.length, file: 'Initializing...' });

          // 2. Locate System Map & Data Folders
          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          if (!systemMapId) throw new Error("System_Identity_Maps folder not found.");

          const dailyFolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapId);
          if (!dailyFolderId) throw new Error("Financial_Data_Daily folder not found.");

          // 3. Batch Process by Alphabet to Minimize API Calls
          const groupedByLetter: Record<string, any[]> = {};
          candidates.forEach((c: any) => {
              const letter = c.symbol.charAt(0).toUpperCase();
              if (!groupedByLetter[letter]) groupedByLetter[letter] = [];
              groupedByLetter[letter].push(c);
          });

          const results: FundamentalTicker[] = [];
          const sortedLetters = Object.keys(groupedByLetter).sort();

          for (const letter of sortedLetters) {
              setProgress(prev => ({ ...prev, file: `Loading Cylinder ${letter}...` }));
              
              // Load the Daily Data File for this letter
              const fileName = `${letter}_stocks_daily.json`;
              const fileId = await findFileId(accessToken, fileName, dailyFolderId);
              
              let dailyDataMap = new Map();
              if (fileId) {
                  const content = await downloadFile(accessToken, fileId);
                  const items = Array.isArray(content) ? content : Object.values(content);
                  items.forEach((d: any) => {
                       // Normalize keys
                       const sym = d.symbol || d.basic?.symbol;
                       if (sym) dailyDataMap.set(sym, d.basic || d);
                  });
              } else {
                  addLog(`Warning: Map ${fileName} not found. Using Stage 2 fallbacks.`, "warn");
              }

              // Process tickers for this letter
              const batch = groupedByLetter[letter];
              for (const stage2Item of batch) {
                  const systemData = dailyDataMap.get(stage2Item.symbol) || {};
                  
                  // Merge Data: Priority to System Map, Fallback to Stage 2
                  const merged = { ...stage2Item, ...systemData };
                  
                  // --- FINANCIAL ENGINEERING SCORING ---
                  const analysis = performFinancialEngineering(merged);
                  
                  // Accumulate Scores
                  const qualityScore = stage2Item.qualityScore || 50;
                  const fundamentalScore = analysis.fundamentalScore;
                  const compositeAlpha = (qualityScore * 0.4) + (fundamentalScore * 0.6);

                  results.push({
                      ...stage2Item, // Base info
                      ...analysis,   // New calculated metrics
                      qualityScore,
                      fundamentalScore,
                      compositeAlpha: Number(compositeAlpha.toFixed(2)),
                      lastUpdate: new Date().toISOString()
                  });
              }
              
              setProgress(prev => ({ ...prev, current: results.length }));
          }

          // 4. Sort & Save
          results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
          setProcessedData(results);
          if (results.length > 0) handleTickerSelect(results[0]);

          addLog("Analysis Complete. Saving to Vault...", "info");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
          
          // KST Timestamp Format
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const resultFileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;

          const payload = {
              manifest: { 
                  version: "9.0.0", 
                  count: results.length, 
                  timestamp: new Date().toISOString(),
                  engine: "System_Map_Fusion_Engine" 
              },
              fundamental_universe: results
          };

          const meta = { name: resultFileName, parents: [saveFolderId], mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
          });

          addLog(`Vault Saved: ${resultFileName}`, "ok");
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, file: '' });
      }
  };

  // --- SCORING ALGORITHMS ---
  const performFinancialEngineering = (data: any) => {
      // Extract Metrics (Handle various naming conventions)
      const price = Number(data.price) || 0;
      const roe = Number(data.roe || data.returnOnEquity || 0);
      const debtToEquity = Number(data.debtToEquity || data.debtEquityRatio || 50);
      const per = Number(data.pe || data.per || data.peRatio || 0);
      const pbr = Number(data.pbr || data.priceToBook || 0);
      const eps = Number(data.eps || 0);
      const marketCap = Number(data.marketCap || data.marketValue || 0);
      const opMargin = Number(data.operatingMargins || data.operatingMargin || 0);
      const opCashflow = Number(data.operatingCashflow || 0);
      const revenueGrowth = Number(data.revenueGrowth || 0);

      // 1. Z-Score Proxy (Modified for Data Availability)
      // Standard Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
      // We use proxies:
      // A (Liquidity) -> Inverse of Debt? No, assume neutral if missing.
      // D (Levearge) -> MarketCap / Debt (Estimated from D/E)
      const estimatedEquity = marketCap / (pbr || 3); // Estimate Book Equity
      const estimatedDebt = estimatedEquity * (debtToEquity / 100);
      const leverageScore = estimatedDebt > 0 ? (marketCap / estimatedDebt) : 5; // Higher is safer
      
      let zScore = 1.0 + (roe / 20) + (leverageScore * 0.2); // Simplified Proxy
      if (debtToEquity < 50) zScore += 1.5;
      if (opMargin > 0.15) zScore += 1.0;
      if (marketCap > 10000000000) zScore += 0.5; // Large cap bonus
      
      // 2. Intrinsic Value (Modified Graham)
      // V = EPS * (8.5 + 2g)
      const growthRate = Math.max(0, Math.min(revenueGrowth * 100, 20)); // Cap at 20%
      let intrinsicValue = 0;
      if (eps > 0) {
          intrinsicValue = eps * (8.5 + (2 * growthRate));
      } else {
          // Loss making? Use Price/Sales proxy
          const ps = data.psr || 3;
          intrinsicValue = price * (3 / ps); // If PS is low, value is high
      }
      // Safety clamp
      if (intrinsicValue > price * 3) intrinsicValue = price * 3;
      if (intrinsicValue < 0) intrinsicValue = 0;

      const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;

      // 3. F-Score Proxy (0-9)
      let fScore = 5; // Base
      if (roe > 0) fScore++;
      if (opCashflow > 0) fScore++;
      if (debtToEquity < 80) fScore++;
      if (opMargin > 0.1) fScore++;

      // 4. Earnings Quality
      // OCF / NetIncome Proxy. NetIncome approx MarketCap / PE
      const netIncomeApprox = per > 0 ? (marketCap / per) : 0;
      const earningsQuality = (netIncomeApprox > 0 && opCashflow !== 0) 
          ? Math.abs(opCashflow / netIncomeApprox) 
          : 1.0;

      // 5. Composite Score Calculation
      const valScore = normalizeScore(fairValueGap, -20, 50); 
      const qualityScore = normalizeScore(roe, 5, 30);
      const safeScore = normalizeScore(zScore, 1.5, 5.0);
      const growthScore = normalizeScore(revenueGrowth * 100, 0, 30);
      const moatScore = normalizeScore(opMargin * 100, 10, 50);

      const fundamentalScore = (valScore * 0.25) + (qualityScore * 0.25) + (safeScore * 0.2) + (growthScore * 0.2) + (moatScore * 0.1);

      return {
          fundamentalScore: Number(fundamentalScore.toFixed(1)),
          zScore: Number(zScore.toFixed(2)),
          fScore: fScore,
          intrinsicValue: Number(intrinsicValue.toFixed(2)),
          upsidePotential: Number(fairValueGap.toFixed(2)),
          fairValueGap: Number(fairValueGap.toFixed(2)),
          earningsQuality: Number(earningsQuality.toFixed(2)),
          economicMoat: roe > 15 && opMargin > 0.2 ? 'Wide' : roe > 10 ? 'Narrow' : 'None',
          radarData: [
              { subject: 'Valuation', A: valScore, fullMark: 100 },
              { subject: 'Quality', A: qualityScore, fullMark: 100 },
              { subject: 'Health', A: safeScore, fullMark: 100 },
              { subject: 'Growth', A: growthScore, fullMark: 100 },
              { subject: 'Moat', A: moatScore, fullMark: 100 },
          ],
          // Pass through metrics for visualization
          roe, roa: Number(data.roa || 0), per, pbr, debtToEquity, 
          operatingMargins: opMargin, revenueGrowth, operatingCashflow: opCashflow
      };
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Financial_Engine v9.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Engineering: ${progress.current}/${progress.total} (${progress.file})` : 'System Map Fusion Active'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span></span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeFundamentalEngine} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-cyan-800 text-cyan-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Fusing System Data...' : 'Execute Financial Protocol'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* TICKER LIST */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Calculated Targets ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Composite Alpha</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <div className="flex items-center gap-1.5">
                                         <p className={`text-xs font-black text-white`}>{t.symbol}</p>
                                     </div>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.compositeAlpha.toFixed(1)}</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Alpha</p>
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
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1 group-hover:text-emerald-400 transition-colors">Intrinsic Value Gap</p>
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
                                 { id: 'ROIC', label: 'ROIC (Est)', val: `${selectedTicker.roic ? selectedTicker.roic.toFixed(1) : '0'}%`, good: selectedTicker.roic > 15 },
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
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select an Asset to Audit</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-full min-h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden relative">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-4 rounded-[24px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-3 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 transition-all duration-300 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400 bg-amber-500/5' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
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
