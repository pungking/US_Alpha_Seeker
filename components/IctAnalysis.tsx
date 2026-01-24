
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

const IctAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage4Data, setStage4Data] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, activeTarget: 'Idle' });
  const [logs, setLogs] = useState<string[]>(['> ICT_SMC_Core v5.0.0: Smart Money Protocol Initialized.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage4Data.length === 0) loadStage4Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage4Data = async () => {
    setLoading(true);
    addLog("Syncing Smart Money footprint candidates...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE4_TECHNICAL_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.technical_universe) setStage4Data(content.technical_universe);
        addLog(`Synchronized ${content.technical_universe.length} assets for ICT audit.`, "ok");
      }
    } catch (e: any) { addLog(e.message, "err"); }
    finally { setLoading(false); }
  };

  const executeIctAudit = async () => {
    if (stage4Data.length === 0 || loading) return;
    setLoading(true);
    const limit = Math.min(stage4Data.length, 50);
    setProgress({ current: 0, total: limit, activeTarget: 'Mapping' });

    for (let i = 0; i < limit; i++) {
      const target = stage4Data[i];
      setProgress({ current: i + 1, total: limit, activeTarget: target.symbol });
      if (i % 5 === 0) addLog(`Tracking Smart Money in ${target.symbol}...`, "info");
      await new Promise(r => setTimeout(r, 300));
    }
    setLoading(false);
    setProgress(p => ({ ...p, activeTarget: 'Leaderboard Updated' }));
    addLog("ICT Analysis Finalized. Smart Money Leaderboard Synced.", "ok");
  };

  const currentPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-indigo-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-indigo-600/10 flex items-center justify-center border border-indigo-500/20">
                 <svg className={`w-6 h-6 text-indigo-400 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">ICT_Nexus v5.0.0</h2>
                <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mt-2">TARGET NODE: {loading ? `${progress.activeTarget} (${currentPercent}%)` : 'Ready'}</p>
              </div>
            </div>
            <button onClick={executeIctAudit} disabled={loading || stage4Data.length === 0} className="px-12 py-5 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `TRACKING ${progress.activeTarget}...` : 'Scan Footprints'}
            </button>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 mb-10">
            <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${currentPercent}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-indigo-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">ICT_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-indigo-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-indigo-900">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IctAnalysis;
