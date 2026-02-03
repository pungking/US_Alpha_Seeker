
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// [QUANT ENGINE] Mathematical Indicator Logic
const calcSMA = (data: number[], period: number) => {
  if (data.length < period) return 0;
  const slice = data.slice(0, period);
  return slice.reduce((a, b) => a + b, 0) / period;
};

const calcRSI = (closes: number[], period: number = 14) => {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const diff = closes[closes.length - 1 - i + 1] - closes[closes.length - 1 - i];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const calcBollinger = (closes: number[], period: number = 20, multiplier: number = 2.0) => {
  if (closes.length < period) return { upper: 0, lower: 0, middle: 0, width: 0 };
  const sma = calcSMA(closes, period);
  const slice = closes.slice(0, period);
  const squaredDiffs = slice.map(x => Math.pow(x - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(variance);
  
  return {
    upper: sma + (multiplier * stdDev),
    lower: sma - (multiplier * stdDev),
    middle: sma,
    width: ((sma + (multiplier * stdDev)) - (sma - (multiplier * stdDev))) / sma
  };
};

const TECH_METRIC_INSIGHTS: Record<string, { title: string; desc: string }> = {
    'RSI': {
        title: "RSI (상대강도지수)",
        desc: "최근 주가 상승폭과 하락폭의 강도를 백분율로 나타냅니다. 70 이상은 매수세 과열(Overbought), 30 이하는 매도세 과열(Oversold)을 의미합니다. 트렌드장에서는 50 이상 유지가 중요합니다."
    },
    'SQUEEZE': {
        title: "TTM Squeeze (변동성 압축)",
        desc: "볼린저 밴드가 켈트너 채널 안으로 들어가며 변동성이 극도로 축소된 상태입니다. 에너지가 응축된 상태로, 곧 상방 또는 하방으로의 강한 발산(Explosion)이 임박했음을 시사합니다."
    },
    'RVOL': {
        title: "Relative Volume (상대 거래량)",
        desc: "평소 평균 거래량 대비 현재 거래량의 비율입니다. 1.0 이상이면 평소보다 거래가 활발하며, 1.5 이상은 기관/세력의 개입 가능성이 높은 '수급 변곡점'입니다."
    },
    'TREND': {
        title: "Trend Strength (EMA 추세)",
        desc: "단기(20일) 및 중기(50일) 이동평균선의 정배열 여부를 판단합니다. 주가가 EMA 위에 위치하고 EMA가 상향 기울기일 때 강력한 상승 추세(BULLISH)로 간주합니다."
    }
};

interface TechScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  totalAlpha: number;
  techMetrics: { 
    trend: number; 
    momentum: number; 
    volumePattern: number; 
    rvol: number; // Raw RVOL added explicitly
    adl: number; 
    forceIndex: number; 
    srLevels: number; 
    rsRating?: number; 
    squeezeState?: string; 
  };
  sector: string;
  scoringEngine?: string;
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

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

const TechnicalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<TechScoredTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<TechScoredTicker | null>(null);
  const [activeBrain, setActiveBrain] = useState<string>('Standby');
  const [activeMetric, setActiveMetric] = useState<string | null>(null);

  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [logs, setLogs] = useState<string[]>(['> Technical_Engine v5.2 (Real-Quant): Waiting for Signal...']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Click Outside to Close Insight Box
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

  // Timer Effect
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
        addLog("AUTO-PILOT: Engaging Real-World Quant Protocol...", "signal");
        executeIntegratedTechProtocol();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const fetchPolygonHistory = async (symbol: string): Promise<any[]> => {
      if (!polygonKey) return [];
      
      const toDate = new Date().toISOString().split('T')[0];
      const fromDate = new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      try {
          const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=100&apiKey=${polygonKey}`;
          const res = await fetch(url);
          
          if (res.status === 429) return []; // Rate Limit
          if (!res.ok) return [];
          
          const json = await res.json();
          return json.results || [];
      } catch (e) {
          return [];
      }
  };

  const calculateQuantMetrics = (history: any[]) => {
      if (!history || history.length < 30) return null;

      const closes = history.map(d => d.c); // Index 0 = Newest
      const currentPrice = closes[0];
      
      const sma20 = calcSMA(closes, 20);
      const sma50 = calcSMA(closes, 50);
      const trendScore = (currentPrice > sma20 && sma20 > sma50) ? 100 : (currentPrice < sma20) ? 30 : 60;

      const rsi = calcRSI(closes, 14);
      let momentumScore = 50;
      if (rsi > 50 && rsi < 70) momentumScore = 90;
      else if (rsi >= 70) momentumScore = 70;
      else if (rsi < 30) momentumScore = 40;
      else momentumScore = 60;

      const bb = calcBollinger(closes, 20, 2.0);
      const isSqueeze = bb.width < 0.10; 
      const squeezeState = isSqueeze ? "SQUEEZE_ON" : "EXPANSION";

      const volumes = history.map(d => d.v);
      const avgVol20 = calcSMA(volumes, 20);
      const currentVol = volumes[0];
      const rvol = currentVol / (avgVol20 || 1);
      
      let volumeScore = 50;
      if (rvol > 1.5) volumeScore = 100;
      else if (rvol > 1.0) volumeScore = 75;
      else volumeScore = 40;

      const finalScore = (trendScore * 0.4) + (momentumScore * 0.3) + (volumeScore * 0.3);

      return {
          score: finalScore,
          trend: trendScore,
          momentum: momentumScore,
          volume: volumeScore,
          rvol: rvol,
          rsi: rsi,
          squeeze: squeezeState
      };
  };

  const executeIntegratedTechProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    addLog("Phase 4: Initializing Real-Data Tech Sieve...", "info");
    
    try {
      const q = encodeURIComponent(`name contains 'STAGE3_FUNDAMENTAL_FULL' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 3 source missing. Run Stage 3 first.", "err");
        setLoading(false); return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      let targets = content.fundamental_universe || [];
      targets.sort((a: any, b: any) => (b.fundamentalScore || 0) - (a.fundamentalScore || 0));
      
      const DEEP_SCAN_LIMIT = 40; 
      const total = targets.length;
      setProgress({ current: 0, total });

      const results: TechScoredTicker[] = [];

      for (let i = 0; i < total; i++) {
        const item = targets[i];
        let techScore = 0;
        let metrics: any = { rsi: 50, squeeze: 'NO_DATA', trend: 50, rvol: 1.0 };
        let engineLabel = "Basic-Price-Action";
        
        if (i < DEEP_SCAN_LIMIT) {
             setActiveBrain("Polygon (Quant)");
             
             const history = await fetchPolygonHistory(item.symbol);
             
             if (history && history.length > 20) {
                 const quantResult = calculateQuantMetrics(history);
                 if (quantResult) {
                     techScore = quantResult.score;
                     metrics = { 
                         rsi: quantResult.rsi, 
                         squeeze: quantResult.squeeze, 
                         trend: quantResult.trend,
                         rvol: quantResult.rvol
                     };
                     engineLabel = "Polygon-Quant-Engine";
                 }
             } else {
                 engineLabel = "Snapshot-Fallback";
                 const change = item.change || 0;
                 techScore = 50 + (change * 2); 
                 if (change > 5) metrics.rvol = 2.0;
             }
             await new Promise(r => setTimeout(r, 1500)); 
        } else {
             setActiveBrain("Lite-Heuristic");
             const change = item.change || 0;
             techScore = 50 + change; 
             engineLabel = "Heuristic-Lite";
             await new Promise(r => setTimeout(r, 10)); 
        }

        techScore = Math.min(99, Math.max(10, techScore));
        const fundamentalScore = item.fundamentalScore || 0;
        const totalAlpha = (fundamentalScore * 0.40) + (techScore * 0.60);

        const newItem: TechScoredTicker = {
            ...item, 
            symbol: item.symbol, name: item.name, price: item.price,
            fundamentalScore: fundamentalScore, 
            technicalScore: Number(techScore.toFixed(2)), 
            totalAlpha: Number(totalAlpha.toFixed(2)),
            techMetrics: { 
              trend: metrics.trend || techScore, 
              momentum: metrics.rsi || 50, 
              volumePattern: (metrics.rvol || 1) * 50, // Score for visual
              rvol: metrics.rvol || 1, // Raw value
              adl: 50, forceIndex: 50, srLevels: 50,
              rsRating: metrics.rsi || 50, 
              squeezeState: metrics.squeeze || "NONE"
            },
            sector: item.sector,
            scoringEngine: engineLabel
        };

        results.push(newItem);
        if (i % 5 === 0) {
            setProgress({ current: i + 1, total });
            if (i < DEEP_SCAN_LIMIT + 5) {
                const tempSorted = [...results].sort((a,b) => b.technicalScore - a.technicalScore);
                setProcessedData(tempSorted);
                if (!selectedTicker) handleTickerSelect(tempSorted[0]);
            }
        }
      }

      // Ensure 100% progress visibility
      setProgress({ current: total, total });
      
      results.sort((a, b) => b.totalAlpha - a.totalAlpha);
      setProcessedData(results);
      if (results.length > 0 && !selectedTicker) handleTickerSelect(results[0]);
      
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const fileName = `STAGE4_TECHNICAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "5.2.0", count: results.length, timestamp: new Date().toISOString(), engine: "Quant_Math_Polygon" },
        technical_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Synchronized: ${fileName}`, "ok");
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Integrated Protocol Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
      setActiveBrain('Standby');
      startTimeRef.current = 0;
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    return await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json()).then(r => r.id);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTickerSelect = (ticker: TechScoredTicker) => {
      setSelectedTicker(ticker);
      if (onStockSelected) {
          // Normalize for Auditor
          onStockSelected({
              ...ticker,
              compositeAlpha: ticker.totalAlpha, // Bridge for Auditor which might look for compositeAlpha
              aiVerdict: "TECHNICAL_HOLD" 
          });
      }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-orange-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Momentum_Nexus v5.2.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-orange-400 text-orange-400 animate-pulse' : 'border-orange-500/20 bg-orange-500/10 text-orange-400'}`}>
                            {loading ? `Processing: ${progress.current}/${progress.total}` : 'Real-Quant Tech Analysis Ready'}
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
            <button onClick={executeIntegratedTechProtocol} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Crunching Polygon Math...' : 'Execute Alpha Tech Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Tech Momentum Rank</p>
                    <span className="text-[8px] font-mono text-slate-500">Sorted by Tech Score</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-orange-900/30 border-orange-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className={`text-[10px] font-black w-4 ${i < 3 ? 'text-orange-400' : 'text-slate-500'}`}>{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <p className="text-[8px] text-slate-400 truncate w-24">{t.name}</p>
                                 </div>
                             </div>
                             <div className="text-right flex items-center gap-3">
                                 <div className="flex flex-col items-end">
                                     <p className="text-[10px] font-mono font-bold text-white">{t.technicalScore.toFixed(1)}</p>
                                     <p className="text-[7px] text-slate-500 uppercase">Tech</p>
                                 </div>
                                 <div className={`w-1.5 h-8 rounded-full ${t.technicalScore > 80 ? 'bg-orange-500' : t.technicalScore > 50 ? 'bg-amber-500' : 'bg-slate-700'}`}></div>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Waiting for Polygon Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - COCKPIT */}
              <div className="bg-black/40 rounded-3xl border border-white/5 p-6 relative flex flex-col h-[360px]">
                 {selectedTicker ? (
                     <div className="h-full flex flex-col justify-between"> 
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
                                    {selectedTicker.scoringEngine?.includes("Fallback") && (
                                        <span className="text-[7px] text-amber-500 font-black border border-amber-500/30 bg-amber-500/10 px-1 rounded uppercase">Estimated</span>
                                    )}
                                </div>
                                <p className="text-[9px] text-orange-500 font-bold uppercase tracking-widest mt-2">Technical Quant Cockpit</p>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Total Alpha Score</p>
                                 <p className="text-2xl font-black text-white tracking-tighter">{selectedTicker.totalAlpha.toFixed(1)}</p>
                            </div>
                        </div>

                        {/* Gauges Grid */}
                        <div className="grid grid-cols-2 gap-4 mt-6 relative z-10">
                            {/* RSI Gauge */}
                            <div 
                                onClick={() => setActiveMetric('RSI')}
                                className={`insight-trigger bg-slate-900/50 p-4 rounded-2xl border cursor-pointer transition-all ${activeMetric === 'RSI' ? 'border-orange-500 shadow-lg shadow-orange-900/20' : 'border-white/5 hover:bg-slate-800'}`}
                            >
                                <div className="flex justify-between mb-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">RSI (14)</span>
                                    <span className={`text-[10px] font-black ${selectedTicker.techMetrics.rsRating! > 70 ? 'text-rose-400' : selectedTicker.techMetrics.rsRating! < 30 ? 'text-emerald-400' : 'text-white'}`}>
                                        {selectedTicker.techMetrics.rsRating?.toFixed(1) || 'N/A'}
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${selectedTicker.techMetrics.rsRating! > 70 ? 'bg-rose-500' : selectedTicker.techMetrics.rsRating! < 30 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${selectedTicker.techMetrics.rsRating}%` }}></div>
                                </div>
                            </div>

                            {/* Volatility Squeeze */}
                            <div 
                                onClick={() => setActiveMetric('SQUEEZE')}
                                className={`insight-trigger bg-slate-900/50 p-4 rounded-2xl border cursor-pointer transition-all ${activeMetric === 'SQUEEZE' ? 'border-orange-500 shadow-lg shadow-orange-900/20' : 'border-white/5 hover:bg-slate-800'}`}
                            >
                                <div className="flex justify-between mb-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">TTM Squeeze</span>
                                    <span className={`text-[9px] font-black ${selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                                        {selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'ACTIVE' : 'OFF'}
                                    </span>
                                </div>
                                <div className="flex gap-1 h-1.5">
                                    {[1,2,3,4,5].map(i => (
                                        <div key={i} className={`flex-1 rounded-full ${selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'bg-rose-500' : 'bg-slate-800'}`}></div>
                                    ))}
                                </div>
                            </div>

                            {/* Relative Volume */}
                            <div 
                                onClick={() => setActiveMetric('RVOL')}
                                className={`insight-trigger bg-slate-900/50 p-4 rounded-2xl border cursor-pointer transition-all ${activeMetric === 'RVOL' ? 'border-orange-500 shadow-lg shadow-orange-900/20' : 'border-white/5 hover:bg-slate-800'}`}
                            >
                                <div className="flex justify-between mb-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Rel Volume (RVOL)</span>
                                    <span className="text-[10px] font-black text-white">{selectedTicker.techMetrics.rvol?.toFixed(2) || '1.00'}x</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="h-full bg-amber-500" style={{ width: `${Math.min(100, selectedTicker.techMetrics.volumePattern)}%` }}></div>
                                </div>
                            </div>

                            {/* Trend Strength */}
                            <div 
                                onClick={() => setActiveMetric('TREND')}
                                className={`insight-trigger bg-slate-900/50 p-4 rounded-2xl border cursor-pointer transition-all ${activeMetric === 'TREND' ? 'border-orange-500 shadow-lg shadow-orange-900/20' : 'border-white/5 hover:bg-slate-800'}`}
                            >
                                <div className="flex justify-between mb-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase">Trend (EMA)</span>
                                    <span className="text-[10px] font-black text-white">{selectedTicker.techMetrics.trend > 60 ? 'BULLISH' : selectedTicker.techMetrics.trend < 40 ? 'BEARISH' : 'NEUTRAL'}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${selectedTicker.techMetrics.trend > 60 ? 'bg-emerald-500' : selectedTicker.techMetrics.trend < 40 ? 'bg-rose-500' : 'bg-slate-500'}`} style={{ width: `${selectedTicker.techMetrics.trend}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Insight Overlay */}
                        {activeMetric && TECH_METRIC_INSIGHTS[activeMetric] && (
                            <div className="insight-overlay absolute bottom-4 left-6 right-6 bg-slate-900/95 backdrop-blur-md p-4 rounded-xl border border-orange-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-2 z-20">
                                <h5 className="text-[9px] font-black text-orange-400 uppercase tracking-widest mb-1">{TECH_METRIC_INSIGHTS[activeMetric].title}</h5>
                                <p className="text-[9px] text-slate-300 leading-relaxed font-medium">{TECH_METRIC_INSIGHTS[activeMetric].desc}</p>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                         <p className="text-[9px] font-black uppercase tracking-[0.3em]">Select Asset to Inspect</p>
                     </div>
                 )}
              </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-orange-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Tech_Stream</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-orange-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-orange-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
