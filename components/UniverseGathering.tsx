import React, { useState, useEffect, useRef } from 'react';
import { GOOGLE_DRIVE_TARGET, API_CONFIGS } from '../constants';
import { ApiProvider } from '../types';

interface Props {
  isActive: boolean;
  apiStatuses: any[];
  onAuthSuccess: (status: boolean) => void;
  onStockSelected: (stock: any) => void;
  autoStart?: boolean;
  onComplete?: () => void;
}

const UniverseGathering: React.FC<Props> = ({ isActive, apiStatuses, onAuthSuccess, onStockSelected, autoStart, onComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>(['> Alpha Node v2.4.0: Adaptive Multi-Provider Protocol Online.']);
  const [rateLimitTimer, setRateLimitTimer] = useState(0);
  const [clientId, setClientId] = useState(() => localStorage.getItem('gdrive_client_id') || '741017429020-k7aka3ot8lmba6e3114205nnpp584oiu.apps.googleusercontent.com');
  const [accessToken, setAccessToken] = useState(sessionStorage.getItem('gdrive_access_token'));
  const [stats, setStats] = useState({ found: 0, synced: 0, target: 10000, elapsed: 0, provider: 'Idle', phase: 'Idle' });
  
  // ID Mapping State
  const [isMapping, setIsMapping] = useState(false);

  const [verifyTicker, setVerifyTicker] = useState("");
  
  // Refs
  const logRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Constants keys
  const fmpKey = API_CONFIGS.find(c => c.provider === ApiProvider.FMP)?.key;

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Rate Limit Timer
  useEffect(() => {
    if (rateLimitTimer > 0) {
      const timer = setTimeout(() => setRateLimitTimer(rateLimitTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [rateLimitTimer]);

  // Auto Start
  useEffect(() => {
    if (autoStart && isActive && !isProcessing && rateLimitTimer === 0) {
        if (accessToken) {
            addLog("AUTO-PILOT: Engaging Universe Gathering Sequence...", "signal");
            executeDataFusion();
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
          return;
      }
      
      try {
          // @ts-ignore
          const client = window.google.accounts.oauth2.initTokenClient({
              client_id: clientId.trim(),
              scope: 'https://www.googleapis.com/auth/drive',
              callback: (response: any) => {
                  if (response.access_token) {
                      setAccessToken(response.access_token);
                      sessionStorage.setItem('gdrive_access_token', response.access_token);
                      onAuthSuccess(true);
                      addLog("Cloud Vault Linked. Ready to Execute Fusion.", "ok");
                  }
              },
          });
          client.requestAccessToken({ prompt: 'consent' });
      } catch (error: any) {
          addLog(`Auth Error: ${error.message}`, "err");
      }
  };

  // Helper: Ensure Folder Exists
  const ensureFolder = async (token: string, folderName: string): Promise<string> => {
      const rootId = GOOGLE_DRIVE_TARGET.rootFolderId;
      const query = encodeURIComponent(`name = '${folderName}' and '${rootId}' in parents and trashed = false`);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, {
          headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());

      if (res.files && res.files.length > 0) {
          return res.files[0].id;
      }

      const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json"
          },
          body: JSON.stringify({
              name: folderName,
              parents: [rootId],
              mimeType: "application/vnd.google-apps.folder"
          })
      }).then(r => r.json());
      
      return createRes.id;
  };

  // Helper: Upload File
  const uploadFile = async (token: string, folderId: string, fileName: string, content: any) => {
      const metadata = {
          name: fileName,
          parents: [folderId],
          mimeType: "application/json"
      };
      
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      form.append("file", new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));

      await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form
      });
  };

  // Strategy A: FMP
  const fetchFMP = async () => {
      if (!fmpKey) throw new Error("FMP Key missing");
      addLog("Strategy A: FMP Bulk Screener (Primary)...", "info");
      const url = `https://financialmodelingprep.com/api/v3/stock-screener?marketCapMoreThan=1000000&volumeMoreThan=1000&exchange=NASDAQ,NYSE,AMEX&limit=12000&apikey=${fmpKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`FMP Status ${res.status}`);
      const data = await res.json();
      return data.map((item: any) => ({
          symbol: item.symbol,
          name: item.companyName,
          price: item.price,
          volume: item.volume,
          change: item.changesPercentage || 0,
          marketCap: item.marketCap,
          sector: item.sector,
          type: "Common Stock",
          updated: new Date().toISOString().split('T')[0]
      }));
  };

  const executeDataFusion = async () => {
      if (!accessToken) {
          triggerAuth();
          return;
      }

      setIsProcessing(true);
      const startTime = Date.now();
      setStats(prev => ({ ...prev, found: 0, synced: 0, phase: 'Discovery', elapsed: 0 }));
      
      timerRef.current = window.setInterval(() => {
          setStats(prev => ({ ...prev, elapsed: Math.floor((Date.now() - startTime) / 1000) }));
      }, 1000);

      let universe: any[] = [];
      let providerName = "None";

      try {
          try {
              universe = await fetchFMP();
              providerName = "FMP (Primary)";
          } catch (e: any) {
              addLog(`FMP Failed: ${e.message}`, "warn");
              throw new Error("All Market Data Providers Exhausted.");
          }

          if (universe.length === 0) throw new Error("Zero Assets Found.");

          setStats(prev => ({ ...prev, found: universe.length, provider: providerName, phase: 'Mapping' }));
          addLog(`Phase 3: Committing ${universe.length} assets to Vault...`, "info");
          
          setStats(prev => ({ ...prev, phase: 'Commit' }));
          
          const folderId = await ensureFolder(accessToken, GOOGLE_DRIVE_TARGET.targetSubFolder);
          const fileName = `STAGE0_MASTER_UNIVERSE_v2.4.0.json`;
          
          const payload = {
              manifest: { version: "2.4.0", provider: providerName, date: new Date().toISOString(), count: universe.length },
              universe: universe
          };

          await uploadFile(accessToken, folderId, fileName, payload);

          setStats(prev => ({ ...prev, synced: universe.length, phase: 'Finalized' }));
          addLog(`System: Cloud Vault Sync Complete via ${providerName}.`, "ok");
          
          if (onComplete) onComplete();

      } catch (error: any) {
          addLog(`Fatal Error: ${error.message}`, "err");
          setStats(prev => ({ ...prev, phase: 'Idle' }));
      } finally {
          if (timerRef.current) clearInterval(timerRef.current);
          setIsProcessing(false);
      }
  };

  // ID Mapping Feature
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
          
          if (!res.ok) {
              const errData = await res.json().catch(() => ({ error: res.statusText }));
              throw new Error(errData.error || `Server Status: ${res.status}`);
          }
          
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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 space-y-6">
        <div className="glass-panel p-5 md:p-8 lg:p-10 rounded-[32px] md:rounded-[40px] border-t-2 border-t-blue-500 shadow-2xl bg-slate-900/40 relative overflow-hidden">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 md:mb-10 gap-6">
            <div className="flex items-center space-x-4 md:space-x-6">
              <div className={`w-12 h-12 md:w-14 md:h-14 rounded-3xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 ${isProcessing ? 'animate-pulse' : ''}`}>
                <div className={`w-4 h-4 md:w-5 md:h-5 bg-blue-500 rounded-lg ${isProcessing ? 'animate-spin' : ''}`}></div>
              </div>
              <div>
                <h2 className="text-xl md:text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Omni_Nexus v2.4.0</h2>
                <div className="flex items-center mt-2 space-x-2">
                  <span className={`text-[8px] px-2 py-0.5 rounded-md font-black border uppercase tracking-widest ${rateLimitTimer > 0 ? 'bg-red-500/20 text-red-400 border-red-500/20' : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/20'}`}>
                    {rateLimitTimer > 0 ? `Rate_Limit_Lock: ${rateLimitTimer}s` : 'Multi-Provider_Ready'}
                  </span>
                  {autoStart && <span className="text-[8px] px-2 py-0.5 bg-rose-600 text-white rounded-md font-black uppercase animate-pulse">AUTO PILOT ENGAGED</span>}
                </div>
              </div>
            </div>
            
            <div className="flex gap-4">
                <button 
                  onClick={handleMapIDs}
                  disabled={isProcessing || isMapping}
                  className={`px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${isMapping ? 'bg-slate-800 text-slate-500 border-slate-700' : 'bg-indigo-600 text-white border-indigo-400 hover:bg-indigo-500 shadow-lg'}`}
                >
                  {isMapping ? 'Mapping IDs...' : 'Map System IDs'}
                </button>
                <button 
                  onClick={executeDataFusion} 
                  disabled={isProcessing || rateLimitTimer > 0} 
                  className={`w-full md:w-auto px-6 py-4 md:px-12 md:py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isProcessing || rateLimitTimer > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : accessToken ? 'bg-blue-600 text-white shadow-xl hover:scale-105 shadow-blue-900/20' : 'bg-amber-600 text-white shadow-xl hover:bg-amber-500 hover:scale-105 animate-pulse shadow-amber-900/20'}`}
                >
                  {isProcessing ? 'Acquiring Universe...' : rateLimitTimer > 0 ? `Wait ${rateLimitTimer}s` : accessToken ? 'Execute Data Fusion' : 'Connect Cloud Vault'}
                </button>
            </div>
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
                       value={verifyTicker}
                       onChange={(e) => setVerifyTicker(e.target.value)}
                     />
                 </div>
             </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { label: 'Equities Found', val: stats.found.toLocaleString(), color: 'text-white' },
              { label: 'Active Provider', val: stats.provider, color: 'text-indigo-400' },
              { label: 'Cycle Time', val: `${stats.elapsed}s`, color: 'text-slate-400' },
              { label: 'Pipeline Phase', val: stats.phase, color: 'text-blue-400' }
            ].map((stat, idx) => (
              <div key={idx} className="bg-black/40 p-4 md:p-6 rounded-3xl border border-white/5">
                <p className="text-[7px] font-black text-slate-600 uppercase mb-2 tracking-[0.2em]">{stat.label}</p>
                <p className={`text-lg md:text-xl font-mono font-black italic ${stat.color} truncate`}>{stat.val}</p>
              </div>
            ))}
          </div>

          <div className="h-4 bg-black/60 rounded-2xl overflow-hidden border border-white/5 p-1">
            <div 
              className={`h-full rounded-xl transition-all duration-700 ${rateLimitTimer > 0 ? 'bg-red-600 animate-pulse' : 'bg-gradient-to-r from-blue-700 to-indigo-500'}`} 
              style={{ width: stats.phase === 'Finalized' ? '100%' : rateLimitTimer > 0 ? `${(rateLimitTimer / 60) * 100}%` : `${Math.min(100, (stats.found / stats.target) * 100)}%` }}
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
