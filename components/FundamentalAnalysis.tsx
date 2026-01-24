
import React, { useState, useEffect, useRef } from 'react';

const FundamentalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Core v3.0.0: Six-Dimension Analysis Ready.']);
  const logRef = useRef<HTMLDivElement>(null);

  const startAnalysis = async () => {
    setLoading(true);
    for (let i = 0; i <= 100; i += 10) {
      setProgress(i);
      await new Promise(r => setTimeout(r, 150));
    }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3">
        <div className="glass-panel p-10 md:p-14 rounded-[45px] border-t-4 border-t-[#06b6d4] bg-slate-900/40 relative shadow-2xl">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-10">
            <div className="flex items-center space-x-8">
              <div className={`w-20 h-20 rounded-[30px] bg-[#06b6d4]/10 flex items-center justify-center border border-[#06b6d4]/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className="w-10 h-10 text-[#06b6d4]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">FUNDAMENTAL_NODE V3.0.0</h2>
                <p className="text-[9px] font-black text-[#06b6d4] uppercase tracking-[0.4em]">AUDITING MATRIX:</p>
              </div>
            </div>
            <button onClick={startAnalysis} className="px-16 py-6 bg-[#06b6d4] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:bg-[#0891b2] transition-all">
              {loading ? 'AUDITING ...' : 'AUDITING ...'}
            </button>
          </div>
          <div className="h-6 bg-slate-950 rounded-full overflow-hidden p-1.5 border border-white/5">
            <div className="h-full bg-[#06b6d4] transition-all duration-300 rounded-full shadow-[0_0_20px_rgba(6,182,212,0.5)]" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[500px] rounded-[45px] bg-[#030712] border-l-4 border-l-[#06b6d4] p-8 shadow-2xl flex flex-col">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-8">Funds_Terminal</h3>
          <div className="flex-1 bg-black/60 p-6 rounded-[30px] font-mono text-[9px] text-[#06b6d4]/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-[#06b6d4]/30">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
