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

interface Props {
  autoStart?: boolean;
  onComplete?: () => void;
}

const PreliminaryFilter: React.FC<Props> = ({ autoStart, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredCount, setFilteredCount] = useState(0);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v2.1.0: Manual Purification Mode Active.']);
  
  // Filter Constraints
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Load Stage 0 Data on mount
  useEffect(() => {
    if (accessToken) {
      fetchMasterUniverse();
    } else {
      addLog("Cloud Vault not linked. Please connect via Stage 0.", "warn");
    }
  }, [accessToken]);

  // Update filtered count whenever sliders or data change
  useEffect(() => {
    const count = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume).length;
    setFilteredCount(count);
  }, [minPrice, minVolume, rawUniverse]);

  // Auto-Pilot Logic
  useEffect(() => {
    if (autoStart && !loading && rawUniverse.length > 0) {
        addLog("AUTO-PILOT: Executing Purification Sequence...", "signal");
        commitPurification();
    }
  }, [autoStart, rawUniverse]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const fetchMasterUniverse = async () => {
    if (!accessToken) return;
    setLoading(true);
    addLog("Phase 1: Syncing with Stage 0 Master Universe...", "info");

    try {
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Stage 0 Data not found.");

      const content = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = content.universe || [];
      setRawUniverse(data);
      addLog(`Matrix Synced: ${data.length} assets ready for purification.`, "ok");
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const commitPurification = async () => {
    if (!accessToken || loading || rawUniverse.length === 0) return;
    
    setLoading(true);
    addLog(`Phase 2: Extracting Liquid Assets (P > $${minPrice}, V > ${minVolume.toLocaleString()})...`, "info");

    try {
      const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_PURIFIED_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      
      const payload = {
        manifest: { 
            version: "2.1.0", 
            filters: { minPrice, minVolume }, 
            count: filtered.length,
            timestamp: new Date().toISOString() 
        },
        investable_universe: filtered
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (!res.ok) throw new Error("Upload failed.");

      addLog(`Purification Complete: ${filtered.length} assets committed to Vault.`, "ok");
      
      if (onComplete) onComplete();

    } catch (e: any) {
      addLog(`Vault Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20`}>
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purify_Nexus v2.1.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-md font-black border border-blue-500/20 uppercase tracking-widest">
                    Manual Filter Mode
                  </span>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={commitPurification} 
              disabled={loading || rawUniverse.length === 0}
              className={`w-full md:w-auto px-12 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${
                loading || rawUniverse.length === 0 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                  : 'bg-blue-600 text-white hover:scale-105 shadow-blue-900/20'
              }`}
            >
              {loading ? 'Purifying Assets...' : 'Commit Filtered Universe'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            {/* Price Slider */}
            <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Price Floor ($)</p>
                <p className="text-2xl font-mono font-black text-white italic">${minPrice.toFixed(2)}</p>
              </div>
              <input 
                type="range" min="0.5" max="10.0" step="0.5" 
                value={minPrice} onChange={(e) => setMinPrice(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-bold uppercase">
                <span>$0.50</span>
                <span>Penny Stock Threshold</span>
                <span>$10.00</span>
              </div>
            </div>

            {/* Volume Slider */}
            <div className="bg-black/40 p-6 md:p-8 rounded-3xl border border-white/5 space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Min Daily Volume</p>
                <p className="text-2xl font-mono font-black text-white italic">{(minVolume/1000).toFixed(0)}K</p>
              </div>
              <input 
                type="range" min="100000" max="2000000" step="100000" 
                value={minVolume} onChange={(e) => setMinVolume(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <div className="flex justify-between text-[8px] text-slate-500 font-bold uppercase">
                <span>100K</span>
                <span>Liquidity Floor</span>
                <span>2.0M</span>
              </div>
            </div>
          </div>

          <div className="bg-blue-600/5 p-6 md:p-8 rounded-3xl border border-blue-500/10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Purification Result</p>
                <h3 className="text-2xl font-black text-white italic tracking-tight uppercase">
                    {filteredCount.toLocaleString()} <span className="text-slate-500 text-sm not-italic font-bold">Assets Selected</span>
                </h3>
            </div>
            <div className="h-1.5 w-full md:w-64 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-500"
                    style={{ width: `${Math.min(100, (filteredCount / (rawUniverse.length || 1)) * 100)}%` }}
                ></div>
            </div>
          </div>

        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[600px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purify_Log</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
