
import React, { useState, useEffect, useRef } from 'react';

const TechnicalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Technical_Engine v4.0.0: High-Frequency Pattern Matching Active.']);

  const startAnalysis = async () => {
    setLoading(true);
    for (let i = 0; i <= 100; i += 10) {
      setProgress(i);
      await new Promise(r => setTimeout(r, 120));
    }
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3">
        <div className="glass-panel p-10 md:p-14 rounded-[45px] border-t-4 border-t-[#f97316] bg-slate-900/40 relative shadow-2xl">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-10">
            <div className="flex items-center space-x-8">
              <div className={`w-20 h-20 rounded-[30px] bg-[#f97316]/10 flex items-center justify-center border border-[#f97316]/20 ${loading ? 'animate-pulse' : ''}`}>
                 <svg className="w-10 h-10 text-[#f97316]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">TECHNICAL_NODE V4.0.0</h2>
                <p className="text-[9px] font-black text-[#f97316] uppercase tracking-[0.4em]">ENGINE STATE:</p>
              </div>
            </div>
            <button onClick={startAnalysis} className="px-16 py-6 bg-[#f97316] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:bg-[#ea580c] transition-all min-w-[150px]">
              {loading ? 'AUDITING...' : ''}
            </button>
          </div>
          <div className="h-6 bg-slate-950 rounded-full overflow-hidden p-1.5 border border-white/5">
            <div className="h-full bg-[#f97316] transition-all duration-300 rounded-full shadow-[0_0_20px_rgba(249,115,22,0.5)]" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[500px] rounded-[45px] bg-[#030712] border-l-4 border-l-[#f97316] p-8 shadow-2xl flex flex-col">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-8">Techs_Terminal</h3>
          <div className="flex-1 bg-black/60 p-6 rounded-[30px] font-mono text-[9px] text-[#f97316]/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-[#f97316]/30">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
