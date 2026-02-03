
import React, { useState, useEffect, useRef } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface TechnicalTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;
  volume: number;
  
  technicalScore: number;
  
  techMetrics: {
      rsi: number;
      adx: number;
      trend: number; // 0-100
      rvol: number;
      squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT';
      rsRating: number;
      momentum: number;
  };
  
  // Visualization
  priceHistory: { date: string; close: number }[];
  
  sector: string;
  lastUpdate: string;
  
  // Data Preservation
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [KNOWLEDGE BASE] Technical Definitions
const TECH_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'RSI': {
        title: "RSI (Relative Strength Index)",
        desc: "최근 14일간의 주가 상승폭과 하락폭을 비교하여 과매수/과매도 구간을 판단하는 모멘텀 지표입니다.",
        interpretation: "70 이상은 과매수(잠재적 조정), 30 이하는 과매도(반등 가능성)로 간주합니다. 50 이상에서의 반등은 강세장 지속을 의미합니다."
    },
    'SQUEEZE': {
        title: "TTM Squeeze (Bollinger + Keltner)",
        desc: "변동성이 극도로 축소된 상태(Squeeze)를 탐지합니다. 볼린저 밴드가 켈트너 채널 안으로 들어오면 에너지가 응축된 것입니다.",
        interpretation: "'SQUEEZE_ON' 상태는 조만간 강한 추세 폭발이 임박했음을 암시합니다. 횡보 구간에서의 매집 신호로 활용됩니다."
    },
    'RVOL': {
        title: "Relative Volume (RVOL)",
        desc: "평소(20일 평균) 대비 현재 거래량의 비율입니다. 주가 움직임의 신뢰도를 결정하는 핵심 척도입니다.",
        interpretation: "1.5x 이상은 기관의 개입(Institutional Interest)을 의미하며, 3.0x 이상의 폭발적 거래량은 추세 전환의 강력한 신호입니다."
    },
    'TREND': {
        title: "Trend Strength (EMA)",
        desc: "단기(20일) 및 중기(50일) 이동평균선의 배열 상태와 이격도를 종합하여 추세의 강도를 점수화한 지표입니다.",
        interpretation: "점수가 높을수록 정배열(Uptrend)이 강하며, 낮은 점수는 역배열 또는 혼조세를 의미합니다."
    }
};

const TechnicalAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<TechnicalTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<TechnicalTicker | null>(null);
  const [activeMetric, setActiveMetric] = useState<string | null>(null); // Interactive Explanation State
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> Tech_Tactician v4.2: Momentum Engine Online.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Click Outside Handler for Insights
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.tech-insight-card') && !target.closest('.tech-insight-overlay')) {
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
        addLog("AUTO-PILOT: Engaging Technical Momentum Scan...", "signal");
        executeTechnicalScan();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTickerSelect = (ticker: TechnicalTicker) => {
      setSelectedTicker(ticker);
      setActiveMetric(null);
      if (onStockSelected) {
          onStockSelected(ticker);
      }
  };

  // --- TECHNICAL CALCULATIONS ---
  const calculateRSI = (prices: number[], period = 14) => {
      if (prices.length < period + 1) return 50;
      let gains = 0, losses = 0;
      for (let i = 1; i <= period; i++) {
          const diff = prices[i] - prices[i - 1];
          if (diff >= 0) gains += diff;
          else losses -= diff;
      }
      let avgGain = gains / period;
      let avgLoss = losses / period;
      
      for (let i = period + 1; i < prices.length; i++) {
          const diff = prices[i] - prices[i - 1];
          const gain = diff >= 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;
          avgGain = (avgGain * (period - 1) + gain) / period;
          avgLoss = (avgLoss * (period - 1) + loss) / period;
      }
      
      if (avgLoss === 0) return 100;
      const rs = avgGain / avgLoss;
      return 100 - (100 / (1 + rs));
  };

  const fetchCandles = async (symbol: string) => {
      if (!polygonKey) return null;
      const to = new Date().toISOString().split('T')[0];
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 100); // ~3 months data
      const from = fromDate.toISOString().split('T')[0];
      
      try {
          const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${polygonKey}`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const json = await res.json();
          return json.results || []; // { c, h, l, o, v, t }
      } catch (e) {
          return null;
      }
  };

  const executeTechnicalScan = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    setProcessedData([]);
    startTimeRef.current = Date.now();
    
    try {
      // 1. Load Stage 3 Data
      const q = encodeURIComponent(`name contains 'STAGE3_FUNDAMENTAL_FULL' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 3 Data Missing. Please run Stage 3.", "err");
        setLoading(false); return;
      }
      
      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const universe = content.fundamental_universe || [];
      // Sort by fundamental score to prioritize quality, take top portion
      const candidates = universe.sort((a: any, b: any) => b.fundamentalScore - a.fundamentalScore).slice(0, 300); 
      
      setProgress({ current: 0, total: candidates.length });
      
      const results: TechnicalTicker[] = [];
      const BATCH_SIZE = 5;

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
          const batch = candidates.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (item: any) => {
              try {
                  const candles = await fetchCandles(item.symbol);
                  
                  let rsi = 50, rvol = 1.0, trend = 50, momentum = 50;
                  let priceHistory: any[] = [];
                  let squeezeState: any = 'SQUEEZE_OFF';

                  if (candles && candles.length > 20) {
                      const closes = candles.map((c: any) => c.c);
                      const volumes = candles.map((c: any) => c.v);
                      
                      rsi = calculateRSI(closes);
                      priceHistory = candles.map((c: any) => ({
                          date: new Date(c.t).toISOString().split('T')[0],
                          close: c.c
                      }));

                      // RVOL (Last vol / Avg 20 vol)
                      const lastVol = volumes[volumes.length - 1];
                      const avgVol = volumes.slice(-21, -1).reduce((a:number, b:number) => a + b, 0) / 20;
                      rvol = avgVol > 0 ? lastVol / avgVol : 1;

                      // Trend (SMA 20 vs SMA 50)
                      const sma20 = closes.slice(-20).reduce((a:number, b:number) => a + b, 0) / 20;
                      const sma50 = closes.slice(-50).reduce((a:number, b:number) => a + b, 0) / 50;
                      
                      const trendScore = (closes[closes.length - 1] > sma20 ? 30 : 0) + 
                                         (sma20 > sma50 ? 40 : 0) + 
                                         (rsi > 50 ? 30 : 0);
                      trend = Math.min(100, trendScore);
                      momentum = rsi;

                      // TTM Squeeze Logic (Simplified Bollinger Band Width)
                      // Low volatility often precedes big move
                      const stdDev = Math.sqrt(closes.slice(-20).reduce((a:number, b:number) => a + Math.pow(b - sma20, 2), 0) / 20);
                      const bbWidth = (4 * stdDev) / sma20; // (Upper - Lower) / Middle
                      if (bbWidth < 0.10) squeezeState = 'SQUEEZE_ON'; // Very tight
                  }

                  // Composite Tech Score
                  let techScore = (trend * 0.4) + (rvol * 20) + (rsi >= 40 && rsi <= 70 ? 20 : 0);
                  if (squeezeState === 'SQUEEZE_ON') techScore += 15;
                  
                  // Sanitize
                  techScore = Math.min(100, Math.max(0, techScore));

                  const ticker: TechnicalTicker = {
                      ...item, // Preserve Fundamental Data
                      technicalScore: Number(techScore.toFixed(2)),
                      techMetrics: {
                          rsi: Number(rsi.toFixed(2)),
                          adx: 0, // Placeholder
                          trend: Number(trend.toFixed(2)),
                          rvol: Number(rvol.toFixed(2)),
                          squeezeState,
                          rsRating: 50, // Placeholder
                          momentum: Number(momentum.toFixed(2))
                      },
                      priceHistory,
                      lastUpdate: new Date().toISOString()
                  };
                  
                  results.push(ticker);

              } catch (e) { console.warn(`Tech fail ${item.symbol}`, e); }
          }));

          setProgress({ current: Math.min(i + BATCH_SIZE, candidates.length), total: candidates.length });
          await new Promise(r => setTimeout(r, 200)); // Rate limit protection
      }

      results.sort((a, b) => b.technicalScore - a.technicalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const fileName = `STAGE4_TECHNICAL_FULL_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "4.2.0", count: results.length, strategy: "Momentum_Squeeze_Scan" },
        technical_universe: results
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Tech Analysis Complete. ${results.length} Tickers Scored & Saved.`, "ok");
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-orange-400 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Tech_Tactician v4.2</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-orange-400 text-orange-400 animate-pulse' : 'border-orange-500/20 bg-orange-500/10 text-orange-400'}`}>
                            {loading ? `Calculating: ${progress.current}/${progress.total}` : 'Momentum Engine Active'}
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
            <button onClick={executeTechnicalScan} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Scanning Volatility...' : 'Execute Momentum Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Tech Momentum Rank ({processedData.length})</p>
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
                             Waiting for Technical Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - COCKPIT */}
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
                                     {selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' && (
                                         <span className="text-[8px] font-black bg-rose-500 text-white px-2 py-0.5 rounded animate-pulse uppercase">TTM Squeeze Active</span>
                                     )}
                                     <span className="text-[8px] font-black bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 uppercase">RVOL {selectedTicker.techMetrics.rvol}x</span>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">Momentum</p>
                                 <p className="text-2xl font-black text-orange-400 tracking-tighter">{selectedTicker.techMetrics.momentum}</p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4 my-2">
                             {selectedTicker.priceHistory && selectedTicker.priceHistory.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={selectedTicker.priceHistory}>
                                        <defs>
                                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.1} vertical={false} />
                                        <XAxis dataKey="date" hide />
                                        <YAxis domain={['auto', 'auto']} hide />
                                        <RechartsTooltip 
                                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }} 
                                            itemStyle={{ color: '#f97316' }}
                                        />
                                        <Area type="monotone" dataKey="close" stroke="#f97316" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                             ) : (
                                 <div className="h-full flex items-center justify-center opacity-20 text-[8px] font-mono">NO CHART DATA</div>
                             )}
                        </div>

                        {/* Interactive Metrics Grid */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                { id: 'RSI', label: 'RSI (14)', val: selectedTicker.techMetrics.rsi, good: selectedTicker.techMetrics.rsi < 30 || selectedTicker.techMetrics.rsi > 70 },
                                { id: 'SQUEEZE', label: 'TTM Squeeze', val: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'ON' : 'OFF', good: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' },
                                { id: 'RVOL', label: 'RVOL', val: `${selectedTicker.techMetrics.rvol}x`, good: selectedTicker.techMetrics.rvol > 1.5 },
                                { id: 'TREND', label: 'Trend (EMA)', val: selectedTicker.techMetrics.trend, good: selectedTicker.techMetrics.trend > 70 }
                             ].map((m) => (
                                 <div 
                                    key={m.id} 
                                    onClick={() => setActiveMetric(m.id)}
                                    className={`tech-insight-card p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 group ${activeMetric === m.id ? 'bg-orange-600 border-orange-400 text-white shadow-lg' : m.good ? 'bg-orange-900/20 border-orange-500/30' : 'bg-slate-800 border-white/5 hover:bg-slate-700'}`}
                                 >
                                     <div className="flex items-center justify-center gap-1 mb-0.5">
                                        <p className={`text-[7px] uppercase font-bold ${activeMetric === m.id ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'}`}>{m.label}</p>
                                     </div>
                                     <p className={`text-[10px] font-black ${activeMetric === m.id ? 'text-white' : m.good ? 'text-orange-400' : 'text-slate-300'}`}>{m.val}</p>
                                 </div>
                             ))}
                        </div>

                        {/* Tech Insight Overlay */}
                        {activeMetric && TECH_DEFINITIONS[activeMetric] && (
                            <div className="tech-insight-overlay absolute bottom-20 left-6 right-6 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-orange-500/30 shadow-2xl relative">
                                    <button onClick={() => setActiveMetric(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    <h5 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                        {TECH_DEFINITIONS[activeMetric].title}
                                    </h5>
                                    <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{TECH_DEFINITIONS[activeMetric].desc}</p>
                                    <div className="bg-white/5 p-2 rounded border border-white/5">
                                        <p className="text-[8px] text-emerald-400 font-bold mb-0.5">💡 Strategy:</p>
                                        <p className="text-[8px] text-slate-400">{TECH_DEFINITIONS[activeMetric].interpretation}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                     </div>
                 ) : (
                     <div className="h-full flex flex-col items-center justify-center opacity-20">
                         <svg className="w-16 h-16 text-slate-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
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
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Tech_Log</h3>
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
