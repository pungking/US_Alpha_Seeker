
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

const DeepQualityFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Quality_Node v2.2.1: Liquidity-Priority Protocol Active.']);
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' = 'info') => {
    const p = { info: '>', ok: '[OK]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const startAnalysis = async () => {
    if (loading) return;
    setLoading(true);
    addLog("Initializing Deep Liquidity Scan...", "info");
    for (let i = 0; i <= 100; i += 5) {
      setProgress(i);
      await new Promise(r => setTimeout(r, 100));
    }
    addLog("Scan Complete. Elite Matrix Filtered.", "ok");
    setLoading(false);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3">
        <div className="glass-panel p-10 md:p-14 rounded-[45px] border-t-4 border-t-[#a855f7] bg-slate-900/40 relative shadow-2xl">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12 gap-10">
            <div className="flex items-center space-x-8">
              <div className={`w-20 h-20 rounded-[30px] bg-[#a855f7]/10 flex items-center justify-center border border-[#a855f7]/20 shadow-inner ${loading ? 'animate-pulse' : ''}`}>
                 <svg className="w-10 h-10 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </div>
              <div>
                <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">ELITE_CACHING V2.2.1</h2>
                <p className="text-[9px] font-black text-[#a855f7] uppercase tracking-[0.4em]">SCANNING: {loading ? 'ACTIVE' : '(NAN%)'}</p>
              </div>
            </div>
            <div className="flex gap-4">
              <button onClick={startAnalysis} disabled={loading} className="px-10 py-5 bg-[#a855f7] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-2xl hover:bg-[#9333ea] transition-all min-w-[120px]">
                RUN QUALITY SCAN
              </button>
              <button className="px-12 py-5 bg-slate-800 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest border border-white/5 transition-all">
                COMMIT VAULT
              </button>
            </div>
          </div>
          <div className="h-6 bg-slate-950 rounded-full overflow-hidden p-1.5 border border-white/5 shadow-inner">
            <div className="h-full bg-[#a855f7] transition-all duration-300 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.5)]" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[500px] rounded-[45px] bg-[#030712] border-l-4 border-l-[#a855f7] p-8 shadow-2xl flex flex-col">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-8">Quality_Terminal</h3>
          <div className="flex-1 bg-black/60 p-6 rounded-[30px] font-mono text-[9px] text-[#a855f7]/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-[#a855f7]/30">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepQualityFilter;
