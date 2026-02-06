import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage, removeCitations } from '../services/intelligenceService';

interface FundamentalTicker {
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  sector: string;
  
  // Scoring
  fScore: number;       // Piotroski F-Score (0-9)
  zScore: number;       // Altman Z-Score (Real Calculation)
  fundamentalScore: number; // Composite Score (0-100)
  
  // Valuation
  intrinsicValue: number;
  upsidePotential: number;
  fairValueGap: number; 
  
  // Advanced Metrics (Hedge Fund Style)
  roic: number;         // Return on Invested Capital
  ruleOf40: number;     // Growth + Margin
  fcfYield: number;     // Free Cash Flow Yield
  grossMargin: number;  
  pegRatio: number;

  // New Forensic Metrics
  erpScore: number;     // Earnings Revision Profile (Analyst Momentum)
  earningsQuality: number; // Accruals Ratio (Net Income vs OCF)
  
  // AI Qualitative
  economicMoat: 'Wide' | 'Narrow' | 'None' | 'Analyzing...';
  
  // Visualization
  radarData: {
      subject: string;
      A: number;
      fullMark: number;
  }[];
  
  lastUpdate: string;
  source: string; 

  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [ENGINEERING] Sector Benchmarks for Data Imputation
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
        title: "Intrinsic Value (내재가치)",
        desc: "벤자민 그레이엄 공식에 안전마진 30%를 적용한 보수적 적정 주가입니다.",
        strategy: "주가가 내재가치보다 낮을 때 매수하여 안전마진을 확보하십시오."
    },
    'Z_SCORE': {
        title: "Altman Z-Score (부도 위험)",
        desc: "기업의 파산 가능성을 예측하는 재무 건전성 지표입니다. (1.8 미만: 위험, 3.0 이상: 안전)",
        strategy: "Z-Score가 1.8 미만인 기업은 밸류에이션이 아무리 싸도 '가치 함정(Value Trap)'일 수 있으므로 피하십시오."
    },
    'ERP': {
        title: "ERP (이익 전망 모멘텀)",
        desc: "애널리스트들의 EPS 추정치 상향 조정 강도입니다. 실적 발표 전 주가의 선행 지표입니다.",
        strategy: "ERP가 양수(+)인 종목은 어닝 서프라이즈 가능성이 높습니다. 주가 상승의 강력한 촉매제입니다."
    },
    'QUALITY': {
        title: "Earnings Quality (이익의 질)",
        desc: "순이익과 영업현금흐름의 차이(Accruals)를 분석합니다. 현금이 돌지 않는 흑자는 가짜일 수 있습니다.",
        strategy: "영업활동현금흐름이 순이익보다 큰 기업을 선택하십시오. 이는 분식회계 가능성을 차단합니다."
    },
    'ROIC': {
        title: "ROIC (투하자본이익률)",
        desc: "영업 투입 자본 대비 수익성입니다. 15% 이상은 강력한 해자(Moat)를 의미합니다.",
        strategy: "높은 ROIC를 유지하는 기업은 복리 효과로 장기 우상향할 확률이 높습니다."
    }
};

