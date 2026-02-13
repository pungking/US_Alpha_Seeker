
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

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
  fScore: number;         // Piotroski F-Score (0-9)
  zScore: number;         // Altman Z-Score
  
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
  roic: number; 
  
  // New Expert Metrics
  ruleOf40: number; // Growth + Margin
  grossMargin: number; // Pricing Power
  
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

  // Allow flexible indexing for raw data retention
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
        strategy: "15% 이상이면 자본 배분 효율이 뛰어난 경영진이 있다는 증거입니다. (Wide Moat)"
    },
    'RULE_40': {
        title: "Rule of 40 (성장+수익)",
        desc: "매출성장률(%) + 이익률(%)의 합계입니다. SaaS 및 성장주의 건전성을 판단하는 월가 표준 지표입니다.",
        strategy: "40을 넘으면 '초고속 성장'과 '수익성'의 균형이 완벽합니다. 주가 방어력이 매우 높습니다."
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
  const [logs, setLogs] = useState<string[]>(['> Financial_Engine v9.5: Moat_Detection Active.']);
  
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

  // --- DRIVE HELPERS ---
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
      
      const text = await res.text();
      // Sanitize Python-generated JSON quirks (NaN, Infinity, etc. are invalid in JSON)
      // Replaces : NaN, with : null, to ensure JSON.parse works
      const safeText = text.replace(/:\s*(?:NaN|Infinity|-Infinity)\b/g, ': null');
      
      try {
          return JSON.parse(safeText);
      } catch (e) {
          console.error("JSON Parse Error on File:", fileId, safeText.slice(0, 100));
          throw new Error("Invalid JSON Data (NaN/Infinity sanitization failed)");
      }
  };

  const getFormattedTimestamp = () => {
    const now = new Date();
    // Format: YYYY-MM-DD_HH-mm-ss
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const h = pad(now.getHours());
    const m = pad(now.getMinutes());
    const s = pad(now.getSeconds());
    return `${yyyy}-${mm}-${dd}_${h}-${m}-${s}`;
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

  // --- SCORING ALGORITHMS (FINANCIAL ENGINEERING) ---
  const performFinancialEngineering = (data: any) => {
      const price = Number(data.price) || 0;
      const roe = Number(data.roe || data.returnOnEquity || 0);
      const debtToEquity = Number(data.debtToEquity || data.debtEquityRatio || 50);
      const per = Number(data.pe || data.per || data.peRatio || 0);
      const pbr = Number(data.pbr || data.priceToBook || 0);
      const marketCap = Number(data.marketCap || data.marketValue || 0);
      const opMargin = Number(data.operatingMargins || data.operatingMargin || 0);
      const opCashflow = Number(data.operatingCashflow || 0);
      const revenueGrowth = Number(data.revenueGrowth || 0);
      
      const hist = data.history || {};
      const ebit = Number(hist["EBIT"] || hist["Operating Income"] || 0);
      const taxRate = Number(hist["Tax Rate For Calcs"] || 0.21); 
      const totalRevenue = Number(hist["Total Revenue"] || data.revenue || 0);
      const netIncome = Number(hist["Net Income"] || 0);
      const dilution = Number(hist["Diluted EPS"] || data.eps || 0);
      const grossProfit = Number(hist["Gross Profit"] || 0);

      // 1. ROIC (Updated)
      let roic = 0;
      if (ebit !== 0 && marketCap > 0) {
          const nopat = ebit * (1 - taxRate);
          const bookEquity = pbr > 0 ? marketCap / pbr : marketCap; 
          const totalDebt = bookEquity * (debtToEquity / 100);
          const investedCapital = bookEquity + totalDebt;
          
          if (investedCapital > 0) {
              roic = (nopat / investedCapital) * 100;
          }
      }
      if (roic === 0 && roe !== 0) {
          const leverageFactor = 1 + (debtToEquity / 100);
          roic = roe / leverageFactor; 
      }
      if (roic > 100) roic = 100; if (roic < -50) roic = -50;

      // 2. Expert Metrics: Rule of 40 & Gross Margin
      const profitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;
      const ruleOf40 = (revenueGrowth * 100) + opMargin * 100; // Using OpMargin is safer than Net Margin
      const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

      // 3. Z-Score Proxy
      const estimatedAssets = pbr > 0 ? (marketCap / pbr) * (1 + debtToEquity/100) : marketCap;
      const cFactor = estimatedAssets > 0 ? (ebit / estimatedAssets) : (roe / 100) * 0.5;
      const dFactor = debtToEquity > 0 ? (100 / debtToEquity) : 5;
      
      let zScore = 1.0 + (cFactor * 3.3) + (dFactor * 0.6);
      if (revenueGrowth > 0) zScore += 0.5;
      if (opCashflow > 0) zScore += 0.5;

      // 4. Intrinsic Value
      const growthRate = Math.max(5, Math.min(revenueGrowth * 100, 25));
      let intrinsicValue = 0;
      
      if (dilution > 0) {
          intrinsicValue = dilution * (8.5 + (1.5 * growthRate));
      } else {
          const fairPS = Math.max(1, opMargin * 100 * 0.2); 
          const salesPerShare = totalRevenue > 0 && marketCap > 0 ? (totalRevenue / marketCap) * price : 0;
          if (salesPerShare > 0) intrinsicValue = salesPerShare * fairPS;
          else intrinsicValue = price * 0.8; 
      }
      if (intrinsicValue > price * 4) intrinsicValue = price * 4;
      if (intrinsicValue < 0) intrinsicValue = 0;

      const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;

      // 5. F-Score Proxy
      let fScore = 4;
      if (roe > 0) fScore++;
      if (opCashflow > 0) fScore++;
      if (opCashflow > netIncome) fScore++;
      if (debtToEquity < 50) fScore++;
      if (revenueGrowth > 0) fScore++;
      if (opMargin > 0.05) fScore++;
      if (grossMargin > 20) fScore++; // Bonus for Pricing Power

      // 6. Earnings Quality
      const earningsQuality = netIncome !== 0 ? Math.abs(opCashflow / netIncome) : 1.0;

      // 7. Composite Score (Enhanced)
      const valScore = normalizeScore(fairValueGap, -20, 50); 
      const qualityScore = normalizeScore(roe, 5, 30);
      const safeScore = normalizeScore(zScore, 1.5, 5.0);
      const growthScore = normalizeScore(ruleOf40, 10, 60); // Rule of 40 driven
      const moatScore = normalizeScore(roic, 5, 20);

      const fundamentalScore = (valScore * 0.2) + (qualityScore * 0.2) + (safeScore * 0.2) + (growthScore * 0.2) + (moatScore * 0.2);

      return {
          fundamentalScore: Number(fundamentalScore.toFixed(1)),
          zScore: Number(zScore.toFixed(2)),
          fScore: fScore,
          roic: Number(roic.toFixed(2)),
          ruleOf40: Number(ruleOf40.toFixed(1)),
          grossMargin: Number(grossMargin.toFixed(1)),
          intrinsicValue: Number(intrinsicValue.toFixed(2)),
          upsidePotential: Number(fairValueGap.toFixed(2)),
          fairValueGap: Number(fairValueGap.toFixed(2)),
          earningsQuality: Number(earningsQuality.toFixed(2)),
          economicMoat: (roic > 15 && grossMargin > 40) ? 'Wide' : roic > 8 ? 'Narrow' : 'None',
          radarData: [
              { subject: 'Valuation', A: valScore, fullMark: 100 },
              { subject: 'Quality', A: qualityScore, fullMark: 100 },
              { subject: 'Health', A: safeScore, fullMark: 100 },
              { subject: 'Growth', A: growthScore, fullMark: 100 },
              { subject: 'Moat', A: moatScore, fullMark: 100 },
          ]
      };
  };

  // --- CORE ENGINE ---
  const executeFundamentalEngine = async () => {
      if (!accessToken || loading) return;
      setLoading(true);
      setProcessedData([]);
      startTimeRef.current = Date.now();

      try {
          addLog("Phase 1: Loading Stage 2 Elite Universe...", "info");
          const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (!listRes.files?.length) throw new Error("Stage 2 Data Missing. Please run Stage 2 first.");

          const stage2Content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          const candidates = stage2Content.elite_universe || [];
          addLog(`Target Acquired: ${candidates.length} Elite Assets.`, "ok");
          setProgress({ current: 0, total: candidates.length, file: 'Initializing...' });

          let systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) systemMapId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          if (!systemMapId) throw new Error("System_Identity_Maps folder not found.");

          const dailyFolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapId);
          const historyFolderId = await findFolder(accessToken, GOOGLE_DRIVE_TARGET.financialHistoryFolder, systemMapId);

          if (!dailyFolderId) throw new Error("Financial_Data_Daily folder not found.");

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
              
              const dailyFileName = `${letter}_stocks_daily.json`;
              const dailyFileId = await findFileId(accessToken, dailyFileName, dailyFolderId);
              let dailyDataMap = new Map();
              
              if (dailyFileId) {
                  const content = await downloadFile(accessToken, dailyFileId);
                  const items = Array.isArray(content) ? content : Object.values(content);
                  items.forEach((d: any) => {
                       const sym = d.symbol || d.basic?.symbol;
                       if (sym) dailyDataMap.set(sym, d.basic || d);
                  });
              }

              let historyDataMap = new Map();
              if (historyFolderId) {
                  const histFileName = `${letter}_stocks_history.json`;
                  const histFileId = await findFileId(accessToken, histFileName, historyFolderId);
                  if (histFileId) {
                      const content = await downloadFile(accessToken, histFileId);
                      if (Array.isArray(content)) {
                          content.forEach((d: any) => { if(d.symbol) historyDataMap.set(d.symbol, d.financials || []); });
                      } else {
                          Object.keys(content).forEach(sym => historyDataMap.set(sym, content[sym]));
                      }
                  }
              }

              const batch = groupedByLetter[letter];
              for (const stage2Item of batch) {
                  const dailyData = dailyDataMap.get(stage2Item.symbol) || {};
                  const historyData = historyDataMap.get(stage2Item.symbol) || [];
                  const latestHistory = Array.isArray(historyData) && historyData.length > 0 ? historyData[0] : {};

                  const merged = { ...stage2Item, ...dailyData, history: latestHistory };
                  const analysis = performFinancialEngineering(merged);
                  
                  const qualityScore = stage2Item.qualityScore || 50;
                  const fundamentalScore = analysis.fundamentalScore;
                  const compositeAlpha = (qualityScore * 0.4) + (fundamentalScore * 0.6);

                  results.push({
                      ...stage2Item, 
                      ...dailyData, 
                      ...analysis,
                      qualityScore,
                      fundamentalScore,
                      compositeAlpha: Number(compositeAlpha.toFixed(2)),
                      lastUpdate: new Date().toISOString(),
                      isDerived: true
                  });
              }
              
              setProgress(prev => ({ ...prev, current: results.length }));
          }

          results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
          setProcessedData(results);
          if (results.length > 0) handleTickerSelect(results[0]);

          addLog("Analysis Complete. Saving to Vault...", "info");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
          const resultFileName = `STAGE3_FUNDAMENTAL_FULL_${getFormattedTimestamp()}.json`;

          const payload = {
              manifest: { 
                  version: "9.5.0", 
                  count: results.length, 
                  timestamp: new Date().toISOString(),
                  engine: "System_Map_Fusion_Engine" 
              },
              fundamental_universe: results
          };

          await uploadFile(accessToken, saveFolderId, resultFileName, payload);
          addLog(`Vault Saved: ${resultFileName}`, "ok");
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
      } finally {
          setLoading(false);
          setProgress({ current: 0, total: 0, file: '' });
      }
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Financial_Engine v9.5</h2>
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
              {/* TICKER LIST (Updated Height & Removed Alpha) */}
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
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Engineering Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW (Updated Height & New Metrics) */}
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
                                    {selectedTicker.economicMoat === 'Wide' && <span className="text-[8px] font-black bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-0.5 rounded uppercase">Wide Moat</span>}
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

                        {/* Engineering Metrics Grid (Expert Additions) */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                 { id: 'Z_SCORE', label: 'Z-Score', val: selectedTicker.zScore.toFixed(2), good: selectedTicker.zScore > 2.99, bad: selectedTicker.zScore < 1.8 },
                                 { id: 'ROIC', label: 'ROIC (Est)', val: `${selectedTicker.roic ? selectedTicker.roic.toFixed(1) : '0'}%`, good: selectedTicker.roic > 15 },
                                 { id: 'RULE_40', label: 'Rule of 40', val: selectedTicker.ruleOf40.toFixed(1), good: selectedTicker.ruleOf40 > 40, bad: selectedTicker.ruleOf40 < 20 },
                                 { id: 'INTRINSIC', label: 'Margin', val: `${selectedTicker.grossMargin.toFixed(1)}%`, good: selectedTicker.grossMargin > 40 }
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden relative">
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
