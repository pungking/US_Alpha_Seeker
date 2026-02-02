
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
  pe?: number;
  eps?: number;
  roe?: number;
  debtToEquity?: number;
  pb?: number;
  source?: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => 
    localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com'
  );
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  
  // API Keys
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const twelveDataKey = API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key;

  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 20000,
    elapsed: 0,
    provider: 'Idle',
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Enrichment' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v3.1.0: OpenBB-Style Hybrid Fusion Mode.']);
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

  // AUTO START LOGIC
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
    
    if (!clientId) {
      addLog("Missing Client ID. Open ⚙ Config.", "err");
      setShowConfig(true);
      return;
    }

    if (!accessToken) {
      document.body.setAttribute('data-engine-running', 'true'); 
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive',
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
        setShowConfig(true);
        document.body.removeAttribute('data-engine-running');
      }
      return;
    }

    document.body.setAttribute('data-engine-running', 'true');
    runAggregatedPipeline(accessToken);
  };

  // [STRATEGY 1] Nasdaq Official Strategy (Primary for Metadata)
  // Fetches from our local proxy which scrapes api.nasdaq.com
  const executeNasdaqStrategy = async (): Promise<MasterTicker[]> => {
      addLog("Strategy D: Nasdaq Official Exchange Feed (Primary Metadata)...", "info");
      
      const res = await fetch('/api/nasdaq');
      if (!res.ok) {
          throw new Error(`Nasdaq Proxy Failed: ${res.status}`);
      }
      
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid Nasdaq Data Structure");
      
      addLog(`Nasdaq Feed: Retrieved ${data.length} Authoritative Listings.`, "ok");
      
      return data.map((item: any) => ({
          symbol: item.symbol,
          name: item.name,
          price: item.price,
          volume: item.volume,
          change: item.pctChange,
          marketCap: item.marketCap,
          sector: item.sector || "Unclassified",
          industry: item.industry || "Unknown",
          type: 'Common Stock',
          updated: new Date().toISOString().split('T')[0],
          source: 'Nasdaq_Official'
      }));
  };

  // [STRATEGY 2] Polygon Aggregates (Primary for Coverage/Price)
  const executePolygonStrategy = async (): Promise<MasterTicker[]> => {
    if (!polygonKey) throw new Error("Polygon Key missing");
    addLog("Strategy B: Polygon Deep Discovery (Coverage Max)...", "info");
    
    // Polygon Grouped Daily (Massive Coverage ~20k items)
    let targetDate = getInitialTargetDate();
    let polyResults: any[] = [];
    let daysChecked = 0;
    
    // Try up to 5 days back to find a trading day
    while (daysChecked < 5) {
        try {
            const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
            
            if (polyRes.status === 429) { 
                addLog("Polygon Rate Limit. Pausing 20s...", "warn");
                await new Promise(r => setTimeout(r, 20000)); 
                continue; 
            }
            
            if (polyRes.ok) {
                const data = await polyRes.json();
                if (data.results && data.results.length > 0) { 
                    polyResults = data.results; 
                    addLog(`Polygon: Found ${polyResults.length} tickers on ${targetDate}.`, "ok");
                    break; 
                } 
            }
        } catch (e) { console.warn("Poly date fail", e); }
        
        // Go back 1 day
        const d = new Date(targetDate); d.setDate(d.getDate() - 1);
        if (d.getDay() === 0) d.setDate(d.getDate() - 2); else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
        targetDate = d.toISOString().split('T')[0];
        daysChecked++;
        await new Promise(r => setTimeout(r, 500));
    }

    if (polyResults.length === 0) throw new Error("Polygon returned 0 results.");

    return polyResults.map((p: any) => ({
        symbol: p.T,
        name: p.T, // Placeholder, enriched later by Nasdaq
        type: 'Common Stock',
        price: p.c,
        volume: p.v,
        change: p.o ? ((p.c - p.o) / p.o) * 100 : 0,
        updated: targetDate,
        source: 'Polygon_Aggs'
    }));
  };

  const executeFmpStrategy = async (): Promise<MasterTicker[]> => {
    if (!fmpKey) throw new Error("FMP Key missing");
    addLog("Strategy A: FMP Deep Screener...", "info");
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=10000000&volumeMoreThan=5000&isEtf=false&isActivelyTrading=true&exchange=NASDAQ,NYSE,AMEX&limit=25000&apikey=${fmpKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status === 403 ? "FMP_PLAN_LIMIT" : "FMP_ERROR");
    const data = await res.json();
    return data.map((item: any) => ({
        symbol: item.symbol, name: item.companyName, price: item.price, volume: item.volume, 
        change: item.changesPercentage || 0, marketCap: item.marketCap, sector: item.sector, industry: item.industry,
        type: 'Common Stock', updated: new Date().toISOString().split('T')[0], source: 'FMP_Screener'
    }));
  };

  // [NEW] Hybrid Fusion Logic
  // Merges High-Quality Metadata (Nasdaq) with High-Volume Coverage (Polygon)
  const fuseDatasets = (primary: MasterTicker[], secondary: MasterTicker[]): MasterTicker[] => {
      const mergedMap = new Map<string, MasterTicker>();
      
      // 1. Load Secondary (High Volume, Low Metadata - Polygon) first
      secondary.forEach(item => {
          mergedMap.set(item.symbol, item);
      });

      let enrichedCount = 0;
      let newCount = 0;

      // 2. Overlay Primary (High Metadata - Nasdaq)
      primary.forEach(item => {
          if (mergedMap.has(item.symbol)) {
              // Enrich existing Polygon entry with Nasdaq Sector/Industry/Name
              const existing = mergedMap.get(item.symbol)!;
              mergedMap.set(item.symbol, {
                  ...existing, // Keep Price/Vol from Polygon (usually fresher)
                  name: item.name || existing.name,
                  sector: item.sector || existing.sector,
                  industry: item.industry || existing.industry,
                  marketCap: item.marketCap || existing.marketCap,
                  source: `Poly+Nasdaq`
              });
              enrichedCount++;
          } else {
              // Add unique Nasdaq entry (if Polygon missed it)
              mergedMap.set(item.symbol, item);
              newCount++;
          }
      });

      addLog(`Fusion Stats: ${enrichedCount} Enriched, ${newCount} Added Unique from Nasdaq.`, "info");
      return Array.from(mergedMap.values());
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
        // --- PHASE 1: MULTI-SOURCE ACQUISITION ---
        const sources: { nasdaq?: MasterTicker[], polygon?: MasterTicker[], fmp?: MasterTicker[] } = {};
        
        // 1. Nasdaq (Primary for Metadata)
        try {
            sources.nasdaq = await executeNasdaqStrategy();
        } catch (e: any) { 
            addLog(`Nasdaq Source Failed: ${e.message}`, "warn"); 
        }

        // 2. Polygon (Primary for Coverage)
        try {
            sources.polygon = await executePolygonStrategy();
        } catch (e: any) { 
            addLog(`Polygon Source Failed: ${e.message}`, "warn"); 
        }

        // 3. FMP (Backup)
        if (!sources.nasdaq && !sources.polygon) {
            try { 
                sources.fmp = await executeFmpStrategy(); 
            } catch (e: any) { 
                addLog(`FMP Failed: ${e.message}`, "err"); 
            }
        }

        if (!sources.nasdaq && !sources.polygon && !sources.fmp) {
            throw new Error("All Data Sources Exhausted.");
        }

        // --- PHASE 2: HYBRID FUSION ---
        addLog("Phase 2: Executing Hybrid Data Fusion...", "info");
        let masterList: MasterTicker[] = [];

        if (sources.polygon && sources.nasdaq) {
            // Best Case: Merge both
            masterList = fuseDatasets(sources.nasdaq, sources.polygon);
        } else if (sources.polygon) {
            // Fallback: Only Polygon
            masterList = sources.polygon;
            addLog("Using Polygon Raw Data (Sector Data might be limited).", "warn");
        } else if (sources.nasdaq) {
            // Fallback: Only Nasdaq
            masterList = sources.nasdaq;
        } else if (sources.fmp) {
            // Fallback: FMP
            masterList = sources.fmp;
        }

        const rawCount = masterList.length;
        addLog(`Total Raw Universe: ${rawCount} Assets.`, "ok");

        // --- PHASE 3: MINIMAL FILTERING (To reach ~20k target) ---
        // Relaxed filter to $0.01 to ensure we don't accidentally cut valid penny stocks
        const minPrice = 0.01; 
        addLog(`Filtering for Viability (Price > $${minPrice})...`, "info");
        
        let viableCandidates = masterList.filter(t => t.price >= minPrice && t.volume > 0);
        
        // Sort by Volume to ensure most relevant are top
        viableCandidates.sort((a, b) => b.volume - a.volume);
        
        addLog(`Viable Universe: ${viableCandidates.length} assets ready.`, "ok");
        setStats(prev => ({ ...prev, found: viableCandidates.length, provider: "Hybrid Fusion" }));

        // --- PHASE 4: COMMIT ---
        setStats(prev => ({ ...prev, phase: 'Commit' }));
        const fileName = `STAGE0_MASTER_UNIVERSE_v3.1.0.json`;
        const payload = { 
            manifest: { 
                version: "3.1.0", 
                provider: "Hybrid_Fusion (Nasdaq+Poly)", 
                date: new Date().toISOString(), 
                count: viableCandidates.length,
                note: "Fused Data: Nasdaq Metadata + Polygon Coverage"
            }, 
            universe: viableCandidates 
        };

        const folderId = await ensureFolder(token);
        if (folderId) {
            await uploadFile(token, folderId, fileName, payload);
            setStats(prev => ({ ...prev, synced: viableCandidates.length, phase: 'Finalized' }));
            addLog(`System: Cloud Vault Sync Complete.`, "ok");
            
            if (onComplete) onComplete(); 
        } else {
            throw new Error("Folder ID resolution failed. Upload aborted.");
        }

    } catch (e: any) {
      addLog(`Fatal Error: ${e.message}`, "err");
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
        const resRoot = await fetch(`https://www.googleapis.com/drive/v3/files?q=${qRoot}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (resRoot.ok) {
            const data = await resRoot.json();
            if (data.files && data.files.length > 0) {
                rootId = data.files[0].id;
            } else {
                const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: rootName, parents: ['root'], mimeType: 'application/vnd.google-apps.folder' })
                });
                if (createRes.ok) {
                    const createData = await createRes.json();
                    rootId = createData.id;
                }
            }
        }
    } catch (e) { console.warn("Root folder resolution error", e); }

    if (!rootId) {
        addLog("Critical: Root folder ID invalid.", "err");
        return null;
    }

    const q = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${rootId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (res.ok) {
        const data = await res.json();
        if (data.files?.length > 0) return data.files[0].id;
    }

    const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: GOOGLE_DRIVE_TARGET.targetSubFolder, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
    });
    
    if (!create.ok) {
        const errMsg = await create.text();
        throw new Error(`Subfolder creation failed: ${errMsg}`);
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
        const errorText = await res.text();
        throw new Error(`Drive Upload Failed (${res.status}): ${errorText}`);
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
              <p className="text-[9px] text-slate-600 font-medium">Project ID: 741017429020</p>
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v3.1.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Hybrid Fusion Ready'}
                  </span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={startEngine} 
              disabled={isEngineRunning || cooldown > 0}
              className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isEngineRunning || cooldown > 0 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : !accessToken 
                        ? 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20' // Login State
                        : 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' // Execute State
              }`}
            >
              {isEngineRunning 
                ? 'Fusing Data Sources...' 
                : cooldown > 0 
                    ? `Wait ${cooldown}s` 
                    : !accessToken 
                        ? 'Connect Cloud Vault' 
                        : 'Execute Hybrid Fusion'}
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
                  <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                    {searchResult ? (
                      <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                        <span className="truncate">{searchResult.name || searchResult.symbol}</span>
                        <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price?.toFixed(2) || '0.00'}</span>
                            <span className="text-[8px] text-slate-500">{searchResult.source}</span>
                            <button 
                                onClick={handleSetTarget}
                                className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg"
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
              style={{ width: stats.phase === 'Finalized' ? '100%' : cooldown > 0 ? `${(cooldown/60)*100}%` : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
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
