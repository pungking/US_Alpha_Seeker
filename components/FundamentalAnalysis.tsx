
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface ScoredTicker {
  symbol: string;
  name: string;
  price: number;
  alphaScore: number;
}

const FundamentalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage2Data, setStage2Data] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSymbol: 'Idle' });
  const [logs, setLogs] = useState<string[]>(['> Fundamental_Core v3.0.0: Six-Dimension Analysis Ready.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage2Data.length === 0) loadStage2Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage2Data = async () => {
    setLoading(true);
    addLog("Syncing Stage 2 Deep Quality candidates...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE2_ELITE_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.elite_universe) setStage2Data(content.elite_universe);
        addLog(`Synchronized ${content.elite_universe.length} elite assets.`, "ok");
      }
    } catch (e: any) { addLog(e.message, "err"); }
    finally { setLoading(false); }
  };

  const executeDeepAudit = async () => {
    if (stage2Data.length === 0 || loading) return;
    setLoading(true);
    const limit = Math.min(stage2Data.length, 200);
    setProgress({ current: 0, total: limit, currentSymbol: 'Start' });

    for (let i = 0; i < limit; i++) {
      const target = stage2Data[i];
      setProgress({ current: i + 1, total: limit, currentSymbol: target.symbol });
      if (i % 20 === 0) addLog(`Auditing Fundamentals for ${target.symbol}...`, "info");
      await new Promise(r => setTimeout(r, 150));
    }
    setLoading(false);
    setProgress(p => ({ ...p, currentSymbol: 'Audit Finished' }));
    addLog("Fundamental Matrix Locked.", "ok");
  };

  const currentPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-cyan-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-cyan-600/10 flex items-center justify-center border border-cyan-500/20">
                 <svg className={`w-6 h-6 text-cyan-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Fundamental_Node v3.0.0</h2>
                <p className="text-[8px] font-black text-cyan-400 uppercase mt-2">AUDITING: {loading ? `${progress.currentSymbol} (${currentPercent}%)` : 'Ready'}</p>
              </div>
            </div>
            <button onClick={executeDeepAudit} disabled={loading || stage2Data.length === 0} className="px-12 py-5 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `AUDITING ${progress.currentSymbol}...` : 'Execute 6-Core Audit'}
            </button>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 mb-10">
            <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: `${currentPercent}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-cyan-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">Funds_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-cyan-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-cyan-900">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FundamentalAnalysis;
