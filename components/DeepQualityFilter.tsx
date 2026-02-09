
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
  msnData?: any; // [NEW] MSN Raw Data
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
  sectorRelativeVal: number; // Sector Neutral Value
  
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

// [NEW] Audit Packet for Visualization (Dual Stage Support)
interface AuditPacket {
  symbol: string;
  stage: 'TIER1' | 'TIER2'; // Scan vs Deep Dive
  data1: number; // T1: ROE, T2: Z-Score
  data2: number; // T1: PE, T2: F-Score
  source: string;
  timestamp: string;
  status: 'OK' | 'WARN' | 'FAIL'; // Visual Indicator
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [CACHE RESET] V17.2 Upgrade: Deep Mining & Sector Neutrality
const CACHE_PREFIX = 'QUANT_CACHE_V17.3_MSN_'; 
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

// [HELPER] Extract raw value from Yahoo's { raw: ..., fmt: ... } object or return value directly
const getRaw = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object' && 'raw' in val) return Number(val.raw) || 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
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
  const [sourceStats, setSourceStats] = useState({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, msn: 0, fallback: 0 });
  const [filterSource, setFilterSource] = useState<string | null>(null);

  const [activeStream, setActiveStream] = useState<string>('IDLE');
  
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'TRIPLE_EXCEL_SCAN' | 'RANKING' | 'DEEP_MINING' | 'SECTOR_NEUTRAL' | 'FINAL_FILTER' | 'REPORT_DUMP' | 'AI_AUDIT' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v17.3: MSN Money Data-Healing Protocol Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  
  const logRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // V17.3: Optimized Batch Sizes for Deep Scan
  const BATCH_SIZE_TIER1 = 100; // Fast scan for Stage 1 data
  const TARGET_TIER2_COUNT = 300; // Deep dive candidates (Increased for better healing)
  const FINAL_SELECTION_COUNT = 150; // Final output
  
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Auto-scroll the live audit feed when not hovered
  useEffect(() => {
    if (listRef.current && liveAuditFeed.length > 0) {
       listRef.current.scrollTop = 0; // Scroll to top to see newest
    }
  }, [liveAuditFeed]);

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
        addLog("AUTO-PILOT: Engaging V17.3 Deep Quality Protocol...", "signal");
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
        case 'RANKING': return 'Triple Excel Ranking...';
        case 'DEEP_MINING': return `Tier 2 Deep Mining (MSN/SEC): ${enrichProgress.current}/${enrichProgress.total}`;
        case 'SECTOR_NEUTRAL': return 'Calculating Sector Neutral Scores...';
        case 'FINAL_FILTER': return `Final Selection (Top ${FINAL_SELECTION_COUNT})...`;
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

