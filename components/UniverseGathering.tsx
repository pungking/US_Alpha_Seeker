
import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { GatheringStats, ApiProvider } from '../types';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';

interface Props {
  onAuthSuccess?: (status: boolean) => void;
}

interface DriveFile {
  name: string;
  size: string;
  timestamp: string;
}

const UniverseGathering: React.FC<Props> = ({ onAuthSuccess }) => {
  const [isEngineRunning, setIsEngineRunning] = useState(false);
  const [activeNode, setActiveNode] = useState<string>('Standby');
  const [clientId, setClientId] = useState<string>(() => localStorage.getItem('gdrive_client_id') || '');
  const [accessToken, setAccessToken] = useState<string | null>(sessionStorage.getItem('gdrive_access_token'));
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('gdrive_client_id'));
  const [targetFolderId, setTargetFolderId] = useState<string>(GOOGLE_DRIVE_TARGET.folderId);
  
  const polygonKey = API_CONFIGS.find(c => c.provider === ApiProvider.POLYGON)?.key;
  const finnhubKey = API_CONFIGS.find(c => c.provider === ApiProvider.FINNHUB)?.key;
  const alpacaKey = API_CONFIGS.find(c => c.provider === ApiProvider.ALPACA)?.key;

  const [stats, setStats] = useState<GatheringStats>({
    totalFound: 0,
    processed: 0,
    failed: 0,
    startTime: '-',
    elapsedSeconds: 0,
    estimatedTimeRemaining: 'Ready'
  });

  const progress = stats.totalFound > 0 ? (stats.processed / stats.totalFound) * 100 : 0;
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Nexus V5.0 - Hybrid Cloud Pipeline Online.']);
  const [performanceData, setPerformanceData] = useState<any[]>([]);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);
  const stopRequested = useRef(false);
  const tokenClient = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (clientId) localStorage.setItem('gdrive_client_id', clientId);
  }, [clientId]);

  useEffect(() => {
    if (logContainerRef.current && isAutoScrollEnabled.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [consoleLogs]);

  const addLog = (msg: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') => {
    const prefixes = { info: '>', warn: '[BYPASS]', error: '[ERR]', success: '[OK]' };
    setConsoleLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-100));
  };

  const connectGoogleDrive = () => {
    return new Promise<string | null>((resolve) => {
      if (!clientId.trim()) { setShowSettings(true); resolve(null); return; }
      // @ts-ignore
      if (window.google) {
        try {
          // @ts-ignore
          tokenClient.current = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (res: any) => {
              if (res.access_token) {
                setAccessToken(res.access_token);
                sessionStorage.setItem('gdrive_access_token', res.access_token);
                onAuthSuccess?.(true);
                addLog("Cloud_Vault Auth: SUCCESS", 'success');
                resolve(res.access_token);
              } else {
                resolve(null);
              }
            },
          });
          tokenClient.current.requestAccessToken({ prompt: 'consent' });
        } catch (e: any) { 
          addLog(`Auth Error: ${e.message}`, 'error'); 
          resolve(null);
        }
      }
    });
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; setIsEngineRunning(false); setActiveNode('Standby'); return; }
    
    // 강제 구글 드라이브 체크
    let currentToken = accessToken;
    if (!currentToken) {
      addLog("Local Storage Forbidden. Authenticating Drive Vault...", 'warn');
      currentToken = await connectGoogleDrive();
      if (!currentToken) {
        addLog("Authentication Failed. Discovery aborted.", 'error');
        return;
      }
    }

    setIsEngineRunning(true);
    stopRequested.current = false;
    addLog("Engaging Nexus Discovery Matrix...", 'info');
    
    const startTimestamp = Date.now();
    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, elapsedSeconds: 0 }));

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - startTimestamp) / 1000) }));
    }, 1000);

    try {
      const masterMap = new Map<string, any>();
      
      // PHASE 1: POLYGON
      setActiveNode('Polygon_Node');
      try {
        let polygonUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${polygonKey}`;
        const res = await fetch(polygonUrl);
        if (res.status === 429) throw new Error('429');
        const data = await res.json();
        if (data.results) {
          data.results.forEach((t: any) => masterMap.set(t.ticker, { t: t.ticker, n: t.name }));
          setStats(prev => ({ ...prev, totalFound: masterMap.size }));
        }
      } catch (e) {
        addLog("Polygon 429 Detected. Bypassing to Alpaca...", 'warn');
      }

      // PHASE 2: ALPACA FAILOVER
      if (!stopRequested.current && masterMap.size < 2000) {
        setActiveNode('Alpaca_Node');
        try {
          const alpacaData = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
            headers: { 'APCA-API-KEY-ID': alpacaKey || '' }
          }).then(r => r.json());
          if (Array.isArray(alpacaData)) {
            alpacaData.forEach((t: any) => {
              if (t.status === 'active' && !masterMap.has(t.symbol)) {
                masterMap.set(t.symbol, { t: t.symbol, n: t.name });
              }
            });
            setStats(prev => ({ ...prev, totalFound: masterMap.size }));
          }
        } catch (e) {}
      }

      const masterTickerList = Array.from(masterMap.values());
      setActiveNode('Vault_Sync');

      if (currentToken && masterTickerList.length > 0) {
        addLog(`Vault_Sync: Pushing ${masterTickerList.length} entities...`, 'info');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        const chunkSize = 2000;
        for (let i = 0; i < masterTickerList.length; i += chunkSize) {
          if (stopRequested.current) break;
          const chunk = masterTickerList.slice(i, i + chunkSize);
          const fileName = `NEXUS_UNIVERSE_${dateStr}_B${Math.floor(i/chunkSize)+1}.json`;
          
          const success = await uploadToDrive(currentToken, fileName, { data: chunk, count: chunk.length });
          if (success) {
            setStats(prev => ({ ...prev, processed: i + chunk.length }));
            setDriveFiles(df => [{ name: fileName, size: `${(JSON.stringify(chunk).length/1024).toFixed(1)}KB`, timestamp: new Date().toLocaleTimeString() }, ...df].slice(0, 5));
            setPerformanceData(prev => [...prev.slice(-20), { tps: chunk.length }].map((d, idx) => ({ ...d, index: idx })));
          }
          await new Promise(r => setTimeout(r, 200));
        }
      }
    } catch (e: any) {
      addLog(`Critical Failure: ${e.message}`, 'error');
    } finally {
      setIsEngineRunning(false);
      setActiveNode('Standby');
      if (timerRef.current) clearInterval(timerRef.current);
      addLog("Matrix Cycle Complete.", 'success');
    }
  };

  const uploadToDrive = async (token: string, fileName: string, payload: any) => {
    try {
      const metadata = { name: fileName, parents: [targetFolderId], mimeType: 'application/json' };
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      });
      return res.ok;
    } catch (e) { return false; }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-6 md:p-10 rounded-[32px] border-t-2 border-t-blue-500 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white italic tracking-tighter uppercase">Nexus Discovery</h2>
              <div className="flex items-center space-x-2 mt-2">
                 <div className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${activeNode === 'Standby' ? 'bg-slate-800 text-slate-500' : 'bg-blue-600/20 text-blue-400 border border-blue-500/30 animate-pulse'}`}>
                    Active_Node: {activeNode}
                 </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button onClick={() => setShowSettings(true)} className="flex-1 md:flex-none px-4 py-3 bg-white/5 text-slate-500 text-[9px] font-black rounded-xl border border-white/10 uppercase tracking-widest">Config</button>
              <button onClick={startGathering} className={`flex-1 md:flex-none px-10 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 ${isEngineRunning ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>
                {isEngineRunning ? 'Shutdown' : 'Engage Matrix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
             {[
               { label: 'Discovery', value: stats.totalFound.toLocaleString(), color: 'text-white' },
               { label: 'Vault_Sync', value: stats.processed.toLocaleString(), color: 'text-indigo-400' },
               { label: 'Latency', value: activeNode === 'Standby' ? 'Idle' : 'Optimal', color: 'text-emerald-400' },
               { label: 'Pipeline', value: 'Hybrid', color: 'text-amber-500' }
             ].map((item, idx) => (
               <div key={idx} className="p-4 md:p-6 bg-slate-900/50 rounded-2xl border border-white/5 shadow-inner">
                 <p className="text-[8px] font-black text-slate-600 uppercase mb-2 tracking-widest">{item.label}</p>
                 <p className={`text-lg font-mono font-black ${item.color} italic tracking-tighter`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end px-1">
               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Matrix Synchronizing</span>
               <span className="text-xl font-black text-white font-mono italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-2 w-full bg-slate-950 rounded-full border border-white/5 p-0.5 overflow-hidden shadow-inner">
               <div className="h-full bg-gradient-to-r from-blue-700 to-emerald-400 transition-all duration-700 shadow-[0_0_15px_rgba(59,130,246,0.3)] rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="h-32 mt-8 opacity-20 -mx-6">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#3b82f6" strokeWidth={3} fillOpacity={0.1} fill="#3b82f6" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Vault Manifest - Receipt logic */}
        <div className="glass-panel p-6 md:p-8 rounded-[32px] border-t border-white/5">
           <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 italic">Vault Manifest (Pipeline Receipt)</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/5 bg-slate-900/50 flex justify-between items-center text-[10px]">
                   <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-400">
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="font-black text-white font-mono tracking-tighter truncate max-w-[150px]">{file.name}</p>
                         <p className="text-[8px] text-slate-600 font-bold uppercase mt-0.5 tracking-tighter">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-10 text-center border-dashed border border-white/5 rounded-2xl opacity-20">
                  <p className="text-[8px] font-black uppercase tracking-[0.4em]">Awaiting Cloud Commits</p>
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Terminal View */}
      <div className="space-y-6">
        <div className="glass-panel p-6 rounded-[32px] bg-slate-950 border-l-4 border-l-indigo-600 shadow-2xl h-[500px] md:h-[700px] flex flex-col">
          <h3 className="font-black text-white uppercase text-sm italic tracking-widest mb-6 px-2">Matrix Stream</h3>
          <div ref={logContainerRef} className="flex-1 bg-black/40 p-5 rounded-2xl font-mono text-indigo-400/80 overflow-y-auto no-scrollbar space-y-2 shadow-inner border border-white/5 text-[9px]">
            {consoleLogs.map((log, i) => (
              <div key={i} className={`border-l pl-3 py-0.5 ${log.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : log.includes('[BYPASS]') ? 'border-amber-500 text-amber-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-indigo-600/30'}`}>
                {log}
              </div>
            ))}
          </div>
          <button onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')} className="w-full mt-6 py-4 rounded-xl bg-white text-slate-950 text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-xl italic">Open Vault Storage</button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4">
           <div className="max-w-md w-full glass-panel p-10 rounded-[40px] border-white/10 shadow-2xl">
              <h3 className="text-2xl font-black text-white tracking-tighter italic uppercase mb-8">Nexus Vault Config</h3>
              <div className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-1">G-Cloud Node Client ID</label>
                    <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 text-[10px] font-mono text-white outline-none focus:border-blue-500 transition-all shadow-inner" placeholder="Paste Client ID..." />
                 </div>
                 <div className="flex gap-3">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-4 bg-slate-800 text-slate-400 text-[9px] font-black uppercase rounded-xl tracking-widest">Dismiss</button>
                    <button onClick={() => { localStorage.setItem('gdrive_client_id', clientId); setShowSettings(false); }} className="flex-[2] py-4 bg-white text-slate-950 text-[9px] font-black uppercase rounded-xl tracking-widest hover:bg-blue-600 hover:text-white transition-all shadow-2xl">Save Node Config</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
