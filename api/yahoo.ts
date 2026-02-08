
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

const CACHE_PREFIX = 'QUANT_CACHE_V15_TIERED_'; 
const THEME_COLORS = ['#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4'];

const getDailyCacheKey = (symbol: string) => {
    const today = new Date().toISOString().split('T')[0];
    return `${CACHE_PREFIX}${symbol}_${today}`;
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
// Logic: Sort by 'end' date desc, prefer 10-K/10-Q forms.
const getSecVal = (facts: any, tagName: string) => {
    if (!facts || !facts[tagName] || !facts[tagName].units || !facts[tagName].units.USD) return 0;
    const entries = facts[tagName].units.USD;
    
    // Filter out very old data to speed up sort (optional, but good for performance)
    const currentYear = new Date().getFullYear();
    const valid = entries.filter((e: any) => {
        const year = parseInt(e.end.substring(0, 4));
        return year >= currentYear - 2; 
    });

    if (valid.length === 0) return 0;

    // Sort by end date descending
    valid.sort((a: any, b: any) => {
        if (a.end > b.end) return -1;
        if (a.end < b.end) return 1;
        return 0;
    });

    // Prefer Form 10-K for annual data if dates align, otherwise take latest
    return valid[0].val || 0;
};

const DeepQualityFilter: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [processedData, setProcessedData] = useState<QualityTicker[]>([]);
  
  // Granular Progress Tracking
  const [progress, setProgress] = useState({ current: 0, total: 0, cacheHits: 0, filteredOut: 0 });
  const [enrichProgress, setEnrichProgress] = useState({ current: 0, total: 0 });
  const [reportProgress, setReportProgress] = useState({ current: 0, total: 0, skipped: 0, archived: 0 }); 
  
  // [NEW] Live Audit State
  const [liveAuditFeed, setLiveAuditFeed] = useState<AuditPacket[]>([]);
  const [sourceStats, setSourceStats] = useState({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, fallback: 0 });

  // Source Management
  const [activeStream, setActiveStream] = useState<string>('IDLE');
  const rapidDepletedRef = useRef(false);
  const finnhubDepletedRef = useRef(false);

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<'INIT' | 'HYBRID_SCAN' | 'SCORING' | 'DEEP_ENRICHMENT' | 'AI_AUDIT' | 'REPORT_DUMP' | 'COMPLETE'>('INIT');
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [aiStatus, setAiStatus] = useState<'IDLE' | 'ANALYZING' | 'SUCCESS' | 'FAILED'>('IDLE');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<string[]>(['> Quant_Node v15.1: SEC XBRL Pipeline Integrated.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const rapidKey = API_CONFIGS.find(c => c.provider === ApiProvider.RAPID_API)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key; // [NEW] Finnhub Key
  
  const logRef = useRef<HTMLDivElement>(null);

  const BATCH_SIZE = 25; 
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
        
        if (analysisPhase === 'HYBRID_SCAN' && progress.current > 0 && progress.total > 0) {
           const rate = progress.current / elapsedSec; 
           const remaining = progress.total - progress.current;
           etaSec = rate > 0 ? Math.floor(remaining / rate) : 0;
        } else if (analysisPhase === 'DEEP_ENRICHMENT' && enrichProgress.current > 0 && enrichProgress.total > 0) {
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
        addLog("AUTO-PILOT: Engaging 2-Tier Quant Protocol...", "signal");
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
        case 'HYBRID_SCAN': return `Tier 1 Scan (Ratios): ${progress.current}/${progress.total}`;
        case 'SCORING': return 'Preliminary Scoring...';
        case 'DEEP_ENRICHMENT': return `Tier 2 Deep Mining (XBRL): ${enrichProgress.current}/${enrichProgress.total}`;
        case 'AI_AUDIT': return 'AI Risk Audit...';
        case 'REPORT_DUMP': return `Finalizing Archives...`;
        case 'COMPLETE': return 'Scan Complete';
        default: return 'Initializing...';
    }
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

  // 1. SEC Data (Proxy)
  const fetchSecXbrlFacts = async (cik: number): Promise<any> => {
      if (!cik) return null;
      try {
          // Use our proxy to fetch 'facts'
          const res = await fetch(`/api/sec?action=facts&cik=${cik}`);
          if (!res.ok) return null;
          const data = await res.json();
          // data structure: { taxonomy: 'us-gaap', facts: { Assets: {...}, ... } }
          if (data.facts) return data.facts;
          return null;
      } catch (e) {
          return null;
      }
  };

  // [TIER 1] Lightweight Scan - Ratio & Metrics Only
  // Fallback Logic: Rapid(FMP) -> Finnhub -> Yahoo -> Stage 0 (Fail-Open)
  const fetchTier1Metrics = async (inputTicker: any): Promise<any> => {
      let metrics: any = null;
      const symbol = inputTicker.symbol;

      // SOURCE A: RapidAPI (FMP) - Ratios Endpoint (Lightweight)
      if (rapidKey && !rapidDepletedRef.current) {
          try {
             setActiveStream(`RAPID_RATIOS [${symbol}]`);
             const host = 'fmpcloud.p.rapidapi.com';
             const res = await fetch(`https://${host}/api/v3/ratios-ttm/${symbol}`, {
                 headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': host }
             });

             if (res.status === 429) {
                 rapidDepletedRef.current = true;
                 addLog("⚠️ RapidAPI Limit Reached. Switching to Backup.", "warn");
             } else if (res.ok) {
                 const data = await res.json();
                 if (Array.isArray(data) && data.length > 0) {
                     const r = data[0];
                     metrics = {
                         source: 'RAPID_RATIOS',
                         per: safeNum(r.peRatioTTM),
                         roe: safeNum(r.returnOnEquityTTM),
                         debtToEquity: safeNum(r.debtEquityRatioTTM) * 100,
                         currentRatio: safeNum(r.currentRatioTTM),
                         pbr: safeNum(r.priceToBookRatioTTM),
                         operatingCashFlow: safeNum(r.operatingCashFlowPerShareTTM) // Proxy
                     };
                 }
             }
          } catch(e) {}
      }

      // SOURCE B: Finnhub (Reliable Alternative)
      if (!metrics && finnhubKey && !finnhubDepletedRef.current) {
          try {
             setActiveStream(`FINNHUB_METRICS [${symbol}]`);
             const res = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${finnhubKey}`);
             
             if (res.status === 429) {
                 finnhubDepletedRef.current = true;
                 addLog("⚠️ Finnhub Limit Reached. Switching to Yahoo.", "warn");
             } else if (res.ok) {
                 const data = await res.json();
                 const m = data.metric;
                 if (m) {
                     metrics = {
                         source: 'FINNHUB_METRICS',
                         per: safeNum(m.peNormalizedAnnual) || safeNum(m.peTTM),
                         roe: safeNum(m.roeTTM), // Finnhub often returns %, so keep as is
                         debtToEquity: safeNum(m.totalDebtEquityRatioQuarterly),
                         pbr: safeNum(m.pbAnnual),
                         currentRatio: safeNum(m.currentRatioQuarterly),
                         operatingCashFlow: 0 // Finnhub basic metrics might not have this easily
                     };
                 }
             }
          } catch(e) {}
      }

      // SOURCE C: Yahoo Finance (Fallback with Rotating User-Agent)
      if (!metrics) {
          try {
              setActiveStream(`YAHOO_METRICS [${symbol}]`);
              const yahooSymbol = symbol.replace(/\./g, '-');
              // Request both v10 (deep) and v7 (summary) modules logic handled by proxy
              const res = await fetch(`/api/yahoo?symbols=${yahooSymbol}&modules=financialData,defaultKeyStatistics`);
              if (res.ok) {
                  const data = await res.json();
                  const fd = data.financialData;
                  const ks = data.defaultKeyStatistics;
                  // Handle V7 response structure (flat) vs V10 (nested)
                  if (fd) {
                      metrics = {
                          source: 'YAHOO_METRICS_V10',
                          per: safeNum(data.summaryDetail?.trailingPE) || safeNum(data.summaryDetail?.forwardPE),
                          roe: safeNum(fd.returnOnEquity),
                          debtToEquity: safeNum(fd.debtToEquity),
                          pbr: safeNum(ks?.priceToBook),
                          currentRatio: safeNum(fd.currentRatio),
                          operatingCashFlow: safeNum(fd.operatingCashflow)
                      };
                  } else if (Array.isArray(data) && data.length > 0) {
                      // V7 Fallback structure
                      const d = data[0];
                      metrics = {
                          source: 'YAHOO_METRICS_V7',
                          per: safeNum(d.trailingPE) || safeNum(d.forwardPE),
                          roe: safeNum(d.returnOnEquity),
                          debtToEquity: safeNum(d.debtToEquity),
                          pbr: safeNum(d.priceToBook),
                          currentRatio: 0,
                          operatingCashFlow: 0
                      };
                  }
              }
          } catch(e) {}
      }
      
      // [FAIL-OPEN] Use Stage 0 Data if API fails
      if (!metrics) {
          metrics = {
              source: 'STAGE0_FALLBACK',
              per: inputTicker.pe || 0,
              roe: inputTicker.roe || 0, 
              debtToEquity: inputTicker.debtToEquity || 0,
              currentRatio: 0, 
              pbr: inputTicker.pb || 0,
              operatingCashFlow: 0
          };
      }
      
      setActiveStream('IDLE');
      return metrics;
  };

  // [TIER 2] Deep Scan - Full Financials for Top Candidates
  // 1. SEC XBRL (Highest Priority)
  // 2. Polygon Deep / Rapid (Fallback)
  const fetchDeepFinancials = async (ticker: any): Promise<DeepFinancialReport | null> => {
      const { symbol, cik } = ticker;

      // 1. SEC EDGAR XBRL (Official Source of Truth)
      if (cik) {
          setActiveStream(`SEC_EDGAR_XBRL [${cik}]`);
          const facts = await fetchSecXbrlFacts(cik);
          if (facts) {
               return {
                   source: 'SEC_XBRL',
                   annual: { income: [], balance: [], cashflow: [] }, 
                   quarterly: { income: [], balance: [], cashflow: [] },
                   xbrl: facts // Store raw facts for precise calc
               };
          }
      }

      // 2. Polygon Deep (Preferred Fallback)
      if (polygonKey) {
          setActiveStream(`POLYGON_XBRL [${symbol}]`);
          try {
             const res = await fetch(`https://api.polygon.io/vX/reference/financials?ticker=${symbol}&limit=5&timeframe=annual&apiKey=${polygonKey}`);
             if (res.ok) {
                 const data = await res.json();
                 if (data.results && data.results.length > 0) {
                     const income: any[] = [];
                     const balance: any[] = [];
                     const cashflow: any[] = [];
                     
                     data.results.forEach((item: any) => {
                         if (item.financials) {
                             income.push(item.financials.income_statement || {});
                             balance.push(item.financials.balance_sheet || {});
                             cashflow.push(item.financials.cash_flow_statement || {});
                         }
                     });
                     
                     return {
                         source: 'POLYGON',
                         annual: { income, balance, cashflow },
                         quarterly: { income: [], balance: [], cashflow: [] }
                     };
                 }
             }
          } catch(e) {}
      }

      // 3. RapidAPI (FMP Cloud) Full Statements
      if (rapidKey && !rapidDepletedRef.current) {
          setActiveStream(`RAPID_DEEP [${symbol}]`);
          const host = 'fmpcloud.p.rapidapi.com';
          try {
              const [inc, bal, cf] = await Promise.all([
                  fetch(`https://${host}/api/v3/income-statement/${symbol}?limit=5`, { headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': host } }).then(r => r.json()),
                  fetch(`https://${host}/api/v3/balance-sheet-statement/${symbol}?limit=5`, { headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': host } }).then(r => r.json()),
                  fetch(`https://${host}/api/v3/cash-flow-statement/${symbol}?limit=5`, { headers: { 'X-RapidAPI-Key': rapidKey, 'X-RapidAPI-Host': host } }).then(r => r.json())
              ]);
              
              if (Array.isArray(inc) && inc.length > 0) {
                  return {
                      source: 'RAPID_FMP',
                      annual: { income: inc, balance: bal, cashflow: cf },
                      quarterly: { income: [], balance: [], cashflow: [] }
                  };
              }
          } catch(e) {}
      }

      return null;
  };

  const uploadSingleReport = async (folderId: string, ticker: QualityTicker) => {
      if (!ticker.financialReport) return;
      const fileName = `REPORT_${ticker.symbol}_${ticker.source.split('_')[0]}.json`;
      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(ticker.financialReport, null, 2)], { type: 'application/json' }));
      
      try {
          await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
          });
      } catch (e) { 
          console.error("Upload failed for", ticker.symbol); 
      }
  };

  const ensureFolder = async (token: string, name: string) => {
    try {
        const rootId = GOOGLE_DRIVE_TARGET.rootFolderId;
        let q = encodeURIComponent(`name = '${name}' and '${rootId}' in parents and trashed = false`);
        let res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json());
        
        if (res.files && res.files.length > 0) return res.files[0].id;

        const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
        }).then(r => r.json());
        return create.id;
    } catch (e: any) {
        console.error("ensureFolder failed completely:", e);
        return null; 
    }
  };

  const calculatePreciseZScore = (report: DeepFinancialReport, marketCap: number) => {
      try {
          // A. SEC XBRL Calculation (Highest Precision)
          if (report.source === 'SEC_XBRL' && report.xbrl) {
              const facts = report.xbrl;
              // Helper to extract
              const getVal = (tag: string) => getSecVal(facts, tag);

              const totalAssets = getVal('Assets');
              if (!totalAssets) return 0;

              // Calculate Components from US-GAAP Tags
              const totalLiabs = getVal('Liabilities') || (getVal('LiabilitiesAndStockholdersEquity') - getVal('StockholdersEquity'));
              const currentAssets = getVal('CurrentAssets') || getVal('AssetsCurrent');
              const currentLiabs = getVal('CurrentLiabilities') || getVal('LiabilitiesCurrent');
              const retainedEarnings = getVal('RetainedEarningsAccumulatedDeficit');
              const ebit = getVal('OperatingIncomeLoss');
              const revenue = getVal('Revenues') || getVal('RevenueFromContractWithCustomerExcludingAssessedTax');
              
              const workingCapital = currentAssets - currentLiabs;

              // Altman Z-Score
              const A = workingCapital / totalAssets;
              const B = retainedEarnings / totalAssets;
              const C = ebit / totalAssets;
              const D = marketCap / (totalLiabs || 1); // MV Equity / Total Liabilities
              const E = revenue / totalAssets;

              const z = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
              return isFinite(z) ? z : 0;
          }

          // B. Polygon/FMP Calculation (Fallback)
          const bs = report.annual.balance[0];
          const is = report.annual.income[0];
          if (!bs || !is) return 0;

          // Universal Value Getter (works for Polygon and FMP structures)
          const val = (v: any) => getPolyVal({v}, ['v']);
          
          // Try Polygon keys then FMP keys
          const totalAssets = getPolyVal(bs, ['assets', 'totalAssets']);
          if (!totalAssets) return 0;

          const currentAssets = getPolyVal(bs, ['current_assets', 'totalCurrentAssets']);
          const currentLiab = getPolyVal(bs, ['current_liabilities', 'totalCurrentLiabilities']);
          const workingCapital = currentAssets - currentLiab;
          
          const retainedEarnings = getPolyVal(bs, ['retained_earnings', 'retainedEarnings']);
          const ebit = getPolyVal(is, ['operating_income_loss', 'operatingIncome']) || getPolyVal(is, ['ebit']);
          const totalLiab = getPolyVal(bs, ['liabilities', 'totalLiabilities']);
          const revenue = getPolyVal(is, ['revenues', 'revenue', 'totalRevenue']);

          // Altman Z-Score Formula
          const A = workingCapital / totalAssets;
          const B = retainedEarnings / totalAssets;
          const C = ebit / totalAssets;
          const D = marketCap / (totalLiab || 1); 
          const E = revenue / totalAssets;

          const z = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
          return isFinite(z) ? z : 0;
      } catch (e) {
          return 0;
      }
  };

  const executeDeepQualityScan = async () => {
    if (!accessToken) return;
    if (loading) return;

    setLoading(true);
    setAnalysisPhase('INIT');
    setProcessedData([]);
    setLiveAuditFeed([]); // Reset Feed
    setSourceStats({ rapid: 0, yahoo: 0, finnhub: 0, sec: 0, fallback: 0 }); // Reset Stats
    startTimeRef.current = Date.now();
    rapidDepletedRef.current = false;
    finnhubDepletedRef.current = false;
    
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
      // [Tier 1 Optimization] Sort by market cap descending to prioritize big players first
      targets.sort((a: any, b: any) => (b.marketCap || 0) - (a.marketCap || 0));

      setProgress({ current: 0, total: targets.length, cacheHits: 0, filteredOut: 0 });
      setAnalysisPhase('HYBRID_SCAN');
      
      const tier1Survivors: QualityTicker[] = [];
      let currentIndex = 0;
      let dropped = 0;

      // --- TIER 1: SCANNING (Lightweight Metrics) ---
      while (currentIndex < targets.length) {
          const batch = targets.slice(currentIndex, currentIndex + BATCH_SIZE);
          
          const batchResults = await Promise.all(batch.map(async (t: any) => {
              const cacheKey = getDailyCacheKey(t.symbol);
              const cached = sessionStorage.getItem(cacheKey);
              if (cached) {
                  setProgress(prev => ({ ...prev, cacheHits: prev.cacheHits + 1 }));
                  return JSON.parse(cached);
              }

              // Lightweight Fetch - Pass 't' for fallback data extraction
              const metrics = await fetchTier1Metrics(t);
              if (!metrics) return null; 
              
              // [LIVE AUDIT] Feed Update
              const auditData: AuditPacket = {
                  symbol: t.symbol,
                  roe: metrics.roe * 100,
                  debt: metrics.debtToEquity,
                  per: metrics.per,
                  source: metrics.source,
                  timestamp: new Date().toLocaleTimeString()
              };
              setLiveAuditFeed(prev => [auditData, ...prev].slice(0, 7)); // Keep last 7
              
              // [LIVE AUDIT] Stats Update
              setSourceStats(prev => ({
                  ...prev,
                  rapid: metrics.source.includes('RAPID') ? prev.rapid + 1 : prev.rapid,
                  finnhub: metrics.source.includes('FINNHUB') ? prev.finnhub + 1 : prev.finnhub,
                  yahoo: metrics.source.includes('YAHOO') ? prev.yahoo + 1 : prev.yahoo,
                  fallback: metrics.source.includes('STAGE0') ? prev.fallback + 1 : prev.fallback
              }));

              // Preliminary Scoring (Soft Filter)
              const roe = metrics.roe || 0;
              const debt = metrics.debtToEquity || 0;
              
              // [FAIL-OPEN] Basic Quality Gate: Only drop if confirmed bad data
              // If source is fallback, let it pass to Tier 2 for a second chance.
              if (metrics.source !== 'STAGE0_FALLBACK') {
                   // Extremely loose filter: only kill zombie companies
                   if (roe < -50 && debt > 500) return null; 
              }

              const resultTicker: QualityTicker = {
                  ...t,
                  per: metrics.per, roe: roe * 100, debtToEquity: debt,
                  pbr: metrics.pbr, currentRatio: metrics.currentRatio,
                  source: metrics.source,
                  qualityScore: 50, // Placeholder
                  zScore: 0, // Calculated in Tier 2
                  fScore: 0,
                  sector: t.sector || "Unclassified", 
                  industry: t.industry || "Unknown", 
                  theme: mapIndustryToTheme(t.industry, t.sector || ""),
                  lastUpdate: new Date().toISOString()
              };
              
              return resultTicker;
          }));

          batchResults.forEach(r => { if (r) tier1Survivors.push(r); else dropped++; });
          currentIndex += BATCH_SIZE;
          setProgress(prev => ({ ...prev, current: currentIndex, filteredOut: dropped }));
          await new Promise(r => setTimeout(r, 100)); // Reduced throttle
      }

      // --- TIER 2: DEEP MINING (SEC XBRL) ---
      setAnalysisPhase('SCORING');
      
      // Select Top Candidates for Deep Scan
      let eliteSurvivors = tier1Survivors.slice(0, TARGET_SELECTION_COUNT);
      
      if (eliteSurvivors.length === 0) {
          addLog("Warning: No assets survived Tier 1 scan. Checking Stage 0 Fallback...", "warn");
          // Emergency Fallback: If everything failed, take raw targets (Safety Net)
          eliteSurvivors = targets.slice(0, 100).map((t: any) => ({
             ...t,
             source: "EMERGENCY_FALLBACK",
             qualityScore: 50,
             sector: t.sector || "Unknown",
             industry: t.industry || "Unknown",
             theme: "Unknown",
             lastUpdate: new Date().toISOString()
          }));
      }

      if (eliteSurvivors.length > 0) {
          setAnalysisPhase('DEEP_ENRICHMENT');
          addLog(`Initiating Tier 2 Deep Mining for ${eliteSurvivors.length} Elites...`, "signal");
          
          const reportsFolderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.reportsArchiveFolder);
          const finalElite: QualityTicker[] = [];
          
          setEnrichProgress({ current: 0, total: eliteSurvivors.length });
          let archiveCount = 0;

          for (let i = 0; i < eliteSurvivors.length; i++) {
              const ticker = eliteSurvivors[i];
              
              // 1. Fetch Deep Ledger (SEC -> Polygon -> Rapid)
              const report = await fetchDeepFinancials(ticker);
              
              if (report && (report.xbrl || report.annual.balance.length > 0)) {
                   // 2. Perform Precise Calculations (User's Formula)
                   const zScore = calculatePreciseZScore(report, ticker.marketCap);
                   
                   // F-Score Estimation (Simplified for brevity, can be expanded)
                   let netIncome = 0, ocf = 0;
                   if (report.source === 'SEC_XBRL' && report.xbrl) {
                        netIncome = getSecVal(report.xbrl, 'NetIncomeLoss');
                        ocf = getSecVal(report.xbrl, 'NetCashProvidedByUsedInOperatingActivities');
                        // [LIVE AUDIT] SEC Stats Update
                        setSourceStats(prev => ({ ...prev, sec: prev.sec + 1 }));
                   } else {
                        netIncome = getPolyVal(report.annual.income[0], ['netIncome', 'net_income']);
                        ocf = getPolyVal(report.annual.cashflow[0], ['operatingCashFlow', 'net_cash_flow_from_operating_activities']);
                   }

                   let fScore = 5;
                   if (netIncome > 0) fScore++;
                   if (ocf > 0) fScore++;
                   if (ocf > netIncome) fScore++;

                   // Update Ticker
                   ticker.zScore = Number(zScore.toFixed(2));
                   ticker.fScore = fScore;
                   ticker.financialReport = report;
                   ticker.source = `TIER2_${report.source}`;
                   
                   // Calculate Final Quality Score
                   let qScore = 50;
                   qScore += (ticker.roe * 20) + (Math.min(zScore, 5) * 10) + (fScore * 5);
                   ticker.qualityScore = Number(Math.min(100, qScore).toFixed(2));

                   // Archive
                   if (reportsFolderId) {
                       await uploadSingleReport(reportsFolderId, ticker);
                       archiveCount++;
                   }
                   
                   finalElite.push(ticker);
              } else {
                  // Keep as backup if deep data fails but Tier 1 was good
                  ticker.zScore = 1.8; // Default safe
                  finalElite.push(ticker);
              }

              setEnrichProgress({ current: i + 1, total: eliteSurvivors.length });
              setReportProgress(prev => ({ ...prev, current: i + 1, archived: archiveCount }));
              // Throttle slightly
              if (i % 5 === 0) await new Promise(r => setTimeout(r, 100));
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
                    version: "15.1.0", 
                    strategy: "2-Tier_Hybrid_SEC_XBRL_DeepScan", 
                    timestamp: new Date().toISOString(), 
                    engine: "Use_Everything",
                    description: "Tier 1: Rapid Ratios (Fail-Open) -> Tier 2: SEC XBRL Precision"
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
      const phases = ['HYBRID_SCAN', 'SCORING', 'DEEP_ENRICHMENT', 'AI_AUDIT', 'REPORT_DUMP'];
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
          
          {/* Header Section */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-blue-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Deep_Quality v15.1</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-blue-400 text-blue-400 animate-pulse' : 'border-blue-500/20 bg-blue-500/10 text-blue-400'}`}>
                            {loading ? getProgressLabel() : 'SEC XBRL Protocol Active'}
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
              {loading ? 'Processing Pipeline...' : 'Start Deep Quality Scan'}
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
                      <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Execution Pipeline</p>
                    </div>

                    {/* Stage 1: Tier 1 Scan */}
                    <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'HYBRID_SCAN' ? 'text-white' : 'text-slate-500'}`}>1. Market Scan (Rapid/FMP Lite)</span>
                            <span className="text-[8px] font-mono text-slate-400">{progress.current} / {progress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 2: Scoring */}
                    <div className="mb-3">
                         <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'SCORING' || analysisPhase === 'HYBRID_SCAN' ? 'text-white' : 'text-slate-500'}`}>2. Quant Scoring (Prelim Alpha)</span>
                             <span className="text-[8px] font-mono text-slate-400">{progress.current > 0 ? 'Active' : 'Pending'}</span>
                        </div>
                         <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${(progress.current / (progress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                     {/* Stage 3: Tier 2 Deep Mining */}
                     <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_ENRICHMENT' ? 'text-white' : 'text-slate-500'}`}>3. Deep Mining (SEC XBRL)</span>
                            <span className="text-[8px] font-mono text-slate-400">{enrichProgress.current} / {enrichProgress.total}</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 transition-all duration-300" style={{ width: `${(enrichProgress.current / (enrichProgress.total || 1)) * 100}%` }}></div>
                        </div>
                    </div>

                    {/* Stage 4: Archiving */}
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${analysisPhase === 'DEEP_ENRICHMENT' || analysisPhase === 'REPORT_DUMP' ? 'text-white' : 'text-slate-500'}`}>4. Vault Sync (Google Drive)</span>
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
