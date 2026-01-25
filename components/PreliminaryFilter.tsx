
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

interface MarketStats {
  medianPrice: number;
  medianVolume: number;
  p15Price: number;
  p40Volume: number;
  totalCount: number;
}

const PreliminaryFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredUniverse, setFilteredUniverse] = useState<MasterTicker[]>([]);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v1.7.0: Automated Purification Protocol Active.']);
  const [isAutoMode, setIsAutoMode] = useState(true);
  
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-40));
  };

  const executeIntegratedProtocol = async () => {
    if (!accessToken) {
      addLog("Cloud link required. Check Auth Status.", "warn");
      return;
    }
    setLoading(true);
    addLog("Phase 1: Retrieving Stage 0 Master Universe...", "info");

    try {
      // 1. 데이터 로드
      const folderQ = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQ}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!folderRes.files?.length) throw new Error("Stage 0 Directory missing.");

      const fileQ = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and '${folderRes.files[0].id}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) throw new Error("Master Universe Matrix not found.");

      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      const data = contentRes.universe || [];
      setRawUniverse(data);
      addLog(`Synced ${data.length} assets. Running purification logic...`, "ok");

      // 2. 필터링 로직
      const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
      const equitiesOnly = data.filter((s: any) => !s.type || allowedTypes.includes(s.type));
      
      const prices = equitiesOnly.map((s: any) => s.price).filter((p: any) => p > 0).sort((a: any, b: any) => a - b);
      const volumes = equitiesOnly.map((s: any) => s.volume).filter((v: any) => v > 0).sort((a: any, b: any) => a - b);
      
      const stats: MarketStats = {
        medianPrice: prices[Math.floor(prices.length * 0.5)] || 0,
        medianVolume: volumes[Math.floor(volumes.length * 0.5)] || 0,
        p15Price: prices[Math.floor(prices.length * 0.15)] || 0,
        p40Volume: volumes[Math.floor(volumes.length * 0.4)] || 0,
        totalCount: equitiesOnly.length
      };
      setMarketStats(stats);

      const thresholdPrice = Math.max(2.0, stats.p15Price);
      const thresholdVolume = Math.max(100000, stats.p40Volume);
      setMinPrice(thresholdPrice);
      setMinVolume(thresholdVolume);

      const filtered = equitiesOnly.filter((s: any) => s.price >= thresholdPrice && s.volume >= thresholdVolume);
      setFilteredUniverse(filtered);
      addLog(`Purified: ${filtered.length} assets remaining. Committing to Vault...`, "ok");

      // 3. 데이터 저장 (커밋)
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_INVESTABLE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: { version: "1.7.0", node: "Integrated_Protocol", count: filtered.length, timestamp: new Date().toISOString() },
        investable_universe: filtered
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      addLog(`Vault Finalized: ${fileName}`, "ok");
    } catch (e: any) {
      addLog(`Integrated Protocol Error: ${e.message}`, "err");
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
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-8 md:p-10 rounded-[40px] border-t-2 border-t-emerald-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-14 h-14 rounded-3xl bg-emerald-600/10 flex items-center justify-center border border-emerald-500/20 ${loading ? 'animate-pulse' : ''}`}>
                <svg className={`w-6 h-6 text-emerald-500 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Purification_Hub v1.7.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className="text-[8px] font-black px-2 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase tracking-widest">Single_Action_Pipeline</span>
                </div>
              </div>
            </div>
            <button 
              onClick={executeIntegratedProtocol} 
              disabled={loading}
              className={`px-12 py-5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all disabled:opacity-50`}
            >
              {loading ? 'Synthesizing Pipeline...' : 'Run Purification & Commit'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-8 rounded-3xl border border-emerald-500/10">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Equity Purification Ratio</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-5xl font-black text-white italic tracking-tighter">{filteredUniverse.length.toLocaleString()}</span>
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Pure Equities</span>
              </div>
            </div>
            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 flex flex-col justify-center text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">ETF/Fund Purge</p>
              <p className="text-3xl font-black text-indigo-500/80 italic">{rawUniverse.length - filteredUniverse.length}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="bg-black/40 p-8 rounded-3xl border border-white/10">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-4">Price Floor: ${minPrice.toFixed(2)}</p>
              <input type="range" min="0" max="20" step="0.1" value={minPrice} disabled className="w-full accent-blue-500 opacity-50" />
            </div>
            <div className="bg-black/40 p-8 rounded-3xl border border-white/10">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-4">Volume Floor: {(minVolume/1000).toFixed(0)}k</p>
              <input type="range" min="0" max="1000000" step="10000" value={minVolume} disabled className="w-full accent-blue-500 opacity-50" />
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-blue-900'}`}>
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
