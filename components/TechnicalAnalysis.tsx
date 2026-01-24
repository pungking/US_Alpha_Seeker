
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

const TechnicalAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stage3Data, setStage3Data] = useState<any[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentStep: 'Standby' });
  const [logs, setLogs] = useState<string[]>(['> Technical_Engine v4.0.0: High-Frequency Pattern Matching Active.']);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (accessToken && stage3Data.length === 0) loadStage3Data();
  }, [accessToken]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const loadStage3Data = async () => {
    setLoading(true);
    addLog("Fetching Stage 3 Fundamental Winners...", "info");
    try {
      const q = encodeURIComponent(`name contains 'STAGE3_FUNDAMENTAL_ELITE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());
        if (content.fundamental_universe) setStage3Data(content.fundamental_universe);
        addLog(`Loaded ${content.fundamental_universe.length} assets for technical pattern matching.`, "ok");
      }
    } catch (e: any) { addLog(e.message, "err"); }
    finally { setLoading(false); }
  };

  const executeTechnicalAudit = async () => {
    if (stage3Data.length === 0 || loading) return;
    setLoading(true);
    const limit = Math.min(stage3Data.length, 100);
    setProgress({ current: 0, total: limit, currentStep: 'Scanning' });

    for (let i = 0; i < limit; i++) {
      const target = stage3Data[i];
      setProgress({ current: i + 1, total: limit, currentStep: target.symbol });
      if (i % 10 === 0) addLog(`Matching Patterns for ${target.symbol}...`, "info");
      await new Promise(r => setTimeout(r, 200));
    }
    setLoading(false);
    setProgress(p => ({ ...p, currentStep: 'Complete' }));
    addLog("Technical Alpha Discovery Cycle Complete.", "ok");
  };

  const currentPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-orange-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-orange-600/10 flex items-center justify-center border border-orange-500/20">
                 <svg className={`w-6 h-6 text-orange-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Technical_Node v4.0.0</h2>
                <p className="text-[8px] font-black text-orange-400 uppercase mt-2 tracking-widest">ENGINE STATE: {loading ? `${progress.currentStep} (${currentPercent}%)` : 'Ready'}</p>
              </div>
            </div>
            <button onClick={executeTechnicalAudit} disabled={loading || stage3Data.length === 0} className="px-12 py-5 bg-orange-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `PATTERN: ${progress.currentStep}` : 'Execute 7-Core Engine'}
            </button>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden p-0.5 mb-10">
            <div className="h-full bg-orange-600 transition-all duration-300" style={{ width: `${currentPercent}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-orange-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">Techs_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-orange-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-orange-900">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TechnicalAnalysis;
