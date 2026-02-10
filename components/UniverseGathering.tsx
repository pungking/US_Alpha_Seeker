
import React, { useState, useEffect, useRef } from 'react';
import { ApiProvider, ApiStatus } from '../types';
import { API_CONFIGS, GOOGLE_DRIVE_TARGET } from '../constants';

interface Props {
  isActive: boolean;
  apiStatuses: any[];
  onAuthSuccess: (isConnected: boolean) => void;
  onStockSelected?: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

const UniverseGathering: React.FC<Props> = ({ isActive, apiStatuses, onAuthSuccess, onStockSelected, autoStart, onComplete }) => {
  const [isGathering, setIsGathering] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Universe_Node v2.7.0: High-Velocity Resolution Mode.']);
  const [progress, setProgress] = useState({ found: 0, synced: 0, target: 8000, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');
  const [showConfig, setShowConfig] = useState(false);
  
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  
  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    let interval: any;
    if (isGathering && startTimeRef.current > 0) {
      interval = setInterval(() => {
        setProgress(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGathering]);

  useEffect(() => {
    if (autoStart && isActive && !isGathering) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging Secret ID Recovery...", "signal");
            startGathering(accessToken);
        } else {
            addLog("AUTO-PILOT: Auth Token Missing. Halting.", "err");
        }
    }
  }, [autoStart, isActive]);

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-50));
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
                      addLog("Cloud Vault Linked. Ready to Execute.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
          setShowConfig(true);
      }
  };

