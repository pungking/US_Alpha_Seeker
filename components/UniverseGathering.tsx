
import React, { useState, useEffect, useRef } from 'react';
import { ApiStatus } from '../types';
import { GOOGLE_DRIVE_TARGET } from '../constants';

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
  marketCap: number;
  sector: string;
  industry: string;
  pe: number;
  roe: number;
  debtToEquity: number;
  pbr: number;
  volume: number;
  change: number;
  [key: string]: any;
}

// [HELPER] Smart Ratio Normalizer (Fixes 0.15 vs 15.0 discrepancy)
const normalizePercent = (val: any): number => {
    if (val === null || val === undefined || val === '') return 0;
    let num = Number(val);
    if (isNaN(num)) return 0;
    // If value is small (< 5.0) and likely a decimal ratio, convert to %
    if (Math.abs(num) <= 5.0 && num !== 0) {
        return parseFloat((num * 100).toFixed(2));
    }
    return parseFloat(num.toFixed(2));
};

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess, isActive, apiStatuses, onStockSelected, autoStart, onComplete }) => {
  const [isGathering, setIsGathering] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Engine v14.0: Drive-First Architecture Active.']);
  const [progress, setProgress] = useState({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  const [gdriveClientId, setGdriveClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');
  const [showConfig, setShowConfig] = useState(false);
  
  const [gatheredRegistry, setGatheredRegistry] = useState<Map<string, MasterTicker>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MasterTicker | null>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (autoStart && isActive && !isGathering) {
        if (accessToken) {
            addLog("AUTO-PILOT: Accessing Cloud Vault Data (A-Z)...", "signal");
            startDriveLoading(accessToken);
        } else {
            addLog("AUTO-PILOT: Waiting for Vault Connection...", "warn");
        }
    }
  }, [autoStart, isActive]);

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
      if (!searchQuery) { setSearchResult(null); return; }
      const res = gatheredRegistry.get(searchQuery.toUpperCase());
      setSearchResult(res || null);
  }, [searchQuery, gatheredRegistry]);

  const addLog = (msg: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-60));
  };

  const handleAuth = () => {
      if (!gdriveClientId) {
          addLog("Missing Client ID.", "err");
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
                      addLog("Vault Connected. Ready to Load Original Data.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
      }
  };

  const findFolder = async (token: string, name: string, parentId = 'root') => {
      const q = encodeURIComponent(`name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const findFileId = async (token: string, name: string, parentId: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${parentId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      return data.files && data.files.length > 0 ? data.files[0].id : null;
  };

  const downloadFile = async (token: string, fileId: string) => {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${token}` } });
      const text = await res.text();
      // Handle Python NaN/Infinity which are invalid JSON
      const safeText = text.replace(/:\s*NaN/g, ': null').replace(/:\s*Infinity/g, ': null').replace(/:\s*-Infinity/g, ': null');
      return JSON.parse(safeText);
  };

  const startDriveLoading = async (token: string) => {
      setIsGathering(true);
      startTimeRef.current = Date.now();
      setProgress({ found: 0, synced: 0, target: 26, elapsed: 0, provider: 'Google_Drive_Raw', phase: 'Locating Map' });
      
      try {
          // 1. Locate System Identity Maps Folder
          let systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, GOOGLE_DRIVE_TARGET.rootFolderId);
          if (!systemMapId) {
             addLog(`'${GOOGLE_DRIVE_TARGET.systemMapSubFolder}' not found in Project Root. Searching Drive...`, "warn");
             systemMapId = await findFolder(token, GOOGLE_DRIVE_TARGET.systemMapSubFolder, 'root');
          }
          if (!systemMapId) throw new Error("Critical: System Map Folder not found in Drive.");

          // 2. Locate Financial Daily Folder
          const dailyFolderId = await findFolder(token, GOOGLE_DRIVE_TARGET.financialDailyFolder, systemMapId);
          if (!dailyFolderId) throw new Error(`Critical: '${GOOGLE_DRIVE_TARGET.financialDailyFolder}' not found.`);

          addLog("Original Data Map Located. Extracting Cylinders (A-Z)...", "ok");
          setProgress(prev => ({ ...prev, phase: 'Extraction' }));

          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
          const masterList: MasterTicker[] = [];
          const tempRegistry = new Map<string, MasterTicker>();

          for (let i = 0; i < alphabet.length; i++) {
              const char = alphabet[i];
              const fileName = `${char}_stocks_daily.json`;
              
              try {
                  const fileId = await findFileId(token, fileName, dailyFolderId);
                  if (fileId) {
                      const content = await downloadFile(token, fileId);
                      const items = Array.isArray(content) ? content : Object.values(content);
                      
                      const parsedItems = items.map((raw: any) => {
                           const r = raw.basic || raw;
                           if (!r.symbol) return null;
                           
                           return {
                               symbol: r.symbol,
                               name: r.name || r.companyName || "Unknown",
                               price: Number(r.price || 0),
                               marketCap: Number(r.marketCap || 0),
                               sector: r.sector || "Unknown",
                               industry: r.industry || "Unknown",
                               pe: Number(r.per || r.pe || 0),
                               pbr: Number(r.pbr || 0),
                               roe: normalizePercent(r.roe || r.returnOnEquity),
                               debtToEquity: Number(r.debtToEquity || r.debtEquityRatio || 0), 
                               eps: Number(r.eps || 0),
                               volume: Number(r.volume || 0),
                               change: Number(r.change || r.changesPercentage || 0),
                               source: 'Drive_Origin_V14'
                           } as MasterTicker;
                      }).filter(item => item !== null) as MasterTicker[];

                      masterList.push(...parsedItems);
                      parsedItems.forEach(item => tempRegistry.set(item.symbol, item));
                      
                      addLog(`Cylinder ${char}: Extracted ${parsedItems.length} records.`, "info");
                      setProgress(prev => ({ ...prev, synced: i + 1, found: masterList.length }));
                  } else {
                      addLog(`Cylinder ${char}: File missing.`, "warn");
                  }
              } catch (e: any) {
                  addLog(`Cylinder ${char} Error: ${e.message}`, "err");
              }
              // Throttle slightly
              await new Promise(r => setTimeout(r, 10));
          }

          setGatheredRegistry(tempRegistry);
          addLog(`Extraction Complete. ${masterList.length} Original Assets Loaded.`, "ok");

          // 4. Save to Stage 0
          setProgress(prev => ({ ...prev, phase: 'Commit' }));
          
          const targetFolderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const fileName = `STAGE0_MASTER_UNIVERSE_v14.0.json`;
          
          const payload = {
              manifest: {
                  version: "14.0.0",
                  source: "Google_Drive_Origin_Files",
                  count: masterList.length,
                  timestamp: new Date().toISOString(),
                  note: "Direct Load from Financial_Data_Daily"
              },
              universe: masterList
          };
          
          await uploadFile(token, targetFolderId, fileName, payload);
          addLog("Stage 0 Master Universe Persisted.", "ok");
          setProgress(prev => ({ ...prev, phase: 'Finalized' }));

          if (onComplete) onComplete();

      } catch (e: any) {
          addLog(`Engine Failure: ${e.message}`, "err");
          setProgress(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          setIsGathering(false);
          startTimeRef.current = 0;
      }
  };

  const ensureFolder = async (token: string, name: string) => {
      const q = encodeURIComponent(`name = '${name}' and '${GOOGLE_DRIVE_TARGET.rootFolderId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.files?.length > 0) return data.files[0].id;
      const create = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [GOOGLE_DRIVE_TARGET.rootFolderId], mimeType: 'application/vnd.google-apps.folder' })
      });
      const json = await create.json();
      return json.id;
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
            </div>
            <button 
              onClick={() => { localStorage.setItem('gdrive_client_id', gdriveClientId); setShowConfig(false); addLog("Infrastructure Persisted.", "ok"); }}
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
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isGathering ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isGathering ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v14.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className="text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest bg-indigo-500/20 text-indigo-400 border-indigo-500/20">
                     Drive-First Mode
                  </span>
                  <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT</span>}
                </div>
              </div>
            </div>
            
            <button 
              onClick={accessToken ? () => startDriveLoading(accessToken) : handleAuth} 
              disabled={isGathering}
              className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  isGathering 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : accessToken 
                        ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' 
                        : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'
              }`}
            >
              {isGathering ? 'Extracting Vault Data...' : accessToken ? 'Load Original Data' : 'Connect Cloud Vault'}
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
                    placeholder="Verify Ticker in Drive (e.g. AAPL)"
                    className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-6 py-4 text-white font-mono text-sm focus:border-blue-500 outline-none uppercase"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <div className={`flex-1 flex items-center px-6 py-4 md:py-0 rounded-xl border transition-all ${searchResult ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-slate-900 border-white/5 text-slate-600'}`}>
                    {searchResult ? (
                      <div className="flex justify-between items-center w-full font-mono text-[10px] font-bold">
                        <span className="truncate">{searchResult.name}</span>
                        <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 px-2 py-1 rounded text-emerald-300">${searchResult.price?.toFixed(2)}</span>
                            {onStockSelected && (
                                <button 
                                    onClick={() => onStockSelected(searchResult)}
                                    className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all bg-rose-600 text-white border-rose-500 hover:bg-rose-500 shadow-lg"
                                >
                                    Set Audit Target
                                </button>
                            )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-[10px] font-black italic uppercase tracking-widest">Searching Local Registry...</span>
                    )}
                  </div>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Cylinders', val: `${progress.synced}/26`, color: 'text-white' },
              { label: 'Assets Found', val: progress.found.toLocaleString(), color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${progress.elapsed}s`, color: 'text-slate-400' },
              { label: 'Status', val: progress.phase, color: 'text-blue-400' }
            ].map((s, i) => (
              <div key={i} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{s.label}</p>
                <p className={`text-lg md:text-xl font-mono font-black italic ${s.color} truncate`}>{s.val}</p>
              </div>
            ))}
          </div>
          
           <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
              className={`h-full rounded-xl transition-all duration-700 bg-gradient-to-r from-blue-700 to-indigo-500`}
              style={{ width: `${Math.min(100, (progress.synced / progress.target) * 100)}%` }}
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
