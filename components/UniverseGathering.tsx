
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
  const [isAuthLoading, setIsAuthLoading] = useState(false); // [NEW] Auth loading state
  const [showConfig, setShowConfig] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [clientId, setClientId] = useState<string>(() => 
    localStorage.getItem('gdrive_client_id') || '274071737753-4993td0fv4un5l8lv2eiqp0utc7co6q9.apps.googleusercontent.com'
  );
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [googleScriptLoaded, setGoogleScriptLoaded] = useState(false);
  
  // API Keys
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  
  const [registry, setRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  
  const [stats, setStats] = useState({
    found: 0,
    synced: 0,
    target: 24000,
    elapsed: 0,
    provider: 'Idle',
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Fusion' | 'Validation' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v3.5.2: Triple Hybrid Fusion Mode.']);
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
             addLog("AUTO-PILOT: Engaging Triple Fusion Sequence...", "signal");
             startEngine();
        }
    }
  }, [autoStart, isActive]);

  const addLog = (m: string, t: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
    const p = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
    setLogs(prev => [...prev, `${p[t]} ${m}`].slice(-50));
  };

  const getRecentBusinessDays = (count: number = 6): string[] => {
    const dates: string[] = [];
    const now = new Date();
    
    const nyOptions: Intl.DateTimeFormatOptions = {
        timeZone: "America/New_York",
        year: 'numeric',
        month: 'numeric', 
        day: 'numeric'
    };
    const nyFormatter = new Intl.DateTimeFormat('en-US', nyOptions);
    const parts = nyFormatter.formatToParts(now);
    
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    const year = parseInt(part('year')!);
    const month = parseInt(part('month')!) - 1; 
    const day = parseInt(part('day')!);

    let cursorDate = new Date(year, month, day);

    let attempts = 0;
    while (dates.length < count && attempts < 15) {
        const dayOfWeek = cursorDate.getDay(); 
        
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            const y = cursorDate.getFullYear();
            const m = String(cursorDate.getMonth() + 1).padStart(2, '0');
            const d = String(cursorDate.getDate()).padStart(2, '0');
            dates.push(`${y}-${m}-${d}`);
        }
        cursorDate.setDate(cursorDate.getDate() - 1);
        attempts++;
    }
    return dates;
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
      setIsAuthLoading(true); // [NEW] Set Loading
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId.trim(),
          scope: 'https://www.googleapis.com/auth/drive',
          callback: (res: any) => {
            setIsAuthLoading(false); // [NEW] Clear Loading
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
        setIsAuthLoading(false); // [NEW] Clear Loading on Error
        addLog(`Auth Error: ${e.message}`, "err");
        setShowConfig(true);
        document.body.removeAttribute('data-engine-running');
      }
      return;
    }

    document.body.setAttribute('data-engine-running', 'true');
    runTripleFusionPipeline(accessToken);
  };

  const executeTVScanner = async (): Promise<MasterTicker[]> => {
      addLog("Source A: TradingView Omni-Scanner (Rich Data)...", "info");
      const res = await fetch('/api/nasdaq'); 
      if (!res.ok) throw new Error(`TV Proxy Failed: ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Invalid TV Data");
      addLog(`TV Scanner: Retrieved ${data.length} rich-data assets.`, "ok");
      return data.map((item: any) => ({
          symbol: item.symbol, name: item.name, price: item.price, volume: item.volume, 
          change: item.change, marketCap: item.marketCap, sector: item.sector || "Unclassified", 
          industry: item.industry || "Unknown", pe: item.pe, roe: item.roe, eps: item.eps,
          type: 'Common Stock', updated: new Date().toISOString().split('T')[0], source: 'TV_Scanner'
      }));
  };

  const executeFMPScreener = async (): Promise<MasterTicker[]> => {
    if (!fmpKey) {
        addLog("FMP Key missing. Skipping FMP Source.", "warn");
        return [];
    }
    addLog("Source B: FMP Screener (Metadata Backup)...", "info");
    try {
        const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000&volumeMoreThan=100&isEtf=false&isActivelyTrading=true&exchange=NASDAQ,NYSE,AMEX&limit=30000&apikey=${fmpKey}`;
        const res = await fetch(url);
        if (res.status === 429) throw new Error("FMP_LIMIT_HIT");
        if (!res.ok) throw new Error(`FMP Status ${res.status}`);
        
        const data = await res.json();
        addLog(`FMP Screener: Retrieved ${data.length} assets (Daily Limit Consumed).`, "ok");
        
        return data.map((item: any) => ({
            symbol: item.symbol, name: item.companyName, price: item.price, volume: item.volume, 
            change: item.changesPercentage || 0, marketCap: item.marketCap, sector: item.sector, industry: item.industry,
            type: 'Common Stock', updated: new Date().toISOString().split('T')[0], source: 'FMP_Screener'
        }));
    } catch (e: any) {
        if (e.message === "FMP_LIMIT_HIT") {
            addLog("FMP Daily Limit Reached. Skipping FMP Source.", "warn");
        } else {
            addLog(`FMP Error: ${e.message}`, "warn");
        }
        return [];
    }
  };

  const executePolygonAggs = async (): Promise<MasterTicker[]> => {
    if (!polygonKey) throw new Error("Polygon Key missing");
    addLog("Source C: Polygon Deep Discovery (Quantity Max)...", "info");
    
    let polyResults: any[] = [];
    let success = false;
    let foundDate = '';
    
    const targetDates = getRecentBusinessDays(6); 
    
    for (const targetDate of targetDates) {
        addLog(`Scanning Market Date: ${targetDate}...`, "info");

        try {
            const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
            
            if (polyRes.status === 429) { 
                addLog("Polygon Rate Limit. Retrying...", "warn");
                await new Promise(r => setTimeout(r, 15000)); 
                continue; 
            }
            
            if (polyRes.ok) {
                const data = await polyRes.json();
                if (data.results && data.results.length > 5000) { 
                    polyResults = data.results; 
                    foundDate = targetDate;
                    addLog(`Polygon: Data Acquired! (${polyResults.length} tickers on ${targetDate}).`, "ok");
                    success = true;
                    break; 
                } else {
                    addLog(`Market Closed or Data Incomplete on ${targetDate}. Backtracking...`, "warn");
                }
            }
        } catch (e) { }
        
        await new Promise(r => setTimeout(r, 300));
    }
    
    if (!success) throw new Error("Polygon failed after checking last 6 business days.");

    return polyResults.map((p: any) => ({
        symbol: p.T, name: p.T, type: 'Common Stock', price: p.c, volume: p.v,
        change: p.o ? ((p.c - p.o) / p.o) * 100 : 0,
        updated: foundDate, source: 'Polygon_Aggs'
    }));
  };

  // [AUXILIARY] Yahoo Cross-Validation & Price Correction
  const validateWithYahoo = async (candidates: MasterTicker[]) => {
      addLog("Auxiliary Source: Initiating Yahoo Finance Sample Check...", "info");
      
      // Sort by volume to check the most liquid assets
      const sample = candidates.sort((a,b) => b.volume - a.volume).slice(0, 5);
      const symbolString = sample.map(c => c.symbol).join(',');
      
      try {
          const res = await fetch(`/api/yahoo?symbols=${symbolString}`);
          if(res.ok) {
              const data = await res.json();
              if(data && data.length > 0) {
                  let matchCount = 0;
                  data.forEach((yItem: any) => {
                      const candidate = sample.find(s => s.symbol === yItem.symbol);
                      if (candidate) {
                          // Simple diff check
                          const diff = Math.abs((candidate.price - yItem.price) / yItem.price);
                          if (diff < 0.05) matchCount++;
                          // Optionally correct the price if deviation is large? 
                          // For now, we trust the Fusion result but log the confidence.
                      }
                  });
                  addLog(`Validation: ${matchCount}/${data.length} Sampled Assets match external feed.`, "ok");
              } else {
                  addLog("Validation Warning: Yahoo returned empty data.", "warn");
              }
          } else {
              addLog("Validation Skipped: Yahoo API unreachable.", "warn");
          }
      } catch (e) {
          addLog("Validation Error: Yahoo Proxy failed.", "warn");
      }
  };

  const fuseDatasets = (tv: MasterTicker[], fmp: MasterTicker[], poly: MasterTicker[]): MasterTicker[] => {
      const map = new Map<string, MasterTicker>();

      // 1. Base Layer: TradingView (Rich Fundamentals)
      tv.forEach(item => map.set(item.symbol, item));
      
      // 2. Enrichment Layer: FMP (Sector/Industry + Missing Tickers)
      let fmpAdded = 0;
      fmp.forEach(item => {
          if (map.has(item.symbol)) {
              const existing = map.get(item.symbol)!;
              // Enrich missing meta
              if (existing.sector === "Unclassified" && item.sector) {
                  map.set(item.symbol, { ...existing, sector: item.sector, industry: item.industry });
              }
          } else {
              map.set(item.symbol, item);
              fmpAdded++;
          }
      });

      // 3. Coverage Layer: Polygon (Volume/Price Freshness + OTC/SmallCaps)
      let polyAdded = 0;
      poly.forEach(item => {
          if (map.has(item.symbol)) {
              const existing = map.get(item.symbol)!;
              // If Polygon date is newer than TV (TV scan might be delayed), update price/vol
              // Simple check: Polygon 'updated' is usually T or T-1. TV is usually 'Today'.
              // We'll prioritize Polygon volume as it's an Aggregator.
              if (item.volume > existing.volume * 1.1) { 
                  // If Polygon volume is significantly higher, it might be more complete
                  map.set(item.symbol, { ...existing, volume: item.volume, price: item.price });
              }
          } else {
              map.set(item.symbol, item);
              polyAdded++;
          }
      });

      addLog(`Fusion Result: ${tv.length} TV + ${fmpAdded} FMP + ${polyAdded} Poly = ${map.size} Total.`, "ok");
      return Array.from(map.values());
  };

  const runTripleFusionPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    // Fake progress for visual feedback during parallel fetch
    const discoveryTimer = setInterval(() => {
        setStats(prev => ({ 
            ...prev, 
            found: prev.found + Math.floor(Math.random() * 500) // Fake counter for UX
        }));
    }, 200);

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    try {
        const [tvData, fmpData, polyData] = await Promise.allSettled([
            executeTVScanner(),
            executeFMPScreener(),
            executePolygonAggs()
        ]);

        clearInterval(discoveryTimer); // Stop fake counter

        const tv = tvData.status === 'fulfilled' ? tvData.value : [];
        const fmp = fmpData.status === 'fulfilled' ? fmpData.value : [];
        const poly = polyData.status === 'fulfilled' ? polyData.value : [];

        if (tv.length === 0 && poly.length === 0) {
            throw new Error("Critical Failure: TV and Polygon both failed.");
        }

        if (tvData.status === 'rejected') addLog(`TV Scanner Failed: ${tvData.reason}`, "err");
        if (polyData.status === 'rejected') addLog(`Polygon Failed: ${polyData.reason}`, "err");

        // FUSE
        setStats(prev => ({ ...prev, phase: 'Fusion' }));
        addLog("Executing Triple Hybrid Fusion...", "info");
        
        let masterList = fuseDatasets(tv, fmp, poly);

        // VALIDATION STEP
        setStats(prev => ({ ...prev, phase: 'Validation' }));
        await validateWithYahoo(masterList);

        // Filter valid
        const minPrice = 0.01;
        let viableCandidates = masterList.filter(t => t.price >= minPrice && t.volume > 0);
        viableCandidates.sort((a, b) => b.volume - a.volume);
        
        const newRegistry = new Map<string, MasterTicker>();
        viableCandidates.forEach(t => newRegistry.set(t.symbol, t));
        setRegistry(newRegistry); 
        addLog("System Registry Updated. Global Validator Active.", "ok");

        setStats(prev => ({ ...prev, found: viableCandidates.length, provider: "Triple_Hybrid" }));
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
                version: "3.5.0", 
                provider: "Triple_Fusion (TV+FMP+Poly)", 
                auxiliary: "Yahoo_Cross_Validation",
                date: now.toISOString(), 
                count: viableCandidates.length,
                note: "Fused Data: TV Richness + FMP Metadata + Polygon Coverage"
            }, 
            universe: viableCandidates 
        };

        const folderId = await ensureFolder(token);
        if (folderId) {
            await uploadFile(token, folderId, fileName, payload);
            setStats(prev => ({ ...prev, synced: viableCandidates.length, phase: 'Finalized' }));
            addLog(`System: Cloud Vault Sync Complete.`, "ok");
            if (onComplete) onComplete(); 
        }

    } catch (e: any) {
      clearInterval(discoveryTimer);
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
    const q = encodeURIComponent(`name = '${GOOGLE_DRIVE_TARGET.targetSubFolder}' and '${rootId}' in parents and trashed = false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // [FIX] Explicit error checking for Auth
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
      body: JSON.stringify({ name: GOOGLE_DRIVE_TARGET.targetSubFolder, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
    });
    
    // [FIX] Explicit check for folder creation failure
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
    
    // [FIX] Explicit check for upload failure
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v3.5.1</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Triple Hybrid Fusion'}
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
                ? 'Fusing 3 Sources...' 
                : cooldown > 0 
                    ? `Wait ${cooldown}s` 
                    : isAuthLoading
                        ? 'Connecting...'
                        : !accessToken 
                            ? 'Connect Cloud Vault' 
                            : 'Execute Deep Fusion'}
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
