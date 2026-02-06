
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Scoring
  fScore: number;       // 0-9
  zScore: number;       // Bankruptcy Risk
  fundamentalScore: number; // Composite Score (0-100)
  
  // Valuation
  intrinsicValue: number;
  upsidePotential: number;
  fairValueGap: number; // Percentage
  
  // Advanced Metrics (Hedge Fund Style)
  roic: number;         // Return on Invested Capital
  ruleOf40: number;     // Growth + Margin
  fcfYield: number;     // Free Cash Flow Yield
  grossMargin: number;  
  pegRatio: number;
  
  // AI Qualitative
  economicMoat: 'Wide' | 'Narrow' | 'None' | 'Analyzing...';
  
  // Visualization
  radarData: {
      valuation: number;
      profitability: number;
      growth: number;
      financialHealth: number;
      moat: number;
      momentum: number;
  };
  
  lastUpdate: string;
  source: string; // Source of data (Real vs Model)

  // [DATA ACCUMULATION] Preserve all data from Stage 0, 1, 2
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [ENGINEERING] Sector Benchmarks for Data Imputation
// Used ONLY when real API data is completely missing (Fallback of Fallback).
const SECTOR_STATS: Record<string, { gm: number; fcf: number; roic: number; pe: number }> = {
    'Technology': { gm: 52.0, fcf: 12.0, roic: 18.0, pe: 35.0 },
    'Software': { gm: 70.0, fcf: 20.0, roic: 25.0, pe: 45.0 },
    'Semiconductors': { gm: 55.0, fcf: 18.0, roic: 22.0, pe: 40.0 },
    'Healthcare': { gm: 58.0, fcf: 10.0, roic: 14.0, pe: 28.0 },
    'Consumer Services': { gm: 40.0, fcf: 8.0, roic: 15.0, pe: 25.0 },
    'Financials': { gm: 90.0, fcf: 5.0, roic: 10.0, pe: 15.0 }, 
    'Energy': { gm: 35.0, fcf: 15.0, roic: 12.0, pe: 12.0 },
    'Industrials': { gm: 28.0, fcf: 7.0, roic: 13.0, pe: 20.0 },
    'Utilities': { gm: 30.0, fcf: 4.0, roic: 6.0, pe: 18.0 },
    'Real Estate': { gm: 65.0, fcf: 6.0, roic: 5.0, pe: 35.0 },
    'Basic Materials': { gm: 25.0, fcf: 8.0, roic: 11.0, pe: 16.0 },
    'Communication Services': { gm: 45.0, fcf: 11.0, roic: 14.0, pe: 22.0 },
    'Consumer Defensive': { gm: 32.0, fcf: 6.0, roic: 16.0, pe: 24.0 },
};

const METRIC_INSIGHTS: Record<string, { title: string; desc: string; strategy: string }> = {
    'INTRINSIC': {
        title: "Intrinsic Value (보수적 내재가치)",
        desc: "벤자민 그레이엄 공식에 **30% 안전마진(Margin of Safety)**을 적용한 보수적 적정 주가입니다. 시장의 거품을 제거하고 기업의 본질적 체력만을 평가합니다.",
        strategy: "현재 주가가 내재가치보다 낮을 때(Undervalued) 진입하여 안전마진을 확보하십시오. 이는 하락장에서 자산을 지키는 가장 확실한 방패입니다."
    },
    'ROIC': {
        title: "ROIC (투하자본이익률)",
        desc: "기업이 영업활동에 투입한 자본으로 얼마나 효율적으로 현금을 벌어들이는지 측정합니다. 15% 이상이면 강력한 경제적 해자(Moat)를 보유한 것으로 간주합니다.",
        strategy: "15% 이상의 높은 ROIC를 장기간 유지하는 기업은 복리 효과의 마법을 누릴 수 있습니다. 워렌 버핏이 가장 중요하게 보는 지표입니다."
    },
    'RULE40': {
        title: "Rule of 40 (성장 효율성)",
        desc: "매출성장률과 이익률의 합계입니다. 40점 이상이면 초고속 성장과 수익성을 동시에 달성하고 있는 '유니콘 급' 퍼포먼스를 의미합니다.",
        strategy: "성장주 투자 시 필수 체크! 40점을 넘는 기업은 프리미엄을 주고서라도 매수할 가치가 있으며, 50점 이상은 업계 지배자입니다."
    },
    'GROSS': {
        title: "Gross Margin (매출총이익률)",
        desc: "제품/서비스의 원가 경쟁력을 나타냅니다. 40% 이상이면 브랜드 파워나 기술적 우위로 인해 가격 결정권(Pricing Power)을 가진 기업일 확률이 높습니다.",
        strategy: "인플레이션 시기에는 마진율이 높은 기업만이 원가 상승분을 가격에 전가하며 이익을 방어할 수 있습니다."
    },
    'FCF': {
        title: "FCF Yield (잉여현금수익률)",
        desc: "시가총액 대비 기업이 실제 벌어들이는 현금(Free Cash Flow)의 비율입니다. 배당, 자사주 매입 등 주주 환원 여력을 보여주는 가장 실질적인 지표입니다.",
        strategy: "FCF Yield가 국채 금리보다 높다면 강력한 매수 기회입니다. 풍부한 현금은 자사주 매입과 배당 성장의 원천이 됩니다."
    }
};

