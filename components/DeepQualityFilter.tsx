
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// --- HELPER FUNCTIONS ---
const safeNum = (val: any) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isFinite(val) ? val : 0;
    let cleanStr = String(val).replace(/,/g, '').replace(/%/g, '').trim();
    if (cleanStr.startsWith('(') && cleanStr.endsWith(')')) {
        cleanStr = '-' + cleanStr.slice(1, -1);
    }
    const n = parseFloat(cleanStr);
    return Number.isFinite(n) ? n : 0;
};

const findValue = (obj: any, keys: string[]): number => {
    if (!obj) return 0;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) {
             return safeNum(obj[key]);
        }
    }
    return 0;
};

// --- ADVANCED V-Q-H-G-M LOGIC ---
const performAdvancedAnalysis = (daily: any, rawHistory: any) => {
  // 0. Data Normalization: Ensure history is an array sorted by date (Newest First)
  let history: any[] = [];
  if (Array.isArray(rawHistory)) {
      history = rawHistory;
  } else if (typeof rawHistory === 'object' && rawHistory !== null) {
      history = Object.keys(rawHistory)
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          .map(date => ({ ...rawHistory[date], date }));
  }
  
  const latest = history[0] || {};
  const prev = history[1] || {};

  // 1. Data Extraction (Stage 2 Basics)
  const roe = safeNum(daily.roe || latest.returnOnEquity || 0);
  const debt = safeNum(daily.debtToEquity || daily.debtEquityRatio || latest.debtEquityRatio || 0);
  const pe = safeNum(daily.pe || daily.per || 0);
  const pbr = safeNum(daily.pbr || daily.priceToBook || latest.priceToBookRatio || 0);
  const marketCap = safeNum(daily.marketCap || daily.marketValue || 0);

  // --- LEVEL 1: DIRECT EXTRACTION ---
  const revenue = findValue(latest, ['totalRevenue', 'Total Revenue', 'revenue', 'Revenue']);
  const prevRevenue = findValue(prev, ['totalRevenue', 'Total Revenue', 'revenue', 'Revenue']);
  
  const costOfRevenue = findValue(latest, ['costOfRevenue', 'Cost Of Revenue', 'costOfGoodsSold']);
  const grossProfit = findValue(latest, ['grossProfit', 'Gross Profit']);
  
  const operatingIncome = findValue(latest, ['operatingIncome', 'Operating Income', 'EBIT', 'ebit']);
  const netIncome = findValue(latest, ['netIncome', 'Net Income', 'netIncomeCommonStockholders']);
  
  // --- LEVEL 2: ARITHMETIC RECONSTRUCTION (The Fix) ---

  // A. Reconstruct Total Assets
  let totalAssets = findValue(latest, ['totalAssets', 'Total Assets']);
  if (totalAssets === 0) {
      // Logic: Current Assets + Non-Current Assets
      const currentAssets = findValue(latest, ['totalCurrentAssets', 'Total Current Assets']) || 
                           (findValue(latest, ['cashAndCashEquivalents', 'Cash']) + 
                            findValue(latest, ['inventory', 'Inventory']) + 
                            findValue(latest, ['netReceivables', 'Receivables']));
                            
      const nonCurrentAssets = findValue(latest, ['totalNonCurrentAssets', 'Total Non Current Assets']) ||
                              (findValue(latest, ['propertyPlantEquipmentNet', 'Net PPE']) + 
                               findValue(latest, ['goodwill', 'Goodwill']) + 
                               findValue(latest, ['intangibleAssets', 'Intangible Assets']));
      
      if (currentAssets > 0 || nonCurrentAssets > 0) {
          totalAssets = currentAssets + nonCurrentAssets;
      }
  }

  // B. Reconstruct Current Liabilities (Needed for Invested Capital)
  let currentLiabilities = findValue(latest, ['totalCurrentLiabilities', 'Total Current Liabilities', 'currentLiabilities']);
  if (currentLiabilities === 0) {
      currentLiabilities = findValue(latest, ['accountPayables', 'Payables']) + 
                           findValue(latest, ['shortTermDebt', 'Short Term Debt']) + 
                           findValue(latest, ['deferredRevenue', 'Deferred Revenue']);
  }
  
  // C. Reconstruct Operating Cash Flow (Indirect Method Approximation)
  // Formula: Net Income + Depreciation + Amortization (ignoring working capital changes if data missing)
  let ocf = findValue(latest, ['operatingCashFlow', 'Operating Cash Flow', 'netCashProvidedByOperatingActivities']);
  if (ocf === 0) {
       const depreciation = findValue(latest, ['depreciationAndAmortization', 'Depreciation', 'Amortization']);
       if (netIncome !== 0) {
           ocf = netIncome + depreciation;
       } else {
           // Fallback to EBITDA - Interest - Tax
           const ebitda = findValue(latest, ['ebitda', 'EBITDA']);
           const interest = Math.abs(findValue(latest, ['interestExpense', 'Interest Expense']));
           const tax = Math.abs(findValue(latest, ['incomeTaxExpense', 'Tax Provision']));
           if (ebitda !== 0) ocf = ebitda - interest - tax;
       }
  }

  const capex = Math.abs(findValue(latest, ['capitalExpenditure', 'Capital Expenditure', 'capex']));
  const currentAssets = findValue(latest, ['totalCurrentAssets', 'Total Current Assets']) || (totalAssets * 0.4); // Rough estimate if reconstruction failed

  const epsCurrent = findValue(latest, ['eps', 'earningsPerShare', 'epsDiluted']);
  const epsPrev = findValue(prev, ['eps', 'earningsPerShare', 'epsDiluted']);

  // --- REVERSE ENGINEERING METRICS ---
  
  // 1. Margins
  let calculatedGrossProfit = grossProfit;
  if (!calculatedGrossProfit && revenue && costOfRevenue) calculatedGrossProfit = revenue - costOfRevenue;
  
  const grossMargin = revenue > 0 ? (calculatedGrossProfit / revenue) * 100 : 0;
  const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

  // 2. Valuation (P/FCF)
  const fcf = ocf - capex; 
  const pfcf = fcf > 0 ? marketCap / fcf : 0;
  const fcfMargin = revenue > 0 ? (fcf / revenue) * 100 : 0;

  // 3. Quality (ROIC) - Now using Reconstructed Data
  const taxRate = 0.21;
  const nopat = operatingIncome * (1 - taxRate);
  let investedCapital = 0;
  
  if (totalAssets > 0 && currentLiabilities > 0) {
      investedCapital = totalAssets - currentLiabilities;
  } else if (marketCap > 0 && debt > 0) {
       // Fallback: Equity + Debt (Approximation)
       // Equity ~ Market Cap / PBR
       const equityProxy = pbr > 0 ? marketCap / pbr : (roe > 0 ? (netIncome / (roe/100)) : marketCap * 0.5);
       const debtProxy = equityProxy * (debt / 100);
       investedCapital = equityProxy + debtProxy;
  }
  
  let roic = 0;
  if (investedCapital > 0) {
      roic = (nopat / investedCapital) * 100;
  } else if (roe > 0) {
      // Level 3 Proxy: ROIC ≈ ROE / (1 + D/E)
      roic = roe / (1 + (debt / 100));
  }

  // Accruals (Quality Check)
  // Only calculate if we have confidence in OCF data (not purely reconstructed from NI)
  const isOcfReconstructed = findValue(latest, ['operatingCashFlow', 'Operating Cash Flow']) === 0;
  const accruals = isOcfReconstructed ? 0 : netIncome - ocf; 

  // 4. Health (Z-Score Components)
  let currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
  if (currentRatio === 0) currentRatio = debt < 50 ? 2.0 : 1.0; // Fallback default

  const workingCapital = currentAssets - currentLiabilities;
  // Simplified Z-Score for non-manufacturers: 6.56X1 + 3.26X2 + 6.72X3 + 1.05X4
  // We use a simplified proxy for ranking:
  let zScoreProxy = 0;
  if (totalAssets > 0) {
      zScoreProxy = (1.2 * (workingCapital / totalAssets)) + (3.3 * (operatingIncome / totalAssets));
  } else {
      zScoreProxy = debt < 40 ? 3.0 : 1.5;
  }

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
  if (revenueGrowth > 20 && epsGrowth > 20) valueScore += 10;

  const qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

  return {
      scores: {
          profitScore: Math.round(profitScore),
          safeScore: Math.round(safeScore),
          valueScore: Math.round(valueScore),
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

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, msg: '' });
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v5.0: Deep Audit Ready.']);
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
          setProgress({ current: 0, total: candidates.length, msg: 'Initializing...' });

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

          const results: any[] = [];
          const sortedLetters = Object.keys(groupedByLetter).sort();

          for (const letter of sortedLetters) {
              setProgress(prev => ({ ...prev, msg: `Loading Cylinder ${letter}...` }));
              
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
              for (const item of batch) {
                  const dailyData = dailyDataMap.get(item.symbol) || {};
                  const fullHistory = historyDataMap.get(item.symbol) || [];
                  const merged = { ...item, ...dailyData, fullHistory: fullHistory };
                  
                  // Run Analysis
                  const analysis = performAdvancedAnalysis(merged, fullHistory);
                  
                  // Filter out low quality
                  // Rule: Quality Score > 40 OR (Growth Score > 70 AND Safe Score > 50)
                  if (analysis.scores.qualityScore > 40 || (analysis.scores.valueScore > 70 && analysis.scores.safeScore > 50)) {
                      results.push({
                          ...item,
                          ...analysis.scores,
                          ...analysis.metrics,
                          lastUpdate: new Date().toISOString()
                      });
                  }
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 10)); // Yield to UI
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);
          // Slice top 300 for Stage 3
          const eliteCandidates = results.slice(0, 300);
          setProcessedData(eliteCandidates);

          addLog(`Deep Scan Complete. ${eliteCandidates.length} Elite Assets Selected.`, "ok");
          
          const saveFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
          const resultFileName = `STAGE2_ELITE_UNIVERSE_${getFormattedTimestamp()}.json`;

          const payload = {
              manifest: { 
                  version: "5.0.0", 
                  count: eliteCandidates.length, 
                  timestamp: new Date().toISOString(),
                  engine: "3-Factor_Quant_Model" 
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v5.0.0</h2>
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

          <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
             <div className="flex justify-between items-center mb-6">
                <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Elite Candidates Found</p>
                <p className="text-xl font-mono font-black text-white italic">{processedData.length}</p>
             </div>
             <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(progress.current / 300) * 100}%` }}></div>
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
