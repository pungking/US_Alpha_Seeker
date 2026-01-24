
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
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v1.6.5: Equity Purification Protocol Active.']);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [statusText, setStatusText] = useState('Standby');
  
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (accessToken && rawUniverse.length === 0) {
      loadStage0Data();
    }
  }, [accessToken]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-30));
  };

  const runMarketAnalysis = (data: MasterTicker[]) => {
    if (data.length === 0) return;
    setStatusText('Purifying Matrix...');

    const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
    const equitiesOnly = data.filter(s => !s.type || allowedTypes.includes(s.type));
    
    const prices = equitiesOnly.map(s => s.price).filter(p => p > 0).sort((a, b) => a - b);
    const volumes = equitiesOnly.map(s => s.volume).filter(v => v > 0).sort((a, b) => a - b);
    
    const stats: MarketStats = {
      medianPrice: prices[Math.floor(prices.length * 0.5)] || 0,
      medianVolume: volumes[Math.floor(volumes.length * 0.5)] || 0,
      p15Price: prices[Math.floor(prices.length * 0.15)] || 0,
      p40Volume: volumes[Math.floor(volumes.length * 0.4)] || 0,
      totalCount: equitiesOnly.length
    };

    setMarketStats(stats);
    
    if (isAutoMode) {
      const suggestedPrice = Math.max(2.0, Number(stats.p15Price.toFixed(2)));
      const suggestedVolume = Math.max(100000, stats.p40Volume);
      
      setMinPrice(suggestedPrice);
      setMinVolume(suggestedVolume);
      
      const filtered = equitiesOnly.filter(s => s.price >= suggestedPrice && s.volume >= suggestedVolume);
      setFilteredUniverse(filtered);
    } else {
      setFilteredUniverse(equitiesOnly.filter(s => s.price >= minPrice && s.volume >= minVolume));
    }
    setStatusText('Purification Complete');
  };

  const loadStage0Data = async () => {
    setLoading(true);
    setStatusText('Syncing Sub-Nodes...');
    try {
      const folderQ = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQ}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (folderRes.files?.length) {
        const fileQ = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and trashed = false`);
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&orderBy=createdTime desc&pageSize=1`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }).then(r => r.json());

        if (listRes.files?.length) {
          const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${listRes.files[0].id}?alt=media`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }).then(r => r.json());

          if (contentRes.universe) {
            setRawUniverse(contentRes.universe);
            runMarketAnalysis(contentRes.universe);
            addLog(`Loaded ${contentRes.universe.length} assets.`, "ok");
          }
        }
      }
    } catch (e: any) {
      addLog(`Sync Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const saveStage1Result = async () => {
    if (!accessToken || filteredUniverse.length === 0) return;
    setLoading(true);
    setStatusText('Vaulting Results...');
    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const payload = { investable_universe: filteredUniverse };
      const meta = { name: `STAGE1_INVESTABLE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`, parents: [folderId] };
      
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (res.ok) {
        addLog(`Vault Saved.`, "ok");
        setStatusText('Vault Committed');
      }
    } catch (e: any) {
      addLog(`Save Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and trashed = false`);
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
                <svg className={`w-6 h-6 text-emerald-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Quality_Nexus v1.6.5</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest bg-blue-500/20 text-blue-400`}>
                    Status: {statusText}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button onClick={loadStage0Data} disabled={loading} className="px-8 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5">
                {loading && statusText.includes('Sync') ? statusText : 'Sync Data Node'}
              </button>
              <button onClick={saveStage1Result} disabled={loading || filteredUniverse.length === 0} className="px-10 py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 transition-all">
                {loading && statusText.includes('Vault') ? statusText : 'Commit Equity Matrix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-8 rounded-3xl border border-emerald-500/10 relative overflow-hidden">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Purification Ratio</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-5xl font-black text-white italic tracking-tighter">{filteredUniverse.length.toLocaleString()}</span>
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Passed Equities</span>
              </div>
              <div className="h-3 bg-black/40 rounded-full mt-8 overflow-hidden p-0.5 border border-white/5">
                <div className="h-full bg-emerald-600 transition-all duration-1000" style={{ width: `${(filteredUniverse.length / (rawUniverse.length || 1)) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