const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software') || s.includes('semi')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s.includes('health') || s.includes('bio') || s.includes('pharm')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
    if (s.includes('finance') || s.includes('bank') || s.includes('invest')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('energy') || s.includes('oil') || s.includes('gas')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (s.includes('consumer') || s.includes('retail')) return 'bg-rose-500/20 text-rose-400 border-rose-500/30';
    if (s.includes('communication') || s.includes('media') || s.includes('telecom')) return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    if (s.includes('real estate') || s.includes('reit')) return 'bg-lime-500/20 text-lime-400 border-lime-500/30';
    if (s.includes('util')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    if (s.includes('material')) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (s.includes('indust')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
};

const FundamentalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<FundamentalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<FundamentalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null); 
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Fortress v7.3: Real-Data Integration Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // [NEW] Click Outside Handler for Insights
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-trigger') && !target.closest('.insight-overlay')) {
            setActiveMetric(null);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        addLog("AUTO-PILOT: Engaging Fundamental Fortress Protocol...", "signal");
        executeFundamentalFortress();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const handleTickerSelect = (ticker: FundamentalTicker) => {
      setSelectedTicker(ticker);
      setActiveMetric(null);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  const safeNum = (val: any): number => {
      if (val === null || val === undefined || val === 'NaN') return 0;
      const num = Number(val);
      return isNaN(num) || !isFinite(num) ? 0 : num;
  };

  // Benjamin Graham Formula with SAFETY MARGIN (Discount 30-40%)
  const calculateIntrinsicValue = (eps: number, growthRate: number, currentYield: number = 4.4) => {
      const safeEps = Math.max(eps, 0.1); 
      // Cap growth rate at 20% to prevent Tech bubble valuations
      const safeGrowth = Math.min(Math.max(growthRate, 0), 20); 
      const y = currentYield <= 0 ? 4.4 : currentYield;
      
      const rawValue = (safeEps * (8.5 + 2 * safeGrowth) * 4.4) / y;
      
      // [STRICT] Apply 30% Margin of Safety Discount
      return rawValue * 0.7; 
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      if (max - min === 0) return 50;
      const normalized = ((val - min) / (max - min)) * 100;
      return Math.min(100, Math.max(0, normalized));
  };

  // [HYBRID DATA FETCH] Priority 1: Yahoo Finance Real Data Modules
  const fetchRealFinancials = async (symbol: string) => {
      try {
          // Fetch critical modules for Real Data calculation
          const modules = "financialData,defaultKeyStatistics,cashflowStatementHistory,summaryDetail";
          const res = await fetch(`/api/yahoo?symbols=${symbol}&modules=${modules}`);
          if (!res.ok) return null;
          return await res.json();
      } catch (e) {
          return null;
      }
  };

  // [HYBRID DATA FETCH] Priority 2: FMP API for Real Ratios (Backup)
  const fetchFmpRatios = async (symbol: string) => {
      if (!fmpKey) return null;
      try {
          // Fetch TTM Ratios for latest data
          const res = await fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data[0];
          return null;
      } catch (e) {
          return null;
      }
  };

  const determineEconomicMoat = (grossMargin: number, roic: number, roe: number): 'Wide' | 'Narrow' | 'None' => {
      if (grossMargin > 50 && roic > 20 && roe > 25) return 'Wide';
      if (grossMargin > 30 && roic > 10) return 'Narrow';
      return 'None';
  };

  const getSectorStats = (sector: string, industry: string) => {
     if (sector === "Technology Services" || industry.includes("Software")) return SECTOR_STATS['Software'];
     if (industry.includes("Semiconductors")) return SECTOR_STATS['Semiconductors'];
     if (sector === "Finance" && industry.includes("Bank")) return SECTOR_STATS['Financials'];
     for (const key of Object.keys(SECTOR_STATS)) {
         if (sector.includes(key)) return SECTOR_STATS[key];
     }
     return { gm: 30, fcf: 8, roic: 10, pe: 20 };
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      // 1. Load Stage 2 Data (Accumulated Stage 0+1+2)
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 Data Missing. Please run Stage 2.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let candidates = content.elite_universe || [];
      if (candidates.length === 0) {
          addLog("No candidates found in Stage 2 data.", "err");
          setLoading(false); return;
      }

      candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const cutoff = Math.ceil(candidates.length * 0.5);
      const eliteSquad = candidates.slice(0, cutoff);

      addLog(`Fortress Protocol: Analyzing Top ${eliteSquad.length} Assets (Top 50%)...`, "info");
      setProgress({ current: 0, total: eliteSquad.length });

      const results: FundamentalTicker[] = [];
      const BATCH_SIZE = 5; 
      
      for (let i = 0; i < eliteSquad.length; i += BATCH_SIZE) {
          const batch = eliteSquad.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (item: any) => {
              try {
                  const basePrice = safeNum(item.price);
                  const basePe = safeNum(item.per || item.pe);
                  const baseRoe = safeNum(item.roe);
                  const baseSector = item.sector || "Unknown";
                  const baseIndustry = item.industry || "Unknown";

                  // [STEP 1] Fetch Real Data from Yahoo (Priority)
                  const realData = await fetchRealFinancials(item.symbol);
                  
                  // [STEP 2] Fetch Backup Data from FMP (Secondary)
                  const fmpData = await fetchFmpRatios(item.symbol);

                  // [STEP 3] Data Logic & Calculation
                  let dataSource = "Estimate";
                  
                  // [MARKET CAP]
                  const marketCap = safeNum(realData?.summaryDetail?.marketCap?.raw || item.marketCap || item.marketValue);

                  // --- GROSS MARGIN ---
                  let grossMargin = 0;
                  if (realData?.financialData?.grossMargins?.raw) {
                      grossMargin = safeNum(realData.financialData.grossMargins.raw * 100);
                      dataSource = "Yahoo_Real";
                  } else if (fmpData?.grossProfitMarginTTM) {
                      grossMargin = safeNum(fmpData.grossProfitMarginTTM * 100);
                      dataSource = "FMP_Real";
                  } else {
                      const stats = getSectorStats(baseSector, baseIndustry);
                      // [INVESTMENT LOGIC] Size Factor Adjustment (Instead of Randomness)
                      // Mega Cap (>100B) tends to have better margins/stability than industry avg
                      let sizeModifier = 1.0;
                      if (marketCap > 100000000000) sizeModifier = 1.15; // Mega Cap Premium
                      else if (marketCap > 10000000000) sizeModifier = 1.05; // Large Cap Premium
                      else if (marketCap < 2000000000) sizeModifier = 0.85; // Small Cap Discount

                      grossMargin = stats.gm * sizeModifier;
                      dataSource = "Sector_Model";
                  }
                  
                  // Sanity check for Margin
                  if (grossMargin > 100) grossMargin = 99.9;

                  // --- FCF YIELD CALCULATION (OCF - CapEx) ---
                  let fcfYield = 0;
                  
                  if (realData?.cashflowStatementHistory?.cashflowStatements?.[0]) {
                      const statement = realData.cashflowStatementHistory.cashflowStatements[0];
                      const ocf = safeNum(statement.totalCashFromOperatingActivities?.raw);
                      const capex = safeNum(statement.capitalExpenditures?.raw);
                      const fcf = ocf + capex; // CapEx is usually negative in Yahoo
                      if (marketCap > 0) fcfYield = (fcf / marketCap) * 100;
                  }
                  
                  if (fcfYield === 0 && fmpData?.freeCashFlowYieldTTM) {
                      fcfYield = safeNum(fmpData.freeCashFlowYieldTTM * 100);
                  }
                  
                  if (fcfYield === 0) {
                      const stats = getSectorStats(baseSector, baseIndustry);
                      // Size Adjustment for FCF
                      let sizeModifier = 1.0;
                      if (marketCap > 50000000000) sizeModifier = 1.1; 
                      fcfYield = stats.fcf * sizeModifier;
                  }
                  
                  // --- GROWTH & PEG ---
                  let growthRate = safeNum(realData?.financialData?.revenueGrowth?.raw * 100);
                  if (growthRate === 0) {
                       growthRate = safeNum(fmpData?.revenueGrowthTTM * 100);
                  }
                  
                  // Impute growth if missing (Reverse Engineer from PE, assuming PEG=1.5)
                  const imputedGrowth = growthRate === 0 && basePe > 0 ? basePe / 1.5 : (growthRate || 8.0);
                  
                  const pe = safeNum(realData?.summaryDetail?.trailingPE?.raw || fmpData?.peRatioTTM || basePe || 25);
                  const eps = safeNum(realData?.defaultKeyStatistics?.trailingEps?.raw || (pe > 0 ? basePrice / pe : 0));
                  const roe = safeNum(realData?.financialData?.returnOnEquity?.raw * 100 || fmpData?.returnOnEquityTTM * 100 || baseRoe);
                  
                  // --- ROIC ---
                  let roic = safeNum(fmpData?.returnOnCapitalEmployedTTM * 100);
                  if (roic === 0) {
                      // Estimate ROIC from ROE (Usually 60-80% of ROE)
                      roic = roe * 0.75;
                      if (roic === 0) {
                          const stats = getSectorStats(baseSector, baseIndustry);
                          // Size Adjustment
                          let sizeModifier = 1.0;
                          if (marketCap > 100000000000) sizeModifier = 1.2;
                          roic = stats.roic * sizeModifier;
                      }
                  }

                  // --- INTRINSIC VALUE ---
                  let intrinsicValue = calculateIntrinsicValue(eps, imputedGrowth);
                  if (intrinsicValue <= 0) intrinsicValue = basePrice * 0.7; // Fallback to discount
                  // Cap insane valuations
                  if (intrinsicValue > basePrice * 3.0) intrinsicValue = basePrice * 3.0;

                  const upside = basePrice > 0 ? ((intrinsicValue - basePrice) / basePrice) * 100 : 0;
                  const ruleOf40 = imputedGrowth + grossMargin;

                  // Scoring
                  const valScore = normalizeScore(upside, 0, 100); 
                  const growthScore = normalizeScore(ruleOf40, 20, 70);
                  const qualScore = normalizeScore(roic, 5, 35);
                  const compositeScore = (valScore * 0.4) + (growthScore * 0.35) + (qualScore * 0.25);

                  const ticker: FundamentalTicker = {
                      ...item,
                      symbol: item.symbol,
                      name: item.name || item.symbol,
                      price: basePrice,
                      marketCap: marketCap,
                      sector: baseSector,
                      
                      fundamentalScore: safeNum(compositeScore.toFixed(2)),
                      intrinsicValue: safeNum(intrinsicValue.toFixed(2)),
                      upsidePotential: safeNum(upside.toFixed(2)),
                      fairValueGap: safeNum(upside.toFixed(2)),
                      
                      roic: safeNum(roic.toFixed(2)),
                      ruleOf40: safeNum(ruleOf40.toFixed(2)),
                      fcfYield: safeNum(fcfYield.toFixed(2)),
                      grossMargin: safeNum(grossMargin.toFixed(2)),
                      pegRatio: safeNum((pe / (imputedGrowth || 1)).toFixed(2)),
                      
                      economicMoat: determineEconomicMoat(grossMargin, roic, roe),
                      source: dataSource,
                      
                      radarData: {
                          valuation: valScore,
                          profitability: normalizeScore(roe, 5, 40),
                          growth: growthScore,
                          financialHealth: normalizeScore(item.zScore || 3, 1.5, 6),
                          moat: normalizeScore(grossMargin, 15, 70),
                          momentum: normalizeScore(ruleOf40, 10, 70)
                      },
                      lastUpdate: new Date().toISOString()
                  };

                  results.push(ticker);

              } catch (err) {
                  console.warn(`Skipping ${item.symbol}`, err);
              }
          }));

          setProgress({ current: Math.min(i + BATCH_SIZE, eliteSquad.length), total: eliteSquad.length });
          await new Promise(r => setTimeout(r, 250)); // Gentle Throttle
      }

      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      
      // [LOG UPDATE] Warn if too many sector models are used
      const modelCount = results.filter(r => r.source === 'Sector_Model').length;
      if (modelCount > results.length * 0.8) {
          addLog(`Notice: High reliance on Sector Models (${modelCount}/${results.length}). APIs may be rate-limited.`, "warn");
      }
      
      if (results.length > 0) handleTickerSelect(results[0]);

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      
      // [KST TIMESTAMP LOGIC]
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "7.3.0", count: results.length, strategy: "Fundamental_Fortress_RealData_Priority" },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Fortress Secured. ${results.length} Assets Validated & Saved.`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`System Failure: ${e.message}`, "err");
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

  const getRadarData = (ticker: FundamentalTicker | null) => {
      if (!ticker) return [];
      return [
          { subject: 'Valuation', A: safeNum(ticker.radarData.valuation), fullMark: 100 },
          { subject: 'Profit', A: safeNum(ticker.radarData.profitability), fullMark: 100 },
          { subject: 'Growth', A: safeNum(ticker.radarData.growth), fullMark: 100 },
          { subject: 'Health', A: safeNum(ticker.radarData.financialHealth), fullMark: 100 },
          { subject: 'Moat', A: safeNum(ticker.radarData.moat), fullMark: 100 },
          { subject: 'Momentum', A: safeNum(ticker.radarData.momentum), fullMark: 100 },
      ];
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Fortress v7.3</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Processing: ${progress.current}/${progress.total}` : 'Real-Data Engine (Yahoo+FMP) Active'}
                        </span>
                        {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded font-black uppercase animate-pulse">AUTO PILOT</span>}
                   </div>
                   {loading && (
                     <div className="flex items-center space-x-2 mt-0.5">
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         Elapsed: <span className="text-white">{formatTime(timeStats.elapsed)}</span>
                       </span>
                       <span className="text-[8px] font-mono font-bold text-slate-500">|</span>
                       <span className="text-[8px] font-mono font-bold text-slate-400 uppercase">
                         ETA: <span className="text-emerald-400">{formatTime(timeStats.eta)}</span>
                       </span>
                     </div>
                   )}
                </div>
              </div>
            </div>
            <button 
              onClick={executeFundamentalFortress} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-cyan-800 text-cyan-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Crunching Real Financials...' : 'Execute Fortress Protocol (Top 50%)'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Fortress Candidates ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Composite Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}/100</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Score</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Quantum Processing...
                         </div>
                     )}
                 </div>
              </div>

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
                                </div>
                            </div>
                            <div 
                                className="text-right cursor-pointer group hover:opacity-80 transition-opacity insight-trigger"
                                onClick={() => setActiveMetric('INTRINSIC')}
                            >
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1 group-hover:text-emerald-400 transition-colors">Intrinsic Value Gauge (Safe)</p>
                                 <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                     {/* Center Marker (Fair Value) */}
                                     <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white z-10"></div>
                                     {/* Current Price Marker */}
                                     <div 
                                        className={`absolute top-0 bottom-0 w-1 z-20 ${selectedTicker.upsidePotential > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                        style={{ 
                                            left: `${Math.min(100, Math.max(0, 50 - (selectedTicker.upsidePotential / 4)))}%` // Scaling for visualization
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
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(selectedTicker)}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name={selectedTicker.symbol} dataKey="A" stroke="#06b6d4" strokeWidth={2} fill="#06b6d4" fillOpacity={0.4} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#06b6d4', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Magic Metrics Grid - Now Clickable */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                 { id: 'ROIC', label: 'ROIC', val: `${selectedTicker.roic.toFixed(1)}%`, good: selectedTicker.roic > 10 },
                                 { id: 'RULE40', label: 'Rule of 40', val: `${selectedTicker.ruleOf40.toFixed(1)}`, good: selectedTicker.ruleOf40 > 40 },
                                 { id: 'GROSS', label: 'Gross Marg', val: `${selectedTicker.grossMargin.toFixed(1)}%`, good: selectedTicker.grossMargin > 40 },
                                 { id: 'FCF', label: 'FCF Yield', val: `${selectedTicker.fcfYield.toFixed(1)}%`, good: parseFloat(selectedTicker.fcfYield as any) > 3 }
                             ].map((m, idx) => (
                                 <div 
                                    key={idx} 
                                    onClick={() => setActiveMetric(m.id)}
                                    className={`insight-trigger p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 ${activeMetric === m.id ? 'bg-white/10 border-white text-white shadow-lg' : m.good ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-slate-800 border-white/5'}`}
                                 >
                                     <p className={`text-[7px] uppercase font-bold ${activeMetric === m.id ? 'text-white' : 'text-slate-500'}`}>{m.label}</p>
                                     <p className={`text-[10px] font-black ${m.good ? 'text-emerald-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>
                        
                        {/* Quant Insight Box - Updated to include Strategy */}
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Audit_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
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
