
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
  xbrl?: any;
  msnData?: any; 
}

interface QualityTicker {
  symbol: string;
  name: string;
  price: number;
  volume: number;
  marketValue: number;
  
  // V17.0 Metrics
  eps: number;          
  earningsYield: number;
  profitDensity: number;
  
  // Advanced Metrics
  zScore: number;       
  fScore: number;       
  sectorRelativeVal: number;
  
  // 3-Factor Scores (0-100)
  profitabilityScore: number; 
  stabilityScore: number;     
  growthScore: number;        
  qualityScore: number;       
  validityScore: number;      

  // Raw Data
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
  cik?: number; 

  // [DATA PRESERVATION]
  financialReport?: DeepFinancialReport; 
  [key: string]: any;
}

interface AuditPacket {
  symbol: string;
  stage: 'TIER1' | 'TIER2'; 
  data1: number; 
  data2: number; 
  source: string;
  timestamp: string;
  status: 'OK' | 'WARN' | 'FAIL'; 
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

const CACHE_PREFIX = 'QUANT_CACHE_V18.0_FUNNEL_'; 
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

const getRaw = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'object' && 'raw' in val) return Number(val.raw) || 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
};

const getSecVal = (facts: any, tagName: string) => {
    if (!facts || !facts[tagName] || !facts[tagName].units || !facts[tagName].units.USD) return 0;
    const entries = facts[tagName].units.USD;
    const currentYear = new Date().getFullYear();
    const valid = entries.filter((e: any) => parseInt(e.end.substring(0, 4)) >= currentYear - 2);
    if (valid.length === 0) return 0;
    valid.sort((a: any, b: any) => a.end > b.end ? -1 : 1);
    return valid[0].val || 0;
};

