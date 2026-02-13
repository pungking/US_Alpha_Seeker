
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiProvider, ApiStatus } from '../types';
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from '../constants';

declare global {
  interface Window {
    google: any;
  }
}

interface Props {
  onAuthSuccess: (status: boolean) => void;
  isActive: boolean;
  apiStatuses: ApiStatus[];
  onStockSelected?: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

interface MasterTicker {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changeAmount: number;
  volume: number;
  marketCap: number;
  sector: string;
  industry: string;
  // Financial Metrics
  pe: number;
  pbr: number;
  psr: number;
  roe: number;
  eps: number;
  beta: number;
  debtToEquity: number;
  // System Fields
  prevClose: number;
  updated: string;
  source: string;
  [key: string]: any;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  // --- ENGINE STATE ---
  const [isGathering, setIsGathering] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Universe_Node v12.5.0: V12 Drive Engine Online.']);
  const [progress, setProgress] = useState({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  const [showConfig, setShowConfig] = useState(false);
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');

  // --- DATA & SEARCH STATE ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MasterTicker | null>(null);
  const [gatheredRegistry, setGatheredRegistry] = useState<Map<string, MasterTicker>>(new Map());
  
  // --- REAL-TIME FEED STATE ---
  const [isLive, setIsLive] = useState(false);
  const [liveSource, setLiveSource] = useState<string>('');
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  
  // --- REFS ---
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const cleanupRef = useRef<() => void>(() => {}); // Cleanup for WS/Intervals
  const prevPriceRef = useRef<number>(0);
  
  // --- KEYS ---
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;

  // --- AUTO SCROLL LOGS ---
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // --- ELAPSED TIMER ---
  useEffect(() => {
    let interval: any;
    if (isGathering && startTimeRef.current > 0) {
      interval = setInterval(() => {
        setProgress(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGathering]);

  // --- AUTO START ---
  useEffect(() => {
    if (autoStart && isActive && !isGathering) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging V12 Engine Ignition...", "signal");
            startGathering(accessToken);
        } else {
            addLog("AUTO-PILOT: Auth Token Missing. Halting.", "err");
        }
    }
  }, [autoStart, isActive]);

  // --- SEARCH LOGIC (LOCAL REGISTRY + FALLBACK) ---
  useEffect(() => {
    // Immediate Cleanup on query change
    if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = () => {};
    }

    if (!searchQuery) {
        setSearchResult(null);
        setIsLive(false);
        setPriceFlash(null);
        setLiveSource('');
        prevPriceRef.current = 0;
        return;
    }

    const query = searchQuery.trim().toUpperCase();
    
    // 1. Check Local Registry First (Instant)
    if (gatheredRegistry.has(query)) {
        const staticData = gatheredRegistry.get(query);
        if (staticData) {
            setSearchResult(staticData);
            prevPriceRef.current = staticData.price;
            // Initiate Live Feed for this symbol
            startRealTimeFeed(staticData.symbol);
        }
    } else {
        // 2. If not in registry, maybe try basic API lookup or just show not found
        // For V12 Engine, we rely on the registry mostly, but can do a quick check
        setSearchResult(null);
        setIsLive(false);
    }
  }, [searchQuery, gatheredRegistry]); // Re-run if registry updates or query changes

  // --- REAL-TIME FEED ENGINE (The "Heartbeat") ---
  const startRealTimeFeed = (symbol: string) => {
      let isCleanedUp = false;
      
      // Helper to update state safely
      const updatePrice = (price: number, source: string) => {
          if (isCleanedUp) return;
          
          setSearchResult((prev: any) => {
              if (!prev || prev.symbol !== symbol) return prev;
              
              if (price !== prev.price) {
                  const direction = price > prev.price ? 'up' : 'down';
                  setPriceFlash(direction);
                  setTimeout(() => setPriceFlash(null), 300);
                  
                  // Calculate dynamic change
                  let change = prev.change;
                  let changeAmount = prev.changeAmount;
                  if (prev.prevClose) {
                      changeAmount = price - prev.prevClose;
                      change = (changeAmount / prev.prevClose) * 100;
                  }

                  return { ...prev, price, change, changeAmount };
              }
              return prev;
          });
          
          setIsLive(true);
          setLiveSource(source);
          prevPriceRef.current = price;
      };

      // Strategy 1: Finnhub WebSocket (Priority)
      const connectWS = () => {
          if (!finnhubKey) return connectPolling();

          try {
              const ws = new WebSocket(`wss://ws.finnhub.io?token=${finnhubKey}`);
              
              ws.onopen = () => {
                  ws.send(JSON.stringify({ type: 'subscribe', symbol }));
              };

              ws.onmessage = (event) => {
                  try {
                      const msg = JSON.parse(event.data);
                      if (msg.type === 'trade' && msg.data && msg.data.length > 0) {
                          // Get latest trade
                          const trade = msg.data[msg.data.length - 1];
                          updatePrice(trade.p, 'Finnhub WS');
                      }
                  } catch (e) {}
              };

              ws.onerror = () => {
                  ws.close();
                  // Fallback to polling
                  cleanupRef.current = connectPolling(); 
              };

              return () => ws.close();
          } catch (e) {
              return connectPolling();
          }
      };

      // Strategy 2: Polling (Polygon -> Yahoo -> MSN)
      const connectPolling = () => {
          const fetchPoll = async () => {
              if (isCleanedUp) return;
              
              // A. Yahoo (Fastest Proxy)
              try {
                  const res = await fetch(`/api/yahoo?symbols=${symbol}&t=${Date.now()}`);
                  if (res.ok) {
                      const data = await res.json();
                      if (data && data.length > 0) {
                          updatePrice(data[0].price, 'Yahoo Live');
                          return; // Success
                      }
                  }
              } catch(e) {}

              // B. Polygon (If Yahoo fails)
              const polyKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
              if (polyKey) {
                  try {
                      const res = await fetch(`https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${polyKey}`);
                      if (res.ok) {
                          const data = await res.json();
                          if (data.ticker) {
                              const p = data.ticker.lastTrade?.p || data.ticker.min?.c;
                              if (p) {
                                  updatePrice(p, 'Polygon Poll');
                                  return;
                              }
                          }
                      }
                  } catch(e) {}
              }
              
              // C. MSN (Deep Fallback)
              try {
                  const res = await fetch(`/api/msn?ids=${symbol}`);
                  if (res.ok) {
                      const data = await res.json();
                      if (data && data.length > 0) {
                          updatePrice(data[0].price, 'MSN Proxy');
                      }
                  }
              } catch(e) {}
          };

          fetchPoll(); // Initial call
          const interval = setInterval(fetchPoll, 1500); // 1.5s interval
          return () => clearInterval(interval);
      };

      // Start Logic
      const cleanup = connectWS();
      cleanupRef.current = () => {
          isCleanedUp = true;
          if (cleanup) cleanup();
      };
  };

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-50));
  };

