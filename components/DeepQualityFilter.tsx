
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

// [Advanced Institutional Data Structure]
interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // Advanced Metrics (Calculated or Retrieved)
  zScore: number;       
  fScore: number;       
  relativePeScore: number; 
  
  // 3-Factor Scores (0-100)
  profitabilityScore: number; 
  stabilityScore: number;     
  growthScore: number;        
  qualityScore: number;       // Final Weighted Alpha Score
  validityScore: number;      // Data Confidence (0-100)

  // Raw Data (Snapshot)
  per: number;
  roe: number;
  debtToEquity: number;
  pbr: number;
  currentRatio: number;
  operatingCashFlow: number;
  
  // Meta
  sector: string;
  industry: string;
  theme: string; 
  lastUpdate: string;
  source: string; 

  // [DATA PRESERVATION] Store raw financial report for dumping
  financialReport?: any; 

  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const CACHE_PREFIX = 'QUANT_CACHE_HYBRID_v4_'; 
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

const getDailyCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0];
    return `${CACHE_PREFIX}${symbol}_${today}`;
};

// [Sector Benchmarks for Relative Valuation]
const SECTOR_BENCHMARKS: Record<string, number> = {
    'Technology': 35.0, 'Health Services': 25.0, 'Consumer Services': 28.0, 
    'Finance': 15.0, 'Energy Minerals': 14.0, 'Consumer Non-Durables': 22.0,
    'Producer Manufacturing': 20.0, 'Utilities': 18.0, 'Transportation': 22.0,
    'Non-Energy Minerals': 18.0, 'Commercial Services': 26.0, 'Communications': 20.0
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
  const [reportProgress, setReportProgress] = useState({ current: 0, total: 0, skipped: 0, archived: 0 }); 
  const [fmpDepleted, setFmpDepleted] = useState(false);
  
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'HYBRID_SCAN' | 'SCORING' | 'AI_AUDIT' | 'REPORT_DUMP' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v9.3: "Use Everything" Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  // [TUNING] Batch size
  const BATCH_SIZE = 5; 
  const REPORT_ARCHIVE_BATCH_SIZE = 4;
  const TARGET_SELECTION_COUNT = 500; 
  
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
        addLog("AUTO-PILOT: Engaging Full-Spectrum Quality Scan...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const clearStageCache = () => {
      try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && key.startsWith(CACHE_PREFIX)) keysToRemove.push(key);
          }
          if (keysToRemove.length === 0) return;
          keysToRemove.forEach(k => sessionStorage.removeItem(k));
          setProcessedData([]); 
          addLog(`[CACHE] System flushed. Clean slate ready.`, "warn");
      } catch (e) { console.error(e); }
  };

  const mapIndustryToTheme = (industry: string, sector: string) => {
      if (!industry) return sector;
      const ind = industry.toLowerCase();
      if (ind.includes('semi')) return 'Semiconductors';
      if (ind.includes('software') || ind.includes('data') || ind.includes('tech')) return 'SaaS & AI';
      if (ind.includes('biotech') || ind.includes('pharma')) return 'Bio/Pharma';
      if (ind.includes('bank') || ind.includes('invest') || ind.includes('insur')) return 'Financials';
      if (ind.includes('oil') || ind.includes('gas') || ind.includes('energy')) return 'Energy';
      if (ind.includes('aerospace') || ind.includes('defense')) return 'Defense';
      if (ind.includes('reit') || ind.includes('real estate')) return 'Real Estate';
      if (ind.includes('auto') || ind.includes('vehicle')) return 'Automotive';
      return sector; 
  };

  const safeNum = (val: any) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val.raw) return Number(val.raw);
      return Number(val) || 0;
  };

  // --- OMNI-CHANNEL DATA ACQUISITION ---
  const fetchHybridFinancials = async (symbol: string): Promise<any> => {
      let financials: any = null;

      // 1. YAHOO STRATEGY (Deepest - Ledger)
      try {
          const yahooSymbol = symbol.replace(/\./g, '-');
          const modules = [
              'financialData', 'defaultKeyStatistics', 'balanceSheetHistory', 
              'incomeStatementHistory', 'cashflowStatementHistory', 'summaryDetail'
          ].join(',');

          const res = await fetch(`/api/yahoo?symbols=${yahooSymbol}&modules=${modules}`);
          if (res.ok) {
              const data = await res.json();
              if (data && (data.financialData || data.defaultKeyStatistics)) {
                  financials = {
                      source: 'YAHOO_FULL',
                      raw: data,
                      price: safeNum(data.financialData?.currentPrice),
                      roe: safeNum(data.financialData?.returnOnEquity),
                      per: safeNum(data.summaryDetail?.trailingPE) || safeNum(data.summaryDetail?.forwardPE),
                      pbr: safeNum(data.defaultKeyStatistics?.priceToBook),
                      debtToEquity: safeNum(data.financialData?.debtToEquity),
                      currentRatio: safeNum(data.financialData?.currentRatio),
                      operatingCashFlow: safeNum(data.cashflowStatementHistory?.cashflowStatements?.[0]?.totalCashFromOperatingActivities),
                      balanceSheets: data.balanceSheetHistory?.balanceSheetStatements || [],
                      incomeStatements: data.incomeStatementHistory?.incomeStatementHistory || [],
                      cashflows: data.cashflowStatementHistory?.cashflowStatements || [],
                      hasHistory: (data.balanceSheetHistory?.balanceSheetStatements?.length || 0) > 1
                  };
              }
          }
      } catch (e) { }

      // 2. FMP STRATEGY (Deep Fallback - Statements)
      if (!financials && fmpKey && !fmpDepleted) {
          try {
              // Parallel fetch for Statements (Limit 2 for YoY comparison)
              const [isRes, bsRes, ratioRes] = await Promise.all([
                  fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=2&apikey=${fmpKey}`),
                  fetch(`https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=2&apikey=${fmpKey}`),
                  fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`)
              ]);

              if (isRes.status === 429 || bsRes.status === 429) {
                  setFmpDepleted(true);
                  addLog("FMP Limit Hit. Falling back.", "warn");
              } else if (isRes.ok && bsRes.ok && ratioRes.ok) {
                  const is = await isRes.json();
                  const bs = await bsRes.json();
                  const ratios = await ratioRes.json();
                  
                  if (Array.isArray(is) && is.length > 0) {
                      const r = ratios[0] || {};
                      financials = {
                          source: 'FMP_DEEP',
                          raw: { incomeStatement: is, balanceSheet: bs, ratios: r },
                          price: 0, // Will be filled from Stage 0 data
                          roe: r.returnOnEquityTTM || 0,
                          per: r.peRatioTTM || 0,
                          pbr: r.priceToBookRatioTTM || 0,
                          debtToEquity: (r.debtEquityRatioTTM || 0) * 100,
                          currentRatio: r.currentRatioTTM || 0,
                          operatingCashFlow: r.operatingCashFlowPerShareTTM || 0,
                          balanceSheets: bs, // Standardized Array
                          incomeStatements: is, // Standardized Array
                          hasHistory: is.length > 1
                      };
                  }
              }
          } catch (e) { }
      }

      // 3. FINNHUB STRATEGY (Rich Metrics)
      if (!financials && finnhubKey) {
          try {
              const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubKey}`);
              if (res.ok) {
                  const json = await res.json();
                  const m = json.metric;
                  if (m && (m.roeTTM || m.peNormalized || m.epsTTM)) {
                       financials = {
                          source: 'FINNHUB_METRIC',
                          raw: m,
                          price: 0,
                          roe: (m.roeTTM || 0) / 100, 
                          per: m.peNormalized || m.peTTM || 0,
                          pbr: m.pbAnnual || 0,
                          debtToEquity: m['totalDebt/totalEquityAnnual'] || m['totalDebt/totalEquityQuarterly'] || 0,
                          currentRatio: m.currentRatioQuarterly || m.currentRatioAnnual || 0,
                          operatingCashFlow: m.cashFlowPerShareTTM || 0,
                          epsGrowth: m.epsGrowthTTMYoy || 0, // Bonus metric
                          hasHistory: false
                       };
                  }
              }
          } catch (e) { }
      }

      // 4. POLYGON STRATEGY (Financials Fallback)
      if (!financials && polygonKey) {
         try {
             const res = await fetch(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=2&apiKey=${polygonKey}`);
             if (res.ok) {
                 const json = await res.json();
                 if (json.results && json.results.length > 0) {
                     const r = json.results[0];
                     const f = r.financials;
                     financials = {
                         source: 'POLYGON_FIN',
                         raw: json.results,
                         price: 0,
                         roe: (f.ratios?.return_on_equity?.value || 0), // Polygon ratio is usually decimal
                         per: 0, // Polygon financials endpoint often lacks realtime PE
                         pbr: 0,
                         debtToEquity: (f.balance_sheet?.long_term_debt?.value / f.balance_sheet?.equity?.value) * 100 || 0,
                         currentRatio: (f.balance_sheet?.current_assets?.value / f.balance_sheet?.current_liabilities?.value) || 0,
                         operatingCashFlow: f.cash_flow_statement?.net_cash_flow_from_operating_activities?.value || 0,
                         hasHistory: json.results.length > 1
                     };
                 }
             }
         } catch (e) {}
      }

      return financials;
  };

  // --- SCORING LOGIC (Adaptive) ---
  const calculateScores = (data: any, sector: string) => {
      let fScore = 5; 
      let zScore = 0;
      let validity = 50;

      // 1. Z-Score (Altman) - Deep vs Synthetic
      if ((data.source === 'YAHOO_FULL' || data.source === 'FMP_DEEP') && data.hasHistory) {
          // Deep Calculation
          const bs = data.balanceSheets[0];
          const is = data.incomeStatements[0];
          
          // Normalized Accessors (Handle Yahoo vs FMP structure differences roughly)
          const ta = safeNum(bs.totalAssets);
          const tl = safeNum(bs.totalLiab) || safeNum(bs.totalLiabilities);
          const ca = safeNum(bs.totalCurrentAssets);
          const cl = safeNum(bs.totalCurrentLiabilities);
          const re = safeNum(bs.retainedEarnings);
          const ebit = safeNum(is.ebit) || safeNum(is.operatingIncome);
          const rev = safeNum(is.totalRevenue) || safeNum(is.revenue);
          
          if (ta > 0) {
              const wc = ca - cl;
              const A = wc/ta; 
              const B = re/ta; 
              const C = ebit/ta; 
              // D: Market Value of Equity / Total Liab. (Proxy using Price * Shares if available, else NetAssets)
              const D = (ta - tl) / (tl || 1); 
              const E = rev/ta;
              
              zScore = (1.2*A) + (1.4*B) + (3.3*C) + (0.6*D) + (1.0*E);
              validity = 100;
          }
      } else {
          // Synthetic Z-Score based on Metric Ratios
          if (data.debtToEquity < 50 && data.currentRatio > 1.5) zScore = 3.5;
          else if (data.debtToEquity < 100 && data.currentRatio > 1.0) zScore = 2.5;
          else if (data.debtToEquity > 150 || data.currentRatio < 0.8) zScore = 1.0;
          else zScore = 1.8;
          validity = 70;
      }

      // 2. F-Score (Piotroski) - Deep vs Synthetic
      if ((data.source === 'YAHOO_FULL' || data.source === 'FMP_DEEP') && data.hasHistory) {
          fScore = 0;
          const cur = data.incomeStatements[0];
          const prev = data.incomeStatements[1];
          const curBS = data.balanceSheets[0];
          const prevBS = data.balanceSheets[1];
          
          if (cur && prev && curBS && prevBS) {
              // Profitability
              if(safeNum(cur.netIncome) > 0) fScore++;
              if(safeNum(cur.operatingCashFlow) > 0) fScore++; // Note: Check where CFO comes from
              if(safeNum(cur.netIncome) > safeNum(prev.netIncome)) fScore++; // Delta NI proxy for ROA delta
              if(safeNum(cur.operatingCashFlow) > safeNum(cur.netIncome)) fScore++;
              
              // Leverage
              if(safeNum(curBS.totalLiab)/safeNum(curBS.totalAssets) < safeNum(prevBS.totalLiab)/safeNum(prevBS.totalAssets)) fScore++;
              if(safeNum(curBS.totalCurrentAssets)/safeNum(curBS.totalCurrentLiabilities) > safeNum(prevBS.totalCurrentAssets)/safeNum(prevBS.totalCurrentLiabilities)) fScore++;
              
              // Efficiency
              if((safeNum(cur.grossProfit)/safeNum(cur.totalRevenue)) > (safeNum(prev.grossProfit)/safeNum(prev.totalRevenue))) fScore++;
              if((safeNum(cur.totalRevenue)/safeNum(curBS.totalAssets)) > (safeNum(prev.totalRevenue)/safeNum(prevBS.totalAssets))) fScore++;
              
              // Padding for shares (missing usually) -> assume 1
              fScore++;
          }
      } else {
          // Synthetic F-Score for Metrics
          fScore = 4;
          if (data.roe > 0.15) fScore += 2; 
          else if (data.roe > 0) fScore += 1;
          
          if (data.debtToEquity < 80) fScore += 1;
          if (data.currentRatio > 1.2) fScore += 1;
          if (data.epsGrowth && data.epsGrowth > 0) fScore += 1; 
          
          fScore = Math.min(9, fScore);
      }

      // 3. Valuation & Profitability
      let valScore = 0;
      const pe = data.per;
      const sectorPE = SECTOR_BENCHMARKS[sector] || 20;
      
      if (pe > 0) {
          const rel = pe / sectorPE;
          if (rel < 0.8) valScore = 90;
          else if (rel < 1.2) valScore = 70;
          else if (rel < 1.5) valScore = 50;
          else valScore = 30;
      } else {
          valScore = 20; 
      }

      const profitScore = Math.min(100, Math.max(0, (data.roe || 0) * 100 * 2.5)); 

      // Final Weighted Score
      const qScore = (valScore * 0.3) + (profitScore * 0.3) + (Math.min(zScore*20, 100) * 0.2) + (fScore*10 * 0.2);

      return {
          qualityScore: Number(qScore.toFixed(2)),
          zScore: Number(zScore.toFixed(2)),
          fScore,
          profitScore,
          stabilityScore: Math.min(100, zScore*25),
          valScore,
          validityScore: validity
      };
  };

  const archiveFinancialReports = async (eliteStocks: QualityTicker[]) => {
      if (!accessToken) return;
      setAnalysisPhase('REPORT_DUMP');
      
      const targets = eliteStocks; 
      addLog(`Archiving ${targets.length} Reports (Multi-Source)...`, "info");
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportsArchiveFolder);
      if(!folderId) {
          addLog("Failed to access Reports Folder.", "err");
          return;
      }

      const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
      let existingFiles = new Set<string>();
      try {
          const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=files(name)`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());
          if (listRes.files) {
              listRes.files.forEach((f: any) => existingFiles.add(f.name));
          }
      } catch (e) {}

      const total = targets.length;
      let skipped = 0;
      let archived = 0;
      let current = 0;
      setReportProgress({ current: 0, total, skipped: 0, archived: 0 });

      for (let i = 0; i < total; i += REPORT_ARCHIVE_BATCH_SIZE) {
          const batch = targets.slice(i, i + REPORT_ARCHIVE_BATCH_SIZE);
          
          await Promise.all(batch.map(async (stock) => {
              // File name includes source for clarity
              const fileName = `REPORT_${stock.symbol}_${stock.source.split('_')[0]}.json`;
              if (existingFiles.has(fileName)) {
                  skipped++; 
                  return;
              }

              if (stock.financialReport) {
                  const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
                  const form = new FormData();
                  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
                  form.append('file', new Blob([JSON.stringify(stock.financialReport, null, 2)], { type: 'application/json' }));

                  try {
                      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                          method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
                      });
                      if (res.ok) archived++;
                  } catch (e) { }
              }
          }));

          current += batch.length;
          setReportProgress({ current: Math.min(current, total), total, skipped, archived });
          await new Promise(r => setTimeout(r, 150)); 
      }

      addLog(`Archives: ${archived} Saved, ${skipped} Skipped.`, "ok");
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) return;
    if (loading) return;

    setLoading(true);
    setAnalysisPhase('INIT');
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      // 1. Load Stage 1 Data
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 1 Missing");
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      targets = targets.filter((t: any) => t.type === 'Common Stock' || !t.type);
      
      // Sort by Market Cap desc
      targets.sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));

      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      setAnalysisPhase('HYBRID_SCAN');
      
      const validResults: QualityTicker[] = [];
      let currentIndex = 0;
      let dropped = 0;

      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          const batchResults = await Promise.all(batch.map(async (t: any) => {
              const cacheKey = getDailyCacheKey(t.symbol);
              const cached = sessionStorage.getItem(cacheKey);
              
              if (cached) {
                  setProgress(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
                  return JSON.parse(cached);
              }

              // [CORE] Hybrid Fetch
              const financials = await fetchHybridFinancials(t.symbol);
              
              if (!financials) return null; 

              const scores = calculateScores(financials, t.sector || "Unclassified");
              
              if (scores.qualityScore < 15) return null; 

              const resultTicker: QualityTicker = {
                  ...t,
                  // Map retrieved metrics (Prefer Retrieved > Stage 0)
                  per: financials.per,
                  roe: financials.roe * 100, 
                  debtToEquity: financials.debtToEquity,
                  pbr: financials.pbr,
                  currentRatio: financials.currentRatio,
                  operatingCashFlow: financials.operatingCashFlow,
                  source: financials.source,
                  
                  // Scores
                  zScore: scores.zScore,
                  fScore: scores.fScore,
                  relativePeScore: scores.valScore,
                  profitabilityScore: scores.profitScore,
                  stabilityScore: scores.stabilityScore,
                  growthScore: scores.valScore,
                  qualityScore: scores.qualityScore, 
                  validityScore: scores.validityScore,
                  
                  // Meta
                  sector: t.sector || "Unclassified",
                  industry: t.industry || "Unknown",
                  theme: mapIndustryToTheme(t.industry, t.sector || ""),
                  lastUpdate: new Date().toISOString(),
                  
                  // Store RAW report for dumping
                  financialReport: financials.raw 
              };

              sessionStorage.setItem(cacheKey, JSON.stringify(resultTicker));
              return resultTicker;
          }));

          batchResults.forEach(r => {
              if (r) validResults.push(r);
              else dropped++;
          });

          currentIndex += BATCH_SIZE;
          setProgress(prev => ({ ...prev, current: currentIndex, filteredOut: dropped }));
          
          await new Promise(r => setTimeout(r, 200)); 
      }

      setAnalysisPhase('SCORING');
      
      // Sort and Select Top 500
      const eliteSurvivors = validResults.sort((a, b) => b.qualityScore - a.qualityScore).slice(0, TARGET_SELECTION_COUNT);
      setProcessedData(eliteSurvivors);
      
      if (eliteSurvivors.length === 0) {
          addLog("Warning: No assets survived even the hybrid filter.", "warn");
      } else {
          setAnalysisPhase('AI_AUDIT');
          await analyzeUniverseHealth(eliteSurvivors);
      }

      // [NEW] Archive Full Reports for ALL Survivors
      await archiveFinancialReports(eliteSurvivors);

      setAnalysisPhase('COMPLETE');

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      // [KST TIMESTAMP LOGIC]
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      
      const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "9.3.0", strategy: "Hybrid_Ledger_Metric_Scan", timestamp: new Date().toISOString(), engine: "Use_Everything" },
        elite_universe: eliteSurvivors.map(({ financialReport, ...rest }) => rest) // Exclude raw report from main list
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Analysis Complete. ${eliteSurvivors.length} Elite Assets Identified.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Error: ${e.message}`, "err");
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

  // Theme Aggregation for Treemap
  const themeData = useMemo(() => {
      if (processedData.length === 0) return [];
      const map = new Map<string, number>();
      
      processedData.forEach(item => {
          const theme = item.theme || "Other";
          map.set(theme, (map.get(theme) || 0) + 1);
      });

      return Array.from(map)
        .sort((a, b) => b[1] - a[1])
        .map(([name, size], index) => ({ 
            name, 
            size,
            fill: THEME_COLORS[index % THEME_COLORS.length]
        }));
  }, [processedData]);

  // Drill Down Logic
  const themeDetails = useMemo(() => {
      if (!selectedTheme) return [];
      const stocks = processedData.filter(t => t.theme === selectedTheme);
      return stocks.sort((a, b) => b.qualityScore - a.qualityScore);
  }, [selectedTheme, processedData]);

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, value, fill } = props;
    const isSmall = width < 60 || height < 40;
    
    return (
      <g onClick={() => !isSmall && setSelectedTheme(name)} style={{ cursor: isSmall ? 'default' : 'pointer' }}>
        <rect
          x={x} y={y} width={width} height={height}
          style={{ 
              fill: fill || '#3b82f6', 
              stroke: '#0f172a', 
              strokeWidth: 2, 
              fillOpacity: 0.9,
              transition: 'all 0.3s ease'
          }}
          rx={6} ry={6}
          className="hover:opacity-80"
        />
        {!isSmall && (
          <>
            <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="900" style={{ textTransform: 'uppercase', textShadow: '0px 2px 4px rgba(0,0,0,0.9)' }}>
              {name.length > 10 ? name.substring(0, 8) + '..' : name}
            </text>
            <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={9} fontWeight="bold" style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.8)' }}>
              {value} Assets
            </text>
          </>
        )}
      </g>
    );
  };

  const getPhaseStyle = (phase: string) => {
      const phases = ['HYBRID_SCAN', 'SCORING', 'AI_AUDIT', 'REPORT_DUMP'];
      const currentIdx = phases.indexOf(analysisPhase);
      const targetIdx = phases.indexOf(phase);
      
      if (analysisPhase === 'COMPLETE') return 'text-emerald-400 font-bold';
      if (analysisPhase === 'INIT') return 'text-slate-600';
      if (currentIdx === targetIdx) return 'text-blue-400 animate-pulse font-black scale-105';
      if (currentIdx > targetIdx) return 'text-slate-400';
      return 'text-slate-700';
  };

  const analyzeUniverseHealth = async (tickers: QualityTicker[]) => {
    setAiStatus('ANALYZING');
    setAiAnalysis("📡 Gemini 3.0: Institutional Portfolio Audit in progress...");
    
    if (!tickers || tickers.length === 0) {
        setAiStatus('FAILED');
        setAiAnalysis("No assets available for audit.");
        return;
    }

    const totalCount = tickers.length;
    const avgScore = (tickers.reduce((sum, t) => sum + t.qualityScore, 0) / totalCount).toFixed(1);
    const avgZ = (tickers.reduce((sum, t) => sum + t.zScore, 0) / totalCount).toFixed(2);
    
    // Dominant Themes
    const themeCounts: Record<string, number> = {};
    tickers.forEach(t => themeCounts[t.theme] = (themeCounts[t.theme] || 0) + 1);
    const topThemes = Object.entries(themeCounts).sort((a,b) => b[1]-a[1]).slice(0, 3).map(x => x[0]).join(", ");

    const prompt = `
    Please analyze the following stock portfolio metrics and write a professional risk audit report in Korean.
    
    Portfolio Data:
    - Asset Count: ${totalCount}
    - Average Quality Score: ${avgScore} (0-100)
    - Average Altman Z-Score: ${avgZ}
    - Top Themes: ${topThemes}

    Instructions:
    - Act as a professional financial analyst.
    - Do NOT search the internet. Use only the provided data.
    - The output must be entirely in Korean.
    
    Required Output Sections (Markdown):
    1. **포트폴리오 성격**: [공격형/방어형/밸런스형] 중 선택 및 정의.
    2. **리스크 진단**: Z-Score 기반 재무 안정성 평가 (Z < 1.8 위험, Z > 3.0 안전).
    3. **테마 집중도**: 섹터 집중 리스크 분석.
    4. **최종 등급**: [AAA ~ C] 등급 부여.
    `;
    
    try {
        let resultText = "";
        let usedEngine = "Gemini 3 Pro";

        try {
            const geminiKey = process.env.API_KEY || API_CONFIGS.find(c => c.provider === ApiProvider.GEMINI)?.key || "";
            const ai = new GoogleGenAI({ apiKey: geminiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt
            });
            trackUsage(ApiProvider.GEMINI, response.usageMetadata?.totalTokenCount || 0);
            resultText = response.text || "";
        } catch (geminiError: any) {
             console.warn("Gemini Audit Failed. Switching to Sonar.", geminiError);
             setAiAnalysis("⚠️ Gemini unresponsive. Rerouting to Perplexity Sonar...");

             const perplexityKey = API_CONFIGS.find(c => c.provider === ApiProvider.PERPLEXITY)?.key || "";
             const pRes = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${perplexityKey}`,
                    'Accept': 'application/json' 
                },
                body: JSON.stringify({
                    model: 'sonar-pro', 
                    messages: [{ role: "user", content: prompt }]
                })
             });
             
             const pJson = await pRes.json();
             if (pJson.usage) trackUsage(ApiProvider.PERPLEXITY, pJson.usage.total_tokens || 0);

             if (!pRes.ok) throw new Error(pJson.error?.message || "Perplexity Fallback Failed");

             resultText = pJson.choices?.[0]?.message?.content || "";
             usedEngine = "Sonar Pro";
        }
        
        setAiAnalysis(removeCitations(resultText));
        setAiStatus('SUCCESS');
        addLog(`AI Risk Audit Complete via ${usedEngine}.`, "ok");
    } catch (e: any) {
        console.error("AI Audit Error", e);
        setAiAnalysis(`AI Audit Failed: ${e.message}`);
        setAiStatus('FAILED');
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v9.3</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? `Deep Scan: ${progress.current}/${progress.total}` : 'Multi-Source Protocol Ready'}
                        </span>
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${fmpDepleted ? 'border-amber-500/20 text-amber-400' : 'border-purple-500/20 text-purple-400'}`}>
                            {fmpDepleted ? 'Backup: Finnhub/Polygon' : 'Primary: Yahoo/FMP Deep'}
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
                onClick={executeDeepQualityScan} 
                disabled={loading} 
                className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 disabled:shadow-none"
            >
              {loading ? 'Executing Hybrid Scan...' : 'Start Deep Quality Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="flex flex-col gap-6">
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5">
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Scan Progress</p>
                      <p className="text-xl font-mono font-black text-white italic">{loading ? `${(progress.current / (progress.total || 1) * 100).toFixed(1)}%` : 'Idle'}</p>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                      <div className={`h-full transition-all duration-300 bg-blue-500`} style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between text-[8px] uppercase font-bold tracking-widest">
                        <span className={getPhaseStyle('HYBRID_SCAN')}>1. Hybrid Scan</span>
                        <span className={getPhaseStyle('SCORING')}>2. Scoring</span>
                        <span className={getPhaseStyle('AI_AUDIT')}>3. Risk Audit</span>
                        <span className={getPhaseStyle('REPORT_DUMP')}>4. Archiving</span>
                    </div>
                    
                    {/* Report Dump Progress (Visible only during archiving) */}
                    {analysisPhase === 'REPORT_DUMP' && (
                        <div className="mt-4 pt-4 border-t border-white/5 animate-in fade-in">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Saving Financial Reports</span>
                                <span className="text-[8px] text-emerald-400 font-mono">{reportProgress.archived} Saved / {reportProgress.skipped} Skipped</span>
                            </div>
                            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(reportProgress.current / (reportProgress.total || 1)) * 100}%` }}></div>
                            </div>
                        </div>
                    )}
                  </div>

                  <div className={`bg-blue-900/10 p-6 md:p-8 rounded-3xl border relative overflow-hidden group transition-colors flex-1 ${aiStatus === 'ANALYZING' ? 'border-blue-500/50' : aiStatus === 'SUCCESS' ? 'border-emerald-500/50' : 'border-blue-500/10'}`}>
                     <div className="flex justify-between items-center mb-4">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${aiStatus === 'SUCCESS' ? 'text-emerald-400' : 'text-blue-400'}`}>Portfolio Risk Auditor (AI)</p>
                     </div>
                     <div className="prose-report text-xs text-slate-300 leading-relaxed font-medium">
                        {aiAnalysis ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis}</ReactMarkdown> : <span className="italic opacity-50">Awaiting portfolio aggregation...</span>}
                     </div>
                     {aiStatus === 'ANALYZING' && <div className="absolute bottom-0 left-0 h-1 bg-blue-500 animate-pulse w-full"></div>}
                  </div>
              </div>

              <div className="bg-black/40 p-4 rounded-3xl border border-white/5 min-h-[300px] flex flex-col relative overflow-hidden">
                 <div className="absolute top-6 left-6 z-10 w-full pr-12">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 shadow-black drop-shadow-md">Market Theme Dominance</p>
                    <p className="text-[8px] text-slate-500 uppercase font-mono">Based on Elite Selection</p>
                 </div>
                 <div className="flex-1 w-full h-full mt-14"> 
                     {processedData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <Treemap
                                data={themeData}
                                dataKey="size"
                                aspectRatio={4 / 3}
                                stroke="#0f172a"
                                content={<CustomizedContent />}
                            >
                                <RechartsTooltip 
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            return (
                                                <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-lg">
                                                    <p className="text-xs font-bold text-white">{payload[0].payload.name}</p>
                                                    <p className="text-[10px] text-blue-400">Assets: {payload[0].value}</p>
                                                    <p className="text-[8px] text-slate-500 mt-1">Click to inspect sector</p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </Treemap>
                        </ResponsiveContainer>
                     ) : (
                         <div className="flex flex-col items-center justify-center h-full opacity-20 text-center">
                             <div className="w-10 h-10 border-2 border-slate-600 rounded-full flex items-center justify-center mb-3">
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                             </div>
                             <p className="text-[9px] font-black uppercase tracking-[0.2em]">Ready to Visualize Themes</p>
                         </div>
                     )}
                 </div>
                 
                 {selectedTheme && (
                     <div className="absolute inset-0 z-20 bg-slate-900/95 backdrop-blur-md flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200">
                         <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
                             <div>
                                 <h4 className="text-lg font-black text-white italic tracking-tighter uppercase">{selectedTheme}</h4>
                                 <p className="text-[10px] text-slate-400">Elite Assets Ranked by Quality</p>
                             </div>
                             <button onClick={() => setSelectedTheme(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                 <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                         </div>
                         <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                             {themeDetails.length > 0 ? themeDetails.map((item, idx) => {
                                 const globalRank = processedData.findIndex(p => p.symbol === item.symbol) + 1;
                                 return (
                                     <div 
                                        key={item.symbol} 
                                        onClick={() => {
                                            onStockSelected?.(item);
                                        }}
                                        className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/50 transition-colors cursor-pointer active:scale-95 group"
                                     >
                                         <div className="flex items-center gap-3">
                                             <div className="flex flex-col items-center justify-center w-8 h-8 bg-black/40 rounded-lg border border-white/5">
                                                 <span className="text-[8px] text-slate-500 uppercase">Rank</span>
                                                 <span className="text-[10px] font-black text-blue-400">#{globalRank}</span>
                                             </div>
                                             <div>
                                                 <div className="flex items-center gap-1.5">
                                                     <p className="text-xs font-black text-white group-hover:text-blue-400 transition-colors">{item.symbol}</p>
                                                     <span className={`text-[6px] px-1 rounded border font-bold uppercase ${item.source.includes('YAHOO') ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}`}>
                                                         {item.source.includes('YAHOO') ? 'REAL' : 'EST'}
                                                     </span>
                                                 </div>
                                                 <p className="text-[9px] text-slate-400 truncate w-24">{item.name}</p>
                                             </div>
                                         </div>
                                         <div className="text-right">
                                             <div className="flex items-center justify-end gap-2">
                                                 <span className="text-[10px] font-mono text-emerald-400 font-bold">${item.price?.toFixed(2)}</span>
                                             </div>
                                             <div className="flex items-center gap-2 mt-1">
                                                 <span className="text-[8px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">Z: {item.zScore}</span>
                                                 <span className="text-[8px] bg-blue-900/40 px-1.5 py-0.5 rounded text-blue-300 border border-blue-500/20">Score: {item.qualityScore}</span>
                                             </div>
                                         </div>
                                     </div>
                                 );
                             }) : <div className="text-center text-xs text-slate-500 mt-10">No data available</div>}
                         </div>
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
            <button onClick={clearStageCache} className="text-[8px] text-slate-600 hover:text-white uppercase transition-colors">Clear Cache</button>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
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