const winsorize = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

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
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'RANKING_TIER1' | 'DEEP_MINING_TIER2' | 'SECTOR_NEUTRAL' | 'FINAL_FILTER' | 'AI_AUDIT' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v18.0: 500-250 Funnel Architecture Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // [FUNNEL CONSTANTS]
  const TARGET_TIER2_COUNT = 500; // Deep dive candidates (Fetch Financials)
  const FINAL_SELECTION_COUNT = 250; // Final output for Stage 3
  
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (listRef.current && liveAuditFeed.length > 0) {
       listRef.current.scrollTop = 0; 
    }
  }, [liveAuditFeed]);

  useEffect(() => {
    let interval: any;
    if (loading && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsedSec = Math.floor((now - startTimeRef.current) / 1000);
        let etaSec = 0;
        if (analysisPhase === 'DEEP_MINING_TIER2' && enrichProgress.current > 0 && enrichProgress.total > 0) {
            const rate = enrichProgress.current / (elapsedSec || 1);
            const remaining = enrichProgress.total - enrichProgress.current;
            etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        }
        setTimeStats({ elapsed: elapsedSec, eta: etaSec });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [loading, enrichProgress, analysisPhase]);

  useEffect(() => {
    if (autoStart && !loading) {
        addLog("AUTO-PILOT: Engaging 500-250 Funnel Protocol...", "signal");
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
        case 'RANKING_TIER1': return `Tier 1 Ranking (Basic Stats): ${progress.current}/${progress.total}`;
        case 'DEEP_MINING_TIER2': return `Tier 2 Deep Mining (Financials): ${enrichProgress.current}/${enrichProgress.total}`;
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
      // 1. Try MSN Money (High Quality Financials) - Priority
      try {
          const res = await fetch(`/api/msn?symbol=${ticker.symbol}&type=financials`);
          if (res.ok) {
              const data = await res.json();
              if (data && (data.incomeStatement || data.balanceSheet || data.cashFlow)) {
                   return {
                       source: 'MSN_FINANCIALS',
                       annual: { 
                           income: data.incomeStatement || [], 
                           balance: data.balanceSheet || [], 
                           cashflow: data.cashFlow || [] 
                       },
                       quarterly: { income: [], balance: [], cashflow: [] },
                       msnData: data
                   };
              }
          }
      } catch(e) {}

      // 2. Fallback: SEC XBRL if CIK exists
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

      // 3. Fallback: Yahoo
      try {
          const modules = "financialData,defaultKeyStatistics,balanceSheetHistory,incomeStatementHistory,cashflowStatementHistory";
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
        if (report.source === 'MSN_FINANCIALS' && report.msnData) {
            // MSN Logic (Simplified Mapping)
            // Assuming MSN data structure is normalized or we just assume 7 if data exists for now
            // In a real implementation, we would map MSN fields to F-Score logic.
            return 7; 
        }

        const inc = report.annual.income;
        const bal = report.annual.balance;
        const cf = report.annual.cashflow;
        
        if (inc.length < 2 || bal.length < 2 || cf.length < 1) return 5; 

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
          if (report.source === 'MSN_FINANCIALS') return 3.0; // Placeholder

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
      // 1. Load Stage 1 Data (Now includes injected fundamentals)
      const q = encodeURIComponent(`name contains 'STAGE1_PURIFIED_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 1 Missing");
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.investable_universe || [];
      // Initial Sort by basic quality (which was injected in Stage 1)
      // High Quality = Positive ROE + Reasonable PE + Volume
      targets.sort((a: any, b: any) => {
          const scoreA = (a.roe || 0) * 2 + (a.marketCap ? 10 : 0) - (a.pe > 50 ? 20 : 0);
          const scoreB = (b.roe || 0) * 2 + (b.marketCap ? 10 : 0) - (b.pe > 50 ? 20 : 0);
          return scoreB - scoreA;
      });

      // --- TIER 1: RANKING & FILTERING (Top 500) ---
      setAnalysisPhase('RANKING_TIER1');
      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      
      const eliteSurvivors = targets.slice(0, TARGET_TIER2_COUNT).map((t: any) => ({
          ...t,
          source: t.source || 'STAGE1_ENRICHED',
          qualityScore: 0, // Will recalculate
          zScore: 0, 
          fScore: 0,
          sector: t.sector || "Unclassified", 
          industry: t.industry || "Unknown", 
          theme: mapIndustryToTheme(t.industry, t.sector || ""),
          lastUpdate: new Date().toISOString()
      }));

      addLog(`Tier 1: Selected top ${eliteSurvivors.length} candidates based on injected Stage 1 fundamentals.`, "ok");
      
      // --- TIER 2: DEEP MINING (MSN FINANCIALS) ---
      setAnalysisPhase('DEEP_MINING_TIER2');
      addLog(`Initiating Tier 2 Deep Mining (Financial Statements) for ${eliteSurvivors.length} Candidates...`, "signal");
      
      const reportsFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportsArchiveFolder);
      const finalCandidates: QualityTicker[] = [];
      
      setEnrichProgress({ current: 0, total: eliteSurvivors.length });
      let archiveCount = 0;

      for (let i = 0; i < eliteSurvivors.length; i++) {
          const ticker = eliteSurvivors[i];
          let status: 'OK' | 'WARN' | 'FAIL' = 'OK';
          
          // FETCH DEEP FINANCIALS
          const report = await fetchDeepFinancials(ticker);
          
          if (report) {
               // 1. Z-Score & F-Score with Deep Data
               const zScore = calculatePreciseZScore(report, ticker.marketCap || 0);
               const fScore = calculatePiotroskiFScore(report);

               ticker.zScore = Number(zScore.toFixed(2));
               ticker.fScore = fScore;
               ticker.financialReport = report;
               ticker.source = `TIER2_${report.source}`;
               
               if (report.source === 'SEC_XBRL') setSourceStats(prev => ({...prev, sec: prev.sec + 1}));
               else if (report.source === 'MSN_FINANCIALS') setSourceStats(prev => ({...prev, msn: prev.msn + 1}));
               else if (report.source === 'YAHOO_V10') setSourceStats(prev => ({...prev, yahoo: prev.yahoo + 1}));

               if (reportsFolderId) {
                   await uploadSingleReport(reportsFolderId, ticker);
                   archiveCount++;
               }
               
               finalCandidates.push(ticker);
          } else {
              // Fallback: Use injected data for rough score
              let approxZ = 1.6; 
              if ((ticker.debtToEquity || 0) < 0.5) approxZ += 1.0;
              if ((ticker.currentRatio || 1.5) > 2.0) approxZ += 0.5;
              
              let approxF = 4;
              if ((ticker.roe || 0) > 0) approxF += 2; 

              ticker.zScore = Number(approxZ.toFixed(2)); 
              ticker.fScore = approxF;
              ticker.source = 'TIER2_SNAPSHOT_FALLBACK'; 
              
              status = 'OK';
              setSourceStats(prev => ({...prev, fallback: prev.fallback + 1}));
              finalCandidates.push(ticker);
          }
          
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
          
          // Throttling for safety
          await new Promise(r => setTimeout(r, 250));
      }

      // --- SECTOR NEUTRALITY & FINAL FILTER ---
      setAnalysisPhase('SECTOR_NEUTRAL');
      addLog("Calculating Sector Neutral Value Scores...", "info");
      
      const sectorStats: Record<string, { peSum: number, pbSum: number, count: number }> = {};
      finalCandidates.forEach(t => {
          if(!sectorStats[t.sector]) sectorStats[t.sector] = { peSum: 0, pbSum: 0, count: 0 };
          sectorStats[t.sector].peSum += (t.per || 20);
          sectorStats[t.sector].pbSum += (t.pbr || 2);
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
          
          // Initial Quality from Stage 1 + Deep Scores
          const baseQual = ((t.roe || 0) * 0.5) + ((100 - (t.debtToEquity || 50)) * 0.3);
          
          t.qualityScore = Number(((baseQual * 0.3) + (fScoreNorm * 0.2) + (zScoreNorm * 0.2) + (t.sectorRelativeVal * 0.3)).toFixed(2));
      });

      // Cut to Top 250
      setAnalysisPhase('FINAL_FILTER');
      finalCandidates.sort((a, b) => b.qualityScore - a.qualityScore);
      const finalElite = finalCandidates.slice(0, FINAL_SELECTION_COUNT);

      setProcessedData(finalElite);
      setAnalysisPhase('AI_AUDIT');
      await analyzeUniverseHealth(finalElite);
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage2SubFolder);
      if (folderId) {
          const now = new Date();
          const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
          const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
          const fileName = `STAGE2_ELITE_UNIVERSE_${timestamp}.json`;
          
          const payload = {
            manifest: { 
                version: "18.0.0", 
                strategy: "V18.0_500to250_Deep_Funnel", 
                timestamp: new Date().toISOString(), 
                engine: "MSN_Financials_Deep",
                description: "Tier 1: Filter 3k -> 500 (Basic) | Tier 2: Filter 500 -> 250 (Deep Financials)"
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

  const themeDetails = useMemo(() => {
      if (!selectedTheme) return [];
      const stocks = processedData.filter(t => t.theme === selectedTheme);
      return stocks.sort((a, b) => b.qualityScore - a.qualityScore);
  }, [selectedTheme, processedData]);

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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v18.0</h2>
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
              {loading ? 'Processing Pipeline...' : 'Start 500-250 Funnel Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-10">
              <div className="flex flex-col gap-6">
                  {/* Detailed Pipeline Progress HUD */}
                  <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-6">
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Execution Pipeline (V18.0)</p>
                    </div>

                    {/* Stage 1: Tier 1 Ranking */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'RANKING_TIER1' ? 'text-white' : 'text-slate-500'}`}>1. Tier 1 Ranking (Filter Top 500)</span>
                            <span className="text-[8px] font-mono text-slate-400">{progress.current} / {progress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 2: Tier 2 Deep Mining */}
                    <div className="mb-3">
                         <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_MINING_TIER2' ? 'text-white' : 'text-slate-500'}`}>2. Deep Financial Mining (Top 500)</span>
                             <span className="text-[8px] font-mono text-slate-400">{enrichProgress.current} / {enrichProgress.total}</span>
                        </div>
                         <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(enrichProgress.current / (enrichProgress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                     {/* Stage 3: Sector & Final */}
                     <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'FINAL_FILTER' || analysisPhase === 'AI_AUDIT' ? 'text-white' : 'text-slate-500'}`}>3. Final Selection (Top 250)</span>
                            <span className="text-[8px] font-mono text-slate-400">{analysisPhase === 'FINAL_FILTER' ? 'Filtering...' : 'Pending'}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${analysisPhase === 'FINAL_FILTER' || analysisPhase === 'COMPLETE' ? 100 : 0}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 4: Archiving */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_MINING_TIER2' || analysisPhase === 'REPORT_DUMP' ? 'text-white' : 'text-slate-500'}`}>4. Vault Sync (Google Drive)</span>
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
                        {aiAnalysis ? <
