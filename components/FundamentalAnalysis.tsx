
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  
  qualityScore: number;
  fundamentalScore: number;
  compositeAlpha: number;
  
  intrinsicValue: number;
  fairValueGap: number;
  upsidePotential: number;
  
  roic: number;
  ruleOf40: number;
  grossMargin: number;
  fScore: number;
  zScore: number;
  earningsQuality: number;
  
  economicMoat: '광폭 (Wide)' | '협소 (Narrow)' | '없음 (None)';
  dataConfidence: number;
  
  radarData: { subject: string; A: number; fullMark: number }[];
  
  sector: string;
  lastUpdate: string;
  isDerived: boolean;
  
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// --- HELPER FUNCTIONS ---

const normalizeScore = (val: number, min: number, max: number) => {
    if (val === undefined || val === null || isNaN(val)) return 0;
    if (val <= min) return 0;
    if (val >= max) return 100;
    return ((val - min) / (max - min)) * 100;
};

const safeNum = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    const n = parseFloat(String(val).replace(/,/g, '').replace(/%/g, ''));
    return Number.isFinite(n) ? n : 0;
};

// [FIX] Auto-scaler for ratios
const toPercent = (val: number) => {
    if (val !== 0 && Math.abs(val) <= 5.0) {
        return val * 100;
    }
    return val;
};

