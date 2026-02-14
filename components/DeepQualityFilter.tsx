
import React, { useState, useEffect, useRef } from 'react';
import { ResponsiveContainer, Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

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

const findValue = (obj: any, candidates: string[]): number => {
    if (!obj || typeof obj !== 'object') return 0;
    const keys = Object.keys(obj);
    // Create a normalized map for case-insensitive lookup
    const normalizedMap = new Map<string, string>();
    keys.forEach(k => normalizedMap.set(k.toLowerCase().replace(/[^a-z0-9]/g, ''), k));

    for (const candidate of candidates) {
        const lowerCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
        // Exact match attempt
        if (normalizedMap.has(lowerCandidate)) {
            const originalKey = normalizedMap.get(lowerCandidate);
            const val = safeNum(obj[originalKey!]);
            if (val !== 0) return val;
        }
        // Partial match attempt (safer to rely on specific keys, but useful fallback)
        for (const [normKey, originalKey] of normalizedMap) {
             if (normKey === lowerCandidate || (normKey.includes(lowerCandidate) && normKey.length < lowerCandidate.length + 5)) {
                 const val = safeNum(obj[originalKey]);
                 if(val !== 0) return val;
             }
        }
    }
    return 0;
};

// --- ADVANCED V-Q-H-G-M LOGIC (Reconstruction Engine) ---
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
  const revenue = findValue(latest, ['totalRevenue', 'Total Revenue', 'revenue', 'Revenue', 'Sales']);
  const prevRevenue = findValue(prev, ['totalRevenue', 'Total Revenue', 'revenue', 'Revenue', 'Sales']);
  
  const costOfRevenue = findValue(latest, ['costOfRevenue', 'Cost Of Revenue', 'costOfGoodsSold']);
  const grossProfit = findValue(latest, ['grossProfit', 'Gross Profit']);
  
  const operatingIncome = findValue(latest, ['operatingIncome', 'Operating Income', 'EBIT', 'ebit']);
  const netIncome = findValue(latest, ['netIncome', 'Net Income', 'netIncomeCommonStockholders']);
  
  // --- LEVEL 2: ARITHMETIC RECONSTRUCTION (Data Recovery) ---

  // A. Reconstruct Total Assets (Accounting Identity: Assets = Liabilities + Equity)
  let totalAssets = findValue(latest, ['totalAssets', 'Total Assets']);
  
  if (totalAssets === 0) {
      const totalLiab = findValue(latest, ['totalLiabilities', 'Total Liabilities', 'totalLiabilitiesNetMinorityInterest']);
      const totalEquity = findValue(latest, ['totalEquity', 'Total Equity', 'totalEquityGrossMinorityInterest', 'stockholdersEquity']);
      
      if (totalLiab !== 0 && totalEquity !== 0) {
          totalAssets = totalLiab + totalEquity; // Perfect Reconstruction
      } else {
          // Fallback B: Current + Non-Current
          const currentAssets = findValue(latest, ['totalCurrentAssets', 'Current Assets']) || 
                               (findValue(latest, ['cashAndCashEquivalents', 'Cash']) + 
                                findValue(latest, ['netReceivables', 'Receivables']) +
                                findValue(latest, ['inventory', 'Inventory']));
                                
          const nonCurrentAssets = findValue(latest, ['totalNonCurrentAssets', 'Total Non Current Assets']) ||
                                  (findValue(latest, ['propertyPlantEquipmentNet', 'Net PPE']) + 
                                   findValue(latest, ['goodwill', 'Goodwill']) + 
                                   findValue(latest, ['intangibleAssets', 'Intangible Assets']));
          
          if (currentAssets > 0) {
              totalAssets = currentAssets + nonCurrentAssets;
          }
      }
  }

  // B. Reconstruct Current Liabilities (Crucial for Invested Capital)
  let currentLiabilities = findValue(latest, ['totalCurrentLiabilities', 'Total Current Liabilities', 'currentLiabilities']);
  if (currentLiabilities === 0) {
      currentLiabilities = findValue(latest, ['accountPayables', 'Payables']) + 
                           findValue(latest, ['shortTermDebt', 'Short Term Debt']) + 
                           findValue(latest, ['deferredRevenue', 'Deferred Revenue']) +
                           findValue(latest, ['otherCurrentLiabilities', 'Other Current Liabilities']);
  }
  
  // C. Reconstruct Operating Cash Flow (Indirect Method)
  // OCF = Net Income + D&A + SBC + Working Capital Changes
  let ocf = findValue(latest, ['operatingCashFlow', 'Operating Cash Flow', 'netCashProvidedByOperatingActivities']);
  let isOcfReconstructed = false;

  if (ocf === 0) {
       const depreciation = findValue(latest, ['depreciationAndAmortization', 'Depreciation', 'Amortization']);
       const sbc = findValue(latest, ['stockBasedCompensation', 'Stock Based Compensation']);
       
       if (netIncome !== 0) {
           ocf = netIncome + depreciation + sbc;
           isOcfReconstructed = true;
       } else {
           // Fallback to EBITDA Proxy
           const ebitda = findValue(latest, ['ebitda', 'EBITDA']);
           const interest = Math.abs(findValue(latest, ['interestExpense', 'Interest Expense']));
           const tax = Math.abs(findValue(latest, ['incomeTaxExpense', 'Tax Provision']));
           if (ebitda !== 0) {
               ocf = ebitda - interest - tax;
               isOcfReconstructed = true;
           }
       }
  }

  const capex = Math.abs(findValue(latest, ['capitalExpenditure', 'Capital Expenditure', 'capex']));
  const currentAssets = findValue(latest, ['totalCurrentAssets', 'Total Current Assets', 'currentAssets']);

  const epsCurrent = findValue(latest, ['eps', 'earningsPerShare', 'epsDiluted']);
  const epsPrev = findValue(prev, ['eps', 'earningsPerShare', 'epsDiluted']);

  // --- DERIVED METRICS ---
  
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

  // 3. Quality (ROIC) - Utilizing Reconstructed Data
  const taxRate = 0.21;
  const nopat = operatingIncome > 0 ? operatingIncome * (1 - taxRate) : netIncome; // NOPAT proxy if OpInc missing
  
  let investedCapital = 0;
  if (totalAssets > 0 && currentLiabilities > 0) {
      investedCapital = totalAssets - currentLiabilities;
  } else if (marketCap > 0 && debt > 0 && pbr > 0) {
       // Fallback Level 3: Equity (Market) + Debt
       // Estimate Book Equity via PBR
       const bookEquity = marketCap / pbr;
       investedCapital = bookEquity + (bookEquity * (debt / 100)); // Equity + Debt
  }
  
  let roic = 0;
  if (investedCapital > 0) {
      roic = (nopat / investedCapital) * 100;
  } else if (roe > 0) {
      // Level 3 Proxy: ROIC ≈ ROE / (1 + D/E)
      roic = roe / (1 + (debt / 100));
  }

  // Accruals (Quality Check)
  // Only calculate if we have confidence in OCF data (not purely reconstructed from NI without adjustments)
  const accruals = isOcfReconstructed ? 0 : netIncome - ocf; 

  // 4. Health (Z-Score Components)
  let currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
  if (currentRatio === 0) currentRatio = debt < 50 ? 2.0 : 1.0; // Fallback default

  const workingCapital = currentAssets - currentLiabilities;
  
  // Z-Score Proxy
  // 1.2A + 1.4B + 3.3C + 0.6D + 1.0E
  let zScoreProxy = 0;
  if (totalAssets > 0) {
      const A = workingCapital / totalAssets;
      const C = operatingIncome / totalAssets;
      const D = (marketCap > 0 ? marketCap : totalAssets * 0.5) / (totalAssets - (marketCap/pbr || totalAssets*0.5)); // Equity/Liab
      const E = revenue / totalAssets;
      zScoreProxy = (1.2 * A) + (3.3 * C) + (0.6 * (D > 0 ? D : 0.5)) + (1.0 * E);
  } else {
      zScoreProxy = debt < 40 ? 3.0 : 1.5;
  }

  // 5. Growth
  const revenueGrowth = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;
  const epsGrowth = epsPrev > 0 ? ((epsCurrent - epsPrev) / epsPrev) * 100 : 0;

  // --- SCORING ---
  
  let profitScore = Math.min(100, Math.max(0, (roe / 20) * 60 + (roic / 15) * 40));
  
  // Earnings Quality Flag
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

  // Growth Score Calculation (Explicit)
  let growthScore = 50;
  if (revenueGrowth > 15) growthScore += 20;
  else if (revenueGrowth > 5) growthScore += 10;
  
  if (epsGrowth > 15) growthScore += 20;
  else if (epsGrowth > 5) growthScore += 10;
  
  growthScore = Math.min(100, Math.max(0, growthScore));

  const qualityScore = (profitScore * 0.4) + (safeScore * 0.3) + (valueScore * 0.3);

  return {
      scores: {
          profitScore: Math.round(profitScore),
          safeScore: Math.round(safeScore),
          valueScore: Math.round(valueScore),
          growthScore: Math.round(growthScore), // Added
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
  const [selectedTicker, setSelectedTicker] = useState<any | null>(null);
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

  // [CRITICAL FIX] Robust JSON Parser for NaN handling
  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Download failed`);
      
      const text = await res.text();
      // Replace NaN/Infinity literals which are invalid in JSON but common in Python outputs
      const safeText = text.replace(/:\s*(?:NaN|Infinity|-Infinity)\b/g, ': null');
      
      try {
          return JSON.parse(safeText);
      } catch (e) {
          console.error("JSON Parse Error (Fixed):", e);
          throw new Error("Invalid JSON in Financial Data (NaN Fixed)");
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
                  
                  // Run Analysis with RECONSTRUCTION Logic
                  const analysis = performAdvancedAnalysis(merged, fullHistory);
                  
                  // Filter out low quality
                  // Rule: Quality Score > 40 OR (Growth Score > 70 AND Safe Score > 50)
                  if (analysis.scores.qualityScore > 40 || (analysis.scores.valueScore > 70 && analysis.scores.safeScore > 50)) {
                      results.push({
                          ...item,
                          ...analysis.scores,
                          ...analysis.metrics,
                          radarData: [
                            { subject: 'Profit', A: analysis.scores.profitScore, fullMark: 100 },
                            { subject: 'Health', A: analysis.scores.safeScore, fullMark: 100 },
                            { subject: 'Value', A: analysis.scores.valueScore, fullMark: 100 },
                            { subject: 'Growth', A: analysis.scores.growthScore, fullMark: 100 },
                          ],
                          lastUpdate: new Date().toISOString()
                      });
                  }
              }
              setProgress(prev => ({ ...prev, current: results.length }));
              await new Promise(r => setTimeout(r, 10)); // Yield to UI
          }

          results.sort((a, b) => b.qualityScore - a.qualityScore);
          // Slice top 300 for Stage 3 (Optimized Funnel)
          const eliteCandidates = results.slice(0, 300);
          setProcessedData(eliteCandidates);
          if (eliteCandidates.length > 0) handleTickerSelect(eliteCandidates[0]);

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
                                       <span className="text-[8px] font-black bg-blue-900/30 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 uppercase">ROE {selectedTicker.roe}%</span>
                                       <span className="text-[8px] font-black bg-emerald-900/30 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">Gross {selectedTicker.grossMargin.toFixed(1)}%</span>
                                       {selectedTicker.currentRatio < 1 && <span className="text-[8px] font-black bg-rose-900/30 text-rose-400 px-2 py-0.5 rounded border border-rose-500/20 uppercase">Liquidity Risk</span>}
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
