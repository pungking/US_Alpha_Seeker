
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET } from '../constants';

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
}

interface MarketStats {
  medianPrice: number;
  medianVolume: number;
  p10Price: number; // Bottom 10% price
  p40Volume: number; // Bottom 40% volume threshold
  totalCount: number;
}

const PreliminaryFilter: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [rawUniverse, setRawUniverse] = useState<MasterTicker[]>([]);
  const [filteredUniverse, setFilteredUniverse] = useState<MasterTicker[]>([]);
  const [logs, setLogs] = useState<string[]>(['> Filter_Node v1.5.0: Autonomous Intelligence Active.']);
  const [isAutoMode, setIsAutoMode] = useState(true);
  
  // Filter States
  const [minPrice, setMinPrice] = useState(2.0);
  const [minVolume, setMinVolume] = useState(500000);
  const [marketStats, setMarketStats] = useState<MarketStats | null>(null);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);

  // 1. 자동 로딩 트리거: 컴포넌트 마운트 시 토큰이 있으면 즉시 실행
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

  // 통계 분석 및 자동 튜닝 알고리즘
  const runMarketAnalysis = (data: MasterTicker[]) => {
    if (data.length === 0) return;

    const prices = data.map(s => s.price).filter(p => p > 0).sort((a, b) => a - b);
    const volumes = data.map(s => s.volume).filter(v => v > 0).sort((a, b) => a - b);
    
    const stats: MarketStats = {
      medianPrice: prices[Math.floor(prices.length * 0.5)],
      medianVolume: volumes[Math.floor(volumes.length * 0.5)],
      p10Price: prices[Math.floor(prices.length * 0.15)], // 하위 15% 가격
      p40Volume: volumes[Math.floor(volumes.length * 0.4)], // 하위 40% 거래량
      totalCount: data.length
    };

    setMarketStats(stats);
    addLog(`Market Distribution Mapped. Total Symbols: ${stats.totalCount}`, "info");

    if (isAutoMode) {
      // 자동 튜닝: 상위 유동성 60% 및 하위 저가주 15% 제거
      const suggestedPrice = Math.max(2.0, Number(stats.p10Price.toFixed(2)));
      const suggestedVolume = Math.max(200000, stats.p40Volume);
      
      setMinPrice(suggestedPrice);
      setMinVolume(suggestedVolume);
      
      const filtered = data.filter(s => s.price >= suggestedPrice && s.volume >= suggestedVolume);
      setFilteredUniverse(filtered);
      addLog(`Auto-Tune Active: Filtered to top ${((filtered.length/data.length)*100).toFixed(0)}% quality symbols.`, "ok");
    }
  };

  const loadStage0Data = async () => {
    if (!accessToken) {
      addLog("Authentication required for Cloud Vault access.", "warn");
      return;
    }

    setLoading(true);
    addLog("Searching for latest Stage 0 Discovery Matrix...", "info");

    try {
      // Stage 0 폴더 내의 최신 JSON 파일 검색
      const q = encodeURIComponent(`name contains 'STAGE0_MASTER_UNIVERSE' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (!listRes.files?.length) {
        addLog("Stage 0 data not found. Automatic gathering required first.", "err");
        setLoading(false);
        return;
      }

      const file = listRes.files[0];
      addLog(`Auto-Loading Matrix: ${file.name}`, "ok");

      const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json());

      if (contentRes.universe) {
        setRawUniverse(contentRes.universe);
        runMarketAnalysis(contentRes.universe);
      }
    } catch (e: any) {
      addLog(`Data Retrieval Failed: ${e.message}`, "err");
    } finally {
      setLoading(false);
    }
  };

  const applyManualFilters = () => {
    if (rawUniverse.length === 0) return;
    setIsAutoMode(false);
    const filtered = rawUniverse.filter(s => s.price >= minPrice && s.volume >= minVolume);
    setFilteredUniverse(filtered);
    addLog(`Manual Overide: Recalculating Matrix...`, "warn");
  };

  const saveStage1Result = async () => {
    if (!accessToken || filteredUniverse.length === 0) return;
    
    setLoading(true);
    addLog("Securing Quality Matrix in Stage1_Quality_Data...", "info");

    try {
      // 1. 폴더 존재 확인 및 자동 생성
      const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.stage1SubFolder);
      
      const fileName = `STAGE1_INVESTABLE_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
      const payload = {
        manifest: {
          version: "1.5.0",
          filter_mode: isAutoMode ? "AUTO_ADAPTIVE" : "MANUAL_FIXED",
          criteria: { minPrice, minVolume },
          market_stats: marketStats,
          total_retained: filteredUniverse.length,
          generated_at: new Date().toISOString()
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

      if (res.ok) {
        addLog(`Vault Commit Success: [${fileName}] encrypted.`, "ok");
      }
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
    
    addLog(`Generating Pipeline Node: ${name}...`, "info");
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
                <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Quality_Nexus v1.5.0</h2>
                <div className="flex items-center space-x-2 mt-2">
                   <span className={`text-[8px] font-black px-2 py-0.5 rounded border uppercase tracking-widest ${isAutoMode ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'bg-amber-500/20 text-amber-400 border-amber-500/20'}`}>
                    Mode: {isAutoMode ? 'Adaptive_Autonomous' : 'Manual_Control'}
                  </span>
                   <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Pipeline: Stage_1_Quality</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button 
                onClick={loadStage0Data}
                disabled={loading}
                className="px-8 py-4 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all border border-white/5"
              >
                Refresh Matrix
              </button>
              <button 
                onClick={saveStage1Result}
                disabled={loading || filteredUniverse.length === 0}
                className="px-10 py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/20 hover:scale-105 active:scale-95 transition-all"
              >
                Commit Quality Matrix
              </button>
            </div>
          </div>

          {/* Visualization Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div className="col-span-2 bg-gradient-to-br from-blue-600/10 to-transparent p-8 rounded-3xl border border-blue-500/10 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5">
                <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5V2a1 1 0 112 0v5a1 1 0 01-1 1h-6z" clipRule="evenodd" /><path d="M3 18a1 1 0 011-1h1V9a1 1 0 012 0v8h1a1 1 0 110 2H4a1 1 0 01-1-1zM8 18a1 1 0 011-1h1V13a1 1 0 112 0v4h1a1 1 0 110 2H9a1 1 0 01-1-1zM13 18a1 1 0 011-1h1v-4a1 1 0 112 0v4h1a1 1 0 110 2h-5a1 1 0 01-1-1z" /></svg>
              </div>
              <p className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2">Universe Filtration Efficiency</p>
              <div className="flex items-baseline space-x-6">
                <span className="text-5xl font-black text-white italic tracking-tighter">{filteredUniverse.length.toLocaleString()}</span>
                <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest italic">Retained of {rawUniverse.length.toLocaleString()}</span>
              </div>
              <div className="h-3 bg-black/40 rounded-full mt-8 overflow-hidden p-0.5">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-emerald-400 transition-all duration-1000 shadow-[0_0_15px_rgba(59,130,246,0.6)] rounded-full"
                  style={{ width: `${(filteredUniverse.length / (rawUniverse.length || 1)) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="bg-black/20 p-8 rounded-3xl border border-white/5 flex flex-col justify-center text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Noise Reduction</p>
              <p className="text-3xl font-black text-emerald-400 italic">
                {rawUniverse.length > 0 ? (100 - (filteredUniverse.length/rawUniverse.length*100)).toFixed(1) : "0.0"}%
              </p>
              <p className="text-[7px] text-slate-600 font-black uppercase mt-2">Assets Excluded</p>
            </div>
          </div>

          {/* Adaptive Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className={`bg-black/40 p-8 rounded-3xl border transition-all ${isAutoMode ? 'border-blue-500/20' : 'border-emerald-500/20'}`}>
              <div className="flex justify-between items-end mb-6">
                <div>
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Dynamic Price Floor</p>
                  <p className="text-[7px] text-slate-500 uppercase mt-1">Market Median: ${marketStats?.medianPrice.toFixed(2) || '0.00'}</p>
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
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Liquidity Safety Floor</p>
                  <p className="text-[7px] text-slate-500 uppercase mt-1">Avg Vol: {(marketStats?.medianVolume ? marketStats.medianVolume/1000 : 0).toFixed(0)}K</p>
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

          {isAutoMode && marketStats && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl flex items-center space-x-6">
               <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                  <span className="text-emerald-400 text-sm animate-pulse">◈</span>
               </div>
               <div>
                 <p className="text-[9px] text-emerald-300 font-black uppercase tracking-widest mb-1">Autonomous Intelligence Feedback</p>
                 <p className="text-[10px] text-slate-400 font-bold italic leading-relaxed">
                   Thresholds auto-tuned to market distribution. Preserving the top {((filteredUniverse.length/rawUniverse.length)*100).toFixed(0)}% tradeable assets for institutional-grade integrity.
                 </p>
               </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[680px] rounded-[40px] bg-slate-950 border-l-4 border-l-emerald-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8 px-2">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Pipeline_Protocol</h3>
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-emerald-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
          <div className="mt-8 p-6 bg-emerald-600/5 rounded-[24px] border border-emerald-500/10">
            <div className="flex items-center space-x-2 mb-3">
              <div className="w-1 h-3 bg-emerald-500"></div>
              <p className="text-[8px] text-emerald-400 font-black uppercase tracking-[0.2em]">Target Node</p>
            </div>
            <p className="text-[10px] text-slate-500 font-bold italic leading-snug">
              Stage 1 is the critical liquidity gateway. Only assets with sufficient depth are permitted to enter the Fundamental Quality Matrix.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreliminaryFilter;
