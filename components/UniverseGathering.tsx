
import React, { useState, useEffect, useRef } from 'react';
import { ApiStatus, ApiProvider } from '../types';
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  isActive: boolean;
  apiStatuses: any[];
  onAuthSuccess: (status: boolean) => void;
  onStockSelected: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

const UniverseGathering: React.FC<Props> = ({
  isActive,
  apiStatuses,
  onAuthSuccess,
  onStockSelected,
  autoStart,
  onComplete
}) => {
  const [isGathering, setIsGathering] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lockTimer, setLockTimer] = useState(0);
  const [clientId, setClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');
  const [accessToken, setAccessToken] = useState(sessionStorage.getItem('gdrive_access_token'));
  
  // Search / Live Data State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  
  // Status State
  const [statusState, setStatusState] = useState({ found: 0, synced: 0, target: 10000, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  const [logs, setLogs] = useState<string[]>(['> Engine v2.4.0: Adaptive Multi-Provider Protocol Online.']);
  
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const twelveDataKey = API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key;

  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (lockTimer > 0) {
      const t = setTimeout(() => setLockTimer(lockTimer - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [lockTimer]);

  useEffect(() => {
    if (autoStart && isActive && !isGathering && lockTimer === 0) {
       if (accessToken) {
           addLog("AUTO-PILOT: Engaging Universe Gathering Sequence...", "signal");
           handleGathering();
       } else {
           addLog("AUTO-PILOT: Auth Token Missing. Halting.", "err");
       }
    }
  }, [autoStart, isActive]);

  // Search Effect for "Global Integrity Validator"
  useEffect(() => {
    if (!searchTerm || !polygonKey) return;
    const delay = setTimeout(async () => {
       try {
           setIsLive(false);
           const res = await fetch(`https://api.polygon.io/v3/reference/tickers?ticker=${searchTerm.toUpperCase()}&active=true&limit=1&apiKey=${polygonKey}`);
           const data = await res.json();
           if (data.results && data.results.length > 0) {
               const t = data.results[0];
               // Get price
               const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${t.ticker}/prev?adjusted=true&apiKey=${polygonKey}`);
               const priceData = await priceRes.json();
               const price = priceData.results?.[0]?.c || 0;
               const change = priceData.results?.[0] ? ((price - priceData.results[0].o) / priceData.results[0].o) * 100 : 0;
               
               const stock = {
                   symbol: t.ticker,
                   name: t.name,
                   price: price,
                   change: change,
                   changeAmount: priceData.results?.[0] ? price - priceData.results[0].o : 0
               };
               setSearchResult(stock);
               onStockSelected(stock);
               setIsLive(true);
           } else {
               setSearchResult(null);
           }
       } catch (e) { console.error(e); setIsLive(false); }
    }, 1000);
    return () => clearTimeout(delay);
  }, [searchTerm]);

  // Fake Live Data Simulation for the visual component
  useEffect(() => {
      if (isLive && searchResult) {
          const interval = setInterval(() => {
             const move = (Math.random() - 0.5) * 0.1;
             const newPrice = searchResult.price + move;
             setPriceFlash(move > 0 ? 'up' : 'down');
             setSearchResult((prev: any) => ({
                 ...prev,
                 price: newPrice,
                 changeAmount: prev.changeAmount + move
             }));
             setTimeout(() => setPriceFlash(null), 300);
          }, 3000);
          return () => clearInterval(interval);
      }
  }, [isLive]);


  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-50));
  };

  const handleAuth = () => {
    if (!clientId) {
      addLog("Missing Client ID. Open ⚙ Config.", "err");
      setShowConfig(true);
      return;
    }
    
    // Check if gapi is loaded
    if (typeof window.google === 'undefined' || !window.google.accounts) {
        addLog("Google Identity Services script not loaded.", "err");
        return;
    }

    try {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: 'https://www.googleapis.com/auth/drive',
            callback: (response: any) => {
                if (response.access_token) {
                    setAccessToken(response.access_token);
                    sessionStorage.setItem('gdrive_access_token', response.access_token);
                    onAuthSuccess(true);
                    addLog("Cloud Vault Linked. Ready to Execute Fusion.", "ok");
                }
            },
        });
        client.requestAccessToken({ prompt: 'consent' });
    } catch (e: any) {
        addLog(`Auth Error: ${e.message}`, "err");
        setShowConfig(true);
    }
  };

  const fetchFmp = async () => {
      if (!fmpKey) throw new Error("FMP Key missing");
      addLog("Strategy A: FMP Bulk Screener (Primary)...", "info");
      const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000&volumeMoreThan=1000&exchange=NASDAQ,NYSE,AMEX&limit=12000&apikey=${fmpKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FMP Status ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid FMP Data Format");
      addLog(`FMP: Retrieved ${data.length} assets.`, "ok");
      return data.map((item: any) => ({
          symbol: item.symbol,
          name: item.companyName,
          price: item.price,
          volume: item.volume,
          change: item.changesPercentage || 0,
          marketCap: item.marketCap,
          sector: item.sector,
          type: 'Common Stock',
          updated: new Date().toISOString().split('T')[0]
      }));
  };

  const fetchFinnhubPoly = async () => {
      if (!finnhubKey || !polygonKey) throw new Error("Keys missing");
      addLog("Strategy B: Finnhub Discovery + Polygon Pricing...", "info");
      
      // 1. Finnhub Symbols
      const res = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`);
      if (!res.ok) throw new Error("Finnhub API Error");
      const data = await res.json();
      const symbols = data.filter((d: any) => ['Common Stock', 'ADR', 'REIT'].includes(d.type));
      addLog(`Finnhub: Found ${symbols.length} symbols. Syncing Polygon market data...`, "info");
      
      // 2. Polygon Grouped Daily (Yesterday)
      // Simple approximation for demo purposes as we can't fetch 20k individual quotes quickly without paid plan
      const date = new Date();
      date.setDate(date.getDate() - 1); 
      // Adjust for weekend
      if (date.getDay() === 0) date.setDate(date.getDate() - 2);
      else if (date.getDay() === 6) date.setDate(date.getDate() - 1);
      
      const dateStr = date.toISOString().split('T')[0];
      const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${dateStr}?adjusted=true&apiKey=${polygonKey}`);
      
      if (!polyRes.ok) throw new Error("Polygon API Error");
      const polyData = await polyRes.json();
      const priceMap = new Map(polyData.results?.map((r: any) => [r.T, r]) || []);
      
      const results: any[] = [];
      symbols.forEach((s: any) => {
          const p: any = priceMap.get(s.symbol);
          if (p) {
              results.push({
                  symbol: s.symbol,
                  name: s.description,
                  type: s.type,
                  price: p.c,
                  volume: p.v,
                  change: p.o ? ((p.c - p.o) / p.o) * 100 : 0,
                  updated: dateStr
              });
          }
      });
      return results;
  };

  const handleGathering = async () => {
      if (!accessToken) return;
      setIsGathering(true);
      const start = Date.now();
      setStatusState(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
      
      timerRef.current = window.setInterval(() => {
          setStatusState(prev => ({ ...prev, elapsed: Math.floor((Date.now() - start) / 1000) }));
      }, 1000);

      let universe: any[] = [];
      let provider = "None";

      try {
          try {
              universe = await fetchFmp();
              provider = "FMP (Primary)";
          } catch (e) {
              try {
                  universe = await fetchFinnhubPoly();
                  provider = "Polygon+Finnhub";
              } catch (e2) {
                  throw new Error("All Market Data Providers Exhausted.");
              }
          }

          if (universe.length === 0) throw new Error("Zero Assets Found.");
          
          setStatusState(prev => ({ ...prev, found: universe.length, provider, phase: 'Mapping' }));

          addLog(`Phase 3: Committing ${universe.length} assets to Vault...`, "info");
          setStatusState(prev => ({ ...prev, phase: 'Commit' }));

          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const fileName = `STAGE0_MASTER_UNIVERSE_v10.0.json`; // Updated version
          
          const payload = {
              manifest: { version: "10.0.0", provider, date: new Date().toISOString(), count: universe.length },
              universe
          };
          
          await uploadFile(accessToken, folderId, fileName, payload);
          
          setStatusState(prev => ({ ...prev, synced: universe.length, phase: 'Finalized' }));
          addLog(`System: Cloud Vault Sync Complete via ${provider}.`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Fatal Error: ${e.message}`, "err");
          setStatusState(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsGathering(false);
      }
  };

  const ensureFolder = async (token: string, name: string) => {
    const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      
      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-panel p-8 rounded-[40px] max-w-md w-full border-t-2 border-t-blue-500 shadow-2xl space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-black text-white italic tracking-tight uppercase">Infrastructure Config</h3>
              <button onClick={() => setShowConfig(false)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Google Cloud Client ID</label>
              <input 
                type="text" 
                value={clientId} 
                onChange={(e) => setClientId(e.target.value)} 
                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none" 
                placeholder="Enter GDrive Client ID"
              />
            </div>
            <button onClick={() => { localStorage.setItem('gdrive_client_id', clientId); setShowConfig(false); addLog("Infrastructure Persisted.", "ok"); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all">
                Apply Changes
            </button>
          </div>
        </div>
      )}

      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
                <div className="flex items-center space-x-4 md:space-x-6">
                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isGathering ? 'animate-pulse' : ''}`}>
                        <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isGathering ? 'animate-spin' : ''}`}></div>
                    </div>
                    <div>
                        <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.0</h2>
                        <div className="flex items-center mt-2 space-x-2">
                             <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${lockTimer > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                                 {lockTimer > 0 ? `Rate_Limit_Lock: ${lockTimer}s` : 'Multi-Provider_Ready'}
                             </span>
                             <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                             {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                        </div>
                    </div>
                </div>
            </div>
            
            <button 
                onClick={accessToken ? handleGathering : handleAuth} 
                disabled={isGathering || lockTimer > 0} 
                className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isGathering || lockTimer > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : accessToken ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'}`}
            >
                {isGathering ? 'Acquiring Universe...' : lockTimer > 0 ? `Wait ${lockTimer}s` : accessToken ? 'Execute Data Fusion' : 'Connect Cloud Vault'}
            </button>
        </div>

        <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
                <div className="flex items-center gap-2">
                    <span className="text-[8px] text-slate-500 uppercase">Mode: Active_Equity_Mapping</span>
                </div>
            </div>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <input 
                        type="text" 
                        placeholder="Verify Ticker (e.g. AAPL, TSLA)" 
                        className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    
                    <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900 border-white/5'}`}>
                        {searchResult ? (
                            <div className="w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <p className="text-xl font-black text-white">{searchResult.symbol}</p>
                                        <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{searchResult.name}</p>
                                    </div>
                                    <div className="text-right">
                                        {isLive ? (
                                            <>
                                                <p className={`text-2xl font-mono font-black transition-all duration-300 ${priceFlash === 'up' ? 'text-emerald-300 scale-110' : priceFlash === 'down' ? 'text-rose-300 scale-110' : 'text-emerald-400'}`}>
                                                    ${searchResult.price?.toFixed(2) || 'N/A'}
                                                </p>
                                                <p className={`text-[10px] font-bold flex items-center justify-end gap-1 ${searchResult.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    <span>{searchResult.change >= 0 ? '▲' : '▼'} {Math.abs(searchResult.changeAmount || 0).toFixed(2)}</span>
                                                    <span className="opacity-50">({Math.abs(searchResult.change || 0).toFixed(2)}%)</span>
                                                </p>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-end animate-pulse">
                                                <div className="h-8 w-28 bg-emerald-500/10 rounded mb-1 border border-emerald-500/10"></div>
                                                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Syncing Live Data...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2 bg-black/40 p-3 rounded-xl border border-white/5 mb-4">
                                    {[
                                        { l: 'Range', v: '---' },
                                        { l: 'Vol', v: '---' },
                                        { l: 'Mkt Cap', v: '---' },
                                        { l: 'Beta', v: '---' }
                                    ].map((m, idx) => (
                                        <div key={idx} className="text-center">
                                            <p className="text-[7px] text-slate-500 uppercase">{m.l}</p>
                                            <p className="text-[9px] font-mono text-slate-300">{m.v}</p>
                                        </div>
                                    ))}
                                </div>

                                <button onClick={() => onStockSelected(searchResult)} className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg transition-all">
                                    Set Audit Target
                                </button>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black italic uppercase tracking-widest w-full text-center text-slate-500">Awaiting Master Map...</span>
                        )}
                    </div>
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
                { label: 'Equities Found', val: statusState.found.toLocaleString(), color: 'text-white' },
                { label: 'Active Provider', val: statusState.provider, color: 'text-indigo-400' },
                { label: 'Cycle Time', val: `${statusState.elapsed}s`, color: 'text-slate-400' },
                { label: 'Pipeline Phase', val: statusState.phase, color: 'text-blue-400' }
            ].map((stat, idx) => (
                <div key={idx} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                    <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{stat.label}</p>
                    <p className={`text-lg md:text-xl font-mono font-black italic ${stat.color} truncate`}>{stat.val}</p>
                </div>
            ))}
        </div>

        <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
                className={`h-full rounded-xl transition-all duration-700 ${lockTimer > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`} 
                style={{ width: statusState.phase === 'Finalized' ? '100%' : lockTimer > 0 ? `${(lockTimer / 60) * 100}%` : `${Math.min(100, (statusState.found / statusState.target) * 100)}%` }}
            ></div>
        </div>
      </div>

      <div className="xl:col-span-1">
         <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
             <div className="flex items-center justify-between mb-8">
                 <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Synthesis_Terminal</h3>
             </div>
             <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
                 {logs.map((log, i) => (
                     <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[WARN]') ? 'border-amber-500 text-amber-400' : log.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                         {log}
                     </div>
                 ))}
             </div>
         </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
