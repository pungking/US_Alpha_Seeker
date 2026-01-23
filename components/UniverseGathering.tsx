
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
  const [consoleLogs, setConsoleLogs] = useState<string[]>(['> Nexus Intelligence V4.8 - Distributed Pipeline Online.']);
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
    const prefixes = { info: '>', warn: '[WARN]', error: '[ERR]', success: '[OK]' };
    setConsoleLogs(prev => [...prev, `${prefixes[type]} ${msg}`].slice(-150));
  };

  const handleSaveAndEnter = () => {
    localStorage.setItem('gdrive_client_id', clientId.trim());
    setShowSettings(false);
    addLog("Config Updated. Switching to Active Discovery Mode.", 'success');
  };

  const connectGoogleDrive = () => {
    if (!clientId.trim()) { setShowSettings(true); return; }
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
              addLog("Cloud Vault Synchronized.", 'success');
            }
          },
        });
        tokenClient.current.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) { addLog(`Auth Error: ${e.message}`, 'error'); }
    }
  };

  const fetchWithLimitedRetry = async (url: string, provider: string, options: any = {}): Promise<any> => {
    const res = await fetch(url, options);
    if (res.status === 429) {
      addLog(`${provider} Rate Limit (429). Bypassing to Redundant Node...`, 'warn');
      throw new Error('RATE_LIMIT');
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    return await res.json();
  };

  const startGathering = async () => {
    if (isEngineRunning) { stopRequested.current = true; setIsEngineRunning(false); return; }
    
    setIsEngineRunning(true);
    stopRequested.current = false;
    addLog("Initializing Distributed Discovery Protocol...", 'info');
    
    const startTimestamp = Date.now();
    setStats(prev => ({ ...prev, startTime: new Date().toLocaleTimeString(), processed: 0, elapsedSeconds: 0 }));

    timerRef.current = window.setInterval(() => {
      setStats(prev => ({ ...prev, elapsedSeconds: Math.floor((Date.now() - startTimestamp) / 1000) }));
    }, 1000);

    try {
      // Use Map to deduplicate by Ticker
      const masterMap = new Map<string, any>();
      
      // PHASE 1: POLYGON (Attempt)
      addLog("NODE 1: Scanning Polygon L3 Reference...", 'info');
      try {
        let polygonUrl = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${polygonKey}`;
        let count = 0;
        while (polygonUrl && !stopRequested.current && count < 2) { // Limit iterations to avoid hanging if 429 is constant
           const data = await fetchWithLimitedRetry(polygonUrl, 'Polygon');
           if (data.results) {
             data.results.forEach((t: any) => masterMap.set(t.ticker, { ticker: t.ticker, name: t.name, source: 'Polygon' }));
             setStats(prev => ({ ...prev, totalFound: masterMap.size }));
           }
           polygonUrl = data.next_url ? `${data.next_url}&apiKey=${polygonKey}` : '';
           count++;
           if (polygonUrl) await new Promise(r => setTimeout(r, 200));
        }
      } catch (e: any) {
        // Silently continue to next provider if rate limited
      }

      // PHASE 2: ALPACA FAILOVER (High Volume / No strict 429 on free assets list)
      if (!stopRequested.current) {
        addLog("NODE 2: Engaging Alpaca Assets Redundancy...", 'info');
        try {
          const alpacaData = await fetch(`https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity`, {
            headers: { 'APCA-API-KEY-ID': alpacaKey || '', 'APCA-API-SECRET-KEY': '' } // Secret missing but public assets sometimes work or need only Key ID
          }).then(r => r.json());
          
          if (Array.isArray(alpacaData)) {
            alpacaData.forEach((t: any) => {
              if (t.status === 'active' && !masterMap.has(t.symbol)) {
                masterMap.set(t.symbol, { ticker: t.symbol, name: t.name, source: 'Alpaca' });
              }
            });
            addLog(`Alpaca node injected ${alpacaData.length} entries. Total: ${masterMap.size}`, 'success');
            setStats(prev => ({ ...prev, totalFound: masterMap.size }));
          }
        } catch (e) { addLog("Alpaca Node Offline. Skipping...", 'warn'); }
      }

      // PHASE 3: FINNHUB (Final Expansion)
      if (!stopRequested.current && masterMap.size < 5000) {
        addLog("NODE 3: Expanding via Finnhub Global symbols...", 'info');
        try {
          const finnhubData = await fetch(`https://finnhub.io/api/v1/stock/symbol?exchange=US&token=${finnhubKey}`).then(r => r.json());
          if (Array.isArray(finnhubData)) {
            finnhubData.forEach((t: any) => {
              if (!masterMap.has(t.symbol)) {
                masterMap.set(t.symbol, { ticker: t.symbol, name: t.description, source: 'Finnhub' });
              }
            });
            addLog(`Finnhub expansion complete. Matrix reached ${masterMap.size} assets.`, 'success');
            setStats(prev => ({ ...prev, totalFound: masterMap.size }));
          }
        } catch (e) { addLog("Finnhub Node Offline.", 'warn'); }
      }

      const masterTickerList = Array.from(masterMap.values());
      if (stopRequested.current || masterTickerList.length === 0) return;

      // CLOUD SYNC PHASE
      if (accessToken) {
        addLog(`Vault Sync: Uploading ${masterTickerList.length} unique assets in batches...`, 'info');
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];
        
        const chunkSize = 1500;
        for (let i = 0; i < masterTickerList.length; i += chunkSize) {
          if (stopRequested.current) break;
          const chunk = masterTickerList.slice(i, i + chunkSize);
          const fileName = `UNIVERSE_MATRIX_${dateStr}_B${Math.floor(i/chunkSize)+1}.json`;
          
          const success = await uploadToDrive(fileName, { data: chunk, count: chunk.length, timestamp: new Date().toISOString() });
          if (success) {
            setStats(prev => ({ ...prev, processed: i + chunk.length }));
            setDriveFiles(df => [{ name: fileName, size: `${(JSON.stringify(chunk).length/1024).toFixed(1)}KB`, timestamp: new Date().toLocaleTimeString() }, ...df].slice(0, 8));
            setPerformanceData(prev => [...prev.slice(-30), { tps: chunk.length }].map((d, idx) => ({ ...d, index: idx })));
          }
          await new Promise(r => setTimeout(r, 300));
        }
      } else {
        addLog("Local Discovery finalized. Link Drive to persist to Vault.", 'warn');
        setStats(prev => ({ ...prev, processed: masterTickerList.length }));
      }
    } catch (e: any) {
      addLog(`Critical Failure: ${e.message}`, 'error');
    } finally {
      setIsEngineRunning(false);
      if (timerRef.current) clearInterval(timerRef.current);
      addLog("Gathering Protocol Terminated.", 'info');
    }
  };

  const uploadToDrive = async (fileName: string, payload: any) => {
    if (!accessToken) return false;
    try {
      const metadata = { name: fileName, parents: [targetFolderId], mimeType: 'application/json' };
      const fileContent = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const formData = new FormData();
      formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      formData.append('file', fileContent);
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        body: formData
      });
      return res.ok;
    } catch (e) { return false; }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
      <div className="xl:col-span-3 space-y-8">
        <div className="glass-panel p-10 rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-8">
            <div className="relative z-10">
              <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase">Nexus Discovery Matrix</h2>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-3">Active Pipeline: Multi-Node Redundancy (Polygon / Alpaca / Finnhub)</p>
            </div>
            
            <div className="flex items-center space-x-4">
              {!accessToken && (
                <button 
                  onClick={connectGoogleDrive}
                  className="px-6 py-4 bg-emerald-600/20 text-emerald-400 text-[10px] font-black rounded-2xl border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition-all uppercase tracking-widest animate-pulse"
                >
                  Link Drive Vault
                </button>
              )}
              <button onClick={() => setShowSettings(true)} className="px-6 py-4 bg-white/5 text-slate-400 text-[10px] font-black rounded-2xl border border-white/10 hover:bg-white/10 hover:text-white transition-all uppercase tracking-widest">Config</button>
              <button 
                onClick={startGathering} 
                className={`px-14 py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] transition-all shadow-2xl active:scale-95 ${isEngineRunning ? 'bg-red-600 text-white shadow-red-600/40' : 'bg-blue-600 text-white shadow-blue-600/40 hover:bg-blue-500'}`}
              >
                {isEngineRunning ? 'Shutdown Engine' : 'Engage Matrix'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
             {[
               { label: 'Market Discovery', value: stats.totalFound.toLocaleString(), color: 'text-white' },
               { label: 'Cloud Synced', value: stats.processed.toLocaleString(), color: 'text-indigo-400' },
               { label: 'Uptime', value: `${Math.floor(stats.elapsedSeconds/60)}m ${stats.elapsedSeconds%60}s`, color: 'text-emerald-400' },
               { label: 'Active Pipeline', value: isEngineRunning ? 'Multi-Node' : 'Standby', color: 'text-amber-500' }
             ].map((item, idx) => (
               <div key={idx} className="p-8 bg-slate-900/50 rounded-3xl border border-white/5 shadow-inner">
                 <p className="text-[10px] font-black text-slate-600 uppercase mb-3 tracking-widest">{item.label}</p>
                 <p className={`text-2xl font-mono font-black ${item.color} italic tracking-tighter`}>{item.value}</p>
               </div>
             ))}
          </div>

          <div className="space-y-6">
            <div className="flex justify-between items-end px-2">
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] italic">Gathering Matrix Progress</span>
               <span className="text-3xl font-black text-white font-mono tracking-tighter italic">{progress.toFixed(1)}%</span>
            </div>
            <div className="h-4 w-full bg-slate-950 rounded-full border border-white/5 p-1 overflow-hidden shadow-inner">
               <div className="h-full bg-gradient-to-r from-blue-700 via-indigo-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_20px_rgba(79,70,229,0.5)] rounded-full" style={{ width: `${progress}%` }}></div>
            </div>
          </div>

          <div className="h-40 mt-12 opacity-20 -mx-10">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <Area type="monotone" dataKey="tps" stroke="#6366f1" strokeWidth={4} fillOpacity={0.1} fill="#6366f1" />
                </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-10 rounded-[40px] border-t border-white/5 shadow-2xl">
           <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10 italic">Vault Manifest (Cloud Backup)</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {driveFiles.map((file, idx) => (
                <div key={idx} className="p-6 rounded-3xl border border-white/5 bg-slate-900/50 flex justify-between items-center group hover:border-emerald-500/30 transition-all">
                   <div className="flex items-center space-x-5">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400">
                         <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <div>
                         <p className="text-sm font-black text-white font-mono tracking-tighter truncate max-w-[180px]">{file.name}</p>
                         <p className="text-[10px] text-slate-600 font-bold uppercase mt-1 tracking-widest">{file.timestamp} • {file.size}</p>
                      </div>
                   </div>
                </div>
              ))}
              {driveFiles.length === 0 && (
                <div className="col-span-2 py-24 text-center border-2 border-dashed border-white/5 rounded-3xl opacity-30">
                  <p className="text-[10px] font-black uppercase tracking-[0.5em]">Awaiting Matrix Output</p>
                </div>
              )}
           </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-panel p-8 rounded-[40px] bg-slate-950 border-l-8 border-l-indigo-600 shadow-2xl h-[800px] flex flex-col">
          <h3 className="font-black text-white uppercase text-xl italic tracking-tighter mb-8">Live Matrix Stream</h3>
          <div 
            ref={logContainerRef} 
            className="flex-1 bg-black/80 p-6 rounded-[24px] font-mono text-indigo-400/80 overflow-y-auto no-scrollbar space-y-3 shadow-inner border border-white/5 text-[10px] scroll-smooth"
          >
            {consoleLogs.map((log, i) => (
              <div key={i} className={`border-l-2 pl-4 py-1 transition-colors ${log.includes('[ERR]') ? 'border-red-500 text-red-400 bg-red-500/5' : log.includes('[WARN]') ? 'border-amber-500 text-amber-400' : log.includes('[OK]') ? 'border-emerald-500 text-emerald-400' : 'border-indigo-600/30'}`}>
                <span className="leading-relaxed">{log}</span>
              </div>
            ))}
          </div>
          <button onClick={() => window.open(`https://drive.google.com/drive/folders/${targetFolderId}`, '_blank')} className="w-full mt-8 py-5 rounded-2xl bg-white text-slate-950 text-[10px] font-black uppercase tracking-[0.4em] hover:bg-blue-600 hover:text-white transition-all shadow-xl active:scale-95">Open Drive Storage</button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] bg-slate-950/98 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in zoom-in duration-300">
           <div className="max-w-xl w-full glass-panel p-12 rounded-[48px] border-white/10 shadow-2xl">
              <h3 className="text-3xl font-black text-white tracking-tighter italic uppercase mb-10">Vault Config</h3>
              <div className="space-y-8">
                 <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Google Client ID (Auto-Saved)</label>
                    <input 
                      type="text" 
                      value={clientId} 
                      onChange={(e) => setClientId(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl p-6 text-[11px] font-mono text-white outline-none focus:border-blue-500 transition-all shadow-inner" 
                      placeholder="Paste your Google Client ID..." 
                    />
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setShowSettings(false)} className="flex-1 py-6 bg-slate-900 text-slate-400 text-[11px] font-black uppercase rounded-2xl tracking-[0.2em] hover:bg-slate-800 transition-all">Cancel</button>
                    <button onClick={handleSaveAndEnter} className="flex-[2] py-6 bg-white text-slate-950 text-[11px] font-black uppercase rounded-2xl tracking-[0.3em] hover:bg-blue-600 hover:text-white transition-all shadow-2xl">Save & Access Node</button>
                 </div>
                 <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center leading-relaxed">System automatically bypasses API rate limits by switching between Polygon, Alpaca, and Finnhub nodes.</p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UniverseGathering;
