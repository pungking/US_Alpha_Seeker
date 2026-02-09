
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
  industry?: string;
  
  // Fundamentals
  pe?: number;
  eps?: number;
  roe?: number;
  debtToEquity?: number;
  pb?: number;     // Price to Book
  currentRatio?: number;
  revenue?: number;

  source?: string;
  cik?: number; // SEC ID
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => 
    localStorage.getItem('gdrive_client_id') || '274071737753-4993td0fv4un5l8lv2eiqp0utc7co6q9.apps.googleusercontent.com'
  );
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  
  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 15000, 
    elapsed: 0,
    provider: 'Idle',
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Fusion' | 'Validation' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v6.0.0: Quad-Core Fusion (TV+SEC+Poly+MSN).']);
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Google Script Check
  useEffect(() => {
    const checkGoogle = setInterval(() => {
        if (window.google && window.google.accounts) {
            setGoogleScriptLoaded(true);
            clearInterval(checkGoogle);
        }
    }, 500);
    return () => clearInterval(checkGoogle);
  }, []);

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
             addLog("AUTO-PILOT: Engaging Quad-Core Fusion...", "signal");
             startEngine();
        }
    }
  }, [autoStart, isActive]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const startEngine = async () => {
    if (isEngineRunning || cooldown > 0 || isAuthLoading) return;
    
    if (!clientId) {
      addLog("Missing Client ID. Open ⚙ Config.", "err");
      setShowConfig(true);
      return;
    }

    if (!accessToken) {
      if (!googleScriptLoaded) {
          addLog("Google Scripts loading... please wait.", "warn");
          return;
      }
      document.body.setAttribute('data-engine-running', 'true');
      setIsAuthLoading(true);
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive',
          callback: (res: any) => {
            setIsAuthLoading(false);
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
        setIsAuthLoading(false);
        addLog(`Auth Error: ${e.message}`, "err");
        setShowConfig(true);
        document.body.removeAttribute('data-engine-running');
      }
      return;
    }

    document.body.setAttribute('data-engine-running', 'true');
    runQuadFusionPipeline(accessToken);
  };

  // --- SOURCE A: TRADINGVIEW SCANNER (The Holy Grail) ---
  const executeTVScanner = async (): Promise<MasterTicker[]> => {
      addLog("Source A: TradingView Deep-Scanner (PBR/Debt/Rev)...", "info");
      const res = await fetch('/api/nasdaq'); 
      if (!res.ok) throw new Error(`TV Proxy Failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid TV Data");
      addLog(`TV Scanner: Retrieved ${data.length} rich-data assets.`, "ok");
      
      return data.map((item: any) => ({
          symbol: item.symbol, 
          name: item.name, 
          price: item.price, 
          volume: item.volume, 
          change: item.change, 
          marketCap: item.marketCap, 
          sector: item.sector || "Unclassified", 
          industry: item.industry || "Unknown", 
          pe: item.pe, 
          eps: item.eps,
          roe: item.roe,
          debtToEquity: item.debtToEquity,
          pb: item.pbr,
          currentRatio: item.currentRatio,
          revenue: item.revenue,
          type: 'Common Stock', 
          updated: new Date().toISOString().split('T')[0], 
          source: 'TV_Scanner'
      }));
  };

  // --- SOURCE B: SEC EDGAR (Official Registry) ---
  const executeSECRegistry = async (): Promise<MasterTicker[]> => {
      addLog("Source B: SEC Official Registry (CIK Mapping)...", "info");
      try {
          const res = await fetch('/api/sec');
          if (!res.ok) throw new Error(`SEC Proxy Failed: ${res.status}`);
          const data = await res.json();
          addLog(`SEC Registry: Retrieved ${data.length} official issuers.`, "ok");
          
          return data.map((item: any) => ({
              symbol: item.symbol, 
              name: item.name, 
              price: 0, volume: 0, change: 0, 
              updated: new Date().toISOString().split('T')[0],
              source: 'SEC_EDGAR',
              cik: item.cik
          }));
      } catch (e: any) {
          addLog(`SEC Fetch Error: ${e.message}`, "warn");
          return [];
      }
  };

  // --- SOURCE D: MSN MONEY (Validation Ping) ---
  const validateMSNConnection = async (samples: string[]) => {
      addLog("Source D: MSN Money / Bing Finance (Pipeline Validation)...", "info");
      let successCount = 0;
      for (const sym of samples.slice(0, 3)) { // Check first 3 to save time
          try {
              const res = await fetch(`/api/msn?symbol=${sym}&type=overview`);
              if (res.ok) successCount++;
          } catch(e) {}
      }
      
      if (successCount > 0) {
          addLog(`MSN Money: Connection Verified. Deep Mining Ready.`, "ok");
          return true;
      } else {
          addLog(`MSN Money: Connection Failed. Will retry in Stage 3.`, "warn");
          return false;
      }
  };

  const fuseDatasets = (tv: MasterTicker[], sec: MasterTicker[]): MasterTicker[] => {
      const map = new Map<string, MasterTicker>();
      
      // Index SEC Data for O(1) Lookup
      const secMap = new Map<string, number>();
      sec.forEach(s => secMap.set(s.symbol.toUpperCase(), s.cik || 0));

      // Fuse: TV Data + SEC CIK
      let matchedCount = 0;
      tv.forEach(item => {
          const cik = secMap.get(item.symbol.toUpperCase());
          if (cik) {
              item.cik = cik;
              item.source = "TV+SEC";
              matchedCount++;
          }
          map.set(item.symbol, item);
      });

      addLog(`Fusion Result: ${tv.length} Assets. ${matchedCount} SEC Verified.`, "ok");
      return Array.from(map.values());
  };

  const runQuadFusionPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    // Fake progress for visual feedback
    const discoveryTimer = setInterval(() => {
        setStats(prev => ({ 
            ...prev, 
            found: prev.found + Math.floor(Math.random() * 500) 
        }));
    }, 200);

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
        const [tvData, secData] = await Promise.allSettled([
            executeTVScanner(),
            executeSECRegistry()
        ]);

        clearInterval(discoveryTimer); 

        const tv = tvData.status === 'fulfilled' ? tvData.value : [];
        const sec = secData.status === 'fulfilled' ? secData.value : [];

        if (tv.length === 0) {
            throw new Error("Critical Failure: TradingView Scanner returned 0 assets.");
        }

        if (tvData.status === 'rejected') addLog(`TV Scanner Failed: ${tvData.reason}`, "err");
        if (secData.status === 'rejected') addLog(`SEC Registry Failed: ${secData.reason}`, "warn");

        // FUSE
        setStats(prev => ({ ...prev, phase: 'Fusion' }));
        addLog("Executing Quad-Core Fusion (TV + SEC + MSN Link)...", "info");
        
        let masterList = fuseDatasets(tv, sec);

        // MSN VALIDATION
        const sampleSymbols = masterList.slice(0, 5).map(s => s.symbol);
        await validateMSNConnection(sampleSymbols);

        // Filter valid
        const minPrice = 0.01;
        let viableCandidates = masterList.filter(t => t.price >= minPrice);
        viableCandidates.sort((a, b) => b.volume - a.volume);
        
        const newRegistry = new Map<string, MasterTicker>();
        viableCandidates.forEach(t => newRegistry.set(t.symbol, t));
        setRegistry(newRegistry); 
        
        setStats(prev => ({ ...prev, found: viableCandidates.length, provider: "Quad_Fusion" }));
        addLog(`Final Universe: ${viableCandidates.length} assets ready for Stage 1.`, "ok");

        // COMMIT
        setStats(prev => ({ ...prev, phase: 'Commit' }));
        
        // [KST TIMESTAMP LOGIC]
        const now = new Date();
        const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const timestamp = kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
        
        const fileName = `STAGE0_MASTER_UNIVERSE_${timestamp}.json`;
        const payload = { 
            manifest: { 
                version: "6.0.0", 
                provider: "Quad_Fusion (TV+SEC+MSN)", 
                date: now.toISOString(), 
                count: viableCandidates.length,
                note: "Full Market Scan + CIK + Rich Data"
            }, 
            universe: viableCandidates 
        };

        const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
        if (folderId) {
            await uploadFile(token, folderId, fileName, payload);
            setStats(prev => ({ ...prev, synced: viableCandidates.length, phase: 'Finalized' }));
            addLog(`System: Cloud Vault Sync Complete.`, "ok");
            if (onComplete) onComplete(); 
        }

    } catch (e: any) {
      clearInterval(discoveryTimer);
      if (e.message.includes("Auth Expired") || e.message.includes("401") || e.message.includes("403")) {
          sessionStorage.removeItem('gdrive_access_token');
          setAccessToken(null);
          onAuthSuccess?.(false);
          addLog("Session Expired. Please re-connect Vault.", "warn");
      } else {
          addLog(`Fatal Error: ${e.message}`, "err");
      }
      setStats(prev => ({ ...prev, phase: 'Idle' }));
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsEngineRunning(false);
      document.body.removeAttribute('data-engine-running');
    }
  };

  const ensureFolder = async (token: string, name: string) => {
    let rootId = GOOGLE_DRIVE_TARGET.rootFolderId; 
    const q = encodeURIComponent(`name = '${name}' and '${rootId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.status === 401 || res.status === 403) {
         throw new Error("GDrive Auth Expired. Please refresh page/re-login.");
    }

    if (res.ok) {
        const data = await res.json();
        if (data.files?.length > 0) return data.files[0].id;
    }

    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
    });
    
    if (!create.ok) {
        throw new Error(`Folder Creation Failed: ${create.status}`);
    }

    const createData = await create.json();
    return createData.id;
  };

  const uploadFile = async (token: string, folderId: string, name: string, content: any) => {
    const meta = { name, parents: [folderId], mimeType: 'application/json' };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form
    });
    
    if (!res.ok) {
        throw new Error(`Upload Failed: ${res.status}`);
    }

    return res.json();
  };

  const searchResult = useMemo(() => {
    if (!searchTerm) return null;
    return registry.get(searchTerm.toUpperCase());
  }, [searchTerm, registry]);

  const handleSetTarget = () => {
      if (searchResult && onStockSelected) {
          onStockSelected(searchResult);
          addLog(`Target Set: ${searchResult.symbol}. Auditing Matrix Triggered.`, "ok");
      }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
       {showConfig && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
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
            <button 
              onClick={() => {
                localStorage.setItem('gdrive_client_id', clientId);
                setShowConfig(false);
                addLog("Infrastructure Persisted Successfully.", "ok");
              }}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all"
            >
              Apply Changes
            </button>
          </div>
        </div>
      )}

      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isEngineRunning ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isEngineRunning ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v6.0.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Quad-Core Fusion (TV+SEC+MSN)'}
                  </span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning || cooldown > 0 || isAuthLoading}
              className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isEngineRunning || cooldown > 0 || isAuthLoading
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none scale-95 border border-white/5 shadow-inner opacity-75' 
                    : !accessToken 
                        ? 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20' // Login State
                        : 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' // Execute State
              }`}
            >
              {isEngineRunning 
                ? 'Fusing Universe...' 
                : cooldown > 0 
                    ? `Wait ${cooldown}s` 
                    : isAuthLoading
                        ? 'Connecting...'
                        : !accessToken 
                            ? 'Connect Cloud Vault' 
                            : 'Execute Quad Fusion'}
            </button>
          </div>
          
           <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
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
                  <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                    {searchResult ? (
                      <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                        <span className="truncate">{searchResult.name || searchResult.symbol}</span>
                        <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price?.toFixed(2) || '0.00'}</span>
                            <button 
                                onClick={handleSetTarget}
                                className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg active:scale-95 active:bg-rose-700 active:shadow-inner"
                            >
                                Set Audit Target
                            </button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black italic uppercase tracking-widest">Awaiting Master Map...</span>
                    )}
                  </div>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Active Provider', val: stats.provider, color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-lg md:text-xl font-mono font-black italic ${s.color} truncate`}>{s.val}</p>
              </div>
            ))}
          </div>
          
           <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
              className={`h-full rounded-xl transition-all duration-700 ${cooldown > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`}
              style={{ width: stats.phase === 'Finalized' ? '100%' : cooldown > 0 ? `${(cooldown/60)*100}%` : `${Math.min(100, (stats.found / (stats.target || 1)) * 100)}%` }}
            ></div>
          </div>
        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Synthesis_Terminal</h3>
          </div>
          <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
            {logs.map((l, i) => (
              <div key={i} className={`pl-4 border-l-2 ${l.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : l.includes('[ERR]') ? 'border-red-500 text-red-400' : l.includes('[WARN]') ? 'border-amber-500 text-amber-400' : l.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                {l}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UniverseGathering;
