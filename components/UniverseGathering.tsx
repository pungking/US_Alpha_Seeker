import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ApiProvider, ApiStatus } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { analyzePipelineStatus } from '../services/intelligenceService';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onAuthSuccess?: (status: boolean) => void;
  isActive: boolean;
  apiStatuses: ApiStatus[];
  onStockSelected?: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

interface MasterTicker {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  change: number;
  updated: string;
  type?: string; 
  marketCap?: number;
  sector?: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const twelveDataKey = API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key;

  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 10000,
    elapsed: 0,
    provider: 'Idle',
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v2.4.0: Adaptive Multi-Provider Protocol Online.']);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    if (autoStart && isActive && !isEngineRunning && cooldown === 0) {
        if (!accessToken) {
             addLog("AUTO-PILOT: Auth Token Missing. Halting.", "err");
        } else {
             addLog("AUTO-PILOT: Engaging Universe Gathering Sequence...", "signal");
             startEngine();
        }
    }
  }, [autoStart, isActive]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const getInitialTargetDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1); 
    if (d.getDay() === 0) d.setDate(d.getDate() - 2); 
    else if (d.getDay() === 6) d.setDate(d.getDate() - 1); 
    return d.toISOString().split('T')[0];
  };

  const startEngine = async () => {
    if (isEngineRunning || cooldown > 0) return;
    if (!clientId) { addLog("Missing Client ID. Open ⚙ Config.", "err"); setShowConfig(true); return; }

    if (!accessToken) {
      document.body.setAttribute('data-engine-running', 'true');
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (res: any) => {
            if (res.access_token) {
              setAccessToken(res.access_token);
              sessionStorage.setItem('gdrive_access_token', res.access_token);
              onAuthSuccess?.(true);
              addLog("Cloud Vault Linked. Ready to Execute Fusion.", "ok");
              document.body.removeAttribute('data-engine-running'); 
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
        addLog(`Auth Error: ${e.message}`, "err");
        document.body.removeAttribute('data-engine-running');
      }
      return;
    }

    document.body.setAttribute('data-engine-running', 'true');
    runAggregatedPipeline(accessToken);
  };

  const executeFmpStrategy = async (): Promise<MasterTicker[]> => {
    if (!fmpKey) throw new Error("FMP Key missing");
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000&volumeMoreThan=1000&exchange=NASDAQ,NYSE,AMEX&limit=12000&apikey=${fmpKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FMP Status ${res.status}`);
    const data = await res.json();
    return data.map((item: any) => ({
        symbol: item.symbol, name: item.companyName, price: item.price, volume: item.volume, change: item.changesPercentage || 0, marketCap: item.marketCap, sector: item.sector, type: 'Common Stock', updated: new Date().toISOString().split('T')[0]
    }));
  };

  const executePolygonStrategy = async (): Promise<MasterTicker[]> => {
    if (!finnhubKey || !polygonKey) throw new Error("Finnhub or Polygon Key missing");
    const fhRes = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`);
    const fhData = await fhRes.json();
    // [FIX] Explicitly type the Map to avoid unknown type inference
    const symbolMap = new Map<string, any>();
    fhData.forEach((s: any) => symbolMap.set(s.symbol, { name: s.description, type: s.type || 'Common Stock' }));
    
    let targetDate = getInitialTargetDate();
    const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
    const data = await polyRes.json();
    // [FIX] Explicitly type the Map to avoid unknown type inference
    const polyMap = new Map<string, any>((data.results || []).map((p: any) => [p.T, p]));
    
    const results: MasterTicker[] = [];
    symbolMap.forEach((meta, symbol) => {
        const p = polyMap.get(symbol);
        results.push({
            symbol, name: meta.name, type: meta.type, price: p ? p.c : 0, volume: p ? p.v : 0, change: p && p.o ? ((p.c - p.o) / p.o) * 100 : 0, updated: p ? targetDate : 'N/A'
        });
    });
    return results;
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
        let masterData: MasterTicker[] = [];
        let usedProvider = "FMP (Primary)";
        try { masterData = await executeFmpStrategy(); } 
        catch { masterData = await executePolygonStrategy(); usedProvider = "Polygon+Finnhub"; }

        setStats(prev => ({ ...prev, found: masterData.length, provider: usedProvider, phase: 'Mapping' }));
        setRegistry(new Map(masterData.map(i => [i.symbol, i])));

        addLog(`Phase 3: Committing ${masterData.length} assets to Vault...`, "info");
        setStats(prev => ({ ...prev, phase: 'Commit' }));

        const folderId = await ensureFolder(token);
        await uploadFile(token, folderId, `STAGE0_MASTER_UNIVERSE_v2.4.0.json`, { 
            manifest: { version: "2.4.0", provider: usedProvider, date: new Date().toISOString(), count: masterData.length }, 
            universe: masterData 
        });

        setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
        addLog(`System: Cloud Vault Sync Complete via ${usedProvider}.`, "ok");
        if (onComplete) onComplete(); 

    } catch (e: any) {
      addLog(`Fatal Error: ${e.message}`, "err");
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsEngineRunning(false);
      document.body.removeAttribute('data-engine-running');
    }
  };

  const getFolderIdByName = async (token: string, name: string, parentId?: string) => {
    let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data.files?.length > 0 ? data.files[0].id : null;
  };

  const createFolder = async (token: string, name: string, parentId?: string) => {
    const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) body.parents = [parentId];
    const res = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return data.id;
  };

  const ensureFolder = async (token: string) => {
    // 1. Ensure Root
    let rootId = await getFolderIdByName(token, GOOGLE_DRIVE_TARGET.rootFolderName);
    if (!rootId) rootId = await createFolder(token, GOOGLE_DRIVE_TARGET.rootFolderName);
    if (!rootId) throw new Error("Could not access or create Root Folder");

    // 2. Ensure Subfolder
    let subId = await getFolderIdByName(token, GOOGLE_DRIVE_TARGET.targetSubFolder, rootId);
    if (!subId) subId = await createFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder, rootId);
    if (!subId) throw new Error("Could not access or create Subfolder");
    return subId;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const boundary = '-------314159265358979323846';
    const metadata = { name, parents: [folderId], mimeType: 'application/json' };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content, null, 2)}\r\n--${boundary}--`;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Upload Failed: ${err.error?.message || res.statusText}`);
    }
  };

  const searchResult = useMemo(() => {
    if (!searchTerm) return null;
    return registry.get(searchTerm.toUpperCase());
  }, [searchTerm, registry]);

  const handleSetTarget = () => { if (searchResult && onStockSelected) onStockSelected(searchResult); };

  const handleClientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setClientId(value);
      localStorage.setItem('gdrive_client_id', value);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          {showConfig && (
            <div className="absolute inset-0 z-50 bg-[#020617]/95 backdrop-blur-xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
               <div className="max-w-md w-full space-y-6">
                  <div className="flex justify-between items-center border-b border-white/10 pb-4">
                     <h3 className="text-xl font-black text-white italic tracking-tighter uppercase">Infrastructure Config</h3>
                     <button onClick={() => setShowConfig(false)} className="text-slate-500 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                     </button>
                  </div>
                  <input type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-xs focus:border-blue-500 outline-none" placeholder="Enter OAuth 2.0 Client ID" value={clientId} onChange={handleClientIdChange} />
                  <button onClick={() => setShowConfig(false)} className="w-full py-4 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20">Save & Close Config</button>
               </div>
            </div>
          )}
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>{cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Multi-Provider_Ready'}</span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:text-white transition-colors">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            <button onClick={startEngine} disabled={isEngineRunning || cooldown > 0} className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning || cooldown > 0 ? 'bg-slate-800 text-slate-500' : !accessToken ? 'bg-amber-600 text-white animate-pulse' : 'bg-blue-600 text-white shadow-xl'}`}>
              {isEngineRunning ? 'Acquiring Universe...' : cooldown > 0 ? `Wait ${cooldown}s` : !accessToken ? 'Connect Cloud Vault' : 'Execute Data Fusion'}
            </button>
          </div>
          
           <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
            <input type="text" placeholder="Verify Ticker (e.g. AAPL, TSLA)" className="w-full bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchResult && (
              <div className="mt-4 flex justify-between items-center bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/20">
                <span className="text-emerald-400 font-mono text-xs">{searchResult.name} (${searchResult.price?.toFixed(2)})</span>
                <button onClick={handleSetTarget} className="px-4 py-2 bg-rose-600 text-white rounded-lg text-[8px] font-black uppercase">Set Audit Target</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Active Provider', val: stats.provider, color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-4 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-widest">{s.label}</p>
                <p className={`text-lg font-mono font-black italic ${s.color} truncate`}>{s.val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-full rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-8">Synthesis_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : 'border-blue-900'}`}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
