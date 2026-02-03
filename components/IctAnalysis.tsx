
import React, { useState, useEffect, useRef } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { GOOGLE_DRIVE_TARGET } from '../constants';

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
  
  // [DATA PRESERVATION]
  [key: string]: any;
}

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
  onStockSelected?: (stock: any) => void;
}

// [KNOWLEDGE BASE] Definitions for UI Tooltips/Overlays
const ICT_DEFINITIONS: Record<string, { title: string; desc: string; interpretation: string }> = {
    'DISPLACEMENT': {
        title: "Displacement (변위/세력개입)",
        desc: "기관(Smart Money)이 시장에 진입했음을 알리는 강력한 신호입니다.",
        interpretation: "평소 대비 2배 이상의 거래량과 긴 몸통의 캔들이 발생했는가? 점수가 높을수록 세력이 의도적으로 가격을 밀어올리고 있음을 의미합니다."
    },
    'MSS': {
        title: "Market Structure Shift (시장구조전환)",
        desc: "하락 추세에서 상승 추세로의 구조적 변화가 발생한 지점입니다.",
        interpretation: "이전 고점(Lower High)을 강하게 돌파했는가? MSS가 발생했다면 단기 반등이 아닌 '추세 반전'의 시작일 확률이 매우 높습니다."
    },
    'SWEEP': {
        title: "Liquidity Sweep (유동성 스윕)",
        desc: "개인 투자자들의 손절 물량(Stop Loss)을 체결시키고 가격을 말아올리는 패턴입니다.",
        interpretation: "전저점을 살짝 깼다가 급반등했는가? 이는 세력이 물량을 확보(Stop Hunt)했다는 강력한 매집 증거입니다."
    },
    'WHALES': {
        title: "Whale Activity (고래/기관 수급)",
        desc: "거대 자금의 실질적인 유입 강도를 추정한 복합 지표입니다.",
        interpretation: "거래량, 변동성, 오더블록 지지력을 종합하여 '진짜 돈'이 들어왔는지 판단합니다. 80점 이상이면 기관이 주포(Driver)입니다."
    }
};

const MARKET_STATE_INFO: Record<string, string> = {
    'ACCUMULATION': "매집 단계: 세력이 가격을 일정 범위에 가두고 물량을 모으는 구간. 저점 매수의 기회.",
    'MARKUP': "상승 단계: 매집이 끝나고 가격을 본격적으로 들어 올리는 슈팅 구간. 추격 매수 유효.",
    'DISTRIBUTION': "분산 단계: 세력이 개인에게 물량을 넘기는 고점 구간. 하락 전환 주의.",
    'MANIPULATION': "속임수 단계: 방향성을 주기 전 개미를 털어내는 혼조세 구간. 진입 유의."
};

// [QUANT ENGINE] Smart Money Scoring Logic
const calculateIctScore = (item: any) => {
    const rvol = item.techMetrics?.rvol || 1.0;
    const momentum = item.techMetrics?.momentum || 50;
    const displacement = Math.min(100, (rvol * 20) + (momentum > 60 ? 30 : 0));

    const trend = item.techMetrics?.trend || 50;
    const mss = trend;

    const isSqueeze = item.techMetrics?.squeezeState === 'SQUEEZE_ON';
    const sweepScore = isSqueeze ? 90 : 50; 

    const rsi = item.techMetrics?.rsRating || 50;
    let obScore = 50;
    if (rsi >= 40 && rsi <= 60) obScore = 85; 
    else if (rsi > 70) obScore = 95; 
    else obScore = 40;

    const smFlow = (displacement * 0.4) + (mss * 0.3) + (obScore * 0.3);
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
    if (metrics.liquiditySweep > 80 && metrics.displacement < 50) return 'MANIPULATION';
    if (metrics.marketStructure > 70 && metrics.displacement > 70) return 'MARKUP';
    if (metrics.orderBlock > 80 && metrics.displacement < 60) return 'ACCUMULATION';
    return 'DISTRIBUTION';
};

