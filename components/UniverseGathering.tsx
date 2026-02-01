import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiProvider, ApiStatus } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

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
  externalRegistry?: Map<string, MasterTicker>; 
  onRegistryUpdate?: (registry: Map<string, MasterTicker>) => void;
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

const UniverseGathering: React.FC<Props> = ({ 
  onAuthSuccess, 
  isActive, 
  apiStatuses, 
  onStockSelected, 
  autoStart, 
  onComplete,
  externalRegistry,
  onRegistryUpdate
}) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => 
    localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com'
  );
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;

  const effectiveRegistry = useMemo(() => externalRegistry || new Map<string, MasterTicker>(), [externalRegistry]);

  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    found: effectiveRegistry.size || 0,
    synced: effectiveRegistry.size || 0,
    target: 20000,
    elapsed: 0,
    provider: effectiveRegistry.size > 0 ? 'FMP + Finnhub Fusion' : 'Idle',
    phase: effectiveRegistry.size > 0 ? 'Finalized' : 'Idle' as 'Idle' | 'Discovery' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  useEffect(() => {
    if (effectiveRegistry.size > 0) {
        setStats(prev => ({
            ...prev,
            found: effectiveRegistry.size,
            synced: effectiveRegistry.size,
            provider: 'FMP + Finnhub Fusion',
            phase: 'Finalized'
        }));
    }
  }, [effectiveRegistry]);

  const [logs, setLogs] = useState<string[]>(['> Engine v2.4.3: Institutional Data Fusion Ready.']);
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
        if (accessToken) {
             if (effectiveRegistry.size > 0) {
                addLog("AUTO-PILOT: Matrix active. Synchronizing...", "ok");
                if (onComplete) onComplete();
             } else {
                startEngine();
             }
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
    if (!accessToken) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive',
          callback: (res: any) => {
            if (res.access_token) {
              setAccessToken(res.access_token);
              sessionStorage.setItem('gdrive_access_token', res.access_token);
              onAuthSuccess?.(true);
              addLog("Cloud Vault Securely Linked.", "ok");
            }
          },
        });
        client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) { addLog(`Nexus Link Error: ${e.message}`, "err"); }
      return;
    }
    document.body.setAttribute('data-engine-running', 'true');
    runAggregatedPipeline(accessToken);
  };

  const executeDiscoveryStrategy = async (): Promise<MasterTicker[]> => {
    if (!finnhubKey) throw new Error("Finnhub Key Missing");
    addLog("Executing Strategy: Multi-Provider Symbol Discovery...", "info");
    
    const fhRes = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`);
    if (!fhRes.ok) throw new Error("Symbol Discovery Failed");
    const fhData = await fhRes.json();
    
    const validSymbols = fhData.filter((s: any) => ['Common Stock', 'ADR', 'REIT'].includes(s.type || 'Common Stock'));
    addLog(`Discovery: ${validSymbols.length} raw candidates found. Mapping real-time pricing...`, "ok");
    
    let targetDate = getInitialTargetDate();
    let pricingMap = new Map();
    
    if (polygonKey) {
        try {
            const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
            if (polyRes.ok) {
                const polyData = await polyRes.json();
                (polyData.results || []).forEach((p: any) => pricingMap.set(p.T, p));
            }
        } catch (e) { addLog("Pricing failover active.", "warn"); }
    }

    return validSymbols.map((s: any) => {
        const p = pricingMap.get(s.symbol);
        return {
            symbol: s.symbol,
            name: s.description || s.symbol,
            type: s.type || 'Common Stock',
            price: p ? p.c : 0,
            volume: p ? p.v : 0,
            change: p && p.o ? ((p.c - p.o) / p.o) * 100 : 0,
            updated: p ? targetDate : 'N/A'
        };
    });
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
        const masterData = await executeDiscoveryStrategy();
        setStats(prev => ({ ...prev, found: masterData.length, provider: 'FMP + Finnhub Fusion', phase: 'Mapping' }));
        
        const registryMap = new Map(masterData.map(i => [i.symbol, i]));
        if (onRegistryUpdate) onRegistryUpdate(registryMap);

        addLog(`Phase 3: Archiving ${masterData.length} assets to Vault...`, "info");
        setStats(prev => ({ ...prev, phase: 'Commit' }));

        const folderId = await ensureFolder(token);
        if (folderId) {
            const fileName = `STAGE0_MASTER_UNIVERSE_v2.4.3.json`;
            const payload = { manifest: { version: "2.4.3", date: new Date().toISOString(), count: masterData.length, provider: "FMP + Finnhub Fusion" }, universe: masterData };
            const meta = { name: fileName, parents: [folderId], mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
            form.append('file', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
            
            await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { 
                method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form 
            });
            
            setStats(prev => ({ ...prev, synced: masterData.length, phase: 'Finalized' }));
            addLog(`System: Global Universe Matrix Archive Success.`, "ok");
            if (onComplete) onComplete(); 
        }

    } catch (e: any) {
      addLog(`Fatal Node Error: ${e.message}`, "err");
      setStats(prev => ({ ...prev, phase: 'Idle' }));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsEngineRunning(false);
      document.body.removeAttribute('data-engine-running');
    }
  };

  const ensureFolder = async (token: string) => {
    let rootId = GOOGLE_DRIVE_TARGET.rootFolderId;
    const rootName = GOOGLE_DRIVE_TARGET.rootFolderName;
    try {
        const qRoot = encodeURIComponent(`name = '${rootName}' and 'root' in parents and trashed = false`);
        const resRoot = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
        if (resRoot.files && resRoot.files.length > 0) rootId = resRoot.files[0].id;
    } catch (e) {}
    const q = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${rootId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json());
    if (res.files?.length > 0) return res.files[0].id;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GOOGLE_DRIVE_TARGET.targetSubFolder, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
    }).then(r => r.json());
    return create.id;
  };

  const searchResult = useMemo(() => {
    if (!searchTerm) return null;
    return effectiveRegistry.get(searchTerm.toUpperCase());
  }, [searchTerm, effectiveRegistry]);

  const handleSetTarget = () => {
      if (searchResult && onStockSelected) onStockSelected(searchResult);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.3</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit: ${cooldown}s` : 'Strategic_Fusion_Active'}
                  </span>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            <button onClick={startEngine} disabled={isEngineRunning || cooldown > 0} className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEngineRunning || cooldown > 0 ? 'bg-slate-800 text-slate-500' : !accessToken ? 'bg-amber-600 text-white shadow-xl animate-pulse' : 'bg-blue-600 text-white shadow-xl shadow-blue-900/20'}`}>{isEngineRunning ? 'Harvesting Matrix...' : cooldown > 0 ? `Wait ${cooldown}s` : !accessToken ? 'Link Cloud Vault' : 'Execute Data Fusion'}</button>
          </div>
           <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-4 italic">Global Integrity Validator</p>
            <div className="flex flex-col md:flex-row gap-4">
              <input type="text" placeholder="Verify Ticker (e.g. AAPL, TSLA)" className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                {searchResult ? (
                  <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                    <span className="truncate">{searchResult.name || searchResult.symbol}</span>
                    <div className="flex items-center gap-3">
                        <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price?.toFixed(2) || '0.00'}</span>
                        <button onClick={handleSetTarget} className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg">Set Audit Target</button>
                    </div>
                  </div>
                ) : ( <span className="text-[10px] font-black italic uppercase tracking-widest">Awaiting Master Matrix Signal...</span> )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Active Provider', val: stats.provider, color: 'text-indigo-400 font-black' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 shadow-inner">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-lg md:text-xl font-mono font-black italic ${s.color} truncate`}>{s.val}</p>
              </div>
            ))}
          </div>
           <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div className={`h-full rounded-xl transition-all duration-700 ${cooldown > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`} style={{ width: stats.phase === 'Finalized' ? '100%' : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}></div>
          </div>
        </div>
      </div>
      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl overflow-hidden">
          <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic mb-8 px-2">Synthesis_Terminal</h3>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : 'border-blue-900'}`}>{l}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
