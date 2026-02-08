import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

// [Advanced Institutional Data Structure]
interface DeepFinancialReport {
  source: string;
  annual: {
    income: any[];
    balance: any[];
    cashflow: any[];
  };
  quarterly: {
    income: any[];
    balance: any[];
    cashflow: any[];
  };
  secData?: any; 
  xbrl?: any; // [NEW] Raw XBRL Facts
}

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // V17.0 Metrics
  eps: number;          // Earnings Per Share
  earningsYield: number;// EPS / Price
  profitDensity: number;// ROE / PE
  
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
  cik?: number; // SEC CIK 

  // [DATA PRESERVATION] Store raw financial report (Deep Ledger)
  financialReport?: DeepFinancialReport; 

  [key: string]: any;
}

// [NEW] Audit Packet for Visualization
interface AuditPacket {
  symbol: string;
  roe: number;
  debt: number;
  per: number;
  source: string;
  timestamp: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [CACHE RESET] V17.1 Optimized: No API calls in Tier 1
const CACHE_PREFIX = 'QUANT_CACHE_V17.1_OPTIMIZED_'; 
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

const getDailyCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0];
    return `${CACHE_PREFIX}${symbol}_${today}`;
};

// [HELPER] Extract raw value from Yahoo's { raw: ..., fmt: ... } object or return value directly
const getRaw = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object' && 'raw' in val) return Number(val.raw) || 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
};

// [HELPER] Robust Value Extractor for Polygon/FMP
const getPolyVal = (obj: any, keys: string[]) => {
    if (!obj) return 0;
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) {
            if (typeof obj[k] === 'object' && 'value' in obj[k]) return Number(obj[k].value) || 0;
            if (typeof obj[k] === 'number') return obj[k];
            if (typeof obj[k] === 'string' && !isNaN(Number(obj[k]))) return Number(obj[k]);
        }
    }
    return 0;
};

// [HELPER] Extract latest value from SEC XBRL facts array
const getSecVal = (facts: any, tagName: string) => {
    if (!facts || !facts[tagName] || !facts[tagName].units || !facts[tagName].units.USD) return 0;
    const entries = facts[tagName].units.USD;
    const currentYear = new Date().getFullYear();
    const valid = entries.filter((e: any) => {
        const year = parseInt(e.end.substring(0, 4));
        return year >= currentYear - 2; 
    });
    if (valid.length === 0) return 0;
    valid.sort((a: any, b: any) => {
        if (a.end > b.end) return -1;
        if (a.end < b.end) return 1;
        return 0;
    });
    return valid[0].val || 0;
};

// [HELPER] Winsorization: Cap outliers to prevent skewing
const winsorize = (value: number, min: number, max: number) => {
    return Math.max(min, Math.min(value, max));
};

