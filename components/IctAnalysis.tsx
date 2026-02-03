
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';
import { trackUsage } from '../services/intelligenceService';

interface IctScoredTicker {
  symbol: string;
  name: string;
  price: number;
  fundamentalScore: number;
  technicalScore: number;
  ictScore: number;
  compositeAlpha: number;
  
  // ICT Specific Metrics
  ictMetrics: {
      displacement: number;   // 세력의 개입 강도 (Strong Move)
      liquiditySweep: number; // 스탑 헌팅 여부 (Stop Hunt)
      marketStructure: number;// 구조적 추세 전환 (MSS)
      orderBlock: number;     // 매집 구간 지지력 (OB Quality)
      smartMoneyFlow: number; // 기관 자금 유입 추정치
  };
  
  // Qualitative Tags
  marketState: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MANIPULATION';
  verdict: string;
  
  // Radar Data
  radarData: { subject: string; A: number; fullMark: number }[];
  
  sector: string;
  scoringEngine?: string;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

// [QUANT ENGINE] Smart Money Scoring Logic
const calculateIctScore = (item: any) => {
    // 1. Displacement Index (변위 지수): 강한 거래량을 동반한 가격 이동
    // RVOL (Relative Volume) * Momentum
    const rvol = item.techMetrics?.rvol || 1.0;
    const momentum = item.techMetrics?.momentum || 50;
    const displacement = Math.min(100, (rvol * 20) + (momentum > 60 ? 30 : 0));

    // 2. Market Structure Shift (MSS): 추세 전환
    // Trend Score + Moving Average Alignment
    const trend = item.techMetrics?.trend || 50;
    const mss = trend;

    // 3. Liquidity Sweep (유동성 스윕): 변동성 활용
    // Bollinger Band Squeeze or High Volatility w/ Reversal
    const isSqueeze = item.techMetrics?.squeezeState === 'SQUEEZE_ON';
    const sweepScore = isSqueeze ? 90 : 50; // 스퀴즈 상태는 곧 폭발(Liquidity Run)을 의미

    // 4. Order Block (오더 블록): 지지력
    // RSI가 40~60 사이(건전한 조정)이거나 70 이상(강력한 추세)일 때 가점
    const rsi = item.techMetrics?.rsRating || 50;
    let obScore = 50;
    if (rsi >= 40 && rsi <= 60) obScore = 85; // Retracement into OB
    else if (rsi > 70) obScore = 95; // Strong Markup
    else obScore = 40;

    // 5. Smart Money Flow (기관 수급)
    // Combined Metric
    const smFlow = (displacement * 0.4) + (mss * 0.3) + (obScore * 0.3);

    // Final ICT Score
    const finalScore = (displacement * 0.3) + (mss * 0.2) + (sweepScore * 0.2) + (obScore * 0.3);

    return {
        score: Number(finalScore.toFixed(2)),
        metrics: {
            displacement: Number(displacement.toFixed(2)),
            liquiditySweep: Number(sweepScore.toFixed(2)),
            marketStructure: Number(mss.toFixed(2)),
            orderBlock: Number(obScore.toFixed(2)),
            smartMoneyFlow: Number(smFlow.toFixed(2))
        }
    };
};

const determineMarketState = (metrics: any): 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MANIPULATION' => {
    if (metrics.liquiditySweep > 80 && metrics.displacement < 50) return 'MANIPULATION'; // Squeeze but no move yet
    if (metrics.marketStructure > 70 && metrics.displacement > 70) return 'MARKUP'; // Strong trend
    if (metrics.orderBlock > 80 && metrics.displacement < 60) return 'ACCUMULATION'; // Holding support
    return 'DISTRIBUTION'; // Weak structure
};

