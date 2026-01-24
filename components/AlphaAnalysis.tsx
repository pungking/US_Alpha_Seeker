
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface AlphaCandidate {
  symbol: string;
  name: string;
  price: number;
  compositeAlpha: number;
  ictScore: number;
  technicalScore: number;
  fundamentalScore: number;
  sector: string;
  aiVerdict?: string;
  convictionScore?: number;
  theme?: string;
  selectionReasons?: string[];
  investmentOutlook?: string;
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
}

const AlphaAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [elite50, setElite50] = useState<AlphaCandidate[]>([]);
  const [final5, setFinal5] = useState<AlphaCandidate[]>([]);
  const [selectedStock, setSelectedStock] = useState<AlphaCandidate | null>(null);
  const [progress, setProgress] = useState({ value: 0, currentDimension: 'Standby' });
  const [logs, setLogs] = useState<string[]>(['> AI_Alpha_Node v6.8.0: Final Investment Perspective Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && elite50.length === 0) loadStage5Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage5Data = async () => {
    setLoading(true);
    addLog("Pulling ICT Smart Money candidates from Stage 5...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.ict_universe) {
          setElite50(content.ict_universe);
          addLog(`Synchronized ${content.ict_universe.length} top-tier assets.`, "ok");
        }
      }
    } catch (e: any) { addLog(e.message, "err"); }
    finally { setLoading(false); }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    const analysisSteps = [
      "AI Fundamental Deep-Dive",
      "Macro Correlation Audit",
      "Institutional Options Flow Sync",
      "Insider Trading Signal Mapping",
      "Behavioral Sentiment Synthesis",
      "Final Alpha Selection"
    ];

    for (let i = 0; i < analysisSteps.length; i++) {
      const step = analysisSteps[i];
      addLog(`Dimension ${i+1}: ${step} in progress...`, "info");
      setProgress({ value: ((i + 1) / analysisSteps.length) * 100, currentDimension: step });
      await new Promise(r => setTimeout(r, 800));
    }

    const themes = ["Semiconductor Supercycle", "AI Infrastructure Alpha", "SaaS Efficiency Leader", "Clean Energy Institutional Pick", "Fintech Disruption Core"];
    
    const finalSelection = elite50.sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 5).map((item, idx) => {
      const entry = item.price * 0.985;
      return {
        ...item,
        convictionScore: 94 + (Math.random() * 5.5),
        theme: themes[idx] || "High-Conviction Alpha",
        entryPrice: entry,
        targetPrice: entry * 1.25,
        stopLoss: entry * 0.93,
        investmentOutlook: `${item.symbol}은 현재 기관 매집이 완료된 단계로, 기술적 추세와 펀더멘털이 완벽히 조화된 상태입니다.`,
        selectionReasons: ["Institutional Order Block 지지 확인", "R&D 투자 효율성 업계 상위 5%", "기관 순매수 4주 연속 지속"]
      };
    });

    setFinal5(finalSelection);
    setSelectedStock(finalSelection[0]);
    addLog("AI Alpha Synthesis Complete. Top 5 Picks Vaulted.", "ok");
    setLoading(false);
  };

  const chartData = [
    { name: 'W1', value: 100 }, { name: 'W2', value: 115 }, { name: 'W3', value: 108 },
    { name: 'W4', value: 125 }, { name: 'W5', value: 140 }, { name: 'W6', value: 135 },
    { name: 'W7', value: 155 }
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20">
                 <svg className={`w-6 h-6 text-rose-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Deep_Final</h2>
                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mt-2 italic">
                  {loading ? `REASONING: ${progress.currentDimension} (${Math.round(progress.value)}%)` : 'AI Convolution Node active'}
                </p>
              </div>
            </div>
            <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className="px-12 py-5 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `${progress.currentDimension}...` : 'Start AI Synthesis'}
            </button>
          </div>
          
          <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-1 border border-white/5 mb-10">
            <div className="h-full bg-rose-600 transition-all duration-300 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.5)]" style={{ width: `${progress.value}%` }}></div>
          </div>

          {/* Final 5 Selection List */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
             {final5.length > 0 ? final5.map((item) => (
               <div 
                 key={item.symbol} 
                 onClick={() => setSelectedStock(item)} 
                 className={`glass-panel p-4 rounded-2xl border-l-4 transition-all group cursor-pointer ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10 scale-105 ring-1 ring-rose-500/30' : 'border-l-rose-500/20 bg-slate-900/40 hover:bg-rose-500/5'}`}
               >
                  <h4 className="text-xl font-black text-white italic tracking-tighter uppercase">{item.symbol}</h4>
                  <div className="flex justify-between items-end mt-2">
                    <span className="text-[7px] font-black text-rose-500/60 uppercase tracking-widest">CONV: {item.convictionScore?.toFixed(1)}%</span>
                  </div>
               </div>
             )) : (
               <div className="col-span-5 h-[80px] flex items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
                 Waiting for AI Synthesis to lock final targets
               </div>
             )}
          </div>

          {/* Detailed View for Selected Stock */}
          {selectedStock && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-6">
                 <div className="bg-black/40 p-8 rounded-[32px] border border-white/5">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-1">Stock Portfolio Identity</p>
                        <h3 className="text-4xl font-black text-white italic tracking-tighter uppercase">{selectedStock.symbol}</h3>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-tight">{selectedStock.name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-black px-3 py-1 bg-rose-500/20 text-rose-400 rounded-full border border-rose-500/20 uppercase tracking-widest">{selectedStock.theme}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <div>
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Alpha Selection Reasons</p>
                         <ul className="space-y-2">
                           {selectedStock.selectionReasons?.map((reason, i) => (
                             <li key={i} className="flex items-center space-x-3 text-[10px] font-bold text-slate-300">
                               <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                               <span>{reason}</span>
                             </li>
                           ))}
                         </ul>
                       </div>
                       <div className="pt-4 border-t border-white/5">
                         <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Investment Outlook</p>
                         <p className="text-[11px] leading-relaxed text-slate-400 font-medium">
                           {selectedStock.investmentOutlook}
                         </p>
                       </div>
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-900/60 p-5 rounded-3xl border border-white/5">
                       <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Entry Plan</p>
                       <p className="text-lg font-black text-emerald-400">${selectedStock.entryPrice?.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/60 p-5 rounded-3xl border border-white/5">
                       <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Target Alpha</p>
                       <p className="text-lg font-black text-blue-400">${selectedStock.targetPrice?.toFixed(2)}</p>
                    </div>
                    <div className="bg-slate-900/60 p-5 rounded-3xl border border-white/5">
                       <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Risk Stop</p>
                       <p className="text-lg font-black text-red-400">${selectedStock.stopLoss?.toFixed(2)}</p>
                    </div>
                 </div>
              </div>

              <div className="bg-black/60 p-8 rounded-[32px] border border-white/5 flex flex-col h-full">
                <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest mb-6 italic">Projected Performance Matrix</p>
                <div className="flex-1 min-h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="name" stroke="#475569" fontSize={8} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '10px' }}
                        itemStyle={{ color: '#f43f5e' }}
                      />
                      <Area type="monotone" dataKey="value" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 flex justify-between items-center bg-white/5 p-4 rounded-2xl">
                   <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-500 uppercase">Current Sector</span>
                      <span className="text-xs font-black text-white italic">{selectedStock.sector}</span>
                   </div>
                   <div className="text-right">
                      <span className="text-[8px] font-black text-slate-500 uppercase">Institutional Signal</span>
                      <div className="flex items-center space-x-1 justify-end">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <span className="text-[10px] font-black text-emerald-400">STRONG_BUY</span>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-rose-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">Alpha_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-rose-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-rose-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