  const fetchDeepFinancials = async (ticker: QualityTicker): Promise<DeepFinancialReport | null> => {
      // 1. Try MSN Money (High Quality, No Key)
      try {
          const res = await fetch(`/api/msn?symbol=${ticker.symbol}&type=overview`);
          if (res.ok) {
              const data = await res.json();
              if (data && data.keyStats) {
                   // Adapt MSN data to our structure
                   return {
                       source: 'MSN_MONEY',
                       annual: { income: [], balance: [], cashflow: [] },
                       quarterly: { income: [], balance: [], cashflow: [] },
                       msnData: data
                   };
              }
          }
      } catch(e) {}

      // 2. Prioritize SEC XBRL if CIK is available
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

      // 3. Fallback to Yahoo
      try {
          const modules = "financialData,defaultKeyStatistics,balanceSheetHistory,incomeStatementHistory,cashflowStatementHistory,earningsTrend";
          const res = await fetch(`/api/yahoo?symbols=${ticker.symbol}&modules=${modules}`);
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

  const calculatePiotroskiFScore = (report: DeepFinancialReport): number => {
    let score = 0;
    try {
        if (report.source === 'MSN_MONEY' && report.msnData) {
            // MSN simplified F-Score calc
            const stats = report.msnData.keyStats;
            if (stats.returnOnEquity > 0) score += 2;
            if (stats.returnOnAssets > 0) score += 2;
            if (stats.profitMargin > 5) score += 2;
            if (stats.revenueGrowth > 0) score += 1;
            if (stats.debtToEquity < 100) score += 1;
            return Math.min(9, score); // Cap at 9
        }

        const inc = report.annual.income;
        const bal = report.annual.balance;
        const cf = report.annual.cashflow;
        
        if (inc.length < 2 || bal.length < 2 || cf.length < 1) return 5; 

        // Data Helpers
        const getVal = (arr: any[], idx: number, key: string) => getRaw(arr[idx]?.[key]);
        
        // 1. Profitability
        const netIncome = getVal(inc, 0, 'netIncome');
        const totalAssets = getVal(bal, 0, 'totalAssets');
        const prevAssets = getVal(bal, 1, 'totalAssets');
        const roa = totalAssets ? netIncome / totalAssets : 0;
        const cfo = getVal(cf, 0, 'totalCashFromOperatingActivities');
        
        if (netIncome > 0) score++;
        if (cfo > 0) score++;
        
        const prevNetIncome = getVal(inc, 1, 'netIncome');
        const prevRoa = prevAssets ? prevNetIncome / prevAssets : 0;
        if (roa > prevRoa) score++;
        
        if (cfo > netIncome) score++;

        // 2. Leverage/Liquidity
        const longTermDebt = getVal(bal, 0, 'longTermDebt');
        const prevLongTermDebt = getVal(bal, 1, 'longTermDebt');
        if (longTermDebt < prevLongTermDebt) score++;
        
        const currentRatio = getVal(bal, 0, 'totalCurrentAssets') / (getVal(bal, 0, 'totalCurrentLiabilities') || 1);
        const prevCurrentRatio = getVal(bal, 1, 'totalCurrentAssets') / (getVal(bal, 1, 'totalCurrentLiabilities') || 1);
        if (currentRatio > prevCurrentRatio) score++;
        
        score++; 

        // 3. Operating Efficiency
        const grossProfit = getVal(inc, 0, 'grossProfit');
        const revenue = getVal(inc, 0, 'totalRevenue');
        const grossMargin = revenue ? grossProfit / revenue : 0;
        
        const prevGrossProfit = getVal(inc, 1, 'grossProfit');
        const prevRevenue = getVal(inc, 1, 'totalRevenue');
        const prevGrossMargin = prevRevenue ? prevGrossProfit / prevRevenue : 0;
        if (grossMargin > prevGrossMargin) score++;
        
        const assetTurnover = revenue / ((totalAssets + prevAssets)/2 || 1);
        const prevAssetTurnover = prevRevenue / ((prevAssets + getVal(bal, 2, 'totalAssets') || prevAssets)/2 || 1); 
        if (assetTurnover > prevAssetTurnover) score++;
        
    } catch (e) {
        return 5;
    }
    return score;
  };

  const calculatePreciseZScore = (report: DeepFinancialReport, marketCap: number) => {
      try {
          if (report.source === 'MSN_MONEY' && report.msnData) {
              // MSN Proxy Z-Score
              const stats = report.msnData.keyStats;
              let z = 1.0;
              if (stats.totalDebtToEquity < 50) z += 1.5;
              if (stats.currentRatio > 1.5) z += 0.5;
              if (stats.returnOnAssets > 5) z += 1.0;
              if (stats.profitMargin > 10) z += 0.5;
              return z;
          }

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

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
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

  const executeDeepQualityScan = async () => {
    if (!accessToken) return;
    if (loading) return;

    setLoading(true);
    setAnalysisPhase('INIT');
    setProcessedData([]);
    setLiveAuditFeed([]);
    setSourceStats({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, msn: 0, fallback: 0 });
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
      
      // [DATA HEALING: Volume-Priority Mode]
      const isPolygonSource = targets[0]?.source?.includes("Polygon") || false;
      const hasFundamentals = targets.some((t: any) => t.roe !== undefined || t.pe !== undefined);
      
      if (!hasFundamentals || isPolygonSource) {
          addLog("⚠️ Source Data lacks Fundamentals (Polygon/SEC). Switching to Volume-Priority Mode.", "warn");
          targets.sort((a: any, b: any) => ((b.price * b.volume) || 0) - ((a.price * a.volume) || 0));
      }

      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      setAnalysisPhase('TRIPLE_EXCEL_SCAN');
      
      const scannedTickers: QualityTicker[] = [];
      let currentIndex = 0;

      // --- TIER 1: TRIPLE EXCEL SCAN ---
      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE_TIER1);
          
          const batchResults = batch.map((t: any) => {
              const price = t.price || 1;
              const pe = Math.max(0.1, safeNum(t.pe));
              const rawRoe = safeNum(t.roe); 
              
              const winsorizedRoe = winsorize(rawRoe, -0.5, 0.4);
              const profitDensity = winsorizedRoe / pe;
              const eps = safeNum(t.eps);
              const earningsYield = eps / price;
              const pbr = safeNum(t.pb) || safeNum(t.pbr) || 0;
              const debt = safeNum(t.debtToEquity) || 0;

              return {
                  ...t,
                  per: pe, 
                  roe: rawRoe * 100, 
                  debtToEquity: debt,
                  pbr: pbr, 
                  eps: eps,
                  profitDensity: profitDensity,
                  earningsYield: earningsYield,
                  source: t.source || 'STAGE1_OPTIMIZED',
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
          currentIndex += BATCH_SIZE_TIER1;
          setProgress(prev => ({ ...prev, current: currentIndex }));
          
          await new Promise(r => setTimeout(r, 0)); 
      }

      // --- RANKING PHASE ---
      setAnalysisPhase('RANKING');
      
      if (hasFundamentals && !isPolygonSource) {
          addLog(`Tier 1 Scanned: ${scannedTickers.length} assets. Calculating Triple Excel Ranks...`, "info");
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
      } else {
          addLog(`Data Gap Detected. Prioritizing Top ${TARGET_TIER2_COUNT} Liquid Assets for Deep Mining (Data Healing).`, "info");
          scannedTickers.forEach((t, idx) => {
               t.qualityScore = 100 - (idx / scannedTickers.length) * 100;
          });
      }

      let eliteSurvivors = scannedTickers.slice(0, TARGET_TIER2_COUNT);
      
      // --- TIER 2: DEEP MINING (MSN + SEC) ---
      setAnalysisPhase('DEEP_MINING');
      addLog(`Initiating Tier 2 Deep Mining for Top ${eliteSurvivors.length} Candidates...`, "signal");
      
      const reportsFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportsArchiveFolder);
      const finalCandidates: QualityTicker[] = [];
      
      setEnrichProgress({ current: 0, total: eliteSurvivors.length });
      let archiveCount = 0;

      for (let i = 0; i < eliteSurvivors.length; i++) {
          const ticker = eliteSurvivors[i];
          let status: 'OK' | 'WARN' | 'FAIL' = 'OK';
          
          // FETCH DEEP DATA
          const report = await fetchDeepFinancials(ticker);
          
          if (report) {
               // [DATA HEALING] Populate missing fields using MSN or SEC data
               if (report.source === 'MSN_MONEY' && report.msnData && report.msnData.keyStats) {
                   const stats = report.msnData.keyStats;
                   if (!ticker.roe) ticker.roe = stats.returnOnEquity || 0;
                   if (!ticker.per) ticker.per = stats.peRatio || 0;
                   if (!ticker.pbr) ticker.pbr = stats.priceToBook || 0;
                   if (!ticker.debtToEquity) ticker.debtToEquity = stats.totalDebtToEquity || 0;
                   if (ticker.sector === "Unclassified" && report.msnData.sector) ticker.sector = report.msnData.sector;
                   
                   setSourceStats(prev => ({...prev, msn: prev.msn + 1}));
               }
               else if (report.source === 'SEC_XBRL' || report.source === 'YAHOO_V10') {
                    if (!ticker.roe && report.annual.income.length > 0 && report.annual.balance.length > 0) {
                        const netInc = getRaw(report.annual.income[0].netIncome);
                        const equity = getRaw(report.annual.balance[0].totalStockholderEquity);
                        if (equity) ticker.roe = (netInc / equity) * 100;
                    }
                    if (!ticker.per && ticker.eps && ticker.price) {
                        ticker.per = ticker.price / ticker.eps;
                    }
                    if (report.source === 'SEC_XBRL') setSourceStats(prev => ({...prev, sec: prev.sec + 1}));
                    else setSourceStats(prev => ({...prev, yahoo: prev.yahoo + 1}));
               }

               // 1. Z-Score
               const zScore = calculatePreciseZScore(report, ticker.marketCap);
               
               // 2. F-Score (Piotroski)
               const fScore = calculatePiotroskiFScore(report);

               ticker.zScore = Number(zScore.toFixed(2));
               ticker.fScore = fScore;
               ticker.financialReport = report;
               ticker.source = `TIER2_${report.source}`;

               if (reportsFolderId) {
                   await uploadSingleReport(reportsFolderId, ticker);
                   archiveCount++;
               }
               
               finalCandidates.push(ticker);
          } else {
              // Fallback Logic
              const debt = ticker.debtToEquity || 0;
              const currentR = ticker.currentRatio || 1.5;
              let approxZ = 1.6; 
              if (debt < 0.5) approxZ += 1.0;
              if (currentR > 2.0) approxZ += 0.5;
              if (ticker.marketCap > 10000000000) approxZ += 0.5; 
              
              let approxF = 4;
              if (ticker.roe > 0) approxF += 2; 
              if (ticker.pbr < 3) approxF += 1;
              if (ticker.change > 0) approxF += 1;

              ticker.zScore = Number(approxZ.toFixed(2)); 
              ticker.fScore = approxF;
              ticker.source = 'TIER2_SNAPSHOT_FUSION'; 
              
              status = 'OK';
              setSourceStats(prev => ({...prev, fallback: prev.fallback + 1}));
              finalCandidates.push(ticker);
          }
          
           // Live Audit Feed
           const auditData: AuditPacket = {
               symbol: ticker.symbol,
               stage: 'TIER2',
               data1: ticker.zScore,
               data2: ticker.fScore,
               source: ticker.source,
               timestamp: new Date().toLocaleTimeString(),
               status: status
           };
           setLiveAuditFeed(prev => [auditData, ...prev].slice(0, 100)); 

          setEnrichProgress({ current: i + 1, total: eliteSurvivors.length });
          setReportProgress(prev => ({ ...prev, current: i + 1, archived: archiveCount }));
          
          await new Promise(r => setTimeout(r, 200));
      }

      // --- SECTOR NEUTRALITY & FINAL FILTER ---
      setAnalysisPhase('SECTOR_NEUTRAL');
      addLog("Calculating Sector Neutral Value Scores...", "info");
      
      const sectorStats: Record<string, { peSum: number, pbSum: number, count: number }> = {};
      finalCandidates.forEach(t => {
          if(!sectorStats[t.sector]) sectorStats[t.sector] = { peSum: 0, pbSum: 0, count: 0 };
          sectorStats[t.sector].peSum += t.per;
          sectorStats[t.sector].pbSum += t.pbr;
          sectorStats[t.sector].count++;
      });
      
      const sectorMedians: Record<string, { pe: number, pb: number }> = {};
      Object.keys(sectorStats).forEach(s => {
          sectorMedians[s] = {
              pe: sectorStats[s].peSum / sectorStats[s].count,
              pb: sectorStats[s].pbSum / sectorStats[s].count
          };
      });

      finalCandidates.forEach(t => {
          const med = sectorMedians[t.sector];
          let relScore = 50;
          if (med && t.per > 0 && t.pbr > 0) {
              const peRel = med.pe / t.per;
              const pbRel = med.pb / t.pbr;
              relScore = Math.min(100, (peRel * 50 + pbRel * 50));
          }
          t.sectorRelativeVal = Number(relScore.toFixed(2));
          
          const fScoreNorm = (t.fScore / 9) * 100;
          const zScoreNorm = Math.min(100, Math.max(0, (t.zScore / 5) * 100));
          
          // Re-calculate Final Quality Score using enriched data
          t.qualityScore = Number(((t.qualityScore * 0.3) + (fScoreNorm * 0.2) + (zScoreNorm * 0.2) + (t.sectorRelativeVal * 0.3)).toFixed(2));
      });

      // Cut to Top 150
      setAnalysisPhase('FINAL_FILTER');
      finalCandidates.sort((a, b) => b.qualityScore - a.qualityScore);
      const finalElite = finalCandidates.slice(0, FINAL_SELECTION_COUNT);

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
                version: "17.3.0", 
                strategy: "V17.3_MSN_Deep_Healing", 
                timestamp: new Date().toISOString(), 
                engine: "Use_Everything_With_MSN",
                description: "Tier 1: Triple Excel -> Tier 2: MSN/SEC Data Healing -> F-Score/Z-Score"
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

  // Filtered Audit Feed based on selected source
  const filteredAuditFeed = useMemo(() => {
      if (!filterSource) return liveAuditFeed;
      return liveAuditFeed.filter(item => item.source.toLowerCase().includes(filterSource.toLowerCase()));
  }, [liveAuditFeed, filterSource]);

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
      const phases = ['TRIPLE_EXCEL_SCAN', 'RANKING', 'DEEP_MINING', 'SECTOR_NEUTRAL', 'FINAL_FILTER', 'AI_AUDIT', 'COMPLETE'];
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
    
    Portfolio Data (Triple Excel + Deep Quality Strategy):
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v17.3</h2>
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
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Execution Pipeline (V17.3)</p>
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

                    {/* Stage 2: Tier 2 Deep Mining */}
                    <div className="mb-3">
                         <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_MINING' || analysisPhase === 'SECTOR_NEUTRAL' ? 'text-white' : 'text-slate-500'}`}>2. Tier 2 Deep Mining (MSN/SEC)</span>
                             <span className="text-[8px] font-mono text-slate-400">{enrichProgress.current} / {enrichProgress.total}</span>
                        </div>
                         <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(enrichProgress.current / (enrichProgress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                     {/* Stage 3: Sector & Final */}
                     <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'FINAL_FILTER' || analysisPhase === 'AI_AUDIT' ? 'text-white' : 'text-slate-500'}`}>3. Sector Neutrality & Final Filter</span>
                            <span className="text-[8px] font-mono text-slate-400">{analysisPhase === 'FINAL_FILTER' ? 'Filtering...' : 'Pending'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${analysisPhase === 'FINAL_FILTER' || analysisPhase === 'COMPLETE' ? 100 : 0}%` }}></div>
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
                             {/* [FIXED] Explicit BACK button */}
                             <button onClick={() => setSelectedTheme(null)} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[9px] font-black uppercase border border-slate-600 hover:bg-slate-700 transition-colors flex items-center gap-2">
                                 ← BACK TO MAP
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
                                                     <span className={`text-[6px] px-1 rounded border font-bold uppercase ${item.source.includes('SEC') ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30' : item.source.includes('MSN') ? 'bg-indigo-500/20 text-indigo-500 border-indigo-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}`}>
                                                         {item.source.includes('SEC') ? 'SEC' : item.source.includes('MSN') ? 'MSN' : 'EST'}
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
                  { id: 'fmp', label: 'Real (FMP)', count: sourceStats.rapid, color: 'text-emerald-400', border: 'border-emerald-500/30' },
                  { id: 'finnhub', label: 'Real (Finnhub)', count: sourceStats.finnhub, color: 'text-cyan-400', border: 'border-cyan-500/30' },
                  { id: 'msn', label: 'MSN (Proxy)', count: sourceStats.msn, color: 'text-fuchsia-400', border: 'border-fuchsia-500/30' },
                  { id: 'yahoo', label: 'Real (Yahoo)', count: sourceStats.yahoo, color: 'text-blue-400', border: 'border-blue-500/30' },
                  { id: 'sec', label: 'SEC (XBRL)', count: sourceStats.sec, color: 'text-indigo-400', border: 'border-indigo-500/30' },
                  { id: 'fallback', label: 'Fallback', count: sourceStats.fallback, color: 'text-amber-400', border: 'border-amber-500/30' }
                ].map((stat, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => setFilterSource(filterSource === stat.id ? null : stat.id)}
                        className={`flex flex-col px-3 py-1.5 rounded-lg bg-black/40 border cursor-pointer hover:bg-white/5 transition-colors min-w-[70px] ${stat.border} ${filterSource === stat.id ? 'bg-white/10 ring-1 ring-white/30' : ''}`}
                    >
                        <span className="text-[7px] text-slate-500 uppercase font-bold whitespace-nowrap">{stat.label}</span>
                        <span className={`text-[12px] font-mono font-black ${stat.color}`}>{stat.count}</span>
                    </div>
                ))}
           </div>

           {/* Ticker Tape List */}
           <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-2 relative max-h-[400px]">
               {filteredAuditFeed.length > 0 ? filteredAuditFeed.map((item, idx) => (
                   <div key={`${item.symbol}-${idx}`} className="flex justify-between items-center p-2 rounded-lg bg-white/5 border border-white/5 text-[9px] font-mono animate-in fade-in slide-in-from-right-2 hover:bg-white/10 transition-colors">
                       <div className="flex items-center gap-2">
                           <span className="text-white font-bold w-10">{item.symbol}</span>
                           <span className={`px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-wider ${
                               item.stage === 'TIER2' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                           }`}>
                               {item.stage === 'TIER2' ? 'DEEP' : 'SCAN'}
                           </span>
                       </div>
                       <div className="flex items-center gap-3">
                           {item.stage === 'TIER1' ? (
                               <div className="flex gap-3 text-slate-400">
                                   <span>ROE: <span className={item.data1 > 15 ? 'text-emerald-400' : 'text-slate-400'}>{item.data1.toFixed(1)}%</span></span>
                                   <span>PE: {item.data2.toFixed(1)}</span>
                               </div>
                           ) : (
                               <div className="flex gap-3 text-slate-400">
                                   <span>Z: <span className={item.data1 > 2.99 ? 'text-emerald-400' : item.data1 < 1.8 ? 'text-rose-400' : 'text-amber-400'}>{item.data1.toFixed(2)}</span></span>
                                   <span>F: <span className={item.data2 >= 7 ? 'text-blue-400' : 'text-slate-400'}>{item.data2}</span></span>
                               </div>
                           )}
                           <span className={`text-[6px] uppercase opacity-50 w-8 text-right ${item.status === 'WARN' ? 'text-amber-500' : 'text-slate-600'}`}>
                               {item.status === 'WARN' ? '⚠' : item.source.split('_')[1] || 'SRC'}
                           </span>
                       </div>
                   </div>
               )) : (
                   <div className="absolute inset-0 flex items-center justify-center opacity-20">
                       <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                           {filterSource ? `No ${filterSource} data` : "No Active Data Stream"}
                       </p>
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