const IctAnalysis: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<IctScoredTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<IctScoredTicker | null>(null);
  
  // Time Tracking
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);

  const [logs, setLogs] = useState<string[]>(['> ICT_Node v6.1.0: Advanced Smart Money MTF Core.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

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
        addLog("AUTO-PILOT: Engaging Institutional Footprint Scanner...", "signal");
        executeIntegratedIctProtocol();
    }
  }, [autoStart]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRadarData = (ticker: IctScoredTicker) => {
      return [
          { subject: 'Momentum', A: ticker.ictMetrics.displacement, fullMark: 100 },
          { subject: 'Structure', A: ticker.ictMetrics.marketStructure, fullMark: 100 },
          { subject: 'Liquidity', A: ticker.ictMetrics.liquiditySweep, fullMark: 100 },
          { subject: 'OrderFlow', A: ticker.ictMetrics.smartMoneyFlow, fullMark: 100 },
          { subject: 'Support', A: ticker.ictMetrics.orderBlock, fullMark: 100 },
      ];
  };

  const executeIntegratedIctProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    addLog("Phase 5: Initiating Institutional Liquidity Sieve...", "info");
    
    try {
      // 1. Load Stage 4 Data
      const q = encodeURIComponent(`name contains 'STAGE4_TECHNICAL_FULL' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 4 source missing. Run Stage 4 first.", "err");
        setLoading(false); return;
      }

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const targets = (content.technical_universe || []).sort((a: any, b: any) => b.totalAlpha - a.totalAlpha);
      const total = targets.length;
      setProgress({ current: 0, total });

      const results: IctScoredTicker[] = [];

      for (let i = 0; i < total; i++) {
        const item = targets[i];
        
        // [HEAVY LIFTING] Calculate ICT Metrics deterministically
        const ictAnalysis = calculateIctScore(item);
        const marketState = determineMarketState(ictAnalysis.metrics);
        
        // Composite Alpha: Fundamental(20) + Technical(30) + ICT(50)
        // ICT is weighted highest as it represents "Smart Money"
        const composite = (item.fundamentalScore * 0.20) + (item.technicalScore * 0.30) + (ictAnalysis.score * 0.50);

        const ticker: IctScoredTicker = {
            symbol: item.symbol, 
            name: item.name, 
            price: item.price,
            fundamentalScore: item.fundamentalScore, 
            technicalScore: item.technicalScore,
            ictScore: ictAnalysis.score, 
            compositeAlpha: Number(composite.toFixed(2)),
            ictMetrics: ictAnalysis.metrics,
            marketState: marketState,
            verdict: marketState === 'MARKUP' ? 'AGGRESSIVE BUY' : marketState === 'ACCUMULATION' ? 'BUILD POSITION' : 'WAIT',
            radarData: [], // Populated dynamically in UI
            sector: item.sector,
            scoringEngine: "ICT_Quant_Engine_v6"
        };

        results.push(ticker);

        if (i % 20 === 0) {
            setProgress({ current: i + 1, total });
            // Sort and update UI periodically
            const tempResults = [...results].sort((a,b) => b.compositeAlpha - a.compositeAlpha);
            setProcessedData(tempResults);
            if (!selectedTicker && tempResults.length > 0) setSelectedTicker(tempResults[0]);
            await new Promise(r => setTimeout(r, 10)); // UI Yield
        }
      }

      // Final Sort: Elite 50 Selection
      results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
      const finalSurvivors = results.slice(0, 50); // Cutoff at Top 50
      
      setProcessedData(results); // Show full list in UI, but save only Elite 50? No, let's save Elite 50.
      if (finalSurvivors.length > 0) setSelectedTicker(finalSurvivors[0]);
      
      // Save Elite 50 to Drive
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage5SubFolder);
      const fileName = `STAGE5_ICT_ELITE_50_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "6.1.0", count: finalSurvivors.length, timestamp: new Date().toISOString(), strategy: "Smart_Money_Composite" },
        ict_universe: finalSurvivors
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Elite 50 Selection Complete. Vault Synchronized.`, "ok");
      setProgress({ current: total, total });
      
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Institutional Protocol Failure: ${e.message}`, "err");
    } finally {
      setLoading(false);
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

  const getSectorStyle = (sector: string) => {
    const s = (sector || '').toLowerCase();
    // Indigo/Violet Theme for Stage 5
    if (s.includes('tech') || s.includes('software')) return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    if (s.includes('finance')) return 'bg-violet-500/20 text-violet-400 border-violet-500/30';
    if (s.includes('health')) return 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30';
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                 <svg className={`w-5 h-5 md:w-6 md:h-6 text-indigo-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">ICT_Nexus v6.1.0</h2>
                <div className="flex flex-col mt-2 gap-1">
                   <div className="flex items-center space-x-2">
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${loading ? 'border-indigo-400 text-indigo-400 animate-pulse' : 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400'}`}>
                            {loading ? `Scanning Order Blocks: ${progress.current}/${progress.total}` : 'Institutional Footprint Active'}
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
            <button onClick={executeIntegratedIctProtocol} disabled={loading} className="w-full lg:w-auto px-8 md:px-12 py-4 md:py-5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-900/20 hover:scale-105 active:scale-95 transition-all">
              {loading ? 'Sieging Smart Money...' : 'Execute Institutional Scan'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6">
              {/* LIST VIEW - INSTITUTIONAL RANK */}
              <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col h-[360px]">
                 <div className="p-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Institutional Rank ({processedData.length})</p>
                    <span className="text-[8px] font-mono text-slate-500">Sorted by Composite Alpha</span>
                 </div>
                 <div className="flex-1 overflow-y-auto no-scrollbar p-2 space-y-2">
                     {processedData.length > 0 ? processedData.map((t, i) => (
                         <div key={i} onClick={() => setSelectedTicker(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
                             <div className="flex items-center gap-3">
                                 <span className={`text-[10px] font-black w-4 ${i < 10 ? 'text-indigo-400' : 'text-slate-500'}`}>{i + 1}</span>
                                 <div>
                                     <p className="text-xs font-black text-white">{t.symbol}</p>
                                     <div className="flex items-center gap-2">
                                         <p className="text-[8px] text-slate-400 truncate w-16">{t.name}</p>
                                         <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                             <div className="h-full bg-indigo-500" style={{ width: `${t.ictMetrics.smartMoneyFlow}%` }}></div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-[10px] font-mono font-bold text-white">{t.compositeAlpha.toFixed(1)}</p>
                                 <p className="text-[7px] text-slate-500 uppercase">Alpha Score</p>
                             </div>
                         </div>
                     )) : (
                         <div className="h-full flex items-center justify-center opacity-30 text-[9px] uppercase tracking-widest text-slate-400 italic">
                             Waiting for Data...
                         </div>
                     )}
                 </div>
              </div>

              {/* DETAIL VIEW - SMART MONEY COCKPIT */}
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
                                    <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                                        selectedTicker.marketState === 'MARKUP' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                        selectedTicker.marketState === 'ACCUMULATION' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                                        selectedTicker.marketState === 'MANIPULATION' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                        'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    }`}>
                                        {selectedTicker.marketState}
                                    </span>
                                </div>
                            </div>
                            <div className="text-right">
                                 <p className="text-[8px] text-slate-500 uppercase font-bold mb-1">ICT Score</p>
                                 <p className="text-2xl font-black text-indigo-400 tracking-tighter">{selectedTicker.ictScore.toFixed(1)}</p>
                            </div>
                        </div>

                        <div className="flex-1 w-full relative -ml-4 my-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(selectedTicker)}>
                                    <PolarGrid stroke="#334155" opacity={0.3} />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 'bold' }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name={selectedTicker.symbol} dataKey="A" stroke="#6366f1" strokeWidth={2} fill="#6366f1" fillOpacity={0.4} />
                                    <RechartsTooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }} itemStyle={{ color: '#6366f1', fontSize: '10px' }} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>

                        {/* 4 Core ICT Metrics Cards */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             <div className="p-2 rounded-lg text-center border bg-slate-900/50 border-white/5">
                                 <p className="text-[7px] text-slate-500 uppercase font-bold">Displacement</p>
                                 <p className={`text-[10px] font-black ${selectedTicker.ictMetrics.displacement > 70 ? 'text-emerald-400' : 'text-slate-300'}`}>
                                     {selectedTicker.ictMetrics.displacement.toFixed(0)}
                                 </p>
                             </div>
                             <div className="p-2 rounded-lg text-center border bg-slate-900/50 border-white/5">
                                 <p className="text-[7px] text-slate-500 uppercase font-bold">Structure (MSS)</p>
                                 <p className={`text-[10px] font-black ${selectedTicker.ictMetrics.marketStructure > 70 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                     {selectedTicker.ictMetrics.marketStructure > 70 ? 'BREAK' : 'WEAK'}
                                 </p>
                             </div>
                             <div className="p-2 rounded-lg text-center border bg-slate-900/50 border-white/5">
                                 <p className="text-[7px] text-slate-500 uppercase font-bold">Sweep</p>
                                 <p className={`text-[10px] font-black ${selectedTicker.ictMetrics.liquiditySweep > 80 ? 'text-amber-400' : 'text-slate-300'}`}>
                                     {selectedTicker.ictMetrics.liquiditySweep > 80 ? 'YES' : 'NO'}
                                 </p>
                             </div>
                             <div className="p-2 rounded-lg text-center border bg-slate-900/50 border-white/5">
                                 <p className="text-[7px] text-slate-500 uppercase font-bold">Whales</p>
                                 <p className={`text-[10px] font-black ${selectedTicker.ictMetrics.smartMoneyFlow > 80 ? 'text-indigo-400' : 'text-slate-300'}`}>
                                     {selectedTicker.ictMetrics.smartMoneyFlow.toFixed(0)}%
                                 </p>
                             </div>
                        </div>
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
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">ICT_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-indigo-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-indigo-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IctAnalysis;