const IctAnalysis: React.FC<Props> = ({ autoStart, onComplete, onStockSelected }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [processedData, setProcessedData] = useState<IctScoredTicker[]>([]);
  const [selectedTicker, setSelectedTicker] = useState<IctScoredTicker | null>(null);
  const [activeInsight, setActiveInsight] = useState<string | null>(null); // For overlay
  
  const [timeStats, setTimeStats] = useState({ elapsed: 0, eta: 0 });
  const startTimeRef = useRef<number>(0);
  const [logs, setLogs] = useState<string[]>(['> ICT_Node v6.1.0: Advanced Smart Money MTF Core.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Click Outside Handler for Insights
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (!target.closest('.insight-card') && !target.closest('.insight-badge')) {
            setActiveInsight(null);
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

  const handleTickerSelect = (ticker: IctScoredTicker) => {
      setSelectedTicker(ticker);
      setActiveInsight(null);
      // [CRITICAL] Bubble up to parent for Audit Matrix
      if (onStockSelected) {
          onStockSelected(ticker); 
      }
  };

  const executeIntegratedIctProtocol = async () => {
    if (!accessToken || loading) return;
    setLoading(true);
    startTimeRef.current = Date.now();
    setTimeStats({ elapsed: 0, eta: 0 });
    addLog("Phase 5: Initiating Institutional Liquidity Sieve...", "info");
    
    try {
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
        
        const ictAnalysis = calculateIctScore(item);
        const marketState = determineMarketState(ictAnalysis.metrics);
        
        const composite = (item.fundamentalScore * 0.20) + (item.technicalScore * 0.30) + (ictAnalysis.score * 0.50);

        const ticker: IctScoredTicker = {
            ...item, // [DATA ACCUMULATION] Preserve previous stages
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
            radarData: [],
            sector: item.sector,
            scoringEngine: "ICT_Quant_Engine_v6"
        };

        results.push(ticker);

        if (i % 20 === 0) {
            setProgress({ current: i + 1, total });
            const tempResults = [...results].sort((a,b) => b.compositeAlpha - a.compositeAlpha);
            setProcessedData(tempResults);
            if (!selectedTicker && tempResults.length > 0) handleTickerSelect(tempResults[0]);
            await new Promise(r => setTimeout(r, 10)); 
        }
      }

      results.sort((a, b) => b.compositeAlpha - a.compositeAlpha);
      const finalSurvivors = results.slice(0, 50); 
      
      setProcessedData(results); 
      if (finalSurvivors.length > 0) handleTickerSelect(finalSurvivors[0]);
      
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
                         <div key={i} onClick={() => handleTickerSelect(t)} className={`p-3 rounded-xl border flex justify-between items-center cursor-pointer transition-all ${selectedTicker?.symbol === t.symbol ? 'bg-indigo-900/30 border-indigo-500/50' : 'bg-white/5 border-transparent hover:bg-white/10'}`}>
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
                                    {/* Market State Badge with Insight Overlay */}
                                    <span 
                                        className={`insight-badge text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border cursor-help hover:opacity-80 transition-opacity ${
                                            selectedTicker.marketState === 'MARKUP' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                            selectedTicker.marketState === 'ACCUMULATION' ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                                            selectedTicker.marketState === 'MANIPULATION' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                            'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                        }`}
                                        onClick={() => setActiveInsight(selectedTicker.marketState)}
                                    >
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

                        {/* 4 Core ICT Metrics Cards - CLICKABLE */}
                        <div className="grid grid-cols-4 gap-2 mt-2">
                             {[
                                { id: 'DISPLACEMENT', label: 'Displacement', val: selectedTicker.ictMetrics.displacement.toFixed(0), good: selectedTicker.ictMetrics.displacement > 70 },
                                { id: 'MSS', label: 'Structure (MSS)', val: selectedTicker.ictMetrics.marketStructure > 70 ? 'BREAK' : 'WEAK', good: selectedTicker.ictMetrics.marketStructure > 70 },
                                { id: 'SWEEP', label: 'Sweep', val: selectedTicker.ictMetrics.liquiditySweep > 80 ? 'YES' : 'NO', good: selectedTicker.ictMetrics.liquiditySweep > 80 },
                                { id: 'WHALES', label: 'Whales', val: `${selectedTicker.ictMetrics.smartMoneyFlow.toFixed(0)}%`, good: selectedTicker.ictMetrics.smartMoneyFlow > 80 }
                             ].map((m) => (
                                 <div 
                                    key={m.id}
                                    onClick={() => setActiveInsight(m.id)}
                                    className={`insight-card p-2 rounded-lg text-center border cursor-pointer transition-all hover:scale-105 active:scale-95 ${activeInsight === m.id ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg' : 'bg-slate-900/50 border-white/5 hover:bg-slate-800'}`}
                                 >
                                     <p className={`text-[7px] uppercase font-bold ${activeInsight === m.id ? 'text-white' : 'text-slate-500'}`}>{m.label}</p>
                                     <p className={`text-[10px] font-black ${m.good ? 'text-emerald-400' : 'text-slate-300'}`}>
                                         {m.val}
                                     </p>
                                 </div>
                             ))}
                        </div>

                        {/* Insight Overlay */}
                        {activeInsight && (
                            <div className="absolute inset-x-4 bottom-4 z-20 animate-in fade-in slide-in-from-bottom-2">
                                <div className="bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl border border-indigo-500/30 shadow-2xl relative">
                                    <button onClick={() => setActiveInsight(null)} className="absolute top-2 right-2 text-slate-500 hover:text-white">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                    {ICT_DEFINITIONS[activeInsight] ? (
                                        <>
                                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{ICT_DEFINITIONS[activeInsight].title}</h5>
                                            <p className="text-[9px] text-slate-300 leading-relaxed font-medium mb-2">{ICT_DEFINITIONS[activeInsight].desc}</p>
                                            <div className="bg-white/5 p-2 rounded border border-white/5">
                                                <p className="text-[8px] text-emerald-400 font-bold">💡 Checkpoint:</p>
                                                <p className="text-[8px] text-slate-400">{ICT_DEFINITIONS[activeInsight].interpretation}</p>
                                            </div>
                                        </>
                                    ) : MARKET_STATE_INFO[activeInsight] ? (
                                        <>
                                            <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">{activeInsight} PHASE</h5>
                                            <p className="text-[9px] text-slate-300 leading-relaxed font-medium">{MARKET_STATE_INFO[activeInsight]}</p>
                                        </>
                                    ) : null}
                                </div>
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