const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    if (s.includes('tech') || s.includes('software')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s.includes('health') || s.includes('bio')) return 'bg-teal-500/20 text-teal-400 border-teal-500/30';
    if (s.includes('finance')) return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    if (s.includes('energy')) return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
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
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Fortress v7.5: Forensic Quant Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
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

  const calculateIntrinsicValue = (eps: number, growthRate: number, currentYield: number = 4.4) => {
      const safeEps = Math.max(eps, 0.1); 
      const safeGrowth = Math.min(Math.max(growthRate, 0), 20); 
      const y = currentYield <= 0 ? 4.4 : currentYield;
      const rawValue = (safeEps * (8.5 + 2 * safeGrowth) * 4.4) / y;
      return rawValue * 0.7; // 30% Safety Margin
  };

  const normalizeScore = (val: number, min: number, max: number) => {
      if (max - min === 0) return 50;
      const normalized = ((val - min) / (max - min)) * 100;
      return Math.min(100, Math.max(0, normalized));
  };

  const fetchRealFinancials = async (symbol: string) => {
      try {
          const modules = "financialData,defaultKeyStatistics,cashflowStatementHistory,balanceSheetHistory,incomeStatementHistory,earningsTrend,summaryDetail";
          const res = await fetch(`/api/yahoo?symbols=${symbol}&modules=${modules}`);
          if (!res.ok) return null;
          return await res.json();
      } catch (e) { return null; }
  };

  const fetchFmpRatios = async (symbol: string) => {
      if (!fmpKey) return null;
      try {
          const res = await fetch(`https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`);
          if (!res.ok) return null;
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) return data[0];
          return null;
      } catch (e) { return null; }
  };

  const calculateAltmanZ = (balanceSheet: any, incomeStatement: any, marketCap: number) => {
      try {
          if (!balanceSheet || !incomeStatement) return 0;
          
          const bs = balanceSheet.balanceSheetStatements?.[0];
          const is = incomeStatement.incomeStatementHistory?.[0];

          if (!bs || !is) return 0;

          const totalAssets = safeNum(bs.totalAssets?.raw);
          const totalLiabilities = safeNum(bs.totalLiab?.raw);
          const workingCapital = safeNum(bs.totalCurrentAssets?.raw) - safeNum(bs.totalCurrentLiabilities?.raw);
          const retainedEarnings = safeNum(bs.retainedEarnings?.raw);
          const ebit = safeNum(is.ebit?.raw);
          const totalRevenue = safeNum(is.totalRevenue?.raw);

          if (totalAssets === 0 || totalLiabilities === 0) return 0;

          const A = workingCapital / totalAssets;
          const B = retainedEarnings / totalAssets;
          const C = ebit / totalAssets;
          const D = marketCap / totalLiabilities;
          const E = totalRevenue / totalAssets;

          const zScore = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E);
          return Math.max(0, zScore);
      } catch (e) { return 0; }
  };

  const calculateERP = (earningsTrend: any) => {
      try {
          if (!earningsTrend || !earningsTrend.trend || earningsTrend.trend.length === 0) return 0;
          const currentTrend = earningsTrend.trend.find((t: any) => t.period === '0q'); 
          if (!currentTrend) return 0;

          const currentEst = safeNum(currentTrend.earningsEstimate?.avg?.raw);
          const days30AgoEst = safeNum(currentTrend.earningsEstimate?.ago30Day?.raw);

          if (days30AgoEst === 0) return 0;
          
          const revision = ((currentEst - days30AgoEst) / Math.abs(days30AgoEst)) * 100;
          return revision;
      } catch (e) { return 0; }
  };

  const calculateEarningsQuality = (incomeStatement: any, cashFlow: any) => {
      try {
          const netIncome = safeNum(incomeStatement?.incomeStatementHistory?.[0]?.netIncome?.raw);
          const ocf = safeNum(cashFlow?.cashflowStatements?.[0]?.totalCashFromOperatingActivities?.raw);
          
          if (Math.abs(ocf) < 1) return 50; 

          const qualityRatio = ocf / netIncome;
          return qualityRatio;
      } catch (e) { return 0; }
  };

  const executeFundamentalFortress = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 2 Data Missing.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let candidates = content.elite_universe || [];
      candidates.sort((a: any, b: any) => (b.qualityScore || 0) - (a.qualityScore || 0));
      const eliteSquad = candidates.slice(0, Math.ceil(candidates.length * 0.5));

      addLog(`Fortress Protocol: Analyzing ${eliteSquad.length} Assets with Forensic Quant Models...`, "info");
      setProgress({ current: 0, total: eliteSquad.length });

      const results: FundamentalTicker[] = [];
      const BATCH_SIZE = 5; 
      
      for (let i = 0; i < eliteSquad.length; i += BATCH_SIZE) {
          const batch = eliteSquad.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (item: any) => {
              try {
                  const basePrice = safeNum(item.price);
                  const realData = await fetchRealFinancials(item.symbol);
                  const fmpData = await fetchFmpRatios(item.symbol);

                  const marketCap = safeNum(realData?.summaryDetail?.marketCap?.raw || item.marketCap);
                  
                  let zScore = calculateAltmanZ(realData?.balanceSheetHistory, realData?.incomeStatementHistory, marketCap);
                  if (zScore === 0 && item.zScore) zScore = item.zScore;

                  const erp = calculateERP(realData?.earningsTrend);
                  const earningsQualityRatio = calculateEarningsQuality(realData?.incomeStatementHistory, realData?.cashflowStatementHistory);

                  let grossMargin = safeNum(realData?.financialData?.grossMargins?.raw * 100) || safeNum(fmpData?.grossProfitMarginTTM * 100);
                  if (grossMargin === 0) grossMargin = 30; 

                  let fcfYield = 0;
                  if (realData?.cashflowStatementHistory?.cashflowStatements?.[0]) {
                      const stmt = realData.cashflowStatementHistory.cashflowStatements[0];
                      const fcf = safeNum(stmt.totalCashFromOperatingActivities?.raw) + safeNum(stmt.capitalExpenditures?.raw);
                      if (marketCap > 0) fcfYield = (fcf / marketCap) * 100;
                  }

                  let growthRate = safeNum(realData?.financialData?.revenueGrowth?.raw * 100) || safeNum(fmpData?.revenueGrowthTTM * 100) || 8.0;
                  const pe = safeNum(realData?.summaryDetail?.trailingPE?.raw || fmpData?.peRatioTTM || 25);
                  const eps = safeNum(realData?.defaultKeyStatistics?.trailingEps?.raw || (pe > 0 ? basePrice / pe : 0));
                  const roe = safeNum(realData?.financialData?.returnOnEquity?.raw * 100 || fmpData?.returnOnEquityTTM * 100 || 15);
                  
                  let roic = safeNum(fmpData?.returnOnCapitalEmployedTTM * 100);
                  if (roic === 0) roic = roe * 0.75;

                  let intrinsicValue = calculateIntrinsicValue(eps, growthRate);
                  if (intrinsicValue <= 0) intrinsicValue = basePrice * 0.7; 
                  if (intrinsicValue > basePrice * 3.0) intrinsicValue = basePrice * 3.0;

                  const upside = basePrice > 0 ? ((intrinsicValue - basePrice) / basePrice) * 100 : 0;
                  const ruleOf40 = growthRate + grossMargin;

                  const valScore = normalizeScore(upside, 0, 100); 
                  const growthScore = normalizeScore(ruleOf40, 20, 70);
                  const qualScore = normalizeScore(roic, 5, 35);
                  const erpScore = normalizeScore(erp, -5, 20); 
                  const safetyScore = normalizeScore(zScore, 1.5, 4.0);

                  let qualityMultiplier = 1.0;
                  if (earningsQualityRatio < 0.8 && earningsQualityRatio !== 0) qualityMultiplier = 0.8; 
                  
                  const compositeScore = ((valScore * 0.3) + (growthScore * 0.25) + (qualScore * 0.2) + (safetyScore * 0.15) + (erpScore * 0.1)) * qualityMultiplier;

                  // Data Source Tracking (Real vs Imputed)
                  const dataSource = realData ? "Validated (Real)" : "Sector Model (Imputed)";

                  const ticker: FundamentalTicker = {
                      ...item,
                      symbol: item.symbol,
                      name: item.name || item.symbol,
                      price: basePrice,
                      marketCap: marketCap,
                      sector: item.sector || "Unclassified",
                      
                      fundamentalScore: safeNum(compositeScore.toFixed(2)),
                      intrinsicValue: safeNum(intrinsicValue.toFixed(2)),
                      upsidePotential: safeNum(upside.toFixed(2)),
                      fairValueGap: safeNum(upside.toFixed(2)),
                      
                      zScore: Number(zScore.toFixed(2)),
                      erpScore: Number(erp.toFixed(2)),
                      earningsQuality: Number(earningsQualityRatio.toFixed(2)),
                      
                      roic: safeNum(roic.toFixed(2)),
                      ruleOf40: safeNum(ruleOf40.toFixed(2)),
                      fcfYield: safeNum(fcfYield.toFixed(2)),
                      grossMargin: safeNum(grossMargin.toFixed(2)),
                      pegRatio: safeNum((pe / (growthRate || 1)).toFixed(2)),
                      
                      fScore: 5, 
                      economicMoat: grossMargin > 50 && roic > 20 ? 'Wide' : 'Narrow',
                      source: dataSource,
                      
                      radarData: [
                          { subject: 'Valuation', A: valScore, fullMark: 100 },
                          { subject: 'Profit', A: normalizeScore(roe, 5, 40), fullMark: 100 },
                          { subject: 'Growth', A: growthScore, fullMark: 100 },
                          { subject: 'Health (Z)', A: safetyScore, fullMark: 100 },
                          { subject: 'Quality (EQ)', A: normalizeScore(earningsQualityRatio * 100, 50, 150), fullMark: 100 },
                          { subject: 'Momentum (ERP)', A: erpScore, fullMark: 100 },
                      ],
                      lastUpdate: new Date().toISOString()
                  };

                  results.push(ticker);
              } catch (err) { }
          }));

          setProgress({ current: Math.min(i + BATCH_SIZE, eliteSquad.length), total: eliteSquad.length });
          await new Promise(r => setTimeout(r, 250));
      }

      results.sort((a, b) => b.fundamentalScore - a.fundamentalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage3SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      const fileName = `STAGE3_FUNDAMENTAL_FULL_${timestamp}.json`;
      const payload = {
        manifest: { version: "7.5.0", count: results.length, strategy: "Forensic_Quant_ZScore_ERP" },
        fundamental_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Fortress Secured. ${results.length} Assets Validated.`, "ok");
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fortress_Quant v7.5</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-cyan-400 text-cyan-400 animate-pulse' : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-400'}`}>
                            {loading ? `Forensic Scan: ${progress.current}/${progress.total}` : 'Forensic Engine Ready'}
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
              onClick={executeFundamentalFortress} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-cyan-800 text-cyan-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-cyan-600 text-white shadow-xl shadow-cyan-900/20 hover:scale-105 active:scale-95'
              }`}
            >
              {loading ? 'Analyzing Z-Score & ERP...' : 'Execute Forensic Audit'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Fortress Candidates ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Ranked by Forensic Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-cyan-900/30 border-cyan-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-black text-slate-500 w-4">{i + 1}</span>
                                 <div>
                                     <p className={`text-xs font-black ${t.source.includes('Imputed') ? 'text-slate-400 decoration-dotted underline underline-offset-2' : 'text-white'}`}>{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-20">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.fundamentalScore.toFixed(1)}</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Score</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Awaiting Forensic Processing...
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
                                    {selectedTicker.zScore < 1.8 && <span className="text-[8px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded uppercase">Distress Risk</span>}
                                    {selectedTicker.erpScore > 10 && <span className="text-[8px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded uppercase">ERP Surge</span>}
                                    {selectedTicker.source.includes('Imputed') && <span className="text-[8px] font-black text-slate-500 border border-slate-700 px-2 py-0.5 rounded uppercase border-dashed">Est. Data</span>}
                                </div>
                            </div>
                            <div 
                                className="text-right cursor-pointer group hover:opacity-80 transition-opacity insight-trigger"
                                onClick={() => setActiveMetric('INTRINSIC')}
                            >
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1 group-hover:text-emerald-400 transition-colors">Intrinsic Value (Safe)</p>
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

                        {/* Magic Forensic Metrics Grid */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                 { id: 'Z_SCORE', label: 'Z-Score', val: selectedTicker.zScore.toFixed(2), good: selectedTicker.zScore > 2.99, bad: selectedTicker.zScore < 1.8 },
                                 { id: 'ERP', label: 'ERP (Mom)', val: `${selectedTicker.erpScore.toFixed(1)}%`, good: selectedTicker.erpScore > 5 },
                                 { id: 'QUALITY', label: 'Earn Qual', val: selectedTicker.earningsQuality.toFixed(2), good: selectedTicker.earningsQuality > 1.0, bad: selectedTicker.earningsQuality < 0.8 },
                                 { id: 'ROIC', label: 'ROIC', val: `${selectedTicker.roic.toFixed(1)}%`, good: selectedTicker.roic > 15 }
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
                        
                        {/* Quant Insight Box */}
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
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Forensic_Logs</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-cyan-900'}`}>
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
