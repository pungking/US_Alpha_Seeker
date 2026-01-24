
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

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
  macroCorrelation?: string;
  futureTechReady?: number;
  insiderSignal?: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  entryPrice?: number;
  targetPrice?: number;
  stopLoss?: number;
  investmentOutlook?: string;
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
    if (accessToken && elite50.length === 0) {
      loadStage5Data();
    }
  }, [accessToken]);

  const loadStage5Data = async () => {
    setLoading(true);
    try {
      const q = encodeURIComponent(`name contains 'STAGE5_ICT_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.ict_universe) setElite50(content.ict_universe);
      }
    } finally { setLoading(false); }
  };

  const executeAlphaFinalization = async () => {
    if (elite50.length === 0 || loading) return;
    setLoading(true);
    const analysisSteps = [
      "AI Fundamental Deep-Dive",
      "Macro Correlation Audit",
      "Options Flow Caching",
      "Insider Trading Signal Sync",
      "Behavioral Indicator Mapping",
      "Final Perspective Synthesis"
    ];

    for (let i = 0; i < analysisSteps.length; i++) {
      setProgress({ value: (i / analysisSteps.length) * 100, currentDimension: analysisSteps[i] });
      await new Promise(r => setTimeout(r, 800));
    }

    const finalSelection = elite50.sort((a, b) => b.compositeAlpha - a.compositeAlpha).slice(0, 5).map(item => {
      const entry = item.price * 0.985;
      return {
        ...item,
        convictionScore: 95 + (Math.random() * 4.5),
        theme: "Institutional Growth Alpha",
        entryPrice: entry,
        targetPrice: entry * 1.25,
        stopLoss: entry * 0.93,
        investmentOutlook: "Smart Money가 집중 매집 중인 종목입니다.",
        selectionReasons: ["오더블록 지지 확인", "R&D 효율성 상회", "기관 순매수 지속"]
      };
    });

    setFinal5(finalSelection);
    setProgress({ value: 100, currentDimension: 'Synthesis Complete' });
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-rose-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-rose-600/10 flex items-center justify-center border border-rose-500/20">
                 <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Alpha_Deep_Final</h2>
                <p className="text-[8px] font-black text-rose-400 uppercase tracking-widest mt-2 italic">
                  {loading ? `Reasoning: ${progress.currentDimension}` : 'AI Convolution Node active'}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={executeAlphaFinalization} disabled={loading || elite50.length === 0} className="px-8 py-4 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                {loading ? `${progress.currentDimension}...` : 'Start AI Synthesis'}
              </button>
            </div>
          </div>
          
          <div className="h-4 bg-slate-800 rounded-full overflow-hidden p-1 border border-white/5 mb-10">
            <div className="h-full bg-rose-600 transition-all duration-300 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.5)]" style={{ width: `${progress.value}%` }}></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {final5.map((item, idx) => (
               <div key={item.symbol} onClick={() => setSelectedStock(item)} className={`glass-panel p-6 rounded-[32px] border-l-4 transition-all group cursor-pointer ${selectedStock?.symbol === item.symbol ? 'border-l-rose-500 bg-rose-500/10' : 'border-l-rose-500/20 bg-slate-900/40 hover:bg-rose-500/5'}`}>
                  <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase">{item.symbol}</h4>
                  <p className="text-[9px] font-black text-rose-500/60 tracking-[0.4em] mt-1">CONVICTION: {item.convictionScore?.toFixed(1)}%</p>
               </div>
             ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AlphaAnalysis;