  // Helper to load existing map from Drive
  const loadMapFromDrive = async (token: string) => {
      try {
          // Priority 1: User's Manual Backup File (Ticker_ID_Mapping_Final.json)
          let q = encodeURIComponent("name = 'Ticker_ID_Mapping_Final.json' and trashed = false");
          let listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          let listData = await listRes.json();

          // Priority 2: Previous Manual Backup (MSN_Money_Secret_ID.json)
          if (!listData.files || listData.files.length === 0) {
              q = encodeURIComponent("name = 'MSN_Money_Secret_ID.json' and trashed = false");
              listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              listData = await listRes.json();
          }

          // Priority 3: System Auto-Backup (MSN_TRINITY_MAP_*)
          if (!listData.files || listData.files.length === 0) {
              q = encodeURIComponent("name contains 'MSN_TRINITY_MAP_' and trashed = false");
              listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=1`, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              listData = await listRes.json();
          }
          
          if (listData.files && listData.files.length > 0) {
              const fileId = listData.files[0].id;
              const fileName = listData.files[0].name;
              addLog(`Found ID Map: ${fileName}. Loading...`, "info");
              
              const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                  headers: { 'Authorization': `Bearer ${token}` }
              });
              
              const mapData = await fileRes.json();
              addLog("Parsing ID Map data...", "info");
              
              // Handle both Array (List of IDs) and Object (Symbol->ID map) formats
              if (Array.isArray(mapData)) {
                   addLog(`Loaded ${mapData.length} IDs from list.`, "ok");
                   return mapData as string[];
              } else if (typeof mapData === 'object' && mapData !== null) {
                   const ids = Object.values(mapData) as string[];
                   addLog(`Loaded ${ids.length} IDs from map.`, "ok");
                   return ids;
              }
          } else {
             addLog("No ID Map files found in Drive.", "warn");
          }
      } catch (e: any) {
          console.warn("Failed to load map from drive", e);
          addLog(`Drive Load Error: ${e.message}`, "warn");
      }
      return null;
  };

  // Strategy: Resolve MSN IDs to Real Data (Optimized Parallel Batching)
  const resolveMsnAssets = async (ids: string[]) => {
      addLog(`Resolving ${ids.length} MSN IDs to Assets...`, "info");
      
      const resolvedAssets: any[] = [];
      const BATCH_SIZE = 30; // Max IDs per URL
      const CONCURRENCY = 5; // Number of parallel requests
      
      setProgress(prev => ({ ...prev, target: ids.length }));

      // Split into chunks of chunks
      for (let i = 0; i < ids.length; i += (BATCH_SIZE * CONCURRENCY)) {
          const promises = [];
          
          // Create concurrent batches
          for (let j = 0; j < CONCURRENCY; j++) {
              const startIdx = i + (j * BATCH_SIZE);
              if (startIdx >= ids.length) break;
              
              const batchIds = ids.slice(startIdx, startIdx + BATCH_SIZE);
              const idString = batchIds.join(',');
              
              promises.push(
                  fetch(`/api/msn?mode=resolve_batch_by_ids&ids=${idString}`)
                    .then(res => res.ok ? res.json() : [])
                    .catch(err => {
                        console.warn("Batch failed", err);
                        return [];
                    })
              );
          }

          // Await parallel requests
          const results = await Promise.all(promises);
          
          // Process results
          for (const batchResult of results) {
              if (Array.isArray(batchResult)) {
                   const mapped = batchResult.map((item: any) => ({
                      symbol: item.symbol,
                      name: item.name,
                      price: item.price,
                      volume: item.volume,
                      change: item.change,
                      marketCap: item.marketCap,
                      sector: "Unknown", 
                      type: item.type,
                      updated: new Date().toISOString().split('T')[0],
                      msnId: item.id,
                      pe: item.pe,
                      roe: item.roe,
                      pbr: item.pbr
                   }));
                   resolvedAssets.push(...mapped);
              }
          }
          
          const currentCount = resolvedAssets.length;
          setProgress(prev => ({ ...prev, found: currentCount }));
          
          if (i > 0 && i % 2000 < (BATCH_SIZE * CONCURRENCY)) {
              addLog(`Progress: ${i} / ${ids.length} IDs processed... (${currentCount} found)`, "info");
          }
          
          // Small delay to prevent complete rate limiting
          await new Promise(r => setTimeout(r, 200));
      }
      
      return resolvedAssets;
  };
  
  // Strategy: FMP Fallback
  const fetchFmpScreener = async () => {
      if (!fmpKey) throw new Error("FMP Key missing");
      addLog("Strategy B: FMP Bulk Screener (Fallback)...", "info");
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

  const startGathering = async (token: string) => {
      setIsGathering(true);
      startTimeRef.current = Date.now();
      setProgress({ found: 0, synced: 0, target: 8000, elapsed: 0, provider: 'Idle', phase: 'Discovery' });
      
      let assets: any[] = [];
      let providerName = 'None';

      try {
          // Priority 1: MSN Secret ID Map
          const rawIds = await loadMapFromDrive(token);
          
          if (rawIds && rawIds.length > 0) {
              // Filter out headers or invalid IDs
              const validIds = rawIds.filter(id => id && id !== "MSN_Money_Secret_ID" && !id.includes(" ") && id.length > 2);
              
              // Dedup
              const uniqueIds = Array.from(new Set(validIds));

              addLog(`ID Map Loaded. Unique Valid IDs: ${uniqueIds.length}. Engaging Fast Resolver...`, "ok");
              
              if (uniqueIds.length > 0) {
                  assets = await resolveMsnAssets(uniqueIds);
                  if (assets.length > 0) {
                      providerName = 'MSN_Secret_Map';
                  }
              }
          } else {
             addLog("Map file empty or invalid.", "warn");
          }

          // Priority 2: FMP Fallback (if MSN failed or empty)
          if (assets.length === 0) {
              addLog("MSN Map returned no assets. Attempting FMP fallback...", "warn");
              try {
                  assets = await fetchFmpScreener();
                  providerName = 'FMP (Backup)';
              } catch (e) {
                  addLog("FMP Backup Failed.", "err");
              }
          }

          if (assets.length === 0) throw new Error("Zero Assets Found from all sources.");

          setProgress(prev => ({ ...prev, found: assets.length, provider: providerName, phase: 'Mapping' }));

          addLog(`Phase 3: Committing ${assets.length} assets to Vault...`, "info");
          setProgress(prev => ({ ...prev, phase: 'Commit' }));

          const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const fileName = `STAGE0_MASTER_UNIVERSE_v2.7.0.json`;
          
          const payload = {
              manifest: { 
                  version: "2.7.0", 
                  provider: providerName, 
                  date: new Date().toISOString(), 
                  count: assets.length,
                  note: "High-Velocity MSN Resolution"
              },
              universe: assets
          };

          await uploadFile(token, folderId, fileName, payload);

          setProgress(prev => ({ ...prev, synced: assets.length, phase: 'Finalized' }));
          addLog(`System: Cloud Vault Sync Complete via ${providerName}.`, "ok");
          
          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Fatal Error: ${e.message}`, "err");
          setProgress(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          setIsGathering(false);
          startTimeRef.current = 0;
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
                        <input type="text" value={gdriveClientId} onChange={(e) => setGdriveClientId(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none" placeholder="Enter GDrive Client ID" />
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
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.7.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                   <span className="text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest bg-indigo-500/20 text-indigo-400 border-indigo-500/20">Secret_ID_Protocol</span>
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
                {isGathering ? 'Resolving Universe...' : accessToken ? 'Execute Data Fusion' : 'Connect Cloud Vault'}
            </button>
          </div>

          <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
             <div className="flex items-center justify-between mb-4">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
                 <div className="flex items-center gap-2"><span className="text-[8px] text-slate-500 uppercase">Mode: Active_Equity_Mapping</span></div>
             </div>
             <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row gap-4">
                    <input type="text" placeholder="Verify Ticker (e.g. AAPL, TSLA)" className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase" />
                    <div className="flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all bg-slate-900 border-white/5 text-slate-600">
                        <span className="text-[10px] font-black italic uppercase tracking-widest">Awaiting Master Map...</span>
                    </div>
                </div>
             </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
               {[
                 { label: 'Equities Found', val: progress.found.toLocaleString(), color: 'text-white' },
                 { label: 'Active Provider', val: progress.provider, color: 'text-indigo-400' },
                 { label: 'Cycle Time', val: `${progress.elapsed}s`, color: 'text-slate-400' },
                 { label: 'Pipeline Phase', val: progress.phase, color: 'text-blue-400' }
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
                style={{ width: `${Math.min(100, (progress.found / progress.target) * 100)}%` }}
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