  const handleSetTarget = () => {
      if (searchResult && onStockSelected) {
          onStockSelected(searchResult);
          addLog(`Target Locked: ${searchResult.symbol}. Integrity Audit Ready.`, "ok");
      }
  };

  const handleAuth = () => {
      if (!gdriveClientId) {
          addLog("Missing Client ID. Open ⚙ Config.", "err");
          setShowConfig(true);
          return;
      }
      
      try {
          // @ts-ignore
          const client = google.accounts.oauth2.initTokenClient({
              client_id: gdriveClientId.trim(),
              scope: 'https://www.googleapis.com/auth/drive',
              callback: (tokenResponse: any) => {
                  if (tokenResponse.access_token) {
                      sessionStorage.setItem('gdrive_access_token', tokenResponse.access_token);
                      onAuthSuccess(true);
                      addLog("Cloud Vault Linked. Engine Key Verified.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
          setShowConfig(true);
      }
  };

  // --- V12 ENGINE CORE LOGIC ---

  const startGathering = async (token: string) => {
      setIsGathering(true);
      startTimeRef.current = Date.now();
      setProgress({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'V12_Engine', phase: 'Discovery' });
      setGatheredRegistry(new Map()); // Clear registry
      
      try {
          const assets = await mountFinancialEngine(token);
          
          if (assets.length === 0) throw new Error("Engine Stall: Zero assets loaded from Drive.");

          setProgress(prev => ({ ...prev, found: assets.length, phase: 'Mapping' }));
          addLog(`Engine Ignition Successful. ${assets.length} HP Generated.`, "ok");
          
          addLog(`Phase 2: Recording Telemetry to Stage 0...`, "info");
          setProgress(prev => ({ ...prev, phase: 'Commit' }));

          const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const timestamp = getFormattedTimestamp();
          const fileName = `STAGE0_MASTER_UNIVERSE_${timestamp}.json`;
          
          const payload = {
              manifest: { 
                  version: "12.5.0", 
                  provider: "Drive_V12_Engine", 
                  date: new Date().toISOString(), 
                  count: assets.length,
                  note: "Engine Mounted from Financial_Data_Daily (A-Z)"
              },
              universe: assets
          };

          await uploadFile(token, folderId, fileName, payload);
          setProgress(prev => ({ ...prev, phase: 'Finalized' }));
          addLog(`System: Ready for Launch. Saved ${fileName}`, "ok");
          
          if (onComplete) onComplete();
      } catch (e: any) {
          addLog(`Fatal Error: ${e.message}`, "err");
          setProgress(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          setIsGathering(false);
          startTimeRef.current = 0;
      }
  };

  const mountFinancialEngine = async (token: string) => {
      addLog("Initializing V12 Engine Protocol...", "info");
      
      // 1. Locate 'System_Identity_Maps'
      let systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      
      if (!systemMapFolderId) {
          // Fallback scan root
          addLog(`'${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not in Project Root. Scanning Drive Root...`, "warn");
          systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      }

      if (!systemMapFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not found in Drive.`);

      // 2. Locate 'Financial_Data_Daily'
      const financialDailyFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapFolderId);
      if (!financialDailyFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.financialDailyFolder}' not found inside Maps.`);

      addLog("Core Map Located. Firing Cylinders (A-Z)...", "ok");

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const cylinders = alphabet; // Processing A-Z
      setProgress(prev => ({ ...prev, target: cylinders.length }));

      const masterUniverse: any[] = [];
      const tempRegistry = new Map<string, any>();

      // Sequential Loading to prevent API rate limits or memory overflow
      for (let i = 0; i < cylinders.length; i++) {
          const char = cylinders[i];
          const fileName = `${char}_stocks_daily.json`;
          
          try {
              const fileId = await findFileId(token, fileName, financialDailyFolderId);
              
              if (fileId) {
                  const content = await downloadFile(token, fileId);
                  
                  // [CORE] Process Data with Robust Key Mapping
                  const stocks = processCylinderData(content);
                  const count = stocks.length;
                  
                  masterUniverse.push(...stocks);
                  stocks.forEach(s => tempRegistry.set(s.symbol, s));

                  // Update UI Registry incrementally
                  setGatheredRegistry(new Map(tempRegistry));

                  addLog(`Cylinder ${char}: Fired. ${count} HP added.`, "info");
                  setProgress(prev => ({ ...prev, found: masterUniverse.length, synced: i + 1 }));
              } else {
                  addLog(`Cylinder ${char} Misfire: ${fileName} not found.`, "warn");
              }
          } catch (e: any) {
              addLog(`Cylinder ${char} Failure: ${e.message}`, "err");
          }
          
          // Small delay to keep UI responsive
          await new Promise(r => setTimeout(r, 20));
      }
      
      return masterUniverse;
  };

  const processCylinderData = (jsonContent: any): MasterTicker[] => {
      const results: MasterTicker[] = [];
      try {
          // Structure Type 2: Object with Symbol Keys (Standard Map)
          if (typeof jsonContent === 'object' && jsonContent !== null && !Array.isArray(jsonContent)) {
              Object.entries(jsonContent).forEach(([key, val]: [string, any]) => {
                  if (!val) return;
                  // Handle potential nested structures
                  const root = val.basic || val;
                  const symbol = root.symbol || key;
                  
                  if (symbol) {
                      const price = Number(root.price) || 0;
                      const change = Number(root.change || root.changesPercentage || root.pChange || 0);
                      
                      let prevClose = Number(root.previousClose || root.prevClose || 0);
                      if (prevClose === 0 && price > 0 && change !== 0) {
                          prevClose = price / (1 + (change / 100));
                      } else if (prevClose === 0 && price > 0) {
                          prevClose = price; 
                      }
                      
                      const changeAmount = price - prevClose;

                      results.push({
                          symbol: symbol,
                          name: root.name || root.companyName || key,
                          price: price,
                          volume: Number(root.volume) || 0,
                          change: change,
                          changeAmount: changeAmount,
                          marketCap: Number(root.marketCap) || 0,
                          sector: root.sector || 'Unknown',
                          industry: root.industry || 'Unknown',
                          
                          // Robust Financial Key Mapping
                          pe: Number(root.per || root.pe || root.peRatio || 0),
                          pbr: Number(root.pbr || root.priceToBook || root.priceToBookRatio || 0),
                          psr: Number(root.psr || root.priceToSales || root.priceToSalesRatio || 0),
                          roe: Number(root.roe || root.returnOnEquity || 0),
                          eps: Number(root.eps || root.earningsPerShare || 0),
                          beta: Number(root.beta || 0),
                          debtToEquity: Number(root.debtToEquity || root.debtEquityRatio || 0),
                          
                          prevClose: prevClose,
                          updated: new Date().toISOString(),
                          source: 'V12_Cylinder'
                      });
                  }
              });
          }
          // Structure Type 1: Array of Objects
          else if (Array.isArray(jsonContent)) {
              return jsonContent.map(item => {
                  const root = item.basic || item;
                  const price = Number(root.price) || 0;
                  const change = Number(root.change || root.changesPercentage || 0);
                  let prevClose = Number(root.previousClose || 0);
                  if (prevClose === 0 && price > 0) prevClose = price / (1 + (change / 100));

                  return {
                      symbol: root.symbol,
                      name: root.name || root.companyName,
                      price: price,
                      volume: Number(root.volume) || 0,
                      change: change,
                      changeAmount: price - prevClose,
                      marketCap: Number(root.marketCap) || 0,
                      sector: root.sector || 'Unknown',
                      industry: root.industry || 'Unknown',
                      pe: Number(root.per || root.pe || 0),
                      pbr: Number(root.pbr || 0),
                      psr: Number(root.psr || 0),
                      roe: Number(root.roe || 0),
                      eps: Number(root.eps || 0),
                      beta: Number(root.beta || 0),
                      debtToEquity: Number(root.debtToEquity || 0),
                      prevClose: prevClose,
                      updated: new Date().toISOString(),
                      source: 'V12_Cylinder'
                  };
              }).filter(item => item.symbol);
          }
      } catch (e) {
          console.error("Error processing cylinder data chunk", e);
      }
      return results;
  };

  // --- DRIVE UTILS ---
  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Download failed for ${fileId}`);
      return await res.json();
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

  const getFormattedTimestamp = () => {
      const now = new Date();
      // KST Logic (optional, typically use UTC ISO for system files)
      return now.toISOString().replace(/[:.]/g, '-');
  };

  const formatMarketCap = (num: number) => {
    if (!num) return 'N/A';
    if (num >= 1.0e+12) return `$${(num / 1.0e+12).toFixed(2)}T`;
    if (num >= 1.0e+9) return `$${(num / 1.0e+9).toFixed(2)}B`;
    if (num >= 1.0e+6) return `$${(num / 1.0e+6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  // --- DYNAMIC STYLING ---
  const getBorderColor = () => {
    if (priceFlash === 'up') return '#4ade80'; // Bright Green
    if (priceFlash === 'down') return '#f87171'; // Bright Red

    if (searchResult && isLive) {
        return searchResult.change >= 0 
            ? 'rgba(16, 185, 129, 0.5)' // Emerald
            : 'rgba(244, 63, 94, 0.5)'; // Rose
    }
    
    return 'rgba(255,255,255,0.05)'; 
  };

  const getBackgroundColor = () => {
    if (priceFlash === 'up') return 'rgba(74, 222, 128, 0.15)'; 
    if (priceFlash === 'down') return 'rgba(248, 113, 113, 0.15)';

    if (searchResult && isLive) {
        return searchResult.change >= 0 
            ? 'rgba(16, 185, 129, 0.05)' 
            : 'rgba(244, 63, 94, 0.05)';
    }

    return 'transparent'; 
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Config Modal */}
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
                            value={gdriveClientId} 
                            onChange={(e) => setGdriveClientId(e.target.value)} 
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none" 
                            placeholder="Enter GDrive Client ID" 
                        />
                        <p className="text-[9px] text-slate-600 font-medium">Project ID: 741017429020</p>
                    </div>
                    <button onClick={() => { localStorage.setItem('gdrive_client_id', gdriveClientId); setShowConfig(false); addLog("Infrastructure Persisted Successfully.", "ok"); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all">Apply Changes</button>
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v12.5.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                   <span className="text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest bg-indigo-500/20 text-indigo-400 border-indigo-500/20">V12_Drive_Engine</span>
                   <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                   {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            
            <button 
                onClick={accessToken ? () => startGathering(accessToken) : handleAuth} 
                disabled={isGathering}
                className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isGathering ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : accessToken ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'}`}
            >
                {isGathering ? 'Cylinders Firing...' : accessToken ? 'Ignite V12 Engine' : 'Connect Cloud Vault'}
            </button>
          </div>

          <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
             <div className="flex items-center justify-between mb-4">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
                 <div className="flex items-center gap-2">
                     {isLive && <span className="text-[8px] font-black text-emerald-400 animate-pulse uppercase border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 rounded">● {liveSource || 'LIVE FEED'}</span>}
                     <span className="text-[8px] text-slate-500 uppercase">Mode: Real-Time_Audit</span>
                 </div>
             </div>
             <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <input 
                        type="text" 
                        placeholder="Verify Ticker (e.g. AAPL, DIS)" 
                        className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    
                    {/* ENHANCED TICKER BOX: Responsive Logic for Daily Change & Real-time Flash */}
                    <div 
                        className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all duration-300 transform ${priceFlash ? 'scale-105' : 'scale-100'} ${searchResult ? '' : 'bg-slate-900 border-white/5'}`}
                        style={searchResult ? {
                            borderWidth: '2px', 
                            borderColor: getBorderColor(),
                            backgroundColor: getBackgroundColor()
                        } : {}}
                    >
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
                                                {/* Price text stays white unless flashing */}
                                                <p className={`text-2xl font-mono font-black transition-all duration-300 ${priceFlash === 'up' ? 'text-emerald-300 scale-110' : priceFlash === 'down' ? 'text-rose-300 scale-110' : 'text-white'}`}>
                                                    ${searchResult.price?.toFixed(2) || 'N/A'}
                                                </p>
                                                <p className={`text-[10px] font-bold flex items-center justify-end gap-1 ${searchResult.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    <span>{searchResult.change >= 0 ? '▲' : '▼'} {Math.abs(searchResult.changeAmount || 0).toFixed(2)}</span>
                                                    <span className="opacity-50">({Math.abs(searchResult.change || 0).toFixed(2)}%)</span>
                                                </p>
                                            </>
                                        ) : (
                                            <div className="text-right">
                                                <p className="text-2xl font-mono font-black text-white">${searchResult.price?.toFixed(2)}</p>
                                                <p className={`text-[10px] font-bold ${searchResult.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                     {searchResult.change >= 0 ? '▲' : '▼'} {Math.abs(searchResult.change || 0).toFixed(2)}%
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2 bg-black/40 p-3 rounded-xl border border-white/5 mb-4">
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">전일종가</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">${searchResult.prevClose ? searchResult.prevClose.toFixed(2) : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">시가총액</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{formatMarketCap(searchResult.marketCap)}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">PER</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.pe ? searchResult.pe.toFixed(1) + 'x' : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">EPS</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">${searchResult.eps ? searchResult.eps.toFixed(2) : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">PBR</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.pbr ? searchResult.pbr.toFixed(1) + 'x' : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">ROE</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.roe ? searchResult.roe.toFixed(1) + '%' : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">PSR</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.psr ? searchResult.psr.toFixed(1) + 'x' : 'N/A'}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider mb-0.5">Beta</span>
                                        <span className="text-xs font-mono text-slate-300 font-bold">{searchResult.beta ? searchResult.beta.toFixed(2) : 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                     <button 
                                        onClick={handleSetTarget}
                                        className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg"
                                    >
                                        Set Audit Target
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <span className="text-[10px] font-black italic uppercase tracking-widest text-slate-600">{searchQuery ? 'Searching Registry...' : 'Awaiting Input...'}</span>
                        )}
                    </div>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
               {[
                 { label: 'Cylinders (Files)', val: `${progress.synced}/26`, color: 'text-white' },
                 { label: 'Horsepower (Assets)', val: progress.found.toLocaleString(), color: 'text-indigo-400' },
                 { label: 'Cycle Time', val: `${progress.elapsed}s`, color: 'text-slate-400' },
                 { label: 'Engine Status', val: progress.phase, color: 'text-blue-400' }
               ].map((item, idx) => (
                   <div key={idx} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                       <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{item.label}</p>
                       <p className={`text-lg md:text-xl font-mono font-black italic ${item.color} truncate`}>{item.val}</p>
                   </div>
               ))}
          </div>

          <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
              <div 
                className="h-full rounded-xl transition-all duration-700 bg-gradient-to-r from-blue-700 to-indigo-500" 
                style={{ width: `${Math.min(100, (progress.synced / progress.target) * 100)}%` }}
              ></div>
          </div>

        </div>
      </div>

      <div className="xl:col-span-1">
        <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Engine_Telemetry</h3>
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
