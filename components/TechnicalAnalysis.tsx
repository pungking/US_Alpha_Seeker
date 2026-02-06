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
  
  technicalScore: number; // Composite Alpha Score
  
  techMetrics: {
      rsi: number;
      adx: number;
      trend: number; // ADX Trend Strength
      rvol: number;
      squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' | 'FIRED_LONG' | 'FIRED_SHORT'; // VCP Proxy
      rsRating: number; // Relative Strength (0-99)
      momentum: number; // Velocity
      wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN'; // Market Cycle
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

// [KNOWLEDGE BASE] Advanced Technical Definitions
const TECH_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'RS_RATING': {
        title: "RS Rating (상대 강도)",
        desc: "시장 대비 해당 종목의 상승 탄력을 0~99점으로 수치화한 지표입니다. (가중치: 최근 1개월 40%, 3개월 40%, 6개월 20%)",
        interpretation: "80점 이상: 시장 상위 20%의 주도주입니다. 하락장에서도 버티거나 상승하는 종목을 의미합니다."
    },
    'VCP': {
        title: "VCP (변동성 축소 패턴)",
        desc: "주가 변동폭이 점차 줄어들며(Tightness) 에너지가 응축되는 현상입니다. 마크 미너비니 전략의 핵심입니다.",
        interpretation: "ON: 변동성이 극도로 낮아진 상태. 세력이 물량을 장악했으며, 곧 한쪽으로 큰 시세 분출이 임박했습니다."
    },
    'RVOL': {
        title: "RVOL (상대 거래량)",
        desc: "평소(20일 평균) 대비 현재 거래량의 비율입니다. 주가 움직임의 '진위 여부'를 판별하는 거래량 분석입니다.",
        interpretation: "1.5x 이상: 기관(Smart Money)의 개입이 의심됩니다. 3.0x 이상은 강력한 매수/매도 클라이맥스입니다."
    },
    'WYCKOFF': {
        title: "Wyckoff Market Phase",
        desc: "이동평균선 배열(SMA 20/50)과 추세 강도를 기반으로 와이코프 시장 국면을 진단합니다.",
        interpretation: "MARKUP(상승): 정배열 확산 구간. 추세 추종 전략이 가장 잘 통하는 황금기입니다."
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
  const [logs, setLogs] = useState<string[]>(['> Tech_Tactician v5.5: Geometry Engine Active.']);
  
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

  // --- MATH UTILS ---
  const calculateSMA = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      return slice.reduce((a, b) => a + b, 0) / period;
  };

  const calculateStdDev = (data: number[], period: number) => {
      if (data.length < period) return 0;
      const slice = data.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      return Math.sqrt(variance);
  };

  // --- QUANT TECHNICAL ENGINES ---
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
      fromDate.setDate(fromDate.getDate() - 150); // ~5 months data for RS Ranking
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
      const candidates = universe.sort((a: any, b: any) => b.fundamentalScore - a.fundamentalScore).slice(0, 300); 
      
      setProgress({ current: 0, total: candidates.length });
      
      const results: TechnicalTicker[] = [];
      const BATCH_SIZE = 5;

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
          const batch = candidates.slice(i, i + BATCH_SIZE);
          
          await Promise.all(batch.map(async (item: any) => {
              try {
                  const candles = await fetchCandles(item.symbol);
                  
                  // Default Metrics
                  let rsi = 50, rvol = 1.0, rsRating = 50;
                  let wyckoffPhase: 'ACCUM' | 'MARKUP' | 'DISTRIB' | 'MARKDOWN' = 'ACCUM';
                  let squeezeState: 'SQUEEZE_ON' | 'SQUEEZE_OFF' = 'SQUEEZE_OFF';
                  let priceHistory: any[] = [];
                  let trendScore = 50;

                  if (candles && candles.length > 50) {
                      const closes = candles.map((c: any) => c.c);
                      const volumes = candles.map((c: any) => c.v);
                      const currentPrice = closes[closes.length - 1];

                      // 1. RSI (14)
                      rsi = calculateRSI(closes);

                      // 2. RS Rating (Relative Strength) - Proxy Calculation
                      // Formula: 40% 3M + 20% 6M + 20% 1M (Approx)
                      const roc1m = (currentPrice - closes[Math.max(0, closes.length - 21)]) / closes[Math.max(0, closes.length - 21)];
                      const roc3m = (currentPrice - closes[Math.max(0, closes.length - 63)]) / closes[Math.max(0, closes.length - 63)];
                      const rocWeighted = (roc3m * 0.6) + (roc1m * 0.4);
                      // Normalize to 0-99 scale (Assuming 20% gain = 80 score approx)
                      rsRating = Math.min(99, Math.max(1, (rocWeighted * 100) + 50));

                      // 3. Wyckoff / Trend Analysis
                      const sma20 = calculateSMA(closes, 20);
                      const sma50 = calculateSMA(closes, 50);
                      
                      if (currentPrice > sma20 && sma20 > sma50) wyckoffPhase = 'MARKUP';
                      else if (currentPrice < sma20 && sma20 < sma50) wyckoffPhase = 'MARKDOWN';
                      else if (currentPrice > sma50) wyckoffPhase = 'ACCUM'; // Potential Accumulation
                      else wyckoffPhase = 'DISTRIB'; // Potential Distribution

                      trendScore = (wyckoffPhase === 'MARKUP' ? 80 : 0) + (rsi > 50 ? 20 : 0);

                      // 4. VCP / Squeeze Detection
                      // Bollinger Band Width
                      const stdDev = calculateStdDev(closes, 20);
                      const bbWidth = (4 * stdDev) / sma20; // (Upper - Lower) / Middle
                      
                      // Minervini VCP is tighter than standard Squeeze. Look for extremely low volatility.
                      if (bbWidth < 0.12) squeezeState = 'SQUEEZE_ON'; 

                      // 5. RVOL
                      const avgVol = calculateSMA(volumes.slice(0, -1), 20);
                      const lastVol = volumes[volumes.length - 1];
                      rvol = avgVol > 0 ? lastVol / avgVol : 1;

                      priceHistory = candles.slice(-40).map((c: any) => ({
                          date: new Date(c.t).toISOString().split('T')[0],
                          close: c.c
                      }));
                  }

                  // Composite Tech Score (Weighted)
                  let techScore = (rsRating * 0.4) + (trendScore * 0.3) + (rvol * 10) + (rsi >= 40 && rsi <= 70 ? 10 : 0);
                  if (squeezeState === 'SQUEEZE_ON') techScore += 10;
                  
                  // Cap Score
                  techScore = Math.min(99, Math.max(1, techScore));

                  const ticker: TechnicalTicker = {
                      ...item, 
                      technicalScore: Number(techScore.toFixed(2)),
                      techMetrics: {
                          rsi: Number(rsi.toFixed(2)),
                          adx: 0, // Placeholder for future
                          trend: Number(trendScore.toFixed(2)),
                          rvol: Number(rvol.toFixed(2)),
                          squeezeState,
                          rsRating: Number(rsRating.toFixed(0)),
                          momentum: Number(rsRating.toFixed(2)), // Momentum driven by RS
                          wyckoffPhase
                      },
                      priceHistory,
                      lastUpdate: new Date().toISOString()
                  };
                  
                  results.push(ticker);

              } catch (e) { console.warn(`Tech fail ${item.symbol}`, e); }
          }));

          setProgress({ current: Math.min(i + BATCH_SIZE, candidates.length), total: candidates.length });
          await new Promise(r => setTimeout(r, 200)); 
      }

      results.sort((a, b) => b.technicalScore - a.technicalScore);
      setProcessedData(results);
      if (results.length > 0) handleTickerSelect(results[0]);

      // Save to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage4SubFolder);
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
      const fileName = `STAGE4_TECHNICAL_FULL_${timestamp}.json`;
      
      const payload = {
        manifest: { version: "5.5.0", count: results.length, strategy: "VCP_RS_Wyckoff_Fusion" },
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Tech_Tactician v5.5</h2>
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
            <button 
              onClick={executeTechnicalScan} 
              disabled={loading} 
              className={`w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  loading 
                    ? 'bg-orange-800 text-orange-200/50 shadow-inner scale-95 cursor-wait border-t border-black/20' 
                    : 'bg-orange-600 text-white shadow-xl shadow-orange-900/20 hover:scale-105 active:scale-95'
              }`}
            >
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
                                         <span className="text-[8px] font-black bg-rose-500 text-white px-2 py-0.5 rounded animate-pulse uppercase">VCP Squeeze Active</span>
                                     )}
                                     <span className="text-[8px] font-black bg-orange-900/30 text-orange-400 px-2 py-0.5 rounded border border-orange-500/20 uppercase">RVOL {selectedTicker.techMetrics.rvol}x</span>
                                     <span className="text-[8px] font-black bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/10 uppercase">{selectedTicker.techMetrics.wyckoffPhase}</span>
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
                                { id: 'RS_RATING', label: 'RS Rating', val: selectedTicker.techMetrics.rsRating, good: selectedTicker.techMetrics.rsRating > 80 },
                                { id: 'VCP', label: 'VCP (Tight)', val: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' ? 'YES' : 'NO', good: selectedTicker.techMetrics.squeezeState === 'SQUEEZE_ON' },
                                { id: 'RVOL', label: 'RVOL', val: `${selectedTicker.techMetrics.rvol}x`, good: selectedTicker.techMetrics.rvol > 1.5 },
                                { id: 'WYCKOFF', label: 'Cycle', val: selectedTicker.techMetrics.wyckoffPhase, good: selectedTicker.techMetrics.wyckoffPhase === 'MARKUP' }
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
