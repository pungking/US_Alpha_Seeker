
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
  type?: string;
}

const PreliminaryFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredUniverse, setFilteredUniverse] = useState<MasterTicker[]>([]);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v1.6.5: Equity Purification Protocol Active.']);
  const [statusText, setStatusText] = useState('Standby');
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accessToken && rawUniverse.length === 0) loadStage0Data();
  }, [accessToken]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-30));
  };

  const loadStage0Data = async () => {
    setLoading(true);
    setStatusText('Syncing...');
    addLog("Syncing with Stage 0 Master Universe Node...", "info");
    try {
      const fileQ = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (listRes.files?.length) {
        const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (content.universe) {
          setRawUniverse(content.universe);
          addLog(`Identification Complete: ${content.universe.length} assets retrieved.`, "ok");
          
          setStatusText('Purifying...');
          const filtered = content.universe.filter((s: any) => s.price >= 2.0 && s.volume >= 100000);
          setFilteredUniverse(filtered);
          addLog(`${filtered.length} assets passed liquidity threshold (Price >= $2.0, Vol >= 100K).`, "ok");
        }
      }
    } catch (e: any) { addLog(`Sync Error: ${e.message}`, "err"); }
    finally { setLoading(false); setStatusText('Ready'); }
  };

  const progressPercent = (filteredUniverse.length / (rawUniverse.length || 1)) * 100;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className="w-14 h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20">
                <svg className={`w-6 h-6 text-emerald-500 ${loading ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Node v1.6.5</h2>
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mt-2 italic">Status: {statusText}</p>
              </div>
            </div>
            <button onClick={loadStage0Data} disabled={loading} className="px-12 py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all">
              {loading ? `${statusText}...` : 'Execute Purification Cycle'}
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Raw Assets', val: rawUniverse.length.toLocaleString() },
              { label: 'Purified Pool', val: filteredUniverse.length.toLocaleString() },
              { label: 'Filter Ratio', val: `${progressPercent.toFixed(1)}%` },
              { label: 'Liquidity Tier', val: 'TIER_1_MIN' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-xl font-mono font-black italic text-emerald-400`}>{s.val}</p>
              </div>
            ))}
          </div>

          <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div className="h-full bg-emerald-500 transition-all duration-700 rounded-xl" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[600px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-6">Filter_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => <div key={i} className="pl-4 border-l-2 border-emerald-900">{l}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
