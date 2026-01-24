
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

    // 1차 필터링: 보통주(Common Stock), ADR, REIT 등 개별 주식 성격 종목만 추출 (ETF 제외)
    const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
    const equitiesOnly = data.filter(s => !s.type || allowedTypes.includes(s.type));
    
    addLog(`Pre-Purge: Excluded ${data.length - equitiesOnly.length} non-equity assets (ETFs/Funds).`, "ok");

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
      addLog(`Auto-Adaptive: Applied thresholds P>$${suggestedPrice}, V>${(suggestedVolume/1000).toFixed(0)}K`, "ok");
    } else {
      setFilteredUniverse(equitiesOnly.filter(s => s.price >= minPrice && s.volume >= minVolume));
    }
  };

  const loadStage0Data = async () => {
    if (!accessToken) {
      addLog("Cloud link required. Check Auth Status.", "warn");
      return;
    }

    setLoading(true);
    addLog("Scanning Stage 0 Sub-Nodes...", "info");

    try {
      const folderQ = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const folderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${folderQ}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!folderRes.files?.length) {
        addLog("Stage 0 Directory missing.", "err");
        setLoading(false);
        return;
      }

      const subFolderId = folderRes.files[0].id;
      const fileQ = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and '${subFolderId}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Master Universe Matrix not found.", "err");
        setLoading(false);
        return;
      }

      const file = listRes.files[0];
      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (contentRes.universe) {
        setRawUniverse(contentRes.universe);
        runMarketAnalysis(contentRes.universe);
        addLog(`Synchronized ${contentRes.universe.length} assets. Ready for Purification.`, "ok");
      }
    } catch (e: any) {
      addLog(`Pipeline Error: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const applyManualFilters = () => {
    if (rawUniverse.length === 0) return;
    setIsAutoMode(false);
    const allowedTypes = ['Common Stock', 'ADR', 'REIT', 'MLP'];
    const filtered = rawUniverse
      .filter(s => !s.type || allowedTypes.includes(s.type))
      .filter(s => s.price >= minPrice && s.volume >= minVolume);
    setFilteredUniverse(filtered);
    addLog(`Manual Correction: Matrix updated.`, "warn");
  };

  const saveStage1Result = async () => {
    if (!accessToken || filteredUniverse.length === 0) return;
    
    setLoading(true);
    addLog("Encrypted Handshake: Stage1_Quality_Data...", "info");

    try {
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      const fileName = `STAGE1_INVESTABLE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: {
          version: "1.6.5",
          node: "Preliminary_Filter",
          strategy: "EQUITY_PURIFICATION",
          parameters: { minPrice, minVolume },
          distribution: marketStats,
          count: filteredUniverse.length,
          timestamp: new Date().toISOString()
        },
        investable_universe: filteredUniverse
      };

      const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` }, body: form
      });

      if (res.ok) addLog(`Vault Saved: [${fileName}]. Only Equities Passed.`, "ok");
    } catch (e: any) {
      addLog(`Vault Transmission Failed: ${e.message}`, "err");
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
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Quality_Nexus v1.6.5</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${isAutoMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
                    Mode: {isAutoMode ? 'Adaptive_Equity' : 'Manual_Override'}
                  </span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Filter: Common_Stock + ADR Only</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button onClick={loadStage0Data} disabled={loading} className="px-8 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5">
                Sync Data Node
              </button>
              <button onClick={saveStage1Result} disabled={loading || filteredUniverse.length === 0} className="px-10 py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all">
                Commit Equity Matrix
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="col-span-2 bg-gradient-to-br from-emerald-600/10 to-transparent p-8 rounded-3xl border border-emerald-500/10 relative overflow-hidden">
              <p className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.3em] mb-2">Equity Purification Ratio</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-5xl font-black text-white italic tracking-tighter">{filteredUniverse.length.toLocaleString()}</span>
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Pure Equities</span>
              </div>
              <div className="h-3 bg-black/40 rounded-full mt-8 overflow-hidden p-0.5 border border-white/5">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-600 to-blue-500 transition-all duration-1000 shadow-[0_0_15px_rgba(16,185,129,0.5)] rounded-full"
                  style={{ width: `${(filteredUniverse.length / (rawUniverse.length || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 flex flex-col justify-center text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">ETF/Fund Purge</p>
              <p className="text-3xl font-black text-indigo-500/80 italic">
                {rawUniverse.length - filteredUniverse.length}
              </p>
              <p className="text-[7px] text-slate-600 font-black uppercase mt-2">Items Excluded</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className={`bg-black/40 p-8 rounded-3xl border transition-all ${isAutoMode ? 'border-blue-500/20' : 'border-emerald-500/20'}`}>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Price Floor ($)</p>
                  <p className="text-[7px] text-slate-500 uppercase mt-1">P15 Threshold: ${marketStats?.p15Price.toFixed(2) || '0.00'}</p>
                </div>
                <p className="text-xl font-mono font-black text-white italic">${minPrice.toFixed(2)}</p>
              </div>
              <input 
                type="range" min="0" max="50" step="0.1" 
                value={minPrice} 
                onChange={(e) => { setMinPrice(parseFloat(e.target.value)); setIsAutoMode(false); }}
                onMouseUp={applyManualFilters}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div className={`bg-black/40 p-8 rounded-3xl border transition-all ${isAutoMode ? 'border-blue-500/20' : 'border-emerald-500/20'}`}>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Volume Floor (v)</p>
                  <p className="text-[7px] text-slate-500 uppercase mt-1">V40 Threshold: {(marketStats?.p40Volume ? marketStats.p40Volume/1000 : 0).toFixed(0)}K</p>
                </div>
                <p className="text-xl font-mono font-black text-white italic">{(minVolume/1000).toFixed(0)}k</p>
              </div>
              <input 
                type="range" min="0" max="2000000" step="10000" 
                value={minVolume} 
                onChange={(e) => { setMinVolume(parseInt(e.target.value)); setIsAutoMode(false); }}
                onMouseUp={applyManualFilters}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[720px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Purification_Logs</h3>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>
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