// [ENGINE v4.2] Advanced Valuation & Moat Calculator
const performFinancialEngineering = (data: any) => {
    // 1. Extract Metrics
    const price = safeNum(data.price);
    const eps = safeNum(data.eps || data.earningsPerShare);
    const bookValue = safeNum(data.bookValuePerShare || (data.totalAssets - data.totalLiabilities) / (data.sharesOutstanding || 1));
    const sales = safeNum(data.revenue || data.totalRevenue);
    const netIncome = safeNum(data.netIncome || data.netIncomeCommonStockholders);
    const opCashflow = safeNum(data.operatingCashflow || data.operatingCashFlow);
    const totalDebt = safeNum(data.totalDebt || data.shortTermDebt + data.longTermDebt);
    const totalEquity = safeNum(data.totalEquity || data.totalStockholdersEquity);
    const totalAssets = safeNum(data.totalAssets);
    
    // Growth Rates & Margins
    const revenueGrowth = safeNum(data.revenueGrowth || 10); 
    const profitMargin = sales > 0 ? (netIncome / sales) * 100 : 0;
    
    const rawGrossMargin = safeNum(data.grossMargin || data.grossProfitMargin || (sales > 0 ? (data.grossProfit / sales) : 0));
    const grossMargin = toPercent(rawGrossMargin);
    
    const rawRoe = safeNum(data.roe || data.returnOnEquity || 0);
    const roe = toPercent(rawRoe);

    // 2. Intrinsic Value (Benjamin Graham Approximation)
    // V = EPS * (8.5 + 2g) * (4.4 / Y)  -- Assuming Y (Bond Yield) ~ 4.4 for neutralization
    const g = Math.min(revenueGrowth, 20); // Cap growth at 20% for safety
    let intrinsicValue = eps > 0 ? eps * (8.5 + 2 * g) : bookValue * 1.5; // Fallback to Book Value if EPS negative
    
    // Safety Margin Adjustment
    intrinsicValue = intrinsicValue * 0.8; // 20% Margin of Safety
    
    if (intrinsicValue <= 0) intrinsicValue = price * 0.8; // Failsafe

    const fairValueGap = price > 0 ? ((intrinsicValue - price) / price) * 100 : 0;
    
    // 3. Efficiency Metrics
    const investedCapital = totalEquity + totalDebt;
    const nopat = netIncome; // Simplified
    let roic = 0;
    if (investedCapital > 0) {
        roic = (nopat / investedCapital) * 100;
    } else {
        roic = roe * 0.8; // Proxy if invested capital missing
    }
    
    const ruleOf40 = revenueGrowth + (opCashflow > 0 && sales > 0 ? (opCashflow / sales) * 100 : profitMargin);
    
    // 4. Financial Health (Altman Z-Score)
    // Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E 
    const currentAssets = safeNum(data.totalCurrentAssets || data.currentAssets);
    const currentLiabilities = safeNum(data.totalCurrentLiabilities || data.currentLiabilities);
    const workingCapital = currentAssets - currentLiabilities;
    const retainedEarnings = safeNum(data.retainedEarnings || data.accumulatedRetainedEarningsDeficit);
    const ebit = safeNum(data.operatingIncome || data.ebit);
    const marketCap = safeNum(data.marketCap || data.marketValue);
    
    let zScore = 0;
    if (totalAssets > 0) {
        const A = workingCapital / totalAssets;
        const B = retainedEarnings / totalAssets;
        const C = ebit / totalAssets;
        const D = marketCap / (safeNum(data.totalLiabilities) || (totalAssets * 0.5));
        const E = sales / totalAssets;

        zScore = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
    } else {
        // Fallback Proxy if BS data missing
        zScore = (roe > 10 && totalDebt < totalEquity) ? 3.5 : 1.5;
    }

    // Piotroski F-Score (0-9) - Heuristic Estimation based on available data
    let fScore = 5; // Start at average
    if (netIncome > 0) fScore++;
    if (opCashflow > 0) fScore++;
    if (opCashflow > netIncome) fScore++;
    if (roic > (data.roic_prev || 0)) fScore++;
    if (totalDebt < (data.totalDebt_prev || totalDebt * 1.1)) fScore++;
    if (grossMargin > (data.grossMargin_prev || grossMargin * 0.9)) fScore++;
    
    // Missing Data Points Counter
    let missingDataPoints = 0;
    if (!eps) missingDataPoints++;
    if (!opCashflow) missingDataPoints++;
    if (!totalDebt) missingDataPoints++;
    
    // 5. Final Scoring (Refined for Stage 3 Differentiation)
    const valScore = normalizeScore(fairValueGap, -20, 100); // Higher gap = Better
    const moatScore = (normalizeScore(grossMargin, 20, 90) * 0.6) + (normalizeScore(roic, 5, 25) * 0.4);
    const growthEfficiency = normalizeScore(ruleOf40, 10, 60);
    const safetyCheck = normalizeScore(zScore, 1.5, 5.0); // Just a sanity check

    // Weighted Fundamental Score: Heavy on Valuation & Moat
    const fundamentalScore = (valScore * 0.40) + (moatScore * 0.30) + (growthEfficiency * 0.20) + (safetyCheck * 0.10);

    // Moat Label
    let economicMoat: '광폭 (Wide)' | '협소 (Narrow)' | '없음 (None)' = '없음 (None)';
    if (roic > 15 && grossMargin > 40 && fScore >= 7) economicMoat = '광폭 (Wide)';
    else if (roic > 8 && grossMargin > 20) economicMoat = '협소 (Narrow)';

    // Confidence Penalty
    const dataConfidence = Math.max(10, 100 - (missingDataPoints * 15));

    return {
        fundamentalScore: Number(fundamentalScore.toFixed(2)),
        zScore: Number(zScore.toFixed(2)),
        fScore: fScore,
        roic: Number(roic.toFixed(2)),
        ruleOf40: Number(ruleOf40.toFixed(2)),
        grossMargin: Number(grossMargin.toFixed(2)),
        intrinsicValue: Number(intrinsicValue.toFixed(2)),
        upsidePotential: Number(fairValueGap.toFixed(2)),
        fairValueGap: Number(fairValueGap.toFixed(2)),
        earningsQuality: Number((opCashflow / (netIncome || 1)).toFixed(2)),
        economicMoat,
        dataConfidence,
        radarData: [
            { subject: '저평가매력', A: Number(valScore.toFixed(0)), fullMark: 100 },
            { subject: '경제적해자', A: Number(moatScore.toFixed(0)), fullMark: 100 },
            { subject: '성장효율성', A: Number(growthEfficiency.toFixed(0)), fullMark: 100 },
            { subject: '재무안정성', A: Number(safetyCheck.toFixed(0)), fullMark: 100 },
            { subject: '이익의질', A: Number(normalizeScore(fScore, 3, 9).toFixed(0)), fullMark: 100 },
        ]
    };
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, file: '' });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Node v4.1: Value & Moat Engine Ready.']);
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging Fundamental Analysis...", "signal");
        executeFundamentalEngine();
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

  const getFormattedTimestamp = () => {
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
  };

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
      // Safe parsing for NaN which might exist in raw financial data
      const safeText = text.replace(/:\s*(?:NaN|Infinity|-Infinity)\b/g, ': null');
      
      try {
          return JSON.parse(safeText);
      } catch (e) {
          console.error("JSON Parse Error:", e);
          throw new Error("Invalid JSON in Financial Data");
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

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
      const meta = { name, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
      });
  };

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

          // [TUNING] Increased to 300 to match Stage 2 output
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
                          content.forEach((d: any) => { 
                              if(d.symbol) historyDataMap.set(d.symbol, d.financials || []); 
                          });
                      } else {
                          Object.keys(content).forEach(sym => historyDataMap.set(sym, content[sym]));
                      }
                  }
              }

              const batch = groupedByLetter[letter];
              for (const stage2Item of batch) {
                  const dailyData = dailyDataMap.get(stage2Item.symbol) || {};
                  const fullHistory = historyDataMap.get(stage2Item.symbol) || [];

                  const merged = { ...stage2Item, ...dailyData, fullHistory: fullHistory };
                  
                  // [CORE CHANGE] Execute Valuation & Moat Logic
                  const analysis = performFinancialEngineering(merged);
                  
                  const qualityScore = stage2Item.qualityScore || 50;
                  const fundamentalScore = analysis.fundamentalScore;
                  
                  // Composite Alpha: Blend Stage 2 (Quality) and Stage 3 (Valuation)
                  // 40% Quality (Past Performance) + 60% Valuation (Future Upside)
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
              await new Promise(r => setTimeout(r, 10)); 
          }

          results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
          setProcessedData(results);
          if (results.length > 0) handleTickerSelect(results[0]);

          addLog("Valuation Audit Complete. Saving to Vault...", "info");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
          const resultFileName = `STAGE3_FUNDAMENTAL_FULL_${getFormattedTimestamp()}.json`;

          const payload = {
              manifest: { 
                  version: "13.5.0", 
                  count: results.length, 
                  timestamp: new Date().toISOString(),
                  engine: "Valuation_Moat_Core" 
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

  const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    if (s.includes('finance')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('health')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Node v4.1.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                        {loading ? `Auditing: ${progress.file}` : 'Deep Fundamental Audit Ready'}
                    </span>
                    {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse w-fit">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={executeFundamentalEngine} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95 transition-all`}
            >
              {loading ? 'Crunching Numbers...' : 'Start Global Fundamental Audit'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[400px]">
                  <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                      <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Fundamental Rank ({processedData.length})</p>
                      <span className="text-[8px] font-mono text-slate-500">Sorted by Composite Alpha</span>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                      {processedData.length > 0 ? processedData.map((t, i) => (
                          <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                              <div className="flex items-center gap-3">
                                  <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-cyan-400' : 'text-slate-500'}`}>{i + 1}</span>
                                  <div>
                                      <p className="text-xs font-black text-white">{t.symbol}</p>
                                      <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                  </div>
                              </div>
                              <div className="text-right">
                                  <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(0)} <span className="text-[7px] text-slate-500">SCORE</span></p>
                                  <div className="flex gap-1 justify-end mt-0.5">
                                      {t.fairValueGap > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>}
                                      {t.economicMoat !== '없음 (None)' && <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>}
                                      {t.ruleOf40 > 40 && <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>}
                                  </div>
                              </div>
                          </div>
                      )) : (
                          <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                              Waiting for Audit Data...
                          </div>
                      )}
                  </div>
              </div>

              {/* DETAIL VIEW */}
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
                                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded border ${getSectorStyle(selectedTicker.sector)}`}>
                                           {selectedTicker.sector}
                                       </span>
                                       <span className="text-[8px] font-black bg-cyan-900/30 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20 uppercase">
                                            Gap {selectedTicker.fairValueGap > 0 ? '+' : ''}{selectedTicker.fairValueGap.toFixed(1)}%
                                       </span>
                                       {selectedTicker.economicMoat !== '없음 (None)' && (
                                           <span className="text-[8px] font-black bg-purple-900/30 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 uppercase">
                                               {selectedTicker.economicMoat}
                                           </span>
                                       )}
                                  </div>
                              </div>
                              <div className="text-right">
                                   <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Fund. Score</p>
                                   <p className="text-2xl font-black text-cyan-400 tracking-tighter">{selectedTicker.fundamentalScore.toFixed(1)}</p>
                              </div>
                          </div>

                          <div className="flex-1 w-full relative -ml-4 my-2">
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
                          
                          <div className="grid grid-cols-3 gap-2 mt-2">
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">ROIC</p>
                                   <p className={`text-xs font-black ${selectedTicker.roic > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.roic.toFixed(1)}%</p>
                               </div>
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">Z-Score</p>
                                   <p className={`text-xs font-black ${selectedTicker.zScoreProxy > 2.9 ? 'text-emerald-400' : selectedTicker.zScoreProxy < 1.8 ? 'text-rose-400' : 'text-amber-400'}`}>{selectedTicker.zScoreProxy.toFixed(2)}</p>
                               </div>
                               <div className="bg-slate-800/50 p-2 rounded-lg text-center border border-white/5">
                                   <p className="text-[7px] text-slate-400 uppercase font-bold">FCF Yield</p>
                                   <p className={`text-xs font-black ${selectedTicker.fcfMargin > 15 ? 'text-emerald-400' : 'text-slate-300'}`}>{selectedTicker.fcfMargin.toFixed(1)}%</p>
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((log, i) => (
              <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-cyan-900'}`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
