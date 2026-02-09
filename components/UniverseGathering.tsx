
import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface Props {
  isActive: boolean;
  apiStatuses: any[];
  onAuthSuccess: (status: boolean) => void;
  onStockSelected?: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

const UniverseGathering: React.FC<Props> = ({ isActive, apiStatuses, onAuthSuccess, onStockSelected, autoStart, onComplete }) => {
  const [isGathering, setIsGathering] = useState(false);
  const [isMapping, setIsMapping] = useState(false); // For the snippet logic
  const [logs, setLogs] = useState<string[]>(['> Engine v2.4.0: Adaptive Multi-Provider Protocol Online.']);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [stats, setStats] = useState({ found: 0, synced: 0, target: 10000, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  const [clientId, setClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');
  const [showConfig, setShowConfig] = useState(false);

  const [verifyTicker, setVerifyTicker] = useState('');
  const [auditTarget, setAuditTarget] = useState<any>(null);

  const accessToken = sessionStorage.getItem('gdrive_access_token');
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Rate limit timer
  useEffect(() => {
    if (rateLimitCountdown > 0) {
      const timer = setTimeout(() => setRateLimitCountdown(rateLimitCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [rateLimitCountdown]);

  // Auto Start
  useEffect(() => {
    if (autoStart && isActive && !isGathering && rateLimitCountdown === 0) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging Universe Gathering Sequence...", "signal");
            executeDataFusion(accessToken);
        } else {
            addLog("AUTO-PILOT: Auth Token Missing. Halting.", "err");
        }
    }
  }, [autoStart, isActive]);

  const addLog = (message: string, type: 'info' | 'ok' | 'err' | 'warn' | 'signal' = 'info') => {
      const prefixes = { info: '>', ok: '[OK]', err: '[ERR]', warn: '[WARN]', signal: '[AUTO]' };
      setLogs(prev => [...prev, `${prefixes[type]} ${message}`].slice(-50));
  };

  const triggerAuth = () => {
      if (!clientId) {
          addLog("Missing Client ID. Open ⚙ Config.", "err");
          setShowConfig(true);
          return;
      }
      
      try {
          // @ts-ignore
          const client = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId.trim(),
              scope: 'https://www.googleapis.com/auth/drive',
              callback: (response: any) => {
                  if (response.access_token) {
                      sessionStorage.setItem('gdrive_access_token', response.access_token);
                      onAuthSuccess(true);
                      addLog("Cloud Vault Linked. Ready to Execute Fusion.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
          addLog(`Auth Error: ${e.message}`, "err");
          setShowConfig(true);
      }
  };

  const ensureFolder = async (token: string, name: string) => {
      const rootId = GOOGLE_DRIVE_TARGET.rootFolderId;
      const q = encodeURIComponent(`name = '${name}' and '${rootId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());
      
      if (res.files && res.files.length > 0) return res.files[0].id;

      const createRes = await fetch(`https://www.googleapis.com/drive/v3/files`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, parents: [rootId], mimeType: 'application/vnd.google-apps.folder' })
      }).then(r => r.json());
      return createRes.id;
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

  // [NEW] ID Mapping Feature
  const handleMapIDs = async () => {
      if (!accessToken) {
          addLog("Authentication Required for ID Mapping.", "warn");
          triggerAuth();
          return;
      }
      if (isMapping) return;

      setIsMapping(true);
      addLog("Initializing ID Map Generator (Precision Analysis Protocol)...", "info");
      setStats(prev => ({ ...prev, phase: 'Mapping' }));

      try {
          // 1. Trigger API
          addLog("Crawling MSN Analysis Sitemap... This provides 99% coverage.", "info");
          const res = await fetch('/api/msn?mode=generate_map');
          if (!res.ok) throw new Error("ID Mapper API Failed");
          
          const data = await res.json();
          if (data.error) throw new Error(data.error);

          addLog(`Parsing Complete. Mapped ${data.count} tickers.`, "ok");
          
          if (data.map && data.count > 0) {
              // 2. Upload to Drive
              addLog("Uploading ID Map to System Folder...", "info");
              const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.systemMapSubFolder);
              const fileName = `MSN_ID_MAP_${new Date().toISOString().split('T')[0]}.json`;
              
              await uploadFile(accessToken, folderId, fileName, data.map);
              addLog(`ID Map Saved: ${fileName}`, "ok");
          } else {
              addLog("No IDs found. Check sitemap structure.", "warn");
          }

      } catch (e: any) {
          addLog(`Mapping Error: ${e.message}`, "err");
      } finally {
          setIsMapping(false);
          setStats(prev => ({ ...prev, phase: 'Idle' }));
      }
  };
  
  const executeDataFusion = async (token: string) => {
    setIsGathering(true);
    const startTime = Date.now();
    setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
    
    // Timer
    timerRef.current = window.setInterval(() => {
        setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
    }, 1000);

    let universe = [];
    let providerName = 'None';

    try {
        // Strategy A: FMP
        const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;
        if (fmpKey) {
            addLog("Strategy A: FMP Bulk Screener (Primary)...", "info");
            const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000&volumeMoreThan=1000&exchange=NASDAQ,NYSE,AMEX&limit=12000&apikey=${fmpKey}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                universe = data.map((item: any) => ({
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
                providerName = 'FMP (Primary)';
                addLog(`FMP: Retrieved ${universe.length} assets.`, "ok");
            }
        }
        
        // Strategy B: Twelve Data (Backup) if FMP failed or empty
        if (universe.length === 0) {
            const tdKey = API_CONFIGS.find(c => c.provider === ApiProvider.TWELVE_DATA)?.key;
            if (tdKey) {
                addLog("Strategy B: Twelve Data Symbol List (Backup)...", "info");
                 const [nasdaq, nyse] = await Promise.all([
                    fetch(`https://api.twelvedata.com/stocks?exchange=NASDAQ&country=US&apikey=${tdKey}`),
                    fetch(`https://api.twelvedata.com/stocks?exchange=NYSE&country=US&apikey=${tdKey}`)
                ]);
                const d1 = await nasdaq.json();
                const d2 = await nyse.json();
                const combined = [...(d1.data || []), ...(d2.data || [])];
                universe = combined.map((item: any) => ({
                    symbol: item.symbol,
                    name: item.name,
                    price: 0, volume: 0, change: 0,
                    type: item.type || 'Common Stock',
                    updated: new Date().toISOString().split('T')[0]
                }));
                 providerName = 'Twelve Data (List Only)';
                 addLog(`Twelve Data: Retrieved ${universe.length} symbols.`, "ok");
            }
        }

        if (universe.length === 0) throw new Error("Zero Assets Found.");

        setStats(prev => ({ ...prev, found: universe.length, provider: providerName, phase: 'Commit' }));
        addLog(`Phase 3: Committing ${universe.length} assets to Vault...`, "info");
        
        const folderId = await ensureFolder(token, GOOGLE_DRIVE_TARGET.targetSubFolder);
        const fileName = `STAGE0_MASTER_UNIVERSE_${new Date().toISOString().split('T')[0]}.json`;
        
        const payload = {
            manifest: { version: '2.4.0', provider: providerName, date: new Date().toISOString(), count: universe.length },
            universe: universe
        };
        
        await uploadFile(token, folderId, fileName, payload);
        
        setStats(prev => ({ ...prev, synced: universe.length, phase: 'Finalized' }));
        addLog(`System: Cloud Vault Sync Complete via ${providerName}.`, "ok");
        
        if (onComplete) onComplete();

    } catch (e: any) {
        addLog(`Fatal Error: ${e.message}`, "err");
        setStats(prev => ({ ...prev, phase: 'Idle' }));
    } finally {
        if (timerRef.current) clearInterval(timerRef.current);
        setIsGathering(false);
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
                           <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-xs font-mono text-blue-400 focus:border-blue-500 outline-none" placeholder="Enter GDrive Client ID" />
                      </div>
                      <button onClick={() => { localStorage.setItem('gdrive_client_id', clientId); setShowConfig(false); addLog("Infrastructure Persisted Successfully.", "ok"); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 active:scale-95 transition-all">Apply Changes</button>
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
                                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.0</h2>
                                <div className="flex items-center mt-2 space-x-2">
                                     <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${rateLimitCountdown > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                                         {rateLimitCountdown > 0 ? `Rate_Limit_Lock: ${rateLimitCountdown}s` : 'Multi-Provider_Ready'}
                                     </span>
                                     <button onClick={() => setShowConfig(true)} className="text-[8px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-black border border-white/5 uppercase hover:bg-slate-700 transition-all">⚙ Config</button>
                                     {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                                </div>
                           </div>
                      </div>
                      <div className="flex gap-4">
                           <button 
                              onClick={() => triggerAuth()} 
                              disabled={isGathering || rateLimitCountdown > 0 || !!accessToken}
                              className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${!!accessToken ? 'bg-green-600/20 text-green-400 border border-green-500/30' : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'}`}
                           >
                               {!!accessToken ? 'Vault Connected' : 'Connect Cloud Vault'}
                           </button>
                           <button 
                               onClick={() => accessToken && executeDataFusion(accessToken)}
                               disabled={isGathering || rateLimitCountdown > 0 || !accessToken}
                               className={`px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isGathering ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20'}`}
                           >
                               {isGathering ? 'Acquiring Universe...' : 'Execute Data Fusion'}
                           </button>
                      </div>
                  </div>

                  {/* ID Mapper Button */}
                  <div className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5 mb-8">
                       <div className="flex items-center justify-between mb-4">
                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Global Integrity Validator</p>
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] text-slate-500 uppercase">Mode: Active_Equity_Mapping</span>
                            </div>
                       </div>
                       
                       <div className="flex flex-col gap-4">
                           <div className="flex flex-col md:flex-row gap-4 items-center">
                               <button 
                                   onClick={handleMapIDs}
                                   disabled={isMapping || !accessToken}
                                   className={`flex-1 w-full py-4 rounded-xl border border-dashed border-white/20 text-xs font-mono uppercase tracking-widest hover:bg-white/5 transition-all ${isMapping ? 'text-blue-400 animate-pulse' : 'text-slate-400'}`}
                               >
                                   {isMapping ? 'Mapping IDs...' : 'Initialize ID Map Generator'}
                               </button>
                           </div>
                       </div>
                  </div>
                  
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                       {[
                           { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
                           { label: 'Active Provider', val: stats.provider, color: 'text-indigo-400' },
                           { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
                           { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
                       ].map((item, idx) => (
                           <div key={idx} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{item.label}</p>
                                <p className={`text-lg md:text-xl font-mono font-black italic ${item.color} truncate`}>{item.val}</p>
                           </div>
                       ))}
                  </div>

                  {/* Progress Bar */}
                  <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
                      <div 
                          className={`h-full rounded-xl transition-all duration-700 ${rateLimitCountdown > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`}
                          style={{ width: stats.phase === 'Finalized' ? '100%' : rateLimitCountdown > 0 ? `${(rateLimitCountdown/60)*100}%` : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
                      ></div>
                  </div>
             </div>
        </div>

        {/* Logs */}
        <div className="xl:col-span-1">
             <div className="glass-panel h-[400px] lg:h-[680px] rounded-[32px] md:rounded-[40px] bg-slate-950 border-l-4 border-l-blue-600 flex flex-col p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-8">
                      <h3 className="font-black text-white text-[10px] uppercase tracking-[0.4em] italic">Synthesis_Terminal</h3>
                  </div>
                  <div ref={logRef} className="flex-1 bg-black/70 p-6 rounded-[32px] font-mono text-[9px] text-blue-300/60 overflow-y-auto no-scrollbar space-y-4 border border-white/5 leading-relaxed">
                      {logs.map((log, i) => (
                          <div key={i} className={`pl-4 border-l-2 ${log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : log.includes('[ERR]') ? 'border-red-500 text-red-400' : log.includes('[WARN]') ? 'border-amber-500 text-amber-400' : log.includes('[AUTO]') ? 'border-rose-500 text-rose-400' : 'border-blue-900'}`}>
                              {log}
                          </div>
                      ))}
                  </div>
             </div>
        </div>
    </div>
  );
};

export default UniverseGathering;