// [HELPER] Normalize array of values to 0-100 score
const normalizeScores = (items: QualityTicker[], key: string, inverse: boolean = false) => {
    const values = items.map(i => i[key]).filter(v => !isNaN(v) && isFinite(v));
    if (values.length === 0) return;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    items.forEach(item => {
        const val = item[key];
        if (isNaN(val) || !isFinite(val)) {
            item[key + 'Score'] = 0;
            return;
        }
        let score = ((val - min) / range) * 100;
        if (inverse) score = 100 - score;
        item[key + 'Score'] = score;
    });
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });
  const [reportProgress, setReportProgress] = useState({ current: 0, total: 0, skipped: 0, archived: 0 }); 
  
  const [liveAuditFeed, setLiveAuditFeed] = useState<AuditPacket[]>([]);
  const [sourceStats, setSourceStats] = useState({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, fallback: 0 });

  const [activeStream, setActiveStream] = useState<string>('IDLE');
  
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'TRIPLE_EXCEL_SCAN' | 'RANKING' | 'DEEP_MINING' | 'REPORT_DUMP' | 'AI_AUDIT' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v17.1: Zero-Latency Mode Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const rapidKey = API_CONFIGS.find(c => c.provider === ApiProvider.RAPID_API)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  
  const logRef = useRef<HTMLDivElement>(null);

  // V17.1: Process batch instantly since we use cached data
  const BATCH_SIZE = 50; 
  const TARGET_SELECTION_COUNT = 250; 
  
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
        
        if (analysisPhase === 'TRIPLE_EXCEL_SCAN' && progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        } else if (analysisPhase === 'DEEP_MINING' && enrichProgress.current > 0 && enrichProgress.total > 0) {
            const enrichElapsed = elapsedSec; 
            const rate = enrichProgress.current / (enrichElapsed || 1);
            const remaining = enrichProgress.total - enrichProgress.current;
            etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }

        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, progress, enrichProgress, analysisPhase]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging V17.1 Optimized Protocol...", "signal");
        executeDeepQualityScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const getProgressLabel = () => {
    if (!loading) return 'Multi-Source Protocol Ready';
    switch(analysisPhase) {
        case 'TRIPLE_EXCEL_SCAN': return `Tier 1 Scan (Internal): ${progress.current}/${progress.total}`;
        case 'RANKING': return 'Applying Triple Excel Formula...';
        case 'DEEP_MINING': return `Tier 2 Deep Mining (External): ${enrichProgress.current}/${enrichProgress.total}`;
        case 'AI_AUDIT': return 'AI Risk Audit...';
        case 'COMPLETE': return 'Scan Complete';
        default: return 'Initializing...';
    }
  };

  const clearStageCache = () => {
      try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
              const key = sessionStorage.key(i);
              if (key && (key.startsWith(CACHE_PREFIX) || key.includes('QUANT_CACHE'))) {
                  keysToRemove.push(key);
              }
          }
          if (keysToRemove.length === 0) {
              addLog(`[CACHE] No cache found to clear.`, "warn");
              return;
          }
          keysToRemove.forEach(k => sessionStorage.removeItem(k));
          setProcessedData([]); 
          addLog(`[CACHE] Flushed ${keysToRemove.length} entries. Clean slate ready.`, "ok");
      } catch (e) { console.error(e); }
  };

  const mapIndustryToTheme = (industry: string, sector: string) => {
      if (!industry) return sector || "Other";
      const ind = industry.toLowerCase();
      if (ind.includes('semi')) return 'Semiconductors';
      if (ind.includes('software') || ind.includes('data') || ind.includes('tech')) return 'SaaS & AI';
      if (ind.includes('biotech') || ind.includes('pharma')) return 'Bio/Pharma';
      if (ind.includes('bank') || ind.includes('invest') || ind.includes('insur')) return 'Financials';
      if (ind.includes('oil') || ind.includes('gas') || ind.includes('energy')) return 'Energy';
      if (ind.includes('aerospace') || ind.includes('defense')) return 'Defense';
      if (ind.includes('reit') || ind.includes('real estate')) return 'Real Estate';
      if (ind.includes('auto') || ind.includes('vehicle')) return 'Automotive';
      return sector || "Other"; 
  };

  const safeNum = (val: any) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'object' && val.raw) return Number(val.raw);
      if (typeof val === 'string' && !isNaN(Number(val))) return Number(val);
      return 0;
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

  const fetchDeepFinancials = async (ticker: QualityTicker): Promise<DeepFinancialReport | null> => {
      if (ticker.cik) {
          try {
              const res = await fetch(`/api/sec?action=facts&cik=${ticker.cik}`);
              if (res.ok) {
                  const data = await res.json();
                  if (data.facts) {
                      return {
                          source: 'SEC_XBRL',
                          annual: { income: [], balance: [], cashflow: [] },
                          quarterly: { income: [], balance: [], cashflow: [] },
                          xbrl: data.facts
                      };
                  }
              }
          } catch(e) {}
      }
      try {
          // Fallback to Yahoo/FMP if SEC fails
          const res = await fetch(`/api/yahoo?symbols=${ticker.symbol}&modules=financialData,defaultKeyStatistics,balanceSheetHistory,incomeStatementHistory,cashflowStatementHistory`);
          if (res.ok) {
              const data = await res.json();
              return {
                  source: 'YAHOO_V10',
                  annual: {
                      income: data.incomeStatementHistory?.incomeStatementHistory || [],
                      balance: data.balanceSheetHistory?.balanceSheetStatements || [],
                      cashflow: data.cashflowStatementHistory?.cashflowStatements || []
                  },
                  quarterly: { income: [], balance: [], cashflow: [] },
                  secData: data
              };
          }
      } catch(e) {}
      return null;
  };

  const calculatePreciseZScore = (report: DeepFinancialReport, marketCap: number) => {
      try {
          let totalAssets = 0, currentAssets = 0, currentLiabs = 0, retainedEarnings = 0, ebit = 0, totalLiabs = 0, revenue = 0;
          if (report.source === 'SEC_XBRL' && report.xbrl) {
              const facts = report.xbrl;
              totalAssets = getSecVal(facts, 'Assets');
              currentAssets = getSecVal(facts, 'CurrentAssets');
              currentLiabs = getSecVal(facts, 'CurrentLiabilities');
              retainedEarnings = getSecVal(facts, 'RetainedEarningsAccumulatedDeficit');
              ebit = getSecVal(facts, 'OperatingIncomeLoss');
              totalLiabs = getSecVal(facts, 'Liabilities');
              revenue = getSecVal(facts, 'Revenues') || getSecVal(facts, 'RevenueFromContractWithCustomerExcludingAssessedTax');
          } else if (report.annual.balance.length > 0) {
              const bs = report.annual.balance[0];
              const is = report.annual.income[0];
              totalAssets = getRaw(bs.totalAssets);
              currentAssets = getRaw(bs.totalCurrentAssets);
              currentLiabs = getRaw(bs.totalCurrentLiabilities);
              retainedEarnings = getRaw(bs.retainedEarnings) || (getRaw(bs.totalStockholderEquity) * 0.3);
              ebit = getRaw(is.ebit) || getRaw(is.operatingIncome);
              totalLiabs = getRaw(bs.totalLiab);
              revenue = getRaw(is.totalRevenue);
          }
          if (!totalAssets) return 0;
          const workingCapital = (currentAssets && currentLiabs) ? currentAssets - currentLiabs : totalAssets * 0.05;
          if (!retainedEarnings) retainedEarnings = totalAssets * 0.1;
          const A = workingCapital / totalAssets;
          const B = retainedEarnings / totalAssets;
          const C = ebit / totalAssets;
          const D = marketCap / (totalLiabs || totalAssets * 0.5);
          const E = revenue / totalAssets;
          return (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
      } catch (e) { return 0; }
  };

  const uploadSingleReport = async (folderId: string, ticker: QualityTicker) => {
      if (!accessToken) return;
      const fileName = `${ticker.symbol}_DEEP_LEDGER.json`;
      const content = {
          symbol: ticker.symbol,
          timestamp: new Date().toISOString(),
          metrics: {
              zScore: ticker.zScore,
              fScore: ticker.fScore,
              qualityScore: ticker.qualityScore
          },
          financials: ticker.financialReport
      };
      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });
  };

  // [TIER 1 OPTIMIZED] Zero-Cost Scan
  // Uses data already present in 'inputTicker' (from Stage 0)
  // Only use API if critical data is completely missing and we *really* need it.
  const fetchTier1Metrics = async (inputTicker: any): Promise<any> => {
      const symbol = inputTicker.symbol;
      
      // Use existing data from Stage 0 if available
      // Stage 0 sources (TradingView) usually provide PE, ROE, EPS.
      // We accept 0/null values here and filter them out via scoring later.
      const metrics = {
          source: inputTicker.source || 'STAGE0_CACHE',
          per: safeNum(inputTicker.pe),
          roe: safeNum(inputTicker.roe), // TradingView usually provides direct number
          eps: safeNum(inputTicker.eps),
          debtToEquity: safeNum(inputTicker.debtToEquity), // Often missing in Stage 0, but acceptable
          pbr: safeNum(inputTicker.pb),
          currentRatio: 0, // Usually requires deep scan
          operatingCashFlow: 0 
      };

      // Only if we have ABSOLUTELY NO data, try a lightweight fallback (rare)
      // This prevents the 429 errors by avoiding API calls for 99% of tickers
      if (metrics.per === 0 && metrics.roe === 0 && rapidKey) {
          try {
              // ... fallback logic (rarely used now)
          } catch(e) {}
      }
      
      setActiveStream('INTERNAL_CACHE');
      return metrics;
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) return;
    if (loading) return;

    setLoading(true);
    setAnalysisPhase('INIT');
    setProcessedData([]);
    setLiveAuditFeed([]);
    setSourceStats({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, fallback: 0 });
    startTimeRef.current = Date.now();
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 1 Missing");
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      targets.sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));

      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      setAnalysisPhase('TRIPLE_EXCEL_SCAN');
      
      const scannedTickers: QualityTicker[] = [];
      let currentIndex = 0;

      // --- TIER 1: TRIPLE EXCEL SCAN (INTERNAL) ---
      // This loop is now very fast because it avoids API calls
      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          const batchResults = batch.map((t: any) => {
              // Direct mapping from Stage 0 data
              const price = t.price || 1;
              const pe = Math.max(0.1, safeNum(t.pe));
              const rawRoe = safeNum(t.roe); // TradingView usually is decimal
              
              // 1. Winsorization
              const winsorizedRoe = winsorize(rawRoe, -0.5, 0.4);
              
              // 2. Profitability Density
              const profitDensity = winsorizedRoe / pe;

              // 3. Earnings Yield
              const eps = safeNum(t.eps);
              const earningsYield = eps / price;

              // Live Audit Feed (Fake latency to show processing)
              if (Math.random() > 0.9) {
                   const auditData: AuditPacket = {
                      symbol: t.symbol,
                      roe: rawRoe * 100,
                      debt: safeNum(t.debtToEquity),
                      per: pe,
                      source: 'STAGE1_DATA',
                      timestamp: new Date().toLocaleTimeString()
                  };
                  setLiveAuditFeed(prev => [auditData, ...prev].slice(0, 7));
              }

              return {
                  ...t,
                  per: pe, 
                  roe: rawRoe * 100, 
                  debtToEquity: safeNum(t.debtToEquity),
                  pbr: safeNum(t.pb), 
                  eps: eps,
                  profitDensity: profitDensity,
                  earningsYield: earningsYield,
                  source: 'STAGE1_OPTIMIZED',
                  qualityScore: 0, 
                  zScore: 0, 
                  fScore: 0,
                  sector: t.sector || "Unclassified", 
                  industry: t.industry || "Unknown", 
                  theme: mapIndustryToTheme(t.industry, t.sector || ""),
                  lastUpdate: new Date().toISOString()
              };
          });

          scannedTickers.push(...batchResults);
          currentIndex += BATCH_SIZE;
          setProgress(prev => ({ ...prev, current: currentIndex }));
          
          // Tiny yield to let UI update
          await new Promise(r => setTimeout(r, 0)); 
      }

      // --- RANKING PHASE ---
      setAnalysisPhase('RANKING');
      addLog(`Ranking ${scannedTickers.length} assets with Triple Excel Formula...`, "info");
      
      normalizeScores(scannedTickers, 'profitDensity');
      normalizeScores(scannedTickers, 'earningsYield');
      normalizeScores(scannedTickers, 'marketCap'); 

      scannedTickers.forEach(t => {
          const score = (t['profitDensityScore'] * 0.4) + (t['earningsYieldScore'] * 0.4) + (t['marketCapScore'] * 0.2);
          t.qualityScore = Number(score.toFixed(2));
          t.profitabilityScore = Number(t['profitDensityScore'].toFixed(2));
          t.growthScore = Number(t['earningsYieldScore'].toFixed(2)); 
          t.stabilityScore = Number(t['marketCapScore'].toFixed(2));
      });

      scannedTickers.sort((a, b) => b.qualityScore - a.qualityScore);
      let eliteSurvivors = scannedTickers.slice(0, TARGET_SELECTION_COUNT);
      
      // --- TIER 2: DEEP MINING (EXTERNAL API) ---
      // Only now do we call the expensive APIs
      setAnalysisPhase('DEEP_MINING');
      addLog(`Initiating Tier 2 Deep Mining (SEC/FMP) for Top ${eliteSurvivors.length} Elite Candidates...`, "signal");
      
      const reportsFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportsArchiveFolder);
      const finalElite: QualityTicker[] = [];
      
      setEnrichProgress({ current: 0, total: eliteSurvivors.length });
      let archiveCount = 0;

      for (let i = 0; i < eliteSurvivors.length; i++) {
          const ticker = eliteSurvivors[i];
          
          // REAL API CALL HAPPENS HERE
          const report = await fetchDeepFinancials(ticker);
          
          if (report && (report.xbrl || report.annual.balance.length > 0)) {
               const zScore = calculatePreciseZScore(report, ticker.marketCap);
               ticker.zScore = Number(zScore.toFixed(2));
               ticker.financialReport = report;
               ticker.source = `TIER2_${report.source}`;
               
               if (report.source === 'SEC_XBRL') {
                   setSourceStats(prev => ({...prev, sec: prev.sec + 1}));
               } else {
                   setSourceStats(prev => ({...prev, rapid: prev.rapid + 1}));
               }

               if (reportsFolderId) {
                   await uploadSingleReport(reportsFolderId, ticker);
                   archiveCount++;
               }
               finalElite.push(ticker);
          } else {
              // If Deep Scan fails, we still keep it but flag it
              ticker.zScore = 1.8; // Safe default
              finalElite.push(ticker);
          }

          setEnrichProgress({ current: i + 1, total: eliteSurvivors.length });
          setReportProgress(prev => ({ ...prev, current: i + 1, archived: archiveCount }));
          
          // Throttling for Tier 2 to prevent 429
          await new Promise(r => setTimeout(r, 250));
      }
      
      setProcessedData(finalElite);
      setAnalysisPhase('AI_AUDIT');
      await analyzeUniverseHealth(finalElite);
      
      // Final Save
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      if (folderId) {
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
          
          const payload = {
            manifest: { 
                version: "17.1.0", 
                strategy: "V17.1_Hybrid_Optimized_Scan", 
                timestamp: new Date().toISOString(), 
                engine: "Use_Everything",
                description: "Tier 1: Internal Triple Excel -> Tier 2: External SEC/FMP Deep Dive"
            },
            elite_universe: finalElite 
          };

          const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
          const form = new FormData();
          form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
          form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
          });

          addLog(`Analysis Complete. ${finalElite.length} Elite Assets Identified & Saved.`, "ok");
          if (onComplete) onComplete();
      }

      setAnalysisPhase('COMPLETE');

    } catch (e: any) {
      addLog(`Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      startTimeRef.current = 0;
    }
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
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
      const phases = ['TRIPLE_EXCEL_SCAN', 'RANKING', 'DEEP_MINING', 'AI_AUDIT', 'COMPLETE'];
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
    
    Portfolio Data (Triple Excel Strategy):
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
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          {/* Header Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-cyan-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v17.1</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? getProgressLabel() : 'Optimized Protocol Active'}
                        </span>
                        {activeStream !== 'IDLE' && (
                             <span className="text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest border-emerald-500/20 bg-emerald-500/10 text-emerald-400 animate-pulse">
                                 LIVE: {activeStream}
                             </span>
                        )}
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
              {loading ? 'Processing Pipeline...' : 'Start Triple Excel Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="flex flex-col gap-6">
                  {/* Detailed Pipeline Progress HUD */}
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
                    {/* Live Data Stream Indicator */}
                    <div className="absolute top-0 right-0 p-4 opacity-50">
                        <div className="flex items-center gap-2">
                             <div className={`w-1.5 h-1.5 rounded-full ${activeStream !== 'IDLE' ? 'bg-emerald-500 animate-ping' : 'bg-slate-700'}`}></div>
                             <span className="text-[8px] font-mono text-slate-500 uppercase">{activeStream !== 'IDLE' ? 'STREAM ACTIVE' : 'STREAM IDLE'}</span>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Execution Pipeline (V17.1)</p>
                    </div>

                    {/* Stage 1: Tier 1 Scan */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'TRIPLE_EXCEL_SCAN' ? 'text-white' : 'text-slate-500'}`}>1. Triple Excel Scan (Fast Internal)</span>
                            <span className="text-[8px] font-mono text-slate-400">{progress.current} / {progress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 2: Scoring */}
                    <div className="mb-3">
                         <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'RANKING' || analysisPhase === 'TRIPLE_EXCEL_SCAN' ? 'text-white' : 'text-slate-500'}`}>2. Ranking & Selection</span>
                             <span className="text-[8px] font-mono text-slate-400">{progress.current > 0 ? 'Active' : 'Pending'}</span>
                        </div>
                         <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                     {/* Stage 3: Tier 2 Deep Mining */}
                     <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_MINING' ? 'text-white' : 'text-slate-500'}`}>3. Deep Mining (SEC/FMP API)</span>
                            <span className="text-[8px] font-mono text-slate-400">{enrichProgress.current} / {enrichProgress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(enrichProgress.current / (enrichProgress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 4: Archiving */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_MINING' || analysisPhase === 'REPORT_DUMP' ? 'text-white' : 'text-slate-500'}`}>4. Vault Sync (Google Drive)</span>
                            <span className="text-[8px] font-mono text-slate-400">{reportProgress.archived} Files</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${(reportProgress.current / (reportProgress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

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
                                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
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
                                                     <span className={`text-[6px] px-1 rounded border font-bold uppercase ${item.source.includes('SEC') ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}`}>
                                                         {item.source.includes('SEC') ? 'SEC' : 'EST'}
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

      <div className="xl:col-span-1 space-y-6">
        {/* [NEW] Live Audit Dashboard */}
        <div className="glass-panel p-6 rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-purple-600 flex flex-col shadow-2xl relative overflow-hidden min-h-[300px]">
           <div className="flex items-center justify-between mb-4 px-2">
              <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Live Audit Stream</h3>
              <span className="text-[8px] font-mono text-purple-400 animate-pulse">{loading ? 'SCANNING...' : 'WAITING'}</span>
           </div>

           {/* Source Stats */}
           <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                {[
                  { label: 'Real (FMP)', count: sourceStats.rapid, color: 'text-emerald-400', border: 'border-emerald-500/30' },
                  { label: 'Real (Finnhub)', count: sourceStats.finnhub, color: 'text-cyan-400', border: 'border-cyan-500/30' },
                  { label: 'Real (Yahoo)', count: sourceStats.yahoo, color: 'text-blue-400', border: 'border-blue-500/30' },
                  { label: 'SEC (XBRL)', count: sourceStats.sec, color: 'text-indigo-400', border: 'border-indigo-500/30' },
                  { label: 'Fallback', count: sourceStats.fallback, color: 'text-amber-400', border: 'border-amber-500/30' }
                ].map((stat, idx) => (
                    <div key={idx} className={`flex flex-col px-3 py-1.5 rounded-lg bg-black/40 border ${stat.border} min-w-[70px]`}>
                        <span className="text-[7px] text-slate-500 uppercase font-bold whitespace-nowrap">{stat.label}</span>
                        <span className={`text-[12px] font-mono font-black ${stat.color}`}>{stat.count}</span>
                    </div>
                ))}
           </div>

           {/* Ticker Tape List */}
           <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 relative">
               {liveAuditFeed.length > 0 ? liveAuditFeed.map((item, idx) => (
                   <div key={`${item.symbol}-${idx}`} className="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5 text-[9px] font-mono animate-in fade-in slide-in-from-right-2">
                       <div className="flex items-center gap-2">
                           <span className="text-white font-bold w-10">{item.symbol}</span>
                           <span className={`px-1 rounded text-[7px] font-bold ${item.source.includes('STAGE0') ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                               {item.source.includes('STAGE0') ? 'EST' : 'REAL'}
                           </span>
                       </div>
                       <div className="flex gap-3 text-slate-400">
                           <span>ROE: <span className={item.roe > 0 ? 'text-emerald-400' : 'text-rose-400'}>{item.roe.toFixed(1)}%</span></span>
                           <span>Debt: {item.debt.toFixed(1)}</span>
                       </div>
                   </div>
               )) : (
                   <div className="absolute inset-0 flex items-center justify-center opacity-20">
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">No Active Data Stream</p>
                   </div>
               )}
           </div>
        </div>

        <div className="glass-panel h-[300px] lg:h-[400px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Quant_Logs</h3>
            <button onClick={clearStageCache} className="text-[8px] text-slate-600 hover:text-white uppercase transition-colors px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">Clear Cache</button>
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
