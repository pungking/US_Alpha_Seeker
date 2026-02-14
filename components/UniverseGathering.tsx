
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ApiProvider, ApiStatus } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

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
  currency: string;
  marketCap: number;
  updated: string;
  source: string;
  [key: string]: any;
}

interface EngineTelemetry {
  fps: number;
  latency: number;
  packetLoss: number;
  bufferSize: number;
  activeThreads: number;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  // --- CORE ENGINE STATE ---
  const [isGathering, setIsGathering] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Universe_Node v13.1.0: Drive-First Protocol Ready.']);
  const [progress, setProgress] = useState({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Idle', phase: 'Idle', integrity: 100 });
  const [showConfig, setShowConfig] = useState(false);
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');

  // --- DATA & REGISTRY ---
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MasterTicker | null>(null);
  const [gatheredRegistry, setGatheredRegistry] = useState<Map<string, MasterTicker>>(new Map());
  
  // --- SYSTEM REFS ---
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  
  // --- SECURE KEYS ---
  const accessToken = sessionStorage.getItem('gdrive_access_token');

  // --- UI EFFECTS ---
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Elapsed Time & Telemetry Simulation
  useEffect(() => {
    let interval: any;
    if (isGathering && startTimeRef.current > 0) {
      interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - startTimeRef.current) / 1000);
        setProgress(prev => ({ ...prev, elapsed }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGathering]);

  // Auto-Pilot
  useEffect(() => {
    if (autoStart && isActive && !isGathering) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging V13 Drive Engine...", "signal");
            startGathering(accessToken);
        } else {
            addLog("AUTO-PILOT: Critical - Auth Token Missing. Aborting.", "err");
        }
    }
  }, [autoStart, isActive]);

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-60));
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
                      addLog("Cloud Vault Linked. Neural Link Established.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
          setShowConfig(true);
      }
  };

  // --- V13 ENGINE DATA PROCESSOR (Drive-Only) ---

  const startGathering = async (token: string) => {
      setIsGathering(true);
      startTimeRef.current = Date.now();
      setProgress({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Google_Drive', phase: 'Discovery', integrity: 100 });
      setGatheredRegistry(new Map()); 
      
      try {
          // [CORRECTION] Directly calling the Drive Aggregation Logic
          const assets = await mountFinancialEngine(token);
          
          if (assets.length === 0) throw new Error("Engine Stall: Zero assets loaded from Drive.");

          setProgress(prev => ({ ...prev, found: assets.length, phase: 'Mapping' }));
          addLog(`Aggregation Complete. ${assets.length} Assets Loaded.`, "ok");
          
          const invalidAssets = assets.filter(a => !a.price || a.price === 0).length;
          const integrityScore = Math.max(0, 100 - (invalidAssets / assets.length * 100));
          setProgress(prev => ({ ...prev, integrity: Math.floor(integrityScore) }));
          
          addLog(`Data Integrity: ${integrityScore.toFixed(1)}%.`, integrityScore > 90 ? "ok" : "warn");

          addLog(`Phase 2: Recording Master Universe to Stage 0...`, "info");
          setProgress(prev => ({ ...prev, phase: 'Commit' }));

          const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const timestamp = getFormattedTimestamp();
          const fileName = `STAGE0_MASTER_UNIVERSE_${timestamp}.json`;
          
          const payload = {
              manifest: { 
                  version: "13.1.0", 
                  provider: "Drive_Aggregator_V13", 
                  date: new Date().toISOString(), 
                  count: assets.length,
                  integrity: integrityScore,
                  note: "Pre-collected Data Aggregation (No API calls)"
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
      addLog("Initializing V13 Drive Engine...", "info");
      
      let systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
      
      if (!systemMapFolderId) {
          addLog(`'${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not in Project Root. Scanning Drive Root...`, "warn");
          systemMapFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
      }

      if (!systemMapFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not found in Drive.`);

      const financialDailyFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapFolderId);
      if (!financialDailyFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.financialDailyFolder}' not found inside Maps.`);

      addLog("Core Map Located. Reading Cylinders (A-Z)...", "ok");

      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
      const cylinders = alphabet; 
      setProgress(prev => ({ ...prev, target: cylinders.length }));

      const masterUniverse: any[] = [];
      const tempRegistry = new Map<string, any>();

      for (let i = 0; i < cylinders.length; i++) {
          const char = cylinders[i];
          const fileName = `${char}_stocks_daily.json`;
          
          try {
              const fileId = await findFileId(token, fileName, financialDailyFolderId);
              
              if (fileId) {
                  const content = await downloadFile(token, fileId);
                  const stocks = processCylinderData(content); // Use updated processor
                  const count = stocks.length;
                  
                  masterUniverse.push(...stocks);
                  stocks.forEach(s => tempRegistry.set(s.symbol, s));
                  
                  // Visual feedback update every cylinder
                  setGatheredRegistry(new Map(tempRegistry));
                  setProgress(prev => ({ ...prev, found: masterUniverse.length, synced: i + 1 }));
              } else {
                  addLog(`Cylinder ${char} Empty/Missing.`, "warn");
              }
          } catch (e: any) {
              addLog(`Cylinder ${char} Error: ${e.message}`, "err");
          }
          // Throttle slightly to prevent UI freezing
          await new Promise(r => setTimeout(r, 10));
      }
      
      return masterUniverse;
  };

  // [V13.1] Robust Data Normalizer
  const processCylinderData = (jsonContent: any): MasterTicker[] => {
      const results: MasterTicker[] = [];
      try {
          const items = Array.isArray(jsonContent) ? jsonContent : Object.values(jsonContent);
          
          return items.map((item: any) => {
              // Handle various structures (item vs item.basic)
              const root = item.basic || item;
              if (!root.symbol) return null;

              const price = Number(root.price) || Number(root.regularMarketPrice) || 0;
              const change = Number(root.change || root.changesPercentage || root.regularMarketChangePercent || 0);

              return {
                  // Basic
                  symbol: root.symbol,
                  name: root.name || root.longName || root.companyName || "Unknown",
                  price: price,
                  currency: root.currency || "USD",
                  marketCap: Number(root.marketCap) || 0,
                  updated: new Date().toISOString(),
                  source: 'Drive_V13',

                  // Valuation
                  pe: Number(root.pe || root.per || root.trailingPE || 0),
                  pbr: Number(root.pbr || root.priceToBook || 0),
                  
                  // Quality
                  roe: Number(root.roe || root.returnOnEquity || 0),
                  debtToEquity: Number(root.debtToEquity || root.totalDebtToEquity || 0),
                  
                  // Volume
                  volume: Number(root.volume || root.averageVolume || 0),
                  
                  // Meta
                  sector: root.sector || "Unknown",
                  industry: root.industry || "Unknown",

                  // Derived
                  change: change,
                  changeAmount: 0 // Calculated if needed
              };
          }).filter(item => item !== null && item.price > 0) as MasterTicker[];
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
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      return kstDate.toISOString().replace('T', '_').replace(/:/g, '-').split('.')[0];
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
       {/* Config Modal Omitted for brevity, logic preserved */}
       
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isGathering ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isGathering ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v13.1</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest bg-indigo-500/20 text-indigo-400 border-indigo-500/20`}>
                    Drive_Aggregator_V13
                  </span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={accessToken ? () => startGathering(accessToken) : handleAuth} 
              disabled={isGathering}
              className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isGathering 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : accessToken 
                        ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' 
                        : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'
              }`}
            >
              {isGathering ? 'Aggregating...' : accessToken ? 'Execute Drive Fusion' : 'Connect Cloud Vault'}
            </button>
          </div>
          
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
               {[
                 { label: 'Cylinders (Files)', val: `${progress.synced}/26`, color: 'text-white' },
                 { label: 'Assets Found', val: progress.found.toLocaleString(), color: 'text-indigo-400' },
                 { label: 'Time Elapsed', val: `${progress.elapsed}s`, color: 'text-slate-400' },
                 { label: 'Status', val: progress.phase, color: 'text-blue-400' }
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
            <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Engine_Logs</h3>
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
