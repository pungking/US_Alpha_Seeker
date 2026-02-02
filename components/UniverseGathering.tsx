
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
    target: 10000,
    elapsed: 0,
    provider: 'Idle',
    phase: 'Idle' as 'Idle' | 'Discovery' | 'Enrichment' | 'Mapping' | 'Commit' | 'Finalized' | 'Cooldown'
  });

  const [logs, setLogs] = useState<string[]>(['> Engine v2.9.0: Polygon Bulk Matrix Loaded.']);
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

  // [NEW] Helper to map SIC codes (from Polygon) to Sectors
  const mapSicToSector = (sicDescription: string): string => {
      if (!sicDescription) return "Unclassified";
      const desc = sicDescription.toLowerCase();
      if (desc.includes("pharm") || desc.includes("bio") || desc.includes("medic") || desc.includes("health")) return "Healthcare";
      if (desc.includes("tech") || desc.includes("computer") || desc.includes("soft") || desc.includes("semi")) return "Technology";
      if (desc.includes("bank") || desc.includes("finan") || desc.includes("invest") || desc.includes("insur")) return "Financial";
      if (desc.includes("oil") || desc.includes("gas") || desc.includes("energy") || desc.includes("mining")) return "Energy";
      if (desc.includes("retail") || desc.includes("store") || desc.includes("apparel") || desc.includes("food")) return "Consumer Defensive";
      if (desc.includes("real estate") || desc.includes("reit")) return "Real Estate";
      if (desc.includes("util") || desc.includes("electric") || desc.includes("power")) return "Utilities";
      if (desc.includes("transport") || desc.includes("airline") || desc.includes("rail") || desc.includes("manufactur")) return "Industrials";
      return "Industrials"; // Default fallback
  };

  // [NEW] Layer 1: Polygon Bulk Reference (Highly Efficient)
  // Fetches 1000 tickers per call. Covers 5000 tickers in 5 calls.
  const enrichWithPolygonMaster = async (tickers: MasterTicker[]): Promise<MasterTicker[]> => {
      if (!polygonKey) {
          addLog("Polygon Key missing. Skipping Bulk Enrichment.", "warn");
          return tickers;
      }

      addLog(`Layer 1: Polygon Bulk Matrix (1000 items/call)...`, "info");
      
      const enrichedMap = new Map<string, any>();
      // Limit to stocks to avoid getting forex/crypto junk
      let nextUrl = `https://api.polygon.io/v3/reference/tickers?active=true&market=stocks&limit=1000&apiKey=${polygonKey}`;
      let pages = 0;
      const MAX_PAGES = 15; // Scan up to 15,000 top stocks

      try {
          while (nextUrl && pages < MAX_PAGES) {
              const res = await fetch(nextUrl);
              if (!res.ok) {
                  if (res.status === 429) {
                      addLog("Polygon Rate Limit. Pausing 60s for refill...", "warn");
                      await new Promise(r => setTimeout(r, 61000));
                      continue; 
                  }
                  break;
              }
              
              const data = await res.json();
              if (data.results) {
                  data.results.forEach((item: any) => {
                      enrichedMap.set(item.ticker, item);
                  });
              }
              
              nextUrl = data.next_url ? `${data.next_url}&apiKey=${polygonKey}` : '';
              pages++;
              addLog(`Polygon Matrix: Scanned Page ${pages} (${enrichedMap.size} items mapped)`, "info");
              
              // Respect free tier limits (5 calls/min). Sleep 12s between calls ensures < 5 calls/min
              await new Promise(r => setTimeout(r, 12000)); 
          }
      } catch (e: any) {
          addLog(`Polygon Matrix Interrupted: ${e.message}`, "warn");
      }

      let updatedCount = 0;
      const enriched = tickers.map(t => {
          const polyData = enrichedMap.get(t.symbol);
          if (polyData) {
              updatedCount++;
              return {
                  ...t,
                  name: t.name || polyData.name,
                  marketCap: t.marketCap || polyData.market_cap, // Some tiers return this
                  sector: t.sector || mapSicToSector(polyData.sic_description),
                  industry: t.industry || polyData.sic_description || "Unknown",
                  // Polygon Reference doesn't give PE/ROE, but Sector is critical for Stage 2
              };
          }
          return t;
      });

      addLog(`Layer 1 Complete: ${updatedCount} assets mapped via Polygon.`, "ok");
      return enriched;
  };

  // [Layer 2] Yahoo Fallback (Emergency Low-Speed Mode)
  // Only targets items missing critical data after Layer 1
  const enrichWithYahooFallback = async (tickers: MasterTicker[]): Promise<MasterTicker[]> => {
      // Filter for missing sectors ONLY
      const needsData = tickers.filter(t => !t.sector || t.sector === 'Unclassified');
      
      if (needsData.length === 0) {
          addLog("Layer 2 Skipped: All Sectors Identified.", "ok");
          return tickers;
      }

      addLog(`Layer 2: Yahoo Emergency Scan for ${needsData.length} missing items...`, "info");
      
      const BATCH_SIZE = 5; // Ultra safe batch size
      const chunks = [];
      for (let i = 0; i < needsData.length; i += BATCH_SIZE) {
          chunks.push(needsData.slice(i, i + BATCH_SIZE));
      }

      const enrichedMap = new Map<string, any>();
      let processedCount = 0;
      
      // Cap fallback attempts to avoid infinite loops or bans
      const MAX_FALLBACK_ATTEMPTS = 40; // Only try 200 stocks max as fallback
      const limitChunks = chunks.slice(0, MAX_FALLBACK_ATTEMPTS);

      for (const chunk of limitChunks) {
          try {
              const symbols = chunk.map(t => t.symbol).join(',');
              const res = await fetch(`/api/yahoo?symbols=${symbols}`);
              
              if (res.ok) {
                  const data = await res.json();
                  if (Array.isArray(data)) {
                      data.forEach((item: any) => {
                          enrichedMap.set(item.symbol, item);
                      });
                      processedCount += data.length;
                  }
              }
              // Ultra Slow Mode
              await new Promise(r => setTimeout(r, 1500)); 
          } catch (e) {
              console.warn("Yahoo fallback batch failed", e);
          }
      }

      return tickers.map(t => {
          const y = enrichedMap.get(t.symbol);
          if (y) {
              return {
                  ...t,
                  marketCap: y.marketCap || t.marketCap,
                  sector: y.sector || y.category || t.sector,
                  industry: y.industry || t.industry,
                  pe: y.trailingPE || y.forwardPE || t.pe,
                  roe: y.returnOnEquity ? y.returnOnEquity * 100 : t.roe
              };
          }
          return t;
      });
  };

  const executeFmpStrategy = async (): Promise<MasterTicker[]> => {
    if (!fmpKey) throw new Error("FMP Key missing");
    addLog("Strategy A: FMP Deep Screener (Primary)...", "info");
    
    const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=10000000&volumeMoreThan=5000&isEtf=false&isActivelyTrading=true&exchange=NASDAQ,NYSE,AMEX&limit=14000&apikey=${fmpKey}`;
    
    const res = await fetch(url);
    if (!res.ok) {
        if (res.status === 403) throw new Error("FMP_PLAN_LIMIT"); 
        if (res.status === 429) throw new Error("FMP Rate Limit");
        throw new Error(`FMP Status ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid FMP Data Format");
    
    addLog(`FMP: Discovered ${data.length} Equity Assets.`, "ok");
    
    return data.map((item: any) => ({
        symbol: item.symbol, 
        name: item.companyName, 
        price: item.price, 
        volume: item.volume, 
        change: item.changesPercentage || 0, 
        marketCap: item.marketCap, 
        sector: item.sector, 
        industry: item.industry,
        type: 'Common Stock', 
        updated: new Date().toISOString().split('T')[0]
    }));
  };

  const executePolygonStrategy = async (): Promise<MasterTicker[]> => {
    if (!finnhubKey || !polygonKey) throw new Error("Finnhub or Polygon Key missing");
    addLog("Strategy B: Finnhub Discovery + Polygon Pricing (Fallback)...", "info");
    const fhRes = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`);
    if (!fhRes.ok) throw new Error("Finnhub API Error");
    const fhData = await fhRes.json();
    const symbolMap = new Map();
    fhData.forEach((s: any) => {
        const type = s.type || 'Common Stock';
        if (['Common Stock', 'ADR', 'REIT'].includes(type)) {
            symbolMap.set(s.symbol, { name: s.description, type });
        }
    });
    addLog(`Finnhub: Found ${symbolMap.size} symbols. Syncing Polygon market data...`, "info");
    let targetDate = getInitialTargetDate();
    let polyResults: any[] = [];
    let daysChecked = 0;
    while (daysChecked < 5) {
        let retryCount = 0;
        let successOnDay = false;
        while (retryCount < 3) {
            const polyRes = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${targetDate}?adjusted=true&apiKey=${polygonKey}`);
            if (polyRes.status === 429) { await new Promise(r => setTimeout(r, 20000)); retryCount++; continue; }
            if (polyRes.ok) {
                const data = await polyRes.json();
                if (data.results && data.results.length > 0) { polyResults = data.results; successOnDay = true; } 
                break; 
            } else { break; }
        }
        if (successOnDay && polyResults.length > 0) break;
        const d = new Date(targetDate); d.setDate(d.getDate() - 1);
        if (d.getDay() === 0) d.setDate(d.getDate() - 2); else if (d.getDay() === 6) d.setDate(d.getDate() - 1);
        targetDate = d.toISOString().split('T')[0];
        daysChecked++;
        if (daysChecked < 5) await new Promise(r => setTimeout(r, 500));
    }
    const results: MasterTicker[] = [];
    const polyMap = new Map(polyResults.map((p: any) => [p.T, p]));
    symbolMap.forEach((meta, symbol) => {
        const p = polyMap.get(symbol);
        results.push({
            symbol: symbol, name: meta.name, type: meta.type, price: p ? p.c : 0, volume: p ? p.v : 0, change: p && p.o ? ((p.c - p.o) / p.o) * 100 : 0, updated: p ? targetDate : 'N/A'
        });
    });
    return results;
  };

  const executeTwelveDataStrategy = async (): Promise<MasterTicker[]> => {
    if (!twelveDataKey) throw new Error("Twelve Data Key missing");
    addLog("Strategy C: Twelve Data Symbol List (Deep Backup)...", "info");
    const [nasdaq, nyse] = await Promise.all([
        fetch(`https://api.twelvedata.com/stocks?exchange=NASDAQ&country=US&apikey=${twelveDataKey}`),
        fetch(`https://api.twelvedata.com/stocks?exchange=NYSE&country=US&apikey=${twelveDataKey}`)
    ]);
    const d1 = await nasdaq.json(); const d2 = await nyse.json();
    const all = [...(d1.data || []), ...(d2.data || [])];
    if (all.length === 0) throw new Error("Twelve Data returned 0 symbols.");
    return all.map((item: any) => ({
        symbol: item.symbol, name: item.name, price: 0, volume: 0, change: 0, type: item.type || 'Common Stock', updated: new Date().toISOString().split('T')[0]
    }));
  };

  const runAggregatedPipeline = async (token: string) => {
    setIsEngineRunning(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    let masterData: MasterTicker[] = [];
    let usedProvider = "None";

    try {
        // Step 1: Discovery (Fetch Raw List)
        try { 
            masterData = await executeFmpStrategy(); 
            usedProvider = "FMP (Screener)"; 
        } catch (fmpErr: any) {
            addLog(`FMP Primary Failed: ${fmpErr.message}. Switch to Backup...`, "warn");
            try { 
                masterData = await executePolygonStrategy(); 
                usedProvider = "Polygon+Finnhub (Enriched)"; 
            } catch (polyErr: any) {
                 try { 
                     masterData = await executeTwelveDataStrategy(); 
                     usedProvider = "Twelve Data (Enriched)"; 
                 } catch (tdErr: any) { throw new Error("All Market Data Providers Exhausted."); }
            }
        }

        if (masterData.length === 0) throw new Error("Zero Assets Found.");
        
        // [Optimization] Filter out junk first
        const originalCount = masterData.length;
        addLog(`Filtering ${originalCount} raw assets for viability (Price > $0.50)...`, "info");
        
        let viableCandidates = masterData.filter(t => t.price >= 0.5 && t.volume > 0);
        viableCandidates.sort((a, b) => b.volume - a.volume);
        
        addLog(`Viable Universe: ${viableCandidates.length} assets selected for Matrix Mapping.`, "ok");
        setStats(prev => ({ ...prev, found: viableCandidates.length, provider: usedProvider }));

        // [CRITICAL UPDATE] Use Polygon Bulk Reference instead of FMP/Yahoo Batching
        // This is 100x more efficient and works on free plans.
        viableCandidates = await enrichWithPolygonMaster(viableCandidates);

        // Fallback mainly for items that Polygon missed entirely
        viableCandidates = await enrichWithYahooFallback(viableCandidates);

        // Step 3: Mapping & Commit
        setStats(prev => ({ ...prev, phase: 'Mapping' }));
        const registryMap = new Map(viableCandidates.map(i => [i.symbol, i]));
        setRegistry(registryMap);

        addLog(`Phase 3: Committing ${viableCandidates.length} enriched assets to Vault...`, "info");
        setStats(prev => ({ ...prev, phase: 'Commit' }));

        const fileName = `STAGE0_MASTER_UNIVERSE_v2.9.0.json`;
        const payload = { 
            manifest: { 
                version: "2.9.0", 
                provider: usedProvider, 
                date: new Date().toISOString(), 
                count: viableCandidates.length,
                note: "Enriched via Polygon Matrix"
            }, 
            universe: viableCandidates 
        };

        const folderId = await ensureFolder(token);
        if (folderId) {
            await uploadFile(token, folderId, fileName, payload);
            setStats(prev => ({ ...prev, synced: viableCandidates.length, phase: 'Finalized' }));
            addLog(`System: Cloud Vault Sync Complete via ${usedProvider}.`, "ok");
            
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.9.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${cooldown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {cooldown > 0 ? `Rate_Limit_Lock: ${cooldown}s` : 'Multi-Provider_Ready'}
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
                ? 'Acquiring Universe...' 
                : cooldown > 0 
                    ? `Wait ${cooldown}s` 
                    : !accessToken 
                        ? 'Connect Cloud Vault' 
                        : 'Execute Data Fusion'}
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
